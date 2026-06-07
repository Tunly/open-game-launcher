use serde::Serialize;
use tauri::AppHandle;
use tauri::Emitter;

use crate::commands::downloads::history::{load_download_history, save_download_history};
use crate::commands::downloads::steam_state::{has_active_download_work, steam_download_work_exists};
use crate::commands::downloads::types::{
    is_terminal_download_status, now_unix_secs, DownloadItemPayload,
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

pub fn reconcile_downloads(app: AppHandle) -> Result<ReconciliationResult, String> {
    let mut result = ReconciliationResult {
        installed_removed: Vec::new(),
        active_restored: Vec::new(),
        stale_cleaned: Vec::new(),
        errors: Vec::new(),
    };

    let history = load_download_history();
    let mut updated_items: Vec<DownloadItemPayload> = Vec::new();
    let now = now_unix_secs();
    let stale_threshold = 7 * 24 * 60 * 60; // 7 days

    let epic_installed: std::collections::HashSet<String> = {
        detect::scan_epic_games()
            .into_iter()
            .map(|g| g.id)
            .collect()
    };
    let ea_installed: std::collections::HashSet<String> = {
        detect::scan_ea_games()
            .into_iter()
            .map(|g| g.id)
            .collect()
    };
    let battlenet_installed: std::collections::HashSet<String> = {
        detect::scan_battlenet_games()
            .into_iter()
            .map(|g| g.id)
            .collect()
    };

    for mut item in history {
        let is_terminal = is_terminal_download_status(&item.status);

        if !is_terminal {
            let is_now_installed = is_download_game_installed(&item.game_id);

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
            if (is_terminal_download_status(&item.status) || item.status == DOWNLOAD_STATUS_PAUSED)
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

    save_download_history(&updated_items);

    if !result.installed_removed.is_empty()
        || !result.active_restored.is_empty()
        || !result.stale_cleaned.is_empty()
    {
        let _ = app.emit(
            "library_inventory_changed",
            serde_json::json!({
                "reason": "reconciliation",
                "gameCount": updated_items.len()
            }),
        );
    }

    Ok(result)
}
