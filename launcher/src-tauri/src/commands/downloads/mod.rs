mod control;
mod health;
mod history;
mod install;
mod internal_download;
mod queue;
mod reconcile;
mod start;
mod steam_cef;
mod steam_state;
mod types;
mod utils;
mod watcher;

pub use health::ProviderHealthStatus;
pub use history::record_download_item;
pub use reconcile::ReconciliationResult;
pub use types::{DownloadItemPayload, DownloadStartStatus, StartDownloadResponse};
pub use watcher::start_global_download_watcher;

#[tauri::command]
pub fn get_download_queue() -> Result<Vec<DownloadItemPayload>, String> {
    queue::get_download_queue()
}

#[tauri::command]
pub fn pause_download(app: tauri::AppHandle, game_id: String) -> Result<(), String> {
    control::pause_download(app, game_id)
}

#[tauri::command]
pub fn cancel_download(app: tauri::AppHandle, game_id: String) -> Result<(), String> {
    control::cancel_download(app, game_id)
}

#[tauri::command]
pub fn archive_download(game_id: String) -> Result<(), String> {
    control::archive_download(game_id)
}

#[tauri::command]
pub async fn start_download(
    app: tauri::AppHandle,
    game_id: String,
    game_title: Option<String>,
    download_url: Option<String>,
    download_sha256: Option<String>,
) -> Result<StartDownloadResponse, String> {
    start::start_download(app, game_id, game_title, download_url, download_sha256).await
}

#[tauri::command]
pub fn check_provider_health() -> Result<Vec<ProviderHealthStatus>, String> {
    health::check_provider_health()
}

#[tauri::command]
pub fn reconcile_downloads(app: tauri::AppHandle) -> Result<ReconciliationResult, String> {
    reconcile::reconcile_downloads(app)
}
