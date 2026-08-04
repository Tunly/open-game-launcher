use std::path::PathBuf;
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderValue, RANGE};
use tokio::sync::watch;

use crate::commands::downloads::remote_security::{
    parse_and_validate_remote_url, send_validated_remote_request_with_headers,
};
use crate::commands::downloads::settings::get_download_settings;
use crate::commands::downloads::types::{
    cancellable_sleep, emit_download_progress, redact_download_error_message,
    update_download_metrics, update_download_status, InternalDownloadSource,
};
use crate::commands::downloads::utils::{
    calculate_active_progress, download_file_name, sanitize_download_file_name, verify_sha256,
};

const MAX_INTERNAL_DOWNLOAD_BYTES: u64 = 64 * 1024 * 1024 * 1024;
const MAX_INSTALL_MANIFEST_BYTES: u64 = 1024 * 1024;
const INTERNAL_DOWNLOAD_REQUEST_TIMEOUT: Duration = Duration::from_secs(24 * 60 * 60);

pub(crate) async fn download_internal_game_file(
    app: &tauri::AppHandle,
    game_id: &str,
    _title: &str,
    source: &InternalDownloadSource,
    install_dir: &PathBuf,
    pause_rx: &watch::Receiver<bool>,
    cancel_rx: &watch::Receiver<bool>,
) -> Result<PathBuf, String> {
    let parsed_url = validated_internal_download_url(&source.url)?;

    tokio::fs::create_dir_all(install_dir)
        .await
        .map_err(|error| format!("Could not create install directory: {error}"))?;
    validate_internal_install_directory(install_dir)?;

    let file_name = download_file_name(&parsed_url, game_id);
    let final_path = install_dir.join(&file_name);
    let part_path = install_dir.join(format!("{file_name}.part"));
    let mut attempt = 0u8;

    loop {
        attempt += 1;
        match download_internal_game_file_once(
            app,
            game_id,
            &source.url,
            &part_path,
            &final_path,
            pause_rx,
            cancel_rx,
        )
        .await
        {
            Ok(()) => {
                if let Some(expected_sha256) = source.sha256.as_deref() {
                    verify_download_checksum_or_remove(&final_path, expected_sha256, cancel_rx)?;
                }
                return Ok(final_path);
            }
            Err(error) if error == "Download cancelled." => return Err(error),
            Err(error) if error.contains("download size limit") => return Err(error),
            Err(error) if attempt < 3 => {
                let safe_error = redact_download_error_message(&error);
                update_download_status(game_id, "downloading", "Retrying", 0, 999);
                emit_download_progress(
                    app,
                    game_id,
                    0,
                    &format!("Retry {attempt}/3: {safe_error}"),
                    "downloading",
                    999,
                );
                let backoff = tokio::time::Duration::from_secs(2u64.pow(attempt as u32));
                if cancellable_sleep(cancel_rx, backoff).await {
                    return Err("Download cancelled.".to_string());
                }
            }
            Err(error) => return Err(redact_download_error_message(&error)),
        }
    }
}

pub(crate) async fn download_internal_install_manifest_file(
    source: &InternalDownloadSource,
    install_dir: &PathBuf,
    cancel_rx: &watch::Receiver<bool>,
) -> Result<Option<PathBuf>, String> {
    let Some(manifest_url) = source
        .install_manifest_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(None);
    };

    let parsed_url = validated_internal_download_url(manifest_url)?;

    tokio::fs::create_dir_all(install_dir)
        .await
        .map_err(|error| format!("Could not create install directory: {error}"))?;
    validate_internal_install_directory(install_dir)?;

    let file_name = parsed_url
        .path_segments()
        .and_then(|mut segments| segments.next_back())
        .map(sanitize_download_file_name)
        .filter(|segment| !segment.trim().is_empty())
        .unwrap_or_else(|| "og-install-manifest.json".to_string());
    let final_path = install_dir.join(format!(".{file_name}.sidecar"));
    let mut headers = HeaderMap::new();
    headers.insert(
        reqwest::header::ACCEPT,
        HeaderValue::from_static("application/json"),
    );
    if *cancel_rx.borrow() {
        return Err("Download cancelled.".to_string());
    }
    let mut request_cancel_rx = cancel_rx.clone();
    let response = tokio::select! {
        biased;
        _ = request_cancel_rx.changed() => return Err("Download cancelled.".to_string()),
        response = send_validated_remote_request_with_headers(
            parsed_url,
            headers,
            INTERNAL_DOWNLOAD_REQUEST_TIMEOUT,
        ) => response.map_err(|error| {
            redact_download_error_message(&format!("Install manifest request failed: {error}"))
        })?,
    };
    if response
        .content_length()
        .is_some_and(|length| length > MAX_INSTALL_MANIFEST_BYTES)
    {
        return Err("Install manifest is larger than 1 MiB.".to_string());
    }
    let mut bytes = Vec::new();
    let mut body = response.bytes_stream();
    let mut stream_cancel_rx = cancel_rx.clone();
    loop {
        let chunk = tokio::select! {
            biased;
            _ = stream_cancel_rx.changed() => return Err("Download cancelled.".to_string()),
            chunk = body.next() => chunk,
        };
        let Some(chunk) = chunk else {
            break;
        };
        let chunk =
            chunk.map_err(|error| format!("Could not read install manifest response: {error}"))?;
        checked_internal_download_size(bytes.len() as u64, chunk.len(), MAX_INSTALL_MANIFEST_BYTES)
            .map_err(|_| "Install manifest is larger than 1 MiB.".to_string())?;
        bytes.extend_from_slice(&chunk);
    }

    if *cancel_rx.borrow() {
        return Err("Download cancelled.".to_string());
    }
    if let Err(error) = tokio::fs::write(&final_path, bytes).await {
        let _ = tokio::fs::remove_file(&final_path).await;
        return Err(format!("Could not write install manifest: {error}"));
    }
    if let Some(expected_sha256) = source.install_manifest_sha256.as_deref() {
        verify_download_checksum_or_remove(&final_path, expected_sha256, cancel_rx)?;
    }

    Ok(Some(final_path))
}

#[allow(clippy::too_many_arguments)]
async fn download_internal_game_file_once(
    app: &tauri::AppHandle,
    game_id: &str,
    source_url: &str,
    part_path: &PathBuf,
    final_path: &PathBuf,
    pause_rx: &watch::Receiver<bool>,
    cancel_rx: &watch::Receiver<bool>,
) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;

    let existing_bytes = tokio::fs::metadata(part_path)
        .await
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    if existing_bytes > MAX_INTERNAL_DOWNLOAD_BYTES {
        let _ = tokio::fs::remove_file(part_path).await;
        return Err(format!(
            "Internal download exceeds the {MAX_INTERNAL_DOWNLOAD_BYTES} byte download size limit."
        ));
    }

    let mut headers = HeaderMap::new();
    if existing_bytes > 0 {
        let range = HeaderValue::from_str(&format!("bytes={existing_bytes}-"))
            .map_err(|error| format!("Could not build download resume header: {error}"))?;
        headers.insert(RANGE, range);
    }

    let url = validated_internal_download_url(source_url)?;
    if *cancel_rx.borrow() {
        return Err("Download cancelled.".to_string());
    }
    let mut request_cancel_rx = cancel_rx.clone();
    let response = tokio::select! {
        biased;
        _ = request_cancel_rx.changed() => return Err("Download cancelled.".to_string()),
        response = send_validated_remote_request_with_headers(
            url,
            headers,
            INTERNAL_DOWNLOAD_REQUEST_TIMEOUT,
        ) => response.map_err(|error| {
            redact_download_error_message(&format!("Download request failed: {error}"))
        })?,
    };
    let status = response.status();
    if !status.is_success() {
        return Err(format!("Download failed with status {status}"));
    }

    let resumes = status == reqwest::StatusCode::PARTIAL_CONTENT;
    let offset = if existing_bytes > 0 && resumes {
        existing_bytes
    } else {
        0
    };
    let total_bytes = response
        .content_length()
        .map(|length| length.saturating_add(offset));
    if total_bytes.is_some_and(|total| total > MAX_INTERNAL_DOWNLOAD_BYTES) {
        let _ = tokio::fs::remove_file(part_path).await;
        return Err(format!(
            "Internal download exceeds the {MAX_INTERNAL_DOWNLOAD_BYTES} byte download size limit."
        ));
    }
    let mut downloaded = offset;
    let mut bytes_since_last_update = 0u64;
    let mut last_update = Instant::now();
    let settings = get_download_settings()?;
    let bandwidth_limit_bytes = settings
        .bandwidth_limit_kbps
        .map(u64::from)
        .map(|kbps| kbps.saturating_mul(1024));
    let mut throttle_window_started = Instant::now();
    let mut throttle_window_bytes = 0u64;

    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .append(resumes)
        .truncate(!resumes)
        .open(part_path)
        .await
        .map_err(|error| format!("Could not open partial download: {error}"))?;

    update_download_metrics(game_id, "download", Some(downloaded), total_bytes);
    let initial_progress = total_bytes
        .map(|total| calculate_active_progress(downloaded, total))
        .unwrap_or(0);
    emit_download_progress(
        app,
        game_id,
        initial_progress,
        "Connecting",
        "downloading",
        999,
    );

    let mut body = response.bytes_stream();
    let mut stream_cancel_rx = cancel_rx.clone();
    loop {
        let chunk = tokio::select! {
            biased;
            _ = stream_cancel_rx.changed() => {
                let _ = tokio::fs::remove_file(part_path).await;
                return Err("Download cancelled.".to_string());
            }
            chunk = body.next() => chunk,
        };
        let Some(chunk) = chunk else {
            break;
        };
        if *cancel_rx.borrow() {
            let _ = tokio::fs::remove_file(part_path).await;
            return Err("Download cancelled.".to_string());
        }

        while *pause_rx.borrow() {
            let progress = total_bytes
                .map(|total| calculate_active_progress(downloaded, total))
                .unwrap_or(0);
            update_download_status(game_id, "paused", "Paused", progress, 0);
            emit_download_progress(app, game_id, progress, "Paused", "paused", 0);
            tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
            if *cancel_rx.borrow() {
                let _ = tokio::fs::remove_file(part_path).await;
                return Err("Download cancelled.".to_string());
            }
        }

        let chunk = chunk.map_err(|error| {
            redact_download_error_message(&format!("Download stream error: {error}"))
        })?;
        let next_downloaded = match checked_internal_download_size(
            downloaded,
            chunk.len(),
            MAX_INTERNAL_DOWNLOAD_BYTES,
        ) {
            Ok(next) => next,
            Err(error) => {
                drop(file);
                let _ = tokio::fs::remove_file(part_path).await;
                return Err(error);
            }
        };
        file.write_all(&chunk)
            .await
            .map_err(|error| format!("Could not write download chunk: {error}"))?;

        downloaded = next_downloaded;
        bytes_since_last_update = bytes_since_last_update.saturating_add(chunk.len() as u64);
        if let Some(limit_bytes) = bandwidth_limit_bytes {
            throttle_window_bytes = throttle_window_bytes.saturating_add(chunk.len() as u64);
            let elapsed = throttle_window_started.elapsed();
            let expected =
                Duration::from_secs_f64(throttle_window_bytes as f64 / limit_bytes as f64);
            if expected > elapsed {
                tokio::time::sleep(expected - elapsed).await;
            }
            if throttle_window_started.elapsed() >= Duration::from_secs(1) {
                throttle_window_started = Instant::now();
                throttle_window_bytes = 0;
            }
        }

        let elapsed_ms = last_update.elapsed().as_millis();
        if elapsed_ms >= 300 {
            let speed_bytes_per_sec =
                (bytes_since_last_update as f64) / (elapsed_ms as f64 / 1000.0);
            let speed_mb_sec = speed_bytes_per_sec / (1024.0 * 1024.0);
            let speed = format!("{speed_mb_sec:.1} MB/s");
            let progress = total_bytes
                .map(|total| calculate_active_progress(downloaded, total))
                .unwrap_or(0);
            let eta = total_bytes
                .and_then(|total| {
                    if speed_bytes_per_sec > 0.0 {
                        Some((total.saturating_sub(downloaded) as f64 / speed_bytes_per_sec) as u32)
                    } else {
                        None
                    }
                })
                .unwrap_or(999);

            update_download_metrics(game_id, "download", Some(downloaded), total_bytes);
            update_download_status(game_id, "downloading", &speed, progress, eta);
            emit_download_progress(app, game_id, progress, &speed, "downloading", eta);
            bytes_since_last_update = 0;
            last_update = Instant::now();
        }
    }

    file.flush()
        .await
        .map_err(|error| format!("Could not flush downloaded file: {error}"))?;
    drop(file);

    if let Some(total) = total_bytes {
        if downloaded < total {
            return Err(format!(
                "Download incomplete: {downloaded} of {total} bytes."
            ));
        }
    }

    if *cancel_rx.borrow() {
        let _ = tokio::fs::remove_file(part_path).await;
        return Err("Download cancelled.".to_string());
    }
    if final_path.exists() {
        tokio::fs::remove_file(final_path)
            .await
            .map_err(|error| format!("Could not replace existing file: {error}"))?;
    }
    tokio::fs::rename(part_path, final_path)
        .await
        .map_err(|error| format!("Could not finalize download: {error}"))?;

    Ok(())
}

fn validated_internal_download_url(value: &str) -> Result<reqwest::Url, String> {
    parse_and_validate_remote_url(value)
        .map_err(|error| error.replace("mod", "download").replace("Mod", "Download"))
}

fn verify_download_checksum_or_remove(
    path: &PathBuf,
    expected: &str,
    cancel_rx: &watch::Receiver<bool>,
) -> Result<(), String> {
    match verify_sha256(path, expected, cancel_rx) {
        Ok(()) => Ok(()),
        Err(error) => match std::fs::remove_file(path) {
            Ok(()) => Err(error),
            Err(cleanup_error) if cleanup_error.kind() == std::io::ErrorKind::NotFound => {
                Err(error)
            }
            Err(cleanup_error) => Err(format!(
                "{error} Could not remove the rejected download artifact: {cleanup_error}"
            )),
        },
    }
}

fn validate_internal_install_directory(install_dir: &PathBuf) -> Result<(), String> {
    let metadata = std::fs::symlink_metadata(install_dir)
        .map_err(|error| format!("Could not inspect install directory: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(
            "Refusing an internal download install path that is not a real directory.".to_string(),
        );
    }

    let games_root = install_dir
        .parent()
        .ok_or_else(|| "Internal download install path has no managed parent.".to_string())?;
    let directory_name = install_dir
        .file_name()
        .ok_or_else(|| "Internal download install path has no game directory name.".to_string())?;
    let canonical_root = games_root
        .canonicalize()
        .map_err(|error| format!("Could not resolve managed games directory: {error}"))?;
    let canonical_install = install_dir
        .canonicalize()
        .map_err(|error| format!("Could not resolve install directory: {error}"))?;
    let expected_install = canonical_root.join(directory_name);

    #[cfg(windows)]
    let is_expected_directory = canonical_install
        .to_string_lossy()
        .eq_ignore_ascii_case(&expected_install.to_string_lossy());
    #[cfg(not(windows))]
    let is_expected_directory = canonical_install == expected_install;

    if !is_expected_directory {
        return Err(
            "Refusing an internal download install path redirected outside its managed game directory."
                .to_string(),
        );
    }

    Ok(())
}

fn checked_internal_download_size(current: u64, chunk_len: usize, max: u64) -> Result<u64, String> {
    let chunk_len = u64::try_from(chunk_len)
        .map_err(|_| "Internal download chunk size overflowed.".to_string())?;
    let next = current
        .checked_add(chunk_len)
        .ok_or_else(|| "Internal download size overflowed.".to_string())?;
    if next > max {
        return Err(format!(
            "Internal download exceeds the {max} byte download size limit."
        ));
    }
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn internal_download_urls_require_public_https_targets() {
        assert!(validated_internal_download_url("https://cdn.example.com/game.zip").is_ok());
        assert!(validated_internal_download_url("http://cdn.example.com/game.zip").is_err());
        assert!(validated_internal_download_url("https://127.0.0.1/game.zip").is_err());
        assert!(validated_internal_download_url("https://localhost/game.zip").is_err());
        assert!(validated_internal_download_url("https://user@example.com/game.zip").is_err());
        assert!(validated_internal_download_url("https://example.com/game.zip#part").is_err());
    }

    #[test]
    fn internal_download_stream_size_is_bounded_even_without_content_length() {
        assert_eq!(checked_internal_download_size(90, 10, 100).unwrap(), 100);
        assert!(checked_internal_download_size(90, 11, 100).is_err());
        assert!(checked_internal_download_size(u64::MAX, 1, u64::MAX).is_err());
    }

    #[test]
    fn failed_checksum_removes_the_untrusted_download_artifact() {
        let root = std::env::temp_dir().join(format!(
            "ogl-internal-checksum-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let downloaded = root.join("game.zip");
        std::fs::write(&downloaded, b"untrusted").unwrap();

        let (_cancel_tx, cancel_rx) = watch::channel(false);
        let error = verify_download_checksum_or_remove(&downloaded, &"0".repeat(64), &cancel_rx)
            .unwrap_err();

        assert!(error.contains("SHA-256"));
        assert!(!downloaded.exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn cancelled_checksum_stops_and_removes_the_partial_artifact() {
        let root = std::env::temp_dir().join(format!(
            "ogl-internal-cancelled-checksum-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let downloaded = root.join("game.zip");
        std::fs::write(&downloaded, b"untrusted").unwrap();
        let (cancel_tx, cancel_rx) = watch::channel(false);
        cancel_tx.send(true).unwrap();

        let error = verify_download_checksum_or_remove(&downloaded, &"0".repeat(64), &cancel_rx)
            .unwrap_err();

        assert_eq!(error, "Download cancelled.");
        assert!(!downloaded.exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn install_directory_guard_accepts_a_real_child_and_rejects_a_file() {
        let root = std::env::temp_dir().join(format!(
            "ogl-internal-root-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let games_root = root.join("games");
        let install_dir = games_root.join("game-1");
        std::fs::create_dir_all(&install_dir).unwrap();
        assert!(validate_internal_install_directory(&install_dir).is_ok());

        let invalid = games_root.join("not-a-directory");
        std::fs::write(&invalid, b"file").unwrap();
        assert!(validate_internal_install_directory(&invalid).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn install_directory_guard_rejects_a_symlinked_game_root() {
        let root = std::env::temp_dir().join(format!(
            "ogl-internal-symlink-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let games_root = root.join("games");
        let outside = root.join("outside");
        std::fs::create_dir_all(&games_root).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        let install_dir = games_root.join("game-1");
        std::os::unix::fs::symlink(&outside, &install_dir).unwrap();

        assert!(validate_internal_install_directory(&install_dir).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
