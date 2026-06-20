//! Stable per-device UUID used as `launcher_device_id` on `game_sessions` rows.
//!
//! Generated once and persisted in the launcher's data dir, so a single
//! installation always reports the same device id. Survives restarts and
//! library resets.
use std::path::PathBuf;
use uuid::Uuid;

const DEVICE_ID_FILE: &str = "device_id";

pub fn device_id_path() -> Option<PathBuf> {
    dirs::data_local_dir()
        .or_else(dirs::data_dir)
        .map(|dir| dir.join("open-game-launcher").join(DEVICE_ID_FILE))
}

pub fn load_or_create_device_id() -> String {
    let Some(path) = device_id_path() else {
        return Uuid::new_v4().to_string();
    };
    if let Ok(existing) = std::fs::read_to_string(&path) {
        let trimmed = existing.trim();
        if Uuid::parse_str(trimmed).is_ok() {
            return trimmed.to_string();
        }
    }
    let fresh = Uuid::new_v4().to_string();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&path, &fresh);
    fresh
}

#[tauri::command]
pub fn get_launcher_device_id() -> String {
    load_or_create_device_id()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn load_or_create_is_a_valid_uuid() {
        let id = load_or_create_device_id();
        assert!(Uuid::parse_str(&id).is_ok());
    }
}
