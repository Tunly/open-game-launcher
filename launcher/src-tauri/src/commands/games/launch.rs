//! Game launch: the `launch_game` command, executable discovery heuristics,
//! and the centralised `open_uri` wrapper. Split out of `core.rs`;
//! re-exported through `games/mod.rs`.

use std::{
    fs,
    path::{Path, PathBuf},
    process::{Child, Command},
};
use tauri::{AppHandle, Emitter};

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

use super::core::{list_installed_games, normalize_game_id, path_to_string};
use super::playtime::{
    emit_game_activity_update, record_game_launch_started, record_game_play_session_when_finished,
};
use super::types::*;

#[tauri::command]
pub async fn launch_game(app: AppHandle, game_id: String) -> Result<LaunchGameResponse, String> {
    let game_id = normalize_game_id(game_id)?;
    println!("[open-game-launcher] launch_game requested for {game_id}");

    if game_id.starts_with("gog-owned-") {
        let gog_id = game_id.strip_prefix("gog-owned-").unwrap_or(&game_id);

        // Check if the game is already installed locally
        let installed_games = list_installed_games().await.unwrap_or_default();
        let local_match = installed_games
            .iter()
            .find(|g| g.launcher == "gog" && g.external_id.as_deref() == Some(gog_id));

        if let Some(installed_game) = local_match {
            // Game is installed — launch it locally
            if let Some(ref path) = installed_game.install_path {
                let install_dir = std::path::PathBuf::from(path);
                if let Some(exe) = find_gog_executable(&install_dir, gog_id) {
                    let child = std::process::Command::new(&exe)
                        .current_dir(&install_dir)
                        .spawn()
                        .map_err(|e| format!("Failed to launch GOG game: {e}"))?;
                    if let Some(update) = record_game_launch_started(&installed_game.id) {
                        emit_game_activity_update(&app, &update);
                    }
                    record_game_play_session_when_finished(app, installed_game.id.clone(), child);
                    return Ok(LaunchGameResponse {
                        game_id: game_id.clone(),
                        success: true,
                        message: format!("{} is starting.", installed_game.title),
                    });
                }
            }
            // Fall through to download if launch fails
        }

        // The native path only stages the official installer. Await queue creation so
        // authentication/bootstrap failures are returned instead of reported as success.
        crate::commands::gog::gog_start_download_for_game_id(
            app.clone(),
            gog_id.to_string(),
            game_id.clone(),
            None,
        )
        .await?;
        let _ = app.emit(
            "gog_download_started",
            serde_json::json!({ "gogId": gog_id }),
        );

        return Ok(LaunchGameResponse {
            game_id: game_id.clone(),
            success: true,
            message: "GOG installer download queued. Installation is not automatic.".to_string(),
        });
    }

    if game_id.starts_with("epic-owned-") {
        let epic_id = game_id.strip_prefix("epic-owned-").unwrap_or(&game_id);
        let legendary_path = crate::commands::epic::ensure_legendary_binary()
            .await
            .map_err(|error| format!("Could not prepare Legendary: {error}"))?;
        std::process::Command::new(legendary_path)
            .arg("launch")
            .arg(epic_id)
            .spawn()
            .map_err(|error| format!("Could not start Legendary for '{epic_id}': {error}"))?;

        return Ok(LaunchGameResponse {
            game_id: game_id.clone(),
            success: true,
            message: "Launch command started via Legendary.".to_string(),
        });
    }

    if game_id.starts_with("steam-owned-") {
        let steam_id = game_id.strip_prefix("steam-owned-").unwrap_or(&game_id);
        let uri = format!("steam://install/{steam_id}");
        open_uri(&uri).map_err(|e| format!("Could not start Steam: {e}"))?;
        return Ok(LaunchGameResponse {
            game_id: game_id.clone(),
            success: true,
            message: "Installation started in Steam.".to_string(),
        });
    }

    let game = list_installed_games()
        .await?
        .into_iter()
        .find(|game| game.id == game_id)
        .ok_or_else(|| format!("Game '{game_id}' was not found."))?;

    let child = launch_installed_game(&game)?;
    if let Some(update) = record_game_launch_started(&game.id) {
        emit_game_activity_update(&app, &update);
    }
    if let Some(child) = child {
        record_game_play_session_when_finished(app, game.id.clone(), child);
    }

    Ok(LaunchGameResponse {
        game_id,
        success: true,
        message: format!("{} is starting.", game.title),
    })
}

pub fn launch_installed_game(game: &InstalledGame) -> Result<Option<Child>, String> {
    if let Some(uri) = &game.launch_uri {
        open_uri(uri).map_err(|error| format!("Could not launch {}: {error}", game.title))?;
        return Ok(None);
    }

    let Some(install_path) = game.install_path.as_ref().map(PathBuf::from) else {
        return Err(format!("No launch path found for {}.", game.title));
    };

    let executable = find_launch_executable(&install_path, &game.title)
        .ok_or_else(|| format!("No matching .exe found for {}.", game.title))?;
    let working_dir = executable.parent().unwrap_or(&install_path);

    let mut cmd = Command::new(&executable);
    cmd.current_dir(working_dir);

    cmd.spawn().map(Some).map_err(|error| error.to_string())
}

pub fn open_uri(uri: &str) -> std::io::Result<()> {
    // Centralised through `uri_safety::open_uri_safely` so the same
    // scheme allowlist and shell-free executor are used everywhere.
    // The historical `cmd /C start "" <uri>` was a command-injection
    // sink and is no longer reachable from this binary.
    let _ = crate::commands::uri_safety::validate_uri_scheme(uri).map_err(std::io::Error::other)?;
    crate::commands::uri_safety::open_uri_safely(uri).map_err(std::io::Error::other)
}

pub fn is_file_executable(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }

    #[cfg(unix)]
    {
        return fs::metadata(path)
            .map(|metadata| metadata.permissions().mode() & 0o111 != 0)
            .unwrap_or(false);
    }

    #[cfg(target_os = "windows")]
    {
        return path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| {
                extension.eq_ignore_ascii_case("exe")
                    || extension.eq_ignore_ascii_case("bat")
                    || extension.eq_ignore_ascii_case("cmd")
            });
    }

    #[allow(unreachable_code)]
    false
}

pub(crate) fn resolve_manual_game_executable(path: &Path, title: &str) -> Result<PathBuf, String> {
    find_launch_executable(path, title).ok_or_else(|| {
        if path.is_file() {
            format!(
                "Selected file is not a supported executable for {}.",
                current_platform_name()
            )
        } else {
            format!(
                "No supported executable was found in the selected {} folder.",
                current_platform_name()
            )
        }
    })
}

fn current_platform_name() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        return "Windows";
    }
    #[cfg(target_os = "macos")]
    {
        return "macOS";
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        return "Linux";
    }
    #[allow(unreachable_code)]
    "this platform"
}

pub fn find_launch_executable(install_path: &Path, title: &str) -> Option<PathBuf> {
    if is_file_executable(install_path) {
        return Some(install_path.to_path_buf());
    }

    let title_score = normalize_executable_name(title);
    let mut candidates = Vec::new();
    collect_executable_candidates(install_path, 0, &mut candidates);

    candidates
        .into_iter()
        .filter(|path| !is_ignored_executable(path))
        .max_by_key(|path| executable_score(path, &title_score))
}

fn find_gog_executable(install_path: &Path, gog_id: &str) -> Option<PathBuf> {
    // Try to read the goggame-*.info manifest first
    let info_pattern = format!("goggame-{}.info", gog_id);
    let info_path = install_path.join(&info_pattern);

    if info_path.exists() {
        if let Ok(contents) = fs::read_to_string(&info_path) {
            if let Ok(manifest) = serde_json::from_str::<serde_json::Value>(&contents) {
                // Look for play tasks
                if let Some(play_tasks) = manifest.get("playTasks").and_then(|v| v.as_array()) {
                    for task in play_tasks {
                        if task.get("isPrimary").and_then(|v| v.as_bool()) == Some(true) {
                            if let Some(path) = task.get("path").and_then(|v| v.as_str()) {
                                let exe_path = install_path.join(path);
                                if exe_path.exists() {
                                    return Some(exe_path);
                                }
                            }
                            // Some manifests use "workingDir" + exe name
                            if let Some(exe) = task.get("exec").and_then(|v| v.as_str()) {
                                let exe_path = install_path.join(exe);
                                if exe_path.exists() {
                                    return Some(exe_path);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Fallback: search for executables matching the game name
    find_launch_executable(install_path, &gog_id.replace('-', " "))
}

fn collect_executable_candidates(path: &Path, depth: usize, candidates: &mut Vec<PathBuf>) {
    if depth > 3 {
        return;
    }

    let Ok(entries) = fs::read_dir(path) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            let normalized = name.to_lowercase();
            if matches!(
                normalized.as_str(),
                "_commonredist" | "redist" | "redistributables" | "support" | "tools"
            ) {
                continue;
            }
            collect_executable_candidates(&path, depth + 1, candidates);
        } else if is_file_executable(&path) {
            candidates.push(path);
        }
    }
}

fn executable_score(path: &Path, title_score: &str) -> i32 {
    let Some(stem) = path.file_stem().and_then(|stem| stem.to_str()) else {
        return 0;
    };

    let normalized = normalize_executable_name(stem);
    let mut score = 10;

    if normalized == title_score {
        score += 100;
    } else if normalized.contains(title_score) || title_score.contains(&normalized) {
        score += 60;
    }

    if let Some(parent) = path
        .parent()
        .and_then(|parent| parent.file_name())
        .and_then(|name| name.to_str())
    {
        let parent = parent.to_lowercase();
        if matches!(parent.as_str(), "bin" | "binaries" | "win64" | "x64") {
            score += 10;
        }
    }

    score
}

fn is_ignored_executable(path: &Path) -> bool {
    path.file_stem()
        .and_then(|stem| stem.to_str())
        .map(|stem| {
            let normalized = stem.to_lowercase();
            normalized.contains("unins")
                || normalized.contains("setup")
                || normalized.contains("install")
                || normalized.contains("crash")
                || normalized.contains("redist")
                || normalized.contains("vcredist")
                || normalized.contains("dxsetup")
        })
        .unwrap_or(true)
}

fn normalize_executable_name(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    use super::super::current_unix_timestamp;

    fn unique_temp_dir(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "ogl-{name}-{}-{}",
            std::process::id(),
            current_unix_timestamp()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn manual_game_path_rejects_non_executable_files() {
        let root = unique_temp_dir("manual-non-executable");
        let notes = root.join("release-notes.txt");
        fs::write(&notes, b"not a game").unwrap();

        let error = resolve_manual_game_executable(&notes, "Release Notes").unwrap_err();

        assert!(error.contains("not a supported executable"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn manual_game_path_accepts_a_platform_executable() {
        let root = unique_temp_dir("manual-executable");
        #[cfg(target_os = "windows")]
        let executable = root.join("actual-game.exe");
        #[cfg(unix)]
        let executable = root.join("actual-game");
        fs::write(&executable, b"game binary fixture").unwrap();
        #[cfg(unix)]
        fs::set_permissions(&executable, fs::Permissions::from_mode(0o755)).unwrap();

        assert_eq!(
            resolve_manual_game_executable(&executable, "Actual Game").unwrap(),
            executable
        );
        let _ = fs::remove_dir_all(root);
    }
}
