# Open Game Launcher — Missing-Features Implementation Plan

> **For Hermes:** Dieser Plan ist das Ergebnis der Widerspruchs-Analyse zwischen `C:\Users\Danie\Desktop\FEATURE_PLAN.md` und dem aktuellen Code in `E:\Code\open-game-launcher\`. Er implementiert die **8 im Plan versprochenen Features, die im Code fehlen** (S1–S8 aus dem Analyse-Bericht), im etablierten Schema-, Konventions- und Design-System des Projekts.

**Goal:** 8 große Feature-Bereiche aus dem Feature-Plan nachimplementieren, ohne den bestehenden Code (Heavy-Embedded-Architektur) zu brechen. Jeder Bereich ist ein eigenständiger Sub-Plan mit eigener Migration, eigenen Tauri-Commands, eigener Frontend-Page, eigenem Routen-Eintrag, und eigener Verifikation.

**Architecture:** Migration-First → Rust-Commands (falls nötig) → Supabase-Layer → Validation → React-Components → Router. Bestehende Conventions werden strikt eingehalten.

**Tech Stack:** Tauri 2 + Rust 1.77+, React 18, TypeScript 5.7, Vite 6, Tailwind 3.4, Supabase Postgres + Storage + Realtime, pnpm, Zod 4, Zustand 5, Lucide React.

**Design-System:** Retro Manga Launcher (`docs/PROJECT_DESIGN.md`). Brand: `OG-Launcher`. Header-First. Paper/Ink/Red/Teal. `neo-title`/`neo-copy`/`neo-dots`. Hard offset shadows, thick black borders, NO rounded SaaS-Look.

---

## 0. Übersicht & Priorisierung

| # | Feature | Plan-Section | Priorität | Sub-Plan |
|---|---------|--------------|-----------|----------|
| S1 | Cross-Platform-Gameplay / Smart-Join | 2.5 | Hoch | `01-cross-play-and-smart-join.md` |
| S2 | Family Sharing | 3.5 | Hoch | `02-family-sharing.md` |
| S3 | Eigener Game Store Backend | 4.1 | Hoch | `03-own-store-backend.md` |
| S4 | In-Game Overlay | 4.2 | Mittel | `04-in-game-overlay.md` |
| S5 | Performance-Monitor | 7 | Mittel | `05-performance-monitor.md` |
| S6 | Cloud-Save E2E-Verschlüsselung | 3.4 | Hoch | `06-cloud-save-e2e-encryption.md` |
| S7 | OS-Keychain für Auth-Tokens | 0 | Hoch | `07-os-keychain-tokens.md` |
| S8 | Categories & Tags + News-Feed + Screenshots + Price-Tracker | 1.4, 3.2, 3.8, 3.9 | Mittel | `08-categories-tags-news-screenshots-prices.md` |

**Empfohlene Reihenfolge:**
1. **S7 (OS-Keychain)** — alle anderen Features profitieren von sicherer Token-Speicherung. Kleinster Plan.
2. **S6 (Cloud-Save E2E)** — direkt auf S7 aufbauen, kleiner Plan.
3. **S1 (Cross-Play)** — DB-Schema klein, Logik in Frontend, Smart-Join-Flow mittel.
4. **S2 (Family Sharing)** — Multi-User-Konzept, etabliertes Muster aus Profiles.
5. **S3 (Store Backend)** — größter Plan (8 Sub-Features), komplex.
6. **S4 (Overlay)** — Windows-spezifisch, Tauri-Plugin-Integration.
7. **S5 (Performance-Monitor)** — Rust-Polling + Frontend-Overlay.
8. **S8 (Sammelplan)** — 4 kleine Features gebündelt.

**Gesamt-Schatzen:** 8 Sub-Pläne, je 15–60 Tasks, gesamt ~250 bite-sized Tasks. Bei 2-5 Min pro Task: 8–20 Std reine Implementier-Zeit.

---

## 1. Bestehende Conventions (verbindlich für alle Sub-Pläne)

### 1.1 SQL-Schema-Pattern (siehe `0003_library_cloud_sync.sql`)

```sql
-- 1. UUID-PK
-- 2. user_id mit FK + cascade
-- 3. CHECK constraints für enums
-- 4. JSONB metadata
-- 5. updated_at trigger
-- 6. RLS policy: `for all to authenticated using (auth.uid() = user_id)`
-- 7. Grants: `grant select, insert, update, delete to authenticated`
-- 8. Comments auf Tabelle UND Spalten wo nicht offensichtlich
```

Beispiel-Boilerplate für jede neue Tabelle:

```sql
create table if not exists public.<tabelle> (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- ... felder
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.<tabelle> is '<Beschreibung>';

-- Trigger
drop trigger if exists set_<tabelle>_updated_at on public.<tabelle>;
create trigger set_<tabelle>_updated_at
  before update on public.<tabelle>
  for each row execute function public.set_updated_at();

-- RLS
grant select, insert, update, delete on public.<tabelle> to authenticated;
alter table public.<tabelle> enable row level security;
drop policy if exists <tabelle>_own on public.<tabelle>;
create policy <tabelle>_own on public.<tabelle>
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

### 1.2 TypeScript-Type-Pattern (siehe `lib/types/profile.ts`)

- `camelCase` Felder
- `string | null` statt `string?` für nullable
- `Record<string, unknown>` für JSONB
- Exportierte Interfaces mit `export interface`
- ID-Suffix: `userId`, `createdAt`, `updatedAt` (nicht `user_id`, `created_at`)

### 1.3 Supabase-Layer-Pattern (siehe `lib/supabase/profile.ts`)

- Eine Datei pro Domain in `lib/supabase/<domain>.ts`
- Select-Strings als Template-Literal am Anfang der Datei
- `getSupabaseClient()` für Client-Zugriff
- Helper aus `lib/supabase/helpers.ts`: `assertSingle`, `rowString`, `rowNullableString`, `rowNumber`, `rowBoolean`, `handleError`
- Funktionen: `getX`, `getXById`, `createX`, `updateX`, `deleteX`, `listX`
- Fallback zu localStorage wenn Supabase nicht konfiguriert (siehe `hardwareFallbackStore`-Pattern)
- Errors als `String` zurückgeben, nicht throw

### 1.4 Validation-Pattern (siehe `lib/validation/profile.ts`)

- Zod-Schemas in `lib/validation/<domain>.ts`
- Export Schema + Type
- Validierung am Entry-Point (Tauri-Command oder React-Form)

### 1.5 Tauri-Command-Pattern

- `#[tauri::command]` async wo möglich
- `Result<T, String>` für Fehler
- Command in `src/commands/<domain>.rs` oder `src/commands/<domain>/<sub>.rs`
- In `lib.rs` mit `tauri::generate_handler!` registrieren
- Frontend-Wrapper in `lib/launcher.ts` mit TypeScript-Types

### 1.6 Design-System (siehe `docs/PROJECT_DESIGN.md` + `AGENTS.md`)

- Brand: `OG-Launcher`
- Header: `OG-Launcher` links, Navigation in Header
- Farben: Paper `#fff9ed`/`#f5eedf`, Ink `#171411`, Red `#b7102a`/`#c20b2f`, Teal `#007166`/`#087d6d`, Cyan `#8cf5e4`
- Klassen: `neo-title`, `neo-copy`, `neo-dots`, `border-2` oder `border-[3px] border-black`, `shadow-[3px_3px_0_#1f1c0f]`
- Max-Width: `max-w-[1220px]`
- KEINE rounded corners, KEIN glassmorphism, KEIN blur shadows
- Buttons: Primary = Red BG + white text, Secondary = Teal BG + white text

### 1.7 Router-Pattern (siehe `app/router.tsx`)

- Lazy-loaded Pages mit `React.lazy` + `Suspense`
- Route-Path: kebab-case, optionale Sub-Pfade mit `/settings/<sub>`
- Page-Component-Name = `<PageKey>Page`
- 404: `*` Route zu `NotFoundPage`

### 1.8 Sidebar-Pattern (siehe `components/layout/Sidebar.tsx`)

- `PageKey`-Type in `Sidebar.tsx`
- `navItems`-Array mit `key`, `label`, `icon` (Lucide)
- Horizontal flex mit overflow-x-auto im Header

---

## 2. Test-Strategie

- **Rust:** Tauri-Commands haben keine Unit-Tests im Projekt — überspringen. Stattdessen manuelle Verifikation via `pnpm tauri dev`.
- **SQL:** Jede Migration wird via `pnpm --dir launcher supabase:db:push` deployed und mit `select * from <tabelle>` verifiziert.
- **TypeScript:** `pnpm --dir launcher typecheck` muss grün bleiben.
- **Lint:** `pnpm --dir launcher lint` muss grün bleiben.
- **Build:** `pnpm --dir launcher build` muss grün bleiben.
- **Frontend:** Visuelle Verifikation in `pnpm tauri dev` (Login-Flow, neue Page, neue Component).

**Wichtig:** Der Code wird in Tauri-Build-Compiles getestet. Wenn der Plan TDD puristisch durchziehen will, ist Rust ohne Test-Infrastructure schwer. Wir machen es pragmatisch: Build-grün + manuelle Verifikation pro Task.

---

## 3. Sub-Pläne (Dateien)

| Datei | Inhalt |
|---|---|
| `docs/plans/01-cross-play-and-smart-join.md` | DB-Schema `game_cross_play` + Frontend Smart-Join-Logik + Badges in Library |
| `docs/plans/02-family-sharing.md` | DB-Schema `family_groups` + `family_members` + `parental_controls` + `/settings/family` Page |
| `docs/plans/03-own-store-backend.md` | DB-Schema `products`, `orders`, `cart`, `developers`, `builds`, `licenses`, `reviews_extended` + Store-Backend-Logic + Wishlist-Preisdrop-Trigger |
| `docs/plans/04-in-game-overlay.md` | Rust-Overlay-Window + Shift+Tab-Handler + Anti-Cheat-DB |
| `docs/plans/05-performance-monitor.md` | Rust-Polling für FPS/CPU/GPU/RAM + Frontend-Overlay + Tabelle `performance_metrics` |
| `docs/plans/06-cloud-save-e2e-encryption.md` | AES-GCM-Crypto in Rust + Verschlüsselte Storage-Pfade + Schlüsselableitung pro User |
| `docs/plans/07-os-keychain-tokens.md` | `keyring` Crate in Cargo + Token-Wrapping in `gog.rs`/`epic.rs`/`xbox.rs`/`ea.rs`/`ubisoft.rs`/`battlenet.rs` |
| `docs/plans/08-categories-tags-news-screenshots-prices.md` | 4 kleine Features: `categories`/`tags`/`news_posts`/`screenshots`/`price_history` DBs + UI |

---

## 4. Ausführungs-Reihenfolge (Empfehlung)

```
Phase 1 (Quick Wins, 1-2 Tage):
  S7 → S6

Phase 2 (Foundation, 3-4 Tage):
  S1 → S2

Phase 3 (Big Build, 5-7 Tage):
  S3

Phase 4 (Windows-Specific, 2-3 Tage):
  S4 → S5

Phase 5 (Sammelplan, 2-3 Tage):
  S8

Total: ~14-20 Tage Vollzeit
```

---

## 5. Risiken & Annahmen

- **Ann:** Der bestehende Heavy-Embedded-Ansatz bleibt. Wir bauen **on top**, nicht um.
- **Risiko:** Anti-Cheat für In-Game-Overlay — Vanguard/FACEIT blocken externen Prozess. Plan S4 hat Fallback-Tabelle.
- **Risiko:** Smart-Join-Daten sind schwer zu beschaffen (kein IGDB-Zugang in Projekt). Wir starten mit manueller DB-Pflege + Community-Reports.
- **Risiko:** E2E-Verschlüsselung bricht das bestehende Sync-Format. Komplette Save-Sync-Rewrite nötig (siehe Plan S6).
- **Risiko:** OS-Keychain pro Plattform unterschiedlich (`keyring` Crate abstrahiert das, aber Testen auf Windows/Mac/Linux nötig).
- **Risiko:** Store-Backend ist riesig — Plan S3 hat 8 Sub-Features. Bei Zeitdruck nur 4 implementieren (Products + Cart + Orders + Reviews), Rest markieren als "Backlog".

---

## 6. Done-Definition pro Sub-Plan

- [ ] Migration deployed (`pnpm --dir launcher supabase:db:push`)
- [ ] Tauri-Commands in `lib.rs` registriert
- [ ] Supabase-Layer-Datei in `lib/supabase/<domain>.ts`
- [ ] Validation in `lib/validation/<domain>.ts`
- [ ] Page in `pages/<PageName>Page.tsx` + Route in `app/router.tsx`
- [ ] Sidebar-Item (falls Top-Level-Page) in `components/layout/Sidebar.tsx`
- [ ] `pnpm --dir launcher typecheck` grün
- [ ] `pnpm --dir launcher lint` grün
- [ ] `pnpm --dir launcher build` grün
- [ ] Visuelle Verifikation in `pnpm --dir launcher tauri dev`
- [ ] Design-System-Konformität geprüft (Paper, Ink, Red, Teal, hard offset shadows, keine rounded)
- [ ] Git-Commit pro Task (`git commit -m "feat(<scope>): <description>"`)

---

## 7. Nächste Schritte

1. **Du genehmigst den Master-Plan** → ich schreibe den ersten Sub-Plan (`01-cross-play-and-smart-join.md`).
2. **Oder:** Du wählst eine andere Reihenfolge (z.B. S3 zuerst weil wichtigster Revenue-Treiber).
3. **Oder:** Du willst die Sub-Pläne alle auf einmal sehen (lange Files) statt einzeln freigegeben.

Empfehlung: S7 zuerst (kleinster, größter Security-Impact), dann S6 (Cloud-Save E2E hängt davon ab), dann S1.
