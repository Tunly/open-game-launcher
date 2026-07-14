use crate::commands::downloads::steam_state::has_active_download_work;
use crate::commands::downloads::types::{
    get_download_manager, is_restart_interrupted_download_status, is_terminal_download_status,
    normalize_queue_payload, now_unix_secs, DownloadItemPayload, DOWNLOAD_STATUS_FAILED,
    DOWNLOAD_STATUS_PAUSED,
};
use crate::commands::downloads::utils::is_download_game_installed;
use crate::commands::local_db::{
    mutate_collection, read_collection, remove_item, remove_item_if_unchanged,
};
use std::collections::HashSet;

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
        let drop = non_terminal_len - MAX_DOWNLOAD_HISTORY_ITEMS;
        non_terminal.drain(..drop);
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
    let mut active_game_ids = get_download_manager()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .keys()
        .cloned()
        .collect::<HashSet<_>>();
    active_game_ids.extend(crate::commands::gog::get_active_gog_download_ids()?);

    mutate_collection(
        "downloads",
        |item: &DownloadItemPayload| &item.game_id,
        move |items| {
            normalize_download_history(items);
            recover_inactive_download_history(items, &active_game_ids);
            *items = trim_download_history(items);
            Ok(items.clone())
        },
    )
}

fn recover_inactive_download_history(
    items: &mut [DownloadItemPayload],
    active_game_ids: &HashSet<String>,
) {
    for item in items {
        if !active_game_ids.contains(&item.game_id) {
            normalize_download_history_item(item);
        }
    }
}

fn normalize_download_history(items: &mut [DownloadItemPayload]) {
    for item in items.iter_mut() {
        *item = normalize_queue_payload(item.clone());
    }
}

fn normalize_download_history_item(item: &mut DownloadItemPayload) {
    *item = normalize_queue_payload(item.clone());
    let paused_internal_worker = !item.external && item.status == DOWNLOAD_STATUS_PAUSED;
    if is_restart_interrupted_download_status(&item.status) || paused_internal_worker {
        if item.external {
            item.status = DOWNLOAD_STATUS_PAUSED.to_string();
            item.speed = "External tracker needs refresh".to_string();
        } else {
            // Internal workers cannot survive a process restart. Treat the old
            // queue row as retryable failure instead of a live paused job: the
            // library can start it again and the HTTP downloader will reuse its
            // existing `.part` file.
            item.status = DOWNLOAD_STATUS_FAILED.to_string();
            item.speed = "Interrupted - restart to resume".to_string();
        }
        item.phase = "interrupted".to_string();
        item.can_pause = false;
        item.can_cancel = false;
    }
    *item = normalize_queue_payload(item.clone());
}

pub(crate) fn remember_download_item(mut item: DownloadItemPayload) -> Result<(), String> {
    item = ensure_download_item_timestamp(item, now_unix_secs());
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

fn ensure_download_item_timestamp(
    mut item: DownloadItemPayload,
    fallback_timestamp: u64,
) -> DownloadItemPayload {
    if item.last_updated_at == 0 {
        item.last_updated_at = fallback_timestamp;
    }
    item
}

pub(crate) fn remove_download_history_item(game_id: &str) -> Result<(), String> {
    remove_item("downloads", game_id)
}

#[cfg(test)]
mod persistence_api_tests {
    use super::*;

    fn history_item(game_id: &str, external: bool) -> DownloadItemPayload {
        DownloadItemPayload {
            id: format!("download-{game_id}"),
            game_id: game_id.to_string(),
            title: "Interrupted download".to_string(),
            progress: 42,
            speed: "Downloading".to_string(),
            status: "downloading".to_string(),
            eta: 10,
            platform: String::new(),
            phase: "download".to_string(),
            bytes_downloaded: Some(42),
            bytes_total: Some(100),
            can_pause: true,
            can_cancel: true,
            external,
            last_updated_at: 1,
            event_revision: 0,
            provider: String::new(),
            raw_status: "downloading".to_string(),
            progress_source: String::new(),
            error: None,
            worker_generation: None,
        }
    }

    #[test]
    fn download_history_persistence_errors_are_part_of_the_api() {
        let _load: fn() -> Result<Vec<DownloadItemPayload>, String> = load_download_history;
        let _remember: fn(DownloadItemPayload) -> Result<(), String> = remember_download_item;
        let _remove: fn(&str) -> Result<(), String> = remove_download_history_item;
    }

    #[test]
    fn interrupted_internal_downloads_become_retryable_failures_after_restart() {
        let mut item = history_item("internal-game", false);

        normalize_download_history_item(&mut item);

        assert_eq!(item.status, DOWNLOAD_STATUS_FAILED);
        assert_eq!(item.phase, "interrupted");
        assert_eq!(item.speed, "Interrupted - restart to resume");
        assert!(!item.can_pause);
        assert!(!item.can_cancel);
    }

    #[test]
    fn ordinary_history_writes_do_not_mark_other_active_rows_interrupted() {
        let mut items = vec![history_item("active-internal-game", false)];

        normalize_download_history(&mut items);

        assert_eq!(items[0].status, "downloading");
        assert_eq!(items[0].phase, "download");
    }

    #[test]
    fn queue_recovery_only_marks_rows_without_live_workers_interrupted() {
        let mut items = vec![
            history_item("active-internal-game", false),
            history_item("stale-internal-game", false),
        ];
        let active_game_ids = HashSet::from(["active-internal-game".to_string()]);

        recover_inactive_download_history(&mut items, &active_game_ids);

        assert_eq!(items[0].status, "downloading");
        assert_eq!(items[1].status, DOWNLOAD_STATUS_FAILED);
        assert_eq!(items[1].phase, "interrupted");
    }

    #[test]
    fn recovered_history_keeps_the_newest_item_when_capacity_is_reached() {
        let now = now_unix_secs();
        let mut items = (0..=MAX_DOWNLOAD_HISTORY_ITEMS)
            .map(|index| {
                let mut item = history_item(&format!("internal-{index}"), false);
                item.last_updated_at =
                    now.saturating_sub(MAX_DOWNLOAD_HISTORY_ITEMS as u64 - index as u64);
                item
            })
            .collect::<Vec<_>>();

        recover_inactive_download_history(&mut items, &HashSet::new());
        let trimmed = trim_download_history(&items);

        assert_eq!(trimmed.len(), MAX_DOWNLOAD_HISTORY_ITEMS);
        assert!(!trimmed.iter().any(|item| item.game_id == "internal-0"));
        assert!(trimmed
            .iter()
            .any(|item| item.game_id == format!("internal-{MAX_DOWNLOAD_HISTORY_ITEMS}")));
    }

    #[test]
    fn over_capacity_non_terminal_history_keeps_the_newest_rows() {
        let items = (0..=MAX_DOWNLOAD_HISTORY_ITEMS)
            .map(|index| {
                let mut item = history_item(&format!("external-{index}"), true);
                item.status = DOWNLOAD_STATUS_PAUSED.to_string();
                item
            })
            .collect::<Vec<_>>();

        let trimmed = trim_download_history(&items);

        assert_eq!(trimmed.len(), MAX_DOWNLOAD_HISTORY_ITEMS);
        assert!(!trimmed.iter().any(|item| item.game_id == "external-0"));
        assert!(trimmed
            .iter()
            .any(|item| item.game_id == format!("external-{MAX_DOWNLOAD_HISTORY_ITEMS}")));
    }

    #[test]
    fn paused_internal_downloads_become_retryable_failures_after_restart() {
        let mut item = history_item("paused-internal-game", false);
        item.status = DOWNLOAD_STATUS_PAUSED.to_string();
        item.speed = "Paused".to_string();

        normalize_download_history_item(&mut item);

        assert_eq!(item.status, DOWNLOAD_STATUS_FAILED);
        assert_eq!(item.phase, "interrupted");
        assert_eq!(item.speed, "Interrupted - restart to resume");
        assert!(!item.can_pause);
        assert!(!item.can_cancel);
    }

    #[test]
    fn persistence_preserves_an_emitter_assigned_timestamp() {
        let mut item = history_item("timestamped-download", false);
        item.last_updated_at = 123;
        assert_eq!(
            ensure_download_item_timestamp(item, 999).last_updated_at,
            123
        );

        let mut legacy_item = history_item("legacy-download", false);
        legacy_item.last_updated_at = 0;
        assert_eq!(
            ensure_download_item_timestamp(legacy_item, 999).last_updated_at,
            999
        );
    }

    #[test]
    fn interrupted_external_downloads_remain_removable_paused_trackers() {
        let mut item = history_item("steam-owned-1234", true);

        normalize_download_history_item(&mut item);

        assert_eq!(item.status, DOWNLOAD_STATUS_PAUSED);
        assert_eq!(item.phase, "interrupted");
        assert_eq!(item.speed, "External tracker needs refresh");
        assert!(item.external);
        assert!(!item.can_pause);
        assert!(!item.can_cancel);
    }
}
