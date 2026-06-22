use tauri::AppHandle;
use tauri::Emitter;
use tokio::sync::watch;

use crate::commands::downloads::install::{
    install_downloaded_game_package, update_installed_games_cache_for_download,
    write_downloaded_game_manifest,
};
use crate::commands::downloads::internal_download::{
    download_internal_game_file, download_internal_install_manifest_file,
};
use crate::commands::downloads::lifecycle::{
    InternalDownloadTerminalEvent, InternalDownloadTerminalHook,
};
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
    mut terminal_hook: Option<InternalDownloadTerminalHook>,
) {
    let Some(source) = source else {
        let message = "No download source configured for this game.";
        update_download_status(&game_id, "error", message, 0, 0);
        emit_download_progress(&app, &game_id, 0, message, "error", 0);
        fire_terminal_hook(&mut terminal_hook, "failed", message).await;
        return;
    };
    let Some(install_dir) = default_install_dir(&game_id) else {
        let message = "Could not resolve install directory.";
        update_download_status(&game_id, "error", message, 0, 0);
        emit_download_progress(&app, &game_id, 0, message, "error", 0);
        fire_terminal_hook(&mut terminal_hook, "failed", message).await;
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
            let install_manifest_file =
                match download_internal_install_manifest_file(&source, &install_dir).await {
                    Ok(path) => path,
                    Err(error) => {
                        update_download_status(&game_id, "error", &error, 0, 0);
                        emit_download_progress(&app, &game_id, 0, &error, "error", 0);
                        fire_terminal_hook(&mut terminal_hook, "failed", &error).await;
                        let _ = cancellable_sleep(&cancel_rx, tokio::time::Duration::from_secs(2))
                            .await;
                        if let Ok(mut guard) = get_download_manager().lock() {
                            guard.remove(&game_id);
                        }
                        return;
                    }
                };
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
                        install_manifest_file.as_deref(),
                    ) {
                        update_download_status(&game_id, "error", &error, 0, 0);
                        emit_download_progress(&app, &game_id, 0, &error, "error", 0);
                        fire_terminal_hook(&mut terminal_hook, "failed", &error).await;
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
                        emit_download_progress(&app, &game_id, 100, "Complete", "completed", 0);
                        fire_terminal_hook(&mut terminal_hook, "completed", "Complete").await;
                    }
                }
                Err(error) => {
                    update_download_status(&game_id, "error", &error, 0, 0);
                    emit_download_progress(&app, &game_id, 0, &error, "error", 0);
                    fire_terminal_hook(&mut terminal_hook, "failed", &error).await;
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
            fire_terminal_hook(&mut terminal_hook, status, &error).await;
        }
    }

    let _ = cancellable_sleep(&cancel_rx, tokio::time::Duration::from_secs(2)).await;
    if let Ok(mut guard) = get_download_manager().lock() {
        guard.remove(&game_id);
    }
}

async fn fire_terminal_hook(
    terminal_hook: &mut Option<InternalDownloadTerminalHook>,
    status: &str,
    message: &str,
) {
    let Some(hook) = terminal_hook.take() else {
        return;
    };

    hook(InternalDownloadTerminalEvent {
        status: status.to_string(),
        message: message.to_string(),
    })
    .await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    #[tokio::test]
    async fn terminal_hook_fires_only_once() {
        let calls = Arc::new(AtomicUsize::new(0));
        let calls_for_hook = Arc::clone(&calls);
        let mut hook: Option<InternalDownloadTerminalHook> = Some(Arc::new(move |event| {
            let calls_for_hook = Arc::clone(&calls_for_hook);
            Box::pin(async move {
                assert_eq!(event.status, "failed");
                assert_eq!(event.message, "first");
                calls_for_hook.fetch_add(1, Ordering::SeqCst);
            })
        }));

        fire_terminal_hook(&mut hook, "failed", "first").await;
        fire_terminal_hook(&mut hook, "completed", "second").await;

        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }
}
