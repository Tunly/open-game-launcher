use std::time::Instant;

use tauri::AppHandle;
use tauri::Emitter;
use tokio::sync::watch;

use crate::commands::downloads::lifecycle::ExternalTracker;
use crate::commands::downloads::steam_state::{
    calculate_steam_progress, parse_steam_download_state, steam_downloading_dir_for_manifest,
    steam_phase, steam_progress_bytes, steam_status_label,
};
use crate::commands::downloads::types::{
    cancellable_sleep, emit_download_progress, get_download_manager, is_download_control_pending,
    pause_hold_feedback, update_download_metrics, update_download_status,
};
use crate::commands::downloads::utils::get_dir_size;

/// Run the external-launcher tracking loop for a download. Polls Epic's
/// Legendary process stderr, Steam's `appmanifest_*.acf` file, or
/// `detect::scan_*_games` (EA / Ubisoft / Battle.net / Xbox) until the
/// game is fully installed, cancelled, or the loop exits on stderr EOF
/// / manifest `StateFlags` complete.
///
/// This function is spawned inside a `tokio::spawn` and must not hold
/// any locks across an `.await` point — all `get_download_manager()`
/// locks are acquired and released inside short-lived scopes.
pub async fn run_external_download(
    app: AppHandle,
    game_id: String,
    tracker: ExternalTracker,
    pause_rx: watch::Receiver<bool>,
    cancel_rx: watch::Receiver<bool>,
) {
    // Derive the legacy tracker-id Options from the `ExternalTracker`
    // enum so the rest of the loop body (which predates the enum) can
    // stay identical to the original inline code.
    let steam_tracker_id: Option<String> = match &tracker {
        ExternalTracker::Steam(id) => Some(id.clone()),
        _ => None,
    };
    let epic_tracker_id: Option<String> = match &tracker {
        ExternalTracker::Epic(id) => Some(id.clone()),
        _ => None,
    };

    let mut progress = 0;

    let mut epic_child = None;
    let mut epic_stderr = None;
    if let Some(epic_id) = epic_tracker_id {
        if let Ok(legendary_path) = crate::commands::epic::ensure_legendary_binary().await {
            if let Ok(mut c) = tokio::process::Command::new(legendary_path)
                .arg("install")
                .arg(&epic_id)
                .arg("--yes")
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::piped())
                .spawn()
            {
                if let Some(err) = c.stderr.take() {
                    epic_stderr = Some(tokio::io::BufReader::new(err));
                }
                epic_child = Some(c);
            }
        }
    }

    let mut steam_manifest_path: Option<std::path::PathBuf> = None;
    let external_started_at = Instant::now();
    let mut external_installed_seen_count = 0u8;

    loop {
        if *cancel_rx.borrow() {
            if let Some(mut child) = epic_child.take() {
                let _ = child.kill().await;
            }
            update_download_status(&game_id, "cancelled", "Cancelled", progress, 0);
            emit_download_progress(&app, &game_id, progress, "Cancelled", "cancelled", 0);
            if let Ok(mut guard) = get_download_manager().lock() {
                guard.remove(&game_id);
            }
            return;
        }
        while *pause_rx.borrow() {
            let (pause_status, pause_speed, pause_eta) = pause_hold_feedback(&game_id, "Paused");
            update_download_status(&game_id, &pause_status, &pause_speed, progress, pause_eta);
            emit_download_progress(
                &app,
                &game_id,
                progress,
                &pause_speed,
                &pause_status,
                pause_eta,
            );
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            if *cancel_rx.borrow() {
                if let Some(mut child) = epic_child.take() {
                    let _ = child.kill().await;
                }
                update_download_status(&game_id, "cancelled", "Cancelled", progress, 0);
                emit_download_progress(&app, &game_id, progress, "Cancelled", "cancelled", 0);
                if let Ok(mut guard) = get_download_manager().lock() {
                    guard.remove(&game_id);
                }
                return;
            }
        }

        if let Some(ref mut reader) = epic_stderr {
            use tokio::io::AsyncBufReadExt;
            let mut line = String::new();
            let res = tokio::time::timeout(
                std::time::Duration::from_millis(500),
                reader.read_line(&mut line),
            )
            .await;
            if let Ok(Ok(n)) = res {
                if n == 0 {
                    break;
                }
                if let Some(pos) = line.find("Progress: ") {
                    let rest = &line[pos + 10..];
                    if let Some(pct_end) = rest.find('%') {
                        if let Ok(val) = rest[..pct_end].parse::<f64>() {
                            progress = val as u32;
                            let speed_str = "Epic Games";
                            update_download_status(
                                &game_id,
                                "downloading",
                                speed_str,
                                progress,
                                999,
                            );
                            emit_download_progress(
                                &app,
                                &game_id,
                                progress,
                                speed_str,
                                "downloading",
                                999,
                            );
                        }
                    }
                }
            } else if let Ok(Err(_)) = res {
                break;
            }
        } else if let Some(ref appid) = steam_tracker_id {
            if is_download_control_pending(&game_id) {
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                continue;
            }

            let mut path_found = None;
            if let Some(ref path) = steam_manifest_path {
                if path.exists() {
                    path_found = Some(path.clone());
                }
            }

            if path_found.is_none() {
                if let Some(steam_path) = crate::commands::games::detect::find_steam_dir() {
                    let main_path = steam_path
                        .join("steamapps")
                        .join(format!("appmanifest_{appid}.acf"));
                    if main_path.exists() {
                        path_found = Some(main_path.clone());
                        steam_manifest_path = Some(main_path);
                    } else {
                        let libraries =
                            crate::commands::games::detect::read_steam_library_folders(&steam_path);
                        for lib in libraries {
                            let path = lib
                                .join("steamapps")
                                .join(format!("appmanifest_{appid}.acf"));
                            if path.exists() {
                                path_found = Some(path.clone());
                                steam_manifest_path = Some(path);
                                break;
                            }
                        }
                    }
                }
            }

            if let Some(ref path) = path_found {
                if let Ok(contents) = std::fs::read_to_string(path) {
                    let steam_state = parse_steam_download_state(&contents);

                    let downloading_dir_size = steam_downloading_dir_for_manifest(path, appid)
                        .map(get_dir_size)
                        .unwrap_or(0);

                    if steam_state.is_fully_installed(downloading_dir_size) {
                        break;
                    }

                    if let Some(next_progress) =
                        calculate_steam_progress(&steam_state, downloading_dir_size)
                    {
                        progress = next_progress;
                        let speed_str = steam_status_label(&steam_state, downloading_dir_size);
                        let (bytes_downloaded, bytes_total) =
                            steam_progress_bytes(&steam_state, downloading_dir_size);
                        update_download_metrics(
                            &game_id,
                            steam_phase(&steam_state, downloading_dir_size),
                            bytes_downloaded,
                            bytes_total,
                        );
                        update_download_status(&game_id, "downloading", speed_str, progress, 999);
                        emit_download_progress(
                            &app,
                            &game_id,
                            progress,
                            speed_str,
                            "downloading",
                            999,
                        );
                    } else {
                        let speed_str = "Steam (Initializing...)";
                        update_download_status(&game_id, "downloading", speed_str, progress, 999);
                        emit_download_progress(
                            &app,
                            &game_id,
                            progress,
                            speed_str,
                            "downloading",
                            999,
                        );
                    }
                } else {
                    let speed_str = "Steam (Connecting...)";
                    update_download_status(&game_id, "downloading", speed_str, progress, 999);
                    emit_download_progress(&app, &game_id, progress, speed_str, "downloading", 999);
                }
            } else {
                let speed_str = "Steam (Starting...)";
                update_download_status(&game_id, "downloading", speed_str, progress, 999);
                emit_download_progress(&app, &game_id, progress, speed_str, "downloading", 999);
            }
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        } else {
            let clean_id = game_id.replace("-owned-", "-");
            let platform = crate::commands::downloads::utils::get_platform_from_game_id(&game_id);

            let is_installed = match platform.as_str() {
                "EA App" => crate::commands::games::detect::scan_ea_games()
                    .iter()
                    .any(|g| g.id == clean_id),
                "Ubisoft Connect" => crate::commands::games::detect::scan_ubisoft_games()
                    .iter()
                    .any(|g| g.id == clean_id),
                "Battle.net" => crate::commands::games::detect::scan_battlenet_games()
                    .iter()
                    .any(|g| g.id == clean_id),
                "Xbox App / PC Game Pass" | "Xbox App" | "Xbox Game Pass" => {
                    crate::commands::games::detect::scan_xbox_games()
                        .iter()
                        .any(|g| g.id == clean_id)
                }
                _ => false,
            };

            if is_installed && external_started_at.elapsed().as_secs() >= 10 {
                external_installed_seen_count = external_installed_seen_count.saturating_add(1);
            } else {
                external_installed_seen_count = 0;
            }

            if external_installed_seen_count >= 2 {
                progress = 100;
                let speed_str = format!("{platform} (Done)");
                update_download_status(&game_id, "completed", &speed_str, progress, 0);
                emit_download_progress(&app, &game_id, progress, &speed_str, "completed", 0);
                break;
            }

            progress = 0;
            let speed_str = format!("{platform} (External)");
            update_download_metrics(&game_id, "external", None, None);
            update_download_status(&game_id, "downloading", &speed_str, progress, 999);
            emit_download_progress(&app, &game_id, progress, &speed_str, "downloading", 999);
            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
        }
    }

    if let Some(mut child) = epic_child.take() {
        match tokio::time::timeout(std::time::Duration::from_secs(10), child.wait()).await {
            Ok(_) => {}
            Err(_) => {
                let _ = child.kill().await;
                let _ = child.wait().await;
            }
        }
    }

    let _ = app.emit(
        "library_inventory_changed",
        serde_json::json!({
            "reason": "download_completed",
            "gameCount": 0
        }),
    );

    update_download_status(&game_id, "completed", "Done", 100, 0);
    emit_download_progress(&app, &game_id, 100, "Complete", "completed", 0);

    let _ = cancellable_sleep(&cancel_rx, tokio::time::Duration::from_secs(2)).await;
    if let Ok(mut guard) = get_download_manager().lock() {
        guard.remove(&game_id);
    }
}
