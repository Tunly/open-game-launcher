use std::path::{Path, PathBuf};

use crate::commands::downloads::types::{
    DownloadItemPayload, STEAM_STATE_FULLY_INSTALLED, STEAM_STATE_UPDATE_REQUIRED,
};
use crate::commands::downloads::utils::{
    calculate_active_progress, get_dir_size, steam_app_id_from_download_id,
};
use crate::commands::games::detect;

const STEAM_STATE_FILES_MISSING: u64 = 32;
const STEAM_STATE_FILES_CORRUPT: u64 = 128;

pub(crate) fn has_active_download_work(item: &DownloadItemPayload) -> bool {
    if let Some(app_id) = steam_app_id_from_download_id(&item.game_id) {
        return steam_download_work_exists(app_id);
    }

    false
}

pub(crate) fn steam_download_work_exists(app_id: &str) -> bool {
    let Some(manifest_path) = find_steam_app_manifest(app_id) else {
        return false;
    };
    let Ok(contents) = std::fs::read_to_string(&manifest_path) else {
        return false;
    };
    let state = parse_steam_download_state(&contents);
    let downloading_dir_size = steam_downloading_dir_for_manifest(&manifest_path, app_id)
        .map(get_dir_size)
        .unwrap_or(0);

    state.has_active_work(downloading_dir_size)
}

pub(crate) fn find_steam_app_manifest(app_id: &str) -> Option<PathBuf> {
    let steam_path = detect::find_steam_dir()?;
    let main_path = steam_path
        .join("steamapps")
        .join(format!("appmanifest_{app_id}.acf"));
    if main_path.exists() {
        return Some(main_path);
    }

    detect::read_steam_library_folders(&steam_path)
        .into_iter()
        .map(|library| {
            library
                .join("steamapps")
                .join(format!("appmanifest_{app_id}.acf"))
        })
        .find(|path| path.exists())
}

pub(crate) fn extract_vdf_number(line: &str) -> Option<u64> {
    let parts: Vec<&str> = line.split('"').collect();
    if parts.len() >= 4 {
        parts[3].parse::<u64>().ok()
    } else {
        None
    }
}

/// Extract a string value from VDF content by key name.
/// VDF format: `"key"\t\t"value"`
pub(crate) fn extract_vdf_string(contents: &str, key: &str) -> Option<String> {
    let search = format!("\"{}\"", key);
    for line in contents.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with(&search) {
            let parts: Vec<&str> = trimmed.split('"').collect();
            if parts.len() >= 4 {
                return Some(parts[3].to_string());
            }
        }
    }
    None
}

#[derive(Default)]
pub(crate) struct SteamDownloadState {
    pub(crate) bytes_downloaded: u64,
    pub(crate) bytes_to_download: u64,
    pub(crate) bytes_staged: u64,
    pub(crate) bytes_to_stage: u64,
    pub(crate) size_on_disk: u64,
    pub(crate) state_flags: u64,
}

impl SteamDownloadState {
    pub(crate) fn is_fully_installed(&self, downloading_dir_size: u64) -> bool {
        (self.state_flags & STEAM_STATE_FULLY_INSTALLED) != 0
            && (self.state_flags & STEAM_STATE_UPDATE_REQUIRED) == 0
            && downloading_dir_size == 0
    }

    pub(crate) fn has_active_work(&self, downloading_dir_size: u64) -> bool {
        !self.is_fully_installed(downloading_dir_size)
            && (downloading_dir_size > 0
                || self.bytes_to_download > 0
                || self.bytes_to_stage > 0
                || (self.state_flags & STEAM_STATE_UPDATE_REQUIRED) != 0)
    }

    pub(crate) fn terminal_error(&self, downloading_dir_size: u64) -> Option<&'static str> {
        let transfer_can_recover = downloading_dir_size > 0
            || self.bytes_to_download > self.bytes_downloaded
            || self.bytes_to_stage > self.bytes_staged;
        if transfer_can_recover {
            return None;
        }

        if (self.state_flags & STEAM_STATE_FILES_CORRUPT) != 0 {
            return Some("Steam reports corrupt game files.");
        }
        if (self.state_flags & STEAM_STATE_FILES_MISSING) != 0 {
            return Some("Steam reports missing game files.");
        }

        None
    }
}

pub(crate) fn parse_steam_download_state(contents: &str) -> SteamDownloadState {
    let mut state = SteamDownloadState::default();

    for line in contents.lines() {
        if line.contains("\"BytesDownloaded\"") {
            if let Some(value) = extract_vdf_number(line) {
                state.bytes_downloaded = value;
            }
        } else if line.contains("\"BytesToDownload\"") {
            if let Some(value) = extract_vdf_number(line) {
                state.bytes_to_download = value;
            }
        } else if line.contains("\"BytesStaged\"") {
            if let Some(value) = extract_vdf_number(line) {
                state.bytes_staged = value;
            }
        } else if line.contains("\"BytesToStage\"") {
            if let Some(value) = extract_vdf_number(line) {
                state.bytes_to_stage = value;
            }
        } else if line.contains("\"SizeOnDisk\"") {
            if let Some(value) = extract_vdf_number(line) {
                state.size_on_disk = value;
            }
        } else if line.contains("\"StateFlags\"") {
            if let Some(value) = extract_vdf_number(line) {
                state.state_flags = value;
            }
        }
    }

    state
}

pub(crate) fn calculate_steam_progress(
    state: &SteamDownloadState,
    downloading_dir_size: u64,
) -> Option<u32> {
    if let Some((done, total)) = steam_combined_progress_bytes(state, downloading_dir_size) {
        return Some(calculate_active_progress(done, total));
    }

    if state.size_on_disk > 0 && downloading_dir_size > 0 {
        return Some(calculate_active_progress(
            downloading_dir_size,
            state.size_on_disk,
        ));
    }

    None
}

pub(crate) fn steam_phase(state: &SteamDownloadState, downloading_dir_size: u64) -> &'static str {
    if state.bytes_to_download > 0 {
        if steam_downloaded_bytes(state, downloading_dir_size) < state.bytes_to_download {
            "download"
        } else if state.bytes_to_stage > 0 {
            "installing"
        } else {
            "download"
        }
    } else if state.bytes_to_stage > 0 {
        "installing"
    } else {
        "external"
    }
}

pub(crate) fn steam_status_label(
    state: &SteamDownloadState,
    downloading_dir_size: u64,
) -> &'static str {
    if state.bytes_to_download > 0 {
        if steam_downloaded_bytes(state, downloading_dir_size) < state.bytes_to_download {
            "Steam Downloading"
        } else if state.bytes_to_stage > 0 {
            "Steam Installing"
        } else {
            "Steam Downloading"
        }
    } else if state.bytes_to_stage > 0 {
        "Steam Installing"
    } else {
        "Steam"
    }
}

pub(crate) fn steam_progress_bytes(
    state: &SteamDownloadState,
    downloading_dir_size: u64,
) -> (Option<u64>, Option<u64>) {
    if let Some((done, total)) = steam_combined_progress_bytes(state, downloading_dir_size) {
        return (Some(done), Some(total));
    }

    if state.size_on_disk > 0 && downloading_dir_size > 0 {
        return (
            Some(downloading_dir_size.min(state.size_on_disk)),
            Some(state.size_on_disk),
        );
    }

    (None, None)
}

pub(crate) fn steam_combined_progress_bytes(
    state: &SteamDownloadState,
    downloading_dir_size: u64,
) -> Option<(u64, u64)> {
    let download_total = state.bytes_to_download;
    let stage_total = state.bytes_to_stage;
    let total = download_total.saturating_add(stage_total);
    if total == 0 {
        return None;
    }

    let downloaded = steam_downloaded_bytes(state, downloading_dir_size);
    let staged = state.bytes_staged.min(stage_total);
    Some((downloaded.saturating_add(staged).min(total), total))
}

pub(crate) fn steam_downloaded_bytes(state: &SteamDownloadState, downloading_dir_size: u64) -> u64 {
    if state.bytes_downloaded > 0 {
        state.bytes_downloaded.min(state.bytes_to_download)
    } else {
        downloading_dir_size.min(state.bytes_to_download)
    }
}

pub(crate) fn steam_downloading_dir_for_manifest(
    manifest_path: &Path,
    app_id: &str,
) -> Option<PathBuf> {
    Some(manifest_path.parent()?.join("downloading").join(app_id))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn steam_progress_combines_download_and_stage_bytes() {
        let state = SteamDownloadState {
            bytes_downloaded: 50,
            bytes_to_download: 100,
            bytes_staged: 25,
            bytes_to_stage: 100,
            ..Default::default()
        };

        assert_eq!(calculate_steam_progress(&state, 0), Some(38));
        assert_eq!(steam_progress_bytes(&state, 0), (Some(75), Some(200)));
        assert_eq!(steam_phase(&state, 0), "download");
        assert_eq!(steam_status_label(&state, 0), "Steam Downloading");
    }

    #[test]
    fn steam_progress_uses_downloading_directory_when_manifest_bytes_lag() {
        let state = SteamDownloadState {
            bytes_downloaded: 0,
            bytes_to_download: 1_000,
            ..Default::default()
        };

        assert_eq!(calculate_steam_progress(&state, 250), Some(25));
        assert_eq!(steam_progress_bytes(&state, 250), (Some(250), Some(1_000)));
    }

    #[test]
    fn steam_progress_switches_to_install_phase_after_download_bytes_complete() {
        let state = SteamDownloadState {
            bytes_downloaded: 100,
            bytes_to_download: 100,
            bytes_staged: 50,
            bytes_to_stage: 100,
            ..Default::default()
        };

        assert_eq!(calculate_steam_progress(&state, 0), Some(75));
        assert_eq!(steam_phase(&state, 0), "installing");
        assert_eq!(steam_status_label(&state, 0), "Steam Installing");
    }

    #[test]
    fn steam_fully_installed_requires_no_update_work_or_downloading_files() {
        let installed = SteamDownloadState {
            state_flags: 4,
            ..Default::default()
        };
        let update_required = SteamDownloadState {
            state_flags: 6,
            ..Default::default()
        };
        let stale_manifest_bytes = SteamDownloadState {
            state_flags: 4,
            bytes_to_download: 100,
            ..Default::default()
        };

        assert!(installed.is_fully_installed(0));
        assert!(!installed.is_fully_installed(1));
        assert!(!update_required.is_fully_installed(0));
        assert!(stale_manifest_bytes.is_fully_installed(0));
        assert!(!stale_manifest_bytes.is_fully_installed(1));
    }

    #[test]
    fn steam_active_work_keeps_installed_updates_in_queue() {
        let installed = SteamDownloadState {
            state_flags: 4,
            bytes_to_download: 100,
            ..Default::default()
        };
        let update_required = SteamDownloadState {
            state_flags: 6,
            ..Default::default()
        };
        let install_download = SteamDownloadState {
            bytes_to_download: 100,
            ..Default::default()
        };

        assert!(!installed.has_active_work(0));
        assert!(installed.has_active_work(1));
        assert!(update_required.has_active_work(0));
        assert!(install_download.has_active_work(0));
    }

    #[test]
    fn steam_terminal_error_requires_no_recovery_transfer() {
        let corrupt = SteamDownloadState {
            state_flags: STEAM_STATE_FILES_CORRUPT,
            ..Default::default()
        };
        let recovering = SteamDownloadState {
            state_flags: STEAM_STATE_FILES_MISSING,
            bytes_downloaded: 50,
            bytes_to_download: 100,
            ..Default::default()
        };

        assert_eq!(
            corrupt.terminal_error(0),
            Some("Steam reports corrupt game files.")
        );
        assert_eq!(recovering.terminal_error(0), None);
    }
}
