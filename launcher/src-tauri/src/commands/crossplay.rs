use std::process::Command;
use serde::{Deserialize, Serialize};

#[tauri::command]
pub fn launch_cross_play_join(
    platform: String,
    game_slug: String,
    _friend_user_id: String,
) -> Result<String, String> {
    let uri = match platform.as_str() {
        "steam" => format!("steam://run/{}", game_slug),
        "epic" => format!("com.epicgames.launcher://apps/{}?action=launch", game_slug),
        "gog" => format!("goggalaxy://openGameView/{}", game_slug),
        "xbox" => format!("ms-xbl-38966778-3f57-4f6e-a6e9-3b81c79fbb3f://launch/{}", game_slug),
        "battlenet" => format!("battlenet://{}", game_slug),
        "origin" | "ea" => format!("origin2://game/launch?offerIds={}", game_slug),
        "uplay" | "ubisoft" => format!("uplay://launch/{}", game_slug),
        "playstation" => format!("psjoin://{}", game_slug),
        "switch" => format!("switchgame://{}", game_slug),
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
