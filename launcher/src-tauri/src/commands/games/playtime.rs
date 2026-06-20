use std::path::Path;
use std::process::Child;
use std::{collections::HashMap, thread};
use tauri::{AppHandle, Emitter};

use super::core::{
    current_unix_timestamp, read_installed_games_cache, unix_timestamp_to_iso,
    write_installed_games_cache,
};
use super::types::*;

pub fn start_playtime_poller(app_handle: AppHandle) {
    thread::spawn(move || {
        use sysinfo::System;
        let mut sys = System::new_all();
        // Keep track of accumulated seconds for each running game in this thread
        let mut active_sessions = HashMap::<String, ActiveGameSession>::new();

        loop {
            thread::sleep(std::time::Duration::from_secs(10));

            // Refresh processes (just executables/paths to be fast)
            sys.refresh_processes_specifics(
                sysinfo::ProcessesToUpdate::All,
                true,
                sysinfo::ProcessRefreshKind::nothing().with_exe(sysinfo::UpdateKind::Always),
            );

            let cached_games = read_installed_games_cache().unwrap_or_default();
            if cached_games.is_empty() {
                continue;
            }

            // Collect running process identities once per poll. Games can be
            // identified by path, executable path, or launcher-provided names.
            let mut running_processes = Vec::new();
            let process_windows = collect_process_windows();
            for (pid, process) in sys.processes() {
                let process_name = normalize_process_name(&process.name().to_string_lossy());
                let pid = pid.to_string().parse::<u32>().ok();
                let window = pid.and_then(|pid| process_windows.get(&pid).cloned());
                if let Some(exe_path) = process.exe() {
                    running_processes.push(RunningProcess {
                        name: process_name,
                        exe_path: Some(normalize_path(&exe_path.to_string_lossy())),
                        pid,
                        uptime_seconds: Some(process.run_time()),
                        window,
                    });
                } else {
                    running_processes.push(RunningProcess {
                        name: process_name,
                        exe_path: None,
                        pid,
                        uptime_seconds: Some(process.run_time()),
                        window,
                    });
                }
            }

            let mut games_updated = false;
            let mut updated_cache = cached_games.clone();
            let last_input_seconds = Some(super::idle::seconds_since_last_input());

            for game in updated_cache.iter_mut() {
                let running_process = find_running_game_process(game, &running_processes);
                let was_running = active_sessions.contains_key(&game.id);
                let checked_at = unix_timestamp_to_iso(current_unix_timestamp());

                if let Some(running_process) = running_process {
                    if let Some(event) = game_lifecycle_event_for_transition(
                        game,
                        was_running,
                        true,
                        Some(running_process),
                        last_input_seconds,
                        &checked_at,
                    ) {
                        emit_game_lifecycle_event(&app_handle, &event);
                    }
                    let runtime_update = game_runtime_update_for_running_game(
                        game,
                        running_process,
                        last_input_seconds,
                        &checked_at,
                    );
                    emit_game_runtime_update(&app_handle, &runtime_update);

                    // Increment session time
                    let session = active_sessions.entry(game.id.clone()).or_insert_with(|| {
                        ActiveGameSession {
                            accumulated_seconds: 0,
                            process: running_process.clone(),
                        }
                    });
                    session.process = running_process.clone();
                    session.accumulated_seconds += 10;

                    // Update last played time to now
                    let now = current_unix_timestamp();
                    game.last_played_at = Some(unix_timestamp_to_iso(now));

                    if session.accumulated_seconds >= 60 {
                        // Increment playtime minutes
                        let current_min = game.playtime_minutes.unwrap_or_default();
                        game.playtime_minutes = Some(current_min + 1);
                        session.accumulated_seconds = 0; // reset seconds accumulator
                        games_updated = true;
                    }
                } else {
                    // Game is not running. If it was previously running, we reset session
                    if let Some(session) = active_sessions.remove(&game.id) {
                        if let Some(event) = game_lifecycle_event_for_transition(
                            game,
                            true,
                            false,
                            Some(&session.process),
                            last_input_seconds,
                            &checked_at,
                        ) {
                            emit_game_lifecycle_event(&app_handle, &event);
                        }
                        games_updated = true; // save stopped state/last updated playtime
                    }
                }
            }

            if games_updated {
                write_installed_games_cache(&updated_cache);
                // Emit event for all games that had changes
                for game in updated_cache {
                    let update = GameActivityUpdate {
                        game_id: game.id.clone(),
                        last_played: game.last_played_at.clone(),
                        playtime_minutes: game.playtime_minutes,
                    };
                    let _ = app_handle.emit("game_activity_updated", &update);
                }
            }
        }
    });
}

#[derive(Debug, Clone)]
struct RunningProcess {
    name: String,
    exe_path: Option<String>,
    pid: Option<u32>,
    uptime_seconds: Option<u64>,
    window: Option<GameWindowInfo>,
}

#[derive(Debug, Clone)]
struct GameWindowInfo {
    handle: String,
    title: Option<String>,
}

#[derive(Debug, Clone)]
struct ActiveGameSession {
    accumulated_seconds: u32,
    process: RunningProcess,
}

fn normalize_path(path: &str) -> String {
    path.replace("\\", "/").trim_end_matches('/').to_lowercase()
}

fn normalize_process_name(name: &str) -> String {
    Path::new(name)
        .file_name()
        .and_then(|file_name| file_name.to_str())
        .unwrap_or(name)
        .to_lowercase()
}

fn process_name_candidates(game: &InstalledGame) -> Vec<String> {
    let mut names = game.process_names.clone();
    if let Some(executable_path) = &game.executable_path {
        if let Some(file_name) = Path::new(executable_path)
            .file_name()
            .and_then(|file_name| file_name.to_str())
        {
            names.push(file_name.to_string());
        }
    }

    names
        .into_iter()
        .map(|name| normalize_process_name(&name))
        .filter(|name| !name.trim().is_empty())
        .fold(Vec::<String>::new(), |mut unique, name| {
            if !unique.contains(&name) {
                unique.push(name);
            }
            unique
        })
}

fn find_running_game_process<'a>(
    game: &InstalledGame,
    running_processes: &'a [RunningProcess],
) -> Option<&'a RunningProcess> {
    let install_path = game.install_path.as_ref().map(|path| normalize_path(path));
    let executable_path = game
        .executable_path
        .as_ref()
        .map(|path| normalize_path(path));
    let process_names = process_name_candidates(game);

    if install_path.is_none() && executable_path.is_none() && process_names.is_empty() {
        return None;
    }

    running_processes.iter().find(|process| {
        if process_names.iter().any(|name| name == &process.name) {
            return true;
        }

        let Some(process_path) = &process.exe_path else {
            return false;
        };

        if executable_path
            .as_ref()
            .is_some_and(|path| process_path == path)
        {
            return true;
        }

        install_path.as_ref().is_some_and(|path| {
            process_path == path
                || process_path
                    .strip_prefix(path)
                    .is_some_and(|rest| rest.starts_with('/'))
        })
    })
}

fn game_lifecycle_event_for_transition(
    game: &InstalledGame,
    was_running: bool,
    is_running: bool,
    process: Option<&RunningProcess>,
    last_input_seconds: Option<u64>,
    checked_at: &str,
) -> Option<GameLifecycleEvent> {
    let event = match (was_running, is_running) {
        (false, true) => "game_started",
        (true, false) => "game_stopped",
        _ => return None,
    };

    Some(GameLifecycleEvent {
        event: event.to_string(),
        game_id: game.id.clone(),
        title: game.title.clone(),
        launcher: game.launcher.clone(),
        running: is_running,
        pid: process.and_then(|process| process.pid),
        process_name: process.map(|process| process.name.clone()),
        uptime_seconds: process.and_then(|process| process.uptime_seconds),
        last_input_seconds,
        window_handle: process
            .and_then(|process| process.window.as_ref().map(|window| window.handle.clone())),
        window_title: process.and_then(|process| {
            process
                .window
                .as_ref()
                .and_then(|window| window.title.clone())
        }),
        last_played: game.last_played_at.clone(),
        playtime_minutes: game.playtime_minutes,
        occurred_at: checked_at.to_string(),
    })
}

fn game_runtime_update_for_running_game(
    game: &InstalledGame,
    process: &RunningProcess,
    last_input_seconds: Option<u64>,
    checked_at: &str,
) -> GameRuntimeUpdate {
    GameRuntimeUpdate {
        game_id: game.id.clone(),
        title: game.title.clone(),
        launcher: game.launcher.clone(),
        running: true,
        pid: process.pid,
        process_name: Some(process.name.clone()),
        uptime_seconds: process.uptime_seconds,
        last_input_seconds,
        window_handle: process.window.as_ref().map(|window| window.handle.clone()),
        window_title: process
            .window
            .as_ref()
            .and_then(|window| window.title.clone()),
        occurred_at: checked_at.to_string(),
    }
}

#[cfg(target_os = "windows")]
fn collect_process_windows() -> HashMap<u32, GameWindowInfo> {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
        IsWindowVisible,
    };

    unsafe extern "system" fn enum_window(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let process_windows = &mut *(lparam as *mut HashMap<u32, GameWindowInfo>);
        if IsWindowVisible(hwnd) == 0 {
            return 1;
        }

        let mut process_id = 0u32;
        GetWindowThreadProcessId(hwnd, &mut process_id);
        if process_id == 0 || process_windows.contains_key(&process_id) {
            return 1;
        }

        let title = read_window_title(hwnd);
        if title
            .as_deref()
            .map_or(true, |value| value.trim().is_empty())
        {
            return 1;
        }

        process_windows.insert(
            process_id,
            GameWindowInfo {
                handle: format!("0x{:x}", hwnd as usize),
                title,
            },
        );
        1
    }

    unsafe fn read_window_title(hwnd: HWND) -> Option<String> {
        let length = GetWindowTextLengthW(hwnd);
        if length <= 0 {
            return None;
        }

        let mut buffer = vec![0u16; length as usize + 1];
        let copied = GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32);
        if copied <= 0 {
            return None;
        }

        let title = OsString::from_wide(&buffer[..copied as usize])
            .to_string_lossy()
            .trim()
            .to_string();
        (!title.is_empty()).then_some(title)
    }

    let mut process_windows = HashMap::new();
    // SAFETY: The callback only writes to the HashMap passed as lparam for the
    // duration of EnumWindows; Windows calls it synchronously before returning.
    unsafe {
        EnumWindows(Some(enum_window), &mut process_windows as *mut _ as LPARAM);
    }
    process_windows
}

#[cfg(not(target_os = "windows"))]
fn collect_process_windows() -> HashMap<u32, GameWindowInfo> {
    HashMap::new()
}

pub fn record_game_launch_started(game_id: &str) -> Option<GameActivityUpdate> {
    update_cached_game_activity(game_id, Some(current_unix_timestamp()), None)
}

pub fn record_game_play_session_when_finished(app: AppHandle, game_id: String, mut child: Child) {
    thread::spawn(move || {
        if child.wait().is_err() {
            return;
        }

        // The background poller owns duration accounting. Child completion only
        // finalizes last-played so direct executable launches do not double count.
        if let Some(update) =
            update_cached_game_activity(&game_id, Some(current_unix_timestamp()), None)
        {
            emit_game_activity_update(&app, &update);
        }
    });
}

#[allow(clippy::question_mark)]
pub fn update_cached_game_activity(
    game_id: &str,
    last_played: Option<u64>,
    add_playtime_minutes: Option<u32>,
) -> Option<GameActivityUpdate> {
    let mut games = read_installed_games_cache().unwrap_or_default();
    let game = match games.iter_mut().find(|game| game.id == game_id) {
        Some(game) => game,
        None => return None,
    };

    if let Some(timestamp) = last_played {
        game.last_played_at = Some(unix_timestamp_to_iso(timestamp));
    }

    if let Some(minutes) = add_playtime_minutes {
        let current = game.playtime_minutes.unwrap_or_default();
        game.playtime_minutes = Some(current.saturating_add(minutes));
    }

    let update = GameActivityUpdate {
        game_id: game_id.to_string(),
        last_played: game.last_played_at.clone(),
        playtime_minutes: game.playtime_minutes,
    };

    write_installed_games_cache(&games);
    Some(update)
}

pub fn emit_game_activity_update(app: &AppHandle, update: &GameActivityUpdate) {
    let _ = app.emit("game_activity_updated", update);
}

pub fn emit_game_lifecycle_event(app: &AppHandle, event: &GameLifecycleEvent) {
    let _ = app.emit(event.event.as_str(), event);
}

pub fn emit_game_runtime_update(app: &AppHandle, update: &GameRuntimeUpdate) {
    let _ = app.emit("game_runtime_updated", update);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_game() -> InstalledGame {
        InstalledGame {
            achievements: Vec::new(),
            achievement_provider_statuses: Vec::new(),
            achievements_synced_at: None,
            cover_url: None,
            description: "Steam test game".to_string(),
            developer: None,
            executable_path: Some("/games/test/game.exe".to_string()),
            external_id: Some("123".to_string()),
            features: Vec::new(),
            friends_playing: Vec::new(),
            genres: Vec::new(),
            icon_url: None,
            icon_urls: Vec::new(),
            id: "steam-test".to_string(),
            install_path: Some("/games/test".to_string()),
            last_played_at: None,
            launch_uri: None,
            launcher: "steam".to_string(),
            logo_height_percent: None,
            logo_position: default_logo_position(),
            logo_url: None,
            logo_urls: Vec::new(),
            logo_width_percent: None,
            platform: Platform::Linux,
            playtime_minutes: None,
            process_names: vec!["game.exe".to_string()],
            publisher: None,
            rating: None,
            release_date: None,
            save_files: Vec::new(),
            slug: "steam-test".to_string(),
            status: GameStatus::Installed,
            title: "Steam Test".to_string(),
            version: "1.0.0".to_string(),
        }
    }

    #[test]
    fn game_lifecycle_event_detects_started_transition() {
        let game = test_game();
        let process = RunningProcess {
            exe_path: Some("/games/test/game.exe".to_string()),
            name: "game.exe".to_string(),
            pid: Some(4242),
            uptime_seconds: Some(180),
            window: Some(GameWindowInfo {
                handle: "0x1234".to_string(),
                title: Some("Steam Test - Main Window".to_string()),
            }),
        };

        let event = game_lifecycle_event_for_transition(
            &game,
            false,
            true,
            Some(&process),
            Some(42),
            "2026-06-10T10:00:00Z",
        )
        .unwrap();

        assert_eq!(event.event, "game_started");
        assert_eq!(event.game_id, "steam-test");
        assert_eq!(event.title, "Steam Test");
        assert_eq!(event.launcher, "steam");
        assert!(event.running);
        assert_eq!(event.pid, Some(4242));
        assert_eq!(event.process_name.as_deref(), Some("game.exe"));
        assert_eq!(event.uptime_seconds, Some(180));
        assert_eq!(event.last_input_seconds, Some(42));
        assert_eq!(event.window_handle.as_deref(), Some("0x1234"));
        assert_eq!(
            event.window_title.as_deref(),
            Some("Steam Test - Main Window")
        );
    }

    #[test]
    fn game_lifecycle_event_detects_stopped_transition() {
        let game = test_game();
        let process = RunningProcess {
            exe_path: Some("/games/test/game.exe".to_string()),
            name: "game.exe".to_string(),
            pid: Some(4242),
            uptime_seconds: Some(300),
            window: Some(GameWindowInfo {
                handle: "0x1234".to_string(),
                title: Some("Steam Test - Main Window".to_string()),
            }),
        };

        let event = game_lifecycle_event_for_transition(
            &game,
            true,
            false,
            Some(&process),
            Some(120),
            "2026-06-10T10:00:00Z",
        )
        .unwrap();

        assert_eq!(event.event, "game_stopped");
        assert_eq!(event.game_id, "steam-test");
        assert!(!event.running);
        assert_eq!(event.pid, Some(4242));
        assert_eq!(event.process_name.as_deref(), Some("game.exe"));
        assert_eq!(event.uptime_seconds, Some(300));
        assert_eq!(event.last_input_seconds, Some(120));
        assert_eq!(event.window_handle.as_deref(), Some("0x1234"));
        assert_eq!(
            event.window_title.as_deref(),
            Some("Steam Test - Main Window")
        );
    }

    #[test]
    fn game_runtime_update_includes_live_input_metadata() {
        let game = test_game();
        let process = RunningProcess {
            exe_path: Some("/games/test/game.exe".to_string()),
            name: "game.exe".to_string(),
            pid: Some(4242),
            uptime_seconds: Some(180),
            window: Some(GameWindowInfo {
                handle: "0x1234".to_string(),
                title: Some("Steam Test - Main Window".to_string()),
            }),
        };

        let update =
            game_runtime_update_for_running_game(&game, &process, Some(75), "2026-06-10T10:00:00Z");

        assert_eq!(update.game_id, "steam-test");
        assert_eq!(update.title, "Steam Test");
        assert_eq!(update.launcher, "steam");
        assert!(update.running);
        assert_eq!(update.pid, Some(4242));
        assert_eq!(update.process_name.as_deref(), Some("game.exe"));
        assert_eq!(update.uptime_seconds, Some(180));
        assert_eq!(update.last_input_seconds, Some(75));
        assert_eq!(update.window_handle.as_deref(), Some("0x1234"));
        assert_eq!(
            update.window_title.as_deref(),
            Some("Steam Test - Main Window")
        );
    }

    #[test]
    fn game_lifecycle_event_ignores_unchanged_state() {
        let game = test_game();

        assert!(game_lifecycle_event_for_transition(
            &game,
            true,
            true,
            None,
            None,
            "2026-06-10T10:00:00Z"
        )
        .is_none());
    }
}
