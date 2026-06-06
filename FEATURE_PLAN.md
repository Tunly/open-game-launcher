# Open Game Launcher — Offene Features

> **Ziel:** Übersicht aller Features, die noch nicht (vollständig) implementiert sind.
> Bereits implementierte Features sind in `docs/PROJECT_DESIGN.md` und im Code dokumentiert.
>
> **Prinzipien:** Modular, Cross-Platform, Offline-resilient (Cloud-Sync mit Local-Cache), Open-Source (AGPL-3.0).

---

## Übersicht

| # | Feature | Priorität | Status | Gesamtfortschritt | Offene Aufgaben |
|---|---------|-----------|--------|-------------------|-----------------|
| 0 | Embedded Client-Manager | Hoch | 🟡 URI-Start + Plattform-Detection + Login-Flow fertig | ~30% | Client-Health-Poll, Status-Indikatoren, Silent-Install, Auto-Updates, Client-Modifikation |
| 2 | Store-Backend Frontend | Hoch | 🟡 Backend + Stripe + DeveloperPortal fertig | ~50% | StorePage auf echte Daten, Checkout, Reviews, Preischart |
| 3 | In-Game Overlay vollständig | Mittel | 🟡 Tabs + Hotkey + AC + Screenshot + FPS/GPU fertig | ~90% | Recharts statt SVG-Sparkline |
| 4 | Performance-Monitor Frontend | Mittel | 🟡 Overlay-Tab + Rust-Polling + GPU/NVML fertig | ~50% | PerfHistoryPage-Route fehlt, Recharts-ActivitySection tot, Session-Persistierung |
| 5 | Cloud-Save E2E Integration | Hoch | 🟡 Crypto + Panel + Settings + AutoSync fertig | ~80% | Konflikt-UI, Sync-Status-Details |
| 6 | Categories/Tags + Screenshots + Prices UIs | Mittel | 🟡 DB + Layer + NewsPage fertig | ~40% | CategoryChips, ScreenshotGallery, PriceChart |
| 7 | Mod-Management | Mittel | 🟡 Vollständige Engine + UI + DB + Steam-Workshop fertig | ~90% | CurseForge/Mod.io native APIs |
| 9 | DSGVO/Privacy | Hoch | 🟡 Privacy-Settings-UI + Formular fertig | ~45% | Datenexport (JSON), Account-Löschung (30-Tage) |
| 10 | Echtzeit-Presence | Mittel | 🟡 Supabase-Realtime + Overlay-Tab + Hook fertig | ~75% | Plattform-Polling (Edge Function), echte Plattform in Freundesliste |
| 11 | Custom Artwork | Niedrig | 🟡 rawg-assets EF + Rust-Cache + Drag-Drop-Upload fertig | ~70% | Auto-Download in GameDetails (Steam-Header, Epic-Caps) |
| 12 | Backup & Restore | Niedrig | ❌ Nicht begonnen | 0% | Externes Laufwerk, inkrementell |
| 13 | Remote Play & Downloads | Niedrig | ❌ Nicht begonnen | 0% | Delegation an Steam/Epic, Mobile/Web |
| 14 | Spielzeit-Tracking erweitert | Niedrig | 🟡 playtime.rs + idle.rs + Sessions + Editor fertig | ~75% | Session-Charts (ActivitySection tot) |

---
## 0. Embedded Client-Manager

> Ziel: Open Game Launcher ist ein vollwertiger Client-Manager für alle unterstützten Plattformen — nicht nur ein Aggregator. Erkennung laufender Clients, Status-Polling, Silent-Install, Auto-Updates und Client-Modifikationen (Pfad-Overlays, Asset-Cache, Mod-Wurzelverzeichnisse) sind im Scope. Client-Start erfolgt über die offiziellen URI-Protokolle der jeweiligen Plattformen.

### Bereits implementiert

- ✅ Client-Start via offizielles URI-Protokoll (Steam `steam://`, Epic `com.epicgames.launcher://`, GOG `goggalaxy://`, Xbox `xbox://`, Ubisoft `uplay://`, Battle.net `battle.net://`, EA `origin2://`)
- ✅ Plattform-spezifische Game-Detection in `commands/games/detect/{epic,steam}.rs` (Windows Registry, macOS Plist, Linux .desktop/.config)
- ✅ Library listet installierte Spiele mit Launcher-Source (Steam, GOG, Epic, Xbox, Ubisoft, Battle.net, EA)
- ✅ Login + Owned-Games-Flow für 7 Plattformen
- ✅ Cross-Plattform Source-Tracking über `game_external_ids` Tabelle

### Offene Tasks

#### 7-Plattform Client-Detection
- Pro Plattform: Installationspfad, Version, Running-State, Update-Verfügbarkeit
- Detection-Layer aus `detect/{epic,steam}.rs` auf alle 7 Plattformen erweitern
- Konfigurierbares Poll-Intervall (Default 30s)

#### Process-Status-Polling
- `ClientInfo` Model mit Live-Updates: PID, Window-Handle, last-input, uptime
- Plattform-spezifische Prozess-Detection (Steam = `steam.exe`, Epic = `EpicGamesLauncher.exe`, GOG = `GalaxyClient.exe`, etc.)
- Events: `client_started`, `client_stopped`, `game_started`, `game_stopped`
- Integration in `useLibrarySync` für Live-Refresh

#### Library-Status-Indikatoren
- "Steam läuft nicht" / "Steam starten"-Button in `GameRow`
- "Spiel läuft"-Badge mit PID/Window-Handle
- Cross-Plattform-Konsolidierung: Wenn ein Spiel auf Steam läuft, in Epic-Library als „läuft über Steam" markieren

#### Silent-Install
- Unterstützte Plattform-Clients silent installieren, wo lizenzrechtlich + technisch möglich
- Voraussetzung: User-Consent + Capability-Check (Admin-Rechte, freier Speicher, .NET-Runtime etc.)
- Eigenes Installationsmanifest pro Plattform
- UI: „Plattform fehlt → Installieren"-Flow in der Library

#### Auto-Updates
- Versions-Polling pro Plattform (24h)
- Auto-Download von Client-Updates (konfigurierbar: manuell / auto-download / auto-apply)
- Update-History pro Client

#### Client-Modifikation
- Pfad-Overlays: Launcher kann alternative Asset-/Mod-Pfade pro Client verwalten
- Asset-Cache-Pflege: gemeinsamer Cache über alle Clients, konfliktfreie Lookup-Tabelle
- Mod-Wurzelverzeichnisse pro Client: Steam `steamapps/workshop`, GOG `Galaxy-2.0-Plugins-Storage`, Epic `Mods/`, etc.
- Schutz vor versehentlicher Modifikation: Read-Only-Mount für fremde Verzeichnisse

#### Tests + Telemetrie
- Plattform-Health-Score (Detection-Erfolgsrate, Login-Status, Update-Verfügbarkeit)
- Anonyme Nutzungsstatistik pro Plattform (nur lokal, opt-in)
- E2E-Tests mit gemockten Prozessen

---
## 15. Cross-Platform Achievements

> Ziel: Achievements pro Spielgruppe kombinieren. Wenn ein Spiel auf mehreren Plattformen vorhanden ist, ist die Variante mit den meisten Achievement-Definitionen die Basis; Unlocks, Rarity, Icons und Zusatz-Achievements aus anderen Plattformen werden darauf gemappt.

### Verbindliche Provider-Policy

- Keine Developer-API-Keys oder game-spezifischen SDK-Credentials als Nutzer-Voraussetzung.
- Erlaubt sind nur Nutzer-Anmeldung, vorhandene lokale Clientdaten, lokal gecachte Daten und best-effort Scraping/Parsing.
- Provider, die ohne Developer-Key keine generische Achievement-Liste liefern, bleiben sichtbar, aber werden als `unofficial`/best-effort oder `no_api` markiert.
- Bekannte Unlocks werden nie geloescht, wenn ein Provider privat, offline, leer oder nicht auslesbar antwortet.

### Bereits implementiert

- Kanonische Aggregation in `launcher/src/lib/game-groups.ts`.
- Basisvariante = Plattformvariante mit den meisten Achievement-Definitionen.
- Matching nach exaktem Source/API-Key, Name+Beschreibung, dann schwachem Name-only Match.
- Zusatz-Achievements aus Nicht-Basisplattformen bleiben erhalten.
- Steam und Xbox haben echte Sync-Pfade ueber Nutzerkonto/lokale Titelhinweise.
- GOG, Epic, EA, Ubisoft und Battle.net haben sichtbare Provider-Statuspfade.
- GOG hat einen Login-basierten Sync ueber die Galaxy-Gameplay-Achievement-Route; der lokale Importer bleibt Fallback.
- Epic versucht Legendary-Login-Metadaten (`legendary info --json`) vor lokalem Import und oeffentlichem Store-Fallback.
- Lokaler best-effort Importer fuer JSON-Caches: `achievement-cache/<provider>/<game-id>.json`.
- Der lokale Importer prueft zusaetzlich bekannte Client-Cache-Wurzeln fuer GOG, Epic, EA, Ubisoft und Battle.net und sucht dort begrenzt nach plausiblen Achievement-/Stats-JSONs.
- Sidecar-Import aus Spielordnern: `og-achievements.json`, `achievements.json`, `<provider>-achievements.json` und `.og-launcher/*`.
- Sidecar-/Scraper-Format dokumentiert in `docs/references/achievement-sidecars.md`.
- Installierte best-effort Provider versuchen den lokalen Importer auch ohne Login, damit Sidecars nicht uebersehen werden.
- Epic Public-Fallback: Definitions/Rarity werden best-effort von oeffentlichen Epic Achievement-Seiten gelesen und lokal gecacht, ohne API-Key.

### Offene Tasks

- GOG: lokale Galaxy-Clientdaten zusaetzlich zum Login-Sync nach Achievement-/Stats-Cache untersuchen.
- Epic: echte lokale Unlocks aus Epic/EOS-Clientdaten finden und mit Legendary-/Store-Definitionen mergen.
- EA/Ubisoft/Battle.net: konkrete Achievement-Cacheformate je Client identifizieren; Importpfad prueft bereits bekannte lokale Cache-Wurzeln plus begrenzte JSON-Discovery.
- Remote/Supabase-Sync fuer aggregierte Achievements spaeter nachziehen.

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
> Bereits fertig: Overlay-Fenster mit 4 Tabs (Freunde/Chat/Erfolge/Performance), globaler Hotkey (Shift+F1), Anti-Cheat-Scanning (13 AC), Screenshot-Capture (GDI BitBlt + Persistierung), echte FPS-/GPU-Werte (DXGI + NVML)

### Bereits implementiert

#### Overlay-Fenster & Hotkey
- ✅ `toggle_in_game_overlay` erzeugt `transparent: true`, `always_on_top: true`, `decorations: false`, `skip_taskbar: true`
- ✅ Route `/overlay` mit vollständiger `OverlayPage.tsx` (4 Tabs)
- ✅ `Shift+F1` via `tauri-plugin-global-shortcut` registriert
- Fullscreen: Nicht nutzbar → Toast-Notifications als Fallback

#### Anti-Cheat-Detection
- ✅ `anti_cheat.rs` scannt Prozesse auf Vanguard, FACEIT, BattlEye, EAC, ESEA, PunkBuster, XignCode, GameGuard, Arkos, Mihoyo Protect u.a.
- ✅ `is_overlay_blocked_by_anti_cheat()` als separater Command
- ✅ OverlayPage zeigt rote (blockiert) / gelbe (AC erkannt) Banner

#### Overlay-UI (4 vollständige Tabs)
- **Freunde:** `getVisiblePresence` + `subscribeToPresenceChanges`, Online-Status, aktuelles Spiel
- **Chat:** Gruppenchats, `subscribeToGroupMessages`, Nachrichten senden
- **Erfolge:** Installierte Spiele mit Achievement-Progress-Bar
- **Performance:** CPU%, RAM MB, FPS (DXGI Frame-Pacing), Frame-Time, SVG-Sparkline, Uptime

#### Echte FPS/GPU-Werte
- ✅ FPS via `report_frame_rendered` in `perf_monitor.rs:33-55` (DXGI Frame-Pacing)
- ✅ GPU via NVML in `perf_monitor.rs:104-119` (Windows)
- ✅ `FpsHudPage` zeigt Live-Werte

#### Screenshot-Capture
- ✅ Windows GDI `BitBlt` (kein DXGI)
- ✅ Persistiert in `AppData\OG-Launcher\screenshots\ogl_*.jpg` (`overlay.rs:270-280`)

### Offene Tasks

#### Recharts statt SVG-Sparkline
- Custom SVG-Sparkline funktioniert (`OverlayPage.tsx:1312`) → 4 Recharts `<LineChart>` mit 60 Samples

---
## 4. Performance-Monitor Frontend (S5)

> Detaillierter Plan: `docs/plans/05-performance-monitor.md`
> Bereits fertig: Migration `performance_metrics`, `perf_monitor.rs` (CPU+RAM+FPS+NVML-GPU), Types, Overlay-PerfTab mit echten Metriken + SVG-Sparkline

### Bereits implementiert

#### PerfMonitorTab im Overlay
- ✅ `poll_performance_metrics` pollt CPU%, RAM MB, FPS, Frame-Time, GPU und Uptime (alle 2s im Overlay)
- ✅ 4 MetricCards in 2×2 Grid: CPU, RAM, FPS, Frame
- ✅ SVG-Sparkline für CPU-Verlauf (30 Samples)
- ✅ FPS via DXGI Frame-Pacing, GPU via NVML (Windows)

### Offene Tasks

#### PerfHistoryPage in Settings
- Route `/settings/performance` fehlt komplett (kein Eintrag in `router.tsx:90-122`)
- Vergangene Sessions: Dauer, Avg-FPS, Peak-RAM
- Recharts-Charts über Zeit
- Filter: 7 Tage / 30 Tage / Alle

#### ActivitySection ist Dead-Code
- `launcher/src/components/settings/ActivitySection.tsx` (~412 LOC, Recharts BarChart) ist gebaut, wird aber **nirgends importiert**.
- Aktion: Entweder in SettingsPage mounten oder löschen.

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
- ✅ `extract_steam_workshop_id` + `install_path.join("workshop")` in `mod_install.rs:1046-1083` ist real
- ✅ Workshop-Items werden mit korrektem Pfad und ID-Extraction installiert

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

> Bereits fertig: rawg-assets Edge Function, Rust-Cache, Drag-Drop-Upload in GameDetails

### Bereits implementiert

- ✅ `supabase/functions/rawg-assets/index.ts`: Ruft Cover-Art von RAWG-API ab
- ✅ Asset-Caching in Rust-Backend (`rawg_asset_cache_path`)
- ✅ `lib/custom-artwork.ts`: Custom-Artwork-Logik
- ✅ Drag-Drop-Upload in `GameDetails.tsx:282` + Handler in `useLibrarySync.ts:518`
- ✅ `ArtworkPreviewModal`: Vorschau vor Übernahme

### Offene Tasks

- Auto-Download in Spieldetailseite (Steam Headerimages, Epic Caps) — RAWG-Edge-Function gibt Cover, aber kein Auto-Apply
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
- ✅ `idle.rs` (Windows `GetLastInputInfo`, Linux `xprintidle`, macOS-Stub): Plattform-spezifische Idle-Erkennung
- ✅ `useUserPlaySessions` Hook: Sessions abrufen
- ✅ `PlaytimeEditorPanel`: Manuelle Korrektur von Spielzeit

### Offene Tasks

#### Session-Historie Charts
- `launcher/src/components/settings/ActivitySection.tsx` ist gebaut (Recharts BarChart), wird aber **nirgends importiert**.
- Aktion: In SettingsPage mounten oder löschen.
- Filter: Tages-/Wochen-/Monats-/Jahresübersicht

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
| **Kernel-Level Virtual-Gamepad** | Später | Virtual-Gamepad-Treiber wie Steam Input/ViGEm für Anti-Cheat-/Raw-Input-Sonderfälle |
| **Controller Community-Layouts** | Später | Community-Layouts mit Bewertungen, Downloads und Moderation |
| **Controller Gyro/Haptik** | Später | Gyro/Haptik real an unterstützte Controller-Treiber anbinden |

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
