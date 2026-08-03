use super::secure_store;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;

use super::games::core::open_game_launcher_data_dir;
use super::games::detect::get_ea_assets;
use super::system::OwnedGame;

const EA_LOGIN_URL: &str = "https://www.ea.com/login";
const EA_DEALS_URL: &str = "https://www.ea.com/sales/deals";
const GRAPHQL_BASE: &str = "https://service-aggregation-layer.juno.ea.com/graphql";
const LOCAL_EA_AUTH_PREFIX: &str = "https://localhost/launcher/ea-authorized?token=";

const OWNED_GAMES_HASH: &str = "5de4178ee7e1f084ce9deca856c74a9e03547a67dfafc0cb844d532fb54ae73d";
const PLAYTIMES_HASH: &str = "3f09b35e06b75c74d8ec3e520a598ebb5e2992b1e1268b6dd3b8ed99b9fafb29";

const EA_TOKEN_MAX_AGE_SECS: u64 = 55 * 60;
const EA_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const EA_TOKEN_CAPTURE_SCRIPT: &str = r#"
(function() {
  const GRAPHQL_HOST = 'service-aggregation-layer.juno.ea.com/graphql';
  const REDIRECT_PREFIX = 'https://localhost/launcher/ea-authorized?token=';

  function extractAndRedirect(authHeader) {
    if (!authHeader || typeof authHeader !== 'string') return;
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token || token.length < 20) return;
    if (window.location.href.startsWith('https://localhost/launcher/ea-authorized')) return;
    window.location.href = REDIRECT_PREFIX + encodeURIComponent(token);
  }

  function readAuthFromHeaders(headers) {
    if (!headers) return;
    if (headers instanceof Headers) {
      const value = headers.get('authorization') || headers.get('Authorization');
      if (value) extractAndRedirect(value);
      return;
    }
    if (Array.isArray(headers)) {
      for (let i = 0; i < headers.length; i += 2) {
        if (String(headers[i]).toLowerCase() === 'authorization') {
          extractAndRedirect(headers[i + 1]);
        }
      }
      return;
    }
    if (typeof headers === 'object') {
      const value = headers.authorization || headers.Authorization;
      if (value) extractAndRedirect(value);
    }
  }

  function watchUrl(url, init) {
    if (!String(url).includes(GRAPHQL_HOST)) return;
    if (init && init.headers) readAuthFromHeaders(init.headers);
  }

  const origFetch = window.fetch;
  window.fetch = function(input, init) {
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      watchUrl(url, init || {});
    } catch (e) {}
    return origFetch.apply(this, arguments);
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this._ogEaUrl = url;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    if (String(name).toLowerCase() === 'authorization') this._ogEaAuth = value;
    return origSetRequestHeader.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    try {
      if (this._ogEaUrl && this._ogEaAuth) {
        watchUrl(this._ogEaUrl, { headers: { authorization: this._ogEaAuth } });
      }
    } catch (e) {}
    return origSend.apply(this, arguments);
  };
})();
"#;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EaToken {
    pub access_token: String,
    pub captured_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LegacyOffer {
    #[serde(rename = "offerId", default)]
    offer_id: Option<String>,
    #[serde(default)]
    content_id: Option<String>,
    #[serde(default)]
    display_name: Option<String>,
    #[serde(default)]
    install_check_override: Option<String>,
}

struct PlaytimeEntry {
    minutes: Option<u64>,
    last_played_at: Option<String>,
}

pub fn load_ea_token() -> Option<EaToken> {
    let json = secure_store::get_secret_keychain_only("ea")
        .ok()
        .flatten()?;
    serde_json::from_str(&json).ok()
}

fn save_ea_token(token: &EaToken) -> Result<(), String> {
    let json =
        serde_json::to_string(token).map_err(|e| format!("Failed to serialize EA token: {e}"))?;
    secure_store::set_secret_keychain_only("ea", &json)
}

fn delete_ea_token() -> Result<(), String> {
    secure_store::delete_secret_keychain_only("ea")
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn is_ea_token_valid(token: &EaToken) -> bool {
    !token.access_token.is_empty()
        && token.captured_at > 0
        && now_secs().saturating_sub(token.captured_at) < EA_TOKEN_MAX_AGE_SECS
}

fn ea_http_client() -> Client {
    Client::builder()
        .user_agent(EA_USER_AGENT)
        .build()
        .unwrap_or_else(|_| Client::new())
}

fn percent_encode(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char);
            }
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }
    encoded
}

/// Playnite leaves `extensions` unencoded in the query string; encoding it breaks EA's API.
fn persisted_query_url(operation: &str, variables: serde_json::Value, hash: &str) -> String {
    let variables_json = serde_json::to_string(&variables).unwrap_or_else(|_| "{}".to_string());
    let extensions = format!(r#"{{"persistedQuery":{{"version":1,"sha256Hash":"{hash}"}}}}"#);
    format!(
        "{GRAPHQL_BASE}?operationName={operation}&variables={}&extensions={extensions}",
        percent_encode(&variables_json),
    )
}

fn graphql_error_message(root: &serde_json::Value) -> Option<String> {
    let errors = root.get("errors")?.as_array()?;
    if errors.is_empty() {
        return None;
    }
    let messages: Vec<String> = errors
        .iter()
        .filter_map(|error| {
            error
                .get("message")
                .and_then(|value| value.as_str())
                .map(str::to_string)
        })
        .collect();
    if messages.is_empty() {
        Some("EA GraphQL returned errors.".to_string())
    } else {
        Some(messages.join("; "))
    }
}

fn ensure_graphql_data(root: &serde_json::Value, context: &str) -> Result<(), String> {
    if let Some(message) = graphql_error_message(root) {
        return Err(format!("{context}: {message}"));
    }
    if root.get("data").is_none() {
        return Err(format!("{context}: response missing data object."));
    }
    Ok(())
}

fn owned_games_variables(offset: &str, limit: u32) -> serde_json::Value {
    serde_json::json!({
        "isMac": false,
        "addFieldsToPreloadGames": true,
        "locale": "en",
        "limit": limit,
        "next": offset,
        "type": ["DIGITAL_FULL_GAME", "PACKAGED_FULL_GAME"],
        "entitlementEnabled": true,
        "storefronts": ["EA", "STEAM", "EPIC"],
        "ownershipMethods": [
            "UNKNOWN", "ASSOCIATION", "PURCHASE", "REDEMPTION", "GIFT_RECEIPT",
            "ENTITLEMENT_GRANT", "DIRECT_ENTITLEMENT", "PRE_ORDER_PURCHASE",
            "VAULT", "XGP_VAULT", "STEAM", "STEAM_VAULT", "STEAM_SUBSCRIPTION",
            "EPIC", "EPIC_VAULT", "EPIC_SUBSCRIPTION"
        ],
        "platforms": ["PC"]
    })
}

fn is_ea_login_complete(url: &str) -> bool {
    let base = url
        .split_once('?')
        .map(|(prefix, _)| prefix)
        .unwrap_or(url)
        .trim_end_matches('/');
    if !base.starts_with("https://www.ea.com") {
        return false;
    }
    let path = base.strip_prefix("https://www.ea.com").unwrap_or("");
    path.is_empty() || path == "/" || path == "/en-us" || path == "/de-de" || path == "/en-gb"
}

fn percent_decode_component(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let hex = &value[index + 1..index + 3];
            if let Ok(byte) = u8::from_str_radix(hex, 16) {
                decoded.push(byte);
                index += 3;
                continue;
            }
        }
        decoded.push(if bytes[index] == b'+' {
            b' '
        } else {
            bytes[index]
        });
        index += 1;
    }
    String::from_utf8_lossy(&decoded).into_owned()
}

fn extract_token_from_redirect(url: &str) -> Option<String> {
    if !url.starts_with(LOCAL_EA_AUTH_PREFIX) {
        return None;
    }
    let rest = &url[LOCAL_EA_AUTH_PREFIX.len()..];
    let token = rest.split('&').next()?.trim();
    if token.is_empty() {
        return None;
    }
    Some(percent_decode_component(token))
}

fn json_value_as_offset(value: &serde_json::Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        return Some(text.to_string());
    }
    if let Some(number) = value.as_i64() {
        return Some(number.to_string());
    }
    if let Some(number) = value.as_u64() {
        return Some(number.to_string());
    }
    None
}

fn json_string_at(value: &serde_json::Value, path: &[&str]) -> Option<String> {
    let mut current = value;
    for key in path {
        current = current.get(key)?;
    }
    current
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn product_cover_url(product: &serde_json::Value) -> Option<String> {
    for path in [
        &["boxArt", "url"][..],
        &["boxArt", "path"][..],
        &["image", "url"][..],
        &["coverArt", "url"][..],
        &["heroImage", "url"][..],
    ] {
        if let Some(url) = json_string_at(product, path) {
            if url.starts_with("//") {
                return Some(format!("https:{url}"));
            }
            if url.starts_with("http") {
                return Some(url);
            }
        }
    }
    None
}

async fn graphql_get(client: &Client, token: &str, url: &str) -> Result<serde_json::Value, String> {
    let response = client
        .get(url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Accept", "application/json")
        .header("Origin", "https://www.ea.com")
        .header("Referer", "https://www.ea.com/")
        .send()
        .await
        .map_err(|e| format!("EA GraphQL request failed: {e}"))?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        let _ = delete_ea_token();
        return Err("EA session expired. Please sign in again.".to_string());
    }

    if !response.status().is_success() {
        return Err(format!(
            "EA GraphQL returned HTTP {}",
            response.status().as_u16()
        ));
    }

    let root: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse EA GraphQL response: {e}"))?;
    ensure_graphql_data(&root, "EA GraphQL GET")?;
    Ok(root)
}

async fn fetch_owned_game_pages(
    client: &Client,
    token: &str,
) -> Result<Vec<serde_json::Value>, String> {
    let mut items = Vec::new();
    let mut offset = "0".to_string();

    loop {
        let url = persisted_query_url(
            "getPreloadedOwnedGames",
            owned_games_variables(&offset, 500),
            OWNED_GAMES_HASH,
        );
        let root = graphql_get(client, token, &url).await?;
        let page_items = root
            .pointer("/data/me/ownedGameProducts/items")
            .and_then(|value| value.as_array())
            .cloned()
            .unwrap_or_default();

        if page_items.is_empty() {
            println!(
                "[EA] Owned games page at offset '{offset}' returned 0 items. data.me present: {}",
                root.get("data").and_then(|d| d.get("me")).is_some()
            );
            if let Some(errors) = root.get("errors") {
                println!("[EA] GraphQL errors: {errors}");
            }
        }

        items.extend(page_items);

        let next = root
            .pointer("/data/me/ownedGameProducts/next")
            .and_then(json_value_as_offset);
        let next = next
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty() && *value != offset);

        match next {
            Some(next_offset) => offset = next_offset.to_string(),
            None => break,
        }
    }

    Ok(items)
}

fn ea_legacy_cache_path() -> Option<PathBuf> {
    open_game_launcher_data_dir().map(|dir| dir.join("ea-legacy-offers.json"))
}

fn load_legacy_offer_cache() -> HashMap<String, LegacyOffer> {
    let Some(path) = ea_legacy_cache_path() else {
        return HashMap::new();
    };
    let Ok(contents) = fs::read_to_string(path) else {
        return HashMap::new();
    };
    serde_json::from_str(&contents).unwrap_or_default()
}

fn save_legacy_offer_cache(offers: &HashMap<String, LegacyOffer>) {
    let Some(path) = ea_legacy_cache_path() else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(offers) {
        let _ = fs::write(path, json);
    }
}

async fn fetch_legacy_offers_batch(
    client: &Client,
    token: &str,
    offer_ids: &[String],
) -> Result<Vec<LegacyOffer>, String> {
    if offer_ids.is_empty() {
        return Ok(Vec::new());
    }

    let query = r#"query getLegacyCatalogDefs($offerIds: [String!]!, $locale: Locale) {
  legacyOffers(offerIds: $offerIds, locale: $locale) {
    offerId: id
    contentId
    displayName
    installCheckOverride
  }
}"#;

    let body = serde_json::json!({
        "query": query,
        "operationName": "getLegacyCatalogDefs",
        "variables": {
            "locale": "DEFAULT",
            "offerIds": offer_ids,
        }
    });

    let response = client
        .post(GRAPHQL_BASE)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .header("Origin", "https://www.ea.com")
        .header("Referer", "https://www.ea.com/")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("EA legacy catalog request failed: {e}"))?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        let _ = delete_ea_token();
        return Err("EA session expired. Please sign in again.".to_string());
    }

    if !response.status().is_success() {
        return Err(format!(
            "EA legacy catalog returned HTTP {}",
            response.status().as_u16()
        ));
    }

    let root: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse EA legacy catalog response: {e}"))?;
    ensure_graphql_data(&root, "EA legacy catalog")?;

    let offers = root
        .pointer("/data/legacyOffers")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();

    let mut parsed = Vec::new();
    for offer in offers {
        if let Ok(legacy) = serde_json::from_value::<LegacyOffer>(offer) {
            parsed.push(legacy);
        }
    }
    Ok(parsed)
}

async fn get_legacy_offers_map(
    client: &Client,
    token: &str,
    offer_ids: &[String],
) -> Result<HashMap<String, LegacyOffer>, String> {
    let mut cache = load_legacy_offer_cache();
    let missing: Vec<String> = offer_ids
        .iter()
        .filter(|id| !cache.contains_key(id.as_str()))
        .cloned()
        .collect();

    for chunk in missing.chunks(40) {
        let fetched = fetch_legacy_offers_batch(client, token, chunk).await?;
        for offer in fetched {
            let key = offer
                .offer_id
                .clone()
                .filter(|value| !value.is_empty())
                .unwrap_or_default();
            if !key.is_empty() {
                cache.insert(key, offer);
            }
        }
    }

    save_legacy_offer_cache(&cache);
    Ok(cache)
}

async fn fetch_playtimes(
    client: &Client,
    token: &str,
    slugs: &[String],
) -> Result<HashMap<String, PlaytimeEntry>, String> {
    let mut output = HashMap::new();
    for chunk in slugs.chunks(20) {
        if chunk.is_empty() {
            continue;
        }
        let url = persisted_query_url(
            "GetGamePlayTimes",
            serde_json::json!({ "gameSlugs": chunk }),
            PLAYTIMES_HASH,
        );
        let root = graphql_get(client, token, &url).await?;
        let items = root
            .pointer("/data/me/recentGames/items")
            .and_then(|value| value.as_array())
            .cloned()
            .unwrap_or_default();

        for item in items {
            let slug = json_string_at(&item, &["gameSlug"]).unwrap_or_default();
            if slug.is_empty() {
                continue;
            }
            let seconds = item
                .get("totalPlayTimeSeconds")
                .and_then(|value| value.as_u64());
            let last_played_at = json_string_at(&item, &["lastSessionEndDate"]);
            output.insert(
                slug.clone(),
                PlaytimeEntry {
                    minutes: seconds.map(|value| value / 60),
                    last_played_at,
                },
            );
        }
    }
    Ok(output)
}

fn owned_item_to_game(
    item: &serde_json::Value,
    legacy: Option<&LegacyOffer>,
    playtime: Option<&PlaytimeEntry>,
) -> Option<OwnedGame> {
    let offer_id = json_string_at(item, &["originOfferId"])?;
    let product = item.get("product");
    let title = product
        .and_then(|value| json_string_at(value, &["name"]))
        .or_else(|| legacy.and_then(|entry| entry.display_name.clone()))
        .unwrap_or_else(|| format!("EA Game {offer_id}"));

    let content_id = legacy
        .and_then(|entry| entry.content_id.clone())
        .filter(|value| !value.is_empty());

    let (cover_from_assets, logo_from_assets, icon_from_assets) =
        get_ea_assets(content_id.as_deref().unwrap_or(""), &title);
    let cover_url = product
        .and_then(product_cover_url)
        .or(cover_from_assets)
        .or(logo_from_assets.clone());
    let logo_url = logo_from_assets.or(cover_url.clone());
    let icon_url = icon_from_assets.or(logo_url.clone());

    let (playtime_minutes, last_played_at) = playtime
        .map(|entry| (entry.minutes, entry.last_played_at.clone()))
        .unwrap_or((None, None));

    Some(OwnedGame {
        id: format!("ea-owned-{offer_id}"),
        external_id: content_id,
        title,
        description: String::new(),
        cover_url,
        logo_url,
        icon_url,
        playtime_minutes,
        last_played_at,
        cloud_gaming_url: None,
        achievement_summary: None,
    })
}

#[tauri::command]
pub async fn open_ea_login_window(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;

    if let Some(existing) = app.get_webview_window("ea-login") {
        let _ = existing.close();
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }

    let app_clone = app.clone();
    let deals_url: tauri::Url = EA_DEALS_URL
        .parse()
        .map_err(|error| format!("Failed to parse EA deals URL: {error}"))?;

    let _window = tauri::WebviewWindowBuilder::new(
        &app,
        "ea-login",
        tauri::WebviewUrl::External(
            EA_LOGIN_URL
                .parse()
                .map_err(|error| format!("Failed to parse EA login URL: {error}"))?,
        ),
    )
    .title("EA Login")
    .inner_size(520.0, 720.0)
    .center()
    .resizable(true)
    .initialization_script(EA_TOKEN_CAPTURE_SCRIPT)
    .on_navigation(move |url| {
        let url_str = url.to_string();

        if let Some(token) = extract_token_from_redirect(&url_str) {
            let captured = EaToken {
                access_token: token,
                captured_at: now_secs(),
            };
            if let Err(error) = save_ea_token(&captured) {
                eprintln!("[EA Login] Failed to save token: {error}");
            } else {
                println!("[EA Login] Bearer token captured.");
                let _ = app_clone.emit("ea_login_success", ());
                if let Some(window) = app_clone.get_webview_window("ea-login") {
                    let _ = window.close();
                }
            }
            return false;
        }

        if is_ea_login_complete(&url_str) && !url_str.contains("/sales/deals") {
            if let Some(window) = app_clone.get_webview_window("ea-login") {
                let _ = window.navigate(deals_url.clone());
            }
            return true;
        }

        true
    })
    .build()
    .map_err(|error| format!("Failed to create EA login window: {error}"))?;

    Ok(())
}

#[tauri::command]
pub fn ea_get_token() -> Option<EaToken> {
    let token = load_ea_token()?;
    if is_ea_token_valid(&token) {
        Some(token)
    } else {
        let _ = delete_ea_token();
        None
    }
}

#[tauri::command]
pub fn ea_logout() -> Result<(), String> {
    delete_ea_token()
}

#[tauri::command]
pub async fn ea_fetch_owned_games() -> Result<Vec<OwnedGame>, String> {
    let token = load_ea_token().ok_or_else(|| {
        "EA account not connected. Sign in under Settings > Connected Accounts.".to_string()
    })?;
    if !is_ea_token_valid(&token) {
        let _ = delete_ea_token();
        return Err("EA session expired. Please sign in again.".to_string());
    }

    let client = ea_http_client();
    let owned_items = fetch_owned_game_pages(&client, &token.access_token).await?;
    println!("[EA] Fetched {} owned catalog items.", owned_items.len());

    if owned_items.is_empty() {
        return Err(
            "EA returned an empty library. Try disconnecting and signing in again on the EA deals page."
                .to_string(),
        );
    }

    let offer_ids: Vec<String> = owned_items
        .iter()
        .filter_map(|item| json_string_at(item, &["originOfferId"]))
        .collect();

    let legacy_map = match get_legacy_offers_map(&client, &token.access_token, &offer_ids).await {
        Ok(map) => map,
        Err(error) => {
            eprintln!("[EA] Legacy catalog fetch failed (continuing without): {error}");
            HashMap::new()
        }
    };

    let slugs: Vec<String> = owned_items
        .iter()
        .filter_map(|item| {
            item.get("product")
                .and_then(|product| json_string_at(product, &["gameSlug"]))
        })
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    let playtimes = match fetch_playtimes(&client, &token.access_token, &slugs).await {
        Ok(map) => map,
        Err(error) => {
            eprintln!("[EA] Playtime fetch failed (continuing without): {error}");
            HashMap::new()
        }
    };

    let mut games = Vec::new();
    for item in &owned_items {
        let offer_id = match json_string_at(item, &["originOfferId"]) {
            Some(value) => value,
            None => continue,
        };
        let slug = item
            .get("product")
            .and_then(|product| json_string_at(product, &["gameSlug"]));
        let playtime = slug.as_ref().and_then(|value| playtimes.get(value));
        let legacy = legacy_map.get(&offer_id);
        let Some(owned) = owned_item_to_game(item, legacy, playtime) else {
            eprintln!("[EA] Skipped item without originOfferId: {item}");
            continue;
        };

        games.push(owned);
    }

    println!(
        "[EA] Returning {} owned games for library merge.",
        games.len()
    );
    Ok(games)
}
