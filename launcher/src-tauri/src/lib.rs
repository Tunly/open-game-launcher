mod commands;
pub mod launcher_automation;

use std::{
    env, fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, RunEvent, State, WebviewWindow, WindowEvent,
};
use tauri_plugin_global_shortcut::ShortcutState;

const STARTUP_FALLBACK_DELAY: Duration = Duration::from_secs(15);

#[derive(Default)]
struct StartupState {
    transition_started: Arc<AtomicBool>,
    pending_deep_link: Mutex<Option<commands::deeplink::DeepLinkEvent>>,
}

fn store_pending_deep_link(
    pending: &Mutex<Option<commands::deeplink::DeepLinkEvent>>,
    link: commands::deeplink::DeepLinkEvent,
) {
    *pending
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner) = Some(link);
}

fn take_pending_deep_link_value(
    pending: &Mutex<Option<commands::deeplink::DeepLinkEvent>>,
) -> Option<commands::deeplink::DeepLinkEvent> {
    pending
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .take()
}

#[tauri::command]
fn take_pending_deep_link(
    state: State<'_, StartupState>,
) -> Option<commands::deeplink::DeepLinkEvent> {
    take_pending_deep_link_value(&state.pending_deep_link)
}

#[tauri::command]
fn complete_startup(app: AppHandle, state: State<'_, StartupState>) -> Result<(), String> {
    if !claim_startup_transition(&state.transition_started) {
        return Ok(());
    }

    if let Err(error) = show_main_and_close_splash(&app) {
        state.transition_started.store(false, Ordering::Release);
        return Err(error);
    }

    Ok(())
}

pub fn run_headless_backup_scheduler_from_args() -> Option<i32> {
    commands::backup::run_headless_backup_scheduler_from_args()
}

pub fn run_headless_client_update_scheduler_from_args() -> Option<i32> {
    commands::client_manager::run_headless_client_update_scheduler_from_args()
}

pub fn run_headless_plugin_runtime_sandbox_probe_from_args() -> Option<i32> {
    commands::plugin_runtime_sandbox::run_headless_plugin_runtime_sandbox_probe_from_args()
}

pub fn run() {
    load_local_env_files();

    let builder = tauri::Builder::default()
        .manage(StartupState::default())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            for arg in args {
                if arg.starts_with("oglauncher://") {
                    let link = commands::deeplink::parse_deep_link(&arg);
                    store_pending_deep_link(
                        &app.state::<StartupState>().pending_deep_link,
                        link.clone(),
                    );
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.emit("deep-link", link);
                        if app
                            .state::<StartupState>()
                            .transition_started
                            .load(Ordering::Acquire)
                        {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
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
                        } else {
                            let _ = commands::overlay::toggle_in_game_overlay(app.clone());
                        }
                    }
                })
                .build(),
        );

    #[cfg(target_os = "windows")]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    let app = builder
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                keep_window_on_visible_monitor(&window);
                attach_window_bounds_guard(&window);
            }

            spawn_startup_fallback(app);

            // Start the background process poller for tracking playtime and retain
            // its shutdown handle for the application exit lifecycle.
            let playtime_poller = commands::games::start_playtime_poller(app.handle().clone());
            if !app.manage(playtime_poller) {
                return Err(std::io::Error::other(
                    "Could not register the playtime poller shutdown handle",
                )
                .into());
            }
            commands::client_manager::start_platform_client_event_poller(app.handle().clone());
            commands::games::start_library_inventory_watcher(app.handle().clone());
            commands::downloads::start_global_download_watcher(app.handle().clone());

            // One-time migration of legacy plaintext tokens into the OS keychain
            commands::secure_store::migrate_legacy_tokens();

            // Register the universallauncher:// protocol handler (Windows Registry)
            commands::deeplink::register_protocol_handler();

            // Keep startup links until the frontend explicitly claims them. Tauri
            // events are transient and setup runs before React subscribes.
            if let Some(link) = commands::deeplink::check_deep_link_on_startup() {
                store_pending_deep_link(&app.state::<StartupState>().pending_deep_link, link);
            }

            // Register the saved global overlay hotkey; defaults to Shift+F1.
            let _ = commands::overlay::register_configured_overlay_hotkey(app.handle(), None);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            complete_startup,
            take_pending_deep_link,
            commands::system::get_system_info,
            commands::system::get_default_install_dir,
            commands::system::get_hardware_info,
            commands::system::get_disk_info,
            commands::system::open_steam_login_window,
            commands::system::open_steam_scraper_window,
            commands::system::fetch_steam_profile_name,
            commands::system::fetch_steam_news,
            commands::system::open_external_url,
            commands::backup::preview_backup_plan,
            commands::backup::run_backup_plan,
            commands::backup::prove_backup_external_drive_write,
            commands::backup::prove_backup_external_drive_eject_safety,
            commands::backup::eject_backup_external_drive,
            commands::backup::preview_restore_plan,
            commands::backup::restore_backup,
            commands::backup::get_latest_backup_status,
            commands::backup::get_backup_scheduler_status,
            commands::backup::save_backup_scheduler_config,
            commands::backup::install_backup_scheduler,
            commands::backup::uninstall_backup_scheduler,
            commands::backup::run_backup_scheduler_now,
            commands::broadcast::get_broadcast_stream_key_vault_status,
            commands::broadcast::set_broadcast_stream_key_secret,
            commands::broadcast::clear_broadcast_stream_key_secret,
            commands::cross_store_save::apply_cross_store_save_copy,
            commands::cross_store_save::rollback_cross_store_save_copy,
            commands::cross_store_save::prove_cross_store_save_local_e2e,
            commands::client_manager::poll_platform_client_health,
            commands::client_manager::launch_platform_client,
            commands::client_manager::get_platform_client_installer_metadata,
            commands::client_manager::preview_platform_client_install,
            commands::client_manager::get_platform_client_modification_config,
            commands::client_manager::save_platform_client_modification_config,
            commands::client_manager::get_platform_client_asset_cache_lookup,
            commands::client_manager::get_platform_client_polling_settings,
            commands::client_manager::save_platform_client_polling_settings,
            commands::client_manager::get_platform_client_update_status,
            commands::client_manager::preview_platform_client_auto_apply,
            commands::client_manager::preview_client_manager_auto_apply_capabilities,
            commands::client_manager::prove_client_manager_mount_apply_sandbox,
            commands::client_manager::check_platform_client_update,
            commands::client_manager::run_scheduled_platform_client_update_checks,
            commands::client_manager::get_platform_client_update_scheduler_status,
            commands::client_manager::install_platform_client_update_scheduler,
            commands::client_manager::uninstall_platform_client_update_scheduler,
            commands::client_manager::run_platform_client_update_scheduler_now,
            commands::client_manager::open_platform_client_installer,
            commands::client_manager::open_platform_client_updater,
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
            commands::stripe::get_license_device_id,
            commands::stripe::validate_license,
            commands::perf_monitor::poll_performance_metrics,
            commands::overlay::toggle_in_game_overlay,
            commands::overlay::set_in_game_overlay_click_through,
            commands::overlay::toggle_fps_hud,
            commands::overlay::get_overlay_settings,
            commands::overlay::save_overlay_settings,
            commands::perf_monitor::report_frame_rendered,
            commands::anti_cheat::detect_anti_cheat_processes,
            commands::anti_cheat::is_overlay_blocked_by_anti_cheat,
            commands::plugin_system::scan_local_plugin_manifests,
            commands::plugin_system::stage_signed_plugin_package,
            commands::plugin_system::audit_staged_plugin_registry,
            commands::plugin_system::prove_plugin_runtime_sandbox,
            commands::plugin_system::review_plugin_activation_plan,
            commands::plugin_system::review_plugin_marketplace_update_index_trust,
            commands::plugin_system::review_plugin_update_signing_envelope,
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
            commands::games::get_launcher_device_id,
            commands::games::add_manual_game,
            commands::games::update_game_metadata,
            commands::games::update_achievement_provider_status,
            commands::games::import_library_snapshot,
            commands::games::move_game,
            commands::games::list_installed_games,
            commands::games::refresh_installed_games,
            commands::games::launch_game,
            commands::games::stop_game,
            commands::games::get_game_action_capabilities,
            commands::games::prepare_game_action_confirmation,
            commands::games::run_game_action,
            commands::games::verify_game_files,
            commands::games::repair_game_files,
            commands::games::check_game_updates,
            commands::games::install_game_update,
            commands::games::sync_game_saves,
            commands::games::sync_game_achievements,
            commands::games::sync_steam_session_achievements,
            commands::games::sync_local_game_achievements,
            commands::games::open_achievement_cache_folder,
            commands::games::set_cached_game_playtime,
            commands::games::get_unsynced_play_sessions,
            commands::games::mark_play_sessions_synced,
            commands::games::upsert_play_session,
            commands::games::update_play_session,
            commands::games::delete_play_session,
            commands::games::get_play_session,
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
        ])
        .build(tauri::generate_context!())
        .expect("error while building Open Game Launcher");

    app.run(|app_handle, event| {
        if matches!(event, RunEvent::ExitRequested { .. })
            && !app_handle
                .state::<commands::games::PlaytimePoller>()
                .shutdown()
        {
            eprintln!(
                "[open-game-launcher] Playtime poller did not acknowledge shutdown before the timeout"
            );
        }
    });
}

fn claim_startup_transition(transition_started: &AtomicBool) -> bool {
    transition_started
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_ok()
}

fn show_main_and_close_splash(app: &AppHandle) -> Result<(), String> {
    let main_window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window is unavailable during startup".to_string())?;

    keep_window_on_visible_monitor(&main_window);
    main_window
        .show()
        .map_err(|error| format!("Main window could not be shown: {error}"))?;
    let _ = main_window.set_focus();

    if let Some(splashscreen) = app.get_webview_window("splashscreen") {
        let _ = splashscreen.close();
    }

    Ok(())
}

fn spawn_startup_fallback(app: &tauri::App) {
    let app_handle = app.handle().clone();
    let transition_started = app.state::<StartupState>().transition_started.clone();

    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(STARTUP_FALLBACK_DELAY).await;
        if !claim_startup_transition(&transition_started) {
            return;
        }

        if show_main_and_close_splash(&app_handle).is_err() {
            transition_started.store(false, Ordering::Release);
        }
    });
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

#[cfg(test)]
mod startup_tests {
    use super::*;

    #[test]
    fn pending_deep_link_is_retained_until_claimed_once() {
        let pending = Mutex::new(None);
        let link =
            commands::deeplink::parse_deep_link("oglauncher://join?game=neon-drift&platform=steam");

        store_pending_deep_link(&pending, link.clone());

        let claimed = take_pending_deep_link_value(&pending).expect("pending link");
        assert_eq!(claimed.action, link.action);
        assert_eq!(claimed.params, link.params);
        assert!(take_pending_deep_link_value(&pending).is_none());
    }

    #[test]
    fn startup_transition_can_only_be_claimed_once() {
        let transition_started = AtomicBool::new(false);

        assert!(claim_startup_transition(&transition_started));
        assert!(!claim_startup_transition(&transition_started));
    }

    #[test]
    fn overlay_shortcut_does_not_force_focus_away_from_the_game() {
        let source = include_str!("lib.rs");
        let overlay_branch = source
            .split_once("if let Some(window) = app.get_webview_window(\"in_game_overlay\")")
            .expect("overlay shortcut branch should exist")
            .1
            .split_once("} else {")
            .expect("overlay shortcut branch should retain its create fallback")
            .0;

        assert!(overlay_branch.contains("overlay-global-toggle"));
        assert!(
            !overlay_branch.contains("set_focus"),
            "the global overlay hotkey must not foreground the overlay over an exclusive game"
        );
    }
}
