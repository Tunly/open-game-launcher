use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key};
use argon2::{Algorithm, Argon2, Params, Version};
use keyring::Entry;
use rand::{rngs::SysRng, TryRng};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

const KEYRING_SERVICE: &str = "OpenGameLauncher";
const KEYRING_FALLBACK_DIR: &str = "open-game-launcher";
const KEYRING_FALLBACK_FILE: &str = ".keyring-fallback.enc";
const CREDENTIAL_STORE_UNAVAILABLE: &str = "The OS credential store is unavailable.";

/// Salt used to read and rewrite the encrypted fallback created by older app
/// versions. New credentials are never written to this application-managed
/// store; it remains only for one-time migration into the OS keychain.
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
    #[cfg(test)]
    if let Some(dir) = std::env::var_os("OGL_TEST_KEYRING_FALLBACK_DIR") {
        return Some(PathBuf::from(dir).join(KEYRING_FALLBACK_FILE));
    }
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
    let key: Key<Aes256Gcm> = key_bytes.into();
    Aes256Gcm::new(&key)
}

fn encrypt(plaintext: &[u8]) -> Result<String, String> {
    let mut nonce_bytes = [0u8; 12];
    SysRng
        .try_fill_bytes(&mut nonce_bytes)
        .expect("OS RNG failed");
    let nonce = nonce_bytes.into();
    let ct = cipher()
        .encrypt(&nonce, plaintext)
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
    let nonce_bytes: [u8; 12] = nonce_bytes
        .try_into()
        .map_err(|_| "Decrypt fallback: invalid nonce length".to_string())?;
    let nonce = nonce_bytes.into();
    cipher()
        .decrypt(&nonce, ct)
        .map_err(|e| format!("Decrypt fallback: {e}"))
}

/// Stores a high-sensitivity credential in the OS keychain only. This never
/// writes an application-managed credential file.
pub fn set_secret_keychain_only(domain: &str, value: &str) -> Result<(), String> {
    set_secret_keychain_only_with(domain, value, |secret| {
        let keyring_entry = entry(domain).map_err(|_| CREDENTIAL_STORE_UNAVAILABLE.to_string())?;
        keyring_entry
            .set_password(secret)
            .map_err(|_| CREDENTIAL_STORE_UNAVAILABLE.to_string())
    })
}

fn set_secret_keychain_only_with<F>(domain: &str, value: &str, store: F) -> Result<(), String>
where
    F: FnOnce(&str) -> Result<(), String>,
{
    validate_domain(domain)?;
    // A new credential supersedes any legacy fallback value. Purge it even if
    // the new keychain write fails so a stale file credential can never be
    // resurrected later.
    delete_fallback(domain);
    store(value)
}

/// Reads a high-sensitivity credential exclusively from the OS keychain.
pub fn get_secret_keychain_only(domain: &str) -> Result<Option<String>, String> {
    validate_domain(domain)?;
    match entry(domain) {
        Ok(entry) => match entry.get_password() {
            Ok(value) => {
                // A verified keychain copy makes any historical file copy
                // redundant and safe to remove.
                delete_fallback(domain);
                Ok(Some(value))
            }
            Err(keyring::Error::NoEntry) => migrate_fallback_to_keychain(domain, |secret| {
                entry
                    .set_password(secret)
                    .map_err(|_| CREDENTIAL_STORE_UNAVAILABLE.to_string())
            }),
            Err(_) => Err(CREDENTIAL_STORE_UNAVAILABLE.to_string()),
        },
        Err(_) => Err(CREDENTIAL_STORE_UNAVAILABLE.to_string()),
    }
}

fn migrate_fallback_to_keychain<F>(domain: &str, store: F) -> Result<Option<String>, String>
where
    F: FnOnce(&str) -> Result<(), String>,
{
    let Some(value) = read_fallback(domain)? else {
        return Ok(None);
    };
    // Delete only after the OS credential store confirms the write. A failed
    // migration remains recoverable but is never returned to production code.
    store(&value)?;
    delete_fallback(domain);
    Ok(Some(value))
}

/// Deletes a keychain-only credential and purges any historical fallback copy.
pub fn delete_secret_keychain_only(domain: &str) -> Result<(), String> {
    validate_domain(domain)?;
    let result = match entry(domain) {
        Ok(keyring_entry) => match keyring_entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(CREDENTIAL_STORE_UNAVAILABLE.to_string()),
        },
        Err(_) => Err(CREDENTIAL_STORE_UNAVAILABLE.to_string()),
    };
    delete_fallback(domain);
    result
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
    if map.entries.is_empty() {
        if path.exists() {
            fs::remove_file(&path).map_err(|e| format!("Remove empty fallback: {e}"))?;
        }
        return Ok(());
    }
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

#[cfg(test)]
fn write_fallback(domain: &str, value: &str) -> Result<(), String> {
    validate_domain(domain)?;
    let mut map = read_fallback_map();
    map.entries
        .insert(domain.to_string(), value.as_bytes().to_vec());
    write_fallback_map(&mut map)
}

fn read_fallback(domain: &str) -> Result<Option<String>, String> {
    validate_domain(domain)?;
    let map = read_fallback_map();
    Ok(map
        .entries
        .get(domain)
        .and_then(|b| String::from_utf8(b.clone()).ok()))
}

fn delete_fallback(domain: &str) {
    if validate_domain(domain).is_err() {
        return;
    }
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

    // Every entry in this historical file was supplied to a secret-storage
    // API. Migrate all valid domains, including dynamically named broadcast
    // stream keys, so no legacy credential is stranded on disk.
    let fallback_domains: Vec<String> = read_fallback_map()
        .entries
        .into_keys()
        .filter(|domain| validate_domain(domain).is_ok())
        .collect();
    for domain in fallback_domains {
        let _ = get_secret_keychain_only(&domain);
    }

    // Only actual historical credential files belong here. In particular,
    // ea-legacy-offers.json and steam scraper data are catalog/cache data, not
    // authentication tokens.
    const LEGACY_TOKEN_FILES: &[(&str, &str)] = &[
        ("gog", "gog_auth.json"),
        ("xbox", "xbox_token.json"),
        ("epic", "epic_token.json"),
        ("ubisoft", "ubisoft_token.json"),
        ("battlenet", "battlenet_token.json"),
    ];

    for (domain, filename) in LEGACY_TOKEN_FILES {
        let legacy_path = launcher_dir.join(filename);
        let migrated_path = legacy_path.with_extension("json.migrated");
        if get_secret_keychain_only(domain).ok().flatten().is_some() {
            let _ = fs::remove_file(&legacy_path);
            let _ = fs::remove_file(&migrated_path);
            continue;
        }

        let source_path = if legacy_path.exists() {
            Some(&legacy_path)
        } else if migrated_path.exists() {
            Some(&migrated_path)
        } else {
            None
        };
        if let Some(source_path) = source_path {
            let Ok(contents) = fs::read_to_string(source_path) else {
                continue;
            };
            let trimmed = contents.trim();
            if !trimmed.is_empty() && set_secret_keychain_only(domain, &contents).is_ok() {
                let _ = fs::remove_file(&legacy_path);
                let _ = fs::remove_file(&migrated_path);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsString;
    use std::sync::{Mutex, MutexGuard, OnceLock};
    use std::time::{SystemTime, UNIX_EPOCH};

    static FALLBACK_TEST_ENV_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

    struct FallbackTestGuard {
        _lock: MutexGuard<'static, ()>,
        old_override: Option<OsString>,
        root: PathBuf,
    }

    impl Drop for FallbackTestGuard {
        fn drop(&mut self) {
            if let Some(value) = self.old_override.take() {
                std::env::set_var("OGL_TEST_KEYRING_FALLBACK_DIR", value);
            } else {
                std::env::remove_var("OGL_TEST_KEYRING_FALLBACK_DIR");
            }
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    fn fallback_test_guard(name: &str) -> FallbackTestGuard {
        let lock = FALLBACK_TEST_ENV_LOCK
            .get_or_init(|| Mutex::new(()))
            .lock()
            .expect("fallback test env lock");
        let old_override = std::env::var_os("OGL_TEST_KEYRING_FALLBACK_DIR");
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "ogl-secure-store-{name}-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&root).expect("create fallback test root");
        std::env::set_var("OGL_TEST_KEYRING_FALLBACK_DIR", &root);
        FallbackTestGuard {
            _lock: lock,
            old_override,
            root,
        }
    }

    fn fallback_file_path() -> PathBuf {
        fallback_path().expect("test fallback path")
    }

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

    #[test]
    fn fallback_ignores_corrupt_json_and_old_versions() {
        let _guard = fallback_test_guard("corrupt-old");
        let path = fallback_file_path();
        fs::create_dir_all(path.parent().unwrap()).unwrap();

        fs::write(&path, b"not-json").unwrap();
        assert!(read_fallback_map().entries.is_empty());

        let mut blobs = HashMap::new();
        blobs.insert("gog".to_string(), encrypt(b"legacy-secret").unwrap());
        fs::write(
            &path,
            serde_json::to_vec(&FallbackBlob { v: 0, blobs }).unwrap(),
        )
        .unwrap();
        assert!(read_fallback_map().entries.is_empty());
    }

    #[test]
    fn fallback_writes_ciphertext_without_plaintext() {
        let _guard = fallback_test_guard("ciphertext");

        write_fallback("epic", "super-secret-token").unwrap();

        let raw = fs::read_to_string(fallback_file_path()).unwrap();
        assert!(raw.contains("\"epic\""));
        assert!(!raw.contains("super-secret-token"));
        assert_eq!(
            read_fallback("epic").unwrap(),
            Some("super-secret-token".to_string())
        );
    }

    #[test]
    fn fallback_delete_rewrites_without_removed_domain() {
        let _guard = fallback_test_guard("delete");

        write_fallback("gog", "gog-secret").unwrap();
        write_fallback("steam", "steam-secret").unwrap();
        delete_fallback("gog");

        assert_eq!(read_fallback("gog").unwrap(), None);
        assert_eq!(
            read_fallback("steam").unwrap(),
            Some("steam-secret".to_string())
        );
        let raw = fs::read_to_string(fallback_file_path()).unwrap();
        assert!(!raw.contains("\"gog\""));
        assert!(!raw.contains("gog-secret"));
        assert!(raw.contains("\"steam\""));
        assert!(!raw.contains("steam-secret"));
    }

    #[test]
    fn invalid_domains_do_not_create_fallback_file() {
        let _guard = fallback_test_guard("invalid-domain");

        assert!(write_fallback("bad/domain", "should-not-write").is_err());
        assert!(read_fallback("bad/domain").is_err());
        delete_fallback("bad/domain");

        assert!(!fallback_file_path().exists());
    }

    #[test]
    fn keychain_only_write_failure_purges_stale_fallback() {
        let _guard = fallback_test_guard("keychain-write-failure");
        write_fallback("gog", "stale-token").unwrap();

        let error = set_secret_keychain_only_with("gog", "new-token", |_| {
            Err(CREDENTIAL_STORE_UNAVAILABLE.to_string())
        })
        .expect_err("unavailable keychain must fail closed");

        assert_eq!(error, CREDENTIAL_STORE_UNAVAILABLE);
        assert_eq!(read_fallback("gog").unwrap(), None);
        assert!(!fallback_file_path().exists());
    }

    #[test]
    fn fallback_migration_deletes_source_only_after_confirmed_write() {
        let _guard = fallback_test_guard("migration-success");
        write_fallback("xbox", "legacy-refresh-token").unwrap();
        let mut stored = None;

        let migrated = migrate_fallback_to_keychain("xbox", |secret| {
            stored = Some(secret.to_string());
            Ok(())
        })
        .unwrap();

        assert_eq!(stored.as_deref(), Some("legacy-refresh-token"));
        assert_eq!(migrated.as_deref(), Some("legacy-refresh-token"));
        assert_eq!(read_fallback("xbox").unwrap(), None);
        assert!(!fallback_file_path().exists());
    }

    #[test]
    fn fallback_migration_failure_keeps_source_but_returns_no_secret() {
        let _guard = fallback_test_guard("migration-failure");
        write_fallback("ea", "legacy-access-token").unwrap();

        let migrated =
            migrate_fallback_to_keychain("ea", |_| Err(CREDENTIAL_STORE_UNAVAILABLE.to_string()));

        assert_eq!(migrated.unwrap_err(), CREDENTIAL_STORE_UNAVAILABLE);
        assert_eq!(
            read_fallback("ea").unwrap().as_deref(),
            Some("legacy-access-token")
        );
    }
}
