use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};
use tauri::Emitter;
use tokio::sync::watch;

use crate::commands::http::shared_http_client;

use crate::commands::games::{
    extract_og_zip_package, find_launch_executable, installed_game, is_file_executable,
    is_zip_package, og_manifest_file_for_path, og_manifest_relative_path, path_to_string,
    read_installed_games_cache, write_installed_games_cache, write_og_managed_manifest_details,
    GameStatus, OgManagedManifest,
};

use crate::commands::downloads::types::{
    ActiveDownload, DownloadItemPayload, DownloadStartStatus, DownloadStatusKind,
    InternalDownloadSource, StartDownloadResponse, SteamDownloadControlAction,
    DOWNLOAD_STATUS_CANCELLED, DOWNLOAD_STATUS_COMPLETED, DOWNLOAD_STATUS_DOWNLOADING,
    DOWNLOAD_STATUS_FAILED, DOWNLOAD_STATUS_INSTALLING, DOWNLOAD_STATUS_PAUSED,
    DOWNLOAD_STATUS_PAUSING, DOWNLOAD_STATUS_RESUMING, DOWNLOAD_STATUS_STARTING,
    STEAM_STATE_FULLY_INSTALLED, STEAM_STATE_UPDATE_REQUIRED, cancellable_sleep,
    emit_download_command_error, emit_download_removed, get_download_manager,
    is_download_control_pending, is_pause_toggle_status,
    is_restart_interrupted_download_status, is_steam_control_pending_status,
    is_terminal_download_status, normalize_progress, now_unix_secs, pause_hold_feedback,
    phase_from_status_and_speed, update_download_metrics, update_download_status,
    validated_download_status,
};
use crate::commands::downloads::utils::{
    calculate_active_progress, default_install_dir, download_file_name, get_dir_size,
    get_platform_from_game_id, is_download_game_installed, is_external_tracker_game_id,
    is_steam_tracker_game_id, normalize_game_id, progress_source_from_game_id,
    provider_key_from_game_id, sanitize_download_file_name, steam_app_id_from_download_id,
    verify_sha256,
};
use crate::commands::downloads::history::{save_download_history, terminal_sort_rank};
use crate::commands::downloads::install::{
    install_downloaded_game_package, update_installed_games_cache_for_download,
    write_downloaded_game_manifest,
};
use crate::commands::downloads::internal_download::download_internal_game_file;
use crate::commands::downloads::steam_cef::{steam_cef_targets, toggle_steam_download_pause};
use crate::commands::downloads::steam_state::{
    calculate_steam_progress, extract_vdf_string, has_active_download_work,
    parse_steam_download_state, steam_download_work_exists,
    steam_downloading_dir_for_manifest, steam_phase, steam_progress_bytes,
    steam_status_label,
};



pub(crate) fn emit_download_progress(
    app: &tauri::AppHandle,
    game_id: &str,
    progress: u32,
    speed: &str,
    status: &str,
    eta: u32,
) {
    let status = validated_download_status(status);
    let mut payload = get_download_manager()
        .lock()
        .ok()
        .and_then(|guard| {
            guard
                .get(game_id)
                .map(|dl| payload_from_active_download(game_id, dl))
        })
        .unwrap_or_else(|| default_download_payload(game_id, ""));
    payload.progress = normalize_progress(progress, status);
    payload.speed = speed.to_string();
    payload.status = status.to_string();
    payload.eta = eta;
    payload.phase = phase_from_status_and_speed(status, speed);
    payload = normalize_queue_payload(payload);
    if is_stale_installed_download(&payload) {
        remove_download_history_item(game_id);
        emit_download_removed(app, game_id);
        return;
    }
    remember_download_item(payload.clone());
    let _ = app.emit("download_progress", payload);
}

pub(crate) fn payload_from_active_download(game_id: &str, dl: &ActiveDownload) -> DownloadItemPayload {
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
        provider: provider_key_from_game_id(game_id),
        raw_status: dl.raw_status.clone(),
        progress_source: progress_source_from_game_id(game_id),
        error: dl.error.clone(),
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
        provider: provider_key_from_game_id(game_id),
        raw_status: String::new(),
        progress_source: progress_source_from_game_id(game_id),
        error: None,
    })
}

pub(crate) fn normalize_queue_payload(mut item: DownloadItemPayload) -> DownloadItemPayload {
    item.status = validated_download_status(&item.status).to_string();
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
    item.can_cancel = item.can_cancel && !external && !is_terminal;

    item
}

pub(crate) fn is_stale_installed_download(item: &DownloadItemPayload) -> bool {
    if is_terminal_download_status(&item.status) {
        return false;
    }
    if !item.external && item.progress < 99 {
        return false;
    }

    is_download_game_installed(&item.game_id) && !has_active_download_work(item)
}

pub(crate) fn load_download_history() -> Vec<DownloadItemPayload> {
    let items = crate::commands::local_db::read_collection::<DownloadItemPayload>("downloads")
        .unwrap_or_default();
    let original_len = items.len();
    let mut changed = false;

    let mut normalized_items = Vec::with_capacity(original_len);
    for item in items {
        let mut item = normalize_queue_payload(item);
        if is_restart_interrupted_download_status(&item.status) {
            item.status = DOWNLOAD_STATUS_PAUSED.to_string();
            item.speed = if item.external {
                "External tracker needs refresh".to_string()
            } else {
                "Interrupted".to_string()
            };
            item.phase = "interrupted".to_string();
            item.can_pause = false;
            item.can_cancel = false;
            changed = true;
        }
        normalized_items.push(normalize_queue_payload(item));
    }

    let filtered_items = normalized_items
        .into_iter()
        .filter(|item| !is_stale_installed_download(item))
        .collect::<Vec<_>>();

    if changed || filtered_items.len() != original_len {
        save_download_history(&filtered_items);
    }

    filtered_items
}

pub(crate) fn remember_download_item(mut item: DownloadItemPayload) {
    item.last_updated_at = now_unix_secs();
    let mut items = load_download_history();
    let item = normalize_queue_payload(item);
    if is_stale_installed_download(&item) {
        items.retain(|existing| existing.game_id != item.game_id);
        save_download_history(&items);
        let _ = crate::commands::local_db::remove_item("downloads", &item.game_id);
        return;
    }

    if let Some(index) = items
        .iter()
        .position(|existing| existing.game_id == item.game_id)
    {
        items[index] = item;
    } else {
        items.push(item);
    }
    save_download_history(&items);
}

pub fn record_download_item(item: DownloadItemPayload) {
    remember_download_item(item);
}

pub(crate) fn remove_download_history_item(game_id: &str) {
    let mut items = load_download_history();
    items.retain(|item| item.game_id != game_id);
    save_download_history(&items);
    let _ = crate::commands::local_db::remove_item("downloads", game_id);
}



// Provider Health Check



#[cfg(test)]
mod tests {
    use super::*;

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
            provider: String::new(),
            raw_status: String::new(),
            progress_source: String::new(),
            error: None,
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
            provider: String::new(),
            raw_status: String::new(),
            progress_source: String::new(),
            error: None,
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
            provider: String::new(),
            raw_status: String::new(),
            progress_source: String::new(),
            error: None,
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
            provider: String::new(),
            raw_status: String::new(),
            progress_source: String::new(),
            error: None,
        });

        assert_eq!(item.status, DOWNLOAD_STATUS_FAILED);
        assert_eq!(item.progress, 77);
        assert!(!item.can_pause);
        assert!(!item.can_cancel);
    }

    #[test]
    fn external_tracker_phase_stays_external_without_fake_progress() {
        assert_eq!(
            phase_from_status_and_speed("downloading", "Xbox Game Pass (External)"),
            "external"
        );
        assert_eq!(
            phase_from_status_and_speed("downloading", "EA App (External)"),
            "external"
        );
    }
}

