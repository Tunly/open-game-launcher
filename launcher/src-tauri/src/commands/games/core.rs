use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{DateTime, SecondsFormat, Utc};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    env, fs,
    io::{self, Read},
    path::{Component, Path, PathBuf},
    process::{Child, Command},
    sync::mpsc,
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager};

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

use super::detect::{
    fetch_steam_achievements, find_local_banner_asset, find_local_icon_asset,
    find_local_logo_asset, find_steam_dir, read_battlenet_registry_installs,
    read_ea_registry_installs, read_gog_registry_installs, read_steam_library_folders,
    read_ubisoft_registry_installs, scan_installed_games, steam_app_id_for_game,
    sync_game_metadata,
};
use super::playtime::{
    emit_game_activity_update, record_game_launch_started, record_game_play_session_when_finished,
    update_cached_game_activity,
};
use super::types::*;

pub const OG_MANAGED_LATEST_VERSION: &str = "1.1.0";
pub const OG_MANAGED_MANIFEST_FILE: &str = "og-manifest.json";
pub const OG_MANAGED_MANIFEST_SIGNATURE_PREFIX: &str = "OGLM1";
const OG_MANIFEST_SIGNING_KEY_ENV: &str = "OGL_INSTALL_MANIFEST_SIGNING_KEY";
const OG_MANIFEST_VERIFYING_KEY_ENV: &str = "OGL_INSTALL_MANIFEST_VERIFYING_KEY";
const OG_MANIFEST_KEY_ID_ENV: &str = "OGL_INSTALL_MANIFEST_KEY_ID";

#[cfg(test)]
pub(crate) fn manifest_env_test_lock() -> &'static std::sync::Mutex<()> {
    static LOCK: std::sync::OnceLock<std::sync::Mutex<()>> = std::sync::OnceLock::new();
    LOCK.get_or_init(|| std::sync::Mutex::new(()))
}
const ACHIEVEMENT_CLIENT_CACHE_MAX_DEPTH: usize = 4;
const ACHIEVEMENT_CLIENT_CACHE_MAX_DISCOVERED_FILES: usize = 64;
const ACHIEVEMENT_CLIENT_CACHE_MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
const OG_MANAGED_MANIFEST_FORMAT_VERSION: u32 = 1;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OgManagedManifest {
    #[serde(default = "default_og_manifest_format_version")]
    pub format_version: u32,
    #[serde(default)]
    pub game_id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub managed_by: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub download_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub download_sha256: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub package_file: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub files: Vec<OgManagedManifestFile>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub executable_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub manifest_key_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub manifest_signature: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

impl Default for OgManagedManifest {
    fn default() -> Self {
        Self {
            format_version: OG_MANAGED_MANIFEST_FORMAT_VERSION,
            game_id: String::new(),
            title: String::new(),
            version: String::new(),
            managed_by: String::new(),
            download_url: None,
            download_sha256: None,
            package_file: None,
            files: Vec::new(),
            executable_path: None,
            manifest_key_id: None,
            manifest_signature: None,
            updated_at: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OgManagedManifestFile {
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OgManifestTrustStatus {
    Missing,
    Unsigned,
    Signed,
    Invalid,
}

fn default_og_manifest_format_version() -> u32 {
    OG_MANAGED_MANIFEST_FORMAT_VERSION
}

#[tauri::command]
pub async fn list_installed_games() -> Result<Vec<InstalledGame>, String> {
    Ok(list_installed_games_from_cache(read_installed_games_cache))
}

fn list_installed_games_from_cache<F>(read_cache: F) -> Vec<InstalledGame>
where
    F: FnOnce() -> Option<Vec<InstalledGame>>,
{
    read_cache().unwrap_or_default()
}

#[tauri::command]
pub async fn refresh_installed_games() -> Result<Vec<InstalledGame>, String> {
    let mut games = BTreeMap::<String, InstalledGame>::new();
    let cached_games = read_installed_games_cache().unwrap_or_default();
    let cached_activity = cached_games
        .iter()
        .map(|game| (game.id.clone(), game.clone()))
        .collect::<HashMap<_, _>>();

    for mut game in cached_games.into_iter().filter(is_manual_game) {
        if game.genres.is_empty() {
            game = sync_game_metadata(game).await;
        }
        games.insert(game.id.clone(), game);
    }

    let scanned = tokio::task::spawn_blocking(scan_installed_games)
        .await
        .map_err(|error| format!("Failed to scan installed games: {error}"))?;
    for mut game in scanned {
        if let Some(cached_game) = cached_activity.get(&game.id) {
            merge_cached_game_activity(&mut game, cached_game);
        }

        if game.genres.is_empty() {
            game = sync_game_metadata(game).await;
        }

        games.insert(game.id.clone(), game);
    }

    let games = games.into_values().collect::<Vec<_>>();
    write_installed_games_cache(&games)?;

    Ok(games)
}

#[tauri::command]
pub fn open_achievement_cache_folder(provider: Option<String>) -> Result<String, String> {
    let base_dir = open_game_launcher_data_dir()
        .ok_or_else(|| "Could not resolve OG-Launcher data directory.".to_string())?
        .join("achievement-cache");

    let folder = provider
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty() && value.chars().all(|c| c.is_ascii_alphanumeric()))
        .map(|value| base_dir.join(value))
        .unwrap_or(base_dir);

    fs::create_dir_all(&folder)
        .map_err(|error| format!("Could not create achievement cache folder: {error}"))?;

    let folder_text = path_to_string(folder);
    open_uri(&folder_text)
        .map_err(|error| format!("Could not open achievement cache folder: {error}"))?;

    Ok(folder_text)
}

#[tauri::command]
pub async fn add_manual_game(input: AddManualGameRequest) -> Result<InstalledGame, String> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err("Title must not be empty.".to_string());
    }

    let install_path = input.install_path.trim();
    if install_path.is_empty() {
        return Err("Install path must not be empty.".to_string());
    }

    let path = PathBuf::from(install_path);
    if !path.exists() {
        return Err(format!("Path was not found: {install_path}"));
    }

    let asset_root = if path.is_dir() {
        path.as_path()
    } else {
        path.parent().unwrap_or(path.as_path())
    };
    let mut game = installed_game(
        &format!("manual-{title}-{install_path}"),
        title.to_string(),
        "Manual".to_string(),
        Some(path.to_string_lossy().to_string()),
        find_local_banner_asset(asset_root),
    );
    game.icon_url = find_local_icon_asset(asset_root);
    game.logo_url = find_local_logo_asset(asset_root);

    game = sync_game_metadata(game).await;

    let mut games = BTreeMap::<String, InstalledGame>::new();
    for cached_game in read_installed_games_cache().unwrap_or_default() {
        games.insert(cached_game.id.clone(), cached_game);
    }
    games.insert(game.id.clone(), game.clone());

    let games = games.into_values().collect::<Vec<_>>();
    write_installed_games_cache(&games)?;

    Ok(game)
}

#[tauri::command]
pub fn update_game_metadata(input: UpdateGameMetadataRequest) -> Result<InstalledGame, String> {
    let game_id = normalize_game_id(input.game_id)?;
    let mut games = read_installed_games_cache().unwrap_or_default();

    let game = games
        .iter_mut()
        .find(|game| game.id == game_id)
        .ok_or_else(|| format!("Game '{game_id}' was not found in the local library cache."))?;

    if let Some(cover_url) = sanitize_optional_text(input.cover_url) {
        game.cover_url = Some(cover_url);
    }
    if let Some(logo_url) = sanitize_optional_text(input.logo_url) {
        game.logo_url = Some(logo_url.clone());
        if !game.logo_urls.contains(&logo_url) {
            game.logo_urls.insert(0, logo_url);
        }
    }
    if let Some(icon_url) = sanitize_optional_text(input.icon_url) {
        game.icon_url = Some(icon_url.clone());
        if !game.icon_urls.contains(&icon_url) {
            game.icon_urls.insert(0, icon_url);
        }
    }
    if let Some(rating) = input.rating {
        game.rating = Some(rating.clamp(0.0, 5.0));
    }
    if let Some(achievements) = input.achievements {
        game.achievements = achievements
            .into_iter()
            .filter(|achievement| !achievement.name.trim().is_empty())
            .collect();
    }
    if let Some(save_files) = input.save_files {
        game.save_files = save_files
            .into_iter()
            .filter(|save_file| !save_file.path.trim().is_empty())
            .collect();
    }
    if let Some(friends_playing) = input.friends_playing {
        game.friends_playing = friends_playing
            .into_iter()
            .map(|friend| friend.trim().to_string())
            .filter(|friend| !friend.is_empty())
            .collect();
    }

    let updated_game = game.clone();
    write_installed_games_cache(&games)?;

    Ok(updated_game)
}

fn upsert_achievement_provider_status(game: &mut InstalledGame, status: AchievementProviderStatus) {
    game.achievement_provider_statuses
        .retain(|existing| existing.source != status.source);
    game.achievement_provider_statuses.push(status);
}

#[tauri::command]
pub fn update_achievement_provider_status(
    input: UpdateAchievementProviderStatusRequest,
) -> Result<InstalledGame, String> {
    let game_id = normalize_game_id(input.game_id)?;
    update_installed_game_cache(&game_id, move |game| {
        upsert_achievement_provider_status(game, input.status);
        Ok(())
    })
}

#[tauri::command]
pub fn import_library_snapshot(games: Vec<InstalledGame>) -> Result<Vec<InstalledGame>, String> {
    let mut imported_games = Vec::new();
    let mut seen_ids = HashSet::new();

    for mut game in games {
        game.id = game.id.trim().to_string();
        game.title = game.title.trim().to_string();

        if game.id.is_empty() || game.title.is_empty() || !seen_ids.insert(game.id.clone()) {
            continue;
        }

        if game.slug.trim().is_empty() {
            game.slug = slugify(&game.title);
        }
        if game.launcher.trim().is_empty() {
            game.launcher = "unknown".to_string();
        }
        if game.description.trim().is_empty() {
            game.description = format!("Imported Library entry for {}.", game.title);
        }
        if game.version.trim().is_empty() {
            game.version = "unknown".to_string();
        }

        imported_games.push(game);
    }

    write_installed_games_cache(&imported_games)?;
    Ok(imported_games)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveGameRequest {
    pub game_id: String,
    pub new_path: String,
}

#[tauri::command]
pub async fn move_game(input: MoveGameRequest) -> Result<(), String> {
    let mut games = read_installed_games_cache().unwrap_or_default();

    let game_index = games
        .iter()
        .position(|g| g.id == input.game_id)
        .ok_or_else(|| "Game was not found in the cache.".to_string())?;

    let old_path = games[game_index]
        .install_path
        .as_ref()
        .ok_or_else(|| "Game has no install path.".to_string())?;

    let old_path_buf = PathBuf::from(old_path);
    let new_path_buf = PathBuf::from(&input.new_path);

    if !old_path_buf.exists() {
        return Err("Old install path does not exist.".to_string());
    }

    if !new_path_buf.is_absolute() || !new_path_buf.is_dir() {
        return Err("Target path must be an existing absolute directory.".to_string());
    }

    let folder_name = old_path_buf
        .file_name()
        .ok_or_else(|| "Invalid path.".to_string())?;
    let final_new_path = new_path_buf.join(folder_name);

    if final_new_path.exists() {
        return Err("Target folder already exists.".to_string());
    }

    if !paths_share_volume(&old_path_buf, &final_new_path) {
        return Err(
            "Moving games across drives is not supported safely yet. No files were changed."
                .to_string(),
        );
    }

    fs::rename(&old_path_buf, &final_new_path)
        .map_err(|e| format!("Failed to move game; no cache entry was changed: {e}"))?;

    games[game_index].install_path = Some(final_new_path.to_string_lossy().to_string());
    write_installed_games_cache(&games)?;

    Ok(())
}

#[cfg(windows)]
fn paths_share_volume(source: &Path, target: &Path) -> bool {
    fn volume(path: &Path) -> Option<String> {
        path.components().find_map(|component| match component {
            Component::Prefix(prefix) => Some(prefix.as_os_str().to_string_lossy().to_lowercase()),
            _ => None,
        })
    }

    match (volume(source), volume(target)) {
        (Some(source), Some(target)) => source == target,
        _ => true,
    }
}

#[cfg(not(windows))]
fn paths_share_volume(_source: &Path, _target: &Path) -> bool {
    true
}

#[tauri::command]
pub async fn launch_game(app: AppHandle, game_id: String) -> Result<LaunchGameResponse, String> {
    let game_id = normalize_game_id(game_id)?;
    println!("[open-game-launcher] launch_game requested for {game_id}");

    if game_id.starts_with("gog-owned-") {
        let gog_id = game_id.strip_prefix("gog-owned-").unwrap_or(&game_id);

        // Check if the game is already installed locally
        let installed_games = list_installed_games().await.unwrap_or_default();
        let local_match = installed_games
            .iter()
            .find(|g| g.launcher == "gog" && g.external_id.as_deref() == Some(gog_id));

        if let Some(installed_game) = local_match {
            // Game is installed — launch it locally
            if let Some(ref path) = installed_game.install_path {
                let install_dir = std::path::PathBuf::from(path);
                if let Some(exe) = find_gog_executable(&install_dir, gog_id) {
                    let child = std::process::Command::new(&exe)
                        .current_dir(&install_dir)
                        .spawn()
                        .map_err(|e| format!("Failed to launch GOG game: {e}"))?;
                    if let Some(update) = record_game_launch_started(&installed_game.id) {
                        emit_game_activity_update(&app, &update);
                    }
                    record_game_play_session_when_finished(app, installed_game.id.clone(), child);
                    return Ok(LaunchGameResponse {
                        game_id: game_id.clone(),
                        success: true,
                        message: format!("{} is starting.", installed_game.title),
                    });
                }
            }
            // Fall through to download if launch fails
        }

        // The native path only stages the official installer. Await queue creation so
        // authentication/bootstrap failures are returned instead of reported as success.
        crate::commands::gog::gog_start_download(app.clone(), gog_id.to_string(), None).await?;
        let _ = app.emit(
            "gog_download_started",
            serde_json::json!({ "gogId": gog_id }),
        );

        return Ok(LaunchGameResponse {
            game_id: game_id.clone(),
            success: true,
            message: "GOG installer download queued. Installation is not automatic.".to_string(),
        });
    }

    if game_id.starts_with("epic-owned-") {
        let epic_id = game_id.strip_prefix("epic-owned-").unwrap_or(&game_id);
        let legendary_path = crate::commands::epic::ensure_legendary_binary()
            .await
            .map_err(|error| format!("Could not prepare Legendary: {error}"))?;
        std::process::Command::new(legendary_path)
            .arg("launch")
            .arg(epic_id)
            .spawn()
            .map_err(|error| format!("Could not start Legendary for '{epic_id}': {error}"))?;

        return Ok(LaunchGameResponse {
            game_id: game_id.clone(),
            success: true,
            message: "Launch command started via Legendary.".to_string(),
        });
    }

    if game_id.starts_with("steam-owned-") {
        let steam_id = game_id.strip_prefix("steam-owned-").unwrap_or(&game_id);
        let uri = format!("steam://install/{steam_id}");
        open_uri(&uri).map_err(|e| format!("Could not start Steam: {e}"))?;
        return Ok(LaunchGameResponse {
            game_id: game_id.clone(),
            success: true,
            message: "Installation started in Steam.".to_string(),
        });
    }

    let game = list_installed_games()
        .await?
        .into_iter()
        .find(|game| game.id == game_id)
        .ok_or_else(|| format!("Game '{game_id}' was not found."))?;

    let child = launch_installed_game(&game)?;
    if let Some(update) = record_game_launch_started(&game.id) {
        emit_game_activity_update(&app, &update);
    }
    if let Some(child) = child {
        record_game_play_session_when_finished(app, game.id.clone(), child);
    }

    Ok(LaunchGameResponse {
        game_id,
        success: true,
        message: format!("{} is starting.", game.title),
    })
}

#[tauri::command]
pub async fn sync_game_achievements(
    game_id: String,
    steam_id: Option<String>,
    fallback_game: Option<InstalledGame>,
) -> Result<SyncGameAchievementsResponse, String> {
    let game_id = normalize_game_id(game_id)?;
    println!("[open-game-launcher] sync_game_achievements requested for {game_id}");

    let (game, should_persist_to_native_cache) = resolve_achievement_sync_game(
        &game_id,
        read_installed_games_cache_result(),
        fallback_game,
    )?;
    let appid = steam_app_id_for_game(&game).ok_or_else(|| {
        format!(
            "{} does not expose a Steam app ID, so achievements cannot be synced yet.",
            game.title
        )
    })?;

    let achievements = fetch_steam_achievements(appid, steam_id).await?;
    if achievements.is_empty() {
        return Err(format!(
            "Steam returned no achievements for {}. The game may not expose public achievement data.",
            game.title
        ));
    }

    let unlocked_achievements = achievements
        .iter()
        .filter(|achievement| achievement.unlocked_at.is_some())
        .count();
    let synced_achievements = achievements.len();
    // Merge with existing local data: keep any previously known unlock timestamps that the
    // new fetch did not return (e.g., transient API failure, dropped IDs).
    let synced_at = unix_timestamp_to_iso(current_unix_timestamp());
    let game = if should_persist_to_native_cache {
        update_installed_game_cache(&game_id, move |game| {
            game.achievements = preserve_known_unlocks(achievements, &game.achievements);
            game.achievements_synced_at = Some(synced_at);
            Ok(())
        })?
    } else {
        let mut synced_game = game;
        synced_game.achievements = preserve_known_unlocks(achievements, &synced_game.achievements);
        synced_game.achievements_synced_at = Some(synced_at);
        synced_game
    };

    Ok(SyncGameAchievementsResponse {
        game_id,
        success: true,
        game: game.clone(),
        synced_achievements,
        unlocked_achievements,
        message: format!(
            "{} achievements synced: {unlocked_achievements}/{synced_achievements} unlocked.",
            game.title
        ),
    })
}

fn resolve_achievement_sync_game(
    game_id: &str,
    cached_games: Result<Vec<InstalledGame>, String>,
    fallback_game: Option<InstalledGame>,
) -> Result<(InstalledGame, bool), String> {
    let fallback_game = fallback_game.filter(|game| game.id == game_id);
    if let (Some(game), Some(provider)) = (
        fallback_game.as_ref(),
        achievement_provider_from_game_id(game_id),
    ) {
        validate_achievement_sync_game_provider(game, provider)?;
    }
    match cached_games {
        Ok(games) => {
            if let Some(game) = games.into_iter().find(|game| game.id == game_id) {
                return Ok((game, true));
            }
        }
        Err(_) if game_id.starts_with("steam-owned-") && fallback_game.is_some() => {}
        Err(error) => return Err(error),
    }

    fallback_game
        .map(|game| (game, false))
        .ok_or_else(|| format!("Game '{game_id}' was not found in the local library cache."))
}

fn achievement_provider_from_game_id(game_id: &str) -> Option<&'static str> {
    for (prefix, provider) in [
        ("steam-owned-", "steam"),
        ("steam-", "steam"),
        ("gog-owned-", "gog"),
        ("gog-", "gog"),
        ("epic-owned-", "epic"),
        ("epic-", "epic"),
        ("ea-owned-", "ea"),
        ("ea-", "ea"),
        ("ubisoft-owned-", "ubisoft"),
        ("ubisoft-", "ubisoft"),
        ("battlenet-owned-", "battlenet"),
        ("battlenet-", "battlenet"),
    ] {
        if game_id.starts_with(prefix) {
            return Some(provider);
        }
    }
    None
}

fn validate_achievement_sync_game_provider(
    game: &InstalledGame,
    expected_provider: &str,
) -> Result<(), String> {
    let actual_provider = launcher_key_from_source(&game.launcher);
    if actual_provider != expected_provider {
        return Err(format!(
            "Game '{}' launcher '{}' does not match provider '{expected_provider}'.",
            game.id, game.launcher
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn sync_local_game_achievements(
    game_id: String,
    provider: String,
    fallback_game: Option<InstalledGame>,
) -> Result<SyncGameAchievementsResponse, String> {
    let game_id = normalize_game_id(game_id)?;
    let provider = normalize_local_achievement_provider(&provider)?;
    println!(
        "[open-game-launcher] sync_local_game_achievements requested for {game_id} via {provider}"
    );

    let (game, should_persist_to_native_cache) = resolve_achievement_sync_game(
        &game_id,
        read_installed_games_cache_result(),
        fallback_game,
    )?;
    validate_achievement_sync_game_provider(&game, &provider)?;
    let achievements = sync_best_effort_achievements(&provider, &game).await?;
    if achievements.is_empty() {
        return Err(format!(
            "Local {provider} achievement cache did not contain readable achievements for {}.",
            game.title
        ));
    }

    let unlocked_achievements = achievements
        .iter()
        .filter(|achievement| achievement.unlocked_at.is_some())
        .count();
    let synced_achievements = achievements.len();
    let synced_at = unix_timestamp_to_iso(current_unix_timestamp());
    let game = if should_persist_to_native_cache {
        update_installed_game_cache(&game_id, move |game| {
            game.achievements = preserve_known_unlocks(achievements, &game.achievements);
            game.achievements_synced_at = Some(synced_at);
            Ok(())
        })?
    } else {
        let mut synced_game = game;
        synced_game.achievements = preserve_known_unlocks(achievements, &synced_game.achievements);
        synced_game.achievements_synced_at = Some(synced_at);
        synced_game
    };

    Ok(SyncGameAchievementsResponse {
        game_id,
        success: true,
        game: game.clone(),
        synced_achievements,
        unlocked_achievements,
        message: format!(
            "{} local {provider} achievements imported: {unlocked_achievements}/{synced_achievements} unlocked.",
            game.title
        ),
    })
}

async fn sync_best_effort_achievements(
    provider: &str,
    game: &InstalledGame,
) -> Result<Vec<UnifiedAchievement>, String> {
    if provider == "gog" {
        if let Some(gog_id) = game
            .external_id
            .as_deref()
            .filter(|value| !value.is_empty())
        {
            match crate::commands::gog::fetch_gog_achievements(gog_id).await {
                Ok(achievements) if !achievements.is_empty() => {
                    return Ok(merge_local_achievement_cache_overlay(
                        provider,
                        game,
                        achievements,
                    ));
                }
                Ok(_) => {
                    eprintln!(
                        "[open-game-launcher] GOG achievements API returned no achievements for {}. Trying local cache.",
                        game.title
                    );
                }
                Err(error) => {
                    eprintln!(
                        "[open-game-launcher] GOG achievements API failed for {}: {error}. Trying local cache.",
                        game.title
                    );
                }
            }
        }
    }
    if provider == "epic" {
        if let Some(app_name) = game
            .external_id
            .as_deref()
            .filter(|value| !value.is_empty())
        {
            match crate::commands::epic::fetch_epic_legendary_achievements(app_name).await {
                Ok(achievements) if !achievements.is_empty() => {
                    return Ok(merge_local_achievement_cache_overlay(
                        provider,
                        game,
                        achievements,
                    ));
                }
                Ok(_) => {
                    eprintln!(
                        "[open-game-launcher] Legendary info returned no achievements for {}. Trying local cache.",
                        game.title
                    );
                }
                Err(error) => {
                    eprintln!(
                        "[open-game-launcher] Legendary achievement metadata failed for {}: {error}. Trying local cache.",
                        game.title
                    );
                }
            }
        }
    }

    match read_local_achievement_cache(provider, game) {
        Ok(achievements) => Ok(achievements),
        Err(local_error) if provider == "epic" => fetch_epic_public_achievements(game)
            .await
            .map(|achievements| merge_local_achievement_cache_overlay(provider, game, achievements))
            .map_err(|epic_error| {
                format!("{local_error} Epic public fallback failed: {epic_error}")
            }),
        Err(error) => Err(error),
    }
}

fn merge_local_achievement_cache_overlay(
    provider: &str,
    game: &InstalledGame,
    achievements: Vec<UnifiedAchievement>,
) -> Vec<UnifiedAchievement> {
    if !matches!(provider, "epic" | "gog") {
        return achievements;
    }

    match read_local_achievement_cache(provider, game) {
        Ok(local_achievements) if !local_achievements.is_empty() => {
            preserve_known_unlocks(achievements, &local_achievements)
        }
        Ok(_) => achievements,
        Err(error) => {
            eprintln!(
                "[open-game-launcher] No local {provider} unlock overlay applied for {}: {error}",
                game.title
            );
            achievements
        }
    }
}

fn read_local_achievement_cache(
    provider: &str,
    game: &InstalledGame,
) -> Result<Vec<UnifiedAchievement>, String> {
    let candidates = local_achievement_cache_candidates(provider, game);
    let cache_path = candidates
        .iter()
        .find(|path| path.is_file())
        .ok_or_else(|| {
            format!(
                "No local {provider} achievement cache found for {}. Checked: {}",
                game.title,
                local_achievement_candidate_summary(&candidates)
            )
        })?;

    let contents = fs::read_to_string(cache_path)
        .map_err(|error| format!("Could not read local achievement cache: {error}"))?;
    let value: serde_json::Value = serde_json::from_str(&contents)
        .map_err(|error| format!("Could not parse local achievement cache JSON: {error}"))?;
    parse_local_achievement_cache(&value, provider)
}

fn normalize_local_achievement_provider(provider: &str) -> Result<String, String> {
    let normalized = provider.trim().to_lowercase();
    match normalized.as_str() {
        "gog" | "epic" | "ea" | "ubisoft" | "battlenet" => Ok(normalized),
        _ => Err(format!(
            "Local achievement import is not configured for provider '{provider}'."
        )),
    }
}

fn local_achievement_cache_candidates(provider: &str, game: &InstalledGame) -> Vec<PathBuf> {
    let mut keys = vec![game.id.clone(), slugify(&game.title)];
    if let Some(external_id) = game.external_id.as_ref().filter(|value| !value.is_empty()) {
        keys.push(external_id.clone());
        keys.push(slugify(external_id));
    }

    let mut candidates = Vec::new();

    if let Some(root) =
        open_game_launcher_data_dir().map(|data_dir| data_dir.join("achievement-cache"))
    {
        for scoped_root in [root.join(provider), root.join("local")] {
            for key in &keys {
                let safe_key = slugify(key);
                for candidate in [key.clone(), safe_key] {
                    push_unique_path(
                        &mut candidates,
                        scoped_root.join(format!("{candidate}.json")),
                    );
                }
            }
        }
    }

    for root in local_achievement_client_cache_roots(provider) {
        for key in &keys {
            let safe_key = slugify(key);
            for candidate in [key.clone(), safe_key] {
                push_unique_path(&mut candidates, root.join(format!("{candidate}.json")));
                push_unique_path(
                    &mut candidates,
                    root.join(&candidate).join("achievements.json"),
                );
                push_unique_path(
                    &mut candidates,
                    root.join(&candidate)
                        .join(format!("{provider}-achievements.json")),
                );
                push_unique_path(
                    &mut candidates,
                    root.join("achievements").join(format!("{candidate}.json")),
                );
            }
        }
        discover_local_achievement_cache_files(&root, &keys, &mut candidates);
    }

    if let Some(install_path) = game.install_path.as_ref().filter(|value| !value.is_empty()) {
        let install_root = PathBuf::from(install_path);
        for filename in [
            "og-achievements.json".to_string(),
            "achievements.json".to_string(),
            format!("{provider}-achievements.json"),
        ] {
            push_unique_path(&mut candidates, install_root.join(&filename));
            push_unique_path(
                &mut candidates,
                install_root.join(".og-launcher").join(&filename),
            );
        }
    }

    candidates
}

fn local_achievement_client_cache_roots(provider: &str) -> Vec<PathBuf> {
    let mut roots = Vec::new();

    if let Some(data_dir) = open_game_launcher_data_dir() {
        roots.push(data_dir.join("client-cache").join(provider));
    }

    push_provider_achievement_client_cache_roots(
        &mut roots,
        provider,
        env_path("LOCALAPPDATA"),
        env_path("ProgramData"),
        env_path("APPDATA"),
    );

    roots
}

fn push_provider_achievement_client_cache_roots(
    roots: &mut Vec<PathBuf>,
    provider: &str,
    local_app_data: Option<PathBuf>,
    program_data: Option<PathBuf>,
    app_data: Option<PathBuf>,
) {
    match provider {
        "ea" => {
            if let Some(local_app_data) = local_app_data.as_ref() {
                roots.push(local_app_data.join("Electronic Arts").join("EA Desktop"));
                roots.push(
                    local_app_data
                        .join("Electronic Arts")
                        .join("EA Desktop")
                        .join("cache"),
                );
                roots.push(local_app_data.join("Origin"));
            }
            if let Some(program_data) = program_data.as_ref() {
                roots.push(program_data.join("EA Desktop"));
                roots.push(program_data.join("Electronic Arts").join("EA Desktop"));
                roots.push(program_data.join("Origin"));
            }
        }
        "ubisoft" => {
            if let Some(local_app_data) = local_app_data.as_ref() {
                roots.push(
                    local_app_data
                        .join("Ubisoft")
                        .join("Ubisoft Game Launcher")
                        .join("cache"),
                );
                roots.push(local_app_data.join("Ubisoft Game Launcher").join("cache"));
            }
            if let Some(program_data) = program_data.as_ref() {
                roots.push(
                    program_data
                        .join("Ubisoft")
                        .join("Ubisoft Game Launcher")
                        .join("cache"),
                );
            }
        }
        "battlenet" => {
            if let Some(program_data) = program_data.as_ref() {
                roots.push(program_data.join("Battle.net"));
                roots.push(
                    program_data
                        .join("Blizzard Entertainment")
                        .join("Battle.net"),
                );
            }
            if let Some(local_app_data) = local_app_data.as_ref() {
                roots.push(local_app_data.join("Battle.net"));
                roots.push(
                    local_app_data
                        .join("Blizzard Entertainment")
                        .join("Battle.net"),
                );
            }
            if let Some(app_data) = app_data.as_ref() {
                roots.push(app_data.join("Battle.net"));
            }
        }
        "gog" => {
            if let Some(program_data) = program_data.as_ref() {
                roots.push(program_data.join("GOG.com").join("Galaxy").join("webcache"));
            }
            if let Some(local_app_data) = local_app_data.as_ref() {
                roots.push(
                    local_app_data
                        .join("GOG.com")
                        .join("Galaxy")
                        .join("webcache"),
                );
            }
        }
        "epic" => {
            if let Some(program_data) = program_data.as_ref() {
                roots.push(
                    program_data
                        .join("Epic")
                        .join("EpicGamesLauncher")
                        .join("Data"),
                );
            }
            if let Some(local_app_data) = local_app_data.as_ref() {
                roots.push(local_app_data.join("EpicGamesLauncher").join("Saved"));
            }
        }
        _ => {}
    }
}

fn discover_local_achievement_cache_files(
    root: &Path,
    keys: &[String],
    candidates: &mut Vec<PathBuf>,
) {
    if !root.is_dir() {
        return;
    }

    let key_tokens = keys
        .iter()
        .flat_map(|key| [key.to_lowercase(), slugify(key)])
        .filter(|key| !key.is_empty())
        .collect::<HashSet<_>>();
    if key_tokens.is_empty() {
        return;
    }

    let mut discovered = 0usize;
    discover_local_achievement_cache_files_inner(
        root,
        &key_tokens,
        candidates,
        0,
        &mut discovered,
        false,
    );
}

fn discover_local_achievement_cache_files_inner(
    dir: &Path,
    key_tokens: &HashSet<String>,
    candidates: &mut Vec<PathBuf>,
    depth: usize,
    discovered: &mut usize,
    descended_from_matching_key_dir: bool,
) {
    if depth > ACHIEVEMENT_CLIENT_CACHE_MAX_DEPTH
        || *discovered >= ACHIEVEMENT_CLIENT_CACHE_MAX_DISCOVERED_FILES
    {
        return;
    }

    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        if *discovered >= ACHIEVEMENT_CLIENT_CACHE_MAX_DISCOVERED_FILES {
            return;
        }

        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        if file_type.is_dir() {
            let dir_name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
                .to_lowercase();
            let dir_matches_key = local_achievement_cache_name_matches(&dir_name, key_tokens);
            if depth == 0 || descended_from_matching_key_dir || dir_matches_key {
                discover_local_achievement_cache_files_inner(
                    &path,
                    key_tokens,
                    candidates,
                    depth + 1,
                    discovered,
                    descended_from_matching_key_dir || dir_matches_key,
                );
            }
            continue;
        }

        if !file_type.is_file() || !is_local_achievement_cache_file_candidate(&path, key_tokens) {
            continue;
        }

        if let Ok(metadata) = entry.metadata() {
            if metadata.len() > ACHIEVEMENT_CLIENT_CACHE_MAX_FILE_BYTES {
                continue;
            }
        }

        push_unique_path(candidates, path);
        *discovered += 1;
    }
}

fn is_local_achievement_cache_file_candidate(path: &Path, key_tokens: &HashSet<String>) -> bool {
    if !path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("json"))
    {
        return false;
    }

    let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
        return false;
    };

    local_achievement_cache_name_matches(&file_name.to_lowercase(), key_tokens)
}

fn local_achievement_cache_name_matches(name: &str, key_tokens: &HashSet<String>) -> bool {
    let achievement_hint = name.contains("achievement")
        || name.contains("achievements")
        || name.contains("trophy")
        || name.contains("trophies")
        || name.contains("stat")
        || name.contains("stats")
        || name.contains("progress");

    achievement_hint || key_tokens.iter().any(|key| name.contains(key))
}

fn push_unique_path(paths: &mut Vec<PathBuf>, path: PathBuf) {
    if !paths.contains(&path) {
        paths.push(path);
    }
}

fn local_achievement_candidate_summary(candidates: &[PathBuf]) -> String {
    if candidates.is_empty() {
        return "no candidate paths could be built".to_string();
    }

    const MAX_PATHS: usize = 8;
    let mut summary = candidates
        .iter()
        .take(MAX_PATHS)
        .map(|path| path.display().to_string())
        .collect::<Vec<_>>()
        .join("; ");

    if candidates.len() > MAX_PATHS {
        summary.push_str(&format!("; +{} more", candidates.len() - MAX_PATHS));
    }

    summary
}

async fn fetch_epic_public_achievements(
    game: &InstalledGame,
) -> Result<Vec<UnifiedAchievement>, String> {
    let client = reqwest::Client::builder()
        .user_agent("OG-Launcher achievement sync")
        .build()
        .map_err(|error| format!("Could not create Epic achievements client: {error}"))?;

    let mut errors = Vec::new();
    for slug in epic_achievement_slug_candidates(game) {
        let url = format!("https://store.epicgames.com/achievements/{slug}?lang=en-US");
        match client.get(&url).send().await {
            Ok(response) if response.status().is_success() => {
                let html = response
                    .text()
                    .await
                    .map_err(|error| format!("Could not read Epic achievements page: {error}"))?;
                let achievements = parse_epic_public_achievement_html(&html);
                if !achievements.is_empty() {
                    cache_epic_public_achievements(game, &achievements);
                    return Ok(achievements);
                }
                errors.push(format!("{slug}: no readable achievements in page"));
            }
            Ok(response) => {
                errors.push(format!("{slug}: HTTP {}", response.status()));
            }
            Err(error) => {
                errors.push(format!("{slug}: {error}"));
            }
        }
    }

    Err(format!(
        "No public Epic achievement page matched {}. {}",
        game.title,
        errors.join("; ")
    ))
}

fn cache_epic_public_achievements(game: &InstalledGame, achievements: &[UnifiedAchievement]) {
    let Some(root) = open_game_launcher_data_dir()
        .map(|data_dir| data_dir.join("achievement-cache").join("epic"))
    else {
        return;
    };
    if let Err(error) = fs::create_dir_all(&root) {
        eprintln!("[open-game-launcher] Could not create Epic achievement cache: {error}");
        return;
    }

    let payload = serde_json::json!({
        "source": "epic-public",
        "gameId": game.id,
        "externalId": game.external_id,
        "fetchedAt": unix_timestamp_to_iso(current_unix_timestamp()),
        "achievements": achievements,
    });
    let Ok(contents) = serde_json::to_string_pretty(&payload) else {
        return;
    };

    let mut keys = vec![game.id.clone(), slugify(&game.title)];
    if let Some(external_id) = game.external_id.as_ref().filter(|value| !value.is_empty()) {
        keys.push(external_id.clone());
        keys.push(slugify(external_id));
    }

    for key in keys {
        let safe_key = slugify(&key);
        if safe_key.is_empty() {
            continue;
        }
        let path = root.join(format!("{safe_key}.json"));
        if let Err(error) = fs::write(&path, &contents) {
            eprintln!(
                "[open-game-launcher] Could not write Epic achievement cache {}: {error}",
                path.display()
            );
        }
    }
}

fn epic_achievement_slug_candidates(game: &InstalledGame) -> Vec<String> {
    let mut candidates = Vec::new();
    for value in [
        game.slug.as_str(),
        game.external_id.as_deref().unwrap_or_default(),
        game.id
            .strip_prefix("epic-owned-")
            .or_else(|| game.id.strip_prefix("epic-"))
            .unwrap_or_default(),
        game.title.as_str(),
    ] {
        let slug = slugify(value);
        if !slug.is_empty() && !candidates.contains(&slug) {
            candidates.push(slug);
        }
    }
    candidates
}

fn parse_epic_public_achievement_html(html: &str) -> Vec<UnifiedAchievement> {
    let lines = html_to_text_lines(html);
    let mut achievements = Vec::new();

    for index in 3..lines.len() {
        let Some(rarity) = epic_unlock_percent(&lines[index]) else {
            continue;
        };
        if !lines[index - 1].ends_with(" XP") {
            continue;
        }

        let title = lines[index - 3].trim();
        let description = lines[index - 2].trim();
        if title.is_empty()
            || description.is_empty()
            || title.eq_ignore_ascii_case("achievements")
            || title.eq_ignore_ascii_case("alphabetical")
        {
            continue;
        }

        let id = slugify(title);
        if achievements
            .iter()
            .any(|achievement: &UnifiedAchievement| achievement.id == id)
        {
            continue;
        }

        achievements.push(UnifiedAchievement {
            id: id.clone(),
            name: title.to_string(),
            description: Some(description.to_string()),
            icon_url: None,
            unlocked_at: None,
            rarity: Some(rarity),
            source: Some("epic".to_string()),
            source_achievement_id: Some(id),
            provider_confidence: Some("unofficial".to_string()),
        });
    }

    achievements
}

fn html_to_text_lines(html: &str) -> Vec<String> {
    let mut text = String::with_capacity(html.len());
    let mut in_tag = false;
    let mut entity = String::new();
    let mut in_entity = false;

    for character in html.chars() {
        if in_tag {
            if character == '>' {
                in_tag = false;
                text.push('\n');
            }
            continue;
        }

        if in_entity {
            if character == ';' {
                text.push_str(&decode_html_entity(&entity));
                entity.clear();
                in_entity = false;
            } else if entity.len() < 16 {
                entity.push(character);
            } else {
                text.push('&');
                text.push_str(&entity);
                entity.clear();
                in_entity = false;
            }
            continue;
        }

        match character {
            '<' => in_tag = true,
            '&' => in_entity = true,
            _ => text.push(character),
        }
    }

    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn decode_html_entity(entity: &str) -> String {
    match entity {
        "amp" => "&".to_string(),
        "quot" => "\"".to_string(),
        "apos" | "#39" => "'".to_string(),
        "lt" => "<".to_string(),
        "gt" => ">".to_string(),
        "nbsp" => " ".to_string(),
        _ if entity.starts_with("#x") => u32::from_str_radix(&entity[2..], 16)
            .ok()
            .and_then(char::from_u32)
            .map(|character| character.to_string())
            .unwrap_or_default(),
        _ if entity.starts_with('#') => entity[1..]
            .parse::<u32>()
            .ok()
            .and_then(char::from_u32)
            .map(|character| character.to_string())
            .unwrap_or_default(),
        _ => String::new(),
    }
}

fn epic_unlock_percent(line: &str) -> Option<f64> {
    let trimmed = line.trim();
    let percent = trimmed.strip_suffix("% of players unlock")?.trim();
    percent.parse::<f64>().ok()
}

fn parse_local_achievement_cache(
    value: &serde_json::Value,
    provider: &str,
) -> Result<Vec<UnifiedAchievement>, String> {
    if let Some(achievements) = value.as_array() {
        return Ok(achievements
            .iter()
            .filter_map(|achievement| local_json_to_achievement(achievement, provider))
            .collect());
    }

    for key in ["achievements", "items"] {
        if let Some(achievements) = value.get(key).and_then(serde_json::Value::as_array) {
            return Ok(achievements
                .iter()
                .filter_map(|achievement| local_json_to_achievement(achievement, provider))
                .collect());
        }
        if let Some(achievement_map) = value.get(key).and_then(serde_json::Value::as_object) {
            return Ok(local_achievement_map_to_achievements(
                achievement_map,
                provider,
            ));
        }
    }

    let nested_achievements = nested_local_achievement_rows(value, provider);
    if !nested_achievements.is_empty() {
        return Ok(nested_achievements);
    }
    if has_nested_local_achievement_container(value) {
        return Ok(Vec::new());
    }

    if let Some(achievement_map) = value.as_object() {
        return Ok(local_achievement_map_to_achievements(
            achievement_map,
            provider,
        ));
    }

    Err(
        "Local achievement cache must be an array, an achievement object map, or contain achievements/items."
            .to_string(),
    )
}

fn local_achievement_map_to_achievements(
    achievement_map: &serde_json::Map<String, serde_json::Value>,
    provider: &str,
) -> Vec<UnifiedAchievement> {
    achievement_map
        .iter()
        .filter_map(|(key, value)| {
            let mut achievement = value.clone();
            if let Some(object) = achievement.as_object_mut() {
                object
                    .entry("id".to_string())
                    .or_insert_with(|| serde_json::Value::String(key.clone()));
                object
                    .entry("sourceAchievementId".to_string())
                    .or_insert_with(|| serde_json::Value::String(key.clone()));
            }
            local_json_to_achievement(&achievement, provider)
        })
        .collect()
}

fn has_nested_local_achievement_container(value: &serde_json::Value) -> bool {
    value.as_object().is_some_and(|object| {
        object.iter().any(|(key, child)| {
            let key = key.to_lowercase();
            let key_is_container = key.contains("achievement")
                || key.contains("unlock")
                || key.contains("trophy")
                || key.contains("progress")
                || key.contains("stat")
                || key.contains("challenge")
                || key.contains("criteria");
            key_is_container
                && (child.is_array()
                    || child.get("items").is_some()
                    || child.get("criteria").is_some()
                    || child.get("stats").is_some()
                    || child.get("statistics").is_some()
                    || child.get("challenges").is_some()
                    || child.get("actions").is_some())
        })
    })
}

fn nested_local_achievement_rows(
    value: &serde_json::Value,
    provider: &str,
) -> Vec<UnifiedAchievement> {
    let mut achievements = Vec::new();
    collect_nested_local_achievement_rows(value, provider, false, &mut achievements);
    achievements
}

fn collect_nested_local_achievement_rows(
    value: &serde_json::Value,
    provider: &str,
    in_achievement_context: bool,
    achievements: &mut Vec<UnifiedAchievement>,
) {
    match value {
        serde_json::Value::Array(items) => {
            let parsed = if in_achievement_context {
                items
                    .iter()
                    .filter_map(|item| local_json_to_achievement(item, provider))
                    .collect::<Vec<_>>()
            } else {
                Vec::new()
            };

            if !parsed.is_empty() {
                for achievement in parsed {
                    push_unique_achievement(achievements, achievement);
                }
            } else {
                for item in items {
                    collect_nested_local_achievement_rows(
                        item,
                        provider,
                        in_achievement_context,
                        achievements,
                    );
                }
            }
        }
        serde_json::Value::Object(object) => {
            for (key, child) in object {
                let key = key.to_lowercase();
                let child_is_achievement_context = in_achievement_context
                    || key.contains("achievement")
                    || key.contains("unlock")
                    || key.contains("trophy")
                    || key.contains("progress")
                    || key.contains("stat")
                    || key.contains("challenge")
                    || key.contains("criteria");
                collect_nested_local_achievement_rows(
                    child,
                    provider,
                    child_is_achievement_context,
                    achievements,
                );
            }
        }
        _ => {}
    }
}

fn push_unique_achievement(
    achievements: &mut Vec<UnifiedAchievement>,
    achievement: UnifiedAchievement,
) {
    let keys = achievement_identity_keys(&achievement);
    if achievements.iter().any(|existing| {
        let existing_keys = achievement_identity_keys(existing);
        keys.iter().any(|key| existing_keys.contains(key))
    }) {
        return;
    }

    achievements.push(achievement);
}

fn local_json_to_achievement(
    value: &serde_json::Value,
    provider: &str,
) -> Option<UnifiedAchievement> {
    if is_plain_non_achievement_stat(value) {
        return None;
    }

    let id = local_achievement_id(value, provider)?;
    let name = json_string_at(
        value,
        &[
            &["displayName"][..],
            &["display_name"][..],
            &["displayText"][..],
            &["display_text"][..],
            &["displayTitle"][..],
            &["display_title"][..],
            &["achievementTitle"][..],
            &["achievement_title"][..],
            &["title"][..],
            &["label"][..],
            &["statName"][..],
            &["stat_name"][..],
            &["challengeName"][..],
            &["challenge_name"][..],
            &["actionName"][..],
            &["action_name"][..],
            &["clubActionName"][..],
            &["club_action_name"][..],
            &["name"][..],
            &["localizedTitle"][..],
            &["localized_title"][..],
            &["localizedName"][..],
            &["localized_name"][..],
        ],
    )
    .unwrap_or_else(|| id.clone());
    let unlocked_at = json_datetime_at(
        value,
        &[
            &["unlockedAt"][..],
            &["unlocked_at"][..],
            &["unlockTime"][..],
            &["unlock_time"][..],
            &["unlockDate"][..],
            &["unlock_date"][..],
            &["unlockTimestamp"][..],
            &["unlock_timestamp"][..],
            &["earnedAt"][..],
            &["earned_at"][..],
            &["grantDate"][..],
            &["grant_date"][..],
            &["completedAt"][..],
            &["completed_at"][..],
            &["completionTime"][..],
            &["completion_time"][..],
            &["dateUnlocked"][..],
            &["date_unlocked"][..],
            &["timestamp"][..],
        ],
    )
    .or_else(|| {
        json_bool_at(
            value,
            &[
                &["unlocked"][..],
                &["isUnlocked"][..],
                &["is_unlocked"][..],
                &["achieved"][..],
                &["isAchieved"][..],
                &["is_achieved"][..],
                &["completed"][..],
                &["isComplete"][..],
                &["is_complete"][..],
                &["complete"][..],
                &["earned"][..],
                &["isEarned"][..],
                &["is_earned"][..],
                &["isCompleted"][..],
                &["is_completed"][..],
                &["claimed"][..],
                &["isClaimed"][..],
                &["is_claimed"][..],
            ],
        )
        .filter(|unlocked| *unlocked)
        .map(|_| unix_timestamp_to_iso(current_unix_timestamp()))
    })
    .or_else(|| {
        json_unlock_status_at(
            value,
            &[
                &["status"][..],
                &["state"][..],
                &["unlockState"][..],
                &["unlock_state"][..],
                &["completionState"][..],
                &["completion_state"][..],
                &["grantState"][..],
                &["grant_state"][..],
            ],
        )
        .filter(|unlocked| *unlocked)
        .map(|_| unix_timestamp_to_iso(current_unix_timestamp()))
    });

    Some(UnifiedAchievement {
        id: id.clone(),
        name,
        description: json_string_at(
            value,
            &[
                &["description"][..],
                &["desc"][..],
                &["summary"][..],
                &["details"][..],
                &["displayDescription"][..],
                &["display_description"][..],
                &["localizedDescription"][..],
                &["localized_description"][..],
            ],
        ),
        icon_url: json_string_at(
            value,
            &[
                &["iconUrl"][..],
                &["icon_url"][..],
                &["icon"][..],
                &["imageUrl"][..],
                &["image_url"][..],
                &["unlockedIconUrl"][..],
                &["unlocked_icon_url"][..],
                &["badgeUrl"][..],
                &["badge_url"][..],
                &["tileUrl"][..],
                &["tile_url"][..],
                &["thumbnailUrl"][..],
                &["thumbnail_url"][..],
                &["imageUrlUnlocked"][..],
                &["image_url_unlocked"][..],
                &["imageUrlLocked"][..],
                &["image_url_locked"][..],
            ],
        ),
        unlocked_at,
        rarity: json_number_at(
            value,
            &[
                &["rarity"][..],
                &["percent"][..],
                &["unlockPercentage"][..],
                &["unlock_percentage"][..],
                &["percentComplete"][..],
                &["percent_complete"][..],
                &["completionPercent"][..],
                &["completion_percent"][..],
                &["progressPercent"][..],
                &["progress_percent"][..],
            ],
        ),
        source: json_string_at(value, &[&["source"][..]]).or(Some(provider.to_string())),
        source_achievement_id: local_source_achievement_id(value, provider).or(Some(id)),
        provider_confidence: json_string_at(
            value,
            &[&["providerConfidence"][..], &["provider_confidence"][..]],
        )
        .or_else(|| Some("unofficial".to_string())),
    })
}

fn is_plain_non_achievement_stat(value: &serde_json::Value) -> bool {
    let stat_id = json_string_at(
        value,
        &[
            &["statId"][..],
            &["stat_id"][..],
            &["statName"][..],
            &["stat_name"][..],
        ],
    )
    .map(|value| value.to_lowercase())
    .unwrap_or_default();
    let unit = json_string_at(value, &[&["unit"][..]])
        .map(|value| value.to_lowercase())
        .unwrap_or_default();

    let has_unlock_signal = json_datetime_at(
        value,
        &[
            &["unlockedAt"][..],
            &["unlocked_at"][..],
            &["unlockTime"][..],
            &["unlock_time"][..],
            &["earnedAt"][..],
            &["earned_at"][..],
            &["grantDate"][..],
            &["grant_date"][..],
            &["completedAt"][..],
            &["completed_at"][..],
        ],
    )
    .is_some()
        || json_bool_at(
            value,
            &[
                &["unlocked"][..],
                &["isUnlocked"][..],
                &["is_unlocked"][..],
                &["isEarned"][..],
                &["is_earned"][..],
                &["isCompleted"][..],
                &["is_completed"][..],
                &["complete"][..],
            ],
        )
        .unwrap_or(false)
        || json_unlock_status_at(
            value,
            &[
                &["status"][..],
                &["state"][..],
                &["grantState"][..],
                &["grant_state"][..],
            ],
        )
        .unwrap_or(false);

    if has_unlock_signal || stat_id.is_empty() {
        return false;
    }

    let looks_like_achievement = stat_id.contains("ach")
        || stat_id.contains("trophy")
        || stat_id.contains("challenge")
        || stat_id.contains("criteria")
        || stat_id.contains("medal");
    let looks_like_playtime = stat_id.contains("minute")
        || stat_id.contains("seconds")
        || stat_id.contains("hours")
        || stat_id.contains("timeplayed")
        || stat_id.contains("playtime")
        || matches!(
            unit.as_str(),
            "minute" | "minutes" | "second" | "seconds" | "hour" | "hours"
        );

    looks_like_playtime && !looks_like_achievement
}

fn local_achievement_id(value: &serde_json::Value, provider: &str) -> Option<String> {
    if provider == "gog" {
        return json_string_at(
            value,
            &[
                &["id"][..],
                &["key"][..],
                &["apiKey"][..],
                &["achievementKey"][..],
                &["achievement_key"][..],
                &["achievementId"][..],
                &["achievement_id"][..],
                &["achievementCode"][..],
                &["achievement_code"][..],
                &["achievementName"][..],
                &["achievement_name"][..],
                &["statId"][..],
                &["stat_id"][..],
                &["statName"][..],
                &["stat_name"][..],
                &["challengeId"][..],
                &["challenge_id"][..],
                &["challengeName"][..],
                &["challenge_name"][..],
                &["actionId"][..],
                &["action_id"][..],
                &["actionName"][..],
                &["action_name"][..],
                &["clubActionId"][..],
                &["club_action_id"][..],
                &["clubActionName"][..],
                &["club_action_name"][..],
                &["objectiveId"][..],
                &["objective_id"][..],
                &["criteriaId"][..],
                &["criteria_id"][..],
                &["trophyId"][..],
                &["trophy_id"][..],
                &["medalId"][..],
                &["medal_id"][..],
                &["uid"][..],
                &["code"][..],
                &["sourceAchievementId"][..],
                &["source_achievement_id"][..],
                &["name"][..],
            ],
        );
    }

    json_string_at(
        value,
        &[
            &["id"][..],
            &["key"][..],
            &["apiKey"][..],
            &["achievementId"][..],
            &["achievement_id"][..],
            &["achievementCode"][..],
            &["achievement_code"][..],
            &["achievementKey"][..],
            &["achievement_key"][..],
            &["achievementName"][..],
            &["achievement_name"][..],
            &["statId"][..],
            &["stat_id"][..],
            &["statName"][..],
            &["stat_name"][..],
            &["challengeId"][..],
            &["challenge_id"][..],
            &["challengeName"][..],
            &["challenge_name"][..],
            &["actionId"][..],
            &["action_id"][..],
            &["actionName"][..],
            &["action_name"][..],
            &["clubActionId"][..],
            &["club_action_id"][..],
            &["clubActionName"][..],
            &["club_action_name"][..],
            &["objectiveId"][..],
            &["objective_id"][..],
            &["criteriaId"][..],
            &["criteria_id"][..],
            &["trophyId"][..],
            &["trophy_id"][..],
            &["medalId"][..],
            &["medal_id"][..],
            &["uid"][..],
            &["code"][..],
            &["sourceAchievementId"][..],
            &["source_achievement_id"][..],
            &["name"][..],
        ],
    )
}

fn local_source_achievement_id(value: &serde_json::Value, provider: &str) -> Option<String> {
    if provider == "gog" {
        return json_string_at(
            value,
            &[
                &["sourceAchievementId"][..],
                &["source_achievement_id"][..],
                &["achievementKey"][..],
                &["achievement_key"][..],
                &["achievementId"][..],
                &["achievement_id"][..],
                &["achievementCode"][..],
                &["achievement_code"][..],
                &["achievementName"][..],
                &["achievement_name"][..],
                &["statId"][..],
                &["stat_id"][..],
                &["statName"][..],
                &["stat_name"][..],
                &["challengeId"][..],
                &["challenge_id"][..],
                &["challengeName"][..],
                &["challenge_name"][..],
                &["actionId"][..],
                &["action_id"][..],
                &["actionName"][..],
                &["action_name"][..],
                &["clubActionId"][..],
                &["club_action_id"][..],
                &["clubActionName"][..],
                &["club_action_name"][..],
                &["objectiveId"][..],
                &["objective_id"][..],
                &["criteriaId"][..],
                &["criteria_id"][..],
                &["trophyId"][..],
                &["trophy_id"][..],
                &["medalId"][..],
                &["medal_id"][..],
                &["uid"][..],
                &["code"][..],
            ],
        );
    }

    json_string_at(
        value,
        &[
            &["sourceAchievementId"][..],
            &["source_achievement_id"][..],
            &["achievementName"][..],
            &["achievement_name"][..],
            &["achievementId"][..],
            &["achievement_id"][..],
            &["achievementCode"][..],
            &["achievement_code"][..],
            &["achievementKey"][..],
            &["achievement_key"][..],
            &["statId"][..],
            &["stat_id"][..],
            &["statName"][..],
            &["stat_name"][..],
            &["challengeId"][..],
            &["challenge_id"][..],
            &["challengeName"][..],
            &["challenge_name"][..],
            &["actionId"][..],
            &["action_id"][..],
            &["actionName"][..],
            &["action_name"][..],
            &["clubActionId"][..],
            &["club_action_id"][..],
            &["clubActionName"][..],
            &["club_action_name"][..],
            &["objectiveId"][..],
            &["objective_id"][..],
            &["criteriaId"][..],
            &["criteria_id"][..],
            &["trophyId"][..],
            &["trophy_id"][..],
            &["medalId"][..],
            &["medal_id"][..],
            &["uid"][..],
            &["code"][..],
        ],
    )
}

fn json_unlock_status_at(value: &serde_json::Value, paths: &[&[&str]]) -> Option<bool> {
    json_string_at(value, paths).map(|status| {
        matches!(
            status.to_lowercase().as_str(),
            "unlocked"
                | "unlock"
                | "achieved"
                | "complete"
                | "completed"
                | "earned"
                | "done"
                | "finished"
                | "granted"
                | "claimed"
                | "true"
        )
    })
}

fn json_datetime_at(value: &serde_json::Value, paths: &[&[&str]]) -> Option<String> {
    paths.iter().find_map(|path| {
        let mut current = value;
        for key in *path {
            current = current.get(*key)?;
        }

        match current {
            serde_json::Value::Number(value) => {
                value.as_f64().and_then(unix_timestamp_number_to_iso)
            }
            serde_json::Value::String(value) => {
                let value = value.trim();
                if value.is_empty() {
                    return None;
                }
                if value
                    .chars()
                    .all(|character| character.is_ascii_digit() || character == '.')
                {
                    value
                        .parse::<f64>()
                        .ok()
                        .and_then(unix_timestamp_number_to_iso)
                } else {
                    DateTime::parse_from_rfc3339(value)
                        .ok()
                        .map(|_| value.to_string())
                }
            }
            _ => None,
        }
    })
}

fn unix_timestamp_number_to_iso(timestamp: f64) -> Option<String> {
    if !timestamp.is_finite() || timestamp <= 0.0 {
        None
    } else {
        // Provider caches use both Unix seconds and Unix milliseconds. Values
        // above year 2286 in seconds are treated as milliseconds; chrono then
        // rejects values outside its supported calendar range.
        let milliseconds = if timestamp >= 10_000_000_000.0 {
            timestamp
        } else {
            timestamp * 1_000.0
        };
        if milliseconds > i64::MAX as f64 {
            return None;
        }
        DateTime::<Utc>::from_timestamp_millis(milliseconds.round() as i64)
            .map(|value| value.to_rfc3339_opts(SecondsFormat::AutoSi, true))
    }
}

fn json_string_at(value: &serde_json::Value, paths: &[&[&str]]) -> Option<String> {
    paths.iter().find_map(|path| {
        let mut current = value;
        for key in *path {
            current = current.get(*key)?;
        }
        match current {
            serde_json::Value::String(value) => Some(value.trim().to_string()),
            serde_json::Value::Number(value) => Some(value.to_string()),
            _ => None,
        }
        .filter(|value| !value.is_empty())
    })
}

fn json_bool_at(value: &serde_json::Value, paths: &[&[&str]]) -> Option<bool> {
    paths.iter().find_map(|path| {
        let mut current = value;
        for key in *path {
            current = current.get(*key)?;
        }
        current.as_bool()
    })
}

fn json_number_at(value: &serde_json::Value, paths: &[&[&str]]) -> Option<f64> {
    paths.iter().find_map(|path| {
        let mut current = value;
        for key in *path {
            current = current.get(*key)?;
        }
        current
            .as_f64()
            .or_else(|| current.as_str()?.trim_end_matches('%').parse::<f64>().ok())
    })
}

pub(crate) fn preserve_known_unlocks(
    new_achievements: Vec<UnifiedAchievement>,
    previous: &[UnifiedAchievement],
) -> Vec<UnifiedAchievement> {
    let mut previous_unlocks: HashMap<String, String> = HashMap::new();
    for achievement in previous {
        let Some(unlocked_at) = achievement.unlocked_at.as_ref() else {
            continue;
        };
        for key in achievement_identity_keys(achievement) {
            previous_unlocks.insert(key, unlocked_at.clone());
        }
    }
    let new_keys: HashSet<String> = new_achievements
        .iter()
        .flat_map(achievement_identity_keys)
        .collect();

    let mut result: Vec<UnifiedAchievement> = new_achievements
        .into_iter()
        .map(|mut ach| {
            if ach.unlocked_at.is_none() {
                for key in achievement_identity_keys(&ach) {
                    if let Some(prev_unlock) = previous_unlocks.get(&key) {
                        ach.unlocked_at = Some(prev_unlock.clone());
                        break;
                    }
                }
            }
            ach
        })
        .collect();

    // Keep any previous achievement the new fetch is missing (transient API gaps, dropped IDs).
    for prev in previous {
        if !achievement_identity_keys(prev)
            .iter()
            .any(|key| new_keys.contains(key))
        {
            result.push(prev.clone());
        }
    }

    result
}

fn achievement_identity_keys(achievement: &UnifiedAchievement) -> Vec<String> {
    let mut keys = vec![achievement.id.clone()];
    if let Some(source) = achievement
        .source
        .as_ref()
        .filter(|value| !value.is_empty())
    {
        keys.push(format!("{source}:{}", achievement.id));
        if let Some(source_id) = achievement
            .source_achievement_id
            .as_ref()
            .filter(|value| !value.is_empty())
        {
            keys.push(format!("{source}:{source_id}"));
        }
    }
    if let Some(source_id) = achievement
        .source_achievement_id
        .as_ref()
        .filter(|value| !value.is_empty() && *value != &achievement.id)
    {
        keys.push(source_id.clone());
    }
    keys.sort();
    keys.dedup();
    keys
}

#[tauri::command]
pub fn uninstall_game(game_id: String) -> Result<UninstallGameResponse, String> {
    let game_id = normalize_game_id(game_id)?;
    println!("[open-game-launcher] uninstall_game requested for {game_id}");

    let mut games = read_installed_games_cache().unwrap_or_default();
    let game_index = games
        .iter()
        .position(|game| game.id == game_id)
        .ok_or_else(|| format!("Game '{game_id}' was not found in the local library cache."))?;

    let mut game = games[game_index].clone();

    if is_manual_game(&game) {
        games.remove(game_index);
        write_installed_games_cache(&games)?;
        return Ok(UninstallGameResponse {
            game_id,
            success: true,
            removed_from_library: true,
            game: None,
            message: format!("{} was removed from the Library.", game.title),
        });
    }

    if let Some(install_path) = game.install_path.as_deref() {
        let install_path = PathBuf::from(install_path);
        if is_og_managed_install_path(&install_path) {
            remove_managed_install_path(&install_path)?;
            mark_game_not_installed(&mut game);
            games[game_index] = game.clone();
            write_installed_games_cache(&games)?;
            return Ok(UninstallGameResponse {
                game_id,
                success: true,
                removed_from_library: false,
                game: Some(game.clone()),
                message: format!(
                    "{} was uninstalled from the OG managed library.",
                    game.title
                ),
            });
        }
    }

    if game.launcher == "xbox" {
        let raw_pfn = game
            .id
            .strip_prefix("xbox-")
            .unwrap_or(&game.id)
            .split('!')
            .next()
            .unwrap_or(&game.id);
        // The PFN segment before the first `_` is what Get-AppxPackage matches
        // against. It must be alphanumeric — any other character is rejected so
        // we cannot smuggle PowerShell metacharacters (`"`, `$`, backtick)
        // into the `-Command` string below.
        let pfn = raw_pfn.split('_').next().unwrap_or(raw_pfn);
        if pfn.is_empty() || pfn.len() > 128 || !pfn.chars().all(|c| c.is_ascii_alphanumeric()) {
            return Err(format!(
                "Refusing to launch uninstall: package family name '{pfn}' is not a safe identifier."
            ));
        }
        // PowerShell string interpolation is the previous injection sink. We
        // build the script with the value embedded as a `-Name` argument
        // literal that has been pre-validated, and additionally call the
        // script via stdin (`-Command -`) so the value can never be reparsed
        // by the shell.
        let script = format!(
            "$ErrorActionPreference = 'Stop'\n\
             $pkg = Get-AppxPackage -Name '*{pfn}*' -ErrorAction SilentlyContinue\n\
             if ($pkg) {{ Remove-AppxPackage -Package $pkg.PackageFullName }}\n"
        );
        let mut child = std::process::Command::new("powershell");
        child
            .args(["-NoProfile", "-NonInteractive", "-Command", "-"])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        match child.spawn() {
            Ok(mut child) => {
                if let Some(stdin) = child.stdin.as_mut() {
                    use std::io::Write;
                    let _ = stdin.write_all(script.as_bytes());
                }
                // PowerShell uninstall is fire-and-forget; we deliberately do
                // not block on `wait()` because the call already returned and
                // the parent has nothing meaningful to do with the exit code.
                drop(child);
                mark_game_not_installed(&mut game);
                games[game_index] = game.clone();
                write_installed_games_cache(&games)?;
                return Ok(UninstallGameResponse {
                    game_id,
                    success: true,
                    removed_from_library: false,
                    game: Some(game.clone()),
                    message: format!("{} uninstall was launched via PowerShell.", game.title),
                });
            }
            Err(e) => {
                return Err(format!("Failed to launch Xbox uninstaller: {}", e));
            }
        }
    }

    if let Some(uri) = uninstall_uri_for_game(&game) {
        open_uri(&uri).map_err(|error| format!("Could not open uninstall flow: {error}"))?;
        return Ok(UninstallGameResponse {
            game_id,
            success: true,
            removed_from_library: false,
            game: Some(game.clone()),
            message: format!(
                "{} uninstall was handed off to {}.",
                game.title,
                launcher_display_name(&game.launcher)
            ),
        });
    }

    Err(format!(
        "{} is managed by {}. Open that launcher to uninstall it, or remove only manually added entries from OG Launcher.",
        game.title,
        launcher_display_name(&game.launcher)
    ))
}

// Watcher logic

pub fn start_library_inventory_watcher(app_handle: AppHandle) {
    thread::spawn(move || {
        let (tx, rx) = mpsc::channel();
        let watcher_result = RecommendedWatcher::new(
            move |result| {
                let _ = tx.send(result);
            },
            Config::default(),
        );

        let Ok(mut watcher) = watcher_result else {
            eprintln!("[open-game-launcher] Failed to start library inventory watcher.");
            return;
        };

        let mut watched_paths = HashSet::new();
        let watched_count = watch_library_inventory_paths(&mut watcher, &mut watched_paths);
        if watched_count == 0 {
            eprintln!("[open-game-launcher] Library inventory watcher has no paths to watch.");
        }

        while let Ok(result) = rx.recv() {
            if let Err(error) = result {
                eprintln!("[open-game-launcher] Library watcher event error: {error}");
                continue;
            }

            while rx.recv_timeout(Duration::from_secs(2)).is_ok() {}

            match tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
            {
                Ok(runtime) => match runtime.block_on(refresh_installed_games()) {
                    Ok(games) => {
                        watch_library_inventory_paths(&mut watcher, &mut watched_paths);
                        let _ = app_handle.emit(
                            "library_inventory_changed",
                            LibraryInventoryChanged {
                                reason: "file_watcher".to_string(),
                                game_count: games.len(),
                            },
                        );
                    }
                    Err(error) => {
                        eprintln!("[open-game-launcher] Automatic library refresh failed: {error}");
                    }
                },
                Err(error) => {
                    eprintln!("[open-game-launcher] Failed to create watcher runtime: {error}");
                }
            }
        }
    });
}

fn watch_library_inventory_paths(
    watcher: &mut RecommendedWatcher,
    watched_paths: &mut HashSet<String>,
) -> usize {
    let mut watched_count = 0;

    for path in library_inventory_watch_paths() {
        let key = watch_path_key(&path);
        if !watched_paths.insert(key) {
            continue;
        }

        match watcher.watch(&path, RecursiveMode::Recursive) {
            Ok(()) => watched_count += 1,
            Err(error) => {
                eprintln!(
                    "[open-game-launcher] Failed to watch library path {}: {error}",
                    path.display()
                );
            }
        }
    }

    watched_count
}

fn watch_path_key(path: &Path) -> String {
    path.canonicalize()
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .to_lowercase()
}

fn library_inventory_watch_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Some(data_dir) = open_game_launcher_data_dir() {
        paths.push(data_dir.clone());
        paths.push(data_dir.join("games"));
    }

    if let Some(steam_dir) = find_steam_dir() {
        paths.push(steam_dir.join("steamapps"));
        paths.push(steam_dir.join("userdata"));
        for library in read_steam_library_folders(&steam_dir) {
            paths.push(library.join("steamapps"));
        }
    }

    if cfg!(target_os = "windows") {
        paths.push(PathBuf::from(
            r"C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests",
        ));
        paths.push(PathBuf::from(
            r"C:\ProgramData\Epic\EpicGamesLauncher\Data\Catalog",
        ));
        paths.push(PathBuf::from(r"C:\ProgramData\GOG.com\Galaxy\webcache"));
        paths.push(PathBuf::from(
            r"C:\ProgramData\Ubisoft\Ubisoft Game Launcher\cache",
        ));

        if let Some(program_files) = env_path("ProgramFiles") {
            paths.push(program_files.join("GOG Galaxy").join("Games"));
            paths.push(program_files.join("Ubisoft Game Launcher").join("games"));
        }

        if let Some(program_files_x86) = env_path("ProgramFiles(x86)") {
            paths.push(program_files_x86.join("GOG Galaxy").join("Games"));
            paths.push(
                program_files_x86
                    .join("Ubisoft")
                    .join("Ubisoft Game Launcher")
                    .join("games"),
            );
            paths.push(
                program_files_x86
                    .join("Ubisoft Game Launcher")
                    .join("games"),
            );
        }

        if let Some(local_app_data) = env_path("LOCALAPPDATA") {
            paths.push(
                local_app_data
                    .join("Ubisoft")
                    .join("Ubisoft Game Launcher")
                    .join("cache"),
            );
        }

        paths.push(PathBuf::from(r"C:\GOG Games"));
        paths.push(PathBuf::from(r"C:\Ubisoft Games"));

        for drive in local_drive_roots() {
            paths.push(drive.join("XboxGames"));
        }

        for install in read_gog_registry_installs() {
            paths.push(install.install_dir);
        }

        for install in read_ubisoft_registry_installs() {
            paths.push(install.install_dir);
        }

        for install in read_battlenet_registry_installs() {
            paths.push(install.install_dir);
        }

        for install in read_ea_registry_installs() {
            paths.push(install.install_dir);
        }
    }

    for game in read_installed_games_cache().unwrap_or_default() {
        if let Some(install_path) = game.install_path {
            paths.push(PathBuf::from(install_path));
        }
    }

    dedupe_existing_watch_paths(paths)
}

fn dedupe_existing_watch_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    let mut unique = Vec::new();

    for path in paths {
        if !path.exists() {
            continue;
        }

        let key = path
            .canonicalize()
            .unwrap_or_else(|_| path.clone())
            .to_string_lossy()
            .to_lowercase();

        if seen.insert(key) {
            unique.push(path);
        }
    }

    unique
}

// Utility Helpers

pub fn is_manual_game(game: &InstalledGame) -> bool {
    game.id.starts_with("manual-")
}

pub fn mark_game_not_installed(game: &mut InstalledGame) {
    game.status = GameStatus::NotInstalled;
    game.install_path = None;
    game.executable_path = None;
    game.process_names = Vec::new();
    game.launch_uri = None;
}

pub fn is_og_managed_install_path(path: &Path) -> bool {
    let Some(games_root) = open_game_launcher_data_dir().map(|dir| dir.join("games")) else {
        return false;
    };

    let normalized_path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let normalized_root = games_root.canonicalize().unwrap_or(games_root);

    normalized_path != normalized_root && normalized_path.starts_with(normalized_root)
}

pub fn remove_managed_install_path(path: &Path) -> Result<(), String> {
    if !is_og_managed_install_path(path) {
        return Err("Refusing to remove a path outside the OG managed install folder.".to_string());
    }

    if !path.exists() {
        return Ok(());
    }

    if path.is_dir() {
        fs::remove_dir_all(path)
            .map_err(|error| format!("Could not remove install folder: {error}"))
    } else {
        fs::remove_file(path).map_err(|error| format!("Could not remove install file: {error}"))
    }
}

pub fn uninstall_uri_for_game(game: &InstalledGame) -> Option<String> {
    match game.launcher.as_str() {
        "steam" => game
            .external_id
            .as_deref()
            .map(|external_id| format!("steam://uninstall/{external_id}")),
        "epic" => game.launch_uri.as_deref().map(|uri| {
            uri.replace("action=launch", "action=uninstall")
                .replace("action=install", "action=uninstall")
        }),
        "gog" => game
            .external_id
            .as_deref()
            .map(|external_id| format!("goggalaxy://open-game-view/{external_id}")),
        _ => None,
    }
}

pub fn update_uri_for_game(game: &InstalledGame) -> Option<String> {
    match game.launcher.as_str() {
        "steam" => game
            .external_id
            .as_deref()
            .map(|external_id| format!("steam://rungameid/{external_id}")),
        "epic" => game.launch_uri.clone(),
        "gog" => game
            .external_id
            .as_deref()
            .map(|external_id| format!("goggalaxy://open-game-view/{external_id}")),
        _ => None,
    }
}

pub fn read_og_managed_version(install_path: &Path) -> Option<String> {
    read_og_managed_manifest(install_path).and_then(|manifest| {
        let version = manifest.version.trim().to_string();
        (!version.is_empty()).then_some(version)
    })
}

pub fn read_og_managed_manifest(install_path: &Path) -> Option<OgManagedManifest> {
    let manifest_path = install_path.join(OG_MANAGED_MANIFEST_FILE);
    let contents = fs::read_to_string(manifest_path).ok()?;
    serde_json::from_str::<OgManagedManifest>(&contents).ok()
}

pub fn og_managed_manifest_trust_status(
    install_path: Option<&Path>,
    manifest: Option<&OgManagedManifest>,
) -> OgManifestTrustStatus {
    let Some(manifest) = manifest else {
        return OgManifestTrustStatus::Missing;
    };
    if !manifest_has_signature(manifest) {
        return OgManifestTrustStatus::Unsigned;
    }
    match install_path {
        Some(install_path) => verify_og_managed_manifest_signature(install_path, manifest)
            .map(|_| OgManifestTrustStatus::Signed)
            .unwrap_or(OgManifestTrustStatus::Invalid),
        None => OgManifestTrustStatus::Invalid,
    }
}

pub fn manifest_has_signature(manifest: &OgManagedManifest) -> bool {
    manifest
        .manifest_signature
        .as_deref()
        .is_some_and(|value| !value.trim().is_empty())
}

pub fn verify_og_managed_manifest_signature(
    install_path: &Path,
    manifest: &OgManagedManifest,
) -> Result<(), String> {
    let Some(signature_text) = manifest
        .manifest_signature
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(());
    };

    let verifying_key = og_manifest_verifying_key().ok_or_else(|| {
        "Signed OG manifest requires OGL_INSTALL_MANIFEST_VERIFYING_KEY.".to_string()
    })?;
    verify_og_managed_manifest_signature_with_key(
        install_path,
        manifest,
        signature_text,
        &verifying_key,
    )
}

fn verify_og_managed_manifest_signature_with_key(
    install_path: &Path,
    manifest: &OgManagedManifest,
    signature_text: &str,
    verifying_key: &VerifyingKey,
) -> Result<(), String> {
    let signature = parse_signature(signature_text)
        .ok_or_else(|| "OG manifest signature is not valid base64url or hex.".to_string())?;
    let signing_input = og_managed_manifest_signing_input(install_path, manifest)?;
    verifying_key
        .verify(signing_input.as_bytes(), &signature)
        .map_err(|_| "OG manifest signature check failed.".to_string())
}

fn og_managed_manifest_signing_input(
    install_path: &Path,
    manifest: &OgManagedManifest,
) -> Result<String, String> {
    let payload = OgManagedManifestSigningPayload {
        format_version: manifest.format_version,
        game_id: manifest.game_id.as_str(),
        title: manifest.title.as_str(),
        version: manifest.version.as_str(),
        managed_by: manifest.managed_by.as_str(),
        manifest_key_id: manifest.manifest_key_id.as_deref(),
        download_url: manifest.download_url.as_deref(),
        download_sha256: manifest.download_sha256.as_deref(),
        package_file: manifest.package_file.as_deref(),
        files: &manifest.files,
        executable_path: manifest.executable_path.as_deref(),
        package_sha256: manifest
            .package_file
            .as_deref()
            .and_then(|path| og_manifest_path_for_entry(install_path, path))
            .and_then(|path| sha256_file_hex(&path).ok()),
    };
    let payload_bytes = serde_json::to_vec(&payload)
        .map_err(|error| format!("Could not encode OG manifest signing payload: {error}"))?;
    Ok(format!(
        "{}.{}",
        OG_MANAGED_MANIFEST_SIGNATURE_PREFIX,
        URL_SAFE_NO_PAD.encode(payload_bytes)
    ))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OgManagedManifestSigningPayload<'a> {
    format_version: u32,
    game_id: &'a str,
    title: &'a str,
    version: &'a str,
    managed_by: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    manifest_key_id: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    download_url: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    download_sha256: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    package_file: Option<&'a str>,
    files: &'a [OgManagedManifestFile],
    #[serde(skip_serializing_if = "Option::is_none")]
    executable_path: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    package_sha256: Option<String>,
}

fn og_manifest_verifying_key() -> Option<VerifyingKey> {
    std::env::var(OG_MANIFEST_VERIFYING_KEY_ENV)
        .ok()
        .and_then(|value| clean_manifest_key_text(&value))
        .or_else(|| option_env!("OGL_INSTALL_MANIFEST_VERIFYING_KEY").map(ToString::to_string))
        .and_then(|value| parse_verifying_key(&value))
}

fn sign_og_managed_manifest_if_configured(
    install_path: &Path,
    manifest: &mut OgManagedManifest,
) -> Result<(), String> {
    if manifest_has_signature(manifest) {
        return Ok(());
    }

    let Some(signing_key) = og_manifest_signing_key()? else {
        return Ok(());
    };
    let key_id = og_manifest_key_id();
    sign_og_managed_manifest_with_key(install_path, manifest, &signing_key, key_id.as_deref())
}

fn sign_og_managed_manifest_with_key(
    install_path: &Path,
    manifest: &mut OgManagedManifest,
    signing_key: &SigningKey,
    key_id: Option<&str>,
) -> Result<(), String> {
    if let Some(key_id) = key_id.map(str::trim).filter(|value| !value.is_empty()) {
        manifest.manifest_key_id = Some(key_id.chars().take(120).collect());
    }

    let signing_input = og_managed_manifest_signing_input(install_path, manifest)?;
    let signature = signing_key.sign(signing_input.as_bytes());
    manifest.manifest_signature = Some(URL_SAFE_NO_PAD.encode(signature.to_bytes()));
    Ok(())
}

fn og_manifest_signing_key() -> Result<Option<SigningKey>, String> {
    let Some(value) = std::env::var(OG_MANIFEST_SIGNING_KEY_ENV)
        .ok()
        .and_then(|value| clean_manifest_key_text(&value))
        .or_else(|| option_env!("OGL_INSTALL_MANIFEST_SIGNING_KEY").map(ToString::to_string))
    else {
        return Ok(None);
    };

    let bytes = parse_base64url_or_hex(&value, 32).ok_or_else(|| {
        format!(
            "{OG_MANIFEST_SIGNING_KEY_ENV} must be a base64url or hex encoded 32-byte Ed25519 signing key seed."
        )
    })?;
    let key_bytes: [u8; 32] = bytes
        .try_into()
        .map_err(|_| format!("{OG_MANIFEST_SIGNING_KEY_ENV} must decode to exactly 32 bytes."))?;
    Ok(Some(SigningKey::from_bytes(&key_bytes)))
}

fn og_manifest_key_id() -> Option<String> {
    std::env::var(OG_MANIFEST_KEY_ID_ENV)
        .ok()
        .and_then(|value| clean_manifest_key_text(&value))
        .or_else(|| option_env!("OGL_INSTALL_MANIFEST_KEY_ID").map(ToString::to_string))
        .map(|value| value.chars().take(120).collect())
}

fn clean_manifest_key_text(value: &str) -> Option<String> {
    let trimmed = value.trim();
    (!trimmed.is_empty() && trimmed.len() <= 4096).then(|| trimmed.to_string())
}

fn parse_verifying_key(value: &str) -> Option<VerifyingKey> {
    let bytes = parse_base64url_or_hex(value, 32)?;
    let key_bytes: [u8; 32] = bytes.try_into().ok()?;
    VerifyingKey::from_bytes(&key_bytes).ok()
}

fn parse_signature(value: &str) -> Option<Signature> {
    let bytes = parse_base64url_or_hex(value, 64)?;
    Signature::from_slice(&bytes).ok()
}

fn parse_base64url_or_hex(value: &str, expected_len: usize) -> Option<Vec<u8>> {
    let trimmed = value.trim();
    URL_SAFE_NO_PAD
        .decode(trimmed.as_bytes())
        .ok()
        .filter(|bytes| bytes.len() == expected_len)
        .or_else(|| hex_decode(trimmed).filter(|bytes| bytes.len() == expected_len))
}

fn hex_decode(value: &str) -> Option<Vec<u8>> {
    let value = value.trim();
    if !value.len().is_multiple_of(2) {
        return None;
    }

    value
        .as_bytes()
        .chunks(2)
        .map(|chunk| {
            let high = hex_value(chunk[0])?;
            let low = hex_value(chunk[1])?;
            Some((high << 4) | low)
        })
        .collect()
}

fn hex_value(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
pub fn write_og_managed_manifest(
    install_path: &Path,
    game_id: &str,
    title: &str,
    version: &str,
) -> Result<(), String> {
    let files = collect_og_manifest_files(install_path)?;
    let executable_path = find_launch_executable(install_path, title)
        .as_deref()
        .and_then(|path| og_manifest_relative_path(install_path, path));
    let manifest = OgManagedManifest {
        game_id: game_id.to_string(),
        title: title.to_string(),
        version: version.to_string(),
        managed_by: "OG-Launcher".to_string(),
        files,
        executable_path,
        updated_at: Some(unix_timestamp_to_iso(current_unix_timestamp())),
        ..Default::default()
    };
    write_og_managed_manifest_details(install_path, &manifest)
}

pub fn write_og_managed_manifest_details(
    install_path: &Path,
    manifest: &OgManagedManifest,
) -> Result<(), String> {
    let manifest_path = install_path.join(OG_MANAGED_MANIFEST_FILE);
    let mut manifest = manifest.clone();
    if !manifest_has_signature(&manifest) && manifest.managed_by.trim().is_empty() {
        manifest.managed_by = "OG-Launcher".to_string();
    }
    if manifest.updated_at.is_none() {
        manifest.updated_at = Some(unix_timestamp_to_iso(current_unix_timestamp()));
    }
    sign_og_managed_manifest_if_configured(install_path, &mut manifest)?;

    let contents = serde_json::to_string_pretty(&manifest)
        .map_err(|error| format!("Could not serialize update manifest: {error}"))?;
    fs::write(manifest_path, contents)
        .map_err(|error| format!("Could not write update manifest: {error}"))
}

pub fn is_zip_package(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("zip"))
}

pub fn og_manifest_path_for_entry(install_path: &Path, relative_path: &str) -> Option<PathBuf> {
    let relative = Path::new(relative_path);
    if relative.is_absolute() {
        return None;
    }
    if relative.components().any(|component| {
        matches!(
            component,
            Component::Prefix(_) | Component::RootDir | Component::ParentDir
        )
    }) {
        return None;
    }

    Some(install_path.join(relative))
}

pub fn og_manifest_relative_path(install_path: &Path, path: &Path) -> Option<String> {
    let relative = path.strip_prefix(install_path).ok()?;
    if relative.as_os_str().is_empty() {
        return None;
    }
    if relative.components().any(|component| {
        matches!(
            component,
            Component::Prefix(_) | Component::RootDir | Component::ParentDir
        )
    }) {
        return None;
    }

    Some(
        relative
            .components()
            .filter_map(|component| match component {
                Component::Normal(value) => Some(value.to_string_lossy().to_string()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("/"),
    )
    .filter(|path| !path.trim().is_empty())
}

pub fn og_manifest_file_for_path(
    install_path: &Path,
    path: &Path,
) -> Option<OgManagedManifestFile> {
    let metadata = fs::metadata(path).ok()?;
    if !metadata.is_file() {
        return None;
    }

    Some(OgManagedManifestFile {
        path: og_manifest_relative_path(install_path, path)?,
        size_bytes: Some(metadata.len()),
        sha256: sha256_file_hex(path).ok(),
    })
}

pub fn sha256_file_hex(path: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};

    let mut file = fs::File::open(path)
        .map_err(|error| format!("Could not open file for SHA-256: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];

    loop {
        let bytes_read = file
            .read(&mut buffer)
            .map_err(|error| format!("Could not read file for SHA-256: {error}"))?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

#[cfg(test)]
fn collect_og_manifest_files(install_path: &Path) -> Result<Vec<OgManagedManifestFile>, String> {
    fn visit(
        install_path: &Path,
        current_path: &Path,
        files: &mut Vec<OgManagedManifestFile>,
    ) -> Result<(), String> {
        let entries = fs::read_dir(current_path)
            .map_err(|error| format!("Could not read install folder for manifest: {error}"))?;

        for entry in entries {
            let entry =
                entry.map_err(|error| format!("Could not read install folder entry: {error}"))?;
            let path = entry.path();
            let file_type = entry
                .file_type()
                .map_err(|error| format!("Could not inspect install folder entry: {error}"))?;

            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                visit(install_path, &path, files)?;
                continue;
            }
            if !file_type.is_file() {
                continue;
            }

            let Some(file) = og_manifest_file_for_path(install_path, &path) else {
                continue;
            };
            if file.path.eq_ignore_ascii_case(OG_MANAGED_MANIFEST_FILE) {
                continue;
            }
            files.push(file);
        }

        Ok(())
    }

    let mut files = Vec::new();
    if install_path.exists() {
        visit(install_path, install_path, &mut files)?;
    }
    files.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(files)
}

pub fn extract_og_zip_package<F>(
    package_path: &Path,
    install_path: &Path,
    mut on_file: F,
) -> Result<Vec<OgManagedManifestFile>, String>
where
    F: FnMut(usize, usize),
{
    let file = fs::File::open(package_path)
        .map_err(|error| format!("Could not open downloaded ZIP package: {error}"))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|error| format!("Could not read ZIP package: {error}"))?;
    let total = archive.len().max(1);
    let mut files = Vec::new();

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("Could not read ZIP entry: {error}"))?;

        if entry.is_symlink() {
            return Err("ZIP packages with symbolic links are not supported.".to_string());
        }

        let Some(relative_path) = entry.enclosed_name() else {
            return Err("ZIP package contains an unsafe path.".to_string());
        };
        let outpath = install_path.join(relative_path);

        if entry.is_dir() {
            fs::create_dir_all(&outpath)
                .map_err(|error| format!("Could not create ZIP directory: {error}"))?;
            on_file(index + 1, total);
            continue;
        }

        if let Some(parent) = outpath.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Could not create ZIP output folder: {error}"))?;
        }

        let mut outfile = fs::File::create(&outpath)
            .map_err(|error| format!("Could not write extracted ZIP file: {error}"))?;
        io::copy(&mut entry, &mut outfile)
            .map_err(|error| format!("Could not extract ZIP file: {error}"))?;

        #[cfg(unix)]
        if let Some(mode) = entry.unix_mode() {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&outpath, fs::Permissions::from_mode(mode));
        }

        if let Some(file) = og_manifest_file_for_path(install_path, &outpath) {
            if file.path.eq_ignore_ascii_case(OG_MANAGED_MANIFEST_FILE) {
                on_file(index + 1, total);
                continue;
            }
            files.push(file);
        }
        on_file(index + 1, total);
    }

    Ok(files)
}

pub fn save_sync_root_for_game(game_id: &str) -> Option<PathBuf> {
    open_game_launcher_data_dir().map(|data_dir| data_dir.join("save-sync").join(slugify(game_id)))
}

pub fn sync_destination_for_save(sync_root: &Path, save_file: &SaveFile, source: &Path) -> PathBuf {
    let label = save_file
        .label
        .as_deref()
        .filter(|label| !label.trim().is_empty())
        .or_else(|| source.file_name().and_then(|name| name.to_str()))
        .unwrap_or("save");
    let mut destination_name = slugify(label);
    if destination_name.is_empty() {
        destination_name = "save".to_string();
    }

    if source.is_file() {
        if let Some(extension) = source.extension().and_then(|extension| extension.to_str()) {
            destination_name.push('.');
            destination_name.push_str(extension);
        }
    }

    sync_root.join(destination_name)
}

pub fn launcher_display_name(launcher: &str) -> &'static str {
    match launcher {
        "steam" => "Steam",
        "epic" => "Epic Games Launcher",
        "ubisoft" => "Ubisoft Connect",
        "ea" => "EA App",
        "battlenet" => "Battle.net",
        "gog" => "GOG Galaxy",
        "xbox" => "Xbox app",
        "manual" => "OG Launcher",
        _ => "the source launcher",
    }
}

pub fn merge_cached_game_activity(game: &mut InstalledGame, cached_game: &InstalledGame) {
    // Older scanner versions used the install-directory mtime as "last played".
    // Only carry cached timestamps that are backed by recorded playtime; provider
    // timestamps discovered during the current scan remain on `game` untouched.
    if cached_game.playtime_minutes.unwrap_or_default() > 0 {
        match (&game.last_played_at, &cached_game.last_played_at) {
            (Some(current), Some(cached)) if cached > current => {
                game.last_played_at = Some(cached.clone());
            }
            (None, Some(cached)) => {
                game.last_played_at = Some(cached.clone());
            }
            _ => {}
        }
    }

    if let Some(cached_minutes) = cached_game.playtime_minutes {
        game.playtime_minutes = Some(
            game.playtime_minutes
                .map_or(cached_minutes, |minutes| minutes.max(cached_minutes)),
        );
    }

    if !cached_game.genres.is_empty() {
        game.genres = cached_game.genres.clone();
        game.developer = cached_game.developer.clone();
        game.publisher = cached_game.publisher.clone();
        game.release_date = cached_game.release_date.clone();
        game.features = cached_game.features.clone();
        game.rating = cached_game.rating;
        if !cached_game.description.contains("//") {
            game.description = cached_game.description.clone();
        }
    }

    if game.external_id.is_none() {
        game.external_id = cached_game.external_id.clone();
    }
    if game.executable_path.is_none() {
        game.executable_path = cached_game.executable_path.clone();
    }
    if game.process_names.is_empty() {
        game.process_names = cached_game.process_names.clone();
    }
    if game.achievements.is_empty() {
        game.achievements = cached_game.achievements.clone();
    }
    if game.achievement_provider_statuses.is_empty() {
        game.achievement_provider_statuses = cached_game.achievement_provider_statuses.clone();
    }
    if game.save_files.is_empty() {
        game.save_files = cached_game.save_files.clone();
    }
    if game.friends_playing.is_empty() {
        game.friends_playing = cached_game.friends_playing.clone();
    }
}

pub fn read_installed_games_cache() -> Option<Vec<InstalledGame>> {
    read_installed_games_cache_result().ok()
}

pub fn read_installed_games_cache_result() -> Result<Vec<InstalledGame>, String> {
    crate::commands::local_db::read_collection::<InstalledGame>("games")
        .map(|games| games.into_iter().map(repair_cached_game_assets).collect())
}

pub fn write_installed_games_cache(games: &[InstalledGame]) -> Result<(), String> {
    let repaired_games = games
        .iter()
        .cloned()
        .map(repair_cached_game_assets)
        .collect::<Vec<_>>();

    crate::commands::local_db::write_collection("games", &repaired_games, |game| &game.id)
}

pub fn update_installed_game_cache<F>(game_id: &str, update: F) -> Result<InstalledGame, String>
where
    F: FnOnce(&mut InstalledGame) -> Result<(), String>,
{
    crate::commands::local_db::update_item("games", game_id, |game: &mut InstalledGame| {
        let mut repaired = repair_cached_game_assets(game.clone());
        update(&mut repaired)?;
        *game = repair_cached_game_assets(repaired);
        Ok(())
    })
    .map(repair_cached_game_assets)
}

/// Manually overwrite a game's cached `playtime_minutes` (FEATURE_PLAN §14
/// "Manuelle Korrektur"). Returns the resulting `GameActivityUpdate` so the
/// frontend can refresh and the Supabase sync listener can react.
#[tauri::command]
pub fn set_cached_game_playtime(
    app: AppHandle,
    game_id: String,
    playtime_minutes: u32,
) -> Result<GameActivityUpdate, String> {
    use tauri::Emitter;

    let played_at = unix_timestamp_to_iso(current_unix_timestamp());
    let game = update_installed_game_cache(&game_id, move |game| {
        game.playtime_minutes = Some(playtime_minutes);
        game.last_played_at = Some(played_at);
        Ok(())
    })?;

    let update = GameActivityUpdate {
        game_id: game_id.clone(),
        last_played: game.last_played_at.clone(),
        playtime_minutes: game.playtime_minutes,
    };
    let _ = app.emit("game_activity_updated", &update);
    Ok(update)
}

pub fn repair_cached_game_assets(mut game: InstalledGame) -> InstalledGame {
    if game.slug.is_empty() {
        game.slug = slugify(&game.title);
    }
    if game.launcher.is_empty() {
        game.launcher = launcher_key_from_source(&game.description).to_string();
    }
    let normalized_description = game.description.trim().to_lowercase();
    let has_legacy_placeholder_description = (normalized_description.starts_with("a ")
        && normalized_description.ends_with(" game managed by og launcher."))
        || (normalized_description.contains("game (owned)")
            && (normalized_description.contains("id:")
                || normalized_description.contains("appid:")
                || normalized_description.contains("offer:")))
        || matches!(
            normalized_description.as_str(),
            "xbox game (installed)" | "xbox game (not installed)"
        );
    if has_legacy_placeholder_description {
        game.description.clear();
        if game.version == "1.0.0" || game.version == "1.0" {
            game.version.clear();
        }
    }
    if launcher_key_from_source(&game.launcher) != "steam" && game.playtime_minutes.is_none() {
        game.last_played_at = None;
    }
    if game.executable_path.is_none() {
        if let Some(install_path) = game.install_path.as_deref() {
            game.executable_path =
                find_launch_executable(Path::new(install_path), &game.title).map(path_to_string);
        }
    }
    if game.process_names.is_empty() {
        game.process_names = game
            .executable_path
            .as_deref()
            .and_then(|path| {
                Path::new(path)
                    .file_name()
                    .and_then(|name| name.to_str())
                    .map(|name| vec![name.to_string()])
            })
            .unwrap_or_default();
    }

    if is_battlenet_game(&game) {
        return apply_battlenet_assets(game, None);
    }

    game
}

pub fn is_battlenet_game(game: &InstalledGame) -> bool {
    game.id.starts_with("battlenet-")
        || game
            .launch_uri
            .as_deref()
            .is_some_and(|uri| uri.starts_with("battlenet://"))
        || game.description.starts_with("Battle.net")
}

pub fn apply_battlenet_assets(
    mut game: InstalledGame,
    _display_icon: Option<&str>,
) -> InstalledGame {
    let uid = game
        .launch_uri
        .as_deref()
        .and_then(|uri| uri.strip_prefix("battlenet://"))
        .or_else(|| game.id.strip_prefix("battlenet-"))
        .unwrap_or(&game.id);
    let (fallback_cover, fallback_logo, fallback_icon) =
        super::detect::get_battlenet_assets(uid, &game.title);
    let rawg_assets = super::detect::get_rawg_battlenet_assets(uid, &game.title);
    let (cover, logo, icon) = rawg_assets
        .map(|assets| {
            (
                assets.cover_url.or(fallback_cover.clone()),
                assets.logo_url.or(fallback_logo.clone()),
                assets.icon_url.or(fallback_icon.clone()),
            )
        })
        .unwrap_or((fallback_cover, fallback_logo, fallback_icon));

    game.cover_url = cover;
    game.logo_url = logo.clone();
    game.logo_urls = logo.into_iter().collect();
    game.icon_url = icon.clone();
    game.icon_urls = icon.into_iter().collect();
    game.logo_position = LogoPosition::CenterCenter;
    game.logo_width_percent = Some(58.0);
    game.logo_height_percent = Some(48.0);
    game
}

pub fn installed_game(
    id: &str,
    title: String,
    launcher: String,
    install_path: Option<String>,
    cover_url: Option<String>,
) -> InstalledGame {
    let slug = slugify(&title);
    let description = String::new();
    let platform = current_platform();

    InstalledGame {
        id: id.to_string(),
        title,
        slug,
        description,
        version: String::new(),
        launcher,
        external_id: None,
        cover_url,
        icon_url: None,
        icon_urls: Vec::new(),
        logo_url: None,
        logo_urls: Vec::new(),
        logo_position: LogoPosition::BottomLeft,
        logo_width_percent: None,
        logo_height_percent: None,
        status: GameStatus::Installed,
        platform,
        install_path,
        executable_path: None,
        process_names: Vec::new(),
        launch_uri: None,
        last_played_at: None,
        playtime_minutes: None,
        genres: Vec::new(),
        developer: None,
        publisher: None,
        release_date: None,
        features: Vec::new(),
        rating: None,
        achievements: Vec::new(),
        achievements_synced_at: None,
        achievement_provider_statuses: Vec::new(),
        save_files: Vec::new(),
        friends_playing: Vec::new(),
    }
}

pub fn launcher_key_from_source(source: &str) -> &'static str {
    let normalized = source.to_lowercase();
    if normalized.contains("steam") {
        "steam"
    } else if normalized.contains("epic") {
        "epic"
    } else if normalized.contains("ubisoft") || normalized.contains("uplay") {
        "ubisoft"
    } else if normalized.contains("origin")
        || normalized.starts_with("ea")
        || normalized.contains("ea app")
        || normalized.contains("ea desktop")
        || normalized == "ea"
    {
        "ea"
    } else if normalized.contains("battle.net") || normalized.contains("battlenet") {
        "battlenet"
    } else if normalized.contains("gog") {
        "gog"
    } else if normalized.contains("xbox") {
        "xbox"
    } else if normalized.contains("manual") {
        "manual"
    } else {
        "unknown"
    }
}

pub fn launch_installed_game(game: &InstalledGame) -> Result<Option<Child>, String> {
    if let Some(uri) = &game.launch_uri {
        open_uri(uri).map_err(|error| format!("Could not launch {}: {error}", game.title))?;
        return Ok(None);
    }

    let Some(install_path) = game.install_path.as_ref().map(PathBuf::from) else {
        return Err(format!("No launch path found for {}.", game.title));
    };

    let executable = find_launch_executable(&install_path, &game.title)
        .ok_or_else(|| format!("No matching .exe found for {}.", game.title))?;
    let working_dir = executable.parent().unwrap_or(&install_path);

    let mut cmd = Command::new(&executable);
    cmd.current_dir(working_dir);

    cmd.spawn().map(Some).map_err(|error| error.to_string())
}

pub fn open_uri(uri: &str) -> std::io::Result<()> {
    // Centralised through `uri_safety::open_uri_safely` so the same
    // scheme allowlist and shell-free executor are used everywhere.
    // The historical `cmd /C start "" <uri>` was a command-injection
    // sink and is no longer reachable from this binary.
    let _ = crate::commands::uri_safety::validate_uri_scheme(uri).map_err(std::io::Error::other)?;
    crate::commands::uri_safety::open_uri_safely(uri).map_err(std::io::Error::other)
}

pub fn is_file_executable(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }

    #[cfg(unix)]
    {
        if let Ok(metadata) = fs::metadata(path) {
            return metadata.permissions().mode() & 0o111 != 0;
        }
    }

    if let Some(extension) = path.extension().and_then(|ext| ext.to_str()) {
        return extension.eq_ignore_ascii_case("exe")
            || extension.eq_ignore_ascii_case("bat")
            || extension.eq_ignore_ascii_case("cmd");
    }

    false
}

pub fn find_launch_executable(install_path: &Path, title: &str) -> Option<PathBuf> {
    if is_file_executable(install_path) {
        return Some(install_path.to_path_buf());
    }

    let title_score = normalize_executable_name(title);
    let mut candidates = Vec::new();
    collect_executable_candidates(install_path, 0, &mut candidates);

    candidates
        .into_iter()
        .filter(|path| !is_ignored_executable(path))
        .max_by_key(|path| executable_score(path, &title_score))
}

fn find_gog_executable(install_path: &Path, gog_id: &str) -> Option<PathBuf> {
    // Try to read the goggame-*.info manifest first
    let info_pattern = format!("goggame-{}.info", gog_id);
    let info_path = install_path.join(&info_pattern);

    if info_path.exists() {
        if let Ok(contents) = fs::read_to_string(&info_path) {
            if let Ok(manifest) = serde_json::from_str::<serde_json::Value>(&contents) {
                // Look for play tasks
                if let Some(play_tasks) = manifest.get("playTasks").and_then(|v| v.as_array()) {
                    for task in play_tasks {
                        if task.get("isPrimary").and_then(|v| v.as_bool()) == Some(true) {
                            if let Some(path) = task.get("path").and_then(|v| v.as_str()) {
                                let exe_path = install_path.join(path);
                                if exe_path.exists() {
                                    return Some(exe_path);
                                }
                            }
                            // Some manifests use "workingDir" + exe name
                            if let Some(exe) = task.get("exec").and_then(|v| v.as_str()) {
                                let exe_path = install_path.join(exe);
                                if exe_path.exists() {
                                    return Some(exe_path);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Fallback: search for executables matching the game name
    find_launch_executable(install_path, &gog_id.replace('-', " "))
}

fn collect_executable_candidates(path: &Path, depth: usize, candidates: &mut Vec<PathBuf>) {
    if depth > 3 {
        return;
    }

    let Ok(entries) = fs::read_dir(path) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            let normalized = name.to_lowercase();
            if matches!(
                normalized.as_str(),
                "_commonredist" | "redist" | "redistributables" | "support" | "tools"
            ) {
                continue;
            }
            collect_executable_candidates(&path, depth + 1, candidates);
        } else if is_file_executable(&path) {
            candidates.push(path);
        }
    }
}

fn executable_score(path: &Path, title_score: &str) -> i32 {
    let Some(stem) = path.file_stem().and_then(|stem| stem.to_str()) else {
        return 0;
    };

    let normalized = normalize_executable_name(stem);
    let mut score = 10;

    if normalized == title_score {
        score += 100;
    } else if normalized.contains(title_score) || title_score.contains(&normalized) {
        score += 60;
    }

    if let Some(parent) = path
        .parent()
        .and_then(|parent| parent.file_name())
        .and_then(|name| name.to_str())
    {
        let parent = parent.to_lowercase();
        if matches!(parent.as_str(), "bin" | "binaries" | "win64" | "x64") {
            score += 10;
        }
    }

    score
}

fn is_ignored_executable(path: &Path) -> bool {
    path.file_stem()
        .and_then(|stem| stem.to_str())
        .map(|stem| {
            let normalized = stem.to_lowercase();
            normalized.contains("unins")
                || normalized.contains("setup")
                || normalized.contains("install")
                || normalized.contains("crash")
                || normalized.contains("redist")
                || normalized.contains("vcredist")
                || normalized.contains("dxsetup")
        })
        .unwrap_or(true)
}

fn normalize_executable_name(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

pub fn current_platform() -> Platform {
    if cfg!(target_os = "windows") {
        Platform::Windows
    } else if cfg!(target_os = "macos") {
        Platform::Macos
    } else {
        Platform::Linux
    }
}

pub fn env_path(key: &str) -> Option<PathBuf> {
    env::var_os(key).map(PathBuf::from)
}

pub fn path_to_string(path: PathBuf) -> String {
    path.to_string_lossy().to_string()
}

pub fn slugify(value: &str) -> String {
    let mut slug = String::new();
    let mut last_was_dash = false;

    for character in value.chars().flat_map(char::to_lowercase) {
        if character.is_ascii_alphanumeric() {
            slug.push(character);
            last_was_dash = false;
        } else if !last_was_dash {
            slug.push('-');
            last_was_dash = true;
        }
    }

    slug.trim_matches('-').to_string()
}

pub fn normalize_game_id(game_id: String) -> Result<String, String> {
    let normalized = game_id.trim().to_string();

    if normalized.is_empty() {
        return Err("game_id must not be empty.".to_string());
    }

    Ok(normalized)
}

pub fn sanitize_optional_text(value: Option<String>) -> Option<String> {
    value
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

pub fn unix_timestamp_to_iso(timestamp: u64) -> String {
    let secs = timestamp as i64;
    let days = secs / 86400;
    let remaining = secs % 86400;
    let hours = (remaining / 3600) as u32;
    let minutes = ((remaining % 3600) / 60) as u32;
    let seconds = (remaining % 60) as u32;

    let (year, month, day) = civil_from_days(days);

    format!("{year:04}-{month:02}-{day:02}T{hours:02}:{minutes:02}:{seconds:02}Z")
}

fn civil_from_days(days: i64) -> (i32, u32, u32) {
    let days = days + 719468;
    let era = if days >= 0 {
        days / 146097
    } else {
        (days - 146096) / 146097
    };
    let doe = days - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };

    (year as i32, m as u32, d as u32)
}

pub fn get_dir_last_modified(path: &Path) -> Option<u64> {
    let metadata = fs::metadata(path).ok()?;
    let modified = metadata.modified().ok()?;
    system_time_to_unix_timestamp(modified)
}

pub fn current_unix_timestamp() -> u64 {
    system_time_to_unix_timestamp(SystemTime::now()).unwrap_or_default()
}

pub fn system_time_to_unix_timestamp(time: SystemTime) -> Option<u64> {
    time.duration_since(UNIX_EPOCH).ok().map(|d| d.as_secs())
}

pub fn open_game_launcher_data_dir() -> Option<PathBuf> {
    dirs::data_local_dir()
        .or_else(dirs::data_dir)
        .map(|data_dir| data_dir.join("open-game-launcher"))
}

fn supabase_access_token_path() -> Option<PathBuf> {
    open_game_launcher_data_dir().map(|data_dir| data_dir.join("supabase-access-token"))
}

pub fn read_supabase_access_token() -> Option<String> {
    let path = supabase_access_token_path()?;
    let token = fs::read_to_string(path).ok()?.trim().to_string();
    (!token.is_empty()).then_some(token)
}

#[tauri::command]
pub fn read_cached_supabase_access_token() -> Option<String> {
    read_supabase_access_token()
}

#[tauri::command]
pub fn cache_supabase_access_token(token: String) -> Result<(), String> {
    let Some(path) = supabase_access_token_path() else {
        return Err("Could not resolve launcher data directory.".to_string());
    };

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let trimmed = token.trim();
    if trimmed.is_empty() {
        if path.exists() {
            fs::remove_file(&path).map_err(|error| error.to_string())?;
        }
        return Ok(());
    }

    fs::write(path, trimmed).map_err(|error| error.to_string())
}

pub fn rawg_asset_cache_path() -> Option<PathBuf> {
    open_game_launcher_data_dir().map(|data_dir| data_dir.join("rawg-assets.json"))
}

pub fn epic_catalog_asset_cache_path() -> Option<PathBuf> {
    open_game_launcher_data_dir().map(|data_dir| data_dir.join("epic-catalog-assets.json"))
}

pub fn is_ignored_game_directory(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
        return true;
    };

    let normalized = name.trim().to_lowercase();
    normalized.is_empty()
        || normalized.starts_with('.')
        || matches!(
            normalized.as_str(),
            "content"
                | "gamesave"
                | "modifiablewindowsapps"
                | "msixvc"
                | "pgs"
                | "program files"
                | "wgs"
                | "windowsapps"
        )
}

pub fn local_drive_roots() -> Vec<PathBuf> {
    #[cfg(windows)]
    {
        let mut drives = Vec::new();
        for letter in b'A'..=b'Z' {
            let drive_path = format!("{}:\\", letter as char);
            let path = PathBuf::from(&drive_path);
            if path.exists() {
                drives.push(path);
            }
        }
        drives
    }
    #[cfg(not(windows))]
    {
        vec![PathBuf::from("/")]
    }
}

pub fn ensure_path_inside_root(path: &Path, root: &Path) -> Result<(), String> {
    // Both inputs must be canonicalizable. If either fails (e.g. does not yet
    // exist and we cannot resolve symlinks), we refuse — the previous
    // implementation silently fell back to the raw input, which let a
    // caller pass `..\..\Windows\System32\config\SAM` and have it accepted
    // because `Path::starts_with` was compared against an un-canonicalized
    // root.
    let normalized_root = root.canonicalize().map_err(|e| {
        format!("Refusing to write outside the OG save-sync folder: root is not resolvable ({e}).")
    })?;
    let normalized_path = path.canonicalize().map_err(|e| {
        format!("Refusing to write outside the OG save-sync folder: path is not resolvable ({e}).")
    })?;

    // Reject any `..` components in the raw input up front as a defence in
    // depth — canonicalize should already have collapsed them, but a path
    // that *only* contained `..` would canonicalize to a parent directory
    // and could be inside the root by accident.
    for component in path.components() {
        match component {
            std::path::Component::ParentDir => {
                return Err(
                    "Refusing to write outside the OG save-sync folder: path contains '..'."
                        .to_string(),
                );
            }
            std::path::Component::Prefix(_) | std::path::Component::RootDir => {
                return Err(
                    "Refusing to write outside the OG save-sync folder: absolute paths are not allowed."
                        .to_string(),
                );
            }
            _ => {}
        }
    }

    // Compare path components, not bytes — `C:\foo` should not be considered
    // a child of `c:\foo` on Windows purely because of the drive letter, but
    // `Foo` and `foo` are the same directory on NTFS and we want them to
    // match. Use case-insensitive comparison on Windows only.
    let same_root = if cfg!(windows) {
        normalized_path
            .to_string_lossy()
            .to_lowercase()
            .starts_with(&normalized_root.to_string_lossy().to_lowercase())
    } else {
        normalized_path.starts_with(&normalized_root)
    };

    if same_root {
        Ok(())
    } else {
        Err("Refusing to write outside the OG save-sync folder.".to_string())
    }
}

pub fn path_size_bytes(path: &Path) -> Option<u64> {
    if path.is_file() {
        return fs::metadata(path).ok().map(|metadata| metadata.len());
    }

    if path.is_dir() {
        let mut size = 0_u64;
        collect_path_size(path, &mut size);
        return Some(size);
    }

    None
}

fn collect_path_size(path: &Path, size: &mut u64) {
    let Ok(entries) = fs::read_dir(path) else {
        return;
    };

    for entry in entries.flatten() {
        let entry_path = entry.path();
        if entry_path.is_dir() {
            collect_path_size(&entry_path, size);
        } else if let Ok(metadata) = fs::metadata(entry_path) {
            *size = size.saturating_add(metadata.len());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_temp_dir(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "ogl-{name}-{}-{}",
            std::process::id(),
            current_unix_timestamp()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn normalized_path_text(path: &Path) -> String {
        path.to_string_lossy().replace('\\', "/")
    }

    #[test]
    fn launcher_key_normalizes_legacy_uplay_labels() {
        assert_eq!(launcher_key_from_source("Uplay"), "ubisoft");
        assert_eq!(launcher_key_from_source("Uplay game import"), "ubisoft");
    }

    #[test]
    fn managed_games_root_is_not_a_single_install_path() {
        let games_root = open_game_launcher_data_dir().unwrap().join("games");

        assert!(!is_og_managed_install_path(&games_root));
    }

    #[cfg(windows)]
    #[test]
    fn move_volume_check_rejects_cross_drive_target() {
        assert!(paths_share_volume(
            Path::new(r"C:\Games\Test"),
            Path::new(r"c:\Library\Test")
        ));
        assert!(!paths_share_volume(
            Path::new(r"C:\Games\Test"),
            Path::new(r"D:\Library\Test")
        ));
    }

    #[test]
    fn og_manifest_file_for_path_records_sha256() {
        let root = unique_temp_dir("manifest-hash");
        let file_path = root.join("game.bin");
        fs::write(&file_path, b"abc").unwrap();

        let manifest_file = og_manifest_file_for_path(&root, &file_path).unwrap();

        assert_eq!(manifest_file.path, "game.bin");
        assert_eq!(manifest_file.size_bytes, Some(3));
        assert_eq!(
            manifest_file.sha256.as_deref(),
            Some("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn write_og_managed_manifest_records_install_files_with_hashes() {
        let root = unique_temp_dir("managed-manifest");
        fs::create_dir_all(root.join("bin")).unwrap();
        let executable_name = if cfg!(target_os = "windows") {
            "game.exe"
        } else {
            "game"
        };
        let executable_path = root.join("bin").join(executable_name);
        fs::write(&executable_path, b"abc").unwrap();
        #[cfg(unix)]
        fs::set_permissions(&executable_path, fs::Permissions::from_mode(0o755)).unwrap();

        write_og_managed_manifest(&root, "game-1", "Game", "1.0.0").unwrap();
        let manifest = read_og_managed_manifest(&root).unwrap();
        let expected_relative = format!("bin/{executable_name}");

        assert_eq!(manifest.files.len(), 1);
        assert_eq!(manifest.files[0].path, expected_relative);
        assert_eq!(
            manifest.files[0].sha256.as_deref(),
            Some("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
        );
        assert_eq!(
            manifest.executable_path.as_deref(),
            Some(expected_relative.as_str())
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn og_managed_manifest_signature_accepts_valid_signature() {
        let root = unique_temp_dir("managed-manifest-signed");
        fs::write(root.join("game.bin"), b"abc").unwrap();
        let signing_key = SigningKey::from_bytes(&[7; 32]);
        let mut manifest = OgManagedManifest {
            game_id: "game-1".to_string(),
            title: "Game".to_string(),
            version: "1.0.0".to_string(),
            managed_by: "OG-Launcher".to_string(),
            files: vec![og_manifest_file_for_path(&root, &root.join("game.bin")).unwrap()],
            ..Default::default()
        };
        let signing_input = og_managed_manifest_signing_input(&root, &manifest).unwrap();
        let signature = signing_key.sign(signing_input.as_bytes());
        manifest.manifest_signature = Some(URL_SAFE_NO_PAD.encode(signature.to_bytes()));

        let result = verify_og_managed_manifest_signature_with_key(
            &root,
            &manifest,
            manifest.manifest_signature.as_deref().unwrap(),
            &signing_key.verifying_key(),
        );

        assert!(result.is_ok());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn og_managed_manifest_signature_rejects_tampered_manifest() {
        let root = unique_temp_dir("managed-manifest-tampered");
        fs::write(root.join("game.bin"), b"abc").unwrap();
        let signing_key = SigningKey::from_bytes(&[9; 32]);
        let mut manifest = OgManagedManifest {
            game_id: "game-1".to_string(),
            title: "Game".to_string(),
            version: "1.0.0".to_string(),
            managed_by: "OG-Launcher".to_string(),
            files: vec![og_manifest_file_for_path(&root, &root.join("game.bin")).unwrap()],
            ..Default::default()
        };
        let signing_input = og_managed_manifest_signing_input(&root, &manifest).unwrap();
        let signature = signing_key.sign(signing_input.as_bytes());
        manifest.manifest_signature = Some(URL_SAFE_NO_PAD.encode(signature.to_bytes()));
        manifest.version = "2.0.0".to_string();

        let error = verify_og_managed_manifest_signature_with_key(
            &root,
            &manifest,
            manifest.manifest_signature.as_deref().unwrap(),
            &signing_key.verifying_key(),
        )
        .unwrap_err();

        assert!(error.contains("signature check failed"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn signs_manifest_with_key_id_bound_to_signature() {
        let root = unique_temp_dir("managed-manifest-key-id");
        fs::write(root.join("game.bin"), b"abc").unwrap();
        let signing_key = SigningKey::from_bytes(&[13; 32]);
        let mut manifest = OgManagedManifest {
            game_id: "game-1".to_string(),
            title: "Game".to_string(),
            version: "1.0.0".to_string(),
            managed_by: "OG-Launcher".to_string(),
            files: vec![og_manifest_file_for_path(&root, &root.join("game.bin")).unwrap()],
            ..Default::default()
        };

        sign_og_managed_manifest_with_key(
            &root,
            &mut manifest,
            &signing_key,
            Some("provider-release-2026q2"),
        )
        .unwrap();

        assert_eq!(
            manifest.manifest_key_id.as_deref(),
            Some("provider-release-2026q2")
        );
        assert!(manifest_has_signature(&manifest));
        assert!(verify_og_managed_manifest_signature_with_key(
            &root,
            &manifest,
            manifest.manifest_signature.as_deref().unwrap(),
            &signing_key.verifying_key(),
        )
        .is_ok());

        manifest.manifest_key_id = Some("other-key".to_string());
        let error = verify_og_managed_manifest_signature_with_key(
            &root,
            &manifest,
            manifest.manifest_signature.as_deref().unwrap(),
            &signing_key.verifying_key(),
        )
        .unwrap_err();
        assert!(error.contains("signature check failed"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn write_manifest_uses_configured_signing_key() {
        let _guard = manifest_env_test_lock()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let root = unique_temp_dir("managed-manifest-env-signed");
        fs::write(root.join("game.bin"), b"abc").unwrap();
        let signing_key = SigningKey::from_bytes(&[17; 32]);
        let signing_key_text = URL_SAFE_NO_PAD.encode(signing_key.to_bytes());
        let verifying_key_text = URL_SAFE_NO_PAD.encode(signing_key.verifying_key().to_bytes());
        std::env::set_var(OG_MANIFEST_SIGNING_KEY_ENV, signing_key_text);
        std::env::set_var(OG_MANIFEST_VERIFYING_KEY_ENV, verifying_key_text);
        std::env::set_var(OG_MANIFEST_KEY_ID_ENV, "provider-release-env");

        write_og_managed_manifest(&root, "game-1", "Game", "1.0.0").unwrap();
        let manifest = read_og_managed_manifest(&root).unwrap();

        assert_eq!(
            manifest.manifest_key_id.as_deref(),
            Some("provider-release-env")
        );
        assert!(manifest_has_signature(&manifest));
        assert_eq!(
            og_managed_manifest_trust_status(Some(&root), Some(&manifest)),
            OgManifestTrustStatus::Signed
        );

        std::env::remove_var(OG_MANIFEST_SIGNING_KEY_ENV);
        std::env::remove_var(OG_MANIFEST_VERIFYING_KEY_ENV);
        std::env::remove_var(OG_MANIFEST_KEY_ID_ENV);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn parses_manifest_verifying_keys_from_base64url_and_hex() {
        let signing_key = SigningKey::from_bytes(&[11; 32]);
        let verifying_key = signing_key.verifying_key();
        let key_bytes = verifying_key.to_bytes();
        let base64_key = URL_SAFE_NO_PAD.encode(key_bytes);
        let hex_key = key_bytes
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();

        assert_eq!(
            parse_verifying_key(&base64_key).unwrap().to_bytes(),
            key_bytes
        );
        assert_eq!(parse_verifying_key(&hex_key).unwrap().to_bytes(), key_bytes);
    }

    #[test]
    fn upserts_achievement_provider_status_by_source() {
        let mut game = installed_game(
            "game-1",
            "Game".to_string(),
            "steam".to_string(),
            None,
            None,
        );
        game.achievement_provider_statuses
            .push(AchievementProviderStatus {
                source: "steam".to_string(),
                status: "failed".to_string(),
                stability: "official".to_string(),
                message: "previous failure".to_string(),
            });
        game.achievement_provider_statuses
            .push(AchievementProviderStatus {
                source: "xbox".to_string(),
                status: "available".to_string(),
                stability: "official".to_string(),
                message: "xbox synced".to_string(),
            });

        upsert_achievement_provider_status(
            &mut game,
            AchievementProviderStatus {
                source: "steam".to_string(),
                status: "available".to_string(),
                stability: "official".to_string(),
                message: "steam synced".to_string(),
            },
        );

        assert_eq!(game.achievement_provider_statuses.len(), 2);
        assert!(game.achievement_provider_statuses.iter().any(|status| {
            status.source == "steam"
                && status.status == "available"
                && status.message == "steam synced"
        }));
        assert!(game.achievement_provider_statuses.iter().any(|status| {
            status.source == "xbox"
                && status.status == "available"
                && status.message == "xbox synced"
        }));
    }

    #[test]
    fn cache_only_library_list_returns_empty_on_cache_miss() {
        let games = list_installed_games_from_cache(|| None);

        assert!(games.is_empty());
    }

    #[test]
    fn installed_game_does_not_seed_unverified_catalog_metadata() {
        let game = installed_game(
            "manual-game",
            "Unknown Game".to_string(),
            "manual".to_string(),
            None,
            None,
        );

        assert!(game.description.is_empty());
        assert!(game.version.is_empty());
        assert!(game.genres.is_empty());
        assert!(game.features.is_empty());
        assert!(game.developer.is_none());
        assert!(game.publisher.is_none());
        assert!(game.release_date.is_none());
        assert!(game.rating.is_none());
    }

    #[test]
    fn cached_game_repair_removes_legacy_placeholder_metadata_and_mtime_activity() {
        let mut game = installed_game(
            "epic-game",
            "Game".to_string(),
            "epic".to_string(),
            None,
            None,
        );
        game.description = "A epic game managed by OG Launcher.".to_string();
        game.version = "1.0.0".to_string();
        game.last_played_at = Some("2026-06-01T12:00:00Z".to_string());

        let repaired = repair_cached_game_assets(game);

        assert!(repaired.description.is_empty());
        assert!(repaired.version.is_empty());
        assert!(repaired.last_played_at.is_none());
    }

    #[test]
    fn cached_game_repair_preserves_activity_with_provenance() {
        let mut steam = installed_game(
            "steam-1",
            "Steam Game".to_string(),
            "steam".to_string(),
            None,
            None,
        );
        steam.last_played_at = Some("2026-06-01T12:00:00Z".to_string());
        assert!(repair_cached_game_assets(steam).last_played_at.is_some());

        let mut recorded = installed_game(
            "epic-game",
            "Epic Game".to_string(),
            "epic".to_string(),
            None,
            None,
        );
        recorded.playtime_minutes = Some(12);
        recorded.last_played_at = Some("2026-06-01T12:00:00Z".to_string());
        assert!(repair_cached_game_assets(recorded).last_played_at.is_some());
    }

    #[test]
    fn merge_cached_game_activity_drops_unproven_directory_timestamp() {
        let mut scanned_game =
            installed_game("game-1", "Game".to_string(), "epic".to_string(), None, None);
        let mut cached_game = scanned_game.clone();
        cached_game.last_played_at = Some("2026-06-01T12:00:00Z".to_string());

        merge_cached_game_activity(&mut scanned_game, &cached_game);

        assert!(scanned_game.last_played_at.is_none());

        cached_game.playtime_minutes = Some(12);
        merge_cached_game_activity(&mut scanned_game, &cached_game);
        assert_eq!(
            scanned_game.last_played_at.as_deref(),
            Some("2026-06-01T12:00:00Z")
        );
    }

    #[test]
    fn merge_cached_game_activity_preserves_achievement_provider_statuses() {
        let mut scanned_game = installed_game(
            "game-1",
            "Game".to_string(),
            "steam".to_string(),
            None,
            None,
        );
        let mut cached_game = installed_game(
            "game-1",
            "Game".to_string(),
            "steam".to_string(),
            None,
            None,
        );
        cached_game
            .achievement_provider_statuses
            .push(AchievementProviderStatus {
                source: "steam".to_string(),
                status: "available".to_string(),
                stability: "official".to_string(),
                message: "steam synced".to_string(),
            });

        merge_cached_game_activity(&mut scanned_game, &cached_game);

        assert_eq!(scanned_game.achievement_provider_statuses.len(), 1);
        assert_eq!(
            scanned_game.achievement_provider_statuses[0].message,
            "steam synced"
        );
    }

    #[test]
    fn merge_cached_game_activity_keeps_fresh_provider_statuses() {
        let mut scanned_game = installed_game(
            "game-1",
            "Game".to_string(),
            "steam".to_string(),
            None,
            None,
        );
        scanned_game
            .achievement_provider_statuses
            .push(AchievementProviderStatus {
                source: "steam".to_string(),
                status: "failed".to_string(),
                stability: "official".to_string(),
                message: "fresh failure".to_string(),
            });
        let mut cached_game = installed_game(
            "game-1",
            "Game".to_string(),
            "steam".to_string(),
            None,
            None,
        );
        cached_game
            .achievement_provider_statuses
            .push(AchievementProviderStatus {
                source: "steam".to_string(),
                status: "available".to_string(),
                stability: "official".to_string(),
                message: "cached success".to_string(),
            });

        merge_cached_game_activity(&mut scanned_game, &cached_game);

        assert_eq!(scanned_game.achievement_provider_statuses.len(), 1);
        assert_eq!(
            scanned_game.achievement_provider_statuses[0].message,
            "fresh failure"
        );
    }

    #[test]
    fn parses_local_achievement_cache_array() {
        let value = serde_json::json!([
            {
                "id": "ACH_WIN",
                "displayName": "Winner",
                "description": "Win once",
                "unlocked": true,
                "rarity": "12.5%"
            },
            {
                "key": "ACH_LOCKED",
                "title": "Locked",
                "desc": "Not yet"
            }
        ]);

        let achievements = parse_local_achievement_cache(&value, "epic").unwrap();

        assert_eq!(achievements.len(), 2);
        assert_eq!(achievements[0].id, "ACH_WIN");
        assert_eq!(achievements[0].name, "Winner");
        assert_eq!(achievements[0].description.as_deref(), Some("Win once"));
        assert!(achievements[0].unlocked_at.is_some());
        assert_eq!(achievements[0].rarity, Some(12.5));
        assert_eq!(achievements[0].source.as_deref(), Some("epic"));
        assert_eq!(
            achievements[0].provider_confidence.as_deref(),
            Some("unofficial")
        );
        assert_eq!(achievements[1].id, "ACH_LOCKED");
        assert!(achievements[1].unlocked_at.is_none());
    }

    #[test]
    fn parses_local_achievement_cache_object() {
        let value = serde_json::json!({
            "achievements": [
                {
                    "achievementId": "first_steps",
                    "name": "First Steps",
                    "unlockTimestamp": 1767225600
                }
            ]
        });

        let achievements = parse_local_achievement_cache(&value, "gog").unwrap();

        assert_eq!(achievements.len(), 1);
        assert_eq!(
            achievements[0].source_achievement_id.as_deref(),
            Some("first_steps")
        );
        assert_eq!(
            achievements[0].unlocked_at.as_deref(),
            Some("2026-01-01T00:00:00Z")
        );
    }

    #[test]
    fn parses_local_achievement_cache_snake_case_aliases() {
        let value = serde_json::json!({
            "items": [
                {
                    "id": "local-id",
                    "display_name": "Snake Case",
                    "localized_description": "Imported by a script",
                    "icon_url": "https://example.test/icon.png",
                    "unlocked_at": "2026-01-04T00:00:00Z",
                    "unlock_percentage": "7.5%",
                    "source": "gog",
                    "source_achievement_id": "snake_case",
                    "provider_confidence": "local"
                }
            ]
        });

        let achievements = parse_local_achievement_cache(&value, "gog").unwrap();

        assert_eq!(achievements.len(), 1);
        assert_eq!(achievements[0].name, "Snake Case");
        assert_eq!(
            achievements[0].description.as_deref(),
            Some("Imported by a script")
        );
        assert_eq!(
            achievements[0].icon_url.as_deref(),
            Some("https://example.test/icon.png")
        );
        assert_eq!(
            achievements[0].unlocked_at.as_deref(),
            Some("2026-01-04T00:00:00Z")
        );
        assert_eq!(achievements[0].rarity, Some(7.5));
        assert_eq!(
            achievements[0].source_achievement_id.as_deref(),
            Some("snake_case")
        );
        assert_eq!(
            achievements[0].provider_confidence.as_deref(),
            Some("local")
        );
    }

    #[test]
    fn parses_local_gog_galaxy_achievement_aliases() {
        let value = serde_json::json!({
            "items": [
                {
                    "achievement_id": "48497841707623054",
                    "achievement_key": "ACHIEVEMENT_NODEATH1",
                    "name": "Early Bird",
                    "description": "Complete level 1 without dying",
                    "image_url_unlocked": "https://images.gog.com/unlocked.jpg",
                    "image_url_locked": "https://images.gog.com/locked.jpg",
                    "date_unlocked": "2026-06-07T01:10:00+00:00",
                    "provider_confidence": "local"
                }
            ]
        });

        let achievements = parse_local_achievement_cache(&value, "gog").unwrap();

        assert_eq!(achievements.len(), 1);
        assert_eq!(achievements[0].id, "ACHIEVEMENT_NODEATH1");
        assert_eq!(
            achievements[0].source_achievement_id.as_deref(),
            Some("ACHIEVEMENT_NODEATH1")
        );
        assert_eq!(
            achievements[0].unlocked_at.as_deref(),
            Some("2026-06-07T01:10:00+00:00")
        );
        assert_eq!(
            achievements[0].icon_url.as_deref(),
            Some("https://images.gog.com/unlocked.jpg")
        );
    }

    #[test]
    fn parses_local_achievement_cache_map_format() {
        let value = serde_json::json!({
            "ACH_WIN": {
                "displayName": "Winner",
                "description": "Win once",
                "unlocked": true
            },
            "ACH_LOCKED": {
                "title": "Locked",
                "desc": "Not yet"
            }
        });

        let achievements = parse_local_achievement_cache(&value, "ubisoft").unwrap();

        assert_eq!(achievements.len(), 2);
        assert!(achievements.iter().any(|achievement| {
            achievement.id == "ACH_WIN"
                && achievement.source_achievement_id.as_deref() == Some("ACH_WIN")
                && achievement.unlocked_at.is_some()
        }));
        assert!(achievements.iter().any(|achievement| {
            achievement.id == "ACH_LOCKED"
                && achievement.name == "Locked"
                && achievement.unlocked_at.is_none()
        }));
    }

    #[test]
    fn parses_nested_local_achievement_cache_map_format() {
        let value = serde_json::json!({
            "achievements": {
                "story_start": {
                    "name": "Story Start",
                    "provider_confidence": "local"
                }
            }
        });

        let achievements = parse_local_achievement_cache(&value, "ea").unwrap();

        assert_eq!(achievements.len(), 1);
        assert_eq!(achievements[0].id, "story_start");
        assert_eq!(
            achievements[0].source_achievement_id.as_deref(),
            Some("story_start")
        );
        assert_eq!(
            achievements[0].provider_confidence.as_deref(),
            Some("local")
        );
    }

    #[test]
    fn parses_local_ea_stats_achievement_cache() {
        let value = serde_json::json!({
            "achievementStats": {
                "items": [
                    {
                        "statName": "EA_WIN_01",
                        "displayTitle": "Club Legend",
                        "summary": "Win a season match.",
                        "badgeUrl": "https://ea.example.test/badge.png",
                        "earnedAt": "2026-06-08T18:00:00Z",
                        "percentComplete": "100",
                        "provider_confidence": "local"
                    }
                ]
            }
        });

        let achievements = parse_local_achievement_cache(&value, "ea").unwrap();

        assert_eq!(achievements.len(), 1);
        assert_eq!(achievements[0].id, "EA_WIN_01");
        assert_eq!(achievements[0].name, "Club Legend");
        assert_eq!(
            achievements[0].description.as_deref(),
            Some("Win a season match.")
        );
        assert_eq!(
            achievements[0].icon_url.as_deref(),
            Some("https://ea.example.test/badge.png")
        );
        assert_eq!(
            achievements[0].unlocked_at.as_deref(),
            Some("2026-06-08T18:00:00Z")
        );
        assert_eq!(achievements[0].rarity, Some(100.0));
        assert_eq!(achievements[0].source.as_deref(), Some("ea"));
    }

    #[test]
    fn skips_plain_ea_playtime_stats_cache_rows() {
        let value = serde_json::json!({
            "stats": {
                "items": [
                    {
                        "statId": "minutesPlayed",
                        "displayText": "Minutes Played",
                        "value": 120,
                        "unit": "minutes"
                    }
                ]
            }
        });

        let achievements = parse_local_achievement_cache(&value, "ea").unwrap();

        assert!(achievements.is_empty());
    }

    #[test]
    fn parses_local_ubisoft_challenge_cache() {
        let value = serde_json::json!({
            "challenges": [
                {
                    "challengeId": "ubi_story_01",
                    "localizedTitle": "Welcome to DedSec",
                    "displayDescription": "Complete the opening operation.",
                    "thumbnailUrl": "https://ubisoft.example.test/challenge.png",
                    "completionState": "GRANTED",
                    "completedAt": "2026-06-08T19:00:00Z",
                    "providerConfidence": "local"
                }
            ]
        });

        let achievements = parse_local_achievement_cache(&value, "ubisoft").unwrap();

        assert_eq!(achievements.len(), 1);
        assert_eq!(achievements[0].id, "ubi_story_01");
        assert_eq!(achievements[0].name, "Welcome to DedSec");
        assert_eq!(
            achievements[0].description.as_deref(),
            Some("Complete the opening operation.")
        );
        assert_eq!(
            achievements[0].unlocked_at.as_deref(),
            Some("2026-06-08T19:00:00Z")
        );
        assert_eq!(achievements[0].source.as_deref(), Some("ubisoft"));
    }

    #[test]
    fn parses_local_battlenet_criteria_cache() {
        let value = serde_json::json!({
            "progress": {
                "criteria": [
                    {
                        "criteriaId": "bn_raid_clear",
                        "label": "Raid Night",
                        "details": "Clear a raid wing.",
                        "state": "DONE",
                        "updatedAt": "2026-06-08T20:00:00Z",
                        "progressPercent": "100",
                        "provider_confidence": "local"
                    }
                ]
            }
        });

        let achievements = parse_local_achievement_cache(&value, "battlenet").unwrap();

        assert_eq!(achievements.len(), 1);
        assert_eq!(achievements[0].id, "bn_raid_clear");
        assert_eq!(achievements[0].name, "Raid Night");
        assert_eq!(
            achievements[0].description.as_deref(),
            Some("Clear a raid wing.")
        );
        assert!(achievements[0].unlocked_at.is_some());
        assert_eq!(achievements[0].rarity, Some(100.0));
        assert_eq!(achievements[0].source.as_deref(), Some("battlenet"));
    }

    #[test]
    fn updated_at_does_not_unlock_a_locked_achievement() {
        let value = serde_json::json!({
            "achievements": [{
                "id": "still_locked",
                "name": "Still Locked",
                "unlocked": false,
                "updatedAt": "2026-06-08T20:00:00Z"
            }]
        });

        let achievements = parse_local_achievement_cache(&value, "battlenet").unwrap();

        assert_eq!(achievements.len(), 1);
        assert!(achievements[0].unlocked_at.is_none());
    }

    #[test]
    fn steam_owned_achievement_sync_uses_the_frontend_fallback_without_native_persistence() {
        let fallback = installed_game(
            "steam-owned-10",
            "Counter-Strike".to_string(),
            "steam".to_string(),
            None,
            None,
        );

        let (game, should_persist) =
            resolve_achievement_sync_game("steam-owned-10", Ok(Vec::new()), Some(fallback))
                .unwrap();

        assert_eq!(game.id, "steam-owned-10");
        assert!(!should_persist);
    }

    #[test]
    fn epic_owned_achievement_sync_does_not_hide_native_cache_read_errors() {
        let fallback = installed_game(
            "epic-owned-catalog-app",
            "Epic Account Game".to_string(),
            "epic".to_string(),
            None,
            None,
        );

        let error = resolve_achievement_sync_game(
            "epic-owned-catalog-app",
            Err("native cache unavailable".to_string()),
            Some(fallback),
        )
        .unwrap_err();

        assert_eq!(error, "native cache unavailable");
    }

    #[test]
    fn epic_owned_achievement_sync_rejects_a_cross_provider_fallback() {
        let fallback = installed_game(
            "epic-owned-catalog-app",
            "Cross-provider Account Game".to_string(),
            "gog".to_string(),
            None,
            None,
        );

        let error =
            resolve_achievement_sync_game("epic-owned-catalog-app", Ok(Vec::new()), Some(fallback))
                .unwrap_err();

        assert!(error.contains("does not match provider 'epic'"));
    }

    #[test]
    fn steam_achievement_sync_prefers_the_native_cache_when_present() {
        let cached = installed_game(
            "steam-10",
            "Cached Counter-Strike".to_string(),
            "steam".to_string(),
            None,
            None,
        );
        let fallback = installed_game(
            "steam-10",
            "Fallback Counter-Strike".to_string(),
            "steam".to_string(),
            None,
            None,
        );

        let (game, should_persist) =
            resolve_achievement_sync_game("steam-10", Ok(vec![cached]), Some(fallback)).unwrap();

        assert_eq!(game.title, "Cached Counter-Strike");
        assert!(should_persist);
    }

    #[test]
    fn parses_unix_achievement_timestamps_in_seconds_and_milliseconds() {
        let value = serde_json::json!({
            "achievements": [
                { "id": "seconds", "unlockTime": 1767225600 },
                { "id": "milliseconds", "unlockTime": 1767225600000_i64 }
            ]
        });

        let achievements = parse_local_achievement_cache(&value, "epic").unwrap();

        assert_eq!(achievements.len(), 2);
        assert_eq!(
            achievements[0].unlocked_at.as_deref(),
            Some("2026-01-01T00:00:00Z")
        );
        assert_eq!(achievements[1].unlocked_at, achievements[0].unlocked_at);
    }

    #[test]
    fn invalid_achievement_dates_do_not_unlock() {
        let value = serde_json::json!({
            "achievements": [
                { "id": "invalid-text", "unlockTime": "not-a-date" },
                { "id": "invalid-number", "unlockTime": 999999999999999999_u64 }
            ]
        });

        let achievements = parse_local_achievement_cache(&value, "epic").unwrap();

        assert_eq!(achievements.len(), 2);
        assert!(achievements
            .iter()
            .all(|achievement| achievement.unlocked_at.is_none()));
    }

    #[test]
    fn parses_nested_epic_local_achievement_status_items() {
        let value = serde_json::json!({
            "metadata": {
                "achievementStatus": {
                    "items": [
                        {
                            "achievementName": "A_HOUSE_DIVIDED",
                            "displayName": "A House Divided",
                            "isUnlocked": true,
                            "unlockTime": 1767225600
                        }
                    ]
                }
            }
        });

        let achievements = parse_local_achievement_cache(&value, "epic").unwrap();

        assert_eq!(achievements.len(), 1);
        assert_eq!(achievements[0].id, "A_HOUSE_DIVIDED");
        assert_eq!(
            achievements[0].source_achievement_id.as_deref(),
            Some("A_HOUSE_DIVIDED")
        );
        assert_eq!(
            achievements[0].unlocked_at.as_deref(),
            Some("2026-01-01T00:00:00Z")
        );
    }

    #[test]
    fn local_achievement_candidates_include_install_sidecars() {
        let mut game = installed_game(
            "epic-game-1",
            "Epic Game".to_string(),
            "epic".to_string(),
            Some(r"C:\Games\Epic Game".to_string()),
            None,
        );
        game.external_id = Some("epic-app".to_string());

        let candidates = local_achievement_cache_candidates("epic", &game);

        assert!(candidates
            .iter()
            .any(|path| normalized_path_text(path)
                .ends_with("C:/Games/Epic Game/og-achievements.json")));
        assert!(candidates.iter().any(|path| normalized_path_text(path)
            .ends_with("C:/Games/Epic Game/epic-achievements.json")));
        assert!(candidates.iter().any(|path| normalized_path_text(path)
            .ends_with("C:/Games/Epic Game/.og-launcher/achievements.json")));
        assert!(candidates.iter().any(|path| path
            .ends_with("achievement-cache\\epic\\epic-app.json")
            || path.ends_with("achievement-cache/epic/epic-app.json")));
    }

    #[test]
    fn local_achievement_candidates_include_client_cache_roots() {
        let mut game = installed_game(
            "ea-owned-offer-123",
            "EA Test Game".to_string(),
            "EA App".to_string(),
            None,
            None,
        );
        game.launcher = "ea".to_string();
        game.external_id = Some("offer-123".to_string());

        let candidates = local_achievement_cache_candidates("ea", &game);

        assert!(candidates.iter().any(|path| {
            let text = path.to_string_lossy();
            text.contains("client-cache\\ea\\offer-123.json")
                || text.contains("client-cache/ea/offer-123.json")
        }));
    }

    #[test]
    fn local_achievement_client_cache_roots_cover_unofficial_providers() {
        for provider in ["ubisoft", "battlenet", "gog", "epic"] {
            let provider_roots = local_achievement_client_cache_roots(provider);
            assert!(provider_roots.iter().any(|path| {
                let text = normalized_path_text(path);
                text.contains(&format!("client-cache/{provider}"))
            }));
        }

        let mut roots = Vec::new();
        push_provider_achievement_client_cache_roots(
            &mut roots,
            "ea",
            Some(PathBuf::from("C:/Users/Test/AppData/Local")),
            Some(PathBuf::from("C:/ProgramData")),
            Some(PathBuf::from("C:/Users/Test/AppData/Roaming")),
        );
        assert!(roots
            .iter()
            .any(|path| path.to_string_lossy().contains("EA Desktop")));

        roots.clear();
        push_provider_achievement_client_cache_roots(
            &mut roots,
            "ubisoft",
            Some(PathBuf::from("C:/Users/Test/AppData/Local")),
            Some(PathBuf::from("C:/ProgramData")),
            None,
        );
        assert!(roots
            .iter()
            .any(|path| path.to_string_lossy().contains("Ubisoft Game Launcher")));

        roots.clear();
        push_provider_achievement_client_cache_roots(
            &mut roots,
            "battlenet",
            Some(PathBuf::from("C:/Users/Test/AppData/Local")),
            Some(PathBuf::from("C:/ProgramData")),
            Some(PathBuf::from("C:/Users/Test/AppData/Roaming")),
        );
        assert!(roots
            .iter()
            .any(|path| path.to_string_lossy().contains("Battle.net")));

        roots.clear();
        push_provider_achievement_client_cache_roots(
            &mut roots,
            "gog",
            Some(PathBuf::from("C:/Users/Test/AppData/Local")),
            Some(PathBuf::from("C:/ProgramData")),
            None,
        );
        assert!(roots
            .iter()
            .any(|path| path.to_string_lossy().contains("Galaxy")));

        roots.clear();
        push_provider_achievement_client_cache_roots(
            &mut roots,
            "epic",
            Some(PathBuf::from("C:/Users/Test/AppData/Local")),
            Some(PathBuf::from("C:/ProgramData")),
            None,
        );
        assert!(roots
            .iter()
            .any(|path| path.to_string_lossy().contains("EpicGamesLauncher")));
    }

    #[test]
    fn discovers_bounded_client_cache_json_candidates() {
        let root = std::env::temp_dir().join(format!(
            "ogl-achievement-cache-test-{}",
            current_unix_timestamp()
        ));
        let game_dir = root.join("offer-123").join("nested");
        fs::create_dir_all(&game_dir).unwrap();
        fs::write(game_dir.join("achievements.json"), "{}").unwrap();
        fs::write(game_dir.join("notes.txt"), "{}").unwrap();
        fs::write(root.join("unrelated.json"), "{}").unwrap();

        let mut candidates = Vec::new();
        discover_local_achievement_cache_files(
            &root,
            &["offer-123".to_string(), "EA Test Game".to_string()],
            &mut candidates,
        );

        assert!(candidates
            .iter()
            .any(|path| path.ends_with("achievements.json")));
        assert!(!candidates.iter().any(|path| path.ends_with("notes.txt")));
        assert!(!candidates
            .iter()
            .any(|path| path.ends_with("unrelated.json")));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn discovers_stats_subdirectory_client_cache_candidates() {
        let root = std::env::temp_dir().join(format!(
            "ogl-achievement-stats-cache-test-{}",
            current_unix_timestamp()
        ));
        let stats_dir = root.join("stats");
        fs::create_dir_all(&stats_dir).unwrap();
        fs::write(stats_dir.join("wow.json"), "{}").unwrap();

        let mut candidates = Vec::new();
        discover_local_achievement_cache_files(&root, &["wow".to_string()], &mut candidates);

        assert!(candidates
            .iter()
            .any(|path| { normalized_path_text(path).ends_with("stats/wow.json") }));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn discovered_client_cache_candidates_skip_large_files() {
        let root = std::env::temp_dir().join(format!(
            "ogl-achievement-cache-large-test-{}",
            current_unix_timestamp()
        ));
        fs::create_dir_all(&root).unwrap();
        fs::write(
            root.join("offer-123-achievements.json"),
            vec![b' '; (ACHIEVEMENT_CLIENT_CACHE_MAX_FILE_BYTES + 1) as usize],
        )
        .unwrap();

        let mut candidates = Vec::new();
        discover_local_achievement_cache_files(&root, &["offer-123".to_string()], &mut candidates);

        assert!(candidates.is_empty());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn local_achievement_candidate_summary_handles_empty_candidates() {
        assert_eq!(
            local_achievement_candidate_summary(&[]),
            "no candidate paths could be built"
        );
    }

    #[test]
    fn local_achievement_candidate_summary_limits_long_lists() {
        let candidates = (0..10)
            .map(|index| PathBuf::from(format!("candidate-{index}.json")))
            .collect::<Vec<_>>();

        let summary = local_achievement_candidate_summary(&candidates);

        assert!(summary.contains("candidate-0.json"));
        assert!(summary.contains("candidate-7.json"));
        assert!(!summary.contains("candidate-8.json"));
        assert!(summary.ends_with("+2 more"));
    }

    #[test]
    fn epic_slug_candidates_use_slug_external_id_and_title() {
        let mut game = installed_game(
            "epic-owned-legendary-app",
            "Mass Effect Legendary Edition".to_string(),
            "epic".to_string(),
            None,
            None,
        );
        game.slug = "mass-effect-legendary-edition".to_string();
        game.external_id = Some("legendary-app".to_string());

        let candidates = epic_achievement_slug_candidates(&game);

        assert_eq!(
            candidates,
            vec![
                "mass-effect-legendary-edition".to_string(),
                "legendary-app".to_string()
            ]
        );
    }

    #[test]
    fn parses_epic_public_achievement_html() {
        let html = r#"
            <html><body>
              <h1>Achievements</h1>
              <img alt="Achievement icon" />
              <div>A House Divided</div>
              <div>ME2: Hack a geth collective</div>
              <div>10 XP</div>
              <div>28% of players unlock</div>
              <div>A Personal Touch</div>
              <div>ME3: Modify a weapon.</div>
              <div>10 XP</div>
              <div>31% of players unlock</div>
            </body></html>
        "#;

        let achievements = parse_epic_public_achievement_html(html);

        assert_eq!(achievements.len(), 2);
        assert_eq!(achievements[0].id, "a-house-divided");
        assert_eq!(achievements[0].name, "A House Divided");
        assert_eq!(
            achievements[0].description.as_deref(),
            Some("ME2: Hack a geth collective")
        );
        assert_eq!(achievements[0].rarity, Some(28.0));
        assert_eq!(achievements[0].source.as_deref(), Some("epic"));
        assert!(achievements[0].unlocked_at.is_none());
    }

    #[test]
    fn epic_public_cache_payload_roundtrips_through_local_parser() {
        let achievements = parse_epic_public_achievement_html(
            r#"
            <div>A House Divided</div>
            <div>ME2: Hack a geth collective</div>
            <div>10 XP</div>
            <div>28% of players unlock</div>
        "#,
        );
        let payload = serde_json::json!({
            "source": "epic-public",
            "gameId": "epic-game",
            "achievements": achievements,
        });

        let parsed = parse_local_achievement_cache(&payload, "epic").unwrap();

        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].id, "a-house-divided");
        assert_eq!(parsed[0].rarity, Some(28.0));
        assert_eq!(parsed[0].provider_confidence.as_deref(), Some("unofficial"));
    }

    #[test]
    fn epic_definition_overlay_preserves_local_unlocks() {
        let definitions = vec![UnifiedAchievement {
            id: "epic-a-house-divided".to_string(),
            name: "A House Divided".to_string(),
            description: Some("Hack a geth collective".to_string()),
            icon_url: None,
            unlocked_at: None,
            rarity: Some(28.0),
            source: Some("epic".to_string()),
            source_achievement_id: Some("A_HOUSE_DIVIDED".to_string()),
            provider_confidence: Some("unofficial".to_string()),
        }];
        let local_unlocks = vec![UnifiedAchievement {
            id: "A_HOUSE_DIVIDED".to_string(),
            name: "A House Divided".to_string(),
            description: None,
            icon_url: None,
            unlocked_at: Some("2026-01-01T00:00:00Z".to_string()),
            rarity: None,
            source: Some("epic".to_string()),
            source_achievement_id: Some("A_HOUSE_DIVIDED".to_string()),
            provider_confidence: Some("local".to_string()),
        }];

        let merged = preserve_known_unlocks(definitions, &local_unlocks);

        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].id, "epic-a-house-divided");
        assert_eq!(
            merged[0].unlocked_at.as_deref(),
            Some("2026-01-01T00:00:00Z")
        );
        assert_eq!(merged[0].rarity, Some(28.0));
    }

    #[test]
    fn gog_definition_overlay_preserves_local_unlocks() {
        let definitions = vec![UnifiedAchievement {
            id: "gog-ACHIEVEMENT_NODEATH1".to_string(),
            name: "Early Bird".to_string(),
            description: Some("Complete level 1 without dying".to_string()),
            icon_url: Some("https://images.gog.com/locked.jpg".to_string()),
            unlocked_at: None,
            rarity: None,
            source: Some("gog".to_string()),
            source_achievement_id: Some("ACHIEVEMENT_NODEATH1".to_string()),
            provider_confidence: Some("official".to_string()),
        }];
        let local_unlocks = vec![UnifiedAchievement {
            id: "ACHIEVEMENT_NODEATH1".to_string(),
            name: "Early Bird".to_string(),
            description: None,
            icon_url: Some("https://images.gog.com/unlocked.jpg".to_string()),
            unlocked_at: Some("2026-06-07T01:10:00+00:00".to_string()),
            rarity: None,
            source: Some("gog".to_string()),
            source_achievement_id: Some("ACHIEVEMENT_NODEATH1".to_string()),
            provider_confidence: Some("local".to_string()),
        }];

        let merged = preserve_known_unlocks(definitions, &local_unlocks);

        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].id, "gog-ACHIEVEMENT_NODEATH1");
        assert_eq!(merged[0].name, "Early Bird");
        assert_eq!(
            merged[0].unlocked_at.as_deref(),
            Some("2026-06-07T01:10:00+00:00")
        );
        assert_eq!(merged[0].provider_confidence.as_deref(), Some("official"));
    }

    #[test]
    fn preserve_known_unlocks_matches_source_achievement_id() {
        let previous = vec![UnifiedAchievement {
            id: "old-public-id".to_string(),
            name: "Collector".to_string(),
            description: None,
            icon_url: None,
            unlocked_at: Some("2026-01-02T00:00:00Z".to_string()),
            rarity: None,
            source: Some("epic".to_string()),
            source_achievement_id: Some("collector".to_string()),
            provider_confidence: Some("unofficial".to_string()),
        }];
        let new = vec![UnifiedAchievement {
            id: "new-local-id".to_string(),
            name: "Collector".to_string(),
            description: None,
            icon_url: None,
            unlocked_at: None,
            rarity: Some(12.0),
            source: Some("epic".to_string()),
            source_achievement_id: Some("collector".to_string()),
            provider_confidence: Some("unofficial".to_string()),
        }];

        let merged = preserve_known_unlocks(new, &previous);

        assert_eq!(merged.len(), 1);
        assert_eq!(
            merged[0].unlocked_at.as_deref(),
            Some("2026-01-02T00:00:00Z")
        );
        assert_eq!(merged[0].id, "new-local-id");
    }

    #[test]
    fn preserve_known_unlocks_keeps_missing_previous_only_once() {
        let previous = vec![UnifiedAchievement {
            id: "same-id".to_string(),
            name: "Story".to_string(),
            description: None,
            icon_url: None,
            unlocked_at: Some("2026-01-03T00:00:00Z".to_string()),
            rarity: None,
            source: Some("gog".to_string()),
            source_achievement_id: Some("story".to_string()),
            provider_confidence: Some("unofficial".to_string()),
        }];
        let new = vec![UnifiedAchievement {
            id: "other-id".to_string(),
            name: "Story".to_string(),
            description: None,
            icon_url: None,
            unlocked_at: None,
            rarity: None,
            source: Some("gog".to_string()),
            source_achievement_id: Some("story".to_string()),
            provider_confidence: Some("unofficial".to_string()),
        }];

        let merged = preserve_known_unlocks(new, &previous);

        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].id, "other-id");
        assert_eq!(
            merged[0].unlocked_at.as_deref(),
            Some("2026-01-03T00:00:00Z")
        );
    }
}
