use std::{
    collections::{HashMap, HashSet},
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
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const CROSS_STORE_SAVE_STAGING_PROOF_OPERATION: &str =
    "cross_store_save_supabase_keychain_staging_proof";
const CROSS_STORE_SAVE_STAGING_BUCKET: &str = "game-saves";
const CROSS_STORE_SAVE_STAGING_RELATIVE_PATH: &str = "proof/save-payload.bin";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrossStoreSaveSupabaseKeychainStagingProofConsent {
    pub accepted: bool,
    pub operation: String,
    pub user_id: String,
    pub game_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrossStoreSaveSupabaseKeychainStagingProofRequest {
    pub supabase_url: String,
    pub api_key: String,
    pub access_token: String,
    pub user_id: String,
    pub game_id: String,
    pub consent: CrossStoreSaveSupabaseKeychainStagingProofConsent,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CrossStoreSaveSupabaseKeychainStagingProofResult {
    pub proof_id: String,
    pub game_id: String,
    pub success: bool,
    pub bucket: String,
    pub staging_prefix_redacted: String,
    pub provider_transfer_skipped: bool,
    pub keychain_secret_present: bool,
    pub encrypted_payload_uploaded: bool,
    pub meta_sidecar_uploaded: bool,
    pub listed_object_count: usize,
    pub listed_encrypted_object_count: usize,
    pub listed_meta_sidecar_count: usize,
    pub downloaded_object_count: usize,
    pub decrypted_payload_count: usize,
    pub plaintext_size_bytes: u64,
    pub size_verified: bool,
    pub hash_verified: bool,
    pub encrypted_hash_verified: bool,
    pub delete_attempted_count: usize,
    pub deleted_object_count: usize,
    pub delete_failed_count: usize,
    pub cleanup_status: String,
    pub message: String,
}

#[derive(Debug, Clone, Default)]
struct CrossStoreSaveStagingDeleteEvidence {
    attempted_count: usize,
    deleted_count: usize,
    failed_count: usize,
    status: String,
}

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

fn cloud_relative_path_for_save(save_file: &SaveFile, relative_from_root: &str) -> String {
    let root_segment = save_file_label_segment(save_file);
    let relative = cloud_plain_relative_path(relative_from_root)
        .trim_end_matches('/')
        .to_string();

    if relative.is_empty() {
        return root_segment;
    }

    format!("{root_segment}/{relative}")
}

fn cloud_plain_relative_path(path: &str) -> String {
    path.trim()
        .replace('\\', "/")
        .trim_start_matches('/')
        .to_string()
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

fn restore_destination_for_cloud_relative(save_file: &SaveFile, relative: &str) -> PathBuf {
    let configured_path = PathBuf::from(&save_file.path);

    if configured_path.is_file() || configured_path.extension().is_some() {
        return configured_path;
    }

    let mut destination = configured_path;
    for segment in relative.split('/') {
        if !segment.trim().is_empty() {
            destination.push(sanitize_storage_segment(segment));
        }
    }

    destination
}

fn save_files_for_cloud_request(game: &InstalledGame, save_paths: &[String]) -> Vec<SaveFile> {
    let requested_paths = save_paths
        .iter()
        .map(|path| path.trim())
        .filter(|path| !path.is_empty())
        .collect::<Vec<_>>();

    if requested_paths.is_empty() {
        return game.save_files.clone();
    }

    requested_paths
        .iter()
        .enumerate()
        .map(|(index, path)| SaveFile {
            id: format!("cloud-save-path-{index}"),
            path: (*path).to_string(),
            label: None,
            size_bytes: None,
            modified_at: None,
            synced_at: None,
        })
        .collect()
}

fn normalize_cloud_relative_path(path: &str) -> String {
    let relative = cloud_plain_relative_path(path);

    relative
        .strip_suffix(".enc")
        .or_else(|| relative.strip_suffix(".meta.json"))
        .unwrap_or(&relative)
        .to_string()
}

fn selected_relative_filter(paths: Option<Vec<String>>) -> Option<HashSet<String>> {
    paths.map(|values| {
        values
            .iter()
            .map(|path| normalize_cloud_relative_path(path))
            .collect::<HashSet<_>>()
    })
}

fn relative_matches_filter(relative: &str, selected: &Option<HashSet<String>>) -> bool {
    match selected {
        Some(selected) => selected.contains(&normalize_cloud_relative_path(relative)),
        None => true,
    }
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

fn remove_local_save_file_for_cloud_choice(
    target: &str,
    save_files: &[SaveFile],
) -> Result<String, String> {
    let target_path = PathBuf::from(target);
    if !target_path.exists() {
        return Ok(path_to_string(target_path));
    }
    if target_path.is_dir() {
        return Err(format!(
            "Refusing to delete save directory {}; only files can be removed by a cloud-missing choice.",
            target_path.display()
        ));
    }

    let normalized_target = target_path.canonicalize().map_err(|error| {
        format!(
            "Could not resolve local save file {}: {error}",
            target_path.display()
        )
    })?;
    let is_allowed = save_files.iter().any(|save_file| {
        let root = PathBuf::from(&save_file.path);
        let Ok(normalized_root) = root.canonicalize() else {
            return false;
        };

        if normalized_root.is_file() {
            paths_equal_for_platform(&normalized_target, &normalized_root)
        } else {
            path_starts_with_for_platform(&normalized_target, &normalized_root)
        }
    });

    if !is_allowed {
        return Err(format!(
            "Refusing to delete {}; it is outside the configured save paths.",
            normalized_target.display()
        ));
    }

    fs::remove_file(&normalized_target).map_err(|error| {
        format!(
            "Could not delete local save file {}: {error}",
            normalized_target.display()
        )
    })?;
    Ok(path_to_string(normalized_target))
}

fn paths_equal_for_platform(left: &Path, right: &Path) -> bool {
    if cfg!(windows) {
        left.to_string_lossy()
            .eq_ignore_ascii_case(&right.to_string_lossy())
    } else {
        left == right
    }
}

fn path_starts_with_for_platform(path: &Path, root: &Path) -> bool {
    if cfg!(windows) {
        let mut path_components = path
            .components()
            .map(|component| component.as_os_str().to_string_lossy().to_lowercase());
        root.components().all(|root_component| {
            path_components.next().is_some_and(|path_component| {
                path_component == root_component.as_os_str().to_string_lossy().to_lowercase()
            })
        })
    } else {
        path.starts_with(root)
    }
}

#[tauri::command]
pub async fn prove_cross_store_save_supabase_keychain_staging(
    input: CrossStoreSaveSupabaseKeychainStagingProofRequest,
) -> Result<CrossStoreSaveSupabaseKeychainStagingProofResult, String> {
    validate_cross_store_save_staging_proof_consent(&input)?;

    if input.supabase_url.trim().is_empty()
        || input.api_key.trim().is_empty()
        || input.access_token.trim().is_empty()
        || input.user_id.trim().is_empty()
        || input.game_id.trim().is_empty()
    {
        return Err(
            "Supabase URL, public key, user token, user ID, and game ID are required.".to_string(),
        );
    }

    let game_id = normalize_game_id(input.game_id.clone())?;
    let proof_id = format!("cross-store-save-staging-{}", Uuid::new_v4());
    let object_prefix = cross_store_save_staging_object_prefix(&input.user_id, &game_id, &proof_id);
    let staging_prefix_redacted = cross_store_save_staging_prefix_redacted(&game_id);
    let (object_path_enc, object_path_meta) =
        cloud_save_object_pair(&object_prefix, CROSS_STORE_SAVE_STAGING_RELATIVE_PATH);
    let client = crate::commands::http::shared_http_client();

    let run_result: Result<CrossStoreSaveSupabaseKeychainStagingProofResult, String> = async {
        let master_key = cloud_crypto::get_or_create_user_keyring_key(&input.user_id)?;
        let keychain_secret_present = cloud_crypto::is_cloud_key_present(input.user_id.clone());
        let plaintext = build_cross_store_save_staging_payload(&proof_id, &game_id);
        let plaintext_size_bytes = plaintext.len() as u64;
        let plaintext_sha256 = sha256_bytes_hex(&plaintext);
        let (ciphertext, meta) = cloud_crypto::encrypt_file(&plaintext, &master_key)?;
        let encrypted_sha256 = sha256_bytes_hex(&ciphertext);
        let meta_json = serde_json::to_vec(&meta)
            .map_err(|error| format!("Could not serialize staging proof metadata: {error}"))?;

        upload_bytes_to_supabase_storage(
            client,
            &input.supabase_url,
            &input.api_key,
            &input.access_token,
            &object_path_enc,
            &ciphertext,
            "application/octet-stream",
        )
        .await?;
        upload_bytes_to_supabase_storage(
            client,
            &input.supabase_url,
            &input.api_key,
            &input.access_token,
            &object_path_meta,
            &meta_json,
            "application/json",
        )
        .await?;

        let mut listed_objects = Vec::new();
        list_supabase_storage_objects_recursive_e2e(
            client,
            &input.supabase_url,
            &input.api_key,
            &input.access_token,
            CROSS_STORE_SAVE_STAGING_BUCKET,
            &object_prefix,
            &mut listed_objects,
        )
        .await?;
        let listed_encrypted_object_count = listed_objects
            .iter()
            .filter(|path| path.ends_with(".enc"))
            .count();
        let listed_meta_sidecar_count = listed_objects
            .iter()
            .filter(|path| path.ends_with(".meta.json"))
            .count();

        let downloaded_ciphertext = download_supabase_storage_object(
            client,
            &input.supabase_url,
            &input.api_key,
            &input.access_token,
            CROSS_STORE_SAVE_STAGING_BUCKET,
            &object_path_enc,
        )
        .await?;
        let downloaded_meta_bytes = download_supabase_storage_object(
            client,
            &input.supabase_url,
            &input.api_key,
            &input.access_token,
            CROSS_STORE_SAVE_STAGING_BUCKET,
            &object_path_meta,
        )
        .await?;
        let downloaded_meta: SaveFileMeta = serde_json::from_slice(&downloaded_meta_bytes)
            .map_err(|error| format!("Could not parse staging proof metadata: {error}"))?;
        let downloaded_plaintext =
            cloud_crypto::decrypt_file(&downloaded_ciphertext, &master_key, &downloaded_meta)?;

        let downloaded_plaintext_sha256 = sha256_bytes_hex(&downloaded_plaintext);
        let downloaded_ciphertext_sha256 = sha256_bytes_hex(&downloaded_ciphertext);
        let size_verified = downloaded_plaintext.len() as u64 == downloaded_meta.original_size
            && downloaded_meta.original_size == plaintext_size_bytes;
        let hash_verified = downloaded_plaintext_sha256 == downloaded_meta.original_sha256
            && downloaded_meta.original_sha256 == plaintext_sha256;
        let encrypted_hash_verified = downloaded_ciphertext_sha256
            == downloaded_meta.encrypted_sha256
            && downloaded_meta.encrypted_sha256 == encrypted_sha256;
        let decrypted_payload_count = usize::from(size_verified && hash_verified);
        let success = keychain_secret_present
            && listed_encrypted_object_count >= 1
            && listed_meta_sidecar_count >= 1
            && size_verified
            && hash_verified
            && encrypted_hash_verified
            && downloaded_plaintext == plaintext;

        Ok(CrossStoreSaveSupabaseKeychainStagingProofResult {
            proof_id: proof_id.clone(),
            game_id: game_id.clone(),
            success,
            bucket: CROSS_STORE_SAVE_STAGING_BUCKET.to_string(),
            staging_prefix_redacted: staging_prefix_redacted.clone(),
            provider_transfer_skipped: true,
            keychain_secret_present,
            encrypted_payload_uploaded: true,
            meta_sidecar_uploaded: true,
            listed_object_count: listed_objects.len(),
            listed_encrypted_object_count,
            listed_meta_sidecar_count,
            downloaded_object_count: 2,
            decrypted_payload_count,
            plaintext_size_bytes,
            size_verified,
            hash_verified,
            encrypted_hash_verified,
            delete_attempted_count: 0,
            deleted_object_count: 0,
            delete_failed_count: 0,
            cleanup_status: "pending".to_string(),
            message: String::new(),
        })
    }
    .await;

    let delete_evidence = delete_cross_store_save_staging_objects(
        client,
        &input.supabase_url,
        &input.api_key,
        &input.access_token,
        &object_path_enc,
        &object_path_meta,
    )
    .await;

    match run_result {
        Ok(mut result) => {
            attach_cross_store_save_staging_delete_evidence(&mut result, delete_evidence);
            result.message = if result.delete_failed_count == 0 {
                "Cross-store staging proof uploaded encrypted save data, listed Supabase Storage, downloaded/decrypted/verified size and hash, and removed staging objects without provider transfer.".to_string()
            } else {
                "Cross-store staging proof verified upload/list/download/decrypt; staging cleanup was only partially confirmed and provider transfer was skipped.".to_string()
            };
            Ok(result)
        }
        Err(error) => Err(redact_cross_store_save_staging_error(&error, &input)),
    }
}

fn validate_cross_store_save_staging_proof_consent(
    input: &CrossStoreSaveSupabaseKeychainStagingProofRequest,
) -> Result<(), String> {
    if !input.consent.accepted {
        return Err("Cross-store staging proof requires explicit consent.".to_string());
    }
    if input.consent.operation.trim() != CROSS_STORE_SAVE_STAGING_PROOF_OPERATION {
        return Err("Cross-store staging proof consent operation mismatch.".to_string());
    }
    if input.consent.user_id.trim() != input.user_id.trim() {
        return Err("Cross-store staging proof consent user mismatch.".to_string());
    }
    if input.consent.game_id.trim() != input.game_id.trim() {
        return Err("Cross-store staging proof consent game mismatch.".to_string());
    }
    Ok(())
}

fn cross_store_save_staging_object_prefix(user_id: &str, game_id: &str, proof_id: &str) -> String {
    format!(
        "{}/cross-store-save-staging/{}/{}",
        sanitize_storage_segment(user_id),
        sanitize_storage_segment(game_id),
        sanitize_storage_segment(proof_id)
    )
}

fn cross_store_save_staging_prefix_redacted(game_id: &str) -> String {
    format!(
        "<redacted-user>/cross-store-save-staging/{}/<redacted-proof>",
        sanitize_storage_segment(game_id)
    )
}

fn build_cross_store_save_staging_payload(proof_id: &str, game_id: &str) -> Vec<u8> {
    serde_json::json!({
        "kind": "cross_store_save_staging_proof",
        "proofId": proof_id,
        "gameId": game_id,
        "createdAt": unix_timestamp_to_iso(current_unix_timestamp()),
        "providerTransferSkipped": true,
    })
    .to_string()
    .into_bytes()
}

async fn delete_cross_store_save_staging_objects(
    client: &reqwest::Client,
    supabase_url: &str,
    api_key: &str,
    access_token: &str,
    object_path_enc: &str,
    object_path_meta: &str,
) -> CrossStoreSaveStagingDeleteEvidence {
    let mut evidence = CrossStoreSaveStagingDeleteEvidence {
        status: "not_attempted".to_string(),
        ..Default::default()
    };

    for object_path in [object_path_enc, object_path_meta] {
        evidence.attempted_count += 1;
        match delete_supabase_storage_object(
            client,
            supabase_url,
            api_key,
            access_token,
            CROSS_STORE_SAVE_STAGING_BUCKET,
            object_path,
        )
        .await
        {
            Ok(()) => evidence.deleted_count += 1,
            Err(_) => evidence.failed_count += 1,
        }
    }

    evidence.status = if evidence.failed_count == 0 {
        "cleaned".to_string()
    } else if evidence.deleted_count > 0 {
        "partial".to_string()
    } else {
        "failed".to_string()
    };
    evidence
}

fn attach_cross_store_save_staging_delete_evidence(
    result: &mut CrossStoreSaveSupabaseKeychainStagingProofResult,
    delete_evidence: CrossStoreSaveStagingDeleteEvidence,
) {
    result.delete_attempted_count = delete_evidence.attempted_count;
    result.deleted_object_count = delete_evidence.deleted_count;
    result.delete_failed_count = delete_evidence.failed_count;
    result.cleanup_status = delete_evidence.status;
}

fn sha256_bytes_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn redact_cross_store_save_staging_error(
    error: &str,
    input: &CrossStoreSaveSupabaseKeychainStagingProofRequest,
) -> String {
    let mut redacted = error.to_string();
    for (needle, replacement) in [
        (input.access_token.trim(), "<redacted-access-token>"),
        (input.api_key.trim(), "<redacted-api-key>"),
        (input.user_id.trim(), "<redacted-user>"),
        (input.supabase_url.trim(), "<redacted-supabase-url>"),
    ] {
        if !needle.is_empty() {
            redacted = redacted.replace(needle, replacement);
        }
    }
    redacted
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

    let save_files = save_files_for_cloud_request(&game, &input.save_paths);
    if save_files.is_empty() {
        return Err("Add at least one save path before uploading saves to cloud.".to_string());
    }

    let client = crate::commands::http::shared_http_client();
    let mut uploaded_files = Vec::new();
    let mut deleted_cloud_files = Vec::new();
    let mut failed_files = Vec::new();
    let mut missing_files = Vec::new();
    let mut attempted_selected_uploads = HashSet::new();
    let selected_filter = selected_relative_filter(input.selected_relative_paths);
    let object_prefix = format!(
        "{}/{}",
        sanitize_storage_segment(&input.user_id),
        sanitize_storage_segment(&game.id)
    );

    for relative in &input.delete_cloud_relative_paths {
        let relative = normalize_cloud_relative_path(relative);
        match delete_cloud_save_object_pair(
            client,
            &input.supabase_url,
            &input.api_key,
            &input.access_token,
            &object_prefix,
            &relative,
        )
        .await
        {
            Ok(deleted) => deleted_cloud_files.extend(deleted),
            Err(error) => failed_files.push(format!("{relative} // delete cloud: {error}")),
        }
    }

    for save_file in &save_files {
        let source = PathBuf::from(&save_file.path);
        if !source.exists() {
            if selected_filter.is_none() {
                missing_files.push(save_file.path.clone());
            }
            continue;
        }
        let mut file_collector: Vec<(PathBuf, String)> = Vec::new();
        collect_cloud_save_file_paths(save_file, &mut file_collector);

        for (file_path, relative) in file_collector {
            if !relative_matches_filter(&relative, &selected_filter) {
                continue;
            }

            attempted_selected_uploads.insert(normalize_cloud_relative_path(&relative));
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

            let (object_path_enc, object_path_meta) =
                cloud_save_object_pair(&object_prefix, &relative);

            let enc_result = upload_bytes_to_supabase_storage(
                client,
                &input.supabase_url,
                &input.api_key,
                &input.access_token,
                &object_path_enc,
                &ciphertext,
                "application/octet-stream",
            )
            .await;
            let meta_result = upload_bytes_to_supabase_storage(
                client,
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

    if let Some(selected) = &selected_filter {
        for relative in selected {
            if !attempted_selected_uploads.contains(relative) {
                missing_files.push(format!("Selected local save not found: {relative}"));
            }
        }
    }

    let success = failed_files.is_empty() && missing_files.is_empty();
    let message = if success {
        format!(
            "{} E2E cloud save upload completed ({} uploaded, {} cloud deleted).",
            game.title,
            uploaded_files.len(),
            deleted_cloud_files.len()
        )
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
        deleted_cloud_files,
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
        client,
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
        let meta_path = cloud_meta_path_for_encrypted_object(object_path);
        let ciphertext = match download_supabase_storage_object(
            client,
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
            client,
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
            .strip_suffix(".enc")
            .unwrap_or_else(|| {
                object_path
                    .strip_prefix(&object_prefix)
                    .unwrap_or(object_path)
                    .trim_start_matches('/')
            })
            .to_string();
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

    let save_files = save_files_for_cloud_request(game, &input.save_paths);
    if save_files.is_empty() {
        return Err("Add at least one save path before restoring cloud saves.".to_string());
    }

    let object_prefix = format!(
        "{}/{}",
        sanitize_storage_segment(&input.user_id),
        sanitize_storage_segment(&game_id)
    );
    let client = crate::commands::http::shared_http_client();
    let mut object_paths = Vec::new();
    let selected_filter = selected_relative_filter(input.selected_relative_paths);
    let should_list_cloud = selected_filter
        .as_ref()
        .is_none_or(|selected| !selected.is_empty());

    if should_list_cloud {
        list_supabase_storage_objects_recursive_e2e(
            client,
            &input.supabase_url,
            &input.api_key,
            &input.access_token,
            "game-saves",
            &object_prefix,
            &mut object_paths,
        )
        .await?;
    }

    if object_paths.is_empty() && selected_filter.is_none() && input.delete_local_paths.is_empty() {
        return Ok(RestoreGameSavesFromCloudResponse {
            game_id: game_id.clone(),
            success: false,
            restored_files: Vec::new(),
            backed_up_files: Vec::new(),
            deleted_local_files: Vec::new(),
            skipped_files: Vec::new(),
            failed_files: Vec::new(),
            message: format!("No cloud saves were found for {}.", game.title),
        });
    }

    let backup_root = backup_root_for_game(&game.id)
        .ok_or_else(|| "Could not resolve the local save-backup folder.".to_string())?;
    let mut restored_files = Vec::new();
    let mut backed_up_files = Vec::new();
    let mut deleted_local_files = Vec::new();
    let mut skipped_files = Vec::new();
    let mut failed_files = Vec::new();
    let mut matched_selected_restores = HashSet::new();

    for target in &input.delete_local_paths {
        match remove_local_save_file_for_cloud_choice(target, &save_files) {
            Ok(path) => deleted_local_files.push(path),
            Err(error) => failed_files.push(format!("{target} // delete local: {error}")),
        }
    }

    for object_path in object_paths {
        if !object_path.ends_with(".enc") {
            continue;
        }

        let rel_enc = object_path
            .strip_prefix(&object_prefix)
            .unwrap_or(&object_path)
            .trim_start_matches('/');
        let rel_plaintext = rel_enc.strip_suffix(".enc").unwrap_or(rel_enc).to_string();
        if !relative_matches_filter(&rel_plaintext, &selected_filter) {
            continue;
        }
        matched_selected_restores.insert(normalize_cloud_relative_path(&rel_plaintext));
        let fake_object_path = format!("{}/{}", object_prefix, rel_plaintext);

        let Some((save_file, destination)) = save_files
            .iter()
            .find_map(|save_file| {
                restore_destination_for_configured_save(
                    save_file,
                    &fake_object_path,
                    &object_prefix,
                )
                .map(|destination| (save_file, destination))
            })
            .or_else(|| {
                save_files
                    .iter()
                    .find(|save_file| !save_file.path.trim().is_empty())
                    .map(|save_file| {
                        (
                            save_file,
                            restore_destination_for_cloud_relative(save_file, &rel_plaintext),
                        )
                    })
            })
        else {
            skipped_files.push(object_path.clone());
            if selected_filter.is_some() {
                failed_files.push(format!("{object_path} // no configured restore path"));
            }
            continue;
        };

        if save_file.path.trim().is_empty() {
            skipped_files.push(object_path.clone());
            continue;
        }

        let meta_path = cloud_meta_path_for_encrypted_object(&object_path);

        let ciphertext = match download_supabase_storage_object(
            client,
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
            client,
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

    if let Some(selected) = &selected_filter {
        for relative in selected {
            if !matched_selected_restores.contains(relative) {
                failed_files.push(format!("Selected cloud save not found: {relative}"));
            }
        }
    }

    let message = if failed_files.is_empty() {
        format!(
            "{} E2E cloud saves restored to configured paths: {} restored, {} local deleted.",
            game.title,
            restored_files.len(),
            deleted_local_files.len()
        )
    } else {
        format!(
            "{} E2E cloud save restore finished with {} restored, {} local deleted, and {} failed file(s).",
            game.title,
            restored_files.len(),
            deleted_local_files.len(),
            failed_files.len()
        )
    };

    Ok(RestoreGameSavesFromCloudResponse {
        game_id: game_id.clone(),
        success: failed_files.is_empty()
            && (!restored_files.is_empty() || !deleted_local_files.is_empty()),
        restored_files,
        backed_up_files,
        deleted_local_files,
        skipped_files,
        failed_files,
        message,
    })
}

#[tauri::command]
pub async fn check_game_save_conflicts(
    input: CheckGameSaveConflictsRequest,
) -> Result<CheckGameSaveConflictsResponse, String> {
    let game_id = normalize_game_id(input.game_id)?;
    println!("[E2E] check_game_save_conflicts for {game_id}");

    if input.supabase_url.trim().is_empty()
        || input.api_key.trim().is_empty()
        || input.access_token.trim().is_empty()
        || input.user_id.trim().is_empty()
    {
        return Err("Supabase URL, public key, user token, and user ID are required.".to_string());
    }

    let games = read_installed_games_cache().unwrap_or_default();
    let cached_game = games.iter().find(|game| game.id == game_id);
    let title = cached_game
        .map(|game| game.title.clone())
        .unwrap_or_else(|| game_id.clone());
    let save_files = if input.save_paths.is_empty() {
        cached_game
            .map(|game| game.save_files.clone())
            .unwrap_or_default()
    } else {
        input
            .save_paths
            .iter()
            .map(|path| path.trim().to_string())
            .filter(|path| !path.is_empty())
            .enumerate()
            .map(|(index, path)| SaveFile {
                id: format!("cloud-conflict-path-{index}"),
                path,
                label: None,
                size_bytes: None,
                modified_at: None,
                synced_at: None,
            })
            .collect::<Vec<_>>()
    };

    if save_files.is_empty() {
        return Ok(CheckGameSaveConflictsResponse {
            game_id,
            success: false,
            checked_files: 0,
            conflict_count: 0,
            matching_count: 0,
            missing_local_count: 0,
            missing_cloud_count: 0,
            files: Vec::new(),
            message: format!(
                "Add at least one save path before checking cloud conflicts for {title}."
            ),
        });
    }

    let object_prefix = format!(
        "{}/{}",
        sanitize_storage_segment(&input.user_id),
        sanitize_storage_segment(&game_id)
    );
    let client = crate::commands::http::shared_http_client();
    let mut object_paths = Vec::new();

    list_supabase_storage_objects_recursive_e2e(
        client,
        &input.supabase_url,
        &input.api_key,
        &input.access_token,
        "game-saves",
        &object_prefix,
        &mut object_paths,
    )
    .await?;

    let mut cloud_meta_by_relative: HashMap<String, SaveFileMeta> = HashMap::new();
    let mut files = Vec::new();
    for object_path in object_paths
        .iter()
        .filter(|path| path.ends_with(".meta.json"))
    {
        let relative = cloud_relative_from_meta_path(object_path, &object_prefix);
        match download_supabase_storage_object(
            client,
            &input.supabase_url,
            &input.api_key,
            &input.access_token,
            "game-saves",
            object_path,
        )
        .await
        {
            Ok(bytes) => match serde_json::from_slice::<SaveFileMeta>(&bytes) {
                Ok(meta) => {
                    cloud_meta_by_relative.insert(relative, meta);
                }
                Err(error) => files.push(CloudSaveConflictFile {
                    path: object_path.clone(),
                    relative_path: relative,
                    status: CloudSaveConflictStatus::Unknown,
                    local_size_bytes: None,
                    cloud_size_bytes: None,
                    local_modified_at: None,
                    cloud_created_at: None,
                    local_sha256: None,
                    cloud_sha256: None,
                    message: format!("Cloud metadata could not be parsed: {error}"),
                }),
            },
            Err(error) => files.push(CloudSaveConflictFile {
                path: object_path.clone(),
                relative_path: relative,
                status: CloudSaveConflictStatus::Unknown,
                local_size_bytes: None,
                cloud_size_bytes: None,
                local_modified_at: None,
                cloud_created_at: None,
                local_sha256: None,
                cloud_sha256: None,
                message: format!("Cloud metadata could not be read: {error}"),
            }),
        }
    }

    let mut checked_cloud_relatives = HashSet::new();
    for save_file in save_files {
        let save_path = save_file.path.clone();
        let source = PathBuf::from(&save_path);
        if !source.exists() {
            files.push(CloudSaveConflictFile {
                path: save_path,
                relative_path: String::new(),
                status: CloudSaveConflictStatus::LocalMissing,
                local_size_bytes: None,
                cloud_size_bytes: None,
                local_modified_at: None,
                cloud_created_at: None,
                local_sha256: None,
                cloud_sha256: None,
                message: "Configured save path does not exist on this device.".to_string(),
            });
            continue;
        }

        let mut local_paths = Vec::new();
        collect_cloud_save_file_paths(&save_file, &mut local_paths);
        if local_paths.is_empty() {
            files.push(CloudSaveConflictFile {
                path: path_to_string(source),
                relative_path: String::new(),
                status: CloudSaveConflictStatus::CloudMissing,
                local_size_bytes: Some(0),
                cloud_size_bytes: None,
                local_modified_at: get_dir_last_modified(Path::new(&save_path))
                    .map(unix_timestamp_to_iso),
                cloud_created_at: None,
                local_sha256: None,
                cloud_sha256: None,
                message: "No local save files were found under this path.".to_string(),
            });
            continue;
        }

        for (file_path, relative) in local_paths {
            let local_sha = sha256_file_hex(&file_path);
            let local_size = fs::metadata(&file_path).ok().map(|metadata| metadata.len());
            let local_modified = get_dir_last_modified(&file_path);
            let Some(cloud_meta) = cloud_meta_by_relative.get(&relative) else {
                files.push(CloudSaveConflictFile {
                    path: path_to_string(file_path),
                    relative_path: relative,
                    status: CloudSaveConflictStatus::CloudMissing,
                    local_size_bytes: local_size,
                    cloud_size_bytes: None,
                    local_modified_at: local_modified.map(unix_timestamp_to_iso),
                    cloud_created_at: None,
                    local_sha256: local_sha,
                    cloud_sha256: None,
                    message: "Local save file has no matching cloud metadata.".to_string(),
                });
                continue;
            };

            checked_cloud_relatives.insert(relative.clone());
            let status = classify_cloud_save_status(
                local_sha.as_deref(),
                local_modified,
                Some(&cloud_meta.original_sha256),
                parse_cloud_meta_timestamp(&cloud_meta.created_at),
            );
            let message = conflict_status_message(&status).to_string();
            files.push(CloudSaveConflictFile {
                path: path_to_string(file_path),
                relative_path: relative,
                status: status.clone(),
                local_size_bytes: local_size,
                cloud_size_bytes: Some(cloud_meta.original_size),
                local_modified_at: local_modified.map(unix_timestamp_to_iso),
                cloud_created_at: Some(cloud_meta.created_at.clone()),
                local_sha256: local_sha,
                cloud_sha256: Some(cloud_meta.original_sha256.clone()),
                message,
            });
        }
    }

    for (relative, meta) in cloud_meta_by_relative {
        if checked_cloud_relatives.contains(&relative) {
            continue;
        }
        files.push(CloudSaveConflictFile {
            path: relative.clone(),
            relative_path: relative,
            status: CloudSaveConflictStatus::LocalMissing,
            local_size_bytes: None,
            cloud_size_bytes: Some(meta.original_size),
            local_modified_at: None,
            cloud_created_at: Some(meta.created_at),
            local_sha256: None,
            cloud_sha256: Some(meta.original_sha256),
            message: "Cloud save metadata has no matching local file.".to_string(),
        });
    }

    files.sort_by(|a, b| {
        a.relative_path
            .cmp(&b.relative_path)
            .then(a.path.cmp(&b.path))
    });

    let matching_count = files
        .iter()
        .filter(|file| file.status == CloudSaveConflictStatus::Matching)
        .count();
    let missing_local_count = files
        .iter()
        .filter(|file| file.status == CloudSaveConflictStatus::LocalMissing)
        .count();
    let missing_cloud_count = files
        .iter()
        .filter(|file| file.status == CloudSaveConflictStatus::CloudMissing)
        .count();
    let conflict_count = files
        .iter()
        .filter(|file| file.status != CloudSaveConflictStatus::Matching)
        .count();
    let success = files
        .iter()
        .all(|file| file.status == CloudSaveConflictStatus::Matching);
    let checked_files = files.len();
    let message = if checked_files == 0 {
        format!("No cloud metadata was found for {title}.")
    } else if conflict_count == 0 {
        format!("{title} cloud save check found no conflicts.")
    } else {
        format!("{title} cloud save check found {conflict_count} possible conflict(s).")
    };

    Ok(CheckGameSaveConflictsResponse {
        game_id,
        success,
        checked_files,
        conflict_count,
        matching_count,
        missing_local_count,
        missing_cloud_count,
        files,
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

fn collect_cloud_save_file_paths(save_file: &SaveFile, out: &mut Vec<(PathBuf, String)>) {
    let source = PathBuf::from(&save_file.path);
    let mut collected = Vec::new();
    collect_save_file_paths(&source, &source, &mut collected);

    out.extend(
        collected
            .into_iter()
            .map(|(path, relative)| (path, cloud_relative_path_for_save(save_file, &relative))),
    );
}

fn cloud_relative_from_meta_path(object_path: &str, object_prefix: &str) -> String {
    object_path
        .strip_prefix(object_prefix)
        .unwrap_or(object_path)
        .trim_start_matches('/')
        .strip_suffix(".meta.json")
        .unwrap_or(object_path)
        .to_string()
}

fn sha256_file_hex(path: &Path) -> Option<String> {
    use sha2::{Digest, Sha256};
    let bytes = fs::read(path).ok()?;
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    Some(
        hasher
            .finalize()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect(),
    )
}

fn parse_cloud_meta_timestamp(value: &str) -> Option<u64> {
    if let Ok(timestamp) = value.trim_end_matches('Z').parse::<u64>() {
        return Some(timestamp);
    }

    chrono::DateTime::parse_from_rfc3339(value)
        .ok()
        .and_then(|timestamp| u64::try_from(timestamp.timestamp()).ok())
}

fn classify_cloud_save_status(
    local_sha256: Option<&str>,
    local_modified_at: Option<u64>,
    cloud_sha256: Option<&str>,
    cloud_created_at: Option<u64>,
) -> CloudSaveConflictStatus {
    let (Some(local_sha256), Some(cloud_sha256)) = (local_sha256, cloud_sha256) else {
        return CloudSaveConflictStatus::Unknown;
    };

    if local_sha256 == cloud_sha256 {
        return CloudSaveConflictStatus::Matching;
    }

    match (local_modified_at, cloud_created_at) {
        (Some(local), Some(cloud)) if local > cloud => CloudSaveConflictStatus::LocalNewer,
        (Some(local), Some(cloud)) if cloud > local => CloudSaveConflictStatus::CloudNewer,
        _ => CloudSaveConflictStatus::Different,
    }
}

fn conflict_status_message(status: &CloudSaveConflictStatus) -> &'static str {
    match status {
        CloudSaveConflictStatus::Matching => "Local save matches cloud metadata.",
        CloudSaveConflictStatus::LocalNewer => "Local save differs and appears newer than cloud.",
        CloudSaveConflictStatus::CloudNewer => "Cloud save differs and appears newer than local.",
        CloudSaveConflictStatus::Different => "Local save differs from cloud metadata.",
        CloudSaveConflictStatus::LocalMissing => "Cloud save has no matching local file.",
        CloudSaveConflictStatus::CloudMissing => "Local save has no matching cloud metadata.",
        CloudSaveConflictStatus::Unknown => "Save state could not be classified.",
    }
}

// ============================================================================
// E2E Storage Helpers
// ============================================================================

fn cloud_save_object_pair(object_prefix: &str, plaintext_relative: &str) -> (String, String) {
    let prefix = object_prefix.trim_end_matches('/');
    let relative = cloud_plain_relative_path(plaintext_relative);

    (
        format!("{prefix}/{relative}.enc"),
        format!("{prefix}/{relative}.meta.json"),
    )
}

fn cloud_meta_path_for_encrypted_object(object_path: &str) -> String {
    format!(
        "{}.meta.json",
        object_path.strip_suffix(".enc").unwrap_or(object_path)
    )
}

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

async fn delete_cloud_save_object_pair(
    client: &reqwest::Client,
    supabase_url: &str,
    api_key: &str,
    access_token: &str,
    object_prefix: &str,
    relative: &str,
) -> Result<Vec<String>, String> {
    let normalized = normalize_cloud_relative_path(relative);
    let (object_path_enc, object_path_meta) = cloud_save_object_pair(object_prefix, &normalized);

    delete_supabase_storage_object(
        client,
        supabase_url,
        api_key,
        access_token,
        "game-saves",
        &object_path_enc,
    )
    .await?;
    delete_supabase_storage_object(
        client,
        supabase_url,
        api_key,
        access_token,
        "game-saves",
        &object_path_meta,
    )
    .await?;

    Ok(vec![object_path_enc, object_path_meta])
}

async fn delete_supabase_storage_object(
    client: &reqwest::Client,
    supabase_url: &str,
    api_key: &str,
    access_token: &str,
    bucket: &str,
    object_path: &str,
) -> Result<(), String> {
    let base_url = supabase_url.trim_end_matches('/');
    let encoded = url_encode_path(object_path);
    let url = format!("{base_url}/storage/v1/object/{bucket}/{encoded}");
    let response = client
        .delete(url)
        .header("apikey", api_key)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| format!("E2E delete failed: {e}"))?;
    if response.status().is_success() || response.status() == reqwest::StatusCode::NOT_FOUND {
        Ok(())
    } else {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        Err(format!("E2E Supabase delete {status}: {body}"))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn conflict_classifier_matches_equal_hashes() {
        let status = classify_cloud_save_status(Some("abc"), Some(10), Some("abc"), Some(20));
        assert_eq!(status, CloudSaveConflictStatus::Matching);
    }

    #[test]
    fn conflict_classifier_detects_newer_side_when_hashes_differ() {
        let local = classify_cloud_save_status(Some("local"), Some(30), Some("cloud"), Some(20));
        let cloud = classify_cloud_save_status(Some("local"), Some(10), Some("cloud"), Some(20));

        assert_eq!(local, CloudSaveConflictStatus::LocalNewer);
        assert_eq!(cloud, CloudSaveConflictStatus::CloudNewer);
    }

    #[test]
    fn cloud_meta_timestamp_supports_legacy_epoch_format() {
        assert_eq!(
            parse_cloud_meta_timestamp("1770123456Z"),
            Some(1_770_123_456)
        );
    }

    #[test]
    fn selected_relative_filter_matches_normalized_cloud_paths() {
        let selected = selected_relative_filter(Some(vec![
            String::new(),
            "profile\\slot-1.sav.enc".to_string(),
        ]));

        assert!(relative_matches_filter("", &selected));
        assert!(relative_matches_filter("profile/slot-1.sav", &selected));
        assert!(!relative_matches_filter("profile/slot-2.sav", &selected));
    }

    #[test]
    fn normalize_cloud_relative_path_strips_only_terminal_cloud_suffixes() {
        assert_eq!(
            normalize_cloud_relative_path("profile.enc.backup/slot.enc"),
            "profile.enc.backup/slot"
        );
        assert_eq!(
            normalize_cloud_relative_path("profile.enc.backup/slot.meta.json"),
            "profile.enc.backup/slot"
        );
        assert_eq!(
            normalize_cloud_relative_path("profile.enc.backup/slot.sav"),
            "profile.enc.backup/slot.sav"
        );
    }

    #[test]
    fn cloud_relative_path_uses_label_root_for_file_save() {
        let save_file = SaveFile {
            id: "save-1".to_string(),
            path: "/tmp/profile.sav".to_string(),
            label: Some("Steam Profile Slot".to_string()),
            size_bytes: None,
            modified_at: None,
            synced_at: None,
        };

        assert_eq!(
            cloud_relative_path_for_save(&save_file, ""),
            "steam-profile-slot"
        );
    }

    #[test]
    fn cloud_save_object_pair_preserves_plain_relative_suffixes() {
        assert_eq!(
            cloud_save_object_pair("user-1/mech-arcade", "profile.enc.backup/slot.enc"),
            (
                "user-1/mech-arcade/profile.enc.backup/slot.enc.enc".to_string(),
                "user-1/mech-arcade/profile.enc.backup/slot.enc.meta.json".to_string(),
            )
        );
    }

    #[test]
    fn cloud_meta_path_for_encrypted_object_changes_only_terminal_suffix() {
        assert_eq!(
            cloud_meta_path_for_encrypted_object(
                "user-1/mech-arcade/profile.enc.backup/slot.enc.enc",
            ),
            "user-1/mech-arcade/profile.enc.backup/slot.enc.meta.json"
        );
    }

    #[test]
    fn collect_cloud_save_file_paths_keeps_file_roots_non_empty_and_distinct() {
        let root = temp_test_dir("file-roots");
        let steam = root.join("steam").join("profile.sav");
        let gog = root.join("gog").join("profile.sav");
        std::fs::create_dir_all(steam.parent().unwrap()).unwrap();
        std::fs::create_dir_all(gog.parent().unwrap()).unwrap();
        std::fs::write(&steam, b"steam").unwrap();
        std::fs::write(&gog, b"gog").unwrap();

        let mut collected = Vec::new();
        collect_cloud_save_file_paths(
            &SaveFile {
                id: "steam".to_string(),
                path: path_to_string(steam.clone()),
                label: Some("Steam Slot".to_string()),
                size_bytes: None,
                modified_at: None,
                synced_at: None,
            },
            &mut collected,
        );
        collect_cloud_save_file_paths(
            &SaveFile {
                id: "gog".to_string(),
                path: path_to_string(gog.clone()),
                label: Some("GOG Slot".to_string()),
                size_bytes: None,
                modified_at: None,
                synced_at: None,
            },
            &mut collected,
        );

        let relatives = collected
            .iter()
            .map(|(_, relative)| relative.as_str())
            .collect::<Vec<_>>();
        assert_eq!(relatives, vec!["steam-slot", "gog-slot"]);
        assert!(relatives.iter().all(|relative| !relative.is_empty()));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn collect_cloud_save_file_paths_prefixes_directory_contents() {
        let root = temp_test_dir("directory-root");
        let profile = root.join("Profiles").join("Slot A.sav");
        std::fs::create_dir_all(profile.parent().unwrap()).unwrap();
        std::fs::write(&profile, b"slot").unwrap();

        let mut collected = Vec::new();
        collect_cloud_save_file_paths(
            &SaveFile {
                id: "save-1".to_string(),
                path: path_to_string(root.clone()),
                label: Some("Steam Profile".to_string()),
                size_bytes: None,
                modified_at: None,
                synced_at: None,
            },
            &mut collected,
        );

        assert_eq!(collected.len(), 1);
        assert_eq!(collected[0].1, "steam-profile/Profiles/Slot A.sav");

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn restore_destination_uses_labeled_cloud_root_to_choose_configured_directory() {
        let steam = SaveFile {
            id: "steam".to_string(),
            path: "/tmp/steam-saves".to_string(),
            label: Some("Steam Slot".to_string()),
            size_bytes: None,
            modified_at: None,
            synced_at: None,
        };
        let gog = SaveFile {
            id: "gog".to_string(),
            path: "/tmp/gog-saves".to_string(),
            label: Some("GOG Slot".to_string()),
            size_bytes: None,
            modified_at: None,
            synced_at: None,
        };
        let object_prefix = "user-1/mech-arcade";
        let object_path = "user-1/mech-arcade/gog-slot/Profiles/Slot A.sav";

        assert!(
            restore_destination_for_configured_save(&steam, object_path, object_prefix).is_none()
        );
        assert_eq!(
            restore_destination_for_configured_save(&gog, object_path, object_prefix),
            Some(PathBuf::from("/tmp/gog-saves/profiles/slot-a-sav"))
        );
    }

    #[test]
    fn restore_destination_uses_relative_path_under_configured_directory() {
        let save_file = SaveFile {
            id: "save-1".to_string(),
            path: "/tmp/og-saves".to_string(),
            label: None,
            size_bytes: None,
            modified_at: None,
            synced_at: None,
        };

        assert_eq!(
            restore_destination_for_cloud_relative(&save_file, "Profile 1/Slot A.sav"),
            PathBuf::from("/tmp/og-saves/profile-1/slot-a-sav")
        );
    }

    #[test]
    fn restore_destination_keeps_configured_file_path() {
        let save_file = SaveFile {
            id: "save-1".to_string(),
            path: "/tmp/og-save.dat".to_string(),
            label: None,
            size_bytes: None,
            modified_at: None,
            synced_at: None,
        };

        assert_eq!(
            restore_destination_for_cloud_relative(&save_file, "ignored/slot.sav"),
            PathBuf::from("/tmp/og-save.dat")
        );
    }

    #[test]
    fn cross_store_staging_proof_requires_matching_consent() {
        let mut input = staging_proof_request();
        input.consent.accepted = false;
        assert!(validate_cross_store_save_staging_proof_consent(&input)
            .unwrap_err()
            .contains("explicit consent"));

        let mut input = staging_proof_request();
        input.consent.operation = "other".to_string();
        assert!(validate_cross_store_save_staging_proof_consent(&input)
            .unwrap_err()
            .contains("operation mismatch"));

        let mut input = staging_proof_request();
        input.consent.user_id = "other-user".to_string();
        assert!(validate_cross_store_save_staging_proof_consent(&input)
            .unwrap_err()
            .contains("user mismatch"));

        let mut input = staging_proof_request();
        input.consent.game_id = "other-game".to_string();
        assert!(validate_cross_store_save_staging_proof_consent(&input)
            .unwrap_err()
            .contains("game mismatch"));
    }

    #[test]
    fn cross_store_staging_prefix_is_user_scoped_unique_and_redacted_for_output() {
        let prefix_a =
            cross_store_save_staging_object_prefix("user@example.com", "Game One", "proof-a");
        let prefix_b =
            cross_store_save_staging_object_prefix("user@example.com", "Game One", "proof-b");

        assert_ne!(prefix_a, prefix_b);
        assert!(prefix_a.contains("/cross-store-save-staging/game-one/"));
        assert!(!prefix_a.contains('@'));

        let redacted = cross_store_save_staging_prefix_redacted("Game One");
        assert_eq!(
            redacted,
            "<redacted-user>/cross-store-save-staging/game-one/<redacted-proof>"
        );
        assert!(!redacted.contains("user@example.com"));
        assert!(!redacted.contains("proof-a"));
    }

    #[test]
    fn cross_store_staging_error_redaction_removes_secrets_and_raw_auth_context() {
        let input = staging_proof_request();
        let error = format!(
            "upload failed for {} with key {} token {} user {}",
            input.supabase_url, input.api_key, input.access_token, input.user_id
        );

        let redacted = redact_cross_store_save_staging_error(&error, &input);

        assert!(!redacted.contains(&input.supabase_url));
        assert!(!redacted.contains(&input.api_key));
        assert!(!redacted.contains(&input.access_token));
        assert!(!redacted.contains(&input.user_id));
        assert!(redacted.contains("<redacted-supabase-url>"));
        assert!(redacted.contains("<redacted-api-key>"));
        assert!(redacted.contains("<redacted-access-token>"));
        assert!(redacted.contains("<redacted-user>"));
    }

    #[test]
    fn cross_store_staging_delete_evidence_attaches_counts_without_object_paths() {
        let mut result = CrossStoreSaveSupabaseKeychainStagingProofResult {
            proof_id: "proof".to_string(),
            game_id: "game".to_string(),
            success: true,
            bucket: CROSS_STORE_SAVE_STAGING_BUCKET.to_string(),
            staging_prefix_redacted: cross_store_save_staging_prefix_redacted("game"),
            provider_transfer_skipped: true,
            keychain_secret_present: true,
            encrypted_payload_uploaded: true,
            meta_sidecar_uploaded: true,
            listed_object_count: 2,
            listed_encrypted_object_count: 1,
            listed_meta_sidecar_count: 1,
            downloaded_object_count: 2,
            decrypted_payload_count: 1,
            plaintext_size_bytes: 42,
            size_verified: true,
            hash_verified: true,
            encrypted_hash_verified: true,
            delete_attempted_count: 0,
            deleted_object_count: 0,
            delete_failed_count: 0,
            cleanup_status: "pending".to_string(),
            message: "ok".to_string(),
        };

        attach_cross_store_save_staging_delete_evidence(
            &mut result,
            CrossStoreSaveStagingDeleteEvidence {
                attempted_count: 2,
                deleted_count: 1,
                failed_count: 1,
                status: "partial".to_string(),
            },
        );

        let serialized = serde_json::to_string(&result).unwrap();
        assert_eq!(result.delete_attempted_count, 2);
        assert_eq!(result.deleted_object_count, 1);
        assert_eq!(result.delete_failed_count, 1);
        assert_eq!(result.cleanup_status, "partial");
        assert!(!serialized.contains("proof/save-payload.bin"));
        assert!(!serialized.contains(".enc"));
        assert!(!serialized.contains(".meta.json"));
    }

    fn staging_proof_request() -> CrossStoreSaveSupabaseKeychainStagingProofRequest {
        CrossStoreSaveSupabaseKeychainStagingProofRequest {
            supabase_url: "https://project.supabase.co".to_string(),
            api_key: "anon-secret".to_string(),
            access_token: "access-token-secret".to_string(),
            user_id: "user-123".to_string(),
            game_id: "game-123".to_string(),
            consent: CrossStoreSaveSupabaseKeychainStagingProofConsent {
                accepted: true,
                operation: CROSS_STORE_SAVE_STAGING_PROOF_OPERATION.to_string(),
                user_id: "user-123".to_string(),
                game_id: "game-123".to_string(),
            },
        }
    }

    fn temp_test_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "og-cloud-save-sync-{name}-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }
}
