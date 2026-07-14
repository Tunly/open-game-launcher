use serde::Serialize;
use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
    env, fs,
    io::{Read, Write},
    net::TcpListener,
    path::{Path, PathBuf},
    process::Command,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Mutex,
    },
    thread,
};
use tauri::Manager;
use uuid::Uuid;

#[cfg(windows)]
use winreg::{
    enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ},
    RegKey,
};

const LAUNCHER_DIR: &str = "open-game-launcher";
const PRODUCT_DIR: &str = "Open Game Launcher";
const STEAM_ID64_BASE: u64 = 76_561_197_960_265_728;
static STEAM_CALLBACK_SERVER_STARTED: AtomicBool = AtomicBool::new(false);
static STEAM_WINDOW_OPEN_LOCK: Mutex<()> = Mutex::new(());
static ACTIVE_STEAM_SCRAPE_REQUEST: Mutex<Option<SteamScrapeRequest>> = Mutex::new(None);
static ACTIVE_STEAM_LOGIN_STATE: Mutex<Option<String>> = Mutex::new(None);
static NEXT_STEAM_SCRAPE_GENERATION: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    os: String,
    arch: String,
    app_version: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo {
    name: String,
    mount_point: String,
    total_space: u64,
    available_space: u64,
    file_system: String,
    kind: String,
    is_removable: bool,
    is_read_only: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareInfo {
    cpu: Option<String>,
    gpu: Option<String>,
    ram: Option<String>,
    monitor: Option<String>,
    keyboard: Option<String>,
    mouse: Option<String>,
    headset: Option<String>,
    source: String,
}

#[tauri::command]
pub fn get_system_info() -> SystemInfo {
    SystemInfo {
        os: env::consts::OS.to_string(),
        arch: env::consts::ARCH.to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

#[tauri::command]
pub fn get_default_install_dir() -> Result<String, String> {
    let path = match env::consts::OS {
        "windows" => dirs::data_dir()
            .or_else(dirs::home_dir)
            .map(|base| base.join(PRODUCT_DIR).join("games")),
        "macos" => dirs::home_dir().map(|home| {
            home.join("Library")
                .join("Application Support")
                .join(PRODUCT_DIR)
                .join("games")
        }),
        _ => linux_install_dir(),
    };

    path.map(path_to_string)
        .ok_or_else(|| "Could not resolve a default install directory.".to_string())
}

#[tauri::command]
pub fn get_hardware_info() -> HardwareInfo {
    match env::consts::OS {
        "windows" => windows_hardware_info(),
        "macos" => macos_hardware_info(),
        _ => linux_hardware_info(),
    }
}

#[tauri::command]
pub fn get_disk_info() -> Vec<DiskInfo> {
    use sysinfo::Disks;
    let disks = Disks::new_with_refreshed_list();
    disks
        .iter()
        .map(|disk| DiskInfo {
            name: disk.name().to_string_lossy().into_owned(),
            mount_point: disk.mount_point().to_string_lossy().into_owned(),
            total_space: disk.total_space(),
            available_space: disk.available_space(),
            file_system: disk.file_system().to_string_lossy().into_owned(),
            kind: disk.kind().to_string(),
            is_removable: disk.is_removable(),
            is_read_only: disk.is_read_only(),
        })
        .collect()
}

fn linux_install_dir() -> Option<PathBuf> {
    dirs::home_dir()
        .map(|home| {
            home.join(".local")
                .join("share")
                .join(LAUNCHER_DIR)
                .join("games")
        })
        .or_else(|| dirs::data_dir().map(|base| base.join(LAUNCHER_DIR).join("games")))
}

fn path_to_string(path: PathBuf) -> String {
    path.to_string_lossy().into_owned()
}

fn windows_hardware_info() -> HardwareInfo {
    HardwareInfo {
        cpu: powershell_first_line(
            "(Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty Name).Trim()",
        ),
        gpu: powershell_first_line(
            "(Get-CimInstance Win32_VideoController | Where-Object {$_.Name} | Select-Object -First 1 -ExpandProperty Name).Trim()",
        ),
        ram: powershell_first_line(
            "$bytes=(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory; if($bytes){ '{0} GB' -f [math]::Round($bytes / 1GB) }",
        ),
        monitor: powershell_first_line(
            "$video=Get-CimInstance Win32_VideoController | Where-Object {$_.CurrentHorizontalResolution -and $_.CurrentVerticalResolution} | Select-Object -First 1; if($video){ '{0}x{1}' -f $video.CurrentHorizontalResolution,$video.CurrentVerticalResolution }",
        ),
        keyboard: powershell_first_line(
            "(Get-CimInstance Win32_Keyboard | Select-Object -First 1 -ExpandProperty Name).Trim()",
        ),
        mouse: powershell_first_line(
            "(Get-CimInstance Win32_PointingDevice | Select-Object -First 1 -ExpandProperty Name).Trim()",
        ),
        headset: powershell_first_line(
            "(Get-CimInstance Win32_SoundDevice | Where-Object {$_.Name -match 'headset|headphone|audio|sound'} | Select-Object -First 1 -ExpandProperty Name).Trim()",
        ),
        source: "native".to_string(),
    }
}

fn linux_hardware_info() -> HardwareInfo {
    HardwareInfo {
        cpu: linux_cpu_name(),
        gpu: shell_first_line("lspci 2>/dev/null | grep -Ei 'vga|3d|display' | head -n 1"),
        ram: linux_ram_size(),
        monitor: shell_first_line("xrandr --current 2>/dev/null | awk '/ connected primary/{print $3; exit} / connected/{print $3; exit}' | cut -d+ -f1"),
        keyboard: linux_input_device("keyboard"),
        mouse: linux_input_device("mouse"),
        headset: linux_input_device("headset").or_else(|| linux_input_device("headphone")),
        source: "native".to_string(),
    }
}

fn macos_hardware_info() -> HardwareInfo {
    HardwareInfo {
        cpu: command_first_line("sysctl", &["-n", "machdep.cpu.brand_string"]),
        gpu: shell_first_line("system_profiler SPDisplaysDataType 2>/dev/null | awk -F': ' '/Chipset Model/{print $2; exit}'"),
        ram: macos_ram_size(),
        monitor: shell_first_line("system_profiler SPDisplaysDataType 2>/dev/null | awk -F': ' '/Resolution/{print $2; exit}'"),
        keyboard: None,
        mouse: None,
        headset: None,
        source: "native".to_string(),
    }
}

fn linux_cpu_name() -> Option<String> {
    fs::read_to_string("/proc/cpuinfo")
        .ok()
        .and_then(|content| {
            content.lines().find_map(|line| {
                line.strip_prefix("model name")
                    .and_then(|value| value.split_once(':'))
                    .and_then(|(_, name)| clean_line(name))
            })
        })
}

fn linux_ram_size() -> Option<String> {
    fs::read_to_string("/proc/meminfo")
        .ok()
        .and_then(|content| {
            content.lines().find_map(|line| {
                line.strip_prefix("MemTotal:").and_then(|value| {
                    let kb = value.split_whitespace().next()?.parse::<u64>().ok()?;
                    Some(format!(
                        "{} GB",
                        ((kb as f64 / 1024.0 / 1024.0).round()) as u64
                    ))
                })
            })
        })
}

fn macos_ram_size() -> Option<String> {
    command_first_line("sysctl", &["-n", "hw.memsize"]).and_then(|bytes| {
        let bytes = bytes.parse::<u64>().ok()?;
        Some(format!(
            "{} GB",
            ((bytes as f64 / 1024.0 / 1024.0 / 1024.0).round()) as u64
        ))
    })
}

fn linux_input_device(pattern: &str) -> Option<String> {
    fs::read_to_string("/proc/bus/input/devices")
        .ok()
        .and_then(|content| {
            content.lines().find_map(|line| {
                let name = line.strip_prefix("N: Name=\"")?.trim_end_matches('"');
                if name.to_lowercase().contains(pattern) {
                    clean_line(name)
                } else {
                    None
                }
            })
        })
}

fn powershell_first_line(script: &str) -> Option<String> {
    command_first_line(
        "powershell",
        &[
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ],
    )
}

fn shell_first_line(script: &str) -> Option<String> {
    command_first_line("sh", &["-c", script])
}

fn command_first_line(program: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(program).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }

    String::from_utf8(output.stdout)
        .ok()
        .and_then(|stdout| stdout.lines().find_map(clean_line))
}

fn clean_line(value: &str) -> Option<String> {
    let cleaned = value.trim().trim_matches('"').trim().to_string();
    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned)
    }
}

use crate::commands::uri_safety::{open_uri_safely, validate_uri_scheme};

pub fn open_uri(uri: &str) -> Result<(), String> {
    // Forward to the centralised safe opener. The historical
    // `cmd /C start "" <uri>` implementation has been removed because it
    // parsed the URI through cmd.exe, which made any `&` in the URI a
    // command separator. The replacement goes via `rundll32 url.dll,
    // FileProtocolHandler` (Windows) / `open` (macOS) / `xdg-open`
    // (Linux) and validates the URI scheme first.
    let safe_uri = validate_uri_scheme(uri)?;
    open_uri_safely(safe_uri)
}

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    let url = url.trim();
    if url.is_empty() {
        return Err("External URL is empty.".to_string());
    }

    let parsed =
        reqwest::Url::parse(url).map_err(|error| format!("External URL is invalid: {error}"))?;
    match parsed.scheme() {
        "http" | "https" => open_uri(parsed.as_str()),
        scheme => Err(format!("External URL scheme is not allowed: {scheme}")),
    }
}

fn claim_callback_server_start(gate: &AtomicBool) -> bool {
    gate.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_ok()
}

fn release_callback_server_start(gate: &AtomicBool) {
    gate.store(false, Ordering::Release);
}

struct CallbackServerStartLease(&'static AtomicBool);

impl Drop for CallbackServerStartLease {
    fn drop(&mut self) {
        release_callback_server_start(self.0);
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum SteamScrapeSource {
    Login,
    Silent,
}

impl SteamScrapeSource {
    fn as_str(self) -> &'static str {
        match self {
            Self::Login => "login",
            Self::Silent => "silent",
        }
    }

    fn parse(value: &str) -> Option<Self> {
        match value {
            "login" => Some(Self::Login),
            "silent" => Some(Self::Silent),
            _ => None,
        }
    }

    fn window_label(self) -> &'static str {
        match self {
            Self::Login => "steam-login",
            Self::Silent => "steam-silent-scraper",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct SteamScrapeRequest {
    generation: u64,
    request_id: String,
    source: SteamScrapeSource,
    steam_id: String,
}

fn next_steam_scrape_request(steam_id: &str, source: SteamScrapeSource) -> SteamScrapeRequest {
    SteamScrapeRequest {
        generation: NEXT_STEAM_SCRAPE_GENERATION.fetch_add(1, Ordering::Relaxed),
        request_id: Uuid::new_v4().to_string(),
        source,
        steam_id: steam_id.to_string(),
    }
}

fn set_active_steam_scrape_request(
    state: &Mutex<Option<SteamScrapeRequest>>,
    request: SteamScrapeRequest,
) {
    let mut active = state
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    if active
        .as_ref()
        .is_none_or(|current| current.generation <= request.generation)
    {
        *active = Some(request);
    }
}

fn active_steam_scrape_request_matches(
    state: &Mutex<Option<SteamScrapeRequest>>,
    request: &SteamScrapeRequest,
) -> bool {
    state
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .as_ref()
        == Some(request)
}

fn has_active_login_scrape(state: &Mutex<Option<SteamScrapeRequest>>) -> bool {
    state
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .as_ref()
        .is_some_and(|request| request.source == SteamScrapeSource::Login)
}

fn clear_active_steam_scrape_request(
    state: &Mutex<Option<SteamScrapeRequest>>,
    request: &SteamScrapeRequest,
) {
    let mut active = state
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    if active.as_ref() == Some(request) {
        *active = None;
    }
}

fn invalidate_active_steam_scrape_request(state: &Mutex<Option<SteamScrapeRequest>>) {
    *state
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner) = None;
}

fn claim_active_steam_scrape_result(
    state: &Mutex<Option<SteamScrapeRequest>>,
    request_id: &str,
    steam_id: &str,
    source: SteamScrapeSource,
) -> bool {
    let mut active = state
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let matches = active.as_ref().is_some_and(|request| {
        request.request_id == request_id && request.steam_id == steam_id && request.source == source
    });
    if matches {
        *active = None;
    }
    matches
}

fn park_steam_window(app: &tauri::AppHandle, source: SteamScrapeSource) {
    let Ok(blank_url) = "about:blank".parse::<reqwest::Url>() else {
        return;
    };

    if let Some(window) = app.get_webview_window(source.window_label()) {
        let _ = window.navigate(blank_url);
        let _ = window.hide();
    }
}

enum SteamScrapePayload<'a> {
    Games(&'a Vec<serde_json::Value>),
    Private,
}

fn steam_scrape_payload(value: &serde_json::Value) -> Option<SteamScrapePayload<'_>> {
    if let Some(games) = value.get("games").and_then(|games| games.as_array()) {
        return Some(SteamScrapePayload::Games(games));
    }
    if value.get("isPrivate").and_then(|flag| flag.as_bool()) == Some(true) {
        return Some(SteamScrapePayload::Private);
    }
    None
}

const STEAM_OPENID_ENDPOINT: &str = "https://steamcommunity.com/openid/login";
const STEAM_OPENID_NAMESPACE: &str = "http://specs.openid.net/auth/2.0";
const STEAM_OPENID_ID_PREFIXES: [&str; 2] = [
    "https://steamcommunity.com/openid/id/",
    "http://steamcommunity.com/openid/id/",
];

fn steam_login_callback_url(state: &str) -> Result<String, String> {
    let mut url = reqwest::Url::parse("http://localhost:18234/")
        .map_err(|error| format!("Failed to build Steam callback URL: {error}"))?;
    url.query_pairs_mut().append_pair("state", state);
    Ok(url.to_string())
}

fn steam_login_url(state: &str) -> Result<reqwest::Url, String> {
    let return_to = steam_login_callback_url(state)?;
    let mut url = reqwest::Url::parse(STEAM_OPENID_ENDPOINT)
        .map_err(|error| format!("Failed to build Steam login URL: {error}"))?;
    url.query_pairs_mut()
        .append_pair("openid.ns", STEAM_OPENID_NAMESPACE)
        .append_pair("openid.mode", "checkid_setup")
        .append_pair("openid.return_to", &return_to)
        .append_pair("openid.realm", "http://localhost:18234/")
        .append_pair(
            "openid.identity",
            "http://specs.openid.net/auth/2.0/identifier_select",
        )
        .append_pair(
            "openid.claimed_id",
            "http://specs.openid.net/auth/2.0/identifier_select",
        );
    Ok(url)
}

fn set_active_steam_login_state(state: String) {
    *ACTIVE_STEAM_LOGIN_STATE
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner) = Some(state);
}

fn claim_active_steam_login_state(expected: &str) -> bool {
    let mut active = ACTIVE_STEAM_LOGIN_STATE
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    if active.as_deref() != Some(expected) {
        return false;
    }
    *active = None;
    true
}

fn request_target(headers: &str) -> Option<&str> {
    let mut parts = headers.lines().next()?.split_whitespace();
    if parts.next()? != "GET" {
        return None;
    }
    let target = parts.next()?;
    if !parts.next()?.starts_with("HTTP/1.") || parts.next().is_some() {
        return None;
    }
    Some(target)
}

fn verify_steam_openid_callback_with(
    target: &str,
    expected_state: &str,
    verifier: impl FnOnce(&[(String, String)]) -> Result<bool, String>,
) -> Result<String, String> {
    if !target.starts_with('/') {
        return Err("Steam OpenID callback target is invalid.".to_string());
    }
    let callback = reqwest::Url::parse(&format!("http://localhost:18234{target}"))
        .map_err(|error| format!("Steam OpenID callback URL is invalid: {error}"))?;
    if callback.path() != "/" {
        return Err("Steam OpenID callback path is invalid.".to_string());
    }

    let mut parameters = BTreeMap::new();
    for (key, value) in callback.query_pairs() {
        if parameters
            .insert(key.into_owned(), value.into_owned())
            .is_some()
        {
            return Err("Steam OpenID callback contains duplicate parameters.".to_string());
        }
    }

    let required = |key: &str| {
        parameters
            .get(key)
            .map(String::as_str)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| format!("Steam OpenID callback is missing {key}."))
    };
    if required("state")? != expected_state
        || required("openid.ns")? != STEAM_OPENID_NAMESPACE
        || required("openid.mode")? != "id_res"
        || required("openid.op_endpoint")? != STEAM_OPENID_ENDPOINT
        || required("openid.return_to")? != steam_login_callback_url(expected_state)?
    {
        return Err("Steam OpenID callback metadata is invalid.".to_string());
    }

    let claimed_id = required("openid.claimed_id")?;
    if required("openid.identity")? != claimed_id {
        return Err("Steam OpenID identity does not match the claimed ID.".to_string());
    }
    let steam_id = STEAM_OPENID_ID_PREFIXES
        .iter()
        .find_map(|prefix| claimed_id.strip_prefix(prefix))
        .filter(|value| {
            value.len() == 17 && value.chars().all(|character| character.is_ascii_digit())
        })
        .ok_or_else(|| "Steam OpenID claimed ID is invalid.".to_string())?;

    for key in ["openid.response_nonce", "openid.assoc_handle", "openid.sig"] {
        required(key)?;
    }
    let signed_fields = required("openid.signed")?
        .split(',')
        .collect::<BTreeSet<_>>();
    for field in [
        "op_endpoint",
        "claimed_id",
        "identity",
        "return_to",
        "response_nonce",
        "assoc_handle",
    ] {
        if !signed_fields.contains(field) {
            return Err(format!("Steam OpenID response did not sign {field}."));
        }
    }

    let verification_parameters = parameters
        .iter()
        .filter(|(key, _)| key.starts_with("openid."))
        .map(|(key, value)| {
            (
                key.clone(),
                if key == "openid.mode" {
                    "check_authentication".to_string()
                } else {
                    value.clone()
                },
            )
        })
        .collect::<Vec<_>>();

    if !verifier(&verification_parameters)? {
        return Err("Steam rejected the OpenID callback assertion.".to_string());
    }
    Ok(steam_id.to_string())
}

fn verify_steam_openid_callback(target: &str) -> Result<String, String> {
    let expected_state = ACTIVE_STEAM_LOGIN_STATE
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .clone()
        .ok_or_else(|| "No Steam login is pending.".to_string())?;

    let steam_id = verify_steam_openid_callback_with(target, &expected_state, |parameters| {
        let response = ureq::post(STEAM_OPENID_ENDPOINT)
            .send_form(
                parameters
                    .iter()
                    .map(|(key, value)| (key.as_str(), value.as_str())),
            )
            .map_err(|error| format!("Could not verify Steam OpenID callback: {error}"))?;
        let mut body = String::new();
        response
            .into_body()
            .into_reader()
            .read_to_string(&mut body)
            .map_err(|error| format!("Could not read Steam OpenID verification: {error}"))?;
        Ok(body.lines().any(|line| line.trim() == "is_valid:true"))
    })?;

    if !claim_active_steam_login_state(&expected_state) {
        return Err("Steam login was superseded by a newer request.".to_string());
    }
    Ok(steam_id)
}

fn start_local_callback_server(app: tauri::AppHandle) {
    if !claim_callback_server_start(&STEAM_CALLBACK_SERVER_STARTED) {
        return;
    }

    let spawn_result = thread::Builder::new()
        .name("steam-callback-server".to_string())
        .spawn(move || {
        let _lease = CallbackServerStartLease(&STEAM_CALLBACK_SERVER_STARTED);
        let listener = match TcpListener::bind("127.0.0.1:18234") {
            Ok(l) => l,
            Err(e) => {
                println!("[Steam Login] Failed to bind local server: {e}");
                return;
            }
        };

        println!("[Steam Login] Local callback server listening on 127.0.0.1:18234");

        for stream in listener.incoming() {
            let mut stream = match stream {
                Ok(s) => s,
                Err(_) => continue,
            };

            let mut buffer = Vec::new();
            let mut temp_buf = [0u8; 4096];

            // Read headers first
            let mut headers_end = None;
            loop {
                let bytes_read = match stream.read(&mut temp_buf) {
                    Ok(0) => break,
                    Ok(n) => n,
                    Err(_) => break,
                };
                buffer.extend_from_slice(&temp_buf[..bytes_read]);

                // Find \r\n\r\n
                if let Some(pos) = buffer.windows(4).position(|w| w == b"\r\n\r\n") {
                    headers_end = Some(pos);
                    break;
                }
                if buffer.len() > 16384 {
                    break;
                }
            }

            let Some(h_end) = headers_end else {
                continue;
            };

            let headers_str = String::from_utf8_lossy(&buffer[..h_end]).into_owned();

            // Handle CORS preflight request (OPTIONS)
            if headers_str.starts_with("OPTIONS ") {
                let response = "HTTP/1.1 200 OK\r\n\
                                Access-Control-Allow-Origin: *\r\n\
                                Access-Control-Allow-Methods: POST, GET, OPTIONS\r\n\
                                Access-Control-Allow-Headers: content-type\r\n\
                                Connection: close\r\n\
                                Content-Length: 0\r\n\r\n";
                let _ = stream.write_all(response.as_bytes());
                continue;
            }

            // Extract Content-Length for POST requests
            let mut content_length = 0usize;
            for line in headers_str.lines() {
                if line.to_lowercase().starts_with("content-length:") {
                    if let Some(val) = line.split(':').nth(1) {
                        content_length = val.trim().parse().unwrap_or(0);
                    }
                }
            }

            // Read the remaining body bytes
            let body_start = h_end + 4;
            let Some(body_end) = body_start.checked_add(content_length) else {
                continue;
            };
            if content_length > 8 * 1024 * 1024 {
                continue;
            }
            while buffer.len() < body_end {
                let mut chunk = [0u8; 4096];
                let bytes_read = match stream.read(&mut chunk) {
                    Ok(0) => break,
                    Ok(n) => n,
                    Err(_) => break,
                };
                buffer.extend_from_slice(&chunk[..bytes_read]);
            }

            if body_end > buffer.len() {
                continue;
            }
            let body_str = String::from_utf8_lossy(&buffer[body_start..body_end]);

            // CASE 1: POST /scraped (scraped games list from WebView)
            if headers_str.starts_with("POST /scraped") {
                if let Ok(parsed_data) = serde_json::from_str::<serde_json::Value>(&body_str) {
                    use tauri::Emitter;

                    let request_id = parsed_data.get("requestId").and_then(|value| value.as_str());
                    let reported_steam_id =
                        parsed_data.get("steamId").and_then(|value| value.as_str());
                    let source = parsed_data
                        .get("source")
                        .and_then(|value| value.as_str())
                        .and_then(SteamScrapeSource::parse);
                    let payload = steam_scrape_payload(&parsed_data);
                    let has_payload = payload.is_some();

                    if let (
                        Some(request_id),
                        Some(reported_steam_id),
                        Some(source),
                        Some(payload),
                    ) = (request_id, reported_steam_id, source, payload)
                    {
                        let accepted = with_steam_window_open_lock(|| {
                            if !claim_active_steam_scrape_result(
                                &ACTIVE_STEAM_SCRAPE_REQUEST,
                                request_id,
                                reported_steam_id,
                                source,
                            ) {
                                return Ok(false);
                            }

                            match payload {
                                SteamScrapePayload::Games(games_array) => {
                                    println!(
                                        "[Steam Scraper] Received {} owned games from Webview for SteamID64 {}!",
                                        games_array.len(), reported_steam_id
                                    );
                                    let _ = app.emit(
                                        "steam_scraped_games_success",
                                        serde_json::json!({
                                            "steamId": reported_steam_id,
                                            "games": games_array,
                                        }),
                                    );
                                }
                                SteamScrapePayload::Private => {
                                    println!("[Steam Scraper] Scraper reported profile or game details are private.");
                                    let _ = app.emit(
                                        "steam_scraped_games_error",
                                        serde_json::json!({
                                            "steamId": reported_steam_id,
                                            "message": "Steam profile or game details are private.",
                                        }),
                                    );
                                }
                            }

                            park_steam_window(&app, source);
                            Ok(true)
                        })
                        .unwrap_or(false);

                        if !accepted {
                            println!(
                                "[Steam Scraper] Ignored stale result for SteamID64 {reported_steam_id}."
                            );
                        }
                    } else if has_payload {
                        println!(
                            "[Steam Scraper] Ignored result without request correlation metadata."
                        );
                    }
                }

                let response = "HTTP/1.1 200 OK\r\n\
                                Access-Control-Allow-Origin: *\r\n\
                                Connection: close\r\n\
                                Content-Length: 0\r\n\r\n";
                let _ = stream.write_all(response.as_bytes());
                continue;
            }

            // CASE 2: GET / (OpenID Login Redirect)
            let steam_id = request_target(&headers_str).and_then(|target| {
                match verify_steam_openid_callback(target) {
                    Ok(steam_id) => Some(steam_id),
                    Err(error) => {
                        println!("[Steam Login] Rejected callback: {error}");
                        None
                    }
                }
            });

            if let Some(sid) = steam_id {
                    println!("[Steam Login] Extracted SteamID64: {}", sid);

                    let scrape_request =
                        next_steam_scrape_request(&sid, SteamScrapeSource::Login);
                    let Ok(games_url) = steam_scraper_url(
                        &scrape_request.steam_id,
                        &scrape_request.request_id,
                        scrape_request.source,
                    )
                    else {
                        continue;
                    };
                    set_active_steam_scrape_request(
                        &ACTIVE_STEAM_SCRAPE_REQUEST,
                        scrape_request,
                    );

                    use tauri::Emitter;
                    let _ = app.emit("steam_login_success", sid.clone());

                    // Respond with a page that immediately redirects to their games list.
                    // Since they just logged in inside the Webview, cookies are fully active!
                    let redirect_html = format!(
                        r#"
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <meta charset="utf-8">
                            <title>OG Launcher - Redirecting...</title>
                            <style>
                                body {{
                                    font-family: system-ui, -apple-system, sans-serif;
                                    background-color: #fbf4e7;
                                    color: #171411;
                                    text-align: center;
                                    padding: 50px;
                                    margin: 0;
                                }}
                                .container {{
                                    max-width: 500px;
                                    margin: 80px auto;
                                    border: 4px solid #000;
                                    background-color: #efe6d4;
                                    padding: 40px 30px;
                                    box-shadow: 6px 6px 0px #000;
                                }}
                                h1 {{
                                    font-weight: 900;
                                    text-transform: uppercase;
                                    margin-bottom: 20px;
                                    font-size: 24px;
                                    letter-spacing: -0.02em;
                                }}
                                p {{ font-weight: bold; font-size: 14px; color: #55504a; }}
                            </style>
                        </head>
                        <body>
                            <div class="container">
                                <h1>Login successful!</h1>
                                <p>Your Steam game list is loading...</p>
                            </div>
                            <script>
                                window.location.href = "{}";
                            </script>
                        </body>
                        </html>
                    "#,
                        games_url
                    );

                    let response = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        redirect_html.len(),
                        redirect_html
                    );

                    let _ = stream.write_all(response.as_bytes());
                    let _ = stream.flush();
                    continue;
            }

            let response_body =
                "HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
            let _ = stream.write_all(response_body.as_bytes());
        }
    });

    if let Err(error) = spawn_result {
        release_callback_server_start(&STEAM_CALLBACK_SERVER_STARTED);
        println!("[Steam Login] Failed to start local server thread: {error}");
    }
}

fn steam_scraper_script() -> &'static str {
    r#"
        (function() {
            console.log("[Steam Scraper] Active!");

            const pageUrl = new URL(window.location.href);
            const requestId = pageUrl.searchParams.get("ogl_request_id") || "";
            const source = pageUrl.searchParams.get("ogl_source") || "";
            const profileMatch = pageUrl.pathname.match(/^\/profiles\/(\d+)\/games\/?$/i);
            const steamId = profileMatch ? profileMatch[1] : "";
            if (!requestId || !steamId || !["login", "silent"].includes(source)) return;

            function appIdFromValue(value) {
                if (!value) return "";
                const match = String(value).match(/(?:app\/|appid[=:]|^|,)(\d{2,})/i);
                return match ? match[1] : "";
            }

            function cleanTitle(value) {
                return String(value || "")
                    .replace(/\s+/g, " ")
                    .replace(/\bView Store Page\b/gi, "")
                    .trim();
            }

            function pushGame(map, appid, title, playtimeHours, lastPlayed) {
                appid = appIdFromValue(appid);
                title = cleanTitle(title);
                if (!appid || !title || map.has(appid)) return;
                const game = {
                    appid,
                    name: title
                };
                if (
                    playtimeHours !== undefined &&
                    playtimeHours !== null &&
                    String(playtimeHours).trim() !== ""
                ) {
                    game.hours_forever = playtimeHours;
                }
                const parsedLastPlayed = Number(lastPlayed || 0);
                if (Number.isFinite(parsedLastPlayed) && parsedLastPlayed > 0) {
                    game.last_played = parsedLastPlayed;
                }
                map.set(appid, game);
            }

            function collectFromGlobals(map) {
                const sources = [window.rgGames, window.g_rgGames, window.g_rgGameList];
                for (const source of sources) {
                    if (!Array.isArray(source)) continue;
                    for (const game of source) {
                        pushGame(
                            map,
                            game && (game.appid || game.app_id || game.id),
                            game && (game.name || game.title),
                            game && (game.hours_forever ?? game.hours ?? game.playtime_forever),
                            game && (game.last_played || game.lastPlayed || game.rtime_last_played)
                        );
                    }
                }
            }

            function hasExplicitEmptyLibrary() {
                const gameArrays = [window.rgGames, window.g_rgGames, window.g_rgGameList]
                    .filter(Array.isArray);
                if (gameArrays.length > 0 && gameArrays.every((games) => games.length === 0)) {
                    return true;
                }
                const text = document.body ? document.body.innerText || "" : "";
                return /(?:no games|does not own any games|has no games)/i.test(text);
            }

            function collectFromDom(map) {
                const rows = document.querySelectorAll(
                    '[data-ds-appid], [data-appid], a[href*="/app/"], .gameListRow'
                );

                rows.forEach((row) => {
                    const hrefNode = row.matches && row.matches('a[href*="/app/"]')
                        ? row
                        : row.querySelector && row.querySelector('a[href*="/app/"]');
                    const appid =
                        row.getAttribute && (
                            row.getAttribute('data-ds-appid') ||
                            row.getAttribute('data-appid')
                        ) ||
                        (hrefNode && hrefNode.getAttribute('href')) ||
                        "";
                    const titleNode =
                        row.querySelector && (
                            row.querySelector('.gameListRowItemName') ||
                            row.querySelector('.gameListRowLogo img') ||
                            row.querySelector('img[alt]') ||
                            row.querySelector('[title]')
                        );
                    const title =
                        (titleNode && (
                            titleNode.getAttribute('alt') ||
                            titleNode.getAttribute('title') ||
                            titleNode.textContent
                        )) ||
                        row.getAttribute && (
                            row.getAttribute('aria-label') ||
                            row.getAttribute('title')
                        ) ||
                        row.textContent ||
                        "";
                    pushGame(map, appid, title);
                });
            }

            function collectFromScripts(map) {
                const text = Array.from(document.scripts)
                    .map((script) => script.textContent || "")
                    .join("\n");
                const match = text.match(/(?:var\s+)?(?:rgGames|g_rgGames)\s*=\s*(\[[\s\S]*?\]);/);
                if (!match) return;

                try {
                    const games = JSON.parse(match[1]);
                    if (Array.isArray(games)) {
                        for (const game of games) {
                            pushGame(
                                map,
                                game && (game.appid || game.app_id || game.id),
                                game && (game.name || game.title),
                                game && (game.hours_forever ?? game.hours ?? game.playtime_forever),
                                game && (game.last_played || game.lastPlayed || game.rtime_last_played)
                            );
                        }
                    }
                } catch (error) {
                    console.warn("[Steam Scraper] Failed to parse script game list", error);
                }
            }

            function post(payload) {
                if (window.__ogSteamScraperPosted) return;
                window.__ogSteamScraperPosted = true;
                fetch("http://127.0.0.1:18234/scraped", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...payload, requestId, source, steamId })
                }).catch((error) => {
                    window.__ogSteamScraperPosted = false;
                    console.error("[Steam Scraper] Fetch error:", error);
                });
            }

            function tryScrape() {
                const url = window.location.href;
                if (!url.includes("steamcommunity.com/profiles/") && !url.includes("steamcommunity.com/id/")) {
                    return;
                }
                if (!url.includes("/games")) {
                    return;
                }

                window.__ogSteamScraperAttempts = (window.__ogSteamScraperAttempts || 0) + 1;

                const map = new Map();
                collectFromGlobals(map);
                collectFromScripts(map);
                collectFromDom(map);

                const games = Array.from(map.values());
                const bodyText = document.body ? document.body.innerText || document.body.innerHTML : "";
                const isPrivate =
                    bodyText.includes("This profile is private") ||
                    bodyText.includes("Game details are private") ||
                    bodyText.includes("profile_private_info") ||
                    document.title.includes("Sign In");

                if (games.length > 0) {
                    console.log("[Steam Scraper] Found games: " + games.length + ", posting to backend...");
                    post({ games });
                } else if (isPrivate) {
                    console.log("[Steam Scraper] Profile is private or requires login, reporting to backend...");
                    post({ isPrivate: true });
                } else if (
                    document.readyState === "complete" &&
                    window.__ogSteamScraperAttempts >= 5 &&
                    hasExplicitEmptyLibrary()
                ) {
                    console.log("[Steam Scraper] Library is empty, posting terminal result...");
                    post({ games: [] });
                }
            }

            window.addEventListener("DOMContentLoaded", tryScrape);
            window.addEventListener("load", tryScrape);
            setInterval(tryScrape, 1500);
        })();
    "#
}

#[tauri::command]
pub async fn open_steam_login_window(app: tauri::AppHandle) -> Result<(), String> {
    start_local_callback_server(app.clone());

    let login_state = Uuid::new_v4().to_string();
    let parsed_url = steam_login_url(&login_state)?;
    set_active_steam_login_state(login_state.clone());
    invalidate_active_steam_scrape_request(&ACTIVE_STEAM_SCRAPE_REQUEST);

    let result = with_steam_window_open_lock(|| {
        park_steam_window(&app, SteamScrapeSource::Silent);

        if let Some(existing_window) = app.get_webview_window("steam-login") {
            existing_window
                .navigate(parsed_url)
                .map_err(|error| format!("Failed to navigate Steam login window: {error}"))?;
            existing_window
                .show()
                .map_err(|error| format!("Failed to show Steam login window: {error}"))?;
            existing_window
                .set_focus()
                .map_err(|error| format!("Failed to focus Steam login window: {error}"))?;
            return Ok(());
        }

        tauri::WebviewWindowBuilder::new(
            &app,
            "steam-login",
            tauri::WebviewUrl::External(parsed_url),
        )
        .title("Steam Login")
        .inner_size(800.0, 600.0)
        .center()
        .resizable(true)
        .initialization_script(steam_scraper_script())
        .build()
        .map_err(|error| format!("Failed to create login window: {error}"))?;

        Ok(())
    });

    if result.is_err() {
        claim_active_steam_login_state(&login_state);
    }
    result
}

fn steam_scraper_url(
    steam_id: &str,
    request_id: &str,
    source: SteamScrapeSource,
) -> Result<String, String> {
    let steam_id = steam_id.trim();
    if steam_id.is_empty() || !steam_id.chars().all(|character| character.is_ascii_digit()) {
        return Err("SteamID64 ist ungueltig.".to_string());
    }
    let request_id = request_id.trim();
    if request_id.is_empty() {
        return Err("Steam scrape request ID is empty.".to_string());
    }

    let mut url = reqwest::Url::parse(&format!(
        "https://steamcommunity.com/profiles/{steam_id}/games/"
    ))
    .map_err(|error| format!("Failed to build Steam games URL: {error}"))?;
    url.query_pairs_mut()
        .append_pair("tab", "all")
        .append_pair("ogl_request_id", request_id)
        .append_pair("ogl_source", source.as_str());
    Ok(url.to_string())
}

fn with_steam_window_open_lock<T>(action: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    let _guard = STEAM_WINDOW_OPEN_LOCK
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    action()
}

#[tauri::command]
pub async fn open_steam_scraper_window(
    app: tauri::AppHandle,
    steam_id: String,
) -> Result<(), String> {
    let steam_id = steam_id.trim().to_string();
    if has_active_login_scrape(&ACTIVE_STEAM_SCRAPE_REQUEST) {
        return Ok(());
    }
    let request = next_steam_scrape_request(&steam_id, SteamScrapeSource::Silent);
    let url = steam_scraper_url(&request.steam_id, &request.request_id, request.source)?;
    set_active_steam_scrape_request(&ACTIVE_STEAM_SCRAPE_REQUEST, request.clone());

    start_local_callback_server(app.clone());

    let result = with_steam_window_open_lock(|| {
        if !active_steam_scrape_request_matches(&ACTIVE_STEAM_SCRAPE_REQUEST, &request) {
            return Ok(());
        }

        let parsed_url = url
            .parse()
            .map_err(|error| format!("Failed to parse Steam games URL: {error}"))?;

        if let Some(existing_window) = app.get_webview_window("steam-silent-scraper") {
            return existing_window
                .navigate(parsed_url)
                .map_err(|error| format!("Failed to navigate Steam sync window: {error}"));
        }

        tauri::WebviewWindowBuilder::new(
            &app,
            "steam-silent-scraper",
            tauri::WebviewUrl::External(parsed_url),
        )
        .title("Steam Library Sync")
        .inner_size(900.0, 700.0)
        .visible(false)
        .initialization_script(steam_scraper_script())
        .build()
        .map_err(|error| format!("Failed to create Steam sync window: {error}"))?;

        Ok(())
    });

    if result.is_err() {
        clear_active_steam_scrape_request(&ACTIVE_STEAM_SCRAPE_REQUEST, &request);
    }
    result
}

// =====================================================================
// FETCH OWNED GAMES (backend HTTP to bypass CORS)
// =====================================================================

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AchievementSummary {
    pub unlocked: u64,
    pub total: u64,
    pub is_perfect: bool,
    pub source: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OwnedGame {
    pub id: String,
    pub external_id: Option<String>,
    pub title: String,
    pub description: String,
    pub cover_url: Option<String>,
    pub logo_url: Option<String>,
    pub icon_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub playtime_minutes: Option<u64>,
    pub last_played_at: Option<String>,
    pub cloud_gaming_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub achievement_summary: Option<AchievementSummary>,
}

#[derive(Debug, Default, Clone)]
struct LocalSteamOwnedActivity {
    playtime_minutes: Option<u64>,
    last_played: Option<u64>,
}

fn parse_steam_achievement_progress(json: &str) -> HashMap<String, AchievementSummary> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(json) else {
        return HashMap::new();
    };
    let Some(entries) = value.get("mapCache").and_then(serde_json::Value::as_array) else {
        return HashMap::new();
    };

    entries
        .iter()
        .filter_map(|entry| {
            let pair = entry.as_array()?;
            let progress = pair.get(1)?.as_object()?;
            if progress.get("vetted").and_then(serde_json::Value::as_bool) != Some(true) {
                return None;
            }

            let app_id = json_string_or_number(pair.first())
                .or_else(|| json_string_or_number(progress.get("appid")))?;
            let unlocked = progress.get("unlocked").and_then(json_u64)?;
            let total = progress.get("total").and_then(json_u64)?;
            if total == 0 {
                return None;
            }
            let all_unlocked = progress
                .get("all_unlocked")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(false);

            Some((
                app_id,
                AchievementSummary {
                    unlocked: unlocked.min(total),
                    total,
                    is_perfect: all_unlocked && unlocked >= total,
                    source: "steam".to_string(),
                },
            ))
        })
        .collect()
}

fn read_steam_achievement_progress(config_dir: &Path) -> HashMap<String, AchievementSummary> {
    let path = config_dir
        .join("librarycache")
        .join("achievement_progress.json");
    fs::read_to_string(path)
        .ok()
        .map(|json| parse_steam_achievement_progress(&json))
        .unwrap_or_default()
}

fn fetch_local_steam_owned_games(steam_id: &str) -> Vec<OwnedGame> {
    let Some(steam_dir) = find_steam_dir() else {
        println!("[Steam] Local Steam install was not found.");
        return Vec::new();
    };

    let Some(account_id) = steam_account_id_from_id64(steam_id) else {
        println!("[Steam] Could not map SteamID64 '{steam_id}' to a local account id.");
        return Vec::new();
    };

    let account_config_dir = steam_dir.join("userdata").join(&account_id).join("config");
    if !account_config_dir.exists() {
        println!(
            "[Steam] Local Steam userdata was not found for SteamID64 '{steam_id}' (account id {account_id})."
        );
        return Vec::new();
    }

    let app_ids = collect_account_steam_app_ids(&account_config_dir);

    if app_ids.is_empty() {
        println!("[Steam] Local Steam cache did not contain any app ids.");
        return Vec::new();
    }

    let titles = read_steam_appinfo_game_titles(&steam_dir);
    if titles.is_empty() {
        println!("[Steam] Local Steam appinfo cache did not contain game titles.");
        return Vec::new();
    }

    let activity = read_steam_owned_activity(&account_config_dir);
    let achievement_progress = read_steam_achievement_progress(&account_config_dir);
    let mut games = Vec::new();

    for app_id in app_ids {
        let Some(title) = titles.get(&app_id) else {
            continue;
        };
        if is_steam_non_game_owned_item(Some(&app_id), title) {
            continue;
        }

        let app_activity = activity.get(&app_id).cloned().unwrap_or_default();

        games.push(OwnedGame {
            id: format!("steam-owned-{app_id}"),
            external_id: Some(app_id.clone()),
            title: title.clone(),
            description: String::new(),
            last_played_at: app_activity
                .last_played
                .map(crate::commands::games::unix_timestamp_to_iso),
            cover_url: find_steam_cached_asset(
                &steam_dir,
                &app_id,
                &["library_hero.jpg", "library_header.jpg", "header.jpg"],
            )
            .or_else(|| {
                Some(format!(
                    "https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/library_hero.jpg"
                ))
            }),
            logo_url: find_steam_cached_asset(
                &steam_dir,
                &app_id,
                &[
                    "logo.png",
                    "library_logo.png",
                    "library_header.jpg",
                    "header.jpg",
                ],
            )
            .or_else(|| {
                Some(format!(
                    "https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/header.jpg"
                ))
            }),
            icon_url: find_steam_cached_asset(
                &steam_dir,
                &app_id,
                &["header.jpg", "library_header.jpg"],
            ),
            playtime_minutes: app_activity.playtime_minutes,
            cloud_gaming_url: None,
            achievement_summary: achievement_progress.get(&app_id).cloned(),
        });
    }

    games.sort_by(|a, b| {
        a.title
            .to_lowercase()
            .cmp(&b.title.to_lowercase())
            .then_with(|| a.id.cmp(&b.id))
    });

    games
}

fn steam_account_id_from_id64(steam_id: &str) -> Option<String> {
    let id64 = steam_id.trim().parse::<u64>().ok()?;
    id64.checked_sub(STEAM_ID64_BASE)
        .map(|account_id| account_id.to_string())
}

fn find_steam_dir() -> Option<PathBuf> {
    let mut candidates = Vec::new();

    if cfg!(target_os = "windows") {
        candidates.extend(find_steam_dirs_from_registry());

        if let Some(program_files_x86) = env_path("ProgramFiles(x86)") {
            candidates.push(program_files_x86.join("Steam"));
        }

        if let Some(program_files) = env_path("ProgramFiles") {
            candidates.push(program_files.join("Steam"));
        }

        candidates.push(PathBuf::from(r"C:\Steam"));
    } else if let Some(home) = env_path("HOME") {
        candidates.push(home.join(".local/share/Steam"));
        candidates.push(home.join(".steam/steam"));
        candidates.push(home.join(".steam/root"));
        candidates.push(home.join(".var/app/com.valvesoftware.Steam/.local/share/Steam"));
        candidates.push(home.join(".var/app/com.valvesoftware.Steam/data/Steam"));
        candidates.push(home.join("Library/Application Support/Steam"));
    }

    candidates.into_iter().find(|candidate| candidate.exists())
}

#[cfg(windows)]
fn find_steam_dirs_from_registry() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let roots = [
        (HKEY_CURRENT_USER, r"Software\Valve\Steam"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Valve\Steam"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\Valve\Steam"),
    ];

    for (hkey, path) in roots {
        let root = RegKey::predef(hkey);
        let Ok(key) = root.open_subkey_with_flags(path, KEY_READ) else {
            continue;
        };

        for value_name in ["SteamPath", "InstallPath"] {
            let Ok(value) = key.get_value::<String, _>(value_name) else {
                continue;
            };

            if !value.trim().is_empty() {
                candidates.push(PathBuf::from(value.replace('/', "\\")));
            }
        }
    }

    candidates
}

#[cfg(not(windows))]
fn find_steam_dirs_from_registry() -> Vec<PathBuf> {
    Vec::new()
}

fn env_path(key: &str) -> Option<PathBuf> {
    env::var_os(key).map(PathBuf::from)
}

fn collect_account_steam_app_ids(account_config_dir: &Path) -> BTreeSet<String> {
    let mut app_ids = BTreeSet::new();

    let library_cache_dir = account_config_dir.join("librarycache");
    if let Ok(entries) = fs::read_dir(library_cache_dir) {
        for entry in entries.filter_map(|entry| entry.ok()) {
            let path = entry.path();
            if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
                continue;
            }

            let Some(stem) = path.file_stem().and_then(|stem| stem.to_str()) else {
                continue;
            };

            if is_numeric_steam_app_id(stem) {
                app_ids.insert(stem.to_string());
            }
        }
    }

    let localconfig = account_config_dir.join("localconfig.vdf");
    if let Ok(contents) = fs::read_to_string(localconfig) {
        app_ids.extend(collect_vdf_block_keys(&contents, "apps"));
        app_ids.extend(collect_vdf_block_keys(&contents, "apptickets"));
    }

    app_ids
}

fn read_steam_appinfo_game_titles(steam_dir: &Path) -> BTreeMap<String, String> {
    let appinfo_path = steam_dir.join("appcache").join("appinfo.vdf");
    let Ok(contents) = fs::read(appinfo_path) else {
        return BTreeMap::new();
    };

    let mut titles = BTreeMap::new();
    let mut position = 16usize;

    while position + 8 <= contents.len() {
        let Some(app_id) = read_u32_le(&contents, position) else {
            break;
        };
        let Some(record_size) = read_u32_le(&contents, position + 4).map(|size| size as usize)
        else {
            break;
        };

        if app_id == 0 || record_size == 0 {
            break;
        }

        let record_start = position + 8;
        let record_end = record_start.saturating_add(record_size);
        if record_end > contents.len() {
            break;
        }

        let record = &contents[record_start..record_end];
        let title = extract_appinfo_string_field(record, 4);
        let product_type = extract_appinfo_string_field(record, 5);

        if let (Some(title), Some(product_type)) = (title, product_type) {
            if product_type.eq_ignore_ascii_case("game") && is_valid_steam_title(&title) {
                titles.insert(app_id.to_string(), title);
            }
        }

        position = record_end;
    }

    titles
}

fn read_u32_le(bytes: &[u8], position: usize) -> Option<u32> {
    let slice = bytes.get(position..position + 4)?;
    Some(u32::from_le_bytes(slice.try_into().ok()?))
}

fn extract_appinfo_string_field(record: &[u8], key: u32) -> Option<String> {
    let needle = [
        1,
        (key & 0xff) as u8,
        ((key >> 8) & 0xff) as u8,
        ((key >> 16) & 0xff) as u8,
        ((key >> 24) & 0xff) as u8,
    ];

    let index = find_bytes(record, &needle)?;
    let value_start = index + needle.len();
    let value_end = record[value_start..]
        .iter()
        .position(|byte| *byte == 0)
        .map(|relative| value_start + relative)?;

    let value = String::from_utf8_lossy(&record[value_start..value_end])
        .trim()
        .to_string();

    (!value.is_empty()).then_some(value)
}

fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn is_valid_steam_title(title: &str) -> bool {
    let title = title.trim();
    !title.is_empty()
        && title.len() <= 180
        && !title.contains('\u{fffd}')
        && !title.chars().any(|character| {
            character.is_control() && character != '\t' && character != '\n' && character != '\r'
        })
}

fn is_steam_non_game_owned_item(app_id: Option<&str>, title: &str) -> bool {
    let normalized = title
        .to_lowercase()
        .replace(['_', '-'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    if matches!(
        app_id,
        Some("228980")
            | Some("1070560")
            | Some("1391110")
            | Some("1628350")
            | Some("1887720")
            | Some("2102450")
            | Some("2289880")
            | Some("250820")
            | Some("1826330")
    ) {
        return true;
    }

    normalized == "steamworks common redistributables"
        || normalized.starts_with("steam linux runtime")
        || normalized.starts_with("proton ")
        || normalized.contains("proton easyanticheat runtime")
        || normalized.contains("proton battleye runtime")
        || normalized.contains("steamvr")
        || normalized.contains("steam vr")
        || normalized.contains("common redistributable")
        || normalized.contains("dedicated server")
        || normalized.ends_with(" sdk")
        || normalized.contains(" sdk ")
}

fn find_steam_cached_asset(steam_dir: &Path, app_id: &str, filenames: &[&str]) -> Option<String> {
    let app_cache_dir = steam_dir.join("appcache").join("librarycache").join(app_id);

    for filename in filenames {
        let path = app_cache_dir.join(filename);
        if path.is_file() {
            return Some(path_to_string(path));
        }
    }

    let entries = fs::read_dir(app_cache_dir).ok()?;
    for entry in entries.filter_map(|entry| entry.ok()) {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        if !file_type.is_dir() {
            continue;
        }

        for filename in filenames {
            let path = entry.path().join(filename);
            if path.is_file() {
                return Some(path_to_string(path));
            }
        }
    }

    None
}

fn read_steam_owned_activity(
    account_config_dir: &Path,
) -> BTreeMap<String, LocalSteamOwnedActivity> {
    let localconfig = account_config_dir.join("localconfig.vdf");
    let Ok(contents) = fs::read_to_string(localconfig) else {
        return BTreeMap::new();
    };

    let mut activity_by_app = BTreeMap::new();
    let lines: Vec<&str> = contents.lines().collect();
    let Some(apps_section_start) = find_vdf_section_open_line(&lines, "apps") else {
        return activity_by_app;
    };

    let mut depth = 0usize;
    let mut current_app_id: Option<String> = None;

    for line in lines.iter().skip(apps_section_start) {
        let trimmed = line.trim();
        match trimmed {
            "{" => {
                depth += 1;
                continue;
            }
            "}" => {
                if depth == 2 {
                    current_app_id = None;
                }

                if depth == 0 {
                    break;
                }

                depth -= 1;
                if depth == 0 {
                    break;
                }
                continue;
            }
            _ => {}
        }

        if depth == 1 {
            if let Some(app_id) = quoted_vdf_key(trimmed) {
                if is_numeric_steam_app_id(&app_id) {
                    current_app_id = Some(app_id);
                }
            }
            continue;
        }

        if depth == 2 {
            let Some(app_id) = current_app_id.as_ref() else {
                continue;
            };

            let Some((key, value)) = parse_vdf_key_value(trimmed) else {
                continue;
            };

            let entry = activity_by_app
                .entry(app_id.clone())
                .or_insert_with(LocalSteamOwnedActivity::default);

            if matches!(
                key.as_str(),
                "Playtime"
                    | "PlaytimeForever"
                    | "playtime_forever"
                    | "PlaytimeWindows"
                    | "PlaytimeMacOS"
                    | "PlaytimeLinux"
            ) {
                if let Ok(minutes) = value.parse::<u64>() {
                    entry.playtime_minutes = Some(
                        entry
                            .playtime_minutes
                            .map_or(minutes, |existing| existing.max(minutes)),
                    );
                }
            } else if matches!(key.as_str(), "LastPlayed" | "LastPlayedTime") {
                if let Ok(timestamp) = value.parse::<u64>() {
                    if timestamp > 1_000_000_000 && timestamp < 2_000_000_000 {
                        entry.last_played = Some(
                            entry
                                .last_played
                                .map_or(timestamp, |existing| existing.max(timestamp)),
                        );
                    }
                }
            }
        }
    }

    activity_by_app
}

fn collect_vdf_block_keys(contents: &str, section_name: &str) -> BTreeSet<String> {
    let lines: Vec<&str> = contents.lines().collect();
    let Some(section_open_line) = find_vdf_section_open_line(&lines, section_name) else {
        return BTreeSet::new();
    };

    let mut keys = BTreeSet::new();
    let mut depth = 0usize;

    for line in lines.iter().skip(section_open_line) {
        let trimmed = line.trim();
        match trimmed {
            "{" => {
                depth += 1;
                continue;
            }
            "}" => {
                if depth == 0 {
                    break;
                }

                depth -= 1;
                if depth == 0 {
                    break;
                }
                continue;
            }
            _ => {}
        }

        if depth == 1 {
            if let Some(key) = quoted_vdf_key(trimmed) {
                if is_numeric_steam_app_id(&key) {
                    keys.insert(key);
                }
            }
        }
    }

    keys
}

fn find_vdf_section_open_line(lines: &[&str], section_name: &str) -> Option<usize> {
    for (index, line) in lines.iter().enumerate() {
        if quoted_vdf_key(line).as_deref() != Some(section_name) {
            continue;
        }

        let open_index = next_non_empty_line(lines, index + 1)?;
        if lines[open_index].trim() == "{" {
            return Some(open_index);
        }
    }

    None
}

fn next_non_empty_line(lines: &[&str], start: usize) -> Option<usize> {
    lines
        .iter()
        .enumerate()
        .skip(start)
        .find(|(_, line)| {
            let trimmed = line.trim();
            !trimmed.is_empty() && !trimmed.starts_with("//")
        })
        .map(|(index, _)| index)
}

fn quoted_vdf_key(line: &str) -> Option<String> {
    let trimmed = line.trim();
    let end_quote = trimmed.strip_prefix('"')?.find('"')?;
    Some(trimmed[1..end_quote + 1].to_string())
}

fn parse_vdf_key_value(line: &str) -> Option<(String, String)> {
    let trimmed = line.trim();
    let key_end = trimmed.strip_prefix('"')?.find('"')? + 1;
    let key = trimmed[1..key_end].to_string();
    let value_start = trimmed[key_end + 1..].find('"')? + key_end + 2;
    let value_end = trimmed[value_start..].find('"')? + value_start;

    Some((key, trimmed[value_start..value_end].to_string()))
}

fn is_numeric_steam_app_id(value: &str) -> bool {
    !value.is_empty() && value.chars().all(|character| character.is_ascii_digit())
}

#[tauri::command]
pub async fn fetch_steam_owned_games(steam_id: String) -> Result<Vec<OwnedGame>, String> {
    let local_games = fetch_local_steam_owned_games(&steam_id);
    if !local_games.is_empty() {
        println!(
            "[Steam] Loaded {} owned games from local Steam client cache for ID '{steam_id}'",
            local_games.len()
        );
        return Ok(local_games);
    }

    let url = format!(
        "https://steamcommunity.com/profiles/{}/games?tab=all",
        steam_id
    );

    println!("[Steam] Requesting HTML games page: {url}");

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {e}"))?;

    let status = response.status();
    println!("[Steam] Response status: {status}");

    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        let preview = &body[..body.len().min(300)];
        return Err(format!(
            "Steam HTTP {status} for ID '{steam_id}': {preview}"
        ));
    }

    let html = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {e}"))?;

    println!("[Steam] HTML length: {} bytes", html.len());

    // Steam embeds game data as: var rgGames = [...];
    // We find this JSON array and parse it directly.
    let json_array = extract_rg_games_json(&html).ok_or_else(|| {
        // Check if it's a private profile page
        if html.contains("This profile is private") || html.contains("profile_private_info") {
            format!("Steam profile or game details are private for ID '{steam_id}'. Set both 'Profile' and 'Game Details' to Public in Steam Privacy Settings.")
        } else if html.contains("sign in") || html.contains("login") || html.contains("Sign In") {
            format!("Steam requires login to view games anonymously for ID '{steam_id}'. Please connect your Steam account in Settings.")
        } else {
            format!("Could not find game list in Steam page for ID '{steam_id}'. The page may have changed format. HTML length: {} bytes.", html.len())
        }
    })?;

    println!(
        "[Steam] Found rgGames JSON, length: {} chars",
        json_array.len()
    );

    let games = parse_rg_games_json(&json_array, &steam_id);
    println!("[Steam] Parsed {} games for ID '{steam_id}'", games.len());
    Ok(games)
}

/// Find and extract the JSON array from Steam's embedded `var rgGames = [...];`
fn extract_rg_games_json(html: &str) -> Option<String> {
    // Steam embeds the games as: var rgGames = [{...},...];
    // Try several known variable names Steam has used
    let needles = ["var rgGames = ", "var g_rgGames = ", "rgGames = "];

    for needle in &needles {
        if let Some(start) = html.find(needle) {
            let after = &html[start + needle.len()..];
            // The JSON array starts with '['
            if let Some(bracket_pos) = after.find('[') {
                let json_start = &after[bracket_pos..];
                // Find the matching closing bracket
                let mut depth = 0usize;
                let mut in_string = false;
                let mut escape_next = false;
                for (i, ch) in json_start.char_indices() {
                    if escape_next {
                        escape_next = false;
                        continue;
                    }
                    match ch {
                        '\\' if in_string => escape_next = true,
                        '"' => in_string = !in_string,
                        '[' if !in_string => depth += 1,
                        ']' if !in_string => {
                            depth -= 1;
                            if depth == 0 {
                                return Some(json_start[..=i].to_string());
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
    }
    None
}

fn parse_rg_games_json(json: &str, _steam_id: &str) -> Vec<OwnedGame> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(json) else {
        return Vec::new();
    };

    let Some(items) = value.as_array() else {
        return Vec::new();
    };

    items
        .iter()
        .filter_map(|item| {
            let appid = json_string_or_number(item.get("appid"))?;
            let name = item.get("name").and_then(serde_json::Value::as_str)?.trim();
            if appid.is_empty() || name.is_empty() {
                return None;
            }
            if is_steam_non_game_owned_item(Some(&appid), name) {
                return None;
            }

            let playtime = item
                .get("hours_forever")
                .or_else(|| item.get("hours"))
                .and_then(json_hours_to_minutes);

            let last_played_at = item
                .get("last_played")
                .and_then(json_u64)
                .filter(|timestamp| *timestamp > 1_000_000_000 && *timestamp < 2_000_000_000)
                .map(crate::commands::games::unix_timestamp_to_iso);

            Some(OwnedGame {
                id: format!("steam-owned-{appid}"),
                external_id: Some(appid.clone()),
                title: name.to_string(),
                description: String::new(),
                cover_url: Some(format!(
                    "https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/library_hero.jpg"
                )),
                logo_url: Some(format!(
                    "https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/header.jpg"
                )),
                icon_url: None,
                playtime_minutes: playtime,
                last_played_at,
                cloud_gaming_url: None,
                achievement_summary: None,
            })
        })
        .collect()
}

fn json_string_or_number(value: Option<&serde_json::Value>) -> Option<String> {
    match value? {
        serde_json::Value::String(value) => Some(value.trim().to_string()),
        serde_json::Value::Number(value) => Some(value.to_string()),
        _ => None,
    }
}

fn json_u64(value: &serde_json::Value) -> Option<u64> {
    value
        .as_u64()
        .or_else(|| value.as_str()?.replace(',', "").parse::<u64>().ok())
}

fn json_hours_to_minutes(value: &serde_json::Value) -> Option<u64> {
    let hours = value
        .as_f64()
        .or_else(|| value.as_str()?.replace(',', "").parse::<f64>().ok())?;
    Some((hours.max(0.0) * 60.0).round() as u64)
}

#[tauri::command]
pub async fn fetch_gog_owned_games(access_token: String) -> Result<Vec<OwnedGame>, String> {
    let client = crate::commands::http::shared_http_client();

    // Step 1: Get list of owned product IDs
    let data_resp = client
        .get("https://embed.gog.com/user/data/games")
        .header("Authorization", format!("Bearer {access_token}"))
        .send()
        .await
        .map_err(|e| format!("GOG user data request failed: {e}"))?;

    if !data_resp.status().is_success() {
        return Err(format!(
            "GOG user data returned status {}",
            data_resp.status()
        ));
    }

    let data: serde_json::Value = data_resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse GOG user data: {e}"))?;

    let product_ids: Vec<u64> = data["games"]
        .as_array()
        .unwrap_or(&Vec::new())
        .iter()
        .filter_map(|v| v.as_u64())
        .collect();

    let mut games = Vec::new();

    // Step 2: Fetch details for up to 50 products
    for &id in product_ids.iter().take(50) {
        let detail_url = format!("https://api.gog.com/products/{id}");
        match client.get(&detail_url).send().await {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(detail) = resp.json::<serde_json::Value>().await {
                    let title = detail["title"]
                        .as_str()
                        .unwrap_or(&format!("GOG Game #{id}"))
                        .to_string();

                    let logo2x = detail["images"]["logo2x"].as_str().map(|u| {
                        if u.starts_with("//") {
                            format!("https:{u}")
                        } else {
                            u.to_string()
                        }
                    });
                    let icon = detail["images"]["icon"].as_str().map(|u| {
                        if u.starts_with("//") {
                            format!("https:{u}")
                        } else {
                            u.to_string()
                        }
                    });

                    games.push(OwnedGame {
                        id: format!("gog-owned-{id}"),
                        external_id: Some(id.to_string()),
                        title,
                        description: String::new(),
                        cover_url: logo2x.clone(),
                        logo_url: logo2x,
                        icon_url: icon,
                        playtime_minutes: None,
                        last_played_at: None,
                        cloud_gaming_url: None,
                        achievement_summary: None,
                    });
                }
            }
            _ => {}
        }
    }

    Ok(games)
}

#[tauri::command]
pub async fn fetch_steam_profile_name(steam_id: String) -> Result<Option<String>, String> {
    let steam_id = steam_id.trim();
    if steam_id.is_empty() || !steam_id.chars().all(|character| character.is_ascii_digit()) {
        return Err("SteamID64 ist ungueltig.".to_string());
    }

    let url = format!("https://steamcommunity.com/profiles/{steam_id}?xml=1");
    let response = crate::commands::http::shared_http_client()
        .get(&url)
        .header("User-Agent", "Open Game Launcher Steam profile resolver")
        .send()
        .await
        .map_err(|error| format!("Could not contact Steam profile page: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Steam profile request returned status {}.",
            response.status()
        ));
    }

    let xml = response
        .text()
        .await
        .map_err(|error| format!("Could not read Steam profile response: {error}"))?;

    Ok(extract_xml_tag_text(&xml, "steamID")
        .or_else(|| extract_xml_tag_text(&xml, "customURL"))
        .filter(|value| !value.trim().is_empty()))
}

#[tauri::command]
pub async fn fetch_steam_news(app_id: String) -> Result<serde_json::Value, String> {
    let app_id = app_id.trim();
    if app_id.is_empty() || !app_id.chars().all(|character| character.is_ascii_digit()) {
        return Err("Steam AppID is invalid.".to_string());
    }

    let response = crate::commands::http::shared_http_client()
        .get("https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/")
        .query(&[("appid", app_id), ("count", "20"), ("maxlength", "600")])
        .header("User-Agent", "Open Game Launcher Steam news resolver")
        .send()
        .await
        .map_err(|error| format!("Could not contact Steam news API: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Steam news request returned status {}.",
            response.status()
        ));
    }

    response
        .json::<serde_json::Value>()
        .await
        .map_err(|error| format!("Could not read Steam news response: {error}"))
}

fn extract_xml_tag_text(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let start = xml.find(&open)? + open.len();
    let end = xml[start..].find(&close)? + start;
    Some(decode_xml_text(xml[start..end].trim()).trim().to_string())
}

fn decode_xml_text(value: &str) -> String {
    value
        .replace("<![CDATA[", "")
        .replace("]]>", "")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn callback_server_start_gate_allows_only_one_owner_until_released() {
        let gate = std::sync::atomic::AtomicBool::new(false);

        assert!(claim_callback_server_start(&gate));
        assert!(!claim_callback_server_start(&gate));
        release_callback_server_start(&gate);
        assert!(claim_callback_server_start(&gate));
    }

    #[test]
    fn steam_scraper_url_tracks_the_requested_account() {
        assert_eq!(
            steam_scraper_url(
                " 76561198000000001 ",
                "request-123",
                SteamScrapeSource::Silent,
            )
            .unwrap(),
            "https://steamcommunity.com/profiles/76561198000000001/games/?tab=all&ogl_request_id=request-123&ogl_source=silent"
        );
        assert!(
            steam_scraper_url("not-a-steam-id", "request-123", SteamScrapeSource::Silent,).is_err()
        );
        assert!(steam_scraper_url("76561198000000001", "", SteamScrapeSource::Silent).is_err());
    }

    #[test]
    fn steam_scraper_script_correlates_results_with_the_current_request() {
        let script = steam_scraper_script();

        assert!(script.contains("ogl_request_id"));
        assert!(script.contains("ogl_source"));
        assert!(script.contains("requestId"));
        assert!(script.contains("source"));
        assert!(script.contains("steamId"));
    }

    #[test]
    fn empty_steam_library_is_a_terminal_scrape_result() {
        let payload = serde_json::json!({
            "games": [],
            "requestId": "request-empty",
            "source": "silent",
            "steamId": "76561198000000001",
        });

        assert!(matches!(
            steam_scrape_payload(&payload),
            Some(SteamScrapePayload::Games(games)) if games.is_empty()
        ));
    }

    #[test]
    fn stale_steam_scraper_results_cannot_claim_a_newer_request() {
        let state = Mutex::new(None);
        set_active_steam_scrape_request(
            &state,
            SteamScrapeRequest {
                generation: 2,
                request_id: "request-new".to_string(),
                source: SteamScrapeSource::Silent,
                steam_id: "76561198000000002".to_string(),
            },
        );
        set_active_steam_scrape_request(
            &state,
            SteamScrapeRequest {
                generation: 1,
                request_id: "request-old".to_string(),
                source: SteamScrapeSource::Silent,
                steam_id: "76561198000000001".to_string(),
            },
        );

        assert!(!claim_active_steam_scrape_result(
            &state,
            "request-old",
            "76561198000000001",
            SteamScrapeSource::Silent,
        ));
        assert!(claim_active_steam_scrape_result(
            &state,
            "request-new",
            "76561198000000002",
            SteamScrapeSource::Silent,
        ));
        assert!(!claim_active_steam_scrape_result(
            &state,
            "request-new",
            "76561198000000002",
            SteamScrapeSource::Silent,
        ));
    }

    #[test]
    fn silent_scraper_cannot_supersede_an_active_login_scrape() {
        let state = Mutex::new(Some(SteamScrapeRequest {
            generation: 1,
            request_id: "request-login".to_string(),
            source: SteamScrapeSource::Login,
            steam_id: "76561198000000001".to_string(),
        }));

        assert!(has_active_login_scrape(&state));
    }

    #[test]
    fn steam_openid_callback_requires_provider_verification() {
        let steam_id = "76561198000000001";
        let state = "login-state-123";
        let identity = format!("http://steamcommunity.com/openid/id/{steam_id}");
        let mut callback = reqwest::Url::parse("http://localhost:18234/").unwrap();
        callback
            .query_pairs_mut()
            .append_pair("state", state)
            .append_pair("openid.ns", "http://specs.openid.net/auth/2.0")
            .append_pair("openid.mode", "id_res")
            .append_pair(
                "openid.op_endpoint",
                "https://steamcommunity.com/openid/login",
            )
            .append_pair("openid.claimed_id", &identity)
            .append_pair("openid.identity", &identity)
            .append_pair(
                "openid.return_to",
                &steam_login_callback_url(state).unwrap(),
            )
            .append_pair("openid.response_nonce", "2026-07-09T20:00:00Znonce")
            .append_pair("openid.assoc_handle", "handle")
            .append_pair(
                "openid.signed",
                "op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
            )
            .append_pair("openid.sig", "signature");
        let target = format!("{}?{}", callback.path(), callback.query().unwrap());

        let verified = verify_steam_openid_callback_with(&target, state, |parameters| {
            assert!(parameters
                .iter()
                .any(|(key, value)| key == "openid.mode" && value == "check_authentication"));
            Ok(true)
        })
        .unwrap();
        assert_eq!(verified, steam_id);

        assert!(verify_steam_openid_callback_with(&target, state, |_| Ok(false)).is_err());
        assert!(
            verify_steam_openid_callback_with("/?openid.mode=id_res", state, |_| Ok(true)).is_err()
        );
    }

    #[test]
    fn steam_scraper_window_open_actions_are_serialized() {
        let start = std::sync::Arc::new(std::sync::Barrier::new(3));
        let active = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let overlapped = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let mut handles = Vec::new();

        for _ in 0..2 {
            let start = start.clone();
            let active = active.clone();
            let overlapped = overlapped.clone();
            handles.push(std::thread::spawn(move || {
                start.wait();
                with_steam_window_open_lock(|| {
                    if active.fetch_add(1, std::sync::atomic::Ordering::SeqCst) != 0 {
                        overlapped.store(true, std::sync::atomic::Ordering::SeqCst);
                    }
                    std::thread::sleep(std::time::Duration::from_millis(20));
                    active.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
                    Ok(())
                })
                .unwrap();
            }));
        }

        start.wait();
        for handle in handles {
            handle.join().unwrap();
        }

        assert!(!overlapped.load(std::sync::atomic::Ordering::SeqCst));
    }

    #[test]
    fn parses_steam_rg_games_with_numeric_and_string_fields() {
        let json = r#"[
            {"appid": 4000, "name": "Garry's Mod", "hours_forever": "225.3", "last_played": 1764709295},
            {"appid": "730", "name": "Counter-Strike 2", "hours": 1.5},
            {"appid": "10", "name": "Counter-Strike", "hours": 0},
            {"appid": "20", "name": "Team Fortress Classic"}
        ]"#;

        let games = parse_rg_games_json(json, "76561198000000000");

        assert_eq!(games.len(), 4);
        assert_eq!(games[0].id, "steam-owned-4000");
        assert_eq!(games[0].playtime_minutes, Some(13_518));
        assert!(games[0].last_played_at.is_some());
        assert_eq!(games[1].external_id.as_deref(), Some("730"));
        assert_eq!(games[1].playtime_minutes, Some(90));
        assert_eq!(games[2].playtime_minutes, Some(0));
        assert_eq!(games[3].playtime_minutes, None);
    }

    #[test]
    fn parses_only_vetted_steam_achievement_progress_and_marks_perfect_games() {
        let json = r#"{
            "mapCache": [
                [101, {"appid": 101, "unlocked": 31, "total": 31, "all_unlocked": true, "vetted": true}],
                [202, {"appid": 202, "unlocked": 4, "total": 10, "all_unlocked": false, "vetted": true}],
                [303, {"appid": 303, "unlocked": 5, "total": 5, "all_unlocked": true, "vetted": false}],
                [404, {"appid": 404, "unlocked": 0, "total": 0, "all_unlocked": false, "vetted": true}]
            ]
        }"#;

        let progress = parse_steam_achievement_progress(json);

        assert_eq!(progress.len(), 2);
        let perfect = progress.get("101").expect("missing perfect progress");
        assert_eq!(perfect.unlocked, 31);
        assert_eq!(perfect.total, 31);
        assert!(perfect.is_perfect);
        assert_eq!(perfect.source, "steam");
        assert!(!progress.get("202").unwrap().is_perfect);
        assert!(!progress.contains_key("303"));
        assert!(!progress.contains_key("404"));
    }

    #[test]
    fn filters_non_game_items_from_steam_owned_games() {
        let json = r#"[
            {"appid": 228980, "name": "Steamworks Common Redistributables"},
            {"appid": 1070560, "name": "Steam Linux Runtime 1.0 (scout)"},
            {"appid": 4000, "name": "Garry's Mod"}
        ]"#;

        let games = parse_rg_games_json(json, "76561198000000000");

        assert_eq!(games.len(), 1);
        assert_eq!(games[0].id, "steam-owned-4000");
    }

    #[test]
    fn extracts_steam_profile_name_from_xml_cdata() {
        let xml = r#"
            <profile>
                <steamID><![CDATA[OG &amp; Launcher]]></steamID>
                <customURL>fallback</customURL>
            </profile>
        "#;

        assert_eq!(
            extract_xml_tag_text(xml, "steamID").as_deref(),
            Some("OG & Launcher")
        );
    }

    #[test]
    fn parses_local_steam_owned_activity_from_vdf() {
        let contents = r#"
"UserLocalConfigStore"
{
    "Software"
    {
        "Valve"
        {
            "Steam"
            {
                "apps"
                {
                    "4000"
                    {
                        "Playtime"      "13519"
                        "LastPlayed"    "1764709295"
                    }
                }
            }
        }
    }
}
"#;
        let lines = contents.lines().collect::<Vec<_>>();
        let apps_section =
            find_vdf_section_open_line(&lines, "apps").expect("missing apps section");
        assert_eq!(lines[apps_section].trim(), "{");

        let temp = tempfile_compat_dir();
        let config_dir = temp.join("config");
        fs::create_dir_all(&config_dir).expect("create config dir");
        fs::write(config_dir.join("localconfig.vdf"), contents).expect("write localconfig");

        let activity = read_steam_owned_activity(&config_dir);
        let garrys_mod = activity.get("4000").expect("missing app activity");
        assert_eq!(garrys_mod.playtime_minutes, Some(13_519));
        assert_eq!(garrys_mod.last_played, Some(1_764_709_295));

        let _ = fs::remove_dir_all(temp);
    }

    fn tempfile_compat_dir() -> PathBuf {
        let mut path = env::temp_dir();
        path.push(format!(
            "og-launcher-steam-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock")
                .as_nanos()
        ));
        path
    }
}
