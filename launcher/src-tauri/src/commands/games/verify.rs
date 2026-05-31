use std::{
    fs,
    path::{Path, PathBuf},
};

use super::core::{
    extract_og_zip_package, find_launch_executable, is_og_managed_install_path, is_zip_package,
    launcher_display_name, normalize_game_id, og_manifest_file_for_path,
    og_manifest_path_for_entry, og_manifest_relative_path, open_uri, path_to_string,
    read_installed_games_cache, read_og_managed_manifest, read_og_managed_version,
    update_uri_for_game, write_installed_games_cache, write_og_managed_manifest,
    write_og_managed_manifest_details, OG_MANAGED_LATEST_VERSION,
};
use super::types::*;

#[tauri::command]
pub fn verify_game_files(game_id: String) -> Result<VerifyGameFilesResponse, String> {
    let game_id = normalize_game_id(game_id)?;
    println!("[open-game-launcher] verify_game_files requested for {game_id}");

    let games = read_installed_games_cache().unwrap_or_default();
    let game = games
        .iter()
        .find(|game| game.id == game_id)
        .ok_or_else(|| format!("Game '{game_id}' was not found in the local library cache."))?;

    let mut missing_files = Vec::new();
    let mut checked_files = 0;

    let install_path = game.install_path.as_deref().map(PathBuf::from);
    let manifest = install_path.as_deref().and_then(read_og_managed_manifest);

    if let Some(install_path) = install_path.as_deref() {
        checked_files += 1;
        if !install_path.exists() {
            missing_files.push(path_to_string(install_path.to_path_buf()));
        }
    } else if matches!(game.status, GameStatus::Installed) {
        missing_files.push("install path".to_string());
    }

    if let (Some(install_path), Some(manifest)) = (install_path.as_deref(), manifest.as_ref()) {
        for file in &manifest.files {
            checked_files += 1;
            let Some(file_path) = og_manifest_path_for_entry(install_path, &file.path) else {
                missing_files.push(format!("invalid manifest path: {}", file.path));
                continue;
            };

            match fs::metadata(&file_path) {
                Ok(metadata) if metadata.is_file() => {
                    if let Some(expected_size) = file.size_bytes {
                        if metadata.len() != expected_size {
                            missing_files
                                .push(format!("{} (size mismatch)", path_to_string(file_path)));
                        }
                    }
                }
                _ => missing_files.push(path_to_string(file_path)),
            }
        }
    }

    let manifest_executable = install_path
        .as_deref()
        .zip(
            manifest
                .as_ref()
                .and_then(|manifest| manifest.executable_path.as_deref()),
        )
        .and_then(|(install_path, executable_path)| {
            og_manifest_path_for_entry(install_path, executable_path)
        });

    if let Some(executable_path) = game
        .executable_path
        .as_deref()
        .map(PathBuf::from)
        .or(manifest_executable)
    {
        checked_files += 1;
        if !executable_path.exists() {
            missing_files.push(path_to_string(executable_path));
        }
    } else if let Some(install_path) = install_path.as_deref() {
        checked_files += 1;
        if find_launch_executable(install_path, &game.title).is_none() {
            missing_files.push("launch executable".to_string());
        }
    }

    for save_file in &game.save_files {
        checked_files += 1;
        if !Path::new(&save_file.path).exists() {
            missing_files.push(save_file.path.clone());
        }
    }

    let status = if missing_files.is_empty() {
        VerificationStatus::Verified
    } else {
        VerificationStatus::RepairRequired
    };

    Ok(VerifyGameFilesResponse {
        game_id,
        checked_files,
        missing_files,
        status,
    })
}

#[tauri::command]
pub fn repair_game_files(game_id: String) -> Result<RepairGameFilesResponse, String> {
    let game_id = normalize_game_id(game_id)?;
    println!("[open-game-launcher] repair_game_files requested for {game_id}");

    let mut games = read_installed_games_cache().unwrap_or_default();
    let game_index = games
        .iter()
        .position(|game| game.id == game_id)
        .ok_or_else(|| format!("Game '{game_id}' was not found in the local library cache."))?;

    let mut game = games[game_index].clone();
    let install_path = game
        .install_path
        .as_deref()
        .map(PathBuf::from)
        .or_else(|| {
            super::core::open_game_launcher_data_dir()
                .map(|data_dir| data_dir.join("games").join(&game.id))
        })
        .ok_or_else(|| "Could not resolve the OG managed install folder.".to_string())?;

    if !is_og_managed_install_path(&install_path) {
        return Err(format!(
            "{} is managed by {}. Use that launcher to repair the installation.",
            game.title,
            launcher_display_name(&game.launcher)
        ));
    }

    fs::create_dir_all(&install_path)
        .map_err(|error| format!("Could not create install folder: {error}"))?;

    let mut manifest = read_og_managed_manifest(&install_path).ok_or_else(|| {
        format!(
            "{} does not have an OG managed manifest. Re-run the download to repair it.",
            game.title
        )
    })?;
    let package_file = manifest
        .package_file
        .as_deref()
        .ok_or_else(|| format!("{} has no local package to repair from.", game.title))?;
    let package_path = og_manifest_path_for_entry(&install_path, package_file)
        .ok_or_else(|| "The local package path in the manifest is invalid.".to_string())?;

    if !package_path.exists() {
        return Err(format!(
            "{} cannot be repaired because the local package is missing: {}",
            game.title,
            path_to_string(package_path)
        ));
    }

    let repaired_manifest_files = if is_zip_package(&package_path) {
        extract_og_zip_package(&package_path, &install_path, |_, _| {})?
    } else {
        og_manifest_file_for_path(&install_path, &package_path)
            .into_iter()
            .collect()
    };

    let executable_path = find_launch_executable(&install_path, &game.title).ok_or_else(|| {
        format!(
            "{} repair did not produce a launchable executable.",
            game.title
        )
    })?;
    manifest.files = repaired_manifest_files.clone();
    manifest.executable_path = og_manifest_relative_path(&install_path, &executable_path);
    write_og_managed_manifest_details(&install_path, &manifest)?;

    game.status = GameStatus::Installed;
    game.install_path = Some(path_to_string(install_path.clone()));
    game.executable_path = Some(path_to_string(executable_path.clone()));
    game.process_names = executable_path
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| vec![name.to_string()])
        .unwrap_or_default();

    games[game_index] = game.clone();
    write_installed_games_cache(&games);

    Ok(RepairGameFilesResponse {
        game_id,
        success: true,
        game: game.clone(),
        repaired_files: repaired_manifest_files
            .iter()
            .filter_map(|file| og_manifest_path_for_entry(&install_path, &file.path))
            .map(path_to_string)
            .collect(),
        message: format!("{} repair completed.", game.title),
    })
}

#[tauri::command]
pub fn check_game_updates() -> Result<CheckGameUpdatesResponse, String> {
    let mut games = read_installed_games_cache().unwrap_or_default();
    let mut update_count = 0;

    for game in games.iter_mut() {
        let Some(install_path) = game.install_path.as_deref().map(PathBuf::from) else {
            continue;
        };

        if !is_og_managed_install_path(&install_path) {
            continue;
        }

        let local_version =
            read_og_managed_version(&install_path).unwrap_or_else(|| game.version.clone());
        if local_version.trim() != OG_MANAGED_LATEST_VERSION {
            game.status = GameStatus::UpdateAvailable;
            game.version = local_version;
            update_count += 1;
        }
    }

    write_installed_games_cache(&games);

    let message = if update_count == 0 {
        "All OG-managed games are up to date.".to_string()
    } else {
        format!("{update_count} OG-managed updates are available.")
    };

    Ok(CheckGameUpdatesResponse {
        update_count,
        games,
        message,
    })
}

#[tauri::command]
pub fn install_game_update(game_id: String) -> Result<InstallGameUpdateResponse, String> {
    let game_id = normalize_game_id(game_id)?;
    println!("[open-game-launcher] install_game_update requested for {game_id}");

    let mut games = read_installed_games_cache().unwrap_or_default();
    let game_index = games
        .iter()
        .position(|game| game.id == game_id)
        .ok_or_else(|| format!("Game '{game_id}' was not found in the local library cache."))?;

    let mut game = games[game_index].clone();

    if !matches!(game.status, GameStatus::UpdateAvailable) {
        return Ok(InstallGameUpdateResponse {
            game_id,
            success: true,
            game: game.clone(),
            message: format!("{} is already up to date.", game.title),
        });
    }

    let install_path = game
        .install_path
        .as_deref()
        .map(PathBuf::from)
        .ok_or_else(|| format!("{} has no install folder to update.", game.title))?;

    if !is_og_managed_install_path(&install_path) {
        if let Some(uri) = update_uri_for_game(&game) {
            open_uri(&uri).map_err(|error| format!("Could not open update flow: {error}"))?;
            return Ok(InstallGameUpdateResponse {
                game_id,
                success: true,
                game: game.clone(),
                message: format!(
                    "{} update was handed off to {}.",
                    game.title,
                    launcher_display_name(&game.launcher)
                ),
            });
        }

        return Err(format!(
            "{} is managed by {}. Use that launcher to update the installation.",
            game.title,
            launcher_display_name(&game.launcher)
        ));
    }

    fs::create_dir_all(&install_path)
        .map_err(|error| format!("Could not create install folder: {error}"))?;
    let executable_path = install_path.join(if cfg!(target_os = "windows") {
        "game.exe"
    } else {
        "game"
    });
    fs::write(
        &executable_path,
        format!("OG Launcher managed game executable // version {OG_MANAGED_LATEST_VERSION}"),
    )
    .map_err(|error| format!("Could not write updated executable: {error}"))?;
    write_og_managed_manifest(
        &install_path,
        &game.id,
        &game.title,
        OG_MANAGED_LATEST_VERSION,
    )?;

    game.status = GameStatus::Installed;
    game.version = OG_MANAGED_LATEST_VERSION.to_string();
    game.executable_path = Some(path_to_string(executable_path.clone()));
    game.process_names = executable_path
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| vec![name.to_string()])
        .unwrap_or_default();

    games[game_index] = game.clone();
    write_installed_games_cache(&games);

    Ok(InstallGameUpdateResponse {
        game_id,
        success: true,
        game: game.clone(),
        message: format!("{} updated to version {}.", game.title, game.version),
    })
}
