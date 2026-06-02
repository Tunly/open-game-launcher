use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

/// Toggle the overlay window on/off.
/// Creates a small always-on-top webview window with the overlay UI.
#[tauri::command]
pub async fn toggle_in_game_overlay(app: tauri::AppHandle) -> Result<bool, String> {
    let label = "in_game_overlay";
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.close();
        Ok(false)
    } else {
        let _ = WebviewWindowBuilder::new(
            &app,
            label,
            WebviewUrl::App("/overlay".into()),
        )
        .title("OGL Overlay")
        .inner_size(320.0, 480.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .build()
        .map_err(|e| format!("Failed to create overlay window: {e}"))?;
        Ok(true)
    }
}

/// Capture a screenshot and return it as a base64-encoded JPEG.
#[tauri::command]
pub fn capture_screenshot() -> Result<String, String> {
    // On Windows, we use the built-in screenshot capabilities.
    // For now, return a placeholder — full GDI implementation in S4 overlay phase.
    #[cfg(target_os = "windows")]
    {
        // Placeholder: actual implementation needs windows-sys with
        // Win32::Graphics::Gdi features for BitBlt.
        // Will be completed in S4 Phase 2.
        Err("Screenshot capture requires full GDI integration (coming in S4 Phase 2)".to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Screenshot capture not yet implemented for this OS".to_string())
    }
}
