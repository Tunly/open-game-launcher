use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    env, fs, io,
    path::{Component, Path, PathBuf},
    process::{Child, Command},
    sync::mpsc,
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager};

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

use super::detect::{
    fetch_steam_achievements, find_local_banner_asset, find_local_icon_asset,
    find_local_logo_asset, find_steam_dir, read_battlenet_registry_installs,
    read_ea_registry_installs, read_gog_registry_installs, read_steam_library_folders,
    read_ubisoft_registry_installs, scan_installed_games, steam_app_id_for_game,
    sync_game_metadata,
};
use super::playtime::{
    emit_game_activity_update, record_game_launch_started, record_game_play_session_when_finished,
    update_cached_game_activity,
};
use super::types::*;

pub const OG_MANAGED_LATEST_VERSION: &str = "1.1.0";
pub const OG_MANAGED_MANIFEST_FILE: &str = "og-manifest.json";

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct OgManagedManifest {
    #[serde(default)]
    pub game_id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub managed_by: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub download_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub download_sha256: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub package_file: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub files: Vec<OgManagedManifestFile>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub executable_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OgManagedManifestFile {
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
}

#[tauri::command]
pub async fn list_installed_games() -> Result<Vec<InstalledGame>, String> {
    if let Some(games) = read_installed_games_cache() {
        return Ok(games);
    }

    refresh_installed_games().await
}

#[tauri::command]
pub async fn refresh_installed_games() -> Result<Vec<InstalledGame>, String> {
    let mut games = BTreeMap::<String, InstalledGame>::new();
    let cached_games = read_installed_games_cache().unwrap_or_default();
    let cached_activity = cached_games
        .iter()
        .map(|game| (game.id.clone(), game.clone()))
        .collect::<HashMap<_, _>>();

    for mut game in cached_games.into_iter().filter(is_manual_game) {
        if game.genres.is_empty() {
            game = sync_game_metadata(game).await;
        }
        games.insert(game.id.clone(), game);
    }

    for mut game in scan_installed_games() {
        if let Some(cached_game) = cached_activity.get(&game.id) {
            merge_cached_game_activity(&mut game, cached_game);
        }

        if game.genres.is_empty() {
            game = sync_game_metadata(game).await;
        }

        games.insert(game.id.clone(), game);
    }

    let games = games.into_values().collect::<Vec<_>>();
    write_installed_games_cache(&games);

    Ok(games)
}

#[tauri::command]
pub async fn add_manual_game(input: AddManualGameRequest) -> Result<InstalledGame, String> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err("Title must not be empty.".to_string());
    }

    let install_path = input.install_path.trim();
    if install_path.is_empty() {
        return Err("Install path must not be empty.".to_string());
    }

    let path = PathBuf::from(install_path);
    if !path.exists() {
        return Err(format!("Path was not found: {install_path}"));
    }

    let asset_root = if path.is_dir() {
        path.as_path()
    } else {
        path.parent().unwrap_or(path.as_path())
    };
    let mut game = installed_game(
        &format!("manual-{title}-{install_path}"),
        title.to_string(),
        "Manual".to_string(),
        Some(path.to_string_lossy().to_string()),
        find_local_banner_asset(asset_root),
    );
    game.icon_url = find_local_icon_asset(asset_root);
    game.logo_url = find_local_logo_asset(asset_root);

    game = sync_game_metadata(game).await;

    let mut games = BTreeMap::<String, InstalledGame>::new();
    for cached_game in read_installed_games_cache().unwrap_or_default() {
        games.insert(cached_game.id.clone(), cached_game);
    }
    games.insert(game.id.clone(), game.clone());

    let games = games.into_values().collect::<Vec<_>>();
    write_installed_games_cache(&games);

    Ok(game)
}

#[tauri::command]
pub fn update_game_metadata(input: UpdateGameMetadataRequest) -> Result<InstalledGame, String> {
    let game_id = normalize_game_id(input.game_id)?;
    let mut games = read_installed_games_cache().unwrap_or_default();

    let game = games
        .iter_mut()
        .find(|game| game.id == game_id)
        .ok_or_else(|| format!("Game '{game_id}' was not found in the local library cache."))?;

    if let Some(cover_url) = sanitize_optional_text(input.cover_url) {
        game.cover_url = Some(cover_url);
    }
    if let Some(logo_url) = sanitize_optional_text(input.logo_url) {
        game.logo_url = Some(logo_url.clone());
        if !game.logo_urls.contains(&logo_url) {
            game.logo_urls.insert(0, logo_url);
        }
    }
    if let Some(icon_url) = sanitize_optional_text(input.icon_url) {
        game.icon_url = Some(icon_url.clone());
        if !game.icon_urls.contains(&icon_url) {
            game.icon_urls.insert(0, icon_url);
        }
    }
    if let Some(rating) = input.rating {
        game.rating = Some(rating.clamp(0.0, 5.0));
    }
    if let Some(achievements) = input.achievements {
        game.achievements = achievements
            .into_iter()
            .filter(|achievement| !achievement.name.trim().is_empty())
            .collect();
    }
    if let Some(save_files) = input.save_files {
        game.save_files = save_files
            .into_iter()
            .filter(|save_file| !save_file.path.trim().is_empty())
            .collect();
    }
    if let Some(friends_playing) = input.friends_playing {
        game.friends_playing = friends_playing
            .into_iter()
            .map(|friend| friend.trim().to_string())
            .filter(|friend| !friend.is_empty())
            .collect();
    }

    let updated_game = game.clone();
    write_installed_games_cache(&games);

    Ok(updated_game)
}

#[tauri::command]
pub fn import_library_snapshot(games: Vec<InstalledGame>) -> Result<Vec<InstalledGame>, String> {
    let mut imported_games = Vec::new();
    let mut seen_ids = HashSet::new();

    for mut game in games {
        game.id = game.id.trim().to_string();
        game.title = game.title.trim().to_string();

        if game.id.is_empty() || game.title.is_empty() || !seen_ids.insert(game.id.clone()) {
            continue;
        }

        if game.slug.trim().is_empty() {
            game.slug = slugify(&game.title);
        }
        if game.launcher.trim().is_empty() {
            game.launcher = "unknown".to_string();
        }
        if game.description.trim().is_empty() {
            game.description = format!("Imported Library entry for {}.", game.title);
        }
        if game.version.trim().is_empty() {
            game.version = "unknown".to_string();
        }

        imported_games.push(game);
    }

    write_installed_games_cache(&imported_games);
    Ok(imported_games)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveGameRequest {
    pub game_id: String,
    pub new_path: String,
}

#[tauri::command]
pub async fn move_game(input: MoveGameRequest) -> Result<(), String> {
    let mut games = read_installed_games_cache().unwrap_or_default();

    let game_index = games
        .iter()
        .position(|g| g.id == input.game_id)
        .ok_or_else(|| "Game was not found in the cache.".to_string())?;

    let old_path = games[game_index]
        .install_path
        .as_ref()
        .ok_or_else(|| "Game has no install path.".to_string())?;

    let old_path_buf = PathBuf::from(old_path);
    let new_path_buf = PathBuf::from(&input.new_path);

    if !old_path_buf.exists() {
        return Err("Old install path does not exist.".to_string());
    }

    let folder_name = old_path_buf
        .file_name()
        .ok_or_else(|| "Invalid path.".to_string())?;
    let final_new_path = new_path_buf.join(folder_name);

    if final_new_path.exists() {
        return Err("Target folder already exists.".to_string());
    }

    fs::rename(&old_path_buf, &final_new_path).map_err(|e| {
        format!(
            "Failed to move game. This may have crossed drive boundaries: {}",
            e
        )
    })?;

    games[game_index].install_path = Some(final_new_path.to_string_lossy().to_string());
    write_installed_games_cache(&games);

    Ok(())
}

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

        // Not installed — start download via our GOG integration
        let app_handle = app.clone();
        let gog_id_owned = gog_id.to_string();
        tokio::spawn(async move {
            match crate::commands::gog::gog_start_download(
                app_handle.clone(),
                gog_id_owned.clone(),
                None,
            )
            .await
            {
                Ok(_) => {
                    let _ = app_handle.emit(
                        "gog_download_started",
                        serde_json::json!({ "gogId": gog_id_owned }),
                    );
                }
                Err(e) => {
                    eprintln!("[GOG] Failed to start download: {e}");
                    // Fallback to Galaxy
                    let uri = format!("goggalaxy://open-store/{gog_id_owned}");
                    let _ = crate::commands::system::open_uri(&uri);
                }
            }
        });

        return Ok(LaunchGameResponse {
            game_id: game_id.clone(),
            success: true,
            message: "GOG download started. The game will launch when ready.".to_string(),
        });
    }

    if game_id.starts_with("epic-owned-") {
        let epic_id = game_id.strip_prefix("epic-owned-").unwrap_or(&game_id);

        // Spawn legendary launch in background
        let epic_id_clone = epic_id.to_string();

        tokio::spawn(async move {
            if let Ok(legendary_path) = crate::commands::epic::ensure_legendary_binary().await {
                let _ = std::process::Command::new(legendary_path)
                    .arg("launch")
                    .arg(&epic_id_clone)
                    .spawn();
            }
        });

        return Ok(LaunchGameResponse {
            game_id: game_id.clone(),
            success: true,
            message: "Installation / Launch started via Legendary.".to_string(),
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

#[tauri::command]
pub async fn sync_game_achievements(
    game_id: String,
    steam_id: Option<String>,
) -> Result<SyncGameAchievementsResponse, String> {
    let game_id = normalize_game_id(game_id)?;
    println!("[open-game-launcher] sync_game_achievements requested for {game_id}");

    let mut games = read_installed_games_cache().unwrap_or_default();
    let game_index = games
        .iter()
        .position(|game| game.id == game_id)
        .ok_or_else(|| format!("Game '{game_id}' was not found in the local library cache."))?;

    let mut game = games[game_index].clone();
    let appid = steam_app_id_for_game(&game).ok_or_else(|| {
        format!(
            "{} does not expose a Steam app ID, so achievements cannot be synced yet.",
            game.title
        )
    })?;

    let achievements = fetch_steam_achievements(appid, steam_id).await?;
    if achievements.is_empty() {
        return Err(format!(
            "Steam returned no achievements for {}. The game may not expose public achievement data.",
            game.title
        ));
    }

    let unlocked_achievements = achievements
        .iter()
        .filter(|achievement| achievement.unlocked_at.is_some())
        .count();
    let synced_achievements = achievements.len();
    // Merge with existing local data: keep any previously known unlock timestamps that the
    // new fetch did not return (e.g., transient API failure, dropped IDs).
    game.achievements = preserve_known_unlocks(achievements, &game.achievements);
    game.achievements_synced_at = Some(unix_timestamp_to_iso(current_unix_timestamp()));

    games[game_index] = game.clone();
    write_installed_games_cache(&games);

    Ok(SyncGameAchievementsResponse {
        game_id,
        success: true,
        game: game.clone(),
        synced_achievements,
        unlocked_achievements,
        message: format!(
            "{} achievements synced: {unlocked_achievements}/{synced_achievements} unlocked.",
            game.title
        ),
    })
}

pub(crate) fn preserve_known_unlocks(
    new_achievements: Vec<UnifiedAchievement>,
    previous: &[UnifiedAchievement],
) -> Vec<UnifiedAchievement> {
    let previous_unlocks: HashMap<String, String> = previous
        .iter()
        .filter_map(|a| a.unlocked_at.clone().map(|u| (a.id.clone(), u)))
        .collect();
    let new_ids: HashSet<String> = new_achievements.iter().map(|a| a.id.clone()).collect();

    let mut result: Vec<UnifiedAchievement> = new_achievements
        .into_iter()
        .map(|mut ach| {
            if ach.unlocked_at.is_none() {
                if let Some(prev_unlock) = previous_unlocks.get(&ach.id) {
                    ach.unlocked_at = Some(prev_unlock.clone());
                }
            }
            ach
        })
        .collect();

    // Keep any previous achievement the new fetch is missing (transient API gaps, dropped IDs).
    for prev in previous {
        if !new_ids.contains(&prev.id) {
            result.push(prev.clone());
        }
    }

    result
}

#[tauri::command]
pub fn uninstall_game(game_id: String) -> Result<UninstallGameResponse, String> {
    let game_id = normalize_game_id(game_id)?;
    println!("[open-game-launcher] uninstall_game requested for {game_id}");

    let mut games = read_installed_games_cache().unwrap_or_default();
    let game_index = games
        .iter()
        .position(|game| game.id == game_id)
        .ok_or_else(|| format!("Game '{game_id}' was not found in the local library cache."))?;

    let mut game = games[game_index].clone();

    if is_manual_game(&game) {
        games.remove(game_index);
        write_installed_games_cache(&games);
        return Ok(UninstallGameResponse {
            game_id,
            success: true,
            removed_from_library: true,
            game: None,
            message: format!("{} was removed from the Library.", game.title),
        });
    }

    if let Some(install_path) = game.install_path.as_deref() {
        let install_path = PathBuf::from(install_path);
        if is_og_managed_install_path(&install_path) {
            remove_managed_install_path(&install_path)?;
            mark_game_not_installed(&mut game);
            games[game_index] = game.clone();
            write_installed_games_cache(&games);
            return Ok(UninstallGameResponse {
                game_id,
                success: true,
                removed_from_library: false,
                game: Some(game.clone()),
                message: format!(
                    "{} was uninstalled from the OG managed library.",
                    game.title
                ),
            });
        }
    }

    if game.launcher == "xbox" {
        let pfn = game
            .id
            .strip_prefix("xbox-")
            .unwrap_or(&game.id)
            .split('!')
            .next()
            .unwrap_or(&game.id);
        let script = format!(
            "$pkg = Get-AppxPackage -Name \"*{}*\"; if ($pkg) {{ Remove-AppxPackage -Package $pkg.PackageFullName }}",
            pfn.split('_').next().unwrap_or(pfn)
        );
        match std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .spawn()
        {
            Ok(_) => {
                mark_game_not_installed(&mut game);
                games[game_index] = game.clone();
                write_installed_games_cache(&games);
                return Ok(UninstallGameResponse {
                    game_id,
                    success: true,
                    removed_from_library: false,
                    game: Some(game.clone()),
                    message: format!("{} uninstall was launched via PowerShell.", game.title),
                });
            }
            Err(e) => {
                return Err(format!("Failed to launch Xbox uninstaller: {}", e));
            }
        }
    }

    if let Some(uri) = uninstall_uri_for_game(&game) {
        open_uri(&uri).map_err(|error| format!("Could not open uninstall flow: {error}"))?;
        return Ok(UninstallGameResponse {
            game_id,
            success: true,
            removed_from_library: false,
            game: Some(game.clone()),
            message: format!(
                "{} uninstall was handed off to {}.",
                game.title,
                launcher_display_name(&game.launcher)
            ),
        });
    }

    Err(format!(
        "{} is managed by {}. Open that launcher to uninstall it, or remove only manually added entries from OG Launcher.",
        game.title,
        launcher_display_name(&game.launcher)
    ))
}

// Watcher logic

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

        loop {
            let Ok(result) = rx.recv() else {
                break;
            };

            if let Err(error) = result {
                eprintln!("[open-game-launcher] Library watcher event error: {error}");
                continue;
            }

            while matches!(rx.recv_timeout(Duration::from_secs(2)), Ok(_)) {}

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

    if let Some(data_dir) = open_game_launcher_data_dir() {
        paths.push(data_dir.clone());
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

    dedupe_existing_watch_paths(paths)
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

// Utility Helpers

pub fn is_manual_game(game: &InstalledGame) -> bool {
    game.id.starts_with("manual-")
}

pub fn mark_game_not_installed(game: &mut InstalledGame) {
    game.status = GameStatus::NotInstalled;
    game.install_path = None;
    game.executable_path = None;
    game.process_names = Vec::new();
    game.launch_uri = None;
}

pub fn is_og_managed_install_path(path: &Path) -> bool {
    let Some(games_root) = open_game_launcher_data_dir().map(|dir| dir.join("games")) else {
        return false;
    };

    let normalized_path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let normalized_root = games_root.canonicalize().unwrap_or(games_root);

    normalized_path.starts_with(normalized_root)
}

pub fn remove_managed_install_path(path: &Path) -> Result<(), String> {
    if !is_og_managed_install_path(path) {
        return Err("Refusing to remove a path outside the OG managed install folder.".to_string());
    }

    if !path.exists() {
        return Ok(());
    }

    if path.is_dir() {
        fs::remove_dir_all(path)
            .map_err(|error| format!("Could not remove install folder: {error}"))
    } else {
        fs::remove_file(path).map_err(|error| format!("Could not remove install file: {error}"))
    }
}

pub fn uninstall_uri_for_game(game: &InstalledGame) -> Option<String> {
    match game.launcher.as_str() {
        "steam" => game
            .external_id
            .as_deref()
            .map(|external_id| format!("steam://uninstall/{external_id}")),
        "epic" => game.launch_uri.as_deref().map(|uri| {
            uri.replace("action=launch", "action=uninstall")
                .replace("action=install", "action=uninstall")
        }),
        "gog" => game
            .external_id
            .as_deref()
            .map(|external_id| format!("goggalaxy://open-game-view/{external_id}")),
        _ => None,
    }
}

pub fn update_uri_for_game(game: &InstalledGame) -> Option<String> {
    match game.launcher.as_str() {
        "steam" => game
            .external_id
            .as_deref()
            .map(|external_id| format!("steam://rungameid/{external_id}")),
        "epic" => game.launch_uri.clone(),
        "gog" => game
            .external_id
            .as_deref()
            .map(|external_id| format!("goggalaxy://open-game-view/{external_id}")),
        _ => None,
    }
}

pub fn read_og_managed_version(install_path: &Path) -> Option<String> {
    read_og_managed_manifest(install_path).and_then(|manifest| {
        let version = manifest.version.trim().to_string();
        (!version.is_empty()).then_some(version)
    })
}

pub fn read_og_managed_manifest(install_path: &Path) -> Option<OgManagedManifest> {
    let manifest_path = install_path.join(OG_MANAGED_MANIFEST_FILE);
    let contents = fs::read_to_string(manifest_path).ok()?;
    serde_json::from_str::<OgManagedManifest>(&contents).ok()
}

pub fn write_og_managed_manifest(
    install_path: &Path,
    game_id: &str,
    title: &str,
    version: &str,
) -> Result<(), String> {
    let manifest = OgManagedManifest {
        game_id: game_id.to_string(),
        title: title.to_string(),
        version: version.to_string(),
        managed_by: "OG-Launcher".to_string(),
        updated_at: Some(unix_timestamp_to_iso(current_unix_timestamp())),
        ..Default::default()
    };
    write_og_managed_manifest_details(install_path, &manifest)
}

pub fn write_og_managed_manifest_details(
    install_path: &Path,
    manifest: &OgManagedManifest,
) -> Result<(), String> {
    let manifest_path = install_path.join(OG_MANAGED_MANIFEST_FILE);
    let mut manifest = manifest.clone();
    if manifest.managed_by.trim().is_empty() {
        manifest.managed_by = "OG-Launcher".to_string();
    }
    if manifest.updated_at.is_none() {
        manifest.updated_at = Some(unix_timestamp_to_iso(current_unix_timestamp()));
    }

    let contents = serde_json::to_string_pretty(&manifest)
        .map_err(|error| format!("Could not serialize update manifest: {error}"))?;
    fs::write(manifest_path, contents)
        .map_err(|error| format!("Could not write update manifest: {error}"))
}

pub fn is_zip_package(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("zip"))
}

pub fn og_manifest_path_for_entry(install_path: &Path, relative_path: &str) -> Option<PathBuf> {
    let relative = Path::new(relative_path);
    if relative.is_absolute() {
        return None;
    }
    if relative.components().any(|component| {
        matches!(
            component,
            Component::Prefix(_) | Component::RootDir | Component::ParentDir
        )
    }) {
        return None;
    }

    Some(install_path.join(relative))
}

pub fn og_manifest_relative_path(install_path: &Path, path: &Path) -> Option<String> {
    let relative = path.strip_prefix(install_path).ok()?;
    if relative.as_os_str().is_empty() {
        return None;
    }
    if relative.components().any(|component| {
        matches!(
            component,
            Component::Prefix(_) | Component::RootDir | Component::ParentDir
        )
    }) {
        return None;
    }

    Some(
        relative
            .components()
            .filter_map(|component| match component {
                Component::Normal(value) => Some(value.to_string_lossy().to_string()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("/"),
    )
    .filter(|path| !path.trim().is_empty())
}

pub fn og_manifest_file_for_path(
    install_path: &Path,
    path: &Path,
) -> Option<OgManagedManifestFile> {
    let metadata = fs::metadata(path).ok()?;
    if !metadata.is_file() {
        return None;
    }

    Some(OgManagedManifestFile {
        path: og_manifest_relative_path(install_path, path)?,
        size_bytes: Some(metadata.len()),
        sha256: None,
    })
}

pub fn extract_og_zip_package<F>(
    package_path: &Path,
    install_path: &Path,
    mut on_file: F,
) -> Result<Vec<OgManagedManifestFile>, String>
where
    F: FnMut(usize, usize),
{
    let file = fs::File::open(package_path)
        .map_err(|error| format!("Could not open downloaded ZIP package: {error}"))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|error| format!("Could not read ZIP package: {error}"))?;
    let total = archive.len().max(1);
    let mut files = Vec::new();

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("Could not read ZIP entry: {error}"))?;

        if entry.is_symlink() {
            return Err("ZIP packages with symbolic links are not supported.".to_string());
        }

        let Some(relative_path) = entry.enclosed_name() else {
            return Err("ZIP package contains an unsafe path.".to_string());
        };
        let outpath = install_path.join(relative_path);

        if entry.is_dir() {
            fs::create_dir_all(&outpath)
                .map_err(|error| format!("Could not create ZIP directory: {error}"))?;
            on_file(index + 1, total);
            continue;
        }

        if let Some(parent) = outpath.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Could not create ZIP output folder: {error}"))?;
        }

        let mut outfile = fs::File::create(&outpath)
            .map_err(|error| format!("Could not write extracted ZIP file: {error}"))?;
        io::copy(&mut entry, &mut outfile)
            .map_err(|error| format!("Could not extract ZIP file: {error}"))?;

        #[cfg(unix)]
        if let Some(mode) = entry.unix_mode() {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&outpath, fs::Permissions::from_mode(mode));
        }

        if let Some(file) = og_manifest_file_for_path(install_path, &outpath) {
            if file.path.eq_ignore_ascii_case(OG_MANAGED_MANIFEST_FILE) {
                on_file(index + 1, total);
                continue;
            }
            files.push(file);
        }
        on_file(index + 1, total);
    }

    Ok(files)
}

pub fn save_sync_root_for_game(game_id: &str) -> Option<PathBuf> {
    open_game_launcher_data_dir().map(|data_dir| data_dir.join("save-sync").join(slugify(game_id)))
}

pub fn sync_destination_for_save(sync_root: &Path, save_file: &SaveFile, source: &Path) -> PathBuf {
    let label = save_file
        .label
        .as_deref()
        .filter(|label| !label.trim().is_empty())
        .or_else(|| source.file_name().and_then(|name| name.to_str()))
        .unwrap_or("save");
    let mut destination_name = slugify(label);
    if destination_name.is_empty() {
        destination_name = "save".to_string();
    }

    if source.is_file() {
        if let Some(extension) = source.extension().and_then(|extension| extension.to_str()) {
            destination_name.push('.');
            destination_name.push_str(extension);
        }
    }

    sync_root.join(destination_name)
}

pub fn backup_root_for_game(game_id: &str) -> Option<PathBuf> {
    open_game_launcher_data_dir().map(|data_dir| {
        data_dir
            .join("save-backups")
            .join(slugify(game_id))
            .join(unix_timestamp_to_iso(current_unix_timestamp()).replace([':', '.'], "-"))
    })
}

pub fn launcher_display_name(launcher: &str) -> &'static str {
    match launcher {
        "steam" => "Steam",
        "epic" => "Epic Games Launcher",
        "ubisoft" => "Ubisoft Connect",
        "ea" => "EA App",
        "battlenet" => "Battle.net",
        "gog" => "GOG Galaxy",
        "xbox" => "Xbox app",
        "manual" => "OG Launcher",
        _ => "the source launcher",
    }
}

pub fn merge_cached_game_activity(game: &mut InstalledGame, cached_game: &InstalledGame) {
    match (&game.last_played_at, &cached_game.last_played_at) {
        (Some(current), Some(cached)) if cached > current => {
            game.last_played_at = Some(cached.clone());
        }
        (None, Some(cached)) => {
            game.last_played_at = Some(cached.clone());
        }
        _ => {}
    }

    if let Some(cached_minutes) = cached_game.playtime_minutes {
        game.playtime_minutes = Some(
            game.playtime_minutes
                .map_or(cached_minutes, |minutes| minutes.max(cached_minutes)),
        );
    }

    if !cached_game.genres.is_empty() {
        game.genres = cached_game.genres.clone();
        game.developer = cached_game.developer.clone();
        game.publisher = cached_game.publisher.clone();
        game.release_date = cached_game.release_date.clone();
        game.features = cached_game.features.clone();
        game.rating = cached_game.rating;
        if !cached_game.description.contains("//") {
            game.description = cached_game.description.clone();
        }
    }

    if game.external_id.is_none() {
        game.external_id = cached_game.external_id.clone();
    }
    if game.executable_path.is_none() {
        game.executable_path = cached_game.executable_path.clone();
    }
    if game.process_names.is_empty() {
        game.process_names = cached_game.process_names.clone();
    }
    if game.achievements.is_empty() {
        game.achievements = cached_game.achievements.clone();
    }
    if game.save_files.is_empty() {
        game.save_files = cached_game.save_files.clone();
    }
    if game.friends_playing.is_empty() {
        game.friends_playing = cached_game.friends_playing.clone();
    }
}

pub fn read_installed_games_cache() -> Option<Vec<InstalledGame>> {
    crate::commands::local_db::read_collection::<InstalledGame>("games")
        .ok()
        .map(|games| games.into_iter().map(repair_cached_game_assets).collect())
}

pub fn write_installed_games_cache(games: &[InstalledGame]) {
    let repaired_games = games
        .iter()
        .cloned()
        .map(repair_cached_game_assets)
        .collect::<Vec<_>>();

    let _ = crate::commands::local_db::write_collection("games", &repaired_games, |game| &game.id);
}

pub fn repair_cached_game_assets(mut game: InstalledGame) -> InstalledGame {
    if game.slug.is_empty() {
        game.slug = slugify(&game.title);
    }
    if game.launcher.is_empty() {
        game.launcher = launcher_key_from_source(&game.description).to_string();
    }
    if game.executable_path.is_none() {
        if let Some(install_path) = game.install_path.as_deref() {
            game.executable_path =
                find_launch_executable(Path::new(install_path), &game.title).map(path_to_string);
        }
    }
    if game.process_names.is_empty() {
        game.process_names = game
            .executable_path
            .as_deref()
            .and_then(|path| {
                Path::new(path)
                    .file_name()
                    .and_then(|name| name.to_str())
                    .map(|name| vec![name.to_string()])
            })
            .unwrap_or_default();
    }

    if is_battlenet_game(&game) {
        return apply_battlenet_assets(game, None);
    }

    game
}

pub fn is_battlenet_game(game: &InstalledGame) -> bool {
    game.id.starts_with("battlenet-")
        || game
            .launch_uri
            .as_deref()
            .is_some_and(|uri| uri.starts_with("battlenet://"))
        || game.description.starts_with("Battle.net")
}

pub fn apply_battlenet_assets(
    mut game: InstalledGame,
    _display_icon: Option<&str>,
) -> InstalledGame {
    let uid = game
        .launch_uri
        .as_deref()
        .and_then(|uri| uri.strip_prefix("battlenet://"))
        .or_else(|| game.id.strip_prefix("battlenet-"))
        .unwrap_or(&game.id);
    let (fallback_cover, fallback_logo, fallback_icon) =
        super::detect::get_battlenet_assets(uid, &game.title);
    let rawg_assets = super::detect::get_rawg_battlenet_assets(uid, &game.title);
    let (cover, logo, icon) = rawg_assets
        .map(|assets| {
            (
                assets.cover_url.or(fallback_cover.clone()),
                assets.logo_url.or(fallback_logo.clone()),
                assets.icon_url.or(fallback_icon.clone()),
            )
        })
        .unwrap_or((fallback_cover, fallback_logo, fallback_icon));

    game.cover_url = cover;
    game.logo_url = logo.clone();
    game.logo_urls = logo.into_iter().collect();
    game.icon_url = icon.clone();
    game.icon_urls = icon.into_iter().collect();
    game.logo_position = LogoPosition::CenterCenter;
    game.logo_width_percent = Some(58.0);
    game.logo_height_percent = Some(48.0);
    game
}

pub fn installed_game(
    id: &str,
    title: String,
    launcher: String,
    install_path: Option<String>,
    cover_url: Option<String>,
) -> InstalledGame {
    let slug = slugify(&title);
    let description = format!("A {} game managed by OG Launcher.", launcher);
    let platform = current_platform();

    InstalledGame {
        id: id.to_string(),
        title,
        slug,
        description,
        version: "1.0.0".to_string(),
        launcher,
        external_id: None,
        cover_url,
        icon_url: None,
        icon_urls: Vec::new(),
        logo_url: None,
        logo_urls: Vec::new(),
        logo_position: LogoPosition::BottomLeft,
        logo_width_percent: None,
        logo_height_percent: None,
        status: GameStatus::Installed,
        platform,
        install_path,
        executable_path: None,
        process_names: Vec::new(),
        launch_uri: None,
        last_played_at: None,
        playtime_minutes: None,
        genres: Vec::new(),
        developer: None,
        publisher: None,
        release_date: None,
        features: Vec::new(),
        rating: None,
        achievements: Vec::new(),
        achievements_synced_at: None,
        save_files: Vec::new(),
        friends_playing: Vec::new(),
    }
}

pub fn launcher_key_from_source(source: &str) -> &'static str {
    let normalized = source.to_lowercase();
    if normalized.contains("steam") {
        "steam"
    } else if normalized.contains("epic") {
        "epic"
    } else if normalized.contains("ubisoft") {
        "ubisoft"
    } else if normalized.contains("origin")
        || normalized.starts_with("ea")
        || normalized.contains("ea app")
        || normalized.contains("ea desktop")
        || normalized == "ea"
    {
        "ea"
    } else if normalized.contains("battle.net") || normalized.contains("battlenet") {
        "battlenet"
    } else if normalized.contains("gog") {
        "gog"
    } else if normalized.contains("xbox") {
        "xbox"
    } else if normalized.contains("manual") {
        "manual"
    } else {
        "unknown"
    }
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
    if cfg!(target_os = "windows") {
        Command::new("cmd").args(["/C", "start", "", uri]).spawn()?;
        return Ok(());
    }

    if cfg!(target_os = "macos") {
        Command::new("open").arg(uri).spawn()?;
        return Ok(());
    }

    Command::new("xdg-open").arg(uri).spawn()?;
    Ok(())
}

pub fn is_file_executable(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }

    #[cfg(unix)]
    {
        if let Ok(metadata) = fs::metadata(path) {
            return metadata.permissions().mode() & 0o111 != 0;
        }
    }

    if let Some(extension) = path.extension().and_then(|ext| ext.to_str()) {
        return extension.eq_ignore_ascii_case("exe")
            || extension.eq_ignore_ascii_case("bat")
            || extension.eq_ignore_ascii_case("cmd");
    }

    false
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

pub fn current_platform() -> Platform {
    if cfg!(target_os = "windows") {
        Platform::Windows
    } else if cfg!(target_os = "macos") {
        Platform::Macos
    } else {
        Platform::Linux
    }
}

pub fn env_path(key: &str) -> Option<PathBuf> {
    env::var_os(key).map(PathBuf::from)
}

pub fn path_to_string(path: PathBuf) -> String {
    path.to_string_lossy().to_string()
}

pub fn slugify(value: &str) -> String {
    let mut slug = String::new();
    let mut last_was_dash = false;

    for character in value.chars().flat_map(char::to_lowercase) {
        if character.is_ascii_alphanumeric() {
            slug.push(character);
            last_was_dash = false;
        } else if !last_was_dash {
            slug.push('-');
            last_was_dash = true;
        }
    }

    slug.trim_matches('-').to_string()
}

pub fn normalize_game_id(game_id: String) -> Result<String, String> {
    let normalized = game_id.trim().to_string();

    if normalized.is_empty() {
        return Err("game_id must not be empty.".to_string());
    }

    Ok(normalized)
}

pub fn sanitize_optional_text(value: Option<String>) -> Option<String> {
    value
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

pub fn unix_timestamp_to_iso(timestamp: u64) -> String {
    let secs = timestamp as i64;
    let days = secs / 86400;
    let remaining = secs % 86400;
    let hours = (remaining / 3600) as u32;
    let minutes = ((remaining % 3600) / 60) as u32;
    let seconds = (remaining % 60) as u32;

    let (year, month, day) = civil_from_days(days);

    format!("{year:04}-{month:02}-{day:02}T{hours:02}:{minutes:02}:{seconds:02}Z")
}

fn civil_from_days(days: i64) -> (i32, u32, u32) {
    let days = days + 719468;
    let era = if days >= 0 {
        days / 146097
    } else {
        (days - 146096) / 146097
    };
    let doe = days - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };

    (year as i32, m as u32, d as u32)
}

pub fn get_dir_last_modified(path: &Path) -> Option<u64> {
    let metadata = fs::metadata(path).ok()?;
    let modified = metadata.modified().ok()?;
    system_time_to_unix_timestamp(modified)
}

pub fn current_unix_timestamp() -> u64 {
    system_time_to_unix_timestamp(SystemTime::now()).unwrap_or_default()
}

pub fn system_time_to_unix_timestamp(time: SystemTime) -> Option<u64> {
    time.duration_since(UNIX_EPOCH).ok().map(|d| d.as_secs())
}

pub fn open_game_launcher_data_dir() -> Option<PathBuf> {
    dirs::data_local_dir()
        .or_else(dirs::data_dir)
        .map(|data_dir| data_dir.join("open-game-launcher"))
}

fn supabase_access_token_path() -> Option<PathBuf> {
    open_game_launcher_data_dir().map(|data_dir| data_dir.join("supabase-access-token"))
}

pub fn read_supabase_access_token() -> Option<String> {
    let path = supabase_access_token_path()?;
    let token = fs::read_to_string(path).ok()?.trim().to_string();
    (!token.is_empty()).then_some(token)
}

#[tauri::command]
pub fn read_cached_supabase_access_token() -> Option<String> {
    read_supabase_access_token()
}

#[tauri::command]
pub fn cache_supabase_access_token(token: String) -> Result<(), String> {
    let Some(path) = supabase_access_token_path() else {
        return Err("Could not resolve launcher data directory.".to_string());
    };

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let trimmed = token.trim();
    if trimmed.is_empty() {
        if path.exists() {
            fs::remove_file(&path).map_err(|error| error.to_string())?;
        }
        return Ok(());
    }

    fs::write(path, trimmed).map_err(|error| error.to_string())
}

pub fn rawg_asset_cache_path() -> Option<PathBuf> {
    open_game_launcher_data_dir().map(|data_dir| data_dir.join("rawg-assets.json"))
}

pub fn epic_catalog_asset_cache_path() -> Option<PathBuf> {
    open_game_launcher_data_dir().map(|data_dir| data_dir.join("epic-catalog-assets.json"))
}

pub fn is_ignored_game_directory(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
        return true;
    };

    let normalized = name.trim().to_lowercase();
    normalized.is_empty()
        || normalized.starts_with('.')
        || matches!(
            normalized.as_str(),
            "content"
                | "gamesave"
                | "modifiablewindowsapps"
                | "msixvc"
                | "pgs"
                | "program files"
                | "wgs"
                | "windowsapps"
        )
}

pub fn local_drive_roots() -> Vec<PathBuf> {
    #[cfg(windows)]
    {
        let mut drives = Vec::new();
        for letter in b'A'..=b'Z' {
            let drive_path = format!("{}:\\", letter as char);
            let path = PathBuf::from(&drive_path);
            if path.exists() {
                drives.push(path);
            }
        }
        drives
    }
    #[cfg(not(windows))]
    {
        vec![PathBuf::from("/")]
    }
}

pub fn ensure_path_inside_root(path: &Path, root: &Path) -> Result<(), String> {
    let normalized_root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let normalized_path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    if normalized_path.starts_with(&normalized_root) {
        Ok(())
    } else {
        Err("Refusing to write outside the OG save-sync folder.".to_string())
    }
}

pub fn path_size_bytes(path: &Path) -> Option<u64> {
    if path.is_file() {
        return fs::metadata(path).ok().map(|metadata| metadata.len());
    }

    if path.is_dir() {
        let mut size = 0_u64;
        collect_path_size(path, &mut size);
        return Some(size);
    }

    None
}

fn collect_path_size(path: &Path, size: &mut u64) {
    let Ok(entries) = fs::read_dir(path) else {
        return;
    };

    for entry in entries.flatten() {
        let entry_path = entry.path();
        if entry_path.is_dir() {
            collect_path_size(&entry_path, size);
        } else if let Ok(metadata) = fs::metadata(entry_path) {
            *size = size.saturating_add(metadata.len());
        }
    }
}
