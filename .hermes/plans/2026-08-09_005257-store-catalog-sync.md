# Store Catalog Sync Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Replace the current 200-game client-side feed with a server-side materialized catalog that uses IGDB for game metadata and ITAD for current price/reference data across Steam, Epic, GOG, Xbox, EA, Ubisoft, and Battle.net.

**Architecture:** A Supabase Cron-triggered Edge Function syncs games from IGDB (metadata) and ITAD (price/reference data) into a dedicated `store_catalog` table. The frontend reads the catalog and forwards users to official platform stores instead of selling or fulfilling games itself. Existing developer-published products are not part of the OG Store sales flow.

**Tech Stack:** Supabase Edge Functions (Deno), Supabase pg_cron, IGDB API, ITAD API, React/TypeScript frontend.

---

## Current Context / Assumptions

- `store_products` and the legacy developer publishing schema are retained only as historical/backend compatibility surfaces. The OG Store does not list, sell, fulfill, license, or refund developer-published products.
- Current store loading: `StorePage.tsx` reads the server-side `store_catalog`; the catalog is synced from IGDB metadata and ITAD price/reference data.
- `filterSupportedPlatforms` and `isKeyResellerName` already exist in `launcher/src/lib/store-api.ts` and should be reused.
- `StoreProduct` type is the canonical shape the frontend expects.
- ITAD ToS: commercial use allowed if app is public, no data modification, no direct competition. OG Launcher is a game launcher, not a price comparison site. User must register at https://isthereanydeal.com/apps/my/ and set `ITAD_API_KEY` in Supabase secrets.

---

## Proposed Approach

1. **New table `store_catalog`** — stores normalized, deduplicated games enriched from IGDB and priced/reference-linked through ITAD. No `developer_id` constraint. RLS allows public read.
2. **New Edge Function `sync-store-catalog`** — triggered by pg_cron every 6 hours. Discovers games through ITAD, enriches metadata through IGDB, maps supported platforms, and upserts the normalized catalog.
3. **Frontend refactor** — `listApiStoreProducts()` is replaced by `listStoreCatalog()` which reads from Supabase. `StorePage` displays catalog metadata and links users to the relevant official platform store. No OG cart, checkout, order, license, fulfillment, or refund flow is part of this feature.

---

## Step-by-Step Plan

### Task 1: Create `store_catalog` table migration

**Objective:** Create the materialized catalog table with proper RLS.

**Files:**
- Create: `supabase/migrations/20260809010000_store_catalog.sql`

**Step 1: Write migration**

```sql
-- Materialized store catalog synced from external APIs (RAWG + ITAD)
create table if not exists public.store_catalog (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,           -- e.g. "rawg-12345" or "itad-abc"
  source text not null check (source in ('rawg', 'itad')),
  title text not null,
  slug text not null,
  description text,
  short_description text,
  publisher text,
  release_date timestamptz,
  genres text[] not null default '{}',
  tags text[] not null default '{}',
  platforms text[] not null default '{}',
  price_cents integer not null default 0 check (price_cents >= 0),
  discount_percent smallint not null default 0 check (discount_percent between 0 and 100),
  cover_image_url text,
  rating numeric(2,1) check (rating between 0.0 and 5.0),
  ratings_count integer not null default 0,
  downloads_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.store_catalog is 'Materialized game catalog synced from external APIs. Read-only for clients.';

-- Indexes for common queries
create index if not exists idx_store_catalog_platforms on public.store_catalog using gin (platforms);
create index if not exists idx_store_catalog_last_synced on public.store_catalog (last_synced_at desc);
create index if not exists idx_store_catalog_title_trgm on public.store_catalog using gin (title gin_trgm_ops);

-- Grants
grant select on public.store_catalog to authenticated, anon;

-- RLS: everyone can read, no one can write (except service_role)
alter table public.store_catalog enable row level security;
create policy store_catalog_read_all on public.store_catalog
  for select to authenticated, anon
  using (true);
```

**Step 2: Apply migration locally**

Run: `supabase migration up --local`
Expected: `store_catalog` table created.

**Step 3: Commit**

```bash
git add supabase/migrations/20260809010000_store_catalog.sql
git commit -m "feat: add store_catalog table for materialized API catalog"
```

---

### Task 2: Create `sync-store-catalog` Edge Function skeleton

**Objective:** Set up the Deno function with adapters and handler pattern (matching existing `rawg-store-catalog` style).

**Files:**
- Create: `supabase/functions/sync-store-catalog/index.ts`
- Create: `supabase/functions/sync-store-catalog/handler.ts`
- Create: `supabase/functions/sync-store-catalog/adapters.ts`
- Create: `supabase/functions/sync-store-catalog/handler.test.ts`
- Create: `supabase/functions/sync-store-catalog/adapters.test.ts`

**Step 1: Write failing test for handler**

```typescript
// handler.test.ts
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { handleSyncStoreCatalog } from "./handler.ts";

Deno.test("returns 405 for non-POST methods", async () => {
  const request = new Request("https://example.com", { method: "GET" });
  const response = await handleSyncStoreCatalog(request, {
    getRawgApiKey: *** => "test",
    getItadApiKey: *** => "test",
    getSupabaseUrl: *** => "https://test.supabase.co",
    getSupabaseServiceRoleKey: *** => "service-key",
  });
  assertEquals(response.status, 405);
});
```

**Step 2: Run test to verify failure**

Run: `cd supabase/functions/sync-store-catalog && deno test handler.test.ts`
Expected: FAIL — module not found.

**Step 3: Write handler skeleton**

```typescript
// handler.ts
export interface SyncStoreCatalogDeps {
  getRawgApiKey: *** => string;
  getItadApiKey: *** => string;
  getSupabaseUrl: *** => string;
  getSupabaseServiceRoleKey: *** => string;
  fetchJson?: (url: URL) => Promise<unknown>;
  fetchItadPrices?: (titles: string[]) => Promise<Record<string, ItadPrice>>;
}

export interface ItadPrice {
  priceCents: number;
  discountPercent: number;
  storeUrl: string;
  shopName: string;
}

export async function handleSyncStoreCatalog(
  request: Request,
  deps: SyncStoreCatalogDeps,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rawgKey = deps.getRawgApiKey().trim();
  const itadKey = deps.getItadApiKey().trim();
  if (!rawgKey || !itadKey) {
    return new Response(
      JSON.stringify({ error: "RAWG_API_KEY or ITAD_API_KEY not configured." }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  // TODO: implement sync logic
  return new Response(
    JSON.stringify({ synced: 0, message: "Sync not yet implemented." }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
```

**Step 4: Write adapters**

```typescript
// adapters.ts
import type { SyncStoreCatalogDeps } from "./handler.ts";

type EnvReader = { get: (key: string) => string | undefined };

export function createSyncStoreCatalogAdapters(
  env: EnvReader = Deno.env,
): SyncStoreCatalogDeps {
  return {
    getRawgApiKey: *** => env.get("RAWG_API_KEY")?.trim() ?? "",
    getItadApiKey: *** => env.get("ITAD_API_KEY")?.trim() ?? "",
    getSupabaseUrl: *** => env.get("SUPABASE_URL")?.trim() ?? "",
    getSupabaseServiceRoleKey: *** => env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "",
  };
}
```

**Step 5: Write index.ts**

```typescript
// index.ts
import { createSyncStoreCatalogAdapters } from "./adapters.ts";
import { handleSyncStoreCatalog } from "./handler.ts";

const adapters = createSyncStoreCatalogAdapters();

Deno.serve((request) => handleSyncStoreCatalog(request, adapters));
```

**Step 6: Run test to verify pass**

Run: `deno test handler.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add supabase/functions/sync-store-catalog/
git commit -m "feat: add sync-store-catalog edge function skeleton"
```

---

### Task 3: Implement RAWG fetching per supported store

**Objective:** Fetch games from RAWG filtered by official stores, map to supported platforms.

**Files:**
- Modify: `supabase/functions/sync-store-catalog/handler.ts`

**Step 1: Add RAWG store mapping**

```typescript
const RAWG_STORE_FILTERS: Array<{ storeId: number; platform: string }> = [
  { storeId: 1, platform: "Steam" },
  { storeId: 11, platform: "Epic Games" },
  { storeId: 5, platform: "GOG" },
  { storeId: 2, platform: "Xbox" },
  { storeId: 7, platform: "Ubisoft" },   // Uplay on RAWG
  { storeId: 8, platform: "EA" },        // Origin on RAWG
  { storeId: 9, platform: "Battle.net" }, // Battle.net on RAWG
];
```

Note: RAWG store IDs need verification. If a store ID is wrong, the fetch returns empty results and that platform is skipped. The sync should log per-store counts.

**Step 2: Add fetch function**

```typescript
async function fetchRawgGamesForStore(
  storeId: number,
  apiKey: string,
  fetchJson: (url: URL) => Promise<unknown>,
): Promise<RawgGame[]> {
  const games: RawgGame[] = [];
  for (let page = 1; page <= 2; page++) {
    const url = new URL("https://api.rawg.io/api/games");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("stores", String(storeId));
    url.searchParams.set("page", String(page));
    url.searchParams.set("page_size", "40");
    url.searchParams.set("ordering", "-rating");
    const data = await fetchJson(url) as { results?: unknown[] } | null;
    if (!data?.results || !Array.isArray(data.results)) break;
    games.push(...(data.results as RawgGame[]));
  }
  return games;
}
```

**Step 3: Add test**

```typescript
Deno.test("fetches games for each supported store", async () => {
  const calls: string[] = [];
  const mockFetch = (url: URL) => {
    calls.push(url.toString());
    return Promise.resolve({ results: [{ id: 1, name: "Test Game" }] });
  };
  const response = await handleSyncStoreCatalog(
    new Request("https://example.com", { method: "POST" }),
    {
      getRawgApiKey: *** => "test",
      getItadApiKey: *** => "test",
      getSupabaseUrl: *** => "https://test.supabase.co",
      getSupabaseServiceRoleKey: *** => "key",
      fetchJson: mockFetch,
      fetchItadPrices: *** => Promise.resolve({}),
    },
  );
  assertEquals(response.status, 200);
  // Verify all 7 stores were queried
  const storesQueried = new Set(
    calls.map((url) => new URL(url).searchParams.get("stores")),
  );
  assertEquals(storesQueried.size, 7);
});
```

**Step 4: Run test, verify pass**

**Step 5: Commit**

```bash
git add supabase/functions/sync-store-catalog/
git commit -m "feat: fetch RAWG games per supported store"
```

---

### Task 4: Implement ITAD price lookup

**Objective:** Look up current prices for fetched games via ITAD API.

**Files:**
- Modify: `supabase/functions/sync-store-catalog/handler.ts`

**Step 1: Add ITAD client**

ITAD API endpoint: `https://api.isthereanydeal.com/games/prices/v2?key={apiKey}`

Request body: `{ "shops": [61, 35, 16, 48, 6, 11, 34], "games": [{ "title": "Game Name" }, ...] }`

Shop IDs (verify via `https://api.isthereanydeal.com/service/shops/v1?key={apiKey}`):
- Steam: 61
- GOG: 35
- Epic Games: 16
- Xbox Store: 48
- EA Store: 6
- Ubisoft Store: 11
- Battle.net: 34

```typescript
const ITAD_SHOP_IDS: Record<string, number> = {
  "Steam": 61,
  "GOG": 35,
  "Epic Games": 16,
  "Xbox": 48,
  "EA": 6,
  "Ubisoft": 11,
  "Battle.net": 34,
};

async function fetchItadPrices(
  games: Array<{ title: string; platform: string }>,
  apiKey: string,
): Promise<Record<string, ItadPrice>> {
  // ITAD allows batch lookups. Group by title, use first shop that returns a price.
  const titles = games.map((g) => g.title);
  const url = new URL("https://api.isthereanydeal.com/games/prices/v2");
  url.searchParams.set("key", apiKey);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      shops: Object.values(ITAD_SHOP_IDS),
      games: titles.map((title) => ({ title })),
    }),
  });

  if (!response.ok) return {};
  const data = await response.json();
  // Map ITAD response to ItadPrice by title
  const prices: Record<string, ItadPrice> = {};
  for (const entry of data ?? []) {
    const title = entry.title;
    const deal = entry.deals?.[0]; // best/current deal
    if (!title || !deal) continue;
    prices[title] = {
      priceCents: deal.price?.amountInt ?? 0,
      discountPercent: deal.cut ?? 0,
      storeUrl: deal.url ?? "",
      shopName: deal.shop?.name ?? "",
    };
  }
  return prices;
}
```

**Step 2: Add test with mocked ITAD response**

**Step 3: Run test, verify pass**

**Step 4: Commit**

```bash
git commit -m "feat: add ITAD price lookup for catalog games"
```

---

### Task 5: Implement upsert into `store_catalog`

**Objective:** Normalize RAWG+ITAD data and upsert into Supabase.

**Files:**
- Modify: `supabase/functions/sync-store-catalog/handler.ts`

**Step 1: Add upsert logic**

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Inside handler:
const supabase = createClient(
  deps.getSupabaseUrl(),
  deps.getSupabaseServiceRoleKey(),
);

const rows = games.map((game) => {
  const price = itadPrices[game.title];
  return {
    external_id: `rawg-${game.id}`,
    source: "rawg",
    title: game.name,
    slug: game.slug || `rawg-${game.id}`,
    description: game.description_raw || null,
    short_description: platforms.join(" / "),
    publisher: "RAWG Katalog",
    release_date: game.released && !Number.isNaN(Date.parse(game.released))
      ? new Date(game.released).toISOString()
      : null,
    genres: readNames(game.genres),
    tags: readNames(game.tags).slice(0, 8),
    platforms: [platform], // from store mapping
    price_cents: price?.priceCents ?? 0,
    discount_percent: price?.discountPercent ?? 0,
    cover_image_url: readHttpsUrl(game.background_image),
    rating: typeof game.rating === "number" ? game.rating : null,
    ratings_count: game.ratings_count ?? 0,
    downloads_count: game.added ?? 0,
    metadata: {
      apiSource: "rawg",
      externalId: String(game.id),
      platformLinks: price ? { [platform]: price.storeUrl } : {},
      priceUnavailable: !price,
      rawgPlatforms: readNames(game.platforms?.map((p) => p.platform)),
    },
    last_synced_at: new Date().toISOString(),
  };
});

const { error } = await supabase
  .from("store_catalog")
  .upsert(rows, { onConflict: "external_id" });
```

**Step 2: Add test with mocked Supabase client**

**Step 3: Run test, verify pass**

**Step 4: Commit**

```bash
git commit -m "feat: upsert synced games into store_catalog"
```

---

### Task 6: Set up pg_cron trigger

**Objective:** Schedule the sync function every 6 hours.

**Files:**
- Create: `supabase/migrations/20260809020000_store_catalog_cron.sql`

**Step 1: Write migration**

```sql
-- Enable pg_cron if not already enabled
create extension if not exists pg_cron;

-- Schedule store catalog sync every 6 hours
select cron.schedule(
  'sync-store-catalog',
  '0 */6 * * *', -- every 6 hours at minute 0
  $$
  select net.http_post(
    url := 'https://' || current_setting('app.settings.project_ref') || '.supabase.co/functions/v1/sync-store-catalog',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
```

Note: Supabase pg_cron with `net.http_post` requires the `pg_net` extension. Verify both are enabled in your project. Alternatively, use an external cron (GitHub Actions, Vercel Cron, etc.) to call the Edge Function.

**Step 2: Apply migration**

**Step 3: Commit**

```bash
git commit -m "feat: schedule store catalog sync every 6 hours"
```

---

### Task 7: Frontend — read from `store_catalog`

**Objective:** Replace direct RAWG calls with Supabase query.

**Files:**
- Create: `launcher/src/lib/supabase/store-catalog.ts`
- Modify: `launcher/src/lib/store-api.ts` (remove `listApiStoreProducts`, keep filters)
- Modify: `launcher/src/pages/StorePage.tsx` (use new source)
- Test: `launcher/src/lib/__tests__/store-catalog.test.ts`

**Step 1: Write `store-catalog.ts`**

```typescript
import { getSupabaseClient } from "./client";
import type { StoreProduct } from "../types/store";

type StoreCatalogRow = {
  id: string;
  external_id: string;
  title: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  publisher: string | null;
  release_date: string | null;
  genres: string[];
  tags: string[];
  platforms: string[];
  price_cents: number;
  discount_percent: number;
  cover_image_url: string | null;
  rating: number | null;
  ratings_count: number;
  downloads_count: number;
  metadata: Record<string, unknown>;
};

function mapCatalogRowToProduct(row: StoreCatalogRow): StoreProduct {
  return {
    id: row.external_id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    shortDescription: row.short_description,
    developerId: "store-catalog",
    publisher: row.publisher,
    releaseDate: row.release_date,
    genres: row.genres ?? [],
    tags: row.tags ?? [],
    platforms: row.platforms ?? [],
    priceCents: row.price_cents,
    discountPercent: row.discount_percent,
    coverImageUrl: row.cover_image_url,
    trailerUrl: null,
    minSystemRequirements: {},
    recSystemRequirements: {},
    rating: row.rating,
    ratingsCount: row.ratings_count,
    downloadsCount: row.downloads_count,
    status: "published",
    metadata: row.metadata ?? {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function listStoreCatalog(): Promise<StoreProduct[]> {
  const { data, error } = await getSupabaseClient()
    .from("store_catalog")
    .select("*")
    .order("downloads_count", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapCatalogRowToProduct);
}
```

**Step 2: Update `StorePage.tsx`**

Replace `listApiStoreProducts()` with `listStoreCatalog()`:

```typescript
const [hostedResult, catalogResult] = await Promise.allSettled([
  listPublishedProducts(),
  listStoreCatalog(),
]);
```

Keep the existing merge/dedupe logic. Remove the `listApiStoreProducts` import from `store-api.ts` and delete the RAWG client code if no longer used elsewhere.

**Step 3: Write frontend test**

```typescript
// store-catalog.test.ts
import { listStoreCatalog } from "../supabase/store-catalog";

vi.mock("../supabase/client", () => ({
  getSupabaseClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
    })),
  })),
}));

test("returns empty array when catalog is empty", async () => {
  const result = await listStoreCatalog();
  expect(result).toEqual([]);
});
```

**Step 4: Run tests**

Run: `pnpm vitest launcher/src/lib/__tests__/store-catalog.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add launcher/src/lib/supabase/store-catalog.ts launcher/src/pages/StorePage.tsx launcher/src/lib/store-api.ts
git commit -m "feat: read store catalog from Supabase instead of RAWG directly"
```

---

### Task 8: Add platform filter chips to StorePage

**Objective:** Let users filter by store platform (Steam, Epic, etc.).

**Files:**
- Modify: `launcher/src/pages/StorePage.tsx`

**Step 1: Add platform filter UI**

The existing `platform` state already filters. Add chips above the grid:

```tsx
const PLATFORM_CHIPS = ["all", "Steam", "Epic Games", "GOG", "Xbox", "EA", "Ubisoft", "Battle.net"];

// In JSX:
<div className="platform-chips">
  {PLATFORM_CHIPS.map((chip) => (
    <button
      key={chip}
      className={platform === chip ? "chip active" : "chip"}
      onClick={*** => setPlatform(chip)}
    >
      {chip === "all" ? "Alle" : chip}
    </button>
  ))}
</div>
```

**Step 2: Style chips in existing CSS** (reuse `neo-*` classes per AGENTS.md)

**Step 3: Commit**

```bash
git commit -m "feat: add platform filter chips to store page"
```

---

### Task 9: Add pagination / infinite scroll

**Objective:** Handle large catalogs without rendering 1000+ cards at once.

**Files:**
- Modify: `launcher/src/pages/StorePage.tsx`
- Modify: `launcher/src/lib/supabase/store-catalog.ts`

**Step 1: Add pagination to `listStoreCatalog`**

```typescript
export async function listStoreCatalog(options?: {
  limit?: number;
  offset?: number;
  platform?: string;
}): Promise<{ products: StoreProduct[]; total: number }> {
  let query = getSupabaseClient()
    .from("store_catalog")
    .select("*", { count: "exact" })
    .order("downloads_count", { ascending: false });

  if (options?.platform && options.platform !== "all") {
    query = query.contains("platforms", [options.platform]);
  }
  if (options?.limit) {
    query = query.range(options.offset ?? 0, (options.offset ?? 0) + options.limit - 1);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { products: (data ?? []).map(mapCatalogRowToProduct), total: count ?? 0 };
}
```

**Step 2: Update StorePage to use "Load more" button or infinite scroll**

**Step 3: Commit**

```bash
git commit -m "feat: add pagination to store catalog"
```

---

## Files Likely to Change

| File | Action |
|------|--------|
| `supabase/migrations/20260809010000_store_catalog.sql` | Create |
| `supabase/migrations/20260809020000_store_catalog_cron.sql` | Create |
| `supabase/functions/sync-store-catalog/index.ts` | Create |
| `supabase/functions/sync-store-catalog/handler.ts` | Create |
| `supabase/functions/sync-store-catalog/adapters.ts` | Create |
| `supabase/functions/sync-store-catalog/handler.test.ts` | Create |
| `supabase/functions/sync-store-catalog/adapters.test.ts` | Create |
| `launcher/src/lib/supabase/store-catalog.ts` | Create |
| `launcher/src/lib/__tests__/store-catalog.test.ts` | Create |
| `launcher/src/lib/store-api.ts` | Modify (remove RAWG client) |
| `launcher/src/pages/StorePage.tsx` | Modify |
| `supabase/config.toml` | Modify (enable pg_cron if needed) |

---

## Tests / Validation

1. **Unit tests:** `deno test supabase/functions/sync-store-catalog/`
2. **Frontend tests:** `pnpm vitest launcher/src/lib/__tests__/store-catalog.test.ts`
3. **Type check:** `pnpm typecheck` (or `tsc --noEmit`)
4. **Lint:** `pnpm lint`
5. **Build:** `pnpm build`
6. **Manual verification:**
   - Run sync function locally: `supabase functions serve sync-store-catalog`
   - Trigger sync: `curl -X POST http://localhost:54321/functions/v1/sync-store-catalog`
   - Query `store_catalog` in Supabase dashboard
   - Open StorePage in launcher, verify games load with prices

---

## Risks, Tradeoffs, and Open Questions

| Risk | Mitigation |
|------|------------|
| ITAD rate limit (1000/5min) | Batch lookups, sync only every 6h, cache in `store_catalog` |
| RAWG store IDs incorrect | Log per-store fetch counts, alert on 0 results |
| ITAD ToS violation | User must register app, read ToS, ensure OG Launcher qualifies |
| `store_products` vs `store_catalog` ID collision | Use `external_id` prefix (`rawg-`) in catalog, UUID in products |
| Large catalog slows frontend | Pagination + platform filter chips |
| pg_cron not available | Fallback: GitHub Actions cron calling the Edge Function |

**Open Questions:**
1. Should developer-published products also appear in `store_catalog` for unified search? (Recommended: no, keep separate tables, merge client-side.)
2. Should we keep the local example catalog as fallback? (Recommended: yes, for offline/dev.)
3. ITAD shop IDs need verification — should we add a setup script that fetches and validates them? (Recommended: yes, add to `sync-store-catalog` as a `--verify-shops` flag or separate utility.)

---

## Execution Handoff

Plan complete and saved. Ready to execute using subagent-driven-development — I'll dispatch a fresh subagent per task with two-stage review (spec compliance then code quality). Shall I proceed?
