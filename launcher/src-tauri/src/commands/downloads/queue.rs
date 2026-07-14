use std::collections::HashMap;

use crate::commands::downloads::history::{
    is_stale_installed_download, load_download_history, remove_download_history_item,
    terminal_sort_rank,
};
use crate::commands::downloads::types::{
    get_download_manager, is_download_suppressed, normalize_queue_payload,
    payload_from_active_download, DownloadItemPayload,
};

pub fn get_download_queue() -> Result<Vec<DownloadItemPayload>, String> {
    let mut queue_by_game_id: HashMap<String, DownloadItemPayload> = load_download_history()?
        .into_iter()
        .filter(|item| !is_download_suppressed(&item.game_id))
        .map(|item| (item.game_id.clone(), normalize_queue_payload(item)))
        .collect();

    {
        let map = get_download_manager()
            .lock()
            .map_err(|error| format!("Download manager lock poisoned: {error}"))?;
        let active_items = map
            .iter()
            .map(|(game_id, dl)| payload_from_active_download(game_id, dl))
            .collect::<Vec<_>>();
        drop(map);

        for mut item in active_items {
            if is_download_suppressed(&item.game_id) {
                continue;
            }
            if is_stale_installed_download(&item) {
                remove_download_history_item(&item.game_id)?;
                continue;
            }
            item.last_updated_at = active_snapshot_timestamp(
                item.last_updated_at,
                queue_by_game_id
                    .get(&item.game_id)
                    .map(|persisted| persisted.last_updated_at),
            );
            item.event_revision = active_snapshot_revision(
                item.event_revision,
                queue_by_game_id
                    .get(&item.game_id)
                    .map(|persisted| persisted.event_revision),
            );
            queue_by_game_id.insert(item.game_id.clone(), item);
        }
    }

    {
        if let Ok(gog_queue) = crate::commands::gog::get_gog_download_queue() {
            for mut item in gog_queue {
                if is_download_suppressed(&item.game_id) {
                    continue;
                }
                item.last_updated_at = active_snapshot_timestamp(
                    item.last_updated_at,
                    queue_by_game_id
                        .get(&item.game_id)
                        .map(|persisted| persisted.last_updated_at),
                );
                item.event_revision = active_snapshot_revision(
                    item.event_revision,
                    queue_by_game_id
                        .get(&item.game_id)
                        .map(|persisted| persisted.event_revision),
                );
                queue_by_game_id.insert(item.game_id.clone(), normalize_queue_payload(item));
            }
        }
    }

    let mut queue: Vec<DownloadItemPayload> = queue_by_game_id.into_values().collect();
    queue.sort_by(|a, b| {
        terminal_sort_rank(&a.status)
            .cmp(&terminal_sort_rank(&b.status))
            .then_with(|| a.title.cmp(&b.title))
    });

    Ok(queue)
}

fn active_snapshot_timestamp(active_timestamp: u64, persisted_timestamp: Option<u64>) -> u64 {
    if active_timestamp == 0 {
        persisted_timestamp.unwrap_or(0)
    } else {
        active_timestamp
    }
}

fn active_snapshot_revision(active_revision: u64, persisted_revision: Option<u64>) -> u64 {
    if active_revision == 0 {
        persisted_revision.unwrap_or(0)
    } else {
        active_revision
    }
}

#[cfg(test)]
mod tests {
    use super::{active_snapshot_revision, active_snapshot_timestamp};

    #[test]
    fn active_snapshot_keeps_the_persisted_event_timestamp() {
        assert_eq!(active_snapshot_timestamp(0, Some(123)), 123);
        assert_eq!(active_snapshot_timestamp(456, Some(123)), 456);
        assert_eq!(active_snapshot_timestamp(0, None), 0);
        assert_eq!(active_snapshot_revision(0, Some(123)), 123);
        assert_eq!(active_snapshot_revision(456, Some(123)), 456);
        assert_eq!(active_snapshot_revision(0, None), 0);
    }
}
