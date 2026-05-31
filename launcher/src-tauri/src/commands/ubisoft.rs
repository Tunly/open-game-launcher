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

fn should_skip_ubisoft_library_name(name: &str) -> bool {
    let normalized = name.to_lowercase();
    normalized.contains("test")
        || normalized.contains("server")
        || normalized.contains("beta server")
}

pub fn parse_ubisoft_configurations(path: &Path) -> Vec<UbisoftGame> {
    let Ok(file_content) = fs::read(path) else {
        return Vec::new();
    };

    let mut games = Vec::new();
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

        let Some(uplay_id) = read_uplay_id(sub_buffer) else {
            continue;
        };

        if uplay_id == 0 {
            continue;
        }

        let name = extract_yaml_value(sub_buffer, b"name: ")
            .or_else(|| extract_yaml_value(sub_buffer, b"root:\n  name: "))
            .unwrap_or_default();

        if name.is_empty() || should_skip_ubisoft_library_name(&name) {
            continue;
        }

        let background_image = extract_yaml_value(sub_buffer, b"background_image: ");

        games.push(UbisoftGame {
            id: uplay_id,
            name,
            background_image,
        });
    }

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
        .map(|game| OwnedGame {
            id: format!("ubisoft-owned-{}", game.id),
            external_id: Some(game.id.to_string()),
            title: game.name.clone(),
            description: format!("Ubisoft Connect game (Owned). ID: {}", game.id),
            cover_url: game.background_image.clone(),
            logo_url: None,
            icon_url: game.background_image,
            playtime_minutes: 0,
            last_played_at: None,
            cloud_gaming_url: None,
        })
        .collect();

    Ok(owned_games)
}
