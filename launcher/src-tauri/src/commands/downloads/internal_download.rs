use std::path::PathBuf;
use std::time::Instant;

use tokio::sync::watch;

use crate::commands::downloads::legacy::emit_download_progress;
use crate::commands::downloads::types::{
    cancellable_sleep, update_download_metrics, update_download_status, InternalDownloadSource,
};
use crate::commands::downloads::utils::{
    calculate_active_progress, download_file_name, verify_sha256,
};
use crate::commands::http::shared_http_client;

pub(crate) async fn download_internal_game_file(
    app: &tauri::AppHandle,
    game_id: &str,
    _title: &str,
    source: &InternalDownloadSource,
    install_dir: &PathBuf,
    pause_rx: &watch::Receiver<bool>,
    cancel_rx: &watch::Receiver<bool>,
) -> Result<PathBuf, String> {
    let parsed_url = reqwest::Url::parse(&source.url)
        .map_err(|error| format!("Invalid download URL: {error}"))?;
    if parsed_url.scheme() != "https" && parsed_url.scheme() != "http" {
        return Err("Download URL must use http or https.".to_string());
    }

    tokio::fs::create_dir_all(install_dir)
        .await
        .map_err(|error| format!("Could not create install directory: {error}"))?;

    let file_name = download_file_name(&parsed_url, game_id);
    let final_path = install_dir.join(&file_name);
    let part_path = install_dir.join(format!("{file_name}.part"));
    let client = shared_http_client();
    let mut attempt = 0u8;

    loop {
        attempt += 1;
        match download_internal_game_file_once(
            app,
            game_id,
            client,
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
                    verify_sha256(&final_path, expected_sha256)?;
                }
                return Ok(final_path);
            }
            Err(error) if error == "Download cancelled." => return Err(error),
            Err(error) if attempt < 3 => {
                update_download_status(game_id, "downloading", "Retrying", 0, 999);
                emit_download_progress(
                    app,
                    game_id,
                    0,
                    &format!("Retry {attempt}/3: {error}"),
                    "downloading",
                    999,
                );
                let backoff = tokio::time::Duration::from_secs(2u64.pow(attempt as u32));
                if cancellable_sleep(cancel_rx, backoff).await {
                    return Err("Download cancelled.".to_string());
                }
            }
            Err(error) => return Err(error),
        }
    }
}

async fn download_internal_game_file_once(
    app: &tauri::AppHandle,
    game_id: &str,
    client: &reqwest::Client,
    source_url: &str,
    part_path: &PathBuf,
    final_path: &PathBuf,
    pause_rx: &watch::Receiver<bool>,
    cancel_rx: &watch::Receiver<bool>,
) -> Result<(), String> {
    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;

    let existing_bytes = tokio::fs::metadata(part_path)
        .await
        .map(|metadata| metadata.len())
        .unwrap_or(0);

    let mut request = client.get(source_url);
    if existing_bytes > 0 {
        request = request.header(reqwest::header::RANGE, format!("bytes={existing_bytes}-"));
    }

    let response = request
        .send()
        .await
        .map_err(|error| format!("Download request failed: {error}"))?;
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
    let mut downloaded = offset;
    let mut bytes_since_last_update = 0u64;
    let mut last_update = Instant::now();

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
    while let Some(chunk) = body.next().await {
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

        let chunk = chunk.map_err(|error| format!("Download stream error: {error}"))?;
        file.write_all(&chunk)
            .await
            .map_err(|error| format!("Could not write download chunk: {error}"))?;

        downloaded = downloaded.saturating_add(chunk.len() as u64);
        bytes_since_last_update = bytes_since_last_update.saturating_add(chunk.len() as u64);

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
