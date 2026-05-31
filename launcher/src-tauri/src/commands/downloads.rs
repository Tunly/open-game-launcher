use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;
use tauri::Emitter;
use tokio::sync::watch;

use crate::commands::games::{
    extract_og_zip_package, find_launch_executable, installed_game, is_file_executable,
    is_zip_package, og_manifest_file_for_path, og_manifest_relative_path, path_to_string,
    read_installed_games_cache, write_installed_games_cache, write_og_managed_manifest_details,
    GameStatus, OgManagedManifest,
};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StartDownloadResponse {
    pub game_id: String,
    pub download_id: String,
    pub status: DownloadStartStatus,
    pub message: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum DownloadStartStatus {
    Started,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DownloadItemPayload {
    pub id: String,
    pub game_id: String,
    pub title: String,
    pub progress: u32,
    pub speed: String,
    pub status: String,
    pub eta: u32,
    pub platform: String,
    #[serde(default)]
    pub phase: String,
    #[serde(default)]
    pub bytes_downloaded: Option<u64>,
    #[serde(default)]
    pub bytes_total: Option<u64>,
    #[serde(default)]
    pub can_pause: bool,
    #[serde(default)]
    pub can_cancel: bool,
    #[serde(default)]
    pub external: bool,
}

struct ActiveDownload {
    title: String,
    progress: u32,
    speed: String,
    status: String,
    eta: u32,
    phase: String,
    bytes_downloaded: Option<u64>,
    bytes_total: Option<u64>,
    can_pause: bool,
    can_cancel: bool,
    external: bool,
    paused: bool,
    cancelled: bool,
    pause_tx: watch::Sender<bool>,
    cancel_tx: watch::Sender<bool>,
}

#[derive(Debug, Clone)]
struct InternalDownloadSource {
    url: String,
    sha256: Option<String>,
}

type DownloadMap = Arc<Mutex<HashMap<String, ActiveDownload>>>;

fn get_download_manager() -> &'static DownloadMap {
    static MANAGER: OnceLock<DownloadMap> = OnceLock::new();
    MANAGER.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

#[tauri::command]
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
        for (game_id, dl) in map.iter() {
            queue_by_game_id.insert(game_id.clone(), payload_from_active_download(game_id, dl));
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

#[tauri::command]
pub fn pause_download(app: tauri::AppHandle, game_id: String) -> Result<(), String> {
    let game_id = normalize_game_id(game_id)?;

    // Route GOG downloads to GOG manager
    if game_id.starts_with("gog-") {
        return crate::commands::gog::pause_gog_download(app, game_id);
    }
    if is_external_tracker_game_id(&game_id) {
        return Err("This download is controlled by an external launcher.".to_string());
    }

    let map = get_download_manager();
    let mut guard = map
        .lock()
        .map_err(|error| format!("Download manager lock poisoned: {error}"))?;
    if let Some(dl) = guard.get_mut(&game_id) {
        if dl.status == "downloading" {
            dl.paused = true;
            dl.status = "paused".to_string();
            dl.speed = "Paused".to_string();
            let _ = dl.pause_tx.send(true);
            println!("[open-game-launcher] Paused download for {game_id}");
            emit_download_progress(&app, &game_id, dl.progress, &dl.speed, &dl.status, dl.eta);
        } else if dl.status == "paused" {
            dl.paused = false;
            dl.status = "downloading".to_string();
            dl.speed = "Connecting...".to_string();
            let _ = dl.pause_tx.send(false);
            println!("[open-game-launcher] Resumed download for {game_id}");
            emit_download_progress(&app, &game_id, dl.progress, &dl.speed, &dl.status, dl.eta);
        }
    }
    Ok(())
}

#[tauri::command]
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
        dl.status = "cancelled".to_string();
        let _ = dl.cancel_tx.send(true);
        println!("[open-game-launcher] Cancelled download for {game_id}");
        emit_download_progress(&app, &game_id, dl.progress, "Cancelled", "cancelled", 0);
    }
    guard.remove(&game_id);
    Ok(())
}

#[tauri::command]
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

#[tauri::command]
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
        // Already installed GOG game — shouldn't be downloading, but handle gracefully
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
        // Read from cache path to get game name
        let cache_path = dirs::data_local_dir()
            .or_else(dirs::data_dir)
            .map(|d| d.join("open-game-launcher").join("installed-games.json"));

        if let Some(path) = cache_path {
            if let Ok(contents) = std::fs::read_to_string(path) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&contents) {
                    if let Some(games_arr) = json.get("games").and_then(|v| v.as_array()) {
                        for g in games_arr {
                            if g.get("id").and_then(|v| v.as_str()) == Some(&game_id) {
                                if let Some(t) = g.get("title").and_then(|v| v.as_str()) {
                                    title = t.to_string();
                                    has_game = true;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if !has_game {
        title = game_id.replace("-", " ");
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

    let active = ActiveDownload {
        title: title.clone(),
        progress: 0,
        speed: "Waiting...".to_string(),
        status: "downloading".to_string(),
        eta: 0,
        phase: if is_external_download {
            "external".to_string()
        } else {
            "download".to_string()
        },
        bytes_downloaded: None,
        bytes_total: None,
        can_pause: !is_external_download,
        can_cancel: !is_external_download,
        external: is_external_download,
        paused: false,
        cancelled: false,
        pause_tx,
        cancel_tx,
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
        })
        .or_else(|| resolve_internal_download_source(&game_id));

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
                    return;
                }
                while *pause_rx.borrow() {
                    update_download_status(&game_id_clone, "paused", "Paused", progress, 0);
                    emit_download_progress(
                        &app_clone,
                        &game_id_clone,
                        progress,
                        "Paused",
                        "paused",
                        0,
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

            // Loop finished, cleanup
            if let Some(mut child) = epic_child.take() {
                let _ = child.wait().await;
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

            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
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

        // Remove from manager after 2 seconds
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
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

pub(crate) fn update_download_status(
    game_id: &str,
    status: &str,
    speed: &str,
    progress: u32,
    eta: u32,
) {
    let Ok(mut guard) = get_download_manager().lock() else {
        return;
    };
    if let Some(dl) = guard.get_mut(game_id) {
        dl.status = status.to_string();
        dl.speed = speed.to_string();
        dl.progress = normalize_progress(progress, status);
        dl.eta = eta;
        dl.phase = phase_from_status_and_speed(status, speed);
    }
}

fn update_download_metrics(
    game_id: &str,
    phase: &str,
    bytes_downloaded: Option<u64>,
    bytes_total: Option<u64>,
) {
    let Ok(mut guard) = get_download_manager().lock() else {
        return;
    };
    if let Some(dl) = guard.get_mut(game_id) {
        dl.phase = phase.to_string();
        dl.bytes_downloaded = bytes_downloaded;
        dl.bytes_total = bytes_total;
    }
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
    let client = reqwest::Client::new();
    let mut attempt = 0u8;

    loop {
        attempt += 1;
        match download_internal_game_file_once(
            app,
            game_id,
            &client,
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
                tokio::time::sleep(tokio::time::Duration::from_secs(2u64.pow(attempt as u32)))
                    .await;
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
    })
}

fn normalize_queue_payload(mut item: DownloadItemPayload) -> DownloadItemPayload {
    if item.id.trim().is_empty() {
        item.id = format!("download-{}", item.game_id);
    }
    if item.platform.trim().is_empty() {
        item.platform = get_platform_from_game_id(&item.game_id);
    }
    if item.phase.trim().is_empty() {
        item.phase = phase_from_status_and_speed(&item.status, &item.speed);
    }

    let is_terminal = is_terminal_download_status(&item.status);
    let external = item.external || is_external_tracker_game_id(&item.game_id);
    item.external = external;
    item.progress = normalize_progress(item.progress, &item.status);
    item.can_pause = item.can_pause && !external && !is_terminal;
    item.can_cancel = item.can_cancel && !external && !is_terminal;

    item
}

fn load_download_history() -> Vec<DownloadItemPayload> {
    let Some(path) = download_history_path() else {
        return Vec::new();
    };
    let Ok(contents) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    let Ok(items) = serde_json::from_str::<Vec<DownloadItemPayload>>(&contents) else {
        return Vec::new();
    };

    items
        .into_iter()
        .map(|item| {
            let mut item = normalize_queue_payload(item);
            if item.status == "downloading" {
                item.status = "paused".to_string();
                item.speed = if item.external {
                    "External tracker needs refresh".to_string()
                } else {
                    "Interrupted".to_string()
                };
                item.phase = "interrupted".to_string();
                item.can_pause = false;
                item.can_cancel = false;
            }
            normalize_queue_payload(item)
        })
        .collect()
}

fn remember_download_item(item: DownloadItemPayload) {
    let mut items = load_download_history();
    let item = normalize_queue_payload(item);
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

pub(crate) fn record_download_item(item: DownloadItemPayload) {
    remember_download_item(item);
}

fn remove_download_history_item(game_id: &str) {
    let mut items = load_download_history();
    items.retain(|item| item.game_id != game_id);
    save_download_history(&items);
}

fn save_download_history(items: &[DownloadItemPayload]) {
    let Some(path) = download_history_path() else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(contents) = serde_json::to_string_pretty(items) {
        let _ = std::fs::write(path, contents);
    }
}

fn download_history_path() -> Option<PathBuf> {
    dirs::data_local_dir()
        .or_else(dirs::data_dir)
        .map(|dir| dir.join("open-game-launcher").join("download-queue.json"))
}

fn terminal_sort_rank(status: &str) -> u8 {
    if is_terminal_download_status(status) {
        1
    } else {
        0
    }
}

fn is_terminal_download_status(status: &str) -> bool {
    matches!(status, "completed" | "failed" | "cancelled" | "error")
}

fn is_external_tracker_game_id(game_id: &str) -> bool {
    game_id.starts_with("steam-")
        || game_id.starts_with("epic-owned-")
        || game_id.starts_with("ea-owned-")
        || game_id.starts_with("ubisoft-owned-")
        || game_id.starts_with("battlenet-owned-")
        || game_id.starts_with("xbox-")
}

fn phase_from_status_and_speed(status: &str, speed: &str) -> String {
    if is_terminal_download_status(status) {
        return status.to_string();
    }
    if status == "paused" {
        return "paused".to_string();
    }
    if speed.contains("Staging") || speed.contains("Installing") {
        return "installing".to_string();
    }
    if speed.contains("Downloading") {
        return "download".to_string();
    }
    if speed.contains("External")
        || speed.contains("Steam")
        || speed.contains("Epic")
        || speed.contains("EA App")
        || speed.contains("Ubisoft")
        || speed.contains("Battle.net")
        || speed.contains("Xbox")
    {
        return "external".to_string();
    }
    "download".to_string()
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
                                        let has_downloading_files = downloading_dir.exists()
                                            && get_dir_size(&downloading_dir) > 0;
                                        let downloading_dir_size = get_dir_size(&downloading_dir);
                                        let is_actively_downloading = !steam_state
                                            .is_fully_installed(downloading_dir_size)
                                            && (has_downloading_files
                                                || steam_state.bytes_to_download > 0
                                                || steam_state.bytes_to_stage > 0);

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
                                                    let (pause_tx, _) =
                                                        tokio::sync::watch::channel(false);
                                                    let (cancel_tx, _) =
                                                        tokio::sync::watch::channel(false);

                                                    let progress = calculate_steam_progress(
                                                        &steam_state,
                                                        get_dir_size(&downloading_dir),
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
                                                        can_pause: false,
                                                        can_cancel: false,
                                                        external: true,
                                                        paused: false,
                                                        cancelled: false,
                                                        pause_tx,
                                                        cancel_tx,
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
                                                        let mut current_progress = progress;
                                                        loop {
                                                            if let Ok(contents) =
                                                                std::fs::read_to_string(
                                                                    &manifest_path,
                                                                )
                                                            {
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

fn calculate_active_progress(downloaded: u64, total: u64) -> u32 {
    if total == 0 {
        return 0;
    }

    let progress = ((downloaded.min(total) as f64 / total as f64) * 100.0).round() as u32;
    progress.min(99)
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
        const FULLY_INSTALLED: u64 = 4;
        const UPDATE_REQUIRED: u64 = 2;

        (self.state_flags & FULLY_INSTALLED) != 0
            && (self.state_flags & UPDATE_REQUIRED) == 0
            && self.bytes_to_download == 0
            && self.bytes_to_stage == 0
            && downloading_dir_size == 0
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
        let pending_download = SteamDownloadState {
            state_flags: 4,
            bytes_to_download: 100,
            ..Default::default()
        };

        assert!(installed.is_fully_installed(0));
        assert!(!installed.is_fully_installed(1));
        assert!(!update_required.is_fully_installed(0));
        assert!(!pending_download.is_fully_installed(0));
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

fn resolve_internal_download_source(game_id: &str) -> Option<InternalDownloadSource> {
    let cache_path = dirs::data_local_dir()
        .or_else(dirs::data_dir)
        .map(|dir| dir.join("open-game-launcher").join("installed-games.json"))?;
    let contents = std::fs::read_to_string(cache_path).ok()?;
    let json = serde_json::from_str::<serde_json::Value>(&contents).ok()?;
    let games = json.get("games")?.as_array()?;

    games.iter().find_map(|game| {
        if game.get("id").and_then(|value| value.as_str()) != Some(game_id) {
            return None;
        }

        let url = json_string_any(
            game,
            &[
                "downloadUrl",
                "download_url",
                "installerUrl",
                "installer_url",
                "packageUrl",
                "package_url",
            ],
        )?;
        let sha256 = json_string_any(
            game,
            &[
                "downloadSha256",
                "download_sha256",
                "sha256",
                "checksumSha256",
                "checksum_sha256",
            ],
        );

        Some(InternalDownloadSource { url, sha256 })
    })
}

fn json_string_any(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        value
            .get(*key)
            .and_then(|field| field.as_str())
            .map(str::trim)
            .filter(|field| !field.is_empty())
            .map(ToOwned::to_owned)
    })
}

fn default_install_dir(game_id: &str) -> Option<PathBuf> {
    dirs::data_local_dir()
        .or_else(dirs::data_dir)
        .map(|dir| dir.join("open-game-launcher").join("games").join(game_id))
}

fn download_file_name(url: &reqwest::Url, game_id: &str) -> String {
    let from_url = url
        .path_segments()
        .and_then(|mut segments| segments.next_back())
        .map(str::trim)
        .filter(|segment| !segment.is_empty())
        .unwrap_or("package.bin");
    let sanitized = sanitize_download_file_name(from_url);
    if sanitized.is_empty() {
        format!("{}.bin", sanitize_download_file_name(game_id))
    } else {
        sanitized
    }
}

fn sanitize_download_file_name(value: &str) -> String {
    value
        .chars()
        .map(|ch| match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            ch if ch.is_control() => '_',
            ch => ch,
        })
        .collect::<String>()
        .trim_matches('.')
        .trim()
        .to_string()
}

fn verify_sha256(path: &PathBuf, expected: &str) -> Result<(), String> {
    use sha2::{Digest, Sha256};
    use std::io::Read;

    let expected = expected.trim().to_ascii_lowercase();
    if expected.len() != 64 || !expected.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Err("Configured SHA-256 checksum is invalid.".to_string());
    }

    let mut file = std::fs::File::open(path)
        .map_err(|error| format!("Could not open downloaded file for verification: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("Could not read downloaded file for verification: {error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    let actual = format!("{:x}", hasher.finalize());
    if actual != expected {
        return Err(format!(
            "SHA-256 verification failed: expected {expected}, got {actual}."
        ));
    }

    Ok(())
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
    update_download_status(game_id, "downloading", "Installing", 99, 0);
    emit_download_progress(app, game_id, 99, "Installing", "downloading", 0);

    let files = if is_zip_package(downloaded_file) {
        extract_og_zip_package(downloaded_file, install_dir, |processed, total| {
            let progress = 90 + (((processed as f64 / total.max(1) as f64) * 9.0).round() as u32);
            update_download_status(game_id, "downloading", "Installing", progress.min(99), 0);
            emit_download_progress(
                app,
                game_id,
                progress.min(99),
                "Installing",
                "downloading",
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

fn normalize_progress(progress: u32, status: &str) -> u32 {
    if status == "completed" {
        100
    } else {
        progress.min(99)
    }
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

fn get_platform_from_game_id(game_id: &str) -> String {
    if game_id.starts_with("steam-") {
        "Steam".to_string()
    } else if game_id.starts_with("epic-") {
        "Epic Games".to_string()
    } else if game_id.starts_with("gog-") {
        "GOG Galaxy".to_string()
    } else if game_id.starts_with("ea-") {
        "EA App".to_string()
    } else if game_id.starts_with("ubisoft-") {
        "Ubisoft Connect".to_string()
    } else if game_id.starts_with("xbox-") {
        "Xbox Game Pass".to_string()
    } else if game_id.starts_with("battlenet-") {
        "Battle.net".to_string()
    } else {
        "OG Store".to_string()
    }
}

fn normalize_game_id(game_id: String) -> Result<String, String> {
    let normalized = game_id.trim().to_string();
    if normalized.is_empty() {
        return Err("game_id must not be empty.".to_string());
    }
    Ok(normalized)
}

fn get_dir_size<P: AsRef<std::path::Path>>(path: P) -> u64 {
    let mut size = 0;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_dir() {
                    size += get_dir_size(entry.path());
                } else {
                    size += meta.len();
                }
            }
        }
    }
    size
}
