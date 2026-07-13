use tauri::AppHandle;
use tauri::Emitter;
use tokio::sync::watch;

use crate::commands::downloads::install::{
    install_downloaded_game_package, rollback_downloaded_game_artifacts,
    update_installed_games_cache_for_download, write_downloaded_game_manifest,
};
use crate::commands::downloads::internal_download::{
    download_internal_game_file, download_internal_install_manifest_file,
};
use crate::commands::downloads::types::{
    begin_download_commit, cancellable_sleep, emit_download_payload, emit_download_progress,
    remove_active_download_if_current, update_download_status, InternalDownloadSource,
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
        remove_active_download_if_current(&game_id, &cancel_rx);
        return;
    };
    let Some(install_dir) = default_install_dir(&game_id) else {
        let message = "Could not resolve install directory.";
        update_download_status(&game_id, "error", message, 0, 0);
        emit_download_progress(&app, &game_id, 0, message, "error", 0);
        remove_active_download_if_current(&game_id, &cancel_rx);
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
                        if *cancel_rx.borrow() {
                            let _ =
                                cleanup_preinstall_artifacts(&install_dir, &downloaded_file, None);
                            remove_active_download_if_current(&game_id, &cancel_rx);
                            return;
                        }
                        let error =
                            cleanup_preinstall_artifacts(&install_dir, &downloaded_file, None)
                                .err()
                                .map_or(error.clone(), |cleanup_error| {
                                    format!("{error} Cleanup also failed: {cleanup_error}")
                                });
                        update_download_status(&game_id, "error", &error, 0, 0);
                        emit_download_progress(&app, &game_id, 0, &error, "error", 0);
                        let _ = cancellable_sleep(&cancel_rx, tokio::time::Duration::from_secs(2))
                            .await;
                        remove_active_download_if_current(&game_id, &cancel_rx);
                        return;
                    }
                };

            let commit_payload = match begin_download_commit(&game_id) {
                Ok(Some(payload)) => payload,
                Ok(None) => {
                    let _ = cleanup_preinstall_artifacts(
                        &install_dir,
                        &downloaded_file,
                        install_manifest_file.as_deref(),
                    );
                    remove_active_download_if_current(&game_id, &cancel_rx);
                    return;
                }
                Err(error) => {
                    let error = cleanup_preinstall_artifacts(
                        &install_dir,
                        &downloaded_file,
                        install_manifest_file.as_deref(),
                    )
                    .err()
                    .map_or(error.clone(), |cleanup_error| {
                        format!("{error} Cleanup also failed: {cleanup_error}")
                    });
                    update_download_status(&game_id, "error", &error, 0, 0);
                    emit_download_progress(&app, &game_id, 0, &error, "error", 0);
                    remove_active_download_if_current(&game_id, &cancel_rx);
                    return;
                }
            };
            if let Err(error) = emit_download_payload(&app, commit_payload) {
                let error = cleanup_preinstall_artifacts(
                    &install_dir,
                    &downloaded_file,
                    install_manifest_file.as_deref(),
                )
                .err()
                .map_or(error.clone(), |cleanup_error| {
                    format!("{error} Cleanup also failed: {cleanup_error}")
                });
                eprintln!(
                    "[open-game-launcher] Could not persist download commit for '{game_id}': {error}"
                );
                update_download_status(&game_id, "error", &error, 0, 0);
                remove_active_download_if_current(&game_id, &cancel_rx);
                return;
            }

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
                        let rollback_error = rollback_downloaded_game_artifacts(
                            &install_dir,
                            &downloaded_file,
                            &installed_package.files,
                        )
                        .err();
                        if let Some(path) = install_manifest_file.as_deref() {
                            let _ = std::fs::remove_file(path);
                        }
                        let error = rollback_error.map_or(error.clone(), |rollback_error| {
                            format!("{error} Rollback also failed: {rollback_error}")
                        });
                        update_download_status(&game_id, "error", &error, 0, 0);
                        emit_download_progress(&app, &game_id, 0, &error, "error", 0);
                    } else {
                        let cache_result = update_installed_games_cache_for_download(
                            &game_id,
                            &title,
                            &install_dir,
                            Some(installed_package.executable_path.as_path()),
                        );
                        match cache_result {
                            Ok(()) => {
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
                            Err(error) => {
                                update_download_status(&game_id, "error", &error, 0, 0);
                                emit_download_progress(&app, &game_id, 0, &error, "error", 0);
                            }
                        }
                    }
                }
                Err(error) => {
                    let rollback_error =
                        rollback_downloaded_game_artifacts(&install_dir, &downloaded_file, &[])
                            .err();
                    if let Some(path) = install_manifest_file.as_deref() {
                        let _ = std::fs::remove_file(path);
                    }
                    let error = rollback_error.map_or(error.clone(), |rollback_error| {
                        format!("{error} Rollback also failed: {rollback_error}")
                    });
                    update_download_status(&game_id, "error", &error, 0, 0);
                    emit_download_progress(&app, &game_id, 0, &error, "error", 0);
                }
            }
        }
        Err(error) => {
            // The cancel command already emitted and persisted the complete
            // payload before removing the active entry. Do not replace it
            // with a default payload after the worker observes cancellation.
            if *cancel_rx.borrow() {
                remove_active_download_if_current(&game_id, &cancel_rx);
                return;
            }
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
    remove_active_download_if_current(&game_id, &cancel_rx);
}

fn cleanup_preinstall_artifacts(
    install_dir: &std::path::Path,
    downloaded_file: &std::path::Path,
    install_manifest_file: Option<&std::path::Path>,
) -> Result<(), String> {
    let mut errors = Vec::new();
    if let Err(error) = rollback_downloaded_game_artifacts(install_dir, downloaded_file, &[]) {
        errors.push(error);
    }
    if let Some(path) = install_manifest_file {
        match std::fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => errors.push(format!(
                "Could not remove failed install manifest sidecar '{}': {error}",
                path.display()
            )),
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join(" "))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preinstall_cleanup_removes_package_and_manifest_but_not_unrelated_files() {
        let root = std::env::temp_dir().join(format!(
            "ogl-preinstall-cleanup-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let package = root.join("game.zip");
        let manifest = root.join(".manifest.sidecar");
        let unrelated = root.join("keep.txt");
        std::fs::write(&package, b"package").unwrap();
        std::fs::write(&manifest, b"manifest").unwrap();
        std::fs::write(&unrelated, b"keep").unwrap();

        cleanup_preinstall_artifacts(&root, &package, Some(&manifest)).unwrap();

        assert!(!package.exists());
        assert!(!manifest.exists());
        assert!(unrelated.exists());
        std::fs::remove_dir_all(root).unwrap();
    }
}
