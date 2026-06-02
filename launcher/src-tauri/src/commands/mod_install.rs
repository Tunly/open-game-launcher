use std::fs;
use std::path::PathBuf;
use reqwest;

/// Downloads a mod archive from a URL and extracts it to the game's mod directory.
#[tauri::command]
pub async fn install_mod_from_url(
    url: String,
    target_dir: String,
    game_title: String,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Download returned {}", resp.status()));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Read body failed: {e}"))?;

    let target = PathBuf::from(&target_dir);
    fs::create_dir_all(&target)
        .map_err(|e| format!("Create target dir failed: {e}"))?;

    // Try to extract as ZIP
    let cursor = std::io::Cursor::new(&bytes[..]);
    match zip::ZipArchive::new(cursor) {
        Ok(mut archive) => {
            for i in 0..archive.len() {
                let mut file = archive
                    .by_index(i)
                    .map_err(|e| format!("ZIP entry read failed: {e}"))?;
                let out_path = target.join(file.mangled_name());
                if file.is_dir() {
                    fs::create_dir_all(&out_path).ok();
                } else {
                    if let Some(parent) = out_path.parent() {
                        fs::create_dir_all(parent).ok();
                    }
                    let mut out_file = fs::File::create(&out_path)
                        .map_err(|e| format!("Create file failed: {e}"))?;
                    std::io::copy(&mut file, &mut out_file)
                        .map_err(|e| format!("Extract file failed: {e}"))?;
                }
            }
        }
        Err(_) => {
            // Not a ZIP — save as raw file
            let file_name = url
                .split('/')
                .last()
                .unwrap_or("mod_download.bin");
            let dest = target.join(file_name);
            fs::write(&dest, &bytes)
                .map_err(|e| format!("Write file failed: {e}"))?;
        }
    }

    Ok(format!("Mod for '{}' installed to {}", game_title, target_dir))
}

/// Scans a directory for installed mods (checks for info.json or mod.config).
#[tauri::command]
pub fn scan_mod_directory(path: String) -> Result<Vec<String>, String> {
    let dir = PathBuf::from(&path);
    if !dir.is_dir() {
        return Ok(vec![]);
    }
    let mut mods = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let sub = entry.path();
            if sub.is_dir() {
                let info = sub.join("info.json");
                let config = sub.join("mod.config");
                if info.is_file() || config.is_file() {
                    mods.push(sub.file_name().unwrap_or_default().to_string_lossy().to_string());
                }
            }
        }
    }
    Ok(mods)
}
