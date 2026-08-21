use super::secure_store;
use crate::commands::system::OwnedGame;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::{rngs::SysRng, TryRng};
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT_LANGUAGE, AUTHORIZATION};
use serde::{Deserialize, Deserializer, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::io::{self, Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::process::Command;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex, OnceLock,
};
use std::thread;
use std::time::{Duration, Instant};

const XBOX_CLIENT_ID: &str = "38cd2fa8-66fd-4760-afb2-405eb65d5b0c";
const XBOX_SCOPE: &str = "Xboxlive.signin Xboxlive.offline_access";
const XBOX_REDIRECT_URI: &str = "https://login.live.com/oauth20_desktop.srf";
const XBOX_AUTHORIZATION_ENDPOINT: &str = "https://login.live.com/oauth20_authorize.srf";
const XBOX_TOKEN_ENDPOINT: &str = "https://login.live.com/oauth20_token.srf";
const XBOX_LOOPBACK_CALLBACK_PATH: &str = "/oauth/xbox/callback";
const XBOX_CALLBACK_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const XBOX_CALLBACK_POLL_INTERVAL: Duration = Duration::from_millis(25);
const XBOX_CALLBACK_READ_TIMEOUT: Duration = Duration::from_secs(5);
const XBOX_CALLBACK_REQUEST_LIMIT: usize = 8 * 1024;
const XBOX_PKCE_EXCHANGE_TTL: Duration = Duration::from_secs(10 * 60);
const GAME_PASS_SIGL_ENDPOINT: &str = "https://catalog.gamepass.com/sigls/v2";
const GAME_PASS_PC_SIGL_ID: &str = "fdd9e2a7-0fee-49f6-ad69-4354098401ff";
const DISPLAY_CATALOG_ENDPOINT: &str = "https://displaycatalog.mp.microsoft.com/v7.0/products";
const DISPLAY_CATALOG_BATCH_SIZE: usize = 50;
const MICROSOFT_STORE_PRODUCT_ID_LENGTH: usize = 12;
const DEFAULT_GAME_PASS_LANGUAGE: &str = "en-US";
const DEFAULT_GAME_PASS_MARKET: &str = "US";

fn save_xbox_token(refresh_token: &str) -> Result<(), String> {
    secure_store::set_secret_keychain_only("xbox", refresh_token)
}

fn load_xbox_token() -> Option<String> {
    secure_store::get_secret_keychain_only("xbox")
        .ok()
        .flatten()
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: String,
}

#[derive(Serialize)]
struct AuthProperties {
    #[serde(rename = "AuthMethod")]
    auth_method: String,
    #[serde(rename = "SiteName")]
    site_name: String,
    #[serde(rename = "RpsTicket")]
    rps_ticket: String,
}

#[derive(Serialize)]
struct AuthRequest {
    #[serde(rename = "Properties")]
    properties: AuthProperties,
    #[serde(rename = "RelyingParty")]
    relying_party: String,
    #[serde(rename = "TokenType")]
    token_type: String,
}

#[derive(Deserialize)]
struct AuthResponse {
    #[serde(rename = "Token")]
    token: String,
    #[serde(rename = "DisplayClaims")]
    display_claims: DisplayClaims,
}

#[derive(Deserialize, Debug)]
struct DisplayClaims {
    xui: Vec<Xui>,
}

#[derive(Serialize)]
pub struct XboxFetchResult {
    pub games: Vec<OwnedGame>,
    pub gamertag: Option<String>,
}

#[derive(Deserialize, Debug)]
struct Xui {
    uhs: String,
    xid: Option<String>,
    gtg: Option<String>,
}

#[derive(Serialize)]
struct XstsProperties {
    #[serde(rename = "SandboxId")]
    sandbox_id: String,
    #[serde(rename = "UserTokens")]
    user_tokens: Vec<String>,
}

#[derive(Serialize)]
struct XstsRequest {
    #[serde(rename = "Properties")]
    properties: XstsProperties,
    #[serde(rename = "RelyingParty")]
    relying_party: String,
    #[serde(rename = "TokenType")]
    token_type: String,
}

#[derive(Deserialize, Debug)]
struct TitleHistoryResponse {
    titles: Vec<Title>,
}

#[derive(Deserialize, Debug)]
struct Title {
    #[serde(rename = "titleId")]
    title_id: String,
    pfn: Option<String>,
    name: Option<String>,
    #[serde(rename = "type")]
    item_type: Option<String>,
    devices: Option<Vec<String>>,
    #[serde(rename = "titleHistory")]
    title_history: Option<TitleHistoryDetail>,
    #[serde(
        rename = "displayImage",
        default,
        deserialize_with = "deserialize_optional_string"
    )]
    display_image: Option<String>,
    stats: Option<serde_json::Value>,
}

#[derive(Deserialize, Debug)]
struct TitleHistoryDetail {
    #[serde(rename = "lastTimePlayed")]
    last_time_played: Option<String>,
}

#[derive(Deserialize, Debug)]
struct GamePassCatalogItem {
    #[serde(default)]
    id: Option<serde_json::Value>,
}

#[derive(Deserialize, Debug)]
struct DisplayCatalogResponse {
    #[serde(rename = "Products", alias = "products", default)]
    products: Vec<DisplayCatalogProduct>,
}

#[derive(Deserialize, Debug)]
struct DisplayCatalogProduct {
    #[serde(
        rename = "ProductId",
        alias = "productId",
        default,
        deserialize_with = "deserialize_optional_string"
    )]
    product_id: Option<String>,
    #[serde(rename = "LocalizedProperties", alias = "localizedProperties", default)]
    localized_properties: Vec<DisplayCatalogLocalizedProperties>,
    #[serde(
        rename = "DisplaySkuAvailabilities",
        alias = "displaySkuAvailabilities",
        default
    )]
    display_sku_availabilities: Vec<DisplayCatalogSkuAvailability>,
}

#[derive(Deserialize, Debug)]
struct DisplayCatalogSkuAvailability {
    #[serde(rename = "Sku", alias = "sku", default)]
    sku: Option<DisplayCatalogSku>,
}

#[derive(Deserialize, Debug)]
struct DisplayCatalogSku {
    #[serde(rename = "Properties", alias = "properties", default)]
    properties: Option<DisplayCatalogSkuProperties>,
}

#[derive(Deserialize, Debug)]
struct DisplayCatalogSkuProperties {
    #[serde(rename = "Packages", alias = "packages", default)]
    packages: Vec<DisplayCatalogPackage>,
}

#[derive(Deserialize, Debug)]
struct DisplayCatalogPackage {
    #[serde(
        rename = "PackageFormat",
        alias = "packageFormat",
        default,
        deserialize_with = "deserialize_optional_string"
    )]
    package_format: Option<String>,
}

#[derive(Deserialize, Debug)]
struct DisplayCatalogLocalizedProperties {
    #[serde(
        rename = "ProductTitle",
        alias = "productTitle",
        default,
        deserialize_with = "deserialize_optional_string"
    )]
    product_title: Option<String>,
    #[serde(rename = "Images", alias = "images", default)]
    images: Vec<DisplayCatalogImage>,
}

#[derive(Deserialize, Debug)]
struct DisplayCatalogImage {
    #[serde(
        rename = "ImagePurpose",
        alias = "imagePurpose",
        default,
        deserialize_with = "deserialize_optional_string"
    )]
    image_purpose: Option<String>,
    #[serde(
        rename = "Uri",
        alias = "uri",
        default,
        deserialize_with = "deserialize_optional_string"
    )]
    uri: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DisplayCatalogPackageEvidence {
    ExplicitWindows,
    ExplicitConsoleOnly,
    Unknown,
}

#[derive(Debug)]
struct DisplayCatalogCandidate {
    game: OwnedGame,
    normalized_title: String,
    package_evidence: DisplayCatalogPackageEvidence,
}

#[derive(Debug)]
struct DisplayCatalogSelection {
    games: Vec<OwnedGame>,
    excluded_console_only: usize,
    excluded_unknown_duplicates: usize,
}

struct PendingPkceExchange {
    verifier: String,
    created_at: Instant,
}

#[derive(Debug, PartialEq, Eq)]
enum OAuthCallbackError {
    MalformedRequest,
    UnsupportedMethod,
    UnexpectedPath,
    DuplicateCode,
    DuplicateState,
    MissingCode,
    MissingState,
    StateMismatch,
}

fn deserialize_optional_string<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Option::<serde_json::Value>::deserialize(deserializer)?;
    Ok(value.and_then(|value| value.as_str().map(str::to_string)))
}

fn generate_oauth_secret() -> Result<String, String> {
    let mut bytes = [0_u8; 32];
    SysRng
        .try_fill_bytes(&mut bytes)
        .map_err(|_| "Failed to obtain secure randomness for Xbox login".to_string())?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

fn pkce_s256_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

fn build_xbox_authorization_url(state: &str, code_challenge: &str) -> Result<String, String> {
    let mut url = reqwest::Url::parse(XBOX_AUTHORIZATION_ENDPOINT)
        .map_err(|e| format!("Failed to parse Xbox authorization endpoint: {e}"))?;
    url.query_pairs_mut()
        .append_pair("client_id", XBOX_CLIENT_ID)
        .append_pair("response_type", "code")
        .append_pair("approval_prompt", "auto")
        .append_pair("scope", XBOX_SCOPE)
        .append_pair("redirect_uri", XBOX_REDIRECT_URI)
        .append_pair("state", state)
        .append_pair("code_challenge", code_challenge)
        .append_pair("code_challenge_method", "S256");
    Ok(url.into())
}

fn build_loopback_callback_url(address: SocketAddr) -> Result<String, String> {
    if address.ip() != Ipv4Addr::LOCALHOST {
        return Err("Xbox callback listener did not bind to IPv4 loopback".to_string());
    }

    let mut url = reqwest::Url::parse(&format!("http://{address}"))
        .map_err(|e| format!("Failed to construct Xbox callback URL: {e}"))?;
    url.set_path(XBOX_LOOPBACK_CALLBACK_PATH);
    Ok(url.into())
}

fn build_xbox_callback_script(callback_url: &str) -> Result<String, String> {
    let callback_url = serde_json::to_string(callback_url)
        .map_err(|e| format!("Failed to prepare Xbox callback URL: {e}"))?;
    let redirect_uri = serde_json::to_string(XBOX_REDIRECT_URI)
        .map_err(|e| format!("Failed to prepare Xbox redirect URI: {e}"))?;

    Ok(r##"
        window.addEventListener("DOMContentLoaded", () => {
            const redirectUri = new URL(__XBOX_REDIRECT_URI__);
            if (
                window.location.origin !== redirectUri.origin ||
                window.location.pathname !== redirectUri.pathname
            ) {
                return;
            }

            let params = new URLSearchParams(window.location.search);
            if (!params.has("code") && window.location.hash.startsWith("#")) {
                params = new URLSearchParams(window.location.hash.substring(1));
            }

            const code = params.get("code");
            const state = params.get("state");
            if (!code || !state) {
                return;
            }

            const callbackUrl = new URL(__XBOX_CALLBACK_URL__);
            callbackUrl.searchParams.set("code", code);
            callbackUrl.searchParams.set("state", state);
            fetch(callbackUrl.toString()).catch(() => {});
        });
    "##
    .replace("__XBOX_REDIRECT_URI__", &redirect_uri)
    .replace("__XBOX_CALLBACK_URL__", &callback_url))
}

fn bind_xbox_callback_listener() -> Result<(TcpListener, SocketAddr), String> {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
        .map_err(|e| format!("Failed to start Xbox login callback listener: {e}"))?;
    let address = listener
        .local_addr()
        .map_err(|e| format!("Failed to inspect Xbox login callback listener: {e}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("Failed to configure Xbox login callback listener: {e}"))?;
    Ok((listener, address))
}

fn parse_oauth_callback_request(
    request: &str,
    expected_state: &str,
) -> Result<String, OAuthCallbackError> {
    let request_line = request
        .lines()
        .next()
        .ok_or(OAuthCallbackError::MalformedRequest)?;
    let mut request_parts = request_line.split_ascii_whitespace();
    let method = request_parts
        .next()
        .ok_or(OAuthCallbackError::MalformedRequest)?;
    let target = request_parts
        .next()
        .ok_or(OAuthCallbackError::MalformedRequest)?;
    let version = request_parts
        .next()
        .ok_or(OAuthCallbackError::MalformedRequest)?;
    if request_parts.next().is_some() || !matches!(version, "HTTP/1.0" | "HTTP/1.1") {
        return Err(OAuthCallbackError::MalformedRequest);
    }
    if method != "GET" {
        return Err(OAuthCallbackError::UnsupportedMethod);
    }

    let raw_path = target.split_once('?').map_or(target, |(path, _)| path);
    if raw_path != XBOX_LOOPBACK_CALLBACK_PATH {
        return Err(OAuthCallbackError::UnexpectedPath);
    }
    if target.contains('#') {
        return Err(OAuthCallbackError::MalformedRequest);
    }

    let url = reqwest::Url::parse(&format!("http://127.0.0.1{target}"))
        .map_err(|_| OAuthCallbackError::MalformedRequest)?;
    let mut code = None;
    let mut state = None;
    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "code" if code.is_some() => return Err(OAuthCallbackError::DuplicateCode),
            "code" => code = Some(value.into_owned()),
            "state" if state.is_some() => return Err(OAuthCallbackError::DuplicateState),
            "state" => state = Some(value.into_owned()),
            _ => {}
        }
    }

    let code = code
        .filter(|value| !value.is_empty())
        .ok_or(OAuthCallbackError::MissingCode)?;
    let state = state
        .filter(|value| !value.is_empty())
        .ok_or(OAuthCallbackError::MissingState)?;
    if !oauth_state_matches(expected_state, &state) {
        return Err(OAuthCallbackError::StateMismatch);
    }

    Ok(code)
}

fn oauth_state_matches(expected: &str, received: &str) -> bool {
    if expected.len() != received.len() {
        return false;
    }

    expected
        .as_bytes()
        .iter()
        .zip(received.as_bytes())
        .fold(0_u8, |difference, (left, right)| {
            difference | (left ^ right)
        })
        == 0
}

fn read_callback_request(stream: &mut TcpStream) -> io::Result<String> {
    stream.set_nonblocking(false)?;
    stream.set_read_timeout(Some(XBOX_CALLBACK_READ_TIMEOUT))?;

    let mut request = Vec::with_capacity(1024);
    let mut chunk = [0_u8; 1024];
    while request.len() < XBOX_CALLBACK_REQUEST_LIMIT {
        let bytes_read = stream.read(&mut chunk)?;
        if bytes_read == 0 {
            break;
        }
        request.extend_from_slice(&chunk[..bytes_read]);
        if request.windows(4).any(|window| window == b"\r\n\r\n") {
            break;
        }
    }

    if request.len() >= XBOX_CALLBACK_REQUEST_LIMIT
        && !request.windows(4).any(|window| window == b"\r\n\r\n")
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Xbox callback request headers are too large",
        ));
    }

    String::from_utf8(request).map_err(|_| {
        io::Error::new(
            io::ErrorKind::InvalidData,
            "Invalid callback request encoding",
        )
    })
}

fn write_callback_response(stream: &mut TcpStream, status: &str, body: &str) -> io::Result<()> {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(response.as_bytes())?;
    stream.flush()
}

fn pending_pkce_exchanges() -> &'static Mutex<HashMap<[u8; 32], PendingPkceExchange>> {
    static EXCHANGES: OnceLock<Mutex<HashMap<[u8; 32], PendingPkceExchange>>> = OnceLock::new();
    EXCHANGES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn active_callback_cancellation() -> &'static Mutex<Option<Arc<AtomicBool>>> {
    static ACTIVE: OnceLock<Mutex<Option<Arc<AtomicBool>>>> = OnceLock::new();
    ACTIVE.get_or_init(|| Mutex::new(None))
}

fn activate_callback_server(cancelled: Arc<AtomicBool>) -> Result<(), String> {
    let mut active = active_callback_cancellation()
        .lock()
        .map_err(|_| "Xbox login callback state is unavailable".to_string())?;
    if let Some(previous) = active.replace(cancelled) {
        previous.store(true, Ordering::Release);
    }
    Ok(())
}

fn clear_active_callback_server(cancelled: &Arc<AtomicBool>) {
    if let Ok(mut active) = active_callback_cancellation().lock() {
        if active
            .as_ref()
            .is_some_and(|current| Arc::ptr_eq(current, cancelled))
        {
            active.take();
        }
    }
}

fn oauth_code_fingerprint(code: &str) -> [u8; 32] {
    Sha256::digest(code.as_bytes()).into()
}

fn remember_pkce_exchange(code: &str, verifier: &str) -> Result<(), String> {
    let mut exchanges = pending_pkce_exchanges()
        .lock()
        .map_err(|_| "Xbox login exchange state is unavailable".to_string())?;
    let now = Instant::now();
    exchanges.retain(|_, exchange| {
        now.saturating_duration_since(exchange.created_at) < XBOX_PKCE_EXCHANGE_TTL
    });
    exchanges.insert(
        oauth_code_fingerprint(code),
        PendingPkceExchange {
            verifier: verifier.to_string(),
            created_at: now,
        },
    );
    Ok(())
}

fn take_pkce_verifier(code: &str) -> Result<String, String> {
    let mut exchanges = pending_pkce_exchanges()
        .lock()
        .map_err(|_| "Xbox login exchange state is unavailable".to_string())?;
    let now = Instant::now();
    exchanges.retain(|_, exchange| {
        now.saturating_duration_since(exchange.created_at) < XBOX_PKCE_EXCHANGE_TTL
    });
    exchanges
        .remove(&oauth_code_fingerprint(code))
        .map(|exchange| exchange.verifier)
        .ok_or_else(|| "Xbox login session is missing or expired; start login again".to_string())
}

fn forget_pkce_exchange(code: &str) {
    if let Ok(mut exchanges) = pending_pkce_exchanges().lock() {
        exchanges.remove(&oauth_code_fingerprint(code));
    }
}

fn start_xbox_callback_server(
    listener: TcpListener,
    app: tauri::AppHandle,
    expected_state: String,
    pkce_verifier: String,
) -> Result<Arc<AtomicBool>, String> {
    let cancelled = Arc::new(AtomicBool::new(false));
    let worker_cancelled = Arc::clone(&cancelled);
    thread::Builder::new()
        .name("xbox-oauth-callback".to_string())
        .spawn(move || {
            use tauri::{Emitter, Manager};

            let deadline = Instant::now() + XBOX_CALLBACK_TIMEOUT;
            while !worker_cancelled.load(Ordering::Acquire) && Instant::now() < deadline {
                let (mut stream, _) = match listener.accept() {
                    Ok(connection) => connection,
                    Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                        thread::sleep(XBOX_CALLBACK_POLL_INTERVAL);
                        continue;
                    }
                    Err(_) => break,
                };

                let Ok(request) = read_callback_request(&mut stream) else {
                    let _ = write_callback_response(&mut stream, "400 Bad Request", "");
                    continue;
                };
                if worker_cancelled.load(Ordering::Acquire) {
                    break;
                }
                let Ok(code) = parse_oauth_callback_request(&request, &expected_state) else {
                    let _ = write_callback_response(&mut stream, "400 Bad Request", "");
                    continue;
                };

                if remember_pkce_exchange(&code, &pkce_verifier).is_err() {
                    let _ = write_callback_response(&mut stream, "500 Internal Server Error", "");
                    break;
                }
                if worker_cancelled.load(Ordering::Acquire) {
                    forget_pkce_exchange(&code);
                    break;
                }

                if app.emit("xbox_login_code", code.clone()).is_err() {
                    forget_pkce_exchange(&code);
                    let _ = write_callback_response(&mut stream, "500 Internal Server Error", "");
                    break;
                }

                let response_body = r#"
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <title>OG Launcher - Xbox Login Successful</title>
                        <style>
                            body {
                                font-family: system-ui, -apple-system, sans-serif;
                                background-color: #fbf4e7;
                                color: #171411;
                                text-align: center;
                                padding: 50px;
                                margin: 0;
                            }
                            .container {
                                max-width: 500px;
                                margin: 80px auto;
                                border: 4px solid #000;
                                background-color: #efe6d4;
                                padding: 40px 30px;
                                box-shadow: 6px 6px 0px #000;
                            }
                            h1 {
                                font-weight: 900;
                                text-transform: uppercase;
                                margin-bottom: 20px;
                                font-size: 28px;
                                letter-spacing: -0.02em;
                            }
                            p { font-weight: bold; font-size: 16px; line-height: 1.5; color: #55504a; }
                            .success-icon {
                                font-size: 48px;
                                color: #087d6d;
                                margin-bottom: 20px;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="success-icon">OK</div>
                            <h1>Xbox Login Successful!</h1>
                            <p>Your Xbox integration was successful. You can close this tab now and return to the Open Game Launcher.</p>
                        </div>
                    </body>
                    </html>
                "#;
                let _ = write_callback_response(&mut stream, "200 OK", response_body);

                if !worker_cancelled.load(Ordering::Acquire) {
                    if let Some(window) = app.get_webview_window("xbox-login") {
                        let _ = window.close();
                    }
                }
                break;
            }
            clear_active_callback_server(&worker_cancelled);
        })
        .map_err(|e| format!("Failed to start Xbox login callback worker: {e}"))?;
    Ok(cancelled)
}

#[tauri::command]
pub async fn open_xbox_login_window(app: tauri::AppHandle) -> Result<(), String> {
    let (listener, callback_address) = bind_xbox_callback_listener()?;
    let callback_url = build_loopback_callback_url(callback_address)?;
    let state = generate_oauth_secret()?;
    let pkce_verifier = generate_oauth_secret()?;
    let pkce_challenge = pkce_s256_challenge(&pkce_verifier);
    let url = build_xbox_authorization_url(&state, &pkce_challenge)?;
    let url = url
        .parse()
        .map_err(|e| format!("Failed to parse login URL: {e}"))?;
    let script = build_xbox_callback_script(&callback_url)?;

    // Keep the verifier in Rust and pair it with the accepted callback code. The
    // legacy Live desktop authorize/token endpoint pair supports standard S256
    // PKCE without changing the registered oauth20_desktop.srf redirect contract.
    let callback_cancel = start_xbox_callback_server(listener, app.clone(), state, pkce_verifier)?;
    if let Err(error) = activate_callback_server(Arc::clone(&callback_cancel)) {
        callback_cancel.store(true, Ordering::Release);
        return Err(error);
    }

    // Close any existing xbox-login window first so we can create a fresh one
    use tauri::Manager;
    if let Some(existing) = app.get_webview_window("xbox-login") {
        let _ = existing.close();
        // Give the OS a moment to clean up the window
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }

    let window_result =
        tauri::WebviewWindowBuilder::new(&app, "xbox-login", tauri::WebviewUrl::External(url))
            .title("Xbox Login")
            .inner_size(500.0, 700.0)
            .center()
            .resizable(true)
            .initialization_script(&script)
            .build();

    if let Err(error) = window_result {
        callback_cancel.store(true, Ordering::Release);
        return Err(format!("Failed to create login window: {error}"));
    }

    Ok(())
}

async fn get_oauth_token(code: &str, code_verifier: &str) -> Result<TokenResponse, String> {
    let client = crate::commands::http::shared_http_client();
    let params = [
        ("grant_type", "authorization_code"),
        ("code", code),
        ("scope", XBOX_SCOPE),
        ("client_id", XBOX_CLIENT_ID),
        ("redirect_uri", XBOX_REDIRECT_URI),
        ("code_verifier", code_verifier),
    ];

    let res = client
        .post(XBOX_TOKEN_ENDPOINT)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("OAuth token request failed: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("OAuth error: {}", res.status()));
    }

    res.json::<TokenResponse>()
        .await
        .map_err(|e| format!("Failed to parse OAuth token: {}", e))
}

async fn refresh_xbox_oauth_token(refresh_token: &str) -> Result<TokenResponse, String> {
    let client = crate::commands::http::shared_http_client();
    let params = [
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
        ("scope", XBOX_SCOPE),
        ("client_id", XBOX_CLIENT_ID),
    ];

    let res = client
        .post(XBOX_TOKEN_ENDPOINT)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("OAuth token refresh failed: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("OAuth refresh error: {}", res.status()));
    }

    res.json::<TokenResponse>()
        .await
        .map_err(|e| format!("Failed to parse refreshed OAuth token: {}", e))
}

async fn authenticate_xbox_live(access_token: &str) -> Result<AuthResponse, String> {
    let client = crate::commands::http::shared_http_client();
    let req_body = AuthRequest {
        properties: AuthProperties {
            auth_method: "RPS".into(),
            site_name: "user.auth.xboxlive.com".into(),
            rps_ticket: format!("d={}", access_token),
        },
        relying_party: "http://auth.xboxlive.com".into(),
        token_type: "JWT".into(),
    };

    let mut headers = HeaderMap::new();
    headers.insert("x-xbl-contract-version", HeaderValue::from_static("1"));

    let res = client
        .post("https://user.auth.xboxlive.com/user/authenticate")
        .headers(headers)
        .json(&req_body)
        .send()
        .await
        .map_err(|e| format!("XBL auth failed: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("XBL auth error: {}", res.status()));
    }

    res.json::<AuthResponse>()
        .await
        .map_err(|e| format!("Failed to parse XBL auth: {}", e))
}

async fn authorize_xsts(user_token: &str) -> Result<AuthResponse, String> {
    let client = crate::commands::http::shared_http_client();
    let req_body = XstsRequest {
        properties: XstsProperties {
            sandbox_id: "RETAIL".into(),
            user_tokens: vec![user_token.to_string()],
        },
        relying_party: "http://xboxlive.com".into(),
        token_type: "JWT".into(),
    };

    let mut headers = HeaderMap::new();
    headers.insert("x-xbl-contract-version", HeaderValue::from_static("1"));

    let res = client
        .post("https://xsts.auth.xboxlive.com/xsts/authorize")
        .headers(headers)
        .json(&req_body)
        .send()
        .await
        .map_err(|e| format!("XSTS auth failed: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("XSTS auth error: {}", res.status()));
    }

    res.json::<AuthResponse>()
        .await
        .map_err(|e| format!("Failed to parse XSTS auth: {}", e))
}

#[tauri::command]
pub async fn fetch_xbox_owned_games(code: String) -> Result<XboxFetchResult, String> {
    let code_verifier = take_pkce_verifier(&code)?;
    let oauth_token = match get_oauth_token(&code, &code_verifier).await {
        Ok(t) => t,
        Err(e) => {
            println!("[Xbox] get_oauth_token failed: {}", e);
            return Err(e);
        }
    };
    save_xbox_token(&oauth_token.refresh_token)?;

    println!("[Xbox] Got OAuth token. Authenticating Xbox Live...");
    let xbl_auth = match authenticate_xbox_live(&oauth_token.access_token).await {
        Ok(t) => t,
        Err(e) => {
            println!("[Xbox] authenticate_xbox_live failed: {}", e);
            return Err(e);
        }
    };

    println!("[Xbox] Authorizing XSTS...");
    let xsts_auth = match authorize_xsts(&xbl_auth.token).await {
        Ok(t) => t,
        Err(e) => {
            println!("[Xbox] authorize_xsts failed: {}", e);
            return Err(e);
        }
    };

    let uhs = xsts_auth
        .display_claims
        .xui
        .first()
        .map(|x| x.uhs.clone())
        .unwrap_or_default();

    let gamertag = xsts_auth
        .display_claims
        .xui
        .first()
        .and_then(|x| x.gtg.clone());

    println!(
        "[Xbox] XSTS authorized. gamertag: {:?}, uhs: {}",
        gamertag, uhs
    );
    let xid = xsts_auth
        .display_claims
        .xui
        .first()
        .and_then(|x| x.xid.clone());

    let auth_header = format!("XBL3.0 x={};{}", uhs, xsts_auth.token);

    let client = crate::commands::http::shared_http_client();
    let url = format!(
        "https://titlehub.xboxlive.com/users/xuid({})/titles/titlehistory/decoration/detail,stat,achievement,image",
        xid.unwrap_or_default()
    );

    let mut headers = HeaderMap::new();
    headers.insert("x-xbl-contract-version", HeaderValue::from_static("2"));
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&auth_header).map_err(|e| e.to_string())?,
    );
    headers.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("en-US"));

    let res = client
        .get(&url)
        .headers(headers)
        .send()
        .await
        .map_err(|e| format!("Titlehub request failed: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Titlehub error: {}", res.status()));
    }

    let history: TitleHistoryResponse = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse title history: {}", e))?;

    let mut games = Vec::new();
    for title in history.titles {
        // Filter like Playnite: type == Game and devices contains PC
        if title.item_type.as_deref() != Some("Game") {
            continue;
        }

        let is_pc = title
            .devices
            .as_ref()
            .is_some_and(|devices| devices.iter().any(|d| d.eq_ignore_ascii_case("PC")));

        if !is_pc {
            continue;
        }

        let pfn = title.pfn.clone().unwrap_or_default();
        if pfn.is_empty() {
            continue;
        }

        let raw_name = title
            .name
            .clone()
            .unwrap_or_else(|| "Unknown Xbox Game".to_string());
        let clean_name = clean_xbox_title_name(&raw_name);
        if is_xbox_non_game_owned_item(&clean_name) {
            continue;
        }

        let display_image_url = titlehub_display_image_url(&title);
        let last_played = title.title_history.and_then(|th| th.last_time_played);

        let mut playtime_minutes = None;
        if let Some(stats) = &title.stats {
            if let Some(statlist) = stats.get("statlist").and_then(|s| s.as_array()) {
                for stat in statlist {
                    if stat.get("name").and_then(|n| n.as_str()) == Some("MinutesPlayed") {
                        if let Some(val) = stat.get("value").and_then(|v| v.as_u64()) {
                            playtime_minutes = Some(val);
                        }
                    }
                }
            } else if let Some(val) = stats.get("minutesPlayed").and_then(|v| v.as_u64()) {
                playtime_minutes = Some(val);
            } else if let Some(groups) = stats.get("groups").and_then(|g| g.as_array()) {
                for group in groups {
                    if let Some(group_stats) = group.get("statlist").and_then(|s| s.as_array()) {
                        for stat in group_stats {
                            if stat.get("name").and_then(|n| n.as_str()) == Some("MinutesPlayed") {
                                if let Some(val) = stat.get("value").and_then(|v| v.as_u64()) {
                                    playtime_minutes = Some(val);
                                }
                            }
                        }
                    }
                }
            }
        }

        games.push(OwnedGame {
            id: format!("xbox-{}", pfn), // We use the PFN as the unique identifier
            external_id: Some(title.title_id.clone()),
            title: clean_name,
            description: String::new(),
            cover_url: display_image_url.clone(),
            logo_url: None,
            icon_url: display_image_url,
            playtime_minutes,
            last_played_at: last_played,
            cloud_gaming_url: None,
            achievement_summary: None,
        });
    }

    Ok(XboxFetchResult { games, gamertag })
}

#[tauri::command]
pub async fn launch_xbox_game(pfn: String) -> Result<(), String> {
    if !cfg!(target_os = "windows") {
        return Err("Only supported on Windows".into());
    }

    let pfn = validate_xbox_package_family_name(&pfn)?;
    let aumid = resolve_xbox_aumid(&pfn)?;
    let target = format!("shell:AppsFolder\\{}", aumid);

    Command::new("explorer.exe")
        .arg(&target)
        .spawn()
        .map_err(|e| format!("Failed to launch Xbox game: {}", e))?;

    Ok(())
}

fn validate_xbox_package_family_name(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty()
        || !value.contains('_')
        || !value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
        })
    {
        return Err("Xbox launch requires a valid installed Package Family Name.".to_string());
    }

    Ok(value.to_string())
}

fn resolve_xbox_aumid(pfn: &str) -> Result<String, String> {
    let script = r#"
$ErrorActionPreference = 'Stop'
$pfn = $env:OGL_XBOX_PFN
$ids = @(Get-StartApps | ForEach-Object { $_.AppID } | Where-Object { $_ -like "${pfn}!*" } | Sort-Object -Unique)
if ($ids.Count -eq 0) {
  $package = Get-AppxPackage | Where-Object { $_.PackageFamilyName -eq $pfn } | Select-Object -First 1
  if (-not $package) { throw "Installed package was not found." }
  $manifest = Get-AppxPackageManifest -Package $package.PackageFullName
  $ids = @($manifest.Package.Applications.Application | ForEach-Object { if ($_.Id) { "${pfn}!$($_.Id)" } } | Sort-Object -Unique)
}
$ids | ForEach-Object { Write-Output $_ }
"#;

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .env("OGL_XBOX_PFN", pfn)
        .output()
        .map_err(|error| format!("Could not inspect the Xbox application manifest: {error}"))?;

    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if detail.is_empty() {
            "Could not resolve the installed Xbox application's AUMID.".to_string()
        } else {
            format!("Could not resolve the installed Xbox application's AUMID: {detail}")
        });
    }

    parse_resolved_xbox_aumid(pfn, &String::from_utf8_lossy(&output.stdout))
}

fn parse_resolved_xbox_aumid(pfn: &str, output: &str) -> Result<String, String> {
    let expected_prefix = format!("{pfn}!");
    let mut matches = output
        .lines()
        .map(str::trim)
        .filter(|line| line.starts_with(&expected_prefix) && line.len() > expected_prefix.len())
        .map(str::to_string)
        .collect::<Vec<_>>();
    matches.sort();
    matches.dedup();

    match matches.as_slice() {
        [aumid] => Ok(aumid.clone()),
        [] => Err(format!(
            "Xbox package '{pfn}' has no registered launchable application."
        )),
        _ => Err(format!(
            "Xbox package '{pfn}' exposes multiple launchable applications; refusing to guess the AUMID."
        )),
    }
}

#[tauri::command]
pub async fn install_xbox_game(pfn: String) -> Result<(), String> {
    if !cfg!(target_os = "windows") {
        return Err("Only supported on Windows".into());
    }

    // If it doesn't contain an underscore, it's likely a ProductId instead of a PackageFamilyName
    let url = if pfn.contains('_') {
        format!("ms-windows-store://pdp/?PFN={}", pfn)
    } else {
        format!("ms-windows-store://pdp/?ProductId={}", pfn)
    };

    crate::commands::system::open_uri(&url)?;

    Ok(())
}

fn normalize_game_pass_language(value: Option<&str>) -> String {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return DEFAULT_GAME_PASS_LANGUAGE.to_string();
    };
    if value.len() > 35 || !value.is_ascii() {
        return DEFAULT_GAME_PASS_LANGUAGE.to_string();
    }

    let segments = value.split('-').collect::<Vec<_>>();
    let Some(primary_language) = segments.first() else {
        return DEFAULT_GAME_PASS_LANGUAGE.to_string();
    };
    if !(2..=3).contains(&primary_language.len())
        || !primary_language
            .chars()
            .all(|character| character.is_ascii_alphabetic())
        || segments.iter().skip(1).any(|segment| {
            segment.is_empty()
                || segment.len() > 8
                || !segment
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric())
        })
    {
        return DEFAULT_GAME_PASS_LANGUAGE.to_string();
    }

    segments
        .into_iter()
        .enumerate()
        .map(|(index, segment)| {
            if index == 0 {
                segment.to_ascii_lowercase()
            } else if segment.len() == 4
                && segment
                    .chars()
                    .all(|character| character.is_ascii_alphabetic())
            {
                let mut characters = segment.chars();
                let first = characters.next().unwrap_or_default().to_ascii_uppercase();
                format!("{first}{}", characters.as_str().to_ascii_lowercase())
            } else if segment.len() == 2
                && segment
                    .chars()
                    .all(|character| character.is_ascii_alphabetic())
            {
                segment.to_ascii_uppercase()
            } else {
                segment.to_ascii_lowercase()
            }
        })
        .collect::<Vec<_>>()
        .join("-")
}

fn normalize_game_pass_market(value: Option<&str>) -> String {
    value
        .map(str::trim)
        .filter(|value| {
            value.len() == 2
                && value
                    .chars()
                    .all(|character| character.is_ascii_alphabetic())
        })
        .map(str::to_ascii_uppercase)
        .unwrap_or_else(|| DEFAULT_GAME_PASS_MARKET.to_string())
}

fn normalize_microsoft_store_product_id(value: &str) -> Option<String> {
    let value = value.trim();
    if value.len() != MICROSOFT_STORE_PRODUCT_ID_LENGTH
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric())
    {
        return None;
    }

    Some(value.to_ascii_uppercase())
}

fn parse_game_pass_catalog_ids(payload: &str) -> Result<Vec<String>, String> {
    let items: Vec<GamePassCatalogItem> =
        serde_json::from_str(payload).map_err(|error| format!("invalid SIGL JSON: {error}"))?;
    let mut seen = HashSet::new();
    let mut product_ids = Vec::new();

    for item in items {
        let Some(serde_json::Value::String(raw_id)) = item.id else {
            continue;
        };
        let Some(product_id) = normalize_microsoft_store_product_id(&raw_id) else {
            continue;
        };
        if seen.insert(product_id.clone()) {
            product_ids.push(product_id);
        }
    }

    if product_ids.is_empty() {
        return Err("SIGL response contained no valid Microsoft Store product IDs".to_string());
    }

    Ok(product_ids)
}

fn parse_display_catalog_products(payload: &str) -> Result<Vec<DisplayCatalogProduct>, String> {
    serde_json::from_str::<DisplayCatalogResponse>(payload)
        .map(|response| response.products)
        .map_err(|error| format!("invalid display catalog JSON: {error}"))
}

fn normalize_catalog_asset_url(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty()
        || value
            .chars()
            .any(|character| character.is_whitespace() || character.is_control())
    {
        return None;
    }

    let lowercase = value.to_ascii_lowercase();
    let remainder = if let Some(remainder) = value.strip_prefix("//") {
        remainder
    } else if lowercase.starts_with("https://") {
        &value[8..]
    } else if lowercase.starts_with("http://") {
        &value[7..]
    } else {
        return None;
    };

    if remainder.is_empty() || remainder.starts_with('/') || remainder.contains('\\') {
        return None;
    }

    Some(format!("https://{remainder}"))
}

fn titlehub_display_image_url(title: &Title) -> Option<String> {
    title
        .display_image
        .as_deref()
        .and_then(normalize_catalog_asset_url)
}

fn find_catalog_image_url(
    properties: &[DisplayCatalogLocalizedProperties],
    purposes: &[&str],
) -> Option<String> {
    for purpose in purposes {
        for property in properties {
            for image in &property.images {
                if !image
                    .image_purpose
                    .as_deref()
                    .is_some_and(|candidate| candidate.eq_ignore_ascii_case(purpose))
                {
                    continue;
                }
                if let Some(url) = image.uri.as_deref().and_then(normalize_catalog_asset_url) {
                    return Some(url);
                }
            }
        }
    }

    None
}

fn display_catalog_package_evidence(
    product: &DisplayCatalogProduct,
) -> DisplayCatalogPackageEvidence {
    let packages = product
        .display_sku_availabilities
        .iter()
        .filter_map(|availability| availability.sku.as_ref())
        .filter_map(|sku| sku.properties.as_ref())
        .flat_map(|properties| properties.packages.iter())
        .collect::<Vec<_>>();

    if packages.is_empty() {
        return DisplayCatalogPackageEvidence::Unknown;
    }

    if packages
        .iter()
        .filter_map(|package| package.package_format.as_deref())
        .map(str::trim)
        .filter(|package_format| !package_format.is_empty())
        .any(|package_format| !package_format.eq_ignore_ascii_case("XVC"))
    {
        return DisplayCatalogPackageEvidence::ExplicitWindows;
    }

    if packages.iter().all(|package| {
        package
            .package_format
            .as_deref()
            .map(str::trim)
            .is_some_and(|package_format| package_format.eq_ignore_ascii_case("XVC"))
    }) {
        return DisplayCatalogPackageEvidence::ExplicitConsoleOnly;
    }

    DisplayCatalogPackageEvidence::Unknown
}

fn normalize_display_catalog_title(value: &str) -> String {
    let mut title = value.trim().to_lowercase();
    for suffix in [
        " (windows 11)",
        " (windows 10)",
        " (windows)",
        " (pc)",
        " for windows 11",
        " for windows 10",
        " for windows",
        " - windows 11",
        " - windows 10",
        " - windows",
    ] {
        if title.ends_with(suffix) {
            title.truncate(title.len() - suffix.len());
            break;
        }
    }

    let compact = title
        .chars()
        .filter(|character| character.is_alphanumeric())
        .collect::<String>();
    if compact.is_empty() {
        title.trim().to_string()
    } else {
        compact
    }
}

fn map_display_catalog_product(product: DisplayCatalogProduct) -> Option<OwnedGame> {
    let product_id = product
        .product_id
        .as_deref()
        .and_then(normalize_microsoft_store_product_id)?;
    let title = product.localized_properties.iter().find_map(|property| {
        property
            .product_title
            .as_deref()
            .map(str::trim)
            .filter(|title| !title.is_empty())
            .map(str::to_string)
    })?;
    let cover_url = find_catalog_image_url(&product.localized_properties, &["Poster", "BoxArt"]);
    let logo_url = find_catalog_image_url(&product.localized_properties, &["Logo"]);

    Some(OwnedGame {
        id: format!("xbox-{product_id}"),
        external_id: Some(product_id),
        title,
        description: String::new(),
        cover_url,
        logo_url,
        icon_url: None,
        playtime_minutes: None,
        last_played_at: None,
        cloud_gaming_url: None,
        achievement_summary: None,
    })
}

fn map_display_catalog_candidate(
    product: DisplayCatalogProduct,
) -> Option<DisplayCatalogCandidate> {
    let package_evidence = display_catalog_package_evidence(&product);
    let game = map_display_catalog_product(product)?;
    let normalized_title = normalize_display_catalog_title(&game.title);

    Some(DisplayCatalogCandidate {
        game,
        normalized_title,
        package_evidence,
    })
}

fn select_pc_display_catalog_games(
    candidates: Vec<DisplayCatalogCandidate>,
) -> DisplayCatalogSelection {
    let explicit_windows_titles = candidates
        .iter()
        .filter(|candidate| {
            candidate.package_evidence == DisplayCatalogPackageEvidence::ExplicitWindows
        })
        .map(|candidate| candidate.normalized_title.clone())
        .collect::<HashSet<_>>();
    let mut games = Vec::with_capacity(candidates.len());
    let mut excluded_console_only = 0usize;
    let mut excluded_unknown_duplicates = 0usize;

    for candidate in candidates {
        match candidate.package_evidence {
            DisplayCatalogPackageEvidence::ExplicitConsoleOnly => {
                excluded_console_only = excluded_console_only.saturating_add(1);
            }
            DisplayCatalogPackageEvidence::Unknown
                if explicit_windows_titles.contains(&candidate.normalized_title) =>
            {
                excluded_unknown_duplicates = excluded_unknown_duplicates.saturating_add(1);
            }
            DisplayCatalogPackageEvidence::ExplicitWindows
            | DisplayCatalogPackageEvidence::Unknown => games.push(candidate.game),
        }
    }

    DisplayCatalogSelection {
        games,
        excluded_console_only,
        excluded_unknown_duplicates,
    }
}

fn response_body_excerpt(body: &str) -> String {
    let condensed = body.split_whitespace().collect::<Vec<_>>().join(" ");
    if condensed.is_empty() {
        return "empty response body".to_string();
    }

    let mut characters = condensed.chars();
    let mut excerpt = characters.by_ref().take(240).collect::<String>();
    if characters.next().is_some() {
        excerpt.push_str("...");
    }
    excerpt
}

fn summarize_batch_errors(errors: &[String]) -> String {
    let mut summary = errors
        .iter()
        .take(3)
        .cloned()
        .collect::<Vec<_>>()
        .join(" | ");
    if errors.len() > 3 {
        summary.push_str(&format!(" | and {} more batch error(s)", errors.len() - 3));
    }
    summary
}

fn require_complete_display_catalog_batches(errors: &[String]) -> Result<(), String> {
    if errors.is_empty() {
        return Ok(());
    }

    Err(format!(
        "Microsoft display catalog remained incomplete after one retry for {} batch(es): {}",
        errors.len(),
        summarize_batch_errors(errors)
    ))
}

async fn fetch_display_catalog_batch(
    client: &reqwest::Client,
    product_ids: &[String],
    language: &str,
    market: &str,
    batch_number: usize,
    batch_count: usize,
) -> Result<Vec<DisplayCatalogProduct>, String> {
    let joined_ids = product_ids.join(",");
    let response = client
        .get(DISPLAY_CATALOG_ENDPOINT)
        .query(&[
            ("bigIds", joined_ids.as_str()),
            ("market", market),
            ("languages", language),
            ("MS-CV", "OGLauncher.1"),
        ])
        .header(ACCEPT_LANGUAGE, language)
        .send()
        .await
        .map_err(|error| {
            format!("display catalog batch {batch_number}/{batch_count} request failed: {error}")
        })?;
    let status = response.status();
    let body = response.text().await.map_err(|error| {
        format!(
            "display catalog batch {batch_number}/{batch_count} body could not be read: {error}"
        )
    })?;

    if !status.is_success() {
        return Err(format!(
            "display catalog batch {batch_number}/{batch_count} returned HTTP {status}: {}",
            response_body_excerpt(&body)
        ));
    }

    parse_display_catalog_products(&body).map_err(|error| {
        format!("display catalog batch {batch_number}/{batch_count} could not be parsed: {error}")
    })
}

#[tauri::command]
pub async fn fetch_game_pass_catalog(
    language: Option<String>,
    market: Option<String>,
) -> Result<Vec<OwnedGame>, String> {
    let language = normalize_game_pass_language(language.as_deref());
    let market = normalize_game_pass_market(market.as_deref());
    let client = crate::commands::http::shared_http_client();
    let response = client
        .get(GAME_PASS_SIGL_ENDPOINT)
        .query(&[
            ("id", GAME_PASS_PC_SIGL_ID),
            ("language", language.as_str()),
            ("market", market.as_str()),
        ])
        .header(ACCEPT_LANGUAGE, language.as_str())
        .send()
        .await
        .map_err(|error| format!("PC Game Pass SIGL request failed: {error}"))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("PC Game Pass SIGL response could not be read: {error}"))?;

    if !status.is_success() {
        return Err(format!(
            "PC Game Pass SIGL returned HTTP {status}: {}",
            response_body_excerpt(&body)
        ));
    }

    let product_ids = parse_game_pass_catalog_ids(&body)
        .map_err(|error| format!("PC Game Pass SIGL could not be parsed: {error}"))?;
    let requested_product_ids = product_ids.iter().cloned().collect::<HashSet<_>>();
    let batch_count = product_ids.len().div_ceil(DISPLAY_CATALOG_BATCH_SIZE);
    let mut products_by_id = HashMap::new();
    let mut batch_errors = Vec::new();

    for (batch_index, product_id_batch) in
        product_ids.chunks(DISPLAY_CATALOG_BATCH_SIZE).enumerate()
    {
        let batch_number = batch_index + 1;
        let products = match fetch_display_catalog_batch(
            client,
            product_id_batch,
            &language,
            &market,
            batch_number,
            batch_count,
        )
        .await
        {
            Ok(products) => Ok(products),
            Err(first_error) => {
                eprintln!(
                    "[Xbox] Retrying PC Game Pass display catalog batch {batch_number}/{batch_count} after: {first_error}"
                );
                fetch_display_catalog_batch(
                    client,
                    product_id_batch,
                    &language,
                    &market,
                    batch_number,
                    batch_count,
                )
                .await
                .map_err(|retry_error| format!("{first_error} | retry failed: {retry_error}"))
            }
        };

        match products {
            Ok(products) => {
                for product in products {
                    let Some(candidate) = map_display_catalog_candidate(product) else {
                        continue;
                    };
                    let Some(product_id) = candidate.game.external_id.clone() else {
                        continue;
                    };
                    if requested_product_ids.contains(&product_id) {
                        products_by_id.entry(product_id).or_insert(candidate);
                    }
                }
            }
            Err(error) => batch_errors.push(error),
        }
    }

    require_complete_display_catalog_batches(&batch_errors)?;

    let mut candidates = Vec::with_capacity(products_by_id.len());
    for product_id in &product_ids {
        if let Some(candidate) = products_by_id.remove(product_id) {
            candidates.push(candidate);
        }
    }
    let mapped_product_count = candidates.len();
    let selection = select_pc_display_catalog_games(candidates);
    let games = selection.games;

    if games.is_empty() {
        let error_summary = if batch_errors.is_empty() {
            String::new()
        } else {
            format!(" Batch errors: {}", summarize_batch_errors(&batch_errors))
        };
        return Err(format!(
            "Microsoft display catalog returned no usable PC Game Pass products for {} valid product IDs.{error_summary}",
            product_ids.len()
        ));
    }

    let excluded_product_count = selection
        .excluded_console_only
        .saturating_add(selection.excluded_unknown_duplicates);
    if excluded_product_count > 0 {
        println!(
            "[Xbox] PC Game Pass catalog excluded {} explicit console-only product(s) and {} ambiguous duplicate product(s).",
            selection.excluded_console_only, selection.excluded_unknown_duplicates
        );
    }

    let missing_product_count = product_ids.len().saturating_sub(mapped_product_count);
    if missing_product_count > 0 || !batch_errors.is_empty() {
        eprintln!(
            "[Xbox] PC Game Pass catalog loaded partially: {} game(s), {} missing product(s), {} failed batch(es). {}",
            games.len(),
            missing_product_count,
            batch_errors.len(),
            summarize_batch_errors(&batch_errors)
        );
    }

    Ok(games)
}

#[derive(Deserialize, Debug)]
#[allow(non_snake_case)]
struct XboxAchievementsResponse {
    achievements: Vec<XboxAchievement>,
}

#[derive(Deserialize, Debug)]
#[allow(non_snake_case)]
struct XboxAchievement {
    id: String,
    name: String,
    description: Option<String>,
    progressState: String,
    progression: Option<XboxAchievementProgression>,
    mediaAssets: Option<Vec<XboxAchievementMediaAsset>>,
    rarity: Option<XboxAchievementRarity>,
}

#[derive(Deserialize, Debug)]
#[allow(non_snake_case)]
struct XboxAchievementProgression {
    timeUnlocked: String,
}

#[derive(Deserialize, Debug)]
#[allow(non_snake_case)]
struct XboxAchievementMediaAsset {
    name: String,
    url: String,
}

#[derive(Deserialize, Debug)]
#[allow(non_snake_case)]
struct XboxAchievementRarity {
    currentPercentage: f64,
}

fn clean_xbox_title_name(name: &str) -> String {
    name.replace("(PC)", "")
        .replace("(Windows)", "")
        .replace("for Windows 10", "")
        .replace("- Windows 10", "")
        .trim()
        .to_string()
}

fn is_xbox_non_game_owned_item(title: &str) -> bool {
    let normalized = title
        .to_lowercase()
        .replace(['_', '-'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    // Call of Duty hub DLC placeholders: "BO7 DLC01 Game Stub 01",
    // "BO7 DLC17 Standard Launch Tracker", "BO7 DLC56 Game Pass Pack 03".
    let is_black_ops_seven_hub_item = (normalized.starts_with("b07 ")
        || normalized.starts_with("bo7 "))
        && normalized.contains(" dlc");

    is_black_ops_seven_hub_item
        || normalized.contains(" game stub")
        || normalized.contains(" launch tracker")
        || normalized.contains(" game pass pack")
}

fn normalize_title_match(value: &str) -> String {
    value
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .flat_map(|c| c.to_lowercase())
        .collect()
}

fn title_matches_local_hint(title: &Title, hints: &HashSet<String>) -> bool {
    if hints.contains(&title.title_id.to_lowercase()) {
        return true;
    }

    if let Some(pfn) = &title.pfn {
        let pfn = pfn.to_lowercase();
        if hints.iter().any(|hint| hint.contains(&pfn)) {
            return true;
        }
    }

    if let Some(name) = &title.name {
        let clean_name = normalize_title_match(&clean_xbox_title_name(name));
        if !clean_name.is_empty()
            && hints
                .iter()
                .map(|hint| normalize_title_match(hint))
                .any(|hint| hint == clean_name)
        {
            return true;
        }
    }

    false
}

async fn fetch_xbox_title_history(
    client: &reqwest::Client,
    auth_header: &str,
    xid: &str,
) -> Result<TitleHistoryResponse, String> {
    let url = format!(
        "https://titlehub.xboxlive.com/users/xuid({})/titles/titlehistory/decoration/detail,stat,achievement",
        xid
    );

    let mut headers = HeaderMap::new();
    headers.insert("x-xbl-contract-version", HeaderValue::from_static("2"));
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(auth_header).map_err(|e| e.to_string())?,
    );
    headers.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("en-US"));

    let res = client
        .get(&url)
        .headers(headers)
        .send()
        .await
        .map_err(|e| format!("Titlehub request failed: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Titlehub error: {}", res.status()));
    }

    res.json()
        .await
        .map_err(|e| format!("Failed to parse title history: {}", e))
}

async fn resolve_xbox_title_id(
    client: &reqwest::Client,
    auth_header: &str,
    xid: &str,
    game: &crate::commands::games::types::InstalledGame,
    title_hint: &str,
) -> Result<String, String> {
    let title_hint = title_hint.trim();
    if !title_hint.is_empty() && title_hint.chars().all(|c| c.is_ascii_digit()) {
        return Ok(title_hint.to_string());
    }

    let mut hints: HashSet<String> = HashSet::new();

    if !title_hint.is_empty() {
        hints.insert(title_hint.to_lowercase());
    }

    hints.insert(game.id.to_lowercase());
    hints.insert(game.title.to_lowercase());
    if !game.slug.is_empty() {
        hints.insert(game.slug.to_lowercase());
    }
    if let Some(external_id) = &game.external_id {
        let external_id = external_id.trim();
        if external_id.chars().all(|c| c.is_ascii_digit()) {
            return Ok(external_id.to_string());
        }
        if !external_id.is_empty() {
            hints.insert(external_id.to_lowercase());
        }
    }
    if let Some(launch_uri) = &game.launch_uri {
        hints.insert(launch_uri.to_lowercase());
    }

    let history = fetch_xbox_title_history(client, auth_header, xid).await?;
    for title in history.titles {
        if title.item_type.as_deref() != Some("Game") {
            continue;
        }

        let is_pc = title
            .devices
            .as_ref()
            .is_some_and(|devices| devices.iter().any(|d| d.eq_ignore_ascii_case("PC")));

        if !is_pc {
            continue;
        }

        if title_matches_local_hint(&title, &hints) {
            return Ok(title.title_id);
        }
    }

    let label = if game.title.is_empty() {
        game.id.as_str()
    } else {
        game.title.as_str()
    };
    Err(format!(
        "Xbox achievement sync could not resolve a numeric TitleId for {}. Refresh the Xbox library or import the game from Xbox owned games first.",
        label
    ))
}

#[tauri::command]
pub async fn sync_xbox_achievements(
    game_id: String,
    title_id: String,
    fallback_game: Option<crate::commands::games::types::InstalledGame>,
) -> Result<crate::commands::games::types::SyncGameAchievementsResponse, String> {
    let game_id = crate::commands::games::core::normalize_game_id(game_id)?;
    let fallback_game = fallback_game.filter(|game| game.id == game_id);
    if fallback_game
        .as_ref()
        .is_some_and(|game| !game.launcher.eq_ignore_ascii_case("xbox"))
    {
        return Err(format!(
            "Game '{game_id}' does not match the Xbox achievement provider."
        ));
    }
    let cached_games = crate::commands::games::core::read_installed_games_cache_result();
    let cached_game = match cached_games {
        Ok(games) => games.into_iter().find(|game| game.id == game_id),
        Err(error) if fallback_game.is_none() => return Err(error),
        Err(_) => None,
    };
    let should_persist_to_native_cache = cached_game.is_some();
    let mut game = cached_game
        .or(fallback_game)
        .ok_or_else(|| format!("Game '{game_id}' was not found in the local library cache."))?;

    let refresh_token = load_xbox_token().ok_or("Xbox account not linked or token missing")?;
    let oauth_token = refresh_xbox_oauth_token(&refresh_token).await?;
    save_xbox_token(&oauth_token.refresh_token)?;

    let xbl_auth = authenticate_xbox_live(&oauth_token.access_token).await?;
    let xsts_auth = authorize_xsts(&xbl_auth.token).await?;

    let uhs = xsts_auth
        .display_claims
        .xui
        .first()
        .map(|x| x.uhs.clone())
        .unwrap_or_default();
    let xid = xsts_auth
        .display_claims
        .xui
        .first()
        .and_then(|x| x.xid.clone())
        .ok_or("No XUID found")?;

    let auth_header = format!("XBL3.0 x={};{}", uhs, xsts_auth.token);

    let client = crate::commands::http::shared_http_client();
    let title_id =
        resolve_xbox_title_id(client, &auth_header, &xid, &game, title_id.trim()).await?;
    let url = format!(
        "https://achievements.xboxlive.com/users/xuid({})/achievements?titleId={}&maxItems=1000",
        xid, title_id
    );

    let mut headers = HeaderMap::new();
    headers.insert("x-xbl-contract-version", HeaderValue::from_static("2"));
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&auth_header).map_err(|e| e.to_string())?,
    );
    headers.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("en-US"));

    let res = client
        .get(&url)
        .headers(headers)
        .send()
        .await
        .map_err(|e| format!("Xbox achievements request failed: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Xbox achievements error: {}", res.status()));
    }

    let ach_res: XboxAchievementsResponse = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse Xbox achievements: {}", e))?;

    let mut unified = Vec::new();
    for ach in ach_res.achievements {
        let icon_url = ach
            .mediaAssets
            .unwrap_or_default()
            .into_iter()
            .find(|m| m.name.eq_ignore_ascii_case("Icon"))
            .map(|m| m.url);

        let unlocked_at = if ach.progressState.eq_ignore_ascii_case("Achieved") {
            ach.progression.map(|p| p.timeUnlocked)
        } else {
            None
        };

        unified.push(crate::commands::games::types::UnifiedAchievement {
            id: ach.id.clone(),
            name: ach.name,
            description: ach.description,
            icon_url,
            unlocked_at,
            rarity: ach.rarity.map(|r| r.currentPercentage),
            source: Some("xbox".to_string()),
            source_achievement_id: Some(ach.id),
            provider_confidence: Some("official".to_string()),
        });
    }

    let unlocked_achievements = unified.iter().filter(|a| a.unlocked_at.is_some()).count();
    let synced_achievements = unified.len();
    let synced_at = crate::commands::games::core::unix_timestamp_to_iso(
        crate::commands::games::core::current_unix_timestamp(),
    );
    let game = if should_persist_to_native_cache {
        crate::commands::games::core::update_installed_game_cache(&game_id, move |game| {
            game.achievements =
                crate::commands::games::achievements::preserve_known_unlocks(unified, &game.achievements);
            game.achievements_synced_at = Some(synced_at);
            Ok(())
        })?
    } else {
        game.achievements =
            crate::commands::games::achievements::preserve_known_unlocks(unified, &game.achievements);
        game.achievements_synced_at = Some(synced_at);
        game
    };

    Ok(
        crate::commands::games::types::SyncGameAchievementsResponse {
            achievement_source: None,
            game_id,
            success: true,
            game,
            synced_achievements,
            unlocked_achievements,
            message: format!(
                "Xbox achievements synced: {}/{} unlocked",
                unlocked_achievements, synced_achievements
            ),
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_callback_url_from_ephemeral_loopback_address() {
        let address = SocketAddr::from(([127, 0, 0, 1], 49_152));

        assert_eq!(
            build_loopback_callback_url(address).unwrap(),
            "http://127.0.0.1:49152/oauth/xbox/callback"
        );
    }

    #[test]
    fn callback_url_rejects_non_loopback_addresses() {
        let address = SocketAddr::from(([192, 0, 2, 10], 49_152));

        assert!(build_loopback_callback_url(address).is_err());
    }

    #[test]
    fn filters_call_of_duty_hub_dlc_placeholders() {
        assert!(is_xbox_non_game_owned_item("BO7 DLC01 Game Stub 01"));
        assert!(is_xbox_non_game_owned_item(
            "BO7 DLC17 Standard Launch Tracker"
        ));
        assert!(is_xbox_non_game_owned_item(
            "BO7 DLC19 Game Pass Launch Tracker"
        ));
        assert!(is_xbox_non_game_owned_item("BO7 DLC56 Game Pass Pack 03"));
        assert!(!is_xbox_non_game_owned_item("Call of Duty®"));
        assert!(!is_xbox_non_game_owned_item("Call of Duty: Black Ops 7"));
        assert!(!is_xbox_non_game_owned_item("Garry's Mod"));
    }

    #[test]
    fn parses_exact_callback_path_and_matching_state() {
        let request = format!(
            "GET {XBOX_LOOPBACK_CALLBACK_PATH}?code=returned%2Bcode&state=expected-state&lc=1033 HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n"
        );

        assert_eq!(
            parse_oauth_callback_request(&request, "expected-state"),
            Ok("returned+code".to_string())
        );
    }

    #[test]
    fn rejects_callback_with_wrong_or_missing_state() {
        let wrong_state = format!(
            "GET {XBOX_LOOPBACK_CALLBACK_PATH}?code=returned-code&state=expected-statz HTTP/1.1\r\n\r\n"
        );
        let missing_state =
            format!("GET {XBOX_LOOPBACK_CALLBACK_PATH}?code=returned-code HTTP/1.1\r\n\r\n");

        assert_eq!(
            parse_oauth_callback_request(&wrong_state, "expected-state"),
            Err(OAuthCallbackError::StateMismatch)
        );
        assert_eq!(
            parse_oauth_callback_request(&missing_state, "expected-state"),
            Err(OAuthCallbackError::MissingState)
        );
    }

    #[test]
    fn rejects_callback_path_variants_and_duplicate_security_parameters() {
        let path_suffix = format!(
            "GET {XBOX_LOOPBACK_CALLBACK_PATH}/extra?code=returned-code&state=expected-state HTTP/1.1\r\n\r\n"
        );
        let duplicate_state = format!(
            "GET {XBOX_LOOPBACK_CALLBACK_PATH}?code=returned-code&state=expected-state&state=expected-state HTTP/1.1\r\n\r\n"
        );

        assert_eq!(
            parse_oauth_callback_request(&path_suffix, "expected-state"),
            Err(OAuthCallbackError::UnexpectedPath)
        );
        assert_eq!(
            parse_oauth_callback_request(&duplicate_state, "expected-state"),
            Err(OAuthCallbackError::DuplicateState)
        );
    }

    #[test]
    fn authorization_url_carries_state_and_s256_pkce() {
        let url = build_xbox_authorization_url("attempt-state", "pkce-challenge").unwrap();
        let url = reqwest::Url::parse(&url).unwrap();
        let query: HashMap<_, _> = url.query_pairs().into_owned().collect();

        assert_eq!(
            url.as_str().split('?').next(),
            Some(XBOX_AUTHORIZATION_ENDPOINT)
        );
        assert_eq!(
            query.get("redirect_uri").map(String::as_str),
            Some(XBOX_REDIRECT_URI)
        );
        assert_eq!(
            query.get("state").map(String::as_str),
            Some("attempt-state")
        );
        assert_eq!(
            query.get("code_challenge").map(String::as_str),
            Some("pkce-challenge")
        );
        assert_eq!(
            query.get("code_challenge_method").map(String::as_str),
            Some("S256")
        );
    }

    #[test]
    fn computes_rfc7636_s256_challenge() {
        assert_eq!(
            pkce_s256_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    fn test_title(title_id: &str, pfn: Option<&str>, name: Option<&str>) -> Title {
        Title {
            title_id: title_id.to_string(),
            pfn: pfn.map(str::to_string),
            name: name.map(str::to_string),
            item_type: Some("Game".to_string()),
            devices: Some(vec!["PC".to_string()]),
            title_history: None,
            display_image: None,
            stats: None,
        }
    }

    #[test]
    fn normalizes_titlehub_display_image_to_https() {
        let title: Title = serde_json::from_str(
            r#"{"titleId":"123","pfn":"Microsoft.Test_8wekyb3d8bbwe","name":"Test Game","type":"Game","devices":["PC"],"displayImage":"http://store-images.microsoft.com/test.png"}"#,
        )
        .unwrap();

        assert_eq!(
            titlehub_display_image_url(&title).as_deref(),
            Some("https://store-images.microsoft.com/test.png")
        );
    }

    #[test]
    fn ignores_non_string_and_null_titlehub_display_images() {
        for display_image in [
            serde_json::json!({ "url": "https://store-images.microsoft.com/object.png" }),
            serde_json::json!(42),
            serde_json::Value::Null,
        ] {
            let title: Title = serde_json::from_value(serde_json::json!({
                "titleId": "123",
                "pfn": "Microsoft.Test_8wekyb3d8bbwe",
                "name": "Test Game",
                "type": "Game",
                "devices": ["PC"],
                "displayImage": display_image,
            }))
            .expect("malformed optional displayImage should not reject the title");

            assert_eq!(title.display_image, None);
            assert_eq!(titlehub_display_image_url(&title), None);
        }
    }

    fn hints(values: &[&str]) -> HashSet<String> {
        values.iter().map(|value| value.to_lowercase()).collect()
    }

    #[test]
    fn normalizes_supported_game_pass_locales() {
        assert_eq!(normalize_game_pass_language(Some(" de-de ")), "de-DE");
        assert_eq!(
            normalize_game_pass_language(Some("zh-hans-cn")),
            "zh-Hans-CN"
        );
        assert_eq!(normalize_game_pass_language(Some("es-419")), "es-419");
        assert_eq!(normalize_game_pass_market(Some("de")), "DE");
        assert_eq!(normalize_game_pass_market(Some(" gb ")), "GB");
    }

    #[test]
    fn invalid_game_pass_locales_use_safe_fallbacks() {
        for language in [
            None,
            Some(""),
            Some("english"),
            Some("en_US"),
            Some("en--US"),
        ] {
            assert_eq!(
                normalize_game_pass_language(language),
                DEFAULT_GAME_PASS_LANGUAGE
            );
        }
        for market in [None, Some(""), Some("USA"), Some("D3"), Some("U$ ")] {
            assert_eq!(normalize_game_pass_market(market), DEFAULT_GAME_PASS_MARKET);
        }
    }

    #[test]
    fn parses_and_deduplicates_game_pass_sigl_product_ids() {
        let payload = r#"[
            {"siglId":"fdd9e2a7-0fee-49f6-ad69-4354098401ff","title":"All PC Games"},
            {"id":"9npdn9r45jx4"},
            {"id":" 9NPDN9R45JX4 "},
            {"id":"CFQ7TTC0KHS0"},
            {"id":"9NPDN9R45JX!"},
            {"id":"short"},
            {"id":42},
            {"id":null}
        ]"#;

        assert_eq!(
            parse_game_pass_catalog_ids(payload).unwrap(),
            vec!["9NPDN9R45JX4", "CFQ7TTC0KHS0"]
        );
    }

    #[test]
    fn rejects_sigl_payload_without_valid_product_ids() {
        let error = parse_game_pass_catalog_ids(
            r#"[{"title":"metadata"},{"id":"not-a-product"},{"id":null}]"#,
        )
        .unwrap_err();

        assert!(error.contains("no valid Microsoft Store product IDs"));
    }

    #[test]
    fn normalizes_catalog_asset_urls_to_https() {
        assert_eq!(
            normalize_catalog_asset_url(" //store-images.s-microsoft.com/poster ").as_deref(),
            Some("https://store-images.s-microsoft.com/poster")
        );
        assert_eq!(
            normalize_catalog_asset_url("HTTP://store-images.s-microsoft.com/logo").as_deref(),
            Some("https://store-images.s-microsoft.com/logo")
        );
        assert_eq!(
            normalize_catalog_asset_url("https://store-images.s-microsoft.com/box").as_deref(),
            Some("https://store-images.s-microsoft.com/box")
        );
        assert_eq!(normalize_catalog_asset_url("javascript:alert(1)"), None);
        assert_eq!(normalize_catalog_asset_url("//store images/poster"), None);
        assert_eq!(normalize_catalog_asset_url("/relative/poster"), None);
    }

    #[test]
    fn maps_display_catalog_product_with_poster_box_art_and_logo() {
        let mut products = parse_display_catalog_products(
            r#"{
                "Products": [{
                    "ProductId": "9npdn9r45jx4",
                    "LocalizedProperties": [{
                        "ProductTitle": "  1000xRESIST  ",
                        "Images": [
                            {"ImagePurpose":"BoxArt","Uri":"//store-images.s-microsoft.com/box"},
                            {"ImagePurpose":"Poster","Uri":"//store-images.s-microsoft.com/poster"},
                            {"ImagePurpose":"Logo","Uri":"http://store-images.s-microsoft.com/logo"}
                        ]
                    }]
                }]
            }"#,
        )
        .unwrap();

        let game = map_display_catalog_product(products.remove(0)).unwrap();
        assert_eq!(game.id, "xbox-9NPDN9R45JX4");
        assert_eq!(game.external_id.as_deref(), Some("9NPDN9R45JX4"));
        assert_eq!(game.title, "1000xRESIST");
        assert_eq!(
            game.cover_url.as_deref(),
            Some("https://store-images.s-microsoft.com/poster")
        );
        assert_eq!(
            game.logo_url.as_deref(),
            Some("https://store-images.s-microsoft.com/logo")
        );
        assert_eq!(game.icon_url, None);
        assert_eq!(game.playtime_minutes, None);
        assert_eq!(game.last_played_at, None);
        assert_eq!(game.cloud_gaming_url, None);
    }

    #[test]
    fn mapping_falls_back_to_valid_box_art_and_skips_malformed_leaf_values() {
        let mut products = parse_display_catalog_products(
            r#"{
                "products": [{
                    "productId": "CFQ7TTC0KHS0",
                    "localizedProperties": [{
                        "productTitle": "Game Preview",
                        "images": [
                            {"imagePurpose":"Poster","uri":"data:image/png;base64,bad"},
                            {"imagePurpose":"BoxArt","uri":"//store-images.s-microsoft.com/box-art"},
                            {"imagePurpose":42,"uri":false}
                        ]
                    }]
                }]
            }"#,
        )
        .unwrap();

        let game = map_display_catalog_product(products.remove(0)).unwrap();
        assert_eq!(
            game.cover_url.as_deref(),
            Some("https://store-images.s-microsoft.com/box-art")
        );
        assert_eq!(game.logo_url, None);
    }

    #[test]
    fn classifies_display_catalog_package_formats_conservatively() {
        let products = parse_display_catalog_products(
            r#"{
                "Products": [
                    {
                        "ProductId": "C3B1V55CDL0C",
                        "LocalizedProperties": [{"ProductTitle": "Console"}],
                        "DisplaySkuAvailabilities": [{
                            "Sku": {"Properties": {"Packages": [{"PackageFormat": "XVC"}]}}
                        }]
                    },
                    {
                        "ProductId": "9MXMZ39GVHPG",
                        "LocalizedProperties": [{"ProductTitle": "Windows"}],
                        "DisplaySkuAvailabilities": [{
                            "Sku": {"Properties": {"Packages": [
                                {"PackageFormat": "XVC"},
                                {"PackageFormat": "MSIXVC"}
                            ]}}
                        }]
                    },
                    {
                        "ProductId": "9NPDN9R45JX4",
                        "LocalizedProperties": [{"ProductTitle": "Metadata poor"}]
                    },
                    {
                        "ProductId": "9P8LR42PTRGJ",
                        "LocalizedProperties": [{"ProductTitle": "Malformed metadata"}],
                        "DisplaySkuAvailabilities": [{
                            "Sku": {"Properties": {"Packages": [
                                {"PackageFormat": "XVC"},
                                {"PackageFormat": 42}
                            ]}}
                        }]
                    }
                ]
            }"#,
        )
        .unwrap();

        assert_eq!(
            display_catalog_package_evidence(&products[0]),
            DisplayCatalogPackageEvidence::ExplicitConsoleOnly
        );
        assert_eq!(
            display_catalog_package_evidence(&products[1]),
            DisplayCatalogPackageEvidence::ExplicitWindows
        );
        assert_eq!(
            display_catalog_package_evidence(&products[2]),
            DisplayCatalogPackageEvidence::Unknown
        );
        assert_eq!(
            display_catalog_package_evidence(&products[3]),
            DisplayCatalogPackageEvidence::Unknown
        );
    }

    #[test]
    fn selects_pc_catalog_rows_without_dropping_unique_unknown_products() {
        let products = parse_display_catalog_products(
            r#"{
                "Products": [
                    {
                        "ProductId": "C3B1V55CDL0C",
                        "LocalizedProperties": [{"ProductTitle": "Brawlhalla"}],
                        "DisplaySkuAvailabilities": [{
                            "Sku": {"Properties": {"Packages": [{"PackageFormat": "XVC"}]}}
                        }]
                    },
                    {
                        "ProductId": "9MXMZ39GVHPG",
                        "LocalizedProperties": [{"ProductTitle": "Brawlhalla"}],
                        "DisplaySkuAvailabilities": [{
                            "Sku": {"Properties": {"Packages": [{"PackageFormat": "MSIXVC"}]}}
                        }]
                    },
                    {
                        "ProductId": "9NLFKBTNP2VJ",
                        "LocalizedProperties": [{"ProductTitle": "Watch Dogs®2"}]
                    },
                    {
                        "ProductId": "9PCKZH7M40CK",
                        "LocalizedProperties": [{"ProductTitle": "Watch Dogs®2 (Windows 11)"}],
                        "DisplaySkuAvailabilities": [{
                            "Sku": {"Properties": {"Packages": [{"PackageFormat": "MSIXVC"}]}}
                        }]
                    },
                    {
                        "ProductId": "9NPDN9R45JX4",
                        "LocalizedProperties": [{"ProductTitle": "Unique metadata-poor game"}]
                    },
                    {
                        "ProductId": "9NNM7PKZN3JF",
                        "LocalizedProperties": [{"ProductTitle": "Unknown duplicate"}]
                    },
                    {
                        "ProductId": "9NGLST31DG26",
                        "LocalizedProperties": [{"ProductTitle": "Unknown duplicate"}]
                    }
                ]
            }"#,
        )
        .unwrap();
        let candidates = products
            .into_iter()
            .filter_map(map_display_catalog_candidate)
            .collect::<Vec<_>>();

        let selection = select_pc_display_catalog_games(candidates);
        let product_ids = selection
            .games
            .iter()
            .filter_map(|game| game.external_id.as_deref())
            .collect::<Vec<_>>();

        assert_eq!(selection.excluded_console_only, 1);
        assert_eq!(selection.excluded_unknown_duplicates, 1);
        assert_eq!(
            product_ids,
            vec![
                "9MXMZ39GVHPG",
                "9PCKZH7M40CK",
                "9NPDN9R45JX4",
                "9NNM7PKZN3JF",
                "9NGLST31DG26"
            ]
        );
    }

    #[test]
    fn rejects_catalog_when_a_retried_display_batch_still_fails() {
        assert!(require_complete_display_catalog_batches(&[]).is_ok());

        let error = require_complete_display_catalog_batches(&[
            "display catalog batch 2/11 request failed: timeout | retry failed: timeout"
                .to_string(),
        ])
        .unwrap_err();

        assert!(error.contains("remained incomplete after one retry"));
        assert!(error.contains("display catalog batch 2/11"));
    }

    #[test]
    fn cleans_xbox_title_suffixes_for_matching() {
        assert_eq!(
            clean_xbox_title_name("Forza Horizon 5 (PC)"),
            "Forza Horizon 5"
        );
        assert_eq!(
            clean_xbox_title_name("Halo Infinite - Windows 10"),
            "Halo Infinite"
        );
        assert_eq!(
            clean_xbox_title_name("Psychonauts 2 for Windows 10"),
            "Psychonauts 2"
        );
    }

    #[test]
    fn title_hint_matches_numeric_title_id() {
        let title = test_title(
            "123456789",
            Some("Microsoft.Test_8wekyb3d8bbwe"),
            Some("Test"),
        );

        assert!(title_matches_local_hint(&title, &hints(&["123456789"])));
    }

    #[test]
    fn title_hint_matches_package_family_name_inside_local_id() {
        let title = test_title(
            "123456789",
            Some("Microsoft.ForzaHorizon5_8wekyb3d8bbwe"),
            Some("Forza Horizon 5"),
        );

        assert!(title_matches_local_hint(
            &title,
            &hints(&["xbox-microsoft.forzahorizon5_8wekyb3d8bbwe"])
        ));
    }

    #[test]
    fn title_hint_matches_cleaned_game_name() {
        let title = test_title("123456789", None, Some("Forza Horizon 5 (PC)"));

        assert!(title_matches_local_hint(
            &title,
            &hints(&["Forza Horizon 5"])
        ));
    }

    #[test]
    fn title_hint_rejects_unrelated_game() {
        let title = test_title(
            "123456789",
            Some("Microsoft.ForzaHorizon5_8wekyb3d8bbwe"),
            Some("Forza Horizon 5"),
        );

        assert!(!title_matches_local_hint(
            &title,
            &hints(&["Halo Infinite"])
        ));
    }

    #[test]
    fn parses_exact_xbox_aumid_from_manifest_output() {
        let pfn = "Microsoft.Test_8wekyb3d8bbwe";
        assert_eq!(
            parse_resolved_xbox_aumid(pfn, "Microsoft.Test_8wekyb3d8bbwe!Game\n").unwrap(),
            "Microsoft.Test_8wekyb3d8bbwe!Game"
        );
    }

    #[test]
    fn refuses_to_guess_between_multiple_xbox_applications() {
        let pfn = "Microsoft.Test_8wekyb3d8bbwe";
        let error = parse_resolved_xbox_aumid(
            pfn,
            "Microsoft.Test_8wekyb3d8bbwe!Game\nMicrosoft.Test_8wekyb3d8bbwe!Editor\n",
        )
        .unwrap_err();

        assert!(error.contains("multiple launchable applications"));
    }
}
