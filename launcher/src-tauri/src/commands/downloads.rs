use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;
use tauri::Emitter;
use tokio::sync::watch;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StartDownloadResponse {
    game_id: String,
    download_id: String,
    status: DownloadStartStatus,
    message: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum DownloadStartStatus {
    Started,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DownloadItemPayload {
    id: String,
    game_id: String,
    title: String,
    progress: u32,
    speed: String,
    status: String,
    eta: u32,
    platform: String,
}

struct ActiveDownload {
    title: String,
    progress: u32,
    speed: String,
    status: String,
    eta: u32,
    paused: bool,
    cancelled: bool,
    pause_tx: watch::Sender<bool>,
    cancel_tx: watch::Sender<bool>,
}

type DownloadMap = Arc<Mutex<HashMap<String, ActiveDownload>>>;

fn get_download_manager() -> &'static DownloadMap {
    static MANAGER: OnceLock<DownloadMap> = OnceLock::new();
    MANAGER.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

#[tauri::command]
pub fn get_download_queue() -> Result<Vec<DownloadItemPayload>, String> {
    let map = get_download_manager().lock().unwrap();
    let queue: Vec<DownloadItemPayload> = map
        .iter()
        .map(|(game_id, dl)| DownloadItemPayload {
            id: format!("download-{game_id}"),
            game_id: game_id.clone(),
            title: dl.title.clone(),
            progress: dl.progress,
            speed: dl.speed.clone(),
            status: dl.status.clone(),
            eta: dl.eta,
            platform: get_platform_from_game_id(game_id),
        })
        .collect();
    Ok(queue)
}

#[tauri::command]
pub fn pause_download(game_id: String) -> Result<(), String> {
    let game_id = normalize_game_id(game_id)?;
    let map = get_download_manager();
    let mut guard = map.lock().unwrap();
    if let Some(dl) = guard.get_mut(&game_id) {
        if dl.status == "downloading" {
            dl.paused = true;
            dl.status = "paused".to_string();
            dl.speed = "Paused".to_string();
            let _ = dl.pause_tx.send(true);
            println!("[open-game-launcher] Paused download for {game_id}");
        } else if dl.status == "paused" {
            dl.paused = false;
            dl.status = "downloading".to_string();
            dl.speed = "Connecting...".to_string();
            let _ = dl.pause_tx.send(false);
            println!("[open-game-launcher] Resumed download for {game_id}");
        }
    }
    Ok(())
}

#[tauri::command]
pub fn cancel_download(game_id: String) -> Result<(), String> {
    let game_id = normalize_game_id(game_id)?;
    let map = get_download_manager();
    let mut guard = map.lock().unwrap();
    if let Some(dl) = guard.get_mut(&game_id) {
        dl.cancelled = true;
        dl.status = "cancelled".to_string();
        let _ = dl.cancel_tx.send(true);
        println!("[open-game-launcher] Cancelled download for {game_id}");
    }
    guard.remove(&game_id);
    Ok(())
}

#[tauri::command]
pub async fn start_download(
    app: tauri::AppHandle,
    game_id: String,
) -> Result<StartDownloadResponse, String> {
    let game_id = normalize_game_id(game_id)?;
    let download_id = format!("download-{game_id}");

    println!("[open-game-launcher] start_download requested for {game_id}");

    // Get the title of the game
    let mut title = "Unknown Game".to_string();
    let mut has_game = false;

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

    if !has_game {
        title = game_id.replace("-", " ");
    }

    let map = get_download_manager();
    let mut guard = map.lock().unwrap();

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
        paused: false,
        cancelled: false,
        pause_tx,
        cancel_tx,
    };
    guard.insert(game_id.clone(), active);

    // Spawn download worker
    let app_clone = app.clone();
    let game_id_clone = game_id.clone();
    let title_clone = title.clone();

    tokio::spawn(async move {
        let url = "https://ash-speed.hetzner.com/10MB.bin"; // 10MB real test file
        let client = reqwest::Client::new();

        let response = match client.get(url).send().await {
            Ok(r) => r,
            Err(e) => {
                update_download_status(&game_id_clone, "error", &e.to_string(), 0, 0);
                emit_download_progress(&app_clone, &game_id_clone, 0, "Error", "error", 0);
                return;
            }
        };

        let total_size = response.content_length().unwrap_or(10 * 1024 * 1024);
        let mut downloaded: u64 = 0;
        let mut last_update = Instant::now();
        let mut bytes_since_last_update: u64 = 0;

        let mut body = response.bytes_stream();
        use futures_util::StreamExt;

        let mut file_data = Vec::new();

        while let Some(item) = body.next().await {
            // Check cancellation
            if *cancel_rx.borrow() {
                update_download_status(&game_id_clone, "cancelled", "Cancelled", 0, 0);
                emit_download_progress(&app_clone, &game_id_clone, 0, "Cancelled", "cancelled", 0);
                return;
            }

            // Check pause
            while *pause_rx.borrow() {
                update_download_status(&game_id_clone, "paused", "Paused", downloaded as u32, 0);
                emit_download_progress(
                    &app_clone,
                    &game_id_clone,
                    ((downloaded as f64 / total_size as f64) * 100.0) as u32,
                    "Paused",
                    "paused",
                    0,
                );
                tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
                if *cancel_rx.borrow() {
                    update_download_status(&game_id_clone, "cancelled", "Cancelled", 0, 0);
                    emit_download_progress(
                        &app_clone,
                        &game_id_clone,
                        0,
                        "Cancelled",
                        "cancelled",
                        0,
                    );
                    return;
                }
            }

            let chunk = match item {
                Ok(c) => c,
                Err(e) => {
                    update_download_status(&game_id_clone, "error", &e.to_string(), 0, 0);
                    emit_download_progress(&app_clone, &game_id_clone, 0, "Error", "error", 0);
                    return;
                }
            };

            file_data.extend_from_slice(&chunk);
            downloaded += chunk.len() as u64;
            bytes_since_last_update += chunk.len() as u64;

            let now = Instant::now();
            let elapsed_ms = now.duration_since(last_update).as_millis();
            if elapsed_ms >= 300 {
                let progress = ((downloaded as f64 / total_size as f64) * 100.0) as u32;
                let speed_bytes_per_sec =
                    (bytes_since_last_update as f64) / (elapsed_ms as f64 / 1000.0);
                let speed_mb_sec = speed_bytes_per_sec / (1024.0 * 1024.0);
                let speed_str = format!("{:.1} MB/s", speed_mb_sec);

                let remaining_bytes = total_size.saturating_sub(downloaded);
                let eta = if speed_bytes_per_sec > 0.0 {
                    (remaining_bytes as f64 / speed_bytes_per_sec) as u32
                } else {
                    999
                };

                update_download_status(&game_id_clone, "downloading", &speed_str, progress, eta);
                emit_download_progress(
                    &app_clone,
                    &game_id_clone,
                    progress,
                    &speed_str,
                    "downloading",
                    eta,
                );

                last_update = now;
                bytes_since_last_update = 0;
            }
        }

        // Download completed! Create folder and write mock game executable
        let install_dir = dirs::data_local_dir().or_else(dirs::data_dir).map(|d| {
            d.join("open-game-launcher")
                .join("games")
                .join(&game_id_clone)
        });

        if let Some(ref dir) = install_dir {
            let _ = std::fs::create_dir_all(dir);
            // Write a small text file or dummy executable to simulate install
            let dummy_exe = if cfg!(target_os = "windows") {
                "game.exe"
            } else {
                "game"
            };
            let _ = std::fs::write(dir.join(dummy_exe), b"OG Launcher Mock Game Executable");
            let manifest = serde_json::json!({
                "gameId": game_id_clone,
                "title": title_clone,
                "version": "1.0.0",
                "managedBy": "OG-Launcher"
            });
            if let Ok(contents) = serde_json::to_string_pretty(&manifest) {
                let _ = std::fs::write(dir.join("og-manifest.json"), contents);
            }
        }

        // Update installed games cache
        let cache_path = dirs::data_local_dir()
            .or_else(dirs::data_dir)
            .map(|d| d.join("open-game-launcher").join("installed-games.json"));

        if let Some(path) = cache_path {
            if let Ok(contents) = std::fs::read_to_string(&path) {
                if let Ok(mut json) = serde_json::from_str::<serde_json::Value>(&contents) {
                    if let Some(games_arr) = json.get_mut("games").and_then(|v| v.as_array_mut()) {
                        let mut found = false;
                        for g in games_arr.iter_mut() {
                            if g.get("id").and_then(|v| v.as_str()) == Some(&game_id_clone) {
                                g.as_object_mut().map(|obj| {
                                    obj.insert(
                                        "status".to_string(),
                                        serde_json::Value::String("installed".to_string()),
                                    );
                                    obj.insert(
                                        "installPath".to_string(),
                                        serde_json::Value::String(
                                            install_dir
                                                .clone()
                                                .unwrap_or_default()
                                                .to_string_lossy()
                                                .to_string(),
                                        ),
                                    );
                                    obj.insert(
                                        "playtimeMinutes".to_string(),
                                        serde_json::Value::Number(0.into()),
                                    );
                                    obj.insert(
                                        "version".to_string(),
                                        serde_json::Value::String("1.0.0".to_string()),
                                    );
                                });
                                found = true;
                            }
                        }

                        if !found {
                            // If game wasn't in cache (like a manual or store-only game), insert it!
                            let mut new_game = serde_json::Map::new();
                            new_game.insert(
                                "id".to_string(),
                                serde_json::Value::String(game_id_clone.clone()),
                            );
                            new_game.insert(
                                "title".to_string(),
                                serde_json::Value::String(title_clone.clone()),
                            );
                            new_game.insert(
                                "status".to_string(),
                                serde_json::Value::String("installed".to_string()),
                            );
                            new_game.insert(
                                "installPath".to_string(),
                                serde_json::Value::String(
                                    install_dir
                                        .clone()
                                        .unwrap_or_default()
                                        .to_string_lossy()
                                        .to_string(),
                                ),
                            );
                            new_game.insert(
                                "description".to_string(),
                                serde_json::Value::String(format!(
                                    "Downloaded game: {title_clone}"
                                )),
                            );
                            new_game
                                .insert("genres".to_string(), serde_json::Value::Array(Vec::new()));
                            new_game.insert(
                                "features".to_string(),
                                serde_json::Value::Array(Vec::new()),
                            );
                            new_game.insert(
                                "platform".to_string(),
                                serde_json::Value::String("windows".to_string()),
                            );
                            new_game.insert(
                                "version".to_string(),
                                serde_json::Value::String("1.0.0".to_string()),
                            );
                            games_arr.push(serde_json::Value::Object(new_game));
                        }
                    }

                    if let Ok(updated_contents) = serde_json::to_string_pretty(&json) {
                        let _ = std::fs::write(&path, updated_contents);
                        // Emit game activity update to refresh library
                        let _ = app_clone.emit(
                            "game_activity_updated",
                            serde_json::json!({
                                "gameId": game_id_clone,
                            }),
                        );
                    }
                }
            }
        }

        update_download_status(&game_id_clone, "completed", "Done", 100, 0);
        emit_download_progress(&app_clone, &game_id_clone, 100, "Complete", "completed", 0);

        // Remove from manager after 2 seconds
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        let mut guard = get_download_manager().lock().unwrap();
        guard.remove(&game_id_clone);
    });

    Ok(StartDownloadResponse {
        game_id,
        download_id,
        status: DownloadStartStatus::Started,
        message: "Download started.".to_string(),
    })
}

fn update_download_status(game_id: &str, status: &str, speed: &str, progress: u32, eta: u32) {
    let map = get_download_manager();
    let mut guard = map.lock().unwrap();
    if let Some(dl) = guard.get_mut(game_id) {
        dl.status = status.to_string();
        dl.speed = speed.to_string();
        dl.progress = progress;
        dl.eta = eta;
    }
}

fn emit_download_progress(
    app: &tauri::AppHandle,
    game_id: &str,
    progress: u32,
    speed: &str,
    status: &str,
    eta: u32,
) {
    let title = {
        let guard = get_download_manager().lock().unwrap();
        guard
            .get(game_id)
            .map(|dl| dl.title.clone())
            .unwrap_or_else(|| "".to_string())
    };
    let payload = DownloadItemPayload {
        id: format!("download-{game_id}"),
        game_id: game_id.to_string(),
        title,
        progress,
        speed: speed.to_string(),
        status: status.to_string(),
        eta,
        platform: get_platform_from_game_id(game_id),
    };
    let _ = app.emit("download_progress", payload);
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
