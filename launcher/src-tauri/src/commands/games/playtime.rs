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
        let mut active_sessions = HashMap::<String, u32>::new();

        loop {
            thread::sleep(std::time::Duration::from_secs(10));

            // Refresh processes (just executables/paths to be fast)
            sys.refresh_processes_specifics(
                sysinfo::ProcessesToUpdate::All,
                sysinfo::ProcessRefreshKind::new().with_exe(sysinfo::UpdateKind::Always),
            );

            let cached_games = read_installed_games_cache().unwrap_or_default();
            if cached_games.is_empty() {
                continue;
            }

            // Collect running process identities once per poll. Games can be
            // identified by path, executable path, or launcher-provided names.
            let mut running_processes = Vec::new();
            #[allow(clippy::for_kv_map)]
            for (_pid, process) in sys.processes() {
                let process_name = normalize_process_name(&process.name().to_string_lossy());
                if let Some(exe_path) = process.exe() {
                    running_processes.push(RunningProcess {
                        name: process_name,
                        exe_path: Some(normalize_path(&exe_path.to_string_lossy())),
                    });
                } else {
                    running_processes.push(RunningProcess {
                        name: process_name,
                        exe_path: None,
                    });
                }
            }

            let mut games_updated = false;
            let mut updated_cache = cached_games.clone();

            for game in updated_cache.iter_mut() {
                let is_running = is_game_running(game, &running_processes);

                if is_running {
                    // Increment session time
                    let secs = active_sessions.entry(game.id.clone()).or_insert(0);
                    *secs += 10;

                    // Update last played time to now
                    let now = current_unix_timestamp();
                    game.last_played_at = Some(unix_timestamp_to_iso(now));

                    if *secs >= 60 {
                        // Increment playtime minutes
                        let current_min = game.playtime_minutes.unwrap_or_default();
                        game.playtime_minutes = Some(current_min + 1);
                        *secs = 0; // reset seconds accumulator
                        games_updated = true;
                    }
                } else {
                    // Game is not running. If it was previously running, we reset session
                    if active_sessions.remove(&game.id).is_some() {
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

#[derive(Debug)]
struct RunningProcess {
    name: String,
    exe_path: Option<String>,
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

fn is_game_running(game: &InstalledGame, running_processes: &[RunningProcess]) -> bool {
    let install_path = game.install_path.as_ref().map(|path| normalize_path(path));
    let executable_path = game
        .executable_path
        .as_ref()
        .map(|path| normalize_path(path));
    let process_names = process_name_candidates(game);

    if install_path.is_none() && executable_path.is_none() && process_names.is_empty() {
        return false;
    }

    running_processes.iter().any(|process| {
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
