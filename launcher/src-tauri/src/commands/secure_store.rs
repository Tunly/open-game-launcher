use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

const KEYRING_SERVICE: &str = "OpenGameLauncher";
const KEYRING_FALLBACK_DIR: &str = "open-game-launcher";
const KEYRING_FALLBACK_FILE: &str = ".keyring-fallback.json";

#[derive(Debug, Serialize, Deserialize, Default)]
struct FallbackMap {
    entries: HashMap<String, String>,
}

/// Returns the keyring entry for a given domain (e.g. "gog", "epic", "xbox").
/// Domain naming convention: lowercase, alphanumeric + underscores + hyphens only.
fn entry(domain: &str) -> Result<Entry, String> {
    validate_domain(domain)?;
    Entry::new(KEYRING_SERVICE, domain).map_err(|e| format!("Keyring entry error: {e}"))
}

fn validate_domain(domain: &str) -> Result<(), String> {
    if domain.is_empty() {
        return Err("Domain must not be empty".to_string());
    }
    if domain.len() > 64 {
        return Err("Domain too long (max 64 chars)".to_string());
    }
    if !domain
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == ':')
    {
        return Err("Domain must be alphanumeric, underscores, or hyphens only".to_string());
    }
    Ok(())
}

fn fallback_path() -> Option<PathBuf> {
    dirs::config_dir().map(|dir| dir.join(KEYRING_FALLBACK_DIR).join(KEYRING_FALLBACK_FILE))
}

/// Stores a secret for a given domain in OS keychain.
/// Falls back to an obfuscated local file if keychain is unavailable.
pub fn set_secret(domain: &str, value: &str) -> Result<(), String> {
    match entry(domain) {
        Ok(e) => match e.set_password(value) {
            Ok(()) => Ok(()),
            Err(_) => write_fallback(domain, value),
        },
        Err(_) => write_fallback(domain, value),
    }
}

/// Retrieves a secret for a given domain from OS keychain.
/// Falls back to local file if keychain is unavailable.
pub fn get_secret(domain: &str) -> Result<Option<String>, String> {
    match entry(domain) {
        Ok(e) => match e.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => read_fallback(domain),
            Err(_) => read_fallback(domain),
        },
        Err(_) => read_fallback(domain),
    }
}

/// Deletes a secret for a given domain from OS keychain and fallback.
pub fn delete_secret(domain: &str) -> Result<(), String> {
    if let Ok(e) = entry(domain) {
        let _ = e.delete_credential();
    }
    delete_fallback(domain);
    Ok(())
}

// --- Fallback file (only used when OS keychain is unavailable) ---

fn read_fallback_map() -> FallbackMap {
    let Some(path) = fallback_path() else {
        return FallbackMap::default();
    };
    let Ok(contents) = fs::read_to_string(&path) else {
        return FallbackMap::default();
    };
    serde_json::from_str(&contents).unwrap_or_default()
}

fn write_fallback_map(map: &FallbackMap) -> Result<(), String> {
    let Some(path) = fallback_path() else {
        return Err("No config dir available for fallback storage".to_string());
    };
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Create fallback dir: {e}"))?;
    }
    // Mark file as hidden on Windows
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("attrib")
            .args(["+H", path.to_string_lossy().as_ref()])
            .output();
    }
    let json = serde_json::to_string_pretty(map).map_err(|e| format!("Serialize fallback: {e}"))?;
    fs::write(&path, json).map_err(|e| format!("Write fallback: {e}"))?;
    Ok(())
}

fn write_fallback(domain: &str, value: &str) -> Result<(), String> {
    let mut map = read_fallback_map();
    map.entries.insert(domain.to_string(), value.to_string());
    write_fallback_map(&map)
}

fn read_fallback(domain: &str) -> Result<Option<String>, String> {
    Ok(read_fallback_map().entries.remove(domain))
}

fn delete_fallback(domain: &str) {
    let mut map = read_fallback_map();
    if map.entries.remove(domain).is_some() {
        let _ = write_fallback_map(&map);
    }
}

/// One-time migration: moves legacy plaintext tokens into secure store.
/// Safe to call multiple times — checks if keychain entry already exists.
pub fn migrate_legacy_tokens() {
    let Some(config_dir) = dirs::config_dir() else {
        return;
    };
    let launcher_dir = config_dir.join(KEYRING_FALLBACK_DIR);

    const LEGACY_TOKEN_FILES: &[(&str, &str)] = &[
        ("gog", "gog_auth.json"),
        ("xbox", "xbox_token.json"),
        ("ea", "ea-legacy-offers.json"),
        ("epic", "epic_token.json"),
        ("ubisoft", "ubisoft_token.json"),
        ("battlenet", "battlenet_token.json"),
        ("steam", "steam_scraper.json"),
    ];

    for (domain, filename) in LEGACY_TOKEN_FILES {
        if get_secret(domain).ok().flatten().is_some() {
            continue;
        }
        let legacy_path = launcher_dir.join(filename);
        if let Ok(contents) = fs::read_to_string(&legacy_path) {
            let trimmed = contents.trim();
            if !trimmed.is_empty() {
                if set_secret(domain, &contents).is_ok() {
                    let _ = fs::rename(&legacy_path, legacy_path.with_extension("json.migrated"));
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_domain_accepts_normal() {
        assert!(validate_domain("gog").is_ok());
        assert!(validate_domain("epic_legendary").is_ok());
        assert!(validate_domain("xbox-game-pass").is_ok());
        assert!(validate_domain("cloud_save_key_abc-123-def").is_ok());
        assert!(validate_domain("cloud_save_key:abc-123-def").is_ok());
    }

    #[test]
    fn validate_domain_rejects_empty() {
        assert!(validate_domain("").is_err());
    }

    #[test]
    fn validate_domain_rejects_too_long() {
        let s = "a".repeat(65);
        assert!(validate_domain(&s).is_err());
    }

    #[test]
    fn validate_domain_rejects_invalid_chars() {
        assert!(validate_domain("a b").is_err());
        assert!(validate_domain("a/b").is_err());
        assert!(validate_domain("a.b").is_err());
        assert!(validate_domain("a\\b").is_err());
    }

    #[test]
    fn fallback_map_roundtrip() {
        let mut map = FallbackMap::default();
        map.entries
            .insert("test_domain".to_string(), "test_value".to_string());
        let json = serde_json::to_string(&map).unwrap();
        let parsed: FallbackMap = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.entries.get("test_domain").unwrap(), "test_value");
    }
}
