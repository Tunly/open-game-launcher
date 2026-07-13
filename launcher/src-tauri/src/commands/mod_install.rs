use futures_util::StreamExt;
use reqwest::{
    header::{HeaderMap, LOCATION},
    redirect, StatusCode, Url,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::{hash_map::Entry, HashMap, HashSet},
    fs::{self, OpenOptions},
    io::{Read, Write},
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::Emitter;
use tokio::sync::watch;
use uuid::Uuid;

use crate::commands::{
    games::{
        open_game_launcher_data_dir, open_uri, path_to_string, read_installed_games_cache_result,
    },
    local_db, secure_store,
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

#[derive(Debug, Serialize, Deserialize, Clone, Copy, Eq, PartialEq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ModProvider {
    SteamWorkshop,
    Modio,
    Curseforge,
    DirectUrl,
    LocalArchive,
    LocalFolder,
}

impl ModProvider {
    fn as_str(self) -> &'static str {
        match self {
            Self::SteamWorkshop => "steam_workshop",
            Self::Modio => "modio",
            Self::Curseforge => "curseforge",
            Self::DirectUrl => "direct_url",
            Self::LocalArchive => "local_archive",
            Self::LocalFolder => "local_folder",
        }
    }

    fn display_name(self) -> &'static str {
        match self {
            Self::SteamWorkshop => "Steam Workshop",
            Self::Modio => "mod.io",
            Self::Curseforge => "CurseForge",
            Self::DirectUrl => "Direct URL",
            Self::LocalArchive => "Local Archive",
            Self::LocalFolder => "Local Folder",
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

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModInstallRequest {
    pub game_id: String,
    pub provider: ModProvider,
    pub catalog_item_id: Option<String>,
    pub version_id: Option<String>,
    pub source_url: Option<String>,
    pub local_path: Option<String>,
    pub target_policy_id: Option<String>,
    pub profile_id: Option<String>,
    pub title: Option<String>,
    pub sha256: Option<String>,
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

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NativeModSearchRequest {
    pub provider: ModProvider,
    pub provider_game_id: String,
    pub query: String,
    pub page: Option<u32>,
    pub page_size: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NativeModSearchResult {
    pub provider: ModProvider,
    pub external_id: String,
    pub name: String,
    pub author: Option<String>,
    pub summary: Option<String>,
    pub url: String,
    pub icon_url: Option<String>,
    pub downloads: Option<String>,
    pub follows: Option<String>,
    pub latest_version: Option<String>,
    pub download_url: Option<String>,
    pub provider_app_url: Option<String>,
    pub file_size_bytes: Option<u64>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModProviderStagingProbeRequest {
    pub provider: ModProvider,
    pub provider_game_id: String,
    pub query: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ModProviderStagingProbeStatus {
    Blocked,
    Ready,
    ProviderError,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModProviderStagingProbeResult {
    pub provider: ModProvider,
    pub provider_game_id: String,
    pub query_hint: String,
    pub page_size: u32,
    pub status: ModProviderStagingProbeStatus,
    pub live_request_attempted: bool,
    pub result_count: usize,
    pub direct_download_count: usize,
    pub provider_app_handoff_count: usize,
    pub duration_ms: u64,
    pub redacted_request: String,
    pub message: String,
    pub guards: Vec<String>,
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
        queue_by_id.insert(item.install_id.clone(), item);
    }

    let mut queue = queue_by_id.into_values().collect::<Vec<_>>();
    queue.sort_by(|left, right| {
        status_rank(left.status)
            .cmp(&status_rank(right.status))
            .then_with(|| right.last_updated_at.cmp(&left.last_updated_at))
    });
    Ok(queue)
}

#[tauri::command]
pub async fn start_mod_install(
    app: tauri::AppHandle,
    input: ModInstallRequest,
) -> Result<ModInstallResult, String> {
    let game_id = normalize_id(&input.game_id, "gameId")?;
    let game = read_installed_games_cache_result()?
        .into_iter()
        .find(|game| game.id == game_id)
        .ok_or_else(|| format!("Game '{game_id}' was not found in the local library cache."))?;
    let title = input
        .title
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| title_from_source(&input))
        .unwrap_or_else(|| format!("{} Mod", game.title));
    let delegated_url = delegated_url_for_provider(&input);
    let is_delegated = delegated_url.is_some() && should_delegate_provider(&input);
    validate_install_source(&input, is_delegated)?;

    if is_delegated && input.provider != ModProvider::SteamWorkshop {
        let url = delegated_url
            .as_deref()
            .ok_or_else(|| "The delegated provider URL is missing.".to_string())?;
        let parsed = parse_and_validate_remote_url(url)?;
        resolve_public_remote_addresses(&parsed).await?;
    }

    let target = match input.provider {
        ModProvider::LocalFolder => {
            if input
                .target_policy_id
                .as_deref()
                .is_some_and(|value| !value.trim().is_empty())
            {
                return Err(
                    "External local folders are metadata-only and do not accept a target policy."
                        .to_string(),
                );
            }
            Some(local_path(&input)?)
        }
        _ if is_delegated => {
            if input
                .target_policy_id
                .as_deref()
                .is_some_and(|value| !value.trim().is_empty())
            {
                Some(resolve_target_path(
                    &game,
                    input.provider,
                    input.target_policy_id.as_deref(),
                )?)
            } else {
                None
            }
        }
        _ => Some(resolve_target_path(
            &game,
            input.provider,
            input.target_policy_id.as_deref(),
        )?),
    };
    let target_path = target.clone().map(path_to_string);
    let install_id = build_install_id(input.provider);
    ensure_install_id_available(&install_id)?;
    let (cancel_tx, cancel_rx) = watch::channel(false);

    let item = ModInstallQueueItem {
        id: install_id.clone(),
        install_id: install_id.clone(),
        game_id: game_id.clone(),
        title: title.clone(),
        provider: input.provider,
        progress: 0,
        speed: if is_delegated {
            "Opening official provider".to_string()
        } else {
            "Queued".to_string()
        },
        status: if is_delegated {
            ModInstallStatus::Delegated
        } else {
            ModInstallStatus::Queued
        },
        phase: if is_delegated {
            "delegated".to_string()
        } else {
            "queued".to_string()
        },
        bytes_downloaded: None,
        bytes_total: None,
        can_pause: false,
        can_cancel: !is_delegated,
        external: is_delegated,
        target_path: target_path.clone(),
        delegated_url: delegated_url.clone(),
        error: None,
        last_updated_at: now_unix_secs(),
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

    if let Some(url) = delegated_url.clone().filter(|_| is_delegated) {
        let _ = open_uri(&url);
        finish_delegated_install(&app, &install_id, &url)?;
        return Ok(ModInstallResult {
            install_id,
            game_id,
            status: ModInstallStatus::Delegated,
            provider: input.provider,
            target_path,
            installed_files: Vec::new(),
            delegated_url: Some(url),
            message: "Opened the official provider. Use scan after the external install finishes."
                .to_string(),
        });
    }

    let app_clone = app.clone();
    let install_id_clone = install_id.clone();
    let input_clone = input.clone();
    let game_clone = game.clone();
    tokio::spawn(async move {
        run_mod_install_worker(
            app_clone,
            install_id_clone,
            input_clone,
            game_clone,
            title,
            cancel_rx,
        )
        .await;
    });

    Ok(ModInstallResult {
        install_id,
        game_id,
        status: ModInstallStatus::Queued,
        provider: input.provider,
        target_path,
        installed_files: Vec::new(),
        delegated_url: None,
        message: "Mod install queued.".to_string(),
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

#[tauri::command]
pub fn scan_game_mods(game_id: String) -> Result<Vec<InstalledModInfo>, String> {
    let game_id = normalize_id(&game_id, "gameId")?;
    let mut installs = read_mod_installs()?
        .into_iter()
        .filter(|item| item.game_id == game_id)
        .collect::<Vec<_>>();

    if installs.is_empty() {
        if let Some(game) = read_installed_games_cache_result()?
            .into_iter()
            .find(|game| game.id == game_id)
        {
            for target in candidate_mod_targets(&game) {
                installs.extend(
                    read_manifests_from_target(&target)
                        .into_iter()
                        .filter(|install| install.game_id == game_id),
                );
            }
        }
    }

    installs.sort_by(|left, right| left.title.cmp(&right.title));
    Ok(installs)
}

#[tauri::command]
pub fn enable_mod(install_id: String) -> Result<InstalledModInfo, String> {
    set_mod_enabled(&install_id, true)
}

#[tauri::command]
pub fn disable_mod(install_id: String) -> Result<InstalledModInfo, String> {
    set_mod_enabled(&install_id, false)
}

#[tauri::command]
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

#[tauri::command]
pub fn set_mod_provider_secret(provider: ModProvider, secret: String) -> Result<(), String> {
    let domain = provider_secret_domain(provider);
    let trimmed = secret.trim();
    if trimmed.is_empty() {
        secure_store::delete_secret(&domain)
    } else {
        secure_store::set_secret(&domain, trimmed)
    }
}

#[tauri::command]
pub async fn search_native_mods(
    input: NativeModSearchRequest,
) -> Result<Vec<NativeModSearchResult>, String> {
    let provider_game_id = normalize_id(&input.provider_game_id, "providerGameId")?;
    let query = normalize_id(&input.query, "query")?;
    let page = input.page.unwrap_or(1).clamp(1, 100);
    let page_size = input.page_size.unwrap_or(12).clamp(1, 50);
    match input.provider {
        ModProvider::Modio => search_modio_mods(&provider_game_id, &query, page, page_size).await,
        ModProvider::Curseforge => {
            search_curseforge_mods(&provider_game_id, &query, page, page_size).await
        }
        other => Err(format!(
            "{} does not expose native API search in OG-Launcher yet.",
            other.display_name()
        )),
    }
}

#[tauri::command]
pub async fn run_mod_provider_staging_probe(
    input: ModProviderStagingProbeRequest,
) -> Result<ModProviderStagingProbeResult, String> {
    let request = build_mod_provider_staging_probe_request(&input)?;
    if !provider_secret_configured(request.provider)? {
        return Ok(build_mod_provider_staging_probe_blocked(
            &request,
            &format!(
                "{} API key is not stored in the local keychain; no provider request was made.",
                request.provider.display_name()
            ),
        ));
    }

    let started = Instant::now();
    let result = search_native_mods(request.clone()).await;
    let duration_ms = started.elapsed().as_millis().min(u128::from(u64::MAX)) as u64;

    match result {
        Ok(results) => Ok(build_mod_provider_staging_probe_success(
            &request,
            &results,
            duration_ms,
        )),
        Err(error) => Ok(build_mod_provider_staging_probe_error(
            &request,
            &error,
            duration_ms,
        )),
    }
}

// (removed: scan_mod_directory had a path-traversal sink because the
// renderer-controlled `path` was passed to `fs::read_dir` without an
// allow-root check. The frontend never calls this command —
// `scan_game_mods` is the supported path — so the function has been
// removed entirely. If a future feature needs free-form directory
// scanning, add an allow-list helper alongside the new entry point.)

async fn run_mod_install_worker(
    app: tauri::AppHandle,
    install_id: String,
    input: ModInstallRequest,
    game: crate::commands::games::InstalledGame,
    title: String,
    cancel_rx: watch::Receiver<bool>,
) {
    let result =
        run_mod_install_worker_inner(&app, &install_id, &input, &game, &title, cancel_rx).await;

    if let Err(error) =
        mod_staging_dir(&install_id).and_then(|path| cleanup_mod_staging_path(&path))
    {
        eprintln!(
            "[open-game-launcher] Could not clean mod staging directory '{install_id}': {error}"
        );
    }

    let queue_update = match result {
        Ok(result) => update_queue_item(&app, &install_id, |item| {
            item.status = ModInstallStatus::Completed;
            item.progress = 100;
            item.speed = "Installed".to_string();
            item.phase = "complete".to_string();
            item.bytes_downloaded = item.bytes_total;
            item.can_cancel = false;
            item.target_path = result.target_path.clone();
            item.error = None;
        }),
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
            "[open-game-launcher] Could not persist final mod install status '{install_id}': {error}"
        );
    }

    if let Ok(mut guard) = get_mod_install_manager().lock() {
        guard.remove(&install_id);
    }
}

async fn run_mod_install_worker_inner(
    app: &tauri::AppHandle,
    install_id: &str,
    input: &ModInstallRequest,
    game: &crate::commands::games::InstalledGame,
    title: &str,
    mut cancel_rx: watch::Receiver<bool>,
) -> Result<ModInstallResult, String> {
    update_queue_item(app, install_id, |item| {
        item.status = ModInstallStatus::Starting;
        item.phase = "resolving".to_string();
        item.speed = "Resolving target".to_string();
        item.progress = 3;
    })?;

    if input.provider == ModProvider::LocalFolder {
        let folder = local_path(input)?;
        if !folder.is_dir() {
            return Err(format!(
                "Local mod folder is not a directory: {}",
                folder.display()
            ));
        }
        begin_mod_install_commit(app, install_id, |item| {
            item.phase = "discovering".to_string();
            item.speed = "Registering external folder".to_string();
            item.progress = 90;
            item.external = true;
            item.target_path = Some(path_to_string(folder.clone()));
        })?;
        let manifest = ModInstallManifest {
            install_id: install_id.to_string(),
            game_id: game.id.clone(),
            title: title.to_string(),
            provider: input.provider,
            enabled: true,
            target_path: path_to_string(folder),
            installed_files: Vec::new(),
            profile_id: input.profile_id.clone(),
            catalog_item_id: input.catalog_item_id.clone(),
            version_id: input.version_id.clone(),
            source_url: input.source_url.clone(),
            installed_at: now_unix_secs(),
            manifest_version: MOD_MANIFEST_VERSION,
            file_records: Vec::new(),
        };
        persist_mod_manifest(&manifest)?;
        return Ok(result_from_manifest(manifest));
    }

    let target = resolve_target_path(game, input.provider, input.target_policy_id.as_deref())?;
    ensure_writable_mod_target(&target)?;

    let package = match input.provider {
        ModProvider::LocalArchive => local_path(input)?,
        ModProvider::LocalFolder => unreachable!("local folders are handled as external metadata"),
        _ => {
            let source_url = input
                .source_url
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| {
                    format!("{} requires a source URL.", input.provider.display_name())
                })?;
            download_url_to_package(app, install_id, source_url, &mut cancel_rx).await?
        }
    };

    if *cancel_rx.borrow() {
        return Err("cancelled".to_string());
    }

    if let Some(expected) = input
        .sha256
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        verify_sha256(&package, expected)?;
    }

    begin_mod_install_commit(app, install_id, |item| {
        item.phase = "installing".to_string();
        item.speed = "Installing".to_string();
        item.progress = 90;
        item.target_path = Some(path_to_string(target.clone()));
    })?;

    let file_records = install_package_to_target(install_id, title, &package, &target)?;
    let installed_files: Vec<String> = file_records
        .iter()
        .map(|record| record.relative_path.clone())
        .collect();
    let manifest = ModInstallManifest {
        install_id: install_id.to_string(),
        game_id: game.id.clone(),
        title: title.to_string(),
        provider: input.provider,
        enabled: true,
        target_path: path_to_string(target.clone()),
        installed_files,
        profile_id: input.profile_id.clone(),
        catalog_item_id: input.catalog_item_id.clone(),
        version_id: input.version_id.clone(),
        source_url: input.source_url.clone(),
        installed_at: now_unix_secs(),
        manifest_version: MOD_MANIFEST_VERSION,
        file_records,
    };
    if let Err(error) = persist_mod_manifest(&manifest) {
        let install = info_from_manifest(manifest.clone());
        let backup_root = mod_backup_dir(install_id)?;
        let rollback = remove_mod_install_artifacts_from_roots(&install, &target, &backup_root);
        return match rollback {
            Ok(()) => Err(error),
            Err(rollback_error) => Err(format!(
                "{error} The installed files also could not be rolled back safely: {rollback_error}"
            )),
        };
    }
    Ok(result_from_manifest(manifest))
}

fn finish_delegated_install(
    app: &tauri::AppHandle,
    install_id: &str,
    url: &str,
) -> Result<(), String> {
    let update_result = update_queue_item(app, install_id, |item| {
        item.status = ModInstallStatus::Delegated;
        item.progress = 100;
        item.speed = "External provider opened".to_string();
        item.phase = "delegated".to_string();
        item.can_cancel = false;
        item.external = true;
        item.delegated_url = Some(url.to_string());
    });
    if let Ok(mut guard) = get_mod_install_manager().lock() {
        guard.remove(install_id);
    }
    update_result
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
    let message = if manifest.provider == ModProvider::LocalFolder {
        "Local mod folder registered as external metadata."
    } else {
        "Mod installed."
    };
    ModInstallResult {
        install_id: manifest.install_id,
        game_id: manifest.game_id,
        status: ModInstallStatus::Completed,
        provider: manifest.provider,
        target_path: Some(manifest.target_path),
        installed_files: manifest.installed_files,
        delegated_url: None,
        message: message.to_string(),
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

async fn send_validated_remote_request(url: Url) -> Result<reqwest::Response, String> {
    send_validated_remote_request_with_headers(url, HeaderMap::new(), REMOTE_REQUEST_TIMEOUT).await
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

async fn download_url_to_package(
    app: &tauri::AppHandle,
    install_id: &str,
    url: &str,
    cancel_rx: &mut watch::Receiver<bool>,
) -> Result<PathBuf, String> {
    let parsed = parse_and_validate_remote_url(url)?;
    let staging = mod_staging_dir(install_id)?;
    fs::create_dir_all(&staging)
        .map_err(|error| format!("Could not create staging folder: {error}"))?;
    let package = staging.join(download_file_name(&parsed, install_id));

    update_queue_item(app, install_id, |item| {
        item.status = ModInstallStatus::Downloading;
        item.phase = "download".to_string();
        item.speed = "Connecting".to_string();
        item.progress = 5;
    })?;

    let response = send_validated_remote_request(parsed).await?;
    let total = response.content_length();
    validate_declared_download_size(total, MAX_REMOTE_MOD_BYTES)?;
    let mut stream = response.bytes_stream();
    let write_result: Result<(), String> = async {
        let mut file = fs::File::create(&package)
            .map_err(|error| format!("Could not create downloaded mod file: {error}"))?;
        let mut downloaded = 0_u64;

        while let Some(chunk) = stream.next().await {
            if *cancel_rx.borrow() {
                return Err("cancelled".to_string());
            }
            let chunk =
                chunk.map_err(|error| format!("Could not read mod download chunk: {error}"))?;
            let next_size = checked_download_size(downloaded, chunk.len(), MAX_REMOTE_MOD_BYTES)?;
            file.write_all(&chunk)
                .map_err(|error| format!("Could not write mod download chunk: {error}"))?;
            downloaded = next_size;
            let progress = total
                .map(|value| {
                    5 + (((downloaded as f64 / value.max(1) as f64) * 80.0).round() as u32)
                })
                .unwrap_or(40)
                .min(85);
            update_queue_item(app, install_id, |item| {
                item.progress = progress;
                item.speed = "Downloading".to_string();
                item.bytes_downloaded = Some(downloaded);
                item.bytes_total = total;
            })?;
        }
        file.sync_all()
            .map_err(|error| format!("Could not flush downloaded mod file: {error}"))?;
        Ok(())
    }
    .await;

    if let Err(error) = write_result {
        let _ = fs::remove_file(&package);
        return Err(error);
    }

    Ok(package)
}

fn install_package_to_target(
    install_id: &str,
    title: &str,
    package: &Path,
    target: &Path,
) -> Result<Vec<ModInstalledFileRecord>, String> {
    fs::create_dir_all(target)
        .map_err(|error| format!("Could not create target folder: {error}"))?;
    let extracted = mod_staging_dir(install_id)?.join("extracted");
    if extracted.exists() {
        fs::remove_dir_all(&extracted)
            .map_err(|error| format!("Could not reset staging folder: {error}"))?;
    }
    fs::create_dir_all(&extracted)
        .map_err(|error| format!("Could not create extraction folder: {error}"))?;

    if is_zip_package(package) {
        extract_zip_safely(package, &extracted)?;
    } else {
        let file_name = package
            .file_name()
            .and_then(|value| value.to_str())
            .map(sanitize_file_name)
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| format!("{}.bin", sanitize_file_name(title)));
        fs::copy(package, extracted.join(file_name))
            .map_err(|error| format!("Could not stage raw mod file: {error}"))?;
    }

    let staged_files = collect_relative_files(&extracted)?;
    apply_staged_files(install_id, &extracted, target, &staged_files)
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
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("Could not read ZIP entry: {error}"))?;
        let Some(enclosed) = entry.enclosed_name().map(|path| path.to_path_buf()) else {
            return Err("ZIP contains a path outside the install folder.".to_string());
        };
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
            let mut out_file = fs::File::create(&out_path)
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
            extracted_bytes += copied;
        }
    }
    Ok(())
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

fn resolve_target_path(
    game: &crate::commands::games::InstalledGame,
    provider: ModProvider,
    target_policy_id: Option<&str>,
) -> Result<PathBuf, String> {
    let install_path = game
        .install_path
        .as_deref()
        .map(PathBuf::from)
        .ok_or_else(|| format!("{} has no local install path.", game.title))?;
    resolve_target_path_from_install_root(&game.title, provider, target_policy_id, &install_path)
}

fn resolve_target_path_from_install_root(
    game_title: &str,
    provider: ModProvider,
    target_policy_id: Option<&str>,
    install_path: &Path,
) -> Result<PathBuf, String> {
    if is_restricted_target(install_path) {
        return Err(
            "This game's install folder is restricted. Use provider delegation or manual import."
                .to_string(),
        );
    }
    if !install_path.is_dir() {
        return Err(format!(
            "{} does not have a valid local install directory.",
            game_title
        ));
    }
    let install_root = resolve_path_with_existing_ancestors(install_path)?;
    let policy = target_policy_id.map(str::trim).unwrap_or_default();

    let candidate = if let Some(path) = policy.strip_prefix("manual:") {
        let manual = PathBuf::from(path.trim());
        if !manual.is_absolute()
            || manual
                .components()
                .any(|component| matches!(component, std::path::Component::ParentDir))
        {
            return Err(
                "Manual mod targets must be absolute paths without parent traversal.".to_string(),
            );
        }
        manual
    } else {
        match policy {
            "" | "auto" => auto_target_path(game_title, provider, &install_root),
            "root" => install_root.clone(),
            "creation_data" => install_root.join("Data"),
            "bepinex_plugins" => install_root.join("BepInEx").join("plugins"),
            "minecraft_mods" | "game_mods" => install_root.join("mods"),
            "steam_workshop" if provider == ModProvider::SteamWorkshop => {
                install_root.join("workshop")
            }
            "steam_workshop" => {
                return Err(
                    "The steam_workshop target policy is only valid for Steam Workshop installs."
                        .to_string(),
                );
            }
            other => {
                return Err(format!(
                    "Unsupported mod target policy '{other}'. Use an approved target policy."
                ));
            }
        }
    };

    validate_mod_target_under_game_root(&install_root, &candidate)
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

fn auto_target_path(game_title: &str, provider: ModProvider, install_path: &Path) -> PathBuf {
    let title = game_title.to_lowercase();
    if provider == ModProvider::SteamWorkshop {
        return install_path.join("workshop");
    }
    if title.contains("skyrim")
        || title.contains("fallout")
        || title.contains("oblivion")
        || title.contains("starfield")
    {
        return install_path.join("Data");
    }
    if install_path.join("BepInEx").is_dir() {
        return install_path.join("BepInEx").join("plugins");
    }
    install_path.join("mods")
}

fn candidate_mod_targets(game: &crate::commands::games::InstalledGame) -> Vec<PathBuf> {
    let Some(install_path) = game.install_path.as_deref().map(PathBuf::from) else {
        return Vec::new();
    };
    vec![
        install_path.join("mods"),
        install_path.join("Data"),
        install_path.join("BepInEx").join("plugins"),
        install_path.join("workshop"),
    ]
}

fn should_delegate_provider(input: &ModInstallRequest) -> bool {
    match input.provider {
        ModProvider::SteamWorkshop => true,
        ModProvider::Modio | ModProvider::Curseforge => {
            input
                .source_url
                .as_deref()
                .is_none_or(|url| !looks_like_download_url(url))
                || input
                    .sha256
                    .as_deref()
                    .is_none_or(|checksum| checksum.trim().is_empty())
        }
        ModProvider::DirectUrl | ModProvider::LocalArchive | ModProvider::LocalFolder => false,
    }
}

fn delegated_url_for_provider(input: &ModInstallRequest) -> Option<String> {
    let source = input
        .source_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    match input.provider {
        ModProvider::SteamWorkshop => {
            let id = source
                .and_then(extract_steam_workshop_id)
                .or_else(|| input.catalog_item_id.as_deref().map(ToOwned::to_owned));
            id.map(|id| {
                format!(
                    "steam://openurl/https://steamcommunity.com/sharedfiles/filedetails/?id={id}"
                )
            })
            .or_else(|| source.map(ToOwned::to_owned))
        }
        ModProvider::Modio => source.map(ToOwned::to_owned),
        ModProvider::Curseforge => source
            .map(ToOwned::to_owned)
            .or_else(|| input.catalog_item_id.as_deref().map(curseforge_project_url)),
        ModProvider::DirectUrl | ModProvider::LocalArchive | ModProvider::LocalFolder => None,
    }
}

fn curseforge_project_url(project_id: &str) -> String {
    format!(
        "https://www.curseforge.com/projects/{}",
        sanitize_url_path_segment(project_id)
    )
}

fn extract_steam_workshop_id(value: &str) -> Option<String> {
    if let Some((_, rest)) = value.split_once("id=") {
        let id = rest
            .chars()
            .take_while(|character| character.is_ascii_digit())
            .collect::<String>();
        if !id.is_empty() {
            return Some(id);
        }
    }
    let digits = value
        .chars()
        .filter(|character| character.is_ascii_digit())
        .collect::<String>();
    (!digits.is_empty()).then_some(digits)
}

async fn search_modio_mods(
    game_id: &str,
    query: &str,
    page: u32,
    page_size: u32,
) -> Result<Vec<NativeModSearchResult>, String> {
    let api_key = read_provider_secret(ModProvider::Modio)?;
    let mut url = Url::parse(&format!(
        "https://api.mod.io/v1/games/{}/mods",
        sanitize_url_path_segment(game_id)
    ))
    .map_err(|error| format!("Invalid mod.io API URL: {error}"))?;
    let offset = page.saturating_sub(1).saturating_mul(page_size);
    url.query_pairs_mut()
        .append_pair("api_key", &api_key)
        .append_pair("_q", query)
        .append_pair("limit", &page_size.to_string())
        .append_pair("offset", &offset.to_string());

    let payload = reqwest::Client::new()
        .get(url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|error| format!("mod.io search failed: {error}"))?;
    if !payload.status().is_success() {
        return Err(format!("mod.io search returned {}", payload.status()));
    }
    let json = payload
        .json::<Value>()
        .await
        .map_err(|error| format!("mod.io response was not valid JSON: {error}"))?;
    Ok(map_modio_search_results(&json))
}

fn build_mod_provider_staging_probe_request(
    input: &ModProviderStagingProbeRequest,
) -> Result<NativeModSearchRequest, String> {
    match input.provider {
        ModProvider::Modio | ModProvider::Curseforge => Ok(NativeModSearchRequest {
            provider: input.provider,
            provider_game_id: normalize_id(&input.provider_game_id, "providerGameId")?,
            query: normalize_id(&input.query, "query")?,
            page: Some(1),
            page_size: Some(1),
        }),
        other => Err(format!(
            "{} does not expose provider API staging probes.",
            other.display_name()
        )),
    }
}

fn provider_secret_configured(provider: ModProvider) -> Result<bool, String> {
    let domain = provider_secret_domain(provider);
    secure_store::get_secret(&domain)
        .map_err(|error| format!("Could not read {} key: {error}", provider.display_name()))
        .map(|secret| {
            secret
                .map(|value| !value.trim().is_empty())
                .unwrap_or(false)
        })
}

fn build_mod_provider_staging_probe_redacted_request(request: &NativeModSearchRequest) -> String {
    match request.provider {
        ModProvider::Modio => format!(
            "GET https://api.mod.io/v1/games/{}/mods?api_key=<redacted>&_q={}&limit=1&offset=0",
            sanitize_url_path_segment(&request.provider_game_id),
            request.query
        ),
        ModProvider::Curseforge => format!(
            "GET https://api.curseforge.com/v1/mods/search?gameId={}&searchFilter={}&pageSize=1&index=0 x-api-key=<redacted>",
            request.provider_game_id, request.query
        ),
        other => format!("{} provider API staging is unsupported", other.display_name()),
    }
}

fn build_mod_provider_staging_probe_success(
    request: &NativeModSearchRequest,
    results: &[NativeModSearchResult],
    duration_ms: u64,
) -> ModProviderStagingProbeResult {
    ModProviderStagingProbeResult {
        provider: request.provider,
        provider_game_id: request.provider_game_id.clone(),
        query_hint: request.query.clone(),
        page_size: request.page_size.unwrap_or(1),
        status: ModProviderStagingProbeStatus::Ready,
        live_request_attempted: true,
        result_count: results.len(),
        direct_download_count: results
            .iter()
            .filter(|result| {
                result
                    .download_url
                    .as_deref()
                    .is_some_and(|url| !url.is_empty())
            })
            .count(),
        provider_app_handoff_count: results
            .iter()
            .filter(|result| {
                result
                    .provider_app_url
                    .as_deref()
                    .is_some_and(|url| !url.is_empty())
            })
            .count(),
        duration_ms,
        redacted_request: build_mod_provider_staging_probe_redacted_request(request),
        message: format!(
            "{} staging probe returned {} result(s) with redacted telemetry.",
            request.provider.display_name(),
            results.len()
        ),
        guards: mod_provider_staging_probe_guards(),
    }
}

fn build_mod_provider_staging_probe_blocked(
    request: &NativeModSearchRequest,
    message: &str,
) -> ModProviderStagingProbeResult {
    ModProviderStagingProbeResult {
        provider: request.provider,
        provider_game_id: request.provider_game_id.clone(),
        query_hint: request.query.clone(),
        page_size: request.page_size.unwrap_or(1),
        status: ModProviderStagingProbeStatus::Blocked,
        live_request_attempted: false,
        result_count: 0,
        direct_download_count: 0,
        provider_app_handoff_count: 0,
        duration_ms: 0,
        redacted_request: build_mod_provider_staging_probe_redacted_request(request),
        message: message.to_string(),
        guards: mod_provider_staging_probe_guards(),
    }
}

fn build_mod_provider_staging_probe_error(
    request: &NativeModSearchRequest,
    error: &str,
    duration_ms: u64,
) -> ModProviderStagingProbeResult {
    ModProviderStagingProbeResult {
        provider: request.provider,
        provider_game_id: request.provider_game_id.clone(),
        query_hint: request.query.clone(),
        page_size: request.page_size.unwrap_or(1),
        status: ModProviderStagingProbeStatus::ProviderError,
        live_request_attempted: true,
        result_count: 0,
        direct_download_count: 0,
        provider_app_handoff_count: 0,
        duration_ms,
        redacted_request: build_mod_provider_staging_probe_redacted_request(request),
        message: redact_mod_provider_staging_probe_error(error),
        guards: mod_provider_staging_probe_guards(),
    }
}

fn mod_provider_staging_probe_guards() -> Vec<String> {
    vec![
        "API key redacted".to_string(),
        "Single-result staging probe".to_string(),
        "No direct-download URL returned".to_string(),
        "Keys stay out of Supabase".to_string(),
    ]
}

fn redact_mod_provider_staging_probe_error(error: &str) -> String {
    let redacted = redact_assignment_value(error, "api_key=");
    redact_assignment_value(&redacted, "x-api-key=")
}

fn redact_assignment_value(input: &str, marker: &str) -> String {
    let mut output = input.to_string();
    let mut cursor = 0;
    while let Some(relative_start) = output[cursor..].find(marker) {
        let value_start = cursor + relative_start + marker.len();
        let value_end = output[value_start..]
            .find(|character: char| {
                character == '&'
                    || character == ' '
                    || character == '\n'
                    || character == '\r'
                    || character == '\t'
            })
            .map(|relative_end| value_start + relative_end)
            .unwrap_or_else(|| output.len());
        output.replace_range(value_start..value_end, "<redacted>");
        cursor = value_start + "<redacted>".len();
    }
    output
}

async fn search_curseforge_mods(
    game_id: &str,
    query: &str,
    page: u32,
    page_size: u32,
) -> Result<Vec<NativeModSearchResult>, String> {
    let api_key = read_provider_secret(ModProvider::Curseforge)?;
    let mut url = Url::parse("https://api.curseforge.com/v1/mods/search")
        .map_err(|error| format!("Invalid CurseForge API URL: {error}"))?;
    let index = page.saturating_sub(1).saturating_mul(page_size);
    url.query_pairs_mut()
        .append_pair("gameId", game_id)
        .append_pair("searchFilter", query)
        .append_pair("pageSize", &page_size.to_string())
        .append_pair("index", &index.to_string());

    let payload = reqwest::Client::new()
        .get(url)
        .header("Accept", "application/json")
        .header("x-api-key", api_key)
        .send()
        .await
        .map_err(|error| format!("CurseForge search failed: {error}"))?;
    if !payload.status().is_success() {
        return Err(format!("CurseForge search returned {}", payload.status()));
    }
    let json = payload
        .json::<Value>()
        .await
        .map_err(|error| format!("CurseForge response was not valid JSON: {error}"))?;
    Ok(map_curseforge_search_results(&json))
}

fn map_modio_search_results(json: &Value) -> Vec<NativeModSearchResult> {
    json.get("data")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|entry| {
            let external_id = value_u64(entry, &["id"])
                .map(|value| value.to_string())
                .or_else(|| value_string(entry, &["name_id"]))?;
            let name = value_string(entry, &["name"])?;
            let url = value_string(entry, &["profile_url"]).unwrap_or_else(|| {
                format!(
                    "https://mod.io/g/mods/m/{}",
                    sanitize_url_path_segment(&external_id)
                )
            });
            let modfile = entry.get("modfile").unwrap_or(&Value::Null);
            Some(NativeModSearchResult {
                provider: ModProvider::Modio,
                external_id,
                name,
                author: value_string(entry, &["submitted_by", "username"]),
                summary: value_string(entry, &["summary"]),
                url,
                icon_url: first_string(entry, &[&["logo", "thumb_320x180"], &["logo", "original"]]),
                downloads: value_u64(entry, &["stats", "downloads_total"]).map(format_count),
                follows: value_u64(entry, &["stats", "subscribers_total"]).map(format_count),
                latest_version: value_string(modfile, &["version"]),
                download_url: value_string(modfile, &["download", "binary_url"]),
                provider_app_url: None,
                file_size_bytes: value_u64(modfile, &["filesize"]),
            })
        })
        .collect()
}

fn map_curseforge_search_results(json: &Value) -> Vec<NativeModSearchResult> {
    json.get("data")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|entry| {
            let external_id = value_u64(entry, &["id"]).map(|value| value.to_string())?;
            let name = value_string(entry, &["name"])?;
            let provider_app_url = value_string(entry, &["links", "websiteUrl"])
                .unwrap_or_else(|| curseforge_project_url(&external_id));
            let latest_file = entry
                .get("latestFiles")
                .and_then(Value::as_array)
                .and_then(|files| files.first())
                .unwrap_or(&Value::Null);
            Some(NativeModSearchResult {
                provider: ModProvider::Curseforge,
                external_id,
                name,
                author: entry
                    .get("authors")
                    .and_then(Value::as_array)
                    .and_then(|authors| authors.first())
                    .and_then(|author| value_string(author, &["name"])),
                summary: value_string(entry, &["summary"]),
                url: provider_app_url.clone(),
                icon_url: first_string(entry, &[&["logo", "thumbnailUrl"], &["logo", "url"]]),
                downloads: value_u64(entry, &["downloadCount"]).map(format_count),
                follows: value_u64(entry, &["thumbsUpCount"]).map(format_count),
                latest_version: first_string(
                    latest_file,
                    &[&["displayName"], &["fileName"], &["releaseType"]],
                ),
                download_url: value_string(latest_file, &["downloadUrl"]),
                provider_app_url: Some(provider_app_url),
                file_size_bytes: value_u64(latest_file, &["fileLength"]),
            })
        })
        .collect()
}

fn read_provider_secret(provider: ModProvider) -> Result<String, String> {
    let domain = provider_secret_domain(provider);
    secure_store::get_secret(&domain)
        .map_err(|error| format!("Could not read {} key: {error}", provider.display_name()))?
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            format!(
                "{} API key is required. Save it from the Provider Keys panel first.",
                provider.display_name()
            )
        })
}

fn value_string(value: &Value, path: &[&str]) -> Option<String> {
    path.iter()
        .try_fold(value, |current, key| current.get(*key))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn first_string(value: &Value, paths: &[&[&str]]) -> Option<String> {
    paths.iter().find_map(|path| value_string(value, path))
}

fn value_u64(value: &Value, path: &[&str]) -> Option<u64> {
    let leaf = path
        .iter()
        .try_fold(value, |current, key| current.get(*key))?;
    leaf.as_u64()
        .or_else(|| leaf.as_f64().map(|number| number.max(0.0) as u64))
        .or_else(|| leaf.as_str()?.parse::<u64>().ok())
}

fn format_count(value: u64) -> String {
    if value >= 1_000_000 {
        format!("{:.1}M", value as f64 / 1_000_000.0)
    } else if value >= 1_000 {
        format!("{:.1}K", value as f64 / 1_000.0)
    } else {
        value.to_string()
    }
}

fn sanitize_url_path_segment(value: &str) -> String {
    value
        .trim()
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
        .collect::<String>()
}

fn provider_secret_domain(provider: ModProvider) -> String {
    format!("mod_provider:{}", provider.as_str())
}

fn local_path(input: &ModInstallRequest) -> Result<PathBuf, String> {
    let path = input
        .local_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("{} requires a local path.", input.provider.display_name()))?;
    let path = PathBuf::from(path);
    if !path.exists() {
        return Err(format!("Local mod path does not exist: {}", path.display()));
    }
    Ok(path)
}

fn validate_install_source(input: &ModInstallRequest, is_delegated: bool) -> Result<(), String> {
    match input.provider {
        ModProvider::LocalArchive => {
            let path = local_path(input)?;
            if !path.is_file() {
                return Err(format!(
                    "Local mod archive is not a regular file: {}",
                    path.display()
                ));
            }
        }
        ModProvider::LocalFolder => {
            let path = local_path(input)?;
            if !path.is_dir() {
                return Err(format!(
                    "Local mod folder is not a directory: {}",
                    path.display()
                ));
            }
        }
        ModProvider::SteamWorkshop if is_delegated => {}
        ModProvider::SteamWorkshop => {
            let source = remote_source_url(input)?;
            parse_and_validate_remote_url(source)?;
            required_remote_checksum(input)?;
        }
        ModProvider::Modio | ModProvider::Curseforge | ModProvider::DirectUrl if !is_delegated => {
            let source = remote_source_url(input)?;
            parse_and_validate_remote_url(source)?;
            required_remote_checksum(input)?;
        }
        ModProvider::Modio | ModProvider::Curseforge | ModProvider::DirectUrl => {}
    }
    Ok(())
}

fn remote_source_url(input: &ModInstallRequest) -> Result<&str, String> {
    input
        .source_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("{} requires a source URL.", input.provider.display_name()))
}

fn required_remote_checksum(input: &ModInstallRequest) -> Result<String, String> {
    let checksum = input
        .sha256
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            format!(
                "{} remote archives require an expected SHA-256 checksum. Use the provider handoff when no trusted checksum is available.",
                input.provider.display_name()
            )
        })?;
    normalize_sha256(checksum)
}

fn title_from_source(input: &ModInstallRequest) -> Option<String> {
    input
        .source_url
        .as_deref()
        .or(input.local_path.as_deref())
        .and_then(|value| {
            Path::new(value)
                .file_stem()
                .and_then(|stem| stem.to_str())
                .map(|stem| stem.replace(['_', '-'], " "))
        })
}

fn looks_like_download_url(value: &str) -> bool {
    let lower = Url::parse(value)
        .ok()
        .map(|url| url.path().to_lowercase())
        .unwrap_or_else(|| value.to_lowercase());
    lower.ends_with(".zip")
        || lower.ends_with(".7z")
        || lower.ends_with(".rar")
        || lower.ends_with(".pak")
        || lower.contains("/download")
        || lower.contains("binary_url")
}

fn is_zip_package(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("zip"))
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

fn download_file_name(url: &Url, fallback: &str) -> String {
    url.path_segments()
        .and_then(|mut segments| segments.next_back())
        .map(sanitize_file_name)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| format!("{}.bin", sanitize_file_name(fallback)))
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

fn verify_sha256(path: &Path, expected: &str) -> Result<(), String> {
    let expected = normalize_sha256(expected)?;
    let actual = sha256_file(path)?;
    if actual != expected {
        return Err(format!(
            "SHA-256 verification failed: expected {expected}, got {actual}."
        ));
    }
    Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;
    use zip::{write::SimpleFileOptions, ZipWriter};

    #[test]
    fn mod_queue_persistence_errors_are_part_of_the_api() {
        let _read: fn() -> Result<Vec<ModInstallQueueItem>, String> = read_mod_queue_history;
        let _remember: fn(ModInstallQueueItem) -> Result<(), String> = remember_mod_queue_item;
        let _read_installs: fn() -> Result<Vec<InstalledModInfo>, String> = read_mod_installs;
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
                    provider: ModProvider::LocalArchive,
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
    fn launcher_managed_remote_archives_require_valid_sha256() {
        let mut input = ModInstallRequest {
            game_id: "game-1".to_string(),
            provider: ModProvider::DirectUrl,
            catalog_item_id: None,
            version_id: None,
            source_url: Some("https://example.com/mod.zip".to_string()),
            local_path: None,
            target_policy_id: None,
            profile_id: None,
            title: None,
            sha256: None,
        };

        assert!(validate_install_source(&input, false).is_err());
        input.sha256 = Some("not-a-checksum".to_string());
        assert!(validate_install_source(&input, false).is_err());
        input.sha256 = Some("a".repeat(64));
        assert!(validate_install_source(&input, false).is_ok());
    }

    #[test]
    fn target_policy_rejects_manual_escape_and_unknown_policies() {
        let temp = test_directory("target-policy");
        let install_root = temp.join("game");
        let inside = install_root.join("custom-mods");
        let outside = temp.join("outside");
        fs::create_dir_all(&install_root).unwrap();
        fs::create_dir_all(&outside).unwrap();

        let inside_policy = format!("manual:{}", inside.display());
        let resolved = resolve_target_path_from_install_root(
            "Example Game",
            ModProvider::LocalArchive,
            Some(&inside_policy),
            &install_root,
        )
        .unwrap();
        assert!(resolved.starts_with(install_root.canonicalize().unwrap()));

        let outside_policy = format!("manual:{}", outside.display());
        assert!(resolve_target_path_from_install_root(
            "Example Game",
            ModProvider::LocalArchive,
            Some(&outside_policy),
            &install_root,
        )
        .is_err());
        assert!(resolve_target_path_from_install_root(
            "Example Game",
            ModProvider::LocalArchive,
            Some("manual:relative/mods"),
            &install_root,
        )
        .is_err());
        assert!(resolve_target_path_from_install_root(
            "Example Game",
            ModProvider::LocalArchive,
            Some("renderer_chosen_policy"),
            &install_root,
        )
        .is_err());

        fs::remove_dir_all(temp).unwrap();
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
    fn steam_workshop_id_is_extracted_from_url() {
        assert_eq!(
            extract_steam_workshop_id(
                "https://steamcommunity.com/sharedfiles/filedetails/?id=123456789&searchtext=test"
            )
            .as_deref(),
            Some("123456789")
        );
        assert_eq!(extract_steam_workshop_id("12345").as_deref(), Some("12345"));
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
    fn provider_delegation_respects_direct_sources() {
        let direct = ModInstallRequest {
            game_id: "steam-1".to_string(),
            provider: ModProvider::DirectUrl,
            catalog_item_id: None,
            version_id: None,
            source_url: Some("https://example.test/mod.zip".to_string()),
            local_path: None,
            target_policy_id: None,
            profile_id: None,
            title: None,
            sha256: None,
        };
        assert!(!should_delegate_provider(&direct));

        let steam = ModInstallRequest {
            provider: ModProvider::SteamWorkshop,
            ..direct
        };
        assert!(should_delegate_provider(&steam));
    }

    #[test]
    fn curseforge_delegation_falls_back_to_project_url() {
        let input = ModInstallRequest {
            game_id: "steam-1".to_string(),
            provider: ModProvider::Curseforge,
            catalog_item_id: Some("987".to_string()),
            version_id: None,
            source_url: None,
            local_path: None,
            target_policy_id: None,
            profile_id: None,
            title: None,
            sha256: None,
        };

        assert!(should_delegate_provider(&input));
        assert_eq!(
            delegated_url_for_provider(&input).as_deref(),
            Some("https://www.curseforge.com/projects/987")
        );

        let native_input = ModInstallRequest {
            source_url: Some("https://edge.forgecdn.net/files/ui.zip".to_string()),
            ..input
        };
        assert!(should_delegate_provider(&native_input));
        assert_eq!(
            delegated_url_for_provider(&native_input).as_deref(),
            Some("https://edge.forgecdn.net/files/ui.zip")
        );

        let checksummed_input = ModInstallRequest {
            sha256: Some("a".repeat(64)),
            ..native_input
        };
        assert!(!should_delegate_provider(&checksummed_input));
    }

    #[test]
    fn modio_search_mapper_extracts_latest_download() {
        let json = serde_json::json!({
            "data": [{
                "id": 123,
                "name": "Better Maps",
                "summary": "Adds cleaner tactical maps.",
                "profile_url": "https://mod.io/g/example/m/better-maps",
                "submitted_by": { "username": "mapper" },
                "logo": { "thumb_320x180": "https://img.example/map.png" },
                "stats": { "downloads_total": 12345, "subscribers_total": 678 },
                "modfile": {
                    "version": "1.2.0",
                    "filesize": 4096,
                    "download": { "binary_url": "https://mods.example/better-maps.zip" }
                }
            }]
        });

        let results = map_modio_search_results(&json);

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].provider, ModProvider::Modio);
        assert_eq!(results[0].external_id, "123");
        assert_eq!(results[0].downloads.as_deref(), Some("12.3K"));
        assert_eq!(
            results[0].download_url.as_deref(),
            Some("https://mods.example/better-maps.zip")
        );
        assert_eq!(results[0].provider_app_url, None);
    }

    #[test]
    fn curseforge_search_mapper_uses_latest_file() {
        let json = serde_json::json!({
            "data": [{
                "id": 987,
                "name": "Sharper UI",
                "summary": "Dense launcher-friendly menus.",
                "links": { "websiteUrl": "https://www.curseforge.com/example/sharper-ui" },
                "logo": { "thumbnailUrl": "https://img.example/ui.png" },
                "authors": [{ "name": "forge-author" }],
                "downloadCount": 2500000,
                "thumbsUpCount": 42,
                "latestFiles": [{
                    "displayName": "2.0.1",
                    "fileLength": 2048,
                    "downloadUrl": "https://edge.forgecdn.net/files/ui.zip"
                }]
            }]
        });

        let results = map_curseforge_search_results(&json);

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].provider, ModProvider::Curseforge);
        assert_eq!(results[0].external_id, "987");
        assert_eq!(results[0].author.as_deref(), Some("forge-author"));
        assert_eq!(results[0].downloads.as_deref(), Some("2.5M"));
        assert_eq!(results[0].latest_version.as_deref(), Some("2.0.1"));
        assert_eq!(
            results[0].provider_app_url.as_deref(),
            Some("https://www.curseforge.com/example/sharper-ui")
        );
    }

    #[test]
    fn curseforge_search_mapper_builds_project_handoff_url() {
        let json = serde_json::json!({
            "data": [{
                "id": 987,
                "name": "Sharper UI",
                "latestFiles": [{
                    "displayName": "2.0.1",
                    "fileLength": 2048
                }]
            }]
        });

        let results = map_curseforge_search_results(&json);

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].download_url, None);
        assert_eq!(
            results[0].provider_app_url.as_deref(),
            Some("https://www.curseforge.com/projects/987")
        );
    }

    #[test]
    fn provider_staging_probe_forces_single_result_and_redacts_request() {
        let input = ModProviderStagingProbeRequest {
            provider: ModProvider::Modio,
            provider_game_id: "example-game".to_string(),
            query: "ui tweaks".to_string(),
        };

        let request = build_mod_provider_staging_probe_request(&input).unwrap();
        let redacted_request = build_mod_provider_staging_probe_redacted_request(&request);

        assert_eq!(request.provider, ModProvider::Modio);
        assert_eq!(request.provider_game_id, "example-game");
        assert_eq!(request.query, "ui tweaks");
        assert_eq!(request.page, Some(1));
        assert_eq!(request.page_size, Some(1));
        assert!(redacted_request.contains("api_key=<redacted>"));
        assert!(redacted_request.contains("limit=1"));
        assert!(!redacted_request.contains("secret"));
    }

    #[test]
    fn provider_staging_probe_counts_results_without_returning_urls() {
        let request = NativeModSearchRequest {
            provider: ModProvider::Curseforge,
            provider_game_id: "432".to_string(),
            query: "ui".to_string(),
            page: Some(1),
            page_size: Some(1),
        };
        let results = vec![NativeModSearchResult {
            provider: ModProvider::Curseforge,
            external_id: "987".to_string(),
            name: "Sharper UI".to_string(),
            author: Some("forge-author".to_string()),
            summary: Some("Dense menus.".to_string()),
            url: "https://www.curseforge.com/example/sharper-ui".to_string(),
            icon_url: Some("https://img.example/ui.png".to_string()),
            downloads: Some("2.5M".to_string()),
            follows: Some("42".to_string()),
            latest_version: Some("2.0.1".to_string()),
            download_url: Some("https://edge.forgecdn.net/files/ui.zip?token=secret".to_string()),
            provider_app_url: Some("https://www.curseforge.com/example/sharper-ui".to_string()),
            file_size_bytes: Some(2048),
        }];

        let probe = build_mod_provider_staging_probe_success(&request, &results, 48);

        assert_eq!(probe.status, ModProviderStagingProbeStatus::Ready);
        assert!(probe.live_request_attempted);
        assert_eq!(probe.result_count, 1);
        assert_eq!(probe.direct_download_count, 1);
        assert_eq!(probe.provider_app_handoff_count, 1);
        assert_eq!(probe.duration_ms, 48);
        assert!(probe.redacted_request.contains("x-api-key=<redacted>"));
        assert!(!serde_json::to_string(&probe)
            .unwrap()
            .contains("edge.forgecdn.net"));
        assert!(!serde_json::to_string(&probe).unwrap().contains("secret"));
    }

    #[test]
    fn provider_staging_probe_error_redaction_removes_query_api_keys() {
        let error = "mod.io search failed: https://api.mod.io/v1/games/example/mods?api_key=super-secret&_q=ui";

        let redacted = redact_mod_provider_staging_probe_error(error);

        assert!(redacted.contains("api_key=<redacted>"));
        assert!(!redacted.contains("super-secret"));
    }
}
