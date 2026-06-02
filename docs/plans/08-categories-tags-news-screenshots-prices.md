# S8 — Categories & Tags, News-Feed, Screenshots, Price-Tracker

> **For Hermes:** Sub-Plan aus `00-master-plan-missing-features.md`. Der Plan (Sections 1.4, 3.2, 3.8, 3.9) verspricht **4 kleine Features** die alle DB-Backed sind. Wir bündeln sie in einem Plan weil sie alle auf `games` referenzieren und Frontend-seitig eine einzelne "GameDetailPage" bereichern.

**Goal:**
- **8.1 Categories & Tags:** Spiele genre/taggen, Library-Filter danach
- **8.2 News-Feed:** Spiele-spezifische News-Posts (Patches, Events)
- **8.3 Screenshots:** User-uploaded Screenshots pro Spiel, Galerie
- **8.4 Price-Tracker:** Historische Preise + Wishlist-Preisdrop (DB bereits in S3 `price_history` definiert; hier nur UI)

**Architecture:** 5 neue DB-Tabellen, neuer Supabase-Layer, neue Components in GameDetailPage.

**Tech Stack:** Bestehend. Supabase Storage (für Screenshots). `chrono` für News-Dates.

---

## Phase 1: Datenbank-Schema (eine große Migration)

### Task 1: Migration `0015_categories_news_screenshots.sql`

**Files:**
- Create: `launcher/supabase/migrations/0015_categories_news_screenshots.sql`

```sql
-- 8.1 Categories (Genres wie RPG, FPS, Strategy; Tags wie "Souls-like")
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  type text not null check (type in ('genre', 'tag', 'theme', 'mode')),
  description text,
  icon_url text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.categories is 'Game categories: genres (RPG/FPS), tags (Souls-like), themes, modes.';

drop trigger if exists set_categories_updated_at on public.categories;
create trigger set_categories_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

grant select on public.categories to authenticated, anon;
grant insert, update, delete on public.categories to authenticated;
alter table public.categories enable row level security;
drop policy if exists categories_read_all on public.categories;
create policy categories_read_all on public.categories
  for select to authenticated, anon
  using (is_active = true);
drop policy if exists categories_admin_write on public.categories;
create policy categories_admin_write on public.categories
  for all to authenticated
  using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'))
  with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'));

-- Game ↔ Category (many-to-many)
create table if not exists public.game_categories (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  assigned_by_user_id uuid references auth.users(id) on delete set null,
  is_community boolean not null default false,
  created_at timestamptz not null default now(),
  unique (game_id, category_id)
);

comment on table public.game_categories is 'Many-to-many: which games have which categories.';

create index if not exists game_categories_game_idx on public.game_categories(game_id);
create index if not exists game_categories_category_idx on public.game_categories(category_id);

grant select, insert, delete on public.game_categories to authenticated;
alter table public.game_categories enable row level security;
drop policy if exists game_categories_read_all on public.game_categories;
create policy game_categories_read_all on public.game_categories
  for select to authenticated, anon
  using (true);
drop policy if exists game_categories_community_write on public.game_categories;
create policy game_categories_community_write on public.game_categories
  for insert to authenticated
  with check (auth.uid() = assigned_by_user_id and is_community = true);
drop policy if exists game_categories_own_delete on public.game_categories;
create policy game_categories_own_delete on public.game_categories
  for delete to authenticated
  using (auth.uid() = assigned_by_user_id);

-- 8.2 News-Feed
create table if not exists public.news_posts (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  category text not null check (category in ('patch', 'event', 'announcement', 'community', 'dlc', 'free_weekend', 'sale')),
  title text not null,
  body text not null,
  summary text,
  image_url text,
  external_url text,
  is_pinned boolean not null default false,
  is_published boolean not null default false,
  published_at timestamptz,
  view_count int not null default 0,
  like_count int not null default 0,
  comment_count int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.news_posts is 'Per-game news posts. Patch notes, events, announcements.';

create index if not exists news_posts_game_published_idx on public.news_posts(game_id, published_at desc) where is_published;
create index if not exists news_posts_category_idx on public.news_posts(category, published_at desc) where is_published;

drop trigger if exists set_news_posts_updated_at on public.news_posts;
create trigger set_news_posts_updated_at
  before update on public.news_posts
  for each row execute function public.set_updated_at();

grant select on public.news_posts to authenticated, anon;
grant insert, update, delete on public.news_posts to authenticated;
alter table public.news_posts enable row level security;
drop policy if exists news_posts_read_published on public.news_posts;
create policy news_posts_read_published on public.news_posts
  for select to authenticated, anon
  using (is_published = true or auth.uid() = author_id);
drop policy if exists news_posts_own_write on public.news_posts;
create policy news_posts_own_write on public.news_posts
  for all to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

-- 8.3 Screenshots
create table if not exists public.game_screenshots (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  uploader_id uuid not null references auth.users(id) on delete cascade,
  image_url text not null,
  thumbnail_url text,
  caption text,
  width int,
  height int,
  file_size_bytes bigint,
  is_public boolean not null default true,
  like_count int not null default 0,
  view_count int not null default 0,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.game_screenshots is 'User-uploaded game screenshots. Public gallery per game.';

create index if not exists game_screenshots_game_idx on public.game_screenshots(game_id, uploaded_at desc);

drop trigger if exists set_game_screenshots_updated_at on public.game_screenshots;
create trigger set_game_screenshots_updated_at
  before update on public.game_screenshots
  for each row execute function public.set_updated_at();

grant select on public.game_screenshots to authenticated, anon;
grant insert, update, delete on public.game_screenshots to authenticated;
alter table public.game_screenshots enable row level security;
drop policy if exists game_screenshots_read_public on public.game_screenshots;
create policy game_screenshots_read_public on public.game_screenshots
  for select to authenticated, anon
  using (is_public = true or auth.uid() = uploader_id);
drop policy if exists game_screenshots_own_write on public.game_screenshots;
create policy game_screenshots_own_write on public.game_screenshots
  for all to authenticated
  using (auth.uid() = uploader_id)
  with check (auth.uid() = uploader_id);

-- Storage Bucket für Screenshots (muss manuell in Supabase Dashboard erstellt werden ODER via SQL)
-- bucket: game-screenshots (public read, authenticated write)
insert into storage.buckets (id, name, public)
values ('game-screenshots', 'game-screenshots', true)
on conflict (id) do nothing;

-- Storage Policy: public read
drop policy if exists "game-screenshots-read-all" on storage.objects;
create policy "game-screenshots-read-all"
on storage.objects for select
to authenticated, anon
using (bucket_id = 'game-screenshots');

-- Storage Policy: authenticated write in eigenem folder
drop policy if exists "game-screenshots-write-own" on storage.objects;
create policy "game-screenshots-write-own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'game-screenshots'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "game-screenshots-delete-own" on storage.objects;
create policy "game-screenshots-delete-own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'game-screenshots'
  and (storage.foldername(name))[1] = auth.uid()::text
);
```

**Step 2:** Deploy: `pnpm supabase:db:push`. **Wichtig:** Der `user_roles`-Join in der categories-RLS-Policy erfordert, dass die Tabelle existiert. Falls nicht, vereinfache die Policy zu `using (true)` für authenticated (kein Admin-Konzept im aktuellen Projekt).

**Step 3:** Commit.

---

## Phase 2: TypeScript-Layer

### Task 2: Types in `lib/types/catalog.ts`

**Files:**
- Create: `launcher/src/lib/types/catalog.ts`

```typescript
export type CategoryType = "genre" | "tag" | "theme" | "mode";
export type NewsCategory = "patch" | "event" | "announcement" | "community" | "dlc" | "free_weekend" | "sale";

export interface Category {
  id: string;
  slug: string;
  name: string;
  type: CategoryType;
  description: string | null;
  iconUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GameCategory {
  id: string;
  gameId: string;
  categoryId: string;
  assignedByUserId: string | null;
  isCommunity: boolean;
  createdAt: string;
  category?: Category;
}

export interface NewsPost {
  id: string;
  gameId: string;
  authorId: string | null;
  category: NewsCategory;
  title: string;
  body: string;
  summary: string | null;
  imageUrl: string | null;
  externalUrl: string | null;
  isPinned: boolean;
  isPublished: boolean;
  publishedAt: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  author?: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
}

export interface GameScreenshot {
  id: string;
  gameId: string;
  uploaderId: string;
  imageUrl: string;
  thumbnailUrl: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  fileSizeBytes: number | null;
  isPublic: boolean;
  likeCount: number;
  viewCount: number;
  uploadedAt: string;
  createdAt: string;
  updatedAt: string;
  uploader?: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
}
```

**Step:** Commit.

---

### Task 3: Supabase-Layer in `lib/supabase/catalog.ts`

**Files:**
- Create: `launcher/src/lib/supabase/catalog.ts`

Funktionen:
- `listCategories(type?)`
- `getGameCategories(gameId)`
- `addCommunityCategory(gameId, categoryId)`
- `removeCommunityCategory(gameId, categoryId)`
- `getGameNews(gameId, limit?)`
- `listRecentNews(limit?)`
- `publishNewsPost(gameId, category, title, body, imageUrl?)` (nur für Game-Owner)
- `uploadGameScreenshot(gameId, file, caption?)` (via Supabase Storage)
- `getGameScreenshots(gameId, limit?)`
- `likeScreenshot(screenshotId)`
- `unlikeScreenshot(screenshotId)`

**Step:** Commit.

---

## Phase 3: Frontend-Komponenten

### Task 4: CategoryChips-Component

**Files:**
- Create: `launcher/src/components/library/CategoryChips.tsx`

**Step 1:** Rendert Pills (Manga-Style: Teal BG, schwarze 2 px Border, hard offset shadow). Zeigt alle `gameCategories` mit Lucide-Icon. Klick → filtert Library.

**Step 2:** Commit.

---

### Task 5: NewsFeed-Component

**Files:**
- Create: `launcher/src/components/games/NewsFeed.tsx`

**Step 1:** Lade `getGameNews(gameId)`. Rendere Liste von Cards mit Titel, Bild, Datum, Summary. Klick → Detail-Modal mit full body.

**Step 2:** Tab-Indicator (Pinned, Patches, Events, Announcements, All).

**Step 3:** Commit.

---

### Task 6: ScreenshotGallery-Component

**Files:**
- Create: `launcher/src/components/games/ScreenshotGallery.tsx`

**Step 1:** Grid von Thumbnails (3 Spalten). Klick → Lightbox (full-size).

**Step 2:** "+ Upload" Button (nur für eingeloggte User mit Game in Library). File-Picker → `uploadGameScreenshot`.

**Step 3:** Commit.

---

### Task 7: PriceChart-Component

**Files:**
- Create: `launcher/src/components/store/PriceChart.tsx`

**Step 1:** Lade `getProductPriceHistory(productId)`. Rendere Recharts `<LineChart>` mit x=recordedAt, y=priceCents.

**Step 2:** "Niedrigster Preis"-Badge + "+ Zum Wunschzettel"-Button (falls eingeloggt + nicht in wishlist).

**Step 3:** Commit.

---

## Phase 4: GameDetailPage-Integration

### Task 8: GameDetailPage

**Files:**
- Create: `launcher/src/pages/GameDetailPage.tsx`
- Modify: `launcher/src/app/router.tsx` (Route `/games/:slug`)

**Step 1:** Page mit Tabs:
- **Übersicht**: Cover, Beschreibung, CategoryChips, "Spielen"-Button
- **News**: NewsFeed
- **Screenshots**: ScreenshotGallery
- **Reviews**: bestehende `user_reviews` (in S3 erweitert zu `store_reviews`)
- **Preis**: PriceChart (falls in Store)
- **Achievements**: bestehende achievements-UI

**Step 2:** `pnpm tauri dev` → navigiere zu `/games/<slug>`, alle Tabs prüfen.

**Step 3:** Commit.

---

## Phase 5: Library-Filter

### Task 9: Category-Filter in Library

**Files:**
- Modify: `launcher/src/pages/LibraryPage.tsx`

**Step 1:** Sidebar mit Checkbox-Liste aller Categories (Genres + Tags). Klick togglet Filter. Library rendert nur Spiele mit angehakten Categories.

**Step 2:** Commit.

---

## Phase 6: Verifikation

### Task 10: E2E + Build

**Step 1:** Insert seed-data in DB für 1 Spiel: 2-3 Categories, 2 News, 2 Screenshots.

**Step 2:** `pnpm tauri dev` → Detail-Page zeigt alle 4 Tabs mit Inhalt.

**Step 3:** `pnpm typecheck`/`lint`/`build` grün.

**Step 4:** 10 Commits.

---

## Done

- [ ] Migration `0015_categories_news_screenshots.sql`
- [ ] `lib/types/catalog.ts` + `lib/supabase/catalog.ts`
- [ ] CategoryChips + NewsFeed + ScreenshotGallery + PriceChart
- [ ] GameDetailPage mit 6 Tabs
- [ ] Library-Filter
- [ ] `pnpm typecheck`/`lint`/`build` grün
- [ ] 10 Commits

## Nächste Schritte

Nach S8 sind **alle 8 Sub-Pläne** fertig. Master-Plan in `00-master-plan-missing-features.md` ist komplett.
