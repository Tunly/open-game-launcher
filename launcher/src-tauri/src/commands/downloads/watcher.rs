use tauri::AppHandle;
use tauri::Emitter;

use crate::commands::downloads::history::remember_download_item;
use crate::commands::downloads::steam_state::{
    calculate_steam_progress, extract_vdf_string, parse_steam_download_state, steam_phase,
    steam_progress_bytes, steam_status_label,
};
use crate::commands::downloads::types::{
    emit_download_progress, get_download_manager, is_download_control_pending, pause_hold_feedback,
    payload_from_active_download, remove_active_download_if_current, update_download_metrics,
    update_download_status, ActiveDownload,
};
use crate::commands::downloads::utils::get_dir_size;

pub fn start_global_download_watcher(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            if let Some(steam_path) = crate::commands::games::detect::find_steam_dir() {
                let mut folders = vec![steam_path.clone()];
                let libraries =
                    crate::commands::games::detect::read_steam_library_folders(&steam_path);
                folders.extend(libraries);

                for lib in folders {
                    let steamapps = lib.join("steamapps");
                    if let Ok(entries) = std::fs::read_dir(&steamapps) {
                        for entry in entries.flatten() {
                            let path = entry.path();
                            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                                if name.starts_with("appmanifest_") && name.ends_with(".acf") {
                                    if let Ok(contents) = std::fs::read_to_string(&path) {
                                        let steam_state = parse_steam_download_state(&contents);

                                        let app_id = name
                                            .strip_prefix("appmanifest_")
                                            .unwrap()
                                            .strip_suffix(".acf")
                                            .unwrap()
                                            .to_string();

                                        let downloading_dir =
                                            steamapps.join("downloading").join(&app_id);
                                        let downloading_dir_size = get_dir_size(&downloading_dir);
                                        let is_actively_downloading =
                                            steam_state.has_active_work(downloading_dir_size);

                                        if is_actively_downloading {
                                            let game_id = format!("steam-owned-{app_id}");

                                            let is_tracked = {
                                                let map = get_download_manager();
                                                if let Ok(guard) = map.lock() {
                                                    guard.contains_key(&game_id)
                                                } else {
                                                    false
                                                }
                                            };

                                            if !is_tracked {
                                                let title = extract_vdf_string(&contents, "name")
                                                    .unwrap_or_else(|| {
                                                        format!("Steam Game {app_id}")
                                                    });
                                                let map = get_download_manager();
                                                if let Ok(mut guard) = map.lock() {
                                                    let (pause_tx, pause_rx) =
                                                        tokio::sync::watch::channel(false);
                                                    let (cancel_tx, cancel_rx) =
                                                        tokio::sync::watch::channel(false);

                                                    let progress = calculate_steam_progress(
                                                        &steam_state,
                                                        downloading_dir_size,
                                                    )
                                                    .unwrap_or(0);

                                                    let active = ActiveDownload {
                                                        title: title.clone(),
                                                        progress,
                                                        speed: "Steam".to_string(),
                                                        status: "downloading".to_string(),
                                                        eta: 999,
                                                        phase: "external".to_string(),
                                                        bytes_downloaded: None,
                                                        bytes_total: None,
                                                        can_pause: true,
                                                        can_cancel: false,
                                                        external: true,
                                                        paused: false,
                                                        cancelled: false,
                                                        pause_tx,
                                                        cancel_tx,
                                                        raw_status: "auto_detected_steam"
                                                            .to_string(),
                                                        error: None,
                                                    };
                                                    guard.insert(game_id.clone(), active);
                                                    if let Some(dl) = guard.get(&game_id) {
                                                        if let Err(error) = remember_download_item(
                                                            payload_from_active_download(
                                                                &game_id, dl,
                                                            ),
                                                        ) {
                                                            eprintln!(
                                                                "[open-game-launcher] Could not persist discovered Steam download: {error}"
                                                            );
                                                        }
                                                    }

                                                    let app_clone = app.clone();
                                                    let game_id_clone = game_id.clone();
                                                    let manifest_path = path.clone();
                                                    let downloading_dir_clone =
                                                        downloading_dir.clone();
                                                    tokio::spawn(async move {
                                                        let pause_rx = pause_rx;
                                                        let cancel_rx = cancel_rx;
                                                        let mut current_progress = progress;
                                                        let mut manifest_read_failures = 0u8;
                                                        loop {
                                                            while *pause_rx.borrow() {
                                                                let (
                                                                    pause_status,
                                                                    pause_speed,
                                                                    pause_eta,
                                                                ) = pause_hold_feedback(
                                                                    &game_id_clone,
                                                                    "Steam Paused",
                                                                );
                                                                update_download_status(
                                                                    &game_id_clone,
                                                                    &pause_status,
                                                                    &pause_speed,
                                                                    current_progress,
                                                                    pause_eta,
                                                                );
                                                                emit_download_progress(
                                                                    &app_clone,
                                                                    &game_id_clone,
                                                                    current_progress,
                                                                    &pause_speed,
                                                                    &pause_status,
                                                                    pause_eta,
                                                                );
                                                                tokio::time::sleep(
                                                                    tokio::time::Duration::from_millis(500),
                                                                )
                                                                .await;
                                                            }

                                                            if let Ok(contents) =
                                                                std::fs::read_to_string(
                                                                    &manifest_path,
                                                                )
                                                            {
                                                                manifest_read_failures = 0;
                                                                if is_download_control_pending(
                                                                    &game_id_clone,
                                                                ) {
                                                                    tokio::time::sleep(
                                                                        tokio::time::Duration::from_millis(500),
                                                                    )
                                                                    .await;
                                                                    continue;
                                                                }

                                                                let steam_state =
                                                                    parse_steam_download_state(
                                                                        &contents,
                                                                    );
                                                                let downloading_dir_size =
                                                                    get_dir_size(
                                                                        &downloading_dir_clone,
                                                                    );

                                                                if let Some(error) = steam_state
                                                                    .terminal_error(
                                                                        downloading_dir_size,
                                                                    )
                                                                {
                                                                    update_download_status(
                                                                        &game_id_clone,
                                                                        "error",
                                                                        error,
                                                                        current_progress,
                                                                        0,
                                                                    );
                                                                    emit_download_progress(
                                                                        &app_clone,
                                                                        &game_id_clone,
                                                                        current_progress,
                                                                        error,
                                                                        "error",
                                                                        0,
                                                                    );
                                                                    tokio::time::sleep(
                                                                        tokio::time::Duration::from_secs(2),
                                                                    )
                                                                    .await;
                                                                    remove_active_download_if_current(
                                                                        &game_id_clone,
                                                                        &cancel_rx,
                                                                    );
                                                                    return;
                                                                }

                                                                if steam_state.is_fully_installed(
                                                                    downloading_dir_size,
                                                                ) {
                                                                    break;
                                                                }

                                                                if let Some(next_progress) =
                                                                    calculate_steam_progress(
                                                                        &steam_state,
                                                                        downloading_dir_size,
                                                                    )
                                                                {
                                                                    current_progress =
                                                                        next_progress;
                                                                    let speed_str =
                                                                        steam_status_label(
                                                                            &steam_state,
                                                                            downloading_dir_size,
                                                                        );
                                                                    let (
                                                                        bytes_downloaded,
                                                                        bytes_total,
                                                                    ) = steam_progress_bytes(
                                                                        &steam_state,
                                                                        downloading_dir_size,
                                                                    );
                                                                    update_download_metrics(
                                                                        &game_id_clone,
                                                                        steam_phase(
                                                                            &steam_state,
                                                                            downloading_dir_size,
                                                                        ),
                                                                        bytes_downloaded,
                                                                        bytes_total,
                                                                    );
                                                                    update_download_status(
                                                                        &game_id_clone,
                                                                        "downloading",
                                                                        speed_str,
                                                                        current_progress,
                                                                        999,
                                                                    );
                                                                    emit_download_progress(
                                                                        &app_clone,
                                                                        &game_id_clone,
                                                                        current_progress,
                                                                        speed_str,
                                                                        "downloading",
                                                                        999,
                                                                    );
                                                                } else {
                                                                    update_download_status(
                                                                        &game_id_clone,
                                                                        "downloading",
                                                                        "Steam (Initializing...)",
                                                                        current_progress,
                                                                        999,
                                                                    );
                                                                    emit_download_progress(
                                                                        &app_clone,
                                                                        &game_id_clone,
                                                                        current_progress,
                                                                        "Steam (Initializing...)",
                                                                        "downloading",
                                                                        999,
                                                                    );
                                                                }
                                                            } else {
                                                                manifest_read_failures =
                                                                    manifest_read_failures
                                                                        .saturating_add(1);
                                                                if manifest_read_failures < 3 {
                                                                    tokio::time::sleep(
                                                                        tokio::time::Duration::from_millis(500),
                                                                    )
                                                                    .await;
                                                                    continue;
                                                                }
                                                                let error = if manifest_path
                                                                    .exists()
                                                                {
                                                                    "Steam manifest could not be read; completion was not confirmed."
                                                                } else {
                                                                    "Steam manifest disappeared before completion was confirmed."
                                                                };
                                                                update_download_status(
                                                                    &game_id_clone,
                                                                    "error",
                                                                    error,
                                                                    current_progress,
                                                                    0,
                                                                );
                                                                emit_download_progress(
                                                                    &app_clone,
                                                                    &game_id_clone,
                                                                    current_progress,
                                                                    error,
                                                                    "error",
                                                                    0,
                                                                );
                                                                tokio::time::sleep(
                                                                    tokio::time::Duration::from_secs(2),
                                                                )
                                                                .await;
                                                                remove_active_download_if_current(
                                                                    &game_id_clone,
                                                                    &cancel_rx,
                                                                );
                                                                return;
                                                            }
                                                            tokio::time::sleep(
                                                                tokio::time::Duration::from_secs(2),
                                                            )
                                                            .await;
                                                        }

                                                        update_download_status(
                                                            &game_id_clone,
                                                            "completed",
                                                            "Done",
                                                            100,
                                                            0,
                                                        );
                                                        emit_download_progress(
                                                            &app_clone,
                                                            &game_id_clone,
                                                            100,
                                                            "Complete",
                                                            "completed",
                                                            0,
                                                        );

                                                        let _ = app_clone.emit(
                                                            "library_inventory_changed",
                                                            serde_json::json!({
                                                                "reason": "download_completed",
                                                                "gameCount": 0
                                                            }),
                                                        );

                                                        tokio::time::sleep(
                                                            tokio::time::Duration::from_secs(2),
                                                        )
                                                        .await;
                                                        remove_active_download_if_current(
                                                            &game_id_clone,
                                                            &cancel_rx,
                                                        );
                                                    });
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
        }
    });
}
