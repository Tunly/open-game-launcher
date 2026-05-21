mod commands;

use tauri::{Manager, PhysicalPosition, WebviewWindow, WindowEvent};

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                keep_window_on_visible_monitor(&window);
                attach_window_bounds_guard(&window);
                let _ = window.show();
                let _ = window.set_focus();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::system::get_system_info,
            commands::system::get_default_install_dir,
            commands::system::get_hardware_info,
            commands::games::list_installed_games,
            commands::games::launch_game,
            commands::games::verify_game_files,
            commands::downloads::start_download,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Open Game Launcher");
}

fn attach_window_bounds_guard(window: &WebviewWindow) {
    let guarded_window = window.clone();
    window.on_window_event(move |event| {
        if matches!(
            event,
            WindowEvent::Resized(_)
                | WindowEvent::ScaleFactorChanged { .. }
                | WindowEvent::Focused(true)
        ) {
            keep_window_on_visible_monitor(&guarded_window);
        }
    });
}

fn keep_window_on_visible_monitor(window: &WebviewWindow) {
    if window.is_maximized().unwrap_or(false) || window.is_fullscreen().unwrap_or(false) {
        return;
    }

    let Ok(Some(monitor)) = window.current_monitor().or_else(|_| window.primary_monitor()) else {
        let _ = window.center();
        return;
    };

    let Ok(position) = window.outer_position() else {
        let _ = window.center();
        return;
    };

    let Ok(size) = window.outer_size() else {
        let _ = window.center();
        return;
    };

    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let min_x = monitor_position.x;
    let min_y = monitor_position.y;
    let max_x = min_x + monitor_size.width.saturating_sub(size.width) as i32;
    let max_y = min_y + monitor_size.height.saturating_sub(size.height) as i32;
    let clamped_x = position.x.clamp(min_x, max_x.max(min_x));
    let clamped_y = position.y.clamp(min_y, max_y.max(min_y));

    if clamped_x != position.x || clamped_y != position.y {
        let _ = window.set_position(PhysicalPosition::new(clamped_x, clamped_y));
    }
}
