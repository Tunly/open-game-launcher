use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    path::{Component, Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

use crate::commands::games::sha256_file_hex;
use crate::commands::save_mirror;

const CROSS_STORE_SAVE_APPLY_OPERATION: &str = "cross_store_save_native_copy_apply";
const CROSS_STORE_SAVE_ROLLBACK_OPERATION: &str = "cross_store_save_native_copy_rollback";
const CROSS_STORE_SAVE_MANIFEST_FILE: &str = "og-cross-store-save-apply.json";
const CROSS_STORE_SAVE_BACKUP_DIR: &str = ".og-cross-store-save-backups";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrossStoreSaveApplyRequest {
    pub game_id: String,
    pub source_label: String,
    pub target_label: String,
    pub source_root: String,
    pub target_root: String,
    pub actions: Vec<CrossStoreSaveApplyAction>,
    pub consent: CrossStoreSaveApplyConsent,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrossStoreSaveApplyAction {
    pub id: String,
    pub source_relative_path: String,
    pub target_relative_path: String,
    pub expected_sha256: Option<String>,
    pub expected_size_bytes: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrossStoreSaveApplyConsent {
    pub accepted: bool,
    pub operation: String,
    pub source_root: String,
    pub target_root: String,
    pub action_count: usize,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CrossStoreSaveAppliedFile {
    pub id: String,
    pub source_relative_path: String,
    pub target_relative_path: String,
    pub size_bytes: u64,
    pub sha256: String,
    pub backed_up: bool,
    pub backup_relative_path: Option<String>,
    pub backup_size_bytes: Option<u64>,
    pub backup_sha256: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrossStoreSaveApplyResult {
    pub game_id: String,
    pub source_label: String,
    pub target_label: String,
    pub source_root: String,
    pub target_root: String,
    pub manifest_path: String,
    pub rollback_manifest_id: String,
    pub file_count: usize,
    pub bytes_copied: u64,
    pub verified_files: usize,
    pub backup_count: usize,
    pub files: Vec<CrossStoreSaveAppliedFile>,
    pub message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrossStoreSaveRollbackRequest {
    pub game_id: String,
    pub target_root: String,
    pub manifest_path: String,
    pub rollback_manifest_id: String,
    pub consent: CrossStoreSaveRollbackConsent,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrossStoreSaveRollbackConsent {
    pub accepted: bool,
    pub operation: String,
    pub target_root: String,
    pub manifest_path: String,
    pub rollback_manifest_id: String,
    pub file_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrossStoreSaveRollbackFile {
    pub id: String,
    pub target_relative_path: String,
    pub action: String,
    pub size_bytes: u64,
    pub sha256: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrossStoreSaveRollbackResult {
    pub game_id: String,
    pub target_root: String,
    pub manifest_path: String,
    pub rollback_manifest_id: String,
    pub restored_files: usize,
    pub deleted_files: usize,
    pub verified_files: usize,
    pub files: Vec<CrossStoreSaveRollbackFile>,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrossStoreSaveLocalE2EProofResult {
    pub proof_id: String,
    pub sandbox_root: String,
    pub source_root: String,
    pub target_root: String,
    pub manifest_path: String,
    pub rollback_manifest_id: String,
    pub applied_files: usize,
    pub rolled_back_files: usize,
    pub restored_files: usize,
    pub deleted_files: usize,
    pub verified_apply_files: usize,
    pub verified_rollback_files: usize,
    pub bytes_copied: u64,
    pub sandbox_cleaned: bool,
    pub provider_transfer_skipped: bool,
    pub supabase_bucket_skipped: bool,
    pub keychain_restore_skipped: bool,
    pub apply: CrossStoreSaveApplyResult,
    pub rollback: CrossStoreSaveRollbackResult,
    pub message: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CrossStoreSaveApplyManifest {
    game_id: String,
    source_label: String,
    target_label: String,
    source_root: String,
    target_root: String,
    rollback_manifest_id: String,
    generated_at_epoch_ms: u128,
    files: Vec<CrossStoreSaveAppliedFile>,
}

struct ResolvedCrossStoreSaveApply {
    game_id: String,
    source_label: String,
    target_label: String,
    source_root: PathBuf,
    target_root: PathBuf,
    actions: Vec<ResolvedCrossStoreSaveApplyAction>,
}

struct ResolvedCrossStoreSaveApplyAction {
    id: String,
    source_relative_path: String,
    target_relative_path: String,
    source_path: PathBuf,
    target_path: PathBuf,
    expected_sha256: Option<String>,
    expected_size_bytes: Option<u64>,
}

struct PreparedCrossStoreSaveApplyFile {
    id: String,
    source_relative_path: String,
    target_relative_path: String,
    source_path: PathBuf,
    target_path: PathBuf,
    source_size_bytes: u64,
    source_sha256: String,
    backup_relative_path: Option<String>,
    backup_size_bytes: Option<u64>,
    backup_sha256: Option<String>,
}

struct PreparedCrossStoreSaveRollbackFile {
    id: String,
    target_relative_path: String,
    target_path: PathBuf,
    backup_path: Option<PathBuf>,
    backup_size_bytes: Option<u64>,
    backup_sha256: Option<String>,
}

#[tauri::command]
pub fn apply_cross_store_save_copy(
    input: CrossStoreSaveApplyRequest,
) -> Result<CrossStoreSaveApplyResult, String> {
    validate_cross_store_save_apply_consent(&input)?;
    let resolved = resolve_cross_store_save_apply(&input)?;
    if resolved.actions.is_empty() {
        return Err("Cross-store save apply requires at least one file action.".to_string());
    }

    let rollback_manifest_id = format!("cross-store-rollback-{}", Uuid::new_v4());
    let backup_root = resolved
        .target_root
        .join(CROSS_STORE_SAVE_BACKUP_DIR)
        .join(&rollback_manifest_id);
    let mut prepared_files = Vec::with_capacity(resolved.actions.len());

    for action in &resolved.actions {
        reject_existing_symlink_components(
            &resolved.source_root,
            &action.source_path,
            "source file path",
        )?;
        reject_existing_symlink_components(
            &resolved.target_root,
            &action.target_path,
            "target file path",
        )?;
        reject_symlink(&action.source_path, "source file")?;
        let source_metadata = fs::metadata(&action.source_path)
            .map_err(|error| format!("Could not inspect cross-store source save: {error}"))?;
        if !source_metadata.is_file() {
            return Err("Cross-store source save action must point to a file.".to_string());
        }
        if let Some(expected_size) = action.expected_size_bytes {
            if source_metadata.len() != expected_size {
                return Err(format!(
                    "Cross-store source size mismatch for {}.",
                    action.source_relative_path
                ));
            }
        }
        let source_sha256 = sha256_file_hex(&action.source_path)?;
        if let Some(expected_sha256) = action.expected_sha256.as_deref() {
            if !expected_sha256.eq_ignore_ascii_case(&source_sha256) {
                return Err(format!(
                    "Cross-store source SHA-256 mismatch for {}.",
                    action.source_relative_path
                ));
            }
        }

        let mut backup_relative_path = None;
        let mut backup_size_bytes = None;
        let mut backup_sha256 = None;
        if action.target_path.exists() {
            reject_symlink(&action.target_path, "target file")?;
            if !action.target_path.is_file() {
                return Err("Cross-store target save action must overwrite a file.".to_string());
            }
            let target_metadata = fs::metadata(&action.target_path)
                .map_err(|error| format!("Could not inspect cross-store target save: {error}"))?;
            backup_relative_path = Some(action.target_relative_path.clone());
            backup_size_bytes = Some(target_metadata.len());
            backup_sha256 = Some(sha256_file_hex(&action.target_path)?);
        }

        prepared_files.push(PreparedCrossStoreSaveApplyFile {
            id: action.id.clone(),
            source_relative_path: action.source_relative_path.clone(),
            target_relative_path: action.target_relative_path.clone(),
            source_path: action.source_path.clone(),
            target_path: action.target_path.clone(),
            source_size_bytes: source_metadata.len(),
            source_sha256,
            backup_relative_path,
            backup_size_bytes,
            backup_sha256,
        });
    }

    fs::create_dir_all(&resolved.target_root)
        .map_err(|error| format!("Could not create cross-store target save folder: {error}"))?;

    let mut result_files = Vec::with_capacity(resolved.actions.len());
    let mut bytes_copied = 0_u64;
    let mut backup_count = 0_usize;

    for file in prepared_files {
        if let Some(backup_relative_path) = file.backup_relative_path.as_deref() {
            let backup_path = safe_join_relative(&backup_root, backup_relative_path)?;
            reject_existing_symlink_components(&resolved.target_root, &backup_path, "backup path")?;
            if let Some(parent) = backup_path.parent() {
                fs::create_dir_all(parent).map_err(|error| {
                    format!("Could not create cross-store rollback folder: {error}")
                })?;
            }
            reject_existing_symlink_components(&resolved.target_root, &backup_path, "backup path")?;
            fs::copy(&file.target_path, &backup_path)
                .map_err(|error| format!("Could not snapshot cross-store target save: {error}"))?;
            let copied_backup_sha256 = sha256_file_hex(&backup_path)?;
            if let Some(expected_backup_sha256) = file.backup_sha256.as_deref() {
                if copied_backup_sha256 != expected_backup_sha256 {
                    return Err(format!(
                        "Cross-store backup SHA-256 mismatch for {}.",
                        backup_relative_path
                    ));
                }
            }
            backup_count += 1;
        }

        if let Some(parent) = file.target_path.parent() {
            reject_existing_symlink_components(
                &resolved.target_root,
                &file.target_path,
                "target file path",
            )?;
            fs::create_dir_all(parent)
                .map_err(|error| format!("Could not create cross-store target folder: {error}"))?;
        }
        reject_existing_symlink_components(
            &resolved.target_root,
            &file.target_path,
            "target file path",
        )?;
        let copied_size = save_mirror::mirror_file(
            &file.source_path,
            &file.target_path,
            &resolved.target_root,
            Some(&file.source_sha256),
            Some(file.source_size_bytes),
        )?;
        bytes_copied = bytes_copied.saturating_add(copied_size);
        result_files.push(CrossStoreSaveAppliedFile {
            id: file.id,
            source_relative_path: file.source_relative_path,
            target_relative_path: file.target_relative_path,
            size_bytes: copied_size,
            sha256: file.source_sha256,
            backed_up: file.backup_relative_path.is_some(),
            backup_relative_path: file.backup_relative_path,
            backup_size_bytes: file.backup_size_bytes,
            backup_sha256: file.backup_sha256,
        });
    }

    let manifest_path = resolved.target_root.join(CROSS_STORE_SAVE_MANIFEST_FILE);
    reject_existing_symlink_components(&resolved.target_root, &manifest_path, "manifest path")?;
    let manifest = CrossStoreSaveApplyManifest {
        game_id: resolved.game_id.clone(),
        source_label: resolved.source_label.clone(),
        target_label: resolved.target_label.clone(),
        source_root: path_to_string(&resolved.source_root),
        target_root: path_to_string(&resolved.target_root),
        rollback_manifest_id: rollback_manifest_id.clone(),
        generated_at_epoch_ms: current_epoch_ms(),
        files: result_files.clone(),
    };
    write_json_file(&manifest_path, &manifest)?;

    Ok(CrossStoreSaveApplyResult {
        game_id: resolved.game_id,
        source_label: resolved.source_label,
        target_label: resolved.target_label,
        source_root: path_to_string(&resolved.source_root),
        target_root: path_to_string(&resolved.target_root),
        manifest_path: path_to_string(&manifest_path),
        rollback_manifest_id,
        file_count: result_files.len(),
        bytes_copied,
        verified_files: result_files.len(),
        backup_count,
        files: result_files,
        message:
            "Cross-store native save copy completed with target snapshot and hash verification."
                .to_string(),
    })
}

#[tauri::command]
pub fn rollback_cross_store_save_copy(
    input: CrossStoreSaveRollbackRequest,
) -> Result<CrossStoreSaveRollbackResult, String> {
    validate_cross_store_save_rollback_consent(&input)?;
    let target_root = canonical_existing_dir(&input.target_root, "target root")?;
    let manifest_path = canonical_manifest_path(&input.manifest_path, &target_root)?;
    let manifest: CrossStoreSaveApplyManifest = read_json_file(&manifest_path)?;

    if manifest.game_id != input.game_id.trim() {
        return Err("Cross-store rollback manifest game mismatch.".to_string());
    }
    if manifest.rollback_manifest_id != input.rollback_manifest_id {
        return Err("Cross-store rollback manifest ID mismatch.".to_string());
    }
    if manifest.files.len() != input.consent.file_count {
        return Err("Cross-store rollback consent file count mismatch.".to_string());
    }
    let manifest_target_root =
        canonical_existing_dir(&manifest.target_root, "manifest target root")?;
    if manifest_target_root != target_root {
        return Err("Cross-store rollback target root mismatch.".to_string());
    }

    let backup_root = target_root
        .join(CROSS_STORE_SAVE_BACKUP_DIR)
        .join(&manifest.rollback_manifest_id);
    let mut prepared_files = Vec::with_capacity(manifest.files.len());

    for file in &manifest.files {
        let target_relative_path = normalize_relative_path(&file.target_relative_path)?;
        let target_path = safe_join_relative(&target_root, &target_relative_path)?;
        reject_existing_symlink_components(&target_root, &target_path, "rollback target path")?;
        if target_path.exists() {
            reject_symlink(&target_path, "rollback target file")?;
            if !target_path.is_file() {
                return Err("Cross-store rollback target must be a file.".to_string());
            }
            let current_sha256 = sha256_file_hex(&target_path)?;
            if !current_sha256.eq_ignore_ascii_case(&file.sha256) {
                return Err(format!(
                    "Cross-store rollback target changed after apply for {}.",
                    target_relative_path
                ));
            }
        }

        let mut backup_path = None;
        let mut backup_size_bytes = None;
        let mut backup_sha256 = None;
        if file.backed_up {
            let backup_relative_path = file.backup_relative_path.as_deref().ok_or_else(|| {
                "Cross-store rollback manifest is missing a backup path.".to_string()
            })?;
            let resolved_backup_path = safe_join_relative(&backup_root, backup_relative_path)?;
            reject_existing_symlink_components(
                &target_root,
                &resolved_backup_path,
                "rollback backup path",
            )?;
            reject_symlink(&resolved_backup_path, "rollback backup file")?;
            let backup_metadata = fs::metadata(&resolved_backup_path).map_err(|error| {
                format!("Could not inspect cross-store rollback backup: {error}")
            })?;
            if !backup_metadata.is_file() {
                return Err("Cross-store rollback backup must be a file.".to_string());
            }
            if let Some(expected_size) = file.backup_size_bytes {
                if backup_metadata.len() != expected_size {
                    return Err(format!(
                        "Cross-store rollback backup size mismatch for {}.",
                        backup_relative_path
                    ));
                }
            }
            let resolved_backup_sha256 = sha256_file_hex(&resolved_backup_path)?;
            if let Some(expected_sha256) = file.backup_sha256.as_deref() {
                if !expected_sha256.eq_ignore_ascii_case(&resolved_backup_sha256) {
                    return Err(format!(
                        "Cross-store rollback backup SHA-256 mismatch for {}.",
                        backup_relative_path
                    ));
                }
            }
            backup_path = Some(resolved_backup_path);
            backup_size_bytes = Some(backup_metadata.len());
            backup_sha256 = Some(resolved_backup_sha256);
        }

        prepared_files.push(PreparedCrossStoreSaveRollbackFile {
            id: file.id.clone(),
            target_relative_path,
            target_path,
            backup_path,
            backup_size_bytes,
            backup_sha256,
        });
    }

    let mut files = Vec::with_capacity(prepared_files.len());
    let mut restored_files = 0_usize;
    let mut deleted_files = 0_usize;
    let mut verified_files = 0_usize;

    for file in prepared_files {
        if let Some(backup_path) = file.backup_path {
            if let Some(parent) = file.target_path.parent() {
                reject_existing_symlink_components(
                    &target_root,
                    &file.target_path,
                    "rollback target path",
                )?;
                fs::create_dir_all(parent).map_err(|error| {
                    format!("Could not create cross-store rollback target folder: {error}")
                })?;
            }
            reject_existing_symlink_components(
                &target_root,
                &file.target_path,
                "rollback target path",
            )?;
            fs::copy(&backup_path, &file.target_path).map_err(|error| {
                format!("Could not restore cross-store rollback backup: {error}")
            })?;
            let restored_sha256 = sha256_file_hex(&file.target_path)?;
            let backup_sha256 = file.backup_sha256.ok_or_else(|| {
                "Cross-store rollback prepared backup hash is missing.".to_string()
            })?;
            if restored_sha256 != backup_sha256 {
                return Err(format!(
                    "Cross-store rollback post-restore SHA-256 mismatch for {}.",
                    file.target_relative_path
                ));
            }
            restored_files += 1;
            verified_files += 1;
            files.push(CrossStoreSaveRollbackFile {
                id: file.id,
                target_relative_path: file.target_relative_path,
                action: "restored_backup".to_string(),
                size_bytes: file.backup_size_bytes.unwrap_or(0),
                sha256: Some(restored_sha256),
            });
        } else {
            reject_existing_symlink_components(
                &target_root,
                &file.target_path,
                "rollback target path",
            )?;
            if file.target_path.exists() {
                fs::remove_file(&file.target_path).map_err(|error| {
                    format!("Could not delete cross-store copied save: {error}")
                })?;
                deleted_files += 1;
            }
            verified_files += 1;
            files.push(CrossStoreSaveRollbackFile {
                id: file.id,
                target_relative_path: file.target_relative_path,
                action: "deleted_created_file".to_string(),
                size_bytes: 0,
                sha256: None,
            });
        }
    }

    Ok(CrossStoreSaveRollbackResult {
        game_id: manifest.game_id,
        target_root: path_to_string(&target_root),
        manifest_path: path_to_string(&manifest_path),
        rollback_manifest_id: manifest.rollback_manifest_id,
        restored_files,
        deleted_files,
        verified_files,
        files,
        message:
            "Cross-store native save rollback restored snapshots and removed new copied files."
                .to_string(),
    })
}

#[tauri::command]
pub fn prove_cross_store_save_local_e2e() -> Result<CrossStoreSaveLocalE2EProofResult, String> {
    let proof_id = format!("cross-store-local-e2e-{}", Uuid::new_v4());
    let sandbox_root = std::env::temp_dir().join(&proof_id);
    let source_root = sandbox_root.join("steam-save-root");
    let target_root = sandbox_root.join("gog-save-root");

    fs::create_dir_all(&source_root)
        .map_err(|error| format!("Could not create cross-store E2E source sandbox: {error}"))?;
    fs::create_dir_all(&target_root)
        .map_err(|error| format!("Could not create cross-store E2E target sandbox: {error}"))?;

    let run_result = (|| -> Result<CrossStoreSaveLocalE2EProofResult, String> {
        let profile_source = b"new-profile-save";
        let settings_source = b"{\"graphics\":\"high\"}";
        let profile_original = b"old-profile-save";
        fs::write(source_root.join("profile.sav"), profile_source)
            .map_err(|error| format!("Could not seed cross-store E2E source profile: {error}"))?;
        fs::create_dir_all(source_root.join("slot-a"))
            .map_err(|error| format!("Could not seed cross-store E2E source folder: {error}"))?;
        fs::write(source_root.join("slot-a/settings.json"), settings_source)
            .map_err(|error| format!("Could not seed cross-store E2E source settings: {error}"))?;
        fs::write(target_root.join("profile.sav"), profile_original)
            .map_err(|error| format!("Could not seed cross-store E2E target profile: {error}"))?;

        let source_root_string = path_to_string(&source_root);
        let target_root_string = path_to_string(&target_root);
        let apply = apply_cross_store_save_copy(CrossStoreSaveApplyRequest {
            actions: vec![
                CrossStoreSaveApplyAction {
                    expected_sha256: Some(sha256_file_hex(&source_root.join("profile.sav"))?),
                    expected_size_bytes: Some(profile_source.len() as u64),
                    id: "profile".to_string(),
                    source_relative_path: "profile.sav".to_string(),
                    target_relative_path: "profile.sav".to_string(),
                },
                CrossStoreSaveApplyAction {
                    expected_sha256: Some(sha256_file_hex(
                        &source_root.join("slot-a/settings.json"),
                    )?),
                    expected_size_bytes: Some(settings_source.len() as u64),
                    id: "settings".to_string(),
                    source_relative_path: "slot-a/settings.json".to_string(),
                    target_relative_path: "slot-a/settings.json".to_string(),
                },
            ],
            consent: CrossStoreSaveApplyConsent {
                accepted: true,
                action_count: 2,
                operation: CROSS_STORE_SAVE_APPLY_OPERATION.to_string(),
                source_root: source_root_string.clone(),
                target_root: target_root_string.clone(),
            },
            game_id: "cross-store-local-e2e".to_string(),
            source_label: "Steam Sandbox".to_string(),
            source_root: source_root_string,
            target_label: "GOG Sandbox".to_string(),
            target_root: target_root_string.clone(),
        })?;

        if apply.file_count != 2 || apply.verified_files != 2 || apply.backup_count != 1 {
            return Err("Cross-store E2E apply proof did not verify expected files.".to_string());
        }
        if fs::read(target_root.join("profile.sav"))
            .map_err(|error| format!("Could not verify cross-store E2E profile copy: {error}"))?
            != profile_source
        {
            return Err("Cross-store E2E profile copy did not match source.".to_string());
        }
        if fs::read(target_root.join("slot-a/settings.json"))
            .map_err(|error| format!("Could not verify cross-store E2E settings copy: {error}"))?
            != settings_source
        {
            return Err("Cross-store E2E created file did not match source.".to_string());
        }
        if !PathBuf::from(&apply.manifest_path).exists() {
            return Err("Cross-store E2E apply manifest was not written.".to_string());
        }

        let rollback = rollback_cross_store_save_copy(CrossStoreSaveRollbackRequest {
            consent: CrossStoreSaveRollbackConsent {
                accepted: true,
                file_count: apply.file_count,
                manifest_path: apply.manifest_path.clone(),
                operation: CROSS_STORE_SAVE_ROLLBACK_OPERATION.to_string(),
                rollback_manifest_id: apply.rollback_manifest_id.clone(),
                target_root: target_root_string.clone(),
            },
            game_id: apply.game_id.clone(),
            manifest_path: apply.manifest_path.clone(),
            rollback_manifest_id: apply.rollback_manifest_id.clone(),
            target_root: target_root_string,
        })?;

        if rollback.restored_files != 1
            || rollback.deleted_files != 1
            || rollback.verified_files != 2
        {
            return Err(
                "Cross-store E2E rollback proof did not restore/delete expected files.".to_string(),
            );
        }
        if fs::read(target_root.join("profile.sav")).map_err(|error| {
            format!("Could not verify cross-store E2E profile rollback: {error}")
        })? != profile_original
        {
            return Err(
                "Cross-store E2E rollback did not restore the original profile.".to_string(),
            );
        }
        if target_root.join("slot-a/settings.json").exists() {
            return Err(
                "Cross-store E2E rollback did not delete the created settings file.".to_string(),
            );
        }

        Ok(CrossStoreSaveLocalE2EProofResult {
            applied_files: apply.file_count,
            rolled_back_files: rollback.files.len(),
            restored_files: rollback.restored_files,
            deleted_files: rollback.deleted_files,
            verified_apply_files: apply.verified_files,
            verified_rollback_files: rollback.verified_files,
            bytes_copied: apply.bytes_copied,
            manifest_path: apply.manifest_path.clone(),
            rollback_manifest_id: apply.rollback_manifest_id.clone(),
            proof_id: proof_id.clone(),
            sandbox_root: path_to_string(&sandbox_root),
            source_root: path_to_string(&source_root),
            target_root: path_to_string(&target_root),
            sandbox_cleaned: false,
            provider_transfer_skipped: true,
            supabase_bucket_skipped: true,
            keychain_restore_skipped: true,
            apply,
            rollback,
            message: "Cross-store local E2E sandbox copied, verified, rolled back, and cleaned up without provider cloud, Supabase bucket, or keychain access.".to_string(),
        })
    })();

    match run_result {
        Ok(mut result) => {
            fs::remove_dir_all(&sandbox_root)
                .map_err(|error| format!("Could not clean cross-store E2E sandbox: {error}"))?;
            result.sandbox_cleaned = !sandbox_root.exists();
            if !result.sandbox_cleaned {
                return Err(
                    "Cross-store E2E sandbox cleanup did not remove the temp folder.".to_string(),
                );
            }
            Ok(result)
        }
        Err(error) => {
            let _ = fs::remove_dir_all(&sandbox_root);
            Err(error)
        }
    }
}

fn validate_cross_store_save_rollback_consent(
    input: &CrossStoreSaveRollbackRequest,
) -> Result<(), String> {
    if !input.consent.accepted {
        return Err("Cross-store save rollback requires explicit consent.".to_string());
    }
    if input.consent.operation != CROSS_STORE_SAVE_ROLLBACK_OPERATION {
        return Err("Cross-store save rollback consent operation mismatch.".to_string());
    }
    if input.consent.target_root.trim() != input.target_root.trim() {
        return Err("Cross-store save rollback consent target mismatch.".to_string());
    }
    if input.consent.manifest_path.trim() != input.manifest_path.trim() {
        return Err("Cross-store save rollback consent manifest mismatch.".to_string());
    }
    if input.consent.rollback_manifest_id.trim() != input.rollback_manifest_id.trim() {
        return Err("Cross-store save rollback consent manifest ID mismatch.".to_string());
    }
    Ok(())
}

fn validate_cross_store_save_apply_consent(
    input: &CrossStoreSaveApplyRequest,
) -> Result<(), String> {
    if !input.consent.accepted {
        return Err("Cross-store save copy requires explicit consent.".to_string());
    }
    if input.consent.operation != CROSS_STORE_SAVE_APPLY_OPERATION {
        return Err("Cross-store save copy consent operation mismatch.".to_string());
    }
    if input.consent.source_root.trim() != input.source_root.trim() {
        return Err("Cross-store save copy consent source mismatch.".to_string());
    }
    if input.consent.target_root.trim() != input.target_root.trim() {
        return Err("Cross-store save copy consent target mismatch.".to_string());
    }
    if input.consent.action_count != input.actions.len() {
        return Err("Cross-store save copy consent action count mismatch.".to_string());
    }
    Ok(())
}

fn resolve_cross_store_save_apply(
    input: &CrossStoreSaveApplyRequest,
) -> Result<ResolvedCrossStoreSaveApply, String> {
    let game_id = input.game_id.trim();
    if game_id.is_empty() {
        return Err("Cross-store game ID must not be empty.".to_string());
    }
    let source_label = input.source_label.trim();
    let target_label = input.target_label.trim();
    if source_label.is_empty() || target_label.is_empty() {
        return Err("Cross-store source and target labels must not be empty.".to_string());
    }

    let source_root = canonical_existing_dir(&input.source_root, "source root")?;
    let target_root = canonical_target_dir(&input.target_root)?;
    if target_root.starts_with(&source_root) {
        return Err("Cross-store target root must not be inside source root.".to_string());
    }
    if source_root.starts_with(&target_root) {
        return Err("Cross-store source root must not be inside target root.".to_string());
    }

    let mut actions = Vec::with_capacity(input.actions.len());
    let mut target_relative_paths = HashSet::with_capacity(input.actions.len());
    for action in &input.actions {
        let id = action.id.trim();
        if id.is_empty() {
            return Err("Cross-store save action ID must not be empty.".to_string());
        }
        let source_relative_path = normalize_relative_path(&action.source_relative_path)?;
        let target_relative_path = normalize_relative_path(&action.target_relative_path)?;
        if !target_relative_paths.insert(target_relative_path.clone()) {
            return Err(format!(
                "Cross-store save copy contains duplicate target path {}.",
                target_relative_path
            ));
        }
        let source_path = safe_join_relative(&source_root, &source_relative_path)?;
        let target_path = safe_join_relative(&target_root, &target_relative_path)?;
        let expected_sha256 = action
            .expected_sha256
            .as_deref()
            .map(normalize_sha256)
            .transpose()?;
        actions.push(ResolvedCrossStoreSaveApplyAction {
            id: id.to_string(),
            source_relative_path,
            target_relative_path,
            source_path,
            target_path,
            expected_sha256,
            expected_size_bytes: action.expected_size_bytes,
        });
    }

    Ok(ResolvedCrossStoreSaveApply {
        game_id: game_id.to_string(),
        source_label: source_label.to_string(),
        target_label: target_label.to_string(),
        source_root,
        target_root,
        actions,
    })
}

fn canonical_existing_dir(value: &str, label: &str) -> Result<PathBuf, String> {
    let path = raw_absolute_path(value, label)?;
    reject_symlink(&path, label)?;
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("Could not read cross-store {label}: {error}"))?;
    if !canonical.is_dir() {
        return Err(format!("Cross-store {label} must be a folder."));
    }
    Ok(canonical)
}

fn canonical_target_dir(value: &str) -> Result<PathBuf, String> {
    let path = raw_absolute_path(value, "target root")?;
    if path_is_root(&path) {
        return Err("Cross-store target root must not be a filesystem root.".to_string());
    }
    if path.exists() {
        reject_symlink(&path, "target root")?;
        let canonical = path
            .canonicalize()
            .map_err(|error| format!("Could not read cross-store target root: {error}"))?;
        if !canonical.is_dir() {
            return Err("Cross-store target root must be a folder.".to_string());
        }
        return Ok(canonical);
    }

    let parent = path
        .parent()
        .ok_or_else(|| "Cross-store target root must have a parent folder.".to_string())?;
    let parent = parent
        .canonicalize()
        .map_err(|error| format!("Could not read cross-store target parent: {error}"))?;
    let name = path
        .file_name()
        .ok_or_else(|| "Cross-store target root must include a folder name.".to_string())?;
    Ok(parent.join(name))
}

fn canonical_manifest_path(value: &str, target_root: &Path) -> Result<PathBuf, String> {
    let path = raw_absolute_path(value, "manifest path")?;
    reject_symlink(&path, "manifest path")?;
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("Could not read cross-store rollback manifest: {error}"))?;
    if !canonical.is_file() {
        return Err("Cross-store rollback manifest path must be a file.".to_string());
    }
    if !canonical.starts_with(target_root) {
        return Err("Cross-store rollback manifest must stay inside target root.".to_string());
    }
    if canonical
        .file_name()
        .and_then(|value| value.to_str())
        .is_none_or(|file_name| file_name != CROSS_STORE_SAVE_MANIFEST_FILE)
    {
        return Err("Cross-store rollback manifest file name is not recognized.".to_string());
    }
    Ok(canonical)
}

fn raw_absolute_path(value: &str, label: &str) -> Result<PathBuf, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("Cross-store {label} must not be empty."));
    }
    let path = PathBuf::from(trimmed);
    if !path.is_absolute() {
        return Err(format!("Cross-store {label} must be absolute."));
    }
    if path
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        return Err(format!(
            "Cross-store {label} must not contain parent traversal segments."
        ));
    }
    Ok(path)
}

fn normalize_relative_path(value: &str) -> Result<String, String> {
    let trimmed = value.trim().replace('\\', "/");
    if trimmed.is_empty() {
        return Err("Cross-store relative save path must not be empty.".to_string());
    }
    let path = Path::new(&trimmed);
    if path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::Prefix(_) | Component::RootDir | Component::ParentDir
            )
        })
    {
        return Err("Cross-store relative save paths must stay inside their roots.".to_string());
    }
    let normalized = path
        .components()
        .filter_map(|component| match component {
            Component::Normal(value) => Some(value.to_string_lossy().to_string()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/");
    if normalized.trim().is_empty() {
        return Err("Cross-store relative save path must not be empty.".to_string());
    }
    Ok(normalized)
}

fn safe_join_relative(root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let relative_path = normalize_relative_path(relative_path)?;
    Ok(relative_path
        .split('/')
        .fold(root.to_path_buf(), |path, segment| path.join(segment)))
}

fn normalize_sha256(value: &str) -> Result<String, String> {
    let trimmed = value.trim().to_ascii_lowercase();
    if trimmed.len() != 64
        || !trimmed
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
        return Err("Cross-store expected SHA-256 must be a 64-character hex digest.".to_string());
    }
    Ok(trimmed)
}

fn reject_symlink(path: &Path, label: &str) -> Result<(), String> {
    if fs::symlink_metadata(path)
        .map_err(|error| format!("Could not inspect cross-store {label}: {error}"))?
        .file_type()
        .is_symlink()
    {
        return Err(format!("Cross-store {label} must not be a symbolic link."));
    }
    Ok(())
}

fn reject_existing_symlink_components(root: &Path, path: &Path, label: &str) -> Result<(), String> {
    if path == root {
        return Ok(());
    }
    if !path.starts_with(root) {
        return Err(format!(
            "Cross-store {label} must stay inside its cross-store root."
        ));
    }

    let relative = path
        .strip_prefix(root)
        .map_err(|_| format!("Cross-store {label} must stay inside its cross-store root."))?;
    let mut current = root.to_path_buf();
    for component in relative.components() {
        let Component::Normal(part) = component else {
            return Err(format!("Cross-store {label} path is invalid."));
        };
        current.push(part);
        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(format!(
                    "Cross-store {label} must not contain symbolic links."
                ));
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(error) => {
                return Err(format!("Could not inspect cross-store {label}: {error}"));
            }
        }
    }
    Ok(())
}

fn path_is_root(path: &Path) -> bool {
    path.components()
        .all(|component| !matches!(component, Component::Normal(_)))
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn current_epoch_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn write_json_file<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let json = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("Could not encode cross-store manifest: {error}"))?;
    fs::write(path, json).map_err(|error| format!("Could not write cross-store manifest: {error}"))
}

fn read_json_file<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T, String> {
    let bytes =
        fs::read(path).map_err(|error| format!("Could not read cross-store manifest: {error}"))?;
    serde_json::from_slice(&bytes)
        .map_err(|error| format!("Could not decode cross-store manifest: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn temp_test_dir(label: &str) -> PathBuf {
        let path = env::temp_dir().join(format!("og-cross-store-{label}-{}", Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn request(source_root: &Path, target_root: &Path) -> CrossStoreSaveApplyRequest {
        let source_root_string = path_to_string(source_root);
        let target_root_string = path_to_string(target_root);
        CrossStoreSaveApplyRequest {
            actions: vec![CrossStoreSaveApplyAction {
                expected_sha256: None,
                expected_size_bytes: Some(12),
                id: "profile".to_string(),
                source_relative_path: "profile.sav".to_string(),
                target_relative_path: "profile.sav".to_string(),
            }],
            consent: CrossStoreSaveApplyConsent {
                accepted: true,
                action_count: 1,
                operation: CROSS_STORE_SAVE_APPLY_OPERATION.to_string(),
                source_root: source_root_string.clone(),
                target_root: target_root_string.clone(),
            },
            game_id: "mech-arcade".to_string(),
            source_label: "Steam".to_string(),
            source_root: source_root_string,
            target_label: "GOG".to_string(),
            target_root: target_root_string,
        }
    }

    fn rollback_request(
        target_root: &Path,
        result: &CrossStoreSaveApplyResult,
    ) -> CrossStoreSaveRollbackRequest {
        let target_root_string = path_to_string(target_root);
        CrossStoreSaveRollbackRequest {
            consent: CrossStoreSaveRollbackConsent {
                accepted: true,
                file_count: result.file_count,
                manifest_path: result.manifest_path.clone(),
                operation: CROSS_STORE_SAVE_ROLLBACK_OPERATION.to_string(),
                rollback_manifest_id: result.rollback_manifest_id.clone(),
                target_root: target_root_string.clone(),
            },
            game_id: result.game_id.clone(),
            manifest_path: result.manifest_path.clone(),
            rollback_manifest_id: result.rollback_manifest_id.clone(),
            target_root: target_root_string,
        }
    }

    #[test]
    fn apply_cross_store_save_copy_copies_hashes_and_writes_manifest() {
        let root = temp_test_dir("copy");
        let source = root.join("steam");
        let target = root.join("gog");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("profile.sav"), b"new-save-123").unwrap();

        let result = apply_cross_store_save_copy(request(&source, &target)).unwrap();

        assert_eq!(result.file_count, 1);
        assert_eq!(result.verified_files, 1);
        assert_eq!(result.bytes_copied, 12);
        assert_eq!(result.backup_count, 0);
        assert!(target.join("profile.sav").exists());
        assert!(target.join(CROSS_STORE_SAVE_MANIFEST_FILE).exists());
        assert_eq!(result.files[0].sha256.len(), 64);
        assert_eq!(result.files[0].backup_sha256, None);
        let manifest: CrossStoreSaveApplyManifest =
            read_json_file(&PathBuf::from(&result.manifest_path)).unwrap();
        assert_eq!(manifest.game_id, "mech-arcade");
        assert_eq!(manifest.source_label, "Steam");
        assert_eq!(manifest.target_label, "GOG");
        assert_eq!(manifest.source_root, result.source_root);
        assert_eq!(manifest.target_root, result.target_root);
        assert_eq!(manifest.rollback_manifest_id, result.rollback_manifest_id);
        assert_eq!(manifest.files.len(), 1);
        assert_eq!(manifest.files[0].id, "profile");
        assert_eq!(manifest.files[0].source_relative_path, "profile.sav");
        assert_eq!(manifest.files[0].target_relative_path, "profile.sav");
        assert_eq!(manifest.files[0].size_bytes, 12);
        assert_eq!(manifest.files[0].sha256, result.files[0].sha256);
        assert!(!manifest.files[0].backed_up);
        assert_eq!(manifest.files[0].backup_relative_path, None);
        assert_eq!(manifest.files[0].backup_size_bytes, None);
        assert_eq!(manifest.files[0].backup_sha256, None);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn apply_cross_store_save_copy_snapshots_existing_target_before_overwrite() {
        let root = temp_test_dir("backup");
        let source = root.join("steam");
        let target = root.join("gog");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(source.join("profile.sav"), b"new-save-123").unwrap();
        fs::write(target.join("profile.sav"), b"old-save").unwrap();

        let result = apply_cross_store_save_copy(request(&source, &target)).unwrap();

        assert_eq!(result.backup_count, 1);
        assert_eq!(
            result.files[0].backup_relative_path.as_deref(),
            Some("profile.sav")
        );
        assert_eq!(result.files[0].backup_size_bytes, Some(8));
        assert_eq!(result.files[0].backup_sha256.as_deref().unwrap().len(), 64);
        let backup_path = target
            .join(CROSS_STORE_SAVE_BACKUP_DIR)
            .join(&result.rollback_manifest_id)
            .join("profile.sav");
        assert_eq!(fs::read(backup_path).unwrap(), b"old-save");
        assert_eq!(
            fs::read(target.join("profile.sav")).unwrap(),
            b"new-save-123"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rollback_cross_store_save_copy_restores_backups_and_deletes_created_files() {
        let root = temp_test_dir("rollback");
        let source = root.join("steam");
        let target = root.join("gog");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(source.join("profile.sav"), b"new-save-123").unwrap();
        fs::write(source.join("settings.json"), b"{\"new\":true}").unwrap();
        fs::write(target.join("profile.sav"), b"old-save").unwrap();
        let mut input = request(&source, &target);
        input.actions.push(CrossStoreSaveApplyAction {
            expected_sha256: None,
            expected_size_bytes: Some(12),
            id: "settings".to_string(),
            source_relative_path: "settings.json".to_string(),
            target_relative_path: "settings.json".to_string(),
        });
        input.consent.action_count = 2;

        let apply = apply_cross_store_save_copy(input).unwrap();
        let rollback = rollback_cross_store_save_copy(rollback_request(&target, &apply)).unwrap();

        assert_eq!(rollback.restored_files, 1);
        assert_eq!(rollback.deleted_files, 1);
        assert_eq!(rollback.verified_files, 2);
        assert_eq!(fs::read(target.join("profile.sav")).unwrap(), b"old-save");
        assert!(!target.join("settings.json").exists());
        assert!(rollback
            .files
            .iter()
            .any(|file| file.action == "restored_backup"));
        assert!(rollback
            .files
            .iter()
            .any(|file| file.action == "deleted_created_file"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rollback_cross_store_save_copy_handles_nested_overwrite_and_created_files() {
        let root = temp_test_dir("nested-rollback");
        let source = root.join("steam");
        let target = root.join("gog");
        fs::create_dir_all(source.join("slot-a/config")).unwrap();
        fs::create_dir_all(target.join("slot-a")).unwrap();
        fs::write(source.join("slot-a/profile.sav"), b"profile-v2").unwrap();
        fs::write(
            source.join("slot-a/config/settings.json"),
            b"{\"new\":true}",
        )
        .unwrap();
        fs::write(target.join("slot-a/profile.sav"), b"profile-v1").unwrap();
        let source_root_string = path_to_string(&source);
        let target_root_string = path_to_string(&target);
        let apply = apply_cross_store_save_copy(CrossStoreSaveApplyRequest {
            actions: vec![
                CrossStoreSaveApplyAction {
                    expected_sha256: Some(
                        sha256_file_hex(&source.join("slot-a/profile.sav")).unwrap(),
                    ),
                    expected_size_bytes: Some(10),
                    id: "slot-a-profile".to_string(),
                    source_relative_path: "slot-a/profile.sav".to_string(),
                    target_relative_path: "slot-a/profile.sav".to_string(),
                },
                CrossStoreSaveApplyAction {
                    expected_sha256: Some(
                        sha256_file_hex(&source.join("slot-a/config/settings.json")).unwrap(),
                    ),
                    expected_size_bytes: Some(12),
                    id: "slot-a-settings".to_string(),
                    source_relative_path: "slot-a/config/settings.json".to_string(),
                    target_relative_path: "slot-a/config/settings.json".to_string(),
                },
            ],
            consent: CrossStoreSaveApplyConsent {
                accepted: true,
                action_count: 2,
                operation: CROSS_STORE_SAVE_APPLY_OPERATION.to_string(),
                source_root: source_root_string.clone(),
                target_root: target_root_string.clone(),
            },
            game_id: "mech-arcade".to_string(),
            source_label: "Steam".to_string(),
            source_root: source_root_string,
            target_label: "GOG".to_string(),
            target_root: target_root_string,
        })
        .unwrap();

        assert_eq!(apply.file_count, 2);
        assert_eq!(apply.backup_count, 1);
        assert_eq!(apply.verified_files, 2);
        assert_eq!(apply.bytes_copied, 22);
        assert_eq!(
            fs::read(target.join("slot-a/profile.sav")).unwrap(),
            b"profile-v2"
        );
        assert_eq!(
            fs::read(target.join("slot-a/config/settings.json")).unwrap(),
            b"{\"new\":true}"
        );
        let backup_path = target
            .join(CROSS_STORE_SAVE_BACKUP_DIR)
            .join(&apply.rollback_manifest_id)
            .join("slot-a/profile.sav");
        assert_eq!(fs::read(backup_path).unwrap(), b"profile-v1");

        let rollback = rollback_cross_store_save_copy(rollback_request(&target, &apply)).unwrap();

        assert_eq!(rollback.restored_files, 1);
        assert_eq!(rollback.deleted_files, 1);
        assert_eq!(rollback.verified_files, 2);
        assert_eq!(
            fs::read(target.join("slot-a/profile.sav")).unwrap(),
            b"profile-v1"
        );
        assert!(!target.join("slot-a/config/settings.json").exists());
        assert!(rollback.files.iter().any(|file| {
            file.action == "restored_backup" && file.target_relative_path == "slot-a/profile.sav"
        }));
        assert!(rollback.files.iter().any(|file| {
            file.action == "deleted_created_file"
                && file.target_relative_path == "slot-a/config/settings.json"
        }));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn prove_cross_store_save_local_e2e_applies_rolls_back_and_cleans_sandbox() {
        let result = prove_cross_store_save_local_e2e().unwrap();

        assert_eq!(result.applied_files, 2);
        assert_eq!(result.rolled_back_files, 2);
        assert_eq!(result.restored_files, 1);
        assert_eq!(result.deleted_files, 1);
        assert_eq!(result.verified_apply_files, 2);
        assert_eq!(result.verified_rollback_files, 2);
        assert!(result.bytes_copied > 0);
        assert!(result.provider_transfer_skipped);
        assert!(result.supabase_bucket_skipped);
        assert!(result.keychain_restore_skipped);
        assert!(result.sandbox_cleaned);
        assert!(!PathBuf::from(result.sandbox_root).exists());
    }

    #[test]
    fn rollback_cross_store_save_copy_requires_matching_consent() {
        let root = temp_test_dir("rollback-consent");
        let source = root.join("steam");
        let target = root.join("gog");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("profile.sav"), b"new-save-123").unwrap();
        let apply = apply_cross_store_save_copy(request(&source, &target)).unwrap();
        let mut input = rollback_request(&target, &apply);
        input.consent.rollback_manifest_id = "other".to_string();

        let error = rollback_cross_store_save_copy(input).unwrap_err();

        assert!(error.contains("manifest ID mismatch"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rollback_cross_store_save_copy_rejects_manifest_outside_target_root() {
        let root = temp_test_dir("rollback-manifest-outside");
        let source = root.join("steam");
        let target = root.join("gog");
        let outside = root.join("outside");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(source.join("profile.sav"), b"new-save-123").unwrap();
        let apply = apply_cross_store_save_copy(request(&source, &target)).unwrap();
        let outside_manifest = outside.join(CROSS_STORE_SAVE_MANIFEST_FILE);
        fs::copy(&apply.manifest_path, &outside_manifest).unwrap();
        let mut input = rollback_request(&target, &apply);
        input.manifest_path = path_to_string(&outside_manifest);
        input.consent.manifest_path = input.manifest_path.clone();

        let error = rollback_cross_store_save_copy(input).unwrap_err();

        assert!(error.contains("must stay inside target root"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rollback_cross_store_save_copy_rejects_wrong_manifest_filename() {
        let root = temp_test_dir("rollback-manifest-name");
        let source = root.join("steam");
        let target = root.join("gog");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("profile.sav"), b"new-save-123").unwrap();
        let apply = apply_cross_store_save_copy(request(&source, &target)).unwrap();
        let wrong_manifest = target.join("wrong-manifest.json");
        fs::copy(&apply.manifest_path, &wrong_manifest).unwrap();
        let mut input = rollback_request(&target, &apply);
        input.manifest_path = path_to_string(&wrong_manifest);
        input.consent.manifest_path = input.manifest_path.clone();

        let error = rollback_cross_store_save_copy(input).unwrap_err();

        assert!(error.contains("file name is not recognized"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rollback_cross_store_save_copy_blocks_changed_target_after_apply() {
        let root = temp_test_dir("rollback-changed");
        let source = root.join("steam");
        let target = root.join("gog");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(source.join("profile.sav"), b"new-save-123").unwrap();
        fs::write(target.join("profile.sav"), b"old-save").unwrap();
        let apply = apply_cross_store_save_copy(request(&source, &target)).unwrap();
        fs::write(target.join("profile.sav"), b"user-edited").unwrap();

        let error = rollback_cross_store_save_copy(rollback_request(&target, &apply)).unwrap_err();

        assert!(error.contains("target changed after apply"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rollback_cross_store_save_copy_blocks_changed_target_before_any_mutation() {
        let root = temp_test_dir("rollback-changed-preflight");
        let source = root.join("steam");
        let target = root.join("gog");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(source.join("profile.sav"), b"new-save-123").unwrap();
        fs::write(source.join("settings.json"), b"{\"new\":true}").unwrap();
        fs::write(target.join("profile.sav"), b"old-save").unwrap();
        let mut input = request(&source, &target);
        input.actions.push(CrossStoreSaveApplyAction {
            expected_sha256: None,
            expected_size_bytes: Some(12),
            id: "settings".to_string(),
            source_relative_path: "settings.json".to_string(),
            target_relative_path: "settings.json".to_string(),
        });
        input.consent.action_count = 2;
        let apply = apply_cross_store_save_copy(input).unwrap();
        fs::write(target.join("settings.json"), b"user-edited").unwrap();

        let error = rollback_cross_store_save_copy(rollback_request(&target, &apply)).unwrap_err();

        assert!(error.contains("target changed after apply"));
        assert_eq!(
            fs::read(target.join("profile.sav")).unwrap(),
            b"new-save-123"
        );
        assert_eq!(
            fs::read(target.join("settings.json")).unwrap(),
            b"user-edited"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn apply_cross_store_save_copy_requires_matching_consent() {
        let root = temp_test_dir("consent");
        let source = root.join("steam");
        let target = root.join("gog");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("profile.sav"), b"new-save-123").unwrap();
        let mut input = request(&source, &target);
        input.consent.action_count = 2;

        let error = apply_cross_store_save_copy(input).unwrap_err();

        assert!(error.contains("action count mismatch"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn apply_cross_store_save_copy_rejects_relative_path_traversal() {
        let root = temp_test_dir("traversal");
        let source = root.join("steam");
        let target = root.join("gog");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("profile.sav"), b"new-save-123").unwrap();
        let mut input = request(&source, &target);
        input.actions[0].target_relative_path = "../profile.sav".to_string();

        let error = apply_cross_store_save_copy(input).unwrap_err();

        assert!(error.contains("must stay inside their roots"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn apply_cross_store_save_copy_rejects_duplicate_target_paths_before_copying() {
        let root = temp_test_dir("duplicate-target");
        let source = root.join("steam");
        let target = root.join("gog");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(source.join("profile.sav"), b"new-save-123").unwrap();
        fs::write(source.join("slot-b.sav"), b"other-save12").unwrap();
        fs::write(target.join("profile.sav"), b"old-save").unwrap();
        let mut input = request(&source, &target);
        input.actions.push(CrossStoreSaveApplyAction {
            expected_sha256: None,
            expected_size_bytes: Some(12),
            id: "slot-b".to_string(),
            source_relative_path: "slot-b.sav".to_string(),
            target_relative_path: "profile.sav".to_string(),
        });
        input.consent.action_count = 2;

        let error = apply_cross_store_save_copy(input).unwrap_err();

        assert!(error.contains("duplicate target path"));
        assert_eq!(fs::read(target.join("profile.sav")).unwrap(), b"old-save");
        assert!(!target.join(CROSS_STORE_SAVE_MANIFEST_FILE).exists());
        assert!(!target.join(CROSS_STORE_SAVE_BACKUP_DIR).exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn apply_cross_store_save_copy_preflights_all_actions_before_mutation() {
        let root = temp_test_dir("apply-preflight");
        let source = root.join("steam");
        let target = root.join("gog");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(source.join("profile.sav"), b"new-save-123").unwrap();
        fs::write(source.join("settings.json"), b"{\"new\":true}").unwrap();
        fs::write(target.join("profile.sav"), b"old-save").unwrap();
        let mut input = request(&source, &target);
        input.actions.push(CrossStoreSaveApplyAction {
            expected_sha256: None,
            expected_size_bytes: Some(99),
            id: "settings".to_string(),
            source_relative_path: "settings.json".to_string(),
            target_relative_path: "settings.json".to_string(),
        });
        input.consent.action_count = 2;

        let error = apply_cross_store_save_copy(input).unwrap_err();

        assert!(error.contains("source size mismatch"));
        assert_eq!(fs::read(target.join("profile.sav")).unwrap(), b"old-save");
        assert!(!target.join("settings.json").exists());
        assert!(!target.join(CROSS_STORE_SAVE_MANIFEST_FILE).exists());
        assert!(!target.join(CROSS_STORE_SAVE_BACKUP_DIR).exists());
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn apply_cross_store_save_copy_rejects_symlink_source() {
        use std::os::unix::fs::symlink;

        let root = temp_test_dir("symlink");
        let source = root.join("steam");
        let target = root.join("gog");
        fs::create_dir_all(&source).unwrap();
        fs::write(root.join("outside.sav"), b"new-save-123").unwrap();
        symlink(root.join("outside.sav"), source.join("profile.sav")).unwrap();

        let error = apply_cross_store_save_copy(request(&source, &target)).unwrap_err();

        assert!(error.contains("symbolic link"));
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn apply_cross_store_save_copy_rejects_symlink_source_parent_before_copying() {
        use std::os::unix::fs::symlink;

        let root = temp_test_dir("source-parent-symlink");
        let source = root.join("steam");
        let target = root.join("gog");
        let outside = root.join("outside-source");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join("profile.sav"), b"new-save-123").unwrap();
        symlink(&outside, source.join("slot-a")).unwrap();
        let mut input = request(&source, &target);
        input.actions[0].source_relative_path = "slot-a/profile.sav".to_string();

        let error = apply_cross_store_save_copy(input).unwrap_err();

        assert!(error.contains("symbolic link"));
        assert!(!target.join("profile.sav").exists());
        assert!(!target.join(CROSS_STORE_SAVE_MANIFEST_FILE).exists());
        assert!(!target.join(CROSS_STORE_SAVE_BACKUP_DIR).exists());
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn apply_cross_store_save_copy_rejects_symlink_target_parent_before_copying() {
        use std::os::unix::fs::symlink;

        let root = temp_test_dir("target-parent-symlink");
        let source = root.join("steam");
        let target = root.join("gog");
        let outside = root.join("outside-target");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(source.join("profile.sav"), b"new-save-123").unwrap();
        symlink(&outside, target.join("slot-a")).unwrap();
        let mut input = request(&source, &target);
        input.actions[0].target_relative_path = "slot-a/profile.sav".to_string();

        let error = apply_cross_store_save_copy(input).unwrap_err();

        assert!(error.contains("symbolic link"));
        assert!(!outside.join("profile.sav").exists());
        assert!(!target.join(CROSS_STORE_SAVE_MANIFEST_FILE).exists());
        assert!(!target.join(CROSS_STORE_SAVE_BACKUP_DIR).exists());
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn apply_cross_store_save_copy_rejects_symlink_manifest_before_writing() {
        use std::os::unix::fs::symlink;

        let root = temp_test_dir("manifest-symlink");
        let source = root.join("steam");
        let target = root.join("gog");
        let outside_manifest = root.join("outside-manifest.json");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(source.join("profile.sav"), b"new-save-123").unwrap();
        fs::write(&outside_manifest, b"outside-original").unwrap();
        symlink(
            &outside_manifest,
            target.join(CROSS_STORE_SAVE_MANIFEST_FILE),
        )
        .unwrap();

        let error = apply_cross_store_save_copy(request(&source, &target)).unwrap_err();

        assert!(error.contains("symbolic link"));
        assert_eq!(fs::read(&outside_manifest).unwrap(), b"outside-original");
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn rollback_cross_store_save_copy_rejects_symlink_target_parent_before_restoring() {
        use std::os::unix::fs::symlink;

        let root = temp_test_dir("rollback-target-parent-symlink");
        let source = root.join("steam");
        let target = root.join("gog");
        let outside = root.join("outside-rollback");
        fs::create_dir_all(source.join("slot-a")).unwrap();
        fs::create_dir_all(target.join("slot-a")).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(source.join("slot-a/profile.sav"), b"new-save-123").unwrap();
        fs::write(target.join("slot-a/profile.sav"), b"old-save").unwrap();
        let mut input = request(&source, &target);
        input.actions[0].source_relative_path = "slot-a/profile.sav".to_string();
        input.actions[0].target_relative_path = "slot-a/profile.sav".to_string();
        let apply = apply_cross_store_save_copy(input).unwrap();
        fs::remove_dir_all(target.join("slot-a")).unwrap();
        symlink(&outside, target.join("slot-a")).unwrap();

        let error = rollback_cross_store_save_copy(rollback_request(&target, &apply)).unwrap_err();

        assert!(error.contains("symbolic link"));
        assert!(!outside.join("profile.sav").exists());
        assert!(target
            .join(CROSS_STORE_SAVE_BACKUP_DIR)
            .join(&apply.rollback_manifest_id)
            .join("slot-a/profile.sav")
            .exists());
        let _ = fs::remove_dir_all(root);
    }
}
