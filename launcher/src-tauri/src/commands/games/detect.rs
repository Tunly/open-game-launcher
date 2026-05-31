use std::{
    collections::{BTreeMap, HashMap, HashSet},
    env, fs,
    path::{Path, PathBuf},
    process::Command,
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
    apply_battlenet_assets, current_unix_timestamp, env_path, get_dir_last_modified,
    installed_game, is_ignored_game_directory, local_drive_roots, path_to_string,
    rawg_asset_cache_path, unix_timestamp_to_iso,
};
use super::types::*;

fn normalize_scanned_launcher(launcher: &str) -> String {
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

fn merge_scanned_game(games: &mut BTreeMap<String, InstalledGame>, mut candidate: InstalledGame) {
    candidate.launcher = normalize_scanned_launcher(&candidate.launcher);

    if let Some(install_path) = candidate
        .install_path
        .as_deref()
        .filter(|path| !path.is_empty())
    {
        if let Some(candidate_canon) = canonical_install_path(install_path) {
            let mut replace_id: Option<String> = None;
            let mut skip_insert = false;

            for (existing_id, existing) in games.iter() {
                let Some(existing_path) = existing.install_path.as_deref() else {
                    continue;
                };
                let Some(existing_canon) = canonical_install_path(existing_path) else {
                    continue;
                };
                if existing_canon != candidate_canon {
                    continue;
                }

                if launcher_scan_priority(&candidate) > launcher_scan_priority(existing) {
                    replace_id = Some(existing_id.clone());
                } else {
                    skip_insert = true;
                }
                break;
            }

            if skip_insert {
                return;
            }
            if let Some(old_id) = replace_id {
                games.remove(&old_id);
            }
        }
    }

    games.entry(candidate.id.clone()).or_insert(candidate);
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

    // Spawn threads for parallel scanning
    let handle_steam = thread::spawn(|| scan_steam_games());
    let handle_epic = thread::spawn(|| scan_epic_games());
    let handle_gog = thread::spawn(|| scan_gog_games());
    let handle_ubisoft = thread::spawn(|| scan_ubisoft_games());
    let handle_xbox = thread::spawn(|| scan_xbox_games());
    let handle_battlenet = thread::spawn(|| scan_battlenet_games());
    let handle_ea = thread::spawn(|| scan_ea_games());

    // Join and merge results (EA/Epic/etc. win over Steam for the same install folder)
    if let Ok(steam_games) = handle_steam.join() {
        for game in steam_games {
            merge_scanned_game(&mut games, game);
        }
    }
    if let Ok(epic_games) = handle_epic.join() {
        for game in epic_games {
            merge_scanned_game(&mut games, game);
        }
    }
    if let Ok(gog_games) = handle_gog.join() {
        for game in gog_games {
            merge_scanned_game(&mut games, game);
        }
    }
    if let Ok(ubisoft_games) = handle_ubisoft.join() {
        for game in ubisoft_games {
            merge_scanned_game(&mut games, game);
        }
    }
    if let Ok(xbox_games) = handle_xbox.join() {
        for game in xbox_games {
            merge_scanned_game(&mut games, game);
        }
    }
    if let Ok(battlenet_games) = handle_battlenet.join() {
        for game in battlenet_games {
            merge_scanned_game(&mut games, game);
        }
    }
    if let Ok(ea_games) = handle_ea.join() {
        for game in ea_games {
            merge_scanned_game(&mut games, game);
        }
    }

    games.into_values().collect()
}

pub fn scan_steam_games() -> Vec<InstalledGame> {
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
                let install_dir_path = install_dir
                    .map(|dir| steamapps.join("common").join(dir))
                    .filter(|dir| dir.exists());

                if install_dir_path
                    .as_ref()
                    .is_some_and(|path| is_ea_install_directory(path))
                {
                    continue;
                }

                let install_path = install_dir_path.map(path_to_string);
                let cover_url = app_id.as_ref().map(|id| {
                    format!(
                        "https://cdn.cloudflare.steamstatic.com/steam/apps/{id}/library_hero.jpg"
                    )
                });
                let game_id = app_id
                    .as_ref()
                    .map(|id| format!("steam-{id}"))
                    .unwrap_or_else(|| format!("steam-{}", super::core::slugify(&title)));
                let mut game = installed_game(
                    &game_id,
                    title,
                    "steam".to_string(),
                    install_path,
                    cover_url,
                );
                if let Some(id) = app_id {
                    game.external_id = Some(id.clone());
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

pub fn scan_epic_games() -> Vec<InstalledGame> {
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
            let catalog_item_id = value
                .get("CatalogItemId")
                .or_else(|| value.get("CatalogItemIdOverride"))
                .and_then(|id| id.as_str())
                .map(str::trim)
                .filter(|id| !id.is_empty())
                .map(ToOwned::to_owned);
            let app_name = value
                .get("AppName")
                .or_else(|| value.get("MainGameAppName"))
                .and_then(|id| id.as_str())
                .map(str::trim)
                .filter(|id| !id.is_empty())
                .map(ToOwned::to_owned);
            let namespace = value
                .get("CatalogNamespace")
                .or_else(|| value.get("Namespace"))
                .and_then(|id| id.as_str())
                .map(str::trim)
                .filter(|id| !id.is_empty())
                .map(ToOwned::to_owned);
            let install_root = install_path.as_ref().map(PathBuf::from);
            let epic_assets = find_epic_launcher_assets(&value, &title, &catalog_cache);
            let rawg_assets =
                get_rawg_game_assets("epic", app_name.as_deref().unwrap_or(&title), &title);

            let cover_url = rawg_assets
                .as_ref()
                .and_then(|a| a.cover_url.clone())
                .or_else(|| epic_assets.cover_url.clone())
                .or_else(|| {
                    install_root
                        .as_ref()
                        .and_then(|path| find_local_banner_asset(path))
                });
            let logo_url = rawg_assets
                .as_ref()
                .and_then(|a| a.logo_url.clone())
                .or_else(|| epic_assets.logo_url.clone())
                .or_else(|| {
                    install_root
                        .as_ref()
                        .and_then(|path| find_local_logo_asset(path))
                });
            let icon_url = rawg_assets
                .as_ref()
                .and_then(|a| a.icon_url.clone())
                .or_else(|| epic_assets.icon_url.clone())
                .or_else(|| {
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
            game.external_id = catalog_item_id
                .or_else(|| app_name.clone())
                .or_else(|| namespace.clone());
            if let Some(app_name) = app_name {
                game.launch_uri = Some(format!(
                    "com.epicgames.launcher://apps/{app_name}?action=launch&silent=true"
                ));
            }
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
    let mut cache = read_rawg_asset_cache();
    if let Some(cached_assets) = cache.entries.get(&cache_key) {
        return Some(cached_assets.clone());
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
        cache.entries.insert(cache_key, assets.clone());
        write_rawg_asset_cache(&cache);
        return Some(assets);
    }

    None
}

pub fn get_rawg_battlenet_assets(uid: &str, title: &str) -> Option<RawgAssets> {
    let search_title = battlenet_rawg_search_title(uid, title);
    get_rawg_game_assets("battlenet", uid, &search_title)
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
    let search_url = format!(
        "https://api.rawg.io/api/games?key={}&search={}&search_precise=true&page_size=1",
        url_query_encode(api_key),
        url_query_encode(title)
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

        let launcher_assets = find_ubisoft_launcher_assets(&install.install_id);

        if !seen_titles.insert(title.to_lowercase()) {
            apply_ubisoft_launcher_assets(&mut games, title, launcher_assets);
            continue;
        }

        let mut game = installed_game(
            &format!("ubisoft-{}", install.install_id),
            title.to_string(),
            "ubisoft".to_string(),
            Some(path_to_string(install.install_dir.clone())),
            launcher_assets
                .cover_url
                .or_else(|| find_local_banner_asset(&install.install_dir)),
        );
        game.external_id = Some(install.install_id.clone());
        game.launch_uri = Some(format!("uplay://launch/{}", install.install_id));
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

#[allow(dead_code)]
pub fn decode_oem_ansi(bytes: &[u8]) -> String {
    if let Ok(utf8_str) = String::from_utf8(bytes.to_vec()) {
        return utf8_str;
    }
    let mut s = String::with_capacity(bytes.len());
    for &b in bytes {
        match b {
            0..=127 => s.push(b as char),
            0x84 | 0xE4 => s.push('\u{00e4}'),
            0x94 | 0xF6 => s.push('\u{00f6}'),
            0x81 | 0xFC => s.push('\u{00fc}'),
            0x8E | 0xC4 => s.push('\u{00c4}'),
            0x99 | 0xD6 => s.push('\u{00d6}'),
            0x9A | 0xDC => s.push('\u{00dc}'),
            0xE1 | 0xDF => s.push('\u{00df}'),
            0x82 | 0xE9 => s.push('\u{00e9}'),
            0x8A | 0xE8 => s.push('\u{00e8}'),
            0x85 | 0xE0 => s.push('\u{00e0}'),
            0x91 | 0xE6 => s.push('\u{00e6}'),
            0x92 | 0xC6 => s.push('\u{00c6}'),
            _ => s.push(b as char),
        }
    }
    s
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

    if remaining.starts_with('"') {
        let end_quote = remaining[1..].find('"')?;
        Some(remaining[1..end_quote + 1].to_string())
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

pub fn find_steam_dir() -> Option<PathBuf> {
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

pub fn read_steam_library_folders(steam_dir: &Path) -> Vec<PathBuf> {
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

pub fn find_quoted_value(contents: &str, key: &str) -> Option<String> {
    let needle = format!("\"{key}\"");
    let index = contents.find(&needle)?;
    let after_key = &contents[index + needle.len()..];
    let value_start = after_key.find('"')? + 1;
    let after_quote = &after_key[value_start..];
    let value_end = after_quote.find('"')?;

    Some(after_quote[..value_end].to_string())
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

pub async fn search_steam_appid(title: &str) -> Option<u32> {
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

pub fn steam_app_id_for_game(game: &InstalledGame) -> Option<u32> {
    if super::core::launcher_key_from_source(&game.launcher) == "steam" {
        if let Some(external_id) = game.external_id.as_deref() {
            if let Ok(appid) = external_id.parse::<u32>() {
                return Some(appid);
            }
        }
    }

    for prefix in ["steam-owned-", "steam-"] {
        if let Some(appid) = game.id.strip_prefix(prefix) {
            if let Ok(appid) = appid.parse::<u32>() {
                return Some(appid);
            }
        }
    }

    game.launch_uri
        .as_deref()
        .and_then(|uri| uri.strip_prefix("steam://rungameid/"))
        .and_then(|appid| appid.parse::<u32>().ok())
}

pub async fn fetch_steam_achievements(
    appid: u32,
    steam_id: Option<String>,
    api_key: Option<String>,
) -> Result<Vec<UnifiedAchievement>, String> {
    let api_key = api_key
        .or_else(|| env::var("STEAM_WEB_API_KEY").ok())
        .or_else(|| env::var("STEAM_API_KEY").ok())
        .map(|key| key.trim().to_string())
        .filter(|key| !key.is_empty());
    let steam_id = steam_id
        .or_else(|| env::var("STEAM_ID").ok())
        .or_else(|| env::var("VITE_STEAM_ID").ok())
        .map(|id| id.trim().trim_matches('"').to_string())
        .filter(|id| !id.is_empty());

    if let Some(steam_id) = steam_id.as_deref() {
        if let Ok(achievements) =
            fetch_steam_player_achievements(appid, steam_id, api_key.as_deref()).await
        {
            if !achievements.is_empty() {
                return Ok(achievements);
            }
        }

        if let Ok(achievements) = fetch_steam_community_xml_achievements(appid, steam_id).await {
            if !achievements.is_empty() {
                return Ok(achievements);
            }
        }
    }

    if let Some(api_key) = api_key.as_deref() {
        if let Ok(achievements) = fetch_steam_schema_achievements(appid, api_key).await {
            if !achievements.is_empty() {
                return Ok(achievements);
            }
        }
    }

    Err(
        "Steam achievement sync could not read public player achievements from Steam Web API or Steam Community XML. Add a Steam Web API Key in Settings, or make sure your Steam profile and game details are public."
            .to_string(),
    )
}

async fn fetch_steam_player_achievements(
    appid: u32,
    steam_id: &str,
    api_key: Option<&str>,
) -> Result<Vec<UnifiedAchievement>, String> {
    let client = reqwest::Client::new();
    let mut query = vec![
        ("appid", appid.to_string()),
        ("steamid", steam_id.to_string()),
        ("l", "en".to_string()),
    ];

    if let Some(api_key) = api_key {
        query.push(("key", api_key.to_string()));
    }

    let response = client
        .get("https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/")
        .query(&query)
        .send()
        .await
        .map_err(|error| format!("Could not contact Steam achievements API: {error}"))?;
    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|error| format!("Could not parse Steam achievements API response: {error}"))?;

    let achievements = json
        .get("playerstats")
        .and_then(|stats| stats.get("achievements"))
        .and_then(|achievements| achievements.as_array())
        .ok_or_else(|| "Steam did not return player achievements for this game.".to_string())?;

    Ok(achievements
        .iter()
        .filter_map(|achievement| {
            let id = achievement
                .get("apiname")
                .or_else(|| achievement.get("name"))
                .and_then(|value| value.as_str())?
                .to_string();
            let name = achievement
                .get("name")
                .and_then(|value| value.as_str())
                .unwrap_or(&id)
                .to_string();
            let unlocked = achievement
                .get("achieved")
                .and_then(|value| value.as_u64())
                .unwrap_or_default()
                > 0;
            let unlocked_at = if unlocked {
                achievement
                    .get("unlocktime")
                    .and_then(|value| value.as_u64())
                    .filter(|timestamp| *timestamp > 0)
                    .map(unix_timestamp_to_iso)
                    .or_else(|| Some(unix_timestamp_to_iso(current_unix_timestamp())))
            } else {
                None
            };

            Some(UnifiedAchievement {
                id,
                name,
                description: achievement
                    .get("description")
                    .and_then(|value| value.as_str())
                    .map(ToOwned::to_owned),
                icon_url: None,
                unlocked_at,
                rarity: None,
            })
        })
        .collect())
}

async fn fetch_steam_community_xml_achievements(
    appid: u32,
    steam_id: &str,
) -> Result<Vec<UnifiedAchievement>, String> {
    let url = format!("https://steamcommunity.com/profiles/{steam_id}/stats/{appid}/?xml=1");
    let client = reqwest::Client::new();
    let response =
        client.get(url).send().await.map_err(|error| {
            format!("Could not contact Steam Community achievements XML: {error}")
        })?;

    if !response.status().is_success() {
        return Err(format!(
            "Steam Community achievements XML returned status {}.",
            response.status()
        ));
    }

    let xml = response
        .text()
        .await
        .map_err(|error| format!("Could not read Steam Community achievements XML: {error}"))?;
    let mut achievements = Vec::new();
    let mut remaining = xml.as_str();

    while let Some(start_index) = remaining.find("<achievement") {
        let after_start = &remaining[start_index..];
        let Some(open_end_index) = after_start.find('>') else {
            break;
        };
        let after_open = &after_start[open_end_index + 1..];
        let Some(close_index) = after_open.find("</achievement>") else {
            break;
        };
        let block = &after_open[..close_index];

        if let Some(name) = xml_tag_text(block, "name") {
            let id = xml_tag_text(block, "apiname")
                .or_else(|| xml_tag_text(block, "apiName"))
                .unwrap_or_else(|| normalize_achievement_id(&name));
            let unlock_timestamp = xml_tag_text(block, "unlockTimestamp")
                .and_then(|value| value.parse::<u64>().ok())
                .filter(|timestamp| *timestamp > 0);
            let is_closed = xml_tag_text(block, "closed")
                .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
                .unwrap_or(false);
            let unlocked_at = unlock_timestamp
                .map(unix_timestamp_to_iso)
                .or_else(|| is_closed.then(|| unix_timestamp_to_iso(current_unix_timestamp())));

            achievements.push(UnifiedAchievement {
                id,
                name,
                description: xml_tag_text(block, "description"),
                icon_url: xml_tag_text(block, "iconClosed")
                    .or_else(|| xml_tag_text(block, "iconOpen")),
                unlocked_at,
                rarity: None,
            });
        }

        remaining = &after_open[close_index + "</achievement>".len()..];
    }

    Ok(achievements)
}

fn xml_tag_text(block: &str, tag: &str) -> Option<String> {
    let open_tag = format!("<{tag}>");
    let close_tag = format!("</{tag}>");
    let start = block.find(&open_tag)? + open_tag.len();
    let end = block[start..].find(&close_tag)? + start;
    let value = block[start..end].trim();
    let value = value
        .strip_prefix("<![CDATA[")
        .and_then(|inner| inner.strip_suffix("]]>"))
        .unwrap_or(value);
    let value = xml_unescape(value.trim());

    (!value.is_empty()).then_some(value)
}

fn xml_unescape(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
}

fn normalize_achievement_id(name: &str) -> String {
    name.chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect::<String>()
        .split('_')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("_")
}

async fn fetch_steam_schema_achievements(
    appid: u32,
    api_key: &str,
) -> Result<Vec<UnifiedAchievement>, String> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/")
        .query(&[
            ("appid", appid.to_string()),
            ("key", api_key.to_string()),
            ("l", "en".to_string()),
        ])
        .send()
        .await
        .map_err(|error| format!("Could not contact Steam achievement schema API: {error}"))?;
    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|error| format!("Could not parse Steam achievement schema response: {error}"))?;

    let achievements = json
        .get("game")
        .and_then(|game| game.get("availableGameStats"))
        .and_then(|stats| stats.get("achievements"))
        .and_then(|achievements| achievements.as_array())
        .ok_or_else(|| "Steam did not return achievement schema for this game.".to_string())?;

    Ok(achievements
        .iter()
        .filter_map(|achievement| {
            let id = achievement
                .get("name")
                .and_then(|value| value.as_str())?
                .to_string();
            let name = achievement
                .get("displayName")
                .and_then(|value| value.as_str())
                .unwrap_or(&id)
                .to_string();

            Some(UnifiedAchievement {
                id,
                name,
                description: achievement
                    .get("description")
                    .and_then(|value| value.as_str())
                    .map(ToOwned::to_owned),
                icon_url: achievement
                    .get("icon")
                    .and_then(|value| value.as_str())
                    .map(ToOwned::to_owned),
                unlocked_at: None,
                rarity: None,
            })
        })
        .collect())
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
    Option<f64>,
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

    let rating = data
        .get("metacritic")
        .and_then(|value| value.get("score"))
        .and_then(|value| value.as_f64())
        .map(|score| (score / 20.0).clamp(0.0, 5.0));

    Some((
        genres,
        developer,
        publisher,
        release_date,
        features,
        description,
        rating,
    ))
}

pub async fn sync_game_metadata(mut game: InstalledGame) -> InstalledGame {
    game.launcher = normalize_scanned_launcher(&game.launcher);

    if !game.genres.is_empty() || game.developer.is_some() {
        return game;
    }

    if super::core::launcher_key_from_source(&game.launcher) != "steam" {
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
        if let Some((genres, developer, publisher, release_date, features, description, rating)) =
            fetch_steam_metadata(id).await
        {
            game.genres = genres;
            game.developer = developer;
            game.publisher = publisher;
            game.release_date = release_date;
            game.features = features;
            game.rating = rating;
            if let Some(desc) = description {
                game.description = desc;
            }
        }
    }

    game
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
