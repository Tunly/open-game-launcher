use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use super::super::core::{
    current_unix_timestamp, epic_catalog_asset_cache_path, get_dir_last_modified, installed_game,
    path_to_string, unix_timestamp_to_iso,
};
use super::super::types::*;
use super::{
    find_local_banner_asset, find_local_icon_asset, find_local_logo_asset, get_rawg_epic_assets,
};

pub fn scan_epic_games() -> Vec<InstalledGame> {
    let manifest_dir = PathBuf::from(r"C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests");
    let Ok(entries) = fs::read_dir(manifest_dir) else {
        return Vec::new();
    };
    let catalog_cache = read_epic_catalog_cache();

    entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if path.extension().and_then(|extension| extension.to_str()) != Some("item") {
                return None;
            }

            let contents = fs::read_to_string(path).ok()?;
            let value = serde_json::from_str::<serde_json::Value>(&contents).ok()?;
            let title = value.get("DisplayName")?.as_str()?.trim().to_string();

            if title.is_empty() {
                return None;
            }

            if is_epic_unreal_asset_manifest(&value, &title) {
                return None;
            }

            let install_path = value
                .get("InstallLocation")
                .and_then(|location| location.as_str())
                .map(str::trim)
                .filter(|location| !location.is_empty())
                .map(ToOwned::to_owned);
            let catalog_item_id = value
                .get("CatalogItemId")
                .or_else(|| value.get("CatalogItemIdOverride"))
                .and_then(|id| id.as_str())
                .map(str::trim)
                .filter(|id| !id.is_empty())
                .map(ToOwned::to_owned);
            let app_name = value
                .get("AppName")
                .or_else(|| value.get("MainGameAppName"))
                .and_then(|id| id.as_str())
                .map(str::trim)
                .filter(|id| !id.is_empty())
                .map(ToOwned::to_owned);
            let namespace = value
                .get("CatalogNamespace")
                .or_else(|| value.get("Namespace"))
                .and_then(|id| id.as_str())
                .map(str::trim)
                .filter(|id| !id.is_empty())
                .map(ToOwned::to_owned);
            let install_root = install_path.as_ref().map(PathBuf::from);
            let epic_assets = find_epic_launcher_assets(&value, &title, &catalog_cache);
            let epic_catalog_assets = if !epic_assets_have_banner_and_icon(&epic_assets) {
                get_epic_catalog_api_assets(namespace.as_deref(), catalog_item_id.as_deref())
            } else {
                EpicLauncherAssets::default()
            };
            let has_epic_banner_and_icon = (epic_assets.cover_url.is_some()
                || epic_catalog_assets.cover_url.is_some())
                && (epic_assets.icon_url.is_some() || epic_catalog_assets.icon_url.is_some());
            let rawg_assets = if has_epic_banner_and_icon {
                None
            } else {
                get_rawg_epic_assets(app_name.as_deref().unwrap_or(&title), &title)
            };
            let cover_url = epic_assets
                .cover_url
                .clone()
                .or_else(|| epic_catalog_assets.cover_url.clone())
                .or_else(|| rawg_assets.as_ref().and_then(|a| a.cover_url.clone()))
                .or_else(|| {
                    install_root
                        .as_ref()
                        .and_then(|path| find_local_banner_asset(path))
                });
            let logo_url = epic_assets
                .logo_url
                .clone()
                .or_else(|| epic_catalog_assets.logo_url.clone())
                .or_else(|| rawg_assets.as_ref().and_then(|a| a.logo_url.clone()))
                .or_else(|| {
                    install_root
                        .as_ref()
                        .and_then(|path| find_local_logo_asset(path))
                });
            let icon_url = epic_assets
                .icon_url
                .clone()
                .or_else(|| epic_catalog_assets.icon_url.clone())
                .or_else(|| rawg_assets.as_ref().and_then(|a| a.icon_url.clone()))
                .or_else(|| {
                    install_root
                        .as_ref()
                        .and_then(|path| find_local_icon_asset(path))
                });

            let cover_url = cover_url.or_else(|| {
                value
                    .get("VaultThumbnailUrl")
                    .and_then(|url| url.as_str())
                    .map(str::trim)
                    .filter(|url| !url.is_empty())
                    .map(ToOwned::to_owned)
            });
            let icon_url = icon_url.or_else(|| cover_url.clone());

            let mut game = installed_game(
                &format!("epic-{title}"),
                title,
                "Epic Games".to_string(),
                install_path.clone(),
                cover_url,
            );
            game.external_id = catalog_item_id
                .or_else(|| app_name.clone())
                .or_else(|| namespace.clone());
            if let Some(app_name) = app_name {
                game.launch_uri = Some(format!(
                    "com.epicgames.launcher://apps/{app_name}?action=launch&silent=true"
                ));
            }
            game.logo_url = logo_url;
            game.icon_url = icon_url;
            game.logo_urls = game.logo_url.clone().into_iter().collect();
            game.icon_urls = game.icon_url.clone().into_iter().collect();
            if let Some(timestamp) = install_root
                .as_ref()
                .and_then(|path| get_dir_last_modified(path))
            {
                game.last_played_at = Some(unix_timestamp_to_iso(timestamp));
            }

            Some(game)
        })
        .collect()
}

fn is_epic_unreal_asset_manifest(manifest: &serde_json::Value, title: &str) -> bool {
    let title = title.to_lowercase();
    let app_name = manifest
        .get("AppName")
        .or_else(|| manifest.get("MainGameAppName"))
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .trim()
        .to_lowercase();

    let search_text = format!("{} {}", title, app_name);

    let namespace = manifest
        .get("CatalogNamespace")
        .or_else(|| manifest.get("Namespace"))
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .trim()
        .to_lowercase();

    // ── 1. Namespace-based check ──
    if namespace == "ue"
        || namespace == "uefn"
        || namespace.starts_with("ue-")
        || namespace.starts_with("ue_")
    {
        return true;
    }

    // ── 2. Category-based check via AppCategories in the manifest ──
    if let Some(cats) = manifest.get("AppCategories").and_then(|c| c.as_array()) {
        let paths: Vec<String> = cats
            .iter()
            .filter_map(|c| {
                // AppCategories can be strings or objects with "path"
                c.as_str().map(|s| s.to_lowercase()).or_else(|| {
                    c.get("path")
                        .and_then(|p| p.as_str())
                        .map(|s| s.to_lowercase())
                })
            })
            .collect();

        let has_games = paths.iter().any(|p| p.starts_with("games") || p == "game");
        let is_ue_asset = paths.iter().any(|p| {
            p.contains("unreal-engine")
                || p.contains("unreal_engine")
                || p.starts_with("asset-format")
                || p.starts_with("plugins")
                || p.starts_with("type/format-item")
        });

        if is_ue_asset && !has_games {
            return true;
        }
    }

    // ── 3. Keyword-based heuristics ──
    let unreal_marker = search_text.contains("unreal engine")
        || search_text.contains("unrealengine")
        || search_text.contains("ue marketplace")
        || search_text.contains("unreal marketplace")
        || search_text.contains("marketplaceassets")
        || search_text.contains("marketplace assets")
        || search_text.contains("fab.com")
        || search_text.contains("\"fab\"")
        || search_text.contains("\"ue\"")
        || search_text.contains("uefn")
        || search_text.contains("ue-");
    let asset_marker = search_text.contains("asset")
        || search_text.contains("vault")
        || search_text.contains("plugin")
        || search_text.contains("plugins")
        || search_text.contains("sample")
        || search_text.contains("template")
        || search_text.contains("environment")
        || search_text.contains("environments")
        || search_text.contains("material")
        || search_text.contains("materials")
        || search_text.contains("mesh")
        || search_text.contains("meshes")
        || search_text.contains("animation")
        || search_text.contains("animations")
        || search_text.contains("blueprint")
        || search_text.contains("blueprints")
        || search_text.contains("code plugin")
        || search_text.contains("props")
        || search_text.contains("texture")
        || search_text.contains("textures")
        || search_text.contains("vfx")
        || search_text.contains("sfx")
        || search_text.contains("sound effects")
        || search_text.contains("music pack")
        || search_text.contains("characters")
        || search_text.contains("3d model")
        || search_text.contains("kitbash")
        || search_text.contains("modular")
        || search_text.contains("stylized")
        || search_text.contains("low poly");
    let asset_title_marker = title.contains("asset")
        || title.contains("plugin")
        || title.contains("template")
        || title.contains("environment")
        || title.contains("material")
        || title.contains("mesh")
        || title.contains("animation")
        || title.contains("blueprint")
        || title.contains("props")
        || title.contains("vfx")
        || title.contains("sfx")
        || title.contains("texture")
        || title.contains("modular")
        || title.contains("stylized")
        || title.contains("low poly");

    (unreal_marker && asset_marker) || (unreal_marker && asset_title_marker)
}

#[derive(Clone, Default)]
pub struct EpicLauncherAssets {
    pub cover_url: Option<String>,
    pub logo_url: Option<String>,
    pub icon_url: Option<String>,
}

#[derive(Clone)]
struct EpicImageCandidate {
    url: String,
    image_type: String,
    width: Option<u64>,
    height: Option<u64>,
}

#[derive(serde::Serialize, serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct EpicCatalogAssetCache {
    entries: HashMap<String, EpicCatalogAssetCacheEntry>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct EpicCatalogAssetCacheEntry {
    cover_url: Option<String>,
    logo_url: Option<String>,
    icon_url: Option<String>,
    fetched_at: u64,
}

const EPIC_CATALOG_ASSET_CACHE_MAX_AGE_SECS: u64 = 7 * 24 * 60 * 60;

fn find_epic_launcher_assets(
    manifest: &serde_json::Value,
    title: &str,
    catalog_cache: &[serde_json::Value],
) -> EpicLauncherAssets {
    let mut images = Vec::new();
    collect_epic_image_candidates(manifest, &mut images);

    let identifiers = epic_manifest_identifiers(manifest);
    for item in catalog_cache
        .iter()
        .filter(|item| epic_catalog_item_matches(item, title, &identifiers))
    {
        collect_epic_image_candidates(item, &mut images);
    }

    EpicLauncherAssets {
        cover_url: select_epic_image(&images, EpicImagePurpose::Cover),
        logo_url: select_epic_image(&images, EpicImagePurpose::Logo),
        icon_url: select_epic_image(&images, EpicImagePurpose::Icon),
    }
}

pub fn find_epic_json_assets(value: &serde_json::Value) -> EpicLauncherAssets {
    let mut images = Vec::new();
    collect_epic_image_candidates(value, &mut images);

    EpicLauncherAssets {
        cover_url: select_epic_image(&images, EpicImagePurpose::Cover),
        logo_url: select_epic_image(&images, EpicImagePurpose::Logo),
        icon_url: select_epic_image(&images, EpicImagePurpose::Icon),
    }
}

pub fn epic_assets_have_banner_and_icon(assets: &EpicLauncherAssets) -> bool {
    assets.cover_url.is_some() && assets.icon_url.is_some()
}

pub fn get_epic_catalog_api_assets(
    namespace: Option<&str>,
    catalog_item_id: Option<&str>,
) -> EpicLauncherAssets {
    let Some(namespace) = namespace.map(str::trim).filter(|value| !value.is_empty()) else {
        return EpicLauncherAssets::default();
    };
    let Some(catalog_item_id) = catalog_item_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return EpicLauncherAssets::default();
    };

    let cache_key = epic_catalog_asset_cache_key(namespace, catalog_item_id);
    if let Ok(cache) = epic_catalog_asset_cache_store().lock() {
        if let Some(entry) = cache.entries.get(&cache_key) {
            if current_unix_timestamp().saturating_sub(entry.fetched_at)
                <= EPIC_CATALOG_ASSET_CACHE_MAX_AGE_SECS
            {
                return EpicLauncherAssets {
                    cover_url: entry.cover_url.clone(),
                    logo_url: entry.logo_url.clone(),
                    icon_url: entry.icon_url.clone(),
                };
            }
        }
    }

    let Some(assets) = fetch_epic_catalog_api_assets(namespace, catalog_item_id) else {
        return EpicLauncherAssets::default();
    };

    if let Ok(mut cache) = epic_catalog_asset_cache_store().lock() {
        cache.entries.insert(
            cache_key,
            EpicCatalogAssetCacheEntry {
                cover_url: assets.cover_url.clone(),
                logo_url: assets.logo_url.clone(),
                icon_url: assets.icon_url.clone(),
                fetched_at: current_unix_timestamp(),
            },
        );
        write_epic_catalog_asset_cache(&cache);
    }

    assets
}

fn epic_catalog_asset_cache_store() -> &'static Mutex<EpicCatalogAssetCache> {
    static CACHE: OnceLock<Mutex<EpicCatalogAssetCache>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(read_epic_catalog_asset_cache()))
}

fn epic_catalog_asset_cache_key(namespace: &str, catalog_item_id: &str) -> String {
    format!(
        "{}:{}",
        namespace.trim().to_lowercase(),
        catalog_item_id.trim().to_lowercase()
    )
}

fn read_epic_catalog_asset_cache() -> EpicCatalogAssetCache {
    let Some(cache_path) = epic_catalog_asset_cache_path() else {
        return EpicCatalogAssetCache::default();
    };

    fs::read_to_string(cache_path)
        .ok()
        .and_then(|contents| serde_json::from_str::<EpicCatalogAssetCache>(&contents).ok())
        .unwrap_or_default()
}

fn write_epic_catalog_asset_cache(cache: &EpicCatalogAssetCache) {
    let Some(cache_path) = epic_catalog_asset_cache_path() else {
        return;
    };

    if let Some(parent) = cache_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    if let Ok(contents) = serde_json::to_string_pretty(cache) {
        let _ = fs::write(cache_path, contents);
    }
}

fn fetch_epic_catalog_api_assets(
    namespace: &str,
    catalog_item_id: &str,
) -> Option<EpicLauncherAssets> {
    let payload = serde_json::json!({
        "query": r#"
            query getCatalogItem($namespace: String!, $id: String!, $locale: String) {
              Catalog {
                catalogItem(namespace: $namespace, id: $id, locale: $locale) {
                  id
                  namespace
                  title
                  keyImages {
                    type
                    url
                  }
                }
              }
            }
        "#,
        "variables": {
            "namespace": namespace,
            "id": catalog_item_id,
            "locale": "en-US",
        },
    });

    use std::io::Read;
    let response = ureq::post("https://graphql.epicgames.com/graphql")
        .header("Content-Type", "application/json")
        .send_json(payload)
        .ok()?;
    let mut reader = response.into_body().into_reader();
    let mut text = String::new();
    reader.read_to_string(&mut text).ok()?;
    let value = serde_json::from_str::<serde_json::Value>(&text).ok()?;
    let catalog_item = value.get("data")?.get("Catalog")?.get("catalogItem")?;

    Some(find_epic_json_assets(catalog_item))
}

fn read_epic_catalog_cache() -> Vec<serde_json::Value> {
    let cache_path =
        PathBuf::from(r"C:\ProgramData\Epic\EpicGamesLauncher\Data\Catalog\catcache.bin");
    let Ok(contents) = fs::read_to_string(cache_path) else {
        return Vec::new();
    };

    let decoded =
        if contents.trim_start().starts_with('[') || contents.trim_start().starts_with('{') {
            contents
        } else {
            let Some(bytes) = decode_base64(contents.trim()) else {
                return Vec::new();
            };
            String::from_utf8_lossy(&bytes).into_owned()
        };

    match serde_json::from_str::<serde_json::Value>(&decoded) {
        Ok(serde_json::Value::Array(items)) => items,
        Ok(value) => vec![value],
        Err(_) => Vec::new(),
    }
}

fn epic_manifest_identifiers(manifest: &serde_json::Value) -> HashSet<String> {
    [
        "CatalogItemId",
        "MainGameCatalogItemId",
        "AppName",
        "MainGameAppName",
        "InstallationGuid",
        "MandatoryAppFolderName",
    ]
    .into_iter()
    .filter_map(|key| manifest.get(key).and_then(|value| value.as_str()))
    .map(normalize_epic_match_value)
    .filter(|value| !value.is_empty())
    .collect()
}

fn epic_catalog_item_matches(
    item: &serde_json::Value,
    title: &str,
    identifiers: &HashSet<String>,
) -> bool {
    let normalized_title = normalize_epic_match_value(title);
    if item
        .get("title")
        .and_then(|value| value.as_str())
        .map(normalize_epic_match_value)
        .is_some_and(|value| value == normalized_title)
    {
        return true;
    }

    ["id", "namespace", "entitlementName"]
        .into_iter()
        .filter_map(|key| item.get(key).and_then(|value| value.as_str()))
        .map(normalize_epic_match_value)
        .any(|value| identifiers.contains(&value))
}

fn collect_epic_image_candidates(value: &serde_json::Value, images: &mut Vec<EpicImageCandidate>) {
    match value {
        serde_json::Value::Array(items) => {
            for item in items {
                collect_epic_image_candidates(item, images);
            }
        }
        serde_json::Value::Object(object) => {
            if let Some(url) = object
                .get("url")
                .or_else(|| object.get("URL"))
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|url| url.starts_with("http"))
            {
                let image_type = object
                    .get("type")
                    .or_else(|| object.get("Type"))
                    .and_then(|value| value.as_str())
                    .unwrap_or_default()
                    .to_string();
                let width = object.get("width").and_then(|value| value.as_u64());
                let height = object.get("height").and_then(|value| value.as_u64());

                if is_epic_image_candidate(&image_type, width, height) {
                    push_unique_epic_image(
                        images,
                        EpicImageCandidate {
                            url: url.to_string(),
                            image_type,
                            width,
                            height,
                        },
                    );
                }
            }

            for item in object.values() {
                collect_epic_image_candidates(item, images);
            }
        }
        _ => {}
    }
}

fn is_epic_image_candidate(image_type: &str, width: Option<u64>, height: Option<u64>) -> bool {
    let normalized = image_type.to_lowercase();
    width.zip(height).is_some()
        || normalized.contains("image")
        || normalized.contains("logo")
        || normalized.contains("icon")
        || normalized.contains("thumbnail")
        || normalized.contains("box")
}

fn push_unique_epic_image(images: &mut Vec<EpicImageCandidate>, candidate: EpicImageCandidate) {
    if !images.iter().any(|image| image.url == candidate.url) {
        images.push(candidate);
    }
}

enum EpicImagePurpose {
    Cover,
    Logo,
    Icon,
}

fn select_epic_image(images: &[EpicImageCandidate], purpose: EpicImagePurpose) -> Option<String> {
    images
        .iter()
        .max_by_key(|image| epic_image_score(image, &purpose))
        .filter(|image| epic_image_score(image, &purpose) > 0)
        .map(|image| image.url.clone())
}

fn epic_image_score(image: &EpicImageCandidate, purpose: &EpicImagePurpose) -> i32 {
    let image_type = image.image_type.to_lowercase();
    let is_wide = image
        .width
        .zip(image.height)
        .is_some_and(|(width, height)| width >= height);
    let is_squareish = image
        .width
        .zip(image.height)
        .is_some_and(|(width, height)| {
            let smaller = width.min(height).max(1);
            let larger = width.max(height);
            larger <= smaller * 2
        });

    match purpose {
        EpicImagePurpose::Cover => {
            let mut score = if is_wide { 40 } else { 5 };
            if image_type.contains("dieselgamebox") && !image_type.contains("tall") {
                score += 90;
            }
            if image_type.contains("wide")
                || image_type.contains("hero")
                || image_type.contains("featured")
                || image_type.contains("background")
            {
                score += 75;
            }
            if image_type.contains("tall") || image_type.contains("portrait") {
                score -= 60;
            }
            score
        }
        EpicImagePurpose::Logo => {
            let mut score = 0;
            if image_type.contains("logo") || image_type.contains("title") {
                score += 100;
            }
            if image_type.contains("wide") {
                score += 15;
            }
            score
        }
        EpicImagePurpose::Icon => {
            let mut score = if is_squareish { 25 } else { 5 };
            if image_type.contains("thumbnail")
                || image_type.contains("icon")
                || image_type.contains("small")
            {
                score += 85;
            }
            if image_type.contains("tall") || image_type.contains("dieselgameboxtall") {
                score += 35;
            }
            score
        }
    }
}

fn normalize_epic_match_value(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .collect()
}

fn decode_base64(input: &str) -> Option<Vec<u8>> {
    let mut output = Vec::new();
    let mut buffer = 0u32;
    let mut bits = 0u8;

    for byte in input.bytes().filter(|byte| !byte.is_ascii_whitespace()) {
        if byte == b'=' {
            break;
        }

        let value = match byte {
            b'A'..=b'Z' => byte - b'A',
            b'a'..=b'z' => byte - b'a' + 26,
            b'0'..=b'9' => byte - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => return None,
        } as u32;

        buffer = (buffer << 6) | value;
        bits += 6;

        while bits >= 8 {
            bits -= 8;
            output.push((buffer >> bits) as u8);
            buffer &= (1 << bits) - 1;
        }
    }

    Some(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_epic_catalog_images_by_purpose() {
        let value = serde_json::json!({
            "metadata": {
                "keyImages": [
                    {
                        "type": "DieselGameBoxTall",
                        "url": "https://cdn.example.invalid/box-tall.jpg"
                    },
                    {
                        "type": "DieselGameBoxLogo",
                        "url": "https://cdn.example.invalid/banner.jpg",
                        "width": 1920,
                        "height": 1080
                    },
                    {
                        "type": "Thumbnail",
                        "url": "https://cdn.example.invalid/icon.jpg",
                        "width": 512,
                        "height": 512
                    }
                ]
            }
        });

        let assets = find_epic_json_assets(&value);

        assert_eq!(
            assets.cover_url.as_deref(),
            Some("https://cdn.example.invalid/banner.jpg")
        );
        assert_eq!(
            assets.logo_url.as_deref(),
            Some("https://cdn.example.invalid/banner.jpg")
        );
        assert_eq!(
            assets.icon_url.as_deref(),
            Some("https://cdn.example.invalid/icon.jpg")
        );
    }
}
