use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

#[cfg(test)]
mod overlay_settings_tests {
    use super::{normalize_overlay_settings, OverlaySettingsPayload};

    fn payload() -> OverlaySettingsPayload {
        OverlaySettingsPayload {
            is_enabled: Some(true),
            hotkey: Some(" Control + Shift + F9 ".to_string()),
            position: Some("top_left".to_string()),
            opacity: Some(1.3),
            fps_hud_enabled: Some(true),
            show_gpu: Some(false),
        }
    }

    #[test]
    fn normalizes_hotkey_position_and_opacity() {
        let settings = normalize_overlay_settings(payload()).unwrap();

        assert_eq!(settings.hotkey.as_deref(), Some("Control+Shift+F9"));
        assert_eq!(settings.position.as_deref(), Some("top_left"));
        assert_eq!(settings.opacity, Some(1.0));
        assert_eq!(settings.fps_hud_enabled, Some(true));
        assert_eq!(settings.show_gpu, Some(false));
    }

    #[test]
    fn rejects_empty_hotkey() {
        let mut input = payload();
        input.hotkey = Some(" + ".to_string());

        let error = normalize_overlay_settings(input).unwrap_err();
        assert!(error.contains("cannot be empty"));
    }

    #[test]
    fn rejects_unknown_position() {
        let mut input = payload();
        input.position = Some("center".to_string());

        let error = normalize_overlay_settings(input).unwrap_err();
        assert!(error.contains("Unsupported overlay position"));
    }
}

#[tauri::command]
pub fn toggle_in_game_overlay(app: tauri::AppHandle) -> Result<bool, String> {
    let label = "in_game_overlay";
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.close();
        Ok(false)
    } else {
        let monitor = app
            .primary_monitor()
            .map_err(|e| e.to_string())?
            .ok_or("No primary monitor")?;
        let scale_factor = monitor.scale_factor();
        let position = monitor.position();
        let size = monitor.size();
        let logical_x = position.x as f64 / scale_factor;
        let logical_y = position.y as f64 / scale_factor;
        let logical_width = size.width as f64 / scale_factor;
        let logical_height = size.height as f64 / scale_factor;

        let window = WebviewWindowBuilder::new(&app, label, floating_window_url(&app, "overlay"))
            .title("OGL Overlay")
            .position(logical_x, logical_y)
            .inner_size(logical_width, logical_height)
            .resizable(false)
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .transparent(true)
            .build()
            .map_err(|e| format!("Failed to create overlay window: {e}"))?;
        install_floating_window_guard(&window, "Overlay");
        let _ = window.set_focus();
        Ok(true)
    }
}

/// Toggle a minimal FPS-HUD window (no interaction, tiny, always-on-top).
#[tauri::command]
pub fn toggle_fps_hud(app: tauri::AppHandle) -> Result<bool, String> {
    let label = "fps_hud";
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.close();
        Ok(false)
    } else {
        let monitor = app
            .primary_monitor()
            .map_err(|e| e.to_string())?
            .ok_or("No primary monitor")?;
        let size = monitor.size();
        let w = 140.0;
        let h = 40.0;
        let x = (size.width as f64) - w - 12.0;
        let y = 12.0;

        let window = WebviewWindowBuilder::new(&app, label, floating_window_url(&app, "fps-hud"))
            .title("OGL FPS")
            .inner_size(w, h)
            .position(x, y)
            .resizable(false)
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .transparent(false)
            .build()
            .map_err(|e| format!("Failed to create FPS HUD: {e}"))?;
        install_floating_window_guard(&window, "FPS-HUD");
        Ok(true)
    }
}

fn floating_window_url(_app: &tauri::AppHandle, view: &str) -> WebviewUrl {
    #[cfg(debug_assertions)]
    if let Some(dev_url) = _app.config().build.dev_url.as_ref() {
        let mut url = dev_url.clone();
        url.set_path("/");
        url.set_query(None);
        url.set_fragment(Some(view));
        return WebviewUrl::External(url);
    }

    WebviewUrl::App(format!("index.html#{view}").into())
}

fn install_floating_window_guard(window: &tauri::WebviewWindow, label: &'static str) {
    let window = window.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(1600)).await;
        let escaped_label = label.replace('\'', "\\'");
        let is_overlay = label == "Overlay";
        let page_background = if is_overlay {
            "rgba(0,0,0,.68)"
        } else {
            "#fbf8ef"
        };
        let page_color = if is_overlay { "#fff9ed" } else { "#171411" };
        let panel_background = if is_overlay {
            "rgba(23,20,17,.82)"
        } else {
            "#fff9ed"
        };
        let panel_shadow = if is_overlay { "#000" } else { "#1f1c0f" };
        let _ = window.eval(format!(
            r#"
            (() => {{
              const root = document.getElementById('root');
              const rootHasContent = root && root.childElementCount > 0;
              const bodyText = (document.body && document.body.innerText || '').trim();
              if (rootHasContent || bodyText.length > 0) return;
              document.documentElement.style.background = '{page_background}';
              document.body.style.margin = '0';
              document.body.style.background = '{page_background}';
              document.body.innerHTML = `
                <main style="display:grid;min-height:100vh;place-items:center;background:{page_background};color:{page_color};font:700 12px 'Courier New',monospace;">
                  <section style="max-width:300px;border:3px solid #171411;background:{panel_background};padding:14px;box-shadow:4px 4px 0 {panel_shadow};">
                    <div style="color:#b7102a;font-weight:900;text-transform:uppercase;margin-bottom:8px;">${{'{escaped_label}'}} nicht geladen</div>
                    <div>Das Fenster ist gestartet, aber die Launcher-Weboberflaeche hat kein HTML gerendert.</div>
                  </section>
                </main>
              `;
            }})();
            "#,
        ));
    });
}

// Overlay Settings

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OverlaySettingsPayload {
    pub is_enabled: Option<bool>,
    pub hotkey: Option<String>,
    pub position: Option<String>,
    pub opacity: Option<f64>,
    pub fps_hud_enabled: Option<bool>,
    pub show_gpu: Option<bool>,
}

const DEFAULT_OVERLAY_HOTKEY: &str = "Shift+F1";
const DEFAULT_OVERLAY_POSITION: &str = "bottom_right";
const OVERLAY_SETTINGS_FILE: &str = "overlay-settings.json";

#[tauri::command]
pub fn get_overlay_settings() -> Result<OverlaySettingsPayload, String> {
    read_overlay_settings()
}

#[tauri::command]
pub fn save_overlay_settings(
    app: tauri::AppHandle,
    settings: OverlaySettingsPayload,
) -> Result<OverlaySettingsPayload, String> {
    let previous = read_overlay_settings().unwrap_or_else(|_| default_overlay_settings());
    let normalized = normalize_overlay_settings(settings)?;
    write_overlay_settings(&normalized)?;
    register_configured_overlay_hotkey(&app, previous.hotkey.as_deref())?;
    Ok(normalized)
}

pub fn register_configured_overlay_hotkey(
    app: &tauri::AppHandle,
    previous_hotkey: Option<&str>,
) -> Result<String, String> {
    let settings = read_overlay_settings().unwrap_or_else(|_| default_overlay_settings());
    let hotkey = settings
        .hotkey
        .clone()
        .unwrap_or_else(|| DEFAULT_OVERLAY_HOTKEY.to_string());
    let shortcut_manager = app.global_shortcut();

    if let Some(previous) = previous_hotkey {
        if previous != hotkey && shortcut_manager.is_registered(previous) {
            let _ = shortcut_manager.unregister(previous);
        }
    }

    if !settings.is_enabled.unwrap_or(true) {
        if shortcut_manager.is_registered(hotkey.as_str()) {
            let _ = shortcut_manager.unregister(hotkey.as_str());
        }
        return Ok(hotkey);
    }

    if !shortcut_manager.is_registered(hotkey.as_str()) {
        shortcut_manager
            .register(hotkey.as_str())
            .map_err(|error| format!("Could not register overlay hotkey '{hotkey}': {error}"))?;
    }

    Ok(hotkey)
}

fn default_overlay_settings() -> OverlaySettingsPayload {
    OverlaySettingsPayload {
        is_enabled: Some(true),
        hotkey: Some(DEFAULT_OVERLAY_HOTKEY.into()),
        position: Some(DEFAULT_OVERLAY_POSITION.into()),
        opacity: Some(0.95),
        fps_hud_enabled: Some(false),
        show_gpu: Some(true),
    }
}

fn normalize_overlay_settings(
    input: OverlaySettingsPayload,
) -> Result<OverlaySettingsPayload, String> {
    let defaults = default_overlay_settings();
    let hotkey = normalize_overlay_hotkey(input.hotkey.or(defaults.hotkey))?;
    let position = normalize_overlay_position(input.position.or(defaults.position))?;
    let opacity = input
        .opacity
        .or(defaults.opacity)
        .unwrap_or(0.95)
        .clamp(0.5, 1.0);

    Ok(OverlaySettingsPayload {
        is_enabled: Some(input.is_enabled.or(defaults.is_enabled).unwrap_or(true)),
        hotkey: Some(hotkey),
        position: Some(position),
        opacity: Some(opacity),
        fps_hud_enabled: Some(
            input
                .fps_hud_enabled
                .or(defaults.fps_hud_enabled)
                .unwrap_or(false),
        ),
        show_gpu: Some(input.show_gpu.or(defaults.show_gpu).unwrap_or(true)),
    })
}

fn normalize_overlay_hotkey(value: Option<String>) -> Result<String, String> {
    let raw = value.unwrap_or_else(|| DEFAULT_OVERLAY_HOTKEY.to_string());
    let parts: Vec<String> = raw
        .split('+')
        .map(|part| part.trim())
        .filter(|part| !part.is_empty())
        .map(ToString::to_string)
        .collect();
    if parts.is_empty() {
        return Err("Overlay hotkey cannot be empty.".to_string());
    }
    let normalized = parts.join("+");
    if normalized.len() > 64 {
        return Err("Overlay hotkey is too long.".to_string());
    }
    if !normalized
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '+' | '-' | '_'))
    {
        return Err("Overlay hotkey contains unsupported characters.".to_string());
    }
    Ok(normalized)
}

fn normalize_overlay_position(value: Option<String>) -> Result<String, String> {
    let position = value.unwrap_or_else(|| DEFAULT_OVERLAY_POSITION.to_string());
    match position.as_str() {
        "top_left" | "top_right" | "bottom_left" | "bottom_right" => Ok(position),
        _ => Err(format!("Unsupported overlay position '{position}'.")),
    }
}

fn overlay_settings_path() -> Result<PathBuf, String> {
    super::games::core::open_game_launcher_data_dir()
        .map(|path| path.join(OVERLAY_SETTINGS_FILE))
        .ok_or_else(|| "Could not resolve Open Game Launcher data directory.".to_string())
}

fn read_overlay_settings() -> Result<OverlaySettingsPayload, String> {
    let path = overlay_settings_path()?;
    if !path.exists() {
        return Ok(default_overlay_settings());
    }
    let contents = std::fs::read_to_string(&path)
        .map_err(|error| format!("Could not read overlay settings: {error}"))?;
    let parsed = serde_json::from_str::<OverlaySettingsPayload>(&contents)
        .map_err(|error| format!("Could not parse overlay settings: {error}"))?;
    normalize_overlay_settings(parsed)
}

fn write_overlay_settings(settings: &OverlaySettingsPayload) -> Result<(), String> {
    let path = overlay_settings_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create overlay settings folder: {error}"))?;
    }
    let contents = serde_json::to_string_pretty(settings)
        .map_err(|error| format!("Could not serialize overlay settings: {error}"))?;
    std::fs::write(path, contents)
        .map_err(|error| format!("Could not write overlay settings: {error}"))
}

// â”€â”€â”€ Achievement Popup Emitter â”€â”€â”€

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AchievementPopupPayload {
    pub game_title: String,
    pub achievement_name: String,
    pub description: String,
    pub rarity: String,
    pub icon_url: Option<String>,
}

#[tauri::command]
pub fn emit_achievement_popup(
    app: tauri::AppHandle,
    payload: AchievementPopupPayload,
) -> Result<(), String> {
    let _ = app.emit("achievement-unlocked", payload);
    Ok(())
}
