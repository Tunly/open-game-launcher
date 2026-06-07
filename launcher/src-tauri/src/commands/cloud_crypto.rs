use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};
use rand::rngs::SysRng;
use rand::TryRng;
use serde::{Deserialize, Serialize};

const KEY_VERSION: u8 = 1;
const NONCE_SIZE: usize = 12;
const SALT_SIZE: usize = 16;
const KEY_SIZE: usize = 32;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SaveFileMeta {
    pub version: u8,
    pub nonce_hex: String,
    pub salt_hex: String,
    pub original_size: u64,
    pub original_sha256: String,
    pub encrypted_sha256: String,
    pub created_at: String,
}

/// Gets or creates a per-user 256-bit master key stored in OS keychain.
/// Returns the raw 32-byte key.
pub fn get_or_create_user_keyring_key(user_id: &str) -> Result<Vec<u8>, String> {
    let domain = format!("cloud_save_key:{}", sanitize_user_id(user_id));
    // Try keychain first
    if let Ok(Some(key_hex)) = super::secure_store::get_secret(&domain) {
        if let Ok(key) = hex_decode(&key_hex) {
            if key.len() == KEY_SIZE {
                return Ok(key);
            }
        }
    }
    // Generate new random key
    let mut key = [0u8; KEY_SIZE];
    SysRng.try_fill_bytes(&mut key).expect("OS RNG failed");
    let key_hex = hex_encode(&key);
    super::secure_store::set_secret(&domain, &key_hex)?;
    Ok(key.to_vec())
}

/// Encrypts a file with AES-256-GCM, deriving a per-file key from
/// the master key + random salt via Argon2id.
pub fn encrypt_file(
    plaintext: &[u8],
    master_key: &[u8],
) -> Result<(Vec<u8>, SaveFileMeta), String> {
    if master_key.len() != KEY_SIZE {
        return Err(format!(
            "Master key must be {} bytes, got {}",
            KEY_SIZE,
            master_key.len()
        ));
    }
    let mut salt = [0u8; SALT_SIZE];
    SysRng.try_fill_bytes(&mut salt).expect("OS RNG failed");
    let derived_key = derive_key(master_key, &salt)?;
    let cipher = Aes256Gcm::new_from_slice(&derived_key).map_err(|e| format!("Key init: {e}"))?;
    let mut nonce_bytes = [0u8; NONCE_SIZE];
    SysRng.try_fill_bytes(&mut nonce_bytes).expect("OS RNG failed");
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| format!("Encrypt: {e}"))?;
    let original_sha256 = sha256_hex(plaintext);
    let encrypted_sha256 = sha256_hex(&ciphertext);
    let meta = SaveFileMeta {
        version: KEY_VERSION,
        nonce_hex: hex_encode(&nonce_bytes),
        salt_hex: hex_encode(&salt),
        original_size: plaintext.len() as u64,
        original_sha256,
        encrypted_sha256,
        created_at: chrono_now(),
    };
    Ok((ciphertext, meta))
}

/// Decrypts a file previously encrypted with `encrypt_file`.
pub fn decrypt_file(
    ciphertext: &[u8],
    master_key: &[u8],
    meta: &SaveFileMeta,
) -> Result<Vec<u8>, String> {
    if meta.version != KEY_VERSION {
        return Err(format!("Unsupported key version: {}", meta.version));
    }
    if master_key.len() != KEY_SIZE {
        return Err(format!(
            "Master key must be {} bytes, got {}",
            KEY_SIZE,
            master_key.len()
        ));
    }
    let salt = hex_decode(&meta.salt_hex)?;
    let nonce_bytes = hex_decode(&meta.nonce_hex)?;
    if nonce_bytes.len() != NONCE_SIZE {
        return Err(format!("Invalid nonce size: {}", nonce_bytes.len()));
    }
    let derived_key = derive_key(master_key, &salt)?;
    let cipher = Aes256Gcm::new_from_slice(&derived_key).map_err(|e| format!("Key init: {e}"))?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("Decrypt: {e}"))
}

fn derive_key(master_key: &[u8], salt: &[u8]) -> Result<Vec<u8>, String> {
    let params = Params::default();
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut output = [0u8; KEY_SIZE];
    argon
        .hash_password_into(master_key, salt, &mut output)
        .map_err(|e| format!("Argon2: {e}"))?;
    Ok(output.to_vec())
}

fn sha256_hex(data: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex_encode(&hasher.finalize())
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn hex_decode(s: &str) -> Result<Vec<u8>, String> {
    if s.len() % 2 != 0 {
        return Err("Hex string has odd length".to_string());
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).map_err(|e| format!("Hex decode error: {e}")))
        .collect()
}

fn sanitize_user_id(id: &str) -> String {
    id.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .take(64)
        .collect()
}

fn keychain_domain(user_id: &str) -> String {
    format!("cloud_save_key:{}", sanitize_user_id(user_id))
}

#[tauri::command]
pub fn is_cloud_key_present(user_id: String) -> bool {
    let domain = keychain_domain(&user_id);
    match super::secure_store::get_secret(&domain) {
        Ok(Some(key_hex)) => hex_decode(&key_hex)
            .map(|bytes| bytes.len() == KEY_SIZE)
            .unwrap_or(false),
        _ => false,
    }
}

#[tauri::command]
pub fn generate_cloud_key(user_id: String) -> Result<String, String> {
    let domain = keychain_domain(&user_id);
    let mut key = [0u8; KEY_SIZE];
    SysRng.try_fill_bytes(&mut key).expect("OS RNG failed");
    let key_hex = hex_encode(&key);
    super::secure_store::set_secret(&domain, &key_hex)?;
    Ok(key_hex)
}

#[tauri::command]
pub fn rotate_cloud_key(user_id: String) -> Result<String, String> {
    let domain = keychain_domain(&user_id);
    let mut key = [0u8; KEY_SIZE];
    SysRng.try_fill_bytes(&mut key).expect("OS RNG failed");
    let key_hex = hex_encode(&key);
    super::secure_store::set_secret(&domain, &key_hex)?;
    Ok(key_hex)
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{}Z", secs)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_encrypt_decrypt() {
        let key = vec![42u8; KEY_SIZE];
        let plaintext = b"Hello, this is a game save file!";
        let (ciphertext, meta) = encrypt_file(plaintext, &key).unwrap();
        assert_ne!(&ciphertext[..], &plaintext[..]);
        let decrypted = decrypt_file(&ciphertext, &key, &meta).unwrap();
        assert_eq!(&decrypted[..], &plaintext[..]);
    }

    #[test]
    fn decrypt_wrong_key_fails() {
        let key1 = vec![1u8; KEY_SIZE];
        let key2 = vec![2u8; KEY_SIZE];
        let plaintext = b"secret";
        let (ciphertext, meta) = encrypt_file(plaintext, &key1).unwrap();
        let result = decrypt_file(&ciphertext, &key2, &meta);
        assert!(result.is_err());
    }

    #[test]
    fn hex_roundtrip() {
        let bytes = vec![0xde, 0xad, 0xbe, 0xef];
        let hex = hex_encode(&bytes);
        assert_eq!(hex, "deadbeef");
        let decoded = hex_decode(&hex).unwrap();
        assert_eq!(decoded, bytes);
    }

    #[test]
    fn encrypt_produces_different_ciphertext_each_time() {
        let key = vec![7u8; KEY_SIZE];
        let plaintext = b"same plaintext";
        let (c1, m1) = encrypt_file(plaintext, &key).unwrap();
        let (c2, m2) = encrypt_file(plaintext, &key).unwrap();
        // Different salt + nonce → different ciphertext
        assert_ne!(c1, c2);
        assert_ne!(m1.salt_hex, m2.salt_hex);
        assert_ne!(m1.nonce_hex, m2.nonce_hex);
    }

    #[test]
    fn sha256_known_value() {
        // SHA-256 of "abc"
        let hash = sha256_hex(b"abc");
        assert_eq!(
            hash,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}
