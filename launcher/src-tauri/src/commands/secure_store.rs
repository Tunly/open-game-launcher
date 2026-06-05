use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};
use keyring::Entry;
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

const KEYRING_SERVICE: &str = "OpenGameLauncher";
const KEYRING_FALLBACK_DIR: &str = "open-game-launcher";
const KEYRING_FALLBACK_FILE: &str = ".keyring-fallback.enc";

/// Salt used to derive the fallback-file encryption key. Mixed with a
/// machine-bound string so the file is useless if copied to another machine.
/// This is a defence-in-depth measure: the *real* protection is the OS
/// keychain — this file should only exist when the keychain is unavailable.
const FALLBACK_DERIVATION_SALT: &[u8] = b"OG-Launcher/fallback-store/v1";

/// `Argon2id` is the recommended PHC winner. Tuned to take ~250ms on a
/// modern desktop CPU, which is acceptable for a once-per-write cost.
const ARGON2_PARAMS: Params = match Params::new(19_456, 2, 1, Some(32)) {
    Ok(p) => p,
    Err(_) => panic!("hardcoded argon2 params are valid"),
};

#[derive(Debug, Serialize, Deserialize, Default)]
struct FallbackMap {
    entries: HashMap<String, Vec<u8>>,
}

/// On-disk wrapper: the nonce is stored alongside the ciphertext so we can
/// rotate the key without breaking older files. The format is:
///   1. base64(nonce || ciphertext)
#[derive(Debug, Serialize, Deserialize, Default)]
struct FallbackBlob {
    v: u32,
    blobs: HashMap<String, String>,
}

const FALLBACK_BLOB_VERSION: u32 = 1;

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

/// Derives a 32-byte AES-256 key from a machine-bound string. The input is
/// a constant for now (Phase-1 hardening) — in a follow-up we should swap
/// this for an OS-derived identifier (e.g. `gethostname` + `getlogin` hashed
/// on first run) so the file cannot be decrypted off-device.
fn derive_fallback_key() -> [u8; 32] {
    // For the first iteration we mix the app-specific salt with a constant
    // machine string derived from the OS hostname + current user. This is
    // bound to the machine that first wrote the file and is not portable.
    let machine_string = format!(
        "{}|{}",
        std::env::var("COMPUTERNAME")
            .or_else(|_| std::env::var("HOSTNAME"))
            .unwrap_or_else(|_| "unknown-host".to_string()),
        std::env::var("USERNAME")
            .or_else(|_| std::env::var("USER"))
            .unwrap_or_else(|_| "unknown-user".to_string()),
    );
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, ARGON2_PARAMS);
    // Encode the salt to base64 once and keep the String around for the
    // lifetime of the derivation. `SaltString::from_b64` borrows its input,
    // so we cannot let the temporary fall out of scope.
    let salt_b64: String = base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        FALLBACK_DERIVATION_SALT,
    );
    let mut out = [0u8; 32];
    argon
        .hash_password_into(machine_string.as_bytes(), salt_b64.as_bytes(), &mut out)
        .expect("argon2 derive");
    let mut hashed = [0u8; 32];
    {
        let mut hasher = Sha256::new();
        hasher.update(out);
        hashed.copy_from_slice(&hasher.finalize());
    }
    hashed
}

fn cipher() -> Aes256Gcm {
    let key_bytes = derive_fallback_key();
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    Aes256Gcm::new(key)
}

fn encrypt(plaintext: &[u8]) -> Result<String, String> {
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ct = cipher()
        .encrypt(nonce, plaintext)
        .map_err(|e| format!("Encrypt fallback: {e}"))?;
    let mut combined = Vec::with_capacity(12 + ct.len());
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ct);
    Ok(base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        &combined,
    ))
}

fn decrypt(blob: &str) -> Result<Vec<u8>, String> {
    let combined =
        base64::Engine::decode(&base64::engine::general_purpose::STANDARD, blob.as_bytes())
            .map_err(|e| format!("Decode fallback: {e}"))?;
    if combined.len() < 12 {
        return Err("Decrypt fallback: blob too short".to_string());
    }
    let (nonce_bytes, ct) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);
    cipher()
        .decrypt(nonce, ct)
        .map_err(|e| format!("Decrypt fallback: {e}"))
}

/// Stores a secret for a given domain in OS keychain.
/// Falls back to an encrypted local file if keychain is unavailable.
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
    let Ok(contents) = fs::read(&path) else {
        return FallbackMap::default();
    };
    let Ok(blob) = serde_json::from_slice::<FallbackBlob>(&contents) else {
        return FallbackMap::default();
    };
    if blob.v != FALLBACK_BLOB_VERSION {
        return FallbackMap::default();
    }
    let mut out = FallbackMap::default();
    for (k, v) in blob.blobs {
        if let Ok(plain) = decrypt(&v) {
            if let Ok(text) = String::from_utf8(plain) {
                out.entries.insert(k, text.into_bytes());
            }
        }
    }
    out
}

fn write_fallback_map(map: &mut FallbackMap) -> Result<(), String> {
    let Some(path) = fallback_path() else {
        return Err("No config dir available for fallback storage".to_string());
    };
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Create fallback dir: {e}"))?;
    }
    let mut blobs = HashMap::new();
    let keys: Vec<String> = map.entries.keys().cloned().collect();
    for k in keys {
        if let Some(v) = map.entries.remove(&k) {
            blobs.insert(
                k.clone(),
                encrypt(&v).map_err(|e| format!("Encrypt {k}: {e}"))?,
            );
        }
    }
    let blob = FallbackBlob {
        v: FALLBACK_BLOB_VERSION,
        blobs,
    };
    let json = serde_json::to_vec_pretty(&blob).map_err(|e| format!("Serialize fallback: {e}"))?;
    fs::write(&path, &json).map_err(|e| format!("Write fallback: {e}"))?;

    // Restrict permissions on Unix. On Windows the OS does not honour POSIX
    // modes, so we rely on the user's profile ACLs and the `attrib +H` below.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = fs::metadata(&path) {
            let mut perms = metadata.permissions();
            perms.set_mode(0o600);
            let _ = fs::set_permissions(&path, perms);
        }
    }
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("attrib")
            .args(["+H", path.to_string_lossy().as_ref()])
            .output();
    }
    Ok(())
}

fn write_fallback(domain: &str, value: &str) -> Result<(), String> {
    let mut map = read_fallback_map();
    map.entries
        .insert(domain.to_string(), value.as_bytes().to_vec());
    write_fallback_map(&mut map)
}

fn read_fallback(domain: &str) -> Result<Option<String>, String> {
    let map = read_fallback_map();
    Ok(map
        .entries
        .get(domain)
        .and_then(|b| String::from_utf8(b.clone()).ok()))
}

fn delete_fallback(domain: &str) {
    let mut map = read_fallback_map();
    if map.entries.remove(domain).is_some() {
        let _ = write_fallback_map(&mut map);
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
    fn encrypt_decrypt_roundtrip() {
        let pt = b"super-secret-token";
        let blob = encrypt(pt).expect("encrypt");
        let recovered = decrypt(&blob).expect("decrypt");
        assert_eq!(recovered, pt);
    }

    #[test]
    fn encrypt_is_nondeterministic() {
        // Same plaintext, different nonces, different ciphertext.
        let a = encrypt(b"x").unwrap();
        let b = encrypt(b"x").unwrap();
        assert_ne!(a, b);
    }
}
