use std::{
    fs,
    path::{Path, PathBuf},
};

use super::core::{
    current_unix_timestamp, ensure_path_inside_root, get_dir_last_modified, normalize_game_id,
    path_size_bytes, path_to_string, read_installed_games_cache, save_sync_root_for_game,
    sync_destination_for_save, unix_timestamp_to_iso, write_installed_games_cache,
};
use super::types::*;

#[tauri::command]
pub fn sync_game_saves(game_id: String) -> Result<SyncGameSavesResponse, String> {
    let game_id = normalize_game_id(game_id)?;
    println!("[open-game-launcher] sync_game_saves requested for {game_id}");

    let mut games = read_installed_games_cache().unwrap_or_default();
    let game_index = games
        .iter()
        .position(|game| game.id == game_id)
        .ok_or_else(|| format!("Game '{game_id}' was not found in the local library cache."))?;

    let mut game = games[game_index].clone();
    let sync_root = save_sync_root_for_game(&game.id)
        .ok_or_else(|| "Could not resolve the local save-sync folder.".to_string())?;
    fs::create_dir_all(&sync_root)
        .map_err(|error| format!("Could not create save-sync folder: {error}"))?;

    let synced_at = unix_timestamp_to_iso(current_unix_timestamp());
    let mut synced_files = Vec::new();
    let mut missing_files = Vec::new();

    for save_file in game.save_files.iter_mut() {
        let source = PathBuf::from(&save_file.path);
        if !source.exists() {
            missing_files.push(save_file.path.clone());
            continue;
        }

        let destination = sync_destination_for_save(&sync_root, save_file, &source);
        copy_path_to_sync_cache(&source, &destination, &sync_root)?;
        save_file.synced_at = Some(synced_at.clone());
        save_file.modified_at = get_dir_last_modified(&source).map(unix_timestamp_to_iso);
        save_file.size_bytes = path_size_bytes(&source);
        synced_files.push(path_to_string(destination));
    }

    games[game_index] = game.clone();
    write_installed_games_cache(&games)?;

    let message = if missing_files.is_empty() {
        format!("{} save sync completed.", game.title)
    } else {
        format!(
            "{} save sync completed with {} missing path(s).",
            game.title,
            missing_files.len()
        )
    };

    Ok(SyncGameSavesResponse {
        game_id: game_id.clone(),
        success: missing_files.is_empty(),
        game: game.clone(),
        synced_files,
        missing_files,
        sync_root: path_to_string(sync_root),
        message,
    })
}

// Helper functions for local save cache sync.

fn copy_path_to_sync_cache(
    source: &Path,
    destination: &Path,
    sync_root: &Path,
) -> Result<(), String> {
    ensure_path_inside_root(destination, sync_root)?;

    if source.is_dir() {
        if destination.exists() {
            remove_sync_cache_path(destination, sync_root)?;
        }
        copy_dir_recursive(source, destination, sync_root)
    } else {
        if let Some(parent) = destination.parent() {
            ensure_path_inside_root(parent, sync_root)?;
            fs::create_dir_all(parent)
                .map_err(|error| format!("Could not create sync destination: {error}"))?;
        }
        fs::copy(source, destination)
            .map(|_| ())
            .map_err(|error| format!("Could not copy save file: {error}"))
    }
}

fn copy_dir_recursive(source: &Path, destination: &Path, sync_root: &Path) -> Result<(), String> {
    ensure_path_inside_root(destination, sync_root)?;
    fs::create_dir_all(destination)
        .map_err(|error| format!("Could not create sync folder: {error}"))?;

    let entries =
        fs::read_dir(source).map_err(|error| format!("Could not read save folder: {error}"))?;
    for entry in entries.flatten() {
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        ensure_path_inside_root(&destination_path, sync_root)?;
        if source_path.is_dir() {
            copy_dir_recursive(&source_path, &destination_path, sync_root)?;
        } else {
            fs::copy(&source_path, &destination_path)
                .map_err(|error| format!("Could not copy save file: {error}"))?;
        }
    }

    Ok(())
}

fn remove_sync_cache_path(path: &Path, sync_root: &Path) -> Result<(), String> {
    ensure_path_inside_root(path, sync_root)?;
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|error| format!("Could not clear sync folder: {error}"))
    } else if path.exists() {
        fs::remove_file(path).map_err(|error| format!("Could not clear sync file: {error}"))
    } else {
        Ok(())
    }
}
