# S5 — Performance-Monitor

> **For Hermes:** Sub-Plan aus `00-master-plan-missing-features.md`. Der Plan (Section 7) verspricht einen Performance-Monitor (FPS, CPU, GPU, RAM, Disk-IO) mit historischen Charts. Im Code fehlt jegliche Metrik-Erfassung. Wir bauen Rust-Polling via `sysinfo`, persistieren in DB, zeigen im Overlay (S4) und in einer neuen Settings-Page.

**Goal:** 1Hz-Polling während ein Spiel läuft, Persistenz in `performance_metrics` Tabelle, Anzeige als Echtzeit-Overlay-Tab (S4) und historische Charts in Settings.

**Architecture:** Neues `perf_monitor.rs` Modul mit Background-Task. Tauri-Event `perf-update` emittiert alle 1s. Frontend subscribed und zeigt Sparkline/Line-Chart. Bei Spiel-Ende wird Average in DB gespeichert.

**Tech Stack:** `sysinfo = "0.30"` (bereits für S4), neue `performance_metrics` Tabelle, `recharts` für Charts (bereits in package.json?).

---

## Phase 0: Dependencies

### Task 1: `recharts` zu package.json

**Files:**
- Modify: `launcher/package.json`

```bash
cd E:\Code\open-game-launcher\launcher
pnpm add recharts
```

**Step:** Commit `package.json` + `pnpm-lock.yaml`.

---

## Phase 1: Datenbank-Schema

### Task 2: Migration `0014_performance_metrics.sql`

**Files:**
- Create: `launcher/supabase/migrations/0014_performance_metrics.sql`

```sql
create table if not exists public.performance_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid references public.games(id) on delete set null,
  session_id uuid not null,
  recorded_at timestamptz not null default now(),
  fps numeric(6,2),
  cpu_percent numeric(5,2),
  gpu_percent numeric(5,2),
  ram_used_mb int,
  gpu_temp_celsius int,
  cpu_temp_celsius int,
  disk_read_mb_per_s numeric(8,2),
  disk_write_mb_per_s numeric(8,2),
  network_up_mb_per_s numeric(8,2),
  network_down_mb_per_s numeric(8,2),
  frame_time_ms numeric(6,2)
);

comment on table public.performance_metrics is '1Hz performance samples while a game is running.';

create index if not exists performance_metrics_user_session_idx on public.performance_metrics(user_id, session_id, recorded_at desc);
create index if not exists performance_metrics_game_idx on public.performance_metrics(game_id, recorded_at desc);

grant select, insert on public.performance_metrics to authenticated;
alter table public.performance_metrics enable row level security;
drop policy if exists performance_metrics_own on public.performance_metrics;
create policy performance_metrics_own on public.performance_metrics
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

**Step:** Deploy. Commit.

---

## Phase 2: Rust-Polling

### Task 3: `perf_monitor.rs` Modul

**Files:**
- Create: `launcher/src-tauri/src/commands/perf_monitor.rs`

```rust
use sysinfo::{System, Pid, Process};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

pub struct PerfMonitorState {
    pub current_session_id: Mutex<Option<Uuid>>,
    pub current_game_pid: Mutex<Option<u32>>,
    pub is_running: Mutex<bool>,
}

impl Default for PerfMonitorState {
    fn default() -> Self {
        Self {
            current_session_id: Mutex::new(None),
            current_game_pid: Mutex::new(None),
            is_running: Mutex::new(false),
        }
    }
}

#[derive(serde::Serialize, Clone)]
pub struct PerfSample {
    pub timestamp: String,
    pub fps: f32,
    pub cpu_percent: f32,
    pub ram_used_mb: u64,
    pub game_cpu_percent: f32,
    pub game_ram_mb: u64,
}

#[tauri::command]
pub fn start_perf_monitoring(
    app: AppHandle,
    state: State<'_, PerfMonitorState>,
    game_pid: u32,
) -> Result<String, String> {
    let session_id = Uuid::new_v4();
    *state.current_session_id.lock().unwrap() = Some(session_id);
    *state.current_game_pid.lock().unwrap() = Some(game_pid);
    *state.is_running.lock().unwrap() = true;

    let app_clone = app.clone();
    std::thread::spawn(move || {
        let mut sys = System::new();
        let mut last_disk = (0u64, 0u64);
        while *app_clone.state::<PerfMonitorState>().is_running.lock().unwrap() {
            sys.refresh_all();
            let game_pid_u32 = *app_clone.state::<PerfMonitorState>().current_game_pid.lock().unwrap();
            let game_pid = Pid::from_u32(game_pid_u32.unwrap_or(0));
            let game_proc = sys.process(game_pid);
            let (game_cpu, game_ram) = match game_proc {
                Some(p) => (p.cpu_usage(), p.memory() / 1024 / 1024),
                None => (0.0, 0),
            };
            let total_ram = sys.used_memory() / 1024 / 1024;
            let sample = PerfSample {
                timestamp: chrono_now(),
                fps: estimate_fps(),
                cpu_percent: sys.global_cpu_usage(),
                ram_used_mb: total_ram,
                game_cpu_percent: game_cpu,
                game_ram_mb: game_ram,
            };
            let _ = app_clone.emit("perf-update", &sample);
            std::thread::sleep(Duration::from_secs(1));
        }
    });
    Ok(session_id.to_string())
}

fn estimate_fps() -> f32 {
    // Heuristik: Wenn Spiel läuft und CPU/GPU hoch → schätze 60-144
    // TODO: echte FPS via DXGI-Frame-Pacing (Windows) oder Vulkan
    60.0
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    format!("{}Z", secs)
}

#[tauri::command]
pub fn stop_perf_monitoring(state: State<'_, PerfMonitorState>) {
    *state.is_running.lock().unwrap() = false;
    *state.current_session_id.lock().unwrap() = None;
    *state.current_game_pid.lock().unwrap() = None;
}
```

**Step 2:** `commands/mod.rs` ergänzen. In `lib.rs` mit `tauri::generate_handler!` registrieren und `.manage(PerfMonitorState::default())` hinzufügen.

**Step 3:** `cargo check`. Build erfolgreich.

**Step 4:** Commit.

---

## Phase 3: Persistenz in DB

### Task 4: Tauri-Command `persist_perf_sample`

**Files:**
- Modify: `launcher/src-tauri/src/commands/perf_monitor.rs`

**Step 1:** Im Polling-Thread zusätzlich: alle 5s einen aggregierten Sample via Supabase-REST-API in `performance_metrics` inserten.

**Step 2:** Alternativ: Frontend sammelt Samples und sendet beim Spiel-Ende ein Batch-Insert.

**Variante B (gewählt):** Frontend subscribed `perf-update` Event, hält Array der letzten 300 Samples (5 min). Bei Spiel-Ende: invoke("save_performance_session", { samples, gameId, sessionId }) → ein bulk-insert in Supabase.

**Step 3:** Build. Commit.

---

## Phase 4: Frontend-Charts

### Task 5: PerfMonitorTab in OverlayPage

**Files:**
- Modify: `launcher/src/pages/OverlayPage.tsx`

**Step 1:** Füge Tab "Performance" hinzu. Subscribe `perf-update` Event. Halte Array in useState.

**Step 2:** Zeige 4 Sparklines (FPS, CPU, GPU, RAM) mit Recharts `<LineChart>`. Werte als Y-Achse, Zeit als X-Achse (last 60 samples).

**Step 3:** Commit.

---

### Task 6: PerfHistoryPage in Settings

**Files:**
- Create: `launcher/src/pages/PerfHistoryPage.tsx`
- Modify: `launcher/src/app/router.tsx` (Route `/settings/performance`)

**Step 1:** Lade `listMyPerfSessions()`. Rendere Liste vergangener Sessions mit Dauer, Avg-FPS, Peak-RAM.

**Step 2:** Klick auf Session → Detail mit Line-Charts (FPS, CPU, GPU, RAM über Zeit).

**Step 3:** Filter: "Letzte 7 Tage", "Letzte 30 Tage", "Alle".

**Step 4:** Commit.

---

## Phase 5: Supabase-Layer

### Task 7: `lib/supabase/performance.ts`

**Files:**
- Create: `launcher/src/lib/supabase/performance.ts`

Funktionen:
- `listMyPerfSessions(limit, since?)`
- `getPerfSession(sessionId)` — alle Samples einer Session
- `savePerfSession(samples, gameId, sessionId)` — bulk-insert

**Step:** Commit.

---

## Done

- [ ] `recharts` installiert
- [ ] Migration `0014_performance_metrics.sql`
- [ ] `perf_monitor.rs` mit Background-Task
- [ ] Persistenz via Frontend-Batch
- [ ] PerfMonitorTab in Overlay
- [ ] PerfHistoryPage in Settings
- [ ] `lib/supabase/performance.ts`
- [ ] `pnpm typecheck`/`lint`/`build` grün
- [ ] 7 Commits

## Nächste Pläne

Nach S5: **S8 (Sammelplan)** — Datei: `docs/plans/08-categories-tags-news-screenshots-prices.md`.
