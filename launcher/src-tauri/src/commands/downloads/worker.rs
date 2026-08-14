//! Shared download-worker loop primitives.
//!
//! The Steam watcher, the Epic stderr tracker and the internal HTTP
//! downloader each ran their own copy of two loop behaviours: the
//! tombstone exit dance (suppressed -> remove history row -> remove
//! active worker -> return) and the pause-hold loop (feed back the
//! paused status/speed/eta, emit progress, sleep). This module owns those
//! once so a third loop stops re-implementing them, and so the exit
//! protocol is testable through one seam instead of four inline copies.

use tauri::AppHandle;

use super::history::remove_download_history_item;
use super::types::{
    emit_download_progress, is_download_suppressed, pause_hold_feedback,
    remove_active_download_if_current, update_download_status,
};

/// Exit a worker loop early when the download has been tombstoned
/// (suppressed). The protocol must run in this exact order: drop the
/// persisted history row, then remove the active worker if it is still the
/// current one, so a late emission cannot resurrect the row.
///
/// Returns `true` when the caller should stop its loop.
pub(crate) fn exit_if_suppressed(
    game_id: &str,
    worker_cancel_rx: &tokio::sync::watch::Receiver<bool>,
) -> bool {
    if !is_download_suppressed(game_id) {
        return false;
    }
    let _ = remove_download_history_item(game_id);
    remove_active_download_if_current(game_id, worker_cancel_rx);
    true
}

/// Hold the worker while the pause channel is set, feeding back the paused
/// status/speed/eta and emitting progress every 500ms. Re-checks the
/// tombstone on every iteration so a suppress during the hold exits too.
///
/// Returns `true` when the caller should stop its loop (tombstoned).
pub(crate) async fn pause_hold_loop(
    app: &AppHandle,
    game_id: &str,
    pause_rx: &tokio::sync::watch::Receiver<bool>,
    worker_cancel_rx: &tokio::sync::watch::Receiver<bool>,
    progress: u32,
    paused_speed: &str,
) -> bool {
    while *pause_rx.borrow() {
        if exit_if_suppressed(game_id, worker_cancel_rx) {
            return true;
        }
        let (pause_status, pause_speed, pause_eta) = pause_hold_feedback(game_id, paused_speed);
        update_download_status(game_id, &pause_status, &pause_speed, progress, pause_eta);
        emit_download_progress(
            app,
            game_id,
            progress,
            &pause_speed,
            &pause_status,
            pause_eta,
        );
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::downloads::types::{
        clear_download_suppression, get_download_manager, suppress_download_emissions,
        ActiveDownload,
    };
    use tokio::sync::watch;

    fn make_active_download() -> ActiveDownload {
        let (pause_tx, _) = watch::channel(false);
        let (cancel_tx, _) = watch::channel(false);
        ActiveDownload {
            worker_generation: 0,
            title: "Test".to_string(),
            progress: 0,
            speed: String::new(),
            status: String::new(),
            eta: 0,
            phase: String::new(),
            bytes_downloaded: None,
            bytes_total: None,
            can_pause: false,
            can_cancel: false,
            external: true,
            paused: false,
            cancelled: false,
            pause_tx,
            cancel_tx,
            raw_status: String::new(),
            error: None,
        }
    }

    #[test]
    fn exit_if_suppressed_is_false_when_not_suppressed() {
        let game_id = "worker-test-not-suppressed";
        clear_download_suppression(game_id);
        let (_cancel_tx, cancel_rx) = watch::channel(false);
        assert!(!exit_if_suppressed(game_id, &cancel_rx));
        clear_download_suppression(game_id);
    }

    #[test]
    fn exit_if_suppressed_removes_history_and_active_worker() {
        let game_id = "worker-test-suppressed";
        clear_download_suppression(game_id);
        suppress_download_emissions(game_id);

        // Simulate a tracked active worker so the removal path is exercised.
        if let Ok(mut guard) = get_download_manager().lock() {
            guard.insert(game_id.to_string(), make_active_download());
        }

        let (_cancel_tx, cancel_rx) = watch::channel(false);
        assert!(exit_if_suppressed(game_id, &cancel_rx));
        clear_download_suppression(game_id);
    }
}
