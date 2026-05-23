use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartDownloadResponse {
    game_id: String,
    download_id: String,
    status: DownloadStartStatus,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DownloadStartStatus {
    Started,
}

#[tauri::command]
pub fn start_download(game_id: String) -> Result<StartDownloadResponse, String> {
    let game_id = normalize_game_id(game_id)?;
    let download_id = format!("download-{game_id}");

    println!("[open-game-launcher] start_download requested for {game_id}");

    Ok(StartDownloadResponse {
        game_id,
        download_id,
        status: DownloadStartStatus::Started,
        message: "Download queued.".to_string(),
    })
}

fn normalize_game_id(game_id: String) -> Result<String, String> {
    let normalized = game_id.trim().to_string();

    if normalized.is_empty() {
        return Err("game_id must not be empty.".to_string());
    }

    Ok(normalized)
}
