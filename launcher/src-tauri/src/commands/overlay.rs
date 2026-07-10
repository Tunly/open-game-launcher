use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

#[cfg(test)]
mod overlay_settings_tests {
    use super::{
        enforce_noninteractive_fps_hud, ensure_fps_hud_enabled, fps_hud_position,
        fps_hud_should_be_closed, normalize_overlay_settings, FpsHudWindowControl,
        OverlaySettingsPayload,
    };
    use std::cell::Cell;

    struct FakeFpsHudWindow {
        ignore_error: Option<&'static str>,
        close_error: Option<&'static str>,
        close_calls: Cell<u32>,
    }

    impl FpsHudWindowControl for FakeFpsHudWindow {
        type Error = &'static str;

        fn ignore_pointer_input(&self) -> Result<(), Self::Error> {
            self.ignore_error.map_or(Ok(()), Err)
        }

        fn close_window(&self) -> Result<(), Self::Error> {
            self.close_calls.set(self.close_calls.get() + 1);
            self.close_error.map_or(Ok(()), Err)
        }
    }

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

    #[test]
    fn positions_the_external_fps_hud_in_each_configured_corner() {
        let screen = (100.0, 50.0, 1000.0, 700.0);
        let hud = (140.0, 40.0);

        assert_eq!(
            fps_hud_position("top_left", screen, hud, 12.0),
            (112.0, 62.0)
        );
        assert_eq!(
            fps_hud_position("top_right", screen, hud, 12.0),
            (948.0, 62.0)
        );
        assert_eq!(
            fps_hud_position("bottom_left", screen, hud, 12.0),
            (112.0, 698.0)
        );
        assert_eq!(
            fps_hud_position("bottom_right", screen, hud, 12.0),
            (948.0, 698.0)
        );
    }

    #[test]
    fn blocks_opening_the_external_fps_hud_while_disabled() {
        let mut settings = payload();
        settings.fps_hud_enabled = Some(false);

        assert!(fps_hud_should_be_closed(&settings));
        assert!(ensure_fps_hud_enabled(&settings)
            .unwrap_err()
            .contains("disabled"));
        settings.fps_hud_enabled = Some(true);
        assert!(!fps_hud_should_be_closed(&settings));
        assert!(ensure_fps_hud_enabled(&settings).is_ok());
    }

    #[test]
    fn closes_the_fps_hud_when_pointer_passthrough_cannot_be_enabled() {
        let window = FakeFpsHudWindow {
            ignore_error: Some("pointer setup failed"),
            close_error: None,
            close_calls: Cell::new(0),
        };

        let error = enforce_noninteractive_fps_hud(&window).unwrap_err();

        assert!(error.contains("pointer setup failed"));
        assert_eq!(window.close_calls.get(), 1);
    }

    #[test]
    fn reports_both_pointer_and_fail_closed_errors() {
        let window = FakeFpsHudWindow {
            ignore_error: Some("pointer setup failed"),
            close_error: Some("close failed"),
            close_calls: Cell::new(0),
        };

        let error = enforce_noninteractive_fps_hud(&window).unwrap_err();

        assert!(error.contains("pointer setup failed"));
        assert!(error.contains("close failed"));
        assert_eq!(window.close_calls.get(), 1);
    }
}

#[tauri::command]
pub fn toggle_in_game_overlay(app: tauri::AppHandle) -> Result<bool, String> {
    let label = "in_game_overlay";
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.close();
        Ok(false)
    } else {
        let settings = read_overlay_settings().unwrap_or_else(|_| default_overlay_settings());
        if !settings.is_enabled.unwrap_or(true) {
            return Err("Overlay is disabled in Overlay Settings.".to_string());
        }
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

/// Make the external overlay window pass pointer input through to the game
/// while pinned panels are displayed without the interactive launcher chrome.
#[tauri::command]
pub fn set_in_game_overlay_click_through(
    app: tauri::AppHandle,
    enabled: bool,
) -> Result<(), String> {
    let window = app
        .get_webview_window("in_game_overlay")
        .ok_or_else(|| "Overlay window is not open.".to_string())?;
    window
        .set_ignore_cursor_events(enabled)
        .map_err(|error| format!("Could not update overlay pointer handling: {error}"))
}

/// Toggle a minimal FPS-HUD window (no interaction, tiny, always-on-top).
#[tauri::command]
pub fn toggle_fps_hud(app: tauri::AppHandle) -> Result<bool, String> {
    let label = "fps_hud";
    if let Some(window) = app.get_webview_window(label) {
        window
            .close()
            .map_err(|error| format!("Could not close FPS HUD: {error}"))?;
        Ok(false)
    } else {
        let settings = read_overlay_settings().unwrap_or_else(|_| default_overlay_settings());
        ensure_fps_hud_enabled(&settings)?;
        let monitor = app
            .primary_monitor()
            .map_err(|e| e.to_string())?
            .ok_or("No primary monitor")?;
        let scale_factor = monitor.scale_factor();
        let origin = monitor.position();
        let size = monitor.size();
        let logical_screen = (
            origin.x as f64 / scale_factor,
            origin.y as f64 / scale_factor,
            size.width as f64 / scale_factor,
            size.height as f64 / scale_factor,
        );
        let w = 140.0;
        let h = 40.0;
        let position = settings
            .position
            .as_deref()
            .unwrap_or(DEFAULT_OVERLAY_POSITION);
        let (x, y) = fps_hud_position(position, logical_screen, (w, h), 12.0);

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
        enforce_noninteractive_fps_hud(&window)?;
        install_floating_window_guard(&window, "FPS-HUD");
        Ok(true)
    }
}

trait FpsHudWindowControl {
    type Error: std::fmt::Display;

    fn ignore_pointer_input(&self) -> Result<(), Self::Error>;
    fn close_window(&self) -> Result<(), Self::Error>;
}

impl FpsHudWindowControl for tauri::WebviewWindow {
    type Error = tauri::Error;

    fn ignore_pointer_input(&self) -> Result<(), Self::Error> {
        self.set_ignore_cursor_events(true)
    }

    fn close_window(&self) -> Result<(), Self::Error> {
        self.close()
    }
}

fn enforce_noninteractive_fps_hud<W: FpsHudWindowControl>(window: &W) -> Result<(), String> {
    window.ignore_pointer_input().map_err(|pointer_error| {
        let close_error = window.close_window().err();
        match close_error {
            Some(close_error) => format!(
                "Could not make FPS HUD non-interactive: {pointer_error}. Fail-closed window cleanup also failed: {close_error}"
            ),
            None => format!(
                "Could not make FPS HUD non-interactive: {pointer_error}. The window was closed."
            ),
        }
    })
}

fn ensure_fps_hud_enabled(settings: &OverlaySettingsPayload) -> Result<(), String> {
    if fps_hud_should_be_closed(settings) {
        Err("FPS HUD is disabled in Overlay Settings.".to_string())
    } else {
        Ok(())
    }
}

fn fps_hud_should_be_closed(settings: &OverlaySettingsPayload) -> bool {
    !settings.fps_hud_enabled.unwrap_or(false)
}

fn fps_hud_position(
    position: &str,
    screen: (f64, f64, f64, f64),
    hud: (f64, f64),
    margin: f64,
) -> (f64, f64) {
    let (screen_x, screen_y, screen_width, screen_height) = screen;
    let (hud_width, hud_height) = hud;
    let left = screen_x + margin;
    let right = screen_x + screen_width - hud_width - margin;
    let top = screen_y + margin;
    let bottom = screen_y + screen_height - hud_height - margin;

    match position {
        "top_left" => (left, top),
        "top_right" => (right, top),
        "bottom_left" => (left, bottom),
        _ => (right, bottom),
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
    let fps_hud_close_result = close_fps_hud_if_disabled(&app, &normalized);
    let hotkey_result = register_configured_overlay_hotkey(&app, previous.hotkey.as_deref());
    let _ = app.emit("overlay-settings-updated", normalized.clone());
    fps_hud_close_result?;
    hotkey_result?;
    Ok(normalized)
}

fn close_fps_hud_if_disabled(
    app: &tauri::AppHandle,
    settings: &OverlaySettingsPayload,
) -> Result<(), String> {
    if !fps_hud_should_be_closed(settings) {
        return Ok(());
    }

    if let Some(window) = app.get_webview_window("fps_hud") {
        window
            .close()
            .map_err(|error| format!("Could not close disabled FPS HUD: {error}"))?;
    }
    Ok(())
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
