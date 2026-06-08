use std::collections::HashMap;

use crate::commands::downloads::history::{
    is_stale_installed_download, load_download_history, remove_download_history_item,
    terminal_sort_rank,
};
use crate::commands::downloads::types::{
    get_download_manager, normalize_queue_payload, payload_from_active_download,
    DownloadItemPayload,
};

pub fn get_download_queue() -> Result<Vec<DownloadItemPayload>, String> {
    let mut queue_by_game_id: HashMap<String, DownloadItemPayload> = load_download_history()
        .into_iter()
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

        for item in active_items {
            if is_stale_installed_download(&item) {
                remove_download_history_item(&item.game_id);
                continue;
            }
            queue_by_game_id.insert(item.game_id.clone(), item);
        }
    }

    {
        if let Ok(gog_queue) = crate::commands::gog::get_gog_download_queue() {
            for item in gog_queue {
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
