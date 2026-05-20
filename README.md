# Open Game Launcher

Ein modernes MVP-Grundgerüst für einen cross-platform Desktop Game Launcher mit
Tauri 2, React, Vite, TypeScript, Tailwind CSS und Rust Commands.

Der erste Fokus liegt auf Windows und Linux. macOS bleibt durch die Tauri- und
Rust-Struktur vorbereitet, ist aber noch kein primäres Ziel.

## Voraussetzungen

- Node.js 20 oder neuer
- pnpm
- Rust stable
- Tauri 2 System-Abhängigkeiten
  - Windows: Microsoft Visual Studio Build Tools und WebView2
  - Linux: WebKitGTK/WebView-Abhängigkeiten passend zur Distribution

## Installation

```bash
cd launcher
pnpm install
```

## Development starten

```bash
pnpm tauri dev
```

Für reines Frontend-Previewing ohne Tauri Runtime:

```bash
pnpm dev
```

Native Commands funktionieren vollständig im Tauri-Fenster. Im reinen Browser
wird die UI geladen, aber Tauri `invoke()` steht nicht zur Verfügung.

## Build erstellen

```bash
pnpm build
pnpm tauri build
```

## Scripts

- `pnpm dev`: startet Vite auf `127.0.0.1:1420`
- `pnpm build`: TypeScript-Check plus Vite Production Build
- `pnpm tauri dev`: startet den Desktop-Launcher über Tauri
- `pnpm tauri build`: erzeugt Desktop-Bundles
- `pnpm typecheck`: führt TypeScript Strict Checks aus
- `pnpm lint`: führt ESLint aus

## Projektstruktur

```text
launcher/
  src/
    components/
      layout/       Sidebar und App Shell
      launcher/     Game-, Store- und Download-Komponenten
      ui/           kleine wiederverwendbare UI-Bausteine
    pages/          Library, Store, Downloads, Settings
    hooks/          lokale React Hooks
    lib/            API Wrapper, Types und Mock-Daten
    App.tsx
    main.tsx
    index.css
  src-tauri/
    src/
      commands/     Rust Command-Module
      main.rs
      lib.rs
    capabilities/
    tauri.conf.json
    Cargo.toml
```

## Tauri Commands

Die React-App ruft native Funktionen ausschließlich über `src/lib/launcher.ts`
auf. Komponenten verwenden also nicht direkt `invoke()`.

- `get_system_info()`: gibt OS, Architektur und App-Version zurück.
- `get_default_install_dir()`: gibt einen sinnvollen Standardpfad für Spiele
  zurück.
- `launch_game(game_id)`: Stub für späteren Prozessstart, aktuell mit Logging
  und Erfolgsmeldung.
- `verify_game_files(game_id)`: Stub für spätere Dateiprüfung, aktuell mit
  simuliertem Ergebnis.
- `start_download(game_id)`: Stub für späteren Download-Manager.

## Aktueller MVP-Umfang

- Dunkles Launcher-Layout mit Sidebar und responsiven Content-Bereichen
- Library mit Mock-Spielen, Status-Badges und Play/Install/Update-Aktionen
- Store-Ansicht mit Beispielspielen und Add-to-Library UI
- Download-Queue mit Progress-Bar und Pause/Resume/Cancel UI
- Settings-Seite mit Installationspfad, lokalen Toggles und Systeminfo
- Sauber getrennte Rust Commands unter `src-tauri/src/commands`

## Sinnvolle nächste Schritte

- Native Folder-Picker Command für Installationspfade ergänzen
- Persistente lokale Config-Datei für Launcher-Einstellungen einführen
- echten Prozessstart für installierte Spiele implementieren
- Download- und Patch-Manager als Rust-Service modellieren
- lokale Library-/Manifest-Dateien definieren
- Auth, Store-Catalog, Entitlements, Payment und CDN später als eigene Services
  anbinden
