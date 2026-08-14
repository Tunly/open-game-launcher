use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::future::Future;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::Emitter;
use tokio::sync::watch;

use crate::commands::downloads::history::{
    is_stale_installed_download, remember_download_item, remove_download_history_item,
};
use crate::commands::downloads::utils::{
    get_platform_from_game_id, is_external_tracker_game_id, is_steam_tracker_game_id,
    progress_source_from_game_id, provider_key_from_game_id,
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
    AlreadyQueued,
    AlreadyInstalled,
    ConcurrencyLimitReached,
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
    #[serde(default)]
    pub last_updated_at: u64,
    #[serde(default)]
    pub event_revision: u64,
    #[serde(default)]
    pub provider: String,
    #[serde(default)]
    pub raw_status: String,
    #[serde(default)]
    pub progress_source: String,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(skip)]
    pub(crate) worker_generation: Option<u64>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DownloadCommandErrorPayload {
    game_id: String,
    message: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DownloadRemovedPayload {
    game_id: String,
}

pub(crate) struct ActiveDownload {
    pub(crate) worker_generation: u64,
    pub(crate) title: String,
    pub(crate) progress: u32,
    pub(crate) speed: String,
    pub(crate) status: String,
    pub(crate) eta: u32,
    pub(crate) phase: String,
    pub(crate) bytes_downloaded: Option<u64>,
    pub(crate) bytes_total: Option<u64>,
    pub(crate) can_pause: bool,
    pub(crate) can_cancel: bool,
    pub(crate) external: bool,
    pub(crate) paused: bool,
    pub(crate) cancelled: bool,
    pub(crate) pause_tx: watch::Sender<bool>,
    pub(crate) cancel_tx: watch::Sender<bool>,
    pub(crate) raw_status: String,
    pub(crate) error: Option<String>,
}

tokio::task_local! {
    static DOWNLOAD_WORKER_GENERATION: u64;
}

pub(crate) async fn scope_download_worker<F>(generation: u64, future: F) -> F::Output
where
    F: Future,
{
    DOWNLOAD_WORKER_GENERATION.scope(generation, future).await
}

pub(crate) fn next_download_worker_generation() -> u64 {
    static NEXT_GENERATION: AtomicU64 = AtomicU64::new(1);
    NEXT_GENERATION.fetch_add(1, Ordering::Relaxed)
}

fn scoped_download_worker_generation() -> Option<u64> {
    DOWNLOAD_WORKER_GENERATION
        .try_with(|generation| *generation)
        .ok()
}

#[derive(Debug, Clone)]
pub(crate) struct InternalDownloadSource {
    pub(crate) url: String,
    pub(crate) sha256: Option<String>,
    pub(crate) install_manifest_url: Option<String>,
    pub(crate) install_manifest_sha256: Option<String>,
    pub(crate) persist_download_url: bool,
}

impl InternalDownloadSource {
    pub(crate) fn direct_url(
        url: String,
        sha256: Option<String>,
        install_manifest_url: Option<String>,
        install_manifest_sha256: Option<String>,
    ) -> Self {
        Self {
            url,
            sha256,
            install_manifest_url,
            install_manifest_sha256,
            persist_download_url: true,
        }
    }

    #[allow(dead_code)]
    pub(crate) fn ephemeral_remote_store_ticket(
        url: String,
        sha256: Option<String>,
        install_manifest_url: Option<String>,
        install_manifest_sha256: Option<String>,
    ) -> Self {
        Self {
            url,
            sha256,
            install_manifest_url,
            install_manifest_sha256,
            persist_download_url: false,
        }
    }

    pub(crate) fn manifest_download_url(&self) -> Option<String> {
        self.persist_download_url.then(|| self.url.clone())
    }
}

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub(crate) enum SteamDownloadControlAction {
    Pause,
    Resume,
}

pub(crate) type DownloadMap = Arc<Mutex<HashMap<String, ActiveDownload>>>;

pub(crate) const STEAM_STATE_UPDATE_REQUIRED: u64 = 2;
pub(crate) const STEAM_STATE_FULLY_INSTALLED: u64 = 4;
pub(crate) const DOWNLOAD_STATUS_DOWNLOADING: &str = "downloading";
pub(crate) const DOWNLOAD_STATUS_PAUSED: &str = "paused";
pub(crate) const DOWNLOAD_STATUS_COMPLETED: &str = "completed";
pub(crate) const DOWNLOAD_STATUS_FAILED: &str = "failed";
pub(crate) const DOWNLOAD_STATUS_CANCELLED: &str = "cancelled";
pub(crate) const DOWNLOAD_STATUS_ERROR: &str = "error";
pub(crate) const DOWNLOAD_STATUS_QUEUED: &str = "queued";
pub(crate) const DOWNLOAD_STATUS_STARTING: &str = "starting";
pub(crate) const DOWNLOAD_STATUS_PAUSING: &str = "pausing";
pub(crate) const DOWNLOAD_STATUS_RESUMING: &str = "resuming";
pub(crate) const DOWNLOAD_STATUS_INSTALLING: &str = "installing";

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub(crate) enum DownloadStatusKind {
    Queued,
    Starting,
    Downloading,
    Pausing,
    Paused,
    Resuming,
    Installing,
    Completed,
    Failed,
    Cancelled,
    Error,
}

impl DownloadStatusKind {
    pub(crate) fn parse(status: &str) -> Option<Self> {
        match status {
            DOWNLOAD_STATUS_QUEUED => Some(Self::Queued),
            DOWNLOAD_STATUS_STARTING => Some(Self::Starting),
            DOWNLOAD_STATUS_DOWNLOADING => Some(Self::Downloading),
            DOWNLOAD_STATUS_PAUSING => Some(Self::Pausing),
            DOWNLOAD_STATUS_PAUSED => Some(Self::Paused),
            DOWNLOAD_STATUS_RESUMING => Some(Self::Resuming),
            DOWNLOAD_STATUS_INSTALLING => Some(Self::Installing),
            DOWNLOAD_STATUS_COMPLETED => Some(Self::Completed),
            DOWNLOAD_STATUS_FAILED => Some(Self::Failed),
            DOWNLOAD_STATUS_CANCELLED => Some(Self::Cancelled),
            DOWNLOAD_STATUS_ERROR => Some(Self::Error),
            _ => None,
        }
    }

    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Queued => DOWNLOAD_STATUS_QUEUED,
            Self::Starting => DOWNLOAD_STATUS_STARTING,
            Self::Downloading => DOWNLOAD_STATUS_DOWNLOADING,
            Self::Pausing => DOWNLOAD_STATUS_PAUSING,
            Self::Paused => DOWNLOAD_STATUS_PAUSED,
            Self::Resuming => DOWNLOAD_STATUS_RESUMING,
            Self::Installing => DOWNLOAD_STATUS_INSTALLING,
            Self::Completed => DOWNLOAD_STATUS_COMPLETED,
            Self::Failed => DOWNLOAD_STATUS_FAILED,
            Self::Cancelled => DOWNLOAD_STATUS_CANCELLED,
            Self::Error => DOWNLOAD_STATUS_ERROR,
        }
    }

    pub(crate) fn is_terminal(self) -> bool {
        matches!(
            self,
            Self::Completed | Self::Failed | Self::Cancelled | Self::Error
        )
    }

    pub(crate) fn is_restart_interrupted(self) -> bool {
        matches!(
            self,
            Self::Downloading
                | Self::Queued
                | Self::Starting
                | Self::Pausing
                | Self::Resuming
                | Self::Installing
        )
    }

    pub(crate) fn is_pause_toggle(self) -> bool {
        matches!(self, Self::Downloading | Self::Paused)
    }

    pub(crate) fn is_cancellable(self) -> bool {
        matches!(
            self,
            Self::Queued | Self::Starting | Self::Downloading | Self::Paused
        )
    }

    pub(crate) fn is_steam_control_pending(self) -> bool {
        matches!(self, Self::Pausing | Self::Resuming)
    }

    /// Transition into the paused state. Legal only from downloading.
    pub(crate) fn transition_paused(self) -> Option<Self> {
        match self {
            Self::Downloading => Some(Self::Paused),
            _ => None,
        }
    }

    /// Transition back into downloading. Legal only from paused.
    pub(crate) fn transition_resumed(self) -> Option<Self> {
        match self {
            Self::Paused => Some(Self::Downloading),
            _ => None,
        }
    }

    /// Transition into the installing/commit state. Legal only from a
    /// cancellable (non-terminal, pausable) state; the caller additionally
    /// guards against a cancelled worker via its cancel channel.
    pub(crate) fn begin_commit(self) -> Result<Self, String> {
        if !self.is_cancellable() {
            return Err(format!(
                "Download commit cannot begin while its status is '{}'.",
                self.as_str()
            ));
        }
        Ok(Self::Installing)
    }
}

pub(crate) fn validated_download_status(status: &str) -> &'static str {
    DownloadStatusKind::parse(status)
        .unwrap_or(DownloadStatusKind::Failed)
        .as_str()
}

pub(crate) fn is_terminal_download_status(status: &str) -> bool {
    DownloadStatusKind::parse(status).is_some_and(DownloadStatusKind::is_terminal)
}

pub(crate) fn is_restart_interrupted_download_status(status: &str) -> bool {
    DownloadStatusKind::parse(status).is_some_and(DownloadStatusKind::is_restart_interrupted)
}

pub(crate) fn is_pause_toggle_status(status: &str) -> bool {
    DownloadStatusKind::parse(status).is_some_and(DownloadStatusKind::is_pause_toggle)
}

pub(crate) fn is_cancellable_download_status(status: &str) -> bool {
    DownloadStatusKind::parse(status).is_some_and(DownloadStatusKind::is_cancellable)
}

pub(crate) fn is_steam_control_pending_status(status: &str) -> bool {
    DownloadStatusKind::parse(status).is_some_and(DownloadStatusKind::is_steam_control_pending)
}

pub(crate) fn get_download_manager() -> &'static DownloadMap {
    static MANAGER: OnceLock<DownloadMap> = OnceLock::new();
    MANAGER.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

pub(crate) fn get_download_lifecycle_lock() -> &'static Mutex<()> {
    static LIFECYCLE: OnceLock<Mutex<()>> = OnceLock::new();
    LIFECYCLE.get_or_init(|| Mutex::new(()))
}

fn active_download_matches_generation(download: &ActiveDownload, generation: Option<u64>) -> bool {
    generation.is_none_or(|generation| download.worker_generation == generation)
}

fn get_suppressed_downloads() -> &'static Mutex<HashSet<String>> {
    static SUPPRESSED: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    SUPPRESSED.get_or_init(|| Mutex::new(HashSet::new()))
}

pub(crate) fn suppress_download_emissions(game_id: &str) {
    get_suppressed_downloads()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .insert(game_id.to_string());
}

pub(crate) fn clear_download_suppression(game_id: &str) {
    get_suppressed_downloads()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .remove(game_id);
}

pub(crate) fn is_download_suppressed(game_id: &str) -> bool {
    get_suppressed_downloads()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .contains(game_id)
}

pub(crate) fn remove_active_download_if_current(
    game_id: &str,
    worker_cancel_rx: &watch::Receiver<bool>,
) -> bool {
    remove_active_download_if_current_in_map(get_download_manager(), game_id, worker_cancel_rx)
}

fn remove_active_download_if_current_in_map(
    map: &DownloadMap,
    game_id: &str,
    worker_cancel_rx: &watch::Receiver<bool>,
) -> bool {
    let Ok(mut guard) = map.lock() else {
        return false;
    };
    let is_current = guard.get(game_id).is_some_and(|download| {
        download
            .cancel_tx
            .subscribe()
            .same_channel(worker_cancel_rx)
    });
    if is_current {
        guard.remove(game_id);
    }
    is_current
}

pub(crate) fn toggle_download_pause(
    game_id: &str,
) -> Result<Option<Box<DownloadItemPayload>>, String> {
    toggle_download_pause_in_map(get_download_manager(), game_id)
}

fn toggle_download_pause_in_map(
    map: &DownloadMap,
    game_id: &str,
) -> Result<Option<Box<DownloadItemPayload>>, String> {
    let mut guard = map
        .lock()
        .map_err(|error| format!("Download manager lock poisoned: {error}"))?;
    let Some(download) = guard.get_mut(game_id) else {
        return Ok(None);
    };

    match DownloadStatusKind::parse(&download.status) {
        Some(kind) if kind.transition_paused().is_some() => {
            download.paused = true;
            download.status = DOWNLOAD_STATUS_PAUSED.to_string();
            download.speed = "Paused".to_string();
            download.phase = "paused".to_string();
            download.raw_status = DOWNLOAD_STATUS_PAUSED.to_string();
            let _ = download.pause_tx.send(true);
        }
        Some(kind) if kind.transition_resumed().is_some() => {
            download.paused = false;
            download.status = DOWNLOAD_STATUS_DOWNLOADING.to_string();
            download.speed = "Connecting...".to_string();
            download.phase = "download".to_string();
            download.raw_status = DOWNLOAD_STATUS_DOWNLOADING.to_string();
            let _ = download.pause_tx.send(false);
        }
        _ => return Ok(None),
    }

    Ok(Some(Box::new(payload_from_active_download(
        game_id, download,
    ))))
}

#[derive(Debug)]
pub(crate) enum DownloadCancellationTransition {
    Cancelled(Box<DownloadItemPayload>),
    Missing,
    Rejected { status: String },
}

pub(crate) fn request_download_cancellation(
    game_id: &str,
) -> Result<DownloadCancellationTransition, String> {
    request_download_cancellation_in_map(get_download_manager(), game_id)
}

fn request_download_cancellation_in_map(
    map: &DownloadMap,
    game_id: &str,
) -> Result<DownloadCancellationTransition, String> {
    let mut guard = map
        .lock()
        .map_err(|error| format!("Download manager lock poisoned: {error}"))?;
    let Some(download) = guard.get_mut(game_id) else {
        return Ok(DownloadCancellationTransition::Missing);
    };

    if !download.can_cancel
        || !DownloadStatusKind::parse(&download.status).is_some_and(|kind| kind.is_cancellable())
    {
        return Ok(DownloadCancellationTransition::Rejected {
            status: download.status.clone(),
        });
    }

    download.cancelled = true;
    download.status = DOWNLOAD_STATUS_CANCELLED.to_string();
    download.speed = "Cancelled".to_string();
    download.eta = 0;
    download.phase = DOWNLOAD_STATUS_CANCELLED.to_string();
    download.can_pause = false;
    download.can_cancel = false;
    download.raw_status = DOWNLOAD_STATUS_CANCELLED.to_string();
    download.error = None;
    let _ = download.cancel_tx.send(true);
    let payload = payload_from_active_download(game_id, download);

    Ok(DownloadCancellationTransition::Cancelled(Box::new(payload)))
}

pub(crate) fn begin_download_commit(game_id: &str) -> Result<Option<DownloadItemPayload>, String> {
    begin_download_commit_in_map(get_download_manager(), game_id)
}

fn begin_download_commit_in_map(
    map: &DownloadMap,
    game_id: &str,
) -> Result<Option<DownloadItemPayload>, String> {
    let mut guard = map
        .lock()
        .map_err(|error| format!("Download manager lock poisoned: {error}"))?;
    let Some(download) = guard.get_mut(game_id) else {
        return Ok(None);
    };
    if !active_download_matches_generation(download, scoped_download_worker_generation()) {
        return Ok(None);
    }

    if download.cancelled
        || *download.cancel_tx.borrow()
        || download.status == DOWNLOAD_STATUS_CANCELLED
    {
        return Ok(None);
    }
    // Commit legality is a property of the current state, not a separate
    // can_cancel flag re-derived by every caller.
    DownloadStatusKind::parse(&download.status)
        .ok_or_else(|| {
            format!(
                "Download commit cannot begin while its status is '{}'.",
                download.status
            )
        })?
        .begin_commit()?;

    download.status = DOWNLOAD_STATUS_INSTALLING.to_string();
    download.speed = "Installing".to_string();
    download.progress = 99;
    download.eta = 0;
    download.phase = DOWNLOAD_STATUS_INSTALLING.to_string();
    download.can_pause = false;
    download.can_cancel = false;
    download.paused = false;
    download.raw_status = DOWNLOAD_STATUS_INSTALLING.to_string();
    download.error = None;

    Ok(Some(payload_from_active_download(game_id, download)))
}

pub(crate) fn update_download_status(
    game_id: &str,
    status: &str,
    speed: &str,
    progress: u32,
    eta: u32,
) {
    let status = validated_download_status(status);
    let Ok(mut guard) = get_download_manager().lock() else {
        return;
    };
    if let Some(dl) = guard.get_mut(game_id) {
        if !active_download_matches_generation(dl, scoped_download_worker_generation()) {
            return;
        }
        dl.status = status.to_string();
        dl.speed = speed.to_string();
        dl.progress = normalize_progress(progress, status);
        dl.eta = eta;
        dl.phase = phase_from_status_and_speed(status, speed);
        if status == DOWNLOAD_STATUS_INSTALLING || is_terminal_download_status(status) {
            dl.can_pause = false;
            dl.can_cancel = false;
        }
    }
}

pub(crate) fn update_download_metrics(
    game_id: &str,
    phase: &str,
    bytes_downloaded: Option<u64>,
    bytes_total: Option<u64>,
) {
    let Ok(mut guard) = get_download_manager().lock() else {
        return;
    };
    if let Some(dl) = guard.get_mut(game_id) {
        if !active_download_matches_generation(dl, scoped_download_worker_generation()) {
            return;
        }
        dl.phase = phase.to_string();
        dl.bytes_downloaded = bytes_downloaded;
        dl.bytes_total = bytes_total;
    }
}

pub(crate) fn pause_hold_feedback(game_id: &str, default_speed: &str) -> (String, String, u32) {
    if let Ok(guard) = get_download_manager().lock() {
        if let Some(dl) = guard.get(game_id) {
            if dl.status == DOWNLOAD_STATUS_PAUSING {
                return (dl.status.clone(), dl.speed.clone(), dl.eta);
            }
        }
    }

    (
        DOWNLOAD_STATUS_PAUSED.to_string(),
        default_speed.to_string(),
        0,
    )
}

pub(crate) fn is_download_control_pending(game_id: &str) -> bool {
    get_download_manager()
        .lock()
        .ok()
        .and_then(|guard| {
            guard
                .get(game_id)
                .map(|dl| is_steam_control_pending_status(&dl.status))
        })
        .unwrap_or(false)
}

pub(crate) fn emit_download_command_error(app: &tauri::AppHandle, game_id: &str, message: &str) {
    let _ = app.emit(
        "download_command_error",
        DownloadCommandErrorPayload {
            game_id: game_id.to_string(),
            message: redact_download_error_message(message),
        },
    );
}

pub(crate) fn emit_download_removed(app: &tauri::AppHandle, game_id: &str) {
    let _ = app.emit(
        "download_removed",
        DownloadRemovedPayload {
            game_id: game_id.to_string(),
        },
    );
}

pub(crate) fn phase_from_status_and_speed(status: &str, speed: &str) -> String {
    if is_terminal_download_status(status) {
        return status.to_string();
    }
    if status == DOWNLOAD_STATUS_PAUSED || status == DOWNLOAD_STATUS_PAUSING {
        return "paused".to_string();
    }
    if status == DOWNLOAD_STATUS_RESUMING
        || status == DOWNLOAD_STATUS_STARTING
        || status == DOWNLOAD_STATUS_QUEUED
    {
        return "external".to_string();
    }
    if status == DOWNLOAD_STATUS_INSTALLING {
        return "installing".to_string();
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

pub(crate) fn normalize_progress(progress: u32, status: &str) -> u32 {
    if status == DOWNLOAD_STATUS_COMPLETED {
        100
    } else {
        progress.min(99)
    }
}

pub(crate) async fn cancellable_sleep(
    cancel_rx: &watch::Receiver<bool>,
    duration: Duration,
) -> bool {
    let start = Instant::now();
    while start.elapsed() < duration {
        if *cancel_rx.borrow() {
            return true;
        }
        let remaining = duration.saturating_sub(start.elapsed());
        tokio::time::sleep(remaining.min(Duration::from_millis(200))).await;
    }
    false
}

pub(crate) fn now_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
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
    let scoped_generation = scoped_download_worker_generation();
    let mut payload = get_download_manager().lock().ok().and_then(|guard| {
        guard.get(game_id).and_then(|download| {
            active_download_matches_generation(download, scoped_generation)
                .then(|| payload_from_active_download(game_id, download))
        })
    });
    if scoped_generation.is_some() && payload.is_none() {
        return;
    }
    let mut payload = payload
        .take()
        .unwrap_or_else(|| default_download_payload(game_id, ""));
    if scoped_generation.is_some() {
        payload.worker_generation = scoped_generation;
    }
    payload.progress = normalize_progress(progress, status);
    payload.speed = speed.to_string();
    payload.status = status.to_string();
    payload.eta = eta;
    payload.phase = phase_from_status_and_speed(status, speed);
    if let Err(error) = emit_download_payload(app, payload) {
        eprintln!("[open-game-launcher] Could not persist download progress: {error}");
    }
}

pub(crate) fn emit_download_payload(
    app: &tauri::AppHandle,
    payload: DownloadItemPayload,
) -> Result<(), String> {
    let _lifecycle = get_download_lifecycle_lock()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let expected_generation = payload.worker_generation;
    let active_downloads = if let Some(generation) = expected_generation {
        let guard = get_download_manager()
            .lock()
            .map_err(|error| format!("Download manager lock poisoned: {error}"))?;
        let is_current = guard
            .get(&payload.game_id)
            .is_some_and(|download| download.worker_generation == generation);
        if !is_current {
            return Ok(());
        }
        Some(guard)
    } else {
        None
    };
    let payload = normalize_queue_payload(payload);
    if is_stale_installed_download(&payload) {
        remove_download_history_item(&payload.game_id)?;
        emit_download_removed(app, &payload.game_id);
        return Ok(());
    }

    // Serialize the final tombstone check with persistence and emission. If a
    // cancel/archive wins this lock first, the payload is discarded. If an
    // already-running emit wins, cancel/archive waits and then removes that row
    // and emits `download_removed`, preserving a deterministic final order.
    let suppressed_downloads = get_suppressed_downloads()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if suppressed_downloads.contains(&payload.game_id) {
        remove_download_history_item(&payload.game_id)?;
        return Ok(());
    }

    let payload = stamp_download_payload(payload, now_unix_secs(), next_download_event_revision());
    remember_download_item(payload.clone())?;
    let _ = app.emit("download_progress", payload);
    drop(active_downloads);
    Ok(())
}

fn next_download_event_revision() -> u64 {
    static LAST_REVISION: AtomicU64 = AtomicU64::new(0);
    let wall_clock = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_micros().min(u128::from(u64::MAX)) as u64)
        .unwrap_or(0);
    let mut observed = LAST_REVISION.load(Ordering::Relaxed);
    loop {
        let next = wall_clock.max(observed.saturating_add(1));
        match LAST_REVISION.compare_exchange_weak(
            observed,
            next,
            Ordering::SeqCst,
            Ordering::Relaxed,
        ) {
            Ok(_) => return next,
            Err(actual) => observed = actual,
        }
    }
}

fn stamp_download_payload(
    mut payload: DownloadItemPayload,
    timestamp: u64,
    event_revision: u64,
) -> DownloadItemPayload {
    payload.last_updated_at = timestamp;
    payload.event_revision = event_revision;
    payload
}

#[cfg(test)]
fn should_suppress_download_payload(payload: &DownloadItemPayload) -> bool {
    // A worker can race with map removal and then build a fallback payload whose
    // metadata cannot describe the removed map entry. Tombstones are registered
    // for cancelled internal jobs and archived external trackers, so the id is
    // authoritative and the payload's `external` flag must not be consulted.
    is_download_suppressed(&payload.game_id)
}

pub(crate) fn payload_from_active_download(
    game_id: &str,
    dl: &ActiveDownload,
) -> DownloadItemPayload {
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
        event_revision: 0,
        provider: provider_key_from_game_id(game_id),
        raw_status: dl.raw_status.clone(),
        progress_source: progress_source_from_game_id(game_id),
        error: dl.error.clone(),
        worker_generation: Some(dl.worker_generation),
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
        event_revision: 0,
        provider: provider_key_from_game_id(game_id),
        raw_status: String::new(),
        progress_source: progress_source_from_game_id(game_id),
        error: None,
        worker_generation: None,
    })
}

pub(crate) fn normalize_queue_payload(mut item: DownloadItemPayload) -> DownloadItemPayload {
    item.status = validated_download_status(&item.status).to_string();
    item.speed = redact_download_error_message(&item.speed);
    item.error = item.error.as_deref().map(redact_download_error_message);
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
    item.can_cancel = item.can_cancel
        && is_cancellable_download_status(&item.status)
        && !external
        && !is_terminal;

    item
}

pub(crate) fn redact_download_error_message(message: &str) -> String {
    if !contains_download_secret_marker(message) {
        return message.to_string();
    }

    message
        .split_whitespace()
        .map(|part| {
            if contains_download_secret_marker(part) {
                "[redacted-url]"
            } else {
                part
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn contains_download_secret_marker(value: &str) -> bool {
    let lowered = value.to_ascii_lowercase();
    lowered.contains("http://")
        || lowered.contains("https://")
        || lowered.contains("oglauncher://")
        || lowered.contains("token=")
        || lowered.contains("sig=")
        || lowered.contains("signedurl")
        || lowered.contains("signed_url")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn active_download_fixture() -> (ActiveDownload, watch::Receiver<bool>) {
        let (pause_tx, _pause_rx) = watch::channel(false);
        let (cancel_tx, cancel_rx) = watch::channel(false);
        (
            ActiveDownload {
                worker_generation: next_download_worker_generation(),
                title: "Race Test".to_string(),
                progress: 98,
                speed: "Downloading".to_string(),
                status: DOWNLOAD_STATUS_DOWNLOADING.to_string(),
                eta: 1,
                phase: "download".to_string(),
                bytes_downloaded: Some(98),
                bytes_total: Some(100),
                can_pause: true,
                can_cancel: true,
                external: false,
                paused: false,
                cancelled: false,
                pause_tx,
                cancel_tx,
                raw_status: DOWNLOAD_STATUS_DOWNLOADING.to_string(),
                error: None,
            },
            cancel_rx,
        )
    }

    #[test]
    fn cancellation_immediately_before_download_commit_prevents_installing_transition() {
        let map: DownloadMap = Arc::new(Mutex::new(HashMap::new()));
        let (download, cancel_rx) = active_download_fixture();
        map.lock()
            .unwrap()
            .insert("race-before".to_string(), download);

        let cancellation = request_download_cancellation_in_map(&map, "race-before").unwrap();
        let DownloadCancellationTransition::Cancelled(payload) = cancellation else {
            panic!("cancellation should win before the commit boundary");
        };

        assert_eq!(payload.status, DOWNLOAD_STATUS_CANCELLED);
        assert!(!payload.can_cancel);
        assert!(begin_download_commit_in_map(&map, "race-before")
            .unwrap()
            .is_none());
        assert!(*cancel_rx.borrow());
        assert!(map.lock().unwrap().contains_key("race-before"));
        assert!(remove_active_download_if_current_in_map(
            &map,
            "race-before",
            &cancel_rx,
        ));
    }

    #[test]
    fn cancellation_immediately_after_download_commit_is_rejected() {
        let map: DownloadMap = Arc::new(Mutex::new(HashMap::new()));
        let (download, cancel_rx) = active_download_fixture();
        map.lock()
            .unwrap()
            .insert("race-after".to_string(), download);

        let committing = begin_download_commit_in_map(&map, "race-after")
            .unwrap()
            .expect("commit transition should start");
        assert_eq!(committing.status, DOWNLOAD_STATUS_INSTALLING);
        assert!(!committing.can_cancel);

        let cancellation = request_download_cancellation_in_map(&map, "race-after").unwrap();
        let DownloadCancellationTransition::Rejected { status } = cancellation else {
            panic!("cancellation must be rejected after the commit boundary");
        };
        assert_eq!(status, DOWNLOAD_STATUS_INSTALLING);
        assert!(!*cancel_rx.borrow());

        let guard = map.lock().unwrap();
        let download = guard.get("race-after").unwrap();
        assert_eq!(download.status, DOWNLOAD_STATUS_INSTALLING);
        assert!(!download.can_cancel);
        assert!(!download.cancelled);
    }

    #[test]
    fn worker_cleanup_never_removes_a_newer_download_for_the_same_game() {
        let map: DownloadMap = Arc::new(Mutex::new(HashMap::new()));
        let (old_download, old_cancel_rx) = active_download_fixture();
        map.lock()
            .unwrap()
            .insert("same-game".to_string(), old_download);

        let (new_download, new_cancel_rx) = active_download_fixture();
        map.lock()
            .unwrap()
            .insert("same-game".to_string(), new_download);

        assert!(!remove_active_download_if_current_in_map(
            &map,
            "same-game",
            &old_cancel_rx,
        ));
        assert!(map.lock().unwrap().contains_key("same-game"));

        assert!(remove_active_download_if_current_in_map(
            &map,
            "same-game",
            &new_cancel_rx,
        ));
        assert!(!map.lock().unwrap().contains_key("same-game"));
    }

    #[test]
    fn pause_toggle_returns_a_payload_after_releasing_the_manager_lock() {
        let map: DownloadMap = Arc::new(Mutex::new(HashMap::new()));
        let (mut download, _cancel_rx) = active_download_fixture();
        let pause_rx = download.pause_tx.subscribe();
        download.status = DOWNLOAD_STATUS_DOWNLOADING.to_string();
        download.speed = "Downloading".to_string();
        download.can_pause = true;
        map.lock()
            .unwrap()
            .insert("pause-game".to_string(), download);

        let paused = toggle_download_pause_in_map(&map, "pause-game")
            .unwrap()
            .expect("active download should pause");

        assert_eq!(paused.status, DOWNLOAD_STATUS_PAUSED);
        assert_eq!(paused.speed, "Paused");
        assert!(*pause_rx.borrow());
        assert!(
            map.try_lock().is_ok(),
            "pause transition leaked the manager lock"
        );

        let resumed = toggle_download_pause_in_map(&map, "pause-game")
            .unwrap()
            .expect("paused download should resume");
        assert_eq!(resumed.status, DOWNLOAD_STATUS_DOWNLOADING);
        assert!(!*pause_rx.borrow());
        assert!(
            map.try_lock().is_ok(),
            "resume transition leaked the manager lock"
        );
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
            event_revision: 0,
            provider: String::new(),
            raw_status: String::new(),
            progress_source: String::new(),
            error: None,
            worker_generation: None,
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
            event_revision: 0,
            provider: String::new(),
            raw_status: String::new(),
            progress_source: String::new(),
            error: None,
            worker_generation: None,
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
            event_revision: 0,
            provider: String::new(),
            raw_status: String::new(),
            progress_source: String::new(),
            error: None,
            worker_generation: None,
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
    fn download_status_transitions_are_state_driven() {
        // Pause/resume legality is a property of the current state.
        assert_eq!(
            DownloadStatusKind::Downloading.transition_paused(),
            Some(DownloadStatusKind::Paused)
        );
        assert_eq!(
            DownloadStatusKind::Paused.transition_resumed(),
            Some(DownloadStatusKind::Downloading)
        );
        assert_eq!(DownloadStatusKind::Paused.transition_paused(), None);
        assert_eq!(DownloadStatusKind::Completed.transition_paused(), None);
        assert_eq!(DownloadStatusKind::Queued.transition_resumed(), None);

        // Commit legality: only cancellable states may begin a commit.
        assert_eq!(
            DownloadStatusKind::Downloading.begin_commit(),
            Ok(DownloadStatusKind::Installing)
        );
        assert_eq!(
            DownloadStatusKind::Paused.begin_commit(),
            Ok(DownloadStatusKind::Installing)
        );
        assert!(DownloadStatusKind::Completed.begin_commit().is_err());
        assert!(DownloadStatusKind::Installing.begin_commit().is_err());
        assert!(DownloadStatusKind::Failed.begin_commit().is_err());
    }

    #[test]
    fn explicit_restart_clears_download_remove_suppression() {
        let game_id = "steam-owned-suppression-test";
        clear_download_suppression(game_id);
        assert!(!is_download_suppressed(game_id));

        suppress_download_emissions(game_id);
        assert!(is_download_suppressed(game_id));

        clear_download_suppression(game_id);
        assert!(!is_download_suppressed(game_id));
    }

    #[test]
    fn suppressed_map_missing_fallback_payload_cannot_reappear() {
        let game_id = "steam-owned-map-missing-suppression-test";
        clear_download_suppression(game_id);
        suppress_download_emissions(game_id);

        let payload = DownloadItemPayload {
            // Model a late worker emission after its manager entry has already
            // been removed, before any provider metadata can be recovered.
            external: false,
            ..default_download_payload(game_id, "")
        };
        assert!(!payload.external, "fixture must model the map-missing path");
        assert!(should_suppress_download_payload(&payload));

        clear_download_suppression(game_id);
    }

    #[test]
    fn cancelled_internal_payload_cannot_reappear() {
        let game_id = "internal-cancel-suppression-test";
        clear_download_suppression(game_id);
        suppress_download_emissions(game_id);

        let payload = default_download_payload(game_id, "Internal download");
        assert!(!payload.external);
        assert!(should_suppress_download_payload(&payload));

        clear_download_suppression(game_id);
    }

    #[test]
    fn emitted_download_payload_uses_the_persisted_timestamp() {
        let payload =
            stamp_download_payload(default_download_payload("timestamp-test", ""), 123, 456);

        assert_eq!(payload.last_updated_at, 123);
        assert_eq!(payload.event_revision, 456);
    }

    #[test]
    fn event_revisions_are_strictly_monotonic() {
        let first = next_download_event_revision();
        let second = next_download_event_revision();

        assert!(second > first);
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
            event_revision: 0,
            provider: String::new(),
            raw_status: String::new(),
            progress_source: String::new(),
            error: None,
            worker_generation: None,
        });

        assert_eq!(item.status, DOWNLOAD_STATUS_FAILED);
        assert_eq!(item.progress, 77);
        assert!(!item.can_pause);
        assert!(!item.can_cancel);
    }

    #[test]
    fn external_tracker_phase_stays_external_without_fake_progress() {
        assert_eq!(
            phase_from_status_and_speed("downloading", "Xbox App / PC Game Pass (External)"),
            "external"
        );
        assert_eq!(
            phase_from_status_and_speed("downloading", "EA App (External)"),
            "external"
        );
    }

    #[test]
    fn redact_download_error_message_removes_urls_and_signed_tokens() {
        let message =
            "Download request failed: error sending request for url (https://cdn.test/build.zip?sig=abc&token=def): timeout";
        let redacted = redact_download_error_message(message);

        assert!(redacted.contains("Download request failed"));
        assert!(!redacted.contains("https://"));
        assert!(!redacted.contains("sig="));
        assert!(!redacted.contains("token="));
        assert!(redacted.contains("[redacted-url]"));
    }

    #[test]
    fn redact_download_error_message_keeps_plain_errors() {
        let message = "Download failed with status 404 Not Found";

        assert_eq!(redact_download_error_message(message), message);
    }

    #[test]
    fn normalize_queue_payload_redacts_signed_url_error_text() {
        let item = normalize_queue_payload(DownloadItemPayload {
            id: "download-demo".to_string(),
            game_id: "demo".to_string(),
            title: "Demo".to_string(),
            progress: 1,
            speed: "Retry 1/3: https://signed.example.test/build.zip?sig=abc".to_string(),
            status: "downloading".to_string(),
            eta: 999,
            platform: "windows".to_string(),
            phase: "download".to_string(),
            bytes_downloaded: None,
            bytes_total: None,
            can_pause: true,
            can_cancel: true,
            external: false,
            last_updated_at: 0,
            event_revision: 0,
            provider: String::new(),
            raw_status: String::new(),
            progress_source: String::new(),
            error: Some("signedUrl=https://signed.example.test/build.zip".to_string()),
            worker_generation: None,
        });

        assert!(!item.speed.contains("https://"));
        assert!(!item.speed.contains("sig="));
        assert_eq!(item.error.as_deref(), Some("[redacted-url]"));
    }
}
