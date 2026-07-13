use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};

use super::core::{
    extract_og_zip_package, find_launch_executable, is_og_managed_install_path, is_zip_package,
    launcher_display_name, manifest_has_signature, mutate_installed_games_cache, normalize_game_id,
    og_managed_manifest_trust_status, og_manifest_file_for_path, og_manifest_path_for_entry,
    og_manifest_relative_path, open_uri, path_to_string, read_installed_games_cache,
    read_og_managed_manifest, read_og_managed_version, sha256_file_hex,
    update_installed_game_cache, update_uri_for_game, verify_og_managed_manifest_signature,
    write_og_managed_manifest_details, OgManagedManifest, OgManagedManifestFile,
    OgManifestTrustStatus, OG_MANAGED_LATEST_VERSION,
};
use super::types::*;

impl From<OgManifestTrustStatus> for ManifestTrustStatus {
    fn from(value: OgManifestTrustStatus) -> Self {
        match value {
            OgManifestTrustStatus::Missing => ManifestTrustStatus::Missing,
            OgManifestTrustStatus::Unsigned => ManifestTrustStatus::Unsigned,
            OgManifestTrustStatus::Signed => ManifestTrustStatus::Signed,
            OgManifestTrustStatus::Invalid => ManifestTrustStatus::Invalid,
        }
    }
}

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
    let manifest_trust =
        og_managed_manifest_trust_status(install_path.as_deref(), manifest.as_ref());
    if matches!(manifest_trust, OgManifestTrustStatus::Invalid) {
        missing_files.push("manifest signature invalid".to_string());
    }

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
            if let Some(issue) = verify_manifest_file_entry(install_path, file) {
                missing_files.push(issue);
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
        manifest_trust: manifest_trust.into(),
        status,
    })
}

fn verify_manifest_file_entry(install_path: &Path, file: &OgManagedManifestFile) -> Option<String> {
    let Some(file_path) = og_manifest_path_for_entry(install_path, &file.path) else {
        return Some(format!("invalid manifest path: {}", file.path));
    };

    let metadata = match fs::metadata(&file_path) {
        Ok(metadata) if metadata.is_file() => metadata,
        _ => return Some(path_to_string(file_path)),
    };

    if let Some(expected_size) = file.size_bytes {
        if metadata.len() != expected_size {
            return Some(format!("{} (size mismatch)", path_to_string(file_path)));
        }
    }

    let expected_sha256 = file
        .sha256
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())?;

    match sha256_file_hex(&file_path) {
        Ok(actual_sha256) if actual_sha256.eq_ignore_ascii_case(expected_sha256) => None,
        Ok(_) => Some(format!("{} (hash mismatch)", path_to_string(file_path))),
        Err(error) => Some(format!(
            "{} (hash unreadable: {error})",
            path_to_string(file_path)
        )),
    }
}

fn validate_repair_package_hash(
    manifest: &OgManagedManifest,
    package_path: &Path,
    title: &str,
) -> Result<(), String> {
    let Some(expected_sha256) = manifest
        .download_sha256
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(());
    };

    let actual_sha256 = sha256_file_hex(package_path).map_err(|error| {
        format!(
            "{} repair package could not be hashed: {} ({error})",
            title,
            path_to_string(package_path.to_path_buf())
        )
    })?;

    if actual_sha256.eq_ignore_ascii_case(expected_sha256) {
        Ok(())
    } else {
        Err(format!(
            "{} repair package failed SHA-256 validation: {}",
            title,
            path_to_string(package_path.to_path_buf())
        ))
    }
}

fn validate_repaired_manifest_files(
    expected_files: &[OgManagedManifestFile],
    repaired_files: &[OgManagedManifestFile],
) -> Result<(), String> {
    if expected_files.is_empty() {
        return Ok(());
    }

    let repaired_by_path = repaired_files
        .iter()
        .map(|file| (file.path.as_str(), file))
        .collect::<BTreeMap<_, _>>();

    for expected in expected_files {
        let Some(repaired) = repaired_by_path.get(expected.path.as_str()) else {
            return Err(format!(
                "Repair output is missing expected manifest file: {}",
                expected.path
            ));
        };

        if let Some(expected_size) = expected.size_bytes {
            if repaired.size_bytes != Some(expected_size) {
                return Err(format!(
                    "Repair output differs from manifest for {} (size mismatch).",
                    expected.path
                ));
            }
        }

        let Some(expected_sha256) = expected
            .sha256
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };

        if !repaired
            .sha256
            .as_deref()
            .is_some_and(|actual| actual.eq_ignore_ascii_case(expected_sha256))
        {
            return Err(format!(
                "Repair output differs from manifest for {} (hash mismatch).",
                expected.path
            ));
        }
    }

    Ok(())
}

#[tauri::command]
pub fn repair_game_files(game_id: String) -> Result<RepairGameFilesResponse, String> {
    let game_id = normalize_game_id(game_id)?;
    println!("[open-game-launcher] repair_game_files requested for {game_id}");

    let games = read_installed_games_cache().unwrap_or_default();
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
    verify_og_managed_manifest_signature(&install_path, &manifest)
        .map_err(|error| format!("{} repair stopped: {error}", game.title))?;
    let manifest_is_signed = manifest_has_signature(&manifest);
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
    validate_repair_package_hash(&manifest, &package_path, &game.title)?;

    let expected_manifest_files = manifest.files.clone();

    let repaired_manifest_files = if is_zip_package(&package_path) {
        extract_og_zip_package(&package_path, &install_path, |_, _| {})?
    } else {
        og_manifest_file_for_path(&install_path, &package_path)
            .into_iter()
            .collect()
    };
    validate_repaired_manifest_files(&expected_manifest_files, &repaired_manifest_files)?;

    let executable_path = find_launch_executable(&install_path, &game.title).ok_or_else(|| {
        format!(
            "{} repair did not produce a launchable executable.",
            game.title
        )
    })?;
    if !manifest_is_signed {
        manifest.files = repaired_manifest_files.clone();
        manifest.executable_path = og_manifest_relative_path(&install_path, &executable_path);
    }
    write_og_managed_manifest_details(&install_path, &manifest)?;

    game.status = GameStatus::Installed;
    game.install_path = Some(path_to_string(install_path.clone()));
    game.executable_path = Some(path_to_string(executable_path.clone()));
    game.process_names = executable_path
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| vec![name.to_string()])
        .unwrap_or_default();

    let status = game.status.clone();
    let cached_install_path = game.install_path.clone();
    let cached_executable_path = game.executable_path.clone();
    let process_names = game.process_names.clone();
    game = update_installed_game_cache(&game_id, move |latest| {
        latest.status = status;
        latest.install_path = cached_install_path;
        latest.executable_path = cached_executable_path;
        latest.process_names = process_names;
        Ok(())
    })?;

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
    let (update_count, games) = mutate_installed_games_cache(|games| {
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

        Ok((update_count, games.clone()))
    })?;

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

    let games = read_installed_games_cache().unwrap_or_default();
    let game_index = games
        .iter()
        .position(|game| game.id == game_id)
        .ok_or_else(|| format!("Game '{game_id}' was not found in the local library cache."))?;

    let game = games[game_index].clone();

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

    Err(format!(
        "{} cannot be updated automatically yet. The managed installer has no signed update package, so no files were changed. Re-download a verified package instead.",
        game.title
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_temp_dir(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "ogl-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn verify_manifest_file_entry_flags_same_size_hash_mismatch() {
        let root = unique_temp_dir("verify-hash-mismatch");
        fs::write(root.join("game.bin"), b"abc").unwrap();
        let manifest_file = OgManagedManifestFile {
            path: "game.bin".to_string(),
            size_bytes: Some(3),
            sha256: Some(
                "0000000000000000000000000000000000000000000000000000000000000000".to_string(),
            ),
        };

        let issue = verify_manifest_file_entry(&root, &manifest_file).unwrap();

        assert!(issue.contains("hash mismatch"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn verify_manifest_file_entry_accepts_matching_hash() {
        let root = unique_temp_dir("verify-hash-match");
        fs::write(root.join("game.bin"), b"abc").unwrap();
        let manifest_file = OgManagedManifestFile {
            path: "game.bin".to_string(),
            size_bytes: Some(3),
            sha256: Some(
                "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD".to_string(),
            ),
        };

        assert!(verify_manifest_file_entry(&root, &manifest_file).is_none());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn validate_repair_package_hash_rejects_changed_package() {
        let root = unique_temp_dir("repair-package-hash");
        let package_path = root.join("package.zip");
        fs::write(&package_path, b"corrupt-package").unwrap();
        let manifest = OgManagedManifest {
            download_sha256: Some(
                "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad".to_string(),
            ),
            ..Default::default()
        };

        let error = validate_repair_package_hash(&manifest, &package_path, "Game").unwrap_err();

        assert!(error.contains("failed SHA-256 validation"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn validate_repaired_manifest_files_rejects_hash_mismatch() {
        let expected = vec![OgManagedManifestFile {
            path: "bin/game".to_string(),
            size_bytes: Some(3),
            sha256: Some("expected".to_string()),
        }];
        let repaired = vec![OgManagedManifestFile {
            path: "bin/game".to_string(),
            size_bytes: Some(3),
            sha256: Some("actual".to_string()),
        }];

        let error = validate_repaired_manifest_files(&expected, &repaired).unwrap_err();

        assert!(error.contains("hash mismatch"));
    }
}
