# S6 — Cloud-Save Ende-zu-Ende-Verschlüsselung

> **For Hermes:** Sub-Plan aus `00-master-plan-missing-features.md`. Der Plan (Section 3.4) verspricht "Ende-zu-Ende-Verschlüsselung" für Cloud-Saves, aber die existierende Implementation in `0003_library_cloud_sync.sql` + `games/sync.rs` (27 kB) speichert Saves **unverschlüsselt** im Supabase Storage Bucket `game-saves`. Wir verschlüsseln mit AES-256-GCM, der Schlüssel wird pro User aus dem OS-Keychain (S7) abgeleitet.

**Goal:** Cloud-Saves werden lokal verschlüsselt, dann in den Storage hochgeladen. Supabase kann die Inhalte nicht lesen. Schlüssel liegt verschlüsselt im OS-Keychain.

**Architecture:** AES-256-GCM mit PBKDF2-Schlüsselableitung (User-Passphrase + Salt ODER zufälliger Master-Key im Keychain). Speicherort: `${user_id}/${game_id}/${save_set_id}/${filename}.enc` mit `.meta.json` (IV, Salt, Algorithmus-Version).

**Tech Stack:** Rust `aes-gcm = "0.10"` + `argon2 = "0.5"` + bestehendes S7-Keychain.

---

## Phase 0: Crates

### Task 1: Crypto-Crates zu Cargo.toml

**Files:**
- Modify: `launcher/src-tauri/Cargo.toml`

```toml
aes-gcm = "0.10"
argon2 = "0.5"
rand = "0.8"
sha2 = "0.10"  # bereits vorhanden
```

**Step 2:** `cargo check`. Build erfolgreich.

**Step 3:** Commit:

```bash
git add launcher/src-tauri/Cargo.toml launcher/src-tauri/Cargo.lock
git commit -m "feat(security): add aes-gcm, argon2, rand crypto crates"
```

---

## Phase 1: Crypto-Modul

### Task 2: Erstelle `cloud_crypto.rs`

**Files:**
- Create: `launcher/src-tauri/src/commands/cloud_crypto.rs`
- Modify: `launcher/src-tauri/src/commands/mod.rs`

```rust
use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use argon2::{Argon2, PasswordHasher, SaltString};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::path::Path;

const KEY_VERSION: u8 = 1;
const NONCE_SIZE: usize = 12;
const SALT_SIZE: usize = 16;

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveFileMeta {
    pub version: u8,
    pub nonce_hex: String,
    pub salt_hex: String,
    pub original_size: u64,
    pub original_sha256: String,
    pub encrypted_sha256: String,
    pub created_at: String,
}

pub fn get_or_create_user_keyring_key(user_id: &str) -> Result<Vec<u8>, String> {
    let domain = format!("cloud_save_key:{}", sanitize_user_id(user_id));
    // Try keychain first
    if let Ok(Some(key_hex)) = super::secure_store::get_secret(&domain) {
        return hex_decode(&key_hex);
    }
    // Generate new random key
    let mut key = [0u8; 32];
    OsRng.fill_bytes(&mut key);
    let key_hex = hex_encode(&key);
    super::secure_store::set_secret(&domain, &key_hex)?;
    Ok(key.to_vec())
}

pub fn encrypt_file(
    plaintext: &[u8],
    master_key: &[u8],
) -> Result<(Vec<u8>, SaveFileMeta), String> {
    if master_key.len() != 32 {
        return Err("Master key must be 32 bytes".to_string());
    }
    let mut salt = [0u8; SALT_SIZE];
    OsRng.fill_bytes(&mut salt);
    let derived_key = derive_key(master_key, &salt)?;
    let cipher = Aes256Gcm::new(Key::from_slice(&derived_key));
    let mut nonce_bytes = [0u8; NONCE_SIZE];
    OsRng.fill_bytes(&mut nonce_bytes);
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

pub fn decrypt_file(
    ciphertext: &[u8],
    master_key: &[u8],
    meta: &SaveFileMeta,
) -> Result<Vec<u8>, String> {
    if meta.version != KEY_VERSION {
        return Err(format!("Unsupported key version: {}", meta.version));
    }
    let salt = hex_decode(&meta.salt_hex)?;
    let nonce_bytes = hex_decode(&meta.nonce_hex)?;
    let derived_key = derive_key(master_key, &salt)?;
    let cipher = Aes256Gcm::new(Key::from_slice(&derived_key));
    let nonce = Nonce::from_slice(&nonce_bytes);
    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("Decrypt: {e}"))
}

fn derive_key(master_key: &[u8], salt: &[u8]) -> Result<Vec<u8>, String> {
    use argon2::Algorithm;
    let argon = Argon2::new(Algorithm::Argon2id, argon2::Version::V0x13, argon2::Params::default());
    let mut output = [0u8; 32];
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
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).map_err(|e| format!("Hex: {e}")))
        .collect()
}

fn sanitize_user_id(id: &str) -> String {
    id.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .take(64)
        .collect()
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // ISO 8601 without external crate (use a basic format)
    format!("{}Z", secs)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_encrypt_decrypt() {
        let key = vec![42u8; 32];
        let plaintext = b"Hello, this is a game save file!";
        let (ciphertext, meta) = encrypt_file(plaintext, &key).unwrap();
        assert_ne!(&ciphertext[..], &plaintext[..]);
        let decrypted = decrypt_file(&ciphertext, &key, &meta).unwrap();
        assert_eq!(&decrypted[..], &plaintext[..]);
    }

    #[test]
    fn decrypt_wrong_key_fails() {
        let key1 = vec![1u8; 32];
        let key2 = vec![2u8; 32];
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
}
```

**Step 3:** `cargo test cloud_crypto`. Erwartet: 3 Tests grün.

**Step 4:** Commit:

```bash
git add launcher/src-tauri/src/commands/cloud_crypto.rs launcher/src-tauri/src/commands/mod.rs
git commit -m "feat(security): add AES-256-GCM cloud-save crypto module"
```

---

## Phase 2: Tauri-Commands anpassen

### Task 3: Tauri-Commands `upload_game_saves_to_cloud` und `download_game_saves_from_cloud` umstellen

**Files:**
- Modify: `launcher/src-tauri/src/commands/games/sync.rs`

**Step 1:** Suche `upload_game_saves_to_cloud` und `download_game_saves_from_cloud` Commands.

**Step 2:** Lese `user_id` aus AppHandle State (via `tauri::State` + `app.state::<crate::AuthState>()` o.ä.). Falls nicht vorhanden: ergänze via `app.path().app_config_dir()` und einer `current_user_id` Funktion.

**Step 3:** In `upload`: vor dem Upload jeden Save via `cloud_crypto::encrypt_file` verschlüsseln. Schreibe `${path}.enc` und `${path}.meta.json` in Storage.

**Step 4:** In `download`: lade `.enc` + `.meta.json`, entschlüssel via `cloud_crypto::decrypt_file`, schreibe als Klartext auf Disk.

**Step 5:** Build + manueller Test: Upload-Save, Logout, anderer User-Login, Download — der zweite User kann die Save nicht lesen (kein Key).

**Step 6:** Commit:

```bash
git add launcher/src-tauri/src/commands/games/sync.rs
git commit -m "feat(security): E2E-encrypt cloud saves with AES-256-GCM"
```

---

## Phase 3: Frontend-Hinweis

### Task 4: UI-Hinweis im SettingsPage

**Files:**
- Modify: `launcher/src/pages/SettingsPage.tsx`

**Step 1:** Füge eine Sektion "Cloud-Save Sicherheit" hinzu mit Text: "Deine Cloud-Saves sind mit AES-256-GCM verschlüsselt. Der Schlüssel liegt im OS-Keychain (Windows Credential Manager / macOS Keychain / Linux Secret Service) und ist mit deinem Account verknüpft. Open Game Launcher und Supabase können die Saves nicht lesen."

**Step 2:** Visuelle Verifikation in `pnpm tauri dev`. Sollte als Manga-Panel mit Teal-Akzent rendern.

**Step 3:** Commit:

```bash
git add launcher/src/pages/SettingsPage.tsx
git commit -m "feat(ui): add E2E encryption info to settings page"
```

---

## Done

- [ ] `aes-gcm`, `argon2`, `rand` Crates
- [ ] `cloud_crypto.rs` mit 3 Tests
- [ ] `upload_game_saves_to_cloud` und `download_game_saves_from_cloud` verschlüsseln
- [ ] SettingsPage zeigt E2E-Info
- [ ] `pnpm typecheck` / `pnpm lint` / `pnpm build` grün
- [ ] 4 Commits

## Nächste Pläne

Nach S6: **S1 (Cross-Platform-Gameplay / Smart-Join)** — Datei: `docs/plans/01-cross-play-and-smart-join.md`.
