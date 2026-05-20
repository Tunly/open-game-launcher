mod commands;

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::system::get_system_info,
            commands::system::get_default_install_dir,
            commands::games::launch_game,
            commands::games::verify_game_files,
            commands::downloads::start_download,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Open Game Launcher");
}
