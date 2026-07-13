use tauri::AppHandle;
use tokio::sync::watch;

use crate::commands::downloads::external_dispatch;
use crate::commands::downloads::external_download;
use crate::commands::downloads::history::remember_download_item;
use crate::commands::downloads::internal_lifecycle;
use crate::commands::downloads::lifecycle::{DownloadLifecycle, ExternalTracker};
use crate::commands::downloads::types::{
    get_download_manager, payload_from_active_download, ActiveDownload, DownloadStartStatus,
    InternalDownloadSource, StartDownloadResponse,
};
use crate::commands::downloads::utils::{
    get_platform_from_game_id, is_download_game_installed, normalize_game_id,
};
use crate::commands::games::read_installed_games_cache;

pub async fn start_download(
    app: AppHandle,
    game_id: String,
    game_title: Option<String>,
    download_url: Option<String>,
    download_sha256: Option<String>,
    install_manifest_url: Option<String>,
    install_manifest_sha256: Option<String>,
) -> Result<StartDownloadResponse, String> {
    let game_id = normalize_game_id(game_id)?;
    let download_id = format!("download-{game_id}");

    println!("[open-game-launcher] start_download requested for {game_id}");

    if game_id.starts_with("gog-owned-") {
        let gog_id = game_id.strip_prefix("gog-owned-").unwrap_or(&game_id);
        return crate::commands::gog::gog_start_download(app, gog_id.to_string(), None).await;
    }
    if game_id.starts_with("gog-") {
        let gog_id = game_id.strip_prefix("gog-").unwrap_or(&game_id);
        return crate::commands::gog::gog_start_download(app, gog_id.to_string(), None).await;
    }

    let is_external_launcher_request = external_dispatch::is_external_launcher_game_id(&game_id);
    if is_external_launcher_request && is_download_game_installed(&game_id) {
        return Ok(StartDownloadResponse {
            game_id,
            download_id,
            status: DownloadStartStatus::AlreadyInstalled,
            message: "Game is already installed and was not added to Downloads.".to_string(),
        });
    }

    let external_dispatch::ExternalDispatch {
        mut steam_tracker_id,
        mut epic_tracker_id,
        is_external_download,
        external_message,
    } = external_dispatch::dispatch_external_launcher(&game_id);

    let title = resolve_download_title(&game_id, game_title);

    if is_external_launcher_request && !is_external_download && !external_message.is_empty() {
        return Err(external_message);
    }

    let internal_download_source = download_url
        .filter(|url| !url.trim().is_empty())
        .map(|url| {
            InternalDownloadSource::direct_url(
                url,
                download_sha256.filter(|value| !value.trim().is_empty()),
                install_manifest_url.filter(|value| !value.trim().is_empty()),
                install_manifest_sha256.filter(|value| !value.trim().is_empty()),
            )
        });
    let lifecycle = if is_external_download {
        if let Some(steam_id) = steam_tracker_id.take() {
            DownloadLifecycle::External(ExternalTracker::Steam(steam_id))
        } else if let Some(epic_id) = epic_tracker_id.take() {
            DownloadLifecycle::External(ExternalTracker::Epic(epic_id))
        } else {
            let platform = get_platform_from_game_id(&game_id).to_string();
            DownloadLifecycle::External(ExternalTracker::Other { platform })
        }
    } else {
        DownloadLifecycle::Internal {
            source: internal_download_source.clone(),
        }
    };

    start_download_lifecycle(
        app,
        game_id,
        title,
        lifecycle,
        if is_external_download {
            external_message
        } else {
            "Download started.".to_string()
        },
    )
    .await
}

fn resolve_download_title(game_id: &str, game_title: Option<String>) -> String {
    let mut title = game_title
        .clone()
        .unwrap_or_else(|| "Unknown Game".to_string());
    let mut has_game = game_title.is_some();

    if !has_game {
        if let Some(game) = read_installed_games_cache()
            .unwrap_or_default()
            .into_iter()
            .find(|game| game.id == game_id)
        {
            title = game.title;
            has_game = true;
        }
    }

    if has_game {
        title
    } else {
        game_id.replace("-", " ")
    }
}

async fn start_download_lifecycle(
    app: AppHandle,
    game_id: String,
    title: String,
    lifecycle: DownloadLifecycle,
    message: String,
) -> Result<StartDownloadResponse, String> {
    let download_id = format!("download-{game_id}");
    let map = get_download_manager();
    let mut guard = map
        .lock()
        .map_err(|error| format!("Download manager lock poisoned: {error}"))?;

    if guard.contains_key(&game_id) {
        return Ok(StartDownloadResponse {
            game_id: game_id.clone(),
            download_id: download_id.clone(),
            status: DownloadStartStatus::AlreadyQueued,
            message: "Download is already queued.".to_string(),
        });
    }

    let (pause_tx, pause_rx) = watch::channel(false);
    let (cancel_tx, cancel_rx) = watch::channel(false);

    let active = ActiveDownload {
        title: title.clone(),
        progress: 0,
        speed: lifecycle.initial_speed().to_string(),
        status: lifecycle.initial_status().to_string(),
        eta: 0,
        phase: lifecycle.phase().to_string(),
        bytes_downloaded: None,
        bytes_total: None,
        can_pause: lifecycle.can_pause(),
        can_cancel: lifecycle.can_cancel(),
        external: lifecycle.external_flag(),
        paused: false,
        cancelled: false,
        pause_tx,
        cancel_tx,
        raw_status: "starting".to_string(),
        error: None,
    };
    guard.insert(game_id.clone(), active);
    if let Some(dl) = guard.get(&game_id) {
        if let Err(error) = remember_download_item(payload_from_active_download(&game_id, dl)) {
            guard.remove(&game_id);
            return Err(format!("Could not persist queued download: {error}"));
        }
    }

    let app_clone = app.clone();
    let game_id_clone = game_id.clone();
    let title_clone = title.clone();

    tokio::spawn(async move {
        let cancel_rx = cancel_rx;
        let pause_rx = pause_rx;

        match lifecycle {
            DownloadLifecycle::External(tracker) => {
                external_download::run_external_download(
                    app_clone,
                    game_id_clone,
                    tracker,
                    pause_rx,
                    cancel_rx,
                )
                .await;
            }
            DownloadLifecycle::Internal { source } => {
                internal_lifecycle::run_internal_lifecycle(
                    app_clone,
                    game_id_clone,
                    title_clone,
                    source,
                    pause_rx,
                    cancel_rx,
                )
                .await;
            }
        }
    });

    Ok(StartDownloadResponse {
        game_id,
        download_id,
        status: DownloadStartStatus::Started,
        message,
    })
}
