# Open Game Launcher — Lokaler Fertigstellungsplan + externe Evidenz

> **Ziel:** Übersicht aller lokal fertiggestellten, lokal gestagten und extern
> evidenzpflichtigen Features.
> Bereits implementierte Features sind in `docs/PROJECT_DESIGN.md` und im Code dokumentiert.
>
> **Prinzipien:** Modular, Cross-Platform, Offline-resilient (Cloud-Sync mit Local-Cache), Open-Source (AGPL-3.0).
>
> **Lokale Evidence-Grenze:** `/settings?verify=external-completion-evidence-summary`
> zeigt Store/Stripe, Hosted Cron, Provider-Live, Hardware/OS und Rollout als
> lokalen No-Write-Nachweisplan mit Env-Namen, Artefaktpfaden und
> Proof-Anforderungen. Die dort gelisteten Gates bleiben offen, bis die echten
> externen Artefakte aus `docs/runbooks/external-completion-evidence.md`
> vorliegen.

---

## Übersicht

Die Prozentwerte in `Lokaler Stand` beschreiben nur lokal belegte Completion.
Sie sind keine Release-Freigabe; Release-Readiness bleibt blockiert, bis externe
Evidenz `5/5` Gates abdeckt und das volle `pnpm completion:gate` besteht.

| #   | Feature                       | Priorität | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Lokaler Stand (keine Release-Freigabe) | Offene Aufgaben                                                                                                                                                   |
| --- | ----------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Embedded Client-Manager       | Hoch      | 🟡 URI-Start + Plattform-Detection + Login-Flow + konfigurierbarer Client-Health-Poll + Status-Indikatoren + Lifecycle-Events mit Runtime-/Window-Metadaten + Live-Input-Runtime + Cross-Source-Running + Platform-Health-Score + One-Click-Setup-Readiness + One-Click-Rollback-/Audit-No-Write-Contract + SHA-256 Verify/Repair + 24h Update-Scheduler + Headless OS-Timer + sicheres Scheduled Auto-Open + Silent-Install-Staging + Auto-Apply-Guard + Asset-Cache-Lookup + Path-Overlay-Apply-Preflight + lokales Mount-/Apply-Contract-Paket + lokale 7-Provider-Apply-Policy-Matrix + lokaler Sandbox-Apply-/Rollback-Proof fertig                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | ~89%                                   | Provider-approved Auto-Apply-Integrationen, Provider-Terms-Approval, echtes OS-Mounting/Overlay-Anwendung gegen Provider-Clients                                  |
| 2   | Store-Backend Frontend        | Hoch      | 🟡 Backend + sicherer Stripe-Checkout + Checkout-Attempt-Idempotenz + signierter Webhook-Replay-Ledger mit stale Retry-Lease + konflikt-idempotente Lizenz-Ausgabe + Refund-Ausführung + Invoice-Staging + Offline-Stripe-Staging-Contract + Store-Edge-Contract-CI + Store-Readiness-Panel + StorePage + Cart-Drawer + persistente Store-Wishlist + Lizenzen + Reviews + Downloads lokal/vertraglich fertig; `store-stripe-live` bleibt extern offen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | ~99%                                   | Live-Stripe-Staging mit echter Webhook-Signaturzustellung und Stripe-Dashboard Tax-/Invoice-Konfiguration                                                         |
| 3   | In-Game Overlay vollständig   | Mittel    | 🟡 Separates transparentes Always-on-top-Tauri-Fenster ohne Game-Process-Injection + Tabs + persistente Overlay-Settings + konfigurierbarer Hotkey + AC-Fallback + FPS/GPU + Recharts-Performance + `/settings/performance?verify=overlay-fullscreen-anti-cheat-readiness` lokales Windowed-/Borderless-/Anti-Cheat-Research-Packet fertig                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | ~98%                                   | Echte External-Window-E2E auf Windowed-/Borderless-Titeln, lange Native-Sessions und Anti-Cheat-Kompatibilitätsevidenz; Injection bleibt außerhalb des Scopes     |
| 4   | Performance-Monitor Frontend  | Mittel    | 🟡 Overlay-Tab + Rust-Polling + GPU/NVML + Active-Game-Kontext + `overlay-runtime`-Attribution + PerfHistory + Buckets + ActivitySection + Recharts + 300-Sample Session-Flush-Contract + `/settings/performance?verify=overlay-e2e-readiness` lokale Overlay-E2E-Gates + Fullscreen-/Anti-Cheat-Research-Packet fertig                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | ~97%                                   | Live-/externes Overlay-E2E, lange Native/Supabase-Session-E2E, echte Fullscreen-/Anti-Cheat-Staging-Evidence                                                      |
| 5   | First-party Cloud Saves       | —         | ⚪ Entfernt: OG Launcher speichert, verschlüsselt, synchronisiert oder restauriert keine eigenen Cloud-Save-Archive mehr. Schema, Storage-Policies, UI und First-party-Cloud-Save-Pfade wurden entfernt; Plattform-/Provider-Clients bleiben verantwortlich.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Entfernt (kein Completion-Ziel)        | Keine Reaktivierung geplant; provider-native Cloud Saves sind der unterstützte Pfad                                                                               |
| 6   | Categories/Tags               | Mittel    | 🟡 DB + Layer + NewsPage + CategoryChips + Sidebar + Community-Activity-Board lokal fertig; `rollout-tracks` bleibt fuer hosted Community-Artwork-Rollout extern offen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | ~95%                                   | Echtes Staging gegen Profil-/Community-Feeds und hosted Community-Rollout-Evidenz                                                                                 |
| 7   | Mod-Management                | Mittel    | 🟡 Vollständige Engine + UI + DB + Steam-Workshop + mod.io/CurseForge Native-Suche + lokale/shared Provider-ID-Mappings + Provider-API-Mapping-Promotion + CurseForge/Overwolf-Handoff + redigierter single-result Provider-Staging-Probe + lokale Provider-Response-Shape-Review-Fixtures fertig                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | ~99%                                   | Reale API-Key-Stagingläufe mit echten Provider-Keys/Live-Antworten und Terms-/Rate-Limit-Freigabe                                                                 |
| 9   | DSGVO/Privacy                 | Hoch      | 🟡 Privacy-Settings-UI + Public-Profile-Privacy-Guard mit Client-Redaktion/RLS-Lane-Contract + AccountDataPrivacyPanel-Readiness + JSON-Export + Export-Coverage-Contract fuer neuere User-Daten + Export-Adapter-Coverage fuer Auth-/Read-Query-Shapes und Missing-Table-Warnings + Request/Cancel/Processor-Adapter-Coverage + 30-Tage-Löschanfrage + lokaler Processor-Dry-Run + Secret-/Limit-/Dry-Run-Contract + process-account-deletions HTTP-Handler-Coverage + `game-artwork` Storage-Cleanup-Coverage + `/settings/privacy?verify=deletion-processor-cron-dry-run-packet` + manueller Hosted-Deploy-Gate mit Dry-Run-Smoke fertig                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | ~96%                                   | Hosted Cron/Supabase Scheduled Deployment mit realem `ACCOUNT_DELETION_PROCESSOR_SECRET` + Staging-Verifikation                                                   |
| 10  | Echtzeit-Presence             | Mittel    | 🟡 Supabase-Realtime + Overlay-Tab + Plattform-Badges + Polling-Edge-Function + Deploy-Runbook + client-evidence-basiertes Settings-Readiness-Panel + lokale Cron-Config + Hosted-Deploy-Gate-/Scheduler-Handoff-Staging-Paket + Steam-/Bridge-Provider-Client-HTTP- und Rate-Limit-Mapping-Coverage fertig                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | ~95%                                   | Echtes Trusted Hosted-Cron-Projekt-Staging + reale Provider-Bridges ausser Steam                                                                                  |
| 11  | Custom Artwork                | Niedrig   | 🟡 rawg-assets EF + Source-Policy-Evidence + HTTP-Handler-Coverage, Rust-Cache, Drag-Drop-Upload, Auto-Artwork-Kandidaten mit Steam-CDN/App-ID-Policy, lokale Community-Artwork-Import-Galerie mit browser-lokalem Vote-Ledger, Hosted Community-Artwork v1, public Upload UI, Pending-Submission-Karten, private Moderator-Allowlist, Service-Role-Scan-/Review-RPCs, Trusted Live-Review-Endpoint mit HTTP-Handler-Coverage, deterministische Content-Scan-Evidenz, Provider-Source-Policy-Gate, lokale Steam/RAWG/Epic-Caps-Proof-Matrix, Approval-Gate, Moderator-Console-Preview und Audit-Ledger fertig                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | ~99%                                   | Provider-Staging mit echten RAWG-/Steam-/Epic-Screenshot-Nachweisen und Community-Rollout                                                                         |
| 12  | Backup & Restore              | Niedrig   | 🟡 Native Manifest-Backups + inkrementelle Copy/Restore + Restore-Review-Gate + ZIP-Archiv + Login-Autostart + Reminder + Headless OS-Timer + Folder-Picker + read-only Removable-Drive-Detection + consented Sentinel-Write/Read/Checksum/Delete-Proof + consented Eject-Safety-Preflight + consented lokaler OS-Eject/Unmount-Pfad mit finalem Preflight, Linux/macOS/Windows-Command-Backend und Mount-Verschwinden-Prüfung fertig                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | ~99%                                   | Externe-Drive-E2E auf echten Windows/macOS/Linux-Laufwerken                                                                                                       |
| 14  | Spielzeit-Tracking erweitert  | Niedrig   | 🟡 playtime.rs + idle.rs + Sessions + Editor + Settings-Aktivität + Activity→Performance-Querfilter + Performance-Bucket-Detailcharts + Activity-Recap-Share-Card fertig                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | ~96%                                   | Langzeit-E2E mit echten Native-/Supabase-Sessions                                                                                                                 |
| 16  | Custom-Link Invites           | Mittel    | 🟡 Deep-Link-Handler + `/invite/:token` Web-Fallback + CrossPlatformInvite Link-Readouts + RLS-safe `share_tokens` Create/Resolve/Redeem-RPC + signierter Token-Envelope + Unknown-Recipient-Claim + Invite-Hosted-Readiness + Hosted-Token-Rehearsal + Hosted-Replay-Origin-Proof-Contract + Migration-Contract-Evidence fertig                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | ~94%                                   | Externes Hosted-Web-/Supabase-Staging-E2E mit real deployter Token-Erstellung/Redemption und Live-Hosted-Origin-Replay-Proof                                      |
| 17  | Broadcasting Readiness        | Niedrig   | 🟡 Lokales `/community` Readiness-Panel fuer Capture-/Overlay-/Upload-/Chat-/VOD-Checks fertig; `/community?verify=broadcasting-rtmp-dry-run` zeigt ein redigiertes lokales RTMP-Dry-Run-Paket ohne Socket/Publish; `/community?verify=broadcasting-chat-moderation-shadow` zeigt eine lokale Chat-Moderation-Shadow-Queue mit redigierten Fixtures ohne Provider-Enforcement; `/community?verify=broadcasting-vod-archive-policy` zeigt lokale VOD-Retention-/Visibility-/Delete-Coverage-Policy ohne Provider-/Supabase-/Signed-URL-Ausfuehrung; `/community?verify=broadcasting-provider-oauth-contract` zeigt lokale OAuth-Contract-Fixtures fuer PKCE, State, Redirects, Scopes, Callback-Fehler, Token-Grenzen und Secret-Redaction ohne Provider-Auth-Redirect oder Token-Exchange; `/community?verify=broadcasting-provider-callback-contract` zeigt lokale Callback/Webhook-Contract-Fixtures ohne Hosted-Endpoint, Provider-Delivery, Supabase-Callback-Row, Replay-Runner oder VOD-Sync-Job; `/community?verify=broadcasting-live-session-rehearsal` zeigt die lokale Go-live-Reihenfolge mit Preflight-/Desktop-Vault-/Rollback-Review und blockierten OAuth-/RTMP-/Chat-/Moderation-/VOD-/Callback-/Audience-Status-Lanes; `/community?verify=broadcasting-audience-status-contract` zeigt einen lokalen Audience-/Live-Status-Vertrag fuer Preview-Labels, Stale-Fallback, Rollback-Clear, Provider-State-Events, Audience-Counts, Chat-Presence, Public-Status-Writes und Supabase-Audience-Row-Blocker ohne Provider-Read oder Public-Mutation; `/community?verify=broadcasting-provider-live-readiness` zeigt lokale Provider-/Live-Gates plus consented Desktop-Stream-Key-Vault ohne Twitch/YouTube-OAuth, RTMP-Ausgabe, stream-key Live-Nutzung, Hosted-Moderation, VOD-Sync oder Audience-/Live-Status-Claim | ~54%                                   | Echte Provider-OAuth-Ausfuehrung/Token-Exchange, RTMP-/Live-Ausgabe, Provider-Chat-Reads/-Moderation, VOD-Provider-Sync/-Archive, Provider-Callbacks und Live-E2E |

---

## 0. Embedded Client-Manager

> Ziel: Open Game Launcher ist ein vollwertiger Client-Manager für alle unterstützten Plattformen — nicht nur ein Aggregator. Erkennung laufender Clients, Status-Polling, Silent-Install, Auto-Updates und Client-Modifikationen (Pfad-Overlays, Asset-Cache, Mod-Wurzelverzeichnisse) sind im Scope. Client-Start erfolgt über die offiziellen URI-Protokolle der jeweiligen Plattformen.

### Bereits implementiert

- ✅ Client-Start via offizielles URI-Protokoll (Steam `steam://`, Epic `com.epicgames.launcher://`, GOG `goggalaxy://`, Xbox `xbox://`, Ubisoft `uplay://`, Battle.net `battle.net://`, EA `origin2://`)
- ✅ Plattform-spezifische Game-Detection in `commands/games/detect/{epic,steam}.rs` (Windows Registry, macOS Plist, Linux .desktop/.config)
- ✅ Library listet installierte Spiele mit Launcher-Source (Steam, GOG, Epic, Xbox, Ubisoft, Battle.net, EA)
- ✅ Login + Owned-Games-Flow für 7 Plattformen
- ✅ Cross-Plattform Source-Tracking über `game_external_ids` Tabelle
- ✅ Native Client-Health-Abfrage für Steam, Epic, GOG, Xbox, Ubisoft, Battle.net und EA mit Install-/Running-Status, PID und Startfähigkeit
- ✅ LibraryRow/GameDetails zeigen Source-Client-Status und können unterstützte Plattform-Clients starten

### Status und offene Tasks

#### 7-Plattform Client-Detection

- ✅ Pro Plattform: best-effort Installationspfad, Running-State und Startfähigkeit
- ✅ Version und Update-Verfügbarkeit sind über lokale Versionsdetektion, `latestKnownVersion`, Update-Policy und History abgedeckt; Client-Lifecycle-Polling ist in Settings konfigurierbar

#### Process-Status-Polling

- ✅ Plattform-spezifische Prozess-Detection (Steam = `steam.exe`, Epic = `EpicGamesLauncher.exe`, GOG = `GalaxyClient.exe`, etc.)
- ✅ Lifecycle-Events: Client-Poller emittiert `client_started`/`client_stopped`, Playtime-Poller emittiert `game_started`/`game_stopped`, Library reagiert mit Running-Chips und sofortigem Source-Client-Refresh
- ✅ Runtime-Metadaten: Client- und Game-Lifecycle-Events liefern PID, Prozessname und Uptime; Stopp-Events behalten die letzte bekannte Prozesskennung
- ✅ Live-Input-Metadaten: Playtime-Poller emittiert `game_runtime_updated` fuer laufende Spiele mit `lastInputSeconds`; Library aktualisiert den Game-Runtime-Strip ohne Playtime-/Supabase-Sync
- ✅ Window-Live-Events: Windows-Best-Effort ordnet laufenden Game- und Source-Client-Prozessen sichtbare Top-Level-Fenster zu; `client_window_updated` aktualisiert die Library ohne Status-Spam, non-Windows bleibt null

#### Library-Status-Indikatoren

- ✅ Source-Client-Statuschip und "Start client"-Button in Library-Detailansicht
- ✅ Kompakter Client-Statuschip in ausgewählter LibraryRow
- ✅ "Spiel läuft"-Badge, Running-Primary-State und Game-Runtime-Strip mit Prozessname, PID und Uptime
- ✅ Cross-Plattform-Konsolidierung: gruppierte Varianten zeigen `via Steam`/Provider im Running-State, wenn eine andere Source-Variante läuft
- ✅ Window-Handle/Fenstertitel erscheinen im Running-State fuer Game Runtime, Source Client und Settings Platform Health, sobald native Window-Zuordnung existiert

#### Silent-Install

- ✅ Safe Best-Effort-Flow: fehlender Plattform-Client öffnet offizielle Download-URI oder einen lokal konfigurierten Installerpfad; OG-Launcher lädt keine fremden Client-Binaries still herunter
- ✅ Lokale Installer-/Updaterpfade werden pro Client gespeichert und in der Library-Detailansicht als kompakter Client-Manager bedienbar
- ✅ Silent-Install-Staging-Preview: `preview_platform_client_install` klassifiziert `alreadyInstalled`/`localInstaller`/`officialDownload`/`blocked`, zeigt User-Consent-, Lizenz- und Admin-Checks und macht `No silent download`/`No auto-apply` in GameDetails sichtbar
- Bewusst nicht implementiert: echte Silent-Install-Ausführung nur pro Plattform mit explizitem User-Consent, Lizenzprüfung und offiziellem Provider-Mechanismus
- ✅ Lokale Auto-Apply-Capability-Checks fuer Runtime-/Client-Praesenz, Installationsziel, freien Speicher, Admin-Review und Desktop-Capability-Preview sind im Mount-/Apply-Contract enthalten; echtes Auto-Apply bleibt nur mit provider-approved Mechanismus, Terms Approval und expliziter Live-Provider-Freigabe erlaubt
- ✅ Eigenes Installationsmanifest pro Plattform; OG-managed Manifeste enthalten Formatversion, SHA-256-Dateien, optionalen Ed25519-Trust-Status und können in Release-/Staging-Flows per `OGL_INSTALL_MANIFEST_SIGNING_KEY` + `OGL_INSTALL_MANIFEST_KEY_ID` signiert werden
- ✅ UI: „Plattform fehlt → Installieren"-Flow in der Library öffnet sichere Quelle statt automatischem Download
- ✅ File Integrity: OG-managed Manifeste speichern `files[].sha256`; interne Downloads akzeptieren signierte Install-Manifest-Sidecars (`installManifestUrl`/`installManifestSha256`), Verify erkennt Same-Size-Hashfehler und Repair validiert `downloadSha256` sowie reparierte Dateien gegen das bestehende Manifest
- ✅ GameDetails-Settings zeigen Verify/Repair-Aktionen, Ergebnisstatus, Manifest-Trust (`missing/unsigned/signed/invalid`) und kurze Issue-Liste im Retro-Manga-Stil

#### Auto-Updates

- ✅ Best-effort Update-Status mit lokaler Versionsdetektion, manuell gepflegter `latestKnownVersion`, Update-Policy und History pro Client
- ✅ Library-Detailansicht kann offiziellen Updater/Client oder lokal konfigurierten Updaterpfad öffnen und Check-History schreiben
- ✅ App-lifetime 24h Hintergrund-Polling mit persistiertem Scheduler: `notifyOnly`/`openClient` aktivieren automatische Checks, History speichert Scheduled-Runs, GameDetails zeigt Last/Next Check und Header-Notifications melden gefundene Updates
- ✅ `openClient` öffnet bei Scheduled-Runs nur vorhandene sichere Updater-/Launch-Ziele nach erkannter Versionslücke, schreibt `auto_opened`/`auto_open_failed` in die History und nutzt keine offizielle Downloadseite als Auto-Open-Fallback
- ✅ Headless OS-Level Scheduler: per-user Windows Task Scheduler/macOS LaunchAgent/Linux systemd-user Timer startet den bestehenden Scheduled-Update-Check ohne GUI und schreibt Statusdatei
- ✅ Guarded Auto-Apply-Policy: `autoApply` wird gespeichert, aktiviert Scheduled Checks, rendert eine Auto-Apply-Guard-Karte und schreibt ohne offiziellen Provider-Mechanismus `auto_apply_blocked`, ohne Updater/Installer zu öffnen
- Offen: echter Auto-Download/Auto-Apply nur, falls ein offizieller, erlaubter Provider-Mechanismus existiert; aktuell bewusst nicht implementiert

#### Client-Modifikation

- ✅ Pfad-Overlays: Launcher kann alternative Asset-/Mod-Pfade pro Client lokal verwalten
- ✅ Asset-Cache-Pflege: gemeinsamer Cache über alle Clients, konfliktfreie Lookup-Tabelle mit Priorität und Konfliktvorschau
- ✅ Mod-Wurzelverzeichnisse pro Client lokal konfigurierbar: Steam `steamapps/workshop`, GOG `Galaxy-2.0-Plugins-Storage`, Epic `Mods/`, etc.
- ✅ Schutz-Metadaten: Read-Only-Flag pro Overlay wird gespeichert
- ✅ Path-Overlay-Apply-Preflight: GameDetails bewertet Path-Overlay-Drafts lokal auf fehlende Pfade, Root-/Drive-Targets, Same-Path-Paare, doppelte Targets sowie read-only/writable Review und zeigt eine ausdrueckliche Preflight-only Safety Card
- ✅ Mount-/Apply-Contract-Paket: `/settings?verify=client-manager-mount-apply-contract` zeigt Path-Overlay-Preflight, Asset-Cache-Lookup, Auto-Apply-Guard und eine 7-Provider-Apply-Policy-Matrix fuer Steam/GOG/Epic/EA/Ubisoft/Battle.net/Xbox mit No-provider-approved-launcher-apply- und Terms-not-approved-Evidence als lokale Review-Lanes; `/settings?verify=client-manager-mount-apply-sandbox-proof` beweist lokalen Sandbox-Copy/Manifest/Hash/Rollback auf Throwaway-Pfaden; Provider-Mechanismus, echte OS-Mount-Erstellung, Provider-Terms, Symlink/Junction, Admin-Elevation, Driver/Kernel, destruktive Writes, Live-Provider-Rollback/Unmount und Live-Client-Mutation bleiben explizit blockiert
- Offen: tatsächliches Mounting/Overlay-Anwendung; Asset-Cache bleibt bewusst Lookup-only, bis provider-/OS-sichere Mount-Regeln existieren

#### Tests + Telemetrie

- ✅ Focused Rust-Tests für Client-Klassifikation, Versionsvergleich, Config-Normalisierung und History-Capping
- ✅ Focused TS-Tests für Client-ID-Normalisierung und Desktop-Fallbacks
- ✅ Platform-Health-Score in Settings kombiniert Detection-Erfolgsrate, Login-Status und Update-Verfügbarkeit mit read-only Client-Checks
- ✅ One-Click-Setup-Readiness in Settings bündelt Desktop-Runtime, Installationsziel, Store-Links, Library-Seed, Backup/Restore und Cloud-Account-Evidence als lokalen New-PC-Setup-Tape
- ✅ `/settings?verify=one-click-setup-e2e-readiness` zeigt lokale Hosted-/Provider-E2E-Gates fuer Hosted Auth, Provider OAuth, Token Replay, Silent Install, Consent/Terms und Rollback Audit mit expliziten No-Claims fuer echte Hosted Auth, OAuth-/Token-Replay, provider-approved Silent Install, Consent/Terms Approval und Rollback/Audit-Proof
- ✅ `/settings?verify=one-click-setup-rollback-audit-contract` zeigt einen lokalen No-Write-Vertrag fuer Setup-Step-Ledger, Undo-/Cleanup-Order, Partial-Failure-Map und Audit-Envelope ohne Setup-Ausfuehrung, lokale Datei-Write/Delete, Supabase-Write, Audit-Persistenz, Provider-Client-Mutation, Token-/Keychain-Replay oder echten Rollback-Erfolg
- ✅ Window-Live-Event-Tests decken Game-Runtime-Fensterdaten, Source-Client-`client_window_updated` und Browser-Fallbacks ab
- ✅ Anonyme Nutzungsstatistik pro Plattform (nur lokal, opt-in): Settings-Panel speichert Zähler ausschließlich in `localStorage` und füllt sie aus Headless-Client-Update-Runs
- ✅ Deterministische Prozess-Snapshot-Tests decken Client-Namensmatching, PID/Pfad/Uptime und Window-Priorisierung ab
- ✅ Platform-Auth-Härtung: GOG/EA Tokens bleiben im nativen Secure Store, Settings/Friends/Provider entfernen alte Browser-Token-Kopien, GOG Friends liest den Backend-Token direkt und Epic nutzt nur noch einen nicht-sensitiven Session-Marker im Browser

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
- GOG hat einen Login-basierten Sync ueber die Galaxy-Gameplay-Achievement-Route; lokale Galaxy-/Sidecar-Unlocks werden in API-Definitionen zurueckgemerged.
- Epic versucht Legendary-Login-Metadaten (`legendary info --json`) vor lokalem Import und oeffentlichem Store-Fallback.
- GOG/EA/Epic Achievement-Verfügbarkeit vertraut nicht mehr auf echte Browser-Token-JSONs; GOG nutzt Cache-/Installationsnachweise, EA lokale Installation/Sidecars und Epic nur Cache bzw. den nicht-sensitiven Session-Marker.
- Lokaler best-effort Importer fuer JSON-Caches: `achievement-cache/<provider>/<game-id>.json`.
- Der lokale Importer prueft zusaetzlich bekannte Client-Cache-Wurzeln fuer GOG, Epic, EA, Ubisoft und Battle.net und sucht dort begrenzt nach plausiblen Achievement-/Stats-JSONs.
- EA/Ubisoft/Battle.net lokale Cache-Shapes: Stats-/Challenge-/Criteria-Felder wie `statName`, `challengeId`, `criteriaId`, `earnedAt`, `completionState`, `badgeUrl` und Progress-Prozentwerte werden fuer best-effort Unlock-Imports gelesen.
- Sidecar-Import aus Spielordnern: `og-achievements.json`, `achievements.json`, `<provider>-achievements.json` und `.og-launcher/*`.
- Sidecar-/Scraper-Format dokumentiert in `docs/references/achievement-sidecars.md`.
- Installierte best-effort Provider versuchen den lokalen Importer auch ohne Login, damit Sidecars nicht uebersehen werden.
- Epic Public-Fallback: Definitions/Rarity werden best-effort von oeffentlichen Epic Achievement-Seiten gelesen und lokal gecacht, ohne API-Key.
- GOG lokale Unlock-Overlays: API-Definitionsdaten bleiben primaer, lokale Galaxy-/Sidecar-Felder wie `achievement_key`, `date_unlocked` und `image_url_unlocked` werden gelesen und ueber stabile Source-Achievement-IDs gemerged.
- Epic lokale Unlock-Overlays: Legendary-/Store-Definitionsdaten bleiben primaer, lokale Epic/EOS-/Sidecar-Unlocks werden danach ueber stabile Source-Achievement-IDs in die Definitionen gemerged.
- Attestation-gated Achievement-Ingestion: normale Launcher-JWTs beweisen nur die User-Identitaet; `ingest-achievements` antwortet dafuer mit `202`, `trust: unverified` und `persistence: local_only` und schreibt weder globale Definitionen noch Unlocks, XP/Level oder Activity. Erst ein serverseitiger Relay mit dem mindestens 32 Zeichen langen `ACHIEVEMENT_INGESTION_ATTESTATION_SECRET` darf die service-role RPCs aufrufen. Diese leiten Punkte/Namen aus dem Katalog ab, verwerfen veraltete Provider-Snapshots und entfernen `launcher_device_id` aus allen oeffentlichen Metadaten. Production-strict mode behandelt `local_only` als Fehler; lokal bleiben die Providerdaten ehrlich im Cache erhalten. Deno- und Vitest-Coverage pinnen die Trust-Grenze, Fehlerweitergabe, Rarity-Hydration und die verbleibenden Playtime-Ausnahmen.
- Remote Achievement-Hydration: `/achievements` liest Supabase-Definitionen/User-Unlocks je echter Provider-Variante zurueck, merged sie vor `groupGames()` in die realen Games und aggregiert erst danach lokal, ohne synthetische `grouped-*` IDs remote zu verwenden.
- RLS-Haertung: normale authenticated Clients koennen `profiles.profile_xp`/`profile_level`, `user_achievements`, `achievement_progress` und `achievement_unlocked`-Feed-Posts nicht mehr direkt schreiben.
- Profile-Readonly-Contract: statischer Vitest pinnt, dass der Profile-Client Progression-Tabellen nur liest und der alte Direct-Write-TODO entfernt bleibt.
- Lokale Cache-Readiness: `/achievements?verify=achievement-cache-readiness` zeigt Cache-Folder-Handoff, Sidecar-Format-Map, lokale Parser-Coverage und Provider-Status-Matrix als deterministische lokale Review-Lanes und ueberspringt Hosted-Hydration in diesem Verify-Modus.

### Status und offene Tasks

- GOG: lokale Galaxy-/Sidecar-Unlocks werden mit API-Definitionen gemerged; offen bleibt Live-E2E gegen echte Galaxy-Clientdaten.
- Epic: lokale Unlocks werden mit Legendary-/Store-Definitionen gemerged; offen bleibt Live-E2E gegen echte Epic/EOS-Clientdaten.
- EA/Ubisoft/Battle.net: lokale Stats-/Challenge-/Criteria-Cacheformen werden geparst; offen bleibt Live-E2E gegen echte Clientdaten je Anbieter.
- Achievement Cache Readiness bleibt lokal-only: kein Provider-Sync, keine Hosted-Hydration, keine Supabase-Writes, kein OAuth-/Token-Exchange, kein Live-Unlock-Import, kein Remote-Cache-Job, keine Provider-Credentials und kein offizieller Unlock-Proof.
- Offen: echter Provider-verifizierender Relay und Hosted-Staging-E2E fuer Achievement-Ingestion/Hydration; `launcher_device_id` bleibt ausschliesslich lokal und ist kein Sicherheitsbeweis.

---

## 2. Store-Backend Frontend (S3)

> Quelle: Dieser Abschnitt ist die gepflegte Detailquelle; ein separater Detailplan ist im aktuellen Checkout nicht vorhanden.
> Bereits fertig: Migration `store_schema` (products, orders, cart_items, licenses, store_reviews etc.), Types, Supabase-Layer, Stripe-Command, DeveloperPortalPage, StorePage-Datenanbindung, serverseitiger Stripe-Checkout mit Attempt-Idempotenz, Webhook-Fulfillment mit stale Retry-Lease-Replay-Ledger, konflikt-idempotente Lizenz-Ausgabe, echte Stripe-Refund-Ausführung, Invoice-Staging/Sync, Offline-Stripe-Staging-Contract, Store-Edge-Contract-CI, Store-Readiness-Panel und verified Store Reviews

### Status und offene Tasks

#### StorePage mit echten Daten

`StorePage` nutzt `listPublishedProducts()` mit lokalem Preview-Fallback für Offline/Seed-losen Betrieb.

| Ansicht             | Beschreibung                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Home**            | Hero-Banner, Featured Sale, Neuerscheinungen                                                                         |
| **Durchstöbern**    | Filter: "Alle", "Free", "Sale", "Neu", "Top"                                                                         |
| **Produktseite**    | Cover, Beschreibung, Preis, SysReq, Reviews, Developer-Antworten und Report-Flow vorhanden                           |
| **Warenkorb**       | Cart-Tab, Badge und Cart-Drawer vorhanden                                                                            |
| **Bestellhistorie** | Käufe/Status, Lizenzprüfung, Invoice-/Tax-Status, Stripe-Sync, Refund-Ausführung und Store-Readiness-Panel vorhanden |

#### Checkout-Frontend

- ✅ Warenkorb/Buy Now → `stripe-create-checkout` mit extrahierter HTTP-Handler-Coverage fuer CORS/Auth/Body/Product/Ownership/Signing/Free/Paid/Rollback-Pfade plus Adapter-Coverage fuer Supabase/Stripe Query-Shapes, Duplicate-Attempts, Free-Fulfillment, Attach-/Session-/Cart-Fehler und Session-Projektion
- ✅ Client sendet nur `product_ids`; Preise/Titel werden serverseitig aus `store_products` gelesen
- ✅ `stripe-webhook` erfüllt `store_orders` nur bei bezahlten Checkout Sessions oder `async_payment_succeeded`, erstellt `store_licenses`, persistiert Stripe-Subtotal/Tax/Total/PaymentIntent, bereinigt den Warenkorb und dedupliziert signierte Events über `store_stripe_webhook_events`; Adapter-Tests pinnen Claim-Leases, Lease-Token-Finalizer, Order-/License-Fulfillment, Invoice-Persistenz und Refund-Ledger/Status; failed/stale-processing Events werden exklusiv neu geleast statt dauerhaft als in-flight Duplicate hängen zu bleiben
- ✅ Kostenlose Produkte werden ohne Stripe-Redirect direkt fulfilled
- ✅ Redirect-Bestellbestätigung verarbeitet `session_id`, öffnet Orders und aktualisiert Lizenzen/Downloads
- ✅ Download-Freischaltung: `store-download-build` Edge Function prüft aktive Lizenz und erstellt kurzlebige Signed URLs für `store-builds`; Adapter-Tests pinnen Auth, Lizenz-/Build-Query-Shapes, Storage-Signed-URL-Delegation und Fehler-Mapping ohne Live-Supabase
- ✅ `store-order-support` authentifiziert Nutzer, prüft Order-Ownership/Zahlstatus und führt Stripe-Refunds idempotent per PaymentIntent aus; HTTP-Handler-Guards pinnen Auth, Order-Ownership, Invoice-Sync, Refund-Statusbranches und Fehlerpfade ohne Live-Secrets; Adapter-Tests pinnen Order-/Refund-/Invoice-Query-Shapes, Refund-Staging-/Reject-Mutations und Stripe-Refund-Delegation
- ✅ Store Order Support Contract Evidence: Deno-CI pinnt Request-Parsing, Refund-Reason-Mapping, Stripe-Refund-Idempotency-Payloads, Adapter-Query-Shapes, Refund-Staging-/Reject-Mutations und Store Order Support HTTP-Handler-Guards ohne Live-Secrets
- ✅ Refund-Status wird über Stripe-Antwort/Webhook in `store_order_refund_requests` gespiegelt; erfolgreiche Refunds setzen Orders auf `refunded` und widerrufen Store-Lizenzen
- ✅ Offline-Stripe-Staging-Contract umgesetzt: Checkout setzt automatic tax, Tax-ID Collection, Billing Address Collection und Invoice-Creation/Invoice-Data; Checkout-Attempts sind per Client-UUID plus Stripe-Idempotency-Key dedupliziert; Adapter-Tests pinnen Checkout Query-Shapes, Duplicate-Attempt-Reuse, Free-Order-Fulfillment, Attach-/Session-/Cart-Fehler und Session-Projektion; Webhook persistiert Stripe subtotal/tax/total, PaymentIntent und Invoice-Links; Lizenz-Ausgabe akzeptiert parallele Duplicate-Key-Konflikte nur nach erneuter Prüfung aller erwarteten aktiven Lizenzen; Store UI zeigt das Stripe-Staging-Readiness-Panel
- ✅ Store Edge Contract Evidence: CI fuehrt Deno-2-Tests fuer Stripe-API-Version, Checkout-Tax/Invoice-Parameter, Checkout-Attempt-Idempotenz, Checkout-Adapter-Query-Shapes, Duplicate-Attempt-Reuse, Free-Fulfillment, Attach-/Session-/Cart-Fehler, Session-Projektion, Webhook-Replay-Ledger/stale Retry-Leases, Adapter-Claim/Finalizer, Order-/License-Fulfillment, Invoice-Persistenz, Refund-Ledger/Status, Active-License-Skip-before-Signing, Lizenz-Konflikt-Recovery, Preisdrop-Kandidatenauswahl, Store-Download-Ticket-Request-Parsing, Store-Download-Build HTTP-Handler-Guards und Store-Download-Build Adapter-Query-/Storage-Shapes ohne Live-Secrets aus
- Offen: Live-Stripe-Staging mit echter Webhook-Signaturzustellung sowie Tax-/Invoice-Konfiguration im Stripe Dashboard prüfen

#### Reviews

- ✅ Nur verifizierte Käufe/Lizenzen via Trigger + RLS
- ✅ 1 Review pro Nutzer/Produkt, 1-5 Sterne, Titel/Text, Rating-Aggregate
- ✅ Abuse-Schutz: Report-Tabelle/RLS, Rate-Limit 5/h, ≥3 aktive Meldungen blenden Reviews aus Rating/Listings aus
- ✅ Developer-Antworten: eine Antwort pro Review, Produkt-Developer-RLS, Inline-Anzeige und Editor im Store

#### Wishlist

- ✅ Store-Wishlist: `store_wishlist` speichert pro Nutzer `store_products`, RLS ist own-only, `StorePage` lädt/synchronisiert signed-in Remote-Wishlist und behält LocalStorage als Offline-/Anonymous-Fallback

#### Bestellhistorie + Lizenz-Validierung

- ✅ Bestellungen: Datum/Preis/Status, Line Items, Invoice-/Tax-Status, Download-Entitlement, Stripe-Invoice-Links, Stripe-Staging-Readiness und Refund-Ausführung vorhanden
- ✅ Tauri-Command `validate_license`: Ed25519 Offline-Token, Public-Key-Verifikation, 30-Tage-Ablauf, Plattform- und Gerätebindung
- ✅ Checkout/Fulfillment reicht Device-ID durch und stellt mit `OGL_LICENSE_SIGNING_KEY` signierte `OGL1`-Tokens aus; unsigned Fallbacks sind nur per expliziter Staging-Flag erlaubt, als `OGL-STAGING-UNSIGNED-*` gelabelt und nicht offline-valid

---

## 3. Externes In-Game Overlay (S4)

> Quelle: Dieser Abschnitt ist die gepflegte Detailquelle; ein separater Detailplan ist im aktuellen Checkout nicht vorhanden.
> Bereits fertig: separates transparentes Always-on-top-Tauri-Fenster mit 4 Tabs (Freunde/Chat/Erfolge/Performance), globaler Hotkey (Default Shift+F1, lokal konfigurierbar), Anti-Cheat-Scanning (13 AC), echte FPS-/GPU-Werte (DXGI + NVML). Es gibt keine Game-Process-Injection und sie ist kein Produktziel.

### Bereits implementiert

#### Overlay-Fenster & Hotkey

- ✅ `toggle_in_game_overlay` erzeugt ein separates Tauri-Fenster mit `transparent: true`, `always_on_top: true`, `decorations: false`, `skip_taskbar: true`; es wird nichts in einen Spielprozess injiziert
- ✅ Route `/overlay` mit vollständiger `OverlayPage.tsx` (4 Tabs)
- ✅ `Shift+F1` default via `tauri-plugin-global-shortcut` registriert
- ✅ Overlay Settings speichern Hotkey, Position und Opacity lokal in `overlay-settings.json`; `save_overlay_settings` registriert geänderte Hotkeys sofort neu
- ✅ Fullscreen-/AC-Fallback-Copy: blockierende Anti-Cheat-Prozesse zeigen ein Safety-Fallback-Deck mit Back-to-Game und FPS-HUD; der unterstützte Pfad bleibt ausschließlich das externe Fenster
- ✅ `/settings/performance?verify=overlay-fullscreen-anti-cheat-readiness` zeigt ein lokales Research-Packet fuer Windowed-/Borderless-/Fullscreen-Modi, Overlay-Settings und Anti-Cheat-Fallback-UX. Injection, Anti-Cheat-Bypass, Kernel-/Driver-Install und Protected-Process-Attach sind ausdrücklich außerhalb des Scopes; offen bleibt nur E2E-Evidenz des separaten Fensters auf realen Titeln

#### Anti-Cheat-Detection

- ✅ `anti_cheat.rs` scannt Prozesse auf Vanguard, FACEIT, BattlEye, EAC, ESEA, PunkBuster, XignCode, GameGuard, Arkos, Mihoyo Protect u.a.
- ✅ `is_overlay_blocked_by_anti_cheat()` als separater Command
- ✅ OverlayPage zeigt rote (blockiert) / gelbe (AC erkannt) Banner und bei blockierenden Prozessen ein Safety-Fallback-Deck statt einer falschen Sicherheitszusage

#### Overlay-UI (4 vollständige Tabs)

- **Freunde:** `getVisiblePresence` + `subscribeToPresenceChanges`, Online-Status, aktuelles Spiel
- **Chat:** Gruppenchats, `subscribeToGroupMessages`, Nachrichten senden
- **Erfolge:** Installierte Spiele mit Achievement-Progress-Bar
- **Performance:** CPU%, RAM MB, FPS (DXGI Frame-Pacing), Frame-Time, 4 Recharts-LineCharts, Uptime

#### Echte FPS/GPU-Werte

- ✅ FPS via `report_frame_rendered` in `perf_monitor.rs:33-55` (DXGI Frame-Pacing)
- ✅ GPU via NVML in `perf_monitor.rs:104-119` (Windows)
- ✅ `FpsHudPage` zeigt Live-Werte

### Status und offene Tasks

#### Recharts statt SVG-Sparkline

- ✅ 4 kompakte Recharts `<LineChart>` fuer CPU, GPU, FPS und Frame-Time mit 60 Samples

---

## 4. Performance-Monitor Frontend (S5)

> Quelle: Dieser Abschnitt ist die gepflegte Detailquelle; ein separater Detailplan ist im aktuellen Checkout nicht vorhanden.
> Bereits fertig: Migration `performance_metrics`, `perf_monitor.rs` (CPU+RAM+FPS+NVML-GPU), Types, Overlay-PerfTab mit echten Metriken + Recharts, Performance-History-Route mit persistierten Samples und Session-Aggregates

### Bereits implementiert

#### PerfMonitorTab im Overlay

- ✅ `poll_performance_metrics` pollt CPU%, RAM MB, FPS, Frame-Time, GPU und Uptime mit 1Hz bei aktivem Library-Spielkontext; Standalone/Idle-Overlay zeigt nur lokale Preview und startet kein natives Polling
- ✅ 4 MetricCards in 2×2 Grid: CPU, RAM, FPS, Frame
- ✅ 4 Recharts-LineCharts fuer CPU, GPU, FPS und Frame-Time (60 Samples)
- ✅ FPS via DXGI Frame-Pacing, GPU via NVML (Windows)

### Status und offene Tasks

#### PerfHistoryPage in Settings

- ✅ Route `/settings/performance`
- ✅ Filter: Tag / Woche / Monat / Jahr / Alle
- ✅ Chart/Tabelle für persistierte `performance_snapshots`
- ✅ Sidebar fuer `performance_sessions` mit Avg-FPS und Peak-RAM
- ✅ Spiel-Filter, Auto/Stunde/Tag/Woche/Monat-Buckets, Detailtabelle und Spielzeit-/Performance-Balken
- ✅ Overlay-Samples nutzen den aktiven Launch-Kontext, wenn ein Spiel aus der Library gestartet wurde
- ✅ Standalone Overlay-Sessions ohne aktiven Library-Launch werden explizit als `overlay-runtime` attributiert und nicht mehr als unaufgeloester Spiel-Fallback behandelt
- ✅ `/settings/performance?verify=overlay-fullscreen-anti-cheat-readiness` zeigt lokale Fullscreen-/Anti-Cheat-Research-Gates neben der Performance-History ohne native Anti-Cheat-Detection oder Overlay-Fenster-Start
- Offen: Live-/externes Overlay-E2E fuer die Standalone-Attribution

#### ActivitySection in Settings

- ✅ `ActivitySection` ist in `SettingsPage` gemountet und zeigt Spielzeit-/Session-Auswertung.
- ✅ Detailroute mit Datumsfiltern und Performance-Historie vorhanden.

#### Recharts statt SVG-Sparkline

- ✅ 4 Recharts `<LineChart>` mit 60 Samples im Overlay

#### Persistierung

- ✅ Overlay persistiert throttled Live-Samples in `performance_snapshots`
- ✅ Launches schreiben aktiven Spielkontext für Performance-Samples
- ✅ Overlay puffert bis zu 300 Performance-Samples und schreibt bei Overlay-Ende ein Session-Aggregate

---

## 5. First-party Cloud Saves (entfernt)

> Produktentscheidung: OG Launcher betreibt keinen eigenen Cloud-Save-Speicher. Spiele verwenden ausschließlich die Cloud-Save-Funktionen ihrer Plattform-/Provider-Clients.

### Entfernt

- ✅ First-party Upload-, Download-, Restore-, Auto-Sync-, Konflikt- und Verschlüsselungsoberflächen sind nicht mehr Teil der Launcher-UI.
- ✅ First-party Cloud-Save-Commands, Supabase-Helper und Keychain-/Crypto-Pfade wurden aus dem aktiven Produktpfad entfernt.
- ✅ Migration `20260708120000_remove_first_party_cloud_saves.sql` entfernt Storage-Policies, Bucket und Tabellen; `20260709151000_verify_removed_cloud_save_state.sql` verifiziert den entfernten Zustand.
- ✅ README und Feature-Plan führen First-party Cloud Saves nicht mehr als teilweise oder nahezu vollständig implementiertes Feature.

### Bewusst getrennt: lokaler Cross-Store-Dateitransfer

- Der vorhandene consent-gated Desktop-Apply-/Rollback-Proof kopiert ausschließlich explizit ausgewählte lokale Dateien zwischen Nutzerpfaden und belegt Hash/Manifest/Rollback lokal.
- Dieser lokale Dateitransfer ist kein Cloud-Save-Dienst, lädt keine Save-Archive zu OG Launcher hoch und reaktiviert keine entfernten Supabase-/Keychain-Pfade.
- Provider-Cloud-Import/-Export bleibt Aufgabe der jeweiligen Plattform-Clients und ist kein OG-Launcher-Completion-Ziel.

---

## 6. Categories/Tags (S8)

> Quelle: Dieser Abschnitt ist die gepflegte Detailquelle; ein separater Detailplan ist im aktuellen Checkout nicht vorhanden.
> Bereits fertig: Migration (categories, news_posts), Supabase-Layer, Types, NewsPage

### Offene Tasks

#### Categories/Tags + Library-Filter

- ✅ **CategoryChips:** Retro-Manga-Chips in GameDetails, Klick → vorhandene Library-Filter
- ✅ **Sidebar:** Checkbox-Liste aller Categories/Tags/Product-Typen, kombinierbar mit Suche

- ✅ Community-Activity-Board: `/community` zeigt funktionale Home/Discussions/Workshop/Market/Broadcasts-Tabs, Popular Hubs, People Search, Content-Filter, per-game Hub-Details, Diskussion-Replies, Workshop-Subscriptions, Market-Watch, Moderation-Queue, browser-lokale Create Posts und lokale Broadcasting-Readiness im Retro-Manga-Launcher-Stil

---

## 8. Mod-Management

> Quelle: Dieser Abschnitt ist die gepflegte Detailquelle; ein separater Detailplan ist im aktuellen Checkout nicht vorhanden.
> Bereits fertig: DB-Migrationen (mods_schema, mod_catalog_user_installs), Types, Supabase-Layer, Rust-Commands, ModsPage, ModInstallStore, Mod-Install-Engine (URL/Archive/Folder)

### Bereits implementiert

#### Rust-Backend

- ✅ `mod_install.rs`: Install, Enable, Disable, Uninstall, Queue-Management, Pause/Cancel
- ✅ `install_mod_from_url()`: Download + SHA256 + Extract + Manifest
- ✅ `scan_game_mods()`: Erkennt installierte Mods pro Spiel
- ✅ Provider: `DirectUrl`, `LocalArchive`, `LocalFolder`, `SteamWorkshop`, `Modio`, `CurseForge`
- ✅ `set_mod_provider_secret()`: API-Keys für mod.io/CurseForge
- ✅ `search_native_mods()`: mod.io/CurseForge API-Suche mit OS-Keychain-Keys und normalisiertem Ergebnisformat

#### Datenbank

- ✅ Migration `mods_schema.sql`: managed_mods, mod_profiles, mod_catalog, mod_catalog_versions
- ✅ Migration `mod_catalog_user_installs.sql`: mod_catalog_user_installs, mod_catalog_dependencies

#### Frontend (ModsPage)

- ✅ Vollständige `ModsPage.tsx` mit Provider-Filter, Suche, Game-Filter
- ✅ Install-Queue-Ansicht mit Fortschritt / Pause / Cancel
- ✅ Enable/Disable/Uninstall pro Mod
- ✅ API-Key-Eingabe pro Provider
- ✅ Native Provider Search für mod.io/CurseForge mit direkter Installation, wenn Provider-Download-URL vorhanden ist
- ✅ Lokale Provider-Game-ID-Hints: mod.io bevorzugt Library-/Title-Slugs, CurseForge zeigt nur explizite numerische IDs als nutzbar und Steam AppIDs als Referenz
- ✅ Persistente lokale Provider-ID-Mappings: manuell gespeicherte mod.io/CurseForge Game-IDs werden pro lokalem Spiel/Provider in LocalStorage bevorzugt, CurseForge nur numerisch
- ✅ Shared Provider-Katalog-Mapping: `mod_provider_game_mappings` speichert aktive mod.io/CurseForge Game-ID-Kandidaten mit RLS, Confidence/Source/Verified-Metadaten; Mods Browse nutzt shared Mappings vor Heuristik-Hints und kann lokale Mappings in den shared Catalog syncen
- ✅ Provider-API-Mapping-Promotion: echte nicht-leere mod.io/CurseForge API-Treffer speichern die normalisierte Provider-Game-ID automatisch lokal und promoten sie als `provider_api`/`high` mit Evidence-Metadaten in den Shared Catalog, ohne trusted `verified_at` zu setzen
- ✅ CurseForge/Overwolf-Handoff: Native Search Results ohne direkten Download tragen eine Provider-App-URL, `start_mod_install` delegiert per CurseForge-Projektseite und die UI zeigt `Overwolf`/`Open App`
- ✅ `/mods?verify=provider-api-key-staging` zeigt ein lokales Provider-API-Key-Staging-Readiness-Panel fuer Keychain, Provider-ID-Mapping, mod.io/CurseForge-Key-Gates, Rate Limits, Shared Catalog, Overwolf-Handoff, ein redigiertes single-result Request-Paket und lokale mod.io/CurseForge Response-Shape-Review-Fixtures mit Safe Fields, blockierten Direct-Archive-/CDN-Feldern, Handoff-Policy und Redaction-Grenzen; explizite No-Claims fuer echte Provider-Keys im Verify-Mode, Live API Calls, Hosted Moderation/Downloads, CurseForge-Direct-Downloads und Supabase-Key-Speicherung bleiben sichtbar
- ✅ `run_mod_provider_staging_probe()`: consented Desktop-Staging-Probe fuer mod.io/CurseForge mit OS-Keychain-Key, pageSize=1, redigierter Request-Telemetrie, API-Key-/Error-Redaction und nur Ergebnis-/Direct-URL-/Provider-App-Handoff-Zaehlern ohne Rueckgabe von Download-URLs
- ✅ `modInstallStore.ts` (Zustand): Queue-Status, Progress

### Offene Tasks

#### Steam Workshop

- ✅ `extract_steam_workshop_id` + `install_path.join("workshop")` in `mod_install.rs:1046-1083` ist real
- ✅ Workshop-Items werden mit korrektem Pfad und ID-Extraction installiert

#### CurseForge / Mod.io

- ✅ Native API-Suche für mod.io und CurseForge
- ✅ Provider-ID-Hints aus lokaler Library fuer mod.io/CurseForge im Browse-Tab
- ✅ Persistente lokale Provider-ID-Mappings aus dem Browse-Tab
- ✅ Shared Provider-Katalog-Mapping aus lokalen Library-IDs zu mod.io/CurseForge Game-IDs mit Sync-UI im Browse-Tab
- ✅ Provider-API-Mapping-Promotion aus echten nativen Suchtreffern mit `provider_api`/`high` Shared-Catalog-Evidence
- ✅ CurseForge/Overwolf-Handoff-Fallback fuer Ergebnisse ohne direkten Download
- Offen: reale API-Key-Stagingläufe mit echten mod.io/CurseForge-Keys und Live-Providerantworten, Terms-/Rate-Limit-Freigabe, gepruefte Provider-Telemetrie und Hosted Moderation/Download-Rollout

---

## 9. DSGVO/Privacy

> Bereits fertig: PrivacySettingsPage.tsx, ProfilePrivacyForm.tsx, Public-Profile-Privacy-Guard mit Client-Redaktion und RLS-Lane-Contract, Supabase-Layer (profile.ts), AccountDataPrivacyPanel, AccountDataPrivacyPanel-Readiness, JSON-Export Edge Function, Shared-Privacy-Runtime-Coverage fuer Auth/Admin-Client-Boundaries, Export-Coverage-Contract fuer neuere User-Daten, Export-Adapter-Coverage fuer Auth-/Read-Query-Shapes und Missing-Table-Warnings, 30-Tage-Löschanfrage/Storno Edge Functions mit Request-Adapter-Coverage fuer Auth, Active-Lookup, Create-Mutation und `23505`-Preservation sowie Cancel-Adapter-Coverage fuer Auth, Pending-Lookup und pending-only Mutation, trusted process-account-deletions Edge Function mit Processor-Adapter-Coverage fuer Due-Request-Query, Processing-Claim, Audit-Mutations, Auth-Delete, Evidence-Insert und rekursive Storage-Cleanup-Pfade, lokaler Dry-Run-Nachweis, Secret-/Limit-/Dry-Run-Contract, extrahierte HTTP-Handler-Coverage und sanitized Cron-Dry-Run-Packet

### Bereits implementiert

#### Privacy-Einstellungen

- ✅ PrivacySettingsPage.tsx mit vollständigem ProfilePrivacyForm.tsx
- ✅ Profil-Sichtbarkeit: Profil, Bibliothek, Achievements, Spielaktivitäten, Online-Status, Kommentare, Wunschliste
- ✅ Werte: Öffentlich / Nur Freunde / Privat
- ✅ Speicherung via `updateMyProfilePrivacy()` in Supabase
- ✅ Public-Profile-Privacy-Guard: `/u/localprivacy?verify=profile-privacy-guard`, redigierte Public-Viewer-Lanes, guarded Showcase-Placeholder, `lastSeenAt`-Redaktion und RLS-Contract fuer Parent-Profil + Lane-Sichtbarkeit
- ✅ Social-Link-Visibility-Guard: Profil-Social-Links haben per-link `public`/`friends_only`/`private` Sichtbarkeit, Public-Viewer-Filter im Client, Editor-Visibility-Auswahl und RLS-Contract fuer Parent-Profil + Link-Sichtbarkeit

### Status und offene Tasks

#### Datenexport (JSON)

- ✅ Settings/Privacy → JSON exportieren
- ✅ Shared-Privacy-Runtime-Coverage: Deno-CI pinnt required Supabase Env, Service-Role-Admin-Client, Bearer-Auth-Bridge, Anon-Key-Blocker und invalid-session Mapping ohne Live-Secrets
- ✅ Inhalt: Auth-Metadaten, Profile, Freunde, Spielzeit, Achievements, Bestellungen, Store-Lizenzen, Mods, Family, Presence/Activity soweit Tabellen vorhanden
- ✅ Family Sharing bleibt im lokalen Launcher nutzbar, wenn Supabase nicht konfiguriert ist: `/family` kann browser-lokale Relays erstellen, seeded Invite-Codes joinen, aktive Mitgliedschaft persistieren und die Retro-Manga-Launcher-Panels ohne Hosted-Erfolgsclaim anzeigen
- ✅ Export toleriert optional fehlende Tabellen mit Warnungen

#### Account-Löschung

- ✅ 30-Tage-Wartefrist als `account_deletion_requests`
- ✅ Storno für pending Requests
- ✅ Account-Deletion-Request/Cancel-Contract: Deno-CI pinnt Reason-Normalisierung, 1000-Zeichen-Limit, idempotente Pending-Request-Erkennung, Request-Adapter-Auth, Active-Lookup-Query, owner-scoped Create-Mutation, `23505`-Fehlerobjekt-Preservation, Cancel-Filter auf `id + user_id + pending`, Cancel-Adapter-Auth, Pending-Lookup-Query und pending-only Cancel-Mutation inklusive Fehlerdurchreichung
- ✅ Trusted Processor löscht bekannte User-Storage-Prefixes, ruft Auth Admin Delete auf und markiert Fehler als `failed`
- ✅ Processor-Dry-Run: `process-account-deletions` akzeptiert secret-gated `dry_run`, listet fällige Requests/Storage-Buckets und führt keine Storage- oder Auth-Deletes aus
- ✅ Processor-HTTP-Handler: Deno-CI pinnt CORS/Method-Guards ohne Env, Secret-vor-Body/DB, malformed JSON Default, Dry-Run Evidence, Claim-Skip, Completed, Delete-Failure und Audit-Failure-Pfade ohne Live-Supabase
- ✅ Processor-Adapter-CI: Deno-CI pinnt Due-Request-Query, Processing-Claim, Processing-only Audit-Mutations, Auth-Admin-Delete-Delegation, Evidence-Insert, rekursive Storage-Objektlöschung und Missing-Bucket-Handling ohne Live-Supabase
- ✅ Processor-Contract-CI: Deno-Tests decken Secret-Header/Bearer, Limit-Clamping, non-destructive Dry-Run-Antworten und `game-artwork` Storage-Cleanup-Coverage ab
- ✅ AccountDataPrivacyPanel zeigt Prozessor-Readiness, lokalen Dry-Run-Nachweis, Secret-/Cron-Status, sanitized `dry_run` Cron-Packet mit redacted Secret-Headers und verbleibende Hosted-Deployment-Blocker; `/settings/privacy?verify=deletion-processor-cron-dry-run-packet` erzwingt diesen lokalen Evidence-State ohne Supabase-Secrets
- ✅ `/settings?verify=hosted-cron-evidence-summary` zeigt die Account-Deletion-Scheduler-Lane neben Price-Drop und Presence als lokalen No-Write-Gate, bei dem stale/missing/dry-run Rows nicht als Live-Cron-Proof gelten
- ✅ Screenshot-Nachweis: `docs/verification/screenshots/privacy-deletion-processor-readiness.png`
- ✅ Screenshot-Nachweis: `docs/verification/screenshots/privacy-deletion-processor-cron-dry-run-packet.png`
- ✅ Manueller Hosted-Deploy-Gate (`docs/runbooks/hosted-deploy-gate.md`) enthält Deployment-Preflight, Function deploy plan und dry-run Smoke fuer `process-account-deletions`, ohne Accounts oder Storage zu löschen
- Offen: Hosted Cron/Supabase Scheduled Deployment mit realem `ACCOUNT_DELETION_PROCESSOR_SECRET` und Staging-Verifikation gegen echte Supabase-Instanz

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
- ✅ Plattform-Felder (`platform`, `platform_source`, `platform_game_id`, `platform_last_polled_at`) mit Fallback fuer alte Schemas
- ✅ FriendsList und ActivityFeed zeigen Plattform-/Source-Badges
- ✅ Friend-Dedup-Merge-Group-Contract: Suggestion-Acceptance nutzt vorhandene Ziel-`merge_group_id`, finaler Accepted-Status bleibt user-scoped, `og` ist in `platform_accounts`/`friend_links` erlaubt, und Auto-Match-Propagation ist per Owner + Plattform + Platform-Friend-ID begrenzt

### Offene Tasks

#### Plattform-Polling

- ✅ Edge Function `poll-platform-presence`: 60s Default-Cadence, Batch-Update, Steam-Web-API, Provider-Bridge-Fallbacks und Provider-Client-/Adapter-Coverage fuer Secret-/Runtime-Wiring, Platform-Account-/Existing-Presence-Queries, Cache-Updates, Presence-/Activity-/Evidence-Mutations, Steam HTTP, Bridge HTTP, Provider-Errors und Rate-Limits
- ✅ `presence_poll_runs` speichert service-role-geschriebene, client-lesbare Poll-Run-Evidence mit aggregierten Zaehlern, Trigger-Source, Plattform-/Status-Summaries und ohne Account-IDs, User-IDs, Tokens oder Spieltitel
- ✅ Deploy-/Secret-Runbook in README fuer `PRESENCE_POLL_SECRET` und `poll-platform-presence`
- ✅ Settings-Readiness-Panel zeigt Supabase-Client, Realtime-Vertrag, Polling-Function, Secret-Gate, client-lesbare `presencePollCache`-/`platform_last_polled_at`-Evidenz, neueste `presence_poll_runs`-Scheduler-Evidence, Trusted-Dry-Run-Review-Pakete, Hosted-Cron und Provider-Bridge-Abdeckung, ohne client-writable Evidence oder Dry-Run-Pakete als Hosted-Writeback zu werten
- ✅ `/settings?verify=presence-evidence` zeigt ein Hosted-Cron-Staging-Paket fuer `hosted_deploy_gate`, `hosted-staging`, `poll-platform-presence` Dry-Run-Smoke, User-Daten-No-Write-Assertions, `presence_poll_runs`-Evidence-Pflicht, Scheduler-Handoff-Body und Runbook-Link, ohne eine echte Scheduled-Run-Ausfuehrung oder Provider-Ausfuehrung zu claimen
- ✅ `/settings?verify=hosted-cron-evidence-summary` fasst Presence, Price-Drop und Account-Deletion als lokalen Scheduler-Evidence-Gate zusammen und blockiert fehlende, stale oder dry-run Rows ohne Secret-Material
- ✅ `/settings?verify=presence-evidence` zeigt eine lokale Provider-Bridge-Contract-Matrix fuer Epic/GOG/EA/Xbox/Battle.net/Ubisoft mit Request-/Response-Fixtures, Token-Redaction, Provider-Error-, Missing-Provider- und Rate-Limit-Pfaden, ohne Live-Provider-Coverage oder Writeback zu claimen
- ✅ Lokale Supabase-Config setzt `poll-platform-presence` auf `verify_jwt = false`, damit der secret-gated Cron-Vertrag im lokalen Deploy-Setup abgebildet ist
- ✅ Deno-Contract pinnt `dryRun`/`force` Boolean-Parsing, Limit-Clamping, User-ID-Filter, Plattform-Normalisierung, Trigger-Source, Steam-Web-API-Provider-Client, Bridge-Adapter-Mapping, Rate-Limit-Uebersetzung und sanitizierte Poll-Run-Evidence, damit Strings wie `"false"`, `"0"` und `"off"` keine Cron-Pfade aktivieren und unbekannte Plattformen nicht in Poll-Requests gelangen
- Offen: Hosted-Cron/Staging mit echter Supabase-Projektumgebung
- Offen: echte Provider-Bridges fuer Epic/GOG/EA/Xbox/Battle.net/Ubisoft

#### Plattform-Anzeige in Freundesliste

- ✅ Freundesliste: "spielt Fortnite auf Epic/Steam/etc." mit Badge und Unknown-Fallback
- ✅ Library-Footer `Friends & Chat +` routet direkt nach `/friends?tab=chat`
- ✅ Roster-Aktionshandoff: Freundeskarten bieten direkte Chat-, Smart-Join- und Invite-Aktionen; lokale Preview und konfigurierte FriendsList routen ueber die bestehenden Chat-/Invite-/Join-Flows
- ✅ Friend Activity Feed zeigt Plattform-Badges aus Metadata
- ✅ Dedup-Merge-Groups bleiben owner-scoped; automatische Matches werden nicht zwischen Nutzern geteilt, selbst wenn Plattform und Platform-Friend-ID gleich aussehen

---

## 11. Custom Artwork

> Bereits fertig: rawg-assets Edge Function mit Source-Policy-Evidence, HTTP-Handler-Coverage, Adapter-Env/Auth/Fetch-Coverage, Rust-Cache, Drag-Drop-Upload und explizites Anwenden von Auto-Artwork-Kandidaten in GameDetails

### Bereits implementiert

- ✅ `supabase/functions/rawg-assets/handler.ts`/`adapters.ts`/`index.ts`: Ruft Cover-Art von RAWG-API ab, liefert RAWG-Provider-Policy-Evidence fuer importierte Medien und ist per HTTP-Handler- plus Adapter-Env/Auth/Fetch-Coverage gepinnt
- ✅ Asset-Caching in Rust-Backend (`rawg_asset_cache_path`)
- ✅ `lib/custom-artwork.ts`: Custom-Artwork-Logik, Steam-URL-Kandidaten mit CDN/App-ID-Policy-Evidence, Launcher-Art-Kandidaten und Deduplizierung
- ✅ Drag-Drop-Upload in `GameDetails.tsx` + Handler in `useLibrarySync.ts`
- ✅ `ArtworkPreviewModal`: Vorschau vor Übernahme
- ✅ Auto-Artwork-Grid in `GameDetails.tsx`: Cover/Icon/Logo-Kandidaten mit Thumbnail, Replace/Apply-Aktion und Persistenz über `useLibrarySync`
- ✅ Lokale Community-Artwork-Import-Galerie in `GameDetails.tsx`: kuratierte lokale Cover/Icon/Logo-Einträge mit statischen Votes-/Download-Metadaten, browser-lokalem Vote-Ledger, Import-Zustand und Persistenz über den bestehenden Custom-Artwork-Apply-Flow
- ✅ Hosted Community Artwork v1: `community_artwork_items`, `community_artwork_votes`, `community_artwork_reports`, `game-artwork` Storage, RLS, approved-feed RPC, authenticated Vote-RPC, Report-/Moderation-Queue-RPC, Ranking-Sync und Launcher-Helper mit lokalem Fallback
- ✅ Public Upload UI in `GameDetails.tsx`: Hosted Upload Queue mit Datei-Guardrails, Submit-for-Review-Pfad und Pending-Submission-Karten vor Freischaltung
- ✅ Service-Role-Scan-/Review-Vertrag: private Moderator-Allowlist, service-role-only Moderation-Queue-/Scan-/Review-RPCs, Scan-Result-History, Approval-Gate und Audit-Ledger fuer Scan-/Review-Entscheidungen
- ✅ Trusted Live-Review-Endpoint: `community-artwork-moderation` Edge Function validiert User-JWT, prueft `private.community_artwork_moderators`, ruft service-role Queue-/Scan-/Review-RPCs serverseitig auf, injiziert Reviewer serverseitig und ist per HTTP-Handler-Coverage fuer CORS, Methode, Auth, Parser, inactive Reviewer, List, Review, Scan und Fehlerpfade gepinnt
- ✅ `/library?verify=hosted-community-artwork`: Retro-Manga-Readiness-Panel fuer Schema/RLS, Storage, Client Helper, Vote Persistence, Moderation Queue, Ranking Sync, Upload UI, Moderator Console, Live Review Endpoint, Content Scanning, Provider Artwork, lokale Steam/RAWG/Epic-Caps-Proof-Matrix, Audit Logging und explizite Guards gegen ML-/unvetted-Provider-/Provider-API-/Rollout-Claims
- ✅ Moderator Console Preview in `GameDetails.tsx`: lokale Pending-/Reported-/Rejected-Queue, Review-Preview-Aktionen und Audit-Ledger ohne Service-Role-Key im Browser
- ✅ Focused Tests fuer Custom-Artwork-Kandidaten und Kind-Erkennung

### Offene Tasks

- Provider-Staging mit echten RAWG-/Steam-/Epic-Artwork-Daten und Screenshot-Nachweis
- Community-Rollout fuer Hosted Community Artwork

---

## 12. Backup & Restore

> Kein Sub-Plan. Aus Feature-Plan Section 3.12.

### Bereits implementiert

- ✅ Native Tauri-Commands `preview_backup_plan`, `run_backup_plan`, `preview_restore_plan`, `restore_backup`, `get_latest_backup_status`
- ✅ Manifestformat mit SHA-256, Dateigröße, mtime, Quellwurzel, Game-ID und Library-Data-Einträgen
- ✅ Inkrementelle Copy: unveränderte Dateien werden übersprungen, entfernte Dateien im Plan markiert
- ✅ Restore-Plan mit Create/Overwrite/Unchanged/Blocked/Missing-Status und Safety-Copy vor Überschreiben
- ✅ Pfadsicherheit: absolute Backup-Ziele, kein `..`, Restore-Allowlist aus aktueller Library/Launcher-Datenbank
- ✅ Settings-Panel im Retro-Manga-Stil mit Target Path, Preview, Backup, Restore-Plan, Restore und Manifeststatus
- ✅ Restore Review Gate: Restore ist erst nach sauberem Plan aktiv, blockiert `blocked`/`missing_backup`, pinnt `manifestPath` und zeigt Safety-Copy-/Skipped-/Failed-Ergebnisdetails
- ✅ App-lifetime Backup-Reminder mit LocalStorage-Persistenz, täglicher/wöchentlicher Fälligkeit, Header-Notification, Snooze und Mark-Done
- ✅ Nativer Tauri-Dialog für Zielordnerauswahl, beschränkt auf `dialog:allow-open` im Hauptfenster
- ✅ Optionale ZIP-Archiv-Erstellung pro Backup-Plan unter `.og-launcher-backups/archives`, ohne den geprüften Restore-Payload-Pfad zu verändern
- ✅ OS-Login-Autostart-Catch-up: Autostart-Plugin, Settings-Control, expliziter Auto-run bei fälligem Reminder und Header-Erfolg/Fehler
- ✅ Headless OS-Scheduler: per-user Windows Task Scheduler/macOS LaunchAgent/Linux systemd-user Timer, native Config-/Statusdateien, Headless-Startargument vor Tauri-Startup und Settings-Controls
- ✅ Read-only Removable-Drive-Detection: native Disk-Metadaten liefern Mount, Kapazität, Filesystem, Kind sowie Removable/Read-only-Flags; `/settings?verify=backup-external-drive-detection-mounted` zeigt eine gemountete Fixture ohne Write-/Restore-Claims
- ✅ Removable-Media-Sentinel-Proof: UI sendet expected Mountpoint + expliziten consented `sentinel_write_read_checksum_delete`-Payload; Rust schreibt, liest, hasht und löscht den Sentinel auf dem gematchten removable Mount
- ✅ Eject-Safety-Preflight: UI sendet expected Mountpoint + expliziten consented `flush_write_delete_before_eject_review`-Payload; Rust schreibt, flushed/synct, liest, hasht, löscht den Sentinel, prüft ausstehende Proof-Dateien und übergibt danach bewusst an OS-Eject/Unmount
- ✅ OS-Eject/Unmount-Pfad: UI sendet expected Mountpoint + Proof-ID + expliziten consented `os_eject_unmount_removable_target`-Payload; Rust führt direkt vor dem OS-Kommando einen finalen Sentinel-Preflight aus, nutzt shell-freie Linux/macOS-Kommandos sowie Windows `Win32_Volume.Dismount` über PowerShell ohne `cmd.exe`, verlangt Windows-Drive-Roots und meldet Erfolg nur, wenn der Mount danach nicht mehr gelistet ist
- ✅ Focused Rust-/TS-Tests für Manifest-Diff, Pfadsicherheit, Helper-Aggregation, Restore-Gate-, Reminder- und Scheduler-Artefakt-Zustände

### Offene Tasks

- Externe-Drive-E2E auf Windows/macOS/Linux mit echten Laufwerken

---

---

## 14. Spielzeit-Tracking erweitert

> Erweiterung des implementierten Basis-Trackings (playtime.rs).

### Bereits implementiert

- ✅ `playtime.rs` (Rust): Basis-Spielzeit-Erfassung
- ✅ `game_sessions` Tabelle in Supabase
- ✅ `idle.rs` (Windows `GetLastInputInfo`, Linux `xprintidle`, macOS-Stub): Plattform-spezifische Idle-Erkennung
- ✅ `useUserPlaySessions` Hook: Sessions abrufen
- ✅ `PlaytimeEditorPanel`: Manuelle Korrektur von Spielzeit
- ✅ `ActivitySection` in SettingsPage: Recharts-Auswertung fuer Sessions/Top-Spiele
- ✅ ActivitySection Top Games verlinken nach `/settings/performance?range=<1d|7d|30d|365d>&gameId=<id>&bucket=auto&source=activity#playtime-detail`; `PerfHistoryPage` liest Query-Filter, zeigt den Activity Filter und fokussiert `#playtime-detail`
- ✅ `/activity`: lokales Game Activity Dashboard mit Gaming-Year-Recap, Jahresfilter, Top-Games, Monats-Tape, Zeit-/Wochentagsmuster, aktivem Tages-Streak und Browser-Fallback-Demo-Sessions
- ✅ Activity Recap Sharing: `/activity` erzeugt eine lokale Share-Card mit `OG-Launcher Gaming Year`-Text, SVG-Datei-Payload, Browser-Share-Handoff mit Text-Fallback, Copy-Status, SVG-Export und TXT-Export-Link, ohne Supabase/Hosting oder echte Social-Ziel-Integration vorauszusetzen
- ✅ `/settings/performance` zeigt Tag/Woche/Monat/Jahr-Filter, Spiel-Filter, Snapshot-Tabelle, Bucket-Detailcharts und Session-Aggregate

### Status und offene Tasks

#### Session-Historie Charts

- ✅ Tages-/Wochen-/Monats-/Jahresübersicht und Detailcharts fuer Spielzeit/Performance
- ✅ ActivitySection→Performance-History Querfilter fuer Range, Game, Auto-Bucket und Zielanker umgesetzt
- ✅ Game Activity Dashboard Screenshot-Nachweise: `docs/verification/screenshots/game-activity-dashboard-yearly-recap-local-preview.png`, `docs/verification/screenshots/game-activity-dashboard-yearly-recap-local-preview-mobile.png`, `docs/verification/screenshots/game-activity-dashboard-yearly-recap-sharing-local-preview.png`
- ✅ Screenshot-Nachweis: `docs/verification/screenshots/activity-performance-crossfilter-target.png`
- ✅ Trusted Playtime-Ingestion: `ingest-playtime` Edge Function validiert Auth-User, schreibt `user_game_stats`/`game_sessions` via service_role und der Launcher bevorzugt den Function-Pfad vor direkten Staging-Writes; Production-strict mode blockt direkte Aggregate-/Session-Fallback-Writes, Deno-Adapter-Coverage pinnt Auth-, Catalog-, Session-Conflict-, Aggregate-Upsert- und Session-Insert-Grenzen, plus statischer Migration-Contract fuer verbleibende DB-Ausnahmen
- ✅ Attestation-gated XP-/Achievement-Ingestion: Launcher-JWTs bleiben `local_only`; nur ein serverseitig attestierter Relay darf Definitionen/Unlocks/XP/Level via service_role schreiben. RLS/Grants blockieren direkte Writes, Katalogdaten bestimmen die XP, Provider-Cursor verhindern veraltete Snapshots und Deno-Tests pinnen Auth-, Attestation-, RPC- und Privacy-Grenzen.
- Offen: echter Provider-Relay und Hosted-Staging-E2E vor Production; `launcher_device_id` wird nicht in Hosted-/Social-Metadaten gespeichert.
- Offen: Langzeit-E2E mit echten Native-/Supabase-Sessions

---

## 16. Custom-Link Invites

> Ziel: Spiel-Einladungen sollen als App-Deep-Link und Web-Fallback teilbar sein, ohne private `game_invites`-RLS-Grenzen zu öffnen.

### Bereits implementiert

- ✅ Tauri Deep-Link-Parser akzeptiert `oglauncher://join?game=...&platform=...&invite=...`
- ✅ `useDeepLink` routet Join-Links in die Library und `LibraryPage` startet den Cross-Play-Join mit Invite-Kontext
- ✅ `/invite/:token` Web-Fallback-Seite zeigt den Invite-Token-Envelope, Game/Platform-Kontext und den App-Deep-Link im Retro-Manga-Stil
- ✅ `CrossPlatformInvite` erzeugt nach erfolgreichem `game_invites`-Insert Web-Fallback- und App-Deep-Link-Readouts mit Copy/Open-Aktionen
- ✅ `share_tokens` Migration speichert nur `sha256`-Hashes, schützt die Tabelle per RLS/no-`anon`-grant und erzeugt Public Tokens nur über `create_game_invite_share_token`
- ✅ Neue Public Tokens nutzen eine `ogl_<header>.<payload>.<signature>` Huelle; die Signatur dient Format-/Tamper-Erkennung, waehrend `token_hash` plus `game_invites` weiterhin die Autoritaet fuer Resolve/Redeem bleiben
- ✅ `resolve_share_token` erlaubt anonymes minimales Token-Resolve für Web-Fallback-Kontext, ohne direkte `game_invites`-Reads zu öffnen
- ✅ Frontend fällt bei fehlender RPC auf den Legacy-Invite-ID-Link zurück und ersetzt ihn bei Erfolg durch den Server Share Token
- ✅ `redeem_share_token` akzeptiert server-verifizierte Tokens fuer bekannte Empfaenger oder offene `receiver_id = null` Share Links, sperrt Token+Invite per `for update`, setzt beim ersten Claim `receiver_id = auth.uid()`, setzt `game_invites.status = accepted` und verbraucht eine Token-Nutzung
- ✅ `/invite/:token` zeigt fuer eingeloggte Empfaenger einen Accept-Flow mit Success/Error-Zustand
- ✅ `CrossPlatformInvite` kann per Share-Link-Modus einen one-use Link fuer noch nicht bekannte signierte Empfaenger erstellen; der erste erfolgreiche Accept claimed den Invite
- ✅ Invite-Hosted-Readiness: `/invite/:token` zeigt Web-Fallback, App-Deep-Link, Share-RPC, Receiver-Auth und Hosted-Web-Gates mit lokalem Blocker statt Hosted-Erfolg vorzutäuschen
- ✅ Hosted-Token-Rehearsal: `/invite/:token` zeigt Create-Token-, Resolve-Token-, Receiver-Auth-, Redeem-Token- und Replay-Guard-Evidenz mit No-Raw-Token-/No-Anonymous-Invite-Row-/No-Hosted-Success-Guards, ohne externe Hosted-E2E zu behaupten
- ✅ Hosted-Replay-Origin-Proof-Contract: `prove_share_token_replay_denial` und `invite-hosted-proof` pruefen authenticated receiver/sender, erlaubte HTTPS-Origin, konsumierten one-use Token, abgelehnten zweiten Redeem und sanitized Proof-Packets ohne Raw-Token-/Hash-Echo; Deno-CI pinnt zusaetzlich HTTP-CORS/Origin/Method/Auth/Body/Proof/Replay-Guards im extrahierten Handler plus Adapter-Tests fuer Auth-Bridge, Origin-Config und RPC-Payloads
- ✅ Statischer Migration-Contract-Test prueft RLS/no-client-table-grants, private Signing-Keys, Envelope-Validierung, Unknown-Recipient-Claim-Regeln, Replay-Denial-Guards und den Hosted-Proof-RPC fuer Share Tokens
- ✅ Screenshot-Nachweise: `docs/verification/screenshots/friends-custom-link-invite-fallback.png`, `docs/verification/screenshots/friends-custom-link-invite-compose.png`, `docs/verification/screenshots/friends-custom-link-invite-server-token.png`, `docs/verification/screenshots/friends-custom-link-token-lookup.png`, `docs/verification/screenshots/friends-custom-link-accept-success.png`, `docs/verification/screenshots/friends-custom-link-token-envelope.png`, `docs/verification/screenshots/friends-custom-link-unknown-recipient-accept-success.png`, `docs/verification/screenshots/friends-custom-link-hosted-readiness-local.png`, `docs/verification/screenshots/friends-custom-link-hosted-token-rehearsal-local.png`, `docs/verification/screenshots/friends-custom-link-hosted-token-rehearsal-local-mobile.png`, `docs/verification/screenshots/friends-custom-link-hosted-replay-origin-proof.png`, `docs/verification/screenshots/friends-custom-link-hosted-replay-origin-proof-mobile.png`

### Offene Tasks

- Hosted-Web-/Supabase-Staging mit realer Token-Erstellung/Redemption und Live-Hosted-Origin-Replay-Proof gegen deployte Infrastruktur

---

## Spätere Erweiterungen

> Konzepte ohne konkreten Implementierungsplan.

| Feature                                     | Scope | Beschreibung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Client Manager Mount/Apply Contract**     | Lokal | `/settings?verify=client-manager-mount-apply-contract` zeigt lokale Contract-Lanes fuer Path-Overlay-Preflight, Asset-Cache-Lookup, Auto-Apply-Guard, lokale Auto-Apply-Capability-Checks fuer Runtime-/Client-Praesenz, Installationsziel, freien Speicher und Admin-Review, eine read-only native Capability-Preview, eine 7-Provider-Apply-Policy-Matrix fuer Steam/GOG/Epic/EA/Ubisoft/Battle.net/Xbox, Provider-Mechanismus, OS-Mount-Sandbox, Rollback/Unmount, Provider-Terms, Symlink/Junction, Admin-Elevation, Driver/Kernel, destruktive Client-Writes und Live-Client-Mutation; `/settings?verify=client-manager-mount-apply-sandbox-proof` zeigt lokalen Sandbox-Copy/Manifest/Hash/Rollback-Proof fuer Throwaway-Pfade; echte Provider-Mount-Anwendung, Provider-Auto-Apply, echte OS-Mount-Erstellung, Symlink/Junction-Erstellung, Admin-Elevation, Driver-/Kernel-Install, destruktive Writes, Terms Approval, Live-Provider-Rollback/Unmount und Live-Client-Mutation bleiben blockiert                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **In-Game Overlay (Windowed/Borderless)**   | Lokal | Unterstützt wird ausschließlich das separate transparente Always-on-top-Tauri-Fenster. Offen sind reale Windowed-/Borderless-E2E-Läufe, Positionierung/Fokus über verschiedene Monitore und lange Native-Sessions; Game-Process-Injection ist ausdrücklich kein Ziel.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Overlay Fullscreen/Anti-Cheat Readiness** | Lokal | `/settings/performance?verify=overlay-fullscreen-anti-cheat-readiness` dokumentiert Modus-Inventar, Overlay-Settings und sicheren Anti-Cheat-Fallback für das externe Fenster. Injection, Bypass/Evasion, Driver-Install und Protected-Process-Zugriff sind außerhalb des Scopes; offen bleiben reale External-Window-, Live-Title- und Kompatibilitätsevidenz.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **One-Click Setup**                         | Lokal | Settings zeigt lokalen New-PC-Setup-Tape; `/settings?verify=one-click-setup-e2e-readiness` zeigt lokale Hosted-/Provider-E2E-Gates; `/settings?verify=one-click-setup-rollback-audit-contract` zeigt einen lokalen No-Write-Vertrag fuer Setup-Step-Ledger, Undo-/Cleanup-Order, Partial-Failure-Map und Audit-Envelope; echte Hosted Auth, Provider-OAuth-/Token-Replay, Provider-approved Silent Install, Consent/Terms Approval, Production Hosted Deployment und echter Rollback/Audit-Proof bleiben offen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Cross-Store Save Copy**                   | Lokal | `/library?verify=cross-store-save-sync` dokumentiert einen lokalen Review-/Dry-Run-Pfad und consent-gated Desktop-Apply-/Rollback-Proof für explizit ausgewählte lokale Dateien mit Target-Snapshot, Apply-Manifest, Unchanged-Target-Guard und SHA-256-Verifikation; `prove_cross_store_save_local_e2e` nutzt dafür ausschließlich eine temporäre lokale Sandbox. Das ist kein Cloud-Save-Dienst: keine OG-Launcher-Buckets, keine Supabase-/Keychain-Staging-Probe, keine Provider-Cloud-Ausführung und keine automatische Migration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Activity Recap Sharing**                  | Lokal | Browser-Share-Handoff mit lokalem SVG-Datei-Payload, Text-Fallback, SVG-Export, TXT-Export und Copy-Share-Karte fuer das lokale Gaming-Year-Dashboard sind umgesetzt; Hosted-Share-URLs und echte Social-Ziel-Integrationen bleiben spaeter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Backup/Restore External Drive**           | Lokal | `/settings?verify=backup-external-drive-readiness` zeigt lokale External-Drive-Gates fuer Target Folder, Folder Picker, Manifest Preview, Restore Review, ZIP Archive, Headless Timer, Windows-Eject-Backend, Sentinel-Write/Read/Checksum/Delete-Proof, Eject-Safety-Preflight und OS-Eject/Unmount-Result; `/settings?verify=backup-external-drive-detection-mounted` zeigt read-only Removable-Target-Detection; `/settings?verify=backup-external-drive-write-proof` zeigt Removable-Target-Metadaten plus Write-Proof-Fixture; `/settings?verify=backup-external-drive-eject-safety-proof` zeigt Write-Proof plus Eject-Safety-Fixture; `/settings?verify=backup-external-drive-os-eject-proof` zeigt lokalen OS-Unmount-Result; Windows/macOS/Linux-Backup-Restore-E2E auf echten Laufwerken bleibt offen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Plugin-System**                           | Lokal | Settings zeigt ein lokales Plugin-System-Readiness-Panel mit read-only Desktop-Manifest-Folder-Scan, Browser-JSON-Import, Manifest-, statischer Policy-, Permission-, Theme-Hook- und Marketplace-Gates plus lokalem Manifest-/Permission-/Policy-Ledger mit deny-by-default Unknown-Permission-Evidence; die Signed-Package-Staging-Konsole prueft Package-Pfad plus explizite Consent-Operation, signed lokale Plugin-Packages koennen mit Ed25519-Signatur, Datei-Hashes, Pfad-/Symlink-Guards und Consent in eine disabled Registry gestaged werden, `/settings?verify=plugin-disabled-registry-audit` zeigt native Disabled-Registry-Audit-Evidence, die Stage-Record, Hashes, Signatur, Path-Containment und Symlink-Guards vom browser-lokalen Display-Cache trennt, `/settings?verify=plugin-runtime-sandbox-process-boundary` zeigt nativen Runtime-Sandbox-Process-Boundary-Proof, der die disabled Registry erneut auditiert, EntryPoints vor Code-Load verweigert, keine Permissions grantet, `codeExecuted false` belegt und 8 lokale Escape-Fixtures fuer Path-Traversal, Symlink-Entrypoints, Nested-Manifest-Pfade, Deny-All/Network-IPC, Environment-/Filesystem-Versuche und Permission-Escalation vor Code-Load blockt, native Activation-Plan-Review verlangt exakte `review_plugin_activation_plan:<plugin>@<version>`-Consent, auditiert die disabled Registry erneut, hasht das staged Manifest fuer saubere Packages und blockt Ausfuehrung, Download, Install, Netzwerk und Permission-Grants bis eine Production-Sandbox existiert, native Update-Signing-Envelope-Review prueft Ed25519-signierte Envelopes gegen eine saubere disabled Registry, blockt Auto-Install, verlangt Rollback-Metadaten und Manifest-Hash-Matches, `/settings?verify=plugin-update-signing-review` zeigt lokales Update-Signing-Review fuer signierte Update-Envelopes, Manifest-Hashes, Rollback-Metadaten und geblockte Auto-Install-Pfade, und `/settings?verify=plugin-marketplace-update-index-trust` zeigt lokales signiertes Marketplace-/Update-Index-Trust-Packet fuer signierte Index-Envelopes, Publisher-Key-Fingerprint, Disabled-Registry-Match, Freshness-/Rollback-Metadaten, Channel-/Version-Constraints und geblockte Install-/Download-/Execute-Lanes; echtes Plugin-Laden/-Ausfuehren, Marketplace, Production-Signing-Trust, Live-Update-Channels, Update-Downloads, Auto-Update-Installation und Production-Sandbox-Haertung bleiben offen |
| **Themes/Skins**                            | Lokal | `/settings/profile/customize` bietet eine browser-lokale Retro-Manga-Shell-Skin-Umschaltung fuer Header, Navigation, Main Shell und Desktop Title Bar plus Default-Skin-Reset, Invalid-ID-Fallback, lokale Profil-Theme-Presets, Draft-Persistenz, gehosteten Built-in-Shell-Skin-Preference-Sync ueber `profiles.app_shell_skin` und validierten Custom-Theme-Draft-Sync ueber `profiles.custom_theme_json`; `/settings/profile/customize?verify=theme-skins` zeigt die Profil-Theme-Readiness; `/settings/profile/customize?verify=app-wide-theme-readiness` zeigt lokale App-wide-Gates fuer Profil-Presets, lokalen Draft, Design-Guard, Shell-Skin, schema-validiertes Custom-Theme-I/O, Hosted Sync und Rollback; Live-Profile-Theme-Katalogpersistenz, Marketplace-Skins und Marketplace-Rollback-Proof bleiben offen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **IGDB Cross-Play Import**                  | Lokal | `/library?verify=igdb-cross-play-readiness` zeigt lokale Mapping-/External-ID-Gates fuer IGDB-foermige Plattformdaten plus einen staged Import-Preview-Envelope mit review-only `game_cross_play`-Rows, `games.external_ids`-Patch, Skip-Gruenden und Duplicate-/Conflict-Review fuer externe-ID-Source-Keys und Plattform-Rows; echte IGDB-API-Nutzung, Supabase-Writes, Provider-Telemetrie, Hosted Sync und Live-Cross-Play-Verifikation bleiben offen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Achievement Cache Readiness**             | Lokal | `/achievements?verify=achievement-cache-readiness` zeigt lokale Cache-Folder-, Sidecar-, Parser- und Provider-Status-Lanes ohne Provider-API-Call, Hosted-Hydration, Supabase-Write, OAuth-/Token-Exchange, Live-Unlock-Import, Remote-Cache-Job, Provider-Credentials oder offiziellen Unlock-Proof; `/achievements?verify=achievement-hosted-hydration-contract` zeigt einen lokalen No-Write-Vertrag fuer authentifizierte Supabase-Read-Shape, Provider-Key-Filterung, Catalog-Game-Resolution, Definition/Unlock-Merge und Fallback-to-local-Verhalten, waehrend Live-Hosted-Staging, Supabase-Writes, Provider-Sync, OAuth-/Token-Exchange, Remote-Cache-Jobs, Trusted-Ingestion-Calls, Live-Unlock-Import und offizieller Unlock-Proof blockiert bleiben                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Community Local Posts**                   | Lokal | `/community` hat einen browser-lokalen Create-Post-Composer fuer den Relay Board Feed; lokale Posts werden oben einsortiert und nur gekappt in localStorage gespeichert; `/community?verify=community-create-post` liefert deterministische In-Memory-Evidenz ohne localStorage-Write; Hosted Publishing, Supabase-Feed-Writes, Provider-Sync und Moderation-Ausfuehrung bleiben offen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Community Activity Board**                | Lokal | `/community` zeigt funktionale Home/Discussions/Workshop/Market/Broadcasts-Tabs, Section-Board, Popular Hubs, People Search, Content-Filter, Activity Feed, browser-lokale Create Posts, Squads, Leaderboard und lokale Broadcasting-Readiness                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

---

## Performance-Ziele

| Metrik              | Ziel                              |
| ------------------- | --------------------------------- |
| Startup             | <2 Sekunden                       |
| RAM (Idle)          | <200 MB                           |
| CPU (Hintergrund)   | Minimal, kein Polling im Idle     |
| GPU                 | Optional, deaktivierbar           |
| Overlay-Open        | <100ms nach Hotkey                |
| PerfMonitor-Polling | 1 Hz (während Spiel), 0 Hz (Idle) |

---

## Technische Herausforderungen

> Nur noch für offene Features relevant.

| Herausforderung            | Ansatz                                                                                                                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Overlay bei Anti-Cheat** | Process-Scanning + DB `game_anti_cheat` + Fallback: Externes Fenster / Toast                                                                                                                                                  |
| **Overlay bei Fullscreen** | Separates Always-on-top-Fenster mit sicherem Toast/Fallback; keine Game-Process-Injection. Reale External-Window-Kompatibilität bleibt E2E-Arbeit.                                                                            |
| **Realtime-Presence**      | Supabase Realtime + Edge Functions für Plattform-Polling (60s). Caching gegen Rate-Limits.                                                                                                                                    |
| **Store-Payment**          | Stripe checkout via `stripe-create-checkout`/server-priced Redirect ist lokal implementiert; live Stripe-Webhook-Delivery, Dashboard-Tax/Invoice-Verifikation und Hosted-Price-Drop-Scheduler-Evidence bleiben externe Gates. |
| **Idle-Erkennung**         | Windows: `GetLastInputInfo`. macOS/Linux: `xprintidle`. Fallback: Maus/Tastatur-Hook.                                                                                                                                         |
| **Mod-Management**         | Jede Plattform eigenes API. Priorität: Steam Workshop (größte Nutzerbasis).                                                                                                                                                   |

---

> Letztes Update: Siehe Git-Log. Nächste Schritte werden in diesem Dokument gepflegt.
