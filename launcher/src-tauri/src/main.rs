#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Some(exit_code) =
        open_game_launcher_lib::run_headless_plugin_runtime_sandbox_probe_from_args()
    {
        std::process::exit(exit_code);
    }

    if let Some(exit_code) = open_game_launcher_lib::run_headless_backup_scheduler_from_args() {
        std::process::exit(exit_code);
    }

    if let Some(exit_code) =
        open_game_launcher_lib::run_headless_client_update_scheduler_from_args()
    {
        std::process::exit(exit_code);
    }

    open_game_launcher_lib::run();
}
