use crate::commands::downloads::steam_state::has_active_download_work;
use crate::commands::downloads::types::{
    is_restart_interrupted_download_status, is_terminal_download_status, normalize_queue_payload,
    now_unix_secs, DownloadItemPayload, DOWNLOAD_STATUS_PAUSED,
};
use crate::commands::downloads::utils::is_download_game_installed;
use crate::commands::local_db::{
    mutate_collection, read_collection, remove_item, remove_item_if_unchanged,
};

pub(crate) const MAX_DOWNLOAD_HISTORY_ITEMS: usize = 200;
pub(crate) const TERMINAL_ITEM_TTL_SECS: u64 = 30 * 24 * 60 * 60;

pub(crate) fn mutate_download_history<R, F>(mutate: F) -> Result<R, String>
where
    F: FnOnce(&mut Vec<DownloadItemPayload>) -> Result<R, String>,
{
    mutate_collection(
        "downloads",
        |item: &DownloadItemPayload| &item.game_id,
        |items| {
            normalize_download_history(items);
            *items = trim_download_history(items);
            let result = mutate(items)?;
            *items = trim_download_history(items);
            Ok(result)
        },
    )
}

pub(crate) fn trim_download_history(items: &[DownloadItemPayload]) -> Vec<DownloadItemPayload> {
    // First pass: drop terminal items that are older than TTL. Legacy entries with
    // last_updated_at == 0 are kept (treated as "unknown age") to avoid wiping
    // pre-existing history on first run after upgrade.
    let now = now_unix_secs();
    let mut filtered: Vec<DownloadItemPayload> = items
        .iter()
        .filter(|item| {
            if !is_terminal_download_status(&item.status) {
                return true;
            }
            if item.last_updated_at == 0 {
                return true;
            }
            now.saturating_sub(item.last_updated_at) <= TERMINAL_ITEM_TTL_SECS
        })
        .cloned()
        .collect();

    if filtered.len() <= MAX_DOWNLOAD_HISTORY_ITEMS {
        return filtered;
    }

    // Second pass: keep every non-terminal item; evict the oldest terminal items to make room.
    let mut non_terminal: Vec<DownloadItemPayload> = Vec::new();
    let mut terminal: Vec<DownloadItemPayload> = Vec::new();
    for item in &filtered {
        if is_terminal_download_status(&item.status) {
            terminal.push(item.clone());
        } else {
            non_terminal.push(item.clone());
        }
    }
    filtered.clear();

    let non_terminal_len = non_terminal.len();
    if non_terminal_len >= MAX_DOWNLOAD_HISTORY_ITEMS {
        non_terminal.truncate(MAX_DOWNLOAD_HISTORY_ITEMS);
        return non_terminal;
    }

    let keep_terminal = MAX_DOWNLOAD_HISTORY_ITEMS - non_terminal_len;
    if terminal.len() > keep_terminal {
        // Preserve the most recently written terminal items (they sit at the tail).
        let drop = terminal.len() - keep_terminal;
        terminal.drain(..drop);
    }
    non_terminal.extend(terminal);
    non_terminal
}

pub(crate) fn terminal_sort_rank(status: &str) -> u8 {
    if is_terminal_download_status(status) {
        1
    } else {
        0
    }
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

pub(crate) fn load_download_history() -> Result<Vec<DownloadItemPayload>, String> {
    // Installed-item checks can scan provider state, so perform them outside the
    // SQLite writer transaction. The conditional delete prevents a newer record
    // for the same game from being removed after this snapshot was read.
    for item in read_collection::<DownloadItemPayload>("downloads")? {
        if is_stale_installed_download(&item) {
            remove_item_if_unchanged("downloads", &item.game_id, &item)?;
        }
    }
    mutate_download_history(|items| Ok(items.clone()))
}

fn normalize_download_history(items: &mut [DownloadItemPayload]) {
    for item in items.iter_mut() {
        *item = normalize_queue_payload(item.clone());
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
        }
        *item = normalize_queue_payload(item.clone());
    }
}

pub(crate) fn remember_download_item(mut item: DownloadItemPayload) -> Result<(), String> {
    item.last_updated_at = now_unix_secs();
    let item = normalize_queue_payload(item);
    if is_stale_installed_download(&item) {
        return mutate_download_history(move |items| {
            items.retain(|existing| {
                existing.game_id != item.game_id || existing.last_updated_at > item.last_updated_at
            });
            Ok(())
        });
    }

    mutate_download_history(move |items| {
        if let Some(existing) = items
            .iter_mut()
            .find(|existing| existing.game_id == item.game_id)
        {
            *existing = item;
        } else {
            items.push(item);
        }
        Ok(())
    })
}

pub fn record_download_item(item: DownloadItemPayload) -> Result<(), String> {
    remember_download_item(item)
}

pub(crate) fn remove_download_history_item(game_id: &str) -> Result<(), String> {
    remove_item("downloads", game_id)
}

#[cfg(test)]
mod persistence_api_tests {
    use super::*;

    #[test]
    fn download_history_persistence_errors_are_part_of_the_api() {
        let _load: fn() -> Result<Vec<DownloadItemPayload>, String> = load_download_history;
        let _remember: fn(DownloadItemPayload) -> Result<(), String> = remember_download_item;
        let _remove: fn(&str) -> Result<(), String> = remove_download_history_item;
    }
}
