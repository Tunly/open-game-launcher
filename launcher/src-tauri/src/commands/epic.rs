use std::{fs, path::PathBuf, process::Command};

use futures_util::{stream, StreamExt};

use super::games::core::open_game_launcher_data_dir;
use super::games::detect::{self, EpicLauncherAssets};
use super::games::types::UnifiedAchievement;
use super::system::OwnedGame;

// For now let's just copy what we need or reference them cleanly.

const EPIC_OWNED_ASSET_CONCURRENCY: usize = 6;

pub async fn ensure_legendary_binary() -> Result<PathBuf, String> {
    let data_dir = open_game_launcher_data_dir()
        .ok_or_else(|| "Could not determine local data directory.".to_string())?;

    let tools_dir = data_dir.join("tools");
    if !tools_dir.exists() {
        fs::create_dir_all(&tools_dir).map_err(|e| format!("Failed to create tools dir: {e}"))?;
    }

    let legendary_path = tools_dir.join(if cfg!(target_os = "windows") {
        "legendary.exe"
    } else {
        "legendary"
    });

    if legendary_path.exists() {
        return Ok(legendary_path);
    }

    println!("[Legendary] Downloading legendary binary...");

    // For MVP, just hardcode Windows URL. In a real app we'd check OS.
    let url = if cfg!(target_os = "windows") {
        "https://github.com/derrod/legendary/releases/latest/download/legendary.exe"
    } else {
        return Err("Legendary dynamic download currently only implemented for Windows MVP. Please install it manually.".to_string());
    };

    let response = reqwest::get(url)
        .await
        .map_err(|e| format!("Failed to download legendary: {e}"))?;

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read legendary bytes: {e}"))?;

    fs::write(&legendary_path, bytes)
        .map_err(|e| format!("Failed to save legendary binary: {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = fs::metadata(&legendary_path) {
            let mut perms = metadata.permissions();
            perms.set_mode(0o755);
            let _ = fs::set_permissions(&legendary_path, perms);
        }
    }

    println!("[Legendary] Download complete!");

    Ok(legendary_path)
}

#[tauri::command]
pub async fn open_epic_login_window(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;

    // Close existing if open
    if let Some(existing) = app.get_webview_window("epic-login") {
        let _ = existing.close();
        // Give the OS a moment to clean up the window
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }

    let url = "https://legendary.gl/epiclogin";
    let app_clone = app.clone();

    let script = r#"
        (function() {
            const interval = setInterval(() => {
                try {
                    const text = document.body ? document.body.innerText : "";
                    if (text.includes("authorizationCode")) {
                        clearInterval(interval);
                        const startPos = text.indexOf("{");
                        const endPos = text.lastIndexOf("}") + 1;
                        if (startPos !== -1 && endPos > startPos) {
                            const jsonText = text.substring(startPos, endPos);
                            const parsed = JSON.parse(jsonText);
                            const code = parsed.authorizationCode || parsed.code;
                            if (code) {
                                window.location.href = "https://localhost/launcher/authorized?code=" + encodeURIComponent(code);
                            }
                        }
                    }
                } catch (e) {
                    console.error("[Epic Auto-Login] Error:", e);
                }
            }, 300);
        })();
    "#;

    let _window = tauri::WebviewWindowBuilder::new(
        &app,
        "epic-login",
        tauri::WebviewUrl::External(
            url.parse()
                .map_err(|e| format!("Failed to parse login URL: {e}"))?,
        ),
    )
    .title("Epic Games Login")
    .inner_size(500.0, 700.0)
    .center()
    .resizable(true)
    .initialization_script(script)
    .on_navigation(move |url| {
        let url_str = url.to_string();
        if url_str.starts_with("https://localhost/launcher/authorized") {
            if let Some(pos) = url_str.find("code=") {
                let rest = &url_str[pos + 5..];
                let code = rest.split('&').next().unwrap_or("");
                if !code.is_empty() {
                    println!("[Epic Login] Extracted code: {}", code);
                    use tauri::Emitter;
                    let _ = app_clone.emit("epic_login_code", code.to_string());

                    if let Some(window) = app_clone.get_webview_window("epic-login") {
                        let _ = window.close();
                    }
                }
            }
            return false; // Stop navigation
        }
        true
    })
    .build()
    .map_err(|e| format!("Failed to create login window: {e}"))?;

    Ok(())
}

#[tauri::command]
pub async fn authenticate_epic_legendary(code: String) -> Result<String, String> {
    let legendary = ensure_legendary_binary().await?;

    let output = Command::new(&legendary)
        .arg("auth")
        .arg("--code")
        .arg(code.trim())
        .arg("--clear-cache")
        .output()
        .map_err(|e| format!("Failed to run legendary auth: {e}"))?;

    if output.status.success() {
        Ok("Epic Games authenticated successfully via Legendary.".to_string())
    } else {
        Err(format!(
            "Legendary auth failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

#[tauri::command]
pub async fn fetch_epic_owned_games() -> Result<Vec<OwnedGame>, String> {
    let legendary = ensure_legendary_binary().await?;

    let output = Command::new(&legendary)
        .arg("list")
        .arg("--json")
        .output()
        .map_err(|e| format!("Failed to run legendary list: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "Legendary list failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let data_str = String::from_utf8_lossy(&output.stdout);

    let data: Vec<serde_json::Value> = serde_json::from_str(&data_str)
        .map_err(|e| format!("Failed to parse legendary list json: {e}"))?;

    let games = stream::iter(
        data.into_iter()
            .filter(|item| !is_unreal_catalog_asset(item))
            .map(epic_owned_game_draft),
    )
    .map(epic_owned_game_from_draft)
    .buffered(EPIC_OWNED_ASSET_CONCURRENCY)
    .collect::<Vec<_>>()
    .await;

    Ok(games)
}

pub async fn fetch_epic_legendary_achievements(
    app_name: &str,
) -> Result<Vec<UnifiedAchievement>, String> {
    let app_name = app_name.trim();
    if app_name.is_empty() {
        return Err("Epic app name is empty.".to_string());
    }

    let legendary = ensure_legendary_binary().await?;
    let output = Command::new(&legendary)
        .arg("info")
        .arg(app_name)
        .arg("--json")
        .output()
        .map_err(|e| format!("Failed to run legendary info: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "Legendary info failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let data: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse legendary info json: {e}"))?;
    let achievements = parse_epic_legendary_achievements(&data);
    if achievements.is_empty() {
        return Err(format!(
            "Legendary info did not expose achievement metadata for {app_name}."
        ));
    }

    Ok(achievements)
}

fn parse_epic_legendary_achievements(value: &serde_json::Value) -> Vec<UnifiedAchievement> {
    let mut achievements = Vec::new();
    collect_epic_achievement_arrays(value, &mut achievements, false);
    achievements
}

fn collect_epic_achievement_arrays(
    value: &serde_json::Value,
    achievements: &mut Vec<UnifiedAchievement>,
    in_achievement_context: bool,
) {
    match value {
        serde_json::Value::Array(items) => {
            let parsed = if in_achievement_context {
                items
                    .iter()
                    .filter_map(epic_json_achievement_to_unified)
                    .collect::<Vec<_>>()
            } else {
                Vec::new()
            };
            if !parsed.is_empty() {
                for achievement in parsed {
                    if !achievements
                        .iter()
                        .any(|existing| existing.id == achievement.id)
                    {
                        achievements.push(achievement);
                    }
                }
            } else {
                for item in items {
                    collect_epic_achievement_arrays(item, achievements, in_achievement_context);
                }
            }
        }
        serde_json::Value::Object(object) => {
            for (key, child) in object {
                let child_is_achievement_context =
                    in_achievement_context || key.to_lowercase().contains("achievement");
                collect_epic_achievement_arrays(child, achievements, child_is_achievement_context);
            }
        }
        _ => {}
    }
}

fn epic_json_achievement_to_unified(value: &serde_json::Value) -> Option<UnifiedAchievement> {
    let id = epic_json_string(
        value,
        &[
            &["achievementId"][..],
            &["achievement_id"][..],
            &["id"][..],
            &["name"][..],
            &["title"][..],
        ],
    )?;
    let name = epic_json_string(
        value,
        &[
            &["displayName"][..],
            &["display_name"][..],
            &["title"][..],
            &["name"][..],
        ],
    )?;
    let description = epic_json_string(
        value,
        &[
            &["description"][..],
            &["desc"][..],
            &["lockedDescription"][..],
            &["locked_description"][..],
        ],
    );
    let unlocked_at = epic_json_string(
        value,
        &[
            &["unlockedAt"][..],
            &["unlocked_at"][..],
            &["unlockTime"][..],
            &["unlock_time"][..],
            &["dateUnlocked"][..],
            &["date_unlocked"][..],
        ],
    );
    let icon_url = epic_json_string(
        value,
        &[
            &["iconUrl"][..],
            &["icon_url"][..],
            &["unlockedIconUrl"][..],
            &["unlocked_icon_url"][..],
            &["imageUrl"][..],
            &["image_url"][..],
        ],
    );
    let rarity = epic_json_number(
        value,
        &[
            &["rarity"][..],
            &["unlockPercentage"][..],
            &["unlock_percentage"][..],
            &["percent"][..],
        ],
    );

    Some(UnifiedAchievement {
        id: format!("epic-{}", normalize_epic_achievement_id(&id)),
        name,
        description,
        icon_url,
        unlocked_at,
        rarity,
        source: Some("epic".to_string()),
        source_achievement_id: Some(id),
        provider_confidence: Some("unofficial".to_string()),
    })
}

fn is_unreal_catalog_asset(item: &serde_json::Value) -> bool {
    let title = epic_json_string(
        item,
        &[
            &["app_title"][..],
            &["metadata", "title"][..],
            &["title"][..],
        ],
    )
    .unwrap_or_default()
    .to_lowercase();

    let description = epic_json_string(
        item,
        &[&["metadata", "description"][..], &["description"][..]],
    )
    .unwrap_or_default()
    .to_lowercase();

    let search_text = format!("{} {}", title, description);

    let namespace = epic_json_string(
        item,
        &[
            &["asset_info", "namespace"][..],
            &["metadata", "namespace"][..],
            &["namespace"][..],
        ],
    )
    .unwrap_or_default()
    .to_lowercase();

    // ── 1. Namespace-based check (most reliable) ──
    if namespace == "ue"
        || namespace == "uefn"
        || namespace.starts_with("ue-")
        || namespace.starts_with("ue_")
    {
        return true;
    }

    // ── 2. Category-based check via metadata.categories ──
    // Legendary JSON for real games has [{"path":"games"},{"path":"applications"}]
    // UE assets have [{"path":"asset-format/game-engine/unreal-engine"},{"path":"plugins/engine"},...]
    let categories = item
        .get("metadata")
        .and_then(|m| m.get("categories"))
        .and_then(|c| c.as_array());

    if let Some(cats) = categories {
        let paths: Vec<String> = cats
            .iter()
            .filter_map(|c| c.get("path").and_then(|p| p.as_str()))
            .map(|s| s.to_lowercase())
            .collect();

        let has_games = paths.iter().any(|p| p.starts_with("games"));
        let is_ue_asset = paths.iter().any(|p| {
            p.contains("unreal-engine")
                || p.contains("unreal_engine")
                || p.starts_with("asset-format")
                || p.starts_with("plugins")
                || p.starts_with("type/format-item")
        });

        // Has UE asset category markers but is NOT a game → skip it
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

    unreal_marker && (asset_marker || asset_title_marker)
}

#[derive(Clone)]
struct EpicOwnedGameDraft {
    app_name: String,
    title: String,
    api_assets: EpicLauncherAssets,
    catalog_id: Option<String>,
    namespace: Option<String>,
}

#[derive(Default)]
struct EpicOwnedOnlineAssets {
    catalog_assets: EpicLauncherAssets,
    rawg_assets: Option<super::games::types::RawgAssets>,
}

fn epic_owned_game_draft(item: serde_json::Value) -> EpicOwnedGameDraft {
    let app_name = epic_json_string(
        &item,
        &[
            &["app_name"][..],
            &["asset_info", "app_name"][..],
            &["appName"][..],
        ],
    )
    .unwrap_or_default();
    let title = epic_json_string(
        &item,
        &[
            &["app_title"][..],
            &["metadata", "title"][..],
            &["title"][..],
        ],
    )
    .unwrap_or_else(|| "Epic Game".to_string());
    let api_assets = detect::find_epic_json_assets(&item);
    let catalog_id = epic_json_string(
        &item,
        &[
            &["asset_info", "catalog_item_id"][..],
            &["metadata", "id"][..],
            &["catalog_item_id"][..],
            &["catalogItemId"][..],
        ],
    );
    let namespace = epic_json_string(
        &item,
        &[
            &["asset_info", "namespace"][..],
            &["metadata", "namespace"][..],
            &["namespace"][..],
        ],
    );

    EpicOwnedGameDraft {
        app_name,
        title,
        api_assets,
        catalog_id,
        namespace,
    }
}

async fn epic_owned_game_from_draft(draft: EpicOwnedGameDraft) -> OwnedGame {
    let online_assets = if detect::epic_assets_have_banner_and_icon(&draft.api_assets) {
        EpicOwnedOnlineAssets::default()
    } else {
        let api_assets = draft.api_assets.clone();
        let asset_id = draft
            .catalog_id
            .clone()
            .unwrap_or_else(|| draft.app_name.clone());
        let title = draft.title.clone();
        let namespace = draft.namespace.clone();
        let catalog_id = draft.catalog_id.clone();

        tokio::task::spawn_blocking(move || {
            let catalog_assets =
                detect::get_epic_catalog_api_assets(namespace.as_deref(), catalog_id.as_deref());
            let has_epic_banner_and_icon = (api_assets.cover_url.is_some()
                || catalog_assets.cover_url.is_some())
                && (api_assets.icon_url.is_some() || catalog_assets.icon_url.is_some());
            let rawg_assets = if has_epic_banner_and_icon {
                None
            } else {
                detect::get_rawg_epic_assets(&asset_id, &title)
            };

            EpicOwnedOnlineAssets {
                catalog_assets,
                rawg_assets,
            }
        })
        .await
        .unwrap_or_default()
    };

    let cover_url = draft
        .api_assets
        .cover_url
        .or(online_assets.catalog_assets.cover_url)
        .or_else(|| {
            online_assets
                .rawg_assets
                .as_ref()
                .and_then(|assets| assets.cover_url.clone())
        });
    let logo_url = draft
        .api_assets
        .logo_url
        .or(online_assets.catalog_assets.logo_url)
        .or_else(|| {
            online_assets
                .rawg_assets
                .as_ref()
                .and_then(|assets| assets.logo_url.clone())
        });
    let icon_url = draft
        .api_assets
        .icon_url
        .or(online_assets.catalog_assets.icon_url)
        .or_else(|| {
            online_assets
                .rawg_assets
                .as_ref()
                .and_then(|assets| assets.icon_url.clone())
        })
        .or_else(|| logo_url.clone())
        .or_else(|| cover_url.clone());

    OwnedGame {
        id: format!("epic-owned-{}", draft.app_name),
        external_id: Some(draft.app_name.clone()),
        title: draft.title.clone(),
        description: format!("Epic Games game (Owned). ID: {}", draft.app_name),
        cover_url,
        logo_url,
        icon_url,
        playtime_minutes: 0,
        last_played_at: None,
        cloud_gaming_url: None,
    }
}

fn epic_json_string(value: &serde_json::Value, paths: &[&[&str]]) -> Option<String> {
    paths.iter().find_map(|path| {
        let mut current = value;
        for key in *path {
            current = current.get(*key)?;
        }
        current
            .as_str()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
    })
}

fn epic_json_number(value: &serde_json::Value, paths: &[&[&str]]) -> Option<f64> {
    paths.iter().find_map(|path| {
        let mut current = value;
        for key in *path {
            current = current.get(*key)?;
        }
        if let Some(number) = current.as_f64() {
            return Some(number);
        }
        current
            .as_str()
            .map(|value| value.trim().trim_end_matches('%').replace(',', "."))
            .and_then(|value| value.parse::<f64>().ok())
    })
}

fn normalize_epic_achievement_id(value: &str) -> String {
    let mut normalized = String::new();
    let mut last_was_dash = false;

    for character in value.chars().flat_map(char::to_lowercase) {
        if character.is_ascii_alphanumeric() {
            normalized.push(character);
            last_was_dash = false;
        } else if !last_was_dash {
            normalized.push('-');
            last_was_dash = true;
        }
    }

    normalized.trim_matches('-').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_nested_legendary_achievement_metadata() {
        let value = serde_json::json!({
            "metadata": {
                "achievements": {
                    "definitions": [
                        {
                            "achievementId": "A_HOUSE_DIVIDED",
                            "displayName": "A House Divided",
                            "description": "Hack a geth collective",
                            "unlockPercentage": "28%",
                            "unlockedAt": "2026-06-07T01:20:00Z",
                            "iconUrl": "https://example.com/icon.png"
                        },
                        {
                            "achievement_id": "PERSONAL_TOUCH",
                            "title": "A Personal Touch",
                            "desc": "Modify a weapon.",
                            "rarity": 31
                        }
                    ]
                }
            }
        });

        let achievements = parse_epic_legendary_achievements(&value);

        assert_eq!(achievements.len(), 2);
        assert_eq!(achievements[0].id, "epic-a-house-divided");
        assert_eq!(achievements[0].name, "A House Divided");
        assert_eq!(
            achievements[0].description.as_deref(),
            Some("Hack a geth collective")
        );
        assert_eq!(achievements[0].rarity, Some(28.0));
        assert_eq!(
            achievements[0].unlocked_at.as_deref(),
            Some("2026-06-07T01:20:00Z")
        );
        assert_eq!(achievements[0].source.as_deref(), Some("epic"));
        assert_eq!(
            achievements[0].provider_confidence.as_deref(),
            Some("unofficial")
        );
        assert_eq!(
            achievements[1].source_achievement_id.as_deref(),
            Some("PERSONAL_TOUCH")
        );
    }

    #[test]
    fn ignores_non_achievement_arrays_in_legendary_metadata() {
        let value = serde_json::json!({
            "metadata": {
                "categories": [
                    { "path": "games" },
                    { "path": "applications" }
                ],
                "achievementStatus": {
                    "items": [
                        {
                            "id": "first_win",
                            "name": "First Win"
                        }
                    ]
                }
            }
        });

        let achievements = parse_epic_legendary_achievements(&value);

        assert_eq!(achievements.len(), 1);
        assert_eq!(achievements[0].id, "epic-first-win");
        assert_eq!(achievements[0].name, "First Win");
    }
}
