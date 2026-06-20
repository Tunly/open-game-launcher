use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

// Windows-specific GDI imports
#[cfg(target_os = "windows")]
use base64::Engine;
#[cfg(target_os = "windows")]
use std::ffi::c_void;
#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::{HGLOBAL, HWND};
#[cfg(target_os = "windows")]
use windows_sys::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
    ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS, SRCCOPY,
};
#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN};

// ─── Screenshot Manager ───

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotMeta {
    pub id: String,
    pub file_name: String,
    pub path: String,
    pub base64_preview: Option<String>,
    pub created_at: String,
    pub width: i32,
    pub height: i32,
    pub size_bytes: u64,
}

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

/// Capture a fullscreen screenshot, save locally, and return metadata.
#[tauri::command]
pub fn capture_screenshot(app: tauri::AppHandle) -> Result<ScreenshotMeta, String> {
    #[cfg(target_os = "windows")]
    {
        let meta = unsafe { capture_screenshot_gdi(&app)? };
        // Emit event so overlay can refresh gallery immediately
        let _ = app.emit("screenshot-captured", meta.clone());
        Ok(meta)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Err("Screenshot capture not yet implemented for this OS".to_string())
    }
}

#[cfg(target_os = "windows")]
unsafe fn capture_screenshot_gdi(app: &tauri::AppHandle) -> Result<ScreenshotMeta, String> {
    let hwnd: HWND = std::ptr::null_mut();
    let screen_dc = GetDC(hwnd);
    if screen_dc.is_null() {
        return Err("Failed to get screen DC".to_string());
    }

    let width = GetSystemMetrics(SM_CXSCREEN);
    let height = GetSystemMetrics(SM_CYSCREEN);

    let mem_dc = CreateCompatibleDC(screen_dc);
    if mem_dc.is_null() {
        ReleaseDC(hwnd, screen_dc);
        return Err("Failed to create compatible DC".to_string());
    }

    let bitmap = CreateCompatibleBitmap(screen_dc, width, height);
    if bitmap.is_null() {
        DeleteDC(mem_dc);
        ReleaseDC(hwnd, screen_dc);
        return Err("Failed to create compatible bitmap".to_string());
    }

    let old_bitmap = SelectObject(mem_dc, bitmap as HGLOBAL);

    if BitBlt(mem_dc, 0, 0, width, height, screen_dc, 0, 0, SRCCOPY) == 0 {
        SelectObject(mem_dc, old_bitmap);
        DeleteObject(bitmap as HGLOBAL);
        DeleteDC(mem_dc);
        ReleaseDC(hwnd, screen_dc);
        return Err("BitBlt failed".to_string());
    }

    let mut bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            biHeight: -height,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: 0,
            biSizeImage: 0,
            biXPelsPerMeter: 0,
            biYPelsPerMeter: 0,
            biClrUsed: 0,
            biClrImportant: 0,
        },
        bmiColors: [std::mem::zeroed(); 1],
    };

    let row_size = ((width * 4 + 3) / 4) * 4;
    let buf_size = (row_size * height) as usize;
    let mut buffer: Vec<u8> = vec![0; buf_size];

    let lines_copied = GetDIBits(
        mem_dc,
        bitmap,
        0,
        height as u32,
        buffer.as_mut_ptr() as *mut c_void,
        &mut bmi,
        DIB_RGB_COLORS,
    );

    SelectObject(mem_dc, old_bitmap);
    DeleteObject(bitmap as HGLOBAL);
    DeleteDC(mem_dc);
    ReleaseDC(hwnd, screen_dc);

    if lines_copied == 0 || lines_copied == -1 {
        return Err("GetDIBits failed".to_string());
    }

    let mut rgb_buf: Vec<u8> = Vec::with_capacity((width * height * 3) as usize);
    for y in 0..height {
        for x in 0..width {
            let offset = (y * row_size + x * 4) as usize;
            let b = buffer[offset];
            let g = buffer[offset + 1];
            let r = buffer[offset + 2];
            rgb_buf.push(r);
            rgb_buf.push(g);
            rgb_buf.push(b);
        }
    }

    let img = image::RgbImage::from_raw(width as u32, height as u32, rgb_buf.clone())
        .ok_or("Failed to create image buffer".to_string())?;

    let mut jpeg_bytes: Vec<u8> = Vec::new();
    img.write_to(
        &mut std::io::Cursor::new(&mut jpeg_bytes),
        image::ImageFormat::Jpeg,
    )
    .map_err(|e| format!("JPEG encode error: {e}"))?;

    // Save to app data dir
    let app_dir = app
        .path()
        .resolve("screenshots", tauri::path::BaseDirectory::AppData)
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;

    let id = format!("{}", uuid::Uuid::new_v4());
    let file_name = format!("ogl_{}.jpg", &id[..8]);
    let path = app_dir.join(&file_name);
    std::fs::write(&path, &jpeg_bytes).map_err(|e| e.to_string())?;

    // Small preview base64 (640px width max)
    let preview = image::RgbImage::from_raw(width as u32, height as u32, rgb_buf).map(|mut i| {
        if i.width() > 640 {
            let ratio = 640.0 / i.width() as f64;
            let new_h = (i.height() as f64 * ratio) as u32;
            i = image::imageops::resize(&i, 640, new_h, image::imageops::FilterType::Triangle);
        }
        let mut buf = Vec::new();
        let _ = i.write_to(
            &mut std::io::Cursor::new(&mut buf),
            image::ImageFormat::Jpeg,
        );
        base64::engine::general_purpose::STANDARD.encode(&buf)
    });

    Ok(ScreenshotMeta {
        id,
        file_name,
        path: path.to_string_lossy().to_string(),
        base64_preview: preview,
        created_at: chrono::Utc::now().to_rfc3339(),
        width,
        height,
        size_bytes: jpeg_bytes.len() as u64,
    })
}

#[tauri::command]
pub fn list_screenshots(app: tauri::AppHandle) -> Result<Vec<ScreenshotMeta>, String> {
    let app_dir = app
        .path()
        .resolve("screenshots", tauri::path::BaseDirectory::AppData)
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&app_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(ext) = path.extension() {
                if ext.eq_ignore_ascii_case("jpg")
                    || ext.eq_ignore_ascii_case("jpeg")
                    || ext.eq_ignore_ascii_case("png")
                {
                    let meta = std::fs::metadata(&path).ok();
                    let size_bytes = meta.as_ref().map(|m| m.len()).unwrap_or(0);
                    let name = path
                        .file_stem()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();
                    let id = name.replace("ogl_", "");
                    out.push(ScreenshotMeta {
                        id,
                        file_name: path
                            .file_name()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_string(),
                        path: path.to_string_lossy().to_string(),
                        base64_preview: None,
                        created_at: meta
                            .and_then(|m| m.created().ok())
                            .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339())
                            .unwrap_or_default(),
                        width: 0,
                        height: 0,
                        size_bytes,
                    });
                }
            }
        }
    }
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(out)
}

/// Resolve the absolute screenshots directory once per call.
/// Used as the canonical allow-root for [`delete_screenshot`] and friends.
fn screenshots_root(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .resolve("screenshots", tauri::path::BaseDirectory::AppData)
        .map_err(|e| e.to_string())
}

/// Verify that `path` is an existing file that lives directly inside the
/// screenshots allow-root. Rejects symlinks, relative paths, and anything
/// outside the canonical screenshots directory.
pub(super) fn ensure_path_within_screenshots(
    root: &std::path::Path,
    path: &str,
) -> Result<std::path::PathBuf, String> {
    if path.is_empty() {
        return Err("Screenshot path is empty.".to_string());
    }
    let candidate = std::path::Path::new(path);
    // Reject relative paths early — canonicalize() would happily resolve them
    // against the current working directory of the launcher process.
    if !candidate.is_absolute() {
        return Err("Screenshot path must be absolute.".to_string());
    }
    let canonical_root = std::fs::canonicalize(root)
        .map_err(|error| format!("Could not resolve screenshots root: {error}"))?;
    let canonical_path = std::fs::canonicalize(candidate).map_err(|error| {
        // Canonicalize fails for non-existent files. We still want a clean
        // message; the file-not-found case is the only legitimate outcome here.
        if error.kind() == std::io::ErrorKind::NotFound {
            "Screenshot file no longer exists.".to_string()
        } else {
            format!("Could not resolve screenshot path: {error}")
        }
    })?;
    if !canonical_path.is_file() {
        return Err("Screenshot path is not a regular file.".to_string());
    }
    if !canonical_path.starts_with(&canonical_root) {
        return Err("Screenshot path is outside the screenshots directory.".to_string());
    }
    Ok(canonical_path)
}

#[tauri::command]
pub fn delete_screenshot(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let root = screenshots_root(&app)?;
    let safe_path = ensure_path_within_screenshots(&root, &path)?;
    std::fs::remove_file(&safe_path).map_err(|e| e.to_string())
}

// ─── Overlay Settings ───

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

// ─── Achievement Popup Emitter ───

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

#[cfg(test)]
mod path_traversal_tests {
    use super::ensure_path_within_screenshots;
    use std::fs;

    /// RAII temp dir. Cleans up on Drop.
    struct Tempdir(std::path::PathBuf);

    impl Tempdir {
        fn new() -> Self {
            let unique = format!(
                "og-launcher-overlay-test-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_nanos())
                    .unwrap_or(0)
            );
            let path = std::env::temp_dir().join(unique);
            fs::create_dir_all(&path).unwrap();
            Tempdir(path)
        }

        fn path(&self) -> &std::path::Path {
            &self.0
        }
    }

    impl Drop for Tempdir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn build_screenshot_zoo() -> (Tempdir, std::path::PathBuf) {
        let dir = Tempdir::new();
        let valid = dir.path().join("ogl_abc.jpg");
        fs::write(&valid, b"jpeg-bytes").unwrap();
        (dir, valid)
    }

    #[test]
    fn accepts_file_inside_root() {
        let (dir, valid) = build_screenshot_zoo();
        let resolved = ensure_path_within_screenshots(dir.path(), valid.to_str().unwrap()).unwrap();
        assert_eq!(
            fs::canonicalize(&resolved).unwrap(),
            fs::canonicalize(&valid).unwrap()
        );
    }

    #[test]
    fn rejects_relative_path() {
        let (dir, _) = build_screenshot_zoo();
        let result = ensure_path_within_screenshots(dir.path(), "ogl_abc.jpg");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("absolute"));
    }

    #[test]
    fn rejects_empty_string() {
        let (dir, _) = build_screenshot_zoo();
        let result = ensure_path_within_screenshots(dir.path(), "");
        assert!(result.is_err());
    }

    #[test]
    fn rejects_path_outside_root() {
        let dir = Tempdir::new();
        let sibling = Tempdir::new();
        let evil_path = sibling.path().join("ogl_evil.jpg");
        fs::write(&evil_path, b"jpeg-bytes").unwrap();

        let result = ensure_path_within_screenshots(dir.path(), evil_path.to_str().unwrap());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("outside"));
    }

    #[test]
    fn rejects_traversal_via_dotdot() {
        let dir = Tempdir::new();
        let root = dir.path().join("root");
        fs::create_dir_all(&root).unwrap();
        let escape = dir.path().join("escape.jpg");
        fs::write(&escape, b"jpeg-bytes").unwrap();

        let traversal = root.join("..").join("escape.jpg");
        let result = ensure_path_within_screenshots(&root, traversal.to_str().unwrap());
        assert!(result.is_err(), "traversal must be rejected");
    }

    #[test]
    fn rejects_nonexistent_file() {
        let (dir, _) = build_screenshot_zoo();
        let ghost = dir.path().join("ogl_ghost.jpg");
        let result = ensure_path_within_screenshots(dir.path(), ghost.to_str().unwrap());
        assert!(result.is_err());
    }
}
