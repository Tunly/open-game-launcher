use chrono::Utc;
use lazy_static::lazy_static;
use serde::Serialize;
use std::{
    collections::{HashMap, VecDeque},
    fmt,
    sync::Mutex,
};

const MAX_PENDING_LINKS: usize = 16;
const MAX_GAME_DOMAIN_LEN: usize = 64;
const MIN_DOWNLOAD_KEY_LEN: usize = 8;
const MAX_DOWNLOAD_KEY_LEN: usize = 512;
const MAX_EXPIRY_AHEAD_SECONDS: i64 = 24 * 60 * 60;

lazy_static! {
    static ref PENDING_NXM_LINKS: Mutex<VecDeque<PendingNxmLink>> = Mutex::new(VecDeque::new());
    static ref PENDING_RENDERER_STATUSES: Mutex<VecDeque<NxmLinkStatus>> =
        Mutex::new(VecDeque::new());
    static ref HANDLER_STATUS: Mutex<NxmHandlerStatus> =
        Mutex::new(NxmHandlerStatus::not_checked());
}

/// A renderer-safe summary of an accepted or rejected NXM link.
///
/// Deliberately absent: the raw URL, download key, expiry and Nexus user id.
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NxmLinkStatus {
    pub accepted: bool,
    pub code: String,
    pub message: String,
    pub game_domain: Option<String>,
    pub mod_id: Option<u64>,
    pub file_id: Option<u64>,
}

impl NxmLinkStatus {
    fn accepted(link: &PendingNxmLink) -> Self {
        Self {
            accepted: true,
            code: "ready".to_string(),
            message: "Nexus download is ready to continue.".to_string(),
            game_domain: Some(link.game_domain.clone()),
            mod_id: Some(link.mod_id),
            file_id: Some(link.file_id),
        }
    }

    fn rejected(error: NxmParseError) -> Self {
        Self {
            accepted: false,
            code: error.code().to_string(),
            message: error.renderer_message().to_string(),
            game_domain: None,
            mod_id: None,
            file_id: None,
        }
    }

    fn continuation_failed(game_domain: &str, mod_id: u64, file_id: u64) -> Self {
        Self {
            accepted: false,
            code: "continuation_failed".to_string(),
            message: "The Nexus download could not be continued. Reconnect Nexus Mods or try Download with Manager again."
                .to_string(),
            game_domain: Some(game_domain.to_string()),
            mod_id: Some(mod_id),
            file_id: Some(file_id),
        }
    }
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NxmHandlerStatus {
    pub registered: bool,
    pub is_default: bool,
    pub state: String,
    pub message: String,
}

impl NxmHandlerStatus {
    fn not_checked() -> Self {
        Self {
            registered: false,
            is_default: false,
            state: "not_checked".to_string(),
            message: "The Nexus link handler has not been checked yet.".to_string(),
        }
    }

    fn registered() -> Self {
        Self {
            registered: true,
            is_default: true,
            state: "registered".to_string(),
            message: "OG-Launcher handles Nexus download links.".to_string(),
        }
    }

    fn conflict() -> Self {
        Self {
            registered: false,
            is_default: false,
            state: "handler_conflict".to_string(),
            message: "Another application handles Nexus download links. Change the default app for nxm links in system settings to continue.".to_string(),
        }
    }

    fn unavailable() -> Self {
        Self {
            registered: false,
            is_default: false,
            state: "unavailable".to_string(),
            message: "The Nexus link handler could not be registered. Change the default app for nxm links in system settings to continue.".to_string(),
        }
    }

    #[cfg(not(target_os = "windows"))]
    fn managed_by_os() -> Self {
        Self {
            registered: false,
            is_default: false,
            state: "os_managed".to_string(),
            message: "The operating system manages the nxm default application. Select OG-Launcher there to continue Nexus downloads.".to_string(),
        }
    }
}

struct SecretValue(String);

impl SecretValue {
    fn expose(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for SecretValue {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("[REDACTED]")
    }
}

struct PendingNxmLink {
    game_domain: String,
    mod_id: u64,
    file_id: u64,
    user_id: u64,
    key: SecretValue,
    expires_at: i64,
}

/// A claimed NXM authorization is intentionally Rust-only and cannot be
/// serialized or returned from a Tauri command. Its Debug output is redacted.
pub(crate) struct NxmDownloadAuthorization {
    game_domain: String,
    mod_id: u64,
    file_id: u64,
    user_id: u64,
    key: SecretValue,
    expires_at: i64,
}

impl NxmDownloadAuthorization {
    #[allow(dead_code)]
    pub(crate) fn game_domain(&self) -> &str {
        &self.game_domain
    }

    #[allow(dead_code)]
    pub(crate) fn mod_id(&self) -> u64 {
        self.mod_id
    }

    #[allow(dead_code)]
    pub(crate) fn file_id(&self) -> u64 {
        self.file_id
    }

    #[allow(dead_code)]
    pub(crate) fn user_id(&self) -> u64 {
        self.user_id
    }

    #[allow(dead_code)]
    pub(crate) fn download_key(&self) -> &str {
        self.key.expose()
    }

    #[allow(dead_code)]
    pub(crate) fn expires_at(&self) -> i64 {
        self.expires_at
    }
}

impl fmt::Debug for NxmDownloadAuthorization {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("NxmDownloadAuthorization")
            .field("game_domain", &self.game_domain)
            .field("mod_id", &self.mod_id)
            .field("file_id", &self.file_id)
            .field("user_id", &"[REDACTED]")
            .field("key", &"[REDACTED]")
            .field("expires_at", &"[REDACTED]")
            .finish()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum NxmParseError {
    InvalidScheme,
    InvalidShape,
    InvalidDomain,
    InvalidIdentifier,
    InvalidQuery,
    MissingAuthorization,
    Expired,
}

impl NxmParseError {
    fn code(self) -> &'static str {
        match self {
            Self::Expired => "expired",
            Self::InvalidScheme
            | Self::InvalidShape
            | Self::InvalidDomain
            | Self::InvalidIdentifier
            | Self::InvalidQuery
            | Self::MissingAuthorization => "invalid_link",
        }
    }

    fn renderer_message(self) -> &'static str {
        match self {
            Self::Expired => {
                "The Nexus download link has expired. Start the download again on Nexus Mods."
            }
            _ => "The Nexus download link is invalid and was ignored.",
        }
    }
}

impl fmt::Display for NxmParseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.renderer_message())
    }
}

/// Parses and stores an NXM link without exposing its authorization data.
/// The returned value is safe to emit to the renderer.
pub fn capture_nxm_link(raw: &str) -> NxmLinkStatus {
    capture_nxm_link_at(raw, Utc::now().timestamp())
}

fn capture_nxm_link_at(raw: &str, now: i64) -> NxmLinkStatus {
    let status = match parse_nxm_link(raw, now) {
        Ok(link) => {
            let status = NxmLinkStatus::accepted(&link);
            let mut pending = PENDING_NXM_LINKS
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            remove_expired_links(&mut pending, now);
            if pending.len() == MAX_PENDING_LINKS {
                pending.pop_front();
            }
            pending.push_back(link);
            status
        }
        Err(error) => NxmLinkStatus::rejected(error),
    };

    remember_renderer_status(status.clone());
    status
}

pub(crate) fn record_nxm_continuation_failure(
    game_domain: &str,
    mod_id: u64,
    file_id: u64,
) -> NxmLinkStatus {
    let status = NxmLinkStatus::continuation_failed(game_domain, mod_id, file_id);
    remember_renderer_status(status.clone());
    status
}

fn remember_renderer_status(status: NxmLinkStatus) {
    let mut statuses = PENDING_RENDERER_STATUSES
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    if statuses.len() == MAX_PENDING_LINKS {
        statuses.pop_front();
    }
    statuses.push_back(status);
}

/// Atomically claims one matching, unexpired authorization. A non-matching
/// request cannot consume any other pending Nexus link.
#[allow(dead_code)]
pub(crate) fn claim_pending_nxm(
    expected_game_domain: &str,
    expected_mod_id: u64,
    expected_file_id: u64,
) -> Option<NxmDownloadAuthorization> {
    claim_pending_nxm_at(
        expected_game_domain,
        expected_mod_id,
        expected_file_id,
        Utc::now().timestamp(),
    )
}

fn claim_pending_nxm_at(
    expected_game_domain: &str,
    expected_mod_id: u64,
    expected_file_id: u64,
    now: i64,
) -> Option<NxmDownloadAuthorization> {
    let normalized_domain = expected_game_domain.to_ascii_lowercase();
    if !is_valid_game_domain(&normalized_domain) || expected_mod_id == 0 || expected_file_id == 0 {
        return None;
    }

    let mut pending = PENDING_NXM_LINKS
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    remove_expired_links(&mut pending, now);
    let index = pending.iter().position(|link| {
        link.game_domain == normalized_domain
            && link.mod_id == expected_mod_id
            && link.file_id == expected_file_id
    })?;
    let link = pending.remove(index)?;

    Some(NxmDownloadAuthorization {
        game_domain: link.game_domain,
        mod_id: link.mod_id,
        file_id: link.file_id,
        user_id: link.user_id,
        key: link.key,
        expires_at: link.expires_at,
    })
}

fn remove_expired_links(pending: &mut VecDeque<PendingNxmLink>, now: i64) {
    pending.retain(|link| link.expires_at > now);
}

#[tauri::command]
pub fn take_pending_nxm_status() -> Option<NxmLinkStatus> {
    PENDING_RENDERER_STATUSES
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .pop_front()
}

#[tauri::command]
pub fn get_nxm_handler_status() -> NxmHandlerStatus {
    HANDLER_STATUS
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .clone()
}

#[tauri::command]
pub fn open_nxm_handler_settings() -> Result<(), String> {
    open_nxm_handler_settings_impl()
}

#[cfg(target_os = "windows")]
fn open_nxm_handler_settings_impl() -> Result<(), String> {
    std::process::Command::new("explorer.exe")
        .arg("ms-settings:defaultapps")
        .spawn()
        .map(|_| ())
        .map_err(|_| "Could not open Windows default-app settings.".to_string())
}

#[cfg(target_os = "macos")]
fn open_nxm_handler_settings_impl() -> Result<(), String> {
    std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.general")
        .spawn()
        .map(|_| ())
        .map_err(|_| "Could not open macOS default-app settings.".to_string())
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn open_nxm_handler_settings_impl() -> Result<(), String> {
    Err(
        "Open your desktop environment's default-application settings and select OG-Launcher for nxm links."
            .to_string(),
    )
}

pub fn check_nxm_link_on_startup() -> Option<NxmLinkStatus> {
    std::env::args()
        .skip(1)
        .find(|argument| has_nxm_scheme(argument))
        .map(|argument| capture_nxm_link(&argument))
}

pub(crate) fn has_nxm_scheme(raw: &str) -> bool {
    raw.get(..4)
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case("nxm:"))
}

pub fn register_nxm_protocol_handler() -> NxmHandlerStatus {
    let status = register_nxm_protocol_handler_impl();
    *HANDLER_STATUS
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner) = status.clone();
    status
}

#[cfg(target_os = "windows")]
fn register_nxm_protocol_handler_impl() -> NxmHandlerStatus {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let Ok(executable) = std::env::current_exe() else {
        return NxmHandlerStatus::unavailable();
    };
    let executable = executable.to_string_lossy().to_string();
    if executable.is_empty() {
        return NxmHandlerStatus::unavailable();
    }

    if let Some(existing_command) = effective_nxm_command() {
        if !command_invokes_executable(&existing_command, &executable) {
            return NxmHandlerStatus::conflict();
        }
    }

    let current_user = RegKey::predef(HKEY_CURRENT_USER);
    let registration_result = (|| -> Result<(), std::io::Error> {
        let (class, _) = current_user.create_subkey(r"Software\Classes\nxm")?;
        class.set_value("", &"URL: Nexus Mods Download Protocol")?;
        class.set_value("URL Protocol", &"")?;
        let (icon, _) = current_user.create_subkey(r"Software\Classes\nxm\DefaultIcon")?;
        icon.set_value("", &format!("\"{executable}\",0"))?;
        let (command, _) =
            current_user.create_subkey(r"Software\Classes\nxm\shell\open\command")?;
        command.set_value("", &format!("\"{executable}\" \"%1\""))?;
        Ok(())
    })();

    if registration_result.is_err() {
        return NxmHandlerStatus::unavailable();
    }

    match effective_nxm_command() {
        Some(command) if command_invokes_executable(&command, &executable) => {
            NxmHandlerStatus::registered()
        }
        Some(_) => NxmHandlerStatus::conflict(),
        None => NxmHandlerStatus::unavailable(),
    }
}

#[cfg(target_os = "windows")]
fn effective_nxm_command() -> Option<String> {
    use winreg::enums::{HKEY_CLASSES_ROOT, HKEY_CURRENT_USER};
    use winreg::RegKey;

    let current_user = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(user_choice) = current_user.open_subkey(
        r"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\nxm\UserChoice",
    ) {
        if let Ok(prog_id) = user_choice.get_value::<String, _>("ProgId") {
            let prog_id = prog_id.trim();
            if !prog_id.is_empty()
                && prog_id.len() <= 128
                && prog_id.chars().all(|character| {
                    character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_')
                })
            {
                let classes_root = RegKey::predef(HKEY_CLASSES_ROOT);
                return classes_root
                    .open_subkey(format!(r"{prog_id}\shell\open\command"))
                    .ok()?
                    .get_value::<String, _>("")
                    .ok();
            }
        }
    }

    RegKey::predef(HKEY_CLASSES_ROOT)
        .open_subkey(r"nxm\shell\open\command")
        .ok()?
        .get_value::<String, _>("")
        .ok()
}

#[cfg(target_os = "windows")]
fn command_invokes_executable(command: &str, executable: &str) -> bool {
    let trimmed = command.trim_start();
    let parsed = if let Some(quoted) = trimmed.strip_prefix('"') {
        quoted.split_once('"')
    } else {
        trimmed.split_once(char::is_whitespace).map_or_else(
            || Some((trimmed, "")),
            |(path, arguments)| Some((path, arguments)),
        )
    };

    parsed.is_some_and(|(path, arguments)| {
        normalize_windows_path(path) == normalize_windows_path(executable)
            && arguments.split_ascii_whitespace().any(|argument| {
                let argument = argument.trim_matches(['"', '\'']);
                argument.eq_ignore_ascii_case("%1")
                    || argument.rsplit_once('=').is_some_and(|(_, value)| {
                        value.trim_matches(['"', '\'']).eq_ignore_ascii_case("%1")
                    })
            })
    })
}

#[cfg(target_os = "windows")]
fn normalize_windows_path(path: &str) -> String {
    path.trim().replace('/', "\\").to_ascii_lowercase()
}

#[cfg(not(target_os = "windows"))]
fn register_nxm_protocol_handler_impl() -> NxmHandlerStatus {
    // Only the optional registered Nexus bundle config declares nxm on
    // macOS/Linux. Runtime default-app ownership is OS-managed there.
    NxmHandlerStatus::managed_by_os()
}

fn parse_nxm_link(raw: &str, now: i64) -> Result<PendingNxmLink, NxmParseError> {
    let prefix = raw.get(..6).ok_or(NxmParseError::InvalidScheme)?;
    if !prefix.eq_ignore_ascii_case("nxm://") {
        return Err(NxmParseError::InvalidScheme);
    }
    let remainder = raw.get(6..).ok_or(NxmParseError::InvalidScheme)?;
    if remainder.is_empty()
        || remainder.contains('#')
        || remainder.matches('?').count() != 1
        || remainder.chars().any(char::is_whitespace)
    {
        return Err(NxmParseError::InvalidShape);
    }

    let (path, query) = remainder
        .split_once('?')
        .ok_or(NxmParseError::InvalidShape)?;
    let segments = path.split('/').collect::<Vec<_>>();
    if segments.len() != 5 || segments[1] != "mods" || segments[3] != "files" {
        return Err(NxmParseError::InvalidShape);
    }

    let game_domain = segments[0].to_ascii_lowercase();
    if !is_valid_game_domain(&game_domain) {
        return Err(NxmParseError::InvalidDomain);
    }
    let mod_id = parse_positive_id(segments[2])?;
    let file_id = parse_positive_id(segments[4])?;
    let parameters = parse_query(query)?;
    if parameters.len() != 3 {
        return Err(NxmParseError::InvalidQuery);
    }

    let key = parameters
        .get("key")
        .ok_or(NxmParseError::MissingAuthorization)?;
    if key.len() < MIN_DOWNLOAD_KEY_LEN
        || key.len() > MAX_DOWNLOAD_KEY_LEN
        || !key
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err(NxmParseError::InvalidQuery);
    }
    let expires_at = parse_timestamp(
        parameters
            .get("expires")
            .ok_or(NxmParseError::MissingAuthorization)?,
    )?;
    if expires_at <= now {
        return Err(NxmParseError::Expired);
    }
    if expires_at.saturating_sub(now) > MAX_EXPIRY_AHEAD_SECONDS {
        return Err(NxmParseError::InvalidQuery);
    }
    let user_id = parse_positive_id(
        parameters
            .get("user_id")
            .ok_or(NxmParseError::MissingAuthorization)?,
    )?;

    Ok(PendingNxmLink {
        game_domain,
        mod_id,
        file_id,
        user_id,
        key: SecretValue(key.clone()),
        expires_at,
    })
}

fn is_valid_game_domain(domain: &str) -> bool {
    !domain.is_empty()
        && domain.len() <= MAX_GAME_DOMAIN_LEN
        && domain
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        && domain
            .as_bytes()
            .first()
            .is_some_and(u8::is_ascii_alphanumeric)
        && domain
            .as_bytes()
            .last()
            .is_some_and(u8::is_ascii_alphanumeric)
}

fn parse_positive_id(value: &str) -> Result<u64, NxmParseError> {
    if value.is_empty() || value.len() > 20 || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(NxmParseError::InvalidIdentifier);
    }
    let parsed = value
        .parse::<u64>()
        .map_err(|_| NxmParseError::InvalidIdentifier)?;
    if parsed == 0 {
        return Err(NxmParseError::InvalidIdentifier);
    }
    Ok(parsed)
}

fn parse_timestamp(value: &str) -> Result<i64, NxmParseError> {
    if value.is_empty() || value.len() > 19 || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(NxmParseError::InvalidQuery);
    }
    value
        .parse::<i64>()
        .map_err(|_| NxmParseError::InvalidQuery)
}

fn parse_query(query: &str) -> Result<HashMap<String, String>, NxmParseError> {
    if query.is_empty() {
        return Err(NxmParseError::MissingAuthorization);
    }

    let mut values = HashMap::new();
    for pair in query.split('&') {
        let (key, value) = pair.split_once('=').ok_or(NxmParseError::InvalidQuery)?;
        if key.is_empty()
            || value.is_empty()
            || !matches!(key, "key" | "expires" | "user_id")
            || values.contains_key(key)
        {
            return Err(NxmParseError::InvalidQuery);
        }
        values.insert(key.to_string(), percent_decode(value)?);
    }
    Ok(values)
}

fn percent_decode(value: &str) -> Result<String, NxmParseError> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len() {
                return Err(NxmParseError::InvalidQuery);
            }
            let high = hex_value(bytes[index + 1]).ok_or(NxmParseError::InvalidQuery)?;
            let low = hex_value(bytes[index + 2]).ok_or(NxmParseError::InvalidQuery)?;
            decoded.push((high << 4) | low);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }

    String::from_utf8(decoded).map_err(|_| NxmParseError::InvalidQuery)
}

fn hex_value(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_800_000_000;
    const SECRET: &str = "NeverExposeThisDownloadKey_123";
    static TEST_LOCK: Mutex<()> = Mutex::new(());

    fn valid_link() -> String {
        format!(
            "nxm://skyrimspecialedition/mods/123/files/456?key={SECRET}&expires={}&user_id=789",
            NOW + 300
        )
    }

    fn clear_pending() {
        PENDING_NXM_LINKS
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clear();
        PENDING_RENDERER_STATUSES
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clear();
    }

    #[test]
    fn parses_canonical_nxm_link_and_claims_it_once() {
        let _guard = TEST_LOCK
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        clear_pending();
        let status = capture_nxm_link_at(&valid_link(), NOW);
        assert!(status.accepted);
        assert_eq!(status.game_domain.as_deref(), Some("skyrimspecialedition"));
        assert_eq!(status.mod_id, Some(123));
        assert_eq!(status.file_id, Some(456));

        let authorization = claim_pending_nxm_at("skyrimspecialedition", 123, 456, NOW)
            .expect("matching authorization");
        assert_eq!(authorization.download_key(), SECRET);
        assert_eq!(authorization.user_id(), 789);
        assert!(claim_pending_nxm_at("skyrimspecialedition", 123, 456, NOW).is_none());
    }

    #[test]
    fn accepts_uri_scheme_case_insensitively() {
        let _guard = TEST_LOCK
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        clear_pending();
        let upper = valid_link().replacen("nxm://", "NXM://", 1);

        assert!(has_nxm_scheme(&upper));
        assert!(capture_nxm_link_at(&upper, NOW).accepted);
        assert!(claim_pending_nxm_at("skyrimspecialedition", 123, 456, NOW).is_some());
    }

    #[test]
    fn rejects_expired_links_without_storing_them() {
        let _guard = TEST_LOCK
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        clear_pending();
        let expired = format!("nxm://skyrim/mods/1/files/2?key={SECRET}&expires={NOW}&user_id=3");
        let status = capture_nxm_link_at(&expired, NOW);
        assert!(!status.accepted);
        assert_eq!(status.code, "expired");
        assert!(claim_pending_nxm_at("skyrim", 1, 2, NOW).is_none());
    }

    #[test]
    fn rejects_implausibly_long_authorization_lifetime() {
        let link = format!(
            "nxm://skyrim/mods/1/files/2?key={SECRET}&expires={}&user_id=3",
            NOW + MAX_EXPIRY_AHEAD_SECONDS + 1
        );
        assert_eq!(
            parse_nxm_link(&link, NOW).err(),
            Some(NxmParseError::InvalidQuery)
        );
    }

    #[test]
    fn rejects_wrong_scheme_domain_shape_and_identifiers() {
        for invalid in [
            format!(
                "https://skyrim/mods/1/files/2?key={SECRET}&expires={}&user_id=3",
                NOW + 300
            ),
            format!(
                "nxm://skyrim.example/mods/1/files/2?key={SECRET}&expires={}&user_id=3",
                NOW + 300
            ),
            format!(
                "nxm://-skyrim/mods/1/files/2?key={SECRET}&expires={}&user_id=3",
                NOW + 300
            ),
            format!(
                "nxm://skyrim/mods/0/files/2?key={SECRET}&expires={}&user_id=3",
                NOW + 300
            ),
            format!(
                "nxm://skyrim/mods/1/files/not-a-number?key={SECRET}&expires={}&user_id=3",
                NOW + 300
            ),
            format!(
                "nxm://skyrim/mods/1/files/2/extra?key={SECRET}&expires={}&user_id=3",
                NOW + 300
            ),
        ] {
            let error = parse_nxm_link(&invalid, NOW).err();
            assert!(error.is_some());
        }
    }

    #[test]
    fn rejects_missing_duplicate_or_unknown_authorization_fields() {
        for invalid in [
            format!(
                "nxm://skyrim/mods/1/files/2?expires={}&user_id=3",
                NOW + 300
            ),
            format!(
                "nxm://skyrim/mods/1/files/2?key={SECRET}&key=again&expires={}&user_id=3",
                NOW + 300
            ),
            format!(
                "nxm://skyrim/mods/1/files/2?key={SECRET}&expires={}&user_id=3&redirect=https%3A%2F%2Fevil.example",
                NOW + 300
            ),
        ] {
            assert!(parse_nxm_link(&invalid, NOW).is_err());
        }
    }

    #[test]
    fn non_matching_claim_does_not_consume_pending_authorization() {
        let _guard = TEST_LOCK
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        clear_pending();
        assert!(capture_nxm_link_at(&valid_link(), NOW).accepted);
        assert!(claim_pending_nxm_at("skyrim", 123, 456, NOW).is_none());
        assert!(claim_pending_nxm_at("skyrimspecialedition", 123, 999, NOW).is_none());
        assert!(claim_pending_nxm_at("skyrimspecialedition", 123, 456, NOW).is_some());
    }

    #[test]
    fn renderer_status_and_debug_output_redact_all_authorization_values() {
        let _guard = TEST_LOCK
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        clear_pending();
        let raw = valid_link();
        let status = capture_nxm_link_at(&raw, NOW);
        let serialized = serde_json::to_string(&status).expect("serialize status");
        assert!(!serialized.contains(SECRET));
        assert!(!serialized.contains("expires"));
        assert!(!serialized.contains("user_id"));
        assert!(!serialized.contains(&raw));

        let authorization =
            claim_pending_nxm_at("skyrimspecialedition", 123, 456, NOW).expect("authorization");
        let debug = format!("{authorization:?}");
        assert!(!debug.contains(SECRET));
        assert!(!debug.contains(&(NOW + 300).to_string()));
        assert!(!debug.contains("789"));
        assert!(debug.contains("[REDACTED]"));
    }

    #[test]
    fn continuation_failure_is_redacted_and_persisted_for_the_renderer() {
        let _guard = TEST_LOCK
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        clear_pending();

        let status = record_nxm_continuation_failure("skyrim", 123, 456);
        assert!(!status.accepted);
        assert_eq!(status.code, "continuation_failed");
        assert_eq!(status.game_domain.as_deref(), Some("skyrim"));
        assert_eq!(take_pending_nxm_status(), Some(status.clone()));

        let serialized = serde_json::to_string(&status).expect("serialize status");
        assert!(!serialized.contains(SECRET));
        assert!(!serialized.contains("expires"));
        assert!(!serialized.contains("user_id"));
    }

    #[test]
    fn parse_errors_never_echo_the_input() {
        let raw = format!("nxm://skyrim/mods/1/files/2?key={SECRET}&expires=1&user_id=3");
        let error = parse_nxm_link(&raw, NOW).err().expect("expired link");
        let message = error.to_string();
        assert!(!message.contains(SECRET));
        assert!(!message.contains(&raw));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn handler_command_matching_is_exact_and_case_insensitive() {
        let executable = r"C:\Program Files\OG Launcher\og-launcher.exe";
        assert!(command_invokes_executable(
            r#""C:\Program Files\OG Launcher\og-launcher.exe" "%1""#,
            executable
        ));
        assert!(command_invokes_executable(
            r#""c:\program files\og launcher\OG-LAUNCHER.EXE" --deep-link "%1""#,
            executable
        ));
        assert!(!command_invokes_executable(
            r#""C:\Program Files\Vortex\Vortex.exe" "%1""#,
            executable
        ));
        assert!(!command_invokes_executable(
            r#""C:\Program Files\OG Launcher\og-launcher.exe" --deep-link"#,
            executable
        ));
    }
}
