use tauri::AppHandle;

use crate::commands::downloads::history::remove_download_history_item;
use crate::commands::downloads::steam_cef::toggle_steam_download_pause;
use crate::commands::downloads::types::{
    emit_download_progress, emit_download_removed, get_download_manager,
    is_terminal_download_status, DOWNLOAD_STATUS_CANCELLED, DOWNLOAD_STATUS_DOWNLOADING,
    DOWNLOAD_STATUS_PAUSED,
};
use crate::commands::downloads::utils::{
    is_external_tracker_game_id, normalize_game_id, steam_app_id_from_download_id,
};

pub fn pause_download(app: AppHandle, game_id: String) -> Result<(), String> {
    let game_id = normalize_game_id(game_id)?;

    if game_id.starts_with("gog-") {
        return crate::commands::gog::pause_gog_download(app, game_id);
    }
    if let Some(steam_app_id) = steam_app_id_from_download_id(&game_id) {
        return toggle_steam_download_pause(app, &game_id, steam_app_id);
    }
    if is_external_tracker_game_id(&game_id) {
        return Err("This download is controlled by an external launcher.".to_string());
    }

    let map = get_download_manager();
    let mut guard = map
        .lock()
        .map_err(|error| format!("Download manager lock poisoned: {error}"))?;
    if let Some(dl) = guard.get_mut(&game_id) {
        if dl.status == DOWNLOAD_STATUS_DOWNLOADING {
            dl.paused = true;
            dl.status = DOWNLOAD_STATUS_PAUSED.to_string();
            dl.speed = "Paused".to_string();
            let _ = dl.pause_tx.send(true);
            println!("[open-game-launcher] Paused download for {game_id}");
            emit_download_progress(&app, &game_id, dl.progress, &dl.speed, &dl.status, dl.eta);
        } else if dl.status == DOWNLOAD_STATUS_PAUSED {
            dl.paused = false;
            dl.status = DOWNLOAD_STATUS_DOWNLOADING.to_string();
            dl.speed = "Connecting...".to_string();
            let _ = dl.pause_tx.send(false);
            println!("[open-game-launcher] Resumed download for {game_id}");
            emit_download_progress(&app, &game_id, dl.progress, &dl.speed, &dl.status, dl.eta);
        }
    }
    Ok(())
}

pub fn cancel_download(app: AppHandle, game_id: String) -> Result<(), String> {
    let game_id = normalize_game_id(game_id)?;

    if game_id.starts_with("gog-") {
        return crate::commands::gog::cancel_gog_download(app, game_id);
    }
    if is_external_tracker_game_id(&game_id) {
        return Err(
            "This download is controlled by an external launcher. Remove it from the queue instead."
                .to_string(),
        );
    }

    let map = get_download_manager();
    let mut guard = map
        .lock()
        .map_err(|error| format!("Download manager lock poisoned: {error}"))?;
    if let Some(dl) = guard.get_mut(&game_id) {
        dl.cancelled = true;
        dl.status = DOWNLOAD_STATUS_CANCELLED.to_string();
        let _ = dl.cancel_tx.send(true);
        println!("[open-game-launcher] Cancelled download for {game_id}");
        emit_download_progress(
            &app,
            &game_id,
            dl.progress,
            "Cancelled",
            DOWNLOAD_STATUS_CANCELLED,
            0,
        );
    }
    guard.remove(&game_id);
    Ok(())
}

pub async fn archive_download(app: AppHandle, game_id: String) -> Result<(), String> {
    let game_id = normalize_game_id(game_id)?;
    let archived_game_id = game_id.clone();

    tauri::async_runtime::spawn_blocking(move || {
        remove_download_history_item(&archived_game_id);

        let map = get_download_manager();
        let mut guard = map
            .lock()
            .map_err(|error| format!("Download manager lock poisoned: {error}"))?;
        let should_remove = guard.get(&archived_game_id).is_some_and(|download| {
            download.external || is_terminal_download_status(&download.status)
        });
        if should_remove {
            guard.remove(&archived_game_id);
        }

        Ok::<(), String>(())
    })
    .await
    .map_err(|error| format!("Archive task failed: {error}"))??;

    emit_download_removed(&app, &game_id);

    Ok(())
}
