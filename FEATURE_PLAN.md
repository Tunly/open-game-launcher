# Open Game Launcher — Lokaler Fertigstellungsplan + externe Evidenz

> **Ziel:** Übersicht aller lokal fertiggestellten, lokal gestagten und extern
> evidenzpflichtigen Features.
> Bereits implementierte Features sind in `docs/PROJECT_DESIGN.md` und im Code dokumentiert.
>
> **Prinzipien:** Modular, Cross-Platform, offline-resilient für Launcher- und
> Accountdaten, Open-Source (AGPL-3.0). Spielstände werden ausschließlich über
> die jeweiligen Plattform-/Provider-Clients synchronisiert; OG Launcher bietet
> keinen eigenen Cloud-Save-Dienst mehr an.
>
> **Lokale Evidence-Grenze:** `/settings?verify=external-completion-evidence-summary`
> zeigt Hosted Cron, Provider-Live, Hardware/OS und Rollout als
> lokalen No-Write-Nachweisplan mit Env-Namen, Artefaktpfaden und
> Proof-Anforderungen. Die dort gelisteten Gates bleiben offen, bis die echten
> externen Artefakte aus `docs/runbooks/external-completion-evidence.md`
> vorliegen.

---

## Auditierter Produktstand (2026-08-10)

Dieser Abschnitt ist die maßgebliche Kurzfassung für den aktuellen Checkout.
Er wurde gegen Frontend, Tauri-Commands, Supabase-Migrationen/-Functions,
Removal-Contract-Tests und die fünf externen Completion-Gates geprüft. Frühere
subjektive Prozentwerte wurden entfernt; Statusangaben unterscheiden jetzt
zwischen lokaler Implementierung, Verify-/Staging-Pfad, echter
Implementierungslücke, externer Evidenz und bewusst entferntem Scope.

| Bereich                                               | Aktueller Stand                                                 | Einordnung / verbleibende Grenze                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop-Shell und Retro-Manga-UI                      | Lokal implementiert                                             | Tauri-2-Shell, Header-Navigation und das in `docs/PROJECT_DESIGN.md` festgelegte visuelle System sind aktiv; der Tailwind-4-Static-Contract schützt die zentralen Design-Tokens.                                                                                                                                                                                                                                                                                                                                                                                                                |
| Library und Downloads                                 | Lokal implementiert                                             | Native Erkennung, Cache, manuelles Hinzufügen, Start/Move, Collections, Integritätsprüfung, persistente Last-Played-Aktivität, Download-Queue und externe Launcher-Verfolgung sind aktiv. Das Game-Options-Dossier trennt ausgewählte Kopie und gruppenweite Metadatenaktionen.                                                                                                                                                                                                                                                                                                                 |
| Plattformbibliotheken                                 | Lokal implementiert, Provider-Evidenz offen                     | Steam, GOG, Epic/Legendary, Xbox, PC Game Pass, Ubisoft, Battle.net und EA sind in der Provider-Pipeline. Xbox-Paketartwork wird app-lokal materialisiert, TitleHub-Artwork bleibt erhalten, und Game-Pass-Enrichment nutzt Store-IDs vor konservativem Titel-Fallback. Live-Provider-Nachweise bleiben Teil von `provider-live-integrations`.                                                                                                                                                                                                                                                  |
| Store                                                 | Lokal implementiert                                             | Der materialisierte `store_catalog`-Katalog wird serverseitig mit ITAD entdeckt und bepreist und mit IGDB-Metadaten angereichert. Katalog, Wishlist, Reviews und Preisalarme bleiben aktiv. Der OG Launcher verkauft keine Spiele selbst und besitzt keinen eigenen Warenkorb, Checkout, keine Lizenzen und keine Refund-Abwicklung. Aktionen leiten ausschließlich an offizielle Plattform-Stores weiter.                                                                                                                                                                                      |
| Achievements                                          | Lokal implementiert, Hosted-Relay vorhanden; Provider-E2E offen | Steam/Xbox-Sync, PC-Game-Pass-Katalogtitel, lokale Provider-Archive, Cross-Platform-Aggregation, Providerstatus, Sidecars, Epic-Fallback, Supabase-Hydration und ein providerweiser Sync-Koordinator sind vorhanden. Steam-Account-Linking per OpenID und ein attestierter Hosted-Relay sind implementiert; Live-Provider-E2E bleibt offen. Pop-up-Benachrichtigungen wurden bewusst entfernt.                                                                                                                                                                                                  |
| Community                                             | Normale Route gehostet; Review-Hubs lokal                       | `/community` lädt echte Supabase-Aktivität des eigenen Accounts und akzeptierter Freunde, schreibt eigene `friends_only`-Statusposts und bindet Reaktionen sowie Kommentare an. Hub/Workshop/Market/Broadcasting-Fixtures und der lokale Create-Post-Beleg sind ausschließlich explizite `?verify=...`-Reviewpfade.                                                                                                                                                                                                                                                                             |
| Activity und Performance                              | Freundes-Feed und Recap lokal implementiert; Game-FPS offen     | `/activity` ist der echte Freundes-Feed für Spiel-, Achievement-, Store- und Status-Aktivität. Reaktionen und Kommentare sind über RLS-geschützte Tabellen/RPCs und Realtime angebunden; der bisherige Jahresrückblick liegt unter `/activity/recap`. CPU-Prozentwerte nutzen einen persistenten sysinfo-Delta-Sampler. HUD-FPS bleibt als Webview-Proxy klar beschriftet; echte Game-FPS bleiben offen.                                                                                                                                                                                        |
| Profile, Social und Family                            | Teilweise gehostet, Fallback klar begrenzt                      | Auth, Profile, Privacy/RLS, Friends und Chat besitzen Supabase-Pfade. Direct-/Group-Room-Erstellung, Blocked-DM-Zugriff, Social-Link-Ersatz und Invite-Status sind über atomare RPCs/RLS gehärtet. Family-Preview behauptet keine Lizenzleihe, Cross-Device-Mitgliedschaft oder Seat-Enforcement.                                                                                                                                                                                                                                                                                               |
| Game Actions und Client Automation                    | Capability-Vertrag lokal; Live-Evidenz offen                    | Ausgewählte Kopien erhalten explizite Support/Verify/Repair/Update/Uninstall/Remove/Open-Provider-Fähigkeiten, native Ziel-Revalidierung und aktionsgebundene Bestätigung. Die semantische Windows-UI-Automation ist im Standard-Build aktiv und bleibt bei unbekannten oder mehrdeutigen Clientstrukturen fail-closed; die AutomationSession-State-Machine und die Linux/macOS-Backends sind hinter nicht-default Features (`automation-session`, `linux-atspi`, `macos-axuielement`) verfügbar, aber nicht im Standard-Build. Reale Client-/OS-/Locale-Kompatibilität bleibt externe Evidenz. |
| Client Manager, Presence, Backup, Artwork und Invites | Lokale Implementierung/Staging vorhanden                        | Sichere lokale Pfade sind implementiert. Normales Custom Artwork ist ausschließlich lokal pro ausgewählter Kopie. Provider-approved Apply/Mount, Hosted Cron, Cross-OS-Drive-E2E und Hosted-Invite-E2E bleiben offen.                                                                                                                                                                                                                                                                                                                                                                           |
| Plugin-System und Broadcasting                        | Readiness/Verträge, kein Live-Produktpfad                       | Plugin-Packages bleiben in einer disabled Registry und werden nicht ausgeführt. Broadcasting bleibt auf Verify-Routen ohne echte OAuth-, RTMP-, Chat-, VOD- oder Audience-Mutation.                                                                                                                                                                                                                                                                                                                                                                                                             |
| Entfernte Produktfeatures                             | Abgeschlossen entfernt                                          | First-party Cloud Saves, Controller-Support, Screenshot-Capture/-Galerie und Achievement-Popups sind bewusst außerhalb des Produkts; Removal-Migrationen und Boundary-Tests verhindern eine versehentliche Wiederaufnahme.                                                                                                                                                                                                                                                                                                                                                                      |
| Release                                               | Nicht freigegeben                                               | `hosted-supabase-cron`, `provider-live-integrations`, `hardware-os-e2e` und `rollout-tracks` bleiben bis zur externen Evidenz offen. Ein frischer vollständiger `pnpm completion:gate` ist vor einer Freigabe erforderlich.                                                                                                                                                                                                                                                                                                                                                                     |

## Aktive Arbeitspakete

Die Tabelle oben ist der aktuelle Produktstand. Für die Fertigstellung bleiben
nur Arbeiten relevant, die eine echte Produktlücke schließen oder einen der
externen Release-Nachweise liefern.

### Produktlücken

- **Client Manager:** Provider-freigegebene Apply-/Mount-Mechanismen,
  Terms-Freigabe und reale Client-/OS-Kompatibilität. Fremde Client-Binaries
  werden nicht automatisch heruntergeladen.
- **Store:** Katalog-, Review-, Wishlist- und Preisalarm-E2E bleiben aktiv. Der Katalog wird über `sync-store-catalog` aus ITAD und IGDB materialisiert. Entwicklerportal, eigene Produktveröffentlichung und Entwicklerantworten sind kein aktiver Store-Verkaufsweg. Der OG Launcher verkauft keine Spiele selbst, stellt keinen eigenen Warenkorb oder Checkout bereit und erzeugt keine Lizenzen, Bestellungen oder Refunds. Aktionen leiten ausschließlich an offizielle Plattform-Stores weiter.
- **Achievements:** Live-E2E für GOG, Epic, EA, Ubisoft und Battle.net sowie
  der externe Nachweis für Steam-Account-Linking und den Hosted-Relay.
- **Presence:** gehosteter Scheduler und reale Nicht-Steam-Provider-Bridges.
- **Invites:** gehosteter Web-Fallback und realer Create/Resolve/Redeem/
  Replay-Nachweis.
- **Backup/Restore:** E2E auf realen Windows-, macOS- und Linux-Laufwerken.
- **Overlay/Performance:** echte externe Window-/Session-E2E. Game-Injection,
  Anti-Cheat-Bypass und Kernel-/Treiberintegration bleiben außerhalb des
  Produkts.
- **Privacy:** Deployment und Scheduler-Nachweis für den
  Account-Deletion-Processor.
- **Cross-Play:** gehostete Zuordnungsevidenz. Der IGDB-Import ist bereits Teil der Store-Katalog-Synchronisierung.
- **Plugin/Broadcasting:** erst Produktumfang, wenn eine Production-Sandbox
  beziehungsweise echte Provider-OAuth-/RTMP-Integrationen existieren.

Lokale `?verify=...`-Routen und Fixture-Pakete sind Review- und
Vertragsnachweise. Sie ersetzen keine gehostete, Provider-, Hardware- oder
OS-Evidenz.

## Externe Release-Gates

Alle vier Gates bleiben offen, bis die redigierten Artefakte den Preflight
bestehen:

| Gate                         | Erforderlicher Nachweis                                            |
| ---------------------------- | ------------------------------------------------------------------ |
| `hosted-supabase-cron`       | reale Scheduler-Runs für Price Drop, Presence und Account Deletion |
| `provider-live-integrations` | reale Provider-, Library-, Achievement- und Presence-Nachweise     |
| `hardware-os-e2e`            | Overlay-, Backup-/Restore- und OS-/Hardware-E2E                    |
| `rollout-tracks`             | Marketplace-/Deployment-/Rollback- und Release-Artefakte           |

Verbindlicher Ablauf und Artefaktfelder:
[`docs/runbooks/external-completion-evidence.md`](./docs/runbooks/external-completion-evidence.md).

```bash
pnpm completion:gate:status
pnpm completion:gate:local
pnpm external:evidence:preflight
pnpm completion:gate
```

Ein lokaler erfolgreicher Lauf ist keine Release-Freigabe. Eine Freigabe
erfordert einen frischen vollständigen `pnpm completion:gate`-Lauf mit allen
externen Nachweisen.

## Bewusst außerhalb des Produkts

Diese Features sind entfernt oder ausdrücklich kein aktiver Produktpfad:

- First-party Cloud Saves und launcher-eigene Save-Archive
- Controller-Support
- Screenshot-Capture und Screenshot-Galerie
- Achievement-Popups
- mod.io, CurseForge, freie URL-/Archiv-/Ordner-Modimporte und Provider-Key-UI
- automatische oder gehostete Community-Artwork-Auswahl im normalen
  Game-Details-Pfad
- Game-Process-Injection, Anti-Cheat-Bypass und echte Game-FPS-Behauptungen
- Live-Plugin-Ausführung ohne Production-Sandbox
- Broadcasting ohne echte Provider-Integration

Diese Grenzen dürfen nicht durch Demo-Daten, Verify-Routen oder lokale
Fixtures als implementiert dargestellt werden.

## Qualitäts- und Performance-Ziele

Die Ziele bleiben Richtwerte, bis reproduzierbare Benchmarks auf unterstützter
Hardware vorliegen:

- Kaltstart unter 2 Sekunden
- UI-Reaktion unter 100 ms
- RAM im Idle unter 200 MB
- CPU im Idle unter 1 %
- ausführbare Paketgröße unter 50 MB

Vor Änderungen sind die betroffenen Frontend-, Rust-, Supabase- und
Route-Checks aus [`README.md`](./README.md#checks) auszuführen. UI-Änderungen
müssen dem Retro-Manga-System aus
[`docs/PROJECT_DESIGN.md`](./docs/PROJECT_DESIGN.md) entsprechen.
