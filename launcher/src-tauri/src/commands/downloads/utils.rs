use std::path::PathBuf;

use crate::commands::games::{detect, read_installed_games_cache, GameStatus, InstalledGame};

use super::provider::{classify, is_external_tracker_game_id as provider_is_external_tracker};

pub(crate) fn is_external_tracker_game_id(game_id: &str) -> bool {
    provider_is_external_tracker(game_id)
}

pub(crate) fn is_steam_tracker_game_id(game_id: &str) -> bool {
    steam_app_id_from_download_id(game_id).is_some()
}

pub(crate) fn steam_app_id_from_download_id(game_id: &str) -> Option<&str> {
    let app_id = game_id
        .strip_prefix("steam-owned-")
        .or_else(|| game_id.strip_prefix("steam-"))?;

    if app_id.is_empty() || !app_id.chars().all(|ch| ch.is_ascii_digit()) {
        return None;
    }

    Some(app_id)
}

pub(crate) fn is_download_game_installed(game_id: &str) -> bool {
    let lookup_keys = download_lookup_keys(game_id);

    if read_installed_games_cache()
        .unwrap_or_default()
        .iter()
        .any(|game| installed_game_matches_download_keys(game, &lookup_keys))
    {
        return true;
    }

    let scanned_games = if game_id.starts_with("steam-") {
        Some(detect::scan_steam_games())
    } else if game_id.starts_with("epic-") {
        Some(detect::scan_epic_games())
    } else if game_id.starts_with("ea-") {
        Some(detect::scan_ea_games())
    } else if game_id.starts_with("ubisoft-") {
        Some(detect::scan_ubisoft_games())
    } else if game_id.starts_with("battlenet-") {
        Some(detect::scan_battlenet_games())
    } else if game_id.starts_with("xbox-") {
        Some(detect::scan_xbox_games())
    } else {
        None
    };

    scanned_games.is_some_and(|games| {
        games
            .iter()
            .any(|game| installed_game_matches_download_keys(game, &lookup_keys))
    })
}

pub(crate) fn installed_game_matches_download_keys(
    game: &InstalledGame,
    lookup_keys: &[String],
) -> bool {
    if !matches!(&game.status, GameStatus::Installed) {
        return false;
    }

    lookup_keys.contains(&game.id)
        || game
            .external_id
            .as_deref()
            .is_some_and(|external_id| lookup_keys.iter().any(|key| key == external_id))
}

pub(crate) fn download_lookup_keys(game_id: &str) -> Vec<String> {
    let mut keys = vec![game_id.to_string(), game_id.replace("-owned-", "-")];

    if let Some((launcher, external_id)) = game_id.split_once("-owned-") {
        keys.push(external_id.to_string());
        keys.push(format!("{launcher}-{external_id}"));
    }

    for prefix in ["steam-", "epic-", "ea-", "ubisoft-", "battlenet-", "xbox-"] {
        if let Some(external_id) = game_id.strip_prefix(prefix) {
            keys.push(external_id.to_string());
        }
    }

    keys.sort();
    keys.dedup();
    keys
}

pub(crate) fn default_install_dir(game_id: &str) -> Option<PathBuf> {
    let settings = crate::commands::downloads::settings::get_download_settings().ok();
    if let Some(root) = settings
        .as_ref()
        .and_then(|settings| settings.install_root.as_ref())
    {
        let root_path = PathBuf::from(root);
        if root_path.is_absolute() {
            return Some(root_path.join(game_id));
        }
    }
    dirs::data_local_dir()
        .or_else(dirs::data_dir)
        .map(|dir| dir.join("open-game-launcher").join("games").join(game_id))
}

pub(crate) fn download_file_name(url: &reqwest::Url, game_id: &str) -> String {
    let from_url = url
        .path_segments()
        .and_then(|mut segments| segments.next_back())
        .map(str::trim)
        .filter(|segment| !segment.is_empty())
        .unwrap_or("package.bin");
    let sanitized = sanitize_download_file_name(from_url);
    if sanitized.is_empty() {
        format!("{}.bin", sanitize_download_file_name(game_id))
    } else {
        sanitized
    }
}

pub(crate) fn sanitize_download_file_name(value: &str) -> String {
    value
        .chars()
        .map(|ch| match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            ch if ch.is_control() => '_',
            ch => ch,
        })
        .collect::<String>()
        .trim_matches('.')
        .trim()
        .to_string()
}

pub(crate) fn verify_sha256(
    path: &PathBuf,
    expected: &str,
    cancel_rx: &tokio::sync::watch::Receiver<bool>,
) -> Result<(), String> {
    use sha2::{Digest, Sha256};
    use std::io::Read;

    let expected = expected.trim().to_ascii_lowercase();
    if expected.len() != 64 || !expected.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Err("Configured SHA-256 checksum is invalid.".to_string());
    }

    let mut file = std::fs::File::open(path)
        .map_err(|error| format!("Could not open downloaded file for verification: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        if *cancel_rx.borrow() {
            return Err("Download cancelled.".to_string());
        }
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("Could not read downloaded file for verification: {error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    let actual = hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    if actual != expected {
        return Err(format!(
            "SHA-256 verification failed: expected {expected}, got {actual}."
        ));
    }

    Ok(())
}

pub(crate) fn get_platform_from_game_id(game_id: &str) -> String {
    classify(game_id).platform_label().to_string()
}

pub(crate) fn provider_key_from_game_id(game_id: &str) -> String {
    classify(game_id).provider_key().to_string()
}

pub(crate) fn progress_source_from_game_id(game_id: &str) -> String {
    classify(game_id).progress_source().to_string()
}

pub(crate) fn normalize_game_id(game_id: String) -> Result<String, String> {
    let normalized = game_id.trim().to_string();
    if normalized.is_empty() {
        return Err("game_id must not be empty.".to_string());
    }
    if normalized.len() > 160 {
        return Err("game_id must be 160 characters or fewer.".to_string());
    }
    if normalized == "." || normalized == ".." || normalized.contains("..") {
        return Err("game_id must not contain path traversal segments.".to_string());
    }
    if normalized.starts_with('.') || normalized.ends_with('.') {
        return Err("game_id must not start or end with a dot.".to_string());
    }
    if !normalized
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.')
    {
        return Err("game_id may only contain letters, numbers, '.', '-' or '_'.".to_string());
    }
    Ok(normalized)
}

pub(crate) fn get_dir_size<P: AsRef<std::path::Path>>(path: P) -> u64 {
    let mut size = 0;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_dir() {
                    size += get_dir_size(entry.path());
                } else {
                    size += meta.len();
                }
            }
        }
    }
    size
}

pub(crate) fn calculate_active_progress(downloaded: u64, total: u64) -> u32 {
    if total == 0 {
        return 0;
    }

    let progress = ((downloaded.min(total) as f64 / total as f64) * 100.0).round() as u32;
    progress.min(99)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn steam_app_id_is_extracted_from_download_ids() {
        assert_eq!(
            steam_app_id_from_download_id("steam-owned-12345"),
            Some("12345")
        );
        assert_eq!(steam_app_id_from_download_id("steam-12345"), Some("12345"));
        assert_eq!(steam_app_id_from_download_id("steam-owned-beta"), None);
        assert_eq!(steam_app_id_from_download_id("epic-owned-12345"), None);
    }

    #[test]
    fn normalize_game_id_rejects_path_like_values() {
        for value in [
            "",
            "../escape",
            "a/b",
            "a\\b",
            "/absolute",
            "C:\\absolute",
            ".hidden",
            "trailing.",
            "store demo",
            "store\ndemo",
        ] {
            assert!(
                normalize_game_id(value.to_string()).is_err(),
                "expected {value:?} to be rejected"
            );
        }
    }

    #[test]
    fn normalize_game_id_accepts_safe_launcher_slugs() {
        for value in [
            "steam-owned-12345",
            "epic-owned-action_demo",
            "store-demo.v1",
            "GOG_12345",
        ] {
            assert_eq!(
                normalize_game_id(format!(" {value} ")).expect("safe game id"),
                value
            );
        }
    }

    #[test]
    fn xbox_ids_stay_on_local_xbox_app_pc_game_pass_path() {
        assert_eq!(
            get_platform_from_game_id("xbox-microsoft.forzahorizon5_8wekyb3d8bbwe"),
            "Xbox App / PC Game Pass"
        );
        assert_eq!(
            provider_key_from_game_id("xbox-microsoft.forzahorizon5_8wekyb3d8bbwe"),
            "xbox"
        );
        assert_eq!(
            progress_source_from_game_id("xbox-microsoft.forzahorizon5_8wekyb3d8bbwe"),
            "external_tracker"
        );
    }
}
