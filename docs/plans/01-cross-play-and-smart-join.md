# S1 — Cross-Platform-Gameplay & Smart-Join

> **For Hermes:** Sub-Plan aus `00-master-plan-missing-features.md`. Der Plan (Section 2.5) verspricht plattformübergreifendes Gameplay zwischen PC und Konsolen mit "Smart-Join" Flow (Ein-Klick-Beitritt in eine Session). Im Code fehlt jegliche DB-Struktur dafür, kein UI-Element existiert.

**Goal:** Cross-Play-Metadaten pro Spiel speichern, Smart-Join-Buttons in Library, Freundes-Aktivität mit "Spielt jetzt" Live-Status.

**Architecture:** Neue Tabelle `game_cross_play` (pro Spiel: unterstützte Plattformen, aktive Status, Latenz-Stats). Neue Tabelle `game_cross_play_reports` (Community-Reports für Smart-Join-Versagen). Erweiterung `friendships`/`user_presence` um `current_session_id` und `current_game_session_id` Verknüpfung.

**Tech Stack:** Bestehend. Supabase Postgres + Storage. Keine neuen Crates.

---

## Phase 1: Datenbank-Schema

### Task 1: Migration `0010_cross_play_schema.sql`

**Files:**
- Create: `launcher/supabase/migrations/0010_cross_play_schema.sql`

```sql
create table if not exists public.game_cross_play (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  platform text not null,
  is_enabled boolean not null default true,
  is_verified boolean not null default false,
  verified_by_user_id uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, platform),
  check (platform in (
    'windows', 'macos', 'linux', 'steam', 'epic', 'gog', 'origin', 'uplay', 'battlenet',
    'xbox', 'playstation', 'switch', 'ios', 'android', 'web'
  ))
);

comment on table public.game_cross_play is 'Tracks which platforms support cross-play for a given game (Steam↔Xbox, etc.).';

drop trigger if exists set_game_cross_play_updated_at on public.game_cross_play;
create trigger set_game_cross_play_updated_at
  before update on public.game_cross_play
  for each row execute function public.set_updated_at();

grant select on public.game_cross_play to authenticated, anon;
grant insert, update, delete on public.game_cross_play to authenticated;
alter table public.game_cross_play enable row level security;
drop policy if exists game_cross_play_read_all on public.game_cross_play;
create policy game_cross_play_read_all on public.game_cross_play
  for select to authenticated, anon
  using (true);
drop policy if exists game_cross_play_insert_auth on public.game_cross_play;
create policy game_cross_play_insert_auth on public.game_cross_play
  for insert to authenticated
  with check (auth.uid() = verified_by_user_id or verified_by_user_id is null);
drop policy if exists game_cross_play_update_own on public.game_cross_play;
create policy game_cross_play_update_own on public.game_cross_play
  for update to authenticated
  using (auth.uid() = verified_by_user_id)
  with check (auth.uid() = verified_by_user_id);

-- Community-Reports wenn Smart-Join nicht funktioniert
create table if not exists public.game_cross_play_reports (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  from_platform text not null,
  to_platform text not null,
  issue text not null check (issue in ('cannot_invite', 'cannot_join', 'desync', 'crash', 'voice_chat', 'other')),
  description text,
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'wontfix')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.game_cross_play_reports is 'Community reports of cross-play issues (smart-join failures, desyncs, etc.)';

drop trigger if exists set_game_cross_play_reports_updated_at on public.game_cross_play_reports;
create trigger set_game_cross_play_reports_updated_at
  before update on public.game_cross_play_reports
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.game_cross_play_reports to authenticated;
alter table public.game_cross_play_reports enable row level security;
drop policy if exists game_cross_play_reports_own on public.game_cross_play_reports;
create policy game_cross_play_reports_own on public.game_cross_play_reports
  for all to authenticated
  using (auth.uid() = reporter_id)
  with check (auth.uid() = reporter_id);
drop policy if exists game_cross_play_reports_read_all on public.game_cross_play_reports;
create policy game_cross_play_reports_read_all on public.game_cross_play_reports
  for select to authenticated
  using (status = 'resolved' or auth.uid() = reporter_id);
```

**Step 2:** Deploy:

```bash
cd E:\Code\open-game-launcher\launcher
pnpm supabase:db:push
```

**Step 3:** Commit:

```bash
git add launcher/supabase/migrations/0010_cross_play_schema.sql
git commit -m "feat(db): add game_cross_play + game_cross_play_reports tables"
```

---

## Phase 2: TypeScript-Layer

### Task 2: Types in `lib/types/crossplay.ts`

**Files:**
- Create: `launcher/src/lib/types/crossplay.ts`

```typescript
export type CrossPlayPlatform =
  | "windows" | "macos" | "linux" | "steam" | "epic" | "gog" | "origin"
  | "uplay" | "battlenet" | "xbox" | "playstation" | "switch" | "ios" | "android" | "web";

export type CrossPlayIssue =
  | "cannot_invite" | "cannot_join" | "desync" | "crash" | "voice_chat" | "other";

export type ReportStatus = "open" | "investigating" | "resolved" | "wontfix";

export interface GameCrossPlay {
  id: string;
  gameId: string;
  platform: CrossPlayPlatform;
  isEnabled: boolean;
  isVerified: boolean;
  verifiedByUserId: string | null;
  verifiedAt: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface GameCrossPlayReport {
  id: string;
  gameId: string;
  reporterId: string;
  fromPlatform: CrossPlayPlatform;
  toPlatform: CrossPlayPlatform;
  issue: CrossPlayIssue;
  description: string | null;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
}
```

**Step 3:** Commit.

---

### Task 3: Supabase-Layer in `lib/supabase/crossplay.ts`

**Files:**
- Create: `launcher/src/lib/supabase/crossplay.ts`

Siehe etabliertes Pattern aus `lib/supabase/profile.ts`. Funktionen:
- `getGameCrossPlay(gameId)`
- `listGameCrossPlay(filter?)`
- `reportCrossPlayIssue(gameId, fromPlatform, toPlatform, issue, description)`
- `getCrossPlayReports(gameId)`

**Step:** Implementiere nach Pattern. Inkludiere localStorage-Fallback.

**Step:** Commit.

---

## Phase 3: Smart-Join UI

### Task 4: CrossPlayBadge-Component

**Files:**
- Create: `launcher/src/components/library/CrossPlayBadge.tsx`

Eine kleine Manga-Panel-Komponente (3 px Border, hard offset shadow), die je nach `platform` ein Lucide-Icon zeigt:
- `<Gamepad2>` für Konsolen
- `<Monitor>` für PC
- `<Smartphone>` für Mobile
- `<Globe>` für Web

Tooltip: "Cross-Play mit {platforms.join(', ')}".

**Step:** Implementiere. Commit.

---

### Task 5: SmartJoinButton in GameCard

**Files:**
- Modify: `launcher/src/components/library/GameCard.tsx`

**Step 1:** Füge einen "Join"-Button hinzu, der erscheint wenn:
- `currentGameSession` existiert in `user_presence` für einen Freund
- Und das Spiel `cross_play` mit dem aktuellen Plattform-User-Plattform hat

**Step 2:** Button → Teal BG, weißer Text, "Spiel beitreten". Klick → `invoke("launch_cross_play_join", { sessionId, platformId })`.

**Step 3:** Visuelle Verifikation: simuliere aktive Session via DB-Insert in `user_presence.current_game_id`. Starte App, Game-Card zeigt Button.

**Step 4:** Commit.

---

### Task 6: Tauri-Command `launch_cross_play_join`

**Files:**
- Create: `launcher/src-tauri/src/commands/crossplay.rs`

```rust
#[tauri::command]
pub async fn launch_cross_play_join(
    session_id: String,
    platform_id: String,
) -> Result<(), String> {
    // 1. Look up session from Supabase
    // 2. Get user's installed game (check user_library)
    // 3. Generate join URI based on platform (steam://run/<id>, egl://launch/<id>, etc.)
    // 4. Open URI via tauri_plugin_opener
    Ok(())
}
```

**Step:** Implementiere. Build. Commit.

---

## Phase 4: Verifikation

### Task 7: Manuelle E2E-Verifikation

**Step 1:** Migration deployed.
**Step 2:** Insert in DB: `insert into game_cross_play (game_id, platform, is_enabled) values ('<id>', 'xbox', true);`
**Step 3:** Insert in DB: `update user_presence set current_game_id = '<id>' where user_id = '<friend_id>';`
**Step 4:** Starte App. GameCard zeigt CrossPlayBadge + SmartJoinButton. Klick → Console-Log zeigt launch URI.
**Step 5:** Mache `pnpm typecheck`/`lint`/`build` grün.
**Step 6:** 7 Commits.

## Nächste Pläne

Nach S1: **S2 (Family Sharing)** — Datei: `docs/plans/02-family-sharing.md`.
