use crate::commands::games::core::read_installed_games_cache;
use crate::commands::uri_safety::{open_uri_safely, validate_slug, validate_uri_scheme};

fn is_uuid(value: &str) -> bool {
    value.len() == 36
        && value.chars().enumerate().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
        })
}

fn normalized_provider(value: &str) -> String {
    let normalized = value.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "origin" => "ea".to_string(),
        "uplay" => "ubisoft".to_string(),
        _ => normalized,
    }
}

fn providers_match(platform: &str, launcher: &str) -> bool {
    normalized_provider(platform) == normalized_provider(launcher)
}

fn is_internal_wrapper_id(value: &str) -> bool {
    let normalized = value.trim().to_ascii_lowercase();
    [
        "battlenet-owned-",
        "ea-owned-",
        "epic-owned-",
        "gamepass-",
        "gog-owned-",
        "steam-owned-",
        "ubisoft-owned-",
        "xbox-owned-",
    ]
    .iter()
    .any(|prefix| normalized.starts_with(prefix))
}

/// Resolve a game UUID into a platform-specific external ID (Steam AppID, Epic slug, etc.)
/// by looking it up in the locally cached installed games list.
#[tauri::command]
pub fn resolve_game_external_id(game_id: String, platform: String) -> Result<String, String> {
    let games = read_installed_games_cache().unwrap_or_default();
    for game in games {
        if game.id == game_id {
            if !providers_match(&platform, &game.launcher) {
                return Err(format!(
                    "The selected game belongs to {}, not {}.",
                    game.launcher, platform
                ));
            }
            if let Some(external) = game.external_id {
                let trimmed = external.trim();
                if !trimmed.is_empty() {
                    return Ok(trimmed.to_string());
                }
            }
            return Err(format!(
                "{} does not have a {} provider id.",
                game.title, platform
            ));
        }
    }

    if is_uuid(&game_id) || is_internal_wrapper_id(&game_id) {
        return Err(format!(
            "Could not resolve the library game to a {platform} provider id."
        ));
    }

    // The renderer may already have selected the provider external id.
    Ok(game_id)
}

fn build_cross_play_launch_uri(platform: &str, provider_id: &str) -> Result<String, String> {
    let safe_id = validate_slug(provider_id)?;
    let normalized_platform = platform.trim().to_ascii_lowercase();

    if normalized_platform == "steam"
        && !safe_id.chars().all(|character| character.is_ascii_digit())
    {
        return Err("Steam smart-launch requires a numeric AppID.".to_string());
    }

    let uri = match normalized_platform.as_str() {
        "steam" => format!("steam://run/{}", safe_id),
        "epic" => format!("com.epicgames.launcher://apps/{}?action=launch", safe_id),
        "gog" => format!("goggalaxy://openGameView/{}", safe_id),
        "xbox" => format!(
            "ms-xbl-38966778-3f57-4f6e-a6e9-3b81c79fbb3f://launch/{}",
            safe_id
        ),
        "battlenet" => format!("battlenet://{}", safe_id),
        "origin" | "ea" => format!("origin2://game/launch?offerIds={}", safe_id),
        "uplay" | "ubisoft" => format!("uplay://launch/{}", safe_id),
        "playstation" => format!("psjoin://{}", safe_id),
        "switch" => format!("switchgame://{}", safe_id),
        other => return Err(format!("Unsupported platform for smart-launch: {other}")),
    };

    let _ = validate_uri_scheme(&uri)?;
    Ok(uri)
}

#[tauri::command]
pub async fn launch_cross_play_join(
    platform: String,
    game_slug: String,
    install_path: Option<String>,
) -> Result<String, String> {
    // Optional install-path validation: if provided, ensure the game exists locally
    if let Some(path) = install_path {
        if !std::path::Path::new(&path).exists() {
            return Err("Game is not installed at the expected path.".to_string());
        }
    }

    // Resolve a local library id to the provider identity (for example a Steam AppID).
    let provider_id = resolve_game_external_id(game_slug, platform.clone())?;
    let uri = build_cross_play_launch_uri(&platform, &provider_id)?;
    open_uri_safely(&uri)?;
    Ok(uri)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_aliases_match_the_installed_launcher() {
        assert!(providers_match("origin", "ea"));
        assert!(providers_match("uplay", "ubisoft"));
        assert!(providers_match("STEAM", "steam"));
        assert!(!providers_match("steam", "epic"));
    }

    #[test]
    fn internal_wrapper_ids_are_not_provider_id_fallbacks() {
        assert!(is_internal_wrapper_id("steam-owned-480"));
        assert!(is_internal_wrapper_id("EPIC-OWNED-CatalogItem"));
        assert!(!is_internal_wrapper_id("NeonCircuitCatalog"));
    }

    #[test]
    fn launch_uri_uses_the_provider_identity() {
        assert_eq!(
            build_cross_play_launch_uri("steam", "480").unwrap(),
            "steam://run/480"
        );
        assert_eq!(
            build_cross_play_launch_uri("epic", "NeonCircuitCatalog").unwrap(),
            "com.epicgames.launcher://apps/NeonCircuitCatalog?action=launch"
        );
    }

    #[test]
    fn steam_rejects_a_title_slug_instead_of_an_app_id() {
        assert_eq!(
            build_cross_play_launch_uri("steam", "neon-circuit").unwrap_err(),
            "Steam smart-launch requires a numeric AppID."
        );
    }

    #[test]
    fn launch_uri_rejects_unsupported_platforms_and_unsafe_ids() {
        assert!(build_cross_play_launch_uri("unknown", "480").is_err());
        assert!(build_cross_play_launch_uri("epic", "catalog & calc.exe").is_err());
    }
}
