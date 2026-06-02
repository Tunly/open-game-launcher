# S2 — Family Sharing

> **For Hermes:** Sub-Plan aus `00-master-plan-missing-features.md`. Der Plan (Section 3.5) verspricht "Family Sharing" (bis zu 6 Accounts teilen sich Spiele), aber im Code fehlt jegliche DB-Struktur. Es gibt nur `friendships` (peer-to-peer). Wir bauen ein hierarchisches Multi-User-Modell mit Parental Controls.

**Goal:** Ein User (Admin/Organizer) lädt bis zu 5 weitere User in eine "Family Group" ein. Gekaufte Spiele sind für alle sichtbar/spielbar. Optional Parental Controls (Spielzeit-Limit, Altersfreigabe-Filter) pro Mitglied.

**Architecture:** 3 neue Tabellen: `family_groups` (Owner), `family_members` (Join mit Rolle), `parental_controls` (Per-Child-Config). Frontend-Page `/settings/family`. LibraryBadge "Family" wenn Spiel von Familienmitglied stammt.

**Tech Stack:** Bestehend. Supabase Postgres. Keine neuen Crates.

---

## Phase 1: Datenbank-Schema

### Task 1: Migration `0011_family_sharing_schema.sql`

**Files:**
- Create: `launcher/supabase/migrations/0011_family_sharing_schema.sql`

```sql
-- Eine Familie pro Haushalt
create table if not exists public.family_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  invite_code text unique,
  max_members int not null default 6 check (max_members between 2 and 10),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.family_groups is 'A family group sharing library access. One owner, up to N members.';

drop trigger if exists set_family_groups_updated_at on public.family_groups;
create trigger set_family_groups_updated_at
  before update on public.family_groups
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.family_groups to authenticated;
alter table public.family_groups enable row level security;
drop policy if exists family_groups_owner_all on public.family_groups;
create policy family_groups_owner_all on public.family_groups
  for all to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Mitglieder
create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.family_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('organizer', 'adult', 'teen', 'child')),
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, user_id)
);

comment on table public.family_members is 'Members of a family group with role (organizer/adult/teen/child).';

create index if not exists family_members_user_idx on public.family_members(user_id);
create index if not exists family_members_family_idx on public.family_members(family_id);

drop trigger if exists set_family_members_updated_at on public.family_members;
create trigger set_family_members_updated_at
  before update on public.family_members
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.family_members to authenticated;
alter table public.family_members enable row level security;

-- Mitglieder sehen sich selbst; Organizer sehen alle in ihrer Familie
drop policy if exists family_members_own_read on public.family_members;
create policy family_members_own_read on public.family_members
  for select to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.family_groups fg
      where fg.id = family_id and fg.owner_id = auth.uid()
    )
  );

drop policy if exists family_members_own_insert on public.family_members;
create policy family_members_own_insert on public.family_members
  for insert to authenticated
  with check (
    auth.uid() = user_id
    or exists (
      select 1 from public.family_groups fg
      where fg.id = family_id and fg.owner_id = auth.uid()
    )
  );

drop policy if exists family_members_owner_update on public.family_members;
create policy family_members_owner_update on public.family_members
  for update to authenticated
  using (
    exists (
      select 1 from public.family_groups fg
      where fg.id = family_id and fg.owner_id = auth.uid()
    )
  );

drop policy if exists family_members_self_delete on public.family_members;
create policy family_members_self_delete on public.family_members
  for delete to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.family_groups fg
      where fg.id = family_id and fg.owner_id = auth.uid()
    )
  );

-- Parental Controls (nur für child/teen)
create table if not exists public.parental_controls (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.family_groups(id) on delete cascade,
  child_user_id uuid not null references auth.users(id) on delete cascade,
  daily_playtime_minutes int check (daily_playtime_minutes is null or daily_playtime_minutes between 0 and 1440),
  weekday_playtime_minutes int check (weekday_playtime_minutes is null or weekday_playtime_minutes between 0 and 1440),
  weekend_playtime_minutes int check (weekend_playtime_minutes is null or weekend_playtime_minutes between 0 and 1440),
  allowed_age_ratings text[] not null default '{}'::text[],
  block_unrated_games boolean not null default false,
  playtime_window_start time,
  playtime_window_end time,
  require_approval_for_purchase boolean not null default true,
  require_approval_for_chat boolean not null default true,
  blocked_game_ids uuid[] not null default '{}'::uuid[],
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, child_user_id)
);

comment on table public.parental_controls is 'Parental restrictions per child account in a family group.';

drop trigger if exists set_parental_controls_updated_at on public.parental_controls;
create trigger set_parental_controls_updated_at
  before update on public.parental_controls
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.parental_controls to authenticated;
alter table public.parental_controls enable row level security;
drop policy if exists parental_controls_parent_all on public.parental_controls;
create policy parental_controls_parent_all on public.parental_controls
  for all to authenticated
  using (
    auth.uid() = child_user_id
    or exists (
      select 1 from public.family_groups fg
      where fg.id = family_id and fg.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.family_groups fg
      where fg.id = family_id and fg.owner_id = auth.uid()
    )
  );
```

**Step 2:** Deploy: `pnpm supabase:db:push`
**Step 3:** Commit.

---

## Phase 2: TypeScript-Layer

### Task 2: Types in `lib/types/family.ts`

**Files:**
- Create: `launcher/src/lib/types/family.ts`

```typescript
export type FamilyRole = "organizer" | "adult" | "teen" | "child";

export interface FamilyGroup {
  id: string;
  ownerId: string;
  name: string;
  inviteCode: string | null;
  maxMembers: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FamilyMember {
  id: string;
  familyId: string;
  userId: string;
  role: FamilyRole;
  joinedAt: string;
  removedAt: string | null;
  createdAt: string;
  updatedAt: string;
  profile?: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
}

export interface ParentalControls {
  id: string;
  familyId: string;
  childUserId: string;
  dailyPlaytimeMinutes: number | null;
  weekdayPlaytimeMinutes: number | null;
  weekendPlaytimeMinutes: number | null;
  allowedAgeRatings: string[];
  blockUnratedGames: boolean;
  playtimeWindowStart: string | null;
  playtimeWindowEnd: string | null;
  requireApprovalForPurchase: boolean;
  requireApprovalForChat: boolean;
  blockedGameIds: string[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
```

**Step:** Commit.

---

### Task 3: Supabase-Layer in `lib/supabase/family.ts`

**Files:**
- Create: `launcher/src/lib/supabase/family.ts`

Funktionen:
- `getMyFamilyGroup()`
- `createFamilyGroup(name)`
- `inviteFamilyMember(inviteCode)` — generiert Invite-Code, fügt via Code ein
- `removeFamilyMember(memberId)`
- `getParentalControls(childUserId)`
- `setParentalControls(childUserId, controls)`
- `checkPlaytimeAllowed(childUserId) -> { allowed: boolean, remainingMinutes: number | null }` — aggregiert über family_members + parental_controls

**Step:** Commit.

---

## Phase 3: Frontend-Page

### Task 4: FamilyPage

**Files:**
- Create: `launcher/src/pages/FamilyPage.tsx`
- Modify: `launcher/src/app/router.tsx`
- Modify: `launcher/src/components/layout/Sidebar.tsx`

**Step 1:** FamilyPage als Manga-Panel mit:
- Header: "Familien-Sharing"
- Sektion "Meine Familie": Name, Invite-Code, Mitglieder-Liste (Avatar + Username + Rolle)
- Sektion "Mitglied hinzufügen": Code-Input oder Username-Suche
- Sektion "Parental Controls" (nur für Organizer, pro Kind): Form mit Playtime-Limit, Altersfreigabe-Whitelist, Blockliste, Zeitfenster

**Step 2:** Route `/settings/family` registrieren (existierende `SettingsPage` hat wahrscheinlich Sub-Routes).

**Step 3:** Sidebar-Item hinzufügen mit `Users` Lucide-Icon.

**Step 4:** Visuelle Verifikation in `pnpm tauri dev`. Sollte wie ein Manga-Panel aussehen (Paper-BG, 3 px Black Border, hard offset shadow).

**Step 5:** Commit.

---

### Task 5: LibraryBadge "Family"

**Files:**
- Modify: `launcher/src/components/library/GameCard.tsx`

**Step 1:** Wenn Game in `user_library` von einem Familienmitglied existiert (nicht dem aktuellen User), zeige Badge "Familie" in Teal.

**Step 2:** Commit.

---

### Task 6: Playtime-Enforcer

**Files:**
- Create: `launcher/src/components/ParentalPlaytimeEnforcer.tsx`
- Modify: `launcher/src/commands/games/playtime.rs` (oder gleichwertig)

**Step 1:** Wenn ein Spiel gestartet wird, prüfe `checkPlaytimeAllowed(childUserId)`. Wenn `false`, zeige Manga-Modal "Spielzeit-Limit erreicht" und breche Start ab.

**Step 2:** Tauri-Command `enforce_parental_controls(gameId) -> Result<{ allowed: boolean, reason: string | null }>`.

**Step 3:** Commit.

---

## Done

- [ ] Migration deployed
- [ ] 2 TypeScript-Dateien (types, supabase)
- [ ] FamilyPage + Route + Sidebar
- [ ] LibraryBadge "Familie"
- [ ] Playtime-Enforcer
- [ ] `pnpm typecheck`/`lint`/`build` grün
- [ ] 6 Commits

## Nächste Pläne

Nach S2: **S3 (Store Backend)** — Datei: `docs/plans/03-own-store-backend.md`.
