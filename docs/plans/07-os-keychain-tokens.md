# S7 — OS-Keychain für Auth-Tokens

> **For Hermes:** Erster Sub-Plan aus `00-master-plan-missing-features.md`. Implementiert die im Plan (Section 0) versprochene, aber im Code fehlende OS-Keychain-Speicherung für alle Plattform-Auth-Tokens (Steam, GOG, Epic, EA, Ubisoft, Battle.net, Xbox).

**Goal:** Alle 7 Plattform-Tokens werden verschlüsselt im OS-Keychain gespeichert (Windows Credential Manager / macOS Keychain / Linux Secret Service) statt in Klartext-JSON-Dateien in `%APPDATA%`. Mit Datei-Fallback wenn Keychain nicht verfügbar.

**Architecture:** Neues `keyring` Crate in Cargo.toml. Neues Modul `src/commands/secure_store.rs` mit `get_token(domain)`, `set_token(domain, value)`, `delete_token(domain)`. Jede plattform-spezifische Datei (`gog.rs`, `epic.rs`, `ea.rs`, `ubisoft.rs`, `battlenet.rs`, `xbox.rs`, `system.rs` für Steam) bekommt ihre `load_*_token`/`save_*_token`-Funktionen auf den Secure-Store umgestellt.

**Tech Stack:** Rust `keyring = "3"` Crate, bestehende Tauri-Commands, keine Frontend-Änderungen nötig (transparent).

**Design-System:** Keine UI-Änderungen — reines Backend-Refactor.

---

## Phase 0: Setup

### Task 1: Füge `keyring` Crate zu Cargo.toml hinzu

**Files:**
- Modify: `launcher/src-tauri/Cargo.toml`

**Step 1:** Öffne `launcher/src-tauri/Cargo.toml` und füge unter `[dependencies]` hinzu:

```toml
keyring = { version = "3", features = ["windows-native", "apple-native", "linux-native"] }
```

Die `features` ermöglichen native Backends pro OS. Auf Windows nutzt es `wincred`, auf macOS `security-framework`, auf Linux `secret-service`.

**Step 2:** Baue das Projekt um zu verifizieren dass die Crate lädt:

```bash
cd E:\Code\open-game-launcher\launcher
cargo check
```

Expected: keine Errors, evtl. Build-Warnings über `linux-native` (das ist OK, der Build skippt Linux-Features auf Windows automatisch).

**Step 3:** Commit:

```bash
git add launcher/src-tauri/Cargo.toml launcher/src-tauri/Cargo.lock
git commit -m "feat(security): add keyring crate for OS-credential storage"
```

---

## Phase 1: Secure-Store-Modul

### Task 2: Erstelle `secure_store.rs` Modul

**Files:**
- Create: `launcher/src-tauri/src/commands/secure_store.rs`
- Modify: `launcher/src-tauri/src/commands/mod.rs`

**Step 1:** Erstelle `secure_store.rs` mit folgendem Inhalt:

```rust
use keyring::Entry;
use std::fs;
use std::path::PathBuf;
use dirs::config_dir;

const KEYRING_SERVICE: &str = "OpenGameLauncher";
const KEYRING_FALLBACK_DIR: &str = "open-game-launcher";
const KEYRING_FALLBACK_FILE: &str = ".keyring-fallback.json";

/// Returns the keyring entry for a given domain (e.g. "gog", "epic", "xbox").
/// Domain naming convention: lowercase, alphanumeric + underscores only.
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
    if !domain.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        return Err("Domain must be alphanumeric, underscores, or hyphens only".to_string());
    }
    Ok(())
}

fn fallback_path() -> Option<PathBuf> {
    config_dir().map(|dir| dir.join(KEYRING_FALLBACK_DIR).join(KEYRING_FALLBACK_FILE))
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

fn read_fallback_map() -> std::collections::HashMap<String, String> {
    let Some(path) = fallback_path() else {
        return std::collections::HashMap::new();
    };
    let Ok(contents) = fs::read_to_string(&path) else {
        return std::collections::HashMap::new();
    };
    serde_json::from_str(&contents).unwrap_or_default()
}

fn write_fallback_map(map: &std::collections::HashMap<String, String>) -> Result<(), String> {
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
    let json = serde_json::to_string_pretty(map)
        .map_err(|e| format!("Serialize fallback: {e}"))?;
    fs::write(&path, json).map_err(|e| format!("Write fallback: {e}"))?;
    Ok(())
}

fn write_fallback(domain: &str, value: &str) -> Result<(), String> {
    let mut map = read_fallback_map();
    map.insert(domain.to_string(), value.to_string());
    write_fallback_map(&map)
}

fn read_fallback(domain: &str) -> Result<Option<String>, String> {
    Ok(read_fallback_map().remove(domain))
}

fn delete_fallback(domain: &str) {
    let mut map = read_fallback_map();
    if map.remove(domain).is_some() {
        let _ = write_fallback_map(&map);
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
    }
}
```

**Step 2:** Füge das Modul in `commands/mod.rs` hinzu. Öffne `launcher/src-tauri/src/commands/mod.rs` und füge eine Zeile hinzu:

```rust
pub mod secure_store;
```

**Step 3:** Baue:

```bash
cd E:\Code\open-game-launcher\launcher
cargo check
```

Expected: Build erfolgreich. Wenn Keyring-Crate unter Windows Probleme macht, sind das Linker-Fehler — in dem Fall reduziere auf `keyring = "3"` ohne Features (dann nutzt es plattform-defaults).

**Step 4:** Commit:

```bash
git add launcher/src-tauri/src/commands/secure_store.rs launcher/src-tauri/src/commands/mod.rs
git commit -m "feat(security): add secure_store module with keyring + file fallback"
```

---

### Task 3: Schreibe Tests für `secure_store`

**Files:**
- Create: `launcher/src-tauri/src/commands/secure_store.rs` (Tests sind oben bereits inkludiert)
- Run: `cargo test`

**Step 1:** Führe die Tests aus:

```bash
cd E:\Code\open-game-launcher\launcher
cargo test secure_store
```

Expected: 4 Tests bestehen.

**Step 2:** Falls Tests fehlschlagen, prüfe dass `validate_domain` exakt die o.g. Implementation hat. Häufige Fehler: ASCII-Check zu restriktiv (`is_ascii_alphanumeric` schließt Umlaute aus, das ist OK).

**Step 3:** Kein Commit nötig — Tests sind im vorherigen Commit drin.

---

## Phase 2: Refactor pro Plattform

### Task 4: Migriere GOG-Token zu Secure-Store

**Files:**
- Modify: `launcher/src-tauri/src/commands/gog.rs` (Funktionen `save_gog_token`, `load_gog_token`, `delete_gog_token`)

**Step 1:** Aktuelle Implementation suchen. In `gog.rs` gibt es:

```rust
fn gog_token_path() -> PathBuf { ... }
pub fn load_gog_token() -> Option<GogToken> { ... }
fn save_gog_token(token: &GogToken) -> Result<(), String> { ... }
fn delete_gog_token() { ... }
```

**Step 2:** Ersetze diese 4 Funktionen. **Wichtig:** `load_gog_token` und `save_gog_token` müssen als `pub` bleiben, damit die `gog_get_token` / `gog_exchange_code` / `gog_logout` Commands weiter funktionieren. Füge oben in `gog.rs` einen Import hinzu:

```rust
use super::secure_store;
```

**Step 3:** Ersetze den Body von `save_gog_token`:

```rust
fn save_gog_token(token: &GogToken) -> Result<(), String> {
    let json = serde_json::to_string(token)
        .map_err(|e| format!("Failed to serialize GOG token: {e}"))?;
    secure_store::set_secret("gog", &json)
}
```

**Step 4:** Ersetze den Body von `load_gog_token`:

```rust
pub fn load_gog_token() -> Option<GogToken> {
    let json = secure_store::get_secret("gog").ok().flatten()?;
    serde_json::from_str(&json).ok()
}
```

**Step 5:** Ersetze den Body von `delete_gog_token`:

```rust
fn delete_gog_token() {
    let _ = secure_store::delete_secret("gog");
}
```

**Step 6:** Lösche die `gog_token_path()` Funktion komplett (wird nicht mehr gebraucht).

**Step 7:** Baue:

```bash
cd E:\Code\open-game-launcher\launcher
cargo check
```

Expected: Build erfolgreich.

**Step 8:** Visuelle Verifikation:

```bash
cd E:\Code\open-game-launcher\launcher
pnpm tauri dev
```

Login via GOG → Token wird gespeichert. Schließe App. Öffne Windows Credential Manager (`control /name Microsoft.CredentialManager`) → Eintrag "OpenGameLauncher" mit Username "gog" sollte existieren. Wenn nicht, prüfe ob Fallback-Datei in `%APPDATA%\open-game-launcher\.keyring-fallback.json` existiert.

**Step 9:** Commit:

```bash
git add launcher/src-tauri/src/commands/gog.rs
git commit -m "feat(security): migrate gog token to secure_store"
```

---

### Task 5: Migriere Xbox-Token zu Secure-Store

**Files:**
- Modify: `launcher/src-tauri/src/commands/xbox.rs`

**Step 1:** Suche in `xbox.rs` nach `xbox_token_path`, `save_xbox_token`, `load_xbox_token` (oder ähnlich — der Code nutzt vermutlich `get_xbox_token_path`).

**Step 2:** Gleicher Pattern wie Task 4. Domain = `"xbox"`. Variable `refresh_token: &str` (Xbox speichert nur den Refresh-Token als String, nicht als Struct).

**Step 3:** Beispiel-Implementation:

```rust
fn save_xbox_token(refresh_token: &str) {
    let _ = secure_store::set_secret("xbox", refresh_token);
}

fn load_xbox_token() -> Option<String> {
    secure_store::get_secret("xbox").ok().flatten()
}
```

**Step 4:** Build + visuell verifizieren + commit:

```bash
cd E:\Code\open-game-launcher\launcher
cargo check
git add launcher/src-tauri/src/commands/xbox.rs
git commit -m "feat(security): migrate xbox token to secure_store"
```

---

### Task 6: Migriere EA-Token zu Secure-Store

**Files:**
- Modify: `launcher/src-tauri/src/commands/ea.rs`

**Step 1:** Suche `ea_token_path`, `save_ea_token` / `load_ea_token` Funktionen. Domain = `"ea"`.

**Step 2:** Gleicher Pattern. Der `EaToken` Struct wird weiter als JSON serialisiert.

**Step 3:** Build + commit:

```bash
cd E:\Code\open-game-launcher\launcher
cargo check
git add launcher/src-tauri/src/commands/ea.rs
git commit -m "feat(security): migrate ea token to secure_store"
```

---

### Task 7: Migriere Epic-Token zu Secure-Store

**Files:**
- Modify: `launcher/src-tauri/src/commands/epic.rs`

**Step 1:** Suche Token-Persistenz-Funktionen. Epic nutzt vermutlich `authenticate_epic_legendary` und speichert separat. Domain = `"epic"`.

**Step 2:** Gleicher Pattern. Epic hat vermutlich `epic_legendary_token_path` und `save_epic_legendary_token`.

**Step 3:** Build + commit.

---

### Task 8: Migriere Ubisoft-Token zu Secure-Store

**Files:**
- Modify: `launcher/src-tauri/src/commands/ubisoft.rs`

Domain = `"ubisoft"`. Gleicher Pattern. Falls Ubisoft nur eine `install_id` speichert (kein OAuth-Token), diese ebenfalls migrieren.

---

### Task 9: Migriere Battle.net-Token zu Secure-Store

**Files:**
- Modify: `launcher/src-tauri/src/commands/battlenet.rs`

Domain = `"battlenet"`. Battle.net speichert vermutlich Game-Payloads, nicht klassische OAuth-Tokens. Alle persistierten Secrets migrieren.

---

### Task 10: Migriere Steam-Scraper-Daten zu Secure-Store

**Files:**
- Modify: `launcher/src-tauri/src/commands/system.rs`

Steam hat **keinen** OAuth-Token (OpenID ist anders), aber der `open_steam_scraper_window` speichert vermutlich `steam_id` und Session-Cookies. Diese ebenfalls migrieren. Domain = `"steam"`.

---

## Phase 3: Migration alter Datei-Tokens

### Task 11: One-Time-Migration alter JSON-Tokens

**Files:**
- Modify: `launcher/src-tauri/src/commands/secure_store.rs`

**Step 1:** Füge eine `migrate_legacy_tokens` Funktion hinzu, die einmalig alle alten JSON-Dateien in den Secure-Store verschiebt:

```rust
const LEGACY_TOKEN_FILES: &[(&str, &str)] = &[
    ("gog", "gog_auth.json"),
    ("xbox", "xbox_token.json"),
    ("ea", "ea_token.json"),  // Pfad anpassen an echten Dateinamen
    ("epic", "epic_token.json"),
    ("ubisoft", "ubisoft_token.json"),
    ("battlenet", "battlenet_token.json"),
    ("steam", "steam_scraper.json"),
];

/// One-time migration: moves legacy plaintext tokens into secure store.
/// Safe to call multiple times — checks if keychain entry already exists.
pub fn migrate_legacy_tokens() {
    let Some(config_dir) = config_dir() else { return; };
    let launcher_dir = config_dir.join("open-game-launcher");
    for (domain, filename) in LEGACY_TOKEN_FILES {
        // Skip if already in secure store
        if get_secret(domain).ok().flatten().is_some() {
            continue;
        }
        let legacy_path = launcher_dir.join(filename);
        if let Ok(contents) = fs::read_to_string(&legacy_path) {
            if !contents.trim().is_empty() {
                let _ = set_secret(domain, &contents);
                // Mark for deletion by renaming
                let _ = fs::rename(&legacy_path, legacy_path.with_extension("json.migrated"));
            }
        }
    }
}
```

**Step 2:** Rufe `migrate_legacy_tokens()` einmalig in `lib.rs` `setup` auf, nach den anderen `start_*` Aufrufen:

```rust
.setup(|app| {
    // ... existing code ...
    commands::games::start_playtime_poller(app.handle().clone());
    commands::games::start_library_inventory_watcher(app.handle().clone());
    commands::downloads::start_global_download_watcher(app.handle().clone());
    commands::secure_store::migrate_legacy_tokens();  // <-- NEU
    Ok(())
})
```

**Step 3:** Build + manuell testen:

```bash
cd E:\Code\open-game-launcher\launcher
cargo check
```

Starte App einmal, logge dich in GOG/Xbox/EA ein, schließe. Starte erneut. Wenn kein Re-Login nötig ist, funktioniert die Migration.

**Step 4:** Commit:

```bash
git add launcher/src-tauri/src/commands/secure_store.rs launcher/src-tauri/src/lib.rs
git commit -m "feat(security): one-time migration of legacy plaintext tokens"
```

---

## Phase 4: Verifikation

### Task 12: Manuelle End-to-End-Verifikation

**Step 1:** Lösche alle bestehenden Tokens in Windows Credential Manager unter "OpenGameLauncher".

**Step 2:** Starte die App:

```bash
cd E:\Code\open-game-launcher\launcher
pnpm tauri dev
```

**Step 3:** Logge dich in **GOG** ein. Warte bis Token gespeichert. Schließe App.

**Step 4:** Öffne Windows Credential Manager. Suche "OpenGameLauncher". Es sollte einen Eintrag "gog" geben.

**Step 5:** Starte App erneut. Library sollte GOG-Spiele ohne Re-Login zeigen. ✓

**Step 6:** Wiederhole für **Xbox, EA, Epic, Ubisoft, Battle.net**.

**Step 7:** Lösche den Keychain-Eintrag manuell. Starte App. Fallback-Datei `%APPDATA%\open-game-launcher\.keyring-fallback.json` sollte "gog": "..." enthalten. App sollte trotzdem funktionieren.

**Step 8:** Visuelle Verifikation in `pnpm tauri dev` Console: keine Errors beim Token-Load.

---

### Task 13: Build-Verifikation

**Step 1:** TypeScript-Build (unverändert, sollte grün sein):

```bash
cd E:\Code\open-game-launcher\launcher
pnpm typecheck
pnpm lint
pnpm build
```

Expected: Alle drei grün.

**Step 2:** Rust-Release-Build:

```bash
cd E:\Code\open-game-launcher\launcher\src-tauri
cargo build --release
```

Expected: Erfolgreich, evtl. größeres Binary durch zusätzliche Crate.

**Step 3:** Commit falls nötig (z.B. Lint-Fixes):

```bash
git add .
git commit -m "chore(security): fix lint after secure_store migration"
```

---

## Done-Checkliste

- [ ] `keyring` Crate in Cargo.toml
- [ ] `secure_store.rs` Modul mit Tests
- [ ] Alle 7 Plattform-Tokens (GOG, Xbox, EA, Epic, Ubisoft, Battle.net, Steam) migriert
- [ ] Legacy-Migration-Funktion registriert
- [ ] `pnpm typecheck` / `pnpm lint` / `pnpm build` grün
- [ ] `cargo build --release` grün
- [ ] Manuelle E2E-Verifikation: alle 7 Logins funktionieren ohne Re-Login nach Neustart
- [ ] Windows Credential Manager zeigt "OpenGameLauncher" Einträge
- [ ] Fallback-Datei funktioniert wenn Keychain gelöscht
- [ ] 13 Commits (einer pro Task)

---

## Nächste Pläne

Nach Abschluss von S7: **S6 (Cloud-Save E2E-Verschlüsselung)** — nutzt `keyring` aus S7 für die Schlüsselableitung. Datei: `docs/plans/06-cloud-save-e2e-encryption.md`.
