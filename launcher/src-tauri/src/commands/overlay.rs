use base64::Engine;
use serde::{Deserialize, Serialize};
use std::ffi::c_void;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

// Windows-specific GDI imports
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

        let window = WebviewWindowBuilder::new(
            &app,
            label,
            floating_window_url(&app, "overlay"),
        )
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

        let window = WebviewWindowBuilder::new(
            &app,
            label,
            floating_window_url(&app, "fps-hud"),
        )
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

fn floating_window_url(app: &tauri::AppHandle, view: &str) -> WebviewUrl {
    #[cfg(debug_assertions)]
    if let Some(dev_url) = app.config().build.dev_url.as_ref() {
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
        let page_background = if is_overlay { "rgba(0,0,0,.68)" } else { "#fbf8ef" };
        let page_color = if is_overlay { "#fff9ed" } else { "#171411" };
        let panel_background = if is_overlay { "rgba(23,20,17,.82)" } else { "#fff9ed" };
        let panel_shadow = if is_overlay { "#000" } else { "#1f1c0f" };
        let _ = window.eval(&format!(
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

#[tauri::command]
pub fn delete_screenshot(path: String) -> Result<(), String> {
    std::fs::remove_file(&path).map_err(|e| e.to_string())
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

#[tauri::command]
pub fn get_overlay_settings() -> Result<OverlaySettingsPayload, String> {
    // Returns hardcoded defaults for now; persisted via Supabase in frontend.
    Ok(OverlaySettingsPayload {
        is_enabled: Some(true),
        hotkey: Some("Shift+F1".into()),
        position: Some("bottom_right".into()),
        opacity: Some(0.95),
        fps_hud_enabled: Some(false),
        show_gpu: Some(true),
    })
}

#[tauri::command]
pub fn save_overlay_settings(
    settings: OverlaySettingsPayload,
) -> Result<OverlaySettingsPayload, String> {
    // In a full implementation this would write to local config file.
    Ok(settings)
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
