mod control;
mod external_dispatch;
mod external_download;
mod health;
mod history;
mod install;
mod internal_download;
mod internal_lifecycle;
mod lan_transfer;
mod lifecycle;
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
pub(crate) use lifecycle::{InternalDownloadTerminalEvent, InternalDownloadTerminalHook};
pub use reconcile::ReconciliationResult;
pub(crate) use start::start_trusted_internal_download;
pub(crate) use types::{redact_download_error_message, InternalDownloadSource};
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

#[tauri::command]
pub fn preview_lan_transfer_copy(
    input: lan_transfer::LanTransferCopyRequest,
) -> Result<lan_transfer::LanTransferCopyPreview, String> {
    lan_transfer::preview_lan_transfer_copy(input)
}

#[tauri::command]
pub fn preview_lan_transfer_resume_cancel_ledger(
    input: lan_transfer::LanTransferResumeCancelLedgerRequest,
) -> Result<lan_transfer::LanTransferResumeCancelLedger, String> {
    lan_transfer::preview_lan_transfer_resume_cancel_ledger(input)
}

#[tauri::command]
pub fn preview_lan_transfer_peer_discovery_preflight(
    input: lan_transfer::LanTransferPeerDiscoveryPreflightRequest,
) -> Result<lan_transfer::LanTransferPeerDiscoveryPreflightResult, String> {
    lan_transfer::preview_lan_transfer_peer_discovery_preflight(input)
}

#[tauri::command]
pub fn get_lan_transfer_copy_jobs() -> Result<Vec<lan_transfer::LanTransferCopyJob>, String> {
    lan_transfer::get_lan_transfer_copy_jobs()
}

#[tauri::command]
pub fn start_lan_transfer_copy_job(
    input: lan_transfer::LanTransferCopyRequest,
) -> Result<lan_transfer::LanTransferCopyJob, String> {
    lan_transfer::start_lan_transfer_copy_job(input)
}

#[tauri::command]
pub fn cancel_lan_transfer_copy_job(
    job_id: String,
) -> Result<lan_transfer::LanTransferCopyJob, String> {
    lan_transfer::cancel_lan_transfer_copy_job(job_id)
}

#[tauri::command]
pub fn run_lan_transfer_copy(
    input: lan_transfer::LanTransferCopyRequest,
) -> Result<lan_transfer::LanTransferCopyResult, String> {
    lan_transfer::run_lan_transfer_copy(input)
}

#[tauri::command]
pub fn run_lan_transfer_resume_copy(
    input: lan_transfer::LanTransferCopyRequest,
) -> Result<lan_transfer::LanTransferResumeCopyResult, String> {
    lan_transfer::run_lan_transfer_resume_copy(input)
}

#[tauri::command]
pub fn run_lan_transfer_cleanup_candidates(
    input: lan_transfer::LanTransferCleanupCandidatesRequest,
) -> Result<lan_transfer::LanTransferCleanupCandidatesResult, String> {
    lan_transfer::run_lan_transfer_cleanup_candidates(input)
}
