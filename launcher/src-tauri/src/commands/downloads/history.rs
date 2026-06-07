use crate::commands::downloads::types::{is_terminal_download_status, now_unix_secs, DownloadItemPayload};
use crate::commands::local_db::write_collection;

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
