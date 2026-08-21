use crate::commands::games::sha256_file_hex;
use chrono::{DateTime, Duration, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::{
    collections::HashMap,
    env,
    fs::{self, File},
    io::{ErrorKind, Read},
    path::{Path, PathBuf},
    process::Command,
    thread,
};
use sysinfo::{Disks, System};
use tauri::{AppHandle, Emitter};

#[cfg(windows)]
use winreg::{
    enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ},
    RegKey, HKEY,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformClientHealth {
    platform_id: String,
    display_name: String,
    installed: bool,
    running: bool,
    install_path: Option<String>,
    pid: Option<u32>,
    process_name: Option<String>,
    uptime_seconds: Option<u64>,
    window_handle: Option<String>,
    window_title: Option<String>,
    status_label: String,
    can_launch: bool,
    last_checked_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformClientLifecycleEvent {
    event: String,
    platform_id: String,
    display_name: String,
    installed: bool,
    running: bool,
    pid: Option<u32>,
    process_name: Option<String>,
    uptime_seconds: Option<u64>,
    window_handle: Option<String>,
    window_title: Option<String>,
    status_label: String,
    last_checked_at: String,
    occurred_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientPathOverlay {
    id: String,
    label: String,
    source_path: String,
    target_path: String,
    enabled: bool,
    read_only: bool,
    notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientAssetCacheEntry {
    id: String,
    label: String,
    cache_key: String,
    cache_path: String,
    enabled: bool,
    priority: i32,
    notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientModificationConfig {
    platform_id: String,
    display_name: String,
    local_installer_path: Option<String>,
    local_updater_path: Option<String>,
    latest_known_version: Option<String>,
    update_policy: String,
    #[serde(default)]
    path_overlays: Vec<ClientPathOverlay>,
    #[serde(default)]
    asset_caches: Vec<ClientAssetCacheEntry>,
    updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientAssetCacheLookupEntry {
    cache_key: String,
    owner_platform_id: String,
    owner_display_name: String,
    entry_id: String,
    label: String,
    cache_path: String,
    priority: i32,
    conflict_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientAssetCacheConflictEntry {
    owner_platform_id: String,
    owner_display_name: String,
    entry_id: String,
    label: String,
    cache_path: String,
    priority: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientAssetCacheConflict {
    cache_key: String,
    entries: Vec<ClientAssetCacheConflictEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientAssetCacheLookup {
    generated_at: String,
    entries: Vec<ClientAssetCacheLookupEntry>,
    conflicts: Vec<ClientAssetCacheConflict>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientPollingSettings {
    lifecycle_poll_interval_seconds: u64,
    updated_at: Option<String>,
}

impl Default for ClientPollingSettings {
    fn default() -> Self {
        Self {
            lifecycle_poll_interval_seconds: DEFAULT_CLIENT_LIFECYCLE_POLL_INTERVAL_SECONDS,
            updated_at: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientUpdateHistoryItem {
    id: String,
    platform_id: String,
    checked_at: String,
    action: String,
    status: String,
    installed_version: Option<String>,
    latest_known_version: Option<String>,
    message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientUpdateStatus {
    platform_id: String,
    display_name: String,
    installed: bool,
    running: bool,
    installed_version: Option<String>,
    latest_known_version: Option<String>,
    update_available: bool,
    status_label: String,
    detail: String,
    can_open_updater: bool,
    official_download_uri: Option<String>,
    local_updater_path: Option<String>,
    update_policy: String,
    scheduler_enabled: bool,
    last_scheduled_check_at: Option<String>,
    next_scheduled_check_at: Option<String>,
    last_checked_at: String,
    history: Vec<ClientUpdateHistoryItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledClientUpdateChecksResponse {
    checked_at: String,
    next_check_at: Option<String>,
    checked_clients: Vec<ClientUpdateStatus>,
    skipped_clients: Vec<String>,
    update_count: usize,
    message: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientUpdateSchedulerRunStatus {
    checked_at: String,
    #[serde(default, skip_deserializing)]
    checked_clients: Vec<ClientUpdateStatus>,
    success: bool,
    message: String,
    update_count: usize,
    checked_count: usize,
    skipped_count: usize,
    next_check_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientInstallerMetadata {
    platform_id: String,
    display_name: String,
    official_download_uri: Option<String>,
    updater_uri: Option<String>,
    local_installer_path: Option<String>,
    local_updater_path: Option<String>,
    can_open_official_download: bool,
    can_open_local_installer: bool,
    can_open_updater: bool,
    install_action_label: String,
    update_action_label: String,
    install_notes: String,
    update_notes: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientInstallStageCheck {
    label: String,
    status: String,
    detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientInstallStagePlan {
    platform_id: String,
    display_name: String,
    stage: String,
    target_label: String,
    target_uri: Option<String>,
    target_path: Option<String>,
    can_proceed: bool,
    requires_user_consent: bool,
    requires_license_review: bool,
    requires_admin_review: bool,
    checks: Vec<ClientInstallStageCheck>,
    message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientAutoApplyCheck {
    label: String,
    status: String,
    detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientAutoApplyPlan {
    platform_id: String,
    display_name: String,
    policy: String,
    stage: String,
    safe_target_label: Option<String>,
    can_auto_apply: bool,
    can_open_safe_updater: bool,
    allows_silent_execution: bool,
    requires_provider_mechanism: bool,
    requires_user_consent: bool,
    checks: Vec<ClientAutoApplyCheck>,
    message: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientManagerAutoApplyCapabilityRequest {
    platform_id: String,
    install_target_path: Option<String>,
    required_disk_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientManagerAutoApplyCapabilityCheck {
    id: String,
    label: String,
    status: String,
    detail: String,
    evidence: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientManagerAutoApplyCapabilityPreview {
    platform_id: String,
    display_name: String,
    generated_at: String,
    target_path: Option<String>,
    required_disk_bytes: u64,
    available_disk_bytes: Option<u64>,
    disk_mount_point: Option<String>,
    auto_apply_stage: String,
    can_auto_apply: bool,
    checks: Vec<ClientManagerAutoApplyCapabilityCheck>,
    message: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientManagerMountApplySandboxConsent {
    accepted: bool,
    source_path: String,
    target_path: String,
    operation: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientManagerMountApplySandboxRequest {
    source_path: String,
    target_path: String,
    consent: ClientManagerMountApplySandboxConsent,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientManagerMountApplySandboxFile {
    relative_path: String,
    size_bytes: u64,
    sha256: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientManagerMountApplySandboxProof {
    proof_id: String,
    source_path: String,
    target_path: String,
    manifest_path: String,
    file_count: usize,
    bytes_copied: u64,
    verified_files: usize,
    rollback_verified: bool,
    target_created: bool,
    symlink_free: bool,
    provider_paths_touched: bool,
    admin_elevation_used: bool,
    mounted_paths_created: bool,
    files: Vec<ClientManagerMountApplySandboxFile>,
    message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientManagerActionResult {
    platform_id: String,
    action: String,
    opened_target: String,
    message: String,
    history_item: ClientUpdateHistoryItem,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClientManagerStore {
    #[serde(default)]
    polling_settings: ClientPollingSettings,
    #[serde(default)]
    configs: Vec<ClientModificationConfig>,
    #[serde(default)]
    update_history: Vec<ClientUpdateHistoryItem>,
}

struct ClientDefinition {
    platform_id: &'static str,
    display_name: &'static str,
    process_names: &'static [&'static str],
    launch_uri: Option<&'static str>,
    official_download_uri: Option<&'static str>,
    updater_uri: Option<&'static str>,
    update_notes: &'static str,
}

const CLIENT_MANAGER_DIR: &str = "open-game-launcher";
const CLIENT_MANAGER_FILE: &str = "client-manager.json";
const CLIENT_MANAGER_LOCAL_TARGETS_DIR: &str = "client-manager-local-targets";
const CLIENT_UPDATE_SCHEDULER_STATUS_FILE: &str = "client-update-scheduler-status.json";
const HEADLESS_CLIENT_UPDATE_SCHEDULER_ARG: &str = "--og-client-update-scheduler-run";
#[cfg(any(target_os = "linux", test))]
const LINUX_CLIENT_UPDATE_SERVICE_FILE: &str = "og-launcher-client-updates.service";
#[cfg(target_os = "linux")]
const LINUX_CLIENT_UPDATE_TIMER_FILE: &str = "og-launcher-client-updates.timer";
#[cfg(target_os = "macos")]
const MACOS_CLIENT_UPDATE_LAUNCH_AGENT_FILE: &str = "com.opengamelauncher.client-updates.plist";
#[cfg(target_os = "windows")]
const WINDOWS_CLIENT_UPDATE_TASK_NAME: &str = "OG Launcher Client Updates";
const DEFAULT_UPDATE_POLICY: &str = "manual";
const OPEN_CLIENT_UPDATE_POLICY: &str = "openClient";
const AUTO_APPLY_UPDATE_POLICY: &str = "autoApply";
const SCHEDULED_UPDATE_ACTION: &str = "scheduled_update_checked";
const CLIENT_UPDATE_CHECK_INTERVAL_HOURS: i64 = 24;
const DEFAULT_CLIENT_LIFECYCLE_POLL_INTERVAL_SECONDS: u64 = 10;
const MIN_CLIENT_LIFECYCLE_POLL_INTERVAL_SECONDS: u64 = 5;
const MAX_CLIENT_LIFECYCLE_POLL_INTERVAL_SECONDS: u64 = 120;
const MAX_CONFIG_PATH_ENTRIES: usize = 20;
const MAX_HISTORY_ITEMS_PER_CLIENT: usize = 20;
const MAX_TEXT_FIELD_LENGTH: usize = 1024;
const CLIENT_MANAGER_AUTO_APPLY_CAPABILITY_DEFAULT_REQUIRED_BYTES: u64 = 40 * 1024 * 1024 * 1024;
const CLIENT_MANAGER_SANDBOX_OPERATION: &str = "client_manager_mount_apply_sandbox_proof";
const CLIENT_MANAGER_SANDBOX_MANIFEST_FILE: &str = "og-client-manager-sandbox-manifest.json";
const CLIENT_MANAGER_SANDBOX_MAX_FILES: usize = 64;
const CLIENT_MANAGER_SANDBOX_MAX_DEPTH: usize = 8;

const CLIENTS: &[ClientDefinition] = &[
    ClientDefinition {
        platform_id: "steam",
        display_name: "Steam",
        process_names: &["steam", "steam.exe", "steamwebhelper", "steamwebhelper.exe"],
        launch_uri: Some("steam://open/main"),
        official_download_uri: Some("https://store.steampowered.com/about/"),
        updater_uri: Some("steam://open/settings/downloads"),
        update_notes: "Steam updates itself from the official client when launched.",
    },
    ClientDefinition {
        platform_id: "epic",
        display_name: "Epic Games",
        process_names: &[
            "EpicGamesLauncher",
            "EpicGamesLauncher.exe",
            "EpicWebHelper",
            "EpicWebHelper.exe",
        ],
        launch_uri: Some("com.epicgames.launcher://store"),
        official_download_uri: Some("https://store.epicgames.com/download"),
        updater_uri: Some("com.epicgames.launcher://store"),
        update_notes: "Epic Games Store updates automatically when the desktop client starts.",
    },
    ClientDefinition {
        platform_id: "gog",
        display_name: "GOG Galaxy",
        process_names: &[
            "GalaxyClient",
            "GalaxyClient.exe",
            "GalaxyClient Helper",
            "GalaxyClient Helper.exe",
        ],
        launch_uri: Some("goggalaxy://openLibrary"),
        official_download_uri: Some("https://www.gog.com/galaxy"),
        updater_uri: Some("goggalaxy://openLibrary"),
        update_notes: "GOG Galaxy handles desktop updates inside the official client.",
    },
    ClientDefinition {
        platform_id: "xbox",
        display_name: "Xbox",
        process_names: &[
            "XboxPcApp",
            "XboxPcApp.exe",
            "XboxApp",
            "XboxApp.exe",
            "GamingServices",
            "GamingServices.exe",
        ],
        launch_uri: Some("ms-xbl-38966778-3f57-4f6e-a6e9-3b81c79fbb3f://"),
        official_download_uri: Some("https://www.xbox.com/apps/xbox-app-for-pc"),
        updater_uri: None,
        update_notes: "Xbox app updates are managed by Microsoft Store/Gaming Services.",
    },
    ClientDefinition {
        platform_id: "ubisoft",
        display_name: "Ubisoft Connect",
        process_names: &[
            "upc",
            "upc.exe",
            "UbisoftConnect",
            "UbisoftConnect.exe",
            "UbisoftGameLauncher",
            "UbisoftGameLauncher.exe",
            "Uplay",
            "Uplay.exe",
        ],
        launch_uri: Some("uplay://open"),
        official_download_uri: Some("https://www.ubisoft.com/en-us/ubisoft-connect/download"),
        updater_uri: Some("uplay://open"),
        update_notes: "Ubisoft Connect applies official updates through its desktop client.",
    },
    ClientDefinition {
        platform_id: "battlenet",
        display_name: "Battle.net",
        process_names: &["Battle.net", "Battle.net.exe", "Battle.net Helper"],
        launch_uri: Some("battlenet://"),
        official_download_uri: Some("https://download.battle.net/en-us/desktop"),
        updater_uri: Some("battlenet://"),
        update_notes: "Battle.net updates itself after the official client is opened.",
    },
    ClientDefinition {
        platform_id: "ea",
        display_name: "EA app",
        process_names: &[
            "EADesktop",
            "EADesktop.exe",
            "EALauncher",
            "EALauncher.exe",
            "EA app",
            "EA app.exe",
            "Origin",
            "Origin.exe",
        ],
        launch_uri: Some("origin2://"),
        official_download_uri: Some("https://www.ea.com/ea-app"),
        updater_uri: Some("origin2://"),
        update_notes: "EA app updates are handled by the official desktop client.",
    },
];

#[tauri::command]
pub fn poll_platform_client_health() -> Vec<PlatformClientHealth> {
    let now = Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true);
    let mut system = System::new_all();
    system.refresh_processes_specifics(
        sysinfo::ProcessesToUpdate::All,
        true,
        sysinfo::ProcessRefreshKind::nothing().with_exe(sysinfo::UpdateKind::Always),
    );
    let process_windows = collect_process_windows();

    CLIENTS
        .iter()
        .map(|client| {
            let running_process = find_running_process(client, &system, &process_windows);
            let running = running_process.is_some();
            let install_path = running_process
                .as_ref()
                .and_then(|process| process.install_path.clone())
                .or_else(|| detect_client_install_path(client.platform_id));
            let installed =
                running || install_path.is_some() || has_install_signal(client.platform_id);
            let pid = running_process.as_ref().and_then(|process| process.pid);
            let process_name = running_process
                .as_ref()
                .map(|process| process.process_name.clone());
            let uptime_seconds = running_process
                .as_ref()
                .and_then(|process| process.uptime_seconds);
            let window_handle = running_process
                .as_ref()
                .and_then(|process| process.window.as_ref().map(|window| window.handle.clone()));
            let window_title = running_process.as_ref().and_then(|process| {
                process
                    .window
                    .as_ref()
                    .and_then(|window| window.title.clone())
            });
            let status_label = if running {
                "Running"
            } else if installed {
                "Available"
            } else {
                "Missing"
            };

            PlatformClientHealth {
                platform_id: client.platform_id.to_string(),
                display_name: client.display_name.to_string(),
                installed,
                running,
                install_path,
                pid,
                process_name,
                uptime_seconds,
                window_handle,
                window_title,
                status_label: status_label.to_string(),
                can_launch: client.launch_uri.is_some(),
                last_checked_at: now.clone(),
            }
        })
        .collect()
}

pub fn start_platform_client_event_poller(app_handle: AppHandle) {
    thread::spawn(move || {
        let mut previous = platform_client_health_by_id(poll_platform_client_health());

        loop {
            thread::sleep(std::time::Duration::from_secs(
                client_lifecycle_poll_interval_seconds(),
            ));

            let current_health = poll_platform_client_health();
            for health in &current_health {
                if let Some(previous_health) = previous.get(&health.platform_id) {
                    if let Some(event) =
                        client_lifecycle_event_for_transition(previous_health, health)
                    {
                        let _ = app_handle.emit(event.event.as_str(), &event);
                    }
                }
            }

            previous = platform_client_health_by_id(current_health);
        }
    });
}

fn platform_client_health_by_id(
    statuses: Vec<PlatformClientHealth>,
) -> HashMap<String, PlatformClientHealth> {
    statuses
        .into_iter()
        .map(|status| (status.platform_id.clone(), status))
        .collect()
}

fn missing_platform_client_health(
    client: &ClientDefinition,
    last_checked_at: String,
) -> PlatformClientHealth {
    PlatformClientHealth {
        platform_id: client.platform_id.to_string(),
        display_name: client.display_name.to_string(),
        installed: false,
        running: false,
        install_path: None,
        pid: None,
        process_name: None,
        uptime_seconds: None,
        window_handle: None,
        window_title: None,
        status_label: "Missing".to_string(),
        can_launch: client.launch_uri.is_some(),
        last_checked_at,
    }
}

fn client_lifecycle_event_for_transition(
    previous: &PlatformClientHealth,
    current: &PlatformClientHealth,
) -> Option<PlatformClientLifecycleEvent> {
    let event = match (previous.running, current.running) {
        (false, true) => "client_started",
        (true, false) => "client_stopped",
        (true, true)
            if previous.window_handle != current.window_handle
                || previous.window_title != current.window_title =>
        {
            "client_window_updated"
        }
        _ => return None,
    };

    let event_process = if current.running { current } else { previous };

    Some(PlatformClientLifecycleEvent {
        event: event.to_string(),
        platform_id: current.platform_id.clone(),
        display_name: current.display_name.clone(),
        installed: current.installed,
        running: current.running,
        pid: event_process.pid,
        process_name: event_process.process_name.clone(),
        uptime_seconds: event_process.uptime_seconds,
        window_handle: event_process.window_handle.clone(),
        window_title: event_process.window_title.clone(),
        status_label: current.status_label.clone(),
        last_checked_at: current.last_checked_at.clone(),
        occurred_at: current.last_checked_at.clone(),
    })
}

#[tauri::command]
pub fn launch_platform_client(platform_id: String) -> Result<(), String> {
    let client = CLIENTS
        .iter()
        .find(|candidate| candidate.platform_id == platform_id.trim())
        .ok_or_else(|| format!("Unsupported platform client: {platform_id}"))?;
    let uri = client
        .launch_uri
        .ok_or_else(|| format!("No launch URI is known for {}", client.display_name))?;

    crate::commands::uri_safety::open_uri_safely(uri)
}

#[tauri::command]
pub fn get_platform_client_installer_metadata(
    platform_id: String,
) -> Result<ClientInstallerMetadata, String> {
    let client = supported_client(&platform_id)?;
    let store = read_client_manager_store()?;
    let config = config_for_client(&store, client);
    Ok(client_installer_metadata(client, &config))
}

#[tauri::command]
pub fn preview_platform_client_install(
    platform_id: String,
) -> Result<ClientInstallStagePlan, String> {
    let client = supported_client(&platform_id)?;
    let store = read_client_manager_store()?;
    let config = config_for_client(&store, client);
    let metadata = client_installer_metadata(client, &config);
    let health = health_for_client(client);
    Ok(build_install_stage_plan(client, &metadata, &health))
}

#[tauri::command]
pub fn get_platform_client_modification_config(
    platform_id: String,
) -> Result<ClientModificationConfig, String> {
    let client = supported_client(&platform_id)?;
    let store = read_client_manager_store()?;
    Ok(config_for_client(&store, client))
}

#[tauri::command]
pub fn save_platform_client_modification_config(
    input: ClientModificationConfig,
) -> Result<ClientModificationConfig, String> {
    let client = supported_client(&input.platform_id)?;
    let mut store = read_client_manager_store()?;
    let config = normalize_client_config(input, client, Some(now_iso()))?;

    store
        .configs
        .retain(|existing| existing.platform_id != client.platform_id);
    store.configs.push(config.clone());
    write_client_manager_store(&store)?;

    Ok(config)
}

#[tauri::command]
pub fn get_platform_client_asset_cache_lookup() -> Result<ClientAssetCacheLookup, String> {
    let store = read_client_manager_store()?;
    Ok(build_asset_cache_lookup(&store, Utc::now()))
}

#[tauri::command]
pub fn get_platform_client_polling_settings() -> Result<ClientPollingSettings, String> {
    let store = read_client_manager_store()?;
    Ok(normalize_client_polling_settings(
        store.polling_settings,
        None,
    ))
}

#[tauri::command]
pub fn save_platform_client_polling_settings(
    input: ClientPollingSettings,
) -> Result<ClientPollingSettings, String> {
    let mut store = read_client_manager_store()?;
    let settings = normalize_client_polling_settings(input, Some(now_iso()));
    store.polling_settings = settings.clone();
    write_client_manager_store(&store)?;
    Ok(settings)
}

#[tauri::command]
pub fn get_platform_client_update_status(
    platform_id: String,
) -> Result<ClientUpdateStatus, String> {
    let client = supported_client(&platform_id)?;
    let store = read_client_manager_store()?;
    Ok(build_update_status(client, &store, Utc::now()))
}

#[tauri::command]
pub fn preview_platform_client_auto_apply(
    platform_id: String,
) -> Result<ClientAutoApplyPlan, String> {
    let client = supported_client(&platform_id)?;
    let store = read_client_manager_store()?;
    let config = config_for_client(&store, client);
    let status = build_update_status(client, &store, Utc::now());
    Ok(build_auto_apply_plan(client, &config, &status))
}

#[tauri::command]
pub fn preview_client_manager_auto_apply_capabilities(
    input: ClientManagerAutoApplyCapabilityRequest,
) -> Result<ClientManagerAutoApplyCapabilityPreview, String> {
    let client = supported_client(&input.platform_id)?;
    let store = read_client_manager_store()?;
    let config = config_for_client(&store, client);
    let status = build_update_status(client, &store, Utc::now());
    let plan = build_auto_apply_plan(client, &config, &status);
    let health = poll_platform_client_health()
        .into_iter()
        .find(|candidate| candidate.platform_id == client.platform_id)
        .unwrap_or_else(|| missing_platform_client_health(client, iso_datetime(Utc::now())));
    let target_path = resolve_client_manager_auto_apply_capability_target(&input, &config, &health);
    let disk = target_path
        .as_deref()
        .and_then(client_manager_auto_apply_capability_disk_for_path);
    let required_disk_bytes = input
        .required_disk_bytes
        .unwrap_or(CLIENT_MANAGER_AUTO_APPLY_CAPABILITY_DEFAULT_REQUIRED_BYTES);

    Ok(build_client_manager_auto_apply_capability_preview(
        client,
        &health,
        &plan,
        target_path,
        disk,
        required_disk_bytes,
        iso_datetime(Utc::now()),
    ))
}

#[tauri::command]
pub fn prove_client_manager_mount_apply_sandbox(
    input: ClientManagerMountApplySandboxRequest,
) -> Result<ClientManagerMountApplySandboxProof, String> {
    run_client_manager_mount_apply_sandbox_proof(input)
}

#[tauri::command]
pub fn check_platform_client_update(platform_id: String) -> Result<ClientUpdateStatus, String> {
    let client = supported_client(&platform_id)?;
    let mut store = read_client_manager_store()?;
    let now = Utc::now();
    let status = build_update_status(client, &store, now);
    let history_item = update_history_item(
        client,
        "update_checked",
        &status.status_label,
        status.installed_version.clone(),
        status.latest_known_version.clone(),
        status.detail.clone(),
        iso_datetime(now),
    );
    remember_update_history(&mut store, history_item);
    write_client_manager_store(&store)?;

    Ok(build_update_status(client, &store, Utc::now()))
}

#[tauri::command]
pub fn run_scheduled_platform_client_update_checks(
) -> Result<ScheduledClientUpdateChecksResponse, String> {
    let mut store = read_client_manager_store()?;
    let now = Utc::now();
    let mut checked_platform_ids = Vec::new();
    let mut skipped_clients = Vec::new();

    for client in CLIENTS {
        let config = config_for_client(&store, client);
        if !client_update_scheduler_enabled(&config.update_policy) {
            skipped_clients.push(format!("{}: manual policy", client.display_name));
            continue;
        }

        if !client_update_check_due(&store, client.platform_id, now) {
            skipped_clients.push(format!("{}: scheduled later", client.display_name));
            continue;
        }

        let status = build_update_status(client, &store, now);
        let history_item = scheduled_update_history_item(
            client,
            &config,
            &status,
            iso_datetime(now),
            open_resolved_client_target,
        );
        remember_update_history(&mut store, history_item);
        checked_platform_ids.push(client.platform_id);
    }

    if !checked_platform_ids.is_empty() {
        write_client_manager_store(&store)?;
    }

    let checked_clients = checked_platform_ids
        .iter()
        .filter_map(|platform_id| {
            CLIENTS
                .iter()
                .find(|client| client.platform_id == *platform_id)
                .map(|client| build_update_status(client, &store, now))
        })
        .collect::<Vec<_>>();
    let update_count = checked_clients
        .iter()
        .filter(|status| status.update_available)
        .count();
    let next_check_at = next_global_scheduled_check_at(&store, now).map(iso_datetime);
    let message = if checked_clients.is_empty() {
        "No scheduled platform-client update checks were due.".to_string()
    } else if update_count == 0 {
        format!(
            "{} scheduled platform-client check(s) completed.",
            checked_clients.len()
        )
    } else {
        format!("{update_count} platform client update(s) may be available.")
    };

    Ok(ScheduledClientUpdateChecksResponse {
        checked_at: iso_datetime(now),
        next_check_at,
        checked_clients,
        skipped_clients,
        update_count,
        message,
    })
}

pub fn run_headless_client_update_scheduler_from_args() -> Option<i32> {
    let requested = env::args().any(|argument| argument == HEADLESS_CLIENT_UPDATE_SCHEDULER_ARG);
    if !requested {
        return None;
    }

    let exit_code = match run_configured_client_update_scheduler() {
        Ok(status) if status.success => 0,
        Ok(status) => {
            eprintln!("{}", status.message);
            1
        }
        Err(error) => {
            let _ = write_client_update_scheduler_run_status(&ClientUpdateSchedulerRunStatus {
                checked_at: now_iso(),
                checked_clients: Vec::new(),
                checked_count: 0,
                message: error.clone(),
                next_check_at: None,
                skipped_count: 0,
                success: false,
                update_count: 0,
            });
            eprintln!("{error}");
            1
        }
    };

    Some(exit_code)
}

#[tauri::command]
pub fn open_platform_client_installer(
    platform_id: String,
) -> Result<ClientManagerActionResult, String> {
    let client = supported_client(&platform_id)?;
    open_client_manager_target(client, "installer_opened")
}

#[tauri::command]
pub fn open_platform_client_updater(
    platform_id: String,
) -> Result<ClientManagerActionResult, String> {
    let client = supported_client(&platform_id)?;
    open_client_manager_target(client, "updater_opened")
}

fn supported_client(platform_id: &str) -> Result<&'static ClientDefinition, String> {
    let requested = platform_id.trim();
    CLIENTS
        .iter()
        .find(|candidate| candidate.platform_id == requested)
        .ok_or_else(|| format!("Unsupported platform client: {platform_id}"))
}

#[derive(Debug, Clone)]
struct ResolvedClientManagerMountApplySandbox {
    source_path: PathBuf,
    target_path: PathBuf,
    target_created: bool,
}

#[derive(Debug, Clone)]
struct CollectedClientManagerMountApplySandboxFile {
    source_path: PathBuf,
    relative_path: String,
    size_bytes: u64,
}

fn run_client_manager_mount_apply_sandbox_proof(
    input: ClientManagerMountApplySandboxRequest,
) -> Result<ClientManagerMountApplySandboxProof, String> {
    validate_client_manager_mount_apply_sandbox_consent(&input)?;
    let resolved = resolve_client_manager_mount_apply_sandbox(&input)?;
    let files = collect_client_manager_mount_apply_sandbox_files(
        &resolved.source_path,
        &resolved.source_path,
        0,
    )?;
    if files.is_empty() {
        return Err("Client Manager sandbox source does not contain copyable files.".to_string());
    }
    if files.len() > CLIENT_MANAGER_SANDBOX_MAX_FILES {
        return Err(format!(
            "Client Manager sandbox source contains too many files; limit is {CLIENT_MANAGER_SANDBOX_MAX_FILES}."
        ));
    }

    fs::create_dir_all(&resolved.target_path)
        .map_err(|error| format!("Could not create Client Manager sandbox target: {error}"))?;

    let proof_id = uuid::Uuid::new_v4().to_string();
    let mut copied_files = Vec::with_capacity(files.len());
    let mut created_dirs = Vec::<PathBuf>::new();
    let mut bytes_copied = 0_u64;

    let copy_result = (|| {
        for file in &files {
            let target_file =
                client_manager_sandbox_target_file(&resolved.target_path, &file.relative_path)?;
            if target_file.exists() {
                return Err(format!(
                    "Client Manager sandbox target file already exists: {}.",
                    file.relative_path
                ));
            }
            if let Some(parent) = target_file.parent() {
                create_client_manager_sandbox_dir(parent, &mut created_dirs)?;
            }
            fs::copy(&file.source_path, &target_file)
                .map_err(|error| format!("Could not copy sandbox file: {error}"))?;
            let source_hash = sha256_file_hex(&file.source_path)?;
            let target_hash = sha256_file_hex(&target_file)?;
            if source_hash != target_hash {
                return Err(format!(
                    "Client Manager sandbox copy hash mismatch for {}.",
                    file.relative_path
                ));
            }
            bytes_copied += file.size_bytes;
            copied_files.push(ClientManagerMountApplySandboxFile {
                relative_path: file.relative_path.clone(),
                size_bytes: file.size_bytes,
                sha256: target_hash,
            });
        }

        let manifest_path = resolved
            .target_path
            .join(CLIENT_MANAGER_SANDBOX_MANIFEST_FILE);
        write_client_manager_sandbox_manifest(&manifest_path, &proof_id, &copied_files)?;
        let mut manifest_body = String::new();
        File::open(&manifest_path)
            .and_then(|mut file| file.read_to_string(&mut manifest_body))
            .map_err(|error| format!("Could not read sandbox manifest after write: {error}"))?;
        if !manifest_body.contains(&proof_id) {
            return Err("Client Manager sandbox manifest readback missed proof id.".to_string());
        }

        Ok(path_to_lossy_string(&manifest_path))
    })();

    let manifest_path = match copy_result {
        Ok(manifest_path) => manifest_path,
        Err(error) => {
            let _ = rollback_client_manager_sandbox(
                &resolved.target_path,
                &copied_files,
                &created_dirs,
                resolved.target_created,
            );
            return Err(error);
        }
    };
    rollback_client_manager_sandbox(
        &resolved.target_path,
        &copied_files,
        &created_dirs,
        resolved.target_created,
    )?;
    verify_client_manager_sandbox_rollback(&resolved.target_path, resolved.target_created)?;

    Ok(ClientManagerMountApplySandboxProof {
        proof_id,
        source_path: path_to_lossy_string(&resolved.source_path),
        target_path: path_to_lossy_string(&resolved.target_path),
        manifest_path,
        file_count: copied_files.len(),
        bytes_copied,
        verified_files: copied_files.len(),
        rollback_verified: true,
        target_created: resolved.target_created,
        symlink_free: true,
        provider_paths_touched: false,
        admin_elevation_used: false,
        mounted_paths_created: false,
        files: copied_files,
        message: "Client Manager sandbox proof copied files, wrote a local manifest, verified hashes, and rolled back only sandbox-owned files without touching provider client paths."
            .to_string(),
    })
}

fn validate_client_manager_mount_apply_sandbox_consent(
    input: &ClientManagerMountApplySandboxRequest,
) -> Result<(), String> {
    if !input.consent.accepted {
        return Err("Client Manager sandbox proof requires explicit consent.".to_string());
    }
    if input.consent.operation.trim() != CLIENT_MANAGER_SANDBOX_OPERATION {
        return Err("Client Manager sandbox consent operation mismatch.".to_string());
    }
    if input.consent.source_path.trim() != input.source_path.trim() {
        return Err("Client Manager sandbox consent source mismatch.".to_string());
    }
    if input.consent.target_path.trim() != input.target_path.trim() {
        return Err("Client Manager sandbox consent target mismatch.".to_string());
    }
    Ok(())
}

fn resolve_client_manager_mount_apply_sandbox(
    input: &ClientManagerMountApplySandboxRequest,
) -> Result<ResolvedClientManagerMountApplySandbox, String> {
    let source_path = PathBuf::from(input.source_path.trim());
    let target_path = PathBuf::from(input.target_path.trim());
    if !source_path.is_absolute() || !target_path.is_absolute() {
        return Err(
            "Client Manager sandbox proof requires absolute source and target paths.".to_string(),
        );
    }
    if path_is_root(&source_path) || path_is_root(&target_path) {
        return Err("Client Manager sandbox proof refuses filesystem roots.".to_string());
    }
    if is_path_symlink(&source_path)? {
        return Err("Client Manager sandbox source root must not be a symlink.".to_string());
    }
    let source_metadata = fs::metadata(&source_path)
        .map_err(|error| format!("Could not inspect Client Manager sandbox source: {error}"))?;
    if !source_metadata.is_dir() {
        return Err("Client Manager sandbox source must be a directory.".to_string());
    }

    let source_canonical = source_path
        .canonicalize()
        .map_err(|error| format!("Could not canonicalize sandbox source: {error}"))?;
    let target_created = !target_path.exists();
    let target_compare_path = if target_created {
        let parent = target_path
            .parent()
            .ok_or_else(|| "Client Manager sandbox target must have a parent.".to_string())?;
        if !parent.exists() {
            return Err("Client Manager sandbox target parent must exist.".to_string());
        }
        if is_path_symlink(parent)? {
            return Err("Client Manager sandbox target parent must not be a symlink.".to_string());
        }
        let file_name = target_path
            .file_name()
            .ok_or_else(|| "Client Manager sandbox target must name a directory.".to_string())?;
        parent
            .canonicalize()
            .map_err(|error| format!("Could not canonicalize sandbox target parent: {error}"))?
            .join(file_name)
    } else {
        if is_path_symlink(&target_path)? {
            return Err("Client Manager sandbox target root must not be a symlink.".to_string());
        }
        let target_metadata = fs::metadata(&target_path)
            .map_err(|error| format!("Could not inspect Client Manager sandbox target: {error}"))?;
        if !target_metadata.is_dir() {
            return Err("Client Manager sandbox target must be a directory.".to_string());
        }
        if fs::read_dir(&target_path)
            .map_err(|error| format!("Could not read Client Manager sandbox target: {error}"))?
            .next()
            .is_some()
        {
            return Err("Client Manager sandbox target must be empty before proof.".to_string());
        }
        target_path
            .canonicalize()
            .map_err(|error| format!("Could not canonicalize sandbox target: {error}"))?
    };

    if source_canonical == target_compare_path
        || target_compare_path.starts_with(&source_canonical)
        || source_canonical.starts_with(&target_compare_path)
    {
        return Err(
            "Client Manager sandbox source and target must be separate directories.".to_string(),
        );
    }

    Ok(ResolvedClientManagerMountApplySandbox {
        source_path,
        target_path,
        target_created,
    })
}

fn collect_client_manager_mount_apply_sandbox_files(
    base_root: &Path,
    current_root: &Path,
    depth: usize,
) -> Result<Vec<CollectedClientManagerMountApplySandboxFile>, String> {
    if depth > CLIENT_MANAGER_SANDBOX_MAX_DEPTH {
        return Err(
            "Client Manager sandbox source is nested deeper than the proof limit.".to_string(),
        );
    }

    let mut files = Vec::new();
    for entry in fs::read_dir(current_root)
        .map_err(|error| format!("Could not read sandbox source: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Could not inspect sandbox entry: {error}"))?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)
            .map_err(|error| format!("Could not inspect sandbox entry metadata: {error}"))?;
        if metadata.file_type().is_symlink() {
            return Err(
                "Client Manager sandbox proof refuses symlinked source entries.".to_string(),
            );
        }
        if metadata.is_dir() {
            files.extend(collect_client_manager_mount_apply_sandbox_files(
                base_root,
                &path,
                depth + 1,
            )?);
        } else if metadata.is_file() {
            let relative_path = path
                .strip_prefix(base_root)
                .map_err(|_| "Could not normalize sandbox file path.".to_string())?;
            let relative_path = relative_path_to_slash_path(relative_path)?;
            files.push(CollectedClientManagerMountApplySandboxFile {
                source_path: path,
                relative_path,
                size_bytes: metadata.len(),
            });
        }
    }
    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(files)
}

fn create_client_manager_sandbox_dir(
    path: &Path,
    created_dirs: &mut Vec<PathBuf>,
) -> Result<(), String> {
    if path.exists() {
        if is_path_symlink(path)? {
            return Err(
                "Client Manager sandbox target directory must not be a symlink.".to_string(),
            );
        }
        return Ok(());
    }
    create_client_manager_sandbox_dir(
        path.parent()
            .ok_or_else(|| "Client Manager sandbox target directory has no parent.".to_string())?,
        created_dirs,
    )?;
    fs::create_dir(path)
        .map_err(|error| format!("Could not create sandbox target directory: {error}"))?;
    created_dirs.push(path.to_path_buf());
    Ok(())
}

fn client_manager_sandbox_target_file(
    target_root: &Path,
    relative_path: &str,
) -> Result<PathBuf, String> {
    let mut path = target_root.to_path_buf();
    for component in relative_path.split('/') {
        if component.is_empty() || component == "." || component == ".." {
            return Err("Client Manager sandbox relative path is unsafe.".to_string());
        }
        path.push(component);
    }
    Ok(path)
}

fn write_client_manager_sandbox_manifest(
    manifest_path: &Path,
    proof_id: &str,
    files: &[ClientManagerMountApplySandboxFile],
) -> Result<(), String> {
    let manifest = serde_json::json!({
        "proofId": proof_id,
        "createdAt": now_iso(),
        "operation": CLIENT_MANAGER_SANDBOX_OPERATION,
        "files": files,
        "guard": {
            "providerPathsTouched": false,
            "adminElevationUsed": false,
            "mountedPathsCreated": false
        }
    });
    let body = serde_json::to_string_pretty(&manifest)
        .map_err(|error| format!("Could not serialize sandbox manifest: {error}"))?;
    fs::write(manifest_path, body)
        .map_err(|error| format!("Could not write sandbox manifest: {error}"))
}

fn rollback_client_manager_sandbox(
    target_root: &Path,
    copied_files: &[ClientManagerMountApplySandboxFile],
    created_dirs: &[PathBuf],
    remove_target_root: bool,
) -> Result<(), String> {
    let manifest_path = target_root.join(CLIENT_MANAGER_SANDBOX_MANIFEST_FILE);
    match fs::remove_file(&manifest_path) {
        Ok(()) => {}
        Err(error) if error.kind() == ErrorKind::NotFound => {}
        Err(error) => {
            return Err(format!(
                "Could not remove sandbox manifest during rollback: {error}"
            ));
        }
    }

    for file in copied_files.iter().rev() {
        let target_file = client_manager_sandbox_target_file(target_root, &file.relative_path)?;
        match fs::remove_file(&target_file) {
            Ok(()) => {}
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(error) => {
                return Err(format!(
                    "Could not remove sandbox file during rollback: {error}"
                ));
            }
        }
    }

    for directory in created_dirs.iter().rev() {
        match fs::remove_dir(directory) {
            Ok(()) => {}
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(error) => {
                return Err(format!(
                    "Could not remove sandbox directory during rollback: {error}"
                ));
            }
        }
    }

    if remove_target_root {
        match fs::remove_dir(target_root) {
            Ok(()) => {}
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(error) => {
                return Err(format!(
                    "Could not remove sandbox target root during rollback: {error}"
                ));
            }
        }
    }
    Ok(())
}

fn verify_client_manager_sandbox_rollback(
    target_root: &Path,
    target_removed: bool,
) -> Result<(), String> {
    if target_removed {
        if target_root.exists() {
            return Err("Client Manager sandbox target still exists after rollback.".to_string());
        }
        return Ok(());
    }
    if fs::read_dir(target_root)
        .map_err(|error| format!("Could not verify sandbox rollback target: {error}"))?
        .next()
        .is_some()
    {
        return Err("Client Manager sandbox target is not empty after rollback.".to_string());
    }
    Ok(())
}

fn is_path_symlink(path: &Path) -> Result<bool, String> {
    fs::symlink_metadata(path)
        .map(|metadata| metadata.file_type().is_symlink())
        .map_err(|error| format!("Could not inspect Client Manager path: {error}"))
}

fn path_is_root(path: &Path) -> bool {
    path.components()
        .all(|component| !matches!(component, std::path::Component::Normal(_)))
}

fn path_to_lossy_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn relative_path_to_slash_path(path: &Path) -> Result<String, String> {
    let mut parts = Vec::new();
    for component in path.components() {
        match component {
            std::path::Component::Normal(value) => {
                parts.push(value.to_string_lossy().to_string());
            }
            _ => return Err("Client Manager sandbox relative path is unsafe.".to_string()),
        }
    }
    if parts.is_empty() {
        return Err("Client Manager sandbox relative path is empty.".to_string());
    }
    Ok(parts.join("/"))
}

fn client_installer_metadata(
    client: &ClientDefinition,
    config: &ClientModificationConfig,
) -> ClientInstallerMetadata {
    let local_installer_available = config
        .local_installer_path
        .as_deref()
        .is_some_and(safe_existing_local_client_target);
    let local_updater_available = config
        .local_updater_path
        .as_deref()
        .is_some_and(safe_existing_local_client_target);
    let can_open_updater = local_updater_available
        || client.updater_uri.is_some()
        || client.launch_uri.is_some()
        || client.official_download_uri.is_some();

    ClientInstallerMetadata {
        platform_id: client.platform_id.to_string(),
        display_name: client.display_name.to_string(),
        official_download_uri: client.official_download_uri.map(str::to_string),
        updater_uri: client.updater_uri.map(str::to_string),
        local_installer_path: config.local_installer_path.clone(),
        local_updater_path: config.local_updater_path.clone(),
        can_open_official_download: client.official_download_uri.is_some(),
        can_open_local_installer: local_installer_available,
        can_open_updater,
        install_action_label: if local_installer_available {
            "Run local installer".to_string()
        } else {
            "Open official download".to_string()
        },
        update_action_label: if local_updater_available {
            "Run local updater".to_string()
        } else if client.updater_uri.is_some() || client.launch_uri.is_some() {
            "Open updater".to_string()
        } else {
            "Open download page".to_string()
        },
        install_notes: "OG-Launcher never downloads platform-client binaries silently; this action opens an official source or your configured local installer.".to_string(),
        update_notes: client.update_notes.to_string(),
    }
}

fn build_install_stage_plan(
    client: &ClientDefinition,
    metadata: &ClientInstallerMetadata,
    health: &PlatformClientHealth,
) -> ClientInstallStagePlan {
    let mut checks = vec![
        ClientInstallStageCheck {
            label: "User consent".to_string(),
            status: "warning".to_string(),
            detail: "Installer actions require an explicit click; no background install is queued."
                .to_string(),
        },
        ClientInstallStageCheck {
            label: "Binary source".to_string(),
            status: "pass".to_string(),
            detail: "OG-Launcher does not download or redistribute third-party platform clients."
                .to_string(),
        },
        ClientInstallStageCheck {
            label: "License review".to_string(),
            status: "warning".to_string(),
            detail: "Review the provider installer terms before continuing.".to_string(),
        },
    ];

    if health.installed {
        checks.push(ClientInstallStageCheck {
            label: "Install signal".to_string(),
            status: "blocked".to_string(),
            detail: "A local install or running client is already detected.".to_string(),
        });
        return ClientInstallStagePlan {
            platform_id: client.platform_id.to_string(),
            display_name: client.display_name.to_string(),
            stage: "alreadyInstalled".to_string(),
            target_label: "Install already detected".to_string(),
            target_uri: None,
            target_path: health.install_path.clone(),
            can_proceed: false,
            requires_user_consent: true,
            requires_license_review: true,
            requires_admin_review: false,
            checks,
            message: format!(
                "{} already has an install signal; use update or launch actions instead.",
                client.display_name
            ),
        };
    }

    if metadata.can_open_local_installer {
        checks.push(ClientInstallStageCheck {
            label: "Local installer".to_string(),
            status: "pass".to_string(),
            detail: "Configured installer path exists locally; OG-Launcher will only open it."
                .to_string(),
        });
        checks.push(ClientInstallStageCheck {
            label: "Admin capability".to_string(),
            status: "warning".to_string(),
            detail: "The provider installer may ask the operating system for elevated rights."
                .to_string(),
        });
        return ClientInstallStagePlan {
            platform_id: client.platform_id.to_string(),
            display_name: client.display_name.to_string(),
            stage: "localInstaller".to_string(),
            target_label: "Configured local installer".to_string(),
            target_uri: None,
            target_path: metadata.local_installer_path.clone(),
            can_proceed: true,
            requires_user_consent: true,
            requires_license_review: true,
            requires_admin_review: true,
            checks,
            message: format!(
                "{} is staged from a configured local installer. No silent download will run.",
                client.display_name
            ),
        };
    }

    if metadata.can_open_official_download {
        checks.push(ClientInstallStageCheck {
            label: "Official source".to_string(),
            status: "pass".to_string(),
            detail:
                "Only the provider download page is opened; download and install remain manual."
                    .to_string(),
        });
        checks.push(ClientInstallStageCheck {
            label: "Local installer".to_string(),
            status: "warning".to_string(),
            detail: "No local installer path is configured for staged offline execution."
                .to_string(),
        });
        return ClientInstallStagePlan {
            platform_id: client.platform_id.to_string(),
            display_name: client.display_name.to_string(),
            stage: "officialDownload".to_string(),
            target_label: "Official provider download page".to_string(),
            target_uri: metadata.official_download_uri.clone(),
            target_path: None,
            can_proceed: true,
            requires_user_consent: true,
            requires_license_review: true,
            requires_admin_review: false,
            checks,
            message: format!(
                "{} is staged to open the official provider download page.",
                client.display_name
            ),
        };
    }

    checks.push(ClientInstallStageCheck {
        label: "Install target".to_string(),
        status: "blocked".to_string(),
        detail: "No official download URI or configured local installer is available.".to_string(),
    });
    ClientInstallStagePlan {
        platform_id: client.platform_id.to_string(),
        display_name: client.display_name.to_string(),
        stage: "blocked".to_string(),
        target_label: "No safe install target".to_string(),
        target_uri: None,
        target_path: None,
        can_proceed: false,
        requires_user_consent: true,
        requires_license_review: true,
        requires_admin_review: false,
        checks,
        message: format!(
            "{} cannot be staged until a safe installer target is configured.",
            client.display_name
        ),
    }
}

fn build_auto_apply_plan(
    client: &ClientDefinition,
    config: &ClientModificationConfig,
    status: &ClientUpdateStatus,
) -> ClientAutoApplyPlan {
    let safe_target_label = resolve_scheduled_auto_open_target(client, config)
        .ok()
        .map(|target| target.label());
    let mut checks = vec![
        ClientAutoApplyCheck {
            label: "Update policy".to_string(),
            status: if config.update_policy == AUTO_APPLY_UPDATE_POLICY {
                "pass".to_string()
            } else {
                "warning".to_string()
            },
            detail: if config.update_policy == AUTO_APPLY_UPDATE_POLICY {
                "Guarded auto-apply policy is selected for scheduled checks.".to_string()
            } else {
                "Auto-apply policy is not selected; scheduled checks will not attempt apply."
                    .to_string()
            },
        },
        ClientAutoApplyCheck {
            label: "Binary source".to_string(),
            status: "pass".to_string(),
            detail: "OG-Launcher does not download or redistribute third-party client binaries."
                .to_string(),
        },
    ];

    if !status.installed {
        checks.push(ClientAutoApplyCheck {
            label: "Install signal".to_string(),
            status: "blocked".to_string(),
            detail: "Client installation is missing; auto-apply cannot run before install staging."
                .to_string(),
        });
        return ClientAutoApplyPlan {
            platform_id: client.platform_id.to_string(),
            display_name: client.display_name.to_string(),
            policy: config.update_policy.clone(),
            stage: "blocked".to_string(),
            safe_target_label,
            can_auto_apply: false,
            can_open_safe_updater: false,
            allows_silent_execution: false,
            requires_provider_mechanism: true,
            requires_user_consent: true,
            checks,
            message: format!(
                "{} is not installed; auto-apply is blocked until a safe install signal exists.",
                client.display_name
            ),
        };
    }

    if !status.update_available {
        checks.push(ClientAutoApplyCheck {
            label: "Update signal".to_string(),
            status: "warning".to_string(),
            detail: "No configured version gap is currently available to apply.".to_string(),
        });
        return ClientAutoApplyPlan {
            platform_id: client.platform_id.to_string(),
            display_name: client.display_name.to_string(),
            policy: config.update_policy.clone(),
            stage: "noUpdate".to_string(),
            safe_target_label,
            can_auto_apply: false,
            can_open_safe_updater: false,
            allows_silent_execution: false,
            requires_provider_mechanism: true,
            requires_user_consent: true,
            checks,
            message: format!(
                "{} has no staged update gap; scheduled auto-apply has nothing to apply.",
                client.display_name
            ),
        };
    }

    checks.push(ClientAutoApplyCheck {
        label: "Update signal".to_string(),
        status: "pass".to_string(),
        detail: status.detail.clone(),
    });
    checks.push(ClientAutoApplyCheck {
        label: "Provider mechanism".to_string(),
        status: "blocked".to_string(),
        detail:
            "No official unattended update API, signed package feed, or provider-approved CLI is configured."
                .to_string(),
    });

    if safe_target_label.is_some() {
        checks.push(ClientAutoApplyCheck {
            label: "Safe fallback".to_string(),
            status: "warning".to_string(),
            detail:
                "A safe updater or launch target exists, but it belongs to the Open client policy, not auto-apply."
                    .to_string(),
        });
    } else {
        checks.push(ClientAutoApplyCheck {
            label: "Safe fallback".to_string(),
            status: "blocked".to_string(),
            detail: "No local updater or provider launch URI is available as a manual fallback."
                .to_string(),
        });
    }

    let stage = if config.update_policy == AUTO_APPLY_UPDATE_POLICY {
        "unsupported"
    } else {
        "policyOff"
    };
    let message = if config.update_policy == AUTO_APPLY_UPDATE_POLICY {
        format!(
            "{} has an update gap, but auto-apply is blocked because no official provider mechanism is configured.",
            client.display_name
        )
    } else {
        format!(
            "{} has an update gap. Select guarded auto-apply only to record provider-gated apply checks; use Open client for safe updater launch.",
            client.display_name
        )
    };

    ClientAutoApplyPlan {
        platform_id: client.platform_id.to_string(),
        display_name: client.display_name.to_string(),
        policy: config.update_policy.clone(),
        stage: stage.to_string(),
        safe_target_label,
        can_auto_apply: false,
        can_open_safe_updater: config.update_policy == OPEN_CLIENT_UPDATE_POLICY,
        allows_silent_execution: false,
        requires_provider_mechanism: true,
        requires_user_consent: true,
        checks,
        message,
    }
}

#[derive(Debug, Clone)]
struct ClientManagerAutoApplyCapabilityDisk {
    mount_point: String,
    available_space: u64,
    is_read_only: bool,
    is_removable: bool,
}

fn build_client_manager_auto_apply_capability_preview(
    client: &ClientDefinition,
    health: &PlatformClientHealth,
    plan: &ClientAutoApplyPlan,
    target_path: Option<String>,
    disk: Option<ClientManagerAutoApplyCapabilityDisk>,
    required_disk_bytes: u64,
    generated_at: String,
) -> ClientManagerAutoApplyCapabilityPreview {
    let target_path_ref = target_path.as_deref();
    let target_path_is_absolute = target_path_ref
        .map(|path| Path::new(path).is_absolute() && !path_is_root(Path::new(path)))
        .unwrap_or(false);
    let disk_available = disk.as_ref().map(|disk| disk.available_space);
    let disk_status = match disk.as_ref() {
        Some(disk) if disk.is_read_only => "blocked",
        Some(disk) if disk.available_space < required_disk_bytes => "blocked",
        Some(_) => "pass",
        None => "blocked",
    };
    let disk_detail = match disk.as_ref() {
        Some(disk) if disk.is_read_only => {
            "Matched install target disk is read-only; auto-apply capability remains blocked."
                .to_string()
        }
        Some(disk) if disk.available_space < required_disk_bytes => format!(
            "{} bytes are available, below the {} byte local review floor.",
            disk.available_space, required_disk_bytes
        ),
        Some(disk) if disk.is_removable => format!(
            "{} bytes are available on removable media; keep this as manual review evidence.",
            disk.available_space
        ),
        Some(disk) => format!(
            "{} bytes are available on the matched install target disk.",
            disk.available_space
        ),
        None => "No native disk mount matched the selected install target.".to_string(),
    };

    let checks = vec![
        ClientManagerAutoApplyCapabilityCheck {
            id: "desktop-runtime".to_string(),
            label: "Runtime presence".to_string(),
            status: "pass".to_string(),
            detail:
                "Desktop runtime executed this read-only Client Manager capability preview."
                    .to_string(),
            evidence: env::consts::OS.to_string(),
        },
        ClientManagerAutoApplyCapabilityCheck {
            id: "client-presence".to_string(),
            label: "Client presence".to_string(),
            status: if health.installed { "pass" } else { "blocked" }.to_string(),
            detail: if health.installed {
                format!(
                    "{} has a local install or running-client signal.",
                    client.display_name
                )
            } else {
                format!(
                    "{} is missing; auto-apply cannot pass prerequisite review.",
                    client.display_name
                )
            },
            evidence: health
                .install_path
                .clone()
                .unwrap_or_else(|| health.status_label.clone()),
        },
        ClientManagerAutoApplyCapabilityCheck {
            id: "install-target".to_string(),
            label: "Install target".to_string(),
            status: if target_path_is_absolute {
                "warning"
            } else {
                "blocked"
            }
            .to_string(),
            detail: if target_path_is_absolute {
                "Install target is absolute and non-root; filesystem writes are not attempted."
                    .to_string()
            } else {
                "No absolute non-root install target is available for local review.".to_string()
            },
            evidence: target_path
                .clone()
                .unwrap_or_else(|| "No target path".to_string()),
        },
        ClientManagerAutoApplyCapabilityCheck {
            id: "free-disk-space".to_string(),
            label: "Free disk space".to_string(),
            status: disk_status.to_string(),
            detail: disk_detail,
            evidence: disk
                .as_ref()
                .map(|disk| disk.mount_point.clone())
                .unwrap_or_else(|| "No matched mount point".to_string()),
        },
        ClientManagerAutoApplyCapabilityCheck {
            id: "admin-review".to_string(),
            label: "Admin review".to_string(),
            status: "warning".to_string(),
            detail:
                "No elevated token is requested; provider updater elevation stays a manual consent review."
                    .to_string(),
            evidence: "Read-only preview".to_string(),
        },
        ClientManagerAutoApplyCapabilityCheck {
            id: "provider-mechanism".to_string(),
            label: "Provider mechanism".to_string(),
            status: if plan.can_auto_apply {
                "pass"
            } else {
                "blocked"
            }
            .to_string(),
            detail: plan.message.clone(),
            evidence: plan.stage.clone(),
        },
    ];

    let blocked_count = checks
        .iter()
        .filter(|check| check.status == "blocked")
        .count();
    let message = if blocked_count > 0 {
        format!(
            "{} auto-apply capability preview remains blocked across {} prerequisite check(s).",
            client.display_name, blocked_count
        )
    } else {
        format!(
            "{} auto-apply capability preview has no local prerequisite blockers; provider execution is still governed by the auto-apply plan.",
            client.display_name
        )
    };

    ClientManagerAutoApplyCapabilityPreview {
        platform_id: client.platform_id.to_string(),
        display_name: client.display_name.to_string(),
        generated_at,
        target_path,
        required_disk_bytes,
        available_disk_bytes: disk_available,
        disk_mount_point: disk.as_ref().map(|disk| disk.mount_point.clone()),
        auto_apply_stage: plan.stage.clone(),
        can_auto_apply: plan.can_auto_apply,
        checks,
        message,
    }
}

fn resolve_client_manager_auto_apply_capability_target(
    input: &ClientManagerAutoApplyCapabilityRequest,
    config: &ClientModificationConfig,
    health: &PlatformClientHealth,
) -> Option<String> {
    input
        .install_target_path
        .as_ref()
        .map(|path| path.trim())
        .filter(|path| !path.is_empty())
        .map(str::to_string)
        .or_else(|| health.install_path.clone())
        .or_else(|| {
            config
                .path_overlays
                .iter()
                .find(|overlay| overlay.enabled && !overlay.target_path.trim().is_empty())
                .map(|overlay| overlay.target_path.trim().to_string())
        })
}

fn client_manager_auto_apply_capability_disk_for_path(
    target_path: &str,
) -> Option<ClientManagerAutoApplyCapabilityDisk> {
    let target = Path::new(target_path);
    if !target.is_absolute() {
        return None;
    }

    let disks = Disks::new_with_refreshed_list();
    disks
        .iter()
        .filter_map(|disk| {
            let mount_point = disk.mount_point();
            if target.starts_with(mount_point) {
                Some((mount_point.to_path_buf(), disk))
            } else {
                None
            }
        })
        .max_by_key(|(mount_point, _)| mount_point.components().count())
        .map(|(mount_point, disk)| ClientManagerAutoApplyCapabilityDisk {
            mount_point: path_to_lossy_string(&mount_point),
            available_space: disk.available_space(),
            is_read_only: disk.is_read_only(),
            is_removable: disk.is_removable(),
        })
}

fn scheduled_update_history_item<F>(
    client: &ClientDefinition,
    config: &ClientModificationConfig,
    status: &ClientUpdateStatus,
    checked_at: String,
    opener: F,
) -> ClientUpdateHistoryItem
where
    F: FnOnce(&ResolvedClientTarget) -> Result<(), String>,
{
    let mut history_status = status.status_label.clone();
    let mut message = if status.update_available {
        format!(
            "{} scheduled check found an available update.",
            client.display_name
        )
    } else {
        format!("{} scheduled check completed.", client.display_name)
    };

    if status.update_available && config.update_policy == AUTO_APPLY_UPDATE_POLICY {
        let plan = build_auto_apply_plan(client, config, status);
        history_status = if plan.can_auto_apply {
            "auto_applied".to_string()
        } else {
            "auto_apply_blocked".to_string()
        };
        message = plan.message;
    } else if status.update_available && config.update_policy == OPEN_CLIENT_UPDATE_POLICY {
        match resolve_scheduled_auto_open_target(client, config) {
            Ok(target) => match opener(&target) {
                Ok(()) => {
                    history_status = "auto_opened".to_string();
                    message = format!(
                        "{} scheduled check found an available update and opened {}.",
                        client.display_name,
                        target.label()
                    );
                }
                Err(error) => {
                    history_status = "auto_open_failed".to_string();
                    message = format!(
                        "{} scheduled check found an available update but could not open the updater: {error}",
                        client.display_name
                    );
                }
            },
            Err(error) => {
                history_status = "auto_open_failed".to_string();
                message = format!(
                    "{} scheduled check found an available update but no safe updater target was available: {error}",
                    client.display_name
                );
            }
        }
    }

    update_history_item(
        client,
        SCHEDULED_UPDATE_ACTION,
        &history_status,
        status.installed_version.clone(),
        status.latest_known_version.clone(),
        message,
        checked_at,
    )
}

fn run_configured_client_update_scheduler() -> Result<ClientUpdateSchedulerRunStatus, String> {
    let status = match run_scheduled_platform_client_update_checks() {
        Ok(response) => client_update_scheduler_status_from_response(response, true),
        Err(error) => ClientUpdateSchedulerRunStatus {
            checked_at: now_iso(),
            checked_clients: Vec::new(),
            checked_count: 0,
            message: error,
            next_check_at: None,
            skipped_count: 0,
            success: false,
            update_count: 0,
        },
    };
    write_client_update_scheduler_run_status(&status)?;
    Ok(status)
}

fn client_update_scheduler_status_from_response(
    response: ScheduledClientUpdateChecksResponse,
    success: bool,
) -> ClientUpdateSchedulerRunStatus {
    ClientUpdateSchedulerRunStatus {
        checked_at: response.checked_at,
        checked_clients: response.checked_clients.clone(),
        checked_count: response.checked_clients.len(),
        message: response.message,
        next_check_at: response.next_check_at,
        skipped_count: response.skipped_clients.len(),
        success,
        update_count: response.update_count,
    }
}

fn client_update_scheduler_status_path() -> Result<PathBuf, String> {
    dirs::data_local_dir()
        .or_else(dirs::data_dir)
        .map(|dir| {
            dir.join(CLIENT_MANAGER_DIR)
                .join(CLIENT_UPDATE_SCHEDULER_STATUS_FILE)
        })
        .ok_or_else(|| "Could not resolve Open Game Launcher data directory.".to_string())
}

fn write_client_update_scheduler_run_status(
    status: &ClientUpdateSchedulerRunStatus,
) -> Result<(), String> {
    let path = client_update_scheduler_status_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!("Could not create client-update scheduler status folder: {error}")
        })?;
    }
    let json = serde_json::to_string_pretty(status)
        .map_err(|error| format!("Could not encode client-update scheduler status: {error}"))?;
    fs::write(path, json)
        .map_err(|error| format!("Could not write client-update scheduler status: {error}"))
}

fn client_update_scheduler_provider() -> (&'static str, bool) {
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

/// Ensures the OS-level platform-client update timer is installed so the
/// headless update check runs automatically, without any user action.
///
/// Called once during app startup. Idempotent: it is a no-op when the timer
/// is already installed or the platform does not support OS schedulers.
/// Failures are logged to stderr and never block startup.
pub fn ensure_client_update_scheduler_installed() {
    let (_, supported) = client_update_scheduler_provider();
    if !supported || is_os_client_update_scheduler_installed() {
        return;
    }
    if let Err(error) = install_os_client_update_scheduler() {
        eprintln!("Could not auto-install the platform-client update timer: {error}");
    }
}

fn install_os_client_update_scheduler() -> Result<(), String> {
    let (_, supported) = client_update_scheduler_provider();
    if !supported {
        return Err(
            "Headless platform-client update timers are not supported on this platform."
                .to_string(),
        );
    }

    #[cfg(target_os = "windows")]
    {
        install_windows_client_update_scheduler()
    }
    #[cfg(target_os = "macos")]
    {
        install_macos_client_update_scheduler()
    }
    #[cfg(target_os = "linux")]
    {
        install_linux_client_update_scheduler()
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Err(
            "Headless platform-client update timers are not supported on this platform."
                .to_string(),
        )
    }
}

fn is_os_client_update_scheduler_installed() -> bool {
    #[cfg(target_os = "windows")]
    {
        Command::new("schtasks")
            .args(["/Query", "/TN", WINDOWS_CLIENT_UPDATE_TASK_NAME])
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
    }
    #[cfg(target_os = "macos")]
    {
        macos_client_update_launch_agent_path()
            .map(|path| path.exists())
            .unwrap_or(false)
    }
    #[cfg(target_os = "linux")]
    {
        linux_client_update_systemd_user_dir()
            .map(|path| {
                path.join(LINUX_CLIENT_UPDATE_SERVICE_FILE).exists()
                    && path.join(LINUX_CLIENT_UPDATE_TIMER_FILE).exists()
            })
            .unwrap_or(false)
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        false
    }
}

#[cfg(target_os = "windows")]
fn install_windows_client_update_scheduler() -> Result<(), String> {
    let exe = current_client_update_scheduler_exe()?;
    let task_run = format!(
        "\"{}\" {}",
        exe.to_string_lossy().replace('"', "\\\""),
        HEADLESS_CLIENT_UPDATE_SCHEDULER_ARG
    );
    run_client_update_os_command(
        "schtasks",
        &[
            "/Create".to_string(),
            "/TN".to_string(),
            WINDOWS_CLIENT_UPDATE_TASK_NAME.to_string(),
            "/TR".to_string(),
            task_run,
            "/SC".to_string(),
            "HOURLY".to_string(),
            "/MO".to_string(),
            "1".to_string(),
            "/F".to_string(),
        ],
    )
}

#[cfg(target_os = "macos")]
fn install_macos_client_update_scheduler() -> Result<(), String> {
    let path = macos_client_update_launch_agent_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create LaunchAgents folder: {error}"))?;
    }
    let exe = current_client_update_scheduler_exe()?;
    fs::write(&path, macos_client_update_launch_agent_plist(&exe))
        .map_err(|error| format!("Could not write client-update LaunchAgent plist: {error}"))?;

    let path_text = path_to_string(path.as_path()).unwrap_or_else(|| path.display().to_string());
    let _ = run_client_update_os_command("launchctl", &["unload".to_string(), path_text.clone()]);
    run_client_update_os_command("launchctl", &["load".to_string(), path_text])
}

#[cfg(target_os = "macos")]
fn macos_client_update_launch_agent_path() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|path| {
            path.join("Library")
                .join("LaunchAgents")
                .join(MACOS_CLIENT_UPDATE_LAUNCH_AGENT_FILE)
        })
        .ok_or_else(|| "Could not resolve home directory for LaunchAgent.".to_string())
}

#[cfg(target_os = "linux")]
fn install_linux_client_update_scheduler() -> Result<(), String> {
    let user_dir = linux_client_update_systemd_user_dir()?;
    fs::create_dir_all(&user_dir)
        .map_err(|error| format!("Could not create systemd user folder: {error}"))?;
    let exe = current_client_update_scheduler_exe()?;
    fs::write(
        user_dir.join(LINUX_CLIENT_UPDATE_SERVICE_FILE),
        linux_client_update_systemd_service_unit(&exe),
    )
    .map_err(|error| format!("Could not write client-update systemd service: {error}"))?;
    fs::write(
        user_dir.join(LINUX_CLIENT_UPDATE_TIMER_FILE),
        linux_client_update_systemd_timer_unit(),
    )
    .map_err(|error| format!("Could not write client-update systemd timer: {error}"))?;

    run_client_update_os_command(
        "systemctl",
        &["--user".to_string(), "daemon-reload".to_string()],
    )?;
    run_client_update_os_command(
        "systemctl",
        &[
            "--user".to_string(),
            "enable".to_string(),
            "--now".to_string(),
            LINUX_CLIENT_UPDATE_TIMER_FILE.to_string(),
        ],
    )
}

#[cfg(target_os = "linux")]
fn linux_client_update_systemd_user_dir() -> Result<PathBuf, String> {
    dirs::config_dir()
        .map(|path| path.join("systemd").join("user"))
        .ok_or_else(|| "Could not resolve user config directory for systemd.".to_string())
}

fn current_client_update_scheduler_exe() -> Result<PathBuf, String> {
    env::current_exe().map_err(|error| format!("Could not resolve launcher executable: {error}"))
}

fn run_client_update_os_command(program: &str, args: &[String]) -> Result<(), String> {
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
fn linux_client_update_systemd_service_unit(exe: &Path) -> String {
    format!(
        "[Unit]\nDescription=OG Launcher platform-client update check\n\n[Service]\nType=oneshot\nExecStart=\"{}\" {}\n",
        escape_client_update_systemd_exec_path(exe),
        HEADLESS_CLIENT_UPDATE_SCHEDULER_ARG
    )
}

#[cfg(any(target_os = "linux", test))]
fn linux_client_update_systemd_timer_unit() -> String {
    format!(
        "[Unit]\nDescription=OG Launcher platform-client update timer\n\n[Timer]\nOnCalendar=hourly\nPersistent=true\nUnit={LINUX_CLIENT_UPDATE_SERVICE_FILE}\n\n[Install]\nWantedBy=timers.target\n"
    )
}

#[cfg(any(target_os = "macos", test))]
fn macos_client_update_launch_agent_plist(exe: &Path) -> String {
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\">\n<dict>\n  <key>Label</key>\n  <string>com.opengamelauncher.client-updates</string>\n  <key>ProgramArguments</key>\n  <array>\n    <string>{}</string>\n    <string>{}</string>\n  </array>\n  <key>StartInterval</key>\n  <integer>3600</integer>\n</dict>\n</plist>\n",
        escape_client_update_xml_text(&path_to_string(exe).unwrap_or_else(|| exe.display().to_string())),
        HEADLESS_CLIENT_UPDATE_SCHEDULER_ARG
    )
}

#[cfg(any(target_os = "linux", test))]
fn escape_client_update_systemd_exec_path(path: &Path) -> String {
    path_to_string(path)
        .unwrap_or_else(|| path.display().to_string())
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
}

#[cfg(any(target_os = "macos", test))]
fn escape_client_update_xml_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn open_client_manager_target(
    client: &ClientDefinition,
    action: &str,
) -> Result<ClientManagerActionResult, String> {
    let mut store = read_client_manager_store()?;
    let config = config_for_client(&store, client);
    let target = resolve_action_target(client, &config, action)?;
    let open_result = open_resolved_client_target(&target);

    let now = now_iso();
    let health = health_for_client(client);
    let installed_version =
        detect_client_version(client.platform_id, health.install_path.as_deref());
    let (status, message) = match open_result {
        Ok(()) => (
            "opened".to_string(),
            action_success_message(client, action, &target),
        ),
        Err(error) => ("failed".to_string(), error),
    };
    let history_item = update_history_item(
        client,
        action,
        &status,
        installed_version,
        config.latest_known_version.clone(),
        message.clone(),
        now,
    );
    remember_update_history(&mut store, history_item.clone());
    write_client_manager_store(&store)?;

    if status == "failed" {
        return Err(message);
    }

    Ok(ClientManagerActionResult {
        platform_id: client.platform_id.to_string(),
        action: action.to_string(),
        opened_target: target.label(),
        message,
        history_item,
    })
}

enum ResolvedClientTarget {
    LocalPath(String),
    Uri(String),
}

impl ResolvedClientTarget {
    fn label(&self) -> String {
        match self {
            ResolvedClientTarget::LocalPath(path) => path.clone(),
            ResolvedClientTarget::Uri(uri) => uri.clone(),
        }
    }
}

fn open_resolved_client_target(target: &ResolvedClientTarget) -> Result<(), String> {
    match target {
        ResolvedClientTarget::LocalPath(path) => open_local_path(path),
        ResolvedClientTarget::Uri(uri) => crate::commands::uri_safety::open_uri_safely(uri),
    }
}

fn resolve_scheduled_auto_open_target(
    client: &ClientDefinition,
    config: &ClientModificationConfig,
) -> Result<ResolvedClientTarget, String> {
    if let Some(path) = config.local_updater_path.as_deref() {
        if let Some(path) = safe_local_client_target_string(path) {
            return Ok(ResolvedClientTarget::LocalPath(path));
        }
    }
    if let Some(uri) = client.updater_uri {
        return Ok(ResolvedClientTarget::Uri(uri.to_string()));
    }
    if let Some(uri) = client.launch_uri {
        return Ok(ResolvedClientTarget::Uri(uri.to_string()));
    }

    Err(format!(
        "No updater or launch URI is configured for {}.",
        client.display_name
    ))
}

fn resolve_action_target(
    client: &ClientDefinition,
    config: &ClientModificationConfig,
    action: &str,
) -> Result<ResolvedClientTarget, String> {
    if action == "installer_opened" {
        if let Some(path) = config.local_installer_path.as_deref() {
            if let Some(path) = safe_local_client_target_string(path) {
                return Ok(ResolvedClientTarget::LocalPath(path));
            }
        }
        if let Some(uri) = client.official_download_uri {
            return Ok(ResolvedClientTarget::Uri(uri.to_string()));
        }
        return Err(format!(
            "No official download URI is configured for {}.",
            client.display_name
        ));
    }

    if let Some(path) = config.local_updater_path.as_deref() {
        if let Some(path) = safe_local_client_target_string(path) {
            return Ok(ResolvedClientTarget::LocalPath(path));
        }
    }
    if let Some(uri) = client.updater_uri {
        return Ok(ResolvedClientTarget::Uri(uri.to_string()));
    }
    if let Some(uri) = client.launch_uri {
        return Ok(ResolvedClientTarget::Uri(uri.to_string()));
    }
    if let Some(uri) = client.official_download_uri {
        return Ok(ResolvedClientTarget::Uri(uri.to_string()));
    }

    Err(format!(
        "No updater or official download URI is configured for {}.",
        client.display_name
    ))
}

fn action_success_message(
    client: &ClientDefinition,
    action: &str,
    target: &ResolvedClientTarget,
) -> String {
    match (action, target) {
        ("installer_opened", ResolvedClientTarget::LocalPath(_)) => {
            format!(
                "Opened configured local installer for {}.",
                client.display_name
            )
        }
        ("installer_opened", ResolvedClientTarget::Uri(_)) => {
            format!("Opened official download page for {}.", client.display_name)
        }
        ("updater_opened", ResolvedClientTarget::LocalPath(_)) => {
            format!(
                "Opened configured local updater for {}.",
                client.display_name
            )
        }
        ("updater_opened", ResolvedClientTarget::Uri(_)) => {
            format!(
                "Opened {} for its official updater flow.",
                client.display_name
            )
        }
        _ => format!("Opened {} client-manager target.", client.display_name),
    }
}

fn open_local_path(path: &str) -> Result<(), String> {
    let root = client_manager_local_targets_root()?;
    let path = canonical_local_client_target(path, &root, "local client target")?;

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        if path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("msi"))
        {
            std::process::Command::new("msiexec")
                .arg("/i")
                .arg(&path)
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map_err(|error| format!("Could not open MSI installer: {error}"))?;
        } else {
            std::process::Command::new(&path)
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map_err(|error| format!("Could not open local installer: {error}"))?;
        }
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|error| format!("Could not open local installer: {error}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        let direct_result = std::process::Command::new(&path).spawn();
        if direct_result.is_err() {
            std::process::Command::new("xdg-open")
                .arg(&path)
                .spawn()
                .map_err(|error| format!("Could not open local installer: {error}"))?;
        }
    }
    Ok(())
}

fn build_update_status(
    client: &ClientDefinition,
    store: &ClientManagerStore,
    now: DateTime<Utc>,
) -> ClientUpdateStatus {
    let config = config_for_client(store, client);
    let health = health_for_client(client);
    let installed_version =
        detect_client_version(client.platform_id, health.install_path.as_deref());
    let latest_known_version = config.latest_known_version.clone();
    let update_available = installed_version
        .as_deref()
        .zip(latest_known_version.as_deref())
        .and_then(|(installed, latest)| compare_version_strings(installed, latest))
        .is_some_and(|ordering| ordering == Ordering::Less);

    let (status_label, detail) = if !health.installed {
        (
            "Missing".to_string(),
            "Install not detected; open the official download source or configure a local installer."
                .to_string(),
        )
    } else if update_available {
        (
            "Update available".to_string(),
            format!(
                "{} < {}",
                installed_version.as_deref().unwrap_or("installed"),
                latest_known_version.as_deref().unwrap_or("latest")
            ),
        )
    } else if installed_version.is_some() && latest_known_version.is_some() {
        (
            "Current".to_string(),
            "Installed version is at or above the configured latest-known version.".to_string(),
        )
    } else if installed_version.is_some() {
        (
            "Version detected".to_string(),
            "No remote update feed is configured; use the official client updater.".to_string(),
        )
    } else {
        (
            "Manual check".to_string(),
            "Version cannot be verified locally; use the official client updater.".to_string(),
        )
    };

    let metadata = client_installer_metadata(client, &config);
    let scheduler_enabled = client_update_scheduler_enabled(&config.update_policy);
    let last_scheduled_check_at = last_scheduled_check_for_client(store, client.platform_id);
    let next_scheduled_check_at = scheduler_enabled
        .then(|| next_scheduled_check_at(store, client.platform_id, now))
        .map(iso_datetime);
    ClientUpdateStatus {
        platform_id: client.platform_id.to_string(),
        display_name: client.display_name.to_string(),
        installed: health.installed,
        running: health.running,
        installed_version,
        latest_known_version,
        update_available,
        status_label,
        detail,
        can_open_updater: metadata.can_open_updater,
        official_download_uri: client.official_download_uri.map(str::to_string),
        local_updater_path: config.local_updater_path.clone(),
        update_policy: config.update_policy,
        scheduler_enabled,
        last_scheduled_check_at,
        next_scheduled_check_at,
        last_checked_at: iso_datetime(now),
        history: history_for_client(store, client.platform_id),
    }
}

fn health_for_client(client: &ClientDefinition) -> PlatformClientHealth {
    poll_platform_client_health()
        .into_iter()
        .find(|health| health.platform_id == client.platform_id)
        .unwrap_or_else(|| PlatformClientHealth {
            platform_id: client.platform_id.to_string(),
            display_name: client.display_name.to_string(),
            installed: false,
            running: false,
            install_path: None,
            pid: None,
            process_name: None,
            uptime_seconds: None,
            window_handle: None,
            window_title: None,
            status_label: "Missing".to_string(),
            can_launch: client.launch_uri.is_some(),
            last_checked_at: now_iso(),
        })
}

fn update_history_item(
    client: &ClientDefinition,
    action: &str,
    status: &str,
    installed_version: Option<String>,
    latest_known_version: Option<String>,
    message: String,
    checked_at: String,
) -> ClientUpdateHistoryItem {
    ClientUpdateHistoryItem {
        id: uuid::Uuid::new_v4().to_string(),
        platform_id: client.platform_id.to_string(),
        checked_at,
        action: action.to_string(),
        status: status.to_string(),
        installed_version,
        latest_known_version,
        message,
    }
}

fn remember_update_history(store: &mut ClientManagerStore, item: ClientUpdateHistoryItem) {
    let platform_id = item.platform_id.clone();
    store.update_history.push(item);

    let mut platform_items: Vec<ClientUpdateHistoryItem> = store
        .update_history
        .iter()
        .filter(|entry| entry.platform_id == platform_id)
        .cloned()
        .collect();
    if platform_items.len() > MAX_HISTORY_ITEMS_PER_CLIENT {
        let drop_count = platform_items.len() - MAX_HISTORY_ITEMS_PER_CLIENT;
        platform_items.drain(..drop_count);
    }

    store
        .update_history
        .retain(|entry| entry.platform_id != platform_id);
    store.update_history.extend(platform_items);
    store
        .update_history
        .sort_by(|left, right| left.checked_at.cmp(&right.checked_at));
}

fn history_for_client(
    store: &ClientManagerStore,
    platform_id: &str,
) -> Vec<ClientUpdateHistoryItem> {
    let mut items: Vec<ClientUpdateHistoryItem> = store
        .update_history
        .iter()
        .filter(|entry| entry.platform_id == platform_id)
        .cloned()
        .collect();
    items.sort_by(|left, right| right.checked_at.cmp(&left.checked_at));
    items.truncate(MAX_HISTORY_ITEMS_PER_CLIENT);
    items
}

fn client_update_scheduler_enabled(update_policy: &str) -> bool {
    update_policy != DEFAULT_UPDATE_POLICY
}

fn last_scheduled_check_for_client(
    store: &ClientManagerStore,
    platform_id: &str,
) -> Option<String> {
    store
        .update_history
        .iter()
        .filter(|entry| entry.platform_id == platform_id && entry.action == SCHEDULED_UPDATE_ACTION)
        .max_by(|left, right| left.checked_at.cmp(&right.checked_at))
        .map(|entry| entry.checked_at.clone())
}

fn client_update_check_due(
    store: &ClientManagerStore,
    platform_id: &str,
    now: DateTime<Utc>,
) -> bool {
    next_scheduled_check_at(store, platform_id, now) <= now
}

fn next_scheduled_check_at(
    store: &ClientManagerStore,
    platform_id: &str,
    now: DateTime<Utc>,
) -> DateTime<Utc> {
    let Some(last_check) = last_scheduled_check_for_client(store, platform_id) else {
        return now;
    };
    let Some(last_check) = parse_iso_datetime(&last_check) else {
        return now;
    };
    let next_check = last_check + Duration::hours(CLIENT_UPDATE_CHECK_INTERVAL_HOURS);
    if next_check < now {
        now
    } else {
        next_check
    }
}

fn next_global_scheduled_check_at(
    store: &ClientManagerStore,
    now: DateTime<Utc>,
) -> Option<DateTime<Utc>> {
    CLIENTS
        .iter()
        .filter(|client| {
            let config = config_for_client(store, client);
            client_update_scheduler_enabled(&config.update_policy)
        })
        .map(|client| next_scheduled_check_at(store, client.platform_id, now))
        .min()
}

fn config_for_client(
    store: &ClientManagerStore,
    client: &ClientDefinition,
) -> ClientModificationConfig {
    store
        .configs
        .iter()
        .find(|config| config.platform_id == client.platform_id)
        .cloned()
        .unwrap_or_else(|| default_client_config(client))
}

fn default_client_config(client: &ClientDefinition) -> ClientModificationConfig {
    ClientModificationConfig {
        platform_id: client.platform_id.to_string(),
        display_name: client.display_name.to_string(),
        local_installer_path: None,
        local_updater_path: None,
        latest_known_version: None,
        update_policy: DEFAULT_UPDATE_POLICY.to_string(),
        path_overlays: Vec::new(),
        asset_caches: Vec::new(),
        updated_at: None,
    }
}

fn normalize_client_config(
    input: ClientModificationConfig,
    client: &ClientDefinition,
    updated_at: Option<String>,
) -> Result<ClientModificationConfig, String> {
    let local_targets_root = client_manager_local_targets_root()?;
    normalize_client_config_with_local_target_root(input, client, updated_at, &local_targets_root)
}

fn normalize_client_config_with_local_target_root(
    input: ClientModificationConfig,
    client: &ClientDefinition,
    updated_at: Option<String>,
    local_targets_root: &Path,
) -> Result<ClientModificationConfig, String> {
    Ok(ClientModificationConfig {
        platform_id: client.platform_id.to_string(),
        display_name: client.display_name.to_string(),
        local_installer_path: normalize_local_client_target_path(
            input.local_installer_path,
            local_targets_root,
            "local installer",
        )?,
        local_updater_path: normalize_local_client_target_path(
            input.local_updater_path,
            local_targets_root,
            "local updater",
        )?,
        latest_known_version: trim_optional_text(input.latest_known_version),
        update_policy: normalize_update_policy(&input.update_policy)?,
        path_overlays: normalize_path_overlays(input.path_overlays),
        asset_caches: normalize_asset_caches(input.asset_caches),
        updated_at,
    })
}

fn normalize_client_polling_settings(
    input: ClientPollingSettings,
    updated_at: Option<String>,
) -> ClientPollingSettings {
    ClientPollingSettings {
        lifecycle_poll_interval_seconds: input.lifecycle_poll_interval_seconds.clamp(
            MIN_CLIENT_LIFECYCLE_POLL_INTERVAL_SECONDS,
            MAX_CLIENT_LIFECYCLE_POLL_INTERVAL_SECONDS,
        ),
        updated_at: updated_at.or(input.updated_at),
    }
}

fn client_lifecycle_poll_interval_seconds() -> u64 {
    read_client_manager_store()
        .map(|store| normalize_client_polling_settings(store.polling_settings, None))
        .map(|settings| settings.lifecycle_poll_interval_seconds)
        .unwrap_or(DEFAULT_CLIENT_LIFECYCLE_POLL_INTERVAL_SECONDS)
}

fn normalize_update_policy(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(DEFAULT_UPDATE_POLICY.to_string());
    }
    match trimmed {
        "manual" | "notifyOnly" | "openClient" | "autoApply" => Ok(trimmed.to_string()),
        _ => Err(format!("Unsupported client update policy: {trimmed}")),
    }
}

fn normalize_path_overlays(entries: Vec<ClientPathOverlay>) -> Vec<ClientPathOverlay> {
    entries
        .into_iter()
        .take(MAX_CONFIG_PATH_ENTRIES)
        .enumerate()
        .filter_map(|(index, entry)| {
            let source_path = trim_text(entry.source_path);
            let target_path = trim_text(entry.target_path);
            if source_path.is_empty() || target_path.is_empty() {
                return None;
            }
            let label = trim_text(entry.label);
            Some(ClientPathOverlay {
                id: normalize_entry_id(&entry.id, "overlay", index, &source_path),
                label: if label.is_empty() {
                    format!("Overlay {}", index + 1)
                } else {
                    label
                },
                source_path,
                target_path,
                enabled: entry.enabled,
                read_only: entry.read_only,
                notes: trim_optional_text(entry.notes),
            })
        })
        .collect()
}

fn normalize_asset_caches(entries: Vec<ClientAssetCacheEntry>) -> Vec<ClientAssetCacheEntry> {
    entries
        .into_iter()
        .take(MAX_CONFIG_PATH_ENTRIES)
        .enumerate()
        .filter_map(|(index, entry)| {
            let cache_key = normalize_asset_cache_key(&entry.cache_key);
            let cache_path = trim_text(entry.cache_path);
            if cache_key.is_empty() || cache_path.is_empty() {
                return None;
            }
            let label = trim_text(entry.label);
            Some(ClientAssetCacheEntry {
                id: normalize_entry_id(&entry.id, "asset-cache", index, &cache_key),
                label: if label.is_empty() {
                    format!("Asset Cache {}", index + 1)
                } else {
                    label
                },
                cache_key,
                cache_path,
                enabled: entry.enabled,
                priority: entry.priority.clamp(0, 999),
                notes: trim_optional_text(entry.notes),
            })
        })
        .collect()
}

fn normalize_asset_cache_key(value: &str) -> String {
    let mut normalized = String::new();
    let mut last_was_separator = false;

    for character in value.trim().chars() {
        if character.is_ascii_alphanumeric() {
            normalized.push(character.to_ascii_lowercase());
            last_was_separator = false;
        } else if matches!(character, '-' | '_' | '.' | ':' | '/' | '\\' | ' ')
            && !normalized.is_empty()
            && !last_was_separator
        {
            normalized.push('-');
            last_was_separator = true;
        }
        if normalized.len() >= MAX_TEXT_FIELD_LENGTH {
            break;
        }
    }

    normalized.trim_matches('-').to_string()
}

#[derive(Debug, Clone)]
struct AssetCacheCandidate {
    cache_key: String,
    owner_platform_id: String,
    owner_display_name: String,
    entry_id: String,
    label: String,
    cache_path: String,
    priority: i32,
}

fn build_asset_cache_lookup(
    store: &ClientManagerStore,
    generated_at: DateTime<Utc>,
) -> ClientAssetCacheLookup {
    let mut grouped: HashMap<String, Vec<AssetCacheCandidate>> = HashMap::new();

    for client in CLIENTS {
        let config = config_for_client(store, client);
        for entry in config.asset_caches.iter().filter(|entry| entry.enabled) {
            let cache_key = normalize_asset_cache_key(&entry.cache_key);
            let cache_path = entry.cache_path.trim();
            if cache_key.is_empty() || cache_path.is_empty() {
                continue;
            }

            grouped
                .entry(cache_key.clone())
                .or_default()
                .push(AssetCacheCandidate {
                    cache_key,
                    owner_platform_id: client.platform_id.to_string(),
                    owner_display_name: client.display_name.to_string(),
                    entry_id: entry.id.clone(),
                    label: entry.label.clone(),
                    cache_path: cache_path.to_string(),
                    priority: entry.priority,
                });
        }
    }

    let mut entries = Vec::new();
    let mut conflicts = Vec::new();
    let mut keys = grouped.keys().cloned().collect::<Vec<_>>();
    keys.sort();

    for key in keys {
        let Some(mut group) = grouped.remove(&key) else {
            continue;
        };
        group.sort_by(|left, right| {
            right
                .priority
                .cmp(&left.priority)
                .then_with(|| left.owner_platform_id.cmp(&right.owner_platform_id))
                .then_with(|| left.entry_id.cmp(&right.entry_id))
        });

        let conflict_count = group.len().saturating_sub(1);
        if let Some(winner) = group.first() {
            entries.push(ClientAssetCacheLookupEntry {
                cache_key: winner.cache_key.clone(),
                owner_platform_id: winner.owner_platform_id.clone(),
                owner_display_name: winner.owner_display_name.clone(),
                entry_id: winner.entry_id.clone(),
                label: winner.label.clone(),
                cache_path: winner.cache_path.clone(),
                priority: winner.priority,
                conflict_count,
            });
        }

        if group.len() > 1 {
            conflicts.push(ClientAssetCacheConflict {
                cache_key: key,
                entries: group
                    .into_iter()
                    .map(|entry| ClientAssetCacheConflictEntry {
                        owner_platform_id: entry.owner_platform_id,
                        owner_display_name: entry.owner_display_name,
                        entry_id: entry.entry_id,
                        label: entry.label,
                        cache_path: entry.cache_path,
                        priority: entry.priority,
                    })
                    .collect(),
            });
        }
    }

    ClientAssetCacheLookup {
        generated_at: iso_datetime(generated_at),
        entries,
        conflicts,
    }
}

fn normalize_entry_id(value: &str, prefix: &str, index: usize, fallback: &str) -> String {
    let trimmed = value.trim();
    if !trimmed.is_empty()
        && trimmed.len() <= 80
        && trimmed
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return trimmed.to_string();
    }

    let suffix = compact_process_key(fallback);
    if suffix.is_empty() {
        format!("{prefix}-{}", index + 1)
    } else {
        format!("{prefix}-{}-{suffix}", index + 1)
    }
}

fn trim_text(value: String) -> String {
    let mut value = value.trim().to_string();
    if value.len() > MAX_TEXT_FIELD_LENGTH {
        value.truncate(MAX_TEXT_FIELD_LENGTH);
    }
    value
}

fn trim_optional_text(value: Option<String>) -> Option<String> {
    value.map(trim_text).filter(|value| !value.is_empty())
}

fn safe_existing_local_client_target(path: &str) -> bool {
    safe_local_client_target_string(path).is_some()
}

fn safe_local_client_target_string(path: &str) -> Option<String> {
    let root = client_manager_local_targets_root().ok()?;
    canonical_local_client_target(path, &root, "local client target")
        .ok()
        .map(|path| path_to_lossy_string(&path))
}

fn normalize_local_client_target_path(
    value: Option<String>,
    root: &Path,
    label: &str,
) -> Result<Option<String>, String> {
    let Some(value) = trim_optional_text(value) else {
        return Ok(None);
    };
    canonical_local_client_target(&value, root, label).map(|path| Some(path_to_lossy_string(&path)))
}

fn canonical_local_client_target(value: &str, root: &Path, label: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(value.trim());
    if !path.is_absolute() {
        return Err(format!("{label} path must be absolute."));
    }
    let canonical_root = root.canonicalize().map_err(|error| {
        format!(
            "Could not canonicalize Client Manager local target root {}: {error}",
            root.display()
        )
    })?;
    let canonical_path = path
        .canonicalize()
        .map_err(|error| format!("Could not canonicalize {label} path: {error}"))?;
    if !canonical_path.is_file() {
        return Err(format!("{label} path must be an existing file."));
    }
    if !canonical_path.starts_with(&canonical_root) {
        return Err(format!(
            "{label} path must stay inside Client Manager local target root {}.",
            canonical_root.display()
        ));
    }
    Ok(canonical_path)
}

fn read_client_manager_store() -> Result<ClientManagerStore, String> {
    let path = client_manager_store_path()?;
    if !path.exists() {
        return Ok(ClientManagerStore::default());
    }
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read client-manager config: {error}"))?;
    serde_json::from_str::<ClientManagerStore>(&contents)
        .map_err(|error| format!("Could not parse client-manager config: {error}"))
}

fn write_client_manager_store(store: &ClientManagerStore) -> Result<(), String> {
    let path = client_manager_store_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create client-manager config dir: {error}"))?;
    }
    let json = serde_json::to_string_pretty(store)
        .map_err(|error| format!("Could not encode client-manager config: {error}"))?;
    fs::write(path, json).map_err(|error| format!("Could not write client-manager config: {error}"))
}

fn client_manager_store_path() -> Result<PathBuf, String> {
    client_manager_data_dir().map(|dir| dir.join(CLIENT_MANAGER_FILE))
}

fn client_manager_local_targets_root() -> Result<PathBuf, String> {
    client_manager_data_dir().map(|dir| dir.join(CLIENT_MANAGER_LOCAL_TARGETS_DIR))
}

fn client_manager_data_dir() -> Result<PathBuf, String> {
    dirs::data_local_dir()
        .or_else(dirs::data_dir)
        .map(|dir| dir.join(CLIENT_MANAGER_DIR))
        .ok_or_else(|| "Could not resolve Open Game Launcher data directory.".to_string())
}

fn now_iso() -> String {
    iso_datetime(Utc::now())
}

fn iso_datetime(value: DateTime<Utc>) -> String {
    value.to_rfc3339_opts(SecondsFormat::Secs, true)
}

fn parse_iso_datetime(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|value| value.with_timezone(&Utc))
}

fn compare_version_strings(current: &str, latest: &str) -> Option<Ordering> {
    let current_tokens = version_tokens(current);
    let latest_tokens = version_tokens(latest);
    if current_tokens.is_empty() || latest_tokens.is_empty() {
        return None;
    }

    let max_len = current_tokens.len().max(latest_tokens.len());
    for index in 0..max_len {
        let left = current_tokens.get(index);
        let right = latest_tokens.get(index);
        match (left, right) {
            (Some(VersionToken::Number(left)), Some(VersionToken::Number(right))) => {
                match left.cmp(right) {
                    Ordering::Equal => {}
                    ordering => return Some(ordering),
                }
            }
            (Some(VersionToken::Text(left)), Some(VersionToken::Text(right))) => {
                match left.cmp(right) {
                    Ordering::Equal => {}
                    ordering => return Some(ordering),
                }
            }
            (Some(VersionToken::Number(_)), Some(VersionToken::Text(_))) => {
                return Some(Ordering::Greater);
            }
            (Some(VersionToken::Text(_)), Some(VersionToken::Number(_))) => {
                return Some(Ordering::Less);
            }
            (Some(VersionToken::Number(left)), None) => {
                if *left > 0 {
                    return Some(Ordering::Greater);
                }
            }
            (None, Some(VersionToken::Number(right))) => {
                if *right > 0 {
                    return Some(Ordering::Less);
                }
            }
            (Some(VersionToken::Text(left)), None) => {
                if !left.is_empty() {
                    return Some(Ordering::Greater);
                }
            }
            (None, Some(VersionToken::Text(right))) => {
                if !right.is_empty() {
                    return Some(Ordering::Less);
                }
            }
            (None, None) => break,
        }
    }

    Some(Ordering::Equal)
}

#[derive(Debug, PartialEq, Eq)]
enum VersionToken {
    Number(u64),
    Text(String),
}

fn version_tokens(value: &str) -> Vec<VersionToken> {
    value
        .split(|character: char| {
            character == '.'
                || character == '-'
                || character == '_'
                || character == '+'
                || character.is_whitespace()
        })
        .filter_map(|token| {
            let token = token.trim();
            if token.is_empty() {
                return None;
            }
            token
                .parse::<u64>()
                .map(VersionToken::Number)
                .ok()
                .or_else(|| Some(VersionToken::Text(token.to_ascii_lowercase())))
        })
        .collect()
}

fn detect_client_version(platform_id: &str, install_path: Option<&str>) -> Option<String> {
    windows_uninstall_display_version(platform_id)
        .or_else(|| macos_bundle_version(install_path))
        .or_else(|| linux_flatpak_version(platform_id))
}

#[cfg(target_os = "windows")]
fn windows_uninstall_display_version(platform_id: &str) -> Option<String> {
    let display_fragments = uninstall_display_fragments(platform_id);
    if display_fragments.is_empty() {
        return None;
    }

    for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        for uninstall_key in [
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall",
            r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        ] {
            if let Some(version) =
                read_uninstall_display_version(hive, uninstall_key, display_fragments)
            {
                return Some(version);
            }
        }
    }

    None
}

#[cfg(not(target_os = "windows"))]
fn windows_uninstall_display_version(_platform_id: &str) -> Option<String> {
    None
}

#[cfg(target_os = "windows")]
fn read_uninstall_display_version(
    hive: HKEY,
    uninstall_key: &str,
    display_fragments: &[&str],
) -> Option<String> {
    let root = RegKey::predef(hive);
    let key = root.open_subkey_with_flags(uninstall_key, KEY_READ).ok()?;
    for subkey_name in key.enum_keys().flatten() {
        let Ok(subkey) = key.open_subkey_with_flags(&subkey_name, KEY_READ) else {
            continue;
        };
        let Ok(display_name) = subkey.get_value::<String, _>("DisplayName") else {
            continue;
        };
        let display_name = display_name.to_lowercase();
        if !display_fragments
            .iter()
            .any(|fragment| display_name.contains(fragment))
        {
            continue;
        }
        if let Ok(version) = subkey.get_value::<String, _>("DisplayVersion") {
            let version = version.trim().to_string();
            if !version.is_empty() {
                return Some(version);
            }
        }
    }

    None
}

fn macos_bundle_version(install_path: Option<&str>) -> Option<String> {
    let path = PathBuf::from(install_path?);
    let info_plist = path.join("Contents").join("Info.plist");
    let contents = fs::read_to_string(info_plist).ok()?;
    plist_string_value(&contents, "CFBundleShortVersionString")
        .or_else(|| plist_string_value(&contents, "CFBundleVersion"))
}

fn plist_string_value(contents: &str, key: &str) -> Option<String> {
    let key_marker = format!("<key>{key}</key>");
    let key_index = contents.find(&key_marker)?;
    let after_key = &contents[key_index + key_marker.len()..];
    let string_start = after_key.find("<string>")? + "<string>".len();
    let after_start = &after_key[string_start..];
    let string_end = after_start.find("</string>")?;
    let value = after_start[..string_end].trim().to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

#[cfg(target_os = "linux")]
fn linux_flatpak_version(platform_id: &str) -> Option<String> {
    let flatpak_id = match platform_id {
        "steam" => "com.valvesoftware.Steam",
        _ => return None,
    };
    let output = std::process::Command::new("flatpak")
        .args(["info", flatpak_id])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout.lines().find_map(|line| {
        let (key, value) = line.split_once(':')?;
        if key.trim().eq_ignore_ascii_case("Version") {
            let version = value.trim().to_string();
            if !version.is_empty() {
                return Some(version);
            }
        }
        None
    })
}

#[cfg(not(target_os = "linux"))]
fn linux_flatpak_version(_platform_id: &str) -> Option<String> {
    None
}

#[derive(Debug, Clone)]
struct RunningClientProcess {
    pid: Option<u32>,
    process_name: String,
    uptime_seconds: Option<u64>,
    install_path: Option<String>,
    window: Option<ClientWindowInfo>,
}

#[derive(Debug, Clone)]
struct ProcessSnapshot {
    pid: Option<u32>,
    process_name: String,
    uptime_seconds: Option<u64>,
    install_path: Option<String>,
}

#[derive(Debug, Clone)]
struct ClientWindowInfo {
    handle: String,
    title: Option<String>,
}

fn find_running_process(
    client: &ClientDefinition,
    system: &System,
    process_windows: &HashMap<u32, ClientWindowInfo>,
) -> Option<RunningClientProcess> {
    let snapshots = system
        .processes()
        .iter()
        .map(|(pid, process)| ProcessSnapshot {
            install_path: process
                .exe()
                .and_then(|exe| exe.parent())
                .and_then(path_to_string),
            pid: pid.to_string().parse::<u32>().ok(),
            process_name: process.name().to_string_lossy().to_string(),
            uptime_seconds: Some(process.run_time()),
        })
        .collect::<Vec<_>>();

    find_running_process_in_snapshots(client, &snapshots, process_windows)
}

fn find_running_process_in_snapshots(
    client: &ClientDefinition,
    snapshots: &[ProcessSnapshot],
    process_windows: &HashMap<u32, ClientWindowInfo>,
) -> Option<RunningClientProcess> {
    let mut fallback = None;

    for process in snapshots {
        let process_name = normalize_process_name(&process.process_name);
        let process_key = compact_process_key(&process_name);
        let matches = client.process_names.iter().any(|candidate| {
            let candidate_name = normalize_process_name(candidate);
            process_name == candidate_name || process_key == compact_process_key(&candidate_name)
        });

        if matches {
            let window = process
                .pid
                .and_then(|pid| process_windows.get(&pid).cloned());
            let running_process = RunningClientProcess {
                install_path: process.install_path.clone(),
                pid: process.pid,
                process_name: process.process_name.clone(),
                uptime_seconds: process.uptime_seconds,
                window,
            };

            if running_process.window.is_some() {
                return Some(running_process);
            }

            if fallback.is_none() {
                fallback = Some(running_process);
            }
        }
    }

    fallback
}

#[cfg(target_os = "windows")]
fn collect_process_windows() -> HashMap<u32, ClientWindowInfo> {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::core::BOOL;
    use windows_sys::Win32::Foundation::{HWND, LPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
        IsWindowVisible,
    };

    unsafe extern "system" fn enum_window(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let process_windows = &mut *(lparam as *mut HashMap<u32, ClientWindowInfo>);
        if IsWindowVisible(hwnd) == 0 {
            return 1;
        }

        let mut process_id = 0u32;
        GetWindowThreadProcessId(hwnd, &mut process_id);
        if process_id == 0 || process_windows.contains_key(&process_id) {
            return 1;
        }

        let title = read_window_title(hwnd);
        if title.as_deref().is_none_or(|value| value.trim().is_empty()) {
            return 1;
        }

        process_windows.insert(
            process_id,
            ClientWindowInfo {
                handle: format!("0x{:x}", hwnd as usize),
                title,
            },
        );
        1
    }

    unsafe fn read_window_title(hwnd: HWND) -> Option<String> {
        let length = GetWindowTextLengthW(hwnd);
        if length <= 0 {
            return None;
        }

        let mut buffer = vec![0u16; length as usize + 1];
        let copied = GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32);
        if copied <= 0 {
            return None;
        }

        let title = OsString::from_wide(&buffer[..copied as usize])
            .to_string_lossy()
            .trim()
            .to_string();
        (!title.is_empty()).then_some(title)
    }

    let mut process_windows = HashMap::new();
    // SAFETY: EnumWindows calls the callback synchronously while the HashMap
    // pointer remains valid for the entire call.
    unsafe {
        EnumWindows(Some(enum_window), &mut process_windows as *mut _ as LPARAM);
    }
    process_windows
}

#[cfg(not(target_os = "windows"))]
fn collect_process_windows() -> HashMap<u32, ClientWindowInfo> {
    HashMap::new()
}

fn normalize_process_name(name: &str) -> String {
    let file_name = Path::new(name)
        .file_name()
        .and_then(|file_name| file_name.to_str())
        .unwrap_or(name)
        .trim()
        .to_lowercase();

    file_name
        .strip_suffix(".exe")
        .unwrap_or(&file_name)
        .to_string()
}

fn compact_process_key(name: &str) -> String {
    name.chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .map(|character| character.to_ascii_lowercase())
        .collect()
}

fn detect_client_install_path(platform_id: &str) -> Option<String> {
    known_install_paths(platform_id)
        .into_iter()
        .find(|path| path.exists())
        .and_then(|path| path_to_string(path.as_path()))
        .or_else(|| windows_uninstall_install_path(platform_id))
}

fn has_install_signal(platform_id: &str) -> bool {
    known_install_signal_paths(platform_id)
        .into_iter()
        .any(|path| path.exists())
}

fn known_install_paths(platform_id: &str) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    let home = dirs::home_dir();

    #[cfg(target_os = "windows")]
    {
        let program_files = std::env::var_os("ProgramFiles").map(PathBuf::from);
        let program_files_x86 = std::env::var_os("ProgramFiles(x86)").map(PathBuf::from);
        let local_app_data = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);

        match platform_id {
            "steam" => {
                if let Some(path) = steam_path_from_registry() {
                    paths.push(path);
                }
                push_joined(&mut paths, program_files_x86.as_ref(), &["Steam"]);
                push_joined(&mut paths, program_files.as_ref(), &["Steam"]);
                paths.push(PathBuf::from(r"C:\Steam"));
            }
            "epic" => {
                push_joined(
                    &mut paths,
                    program_files_x86.as_ref(),
                    &["Epic Games", "Launcher", "Portal", "Binaries", "Win64"],
                );
                push_joined(
                    &mut paths,
                    program_files.as_ref(),
                    &["Epic Games", "Launcher", "Portal", "Binaries", "Win64"],
                );
            }
            "gog" => {
                push_joined(&mut paths, program_files_x86.as_ref(), &["GOG Galaxy"]);
                push_joined(&mut paths, program_files.as_ref(), &["GOG Galaxy"]);
            }
            "xbox" => {
                push_joined(
                    &mut paths,
                    local_app_data.as_ref(),
                    &["Microsoft", "WindowsApps", "XboxPcApp.exe"],
                );
            }
            "ubisoft" => {
                push_joined(
                    &mut paths,
                    program_files_x86.as_ref(),
                    &["Ubisoft", "Ubisoft Game Launcher"],
                );
                push_joined(
                    &mut paths,
                    program_files.as_ref(),
                    &["Ubisoft", "Ubisoft Game Launcher"],
                );
            }
            "battlenet" => {
                push_joined(&mut paths, program_files_x86.as_ref(), &["Battle.net"]);
                push_joined(&mut paths, program_files.as_ref(), &["Battle.net"]);
            }
            "ea" => {
                push_joined(
                    &mut paths,
                    program_files.as_ref(),
                    &["Electronic Arts", "EA Desktop", "EA Desktop"],
                );
                push_joined(&mut paths, program_files_x86.as_ref(), &["Origin"]);
                push_joined(&mut paths, program_files.as_ref(), &["Origin"]);
            }
            _ => {}
        }
    }

    #[cfg(target_os = "macos")]
    {
        match platform_id {
            "steam" => {
                if let Some(home) = home.as_ref() {
                    paths.push(
                        home.join("Library")
                            .join("Application Support")
                            .join("Steam"),
                    );
                }
                paths.push(PathBuf::from("/Applications/Steam.app"));
            }
            "epic" => paths.push(PathBuf::from("/Applications/Epic Games Launcher.app")),
            "gog" => paths.push(PathBuf::from("/Applications/GOG Galaxy.app")),
            "ubisoft" => paths.push(PathBuf::from("/Applications/Ubisoft Connect.app")),
            "battlenet" => paths.push(PathBuf::from("/Applications/Battle.net.app")),
            "ea" => {
                paths.push(PathBuf::from("/Applications/EA app.app"));
                paths.push(PathBuf::from("/Applications/Origin.app"));
            }
            _ => {}
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(home) = home.as_ref() {
            match platform_id {
                "steam" => {
                    paths.push(home.join(".local").join("share").join("Steam"));
                    paths.push(home.join(".steam").join("steam"));
                    paths.push(home.join(".steam").join("root"));
                    paths.push(
                        home.join(".var")
                            .join("app")
                            .join("com.valvesoftware.Steam")
                            .join(".local")
                            .join("share")
                            .join("Steam"),
                    );
                    paths.push(
                        home.join(".var")
                            .join("app")
                            .join("com.valvesoftware.Steam")
                            .join("data")
                            .join("Steam"),
                    );
                }
                "epic" => {
                    paths.push(home.join(".config").join("legendary"));
                    paths.push(home.join(".config").join("heroic"));
                }
                "gog" => {
                    paths.push(home.join("GOG Games"));
                    paths.push(home.join(".config").join("heroic"));
                }
                _ => {}
            }
        }
    }

    paths
}

fn known_install_signal_paths(platform_id: &str) -> Vec<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let mut paths = Vec::new();
        let program_data = std::env::var_os("ProgramData")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(r"C:\ProgramData"));
        let local_app_data = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);

        match platform_id {
            "steam" => {
                if let Some(path) = steam_path_from_registry() {
                    paths.push(path);
                }
            }
            "epic" => paths.push(
                program_data
                    .join("Epic")
                    .join("EpicGamesLauncher")
                    .join("Data")
                    .join("Manifests"),
            ),
            "gog" => paths.push(program_data.join("GOG.com").join("Galaxy")),
            "xbox" => {
                if let Some(local_app_data) = local_app_data.as_ref() {
                    paths.push(
                        local_app_data
                            .join("Packages")
                            .join("Microsoft.GamingApp_8wekyb3d8bbwe"),
                    );
                }
            }
            "ubisoft" => {
                if let Some(local_app_data) = local_app_data.as_ref() {
                    paths.push(local_app_data.join("Ubisoft Game Launcher"));
                }
                paths.push(program_data.join("Ubisoft"));
            }
            "battlenet" => paths.push(program_data.join("Battle.net")),
            "ea" => {
                paths.push(program_data.join("EA Desktop"));
                paths.push(program_data.join("Origin"));
            }
            _ => {}
        }

        paths
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = platform_id;
        Vec::new()
    }
}

#[cfg(target_os = "windows")]
fn push_joined(paths: &mut Vec<PathBuf>, base: Option<&PathBuf>, segments: &[&str]) {
    let Some(base) = base else {
        return;
    };
    let mut path = base.clone();
    for segment in segments {
        path.push(segment);
    }
    paths.push(path);
}

#[cfg(target_os = "windows")]
fn windows_uninstall_install_path(platform_id: &str) -> Option<String> {
    let display_fragments = uninstall_display_fragments(platform_id);
    if display_fragments.is_empty() {
        return None;
    }

    for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        for uninstall_key in [
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall",
            r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        ] {
            if let Some(path) = read_uninstall_install_path(hive, uninstall_key, display_fragments)
            {
                return path_to_string(path.as_path());
            }
        }
    }

    None
}

#[cfg(target_os = "windows")]
fn uninstall_display_fragments(platform_id: &str) -> &'static [&'static str] {
    match platform_id {
        "epic" => &["epic games launcher"],
        "gog" => &["gog galaxy"],
        "xbox" => &["xbox"],
        "ubisoft" => &["ubisoft connect", "ubisoft game launcher", "uplay"],
        "battlenet" => &["battle.net", "blizzard"],
        "ea" => &["ea app", "ea desktop", "origin"],
        "steam" => &["steam"],
        _ => &[],
    }
}

#[cfg(not(target_os = "windows"))]
fn windows_uninstall_install_path(_platform_id: &str) -> Option<String> {
    None
}

#[cfg(target_os = "windows")]
fn read_uninstall_install_path(
    hive: HKEY,
    uninstall_key: &str,
    display_fragments: &[&str],
) -> Option<PathBuf> {
    let root = RegKey::predef(hive);
    let key = root.open_subkey_with_flags(uninstall_key, KEY_READ).ok()?;
    for subkey_name in key.enum_keys().flatten() {
        let Ok(subkey) = key.open_subkey_with_flags(&subkey_name, KEY_READ) else {
            continue;
        };
        let Ok(display_name) = subkey.get_value::<String, _>("DisplayName") else {
            continue;
        };
        let display_name = display_name.to_lowercase();
        if !display_fragments
            .iter()
            .any(|fragment| display_name.contains(fragment))
        {
            continue;
        }
        if let Ok(install_location) = subkey.get_value::<String, _>("InstallLocation") {
            let path = PathBuf::from(install_location);
            if path.exists() {
                return Some(path);
            }
        }
    }

    None
}

#[cfg(target_os = "windows")]
fn steam_path_from_registry() -> Option<PathBuf> {
    for (hive, key_path) in [
        (HKEY_CURRENT_USER, r"Software\Valve\Steam"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Valve\Steam"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\Valve\Steam"),
    ] {
        let root = RegKey::predef(hive);
        let Ok(key) = root.open_subkey_with_flags(key_path, KEY_READ) else {
            continue;
        };
        for value_name in ["SteamPath", "InstallPath"] {
            let Ok(value) = key.get_value::<String, _>(value_name) else {
                continue;
            };
            let path = PathBuf::from(value);
            if path.exists() {
                return Some(path);
            }
        }
    }

    None
}

fn path_to_string(path: &Path) -> Option<String> {
    let value = path.to_string_lossy().trim().to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    fn temp_client_manager_sandbox_dir(label: &str) -> PathBuf {
        let path = env::temp_dir().join(format!(
            "og-client-sandbox-{label}-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn sandbox_request(
        source_path: &Path,
        target_path: &Path,
    ) -> ClientManagerMountApplySandboxRequest {
        let source_path = path_to_lossy_string(source_path);
        let target_path = path_to_lossy_string(target_path);
        ClientManagerMountApplySandboxRequest {
            consent: ClientManagerMountApplySandboxConsent {
                accepted: true,
                operation: CLIENT_MANAGER_SANDBOX_OPERATION.to_string(),
                source_path: source_path.clone(),
                target_path: target_path.clone(),
            },
            source_path,
            target_path,
        }
    }

    fn test_update_status(
        client: &ClientDefinition,
        update_policy: &str,
        update_available: bool,
    ) -> ClientUpdateStatus {
        ClientUpdateStatus {
            can_open_updater: true,
            detail: if update_available {
                "1.0.0 < 2.0.0".to_string()
            } else {
                "Installed version is current.".to_string()
            },
            display_name: client.display_name.to_string(),
            history: Vec::new(),
            installed: true,
            installed_version: Some("1.0.0".to_string()),
            last_checked_at: "2026-06-10T10:00:00Z".to_string(),
            last_scheduled_check_at: None,
            latest_known_version: Some("2.0.0".to_string()),
            local_updater_path: None,
            next_scheduled_check_at: None,
            official_download_uri: client.official_download_uri.map(str::to_string),
            platform_id: client.platform_id.to_string(),
            running: false,
            scheduler_enabled: update_policy != DEFAULT_UPDATE_POLICY,
            status_label: if update_available {
                "Update available".to_string()
            } else {
                "Current".to_string()
            },
            update_available,
            update_policy: update_policy.to_string(),
        }
    }

    fn test_health(platform_id: &str, running: bool) -> PlatformClientHealth {
        PlatformClientHealth {
            can_launch: true,
            display_name: "Steam".to_string(),
            install_path: Some("/usr/bin/steam".to_string()),
            installed: true,
            last_checked_at: "2026-06-10T10:00:00Z".to_string(),
            pid: running.then_some(42),
            platform_id: platform_id.to_string(),
            process_name: running.then(|| "steam".to_string()),
            running,
            status_label: if running { "Running" } else { "Available" }.to_string(),
            uptime_seconds: running.then_some(3600),
            window_handle: running.then(|| "0x1234".to_string()),
            window_title: running.then(|| "Steam Library".to_string()),
        }
    }

    fn missing_health(platform_id: &str) -> PlatformClientHealth {
        let mut health = test_health(platform_id, false);
        health.installed = false;
        health.install_path = None;
        health.status_label = "Missing".to_string();
        health
    }

    #[test]
    fn compact_process_key_matches_punctuated_client_names() {
        assert_eq!(
            compact_process_key("battle.net"),
            compact_process_key("Battle net")
        );
        assert_eq!(
            compact_process_key("epicgameslauncher"),
            compact_process_key("Epic Games Launcher"),
        );
    }

    #[test]
    fn normalize_process_name_strips_exe_suffix() {
        assert_eq!(normalize_process_name("Steam.exe"), "steam");
        assert_eq!(normalize_process_name("C:/Games/EA app.exe"), "ea app");
    }

    #[test]
    fn client_lifecycle_event_detects_started_transition() {
        let previous = test_health("steam", false);
        let current = test_health("steam", true);

        let event = client_lifecycle_event_for_transition(&previous, &current).unwrap();

        assert_eq!(event.event, "client_started");
        assert_eq!(event.platform_id, "steam");
        assert!(event.running);
        assert_eq!(event.pid, Some(42));
        assert_eq!(event.process_name.as_deref(), Some("steam"));
        assert_eq!(event.uptime_seconds, Some(3600));
        assert_eq!(event.window_handle.as_deref(), Some("0x1234"));
        assert_eq!(event.window_title.as_deref(), Some("Steam Library"));
    }

    #[test]
    fn client_lifecycle_event_detects_stopped_transition() {
        let previous = test_health("steam", true);
        let current = test_health("steam", false);

        let event = client_lifecycle_event_for_transition(&previous, &current).unwrap();

        assert_eq!(event.event, "client_stopped");
        assert_eq!(event.platform_id, "steam");
        assert!(!event.running);
        assert_eq!(event.pid, Some(42));
        assert_eq!(event.process_name.as_deref(), Some("steam"));
        assert_eq!(event.uptime_seconds, Some(3600));
        assert_eq!(event.window_handle.as_deref(), Some("0x1234"));
        assert_eq!(event.window_title.as_deref(), Some("Steam Library"));
    }

    #[test]
    fn client_lifecycle_event_ignores_unchanged_running_state() {
        let previous = test_health("steam", true);
        let current = test_health("steam", true);

        assert!(client_lifecycle_event_for_transition(&previous, &current).is_none());
    }

    #[test]
    fn client_lifecycle_event_detects_window_metadata_change() {
        let previous = test_health("steam", true);
        let mut current = test_health("steam", true);
        current.window_handle = Some("0xbeef".to_string());
        current.window_title = Some("Steam Downloads".to_string());

        let event = client_lifecycle_event_for_transition(&previous, &current).unwrap();

        assert_eq!(event.event, "client_window_updated");
        assert_eq!(event.platform_id, "steam");
        assert!(event.running);
        assert_eq!(event.pid, Some(42));
        assert_eq!(event.process_name.as_deref(), Some("steam"));
        assert_eq!(event.window_handle.as_deref(), Some("0xbeef"));
        assert_eq!(event.window_title.as_deref(), Some("Steam Downloads"));
    }

    #[test]
    fn client_manager_mount_apply_sandbox_copies_hashes_and_rolls_back_created_target() {
        let root = temp_client_manager_sandbox_dir("proof");
        let source = root.join("source");
        let target = root.join("target");
        fs::create_dir_all(source.join("nested")).unwrap();
        fs::write(source.join("nested").join("asset.bin"), b"asset").unwrap();
        fs::write(source.join("config.json"), br#"{"enabled":true}"#).unwrap();

        let proof = run_client_manager_mount_apply_sandbox_proof(sandbox_request(&source, &target))
            .unwrap();

        assert_eq!(proof.file_count, 2);
        assert_eq!(proof.verified_files, 2);
        assert_eq!(proof.bytes_copied, 21);
        assert!(proof.rollback_verified);
        assert!(proof.target_created);
        assert!(proof.symlink_free);
        assert!(!proof.provider_paths_touched);
        assert!(!proof.admin_elevation_used);
        assert!(!proof.mounted_paths_created);
        assert!(proof.files.iter().all(|file| file.sha256.len() == 64));
        assert!(!target.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn client_manager_mount_apply_sandbox_leaves_existing_empty_target_empty() {
        let root = temp_client_manager_sandbox_dir("existing-target");
        let source = root.join("source");
        let target = root.join("target");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(source.join("game.dat"), b"payload").unwrap();

        let proof = run_client_manager_mount_apply_sandbox_proof(sandbox_request(&source, &target))
            .unwrap();

        assert!(!proof.target_created);
        assert!(target.exists());
        assert_eq!(fs::read_dir(&target).unwrap().count(), 0);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn client_manager_mount_apply_sandbox_requires_matching_consent() {
        let root = temp_client_manager_sandbox_dir("consent");
        let source = root.join("source");
        let target = root.join("target");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("game.dat"), b"payload").unwrap();
        let mut request = sandbox_request(&source, &target);
        request.consent.target_path = path_to_lossy_string(&root.join("other"));

        let error = run_client_manager_mount_apply_sandbox_proof(request).unwrap_err();

        assert!(error.contains("consent target mismatch"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn client_manager_mount_apply_sandbox_rejects_non_empty_target() {
        let root = temp_client_manager_sandbox_dir("non-empty-target");
        let source = root.join("source");
        let target = root.join("target");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(source.join("game.dat"), b"payload").unwrap();
        fs::write(target.join("existing.dat"), b"keep").unwrap();

        let error = run_client_manager_mount_apply_sandbox_proof(sandbox_request(&source, &target))
            .unwrap_err();

        assert!(error.contains("target must be empty"));
        assert!(target.join("existing.dat").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn client_manager_mount_apply_sandbox_rejects_symlinked_source_entries() {
        use std::os::unix::fs::symlink;

        let root = temp_client_manager_sandbox_dir("source-symlink");
        let source = root.join("source");
        let target = root.join("target");
        fs::create_dir_all(&source).unwrap();
        fs::write(root.join("outside.dat"), b"outside").unwrap();
        symlink(root.join("outside.dat"), source.join("linked.dat")).unwrap();

        let error = run_client_manager_mount_apply_sandbox_proof(sandbox_request(&source, &target))
            .unwrap_err();

        assert!(error.contains("refuses symlinked source entries"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn install_stage_plan_uses_official_source_without_silent_download() {
        let client = CLIENTS
            .iter()
            .find(|candidate| candidate.platform_id == "steam")
            .unwrap();
        let config = default_client_config(client);
        let metadata = client_installer_metadata(client, &config);
        let health = missing_health("steam");

        let plan = build_install_stage_plan(client, &metadata, &health);

        assert_eq!(plan.stage, "officialDownload");
        assert!(plan.can_proceed);
        assert_eq!(
            plan.target_uri.as_deref(),
            Some("https://store.steampowered.com/about/")
        );
        assert!(plan
            .checks
            .iter()
            .any(|check| check.detail.contains("does not download")));
    }

    #[test]
    fn install_stage_plan_blocks_when_client_is_detected() {
        let client = CLIENTS
            .iter()
            .find(|candidate| candidate.platform_id == "steam")
            .unwrap();
        let config = default_client_config(client);
        let metadata = client_installer_metadata(client, &config);
        let health = test_health("steam", true);

        let plan = build_install_stage_plan(client, &metadata, &health);

        assert_eq!(plan.stage, "alreadyInstalled");
        assert!(!plan.can_proceed);
        assert!(plan
            .checks
            .iter()
            .any(|check| check.status == "blocked" && check.label == "Install signal"));
    }

    #[test]
    fn install_stage_plan_uses_configured_local_installer() {
        let client = CLIENTS
            .iter()
            .find(|candidate| candidate.platform_id == "steam")
            .unwrap();
        let metadata = ClientInstallerMetadata {
            can_open_local_installer: true,
            can_open_official_download: true,
            can_open_updater: true,
            display_name: "Steam".to_string(),
            install_action_label: "Run local installer".to_string(),
            install_notes: "test".to_string(),
            local_installer_path: Some("/tmp/SteamSetup.exe".to_string()),
            local_updater_path: None,
            official_download_uri: client.official_download_uri.map(str::to_string),
            platform_id: "steam".to_string(),
            updater_uri: client.updater_uri.map(str::to_string),
            update_action_label: "Open updater".to_string(),
            update_notes: "test".to_string(),
        };
        let health = missing_health("steam");

        let plan = build_install_stage_plan(client, &metadata, &health);

        assert_eq!(plan.stage, "localInstaller");
        assert!(plan.can_proceed);
        assert!(plan.requires_admin_review);
        assert_eq!(plan.target_path.as_deref(), Some("/tmp/SteamSetup.exe"));
    }

    #[test]
    fn compare_version_strings_handles_numeric_segments() {
        assert_eq!(
            compare_version_strings("2.10.1", "2.9.9"),
            Some(Ordering::Greater)
        );
        assert_eq!(
            compare_version_strings("1.2.0", "1.2"),
            Some(Ordering::Equal)
        );
        assert_eq!(
            compare_version_strings("1.2.0", "1.2.1"),
            Some(Ordering::Less)
        );
    }

    #[test]
    fn normalize_client_config_trims_and_drops_empty_entries() {
        let client = CLIENTS
            .iter()
            .find(|candidate| candidate.platform_id == "steam")
            .unwrap();
        let root = temp_client_manager_sandbox_dir("local-target-root");
        let local_targets_root = root.join(CLIENT_MANAGER_LOCAL_TARGETS_DIR);
        fs::create_dir_all(&local_targets_root).unwrap();
        let installer = local_targets_root.join("SteamSetup.exe");
        fs::write(&installer, b"installer").unwrap();
        let installer_input_path = path_to_lossy_string(&installer);
        let installer_path = path_to_lossy_string(&installer.canonicalize().unwrap());
        let input = ClientModificationConfig {
            platform_id: "steam".to_string(),
            display_name: "ignored".to_string(),
            local_installer_path: Some(format!("  {installer_input_path}  ")),
            local_updater_path: Some("  ".to_string()),
            latest_known_version: Some("  3.1.4 ".to_string()),
            update_policy: "manual".to_string(),
            path_overlays: vec![
                ClientPathOverlay {
                    id: "".to_string(),
                    label: " Assets ".to_string(),
                    source_path: " /games/assets ".to_string(),
                    target_path: " /steam/assets ".to_string(),
                    enabled: true,
                    read_only: true,
                    notes: Some("  mirror only ".to_string()),
                },
                ClientPathOverlay {
                    id: "empty".to_string(),
                    label: "Empty".to_string(),
                    source_path: "".to_string(),
                    target_path: "/target".to_string(),
                    enabled: true,
                    read_only: false,
                    notes: None,
                },
            ],
            asset_caches: vec![
                ClientAssetCacheEntry {
                    id: "".to_string(),
                    label: " Hero Art ".to_string(),
                    cache_key: " Steam/App 123 ".to_string(),
                    cache_path: " /cache/steam/123 ".to_string(),
                    enabled: true,
                    priority: 1200,
                    notes: Some("  shared key ".to_string()),
                },
                ClientAssetCacheEntry {
                    id: "empty".to_string(),
                    label: "Empty".to_string(),
                    cache_key: "   ".to_string(),
                    cache_path: "/cache/empty".to_string(),
                    enabled: true,
                    priority: 1,
                    notes: None,
                },
            ],
            updated_at: None,
        };

        let config = normalize_client_config_with_local_target_root(
            input,
            client,
            Some("now".to_string()),
            &local_targets_root,
        )
        .unwrap();

        assert_eq!(config.display_name, "Steam");
        assert_eq!(
            config.local_installer_path.as_deref(),
            Some(installer_path.as_str())
        );
        assert_eq!(config.local_updater_path, None);
        assert_eq!(config.latest_known_version.as_deref(), Some("3.1.4"));
        assert_eq!(config.path_overlays.len(), 1);
        assert_eq!(config.path_overlays[0].label, "Assets");
        assert_eq!(config.path_overlays[0].source_path, "/games/assets");
        assert_eq!(
            config.path_overlays[0].notes.as_deref(),
            Some("mirror only")
        );
        assert_eq!(config.asset_caches.len(), 1);
        assert_eq!(config.asset_caches[0].label, "Hero Art");
        assert_eq!(config.asset_caches[0].cache_key, "steam-app-123");
        assert_eq!(config.asset_caches[0].cache_path, "/cache/steam/123");
        assert_eq!(config.asset_caches[0].priority, 999);
        assert_eq!(config.asset_caches[0].notes.as_deref(), Some("shared key"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn normalize_client_config_rejects_local_target_outside_configured_root() {
        let client = CLIENTS
            .iter()
            .find(|candidate| candidate.platform_id == "steam")
            .unwrap();
        let root = temp_client_manager_sandbox_dir("local-target-escape");
        let local_targets_root = root.join(CLIENT_MANAGER_LOCAL_TARGETS_DIR);
        fs::create_dir_all(&local_targets_root).unwrap();
        let outside = root.join("SteamSetup.exe");
        fs::write(&outside, b"installer").unwrap();
        let mut input = default_client_config(client);
        input.local_installer_path = Some(path_to_lossy_string(&outside));

        let error = normalize_client_config_with_local_target_root(
            input,
            client,
            Some("now".to_string()),
            &local_targets_root,
        )
        .unwrap_err();

        assert!(error.contains("must stay inside Client Manager local target root"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn asset_cache_lookup_keeps_one_winner_per_key_and_reports_conflicts() {
        let steam = CLIENTS
            .iter()
            .find(|candidate| candidate.platform_id == "steam")
            .unwrap();
        let epic = CLIENTS
            .iter()
            .find(|candidate| candidate.platform_id == "epic")
            .unwrap();
        let mut steam_config = default_client_config(steam);
        steam_config.asset_caches.push(ClientAssetCacheEntry {
            id: "steam-hero".to_string(),
            label: "Steam Hero".to_string(),
            cache_key: "Hero/Image".to_string(),
            cache_path: "/cache/steam/hero".to_string(),
            enabled: true,
            priority: 10,
            notes: None,
        });
        let mut epic_config = default_client_config(epic);
        epic_config.asset_caches.push(ClientAssetCacheEntry {
            id: "epic-hero".to_string(),
            label: "Epic Hero".to_string(),
            cache_key: "hero image".to_string(),
            cache_path: "/cache/epic/hero".to_string(),
            enabled: true,
            priority: 20,
            notes: None,
        });
        epic_config.asset_caches.push(ClientAssetCacheEntry {
            id: "disabled".to_string(),
            label: "Disabled".to_string(),
            cache_key: "hero image".to_string(),
            cache_path: "/cache/disabled".to_string(),
            enabled: false,
            priority: 99,
            notes: None,
        });
        let store = ClientManagerStore {
            configs: vec![steam_config, epic_config],
            polling_settings: ClientPollingSettings::default(),
            update_history: Vec::new(),
        };

        let lookup =
            build_asset_cache_lookup(&store, parse_iso_datetime("2026-06-10T10:00:00Z").unwrap());

        assert_eq!(lookup.generated_at, "2026-06-10T10:00:00Z");
        assert_eq!(lookup.entries.len(), 1);
        assert_eq!(lookup.entries[0].cache_key, "hero-image");
        assert_eq!(lookup.entries[0].owner_platform_id, "epic");
        assert_eq!(lookup.entries[0].cache_path, "/cache/epic/hero");
        assert_eq!(lookup.entries[0].conflict_count, 1);
        assert_eq!(lookup.conflicts.len(), 1);
        assert_eq!(lookup.conflicts[0].entries.len(), 2);
        assert_eq!(lookup.conflicts[0].entries[0].owner_platform_id, "epic");
    }

    #[test]
    fn polling_settings_clamp_lifecycle_interval() {
        let low = normalize_client_polling_settings(
            ClientPollingSettings {
                lifecycle_poll_interval_seconds: 1,
                updated_at: None,
            },
            Some("now".to_string()),
        );
        let high = normalize_client_polling_settings(
            ClientPollingSettings {
                lifecycle_poll_interval_seconds: 999,
                updated_at: None,
            },
            None,
        );

        assert_eq!(
            low.lifecycle_poll_interval_seconds,
            MIN_CLIENT_LIFECYCLE_POLL_INTERVAL_SECONDS
        );
        assert_eq!(low.updated_at.as_deref(), Some("now"));
        assert_eq!(
            high.lifecycle_poll_interval_seconds,
            MAX_CLIENT_LIFECYCLE_POLL_INTERVAL_SECONDS
        );
    }

    #[test]
    fn mocked_process_snapshots_match_client_names_and_prefer_window_metadata() {
        let steam = CLIENTS
            .iter()
            .find(|candidate| candidate.platform_id == "steam")
            .unwrap();
        let snapshots = vec![
            ProcessSnapshot {
                install_path: Some("/opt/steam/background".to_string()),
                pid: Some(41),
                process_name: "steamwebhelper".to_string(),
                uptime_seconds: Some(120),
            },
            ProcessSnapshot {
                install_path: Some("/opt/steam".to_string()),
                pid: Some(42),
                process_name: "Steam.exe".to_string(),
                uptime_seconds: Some(3600),
            },
        ];
        let mut windows = HashMap::new();
        windows.insert(
            42,
            ClientWindowInfo {
                handle: "0x2a".to_string(),
                title: Some("Steam Downloads".to_string()),
            },
        );

        let running = find_running_process_in_snapshots(steam, &snapshots, &windows).unwrap();

        assert_eq!(running.pid, Some(42));
        assert_eq!(running.install_path.as_deref(), Some("/opt/steam"));
        assert_eq!(
            running.window.unwrap().title.as_deref(),
            Some("Steam Downloads")
        );
    }

    #[test]
    fn mocked_process_snapshots_match_compacted_provider_names() {
        let battlenet = CLIENTS
            .iter()
            .find(|candidate| candidate.platform_id == "battlenet")
            .unwrap();
        let snapshots = vec![ProcessSnapshot {
            install_path: Some("C:/Program Files/Battle.net".to_string()),
            pid: Some(77),
            process_name: "Battle net.exe".to_string(),
            uptime_seconds: Some(90),
        }];

        let running =
            find_running_process_in_snapshots(battlenet, &snapshots, &HashMap::new()).unwrap();

        assert_eq!(running.pid, Some(77));
        assert_eq!(running.process_name, "Battle net.exe");
    }

    #[test]
    fn remember_update_history_keeps_recent_items_per_client() {
        let client = CLIENTS
            .iter()
            .find(|candidate| candidate.platform_id == "steam")
            .unwrap();
        let mut store = ClientManagerStore::default();

        for index in 0..(MAX_HISTORY_ITEMS_PER_CLIENT + 3) {
            remember_update_history(
                &mut store,
                update_history_item(
                    client,
                    "update_checked",
                    "Manual check",
                    None,
                    None,
                    format!("check {index}"),
                    format!("2026-01-01T00:00:{index:02}Z"),
                ),
            );
        }

        let history = history_for_client(&store, "steam");
        assert_eq!(history.len(), MAX_HISTORY_ITEMS_PER_CLIENT);
        assert_eq!(history[0].message, "check 22");
        assert_eq!(history.last().unwrap().message, "check 3");
    }

    #[test]
    fn scheduled_update_checks_are_due_after_twenty_four_hours() {
        let client = CLIENTS
            .iter()
            .find(|candidate| candidate.platform_id == "steam")
            .unwrap();
        let mut store = ClientManagerStore::default();
        let mut config = default_client_config(client);
        config.update_policy = "notifyOnly".to_string();
        store.configs.push(config);
        let first_now = parse_iso_datetime("2026-06-10T10:00:00Z").unwrap();

        assert!(client_update_check_due(&store, "steam", first_now));

        remember_update_history(
            &mut store,
            update_history_item(
                client,
                SCHEDULED_UPDATE_ACTION,
                "Manual check",
                None,
                None,
                "scheduled".to_string(),
                "2026-06-10T10:00:00Z".to_string(),
            ),
        );

        let too_early = parse_iso_datetime("2026-06-11T09:59:59Z").unwrap();
        let due = parse_iso_datetime("2026-06-11T10:00:00Z").unwrap();

        assert!(!client_update_check_due(&store, "steam", too_early));
        assert!(client_update_check_due(&store, "steam", due));
    }

    #[test]
    fn update_status_exposes_scheduler_state_from_history() {
        let client = CLIENTS
            .iter()
            .find(|candidate| candidate.platform_id == "steam")
            .unwrap();
        let mut store = ClientManagerStore::default();
        let mut config = default_client_config(client);
        config.update_policy = "openClient".to_string();
        store.configs.push(config);
        remember_update_history(
            &mut store,
            update_history_item(
                client,
                SCHEDULED_UPDATE_ACTION,
                "Manual check",
                None,
                None,
                "scheduled".to_string(),
                "2026-06-10T10:00:00Z".to_string(),
            ),
        );
        let now = parse_iso_datetime("2026-06-10T12:00:00Z").unwrap();

        let status = build_update_status(client, &store, now);

        assert!(status.scheduler_enabled);
        assert_eq!(
            status.last_scheduled_check_at.as_deref(),
            Some("2026-06-10T10:00:00Z")
        );
        assert_eq!(
            status.next_scheduled_check_at.as_deref(),
            Some("2026-06-11T10:00:00Z")
        );
    }

    #[test]
    fn scheduled_open_client_policy_opens_safe_updater_target_for_updates() {
        let client = CLIENTS
            .iter()
            .find(|candidate| candidate.platform_id == "steam")
            .unwrap();
        let mut config = default_client_config(client);
        config.update_policy = "openClient".to_string();
        config.latest_known_version = Some("2.0.0".to_string());
        let status = test_update_status(client, "openClient", true);
        let opened = Cell::new(false);

        let item = scheduled_update_history_item(
            client,
            &config,
            &status,
            "2026-06-10T10:00:00Z".to_string(),
            |target| {
                assert!(matches!(target, ResolvedClientTarget::Uri(_)));
                opened.set(true);
                Ok(())
            },
        );

        assert!(opened.get());
        assert_eq!(item.action, SCHEDULED_UPDATE_ACTION);
        assert_eq!(item.status, "auto_opened");
        assert!(item.message.contains("opened"));
    }

    #[test]
    fn scheduled_notify_policy_does_not_open_updater() {
        let client = CLIENTS
            .iter()
            .find(|candidate| candidate.platform_id == "steam")
            .unwrap();
        let mut config = default_client_config(client);
        config.update_policy = "notifyOnly".to_string();
        let status = test_update_status(client, "notifyOnly", true);
        let opened = Cell::new(false);

        let item = scheduled_update_history_item(
            client,
            &config,
            &status,
            "2026-06-10T10:00:00Z".to_string(),
            |_| {
                opened.set(true);
                Ok(())
            },
        );

        assert!(!opened.get());
        assert_eq!(item.status, "Update available");
        assert!(item.message.contains("available update"));
    }

    #[test]
    fn auto_apply_plan_blocks_without_provider_mechanism() {
        let client = CLIENTS
            .iter()
            .find(|candidate| candidate.platform_id == "steam")
            .unwrap();
        let mut config = default_client_config(client);
        config.update_policy = AUTO_APPLY_UPDATE_POLICY.to_string();
        let status = test_update_status(client, AUTO_APPLY_UPDATE_POLICY, true);

        let plan = build_auto_apply_plan(client, &config, &status);

        assert_eq!(plan.stage, "unsupported");
        assert!(!plan.can_auto_apply);
        assert!(!plan.allows_silent_execution);
        assert!(plan.requires_provider_mechanism);
        assert!(plan
            .checks
            .iter()
            .any(|check| check.label == "Provider mechanism" && check.status == "blocked"));
    }

    #[test]
    fn auto_apply_capability_preview_reports_local_prerequisites_without_execution() {
        let client = CLIENTS
            .iter()
            .find(|candidate| candidate.platform_id == "steam")
            .unwrap();
        let target_path = path_to_lossy_string(&env::temp_dir().join("steam"));
        let mount_point = path_to_lossy_string(&env::temp_dir());
        let mut config = default_client_config(client);
        config.update_policy = AUTO_APPLY_UPDATE_POLICY.to_string();
        let status = test_update_status(client, AUTO_APPLY_UPDATE_POLICY, true);
        let plan = build_auto_apply_plan(client, &config, &status);
        let health = test_health("steam", false);

        let preview = build_client_manager_auto_apply_capability_preview(
            client,
            &health,
            &plan,
            Some(target_path.clone()),
            Some(ClientManagerAutoApplyCapabilityDisk {
                available_space: 128 * 1024 * 1024 * 1024,
                is_read_only: false,
                is_removable: false,
                mount_point: mount_point.clone(),
            }),
            CLIENT_MANAGER_AUTO_APPLY_CAPABILITY_DEFAULT_REQUIRED_BYTES,
            "2026-06-10T10:00:00Z".to_string(),
        );

        assert_eq!(preview.platform_id, "steam");
        assert_eq!(preview.target_path.as_deref(), Some(target_path.as_str()));
        assert_eq!(preview.available_disk_bytes, Some(128 * 1024 * 1024 * 1024));
        assert_eq!(
            preview.disk_mount_point.as_deref(),
            Some(mount_point.as_str())
        );
        assert!(!preview.can_auto_apply);
        assert!(preview.message.contains("remains blocked"));
        assert!(preview
            .checks
            .iter()
            .any(|check| check.id == "desktop-runtime" && check.status == "pass"));
        assert!(preview
            .checks
            .iter()
            .any(|check| check.id == "install-target" && check.status == "warning"));
        assert!(preview
            .checks
            .iter()
            .any(|check| check.id == "free-disk-space" && check.status == "pass"));
        assert!(preview
            .checks
            .iter()
            .any(|check| check.id == "provider-mechanism" && check.status == "blocked"));
    }

    #[test]
    fn auto_apply_capability_preview_blocks_missing_target_and_disk_space() {
        let client = CLIENTS
            .iter()
            .find(|candidate| candidate.platform_id == "steam")
            .unwrap();
        let config = default_client_config(client);
        let status = test_update_status(client, DEFAULT_UPDATE_POLICY, false);
        let plan = build_auto_apply_plan(client, &config, &status);
        let health = missing_health("steam");

        let preview = build_client_manager_auto_apply_capability_preview(
            client,
            &health,
            &plan,
            None,
            None,
            CLIENT_MANAGER_AUTO_APPLY_CAPABILITY_DEFAULT_REQUIRED_BYTES,
            "2026-06-10T10:00:00Z".to_string(),
        );

        assert_eq!(preview.target_path, None);
        assert_eq!(preview.available_disk_bytes, None);
        assert!(preview
            .checks
            .iter()
            .any(|check| check.id == "client-presence" && check.status == "blocked"));
        assert!(preview
            .checks
            .iter()
            .any(|check| check.id == "install-target" && check.status == "blocked"));
        assert!(preview
            .checks
            .iter()
            .any(|check| check.id == "free-disk-space" && check.status == "blocked"));
    }

    #[test]
    fn scheduled_auto_apply_policy_records_block_without_opening() {
        let client = CLIENTS
            .iter()
            .find(|candidate| candidate.platform_id == "steam")
            .unwrap();
        let mut config = default_client_config(client);
        config.update_policy = AUTO_APPLY_UPDATE_POLICY.to_string();
        let status = test_update_status(client, AUTO_APPLY_UPDATE_POLICY, true);
        let opened = Cell::new(false);

        let item = scheduled_update_history_item(
            client,
            &config,
            &status,
            "2026-06-10T10:00:00Z".to_string(),
            |_| {
                opened.set(true);
                Ok(())
            },
        );

        assert!(!opened.get());
        assert_eq!(item.status, "auto_apply_blocked");
        assert!(item.message.contains("no official provider mechanism"));
    }

    #[test]
    fn scheduled_open_client_policy_does_not_open_without_update_available() {
        let client = CLIENTS
            .iter()
            .find(|candidate| candidate.platform_id == "steam")
            .unwrap();
        let mut config = default_client_config(client);
        config.update_policy = "openClient".to_string();
        let status = test_update_status(client, "openClient", false);
        let opened = Cell::new(false);

        let item = scheduled_update_history_item(
            client,
            &config,
            &status,
            "2026-06-10T10:00:00Z".to_string(),
            |_| {
                opened.set(true);
                Ok(())
            },
        );

        assert!(!opened.get());
        assert_eq!(item.status, "Current");
        assert!(item.message.contains("completed"));
    }

    #[test]
    fn scheduled_open_client_policy_records_auto_open_failure() {
        let client = CLIENTS
            .iter()
            .find(|candidate| candidate.platform_id == "steam")
            .unwrap();
        let mut config = default_client_config(client);
        config.update_policy = "openClient".to_string();
        let status = test_update_status(client, "openClient", true);

        let item = scheduled_update_history_item(
            client,
            &config,
            &status,
            "2026-06-10T10:00:00Z".to_string(),
            |_| Err("blocked by OS".to_string()),
        );

        assert_eq!(item.status, "auto_open_failed");
        assert!(item.message.contains("blocked by OS"));
    }

    #[test]
    fn scheduled_open_client_policy_does_not_use_download_page_fallback() {
        let client = ClientDefinition {
            display_name: "No Updater Client",
            launch_uri: None,
            official_download_uri: Some("https://example.com/download"),
            platform_id: "no-updater",
            process_names: &[],
            update_notes: "No updater.",
            updater_uri: None,
        };
        let mut config = default_client_config(&client);
        config.update_policy = "openClient".to_string();
        let status = test_update_status(&client, "openClient", true);
        let opened = Cell::new(false);

        let item = scheduled_update_history_item(
            &client,
            &config,
            &status,
            "2026-06-10T10:00:00Z".to_string(),
            |_| {
                opened.set(true);
                Ok(())
            },
        );

        assert!(!opened.get());
        assert_eq!(item.status, "auto_open_failed");
        assert!(item.message.contains("no safe updater target"));
    }

    #[test]
    fn client_update_scheduler_units_include_headless_argument() {
        let service =
            linux_client_update_systemd_service_unit(&PathBuf::from("/opt/OG Launcher/open-game"));
        assert!(service.contains("ExecStart=\"/opt/OG Launcher/open-game\""));
        assert!(service.contains(HEADLESS_CLIENT_UPDATE_SCHEDULER_ARG));

        let timer = linux_client_update_systemd_timer_unit();
        assert!(timer.contains("OnCalendar=hourly"));
        assert!(timer.contains("Persistent=true"));
        assert!(timer.contains(LINUX_CLIENT_UPDATE_SERVICE_FILE));
    }

    #[test]
    fn client_update_scheduler_plist_escapes_path() {
        let plist = macos_client_update_launch_agent_plist(&PathBuf::from(
            "/Applications/OG & Launcher.app/Contents/MacOS/open-game",
        ));

        assert!(plist.contains("OG &amp; Launcher.app"));
        assert!(plist.contains(HEADLESS_CLIENT_UPDATE_SCHEDULER_ARG));
        assert!(plist.contains("<integer>3600</integer>"));
    }

    #[test]
    fn client_update_scheduler_run_status_summarizes_response() {
        let response = ScheduledClientUpdateChecksResponse {
            checked_at: "2026-06-10T12:00:00Z".to_string(),
            checked_clients: Vec::new(),
            message: "No scheduled platform-client update checks were due.".to_string(),
            next_check_at: Some("2026-06-11T12:00:00Z".to_string()),
            skipped_clients: vec!["Steam: scheduled later".to_string()],
            update_count: 0,
        };

        let status = client_update_scheduler_status_from_response(response, true);

        assert!(status.success);
        assert_eq!(status.checked_count, 0);
        assert_eq!(status.skipped_count, 1);
        assert_eq!(status.update_count, 0);
        assert_eq!(
            status.next_check_at.as_deref(),
            Some("2026-06-11T12:00:00Z")
        );
    }
}
