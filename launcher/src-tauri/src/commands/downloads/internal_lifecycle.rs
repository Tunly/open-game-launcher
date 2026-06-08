use tauri::AppHandle;
use tauri::Emitter;
use tokio::sync::watch;

use crate::commands::downloads::install::{
    install_downloaded_game_package, update_installed_games_cache_for_download,
    write_downloaded_game_manifest,
};
use crate::commands::downloads::internal_download::download_internal_game_file;
use crate::commands::downloads::types::{
    cancellable_sleep, emit_download_progress, get_download_manager, update_download_status,
    InternalDownloadSource,
};
use crate::commands::downloads::utils::default_install_dir;

/// Run the internal HTTP(S) download lifecycle: download the file,
/// install the package, write the manifest, update the installed-games
/// cache, and emit the completion event.
///
/// If `source` is `None` the function emits an error and returns
/// immediately (the game is configured without a manual download
/// link, e.g. a discovery-only entry).
pub async fn run_internal_lifecycle(
    app: AppHandle,
    game_id: String,
    title: String,
    source: Option<InternalDownloadSource>,
    pause_rx: watch::Receiver<bool>,
    cancel_rx: watch::Receiver<bool>,
) {
    let Some(source) = source else {
        let message = "No download source configured for this game.";
        update_download_status(&game_id, "error", message, 0, 0);
        emit_download_progress(&app, &game_id, 0, message, "error", 0);
        return;
    };
    let Some(install_dir) = default_install_dir(&game_id) else {
        let message = "Could not resolve install directory.";
        update_download_status(&game_id, "error", message, 0, 0);
        emit_download_progress(&app, &game_id, 0, message, "error", 0);
        return;
    };

    match download_internal_game_file(
        &app,
        &game_id,
        &title,
        &source,
        &install_dir,
        &pause_rx,
        &cancel_rx,
    )
    .await
    {
        Ok(downloaded_file) => {
            match install_downloaded_game_package(
                &app,
                &game_id,
                &title,
                &install_dir,
                &source,
                &downloaded_file,
            ) {
                Ok(installed_package) => {
                    if let Err(error) = write_downloaded_game_manifest(
                        &game_id,
                        &title,
                        &install_dir,
                        &source,
                        &downloaded_file,
                        &installed_package,
                    ) {
                        update_download_status(&game_id, "error", &error, 0, 0);
                        emit_download_progress(
                            &app,
                            &game_id,
                            0,
                            &error,
                            "error",
                            0,
                        );
                    } else {
                        update_installed_games_cache_for_download(
                            &game_id,
                            &title,
                            &install_dir,
                            Some(installed_package.executable_path.as_path()),
                        );
                        let _ = app.emit(
                            "library_inventory_changed",
                            serde_json::json!({
                                "reason": "download_completed",
                                "gameCount": 0
                            }),
                        );
                        update_download_status(&game_id, "completed", "Done", 100, 0);
                        emit_download_progress(
                            &app,
                            &game_id,
                            100,
                            "Complete",
                            "completed",
                            0,
                        );
                    }
                }
                Err(error) => {
                    update_download_status(&game_id, "error", &error, 0, 0);
                    emit_download_progress(
                        &app,
                        &game_id,
                        0,
                        &error,
                        "error",
                        0,
                    );
                }
            }
        }
        Err(error) => {
            let status = if error == "Download cancelled." {
                "cancelled"
            } else {
                "error"
            };
            update_download_status(&game_id, status, &error, 0, 0);
            emit_download_progress(&app, &game_id, 0, &error, status, 0);
        }
    }

    let _ = cancellable_sleep(&cancel_rx, tokio::time::Duration::from_secs(2)).await;
    if let Ok(mut guard) = get_download_manager().lock() {
        guard.remove(&game_id);
    }
}
