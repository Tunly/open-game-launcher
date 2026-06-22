use futures_util::StreamExt;
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock},
    time::{Instant, SystemTime, UNIX_EPOCH},
};
use tauri::Emitter;
use tokio::sync::watch;

use crate::commands::{
    games::{open_game_launcher_data_dir, open_uri, path_to_string, read_installed_games_cache},
    local_db, secure_store,
};

const MOD_INSTALL_QUEUE_COLLECTION: &str = "mod_install_queue";
const MOD_INSTALLS_COLLECTION: &str = "mod_installs";
const MOD_MANIFEST_DIR: &str = ".og-mods";
const MOD_DISABLED_DIR: &str = ".og-disabled";

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

#[tauri::command]
pub fn get_mod_queue() -> Result<Vec<ModInstallQueueItem>, String> {
    let mut queue_by_id: HashMap<String, ModInstallQueueItem> = read_mod_queue_history()
        .into_iter()
        .map(|item| (item.install_id.clone(), item))
        .collect();

    let manager = get_mod_install_manager();
    let guard = manager
        .lock()
        .map_err(|error| format!("Mod install manager lock poisoned: {error}"))?;
    for active in guard.values() {
        queue_by_id.insert(active.item.install_id.clone(), active.item.clone());
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
    let game = read_installed_games_cache()
        .unwrap_or_default()
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
    let install_id = build_install_id(input.provider, &game_id, &title);
    let target_path = resolve_target_path(&game, input.provider, input.target_policy_id.as_deref())
        .ok()
        .map(path_to_string);
    let delegated_url = delegated_url_for_provider(&input);
    let is_delegated = delegated_url.is_some() && should_delegate_provider(&input);
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

    {
        let manager = get_mod_install_manager();
        let mut guard = manager
            .lock()
            .map_err(|error| format!("Mod install manager lock poisoned: {error}"))?;
        guard.insert(
            install_id.clone(),
            ActiveModInstall {
                item: item.clone(),
                cancel_tx,
            },
        );
    }
    remember_mod_queue_item(item.clone());
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
    let manager = get_mod_install_manager();
    let mut guard = manager
        .lock()
        .map_err(|error| format!("Mod install manager lock poisoned: {error}"))?;
    let Some(active) = guard.get_mut(&install_id) else {
        return Ok(());
    };
    let _ = active.cancel_tx.send(true);
    active.item.status = ModInstallStatus::Cancelled;
    active.item.progress = active.item.progress.min(99);
    active.item.speed = "Cancelled".to_string();
    active.item.phase = "cancelled".to_string();
    active.item.can_cancel = false;
    active.item.last_updated_at = now_unix_secs();
    let item = active.item.clone();
    remember_mod_queue_item(item.clone());
    emit_mod_progress(&app, &item);
    guard.remove(&install_id);
    Ok(())
}

#[tauri::command]
pub fn scan_game_mods(game_id: String) -> Result<Vec<InstalledModInfo>, String> {
    let game_id = normalize_id(&game_id, "gameId")?;
    let mut installs = read_mod_installs()
        .into_iter()
        .filter(|item| item.game_id == game_id)
        .collect::<Vec<_>>();

    if installs.is_empty() {
        if let Some(game) = read_installed_games_cache()
            .unwrap_or_default()
            .into_iter()
            .find(|game| game.id == game_id)
        {
            for target in candidate_mod_targets(&game) {
                installs.extend(read_manifests_from_target(&target));
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
    let mut installs = read_mod_installs();
    let Some(index) = installs
        .iter()
        .position(|install| install.install_id == install_id)
    else {
        return Ok(());
    };
    let install = installs.remove(index);
    let target = PathBuf::from(&install.target_path);
    for relative in &install.installed_files {
        let file_path = safe_join(&target, relative)?;
        if file_path.is_file() {
            fs::remove_file(&file_path).map_err(|error| {
                format!("Could not remove mod file {}: {error}", file_path.display())
            })?;
        }
        remove_empty_parents(&file_path, &target);
    }
    let manifest_path = manifest_file_path(&target, &install.install_id);
    if manifest_path.exists() {
        fs::remove_file(&manifest_path)
            .map_err(|error| format!("Could not remove mod manifest: {error}"))?;
    }
    local_db::write_collection(MOD_INSTALLS_COLLECTION, &installs, |item| &item.install_id)?;
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

/// Compatibility wrapper for the original manual URL installer.
#[tauri::command]
pub async fn install_mod_from_url(
    url: String,
    target_dir: String,
    game_title: String,
) -> Result<String, String> {
    let target = PathBuf::from(&target_dir);
    fs::create_dir_all(&target).map_err(|error| format!("Create target dir failed: {error}"))?;
    let package = download_url_to_temp(&url, "legacy-mod-download").await?;
    let files = install_package_to_target("legacy-mod-download", &game_title, &package, &target)?;
    Ok(format!(
        "Mod for '{}' installed to {} ({} files)",
        game_title,
        target_dir,
        files.len()
    ))
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

    match result {
        Ok(result) => {
            update_queue_item(&app, &install_id, |item| {
                item.status = ModInstallStatus::Completed;
                item.progress = 100;
                item.speed = "Installed".to_string();
                item.phase = "complete".to_string();
                item.bytes_downloaded = item.bytes_total;
                item.can_cancel = false;
                item.target_path = result.target_path.clone();
                item.error = None;
            });
        }
        Err(error) if error == "cancelled" => {
            update_queue_item(&app, &install_id, |item| {
                item.status = ModInstallStatus::Cancelled;
                item.speed = "Cancelled".to_string();
                item.phase = "cancelled".to_string();
                item.can_cancel = false;
            });
        }
        Err(error) => {
            update_queue_item(&app, &install_id, |item| {
                item.status = ModInstallStatus::Failed;
                item.speed = "Failed".to_string();
                item.phase = "error".to_string();
                item.error = Some(error);
                item.can_cancel = false;
            });
        }
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
    });

    let target = resolve_target_path(game, input.provider, input.target_policy_id.as_deref())?;
    ensure_writable_mod_target(&target)?;
    fs::create_dir_all(&target)
        .map_err(|error| format!("Could not create target folder: {error}"))?;

    let package = match input.provider {
        ModProvider::LocalFolder => {
            let folder = local_path(input)?;
            let files = collect_relative_files(&folder)?;
            let manifest = ModInstallManifest {
                install_id: install_id.to_string(),
                game_id: game.id.clone(),
                title: title.to_string(),
                provider: input.provider,
                enabled: true,
                target_path: path_to_string(folder.clone()),
                installed_files: files,
                profile_id: input.profile_id.clone(),
                catalog_item_id: input.catalog_item_id.clone(),
                version_id: input.version_id.clone(),
                source_url: input.source_url.clone(),
                installed_at: now_unix_secs(),
            };
            persist_mod_manifest(&manifest)?;
            return Ok(result_from_manifest(manifest));
        }
        ModProvider::LocalArchive => local_path(input)?,
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

    update_queue_item(app, install_id, |item| {
        item.status = ModInstallStatus::Installing;
        item.phase = "installing".to_string();
        item.speed = "Installing".to_string();
        item.progress = 90;
        item.target_path = Some(path_to_string(target.clone()));
    });

    let installed_files = install_package_to_target(install_id, title, &package, &target)?;
    let manifest = ModInstallManifest {
        install_id: install_id.to_string(),
        game_id: game.id.clone(),
        title: title.to_string(),
        provider: input.provider,
        enabled: true,
        target_path: path_to_string(target),
        installed_files,
        profile_id: input.profile_id.clone(),
        catalog_item_id: input.catalog_item_id.clone(),
        version_id: input.version_id.clone(),
        source_url: input.source_url.clone(),
        installed_at: now_unix_secs(),
    };
    persist_mod_manifest(&manifest)?;
    Ok(result_from_manifest(manifest))
}

fn finish_delegated_install(
    app: &tauri::AppHandle,
    install_id: &str,
    url: &str,
) -> Result<(), String> {
    update_queue_item(app, install_id, |item| {
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
    Ok(())
}

fn update_queue_item<F>(app: &tauri::AppHandle, install_id: &str, update: F)
where
    F: FnOnce(&mut ModInstallQueueItem),
{
    let maybe_item = {
        let manager = get_mod_install_manager();
        let Ok(mut guard) = manager.lock() else {
            return;
        };
        let Some(active) = guard.get_mut(install_id) else {
            return;
        };
        update(&mut active.item);
        active.item.last_updated_at = now_unix_secs();
        active.item.progress = active.item.progress.min(100);
        Some(active.item.clone())
    };

    if let Some(item) = maybe_item {
        remember_mod_queue_item(item.clone());
        emit_mod_progress(app, &item);
    }
}

fn emit_mod_progress(app: &tauri::AppHandle, item: &ModInstallQueueItem) {
    let _ = app.emit("mod_install_progress", item);
}

fn read_mod_queue_history() -> Vec<ModInstallQueueItem> {
    local_db::read_collection(MOD_INSTALL_QUEUE_COLLECTION).unwrap_or_default()
}

fn remember_mod_queue_item(item: ModInstallQueueItem) {
    let mut queue = read_mod_queue_history();
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
    let _ = local_db::write_collection(MOD_INSTALL_QUEUE_COLLECTION, &queue, |entry| {
        &entry.install_id
    });
}

fn read_mod_installs() -> Vec<InstalledModInfo> {
    local_db::read_collection(MOD_INSTALLS_COLLECTION).unwrap_or_default()
}

fn persist_mod_manifest(manifest: &ModInstallManifest) -> Result<(), String> {
    let target = PathBuf::from(&manifest.target_path);
    let manifest_path = manifest_file_path(&target, &manifest.install_id);
    if let Some(parent) = manifest_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create manifest directory: {error}"))?;
    }
    let json = serde_json::to_string_pretty(manifest)
        .map_err(|error| format!("Could not encode mod manifest: {error}"))?;
    fs::write(&manifest_path, json)
        .map_err(|error| format!("Could not write mod manifest: {error}"))?;

    let mut installs = read_mod_installs();
    let info = info_from_manifest(manifest.clone());
    if let Some(existing) = installs
        .iter_mut()
        .find(|entry| entry.install_id == manifest.install_id)
    {
        *existing = info;
    } else {
        installs.push(info);
    }
    local_db::write_collection(MOD_INSTALLS_COLLECTION, &installs, |item| &item.install_id)
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
        source_url: manifest.source_url,
        installed_at: manifest.installed_at,
    }
}

async fn download_url_to_package(
    app: &tauri::AppHandle,
    install_id: &str,
    url: &str,
    cancel_rx: &mut watch::Receiver<bool>,
) -> Result<PathBuf, String> {
    let parsed = Url::parse(url).map_err(|error| format!("Invalid mod URL: {error}"))?;
    let staging = mod_staging_dir(install_id)?;
    fs::create_dir_all(&staging)
        .map_err(|error| format!("Could not create staging folder: {error}"))?;
    let package = staging.join(download_file_name(&parsed, install_id));

    update_queue_item(app, install_id, |item| {
        item.status = ModInstallStatus::Downloading;
        item.phase = "download".to_string();
        item.speed = "Connecting".to_string();
        item.progress = 5;
    });

    let response = reqwest::Client::new()
        .get(parsed)
        .send()
        .await
        .map_err(|error| format!("Mod download failed: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("Mod download returned {}", response.status()));
    }
    let total = response.content_length();
    let mut stream = response.bytes_stream();
    let mut file = fs::File::create(&package)
        .map_err(|error| format!("Could not create downloaded mod file: {error}"))?;
    let mut downloaded = 0_u64;

    while let Some(chunk) = stream.next().await {
        if *cancel_rx.borrow() {
            return Err("cancelled".to_string());
        }
        let chunk = chunk.map_err(|error| format!("Could not read mod download chunk: {error}"))?;
        file.write_all(&chunk)
            .map_err(|error| format!("Could not write mod download chunk: {error}"))?;
        downloaded = downloaded.saturating_add(chunk.len() as u64);
        let progress = total
            .map(|value| 5 + (((downloaded as f64 / value.max(1) as f64) * 80.0).round() as u32))
            .unwrap_or(40)
            .min(85);
        update_queue_item(app, install_id, |item| {
            item.progress = progress;
            item.speed = "Downloading".to_string();
            item.bytes_downloaded = Some(downloaded);
            item.bytes_total = total;
        });
    }

    Ok(package)
}

async fn download_url_to_temp(url: &str, install_id: &str) -> Result<PathBuf, String> {
    let parsed = Url::parse(url).map_err(|error| format!("Invalid mod URL: {error}"))?;
    let staging = mod_staging_dir(install_id)?;
    fs::create_dir_all(&staging)
        .map_err(|error| format!("Could not create staging folder: {error}"))?;
    let package = staging.join(download_file_name(&parsed, install_id));
    let bytes = reqwest::get(parsed)
        .await
        .map_err(|error| format!("Download failed: {error}"))?
        .bytes()
        .await
        .map_err(|error| format!("Read body failed: {error}"))?;
    fs::write(&package, bytes).map_err(|error| format!("Write package failed: {error}"))?;
    Ok(package)
}

fn install_package_to_target(
    install_id: &str,
    title: &str,
    package: &Path,
    target: &Path,
) -> Result<Vec<String>, String> {
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
    apply_staged_files(install_id, &extracted, target, &staged_files)?;
    Ok(staged_files)
}

fn extract_zip_safely(zip_path: &Path, target: &Path) -> Result<(), String> {
    let file = fs::File::open(zip_path).map_err(|error| format!("Could not open ZIP: {error}"))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|error| format!("Invalid ZIP: {error}"))?;
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
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("Could not create ZIP entry parent: {error}"))?;
            }
            let mut out_file = fs::File::create(&out_path)
                .map_err(|error| format!("Could not create ZIP entry file: {error}"))?;
            std::io::copy(&mut entry, &mut out_file)
                .map_err(|error| format!("Could not extract ZIP entry: {error}"))?;
        }
    }
    Ok(())
}

fn apply_staged_files(
    install_id: &str,
    extracted: &Path,
    target: &Path,
    files: &[String],
) -> Result<(), String> {
    let backup_root = mod_backup_dir(install_id)?;
    let mut copied = Vec::<PathBuf>::new();
    let mut backups = Vec::<(PathBuf, PathBuf)>::new();

    let result = (|| {
        for relative in files {
            let source = safe_join(extracted, relative)?;
            let destination = safe_join(target, relative)?;
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("Could not create mod file parent: {error}"))?;
            }
            if destination.exists() {
                let backup = safe_join(&backup_root, relative)?;
                if let Some(parent) = backup.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|error| format!("Could not create backup parent: {error}"))?;
                }
                fs::copy(&destination, &backup)
                    .map_err(|error| format!("Could not back up existing mod file: {error}"))?;
                backups.push((destination.clone(), backup));
            }
            fs::copy(&source, &destination)
                .map_err(|error| format!("Could not install mod file {}: {error}", relative))?;
            copied.push(destination);
        }
        Ok::<(), String>(())
    })();

    if let Err(error) = result {
        for path in copied {
            let _ = fs::remove_file(path);
        }
        for (destination, backup) in backups {
            if backup.exists() {
                let _ = fs::copy(backup, destination);
            }
        }
        return Err(error);
    }

    Ok(())
}

fn set_mod_enabled(install_id: &str, enabled: bool) -> Result<InstalledModInfo, String> {
    let install_id = normalize_id(install_id, "installId")?;
    let mut installs = read_mod_installs();
    let index = installs
        .iter()
        .position(|install| install.install_id == install_id)
        .ok_or_else(|| format!("Mod install '{install_id}' was not found."))?;
    let mut install = installs[index].clone();
    if install.enabled == enabled {
        return Ok(install);
    }

    let target = PathBuf::from(&install.target_path);
    let disabled_root = target.join(MOD_DISABLED_DIR).join(&install.install_id);
    if enabled {
        for relative in &install.installed_files {
            let source = safe_join(&disabled_root, relative)?;
            let destination = safe_join(&target, relative)?;
            if !source.exists() {
                continue;
            }
            if destination.exists() {
                return Err(format!(
                    "Cannot enable mod because {} already exists.",
                    destination.display()
                ));
            }
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("Could not restore mod file parent: {error}"))?;
            }
            fs::rename(&source, &destination)
                .map_err(|error| format!("Could not restore disabled mod file: {error}"))?;
        }
    } else {
        for relative in &install.installed_files {
            let source = safe_join(&target, relative)?;
            if !source.exists() {
                continue;
            }
            let destination = safe_join(&disabled_root, relative)?;
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("Could not create disabled mod parent: {error}"))?;
            }
            fs::rename(&source, &destination)
                .map_err(|error| format!("Could not disable mod file: {error}"))?;
        }
    }

    install.enabled = enabled;
    installs[index] = install.clone();
    local_db::write_collection(MOD_INSTALLS_COLLECTION, &installs, |item| &item.install_id)?;
    write_manifest_from_info(&install)?;
    Ok(install)
}

fn write_manifest_from_info(info: &InstalledModInfo) -> Result<(), String> {
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
    };
    let target = PathBuf::from(&manifest.target_path);
    let manifest_path = manifest_file_path(&target, &manifest.install_id);
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
    entries
        .flatten()
        .filter_map(|entry| fs::read_to_string(entry.path()).ok())
        .filter_map(|contents| serde_json::from_str::<ModInstallManifest>(&contents).ok())
        .map(info_from_manifest)
        .collect()
}

fn resolve_target_path(
    game: &crate::commands::games::InstalledGame,
    provider: ModProvider,
    target_policy_id: Option<&str>,
) -> Result<PathBuf, String> {
    if let Some(policy) = target_policy_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if let Some(path) = policy.strip_prefix("manual:") {
            return Ok(PathBuf::from(path.trim()));
        }
    }

    let install_path = game
        .install_path
        .as_deref()
        .map(PathBuf::from)
        .ok_or_else(|| format!("{} has no local install path.", game.title))?;
    if is_restricted_target(&install_path) {
        return Err(
            "This game's install folder is restricted. Use provider delegation or manual import."
                .to_string(),
        );
    }

    match target_policy_id.unwrap_or_default() {
        "root" => Ok(install_path),
        "creation_data" => Ok(install_path.join("Data")),
        "bepinex_plugins" => Ok(install_path.join("BepInEx").join("plugins")),
        "minecraft_mods" | "game_mods" => Ok(install_path.join("mods")),
        "steam_workshop" if provider == ModProvider::SteamWorkshop => {
            Ok(install_path.join("workshop"))
        }
        _ => Ok(auto_target_path(game, provider, &install_path)),
    }
}

fn auto_target_path(
    game: &crate::commands::games::InstalledGame,
    provider: ModProvider,
    install_path: &Path,
) -> PathBuf {
    let title = game.title.to_lowercase();
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
        ModProvider::Modio | ModProvider::Curseforge => input
            .source_url
            .as_deref()
            .is_none_or(|url| !looks_like_download_url(url)),
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
    let lower = value.to_lowercase();
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
    if relative_path.is_absolute()
        || relative.contains("..")
        || relative_path
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err("Refusing unsafe mod file path.".to_string());
    }
    let joined = root.join(relative_path);
    ensure_path_inside_root(&joined, root)?;
    Ok(joined)
}

fn ensure_path_inside_root(path: &Path, root: &Path) -> Result<(), String> {
    let normalized_root = normalize_path(root);
    let normalized_path = normalize_path(path);
    if normalized_path.starts_with(&normalized_root) {
        Ok(())
    } else {
        Err("Refusing to write outside the mod target folder.".to_string())
    }
}

fn normalize_path(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| {
        let mut normalized = PathBuf::new();
        for component in path.components() {
            match component {
                std::path::Component::CurDir => {}
                std::path::Component::ParentDir => {
                    normalized.pop();
                }
                _ => normalized.push(component.as_os_str()),
            }
        }
        normalized
    })
}

fn manifest_file_path(target: &Path, install_id: &str) -> PathBuf {
    target
        .join(MOD_MANIFEST_DIR)
        .join(format!("{}.json", sanitize_file_name(install_id)))
}

fn mod_staging_dir(install_id: &str) -> Result<PathBuf, String> {
    open_game_launcher_data_dir()
        .map(|dir| {
            dir.join("mods")
                .join("staging")
                .join(sanitize_file_name(install_id))
        })
        .ok_or_else(|| "Could not resolve launcher data directory.".to_string())
}

fn mod_backup_dir(install_id: &str) -> Result<PathBuf, String> {
    open_game_launcher_data_dir()
        .map(|dir| {
            dir.join("mods")
                .join("backups")
                .join(sanitize_file_name(install_id))
        })
        .ok_or_else(|| "Could not resolve launcher data directory.".to_string())
}

fn build_install_id(provider: ModProvider, game_id: &str, title: &str) -> String {
    format!(
        "mod-{}-{}-{}-{}",
        provider.as_str(),
        sanitize_file_name(game_id),
        sanitize_file_name(title),
        now_unix_secs()
    )
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
    let expected = expected.trim().to_ascii_lowercase();
    if expected.len() != 64 || !expected.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Err("Configured SHA-256 checksum is invalid.".to_string());
    }
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
    let actual = hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    if actual != expected {
        return Err(format!(
            "SHA-256 verification failed: expected {expected}, got {actual}."
        ));
    }
    Ok(())
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
        assert!(!should_delegate_provider(&native_input));
        assert_eq!(
            delegated_url_for_provider(&native_input).as_deref(),
            Some("https://edge.forgecdn.net/files/ui.zip")
        );
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
