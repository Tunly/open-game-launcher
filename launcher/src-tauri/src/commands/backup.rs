use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet, HashSet},
    env,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    process::Command,
};
use uuid::Uuid;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

use super::games::core::{
    current_unix_timestamp, open_game_launcher_data_dir, path_to_string,
    read_installed_games_cache, slugify, system_time_to_unix_timestamp, unix_timestamp_to_iso,
};

const BACKUP_DIR_NAME: &str = ".og-launcher-backups";
const ARCHIVES_DIR_NAME: &str = "archives";
const FILES_DIR_NAME: &str = "files";
const MANIFESTS_DIR_NAME: &str = "manifests";
const PROOF_DIR_NAME: &str = "proof";
const LATEST_MANIFEST_FILE: &str = "latest-manifest.json";
const SCHEDULER_CONFIG_FILE: &str = "backup-scheduler.json";
const SCHEDULER_STATUS_FILE: &str = "backup-scheduler-status.json";
const HEADLESS_BACKUP_SCHEDULER_ARG: &str = "--og-backup-scheduler-run";
#[cfg(any(target_os = "linux", test))]
const LINUX_SYSTEMD_SERVICE_FILE: &str = "og-launcher-backup.service";
#[cfg(any(target_os = "linux", test))]
const LINUX_SYSTEMD_TIMER_FILE: &str = "og-launcher-backup.timer";
#[cfg(target_os = "macos")]
const MACOS_LAUNCH_AGENT_FILE: &str = "com.opengamelauncher.backup.plist";
#[cfg(target_os = "windows")]
const WINDOWS_SCHEDULED_TASK_NAME: &str = "OG Launcher Backup";
const MANIFEST_FORMAT_VERSION: u32 = 1;
const LIBRARY_DB_FILES: &[&str] = &[
    "launcher.sqlite3",
    "launcher.sqlite3-wal",
    "launcher.sqlite3-shm",
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupPlanRequest {
    pub target_path: String,
    #[serde(default)]
    pub game_ids: Vec<String>,
    #[serde(default = "default_true")]
    pub include_library_data: bool,
    #[serde(default)]
    pub compression: BackupCompressionMode,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestorePlanRequest {
    pub target_path: String,
    #[serde(default)]
    pub manifest_path: Option<String>,
    #[serde(default)]
    pub game_ids: Vec<String>,
    #[serde(default = "default_true")]
    pub include_library_data: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupExternalDriveWriteProofRequest {
    pub target_path: String,
    pub expected_mount_point: String,
    pub consent: BackupExternalDriveWriteProofConsent,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupExternalDriveWriteProofConsent {
    pub accepted: bool,
    pub target_path: String,
    pub operation: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupExternalDriveEjectSafetyRequest {
    pub target_path: String,
    pub expected_mount_point: String,
    pub consent: BackupExternalDriveEjectSafetyConsent,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupExternalDriveEjectSafetyConsent {
    pub accepted: bool,
    pub target_path: String,
    pub operation: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupExternalDriveOsEjectRequest {
    pub target_path: String,
    pub expected_mount_point: String,
    pub preflight_proof_id: String,
    pub consent: BackupExternalDriveOsEjectConsent,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupExternalDriveOsEjectConsent {
    pub accepted: bool,
    pub target_path: String,
    pub operation: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum BackupSourceKind {
    Save,
    LibraryData,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupManifestEntry {
    pub source_kind: BackupSourceKind,
    pub source_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub game_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub game_title: Option<String>,
    pub source_root: String,
    pub source_path: String,
    pub relative_path: String,
    pub backup_relative_path: String,
    pub size_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_unix: Option<u64>,
    pub sha256: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupManifest {
    pub format_version: u32,
    pub manifest_id: String,
    pub created_at: String,
    pub target_path: String,
    pub files: Vec<BackupManifestEntry>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BackupCompressionMode {
    #[default]
    None,
    Zip,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BackupFileAction {
    New,
    Changed,
    Unchanged,
    Removed,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupFilePlan {
    pub action: BackupFileAction,
    pub source_kind: BackupSourceKind,
    pub source_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub game_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub game_title: Option<String>,
    pub source_root: String,
    pub source_path: String,
    pub relative_path: String,
    pub backup_relative_path: String,
    pub size_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_at: Option<String>,
    pub sha256: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupMissingSource {
    pub source_kind: BackupSourceKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub game_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub game_title: Option<String>,
    pub path: String,
    pub reason: String,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupSummary {
    pub total_files: usize,
    pub new_files: usize,
    pub changed_files: usize,
    pub unchanged_files: usize,
    pub removed_files: usize,
    pub missing_sources: usize,
    pub total_bytes: u64,
    pub bytes_to_copy: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupPlanPreview {
    pub target_path: String,
    pub backup_root: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_manifest_path: Option<String>,
    pub manifest_id: String,
    pub generated_at: String,
    pub summary: BackupSummary,
    pub compression: BackupCompressionMode,
    pub files: Vec<BackupFilePlan>,
    pub missing_sources: Vec<BackupMissingSource>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupExecutionResult {
    pub success: bool,
    pub manifest_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manifest_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_manifest_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archive_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archive_bytes: Option<u64>,
    pub summary: BackupSummary,
    pub copied_files: Vec<String>,
    pub skipped_files: Vec<String>,
    pub failed_files: Vec<String>,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupManifestStatus {
    pub manifest_id: String,
    pub created_at: String,
    pub manifest_path: String,
    pub file_count: usize,
    pub game_count: usize,
    pub library_file_count: usize,
    pub total_bytes: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BackupSchedulerCadence {
    Daily,
    Weekly,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupSchedulerConfig {
    pub enabled: bool,
    pub target_path: String,
    #[serde(default = "default_true")]
    pub include_library_data: bool,
    #[serde(default)]
    pub compression: BackupCompressionMode,
    #[serde(default = "default_scheduler_cadence")]
    pub cadence: BackupSchedulerCadence,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupSchedulerRunStatus {
    pub last_run_at: String,
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manifest_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archive_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupSchedulerStatus {
    pub supported: bool,
    pub installed: bool,
    pub provider: String,
    pub config_path: String,
    pub status_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config: Option<BackupSchedulerConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_run: Option<BackupSchedulerRunStatus>,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupExternalDriveWriteProofResult {
    pub success: bool,
    pub proof_id: String,
    pub target_path: String,
    pub mount_point: String,
    pub disk_name: String,
    pub file_system: String,
    pub is_removable: bool,
    pub is_read_only: bool,
    pub proof_path: String,
    pub bytes_written: u64,
    pub bytes_read: u64,
    pub sha256: String,
    pub checksum_matched: bool,
    pub verified_at: String,
    pub cleanup_deleted: bool,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupExternalDriveEjectSafetyResult {
    pub success: bool,
    pub proof_id: String,
    pub target_path: String,
    pub mount_point: String,
    pub disk_name: String,
    pub file_system: String,
    pub is_removable: bool,
    pub is_read_only: bool,
    pub proof_path: String,
    pub bytes_written: u64,
    pub bytes_read: u64,
    pub sha256: String,
    pub sync_completed: bool,
    pub directory_sync_supported: bool,
    pub directory_sync_completed: bool,
    pub cleanup_deleted: bool,
    pub pending_proof_files: Vec<String>,
    pub ready_for_os_eject: bool,
    pub verified_at: String,
    pub recommended_next_step: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupExternalDriveOsEjectResult {
    pub success: bool,
    pub target_path: String,
    pub mount_point: String,
    pub disk_name: String,
    pub file_system: String,
    pub is_removable: bool,
    pub is_read_only: bool,
    pub preflight_proof_id: String,
    pub final_preflight_proof_id: String,
    pub platform: String,
    pub command_label: String,
    pub unmounted: bool,
    pub verified_at: String,
    pub recommended_next_step: String,
    pub message: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RestoreFileAction {
    Create,
    Overwrite,
    Unchanged,
    Blocked,
    MissingBackup,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreFilePlan {
    pub action: RestoreFileAction,
    pub source_kind: BackupSourceKind,
    pub source_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub game_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub game_title: Option<String>,
    pub restore_path: String,
    pub backup_relative_path: String,
    pub size_bytes: u64,
    pub sha256: String,
    pub message: String,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreSummary {
    pub total_files: usize,
    pub create_files: usize,
    pub overwrite_files: usize,
    pub unchanged_files: usize,
    pub blocked_files: usize,
    pub missing_backup_files: usize,
    pub skipped_files: usize,
    pub bytes_to_restore: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestorePlanPreview {
    pub target_path: String,
    pub manifest_path: String,
    pub manifest_id: String,
    pub created_at: String,
    pub summary: RestoreSummary,
    pub files: Vec<RestoreFilePlan>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreExecutionResult {
    pub success: bool,
    pub manifest_id: String,
    pub summary: RestoreSummary,
    pub restored_files: Vec<String>,
    pub backed_up_files: Vec<String>,
    pub skipped_files: Vec<String>,
    pub failed_files: Vec<String>,
    pub message: String,
}

#[derive(Clone)]
struct BackupSource {
    kind: BackupSourceKind,
    source_id: String,
    game_id: Option<String>,
    game_title: Option<String>,
    root: PathBuf,
    include_files: Option<Vec<PathBuf>>,
}

#[derive(Clone)]
struct BackupPaths {
    target_dir: PathBuf,
    backup_root: PathBuf,
    archives_root: PathBuf,
    manifests_root: PathBuf,
    files_root: PathBuf,
    latest_manifest: PathBuf,
}

#[derive(Clone)]
struct RestoreAllowedPath {
    path: PathBuf,
    exact_file: bool,
}

struct BackupArchiveResult {
    path: PathBuf,
    size_bytes: u64,
}

#[derive(Clone, Debug)]
struct BackupWriteProofDiskEvidence {
    name: String,
    mount_point: String,
    file_system: String,
    is_removable: bool,
    is_read_only: bool,
}

fn default_true() -> bool {
    true
}

fn default_scheduler_cadence() -> BackupSchedulerCadence {
    BackupSchedulerCadence::Weekly
}

#[tauri::command]
pub fn preview_backup_plan(input: BackupPlanRequest) -> Result<BackupPlanPreview, String> {
    build_backup_plan(&input, false)
}

#[tauri::command]
pub fn run_backup_plan(input: BackupPlanRequest) -> Result<BackupExecutionResult, String> {
    let plan = build_backup_plan(&input, true)?;
    let paths = backup_paths(&plan.target_path, true)?;
    fs::create_dir_all(&paths.files_root)
        .map_err(|error| format!("Could not create backup payload folder: {error}"))?;
    fs::create_dir_all(&paths.manifests_root)
        .map_err(|error| format!("Could not create backup manifest folder: {error}"))?;

    let mut copied_files = Vec::new();
    let mut skipped_files = Vec::new();
    let mut failed_files = Vec::new();

    for file in &plan.files {
        match file.action {
            BackupFileAction::New | BackupFileAction::Changed => {
                let source = PathBuf::from(&file.source_path);
                let destination =
                    safe_join_manifest_relative(&paths.files_root, &file.backup_relative_path)?;
                if let Some(parent) = destination.parent() {
                    fs::create_dir_all(parent).map_err(|error| {
                        format!("Could not create backup destination folder: {error}")
                    })?;
                }
                match fs::copy(&source, &destination) {
                    Ok(_) => copied_files.push(file.source_path.clone()),
                    Err(error) => {
                        failed_files.push(format!("{}: {error}", file.source_path));
                    }
                }
            }
            BackupFileAction::Unchanged => {
                skipped_files.push(file.source_path.clone());
            }
            BackupFileAction::Removed => {}
        }
    }

    if !failed_files.is_empty() {
        return Ok(BackupExecutionResult {
            success: false,
            manifest_id: plan.manifest_id,
            manifest_path: None,
            latest_manifest_path: None,
            archive_path: None,
            archive_bytes: None,
            summary: plan.summary,
            copied_files,
            skipped_files,
            failed_files,
            message: "Backup stopped before writing a new manifest because one or more files failed to copy."
                .to_string(),
        });
    }

    let manifest = BackupManifest {
        format_version: MANIFEST_FORMAT_VERSION,
        manifest_id: plan.manifest_id.clone(),
        created_at: plan.generated_at.clone(),
        target_path: path_to_string(paths.target_dir.clone()),
        files: plan
            .files
            .iter()
            .filter(|file| !matches!(file.action, BackupFileAction::Removed))
            .map(plan_file_to_manifest_entry)
            .collect(),
    };
    let manifest_path = paths
        .manifests_root
        .join(format!("{}.json", manifest.manifest_id));
    write_manifest_file(&manifest_path, &manifest)?;
    write_manifest_file(&paths.latest_manifest, &manifest)?;
    let archive_result = match plan.compression {
        BackupCompressionMode::None => None,
        BackupCompressionMode::Zip => Some(write_backup_zip_archive(&paths, &manifest)?),
    };

    Ok(BackupExecutionResult {
        success: true,
        manifest_id: manifest.manifest_id,
        manifest_path: Some(path_to_string(manifest_path)),
        latest_manifest_path: Some(path_to_string(paths.latest_manifest)),
        archive_path: archive_result
            .as_ref()
            .map(|result| path_to_string(result.path.clone())),
        archive_bytes: archive_result.as_ref().map(|result| result.size_bytes),
        summary: plan.summary,
        copied_files,
        skipped_files,
        failed_files,
        message: if archive_result.is_some() {
            "Backup manifest written with incremental payload reuse and ZIP archive.".to_string()
        } else {
            "Backup manifest written with incremental payload reuse.".to_string()
        },
    })
}

#[tauri::command]
pub fn prove_backup_external_drive_write(
    window: tauri::Window,
    input: BackupExternalDriveWriteProofRequest,
) -> Result<BackupExternalDriveWriteProofResult, String> {
    if window.label() != "main" {
        return Err("Backup write proof can only run from the main window.".to_string());
    }
    validate_backup_write_proof_consent(&input)?;
    let disks = backup_write_proof_disk_evidence();
    prove_backup_external_drive_write_with_expected_sha(&input, &disks, None)
}

#[tauri::command]
pub fn prove_backup_external_drive_eject_safety(
    window: tauri::Window,
    input: BackupExternalDriveEjectSafetyRequest,
) -> Result<BackupExternalDriveEjectSafetyResult, String> {
    if window.label() != "main" {
        return Err("Backup eject-safety proof can only run from the main window.".to_string());
    }
    validate_backup_eject_safety_consent(&input)?;
    let disks = backup_write_proof_disk_evidence();
    prove_backup_external_drive_eject_safety_with_disks(&input, &disks)
}

#[tauri::command]
pub fn eject_backup_external_drive(
    window: tauri::Window,
    input: BackupExternalDriveOsEjectRequest,
) -> Result<BackupExternalDriveOsEjectResult, String> {
    if window.label() != "main" {
        return Err(
            "Backup external-drive OS eject can only run from the main window.".to_string(),
        );
    }
    validate_backup_os_eject_consent(&input)?;
    let disks = backup_write_proof_disk_evidence();
    eject_backup_external_drive_with_runner(
        &input,
        &disks,
        run_backup_os_eject_command,
        backup_write_proof_disk_evidence,
    )
}

#[tauri::command]
pub fn preview_restore_plan(input: RestorePlanRequest) -> Result<RestorePlanPreview, String> {
    build_restore_plan(&input)
}

#[tauri::command]
pub fn restore_backup(input: RestorePlanRequest) -> Result<RestoreExecutionResult, String> {
    let plan = build_restore_plan(&input)?;
    let safety_root = open_game_launcher_data_dir()
        .ok_or_else(|| "Could not resolve OG-Launcher data directory.".to_string())?
        .join("restore-safety")
        .join(&plan.manifest_id);
    fs::create_dir_all(&safety_root)
        .map_err(|error| format!("Could not create restore safety folder: {error}"))?;

    let restore_input_paths = backup_paths(&input.target_path, false)?;
    let mut restored_files = Vec::new();
    let mut backed_up_files = Vec::new();
    let mut skipped_files = Vec::new();
    let mut failed_files = Vec::new();

    for file in &plan.files {
        match file.action {
            RestoreFileAction::Create | RestoreFileAction::Overwrite => {
                let backup_path = match safe_join_manifest_relative(
                    &restore_input_paths.files_root,
                    &file.backup_relative_path,
                ) {
                    Ok(path) => path,
                    Err(error) => {
                        failed_files.push(format!("{}: {error}", file.restore_path));
                        continue;
                    }
                };
                let restore_path = PathBuf::from(&file.restore_path);

                if is_symlink(&restore_path) {
                    failed_files.push(format!(
                        "{}: refusing to overwrite a symbolic link",
                        file.restore_path
                    ));
                    continue;
                }

                if restore_path.exists() {
                    let safety_path = safety_path_for_restore_file(&safety_root, file)?;
                    if let Some(parent) = safety_path.parent() {
                        fs::create_dir_all(parent).map_err(|error| {
                            format!("Could not create restore safety folder: {error}")
                        })?;
                    }
                    if let Err(error) = fs::copy(&restore_path, &safety_path) {
                        failed_files.push(format!(
                            "{}: could not create restore safety copy: {error}",
                            file.restore_path
                        ));
                        continue;
                    }
                    backed_up_files.push(path_to_string(safety_path));
                }

                if let Some(parent) = restore_path.parent() {
                    if let Err(error) = fs::create_dir_all(parent) {
                        failed_files.push(format!(
                            "{}: could not create restore destination folder: {error}",
                            file.restore_path
                        ));
                        continue;
                    }
                }

                match fs::copy(&backup_path, &restore_path) {
                    Ok(_) => restored_files.push(file.restore_path.clone()),
                    Err(error) => {
                        failed_files.push(format!("{}: {error}", file.restore_path));
                    }
                }
            }
            RestoreFileAction::Unchanged => {
                skipped_files.push(file.restore_path.clone());
            }
            RestoreFileAction::Blocked | RestoreFileAction::MissingBackup => {
                failed_files.push(format!("{}: {}", file.restore_path, file.message));
            }
        }
    }

    Ok(RestoreExecutionResult {
        success: failed_files.is_empty(),
        manifest_id: plan.manifest_id,
        summary: plan.summary,
        restored_files,
        backed_up_files,
        skipped_files,
        failed_files: failed_files.clone(),
        message: if failed_files.is_empty() {
            "Restore completed from the selected manifest.".to_string()
        } else {
            "Restore completed with blocked or failed files.".to_string()
        },
    })
}

#[tauri::command]
pub fn get_latest_backup_status(
    target_path: String,
) -> Result<Option<BackupManifestStatus>, String> {
    let paths = backup_paths(&target_path, false)?;
    if !paths.latest_manifest.exists() {
        return Ok(None);
    }
    let manifest = read_manifest(&paths.latest_manifest)?;
    Ok(Some(manifest_status(
        &manifest,
        path_to_string(paths.latest_manifest),
    )))
}

#[tauri::command]
pub fn get_backup_scheduler_status() -> Result<BackupSchedulerStatus, String> {
    backup_scheduler_status(None)
}

#[tauri::command]
pub fn save_backup_scheduler_config(
    input: BackupSchedulerConfig,
) -> Result<BackupSchedulerStatus, String> {
    let mut config = normalize_scheduler_config(input)?;
    config.updated_at = Some(unix_timestamp_to_iso(current_unix_timestamp()));
    write_backup_scheduler_config(&config)?;
    backup_scheduler_status(Some("Backup timer settings saved.".to_string()))
}

#[tauri::command]
pub fn install_backup_scheduler(
    input: BackupSchedulerConfig,
) -> Result<BackupSchedulerStatus, String> {
    let mut config = normalize_scheduler_config(input)?;
    config.enabled = true;
    config.updated_at = Some(unix_timestamp_to_iso(current_unix_timestamp()));
    if config.target_path.trim().is_empty() {
        return Err("Set a backup target path before installing the OS timer.".to_string());
    }
    install_os_backup_scheduler(&config)?;
    write_backup_scheduler_config(&config)?;
    backup_scheduler_status(Some("Headless backup OS timer installed.".to_string()))
}

#[tauri::command]
pub fn uninstall_backup_scheduler() -> Result<BackupSchedulerStatus, String> {
    uninstall_os_backup_scheduler()?;
    if let Some(mut config) = read_backup_scheduler_config()? {
        config.enabled = false;
        config.updated_at = Some(unix_timestamp_to_iso(current_unix_timestamp()));
        write_backup_scheduler_config(&config)?;
    }
    backup_scheduler_status(Some("Headless backup OS timer removed.".to_string()))
}

#[tauri::command]
pub fn run_backup_scheduler_now() -> Result<BackupSchedulerRunStatus, String> {
    run_configured_backup_scheduler()
}

pub fn run_headless_backup_scheduler_from_args() -> Option<i32> {
    let requested = env::args().any(|argument| argument == HEADLESS_BACKUP_SCHEDULER_ARG);
    if !requested {
        return None;
    }

    let exit_code = match run_configured_backup_scheduler() {
        Ok(status) if status.success => 0,
        Ok(status) => {
            eprintln!("{}", status.message);
            1
        }
        Err(error) => {
            let _ = write_backup_scheduler_run_status(&BackupSchedulerRunStatus {
                archive_path: None,
                last_run_at: unix_timestamp_to_iso(current_unix_timestamp()),
                manifest_path: None,
                message: error.clone(),
                success: false,
            });
            eprintln!("{error}");
            1
        }
    };

    Some(exit_code)
}

fn backup_scheduler_status(message: Option<String>) -> Result<BackupSchedulerStatus, String> {
    let (provider, supported) = backup_scheduler_provider();
    let config_path = backup_scheduler_config_path()?;
    let status_path = backup_scheduler_status_path()?;
    let config = read_backup_scheduler_config()?;
    let last_run = read_backup_scheduler_run_status()?;
    let installed = supported && is_os_backup_scheduler_installed();
    let message = message.unwrap_or_else(|| {
        if !supported {
            "Headless OS backup timers are not supported on this platform.".to_string()
        } else if installed {
            "Headless backup OS timer is installed.".to_string()
        } else {
            "Headless backup OS timer is not installed.".to_string()
        }
    });

    Ok(BackupSchedulerStatus {
        supported,
        installed,
        provider: provider.to_string(),
        config_path: path_to_string(config_path),
        status_path: path_to_string(status_path),
        config,
        last_run,
        message,
    })
}

fn normalize_scheduler_config(
    input: BackupSchedulerConfig,
) -> Result<BackupSchedulerConfig, String> {
    let target_path = input.target_path.trim().to_string();
    if !target_path.is_empty() {
        let path = PathBuf::from(&target_path);
        if !path.is_absolute() || has_parent_component(&path) {
            return Err(
                "Backup scheduler target path must be absolute and must not contain '..'."
                    .to_string(),
            );
        }
    }

    Ok(BackupSchedulerConfig {
        enabled: input.enabled && !target_path.is_empty(),
        target_path,
        include_library_data: input.include_library_data,
        compression: input.compression,
        cadence: input.cadence,
        updated_at: input.updated_at,
    })
}

fn run_configured_backup_scheduler() -> Result<BackupSchedulerRunStatus, String> {
    let config = read_backup_scheduler_config()?
        .ok_or_else(|| "Backup scheduler config has not been saved.".to_string())?;
    let config = normalize_scheduler_config(config)?;
    if !config.enabled {
        return Err("Backup scheduler is disabled.".to_string());
    }
    if !is_os_backup_scheduler_installed() {
        return Err("Backup scheduler OS timer is not installed.".to_string());
    }

    let result = run_backup_plan(BackupPlanRequest {
        target_path: config.target_path.clone(),
        game_ids: Vec::new(),
        include_library_data: config.include_library_data,
        compression: config.compression.clone(),
    });
    let run_at = unix_timestamp_to_iso(current_unix_timestamp());
    let status = match result {
        Ok(result) => BackupSchedulerRunStatus {
            archive_path: result.archive_path,
            last_run_at: run_at,
            manifest_path: result.latest_manifest_path.or(result.manifest_path),
            message: result.message,
            success: result.success,
        },
        Err(error) => BackupSchedulerRunStatus {
            archive_path: None,
            last_run_at: run_at,
            manifest_path: None,
            message: error,
            success: false,
        },
    };
    write_backup_scheduler_run_status(&status)?;
    Ok(status)
}

fn backup_scheduler_config_path() -> Result<PathBuf, String> {
    open_game_launcher_data_dir()
        .map(|path| path.join(SCHEDULER_CONFIG_FILE))
        .ok_or_else(|| "Could not resolve OG-Launcher data directory.".to_string())
}

fn backup_scheduler_status_path() -> Result<PathBuf, String> {
    open_game_launcher_data_dir()
        .map(|path| path.join(SCHEDULER_STATUS_FILE))
        .ok_or_else(|| "Could not resolve OG-Launcher data directory.".to_string())
}

fn read_backup_scheduler_config() -> Result<Option<BackupSchedulerConfig>, String> {
    let path = backup_scheduler_config_path()?;
    if !path.exists() {
        return Ok(None);
    }
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read backup scheduler config: {error}"))?;
    let config = serde_json::from_str::<BackupSchedulerConfig>(&contents)
        .map_err(|error| format!("Could not parse backup scheduler config: {error}"))?;
    Ok(Some(normalize_scheduler_config(config)?))
}

fn write_backup_scheduler_config(config: &BackupSchedulerConfig) -> Result<(), String> {
    let path = backup_scheduler_config_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create backup scheduler config folder: {error}"))?;
    }
    let contents = serde_json::to_string_pretty(config)
        .map_err(|error| format!("Could not serialize backup scheduler config: {error}"))?;
    fs::write(path, contents)
        .map_err(|error| format!("Could not write backup scheduler config: {error}"))
}

fn read_backup_scheduler_run_status() -> Result<Option<BackupSchedulerRunStatus>, String> {
    let path = backup_scheduler_status_path()?;
    if !path.exists() {
        return Ok(None);
    }
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read backup scheduler status: {error}"))?;
    serde_json::from_str::<BackupSchedulerRunStatus>(&contents)
        .map(Some)
        .map_err(|error| format!("Could not parse backup scheduler status: {error}"))
}

fn write_backup_scheduler_run_status(status: &BackupSchedulerRunStatus) -> Result<(), String> {
    let path = backup_scheduler_status_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create backup scheduler status folder: {error}"))?;
    }
    let contents = serde_json::to_string_pretty(status)
        .map_err(|error| format!("Could not serialize backup scheduler status: {error}"))?;
    fs::write(path, contents)
        .map_err(|error| format!("Could not write backup scheduler status: {error}"))
}

fn backup_scheduler_provider() -> (&'static str, bool) {
    if cfg!(target_os = "windows") {
        ("Windows Task Scheduler", true)
    } else if cfg!(target_os = "macos") {
        ("macOS LaunchAgent", true)
    } else if cfg!(target_os = "linux") {
        ("systemd user timer", true)
    } else {
        ("Unsupported platform", false)
    }
}

fn install_os_backup_scheduler(config: &BackupSchedulerConfig) -> Result<(), String> {
    let (_, supported) = backup_scheduler_provider();
    if !supported {
        return Err("Headless OS backup timers are not supported on this platform.".to_string());
    }

    let canonical_target = backup_paths(&config.target_path, true)?.target_dir;
    if !canonical_target.is_dir() {
        return Err("Backup scheduler target path must be a folder.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        install_windows_backup_scheduler(config)
    }
    #[cfg(target_os = "macos")]
    {
        install_macos_backup_scheduler(config)
    }
    #[cfg(target_os = "linux")]
    {
        install_linux_backup_scheduler(config)
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        let _ = config;
        Err("Headless OS backup timers are not supported on this platform.".to_string())
    }
}

fn uninstall_os_backup_scheduler() -> Result<(), String> {
    let (_, supported) = backup_scheduler_provider();
    if !supported {
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        uninstall_windows_backup_scheduler()
    }
    #[cfg(target_os = "macos")]
    {
        uninstall_macos_backup_scheduler()
    }
    #[cfg(target_os = "linux")]
    {
        uninstall_linux_backup_scheduler()
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Ok(())
    }
}

fn is_os_backup_scheduler_installed() -> bool {
    #[cfg(target_os = "windows")]
    {
        Command::new("schtasks")
            .args(["/Query", "/TN", WINDOWS_SCHEDULED_TASK_NAME])
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
    }
    #[cfg(target_os = "macos")]
    {
        macos_launch_agent_path()
            .map(|path| path.exists())
            .unwrap_or(false)
    }
    #[cfg(target_os = "linux")]
    {
        linux_systemd_user_dir()
            .map(|path| {
                path.join(LINUX_SYSTEMD_SERVICE_FILE).exists()
                    && path.join(LINUX_SYSTEMD_TIMER_FILE).exists()
            })
            .unwrap_or(false)
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        false
    }
}

#[cfg(target_os = "windows")]
fn install_windows_backup_scheduler(config: &BackupSchedulerConfig) -> Result<(), String> {
    let exe = current_scheduler_exe()?;
    let task_run = format!(
        "\"{}\" {}",
        exe.to_string_lossy().replace('"', "\\\""),
        HEADLESS_BACKUP_SCHEDULER_ARG
    );
    let mut args = vec![
        "/Create".to_string(),
        "/TN".to_string(),
        WINDOWS_SCHEDULED_TASK_NAME.to_string(),
        "/TR".to_string(),
        task_run,
        "/SC".to_string(),
        match config.cadence {
            BackupSchedulerCadence::Daily => "DAILY".to_string(),
            BackupSchedulerCadence::Weekly => "WEEKLY".to_string(),
        },
        "/F".to_string(),
    ];
    if matches!(config.cadence, BackupSchedulerCadence::Weekly) {
        args.push("/D".to_string());
        args.push("MON".to_string());
    }
    run_os_command("schtasks", &args)
}

#[cfg(target_os = "windows")]
fn uninstall_windows_backup_scheduler() -> Result<(), String> {
    if !is_os_backup_scheduler_installed() {
        return Ok(());
    }
    run_os_command(
        "schtasks",
        &[
            "/Delete".to_string(),
            "/TN".to_string(),
            WINDOWS_SCHEDULED_TASK_NAME.to_string(),
            "/F".to_string(),
        ],
    )
}

#[cfg(target_os = "macos")]
fn install_macos_backup_scheduler(config: &BackupSchedulerConfig) -> Result<(), String> {
    let path = macos_launch_agent_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create LaunchAgents folder: {error}"))?;
    }
    let exe = current_scheduler_exe()?;
    fs::write(&path, macos_launch_agent_plist(&exe, &config.cadence))
        .map_err(|error| format!("Could not write LaunchAgent plist: {error}"))?;

    let path_text = path_to_string(path);
    let _ = run_os_command("launchctl", &["unload".to_string(), path_text.clone()]);
    run_os_command("launchctl", &["load".to_string(), path_text])
}

#[cfg(target_os = "macos")]
fn uninstall_macos_backup_scheduler() -> Result<(), String> {
    let path = macos_launch_agent_path()?;
    let path_text = path_to_string(path.clone());
    let _ = run_os_command("launchctl", &["unload".to_string(), path_text]);
    if path.exists() {
        fs::remove_file(path)
            .map_err(|error| format!("Could not remove LaunchAgent plist: {error}"))?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn macos_launch_agent_path() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|path| {
            path.join("Library")
                .join("LaunchAgents")
                .join(MACOS_LAUNCH_AGENT_FILE)
        })
        .ok_or_else(|| "Could not resolve home directory for LaunchAgent.".to_string())
}

#[cfg(target_os = "linux")]
fn install_linux_backup_scheduler(config: &BackupSchedulerConfig) -> Result<(), String> {
    let user_dir = linux_systemd_user_dir()?;
    fs::create_dir_all(&user_dir)
        .map_err(|error| format!("Could not create systemd user folder: {error}"))?;
    let exe = current_scheduler_exe()?;
    fs::write(
        user_dir.join(LINUX_SYSTEMD_SERVICE_FILE),
        linux_systemd_service_unit(&exe),
    )
    .map_err(|error| format!("Could not write systemd service: {error}"))?;
    fs::write(
        user_dir.join(LINUX_SYSTEMD_TIMER_FILE),
        linux_systemd_timer_unit(&config.cadence),
    )
    .map_err(|error| format!("Could not write systemd timer: {error}"))?;

    run_os_command(
        "systemctl",
        &["--user".to_string(), "daemon-reload".to_string()],
    )?;
    run_os_command(
        "systemctl",
        &[
            "--user".to_string(),
            "enable".to_string(),
            "--now".to_string(),
            LINUX_SYSTEMD_TIMER_FILE.to_string(),
        ],
    )
}

#[cfg(target_os = "linux")]
fn uninstall_linux_backup_scheduler() -> Result<(), String> {
    let user_dir = linux_systemd_user_dir()?;
    let _ = run_os_command(
        "systemctl",
        &[
            "--user".to_string(),
            "disable".to_string(),
            "--now".to_string(),
            LINUX_SYSTEMD_TIMER_FILE.to_string(),
        ],
    );
    for file_name in [LINUX_SYSTEMD_SERVICE_FILE, LINUX_SYSTEMD_TIMER_FILE] {
        let path = user_dir.join(file_name);
        if path.exists() {
            fs::remove_file(&path)
                .map_err(|error| format!("Could not remove {}: {error}", path.display()))?;
        }
    }
    let _ = run_os_command(
        "systemctl",
        &["--user".to_string(), "daemon-reload".to_string()],
    );
    Ok(())
}

#[cfg(target_os = "linux")]
fn linux_systemd_user_dir() -> Result<PathBuf, String> {
    dirs::config_dir()
        .map(|path| path.join("systemd").join("user"))
        .ok_or_else(|| "Could not resolve user config directory for systemd.".to_string())
}

fn current_scheduler_exe() -> Result<PathBuf, String> {
    env::current_exe().map_err(|error| format!("Could not resolve launcher executable: {error}"))
}

fn run_os_command(program: &str, args: &[String]) -> Result<(), String> {
    let output = Command::new(program)
        .args(args)
        .output()
        .map_err(|error| format!("Could not run {program}: {error}"))?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if !stderr.is_empty() { stderr } else { stdout };
    Err(if detail.is_empty() {
        format!("{program} exited with status {}.", output.status)
    } else {
        format!("{program} failed: {detail}")
    })
}

#[cfg(any(target_os = "linux", test))]
fn linux_systemd_service_unit(exe: &Path) -> String {
    format!(
        "[Unit]\nDescription=OG Launcher headless backup\n\n[Service]\nType=oneshot\nExecStart=\"{}\" {}\n",
        escape_systemd_exec_path(exe),
        HEADLESS_BACKUP_SCHEDULER_ARG
    )
}

#[cfg(any(target_os = "linux", test))]
fn linux_systemd_timer_unit(cadence: &BackupSchedulerCadence) -> String {
    let calendar = match cadence {
        BackupSchedulerCadence::Daily => "daily",
        BackupSchedulerCadence::Weekly => "weekly",
    };
    format!(
        "[Unit]\nDescription=OG Launcher backup timer\n\n[Timer]\nOnCalendar={calendar}\nPersistent=true\nUnit={LINUX_SYSTEMD_SERVICE_FILE}\n\n[Install]\nWantedBy=timers.target\n"
    )
}

#[cfg(any(target_os = "macos", test))]
fn macos_launch_agent_plist(exe: &Path, cadence: &BackupSchedulerCadence) -> String {
    let interval_seconds = match cadence {
        BackupSchedulerCadence::Daily => 86_400,
        BackupSchedulerCadence::Weekly => 604_800,
    };
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\">\n<dict>\n  <key>Label</key>\n  <string>com.opengamelauncher.backup</string>\n  <key>ProgramArguments</key>\n  <array>\n    <string>{}</string>\n    <string>{}</string>\n  </array>\n  <key>StartInterval</key>\n  <integer>{interval_seconds}</integer>\n</dict>\n</plist>\n",
        escape_xml_text(&path_to_string(exe.to_path_buf())),
        HEADLESS_BACKUP_SCHEDULER_ARG
    )
}

fn escape_systemd_exec_path(path: &Path) -> String {
    path_to_string(path.to_path_buf())
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
}

#[cfg(any(target_os = "macos", test))]
fn escape_xml_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn build_backup_plan(
    input: &BackupPlanRequest,
    create_target: bool,
) -> Result<BackupPlanPreview, String> {
    let paths = backup_paths(&input.target_path, create_target)?;
    let manifest_id = new_manifest_id();
    let generated_at = unix_timestamp_to_iso(current_unix_timestamp());
    let latest_manifest = read_manifest_if_exists(&paths.latest_manifest)?;
    let previous_by_key = latest_manifest
        .as_ref()
        .map(index_manifest_entries)
        .unwrap_or_default();

    let game_filter = normalized_filter(&input.game_ids);
    let (sources, missing_sources) =
        configured_backup_sources(input.include_library_data, &game_filter);
    reject_target_inside_sources(&paths.target_dir, &sources)?;

    let mut current_entries = Vec::new();
    for source in &sources {
        collect_entries_for_source(source, &manifest_id, &previous_by_key, &mut current_entries)?;
    }

    let current_keys = current_entries
        .iter()
        .map(manifest_entry_key)
        .collect::<BTreeSet<_>>();
    let mut files = current_entries
        .into_iter()
        .map(|entry| manifest_entry_to_plan_file(entry, &previous_by_key))
        .collect::<Vec<_>>();

    for previous in previous_by_key.values() {
        if should_include_previous_removed(previous, input.include_library_data, &game_filter)
            && !current_keys.contains(&manifest_entry_key(previous))
        {
            files.push(BackupFilePlan {
                action: BackupFileAction::Removed,
                source_kind: previous.source_kind.clone(),
                source_id: previous.source_id.clone(),
                game_id: previous.game_id.clone(),
                game_title: previous.game_title.clone(),
                source_root: previous.source_root.clone(),
                source_path: previous.source_path.clone(),
                relative_path: previous.relative_path.clone(),
                backup_relative_path: previous.backup_relative_path.clone(),
                size_bytes: previous.size_bytes,
                modified_at: previous.modified_at.clone(),
                sha256: previous.sha256.clone(),
            });
        }
    }

    files.sort_by(|a, b| {
        (&a.source_kind, &a.game_title, &a.source_path).cmp(&(
            &b.source_kind,
            &b.game_title,
            &b.source_path,
        ))
    });

    let summary = summarize_backup_files(&files, missing_sources.len());
    Ok(BackupPlanPreview {
        target_path: path_to_string(paths.target_dir),
        backup_root: path_to_string(paths.backup_root),
        latest_manifest_path: latest_manifest.map(|_| path_to_string(paths.latest_manifest)),
        manifest_id,
        generated_at,
        summary,
        compression: input.compression.clone(),
        files,
        missing_sources,
    })
}

fn build_restore_plan(input: &RestorePlanRequest) -> Result<RestorePlanPreview, String> {
    let paths = backup_paths(&input.target_path, false)?;
    let manifest_path = restore_manifest_path(&paths, input.manifest_path.as_deref())?;
    let manifest = read_manifest(&manifest_path)?;
    if manifest.format_version != MANIFEST_FORMAT_VERSION {
        return Err(format!(
            "Unsupported backup manifest format version {}.",
            manifest.format_version
        ));
    }

    let game_filter = normalized_filter(&input.game_ids);
    let allowed_paths = restore_allowed_paths(input.include_library_data, &game_filter);
    let files_root = paths
        .files_root
        .canonicalize()
        .map_err(|error| format!("Could not resolve backup payload folder: {error}"))?;

    let mut files = manifest
        .files
        .iter()
        .filter(|entry| should_restore_entry(entry, input.include_library_data, &game_filter))
        .map(|entry| restore_plan_for_entry(entry, &files_root, &allowed_paths))
        .collect::<Vec<_>>();
    files.sort_by(|a, b| a.restore_path.cmp(&b.restore_path));
    let summary = summarize_restore_files(&files);

    Ok(RestorePlanPreview {
        target_path: path_to_string(paths.target_dir),
        manifest_path: path_to_string(manifest_path),
        manifest_id: manifest.manifest_id,
        created_at: manifest.created_at,
        summary,
        files,
    })
}

fn backup_paths(target_path: &str, create_target: bool) -> Result<BackupPaths, String> {
    let target_path = target_path.trim();
    if target_path.is_empty() {
        return Err("Backup target path must not be empty.".to_string());
    }
    let target_dir = PathBuf::from(target_path);
    if !target_dir.is_absolute() {
        return Err("Backup target path must be absolute.".to_string());
    }
    if has_parent_component(&target_dir) {
        return Err("Backup target path must not contain '..'.".to_string());
    }
    if create_target {
        fs::create_dir_all(&target_dir)
            .map_err(|error| format!("Could not create backup target folder: {error}"))?;
    }
    let target_dir = target_dir
        .canonicalize()
        .map_err(|error| format!("Backup target path must exist and be readable: {error}"))?;
    if !target_dir.is_dir() {
        return Err("Backup target path must be a folder.".to_string());
    }
    let backup_root = target_dir.join(BACKUP_DIR_NAME);
    Ok(BackupPaths {
        target_dir,
        archives_root: backup_root.join(ARCHIVES_DIR_NAME),
        manifests_root: backup_root.join(MANIFESTS_DIR_NAME),
        files_root: backup_root.join(FILES_DIR_NAME),
        latest_manifest: backup_root.join(LATEST_MANIFEST_FILE),
        backup_root,
    })
}

fn prove_backup_external_drive_write_with_expected_sha(
    input: &BackupExternalDriveWriteProofRequest,
    disks: &[BackupWriteProofDiskEvidence],
    expected_sha_override: Option<String>,
) -> Result<BackupExternalDriveWriteProofResult, String> {
    validate_backup_write_proof_consent(input)?;
    let paths = backup_write_proof_paths(&input.target_path)?;
    let disk = find_backup_write_proof_disk(&paths.target_dir, disks)
        .ok_or_else(|| "No mounted disk matched the backup target path.".to_string())?;
    if !backup_mount_points_equal(&disk.mount_point, &input.expected_mount_point) {
        return Err("Backup write proof mount mismatch; refresh drive metadata first.".to_string());
    }
    if !disk.is_removable {
        return Err("Backup write proof requires a removable target disk.".to_string());
    }
    if disk.is_read_only {
        return Err("Backup write proof target is read-only.".to_string());
    }

    let proof_root = paths.backup_root.join(PROOF_DIR_NAME);
    fs::create_dir_all(&paths.backup_root)
        .map_err(|error| format!("Could not create backup proof root folder: {error}"))?;
    fs::create_dir_all(&proof_root)
        .map_err(|error| format!("Could not create backup proof folder: {error}"))?;

    let verified_at = unix_timestamp_to_iso(current_unix_timestamp());
    let proof_id = Uuid::new_v4().simple().to_string();
    let proof_path = proof_root.join(format!("write-proof-{proof_id}.tmp"));
    let payload = format!(
        "OG Launcher external backup write proof\nid={proof_id}\nverified_at={verified_at}\n"
    );
    let expected_sha = expected_sha_override.unwrap_or_else(|| sha256_bytes(payload.as_bytes()));

    let write_result = (|| -> Result<(), String> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&proof_path)
            .map_err(|error| {
                format!(
                    "Could not create backup proof sentinel {}: {error}",
                    proof_path.display()
                )
            })?;
        file.write_all(payload.as_bytes()).map_err(|error| {
            format!(
                "Could not write backup proof sentinel {}: {error}",
                proof_path.display()
            )
        })?;
        file.flush().map_err(|error| {
            format!(
                "Could not flush backup proof sentinel {}: {error}",
                proof_path.display()
            )
        })?;
        file.sync_all().map_err(|error| {
            format!(
                "Could not sync backup proof sentinel {}: {error}",
                proof_path.display()
            )
        })?;
        Ok(())
    })();

    if let Err(error) = write_result {
        let _ = fs::remove_file(&proof_path);
        return Err(error);
    }

    let actual_sha = match sha256_file(&proof_path) {
        Ok(hash) => hash,
        Err(error) => {
            let _ = fs::remove_file(&proof_path);
            return Err(error);
        }
    };
    if actual_sha != expected_sha {
        let _ = fs::remove_file(&proof_path);
        return Err("Backup proof checksum mismatch; sentinel was removed.".to_string());
    }

    fs::remove_file(&proof_path).map_err(|error| {
        format!(
            "Backup proof verified, but sentinel cleanup failed for {}: {error}",
            proof_path.display()
        )
    })?;

    Ok(BackupExternalDriveWriteProofResult {
        success: true,
        proof_id,
        target_path: path_to_string(paths.target_dir),
        mount_point: disk.mount_point,
        disk_name: disk.name,
        file_system: disk.file_system,
        is_removable: disk.is_removable,
        is_read_only: disk.is_read_only,
        proof_path: path_to_string(proof_path.clone()),
        bytes_written: payload.len() as u64,
        bytes_read: payload.len() as u64,
        sha256: actual_sha,
        checksum_matched: true,
        verified_at,
        cleanup_deleted: !proof_path.exists(),
        message: "External backup target accepted a sentinel write/read/checksum/delete proof."
            .to_string(),
    })
}

fn prove_backup_external_drive_eject_safety_with_disks(
    input: &BackupExternalDriveEjectSafetyRequest,
    disks: &[BackupWriteProofDiskEvidence],
) -> Result<BackupExternalDriveEjectSafetyResult, String> {
    validate_backup_eject_safety_consent(input)?;
    let paths = backup_write_proof_paths(&input.target_path)?;
    let disk = find_backup_write_proof_disk(&paths.target_dir, disks)
        .ok_or_else(|| "No mounted disk matched the backup target path.".to_string())?;
    if !backup_mount_points_equal(&disk.mount_point, &input.expected_mount_point) {
        return Err(
            "Backup eject-safety mount mismatch; refresh drive metadata first.".to_string(),
        );
    }
    if !disk.is_removable {
        return Err("Backup eject-safety proof requires a removable target disk.".to_string());
    }
    if disk.is_read_only {
        return Err("Backup eject-safety target is read-only.".to_string());
    }

    let proof_root = paths.backup_root.join(PROOF_DIR_NAME);
    fs::create_dir_all(&paths.backup_root)
        .map_err(|error| format!("Could not create backup proof root folder: {error}"))?;
    fs::create_dir_all(&proof_root)
        .map_err(|error| format!("Could not create backup proof folder: {error}"))?;

    let pending_before = collect_pending_backup_proof_files(&proof_root)?;
    if !pending_before.is_empty() {
        return Err(format!(
            "Backup eject-safety blocked by pending proof files: {}.",
            pending_before.join(", ")
        ));
    }

    let verified_at = unix_timestamp_to_iso(current_unix_timestamp());
    let proof_id = Uuid::new_v4().simple().to_string();
    let proof_path = proof_root.join(format!("eject-proof-{proof_id}.tmp"));
    let payload = format!(
        "OG Launcher external backup eject-safety proof\nid={proof_id}\nverified_at={verified_at}\nmount={}\n",
        disk.mount_point
    );

    let sync_completed = (|| -> Result<(), String> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&proof_path)
            .map_err(|error| {
                format!(
                    "Could not create backup eject-safety sentinel {}: {error}",
                    proof_path.display()
                )
            })?;
        file.write_all(payload.as_bytes()).map_err(|error| {
            format!(
                "Could not write backup eject-safety sentinel {}: {error}",
                proof_path.display()
            )
        })?;
        file.flush().map_err(|error| {
            format!(
                "Could not flush backup eject-safety sentinel {}: {error}",
                proof_path.display()
            )
        })?;
        file.sync_all().map_err(|error| {
            format!(
                "Could not sync backup eject-safety sentinel {}: {error}",
                proof_path.display()
            )
        })?;
        Ok(())
    })()
    .map(|_| true);

    if let Err(error) = sync_completed {
        let _ = fs::remove_file(&proof_path);
        return Err(error);
    }

    let read_payload = match fs::read(&proof_path) {
        Ok(bytes) => bytes,
        Err(error) => {
            let _ = fs::remove_file(&proof_path);
            return Err(format!(
                "Could not read backup eject-safety sentinel {}: {error}",
                proof_path.display()
            ));
        }
    };
    let actual_sha = sha256_bytes(&read_payload);

    fs::remove_file(&proof_path).map_err(|error| {
        format!(
            "Backup eject-safety proof synced, but sentinel cleanup failed for {}: {error}",
            proof_path.display()
        )
    })?;

    let (directory_sync_supported, directory_sync_completed) = sync_backup_directory(&proof_root)?;
    let pending_after = collect_pending_backup_proof_files(&proof_root)?;
    if !pending_after.is_empty() {
        return Err(format!(
            "Backup eject-safety proof left pending files after cleanup: {}.",
            pending_after.join(", ")
        ));
    }

    Ok(BackupExternalDriveEjectSafetyResult {
        success: true,
        proof_id,
        target_path: path_to_string(paths.target_dir),
        mount_point: disk.mount_point,
        disk_name: disk.name,
        file_system: disk.file_system,
        is_removable: disk.is_removable,
        is_read_only: disk.is_read_only,
        proof_path: path_to_string(proof_path.clone()),
        bytes_written: payload.len() as u64,
        bytes_read: read_payload.len() as u64,
        sha256: actual_sha,
        sync_completed: true,
        directory_sync_supported,
        directory_sync_completed,
        cleanup_deleted: !proof_path.exists(),
        pending_proof_files: pending_after,
        ready_for_os_eject: true,
        verified_at,
        recommended_next_step:
            "Use the operating system eject/unmount action after closing active backup work."
                .to_string(),
        message:
            "External backup target passed eject-safety preflight; use the OS eject/unmount action next."
                .to_string(),
    })
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct BackupOsEjectCommand {
    platform: String,
    program: String,
    args: Vec<String>,
    command_label: String,
}

fn eject_backup_external_drive_with_runner<Run, Reload>(
    input: &BackupExternalDriveOsEjectRequest,
    disks: &[BackupWriteProofDiskEvidence],
    mut run: Run,
    reload_disks: Reload,
) -> Result<BackupExternalDriveOsEjectResult, String>
where
    Run: FnMut(&BackupOsEjectCommand) -> Result<(), String>,
    Reload: Fn() -> Vec<BackupWriteProofDiskEvidence>,
{
    validate_backup_os_eject_consent(input)?;
    let paths = backup_write_proof_paths(&input.target_path)?;
    let disk = find_backup_write_proof_disk(&paths.target_dir, disks)
        .ok_or_else(|| "No mounted disk matched the backup target path.".to_string())?;
    if !backup_mount_points_equal(&disk.mount_point, &input.expected_mount_point) {
        return Err(
            "Backup OS eject mount mismatch; refresh drive metadata before eject.".to_string(),
        );
    }
    if !disk.is_removable {
        return Err("Backup OS eject requires a removable target disk.".to_string());
    }
    if disk.is_read_only {
        return Err(
            "Backup OS eject target is read-only; review it in the operating system.".to_string(),
        );
    }

    let proof_root = paths.backup_root.join(PROOF_DIR_NAME);
    let pending_before = collect_pending_backup_proof_files(&proof_root)?;
    if !pending_before.is_empty() {
        return Err(format!(
            "Backup OS eject blocked by pending proof files: {}.",
            pending_before.join(", ")
        ));
    }

    let final_preflight = prove_backup_external_drive_eject_safety_with_disks(
        &BackupExternalDriveEjectSafetyRequest {
            target_path: input.target_path.clone(),
            expected_mount_point: input.expected_mount_point.clone(),
            consent: BackupExternalDriveEjectSafetyConsent {
                accepted: true,
                operation: "flush_write_delete_before_eject_review".to_string(),
                target_path: input.target_path.clone(),
            },
        },
        disks,
    )?;

    let command = backup_os_eject_command(&disk)?;
    run(&command)?;

    let refreshed_disks = reload_disks();
    if refreshed_disks
        .iter()
        .any(|row| backup_mount_points_equal(&row.mount_point, &disk.mount_point))
    {
        return Err(
            "Backup OS eject command returned, but the target mount is still present.".to_string(),
        );
    }

    let verified_at = unix_timestamp_to_iso(current_unix_timestamp());

    Ok(BackupExternalDriveOsEjectResult {
        success: true,
        target_path: path_to_string(paths.target_dir),
        mount_point: disk.mount_point,
        disk_name: disk.name,
        file_system: disk.file_system,
        is_removable: disk.is_removable,
        is_read_only: disk.is_read_only,
        preflight_proof_id: input.preflight_proof_id.trim().to_string(),
        final_preflight_proof_id: final_preflight.proof_id,
        platform: command.platform,
        command_label: command.command_label,
        unmounted: true,
        verified_at,
        recommended_next_step:
            "Remove the drive only after the operating system no longer lists the mount."
                .to_string(),
        message:
            "External backup target OS eject/unmount completed and the mount is no longer listed."
                .to_string(),
    })
}

fn run_backup_os_eject_command(command: &BackupOsEjectCommand) -> Result<(), String> {
    run_os_command(&command.program, &command.args)
}

fn backup_os_eject_command(
    disk: &BackupWriteProofDiskEvidence,
) -> Result<BackupOsEjectCommand, String> {
    backup_os_eject_command_for_platform(env::consts::OS, disk)
}

fn backup_os_eject_command_for_platform(
    platform: &str,
    disk: &BackupWriteProofDiskEvidence,
) -> Result<BackupOsEjectCommand, String> {
    let mount_point = disk.mount_point.trim();
    if mount_point.is_empty() {
        return Err("Backup OS eject mount point must not be empty.".to_string());
    }

    match platform {
        "linux" => {
            let device = disk.name.trim();
            if device.starts_with("/dev/") {
                Ok(BackupOsEjectCommand {
                    platform: platform.to_string(),
                    program: "udisksctl".to_string(),
                    args: vec!["unmount".to_string(), "-b".to_string(), device.to_string()],
                    command_label: format!("udisksctl unmount -b {device}"),
                })
            } else {
                Ok(BackupOsEjectCommand {
                    platform: platform.to_string(),
                    program: "umount".to_string(),
                    args: vec![mount_point.to_string()],
                    command_label: format!("umount {mount_point}"),
                })
            }
        }
        "macos" => Ok(BackupOsEjectCommand {
            platform: platform.to_string(),
            program: "diskutil".to_string(),
            args: vec!["unmount".to_string(), mount_point.to_string()],
            command_label: format!("diskutil unmount {mount_point}"),
        }),
        "windows" => {
            let drive_letter = windows_drive_letter_for_mount(mount_point)?;
            let drive = format!("{drive_letter}:");
            let script = format!(
                "$ErrorActionPreference = 'Stop'; \
                 $volume = Get-CimInstance Win32_Volume -Filter \"DriveLetter='{drive}'\"; \
                 if (-not $volume) {{ throw 'Backup OS eject volume not found.' }}; \
                 $result = Invoke-CimMethod -InputObject $volume -MethodName Dismount -Arguments @{{ Force = $false; Permanent = $false }}; \
                 if ($null -ne $result.ReturnValue -and $result.ReturnValue -ne 0) {{ throw \"Backup OS eject failed with code $($result.ReturnValue).\" }}"
            );

            Ok(BackupOsEjectCommand {
                platform: platform.to_string(),
                program: "powershell.exe".to_string(),
                args: vec![
                    "-NoProfile".to_string(),
                    "-NonInteractive".to_string(),
                    "-Command".to_string(),
                    script,
                ],
                command_label: format!("PowerShell Win32_Volume.Dismount {drive}"),
            })
        }
        other => Err(format!(
            "Backup OS eject is not implemented for platform '{other}'."
        )),
    }
}

fn windows_drive_letter_for_mount(mount_point: &str) -> Result<char, String> {
    let trimmed = mount_point.trim();
    let mut chars = trimmed.chars();
    let Some(letter) = chars.next() else {
        return Err("Backup Windows OS eject mount point must not be empty.".to_string());
    };
    if !letter.is_ascii_alphabetic() || chars.next() != Some(':') {
        return Err(
            "Backup Windows OS eject requires a drive-letter mount point like D:\\".to_string(),
        );
    }
    let rest = chars.collect::<String>();
    if !(rest.is_empty() || rest == "\\" || rest == "/") {
        return Err(
            "Backup Windows OS eject requires the removable drive root, not a subfolder."
                .to_string(),
        );
    }
    Ok(letter.to_ascii_uppercase())
}

fn validate_backup_write_proof_consent(
    input: &BackupExternalDriveWriteProofRequest,
) -> Result<(), String> {
    if !input.consent.accepted {
        return Err("Backup write proof requires explicit consent.".to_string());
    }
    if input.consent.operation != "sentinel_write_read_checksum_delete" {
        return Err("Backup write proof consent operation mismatch.".to_string());
    }
    if input.consent.target_path.trim() != input.target_path.trim() {
        return Err("Backup write proof consent target mismatch.".to_string());
    }
    if input.expected_mount_point.trim().is_empty() {
        return Err("Backup write proof expected mount point must not be empty.".to_string());
    }
    Ok(())
}

fn validate_backup_eject_safety_consent(
    input: &BackupExternalDriveEjectSafetyRequest,
) -> Result<(), String> {
    if !input.consent.accepted {
        return Err("Backup eject-safety proof requires explicit consent.".to_string());
    }
    if input.consent.operation != "flush_write_delete_before_eject_review" {
        return Err("Backup eject-safety consent operation mismatch.".to_string());
    }
    if input.consent.target_path.trim() != input.target_path.trim() {
        return Err("Backup eject-safety consent target mismatch.".to_string());
    }
    if input.expected_mount_point.trim().is_empty() {
        return Err("Backup eject-safety expected mount point must not be empty.".to_string());
    }
    Ok(())
}

fn validate_backup_os_eject_consent(
    input: &BackupExternalDriveOsEjectRequest,
) -> Result<(), String> {
    if !input.consent.accepted {
        return Err("Backup OS eject requires explicit consent.".to_string());
    }
    if input.consent.operation != "os_eject_unmount_removable_target" {
        return Err("Backup OS eject consent operation mismatch.".to_string());
    }
    if input.consent.target_path.trim() != input.target_path.trim() {
        return Err("Backup OS eject consent target mismatch.".to_string());
    }
    if input.expected_mount_point.trim().is_empty() {
        return Err("Backup OS eject expected mount point must not be empty.".to_string());
    }
    if input.preflight_proof_id.trim().is_empty() {
        return Err("Backup OS eject requires an eject-safety preflight proof id.".to_string());
    }
    Ok(())
}

fn backup_write_proof_paths(target_path: &str) -> Result<BackupPaths, String> {
    let target_path = target_path.trim();
    if target_path.is_empty() {
        return Err("Backup target path must not be empty.".to_string());
    }
    let target_dir = PathBuf::from(target_path);
    if !target_dir.is_absolute() {
        return Err("Backup target path must be absolute.".to_string());
    }
    if has_parent_component(&target_dir) {
        return Err("Backup target path must not contain '..'.".to_string());
    }
    if is_symlink(&target_dir) {
        return Err("Backup write proof target must not be a symbolic link.".to_string());
    }
    let target_dir = target_dir
        .canonicalize()
        .map_err(|error| format!("Backup target path must exist and be readable: {error}"))?;
    if !target_dir.is_dir() {
        return Err("Backup target path must be a folder.".to_string());
    }
    let backup_root = target_dir.join(BACKUP_DIR_NAME);
    let proof_root = backup_root.join(PROOF_DIR_NAME);
    if backup_root.exists() && is_symlink(&backup_root) {
        return Err("Backup proof root must not be a symbolic link.".to_string());
    }
    if proof_root.exists() && is_symlink(&proof_root) {
        return Err("Backup proof folder must not be a symbolic link.".to_string());
    }
    Ok(BackupPaths {
        target_dir,
        archives_root: backup_root.join(ARCHIVES_DIR_NAME),
        manifests_root: backup_root.join(MANIFESTS_DIR_NAME),
        files_root: backup_root.join(FILES_DIR_NAME),
        latest_manifest: backup_root.join(LATEST_MANIFEST_FILE),
        backup_root,
    })
}

fn collect_pending_backup_proof_files(proof_root: &Path) -> Result<Vec<String>, String> {
    if !proof_root.exists() {
        return Ok(Vec::new());
    }
    let mut pending = Vec::new();
    for entry in fs::read_dir(proof_root)
        .map_err(|error| format!("Could not inspect backup proof folder: {error}"))?
    {
        let entry =
            entry.map_err(|error| format!("Could not inspect backup proof entry: {error}"))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if (name.starts_with("write-proof-") || name.starts_with("eject-proof-"))
            && name.ends_with(".tmp")
        {
            pending.push(path_to_string(path));
        }
    }
    pending.sort();
    Ok(pending)
}

fn sync_backup_directory(path: &Path) -> Result<(bool, bool), String> {
    sync_backup_directory_platform(path)
}

#[cfg(unix)]
fn sync_backup_directory_platform(path: &Path) -> Result<(bool, bool), String> {
    let directory = File::open(path)
        .map_err(|error| format!("Could not open backup proof folder for sync: {error}"))?;
    directory
        .sync_all()
        .map_err(|error| format!("Could not sync backup proof folder: {error}"))?;
    Ok((true, true))
}

#[cfg(not(unix))]
fn sync_backup_directory_platform(_path: &Path) -> Result<(bool, bool), String> {
    Ok((false, false))
}

fn backup_write_proof_disk_evidence() -> Vec<BackupWriteProofDiskEvidence> {
    use sysinfo::Disks;
    Disks::new_with_refreshed_list()
        .iter()
        .map(|disk| BackupWriteProofDiskEvidence {
            name: disk.name().to_string_lossy().into_owned(),
            mount_point: disk.mount_point().to_string_lossy().into_owned(),
            file_system: disk.file_system().to_string_lossy().into_owned(),
            is_removable: disk.is_removable(),
            is_read_only: disk.is_read_only(),
        })
        .collect()
}

fn find_backup_write_proof_disk(
    target_dir: &Path,
    disks: &[BackupWriteProofDiskEvidence],
) -> Option<BackupWriteProofDiskEvidence> {
    let target = normalize_backup_mount_match_path(&target_dir.to_string_lossy())?;
    disks
        .iter()
        .filter_map(|disk| {
            let mount = normalize_backup_mount_match_path(&disk.mount_point)?;
            if backup_path_inside_mount(&target, &mount) {
                Some((mount.len(), disk.clone()))
            } else {
                None
            }
        })
        .max_by_key(|(mount_len, _)| *mount_len)
        .map(|(_, disk)| disk)
}

fn backup_mount_points_equal(left: &str, right: &str) -> bool {
    match (
        normalize_backup_mount_match_path(left),
        normalize_backup_mount_match_path(right),
    ) {
        (Some(left), Some(right)) => left == right,
        _ => false,
    }
}

fn normalize_backup_mount_match_path(path: &str) -> Option<String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return None;
    }
    let mut normalized = trimmed.replace('\\', "/");
    while normalized.len() > 1 && normalized.ends_with('/') {
        normalized.pop();
    }
    if normalized.len() >= 2 && normalized.as_bytes()[1] == b':' {
        normalized = normalized.to_ascii_lowercase();
    }
    Some(normalized)
}

fn backup_path_inside_mount(path: &str, mount: &str) -> bool {
    if path == mount {
        return true;
    }
    if mount == "/" {
        return path.starts_with('/');
    }
    path.strip_prefix(mount)
        .map(|suffix| suffix.starts_with('/'))
        .unwrap_or(false)
}

fn configured_backup_sources(
    include_library_data: bool,
    game_filter: &HashSet<String>,
) -> (Vec<BackupSource>, Vec<BackupMissingSource>) {
    let mut sources = Vec::new();
    let mut missing = Vec::new();
    let games = read_installed_games_cache().unwrap_or_default();

    for game in games {
        if !game_filter.is_empty() && !game_filter.contains(&game.id) {
            continue;
        }
        for save_file in game.save_files {
            let path_text = save_file.path.trim();
            if path_text.is_empty() {
                continue;
            }
            let path = PathBuf::from(path_text);
            if !path.is_absolute() || has_parent_component(&path) {
                missing.push(BackupMissingSource {
                    source_kind: BackupSourceKind::Save,
                    game_id: Some(game.id.clone()),
                    game_title: Some(game.title.clone()),
                    path: path_text.to_string(),
                    reason: "Save path must be absolute and must not contain '..'.".to_string(),
                });
                continue;
            }
            let Ok(metadata) = fs::symlink_metadata(&path) else {
                missing.push(BackupMissingSource {
                    source_kind: BackupSourceKind::Save,
                    game_id: Some(game.id.clone()),
                    game_title: Some(game.title.clone()),
                    path: path_text.to_string(),
                    reason: "Configured save path was not found.".to_string(),
                });
                continue;
            };
            if metadata.file_type().is_symlink() {
                missing.push(BackupMissingSource {
                    source_kind: BackupSourceKind::Save,
                    game_id: Some(game.id.clone()),
                    game_title: Some(game.title.clone()),
                    path: path_text.to_string(),
                    reason: "Symbolic links are skipped for backup safety.".to_string(),
                });
                continue;
            }

            if metadata.is_file() {
                let Some(parent) = path.parent() else {
                    continue;
                };
                let source_id = stable_source_id("save", &game.id, path_text);
                sources.push(BackupSource {
                    kind: BackupSourceKind::Save,
                    source_id,
                    game_id: Some(game.id.clone()),
                    game_title: Some(game.title.clone()),
                    root: parent.to_path_buf(),
                    include_files: Some(vec![path]),
                });
            } else if metadata.is_dir() {
                let source_id = stable_source_id("save", &game.id, path_text);
                sources.push(BackupSource {
                    kind: BackupSourceKind::Save,
                    source_id,
                    game_id: Some(game.id.clone()),
                    game_title: Some(game.title.clone()),
                    root: path,
                    include_files: None,
                });
            }
        }
    }

    if include_library_data {
        if let Some(data_dir) = open_game_launcher_data_dir() {
            let files = LIBRARY_DB_FILES
                .iter()
                .map(|file_name| data_dir.join(file_name))
                .filter(|path| path.exists())
                .collect::<Vec<_>>();
            if files.is_empty() {
                missing.push(BackupMissingSource {
                    source_kind: BackupSourceKind::LibraryData,
                    game_id: None,
                    game_title: None,
                    path: path_to_string(data_dir),
                    reason: "Launcher local database was not found yet.".to_string(),
                });
            } else {
                sources.push(BackupSource {
                    kind: BackupSourceKind::LibraryData,
                    source_id: "library-data".to_string(),
                    game_id: None,
                    game_title: None,
                    root: data_dir,
                    include_files: Some(files),
                });
            }
        }
    }

    (sources, missing)
}

fn collect_entries_for_source(
    source: &BackupSource,
    manifest_id: &str,
    previous_by_key: &BTreeMap<String, BackupManifestEntry>,
    entries: &mut Vec<BackupManifestEntry>,
) -> Result<(), String> {
    let root = source.root.canonicalize().map_err(|error| {
        format!(
            "Could not resolve backup source root {}: {error}",
            source.root.to_string_lossy()
        )
    })?;

    if let Some(files) = &source.include_files {
        for file in files {
            collect_file_entry(source, &root, file, manifest_id, previous_by_key, entries)?;
        }
    } else {
        collect_dir_entries(source, &root, &root, manifest_id, previous_by_key, entries)?;
    }

    Ok(())
}

fn collect_dir_entries(
    source: &BackupSource,
    root: &Path,
    dir: &Path,
    manifest_id: &str,
    previous_by_key: &BTreeMap<String, BackupManifestEntry>,
    entries: &mut Vec<BackupManifestEntry>,
) -> Result<(), String> {
    for entry in fs::read_dir(dir)
        .map_err(|error| {
            format!(
                "Could not read backup source folder {}: {error}",
                dir.display()
            )
        })?
        .flatten()
    {
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path).map_err(|error| {
            format!(
                "Could not inspect backup source file {}: {error}",
                path.display()
            )
        })?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            collect_dir_entries(source, root, &path, manifest_id, previous_by_key, entries)?;
        } else if metadata.is_file() {
            collect_file_entry(source, root, &path, manifest_id, previous_by_key, entries)?;
        }
    }
    Ok(())
}

fn collect_file_entry(
    source: &BackupSource,
    canonical_root: &Path,
    file_path: &Path,
    manifest_id: &str,
    previous_by_key: &BTreeMap<String, BackupManifestEntry>,
    entries: &mut Vec<BackupManifestEntry>,
) -> Result<(), String> {
    let metadata = fs::symlink_metadata(file_path).map_err(|error| {
        format!(
            "Could not inspect backup source file {}: {error}",
            file_path.display()
        )
    })?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Ok(());
    }
    let canonical_file = file_path.canonicalize().map_err(|error| {
        format!(
            "Could not resolve backup source file {}: {error}",
            file_path.display()
        )
    })?;
    if !canonical_file.starts_with(canonical_root) {
        return Err(format!(
            "Refusing to back up {} because it resolves outside {}.",
            canonical_file.display(),
            canonical_root.display()
        ));
    }

    let relative = canonical_file
        .strip_prefix(canonical_root)
        .map_err(|_| "Could not calculate backup source relative path.".to_string())?;
    let relative_path = path_to_manifest_path(relative)?;
    let modified_unix = metadata
        .modified()
        .ok()
        .and_then(system_time_to_unix_timestamp);
    let mut entry = BackupManifestEntry {
        source_kind: source.kind.clone(),
        source_id: source.source_id.clone(),
        game_id: source.game_id.clone(),
        game_title: source.game_title.clone(),
        source_root: path_to_string(canonical_root.to_path_buf()),
        source_path: path_to_string(canonical_file),
        relative_path: relative_path.clone(),
        backup_relative_path: backup_relative_payload_path(
            manifest_id,
            &source.source_id,
            &relative_path,
        )?,
        size_bytes: metadata.len(),
        modified_at: modified_unix.map(unix_timestamp_to_iso),
        modified_unix,
        sha256: sha256_file(file_path)?,
    };

    if let Some(previous) = previous_by_key.get(&manifest_entry_key(&entry)) {
        if same_snapshot(previous, &entry) {
            entry.backup_relative_path = previous.backup_relative_path.clone();
        }
    }

    entries.push(entry);
    Ok(())
}

fn manifest_entry_to_plan_file(
    entry: BackupManifestEntry,
    previous_by_key: &BTreeMap<String, BackupManifestEntry>,
) -> BackupFilePlan {
    let action = previous_by_key
        .get(&manifest_entry_key(&entry))
        .map(|previous| {
            if same_snapshot(previous, &entry) {
                BackupFileAction::Unchanged
            } else {
                BackupFileAction::Changed
            }
        })
        .unwrap_or(BackupFileAction::New);

    BackupFilePlan {
        action,
        source_kind: entry.source_kind,
        source_id: entry.source_id,
        game_id: entry.game_id,
        game_title: entry.game_title,
        source_root: entry.source_root,
        source_path: entry.source_path,
        relative_path: entry.relative_path,
        backup_relative_path: entry.backup_relative_path,
        size_bytes: entry.size_bytes,
        modified_at: entry.modified_at,
        sha256: entry.sha256,
    }
}

fn plan_file_to_manifest_entry(file: &BackupFilePlan) -> BackupManifestEntry {
    BackupManifestEntry {
        source_kind: file.source_kind.clone(),
        source_id: file.source_id.clone(),
        game_id: file.game_id.clone(),
        game_title: file.game_title.clone(),
        source_root: file.source_root.clone(),
        source_path: file.source_path.clone(),
        relative_path: file.relative_path.clone(),
        backup_relative_path: file.backup_relative_path.clone(),
        size_bytes: file.size_bytes,
        modified_at: file.modified_at.clone(),
        modified_unix: None,
        sha256: file.sha256.clone(),
    }
}

fn restore_plan_for_entry(
    entry: &BackupManifestEntry,
    files_root: &Path,
    allowed_paths: &[RestoreAllowedPath],
) -> RestoreFilePlan {
    let backup_path = match safe_join_manifest_relative(files_root, &entry.backup_relative_path) {
        Ok(path) => path,
        Err(error) => {
            return restore_plan(entry, RestoreFileAction::MissingBackup, error);
        }
    };
    let backup_path = match backup_path.canonicalize() {
        Ok(path) => path,
        Err(error) => {
            return restore_plan(
                entry,
                RestoreFileAction::MissingBackup,
                format!("Backup payload is missing: {error}"),
            );
        }
    };
    if !backup_path.starts_with(files_root) || !backup_path.is_file() {
        return restore_plan(
            entry,
            RestoreFileAction::MissingBackup,
            "Backup payload is outside the backup files folder or is not a file.".to_string(),
        );
    }

    let restore_path = PathBuf::from(&entry.source_path);
    if !restore_path.is_absolute() || has_parent_component(&restore_path) {
        return restore_plan(
            entry,
            RestoreFileAction::Blocked,
            "Manifest restore path is not an absolute safe path.".to_string(),
        );
    }
    if !is_restore_path_allowed(&restore_path, allowed_paths) {
        return restore_plan(
            entry,
            RestoreFileAction::Blocked,
            "Restore path is not configured in the current launcher save roots or library data."
                .to_string(),
        );
    }
    if is_symlink(&restore_path) {
        return restore_plan(
            entry,
            RestoreFileAction::Blocked,
            "Restore destination is a symbolic link.".to_string(),
        );
    }

    if !restore_path.exists() {
        return restore_plan(
            entry,
            RestoreFileAction::Create,
            "Destination file is missing.".to_string(),
        );
    }
    if !restore_path.is_file() {
        return restore_plan(
            entry,
            RestoreFileAction::Blocked,
            "Restore destination exists but is not a file.".to_string(),
        );
    }

    match sha256_file(&restore_path) {
        Ok(hash) if hash == entry.sha256 => restore_plan(
            entry,
            RestoreFileAction::Unchanged,
            "Local file already matches manifest.".to_string(),
        ),
        Ok(_) => restore_plan(
            entry,
            RestoreFileAction::Overwrite,
            "Local file differs from manifest.".to_string(),
        ),
        Err(error) => restore_plan(entry, RestoreFileAction::Blocked, error),
    }
}

fn restore_plan(
    entry: &BackupManifestEntry,
    action: RestoreFileAction,
    message: String,
) -> RestoreFilePlan {
    RestoreFilePlan {
        action,
        source_kind: entry.source_kind.clone(),
        source_id: entry.source_id.clone(),
        game_id: entry.game_id.clone(),
        game_title: entry.game_title.clone(),
        restore_path: entry.source_path.clone(),
        backup_relative_path: entry.backup_relative_path.clone(),
        size_bytes: entry.size_bytes,
        sha256: entry.sha256.clone(),
        message,
    }
}

fn restore_allowed_paths(
    include_library_data: bool,
    game_filter: &HashSet<String>,
) -> Vec<RestoreAllowedPath> {
    let mut allowed = Vec::new();
    for game in read_installed_games_cache().unwrap_or_default() {
        if !game_filter.is_empty() && !game_filter.contains(&game.id) {
            continue;
        }
        for save_file in game.save_files {
            let path = PathBuf::from(save_file.path.trim());
            if !path.is_absolute() || has_parent_component(&path) {
                continue;
            }
            let exact_file = path.is_file();
            allowed.push(RestoreAllowedPath { path, exact_file });
        }
    }
    if include_library_data {
        if let Some(data_dir) = open_game_launcher_data_dir() {
            for file_name in LIBRARY_DB_FILES {
                allowed.push(RestoreAllowedPath {
                    path: data_dir.join(file_name),
                    exact_file: true,
                });
            }
        }
    }
    allowed
}

fn is_restore_path_allowed(path: &Path, allowed_paths: &[RestoreAllowedPath]) -> bool {
    allowed_paths.iter().any(|allowed| {
        if allowed.exact_file {
            path_eq(path, &allowed.path)
        } else {
            path_eq(path, &allowed.path) || path_inside(path, &allowed.path)
        }
    })
}

fn restore_manifest_path(
    paths: &BackupPaths,
    manifest_path: Option<&str>,
) -> Result<PathBuf, String> {
    match manifest_path
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(manifest_path) => {
            let candidate = PathBuf::from(manifest_path);
            if !candidate.is_absolute() || has_parent_component(&candidate) {
                return Err("Manifest path must be absolute and must not contain '..'.".to_string());
            }
            let canonical_candidate = candidate
                .canonicalize()
                .map_err(|error| format!("Could not resolve manifest path: {error}"))?;
            let canonical_latest = paths.latest_manifest.canonicalize().ok();
            let canonical_manifests_root = paths
                .manifests_root
                .canonicalize()
                .map_err(|error| format!("Could not resolve manifests folder: {error}"))?;
            if canonical_latest.as_ref() == Some(&canonical_candidate)
                || canonical_candidate.starts_with(&canonical_manifests_root)
            {
                Ok(canonical_candidate)
            } else {
                Err("Manifest path must be inside the selected backup target.".to_string())
            }
        }
        None => Ok(paths.latest_manifest.clone()),
    }
}

fn safety_path_for_restore_file(
    safety_root: &Path,
    file: &RestoreFilePlan,
) -> Result<PathBuf, String> {
    validate_manifest_relative_text(&file.source_id)?;
    let mut hasher = Sha256::new();
    hasher.update(file.restore_path.as_bytes());
    hasher.update(b"\n");
    hasher.update(file.backup_relative_path.as_bytes());
    let hash = bytes_to_hex(&hasher.finalize());
    let relative = format!("{}/{}.bak", file.source_id, &hash[..32]);
    safe_join_manifest_relative(safety_root, &relative)
}

fn write_backup_zip_archive(
    paths: &BackupPaths,
    manifest: &BackupManifest,
) -> Result<BackupArchiveResult, String> {
    fs::create_dir_all(&paths.archives_root)
        .map_err(|error| format!("Could not create backup archive folder: {error}"))?;

    let archive_path = paths
        .archives_root
        .join(format!("{}.zip", manifest.manifest_id));
    let archive_temp_path = paths
        .archives_root
        .join(format!("{}.zip.tmp", manifest.manifest_id));
    let archive_file = File::create(&archive_temp_path)
        .map_err(|error| format!("Could not create backup ZIP archive: {error}"))?;
    let mut zip = ZipWriter::new(archive_file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    let manifest_json = serde_json::to_vec_pretty(manifest)
        .map_err(|error| format!("Could not encode backup manifest for ZIP archive: {error}"))?;
    zip.start_file("manifest.json", options)
        .map_err(|error| format!("Could not start ZIP manifest entry: {error}"))?;
    zip.write_all(&manifest_json)
        .map_err(|error| format!("Could not write ZIP manifest entry: {error}"))?;

    for entry in &manifest.files {
        let payload_path =
            safe_join_manifest_relative(&paths.files_root, &entry.backup_relative_path)?;
        let mut payload_file = File::open(&payload_path).map_err(|error| {
            format!(
                "Could not open backup payload {} for ZIP archive: {error}",
                payload_path.display()
            )
        })?;
        let archive_entry_path = format!("files/{}", entry.backup_relative_path);
        zip.start_file(&archive_entry_path, options)
            .map_err(|error| format!("Could not start ZIP payload entry: {error}"))?;
        std::io::copy(&mut payload_file, &mut zip)
            .map_err(|error| format!("Could not write ZIP payload entry: {error}"))?;
    }

    zip.finish()
        .map_err(|error| format!("Could not finish backup ZIP archive: {error}"))?;
    fs::rename(&archive_temp_path, &archive_path)
        .map_err(|error| format!("Could not finalize backup ZIP archive: {error}"))?;
    let size_bytes = fs::metadata(&archive_path)
        .map_err(|error| format!("Could not inspect backup ZIP archive: {error}"))?
        .len();

    Ok(BackupArchiveResult {
        path: archive_path,
        size_bytes,
    })
}

fn write_manifest_file(path: &Path, manifest: &BackupManifest) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create manifest folder: {error}"))?;
    }
    let json = serde_json::to_string_pretty(manifest)
        .map_err(|error| format!("Could not encode backup manifest: {error}"))?;
    fs::write(path, json).map_err(|error| format!("Could not write backup manifest: {error}"))
}

fn read_manifest_if_exists(path: &Path) -> Result<Option<BackupManifest>, String> {
    if path.exists() {
        read_manifest(path).map(Some)
    } else {
        Ok(None)
    }
}

fn read_manifest(path: &Path) -> Result<BackupManifest, String> {
    let text = fs::read_to_string(path)
        .map_err(|error| format!("Could not read backup manifest {}: {error}", path.display()))?;
    serde_json::from_str(&text).map_err(|error| {
        format!(
            "Could not decode backup manifest {}: {error}",
            path.display()
        )
    })
}

fn manifest_status(manifest: &BackupManifest, manifest_path: String) -> BackupManifestStatus {
    let game_count = manifest
        .files
        .iter()
        .filter_map(|file| file.game_id.as_deref())
        .collect::<BTreeSet<_>>()
        .len();
    let library_file_count = manifest
        .files
        .iter()
        .filter(|file| file.source_kind == BackupSourceKind::LibraryData)
        .count();
    BackupManifestStatus {
        manifest_id: manifest.manifest_id.clone(),
        created_at: manifest.created_at.clone(),
        manifest_path,
        file_count: manifest.files.len(),
        game_count,
        library_file_count,
        total_bytes: manifest.files.iter().map(|file| file.size_bytes).sum(),
    }
}

fn index_manifest_entries(manifest: &BackupManifest) -> BTreeMap<String, BackupManifestEntry> {
    manifest
        .files
        .iter()
        .cloned()
        .map(|entry| (manifest_entry_key(&entry), entry))
        .collect()
}

fn manifest_entry_key(entry: &BackupManifestEntry) -> String {
    format!(
        "{:?}\n{}\n{}",
        entry.source_kind,
        normalize_path_key(&entry.source_root),
        entry.relative_path
    )
}

fn same_snapshot(previous: &BackupManifestEntry, current: &BackupManifestEntry) -> bool {
    previous.size_bytes == current.size_bytes && previous.sha256 == current.sha256
}

fn should_include_previous_removed(
    previous: &BackupManifestEntry,
    include_library_data: bool,
    game_filter: &HashSet<String>,
) -> bool {
    match previous.source_kind {
        BackupSourceKind::LibraryData => include_library_data,
        BackupSourceKind::Save => {
            game_filter.is_empty()
                || previous
                    .game_id
                    .as_ref()
                    .map(|game_id| game_filter.contains(game_id))
                    .unwrap_or(false)
        }
    }
}

fn should_restore_entry(
    entry: &BackupManifestEntry,
    include_library_data: bool,
    game_filter: &HashSet<String>,
) -> bool {
    should_include_previous_removed(entry, include_library_data, game_filter)
}

fn summarize_backup_files(files: &[BackupFilePlan], missing_sources: usize) -> BackupSummary {
    let mut summary = BackupSummary {
        total_files: files
            .iter()
            .filter(|file| !matches!(file.action, BackupFileAction::Removed))
            .count(),
        missing_sources,
        ..BackupSummary::default()
    };
    for file in files {
        match file.action {
            BackupFileAction::New => {
                summary.new_files += 1;
                summary.bytes_to_copy = summary.bytes_to_copy.saturating_add(file.size_bytes);
            }
            BackupFileAction::Changed => {
                summary.changed_files += 1;
                summary.bytes_to_copy = summary.bytes_to_copy.saturating_add(file.size_bytes);
            }
            BackupFileAction::Unchanged => summary.unchanged_files += 1,
            BackupFileAction::Removed => summary.removed_files += 1,
        }
        if !matches!(file.action, BackupFileAction::Removed) {
            summary.total_bytes = summary.total_bytes.saturating_add(file.size_bytes);
        }
    }
    summary
}

fn summarize_restore_files(files: &[RestoreFilePlan]) -> RestoreSummary {
    let mut summary = RestoreSummary {
        total_files: files.len(),
        ..RestoreSummary::default()
    };
    for file in files {
        match file.action {
            RestoreFileAction::Create => {
                summary.create_files += 1;
                summary.bytes_to_restore = summary.bytes_to_restore.saturating_add(file.size_bytes);
            }
            RestoreFileAction::Overwrite => {
                summary.overwrite_files += 1;
                summary.bytes_to_restore = summary.bytes_to_restore.saturating_add(file.size_bytes);
            }
            RestoreFileAction::Unchanged => summary.unchanged_files += 1,
            RestoreFileAction::Blocked => summary.blocked_files += 1,
            RestoreFileAction::MissingBackup => summary.missing_backup_files += 1,
        }
    }
    summary
}

fn reject_target_inside_sources(target_dir: &Path, sources: &[BackupSource]) -> Result<(), String> {
    for source in sources {
        let Ok(source_root) = source.root.canonicalize() else {
            continue;
        };
        if source_root.is_dir() && target_dir.starts_with(&source_root) {
            return Err(format!(
                "Backup target {} is inside configured source {}.",
                target_dir.display(),
                source_root.display()
            ));
        }
    }
    Ok(())
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file =
        File::open(path).map_err(|error| format!("Could not open {}: {error}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("Could not read {}: {error}", path.display()))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(bytes_to_hex(&hasher.finalize()))
}

fn sha256_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    bytes_to_hex(&hasher.finalize())
}

fn bytes_to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

fn new_manifest_id() -> String {
    let timestamp = unix_timestamp_to_iso(current_unix_timestamp()).replace([':', '.'], "-");
    let uuid = Uuid::new_v4().simple().to_string();
    format!("backup-{timestamp}-{}", &uuid[..8])
}

fn stable_source_id(kind: &str, id: &str, path: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(kind.as_bytes());
    hasher.update(b"\n");
    hasher.update(id.as_bytes());
    hasher.update(b"\n");
    hasher.update(path.as_bytes());
    let hash = bytes_to_hex(&hasher.finalize());
    let label = slugify(id);
    let label = if label.is_empty() {
        kind.to_string()
    } else {
        label
    };
    format!("{kind}-{label}-{}", &hash[..12])
}

fn normalized_filter(values: &[String]) -> HashSet<String> {
    values
        .iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect()
}

fn backup_relative_payload_path(
    manifest_id: &str,
    source_id: &str,
    relative_path: &str,
) -> Result<String, String> {
    validate_manifest_relative_text(manifest_id)?;
    validate_manifest_relative_text(source_id)?;
    validate_manifest_relative_text(relative_path)?;
    Ok(format!("{manifest_id}/{source_id}/{relative_path}"))
}

fn path_to_manifest_path(path: &Path) -> Result<String, String> {
    let mut parts = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(value) => {
                let Some(value) = value.to_str() else {
                    return Err("Backup paths must be valid UTF-8.".to_string());
                };
                if value.is_empty() {
                    return Err("Backup path contains an empty path segment.".to_string());
                }
                parts.push(value.to_string());
            }
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err("Backup relative paths must not escape their source root.".to_string());
            }
        }
    }
    if parts.is_empty() {
        return Err("Backup relative path must not be empty.".to_string());
    }
    Ok(parts.join("/"))
}

fn validate_manifest_relative_text(value: &str) -> Result<(), String> {
    let path = Path::new(value);
    if path.is_absolute() || has_parent_component(path) {
        return Err("Manifest relative paths must not be absolute or contain '..'.".to_string());
    }
    let mut has_normal_component = false;
    for component in path.components() {
        match component {
            Component::Normal(_) => has_normal_component = true,
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err("Manifest relative paths must not escape the backup root.".to_string());
            }
        }
    }
    if !has_normal_component {
        return Err("Manifest relative paths must not be empty.".to_string());
    }
    Ok(())
}

fn safe_join_manifest_relative(root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    validate_manifest_relative_text(relative_path)?;
    let mut output = root.to_path_buf();
    for component in Path::new(relative_path).components() {
        match component {
            Component::Normal(value) => output.push(value),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err("Manifest relative paths must not escape the backup root.".to_string());
            }
        }
    }
    Ok(output)
}

fn has_parent_component(path: &Path) -> bool {
    path.components()
        .any(|component| matches!(component, Component::ParentDir))
}

fn normalize_path_key(path: &str) -> String {
    if cfg!(windows) {
        path.replace('\\', "/").to_lowercase()
    } else {
        path.to_string()
    }
}

fn path_eq(left: &Path, right: &Path) -> bool {
    if cfg!(windows) {
        left.to_string_lossy()
            .eq_ignore_ascii_case(&right.to_string_lossy())
    } else {
        left == right
    }
}

fn path_inside(path: &Path, root: &Path) -> bool {
    if let (Ok(path), Ok(root)) = (path.canonicalize(), root.canonicalize()) {
        return path.starts_with(root);
    }
    if cfg!(windows) {
        path.to_string_lossy()
            .to_lowercase()
            .starts_with(&root.to_string_lossy().to_lowercase())
    } else {
        path.starts_with(root)
    }
}

fn is_symlink(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .map(|metadata| metadata.file_type().is_symlink())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{env, fs};
    use zip::ZipArchive;

    fn write_proof_request(target_path: String) -> BackupExternalDriveWriteProofRequest {
        BackupExternalDriveWriteProofRequest {
            expected_mount_point: target_path.clone(),
            consent: BackupExternalDriveWriteProofConsent {
                accepted: true,
                operation: "sentinel_write_read_checksum_delete".to_string(),
                target_path: target_path.clone(),
            },
            target_path,
        }
    }

    fn eject_safety_request(target_path: String) -> BackupExternalDriveEjectSafetyRequest {
        BackupExternalDriveEjectSafetyRequest {
            expected_mount_point: target_path.clone(),
            consent: BackupExternalDriveEjectSafetyConsent {
                accepted: true,
                operation: "flush_write_delete_before_eject_review".to_string(),
                target_path: target_path.clone(),
            },
            target_path,
        }
    }

    fn os_eject_request(target_path: String) -> BackupExternalDriveOsEjectRequest {
        BackupExternalDriveOsEjectRequest {
            expected_mount_point: target_path.clone(),
            preflight_proof_id: "preflight-proof-1".to_string(),
            consent: BackupExternalDriveOsEjectConsent {
                accepted: true,
                operation: "os_eject_unmount_removable_target".to_string(),
                target_path: target_path.clone(),
            },
            target_path,
        }
    }

    fn removable_write_proof_disk(path: &Path) -> BackupWriteProofDiskEvidence {
        BackupWriteProofDiskEvidence {
            file_system: "exfat".to_string(),
            is_read_only: false,
            is_removable: true,
            mount_point: path_to_string(path.to_path_buf()),
            name: "OG_BACKUP_USB".to_string(),
        }
    }

    #[test]
    fn safe_join_rejects_path_escape() {
        let root = PathBuf::from("/tmp/og-backup-root");
        assert!(safe_join_manifest_relative(&root, "game/save.dat").is_ok());
        assert!(safe_join_manifest_relative(&root, "").is_err());
        assert!(safe_join_manifest_relative(&root, ".").is_err());
        assert!(safe_join_manifest_relative(&root, "../save.dat").is_err());
        assert!(safe_join_manifest_relative(&root, "/etc/passwd").is_err());
    }

    #[test]
    fn manifest_diff_reuses_payload_for_unchanged_file() {
        let temp = env::temp_dir().join(format!("ogl-backup-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&temp).unwrap();
        let save_file = temp.join("save.dat");
        fs::write(&save_file, b"same").unwrap();

        let source = BackupSource {
            kind: BackupSourceKind::Save,
            source_id: "save-game-a".to_string(),
            game_id: Some("game-a".to_string()),
            game_title: Some("Game A".to_string()),
            root: temp.clone(),
            include_files: Some(vec![save_file.clone()]),
        };

        let mut first_entries = Vec::new();
        collect_entries_for_source(&source, "manifest-a", &BTreeMap::new(), &mut first_entries)
            .unwrap();
        let previous = first_entries[0].clone();
        let previous_path = previous.backup_relative_path.clone();
        let previous_by_key = [(manifest_entry_key(&previous), previous)]
            .into_iter()
            .collect::<BTreeMap<_, _>>();

        let mut second_entries = Vec::new();
        collect_entries_for_source(&source, "manifest-b", &previous_by_key, &mut second_entries)
            .unwrap();
        assert_eq!(second_entries[0].backup_relative_path, previous_path);

        fs::write(&save_file, b"changed").unwrap();
        let mut changed_entries = Vec::new();
        collect_entries_for_source(
            &source,
            "manifest-c",
            &previous_by_key,
            &mut changed_entries,
        )
        .unwrap();
        assert_ne!(changed_entries[0].backup_relative_path, previous_path);

        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn zip_archive_contains_manifest_and_payload_files() {
        let temp = env::temp_dir().join(format!("ogl-backup-zip-test-{}", Uuid::new_v4()));
        let target_dir = temp.join("target");
        let files_root = target_dir.join(BACKUP_DIR_NAME).join(FILES_DIR_NAME);
        let manifests_root = target_dir.join(BACKUP_DIR_NAME).join(MANIFESTS_DIR_NAME);
        let archives_root = target_dir.join(BACKUP_DIR_NAME).join(ARCHIVES_DIR_NAME);
        fs::create_dir_all(&files_root).unwrap();

        let backup_relative_path = "manifest-a/source-a/save.dat";
        let payload_path = safe_join_manifest_relative(&files_root, backup_relative_path).unwrap();
        fs::create_dir_all(payload_path.parent().unwrap()).unwrap();
        fs::write(&payload_path, b"zip payload").unwrap();

        let manifest = BackupManifest {
            created_at: "2026-06-10T10:00:00.000Z".to_string(),
            files: vec![BackupManifestEntry {
                backup_relative_path: backup_relative_path.to_string(),
                game_id: Some("game-a".to_string()),
                game_title: Some("Game A".to_string()),
                modified_at: None,
                modified_unix: None,
                relative_path: "save.dat".to_string(),
                sha256: "sha".to_string(),
                size_bytes: 11,
                source_id: "source-a".to_string(),
                source_kind: BackupSourceKind::Save,
                source_path: "/games/a/save.dat".to_string(),
                source_root: "/games/a".to_string(),
            }],
            format_version: MANIFEST_FORMAT_VERSION,
            manifest_id: "manifest-a".to_string(),
            target_path: path_to_string(target_dir.clone()),
        };
        let paths = BackupPaths {
            archives_root,
            backup_root: target_dir.join(BACKUP_DIR_NAME),
            files_root,
            latest_manifest: target_dir.join(BACKUP_DIR_NAME).join(LATEST_MANIFEST_FILE),
            manifests_root,
            target_dir,
        };

        let archive_result = write_backup_zip_archive(&paths, &manifest).unwrap();
        assert!(archive_result.path.exists());
        assert!(archive_result.size_bytes > 0);

        let archive_file = File::open(&archive_result.path).unwrap();
        let mut archive = ZipArchive::new(archive_file).unwrap();
        let mut manifest_text = String::new();
        archive
            .by_name("manifest.json")
            .unwrap()
            .read_to_string(&mut manifest_text)
            .unwrap();
        assert!(manifest_text.contains("\"manifestId\": \"manifest-a\""));

        let mut payload = String::new();
        archive
            .by_name("files/manifest-a/source-a/save.dat")
            .unwrap()
            .read_to_string(&mut payload)
            .unwrap();
        assert_eq!(payload, "zip payload");

        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn external_drive_write_proof_writes_reads_hashes_and_deletes_sentinel() {
        let temp = env::temp_dir().join(format!("ogl-backup-proof-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&temp).unwrap();
        let request = write_proof_request(path_to_string(temp.clone()));
        let disks = vec![removable_write_proof_disk(&temp)];

        let proof =
            prove_backup_external_drive_write_with_expected_sha(&request, &disks, None).unwrap();

        assert!(proof.success);
        assert_eq!(proof.proof_id.len(), 32);
        assert!(proof.cleanup_deleted);
        assert!(proof.checksum_matched);
        assert!(proof.bytes_written > 0);
        assert_eq!(proof.bytes_read, proof.bytes_written);
        assert_eq!(proof.sha256.len(), 64);
        assert!(proof.proof_path.contains("write-proof-"));
        assert!(!PathBuf::from(&proof.proof_path).exists());
        assert!(temp.join(BACKUP_DIR_NAME).join(PROOF_DIR_NAME).exists());

        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn external_drive_write_proof_rejects_relative_or_escaping_targets() {
        let disks = Vec::new();
        assert!(prove_backup_external_drive_write_with_expected_sha(
            &write_proof_request("relative/backups".to_string()),
            &disks,
            None,
        )
        .is_err());
        assert!(prove_backup_external_drive_write_with_expected_sha(
            &write_proof_request("/tmp/../backups".to_string()),
            &disks,
            None,
        )
        .is_err());
    }

    #[test]
    fn external_drive_write_proof_deletes_sentinel_on_checksum_mismatch() {
        let temp = env::temp_dir().join(format!("ogl-backup-proof-mismatch-{}", Uuid::new_v4()));
        fs::create_dir_all(&temp).unwrap();
        let request = write_proof_request(path_to_string(temp.clone()));
        let disks = vec![removable_write_proof_disk(&temp)];

        let error = prove_backup_external_drive_write_with_expected_sha(
            &request,
            &disks,
            Some("not-the-real-sha".to_string()),
        )
        .unwrap_err();

        assert!(error.contains("checksum mismatch"));
        let proof_root = temp.join(BACKUP_DIR_NAME).join(PROOF_DIR_NAME);
        let leftover_entries = fs::read_dir(&proof_root)
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert!(leftover_entries.is_empty());

        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn external_drive_eject_safety_flushes_deletes_and_reports_os_handoff() {
        let temp = env::temp_dir().join(format!("ogl-backup-eject-proof-{}", Uuid::new_v4()));
        fs::create_dir_all(&temp).unwrap();
        let request = eject_safety_request(path_to_string(temp.clone()));
        let disks = vec![removable_write_proof_disk(&temp)];

        let proof = prove_backup_external_drive_eject_safety_with_disks(&request, &disks).unwrap();

        assert!(proof.success);
        assert_eq!(proof.proof_id.len(), 32);
        assert!(proof.sync_completed);
        assert!(proof.cleanup_deleted);
        assert!(proof.ready_for_os_eject);
        assert!(proof.pending_proof_files.is_empty());
        assert_eq!(proof.bytes_read, proof.bytes_written);
        assert_eq!(proof.sha256.len(), 64);
        assert!(proof.proof_path.contains("eject-proof-"));
        assert!(!PathBuf::from(&proof.proof_path).exists());
        assert!(proof
            .recommended_next_step
            .contains("operating system eject"));

        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn external_drive_eject_safety_requires_matching_consent() {
        let temp = env::temp_dir().join(format!("ogl-backup-eject-consent-{}", Uuid::new_v4()));
        fs::create_dir_all(&temp).unwrap();
        let mut request = eject_safety_request(path_to_string(temp.clone()));
        request.consent.operation = "sentinel_write_read_checksum_delete".to_string();
        let disks = vec![removable_write_proof_disk(&temp)];

        let error =
            prove_backup_external_drive_eject_safety_with_disks(&request, &disks).unwrap_err();

        assert!(error.contains("operation mismatch"));
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn external_drive_eject_safety_blocks_pending_proof_files() {
        let temp = env::temp_dir().join(format!("ogl-backup-eject-pending-{}", Uuid::new_v4()));
        let proof_root = temp.join(BACKUP_DIR_NAME).join(PROOF_DIR_NAME);
        fs::create_dir_all(&proof_root).unwrap();
        fs::write(proof_root.join("write-proof-leftover.tmp"), b"pending").unwrap();
        let request = eject_safety_request(path_to_string(temp.clone()));
        let disks = vec![removable_write_proof_disk(&temp)];

        let error =
            prove_backup_external_drive_eject_safety_with_disks(&request, &disks).unwrap_err();

        assert!(error.contains("pending proof files"));
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn external_drive_os_eject_requires_matching_consent() {
        let temp = env::temp_dir().join(format!("ogl-backup-os-eject-consent-{}", Uuid::new_v4()));
        fs::create_dir_all(&temp).unwrap();
        let mut request = os_eject_request(path_to_string(temp.clone()));
        request.consent.operation = "flush_write_delete_before_eject_review".to_string();
        let disks = vec![removable_write_proof_disk(&temp)];

        let error = eject_backup_external_drive_with_runner(
            &request,
            &disks,
            |_| Ok(()),
            Vec::<BackupWriteProofDiskEvidence>::new,
        )
        .unwrap_err();

        assert!(error.contains("operation mismatch"));
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn external_drive_os_eject_blocks_pending_proof_before_command() {
        let temp = env::temp_dir().join(format!("ogl-backup-os-eject-pending-{}", Uuid::new_v4()));
        let proof_root = temp.join(BACKUP_DIR_NAME).join(PROOF_DIR_NAME);
        fs::create_dir_all(&proof_root).unwrap();
        fs::write(proof_root.join("eject-proof-leftover.tmp"), b"pending").unwrap();
        let request = os_eject_request(path_to_string(temp.clone()));
        let disks = vec![removable_write_proof_disk(&temp)];
        let command_called = std::cell::Cell::new(false);

        let error = eject_backup_external_drive_with_runner(
            &request,
            &disks,
            |_| {
                command_called.set(true);
                Ok(())
            },
            Vec::<BackupWriteProofDiskEvidence>::new,
        )
        .unwrap_err();

        assert!(error.contains("pending proof files"));
        assert!(!command_called.get());
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn external_drive_os_eject_does_not_claim_success_when_command_fails() {
        let temp = env::temp_dir().join(format!("ogl-backup-os-eject-fail-{}", Uuid::new_v4()));
        fs::create_dir_all(&temp).unwrap();
        let request = os_eject_request(path_to_string(temp.clone()));
        let disks = vec![removable_write_proof_disk(&temp)];

        let error = eject_backup_external_drive_with_runner(
            &request,
            &disks,
            |_| Err("OS denied unmount".to_string()),
            Vec::<BackupWriteProofDiskEvidence>::new,
        )
        .unwrap_err();

        assert!(error.contains("OS denied unmount"));
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn external_drive_os_eject_requires_mount_disappearance_after_command() {
        let temp = env::temp_dir().join(format!("ogl-backup-os-eject-still-{}", Uuid::new_v4()));
        fs::create_dir_all(&temp).unwrap();
        let request = os_eject_request(path_to_string(temp.clone()));
        let disks = vec![removable_write_proof_disk(&temp)];
        let refreshed = disks.clone();

        let error = eject_backup_external_drive_with_runner(
            &request,
            &disks,
            |_| Ok(()),
            || refreshed.clone(),
        )
        .unwrap_err();

        assert!(error.contains("mount is still present"));
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn external_drive_os_eject_reports_success_only_after_mount_disappears() {
        let temp = env::temp_dir().join(format!("ogl-backup-os-eject-ok-{}", Uuid::new_v4()));
        fs::create_dir_all(&temp).unwrap();
        let request = os_eject_request(path_to_string(temp.clone()));
        let disks = vec![removable_write_proof_disk(&temp)];
        let command_label = std::cell::RefCell::new(String::new());

        let result = eject_backup_external_drive_with_runner(
            &request,
            &disks,
            |command| {
                command_label.replace(command.command_label.clone());
                Ok(())
            },
            Vec::<BackupWriteProofDiskEvidence>::new,
        )
        .unwrap();

        assert!(result.success);
        assert!(result.unmounted);
        assert_eq!(result.preflight_proof_id, "preflight-proof-1");
        assert_eq!(result.final_preflight_proof_id.len(), 32);
        assert!(result.message.contains("mount is no longer listed"));
        assert!(!command_label.borrow().is_empty());
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn external_drive_os_eject_builds_platform_commands_without_shell() {
        let mut disk = BackupWriteProofDiskEvidence {
            file_system: "exfat".to_string(),
            is_read_only: false,
            is_removable: true,
            mount_point: "/media/og-usb".to_string(),
            name: "/dev/sdb1".to_string(),
        };

        let linux = backup_os_eject_command_for_platform("linux", &disk).unwrap();
        assert_eq!(linux.program, "udisksctl");
        assert_eq!(linux.args, ["unmount", "-b", "/dev/sdb1"]);

        disk.name = "OG_BACKUP_USB".to_string();
        let linux_fallback = backup_os_eject_command_for_platform("linux", &disk).unwrap();
        assert_eq!(linux_fallback.program, "umount");
        assert_eq!(linux_fallback.args, ["/media/og-usb"]);

        let macos = backup_os_eject_command_for_platform("macos", &disk).unwrap();
        assert_eq!(macos.program, "diskutil");
        assert_eq!(macos.args, ["unmount", "/media/og-usb"]);

        disk.mount_point = "d:\\".to_string();
        let windows = backup_os_eject_command_for_platform("windows", &disk).unwrap();
        assert_eq!(windows.program, "powershell.exe");
        assert_eq!(
            windows.args[..3],
            ["-NoProfile", "-NonInteractive", "-Command"]
        );
        assert!(windows.args[3].contains("Win32_Volume"));
        assert!(windows.args[3].contains("DriveLetter='D:'"));
        assert!(windows.args[3].contains("Dismount"));
        assert_eq!(windows.command_label, "PowerShell Win32_Volume.Dismount D:");

        disk.mount_point = "D:\\Backups".to_string();
        let windows_error = backup_os_eject_command_for_platform("windows", &disk).unwrap_err();
        assert!(windows_error.contains("drive root"));
    }

    #[test]
    fn restore_path_requires_configured_root() {
        let allowed = vec![RestoreAllowedPath {
            path: PathBuf::from("/tmp/allowed-save"),
            exact_file: false,
        }];
        assert!(is_restore_path_allowed(
            &PathBuf::from("/tmp/allowed-save/profile/save.dat"),
            &allowed
        ));
        assert!(!is_restore_path_allowed(
            &PathBuf::from("/tmp/not-allowed/save.dat"),
            &allowed
        ));
    }

    #[test]
    fn restore_safety_path_accepts_absolute_destination_without_escape() {
        let root = PathBuf::from("/tmp/og-restore-safety");
        let file = RestoreFilePlan {
            action: RestoreFileAction::Overwrite,
            source_kind: BackupSourceKind::Save,
            source_id: "save-game-a".to_string(),
            game_id: Some("game-a".to_string()),
            game_title: Some("Game A".to_string()),
            restore_path: "/tmp/allowed-save/profile/save.dat".to_string(),
            backup_relative_path: "manifest-a/save-game-a/save.dat".to_string(),
            size_bytes: 4,
            sha256: "abcd".to_string(),
            message: "Local file differs from manifest.".to_string(),
        };

        let safety_path = safety_path_for_restore_file(&root, &file).unwrap();

        assert!(safety_path.starts_with(&root));
        assert_eq!(
            safety_path.extension().and_then(|value| value.to_str()),
            Some("bak")
        );
    }

    #[test]
    fn scheduler_config_normalizes_target_and_defaults_enabled_state() {
        let config = normalize_scheduler_config(BackupSchedulerConfig {
            cadence: BackupSchedulerCadence::Daily,
            compression: BackupCompressionMode::Zip,
            enabled: true,
            include_library_data: false,
            target_path: "  /tmp/og-backups  ".to_string(),
            updated_at: Some("2026-06-10T12:00:00Z".to_string()),
        })
        .unwrap();

        assert!(config.enabled);
        assert_eq!(config.target_path, "/tmp/og-backups");
        assert_eq!(config.compression, BackupCompressionMode::Zip);
        assert_eq!(config.cadence, BackupSchedulerCadence::Daily);
        assert_eq!(config.updated_at.as_deref(), Some("2026-06-10T12:00:00Z"));
    }

    #[test]
    fn scheduler_config_rejects_relative_or_escaping_target() {
        let relative = BackupSchedulerConfig {
            cadence: BackupSchedulerCadence::Weekly,
            compression: BackupCompressionMode::None,
            enabled: true,
            include_library_data: true,
            target_path: "backups".to_string(),
            updated_at: None,
        };
        assert!(normalize_scheduler_config(relative).is_err());

        let escaping = BackupSchedulerConfig {
            target_path: "/tmp/../backups".to_string(),
            ..BackupSchedulerConfig {
                cadence: BackupSchedulerCadence::Weekly,
                compression: BackupCompressionMode::None,
                enabled: true,
                include_library_data: true,
                target_path: String::new(),
                updated_at: None,
            }
        };
        assert!(normalize_scheduler_config(escaping).is_err());
    }

    #[test]
    fn scheduler_units_include_headless_argument_and_cadence() {
        let service = linux_systemd_service_unit(&PathBuf::from("/opt/OG Launcher/open-game"));
        assert!(service.contains("ExecStart=\"/opt/OG Launcher/open-game\""));
        assert!(service.contains(HEADLESS_BACKUP_SCHEDULER_ARG));

        let timer = linux_systemd_timer_unit(&BackupSchedulerCadence::Weekly);
        assert!(timer.contains("OnCalendar=weekly"));
        assert!(timer.contains("Persistent=true"));
    }

    #[test]
    fn macos_plist_escapes_path_and_sets_interval() {
        let plist = macos_launch_agent_plist(
            &PathBuf::from("/Applications/OG & Launcher.app/Contents/MacOS/open-game"),
            &BackupSchedulerCadence::Daily,
        );

        assert!(plist.contains("OG &amp; Launcher.app"));
        assert!(plist.contains(HEADLESS_BACKUP_SCHEDULER_ARG));
        assert!(plist.contains("<integer>86400</integer>"));
    }
}
