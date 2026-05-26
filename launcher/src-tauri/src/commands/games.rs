use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    env, fs,
    path::{Path, PathBuf},
    process::{Child, Command},
    sync::mpsc,
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::Emitter;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
use winreg::{
    enums::{RegType, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ},
    RegKey, RegValue, HKEY,
};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const GAME_LIBRARY_CACHE_VERSION: u32 = 1;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstalledGame {
    id: String,
    title: String,
    description: String,
    version: String,
    cover_url: Option<String>,
    icon_url: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    icon_urls: Vec<String>,
    logo_url: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    logo_urls: Vec<String>,
    logo_position: LogoPosition,
    #[serde(skip_serializing_if = "Option::is_none")]
    logo_width_percent: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    logo_height_percent: Option<f64>,
    status: GameStatus,
    platform: Platform,
    install_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    launch_uri: Option<String>,
    #[serde(rename = "lastPlayed", skip_serializing_if = "Option::is_none")]
    last_played_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    playtime_minutes: Option<u32>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    genres: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    developer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    publisher: Option<String>,
    #[serde(rename = "releaseDate", skip_serializing_if = "Option::is_none")]
    release_date: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    features: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum GameStatus {
    Installed,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum Platform {
    Windows,
    Linux,
    Macos,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub enum LogoPosition {
    BottomLeft,
    UpperCenter,
    CenterCenter,
    BottomCenter,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LogoLayout {
    position: LogoPosition,
    #[serde(skip_serializing_if = "Option::is_none")]
    width_percent: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    height_percent: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchGameResponse {
    game_id: String,
    success: bool,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyGameFilesResponse {
    game_id: String,
    checked_files: u32,
    missing_files: Vec<String>,
    status: VerificationStatus,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GameActivityUpdate {
    game_id: String,
    last_played: Option<String>,
    playtime_minutes: Option<u32>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LibraryInventoryChanged {
    reason: String,
    game_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum VerificationStatus {
    Verified,
    RepairRequired,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddManualGameRequest {
    title: String,
    install_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstalledGamesCache {
    version: u32,
    games: Vec<InstalledGame>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct RawgAssetCache {
    entries: HashMap<String, RawgAssets>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RawgAssets {
    cover_url: Option<String>,
    logo_url: Option<String>,
    icon_url: Option<String>,
    fetched_at: u64,
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
        return Err("Titel darf nicht leer sein.".to_string());
    }

    let install_path = input.install_path.trim();
    if install_path.is_empty() {
        return Err("Installationspfad darf nicht leer sein.".to_string());
    }

    let path = PathBuf::from(install_path);
    if !path.exists() {
        return Err(format!("Pfad wurde nicht gefunden: {install_path}"));
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

pub fn start_library_inventory_watcher(app_handle: tauri::AppHandle) {
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

    if let Some(cache_path) =
        installed_games_cache_path().and_then(|path| path.parent().map(Path::to_path_buf))
    {
        paths.push(cache_path);
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveGameRequest {
    game_id: String,
    new_path: String,
}

#[tauri::command]
pub async fn move_game(input: MoveGameRequest) -> Result<(), String> {
    let mut games = read_installed_games_cache().unwrap_or_default();

    let game_index = games
        .iter()
        .position(|g| g.id == input.game_id)
        .ok_or_else(|| "Spiel nicht im Cache gefunden.".to_string())?;

    let old_path = games[game_index]
        .install_path
        .as_ref()
        .ok_or_else(|| "Spiel hat keinen Installationspfad.".to_string())?;

    let old_path_buf = PathBuf::from(old_path);
    let new_path_buf = PathBuf::from(&input.new_path);

    if !old_path_buf.exists() {
        return Err("Alter Installationspfad existiert nicht.".to_string());
    }

    let folder_name = old_path_buf
        .file_name()
        .ok_or_else(|| "Ungültiger Pfad.".to_string())?;
    let final_new_path = new_path_buf.join(folder_name);

    if final_new_path.exists() {
        return Err("Zielordner existiert bereits.".to_string());
    }

    fs::rename(&old_path_buf, &final_new_path).map_err(|e| {
        format!(
            "Fehler beim Verschieben (Möglicherweise Laufwerksgrenze überschritten): {}",
            e
        )
    })?;

    games[game_index].install_path = Some(final_new_path.to_string_lossy().to_string());
    write_installed_games_cache(&games);

    Ok(())
}

fn scan_installed_games() -> Vec<InstalledGame> {
    let mut games = BTreeMap::<String, InstalledGame>::new();

    // Spawn threads for parallel scanning
    let handle_steam = thread::spawn(|| scan_steam_games());
    let handle_epic = thread::spawn(|| scan_epic_games());
    let handle_gog = thread::spawn(|| scan_gog_games());
    let handle_ubisoft = thread::spawn(|| scan_ubisoft_games());
    let handle_xbox = thread::spawn(|| scan_xbox_games());
    let handle_battlenet = thread::spawn(|| scan_battlenet_games());
    let handle_ea = thread::spawn(|| scan_ea_games());

    // Join and merge results
    if let Ok(steam_games) = handle_steam.join() {
        for game in steam_games {
            games.entry(game.id.clone()).or_insert(game);
        }
    }
    if let Ok(epic_games) = handle_epic.join() {
        for game in epic_games {
            games.entry(game.id.clone()).or_insert(game);
        }
    }
    if let Ok(gog_games) = handle_gog.join() {
        for game in gog_games {
            games.entry(game.id.clone()).or_insert(game);
        }
    }
    if let Ok(ubisoft_games) = handle_ubisoft.join() {
        for game in ubisoft_games {
            games.entry(game.id.clone()).or_insert(game);
        }
    }
    if let Ok(xbox_games) = handle_xbox.join() {
        for game in xbox_games {
            games.entry(game.id.clone()).or_insert(game);
        }
    }
    if let Ok(battlenet_games) = handle_battlenet.join() {
        for game in battlenet_games {
            games.entry(game.id.clone()).or_insert(game);
        }
    }
    if let Ok(ea_games) = handle_ea.join() {
        for game in ea_games {
            games.entry(game.id.clone()).or_insert(game);
        }
    }

    games.into_values().collect()
}

fn is_manual_game(game: &InstalledGame) -> bool {
    game.id.starts_with("manual-")
}

fn merge_cached_game_activity(game: &mut InstalledGame, cached_game: &InstalledGame) {
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
        if !cached_game.description.contains("//") {
            game.description = cached_game.description.clone();
        }
    }
}

#[tauri::command]
pub async fn launch_game(
    app: tauri::AppHandle,
    game_id: String,
) -> Result<LaunchGameResponse, String> {
    let game_id = normalize_game_id(game_id)?;
    println!("[open-game-launcher] launch_game requested for {game_id}");

    if game_id.starts_with("steam-owned-") {
        let app_id = game_id.strip_prefix("steam-owned-").unwrap_or(&game_id);
        let uri = format!("steam://install/{app_id}");
        open_uri(&uri).map_err(|e| format!("Konnte Installation nicht starten: {e}"))?;
        return Ok(LaunchGameResponse {
            game_id: game_id.clone(),
            success: true,
            message: "Installation in Steam gestartet.".to_string(),
        });
    }

    if game_id.starts_with("gog-owned-") {
        let gog_id = game_id.strip_prefix("gog-owned-").unwrap_or(&game_id);
        let uri = format!("goggalaxy://open-store/{gog_id}");
        open_uri(&uri).map_err(|e| format!("Konnte GOG Galaxy nicht starten: {e}"))?;
        return Ok(LaunchGameResponse {
            game_id: game_id.clone(),
            success: true,
            message: "Installation in GOG Galaxy gestartet.".to_string(),
        });
    }

    if game_id.starts_with("epic-owned-") {
        let epic_id = game_id.strip_prefix("epic-owned-").unwrap_or(&game_id);
        let uri = format!("com.epicgames.launcher://apps/{epic_id}?action=install");
        open_uri(&uri).map_err(|e| format!("Konnte Epic Games Launcher nicht starten: {e}"))?;
        return Ok(LaunchGameResponse {
            game_id: game_id.clone(),
            success: true,
            message: "Installation im Epic Games Launcher gestartet.".to_string(),
        });
    }

    let game = list_installed_games()
        .await?
        .into_iter()
        .find(|game| game.id == game_id)
        .ok_or_else(|| format!("Game '{game_id}' wurde nicht gefunden."))?;

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
        message: format!("{} wird gestartet.", game.title),
    })
}

#[tauri::command]
pub fn verify_game_files(game_id: String) -> Result<VerifyGameFilesResponse, String> {
    let game_id = normalize_game_id(game_id)?;
    println!("[open-game-launcher] verify_game_files requested for {game_id}");

    let (missing_files, status) = if game_id.contains("broken") {
        (
            vec!["content/manifest.json".to_string()],
            VerificationStatus::RepairRequired,
        )
    } else {
        (Vec::new(), VerificationStatus::Verified)
    };

    Ok(VerifyGameFilesResponse {
        game_id,
        checked_files: 128,
        missing_files,
        status,
    })
}

fn scan_steam_games() -> Vec<InstalledGame> {
    let Some(steam_dir) = find_steam_dir() else {
        return Vec::new();
    };

    let mut libraries = vec![steam_dir.clone()];
    libraries.extend(read_steam_library_folders(&steam_dir));

    let steam_activity = read_steam_activity(&steam_dir);

    let mut seen_libraries = HashSet::new();
    let mut games = Vec::new();

    for library in libraries {
        let Ok(canonical_key) = library.canonicalize() else {
            continue;
        };

        if !seen_libraries.insert(canonical_key) {
            continue;
        }

        let steamapps = library.join("steamapps");
        let Ok(entries) = fs::read_dir(&steamapps) else {
            continue;
        };

        for entry in entries.flatten() {
            let path = entry.path();
            let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };

            if !file_name.starts_with("appmanifest_") || !file_name.ends_with(".acf") {
                continue;
            }

            let Ok(contents) = fs::read_to_string(&path) else {
                continue;
            };

            let name = find_quoted_value(&contents, "name");
            let install_dir = find_quoted_value(&contents, "installdir");
            let app_id = find_quoted_value(&contents, "appid")
                .or_else(|| steam_app_id_from_manifest_name(file_name));
            let manifest_activity = steam_activity_from_manifest(&contents);

            if let Some(title) = name.filter(|value| !value.trim().is_empty()) {
                let install_path = install_dir
                    .map(|dir| steamapps.join("common").join(dir))
                    .filter(|dir| dir.exists())
                    .map(path_to_string);
                let cover_url = app_id.as_ref().map(|id| {
                    format!(
                        "https://cdn.cloudflare.steamstatic.com/steam/apps/{id}/library_hero.jpg"
                    )
                });
                let mut game = installed_game(
                    &format!("steam-{title}"),
                    title,
                    "Steam".to_string(),
                    install_path,
                    cover_url,
                );
                if let Some(id) = app_id {
                    game.icon_urls = steam_icon_urls(&id, &game.title, &steam_dir);
                    game.icon_url = game.icon_urls.first().cloned();
                    game.logo_urls = steam_logo_urls(&id);
                    game.logo_url = game.logo_urls.first().cloned();
                    game.launch_uri = Some(format!("steam://rungameid/{id}"));
                    let logo_layout = steam_logo_layout(&id, &game.title, &steam_dir);
                    game.logo_position = logo_layout.position;
                    game.logo_width_percent = logo_layout.width_percent;
                    game.logo_height_percent = logo_layout.height_percent;

                    let mut activity = steam_activity.get(&id).cloned().unwrap_or_default();
                    activity.merge(manifest_activity);

                    if activity.has_data() {
                        if let Some(timestamp) = activity.last_played {
                            game.last_played_at = Some(unix_timestamp_to_iso(timestamp));
                        }
                        game.playtime_minutes = activity.playtime_minutes;
                    }
                }

                games.push(game);
            }
        }
    }

    games
}

fn read_installed_games_cache() -> Option<Vec<InstalledGame>> {
    let cache_path = installed_games_cache_path()?;
    let contents = fs::read_to_string(cache_path).ok()?;
    let cache = serde_json::from_str::<InstalledGamesCache>(&contents).ok()?;

    (cache.version == GAME_LIBRARY_CACHE_VERSION).then_some(
        cache
            .games
            .into_iter()
            .map(repair_cached_game_assets)
            .collect(),
    )
}

fn repair_cached_game_assets(game: InstalledGame) -> InstalledGame {
    if is_battlenet_game(&game) {
        return apply_battlenet_assets(game, None);
    }

    game
}

fn is_battlenet_game(game: &InstalledGame) -> bool {
    game.id.starts_with("battlenet-")
        || game
            .launch_uri
            .as_deref()
            .is_some_and(|uri| uri.starts_with("battlenet://"))
        || game.description.starts_with("Battle.net")
}

fn write_installed_games_cache(games: &[InstalledGame]) {
    let Some(cache_path) = installed_games_cache_path() else {
        return;
    };

    if let Some(parent) = cache_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let cache = InstalledGamesCache {
        version: GAME_LIBRARY_CACHE_VERSION,
        games: games.to_vec(),
    };

    if let Ok(contents) = serde_json::to_string_pretty(&cache) {
        let _ = fs::write(cache_path, contents);
    }
}

fn open_game_launcher_data_dir() -> Option<PathBuf> {
    dirs::data_local_dir()
        .or_else(dirs::data_dir)
        .map(|data_dir| data_dir.join("open-game-launcher"))
}

fn installed_games_cache_path() -> Option<PathBuf> {
    open_game_launcher_data_dir().map(|data_dir| data_dir.join("installed-games.json"))
}

fn rawg_asset_cache_path() -> Option<PathBuf> {
    open_game_launcher_data_dir().map(|data_dir| data_dir.join("rawg-assets.json"))
}

fn scan_epic_games() -> Vec<InstalledGame> {
    let manifest_dir = PathBuf::from(r"C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests");
    let Ok(entries) = fs::read_dir(manifest_dir) else {
        return Vec::new();
    };
    let catalog_cache = read_epic_catalog_cache();

    entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if path.extension().and_then(|extension| extension.to_str()) != Some("item") {
                return None;
            }

            let contents = fs::read_to_string(path).ok()?;
            let value = serde_json::from_str::<serde_json::Value>(&contents).ok()?;
            let title = value.get("DisplayName")?.as_str()?.trim().to_string();

            if title.is_empty() {
                return None;
            }

            let install_path = value
                .get("InstallLocation")
                .and_then(|location| location.as_str())
                .map(str::trim)
                .filter(|location| !location.is_empty())
                .map(ToOwned::to_owned);
            let install_root = install_path.as_ref().map(PathBuf::from);
            let epic_assets = find_epic_launcher_assets(&value, &title, &catalog_cache);
            let cover_url = epic_assets.cover_url.or_else(|| {
                install_root
                    .as_ref()
                    .and_then(|path| find_local_banner_asset(path))
            });
            let logo_url = epic_assets.logo_url.or_else(|| {
                install_root
                    .as_ref()
                    .and_then(|path| find_local_logo_asset(path))
            });
            let icon_url = epic_assets.icon_url.or_else(|| {
                install_root
                    .as_ref()
                    .and_then(|path| find_local_icon_asset(path))
            });

            let cover_url = cover_url.or_else(|| {
                value
                    .get("VaultThumbnailUrl")
                    .and_then(|url| url.as_str())
                    .map(str::trim)
                    .filter(|url| !url.is_empty())
                    .map(ToOwned::to_owned)
            });
            let icon_url = icon_url.or_else(|| cover_url.clone());

            let mut game = installed_game(
                &format!("epic-{title}"),
                title,
                "Epic Games".to_string(),
                install_path.clone(),
                cover_url,
            );
            game.logo_url = logo_url;
            game.icon_url = icon_url;
            if let Some(timestamp) = install_root
                .as_ref()
                .and_then(|path| get_dir_last_modified(path))
            {
                game.last_played_at = Some(unix_timestamp_to_iso(timestamp));
            }

            Some(game)
        })
        .collect()
}

#[derive(Default)]
struct EpicLauncherAssets {
    cover_url: Option<String>,
    logo_url: Option<String>,
    icon_url: Option<String>,
}

#[derive(Clone)]
struct EpicImageCandidate {
    url: String,
    image_type: String,
    width: Option<u64>,
    height: Option<u64>,
}

fn find_epic_launcher_assets(
    manifest: &serde_json::Value,
    title: &str,
    catalog_cache: &[serde_json::Value],
) -> EpicLauncherAssets {
    let mut images = Vec::new();
    collect_epic_image_candidates(manifest, &mut images);

    let identifiers = epic_manifest_identifiers(manifest);
    for item in catalog_cache
        .iter()
        .filter(|item| epic_catalog_item_matches(item, title, &identifiers))
    {
        collect_epic_image_candidates(item, &mut images);
    }

    EpicLauncherAssets {
        cover_url: select_epic_image(&images, EpicImagePurpose::Cover),
        logo_url: select_epic_image(&images, EpicImagePurpose::Logo),
        icon_url: select_epic_image(&images, EpicImagePurpose::Icon),
    }
}

fn read_epic_catalog_cache() -> Vec<serde_json::Value> {
    let cache_path =
        PathBuf::from(r"C:\ProgramData\Epic\EpicGamesLauncher\Data\Catalog\catcache.bin");
    let Ok(contents) = fs::read_to_string(cache_path) else {
        return Vec::new();
    };

    let decoded =
        if contents.trim_start().starts_with('[') || contents.trim_start().starts_with('{') {
            contents
        } else {
            let Some(bytes) = decode_base64(contents.trim()) else {
                return Vec::new();
            };
            String::from_utf8_lossy(&bytes).into_owned()
        };

    match serde_json::from_str::<serde_json::Value>(&decoded) {
        Ok(serde_json::Value::Array(items)) => items,
        Ok(value) => vec![value],
        Err(_) => Vec::new(),
    }
}

fn epic_manifest_identifiers(manifest: &serde_json::Value) -> HashSet<String> {
    [
        "CatalogItemId",
        "MainGameCatalogItemId",
        "AppName",
        "MainGameAppName",
        "InstallationGuid",
        "MandatoryAppFolderName",
    ]
    .into_iter()
    .filter_map(|key| manifest.get(key).and_then(|value| value.as_str()))
    .map(normalize_epic_match_value)
    .filter(|value| !value.is_empty())
    .collect()
}

fn epic_catalog_item_matches(
    item: &serde_json::Value,
    title: &str,
    identifiers: &HashSet<String>,
) -> bool {
    let normalized_title = normalize_epic_match_value(title);
    if item
        .get("title")
        .and_then(|value| value.as_str())
        .map(normalize_epic_match_value)
        .is_some_and(|value| value == normalized_title)
    {
        return true;
    }

    ["id", "namespace", "entitlementName"]
        .into_iter()
        .filter_map(|key| item.get(key).and_then(|value| value.as_str()))
        .map(normalize_epic_match_value)
        .any(|value| identifiers.contains(&value))
}

fn collect_epic_image_candidates(value: &serde_json::Value, images: &mut Vec<EpicImageCandidate>) {
    match value {
        serde_json::Value::Array(items) => {
            for item in items {
                collect_epic_image_candidates(item, images);
            }
        }
        serde_json::Value::Object(object) => {
            if let Some(url) = object
                .get("url")
                .or_else(|| object.get("URL"))
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|url| url.starts_with("http"))
            {
                let image_type = object
                    .get("type")
                    .or_else(|| object.get("Type"))
                    .and_then(|value| value.as_str())
                    .unwrap_or_default()
                    .to_string();
                let width = object.get("width").and_then(|value| value.as_u64());
                let height = object.get("height").and_then(|value| value.as_u64());

                if is_epic_image_candidate(&image_type, width, height) {
                    push_unique_epic_image(
                        images,
                        EpicImageCandidate {
                            url: url.to_string(),
                            image_type,
                            width,
                            height,
                        },
                    );
                }
            }

            for item in object.values() {
                collect_epic_image_candidates(item, images);
            }
        }
        _ => {}
    }
}

fn is_epic_image_candidate(image_type: &str, width: Option<u64>, height: Option<u64>) -> bool {
    let normalized = image_type.to_lowercase();
    width.zip(height).is_some()
        || normalized.contains("image")
        || normalized.contains("logo")
        || normalized.contains("icon")
        || normalized.contains("thumbnail")
        || normalized.contains("box")
}

fn push_unique_epic_image(images: &mut Vec<EpicImageCandidate>, candidate: EpicImageCandidate) {
    if !images.iter().any(|image| image.url == candidate.url) {
        images.push(candidate);
    }
}

enum EpicImagePurpose {
    Cover,
    Logo,
    Icon,
}

fn select_epic_image(images: &[EpicImageCandidate], purpose: EpicImagePurpose) -> Option<String> {
    images
        .iter()
        .max_by_key(|image| epic_image_score(image, &purpose))
        .filter(|image| epic_image_score(image, &purpose) > 0)
        .map(|image| image.url.clone())
}

fn epic_image_score(image: &EpicImageCandidate, purpose: &EpicImagePurpose) -> i32 {
    let image_type = image.image_type.to_lowercase();
    let is_wide = image
        .width
        .zip(image.height)
        .is_some_and(|(width, height)| width >= height);
    let is_squareish = image
        .width
        .zip(image.height)
        .is_some_and(|(width, height)| {
            let smaller = width.min(height).max(1);
            let larger = width.max(height);
            larger <= smaller * 2
        });

    match purpose {
        EpicImagePurpose::Cover => {
            let mut score = if is_wide { 40 } else { 5 };
            if image_type.contains("dieselgamebox") && !image_type.contains("tall") {
                score += 90;
            }
            if image_type.contains("wide")
                || image_type.contains("hero")
                || image_type.contains("featured")
                || image_type.contains("background")
            {
                score += 75;
            }
            if image_type.contains("tall") || image_type.contains("portrait") {
                score -= 60;
            }
            score
        }
        EpicImagePurpose::Logo => {
            let mut score = 0;
            if image_type.contains("logo") || image_type.contains("title") {
                score += 100;
            }
            if image_type.contains("wide") {
                score += 15;
            }
            score
        }
        EpicImagePurpose::Icon => {
            let mut score = if is_squareish { 25 } else { 5 };
            if image_type.contains("thumbnail")
                || image_type.contains("icon")
                || image_type.contains("small")
            {
                score += 85;
            }
            if image_type.contains("tall") || image_type.contains("dieselgameboxtall") {
                score += 35;
            }
            score
        }
    }
}

fn normalize_epic_match_value(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .collect()
}

fn decode_base64(input: &str) -> Option<Vec<u8>> {
    let mut output = Vec::new();
    let mut buffer = 0u32;
    let mut bits = 0u8;

    for byte in input.bytes().filter(|byte| !byte.is_ascii_whitespace()) {
        if byte == b'=' {
            break;
        }

        let value = match byte {
            b'A'..=b'Z' => byte - b'A',
            b'a'..=b'z' => byte - b'a' + 26,
            b'0'..=b'9' => byte - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => return None,
        } as u32;

        buffer = (buffer << 6) | value;
        bits += 6;

        while bits >= 8 {
            bits -= 8;
            output.push((buffer >> bits) as u8);
            buffer &= (1 << bits) - 1;
        }
    }

    Some(output)
}

fn find_gog_game_id(path: &Path) -> Option<String> {
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let filename = entry.file_name();
            if let Some(name_str) = filename.to_str() {
                if name_str.starts_with("goggame-") && name_str.ends_with(".info") {
                    if let Some(game_id) = name_str
                        .strip_prefix("goggame-")
                        .and_then(|s| s.strip_suffix(".info"))
                    {
                        return Some(game_id.trim().to_string());
                    }
                }
            }
        }
    }
    None
}

fn find_gog_webcache_banner(game_id: &str) -> Option<String> {
    let program_data = env::var("ProgramData").unwrap_or_else(|_| r"C:\ProgramData".to_string());
    let webcache_dir = Path::new(&program_data)
        .join("GOG.com")
        .join("Galaxy")
        .join("webcache");
    if !webcache_dir.is_dir() {
        return None;
    }

    let Ok(entries) = fs::read_dir(webcache_dir) else {
        return None;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let game_dir = path.join("gog").join(game_id);
            if game_dir.is_dir() {
                if let Ok(game_entries) = fs::read_dir(&game_dir) {
                    let mut files = Vec::new();
                    for game_entry in game_entries.flatten() {
                        if let Some(filename) = game_entry.file_name().to_str() {
                            files.push(filename.to_string());
                        }
                    }
                    if let Some(banner_file) = files
                        .iter()
                        .find(|f| f.to_lowercase().contains("_glx_bg_top_padding_7"))
                    {
                        return Some(path_to_string(game_dir.join(banner_file)));
                    }
                    if let Some(cover_file) = files
                        .iter()
                        .find(|f| f.to_lowercase().contains("_glx_vertical_cover"))
                    {
                        return Some(path_to_string(game_dir.join(cover_file)));
                    }
                }
            }
        }
    }
    None
}

struct GogRegistryInstall {
    title: String,
    install_dir: PathBuf,
    game_id: Option<String>,
}

fn read_gog_registry_installs() -> Vec<GogRegistryInstall> {
    if !cfg!(target_os = "windows") {
        return Vec::new();
    }

    [
        r"HKLM\SOFTWARE\WOW6432Node\GOG.com\Games",
        r"HKLM\SOFTWARE\GOG.com\Games",
    ]
    .into_iter()
    .flat_map(query_registry_sections)
    .filter_map(|section| {
        if !section.contains("HKEY_") {
            return None;
        }

        let first_line = section.lines().next()?;
        let game_id = first_line
            .split('\\')
            .flat_map(|s| s.split('/'))
            .filter(|s| !s.is_empty())
            .last()
            .map(|s| s.trim().to_string())
            .filter(|s| s.chars().all(|c| c.is_numeric()));

        let title = section
            .lines()
            .filter_map(|line| registry_string_value(line, "gameName"))
            .find(|val| !val.is_empty())?;

        let install_dir = section
            .lines()
            .filter_map(|line| registry_string_value(line, "path"))
            .map(PathBuf::from)
            .find(|path| path.exists())?;

        Some(GogRegistryInstall {
            title,
            install_dir,
            game_id,
        })
    })
    .collect()
}

fn scan_gog_games() -> Vec<InstalledGame> {
    let mut games = Vec::new();
    let mut seen = HashSet::new();

    // 1. Scan registry installations
    for install in read_gog_registry_installs() {
        if !install.install_dir.is_dir() || is_ignored_game_directory(&install.install_dir) {
            continue;
        }

        let title = install.title.trim();
        if title.is_empty() || !seen.insert(title.to_lowercase()) {
            continue;
        }

        let game_id = install
            .game_id
            .clone()
            .or_else(|| find_gog_game_id(&install.install_dir));
        let banner_path = game_id
            .as_ref()
            .and_then(|id| find_gog_webcache_banner(id))
            .or_else(|| find_local_banner_asset(&install.install_dir));

        let mut game = installed_game(
            &format!("gog-{title}"),
            title.to_string(),
            "GOG".to_string(),
            Some(path_to_string(install.install_dir.clone())),
            banner_path,
        );
        // Note: GOG games do not use logos or icons (only banner/cover) as requested by the user.

        if let Some(timestamp) = get_dir_last_modified(&install.install_dir) {
            game.last_played_at = Some(unix_timestamp_to_iso(timestamp));
        }

        games.push(game);
    }

    // 2. Scan standard search directory candidates as fallback/supplement
    let mut candidates = Vec::new();

    if let Some(program_files) = env_path("ProgramFiles") {
        candidates.push(program_files.join("GOG Galaxy").join("Games"));
    }

    if let Some(program_files_x86) = env_path("ProgramFiles(x86)") {
        candidates.push(program_files_x86.join("GOG Galaxy").join("Games"));
    }

    candidates.push(PathBuf::from(r"C:\GOG Games"));

    for candidate in candidates {
        let Ok(entries) = fs::read_dir(candidate) else {
            continue;
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() || is_ignored_game_directory(&path) {
                continue;
            }

            let Some(folder_title) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };

            let title = folder_title.trim();
            if title.is_empty() || !seen.insert(title.to_lowercase()) {
                continue;
            }

            let game_id = find_gog_game_id(&path);
            let banner_path = game_id
                .as_ref()
                .and_then(|id| find_gog_webcache_banner(id))
                .or_else(|| find_local_banner_asset(&path));

            let mut game = installed_game(
                &format!("gog-{title}"),
                title.to_string(),
                "GOG".to_string(),
                Some(path_to_string(path.clone())),
                banner_path,
            );
            // Note: GOG games do not use logos or icons (only banner/cover) as requested by the user.

            if let Some(timestamp) = get_dir_last_modified(&path) {
                game.last_played_at = Some(unix_timestamp_to_iso(timestamp));
            }

            games.push(game);
        }
    }

    games
}

struct BattleNetAssetTheme {
    family: &'static str,
    initials: &'static str,
    bg: &'static str,
    bg_alt: &'static str,
    accent: &'static str,
    accent_alt: &'static str,
}

fn battlenet_asset_theme(uid: &str, title: &str) -> BattleNetAssetTheme {
    let normalized_uid = uid.to_lowercase();
    let normalized_title = title.to_lowercase();

    if normalized_uid.contains("wow") || normalized_title.contains("world of warcraft") {
        return BattleNetAssetTheme {
            family: "WORLD OF WARCRAFT",
            initials: "WOW",
            bg: "#101a2b",
            bg_alt: "#263f5c",
            accent: "#d8a33c",
            accent_alt: "#f2d36d",
        };
    }

    if normalized_uid.contains("d4")
        || normalized_uid.contains("fenris")
        || normalized_title.contains("diablo iv")
        || normalized_title.contains("diablo 4")
        || normalized_uid.contains("d3")
        || normalized_title.contains("diablo iii")
        || normalized_title.contains("diablo 3")
        || normalized_uid.contains("d2r")
        || normalized_uid.contains("osiris")
        || normalized_title.contains("diablo ii")
        || normalized_title.contains("diablo 2")
    {
        return BattleNetAssetTheme {
            family: "DIABLO",
            initials: "D",
            bg: "#170606",
            bg_alt: "#3b0b0f",
            accent: "#c20b2f",
            accent_alt: "#ffcc66",
        };
    }

    if normalized_uid.contains("pro")
        || normalized_uid.contains("overwatch")
        || normalized_title.contains("overwatch")
    {
        return BattleNetAssetTheme {
            family: "OVERWATCH",
            initials: "OW",
            bg: "#11151c",
            bg_alt: "#39404a",
            accent: "#f28c28",
            accent_alt: "#f5eedf",
        };
    }

    if normalized_uid.contains("wtcg")
        || normalized_uid.contains("hs_beta")
        || normalized_uid.contains("hsg")
        || normalized_title.contains("hearthstone")
    {
        return BattleNetAssetTheme {
            family: "HEARTHSTONE",
            initials: "HS",
            bg: "#123d6a",
            bg_alt: "#235d9a",
            accent: "#e8c843",
            accent_alt: "#fff0a6",
        };
    }

    if normalized_uid.contains("s2")
        || normalized_title.contains("starcraft ii")
        || normalized_title.contains("starcraft 2")
        || normalized_uid.contains("s1")
        || normalized_uid.contains("rtsc")
        || normalized_title.contains("starcraft")
    {
        return BattleNetAssetTheme {
            family: "STARCRAFT",
            initials: "SC",
            bg: "#071426",
            bg_alt: "#12365a",
            accent: "#8cf5e4",
            accent_alt: "#ffffff",
        };
    }

    if normalized_uid.contains("w3")
        || normalized_uid.contains("fore")
        || normalized_title.contains("warcraft iii")
        || normalized_title.contains("warcraft 3")
    {
        return BattleNetAssetTheme {
            family: "WARCRAFT III",
            initials: "W3",
            bg: "#1e2f17",
            bg_alt: "#3d552c",
            accent: "#b7102a",
            accent_alt: "#d8a33c",
        };
    }

    if normalized_uid.contains("hero") || normalized_title.contains("heroes of the storm") {
        return BattleNetAssetTheme {
            family: "HEROES OF THE STORM",
            initials: "H",
            bg: "#24184a",
            bg_alt: "#4e2e85",
            accent: "#8cf5e4",
            accent_alt: "#f5eedf",
        };
    }

    BattleNetAssetTheme {
        family: "BATTLE.NET",
        initials: "BN",
        bg: "#171411",
        bg_alt: "#1e3431",
        accent: "#159d8d",
        accent_alt: "#f5eedf",
    }
}

fn get_battlenet_assets(
    uid: &str,
    title: &str,
) -> (Option<String>, Option<String>, Option<String>) {
    let theme = battlenet_asset_theme(uid, title);

    (
        Some(battlenet_banner_asset(title, &theme)),
        Some(battlenet_logo_asset(title, &theme)),
        Some(battlenet_icon_asset(&theme)),
    )
}

fn apply_battlenet_assets(mut game: InstalledGame, _display_icon: Option<&str>) -> InstalledGame {
    let uid = game
        .launch_uri
        .as_deref()
        .and_then(|uri| uri.strip_prefix("battlenet://"))
        .or_else(|| game.id.strip_prefix("battlenet-"))
        .unwrap_or(&game.id);
    let (fallback_cover, fallback_logo, fallback_icon) = get_battlenet_assets(uid, &game.title);
    let rawg_assets = get_rawg_battlenet_assets(uid, &game.title);
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

fn get_rawg_battlenet_assets(uid: &str, title: &str) -> Option<RawgAssets> {
    let cache_key = battlenet_asset_cache_key(uid, title);
    let mut cache = read_rawg_asset_cache();
    if let Some(cached_assets) = cache.entries.get(&cache_key) {
        return Some(cached_assets.clone());
    }

    let api_key = env::var("RAWG_API_KEY")
        .or_else(|_| env::var("OG_RAWG_API_KEY"))
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())?;

    let search_title = battlenet_rawg_search_title(uid, title);
    let assets = fetch_rawg_assets(&api_key, &search_title)?;

    if assets.cover_url.is_some() || assets.logo_url.is_some() || assets.icon_url.is_some() {
        cache.entries.insert(cache_key, assets.clone());
        write_rawg_asset_cache(&cache);
        return Some(assets);
    }

    None
}

fn battlenet_asset_cache_key(uid: &str, title: &str) -> String {
    format!(
        "{}:{}",
        uid.trim().to_lowercase(),
        title.trim().to_lowercase()
    )
}

fn read_rawg_asset_cache() -> RawgAssetCache {
    let Some(cache_path) = rawg_asset_cache_path() else {
        return RawgAssetCache::default();
    };

    fs::read_to_string(cache_path)
        .ok()
        .and_then(|contents| serde_json::from_str::<RawgAssetCache>(&contents).ok())
        .unwrap_or_default()
}

fn write_rawg_asset_cache(cache: &RawgAssetCache) {
    let Some(cache_path) = rawg_asset_cache_path() else {
        return;
    };

    if let Some(parent) = cache_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    if let Ok(contents) = serde_json::to_string_pretty(cache) {
        let _ = fs::write(cache_path, contents);
    }
}

fn battlenet_rawg_search_title(uid: &str, title: &str) -> String {
    let normalized_uid = uid.to_lowercase();
    let normalized_title = title.to_lowercase();

    if normalized_uid.contains("wow") || normalized_title.contains("world of warcraft") {
        if normalized_uid.contains("classic")
            || normalized_title.contains("classic")
            || normalized_title.contains("burning crusade")
            || normalized_title.contains("wrath")
        {
            return "World of Warcraft Classic".to_string();
        }

        return "World of Warcraft".to_string();
    }

    if normalized_uid.contains("d4")
        || normalized_uid.contains("fenris")
        || normalized_title.contains("diablo iv")
        || normalized_title.contains("diablo 4")
    {
        return "Diablo IV".to_string();
    }

    if normalized_uid.contains("d3")
        || normalized_title.contains("diablo iii")
        || normalized_title.contains("diablo 3")
    {
        return "Diablo III".to_string();
    }

    if normalized_uid.contains("d2r")
        || normalized_uid.contains("osiris")
        || normalized_title.contains("diablo ii")
        || normalized_title.contains("diablo 2")
    {
        return "Diablo II Resurrected".to_string();
    }

    if normalized_uid.contains("pro")
        || normalized_uid.contains("overwatch")
        || normalized_title.contains("overwatch")
    {
        return "Overwatch 2".to_string();
    }

    if normalized_uid.contains("wtcg")
        || normalized_uid.contains("hs_beta")
        || normalized_uid.contains("hsg")
        || normalized_title.contains("hearthstone")
    {
        return "Hearthstone".to_string();
    }

    if normalized_uid.contains("s2")
        || normalized_title.contains("starcraft ii")
        || normalized_title.contains("starcraft 2")
    {
        return "StarCraft II".to_string();
    }

    if normalized_uid.contains("s1")
        || normalized_uid.contains("rtsc")
        || normalized_title.contains("starcraft")
    {
        return "StarCraft Remastered".to_string();
    }

    if normalized_uid.contains("w3")
        || normalized_uid.contains("fore")
        || normalized_title.contains("warcraft iii")
        || normalized_title.contains("warcraft 3")
    {
        return "Warcraft III Reforged".to_string();
    }

    if normalized_uid.contains("hero") || normalized_title.contains("heroes of the storm") {
        return "Heroes of the Storm".to_string();
    }

    title.to_string()
}

fn fetch_rawg_assets(api_key: &str, title: &str) -> Option<RawgAssets> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(4))
        .user_agent("OG-Launcher/0.1")
        .build()
        .ok()?;
    let search_url = format!(
        "https://api.rawg.io/api/games?key={}&search={}&search_precise=true&page_size=1",
        url_query_encode(api_key),
        url_query_encode(title)
    );
    let search_json = rawg_get_json(&client, &search_url)?;
    let result = search_json.get("results")?.as_array()?.first()?.clone();
    let id = result.get("id").and_then(|value| value.as_u64());

    let mut cover_url = rawg_string_field(&result, "background_image");
    let mut logo_url = cover_url.clone();
    let mut icon_url = cover_url.clone();

    if let Some(game_id) = id {
        let detail_url = format!(
            "https://api.rawg.io/api/games/{game_id}?key={}",
            url_query_encode(api_key)
        );
        if let Some(detail_json) = rawg_get_json(&client, &detail_url) {
            cover_url = rawg_string_field(&detail_json, "background_image").or(cover_url);
            logo_url = rawg_string_field(&detail_json, "background_image_additional")
                .or(cover_url.clone());
        }

        let screenshots_url = format!(
            "https://api.rawg.io/api/games/{game_id}/screenshots?key={}&page_size=1",
            url_query_encode(api_key)
        );
        if let Some(screenshots_json) = rawg_get_json(&client, &screenshots_url) {
            icon_url = screenshots_json
                .get("results")
                .and_then(|value| value.as_array())
                .and_then(|results| results.first())
                .and_then(|screenshot| rawg_string_field(screenshot, "image"))
                .or_else(|| icon_url.clone());
        }
    }

    Some(RawgAssets {
        cover_url,
        logo_url,
        icon_url,
        fetched_at: current_unix_timestamp(),
    })
}

fn rawg_get_json(client: &reqwest::blocking::Client, url: &str) -> Option<serde_json::Value> {
    let response = client.get(url).send().ok()?;

    if !response.status().is_success() {
        return None;
    }

    response.json::<serde_json::Value>().ok()
}

fn rawg_string_field(value: &serde_json::Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn url_query_encode(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());

    for byte in value.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(*byte as char)
            }
            b' ' => encoded.push('+'),
            _ => encoded.push_str(&format!("%{:02X}", byte)),
        }
    }

    encoded
}

fn battlenet_banner_asset(title: &str, theme: &BattleNetAssetTheme) -> String {
    let title = xml_escape(&title.to_uppercase());
    let family = xml_escape(theme.family);
    let initials = xml_escape(theme.initials);
    let svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 420">
<defs>
<linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="{bg}"/><stop offset="1" stop-color="{bg_alt}"/></linearGradient>
<pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="2" fill="#000" opacity=".18"/></pattern>
</defs>
<rect width="1280" height="420" fill="url(#bg)"/>
<rect width="1280" height="420" fill="url(#dots)"/>
<path d="M0 324 1280 180v240H0z" fill="{accent}" opacity=".18"/>
<path d="M900 0h380v420H812z" fill="{accent}" opacity=".16"/>
<g transform="translate(90 68)">
<rect x="0" y="0" width="206" height="206" fill="{accent}" stroke="#000" stroke-width="12"/>
<rect x="16" y="16" width="174" height="174" fill="{bg}" stroke="#000" stroke-width="6"/>
<text x="103" y="132" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="76" fill="{accent_alt}">{initials}</text>
</g>
<g transform="translate(338 98)">
<text x="0" y="46" font-family="Arial Black, Impact, sans-serif" font-size="48" fill="{accent_alt}" letter-spacing="3">{family}</text>
<text x="0" y="145" font-family="Arial Black, Impact, sans-serif" font-size="78" fill="#fff" textLength="820" lengthAdjust="spacingAndGlyphs">{title}</text>
<rect x="0" y="184" width="410" height="18" fill="{accent}" stroke="#000" stroke-width="6"/>
</g>
<text x="1180" y="360" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="28" fill="{accent_alt}" opacity=".9">BATTLE.NET</text>
</svg>"##,
        bg = theme.bg,
        bg_alt = theme.bg_alt,
        accent = theme.accent,
        accent_alt = theme.accent_alt,
        family = family,
        title = title,
        initials = initials,
    );

    svg_data_url(&svg)
}

fn battlenet_logo_asset(title: &str, theme: &BattleNetAssetTheme) -> String {
    let title = xml_escape(&title.to_uppercase());
    let family = xml_escape(theme.family);
    let svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 220">
<rect x="10" y="20" width="680" height="180" rx="0" fill="{bg}" stroke="#000" stroke-width="12"/>
<text x="350" y="92" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="42" fill="{accent}" letter-spacing="2">{family}</text>
<text x="350" y="158" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="48" fill="#fff" textLength="600" lengthAdjust="spacingAndGlyphs">{title}</text>
</svg>"##,
        bg = theme.bg,
        accent = theme.accent,
        family = family,
        title = title,
    );

    svg_data_url(&svg)
}

fn battlenet_icon_asset(theme: &BattleNetAssetTheme) -> String {
    let initials = xml_escape(theme.initials);
    let svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
<rect width="256" height="256" fill="{accent}" stroke="#000" stroke-width="16"/>
<rect x="30" y="30" width="196" height="196" fill="{bg}" stroke="#000" stroke-width="8"/>
<circle cx="128" cy="128" r="76" fill="{bg_alt}" stroke="{accent_alt}" stroke-width="10"/>
<text x="128" y="151" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="62" fill="{accent_alt}">{initials}</text>
</svg>"##,
        bg = theme.bg,
        bg_alt = theme.bg_alt,
        accent = theme.accent,
        accent_alt = theme.accent_alt,
        initials = initials,
    );

    svg_data_url(&svg)
}

fn svg_data_url(svg: &str) -> String {
    format!("data:image/svg+xml,{}", percent_encode_svg(svg))
}

fn percent_encode_svg(svg: &str) -> String {
    let mut encoded = String::with_capacity(svg.len());

    for byte in svg.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' | b':' => {
                encoded.push(*byte as char)
            }
            b' ' => encoded.push_str("%20"),
            b'\n' | b'\r' | b'\t' => {}
            _ => encoded.push_str(&format!("%{:02X}", byte)),
        }
    }

    encoded
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn scan_battlenet_games() -> Vec<InstalledGame> {
    let mut games = Vec::new();
    let mut seen = HashSet::new();

    for install in read_battlenet_registry_installs() {
        if !install.install_dir.is_dir() || is_ignored_game_directory(&install.install_dir) {
            continue;
        }

        let title = install.title.trim();
        if title.is_empty() || !seen.insert(title.to_lowercase()) {
            continue;
        }

        let (online_cover, online_logo, online_icon) = get_battlenet_assets(&install.uid, title);

        let banner_path = online_cover.or_else(|| find_local_banner_asset(&install.install_dir));
        let logo_path = online_logo.or_else(|| find_local_logo_asset(&install.install_dir));
        let icon_path = online_icon
            .or_else(|| install.icon_path.clone())
            .or_else(|| find_local_icon_asset(&install.install_dir));

        let mut game = installed_game(
            &format!("battlenet-{}", install.uid),
            title.to_string(),
            "Battle.net".to_string(),
            Some(path_to_string(install.install_dir.clone())),
            banner_path,
        );

        game.logo_url = logo_path;
        game.icon_url = icon_path;
        game.launch_uri = Some(format!("battlenet://{}", install.uid));
        game = apply_battlenet_assets(game, install.icon_path.as_deref());

        if let Some(timestamp) = get_dir_last_modified(&install.install_dir) {
            game.last_played_at = Some(unix_timestamp_to_iso(timestamp));
        }

        games.push(game);
    }

    games
}

fn scan_ubisoft_games() -> Vec<InstalledGame> {
    let mut candidates = Vec::new();

    if let Some(program_files_x86) = env_path("ProgramFiles(x86)") {
        candidates.push(
            program_files_x86
                .join("Ubisoft")
                .join("Ubisoft Game Launcher")
                .join("games"),
        );
        candidates.push(
            program_files_x86
                .join("Ubisoft Game Launcher")
                .join("games"),
        );
    }

    if let Some(program_files) = env_path("ProgramFiles") {
        candidates.push(
            program_files
                .join("Ubisoft")
                .join("Ubisoft Game Launcher")
                .join("games"),
        );
        candidates.push(program_files.join("Ubisoft Game Launcher").join("games"));
    }

    candidates.push(PathBuf::from(r"C:\Ubisoft Games"));

    let mut games = collect_directory_games(candidates, "ubisoft", "Ubisoft Connect");
    let mut seen_titles = games
        .iter()
        .map(|game| game.title.to_lowercase())
        .collect::<HashSet<_>>();

    for install in read_ubisoft_registry_installs() {
        if !install.install_dir.is_dir() || is_ignored_game_directory(&install.install_dir) {
            continue;
        }

        let Some(title) = install
            .install_dir
            .file_name()
            .and_then(|name| name.to_str())
            .map(str::trim)
            .filter(|title| !title.is_empty())
        else {
            continue;
        };

        let launcher_assets = find_ubisoft_launcher_assets(&install.install_id);

        if !seen_titles.insert(title.to_lowercase()) {
            apply_ubisoft_launcher_assets(&mut games, title, launcher_assets);
            continue;
        }

        let mut game = installed_game(
            &format!("ubisoft-{title}"),
            title.to_string(),
            "Ubisoft Connect".to_string(),
            Some(path_to_string(install.install_dir.clone())),
            launcher_assets
                .cover_url
                .or_else(|| find_local_banner_asset(&install.install_dir)),
        );
        game.logo_url = launcher_assets
            .logo_url
            .or_else(|| find_local_logo_asset(&install.install_dir));
        game.icon_url = launcher_assets
            .icon_url
            .or_else(|| find_local_icon_asset(&install.install_dir));
        if let Some(timestamp) = get_dir_last_modified(&install.install_dir) {
            game.last_played_at = Some(unix_timestamp_to_iso(timestamp));
        }

        games.push(game);
    }

    games
}

fn apply_ubisoft_launcher_assets(
    games: &mut [InstalledGame],
    title: &str,
    assets: UbisoftLauncherAssets,
) {
    let Some(game) = games
        .iter_mut()
        .find(|game| game.title.eq_ignore_ascii_case(title))
    else {
        return;
    };

    if game.cover_url.is_none() {
        game.cover_url = assets.cover_url;
    }

    if game.logo_url.is_none() {
        game.logo_url = assets.logo_url;
    }

    if game.icon_url.is_none() {
        game.icon_url = assets.icon_url;
    }
}

fn scan_xbox_games() -> Vec<InstalledGame> {
    let mut roots = Vec::new();

    for xbox_root in local_drive_roots()
        .into_iter()
        .map(|drive| drive.join("XboxGames"))
        .filter(|path| path.is_dir())
    {
        roots.extend(read_xbox_games_root_dirs(&xbox_root));
        collect_xbox_config_roots(&xbox_root, 0, &mut roots);
    }

    roots.extend(read_windows_app_game_roots());

    collect_xbox_games_from_roots(roots)
}

fn collect_xbox_games_from_roots(roots: Vec<PathBuf>) -> Vec<InstalledGame> {
    let mut games = Vec::new();
    let mut seen_paths = HashSet::new();
    let mut seen_titles = HashSet::new();

    for root in roots {
        if !root.is_dir() || is_ignored_game_directory(&root) {
            continue;
        }

        let canonical_key = root.canonicalize().unwrap_or_else(|_| root.clone());
        if !seen_paths.insert(canonical_key) {
            continue;
        }

        let title = xbox_game_title(&root).or_else(|| {
            (!is_windows_apps_path(&root)).then(|| {
                root.file_name()
                    .and_then(|name| name.to_str())
                    .map(clean_xbox_package_title)
            })?
        });

        let Some(title) = title.filter(|title| is_valid_game_title(title)) else {
            continue;
        };

        if title.is_empty() || !seen_titles.insert(title.to_lowercase()) {
            continue;
        }

        let mut game = installed_game(
            &format!("xbox-{title}"),
            title,
            "Xbox".to_string(),
            Some(path_to_string(root.clone())),
            find_local_banner_asset(&root),
        );
        game.logo_url = find_local_logo_asset(&root);
        game.icon_url = find_local_icon_asset(&root)
            .or_else(|| game.logo_url.clone())
            .or_else(|| game.cover_url.clone());
        if let Some(timestamp) = get_dir_last_modified(&root) {
            game.last_played_at = Some(unix_timestamp_to_iso(timestamp));
        }

        games.push(game);
    }

    games
}

fn read_xbox_games_root_dirs(xbox_root: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(xbox_root) else {
        return Vec::new();
    };

    entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_dir() && !is_ignored_game_directory(path))
        .collect()
}

fn collect_xbox_config_roots(path: &Path, depth: usize, roots: &mut Vec<PathBuf>) {
    if depth > 5 {
        return;
    }

    let config_path = path.join("MicrosoftGame.config");
    if config_path.is_file() {
        roots.push(path.to_path_buf());
        return;
    }

    let Ok(entries) = fs::read_dir(path) else {
        return;
    };

    for entry in entries.flatten() {
        let child = entry.path();
        if !child.is_dir() || is_ignored_game_directory(&child) {
            continue;
        }

        collect_xbox_config_roots(&child, depth + 1, roots);
    }
}

fn read_windows_app_game_roots() -> Vec<PathBuf> {
    read_windows_app_install_locations()
        .into_iter()
        .filter(|path| is_windows_app_game_root(path))
        .collect()
}

#[cfg(windows)]
fn read_windows_app_install_locations() -> Vec<PathBuf> {
    Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "Get-AppxPackage | ForEach-Object { $_.InstallLocation }",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| {
            String::from_utf8_lossy(&output.stdout)
                .lines()
                .map(str::trim)
                .filter(|line| !line.is_empty())
                .map(PathBuf::from)
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(not(windows))]
fn read_windows_app_install_locations() -> Vec<PathBuf> {
    Vec::new()
}

fn is_windows_app_game_root(path: &Path) -> bool {
    if !path.is_dir() {
        return false;
    }

    path.join("MicrosoftGame.config").is_file()
        || path
            .join("AppxManifest.xml")
            .is_file()
            .then(|| fs::read_to_string(path.join("AppxManifest.xml")).ok())
            .flatten()
            .is_some_and(|contents| {
                contents.contains("Microsoft.XboxGameCallableUI") || contents.contains("XboxLive")
            })
}

fn collect_directory_games(
    candidates: Vec<PathBuf>,
    id_prefix: &str,
    source: &str,
) -> Vec<InstalledGame> {
    collect_directory_games_with_title_resolver(candidates, id_prefix, source, |_| None)
}

fn collect_directory_games_with_title_resolver(
    candidates: Vec<PathBuf>,
    id_prefix: &str,
    source: &str,
    title_resolver: fn(&Path) -> Option<String>,
) -> Vec<InstalledGame> {
    let mut games = Vec::new();
    let mut seen = HashSet::new();

    for candidate in candidates {
        let Ok(entries) = fs::read_dir(candidate) else {
            continue;
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() || is_ignored_game_directory(&path) {
                continue;
            }

            let Some(folder_title) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };

            let title = title_resolver(&path).unwrap_or_else(|| folder_title.trim().to_string());
            if title.is_empty() || !seen.insert(title.to_lowercase()) {
                continue;
            }

            let mut game = installed_game(
                &format!("{id_prefix}-{title}"),
                title,
                source.to_string(),
                Some(path_to_string(path.clone())),
                find_local_banner_asset(&path),
            );
            game.logo_url = find_local_logo_asset(&path);
            game.icon_url = find_local_icon_asset(&path);
            if let Some(timestamp) = get_dir_last_modified(&path) {
                game.last_played_at = Some(unix_timestamp_to_iso(timestamp));
            }

            games.push(game);
        }
    }

    games
}

fn xbox_game_title(path: &Path) -> Option<String> {
    let config_paths = [
        path.join("MicrosoftGame.config"),
        path.join("Content").join("MicrosoftGame.config"),
        path.join("AppxManifest.xml"),
    ];

    config_paths
        .into_iter()
        .filter_map(|config_path| fs::read_to_string(config_path).ok())
        .filter_map(|contents| {
            find_xml_attribute(&contents, "ShellVisuals", "DisplayName")
                .or_else(|| find_xml_attribute(&contents, "ShellVisuals", "DefaultDisplayName"))
                .or_else(|| find_xml_attribute(&contents, "uap:VisualElements", "DisplayName"))
                .or_else(|| find_xml_attribute(&contents, "VisualElements", "DisplayName"))
                .or_else(|| find_xml_attribute(&contents, "Game", "Name"))
                .or_else(|| find_xml_attribute(&contents, "Identity", "Name"))
        })
        .filter(|title| !is_unresolved_resource_title(title))
        .map(|title| clean_xbox_package_title(&title))
        .find(|title| is_valid_game_title(title))
}

fn is_valid_game_title(title: &str) -> bool {
    let normalized = title.trim().to_lowercase();
    let compact = normalized
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .collect::<String>();

    !normalized.is_empty()
        && !is_unresolved_resource_title(&normalized)
        && normalized != "displayname"
        && normalized != "pkgdisplayname"
        && !matches!(
            compact.as_str(),
            "gamingservices"
                | "xboxgamecallableui"
                | "xboxgamingoverlay"
                | "xboxidentityprovider"
                | "xboxspeechtotextoverlay"
                | "xboxtcui"
        )
}

fn is_unresolved_resource_title(title: &str) -> bool {
    let normalized = title.trim().to_lowercase().replace(' ', "-");

    normalized.starts_with("ms-resource:")
        || normalized.starts_with("ms-resource-")
        || normalized.contains("ms-resource:displayname")
        || normalized.contains("ms-resource:pkgdisplayname")
}

fn is_windows_apps_path(path: &Path) -> bool {
    path.components().any(|component| {
        component
            .as_os_str()
            .to_str()
            .is_some_and(|value| value.eq_ignore_ascii_case("WindowsApps"))
    })
}

fn clean_xbox_package_title(value: &str) -> String {
    let package_name = value
        .split('_')
        .next()
        .unwrap_or(value)
        .rsplit('.')
        .next()
        .unwrap_or(value)
        .trim();

    package_name
        .replace('-', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn find_local_banner_asset(path: &Path) -> Option<String> {
    let config_paths = [
        path.join("MicrosoftGame.config"),
        path.join("Content").join("MicrosoftGame.config"),
    ];

    for config_path in config_paths {
        let Ok(contents) = fs::read_to_string(&config_path) else {
            continue;
        };

        let base_path = config_path.parent().unwrap_or(path);
        for attribute in [
            "SplashScreenImage",
            "Wide310x150Logo",
            "HeroImage",
            "BackgroundImage",
            "StoreLogo",
            "Logo",
            "Square150x150Logo",
        ] {
            if let Some(asset_path) = find_xml_attribute(&contents, "ShellVisuals", attribute)
                .and_then(|asset| resolve_local_asset(base_path, &asset))
            {
                return Some(path_to_string(asset_path));
            }
        }
    }

    find_named_image_asset(
        path,
        &[
            "library_hero",
            "libraryhero",
            "hero",
            "header",
            "banner",
            "landscape",
            "splash",
            "background",
            "capsule",
            "capsule_616x353",
            "cover",
            "poster",
        ],
    )
}

fn find_local_logo_asset(path: &Path) -> Option<String> {
    let config_paths = [
        path.join("MicrosoftGame.config"),
        path.join("Content").join("MicrosoftGame.config"),
    ];

    for config_path in config_paths {
        let Ok(contents) = fs::read_to_string(&config_path) else {
            continue;
        };

        let base_path = config_path.parent().unwrap_or(path);
        for attribute in ["Logo", "StoreLogo", "Square150x150Logo"] {
            if let Some(asset_path) = find_xml_attribute(&contents, "ShellVisuals", attribute)
                .and_then(|asset| resolve_local_asset(base_path, &asset))
            {
                return Some(path_to_string(asset_path));
            }
        }
    }

    find_named_image_asset(path, &["library_logo", "title", "storelogo", "logo"])
}

fn find_local_icon_asset(path: &Path) -> Option<String> {
    let config_paths = [
        path.join("MicrosoftGame.config"),
        path.join("Content").join("MicrosoftGame.config"),
    ];

    for config_path in config_paths {
        let Ok(contents) = fs::read_to_string(&config_path) else {
            continue;
        };

        let base_path = config_path.parent().unwrap_or(path);
        for attribute in ["Square44x44Logo", "Square150x150Logo", "StoreLogo", "Logo"] {
            if let Some(asset_path) = find_xml_attribute(&contents, "ShellVisuals", attribute)
                .and_then(|asset| resolve_local_asset(base_path, &asset))
            {
                return Some(path_to_string(asset_path));
            }
        }
    }

    find_named_image_asset(
        path,
        &[
            "icon",
            "appicon",
            "square44",
            "square150",
            "storelogo",
            "logo",
        ],
    )
}

fn resolve_local_asset(base_path: &Path, asset: &str) -> Option<PathBuf> {
    let normalized = asset.trim().replace('/', "\\");
    if normalized.is_empty() || normalized.starts_with("ms-resource:") {
        return None;
    }

    let direct_path = base_path.join(&normalized);
    if direct_path.exists() {
        return Some(direct_path);
    }

    let asset_path = PathBuf::from(&normalized);
    let parent = asset_path.parent()?;
    let stem = asset_path.file_stem()?.to_str()?.to_lowercase();

    let Ok(entries) = fs::read_dir(base_path.join(parent)) else {
        return None;
    };

    entries.flatten().map(|entry| entry.path()).find(|path| {
        path.is_file()
            && is_supported_image(path)
            && path
                .file_stem()
                .and_then(|name| name.to_str())
                .map(|name| name.to_lowercase().starts_with(&stem))
                .unwrap_or(false)
    })
}

fn find_named_image_asset(path: &Path, name_needles: &[&str]) -> Option<String> {
    let mut roots = vec![path.to_path_buf()];
    for child in [
        "assets",
        "Assets",
        "Content",
        "content",
        "images",
        "Images",
        "Resources",
        "resources",
    ] {
        roots.push(path.join(child));
    }

    let mut candidates = Vec::new();
    let mut scanned_entries = 0usize;

    for root in roots {
        collect_named_image_assets(
            &root,
            name_needles,
            0,
            3,
            &mut scanned_entries,
            &mut candidates,
        );

        if scanned_entries > 900 {
            break;
        }
    }

    candidates
        .into_iter()
        .max_by_key(|candidate| candidate.score)
        .map(|candidate| path_to_string(candidate.path))
}

fn is_supported_image(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|extension| extension.to_str())
            .map(str::to_lowercase)
            .as_deref(),
        Some("ico" | "jpg" | "jpeg" | "png" | "webp")
    )
}

struct LocalImageCandidate {
    path: PathBuf,
    score: i32,
}

fn collect_named_image_assets(
    directory: &Path,
    name_needles: &[&str],
    depth: usize,
    max_depth: usize,
    scanned_entries: &mut usize,
    candidates: &mut Vec<LocalImageCandidate>,
) {
    if depth > max_depth || *scanned_entries > 900 {
        return;
    }

    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };

    for entry in entries.flatten() {
        *scanned_entries += 1;
        if *scanned_entries > 900 {
            return;
        }

        let path = entry.path();
        if path.is_dir() {
            let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            let normalized = name.to_lowercase();
            if matches!(
                normalized.as_str(),
                "binaries" | "bin" | "data" | "engine" | "plugins" | "redist" | "support"
            ) {
                continue;
            }
            collect_named_image_assets(
                &path,
                name_needles,
                depth + 1,
                max_depth,
                scanned_entries,
                candidates,
            );
            continue;
        }

        if !path.is_file() || !is_supported_image(&path) {
            continue;
        }

        let Some(stem) = path.file_stem().and_then(|name| name.to_str()) else {
            continue;
        };
        let normalized = stem.to_lowercase();
        let Some((needle_index, needle)) = name_needles
            .iter()
            .enumerate()
            .find(|(_, needle)| normalized.contains(**needle))
        else {
            continue;
        };

        let mut score = ((name_needles.len() - needle_index) as i32) * 100;
        if normalized == *needle {
            score += 60;
        } else if normalized.starts_with(*needle) {
            score += 35;
        }
        score -= (depth as i32) * 8;

        candidates.push(LocalImageCandidate { path, score });
    }
}

fn find_xml_attribute(contents: &str, element: &str, attribute: &str) -> Option<String> {
    let element_start = contents.find(&format!("<{element}"))?;
    let after_element = &contents[element_start..];
    let element_end = after_element.find('>')?;
    let element_text = &after_element[..element_end];
    let attribute_start = element_text.find(&format!("{attribute}=\""))?;
    let after_attribute = &element_text[attribute_start + attribute.len() + 2..];
    let value_end = after_attribute.find('"')?;

    Some(after_attribute[..value_end].to_string())
}

fn is_ignored_game_directory(path: &Path) -> bool {
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

fn local_drive_roots() -> Vec<PathBuf> {
    if !cfg!(target_os = "windows") {
        return Vec::new();
    }

    (b'C'..=b'Z')
        .map(|letter| PathBuf::from(format!("{}:\\", letter as char)))
        .filter(|path| path.exists())
        .collect()
}

struct UbisoftRegistryInstall {
    install_id: String,
    install_dir: PathBuf,
}

struct UbisoftLauncherAssets {
    cover_url: Option<String>,
    logo_url: Option<String>,
    icon_url: Option<String>,
}

fn read_ubisoft_registry_installs() -> Vec<UbisoftRegistryInstall> {
    if !cfg!(target_os = "windows") {
        return Vec::new();
    }

    [
        r"HKLM\SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs",
        r"HKLM\SOFTWARE\Ubisoft\Launcher\Installs",
    ]
    .into_iter()
    .flat_map(query_registry_sections)
    .filter_map(|section| {
        let install_id = ubisoft_install_id_from_registry_section(&section)?;
        let install_dir = section
            .lines()
            .filter_map(|line| registry_string_value(line, "InstallDir"))
            .map(PathBuf::from)
            .find(|path| path.exists())?;

        Some(UbisoftRegistryInstall {
            install_id,
            install_dir,
        })
    })
    .collect()
}

fn ubisoft_install_id_from_registry_section(section: &str) -> Option<String> {
    let header = section
        .lines()
        .map(str::trim)
        .find(|line| line.starts_with("HKEY_"))?;
    header
        .rsplit('\\')
        .next()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn registry_string_value(line: &str, value_name: &str) -> Option<String> {
    let trimmed = line.trim();
    let remainder = trimmed.strip_prefix(value_name)?.trim_start();
    let value = remainder.strip_prefix("REG_SZ")?.trim();

    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

fn decode_oem_ansi(bytes: &[u8]) -> String {
    if let Ok(utf8_str) = String::from_utf8(bytes.to_vec()) {
        return utf8_str;
    }
    let mut s = String::with_capacity(bytes.len());
    for &b in bytes {
        match b {
            0..=127 => s.push(b as char),
            0x84 | 0xE4 => s.push('ä'),
            0x94 | 0xF6 => s.push('ö'),
            0x81 | 0xFC => s.push('ü'),
            0x8E | 0xC4 => s.push('Ä'),
            0x99 | 0xD6 => s.push('Ö'),
            0x9A | 0xDC => s.push('Ü'),
            0xE1 | 0xDF => s.push('ß'),
            0x82 | 0xE9 => s.push('é'),
            0x8A | 0xE8 => s.push('è'),
            0x85 | 0xE0 => s.push('à'),
            0x91 | 0xE6 => s.push('æ'),
            0x92 | 0xC6 => s.push('Æ'),
            _ => s.push(b as char),
        }
    }
    s
}

struct BattleNetRegistryInstall {
    uid: String,
    title: String,
    install_dir: PathBuf,
    icon_path: Option<String>,
}

fn extract_arg(input: &str, arg_name: &str) -> Option<String> {
    let needle = format!("{}=", arg_name);
    let idx = input.find(&needle)?;
    let start = idx + needle.len();
    let remaining = &input[start..];

    if remaining.starts_with('"') {
        let end_quote = remaining[1..].find('"')?;
        Some(remaining[1..end_quote + 1].to_string())
    } else {
        let end = remaining.find(' ').unwrap_or(remaining.len());
        Some(remaining[..end].to_string())
    }
}

fn read_battlenet_registry_installs() -> Vec<BattleNetRegistryInstall> {
    if !cfg!(target_os = "windows") {
        return Vec::new();
    }

    [
        r"HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
        r"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
    ]
    .into_iter()
    .flat_map(query_registry_sections)
    .filter_map(|section| {
        if !section.contains("HKEY_") {
            return None;
        }

        let uninstall_str = section
            .lines()
            .filter_map(|line| registry_string_value(line, "UninstallString"))
            .find(|val| !val.is_empty())?;

        if !uninstall_str.contains("Blizzard Uninstaller.exe") {
            return None;
        }

        let uid = extract_arg(&uninstall_str, "--uid")?;
        if uid == "battle.net" {
            return None;
        }

        let title = section
            .lines()
            .filter_map(|line| registry_string_value(line, "DisplayName"))
            .find(|val| !val.is_empty())
            .or_else(|| extract_arg(&uninstall_str, "--displayname"))?;

        let install_dir = section
            .lines()
            .filter_map(|line| {
                registry_string_value(line, "InstallLocation")
                    .or_else(|| registry_string_value(line, "InstallSource"))
            })
            .map(PathBuf::from)
            .find(|path| path.exists())?;

        let icon_path = section
            .lines()
            .filter_map(|line| registry_string_value(line, "DisplayIcon"))
            .map(|icon| {
                if let Some(pos) = icon.rfind(',') {
                    icon[..pos].trim().to_string()
                } else {
                    icon.trim().to_string()
                }
            })
            .filter(|icon| !icon.is_empty())
            .find(|icon| Path::new(icon).exists());

        Some(BattleNetRegistryInstall {
            uid,
            title,
            install_dir,
            icon_path,
        })
    })
    .collect()
}

fn find_ubisoft_launcher_assets(install_id: &str) -> UbisoftLauncherAssets {
    let Some(config_segment) = read_ubisoft_launcher_config_segment(install_id) else {
        return UbisoftLauncherAssets {
            cover_url: None,
            logo_url: None,
            icon_url: None,
        };
    };

    let cover_url = find_ubisoft_config_asset(
        &config_segment,
        &[
            "splash_image",
            "background_image",
            "thumb_image",
            "dialog_image",
        ],
    );
    let logo_url = find_ubisoft_config_asset(&config_segment, &["logo_image"]);
    let icon_url = find_ubisoft_config_asset(&config_segment, &["icon_image"])
        .or_else(|| logo_url.clone())
        .or_else(|| cover_url.clone());

    UbisoftLauncherAssets {
        cover_url,
        logo_url,
        icon_url,
    }
}

fn read_ubisoft_launcher_config_segment(install_id: &str) -> Option<String> {
    let contents = read_ubisoft_launcher_configurations()?;
    let needle = format!("Installs\\{install_id}\\InstallDir");
    let install_index = contents.find(&needle)?;
    let segment_start = contents[..install_index].rfind("version: 2.0").unwrap_or(0);
    let segment_end = contents[install_index..]
        .find("version: 2.0")
        .map(|index| install_index + index)
        .unwrap_or(contents.len());

    contents
        .get(segment_start..segment_end)
        .map(ToOwned::to_owned)
}

fn read_ubisoft_launcher_configurations() -> Option<String> {
    ubisoft_launcher_config_paths()
        .into_iter()
        .filter_map(|path| fs::read(path).ok())
        .map(|contents| String::from_utf8_lossy(&contents).into_owned())
        .find(|contents| contents.contains("Installs\\"))
}

fn ubisoft_launcher_config_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Some(local_app_data) = env_path("LOCALAPPDATA") {
        paths.push(
            local_app_data
                .join("Ubisoft Game Launcher")
                .join("cache")
                .join("configuration")
                .join("configurations"),
        );
    }

    paths.push(
        PathBuf::from(r"C:\ProgramData")
            .join("Ubisoft")
            .join("Ubisoft Game Launcher")
            .join("cache")
            .join("configuration")
            .join("configurations"),
    );

    paths
}

fn find_ubisoft_config_asset(config_segment: &str, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| find_yaml_like_value(&config_segment, key))
        .filter_map(|file_name| find_ubisoft_cached_asset(&file_name))
        .next()
}

fn find_yaml_like_value(contents: &str, key: &str) -> Option<String> {
    let needle = format!("{key}:");
    contents.lines().find_map(|line| {
        let trimmed = line.trim();
        let value = trimmed
            .strip_prefix(&needle)?
            .trim()
            .trim_matches('\'')
            .trim_matches('"');

        if value.is_empty()
            || value.starts_with('l') && value[1..].chars().all(|c| c.is_ascii_digit())
        {
            None
        } else {
            Some(value.to_string())
        }
    })
}

fn find_ubisoft_cached_asset(file_name: &str) -> Option<String> {
    let normalized = file_name.trim().replace('/', "\\");
    if normalized.is_empty() {
        return None;
    }

    for root in ubisoft_cached_asset_roots() {
        let direct_path = root.join(&normalized);
        if direct_path.exists() && direct_path.is_file() {
            return Some(path_to_string(direct_path));
        }

        let file_stem = Path::new(&normalized)
            .file_stem()
            .and_then(|stem| stem.to_str())?;
        let Ok(entries) = fs::read_dir(&root) else {
            continue;
        };

        if let Some(path) = entries.flatten().map(|entry| entry.path()).find(|path| {
            path.is_file()
                && is_supported_image(path)
                && path
                    .file_stem()
                    .and_then(|stem| stem.to_str())
                    .is_some_and(|stem| stem.eq_ignore_ascii_case(file_stem))
        }) {
            return Some(path_to_string(path));
        }
    }

    None
}

fn ubisoft_cached_asset_roots() -> Vec<PathBuf> {
    let mut roots = vec![PathBuf::from(r"C:\ProgramData")
        .join("Ubisoft")
        .join("Ubisoft Game Launcher")
        .join("cache")
        .join("assets")];

    if let Some(local_app_data) = env_path("LOCALAPPDATA") {
        roots.push(
            local_app_data
                .join("Ubisoft Game Launcher")
                .join("cache")
                .join("assets"),
        );
    }

    roots
}

fn find_steam_dir() -> Option<PathBuf> {
    let mut candidates = Vec::new();

    if cfg!(target_os = "windows") {
        if let Some(program_files_x86) = env_path("ProgramFiles(x86)") {
            candidates.push(program_files_x86.join("Steam"));
        }

        if let Some(program_files) = env_path("ProgramFiles") {
            candidates.push(program_files.join("Steam"));
        }

        candidates.push(PathBuf::from(r"C:\Steam"));
    } else {
        if let Some(home) = env_path("HOME") {
            // Standard Linux paths
            candidates.push(home.join(".local/share/Steam"));
            candidates.push(home.join(".steam/steam"));
            candidates.push(home.join(".steam/root"));

            // Flatpak Steam paths
            candidates.push(home.join(".var/app/com.valvesoftware.Steam/.local/share/Steam"));
            candidates.push(home.join(".var/app/com.valvesoftware.Steam/data/Steam"));

            // macOS path
            candidates.push(home.join("Library/Application Support/Steam"));
        }
    }

    candidates.into_iter().find(|candidate| candidate.exists())
}

fn read_steam_library_folders(steam_dir: &Path) -> Vec<PathBuf> {
    let library_file = steam_dir.join("steamapps").join("libraryfolders.vdf");
    let Ok(contents) = fs::read_to_string(library_file) else {
        return Vec::new();
    };

    contents
        .lines()
        .filter_map(|line| find_quoted_value(line, "path"))
        .map(|path| PathBuf::from(path.replace("\\\\", "\\")))
        .filter(|path| path.exists())
        .collect()
}

fn find_steam_userdata_dirs(steam_dir: &Path) -> Vec<PathBuf> {
    let userdata = steam_dir.join("userdata");
    let Ok(entries) = fs::read_dir(&userdata) else {
        return Vec::new();
    };

    entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().is_dir())
        .filter(|entry| {
            entry
                .file_name()
                .to_str()
                .map(|name| name.chars().all(|c| c.is_ascii_digit()))
                .unwrap_or(false)
        })
        .map(|entry| entry.path())
        .collect()
}

#[derive(Debug, Default, Clone)]
struct SteamAppActivity {
    last_played: Option<u64>,
    playtime_minutes: Option<u32>,
}

impl SteamAppActivity {
    fn has_data(&self) -> bool {
        self.last_played.is_some() || self.playtime_minutes.is_some()
    }

    fn merge(&mut self, other: SteamAppActivity) {
        if let Some(timestamp) = other.last_played {
            self.last_played = Some(
                self.last_played
                    .map_or(timestamp, |existing| existing.max(timestamp)),
            );
        }

        if let Some(minutes) = other.playtime_minutes {
            self.playtime_minutes = Some(
                self.playtime_minutes
                    .map_or(minutes, |existing| existing.max(minutes)),
            );
        }
    }
}

fn steam_activity_from_manifest(contents: &str) -> SteamAppActivity {
    let last_played = find_quoted_value(contents, "LastPlayed")
        .or_else(|| find_quoted_value(contents, "LastPlayedTime"))
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|timestamp| *timestamp > 1_000_000_000 && *timestamp < 2_000_000_000);

    let playtime_minutes = [
        "PlaytimeForever",
        "playtime_forever",
        "PlaytimeWindows",
        "PlaytimeMacOS",
        "PlaytimeLinux",
        "Playtime",
    ]
    .into_iter()
    .filter_map(|key| find_quoted_value(contents, key))
    .filter_map(|value| value.parse::<u32>().ok())
    .max()
    .filter(|minutes| *minutes > 0);

    SteamAppActivity {
        last_played,
        playtime_minutes,
    }
}

fn read_steam_activity(steam_dir: &Path) -> HashMap<String, SteamAppActivity> {
    let mut result = HashMap::new();

    for userdata_dir in find_steam_userdata_dirs(steam_dir) {
        let localconfig = userdata_dir.join("config").join("localconfig.vdf");
        let Ok(contents) = fs::read_to_string(&localconfig) else {
            continue;
        };

        parse_steam_activity_from_vdf(&contents, &mut result);
    }

    result
}

fn parse_steam_activity_from_vdf(contents: &str, out: &mut HashMap<String, SteamAppActivity>) {
    let lines = contents.lines().collect::<Vec<_>>();
    let mut index = 0;

    while index < lines.len() {
        let trimmed = lines[index].trim();
        let Some(app_id) =
            quoted_key(trimmed).filter(|key| key.chars().all(|c| c.is_ascii_digit()))
        else {
            index += 1;
            continue;
        };

        let Some(open_index) = next_non_empty_line(&lines, index + 1) else {
            break;
        };

        if lines[open_index].trim() != "{" {
            index += 1;
            continue;
        }

        let mut depth = 1;
        let mut cursor = open_index + 1;
        let mut activity = SteamAppActivity::default();

        while cursor < lines.len() && depth > 0 {
            let current = lines[cursor].trim();

            if current == "{" {
                depth += 1;
            } else if current == "}" {
                depth -= 1;
            } else if depth == 1 {
                if let Some((key, value)) = parse_vdf_key_value(current) {
                    if key == "LastPlayed" {
                        if let Ok(timestamp) = value.parse::<u64>() {
                            if timestamp > 1_000_000_000 && timestamp < 2_000_000_000 {
                                activity.last_played = Some(timestamp);
                            }
                        }
                    } else if matches!(
                        key.as_str(),
                        "Playtime" | "playtime_forever" | "PlaytimeForever"
                    ) {
                        if let Ok(minutes) = value.parse::<u32>() {
                            if minutes > 0 {
                                activity.playtime_minutes = Some(minutes);
                            }
                        }
                    }
                }
            }

            cursor += 1;
        }

        if activity.has_data() {
            out.entry(app_id).or_default().merge(activity);
        }

        index = cursor;
    }
}

fn quoted_key(line: &str) -> Option<String> {
    let trimmed = line.trim();
    let end_quote = trimmed.strip_prefix('"')?.find('"')?;
    Some(trimmed[1..end_quote + 1].to_string())
}

fn parse_vdf_key_value(line: &str) -> Option<(String, String)> {
    let trimmed = line.trim();
    let key_end = trimmed.strip_prefix('"')?.find('"')? + 1;
    let key = trimmed[1..key_end].to_string();
    let value_start = trimmed[key_end + 1..].find('"')? + key_end + 2;
    let value_end = trimmed[value_start..].find('"')? + value_start;

    Some((key, trimmed[value_start..value_end].to_string()))
}

fn next_non_empty_line(lines: &[&str], start: usize) -> Option<usize> {
    for (index, line) in lines.iter().enumerate().skip(start) {
        let trimmed = line.trim();
        if !trimmed.is_empty() && !trimmed.starts_with("//") {
            return Some(index);
        }
    }
    None
}

fn get_dir_last_modified(path: &Path) -> Option<u64> {
    let metadata = fs::metadata(path).ok()?;
    let modified = metadata.modified().ok()?;
    system_time_to_unix_timestamp(modified)
}

fn current_unix_timestamp() -> u64 {
    system_time_to_unix_timestamp(SystemTime::now()).unwrap_or_default()
}

fn system_time_to_unix_timestamp(time: SystemTime) -> Option<u64> {
    time.duration_since(UNIX_EPOCH).ok().map(|d| d.as_secs())
}

fn steam_app_id_from_manifest_name(file_name: &str) -> Option<String> {
    file_name
        .strip_prefix("appmanifest_")?
        .strip_suffix(".acf")?
        .chars()
        .all(char::is_numeric)
        .then(|| {
            file_name
                .trim_start_matches("appmanifest_")
                .trim_end_matches(".acf")
                .to_string()
        })
}

fn steam_logo_urls(app_id: &str) -> Vec<String> {
    [
        format!("https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/{app_id}/logo.png"),
        format!("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{app_id}/logo.png"),
        format!("https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/library_logo.png"),
        format!("https://cdn.akamai.steamstatic.com/steam/apps/{app_id}/library_logo.png"),
    ]
    .into_iter()
    .collect()
}

fn steam_icon_urls(app_id: &str, title: &str, steam_dir: &Path) -> Vec<String> {
    let mut urls = Vec::new();

    if let Some(local_icon) = find_local_steam_icon_asset(app_id, steam_dir) {
        push_unique(&mut urls, local_icon);
    }

    for hash in read_steam_assetcache_icon_hashes(app_id, steam_dir) {
        push_unique(&mut urls, steam_community_icon_url(app_id, &hash, "jpg"));
        push_unique(&mut urls, steam_community_icon_url(app_id, &hash, "ico"));
    }

    if let Some(hashes) = read_steam_app_hashes_by_app_id(app_id, steam_dir) {
        push_steam_icon_hash_candidates(&mut urls, app_id, &hashes);
    }

    if let Some(hashes) = read_steam_app_hashes_by_title(title, steam_dir) {
        push_steam_icon_hash_candidates(&mut urls, app_id, &hashes);
    }

    urls
}

fn find_local_steam_icon_asset(app_id: &str, steam_dir: &Path) -> Option<String> {
    let library_cache = steam_dir.join("appcache").join("librarycache");
    let steam_games = steam_dir.join("steam").join("games");
    let icon_hash = read_steam_client_icon_hash(app_id, steam_dir);

    let mut candidates = vec![
        library_cache.join(format!("{app_id}_icon.jpg")),
        library_cache.join(format!("{app_id}_icon.png")),
        library_cache.join(app_id).join("icon.jpg"),
        library_cache.join(app_id).join("icon.png"),
    ];

    if let Some(hash) = icon_hash {
        candidates.push(steam_games.join(format!("{hash}.ico")));
    }

    candidates
        .into_iter()
        .find(|path| path.exists() && path.is_file())
        .map(path_to_string)
}

fn push_steam_icon_hash_candidates(urls: &mut Vec<String>, app_id: &str, hashes: &[String]) {
    for hash in hashes.iter().take(6) {
        push_unique(urls, steam_community_icon_url(app_id, hash, "jpg"));
        push_unique(urls, steam_community_icon_url(app_id, hash, "ico"));
    }
}

fn steam_community_icon_url(app_id: &str, hash: &str, extension: &str) -> String {
    format!(
        "https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/{app_id}/{hash}.{extension}"
    )
}

fn push_unique(values: &mut Vec<String>, value: String) {
    if !values.iter().any(|existing| existing == &value) {
        values.push(value);
    }
}

fn read_steam_assetcache_icon_hashes(app_id: &str, steam_dir: &Path) -> Vec<String> {
    let assetcache_path = steam_dir
        .join("appcache")
        .join("librarycache")
        .join("assetcache.vdf");
    let Some(contents) = fs::read(assetcache_path).ok() else {
        return Vec::new();
    };
    let contents = String::from_utf8_lossy(&contents);
    let Some(app_index) = contents.find(app_id) else {
        return Vec::new();
    };
    let searchable = contents.get(app_index..).unwrap_or_default();
    let record_end = searchable
        .find("change")
        .map(|index| app_index + index)
        .unwrap_or_else(|| next_char_boundary(&contents, app_index + 800));
    let record_end = next_char_boundary(&contents, record_end);
    let Some(segment) = contents.get(app_index..record_end) else {
        return Vec::new();
    };

    extract_steam_jpg_hashes(segment)
}

fn read_steam_client_icon_hash(app_id: &str, steam_dir: &Path) -> Option<String> {
    let appinfo_path = steam_dir.join("appcache").join("appinfo.vdf");
    let contents = fs::read(appinfo_path).ok()?;
    let contents = String::from_utf8_lossy(&contents);
    let app_index = contents.find(app_id)?;
    let segment_start = app_index.saturating_sub(4_000);
    let segment_end = next_char_boundary(&contents, app_index + 12_000);
    let segment = contents.get(segment_start..segment_end)?;
    let hashes = extract_steam_hashes(segment);

    hashes.get(2).cloned()
}

fn read_steam_app_hashes_by_app_id(app_id: &str, steam_dir: &Path) -> Option<Vec<String>> {
    let appinfo_path = steam_dir.join("appcache").join("appinfo.vdf");
    let contents = fs::read(appinfo_path).ok()?;
    let contents = String::from_utf8_lossy(&contents);
    let app_index = contents.find(app_id)?;
    let segment_start = app_index.saturating_sub(1_000);
    let segment_end = next_char_boundary(&contents, app_index + 12_000);
    let segment = contents.get(segment_start..segment_end)?;
    let hashes = extract_steam_hashes(segment);

    (hashes.len() >= 2).then_some(hashes)
}

fn read_steam_app_hashes_by_title(title: &str, steam_dir: &Path) -> Option<Vec<String>> {
    let appinfo_path = steam_dir.join("appcache").join("appinfo.vdf");
    let contents = fs::read(appinfo_path).ok()?;
    let contents = String::from_utf8_lossy(&contents);

    let mut search_from = 0;
    while let Some(searchable_contents) = contents.get(search_from..) {
        let Some(relative_index) = searchable_contents.find(title) else {
            break;
        };

        let title_index = search_from + relative_index;
        let segment_end = next_char_boundary(&contents, title_index + 12_000);
        let Some(segment) = contents.get(title_index..segment_end) else {
            break;
        };

        let hashes = extract_steam_hashes(segment);
        if hashes.len() >= 2 {
            return Some(hashes);
        }

        search_from = title_index + title.len();
    }

    None
}

fn extract_steam_hashes(segment: &str) -> Vec<String> {
    let mut hashes = Vec::new();

    for value in segment.split(|character: char| !character.is_ascii_hexdigit()) {
        if value.len() != 40 || hashes.iter().any(|hash| hash == value) {
            continue;
        }

        hashes.push(value.to_string());
    }

    hashes
}

fn extract_steam_jpg_hashes(segment: &str) -> Vec<String> {
    extract_steam_hashes(segment)
        .into_iter()
        .filter(|hash| segment.contains(&format!("{hash}.jpg")))
        .collect()
}

fn steam_logo_layout(app_id: &str, title: &str, steam_dir: &Path) -> LogoLayout {
    if let Some(layout) = read_cached_steam_logo_layout(app_id) {
        return layout;
    }

    if let Some(layout) = read_local_steam_logo_layout(title, steam_dir) {
        cache_steam_logo_layout(app_id, &layout);
        return layout;
    }

    LogoLayout {
        position: LogoPosition::BottomLeft,
        width_percent: None,
        height_percent: None,
    }
}

fn read_cached_steam_logo_layout(app_id: &str) -> Option<LogoLayout> {
    let cache = read_steam_logo_layout_cache();
    cache.get(app_id).and_then(logo_layout_from_cache_value)
}

fn cache_steam_logo_layout(app_id: &str, layout: &LogoLayout) {
    let Some(cache_path) = steam_logo_position_cache_path() else {
        return;
    };

    let mut cache = read_steam_logo_layout_cache();
    cache.insert(
        app_id.to_string(),
        serde_json::json!({
            "position": logo_position_to_pinned_value(&layout.position),
            "widthPercent": layout.width_percent,
            "heightPercent": layout.height_percent,
        }),
    );

    if let Some(parent) = cache_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    if let Ok(contents) = serde_json::to_string_pretty(&cache) {
        let _ = fs::write(cache_path, contents);
    }
}

fn read_steam_logo_layout_cache() -> BTreeMap<String, serde_json::Value> {
    let Some(cache_path) = steam_logo_position_cache_path() else {
        return BTreeMap::new();
    };

    fs::read_to_string(cache_path)
        .ok()
        .and_then(|contents| {
            serde_json::from_str::<BTreeMap<String, serde_json::Value>>(&contents).ok()
        })
        .unwrap_or_default()
}

fn steam_logo_position_cache_path() -> Option<PathBuf> {
    dirs::cache_dir().map(|cache_dir| {
        cache_dir
            .join("open-game-launcher")
            .join("steam-logo-layouts.json")
    })
}

fn read_local_steam_logo_layout(title: &str, steam_dir: &Path) -> Option<LogoLayout> {
    let appinfo_path = steam_dir.join("appcache").join("appinfo.vdf");
    let contents = fs::read(appinfo_path).ok()?;
    let contents = String::from_utf8_lossy(&contents);

    let mut search_from = 0;
    while let Some(searchable_contents) = contents.get(search_from..) {
        let Some(relative_index) = searchable_contents.find(title) else {
            break;
        };

        let title_index = search_from + relative_index;
        let segment_end = next_char_boundary(&contents, title_index + 8_000);
        let Some(segment) = contents.get(title_index..segment_end) else {
            break;
        };

        if segment.contains("library_hero") && segment.contains("logo.png") {
            if let Some(layout) = parse_steam_logo_layout_segment(segment) {
                return Some(layout);
            }
        }

        search_from = title_index + title.len();
    }

    None
}

fn next_char_boundary(contents: &str, index: usize) -> usize {
    let mut index = index.min(contents.len());
    while index > 0 && !contents.is_char_boundary(index) {
        index -= 1;
    }
    index
}

fn parse_steam_logo_layout_segment(segment: &str) -> Option<LogoLayout> {
    let search_start = segment
        .find("logo.png")
        .or_else(|| segment.find("library_hero"))
        .unwrap_or(0);
    let searchable = &segment[search_start..];

    let (position_name, position_index) =
        ["BottomLeft", "UpperCenter", "CenterCenter", "BottomCenter"]
            .into_iter()
            .filter_map(|position| searchable.find(position).map(|index| (position, index)))
            .min_by_key(|(_, index)| *index)?;

    let after_position = &searchable[position_index + position_name.len()..];
    let value_text_end = after_position
        .find("logo_2x")
        .unwrap_or(after_position.len());
    let value_text_end = next_char_boundary(after_position, value_text_end.min(600));
    let value_text = after_position
        .get(..value_text_end)
        .unwrap_or(after_position);
    let mut percentages = value_text
        .split(|character: char| {
            !(character.is_ascii_digit() || character == '.' || character == '-')
        })
        .filter(|value| value.contains('.'))
        .filter_map(|value| value.parse::<f64>().ok())
        .filter_map(sanitize_logo_percent);

    Some(LogoLayout {
        position: logo_position_from_pinned_value(position_name),
        width_percent: percentages.next(),
        height_percent: percentages.next(),
    })
}

fn sanitize_logo_percent(value: f64) -> Option<f64> {
    (10.0..=100.0).contains(&value).then_some(value)
}

fn logo_layout_from_cache_value(value: &serde_json::Value) -> Option<LogoLayout> {
    if let Some(position) = value.as_str() {
        return Some(LogoLayout {
            position: logo_position_from_pinned_value(position),
            width_percent: None,
            height_percent: None,
        });
    }

    let position = value.get("position")?.as_str()?;
    let width_percent = value
        .get("widthPercent")
        .and_then(serde_json::Value::as_f64)
        .and_then(sanitize_logo_percent);
    let height_percent = value
        .get("heightPercent")
        .and_then(serde_json::Value::as_f64)
        .and_then(sanitize_logo_percent);

    Some(LogoLayout {
        position: logo_position_from_pinned_value(position),
        width_percent,
        height_percent,
    })
}

fn logo_position_to_pinned_value(position: &LogoPosition) -> &'static str {
    match position {
        LogoPosition::BottomLeft => "BottomLeft",
        LogoPosition::UpperCenter => "UpperCenter",
        LogoPosition::CenterCenter => "CenterCenter",
        LogoPosition::BottomCenter => "BottomCenter",
    }
}

fn logo_position_from_pinned_value(value: &str) -> LogoPosition {
    match value {
        "UpperCenter" => LogoPosition::UpperCenter,
        "CenterCenter" => LogoPosition::CenterCenter,
        "BottomCenter" => LogoPosition::BottomCenter,
        "BottomLeft" => LogoPosition::BottomLeft,
        _ => LogoPosition::BottomLeft,
    }
}

fn find_quoted_value(contents: &str, key: &str) -> Option<String> {
    let needle = format!("\"{key}\"");
    let index = contents.find(&needle)?;
    let after_key = &contents[index + needle.len()..];
    let value_start = after_key.find('"')? + 1;
    let after_quote = &after_key[value_start..];
    let value_end = after_quote.find('"')?;

    Some(after_quote[..value_end].to_string())
}

fn installed_game(
    id_seed: &str,
    title: String,
    source: String,
    install_path: Option<String>,
    cover_url: Option<String>,
) -> InstalledGame {
    InstalledGame {
        id: slugify(id_seed),
        description: install_path
            .as_ref()
            .map(|path| format!("{source} // {path}"))
            .unwrap_or(source),
        title,
        version: "local".to_string(),
        cover_url,
        icon_url: None,
        icon_urls: Vec::new(),
        logo_url: None,
        logo_urls: Vec::new(),
        logo_position: LogoPosition::BottomLeft,
        logo_width_percent: None,
        logo_height_percent: None,
        status: GameStatus::Installed,
        platform: current_platform(),
        install_path,
        launch_uri: None,
        last_played_at: None,
        playtime_minutes: None,
        genres: Vec::new(),
        developer: None,
        publisher: None,
        release_date: None,
        features: Vec::new(),
    }
}

fn launch_installed_game(game: &InstalledGame) -> Result<Option<Child>, String> {
    if let Some(uri) = &game.launch_uri {
        open_uri(uri).map_err(|error| format!("Konnte {} nicht starten: {error}", game.title))?;
        return Ok(None);
    }

    let Some(install_path) = game.install_path.as_ref().map(PathBuf::from) else {
        return Err(format!("Kein Startpfad fur {} gefunden.", game.title));
    };

    let executable = find_launch_executable(&install_path, &game.title)
        .ok_or_else(|| format!("Keine passende .exe fur {} gefunden.", game.title))?;
    let working_dir = executable.parent().unwrap_or(&install_path);

    Command::new(&executable)
        .current_dir(working_dir)
        .spawn()
        .map(Some)
        .map_err(|error| error.to_string())
}

fn open_uri(uri: &str) -> std::io::Result<()> {
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

fn record_game_launch_started(game_id: &str) -> Option<GameActivityUpdate> {
    update_cached_game_activity(game_id, Some(current_unix_timestamp()), None)
}

fn record_game_play_session_when_finished(
    app: tauri::AppHandle,
    game_id: String,
    mut child: Child,
) {
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

fn update_cached_game_activity(
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

fn emit_game_activity_update(app: &tauri::AppHandle, update: &GameActivityUpdate) {
    let _ = app.emit("game_activity_updated", update);
}

fn is_file_executable(path: &Path) -> bool {
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

fn find_launch_executable(install_path: &Path, title: &str) -> Option<PathBuf> {
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

fn current_platform() -> Platform {
    if cfg!(target_os = "windows") {
        Platform::Windows
    } else if cfg!(target_os = "macos") {
        Platform::Macos
    } else {
        Platform::Linux
    }
}

fn env_path(key: &str) -> Option<PathBuf> {
    env::var_os(key).map(PathBuf::from)
}

#[cfg(windows)]
fn query_registry_sections(key: &str) -> Vec<String> {
    let Some((hkey, subkey)) = parse_registry_root(key) else {
        return Vec::new();
    };

    let Ok(root) = RegKey::predef(hkey).open_subkey_with_flags(subkey, KEY_READ) else {
        return Vec::new();
    };

    let mut sections = Vec::new();
    collect_registry_sections(root, key.to_string(), &mut sections);
    sections
}

#[cfg(not(windows))]
fn query_registry_sections(_key: &str) -> Vec<String> {
    Vec::new()
}

#[cfg(windows)]
fn parse_registry_root(key: &str) -> Option<(HKEY, &str)> {
    key.strip_prefix(r"HKLM\")
        .map(|subkey| (HKEY_LOCAL_MACHINE, subkey))
        .or_else(|| {
            key.strip_prefix(r"HKCU\")
                .map(|subkey| (HKEY_CURRENT_USER, subkey))
        })
}

#[cfg(windows)]
fn collect_registry_sections(key: RegKey, path: String, sections: &mut Vec<String>) {
    let mut lines = vec![windows_registry_path(&path)];

    for value in key.enum_values().flatten() {
        let (name, reg_value) = value;
        if let Some(value_text) = registry_value_to_string(&reg_value) {
            lines.push(format!("    {name}    REG_SZ    {value_text}"));
        }
    }

    sections.push(lines.join("\r\n"));

    for subkey_name in key.enum_keys().flatten() {
        if let Ok(subkey) = key.open_subkey_with_flags(&subkey_name, KEY_READ) {
            collect_registry_sections(subkey, format!("{path}\\{subkey_name}"), sections);
        }
    }
}

#[cfg(windows)]
fn windows_registry_path(path: &str) -> String {
    path.replacen(r"HKLM\", r"HKEY_LOCAL_MACHINE\", 1)
        .replacen(r"HKCU\", r"HKEY_CURRENT_USER\", 1)
}

#[cfg(windows)]
fn registry_value_to_string(value: &RegValue) -> Option<String> {
    match value.vtype {
        RegType::REG_SZ | RegType::REG_EXPAND_SZ => utf16_registry_string(&value.bytes),
        RegType::REG_MULTI_SZ => Some(
            utf16_registry_string(&value.bytes)?
                .split('\0')
                .filter(|part| !part.is_empty())
                .collect::<Vec<_>>()
                .join("; "),
        ),
        _ => None,
    }
}

#[cfg(windows)]
fn utf16_registry_string(bytes: &[u8]) -> Option<String> {
    let words = bytes
        .chunks_exact(2)
        .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
        .take_while(|word| *word != 0)
        .collect::<Vec<_>>();

    String::from_utf16(&words)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn path_to_string(path: PathBuf) -> String {
    path.to_string_lossy().to_string()
}

fn slugify(value: &str) -> String {
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

fn normalize_game_id(game_id: String) -> Result<String, String> {
    let normalized = game_id.trim().to_string();

    if normalized.is_empty() {
        return Err("game_id must not be empty.".to_string());
    }

    Ok(normalized)
}

fn unix_timestamp_to_iso(timestamp: u64) -> String {
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

struct EaRegistryInstall {
    title: String,
    install_dir: PathBuf,
    content_id: Option<String>,
    icon_path: Option<String>,
}

fn extract_ea_content_id(install_dir: &Path) -> Option<String> {
    let xml_path = install_dir.join("__Installer").join("installerdata.xml");
    if !xml_path.exists() {
        return None;
    }
    let contents = fs::read_to_string(&xml_path).ok()?;
    let lowercase_contents = contents.to_lowercase();
    let start_tag = "<contentid>";
    let end_tag = "</contentid>";

    if let Some(start_idx) = lowercase_contents.find(start_tag) {
        let val_start = start_idx + start_tag.len();
        if let Some(end_idx) = lowercase_contents[val_start..].find(end_tag) {
            let mut val = contents[val_start..val_start + end_idx].trim().to_string();

            // Handle <![CDATA[ ... ]]>
            if val.starts_with("<![CDATA[") && val.ends_with("]]>") {
                val = val["<![CDATA[".len()..val.len() - "]]>".len()]
                    .trim()
                    .to_string();
            } else if val.contains("<![CDATA[") {
                if let Some(c_start) = val.find("<![CDATA[") {
                    let remaining = &val[c_start + "<![CDATA[".len()..];
                    if let Some(c_end) = remaining.find("]]>") {
                        val = remaining[..c_end].trim().to_string();
                    }
                }
            }

            if !val.is_empty() {
                return Some(val);
            }
        }
    }
    None
}

fn read_ea_registry_installs() -> Vec<EaRegistryInstall> {
    if !cfg!(target_os = "windows") {
        return Vec::new();
    }

    [
        r"HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
        r"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
    ]
    .into_iter()
    .flat_map(query_registry_sections)
    .filter_map(|section| {
        if !section.contains("HKEY_") {
            return None;
        }

        let uninstall_str = section
            .lines()
            .filter_map(|line| registry_string_value(line, "UninstallString"))
            .find(|val| !val.is_empty())
            .unwrap_or_default();

        let publisher = section
            .lines()
            .filter_map(|line| registry_string_value(line, "Publisher"))
            .find(|val| !val.is_empty())
            .unwrap_or_default();

        let is_ea = uninstall_str.to_lowercase().contains("eainstaller")
            || uninstall_str.to_lowercase().contains("origin")
            || publisher.to_lowercase().contains("electronic arts");
        if !is_ea {
            return None;
        }

        let title = section
            .lines()
            .filter_map(|line| registry_string_value(line, "DisplayName"))
            .find(|val| !val.is_empty())?;

        let title_lower = title.to_lowercase();
        if title_lower == "ea app"
            || title_lower == "ea desktop"
            || title_lower == "origin"
            || title_lower.contains("ea app ") && title_lower.contains("updater")
            || title_lower.contains("electronic arts") && title_lower.contains("service")
        {
            return None;
        }

        let install_dir = section
            .lines()
            .filter_map(|line| {
                registry_string_value(line, "InstallLocation")
                    .or_else(|| registry_string_value(line, "InstallSource"))
            })
            .map(PathBuf::from)
            .find(|path| path.exists())?;

        let install_dir_str = install_dir.to_string_lossy().to_lowercase();
        if install_dir_str.ends_with("ea desktop") || install_dir_str.ends_with("origin") {
            return None;
        }

        let content_id = extract_ea_content_id(&install_dir);

        let icon_path = section
            .lines()
            .filter_map(|line| registry_string_value(line, "DisplayIcon"))
            .map(|icon| {
                if let Some(pos) = icon.rfind(',') {
                    icon[..pos].trim().to_string()
                } else {
                    icon.trim().to_string()
                }
            })
            .filter(|icon| !icon.is_empty())
            .find(|icon| Path::new(icon).exists());

        Some(EaRegistryInstall {
            title,
            install_dir,
            content_id,
            icon_path,
        })
    })
    .collect()
}

fn get_ea_assets(
    content_id: &str,
    title: &str,
) -> (Option<String>, Option<String>, Option<String>) {
    let normalized_title = title.to_lowercase();
    let _normalized_id = content_id.to_lowercase();

    let mut app_id = None;

    if normalized_title.contains("steamworld dig") {
        app_id = Some("252410");
    } else if normalized_title.contains("sims 4") {
        app_id = Some("1222670");
    } else if normalized_title.contains("battlefield 2042") {
        app_id = Some("1517290");
    } else if normalized_title.contains("battlefield v")
        || normalized_title.contains("battlefield 5")
    {
        app_id = Some("1238840");
    } else if normalized_title.contains("battlefield 1") {
        app_id = Some("1238810");
    } else if normalized_title.contains("battlefield 4") {
        app_id = Some("1238860");
    } else if normalized_title.contains("apex legends") {
        app_id = Some("1172470");
    } else if normalized_title.contains("it takes two") {
        app_id = Some("1426210");
    } else if normalized_title.contains("jedi: fallen order")
        || normalized_title.contains("jedi fallen order")
    {
        app_id = Some("1172380");
    } else if normalized_title.contains("jedi: survivor")
        || normalized_title.contains("jedi survivor")
    {
        app_id = Some("1774580");
    } else if normalized_title.contains("mass effect legendary") {
        app_id = Some("1328670");
    } else if normalized_title.contains("command & conquer")
        || normalized_title.contains("command and conquer")
    {
        app_id = Some("1307580");
    } else if normalized_title.contains("dragon age: inquisition")
        || normalized_title.contains("dragon age inquisition")
    {
        app_id = Some("1222690");
    } else if normalized_title.contains("nfs heat")
        || normalized_title.contains("need for speed heat")
    {
        app_id = Some("1293830");
    } else if normalized_title.contains("nfs unbound")
        || normalized_title.contains("need for speed unbound")
    {
        app_id = Some("1374300");
    } else if normalized_title.contains("ea sports fc 24") || normalized_title.contains("fc 24") {
        app_id = Some("2195250");
    } else if normalized_title.contains("ea sports fc 25") || normalized_title.contains("fc 25") {
        app_id = Some("2669320");
    } else if normalized_title.contains("fifa 23") {
        app_id = Some("1811260");
    } else if normalized_title.contains("dead space") && normalized_title.contains("remake") {
        app_id = Some("1693980");
    } else if normalized_title.contains("dead space") {
        app_id = Some("17470");
    } else if normalized_title.contains("titanfall 2") {
        app_id = Some("1237970");
    } else if normalized_title.contains("crysis 3") {
        app_id = Some("1282690");
    } else if normalized_title.contains("garden warfare 2") {
        app_id = Some("1922500");
    }

    if let Some(id) = app_id {
        return (
            Some(format!("https://cdn.cloudflare.steamstatic.com/steam/apps/{id}/library_hero.jpg")),
            Some(format!("https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/{id}/logo.png")),
            Some(format!("https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/{id}/logo.png")),
        );
    }

    // Default EA app assets
    (
        None,
        Some("https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Electronic-Arts-Logo.svg/512px-Electronic-Arts-Logo.svg.png".to_string()),
        Some("https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Electronic-Arts-Logo.svg/512px-Electronic-Arts-Logo.svg.png".to_string()),
    )
}

fn scan_ea_games() -> Vec<InstalledGame> {
    let mut games = Vec::new();
    let mut seen = HashSet::new();

    for install in read_ea_registry_installs() {
        if !install.install_dir.is_dir() || is_ignored_game_directory(&install.install_dir) {
            continue;
        }

        let title = install.title.trim();
        if title.is_empty() || !seen.insert(title.to_lowercase()) {
            continue;
        }

        let content_id = install.content_id.clone().unwrap_or_default();
        let (online_cover, online_logo, online_icon) = get_ea_assets(&content_id, title);

        let banner_path = online_cover.or_else(|| find_local_banner_asset(&install.install_dir));
        let logo_path = online_logo.or_else(|| find_local_logo_asset(&install.install_dir));
        let icon_path = online_icon
            .or_else(|| install.icon_path.clone())
            .or_else(|| find_local_icon_asset(&install.install_dir));

        let mut game = installed_game(
            &format!(
                "ea-{}",
                if content_id.is_empty() {
                    title.replace(" ", "-").to_lowercase()
                } else {
                    content_id.clone()
                }
            ),
            title.to_string(),
            "EA App".to_string(),
            Some(path_to_string(install.install_dir.clone())),
            banner_path,
        );

        game.logo_url = logo_path;
        game.icon_url = icon_path;

        if !content_id.is_empty() {
            game.launch_uri = Some(format!("origin://launchgame/{}", content_id));
        }

        if let Some(timestamp) = get_dir_last_modified(&install.install_dir) {
            game.last_played_at = Some(unix_timestamp_to_iso(timestamp));
        }

        games.push(game);
    }

    games
}

async fn search_steam_appid(title: &str) -> Option<u32> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://store.steampowered.com/api/storesearch/")
        .query(&[("term", title), ("l", "german"), ("cc", "de")])
        .send()
        .await
        .ok()?;
    let json: serde_json::Value = response.json().await.ok()?;

    let items = json.get("items")?.as_array()?;
    if items.is_empty() {
        return None;
    }

    let first = items.first()?;
    let id = first.get("id")?.as_u64()? as u32;
    Some(id)
}

async fn fetch_steam_metadata(
    appid: u32,
) -> Option<(
    Vec<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Vec<String>,
    Option<String>,
)> {
    let url = format!("https://store.steampowered.com/api/appdetails?appids={appid}&l=german");
    let client = reqwest::Client::new();
    let response = client.get(&url).send().await.ok()?;
    let json: serde_json::Value = response.json().await.ok()?;

    let app_data = json.get(appid.to_string())?;
    if !app_data.get("success")?.as_bool().unwrap_or(false) {
        return None;
    }

    let data = app_data.get("data")?;

    let description = data
        .get("short_description")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let developer = data
        .get("developers")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let publisher = data
        .get("publishers")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let release_date = data
        .get("release_date")
        .and_then(|v| v.get("date"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let mut genres = Vec::new();
    if let Some(genres_arr) = data.get("genres").and_then(|v| v.as_array()) {
        for gen in genres_arr {
            if let Some(desc) = gen.get("description").and_then(|v| v.as_str()) {
                genres.push(desc.to_string());
            }
        }
    }

    let mut features = Vec::new();
    if let Some(cats_arr) = data.get("categories").and_then(|v| v.as_array()) {
        for cat in cats_arr {
            if let Some(desc) = cat.get("description").and_then(|v| v.as_str()) {
                features.push(desc.to_string());
            }
        }
    }

    Some((
        genres,
        developer,
        publisher,
        release_date,
        features,
        description,
    ))
}

async fn sync_game_metadata(mut game: InstalledGame) -> InstalledGame {
    if !game.genres.is_empty() || game.developer.is_some() {
        return game;
    }

    let mut appid = None;
    if game.id.starts_with("steam-") {
        let clean_id = game
            .id
            .trim_start_matches("steam-")
            .trim_start_matches("owned-");
        if let Ok(id) = clean_id.parse::<u32>() {
            appid = Some(id);
        }
    } else if let Some(uri) = &game.launch_uri {
        if uri.starts_with("steam://rungameid/") {
            let clean_id = uri.trim_start_matches("steam://rungameid/");
            if let Ok(id) = clean_id.parse::<u32>() {
                appid = Some(id);
            }
        }
    }

    if appid.is_none() {
        appid = search_steam_appid(&game.title).await;
    }

    if let Some(id) = appid {
        if let Some((genres, developer, publisher, release_date, features, description)) =
            fetch_steam_metadata(id).await
        {
            game.genres = genres;
            game.developer = developer;
            game.publisher = publisher;
            game.release_date = release_date;
            game.features = features;
            if let Some(desc) = description {
                game.description = desc;
            }
        }
    }

    game
}

pub fn start_playtime_poller(app_handle: tauri::AppHandle) {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_steam_activity_from_localconfig_app_blocks() {
        let contents = r#"
"UserLocalConfigStore"
{
    "Software"
    {
        "Valve"
        {
            "Steam"
            {
                "apps"
                {
                    "4000"
                    {
                        "LastPlayed"        "1764709295"
                        "Playtime"          "13519"
                        "cloud"
                        {
                            "last_sync_state"        "synchronized"
                        }
                    }
                }
            }
        }
    }
}
"#;
        let mut activity = HashMap::new();

        parse_steam_activity_from_vdf(contents, &mut activity);

        let garrys_mod = activity.get("4000").expect("missing app activity");
        assert_eq!(garrys_mod.last_played, Some(1764709295));
        assert_eq!(garrys_mod.playtime_minutes, Some(13519));
    }
}
