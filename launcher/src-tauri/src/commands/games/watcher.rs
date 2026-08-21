//! Library inventory file watcher: watches provider install roots and the OG
//! managed games folder, debounces events, and refreshes the library cache.
//! Split out of `core.rs`; re-exported through `games/mod.rs`.

use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::mpsc,
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter};

use super::core::{
    env_path, local_drive_roots, open_game_launcher_data_dir, path_is_within_root,
    read_installed_games_cache, refresh_installed_games,
};
use super::detect::{
    find_steam_dir, read_battlenet_registry_installs, read_ea_registry_installs,
    read_gog_registry_installs, read_steam_library_folders, read_ubisoft_registry_installs,
};
use super::types::*;

pub fn start_library_inventory_watcher(app_handle: AppHandle) {
    thread::spawn(move || {
        let (tx, rx) = mpsc::channel();
        let watcher_result = RecommendedWatcher::new(
            move |result| {
                let _ = tx.send(result);
            },
            Config::default(),
        );

        let Ok(mut watcher) = watcher_result else {
            eprintln!("[open-game-launcher] Failed to start library inventory watcher.");
            return;
        };

        let mut watched_paths = HashSet::new();
        let watched_count = watch_library_inventory_paths(&mut watcher, &mut watched_paths);
        if watched_count == 0 {
            eprintln!("[open-game-launcher] Library inventory watcher has no paths to watch.");
        }

        while let Ok(result) = rx.recv() {
            let event = match result {
                Ok(event) => event,
                Err(error) => {
                    eprintln!("[open-game-launcher] Library watcher event error: {error}");
                    continue;
                }
            };
            if !inventory_event_should_refresh(
                &event.paths,
                open_game_launcher_data_dir().as_deref(),
            ) {
                continue;
            }

            while rx.recv_timeout(Duration::from_secs(2)).is_ok() {}

            match tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
            {
                Ok(runtime) => match runtime.block_on(refresh_installed_games()) {
                    Ok(games) => {
                        watch_library_inventory_paths(&mut watcher, &mut watched_paths);
                        let _ = app_handle.emit(
                            "library_inventory_changed",
                            LibraryInventoryChanged {
                                reason: "file_watcher".to_string(),
                                game_count: games.len(),
                            },
                        );
                    }
                    Err(error) => {
                        eprintln!("[open-game-launcher] Automatic library refresh failed: {error}");
                    }
                },
                Err(error) => {
                    eprintln!("[open-game-launcher] Failed to create watcher runtime: {error}");
                }
            }
        }
    });
}

fn watch_library_inventory_paths(
    watcher: &mut RecommendedWatcher,
    watched_paths: &mut HashSet<String>,
) -> usize {
    let mut watched_count = 0;

    for path in library_inventory_watch_paths() {
        let key = watch_path_key(&path);
        if !watched_paths.insert(key) {
            continue;
        }

        match watcher.watch(&path, RecursiveMode::Recursive) {
            Ok(()) => watched_count += 1,
            Err(error) => {
                eprintln!(
                    "[open-game-launcher] Failed to watch library path {}: {error}",
                    path.display()
                );
            }
        }
    }

    watched_count
}

fn watch_path_key(path: &Path) -> String {
    path.canonicalize()
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .to_lowercase()
}

fn library_inventory_watch_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    let launcher_data_dir = open_game_launcher_data_dir();

    if let Some(data_dir) = launcher_data_dir.as_ref() {
        // The data root also contains launcher.sqlite3 and multiple caches. Watching
        // it recursively makes every refresh write schedule another refresh. Managed
        // game installs remain a legitimate inventory root.
        paths.push(data_dir.join("games"));
    }

    if let Some(steam_dir) = find_steam_dir() {
        paths.push(steam_dir.join("steamapps"));
        paths.push(steam_dir.join("userdata"));
        for library in read_steam_library_folders(&steam_dir) {
            paths.push(library.join("steamapps"));
        }
    }

    if cfg!(target_os = "windows") {
        paths.push(PathBuf::from(
            r"C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests",
        ));
        paths.push(PathBuf::from(
            r"C:\ProgramData\Epic\EpicGamesLauncher\Data\Catalog",
        ));
        paths.push(PathBuf::from(r"C:\ProgramData\GOG.com\Galaxy\webcache"));
        paths.push(PathBuf::from(
            r"C:\ProgramData\Ubisoft\Ubisoft Game Launcher\cache",
        ));

        if let Some(program_files) = env_path("ProgramFiles") {
            paths.push(program_files.join("GOG Galaxy").join("Games"));
            paths.push(program_files.join("Ubisoft Game Launcher").join("games"));
        }

        if let Some(program_files_x86) = env_path("ProgramFiles(x86)") {
            paths.push(program_files_x86.join("GOG Galaxy").join("Games"));
            paths.push(
                program_files_x86
                    .join("Ubisoft")
                    .join("Ubisoft Game Launcher")
                    .join("games"),
            );
            paths.push(
                program_files_x86
                    .join("Ubisoft Game Launcher")
                    .join("games"),
            );
        }

        if let Some(local_app_data) = env_path("LOCALAPPDATA") {
            paths.push(
                local_app_data
                    .join("Ubisoft")
                    .join("Ubisoft Game Launcher")
                    .join("cache"),
            );
        }

        paths.push(PathBuf::from(r"C:\GOG Games"));
        paths.push(PathBuf::from(r"C:\Ubisoft Games"));

        for drive in local_drive_roots() {
            paths.push(drive.join("XboxGames"));
        }

        for install in read_gog_registry_installs() {
            paths.push(install.install_dir);
        }

        for install in read_ubisoft_registry_installs() {
            paths.push(install.install_dir);
        }

        for install in read_battlenet_registry_installs() {
            paths.push(install.install_dir);
        }

        for install in read_ea_registry_installs() {
            paths.push(install.install_dir);
        }
    }

    for game in read_installed_games_cache().unwrap_or_default() {
        if let Some(install_path) = game.install_path {
            paths.push(PathBuf::from(install_path));
        }
    }

    filter_library_inventory_watch_paths(paths, launcher_data_dir.as_deref())
}

fn filter_library_inventory_watch_paths(
    paths: Vec<PathBuf>,
    launcher_data_dir: Option<&Path>,
) -> Vec<PathBuf> {
    let paths = paths
        .into_iter()
        .filter(|path| !is_launcher_owned_non_game_path(path, launcher_data_dir))
        .collect();
    dedupe_existing_watch_paths(paths)
}

fn inventory_event_should_refresh(paths: &[PathBuf], launcher_data_dir: Option<&Path>) -> bool {
    paths.is_empty()
        || paths
            .iter()
            .any(|path| !is_launcher_owned_non_game_path(path, launcher_data_dir))
}

fn is_launcher_owned_non_game_path(path: &Path, launcher_data_dir: Option<&Path>) -> bool {
    let Some(data_dir) = launcher_data_dir else {
        return false;
    };
    let normalized_path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let normalized_data_dir = data_dir
        .canonicalize()
        .unwrap_or_else(|_| data_dir.to_path_buf());
    if !path_is_within_root(&normalized_path, &normalized_data_dir) {
        return false;
    }

    let games_dir = data_dir.join("games");
    let normalized_games_dir = games_dir.canonicalize().unwrap_or(games_dir);
    !path_is_within_root(&normalized_path, &normalized_games_dir)
}

fn dedupe_existing_watch_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    let mut unique = Vec::new();

    for path in paths {
        if !path.exists() {
            continue;
        }

        let key = path
            .canonicalize()
            .unwrap_or_else(|_| path.clone())
            .to_string_lossy()
            .to_lowercase();

        if seen.insert(key) {
            unique.push(path);
        }
    }

    unique
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::fs;

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
    fn inventory_watch_roots_exclude_launcher_data_but_keep_game_roots() {
        let root = unique_temp_dir("inventory-watch-roots");
        let data_dir = root.join("open-game-launcher");
        let managed_games = data_dir.join("games");
        let managed_game = managed_games.join("managed-game");
        let cache = data_dir.join("achievement-cache");
        let database = data_dir.join("launcher.sqlite3");
        let external_game = root.join("external-game");
        fs::create_dir_all(&managed_game).unwrap();
        fs::create_dir_all(&cache).unwrap();
        fs::create_dir_all(&external_game).unwrap();
        fs::write(&database, b"sqlite").unwrap();

        let roots = filter_library_inventory_watch_paths(
            vec![
                data_dir.clone(),
                database.clone(),
                cache.clone(),
                managed_games.clone(),
                managed_game.clone(),
                external_game.clone(),
            ],
            Some(&data_dir),
        );
        let keys = roots
            .iter()
            .map(|path| watch_path_key(path))
            .collect::<HashSet<_>>();

        assert!(!keys.contains(&watch_path_key(&data_dir)));
        assert!(!keys.contains(&watch_path_key(&database)));
        assert!(!keys.contains(&watch_path_key(&cache)));
        assert!(keys.contains(&watch_path_key(&managed_games)));
        assert!(keys.contains(&watch_path_key(&managed_game)));
        assert!(keys.contains(&watch_path_key(&external_game)));

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn inventory_events_ignore_sqlite_and_cache_writes_but_keep_game_changes() {
        let root = unique_temp_dir("inventory-watch-events");
        let data_dir = root.join("open-game-launcher");
        let sqlite = data_dir.join("launcher.sqlite3-wal");
        let cache_file = data_dir.join("client-cache").join("steam.json");
        let managed_game_file = data_dir.join("games").join("game-1").join("game.exe");
        let external_game_file = root.join("external-game").join("game.exe");

        assert!(!inventory_event_should_refresh(
            &[data_dir.clone(), sqlite, cache_file],
            Some(&data_dir),
        ));
        assert!(inventory_event_should_refresh(
            &[managed_game_file],
            Some(&data_dir),
        ));
        assert!(inventory_event_should_refresh(
            &[external_game_file],
            Some(&data_dir),
        ));

        fs::remove_dir_all(root).unwrap();
    }
}
