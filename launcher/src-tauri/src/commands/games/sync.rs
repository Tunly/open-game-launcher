use std::{
    fs,
    path::{Path, PathBuf},
};

use super::core::{
    backup_root_for_game, current_unix_timestamp, ensure_path_inside_root, get_dir_last_modified,
    normalize_game_id, path_size_bytes, path_to_string, read_installed_games_cache,
    save_sync_root_for_game, slugify, sync_destination_for_save, unix_timestamp_to_iso,
    write_installed_games_cache,
};
use super::types::*;
use crate::commands::cloud_crypto::{self, SaveFileMeta};

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

// ============================================================================
// E2E-Encrypted Cloud Save Sync (AES-256-GCM via OS Keychain)
// ============================================================================

/// Upload game saves to Supabase Storage with AES-256-GCM E2E encryption.
/// The master key is per-user, stored in the OS keychain (see S7).
/// Files are stored as `${user_id}/${game_id}/<relative_path>.enc` with a
/// sidecar `${user_id}/${game_id}/<relative_path>.meta.json`.
#[tauri::command]
pub async fn upload_game_saves_to_cloud(
    input: UploadGameSavesToCloudRequest,
) -> Result<UploadGameSavesToCloudResponse, String> {
    use std::collections::HashMap;
    let game_id = normalize_game_id(input.game_id)?;
    println!("[E2E] upload_game_saves_to_cloud for {game_id}");

    if input.supabase_url.trim().is_empty()
        || input.api_key.trim().is_empty()
        || input.access_token.trim().is_empty()
        || input.user_id.trim().is_empty()
    {
        return Err("Supabase URL, public key, user token, and user ID are required.".to_string());
    }

    let master_key = cloud_crypto::get_or_create_user_keyring_key(&input.user_id)?;

    let games = read_installed_games_cache().unwrap_or_default();
    let game = games
        .iter()
        .find(|g| g.id == game_id)
        .ok_or_else(|| format!("Game '{game_id}' was not found in the local library cache."))?
        .clone();

    if game.save_files.is_empty() {
        return Err("Add at least one save path before uploading saves to cloud.".to_string());
    }

    let client = crate::commands::http::shared_http_client();
    let mut uploaded_files = Vec::new();
    let mut failed_files = Vec::new();
    let mut missing_files = Vec::new();
    let object_prefix = format!(
        "{}/{}",
        sanitize_storage_segment(&input.user_id),
        sanitize_storage_segment(&game.id)
    );

    for save_file in &game.save_files {
        let source = PathBuf::from(&save_file.path);
        if !source.exists() {
            missing_files.push(save_file.path.clone());
            continue;
        }
        let mut file_collector: Vec<(PathBuf, String)> = Vec::new();
        collect_save_file_paths(&source, &source, &mut file_collector);

        for (file_path, relative) in file_collector {
            let plaintext = match fs::read(&file_path) {
                Ok(b) => b,
                Err(e) => {
                    failed_files.push(format!("{} // read: {e}", file_path.display()));
                    continue;
                }
            };
            let (ciphertext, meta) = match cloud_crypto::encrypt_file(&plaintext, &master_key) {
                Ok(v) => v,
                Err(e) => {
                    failed_files.push(format!("{} // encrypt: {e}", file_path.display()));
                    continue;
                }
            };
            let meta_json = match serde_json::to_string(&meta) {
                Ok(s) => s,
                Err(e) => {
                    failed_files.push(format!("{} // meta: {e}", file_path.display()));
                    continue;
                }
            };

            let rel_enc = format!("{}.enc", relative);
            let rel_meta = format!("{}.meta.json", relative);
            let object_path_enc = format!("{}/{}", object_prefix, rel_enc);
            let object_path_meta = format!("{}/{}", object_prefix, rel_meta);

            let enc_result = upload_bytes_to_supabase_storage(
                &client,
                &input.supabase_url,
                &input.api_key,
                &input.access_token,
                &object_path_enc,
                &ciphertext,
                "application/octet-stream",
            )
            .await;
            let meta_result = upload_bytes_to_supabase_storage(
                &client,
                &input.supabase_url,
                &input.api_key,
                &input.access_token,
                &object_path_meta,
                meta_json.as_bytes(),
                "application/json",
            )
            .await;

            match (enc_result, meta_result) {
                (Ok(()), Ok(())) => uploaded_files.push(object_path_enc.clone()),
                (Err(e), _) | (_, Err(e)) => {
                    failed_files.push(format!("{} // upload: {e}", file_path.display()));
                }
            }
        }
    }

    let success = failed_files.is_empty() && missing_files.is_empty();
    let message = if success {
        format!("{} E2E cloud save upload completed.", game.title)
    } else {
        format!(
            "{} E2E cloud save upload completed with {} failed and {} missing file(s).",
            game.title,
            failed_files.len(),
            missing_files.len()
        )
    };
    Ok(UploadGameSavesToCloudResponse {
        game_id,
        success,
        game,
        uploaded_files,
        failed_files,
        missing_files,
        message,
    })
}

/// Download E2E-encrypted saves, decrypt with the per-user master key, write to disk.
#[tauri::command]
pub async fn download_game_saves_from_cloud(
    input: DownloadGameSavesFromCloudRequest,
) -> Result<DownloadGameSavesFromCloudResponse, String> {
    let game_id = normalize_game_id(input.game_id)?;
    println!("[E2E] download_game_saves_from_cloud for {game_id}");

    if input.supabase_url.trim().is_empty()
        || input.api_key.trim().is_empty()
        || input.access_token.trim().is_empty()
        || input.user_id.trim().is_empty()
    {
        return Err("Supabase URL, public key, user token, and user ID are required.".to_string());
    }

    let master_key = cloud_crypto::get_or_create_user_keyring_key(&input.user_id)?;

    let restore_root = save_sync_root_for_game(&game_id)
        .ok_or_else(|| "Could not resolve the local save-sync folder.".to_string())?
        .join("cloud-restore-e2e");
    fs::create_dir_all(&restore_root)
        .map_err(|error| format!("Could not create cloud restore folder: {error}"))?;

    let object_prefix = format!(
        "{}/{}",
        sanitize_storage_segment(&input.user_id),
        sanitize_storage_segment(&game_id)
    );
    let client = crate::commands::http::shared_http_client();

    // List all .enc objects under the prefix
    let mut enc_objects = Vec::new();
    list_supabase_storage_objects_recursive_e2e(
        &client,
        &input.supabase_url,
        &input.api_key,
        &input.access_token,
        "game-saves",
        &object_prefix,
        &mut enc_objects,
    )
    .await?;

    let mut restored_files = Vec::new();
    let mut failed_files = Vec::new();
    for object_path in &enc_objects {
        if !object_path.ends_with(".enc") {
            continue;
        }
        let meta_path = object_path.replace(".enc", ".meta.json");
        let ciphertext = match download_supabase_storage_object(
            &client,
            &input.supabase_url,
            &input.api_key,
            &input.access_token,
            "game-saves",
            object_path,
        )
        .await
        {
            Ok(b) => b,
            Err(e) => {
                failed_files.push(format!("{object_path} // download: {e}"));
                continue;
            }
        };
        let meta_bytes = match download_supabase_storage_object(
            &client,
            &input.supabase_url,
            &input.api_key,
            &input.access_token,
            "game-saves",
            &meta_path,
        )
        .await
        {
            Ok(b) => b,
            Err(e) => {
                failed_files.push(format!("{object_path} // meta: {e}"));
                continue;
            }
        };
        let meta: SaveFileMeta = match serde_json::from_slice(&meta_bytes) {
            Ok(m) => m,
            Err(e) => {
                failed_files.push(format!("{object_path} // meta parse: {e}"));
                continue;
            }
        };
        let plaintext = match cloud_crypto::decrypt_file(&ciphertext, &master_key, &meta) {
            Ok(p) => p,
            Err(e) => {
                failed_files.push(format!("{object_path} // decrypt: {e}"));
                continue;
            }
        };
        let relative = object_path
            .strip_prefix(&object_prefix)
            .unwrap_or(object_path)
            .trim_start_matches('/')
            .replace(".enc", "");
        let dest = restore_root.join(&relative);
        if let Some(parent) = dest.parent() {
            let _ = fs::create_dir_all(parent);
        }
        match fs::write(&dest, &plaintext) {
            Ok(()) => restored_files.push(relative),
            Err(e) => failed_files.push(format!("{object_path} // write: {e}")),
        }
    }
    let success = failed_files.is_empty();
    let message = if success {
        format!(
            "E2E cloud save restore completed ({} files).",
            restored_files.len()
        )
    } else {
        format!(
            "E2E cloud save restore completed with {} failures.",
            failed_files.len()
        )
    };
    Ok(DownloadGameSavesFromCloudResponse {
        game_id,
        success,
        restore_root: path_to_string(restore_root),
        downloaded_files: restored_files,
        failed_files,
        message,
    })
}

#[tauri::command]
pub async fn restore_game_saves_from_cloud(
    input: RestoreGameSavesFromCloudRequest,
) -> Result<RestoreGameSavesFromCloudResponse, String> {
    let game_id = normalize_game_id(input.game_id)?;
    println!("[E2E] restore_game_saves_from_cloud for {game_id}");

    if input.supabase_url.trim().is_empty()
        || input.api_key.trim().is_empty()
        || input.access_token.trim().is_empty()
        || input.user_id.trim().is_empty()
    {
        return Err("Supabase URL, public key, user token, and user ID are required.".to_string());
    }

    let master_key = cloud_crypto::get_or_create_user_keyring_key(&input.user_id)?;

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
        sanitize_storage_segment(&game_id)
    );
    let client = crate::commands::http::shared_http_client();
    let mut object_paths = Vec::new();

    list_supabase_storage_objects_recursive_e2e(
        &client,
        &input.supabase_url,
        &input.api_key,
        &input.access_token,
        "game-saves",
        &object_prefix,
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
        if !object_path.ends_with(".enc") {
            continue;
        }

        let rel_enc = object_path
            .strip_prefix(&object_prefix)
            .unwrap_or(&object_path)
            .trim_start_matches('/');
        let rel_plaintext = rel_enc.replace(".enc", "");
        let fake_object_path = format!("{}/{}", object_prefix, rel_plaintext);

        let Some((save_file, destination)) = game.save_files.iter().find_map(|save_file| {
            restore_destination_for_configured_save(save_file, &fake_object_path, &object_prefix)
                .map(|destination| (save_file, destination))
        }) else {
            skipped_files.push(object_path.clone());
            continue;
        };

        if save_file.path.trim().is_empty() {
            skipped_files.push(object_path.clone());
            continue;
        }

        let meta_path = object_path.replace(".enc", ".meta.json");

        let ciphertext = match download_supabase_storage_object(
            &client,
            &input.supabase_url,
            &input.api_key,
            &input.access_token,
            "game-saves",
            &object_path,
        )
        .await
        {
            Ok(b) => b,
            Err(e) => {
                failed_files.push(format!("{object_path} // download: {e}"));
                continue;
            }
        };

        let meta_bytes = match download_supabase_storage_object(
            &client,
            &input.supabase_url,
            &input.api_key,
            &input.access_token,
            "game-saves",
            &meta_path,
        )
        .await
        {
            Ok(b) => b,
            Err(e) => {
                failed_files.push(format!("{object_path} // meta: {e}"));
                continue;
            }
        };

        let meta: cloud_crypto::SaveFileMeta = match serde_json::from_slice(&meta_bytes) {
            Ok(m) => m,
            Err(e) => {
                failed_files.push(format!("{object_path} // meta parse: {e}"));
                continue;
            }
        };

        let plaintext = match cloud_crypto::decrypt_file(&ciphertext, &master_key, &meta) {
            Ok(p) => p,
            Err(e) => {
                failed_files.push(format!("{object_path} // decrypt: {e}"));
                continue;
            }
        };

        if let Err(e) = backup_existing_file(&destination, &backup_root, &mut backed_up_files) {
            failed_files.push(format!("{object_path} // backup: {e}"));
            continue;
        }

        if let Some(parent) = destination.parent() {
            let _ = fs::create_dir_all(parent);
        }

        match fs::write(&destination, &plaintext) {
            Ok(()) => restored_files.push(path_to_string(destination)),
            Err(e) => failed_files.push(format!("{object_path} // write: {e}")),
        }
    }

    let message = if failed_files.is_empty() {
        format!(
            "{} E2E cloud saves restored to configured paths: {} file(s).",
            game.title,
            restored_files.len()
        )
    } else {
        format!(
            "{} E2E cloud save restore finished with {} restored and {} failed file(s).",
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

// Helper: collect all files under a source dir recursively
fn collect_save_file_paths(source_root: &Path, current: &Path, out: &mut Vec<(PathBuf, String)>) {
    if !current.exists() {
        return;
    }
    if current.is_file() {
        let rel = current
            .strip_prefix(source_root)
            .unwrap_or(current)
            .to_string_lossy()
            .replace('\\', "/");
        out.push((current.to_path_buf(), rel));
        return;
    }
    if let Ok(entries) = fs::read_dir(current) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p == source_root {
                continue;
            }
            collect_save_file_paths(source_root, &p, out);
        }
    }
}

// ============================================================================
// E2E Storage Helpers
// ============================================================================

async fn upload_bytes_to_supabase_storage(
    client: &reqwest::Client,
    supabase_url: &str,
    api_key: &str,
    access_token: &str,
    object_path: &str,
    bytes: &[u8],
    content_type: &str,
) -> Result<(), String> {
    let base_url = supabase_url.trim_end_matches('/');
    let encoded = url_encode_path(object_path);
    let url = format!("{base_url}/storage/v1/object/game-saves/{encoded}");
    let response = client
        .post(url)
        .header("apikey", api_key)
        .bearer_auth(access_token)
        .header("x-upsert", "true")
        .header("cache-control", "3600")
        .header("content-type", content_type)
        .body(bytes.to_vec())
        .send()
        .await
        .map_err(|e| format!("E2E upload failed: {e}"))?;
    if response.status().is_success() {
        Ok(())
    } else {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        Err(format!("E2E Supabase upload {status}: {body}"))
    }
}

async fn download_supabase_storage_object(
    client: &reqwest::Client,
    supabase_url: &str,
    api_key: &str,
    access_token: &str,
    bucket: &str,
    object_path: &str,
) -> Result<Vec<u8>, String> {
    let base_url = supabase_url.trim_end_matches('/');
    let encoded = url_encode_path(object_path);
    let url = format!("{base_url}/storage/v1/object/authenticated/{bucket}/{encoded}");
    let response = client
        .get(url)
        .header("apikey", api_key)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| format!("E2E download failed: {e}"))?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("E2E Supabase download {status}: {body}"));
    }
    response
        .bytes()
        .await
        .map(|b| b.to_vec())
        .map_err(|e| format!("E2E read body: {e}"))
}

async fn list_supabase_storage_objects_recursive_e2e(
    client: &reqwest::Client,
    supabase_url: &str,
    api_key: &str,
    access_token: &str,
    bucket: &str,
    prefix: &str,
    output: &mut Vec<String>,
) -> Result<(), String> {
    // Iterative BFS: collect subfolders, then recurse
    let mut folders = vec![String::new()];
    let base_url = supabase_url.trim_end_matches('/');
    #[derive(serde::Deserialize)]
    struct Entry {
        name: String,
    }
    while let Some(current_path) = folders.pop() {
        let search_prefix = if current_path.is_empty() {
            prefix.to_string()
        } else {
            format!("{}/{}", prefix, current_path)
        };
        let url = format!(
            "{base_url}/storage/v1/object/list/{bucket}?prefix={}",
            url_encode_path(&search_prefix)
        );
        let body = serde_json::json!({
            "prefix": search_prefix,
            "limit": 1000,
            "offset": 0,
            "sortBy": { "column": "name", "order": "asc" }
        });
        let response = client
            .post(&url)
            .header("apikey", api_key)
            .bearer_auth(access_token)
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("E2E list failed: {e}"))?;
        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("E2E list {status}: {body}"));
        }
        let entries: Vec<Entry> = response
            .json()
            .await
            .map_err(|e| format!("E2E list parse: {e}"))?;
        for entry in entries {
            let entry_path = if current_path.is_empty() {
                entry.name.clone()
            } else {
                format!("{}/{}", current_path, entry.name)
            };
            if entry.name.ends_with(".enc") || entry.name.ends_with(".meta.json") {
                let full = format!("{}/{}", prefix, entry_path);
                output.push(full);
            } else {
                // assume folder
                folders.push(entry_path);
            }
        }
    }
    Ok(())
}
