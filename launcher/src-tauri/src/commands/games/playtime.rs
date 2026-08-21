use std::{
    collections::HashMap,
    path::Path,
    process::Child,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::Duration,
};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use super::core::{
    current_unix_timestamp, normalize_game_id, read_installed_games_cache,
    read_installed_games_cache_result, unix_timestamp_to_iso, update_installed_game_cache,
};
use super::types::*;
use super::{device_id::load_or_create_device_id, play_sessions};

const PLAYTIME_POLL_INTERVAL: Duration = Duration::from_secs(10);
const PLAYTIME_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(7);

pub struct PlaytimePoller {
    shutdown_tx: mpsc::Sender<()>,
    stopped_rx: Mutex<mpsc::Receiver<()>>,
    worker: Mutex<Option<JoinHandle<()>>>,
    observed_processes: Arc<Mutex<HashMap<String, ObservedGameProcess>>>,
    shutdown_requested: AtomicBool,
    shutdown_acknowledged: AtomicBool,
}

impl PlaytimePoller {
    pub fn shutdown(&self) -> bool {
        self.shutdown_with_timeout(PLAYTIME_SHUTDOWN_TIMEOUT)
    }

    fn shutdown_with_timeout(&self, timeout: Duration) -> bool {
        if self.shutdown_acknowledged.load(Ordering::Acquire) {
            return true;
        }

        if !self.shutdown_requested.swap(true, Ordering::AcqRel) {
            let _ = self.shutdown_tx.send(());
        }

        let stopped = self
            .stopped_rx
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .recv_timeout(timeout);

        match stopped {
            Ok(()) => {
                let joined = self.join_worker();
                self.shutdown_acknowledged.store(joined, Ordering::Release);
                joined
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                let joined = self.join_worker();
                self.shutdown_acknowledged.store(joined, Ordering::Release);
                joined
            }
            Err(mpsc::RecvTimeoutError::Timeout) => false,
        }
    }

    fn join_worker(&self) -> bool {
        let worker = self
            .worker
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .take();
        worker.is_none_or(|worker| worker.join().is_ok())
    }
}

#[derive(Debug, PartialEq, Eq)]
enum PollerWakeReason {
    Poll,
    Shutdown,
}

fn wait_for_poll_or_shutdown(
    shutdown_rx: &mpsc::Receiver<()>,
    poll_interval: Duration,
) -> PollerWakeReason {
    match shutdown_rx.recv_timeout(poll_interval) {
        Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => PollerWakeReason::Shutdown,
        Err(mpsc::RecvTimeoutError::Timeout) => PollerWakeReason::Poll,
    }
}

pub fn start_playtime_poller(app_handle: AppHandle) -> PlaytimePoller {
    let (shutdown_tx, shutdown_rx) = mpsc::channel();
    let (stopped_tx, stopped_rx) = mpsc::sync_channel(1);
    let observed_processes = Arc::new(Mutex::new(HashMap::new()));
    let worker_observed_processes = Arc::clone(&observed_processes);
    let worker = thread::spawn(move || {
        run_playtime_poller(app_handle, shutdown_rx, worker_observed_processes);
        let _ = stopped_tx.send(());
    });

    PlaytimePoller {
        shutdown_tx,
        stopped_rx: Mutex::new(stopped_rx),
        worker: Mutex::new(Some(worker)),
        observed_processes,
        shutdown_requested: AtomicBool::new(false),
        shutdown_acknowledged: AtomicBool::new(false),
    }
}

fn run_playtime_poller(
    app_handle: AppHandle,
    shutdown_rx: mpsc::Receiver<()>,
    observed_processes: Arc<Mutex<HashMap<String, ObservedGameProcess>>>,
) {
    use sysinfo::System;
    let mut sys = System::new_all();
    // Keep track of accumulated seconds for each running game in this thread.
    let mut active_sessions = HashMap::<String, ActiveGameSession>::new();

    loop {
        if wait_for_poll_or_shutdown(&shutdown_rx, PLAYTIME_POLL_INTERVAL)
            == PollerWakeReason::Shutdown
        {
            replace_observed_processes(&observed_processes, HashMap::new());
            finalize_active_sessions_on_shutdown(&app_handle, &mut active_sessions);
            break;
        }

        // Refresh processes (just executables/paths to be fast)
        sys.refresh_processes_specifics(
            sysinfo::ProcessesToUpdate::All,
            true,
            sysinfo::ProcessRefreshKind::nothing().with_exe(sysinfo::UpdateKind::Always),
        );

        let cached_games = read_installed_games_cache().unwrap_or_default();
        if cached_games.is_empty() {
            replace_observed_processes(&observed_processes, HashMap::new());
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
                    start_time: Some(process.start_time()),
                    uptime_seconds: Some(process.run_time()),
                    window,
                });
            } else {
                running_processes.push(RunningProcess {
                    name: process_name,
                    exe_path: None,
                    pid,
                    start_time: Some(process.start_time()),
                    uptime_seconds: Some(process.run_time()),
                    window,
                });
            }
        }

        let mut activity_updates = HashMap::<String, (Option<String>, u32)>::new();
        let mut updated_cache = cached_games.clone();
        let mut newly_observed_processes = HashMap::new();
        let last_input_seconds = Some(super::idle::seconds_since_last_input());

        for game in updated_cache.iter_mut() {
            let running_process = find_running_game_process(game, &running_processes);
            let was_running = active_sessions.contains_key(&game.id);
            let checked_at = unix_timestamp_to_iso(current_unix_timestamp());

            if let Some(running_process) = running_process {
                if let Some(observed_process) =
                    observed_process_for_safe_stop(game, running_process)
                {
                    newly_observed_processes.insert(game.id.clone(), observed_process);
                }
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
                let now = current_unix_timestamp();
                let session =
                    active_sessions
                        .entry(game.id.clone())
                        .or_insert_with(|| ActiveGameSession {
                            accumulated_seconds: 0,
                            started_at: now as i64,
                            total_seconds: 0,
                            process: running_process.clone(),
                        });
                session.process = running_process.clone();
                session.accumulated_seconds += PLAYTIME_POLL_INTERVAL.as_secs() as u32;
                session.total_seconds = session
                    .total_seconds
                    .saturating_add(PLAYTIME_POLL_INTERVAL.as_secs() as u32);

                // Update last played time to now
                game.last_played_at = Some(unix_timestamp_to_iso(now));

                if let Some(update) = first_running_activity_update(was_running, game) {
                    activity_updates.insert(game.id.clone(), update);
                }

                if session.accumulated_seconds >= 60 {
                    // Increment playtime minutes
                    let current_min = game.playtime_minutes.unwrap_or_default();
                    game.playtime_minutes = Some(current_min + 1);
                    session.accumulated_seconds = 0; // reset seconds accumulator
                    activity_updates.insert(game.id.clone(), (game.last_played_at.clone(), 1));
                }
            } else {
                // Game is not running. If it was previously running, finalize its session.
                if let Some(session) =
                    finalize_active_session(&mut active_sessions, &game.id, |game_id, session| {
                        record_completed_play_session(&app_handle, game_id, session);
                    })
                {
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
                    activity_updates.insert(game.id.clone(), (game.last_played_at.clone(), 0));
                }
            }
        }

        replace_observed_processes(&observed_processes, newly_observed_processes);

        for (game_id, (last_played, add_playtime_minutes)) in activity_updates {
            match update_installed_game_cache(&game_id, move |game| {
                apply_game_activity_update(game, last_played, add_playtime_minutes);
                Ok(())
            }) {
                Ok(game) => {
                    let update = GameActivityUpdate {
                        game_id: game.id,
                        last_played: game.last_played_at,
                        playtime_minutes: game.playtime_minutes,
                    };
                    let _ = app_handle.emit("game_activity_updated", &update);
                }
                Err(error) => eprintln!(
                    "[open-game-launcher] Could not persist activity for {game_id}: {error}"
                ),
            }
        }
    }
}

fn finalize_active_session(
    active_sessions: &mut HashMap<String, ActiveGameSession>,
    game_id: &str,
    mut finalize: impl FnMut(&str, &ActiveGameSession),
) -> Option<ActiveGameSession> {
    let session = active_sessions.remove(game_id)?;
    finalize(game_id, &session);
    Some(session)
}

fn drain_active_sessions(
    active_sessions: &mut HashMap<String, ActiveGameSession>,
    mut finalize: impl FnMut(&str, &ActiveGameSession),
) {
    for (game_id, session) in active_sessions.drain() {
        finalize(&game_id, &session);
    }
}

fn finalize_active_sessions_on_shutdown(
    app: &AppHandle,
    active_sessions: &mut HashMap<String, ActiveGameSession>,
) {
    let mut finalized_sessions = Vec::with_capacity(active_sessions.len());
    drain_active_sessions(active_sessions, |game_id, session| {
        record_completed_play_session(app, game_id, session);
        finalized_sessions.push((game_id.to_string(), session.clone()));
    });

    if finalized_sessions.is_empty() {
        return;
    }

    let cached_games = read_installed_games_cache().unwrap_or_default();
    let checked_at = unix_timestamp_to_iso(current_unix_timestamp());
    let last_input_seconds = Some(super::idle::seconds_since_last_input());

    for (game_id, session) in finalized_sessions {
        if let Some(game) = cached_games.iter().find(|game| game.id == game_id) {
            if let Some(event) = game_lifecycle_event_for_transition(
                game,
                true,
                false,
                Some(&session.process),
                last_input_seconds,
                &checked_at,
            ) {
                emit_game_lifecycle_event(app, &event);
            }
        }
    }
}

#[derive(Debug, Clone)]
struct RunningProcess {
    name: String,
    exe_path: Option<String>,
    pid: Option<u32>,
    start_time: Option<u64>,
    uptime_seconds: Option<u64>,
    window: Option<GameWindowInfo>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ObservedGameProcess {
    pid: u32,
    name: String,
    exe_path: String,
    start_time: u64,
}

#[derive(Debug, Clone)]
struct GameWindowInfo {
    handle: String,
    title: Option<String>,
}

#[derive(Debug, Clone)]
struct ActiveGameSession {
    accumulated_seconds: u32,
    started_at: i64,
    total_seconds: u32,
    process: RunningProcess,
}

fn record_completed_play_session(app: &AppHandle, game_id: &str, session: &ActiveGameSession) {
    let ended_at = current_unix_timestamp() as i64;
    let record = play_sessions::PlaySessionRecord {
        id: Uuid::new_v4().to_string(),
        game_id: game_id.to_string(),
        started_at: session.started_at,
        ended_at: ended_at.max(session.started_at),
        duration_minutes: session.total_seconds.div_ceil(60),
        platform: play_sessions::platform_to_str(&current_platform()).to_string(),
        launcher_device_id: load_or_create_device_id(),
        synced_at: None,
    };

    if let Err(error) = play_sessions::upsert_play_session(record.clone()) {
        eprintln!("[open-game-launcher] Could not persist completed play session: {error}");
        return;
    }
    let _ = app.emit("play_session_recorded", record);
}

fn current_platform() -> Platform {
    #[cfg(target_os = "windows")]
    return Platform::Windows;
    #[cfg(target_os = "macos")]
    return Platform::Macos;
    #[cfg(target_os = "linux")]
    return Platform::Linux;
}

fn normalize_path(path: &str) -> String {
    let normalized = path.replace("\\", "/");
    let normalized = normalized.trim_end_matches('/');
    #[cfg(target_os = "windows")]
    {
        normalized.to_lowercase()
    }
    #[cfg(not(target_os = "windows"))]
    {
        normalized.to_string()
    }
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

fn normalized_game_paths(game: &InstalledGame) -> (Option<String>, Option<String>) {
    (
        game.install_path.as_ref().map(|path| normalize_path(path)),
        game.executable_path
            .as_ref()
            .map(|path| normalize_path(path)),
    )
}

fn process_path_matches_game(game: &InstalledGame, process_path: &str) -> bool {
    let (install_path, executable_path) = normalized_game_paths(game);
    executable_path
        .as_ref()
        .is_some_and(|path| process_path == path)
        || install_path.as_ref().is_some_and(|path| {
            process_path == path
                || process_path
                    .strip_prefix(path)
                    .is_some_and(|rest| rest.starts_with('/'))
        })
}

fn find_running_game_process<'a>(
    game: &InstalledGame,
    running_processes: &'a [RunningProcess],
) -> Option<&'a RunningProcess> {
    let (install_path, executable_path) = normalized_game_paths(game);
    let process_names = process_name_candidates(game);

    if install_path.is_none() && executable_path.is_none() && process_names.is_empty() {
        return None;
    }

    let has_path_identity = install_path.is_some() || executable_path.is_some();

    if let Some(executable_path) = executable_path {
        if let Some(process) = running_processes
            .iter()
            .find(|process| process.exe_path.as_deref() == Some(executable_path.as_str()))
        {
            return Some(process);
        }
    }

    if let Some(process) = running_processes.iter().find(|process| {
        process
            .exe_path
            .as_deref()
            .is_some_and(|path| process_path_matches_game(game, path))
    }) {
        return Some(process);
    }

    // A launcher-provided executable path or install root is a stronger identity
    // than a generic process filename such as game.exe. Falling back to the name
    // in that case can attribute another game's process and playtime to this game.
    (!has_path_identity).then(|| {
        running_processes
            .iter()
            .find(|process| process_names.iter().any(|name| name == &process.name))
    })?
}

fn observed_process_for_safe_stop(
    game: &InstalledGame,
    process: &RunningProcess,
) -> Option<ObservedGameProcess> {
    let pid = process.pid?;
    let start_time = process.start_time.filter(|start_time| *start_time > 0)?;
    let exe_path = process.exe_path.as_ref()?;
    process_identity_matches_game_for_stop(game, &process.name, exe_path).then(|| {
        ObservedGameProcess {
            pid,
            name: process.name.clone(),
            exe_path: exe_path.clone(),
            start_time,
        }
    })
}

fn process_identity_matches_game_for_stop(
    game: &InstalledGame,
    process_name: &str,
    process_path: &str,
) -> bool {
    let (install_path, executable_path) = normalized_game_paths(game);
    if let Some(executable_path) = executable_path {
        return process_path == executable_path;
    }

    let Some(install_path) = install_path else {
        return false;
    };
    let is_inside_install_path = process_path == install_path
        || process_path
            .strip_prefix(&install_path)
            .is_some_and(|rest| rest.starts_with('/'));
    is_inside_install_path
        && process_name_candidates(game)
            .iter()
            .any(|candidate| candidate == process_name)
}

fn replace_observed_processes(
    observed_processes: &Mutex<HashMap<String, ObservedGameProcess>>,
    replacement: HashMap<String, ObservedGameProcess>,
) {
    *observed_processes
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner) = replacement;
}

fn validate_stop_target(
    game: &InstalledGame,
    observed: &ObservedGameProcess,
    live: &RunningProcess,
) -> Result<(), String> {
    if !process_identity_matches_game_for_stop(game, &observed.name, &observed.exe_path) {
        return Err(
            "The observed process is no longer backed by this game's configured path. No process was stopped."
                .to_string(),
        );
    }
    if live.pid != Some(observed.pid)
        || live.start_time != Some(observed.start_time)
        || live.name != observed.name
        || live.exe_path.as_deref() != Some(observed.exe_path.as_str())
        || !live
            .exe_path
            .as_deref()
            .is_some_and(|path| process_identity_matches_game_for_stop(game, &live.name, path))
    {
        return Err(
            "The live process identity changed after observation. No process was stopped."
                .to_string(),
        );
    }
    Ok(())
}

fn running_process_from_sysinfo(pid: sysinfo::Pid, process: &sysinfo::Process) -> RunningProcess {
    RunningProcess {
        name: normalize_process_name(&process.name().to_string_lossy()),
        exe_path: process
            .exe()
            .map(|path| normalize_path(&path.to_string_lossy())),
        pid: Some(pid.as_u32()),
        start_time: Some(process.start_time()),
        uptime_seconds: Some(process.run_time()),
        window: None,
    }
}

fn refresh_single_process(system: &mut sysinfo::System, pid: sysinfo::Pid) {
    system.refresh_processes_specifics(
        sysinfo::ProcessesToUpdate::Some(&[pid]),
        true,
        sysinfo::ProcessRefreshKind::nothing().with_exe(sysinfo::UpdateKind::Always),
    );
}

#[tauri::command]
pub fn stop_game(
    poller: tauri::State<'_, PlaytimePoller>,
    game_id: String,
) -> Result<StopGameResponse, String> {
    let game_id = normalize_game_id(game_id)?;
    let game = read_installed_games_cache_result()?
        .into_iter()
        .find(|game| game.id == game_id)
        .ok_or_else(|| format!("Game '{game_id}' was not found."))?;
    let observed = poller
        .observed_processes
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .get(&game_id)
        .cloned()
        .ok_or_else(|| {
            "No path-verified running process has been observed for this game. No process was stopped."
                .to_string()
        })?;

    let pid = sysinfo::Pid::from_u32(observed.pid);
    let mut system = sysinfo::System::new();
    refresh_single_process(&mut system, pid);
    let process = system.process(pid).ok_or_else(|| {
        "The observed game process is no longer running. No process was stopped.".to_string()
    })?;
    let live = running_process_from_sysinfo(pid, process);
    validate_stop_target(&game, &observed, &live)?;

    if !process.kill() {
        return Err("The operating system refused to stop the verified game process.".to_string());
    }

    let mut stopped = false;
    for _ in 0..30 {
        thread::sleep(Duration::from_millis(100));
        refresh_single_process(&mut system, pid);
        match system.process(pid) {
            None => {
                stopped = true;
                break;
            }
            Some(process)
                if process.start_time() != observed.start_time
                    || process
                        .exe()
                        .map(|path| normalize_path(&path.to_string_lossy()))
                        .as_deref()
                        != Some(observed.exe_path.as_str()) =>
            {
                stopped = true;
                break;
            }
            Some(_) => {}
        }
    }

    if !stopped {
        return Err(
            "The verified stop request was sent, but the process is still running.".to_string(),
        );
    }

    poller
        .observed_processes
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .remove(&game_id);

    Ok(StopGameResponse {
        game_id,
        success: true,
        pid: observed.pid,
        message: format!("{} was stopped.", game.title),
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
    use windows_sys::core::BOOL;
    use windows_sys::Win32::Foundation::{HWND, LPARAM};
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
        if title.as_deref().is_none_or(|value| value.trim().is_empty()) {
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
    #[cfg(target_os = "linux")]
    {
        linux_collect_process_windows()
    }
    #[cfg(not(target_os = "linux"))]
    {
        HashMap::new()
    }
}

/// Collect window titles for running processes on Linux.
///
/// Tries, in order:
/// 1. Hyprland (Wayland): `hyprctl clients -j` exposes `pid`, `title`, `class`
///    for every mapped window — fast, no external daemon, works under Wayland.
/// 2. X11 (XWayland or plain X): `xdotool search --onlyvisible --name ".*"`
///    enumerates visible X windows and `xdotool getwindowname`/`getwindowpid`
///    resolves title + pid.
///
/// Falls back to an empty map when neither backend is available, so the playtime
/// poller still tracks games by process name (the previous Linux behaviour).
#[cfg(target_os = "linux")]
fn linux_collect_process_windows() -> HashMap<u32, GameWindowInfo> {
    let hyprland = hyprland_process_windows();
    if !hyprland.is_empty() {
        return hyprland;
    }
    x11_process_windows()
}

/// Parse `hyprctl clients -j`: an array of client objects with `pid`, `title`,
/// `class`, `mapped`. Only mapped (on-screen) windows count. If a process has
/// several windows, the first mapped one wins.
#[cfg(target_os = "linux")]
fn hyprland_process_windows() -> HashMap<u32, GameWindowInfo> {
    let output = match std::process::Command::new("hyprctl")
        .args(["clients", "-j"])
        .output()
    {
        Ok(output) if output.status.success() => output,
        _ => return HashMap::new(),
    };
    parse_hyprctl_clients(&output.stdout)
}

/// Parse the `hyprctl clients -j` payload into pid → window info.
///
/// Only mapped windows with a valid pid and a non-empty title (falling back to
/// the window class) are kept. The first mapped window per pid wins.
#[cfg(target_os = "linux")]
fn parse_hyprctl_clients(stdout: &[u8]) -> HashMap<u32, GameWindowInfo> {
    #[derive(serde::Deserialize)]
    struct HyprClient {
        #[serde(default)]
        mapped: bool,
        #[serde(default)]
        pid: i32,
        #[serde(default)]
        title: String,
        #[serde(default)]
        class: String,
    }

    let clients: Vec<HyprClient> = match serde_json::from_slice(stdout) {
        Ok(clients) => clients,
        Err(_) => return HashMap::new(),
    };

    let mut windows = HashMap::new();
    for client in clients {
        if !client.mapped || client.pid <= 0 {
            continue;
        }
        let pid = client.pid as u32;
        if windows.contains_key(&pid) {
            continue;
        }
        let title = if client.title.trim().is_empty() {
            client.class
        } else {
            client.title
        };
        let title = title.trim().to_string();
        if title.is_empty() {
            continue;
        }
        windows.insert(
            pid,
            GameWindowInfo {
                handle: format!("hypr:0x{:x}", pid),
                title: Some(title),
            },
        );
    }
    windows
}

/// X11 fallback via `xdotool`: enumerate visible windows, resolve pid + title.
/// Returns an empty map when `xdotool` is missing or X is unreachable.
#[cfg(target_os = "linux")]
fn x11_process_windows() -> HashMap<u32, GameWindowInfo> {
    let mut windows = HashMap::new();

    // `xdotool search --onlyvisible --name ".*"` prints one window id per line.
    let ids_output = match std::process::Command::new("xdotool")
        .args(["search", "--onlyvisible", "--name", ".*"])
        .output()
    {
        Ok(output) if output.status.success() => output,
        _ => return windows,
    };
    let ids_stdout = String::from_utf8_lossy(&ids_output.stdout);
    for line in ids_stdout.lines() {
        let window_id = line.trim();
        if window_id.is_empty() {
            continue;
        }
        // Get the owning pid (empty/failure → skip; a game window must own a pid).
        let pid_output = std::process::Command::new("xdotool")
            .args(["getwindowpid", window_id])
            .output();
        let Ok(pid_output) = pid_output else {
            continue;
        };
        if !pid_output.status.success() {
            continue;
        }
        let pid_text = String::from_utf8_lossy(&pid_output.stdout);
        let Ok(pid) = pid_text.trim().parse::<u32>() else {
            continue;
        };
        if windows.contains_key(&pid) {
            continue;
        }
        let name_output = std::process::Command::new("xdotool")
            .args(["getwindowname", window_id])
            .output();
        let Ok(name_output) = name_output else {
            continue;
        };
        let title = String::from_utf8_lossy(&name_output.stdout)
            .trim()
            .to_string();
        if title.is_empty() {
            continue;
        }
        windows.insert(
            pid,
            GameWindowInfo {
                handle: window_id.to_string(),
                title: Some(title),
            },
        );
    }
    windows
}

pub fn record_game_launch_started(game_id: &str) -> Option<GameActivityUpdate> {
    update_cached_game_activity(game_id, Some(current_unix_timestamp()), None)
}

fn first_running_activity_update(
    was_running: bool,
    game: &InstalledGame,
) -> Option<(Option<String>, u32)> {
    (!was_running).then(|| (game.last_played_at.clone(), 0))
}

fn apply_game_activity_update(
    game: &mut InstalledGame,
    last_played: Option<String>,
    add_playtime_minutes: u32,
) {
    let has_observed_activity = last_played.is_some();
    if has_observed_activity {
        game.last_played_at = last_played;
    }
    if has_observed_activity || add_playtime_minutes > 0 {
        game.playtime_minutes = Some(
            game.playtime_minutes
                .unwrap_or_default()
                .saturating_add(add_playtime_minutes),
        );
    }
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
    let last_played = last_played.map(unix_timestamp_to_iso);
    match update_installed_game_cache(game_id, move |game| {
        apply_game_activity_update(game, last_played, add_playtime_minutes.unwrap_or_default());
        Ok(())
    }) {
        Ok(game) => Some(GameActivityUpdate {
            game_id: game.id,
            last_played: game.last_played_at,
            playtime_minutes: game.playtime_minutes,
        }),
        Err(error) => {
            eprintln!(
                "[open-game-launcher] Could not update cached activity for {game_id}: {error}"
            );
            None
        }
    }
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

    fn test_active_session(started_at: i64, total_seconds: u32) -> ActiveGameSession {
        ActiveGameSession {
            accumulated_seconds: total_seconds % 60,
            started_at,
            total_seconds,
            process: RunningProcess {
                name: "game.exe".to_string(),
                exe_path: Some("/games/test/game.exe".to_string()),
                pid: Some(4242),
                start_time: Some(100),
                uptime_seconds: Some(total_seconds as u64),
                window: None,
            },
        }
    }

    #[test]
    fn activity_timestamp_initializes_zero_minute_provenance() {
        let mut game = test_game();
        let played_at = "2026-07-12T20:00:00Z".to_string();

        apply_game_activity_update(&mut game, Some(played_at.clone()), 0);

        assert_eq!(game.last_played_at, Some(played_at));
        assert_eq!(game.playtime_minutes, Some(0));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn hyprctl_parser_maps_mapped_windows_by_pid() {
        let json = br#"[
            {"mapped": true, "pid": 1001, "title": "Game One", "class": "game-one"},
            {"mapped": true, "pid": 1002, "title": "", "class": "game-two"},
            {"mapped": false, "pid": 1003, "title": "Hidden", "class": "hidden"}
        ]"#;

        let windows = parse_hyprctl_clients(json);

        assert_eq!(windows.len(), 2);
        assert_eq!(
            windows.get(&1001).and_then(|w| w.title.as_deref()),
            Some("Game One")
        );
        // Empty title falls back to the class name.
        assert_eq!(
            windows.get(&1002).and_then(|w| w.title.as_deref()),
            Some("game-two")
        );
        // Unmapped windows are excluded.
        assert!(windows.get(&1003).is_none());
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn hyprctl_parser_keeps_first_window_per_pid_and_ignores_garbage() {
        let json = br#"[
            {"mapped": true, "pid": 2001, "title": "First", "class": "a"},
            {"mapped": true, "pid": 2001, "title": "Second", "class": "a"},
            {"mapped": true, "pid": 0, "title": "NoPid", "class": "n"}
        ]"#;

        let windows = parse_hyprctl_clients(json);

        assert_eq!(windows.len(), 1);
        assert_eq!(
            windows.get(&2001).and_then(|w| w.title.as_deref()),
            Some("First")
        );
        // pid <= 0 is skipped.
        assert!(windows.get(&0).is_none());
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn hyprctl_parser_returns_empty_map_for_invalid_json() {
        assert!(parse_hyprctl_clients(b"not json").is_empty());
    }

    #[test]
    fn first_running_observation_schedules_zero_minute_activity() {
        let mut game = test_game();
        game.last_played_at = Some("2026-07-12T20:00:00Z".to_string());

        assert_eq!(
            first_running_activity_update(false, &game),
            Some((game.last_played_at.clone(), 0))
        );
        assert_eq!(first_running_activity_update(true, &game), None);
    }

    #[test]
    fn shutdown_flush_finalizes_every_active_session() {
        let mut active_sessions = HashMap::from([
            ("game-one".to_string(), test_active_session(100, 20)),
            ("game-two".to_string(), test_active_session(200, 80)),
        ]);
        let mut finalized = Vec::new();

        drain_active_sessions(&mut active_sessions, |game_id, session| {
            finalized.push((game_id.to_string(), session.total_seconds));
        });
        finalized.sort();

        assert!(active_sessions.is_empty());
        assert_eq!(
            finalized,
            vec![("game-one".to_string(), 20), ("game-two".to_string(), 80)]
        );
    }

    #[test]
    fn normal_stop_then_shutdown_finalizes_each_session_exactly_once() {
        let mut active_sessions = HashMap::from([
            ("normal-stop".to_string(), test_active_session(100, 60)),
            ("shutdown".to_string(), test_active_session(200, 30)),
        ]);
        let mut finalization_counts = HashMap::<String, usize>::new();
        let mut count_finalization = |game_id: &str, _session: &ActiveGameSession| {
            *finalization_counts.entry(game_id.to_string()).or_default() += 1;
        };

        assert!(finalize_active_session(
            &mut active_sessions,
            "normal-stop",
            &mut count_finalization,
        )
        .is_some());
        drain_active_sessions(&mut active_sessions, &mut count_finalization);
        drain_active_sessions(&mut active_sessions, &mut count_finalization);
        assert!(finalize_active_session(
            &mut active_sessions,
            "normal-stop",
            &mut count_finalization,
        )
        .is_none());

        assert_eq!(finalization_counts.get("normal-stop"), Some(&1));
        assert_eq!(finalization_counts.get("shutdown"), Some(&1));
    }

    #[test]
    fn shutdown_signal_wakes_poller_promptly() {
        use std::time::Instant;

        let (shutdown_tx, shutdown_rx) = mpsc::channel();
        let (ready_tx, ready_rx) = mpsc::channel();
        let worker = thread::spawn(move || {
            let started = Instant::now();
            ready_tx.send(()).unwrap();
            let reason = wait_for_poll_or_shutdown(&shutdown_rx, PLAYTIME_POLL_INTERVAL);
            (reason, started.elapsed())
        });

        ready_rx.recv_timeout(Duration::from_secs(1)).unwrap();
        let signal_started = Instant::now();
        shutdown_tx.send(()).unwrap();
        let (reason, total_wait) = worker.join().unwrap();

        assert_eq!(reason, PollerWakeReason::Shutdown);
        assert!(
            signal_started.elapsed() < Duration::from_secs(2),
            "shutdown signal was not handled promptly"
        );
        assert!(
            total_wait < Duration::from_secs(2),
            "poller waited {total_wait:?} instead of waking for shutdown"
        );
    }

    #[test]
    fn game_lifecycle_event_detects_started_transition() {
        let game = test_game();
        let process = RunningProcess {
            exe_path: Some("/games/test/game.exe".to_string()),
            name: "game.exe".to_string(),
            pid: Some(4242),
            start_time: Some(100),
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
            start_time: Some(100),
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
            start_time: Some(100),
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

    #[test]
    fn process_match_rejects_same_name_from_another_install_path() {
        let game = test_game();
        let processes = vec![RunningProcess {
            exe_path: Some("/games/other/game.exe".to_string()),
            name: "game.exe".to_string(),
            pid: Some(99),
            start_time: Some(100),
            uptime_seconds: Some(10),
            window: None,
        }];

        assert!(find_running_game_process(&game, &processes).is_none());
    }

    #[test]
    fn process_match_accepts_normalized_executable_path() {
        let game = test_game();
        let processes = vec![RunningProcess {
            exe_path: Some("/games/test/game.exe".to_string()),
            name: "game.exe".to_string(),
            pid: Some(42),
            start_time: Some(100),
            uptime_seconds: Some(10),
            window: None,
        }];

        assert_eq!(
            find_running_game_process(&game, &processes).and_then(|process| process.pid),
            Some(42)
        );
    }

    #[test]
    fn process_match_uses_name_only_when_no_path_identity_exists() {
        let mut game = test_game();
        game.install_path = None;
        game.executable_path = None;
        let processes = vec![RunningProcess {
            exe_path: Some("/unknown/game.exe".to_string()),
            name: "game.exe".to_string(),
            pid: Some(7),
            start_time: Some(100),
            uptime_seconds: Some(10),
            window: None,
        }];

        assert_eq!(
            find_running_game_process(&game, &processes).and_then(|process| process.pid),
            Some(7)
        );
    }

    #[test]
    fn stop_observation_never_promotes_a_name_only_match() {
        let mut game = test_game();
        game.install_path = None;
        game.executable_path = None;
        let process = RunningProcess {
            exe_path: Some("/unknown/game.exe".to_string()),
            name: "game.exe".to_string(),
            pid: Some(7),
            start_time: Some(100),
            uptime_seconds: Some(10),
            window: None,
        };

        assert!(find_running_game_process(&game, std::slice::from_ref(&process)).is_some());
        assert!(observed_process_for_safe_stop(&game, &process).is_none());
    }

    #[test]
    fn process_match_prefers_the_configured_executable_over_a_helper_in_the_install_root() {
        let game = test_game();
        let helper = RunningProcess {
            exe_path: Some("/games/test/crash-reporter.exe".to_string()),
            name: "crash-reporter.exe".to_string(),
            pid: Some(8),
            start_time: Some(80),
            uptime_seconds: Some(10),
            window: None,
        };
        let executable = RunningProcess {
            exe_path: Some("/games/test/game.exe".to_string()),
            name: "game.exe".to_string(),
            pid: Some(9),
            start_time: Some(90),
            uptime_seconds: Some(10),
            window: None,
        };

        assert!(observed_process_for_safe_stop(&game, &helper).is_none());
        assert_eq!(
            find_running_game_process(&game, &[helper, executable]).and_then(|process| process.pid),
            Some(9)
        );
    }

    #[test]
    fn stop_target_validation_requires_the_same_pid_path_and_start_time() {
        let game = test_game();
        let observed = ObservedGameProcess {
            pid: 42,
            name: "game.exe".to_string(),
            exe_path: "/games/test/game.exe".to_string(),
            start_time: 100,
        };
        let exact = RunningProcess {
            exe_path: Some("/games/test/game.exe".to_string()),
            name: "game.exe".to_string(),
            pid: Some(42),
            start_time: Some(100),
            uptime_seconds: Some(10),
            window: None,
        };

        assert!(validate_stop_target(&game, &observed, &exact).is_ok());

        let mut reused_pid = exact.clone();
        reused_pid.start_time = Some(101);
        assert!(validate_stop_target(&game, &observed, &reused_pid).is_err());

        let mut replaced_path = exact;
        replaced_path.exe_path = Some("/games/other/game.exe".to_string());
        assert!(validate_stop_target(&game, &observed, &replaced_path).is_err());
    }
}
