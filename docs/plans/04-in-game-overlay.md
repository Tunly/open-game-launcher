# S4 — In-Game Overlay

> **For Hermes:** Sub-Plan aus `00-master-plan-missing-features.md`. Der Plan (Section 4.2) verspricht ein In-Game Overlay (Shift+Tab wie Steam, mit Freundes-Status, Achievements, Chat). Im Code fehlt jegliche Overlay-Logik. Wir bauen einen separaten transparenten Tauri-Webview-Window, der per Global-Shortcut aktiviert wird.

**Goal:** Shift+Tab öffnet ein transparentes Always-on-Top-Overlay mit Freundes-Liste, aktuellem Chat, Achievement-Progress. Nur Windows-Primary (macOS/Linux als Stub).

**Architecture:** Neues Tauri-Window mit `transparent: true`, `always_on_top: true`, `decorations: false`. Global-Shortcut-Plugin für Shift+Tab. Overlay rendert via React, kommuniziert via `emit`/`listen` mit Main-Window. Anti-Cheat-Erkennung via Process-Scanning.

**Tech Stack:** `tauri-plugin-global-shortcut` (bereits in `Cargo.toml`?), `tauri-plugin-window-state`. Neues `tauri-plugin-process` für Anti-Cheat-Detection.

**Risiko:** Anti-Cheat (Vanguard, FACEIT, EAC) blocken externe Prozesse. Wir bauen Fallback: Bei blockierten Spielen zeigt Overlay einen Hinweis "Overlay deaktiviert wegen Anti-Cheat".

---

## Phase 0: Dependencies

### Task 1: Cargo-Dependencies hinzufügen

**Files:**
- Modify: `launcher/src-tauri/Cargo.toml`

```toml
tauri-plugin-global-shortcut = "2"
sysinfo = "0.30"  # für Process-Scanning
```

**Step 2:** `cargo check`. Build erfolgreich.

**Step 3:** Commit.

---

## Phase 1: Anti-Cheat-Detection

### Task 2: `anti_cheat.rs` Modul

**Files:**
- Create: `launcher/src-tauri/src/commands/anti_cheat.rs`

```rust
use sysinfo::System;
use serde::Serialize;

const KNOWN_ANTI_CHEAT_PROCESSES: &[&str] = &[
    "vgtray.exe",         // Vanguard
    "faceit.exe",         // FACEIT
    "easyanticheat_x64.exe",
    "anticheat_x64.exe",
    "beservice.exe",      // BattlEye
    "nProtect.exe",
    "xigncode.exe",
];

#[derive(Debug, Serialize, Clone)]
pub struct AntiCheatStatus {
    pub is_detected: bool,
    pub detected_processes: Vec<String>,
    pub overlay_blocked: bool,
}

pub fn detect_anti_cheat() -> AntiCheatStatus {
    let mut sys = System::new();
    sys.refresh_processes();
    let mut detected = Vec::new();
    for proc in sys.processes().values() {
        let name = proc.name().to_string_lossy().to_string();
        if KNOWN_ANTI_CHEAT_PROCESSES.iter().any(|ac| name.eq_ignore_ascii_case(ac)) {
            detected.push(name);
        }
    }
    AntiCheatStatus {
        is_detected: !detected.is_empty(),
        detected_processes: detected,
        overlay_blocked: !detected.is_empty(),
    }
}

#[tauri::command]
pub fn check_anti_cheat() -> AntiCheatStatus {
    detect_anti_cheat()
}
```

**Step 3:** `commands/mod.rs` ergänzen. Build. Commit.

---

### Task 3: Migration `0013_anti_cheat_blocklist.sql`

**Files:**
- Create: `launcher/supabase/migrations/0013_anti_cheat_blocklist.sql`

```sql
-- Games with known anti-cheat that block our overlay
create table if not exists public.game_anti_cheat (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  anti_cheat text not null check (anti_cheat in ('vanguard', 'faceit', 'easyanticheat', 'battleye', 'nprotect', 'xigncode', 'other')),
  blocks_overlay boolean not null default true,
  notes text,
  reported_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, anti_cheat)
);

comment on table public.game_anti_cheat is 'Per-game anti-cheat detection. Some anti-cheats block our overlay.';

drop trigger if exists set_game_anti_cheat_updated_at on public.game_anti_cheat;
create trigger set_game_anti_cheat_updated_at
  before update on public.game_anti_cheat
  for each row execute function public.set_updated_at();

grant select on public.game_anti_cheat to authenticated, anon;
grant insert, update, delete on public.game_anti_cheat to authenticated;
alter table public.game_anti_cheat enable row level security;
drop policy if exists game_anti_cheat_read_all on public.game_anti_cheat;
create policy game_anti_cheat_read_all on public.game_anti_cheat
  for select to authenticated, anon
  using (true);
drop policy if exists game_anti_cheat_report on public.game_anti_cheat;
create policy game_anti_cheat_report on public.game_anti_cheat
  for insert to authenticated
  with check (auth.uid() = reported_by_user_id or reported_by_user_id is null);
```

**Step:** Deploy. Commit.

---

## Phase 2: Overlay-Window

### Task 4: Overlay-Window-Konfiguration in `tauri.conf.json`

**Files:**
- Modify: `launcher/src-tauri/tauri.conf.json`

**Step 1:** Füge ein zweites Window hinzu:

```json
{
  "label": "overlay",
  "url": "overlay.html",
  "title": "OG-Launcher Overlay",
  "width": 800,
  "height": 600,
  "transparent": true,
  "decorations": false,
  "alwaysOnTop": true,
  "skipTaskbar": true,
  "resizable": true,
  "visible": false
}
```

**Step 2:** Erstelle `launcher/overlay.html` (einfaches Bootstrap-HTML, lädt React-App).

**Step 3:** Commit.

---

### Task 5: Global Shortcut Registration in `lib.rs`

**Files:**
- Modify: `launcher/src-tauri/src/lib.rs`

```rust
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

.setup(|app| {
    // ... existing code ...

    let overlay_shortcut = Shortcut::new(Some(Modifiers::SHIFT), Code::Tab);
    let app_handle = app.handle().clone();
    app.handle().plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |_app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    let _ = app_handle.emit("toggle-overlay", ());
                }
            })
            .build(),
    )?;
    app.global_shortcut().register(overlay_shortcut)?;
    Ok(())
})
```

**Step 2:** `cargo check`. Build erfolgreich. Commit.

---

### Task 6: OverlayPage in `pages/OverlayPage.tsx`

**Files:**
- Create: `launcher/src/pages/OverlayPage.tsx`
- Modify: `launcher/src/overlay.html` (eigener React-Entry)

**Step 1:** Erstelle `overlay.html` mit eigenem React-Root und kleinerer Bundle.

**Step 2:** OverlayPage zeigt:
- Top-Bar: Aktuelles Spiel + Online-Status
- Tab-1: Freunde (Liste mit Online-Status, currentGame, "Join"-Button)
- Tab-2: Chat (recent messages, send new)
- Tab-3: Achievements (current game, recent unlocks)
- Tab-4: Performance (FPS, CPU, GPU, RAM) — siehe S5

**Step 3:** Window ist transparent (rgba bg), Text/UI auf Manga-Paper. Border 3 px Black, hard offset shadow.

**Step 4:** Listener `listen("toggle-overlay", ...)` um Sichtbarkeit zu togglen.

**Step 5:** Visuelle Verifikation: Starte App, drücke Shift+Tab. Overlay öffnet.

**Step 6:** Commit.

---

## Phase 3: Anti-Cheat-Block-UI

### Task 7: Anti-Cheat-Status in Overlay

**Files:**
- Modify: `launcher/src/pages/OverlayPage.tsx`

**Step 1:** Beim Mount: `invoke("check_anti_cheat")`. Wenn `is_detected: true`, zeige Banner oben: "Overlay deaktiviert: {detected_processes.join(', ')} erkannt."

**Step 2:** Commit.

---

## Done

- [ ] Cargo-Deps
- [ ] `anti_cheat.rs` mit Detection
- [ ] Migration `0013_anti_cheat_blocklist.sql`
- [ ] Overlay-Window in `tauri.conf.json`
- [ ] Global Shortcut Shift+Tab
- [ ] OverlayPage mit 4 Tabs
- [ ] Anti-Cheat-Block-UI
- [ ] `pnpm typecheck`/`lint`/`build` grün
- [ ] 7 Commits

## Nächste Pläne

Nach S4: **S5 (Performance-Monitor)** — Datei: `docs/plans/05-performance-monitor.md`.
