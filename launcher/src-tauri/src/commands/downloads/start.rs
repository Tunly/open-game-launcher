use std::time::Instant;

use tauri::AppHandle;
use tauri::Emitter;
use tokio::sync::watch;

use crate::commands::downloads::history::{
    remember_download_item, remove_download_history_item,
};
use crate::commands::downloads::install::{
    install_downloaded_game_package, update_installed_games_cache_for_download,
    write_downloaded_game_manifest,
};
use crate::commands::uri_safety::validate_slug;
use crate::commands::downloads::internal_download::download_internal_game_file;
use crate::commands::downloads::steam_cef::toggle_steam_download_pause;
use crate::commands::downloads::types::{
    emit_download_progress, payload_from_active_download,
};
use crate::commands::downloads::steam_state::{
    calculate_steam_progress, parse_steam_download_state, steam_downloading_dir_for_manifest,
    steam_phase, steam_progress_bytes, steam_status_label,
};
use crate::commands::downloads::types::{
    cancellable_sleep, get_download_manager, is_download_control_pending,
    is_terminal_download_status, pause_hold_feedback, update_download_metrics,
    update_download_status, ActiveDownload, DownloadStartStatus,
    InternalDownloadSource, StartDownloadResponse, DOWNLOAD_STATUS_CANCELLED,
    DOWNLOAD_STATUS_DOWNLOADING, DOWNLOAD_STATUS_PAUSED, DOWNLOAD_STATUS_STARTING,
};
use crate::commands::downloads::utils::{
    default_install_dir, get_dir_size, get_platform_from_game_id, is_download_game_installed,
    is_external_tracker_game_id, normalize_game_id, steam_app_id_from_download_id,
};
use crate::commands::games::read_installed_games_cache;

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
    app: AppHandle,
    game_id: String,
    game_title: Option<String>,
    download_url: Option<String>,
    download_sha256: Option<String>,
) -> Result<StartDownloadResponse, String> {
    let game_id = normalize_game_id(game_id)?;
    let download_id = format!("download-{game_id}");

    println!("[open-game-launcher] start_download requested for {game_id}");

    if game_id.starts_with("gog-owned-") {
        let gog_id = game_id.strip_prefix("gog-owned-").unwrap_or(&game_id);
        return crate::commands::gog::gog_start_download(app, gog_id.to_string(), None).await;
    }
    if game_id.starts_with("gog-") {
        let gog_id = game_id.strip_prefix("gog-").unwrap_or(&game_id);
        return crate::commands::gog::gog_start_download(app, gog_id.to_string(), None).await;
    }

    let mut epic_tracker_id = None;
    let mut steam_tracker_id = None;
    let mut external_message = String::new();
    let mut is_external_download = false;

    if game_id.starts_with("steam-owned-") || game_id.starts_with("steam-") {
        let steam_app_id = game_id
            .strip_prefix("steam-owned-")
            .or_else(|| game_id.strip_prefix("steam-"))
            .unwrap_or(&game_id);
        // SECURITY: the AppID is interpolated into a URI. Validate before
        // building the URI so a malicious `game_id` like
        // `"steam-123 & calc.exe"` cannot smuggle a command into the
        // shell.
        let safe_steam_id = match validate_slug(steam_app_id) {
            Ok(id) => id.to_string(),
            Err(error) => {
                external_message = format!("Steam install link rejected: {error}");
                is_external_download = false;
                String::new()
            }
        };
        if !safe_steam_id.is_empty() {
            let uri = format!("steam://install/{safe_steam_id}");
            let _ = crate::commands::system::open_uri(&uri);
            steam_tracker_id = Some(safe_steam_id);
            is_external_download = true;
            external_message =
                "Installation started in Steam. Check Steam for download progress.".to_string();
        }
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
        // SECURITY: validate before URI construction.
        match validate_slug(ea_id) {
            Ok(safe_ea_id) => {
                let uri = format!("origin2://game/launch?offerIds={safe_ea_id}&autoDownload=true");
                let _ = crate::commands::system::open_uri(&uri);
                is_external_download = true;
                external_message =
                    "Installation started via EA App. Check EA App for progress.".to_string();
            }
            Err(error) => {
                external_message = format!("EA install link rejected: {error}");
            }
        }
    } else if game_id.starts_with("ubisoft-owned-") {
        let uplay_id = game_id.strip_prefix("ubisoft-owned-").unwrap_or(&game_id);
        // SECURITY: validate before URI construction.
        match validate_slug(uplay_id) {
            Ok(safe_uplay_id) => {
                let uri = format!("uplay://install/{safe_uplay_id}");
                let _ = crate::commands::system::open_uri(&uri);
                is_external_download = true;
                external_message =
                    "Installation started in Ubisoft Connect. Check Ubisoft Connect for progress."
                        .to_string();
            }
            Err(error) => {
                external_message = format!("Ubisoft install link rejected: {error}");
            }
        }
    } else if game_id.starts_with("battlenet-owned-") {
        let bnet_id = game_id.strip_prefix("battlenet-owned-").unwrap_or(&game_id);
        // SECURITY: validate before URI construction.
        match validate_slug(bnet_id) {
            Ok(safe_bnet_id) => {
                let uri = format!("battlenet://{safe_bnet_id}");
                let _ = crate::commands::system::open_uri(&uri);
                is_external_download = true;
                external_message =
                    "Installation started in Battle.net. Check Battle.net for download progress."
                        .to_string();
            }
            Err(error) => {
                external_message = format!("Battle.net install link rejected: {error}");
            }
        }
    }
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
                } else if let Some(ref appid) = steam_tracker_id {
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
                                break;
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

        let _ = app_clone.emit(
            "library_inventory_changed",
            serde_json::json!({
                "reason": "download_completed",
                "gameCount": 0
            }),
        );

        update_download_status(&game_id_clone, "completed", "Done", 100, 0);
        emit_download_progress(&app_clone, &game_id_clone, 100, "Complete", "completed", 0);

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
