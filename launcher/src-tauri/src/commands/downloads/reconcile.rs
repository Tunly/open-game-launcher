use serde::Serialize;
use tauri::AppHandle;
use tauri::Emitter;

use crate::commands::downloads::history::{
    load_download_history, mutate_download_history, remove_download_history_item,
};
use crate::commands::downloads::steam_state::{
    find_steam_app_manifest, has_active_download_work, steam_download_work_exists,
};
use crate::commands::downloads::types::{
    get_download_manager, is_terminal_download_status, now_unix_secs, DownloadItemPayload,
    DOWNLOAD_STATUS_COMPLETED, DOWNLOAD_STATUS_DOWNLOADING, DOWNLOAD_STATUS_PAUSED,
};
use crate::commands::downloads::utils::{
    is_download_game_installed, steam_app_id_from_download_id,
};
use crate::commands::games::detect;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReconciliationResult {
    pub installed_removed: Vec<String>,
    pub active_restored: Vec<String>,
    pub stale_cleaned: Vec<String>,
    pub errors: Vec<String>,
}

/// Decides whether a Steam-tracked download history entry should be dropped
/// because the game no longer exists on disk. Only applies when:
///   * the entry is a Steam tracker,
///   * Steam itself is present (so an absent manifest means "removed", not
///     "Steam not installed"),
///   * no app manifest exists for the game (it was uninstalled or removed),
///   * the entry reached a terminal state, and
///   * no live download worker still holds the entry.
/// Non-terminal entries (a freshly queued install while Steam has not yet
/// created its manifest) are deliberately kept.
fn should_remove_removed_steam_entry(
    game_id: &str,
    status: &str,
    steam_engine_available: bool,
    manifest_exists: bool,
    has_active_worker: bool,
) -> bool {
    let is_steam = steam_app_id_from_download_id(game_id).is_some();
    is_steam
        && steam_engine_available
        && !manifest_exists
        && is_terminal_download_status(status)
        && !has_active_worker
}

pub fn reconcile_downloads(app: AppHandle) -> Result<ReconciliationResult, String> {
    let now = now_unix_secs();
    let stale_threshold = 7 * 24 * 60 * 60; // 7 days
    let installed_by_id = load_download_history()?
        .into_iter()
        .map(|item| {
            let installed = is_download_game_installed(&item.game_id);
            (item.game_id, installed)
        })
        .collect::<std::collections::HashMap<_, _>>();

    let epic_installed: std::collections::HashSet<String> = {
        detect::scan_epic_games()
            .into_iter()
            .map(|g| g.id)
            .collect()
    };
    let ea_installed: std::collections::HashSet<String> =
        { detect::scan_ea_games().into_iter().map(|g| g.id).collect() };
    let battlenet_installed: std::collections::HashSet<String> = {
        detect::scan_battlenet_games()
            .into_iter()
            .map(|g| g.id)
            .collect()
    };

    let (result, history_len) = mutate_download_history(move |history| {
        let mut result = ReconciliationResult {
            installed_removed: Vec::new(),
            active_restored: Vec::new(),
            stale_cleaned: Vec::new(),
            errors: Vec::new(),
        };
        result.stale_cleaned.extend(clean_removed_steam_history());
        let mut updated_items: Vec<DownloadItemPayload> = Vec::new();

        for mut item in std::mem::take(history) {
            let is_terminal = is_terminal_download_status(&item.status);

            if !is_terminal {
                let is_now_installed = installed_by_id.get(&item.game_id).copied().unwrap_or(false);

                if is_now_installed && !has_active_download_work(&item) {
                    item.status = DOWNLOAD_STATUS_COMPLETED.to_string();
                    item.progress = 100;
                    item.speed = "Reconciled".to_string();
                    item.phase = "completed".to_string();
                    item.can_pause = false;
                    item.can_cancel = false;
                    item.last_updated_at = now;
                    result.installed_removed.push(item.game_id.clone());
                }
            }

            if !is_terminal && !is_terminal_download_status(&item.status) {
                let age = now.saturating_sub(item.last_updated_at);
                if item.last_updated_at > 0 && age > stale_threshold {
                    let provider_confirms =
                        if let Some(app_id) = steam_app_id_from_download_id(&item.game_id) {
                            steam_download_work_exists(app_id)
                        } else if item.game_id.starts_with("epic-") {
                            epic_installed.contains(&item.game_id)
                        } else if item.game_id.starts_with("ea-") {
                            ea_installed.contains(&item.game_id)
                        } else if item.game_id.starts_with("battlenet-") {
                            battlenet_installed.contains(&item.game_id)
                        } else {
                            false
                        };

                    if !provider_confirms {
                        result.stale_cleaned.push(item.game_id.clone());
                        continue;
                    }
                }
            }

            if let Some(app_id) = steam_app_id_from_download_id(&item.game_id) {
                if (is_terminal_download_status(&item.status)
                    || item.status == DOWNLOAD_STATUS_PAUSED)
                    && steam_download_work_exists(app_id)
                {
                    item.status = DOWNLOAD_STATUS_DOWNLOADING.to_string();
                    item.speed = "Steam".to_string();
                    item.phase = "external".to_string();
                    item.external = true;
                    item.can_pause = true;
                    item.last_updated_at = now;
                    result.active_restored.push(item.game_id.clone());
                }
            }

            updated_items.push(item);
        }

        *history = updated_items;
        Ok((result, history.len()))
    })?;

    if !result.installed_removed.is_empty()
        || !result.active_restored.is_empty()
        || !result.stale_cleaned.is_empty()
    {
        let _ = app.emit(
            "library_inventory_changed",
            serde_json::json!({
                "reason": "reconciliation",
                "gameCount": history_len
            }),
        );
    }

    Ok(result)
}

/// Removes Steam-tracked download history rows whose game no longer exists
/// on disk (the app manifest disappeared) once the entry reached a terminal
/// state. Runs from both the periodic download watcher and reconcile, so a
/// game removed in Steam disappears from the Downloads tab automatically.
pub(crate) fn clean_removed_steam_history() -> Vec<String> {
    if detect::find_steam_dir().is_none() {
        return Vec::new();
    }

    let Ok(history) = load_download_history() else {
        return Vec::new();
    };

    let removed = history
        .into_iter()
        .filter(|item| {
            let manifest_exists = steam_app_id_from_download_id(&item.game_id)
                .is_some_and(|app_id| find_steam_app_manifest(app_id).is_some());
            let has_active_worker = get_download_manager()
                .lock()
                .map(|guard| guard.contains_key(&item.game_id))
                .unwrap_or(false);
            should_remove_removed_steam_entry(
                &item.game_id,
                &item.status,
                true,
                manifest_exists,
                has_active_worker,
            )
        })
        .map(|item| item.game_id)
        .collect::<Vec<_>>();

    for game_id in &removed {
        let _ = remove_download_history_item(game_id);
    }
    removed
}

#[cfg(test)]
mod tests {
    use super::should_remove_removed_steam_entry;

    #[test]
    fn terminal_steam_entry_without_manifest_is_removed() {
        assert!(should_remove_removed_steam_entry(
            "steam-owned-1234",
            "completed",
            true,
            false,
            false,
        ));
        assert!(should_remove_removed_steam_entry(
            "steam-owned-1234",
            "error",
            true,
            false,
            false,
        ));
    }

    #[test]
    fn non_terminal_steam_entry_is_kept_while_install_is_pending() {
        assert!(!should_remove_removed_steam_entry(
            "steam-owned-1234",
            "downloading",
            true,
            false,
            false,
        ));
        assert!(!should_remove_removed_steam_entry(
            "steam-owned-1234",
            "paused",
            true,
            false,
            false,
        ));
    }

    #[test]
    fn keeps_terminal_entries_when_manifest_or_worker_still_present() {
        assert!(!should_remove_removed_steam_entry(
            "steam-owned-1234",
            "completed",
            true,
            true,
            false,
        ));
        assert!(!should_remove_removed_steam_entry(
            "steam-owned-1234",
            "completed",
            true,
            false,
            true,
        ));
    }

    #[test]
    fn does_not_remove_when_steam_engine_is_unavailable_or_entry_is_not_steam() {
        assert!(!should_remove_removed_steam_entry(
            "steam-owned-1234",
            "completed",
            false,
            false,
            false,
        ));
        assert!(!should_remove_removed_steam_entry(
            "epic-owned-5678",
            "completed",
            true,
            false,
            false,
        ));
    }
}
