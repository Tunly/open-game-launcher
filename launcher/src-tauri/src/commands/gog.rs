use super::games::types::UnifiedAchievement;
use super::secure_store;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
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
const GOG_GAMEPLAY_BASE: &str = "https://gameplay.gog.com";

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
        description: String::new(),
        cover_url: cover_url.clone(),
        logo_url: cover_url.clone(),
        icon_url: cover_url,
        playtime_minutes: None,
        last_played_at: None,
        cloud_gaming_url: None,
    })
}

#[derive(Debug, Deserialize)]
struct GogProductDetail {
    title: Option<String>,
    #[serde(default)]
    images: Option<GogProductImages>,
    #[serde(default)]
    description: Option<String>,
}

#[derive(Debug, Deserialize)]
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
struct GogBuild {
    version_number: String,
    build_id: String,
}

#[derive(Debug, Deserialize)]
struct GogInstallersResponse {
    installers: Vec<GogInstaller>,
}

#[derive(Debug, Deserialize)]
struct GogInstaller {
    id: String,
    os: String,
    #[serde(default)]
    version: Option<String>,
    total_size: u64,
    files: Vec<GogInstallerFile>,
}

#[derive(Debug, Deserialize)]
struct GogAchievementsResponse {
    #[serde(default)]
    items: Vec<GogAchievementItem>,
}

#[derive(Debug, Deserialize)]
struct GogAchievementItem {
    #[serde(default)]
    achievement_id: Option<String>,
    #[serde(default)]
    achievement_key: Option<String>,
    #[serde(default)]
    visible: bool,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    image_url_unlocked: Option<String>,
    #[serde(default)]
    image_url_locked: Option<String>,
    #[serde(default)]
    date_unlocked: Option<String>,
}

// ============================================================================
// Token Storage
// ============================================================================

/// Load the GOG token from OS keychain (with file fallback).
pub fn load_gog_token() -> Option<GogToken> {
    let json = secure_store::get_secret("gog").ok().flatten()?;
    serde_json::from_str(&json).ok()
}

/// Save the GOG token to OS keychain (with file fallback).
pub fn save_gog_token(token: &GogToken) -> Result<(), String> {
    let json =
        serde_json::to_string(token).map_err(|e| format!("Failed to serialize GOG token: {e}"))?;
    secure_store::set_secret("gog", &json)
}

fn delete_gog_token() {
    let _ = secure_store::delete_secret("gog");
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

pub async fn fetch_gog_achievements(gog_id: &str) -> Result<Vec<UnifiedAchievement>, String> {
    let mut token =
        load_gog_token().ok_or_else(|| "No GOG token found. Please login first.".to_string())?;
    let client = Client::new();
    let url = format!(
        "{GOG_GAMEPLAY_BASE}/clients/{}/users/{}/achievements?limit=1000",
        gog_id.trim(),
        token.user_id
    );
    let resp = gog_api_get(&client, &mut token, &url).await?;
    if !resp.status().is_success() {
        return Err(format!(
            "GOG achievements request failed with HTTP {}.",
            resp.status()
        ));
    }

    let payload = resp
        .json::<GogAchievementsResponse>()
        .await
        .map_err(|error| format!("Could not parse GOG achievements response: {error}"))?;

    Ok(parse_gog_achievements(payload))
}

fn parse_gog_achievements(payload: GogAchievementsResponse) -> Vec<UnifiedAchievement> {
    payload
        .items
        .into_iter()
        .filter_map(gog_achievement_to_unified)
        .collect()
}

fn gog_achievement_to_unified(achievement: GogAchievementItem) -> Option<UnifiedAchievement> {
    let key = achievement
        .achievement_key
        .as_deref()
        .or(achievement.achievement_id.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    let fallback_name = if achievement.visible {
        key.to_string()
    } else {
        "Secret Achievement".to_string()
    };
    let name = achievement
        .name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(&fallback_name)
        .to_string();
    let unlocked_at = achievement
        .date_unlocked
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let icon_url = if unlocked_at.is_some() {
        achievement
            .image_url_unlocked
            .or(achievement.image_url_locked)
    } else {
        achievement
            .image_url_locked
            .or(achievement.image_url_unlocked)
    };

    Some(UnifiedAchievement {
        id: format!("gog-{key}"),
        name,
        description: achievement
            .description
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
        icon_url,
        unlocked_at,
        rarity: None,
        source: Some("gog".to_string()),
        source_achievement_id: Some(key.to_string()),
        provider_confidence: Some("official".to_string()),
    })
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
    let mut token =
        load_gog_token().ok_or_else(|| "No GOG token found. Please login first.".to_string())?;
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

        total_pages = catalog.total_pages.max(catalog.total_pages_camel).max(1);
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

    games.sort_by_key(|left| left.title.to_lowercase());
    games.dedup_by(|left, right| left.id == right.id);

    Ok(games)
}

async fn fetch_gog_owned_games_from_user_data(
    client: &Client,
    token: &mut GogToken,
) -> Result<Vec<super::system::OwnedGame>, String> {
    let data_resp =
        gog_api_get(client, token, &format!("{GOG_EMBED_BASE}/user/data/games")).await?;
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
            description: detail.description.unwrap_or_default(),
            cover_url: cover_url.clone(),
            logo_url: cover_url.clone(),
            icon_url: normalize_gog_image_url(icon),
            playtime_minutes: None,
            last_played_at: None,
            cloud_gaming_url: None,
        });
    }

    Ok(games)
}

#[tauri::command]
pub async fn gog_fetch_owned_games() -> Result<Vec<super::system::OwnedGame>, String> {
    let mut token =
        load_gog_token().ok_or_else(|| "No GOG token found. Please login first.".to_string())?;
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
    let mut token =
        load_gog_token().ok_or_else(|| "No GOG token found. Please login first.".to_string())?;
    let client = Client::new();
    let platform = platform.unwrap_or_else(detect_platform);

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
        .or_else(|| installers_data.installers.first())
        .ok_or_else(|| "No matching installer found.".to_string())?;

    // Step 3: Get download URL for the first file
    let download_url = installer.files.first().map(|f| {
        let file_id = &f.id;
        let url = format!(
            "{GOG_EMBED_BASE}/games/{gog_id}/builds/{build_id}/installers/{installer_id}/{file_id}",
            build_id = latest_build.build_id,
            installer_id = installer.id
        );
        url
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
            Ok(resp) if resp.status().is_success() => resp
                .json::<GogProductDetail>()
                .await
                .ok()
                .and_then(|d| d.title)
                .unwrap_or_else(|| format!("GOG Game #{gog_id}")),
            _ => format!("GOG Game #{gog_id}"),
        }
    };

    Ok(GogDownloadInfoPayload {
        game_id: gog_id,
        title,
        installer_id: installer.id.clone(),
        version: installer
            .version
            .clone()
            .unwrap_or_else(|| latest_build.version_number.clone()),
        total_size: installer.total_size,
        files: files_payload,
        download_url: resolved_url,
    })
}

// ============================================================================
// GOG Download Manager
// ============================================================================

struct GogActiveDownload {
    title: String,
    progress: u32,
    speed: String,
    status: String,
    eta: u32,
    pause_tx: watch::Sender<bool>,
    cancel_tx: watch::Sender<bool>,
}

#[derive(Debug, Clone)]
struct GogStagedInstaller {
    file_count: usize,
    checksums_verified: bool,
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
    let mut token =
        load_gog_token().ok_or_else(|| "No GOG token found. Please login first.".to_string())?;

    // Get download info
    let download_info = gog_get_download_info(gog_id.clone(), None).await?;

    let game_id = format!("gog-{gog_id}");
    let download_id = format!("download-{game_id}");

    // Check if already downloading
    {
        let map = get_gog_download_manager();
        let guard = map
            .lock()
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
    let install_dir = install_path.map(PathBuf::from).unwrap_or_else(|| {
        dirs::data_local_dir()
            .or_else(dirs::data_dir)
            .unwrap_or_else(|| PathBuf::from("."))
            .join("open-game-launcher")
            .join("installer-staging")
            .join(&game_id)
    });

    fs::create_dir_all(&install_dir)
        .map_err(|e| format!("Failed to create install directory: {e}"))?;

    let (pause_tx, pause_rx) = watch::channel(false);
    let (cancel_tx, cancel_rx) = watch::channel(false);

    {
        let map = get_gog_download_manager();
        let mut guard = map
            .lock()
            .map_err(|error| format!("GOG manager lock poisoned: {error}"))?;
        guard.insert(
            game_id.clone(),
            GogActiveDownload {
                title: download_info.title.clone(),
                progress: 0,
                speed: "Waiting...".to_string(),
                status: "downloading".to_string(),
                eta: 0,
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
        .await
        .and_then(|staged| {
            write_gog_installer_stage_manifest(
                &install_dir_clone,
                &game_id_clone,
                &title_clone,
                &gog_id,
                &download_info_clone,
                &staged,
            )?;
            Ok(staged)
        });

        match result {
            Ok(staged) => {
                let _ = app_clone.emit(
                    "gog_installer_staged",
                    serde_json::json!({
                        "gameId": game_id_clone,
                        "path": install_dir_clone,
                        "fileCount": staged.file_count,
                        "checksumsVerified": staged.checksums_verified,
                        "installed": false
                    }),
                );

                let status_message = if staged.checksums_verified {
                    "Installer staged and verified (not installed)"
                } else {
                    "Installer staged (checksum format not verified; not installed)"
                };
                update_gog_download_status(&game_id_clone, "completed", status_message, 100, 0);
                emit_gog_download_progress(
                    &app_clone,
                    &game_id_clone,
                    &title_clone,
                    100,
                    status_message,
                    "completed",
                    0,
                );
            }
            Err(e) => {
                eprintln!("[GOG Download] Failed: {e}");
                update_gog_download_status(&game_id_clone, "error", &e, 0, 0);
                emit_gog_download_progress(
                    &app_clone,
                    &game_id_clone,
                    &title_clone,
                    0,
                    &e,
                    "error",
                    0,
                );
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
        message: format!(
            "GOG installer download started for {}. It will be staged, not marked installed.",
            title_for_response
        ),
    })
}

#[allow(clippy::too_many_arguments)]
async fn download_gog_game_files(
    app: &tauri::AppHandle,
    game_id: &str,
    title: &str,
    install_dir: &Path,
    download_info: &GogDownloadInfoPayload,
    token: &mut GogToken,
    pause_rx: &watch::Receiver<bool>,
    cancel_rx: &watch::Receiver<bool>,
) -> Result<GogStagedInstaller, String> {
    let client = Client::new();
    let total_size = download_info.files.iter().map(|f| f.size).sum::<u64>();
    if download_info.files.is_empty() || total_size == 0 {
        return Err("GOG returned no non-empty installer files to stage.".to_string());
    }
    let mut completed_bytes: u64 = 0;
    let mut current_progress: u32 = 0;
    let mut checksums_verified = true;

    for file in &download_info.files {
        let file_path = staged_gog_installer_path(install_dir, &file.name)?;
        if file.size == 0 {
            return Err(format!(
                "GOG installer file '{}' has no declared size.",
                file.name
            ));
        }
        let completed_before_file = completed_bytes;
        let mut file_downloaded: u64 = 0;

        // Check if file already exists with correct size (resume support)
        if let Ok(metadata) = fs::metadata(&file_path) {
            file_downloaded = metadata.len().min(file.size);
            if file_downloaded >= file.size {
                checksums_verified &=
                    verify_staged_gog_file(&file_path, file.size, &file.checksum)?;
                completed_bytes = completed_bytes.saturating_add(file.size);
                continue; // File already fully downloaded
            }
        }

        for chunk in &file.chunks {
            let chunk_end = chunk.byte_offset.saturating_add(chunk.byte_size);
            if file_downloaded >= chunk_end {
                continue;
            }

            if file_downloaded > chunk.byte_offset {
                fs::OpenOptions::new()
                    .write(true)
                    .open(&file_path)
                    .and_then(|file_handle| file_handle.set_len(chunk.byte_offset))
                    .map_err(|e| format!("Failed to rewind partial chunk: {e}"))?;
                file_downloaded = chunk.byte_offset;
            }

            // Check cancellation
            if *cancel_rx.borrow() {
                return Err("Download cancelled.".to_string());
            }

            // Handle pause
            while *pause_rx.borrow() {
                update_gog_download_status(game_id, "paused", "Paused", current_progress, 0);
                emit_gog_download_progress(
                    app,
                    game_id,
                    title,
                    current_progress,
                    "Paused",
                    "paused",
                    0,
                );
                tokio::time::sleep(Duration::from_millis(200)).await;
                if *cancel_rx.borrow() {
                    return Err("Download cancelled.".to_string());
                }
            }

            if file_downloaded < chunk.byte_offset {
                return Err(format!(
                    "GOG installer '{}' is missing bytes before chunk {}.",
                    file.name, chunk.id
                ));
            }

            // Resolve the authenticated CDN URL. A synthetic fallback URL cannot be
            // trusted because it omits the build ID, so failure is terminal.
            let url = resolve_chunk_url(
                token,
                &download_info.game_id,
                &download_info.installer_id,
                &file.id,
                &chunk.id,
            )
            .await
            .ok_or_else(|| format!("Could not resolve GOG chunk URL for {}.", chunk.id))?;

            // Download the chunk
            let resp = client
                .get(&url)
                .header("Authorization", format!("Bearer {}", token.access_token))
                .send()
                .await
                .map_err(|e| format!("Chunk download request failed: {e}"))?;

            if !resp.status().is_success() {
                return Err(format!(
                    "Chunk download failed with status: {}",
                    resp.status()
                ));
            }

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

                if file_downloaded.saturating_add(chunk_data.len() as u64) > chunk_end {
                    return Err(format!(
                        "GOG chunk {} exceeded its declared byte range.",
                        chunk.id
                    ));
                }

                file_handle
                    .write_all(&chunk_data)
                    .map_err(|e| format!("File write error: {e}"))?;

                file_downloaded = file_downloaded.saturating_add(chunk_data.len() as u64);
                bytes_since_last_update += chunk_data.len() as u64;

                let now = Instant::now();
                let elapsed_ms = now.duration_since(last_update).as_millis();
                if elapsed_ms >= 300 {
                    let downloaded_total = completed_before_file
                        .saturating_add(file_downloaded)
                        .min(total_size);
                    let progress = if total_size > 0 {
                        ((downloaded_total as f64 / total_size as f64) * 100.0) as u32
                    } else {
                        0
                    };
                    current_progress = progress.min(99);
                    let speed_bytes_per_sec =
                        (bytes_since_last_update as f64) / (elapsed_ms as f64 / 1000.0);
                    let speed_mb_sec = speed_bytes_per_sec / (1024.0 * 1024.0);
                    let speed_str = format!("{:.1} MB/s", speed_mb_sec);

                    let remaining_bytes = total_size.saturating_sub(downloaded_total);
                    let eta = if speed_bytes_per_sec > 0.0 {
                        (remaining_bytes as f64 / speed_bytes_per_sec) as u32
                    } else {
                        999
                    };

                    update_gog_download_status(
                        game_id,
                        "downloading",
                        &speed_str,
                        current_progress,
                        eta,
                    );
                    emit_gog_download_progress(
                        app,
                        game_id,
                        title,
                        current_progress,
                        &speed_str,
                        "downloading",
                        eta,
                    );

                    last_update = now;
                    bytes_since_last_update = 0;
                }
            }

            if file_downloaded != chunk_end {
                return Err(format!(
                    "GOG chunk {} ended at byte {}, expected {}.",
                    chunk.id, file_downloaded, chunk_end
                ));
            }
        }

        checksums_verified &= verify_staged_gog_file(&file_path, file.size, &file.checksum)?;
        completed_bytes = completed_before_file.saturating_add(file.size);
    }

    Ok(GogStagedInstaller {
        file_count: download_info.files.len(),
        checksums_verified,
    })
}

fn staged_gog_installer_path(root: &Path, file_name: &str) -> Result<PathBuf, String> {
    let mut components = Path::new(file_name).components();
    let file_name = match (components.next(), components.next()) {
        (Some(std::path::Component::Normal(file_name)), None) => file_name,
        _ => {
            return Err(format!(
                "GOG returned an unsafe installer filename: {file_name}"
            ))
        }
    };

    Ok(root.join(file_name))
}

fn verify_staged_gog_file(
    path: &Path,
    expected_size: u64,
    expected_checksum: &str,
) -> Result<bool, String> {
    let actual_size = fs::metadata(path)
        .map_err(|error| format!("Could not inspect staged GOG installer: {error}"))?
        .len();
    if actual_size != expected_size {
        return Err(format!(
            "Staged GOG installer size mismatch for {}: expected {expected_size}, got {actual_size}.",
            path.display()
        ));
    }

    let checksum = expected_checksum
        .trim()
        .strip_prefix("sha256:")
        .unwrap_or(expected_checksum.trim());
    if checksum.len() != 64
        || !checksum
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
        // GOG also returns legacy checksum formats. They are retained in the stage
        // manifest, but an installer with such a checksum is never called installed.
        return Ok(false);
    }

    let actual = crate::commands::games::core::sha256_file_hex(path)?;
    if !actual.eq_ignore_ascii_case(checksum) {
        return Err(format!(
            "Staged GOG installer checksum mismatch for {}.",
            path.display()
        ));
    }

    Ok(true)
}

fn write_gog_installer_stage_manifest(
    install_dir: &Path,
    game_id: &str,
    title: &str,
    gog_id: &str,
    download_info: &GogDownloadInfoPayload,
    staged: &GogStagedInstaller,
) -> Result<(), String> {
    let manifest = serde_json::json!({
        "kind": "gog_installer_stage",
        "gameId": game_id,
        "title": title,
        "gogId": gog_id,
        "version": download_info.version,
        "installerId": download_info.installer_id,
        "files": download_info.files,
        "fileCount": staged.file_count,
        "checksumsVerified": staged.checksums_verified,
        "installed": false,
        "managedBy": "OG-Launcher"
    });
    let contents = serde_json::to_string_pretty(&manifest)
        .map_err(|error| format!("Could not serialize GOG installer stage: {error}"))?;
    fs::write(install_dir.join("og-gog-installer-stage.json"), contents)
        .map_err(|error| format!("Could not write GOG installer stage manifest: {error}"))
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

pub fn get_gog_download_queue() -> Result<Vec<super::downloads::DownloadItemPayload>, String> {
    let map = get_gog_download_manager()
        .lock()
        .map_err(|error| format!("GOG download manager lock poisoned: {error}"))?;
    let queue: Vec<super::downloads::DownloadItemPayload> = map
        .iter()
        .map(|(game_id, dl)| super::downloads::DownloadItemPayload {
            id: format!("download-{game_id}"),
            game_id: game_id.clone(),
            title: dl.title.clone(),
            progress: dl.progress,
            speed: dl.speed.clone(),
            status: dl.status.clone(),
            eta: dl.eta,
            platform: "GOG Galaxy".to_string(),
            phase: "download".to_string(),
            bytes_downloaded: None,
            bytes_total: None,
            can_pause: true,
            can_cancel: true,
            external: false,
            last_updated_at: 0,
            provider: "gog".to_string(),
            raw_status: dl.status.clone(),
            progress_source: "gog_api".to_string(),
            error: None,
        })
        .collect();
    Ok(queue)
}

pub fn pause_gog_download(app: tauri::AppHandle, game_id: String) -> Result<(), String> {
    let map = get_gog_download_manager();
    let mut guard = map
        .lock()
        .map_err(|error| format!("GOG download manager lock poisoned: {error}"))?;
    if let Some(dl) = guard.get_mut(&game_id) {
        if dl.status == "downloading" {
            dl.status = "paused".to_string();
            dl.speed = "Paused".to_string();
            let _ = dl.pause_tx.send(true);
            println!("[GOG Download] Paused download for {game_id}");
            emit_gog_download_progress(
                &app,
                &game_id,
                &dl.title,
                dl.progress,
                &dl.speed,
                &dl.status,
                dl.eta,
            );
        } else if dl.status == "paused" {
            dl.status = "downloading".to_string();
            dl.speed = "Connecting...".to_string();
            let _ = dl.pause_tx.send(false);
            println!("[GOG Download] Resumed download for {game_id}");
            emit_gog_download_progress(
                &app,
                &game_id,
                &dl.title,
                dl.progress,
                &dl.speed,
                &dl.status,
                dl.eta,
            );
        }
    }
    Ok(())
}

pub fn cancel_gog_download(app: tauri::AppHandle, game_id: String) -> Result<(), String> {
    let map = get_gog_download_manager();
    let mut guard = map
        .lock()
        .map_err(|error| format!("GOG download manager lock poisoned: {error}"))?;
    if let Some(dl) = guard.get_mut(&game_id) {
        dl.status = "cancelled".to_string();
        let _ = dl.cancel_tx.send(true);
        println!("[GOG Download] Cancelled download for {game_id}");
        emit_gog_download_progress(
            &app,
            &game_id,
            &dl.title,
            dl.progress,
            "Cancelled",
            "cancelled",
            0,
        );
    }
    guard.remove(&game_id);
    Ok(())
}

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
        platform: "GOG Galaxy".to_string(),
        phase: "download".to_string(),
        bytes_downloaded: None,
        bytes_total: None,
        can_pause: true,
        can_cancel: true,
        external: false,
        last_updated_at: 0,
        provider: "gog".to_string(),
        raw_status: status.to_string(),
        progress_source: "gog_api".to_string(),
        error: None,
    };
    super::downloads::record_download_item(payload.clone());
    let _ = app.emit("download_progress", payload);
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
    let mut token =
        load_gog_token().ok_or_else(|| "No GOG token found. Please login first.".to_string())?;
    let client = Client::new();

    let url = format!("{GOG_EMBED_BASE}/games/{gog_id}/cloudStorage");
    let resp = gog_api_get(&client, &mut token, &url).await?;

    if !resp.status().is_success() {
        return Err(format!(
            "GOG cloud saves request failed with status: {}",
            resp.status()
        ));
    }

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse GOG cloud saves: {e}"))?;

    let mut files = Vec::new();
    if let Some(items) = data.get("items").and_then(|v| v.as_array()) {
        for item in items {
            let path = item
                .get("path")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let timestamp = item.get("timestamp").and_then(|v| v.as_u64()).unwrap_or(0);
            let size = item.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
            if !path.is_empty() {
                files.push(GogCloudSaveFile {
                    path,
                    timestamp,
                    size,
                });
            }
        }
    }

    Ok(GogCloudSaveInfo {
        game_id: gog_id,
        files,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_gog_achievement_response() {
        let achievements = parse_gog_achievements(GogAchievementsResponse {
            items: vec![GogAchievementItem {
                achievement_id: Some("48497841707623054".to_string()),
                achievement_key: Some("ACHIEVEMENT_NODEATH1".to_string()),
                visible: true,
                name: Some("Early Bird".to_string()),
                description: Some("Complete level 1 without dying".to_string()),
                image_url_unlocked: Some("https://images.gog.com/unlocked.jpg".to_string()),
                image_url_locked: Some("https://images.gog.com/locked.jpg".to_string()),
                date_unlocked: Some("2026-06-07T01:10:00+00:00".to_string()),
            }],
        });

        assert_eq!(achievements.len(), 1);
        assert_eq!(achievements[0].id, "gog-ACHIEVEMENT_NODEATH1");
        assert_eq!(achievements[0].name, "Early Bird");
        assert_eq!(achievements[0].source.as_deref(), Some("gog"));
        assert_eq!(
            achievements[0].source_achievement_id.as_deref(),
            Some("ACHIEVEMENT_NODEATH1")
        );
        assert_eq!(
            achievements[0].provider_confidence.as_deref(),
            Some("official")
        );
        assert_eq!(
            achievements[0].unlocked_at.as_deref(),
            Some("2026-06-07T01:10:00+00:00")
        );
        assert_eq!(
            achievements[0].icon_url.as_deref(),
            Some("https://images.gog.com/unlocked.jpg")
        );
    }

    #[test]
    fn parses_hidden_gog_achievement_with_secret_fallback() {
        let achievements = parse_gog_achievements(GogAchievementsResponse {
            items: vec![GogAchievementItem {
                achievement_id: Some("48225958150521213".to_string()),
                achievement_key: None,
                visible: false,
                name: None,
                description: None,
                image_url_unlocked: Some("https://images.gog.com/unlocked.jpg".to_string()),
                image_url_locked: Some("https://images.gog.com/locked.jpg".to_string()),
                date_unlocked: None,
            }],
        });

        assert_eq!(achievements.len(), 1);
        assert_eq!(achievements[0].id, "gog-48225958150521213");
        assert_eq!(achievements[0].name, "Secret Achievement");
        assert_eq!(
            achievements[0].icon_url.as_deref(),
            Some("https://images.gog.com/locked.jpg")
        );
        assert!(achievements[0].unlocked_at.is_none());
    }

    #[test]
    fn staged_installer_path_rejects_traversal() {
        let root = std::env::temp_dir();
        assert!(staged_gog_installer_path(&root, "../setup.exe").is_err());
        assert!(staged_gog_installer_path(&root, "subdir/setup.exe").is_err());
        assert_eq!(
            staged_gog_installer_path(&root, "setup.exe").unwrap(),
            root.join("setup.exe")
        );
    }

    #[test]
    fn staged_installer_verifies_size_and_sha256() {
        let root = std::env::temp_dir().join(format!(
            "ogl-gog-stage-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let installer = root.join("setup.exe");
        fs::write(&installer, b"abc").unwrap();

        assert!(verify_staged_gog_file(
            &installer,
            3,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        )
        .unwrap());
        assert!(verify_staged_gog_file(&installer, 4, "").is_err());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn stage_manifest_never_claims_installed() {
        let root = std::env::temp_dir().join(format!(
            "ogl-gog-stage-manifest-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let info = GogDownloadInfoPayload {
            game_id: "123".to_string(),
            title: "Test".to_string(),
            installer_id: "installer".to_string(),
            version: "1.0".to_string(),
            total_size: 3,
            files: vec![],
            download_url: None,
        };
        let staged = GogStagedInstaller {
            file_count: 1,
            checksums_verified: false,
        };

        write_gog_installer_stage_manifest(&root, "gog-123", "Test", "123", &info, &staged)
            .unwrap();
        let manifest: serde_json::Value = serde_json::from_str(
            &fs::read_to_string(root.join("og-gog-installer-stage.json")).unwrap(),
        )
        .unwrap();

        assert_eq!(manifest["installed"], false);
        assert!(!root.join("og-manifest.json").exists());
        let _ = fs::remove_dir_all(root);
    }
}
