use std::collections::HashSet;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::commands::system::OwnedGame;

#[derive(Debug, Serialize, Deserialize)]
pub struct UbisoftGame {
    pub id: u64,
    pub name: String,
    pub background_image: Option<String>,
    pub dialog_image: Option<String>,
    pub icon_image: Option<String>,
    pub logo_image: Option<String>,
    pub splash_image: Option<String>,
    pub thumb_image: Option<String>,
}

pub fn ubisoft_configuration_cache_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
        paths.push(
            PathBuf::from(local_app_data)
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

pub fn get_ubisoft_cache_path() -> Option<PathBuf> {
    ubisoft_configuration_cache_paths()
        .into_iter()
        .find(|path| path.is_file())
}

/// Returns the well-known Ubisoft Connect cache "assets" directories where the
/// launcher stores locally cached game cover art, logos and icons.
///
/// The order matters: the first root that contains a matching file wins.
pub fn ubisoft_cached_asset_roots() -> Vec<PathBuf> {
    let mut roots = vec![PathBuf::from(r"C:\ProgramData")
        .join("Ubisoft")
        .join("Ubisoft Game Launcher")
        .join("cache")
        .join("assets")];

    if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
        roots.push(
            PathBuf::from(local_app_data)
                .join("Ubisoft Game Launcher")
                .join("cache")
                .join("assets"),
        );
    }

    roots
}

fn is_supported_image_extension(extension: Option<&str>) -> bool {
    matches!(
        extension.map(|value| value.to_ascii_lowercase()).as_deref(),
        Some("ico" | "jpg" | "jpeg" | "png" | "webp" | "bmp" | "tga" | "dds")
    )
}

/// Resolves a bare Ubisoft asset filename (as recorded in the
/// `configurations` cache) to a real on-disk path under one of the Ubisoft
/// Connect cache asset roots.
///
/// Ubisoft's `background_image` / `splash_image` / `thumb_image` values are
/// just filenames like `anvil_division_3_0001.jpg` – the launcher is expected
/// to look them up in the local cache. We do the same here.
pub fn resolve_ubisoft_cached_asset(file_name: &str) -> Option<String> {
    let normalized = file_name.trim().replace('/', "\\");
    if normalized.is_empty() {
        return None;
    }

    for root in ubisoft_cached_asset_roots() {
        // 1. Exact match in the root (case-insensitive on Windows is handled
        //    by the filesystem itself).
        let direct_path = root.join(&normalized);
        if direct_path.is_file() {
            return Some(direct_path.to_string_lossy().into_owned());
        }

        // 2. Same filename stem, possibly a different image extension,
        //    somewhere in the root (e.g. file says ".png" but cache has
        //    ".jpg", or vice-versa).
        let requested_path = Path::new(&normalized);
        let file_stem = requested_path.file_stem().and_then(|stem| stem.to_str())?;
        let Ok(entries) = fs::read_dir(&root) else {
            continue;
        };

        if let Some(found) = entries.flatten().map(|entry| entry.path()).find(|path| {
            path.is_file()
                && is_supported_image_extension(
                    path.extension().and_then(|extension| extension.to_str()),
                )
                && path
                    .file_stem()
                    .and_then(|stem| stem.to_str())
                    .is_some_and(|stem| stem.eq_ignore_ascii_case(file_stem))
        }) {
            return Some(found.to_string_lossy().into_owned());
        }
    }

    None
}

pub fn resolve_ubisoft_cached_asset_for_game(file_name: &str, game_id: u64) -> Option<String> {
    if let Some(found) = resolve_ubisoft_cached_asset(file_name) {
        return Some(found);
    }

    let normalized = file_name.trim().replace('/', "\\");
    if normalized.is_empty() {
        return None;
    }

    let requested_path = Path::new(&normalized);
    let file_stem = requested_path.file_stem().and_then(|stem| stem.to_str())?;
    let game_id = game_id.to_string();

    for root in ubisoft_cached_asset_roots() {
        let per_game_root = root.join(&game_id);
        let direct_path = per_game_root.join(&normalized);
        if direct_path.is_file() {
            return Some(direct_path.to_string_lossy().into_owned());
        }

        let Ok(entries) = fs::read_dir(&per_game_root) else {
            continue;
        };
        if let Some(found) = entries.flatten().map(|entry| entry.path()).find(|path| {
            path.is_file()
                && is_supported_image_extension(
                    path.extension().and_then(|extension| extension.to_str()),
                )
                && path
                    .file_stem()
                    .and_then(|stem| stem.to_str())
                    .is_some_and(|stem| stem.eq_ignore_ascii_case(file_stem))
        }) {
            return Some(found.to_string_lossy().into_owned());
        }
    }

    None
}

fn extract_yaml_value(buffer: &[u8], key: &[u8]) -> Option<String> {
    let pos = buffer.windows(key.len()).position(|window| window == key)?;
    let start = pos + key.len();
    let end = buffer[start..]
        .iter()
        .position(|byte| *byte == b'\n' || *byte == b'\r')
        .map(|offset| start + offset)
        .unwrap_or(buffer.len());
    let value = String::from_utf8_lossy(&buffer[start..end])
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .to_string();

    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn read_varint_u32(buffer: &[u8], offset: &mut usize) -> Option<u32> {
    let mut value = 0u32;
    let mut shift = 0;

    while *offset < buffer.len() {
        let byte = buffer[*offset];
        *offset += 1;
        value |= ((byte & 0x7f) as u32) << shift;
        if byte & 0x80 == 0 {
            return Some(value);
        }
        shift += 7;
        if shift > 28 {
            return None;
        }
    }

    None
}

fn read_varint_usize(buffer: &[u8], offset: &mut usize) -> Option<usize> {
    read_varint_u32(buffer, offset).map(|value| value as usize)
}

fn read_uplay_id(sub_buffer: &[u8]) -> Option<u64> {
    let mut offset = 0;
    while offset < sub_buffer.len() {
        let tag = sub_buffer[offset];
        offset += 1;
        let wire_type = tag & 7;
        let field = tag >> 3;

        match wire_type {
            0 if field == 1 => {
                return read_varint_u32(sub_buffer, &mut offset).map(u64::from);
            }
            0 => {
                read_varint_u32(sub_buffer, &mut offset)?;
            }
            2 => {
                let length = read_varint_usize(sub_buffer, &mut offset)?;
                offset = offset.saturating_add(length);
            }
            1 => offset = offset.saturating_add(8),
            5 => offset = offset.saturating_add(4),
            _ => break,
        }
    }

    None
}

fn yaml_like_line_value<'a>(line: &'a str, key: &str) -> Option<&'a str> {
    let trimmed = line.trim();
    let rest = trimmed.strip_prefix(key)?.trim_start();
    let value = rest.strip_prefix(':')?.trim();
    Some(value.trim_matches('"').trim_matches('\'').trim())
}

fn is_yaml_like_null(value: &str) -> bool {
    let normalized = value.trim().trim_matches('"').trim_matches('\'');
    normalized.is_empty()
        || normalized.eq_ignore_ascii_case("null")
        || normalized == "~"
        || normalized == "[]"
        || normalized == "{}"
}

fn yaml_like_bool_is_true(buffer: &[u8], key: &str) -> bool {
    let contents = String::from_utf8_lossy(buffer);
    contents.lines().any(|line| {
        yaml_like_line_value(line, key).is_some_and(|value| {
            value.eq_ignore_ascii_case("true")
                || value.eq_ignore_ascii_case("yes")
                || value.eq_ignore_ascii_case("on")
                || value == "1"
        })
    })
}

fn yaml_like_key_has_value_or_block(buffer: &[u8], key: &str) -> bool {
    let contents = String::from_utf8_lossy(buffer);
    contents.lines().any(|line| {
        yaml_like_line_value(line, key)
            .is_some_and(|value| value.is_empty() || !is_yaml_like_null(value))
    })
}

fn line_indent(line: &str) -> usize {
    line.chars().take_while(|char| *char == ' ').count()
}

fn extract_ubisoft_addon_ids(buffer: &[u8]) -> Vec<u64> {
    let contents = String::from_utf8_lossy(buffer);
    let mut ids = Vec::new();
    let mut in_addons_block = false;
    let mut addons_indent = 0;

    for line in contents.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let indent = line_indent(line);

        if in_addons_block {
            if indent <= addons_indent && !trimmed.starts_with('-') {
                in_addons_block = false;
            } else {
                let item = trimmed.trim_start_matches('-').trim_start();
                if let Some(id) =
                    yaml_like_line_value(item, "id").and_then(|value| value.parse::<u64>().ok())
                {
                    ids.push(id);
                }
                continue;
            }
        }

        if yaml_like_line_value(line, "addons").is_some() {
            in_addons_block = true;
            addons_indent = indent;
        }
    }

    ids
}

fn should_skip_ubisoft_library_entry(buffer: &[u8], name: &str) -> bool {
    should_skip_ubisoft_library_name(name)
        || yaml_like_bool_is_true(buffer, "is_ulc")
        || yaml_like_key_has_value_or_block(buffer, "third_party_platform")
        || !yaml_like_key_has_value_or_block(buffer, "start_game")
}

fn should_skip_ubisoft_library_name(name: &str) -> bool {
    let normalized = name.to_lowercase();

    // ── Always skip: internal, test, meta entries ──
    if normalized.contains("test")
        || normalized.contains("server")
        || normalized.contains("beta")
        || normalized.contains("benchmark")
        || normalized.starts_with("l1")
        || normalized.starts_with("l2")
        || normalized.starts_with("l3")
        || (normalized.len() <= 3 && normalized.starts_with('l'))
        || normalized.contains("pts")
        || normalized.contains("language pack")
        || normalized.contains("texture pack")
        || normalized.contains("high-rez")
        || normalized.contains("ultra hd")
        || normalized.contains("hd texture")
        || normalized.starts_with("description:")
        || normalized.starts_with("is_visible")
        || normalized.starts_with("localizations")
        || normalized.starts_with("path:")
        || normalized.ends_with(".ini")
        || normalized.contains("animus control panel")
    {
        return true;
    }

    // ── DLC marker keywords anywhere in the name ──
    let dlc_keyword = normalized.contains("dlc")
        || normalized.contains("add-on")
        || normalized.contains("addon")
        || normalized.contains("season")
        || normalized.contains("battle pass")
        || normalized.contains("expansion")
        || normalized.contains("pack")
        || normalized.contains("paket")
        || normalized.contains("pass")
        || normalized.contains("bonus")
        || normalized.contains("upgrade")
        || normalized.contains("credit")
        || normalized.contains("coin")
        || normalized.contains("currency")
        || normalized.contains("helix")
        || normalized.contains("year")
        || normalized.contains("episode ")
        || normalized.contains("bundle")
        || normalized.contains("unlock")
        || normalized.contains("skin")
        || normalized.contains("outfit")
        || normalized.contains("costume")
        || normalized.contains("weapon")
        || normalized.contains("cosmetic")
        || normalized.contains("gear set")
        || normalized.contains("knuckles")
        || normalized.contains("gauntlet")
        || normalized.contains("belt")
        || normalized.contains("breeches")
        || normalized.contains("cloak")
        || normalized.contains("revolver")
        || normalized.contains("pistol")
        || normalized.contains("rifle")
        || normalized.contains("kukri")
        || normalized.contains("rapier")
        || normalized.contains("sword")
        || normalized.contains("cane-sword")
        || normalized.contains("spear")
        || normalized.contains("axe")
        || normalized.contains("blade")
        || normalized.contains("sails")
        || normalized.contains("hood")
        || normalized.contains("trousers")
        || normalized.contains("waistcoat")
        || normalized.contains("bracers")
        || normalized.contains("bushido")
        || normalized.contains("artbook")
        || normalized.contains("art book")
        || normalized.contains("soundtrack")
        || normalized.contains("digital art")
        || normalized.contains("ornament")
        || normalized.contains("figurehead")
        || normalized.contains("pre-order")
        || normalized.contains("preorder")
        || normalized.contains("promo")
        || normalized.contains("giveaway")
        || normalized.contains("xp boost")
        || normalized.contains("loot")
        || normalized.contains("ubicollectibles")
        || normalized.contains("hero skin")
        || normalized.contains("premier")
        || normalized.contains("welcome")
        || normalized.contains("signature")
        || normalized.contains("initiates")
        || normalized.contains("impaler")
        || normalized.contains("sabre")
        || normalized.contains("honour");

    if dlc_keyword {
        return true;
    }

    // ── Pattern: "Base Game - DLC Subtitle" ──
    if let Some(dash_pos) = normalized.find(" - ") {
        let suffix = &normalized[dash_pos + 3..];

        let suffix_is_dlc = suffix.contains("hero")
            || suffix.contains("operator")
            || suffix.contains("character")
            || suffix.contains("quest")
            || suffix.contains("mission")
            || suffix.contains("dead kings")
            || suffix.contains("secrets of")
            || suffix.contains("legacy of")
            || suffix.contains("warlords of")
            || suffix.contains("wrath of")
            || suffix.contains("fate of")
            || suffix.contains("tyranny of")
            || suffix.contains("siege of")
            || suffix.contains("underground")
            || suffix.contains("freedom cry")
            || suffix.contains("last stand")
            || suffix.contains("human conditions")
            || suffix.contains("no compromise")
            || suffix.contains("bad blood")
            || suffix.contains("road to")
            || suffix.contains("conspiracy")
            || suffix.contains("jack the ripper")
            || suffix.contains("lost archive")
            || suffix.contains("calling all units")
            || suffix.contains("wild run")
            || suffix.contains("narco road")
            || suffix.contains("fallen ghosts")
            || suffix.contains("rocket wings")
            || suffix.contains("winter fest")
            || suffix.contains("x games")
            || suffix.contains("crash &")
            || suffix.contains("void dasher")
            || suffix.contains("dedsec")
            || suffix.contains("curse of")
            || suffix.contains("guild of")
            || suffix.contains("pride of")
            || suffix.contains("trove of")
            || suffix.contains("streets of")
            || suffix.contains("runaway")
            || suffix.contains("naval")
            || suffix.contains("calamity")
            || suffix.contains("hidden ones")
            || suffix.contains("killed by")
            || suffix.contains("chemical")
            || suffix.contains("nighthawk")
            || suffix.contains("suave")
            || suffix.starts_with("the ")
            || suffix.contains("animus")
            || suffix.contains("company logos")
            || suffix.contains("road 66");

        if suffix_is_dlc {
            return true;
        }
    }

    false
}

pub fn parse_ubisoft_configurations(path: &Path) -> Vec<UbisoftGame> {
    let Ok(file_content) = fs::read(path) else {
        return Vec::new();
    };

    let mut games = Vec::new();
    let mut addon_ids = HashSet::new();
    let mut offset = 0;

    while offset < file_content.len() {
        if file_content[offset] != 0x0A {
            offset += 1;
            continue;
        }

        offset += 1;
        let Some(length) = read_varint_usize(&file_content, &mut offset) else {
            break;
        };

        if offset + length > file_content.len() {
            break;
        }

        let sub_buffer = &file_content[offset..offset + length];
        offset += length;

        addon_ids.extend(extract_ubisoft_addon_ids(sub_buffer));

        let Some(uplay_id) = read_uplay_id(sub_buffer) else {
            continue;
        };

        if uplay_id == 0 {
            continue;
        }

        let name = extract_yaml_value(sub_buffer, b"name: ")
            .or_else(|| extract_yaml_value(sub_buffer, b"root:\n  name: "))
            .unwrap_or_default();

        if name.is_empty() || should_skip_ubisoft_library_entry(sub_buffer, &name) {
            continue;
        }

        let background_image = extract_yaml_value(sub_buffer, b"background_image: ");
        let dialog_image = extract_yaml_value(sub_buffer, b"dialog_image: ");
        let icon_image = extract_yaml_value(sub_buffer, b"icon_image: ");
        let logo_image = extract_yaml_value(sub_buffer, b"logo_image: ");
        let splash_image = extract_yaml_value(sub_buffer, b"splash_image: ");
        let thumb_image = extract_yaml_value(sub_buffer, b"thumb_image: ");

        games.push(UbisoftGame {
            id: uplay_id,
            name,
            background_image,
            dialog_image,
            icon_image,
            logo_image,
            splash_image,
            thumb_image,
        });
    }

    games.retain(|game| !addon_ids.contains(&game.id));
    games.sort_by_key(|game| game.id);
    games.dedup_by_key(|game| game.id);
    games
}

#[tauri::command]
pub async fn fetch_ubisoft_owned_games() -> Result<Vec<OwnedGame>, String> {
    let Some(cache_path) = get_ubisoft_cache_path() else {
        println!("[Ubisoft] configurations cache not found. Launch Ubisoft Connect once.");
        return Ok(Vec::new());
    };

    let ubisoft_games =
        tokio::task::spawn_blocking(move || parse_ubisoft_configurations(&cache_path))
            .await
            .map_err(|error| error.to_string())?;

    println!(
        "[Ubisoft] Parsed {} owned games from cache.",
        ubisoft_games.len()
    );

    let owned_games = ubisoft_games
        .into_iter()
        .map(|game| {
            // The `background_image` field in the Ubisoft `configurations`
            // cache is a bare filename (e.g. `anvil_division_3_0001.jpg`).
            // Resolve it to an absolute path under one of the Ubisoft
            // Connect asset cache roots so the frontend can actually load
            // it via Tauri's asset protocol. Falls back to `None` if the
            // asset isn't in the local cache yet – in that case the
            // library will use the existing CSS art placeholder.
            let resolved_cover = [
                game.splash_image.as_deref(),
                game.background_image.as_deref(),
                game.thumb_image.as_deref(),
                game.dialog_image.as_deref(),
            ]
            .into_iter()
            .flatten()
            .find_map(|file_name| resolve_ubisoft_cached_asset_for_game(file_name, game.id));
            let resolved_logo = game
                .logo_image
                .as_deref()
                .and_then(|file_name| resolve_ubisoft_cached_asset_for_game(file_name, game.id));
            let resolved_icon = game
                .icon_image
                .as_deref()
                .and_then(|file_name| resolve_ubisoft_cached_asset_for_game(file_name, game.id))
                .or_else(|| resolved_logo.clone())
                .or_else(|| resolved_cover.clone());
            let rawg_assets = crate::commands::games::detect::get_rawg_ubisoft_assets(
                &game.id.to_string(),
                &game.name,
            );
            let (fallback_cover, fallback_logo, fallback_icon) =
                crate::commands::games::detect::get_ubisoft_fallback_assets(&game.name);
            let cover_url = resolved_cover
                .clone()
                .or_else(|| {
                    rawg_assets
                        .as_ref()
                        .and_then(|assets| assets.cover_url.clone())
                })
                .or(fallback_cover);
            let logo_url = resolved_logo
                .clone()
                .or_else(|| {
                    rawg_assets
                        .as_ref()
                        .and_then(|assets| assets.logo_url.clone())
                })
                .or(fallback_logo);
            let icon_url = resolved_icon
                .or_else(|| {
                    rawg_assets
                        .as_ref()
                        .and_then(|assets| assets.icon_url.clone())
                })
                .or_else(|| logo_url.clone())
                .or_else(|| cover_url.clone())
                .or(fallback_icon);

            OwnedGame {
                id: format!("ubisoft-owned-{}", game.id),
                external_id: Some(game.id.to_string()),
                title: game.name.clone(),
                description: String::new(),
                cover_url,
                logo_url,
                // Reuse the cover image for the list icon – it's the only
                // artwork we have a guaranteed path to. The icon
                // resolution will fall through to the same file.
                icon_url,
                playtime_minutes: None,
                last_played_at: None,
                cloud_gaming_url: None,
                achievement_summary: None,
            }
        })
        .collect();

    Ok(owned_games)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_varint_u32(mut value: u32, out: &mut Vec<u8>) {
        while value >= 0x80 {
            out.push((value as u8 & 0x7f) | 0x80);
            value >>= 7;
        }
        out.push(value as u8);
    }

    fn configuration_record(id: u32, yaml: &str) -> Vec<u8> {
        let mut sub_buffer = vec![0x08];
        write_varint_u32(id, &mut sub_buffer);
        sub_buffer.extend_from_slice(yaml.as_bytes());

        let mut record = vec![0x0a];
        write_varint_u32(sub_buffer.len() as u32, &mut record);
        record.extend(sub_buffer);
        record
    }

    #[test]
    fn ubisoft_owned_parser_keeps_base_game_editions() {
        for title in [
            "Assassins Creed Valhalla Gold Edition",
            "Far Cry 6 - Base Game",
            "Tom Clancys Rainbow Six Siege - Deluxe Edition",
            "Watch Dogs Legion Ultimate Edition",
        ] {
            assert!(
                !should_skip_ubisoft_library_name(title),
                "base game edition should stay visible: {title}"
            );
        }
    }

    #[test]
    fn ubisoft_owned_parser_still_skips_dlc_and_assets() {
        for title in [
            "Assassins Creed Valhalla - Season Pass",
            "Far Cry 6 HD Texture Pack",
            "Rainbow Six Siege 1200 Credits Pack",
            "Watch Dogs Legion - Bloodline Expansion",
        ] {
            assert!(
                should_skip_ubisoft_library_name(title),
                "DLC or asset entry should stay hidden: {title}"
            );
        }
    }

    #[test]
    fn ubisoft_owned_parser_skips_structural_dlc_entries() {
        let mut contents = Vec::new();
        contents.extend(configuration_record(
            100,
            r#"
root:
  name: "Assassins Creed Odyssey"
  start_game:
    executable: "ACOdyssey.exe"
  addons:
    - id: 200
"#,
        ));
        contents.extend(configuration_record(
            200,
            r#"
root:
  name: "Atlantis Chapter"
  start_game:
    executable: "ACOdyssey.exe"
"#,
        ));
        contents.extend(configuration_record(
            300,
            r#"
root:
  name: "Gallery Viewer"
"#,
        ));
        contents.extend(configuration_record(
            400,
            r#"
root:
  name: "Linked Platform Entry"
  start_game:
    executable: "Linked.exe"
  third_party_platform:
    name: "Steam"
"#,
        ));

        let path = std::env::temp_dir().join(format!(
            "ogl-ubisoft-configurations-{}-structural-dlc",
            std::process::id()
        ));
        std::fs::write(&path, contents).expect("write test Ubisoft cache");

        let games = parse_ubisoft_configurations(&path);
        let _ = std::fs::remove_file(&path);

        assert_eq!(games.len(), 1);
        assert_eq!(games[0].id, 100);
        assert_eq!(games[0].name, "Assassins Creed Odyssey");
    }
}
