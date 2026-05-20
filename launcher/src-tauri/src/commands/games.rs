use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchGameResponse {
    game_id: String,
    success: bool,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyGameFilesResponse {
    game_id: String,
    checked_files: u32,
    missing_files: Vec<String>,
    status: VerificationStatus,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum VerificationStatus {
    Verified,
    RepairRequired,
}

#[tauri::command]
pub fn launch_game(game_id: String) -> Result<LaunchGameResponse, String> {
    let game_id = normalize_game_id(game_id)?;
    println!("[open-game-launcher] launch_game requested for {game_id}");

    Ok(LaunchGameResponse {
        game_id,
        success: true,
        message: "Launch request accepted.".to_string(),
    })
}

#[tauri::command]
pub fn verify_game_files(game_id: String) -> Result<VerifyGameFilesResponse, String> {
    let game_id = normalize_game_id(game_id)?;
    println!("[open-game-launcher] verify_game_files requested for {game_id}");

    let (missing_files, status) = if game_id.contains("broken") {
        (
            vec!["content/manifest.json".to_string()],
            VerificationStatus::RepairRequired,
        )
    } else {
        (Vec::new(), VerificationStatus::Verified)
    };

    Ok(VerifyGameFilesResponse {
        game_id,
        checked_files: 128,
        missing_files,
        status,
    })
}

fn normalize_game_id(game_id: String) -> Result<String, String> {
    let normalized = game_id.trim().to_string();

    if normalized.is_empty() {
        return Err("game_id must not be empty.".to_string());
    }

    Ok(normalized)
}
