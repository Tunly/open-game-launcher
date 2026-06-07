use crate::commands::downloads::steam_state::has_active_download_work;
use crate::commands::downloads::types::{
    is_restart_interrupted_download_status, is_terminal_download_status, normalize_queue_payload,
    now_unix_secs, DownloadItemPayload, DOWNLOAD_STATUS_PAUSED,
};
use crate::commands::downloads::utils::is_download_game_installed;
use crate::commands::local_db::{read_collection, remove_item, write_collection};

pub(crate) const MAX_DOWNLOAD_HISTORY_ITEMS: usize = 200;
pub(crate) const TERMINAL_ITEM_TTL_SECS: u64 = 30 * 24 * 60 * 60;

pub(crate) fn save_download_history(items: &[DownloadItemPayload]) {
    let trimmed = trim_download_history(items);
    let _ = write_collection("downloads", &trimmed, |item| &item.game_id);
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

pub(crate) fn load_download_history() -> Vec<DownloadItemPayload> {
    let items = read_collection::<DownloadItemPayload>("downloads").unwrap_or_default();
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
        let _ = remove_item("downloads", &item.game_id);
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
    let _ = remove_item("downloads", game_id);
}
