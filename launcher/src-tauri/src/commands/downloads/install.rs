use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};

use crate::commands::downloads::types::{
    emit_download_progress, update_download_metrics, update_download_status,
    InternalDownloadSource, DOWNLOAD_STATUS_INSTALLING,
};
use crate::commands::games::{
    extract_og_zip_package, find_launch_executable, installed_game, is_file_executable,
    is_zip_package, manifest_has_signature, og_manifest_file_for_path, og_manifest_path_for_entry,
    og_manifest_relative_path, path_to_string, read_installed_games_cache,
    verify_og_managed_manifest_signature, write_installed_games_cache,
    write_og_managed_manifest_details, GameStatus, OgManagedManifest, OgManagedManifestFile,
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
    install_manifest_file: Option<&Path>,
) -> Result<(), String> {
    let manifest = if let Some(install_manifest_file) = install_manifest_file {
        read_signed_download_manifest(
            game_id,
            install_dir,
            source,
            downloaded_file,
            installed_package,
            install_manifest_file,
        )?
    } else {
        OgManagedManifest {
            game_id: game_id.to_string(),
            title: title.to_string(),
            version: "1.0.0".to_string(),
            managed_by: "OG-Launcher".to_string(),
            download_url: source.manifest_download_url(),
            download_sha256: source.sha256.clone(),
            package_file: og_manifest_relative_path(install_dir, downloaded_file),
            files: installed_package.files.clone(),
            executable_path: og_manifest_relative_path(
                install_dir,
                &installed_package.executable_path,
            ),
            updated_at: None,
            ..Default::default()
        }
    };

    write_og_managed_manifest_details(install_dir, &manifest)
}

fn read_signed_download_manifest(
    game_id: &str,
    install_dir: &Path,
    source: &InternalDownloadSource,
    downloaded_file: &Path,
    installed_package: &InstalledDownloadPackage,
    install_manifest_file: &Path,
) -> Result<OgManagedManifest, String> {
    let contents = fs::read_to_string(install_manifest_file)
        .map_err(|error| format!("Could not read install manifest sidecar: {error}"))?;
    let manifest = serde_json::from_str::<OgManagedManifest>(&contents)
        .map_err(|error| format!("Install manifest sidecar is not valid JSON: {error}"))?;
    if !manifest_has_signature(&manifest) {
        return Err("Install manifest sidecar must include manifestSignature.".to_string());
    }
    validate_signed_download_manifest(
        game_id,
        install_dir,
        source,
        downloaded_file,
        installed_package,
        &manifest,
    )?;
    verify_og_managed_manifest_signature(install_dir, &manifest)
        .map_err(|error| format!("Install manifest signature rejected: {error}"))?;
    Ok(manifest)
}

fn validate_signed_download_manifest(
    game_id: &str,
    install_dir: &Path,
    source: &InternalDownloadSource,
    downloaded_file: &Path,
    installed_package: &InstalledDownloadPackage,
    manifest: &OgManagedManifest,
) -> Result<(), String> {
    if manifest.game_id.trim() != game_id {
        return Err("Install manifest gameId does not match the requested game.".to_string());
    }
    if manifest.title.trim().is_empty() {
        return Err("Install manifest title must not be empty.".to_string());
    }
    if !source.persist_download_url
        && manifest
            .download_url
            .as_deref()
            .is_some_and(|url| !url.trim().is_empty())
    {
        return Err(
            "Remote store-ticket install manifests must not include downloadUrl.".to_string(),
        );
    }
    if manifest
        .download_url
        .as_deref()
        .is_some_and(|url| url.trim() != source.url.trim())
    {
        return Err("Install manifest downloadUrl does not match the package URL.".to_string());
    }
    if let (Some(manifest_sha), Some(source_sha)) = (
        manifest.download_sha256.as_deref(),
        source.sha256.as_deref(),
    ) {
        if !manifest_sha.trim().eq_ignore_ascii_case(source_sha.trim()) {
            return Err(
                "Install manifest downloadSha256 does not match the package SHA.".to_string(),
            );
        }
    }

    let expected_package = og_manifest_relative_path(install_dir, downloaded_file)
        .ok_or_else(|| "Downloaded package is outside the install folder.".to_string())?;
    if manifest.package_file.as_deref() != Some(expected_package.as_str()) {
        return Err(
            "Install manifest packageFile does not match the downloaded package.".to_string(),
        );
    }
    if og_manifest_path_for_entry(install_dir, &expected_package).is_none_or(|path| !path.exists())
    {
        return Err(
            "Install manifest packageFile does not point to the downloaded package.".to_string(),
        );
    }

    let expected_executable =
        og_manifest_relative_path(install_dir, &installed_package.executable_path)
            .ok_or_else(|| "Installed executable is outside the install folder.".to_string())?;
    if manifest.executable_path.as_deref() != Some(expected_executable.as_str()) {
        return Err(
            "Install manifest executablePath does not match the detected executable.".to_string(),
        );
    }

    validate_manifest_file_list(&manifest.files, &installed_package.files)
}

fn validate_manifest_file_list(
    manifest_files: &[OgManagedManifestFile],
    installed_files: &[OgManagedManifestFile],
) -> Result<(), String> {
    if manifest_files.len() != installed_files.len() {
        return Err("Install manifest file list does not match extracted files.".to_string());
    }

    let manifest_by_path = manifest_files
        .iter()
        .map(|file| (file.path.as_str(), file))
        .collect::<BTreeMap<_, _>>();
    for installed in installed_files {
        let Some(expected) = manifest_by_path.get(installed.path.as_str()) else {
            return Err(format!(
                "Install manifest is missing extracted file {}.",
                installed.path
            ));
        };
        if expected.size_bytes != installed.size_bytes {
            return Err(format!(
                "Install manifest size differs for {}.",
                installed.path
            ));
        }
        if !expected
            .sha256
            .as_deref()
            .zip(installed.sha256.as_deref())
            .is_some_and(|(expected, actual)| expected.eq_ignore_ascii_case(actual))
        {
            return Err(format!(
                "Install manifest SHA-256 differs for {}.",
                installed.path
            ));
        }
    }

    Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::games::manifest_env_test_lock;
    use ed25519_dalek::SigningKey;

    fn unique_temp_dir(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "ogl-download-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn hex_bytes(bytes: &[u8]) -> String {
        bytes.iter().map(|byte| format!("{byte:02x}")).collect()
    }

    fn with_manifest_keys<T>(test: impl FnOnce() -> T) -> T {
        let _guard = manifest_env_test_lock()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let signing_key = SigningKey::from_bytes(&[23; 32]);
        std::env::set_var("OGL_INSTALL_MANIFEST_SIGNING_KEY", hex_bytes(&[23; 32]));
        std::env::set_var(
            "OGL_INSTALL_MANIFEST_VERIFYING_KEY",
            hex_bytes(&signing_key.verifying_key().to_bytes()),
        );
        std::env::set_var("OGL_INSTALL_MANIFEST_KEY_ID", "download-provider-test");
        let result = test();
        std::env::remove_var("OGL_INSTALL_MANIFEST_SIGNING_KEY");
        std::env::remove_var("OGL_INSTALL_MANIFEST_VERIFYING_KEY");
        std::env::remove_var("OGL_INSTALL_MANIFEST_KEY_ID");
        result
    }

    fn signed_sidecar_fixture(root: &Path, manifest: OgManagedManifest) -> PathBuf {
        write_og_managed_manifest_details(root, &manifest).unwrap();
        let signed_manifest = root.join(crate::commands::games::OG_MANAGED_MANIFEST_FILE);
        let sidecar = root.join("provider-manifest.sidecar.json");
        fs::copy(&signed_manifest, &sidecar).unwrap();
        fs::remove_file(signed_manifest).unwrap();
        sidecar
    }

    fn source(url: &str) -> InternalDownloadSource {
        InternalDownloadSource::direct_url(url.to_string(), None, None, None)
    }

    fn remote_ticket_source(url: &str) -> InternalDownloadSource {
        InternalDownloadSource::ephemeral_remote_store_ticket(url.to_string(), None, None, None)
    }

    fn installed_package_fixture(root: &Path) -> (PathBuf, InstalledDownloadPackage) {
        let package = root.join("demo.zip");
        let executable = root.join("bin").join("game.exe");
        fs::create_dir_all(executable.parent().unwrap()).unwrap();
        fs::write(&package, b"package").unwrap();
        fs::write(&executable, b"game").unwrap();
        let installed_file = og_manifest_file_for_path(root, &executable).unwrap();
        (
            package,
            InstalledDownloadPackage {
                files: vec![installed_file],
                executable_path: executable,
            },
        )
    }

    #[test]
    fn write_downloaded_game_manifest_omits_ephemeral_remote_ticket_url() {
        let root = unique_temp_dir("remote-ticket-no-url");
        let (package, installed_package) = installed_package_fixture(&root);
        let source = remote_ticket_source("https://signed.example.test/build.zip?sig=abc");

        write_downloaded_game_manifest(
            "demo-game",
            "Demo Game",
            &root,
            &source,
            &package,
            &installed_package,
            None,
        )
        .unwrap();

        let written =
            fs::read_to_string(root.join(crate::commands::games::OG_MANAGED_MANIFEST_FILE))
                .unwrap();
        let manifest = serde_json::from_str::<OgManagedManifest>(&written).unwrap();
        assert_eq!(manifest.download_url, None);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn write_downloaded_game_manifest_keeps_direct_download_url() {
        let root = unique_temp_dir("direct-url-kept");
        let (package, installed_package) = installed_package_fixture(&root);
        let source = source("https://cdn.og-launcher.test/demo.zip");

        write_downloaded_game_manifest(
            "demo-game",
            "Demo Game",
            &root,
            &source,
            &package,
            &installed_package,
            None,
        )
        .unwrap();

        let written =
            fs::read_to_string(root.join(crate::commands::games::OG_MANAGED_MANIFEST_FILE))
                .unwrap();
        let manifest = serde_json::from_str::<OgManagedManifest>(&written).unwrap();
        assert_eq!(manifest.download_url.as_deref(), Some(source.url.as_str()));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn write_downloaded_game_manifest_accepts_signed_sidecar() {
        with_manifest_keys(|| {
            let root = unique_temp_dir("signed-sidecar");
            let package = root.join("demo.zip");
            let executable = root.join("bin").join("game.exe");
            fs::create_dir_all(executable.parent().unwrap()).unwrap();
            fs::write(&package, b"package").unwrap();
            fs::write(&executable, b"game").unwrap();
            let installed_file = og_manifest_file_for_path(&root, &executable).unwrap();
            let installed_package = InstalledDownloadPackage {
                files: vec![installed_file.clone()],
                executable_path: executable.clone(),
            };
            let source = InternalDownloadSource {
                install_manifest_url: Some(
                    "https://cdn.og-launcher.test/demo.og-manifest.json".to_string(),
                ),
                ..source("https://cdn.og-launcher.test/demo.zip")
            };
            let sidecar = signed_sidecar_fixture(
                &root,
                OgManagedManifest {
                    game_id: "demo-game".to_string(),
                    title: "Demo Game".to_string(),
                    version: "1.0.0".to_string(),
                    managed_by: "OG-Launcher".to_string(),
                    download_url: Some(source.url.clone()),
                    package_file: Some("demo.zip".to_string()),
                    files: vec![installed_file],
                    executable_path: Some("bin/game.exe".to_string()),
                    ..Default::default()
                },
            );

            write_downloaded_game_manifest(
                "demo-game",
                "Demo Game",
                &root,
                &source,
                &package,
                &installed_package,
                Some(&sidecar),
            )
            .unwrap();

            let written =
                fs::read_to_string(root.join(crate::commands::games::OG_MANAGED_MANIFEST_FILE))
                    .unwrap();
            let manifest = serde_json::from_str::<OgManagedManifest>(&written).unwrap();
            assert_eq!(
                manifest.manifest_key_id.as_deref(),
                Some("download-provider-test")
            );
            assert!(manifest_has_signature(&manifest));
            assert!(verify_og_managed_manifest_signature(&root, &manifest).is_ok());

            let _ = fs::remove_dir_all(root);
        });
    }

    #[test]
    fn write_downloaded_game_manifest_rejects_sidecar_file_mismatch() {
        with_manifest_keys(|| {
            let root = unique_temp_dir("signed-sidecar-mismatch");
            let package = root.join("demo.zip");
            let executable = root.join("bin").join("game.exe");
            fs::create_dir_all(executable.parent().unwrap()).unwrap();
            fs::write(&package, b"package").unwrap();
            fs::write(&executable, b"game").unwrap();
            let mut manifest_file = og_manifest_file_for_path(&root, &executable).unwrap();
            manifest_file.sha256 = Some(
                "0000000000000000000000000000000000000000000000000000000000000000".to_string(),
            );
            let installed_package = InstalledDownloadPackage {
                files: vec![og_manifest_file_for_path(&root, &executable).unwrap()],
                executable_path: executable.clone(),
            };
            let source = InternalDownloadSource {
                install_manifest_url: Some(
                    "https://cdn.og-launcher.test/demo.og-manifest.json".to_string(),
                ),
                ..source("https://cdn.og-launcher.test/demo.zip")
            };
            let sidecar = signed_sidecar_fixture(
                &root,
                OgManagedManifest {
                    game_id: "demo-game".to_string(),
                    title: "Demo Game".to_string(),
                    version: "1.0.0".to_string(),
                    managed_by: "OG-Launcher".to_string(),
                    download_url: Some(source.url.clone()),
                    package_file: Some("demo.zip".to_string()),
                    files: vec![manifest_file],
                    executable_path: Some("bin/game.exe".to_string()),
                    ..Default::default()
                },
            );

            let error = write_downloaded_game_manifest(
                "demo-game",
                "Demo Game",
                &root,
                &source,
                &package,
                &installed_package,
                Some(&sidecar),
            )
            .unwrap_err();

            assert!(error.contains("SHA-256 differs"));
            let _ = fs::remove_dir_all(root);
        });
    }

    #[test]
    fn write_downloaded_game_manifest_rejects_remote_ticket_sidecar_download_url() {
        with_manifest_keys(|| {
            let root = unique_temp_dir("remote-ticket-sidecar-url");
            let (package, installed_package) = installed_package_fixture(&root);
            let source = remote_ticket_source("https://signed.example.test/build.zip?sig=abc");
            let installed_file = installed_package.files[0].clone();
            let sidecar = signed_sidecar_fixture(
                &root,
                OgManagedManifest {
                    game_id: "demo-game".to_string(),
                    title: "Demo Game".to_string(),
                    version: "1.0.0".to_string(),
                    managed_by: "OG-Launcher".to_string(),
                    download_url: Some(source.url.clone()),
                    package_file: Some("demo.zip".to_string()),
                    files: vec![installed_file],
                    executable_path: Some("bin/game.exe".to_string()),
                    ..Default::default()
                },
            );

            let error = write_downloaded_game_manifest(
                "demo-game",
                "Demo Game",
                &root,
                &source,
                &package,
                &installed_package,
                Some(&sidecar),
            )
            .unwrap_err();

            assert!(error.contains("must not include downloadUrl"));
            let _ = fs::remove_dir_all(root);
        });
    }

    #[test]
    fn write_downloaded_game_manifest_accepts_remote_ticket_sidecar_without_download_url() {
        with_manifest_keys(|| {
            let root = unique_temp_dir("remote-ticket-sidecar-no-url");
            let (package, installed_package) = installed_package_fixture(&root);
            let source = remote_ticket_source("https://signed.example.test/build.zip?sig=abc");
            let installed_file = installed_package.files[0].clone();
            let sidecar = signed_sidecar_fixture(
                &root,
                OgManagedManifest {
                    game_id: "demo-game".to_string(),
                    title: "Demo Game".to_string(),
                    version: "1.0.0".to_string(),
                    managed_by: "OG-Launcher".to_string(),
                    download_url: None,
                    package_file: Some("demo.zip".to_string()),
                    files: vec![installed_file],
                    executable_path: Some("bin/game.exe".to_string()),
                    ..Default::default()
                },
            );

            write_downloaded_game_manifest(
                "demo-game",
                "Demo Game",
                &root,
                &source,
                &package,
                &installed_package,
                Some(&sidecar),
            )
            .unwrap();

            let written =
                fs::read_to_string(root.join(crate::commands::games::OG_MANAGED_MANIFEST_FILE))
                    .unwrap();
            let manifest = serde_json::from_str::<OgManagedManifest>(&written).unwrap();
            assert_eq!(manifest.download_url, None);
            assert!(verify_og_managed_manifest_signature(&root, &manifest).is_ok());

            let _ = fs::remove_dir_all(root);
        });
    }
}
