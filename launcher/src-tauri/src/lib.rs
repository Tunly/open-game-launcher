mod commands;

use std::{env, fs, path::PathBuf};
use tauri::{Emitter, Manager, PhysicalPosition, WebviewWindow, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

pub fn run() {
    load_local_env_files();

    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            for arg in args {
                if arg.starts_with("oglauncher://") {
                    let link = commands::deeplink::parse_deep_link(&arg);
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.emit("deep-link", link);
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        if let Some(window) = app.get_webview_window("in_game_overlay") {
                            let _ = window.emit("overlay-global-toggle", ());
                            let _ = window.set_focus();
                        } else {
                            let _ = commands::overlay::toggle_in_game_overlay(app.clone());
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                keep_window_on_visible_monitor(&window);
                attach_window_bounds_guard(&window);
                let _ = window.show();
                let _ = window.set_focus();
            }

            // Start the background process poller for tracking playtime
            commands::games::start_playtime_poller(app.handle().clone());
            commands::games::start_library_inventory_watcher(app.handle().clone());
            commands::downloads::start_global_download_watcher(app.handle().clone());

            // One-time migration of legacy plaintext tokens into the OS keychain
            commands::secure_store::migrate_legacy_tokens();

            // Register the universallauncher:// protocol handler (Windows Registry)
            commands::deeplink::register_protocol_handler();

            // Check if app was launched via a deep link and emit event to frontend
            if let Some(link) = commands::deeplink::check_deep_link_on_startup() {
                let handle = app.handle().clone();
                // emit to all windows
                let _ = handle.emit("deep-link", link);
            }

            // Register global overlay hotkey (Shift+Tab)
            let shortcut_manager = app.global_shortcut();
            if !shortcut_manager.is_registered("Shift+F1") {
                let _ = shortcut_manager.register("Shift+F1");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::system::get_system_info,
            commands::system::get_default_install_dir,
            commands::system::get_hardware_info,
            commands::system::get_disk_info,
            commands::system::open_steam_login_window,
            commands::system::open_steam_scraper_window,
            commands::system::fetch_steam_profile_name,
            commands::system::fetch_steam_news,
            commands::system::open_external_url,
            commands::gog::open_gog_login_window,
            commands::epic::open_epic_login_window,
            commands::epic::authenticate_epic_legendary,
            commands::system::fetch_steam_owned_games,
            commands::system::fetch_gog_owned_games,
            commands::epic::fetch_epic_owned_games,
            commands::ubisoft::fetch_ubisoft_owned_games,
            commands::gog::gog_exchange_code,
            commands::gog::gog_refresh_token_command,
            commands::gog::gog_get_token,
            commands::gog::gog_logout,
            commands::gog::gog_fetch_owned_games,
            commands::crossplay::launch_cross_play_join,
            commands::crossplay::resolve_game_external_id,
            commands::family::copy_family_invite,
            commands::stripe::create_stripe_checkout_session,
            commands::perf_monitor::poll_performance_metrics,
            commands::overlay::toggle_in_game_overlay,
            commands::overlay::toggle_fps_hud,
            commands::overlay::capture_screenshot,
            commands::overlay::list_screenshots,
            commands::overlay::delete_screenshot,
            commands::overlay::get_overlay_settings,
            commands::overlay::save_overlay_settings,
            commands::overlay::emit_achievement_popup,
            commands::perf_monitor::report_frame_rendered,
            commands::anti_cheat::detect_anti_cheat_processes,
            commands::anti_cheat::is_overlay_blocked_by_anti_cheat,
            commands::mod_install::install_mod_from_url,
            commands::mod_install::start_mod_install,
            commands::mod_install::get_mod_queue,
            commands::mod_install::pause_mod_install,
            commands::mod_install::cancel_mod_install,
            commands::mod_install::scan_game_mods,
            commands::mod_install::enable_mod,
            commands::mod_install::disable_mod,
            commands::mod_install::uninstall_mod,
            commands::mod_install::set_mod_provider_secret,
            commands::battlenet::open_battlenet_login_window,
            commands::battlenet::process_battlenet_games_payload,
            commands::ea::open_ea_login_window,
            commands::ea::ea_get_token,
            commands::ea::ea_logout,
            commands::ea::ea_fetch_owned_games,
            commands::gog::gog_get_download_info,
            commands::gog::gog_start_download,
            commands::gog::gog_get_cloud_saves,
            commands::games::cache_supabase_access_token,
            commands::games::read_cached_supabase_access_token,
            commands::cloud_crypto::is_cloud_key_present,
            commands::cloud_crypto::generate_cloud_key,
            commands::cloud_crypto::rotate_cloud_key,
            commands::controller::list_controllers,
            commands::controller::apply_controller_layout,
            commands::controller::clear_controller_layout,
            commands::controller::get_controller_runtime_status,
            commands::games::add_manual_game,
            commands::games::update_game_metadata,
            commands::games::update_achievement_provider_status,
            commands::games::import_library_snapshot,
            commands::games::move_game,
            commands::games::list_installed_games,
            commands::games::refresh_installed_games,
            commands::games::launch_game,
            commands::games::verify_game_files,
            commands::games::repair_game_files,
            commands::games::check_game_updates,
            commands::games::install_game_update,
            commands::games::sync_game_saves,
            commands::games::upload_game_saves_to_cloud,
            commands::games::download_game_saves_from_cloud,
            commands::games::restore_game_saves_from_cloud,
            commands::games::sync_game_achievements,
            commands::games::sync_local_game_achievements,
            commands::games::open_achievement_cache_folder,
            commands::games::uninstall_game,
            commands::games::set_cached_game_playtime,
            commands::downloads::start_download,
            commands::downloads::pause_download,
            commands::downloads::cancel_download,
            commands::downloads::archive_download,
            commands::downloads::get_download_queue,
            commands::downloads::check_provider_health,
            commands::downloads::reconcile_downloads,
            commands::local_db::apply_remote_local_entities,
            commands::local_db::get_all_local_entities,
            commands::local_db::get_local_database_path,
            commands::local_db::get_pending_local_entities,
            commands::local_db::get_local_sync_status,
            commands::local_db::mark_local_entities_synced,
            commands::xbox::open_xbox_login_window,
            commands::xbox::fetch_xbox_owned_games,
            commands::xbox::launch_xbox_game,
            commands::xbox::install_xbox_game,
            commands::xbox::fetch_game_pass_catalog,
            commands::xbox::sync_xbox_achievements,
            commands::friends::fetch_steam_friends,
            commands::friends::fetch_gog_friends,
            commands::friends::fetch_epic_friends,
            commands::friends::fetch_xbox_friends,
            commands::nexus_scraper::scrape_nexus_mod_info,
            commands::nexus_scraper::search_nexus_mods,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Open Game Launcher");
}

fn load_local_env_files() {
    for env_path in local_env_file_candidates() {
        let Ok(contents) = fs::read_to_string(env_path) else {
            continue;
        };

        for line in contents.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }

            let Some((key, value)) = line.split_once('=') else {
                continue;
            };

            let key = key.trim();
            if key.is_empty() || env::var_os(key).is_some() {
                continue;
            }

            let value = value
                .trim()
                .trim_matches(|character| character == '"' || character == '\'');
            env::set_var(key, value);
        }
    }
}

fn local_env_file_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(current_dir) = env::current_dir() {
        candidates.push(current_dir.join(".env.local"));
        candidates.push(current_dir.join(".env"));
    }

    let tauri_manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    candidates.push(tauri_manifest_dir.join(".env.local"));
    candidates.push(tauri_manifest_dir.join(".env"));

    if let Some(frontend_dir) = tauri_manifest_dir.parent() {
        candidates.push(frontend_dir.join(".env.local"));
        candidates.push(frontend_dir.join(".env"));
    }

    candidates
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

    let Ok(Some(monitor)) = window
        .current_monitor()
        .or_else(|_| window.primary_monitor())
    else {
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
