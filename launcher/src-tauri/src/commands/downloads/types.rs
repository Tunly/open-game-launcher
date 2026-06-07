use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::Emitter;
use tokio::sync::watch;

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
    AlreadyInstalled,
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
    pub provider: String,
    #[serde(default)]
    pub raw_status: String,
    #[serde(default)]
    pub progress_source: String,
    #[serde(default)]
    pub error: Option<String>,
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

#[derive(Debug, Clone)]
pub(crate) struct InternalDownloadSource {
    pub(crate) url: String,
    pub(crate) sha256: Option<String>,
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

    pub(crate) fn is_steam_control_pending(self) -> bool {
        matches!(self, Self::Pausing | Self::Resuming)
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

pub(crate) fn is_steam_control_pending_status(status: &str) -> bool {
    DownloadStatusKind::parse(status).is_some_and(DownloadStatusKind::is_steam_control_pending)
}

pub(crate) fn get_download_manager() -> &'static DownloadMap {
    static MANAGER: OnceLock<DownloadMap> = OnceLock::new();
    MANAGER.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
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
        dl.status = status.to_string();
        dl.speed = speed.to_string();
        dl.progress = normalize_progress(progress, status);
        dl.eta = eta;
        dl.phase = phase_from_status_and_speed(status, speed);
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
            message: message.to_string(),
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

pub(crate) async fn cancellable_sleep(cancel_rx: &watch::Receiver<bool>, duration: Duration) -> bool {
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
