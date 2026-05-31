use std::{fs, path::PathBuf, process::Command};

use super::games::core::open_game_launcher_data_dir;
use super::system::OwnedGame;

// For now let's just copy what we need or reference them cleanly.

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

    let mut games = Vec::new();

    for item in data {
        let app_name = item["app_name"].as_str().unwrap_or_default();
        let title = item["app_title"].as_str().unwrap_or("Epic Game");

        // Legendary JSON has some metadata we can use.
        // We'll use the new get_rawg_game_assets to fill in the missing artwork!
        // We must run it in a blocking task because it uses blocking HTTP reqwest.
        let app_name_clone = app_name.to_string();
        let title_clone = title.to_string();
        let rawg_assets = tokio::task::spawn_blocking(move || {
            std::thread::spawn(move || {
                crate::commands::games::detect::get_rawg_game_assets(
                    "epic",
                    &app_name_clone,
                    &title_clone,
                )
            })
            .join()
            .unwrap_or(None)
        })
        .await
        .unwrap_or(None);

        games.push(OwnedGame {
            id: format!("epic-owned-{app_name}"),
            external_id: Some(app_name.to_string()),
            title: title.to_string(),
            description: format!("Epic Games game (Owned). ID: {app_name}"),
            cover_url: rawg_assets.as_ref().and_then(|a| a.cover_url.clone()),
            logo_url: rawg_assets.as_ref().and_then(|a| a.logo_url.clone()),
            icon_url: rawg_assets.as_ref().and_then(|a| a.icon_url.clone()),
            playtime_minutes: 0,
            last_played_at: None,
            cloud_gaming_url: None,
        });
    }

    Ok(games)
}
