use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

const MAX_BANDWIDTH_KBPS: u32 = 1_000_000;
pub(crate) const MIN_CONCURRENT_DOWNLOADS: u32 = 1;
pub(crate) const MAX_CONCURRENT_DOWNLOADS: u32 = 16;
pub(crate) const DEFAULT_MAX_CONCURRENT_DOWNLOADS: u32 = 3;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DownloadSettings {
    pub bandwidth_limit_kbps: Option<u32>,
    #[serde(default = "default_max_concurrent_downloads")]
    pub max_concurrent_downloads: u32,
    #[serde(default)]
    pub install_root: Option<String>,
}

impl Default for DownloadSettings {
    fn default() -> Self {
        Self {
            bandwidth_limit_kbps: None,
            max_concurrent_downloads: DEFAULT_MAX_CONCURRENT_DOWNLOADS,
            install_root: None,
        }
    }
}

fn default_max_concurrent_downloads() -> u32 {
    DEFAULT_MAX_CONCURRENT_DOWNLOADS
}

pub fn get_download_settings() -> Result<DownloadSettings, String> {
    let path = settings_path()?;
    if !path.exists() {
        return Ok(DownloadSettings::default());
    }
    let contents = std::fs::read_to_string(&path)
        .map_err(|error| format!("Could not read download settings: {error}"))?;
    normalize_settings(
        serde_json::from_str(&contents)
            .map_err(|error| format!("Could not parse download settings: {error}"))?,
    )
}

pub fn save_download_settings(settings: DownloadSettings) -> Result<DownloadSettings, String> {
    let settings = normalize_settings(settings)?;
    let path = settings_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create download settings folder: {error}"))?;
    }
    let contents = serde_json::to_string_pretty(&settings)
        .map_err(|error| format!("Could not encode download settings: {error}"))?;
    std::fs::write(path, contents)
        .map_err(|error| format!("Could not write download settings: {error}"))?;
    Ok(settings)
}

pub fn normalize_bandwidth_limit(value: Option<u32>) -> Result<Option<u32>, String> {
    match value {
        None => Ok(None),
        Some(value) if (1..=MAX_BANDWIDTH_KBPS).contains(&value) => Ok(Some(value)),
        Some(_) => Err(format!(
            "Bandwidth limit must be between 1 and {MAX_BANDWIDTH_KBPS} KB/s, or unlimited."
        )),
    }
}

pub fn normalize_max_concurrent_downloads(value: u32) -> Result<u32, String> {
    if (MIN_CONCURRENT_DOWNLOADS..=MAX_CONCURRENT_DOWNLOADS).contains(&value) {
        Ok(value)
    } else {
        Err(format!(
            "Parallel downloads must be between {MIN_CONCURRENT_DOWNLOADS} and {MAX_CONCURRENT_DOWNLOADS}."
        ))
    }
}

pub fn normalize_install_root(value: Option<String>) -> Result<Option<String>, String> {
    match value {
        None => Ok(None),
        Some(raw) => {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                return Ok(None);
            }
            if !Path::new(trimmed).is_absolute() {
                return Err("Install folder must be an absolute path.".to_string());
            }
            Ok(Some(trimmed.to_string()))
        }
    }
}

fn normalize_settings(mut settings: DownloadSettings) -> Result<DownloadSettings, String> {
    settings.bandwidth_limit_kbps = normalize_bandwidth_limit(settings.bandwidth_limit_kbps)?;
    settings.max_concurrent_downloads =
        normalize_max_concurrent_downloads(settings.max_concurrent_downloads)?;
    settings.install_root = normalize_install_root(settings.install_root)?;
    Ok(settings)
}

fn settings_path() -> Result<PathBuf, String> {
    dirs::config_dir()
        .map(|dir| dir.join("OG-Launcher").join("download-settings.json"))
        .ok_or_else(|| "Could not resolve the launcher config directory.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bandwidth_limit_accepts_unlimited_and_positive_values() {
        assert_eq!(normalize_bandwidth_limit(None).unwrap(), None);
        assert_eq!(normalize_bandwidth_limit(Some(512)).unwrap(), Some(512));
    }

    #[test]
    fn bandwidth_limit_rejects_zero_and_unreasonable_values() {
        assert!(normalize_bandwidth_limit(Some(0)).is_err());
        assert!(normalize_bandwidth_limit(Some(1_000_001)).is_err());
    }

    #[test]
    fn concurrent_downloads_accepts_the_valid_range() {
        assert_eq!(normalize_max_concurrent_downloads(1).unwrap(), 1);
        assert_eq!(normalize_max_concurrent_downloads(16).unwrap(), 16);
        assert_eq!(
            normalize_max_concurrent_downloads(DEFAULT_MAX_CONCURRENT_DOWNLOADS).unwrap(),
            3
        );
    }

    #[test]
    fn concurrent_downloads_rejects_zero_and_over_the_limit() {
        assert!(normalize_max_concurrent_downloads(0).is_err());
        assert!(normalize_max_concurrent_downloads(17).is_err());
    }

    #[test]
    fn install_root_requires_an_absolute_path() {
        assert_eq!(normalize_install_root(None).unwrap(), None);
        assert_eq!(
            normalize_install_root(Some("   ".to_string())).unwrap(),
            None
        );
        #[cfg(windows)]
        assert!(normalize_install_root(Some("D:\\Games".to_string())).is_ok());
        #[cfg(not(windows))]
        assert!(normalize_install_root(Some("/opt/games".to_string())).is_ok());
        assert!(normalize_install_root(Some("relative/games".to_string())).is_err());
    }

    #[test]
    fn old_settings_file_without_new_fields_loads_defaults() {
        let legacy = r#"{"bandwidthLimitKbps": 2048}"#;
        let parsed: DownloadSettings = serde_json::from_str(legacy).unwrap();
        assert_eq!(parsed.bandwidth_limit_kbps, Some(2048));
        assert_eq!(
            parsed.max_concurrent_downloads,
            DEFAULT_MAX_CONCURRENT_DOWNLOADS
        );
        assert_eq!(parsed.install_root, None);
    }
}
