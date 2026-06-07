use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;

use serde::Deserialize;
use tauri::AppHandle;

use crate::commands::downloads::types::{
    emit_download_command_error, emit_download_progress, get_download_manager,
    is_steam_control_pending_status, SteamDownloadControlAction, DOWNLOAD_STATUS_DOWNLOADING,
    DOWNLOAD_STATUS_PAUSED, DOWNLOAD_STATUS_PAUSING, DOWNLOAD_STATUS_RESUMING,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SteamCefTarget {
    #[serde(default)]
    title: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    web_socket_debugger_url: Option<String>,
}

const STEAM_CONTROL_TIMEOUT: Duration = Duration::from_secs(8);

pub(crate) fn toggle_steam_download_pause(
    app: AppHandle,
    game_id: &str,
    steam_app_id: &str,
) -> Result<(), String> {
    let app_id = steam_app_id
        .parse::<u32>()
        .map_err(|error| format!("Invalid Steam app id: {error}"))?;

    let action = {
        let map = get_download_manager();
        let guard = map
            .lock()
            .map_err(|error| format!("Download manager lock poisoned: {error}"))?;
        match guard.get(game_id) {
            Some(download) if is_steam_control_pending_status(&download.status) => {
                return Ok(());
            }
            Some(download) if download.status == DOWNLOAD_STATUS_PAUSED || download.paused => {
                SteamDownloadControlAction::Resume
            }
            _ => SteamDownloadControlAction::Pause,
        }
    };

    set_steam_download_control_pending(&app, game_id, action)?;

    let app_clone = app.clone();
    let game_id_clone = game_id.to_string();
    tokio::runtime::Handle::current().spawn_blocking(move || {
        let result = try_control_steam_download_with_timeout(app_id, action);
        finish_steam_download_control(&app_clone, &game_id_clone, action, result);
    });

    Ok(())
}

fn set_steam_download_control_pending(
    app: &AppHandle,
    game_id: &str,
    action: SteamDownloadControlAction,
) -> Result<(), String> {
    let Some((progress, speed, status, eta)) = update_steam_download_control_state(
        game_id,
        action,
        SteamDownloadControlStage::Pending,
        None,
    )?
    else {
        return Ok(());
    };

    emit_download_progress(app, game_id, progress, &speed, &status, eta);
    Ok(())
}

fn finish_steam_download_control(
    app: &AppHandle,
    game_id: &str,
    action: SteamDownloadControlAction,
    result: Result<(), String>,
) {
    let error_message = result.err();
    let stage = if error_message.is_some() {
        SteamDownloadControlStage::Failed
    } else {
        SteamDownloadControlStage::Applied
    };

    if let Ok(Some((progress, speed, status, eta))) =
        update_steam_download_control_state(game_id, action, stage, error_message.as_deref())
    {
        emit_download_progress(app, game_id, progress, &speed, &status, eta);
    }

    if let Some(message) = error_message {
        emit_download_command_error(app, game_id, &message);
    }
}

#[derive(Copy, Clone)]
enum SteamDownloadControlStage {
    Pending,
    Applied,
    Failed,
}

fn update_steam_download_control_state(
    game_id: &str,
    action: SteamDownloadControlAction,
    stage: SteamDownloadControlStage,
    error_message: Option<&str>,
) -> Result<Option<(u32, String, String, u32)>, String> {
    let map = get_download_manager();
    let mut guard = map
        .lock()
        .map_err(|error| format!("Download manager lock poisoned: {error}"))?;
    let Some(download) = guard.get_mut(game_id) else {
        return Ok(None);
    };

    match (action, stage) {
        (SteamDownloadControlAction::Pause, SteamDownloadControlStage::Pending) => {
            download.paused = true;
            download.status = DOWNLOAD_STATUS_PAUSING.to_string();
            download.speed = "Steam Pausing...".to_string();
            download.phase = "paused".to_string();
            download.eta = 0;
            download.can_pause = false;
            let _ = download.pause_tx.send(true);
        }
        (SteamDownloadControlAction::Pause, SteamDownloadControlStage::Applied) => {
            download.paused = true;
            download.status = DOWNLOAD_STATUS_PAUSED.to_string();
            download.speed = "Steam Paused".to_string();
            download.phase = "paused".to_string();
            download.eta = 0;
            download.can_pause = true;
            let _ = download.pause_tx.send(true);
        }
        (SteamDownloadControlAction::Pause, SteamDownloadControlStage::Failed) => {
            download.paused = false;
            download.status = DOWNLOAD_STATUS_DOWNLOADING.to_string();
            download.speed = steam_control_failed_speed("Pause", error_message);
            download.phase = "external".to_string();
            download.eta = 999;
            download.can_pause = true;
            let _ = download.pause_tx.send(false);
        }
        (SteamDownloadControlAction::Resume, SteamDownloadControlStage::Pending) => {
            download.paused = false;
            download.status = DOWNLOAD_STATUS_RESUMING.to_string();
            download.speed = "Steam Resuming...".to_string();
            download.phase = "external".to_string();
            download.eta = 999;
            download.can_pause = false;
            let _ = download.pause_tx.send(false);
        }
        (SteamDownloadControlAction::Resume, SteamDownloadControlStage::Applied) => {
            download.paused = false;
            download.status = DOWNLOAD_STATUS_DOWNLOADING.to_string();
            download.speed = "Steam (Resuming...)".to_string();
            download.phase = "external".to_string();
            download.eta = 999;
            download.can_pause = true;
            let _ = download.pause_tx.send(false);
        }
        (SteamDownloadControlAction::Resume, SteamDownloadControlStage::Failed) => {
            download.paused = true;
            download.status = DOWNLOAD_STATUS_PAUSED.to_string();
            download.speed = steam_control_failed_speed("Resume", error_message);
            download.phase = "paused".to_string();
            download.eta = 0;
            download.can_pause = true;
            let _ = download.pause_tx.send(true);
        }
    }

    Ok(Some((
        download.progress,
        download.speed.clone(),
        download.status.clone(),
        download.eta,
    )))
}

fn steam_control_failed_speed(action: &str, error_message: Option<&str>) -> String {
    let Some(error_message) = error_message else {
        return format!("Steam {action} failed");
    };
    let mut message = error_message.replace(['\r', '\n'], " ");
    if message.len() > 140 {
        message.truncate(137);
        message.push_str("...");
    }
    format!("Steam {action} failed: {message}")
}

fn try_control_steam_download(
    app_id: u32,
    action: SteamDownloadControlAction,
) -> Result<(), String> {
    let targets = match steam_cef_targets() {
        Ok(targets) => targets,
        Err(error) => return recover_steam_cef_debugging(app_id, action, error),
    };

    control_steam_download_targets(targets, app_id, action)
}

fn try_control_steam_download_with_timeout(
    app_id: u32,
    action: SteamDownloadControlAction,
) -> Result<(), String> {
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(try_control_steam_download(app_id, action));
    });

    match rx.recv_timeout(STEAM_CONTROL_TIMEOUT) {
        Ok(result) => result,
        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => Err(format!(
            "Steam {} timed out after {}s. The download stays visible; retry when Steam is responsive.",
            match action {
                SteamDownloadControlAction::Pause => "pause",
                SteamDownloadControlAction::Resume => "resume",
            },
            STEAM_CONTROL_TIMEOUT.as_secs()
        )),
        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => Err(format!(
            "Steam {} worker stopped unexpectedly.",
            match action {
                SteamDownloadControlAction::Pause => "pause",
                SteamDownloadControlAction::Resume => "resume",
            }
        )),
    }
}

fn control_steam_download_targets(
    targets: Vec<SteamCefTarget>,
    app_id: u32,
    action: SteamDownloadControlAction,
) -> Result<(), String> {
    let mut last_error = None;

    for target in targets {
        let Some(web_socket_debugger_url) = target.web_socket_debugger_url.as_deref() else {
            continue;
        };

        match control_steam_download_target(web_socket_debugger_url, app_id, action) {
            Ok(()) => return Ok(()),
            Err(error) => last_error = Some(error),
        }
    }

    Err(last_error.unwrap_or_else(|| {
        "Steam CEF remote debugging did not expose a usable SteamClient.Downloads target."
            .to_string()
    }))
}

fn recover_steam_cef_debugging(
    app_id: u32,
    action: SteamDownloadControlAction,
    initial_error: String,
) -> Result<(), String> {
    let marker_result = enable_steam_cef_debug_marker();
    let marker_hint = marker_result
        .as_ref()
        .map(|path| {
            format!(
                "I enabled the CEF debug marker at {}.",
                path.to_string_lossy()
            )
        })
        .unwrap_or_else(|error| format!("Could not enable the CEF debug marker: {error}."));

    if is_steam_process_running() {
        return Err(format!(
            "Steam is already running without CEF remote debugging. {marker_hint} Exit Steam completely via Steam > Exit, start Steam again, then retry Pause/Resume. Previous error: {initial_error}"
        ));
    }

    launch_steam_with_cef_debugging()?;

    for _ in 0..24 {
        std::thread::sleep(Duration::from_millis(500));
        if let Ok(targets) = steam_cef_targets() {
            return control_steam_download_targets(targets, app_id, action);
        }
    }

    Err(format!(
        "Steam was started with -cef-enable-debugging, but CEF remote debugging is not ready yet. Wait until Steam has fully opened, then retry Pause/Resume. {marker_hint} Previous error: {initial_error}"
    ))
}

fn enable_steam_cef_debug_marker() -> Result<PathBuf, String> {
    let steam_dir = crate::commands::games::detect::find_steam_dir()
        .ok_or_else(|| "Steam install directory was not found.".to_string())?;
    let marker_path = steam_dir.join(".cef-enable-remote-debugging");
    if !marker_path.exists() {
        std::fs::write(&marker_path, b"").map_err(|error| {
            format!("Could not write {}: {error}", marker_path.to_string_lossy())
        })?;
    }
    Ok(marker_path)
}

fn is_steam_process_running() -> bool {
    use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};

    let mut system = System::new_all();
    system.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::everything(),
    );
    system.processes().values().any(|process| {
        let name = process.name().to_string_lossy().to_ascii_lowercase();
        matches!(
            name.as_str(),
            "steam.exe" | "steam" | "steamwebhelper.exe" | "steamwebhelper"
        )
    })
}

fn launch_steam_with_cef_debugging() -> Result<(), String> {
    let steam_dir = crate::commands::games::detect::find_steam_dir()
        .ok_or_else(|| "Steam install directory was not found.".to_string())?;

    #[cfg(target_os = "windows")]
    {
        let steam_exe = steam_dir.join("steam.exe");
        if !steam_exe.is_file() {
            return Err(format!(
                "Steam executable was not found at {}.",
                steam_exe.to_string_lossy()
            ));
        }
        Command::new(&steam_exe)
            .arg("-cef-enable-debugging")
            .spawn()
            .map_err(|error| {
                format!(
                    "Could not start Steam with -cef-enable-debugging from {}: {error}",
                    steam_exe.to_string_lossy()
                )
            })?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-a", "Steam", "--args", "-cef-enable-debugging"])
            .spawn()
            .map_err(|error| {
                format!("Could not start Steam with -cef-enable-debugging: {error}")
            })?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let steam_cmd = steam_dir
            .join("steam.sh")
            .to_str()
            .map(|path| path.to_string())
            .unwrap_or_else(|| "steam".to_string());
        Command::new(steam_cmd)
            .arg("-cef-enable-debugging")
            .spawn()
            .map_err(|error| {
                format!("Could not start Steam with -cef-enable-debugging: {error}")
            })?;
    }

    Ok(())
}

pub(crate) fn steam_cef_targets() -> Result<Vec<SteamCefTarget>, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(800))
        .build()
        .map_err(|error| format!("Could not create Steam CEF client: {error}"))?;
    let mut targets = Vec::new();
    let mut last_parse_error = None;

    for port in [8080_u16, 8081, 9222, 9223] {
        let url = format!("http://127.0.0.1:{port}/json");
        let Ok(response) = client.get(&url).send() else {
            continue;
        };
        if !response.status().is_success() {
            continue;
        }

        match response
            .text()
            .map_err(|error| format!("Steam CEF target list read failed: {error}"))
            .and_then(|body| {
                serde_json::from_str::<Vec<SteamCefTarget>>(&body)
                    .map_err(|error| format!("Steam CEF target list parse failed: {error}"))
            }) {
            Ok(mut port_targets) => targets.append(&mut port_targets),
            Err(error) => last_parse_error = Some(error),
        }
    }

    if targets.is_empty() {
        return Err(last_parse_error.unwrap_or_else(|| {
            "Steam CEF remote debugging is not reachable on 127.0.0.1:8080, 8081, 9222, or 9223. Start Steam with -cef-enable-debugging, then retry."
                .to_string()
        }));
    }

    targets.sort_by_key(|target| std::cmp::Reverse(steam_cef_target_score(target)));
    Ok(targets)
}

fn steam_cef_target_score(target: &SteamCefTarget) -> u8 {
    if target.web_socket_debugger_url.is_none() {
        return 0;
    }

    let haystack = format!("{} {}", target.title, target.url).to_ascii_lowercase();
    if haystack.contains("downloads") {
        5
    } else if haystack.contains("library") {
        4
    } else if haystack.contains("steamloopback") || haystack.contains("steam") {
        3
    } else {
        1
    }
}

fn control_steam_download_target(
    web_socket_debugger_url: &str,
    app_id: u32,
    action: SteamDownloadControlAction,
) -> Result<(), String> {
    let (mut socket, _) = tungstenite::connect(web_socket_debugger_url)
        .map_err(|error| format!("Steam CDP connect failed: {error}"))?;

    if let tungstenite::stream::MaybeTlsStream::Plain(stream) = socket.get_mut() {
        let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
        let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
    }

    let request_id = 1_u64;
    let request = serde_json::json!({
        "id": request_id,
        "method": "Runtime.evaluate",
        "params": {
            "expression": steam_download_control_expression(app_id, action),
            "awaitPromise": true,
            "returnByValue": true,
        }
    });

    socket
        .send(tungstenite::Message::text(request.to_string()))
        .map_err(|error| format!("Steam CDP send failed: {error}"))?;

    for _ in 0..64 {
        let message = socket
            .read()
            .map_err(|error| format!("Steam CDP read failed: {error}"))?;
        let text = match message {
            tungstenite::Message::Text(text) => text.to_string(),
            tungstenite::Message::Close(_) => {
                return Err("Steam CDP connection closed.".to_string())
            }
            _ => continue,
        };
        let response: serde_json::Value = serde_json::from_str(&text)
            .map_err(|error| format!("Steam CDP returned invalid JSON: {error}"))?;
        if response.get("id").and_then(|value| value.as_u64()) != Some(request_id) {
            continue;
        }

        if let Some(error) = response.get("error") {
            return Err(format!(
                "Steam CDP Runtime.evaluate failed: {}",
                cdp_message(error)
            ));
        }
        if let Some(exception) = response.get("exceptionDetails") {
            return Err(format!(
                "Steam Downloads API failed: {}",
                cdp_exception_message(exception)
            ));
        }
        if let Some(result) = response.get("result").and_then(|value| value.get("result")) {
            if result.get("subtype").and_then(|value| value.as_str()) == Some("error") {
                return Err(format!(
                    "Steam Downloads API failed: {}",
                    cdp_message(result)
                ));
            }
        }

        return Ok(());
    }

    Err("Steam CDP did not return a Runtime.evaluate response.".to_string())
}

fn steam_download_control_expression(app_id: u32, action: SteamDownloadControlAction) -> String {
    let method = match action {
        SteamDownloadControlAction::Pause => "PauseAppUpdate",
        SteamDownloadControlAction::Resume => "ResumeAppUpdate",
    };

    format!(
        "(() => {{ const downloads = globalThis.SteamClient && globalThis.SteamClient.Downloads; if (!downloads || typeof downloads.{method} !== 'function') {{ throw new Error('SteamClient.Downloads.{method} unavailable'); }} return downloads.{method}({app_id}); }})()"
    )
}

fn cdp_exception_message(exception: &serde_json::Value) -> String {
    exception
        .pointer("/exception/description")
        .and_then(|value| value.as_str())
        .or_else(|| {
            exception
                .pointer("/exception/value")
                .and_then(|value| value.as_str())
        })
        .or_else(|| exception.get("text").and_then(|value| value.as_str()))
        .unwrap_or("unknown Steam exception")
        .to_string()
}

fn cdp_message(value: &serde_json::Value) -> String {
    value
        .get("message")
        .and_then(|message| message.as_str())
        .or_else(|| {
            value
                .get("description")
                .and_then(|message| message.as_str())
        })
        .or_else(|| value.get("value").and_then(|message| message.as_str()))
        .unwrap_or("unknown Steam CDP error")
        .to_string()
}
