# Open Game Launcher — Offene Features

> **Ziel:** Übersicht aller Features, die noch nicht (vollständig) implementiert sind.
> Bereits implementierte Features sind in `docs/PROJECT_DESIGN.md` und im Code dokumentiert.
>
> **Prinzipien:** Modular, Cross-Platform, Offline-resilient (Cloud-Sync mit Local-Cache), Open-Source (AGPL-3.0).

---

## Übersicht

| # | Feature | Priorität | Status | Gesamtfortschritt | Offene Aufgaben |
|---|---------|-----------|--------|-------------------|-----------------|
| 1 | Smart-Join-UI | Hoch | 🟡 CrossPlayBadge + Rust-Command + DB fertig | ~60% | Smart-Join-Button in Freundesliste |
| 2 | Store-Backend Frontend | Hoch | 🟡 Backend + Stripe + DeveloperPortal fertig | ~55% | StorePage auf echte Daten, Checkout, Reviews, Preischart |
| 3 | In-Game Overlay vollständig | Mittel | 🟡 Tabs + Hotkey + AC + Screenshot + FPS-HUD fertig | ~85% | Echte FPS-Werte, Recharts, Screenshot-Speicherort |
| 4 | Performance-Monitor Frontend | Mittel | 🟡 Overlay-Tab + Rust-Polling + GPU/NVML fertig | ~65% | PerfHistoryPage, Recharts, Session-Persistierung |
| 5 | Cloud-Save E2E Integration | Hoch | 🟡 Crypto + Panel + Settings + AutoSync fertig | ~90% | Konflikt-UI, Sync-Status-Details |
| 6 | Categories/Tags + Screenshots + Prices UIs | Mittel | 🟡 DB + Layer + NewsPage fertig | ~40% | CategoryChips, ScreenshotGallery, PriceChart |
| 7 | Controller-Support | Niedrig | ❌ Nicht begonnen | 0% | Erkennung (gilrs), Re-Mapping, Community-Layouts |
| 8 | Mod-Management | Mittel | 🟡 Vollständige Engine + UI + DB fertig | ~85% | Steam Workshop, CurseForge/Mod.io native APIs |
| 9 | DSGVO/Privacy | Hoch | 🟡 Privacy-Settings-UI + Formular fertig | ~60% | Datenexport (JSON), Account-Löschung (30-Tage) |
| 10 | Echtzeit-Presence | Mittel | 🟡 Supabase-Realtime + Overlay-Tab + Hook fertig | ~80% | Plattform-Polling (Edge Function), Plattform in Freundesliste |
| 11 | Custom Artwork | Niedrig | 🟡 rawg-assets EF + Rust-Cache + custom-artwork.ts fertig | ~50% | Upload per Spiel, Auto-Download in GameDetails |
| 12 | Backup & Restore | Niedrig | ❌ Nicht begonnen | 0% | Externes Laufwerk, inkrementell |
| 13 | Remote Play & Downloads | Niedrig | ❌ Nicht begonnen | 0% | Delegation an Steam/Epic, Mobile/Web |
| 14 | Spielzeit-Tracking erweitert | Niedrig | 🟡 playtime.rs (Background-Poller) + Supabase-Sync fertig | ~60% | Idle-Erkennung, Session-Charts, Manuelle Korrektur |

---
## 1. Smart-Join-UI (S1)

> Detaillierter Plan: `docs/plans/01-cross-play-and-smart-join.md`
> Bereits fertig: Migration `cross_play_schema`, Types, Supabase-Layer, CrossPlayBadge, Tauri-Command `launch_cross_play_join`

### Offene Tasks

#### Smart-Join-Button in der Freundesliste

Wenn ein Freund ein Cross-Play-Spiel spielt und du es auf einer kompatiblen Plattform besitzt, erscheint ein "Spiel beitreten"-Button.

**Flow:**
1. Freundesliste: "Max spielt Fortnite auf Epic"
2. Du hast Fortnite auf Steam installiert
3. Klick → Smart-Join: **Spiel auf Steam starten** (Teal-Button)
4. Untertitel: "Fortnite unterstützt Cross-Play."
5. Bei nicht verifiziertem Cross-Play: Gelber Warnhinweis

**Smart-Join-Logik:**
1. Eingabe: Welches Spiel, welche Plattform?
2. Lookup: Cross-Play-Kombinationen für das Spiel
3. Prüfung: Besitz auf kompatibler Plattform? Installiert?
4. Output: Smart-Join-Button oder "Kaufen"-Hinweis

**Ehrlich-UX:**

| Szenario | Verhalten |
|---|---|
| Cross-Play verifiziert | "Smart-Join möglich" (grün) |
| Gemeldet, nicht verifiziert | "Nicht garantiert" (gelb) |
| Nicht in DB | Kein Button |
| Inkompatible Plattform | "Kaufe auf [Plattformen]" |
| Gleiche Plattform | "Spiel öffnen" |
| Verknüpfung fehlt | "Verknüpfe [Plattform]" |

**Tech:** Cross-Play-DB lokal gecached, Delta-Sync, O(1)-Lookup, `game_universal_id` Mapping.

---
## 2. Store-Backend Frontend (S3)

> Detaillierter Plan: `docs/plans/03-own-store-backend.md`
> Bereits fertig: Migration `store_schema` (products, orders, cart_items, licenses, store_reviews, price_history etc.), Types, Supabase-Layer, Stripe-Command, DeveloperPortalPage

### Offene Tasks

#### StorePage mit echten Daten

Aktuell Mock-Daten → muss auf `listPublishedProducts()` umgestellt werden.

| Ansicht | Beschreibung |
|---|---|
| **Home** | Hero-Banner, Featured Sale, Neuerscheinungen |
| **Durchstöbern** | Filter: "Alle", "Free", "Sale", "Neu", "Top" |
| **Produktseite** | Cover, Beschreibung, Preis, Reviews, SysReq |
| **Warenkorb** | Cart-Icon + Badge, Cart-Drawer |
| **Bestellhistorie** | Käufe, Rechnung, Refund-Button |

#### Checkout-Frontend
1. Warenkorb → "Zur Kasse"
2. Zahlungsmethode (Stripe-Redirect)
3. Redirect → Bestellbestätigung → Lizenz → Download freigeschaltet
4. Mock: Direkt `paid`-Status

#### Reviews
- Nur verifizierte Käufe, 1–5 Sterne, Abuse-Schutz (≥3 Meldungen → ausgeblendet)
- Spam-Schutz: max. 1 Review/Spiel/Nutzer, Rate-Limit 5/h
- Developer-Antworten

#### Wishlist + Preisdrop
- "+ Zur Wunschliste" Button
- Edge Function `notify-price-drop` bei Preisänderung
- Preisverlauf via `price_history` (deployed)

#### Bestellhistorie + Lizenz-Validierung
- Bestellungen: Datum, Spiel, Preis, Status, Rechnungs-PDF
- Tauri-Command `validate_license`: Offline-Token 30 Tage, Gerätelimit

---
## 3. In-Game Overlay vollständig (S4)

> Detaillierter Plan: `docs/plans/04-in-game-overlay.md`
> Bereits fertig: Overlay-Fenster mit 4 Tabs (Freunde/Chat/Erfolge/Performance), globaler Hotkey (Shift+Tab), Anti-Cheat-Scanning (13 AC), Screenshot-Capture (GDI BitBlt)

### Bereits implementiert

#### Overlay-Fenster & Hotkey
- ✅ `toggle_in_game_overlay` erzeugt `transparent: true`, `always_on_top: true`, `decorations: false`, `skip_taskbar: true`
- ✅ Route `/overlay` mit vollständiger `OverlayPage.tsx` (4 Tabs)
- ✅ `Shift+Tab` via `tauri-plugin-global-shortcut` registriert
- Fullscreen: Nicht nutzbar → Toast-Notifications als Fallback

#### Anti-Cheat-Detection
- ✅ `anti_cheat.rs` scannt Prozesse auf Vanguard, FACEIT, BattlEye, EAC, ESEA, PunkBuster, XignCode, GameGuard, Arkos, Mihoyo Protect u.a.
- ✅ `is_overlay_blocked_by_anti_cheat()` als separater Command
- ✅ OverlayPage zeigt rote (blockiert) / gelbe (AC erkannt) Banner

#### Overlay-UI (4 vollständige Tabs)
- **Freunde:** `getVisiblePresence` + `subscribeToPresenceChanges`, Online-Status, aktuelles Spiel
- **Chat:** Gruppenchats, `subscribeToGroupMessages`, Nachrichten senden
- **Erfolge:** Installierte Spiele mit Achievement-Progress-Bar
- **Performance:** CPU%, RAM MB, FPS, Frame-Time, SVG-Sparkline, Uptime

#### Screenshot-Capture
- ✅ Windows GDI `BitBlt` (kein DXGI)
- ✅ Gibt Base64-JPEG zurück

### Offene Tasks

#### Echte GPU/FPS-Werte
- Aktuell: GPU = `None`, FPS = `0.0` (Platzhalter)
- Nötig: DXGI Frame-Pacing (FPS), `nvidia-smi`/`rocm-smi` (GPU)

#### Recharts statt SVG-Sparkline
- Custom SVG-Sparkline funktioniert → 4 Recharts `<LineChart>` mit 60 Samples

#### Screenshot-Persistierung
- Aktuell nur Base64-Ausgabe in Console
- Speicherort: `%APPDATA%\OG-Launcher\Screenshots\{game}\`

---
## 4. Performance-Monitor Frontend (S5)

> Detaillierter Plan: `docs/plans/05-performance-monitor.md`
> Bereits fertig: Migration `performance_metrics`, `perf_monitor.rs` (CPU+RAM), Types, Overlay-PerfTab mit CPU/RAM/FPS/Frame-Time-Metriken + SVG-Sparkline

### Bereits implementiert

#### PerfMonitorTab im Overlay
- ✅ `poll_performance_metrics` pollt CPU%, RAM MB, FPS, Frame-Time und Uptime (alle 2s im Overlay)
- ✅ 4 MetricCards in 2×2 Grid: CPU, RAM, FPS, Frame
- ✅ SVG-Sparkline für CPU-Verlauf (30 Samples)

### Offene Tasks

#### PerfHistoryPage in Settings
- Route `/settings/performance` mit Sessions-Übersicht
- Vergangene Sessions: Dauer, Avg-FPS, Peak-RAM
- Recharts-Charts über Zeit
- Filter: 7 Tage / 30 Tage / Alle

#### GPU/FPS (echte Werte)
- Aktuell: GPU = `None`, FPS = `0.0` (Platzhalter)
- **FPS:** DXGI Frame-Pacing (Windows)
- **GPU:** `sysinfo` oder `nvidia-smi`/`rocm-smi` Fallback

#### Recharts statt SVG-Sparkline
- Custom SVG funktioniert → 4 Recharts `<LineChart>` mit 60 Samples

#### Persistierung
- Frontend sammelt 300 Samples (5 min)
- Bei Spiel-Ende: Bulk-Insert via `savePerfSession()`

---
## 5. Cloud-Save E2E Integration (S6)

> Detaillierter Plan: `docs/plans/06-cloud-save-e2e-encryption.md`
> Bereits fertig: Crypto (aes-gcm, argon2), cloud_crypto.rs, CloudSavesSettings, CloudSavesPanel, useCloudAutoSync, Supabase-Layer

### Bereits implementiert

#### Crypto (Rust)
- ✅ `encrypt_file()`: AES-256-GCM + Argon2id Key-Derivation
- ✅ `decrypt_file()`: Entschlüsselung mit Meta-Validierung
- ✅ `get_or_create_user_keyring_key()`: 32-Byte Master-Key im OS-Keychain
- ✅ `generate_cloud_key` / `rotate_cloud_key` / `is_cloud_key_present` als Tauri-Commands
- ✅ `SaveFileMeta` mit Version, Nonce, Salt, SHA256

#### Integration in Save-Sync-Flow
- ✅ `useCloudAutoSync.ts` Hook: Auto-Sync bei Spiel-Start (60s Lock)
- ✅ `CloudSavesPanel.tsx` in GameDetails: Upload, Download, Restore, Sync-Modus
- ✅ `CloudSavesSettings.tsx`: Key-Status-Anzeige, Key-Erzeugung/Rotation, Speicherplatz
- ✅ Supabase-Layer: `cloud-saves.ts` mit CRUD für Save-Sets und Files
- Format: `${user_id}/${game_id}/${save_set_id}/${filename}.enc`

#### SettingsPage E2E-Info
- ✅ CloudSavesSettings mit Key-Status, Usage und Erklärung

### Offene Tasks

#### Konflikt-UI
- Aktuell: Lokal überschreibt Cloud oder umgekehrt
- Nötig: Vergleichs-UI mit Date-Diffs, manuelle Auswahl "Lokal vs. Cloud"

#### Synchronisierungs-Status
- Aktuell: Nur Success/Error-Toast
- Nötig: Letzter Sync-Zeitpunkt, offene Änderungen, Konfliktzähler

---
## 6. Categories/Tags + Screenshots + Price-Tracker UIs (S8)

> Detaillierter Plan: `docs/plans/08-categories-tags-news-screenshots-prices.md`
> Bereits fertig: Migration (categories, news_posts, game_screenshots, price_history), Supabase-Layer, Types, NewsPage

### Offene Tasks

#### Categories/Tags + Library-Filter
- **CategoryChips:** Teal Pills, Klick → Library-Filter
- **Sidebar:** Checkbox-Liste aller Categories, kombinierbar mit Suche

#### Screenshot-Galerie
- Grid (3 Spalten), Klick → Lightbox
- "+ Upload" (Supabase Storage)
- Like-Button, Privacy-Stufen

#### Price-Tracker-UI
- **PriceChart:** Recharts `<LineChart>` aus `price_history`
- "Niedrigster Preis"-Badge, "+ Wishlist"-Button
- Edge Function `notify-price-drop`

---
## 7. Controller-Support

> Kein Sub-Plan. Konzept aus Feature-Plan Section 3.6.

### Erkennung
- **Xbox:** Native `XInput` (Windows)
- **PS4/PS5:** `ViGEmBus`-Treiber oder DS4Windows
- **Switch Pro:** `ViGEmBus` oder Bluetooth-HID
- **Generisch:** `gilrs` Crate (plattformübergreifend)
- Rust-Modul `controller.rs` mit `gilrs`, Tauri-Command `list_controllers()`

### Button-Re-Mapping pro Spiel
- Spieldetailseite: "Controller-Layout" Sektion
- Jeder Button → anderer Button
- Layouts pro Spiel+Controller-Typ (Supabase `controller_mappings`)

### Community-Layouts / Gyro / Haptik / Desktop-Mode
- Späterer Scope

---

## 8. Mod-Management

> Detaillierter Plan: `docs/plans/09-mod-management.md`
> Bereits fertig: DB-Migrationen (mods_schema, mod_catalog_user_installs), Types, Supabase-Layer, Rust-Commands, ModsPage, ModInstallStore, Mod-Install-Engine (URL/Archive/Folder)

### Bereits implementiert

#### Rust-Backend
- ✅ `mod_install.rs`: Install, Enable, Disable, Uninstall, Queue-Management, Pause/Cancel
- ✅ `install_mod_from_url()`: Download + SHA256 + Extract + Manifest
- ✅ `scan_mod_directory()`: Scannt Mod-Ordner nach installierten Mods
- ✅ `scan_game_mods()`: Erkennt installierte Mods pro Spiel
- ✅ Provider: `DirectUrl`, `LocalArchive`, `LocalFolder` (SteamWorkshop, Nexus, Modio, CurseForge als enum vorhanden)
- ✅ `set_mod_provider_secret()`: API-Keys für Nexus/CurseForge

#### Datenbank
- ✅ Migration `mods_schema.sql`: managed_mods, mod_profiles, mod_catalog, mod_catalog_versions
- ✅ Migration `mod_catalog_user_installs.sql`: mod_catalog_user_installs, mod_catalog_dependencies

#### Frontend (ModsPage)
- ✅ Vollständige `ModsPage.tsx` mit Provider-Filter, Suche, Game-Filter
- ✅ Install-Queue-Ansicht mit Fortschritt / Pause / Cancel
- ✅ Enable/Disable/Uninstall pro Mod
- ✅ API-Key-Eingabe pro Provider
- ✅ `modInstallStore.ts` (Zustand): Queue-Status, Progress

### Offene Tasks

#### Steam Workshop
- Items abonnieren/verwalten via Steam-Content-System
- Mod-Liste in Spieldetailseite

#### CurseForge / Mod.io
- Overwolf-Integration (CurseForge)
- Offene API (Mod.io)

---

## 9. DSGVO/Privacy

> Bereits fertig: PrivacySettingsPage.tsx, ProfilePrivacyForm.tsx, Supabase-Layer (profile.ts)
> Offen: Datenexport (JSON), Account-Löschung (30-Tage-Wartefrist)

### Bereits implementiert

#### Privacy-Einstellungen
- ✅ PrivacySettingsPage.tsx mit vollständigem ProfilePrivacyForm.tsx
- ✅ Profil-Sichtbarkeit: Profil, Bibliothek, Achievements, Spielaktivitäten, Online-Status, Kommentare, Wunschliste
- ✅ Werte: Öffentlich / Nur Freunde / Privat
- ✅ Speicherung via `updateMyProfilePrivacy()` in Supabase

### Offene Tasks

#### Datenexport (JSON)
- SettingsPage → "Meine Daten exportieren"
- Inhalt: Profile, Freunde, Spielzeit, Achievements, Bestellungen
- `exportUserData(userId) → Blob`

#### Account-Löschung
- 30-Tage-Wartefrist (Reaktivierung möglich)
- Danach: Hard Delete aller User-Daten

#### Keine Tracking-Cookies
- Launcher setzt keine Cookies
- Analytics opt-in, keine Third-Party-Tracker

---

## 10. Echtzeit-Presence

> Bereits fertig: `user_presence` Tabelle, Supabase-Layer `presence.ts`, Supabase Realtime Publication, Overlay-Freunde-Tab

### Bereits implementiert

#### Supabase-Layer
- ✅ `setLauncherPresence()`: Upsert mit customStatus, currentGameId, currentGameTitle
- ✅ `getVisiblePresence()`: Sichtbare Presences abrufen
- ✅ `subscribeToPresenceChanges()`: Echtzeit-Updates via Supabase Realtime
- ✅ `user_presence` Tabelle mit Realtime Publication
- ✅ Overlay Friends Tab: Zeigt Online-Status und aktuelles Spiel

### Offene Tasks

#### Plattform-Polling
- Polling: 60s pro Plattform (Steam/Epic/Xbox API)
- Edge Function: Plattform-Polling mit Batch-Update

#### Plattform-Anzeige in Freundesliste
- Freundesliste: "🎮 Max spielt Fortnite auf Epic"
- Klick → Chat, Smart-Join, oder Einladung
- Friend Activity Feed erweitern

---
## 11. Custom Artwork

> Bereits fertig: rawg-assets Edge Function für RAWG-API-Integration

### Bereits implementiert

- ✅ `supabase/functions/rawg-assets/index.ts`: Ruft Cover-Art von RAWG-API ab
- ✅ Asset-Caching in Rust-Backend (`rawg_asset_cache_path`)

### Offene Tasks

- Cover/Header/Logo Upload pro Spiel (Supabase Storage `game-artwork`)
- Auto-Download in Spieldetailseite (Steam Headerimages, Epic Caps)
- Community-Artwork mit Voting (Späterer Scope)

---

## 12. Backup & Restore

> Kein Sub-Plan. Aus Feature-Plan Section 3.12.

- Externes Laufwerk, ZIP/tar.gz Komprimierung
- Inkrementelle Backups (Diff-basiert, Hash-Manifest)
- Vollständige Wiederherstellung (Einzelne Spiele oder alles)

---

## 13. Remote Play & Downloads

> Kein Sub-Plan. Aus Feature-Plan Section 3.11.

### Remote Play Together
- Delegation an Steam Remote Play / Epic EOS
- "Remote Play"-Button in Spieldetailseite

### Remote Downloads
- Web-Dashboard `app.og-launcher.com`
- Status-Abfrage, Install-Trigger
- Späterer Scope, erfordert always-on PC

---

## 14. Spielzeit-Tracking erweitert

> Erweiterung des implementierten Basis-Trackings (playtime.rs).

### Bereits implementiert

- ✅ `playtime.rs` (Rust): Basis-Spielzeit-Erfassung
- ✅ `game_sessions` Tabelle in Supabase

### Offene Tasks

#### Idle-Erkennung (15 Min)
- Alle 5s: Input-Aktivität prüfen (Tastatur/Maus)
- 15 Min kein Input → Pause
- Windows: `GetLastInputInfo`, macOS/Linux: `xprintidle`-Äquivalent

#### Session-Historie Charts
- SettingsPage: Tages-/Wochen-/Monats-/Jahresübersicht
- Recharts: Balken (Spielzeit pro Spiel/Tag), Liniendiagramm (Trend)

#### Manuelle Korrektur
- Spielzeit editierbar, Sessions verschieben/löschen

---
## Spätere Erweiterungen

> Konzepte ohne konkreten Implementierungsplan.

| Feature | Scope | Beschreibung |
|---------|-------|-------------|
| **In-Game Overlay (Windowed/Borderless)** | Später | Echtes Overlay via Windows-APIs (`IDXGIOutputDuplication`). Anti-Cheat-Blockiert — separater Research-Track. |
| **Mobile App (iOS/Android)** | Später | Library, Chat, Remote Downloads, Push |
| **Smart Install** | Später | Schnellste/günstigste Download-Quelle automatisch wählen |
| **One-Click Setup** | Später | Neuer PC: Ein Login, Stores verbinden, Spiele erkennen |
| **Cross-Store Save Sync** | Konzept | Spielstände zwischen Store-Versionen synchronisieren |
| **Game Activity Dashboard** | Später | "Dein Gaming-Jahr" (Spotify Wrapped-Stil) |
| **Local Multiplayer Hub** | Später | Couch-Coop-Setup, Controller-Auto-Konfig |
| **Plugin-System** | Konzept | Store-Plugins, Tool-Plugins, Themes, Marketplace |
| **Themes/Skins** | Später | Dark/Light, Custom Themes. `user_settings.theme` existiert. |
| **AI-Empfehlungen** | Konzept | Mood-basiert, Backlog-Priorisierung |
| **Broadcasting** | Konzept | Twitch/YouTube-Integration |
| **LAN-Transfer** | Später | Netzwerk-Kopie zwischen PCs |

---

## Performance-Ziele

| Metrik | Ziel |
|--------|------|
| Startup | <2 Sekunden |
| RAM (Idle) | <200 MB |
| CPU (Hintergrund) | Minimal, kein Polling im Idle |
| GPU | Optional, deaktivierbar |
| Overlay-Open | <100ms nach Hotkey |
| PerfMonitor-Polling | 1 Hz (während Spiel), 0 Hz (Idle) |
| Cloud-Sync | Bandbreitenlimitierbar, Pause/Resume |

---

## Technische Herausforderungen

> Nur noch für offene Features relevant.

| Herausforderung | Ansatz |
|-----------------|--------|
| **Overlay bei Anti-Cheat** | Process-Scanning + DB `game_anti_cheat` + Fallback: Externes Fenster / Toast |
| **Overlay bei Fullscreen** | Nur Windowed/Borderless; Toast als Fallback. Echtes In-Game: separater Research-Track. |
| **Controller-Emulation** | ViGEmBus, DS4Windows, `gilrs`. Gyro/Haptik plattformabhängig. |
| **E2E-Verschlüsselung** | AES-256-GCM + Keychain-Key. Migration unverschlüsselter Saves. Versionierung. |
| **Realtime-Presence** | Supabase Realtime + Edge Functions für Plattform-Polling (60s). Caching gegen Rate-Limits. |
| **Store-Payment** | Stripe-Redirect. Mock für Open-Source-Version. |
| **Idle-Erkennung** | Windows: `GetLastInputInfo`. macOS/Linux: `xprintidle`. Fallback: Maus/Tastatur-Hook. |
| **Mod-Management** | Jede Plattform eigenes API. Priorität: Steam Workshop (größte Nutzerbasis). |

---

> Letztes Update: Siehe Git-Log. Nächste Schritte in `docs/plans/00-master-plan-missing-features.md`.

