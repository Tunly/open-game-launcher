use std::process::Child;
use std::{collections::HashMap, thread, time::Instant};
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

            // Collect all running process paths
            let mut running_exe_paths = Vec::new();
            for (_pid, process) in sys.processes() {
                if let Some(exe_path) = process.exe() {
                    running_exe_paths.push(exe_path.to_string_lossy().to_lowercase());
                }
            }

            let mut games_updated = false;
            let mut updated_cache = cached_games.clone();

            for game in updated_cache.iter_mut() {
                let Some(install_path) = &game.install_path else {
                    continue;
                };
                let norm_install_path = install_path.replace("\\", "/").to_lowercase();

                // Check if any running process resides under this game's install path
                let is_running = running_exe_paths.iter().any(|exe_path| {
                    let norm_exe = exe_path.replace("\\", "/");
                    norm_exe.starts_with(&norm_install_path)
                });

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

pub fn record_game_launch_started(game_id: &str) -> Option<GameActivityUpdate> {
    update_cached_game_activity(game_id, Some(current_unix_timestamp()), None)
}

pub fn record_game_play_session_when_finished(app: AppHandle, game_id: String, mut child: Child) {
    thread::spawn(move || {
        let started_at = Instant::now();
        if child.wait().is_err() {
            return;
        }

        let elapsed_seconds = started_at.elapsed().as_secs();
        let played_minutes = ((elapsed_seconds + 59) / 60).max(1).min(u32::MAX as u64) as u32;
        if let Some(update) = update_cached_game_activity(
            &game_id,
            Some(current_unix_timestamp()),
            Some(played_minutes),
        ) {
            emit_game_activity_update(&app, &update);
        }
    });
}

pub fn update_cached_game_activity(
    game_id: &str,
    last_played: Option<u64>,
    add_playtime_minutes: Option<u32>,
) -> Option<GameActivityUpdate> {
    let mut games = read_installed_games_cache().unwrap_or_default();
    let Some(game) = games.iter_mut().find(|game| game.id == game_id) else {
        return None;
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
