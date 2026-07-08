use std::{
    collections::{BTreeMap, HashMap, HashSet},
    env, fs,
    path::{Path, PathBuf},
    process::Command,
    sync::{Mutex, OnceLock},
    thread,
    time::Duration,
};

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

use super::core::{
    apply_battlenet_assets, current_unix_timestamp, env_path, epic_catalog_asset_cache_path,
    get_dir_last_modified, installed_game, is_ignored_game_directory, local_drive_roots,
    path_to_string, rawg_asset_cache_path, unix_timestamp_to_iso,
};
use super::types::*;

pub mod epic;
pub mod steam;
pub use epic::*;
pub use steam::*;

pub(super) fn normalize_scanned_launcher(launcher: &str) -> String {
    super::core::launcher_key_from_source(launcher).to_string()
}

fn launcher_scan_priority(game: &InstalledGame) -> u8 {
    match super::core::launcher_key_from_source(&game.launcher) {
        "manual" => 100,
        "ea" => 90,
        "epic" => 85,
        "gog" => 80,
        "ubisoft" => 75,
        "battlenet" => 70,
        "xbox" => 65,
        "steam" => 10,
        _ => 50,
    }
}

fn canonical_install_path(path: &str) -> Option<PathBuf> {
    let path = PathBuf::from(path);
    if !path.exists() {
        return Some(path);
    }
    path.canonicalize().ok()
}

fn merge_scanned_game(
    games: &mut BTreeMap<String, InstalledGame>,
    path_index: &mut HashMap<PathBuf, String>,
    mut candidate: InstalledGame,
) {
    candidate.launcher = normalize_scanned_launcher(&candidate.launcher);
    let candidate_id = candidate.id.clone();
    let mut candidate_canonical_path = None;

    if let Some(install_path) = candidate
        .install_path
        .as_deref()
        .filter(|path| !path.is_empty())
    {
        if let Some(candidate_canon) = canonical_install_path(install_path) {
            // Same install path: dedupe by launcher-scan priority (Epic/EA/Gog
            // win over Steam when both detect the same folder).
            if let Some(existing_id) = path_index.get(&candidate_canon).cloned() {
                if let Some(existing) = games.get(&existing_id) {
                    if launcher_scan_priority(&candidate) > launcher_scan_priority(existing) {
                        games.remove(&existing_id);
                    } else {
                        return;
                    }
                }
            }

            candidate_canonical_path = Some(candidate_canon);
        }
    }

    if games.contains_key(&candidate_id) {
        return;
    }

    games.insert(candidate_id.clone(), candidate);
    if let Some(candidate_canon) = candidate_canonical_path {
        path_index.insert(candidate_canon, candidate_id);
    }
}

pub fn is_ea_install_directory(path: &Path) -> bool {
    if extract_ea_content_id(path).is_some() {
        return true;
    }

    let lowered = path.to_string_lossy().to_lowercase();
    lowered.contains("origin games")
        || lowered.contains("\\ea games\\")
        || lowered.contains("/ea games/")
        || lowered.contains("\\electronic arts\\")
}

pub fn scan_installed_games() -> Vec<InstalledGame> {
    let mut games = BTreeMap::<String, InstalledGame>::new();
    let mut path_index = HashMap::<PathBuf, String>::new();

    // Spawn threads for parallel scanning
    let handle_steam = thread::spawn(scan_steam_games);
    let handle_epic = thread::spawn(scan_epic_games);
    let handle_gog = thread::spawn(scan_gog_games);
    let handle_ubisoft = thread::spawn(scan_ubisoft_games);
    let handle_xbox = thread::spawn(scan_xbox_games);
    let handle_battlenet = thread::spawn(scan_battlenet_games);
    let handle_ea = thread::spawn(scan_ea_games);

    // Join and merge results (EA/Epic/etc. win over Steam for the same install folder)
    if let Ok(steam_games) = handle_steam.join() {
        for game in steam_games {
            merge_scanned_game(&mut games, &mut path_index, game);
        }
    }
    if let Ok(epic_games) = handle_epic.join() {
        for game in epic_games {
            merge_scanned_game(&mut games, &mut path_index, game);
        }
    }
    if let Ok(gog_games) = handle_gog.join() {
        for game in gog_games {
            merge_scanned_game(&mut games, &mut path_index, game);
        }
    }
    if let Ok(ubisoft_games) = handle_ubisoft.join() {
        for game in ubisoft_games {
            merge_scanned_game(&mut games, &mut path_index, game);
        }
    }
    if let Ok(xbox_games) = handle_xbox.join() {
        for game in xbox_games {
            merge_scanned_game(&mut games, &mut path_index, game);
        }
    }
    if let Ok(battlenet_games) = handle_battlenet.join() {
        for game in battlenet_games {
            merge_scanned_game(&mut games, &mut path_index, game);
        }
    }
    if let Ok(ea_games) = handle_ea.join() {
        for game in ea_games {
            merge_scanned_game(&mut games, &mut path_index, game);
        }
    }

    games.into_values().collect()
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

pub struct GogRegistryInstall {
    pub title: String,
    pub install_dir: PathBuf,
    pub game_id: Option<String>,
}

pub fn read_gog_registry_installs() -> Vec<GogRegistryInstall> {
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
            .rfind(|s| !s.is_empty())
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

pub fn scan_gog_games() -> Vec<InstalledGame> {
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
        game.external_id = game_id.clone();
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
            game.external_id = game_id.clone();
            // Note: GOG games do not use logos or icons (only banner/cover) as requested by the user.

            if let Some(timestamp) = get_dir_last_modified(&path) {
                game.last_played_at = Some(unix_timestamp_to_iso(timestamp));
            }

            games.push(game);
        }
    }

    games
}

pub struct BattleNetAssetTheme {
    pub family: &'static str,
    pub initials: &'static str,
    pub bg: &'static str,
    pub bg_alt: &'static str,
    pub accent: &'static str,
    pub accent_alt: &'static str,
}

pub fn battlenet_asset_theme(uid: &str, title: &str) -> BattleNetAssetTheme {
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

pub fn get_battlenet_assets(
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

pub fn get_rawg_game_assets(platform: &str, id: &str, search_title: &str) -> Option<RawgAssets> {
    let cache_key = format!(
        "{}:{}:{}",
        platform.to_lowercase(),
        id.trim().to_lowercase(),
        search_title.trim().to_lowercase()
    );
    if let Ok(cache) = rawg_asset_cache_store().lock() {
        if let Some(cached_assets) = cache.entries.get(&cache_key) {
            return Some(cached_assets.clone());
        }
    }

    let assets = fetch_rawg_assets_via_supabase(search_title).or_else(|| {
        let api_key = env::var("RAWG_API_KEY")
            .or_else(|_| env::var("OG_RAWG_API_KEY"))
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())?;

        fetch_rawg_assets(&api_key, search_title)
    })?;

    if assets.cover_url.is_some() || assets.logo_url.is_some() || assets.icon_url.is_some() {
        if let Ok(mut cache) = rawg_asset_cache_store().lock() {
            cache.entries.insert(cache_key, assets.clone());
            write_rawg_asset_cache(&cache);
        }
        return Some(assets);
    }

    None
}

pub fn get_rawg_battlenet_assets(uid: &str, title: &str) -> Option<RawgAssets> {
    let search_title = battlenet_rawg_search_title(uid, title);
    get_rawg_game_assets("battlenet", uid, &search_title)
}

pub fn get_rawg_ubisoft_assets(install_id: &str, title: &str) -> Option<RawgAssets> {
    let search_title = ubisoft_rawg_search_title(title);
    get_rawg_game_assets("ubisoft", install_id, &search_title)
}

pub fn get_rawg_epic_assets(id: &str, title: &str) -> Option<RawgAssets> {
    let search_title = epic_rawg_search_title(title);
    let cache_id = if id.trim().is_empty() { title } else { id };
    get_rawg_game_assets("epic", cache_id, &search_title)
}

pub fn get_rawg_ea_assets(content_id: &str, title: &str) -> Option<RawgAssets> {
    let search_title = ea_rawg_search_title(content_id, title);
    let cache_id = if content_id.trim().is_empty() {
        title
    } else {
        content_id
    };
    get_rawg_game_assets("ea", cache_id, &search_title)
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

fn rawg_asset_cache_store() -> &'static Mutex<RawgAssetCache> {
    static CACHE: OnceLock<Mutex<RawgAssetCache>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(read_rawg_asset_cache()))
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

fn epic_rawg_search_title(title: &str) -> String {
    let mut cleaned = title
        .replace(['\u{2122}', '\u{00AE}'], "")
        .replace("(TM)", "")
        .replace("(R)", "")
        .replace("  ", " ")
        .trim()
        .to_string();

    let edition_suffixes = [
        " - Standard Edition",
        " Standard Edition",
        " - Deluxe Edition",
        " Deluxe Edition",
        " - Ultimate Edition",
        " Ultimate Edition",
        " - Digital Deluxe Edition",
        " Digital Deluxe Edition",
        " - Complete Edition",
        " Complete Edition",
        " - Gold Edition",
        " Gold Edition",
    ];

    for suffix in edition_suffixes {
        if cleaned.len() > suffix.len() + 3 && cleaned.ends_with(suffix) {
            cleaned.truncate(cleaned.len() - suffix.len());
            break;
        }
    }

    cleaned.trim().to_string()
}

fn ubisoft_rawg_search_title(title: &str) -> String {
    let mut cleaned = title
        .replace(['\u{2122}', '\u{00AE}'], "")
        .replace("(TM)", "")
        .replace("(R)", "")
        .replace("  ", " ")
        .trim()
        .to_string();

    // Strip edition suffixes that confuse RAWG search
    let edition_suffixes = [
        " - Standard Edition",
        " Standard Edition",
        " - Deluxe Edition",
        " Deluxe Edition",
        " - Ultimate Edition",
        " Ultimate Edition",
        " - Gold Edition",
        " Gold Edition",
        " - Complete Edition",
        " Complete Edition",
        " - Digital Deluxe Edition",
        " Digital Deluxe Edition",
        " - Animus Pack",
    ];

    for suffix in edition_suffixes {
        if cleaned.len() > suffix.len() + 3 && cleaned.ends_with(suffix) {
            cleaned.truncate(cleaned.len() - suffix.len());
            break;
        }
    }

    let normalized = cleaned.to_lowercase();

    // Map well-known Ubisoft titles to canonical RAWG search terms
    if normalized.contains("rainbow six siege") {
        return "Tom Clancy's Rainbow Six Siege".to_string();
    }
    if normalized.contains("rainbow six extraction") {
        return "Tom Clancy's Rainbow Six Extraction".to_string();
    }
    if normalized.contains("assassin's creed valhalla")
        || normalized.contains("assassins creed valhalla")
    {
        return "Assassin's Creed Valhalla".to_string();
    }
    if normalized.contains("assassin's creed odyssey")
        || normalized.contains("assassins creed odyssey")
    {
        return "Assassin's Creed Odyssey".to_string();
    }
    if normalized.contains("assassin's creed origins")
        || normalized.contains("assassins creed origins")
    {
        return "Assassin's Creed Origins".to_string();
    }
    if normalized.contains("assassin's creed mirage")
        || normalized.contains("assassins creed mirage")
    {
        return "Assassin's Creed Mirage".to_string();
    }
    if normalized.contains("assassin's creed shadows")
        || normalized.contains("assassins creed shadows")
    {
        return "Assassin's Creed Shadows".to_string();
    }
    if normalized.contains("assassin's creed unity") || normalized.contains("assassins creed unity")
    {
        return "Assassin's Creed Unity".to_string();
    }
    if normalized.contains("assassin's creed syndicate")
        || normalized.contains("assassins creed syndicate")
    {
        return "Assassin's Creed Syndicate".to_string();
    }
    if normalized.contains("assassin's creed iv")
        || normalized.contains("assassin's creed 4")
        || normalized.contains("black flag")
    {
        return "Assassin's Creed IV Black Flag".to_string();
    }
    if normalized.contains("assassin's creed iii") || normalized.contains("assassin's creed 3") {
        return "Assassin's Creed III".to_string();
    }
    if normalized.contains("assassin's creed ii") || normalized.contains("assassin's creed 2") {
        return "Assassin's Creed II".to_string();
    }
    if normalized.contains("assassin's creed brotherhood") {
        return "Assassin's Creed Brotherhood".to_string();
    }
    if normalized.contains("assassin's creed revelations") {
        return "Assassin's Creed Revelations".to_string();
    }
    if normalized.contains("assassin's creed rogue") {
        return "Assassin's Creed Rogue".to_string();
    }
    if normalized.contains("far cry 6") {
        return "Far Cry 6".to_string();
    }
    if normalized.contains("far cry 5") {
        return "Far Cry 5".to_string();
    }
    if normalized.contains("far cry new dawn") {
        return "Far Cry New Dawn".to_string();
    }
    if normalized.contains("far cry 4") {
        return "Far Cry 4".to_string();
    }
    if normalized.contains("far cry 3") {
        return "Far Cry 3".to_string();
    }
    if normalized.contains("far cry primal") {
        return "Far Cry Primal".to_string();
    }
    if normalized.contains("watch dogs legion") || normalized.contains("watch_dogs legion") {
        return "Watch Dogs Legion".to_string();
    }
    if normalized.contains("watch dogs 2")
        || normalized.contains("watch_dogs 2")
        || normalized.contains("watch_dogs2")
    {
        return "Watch Dogs 2".to_string();
    }
    if normalized.contains("watch dogs") || normalized.contains("watch_dogs") {
        return "Watch Dogs".to_string();
    }
    if normalized.contains("ghost recon breakpoint") {
        return "Tom Clancy's Ghost Recon Breakpoint".to_string();
    }
    if normalized.contains("ghost recon wildlands") {
        return "Tom Clancy's Ghost Recon Wildlands".to_string();
    }
    if normalized.contains("the division 2") || normalized.contains("division 2") {
        return "Tom Clancy's The Division 2".to_string();
    }
    if normalized.contains("the division") {
        return "Tom Clancy's The Division".to_string();
    }
    if normalized.contains("immortals fenyx") {
        return "Immortals Fenyx Rising".to_string();
    }
    if normalized.contains("riders republic") {
        return "Riders Republic".to_string();
    }
    if normalized.contains("steep") && !normalized.contains("steeple") {
        return "Steep".to_string();
    }
    if normalized.contains("for honor") {
        return "For Honor".to_string();
    }
    if normalized.contains("the crew motorfest") {
        return "The Crew Motorfest".to_string();
    }
    if normalized.contains("the crew 2") {
        return "The Crew 2".to_string();
    }
    if normalized.contains("the crew") {
        return "The Crew".to_string();
    }
    if normalized.contains("skull and bones") || normalized.contains("skull & bones") {
        return "Skull and Bones".to_string();
    }
    if normalized.contains("prince of persia") && normalized.contains("lost crown") {
        return "Prince of Persia The Lost Crown".to_string();
    }
    if normalized.contains("avatar frontiers") {
        return "Avatar Frontiers of Pandora".to_string();
    }
    if normalized.contains("anno 1800") {
        return "Anno 1800".to_string();
    }
    if normalized.contains("splinter cell") {
        return "Tom Clancy's Splinter Cell".to_string();
    }
    if normalized.contains("south park fractured") {
        return "South Park The Fractured But Whole".to_string();
    }
    if normalized.contains("south park stick") {
        return "South Park The Stick of Truth".to_string();
    }
    if normalized.contains("mario + rabbids") || normalized.contains("mario rabbids") {
        return "Mario + Rabbids Kingdom Battle".to_string();
    }
    if normalized.contains("xdefiant") {
        return "XDefiant".to_string();
    }
    if normalized.contains("hyper scape") {
        return "Hyper Scape".to_string();
    }
    if normalized.contains("trackmania") {
        return "Trackmania".to_string();
    }
    if normalized.contains("roller champions") {
        return "Roller Champions".to_string();
    }
    if normalized.contains("just dance") {
        return "Just Dance".to_string();
    }
    if normalized.contains("rayman legends") {
        return "Rayman Legends".to_string();
    }
    if normalized.contains("rayman origins") {
        return "Rayman Origins".to_string();
    }
    if normalized.contains("child of light") {
        return "Child of Light".to_string();
    }
    if normalized.contains("valiant hearts") {
        return "Valiant Hearts The Great War".to_string();
    }
    if normalized.contains("grow home") {
        return "Grow Home".to_string();
    }
    if normalized.contains("grow up") {
        return "Grow Up".to_string();
    }
    if normalized.contains("trials rising") {
        return "Trials Rising".to_string();
    }
    if normalized.contains("trials fusion") {
        return "Trials Fusion".to_string();
    }

    cleaned.trim().to_string()
}

fn ea_rawg_search_title(_content_id: &str, title: &str) -> String {
    let cleaned = title
        .replace(['\u{2122}', '\u{00AE}'], "")
        .replace("(TM)", "")
        .replace("(R)", "")
        .replace("  ", " ")
        .trim()
        .to_string();
    let normalized_title = cleaned.to_lowercase();

    if normalized_title.contains("sims 4") {
        return "The Sims 4".to_string();
    }
    if normalized_title.contains("battlefield 2042") {
        return "Battlefield 2042".to_string();
    }
    if normalized_title.contains("battlefield v") || normalized_title.contains("battlefield 5") {
        return "Battlefield V".to_string();
    }
    if normalized_title.contains("battlefield 1") {
        return "Battlefield 1".to_string();
    }
    if normalized_title.contains("battlefield 4") {
        return "Battlefield 4".to_string();
    }
    if normalized_title.contains("apex legends") {
        return "Apex Legends".to_string();
    }
    if normalized_title.contains("it takes two") {
        return "It Takes Two".to_string();
    }
    if normalized_title.contains("jedi: fallen order")
        || normalized_title.contains("jedi fallen order")
    {
        return "Star Wars Jedi Fallen Order".to_string();
    }
    if normalized_title.contains("jedi: survivor") || normalized_title.contains("jedi survivor") {
        return "Star Wars Jedi Survivor".to_string();
    }
    if normalized_title.contains("mass effect legendary") {
        return "Mass Effect Legendary Edition".to_string();
    }
    if normalized_title.contains("nfs heat") || normalized_title.contains("need for speed heat") {
        return "Need for Speed Heat".to_string();
    }
    if normalized_title.contains("nfs unbound")
        || normalized_title.contains("need for speed unbound")
    {
        return "Need for Speed Unbound".to_string();
    }
    if normalized_title.contains("ea sports fc 25") || normalized_title.contains("fc 25") {
        return "EA Sports FC 25".to_string();
    }
    if normalized_title.contains("ea sports fc 24") || normalized_title.contains("fc 24") {
        return "EA Sports FC 24".to_string();
    }
    if normalized_title.contains("fifa 23") {
        return "FIFA 23".to_string();
    }
    if normalized_title.contains("dead space") && normalized_title.contains("remake") {
        return "Dead Space".to_string();
    }
    if normalized_title.contains("titanfall 2") {
        return "Titanfall 2".to_string();
    }

    cleaned
}

fn fetch_rawg_assets_via_supabase(title: &str) -> Option<RawgAssets> {
    let supabase_url = env::var("VITE_SUPABASE_URL")
        .or_else(|_| env::var("SUPABASE_URL"))
        .ok()
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty())?;
    let supabase_key = env::var("VITE_SUPABASE_ANON_KEY")
        .or_else(|_| env::var("VITE_SUPABASE_PUBLISHABLE_KEY"))
        .or_else(|_| env::var("SUPABASE_ANON_KEY"))
        .or_else(|_| env::var("SUPABASE_PUBLISHABLE_KEY"))
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())?;

    let bearer_token = super::core::read_supabase_access_token().unwrap_or(supabase_key.clone());
    let url = format!("{supabase_url}/functions/v1/rawg-assets");

    use std::io::Read;
    let response = ureq::post(&url)
        .header("apikey", &supabase_key)
        .header("Authorization", &format!("Bearer {}", bearer_token))
        .send_json(serde_json::json!({ "title": title }))
        .ok()?;

    let mut reader = response.into_body().into_reader();
    let mut text = String::new();
    reader.read_to_string(&mut text).ok()?;
    serde_json::from_str::<RawgAssets>(&text).ok()
}

fn fetch_rawg_assets(api_key: &str, title: &str) -> Option<RawgAssets> {
    fetch_rawg_assets_search(api_key, title, true)
        .or_else(|| fetch_rawg_assets_search(api_key, title, false))
}

fn fetch_rawg_assets_search(api_key: &str, title: &str, precise: bool) -> Option<RawgAssets> {
    let search_url = format!(
        "https://api.rawg.io/api/games?key={}&search={}&search_precise={}&page_size=1",
        url_query_encode(api_key),
        url_query_encode(title),
        if precise { "true" } else { "false" }
    );
    let search_json = rawg_get_json(&search_url)?;
    let result = search_json.get("results")?.as_array()?.first()?.clone();
    let id = result.get("id").and_then(|value| value.as_u64());

    let mut cover_url = rawg_string_field(&result, "background_image");
    let mut icon_url = cover_url.clone();

    if let Some(game_id) = id {
        let detail_url = format!(
            "https://api.rawg.io/api/games/{game_id}?key={}",
            url_query_encode(api_key)
        );
        if let Some(detail_json) = rawg_get_json(&detail_url) {
            cover_url = rawg_string_field(&detail_json, "background_image").or(cover_url);
        }

        let screenshots_url = format!(
            "https://api.rawg.io/api/games/{game_id}/screenshots?key={}&page_size=1",
            url_query_encode(api_key)
        );
        if let Some(screenshots_json) = rawg_get_json(&screenshots_url) {
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
        logo_url: None,
        icon_url,
        fetched_at: current_unix_timestamp(),
    })
}

fn rawg_get_json(url: &str) -> Option<serde_json::Value> {
    use std::io::Read;
    let response = ureq::get(url).call().ok()?;
    let mut reader = response.into_body().into_reader();
    let mut text = String::new();
    reader.read_to_string(&mut text).ok()?;
    serde_json::from_str(&text).ok()
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

pub fn scan_battlenet_games() -> Vec<InstalledGame> {
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

        game.external_id = Some(install.uid.clone());
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

pub fn scan_ubisoft_games() -> Vec<InstalledGame> {
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

    let mut games = collect_directory_games(candidates, "ubisoft", "ubisoft");
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

        let rawg_assets = get_rawg_ubisoft_assets(&install.install_id, title);
        let launcher_assets = find_ubisoft_launcher_assets(&install.install_id);
        let cover_url = launcher_assets
            .cover_url
            .clone()
            .or_else(|| find_local_banner_asset(&install.install_dir))
            .or_else(|| {
                rawg_assets
                    .as_ref()
                    .and_then(|assets| assets.cover_url.clone())
            });
        let logo_url = launcher_assets
            .logo_url
            .clone()
            .or_else(|| find_local_logo_asset(&install.install_dir))
            .or_else(|| {
                rawg_assets
                    .as_ref()
                    .and_then(|assets| assets.logo_url.clone())
            });
        let icon_url = launcher_assets
            .icon_url
            .clone()
            .or_else(|| find_local_icon_asset(&install.install_dir))
            .or_else(|| {
                rawg_assets
                    .as_ref()
                    .and_then(|assets| assets.icon_url.clone())
            })
            .or_else(|| logo_url.clone())
            .or_else(|| cover_url.clone());

        if !seen_titles.insert(title.to_lowercase()) {
            apply_ubisoft_launcher_metadata(
                &mut games,
                title,
                &install.install_id,
                UbisoftLauncherAssets {
                    cover_url,
                    logo_url,
                    icon_url,
                },
            );
            continue;
        }

        let mut game = installed_game(
            &format!("ubisoft-{}", install.install_id),
            title.to_string(),
            "ubisoft".to_string(),
            Some(path_to_string(install.install_dir.clone())),
            cover_url,
        );
        game.external_id = Some(install.install_id.clone());
        game.launch_uri = Some(format!("uplay://launch/{}", install.install_id));
        game.logo_url = logo_url.clone();
        game.logo_urls = logo_url.into_iter().collect();
        game.icon_url = icon_url.clone();
        game.icon_urls = icon_url.into_iter().collect();
        if let Some(timestamp) = get_dir_last_modified(&install.install_dir) {
            game.last_played_at = Some(unix_timestamp_to_iso(timestamp));
        }

        games.push(game);
    }

    // Final pass: enrich any games still missing artwork with RAWG assets.
    // Games found only by directory scanning (Pass 1) never received a RAWG
    // lookup, so we catch them here â€“ the same Supabase-proxied RAWG fallback
    // that EA / Epic / Battle.net already use.
    for game in &mut games {
        if game.cover_url.is_some() && game.icon_url.is_some() {
            continue;
        }

        let search_id = game.external_id.as_deref().unwrap_or(&game.id);

        if let Some(rawg) = get_rawg_ubisoft_assets(search_id, &game.title) {
            if game.cover_url.is_none() {
                game.cover_url = rawg.cover_url;
            }
            if game.logo_url.is_none() {
                game.logo_url = rawg.logo_url.clone();
                game.logo_urls = rawg.logo_url.into_iter().collect();
            }
            if game.icon_url.is_none() {
                game.icon_url = rawg.icon_url.clone();
                game.icon_urls = rawg.icon_url.into_iter().collect();
            }
        }
    }

    games
}

fn apply_ubisoft_launcher_metadata(
    games: &mut [InstalledGame],
    title: &str,
    install_id: &str,
    assets: UbisoftLauncherAssets,
) {
    let Some(game) = games
        .iter_mut()
        .find(|game| game.title.eq_ignore_ascii_case(title))
    else {
        return;
    };

    if game.external_id.is_none() {
        game.id = format!("ubisoft-{install_id}");
        game.external_id = Some(install_id.to_string());
    }

    if game.launch_uri.is_none() {
        game.launch_uri = Some(format!("uplay://launch/{install_id}"));
    }

    if game.cover_url.is_none() {
        game.cover_url = assets.cover_url;
    }

    if game.logo_url.is_none() {
        game.logo_url = assets.logo_url.clone();
        game.logo_urls = assets.logo_url.into_iter().collect();
    }

    if game.icon_url.is_none() {
        game.icon_url = assets.icon_url.clone();
        game.icon_urls = assets.icon_url.into_iter().collect();
    }
}

pub fn scan_xbox_games() -> Vec<InstalledGame> {
    let mut roots = Vec::new();
    let uwp_packages = read_windows_app_packages();

    for xbox_root in local_drive_roots()
        .into_iter()
        .map(|drive| drive.join("XboxGames"))
        .filter(|path| path.is_dir())
    {
        roots.extend(
            read_xbox_games_root_dirs(&xbox_root)
                .into_iter()
                .map(|p| (p, None)),
        );

        let mut config_roots = Vec::new();
        collect_xbox_config_roots(&xbox_root, 0, &mut config_roots);
        roots.extend(config_roots.into_iter().map(|p| (p, None)));
    }

    for (install_loc, package_family_name) in uwp_packages {
        if is_windows_app_game_root(&install_loc) {
            roots.push((install_loc, Some(package_family_name)));
        }
    }

    collect_xbox_games_from_roots(roots)
}

fn collect_xbox_games_from_roots(roots: Vec<(PathBuf, Option<String>)>) -> Vec<InstalledGame> {
    let mut games = Vec::new();
    let mut seen_paths = HashSet::new();
    let mut seen_titles = HashSet::new();

    for (root, package_family_name) in roots {
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
        game.external_id = Some(game.slug.clone());
        game.logo_url = find_local_logo_asset(&root);
        game.icon_url = find_local_icon_asset(&root)
            .or_else(|| game.logo_url.clone())
            .or_else(|| game.cover_url.clone());

        if let Some(pfn) = package_family_name {
            if let Ok(contents) = fs::read_to_string(root.join("AppxManifest.xml")) {
                if let Some(app_id) = find_uwp_app_id(&contents) {
                    let aumid = format!("{}!{}", pfn, app_id);
                    game.launch_uri = Some(format!("shell:AppsFolder\\{}", aumid));
                    println!(
                        "[open-game-launcher] Detected Xbox AUMID launch URI for {}: {}",
                        game.title, aumid
                    );
                }
            }
        }

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
    if depth > 3 {
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

        if child.join("MicrosoftGame.config").is_file() {
            roots.push(child.clone());
        }

        collect_xbox_config_roots(&child, depth + 1, roots);
    }
}

#[cfg(windows)]
fn read_windows_app_packages() -> HashMap<PathBuf, String> {
    let mut result = HashMap::new();
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "Get-AppxPackage | ForEach-Object { $_.InstallLocation + '|' + $_.PackageFamilyName }",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    if let Ok(output) = output {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }

                let parts: Vec<&str> = line.split('|').collect();
                if parts.len() == 2 {
                    let install_location = parts[0].trim();
                    let package_family_name = parts[1].trim();
                    if !install_location.is_empty() && !package_family_name.is_empty() {
                        result.insert(
                            PathBuf::from(install_location),
                            package_family_name.to_string(),
                        );
                    }
                }
            }
        }
    }
    result
}

#[cfg(not(windows))]
fn read_windows_app_packages() -> HashMap<PathBuf, String> {
    HashMap::new()
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

fn find_uwp_app_id(contents: &str) -> Option<String> {
    let app_start = contents.find("<Application ")?;
    let sub = &contents[app_start..];

    let sub_lower = sub.to_lowercase();
    let id_marker = sub_lower.find("id=").or_else(|| sub_lower.find("id ="))?;

    let val_start = sub[id_marker..].find('"')? + id_marker + 1;
    let val_sub = &sub[val_start..];
    let val_end = val_sub.find('"')?;

    Some(val_sub[..val_end].to_string())
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

pub fn find_local_banner_asset(path: &Path) -> Option<String> {
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

pub fn find_local_logo_asset(path: &Path) -> Option<String> {
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

pub fn find_local_icon_asset(path: &Path) -> Option<String> {
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

pub struct UbisoftRegistryInstall {
    pub install_id: String,
    pub install_dir: PathBuf,
}

pub struct UbisoftLauncherAssets {
    pub cover_url: Option<String>,
    pub logo_url: Option<String>,
    pub icon_url: Option<String>,
}

pub fn read_ubisoft_registry_installs() -> Vec<UbisoftRegistryInstall> {
    if !cfg!(target_os = "windows") {
        return Vec::new();
    }

    [
        r"HKLM\SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs",
        r"HKLM\SOFTWARE\Ubisoft\Launcher\Installs",
        r"HKLM\SOFTWARE\WOW6432Node\ubisoft\Launcher\Installs",
        r"HKLM\SOFTWARE\ubisoft\Launcher\Installs",
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

pub fn registry_string_value(line: &str, value_name: &str) -> Option<String> {
    let trimmed = line.trim();
    let remainder = trimmed.strip_prefix(value_name)?.trim_start();
    let value = remainder.strip_prefix("REG_SZ")?.trim();

    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

pub struct BattleNetRegistryInstall {
    pub uid: String,
    pub title: String,
    pub install_dir: PathBuf,
    pub icon_path: Option<String>,
}

fn extract_arg(input: &str, arg_name: &str) -> Option<String> {
    let needle = format!("{}=", arg_name);
    let idx = input.find(&needle)?;
    let start = idx + needle.len();
    let remaining = &input[start..];

    if let Some(quoted) = remaining.strip_prefix('"') {
        let end_quote = quoted.find('"')?;
        Some(quoted[..end_quote].to_string())
    } else {
        let end = remaining.find(' ').unwrap_or(remaining.len());
        Some(remaining[..end].to_string())
    }
}

pub fn read_battlenet_registry_installs() -> Vec<BattleNetRegistryInstall> {
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

pub fn find_ubisoft_launcher_assets(install_id: &str) -> UbisoftLauncherAssets {
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
        install_id,
    );
    let logo_url = find_ubisoft_config_asset(&config_segment, &["logo_image"], install_id);
    let icon_url = find_ubisoft_config_asset(&config_segment, &["icon_image"], install_id)
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

fn find_ubisoft_config_asset(
    config_segment: &str,
    keys: &[&str],
    install_id: &str,
) -> Option<String> {
    keys.iter()
        .filter_map(|key| find_yaml_like_value(config_segment, key))
        .filter_map(|file_name| find_ubisoft_cached_asset_for_install(&file_name, install_id))
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

    let file_stem = Path::new(&normalized)
        .file_stem()
        .and_then(|stem| stem.to_str())?
        .to_string();

    for root in ubisoft_cached_asset_roots() {
        let direct_path = root.join(&normalized);
        if direct_path.exists() && direct_path.is_file() {
            return Some(path_to_string(direct_path));
        }

        let Ok(entries) = fs::read_dir(&root) else {
            continue;
        };

        if let Some(path) = entries.flatten().map(|entry| entry.path()).find(|path| {
            path.is_file()
                && is_supported_image(path)
                && path
                    .file_stem()
                    .and_then(|stem| stem.to_str())
                    .is_some_and(|stem| stem.eq_ignore_ascii_case(&file_stem))
        }) {
            return Some(path_to_string(path));
        }
    }

    None
}

/// Same as [`find_ubisoft_cached_asset`] but also tries an
/// `assets/<install_id>/<filename>` lookup. Newer Ubisoft Connect builds
/// segregate per-game artwork in a sub-folder named after the numeric
/// `install_id` (Uplay id) â€“ e.g.
/// `C:\ProgramData\Ubisoft\Ubisoft Game Launcher\cache\assets\1234\hero.jpg`.
fn find_ubisoft_cached_asset_for_install(file_name: &str, install_id: &str) -> Option<String> {
    if let Some(found) = find_ubisoft_cached_asset(file_name) {
        return Some(found);
    }

    let normalized = file_name.trim().replace('/', "\\");
    if normalized.is_empty() || install_id.trim().is_empty() {
        return None;
    }

    let file_stem = Path::new(&normalized)
        .file_stem()
        .and_then(|stem| stem.to_str())?
        .to_string();

    for root in ubisoft_cached_asset_roots() {
        let per_game_root = root.join(install_id);
        let direct_path = per_game_root.join(&normalized);
        if direct_path.exists() && direct_path.is_file() {
            return Some(path_to_string(direct_path));
        }

        let Ok(entries) = fs::read_dir(&per_game_root) else {
            continue;
        };
        if let Some(path) = entries.flatten().map(|entry| entry.path()).find(|path| {
            path.is_file()
                && is_supported_image(path)
                && path
                    .file_stem()
                    .and_then(|stem| stem.to_str())
                    .is_some_and(|stem| stem.eq_ignore_ascii_case(&file_stem))
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

pub struct EaRegistryInstall {
    pub title: String,
    pub install_dir: PathBuf,
    pub content_id: Option<String>,
    pub icon_path: Option<String>,
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

pub fn read_ea_registry_installs() -> Vec<EaRegistryInstall> {
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

pub fn get_ea_assets(
    content_id: &str,
    title: &str,
) -> (Option<String>, Option<String>, Option<String>) {
    let (fallback_cover, fallback_logo, fallback_icon) = get_known_ea_assets(title);
    if let Some(api_assets) = get_rawg_ea_assets(content_id, title) {
        return (
            api_assets.cover_url.or(fallback_cover),
            api_assets.logo_url.or(fallback_logo),
            api_assets.icon_url.or(fallback_icon),
        );
    }

    (fallback_cover, fallback_logo, fallback_icon)
}

fn get_known_ea_assets(title: &str) -> (Option<String>, Option<String>, Option<String>) {
    let normalized_title = title.to_lowercase();

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

pub fn scan_ea_games() -> Vec<InstalledGame> {
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
            "ea".to_string(),
            Some(path_to_string(install.install_dir.clone())),
            banner_path,
        );

        if !content_id.is_empty() {
            game.external_id = Some(content_id.clone());
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merge_scanned_games_uses_path_priority_index() {
        let install_path = Some("C:/Games/Same Install".to_string());
        let steam = installed_game(
            "steam-1",
            "Same Install".to_string(),
            "Steam".to_string(),
            install_path.clone(),
            None,
        );
        let epic = installed_game(
            "epic-1",
            "Same Install".to_string(),
            "Epic Games".to_string(),
            install_path.clone(),
            None,
        );
        let lower_priority_steam = installed_game(
            "steam-2",
            "Same Install".to_string(),
            "Steam".to_string(),
            install_path,
            None,
        );
        let mut games = BTreeMap::new();
        let mut path_index = HashMap::new();

        merge_scanned_game(&mut games, &mut path_index, steam);
        merge_scanned_game(&mut games, &mut path_index, epic);
        merge_scanned_game(&mut games, &mut path_index, lower_priority_steam);

        assert_eq!(games.len(), 1);
        assert!(games.contains_key("epic-1"));
    }

    #[test]
    fn ubisoft_directory_match_gets_registry_launch_metadata() {
        let mut games = vec![installed_game(
            "ubisoft-Assassins Creed Mirage",
            "Assassins Creed Mirage".to_string(),
            "ubisoft".to_string(),
            Some("C:/Ubisoft Games/Assassins Creed Mirage".to_string()),
            None,
        )];

        apply_ubisoft_launcher_metadata(
            &mut games,
            "ASSASSINS CREED MIRAGE",
            "6100",
            UbisoftLauncherAssets {
                cover_url: Some("cover.jpg".to_string()),
                logo_url: Some("logo.png".to_string()),
                icon_url: Some("icon.png".to_string()),
            },
        );

        let game = &games[0];
        assert_eq!(game.id, "ubisoft-6100");
        assert_eq!(game.external_id.as_deref(), Some("6100"));
        assert_eq!(game.launch_uri.as_deref(), Some("uplay://launch/6100"));
        assert_eq!(game.cover_url.as_deref(), Some("cover.jpg"));
        assert_eq!(game.logo_url.as_deref(), Some("logo.png"));
        assert_eq!(game.icon_url.as_deref(), Some("icon.png"));
    }
}
