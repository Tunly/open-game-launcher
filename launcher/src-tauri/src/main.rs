#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Headless entry points must be intercepted before the Tauri runtime
    // starts, otherwise the OS scheduler would just launch the full GUI.
    if let Some(exit_code) =
        open_game_launcher_lib::run_headless_client_update_scheduler_from_args()
    {
        std::process::exit(exit_code);
    }

    open_game_launcher_lib::run();
}
