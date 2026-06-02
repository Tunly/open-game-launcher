# Open Game Launcher — Feature-Plan
> **Ziel:** The Universal Game Launcher — Open Game Launcher vereint alle großen PC-Stores (Steam, Epic, GOG, Battle.net, EA App, Ubisoft Connect, Xbox etc.) in einer Oberfläche — plus ein eigener Game Store.
>
> **Prinzipien:** Modular, Cross-Platform, Offline-resilient (Cloud-Sync mit Local-Cache), Open-Source (AGPL-3.0).
---
## 0. Embedded Mode Strategy (Light Version)

**Prinzip:** Open Game Launcher ist ein smarter Aggregator, kein Client-Manager. Die Original-Store-Clients (Steam, Epic, EA, Ubisoft, Battle.net, Xbox, GOG) bleiben unter der Kontrolle des Users. Open Game Launcher **erkennt** sie, **startet** sie bei Bedarf, und **überwacht** den Spiel-Prozess. Open Game Launcher installiert, modifiziert oder updated Original-Clients nicht.

### Light Version — Default-Verhalten

**Was Open Game Launcher macht:**
- ✅ **Detektion:** Erkennt installierte Original-Clients (Registry, Standard-Installationspfade, plattformspezifische Pfade)
- ✅ **Status-Polling:** Prüft ob Client läuft (Process-Detection alle 1-2s bei Bedarf)
- ✅ **Start bei Bedarf:** Startet nicht-laufende Clients via offizielles URI-Protokoll
- ✅ **Spiel-Prozess-Überwachung:** Polling des Spiel-Prozesses nach Launch (Spielzeit, Crash-Detection)
- ✅ **Auth-Trigger:** Öffnet Browser-Login via `universallauncher://callback`-Redirect
- ✅ **Token-Management:** Cached nur Session- und Refresh-Tokens verschlüsselt im OS-Keychain — keine Passwörter

**Was Open Game Launcher NICHT macht (Light):**
- ❌ Silent-Installation von Original-Clients
- ❌ Auto-Update der Original-Clients
- ❌ Modifikation der Client-Installation
- ❌ Token-Eingriff in fremde OAuth-Flows
- ❌ Auto-Erhöhung von Admin-Rechten

**Drei Laufzeit-Situationen:**

| Situation | Open Game Launcher Verhalten |
|---|---|
| Client läuft bereits | Macht nichts — startet direkt das Spiel |
| Client läuft nicht, ist installiert | Startet Client via offizielles URI (`steam://`, `com.epicgames.launcher://`, ...), wartet auf Bereitschaft, startet Spiel |
| Client ist nicht installiert | Zeigt klaren Hinweis: "Steam ist nicht installiert" + Button "Steam herunterladen" → Browser-Redirect auf offizielle Download-Seite |

### Plattform-Setup-Matrix (Light)

| Plattform | Install-Detection | Start-Protokoll | Min-Client-Pflicht |
|---|---|---|---|
| Steam | Registry, Standard-Pfade | `steam://run/<appid>` | Ja (VAC, Steamworks, Anti-Cheat) |
| Epic | Standard-Pfade | `com.epicgames.launcher://apps/<id>?action=launch&silent=true` | Ja (Easy Anti-Cheat, eigenes DRM) |
| GOG | Standard-Pfade | Direkter `.exe`-Start | Nein |
| EA App | Standard-Pfade, Registry | `origin2://game/launch?offerIds=<id>` | Ja |
| Ubisoft Connect | Standard-Pfade, Registry | `uplay://launch/<id>` | Ja |
| Battle.net | Standard-Pfade, Registry | `battle.net://<region>/<game>` | Ja |
| Xbox (App) | Microsoft Store Pfad | `ms-xbl-<game>://` | Ja |

### Client-Status-Tracking

Jeder Client hat einen Live-Status, der in der UI angezeigt wird:

```
ClientInfo {
  client: "steam" | "epic" | "gog" | "ea" | "ubisoft" | "battlenet" | "xbox"
  installed: bool
  running: bool
  version: string | null
  install_path: string | null
  last_checked: timestamp
}
```

**Status-Indikatoren in der UI:**
- ✓ **Steam läuft** (grünes Badge / Teal-Akzent im Retro-Manga-Design)
- ⏵ **Steam starten…** (Spinner / Cyan-Akzent)
- ⚠ **Steam nicht installiert** (gelbes Badge / Red-Akzent mit Link)

### Anti-Cheat-Kompatibilität

Light Version ist **automatisch Anti-Cheat-safe**:
- VAC, BattlEye, Vanguard, EAC benötigen zwingend ihren Client — der ist installiert
- Open Game Launcher greift nicht in den Client ein → Anti-Cheat sieht keine fremde Software
- Game-Launch via offizielles URI-Protokoll ist Standard-Verhalten
- Keine Hooking-Injection, keine Memory-Manipulation, keine Process-Hijacks

### Sicherheit & Privacy
- Session-Tokens im OS-Keychain (Windows Credential Manager, macOS Keychain, Linux Secret Service)
- Keine Passwörter gespeichert oder übertragen
- Original-Clients kommunizieren direkt mit ihren Plattformen — Open Game Launcher agiert nur als UI-Layer und URI-Router
- Alle plattform-spezifischen Datenflüsse (Achievements, Friends, etc.) laufen über die offiziellen APIs

### Was NICHT im Scope ist (bewusst ausgeschlossen)

- **Silent Install:** Würde gegen die ToS von Valve, EA, Ubisoft verstoßen
- **Auto-Update der Clients:** Wäre Eingriff in fremde Software
- **Volle Account-Verwaltung:** Open Game Launcher triggert Browser-Login, verwaltet aber keine fremden Credentials
- **DRM-Bypass:** Wird nicht versucht; falls ein Spiel den Client zwingend braucht, ist das so

---
## 1. Kern-Features
### 1.1 Universal Game Library
#### Game Discovery & Import
Jeder Scanner extrahiert: ID, Name, Installationspfad, EXE-Pfad, Prozess-Namen (für Spielzeit-Tracking), Launcher-spezifische Launch-Parameter.
**OS-spezifische Pfade:**
| OS | Scan-Quellen |
|----|-------------|
| Windows | Registry (`HKCU\Software\Valve\Steam` etc.), `%ProgramData%\`, `%APPDATA%\` |
| macOS | `~/Library/Application Support/Steam/`, `.app`-Bundles unter `/Applications/`, `plist`-Dateien |
| Linux | `~/.steam/`, `~/.local/share/Steam/`, `.desktop`-Dateien, Pfade (`~/.var/app/`) |
**Scanner-Implementierungen:**
#### Unified Game Model
#### Game Launch
- Nach Launch wird alle 2s gepollt ob der Spiel-Prozess erscheint. Timeout 60s. Prüft auf Launcher-eigene Update-Dialoge.
- Spielzeit-Tracking startet erst wenn Prozess erkannt wurde.
#### Embedded Mode Integration
Jeder Game-Eintrag speichert zusätzlich:
- `launcher_state`: Welcher Client für dieses Spiel zuständig ist (Steam, Epic, EA, Ubisoft, Battle.net, Xbox, GOG, none)
- `launch_protocol`: URI-Schema für den Spiel-Start (z.B. `steam://run/<appid>`, `com.epicgames.launcher://apps/<id>?action=launch&silent=true`)
- `embedded_setup_done`: Boolean ob der Client bereits silent installiert/verknüpft ist
- `requires_original_client`: Boolean ob das Spiel den Original-Client zwingend braucht (DRM, Anti-Cheat)
**Launch-Flow:**
1. Universal Launcher prüft `embedded_setup_done` und Client-Running-State
2. Falls Client nicht läuft: Silent Background-Start abwarten (max. 30s)
3. Game-Launch via `launch_protocol` mit `-silent` / `silent=true` Parameter
4. Prozess-Polling startet, Client bleibt ungestört im Tray
5. Nach Spiel-Ende: Client optional schlafen schicken (konfigurierbar)
**Erst-Setup:** Beim ersten Start eines Spiels auf einer neuen Plattform leitet Universal Launcher durch die Account-Verknüpfung (siehe 2.4) und installiert ggf. den Client silent.
#### Spiel-Eigenschaften
- **Launch Options:** Custom Befehlszeilenparameter
- **Sprache:** Spielsprache ändern wenn vom Launcher unterstützt
- **Update-Erkennung:** Steam schreibt Update-Status in `appmanifest`-Dateien. Andere Launcher: Status via Prozess-Polling.
- **Beta-Branches:** Nur Steam (`steam://install/{appid}/{branch}`)
- **Datei-Integrität prüfen:** Nur Steam (`steam://validate/{appid}`)
#### Speicherplatz-Anzeige
- Zeigt pro Laufwerk: freier Speicher, belegter Speicher durch Spiele, Laufwerkstyp (SSD/HDD)
- Installationsort pro Spiel wählbar (eigener Store). Fremd-Launcher: Pfad wird vom Launcher bestimmt.
#### Multi-Drive-Support
- Spiel auf verschiedenen Laufwerken installieren
- **Verschieben ohne Neuinstallation:** Nur für eigenen Store (atomare Operation: Validierung → Copy → Manifest-Update → Rollback bei Fehler)
- **Fremde Launcher:** Steam hat eigenen Move-Mechanismus. Epic/EA/Ubisoft brechen bei manueller Verschiebung — stattdessen deinstallieren + auf anderem Laufwerk neu installieren.
#### Non-Launcher Games (Externe Spiele)
- **Manuelles Hinzufügen:** Nutzer wählt EXE aus, gibt Spielnamen ein. Metadaten per Suche vervollständigt (Nutzer bestätigt das Spiel).
- **Community-EXE-DB (späterer Scope):** Nutzer können EXE-Hashes melden → andere Nutzer bekommen beim gleichen Hash automatisch den richtigen Spielnamen vorgeschlagen.
---
### 1.2 Download-Manager
**Grundprinzip:** Jede Plattform liefert Spiele über Content-Server + Manifest-Dateien aus. Der Launcher authentifiziert den Nutzer mit seinem Plattform-Account und steuert den Download selbst. Für Plattformen mit bestehenden Community-Tools ist der Ansatz bereits bewiesen. Für andere Plattformen ist der gleiche Ansatz technisch möglich, nur mit unterschiedlichem Entwicklungsaufwand.
| Store | Download-Steuerung | Mechanismus |
|-------|-------------------|-------------|
| Eigener Store | Voll (Pause/Resume, Bandbreite, Queue, Zeitplan) | Download über Content-Server mit signierten URLs |
| Steam | Voll (Pause/Resume, Bandbreite, Queue) | Reverse-engineered Steam Content System. Fallback: nativer Steam-Client |
| Epic | Voll (Pause/Resume, Bandbreite, Queue) | Reverse-engineered Epic-Download-Protokoll |
| GOG, Xbox | Voll via offizieller API | Offizielle Download-APIs mit Fortschritt/Steuerung |
| Battle.net, Ubisoft, EA | Voll via Reverse-Engineering | Eigenentwicklung nötig, technisch lösbar |

#### Embedded Download Flow
Der Universal Launcher kann Downloads auf zwei Arten steuern — nahtlos umschaltbar pro Spiel und Plattform:

**Modus 1: Eigene Steuerung (Universal Launcher macht den Download selbst)**
- Universal Launcher authentifiziert sich mit dem Plattform-Token
- Manifest wird von der Plattform-API/CDN geholt
- Download läuft direkt im Universal Launcher mit voller UI-Kontrolle (Pause/Resume, Bandbreiten-Limit, Queue)
- Vorteil: Einheitliche UX, eine Bandbreiten-Steuerung für alle Plattformen
- Unterstützt für: Eigener Store, Steam, Epic, GOG, Xbox (wo APIs/RE verfügbar)

**Modus 2: Delegation an Original-Client (via Embedded Mode)**
- Universal Launcher triggert Download-Start im Original-Client (z.B. `steam://install/<appid>`)
- Original-Client führt Download durch, Universal Launcher liest nur Fortschritt via API/Polling
- Vorteil: Funktioniert auch bei Plattformen ohne öffentliche API, garantiert Authentizität
- Unterstützt für: Alle Plattformen, insbesondere Battle.net, EA, Ubisoft

**Hybrid-Modus (Best of Both)**
- Universal Launcher macht Download-Engine (Bandbreite, Queue, Pause/Resume)
- Original-Client liefert Auth und Manifest
- Pro Spiel konfigurierbar, Default: eigener Store = Modus 1, fremde Stores = Modus 2 oder Hybrid
- Universal Launcher-UI zeigt einheitliche Download-Queue unabhängig vom Modus

**Strategie pro Plattform:**
| Plattform | Standard-Modus | Optional |
|---|---|---|
| Eigener Store | Modus 1 (Eigene Steuerung) | — |
| Steam | Modus 1 (Steamworks/CDN) | Modus 2 (Steam-Client) |
| Epic | Modus 1 (EOS-SDK) | Modus 2 (Epic-Client) |
| GOG | Modus 1 (API) | Modus 2 (Galaxy) |
| Xbox | Modus 1 (MS Store API) | Modus 2 (Xbox-App) |
| Battle.net | Modus 2 (Battle.net-Client) | Hybrid (RE + Client-Auth) |
| EA | Modus 2 (EA-App) | Hybrid |
| Ubisoft | Modus 2 (Ubisoft Connect) | Hybrid |
---
### 1.3 Suche, Filter & Sortierung
#### Filter
#### Sortierung
#### Collections
---
### 1.4 Spieldetailseite
#### Custom Artwork
- Cover, Header/Hero, Logo pro Spiel hochladbar
- Auto-Download von 
- Community-Artwork nutzbar
#### Kategorien & Tags
- Frei definierbare Kategorien mit Farbcodierung
- Bis zu 20 Kategorien pro Spiel
- Tags aus Store + eigene Tags kombinierbar
- Cloud-synchronisiert
#### Verstecken
- Spiele aus Hauptansicht ausblenden
- Batch-Hide/Unhide
- Separate Hidden-Ansicht
---
## 2. Social Features
### 2.1 Universelle Freundesliste
#### Friend Discovery & Deduplizierung
**Quellen mit automatischem Import:**
| Plattform | Friend-API | Status |
|-----------|-----------|--------|
| Steam | Offizielle API | Offiziell |
| Epic | Offizielle API | Offiziell |
| Battle.net | Offizielle API | Offiziell |
| Xbox | Offizielle API | Offiziell |
| GOG | Offizielle API | Offiziell |
| Ubisoft | Keine öffentliche API | Nur via manuelle Verknüpfung |
| EA | Keine öffentliche API | Nur via manuelle Verknüpfung |
**Deduplizierung in drei Stufen:**
1. **Verknüpfte Accounts:** Nutzer hat z.B. Steam + Epic verknüpft → doppelte Freunde automatisch erkannt
2. **Heuristik:** Gleicher Display-Name + ≥2 gemeinsame Freunde + ähnliches Avatar → manuelle Bestätigung
3. **Manuelle Verknüpfung:** UI zum Zusammenführen
Performance-Caching: Abfrage wird alle 60s pro Plattform gebatcht, Ergebnis lokal gecached.
### 2.2 Echtzeit-Presence
### 2.3 Chat (nur Text)
- Direktnachrichten und Gruppen-Chats
- **Datenmodell:** Chat-Räume (Direktnachrichten/Gruppen), Mitglieder, Nachrichten pro Raum
- Keine Sprach- oder Video-Integration — rein textbasiert
- Keine TKÜ-relevanten Daten
### 2.4 Einladungssystem (Custom-Link Universal)

**Prinzip:** Ein universelles Link-Format funktioniert plattformübergreifend. Wenn das Spiel auf gleicher Plattform ist, wird der plattform-native Invite bevorzugt. Cross-Platform funktioniert nur, wenn das Spiel es nativ unterstützt — das wird ehrlich kommuniziert.

**Status:** Das In-App-Invite-System (Supabase Realtime + `game_invites` Tabelle) ist bereits implementiert. Freund-zu-Freund-Einladungen im Chat funktionieren. Das hier beschriebene Custom-Link-System ist die **Erweiterung** für externe Shares (über Launcher-Grenzen hinweg).

#### Link-Format
```
universallauncher://invite?token=<JWT>&from=<user>&game=<id>&source=<platform>
```

**JWT-Claims:**
- `from_user_id`: Absender-ID im Universal-Launcher-System
- `game_id`: Universal Game-ID (interne DB)
- `source_platform`: Plattform des Absenders (steam, epic, ...)
- `expires_at`: 24h Gültigkeit
- `signature`: HMAC-SHA256 mit Server-Secret

#### Sender-Flow
1. User A klickt im Spiel oder in der Library auf "Freund einladen"
2. Universal Launcher prüft: Ist das Spiel Cross-Platform-fähig? Welche Freunde sind auf welchen Plattformen online?
3. Generierung von `universallauncher://invite?token=...` (immer)
4. **Zusätzlich:** Wenn Empfänger auf gleicher Plattform → plattform-nativer Invite (Steam Chat, Epic Chat, etc.)
5. Link wird geteilt via: Universal-Launcher-Chat, Clipboard, oder Social-Share-Sheet
6. Optional: QR-Code für In-Person-Sharing

#### Empfänger-Flow
1. User B klickt auf `universallauncher://invite?token=...`
2. Falls Universal Launcher nicht installiert → Web-Fallback-Seite (`universallauncher.com/invite?token=...`) mit:
   - Spiel-Info, Store-Links für alle Plattformen
   - Download-Button für Universal Launcher
3. Falls installiert → Universal Launcher öffnet sich
4. Launcher prüft JWT-Signatur und Token-Gültigkeit
5. Launcher prüft: Besitzt User B das Spiel? Auf welcher Plattform?
6. **Wenn besessen:** "Spiel öffnen auf [Plattform]"-Button
7. **Wenn nicht besessen:** "Im Store kaufen"-Link + Cross-Store-Empfehlungen
8. **Wenn Spiel auf mehreren Plattformen:** User wählt Plattform aus

#### Ehrlich-UX (was der Launcher ehrlich kommuniziert)
| Szenario | Launcher-Verhalten |
|---|---|
| Spiel unterstützt Cross-Platform nativ (z.B. Fortnite, Minecraft Bedrock) | "Einladen möglich"-Badge auf Freund-Liste |
| Spiel nur Single-Platform | Tooltip: "Dieses Spiel unterstützt keine Cross-Platform-Einladungen" |
| Beide User auf gleicher Plattform | Native Einladung wird bevorzugt, kein Custom-Link nötig |
| Custom-Link nicht anklickbar (kein Launcher) | Web-Fallback-Seite mit Store-Link |
| Token abgelaufen (>24h) | "Einladung abgelaufen — bitte neu anfragen" |
| Empfänger besitzt Spiel nicht | "Spiel nicht in deiner Library" + Store-Empfehlung |
| Spiel auf falscher Plattform | "Spiel auf [Plattform] öffnen" — explizit die richtige Plattform anbieten |

#### Plattform-Adaption-Layer
| Plattform | Einladungs-Mechanismus |
|---|---|
| Steam → Steam | Steam-Web-API Invite (kein Custom-Link nötig) |
| Epic → Epic | EOS-SDK Invite (kein Custom-Link nötig) |
| Steam → Epic (gleiches Spiel) | Custom-Link, nur wenn Spiel Cross-Platform nativ unterstützt |
| Beliebig → Beliebig (verschiedene Spiele) | Custom-Link mit Spiel-Vorschlag im Store |
| Beliebig → User ohne Launcher | Web-Fallback-Seite |

#### Datenmodell
```
Invite {
  id: UUID
  token: JWT (signiert)
  from_user_id, from_platform
  game_id
  recipient_user_id (optional, vor Empfang noch null)
  created_at, expires_at
  state: "pending" | "accepted" | "declined" | "expired" | "opened"
  delivery_method: "native" | "custom_link" | "web_fallback"
}
```

#### Account-Verknüpfung
Nutzer kann seine Konten aller unterstützten Plattformen mit dem Universal-Launcher-Account verknüpfen. Dies ist die Grundlage für Scanner, Friend-Import, Achievement-Aggregation und Invites.
**Verknüpfungs-Matrix:**
| Plattform | Verknüpfungs-Methode | Was wird freigeschaltet |
|-----------|---------------------|------------------------|
| Steam | Login über Browser-Redirect | Scanner, Friends, Achievements, Launch, Invites, Workshop |
| Epic | Login über Browser-Redirect | Scanner, Friends (eingeschränkt), Achievements, Launch, Invites |
| Battle.net | Login über Browser-Redirect | Scanner, Friends, Launch |
| Xbox | Login über Browser-Redirect | Scanner, Friends, Launch, Invites |
| GOG | Login über Browser-Redirect | Scanner, Friends, Launch |
| Ubisoft | Manuelle Account-ID-Eingabe (keine öffentliche API) | Scanner (Registry/Dateisystem), Launch |
| EA | Manuelle Account-ID-Eingabe (keine öffentliche API) | Scanner (Registry/Dateisystem), Launch |
**Technischer Flow:**
- App öffnet Browser → Provider-Login
- Redirect auf `universallauncher://callback`
- App fängt Token ab
- Session wird gesetzt, Token wird verschlüsselt lokal gespeichert (OS-Keychain)
#### Friend Activity Feed
- Aktivitäten: Spiel-Starts, Achievements, Screenshots
- Personalisiert für Spiele die man besitzt
- Anpassbar pro Spiel
### 2.5 Cross-Platform-Gameplay-Erkennung

**Prinzip:** Der Launcher weiß, welche Spiele plattformübergreifendes Gameplay unterstützen und welcher Freund gerade auf welcher Plattform welches Spiel spielt. Wenn ein Freund auf einer anderen Plattform spielt und das Spiel Cross-Platform-fähig ist, bietet der Launcher einen Smart-Join auf der eigenen Plattform an.

#### Game-Cross-Play-Kompatibilitäts-DB

**Datenquellen (in Prioritäts-Reihenfolge):**

1. **IGDB-API (primär):** Twitch/IGDB bietet strukturierte Spiel-Metadaten mit Multiplayer-Platform-Flags. Initiale Datenbasis wird beim Spiel-Sync angereichert.
2. **Manuell gepflegt:** Redaktion kuratiert bekannte Cross-Play-Spiele (z.B. Fortnite, Minecraft Bedrock, Rocket League, Warframe, Genshin Impact, ...)
3. **Community-Beiträge:** User können Spiele mit Cross-Play-Hinweis melden → Moderation → DB-Eintrag
4. **Auto-Detection (wo möglich):** Auswertung von Spiel-Metadaten (z.B. Steam-Tags wie "Cross-Platform Multiplayer")
5. **Plattform-APIs:** Manche Plattformen liefern explizite Cross-Play-Flags (z.B. Xbox Smart Delivery Hinweise)

**Speicherung:** Die `games` Tabelle in Supabase hat bereits ein `metadata` JSONB-Feld. Cross-Play-Information wird dort als `cross_play_platforms: ["xbox", "ps5", "switch", "mobile"]` Array gespeichert — **kein eigenes DB-Schema nötig**.

**DB-Schema:**
```
CrossPlaySupport {
  game_id: string
  platform_combinations: [
    { from: "steam", to: ["epic", "xbox", "ps5"], verified: bool, source: "manual"|"community"|"api" },
    { from: "epic", to: ["steam", "xbox", "ps5"], verified: bool, source: ... },
    ...
  ]
  last_verified: timestamp
  notes: string
  reports_count: int
}
```

**Beispiel-Eintrag (Minecraft Bedrock):**
```
game_id: "minecraft_bedrock"
platform_combinations: [
  { from: "steam",  to: ["xbox", "ps5", "switch", "mobile"], verified: true, source: "manual" },
  { from: "xbox",   to: ["steam", "ps5", "switch", "mobile"], verified: true, source: "manual" },
  { from: "epic",   to: ["xbox", "ps5", "switch", "mobile"], verified: true, source: "community" }
]
```

#### Smart-Join-Flow

**Voraussetzung:** Du und dein Freund besitzen das gleiche Spiel (ggf. auf verschiedenen Plattformen). Das Spiel ist in der Cross-Play-DB als plattformübergreifend markiert.

**Flow:**
1. Du öffnest Universal Launcher → Freundesliste zeigt: "Max spielt Fortnite auf Epic"
2. Du hast Fortnite auf Steam installiert
3. Klick auf "Max spielt Fortnite" → Smart-Join-Option erscheint:
   - **Spiel auf Steam starten (Cross-Play aktiv)** — grüner Button
   - Untertitel: "Fortnite unterstützt Cross-Play. Du triffst Max automatisch auf der gleichen Instanz."
4. Klick → Spiel startet auf Steam → dein Epic-Freund Max wird automatisch in deiner Freundesliste im Spiel angezeigt
5. **Falls Cross-Play nicht verifiziert:** Gelber Warnhinweis: "Cross-Play nicht garantiert — Spiel könnte getrennte Welten haben"

#### UI-Integration

**In der Library (Spiel-Cover):**
- Cross-Play-Badge auf Spielen, die mit anderen Plattformen kompatibel sind
- Klick auf Badge → Liste: "Spielbar mit Steam | Epic | Xbox | PS5"

**In der Freundesliste:**
- Freund-Status zeigt: "Spielt [Spiel] auf [Plattform]"
- Bei Cross-Play-Spielen: "Smart-Join"-Button (nur wenn du das Spiel auf einer kompatiblen Plattform besitzt)

**In der Spieldetailseite:**
- "Cross-Play"-Sektion: Welche anderen Plattformen kompatibel sind
- "Freunde spielen gerade"-Liste mit Plattform-Indikator

**Friend Activity Feed (Erweiterung):**
- Statt nur "Max hat Achievement freigeschaltet" → "Max spielt Fortnite auf Epic — Smart-Join möglich"

#### Ehrlich-UX (was der Launcher ehrlich kommuniziert)

| Szenario | Launcher-Verhalten |
|---|---|
| Spiel in DB als Cross-Play verifiziert (Steam ↔ Epic) | "Smart-Join möglich" mit grünem Button |
| Spiel in DB als Cross-Play gemeldet, aber nicht verifiziert | "Cross-Play gemeldet — nicht garantiert" mit gelbem Hinweis |
| Spiel nicht in DB | Kein Smart-Join-Button (User kann manuell native Einladung senden) |
| Du besitzt Spiel auf inkompatibler Plattform | "Du besitzt das Spiel auf [Plattform], die nicht kompatibel ist. Kaufe auf [Plattformen]" |
| Freund auf gleicher Plattform | "Spiel öffnen" — Smart-Join nicht nötig |
| Spiel nur auf einer Plattform verfügbar (exklusiv) | Kein Cross-Play möglich, klare Anzeige |
| Account-Verknüpfung fehlt für eine Plattform | "Verknüpfe [Plattform] um Smart-Join zu nutzen" |

#### Technische Umsetzung

**Spiel-Identifikation über Plattformen hinweg:**
- Universal Launcher pflegt eine `game_universal_id` pro Spiel
- Mapping: `steam_app_id` ↔ `epic_namespace` ↔ `xbox_pfn` ↔ ...
- Quelle: manuelle Pflege, Community-Reports, automatische Heuristik (Spielname + Publisher + Release-Datum)

**Smart-Join-Logik:**
1. Eingabe: Welches Spiel spielt Freund, auf welcher Plattform
2. Lookup: Welche Cross-Play-Kombinationen sind für dieses Spiel bekannt?
3. Prüfung: Besitze ich das Spiel auf einer kompatiblen Plattform? Ist es installiert?
4. Output: Smart-Join-Button (mit Plattform-Empfehlung) oder "Kaufen"-Hinweis

**Performance:**
- Cross-Play-DB lokal gecached
- Nur Delta-Sync mit Server (neue/geänderte Einträge)
- Smart-Join-Lookup ist O(1) über Indizes

#### Limitierungen (ehrlich)

- **Cross-Play muss vom Spiel unterstützt werden** — Universal Launcher kann das nicht erzwingen oder herstellen
- **Einige Spiele haben Cross-Buy (kostenlos auf mehreren Plattformen), andere nicht** — Launcher zeigt ehrlich ob du das Spiel auf einer anderen Plattform kaufen müsstest
- **Anti-Cheat-Inkompatibilitäten:** Manche Cross-Play-Spiele trennen Spieler mit verschiedenen Anti-Cheats (z.B. PvP-Spiele mit aktivem Anti-Cheat) — Launcher warnt davor
- **Spiel-Updates:** Ein Spiel kann Cross-Play einführen oder entfernen — DB wird mit Verzögerung aktualisiert, User können Updates melden
---
## 3. Zusätzliche Features
### 3.1 Spielzeit-Tracking
- **Prozess-Monitoring:** Alle 5s wird geprüft ob Spiel-Prozess noch läuft. Start erst wenn Prozess nach Launch erkannt wurde.
- **Crash-Erkennung:** Prozess ohne „Exit to Desktop" verschwunden → `lastSession.crashed = true`
- **Idle-Erkennung (späterer Scope):** 15 Min. kein Input → Spielzeit-Pause
- **Session-Tracking:** Einzelsessions mit Start/End-Zeit
- **Historie:** Tages-, Wochen-, Monats-, Jahresübersicht
- **Manuelle Korrektur:** Spielzeit nachträglich editierbar
### 3.2 Screenshots & Medien
- **Aufnahme:** `screenshots` crate (//)
- **Speicherort:** `%APPDATA%\UniversalLauncher\Screenshots\{game}\`
- **Verwaltung:** Nach Spiel, Datum sortieren. Teilen via Storage.
- **Bearbeiten:** Zuschneiden & Annotieren (späterer Scope)
- **Privatsphäre:** Public, Friends Only, Private
### 3.3 Achievements (Universal)
**Prinzip:** Ein einheitliches Achievement-System über drei DB-Tabellen für Catalog, User-Unlocks und Progress. Synchronisation von offiziellen Plattform-APIs wo verfügbar, Community-Listen als Fallback. Kein UI-Unterschied zwischen Quellen — nur ein Source-Label.

#### Implementiertes 3-Tabellen-Datenmodell

Das Supabase-Schema hat bereits drei separate Tabellen, die zusammen das universelle Achievement-System bilden:

**Tabelle 1: `achievements` (Catalog)**
```
- id, game_id (FK zu games)
- external_id (Plattform-spezifische ID)
- name, description
- icon_url, icon_gray_url
- source: "steam" | "epic" | "xbox" | "gog" | "community"
- created_at, updated_at
```

**Tabelle 2: `user_achievements` (User-Unlocks)**
```
- user_id (FK), achievement_id (FK)
- unlocked_at: timestamp
- synced_at: timestamp
- Eindeutigkeit: (user_id, achievement_id)
```

**Tabelle 3: `achievement_progress` (Progressive Achievements)**
```
- user_id, achievement_id
- current_value, target_value
- last_updated
- Für Achievements die nicht nur unlock/locked sind, sondern Progress haben
```

#### API-Quelle-Matrix
| Plattform | Quelle | Status |
|---|---|---|
| Steam | Steam Web API `ISteamUserStats` (`sync_game_achievements`) | ✅ Offiziell, voll implementiert |
| Xbox | Xbox Live API (`sync_xbox_achievements`) | ✅ Offiziell, voll implementiert |
| Epic | Epic Online Services (EOS) SDK | Geplant |
| GOG | GOG Galaxy API | Geplant (eingeschränkt) |
| Battle.net | Keine öffentliche API | Community-Listen |
| EA | Keine öffentliche API | Community-Listen |
| Ubisoft | Keine öffentliche API | Community-Listen |

#### Sync-Strategie
- **Bei Spiel-Start:** Achievements des Spiels werden mit verknüpften Plattformen synchronisiert (in `user_achievements` gecached)
- **Während Spiel läuft:** Polling alle 30s auf Unlock-Events; Push via Supabase Realtime wenn möglich
- **Nach Spiel-Ende:** Finale Synchronisation, Update `unlocked_at`
- **Progressive Updates:** `achievement_progress.current_value` wird mit-polled für Achievement-Stages
- **Cross-Platform-Achievement-Merge:** Wenn Spiel auf mehreren Plattformen vorhanden → Union über `(game_id, source)`; jede `external_id` ist eindeutig pro Plattform

#### Manuelle Achievements & Community-Listen
- Nutzer erstellt eigene Achievement-Listen pro Spiel (manuell, ohne Plattform-Quelle → `source = "community"`)
- Community-Listen: User teilen ihre manuellen Listen, andere importieren per Klick
- **Matching-Algorithmus:** Spielname + EXE-Hash (SHA-256) → Vorschlag passender Listen
- **Crowdsourcing:** User bekommen Reputation-Punkte für Listen-Adoption
- **Spam-Schutz:** ≥3 Reports → Liste versteckt bis manuelle Prüfung; max. 1 Liste/Spiel/Nutzer
- **Kein UI-Unterschied** zwischen automatischen und manuellen Achievements

**In der Library:** Badge pro Spiel zeigt `{unlocked}/{total}`. Source-Label z.B. "via Steam", "via Xbox", "Community-Liste".

**Nice-to-have (später):** `rarity_global` (0.0-1.0) kann aus `achievements` Tabelle aggregiert werden wenn genug Community-Daten vorhanden sind.
### 3.4 Cloud-Save-Sync
- **Save-Pfad-Erkennung:** Community-Datenbank mit bekannten Save-Pfaden pro Spiel (. Nutzer können Pfade melden)
- **Manuelle Konfiguration:** Nutzer kann Save-Ordner pro Spiel selbst angeben
- **Sync:** Delta-komprimierter Upload zu Storage
- **Konfliktlösung:** Timestamp-basiert (neueste gewinnt) + manuelle Auswahl wenn beide Seiten innerhalb von 60s geändert wurden
- **Verschlüsselt:** Ende-zu-Ende-Verschlüsselung
### 3.5 Family Sharing
- **Nur für eigenen Store.** Fremde Launcher (Steam/Epic/etc.) haben eigene Family-Sharing-Systeme.
- Bis zu 6 Familienmitglieder
- Eigene Spielstände & Achievements pro Mitglied
- Kindersicherung (Zeitlimits, Spielebeschränkungen)
### 3.6 Controller-Support
- **Erkennung:** Xbox, PlayStation, Switch Pro, generische Gamepads
- **Re-Mapping:** Button-Neubelegung pro Spiel
- **Community-Layouts** (späterer Scope)
- **Gyro, Haptik, Controller-Emulation (z.B. ):** Späterer Scope
- **Desktop-Mode:** Controller für UI-Navigation (späterer Scope)
### 3.7 Mod-Management
**Status:** Die `/mods` Route existiert bereits im Frontend (siehe `launcher/src/pages/ModsPage.tsx`), aber das Backend ist laut README explizit minimal.

**Geplante Schritte:**
- **Steam Workshop:** Für Steam-Spiele; Workshop-Items abonnieren/verwalten
- **Manuell:** Mod-Ordner selbst verwalten, Mod-Profile
- **Nexus Mods:** Späterer Scope (API benötigt Premium für Automation)
- **Bethesda (Vortex-Stil), CurseForge, Mod.io:** Späterer Scope, Community-basiert
### 3.8 News-Feed
- **Steam:** Öffentlicher News-Endpoint pro App-ID (z.B. `ISteamNews/GetNewsForApp/v2`)
- **Battle.net, GOG:** Haben öffentliche News-Feeds (eingeschränkt)
- **Epic, Ubisoft, EA, Xbox:** Keine öffentlichen News-APIs
- **Eigener Store:** Developer posten News via Developer-Portal
### 3.9 Preis-Tracker
- **Eigener Store:** Preisverlauf aus (alle früheren Preise gespeichert)
- **Fremde Stores:** API (kostenpflichtig, späterer Scope)
- Wishlist mit Preisdrop-Benachrichtigungen
### 3.10 Datenschutz & Privacy
- Keine Sprach-/Videoaufnahmen
- **DSGVO:** Datenexport (JSON), Account-Löschung, keine Tracking-Cookies, Privacy-Einstellungen
- **Zahlungsdaten:** / verarbeitet Zahlungen — Launcher speichert keine Kreditkartendaten
- **Auftragsverarbeitung:** (Hosting), (Zahlung), (Build-Delivery)
### 3.11 Remote Play & Downloads
- **Remote Play Together:** Delegiert an / . Keine eigene Streaming-Engine.
- **Remote Downloads:** Spiele-Installation auf eigenem PC von unterwegs starten (späterer Scope, via Mobile App/Web)
### 3.12 Backup & Restore
- Lokales Backup auf externem Laufwerk mit Komprimierung
- Inkrementelle Backups (nur Änderungen)
- Vollständige Wiederherstellung
---
## 4. Später geplant
Diese Features sind Teil des langfristigen Scopes. Sie werden im Live-Betrieb kontinuierlich ergänzt, sobald die technischen Voraussetzungen (Plattform-APIs, Community-Daten, externe Integrationen) reifen.
### 4.1 Eigener Game Store
Vollständige Storefront mit Kauf, Download, DRM, Developer-Portal.
#### Storefront & Produktseite
**Bezahl-Modelle:** Einmalkauf, Free-to-Play (Lizenz ohne Payment), DLC/In-App-Käufe
#### Warenkorb & Checkout
#### Zahlungsabwicklung
**Kauf-Flow :**
#### Lizenz-Management & DRM
- **Offline-Token:** 30 Tage gültig, danach Online-Prüfung erforderlich
- **Gerätelimit:** Max. X Installationen gleichzeitig
#### Wishlist & Sales
#### Bewertungssystem
- Verifizierte Käufe (nur Lizenz-Inhaber können bewerten)
- Abuse-Meldesystem (≥3 Meldungen → ausgeblendet bis Prüfung)
- Spam-Schutz (max. 1 Review/Spiel/Nutzer; Rate-Limit 5/h)
#### Empfehlungen
#### Developer-Portal
- **Spiel-Registrierung:** Dev reicht Store-Seite + Builds ein. Manuelle Freigabe vor erstem Publish (Schutz vor Spam/Malware).
- **Malware-Scan:** Builds werden vor Freigabe via gescannt.
- **Revenue-Share:** 70/30 Standard, verhandelbar ab bestimmten Umsatz-Schwellen.
#### Store-UI
| Ansicht | Beschreibung |
|---|---|
| **Home** | Hero-Banner, Featured Sale, Neuerscheinungen, Empfohlen für dich, Trending |
| **Durchstöbern** | Genres, Tags, Top-Seller, Charts, Sale-Übersicht |
| **Produktseite** | Trailer, Screenshots, Beschreibung, Preis, Reviews, Systemanforderungen |
| **Wunschliste** | Eigene Wunschliste mit Preisdrop-Benachrichtigungen |
| **Warenkorb** | Ausstehende Käufe, Geschenkoptionen, Preisübersicht |
| **Bestellhistorie** | Alle Käufe, Rechnung-Download, Refund-Button |
| **Developer-Dashboard** | Spiele verwalten, Builds hochladen, Analytics, Revenue |
---
### 4.2 In-Game Overlay
#### Architektur
#### Technische Umsetzung
- **Initiale Umsetzung:** `always_on_top` + `transparent`-Fenster über dem Spiel. Nur Windowed/Borderless-Windowed.
- **Fullscreen-Spiele:** Minimieren beim Fokusverlust → Overlay nicht nutzbar. Toast-Notifications als Ersatz.
- **Globaler Hotkey:** Shift+Tab via Shortcut API → togglet Overlay-Sichtbarkeit
- **Input:** Overlay-Fenster hat Fokus → Spiel-Input pausiert natürlich (Windowed-Modus)
#### Anti-Cheat-Kompatibilität (manuell gepflegte DB)
| Anti-Cheat | Overlay möglich? | Fallback |
|---|---|---|
| Riot Vanguard | Nein | externes Fenster (2. Monitor) |
| BattlEye | Ja | Externes Overlay-Fenster |
| ESEA | Nein | externes Fenster |
| Easy Anti-Cheat | Ja | Externes Overlay-Fenster |
| Valve Anti-Cheat (VAC) | Ja | Externes Overlay-Fenster |
| FACEIT | Nein | Toast-Notifications |
| EQU8 | Nein | externes Fenster |
| Unbekannt | Standard | Externes Overlay-Fenster |
**Später:** (Windows) / `` (Linux) für echtes In-Game-Overlay. Von vielen Anti-Cheats blockiert — separater Research-Track.
---
### 4.3 Weitere spätere Features
#### Killer-Features (USP-Konzepte)
**Cross-Store Save Sync:**
Spielstände zwischen verschiedenen Store-Versionen desselben Spiels synchronisieren. Erfordert Community-Datenbank (Save-Pfade) + Heuristik für Store-Version-Matching. Konzept.
**Smart Install:**
Automatisch schnellste/günstigste Download-Quelle wählen. Für eigenen Store: -Mirror-Auswahl nach Server-Geschwindigkeit. Für Fremd-Stores: Preisvergleich .
**One-Click Setup:**
Neuer PC: Ein Login, Stores verbinden, Spiele erkennen, Collections/Kategorien/Cloud-Saves synchronisieren. Minimale Einrichtungszeit. Re-Authentifizierung bei jedem Store erforderlich; Spiele-Downloads nicht inkludiert.
**Game Activity Dashboard:**
"Dein Gaming-Jahr" (Spotify Wrapped-Stil): Top-Spiele, Spielzeit, Achievements, Streaks, Genre-Verteilung, Vergleich mit Vorjahr.
**Local Multiplayer Hub:**
Couch-Coop-Setup: Controller-Erkennung, Player 1-4 Auto-Konfiguration, Split-Screen. Remote Play Together Delegation an / .
#### Weitere Konzepte
| Feature | Scope |
|---------|-------|
| Plugin-System (Store-Plugins, Tool-Plugins, Themes, Marketplace) | Konzept |
| Themes/Skins (Dark/Light, Custom Themes, Layout-Optionen) | Später |
| AI-Empfehlungen (Mood-basiert, Backlog-Priorisierung) | Konzept |
| Backlog-Manager (Status-Tracking, Ziele, Fortschritt) | Später |
| Spiele-Vergleich (Side-by-Side-Metriken) | Später |
| Batch-Operationen (Massen-Install/Hide/Kategorisieren/Deinstall) | Später |
| Social Feed (Liken/Kommentieren von Aktivitäten) | Später |
| Broadcasting (Twitch/YouTube-Integration) | Konzept |
| LAN-Transfer (Netzwerk-Kopie zwischen PCs) | Später |
| Mobile App (iOS/Android Library, Chat, Remote Downloads) | Später |
| Keyboard Shortcuts (Custom, Cheatsheet) | Später |
---
## 5. UI/UX Design

### 5.1 Hauptansichten
1. **Library View:** Raster-/Listen-Ansicht aller Spiele. Filter, Suche, Store-Badges.
2. **Spieldetailseite:** Cover, Stats, Achievements, Freunde, News, Installation.
3. **Freunde View:** Aggregierte Freundesliste, Online-Status, Chat.
4. **Aktivität View:** Feed was Freunde spielen, Achievements, Screenshots.
5. **Download-Manager:** Download-Queue, Fortschritt, Bandbreiten-Steuerung.
6. **Store View:** Home, Durchstöbern, Produktseite, Warenkorb.
7. **Einstellungen:** Accounts verknüpfen, Privacy, Benachrichtigungen.

### 5.2 Design-System: Retro Manga Launcher

**Design-Identität:** Cyberpunk-Game-Launcher im 90er-Manga-Magazin-Stil. Aged paper, heavy ink, hard offset shadows, dichte Panels, technical labels, aggressive game art. Es darf **nicht** wie ein generisches SaaS-Dashboard aussehen.

**Farb-Palette (Token-basiert):**

| Token | Hex | Verwendung |
|---|---|---|
| Paper | `#fff9ed` / `#f5eedf` | App-Hintergrund, Panels |
| Paper Dim | `#f6edd8` / `#efe6d4` | Inputs, inaktive Panels |
| Ink | `#171411` / `#1f1c0f` | Borders, Text, hard shadows |
| Red | `#b7102a` / `#c20b2f` | Brand, Primary-Actions, Alerts |
| Teal | `#007166` / `#087d6d` | Active-State, Online, Secondary |
| Cyan | `#8cf5e4` | Hover-Highlights, kleine Akzente |
| Muted Text | `#5b403f` / `#655f58` | Metadata, Beschreibungen |

**Neue dominante Farben vermeiden.** Feature-State-Farben auf Red, Teal, Ink, Paper oder Muted mappen.

**Typografie:**
- `neo-title` — Brand, Page-Titles, dramatische Headings (uppercase, bold, tight)
- `neo-copy` — Labels, Metadata, Buttons, technical readouts (uppercase, letter-spacing)
- Headings uppercase und bold
- Body-Text normal case, aber kompakt
- Keine viewport-skalierten Font-Sizes in Buttons/Cards/Sidebars/Forms

**Layout-Regeln:**
- **Header-First:** Brand links, Navigation im Header, Notifications/Profile rechts
- Header-Höhe ~80px, dicke Bottom-Border
- Brand-Text: `OG-Launcher`
- Max-Width ~1220px (`max-w-[1220px]`)
- Hintergrund: warm paper mit Halftone-Dots (`neo-dots`)
- Manga-Panel-Komposition für Page-Sections
- **Keine linke Sidebar** (außer explizit angefordert) — Navigation gehört in den Header
- **Keine Marketing-Hero-Layouts** — der erste Screen ist die App selbst

**Komponenten-Stil:**

| Element | Stil |
|---|---|
| **Buttons** | `border-2` oder `border-[3px] border-black`, hard offset shadow `shadow-[3px_3px_0_#1f1c0f]`. Primary: roter Hintergrund, weiße Schrift. Secondary: teal. Hover: translate-up + Shadow/Fill-Wechsel. |
| **Panels/Cards** | Paper-Hintergrund, dicke schwarze Borders, hard offset shadows. Header-Strips in schwarz oder rot für wichtige Labels. Keine rounded corners. |
| **Inputs** | Paper-Dim-Hintergrund, dicke schwarze Border oder starke Bottom-Border. Monospace-Label via `neo-copy`. |
| **Badges** | Kleine rechteckige Blöcke. Red für Update/Warning, Teal für Active/Online, Paper für Neutral. Uppercase. |
| **Profile-Seiten** | Gleicher Retro-Manga-Stil. Avatar/Banner als Collectible-Player-Cards, nicht als SaaS-Blocks. Showcases als Manga-Panels. |

**Bestehende CSS-Anchors** (aus `launcher/src/index.css`) wiederverwenden:
- `neo-title`, `neo-copy`, `neo-dots`
- `hero-art`, `card-art-drift`, `card-art-crash`, `card-art-blood`
- `library-art-tokyo`, `library-art-mech`, `library-art-phantom`

**Anti-Patterns (nicht verwenden):**
- ❌ Dark-Blue SaaS-Dashboards
- ❌ Glass-Cards / Glassmorphism
- ❌ Rounded modern app cards
- ❌ Purple/Blue Gradients
- ❌ Floating orb/bokeh backgrounds
- ❌ Große leere Marketing-Sections
- ❌ Generic Tailwind admin panels
- ❌ Soft shadows / blur-heavy elevation

**Theme-Switch (Optional, User-Setting):**
Das Feld `user_settings.theme` existiert bereits in der DB (Werte: `dark`, `light`, `system`). User können zwischen Default-Theme (Retro Manga), Dark und Light wechseln. Beim Theme-Switch bleiben Komponenten identisch, nur die Farb-Token ändern sich.

**Verifikations-Checkliste für neue UI:**
- [ ] Header nutzt `OG-Launcher` als Brand
- [ ] Header-Nav enthält Store, Library, Community, Downloads
- [ ] Hintergrund ist warm paper mit print/halftone-Feel
- [ ] Borders und Shadows sind hard, schwarz, sichtbar
- [ ] Kein rounded/glass/SaaS-Look eingeführt
- [ ] Mobile wrappt ohne Text-Overlap
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm build` grün

**Vollständige Design-Spec:** [`docs/PROJECT_DESIGN.md`](E:\Code\open-game-launcher\docs\PROJECT_DESIGN.md)
---
## 6. Plattform-Support
| Plattform | Support-Level | Einschränkungen |
|---|---|---|
| **Windows** | Voll (Primär) | — |
| **macOS** | Core-Features | Keine Registry-Scans (plist/Dateisystem statt Registry); kein ; keine -Screenshots |
| **Linux** | Core-Features (inkl. ) | Keine Registry; kein ; `/proc` statt für Prozess-Tracking |
| **Steam Deck** | Core-Features (SteamOS-optimiert) | Wie Linux |
| **iOS** | Später | Library-Verwaltung, Chat, Remote Downloads |
| **Android** | Später | Library-Verwaltung, Chat, Remote Downloads |
**Plattformspezifische Feature-Matrix:**
| Feature | Windows | macOS | Linux |
|---------|---------|-------|-------|
| Registry-Scans | Ja | Nein (plist) | Nein (Dateisystem) |

| Screenshots | Ja | Nein | Nein |
| (Controller-Emulation) | Ja | Nein | Nein |
| Prozess-Tracking | | | /proc |
---
## 7. Produktumfang

**Was Open Game Launcher leistet — als fertiges Produkt beschrieben.**

### Kern-Umfang
- Unified Library mit Embedded Mode für alle großen Plattformen (Steam, Epic, GOG, EA, Ubisoft, Battle.net, Xbox)
- Game Launch aus einer einzigen UI, alle Original-Clients silent im Hintergrund
- Spielzeit-Tracking mit Prozess-Monitoring, Crash-Erkennung, Session-Historie
- Achievements (alle verfügbaren offiziellen Quellen + Community-Listen als Fallback)
- Suche, Filter, Sortierung, Collections
- Spieldetailseite mit Custom Artwork, Kategorien, Tags
- Custom-Link Einladungssystem (universell, ehrlich kommuniziert bei Cross-Platform)
- Account-System mit Cloud-Sync und sicherer Token-Verwaltung
- Multi-Drive-Support mit Speicherplatz-Anzeige pro Laufwerk

### Plattform-Integration
- Steam, Epic, GOG, EA App, Ubisoft Connect, Battle.net, Xbox — alle embedded
- Einheitliches Spiele-Modell über alle Quellen (Unified Game Model)
- Non-Launcher Games (Externe Spiele) manuell hinzufügbar, Community-EXE-DB für Auto-Detect
- Plattform-übergreifende Launcher-Status-Indikatoren (Spiel-Besitz pro Plattform sichtbar)

### Social
- Universelle Freundesliste (alle Plattformen mit API + manuelle Verknüpfung)
- Deduplizierung in drei Stufen (verknüpfte Accounts, Heuristik, manuell)
- Echtzeit-Presence über alle verknüpften Plattformen
- Text-Chat (Direktnachrichten + Gruppen, keine Sprach-/Videointegration)
- Cross-Platform-Invites mit ehrlicher UX (klare Kommunikation wenn nicht möglich)
- Friend Activity Feed (Spiel-Starts, Achievements, Screenshots)

### Eigener Store
- Storefront UI (Home, Browse, Produktseite, Warenkorb, Bestellhistorie)
- Payments via externem Anbieter (kein Speichern von Kreditkartendaten im Launcher)
- Developer-Portal (Spiel-Registrierung, Build-Upload, Analytics, Revenue)
- DRM/Lizenz-Management (Offline-Token 30 Tage, Gerätelimit)
- Wishlist mit Preisdrop-Benachrichtigungen
- Bewertungssystem (verifizierte Käufe, Abuse-Schutz, Rate-Limit)
- Eigene Mod-Verwaltung für im Store verkaufte Spiele

### Weitere Features
- Performance-Monitor (FPS, CPU, GPU, RAM)
- Cloud-Save-Sync mit Community-Datenbank für Save-Pfade, Ende-zu-Ende-Verschlüsselung
- Anti-Cheat-Kompatibilitäts-DB (welche Spiele welche Anti-Cheats nutzen, welcher Fallback gilt)
- Backup/Restore lokal mit Komprimierung und inkrementellen Backups
- News-Feed (Steam + andere öffentliche Quellen + eigener Store)
- Preis-Tracker (eigener Store, Fremd-Stores über externe API)
- Family Sharing (eigener Store, bis zu 6 Mitglieder, Kindersicherung)
- DSGVO/Privacy-Tooling (Datenexport JSON, Account-Löschung, Privacy-Einstellungen)
- Screenshots & Medien (Aufnahme, Verwaltung, Privatsphäre-Stufen)
- Controller-Support (Erkennung, Re-Mapping)
- Non-Launcher-Plattform-Scanner für alle unterstützten Stores

### Spätere Erweiterungen
- In-Game Overlay (Windowed/Borderless, Anti-Cheat-Fallback auf externes Fenster)
- Remote Play (Delegation an Steam/Epic, keine eigene Streaming-Engine)
- Mobile App (iOS/Android) für Library, Chat, Remote Downloads
- Mod-Management (Steam Workshop, Bethesda Vortex-Stil, Nexus, CurseForge, Mod.io)
- Smart Install (schnellste Download-Quelle automatisch wählen)
- One-Click Setup (neuer PC: ein Login, alle Stores, Spiele-Erkennung)
- Cross-Store-Save-Sync (Spielstände zwischen Store-Versionen desselben Spiels)
- Game Activity Dashboard ("Dein Gaming-Jahr"-Übersicht)
- Local Multiplayer Hub (Couch-Coop-Setup, Controller-Auto-Konfig)
- Plugin-System (Store-Plugins, Themes, Marketplace)
- Themes/Skins (Dark/Light, Custom Themes, Layout-Optionen)
- AI-Empfehlungen (Mood-basiert, Backlog-Priorisierung)
- Broadcasting (Twitch/YouTube-Integration)
- LAN-Transfer (Netzwerk-Kopie zwischen PCs)
---
## 8. Performance-Ziele
| Metrik | Ziel |
|--------|-----|
| Startup | <2 Sekunden |
| RAM (Idle) | <200 MB |
| CPU (Hintergrund) | Minimal, kein Polling im Idle |
| GPU | Optional, deaktivierbar |
---
## 9. Technische Herausforderungen

| Herausforderung | Ansatz |
|-----------------|--------|
| Launcher ohne offene APIs | Reverse-Engineering der Download-Protokolle + Prozess-Monitoring |
| Overlay bei Fullscreen-Spielen | Nur Windowed/Borderless; Toast-Notifications als Fallback |
| Download-Manager für alle Plattformen | Plattformspezifische Reverse-Engineering-Tools (analog zu bestehenden Community-Tools) |
| Authentifizierung in Desktop-App | Browser-basierter Login-Flow mit Redirect zurück in die App |
| Echtzeit-Kommunikation | Cloud-basierte Echtzeit-Infrastruktur für Presence, Chat, Einladungen |
| Screenshot-Aufnahme | Plattformspezifische APIs (Windows, Linux, macOS) |
| Zahlungsabwicklung | Externer Zahlungsanbieter → Browser → Redirect zurück in App |
| Spiel-Prozess-Tracking | Plattformspezifische Prozess-APIs (Windows, Linux, macOS) |
| Controller-Emulation | Plattformspezifische Treiber, späterer Scope |
| Remote Play | Delegation an bestehende Lösungen, keine eigene Streaming-Engine |
| Save-Pfad-Erkennung | Community-Datenbank + manuelle Konfiguration |
