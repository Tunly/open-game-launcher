use std::{
    fs,
    path::{Path, PathBuf},
};

use super::core::{
    current_unix_timestamp, get_dir_last_modified, normalize_game_id, path_size_bytes,
    path_to_string, read_installed_games_cache, save_sync_root_for_game, sync_destination_for_save,
    unix_timestamp_to_iso, update_installed_game_cache,
};
use super::og_manifest::sha256_file_hex;
use super::types::*;
use crate::commands::save_mirror;

#[tauri::command]
pub fn sync_game_saves(game_id: String) -> Result<SyncGameSavesResponse, String> {
    let game_id = normalize_game_id(game_id)?;
    println!("[open-game-launcher] sync_game_saves requested for {game_id}");

    let games = read_installed_games_cache().unwrap_or_default();
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
        if source.is_dir() {
            if destination.exists() {
                save_mirror::clear_path(&destination, &sync_root)?;
            }
            save_mirror::mirror_dir_recursive(&source, &destination, &sync_root)?;
        } else {
            let source_sha256 = sha256_file_hex(&source)?;
            save_mirror::mirror_file(
                &source,
                &destination,
                &sync_root,
                Some(&source_sha256),
                None,
            )?;
        }
        save_file.synced_at = Some(synced_at.clone());
        save_file.modified_at = get_dir_last_modified(&source).map(unix_timestamp_to_iso);
        save_file.size_bytes = path_size_bytes(&source);
        synced_files.push(path_to_string(destination));
    }

    let synced_save_files = game.save_files.clone();
    game = update_installed_game_cache(&game_id, move |latest| {
        for synced in synced_save_files {
            if let Some(save_file) = latest
                .save_files
                .iter_mut()
                .find(|save_file| save_file.path == synced.path)
            {
                save_file.synced_at = synced.synced_at;
                save_file.modified_at = synced.modified_at;
                save_file.size_bytes = synced.size_bytes;
            }
        }
        Ok(())
    })?;

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
