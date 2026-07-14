use futures_util::StreamExt;
use reqwest::{
    header::{HeaderMap, CONTENT_TYPE, LOCATION},
    redirect, StatusCode, Url,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{hash_map::Entry, HashMap, HashSet},
    fs::{self, OpenOptions},
    io::{Read, Write},
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex, OnceLock,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::Emitter;
use tokio::sync::watch;
use uuid::Uuid;

use crate::commands::{
    games::{
        open_game_launcher_data_dir, open_uri, path_to_string, read_installed_games_cache_result,
    },
    local_db,
};

const MOD_INSTALL_QUEUE_COLLECTION: &str = "mod_install_queue";
const MOD_INSTALLS_COLLECTION: &str = "mod_installs";
const MOD_MANIFEST_DIR: &str = ".og-mods";
const MOD_DISABLED_DIR: &str = ".og-disabled";
const MOD_MANIFEST_VERSION: u32 = 2;
const MAX_REMOTE_MOD_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_EXTRACTED_MOD_BYTES: u64 = 4 * 1024 * 1024 * 1024;
const MAX_MOD_ARCHIVE_ENTRIES: usize = 50_000;
const MAX_REMOTE_REDIRECTS: usize = 5;
const REMOTE_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const REMOTE_REQUEST_TIMEOUT: Duration = Duration::from_secs(30 * 60);
const REMOTE_READ_TIMEOUT: Duration = Duration::from_secs(30);
const REMOTE_DNS_TIMEOUT: Duration = Duration::from_secs(10);
const NEXUS_DOWNLOAD_HOST_SUFFIXES: &[&str] = &["nexusmods.com", "nexus-cdn.com"];
const NEXUS_DOWNLOAD_HOSTS: &[&str] = &["nexus-files.b-cdn.net"];

/// Persistence-compatible provider values for historical queue entries and
/// ownership manifests. New renderer commands use `mod_manager::ModProvider`,
/// whose public contract contains only Nexus and Steam Workshop.
#[derive(Debug, Serialize, Deserialize, Clone, Copy, Eq, PartialEq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ModProvider {
    Nexus,
    SteamWorkshop,
    Modio,
    Curseforge,
    DirectUrl,
    LocalArchive,
    LocalFolder,
}

impl ModProvider {
    fn is_active(self) -> bool {
        matches!(self, Self::Nexus | Self::SteamWorkshop)
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Nexus => "nexus",
            Self::SteamWorkshop => "steam_workshop",
            Self::Modio => "modio",
            Self::Curseforge => "curseforge",
            Self::DirectUrl => "direct_url",
            Self::LocalArchive => "local_archive",
            Self::LocalFolder => "local_folder",
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ModInstallStatus {
    Queued,
    Starting,
    Downloading,
    Delegated,
    Installing,
    Completed,
    Failed,
    Cancelled,
}

impl ModInstallStatus {
    fn is_cancellable(self) -> bool {
        matches!(self, Self::Queued | Self::Starting | Self::Downloading)
    }
}

/// Provider-authenticated Nexus download metadata. This type is intentionally
/// not deserializable and is only constructed by `mod_manager` after querying
/// the official Nexus API. The generic renderer-facing install command cannot
/// opt into this trust policy.
#[derive(Debug, Clone)]
pub(crate) struct TrustedNexusInstallRequest {
    pub game_id: String,
    pub catalog_item_id: String,
    pub file_id: String,
    pub title: String,
    pub version_id: Option<String>,
    pub download_url: String,
    pub file_name: String,
    pub expected_size: TrustedNexusExpectedSize,
    pub provider_page_url: String,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub(crate) struct TrustedNexusExpectedSize {
    pub bytes: u64,
    /// The v1 API normally returns an exact byte field. Older responses only
    /// expose rounded KiB, for which a one-KiB tolerance is required.
    pub exact: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModInstallResult {
    pub install_id: String,
    pub game_id: String,
    pub status: ModInstallStatus,
    pub provider: ModProvider,
    pub target_path: Option<String>,
    pub installed_files: Vec<String>,
    pub delegated_url: Option<String>,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModInstallQueueItem {
    pub id: String,
    pub install_id: String,
    pub game_id: String,
    pub title: String,
    pub provider: ModProvider,
    pub progress: u32,
    pub speed: String,
    pub status: ModInstallStatus,
    pub phase: String,
    pub bytes_downloaded: Option<u64>,
    pub bytes_total: Option<u64>,
    pub can_pause: bool,
    pub can_cancel: bool,
    pub external: bool,
    pub target_path: Option<String>,
    pub delegated_url: Option<String>,
    pub error: Option<String>,
    pub last_updated_at: u64,
    #[serde(default)]
    pub event_revision: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstalledModInfo {
    pub id: String,
    pub install_id: String,
    pub game_id: String,
    pub title: String,
    pub provider: ModProvider,
    pub enabled: bool,
    pub target_path: String,
    pub installed_files: Vec<String>,
    pub profile_id: Option<String>,
    pub catalog_item_id: Option<String>,
    pub version_id: Option<String>,
    #[serde(default)]
    pub provider_file_id: Option<String>,
    pub source_url: Option<String>,
    pub installed_at: u64,
    #[serde(default)]
    manifest_version: u32,
    #[serde(default)]
    file_records: Vec<ModInstalledFileRecord>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
struct ModInstalledFileRecord {
    relative_path: String,
    owner_install_id: String,
    installed_sha256: String,
    installed_size: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    backup: Option<ModBackupRecord>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
struct ModBackupRecord {
    owner_install_id: String,
    backup_relative_path: String,
    original_sha256: String,
    original_size: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ModInstallManifest {
    install_id: String,
    game_id: String,
    title: String,
    provider: ModProvider,
    enabled: bool,
    target_path: String,
    installed_files: Vec<String>,
    profile_id: Option<String>,
    catalog_item_id: Option<String>,
    version_id: Option<String>,
    #[serde(default)]
    provider_file_id: Option<String>,
    source_url: Option<String>,
    installed_at: u64,
    #[serde(default)]
    manifest_version: u32,
    #[serde(default)]
    file_records: Vec<ModInstalledFileRecord>,
}

struct ActiveModInstall {
    item: ModInstallQueueItem,
    cancel_tx: watch::Sender<bool>,
}

type ModInstallMap = Arc<Mutex<HashMap<String, ActiveModInstall>>>;

fn get_mod_install_manager() -> &'static ModInstallMap {
    static MANAGER: OnceLock<ModInstallMap> = OnceLock::new();
    MANAGER.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

fn reserve_mod_install_in_map(
    manager: &ModInstallMap,
    install_id: &str,
    active: ActiveModInstall,
) -> Result<(), String> {
    let mut guard = manager
        .lock()
        .map_err(|error| format!("Mod install manager lock poisoned: {error}"))?;
    match guard.entry(install_id.to_string()) {
        Entry::Vacant(entry) => {
            entry.insert(active);
            Ok(())
        }
        Entry::Occupied(_) => Err(format!(
            "Mod install ID '{install_id}' is already occupied; refusing to replace it."
        )),
    }
}

fn normalize_mod_queue_item(mut item: ModInstallQueueItem, active: bool) -> ModInstallQueueItem {
    item.can_pause = false;
    if !active
        && matches!(
            item.status,
            ModInstallStatus::Queued
                | ModInstallStatus::Starting
                | ModInstallStatus::Downloading
                | ModInstallStatus::Installing
        )
    {
        item.status = ModInstallStatus::Failed;
        item.progress = item.progress.min(99);
        item.speed = "Interrupted".to_string();
        item.phase = "interrupted".to_string();
        item.error.get_or_insert_with(|| {
            "OG-Launcher closed before this mod installation finished. Start the install again."
                .to_string()
        });
    }
    item.can_cancel = active && item.can_cancel && item.status.is_cancellable();
    item
}

#[derive(Debug)]
enum ModInstallCancellationTransition {
    Cancelled(Box<ModInstallQueueItem>),
    Missing,
    Rejected { status: ModInstallStatus },
}

fn request_mod_install_cancellation_in_map(
    manager: &ModInstallMap,
    install_id: &str,
) -> Result<ModInstallCancellationTransition, String> {
    let mut guard = manager
        .lock()
        .map_err(|error| format!("Mod install manager lock poisoned: {error}"))?;
    let Some(active) = guard.get_mut(install_id) else {
        return Ok(ModInstallCancellationTransition::Missing);
    };

    if !active.item.can_cancel || !active.item.status.is_cancellable() {
        return Ok(ModInstallCancellationTransition::Rejected {
            status: active.item.status,
        });
    }

    let _ = active.cancel_tx.send(true);
    active.item.status = ModInstallStatus::Cancelled;
    active.item.progress = active.item.progress.min(99);
    active.item.speed = "Cancelled".to_string();
    active.item.phase = "cancelled".to_string();
    active.item.can_cancel = false;
    active.item.error = None;
    active.item.last_updated_at = now_unix_secs();
    active.item.event_revision = next_mod_event_revision();
    let item = normalize_mod_queue_item(active.item.clone(), false);
    guard.remove(install_id);

    Ok(ModInstallCancellationTransition::Cancelled(Box::new(item)))
}

fn begin_mod_install_commit_in_map<F>(
    manager: &ModInstallMap,
    install_id: &str,
    update: F,
) -> Result<Option<ModInstallQueueItem>, String>
where
    F: FnOnce(&mut ModInstallQueueItem),
{
    let mut guard = manager
        .lock()
        .map_err(|error| format!("Mod install manager lock poisoned: {error}"))?;
    let Some(active) = guard.get_mut(install_id) else {
        return Ok(None);
    };

    if *active.cancel_tx.borrow() || active.item.status == ModInstallStatus::Cancelled {
        return Ok(None);
    }
    if !active.item.can_cancel || !active.item.status.is_cancellable() {
        return Err(format!(
            "Mod install commit cannot begin while its status is '{:?}'.",
            active.item.status
        ));
    }

    active.item.status = ModInstallStatus::Installing;
    active.item.can_cancel = false;
    update(&mut active.item);
    active.item.last_updated_at = now_unix_secs();
    active.item.event_revision = next_mod_event_revision();
    active.item.progress = active.item.progress.min(100);
    active.item = normalize_mod_queue_item(active.item.clone(), true);
    Ok(Some(active.item.clone()))
}

fn begin_mod_install_commit<F>(
    app: &tauri::AppHandle,
    install_id: &str,
    update: F,
) -> Result<(), String>
where
    F: FnOnce(&mut ModInstallQueueItem),
{
    let item = begin_mod_install_commit_in_map(get_mod_install_manager(), install_id, update)?
        .ok_or_else(|| "cancelled".to_string())?;
    remember_mod_queue_item(item.clone())?;
    emit_mod_progress(app, &item);
    Ok(())
}

#[tauri::command]
pub fn get_mod_queue() -> Result<Vec<ModInstallQueueItem>, String> {
    let mut queue_by_id: HashMap<String, ModInstallQueueItem> = read_mod_queue_history()?
        .into_iter()
        .filter(|item| item.provider.is_active())
        .map(|item| {
            let item = normalize_mod_queue_item(item, false);
            (item.install_id.clone(), item)
        })
        .collect();

    let manager = get_mod_install_manager();
    let guard = manager
        .lock()
        .map_err(|error| format!("Mod install manager lock poisoned: {error}"))?;
    for active in guard.values() {
        let item = normalize_mod_queue_item(active.item.clone(), true);
        if item.provider.is_active() {
            queue_by_id.insert(item.install_id.clone(), item);
        }
    }

    let mut queue = queue_by_id.into_values().collect::<Vec<_>>();
    queue.sort_by(|left, right| {
        status_rank(left.status)
            .cmp(&status_rank(right.status))
            .then_with(|| right.last_updated_at.cmp(&left.last_updated_at))
    });
    Ok(queue)
}

/// Queues a native Nexus install whose URL and metadata came directly from an
/// authenticated Nexus API response. This is deliberately not a Tauri command:
/// renderer-controlled URLs cannot opt into the provider trust policy.
pub(crate) async fn start_trusted_nexus_install(
    app: tauri::AppHandle,
    input: TrustedNexusInstallRequest,
) -> Result<ModInstallResult, String> {
    let game_id = normalize_id(&input.game_id, "gameId")?;
    let game = read_installed_games_cache_result()?
        .into_iter()
        .find(|game| game.id == game_id)
        .ok_or_else(|| format!("Game '{game_id}' was not found in the local library cache."))?;
    normalize_id(&input.catalog_item_id, "catalogItemId")?;
    normalize_id(&input.file_id, "fileId")?;
    if input.expected_size.bytes == 0 || input.expected_size.bytes > MAX_REMOTE_MOD_BYTES {
        return Err("The Nexus file metadata exceeded the native download limit.".to_string());
    }
    validate_supported_nexus_archive_name(&input.file_name)?;
    validate_nexus_provider_page_url(&input.provider_page_url)?;
    let parsed_download = parse_and_validate_remote_url(&input.download_url)?;
    validate_nexus_download_host(&parsed_download)?;

    // Native Nexus target selection is archive-driven and happens in staging.
    // No game path is created or changed while the destination is ambiguous.
    let install_id = build_install_id(ModProvider::Nexus);
    ensure_install_id_available(&install_id)?;
    let (cancel_tx, cancel_rx) = watch::channel(false);
    let item = ModInstallQueueItem {
        id: install_id.clone(),
        install_id: install_id.clone(),
        game_id: game_id.clone(),
        title: input.title.clone(),
        provider: ModProvider::Nexus,
        progress: 0,
        speed: "Queued".to_string(),
        status: ModInstallStatus::Queued,
        phase: "queued".to_string(),
        bytes_downloaded: None,
        bytes_total: Some(input.expected_size.bytes),
        can_pause: false,
        can_cancel: true,
        external: false,
        target_path: None,
        delegated_url: None,
        error: None,
        last_updated_at: now_unix_secs(),
        event_revision: next_mod_event_revision(),
    };
    reserve_mod_install_in_map(
        get_mod_install_manager(),
        &install_id,
        ActiveModInstall {
            item: item.clone(),
            cancel_tx,
        },
    )?;
    if let Err(error) = remember_mod_queue_item(item.clone()) {
        if let Ok(mut guard) = get_mod_install_manager().lock() {
            guard.remove(&install_id);
        }
        return Err(format!("Could not persist queued mod install: {error}"));
    }
    emit_mod_progress(&app, &item);

    let app_clone = app.clone();
    let install_id_clone = install_id.clone();
    tokio::spawn(async move {
        run_trusted_nexus_install_worker(app_clone, install_id_clone, input, game, cancel_rx).await;
    });

    Ok(ModInstallResult {
        install_id,
        game_id,
        status: ModInstallStatus::Queued,
        provider: ModProvider::Nexus,
        target_path: None,
        installed_files: Vec::new(),
        delegated_url: None,
        message: "Nexus mod install queued.".to_string(),
    })
}

#[tauri::command]
pub fn pause_mod_install(_install_id: String) -> Result<(), String> {
    Err("Mod installs cannot be paused yet. Cancel and restart the install instead.".to_string())
}

#[tauri::command]
pub fn cancel_mod_install(app: tauri::AppHandle, install_id: String) -> Result<(), String> {
    let install_id = normalize_id(&install_id, "installId")?;
    match request_mod_install_cancellation_in_map(get_mod_install_manager(), &install_id)? {
        ModInstallCancellationTransition::Cancelled(item) => {
            let item = *item;
            remember_mod_queue_item(item.clone())?;
            emit_mod_progress(&app, &item);
            Ok(())
        }
        ModInstallCancellationTransition::Missing => Ok(()),
        ModInstallCancellationTransition::Rejected {
            status: ModInstallStatus::Installing,
        } => Err(
            "Installation has already started; this mod install can no longer be cancelled."
                .to_string(),
        ),
        ModInstallCancellationTransition::Rejected { status } => Err(format!(
            "This mod install cannot be cancelled while its status is '{}'.",
            format!("{status:?}").to_ascii_lowercase()
        )),
    }
}

/// Revalidates every ownership invariant before the product may present a
/// persisted Nexus entry as installed.
pub(crate) fn validate_managed_mod_install(install: &InstalledModInfo) -> Result<(), String> {
    let target = validate_persisted_install_target(install)?;
    let backup_root = mod_backup_dir(&install.install_id)?;
    validate_managed_mod_install_at_roots(install, &target, &backup_root)
}

fn validate_managed_mod_install_at_roots(
    install: &InstalledModInfo,
    target: &Path,
    backup_root: &Path,
) -> Result<(), String> {
    validate_file_record_ownership(install, target, backup_root)?;
    validate_backup_tree(install, backup_root)?;
    verify_manifest_ownership_if_present(install, target)?;
    let disabled_root = disabled_root_for_install(target, &install.install_id)?;

    for record in &install.file_records {
        let active = safe_join(target, &record.relative_path)?;
        let disabled = safe_join(&disabled_root, &record.relative_path)?;
        if install.enabled {
            verify_owned_file(
                &active,
                &record.installed_sha256,
                record.installed_size,
                "installed mod file",
            )?;
            if regular_file_metadata(&disabled, "disabled mod file")?.is_some() {
                return Err("A managed mod file exists in active and disabled storage.".to_string());
            }
        } else {
            verify_owned_file(
                &disabled,
                &record.installed_sha256,
                record.installed_size,
                "disabled mod file",
            )?;
            if let Some(backup) = &record.backup {
                verify_owned_file(
                    &active,
                    &backup.original_sha256,
                    backup.original_size,
                    "restored original game file",
                )?;
            } else if regular_file_metadata(&active, "disabled mod target")?.is_some() {
                return Err("An unowned file occupies a disabled mod target.".to_string());
            }
        }
    }
    Ok(())
}

pub fn enable_mod(install_id: String) -> Result<InstalledModInfo, String> {
    set_mod_enabled(&install_id, true)
}

pub fn disable_mod(install_id: String) -> Result<InstalledModInfo, String> {
    set_mod_enabled(&install_id, false)
}

pub fn uninstall_mod(install_id: String) -> Result<(), String> {
    let install_id = normalize_id(&install_id, "installId")?;
    let Some(install) =
        local_db::read_item::<InstalledModInfo>(MOD_INSTALLS_COLLECTION, &install_id)?
    else {
        return Ok(());
    };
    remove_mod_install_artifacts(&install)?;
    local_db::remove_item(MOD_INSTALLS_COLLECTION, &install_id)?;
    Ok(())
}

fn remove_mod_install_artifacts(install: &InstalledModInfo) -> Result<(), String> {
    if install.provider == ModProvider::LocalFolder {
        return Ok(());
    }

    let target = validate_persisted_install_target(install)?;
    let backup_root = mod_backup_dir(&install.install_id)?;
    remove_mod_install_artifacts_from_roots(install, &target, &backup_root)
}

fn remove_mod_install_artifacts_from_roots(
    install: &InstalledModInfo,
    target: &Path,
    backup_root: &Path,
) -> Result<(), String> {
    validate_file_record_ownership(install, target, backup_root)?;
    validate_backup_tree(install, backup_root)?;
    let manifest_path = verify_manifest_ownership_if_present(install, target)?;
    let disabled_root = disabled_root_for_install(target, &install.install_id)?;

    for record in &install.file_records {
        let active = safe_join(target, &record.relative_path)?;
        let disabled = safe_join(&disabled_root, &record.relative_path)?;
        if install.enabled {
            verify_owned_file_if_present(
                &active,
                &record.installed_sha256,
                record.installed_size,
                "installed mod file",
            )?;
        } else if let Some(backup) = &record.backup {
            verify_owned_file_if_present(
                &active,
                &backup.original_sha256,
                backup.original_size,
                "restored original game file",
            )?;
        } else {
            if regular_file_metadata(&active, "disabled mod target")?.is_some() {
                return Err(format!(
                    "Refusing to remove unowned file {} while the mod is disabled.",
                    active.display()
                ));
            }
        }

        let disabled_exists = verify_owned_file_if_present(
            &disabled,
            &record.installed_sha256,
            record.installed_size,
            "disabled mod file",
        )?;
        if install.enabled && disabled_exists {
            return Err(format!(
                "Mod ownership is ambiguous because {} exists in both active and disabled storage.",
                record.relative_path
            ));
        }

        if let Some(backup) = &record.backup {
            let backup_path = safe_join(backup_root, &backup.backup_relative_path)?;
            verify_owned_file(
                &backup_path,
                &backup.original_sha256,
                backup.original_size,
                "owned original-file backup",
            )?;
        }
    }

    for record in &install.file_records {
        let active = safe_join(target, &record.relative_path)?;
        let disabled = safe_join(&disabled_root, &record.relative_path)?;
        if let Some(backup) = &record.backup {
            let backup_path = safe_join(backup_root, &backup.backup_relative_path)?;
            let active_exists = regular_file_metadata(&active, "mod target")?.is_some();
            if install.enabled || !active_exists {
                if let Some(parent) = active.parent() {
                    fs::create_dir_all(parent).map_err(|error| {
                        format!("Could not recreate original file parent: {error}")
                    })?;
                }
                fs::copy(&backup_path, &active).map_err(|error| {
                    format!(
                        "Could not restore original file {}: {error}",
                        active.display()
                    )
                })?;
                verify_owned_file(
                    &active,
                    &backup.original_sha256,
                    backup.original_size,
                    "restored original game file",
                )?;
            }
        } else if install.enabled && regular_file_metadata(&active, "installed mod file")?.is_some()
        {
            fs::remove_file(&active).map_err(|error| {
                format!("Could not remove mod file {}: {error}", active.display())
            })?;
            remove_empty_parents(&active, target);
        }

        if regular_file_metadata(&disabled, "disabled mod file")?.is_some() {
            fs::remove_file(&disabled).map_err(|error| {
                format!(
                    "Could not remove disabled mod file {}: {error}",
                    disabled.display()
                )
            })?;
            remove_empty_parents(&disabled, &disabled_root);
        }
    }

    if let Some(manifest_path) = manifest_path {
        fs::remove_file(&manifest_path)
            .map_err(|error| format!("Could not remove mod manifest: {error}"))?;
        remove_empty_parents(&manifest_path, target);
    }

    for record in &install.file_records {
        if let Some(backup) = &record.backup {
            let backup_path = safe_join(backup_root, &backup.backup_relative_path)?;
            fs::remove_file(&backup_path)
                .map_err(|error| format!("Could not remove consumed mod backup: {error}"))?;
            remove_empty_parents(&backup_path, backup_root);
        }
    }
    if backup_root.exists() {
        fs::remove_dir(backup_root)
            .map_err(|error| format!("Could not remove empty mod backup directory: {error}"))?;
    }
    if disabled_root.exists() {
        let _ = fs::remove_dir(&disabled_root);
    }
    Ok(())
}

// (removed: scan_mod_directory had a path-traversal sink because the
// renderer-controlled `path` was passed to `fs::read_dir` without an
// allow-root check. The frontend never calls this command —
// `scan_game_mods` is the supported path — so the function has been
// removed entirely. If a future feature needs free-form directory
// scanning, add an allow-list helper alongside the new entry point.)

enum TrustedNexusWorkerOutcome {
    Installed(ModInstallResult),
    Handoff { url: String, message: String },
}

enum TrustedNexusPreparation {
    Ready { extracted: PathBuf, target: PathBuf },
    Handoff(String),
}

async fn run_trusted_nexus_install_worker(
    app: tauri::AppHandle,
    install_id: String,
    input: TrustedNexusInstallRequest,
    game: crate::commands::games::InstalledGame,
    cancel_rx: watch::Receiver<bool>,
) {
    let result =
        run_trusted_nexus_install_worker_inner(&app, &install_id, &input, &game, cancel_rx).await;

    if let Err(error) =
        mod_staging_dir(&install_id).and_then(|path| cleanup_mod_staging_path(&path))
    {
        eprintln!(
            "[open-game-launcher] Could not clean mod staging directory '{install_id}': {error}"
        );
    }

    let queue_update = match result {
        Ok(TrustedNexusWorkerOutcome::Installed(result)) => {
            update_queue_item(&app, &install_id, |item| {
                item.status = ModInstallStatus::Completed;
                item.progress = 100;
                item.speed = "Installed".to_string();
                item.phase = "complete".to_string();
                item.bytes_downloaded = item.bytes_total;
                item.can_cancel = false;
                item.target_path = result.target_path.clone();
                item.error = None;
            })
        }
        Ok(TrustedNexusWorkerOutcome::Handoff { url, message }) => match open_uri(&url) {
            Ok(()) => update_queue_item(&app, &install_id, |item| {
                item.status = ModInstallStatus::Delegated;
                item.progress = 100;
                item.speed = "Provider opened".to_string();
                item.phase = "delegated".to_string();
                item.can_cancel = false;
                item.external = true;
                item.target_path = None;
                item.delegated_url = Some(url);
                item.error = None;
            }),
            Err(_) => update_queue_item(&app, &install_id, |item| {
                item.status = ModInstallStatus::Failed;
                item.speed = "Handoff failed".to_string();
                item.phase = "error".to_string();
                item.can_cancel = false;
                item.error = Some(message);
            }),
        },
        Err(error) if error == "cancelled" => update_queue_item(&app, &install_id, |item| {
            item.status = ModInstallStatus::Cancelled;
            item.speed = "Cancelled".to_string();
            item.phase = "cancelled".to_string();
            item.can_cancel = false;
        }),
        Err(error) => update_queue_item(&app, &install_id, |item| {
            item.status = ModInstallStatus::Failed;
            item.speed = "Failed".to_string();
            item.phase = "error".to_string();
            item.error = Some(error);
            item.can_cancel = false;
        }),
    };
    if let Err(error) = queue_update {
        eprintln!(
            "[open-game-launcher] Could not persist final Nexus install status '{install_id}': {error}"
        );
    }
    if let Ok(mut guard) = get_mod_install_manager().lock() {
        guard.remove(&install_id);
    }
}

async fn run_trusted_nexus_install_worker_inner(
    app: &tauri::AppHandle,
    install_id: &str,
    input: &TrustedNexusInstallRequest,
    game: &crate::commands::games::InstalledGame,
    mut cancel_rx: watch::Receiver<bool>,
) -> Result<TrustedNexusWorkerOutcome, String> {
    update_queue_item(app, install_id, |item| {
        item.status = ModInstallStatus::Starting;
        item.phase = "resolving".to_string();
        item.speed = "Validating Nexus metadata".to_string();
        item.progress = 3;
    })?;
    let install_root = validated_game_install_root(game)?;
    let package = download_trusted_nexus_package(app, install_id, input, &mut cancel_rx).await?;
    if *cancel_rx.borrow() {
        return Err("cancelled".to_string());
    }

    let replacing = managed_nexus_install_for_update(&game.id, &input.catalog_item_id)?;
    if let Some(existing) = replacing.as_ref() {
        if !existing.enabled {
            return Ok(TrustedNexusWorkerOutcome::Handoff {
                url: input.provider_page_url.clone(),
                message: "Enable the existing mod before updating it, or continue on Nexus."
                    .to_string(),
            });
        }
        validate_managed_mod_install(existing)?;
    }
    let prepared = prepare_trusted_nexus_archive(
        install_id,
        &package,
        &input.file_name,
        &install_root,
        replacing
            .as_ref()
            .map(|install| install.install_id.as_str()),
    )?;
    let (extracted, target) = match prepared {
        TrustedNexusPreparation::Ready { extracted, target } => (extracted, target),
        TrustedNexusPreparation::Handoff(message) => {
            return Ok(TrustedNexusWorkerOutcome::Handoff {
                url: input.provider_page_url.clone(),
                message,
            });
        }
    };
    if *cancel_rx.borrow() {
        return Err("cancelled".to_string());
    }

    if let Some(existing) = replacing.as_ref() {
        let existing_target = validate_persisted_install_target(existing)?;
        if existing_target != target {
            return Ok(TrustedNexusWorkerOutcome::Handoff {
                url: input.provider_page_url.clone(),
                message: "The update targets a different game-owned mod folder; continue on Nexus to resolve it safely."
                    .to_string(),
            });
        }
    }

    begin_mod_install_commit(app, install_id, |item| {
        item.phase = "installing".to_string();
        item.speed = "Installing".to_string();
        item.progress = 90;
        item.target_path = Some(path_to_string(target.clone()));
    })?;
    let staged_files = collect_relative_files(&extracted)?;
    if staged_files.is_empty() {
        return Err("The Nexus archive did not contain installable files.".to_string());
    }
    let manifest = commit_trusted_nexus_install(
        install_id,
        input,
        game,
        &extracted,
        &target,
        &staged_files,
        replacing.as_ref(),
    )?;
    Ok(TrustedNexusWorkerOutcome::Installed(result_from_manifest(
        manifest,
    )))
}

fn managed_nexus_install_for_update(
    game_id: &str,
    catalog_item_id: &str,
) -> Result<Option<InstalledModInfo>, String> {
    let mut matches = local_db::read_collection::<InstalledModInfo>(MOD_INSTALLS_COLLECTION)?
        .into_iter()
        .filter(|install| {
            install.provider == ModProvider::Nexus
                && install.game_id == game_id
                && install.catalog_item_id.as_deref() == Some(catalog_item_id)
        });
    let first = matches.next();
    if matches.next().is_some() {
        return Err(
            "Multiple managed installations exist for this Nexus mod; continue on Nexus to resolve the conflict."
                .to_string(),
        );
    }
    Ok(first)
}

fn commit_trusted_nexus_install(
    install_id: &str,
    input: &TrustedNexusInstallRequest,
    game: &crate::commands::games::InstalledGame,
    extracted: &Path,
    target: &Path,
    staged_files: &[String],
    replacing: Option<&InstalledModInfo>,
) -> Result<ModInstallManifest, String> {
    if let Some(existing) = replacing {
        return replace_managed_nexus_install(
            install_id,
            input,
            game,
            extracted,
            target,
            staged_files,
            existing,
        );
    }

    let file_records = apply_staged_files(install_id, extracted, target, staged_files)?;
    let manifest = trusted_nexus_manifest(install_id, input, game, target, file_records);
    if let Err(error) = persist_mod_manifest(&manifest) {
        let install = info_from_manifest(manifest.clone());
        let backup_root = mod_backup_dir(install_id)?;
        let rollback = remove_mod_install_artifacts_from_roots(&install, target, &backup_root);
        return match rollback {
            Ok(()) => Err(error),
            Err(rollback_error) => Err(format!(
                "{error} The installed files also could not be rolled back safely: {rollback_error}"
            )),
        };
    }
    Ok(manifest)
}

fn trusted_nexus_manifest(
    install_id: &str,
    input: &TrustedNexusInstallRequest,
    game: &crate::commands::games::InstalledGame,
    target: &Path,
    file_records: Vec<ModInstalledFileRecord>,
) -> ModInstallManifest {
    let installed_files = file_records
        .iter()
        .map(|record| record.relative_path.clone())
        .collect::<Vec<_>>();
    ModInstallManifest {
        install_id: install_id.to_string(),
        game_id: game.id.clone(),
        title: input.title.clone(),
        provider: ModProvider::Nexus,
        enabled: true,
        target_path: path_to_string(target.to_path_buf()),
        installed_files,
        profile_id: None,
        catalog_item_id: Some(input.catalog_item_id.clone()),
        version_id: input.version_id.clone(),
        provider_file_id: Some(input.file_id.clone()),
        // Never persist the signed CDN URL or an NXM payload.
        source_url: Some(input.provider_page_url.clone()),
        installed_at: now_unix_secs(),
        manifest_version: MOD_MANIFEST_VERSION,
        file_records,
    }
}

fn replace_managed_nexus_install(
    install_id: &str,
    input: &TrustedNexusInstallRequest,
    game: &crate::commands::games::InstalledGame,
    extracted: &Path,
    target: &Path,
    staged_files: &[String],
    existing: &InstalledModInfo,
) -> Result<ModInstallManifest, String> {
    validate_managed_mod_install(existing)?;
    let snapshot_root = mod_staging_dir(install_id)?.join("update-rollback");
    snapshot_managed_install(existing, &snapshot_root)?;
    run_managed_replacement_transaction(
        || remove_mod_install_artifacts(existing),
        || local_db::remove_item(MOD_INSTALLS_COLLECTION, &existing.install_id),
        || {
            let file_records = apply_staged_files(install_id, extracted, target, staged_files)?;
            Ok(trusted_nexus_manifest(
                install_id,
                input,
                game,
                target,
                file_records,
            ))
        },
        persist_mod_manifest,
        |manifest| {
            let new_install = info_from_manifest(manifest.clone());
            let new_backup_root = mod_backup_dir(install_id)?;
            remove_mod_install_artifacts_from_roots(&new_install, target, &new_backup_root)
        },
        || restore_managed_install_snapshot(existing, &snapshot_root),
    )
}

fn run_managed_replacement_transaction<
    T,
    RemoveOld,
    DeleteOld,
    ApplyNew,
    PersistNew,
    RemoveNew,
    RestoreOld,
>(
    remove_old: RemoveOld,
    delete_old: DeleteOld,
    apply_new: ApplyNew,
    persist_new: PersistNew,
    remove_new: RemoveNew,
    mut restore_old: RestoreOld,
) -> Result<T, String>
where
    RemoveOld: FnOnce() -> Result<(), String>,
    DeleteOld: FnOnce() -> Result<(), String>,
    ApplyNew: FnOnce() -> Result<T, String>,
    PersistNew: FnOnce(&T) -> Result<(), String>,
    RemoveNew: FnOnce(&T) -> Result<(), String>,
    RestoreOld: FnMut() -> Result<(), String>,
{
    if let Err(error) = remove_old() {
        return combine_update_rollback_error(error, restore_old());
    }
    if let Err(error) = delete_old() {
        return combine_update_rollback_error(error, restore_old());
    }
    let replacement = match apply_new() {
        Ok(replacement) => replacement,
        Err(error) => return combine_update_rollback_error(error, restore_old()),
    };
    if let Err(error) = persist_new(&replacement) {
        let remove_result = remove_new(&replacement);
        let restore_result = restore_old();
        return match (remove_result, restore_result) {
            (Ok(()), Ok(())) => Err(error),
            (Err(remove_error), Ok(())) => Err(format!(
                "{error} The previous mod version was restored, but new files could not be removed safely: {remove_error}"
            )),
            (Ok(()), Err(restore_error)) => Err(format!(
                "{error} The previous mod version could not be restored safely: {restore_error}"
            )),
            (Err(remove_error), Err(restore_error)) => Err(format!(
                "{error} The new files could not be removed safely: {remove_error} The previous mod version also could not be restored safely: {restore_error}"
            )),
        };
    }
    Ok(replacement)
}

fn snapshot_managed_install(
    install: &InstalledModInfo,
    snapshot_root: &Path,
) -> Result<(), String> {
    if snapshot_root.exists() {
        cleanup_mod_staging_path(snapshot_root)?;
    }
    let target = validate_persisted_install_target(install)?;
    let backup_root = mod_backup_dir(&install.install_id)?;
    snapshot_managed_install_at_roots(install, &target, &backup_root, snapshot_root)
}

fn snapshot_managed_install_at_roots(
    install: &InstalledModInfo,
    target: &Path,
    backup_root: &Path,
    snapshot_root: &Path,
) -> Result<(), String> {
    fs::create_dir_all(snapshot_root)
        .map_err(|error| format!("Could not create update rollback snapshot: {error}"))?;
    for record in &install.file_records {
        let active = safe_join(target, &record.relative_path)?;
        let snapshot = safe_join(&snapshot_root.join("files"), &record.relative_path)?;
        if let Some(parent) = snapshot.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Could not create update snapshot parent: {error}"))?;
        }
        copy_file_create_new(&active, &snapshot)
            .map_err(|error| format!("Could not snapshot installed mod file: {error}"))?;
        verify_owned_file(
            &snapshot,
            &record.installed_sha256,
            record.installed_size,
            "snapshotted mod file",
        )?;
        if let Some(backup) = &record.backup {
            let source = safe_join(backup_root, &backup.backup_relative_path)?;
            let snapshot_backup =
                safe_join(&snapshot_root.join("backups"), &backup.backup_relative_path)?;
            if let Some(parent) = snapshot_backup.parent() {
                fs::create_dir_all(parent).map_err(|error| {
                    format!("Could not create update backup snapshot parent: {error}")
                })?;
            }
            copy_file_create_new(&source, &snapshot_backup)
                .map_err(|error| format!("Could not snapshot original-file backup: {error}"))?;
            verify_owned_file(
                &snapshot_backup,
                &backup.original_sha256,
                backup.original_size,
                "snapshotted original-file backup",
            )?;
        }
    }
    Ok(())
}

fn restore_managed_install_snapshot(
    install: &InstalledModInfo,
    snapshot_root: &Path,
) -> Result<(), String> {
    let target = validate_persisted_install_target(install)?;
    let backup_root = mod_backup_dir(&install.install_id)?;
    restore_managed_install_files_from_snapshot(install, &target, &backup_root, snapshot_root)?;
    local_db::upsert_item(MOD_INSTALLS_COLLECTION, &install.install_id, install)?;
    write_manifest_from_info(install)?;
    Ok(())
}

fn restore_managed_install_files_from_snapshot(
    install: &InstalledModInfo,
    target: &Path,
    backup_root: &Path,
    snapshot_root: &Path,
) -> Result<(), String> {
    for record in &install.file_records {
        let snapshot = safe_join(&snapshot_root.join("files"), &record.relative_path)?;
        let active = safe_join(target, &record.relative_path)?;
        if let Some(parent) = active.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Could not recreate managed mod parent: {error}"))?;
        }
        fs::copy(&snapshot, &active)
            .map_err(|error| format!("Could not restore previous mod file: {error}"))?;
        verify_owned_file(
            &active,
            &record.installed_sha256,
            record.installed_size,
            "restored previous mod file",
        )?;
        if let Some(backup) = &record.backup {
            let snapshot_backup =
                safe_join(&snapshot_root.join("backups"), &backup.backup_relative_path)?;
            let backup_path = safe_join(backup_root, &backup.backup_relative_path)?;
            if let Some(parent) = backup_path.parent() {
                fs::create_dir_all(parent).map_err(|error| {
                    format!("Could not recreate original-file backup parent: {error}")
                })?;
            }
            fs::copy(&snapshot_backup, &backup_path)
                .map_err(|error| format!("Could not restore original-file backup: {error}"))?;
            verify_owned_file(
                &backup_path,
                &backup.original_sha256,
                backup.original_size,
                "restored original-file backup",
            )?;
        }
    }
    Ok(())
}

fn combine_update_rollback_error<T>(
    error: String,
    rollback: Result<(), String>,
) -> Result<T, String> {
    match rollback {
        Ok(()) => Err(error),
        Err(rollback_error) => Err(format!(
            "{error} The previous mod version could not be restored safely: {rollback_error}"
        )),
    }
}

fn update_queue_item<F>(app: &tauri::AppHandle, install_id: &str, update: F) -> Result<(), String>
where
    F: FnOnce(&mut ModInstallQueueItem),
{
    let maybe_item = {
        let manager = get_mod_install_manager();
        let mut guard = manager
            .lock()
            .map_err(|error| format!("Mod install manager lock poisoned: {error}"))?;
        let Some(active) = guard.get_mut(install_id) else {
            return Ok(());
        };
        update(&mut active.item);
        active.item.last_updated_at = now_unix_secs();
        active.item.event_revision = next_mod_event_revision();
        active.item.progress = active.item.progress.min(100);
        active.item = normalize_mod_queue_item(active.item.clone(), true);
        Some(active.item.clone())
    };

    if let Some(item) = maybe_item {
        remember_mod_queue_item(item.clone())?;
        emit_mod_progress(app, &item);
    }
    Ok(())
}

fn emit_mod_progress(app: &tauri::AppHandle, item: &ModInstallQueueItem) {
    let _ = app.emit("mod_install_progress", item);
}

fn read_mod_queue_history() -> Result<Vec<ModInstallQueueItem>, String> {
    local_db::read_collection(MOD_INSTALL_QUEUE_COLLECTION)
}

fn remember_mod_queue_item(item: ModInstallQueueItem) -> Result<(), String> {
    local_db::mutate_collection(
        MOD_INSTALL_QUEUE_COLLECTION,
        |entry: &ModInstallQueueItem| &entry.install_id,
        move |queue| {
            if let Some(existing) = queue
                .iter_mut()
                .find(|entry| entry.install_id == item.install_id)
            {
                *existing = item;
            } else {
                queue.push(item);
            }
            queue.sort_by_key(|left| left.last_updated_at);
            if queue.len() > 100 {
                queue.drain(0..queue.len() - 100);
            }
            Ok(())
        },
    )
}

fn read_mod_installs() -> Result<Vec<InstalledModInfo>, String> {
    local_db::read_collection(MOD_INSTALLS_COLLECTION)
}

fn persist_mod_manifest(manifest: &ModInstallManifest) -> Result<(), String> {
    if local_db::read_item::<InstalledModInfo>(MOD_INSTALLS_COLLECTION, &manifest.install_id)?
        .is_some()
    {
        return Err(format!(
            "Mod install ID '{}' is already persisted; refusing to overwrite it.",
            manifest.install_id
        ));
    }

    let mut written_manifest = None;
    if manifest.provider != ModProvider::LocalFolder {
        let target = PathBuf::from(&manifest.target_path);
        let manifest_path = checked_manifest_file_path(&target, &manifest.install_id)?;
        if let Some(parent) = manifest_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Could not create manifest directory: {error}"))?;
        }
        let json = serde_json::to_string_pretty(manifest)
            .map_err(|error| format!("Could not encode mod manifest: {error}"))?;
        write_new_file(&manifest_path, json.as_bytes())
            .map_err(|error| format!("Could not write mod manifest: {error}"))?;
        written_manifest = Some(manifest_path);
    }

    let info = info_from_manifest(manifest.clone());
    if let Err(error) = local_db::insert_item(MOD_INSTALLS_COLLECTION, &info.install_id, &info) {
        if let Some(path) = written_manifest {
            let _ = fs::remove_file(path);
        }
        return Err(error);
    }
    Ok(())
}

fn result_from_manifest(manifest: ModInstallManifest) -> ModInstallResult {
    ModInstallResult {
        install_id: manifest.install_id,
        game_id: manifest.game_id,
        status: ModInstallStatus::Completed,
        provider: manifest.provider,
        target_path: Some(manifest.target_path),
        installed_files: manifest.installed_files,
        delegated_url: None,
        message: "Mod installed.".to_string(),
    }
}

fn info_from_manifest(manifest: ModInstallManifest) -> InstalledModInfo {
    InstalledModInfo {
        id: manifest.install_id.clone(),
        install_id: manifest.install_id,
        game_id: manifest.game_id,
        title: manifest.title,
        provider: manifest.provider,
        enabled: manifest.enabled,
        target_path: manifest.target_path,
        installed_files: manifest.installed_files,
        profile_id: manifest.profile_id,
        catalog_item_id: manifest.catalog_item_id,
        version_id: manifest.version_id,
        provider_file_id: manifest.provider_file_id,
        source_url: manifest.source_url,
        installed_at: manifest.installed_at,
        manifest_version: manifest.manifest_version,
        file_records: manifest.file_records,
    }
}

pub(crate) fn parse_and_validate_remote_url(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|error| format!("Invalid mod URL: {error}"))?;
    validate_remote_url_syntax(&url)?;
    Ok(url)
}

fn validate_remote_url_syntax(url: &Url) -> Result<(), String> {
    if url.scheme() != "https" {
        return Err("Remote mod sources must use HTTPS.".to_string());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Remote mod URLs may not contain credentials.".to_string());
    }
    if url.fragment().is_some() {
        return Err("Remote mod URLs may not contain fragments.".to_string());
    }
    let host = url
        .host_str()
        .ok_or_else(|| "Remote mod URL is missing a host.".to_string())?;
    let normalized_host = host.trim_end_matches('.').to_ascii_lowercase();
    if normalized_host == "localhost" || normalized_host.ends_with(".localhost") {
        return Err("Remote mod URL resolves to a local-only host.".to_string());
    }
    if let Some(ip) = parse_url_host_ip(host) {
        validate_public_ip(ip)?;
    }
    Ok(())
}

fn parse_url_host_ip(host: &str) -> Option<IpAddr> {
    host.strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
        .unwrap_or(host)
        .parse()
        .ok()
}

fn validate_public_ip(ip: IpAddr) -> Result<(), String> {
    let is_public = match ip {
        IpAddr::V4(ip) => is_public_ipv4(ip),
        IpAddr::V6(ip) => is_public_ipv6(ip),
    };
    if is_public {
        Ok(())
    } else {
        Err(format!(
            "Remote mod URL uses a private, local, or reserved IP address ({ip})."
        ))
    }
}

fn is_public_ipv4(ip: Ipv4Addr) -> bool {
    let [a, b, c, _] = ip.octets();
    !matches!(
        (a, b, c),
        (0, _, _)
            | (10, _, _)
            | (100, 64..=127, _)
            | (127, _, _)
            | (169, 254, _)
            | (172, 16..=31, _)
            | (192, 0, 0)
            | (192, 0, 2)
            | (192, 88, 99)
            | (192, 168, _)
            | (198, 18..=19, _)
            | (198, 51, 100)
            | (203, 0, 113)
            | (224..=255, _, _)
    )
}

fn is_public_ipv6(ip: Ipv6Addr) -> bool {
    if let Some(mapped) = ip.to_ipv4_mapped() {
        return is_public_ipv4(mapped);
    }
    let segments = ip.segments();
    if segments[0] & 0xe000 != 0x2000 {
        return false;
    }
    if segments[0] == 0x2001
        && (segments[1] == 0x0000
            || segments[1] == 0x0002
            || (0x0010..=0x002f).contains(&segments[1])
            || segments[1] == 0x0db8)
    {
        return false;
    }
    if segments[0] == 0x2002 {
        return false;
    }
    if segments[0] == 0x3fff && segments[1] & 0xf000 == 0 {
        return false;
    }
    true
}

async fn resolve_public_remote_addresses(url: &Url) -> Result<Vec<SocketAddr>, String> {
    validate_remote_url_syntax(url)?;
    let host = url
        .host_str()
        .ok_or_else(|| "Remote mod URL is missing a host.".to_string())?;
    let port = url
        .port_or_known_default()
        .ok_or_else(|| "Remote mod URL is missing a usable port.".to_string())?;

    let addresses = if let Some(ip) = parse_url_host_ip(host) {
        vec![SocketAddr::new(ip, port)]
    } else {
        let resolved =
            tokio::time::timeout(REMOTE_DNS_TIMEOUT, tokio::net::lookup_host((host, port)))
                .await
                .map_err(|_| format!("DNS resolution timed out for {host}."))?
                .map_err(|error| format!("Could not resolve remote mod host {host}: {error}"))?;
        let mut unique = HashSet::new();
        resolved
            .filter(|address| unique.insert(*address))
            .collect::<Vec<_>>()
    };
    validate_resolved_addresses(&addresses)?;
    Ok(addresses)
}

fn validate_resolved_addresses(addresses: &[SocketAddr]) -> Result<(), String> {
    if addresses.is_empty() {
        return Err("Remote mod host did not resolve to any address.".to_string());
    }
    for address in addresses {
        validate_public_ip(address.ip())?;
    }
    Ok(())
}

fn build_pinned_remote_client(
    url: &Url,
    addresses: &[SocketAddr],
    request_timeout: Duration,
) -> Result<reqwest::Client, String> {
    let host = url
        .host_str()
        .ok_or_else(|| "Remote mod URL is missing a host.".to_string())?;
    let mut builder = reqwest::Client::builder()
        .redirect(redirect::Policy::none())
        .referer(false)
        .no_proxy()
        .https_only(true)
        .connect_timeout(REMOTE_CONNECT_TIMEOUT)
        .read_timeout(REMOTE_READ_TIMEOUT)
        .timeout(request_timeout);
    if parse_url_host_ip(host).is_none() {
        builder = builder.resolve_to_addrs(host, addresses);
    }
    builder
        .build()
        .map_err(|error| format!("Could not configure secure mod downloader: {error}"))
}

pub(crate) async fn send_validated_remote_request_with_headers(
    mut url: Url,
    headers: HeaderMap,
    request_timeout: Duration,
) -> Result<reqwest::Response, String> {
    let mut visited = HashSet::new();
    visited.insert(url.as_str().to_string());
    let mut redirects_followed = 0;

    loop {
        let addresses = resolve_public_remote_addresses(&url).await?;
        let client = build_pinned_remote_client(&url, &addresses, request_timeout)?;
        let response = client
            .get(url.clone())
            .headers(headers.clone())
            .send()
            .await
            .map_err(|error| format!("Mod download failed: {error}"))?;

        if is_followable_redirect_status(response.status()) {
            let location = response
                .headers()
                .get(LOCATION)
                .ok_or_else(|| {
                    "Mod download redirect did not include a Location header.".to_string()
                })?
                .to_str()
                .map_err(|_| "Mod download redirect Location was not valid text.".to_string())?;
            let next =
                validated_redirect_url(&url, location, redirects_followed, MAX_REMOTE_REDIRECTS)?;
            if !visited.insert(next.as_str().to_string()) {
                return Err("Mod download redirect loop was detected.".to_string());
            }
            redirects_followed += 1;
            url = next;
            continue;
        }
        if response.status().is_redirection() {
            return Err(format!(
                "Mod download returned unsupported redirect status {}.",
                response.status()
            ));
        }
        if !response.status().is_success() {
            return Err(format!("Mod download returned {}.", response.status()));
        }
        return Ok(response);
    }
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
enum NexusArchiveKind {
    Zip,
    SevenZip,
}

pub(crate) fn validate_supported_nexus_archive_name(value: &str) -> Result<(), String> {
    nexus_archive_kind(value).map(|_| ())
}

fn nexus_archive_kind(value: &str) -> Result<NexusArchiveKind, String> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > 300
        || value.chars().any(char::is_control)
        || value.contains(['/', '\\'])
    {
        return Err("The Nexus file name was invalid.".to_string());
    }
    let lower = value.to_ascii_lowercase();
    if lower.ends_with(".zip") {
        Ok(NexusArchiveKind::Zip)
    } else if lower.ends_with(".7z") {
        Ok(NexusArchiveKind::SevenZip)
    } else {
        Err("Native Nexus installation supports ZIP and 7z archives only.".to_string())
    }
}

fn validate_nexus_provider_page_url(value: &str) -> Result<Url, String> {
    let url = Url::parse(value)
        .map_err(|_| "The official Nexus Mods provider page was invalid.".to_string())?;
    let host = url
        .host_str()
        .map(|host| host.trim_end_matches('.').to_ascii_lowercase());
    if url.scheme() != "https"
        || !matches!(
            host.as_deref(),
            Some("nexusmods.com") | Some("www.nexusmods.com")
        )
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("The official Nexus Mods provider page was invalid.".to_string());
    }
    for (key, value) in url.query_pairs() {
        if !matches!(key.as_ref(), "tab" | "file_id")
            || (key == "tab" && value != "files")
            || (key == "file_id" && !value.chars().all(|character| character.is_ascii_digit()))
        {
            return Err(
                "The official Nexus Mods provider page contained unsafe parameters.".to_string(),
            );
        }
    }
    Ok(url)
}

pub(crate) fn validate_nexus_download_host(url: &Url) -> Result<(), String> {
    validate_remote_url_syntax(url)?;
    let host = url
        .host_str()
        .map(|host| host.trim_end_matches('.').to_ascii_lowercase())
        .ok_or_else(|| "The Nexus download URL was missing a host.".to_string())?;
    let exact = NEXUS_DOWNLOAD_HOSTS.iter().any(|allowed| host == *allowed);
    let suffix = NEXUS_DOWNLOAD_HOST_SUFFIXES
        .iter()
        .any(|allowed| host == *allowed || host.ends_with(&format!(".{allowed}")));
    if exact || suffix {
        Ok(())
    } else {
        Err(
            "The Nexus API returned a download host outside the approved CDN allowlist."
                .to_string(),
        )
    }
}

async fn send_trusted_nexus_request(mut url: Url) -> Result<reqwest::Response, String> {
    let mut visited = HashSet::new();
    // The URL may contain a short-lived provider signature. Keep it in memory
    // and never copy it into an error, queue entry, or manifest.
    visited.insert(url.as_str().to_string());
    let mut redirects_followed = 0;
    loop {
        validate_nexus_download_host(&url)?;
        let addresses = resolve_public_remote_addresses(&url).await?;
        let client = build_pinned_remote_client(&url, &addresses, REMOTE_REQUEST_TIMEOUT)?;
        let response = client
            .get(url.clone())
            .header(
                "Accept",
                "application/octet-stream, application/zip, application/x-7z-compressed",
            )
            .send()
            .await
            .map_err(|_| "The authenticated Nexus download could not be reached.".to_string())?;
        if is_followable_redirect_status(response.status()) {
            let location = response
                .headers()
                .get(LOCATION)
                .ok_or_else(|| "The Nexus CDN redirect was incomplete.".to_string())?
                .to_str()
                .map_err(|_| "The Nexus CDN redirect was invalid.".to_string())?;
            let next =
                validated_redirect_url(&url, location, redirects_followed, MAX_REMOTE_REDIRECTS)?;
            validate_nexus_download_host(&next)?;
            if !visited.insert(next.as_str().to_string()) {
                return Err("A Nexus CDN redirect loop was detected.".to_string());
            }
            redirects_followed += 1;
            url = next;
            continue;
        }
        if response.status().is_redirection() {
            return Err("The Nexus CDN returned an unsupported redirect.".to_string());
        }
        if !response.status().is_success() {
            return Err(format!(
                "The Nexus CDN returned HTTP {}.",
                response.status().as_u16()
            ));
        }
        return Ok(response);
    }
}

fn validate_nexus_content_type(
    content_type: Option<&reqwest::header::HeaderValue>,
    kind: NexusArchiveKind,
) -> Result<(), String> {
    let mime = content_type
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .map(str::trim)
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| {
            "The Nexus CDN response did not declare a binary content type.".to_string()
        })?;
    let common_binary = matches!(
        mime.as_str(),
        "application/octet-stream" | "binary/octet-stream"
    );
    let archive_mime = match kind {
        NexusArchiveKind::Zip => matches!(
            mime.as_str(),
            "application/zip" | "application/x-zip" | "application/x-zip-compressed"
        ),
        NexusArchiveKind::SevenZip => matches!(mime.as_str(), "application/x-7z-compressed"),
    };
    if common_binary || archive_mime {
        Ok(())
    } else {
        Err("The Nexus CDN returned an unexpected content type.".to_string())
    }
}

fn validate_nexus_expected_size(
    actual: u64,
    expected: TrustedNexusExpectedSize,
) -> Result<(), String> {
    let tolerance = if expected.exact { 0 } else { 1024 };
    if actual.abs_diff(expected.bytes) <= tolerance {
        Ok(())
    } else {
        Err("The Nexus download size did not match authenticated file metadata.".to_string())
    }
}

async fn download_trusted_nexus_package(
    app: &tauri::AppHandle,
    install_id: &str,
    input: &TrustedNexusInstallRequest,
    cancel_rx: &mut watch::Receiver<bool>,
) -> Result<PathBuf, String> {
    let kind = nexus_archive_kind(&input.file_name)?;
    let parsed = parse_and_validate_remote_url(&input.download_url)?;
    validate_nexus_download_host(&parsed)?;
    let staging = mod_staging_dir(install_id)?;
    fs::create_dir_all(&staging)
        .map_err(|error| format!("Could not create staging folder: {error}"))?;
    let package = staging.join(sanitize_file_name(&input.file_name));

    update_queue_item(app, install_id, |item| {
        item.status = ModInstallStatus::Downloading;
        item.phase = "download".to_string();
        item.speed = "Connecting to Nexus CDN".to_string();
        item.progress = 5;
    })?;
    let response = send_trusted_nexus_request(parsed).await?;
    validate_nexus_content_type(response.headers().get(CONTENT_TYPE), kind)?;
    if let Some(declared) = response.content_length() {
        validate_declared_download_size(Some(declared), MAX_REMOTE_MOD_BYTES)?;
        validate_nexus_expected_size(declared, input.expected_size)?;
    }

    let mut stream = response.bytes_stream();
    let write_result: Result<u64, String> = async {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&package)
            .map_err(|error| format!("Could not create downloaded mod file: {error}"))?;
        let mut downloaded = 0_u64;
        while let Some(chunk) = stream.next().await {
            if *cancel_rx.borrow() {
                return Err("cancelled".to_string());
            }
            let chunk = chunk
                .map_err(|_| "The authenticated Nexus download was incomplete.".to_string())?;
            let next_size = checked_download_size(downloaded, chunk.len(), MAX_REMOTE_MOD_BYTES)?;
            if next_size > input.expected_size.bytes.saturating_add(1024) {
                return Err("The Nexus download exceeded authenticated file metadata.".to_string());
            }
            file.write_all(&chunk)
                .map_err(|error| format!("Could not write mod download chunk: {error}"))?;
            downloaded = next_size;
            let progress = 5
                + (((downloaded as f64 / input.expected_size.bytes as f64) * 80.0).round() as u32)
                    .min(80);
            update_queue_item(app, install_id, |item| {
                item.progress = progress.min(85);
                item.speed = "Downloading from Nexus".to_string();
                item.bytes_downloaded = Some(downloaded);
                item.bytes_total = Some(input.expected_size.bytes);
            })?;
        }
        file.sync_all()
            .map_err(|error| format!("Could not flush downloaded mod file: {error}"))?;
        Ok(downloaded)
    }
    .await;
    let downloaded = match write_result {
        Ok(downloaded) => downloaded,
        Err(error) => {
            let _ = fs::remove_file(&package);
            return Err(error);
        }
    };
    if let Err(error) = validate_nexus_expected_size(downloaded, input.expected_size)
        .and_then(|_| validate_archive_magic(&package, kind))
    {
        let _ = fs::remove_file(&package);
        return Err(error);
    }
    Ok(package)
}

fn validate_archive_magic(path: &Path, kind: NexusArchiveKind) -> Result<(), String> {
    let mut file = fs::File::open(path)
        .map_err(|error| format!("Could not inspect downloaded archive: {error}"))?;
    let mut prefix = [0_u8; 8];
    let count = file
        .read(&mut prefix)
        .map_err(|error| format!("Could not inspect downloaded archive: {error}"))?;
    let valid = match kind {
        NexusArchiveKind::Zip => {
            count >= 4
                && matches!(
                    &prefix[..4],
                    [b'P', b'K', 3, 4] | [b'P', b'K', 5, 6] | [b'P', b'K', 7, 8]
                )
        }
        NexusArchiveKind::SevenZip => {
            count >= 6 && prefix[..6] == [b'7', b'z', 0xBC, 0xAF, 0x27, 0x1C]
        }
    };
    if valid {
        Ok(())
    } else {
        Err("The downloaded file signature did not match its Nexus archive metadata.".to_string())
    }
}

fn is_followable_redirect_status(status: StatusCode) -> bool {
    matches!(
        status,
        StatusCode::MOVED_PERMANENTLY
            | StatusCode::FOUND
            | StatusCode::SEE_OTHER
            | StatusCode::TEMPORARY_REDIRECT
            | StatusCode::PERMANENT_REDIRECT
    )
}

fn validated_redirect_url(
    current: &Url,
    location: &str,
    redirects_followed: usize,
    max_redirects: usize,
) -> Result<Url, String> {
    if redirects_followed >= max_redirects {
        return Err(format!(
            "Mod download exceeded the {max_redirects}-redirect limit."
        ));
    }
    let next = current
        .join(location)
        .map_err(|error| format!("Invalid mod download redirect: {error}"))?;
    validate_remote_url_syntax(&next)?;
    Ok(next)
}

fn validate_declared_download_size(declared: Option<u64>, max: u64) -> Result<(), String> {
    if declared.is_some_and(|size| size > max) {
        return Err(format!(
            "Remote mod archive exceeds the {} byte download limit.",
            max
        ));
    }
    Ok(())
}

fn checked_download_size(current: u64, chunk_len: usize, max: u64) -> Result<u64, String> {
    let chunk_len = u64::try_from(chunk_len)
        .map_err(|_| "Remote mod download chunk size overflowed.".to_string())?;
    let next = current
        .checked_add(chunk_len)
        .ok_or_else(|| "Remote mod download size overflowed.".to_string())?;
    if next > max {
        return Err(format!(
            "Remote mod archive exceeds the {max} byte download limit."
        ));
    }
    Ok(next)
}

fn validated_game_install_root(
    game: &crate::commands::games::InstalledGame,
) -> Result<PathBuf, String> {
    let install_root = game
        .install_path
        .as_deref()
        .map(PathBuf::from)
        .ok_or_else(|| format!("{} has no local install path.", game.title))?;
    if !install_root.is_absolute() || !install_root.is_dir() || is_restricted_target(&install_root)
    {
        return Err("The selected game's install root cannot be verified safely.".to_string());
    }
    let resolved = resolve_path_with_existing_ancestors(&install_root)?;
    if !resolved.is_dir() || is_restricted_target(&resolved) {
        return Err("The selected game's install root cannot be verified safely.".to_string());
    }
    Ok(resolved)
}

fn prepare_trusted_nexus_archive(
    install_id: &str,
    package: &Path,
    file_name: &str,
    install_root: &Path,
    replacing_install_id: Option<&str>,
) -> Result<TrustedNexusPreparation, String> {
    let kind = nexus_archive_kind(file_name)?;
    let extracted = mod_staging_dir(install_id)?.join("extracted");
    if extracted.exists() {
        cleanup_mod_staging_path(&extracted)?;
    }
    fs::create_dir_all(&extracted)
        .map_err(|error| format!("Could not create extraction folder: {error}"))?;
    match kind {
        NexusArchiveKind::Zip => extract_zip_safely(package, &extracted)?,
        NexusArchiveKind::SevenZip => extract_7z_safely(package, &extracted)?,
    }

    let mut source_root = collapse_single_archive_wrapper(&extracted)?;
    let staged_files = collect_relative_files(&source_root)?;
    if staged_files.is_empty() {
        return Ok(TrustedNexusPreparation::Handoff(
            "The Nexus archive contained no directly installable files; continue on Nexus."
                .to_string(),
        ));
    }
    if staged_files.iter().any(|relative| {
        relative
            .replace('\\', "/")
            .to_ascii_lowercase()
            .ends_with("fomod/moduleconfig.xml")
    }) {
        return Ok(TrustedNexusPreparation::Handoff(
            "This mod uses FOMOD installer instructions; continue on Nexus with a compatible mod manager."
                .to_string(),
        ));
    }
    if staged_files.iter().any(|relative| {
        Path::new(relative)
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| {
                matches!(
                    extension.to_ascii_lowercase().as_str(),
                    "exe" | "msi" | "bat" | "cmd" | "com" | "ps1"
                )
            })
    }) {
        return Ok(TrustedNexusPreparation::Handoff(
            "This archive contains an executable installer; continue on Nexus instead of applying it to the game automatically."
                .to_string(),
        ));
    }

    let explicit_targets = explicit_archive_targets(&source_root)?;
    let target = match explicit_targets.as_slice() {
        [(relative_source, relative_target)] => {
            source_root = relative_source.clone();
            install_root.join(relative_target)
        }
        [] => match infer_existing_game_target(install_root, &staged_files)? {
            Some(target) => target,
            None => {
                return Ok(TrustedNexusPreparation::Handoff(
                    "OG-Launcher could not determine one safe game-owned destination for this archive; continue on Nexus."
                        .to_string(),
                ));
            }
        },
        _ => {
            return Ok(TrustedNexusPreparation::Handoff(
                "The archive targets multiple game mod locations and requires provider-managed installation."
                    .to_string(),
            ));
        }
    };
    let target = validate_mod_target_under_game_root(install_root, &target)?;
    if source_root == extracted && target == install_root {
        return Ok(TrustedNexusPreparation::Handoff(
            "OG-Launcher refused an ambiguous whole-game-root archive; continue on Nexus."
                .to_string(),
        ));
    }
    let final_files = collect_relative_files(&source_root)?;
    if has_managed_mod_conflict(&target, &final_files, replacing_install_id) {
        return Ok(TrustedNexusPreparation::Handoff(
            "This archive conflicts with files owned by another managed mod; continue on Nexus to resolve the conflict."
                .to_string(),
        ));
    }
    Ok(TrustedNexusPreparation::Ready {
        extracted: source_root,
        target,
    })
}

fn has_managed_mod_conflict(
    target: &Path,
    requested_files: &[String],
    replacing_install_id: Option<&str>,
) -> bool {
    let requested = requested_files
        .iter()
        .map(|relative| relative.replace('\\', "/").to_ascii_lowercase())
        .collect::<HashSet<_>>();
    read_manifests_from_target(target)
        .into_iter()
        .filter(|install| Some(install.install_id.as_str()) != replacing_install_id)
        .any(|install| {
            install.file_records.iter().any(|record| {
                requested.contains(&record.relative_path.replace('\\', "/").to_ascii_lowercase())
            })
        })
}

fn collapse_single_archive_wrapper(root: &Path) -> Result<PathBuf, String> {
    let mut files = 0usize;
    let mut directories = Vec::new();
    for entry in fs::read_dir(root)
        .map_err(|error| format!("Could not inspect extracted archive: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Could not inspect archive entry: {error}"))?;
        let metadata = fs::symlink_metadata(entry.path())
            .map_err(|error| format!("Could not inspect archive entry metadata: {error}"))?;
        if metadata.file_type().is_symlink() {
            return Err("The archive contained a symbolic link.".to_string());
        }
        if metadata.is_dir() {
            directories.push(entry.path());
        } else if metadata.is_file() {
            files += 1;
        } else {
            return Err("The archive contained an unsupported filesystem entry.".to_string());
        }
    }
    if files == 0 && directories.len() == 1 {
        let name = directories[0]
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        if !matches!(name.as_str(), "data" | "bepinex" | "mods" | "mod") {
            return Ok(directories.remove(0));
        }
    }
    Ok(root.to_path_buf())
}

/// Returns `(archive source root, target relative to game root)` pairs.
fn explicit_archive_targets(root: &Path) -> Result<Vec<(PathBuf, PathBuf)>, String> {
    let mut targets = Vec::new();
    if let Some(data) = find_child_directory(root, "Data")? {
        targets.push((data, PathBuf::from("Data")));
    }
    if let Some(bepinex) = find_child_directory(root, "BepInEx")? {
        if let Some(plugins) = find_child_directory(&bepinex, "plugins")? {
            targets.push((plugins, PathBuf::from("BepInEx").join("plugins")));
        }
    }
    if let Some(mods) = find_child_directory(root, "Mods")? {
        targets.push((mods, PathBuf::from("Mods")));
    }
    Ok(targets)
}

fn find_child_directory(root: &Path, name: &str) -> Result<Option<PathBuf>, String> {
    let mut found = None;
    for entry in
        fs::read_dir(root).map_err(|error| format!("Could not inspect archive layout: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Could not inspect archive layout: {error}"))?;
        if !entry
            .file_name()
            .to_string_lossy()
            .eq_ignore_ascii_case(name)
        {
            continue;
        }
        let metadata = fs::symlink_metadata(entry.path())
            .map_err(|error| format!("Could not inspect archive layout: {error}"))?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() || found.is_some() {
            return Err(
                "The archive contained an ambiguous or unsafe destination directory.".to_string(),
            );
        }
        found = Some(entry.path());
    }
    Ok(found)
}

fn infer_existing_game_target(
    install_root: &Path,
    staged_files: &[String],
) -> Result<Option<PathBuf>, String> {
    let data = find_child_directory(install_root, "Data")?;
    let bepinex_plugins = find_child_directory(install_root, "BepInEx")?
        .map(|bepinex| find_child_directory(&bepinex, "plugins"))
        .transpose()?
        .flatten();
    let mods = find_child_directory(install_root, "Mods")?;
    let existing = [data.clone(), bepinex_plugins.clone(), mods.clone()]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    if existing.len() == 1 {
        return Ok(existing.into_iter().next());
    }
    if existing.is_empty() {
        return Ok(Some(install_root.join("mods")));
    }

    let lower = staged_files
        .iter()
        .map(|relative| relative.to_ascii_lowercase())
        .collect::<Vec<_>>();
    let bethesda_layout = lower.iter().any(|relative| {
        relative.starts_with("meshes/")
            || relative.starts_with("textures/")
            || relative.starts_with("scripts/")
            || matches!(
                Path::new(relative)
                    .extension()
                    .and_then(|value| value.to_str()),
                Some("esp" | "esm" | "esl" | "bsa")
            )
    });
    let bepinex_layout =
        lower.iter().any(|relative| relative.ends_with(".dll")) && !bethesda_layout;
    if bethesda_layout {
        Ok(data)
    } else if bepinex_layout {
        Ok(bepinex_plugins)
    } else {
        Ok(mods.or_else(|| Some(install_root.join("mods"))))
    }
}

fn extract_zip_safely(zip_path: &Path, target: &Path) -> Result<(), String> {
    extract_zip_safely_with_limits(
        zip_path,
        target,
        MAX_MOD_ARCHIVE_ENTRIES,
        MAX_EXTRACTED_MOD_BYTES,
    )
}

fn extract_zip_safely_with_limits(
    zip_path: &Path,
    target: &Path,
    max_entries: usize,
    max_uncompressed_bytes: u64,
) -> Result<(), String> {
    let file = fs::File::open(zip_path).map_err(|error| format!("Could not open ZIP: {error}"))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|error| format!("Invalid ZIP: {error}"))?;
    if archive.len() > max_entries {
        return Err(format!(
            "ZIP entry limit exceeded: archive has {} entries, maximum is {max_entries}.",
            archive.len()
        ));
    }
    let mut extracted_bytes = 0_u64;
    let mut seen = HashSet::new();
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("Could not read ZIP entry: {error}"))?;
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err("ZIP contains a symbolic link.".to_string());
        }
        let Some(enclosed) = entry.enclosed_name().map(|path| path.to_path_buf()) else {
            return Err("ZIP contains a path outside the install folder.".to_string());
        };
        let duplicate_key = enclosed
            .to_string_lossy()
            .replace('\\', "/")
            .to_ascii_lowercase();
        if duplicate_key.is_empty() || !seen.insert(duplicate_key) {
            return Err("ZIP contains duplicate or empty entry paths.".to_string());
        }
        let out_path = target.join(enclosed);
        ensure_path_inside_root(&out_path, target)?;
        if entry.is_dir() {
            fs::create_dir_all(&out_path)
                .map_err(|error| format!("Could not create ZIP folder: {error}"))?;
        } else {
            let remaining = max_uncompressed_bytes.saturating_sub(extracted_bytes);
            if entry.size() > remaining {
                return Err(format!(
                    "ZIP uncompressed size limit exceeded: maximum is {max_uncompressed_bytes} bytes."
                ));
            }
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("Could not create ZIP entry parent: {error}"))?;
            }
            let mut out_file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&out_path)
                .map_err(|error| format!("Could not create ZIP entry file: {error}"))?;
            let copied = {
                let mut limited_entry = (&mut entry).take(remaining.saturating_add(1));
                std::io::copy(&mut limited_entry, &mut out_file)
            };
            let copied = match copied {
                Ok(copied) => copied,
                Err(error) => {
                    drop(out_file);
                    let _ = fs::remove_file(&out_path);
                    return Err(format!("Could not extract ZIP entry: {error}"));
                }
            };
            if copied > remaining {
                drop(out_file);
                let _ = fs::remove_file(&out_path);
                return Err(format!(
                    "ZIP uncompressed size limit exceeded: maximum is {max_uncompressed_bytes} bytes."
                ));
            }
            if copied != entry.size() {
                drop(out_file);
                let _ = fs::remove_file(&out_path);
                return Err("ZIP entry size did not match its archive metadata.".to_string());
            }
            extracted_bytes += copied;
        }
    }
    Ok(())
}

fn extract_7z_safely(path: &Path, target: &Path) -> Result<(), String> {
    extract_7z_safely_with_limits(
        path,
        target,
        MAX_MOD_ARCHIVE_ENTRIES,
        MAX_EXTRACTED_MOD_BYTES,
    )
}

fn extract_7z_safely_with_limits(
    path: &Path,
    target: &Path,
    max_entries: usize,
    max_uncompressed_bytes: u64,
) -> Result<(), String> {
    let mut entries = 0usize;
    let mut extracted_bytes = 0u64;
    let mut seen = HashSet::new();
    sevenz_rust2::decompress_file_with_extract_fn(path, target, |entry, reader, destination| {
        entries = entries.saturating_add(1);
        if entries > max_entries {
            return Err(sevenz_rust2::Error::Other(
                format!("7z entry limit exceeded: maximum is {max_entries}.").into(),
            ));
        }
        if entry.is_anti_item
            || (entry.has_windows_attributes
                && (entry.windows_attributes() >> 16) & 0o170000 == 0o120000)
        {
            return Err(sevenz_rust2::Error::Other(
                "7z contains a link or anti-item entry.".into(),
            ));
        }
        let duplicate_key = entry.name().replace('\\', "/").to_ascii_lowercase();
        if duplicate_key.is_empty() || !seen.insert(duplicate_key) {
            return Err(sevenz_rust2::Error::Other(
                "7z contains duplicate or empty entry paths.".into(),
            ));
        }
        ensure_path_inside_root(destination, target)
            .map_err(|error| sevenz_rust2::Error::Other(error.into()))?;
        if entry.is_directory() {
            fs::create_dir_all(destination).map_err(sevenz_rust2::Error::from)?;
            return Ok(true);
        }
        let next_total = extracted_bytes
            .checked_add(entry.size())
            .ok_or_else(|| sevenz_rust2::Error::Other("7z size overflow.".into()))?;
        if next_total > max_uncompressed_bytes {
            return Err(sevenz_rust2::Error::Other(
                format!(
                "7z uncompressed size limit exceeded: maximum is {max_uncompressed_bytes} bytes."
            )
                .into(),
            ));
        }
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(sevenz_rust2::Error::from)?;
        }
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(destination)
            .map_err(sevenz_rust2::Error::from)?;
        let copied = {
            let mut limited = reader.take(entry.size().saturating_add(1));
            std::io::copy(&mut limited, &mut output).map_err(sevenz_rust2::Error::from)?
        };
        if copied != entry.size() {
            drop(output);
            let _ = fs::remove_file(destination);
            return Err(sevenz_rust2::Error::Other(
                "7z entry size did not match its archive metadata.".into(),
            ));
        }
        output.sync_all().map_err(sevenz_rust2::Error::from)?;
        extracted_bytes = next_total;
        Ok(true)
    })
    .map_err(|error| format!("Invalid or unsafe 7z archive: {error}"))
}

fn cleanup_mod_staging_path(path: &Path) -> Result<(), String> {
    match fs::remove_dir_all(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "Could not remove staging folder '{}': {error}",
            path.display()
        )),
    }
}

fn apply_staged_files(
    install_id: &str,
    extracted: &Path,
    target: &Path,
    files: &[String],
) -> Result<Vec<ModInstalledFileRecord>, String> {
    let backup_root = mod_backup_dir(install_id)?;
    apply_staged_files_with_backup_root(install_id, extracted, target, files, &backup_root)
}

fn apply_staged_files_with_backup_root(
    install_id: &str,
    extracted: &Path,
    target: &Path,
    files: &[String],
    backup_root: &Path,
) -> Result<Vec<ModInstalledFileRecord>, String> {
    if backup_root.exists() {
        return Err(format!(
            "Backup ownership path {} is already occupied.",
            backup_root.display()
        ));
    }

    let mut records = Vec::<ModInstalledFileRecord>::new();
    let mut seen = HashSet::new();

    let result = (|| {
        for relative in files {
            if !seen.insert(relative.clone()) {
                return Err(format!("Mod archive contains duplicate file '{relative}'."));
            }
            let source = safe_join(extracted, relative)?;
            let destination = safe_join(target, relative)?;
            let source_metadata = regular_file_metadata(&source, "staged mod file")?
                .ok_or_else(|| format!("Staged mod file '{}' is missing.", source.display()))?;
            let installed_sha256 = sha256_file(&source)?;
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("Could not create mod file parent: {error}"))?;
            }

            let backup = if let Some(original_metadata) =
                regular_file_metadata(&destination, "existing game file")?
            {
                let backup = safe_join(backup_root, relative)?;
                if let Some(parent) = backup.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|error| format!("Could not create backup parent: {error}"))?;
                }
                let original_sha256 = sha256_file(&destination)?;
                copy_file_create_new(&destination, &backup)
                    .map_err(|error| format!("Could not back up existing mod file: {error}"))?;
                Some(ModBackupRecord {
                    owner_install_id: install_id.to_string(),
                    backup_relative_path: relative.clone(),
                    original_sha256,
                    original_size: original_metadata.len(),
                })
            } else {
                None
            };

            records.push(ModInstalledFileRecord {
                relative_path: relative.clone(),
                owner_install_id: install_id.to_string(),
                installed_sha256: installed_sha256.clone(),
                installed_size: source_metadata.len(),
                backup,
            });
            fs::copy(&source, &destination)
                .map_err(|error| format!("Could not install mod file {}: {error}", relative))?;
            verify_owned_file(
                &destination,
                &installed_sha256,
                source_metadata.len(),
                "installed mod file",
            )?;
        }
        Ok::<(), String>(())
    })();

    if let Err(error) = result {
        return match rollback_applied_file_records(&records, target, backup_root) {
            Ok(()) => Err(error),
            Err(rollback_error) => Err(format!(
                "{error} The partial install could not be rolled back safely: {rollback_error}"
            )),
        };
    }

    Ok(records)
}

fn set_mod_enabled(install_id: &str, enabled: bool) -> Result<InstalledModInfo, String> {
    let install_id = normalize_id(install_id, "installId")?;
    let mut install =
        local_db::read_item::<InstalledModInfo>(MOD_INSTALLS_COLLECTION, &install_id)?
            .ok_or_else(|| format!("Mod install '{install_id}' was not found."))?;
    if install.enabled == enabled {
        return Ok(install);
    }

    if install.provider != ModProvider::LocalFolder {
        let target = validate_persisted_install_target(&install)?;
        let backup_root = mod_backup_dir(&install.install_id)?;
        set_mod_files_enabled_at_roots(&install, enabled, &target, &backup_root)?;
    }

    install = local_db::update_item(
        MOD_INSTALLS_COLLECTION,
        &install_id,
        |latest: &mut InstalledModInfo| {
            latest.enabled = enabled;
            Ok(())
        },
    )?;
    write_manifest_from_info(&install)?;
    Ok(install)
}

fn set_mod_files_enabled_at_roots(
    install: &InstalledModInfo,
    enabled: bool,
    target: &Path,
    backup_root: &Path,
) -> Result<(), String> {
    validate_file_record_ownership(install, target, backup_root)?;
    validate_backup_tree(install, backup_root)?;
    verify_manifest_ownership_if_present(install, target)?;
    let disabled_root = disabled_root_for_install(target, &install.install_id)?;

    for record in &install.file_records {
        let active = safe_join(target, &record.relative_path)?;
        let disabled = safe_join(&disabled_root, &record.relative_path)?;
        if enabled {
            if !verify_owned_file_if_present(
                &disabled,
                &record.installed_sha256,
                record.installed_size,
                "disabled mod file",
            )? {
                return Err(format!(
                    "Cannot enable mod because {} is missing.",
                    disabled.display()
                ));
            }
            if let Some(backup) = &record.backup {
                verify_owned_file(
                    &active,
                    &backup.original_sha256,
                    backup.original_size,
                    "restored original game file",
                )?;
                let backup_path = safe_join(backup_root, &backup.backup_relative_path)?;
                verify_owned_file(
                    &backup_path,
                    &backup.original_sha256,
                    backup.original_size,
                    "owned original-file backup",
                )?;
            } else if regular_file_metadata(&active, "mod target")?.is_some() {
                return Err(format!(
                    "Cannot enable mod because unowned file {} already exists.",
                    active.display()
                ));
            }
        } else {
            verify_owned_file(
                &active,
                &record.installed_sha256,
                record.installed_size,
                "installed mod file",
            )?;
            if regular_file_metadata(&disabled, "disabled mod target")?.is_some() {
                return Err(format!(
                    "Cannot disable mod because {} is already occupied.",
                    disabled.display()
                ));
            }
            if let Some(backup) = &record.backup {
                let backup_path = safe_join(backup_root, &backup.backup_relative_path)?;
                verify_owned_file(
                    &backup_path,
                    &backup.original_sha256,
                    backup.original_size,
                    "owned original-file backup",
                )?;
            }
        }
    }

    let mut processed = Vec::new();
    for record in &install.file_records {
        let result = if enabled {
            enable_owned_mod_file(record, target, backup_root, &disabled_root)
        } else {
            disable_owned_mod_file(record, target, backup_root, &disabled_root)
        };
        if let Err(error) = result {
            return match rollback_enabled_transition(
                install,
                enabled,
                &processed,
                target,
                backup_root,
                &disabled_root,
            ) {
                Ok(()) => Err(error),
                Err(rollback_error) => Err(format!(
                    "{error} The enable/disable transition could not be rolled back safely: {rollback_error}"
                )),
            };
        }
        processed.push(record.relative_path.as_str());
    }

    if enabled && disabled_root.exists() {
        let _ = fs::remove_dir(&disabled_root);
    }
    Ok(())
}

fn disable_owned_mod_file(
    record: &ModInstalledFileRecord,
    target: &Path,
    backup_root: &Path,
    disabled_root: &Path,
) -> Result<(), String> {
    let active = safe_join(target, &record.relative_path)?;
    let disabled = safe_join(disabled_root, &record.relative_path)?;
    if let Some(parent) = disabled.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create disabled mod parent: {error}"))?;
    }
    fs::rename(&active, &disabled)
        .map_err(|error| format!("Could not disable mod file: {error}"))?;

    if let Some(backup) = &record.backup {
        let backup_path = safe_join(backup_root, &backup.backup_relative_path)?;
        let restore_result = fs::copy(&backup_path, &active)
            .map_err(|error| format!("Could not restore original file while disabling: {error}"))
            .and_then(|_| {
                verify_owned_file(
                    &active,
                    &backup.original_sha256,
                    backup.original_size,
                    "restored original game file",
                )
            });
        if let Err(error) = restore_result {
            let _ = fs::remove_file(&active);
            let _ = fs::rename(&disabled, &active);
            return Err(error);
        }
    }
    Ok(())
}

fn enable_owned_mod_file(
    record: &ModInstalledFileRecord,
    target: &Path,
    backup_root: &Path,
    disabled_root: &Path,
) -> Result<(), String> {
    let active = safe_join(target, &record.relative_path)?;
    let disabled = safe_join(disabled_root, &record.relative_path)?;
    if let Some(parent) = active.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create enabled mod parent: {error}"))?;
    }

    if let Some(backup) = &record.backup {
        let backup_path = safe_join(backup_root, &backup.backup_relative_path)?;
        let enable_result = fs::copy(&disabled, &active)
            .map_err(|error| format!("Could not enable mod file: {error}"))
            .and_then(|_| {
                verify_owned_file(
                    &active,
                    &record.installed_sha256,
                    record.installed_size,
                    "enabled mod file",
                )
            })
            .and_then(|_| {
                fs::remove_file(&disabled)
                    .map_err(|error| format!("Could not remove disabled mod copy: {error}"))
            });
        if let Err(error) = enable_result {
            let _ = fs::copy(&backup_path, &active);
            return Err(error);
        }
    } else {
        fs::rename(&disabled, &active)
            .map_err(|error| format!("Could not restore disabled mod file: {error}"))?;
    }
    Ok(())
}

fn rollback_enabled_transition(
    install: &InstalledModInfo,
    enabled: bool,
    processed: &[&str],
    target: &Path,
    backup_root: &Path,
    disabled_root: &Path,
) -> Result<(), String> {
    for relative in processed.iter().rev() {
        let record = install
            .file_records
            .iter()
            .find(|record| record.relative_path.as_str() == *relative)
            .ok_or_else(|| "Could not locate owned file during transition rollback.".to_string())?;
        let active = safe_join(target, relative)?;
        let disabled = safe_join(disabled_root, relative)?;
        if let Some(parent) = disabled.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Could not create rollback directory: {error}"))?;
        }

        if enabled {
            if let Some(backup) = &record.backup {
                fs::copy(&active, &disabled).map_err(|error| {
                    format!("Could not re-disable mod during rollback: {error}")
                })?;
                let backup_path = safe_join(backup_root, &backup.backup_relative_path)?;
                fs::copy(&backup_path, &active).map_err(|error| {
                    format!("Could not restore original during rollback: {error}")
                })?;
            } else {
                fs::rename(&active, &disabled).map_err(|error| {
                    format!("Could not re-disable mod during rollback: {error}")
                })?;
            }
        } else {
            if record.backup.is_some() && active.exists() {
                fs::remove_file(&active).map_err(|error| {
                    format!("Could not remove restored original during rollback: {error}")
                })?;
            }
            fs::rename(&disabled, &active)
                .map_err(|error| format!("Could not re-enable mod during rollback: {error}"))?;
        }
    }
    Ok(())
}

fn write_manifest_from_info(info: &InstalledModInfo) -> Result<(), String> {
    if info.provider == ModProvider::LocalFolder {
        return Ok(());
    }

    let manifest = ModInstallManifest {
        install_id: info.install_id.clone(),
        game_id: info.game_id.clone(),
        title: info.title.clone(),
        provider: info.provider,
        enabled: info.enabled,
        target_path: info.target_path.clone(),
        installed_files: info.installed_files.clone(),
        profile_id: info.profile_id.clone(),
        catalog_item_id: info.catalog_item_id.clone(),
        version_id: info.version_id.clone(),
        provider_file_id: info.provider_file_id.clone(),
        source_url: info.source_url.clone(),
        installed_at: info.installed_at,
        manifest_version: info.manifest_version,
        file_records: info.file_records.clone(),
    };
    let target = PathBuf::from(&manifest.target_path);
    let manifest_path = checked_manifest_file_path(&target, &manifest.install_id)?;
    verify_manifest_ownership_if_present(info, &target)?;
    if let Some(parent) = manifest_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create manifest directory: {error}"))?;
    }
    let json = serde_json::to_string_pretty(&manifest)
        .map_err(|error| format!("Could not encode mod manifest: {error}"))?;
    fs::write(manifest_path, json).map_err(|error| format!("Could not write mod manifest: {error}"))
}

fn read_manifests_from_target(target: &Path) -> Vec<InstalledModInfo> {
    let manifest_dir = target.join(MOD_MANIFEST_DIR);
    let Ok(entries) = fs::read_dir(manifest_dir) else {
        return Vec::new();
    };
    let Ok(expected_target) = resolve_path_with_existing_ancestors(target) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter_map(|entry| {
            regular_file_metadata(&entry.path(), "mod manifest")
                .ok()
                .flatten()
                .and_then(|_| fs::read_to_string(entry.path()).ok())
        })
        .filter_map(|contents| serde_json::from_str::<ModInstallManifest>(&contents).ok())
        .filter(|manifest| {
            resolve_path_with_existing_ancestors(Path::new(&manifest.target_path))
                .is_ok_and(|manifest_target| manifest_target == expected_target)
        })
        .map(info_from_manifest)
        .collect()
}

fn validate_mod_target_under_game_root(
    install_root: &Path,
    target: &Path,
) -> Result<PathBuf, String> {
    let resolved_root = resolve_path_with_existing_ancestors(install_root)?;
    let resolved_target = resolve_path_with_existing_ancestors(target)?;
    if !resolved_target.starts_with(&resolved_root) {
        return Err(format!(
            "Mod target {} is outside the selected game's install root.",
            target.display()
        ));
    }
    if resolved_target.exists() && !resolved_target.is_dir() {
        return Err(format!(
            "Mod target {} is not a directory.",
            resolved_target.display()
        ));
    }
    let relative = resolved_target
        .strip_prefix(&resolved_root)
        .map_err(|_| "Could not validate the mod target path.".to_string())?;
    if relative.components().any(|component| {
        let value = component.as_os_str().to_string_lossy();
        value.eq_ignore_ascii_case(MOD_MANIFEST_DIR) || value.eq_ignore_ascii_case(MOD_DISABLED_DIR)
    }) {
        return Err("Mod targets may not use launcher-owned metadata directories.".to_string());
    }
    ensure_writable_mod_target(&resolved_target)?;
    Ok(resolved_target)
}

fn ensure_writable_mod_target(target: &Path) -> Result<(), String> {
    if is_restricted_target(target) {
        return Err("Target is restricted by the OS or platform launcher.".to_string());
    }
    Ok(())
}

fn validate_persisted_install_target(install: &InstalledModInfo) -> Result<PathBuf, String> {
    let game = read_installed_games_cache_result()?
        .into_iter()
        .find(|game| game.id == install.game_id)
        .ok_or_else(|| {
            format!(
                "Cannot verify mod target ownership because game '{}' is not installed.",
                install.game_id
            )
        })?;
    let install_root = game
        .install_path
        .as_deref()
        .map(PathBuf::from)
        .ok_or_else(|| format!("{} has no local install path.", game.title))?;
    if !install_root.is_dir() || is_restricted_target(&install_root) {
        return Err("The selected game's install root cannot be verified safely.".to_string());
    }
    let target = PathBuf::from(&install.target_path);
    if !target.is_absolute() {
        return Err("Persisted mod target is not an absolute game-owned path.".to_string());
    }
    validate_mod_target_under_game_root(&install_root, &target)
}

fn validate_file_record_ownership(
    install: &InstalledModInfo,
    target: &Path,
    backup_root: &Path,
) -> Result<(), String> {
    if install.manifest_version != MOD_MANIFEST_VERSION {
        return Err(format!(
            "Mod install '{}' uses legacy ownership metadata. Refusing destructive changes; reinstall it to create a version {} manifest.",
            install.install_id, MOD_MANIFEST_VERSION
        ));
    }
    if !install
        .install_id
        .starts_with(&format!("mod-{}-", install.provider.as_str()))
        || !has_uuid_install_id(&install.install_id)
    {
        return Err("Mod ownership metadata does not use a valid UUID install ID.".to_string());
    }
    if install.file_records.len() != install.installed_files.len() {
        return Err("Mod manifest file ownership records are incomplete.".to_string());
    }

    let disabled_root = disabled_root_for_install(target, &install.install_id)?;
    let mut installed_paths = HashSet::new();
    for relative in &install.installed_files {
        if !installed_paths.insert(relative.as_str()) {
            return Err("Mod manifest contains duplicate installed file paths.".to_string());
        }
        validate_owned_relative_path(relative)?;
    }

    let mut record_paths = HashSet::new();
    let mut backup_paths = HashSet::new();
    for record in &install.file_records {
        validate_owned_relative_path(&record.relative_path)?;
        if record.owner_install_id != install.install_id {
            return Err("Mod file ownership does not match the install ID.".to_string());
        }
        if !record_paths.insert(record.relative_path.as_str())
            || !installed_paths.contains(record.relative_path.as_str())
        {
            return Err(
                "Mod manifest file ownership paths do not match installed files.".to_string(),
            );
        }
        normalize_sha256(&record.installed_sha256)?;
        safe_join(target, &record.relative_path)?;
        safe_join(&disabled_root, &record.relative_path)?;

        if let Some(backup) = &record.backup {
            if backup.owner_install_id != install.install_id {
                return Err("Mod backup ownership does not match the install ID.".to_string());
            }
            validate_owned_relative_path(&backup.backup_relative_path)?;
            if !backup_paths.insert(backup.backup_relative_path.as_str()) {
                return Err("Mod manifest contains duplicate backup paths.".to_string());
            }
            normalize_sha256(&backup.original_sha256)?;
            safe_join(backup_root, &backup.backup_relative_path)?;
        }
    }
    Ok(())
}

fn validate_owned_relative_path(relative: &str) -> Result<(), String> {
    let path = Path::new(relative);
    let first = path
        .components()
        .next()
        .ok_or_else(|| "Mod ownership metadata contains an empty relative path.".to_string())?;
    let first = first.as_os_str().to_string_lossy();
    if first.eq_ignore_ascii_case(MOD_MANIFEST_DIR) || first.eq_ignore_ascii_case(MOD_DISABLED_DIR)
    {
        return Err("Mod ownership metadata targets a launcher-owned directory.".to_string());
    }
    Ok(())
}

fn validate_backup_tree(install: &InstalledModInfo, backup_root: &Path) -> Result<(), String> {
    let expected = install
        .file_records
        .iter()
        .filter_map(|record| {
            record
                .backup
                .as_ref()
                .map(|backup| backup.backup_relative_path.as_str())
        })
        .collect::<HashSet<_>>();
    if !backup_root.exists() {
        if expected.is_empty() {
            return Ok(());
        }
        return Err("Owned original-file backup directory is missing.".to_string());
    }

    let actual = collect_owned_tree_files(backup_root)?;
    let actual = actual.iter().map(String::as_str).collect::<HashSet<_>>();
    if actual != expected {
        return Err(
            "Backup directory contents do not match the manifest ownership records.".to_string(),
        );
    }
    Ok(())
}

fn collect_owned_tree_files(root: &Path) -> Result<Vec<String>, String> {
    let metadata = fs::symlink_metadata(root)
        .map_err(|error| format!("Could not inspect owned backup directory: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("Owned backup root is not a regular directory.".to_string());
    }
    let mut files = Vec::new();
    collect_owned_tree_files_inner(root, root, &mut files)?;
    files.sort();
    Ok(files)
}

fn collect_owned_tree_files_inner(
    root: &Path,
    current: &Path,
    files: &mut Vec<String>,
) -> Result<(), String> {
    for entry in fs::read_dir(current)
        .map_err(|error| format!("Could not read owned backup directory: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Could not read owned backup entry: {error}"))?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)
            .map_err(|error| format!("Could not inspect owned backup entry: {error}"))?;
        if metadata.file_type().is_symlink() {
            return Err("Owned backup directory contains a symlink.".to_string());
        }
        if metadata.is_dir() {
            collect_owned_tree_files_inner(root, &path, files)?;
        } else if metadata.is_file() {
            files.push(
                path.strip_prefix(root)
                    .map_err(|_| "Could not compute owned backup path.".to_string())?
                    .to_string_lossy()
                    .replace('\\', "/"),
            );
        } else {
            return Err("Owned backup directory contains an unsupported entry.".to_string());
        }
    }
    Ok(())
}

fn verify_manifest_ownership_if_present(
    install: &InstalledModInfo,
    target: &Path,
) -> Result<Option<PathBuf>, String> {
    let path = checked_manifest_file_path(target, &install.install_id)?;
    let Some(_) = regular_file_metadata(&path, "mod manifest")? else {
        return Ok(None);
    };
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read mod manifest for ownership check: {error}"))?;
    let manifest: ModInstallManifest = serde_json::from_str(&contents)
        .map_err(|error| format!("Could not verify mod manifest ownership: {error}"))?;
    let manifest_target = resolve_path_with_existing_ancestors(Path::new(&manifest.target_path))?;
    let expected_target = resolve_path_with_existing_ancestors(target)?;
    if manifest.install_id != install.install_id
        || manifest.game_id != install.game_id
        || manifest.provider != install.provider
        || manifest_target != expected_target
        || manifest.manifest_version != install.manifest_version
        || manifest.installed_files != install.installed_files
        || manifest.file_records != install.file_records
    {
        return Err(
            "On-disk mod manifest does not match persisted ownership metadata.".to_string(),
        );
    }
    Ok(Some(path))
}

fn disabled_root_for_install(target: &Path, install_id: &str) -> Result<PathBuf, String> {
    safe_join(
        target,
        &format!("{MOD_DISABLED_DIR}/{}", sanitize_file_name(install_id)),
    )
}

fn checked_manifest_file_path(target: &Path, install_id: &str) -> Result<PathBuf, String> {
    safe_join(
        target,
        &format!("{MOD_MANIFEST_DIR}/{}.json", sanitize_file_name(install_id)),
    )
}

fn regular_file_metadata(path: &Path, label: &str) -> Result<Option<fs::Metadata>, String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            Err(format!("Refusing symlink at {label} {}.", path.display()))
        }
        Ok(metadata) if metadata.is_file() => Ok(Some(metadata)),
        Ok(_) => Err(format!("{label} {} is not a regular file.", path.display())),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!(
            "Could not inspect {label} {}: {error}",
            path.display()
        )),
    }
}

fn verify_owned_file(
    path: &Path,
    expected_sha256: &str,
    expected_size: u64,
    label: &str,
) -> Result<(), String> {
    let metadata = regular_file_metadata(path, label)?
        .ok_or_else(|| format!("{label} {} is missing.", path.display()))?;
    if metadata.len() != expected_size {
        return Err(format!(
            "Refusing to modify {label} {} because its size no longer matches ownership metadata.",
            path.display()
        ));
    }
    let expected = normalize_sha256(expected_sha256)?;
    let actual = sha256_file(path)?;
    if actual != expected {
        return Err(format!(
            "Refusing to modify {label} {} because its checksum no longer matches ownership metadata.",
            path.display()
        ));
    }
    Ok(())
}

fn verify_owned_file_if_present(
    path: &Path,
    expected_sha256: &str,
    expected_size: u64,
    label: &str,
) -> Result<bool, String> {
    if regular_file_metadata(path, label)?.is_none() {
        return Ok(false);
    }
    verify_owned_file(path, expected_sha256, expected_size, label)?;
    Ok(true)
}

fn copy_file_create_new(source: &Path, destination: &Path) -> Result<(), String> {
    let mut source_file =
        fs::File::open(source).map_err(|error| format!("Could not open source file: {error}"))?;
    let mut destination_file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)
        .map_err(|error| format!("Could not claim destination file: {error}"))?;
    let result = std::io::copy(&mut source_file, &mut destination_file)
        .map_err(|error| format!("Could not copy file: {error}"))
        .and_then(|_| {
            destination_file
                .sync_all()
                .map_err(|error| format!("Could not flush copied file: {error}"))
        });
    if result.is_err() {
        drop(destination_file);
        let _ = fs::remove_file(destination);
    }
    result
}

fn write_new_file(path: &Path, contents: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|error| format!("Could not claim new file: {error}"))?;
    let result = file
        .write_all(contents)
        .map_err(|error| format!("Could not write new file: {error}"))
        .and_then(|_| {
            file.sync_all()
                .map_err(|error| format!("Could not flush new file: {error}"))
        });
    if result.is_err() {
        drop(file);
        let _ = fs::remove_file(path);
    }
    result
}

fn rollback_applied_file_records(
    records: &[ModInstalledFileRecord],
    target: &Path,
    backup_root: &Path,
) -> Result<(), String> {
    for record in records.iter().rev() {
        let destination = safe_join(target, &record.relative_path)?;
        if let Some(backup) = &record.backup {
            let backup_path = safe_join(backup_root, &backup.backup_relative_path)?;
            fs::copy(&backup_path, &destination)
                .map_err(|error| format!("Could not restore install rollback backup: {error}"))?;
            verify_owned_file(
                &destination,
                &backup.original_sha256,
                backup.original_size,
                "rolled-back original file",
            )?;
        } else if regular_file_metadata(&destination, "partial mod file")?.is_some() {
            fs::remove_file(&destination)
                .map_err(|error| format!("Could not remove partial mod file: {error}"))?;
            remove_empty_parents(&destination, target);
        }
    }

    for record in records {
        if let Some(backup) = &record.backup {
            let backup_path = safe_join(backup_root, &backup.backup_relative_path)?;
            if regular_file_metadata(&backup_path, "install rollback backup")?.is_some() {
                fs::remove_file(&backup_path).map_err(|error| {
                    format!("Could not remove install rollback backup: {error}")
                })?;
                remove_empty_parents(&backup_path, backup_root);
            }
        }
    }
    if backup_root.exists() {
        fs::remove_dir(backup_root)
            .map_err(|error| format!("Could not remove install rollback directory: {error}"))?;
    }
    Ok(())
}

fn is_restricted_target(path: &Path) -> bool {
    let lower = path.to_string_lossy().to_lowercase();
    lower.contains("windowsapps") || lower.contains("msixvc")
}

fn collect_relative_files(root: &Path) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    collect_relative_files_inner(root, root, &mut files)?;
    files.sort();
    Ok(files)
}

fn collect_relative_files_inner(
    root: &Path,
    current: &Path,
    files: &mut Vec<String>,
) -> Result<(), String> {
    for entry in
        fs::read_dir(current).map_err(|error| format!("Could not read staged files: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Could not read staged file entry: {error}"))?;
        let path = entry.path();
        if path.is_dir() {
            collect_relative_files_inner(root, &path, files)?;
        } else if path.is_file() {
            let relative = path
                .strip_prefix(root)
                .map_err(|error| format!("Could not compute staged relative path: {error}"))?
                .to_string_lossy()
                .replace('\\', "/");
            if !relative.starts_with(MOD_MANIFEST_DIR) && !relative.starts_with(MOD_DISABLED_DIR) {
                files.push(relative);
            }
        }
    }
    Ok(())
}

fn safe_join(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let relative_path = Path::new(relative);
    if relative_path.as_os_str().is_empty()
        || relative_path.components().any(|component| {
            matches!(
                component,
                std::path::Component::Prefix(_)
                    | std::path::Component::RootDir
                    | std::path::Component::ParentDir
            )
        })
    {
        return Err("Refusing unsafe mod file path.".to_string());
    }
    let joined = root.join(relative_path);
    ensure_path_inside_root(&joined, root)?;
    Ok(joined)
}

fn ensure_path_inside_root(path: &Path, root: &Path) -> Result<(), String> {
    let resolved_root = resolve_path_with_existing_ancestors(root)?;
    let resolved_path = resolve_path_with_existing_ancestors(path)?;
    if resolved_path.starts_with(&resolved_root) {
        Ok(())
    } else {
        Err("Refusing to write outside the mod target folder.".to_string())
    }
}

fn resolve_path_with_existing_ancestors(path: &Path) -> Result<PathBuf, String> {
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|error| format!("Could not resolve current directory: {error}"))?
            .join(path)
    };
    let normalized = normalize_absolute_path(&absolute)?;
    let mut cursor = normalized.as_path();
    let mut missing_segments = Vec::new();

    loop {
        match cursor.canonicalize() {
            Ok(mut resolved) => {
                for segment in missing_segments.iter().rev() {
                    resolved.push(segment);
                }
                return Ok(resolved);
            }
            Err(error) => {
                // A path entry that exists but cannot be canonicalized (for
                // example a dangling symlink) must fail closed.
                if fs::symlink_metadata(cursor).is_ok() {
                    return Err(format!(
                        "Could not resolve mod path {}: {error}",
                        cursor.display()
                    ));
                }
                let segment = cursor.file_name().ok_or_else(|| {
                    format!("Could not resolve mod path {}: {error}", path.display())
                })?;
                missing_segments.push(segment.to_os_string());
                cursor = cursor.parent().ok_or_else(|| {
                    format!("Could not resolve mod path {}: {error}", path.display())
                })?;
            }
        }
    }
}

fn normalize_absolute_path(path: &Path) -> Result<PathBuf, String> {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                if !normalized.pop() {
                    return Err("Refusing unsafe mod file path.".to_string());
                }
            }
            _ => normalized.push(component.as_os_str()),
        }
    }
    Ok(normalized)
}

fn mod_staging_dir(install_id: &str) -> Result<PathBuf, String> {
    launcher_owned_mod_dir("staging", install_id)
}

fn mod_backup_dir(install_id: &str) -> Result<PathBuf, String> {
    launcher_owned_mod_dir("backups", install_id)
}

fn launcher_owned_mod_dir(category: &str, install_id: &str) -> Result<PathBuf, String> {
    let base = open_game_launcher_data_dir()
        .map(|dir| dir.join("mods").join(category))
        .ok_or_else(|| "Could not resolve launcher data directory.".to_string())?;
    let candidate = base.join(sanitize_file_name(install_id));
    let resolved_base = resolve_path_with_existing_ancestors(&base)?;
    let resolved_candidate = resolve_path_with_existing_ancestors(&candidate)?;
    if !resolved_candidate.starts_with(&resolved_base) {
        return Err("Launcher-owned mod path escaped its storage root.".to_string());
    }
    Ok(resolved_candidate)
}

fn build_install_id(provider: ModProvider) -> String {
    format!("mod-{}-{}", provider.as_str(), Uuid::new_v4())
}

fn has_uuid_install_id(install_id: &str) -> bool {
    let Some(uuid_start) = install_id.len().checked_sub(36) else {
        return false;
    };
    uuid_start > 0
        && install_id.as_bytes().get(uuid_start - 1) == Some(&b'-')
        && install_id
            .get(uuid_start..)
            .is_some_and(|uuid| Uuid::parse_str(uuid).is_ok())
}

fn ensure_install_id_available(install_id: &str) -> Result<(), String> {
    if read_mod_queue_history()?
        .iter()
        .any(|item| item.install_id == install_id)
        || read_mod_installs()?
            .iter()
            .any(|item| item.install_id == install_id)
    {
        return Err(format!(
            "Mod install ID '{install_id}' is already persisted; refusing to reuse it."
        ));
    }
    for path in [mod_staging_dir(install_id)?, mod_backup_dir(install_id)?] {
        if path.exists() {
            return Err(format!(
                "Mod install ID '{install_id}' already owns storage at {}.",
                path.display()
            ));
        }
    }
    Ok(())
}

fn normalize_id(value: &str, label: &str) -> Result<String, String> {
    let normalized = value.trim().to_string();
    if normalized.is_empty() {
        Err(format!("{label} must not be empty."))
    } else {
        Ok(normalized)
    }
}

fn status_rank(status: ModInstallStatus) -> u8 {
    match status {
        ModInstallStatus::Queued => 0,
        ModInstallStatus::Starting => 1,
        ModInstallStatus::Downloading => 2,
        ModInstallStatus::Installing => 3,
        ModInstallStatus::Delegated => 4,
        ModInstallStatus::Failed => 5,
        ModInstallStatus::Cancelled => 6,
        ModInstallStatus::Completed => 7,
    }
}

fn sanitize_file_name(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '-',
            character if character.is_control() => '-',
            character => character,
        })
        .collect::<String>()
        .trim_matches(['.', ' ', '-'])
        .to_string();
    if sanitized.is_empty() {
        "mod".to_string()
    } else {
        sanitized
    }
}

fn normalize_sha256(expected: &str) -> Result<String, String> {
    let expected = expected.trim().to_ascii_lowercase();
    if expected.len() != 64 || !expected.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Err("Configured SHA-256 checksum is invalid.".to_string());
    }
    Ok(expected)
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path)
        .map_err(|error| format!("Could not open file for SHA-256 verification: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("Could not read file for SHA-256 verification: {error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>())
}

fn remove_empty_parents(path: &Path, root: &Path) {
    let Some(mut parent) = path.parent().map(Path::to_path_buf) else {
        return;
    };
    while parent.starts_with(root) && parent != root {
        if fs::remove_dir(&parent).is_err() {
            break;
        }
        let Some(next) = parent.parent().map(Path::to_path_buf) else {
            break;
        };
        parent = next;
    }
}

fn now_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn next_mod_event_revision() -> u64 {
    static LAST_REVISION: AtomicU64 = AtomicU64::new(0);
    let wall_clock = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_micros().min(u128::from(u64::MAX)) as u64)
        .unwrap_or(0);
    let mut observed = LAST_REVISION.load(Ordering::Relaxed);
    loop {
        let next = wall_clock.max(observed.saturating_add(1));
        match LAST_REVISION.compare_exchange_weak(
            observed,
            next,
            Ordering::SeqCst,
            Ordering::Relaxed,
        ) {
            Ok(_) => return next,
            Err(actual) => observed = actual,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mod_event_revisions_are_strictly_monotonic() {
        let first = next_mod_event_revision();
        let second = next_mod_event_revision();

        assert!(second > first);
    }
    use sevenz_rust2::{ArchiveEntry, ArchiveWriter};
    use zip::{write::SimpleFileOptions, ZipWriter};

    #[test]
    fn mod_queue_persistence_errors_are_part_of_the_api() {
        let _read: fn() -> Result<Vec<ModInstallQueueItem>, String> = read_mod_queue_history;
        let _remember: fn(ModInstallQueueItem) -> Result<(), String> = remember_mod_queue_item;
        let _read_installs: fn() -> Result<Vec<InstalledModInfo>, String> = read_mod_installs;
    }

    #[test]
    fn only_current_providers_are_loaded_into_the_active_queue() {
        assert!(ModProvider::Nexus.is_active());
        assert!(ModProvider::SteamWorkshop.is_active());
        for provider in [
            ModProvider::Modio,
            ModProvider::Curseforge,
            ModProvider::DirectUrl,
            ModProvider::LocalArchive,
            ModProvider::LocalFolder,
        ] {
            assert!(!provider.is_active());
        }
    }

    #[test]
    fn startup_queue_hydration_marks_orphaned_work_as_interrupted() {
        let (active, _) = active_mod_install_fixture();

        for status in [
            ModInstallStatus::Queued,
            ModInstallStatus::Starting,
            ModInstallStatus::Downloading,
            ModInstallStatus::Installing,
        ] {
            let mut item = active.item.clone();
            item.status = status;
            item.progress = 100;
            item.can_cancel = true;

            let hydrated = normalize_mod_queue_item(item, false);

            assert_eq!(hydrated.status, ModInstallStatus::Failed);
            assert_eq!(hydrated.phase, "interrupted");
            assert_eq!(hydrated.speed, "Interrupted");
            assert_eq!(hydrated.progress, 99);
            assert!(!hydrated.can_cancel);
            assert!(hydrated
                .error
                .as_deref()
                .is_some_and(|error| error.contains("Start the install again")));
        }

        let active_item = normalize_mod_queue_item(active.item, true);
        assert_eq!(active_item.status, ModInstallStatus::Starting);
        assert!(active_item.can_cancel);
    }

    fn active_mod_install_fixture() -> (ActiveModInstall, watch::Receiver<bool>) {
        let (cancel_tx, cancel_rx) = watch::channel(false);
        (
            ActiveModInstall {
                item: ModInstallQueueItem {
                    id: "mod-race".to_string(),
                    install_id: "mod-race".to_string(),
                    game_id: "game-race".to_string(),
                    title: "Race Mod".to_string(),
                    provider: ModProvider::Nexus,
                    progress: 89,
                    speed: "Verifying".to_string(),
                    status: ModInstallStatus::Starting,
                    phase: "verifying".to_string(),
                    bytes_downloaded: None,
                    bytes_total: None,
                    can_pause: false,
                    can_cancel: true,
                    external: false,
                    target_path: None,
                    delegated_url: None,
                    error: None,
                    last_updated_at: 0,
                    event_revision: 0,
                },
                cancel_tx,
            },
            cancel_rx,
        )
    }

    fn test_directory(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "og-launcher-{label}-{}-{}",
            std::process::id(),
            Uuid::new_v4()
        ))
    }

    fn write_test_zip(path: &Path, entries: &[(&str, &[u8])]) {
        let file = fs::File::create(path).unwrap();
        let mut archive = ZipWriter::new(file);
        for (name, contents) in entries {
            archive
                .start_file(*name, SimpleFileOptions::default())
                .unwrap();
            archive.write_all(contents).unwrap();
        }
        archive.finish().unwrap();
    }

    fn write_test_7z(path: &Path, entries: &[(&str, &[u8])]) {
        let mut archive = ArchiveWriter::create(path).unwrap();
        for (name, contents) in entries {
            archive
                .push_archive_entry(ArchiveEntry::new_file(name), Some(*contents))
                .unwrap();
        }
        archive.finish().unwrap();
    }

    #[test]
    fn zip_extraction_rejects_archives_over_the_entry_limit() {
        let temp = test_directory("zip-entry-limit");
        let archive = temp.join("mod.zip");
        let target = temp.join("extracted");
        fs::create_dir_all(&target).unwrap();
        write_test_zip(&archive, &[("one.txt", b"one"), ("two.txt", b"two")]);

        let error = extract_zip_safely_with_limits(&archive, &target, 1, 100).unwrap_err();

        assert!(error.contains("entry limit"));
        fs::remove_dir_all(temp).unwrap();
    }

    #[test]
    fn zip_extraction_stops_before_exceeding_the_uncompressed_byte_limit() {
        let temp = test_directory("zip-byte-limit");
        let archive = temp.join("mod.zip");
        let target = temp.join("extracted");
        fs::create_dir_all(&target).unwrap();
        write_test_zip(&archive, &[("large.bin", b"0123456789")]);

        let error = extract_zip_safely_with_limits(&archive, &target, 10, 5).unwrap_err();

        assert!(error.contains("uncompressed size limit"));
        assert!(!target.join("large.bin").exists());
        fs::remove_dir_all(temp).unwrap();
    }

    #[test]
    fn zip_extraction_rejects_symlinks_and_case_colliding_paths() {
        let temp = test_directory("zip-link-duplicate");
        let target = temp.join("extracted");
        fs::create_dir_all(&target).unwrap();

        let symlink_archive = temp.join("symlink.zip");
        let file = fs::File::create(&symlink_archive).unwrap();
        let mut archive = ZipWriter::new(file);
        archive
            .add_symlink("escape-link", "../../outside", SimpleFileOptions::default())
            .unwrap();
        archive.finish().unwrap();
        assert!(extract_zip_safely(&symlink_archive, &target)
            .unwrap_err()
            .contains("symbolic link"));

        let duplicate_archive = temp.join("duplicate.zip");
        let file = fs::File::create(&duplicate_archive).unwrap();
        let mut archive = ZipWriter::new(file);
        archive
            .start_file("same.txt", SimpleFileOptions::default())
            .unwrap();
        archive.write_all(b"first").unwrap();
        archive
            .start_file("SAME.txt", SimpleFileOptions::default())
            .unwrap();
        archive.write_all(b"second").unwrap();
        archive.finish().unwrap();
        assert!(extract_zip_safely(&duplicate_archive, &target)
            .unwrap_err()
            .contains("duplicate"));
        fs::remove_dir_all(temp).unwrap();
    }

    #[test]
    fn zip_extraction_rejects_parent_traversal_without_writing_outside_target() {
        let temp = test_directory("zip-traversal");
        let archive = temp.join("traversal.zip");
        let target = temp.join("extracted");
        fs::create_dir_all(&target).unwrap();
        write_test_zip(&archive, &[("../escaped.txt", b"escaped")]);

        assert!(extract_zip_safely(&archive, &target)
            .unwrap_err()
            .contains("outside the install folder"));
        assert!(!temp.join("escaped.txt").exists());
        fs::remove_dir_all(temp).unwrap();
    }

    #[test]
    fn seven_zip_extraction_is_real_and_enforces_traversal_and_size_limits() {
        let temp = test_directory("seven-zip-security");
        fs::create_dir_all(&temp).unwrap();

        let valid = temp.join("valid.7z");
        let valid_target = temp.join("valid-out");
        write_test_7z(&valid, &[("mods/plugin.dll", b"plugin")]);
        extract_7z_safely(&valid, &valid_target).unwrap();
        assert_eq!(
            fs::read(valid_target.join("mods/plugin.dll")).unwrap(),
            b"plugin"
        );

        let traversal = temp.join("traversal.7z");
        let traversal_target = temp.join("traversal-out");
        write_test_7z(&traversal, &[("../escaped.txt", b"escaped")]);
        assert!(extract_7z_safely(&traversal, &traversal_target).is_err());
        assert!(!temp.join("escaped.txt").exists());

        let link_archive = temp.join("link.7z");
        let link_target = temp.join("link-out");
        let mut writer = ArchiveWriter::create(&link_archive).unwrap();
        let mut link = ArchiveEntry::new_file("unsafe-link");
        link.has_windows_attributes = true;
        link.windows_attributes = 0o120000 << 16;
        writer
            .push_archive_entry(link, Some(b"target" as &[u8]))
            .unwrap();
        writer.finish().unwrap();
        assert!(extract_7z_safely(&link_archive, &link_target)
            .unwrap_err()
            .contains("link or anti-item"));
        assert!(!link_target.join("unsafe-link").exists());

        let oversized = temp.join("oversized.7z");
        let oversized_target = temp.join("oversized-out");
        write_test_7z(&oversized, &[("large.bin", b"0123456789abcdef")]);
        assert!(
            extract_7z_safely_with_limits(&oversized, &oversized_target, 10, 8)
                .unwrap_err()
                .contains("size limit")
        );
        assert!(!oversized_target.join("large.bin").exists());

        fs::remove_dir_all(temp).unwrap();
    }

    #[test]
    fn unsupported_nexus_archive_layouts_handoff_without_touching_the_game() {
        type ArchiveEntryFixture<'a> = (&'a str, &'a [u8]);
        type HandoffFixture<'a> = (&'a str, &'a [ArchiveEntryFixture<'a>], &'a str);

        let temp = test_directory("nexus-handoff-layouts");
        let game = temp.join("game");
        fs::create_dir_all(&game).unwrap();
        fs::write(game.join("game.exe"), b"original game").unwrap();

        let cases: [HandoffFixture<'_>; 3] = [
            (
                "fomod.zip",
                &[
                    ("MyMod/fomod/ModuleConfig.xml", b"<config />"),
                    ("MyMod/readme.txt", b"readme"),
                ],
                "FOMOD",
            ),
            (
                "installer.zip",
                &[("MyMod/setup.exe", b"not executable")],
                "executable installer",
            ),
            (
                "ambiguous.zip",
                &[("Data/a.esm", b"data"), ("Mods/b.dll", b"mods")],
                "multiple game mod locations",
            ),
        ];

        for (file_name, entries, expected_message) in cases {
            let archive = temp.join(file_name);
            write_test_zip(&archive, entries);
            let install_id = build_install_id(ModProvider::Nexus);
            let result =
                prepare_trusted_nexus_archive(&install_id, &archive, file_name, &game, None)
                    .unwrap();
            match result {
                TrustedNexusPreparation::Handoff(message) => {
                    assert!(message.contains(expected_message), "{message}");
                }
                TrustedNexusPreparation::Ready { .. } => {
                    panic!("unsupported archive unexpectedly became installable")
                }
            }
            cleanup_mod_staging_path(&mod_staging_dir(&install_id).unwrap()).unwrap();
            assert_eq!(fs::read(game.join("game.exe")).unwrap(), b"original game");
            assert_eq!(fs::read_dir(&game).unwrap().count(), 1);
        }

        fs::remove_dir_all(temp).unwrap();
    }

    #[test]
    fn nexus_provider_trust_requires_approved_cdn_archive_mime_and_size() {
        use reqwest::header::HeaderValue;

        for allowed in [
            "https://cf-files.nexusmods.com/mod.zip?token=short-lived",
            "https://mirror.nexus-cdn.com/mod.7z",
            "https://nexus-files.b-cdn.net/mod.zip",
        ] {
            assert!(validate_nexus_download_host(&Url::parse(allowed).unwrap()).is_ok());
        }
        for rejected in [
            "https://nexusmods.com.evil.example/mod.zip",
            "https://evil.example/mod.zip",
            "http://cf-files.nexusmods.com/mod.zip",
        ] {
            assert!(validate_nexus_download_host(&Url::parse(rejected).unwrap()).is_err());
        }
        assert!(validate_supported_nexus_archive_name("safe.zip").is_ok());
        assert!(validate_supported_nexus_archive_name("safe.7Z").is_ok());
        assert!(validate_supported_nexus_archive_name("installer.exe").is_err());
        assert!(validate_supported_nexus_archive_name("archive.rar").is_err());
        assert!(validate_supported_nexus_archive_name("../mod.zip").is_err());
        assert!(validate_nexus_content_type(
            Some(&HeaderValue::from_static("application/zip")),
            NexusArchiveKind::Zip,
        )
        .is_ok());
        assert!(validate_nexus_content_type(
            Some(&HeaderValue::from_static("text/html")),
            NexusArchiveKind::Zip,
        )
        .is_err());
        assert!(validate_nexus_expected_size(
            4096,
            TrustedNexusExpectedSize {
                bytes: 4096,
                exact: true,
            },
        )
        .is_ok());
        assert!(validate_nexus_expected_size(
            4097,
            TrustedNexusExpectedSize {
                bytes: 4096,
                exact: true,
            },
        )
        .is_err());
    }

    #[test]
    fn nexus_target_inference_uses_layout_then_game_internal_mods_fallback() {
        let temp = test_directory("nexus-target-inference");
        let root = temp.join("game");
        fs::create_dir_all(root.join("Data")).unwrap();
        fs::create_dir_all(root.join("BepInEx").join("plugins")).unwrap();
        assert_eq!(
            infer_existing_game_target(&root, &["meshes/armor.nif".to_string()])
                .unwrap()
                .unwrap(),
            root.join("Data")
        );
        assert_eq!(
            infer_existing_game_target(&root, &["plugin.dll".to_string()])
                .unwrap()
                .unwrap(),
            root.join("BepInEx").join("plugins")
        );
        assert_eq!(
            infer_existing_game_target(&root, &["readme.txt".to_string()])
                .unwrap()
                .unwrap(),
            root.join("mods")
        );
        let empty_root = temp.join("empty-game");
        fs::create_dir_all(&empty_root).unwrap();
        assert_eq!(
            infer_existing_game_target(&empty_root, &["plugin.pak".to_string()])
                .unwrap()
                .unwrap(),
            empty_root.join("mods")
        );
        fs::remove_dir_all(temp).unwrap();
    }

    #[test]
    fn mod_staging_cleanup_removes_files_recursively_and_is_idempotent() {
        let temp = test_directory("staging-cleanup");
        fs::create_dir_all(temp.join("nested")).unwrap();
        fs::write(temp.join("nested/package.zip"), b"archive").unwrap();

        cleanup_mod_staging_path(&temp).unwrap();
        cleanup_mod_staging_path(&temp).unwrap();

        assert!(!temp.exists());
    }

    fn owned_install_fixture(
        install_id: String,
        target: &Path,
        records: Vec<ModInstalledFileRecord>,
        enabled: bool,
    ) -> InstalledModInfo {
        InstalledModInfo {
            id: install_id.clone(),
            install_id,
            game_id: "game-owned-files".to_string(),
            title: "Owned Files Mod".to_string(),
            provider: ModProvider::LocalArchive,
            enabled,
            target_path: path_to_string(target.to_path_buf()),
            installed_files: records
                .iter()
                .map(|record| record.relative_path.clone())
                .collect(),
            profile_id: None,
            catalog_item_id: None,
            version_id: None,
            provider_file_id: None,
            source_url: None,
            installed_at: 0,
            manifest_version: MOD_MANIFEST_VERSION,
            file_records: records,
        }
    }

    #[test]
    fn cancellation_immediately_before_mod_commit_prevents_installing_transition() {
        let manager: ModInstallMap = Arc::new(Mutex::new(HashMap::new()));
        let (install, cancel_rx) = active_mod_install_fixture();
        manager
            .lock()
            .unwrap()
            .insert("mod-race".to_string(), install);

        let cancellation = request_mod_install_cancellation_in_map(&manager, "mod-race").unwrap();
        let ModInstallCancellationTransition::Cancelled(item) = cancellation else {
            panic!("cancellation should win before the commit boundary");
        };

        assert_eq!(item.status, ModInstallStatus::Cancelled);
        assert!(!item.can_cancel);
        assert!(
            begin_mod_install_commit_in_map(&manager, "mod-race", |_| {})
                .unwrap()
                .is_none()
        );
        assert!(*cancel_rx.borrow());
        assert!(!manager.lock().unwrap().contains_key("mod-race"));
    }

    #[test]
    fn cancellation_immediately_after_mod_commit_is_rejected() {
        let manager: ModInstallMap = Arc::new(Mutex::new(HashMap::new()));
        let (install, cancel_rx) = active_mod_install_fixture();
        manager
            .lock()
            .unwrap()
            .insert("mod-race".to_string(), install);

        let committing = begin_mod_install_commit_in_map(&manager, "mod-race", |item| {
            item.phase = "installing".to_string();
            item.speed = "Installing".to_string();
            item.progress = 90;
        })
        .unwrap()
        .expect("commit transition should start");
        assert_eq!(committing.status, ModInstallStatus::Installing);
        assert!(!committing.can_cancel);

        let cancellation = request_mod_install_cancellation_in_map(&manager, "mod-race").unwrap();
        let ModInstallCancellationTransition::Rejected { status } = cancellation else {
            panic!("cancellation must be rejected after the commit boundary");
        };
        assert_eq!(status, ModInstallStatus::Installing);
        assert!(!*cancel_rx.borrow());

        let guard = manager.lock().unwrap();
        let install = guard.get("mod-race").unwrap();
        assert_eq!(install.item.status, ModInstallStatus::Installing);
        assert!(!install.item.can_cancel);
    }

    #[test]
    fn install_ids_are_uuid_backed_and_collision_resistant() {
        let first = build_install_id(ModProvider::DirectUrl);
        let second = build_install_id(ModProvider::DirectUrl);

        assert_ne!(first, second);
        assert!(has_uuid_install_id(&first));
        assert!(has_uuid_install_id(&second));
    }

    #[test]
    fn occupied_install_id_is_rejected_without_replacing_manager_entry() {
        let manager: ModInstallMap = Arc::new(Mutex::new(HashMap::new()));
        let (first, _) = active_mod_install_fixture();
        reserve_mod_install_in_map(&manager, "occupied-id", first).unwrap();

        let (mut replacement, _) = active_mod_install_fixture();
        replacement.item.title = "Replacement".to_string();
        let error = reserve_mod_install_in_map(&manager, "occupied-id", replacement).unwrap_err();

        assert!(error.contains("already occupied"));
        let guard = manager.lock().unwrap();
        assert_eq!(guard.get("occupied-id").unwrap().item.title, "Race Mod");
        assert_eq!(guard.len(), 1);
    }

    #[test]
    fn remote_url_policy_rejects_unsafe_schemes_credentials_fragments_and_ips() {
        assert!(parse_and_validate_remote_url("https://93.184.216.34/mod.zip").is_ok());
        assert!(parse_and_validate_remote_url("https://[2606:4700:4700::1111]/mod.zip").is_ok());

        for unsafe_url in [
            "http://example.com/mod.zip",
            "https://user:secret@example.com/mod.zip",
            "https://example.com/mod.zip#payload",
            "https://127.0.0.1/mod.zip",
            "https://2130706433/mod.zip",
            "https://10.0.0.1/mod.zip",
            "https://169.254.169.254/latest/meta-data",
            "https://192.0.2.1/mod.zip",
            "https://[::1]/mod.zip",
            "https://[fc00::1]/mod.zip",
            "https://[fe80::1]/mod.zip",
            "https://[2001:db8::1]/mod.zip",
        ] {
            assert!(
                parse_and_validate_remote_url(unsafe_url).is_err(),
                "{unsafe_url} should be rejected"
            );
        }
    }

    #[test]
    fn dns_resolution_policy_rejects_any_non_public_result() {
        let public = SocketAddr::from(([93, 184, 216, 34], 443));
        let private = SocketAddr::from(([192, 168, 1, 10], 443));

        assert!(validate_resolved_addresses(&[public]).is_ok());
        assert!(validate_resolved_addresses(&[public, private]).is_err());
        assert!(validate_resolved_addresses(&[]).is_err());
    }

    #[test]
    fn redirect_policy_revalidates_targets_and_enforces_hop_limit() {
        let base = Url::parse("https://example.com/releases/mod.zip").unwrap();
        let relative = validated_redirect_url(&base, "../cdn/mod.zip", 0, 5).unwrap();
        assert_eq!(relative.as_str(), "https://example.com/cdn/mod.zip");

        assert!(validated_redirect_url(&base, "http://example.com/mod.zip", 0, 5).is_err());
        assert!(validated_redirect_url(&base, "https://127.0.0.1/mod.zip", 0, 5).is_err());
        assert!(validated_redirect_url(&base, "https://user@example.com/mod.zip", 0, 5).is_err());
        assert!(validated_redirect_url(&base, "https://example.com/mod.zip#part", 0, 5).is_err());
        assert!(validated_redirect_url(&base, "/next.zip", 5, 5).is_err());
    }

    #[test]
    fn remote_body_size_is_capped_for_headers_and_streamed_chunks() {
        assert!(validate_declared_download_size(Some(100), 100).is_ok());
        assert!(validate_declared_download_size(Some(101), 100).is_err());
        assert_eq!(checked_download_size(90, 10, 100).unwrap(), 100);
        assert!(checked_download_size(90, 11, 100).is_err());
        assert!(checked_download_size(u64::MAX, 1, u64::MAX).is_err());
    }

    #[test]
    fn uninstall_restores_overwritten_files_and_only_deletes_owned_new_files() {
        let temp = test_directory("owned-uninstall");
        let target = temp.join("game").join("mods");
        let extracted = temp.join("extracted");
        let backup_root = temp.join("backups");
        fs::create_dir_all(target.join("config")).unwrap();
        fs::create_dir_all(extracted.join("config")).unwrap();
        fs::create_dir_all(extracted.join("bin")).unwrap();
        fs::write(target.join("config/settings.ini"), b"original settings").unwrap();
        fs::write(extracted.join("config/settings.ini"), b"modded settings").unwrap();
        fs::write(extracted.join("bin/new-mod.dll"), b"new mod file").unwrap();

        let install_id = build_install_id(ModProvider::LocalArchive);
        let files = vec![
            "bin/new-mod.dll".to_string(),
            "config/settings.ini".to_string(),
        ];
        let records = apply_staged_files_with_backup_root(
            &install_id,
            &extracted,
            &target,
            &files,
            &backup_root,
        )
        .unwrap();
        let install = owned_install_fixture(install_id, &target, records, true);
        write_manifest_from_info(&install).unwrap();
        let manifest_path = checked_manifest_file_path(&target, &install.install_id).unwrap();
        let persisted: ModInstallManifest =
            serde_json::from_str(&fs::read_to_string(&manifest_path).unwrap()).unwrap();
        assert_eq!(persisted.manifest_version, MOD_MANIFEST_VERSION);
        assert!(persisted
            .file_records
            .iter()
            .any(|record| record.backup.is_some()));

        assert_eq!(
            fs::read(target.join("config/settings.ini")).unwrap(),
            b"modded settings"
        );
        assert!(target.join("bin/new-mod.dll").is_file());

        remove_mod_install_artifacts_from_roots(&install, &target, &backup_root).unwrap();

        assert_eq!(
            fs::read(target.join("config/settings.ini")).unwrap(),
            b"original settings"
        );
        assert!(!target.join("bin/new-mod.dll").exists());
        assert!(!backup_root.exists());
        fs::remove_dir_all(temp).unwrap();
    }

    #[test]
    fn disable_restores_original_and_enable_reapplies_owned_mod_file() {
        let temp = test_directory("owned-toggle");
        let target = temp.join("game").join("mods");
        let extracted = temp.join("extracted");
        let backup_root = temp.join("backups");
        fs::create_dir_all(&target).unwrap();
        fs::create_dir_all(&extracted).unwrap();
        fs::write(target.join("settings.ini"), b"original").unwrap();
        fs::write(extracted.join("settings.ini"), b"modded").unwrap();

        let install_id = build_install_id(ModProvider::LocalArchive);
        let records = apply_staged_files_with_backup_root(
            &install_id,
            &extracted,
            &target,
            &["settings.ini".to_string()],
            &backup_root,
        )
        .unwrap();
        let mut install = owned_install_fixture(install_id, &target, records, true);

        set_mod_files_enabled_at_roots(&install, false, &target, &backup_root).unwrap();
        assert_eq!(fs::read(target.join("settings.ini")).unwrap(), b"original");

        install.enabled = false;
        set_mod_files_enabled_at_roots(&install, true, &target, &backup_root).unwrap();
        assert_eq!(fs::read(target.join("settings.ini")).unwrap(), b"modded");

        install.enabled = true;
        remove_mod_install_artifacts_from_roots(&install, &target, &backup_root).unwrap();
        assert_eq!(fs::read(target.join("settings.ini")).unwrap(), b"original");
        fs::remove_dir_all(temp).unwrap();
    }

    #[test]
    fn legacy_manifest_uninstall_fails_closed_without_deleting_files() {
        let temp = test_directory("legacy-uninstall");
        let target = temp.join("game").join("mods");
        let backup_root = temp.join("backups");
        fs::create_dir_all(&target).unwrap();
        let existing = target.join("settings.ini");
        fs::write(&existing, b"unknown ownership").unwrap();

        let install = InstalledModInfo {
            id: "legacy-install".to_string(),
            install_id: "legacy-install".to_string(),
            game_id: "game-legacy".to_string(),
            title: "Legacy Mod".to_string(),
            provider: ModProvider::LocalArchive,
            enabled: true,
            target_path: path_to_string(target.clone()),
            installed_files: vec!["settings.ini".to_string()],
            profile_id: None,
            catalog_item_id: None,
            version_id: None,
            provider_file_id: None,
            source_url: None,
            installed_at: 0,
            manifest_version: 0,
            file_records: Vec::new(),
        };

        let error =
            remove_mod_install_artifacts_from_roots(&install, &target, &backup_root).unwrap_err();
        assert!(error.contains("legacy ownership metadata"));
        assert_eq!(fs::read(&existing).unwrap(), b"unknown ownership");
        fs::remove_dir_all(temp).unwrap();
    }

    #[test]
    fn security_local_folder_uninstall_keeps_user_owned_source_files() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let source_folder = std::env::temp_dir().join(format!(
            "og-launcher-local-folder-uninstall-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&source_folder).unwrap();
        let source_file = source_folder.join("user-owned-mod.dll");
        fs::write(&source_file, b"original user content").unwrap();

        let install = InstalledModInfo {
            id: "legacy-local-folder".to_string(),
            install_id: "legacy-local-folder".to_string(),
            game_id: "game-1".to_string(),
            title: "External Local Mod".to_string(),
            provider: ModProvider::LocalFolder,
            enabled: true,
            target_path: path_to_string(source_folder.clone()),
            installed_files: vec!["user-owned-mod.dll".to_string()],
            profile_id: None,
            catalog_item_id: None,
            version_id: None,
            provider_file_id: None,
            source_url: None,
            installed_at: 0,
            manifest_version: 0,
            file_records: Vec::new(),
        };

        remove_mod_install_artifacts(&install).unwrap();

        assert_eq!(fs::read(&source_file).unwrap(), b"original user content");
        fs::remove_dir_all(source_folder).unwrap();
    }

    #[test]
    fn safe_join_rejects_parent_paths() {
        let root = PathBuf::from("C:/Games/Example/mods");
        assert!(safe_join(&root, "textures/a.dds").is_ok());
        assert!(safe_join(&root, "../outside.dll").is_err());
        assert!(safe_join(&root, "/absolute.dll").is_err());
    }

    #[test]
    fn safe_join_rejects_existing_symlink_ancestor_escape() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let temp = std::env::temp_dir().join(format!(
            "og-launcher-mod-path-security-{}-{unique}",
            std::process::id()
        ));
        let root = temp.join("target");
        let outside = temp.join("outside");
        let link = root.join("linked");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&outside).unwrap();

        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside, &link).unwrap();

        #[cfg(windows)]
        if std::os::windows::fs::symlink_dir(&outside, &link).is_err() {
            fs::remove_dir_all(&temp).unwrap();
            return;
        }

        assert!(safe_join(&root, "linked/payload.dll").is_err());
        assert!(safe_join(&root, "new/deep/payload.dll").is_ok());

        fs::remove_dir_all(temp).unwrap();
    }

    #[test]
    fn restricted_targets_detect_windows_apps() {
        assert!(is_restricted_target(Path::new(
            "C:/Program Files/WindowsApps/Game"
        )));
        assert!(is_restricted_target(Path::new("D:/XboxGames/MSIXVC/Game")));
        assert!(!is_restricted_target(Path::new(
            "D:/SteamLibrary/common/Game"
        )));
    }

    #[test]
    fn trusted_nexus_conflicts_with_existing_managed_file_ownership() {
        let temp = test_directory("managed-conflict");
        let target = temp.join("game").join("Mods");
        fs::create_dir_all(&target).unwrap();
        let install_id = build_install_id(ModProvider::Nexus);
        let install = owned_install_fixture(
            install_id.clone(),
            &target,
            vec![ModInstalledFileRecord {
                relative_path: "plugins/shared.dll".to_string(),
                owner_install_id: install_id,
                installed_sha256: "a".repeat(64),
                installed_size: 1,
                backup: None,
            }],
            true,
        );
        write_manifest_from_info(&install).unwrap();

        assert!(has_managed_mod_conflict(
            &target,
            &["Plugins/SHARED.dll".to_string()],
            None,
        ));
        assert!(!has_managed_mod_conflict(
            &target,
            &["plugins/unique.dll".to_string()],
            None,
        ));
        assert!(!has_managed_mod_conflict(
            &target,
            &["Plugins/SHARED.dll".to_string()],
            Some(&install.install_id),
        ));

        fs::remove_dir_all(temp).unwrap();
    }

    #[test]
    fn nexus_update_rollback_restores_previous_owned_version() {
        let temp = test_directory("nexus-update-rollback");
        let target = temp.join("game/Mods");
        let old_backup_root = temp.join("old-backup");
        let snapshot_root = temp.join("snapshot");
        let new_backup_root = temp.join("new-backup");
        let extracted = temp.join("new-version");
        fs::create_dir_all(target.join("plugins")).unwrap();
        fs::create_dir_all(old_backup_root.join("plugins")).unwrap();
        fs::create_dir_all(extracted.join("plugins")).unwrap();
        fs::write(target.join("plugins/mod.dll"), b"version-one").unwrap();
        fs::write(old_backup_root.join("plugins/mod.dll"), b"original-game").unwrap();
        fs::write(extracted.join("plugins/mod.dll"), b"version-two").unwrap();

        let install_id = build_install_id(ModProvider::Nexus);
        let mut install = owned_install_fixture(
            install_id.clone(),
            &target,
            vec![ModInstalledFileRecord {
                relative_path: "plugins/mod.dll".to_string(),
                owner_install_id: install_id.clone(),
                installed_sha256: sha256_file(&target.join("plugins/mod.dll")).unwrap(),
                installed_size: b"version-one".len() as u64,
                backup: Some(ModBackupRecord {
                    owner_install_id: install_id,
                    backup_relative_path: "plugins/mod.dll".to_string(),
                    original_sha256: sha256_file(&old_backup_root.join("plugins/mod.dll")).unwrap(),
                    original_size: b"original-game".len() as u64,
                }),
            }],
            true,
        );
        install.provider = ModProvider::Nexus;
        install.catalog_item_id = Some("42".to_string());
        install.version_id = Some("1.0".to_string());
        install.provider_file_id = Some("100".to_string());
        write_manifest_from_info(&install).unwrap();

        validate_managed_mod_install_at_roots(&install, &target, &old_backup_root).unwrap();
        snapshot_managed_install_at_roots(&install, &target, &old_backup_root, &snapshot_root)
            .unwrap();
        remove_mod_install_artifacts_from_roots(&install, &target, &old_backup_root).unwrap();
        assert_eq!(
            fs::read(target.join("plugins/mod.dll")).unwrap(),
            b"original-game"
        );

        let new_records = apply_staged_files_with_backup_root(
            "mod-nexus-00000000-0000-4000-8000-000000000001",
            &extracted,
            &target,
            &["plugins/mod.dll".to_string()],
            &new_backup_root,
        )
        .unwrap();
        assert_eq!(
            fs::read(target.join("plugins/mod.dll")).unwrap(),
            b"version-two"
        );
        rollback_applied_file_records(&new_records, &target, &new_backup_root).unwrap();
        restore_managed_install_files_from_snapshot(
            &install,
            &target,
            &old_backup_root,
            &snapshot_root,
        )
        .unwrap();

        assert_eq!(
            fs::read(target.join("plugins/mod.dll")).unwrap(),
            b"version-one"
        );
        assert_eq!(
            fs::read(old_backup_root.join("plugins/mod.dll")).unwrap(),
            b"original-game"
        );
        validate_managed_mod_install_at_roots(&install, &target, &old_backup_root).unwrap();
        fs::remove_dir_all(temp).unwrap();
    }

    #[test]
    fn replacement_transaction_restores_old_version_even_if_new_cleanup_fails() {
        let events = std::cell::RefCell::new(Vec::new());
        let result: Result<&'static str, String> = run_managed_replacement_transaction(
            || {
                events.borrow_mut().push("remove-old");
                Ok(())
            },
            || {
                events.borrow_mut().push("delete-old-record");
                Ok(())
            },
            || {
                events.borrow_mut().push("apply-new");
                Ok("new-version")
            },
            |_| {
                events.borrow_mut().push("persist-new");
                Err("database write failed".to_string())
            },
            |_| {
                events.borrow_mut().push("remove-new");
                Err("new cleanup failed".to_string())
            },
            || {
                events.borrow_mut().push("restore-old");
                Ok(())
            },
        );

        let error = result.unwrap_err();
        assert!(error.contains("database write failed"));
        assert!(error.contains("new cleanup failed"));
        assert!(error.contains("previous mod version was restored"));
        assert_eq!(
            events.into_inner(),
            vec![
                "remove-old",
                "delete-old-record",
                "apply-new",
                "persist-new",
                "remove-new",
                "restore-old",
            ]
        );
    }
}
