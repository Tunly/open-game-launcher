use std::path::{Path, PathBuf};

use crate::commands::downloads::types::{
    emit_download_progress, update_download_metrics, update_download_status,
    InternalDownloadSource, DOWNLOAD_STATUS_INSTALLING,
};
use crate::commands::games::{
    extract_og_zip_package, find_launch_executable, installed_game, is_file_executable,
    is_zip_package, og_manifest_file_for_path, og_manifest_relative_path, path_to_string,
    read_installed_games_cache, write_installed_games_cache, write_og_managed_manifest_details,
    GameStatus, OgManagedManifest, OgManagedManifestFile,
};

pub(crate) struct InstalledDownloadPackage {
    pub(crate) files: Vec<OgManagedManifestFile>,
    pub(crate) executable_path: PathBuf,
}

pub(crate) fn install_downloaded_game_package(
    app: &tauri::AppHandle,
    game_id: &str,
    title: &str,
    install_dir: &Path,
    _source: &InternalDownloadSource,
    downloaded_file: &Path,
) -> Result<InstalledDownloadPackage, String> {
    update_download_metrics(game_id, "installing", None, None);
    update_download_status(game_id, DOWNLOAD_STATUS_INSTALLING, "Installing", 99, 0);
    emit_download_progress(
        app,
        game_id,
        99,
        "Installing",
        DOWNLOAD_STATUS_INSTALLING,
        0,
    );

    let files = if is_zip_package(downloaded_file) {
        extract_og_zip_package(downloaded_file, install_dir, |processed, total| {
            let progress = 90 + (((processed as f64 / total.max(1) as f64) * 9.0).round() as u32);
            update_download_status(
                game_id,
                DOWNLOAD_STATUS_INSTALLING,
                "Installing",
                progress.min(99),
                0,
            );
            emit_download_progress(
                app,
                game_id,
                progress.min(99),
                "Installing",
                DOWNLOAD_STATUS_INSTALLING,
                0,
            );
        })?
    } else {
        og_manifest_file_for_path(install_dir, downloaded_file)
            .into_iter()
            .collect()
    };

    let executable_path = find_launch_executable(install_dir, title)
        .or_else(|| is_file_executable(downloaded_file).then(|| downloaded_file.to_path_buf()))
        .ok_or_else(|| "Installed package does not contain a launchable executable.".to_string())?;

    Ok(InstalledDownloadPackage {
        files,
        executable_path,
    })
}

pub(crate) fn write_downloaded_game_manifest(
    game_id: &str,
    title: &str,
    install_dir: &Path,
    source: &InternalDownloadSource,
    downloaded_file: &Path,
    installed_package: &InstalledDownloadPackage,
) -> Result<(), String> {
    let manifest = OgManagedManifest {
        game_id: game_id.to_string(),
        title: title.to_string(),
        version: "1.0.0".to_string(),
        managed_by: "OG-Launcher".to_string(),
        download_url: Some(source.url.clone()),
        download_sha256: source.sha256.clone(),
        package_file: og_manifest_relative_path(install_dir, downloaded_file),
        files: installed_package.files.clone(),
        executable_path: og_manifest_relative_path(install_dir, &installed_package.executable_path),
        updated_at: None,
    };

    write_og_managed_manifest_details(install_dir, &manifest)
}

pub(crate) fn update_installed_games_cache_for_download(
    game_id: &str,
    title: &str,
    install_dir: &Path,
    executable_path: Option<&Path>,
) {
    let mut games = read_installed_games_cache().unwrap_or_default();
    let mut found = false;
    let executable_path_string = executable_path.map(|path| path_to_string(path.to_path_buf()));
    let process_names = executable_path
        .and_then(|path| path.file_name())
        .and_then(|name| name.to_str())
        .map(|name| vec![name.to_string()])
        .unwrap_or_default();

    for game in games.iter_mut() {
        if game.id == game_id {
            game.status = GameStatus::Installed;
            game.install_path = Some(path_to_string(install_dir.to_path_buf()));
            game.executable_path = executable_path_string.clone();
            game.process_names = process_names.clone();
            game.version = "1.0.0".to_string();
            game.launcher = "manual".to_string();
            if game.description.trim().is_empty() {
                game.description = format!("Downloaded game: {title}");
            }
            found = true;
        }
    }

    if !found {
        let mut game = installed_game(
            game_id,
            title.to_string(),
            "manual".to_string(),
            Some(path_to_string(install_dir.to_path_buf())),
            None,
        );
        game.description = format!("Downloaded game: {title}");
        game.executable_path = executable_path_string;
        game.process_names = process_names;
        games.push(game);
    }

    write_installed_games_cache(&games);
}
