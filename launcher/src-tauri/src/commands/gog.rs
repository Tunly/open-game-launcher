use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::Emitter;
use tokio::sync::watch;

// ============================================================================
// Constants
// ============================================================================

const GOG_CLIENT_ID: &str = "46899977096215655";
const GOG_CLIENT_SECRET: &str = "9d85c43b1482497dbbce61f6e4aa173a433796eeae2ca8c5f6129f2dc4de46d9";
/// Registered redirect for the public GOG Galaxy OAuth client (Lutris, Minigalaxy, etc.).
const GOG_REDIRECT_URI: &str = "https://embed.gog.com/on_login_success?origin=client";
const GOG_REDIRECT_URI_ENCODED: &str =
    "https%3A%2F%2Fembed.gog.com%2Fon_login_success%3Forigin%3Dclient";

pub fn gog_auth_url() -> String {
    format!(
        "https://auth.gog.com/auth?client_id={GOG_CLIENT_ID}&redirect_uri={GOG_REDIRECT_URI_ENCODED}&response_type=code&layout=client2"
    )
}
const GOG_TOKEN_URL: &str = "https://auth.gog.com/token";
const GOG_EMBED_BASE: &str = "https://embed.gog.com";
const GOG_API_BASE: &str = "https://api.gog.com";

// ============================================================================
// Token Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GogToken {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: u64,
    pub user_id: String,
}

#[derive(Debug, Deserialize)]
struct GogTokenResponse {
    access_token: String,
    refresh_token: String,
    expires_in: u64,
    user_id: String,
    #[serde(default)]
    error: Option<String>,
}

// ============================================================================
// API Response Types
// ============================================================================

#[derive(Debug, Deserialize)]
struct GogUserData {
    #[serde(default)]
    owned: Vec<u64>,
    #[serde(default)]
    games: Vec<u64>,
}

#[derive(Debug, Deserialize)]
struct GogFilteredProductsPage {
    #[serde(default)]
    products: Vec<GogCatalogProduct>,
    #[serde(default)]
    page: u32,
    #[serde(default)]
    total_pages: u32,
    #[serde(default, rename = "totalPages")]
    total_pages_camel: u32,
}

#[derive(Debug, Deserialize)]
struct GogCatalogProduct {
    id: u64,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    image: Option<String>,
    #[serde(default)]
    is_game: bool,
    #[serde(default, rename = "isGame")]
    is_game_camel: bool,
    #[serde(default)]
    is_movie: bool,
    #[serde(default, rename = "isMovie")]
    is_movie_camel: bool,
}

fn normalize_gog_image_url(url: Option<String>) -> Option<String> {
    url.map(|value| {
        if value.starts_with("//") {
            format!("https:{value}")
        } else {
            value
        }
    })
}

fn gog_catalog_product_to_owned(product: GogCatalogProduct) -> Option<super::system::OwnedGame> {
    let is_game = product.is_game || product.is_game_camel;
    let is_movie = product.is_movie || product.is_movie_camel;
    if is_movie || (!is_game && product.title.is_none()) {
        return None;
    }

    let title = product
        .title
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| format!("GOG Game #{}", product.id));
    let cover_url = normalize_gog_image_url(product.image);

    Some(super::system::OwnedGame {
        id: format!("gog-owned-{}", product.id),
        external_id: Some(product.id.to_string()),
        title,
        description: format!("GOG game (Owned). ID: {}", product.id),
        cover_url: cover_url.clone(),
        logo_url: cover_url.clone(),
        icon_url: cover_url,
        playtime_minutes: 0,
        last_played_at: None,
        cloud_gaming_url: None,
    })
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct GogProductDetail {
    title: Option<String>,
    #[serde(default)]
    images: Option<GogProductImages>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    developer: Option<String>,
    #[serde(default)]
    publisher: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct GogProductImages {
    #[serde(default)]
    logo2x: Option<String>,
    #[serde(default)]
    icon: Option<String>,
    #[serde(default)]
    #[serde(rename = "sidebarIcon")]
    sidebar_icon: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct GogGameDetails {
    #[serde(default)]
    downloadables: Option<Vec<GogDownloadable>>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct GogDownloadable {
    id: u64,
    name: Option<String>,
    #[serde(default)]
    os: Option<String>,
    #[serde(default)]
    language: Option<String>,
    #[serde(default)]
    version: Option<String>,
    total_size: Option<u64>,
    #[serde(default)]
    files: Option<Vec<GogInstallerFile>>,
}

#[derive(Debug, Deserialize)]
struct GogInstallerFile {
    id: String,
    name: Option<String>,
    size: Option<u64>,
    checksum: Option<String>,
    #[serde(default)]
    chunks: Option<Vec<GogChunk>>,
}

#[derive(Debug, Deserialize)]
struct GogChunk {
    id: String,
    #[serde(default)]
    #[serde(rename = "byteOffset")]
    byte_offset: Option<u64>,
    #[serde(default)]
    #[serde(rename = "byteSize")]
    byte_size: Option<u64>,
    checksum: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GogDownloadInfo {
    #[serde(default)]
    downloader: Option<GogDownloaderInfo>,
}

#[derive(Debug, Deserialize)]
struct GogDownloaderInfo {
    #[serde(default)]
    url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GogGameBuilds {
    builds: Vec<GogBuild>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct GogBuild {
    version_number: String,
    build_id: String,
    #[serde(default)]
    pubdate: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GogInstallersResponse {
    installers: Vec<GogInstaller>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct GogInstaller {
    id: String,
    name: String,
    os: String,
    language: String,
    #[serde(default)]
    version: Option<String>,
    total_size: u64,
    files: Vec<GogInstallerFile>,
    #[serde(default)]
    downloader: Option<GogDownloaderInfo>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct GogCloudSaves {
    #[serde(default)]
    items: Option<Vec<GogCloudSaveItem>>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct GogCloudSaveItem {
    #[serde(default)]
    path: Option<String>,
    #[serde(default)]
    timestamp: Option<u64>,
    #[serde(default)]
    size: Option<u64>,
}

// ============================================================================
// Token Storage
// ============================================================================

fn gog_token_path() -> PathBuf {
    dirs::config_dir()
        .or_else(|| dirs::data_local_dir())
        .unwrap_or_else(|| PathBuf::from("."))
        .join("open-game-launcher")
        .join("gog_auth.json")
}

pub fn load_gog_token() -> Option<GogToken> {
    let path = gog_token_path();
    let contents = fs::read_to_string(path).ok()?;
    serde_json::from_str(&contents).ok()
}

pub fn save_gog_token(token: &GogToken) -> Result<(), String> {
    let path = gog_token_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create GOG config dir: {e}"))?;
    }
    let json = serde_json::to_string_pretty(token)
        .map_err(|e| format!("Failed to serialize GOG token: {e}"))?;
    fs::write(path, json).map_err(|e| format!("Failed to write GOG token: {e}"))
}

fn delete_gog_token() {
    let _ = fs::remove_file(gog_token_path());
}

// ============================================================================
// Token Refresh
// ============================================================================

async fn ensure_valid_token(token: &mut GogToken) -> Result<(), String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Refresh if less than 5 minutes until expiry
    if token.expires_at > 0 && token.expires_at > now + 300 {
        return Ok(());
    }

    let client = Client::new();
    let params = [
        ("client_id", GOG_CLIENT_ID),
        ("client_secret", GOG_CLIENT_SECRET),
        ("grant_type", "refresh_token"),
        ("refresh_token", &token.refresh_token),
    ];

    let resp = client
        .post(GOG_TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("GOG token refresh request failed: {e}"))?;

    if !resp.status().is_success() {
        delete_gog_token();
        return Err(format!(
            "GOG token refresh failed with status: {}",
            resp.status()
        ));
    }

    let data: GogTokenResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse GOG token refresh response: {e}"))?;

    if data.error.is_some() {
        delete_gog_token();
        return Err(format!("GOG token refresh error: {:?}", data.error));
    }

    let new_now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    token.access_token = data.access_token;
    token.refresh_token = data.refresh_token;
    token.expires_at = new_now + data.expires_in;
    if !data.user_id.is_empty() {
        token.user_id = data.user_id;
    }

    save_gog_token(token)?;
    Ok(())
}

// ============================================================================
// GOG API Client
// ============================================================================

async fn gog_api_get(
    client: &Client,
    token: &mut GogToken,
    url: &str,
) -> Result<reqwest::Response, String> {
    ensure_valid_token(token).await?;
    let resp = client
        .get(url)
        .header("Authorization", format!("Bearer {}", token.access_token))
        .send()
        .await
        .map_err(|e| format!("GOG API request failed: {e}"))?;

    if resp.status().as_u16() == 401 {
        // Token might be invalid even after refresh attempt
        delete_gog_token();
        return Err("GOG token expired and refresh failed. Please re-login.".to_string());
    }

    Ok(resp)
}

fn extract_oauth_code_from_url(url: &str) -> Option<String> {
    let query = url.split_once('?')?.1;
    for pair in query.split('&') {
        let (key, value) = pair.split_once('=')?;
        if key == "code" && !value.is_empty() {
            return Some(value.to_string());
        }
    }
    None
}

fn is_gog_login_success_url(url: &str) -> bool {
    url.contains("on_login_success")
}

// ============================================================================
// Tauri Commands
// ============================================================================

#[tauri::command]
pub async fn open_gog_login_window(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;

    if let Some(existing) = app.get_webview_window("gog-login") {
        let _ = existing.close();
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }

    let auth_url = gog_auth_url();
    let app_clone = app.clone();

    let _window = tauri::WebviewWindowBuilder::new(
        &app,
        "gog-login",
        tauri::WebviewUrl::External(
            auth_url
                .parse()
                .map_err(|error| format!("Failed to parse GOG login URL: {error}"))?,
        ),
    )
    .title("GOG Login")
    .inner_size(520.0, 720.0)
    .center()
    .resizable(true)
    .on_navigation(move |url| {
        let url_str = url.to_string();
        if !is_gog_login_success_url(&url_str) {
            return true;
        }

        if let Some(code) = extract_oauth_code_from_url(&url_str) {
            println!("[GOG Login] Extracted code from redirect.");
            let _ = app_clone.emit("gog_login_code", code);
            if let Some(window) = app_clone.get_webview_window("gog-login") {
                let _ = window.close();
            }
            return false;
        }

        true
    })
    .build()
    .map_err(|error| format!("Failed to create GOG login window: {error}"))?;

    Ok(())
}

#[tauri::command]
pub async fn gog_exchange_code(code: String) -> Result<GogToken, String> {
    let client = Client::new();
    let params = [
        ("client_id", GOG_CLIENT_ID),
        ("client_secret", GOG_CLIENT_SECRET),
        ("grant_type", "authorization_code"),
        ("code", &code),
        ("redirect_uri", GOG_REDIRECT_URI),
    ];

    let resp = client
        .post(GOG_TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("GOG token exchange request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!(
            "GOG token exchange failed with status: {}",
            resp.status()
        ));
    }

    let data: GogTokenResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse GOG token exchange response: {e}"))?;

    if data.error.is_some() {
        return Err(format!("GOG token exchange error: {:?}", data.error));
    }

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let token = GogToken {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: now + data.expires_in,
        user_id: data.user_id,
    };

    save_gog_token(&token)?;
    Ok(token)
}

#[tauri::command]
pub async fn gog_refresh_token_command() -> Result<GogToken, String> {
    let mut token = load_gog_token().ok_or_else(|| "No GOG token found. Please login first.".to_string())?;
    ensure_valid_token(&mut token).await?;
    Ok(token)
}

#[tauri::command]
pub async fn gog_get_token() -> Result<Option<GogToken>, String> {
    Ok(load_gog_token())
}

#[tauri::command]
pub async fn gog_logout() -> Result<(), String> {
    delete_gog_token();
    Ok(())
}

async fn fetch_gog_owned_games_from_catalog(
    client: &Client,
    token: &mut GogToken,
) -> Result<Vec<super::system::OwnedGame>, String> {
    let mut games = Vec::new();
    let mut page = 1u32;
    let mut total_pages = 1u32;

    while page <= total_pages {
        let url = format!(
            "{GOG_EMBED_BASE}/account/getFilteredProducts?mediaType=1&page={page}&sortBy=title"
        );
        let resp = gog_api_get(client, token, &url).await?;
        if !resp.status().is_success() {
            return Err(format!(
                "GOG library catalog returned status {}",
                resp.status()
            ));
        }

        let catalog: GogFilteredProductsPage = resp
            .json()
            .await
            .map_err(|error| format!("Failed to parse GOG library catalog: {error}"))?;

        total_pages = catalog
            .total_pages
            .max(catalog.total_pages_camel)
            .max(1);
        if catalog.products.is_empty() {
            break;
        }

        for product in catalog.products {
            if let Some(owned_game) = gog_catalog_product_to_owned(product) {
                games.push(owned_game);
            }
        }

        page += 1;
    }

    games.sort_by(|left, right| left.title.to_lowercase().cmp(&right.title.to_lowercase()));
    games.dedup_by(|left, right| left.id == right.id);

    Ok(games)
}

async fn fetch_gog_owned_games_from_user_data(
    client: &Client,
    token: &mut GogToken,
) -> Result<Vec<super::system::OwnedGame>, String> {
    let data_resp = gog_api_get(client, token, &format!("{GOG_EMBED_BASE}/user/data/games")).await?;
    if !data_resp.status().is_success() {
        return Err(format!(
            "GOG user data returned status {}",
            data_resp.status()
        ));
    }

    let data: GogUserData = data_resp
        .json()
        .await
        .map_err(|error| format!("Failed to parse GOG user data: {error}"))?;

    let product_ids = if !data.owned.is_empty() {
        data.owned
    } else {
        data.games
    };

    let mut games = Vec::new();
    for id in product_ids {
        let detail_url = format!("{GOG_API_BASE}/products/{id}?locale=en-US");
        let Ok(resp) = gog_api_get(client, token, &detail_url).await else {
            continue;
        };
        if !resp.status().is_success() {
            continue;
        }
        let Ok(detail) = resp.json::<GogProductDetail>().await else {
            continue;
        };

        let title = detail
            .title
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| format!("GOG Game #{id}"));
        let logo2x = detail
            .images
            .as_ref()
            .and_then(|images| images.logo2x.clone())
            .or_else(|| {
                detail
                    .images
                    .as_ref()
                    .and_then(|images| images.sidebar_icon.clone())
            });
        let icon = detail
            .images
            .as_ref()
            .and_then(|images| images.icon.clone())
            .or(logo2x.clone());
        let cover_url = normalize_gog_image_url(logo2x);

        games.push(super::system::OwnedGame {
            id: format!("gog-owned-{id}"),
            external_id: Some(id.to_string()),
            title,
            description: detail
                .description
                .unwrap_or_else(|| format!("GOG game (Owned). ID: {id}")),
            cover_url: cover_url.clone(),
            logo_url: cover_url.clone(),
            icon_url: normalize_gog_image_url(icon),
            playtime_minutes: 0,
            last_played_at: None,
            cloud_gaming_url: None,
        });
    }

    Ok(games)
}

#[tauri::command]
pub async fn gog_fetch_owned_games() -> Result<Vec<super::system::OwnedGame>, String> {
    let mut token = load_gog_token().ok_or_else(|| "No GOG token found. Please login first.".to_string())?;
    let client = Client::new();

    match fetch_gog_owned_games_from_catalog(&client, &mut token).await {
        Ok(games) if !games.is_empty() => {
            println!("[GOG] Loaded {} owned games from catalog.", games.len());
            return Ok(games);
        }
        Ok(_) => {
            println!("[GOG] Catalog returned no games, falling back to user/data/games.");
        }
        Err(error) => {
            println!("[GOG] Catalog fetch failed ({error}), falling back to user/data/games.");
        }
    }

    let games = fetch_gog_owned_games_from_user_data(&client, &mut token).await?;
    println!("[GOG] Loaded {} owned games from user data.", games.len());
    Ok(games)
}

// ============================================================================
// Download Info
// ============================================================================

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GogDownloadInfoPayload {
    pub game_id: String,
    pub title: String,
    pub installer_id: String,
    pub version: String,
    pub total_size: u64,
    pub files: Vec<GogInstallerFilePayload>,
    pub download_url: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GogInstallerFilePayload {
    pub id: String,
    pub name: String,
    pub size: u64,
    pub checksum: String,
    pub chunks: Vec<GogChunkPayload>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GogChunkPayload {
    pub id: String,
    pub byte_offset: u64,
    pub byte_size: u64,
    pub checksum: String,
}

#[tauri::command]
pub async fn gog_get_download_info(
    gog_id: String,
    platform: Option<String>,
) -> Result<GogDownloadInfoPayload, String> {
    let mut token = load_gog_token().ok_or_else(|| "No GOG token found. Please login first.".to_string())?;
    let client = Client::new();
    let platform = platform.unwrap_or_else(|| detect_platform());

    // Step 1: Get available builds
    let builds_url = format!("{GOG_EMBED_BASE}/games/{gog_id}/builds?os={platform}");
    let builds_resp = gog_api_get(&client, &mut token, &builds_url).await?;

    if !builds_resp.status().is_success() {
        return Err(format!(
            "GOG builds request failed with status: {}",
            builds_resp.status()
        ));
    }

    let builds_data: GogGameBuilds = builds_resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse GOG builds: {e}"))?;

    let latest_build = builds_data
        .builds
        .into_iter()
        .next()
        .ok_or_else(|| "No builds available for this game on this platform.".to_string())?;

    // Step 2: Get installer details for this build
    let installers_url = format!(
        "{GOG_EMBED_BASE}/games/{gog_id}/builds/{build_id}/installers?os={platform}",
        build_id = latest_build.build_id
    );
    let installers_resp = gog_api_get(&client, &mut token, &installers_url).await?;

    if !installers_resp.status().is_success() {
        return Err(format!(
            "GOG installers request failed with status: {}",
            installers_resp.status()
        ));
    }

    let installers_data: GogInstallersResponse = installers_resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse GOG installers: {e}"))?;

    let installer = installers_data
        .installers
        .iter()
        .find(|i| i.os.eq_ignore_ascii_case(&platform))
        .or_else(|| installers_data.installers.iter().next())
        .ok_or_else(|| "No matching installer found.".to_string())?;

    // Step 3: Get download URL for the first file
    let download_url = installer.files.first().and_then(|f| {
        let file_id = &f.id;
        let url = format!(
            "{GOG_EMBED_BASE}/games/{gog_id}/builds/{build_id}/installers/{installer_id}/{file_id}",
            build_id = latest_build.build_id,
            installer_id = installer.id
        );
        Some(url)
    });

    let files_payload: Vec<GogInstallerFilePayload> = installer
        .files
        .iter()
        .map(|f| GogInstallerFilePayload {
            id: f.id.clone(),
            name: f.name.clone().unwrap_or_else(|| f.id.clone()),
            size: f.size.unwrap_or(0),
            checksum: f.checksum.clone().unwrap_or_default(),
            chunks: f
                .chunks
                .as_ref()
                .map(|chunks| {
                    chunks
                        .iter()
                        .map(|c| GogChunkPayload {
                            id: c.id.clone(),
                            byte_offset: c.byte_offset.unwrap_or(0),
                            byte_size: c.byte_size.unwrap_or(0),
                            checksum: c.checksum.clone().unwrap_or_default(),
                        })
                        .collect()
                })
                .unwrap_or_default(),
        })
        .collect();

    // Resolve the actual CDN download URL
    let mut resolved_url = None;
    if let Some(ref info_url) = download_url {
        match gog_api_get(&client, &mut token, info_url).await {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(info) = resp.json::<GogDownloadInfo>().await {
                    resolved_url = info.downloader.and_then(|d| d.url);
                }
            }
            _ => {}
        }
    }

    // Get game title from product API
    let title = {
        let detail_url = format!("{GOG_API_BASE}/products/{gog_id}");
        match gog_api_get(&client, &mut token, &detail_url).await {
            Ok(resp) if resp.status().is_success() => {
                resp.json::<GogProductDetail>()
                    .await
                    .ok()
                    .and_then(|d| d.title)
                    .unwrap_or_else(|| format!("GOG Game #{gog_id}"))
            }
            _ => format!("GOG Game #{gog_id}"),
        }
    };

    Ok(GogDownloadInfoPayload {
        game_id: gog_id,
        title,
        installer_id: installer.id.clone(),
        version: installer.version.clone().unwrap_or_else(|| latest_build.version_number.clone()),
        total_size: installer.total_size,
        files: files_payload,
        download_url: resolved_url,
    })
}

// ============================================================================
// GOG Download Manager
// ============================================================================

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct GogDownloadProgress {
    pub game_id: String,
    pub file_name: String,
    pub progress: u32,
    pub speed: String,
    pub status: String,
    pub eta: u32,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
}

#[allow(dead_code)]
struct GogActiveDownload {
    title: String,
    progress: u32,
    speed: String,
    status: String,
    eta: u32,
    paused: bool,
    cancelled: bool,
    pause_tx: watch::Sender<bool>,
    cancel_tx: watch::Sender<bool>,
}

type GogDownloadMap = Arc<Mutex<HashMap<String, GogActiveDownload>>>;

fn get_gog_download_manager() -> &'static GogDownloadMap {
    static MANAGER: OnceLock<GogDownloadMap> = OnceLock::new();
    MANAGER.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

use std::collections::HashMap;

#[tauri::command]
pub async fn gog_start_download(
    app: tauri::AppHandle,
    gog_id: String,
    install_path: Option<String>,
) -> Result<super::downloads::StartDownloadResponse, String> {
    let mut token = load_gog_token().ok_or_else(|| "No GOG token found. Please login first.".to_string())?;

    // Get download info
    let download_info = gog_get_download_info(gog_id.clone(), None).await?;

    let game_id = format!("gog-{gog_id}");
    let download_id = format!("download-{game_id}");

    // Check if already downloading
    {
        let map = get_gog_download_manager();
        let guard = map.lock()
        .map_err(|error| format!("GOG manager lock poisoned: {error}"))?;
        if guard.contains_key(&game_id) {
            return Ok(super::downloads::StartDownloadResponse {
                game_id: game_id.clone(),
                download_id: download_id.clone(),
                status: super::downloads::DownloadStartStatus::Started,
                message: "Download is already queued.".to_string(),
            });
        }
    }

    // Determine install directory
    let install_dir = install_path
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            dirs::data_local_dir()
                .or_else(dirs::data_dir)
                .unwrap_or_else(|| PathBuf::from("."))
                .join("open-game-launcher")
                .join("games")
                .join(&game_id)
        });

    fs::create_dir_all(&install_dir)
        .map_err(|e| format!("Failed to create install directory: {e}"))?;

    let (pause_tx, pause_rx) = watch::channel(false);
    let (cancel_tx, cancel_rx) = watch::channel(false);

    {
        let map = get_gog_download_manager();
        let mut guard = map.lock()
        .map_err(|error| format!("GOG manager lock poisoned: {error}"))?;
        guard.insert(
            game_id.clone(),
            GogActiveDownload {
                title: download_info.title.clone(),
                progress: 0,
                speed: "Waiting...".to_string(),
                status: "downloading".to_string(),
                eta: 0,
                paused: false,
                cancelled: false,
                pause_tx,
                cancel_tx,
            },
        );
    }

    let app_clone = app.clone();
    let game_id_clone = game_id.clone();
    let title_clone = download_info.title.clone();
    let install_dir_clone = install_dir.clone();

    let download_info_clone = download_info.clone();
    let title_for_response = download_info.title.clone();

    tokio::spawn(async move {
        let result = download_gog_game_files(
            &app_clone,
            &game_id_clone,
            &title_clone,
            &install_dir_clone,
            &download_info_clone,
            &mut token,
            &pause_rx,
            &cancel_rx,
        )
        .await;

        match result {
            Ok(()) => {
                // Write manifest
                let manifest = serde_json::json!({
                    "gameId": game_id_clone,
                    "title": title_clone,
                    "gogId": gog_id,
                    "version": download_info.version,
                    "managedBy": "OG-Launcher",
                    "managedByGog": true
                });
                if let Ok(contents) = serde_json::to_string_pretty(&manifest) {
                    let _ = fs::write(install_dir_clone.join("og-manifest.json"), contents);
                }

                // Update installed games cache
                update_installed_games_cache(&game_id_clone, &title_clone, &install_dir_clone);

                let _ = app_clone.emit(
                    "library_inventory_changed",
                    serde_json::json!({
                        "reason": "gog_download_completed",
                        "gameCount": 0
                    }),
                );

                update_gog_download_status(&game_id_clone, "completed", "Done", 100, 0);
                emit_gog_download_progress(&app_clone, &game_id_clone, &title_clone, 100, "Complete", "completed", 0);
            }
            Err(e) => {
                eprintln!("[GOG Download] Failed: {e}");
                update_gog_download_status(&game_id_clone, "error", &e, 0, 0);
                emit_gog_download_progress(&app_clone, &game_id_clone, &title_clone, 0, "Error", "error", 0);
            }
        }

        // Cleanup after delay
        tokio::time::sleep(Duration::from_secs(3)).await;
        if let Ok(mut guard) = get_gog_download_manager().lock() {
            guard.remove(&game_id_clone);
        }
    });

    Ok(super::downloads::StartDownloadResponse {
        game_id,
        download_id,
        status: super::downloads::DownloadStartStatus::Started,
        message: format!("GOG download started for {}.", title_for_response),
    })
}

async fn download_gog_game_files(
    app: &tauri::AppHandle,
    game_id: &str,
    title: &str,
    install_dir: &PathBuf,
    download_info: &GogDownloadInfoPayload,
    token: &mut GogToken,
    pause_rx: &watch::Receiver<bool>,
    cancel_rx: &watch::Receiver<bool>,
) -> Result<(), String> {
    let client = Client::new();

    for file in &download_info.files {
        let file_path = install_dir.join(&file.name);
        let mut downloaded: u64 = 0;

        // Check if file already exists with correct size (resume support)
        if let Ok(metadata) = fs::metadata(&file_path) {
            downloaded = metadata.len();
            if downloaded >= file.size {
                continue; // File already fully downloaded
            }
        }

        for chunk in &file.chunks {
            // Check cancellation
            if *cancel_rx.borrow() {
                return Err("Download cancelled.".to_string());
            }

            // Handle pause
            while *pause_rx.borrow() {
                update_gog_download_status(game_id, "paused", "Paused", 0, 0);
                emit_gog_download_progress(app, game_id, title, 0, "Paused", "paused", 0);
                tokio::time::sleep(Duration::from_millis(200)).await;
                if *cancel_rx.borrow() {
                    return Err("Download cancelled.".to_string());
                }
            }

            // Get chunk download URL
            let chunk_url = format!(
                "{GOG_EMBED_BASE}/games/{gog_id}/builds/{build_id}/installers/{installer_id}/{file_id}/{chunk_id}",
                gog_id = download_info.game_id,
                build_id = "", // Will be resolved via API
                installer_id = download_info.installer_id,
                file_id = file.id,
                chunk_id = chunk.id,
            );

            // Try to resolve the actual download URL via the GOG API
            let resolved_url = resolve_chunk_url(token, &download_info.game_id, &download_info.installer_id, &file.id, &chunk.id).await;

            let url = resolved_url.unwrap_or(chunk_url);

            // Download the chunk
            let resp = client
                .get(&url)
                .header("Authorization", format!("Bearer {}", token.access_token))
                .send()
                .await
                .map_err(|e| format!("Chunk download request failed: {e}"))?;

            if !resp.status().is_success() {
                return Err(format!("Chunk download failed with status: {}", resp.status()));
            }

            let _total_chunk_size = chunk.byte_size;
            let mut _chunk_downloaded: u64 = 0;
            let mut last_update = Instant::now();
            let mut bytes_since_last_update: u64 = 0;

            let mut body = resp.bytes_stream();
            use futures_util::StreamExt;

            // Open or create the file for this chunk
            use std::io::Write;
            let mut file_handle = fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&file_path)
                .map_err(|e| format!("Failed to open file for writing: {e}"))?;

            while let Some(item) = body.next().await {
                if *cancel_rx.borrow() {
                    return Err("Download cancelled.".to_string());
                }

                while *pause_rx.borrow() {
                    tokio::time::sleep(Duration::from_millis(200)).await;
                    if *cancel_rx.borrow() {
                        return Err("Download cancelled.".to_string());
                    }
                }

                let chunk_data = match item {
                    Ok(c) => c,
                    Err(e) => return Err(format!("Download stream error: {e}")),
                };

                file_handle
                    .write_all(&chunk_data)
                    .map_err(|e| format!("File write error: {e}"))?;

                _chunk_downloaded += chunk_data.len() as u64;
                downloaded += chunk_data.len() as u64;
                bytes_since_last_update += chunk_data.len() as u64;

                let now = Instant::now();
                let elapsed_ms = now.duration_since(last_update).as_millis();
                if elapsed_ms >= 300 {
                    let total_size = download_info.files.iter().map(|f| f.size).sum::<u64>();
                    let progress = if total_size > 0 {
                        ((downloaded as f64 / total_size as f64) * 100.0) as u32
                    } else {
                        0
                    };
                    let speed_bytes_per_sec =
                        (bytes_since_last_update as f64) / (elapsed_ms as f64 / 1000.0);
                    let speed_mb_sec = speed_bytes_per_sec / (1024.0 * 1024.0);
                    let speed_str = format!("{:.1} MB/s", speed_mb_sec);

                    let remaining_bytes = total_size.saturating_sub(downloaded);
                    let eta = if speed_bytes_per_sec > 0.0 {
                        (remaining_bytes as f64 / speed_bytes_per_sec) as u32
                    } else {
                        999
                    };

                    update_gog_download_status(game_id, "downloading", &speed_str, progress, eta);
                    emit_gog_download_progress(app, game_id, title, progress, &speed_str, "downloading", eta);

                    last_update = now;
                    bytes_since_last_update = 0;
                }
            }

            // Verify chunk checksum if available
            if !chunk.checksum.is_empty() {
                // Note: checksum verification would require reading back the file
                // For now we trust the CDN integrity
            }
        }
    }

    Ok(())
}

async fn resolve_chunk_url(
    token: &mut GogToken,
    gog_id: &str,
    installer_id: &str,
    file_id: &str,
    chunk_id: &str,
) -> Option<String> {
    let client = Client::new();

    // First get the builds to find the build_id
    let platform = detect_platform();
    let builds_url = format!("{GOG_EMBED_BASE}/games/{gog_id}/builds?os={platform}");
    let builds_resp = gog_api_get(&client, token, &builds_url).await.ok()?;
    if !builds_resp.status().is_success() {
        return None;
    }
    let builds: GogGameBuilds = builds_resp.json().await.ok()?;
    let build = builds.builds.into_iter().next()?;

    // Get the download info for this specific file
    let info_url = format!(
        "{GOG_EMBED_BASE}/games/{gog_id}/builds/{build_id}/installers/{installer_id}/{file_id}/{chunk_id}",
        build_id = build.build_id
    );
    let info_resp = gog_api_get(&client, token, &info_url).await.ok()?;
    if !info_resp.status().is_success() {
        return None;
    }
    let info: GogDownloadInfo = info_resp.json().await.ok()?;
    info.downloader?.url
}

fn detect_platform() -> String {
    if cfg!(target_os = "windows") {
        "windows".to_string()
    } else if cfg!(target_os = "linux") {
        "linux".to_string()
    } else if cfg!(target_os = "macos") {
        "osx".to_string()
    } else {
        "windows".to_string()
    }
}

// ============================================================================
// GOG Download Status Helpers
// ============================================================================

fn update_gog_download_status(game_id: &str, status: &str, speed: &str, progress: u32, eta: u32) {
    let Ok(mut guard) = get_gog_download_manager().lock() else {
        return;
    };
    if let Some(dl) = guard.get_mut(game_id) {
        dl.status = status.to_string();
        dl.speed = speed.to_string();
        dl.progress = progress;
        dl.eta = eta;
    }
}

pub(crate) fn emit_gog_download_progress(
    app: &tauri::AppHandle,
    game_id: &str,
    title: &str,
    progress: u32,
    speed: &str,
    status: &str,
    eta: u32,
) {
    let payload = super::downloads::DownloadItemPayload {
        id: format!("download-{game_id}"),
        game_id: game_id.to_string(),
        title: title.to_string(),
        progress,
        speed: speed.to_string(),
        status: status.to_string(),
        eta,
        platform: "GOG".to_string(),
    };
    let _ = app.emit("download_progress", payload);
}

// ============================================================================
// Installed Games Cache Update
// ============================================================================

fn update_installed_games_cache(game_id: &str, title: &str, install_dir: &PathBuf) {
    let cache_path = dirs::data_local_dir()
        .or_else(dirs::data_dir)
        .map(|d| d.join("open-game-launcher").join("installed-games.json"));

    if let Some(path) = cache_path {
        if let Ok(contents) = fs::read_to_string(&path) {
            if let Ok(mut json) = serde_json::from_str::<serde_json::Value>(&contents) {
                if let Some(games_arr) = json.get_mut("games").and_then(|v| v.as_array_mut()) {
                    let mut found = false;
                    for g in games_arr.iter_mut() {
                        if g.get("id").and_then(|v| v.as_str()) == Some(game_id) {
                            if let Some(obj) = g.as_object_mut() {
                                obj.insert("status".to_string(), serde_json::Value::String("installed".to_string()));
                                obj.insert(
                                    "installPath".to_string(),
                                    serde_json::Value::String(install_dir.to_string_lossy().to_string()),
                                );
                                obj.insert("playtimeMinutes".to_string(), serde_json::Value::Number(0.into()));
                            }
                            found = true;
                        }
                    }

                    if !found {
                        let mut new_game = serde_json::Map::new();
                        new_game.insert("id".to_string(), serde_json::Value::String(game_id.to_string()));
                        new_game.insert("title".to_string(), serde_json::Value::String(title.to_string()));
                        new_game.insert("status".to_string(), serde_json::Value::String("installed".to_string()));
                        new_game.insert(
                            "installPath".to_string(),
                            serde_json::Value::String(install_dir.to_string_lossy().to_string()),
                        );
                        new_game.insert("platform".to_string(), serde_json::Value::String("windows".to_string()));
                        new_game.insert(
                            "description".to_string(),
                            serde_json::Value::String(format!("GOG game: {title}")),
                        );
                        games_arr.push(serde_json::Value::Object(new_game));
                    }
                }

                if let Ok(updated) = serde_json::to_string_pretty(&json) {
                    let _ = fs::write(&path, updated);
                }
            }
        }
    }
}

// ============================================================================
// GOG Cloud Saves
// ============================================================================

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GogCloudSaveInfo {
    pub game_id: String,
    pub files: Vec<GogCloudSaveFile>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GogCloudSaveFile {
    pub path: String,
    pub timestamp: u64,
    pub size: u64,
}

#[tauri::command]
pub async fn gog_get_cloud_saves(gog_id: String) -> Result<GogCloudSaveInfo, String> {
    let mut token = load_gog_token().ok_or_else(|| "No GOG token found. Please login first.".to_string())?;
    let client = Client::new();

    let url = format!("{GOG_EMBED_BASE}/games/{gog_id}/cloudStorage");
    let resp = gog_api_get(&client, &mut token, &url).await?;

    if !resp.status().is_success() {
        return Err(format!("GOG cloud saves request failed with status: {}", resp.status()));
    }

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse GOG cloud saves: {e}"))?;

    let mut files = Vec::new();
    if let Some(items) = data.get("items").and_then(|v| v.as_array()) {
        for item in items {
            let path = item.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let timestamp = item.get("timestamp").and_then(|v| v.as_u64()).unwrap_or(0);
            let size = item.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
            if !path.is_empty() {
                files.push(GogCloudSaveFile { path, timestamp, size });
            }
        }
    }

    Ok(GogCloudSaveInfo { game_id: gog_id, files })
}
