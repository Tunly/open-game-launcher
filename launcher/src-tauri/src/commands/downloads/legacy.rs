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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SteamCefTarget {
    #[serde(default)]
    title: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    web_socket_debugger_url: Option<String>,
}

const STEAM_CONTROL_TIMEOUT: Duration = Duration::from_secs(8);

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

async fn download_internal_game_file(
    app: &tauri::AppHandle,
    game_id: &str,
    _title: &str,
    source: &InternalDownloadSource,
    install_dir: &PathBuf,
    pause_rx: &watch::Receiver<bool>,
    cancel_rx: &watch::Receiver<bool>,
) -> Result<PathBuf, String> {
    let parsed_url = reqwest::Url::parse(&source.url)
        .map_err(|error| format!("Invalid download URL: {error}"))?;
    if parsed_url.scheme() != "https" && parsed_url.scheme() != "http" {
        return Err("Download URL must use http or https.".to_string());
    }

    tokio::fs::create_dir_all(install_dir)
        .await
        .map_err(|error| format!("Could not create install directory: {error}"))?;

    let file_name = download_file_name(&parsed_url, game_id);
    let final_path = install_dir.join(&file_name);
    let part_path = install_dir.join(format!("{file_name}.part"));
    let client = shared_http_client();
    let mut attempt = 0u8;

    loop {
        attempt += 1;
        match download_internal_game_file_once(
            app,
            game_id,
            client,
            &source.url,
            &part_path,
            &final_path,
            pause_rx,
            cancel_rx,
        )
        .await
        {
            Ok(()) => {
                if let Some(expected_sha256) = source.sha256.as_deref() {
                    verify_sha256(&final_path, expected_sha256)?;
                }
                return Ok(final_path);
            }
            Err(error) if error == "Download cancelled." => return Err(error),
            Err(error) if attempt < 3 => {
                update_download_status(game_id, "downloading", "Retrying", 0, 999);
                emit_download_progress(
                    app,
                    game_id,
                    0,
                    &format!("Retry {attempt}/3: {error}"),
                    "downloading",
                    999,
                );
                let backoff = tokio::time::Duration::from_secs(2u64.pow(attempt as u32));
                if cancellable_sleep(cancel_rx, backoff).await {
                    return Err("Download cancelled.".to_string());
                }
            }
            Err(error) => return Err(error),
        }
    }
}

async fn download_internal_game_file_once(
    app: &tauri::AppHandle,
    game_id: &str,
    client: &reqwest::Client,
    source_url: &str,
    part_path: &PathBuf,
    final_path: &PathBuf,
    pause_rx: &watch::Receiver<bool>,
    cancel_rx: &watch::Receiver<bool>,
) -> Result<(), String> {
    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;

    let existing_bytes = tokio::fs::metadata(part_path)
        .await
        .map(|metadata| metadata.len())
        .unwrap_or(0);

    let mut request = client.get(source_url);
    if existing_bytes > 0 {
        request = request.header(reqwest::header::RANGE, format!("bytes={existing_bytes}-"));
    }

    let response = request
        .send()
        .await
        .map_err(|error| format!("Download request failed: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("Download failed with status {status}"));
    }

    let resumes = status == reqwest::StatusCode::PARTIAL_CONTENT;
    let offset = if existing_bytes > 0 && resumes {
        existing_bytes
    } else {
        0
    };
    let total_bytes = response
        .content_length()
        .map(|length| length.saturating_add(offset));
    let mut downloaded = offset;
    let mut bytes_since_last_update = 0u64;
    let mut last_update = Instant::now();

    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .append(resumes)
        .truncate(!resumes)
        .open(part_path)
        .await
        .map_err(|error| format!("Could not open partial download: {error}"))?;

    update_download_metrics(game_id, "download", Some(downloaded), total_bytes);
    let initial_progress = total_bytes
        .map(|total| calculate_active_progress(downloaded, total))
        .unwrap_or(0);
    emit_download_progress(
        app,
        game_id,
        initial_progress,
        "Connecting",
        "downloading",
        999,
    );

    let mut body = response.bytes_stream();
    while let Some(chunk) = body.next().await {
        if *cancel_rx.borrow() {
            let _ = tokio::fs::remove_file(part_path).await;
            return Err("Download cancelled.".to_string());
        }

        while *pause_rx.borrow() {
            let progress = total_bytes
                .map(|total| calculate_active_progress(downloaded, total))
                .unwrap_or(0);
            update_download_status(game_id, "paused", "Paused", progress, 0);
            emit_download_progress(app, game_id, progress, "Paused", "paused", 0);
            tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
            if *cancel_rx.borrow() {
                let _ = tokio::fs::remove_file(part_path).await;
                return Err("Download cancelled.".to_string());
            }
        }

        let chunk = chunk.map_err(|error| format!("Download stream error: {error}"))?;
        file.write_all(&chunk)
            .await
            .map_err(|error| format!("Could not write download chunk: {error}"))?;

        downloaded = downloaded.saturating_add(chunk.len() as u64);
        bytes_since_last_update = bytes_since_last_update.saturating_add(chunk.len() as u64);

        let elapsed_ms = last_update.elapsed().as_millis();
        if elapsed_ms >= 300 {
            let speed_bytes_per_sec =
                (bytes_since_last_update as f64) / (elapsed_ms as f64 / 1000.0);
            let speed_mb_sec = speed_bytes_per_sec / (1024.0 * 1024.0);
            let speed = format!("{speed_mb_sec:.1} MB/s");
            let progress = total_bytes
                .map(|total| calculate_active_progress(downloaded, total))
                .unwrap_or(0);
            let eta = total_bytes
                .and_then(|total| {
                    if speed_bytes_per_sec > 0.0 {
                        Some((total.saturating_sub(downloaded) as f64 / speed_bytes_per_sec) as u32)
                    } else {
                        None
                    }
                })
                .unwrap_or(999);

            update_download_metrics(game_id, "download", Some(downloaded), total_bytes);
            update_download_status(game_id, "downloading", &speed, progress, eta);
            emit_download_progress(app, game_id, progress, &speed, "downloading", eta);
            bytes_since_last_update = 0;
            last_update = Instant::now();
        }
    }

    file.flush()
        .await
        .map_err(|error| format!("Could not flush downloaded file: {error}"))?;
    drop(file);

    if let Some(total) = total_bytes {
        if downloaded < total {
            return Err(format!(
                "Download incomplete: {downloaded} of {total} bytes."
            ));
        }
    }

    if final_path.exists() {
        tokio::fs::remove_file(final_path)
            .await
            .map_err(|error| format!("Could not replace existing file: {error}"))?;
    }
    tokio::fs::rename(part_path, final_path)
        .await
        .map_err(|error| format!("Could not finalize download: {error}"))?;

    Ok(())
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

fn has_active_download_work(item: &DownloadItemPayload) -> bool {
    if let Some(app_id) = steam_app_id_from_download_id(&item.game_id) {
        return steam_download_work_exists(app_id);
    }

    false
}

fn steam_download_work_exists(app_id: &str) -> bool {
    let Some(manifest_path) = find_steam_app_manifest(app_id) else {
        return false;
    };
    let Ok(contents) = std::fs::read_to_string(&manifest_path) else {
        return false;
    };
    let state = parse_steam_download_state(&contents);
    let downloading_dir_size = steam_downloading_dir_for_manifest(&manifest_path, app_id)
        .map(get_dir_size)
        .unwrap_or(0);

    state.has_active_work(downloading_dir_size)
}

fn find_steam_app_manifest(app_id: &str) -> Option<PathBuf> {
    let steam_path = crate::commands::games::detect::find_steam_dir()?;
    let main_path = steam_path
        .join("steamapps")
        .join(format!("appmanifest_{app_id}.acf"));
    if main_path.exists() {
        return Some(main_path);
    }

    crate::commands::games::detect::read_steam_library_folders(&steam_path)
        .into_iter()
        .map(|library| {
            library
                .join("steamapps")
                .join(format!("appmanifest_{app_id}.acf"))
        })
        .find(|path| path.exists())
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

fn save_download_history(items: &[DownloadItemPayload]) {
    let trimmed = trim_download_history(items);
    let _ =
        crate::commands::local_db::write_collection("downloads", &trimmed, |item| &item.game_id);
}

const MAX_DOWNLOAD_HISTORY_ITEMS: usize = 200;
const TERMINAL_ITEM_TTL_SECS: u64 = 30 * 24 * 60 * 60;

fn trim_download_history(items: &[DownloadItemPayload]) -> Vec<DownloadItemPayload> {
    // First pass: drop terminal items that are older than TTL. Legacy entries with
    // last_updated_at == 0 are kept (treated as "unknown age") to avoid wiping
    // pre-existing history on first run after upgrade.
    let now = now_unix_secs();
    let mut filtered: Vec<DownloadItemPayload> = items
        .iter()
        .filter(|item| {
            if !is_terminal_download_status(&item.status) {
                return true;
            }
            if item.last_updated_at == 0 {
                return true;
            }
            now.saturating_sub(item.last_updated_at) <= TERMINAL_ITEM_TTL_SECS
        })
        .cloned()
        .collect();

    if filtered.len() <= MAX_DOWNLOAD_HISTORY_ITEMS {
        return filtered;
    }

    // Second pass: keep every non-terminal item; evict the oldest terminal items to make room.
    let mut non_terminal: Vec<DownloadItemPayload> = Vec::new();
    let mut terminal: Vec<DownloadItemPayload> = Vec::new();
    for item in &filtered {
        if is_terminal_download_status(&item.status) {
            terminal.push(item.clone());
        } else {
            non_terminal.push(item.clone());
        }
    }
    filtered.clear();

    let non_terminal_len = non_terminal.len();
    if non_terminal_len >= MAX_DOWNLOAD_HISTORY_ITEMS {
        non_terminal.truncate(MAX_DOWNLOAD_HISTORY_ITEMS);
        return non_terminal;
    }

    let keep_terminal = MAX_DOWNLOAD_HISTORY_ITEMS - non_terminal_len;
    if terminal.len() > keep_terminal {
        // Preserve the most recently written terminal items (they sit at the tail).
        let drop = terminal.len() - keep_terminal;
        terminal.drain(..drop);
    }
    non_terminal.extend(terminal);
    non_terminal
}

fn terminal_sort_rank(status: &str) -> u8 {
    if is_terminal_download_status(status) {
        1
    } else {
        0
    }
}

fn toggle_steam_download_pause(
    app: tauri::AppHandle,
    game_id: &str,
    steam_app_id: &str,
) -> Result<(), String> {
    let app_id = steam_app_id
        .parse::<u32>()
        .map_err(|error| format!("Invalid Steam app id: {error}"))?;

    let action = {
        let map = get_download_manager();
        let guard = map
            .lock()
            .map_err(|error| format!("Download manager lock poisoned: {error}"))?;
        match guard.get(game_id) {
            Some(download) if is_steam_control_pending_status(&download.status) => {
                return Ok(());
            }
            Some(download) if download.status == DOWNLOAD_STATUS_PAUSED || download.paused => {
                SteamDownloadControlAction::Resume
            }
            _ => SteamDownloadControlAction::Pause,
        }
    };

    set_steam_download_control_pending(&app, game_id, action)?;

    let app_clone = app.clone();
    let game_id_clone = game_id.to_string();
    tokio::runtime::Handle::current().spawn_blocking(move || {
        let result = try_control_steam_download_with_timeout(app_id, action);
        finish_steam_download_control(&app_clone, &game_id_clone, action, result);
    });

    Ok(())
}

fn set_steam_download_control_pending(
    app: &tauri::AppHandle,
    game_id: &str,
    action: SteamDownloadControlAction,
) -> Result<(), String> {
    let Some((progress, speed, status, eta)) = update_steam_download_control_state(
        game_id,
        action,
        SteamDownloadControlStage::Pending,
        None,
    )?
    else {
        return Ok(());
    };

    emit_download_progress(app, game_id, progress, &speed, &status, eta);
    Ok(())
}

fn finish_steam_download_control(
    app: &tauri::AppHandle,
    game_id: &str,
    action: SteamDownloadControlAction,
    result: Result<(), String>,
) {
    let error_message = result.err();
    let stage = if error_message.is_some() {
        SteamDownloadControlStage::Failed
    } else {
        SteamDownloadControlStage::Applied
    };

    if let Ok(Some((progress, speed, status, eta))) =
        update_steam_download_control_state(game_id, action, stage, error_message.as_deref())
    {
        emit_download_progress(app, game_id, progress, &speed, &status, eta);
    }

    if let Some(message) = error_message {
        emit_download_command_error(app, game_id, &message);
    }
}

#[derive(Copy, Clone)]
enum SteamDownloadControlStage {
    Pending,
    Applied,
    Failed,
}

fn update_steam_download_control_state(
    game_id: &str,
    action: SteamDownloadControlAction,
    stage: SteamDownloadControlStage,
    error_message: Option<&str>,
) -> Result<Option<(u32, String, String, u32)>, String> {
    let map = get_download_manager();
    let mut guard = map
        .lock()
        .map_err(|error| format!("Download manager lock poisoned: {error}"))?;
    let Some(download) = guard.get_mut(game_id) else {
        return Ok(None);
    };

    match (action, stage) {
        (SteamDownloadControlAction::Pause, SteamDownloadControlStage::Pending) => {
            download.paused = true;
            download.status = DOWNLOAD_STATUS_PAUSING.to_string();
            download.speed = "Steam Pausing...".to_string();
            download.phase = "paused".to_string();
            download.eta = 0;
            download.can_pause = false;
            let _ = download.pause_tx.send(true);
        }
        (SteamDownloadControlAction::Pause, SteamDownloadControlStage::Applied) => {
            download.paused = true;
            download.status = DOWNLOAD_STATUS_PAUSED.to_string();
            download.speed = "Steam Paused".to_string();
            download.phase = "paused".to_string();
            download.eta = 0;
            download.can_pause = true;
            let _ = download.pause_tx.send(true);
        }
        (SteamDownloadControlAction::Pause, SteamDownloadControlStage::Failed) => {
            download.paused = false;
            download.status = DOWNLOAD_STATUS_DOWNLOADING.to_string();
            download.speed = steam_control_failed_speed("Pause", error_message);
            download.phase = "external".to_string();
            download.eta = 999;
            download.can_pause = true;
            let _ = download.pause_tx.send(false);
        }
        (SteamDownloadControlAction::Resume, SteamDownloadControlStage::Pending) => {
            download.paused = false;
            download.status = DOWNLOAD_STATUS_RESUMING.to_string();
            download.speed = "Steam Resuming...".to_string();
            download.phase = "external".to_string();
            download.eta = 999;
            download.can_pause = false;
            let _ = download.pause_tx.send(false);
        }
        (SteamDownloadControlAction::Resume, SteamDownloadControlStage::Applied) => {
            download.paused = false;
            download.status = DOWNLOAD_STATUS_DOWNLOADING.to_string();
            download.speed = "Steam (Resuming...)".to_string();
            download.phase = "external".to_string();
            download.eta = 999;
            download.can_pause = true;
            let _ = download.pause_tx.send(false);
        }
        (SteamDownloadControlAction::Resume, SteamDownloadControlStage::Failed) => {
            download.paused = true;
            download.status = DOWNLOAD_STATUS_PAUSED.to_string();
            download.speed = steam_control_failed_speed("Resume", error_message);
            download.phase = "paused".to_string();
            download.eta = 0;
            download.can_pause = true;
            let _ = download.pause_tx.send(true);
        }
    }

    Ok(Some((
        download.progress,
        download.speed.clone(),
        download.status.clone(),
        download.eta,
    )))
}

fn steam_control_failed_speed(action: &str, error_message: Option<&str>) -> String {
    let Some(error_message) = error_message else {
        return format!("Steam {action} failed");
    };
    let mut message = error_message.replace(['\r', '\n'], " ");
    if message.len() > 140 {
        message.truncate(137);
        message.push_str("...");
    }
    format!("Steam {action} failed: {message}")
}

fn try_control_steam_download(
    app_id: u32,
    action: SteamDownloadControlAction,
) -> Result<(), String> {
    let targets = match steam_cef_targets() {
        Ok(targets) => targets,
        Err(error) => return recover_steam_cef_debugging(app_id, action, error),
    };

    control_steam_download_targets(targets, app_id, action)
}

fn try_control_steam_download_with_timeout(
    app_id: u32,
    action: SteamDownloadControlAction,
) -> Result<(), String> {
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(try_control_steam_download(app_id, action));
    });

    match rx.recv_timeout(STEAM_CONTROL_TIMEOUT) {
        Ok(result) => result,
        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => Err(format!(
            "Steam {} timed out after {}s. The download stays visible; retry when Steam is responsive.",
            match action {
                SteamDownloadControlAction::Pause => "pause",
                SteamDownloadControlAction::Resume => "resume",
            },
            STEAM_CONTROL_TIMEOUT.as_secs()
        )),
        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => Err(format!(
            "Steam {} worker stopped unexpectedly.",
            match action {
                SteamDownloadControlAction::Pause => "pause",
                SteamDownloadControlAction::Resume => "resume",
            }
        )),
    }
}

fn control_steam_download_targets(
    targets: Vec<SteamCefTarget>,
    app_id: u32,
    action: SteamDownloadControlAction,
) -> Result<(), String> {
    let mut last_error = None;

    for target in targets {
        let Some(web_socket_debugger_url) = target.web_socket_debugger_url.as_deref() else {
            continue;
        };

        match control_steam_download_target(web_socket_debugger_url, app_id, action) {
            Ok(()) => return Ok(()),
            Err(error) => last_error = Some(error),
        }
    }

    Err(last_error.unwrap_or_else(|| {
        "Steam CEF remote debugging did not expose a usable SteamClient.Downloads target."
            .to_string()
    }))
}

fn recover_steam_cef_debugging(
    app_id: u32,
    action: SteamDownloadControlAction,
    initial_error: String,
) -> Result<(), String> {
    let marker_result = enable_steam_cef_debug_marker();
    let marker_hint = marker_result
        .as_ref()
        .map(|path| {
            format!(
                "I enabled the CEF debug marker at {}.",
                path.to_string_lossy()
            )
        })
        .unwrap_or_else(|error| format!("Could not enable the CEF debug marker: {error}."));

    if is_steam_process_running() {
        return Err(format!(
            "Steam is already running without CEF remote debugging. {marker_hint} Exit Steam completely via Steam > Exit, start Steam again, then retry Pause/Resume. Previous error: {initial_error}"
        ));
    }

    launch_steam_with_cef_debugging()?;

    for _ in 0..24 {
        std::thread::sleep(Duration::from_millis(500));
        if let Ok(targets) = steam_cef_targets() {
            return control_steam_download_targets(targets, app_id, action);
        }
    }

    Err(format!(
        "Steam was started with -cef-enable-debugging, but CEF remote debugging is not ready yet. Wait until Steam has fully opened, then retry Pause/Resume. {marker_hint} Previous error: {initial_error}"
    ))
}

fn enable_steam_cef_debug_marker() -> Result<PathBuf, String> {
    let steam_dir = crate::commands::games::detect::find_steam_dir()
        .ok_or_else(|| "Steam install directory was not found.".to_string())?;
    let marker_path = steam_dir.join(".cef-enable-remote-debugging");
    if !marker_path.exists() {
        std::fs::write(&marker_path, b"").map_err(|error| {
            format!("Could not write {}: {error}", marker_path.to_string_lossy())
        })?;
    }
    Ok(marker_path)
}

fn is_steam_process_running() -> bool {
    use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};

    let mut system = System::new_all();
    system.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::everything(),
    );
    system.processes().values().any(|process| {
        let name = process.name().to_string_lossy().to_ascii_lowercase();
        matches!(
            name.as_str(),
            "steam.exe" | "steam" | "steamwebhelper.exe" | "steamwebhelper"
        )
    })
}

fn launch_steam_with_cef_debugging() -> Result<(), String> {
    let steam_dir = crate::commands::games::detect::find_steam_dir()
        .ok_or_else(|| "Steam install directory was not found.".to_string())?;

    #[cfg(target_os = "windows")]
    {
        let steam_exe = steam_dir.join("steam.exe");
        if !steam_exe.is_file() {
            return Err(format!(
                "Steam executable was not found at {}.",
                steam_exe.to_string_lossy()
            ));
        }
        Command::new(&steam_exe)
            .arg("-cef-enable-debugging")
            .spawn()
            .map_err(|error| {
                format!(
                    "Could not start Steam with -cef-enable-debugging from {}: {error}",
                    steam_exe.to_string_lossy()
                )
            })?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-a", "Steam", "--args", "-cef-enable-debugging"])
            .spawn()
            .map_err(|error| {
                format!("Could not start Steam with -cef-enable-debugging: {error}")
            })?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let steam_cmd = steam_dir
            .join("steam.sh")
            .to_str()
            .map(|path| path.to_string())
            .unwrap_or_else(|| "steam".to_string());
        Command::new(steam_cmd)
            .arg("-cef-enable-debugging")
            .spawn()
            .map_err(|error| {
                format!("Could not start Steam with -cef-enable-debugging: {error}")
            })?;
    }

    Ok(())
}

fn steam_cef_targets() -> Result<Vec<SteamCefTarget>, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(800))
        .build()
        .map_err(|error| format!("Could not create Steam CEF client: {error}"))?;
    let mut targets = Vec::new();
    let mut last_parse_error = None;

    for port in [8080_u16, 8081, 9222, 9223] {
        let url = format!("http://127.0.0.1:{port}/json");
        let Ok(response) = client.get(&url).send() else {
            continue;
        };
        if !response.status().is_success() {
            continue;
        }

        match response
            .text()
            .map_err(|error| format!("Steam CEF target list read failed: {error}"))
            .and_then(|body| {
                serde_json::from_str::<Vec<SteamCefTarget>>(&body)
                    .map_err(|error| format!("Steam CEF target list parse failed: {error}"))
            }) {
            Ok(mut port_targets) => targets.append(&mut port_targets),
            Err(error) => last_parse_error = Some(error),
        }
    }

    if targets.is_empty() {
        return Err(last_parse_error.unwrap_or_else(|| {
            "Steam CEF remote debugging is not reachable on 127.0.0.1:8080, 8081, 9222, or 9223. Start Steam with -cef-enable-debugging, then retry."
                .to_string()
        }));
    }

    targets.sort_by_key(|target| std::cmp::Reverse(steam_cef_target_score(target)));
    Ok(targets)
}

fn steam_cef_target_score(target: &SteamCefTarget) -> u8 {
    if target.web_socket_debugger_url.is_none() {
        return 0;
    }

    let haystack = format!("{} {}", target.title, target.url).to_ascii_lowercase();
    if haystack.contains("downloads") {
        5
    } else if haystack.contains("library") {
        4
    } else if haystack.contains("steamloopback") || haystack.contains("steam") {
        3
    } else {
        1
    }
}

fn control_steam_download_target(
    web_socket_debugger_url: &str,
    app_id: u32,
    action: SteamDownloadControlAction,
) -> Result<(), String> {
    let (mut socket, _) = tungstenite::connect(web_socket_debugger_url)
        .map_err(|error| format!("Steam CDP connect failed: {error}"))?;

    if let tungstenite::stream::MaybeTlsStream::Plain(stream) = socket.get_mut() {
        let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
        let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
    }

    let request_id = 1_u64;
    let request = serde_json::json!({
        "id": request_id,
        "method": "Runtime.evaluate",
        "params": {
            "expression": steam_download_control_expression(app_id, action),
            "awaitPromise": true,
            "returnByValue": true,
        }
    });

    socket
        .send(tungstenite::Message::text(request.to_string()))
        .map_err(|error| format!("Steam CDP send failed: {error}"))?;

    for _ in 0..64 {
        let message = socket
            .read()
            .map_err(|error| format!("Steam CDP read failed: {error}"))?;
        let text = match message {
            tungstenite::Message::Text(text) => text.to_string(),
            tungstenite::Message::Close(_) => {
                return Err("Steam CDP connection closed.".to_string())
            }
            _ => continue,
        };
        let response: serde_json::Value = serde_json::from_str(&text)
            .map_err(|error| format!("Steam CDP returned invalid JSON: {error}"))?;
        if response.get("id").and_then(|value| value.as_u64()) != Some(request_id) {
            continue;
        }

        if let Some(error) = response.get("error") {
            return Err(format!(
                "Steam CDP Runtime.evaluate failed: {}",
                cdp_message(error)
            ));
        }
        if let Some(exception) = response.get("exceptionDetails") {
            return Err(format!(
                "Steam Downloads API failed: {}",
                cdp_exception_message(exception)
            ));
        }
        if let Some(result) = response.get("result").and_then(|value| value.get("result")) {
            if result.get("subtype").and_then(|value| value.as_str()) == Some("error") {
                return Err(format!(
                    "Steam Downloads API failed: {}",
                    cdp_message(result)
                ));
            }
        }

        return Ok(());
    }

    Err("Steam CDP did not return a Runtime.evaluate response.".to_string())
}

fn steam_download_control_expression(app_id: u32, action: SteamDownloadControlAction) -> String {
    let method = match action {
        SteamDownloadControlAction::Pause => "PauseAppUpdate",
        SteamDownloadControlAction::Resume => "ResumeAppUpdate",
    };

    format!(
        "(() => {{ const downloads = globalThis.SteamClient && globalThis.SteamClient.Downloads; if (!downloads || typeof downloads.{method} !== 'function') {{ throw new Error('SteamClient.Downloads.{method} unavailable'); }} return downloads.{method}({app_id}); }})()"
    )
}

fn cdp_exception_message(exception: &serde_json::Value) -> String {
    exception
        .pointer("/exception/description")
        .and_then(|value| value.as_str())
        .or_else(|| {
            exception
                .pointer("/exception/value")
                .and_then(|value| value.as_str())
        })
        .or_else(|| exception.get("text").and_then(|value| value.as_str()))
        .unwrap_or("unknown Steam exception")
        .to_string()
}

fn cdp_message(value: &serde_json::Value) -> String {
    value
        .get("message")
        .and_then(|message| message.as_str())
        .or_else(|| {
            value
                .get("description")
                .and_then(|message| message.as_str())
        })
        .or_else(|| value.get("value").and_then(|message| message.as_str()))
        .unwrap_or("unknown Steam CDP error")
        .to_string()
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

fn extract_vdf_number(line: &str) -> Option<u64> {
    let parts: Vec<&str> = line.split('"').collect();
    if parts.len() >= 4 {
        parts[3].parse::<u64>().ok()
    } else {
        None
    }
}

#[derive(Default)]
struct SteamDownloadState {
    bytes_downloaded: u64,
    bytes_to_download: u64,
    bytes_staged: u64,
    bytes_to_stage: u64,
    size_on_disk: u64,
    state_flags: u64,
}

impl SteamDownloadState {
    fn is_fully_installed(&self, downloading_dir_size: u64) -> bool {
        (self.state_flags & STEAM_STATE_FULLY_INSTALLED) != 0
            && (self.state_flags & STEAM_STATE_UPDATE_REQUIRED) == 0
            && downloading_dir_size == 0
    }

    fn has_active_work(&self, downloading_dir_size: u64) -> bool {
        !self.is_fully_installed(downloading_dir_size)
            && (downloading_dir_size > 0
                || self.bytes_to_download > 0
                || self.bytes_to_stage > 0
                || (self.state_flags & STEAM_STATE_UPDATE_REQUIRED) != 0)
    }
}

fn parse_steam_download_state(contents: &str) -> SteamDownloadState {
    let mut state = SteamDownloadState::default();

    for line in contents.lines() {
        if line.contains("\"BytesDownloaded\"") {
            if let Some(value) = extract_vdf_number(line) {
                state.bytes_downloaded = value;
            }
        } else if line.contains("\"BytesToDownload\"") {
            if let Some(value) = extract_vdf_number(line) {
                state.bytes_to_download = value;
            }
        } else if line.contains("\"BytesStaged\"") {
            if let Some(value) = extract_vdf_number(line) {
                state.bytes_staged = value;
            }
        } else if line.contains("\"BytesToStage\"") {
            if let Some(value) = extract_vdf_number(line) {
                state.bytes_to_stage = value;
            }
        } else if line.contains("\"SizeOnDisk\"") {
            if let Some(value) = extract_vdf_number(line) {
                state.size_on_disk = value;
            }
        } else if line.contains("\"StateFlags\"") {
            if let Some(value) = extract_vdf_number(line) {
                state.state_flags = value;
            }
        }
    }

    state
}

fn calculate_steam_progress(state: &SteamDownloadState, downloading_dir_size: u64) -> Option<u32> {
    if let Some((done, total)) = steam_combined_progress_bytes(state, downloading_dir_size) {
        return Some(calculate_active_progress(done, total));
    }

    if state.size_on_disk > 0 && downloading_dir_size > 0 {
        return Some(calculate_active_progress(
            downloading_dir_size,
            state.size_on_disk,
        ));
    }

    None
}

fn steam_phase(state: &SteamDownloadState, downloading_dir_size: u64) -> &'static str {
    if state.bytes_to_download > 0 {
        if steam_downloaded_bytes(state, downloading_dir_size) < state.bytes_to_download {
            "download"
        } else if state.bytes_to_stage > 0 {
            "installing"
        } else {
            "download"
        }
    } else if state.bytes_to_stage > 0 {
        "installing"
    } else {
        "external"
    }
}

fn steam_status_label(state: &SteamDownloadState, downloading_dir_size: u64) -> &'static str {
    if state.bytes_to_download > 0 {
        if steam_downloaded_bytes(state, downloading_dir_size) < state.bytes_to_download {
            "Steam Downloading"
        } else if state.bytes_to_stage > 0 {
            "Steam Installing"
        } else {
            "Steam Downloading"
        }
    } else if state.bytes_to_stage > 0 {
        "Steam Installing"
    } else {
        "Steam"
    }
}

fn steam_progress_bytes(
    state: &SteamDownloadState,
    downloading_dir_size: u64,
) -> (Option<u64>, Option<u64>) {
    if let Some((done, total)) = steam_combined_progress_bytes(state, downloading_dir_size) {
        return (Some(done), Some(total));
    }

    if state.size_on_disk > 0 && downloading_dir_size > 0 {
        return (
            Some(downloading_dir_size.min(state.size_on_disk)),
            Some(state.size_on_disk),
        );
    }

    (None, None)
}

fn steam_combined_progress_bytes(
    state: &SteamDownloadState,
    downloading_dir_size: u64,
) -> Option<(u64, u64)> {
    let download_total = state.bytes_to_download;
    let stage_total = state.bytes_to_stage;
    let total = download_total.saturating_add(stage_total);
    if total == 0 {
        return None;
    }

    let downloaded = steam_downloaded_bytes(state, downloading_dir_size);
    let staged = state.bytes_staged.min(stage_total);
    Some((downloaded.saturating_add(staged).min(total), total))
}

fn steam_downloaded_bytes(state: &SteamDownloadState, downloading_dir_size: u64) -> u64 {
    if state.bytes_downloaded > 0 {
        state.bytes_downloaded.min(state.bytes_to_download)
    } else {
        downloading_dir_size.min(state.bytes_to_download)
    }
}

fn steam_downloading_dir_for_manifest(
    manifest_path: &std::path::Path,
    app_id: &str,
) -> Option<std::path::PathBuf> {
    Some(manifest_path.parent()?.join("downloading").join(app_id))
}

// Provider Health Check

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProviderHealthStatus {
    pub provider: String,
    pub installed: bool,
    pub data_readable: bool,
    pub details: String,
    pub manifests_count: u32,
}

pub fn check_provider_health() -> Result<Vec<ProviderHealthStatus>, String> {
    let results = vec![
        check_steam_health(),
        check_epic_health(),
        check_ea_health(),
        check_battlenet_health(),
    ];

    Ok(results)
}

fn check_steam_health() -> ProviderHealthStatus {
    let steam_dir = crate::commands::games::detect::find_steam_dir();
    let Some(steam_dir) = steam_dir else {
        return ProviderHealthStatus {
            provider: "steam".to_string(),
            installed: false,
            data_readable: false,
            details: "Steam installation not found".to_string(),
            manifests_count: 0,
        };
    };

    let libraries = crate::commands::games::detect::read_steam_library_folders(&steam_dir);
    let mut folders = vec![steam_dir.clone()];
    folders.extend(libraries);

    let mut manifest_count = 0u32;
    for lib in &folders {
        let steamapps = lib.join("steamapps");
        if let Ok(entries) = std::fs::read_dir(&steamapps) {
            for entry in entries.flatten() {
                if let Some(name) = entry.path().file_name().and_then(|n| n.to_str()) {
                    if name.starts_with("appmanifest_") && name.ends_with(".acf") {
                        manifest_count += 1;
                    }
                }
            }
        }
    }

    let cef_reachable = steam_cef_targets().is_ok();
    let details = if cef_reachable {
        format!("{} manifests, CEF reachable", manifest_count)
    } else {
        format!("{} manifests, CEF not available", manifest_count)
    };

    ProviderHealthStatus {
        provider: "steam".to_string(),
        installed: true,
        data_readable: manifest_count > 0,
        details,
        manifests_count: manifest_count,
    }
}

fn check_epic_health() -> ProviderHealthStatus {
    let manifest_dir =
        std::path::PathBuf::from(r"C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests");
    if !manifest_dir.exists() {
        return ProviderHealthStatus {
            provider: "epic".to_string(),
            installed: false,
            data_readable: false,
            details: "Epic Games manifest directory not found".to_string(),
            manifests_count: 0,
        };
    }

    let mut count = 0u32;
    if let Ok(entries) = std::fs::read_dir(&manifest_dir) {
        for entry in entries.flatten() {
            if entry.path().extension().and_then(|e| e.to_str()) == Some("item") {
                count += 1;
            }
        }
    }

    ProviderHealthStatus {
        provider: "epic".to_string(),
        installed: true,
        data_readable: count > 0,
        details: format!("{} item manifests found", count),
        manifests_count: count,
    }
}

fn check_ea_health() -> ProviderHealthStatus {
    let games = crate::commands::games::detect::scan_ea_games();
    let count = games.len() as u32;

    ProviderHealthStatus {
        provider: "ea".to_string(),
        installed: count > 0,
        data_readable: count > 0,
        details: if count > 0 {
            format!("{} EA games detected via registry", count)
        } else {
            "No EA entries found in registry".to_string()
        },
        manifests_count: count,
    }
}

fn check_battlenet_health() -> ProviderHealthStatus {
    let games = crate::commands::games::detect::scan_battlenet_games();
    let count = games.len() as u32;

    ProviderHealthStatus {
        provider: "battlenet".to_string(),
        installed: count > 0,
        data_readable: count > 0,
        details: if count > 0 {
            format!("{} Battle.net games detected via registry", count)
        } else {
            "No Battle.net entries found in registry".to_string()
        },
        manifests_count: count,
    }
}

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
    fn steam_progress_combines_download_and_stage_bytes() {
        let state = SteamDownloadState {
            bytes_downloaded: 50,
            bytes_to_download: 100,
            bytes_staged: 25,
            bytes_to_stage: 100,
            ..Default::default()
        };

        assert_eq!(calculate_steam_progress(&state, 0), Some(38));
        assert_eq!(steam_progress_bytes(&state, 0), (Some(75), Some(200)));
        assert_eq!(steam_phase(&state, 0), "download");
        assert_eq!(steam_status_label(&state, 0), "Steam Downloading");
    }

    #[test]
    fn steam_progress_uses_downloading_directory_when_manifest_bytes_lag() {
        let state = SteamDownloadState {
            bytes_downloaded: 0,
            bytes_to_download: 1_000,
            ..Default::default()
        };

        assert_eq!(calculate_steam_progress(&state, 250), Some(25));
        assert_eq!(steam_progress_bytes(&state, 250), (Some(250), Some(1_000)));
    }

    #[test]
    fn steam_progress_switches_to_install_phase_after_download_bytes_complete() {
        let state = SteamDownloadState {
            bytes_downloaded: 100,
            bytes_to_download: 100,
            bytes_staged: 50,
            bytes_to_stage: 100,
            ..Default::default()
        };

        assert_eq!(calculate_steam_progress(&state, 0), Some(75));
        assert_eq!(steam_phase(&state, 0), "installing");
        assert_eq!(steam_status_label(&state, 0), "Steam Installing");
    }

    #[test]
    fn steam_fully_installed_requires_no_update_work_or_downloading_files() {
        let installed = SteamDownloadState {
            state_flags: 4,
            ..Default::default()
        };
        let update_required = SteamDownloadState {
            state_flags: 6,
            ..Default::default()
        };
        let stale_manifest_bytes = SteamDownloadState {
            state_flags: 4,
            bytes_to_download: 100,
            ..Default::default()
        };

        assert!(installed.is_fully_installed(0));
        assert!(!installed.is_fully_installed(1));
        assert!(!update_required.is_fully_installed(0));
        assert!(stale_manifest_bytes.is_fully_installed(0));
        assert!(!stale_manifest_bytes.is_fully_installed(1));
    }

    #[test]
    fn steam_active_work_keeps_installed_updates_in_queue() {
        let installed = SteamDownloadState {
            state_flags: 4,
            bytes_to_download: 100,
            ..Default::default()
        };
        let update_required = SteamDownloadState {
            state_flags: 6,
            ..Default::default()
        };
        let install_download = SteamDownloadState {
            bytes_to_download: 100,
            ..Default::default()
        };

        assert!(!installed.has_active_work(0));
        assert!(installed.has_active_work(1));
        assert!(update_required.has_active_work(0));
        assert!(install_download.has_active_work(0));
    }

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

struct InstalledDownloadPackage {
    files: Vec<crate::commands::games::OgManagedManifestFile>,
    executable_path: PathBuf,
}

fn install_downloaded_game_package(
    app: &tauri::AppHandle,
    game_id: &str,
    title: &str,
    install_dir: &Path,
    _source: &InternalDownloadSource,
    downloaded_file: &Path,
) -> Result<InstalledDownloadPackage, String> {
    update_download_metrics(game_id, "installing", None, None);
    update_download_status(game_id, DOWNLOAD_STATUS_INSTALLING, "Installing", 99, 0);
    emit_download_progress(
        app,
        game_id,
        99,
        "Installing",
        DOWNLOAD_STATUS_INSTALLING,
        0,
    );

    let files = if is_zip_package(downloaded_file) {
        extract_og_zip_package(downloaded_file, install_dir, |processed, total| {
            let progress = 90 + (((processed as f64 / total.max(1) as f64) * 9.0).round() as u32);
            update_download_status(
                game_id,
                DOWNLOAD_STATUS_INSTALLING,
                "Installing",
                progress.min(99),
                0,
            );
            emit_download_progress(
                app,
                game_id,
                progress.min(99),
                "Installing",
                DOWNLOAD_STATUS_INSTALLING,
                0,
            );
        })?
    } else {
        og_manifest_file_for_path(install_dir, downloaded_file)
            .into_iter()
            .collect()
    };

    let executable_path = find_launch_executable(install_dir, title)
        .or_else(|| is_file_executable(downloaded_file).then(|| downloaded_file.to_path_buf()))
        .ok_or_else(|| "Installed package does not contain a launchable executable.".to_string())?;

    Ok(InstalledDownloadPackage {
        files,
        executable_path,
    })
}

fn write_downloaded_game_manifest(
    game_id: &str,
    title: &str,
    install_dir: &Path,
    source: &InternalDownloadSource,
    downloaded_file: &Path,
    installed_package: &InstalledDownloadPackage,
) -> Result<(), String> {
    let manifest = OgManagedManifest {
        game_id: game_id.to_string(),
        title: title.to_string(),
        version: "1.0.0".to_string(),
        managed_by: "OG-Launcher".to_string(),
        download_url: Some(source.url.clone()),
        download_sha256: source.sha256.clone(),
        package_file: og_manifest_relative_path(install_dir, downloaded_file),
        files: installed_package.files.clone(),
        executable_path: og_manifest_relative_path(install_dir, &installed_package.executable_path),
        updated_at: None,
    };

    write_og_managed_manifest_details(install_dir, &manifest)
}

fn update_installed_games_cache_for_download(
    game_id: &str,
    title: &str,
    install_dir: &Path,
    executable_path: Option<&Path>,
) {
    let mut games = read_installed_games_cache().unwrap_or_default();
    let mut found = false;
    let executable_path_string = executable_path.map(|path| path_to_string(path.to_path_buf()));
    let process_names = executable_path
        .and_then(|path| path.file_name())
        .and_then(|name| name.to_str())
        .map(|name| vec![name.to_string()])
        .unwrap_or_default();

    for game in games.iter_mut() {
        if game.id == game_id {
            game.status = GameStatus::Installed;
            game.install_path = Some(path_to_string(install_dir.to_path_buf()));
            game.executable_path = executable_path_string.clone();
            game.process_names = process_names.clone();
            game.version = "1.0.0".to_string();
            game.launcher = "manual".to_string();
            if game.description.trim().is_empty() {
                game.description = format!("Downloaded game: {title}");
            }
            found = true;
        }
    }

    if !found {
        let mut game = installed_game(
            game_id,
            title.to_string(),
            "manual".to_string(),
            Some(path_to_string(install_dir.to_path_buf())),
            None,
        );
        game.description = format!("Downloaded game: {title}");
        game.executable_path = executable_path_string;
        game.process_names = process_names;
        games.push(game);
    }

    write_installed_games_cache(&games);
}

/// Extract a string value from VDF content by key name.
/// VDF format: `"key"\t\t"value"`
fn extract_vdf_string(contents: &str, key: &str) -> Option<String> {
    let search = format!("\"{}\"", key);
    for line in contents.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with(&search) {
            let parts: Vec<&str> = trimmed.split('"').collect();
            if parts.len() >= 4 {
                return Some(parts[3].to_string());
            }
        }
    }
    None
}

