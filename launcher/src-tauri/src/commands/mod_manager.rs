use futures_util::StreamExt;
use reqwest::{StatusCode, Url};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    io::ErrorKind,
    net::TcpStream,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex, OnceLock,
    },
    time::{Duration, Instant},
};
use tauri::Emitter;
use tungstenite::{connect, stream::MaybeTlsStream, Error as WebSocketError, Message, WebSocket};

use crate::commands::{
    games::{open_uri, read_installed_games_cache_result, InstalledGame},
    local_db,
    mod_install::{self, InstalledModInfo, ModProvider as StoredModProvider},
    nxm, secure_store,
    steam_workshop::{self, SteamWorkshopContentState, SteamWorkshopScanStatus, SteamWorkshopSort},
};

const NEXUS_APP_ID_ENV: &str = "NEXUS_MODS_APP_ID";
const COMPILED_NEXUS_APP_ID: Option<&str> = option_env!("NEXUS_MODS_APP_ID");
const NEXUS_API_KEY_DOMAIN: &str = "nexus:sso_api_key";
const NEXUS_GAME_MAPPING_COLLECTION: &str = "nexus_game_mappings";
const NEXUS_API_BASE: &str = "https://api.nexusmods.com/v1";
const NEXUS_SSO_SOCKET: &str = "wss://sso.nexusmods.com";
const MAX_NEXUS_RESPONSE_BYTES: usize = 8 * 1024 * 1024;
const NEXUS_SSO_TIMEOUT: Duration = Duration::from_secs(5 * 60);
const NXM_CONTINUATION_TIMEOUT: Duration = Duration::from_secs(10 * 60);

static NEXUS_SSO_PENDING: AtomicBool = AtomicBool::new(false);
static NEXUS_SSO_LAST_ERROR: OnceLock<Mutex<Option<String>>> = OnceLock::new();

#[derive(Debug, Serialize, Deserialize, Clone, Copy, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ModProvider {
    Nexus,
    SteamWorkshop,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ModBrowseSort {
    Popular,
    Latest,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ModInstallCapability {
    Native,
    NxmHandoff,
    SteamHandoff,
    Unavailable,
}

#[derive(Debug, Serialize, Clone, Copy, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ModProviderAction {
    Connect,
    Disconnect,
    OpenProvider,
    None,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModBrowseRequest {
    pub game_id: String,
    pub provider: ModProvider,
    #[serde(default)]
    pub query: String,
    pub sort: ModBrowseSort,
    pub cursor: Option<String>,
    pub page_size: Option<u32>,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModBrowseItem {
    pub id: String,
    pub provider: ModProvider,
    pub name: String,
    pub author: Option<String>,
    pub summary: Option<String>,
    pub url: String,
    pub icon_url: Option<String>,
    pub banner_url: Option<String>,
    pub downloads: Option<String>,
    pub endorsements: Option<String>,
    pub version: Option<String>,
    pub file_size_bytes: Option<u64>,
    pub install_capability: ModInstallCapability,
    pub installed: bool,
    pub update_available: bool,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModBrowsePage {
    pub items: Vec<ModBrowseItem>,
    pub next_cursor: Option<String>,
    pub total: Option<u64>,
    pub message: Option<String>,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModProviderStatus {
    pub provider: ModProvider,
    pub available: bool,
    pub connected: bool,
    pub supports_browse: bool,
    pub supports_native_install: bool,
    pub message: String,
    pub action: ModProviderAction,
    pub action_label: Option<String>,
}

#[derive(Debug, Serialize, Clone, Copy, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ManagedModStatus {
    Installed,
    Disabled,
    External,
    UpdateAvailable,
    Damaged,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ManagedMod {
    pub install_id: String,
    pub game_id: String,
    pub provider: ModProvider,
    pub provider_item_id: Option<String>,
    pub title: String,
    pub version: Option<String>,
    pub enabled: bool,
    pub status: ManagedModStatus,
    pub installed_at: Option<u64>,
    pub can_toggle: bool,
    pub can_remove: bool,
    pub manage_url: Option<String>,
}

#[derive(Debug, Serialize, Clone, Copy, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ModActionStatus {
    Queued,
    Handoff,
    Unavailable,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModActionResult {
    pub status: ModActionStatus,
    pub message: String,
    pub install_id: Option<String>,
    pub delegated_url: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstallModRequest {
    pub game_id: String,
    pub provider: ModProvider,
    pub item_id: String,
    pub title: String,
    pub capability: ModInstallCapability,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpenProviderModRequest {
    pub game_id: String,
    pub provider: ModProvider,
    pub item_id: Option<String>,
    pub url: Option<String>,
    #[serde(default)]
    pub query: String,
    pub sort: Option<ModBrowseSort>,
}

#[derive(Debug, Deserialize, Clone)]
struct NexusGame {
    name: String,
    domain_name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CachedNexusGameMapping {
    local_identity: String,
    domain_name: String,
    name: String,
}

#[derive(Debug, Deserialize, Clone)]
struct NexusApiMod {
    mod_id: u64,
    name: String,
    #[serde(default)]
    author: Option<String>,
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    picture_url: Option<String>,
    #[serde(default)]
    mod_downloads: Option<u64>,
    #[serde(default)]
    endorsement_count: Option<u64>,
    #[serde(default)]
    version: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
struct NexusUserValidation {
    #[serde(default)]
    is_premium: bool,
}

#[derive(Debug, Deserialize, Clone)]
struct NexusModFiles {
    #[serde(default)]
    files: Vec<NexusFile>,
}

#[derive(Debug, Deserialize, Clone)]
struct NexusFile {
    file_id: u64,
    #[serde(default)]
    category_id: u64,
    #[serde(default)]
    category_name: String,
    #[serde(default)]
    file_name: String,
    #[serde(default)]
    uploaded_timestamp: u64,
    #[serde(default)]
    mod_version: Option<String>,
    #[serde(default)]
    size_in_bytes: Option<Value>,
    #[serde(default)]
    size_kb_in_bytes: Option<Value>,
    #[serde(default)]
    size_kb: Option<Value>,
    #[serde(default)]
    size: Option<Value>,
}

#[derive(Debug, Deserialize, Clone)]
struct NexusDownloadLink {
    #[serde(rename = "URI")]
    uri: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    short_name: String,
}

enum NexusDownloadAccess {
    Direct(Vec<NexusDownloadLink>),
    Handoff,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
enum NexusResponseDisposition {
    Success,
    Handoff,
    Reconnect,
    RateLimited,
    HttpError(u16),
}

fn classify_nexus_response(
    status: StatusCode,
    forbidden_is_handoff: bool,
) -> NexusResponseDisposition {
    if status.is_success() {
        NexusResponseDisposition::Success
    } else if status == StatusCode::FORBIDDEN && forbidden_is_handoff {
        NexusResponseDisposition::Handoff
    } else if matches!(status, StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN) {
        NexusResponseDisposition::Reconnect
    } else if status == StatusCode::TOO_MANY_REQUESTS {
        NexusResponseDisposition::RateLimited
    } else {
        NexusResponseDisposition::HttpError(status.as_u16())
    }
}

#[tauri::command]
pub fn get_mod_provider_status(
    provider: ModProvider,
    game_id: Option<String>,
) -> Result<ModProviderStatus, String> {
    match provider {
        ModProvider::Nexus => nexus_status(),
        ModProvider::SteamWorkshop => steam_status(game_id.as_deref()),
    }
}

#[tauri::command]
pub fn connect_nexus() -> Result<ModProviderStatus, String> {
    let app_id = registered_nexus_app_id().ok_or_else(|| {
        "Native Nexus integration is not configured in this build. Use Browse on Nexus instead."
            .to_string()
    })?;

    if secure_store::get_secret_keychain_only(NEXUS_API_KEY_DOMAIN)?
        .is_some_and(|secret| valid_nexus_api_key(&secret))
    {
        return nexus_status();
    }
    // A malformed or legacy value must not prevent a fresh official login.
    secure_store::delete_secret_keychain_only(NEXUS_API_KEY_DOMAIN)?;
    if NEXUS_SSO_PENDING.swap(true, Ordering::AcqRel) {
        return Ok(nexus_connecting_status());
    }
    set_nexus_sso_last_error(None);

    std::thread::spawn(move || {
        let _pending = NexusSsoPendingGuard;
        // Every error produced by this flow is deliberately secret-free. Status
        // polling is the public result channel.
        match run_nexus_sso(&app_id) {
            Ok(()) => set_nexus_sso_last_error(None),
            Err(error) => set_nexus_sso_last_error(Some(error)),
        }
    });

    Ok(nexus_connecting_status())
}

#[tauri::command]
pub fn disconnect_nexus() -> Result<ModProviderStatus, String> {
    secure_store::delete_secret_keychain_only(NEXUS_API_KEY_DOMAIN)?;
    set_nexus_sso_last_error(None);
    nexus_status()
}

#[tauri::command]
pub async fn browse_mods(input: ModBrowseRequest) -> Result<ModBrowsePage, String> {
    let game = local_game(&input.game_id)?;
    match input.provider {
        ModProvider::Nexus => browse_nexus_mods(&game, &input).await,
        ModProvider::SteamWorkshop => {
            let inspection = steam_workshop::inspect_game_workshop(&game);
            let available = !matches!(
                inspection.status,
                SteamWorkshopScanStatus::ClientMissing
                    | SteamWorkshopScanStatus::AppIdMissing
                    | SteamWorkshopScanStatus::GameInstallMissing
                    | SteamWorkshopScanStatus::LibraryNotRegistered
                    | SteamWorkshopScanStatus::GameManifestMissing
                    | SteamWorkshopScanStatus::GameManifestInvalid
                    | SteamWorkshopScanStatus::GameManifestMismatch
            );
            Ok(ModBrowsePage {
                items: Vec::new(),
                next_cursor: None,
                total: None,
                message: Some(if available {
                    "Steam Workshop browsing opens in the Steam client. Subscriptions appear in My Mods only after Steam records and installs them."
                        .to_string()
                } else {
                    "Steam Workshop is unavailable because the installed Steam game and client could not be verified."
                        .to_string()
                }),
            })
        }
    }
}

#[tauri::command]
pub async fn install_mod(
    app: tauri::AppHandle,
    input: InstallModRequest,
) -> Result<ModActionResult, String> {
    let game = local_game(&input.game_id)?;
    validate_item_id(&input.item_id)?;
    let _title = normalize_display_text(&input.title, "title")?;

    match (input.provider, input.capability) {
        (ModProvider::Nexus, ModInstallCapability::NxmHandoff) => {
            install_nexus_native_or_handoff(app, &game, &input, true).await
        }
        (ModProvider::SteamWorkshop, ModInstallCapability::SteamHandoff) => open_steam_provider(
            &input.game_id,
            Some(&input.item_id),
            "",
            ModBrowseSort::Popular,
        ),
        (ModProvider::Nexus, ModInstallCapability::Native) => {
            install_nexus_native_or_handoff(app, &game, &input, false).await
        }
        (_, ModInstallCapability::Unavailable) => Ok(unavailable_action(
            "This mod cannot be installed by the selected provider for this game.",
        )),
        _ => Ok(unavailable_action(
            "The requested install capability does not match the selected provider.",
        )),
    }
}

#[tauri::command]
pub async fn list_managed_mods(game_id: String) -> Result<Vec<ManagedMod>, String> {
    let game = local_game(&game_id)?;
    let nexus_installs = local_db::read_collection::<InstalledModInfo>("mod_installs")?
        .into_iter()
        .filter(|install| install.game_id == game.id)
        .filter(|install| install.provider == StoredModProvider::Nexus)
        .collect::<Vec<_>>();
    let mut managed = nexus_installs
        .iter()
        .cloned()
        .filter_map(managed_from_install)
        .collect::<Vec<_>>();

    if let Some(api_key) = secure_store::get_secret_keychain_only(NEXUS_API_KEY_DOMAIN)
        .ok()
        .flatten()
        .filter(|value| valid_nexus_api_key(value))
    {
        if let Ok(Some(nexus_game)) = resolve_nexus_game(&api_key, &game).await {
            if let Ok(domain) = validate_nexus_domain(&nexus_game.domain_name) {
                for item in &mut managed {
                    let Some(install) = nexus_installs
                        .iter()
                        .find(|install| install.install_id == item.install_id)
                    else {
                        continue;
                    };
                    if !install.enabled || item.status == ManagedModStatus::Damaged {
                        continue;
                    }
                    let Some(mod_id) = install
                        .catalog_item_id
                        .as_deref()
                        .and_then(|value| value.parse::<u64>().ok())
                        .filter(|value| *value > 0)
                    else {
                        continue;
                    };
                    let Ok(files) = nexus_api_json::<NexusModFiles>(
                        &api_key,
                        &format!("games/{domain}/mods/{mod_id}/files.json"),
                    )
                    .await
                    else {
                        continue;
                    };
                    let Some(latest) = select_latest_main_nexus_file(&files.files) else {
                        continue;
                    };
                    let update_available = install
                        .provider_file_id
                        .as_deref()
                        .and_then(|value| value.parse::<u64>().ok())
                        .map(|installed_file_id| installed_file_id != latest.file_id)
                        .unwrap_or_else(|| {
                            install.version_id.is_some()
                                && latest.mod_version.is_some()
                                && install.version_id != latest.mod_version
                        });
                    if update_available {
                        item.status = ManagedModStatus::UpdateAvailable;
                    }
                }
            }
        }
    }

    managed.extend(read_steam_workshop_items(&game)?);
    managed.sort_by(|left, right| {
        left.provider
            .as_sort_key()
            .cmp(&right.provider.as_sort_key())
            .then_with(|| left.title.to_lowercase().cmp(&right.title.to_lowercase()))
    });
    Ok(managed)
}

#[tauri::command]
pub fn set_mod_enabled(install_id: String, enabled: bool) -> Result<ManagedMod, String> {
    let install_id = normalize_identifier(&install_id, "installId")?;
    let install = local_db::read_item::<InstalledModInfo>("mod_installs", &install_id)?
        .ok_or_else(|| "The managed mod was not found.".to_string())?;
    if install.provider != StoredModProvider::Nexus {
        return Err(
            "Steam Workshop subscriptions are managed by Steam and cannot be toggled here."
                .to_string(),
        );
    }
    let updated = if enabled {
        mod_install::enable_mod(install_id)?
    } else {
        mod_install::disable_mod(install_id)?
    };
    managed_from_install(updated)
        .ok_or_else(|| "The updated mod is not an active Nexus installation.".to_string())
}

#[tauri::command]
pub fn remove_mod(install_id: String) -> Result<(), String> {
    let install_id = normalize_identifier(&install_id, "installId")?;
    let Some(install) = local_db::read_item::<InstalledModInfo>("mod_installs", &install_id)?
    else {
        return Ok(());
    };
    if install.provider != StoredModProvider::Nexus {
        return Err(
            "Steam Workshop subscriptions must be removed in Steam so Steam remains authoritative."
                .to_string(),
        );
    }
    mod_install::uninstall_mod(install_id)
}

#[tauri::command]
pub fn open_provider_mod(input: OpenProviderModRequest) -> Result<ModActionResult, String> {
    match input.provider {
        ModProvider::Nexus => match input.url {
            Some(url) => open_nexus_page(&url),
            None => {
                let game = local_game(&input.game_id)?;
                open_nexus_page(&nexus_web_search_url(&game, &input.query)?)
            }
        },
        ModProvider::SteamWorkshop => open_steam_provider(
            &input.game_id,
            input.item_id.as_deref(),
            &input.query,
            input.sort.unwrap_or(ModBrowseSort::Popular),
        ),
    }
}

impl ModProvider {
    fn as_sort_key(self) -> u8 {
        match self {
            Self::Nexus => 0,
            Self::SteamWorkshop => 1,
        }
    }
}

struct NexusSsoPendingGuard;

impl Drop for NexusSsoPendingGuard {
    fn drop(&mut self) {
        NEXUS_SSO_PENDING.store(false, Ordering::Release);
    }
}

fn registered_nexus_app_id() -> Option<String> {
    let runtime_app_id = std::env::var(NEXUS_APP_ID_ENV).ok();
    select_nexus_app_id(runtime_app_id.as_deref(), COMPILED_NEXUS_APP_ID)
}

pub(crate) fn nexus_native_integration_configured() -> bool {
    registered_nexus_app_id().is_some()
}

fn select_nexus_app_id(runtime: Option<&str>, compiled: Option<&str>) -> Option<String> {
    normalize_nexus_app_id(runtime).or_else(|| normalize_nexus_app_id(compiled))
}

fn normalize_nexus_app_id(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| {
            !value.is_empty()
                && value.len() <= 64
                && value.chars().all(|character| {
                    character.is_ascii_alphanumeric() || matches!(character, '-' | '_')
                })
        })
        .map(str::to_string)
}

fn nexus_sso_last_error() -> Option<String> {
    NEXUS_SSO_LAST_ERROR
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .clone()
}

fn set_nexus_sso_last_error(error: Option<String>) {
    *NEXUS_SSO_LAST_ERROR
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner) = error;
}

fn nexus_status() -> Result<ModProviderStatus, String> {
    let registered = registered_nexus_app_id().is_some();
    let connected = if registered {
        secure_store::get_secret_keychain_only(NEXUS_API_KEY_DOMAIN)?
            .is_some_and(|secret| valid_nexus_api_key(&secret))
    } else {
        false
    };
    let pending = NEXUS_SSO_PENDING.load(Ordering::Acquire);
    let (message, action, action_label) = if !registered {
        (
            "Browse Nexus Mods on its official website without an API key or app slug. The selected game and search are handed off; native cards and direct installation stay unavailable in this mode."
                .to_string(),
            ModProviderAction::OpenProvider,
            Some("Browse on Nexus".to_string()),
        )
    } else if connected {
        (
            "Connected to Nexus Mods through the official SSO flow.".to_string(),
            ModProviderAction::Disconnect,
            Some("Disconnect Nexus".to_string()),
        )
    } else if pending {
        (
            "Finish authorizing OG-Launcher in the Nexus Mods browser window.".to_string(),
            ModProviderAction::None,
            Some("Waiting for Nexus".to_string()),
        )
    } else if let Some(error) = nexus_sso_last_error() {
        (
            error,
            ModProviderAction::Connect,
            Some("Connect Nexus".to_string()),
        )
    } else {
        (
            "Connect Nexus Mods to browse official API results. No API key entry is required."
                .to_string(),
            ModProviderAction::Connect,
            Some("Connect Nexus".to_string()),
        )
    };
    Ok(ModProviderStatus {
        provider: ModProvider::Nexus,
        available: true,
        connected,
        supports_browse: registered && connected,
        // Native entitlement is validated per browse response/card. The
        // provider-level status remains conservative until that live check.
        supports_native_install: false,
        message,
        action,
        action_label,
    })
}

fn nexus_connecting_status() -> ModProviderStatus {
    ModProviderStatus {
        provider: ModProvider::Nexus,
        available: true,
        connected: false,
        supports_browse: false,
        supports_native_install: false,
        message: "Finish authorizing OG-Launcher in the Nexus Mods browser window.".to_string(),
        action: ModProviderAction::None,
        action_label: Some("Waiting for Nexus".to_string()),
    }
}

fn steam_status(game_id: Option<&str>) -> Result<ModProviderStatus, String> {
    let Some(game_id) = game_id.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(ModProviderStatus {
            provider: ModProvider::SteamWorkshop,
            available: false,
            connected: true,
            supports_browse: false,
            supports_native_install: false,
            message: "Choose a Steam game to browse its Workshop.".to_string(),
            action: ModProviderAction::None,
            action_label: None,
        });
    };
    let game = local_game(game_id)?;
    let inspection = steam_workshop::inspect_game_workshop(&game);
    let available = !matches!(
        inspection.status,
        SteamWorkshopScanStatus::ClientMissing
            | SteamWorkshopScanStatus::AppIdMissing
            | SteamWorkshopScanStatus::GameInstallMissing
            | SteamWorkshopScanStatus::LibraryNotRegistered
            | SteamWorkshopScanStatus::GameManifestMissing
            | SteamWorkshopScanStatus::GameManifestInvalid
            | SteamWorkshopScanStatus::GameManifestMismatch
    );
    let message = match inspection.status {
        SteamWorkshopScanStatus::ClientMissing => {
            "Steam is not installed or its local client directory could not be verified."
        }
        SteamWorkshopScanStatus::AppIdMissing => {
            "This installed library entry has no verified Steam AppID, so Workshop handoff is unavailable."
        }
        SteamWorkshopScanStatus::GameInstallMissing => {
            "The installed Steam game path could not be verified, so Workshop handoff is unavailable."
        }
        SteamWorkshopScanStatus::LibraryNotRegistered => {
            "The game path is not inside a Steam-registered library, so Workshop handoff is unavailable."
        }
        SteamWorkshopScanStatus::GameManifestMissing => {
            "Steam does not have an app manifest for this AppID, so Workshop handoff is unavailable."
        }
        SteamWorkshopScanStatus::GameManifestInvalid => {
            "Steam's app manifest could not be parsed safely, so Workshop handoff is unavailable."
        }
        SteamWorkshopScanStatus::GameManifestMismatch => {
            "Steam's AppID or install directory does not match the selected game, so Workshop handoff is unavailable."
        }
        SteamWorkshopScanStatus::ManifestMissing => {
            "Steam Workshop opens in the client. No local Workshop manifest exists for this game yet."
        }
        SteamWorkshopScanStatus::ManifestUnreadable
        | SteamWorkshopScanStatus::ManifestTooLarge
        | SteamWorkshopScanStatus::ManifestInvalid
        | SteamWorkshopScanStatus::ManifestAppIdMismatch => {
            "Steam Workshop opens in the client, but its local subscription state could not be safely verified."
        }
        SteamWorkshopScanStatus::Ready => {
            "Steam Workshop opens in the client; local installed items are detected read-only and Steam remains authoritative."
        }
    };
    Ok(ModProviderStatus {
        provider: ModProvider::SteamWorkshop,
        available,
        connected: !matches!(inspection.status, SteamWorkshopScanStatus::ClientMissing),
        supports_browse: available,
        supports_native_install: false,
        message: message.to_string(),
        action: if available {
            ModProviderAction::OpenProvider
        } else {
            ModProviderAction::None
        },
        action_label: available.then(|| "Browse in Steam".to_string()),
    })
}

fn run_nexus_sso(app_id: &str) -> Result<(), String> {
    let flow_id = uuid::Uuid::new_v4().to_string();
    let (mut socket, _) = connect(NEXUS_SSO_SOCKET)
        .map_err(|_| "Could not establish the official Nexus Mods SSO connection.".to_string())?;
    configure_websocket_timeout(&mut socket)?;
    let hello = nexus_sso_hello(&flow_id, app_id);
    socket
        .send(Message::Text(hello.to_string().into()))
        .map_err(|_| "Could not start the official Nexus Mods SSO flow.".to_string())?;
    open_uri(&nexus_sso_authorize_url(&flow_id)?)
        .map_err(|_| "Could not open the Nexus Mods authorization page.".to_string())?;

    let started = Instant::now();
    let mut last_ping = Instant::now();
    while started.elapsed() < NEXUS_SSO_TIMEOUT {
        if last_ping.elapsed() >= Duration::from_secs(25) {
            socket
                .send(Message::Ping(Vec::new().into()))
                .map_err(|_| "The Nexus Mods SSO connection closed.".to_string())?;
            last_ping = Instant::now();
        }
        match socket.read() {
            Ok(Message::Text(payload)) => {
                if let Some(api_key) = parse_nexus_sso_api_key(payload.as_str()) {
                    secure_store::set_secret_keychain_only(NEXUS_API_KEY_DOMAIN, &api_key)?;
                    let _ = socket.close(None);
                    return Ok(());
                }
                if nexus_sso_response_rejected(payload.as_str()) {
                    return Err("Nexus Mods rejected the authorization request.".to_string());
                }
            }
            Ok(Message::Ping(payload)) => {
                let _ = socket.send(Message::Pong(payload));
            }
            Ok(Message::Close(_)) => {
                return Err("The Nexus Mods authorization window was closed.".to_string());
            }
            Ok(_) => {}
            Err(WebSocketError::Io(error))
                if matches!(error.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {}
            Err(_) => return Err("The Nexus Mods SSO connection closed.".to_string()),
        }
    }
    Err("Nexus Mods authorization timed out.".to_string())
}

fn configure_websocket_timeout(
    socket: &mut WebSocket<MaybeTlsStream<TcpStream>>,
) -> Result<(), String> {
    let timeout = Some(Duration::from_secs(5));
    match socket.get_mut() {
        MaybeTlsStream::Plain(stream) => stream.set_read_timeout(timeout),
        MaybeTlsStream::Rustls(stream) => stream.get_mut().set_read_timeout(timeout),
        _ => Ok(()),
    }
    .map_err(|_| "Could not configure the Nexus Mods SSO connection.".to_string())
}

fn parse_nexus_sso_api_key(payload: &str) -> Option<String> {
    let trimmed = payload.trim().trim_matches('"');
    if valid_nexus_api_key(trimmed) {
        return Some(trimmed.to_string());
    }
    let json = serde_json::from_str::<Value>(payload).ok()?;
    let api_key = [
        json.get("api_key"),
        json.get("apikey"),
        json.get("data").and_then(|data| data.get("api_key")),
        json.get("data").and_then(|data| data.get("apikey")),
    ]
    .into_iter()
    .flatten()
    .find_map(Value::as_str)
    .map(str::trim)
    .filter(|value| valid_nexus_api_key(value))
    .map(ToOwned::to_owned);
    api_key
}

fn nexus_sso_hello(flow_id: &str, app_id: &str) -> Value {
    serde_json::json!({ "id": flow_id, "appid": app_id })
}

fn nexus_sso_authorize_url(flow_id: &str) -> Result<String, String> {
    let mut url = Url::parse("https://www.nexusmods.com/sso")
        .map_err(|_| "Could not construct the Nexus Mods authorization URL.".to_string())?;
    url.query_pairs_mut().append_pair("id", flow_id);
    Ok(url.to_string())
}

fn nexus_sso_response_rejected(payload: &str) -> bool {
    let Ok(json) = serde_json::from_str::<Value>(payload) else {
        return false;
    };
    if json.get("success").and_then(Value::as_bool) == Some(false) {
        return true;
    }
    json.get("error").is_some_and(|error| {
        !error.is_null() && error.as_str().is_none_or(|value| !value.is_empty())
    })
}

fn valid_nexus_api_key(value: &str) -> bool {
    (32..=256).contains(&value.len())
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '+' | '/' | '=')
        })
}

async fn browse_nexus_mods(
    game: &InstalledGame,
    input: &ModBrowseRequest,
) -> Result<ModBrowsePage, String> {
    let status = nexus_status()?;
    if !status.supports_browse {
        return Ok(ModBrowsePage {
            items: Vec::new(),
            next_cursor: None,
            total: None,
            message: Some(status.message),
        });
    }
    let api_key = secure_store::get_secret_keychain_only(NEXUS_API_KEY_DOMAIN)?
        .filter(|value| valid_nexus_api_key(value))
        .ok_or_else(|| "Nexus Mods authorization is unavailable.".to_string())?;
    let Some(nexus_game) = resolve_nexus_game(&api_key, game).await? else {
        return Ok(ModBrowsePage {
            items: Vec::new(),
            next_cursor: None,
            total: Some(0),
            message: Some(
                "No unambiguous Nexus Mods game mapping was found. Continue on Nexus instead."
                    .to_string(),
            ),
        });
    };
    let endpoint = match input.sort {
        ModBrowseSort::Popular => "trending.json",
        ModBrowseSort::Latest => "latest_updated.json",
    };
    let domain = validate_nexus_domain(&nexus_game.domain_name)?;
    let user: NexusUserValidation = nexus_api_json(&api_key, "users/validate.json").await?;
    let mods: Vec<NexusApiMod> =
        nexus_api_json(&api_key, &format!("games/{domain}/mods/{endpoint}")).await?;
    let query = input.query.trim().to_lowercase();
    let mut mods = mods
        .into_iter()
        .filter(|item| {
            query.is_empty()
                || item.name.to_lowercase().contains(&query)
                || item
                    .summary
                    .as_deref()
                    .is_some_and(|summary| summary.to_lowercase().contains(&query))
        })
        .collect::<Vec<_>>();
    let total = mods.len() as u64;
    let offset = input
        .cursor
        .as_deref()
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0)
        .min(mods.len());
    let page_size = input.page_size.unwrap_or(12).clamp(1, 50) as usize;
    let end = offset.saturating_add(page_size).min(mods.len());
    let selected = mods.drain(offset..end).collect::<Vec<_>>();
    let installed_versions = installed_nexus_versions(&game.id)?;
    let items = selected
        .into_iter()
        .map(|item| {
            let id = item.mod_id.to_string();
            let installed_version = installed_versions.get(&id);
            let update_available = installed_version.is_some_and(|installed| {
                installed.as_ref().is_some()
                    && item.version.as_ref().is_some()
                    && installed.as_ref() != item.version.as_ref()
            });
            ModBrowseItem {
                url: nexus_mod_url(&domain, &id),
                installed: installed_version.is_some(),
                id,
                provider: ModProvider::Nexus,
                name: item.name,
                author: item.author,
                summary: item.summary,
                icon_url: item.picture_url.clone(),
                banner_url: item.picture_url,
                downloads: item.mod_downloads.map(format_count),
                endorsements: item.endorsement_count.map(format_count),
                version: item.version,
                file_size_bytes: None,
                install_capability: if user.is_premium {
                    ModInstallCapability::Native
                } else {
                    ModInstallCapability::NxmHandoff
                },
                update_available,
            }
        })
        .collect();

    Ok(ModBrowsePage {
        items,
        next_cursor: (end < total as usize).then(|| end.to_string()),
        total: Some(total),
        message: None,
    })
}

async fn install_nexus_native_or_handoff(
    app: tauri::AppHandle,
    game: &InstalledGame,
    input: &InstallModRequest,
    require_pending_nxm: bool,
) -> Result<ModActionResult, String> {
    let api_key = secure_store::get_secret_keychain_only(NEXUS_API_KEY_DOMAIN)?
        .filter(|value| valid_nexus_api_key(value))
        .ok_or_else(|| "Nexus Mods authorization is unavailable.".to_string())?;
    let nexus_game = resolve_nexus_game(&api_key, game).await?.ok_or_else(|| {
        "No unambiguous Nexus Mods game mapping was found. Continue on Nexus instead.".to_string()
    })?;
    let domain = validate_nexus_domain(&nexus_game.domain_name)?;
    let mod_id = input
        .item_id
        .parse::<u64>()
        .ok()
        .filter(|value| *value > 0)
        .ok_or_else(|| "The provider item ID was invalid.".to_string())?;
    let response: NexusModFiles = nexus_api_json(
        &api_key,
        &format!("games/{domain}/mods/{mod_id}/files.json"),
    )
    .await?;
    let Some(file) = select_latest_main_nexus_file(&response.files) else {
        return open_nexus_page(&nexus_mod_url(&domain, &mod_id.to_string()));
    };
    let file_page = nexus_file_url(&domain, mod_id, file.file_id);
    if mod_install::validate_supported_nexus_archive_name(&file.file_name).is_err() {
        return open_nexus_page(&file_page);
    }
    let Some(expected_size) = expected_nexus_file_size(file) else {
        return open_nexus_page(&file_page);
    };

    if require_pending_nxm {
        if let Some(authorization) = nxm::claim_pending_nxm(&domain, mod_id, file.file_id) {
            return continue_nexus_file_install(
                app,
                game.clone(),
                input.clone(),
                domain,
                mod_id,
                file.clone(),
                expected_size,
                file_page,
                Some(authorization),
            )
            .await;
        }

        // The first Free-user click is an honest provider handoff. Keep a
        // short-lived backend continuation alive so the nxm:// callback can
        // atomically supply its matching authorization without requiring the
        // renderer to echo or even observe its key/expiry.
        let handoff = open_nexus_page(&file_page)?;
        let app = app.clone();
        let game = game.clone();
        let input = input.clone();
        let domain = domain.clone();
        let file = file.clone();
        let file_page = file_page.clone();
        tokio::spawn(async move {
            let started = Instant::now();
            while started.elapsed() < NXM_CONTINUATION_TIMEOUT {
                if let Some(authorization) = nxm::claim_pending_nxm(&domain, mod_id, file.file_id) {
                    let event_app = app.clone();
                    let result = continue_nexus_file_install(
                        app,
                        game,
                        input,
                        domain.clone(),
                        mod_id,
                        file.clone(),
                        expected_size,
                        file_page,
                        Some(authorization),
                    )
                    .await;
                    if !matches!(result, Ok(ref action) if action.status == ModActionStatus::Queued)
                    {
                        let status =
                            nxm::record_nxm_continuation_failure(&domain, mod_id, file.file_id);
                        let _ = event_app.emit("nxm-link-status", status);
                    }
                    return;
                }
                tokio::time::sleep(Duration::from_millis(250)).await;
            }
        });
        return Ok(handoff);
    }

    continue_nexus_file_install(
        app,
        game.clone(),
        input.clone(),
        domain,
        mod_id,
        file.clone(),
        expected_size,
        file_page,
        None,
    )
    .await
}

#[allow(clippy::too_many_arguments)]
async fn continue_nexus_file_install(
    app: tauri::AppHandle,
    game: InstalledGame,
    input: InstallModRequest,
    domain: String,
    mod_id: u64,
    file: NexusFile,
    expected_size: mod_install::TrustedNexusExpectedSize,
    file_page: String,
    pending_nxm: Option<nxm::NxmDownloadAuthorization>,
) -> Result<ModActionResult, String> {
    let api_key = secure_store::get_secret_keychain_only(NEXUS_API_KEY_DOMAIN)?
        .filter(|value| valid_nexus_api_key(value))
        .ok_or_else(|| "Nexus Mods authorization is unavailable.".to_string())?;
    let access = nexus_download_links(
        &api_key,
        &domain,
        mod_id,
        file.file_id,
        pending_nxm.as_ref().map(|value| value.download_key()),
        pending_nxm.as_ref().map(|value| value.expires_at()),
    )
    .await?;
    let NexusDownloadAccess::Direct(mut links) = access else {
        return open_nexus_page(&file_page);
    };
    links.sort_by(|left, right| {
        left.short_name
            .cmp(&right.short_name)
            .then_with(|| left.name.cmp(&right.name))
            .then_with(|| left.uri.cmp(&right.uri))
    });
    let download_url = links.into_iter().find_map(|link| {
        let url = Url::parse(&link.uri).ok()?;
        mod_install::validate_nexus_download_host(&url)
            .ok()
            .map(|_| link.uri)
    });
    let Some(download_url) = download_url else {
        return open_nexus_page(&file_page);
    };

    let queued = mod_install::start_trusted_nexus_install(
        app,
        mod_install::TrustedNexusInstallRequest {
            game_id: game.id.clone(),
            catalog_item_id: mod_id.to_string(),
            file_id: file.file_id.to_string(),
            title: normalize_display_text(&input.title, "title")?,
            version_id: file.mod_version.clone(),
            download_url,
            file_name: file.file_name.clone(),
            expected_size,
            provider_page_url: file_page,
        },
    )
    .await?;
    Ok(ModActionResult {
        status: ModActionStatus::Queued,
        message: queued.message,
        install_id: Some(queued.install_id),
        delegated_url: None,
    })
}

fn select_latest_main_nexus_file(files: &[NexusFile]) -> Option<&NexusFile> {
    files
        .iter()
        .filter(|file| {
            let category = file.category_name.trim().to_ascii_uppercase();
            (file.category_id == 1 || category == "MAIN")
                && !matches!(category.as_str(), "ARCHIVED" | "DELETED" | "REMOVED")
                && file.file_id > 0
                && !file.file_name.trim().is_empty()
        })
        .max_by_key(|file| (file.uploaded_timestamp, file.file_id))
}

fn nexus_json_u64(value: &Value) -> Option<u64> {
    value
        .as_u64()
        .or_else(|| value.as_str()?.trim().parse::<u64>().ok())
}

fn expected_nexus_file_size(file: &NexusFile) -> Option<mod_install::TrustedNexusExpectedSize> {
    if let Some(bytes) = file
        .size_in_bytes
        .as_ref()
        .and_then(nexus_json_u64)
        .or_else(|| file.size_kb_in_bytes.as_ref().and_then(nexus_json_u64))
        .filter(|value| *value > 0)
    {
        return Some(mod_install::TrustedNexusExpectedSize { bytes, exact: true });
    }
    file.size_kb
        .as_ref()
        .or(file.size.as_ref())
        .and_then(nexus_json_u64)
        .and_then(|kib| kib.checked_mul(1024))
        .filter(|value| *value > 0)
        .map(|bytes| mod_install::TrustedNexusExpectedSize {
            bytes,
            exact: false,
        })
}

async fn nexus_download_links(
    api_key: &str,
    domain: &str,
    mod_id: u64,
    file_id: u64,
    nxm_key: Option<&str>,
    nxm_expires: Option<i64>,
) -> Result<NexusDownloadAccess, String> {
    let mut url = Url::parse(&format!(
        "{NEXUS_API_BASE}/games/{domain}/mods/{mod_id}/files/{file_id}/download_link.json"
    ))
    .map_err(|_| "Could not construct the Nexus Mods download request.".to_string())?;
    if let (Some(key), Some(expires)) = (nxm_key, nxm_expires) {
        url.query_pairs_mut()
            .append_pair("key", key)
            .append_pair("expires", &expires.to_string());
    }
    let response = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| "Could not initialize the Nexus Mods API client.".to_string())?
        .get(url)
        .header("Accept", "application/json")
        .header("User-Agent", "OG-Launcher/0.1.0")
        .header("Application-Name", "OG-Launcher")
        .header("Application-Version", env!("CARGO_PKG_VERSION"))
        .header("apikey", api_key)
        .send()
        .await
        .map_err(|_| "The official Nexus Mods API could not be reached.".to_string())?;
    match classify_nexus_response(response.status(), true) {
        NexusResponseDisposition::Success => {}
        NexusResponseDisposition::Handoff => return Ok(NexusDownloadAccess::Handoff),
        NexusResponseDisposition::Reconnect => {
            let _ = secure_store::delete_secret_keychain_only(NEXUS_API_KEY_DOMAIN);
            set_nexus_sso_last_error(Some(
                "Nexus Mods authorization expired or was revoked. Connect Nexus again.".to_string(),
            ));
            return Err(
                "Nexus Mods authorization expired or was revoked. Reconnect Nexus Mods."
                    .to_string(),
            );
        }
        NexusResponseDisposition::RateLimited => {
            return Err("Nexus Mods rate limit reached. Try again later.".to_string())
        }
        NexusResponseDisposition::HttpError(status) => {
            return Err(format!(
                "The official Nexus Mods API returned HTTP {status}."
            ))
        }
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_NEXUS_RESPONSE_BYTES as u64)
    {
        return Err("The Nexus Mods API response exceeded the safe size limit.".to_string());
    }
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| "The Nexus Mods API response was incomplete.".to_string())?;
        if bytes.len().saturating_add(chunk.len()) > MAX_NEXUS_RESPONSE_BYTES {
            return Err("The Nexus Mods API response exceeded the safe size limit.".to_string());
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice::<Vec<NexusDownloadLink>>(&bytes)
        .map(NexusDownloadAccess::Direct)
        .map_err(|_| "The Nexus Mods API returned an invalid download response.".to_string())
}

async fn nexus_api_json<T>(api_key: &str, endpoint: &str) -> Result<T, String>
where
    T: for<'de> Deserialize<'de>,
{
    let endpoint = endpoint.trim_start_matches('/');
    if endpoint.contains("..") || endpoint.contains('?') || endpoint.contains('#') {
        return Err("The Nexus Mods API endpoint was rejected.".to_string());
    }
    let response = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| "Could not initialize the Nexus Mods API client.".to_string())?
        .get(format!("{NEXUS_API_BASE}/{endpoint}"))
        .header("Accept", "application/json")
        .header("User-Agent", "OG-Launcher/0.1.0")
        .header("Application-Name", "OG-Launcher")
        .header("Application-Version", env!("CARGO_PKG_VERSION"))
        .header("apikey", api_key)
        .send()
        .await
        .map_err(|_| "The official Nexus Mods API could not be reached.".to_string())?;
    match classify_nexus_response(response.status(), false) {
        NexusResponseDisposition::Success => {}
        NexusResponseDisposition::Reconnect => {
            let _ = secure_store::delete_secret_keychain_only(NEXUS_API_KEY_DOMAIN);
            set_nexus_sso_last_error(Some(
                "Nexus Mods authorization expired or was revoked. Connect Nexus again.".to_string(),
            ));
            return Err(
                "Nexus Mods authorization expired or was revoked. Reconnect Nexus Mods."
                    .to_string(),
            );
        }
        NexusResponseDisposition::RateLimited => {
            return Err("Nexus Mods rate limit reached. Try again later.".to_string())
        }
        NexusResponseDisposition::HttpError(status) => {
            return Err(format!(
                "The official Nexus Mods API returned HTTP {status}."
            ))
        }
        NexusResponseDisposition::Handoff => unreachable!("generic Nexus requests never hand off"),
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_NEXUS_RESPONSE_BYTES as u64)
    {
        return Err("The Nexus Mods API response exceeded the safe size limit.".to_string());
    }
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| "The Nexus Mods API response was incomplete.".to_string())?;
        if bytes.len().saturating_add(chunk.len()) > MAX_NEXUS_RESPONSE_BYTES {
            return Err("The Nexus Mods API response exceeded the safe size limit.".to_string());
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes)
        .map_err(|_| "The Nexus Mods API returned an invalid response.".to_string())
}

async fn resolve_nexus_game(
    api_key: &str,
    game: &InstalledGame,
) -> Result<Option<NexusGame>, String> {
    let identity = nexus_game_cache_identity(game);
    if let Ok(Some(cached)) =
        local_db::read_item::<CachedNexusGameMapping>(NEXUS_GAME_MAPPING_COLLECTION, &game.id)
    {
        if cached.local_identity == identity
            && validate_nexus_domain(&cached.domain_name).is_ok()
            && !cached.name.trim().is_empty()
        {
            return Ok(Some(NexusGame {
                name: cached.name,
                domain_name: cached.domain_name,
            }));
        }
    }

    let games: Vec<NexusGame> = nexus_api_json(api_key, "games.json").await?;
    let Some(mapped) = match_nexus_game(game, &games).cloned() else {
        return Ok(None);
    };
    let cached = CachedNexusGameMapping {
        local_identity: identity,
        domain_name: validate_nexus_domain(&mapped.domain_name)?,
        name: mapped.name.clone(),
    };
    local_db::upsert_item(NEXUS_GAME_MAPPING_COLLECTION, &game.id, &cached)?;
    Ok(Some(mapped))
}

fn nexus_game_cache_identity(game: &InstalledGame) -> String {
    format!(
        "{}:{}",
        normalize_game_name(&game.title),
        normalize_game_name(&game.slug)
    )
}

fn match_nexus_game<'a>(game: &InstalledGame, games: &'a [NexusGame]) -> Option<&'a NexusGame> {
    let candidates = [game.title.as_str(), game.slug.as_str()]
        .into_iter()
        .map(normalize_game_name)
        .filter(|value| !value.is_empty())
        .collect::<HashSet<_>>();
    let mut matches = games.iter().filter(|candidate| {
        candidates.contains(&normalize_game_name(&candidate.name))
            || candidates.contains(&normalize_game_name(&candidate.domain_name))
    });
    let first = matches.next()?;
    matches.next().is_none().then_some(first)
}

fn normalize_game_name(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn validate_nexus_domain(value: &str) -> Result<String, String> {
    let value = value.trim().to_ascii_lowercase();
    if value.is_empty()
        || value.len() > 80
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err("The Nexus Mods game mapping was invalid.".to_string());
    }
    Ok(value)
}

fn installed_nexus_versions(game_id: &str) -> Result<HashMap<String, Option<String>>, String> {
    Ok(
        local_db::read_collection::<InstalledModInfo>("mod_installs")?
            .into_iter()
            .filter(|install| {
                install.game_id == game_id && install.provider == StoredModProvider::Nexus
            })
            .filter_map(|install| Some((install.catalog_item_id?, install.version_id)))
            .collect(),
    )
}

fn local_game(game_id: &str) -> Result<InstalledGame, String> {
    let game_id = normalize_identifier(game_id, "gameId")?;
    read_installed_games_cache_result()?
        .into_iter()
        .find(|game| game.id == game_id)
        .ok_or_else(|| "The selected game was not found in the local library.".to_string())
}

fn open_nexus_page(raw_url: &str) -> Result<ModActionResult, String> {
    let clean_url = sanitize_nexus_page_url(raw_url)?;
    open_uri(&clean_url).map_err(|_| "Could not open Nexus Mods in the browser.".to_string())?;
    Ok(handoff_action(
        "Opened the official Nexus Mods page. This is a provider handoff, not a completed install.",
        clean_url,
    ))
}

fn nexus_web_search_url(game: &InstalledGame, query: &str) -> Result<String, String> {
    let title = game.title.trim();
    if title.is_empty() {
        return Err("The selected game has no usable title for Nexus Mods search.".to_string());
    }
    let query = query.trim();
    let search = if query.is_empty() {
        title.to_string()
    } else {
        format!("{title} {query}")
    };
    let search = search
        .chars()
        .filter(|character| !character.is_control())
        .take(200)
        .collect::<String>();
    let mut url = Url::parse("https://www.nexusmods.com/search/")
        .map_err(|_| "Could not construct the Nexus Mods search URL.".to_string())?;
    url.query_pairs_mut()
        .append_pair("gsearch", &search)
        .append_pair("gsearchtype", "mods");
    Ok(url.to_string())
}

fn sanitize_nexus_page_url(raw_url: &str) -> Result<String, String> {
    let raw_url = raw_url.trim();
    if raw_url.to_ascii_lowercase().starts_with("nxm:") {
        return Err("NXM links may contain short-lived secrets and cannot be accepted from the renderer. Start Download with Manager on Nexus Mods instead."
            .to_string());
    }
    let mut url = Url::parse(raw_url).map_err(|_| "The Nexus Mods URL was invalid.".to_string())?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || !matches!(
            url.host_str()
                .map(|host| host.to_ascii_lowercase())
                .as_deref(),
            Some("nexusmods.com") | Some("www.nexusmods.com")
        )
    {
        return Err("Only official HTTPS Nexus Mods pages can be opened.".to_string());
    }
    let is_search_page = matches!(url.path(), "/search" | "/search/");
    let safe_query = url
        .query_pairs()
        .filter_map(|(key, value)| match key.as_ref() {
            "tab" if value == "files" => Some(("tab".to_string(), "files".to_string())),
            "file_id" if value.chars().all(|character| character.is_ascii_digit()) => {
                Some(("file_id".to_string(), value.into_owned()))
            }
            "gsearch"
                if is_search_page
                    && !value.is_empty()
                    && value.chars().count() <= 200
                    && !value.chars().any(char::is_control) =>
            {
                Some(("gsearch".to_string(), value.into_owned()))
            }
            "gsearchtype" if is_search_page && value == "mods" => {
                Some(("gsearchtype".to_string(), "mods".to_string()))
            }
            _ => None,
        })
        .collect::<Vec<_>>();
    url.set_query(None);
    if !safe_query.is_empty() {
        let mut pairs = url.query_pairs_mut();
        for (key, value) in safe_query {
            pairs.append_pair(&key, &value);
        }
    }
    url.set_fragment(None);
    Ok(url.to_string())
}

fn open_steam_provider(
    game_id: &str,
    item_id: Option<&str>,
    query: &str,
    sort: ModBrowseSort,
) -> Result<ModActionResult, String> {
    let game = local_game(game_id)?;
    let inspection = steam_workshop::inspect_game_workshop(&game);
    if matches!(
        inspection.status,
        SteamWorkshopScanStatus::ClientMissing
            | SteamWorkshopScanStatus::AppIdMissing
            | SteamWorkshopScanStatus::GameInstallMissing
            | SteamWorkshopScanStatus::LibraryNotRegistered
            | SteamWorkshopScanStatus::GameManifestMissing
            | SteamWorkshopScanStatus::GameManifestInvalid
            | SteamWorkshopScanStatus::GameManifestMismatch
    ) {
        return Err(
            "Steam Workshop is unavailable because the installed Steam game could not be verified."
                .to_string(),
        );
    }
    let app_id = inspection.app_id.ok_or_else(|| {
        "Steam Workshop is unavailable because this game has no verified Steam AppID.".to_string()
    })?;
    let delegated_url = if let Some(item_id) = item_id {
        let item_id = validate_item_id(item_id)?;
        let item_id = item_id
            .parse::<u64>()
            .map_err(|_| "The Steam Workshop item ID was invalid.".to_string())?;
        steam_workshop::workshop_item_steam_uri(item_id)?
    } else {
        let browse_url = steam_workshop::workshop_browse_url(
            app_id,
            query,
            match sort {
                ModBrowseSort::Popular => SteamWorkshopSort::Popular,
                ModBrowseSort::Latest => SteamWorkshopSort::Latest,
            },
        )?;
        format!("steam://openurl/{browse_url}")
    };
    open_uri(&delegated_url)
        .map_err(|_| "Could not open the Steam Workshop client.".to_string())?;
    Ok(handoff_action(
        "Opened Steam Workshop. A mod is installed only after Steam records and downloads the subscription.",
        delegated_url,
    ))
}

fn read_steam_workshop_items(game: &InstalledGame) -> Result<Vec<ManagedMod>, String> {
    let inspection = steam_workshop::inspect_game_workshop(game);
    if inspection.status != SteamWorkshopScanStatus::Ready {
        return Ok(Vec::new());
    }
    let Some(app_id) = inspection.app_id else {
        return Ok(Vec::new());
    };
    inspection
        .items
        .into_iter()
        .filter(|item| item.content_state == SteamWorkshopContentState::Present)
        .map(|item| {
            let item_id = item.published_file_id;
            Ok(ManagedMod {
                install_id: format!("steam_workshop-{app_id}-{item_id}"),
                game_id: game.id.clone(),
                provider: ModProvider::SteamWorkshop,
                provider_item_id: Some(item_id.to_string()),
                title: format!("Local Steam Workshop item #{item_id}"),
                version: item.manifest_id.map(|manifest| manifest.to_string()),
                enabled: true,
                status: ManagedModStatus::External,
                installed_at: item.updated_at_unix,
                can_toggle: false,
                can_remove: false,
                manage_url: Some(steam_workshop::workshop_item_url(item_id)?),
            })
        })
        .collect()
}

fn managed_from_install(install: InstalledModInfo) -> Option<ManagedMod> {
    let provider = match install.provider {
        StoredModProvider::Nexus => ModProvider::Nexus,
        _ => return None,
    };
    let manage_url = install
        .source_url
        .as_deref()
        .and_then(|url| sanitize_nexus_page_url(url).ok());
    let integrity_ok = mod_install::validate_managed_mod_install(&install).is_ok();
    Some(ManagedMod {
        install_id: install.install_id,
        game_id: install.game_id,
        provider,
        provider_item_id: install.catalog_item_id,
        title: install.title,
        version: install.version_id,
        enabled: install.enabled,
        status: if !integrity_ok {
            ManagedModStatus::Damaged
        } else if install.enabled {
            ManagedModStatus::Installed
        } else {
            ManagedModStatus::Disabled
        },
        installed_at: Some(install.installed_at),
        can_toggle: integrity_ok,
        can_remove: integrity_ok,
        manage_url,
    })
}

fn normalize_identifier(value: &str, label: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > 256
        || value
            .chars()
            .any(|character| character.is_control() || character == '\0')
    {
        return Err(format!("Invalid {label}."));
    }
    Ok(value.to_string())
}

fn normalize_display_text(value: &str, label: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() || value.len() > 300 || value.chars().any(char::is_control) {
        return Err(format!("Invalid {label}."));
    }
    Ok(value.to_string())
}

fn validate_item_id(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > 24
        || !value.chars().all(|character| character.is_ascii_digit())
    {
        return Err("The provider item ID was invalid.".to_string());
    }
    Ok(value.to_string())
}

fn nexus_mod_url(domain: &str, item_id: &str) -> String {
    format!("https://www.nexusmods.com/{domain}/mods/{item_id}")
}

fn nexus_file_url(domain: &str, mod_id: u64, file_id: u64) -> String {
    format!("https://www.nexusmods.com/{domain}/mods/{mod_id}?tab=files&file_id={file_id}")
}

fn handoff_action(message: &str, delegated_url: String) -> ModActionResult {
    ModActionResult {
        status: ModActionStatus::Handoff,
        message: message.to_string(),
        install_id: None,
        delegated_url: Some(delegated_url),
    }
}

fn unavailable_action(message: &str) -> ModActionResult {
    ModActionResult {
        status: ModActionStatus::Unavailable,
        message: message.to_string(),
        install_id: None,
        delegated_url: None,
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nexus_urls_strip_queries_and_reject_nxm_secrets() {
        assert_eq!(
            sanitize_nexus_page_url(
                "https://www.nexusmods.com/skyrim/mods/123?key=short-lived&expires=1#files"
            )
            .unwrap(),
            "https://www.nexusmods.com/skyrim/mods/123"
        );
        let error = sanitize_nexus_page_url(
            "nxm://skyrim/mods/123/files/456?key=never-echo-this&expires=1",
        )
        .unwrap_err();
        assert!(!error.contains("never-echo-this"));
        assert!(sanitize_nexus_page_url("https://evil.example/mods/123").is_err());
        assert!(sanitize_nexus_page_url(
            "https://user:password@www.nexusmods.com/search/?gsearch=skyrim&gsearchtype=mods"
        )
        .is_err());
        assert_eq!(
            sanitize_nexus_page_url(
                "https://www.nexusmods.com/skyrim/mods/123?tab=files&file_id=456&key=secret&expires=1"
            )
            .unwrap(),
            "https://www.nexusmods.com/skyrim/mods/123?tab=files&file_id=456"
        );
        assert_eq!(
            sanitize_nexus_page_url(
                "https://www.nexusmods.com/search/?gsearch=Cyber+Drift+camera&gsearchtype=mods&key=secret&expires=1"
            )
            .unwrap(),
            "https://www.nexusmods.com/search/?gsearch=Cyber+Drift+camera&gsearchtype=mods"
        );
    }

    #[test]
    fn nexus_web_handoff_encodes_game_and_search_without_a_slug() {
        let game = test_game("steam-1", "Cyber Drift", "cyber-drift");
        let url = nexus_web_search_url(&game, "photo mode").unwrap();
        assert_eq!(
            url,
            "https://www.nexusmods.com/search/?gsearch=Cyber+Drift+photo+mode&gsearchtype=mods"
        );
        assert_eq!(sanitize_nexus_page_url(&url).unwrap(), url);
        assert!(!url.contains("appid"));
        assert!(!url.contains("api_key"));
    }

    #[test]
    fn nexus_sso_key_parser_accepts_only_bounded_secret_shapes() {
        let key = "a".repeat(64);
        assert_eq!(parse_nexus_sso_api_key(&key), Some(key.clone()));
        assert_eq!(
            parse_nexus_sso_api_key(&format!(r#"{{"data":{{"api_key":"{key}"}}}}"#)),
            Some(key)
        );
        assert_eq!(parse_nexus_sso_api_key("short"), None);
        assert_eq!(
            parse_nexus_sso_api_key("a secret with spaces that must not persist"),
            None
        );
        let base64_key = format!("{}+/=", "b".repeat(61));
        assert_eq!(parse_nexus_sso_api_key(&base64_key), Some(base64_key));
    }

    #[test]
    fn nexus_sso_handshake_uses_registered_app_id_and_real_error_state() {
        assert_eq!(
            nexus_sso_hello("flow-id", "og-launcher"),
            serde_json::json!({ "id": "flow-id", "appid": "og-launcher" })
        );
        let url = nexus_sso_authorize_url("flow-id").unwrap();
        assert_eq!(url, "https://www.nexusmods.com/sso?id=flow-id");
        assert!(!nexus_sso_response_rejected(
            r#"{"success":true,"data":{"connection_token":"token"},"error":null}"#
        ));
        assert!(nexus_sso_response_rejected(
            r#"{"success":false,"data":null,"error":"rejected"}"#
        ));
    }

    #[test]
    fn nexus_app_id_is_embeddable_for_registered_release_builds() {
        assert_eq!(
            select_nexus_app_id(Some(" runtime-app "), Some("compiled-app")),
            Some("runtime-app".to_string())
        );
        assert_eq!(
            select_nexus_app_id(None, Some(" compiled-app ")),
            Some("compiled-app".to_string())
        );
        assert_eq!(
            select_nexus_app_id(Some("invalid app id"), Some("compiled-app")),
            Some("compiled-app".to_string())
        );
        assert_eq!(select_nexus_app_id(Some("../bad"), None), None);
    }

    #[test]
    fn nexus_http_statuses_fail_closed_for_reconnect_and_rate_limits() {
        assert_eq!(
            classify_nexus_response(StatusCode::UNAUTHORIZED, false),
            NexusResponseDisposition::Reconnect
        );
        assert_eq!(
            classify_nexus_response(StatusCode::FORBIDDEN, false),
            NexusResponseDisposition::Reconnect
        );
        assert_eq!(
            classify_nexus_response(StatusCode::FORBIDDEN, true),
            NexusResponseDisposition::Handoff
        );
        assert_eq!(
            classify_nexus_response(StatusCode::TOO_MANY_REQUESTS, false),
            NexusResponseDisposition::RateLimited
        );
        assert_eq!(
            classify_nexus_response(StatusCode::BAD_GATEWAY, false),
            NexusResponseDisposition::HttpError(502)
        );
    }

    #[test]
    fn nexus_game_mapping_requires_one_exact_normalized_match() {
        let game = test_game("steam-1", "The Elder Scrolls V: Skyrim", "skyrim");
        let games = vec![
            NexusGame {
                name: "Skyrim".to_string(),
                domain_name: "skyrim".to_string(),
            },
            NexusGame {
                name: "Fallout 4".to_string(),
                domain_name: "fallout4".to_string(),
            },
        ];
        assert_eq!(
            match_nexus_game(&game, &games).map(|game| game.domain_name.as_str()),
            Some("skyrim")
        );
    }

    #[test]
    fn nexus_file_selection_is_latest_non_archived_main_with_stable_tie_break() {
        let files = vec![
            nexus_file(9, 7, "ARCHIVED", 999, "archived.zip"),
            nexus_file(8, 3, "OPTIONAL", 998, "optional.zip"),
            nexus_file(11, 1, "MAIN", 200, "main-a.zip"),
            nexus_file(12, 1, "MAIN", 200, "main-b.7z"),
            nexus_file(10, 1, "MAIN", 100, "old-main.zip"),
        ];
        let selected = select_latest_main_nexus_file(&files).unwrap();
        assert_eq!(selected.file_id, 12);
        assert_eq!(selected.file_name, "main-b.7z");
    }

    #[test]
    fn nexus_file_size_prefers_exact_bytes_and_bounds_legacy_kib() {
        let mut exact = nexus_file(1, 1, "MAIN", 1, "mod.zip");
        exact.size_in_bytes = Some(Value::String("4097".to_string()));
        exact.size_kb = Some(Value::from(4));
        assert_eq!(
            expected_nexus_file_size(&exact),
            Some(mod_install::TrustedNexusExpectedSize {
                bytes: 4097,
                exact: true
            })
        );

        let mut legacy = nexus_file(2, 1, "MAIN", 2, "mod.7z");
        legacy.size_kb = Some(Value::from(12));
        assert_eq!(
            expected_nexus_file_size(&legacy),
            Some(mod_install::TrustedNexusExpectedSize {
                bytes: 12 * 1024,
                exact: false
            })
        );
    }

    fn test_game(id: &str, title: &str, slug: &str) -> InstalledGame {
        serde_json::from_value(serde_json::json!({
            "id": id,
            "title": title,
            "slug": slug,
            "description": "",
            "version": "",
            "launcher": "steam",
            "externalId": "620",
            "coverUrl": null,
            "iconUrl": null,
            "iconUrls": [],
            "logoUrl": null,
            "logoUrls": [],
            "logoPosition": "bottomLeft",
            "status": "installed",
            "platform": "windows",
            "installPath": null,
            "achievements": [],
            "achievementProviderStatuses": [],
            "saveFiles": [],
            "friendsPlaying": []
        }))
        .unwrap()
    }

    fn nexus_file(
        file_id: u64,
        category_id: u64,
        category_name: &str,
        uploaded_timestamp: u64,
        file_name: &str,
    ) -> NexusFile {
        NexusFile {
            file_id,
            category_id,
            category_name: category_name.to_string(),
            file_name: file_name.to_string(),
            uploaded_timestamp,
            mod_version: Some("1.0".to_string()),
            size_in_bytes: None,
            size_kb_in_bytes: None,
            size_kb: None,
            size: None,
        }
    }
}
