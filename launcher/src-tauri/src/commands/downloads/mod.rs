mod control;
mod external_dispatch;
mod external_download;
mod health;
mod history;
mod install;
mod internal_download;
mod internal_lifecycle;
mod lifecycle;
mod queue;
mod reconcile;
mod remote_security;
mod start;
mod steam_cef;
mod steam_state;
mod types;
mod utils;
mod watcher;

pub use health::ProviderHealthStatus;
pub use reconcile::ReconciliationResult;
pub(crate) use types::{clear_download_suppression, suppress_download_emissions};
pub use types::{DownloadItemPayload, DownloadStartStatus, StartDownloadResponse};
pub(crate) use utils::normalize_game_id as normalize_download_game_id;
pub use watcher::start_global_download_watcher;

pub(crate) fn emit_download_item(
    app: &tauri::AppHandle,
    payload: DownloadItemPayload,
) -> Result<(), String> {
    types::emit_download_payload(app, payload)
}

pub(crate) fn remove_download_record(app: &tauri::AppHandle, game_id: &str) -> Result<(), String> {
    history::remove_download_history_item(game_id)?;
    types::emit_download_removed(app, game_id);
    Ok(())
}

pub(crate) fn archive_download_record(app: &tauri::AppHandle, game_id: &str) -> Result<(), String> {
    history::remove_download_history_item(game_id)?;
    types::suppress_download_emissions(game_id);
    types::emit_download_removed(app, game_id);
    Ok(())
}

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
pub async fn archive_download(app: tauri::AppHandle, game_id: String) -> Result<(), String> {
    control::archive_download(app, game_id).await
}

#[tauri::command]
pub async fn start_download(
    app: tauri::AppHandle,
    game_id: String,
    game_title: Option<String>,
    download_url: Option<String>,
    download_sha256: Option<String>,
    install_manifest_url: Option<String>,
    install_manifest_sha256: Option<String>,
) -> Result<StartDownloadResponse, String> {
    start::start_download(
        app,
        game_id,
        game_title,
        download_url,
        download_sha256,
        install_manifest_url,
        install_manifest_sha256,
    )
    .await
}

#[tauri::command]
pub fn check_provider_health() -> Result<Vec<ProviderHealthStatus>, String> {
    health::check_provider_health()
}

#[tauri::command]
pub fn reconcile_downloads(app: tauri::AppHandle) -> Result<ReconciliationResult, String> {
    reconcile::reconcile_downloads(app)
}
