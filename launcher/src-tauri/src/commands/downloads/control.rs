use tauri::AppHandle;

use crate::commands::downloads::steam_cef::toggle_steam_download_pause;
use crate::commands::downloads::types::{
    clear_download_suppression, emit_download_payload, get_download_lifecycle_lock,
    get_download_manager, is_terminal_download_status, request_download_cancellation,
    suppress_download_emissions, toggle_download_pause, DownloadCancellationTransition,
    DOWNLOAD_STATUS_INSTALLING, DOWNLOAD_STATUS_PAUSED,
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

    let _lifecycle = get_download_lifecycle_lock()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    suppress_download_emissions(&game_id);
    let cancellation = match request_download_cancellation(&game_id) {
        Ok(cancellation) => cancellation,
        Err(error) => {
            clear_download_suppression(&game_id);
            return Err(error);
        }
    };

    match cancellation {
        DownloadCancellationTransition::Cancelled(_payload) => {
            println!("[open-game-launcher] Cancelled download for {game_id}");
            // The Downloads UI treats Cancel as an immediate discard. The
            // worker has received its cancellation signal and keeps its map
            // reservation only until cleanup, so remove persisted history and
            // emit only the authoritative removal event. Emitting a queued
            // `cancelled` payload here could race and resurrect the row.
            crate::commands::downloads::remove_download_record(&app, &game_id)
        }
        DownloadCancellationTransition::Missing => {
            crate::commands::downloads::remove_download_record(&app, &game_id)
        }
        DownloadCancellationTransition::Rejected { status }
            if status == DOWNLOAD_STATUS_INSTALLING =>
        {
            clear_download_suppression(&game_id);
            Err(
                "Installation has already started; this download can no longer be cancelled."
                    .to_string(),
            )
        }
        DownloadCancellationTransition::Rejected { status } => {
            clear_download_suppression(&game_id);
            Err(format!(
                "This download cannot be cancelled while its status is '{status}'."
            ))
        }
    }
}

pub async fn archive_download(app: AppHandle, game_id: String) -> Result<(), String> {
    let game_id = normalize_game_id(game_id)?;
    if game_id.starts_with("gog-") {
        return crate::commands::gog::archive_gog_download(app, game_id);
    }

    let archived_game_id = game_id.clone();
    let archive_app = app.clone();

    let archive_result = tauri::async_runtime::spawn_blocking(move || {
        let _lifecycle = get_download_lifecycle_lock()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let map = get_download_manager();
        let guard = map
            .lock()
            .map_err(|error| format!("Download manager lock poisoned: {error}"))?;
        if let Some(download) = guard.get(&archived_game_id) {
            if !download.external && !is_terminal_download_status(&download.status) {
                return Err(format!(
                    "This download cannot be removed while its status is '{}'.",
                    download.status
                ));
            }
        }
        // Keep the active entry until its generation-bound worker observes the
        // tombstone and stops tracking. Do not signal cancellation here:
        // external provider downloads must continue outside our queue.
        crate::commands::downloads::archive_download_record(&archive_app, &archived_game_id)?;

        Ok::<(), String>(())
    })
    .await
    .map_err(|error| format!("Archive task failed: {error}"))
    .and_then(|result| result);

    archive_result
}
