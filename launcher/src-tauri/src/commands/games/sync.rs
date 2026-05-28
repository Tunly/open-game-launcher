use std::{
    fs,
    path::{Path, PathBuf},
};

use super::types::*;
use super::core::{
    normalize_game_id, read_installed_games_cache, write_installed_games_cache,
    unix_timestamp_to_iso, current_unix_timestamp, get_dir_last_modified,
    slugify, path_to_string, ensure_path_inside_root, path_size_bytes,
    save_sync_root_for_game, sync_destination_for_save, backup_root_for_game,
};

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
    write_installed_games_cache(&games);

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

#[tauri::command]
pub async fn upload_game_saves_to_cloud(
    input: UploadGameSavesToCloudRequest,
) -> Result<UploadGameSavesToCloudResponse, String> {
    let game_id = normalize_game_id(input.game_id)?;
    println!("[open-game-launcher] upload_game_saves_to_cloud requested for {game_id}");

    if input.supabase_url.trim().is_empty()
        || input.api_key.trim().is_empty()
        || input.access_token.trim().is_empty()
        || input.user_id.trim().is_empty()
    {
        return Err("Supabase URL, public key, user token, and user ID are required.".to_string());
    }

    let mut games = read_installed_games_cache().unwrap_or_default();
    let game_index = games
        .iter()
        .position(|game| game.id == game_id)
        .ok_or_else(|| format!("Game '{game_id}' was not found in the local library cache."))?;
    let mut game = games[game_index].clone();

    if game.save_files.is_empty() {
        return Err("Add at least one save path before uploading saves to cloud.".to_string());
    }

    let mut uploads = Vec::new();
    let mut missing_files = Vec::new();
    for save_file in &game.save_files {
        let source = PathBuf::from(&save_file.path);
        if !source.exists() {
            missing_files.push(save_file.path.clone());
            continue;
        }
        collect_save_upload_sources(
            &input.user_id,
            &game.id,
            save_file,
            &source,
            &source,
            &mut uploads,
        )?;
    }

    let client = reqwest::Client::new();
    let mut uploaded_files = Vec::new();
    let mut failed_files = Vec::new();
    for upload in &uploads {
        match upload_file_to_supabase_storage(
            &client,
            &input.supabase_url,
            &input.api_key,
            &input.access_token,
            upload,
        )
        .await
        {
            Ok(()) => uploaded_files.push(upload.object_path.clone()),
            Err(error) => failed_files.push(format!(
                "{} // {error}",
                path_to_string(upload.source_path.clone())
            )),
        }
    }

    if !uploaded_files.is_empty() {
        let synced_at = unix_timestamp_to_iso(current_unix_timestamp());
        for save_file in game.save_files.iter_mut() {
            let source = PathBuf::from(&save_file.path);
            if source.exists() {
                save_file.synced_at = Some(synced_at.clone());
                save_file.modified_at = get_dir_last_modified(&source).map(unix_timestamp_to_iso);
                save_file.size_bytes = path_size_bytes(&source);
            }
        }
        games[game_index] = game.clone();
        write_installed_games_cache(&games);
    }

    let message = if failed_files.is_empty() && missing_files.is_empty() {
        format!("{} cloud save upload completed.", game.title)
    } else {
        format!(
            "{} cloud save upload completed with {} failed and {} missing file(s).",
            game.title,
            failed_files.len(),
            missing_files.len()
        )
    };

    Ok(UploadGameSavesToCloudResponse {
        game_id: game_id.clone(),
        success: failed_files.is_empty() && missing_files.is_empty(),
        game: game.clone(),
        uploaded_files,
        missing_files,
        failed_files,
        message,
    })
}

#[tauri::command]
pub async fn download_game_saves_from_cloud(
    input: DownloadGameSavesFromCloudRequest,
) -> Result<DownloadGameSavesFromCloudResponse, String> {
    let game_id = normalize_game_id(input.game_id)?;
    println!("[open-game-launcher] download_game_saves_from_cloud requested for {game_id}");

    if input.supabase_url.trim().is_empty()
        || input.api_key.trim().is_empty()
        || input.access_token.trim().is_empty()
        || input.user_id.trim().is_empty()
    {
        return Err("Supabase URL, public key, user token, and user ID are required.".to_string());
    }

    let games = read_installed_games_cache().unwrap_or_default();
    let game = games
        .iter()
        .find(|game| game.id == game_id)
        .ok_or_else(|| format!("Game '{game_id}' was not found in the local library cache."))?;

    let restore_root = save_sync_root_for_game(&game.id)
        .ok_or_else(|| "Could not resolve the local save-sync folder.".to_string())?
        .join("cloud-restore");
    fs::create_dir_all(&restore_root)
        .map_err(|error| format!("Could not create cloud restore folder: {error}"))?;

    let object_prefix = format!(
        "{}/{}",
        sanitize_storage_segment(&input.user_id),
        sanitize_storage_segment(&game.id)
    );
    let client = reqwest::Client::new();
    let mut object_paths = Vec::new();
    list_supabase_storage_objects_recursive(
        &client,
        &input.supabase_url,
        &input.api_key,
        &input.access_token,
        &object_prefix,
        0,
        &mut object_paths,
    )
    .await?;

    if object_paths.is_empty() {
        return Ok(DownloadGameSavesFromCloudResponse {
            game_id: game_id.clone(),
            success: false,
            restore_root: path_to_string(restore_root),
            downloaded_files: Vec::new(),
            failed_files: Vec::new(),
            message: format!("No cloud saves were found for {}.", game.title),
        });
    }

    let mut downloaded_files = Vec::new();
    let mut failed_files = Vec::new();
    for object_path in object_paths {
        let destination =
            restore_destination_for_object(&restore_root, &object_path, &object_prefix);
        match download_file_from_supabase_storage(
            &client,
            &input.supabase_url,
            &input.api_key,
            &input.access_token,
            &object_path,
            &destination,
            &restore_root,
        )
        .await
        {
            Ok(()) => downloaded_files.push(path_to_string(destination)),
            Err(error) => failed_files.push(format!("{object_path} // {error}")),
        }
    }

    let message = if failed_files.is_empty() {
        format!(
            "{} cloud save restore downloaded {} file(s).",
            game.title,
            downloaded_files.len()
        )
    } else {
        format!(
            "{} cloud save restore downloaded {} file(s) with {} failure(s).",
            game.title,
            downloaded_files.len(),
            failed_files.len()
        )
    };

    Ok(DownloadGameSavesFromCloudResponse {
        game_id: game_id.clone(),
        success: failed_files.is_empty(),
        restore_root: path_to_string(restore_root),
        downloaded_files,
        failed_files,
        message,
    })
}

#[tauri::command]
pub async fn restore_game_saves_from_cloud(
    input: RestoreGameSavesFromCloudRequest,
) -> Result<RestoreGameSavesFromCloudResponse, String> {
    let game_id = normalize_game_id(input.game_id)?;
    println!("[open-game-launcher] restore_game_saves_from_cloud requested for {game_id}");

    if input.supabase_url.trim().is_empty()
        || input.api_key.trim().is_empty()
        || input.access_token.trim().is_empty()
        || input.user_id.trim().is_empty()
    {
        return Err("Supabase URL, public key, user token, and user ID are required.".to_string());
    }

    let games = read_installed_games_cache().unwrap_or_default();
    let game = games
        .iter()
        .find(|game| game.id == game_id)
        .ok_or_else(|| format!("Game '{game_id}' was not found in the local library cache."))?;

    if game.save_files.is_empty() {
        return Err("Add at least one save path before restoring cloud saves.".to_string());
    }

    let object_prefix = format!(
        "{}/{}",
        sanitize_storage_segment(&input.user_id),
        sanitize_storage_segment(&game.id)
    );
    let client = reqwest::Client::new();
    let mut object_paths = Vec::new();
    list_supabase_storage_objects_recursive(
        &client,
        &input.supabase_url,
        &input.api_key,
        &input.access_token,
        &object_prefix,
        0,
        &mut object_paths,
    )
    .await?;

    if object_paths.is_empty() {
        return Ok(RestoreGameSavesFromCloudResponse {
            game_id: game_id.clone(),
            success: false,
            restored_files: Vec::new(),
            backed_up_files: Vec::new(),
            skipped_files: Vec::new(),
            failed_files: Vec::new(),
            message: format!("No cloud saves were found for {}.", game.title),
        });
    }

    let backup_root = backup_root_for_game(&game.id)
        .ok_or_else(|| "Could not resolve the local save-backup folder.".to_string())?;
    let mut restored_files = Vec::new();
    let mut backed_up_files = Vec::new();
    let mut skipped_files = Vec::new();
    let mut failed_files = Vec::new();

    for object_path in object_paths {
        let Some((save_file, destination)) = game.save_files.iter().find_map(|save_file| {
            restore_destination_for_configured_save(save_file, &object_path, &object_prefix)
                .map(|destination| (save_file, destination))
        }) else {
            skipped_files.push(object_path);
            continue;
        };

        if save_file.path.trim().is_empty() {
            skipped_files.push(object_path);
            continue;
        }

        match restore_cloud_object_to_local_path(
            &client,
            &input.supabase_url,
            &input.api_key,
            &input.access_token,
            &object_path,
            &destination,
            &backup_root,
            &mut backed_up_files,
        )
        .await
        {
            Ok(()) => restored_files.push(path_to_string(destination)),
            Err(error) => failed_files.push(format!("{object_path} // {error}")),
        }
    }

    let message = if failed_files.is_empty() {
        format!(
            "{} cloud saves restored to configured paths: {} file(s).",
            game.title,
            restored_files.len()
        )
    } else {
        format!(
            "{} cloud save restore finished with {} restored and {} failed file(s).",
            game.title,
            restored_files.len(),
            failed_files.len()
        )
    };

    Ok(RestoreGameSavesFromCloudResponse {
        game_id: game_id.clone(),
        success: failed_files.is_empty() && !restored_files.is_empty(),
        restored_files,
        backed_up_files,
        skipped_files,
        failed_files,
        message,
    })
}

// Helper functions for cloud save/restore

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

fn sanitize_storage_segment(segment: &str) -> String {
    let mut output = slugify(segment);
    if output.is_empty() {
        output = "file".to_string();
    }
    output
}

fn storage_object_path_for_file(
    user_id: &str,
    game_id: &str,
    save_file: &SaveFile,
    source_root: &Path,
    file_path: &Path,
) -> String {
    let label_segment = save_file
        .label
        .as_deref()
        .filter(|label| !label.trim().is_empty())
        .or_else(|| source_root.file_name().and_then(|name| name.to_str()))
        .map(sanitize_storage_segment)
        .unwrap_or_else(|| "save".to_string());

    let mut segments = vec![
        sanitize_storage_segment(user_id),
        sanitize_storage_segment(game_id),
        label_segment,
    ];

    if let Ok(relative_path) = file_path.strip_prefix(source_root) {
        for component in relative_path.components() {
            let segment = component.as_os_str().to_string_lossy();
            if !segment.trim().is_empty() {
                segments.push(sanitize_storage_segment(&segment));
            }
        }
    } else if let Some(file_name) = file_path.file_name().and_then(|name| name.to_str()) {
        segments.push(sanitize_storage_segment(file_name));
    }

    if file_path.is_file() {
        if let Some(extension) = file_path
            .extension()
            .and_then(|extension| extension.to_str())
        {
            if let Some(last_segment) = segments.last_mut() {
                if !last_segment.ends_with(&format!(".{extension}")) {
                    last_segment.push('.');
                    last_segment.push_str(extension);
                }
            }
        }
    }

    segments.join("/")
}

fn collect_save_upload_sources(
    user_id: &str,
    game_id: &str,
    save_file: &SaveFile,
    source_root: &Path,
    path: &Path,
    uploads: &mut Vec<SaveUploadSource>,
) -> Result<(), String> {
    if path.is_file() {
        uploads.push(SaveUploadSource {
            source_path: path.to_path_buf(),
            object_path: storage_object_path_for_file(
                user_id,
                game_id,
                save_file,
                source_root,
                path,
            ),
        });
        return Ok(());
    }

    if path.is_dir() {
        let entries =
            fs::read_dir(path).map_err(|error| format!("Could not read save folder: {error}"))?;
        for entry in entries.flatten() {
            collect_save_upload_sources(
                user_id,
                game_id,
                save_file,
                source_root,
                &entry.path(),
                uploads,
            )?;
        }
    }

    Ok(())
}

fn url_encode_path(path: &str) -> String {
    path.split('/')
        .map(|segment| {
            let mut encoded = String::new();
            for byte in segment.as_bytes() {
                match *byte {
                    b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                        encoded.push(*byte as char)
                    }
                    _ => encoded.push_str(&format!("%{byte:02X}")),
                }
            }
            encoded
        })
        .collect::<Vec<_>>()
        .join("/")
}

async fn upload_file_to_supabase_storage(
    client: &reqwest::Client,
    supabase_url: &str,
    api_key: &str,
    access_token: &str,
    upload: &SaveUploadSource,
) -> Result<(), String> {
    let bytes = tokio::fs::read(&upload.source_path)
        .await
        .map_err(|error| format!("Could not read save file for upload: {error}"))?;
    let base_url = supabase_url.trim_end_matches('/');
    let object_path = url_encode_path(&upload.object_path);
    let url = format!("{base_url}/storage/v1/object/game-saves/{object_path}");
    let response = client
        .post(url)
        .header("apikey", api_key)
        .bearer_auth(access_token)
        .header("x-upsert", "true")
        .header("cache-control", "3600")
        .header("content-type", "application/octet-stream")
        .body(bytes)
        .send()
        .await
        .map_err(|error| format!("Could not upload save file to Supabase Storage: {error}"))?;

    if response.status().is_success() {
        Ok(())
    } else {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        Err(format!(
            "Supabase Storage upload failed with {status}: {body}"
        ))
    }
}

async fn list_supabase_storage_objects_recursive(
    client: &reqwest::Client,
    supabase_url: &str,
    api_key: &str,
    access_token: &str,
    prefix: &str,
    depth: u8,
    output: &mut Vec<String>,
) -> Result<(), String> {
    if depth > 8 {
        return Ok(());
    }

    let base_url = supabase_url.trim_end_matches('/');
    let url = format!("{base_url}/storage/v1/object/list/game-saves");
    let response = client
        .post(url)
        .header("apikey", api_key)
        .bearer_auth(access_token)
        .json(&serde_json::json!({
            "prefix": prefix,
            "limit": 1000,
            "offset": 0,
            "sortBy": { "column": "name", "order": "asc" }
        }))
        .send()
        .await
        .map_err(|error| format!("Could not list Supabase Storage objects: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Supabase Storage list failed with {status}: {body}"
        ));
    }

    let objects = response
        .json::<Vec<StorageListObject>>()
        .await
        .map_err(|error| format!("Could not parse Supabase Storage list response: {error}"))?;

    for object in objects {
        let object_path = if prefix.is_empty() {
            object.name.clone()
        } else {
            format!("{}/{}", prefix.trim_end_matches('/'), object.name)
        };

        if object.id.is_some() || object.metadata.is_some() {
            output.push(object_path);
        } else {
            Box::pin(list_supabase_storage_objects_recursive(
                client,
                supabase_url,
                api_key,
                access_token,
                &object_path,
                depth.saturating_add(1),
                output,
            ))
            .await?;
        }
    }

    Ok(())
}

async fn download_file_from_supabase_storage(
    client: &reqwest::Client,
    supabase_url: &str,
    api_key: &str,
    access_token: &str,
    object_path: &str,
    destination: &Path,
    restore_root: &Path,
) -> Result<(), String> {
    ensure_path_inside_root(destination, restore_root)?;
    if let Some(parent) = destination.parent() {
        ensure_path_inside_root(parent, restore_root)?;
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create restore folder: {error}"))?;
    }

    let base_url = supabase_url.trim_end_matches('/');
    let object_path = url_encode_path(object_path);
    let url = format!("{base_url}/storage/v1/object/authenticated/game-saves/{object_path}");
    let response = client
        .get(url)
        .header("apikey", api_key)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|error| format!("Could not download save file from Supabase Storage: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Supabase Storage download failed with {status}: {body}"
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("Could not read downloaded save file: {error}"))?;
    tokio::fs::write(destination, bytes)
        .await
        .map_err(|error| format!("Could not write restored save file: {error}"))
}

fn restore_destination_for_object(
    restore_root: &Path,
    object_path: &str,
    object_prefix: &str,
) -> PathBuf {
    let relative = object_path
        .strip_prefix(object_prefix)
        .unwrap_or(object_path)
        .trim_start_matches('/');

    let mut destination = restore_root.to_path_buf();
    for segment in relative.split('/') {
        if !segment.trim().is_empty() {
            destination.push(sanitize_storage_segment(segment));
        }
    }
    destination
}

fn save_file_label_segment(save_file: &SaveFile) -> String {
    let source = PathBuf::from(&save_file.path);
    save_file
        .label
        .as_deref()
        .filter(|label| !label.trim().is_empty())
        .or_else(|| source.file_name().and_then(|name| name.to_str()))
        .map(sanitize_storage_segment)
        .unwrap_or_else(|| "save".to_string())
}

fn restore_destination_for_configured_save(
    save_file: &SaveFile,
    object_path: &str,
    object_prefix: &str,
) -> Option<PathBuf> {
    let label_segment = save_file_label_segment(save_file);
    let label_prefix = format!("{}/{}", object_prefix.trim_end_matches('/'), label_segment);
    let relative = object_path
        .strip_prefix(&label_prefix)?
        .trim_start_matches('/');
    let configured_path = PathBuf::from(&save_file.path);

    if configured_path.is_file() || configured_path.extension().is_some() {
        return Some(configured_path);
    }

    let mut destination = configured_path;
    for segment in relative.split('/') {
        if !segment.trim().is_empty() {
            destination.push(sanitize_storage_segment(segment));
        }
    }

    Some(destination)
}

fn backup_existing_file(
    target: &Path,
    backup_root: &Path,
    backed_up_files: &mut Vec<String>,
) -> Result<(), String> {
    if !target.exists() || target.is_dir() {
        return Ok(());
    }

    let file_name = target
        .file_name()
        .and_then(|name| name.to_str())
        .map(sanitize_storage_segment)
        .unwrap_or_else(|| "save-file".to_string());
    let backup_path = backup_root.join(file_name);
    if let Some(parent) = backup_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create save backup folder: {error}"))?;
    }
    fs::copy(target, &backup_path)
        .map_err(|error| format!("Could not back up existing save file: {error}"))?;
    backed_up_files.push(path_to_string(backup_path));
    Ok(())
}

async fn restore_cloud_object_to_local_path(
    client: &reqwest::Client,
    supabase_url: &str,
    api_key: &str,
    access_token: &str,
    object_path: &str,
    destination: &Path,
    backup_root: &Path,
    backed_up_files: &mut Vec<String>,
) -> Result<(), String> {
    backup_existing_file(destination, backup_root, backed_up_files)?;
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create local save folder: {error}"))?;
    }

    let base_url = supabase_url.trim_end_matches('/');
    let object_path = url_encode_path(object_path);
    let url = format!("{base_url}/storage/v1/object/authenticated/game-saves/{object_path}");
    let response = client
        .get(url)
        .header("apikey", api_key)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|error| format!("Could not download cloud save: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Supabase Storage download failed with {status}: {body}"
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("Could not read cloud save download: {error}"))?;
    tokio::fs::write(destination, bytes)
        .await
        .map_err(|error| format!("Could not write local save file: {error}"))
}
