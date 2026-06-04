use std::process::Command;

use crate::commands::games::core::read_installed_games_cache;

fn is_uuid(value: &str) -> bool {
    value.len() == 36
        && value.chars().enumerate().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
        })
}

/// Resolve a game UUID into a platform-specific external ID (Steam AppID, Epic slug, etc.)
/// by looking it up in the locally cached installed games list.
#[tauri::command]
pub fn resolve_game_external_id(game_id: String, _platform: String) -> Result<String, String> {
    if !is_uuid(&game_id) {
        // Already a slug / external id → return as-is
        return Ok(game_id);
    }

    let games = read_installed_games_cache().unwrap_or_default();
    for game in games {
        if game.id == game_id {
            if let Some(external) = game.external_id {
                if !external.is_empty() {
                    return Ok(external);
                }
            }
            // No external_id stored → fall back to the game's slug if available
            if !game.slug.is_empty() {
                return Ok(game.slug.clone());
            }
            break;
        }
    }

    // Fallback: return the original id so the caller can still try
    Ok(game_id)
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

    // Resolve UUID → external slug (e.g. Steam AppID)
    let resolved_slug = resolve_game_external_id(game_slug.clone(), platform.clone())?;

    let uri = match platform.as_str() {
        "steam" => format!("steam://run/{}", resolved_slug),
        "epic" => format!(
            "com.epicgames.launcher://apps/{}?action=launch",
            resolved_slug
        ),
        "gog" => format!("goggalaxy://openGameView/{}", resolved_slug),
        "xbox" => format!(
            "ms-xbl-38966778-3f57-4f6e-a6e9-3b81c79fbb3f://launch/{}",
            resolved_slug
        ),
        "battlenet" => format!("battlenet://{}", resolved_slug),
        "origin" | "ea" => format!("origin2://game/launch?offerIds={}", resolved_slug),
        "uplay" | "ubisoft" => format!("uplay://launch/{}", resolved_slug),
        "playstation" => format!("psjoin://{}", resolved_slug),
        "switch" => format!("switchgame://{}", resolved_slug),
        other => return Err(format!("Unsupported platform for smart-join: {other}")),
    };
    open_uri(&uri)?;
    Ok(uri)
}

#[cfg(target_os = "windows")]
fn open_uri(uri: &str) -> Result<(), String> {
    Command::new("cmd")
        .args(["/C", "start", "", uri])
        .spawn()
        .map_err(|e| format!("Could not open URI: {e}"))?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn open_uri(uri: &str) -> Result<(), String> {
    Command::new("open")
        .arg(uri)
        .spawn()
        .map_err(|e| format!("Could not open URI: {e}"))?;
    Ok(())
}

#[cfg(target_os = "linux")]
fn open_uri(uri: &str) -> Result<(), String> {
    Command::new("xdg-open")
        .arg(uri)
        .spawn()
        .map_err(|e| format!("Could not open URI: {e}"))?;
    Ok(())
}
