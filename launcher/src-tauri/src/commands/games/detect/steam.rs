use std::collections::{BTreeMap, HashMap, HashSet};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
use winreg::{
    enums::{RegType, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ},
    RegKey, RegValue, HKEY,
};

use super::super::core::{
    current_unix_timestamp, env_path, installed_game, path_to_string, slugify,
    unix_timestamp_to_iso,
};
use super::super::types::*;
use super::legacy::{is_ea_install_directory, normalize_scanned_launcher};

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
                if is_steam_non_game_manifest(app_id.as_deref(), &title) {
                    continue;
                }

                let Some(install_dir_path) =
                    steam_install_dir_path(&steamapps, install_dir.as_deref())
                else {
                    continue;
                };

                if is_ea_install_directory(&install_dir_path) {
                    continue;
                }

                let install_path = Some(path_to_string(install_dir_path));
                let cover_url = app_id.as_ref().map(|id| {
                    format!(
                        "https://cdn.cloudflare.steamstatic.com/steam/apps/{id}/library_hero.jpg"
                    )
                });
                let game_id = app_id
                    .as_ref()
                    .map(|id| format!("steam-{id}"))
                    .unwrap_or_else(|| format!("steam-{}", slugify(&title)));
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

pub fn find_steam_dir() -> Option<PathBuf> {
    let mut candidates = Vec::new();

    if cfg!(target_os = "windows") {
        candidates.extend(find_steam_dirs_from_registry());

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

#[cfg(windows)]
fn find_steam_dirs_from_registry() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let roots = [
        (HKEY_CURRENT_USER, r"Software\Valve\Steam"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Valve\Steam"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\Valve\Steam"),
    ];

    for (hkey, path) in roots {
        let root = RegKey::predef(hkey);
        let Ok(key) = root.open_subkey_with_flags(path, KEY_READ) else {
            continue;
        };

        for value_name in ["SteamPath", "InstallPath"] {
            let Ok(value) = key.get_value::<String, _>(value_name) else {
                continue;
            };

            if !value.trim().is_empty() {
                candidates.push(PathBuf::from(value.replace('/', "\\")));
            }
        }
    }

    candidates
}

#[cfg(not(windows))]
fn find_steam_dirs_from_registry() -> Vec<PathBuf> {
    Vec::new()
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

fn steam_install_dir_path(steamapps: &Path, install_dir: Option<&str>) -> Option<PathBuf> {
    let install_dir = install_dir?.trim();
    if install_dir.is_empty() || install_dir.contains("..") {
        return None;
    }

    let path = steamapps.join("common").join(install_dir);
    path.is_dir().then_some(path)
}

fn is_steam_non_game_manifest(app_id: Option<&str>, title: &str) -> bool {
    let normalized = title
        .to_lowercase()
        .replace(['_', '-'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    if matches!(
        app_id,
        Some("228980")
            | Some("1070560")
            | Some("1391110")
            | Some("1628350")
            | Some("1887720")
            | Some("2102450")
            | Some("2289880")
            | Some("250820")
            | Some("1826330")
    ) {
        return true;
    }

    normalized == "steamworks common redistributables"
        || normalized.starts_with("steam linux runtime")
        || normalized.starts_with("proton ")
        || normalized.contains("proton easyanticheat runtime")
        || normalized.contains("proton battleye runtime")
        || normalized.contains("steamvr")
        || normalized.contains("steam vr")
        || normalized.contains("common redistributable")
        || normalized.contains("dedicated server")
        || normalized.ends_with(" sdk")
        || normalized.contains(" sdk ")
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

pub async fn search_steam_appid(title: &str) -> Option<u32> {
    let client = crate::commands::http::shared_http_client();
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
    if super::super::core::launcher_key_from_source(&game.launcher) == "steam" {
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
) -> Result<Vec<UnifiedAchievement>, String> {
    let steam_id = steam_id
        .or_else(|| env::var("STEAM_ID").ok())
        .or_else(|| env::var("VITE_STEAM_ID").ok())
        .map(|id| id.trim().trim_matches('"').to_string())
        .filter(|id| !id.is_empty());

    let player_fut = async {
        if let Some(steam_id) = steam_id.as_deref() {
            fetch_steam_player_achievements(appid, steam_id)
                .await
                .unwrap_or_default()
        } else {
            Vec::new()
        }
    };
    let community_fut = async {
        if let Some(steam_id) = steam_id.as_deref() {
            fetch_steam_community_xml_achievements(appid, steam_id)
                .await
                .unwrap_or_default()
        } else {
            Vec::new()
        }
    };
    let rarity_fut = async {
        fetch_steam_global_achievement_percentages(appid)
            .await
            .unwrap_or_default()
    };

    let (player, community, rarity) = tokio::join!(player_fut, community_fut, rarity_fut);

    let merged = merge_achievement_sources(player, community, Vec::new(), &rarity);

    if merged.is_empty() {
        return Err(
            "Steam achievement sync could not read public Steam achievements. Make sure your Steam profile and game details are public."
                .to_string(),
        );
    }

    Ok(merged)
}

fn merge_achievement_sources(
    player: Vec<UnifiedAchievement>,
    community: Vec<UnifiedAchievement>,
    schema: Vec<UnifiedAchievement>,
    rarity: &HashMap<String, f64>,
) -> Vec<UnifiedAchievement> {
    let mut by_id: HashMap<String, UnifiedAchievement> = HashMap::new();

    // 1. Schema first: displayName, description, icon. No unlock state.
    for ach in schema {
        by_id.insert(ach.id.clone(), ach);
    }

    // 2. Community XML overlay: brings icons + descriptions + unlock data. Fills gaps in schema entries.
    for ach in community {
        by_id
            .entry(ach.id.clone())
            .and_modify(|existing| {
                if existing.icon_url.is_none() {
                    existing.icon_url = ach.icon_url.clone();
                }
                if existing.description.is_none() {
                    existing.description = ach.description.clone();
                }
                if existing.unlocked_at.is_none() {
                    existing.unlocked_at = ach.unlocked_at.clone();
                }
            })
            .or_insert(ach);
    }

    // 3. Player data: authoritative unlock timestamp; cleaner display name.
    for ach in player {
        by_id
            .entry(ach.id.clone())
            .and_modify(|existing| {
                if ach.unlocked_at.is_some() {
                    existing.unlocked_at = ach.unlocked_at.clone();
                }
                if !ach.name.is_empty() && ach.name != ach.id {
                    existing.name = ach.name.clone();
                }
            })
            .or_insert(ach);
    }

    // 4. Global rarity overlay.
    for (id, ach) in by_id.iter_mut() {
        if let Some(pct) = rarity.get(id) {
            ach.rarity = Some(*pct);
        }
    }

    by_id.into_values().collect()
}

async fn fetch_steam_global_achievement_percentages(
    appid: u32,
) -> Result<HashMap<String, f64>, String> {
    let client = crate::commands::http::shared_http_client();
    let response = client
        .get("https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/")
        .query(&[("gameid", appid.to_string())])
        .send()
        .await
        .map_err(|error| format!("Could not contact Steam global achievement API: {error}"))?;
    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|error| format!("Could not parse Steam global achievement response: {error}"))?;

    let mut map = HashMap::new();
    if let Some(achievements) = json
        .get("achievementpercentages")
        .and_then(|p| p.get("achievements"))
        .and_then(|a| a.as_array())
    {
        for ach in achievements {
            if let (Some(name), Some(percent)) = (
                ach.get("name").and_then(|v| v.as_str()),
                ach.get("percent").and_then(|v| v.as_f64()),
            ) {
                map.insert(name.to_string(), percent);
            }
        }
    }

    Ok(map)
}

async fn fetch_steam_player_achievements(
    appid: u32,
    steam_id: &str,
) -> Result<Vec<UnifiedAchievement>, String> {
    let client = crate::commands::http::shared_http_client();
    let query = vec![
        ("appid", appid.to_string()),
        ("steamid", steam_id.to_string()),
        ("l", "en".to_string()),
    ];

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
                source: Some("steam".to_string()),
                source_achievement_id: None,
                provider_confidence: Some("official".to_string()),
            })
        })
        .collect())
}

async fn fetch_steam_community_xml_achievements(
    appid: u32,
    steam_id: &str,
) -> Result<Vec<UnifiedAchievement>, String> {
    let url = format!("https://steamcommunity.com/profiles/{steam_id}/stats/{appid}/?xml=1");
    let client = crate::commands::http::shared_http_client();
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
                source: Some("steam".to_string()),
                source_achievement_id: None,
                provider_confidence: Some("official".to_string()),
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
    let client = crate::commands::http::shared_http_client();
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

    if super::super::core::launcher_key_from_source(&game.launcher) != "steam" {
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

    #[test]
    fn filters_steam_runtime_and_redistributable_manifests() {
        assert!(is_steam_non_game_manifest(
            Some("228980"),
            "Steamworks Common Redistributables"
        ));
        assert!(is_steam_non_game_manifest(
            Some("1070560"),
            "Steam Linux Runtime 1.0 (scout)"
        ));
        assert!(is_steam_non_game_manifest(
            None,
            "Proton EasyAntiCheat Runtime"
        ));
        assert!(!is_steam_non_game_manifest(Some("4000"), "Garry's Mod"));
    }

    #[test]
    fn steam_install_dir_requires_existing_common_directory() {
        let temp = temp_test_dir("steam-install-dir");
        let steamapps = temp.join("steamapps");
        let common = steamapps.join("common");
        let game_dir = common.join("GarrysMod");
        fs::create_dir_all(&game_dir).expect("create fake steam install");

        assert_eq!(
            steam_install_dir_path(&steamapps, Some("GarrysMod")).as_deref(),
            Some(game_dir.as_path())
        );
        assert!(steam_install_dir_path(&steamapps, Some("MissingGame")).is_none());
        assert!(steam_install_dir_path(&steamapps, Some("../Outside")).is_none());
        assert!(steam_install_dir_path(&steamapps, None).is_none());

        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn steam_scan_smoke_test_filters_invalid_installed_entries_when_steam_exists() {
        let games = scan_steam_games();

        for game in games {
            assert!(
                game.install_path
                    .as_deref()
                    .is_some_and(|path| !path.is_empty()),
                "Steam scan returned installed game without install path: {}",
                game.title
            );
            assert!(
                !is_steam_non_game_manifest(game.external_id.as_deref(), &game.title),
                "Steam scan returned non-game manifest entry: {}",
                game.title
            );
        }
    }

    fn temp_test_dir(name: &str) -> PathBuf {
        let mut path = env::temp_dir();
        path.push(format!(
            "og-launcher-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock")
                .as_nanos()
        ));
        path
    }
}
