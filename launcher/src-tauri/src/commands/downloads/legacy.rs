use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};
use tauri::Emitter;
use tokio::sync::watch;

use crate::commands::http::shared_http_client;

use crate::commands::games::{
    extract_og_zip_package, find_launch_executable, installed_game, is_file_executable,
    is_zip_package, og_manifest_file_for_path, og_manifest_relative_path, path_to_string,
    read_installed_games_cache, write_installed_games_cache, write_og_managed_manifest_details,
    GameStatus, OgManagedManifest,
};

use crate::commands::downloads::types::{
    ActiveDownload, DownloadItemPayload, DownloadStartStatus, DownloadStatusKind,
    InternalDownloadSource, StartDownloadResponse, SteamDownloadControlAction,
    DOWNLOAD_STATUS_CANCELLED, DOWNLOAD_STATUS_COMPLETED, DOWNLOAD_STATUS_DOWNLOADING,
    DOWNLOAD_STATUS_FAILED, DOWNLOAD_STATUS_INSTALLING, DOWNLOAD_STATUS_PAUSED,
    DOWNLOAD_STATUS_PAUSING, DOWNLOAD_STATUS_RESUMING, DOWNLOAD_STATUS_STARTING,
    STEAM_STATE_FULLY_INSTALLED, STEAM_STATE_UPDATE_REQUIRED, cancellable_sleep,
    emit_download_command_error, emit_download_removed, get_download_manager,
    is_download_control_pending, is_pause_toggle_status,
    is_restart_interrupted_download_status, is_steam_control_pending_status,
    is_terminal_download_status, normalize_progress, now_unix_secs, pause_hold_feedback,
    phase_from_status_and_speed, update_download_metrics, update_download_status,
    validated_download_status,
};
use crate::commands::downloads::utils::{
    calculate_active_progress, default_install_dir, download_file_name, get_dir_size,
    get_platform_from_game_id, is_download_game_installed, is_external_tracker_game_id,
    is_steam_tracker_game_id, normalize_game_id, progress_source_from_game_id,
    provider_key_from_game_id, sanitize_download_file_name, steam_app_id_from_download_id,
    verify_sha256,
};
use crate::commands::downloads::history::{save_download_history, terminal_sort_rank};
use crate::commands::downloads::install::{
    install_downloaded_game_package, update_installed_games_cache_for_download,
    write_downloaded_game_manifest,
};
use crate::commands::downloads::internal_download::download_internal_game_file;
use crate::commands::downloads::steam_cef::{steam_cef_targets, toggle_steam_download_pause};
use crate::commands::downloads::steam_state::{
    calculate_steam_progress, extract_vdf_string, has_active_download_work,
    parse_steam_download_state, steam_download_work_exists,
    steam_downloading_dir_for_manifest, steam_phase, steam_progress_bytes,
    steam_status_label,
};

pub fn get_download_queue() -> Result<Vec<DownloadItemPayload>, String> {
    let mut queue_by_game_id: HashMap<String, DownloadItemPayload> = load_download_history()
        .into_iter()
        .map(|item| (item.game_id.clone(), normalize_queue_payload(item)))
        .collect();

    // Get generic downloads
    {
        let map = get_download_manager()
            .lock()
            .map_err(|error| format!("Download manager lock poisoned: {error}"))?;
        let active_items = map
            .iter()
            .map(|(game_id, dl)| payload_from_active_download(game_id, dl))
            .collect::<Vec<_>>();
        drop(map);

        for item in active_items {
            if is_stale_installed_download(&item) {
                remove_download_history_item(&item.game_id);
                continue;
            }
            queue_by_game_id.insert(item.game_id.clone(), item);
        }
    }

    // Get GOG downloads
    {
        if let Ok(gog_queue) = crate::commands::gog::get_gog_download_queue() {
            for item in gog_queue {
                queue_by_game_id.insert(item.game_id.clone(), normalize_queue_payload(item));
            }
        }
    }

    let mut queue: Vec<DownloadItemPayload> = queue_by_game_id.into_values().collect();
    queue.sort_by(|a, b| {
        terminal_sort_rank(&a.status)
            .cmp(&terminal_sort_rank(&b.status))
            .then_with(|| a.title.cmp(&b.title))
    });

    Ok(queue)
}

pub fn pause_download(app: tauri::AppHandle, game_id: String) -> Result<(), String> {
    let game_id = normalize_game_id(game_id)?;

    // Route GOG downloads to GOG manager
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

pub fn cancel_download(app: tauri::AppHandle, game_id: String) -> Result<(), String> {
    let game_id = normalize_game_id(game_id)?;

    // Route GOG downloads to GOG manager
    if game_id.starts_with("gog-") {
        return crate::commands::gog::cancel_gog_download(app, game_id);
    }
    if is_external_tracker_game_id(&game_id) {
        return Err("This download is controlled by an external launcher. Remove it from the queue instead.".to_string());
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

pub fn archive_download(game_id: String) -> Result<(), String> {
    let game_id = normalize_game_id(game_id)?;
    remove_download_history_item(&game_id);

    let map = get_download_manager();
    let mut guard = map
        .lock()
        .map_err(|error| format!("Download manager lock poisoned: {error}"))?;
    let should_remove = guard
        .get(&game_id)
        .is_some_and(|download| download.external || is_terminal_download_status(&download.status));
    if should_remove {
        guard.remove(&game_id);
    }

    Ok(())
}

pub async fn start_download(
    app: tauri::AppHandle,
    game_id: String,
    game_title: Option<String>,
    download_url: Option<String>,
    download_sha256: Option<String>,
) -> Result<StartDownloadResponse, String> {
    let game_id = normalize_game_id(game_id)?;
    let download_id = format!("download-{game_id}");

    println!("[open-game-launcher] start_download requested for {game_id}");

    // Route GOG downloads through our native GOG integration
    if game_id.starts_with("gog-owned-") {
        let gog_id = game_id.strip_prefix("gog-owned-").unwrap_or(&game_id);
        return crate::commands::gog::gog_start_download(app, gog_id.to_string(), None).await;
    }
    if game_id.starts_with("gog-") {
        // Already installed GOG game; shouldn't be downloading, but handle gracefully
        let gog_id = game_id.strip_prefix("gog-").unwrap_or(&game_id);
        return crate::commands::gog::gog_start_download(app, gog_id.to_string(), None).await;
    }

    // Route Steam and Epic owned games: trigger native client AND track in download queue
    let mut epic_tracker_id = None;
    let mut steam_tracker_id = None;
    let mut external_message = String::new();
    let mut is_external_download = false;

    if game_id.starts_with("steam-owned-") || game_id.starts_with("steam-") {
        let steam_app_id = game_id
            .strip_prefix("steam-owned-")
            .or_else(|| game_id.strip_prefix("steam-"))
            .unwrap_or(&game_id);
        let uri = format!("steam://install/{steam_app_id}");
        let _ = crate::commands::system::open_uri(&uri);
        steam_tracker_id = Some(steam_app_id.to_string());
        is_external_download = true;
        external_message =
            "Installation started in Steam. Check Steam for download progress.".to_string();
    } else if game_id.starts_with("epic-owned-") {
        let epic_id = game_id
            .strip_prefix("epic-owned-")
            .unwrap_or(&game_id)
            .to_string();
        epic_tracker_id = Some(epic_id);
        is_external_download = true;
        external_message =
            "Installation started via Epic Games (Legendary). Check Legendary for progress."
                .to_string();
    } else if game_id.starts_with("ea-owned-") {
        let ea_id = game_id.strip_prefix("ea-owned-").unwrap_or(&game_id);
        let uri = format!("origin2://game/launch?offerIds={ea_id}&autoDownload=true");
        let _ = crate::commands::system::open_uri(&uri);
        is_external_download = true;
        external_message = "Installation started in EA App. Check EA App for progress.".to_string();
    } else if game_id.starts_with("ubisoft-owned-") {
        let uplay_id = game_id.strip_prefix("ubisoft-owned-").unwrap_or(&game_id);
        let uri = format!("uplay://install/{uplay_id}");
        let _ = crate::commands::system::open_uri(&uri);
        is_external_download = true;
        external_message =
            "Installation started in Ubisoft Connect. Check Ubisoft Connect for progress."
                .to_string();
    } else if game_id.starts_with("battlenet-owned-") {
        let bnet_id = game_id.strip_prefix("battlenet-owned-").unwrap_or(&game_id);
        let uri = format!("battlenet://{bnet_id}");
        let _ = crate::commands::system::open_uri(&uri);
        is_external_download = true;
        external_message =
            "Installation started in Battle.net. Check Battle.net for progress.".to_string();
    }

    // Get the title of the game
    let mut title = game_title
        .clone()
        .unwrap_or_else(|| "Unknown Game".to_string());
    let mut has_game = game_title.is_some();

    if !has_game {
        if let Some(game) = read_installed_games_cache()
            .unwrap_or_default()
            .into_iter()
            .find(|game| game.id == game_id)
        {
            title = game.title;
            has_game = true;
        }
    }

    if !has_game {
        title = game_id.replace("-", " ");
    }

    if is_external_download && is_download_game_installed(&game_id) {
        return Ok(StartDownloadResponse {
            game_id,
            download_id,
            status: DownloadStartStatus::AlreadyInstalled,
            message: "Game is already installed and was not added to Downloads.".to_string(),
        });
    }

    let map = get_download_manager();
    let mut guard = map
        .lock()
        .map_err(|error| format!("Download manager lock poisoned: {error}"))?;

    if guard.contains_key(&game_id) {
        return Ok(StartDownloadResponse {
            game_id: game_id.clone(),
            download_id: download_id.clone(),
            status: DownloadStartStatus::Started,
            message: "Download is already queued.".to_string(),
        });
    }

    let (pause_tx, pause_rx) = watch::channel(false);
    let (cancel_tx, cancel_rx) = watch::channel(false);
    let is_steam_external_download = steam_tracker_id.is_some();

    let active = ActiveDownload {
        title: title.clone(),
        progress: 0,
        speed: if is_external_download {
            "Starting external launcher...".to_string()
        } else {
            "Waiting...".to_string()
        },
        status: if is_external_download {
            DOWNLOAD_STATUS_STARTING.to_string()
        } else {
            DOWNLOAD_STATUS_DOWNLOADING.to_string()
        },
        eta: 0,
        phase: if is_external_download {
            "external".to_string()
        } else {
            "download".to_string()
        },
        bytes_downloaded: None,
        bytes_total: None,
        can_pause: !is_external_download || is_steam_external_download,
        can_cancel: !is_external_download,
        external: is_external_download,
        paused: false,
        cancelled: false,
        pause_tx,
        cancel_tx,
        raw_status: "starting".to_string(),
        error: None,
    };
    guard.insert(game_id.clone(), active);
    if let Some(dl) = guard.get(&game_id) {
        remember_download_item(payload_from_active_download(&game_id, dl));
    }

    // Spawn download worker
    let app_clone = app.clone();
    let game_id_clone = game_id.clone();
    let title_clone = title.clone();
    let internal_download_source = download_url
        .filter(|url| !url.trim().is_empty())
        .map(|url| InternalDownloadSource {
            url,
            sha256: download_sha256.filter(|value| !value.trim().is_empty()),
        });

    tokio::spawn(async move {
        let cancel_rx = cancel_rx;
        let pause_rx = pause_rx;

        if is_external_download {
            let mut progress = 0;

            // Setup Epic
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

            // Setup Steam
            let mut steam_manifest_path: Option<std::path::PathBuf> = None;
            let external_started_at = Instant::now();
            let mut external_installed_seen_count = 0u8;

            loop {
                if *cancel_rx.borrow() {
                    if let Some(mut child) = epic_child.take() {
                        let _ = child.kill().await;
                    }
                    update_download_status(&game_id_clone, "cancelled", "Cancelled", progress, 0);
                    emit_download_progress(
                        &app_clone,
                        &game_id_clone,
                        progress,
                        "Cancelled",
                        "cancelled",
                        0,
                    );
                    if let Ok(mut guard) = get_download_manager().lock() {
                        guard.remove(&game_id_clone);
                    }
                    return;
                }
                while *pause_rx.borrow() {
                    let (pause_status, pause_speed, pause_eta) =
                        pause_hold_feedback(&game_id_clone, "Paused");
                    update_download_status(
                        &game_id_clone,
                        &pause_status,
                        &pause_speed,
                        progress,
                        pause_eta,
                    );
                    emit_download_progress(
                        &app_clone,
                        &game_id_clone,
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
                        update_download_status(
                            &game_id_clone,
                            "cancelled",
                            "Cancelled",
                            progress,
                            0,
                        );
                        emit_download_progress(
                            &app_clone,
                            &game_id_clone,
                            progress,
                            "Cancelled",
                            "cancelled",
                            0,
                        );
                        if let Ok(mut guard) = get_download_manager().lock() {
                            guard.remove(&game_id_clone);
                        }
                        return;
                    }
                }

                // Epic Games parsing
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
                            // EOF
                            break;
                        }
                        if let Some(pos) = line.find("Progress: ") {
                            let rest = &line[pos + 10..];
                            if let Some(pct_end) = rest.find('%') {
                                if let Ok(val) = rest[..pct_end].parse::<f64>() {
                                    progress = val as u32;
                                    let speed_str = "Epic Games";
                                    update_download_status(
                                        &game_id_clone,
                                        "downloading",
                                        speed_str,
                                        progress,
                                        999,
                                    );
                                    emit_download_progress(
                                        &app_clone,
                                        &game_id_clone,
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
                }
                // Steam polling
                else if let Some(ref appid) = steam_tracker_id {
                    if is_download_control_pending(&game_id_clone) {
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
                                    crate::commands::games::detect::read_steam_library_folders(
                                        &steam_path,
                                    );
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

                            let downloading_dir_size =
                                steam_downloading_dir_for_manifest(path, appid)
                                    .map(get_dir_size)
                                    .unwrap_or(0);

                            if steam_state.is_fully_installed(downloading_dir_size) {
                                break; // Fully installed
                            }

                            if let Some(next_progress) =
                                calculate_steam_progress(&steam_state, downloading_dir_size)
                            {
                                progress = next_progress;
                                let speed_str =
                                    steam_status_label(&steam_state, downloading_dir_size);
                                let (bytes_downloaded, bytes_total) =
                                    steam_progress_bytes(&steam_state, downloading_dir_size);
                                update_download_metrics(
                                    &game_id_clone,
                                    steam_phase(&steam_state, downloading_dir_size),
                                    bytes_downloaded,
                                    bytes_total,
                                );
                                update_download_status(
                                    &game_id_clone,
                                    "downloading",
                                    speed_str,
                                    progress,
                                    999,
                                );
                                emit_download_progress(
                                    &app_clone,
                                    &game_id_clone,
                                    progress,
                                    speed_str,
                                    "downloading",
                                    999,
                                );
                            } else {
                                let speed_str = "Steam (Initializing...)";
                                update_download_status(
                                    &game_id_clone,
                                    "downloading",
                                    speed_str,
                                    progress,
                                    999,
                                );
                                emit_download_progress(
                                    &app_clone,
                                    &game_id_clone,
                                    progress,
                                    speed_str,
                                    "downloading",
                                    999,
                                );
                            }
                        } else {
                            let speed_str = "Steam (Connecting...)";
                            update_download_status(
                                &game_id_clone,
                                "downloading",
                                speed_str,
                                progress,
                                999,
                            );
                            emit_download_progress(
                                &app_clone,
                                &game_id_clone,
                                progress,
                                speed_str,
                                "downloading",
                                999,
                            );
                        }
                    } else {
                        // Manifest path does not exist yet (Steam is launching/initializing)
                        let speed_str = "Steam (Starting...)";
                        update_download_status(
                            &game_id_clone,
                            "downloading",
                            speed_str,
                            progress,
                            999,
                        );
                        emit_download_progress(
                            &app_clone,
                            &game_id_clone,
                            progress,
                            speed_str,
                            "downloading",
                            999,
                        );
                    }
                    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                } else {
                    // Fallback tracker with background verification. These launchers do not expose
                    // trustworthy byte progress here, so keep the percentage honest until detected.
                    let clean_id = game_id_clone.replace("-owned-", "-");
                    let platform = get_platform_from_game_id(&game_id_clone);

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
                        "Xbox Game Pass" => crate::commands::games::detect::scan_xbox_games()
                            .iter()
                            .any(|g| g.id == clean_id),
                        _ => false,
                    };

                    if is_installed && external_started_at.elapsed().as_secs() >= 10 {
                        external_installed_seen_count =
                            external_installed_seen_count.saturating_add(1);
                    } else {
                        external_installed_seen_count = 0;
                    }

                    if external_installed_seen_count >= 2 {
                        progress = 100;
                        let speed_str = format!("{platform} (Done)");
                        update_download_status(
                            &game_id_clone,
                            "completed",
                            &speed_str,
                            progress,
                            0,
                        );
                        emit_download_progress(
                            &app_clone,
                            &game_id_clone,
                            progress,
                            &speed_str,
                            "completed",
                            0,
                        );
                        break;
                    }

                    progress = 0;
                    let speed_str = format!("{platform} (External)");
                    update_download_metrics(&game_id_clone, "external", None, None);
                    update_download_status(
                        &game_id_clone,
                        "downloading",
                        &speed_str,
                        progress,
                        999,
                    );
                    emit_download_progress(
                        &app_clone,
                        &game_id_clone,
                        progress,
                        &speed_str,
                        "downloading",
                        999,
                    );
                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                }
            }

            // Loop finished, cleanup. Bound the wait so a hung legendary process does not strand the entry.
            if let Some(mut child) = epic_child.take() {
                match tokio::time::timeout(std::time::Duration::from_secs(10), child.wait()).await {
                    Ok(_) => {}
                    Err(_) => {
                        let _ = child.kill().await;
                        let _ = child.wait().await;
                    }
                }
            }
        } else {
            let Some(source) = internal_download_source else {
                let message = "No download source configured for this game.";
                update_download_status(&game_id_clone, "error", message, 0, 0);
                emit_download_progress(&app_clone, &game_id_clone, 0, message, "error", 0);
                return;
            };
            let Some(install_dir) = default_install_dir(&game_id_clone) else {
                let message = "Could not resolve install directory.";
                update_download_status(&game_id_clone, "error", message, 0, 0);
                emit_download_progress(&app_clone, &game_id_clone, 0, message, "error", 0);
                return;
            };

            match download_internal_game_file(
                &app_clone,
                &game_id_clone,
                &title_clone,
                &source,
                &install_dir,
                &pause_rx,
                &cancel_rx,
            )
            .await
            {
                Ok(downloaded_file) => {
                    match install_downloaded_game_package(
                        &app_clone,
                        &game_id_clone,
                        &title_clone,
                        &install_dir,
                        &source,
                        &downloaded_file,
                    ) {
                        Ok(installed_package) => {
                            if let Err(error) = write_downloaded_game_manifest(
                                &game_id_clone,
                                &title_clone,
                                &install_dir,
                                &source,
                                &downloaded_file,
                                &installed_package,
                            ) {
                                update_download_status(&game_id_clone, "error", &error, 0, 0);
                                emit_download_progress(
                                    &app_clone,
                                    &game_id_clone,
                                    0,
                                    &error,
                                    "error",
                                    0,
                                );
                            } else {
                                update_installed_games_cache_for_download(
                                    &game_id_clone,
                                    &title_clone,
                                    &install_dir,
                                    Some(installed_package.executable_path.as_path()),
                                );
                                let _ = app_clone.emit(
                                    "library_inventory_changed",
                                    serde_json::json!({
                                        "reason": "download_completed",
                                        "gameCount": 0
                                    }),
                                );
                                update_download_status(&game_id_clone, "completed", "Done", 100, 0);
                                emit_download_progress(
                                    &app_clone,
                                    &game_id_clone,
                                    100,
                                    "Complete",
                                    "completed",
                                    0,
                                );
                            }
                        }
                        Err(error) => {
                            update_download_status(&game_id_clone, "error", &error, 0, 0);
                            emit_download_progress(
                                &app_clone,
                                &game_id_clone,
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
                    update_download_status(&game_id_clone, status, &error, 0, 0);
                    emit_download_progress(&app_clone, &game_id_clone, 0, &error, status, 0);
                }
            }

            let _ = cancellable_sleep(&cancel_rx, tokio::time::Duration::from_secs(2)).await;
            if let Ok(mut guard) = get_download_manager().lock() {
                guard.remove(&game_id_clone);
            }
            return;
        }

        // Emit library_inventory_changed so the frontend reloads
        // the full game list and picks up the new "installed" status.
        let _ = app_clone.emit(
            "library_inventory_changed",
            serde_json::json!({
                "reason": "download_completed",
                "gameCount": 0
            }),
        );

        update_download_status(&game_id_clone, "completed", "Done", 100, 0);
        emit_download_progress(&app_clone, &game_id_clone, 100, "Complete", "completed", 0);

        // Remove from manager after 2 seconds (cancellable so a quick app close does not strand the entry)
        let _ = cancellable_sleep(&cancel_rx, tokio::time::Duration::from_secs(2)).await;
        if let Ok(mut guard) = get_download_manager().lock() {
            guard.remove(&game_id_clone);
        }
    });

    Ok(StartDownloadResponse {
        game_id,
        download_id,
        status: DownloadStartStatus::Started,
        message: if is_external_download {
            external_message
        } else {
            "Download started.".to_string()
        },
    })
}


pub(crate) fn emit_download_progress(
    app: &tauri::AppHandle,
    game_id: &str,
    progress: u32,
    speed: &str,
    status: &str,
    eta: u32,
) {
    let status = validated_download_status(status);
    let mut payload = get_download_manager()
        .lock()
        .ok()
        .and_then(|guard| {
            guard
                .get(game_id)
                .map(|dl| payload_from_active_download(game_id, dl))
        })
        .unwrap_or_else(|| default_download_payload(game_id, ""));
    payload.progress = normalize_progress(progress, status);
    payload.speed = speed.to_string();
    payload.status = status.to_string();
    payload.eta = eta;
    payload.phase = phase_from_status_and_speed(status, speed);
    payload = normalize_queue_payload(payload);
    if is_stale_installed_download(&payload) {
        remove_download_history_item(game_id);
        emit_download_removed(app, game_id);
        return;
    }
    remember_download_item(payload.clone());
    let _ = app.emit("download_progress", payload);
}

fn payload_from_active_download(game_id: &str, dl: &ActiveDownload) -> DownloadItemPayload {
    normalize_queue_payload(DownloadItemPayload {
        id: format!("download-{game_id}"),
        game_id: game_id.to_string(),
        title: dl.title.clone(),
        progress: dl.progress,
        speed: dl.speed.clone(),
        status: dl.status.clone(),
        eta: dl.eta,
        platform: get_platform_from_game_id(game_id),
        phase: dl.phase.clone(),
        bytes_downloaded: dl.bytes_downloaded,
        bytes_total: dl.bytes_total,
        can_pause: dl.can_pause,
        can_cancel: dl.can_cancel,
        external: dl.external,
        last_updated_at: 0,
        provider: provider_key_from_game_id(game_id),
        raw_status: dl.raw_status.clone(),
        progress_source: progress_source_from_game_id(game_id),
        error: dl.error.clone(),
    })
}

fn default_download_payload(game_id: &str, title: &str) -> DownloadItemPayload {
    normalize_queue_payload(DownloadItemPayload {
        id: format!("download-{game_id}"),
        game_id: game_id.to_string(),
        title: title.to_string(),
        progress: 0,
        speed: "Waiting...".to_string(),
        status: "downloading".to_string(),
        eta: 0,
        platform: get_platform_from_game_id(game_id),
        phase: "download".to_string(),
        bytes_downloaded: None,
        bytes_total: None,
        can_pause: true,
        can_cancel: true,
        external: false,
        last_updated_at: 0,
        provider: provider_key_from_game_id(game_id),
        raw_status: String::new(),
        progress_source: progress_source_from_game_id(game_id),
        error: None,
    })
}

fn normalize_queue_payload(mut item: DownloadItemPayload) -> DownloadItemPayload {
    item.status = validated_download_status(&item.status).to_string();
    if item.id.trim().is_empty() {
        item.id = format!("download-{}", item.game_id);
    }
    if item.platform.trim().is_empty() {
        item.platform = get_platform_from_game_id(&item.game_id);
    }
    if item.phase.trim().is_empty() {
        item.phase = phase_from_status_and_speed(&item.status, &item.speed);
    }
    if item.provider.trim().is_empty() {
        item.provider = provider_key_from_game_id(&item.game_id);
    }
    if item.progress_source.trim().is_empty() {
        item.progress_source = progress_source_from_game_id(&item.game_id);
    }
    if item.raw_status.trim().is_empty() {
        item.raw_status = item.status.clone();
    }

    let is_terminal = is_terminal_download_status(&item.status);
    let external = item.external || is_external_tracker_game_id(&item.game_id);
    let supports_external_pause = is_steam_tracker_game_id(&item.game_id);
    item.external = external;
    item.progress = normalize_progress(item.progress, &item.status);
    item.can_pause = item.can_pause
        && is_pause_toggle_status(&item.status)
        && (!external || supports_external_pause)
        && !is_terminal;
    item.can_cancel = item.can_cancel && !external && !is_terminal;

    item
}

fn is_stale_installed_download(item: &DownloadItemPayload) -> bool {
    if is_terminal_download_status(&item.status) {
        return false;
    }
    if !item.external && item.progress < 99 {
        return false;
    }

    is_download_game_installed(&item.game_id) && !has_active_download_work(item)
}

fn load_download_history() -> Vec<DownloadItemPayload> {
    let items = crate::commands::local_db::read_collection::<DownloadItemPayload>("downloads")
        .unwrap_or_default();
    let original_len = items.len();
    let mut changed = false;

    let mut normalized_items = Vec::with_capacity(original_len);
    for item in items {
        let mut item = normalize_queue_payload(item);
        if is_restart_interrupted_download_status(&item.status) {
            item.status = DOWNLOAD_STATUS_PAUSED.to_string();
            item.speed = if item.external {
                "External tracker needs refresh".to_string()
            } else {
                "Interrupted".to_string()
            };
            item.phase = "interrupted".to_string();
            item.can_pause = false;
            item.can_cancel = false;
            changed = true;
        }
        normalized_items.push(normalize_queue_payload(item));
    }

    let filtered_items = normalized_items
        .into_iter()
        .filter(|item| !is_stale_installed_download(item))
        .collect::<Vec<_>>();

    if changed || filtered_items.len() != original_len {
        save_download_history(&filtered_items);
    }

    filtered_items
}

fn remember_download_item(mut item: DownloadItemPayload) {
    item.last_updated_at = now_unix_secs();
    let mut items = load_download_history();
    let item = normalize_queue_payload(item);
    if is_stale_installed_download(&item) {
        items.retain(|existing| existing.game_id != item.game_id);
        save_download_history(&items);
        let _ = crate::commands::local_db::remove_item("downloads", &item.game_id);
        return;
    }

    if let Some(index) = items
        .iter()
        .position(|existing| existing.game_id == item.game_id)
    {
        items[index] = item;
    } else {
        items.push(item);
    }
    save_download_history(&items);
}

pub fn record_download_item(item: DownloadItemPayload) {
    remember_download_item(item);
}

fn remove_download_history_item(game_id: &str) {
    let mut items = load_download_history();
    items.retain(|item| item.game_id != game_id);
    save_download_history(&items);
    let _ = crate::commands::local_db::remove_item("downloads", game_id);
}


pub fn start_global_download_watcher(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            // Watch Steam downloads across all library folders
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

                                        // Is it actively downloading/updating?
                                        let downloading_dir =
                                            steamapps.join("downloading").join(&app_id);
                                        let downloading_dir_size = get_dir_size(&downloading_dir);
                                        let is_actively_downloading =
                                            steam_state.has_active_work(downloading_dir_size);

                                        if is_actively_downloading {
                                            let game_id = format!("steam-owned-{app_id}");

                                            // Check if it's already in the download manager
                                            let is_tracked = {
                                                let map = get_download_manager();
                                                if let Ok(guard) = map.lock() {
                                                    guard.contains_key(&game_id)
                                                } else {
                                                    false
                                                }
                                            };

                                            if !is_tracked {
                                                // Auto-add it!
                                                let title = extract_vdf_string(&contents, "name")
                                                    .unwrap_or_else(|| {
                                                        format!("Steam Game {app_id}")
                                                    });
                                                let map = get_download_manager();
                                                if let Ok(mut guard) = map.lock() {
                                                    let (pause_tx, pause_rx) =
                                                        tokio::sync::watch::channel(false);
                                                    let (cancel_tx, _) =
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
                                                        remember_download_item(
                                                            payload_from_active_download(
                                                                &game_id, dl,
                                                            ),
                                                        );
                                                    }

                                                    // Create a dedicated tracker task for this auto-detected download
                                                    let app_clone = app.clone();
                                                    let game_id_clone = game_id.clone();
                                                    let manifest_path = path.clone();
                                                    let downloading_dir_clone =
                                                        downloading_dir.clone();
                                                    tokio::spawn(async move {
                                                        let pause_rx = pause_rx;
                                                        let mut current_progress = progress;
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

                                                                if steam_state.is_fully_installed(
                                                                    downloading_dir_size,
                                                                ) {
                                                                    break; // Fully installed
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
                                                                break; // Manifest gone
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

                                                        // Emit refresh
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
                                                        if let Ok(mut guard) =
                                                            get_download_manager().lock()
                                                        {
                                                            guard.remove(&game_id_clone);
                                                        }
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

// Provider Health Check


// Download Reconciliation

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReconciliationResult {
    pub installed_removed: Vec<String>,
    pub active_restored: Vec<String>,
    pub stale_cleaned: Vec<String>,
    pub errors: Vec<String>,
}

pub fn reconcile_downloads(app: tauri::AppHandle) -> Result<ReconciliationResult, String> {
    let mut result = ReconciliationResult {
        installed_removed: Vec::new(),
        active_restored: Vec::new(),
        stale_cleaned: Vec::new(),
        errors: Vec::new(),
    };

    let history = load_download_history();
    let mut updated_items: Vec<DownloadItemPayload> = Vec::new();
    let now = now_unix_secs();
    let stale_threshold = 7 * 24 * 60 * 60; // 7 days

    // Pre-scan installed games for each provider
    let epic_installed: std::collections::HashSet<String> = {
        crate::commands::games::detect::scan_epic_games()
            .into_iter()
            .map(|g| g.id)
            .collect()
    };
    let ea_installed: std::collections::HashSet<String> = {
        crate::commands::games::detect::scan_ea_games()
            .into_iter()
            .map(|g| g.id)
            .collect()
    };
    let battlenet_installed: std::collections::HashSet<String> = {
        crate::commands::games::detect::scan_battlenet_games()
            .into_iter()
            .map(|g| g.id)
            .collect()
    };

    for mut item in history {
        let is_terminal = is_terminal_download_status(&item.status);

        // Check if a non-terminal item is actually installed now
        if !is_terminal {
            let is_now_installed = is_download_game_installed(&item.game_id);

            if is_now_installed && !has_active_download_work(&item) {
                // Game is installed and no active download work -> mark completed
                item.status = DOWNLOAD_STATUS_COMPLETED.to_string();
                item.progress = 100;
                item.speed = "Reconciled".to_string();
                item.phase = "completed".to_string();
                item.can_pause = false;
                item.can_cancel = false;
                item.last_updated_at = now;
                result.installed_removed.push(item.game_id.clone());
            }
        }

        // Check for stale entries: non-terminal, old last_updated_at, no provider confirmation
        if !is_terminal && !is_terminal_download_status(&item.status) {
            let age = now.saturating_sub(item.last_updated_at);
            if item.last_updated_at > 0 && age > stale_threshold {
                // Check if provider confirms it's still active
                let provider_confirms =
                    if let Some(app_id) = steam_app_id_from_download_id(&item.game_id) {
                        steam_download_work_exists(app_id)
                    } else if item.game_id.starts_with("epic-") {
                        epic_installed.contains(&item.game_id)
                    } else if item.game_id.starts_with("ea-") {
                        ea_installed.contains(&item.game_id)
                    } else if item.game_id.starts_with("battlenet-") {
                        battlenet_installed.contains(&item.game_id)
                    } else {
                        false
                    };

                if !provider_confirms {
                    result.stale_cleaned.push(item.game_id.clone());
                    continue; // Drop this item from the history
                }
            }
        }

        // Check for Steam downloads that are active but were paused/interrupted
        if let Some(app_id) = steam_app_id_from_download_id(&item.game_id) {
            if (is_terminal_download_status(&item.status) || item.status == DOWNLOAD_STATUS_PAUSED)
                && steam_download_work_exists(app_id)
            {
                // Steam is actively downloading this but we had it as paused/terminal
                item.status = DOWNLOAD_STATUS_DOWNLOADING.to_string();
                item.speed = "Steam".to_string();
                item.phase = "external".to_string();
                item.external = true;
                item.can_pause = true;
                item.last_updated_at = now;
                result.active_restored.push(item.game_id.clone());
            }
        }

        updated_items.push(item);
    }

    // Save the reconciled history
    save_download_history(&updated_items);

    // Emit library change event if anything changed
    if !result.installed_removed.is_empty()
        || !result.active_restored.is_empty()
        || !result.stale_cleaned.is_empty()
    {
        let _ = app.emit(
            "library_inventory_changed",
            serde_json::json!({
                "reason": "reconciliation",
                "gameCount": updated_items.len()
            }),
        );
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_queue_payload_allows_steam_external_pause_only() {
        let steam_item = normalize_queue_payload(DownloadItemPayload {
            id: "download-steam-owned-12345".to_string(),
            game_id: "steam-owned-12345".to_string(),
            title: "Steam Game".to_string(),
            progress: 50,
            speed: "Steam Downloading".to_string(),
            status: "downloading".to_string(),
            eta: 999,
            platform: "Steam".to_string(),
            phase: "external".to_string(),
            bytes_downloaded: None,
            bytes_total: None,
            can_pause: true,
            can_cancel: true,
            external: true,
            last_updated_at: 0,
            provider: String::new(),
            raw_status: String::new(),
            progress_source: String::new(),
            error: None,
        });

        let epic_item = normalize_queue_payload(DownloadItemPayload {
            id: "download-epic-owned-game".to_string(),
            game_id: "epic-owned-game".to_string(),
            title: "Epic Game".to_string(),
            progress: 0,
            speed: "Epic Games (External)".to_string(),
            status: "downloading".to_string(),
            eta: 999,
            platform: "Epic Games".to_string(),
            phase: "external".to_string(),
            bytes_downloaded: None,
            bytes_total: None,
            can_pause: true,
            can_cancel: true,
            external: true,
            last_updated_at: 0,
            provider: String::new(),
            raw_status: String::new(),
            progress_source: String::new(),
            error: None,
        });

        assert!(steam_item.can_pause);
        assert!(!steam_item.can_cancel);
        assert!(!epic_item.can_pause);
        assert!(!epic_item.can_cancel);
    }

    #[test]
    fn normalize_queue_payload_blocks_pause_while_steam_control_is_pending() {
        let pausing_item = normalize_queue_payload(DownloadItemPayload {
            id: "download-steam-owned-12345".to_string(),
            game_id: "steam-owned-12345".to_string(),
            title: "Steam Game".to_string(),
            progress: 50,
            speed: "Steam Pausing...".to_string(),
            status: DOWNLOAD_STATUS_PAUSING.to_string(),
            eta: 0,
            platform: "Steam".to_string(),
            phase: "paused".to_string(),
            bytes_downloaded: None,
            bytes_total: None,
            can_pause: true,
            can_cancel: false,
            external: true,
            last_updated_at: 0,
            provider: String::new(),
            raw_status: String::new(),
            progress_source: String::new(),
            error: None,
        });

        let paused_item = normalize_queue_payload(DownloadItemPayload {
            status: DOWNLOAD_STATUS_PAUSED.to_string(),
            speed: "Steam Paused".to_string(),
            can_pause: true,
            ..pausing_item.clone()
        });

        assert!(!pausing_item.can_pause);
        assert!(paused_item.can_pause);
    }

    #[test]
    fn restart_interrupted_statuses_are_not_loaded_as_active() {
        assert!(is_restart_interrupted_download_status(
            DOWNLOAD_STATUS_DOWNLOADING
        ));
        assert!(is_restart_interrupted_download_status(
            DOWNLOAD_STATUS_STARTING
        ));
        assert!(is_restart_interrupted_download_status(
            DOWNLOAD_STATUS_INSTALLING
        ));
        assert!(!is_restart_interrupted_download_status(
            DOWNLOAD_STATUS_PAUSED
        ));
        assert!(!is_restart_interrupted_download_status(
            DOWNLOAD_STATUS_COMPLETED
        ));
    }

    #[test]
    fn download_status_state_machine_validates_unknown_values() {
        assert_eq!(
            validated_download_status(DOWNLOAD_STATUS_DOWNLOADING),
            DOWNLOAD_STATUS_DOWNLOADING
        );
        assert_eq!(validated_download_status("mystery"), DOWNLOAD_STATUS_FAILED);
        assert!(DownloadStatusKind::parse(DOWNLOAD_STATUS_PAUSING)
            .is_some_and(DownloadStatusKind::is_steam_control_pending));
        assert!(DownloadStatusKind::parse(DOWNLOAD_STATUS_RESUMING)
            .is_some_and(DownloadStatusKind::is_steam_control_pending));
        assert!(!DownloadStatusKind::parse(DOWNLOAD_STATUS_INSTALLING)
            .is_some_and(DownloadStatusKind::is_pause_toggle));
    }

    #[test]
    fn normalize_queue_payload_converts_unknown_status_to_failed() {
        let item = normalize_queue_payload(DownloadItemPayload {
            id: "download-manual-test".to_string(),
            game_id: "manual-test".to_string(),
            title: "Manual Test".to_string(),
            progress: 77,
            speed: "Unknown".to_string(),
            status: "weird".to_string(),
            eta: 999,
            platform: "OG Store".to_string(),
            phase: String::new(),
            bytes_downloaded: None,
            bytes_total: None,
            can_pause: true,
            can_cancel: true,
            external: false,
            last_updated_at: 0,
            provider: String::new(),
            raw_status: String::new(),
            progress_source: String::new(),
            error: None,
        });

        assert_eq!(item.status, DOWNLOAD_STATUS_FAILED);
        assert_eq!(item.progress, 77);
        assert!(!item.can_pause);
        assert!(!item.can_cancel);
    }

    #[test]
    fn external_tracker_phase_stays_external_without_fake_progress() {
        assert_eq!(
            phase_from_status_and_speed("downloading", "Xbox Game Pass (External)"),
            "external"
        );
        assert_eq!(
            phase_from_status_and_speed("downloading", "EA App (External)"),
            "external"
        );
    }
}

