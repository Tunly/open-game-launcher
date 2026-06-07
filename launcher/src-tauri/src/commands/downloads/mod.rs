mod history;
mod legacy;
mod types;
mod utils;

pub use legacy::{
    record_download_item, start_global_download_watcher, ProviderHealthStatus,
    ReconciliationResult,
};
pub use types::{DownloadItemPayload, DownloadStartStatus, StartDownloadResponse};

#[tauri::command]
pub fn get_download_queue() -> Result<Vec<DownloadItemPayload>, String> {
    legacy::get_download_queue()
}

#[tauri::command]
pub fn pause_download(app: tauri::AppHandle, game_id: String) -> Result<(), String> {
    legacy::pause_download(app, game_id)
}

#[tauri::command]
pub fn cancel_download(app: tauri::AppHandle, game_id: String) -> Result<(), String> {
    legacy::cancel_download(app, game_id)
}

#[tauri::command]
pub fn archive_download(game_id: String) -> Result<(), String> {
    legacy::archive_download(game_id)
}

#[tauri::command]
pub async fn start_download(
    app: tauri::AppHandle,
    game_id: String,
    game_title: Option<String>,
    download_url: Option<String>,
    download_sha256: Option<String>,
) -> Result<StartDownloadResponse, String> {
    legacy::start_download(app, game_id, game_title, download_url, download_sha256).await
}

#[tauri::command]
pub fn check_provider_health() -> Result<Vec<ProviderHealthStatus>, String> {
    legacy::check_provider_health()
}

#[tauri::command]
pub fn reconcile_downloads(app: tauri::AppHandle) -> Result<ReconciliationResult, String> {
    legacy::reconcile_downloads(app)
}
