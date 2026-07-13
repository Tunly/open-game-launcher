use tauri::AppHandle;

use crate::commands::downloads::history::remove_download_history_item;
use crate::commands::downloads::steam_cef::toggle_steam_download_pause;
use crate::commands::downloads::types::{
    emit_download_payload, emit_download_removed, get_download_manager,
    is_terminal_download_status, request_download_cancellation, toggle_download_pause,
    DownloadCancellationTransition, DOWNLOAD_STATUS_INSTALLING, DOWNLOAD_STATUS_PAUSED,
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

    let Some(payload) = toggle_download_pause(&game_id)? else {
        return Ok(());
    };
    let action = if payload.status == DOWNLOAD_STATUS_PAUSED {
        "Paused"
    } else {
        "Resumed"
    };
    println!("[open-game-launcher] {action} download for {game_id}");
    emit_download_payload(&app, *payload)
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

    match request_download_cancellation(&game_id)? {
        DownloadCancellationTransition::Cancelled(payload) => {
            println!("[open-game-launcher] Cancelled download for {game_id}");
            emit_download_payload(&app, *payload)
        }
        DownloadCancellationTransition::Missing => Ok(()),
        DownloadCancellationTransition::Rejected { status }
            if status == DOWNLOAD_STATUS_INSTALLING =>
        {
            Err(
                "Installation has already started; this download can no longer be cancelled."
                    .to_string(),
            )
        }
        DownloadCancellationTransition::Rejected { status } => Err(format!(
            "This download cannot be cancelled while its status is '{status}'."
        )),
    }
}

pub async fn archive_download(app: AppHandle, game_id: String) -> Result<(), String> {
    let game_id = normalize_game_id(game_id)?;
    let archived_game_id = game_id.clone();

    tauri::async_runtime::spawn_blocking(move || {
        remove_download_history_item(&archived_game_id)?;

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
