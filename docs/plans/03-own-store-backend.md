# S3 — Eigener Game Store Backend

> **For Hermes:** Sub-Plan aus `00-master-plan-missing-features.md`. Der Plan (Section 4.1) verspricht einen kompletten eigenen Game-Store als Backend. Im Code fehlen **alle** Store-Tabellen, obwohl es einen `/store` Route und eine `StorePage` gibt — die ist aktuell nur ein Stub. Wir bauen das Backend **8 Sub-Features** davon: Products, Developers, Builds, Cart, Orders, Licenses, Reviews-Extended, Wishlist-Preisdrop-Notifications.

**Goal:** Open Game Launcher Launcher ist nicht nur ein Aggregator, sondern auch ein Store. User können Spiele kaufen (Free, Bezahlt), bewerten, in den Warenkorb, Wunschliste. Developer können Spiele einreichen.

**Architecture:** 8 neue DB-Tabellen, neuer Supabase-Layer, neue Tauri-Commands (für Downloads, License-Validation), neue StorePage mit echten Funktionen, neue DeveloperDashboard-Page, neue Email-Notifications (Supabase Edge Function) bei Preisdrop.

**Tech Stack:** Bestehend. Supabase Postgres + Storage + Edge Functions. `stripe` Crate (für Mock-Payment-Processor, da wir keine echten Payments in Open-Source haben wollen).

**Backlog-Markierung:** Bei Zeitdruck nur Phase 1-4 implementieren (Products, Cart, Orders, Reviews). Phase 5-8 als "Backlog" markieren.

---

## Phase 0: Crate (Stripe-Stub)

### Task 1: `stripe` Stub-Crate

**Files:**
- Modify: `launcher/src-tauri/Cargo.toml`

```toml
stripe = { version = "0.29", default-features = false, features = ["runtime-tokio-hyper"] }
```

**Step 2:** `cargo check`. Build erfolgreich.

**Step 3:** Commit.

---

## Phase 1: Datenbank-Schema (große Migration)

### Task 2: Migration `0012_store_schema.sql`

**Files:**
- Create: `launcher/supabase/migrations/0012_store_schema.sql`

```sql
-- Developer-Accounts (verifizierte Publisher)
create table if not exists public.developers (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  studio_name text not null,
  slug citext unique not null,
  description text,
  website_url text,
  support_email text,
  logo_url text,
  banner_url text,
  is_verified boolean not null default false,
  verified_at timestamptz,
  payout_email text,
  revenue_share_percent numeric(5,2) not null default 70.0 check (revenue_share_percent between 0 and 100),
  total_earnings_cents bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.developers is 'Verified developer accounts that can publish games on the OG-Launcher Store.';

create index if not exists developers_owner_idx on public.developers(owner_user_id);
drop trigger if exists set_developers_updated_at on public.developers;
create trigger set_developers_updated_at
  before update on public.developers
  for each row execute function public.set_updated_at();

grant select on public.developers to authenticated, anon;
grant insert, update, delete on public.developers to authenticated;
alter table public.developers enable row level security;
drop policy if exists developers_read_all on public.developers;
create policy developers_read_all on public.developers
  for select to authenticated, anon
  using (true);
drop policy if exists developers_own_write on public.developers;
create policy developers_own_write on public.developers
  for all to authenticated
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

-- Produkte (Spiele die im Store verkauft werden)
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null unique references public.games(id) on delete cascade,
  developer_id uuid not null references public.developers(id) on delete restrict,
  price_cents int not null default 0 check (price_cents >= 0),
  currency text not null default 'USD' check (length(currency) = 3),
  is_free boolean not null default false,
  is_published boolean not null default false,
  published_at timestamptz,
  sale_price_cents int check (sale_price_cents is null or sale_price_cents >= 0),
  sale_starts_at timestamptz,
  sale_ends_at timestamptz,
  age_rating text check (age_rating in ('E', 'E10+', 'T', 'M', 'AO', 'RP', 'PEGI_3', 'PEGI_7', 'PEGI_12', 'PEGI_16', 'PEGI_18', 'USK_0', 'USK_6', 'USK_12', 'USK_16', 'USK_18')),
  supported_platforms text[] not null default '{}'::text[],
  system_requirements jsonb not null default '{}'::jsonb,
  refund_window_days int not null default 14 check (refund_window_days between 0 and 90),
  total_sales_count int not null default 0,
  total_revenue_cents bigint not null default 0,
  average_rating numeric(3,2) check (average_rating is null or average_rating between 0 and 5),
  review_count int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sale_price_cents is null or sale_price_cents <= price_cents)
);

comment on table public.products is 'Store-front products. Each product maps to exactly one game.';

create index if not exists products_published_idx on public.products(is_published, published_at desc);
create index if not exists products_developer_idx on public.products(developer_id);
create index if not exists products_price_idx on public.products(price_cents);
drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

grant select on public.products to authenticated, anon;
grant insert, update, delete on public.products to authenticated;
alter table public.products enable row level security;
drop policy if exists products_read_published on public.products;
create policy products_read_published on public.products
  for select to authenticated, anon
  using (is_published = true or exists (
    select 1 from public.developers d where d.id = developer_id and d.owner_user_id = auth.uid()
  ));
drop policy if exists products_developer_write on public.products;
create policy products_developer_write on public.products
  for all to authenticated
  using (exists (select 1 from public.developers d where d.id = developer_id and d.owner_user_id = auth.uid()))
  with check (exists (select 1 from public.developers d where d.id = developer_id and d.owner_user_id = auth.uid()));

-- Build-Artefakte (executable + Asset-Bundles)
create table if not exists public.builds (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  version text not null,
  platform text not null,
  architecture text not null default 'x64' check (architecture in ('x64', 'arm64', 'x86', 'universal')),
  executable_path text not null,
  archive_path text not null,
  archive_size_bytes bigint not null,
  archive_sha256 text not null,
  install_size_bytes bigint not null,
  min_os_version text,
  is_latest boolean not null default false,
  is_prerelease boolean not null default false,
  release_notes text,
  changelog_url text,
  download_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, version, platform, architecture)
);

comment on table public.builds is 'Build artifacts per product per platform per version.';

create index if not exists builds_product_platform_idx on public.builds(product_id, platform, is_latest desc) where is_latest;
drop trigger if exists set_builds_updated_at on public.builds;
create trigger set_builds_updated_at
  before update on public.builds
  for each row execute function public.set_updated_at();

grant select on public.builds to authenticated, anon;
grant insert, update, delete on public.builds to authenticated;
alter table public.builds enable row level security;
drop policy if exists builds_read_latest on public.builds;
create policy builds_read_latest on public.builds
  for select to authenticated, anon
  using (true);  -- Builds sind read-only für alle
drop policy if exists builds_developer_write on public.builds;
create policy builds_developer_write on public.builds
  for all to authenticated
  using (exists (
    select 1 from public.products p
    join public.developers d on d.id = p.developer_id
    where p.id = product_id and d.owner_user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.products p
    join public.developers d on d.id = p.developer_id
    where p.id = product_id and d.owner_user_id = auth.uid()
  ));

-- Warenkorb
create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity int not null default 1 check (quantity between 1 and 99),
  added_at timestamptz not null default now(),
  unique (user_id, product_id)
);

comment on table public.cart_items is 'Items in a user cart. Quantity is mostly 1 for digital goods.';

grant select, insert, update, delete on public.cart_items to authenticated;
alter table public.cart_items enable row level security;
drop policy if exists cart_items_own on public.cart_items;
create policy cart_items_own on public.cart_items
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Bestellungen
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_number text unique not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'refunded', 'cancelled', 'chargeback')),
  subtotal_cents int not null,
  tax_cents int not null default 0,
  total_cents int not null,
  currency text not null default 'USD',
  payment_method text check (payment_method in ('stripe', 'paypal', 'crypto', 'gift_card', 'free')),
  payment_intent_id text,
  paid_at timestamptz,
  refunded_at timestamptz,
  refund_reason text,
  billing_address jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.orders is 'Completed orders. Each order contains one or more order_items.';

create index if not exists orders_user_idx on public.orders(user_id, created_at desc);
drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

grant select, insert, update on public.orders to authenticated;
alter table public.orders enable row level security;
drop policy if exists orders_own_read on public.orders;
create policy orders_own_read on public.orders
  for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists orders_own_insert on public.orders;
create policy orders_own_insert on public.orders
  for insert to authenticated
  with check (auth.uid() = user_id);

-- Bestellpositionen
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity int not null default 1 check (quantity between 1 and 99),
  unit_price_cents int not null,
  total_price_cents int not null,
  refunded_quantity int not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.order_items is 'Line items in an order. Snapshot of price at time of purchase.';

grant select on public.order_items to authenticated;
grant insert on public.order_items to authenticated;
alter table public.order_items enable row level security;
drop policy if exists order_items_own on public.order_items;
create policy order_items_own on public.order_items
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

-- Lizenzen (was ein User nach Kauf spielen darf)
create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  order_id uuid references public.orders(id) on delete set null,
  license_key text unique,
  is_active boolean not null default true,
  activated_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  granted_via text not null default 'purchase' check (granted_via in ('purchase', 'gift', 'promotion', 'family_share', 'developer', 'refund')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.licenses is 'Right to play a product. Source: purchase/gift/promotion/family_share/etc.';

create index if not exists licenses_user_product_idx on public.licenses(user_id, product_id);
drop trigger if exists set_licenses_updated_at on public.licenses;
create trigger set_licenses_updated_at
  before update on public.licenses
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.licenses to authenticated;
alter table public.licenses enable row level security;
drop policy if exists licenses_own on public.licenses;
create policy licenses_own on public.licenses
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Reviews-Extended
create table if not exists public.store_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  title text,
  body text,
  is_verified_purchase boolean not null default false,
  helpful_count int not null default 0,
  unhelpful_count int not null default 0,
  is_edited boolean not null default false,
  developer_response text,
  developer_responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id)
);

comment on table public.store_reviews is 'Store product reviews. Separated from user_reviews for clarity.';

create index if not exists store_reviews_product_idx on public.store_reviews(product_id, created_at desc);
drop trigger if exists set_store_reviews_updated_at on public.store_reviews;
create trigger set_store_reviews_updated_at
  before update on public.store_reviews
  for each row execute function public.set_updated_at();

grant select on public.store_reviews to authenticated, anon;
grant insert, update, delete on public.store_reviews to authenticated;
alter table public.store_reviews enable row level security;
drop policy if exists store_reviews_read_all on public.store_reviews;
create policy store_reviews_read_all on public.store_reviews
  for select to authenticated, anon
  using (true);
drop policy if exists store_reviews_own_write on public.store_reviews;
create policy store_reviews_own_write on public.store_reviews
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Trigger: Bei neuem Review Product-Durchschnitt aktualisieren
create or replace function public.update_product_rating() returns trigger as $$
begin
  update public.products
  set
    average_rating = (select avg(rating)::numeric(3,2) from public.store_reviews where product_id = new.product_id),
    review_count = (select count(*) from public.store_reviews where product_id = new.product_id)
  where id = new.product_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_product_rating_on_review on public.store_reviews;
create trigger update_product_rating_on_review
  after insert or update or delete on public.store_reviews
  for each row execute function public.update_product_rating();

-- Price History (für Price-Tracker S8)
create table if not exists public.price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  old_price_cents int,
  new_price_cents int not null,
  change_reason text check (change_reason in ('sale_start', 'sale_end', 'permanent_drop', 'permanent_increase', 'initial', 'update')),
  recorded_at timestamptz not null default now()
);

comment on table public.price_history is 'Historical price changes. Drives wishlist price-drop notifications.';

create index if not exists price_history_product_recorded_idx on public.price_history(product_id, recorded_at desc);
grant select on public.price_history to authenticated, anon;
grant insert on public.price_history to authenticated;

alter table public.price_history enable row level security;
drop policy if exists price_history_read_all on public.price_history;
create policy price_history_read_all on public.price_history
  for select to authenticated, anon
  using (true);
```

**Step 2:** Deploy: `pnpm supabase:db:push`
**Step 3:** Commit.

---

## Phase 2: TypeScript-Layer

### Task 3: Types in `lib/types/store.ts`

**Files:**
- Create: `launcher/src/lib/types/store.ts`

```typescript
export type ProductAgeRating =
  | "E" | "E10+" | "T" | "M" | "AO" | "RP"
  | "PEGI_3" | "PEGI_7" | "PEGI_12" | "PEGI_16" | "PEGI_18"
  | "USK_0" | "USK_6" | "USK_12" | "USK_16" | "USK_18";

export type OrderStatus = "pending" | "paid" | "failed" | "refunded" | "cancelled" | "chargeback";
export type PaymentMethod = "stripe" | "paypal" | "crypto" | "gift_card" | "free";
export type LicenseSource = "purchase" | "gift" | "promotion" | "family_share" | "developer" | "refund";

export interface Developer {
  id: string;
  ownerUserId: string;
  studioName: string;
  slug: string;
  description: string | null;
  websiteUrl: string | null;
  supportEmail: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  isVerified: boolean;
  verifiedAt: string | null;
  payoutEmail: string | null;
  revenueSharePercent: number;
  totalEarningsCents: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  gameId: string;
  developerId: string;
  priceCents: number;
  currency: string;
  isFree: boolean;
  isPublished: boolean;
  publishedAt: string | null;
  salePriceCents: number | null;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  ageRating: ProductAgeRating | null;
  supportedPlatforms: string[];
  systemRequirements: Record<string, unknown>;
  refundWindowDays: number;
  totalSalesCount: number;
  totalRevenueCents: number;
  averageRating: number | null;
  reviewCount: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  effectivePriceCents: number;  // computed
  isOnSale: boolean;            // computed
}

export interface Build {
  id: string;
  productId: string;
  version: string;
  platform: string;
  architecture: "x64" | "arm64" | "x86" | "universal";
  executablePath: string;
  archivePath: string;
  archiveSizeBytes: number;
  archiveSha256: string;
  installSizeBytes: number;
  minOsVersion: string | null;
  isLatest: boolean;
  isPrerelease: boolean;
  releaseNotes: string | null;
  changelogUrl: string | null;
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  id: string;
  userId: string;
  productId: string;
  quantity: number;
  addedAt: string;
  product?: Product;
}

export interface Order {
  id: string;
  userId: string;
  orderNumber: string;
  status: OrderStatus;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  paymentMethod: PaymentMethod | null;
  paymentIntentId: string | null;
  paidAt: string | null;
  refundedAt: string | null;
  refundReason: string | null;
  billingAddress: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
  refundedQuantity: number;
  createdAt: string;
  product?: Product;
}

export interface License {
  id: string;
  userId: string;
  productId: string;
  orderId: string | null;
  licenseKey: string | null;
  isActive: boolean;
  activatedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  grantedVia: LicenseSource;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  product?: Product;
}

export interface StoreReview {
  id: string;
  userId: string;
  productId: string;
  rating: number;
  title: string | null;
  body: string | null;
  isVerifiedPurchase: boolean;
  helpfulCount: number;
  unhelpfulCount: number;
  isEdited: boolean;
  developerResponse: string | null;
  developerRespondedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author?: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
}

export interface PriceHistoryEntry {
  id: string;
  productId: string;
  oldPriceCents: number | null;
  newPriceCents: number;
  changeReason: "sale_start" | "sale_end" | "permanent_drop" | "permanent_increase" | "initial" | "update";
  recordedAt: string;
}
```

**Step:** Commit.

---

### Task 4: Supabase-Layer in `lib/supabase/store.ts`

**Files:**
- Create: `launcher/src/lib/supabase/store.ts`

Funktionen:
- `listPublishedProducts(filter?)`
- `getProduct(productId)`
- `getProductByGameId(gameId)`
- `listProductBuilds(productId)`
- `getMyCart()`
- `addToCart(productId, quantity=1)`
- `removeFromCart(productId)`
- `clearCart()`
- `checkoutCart(paymentMethod) -> { orderId, totalCents }` (Mock — direkt `paid` setzen, keine echte Payment-Integration)
- `getMyOrders()`
- `getOrder(orderId)`
- `getMyLicenses()`
- `hasLicense(productId)`
- `listProductReviews(productId)`
- `submitReview(productId, rating, title, body)`
- `getProductPriceHistory(productId)`

**Step:** Implementiere nach Pattern. Commit.

---

## Phase 3: Tauri-Commands für Downloads/Licenses

### Task 5: Tauri-Command `get_product_download_url`

**Files:**
- Create: `launcher/src-tauri/src/commands/store.rs`

```rust
#[tauri::command]
pub async fn get_product_download_url(
    product_id: String,
    user_id: String,
) -> Result<String, String> {
    // 1. Verify user has active license for product_id
    // 2. Get latest build for user's platform
    // 3. Generate signed URL from Supabase Storage (expires in 1h)
    Ok(url)
}
```

**Step:** Implementiere. Build. Commit.

---

### Task 6: Tauri-Command `validate_license`

**Files:**
- Modify: `launcher/src-tauri/src/commands/store.rs`

```rust
#[tauri::command]
pub async fn validate_license(
    user_id: String,
    product_id: String,
) -> Result<bool, String> {
    // Lookup license, check is_active and not expired
    Ok(true)
}
```

**Step:** Commit.

---

## Phase 4: StorePage neu

### Task 7: StorePage mit echten Funktionen

**Files:**
- Modify: `launcher/src/pages/StorePage.tsx`

**Step 1:** Lade `listPublishedProducts()`. Rendere Grid mit GameCard-Varianten + Preisanzeige + "In Warenkorb"/"Kaufen" Button.

**Step 2:** Filter-Tabs: "Alle", "Free-to-Play", "Im Sale", "Neuerscheinungen", "Top-Bewertet".

**Step 3:** Detail-Modal/Page: Cover, Beschreibung, Altersfreigabe, System-Requirements, Reviews, Related Products.

**Step 4:** Cart-Icon in Header mit Badge (Item-Count) + Cart-Drawer.

**Step 5:** Commit.

---

## Phase 5: DeveloperDashboard (Backlog)

### Task 8: DeveloperDashboard-Page

**Files:**
- Create: `launcher/src/pages/DeveloperDashboardPage.tsx`
- Modify: `launcher/src/app/router.tsx` (Route `/settings/developer`)

**Step 1:** Falls User eine `developers`-Row hat, zeige:
- Studio-Profil-Editor
- Produkt-Liste mit Status (Entwurf/Veröffentlicht/Abgelehnt)
- "Neues Produkt einreichen" Form
- Sales-Stats (Charts via Recharts)

**Step 2:** Falls nicht, zeige "Developer werden" CTA mit Form.

**Step 3:** Sidebar-Item nur für verifizierte Developer.

**Step 4:** Commit.

---

## Phase 6: Edge Function für Preisdrop-Notification (Backlog)

### Task 9: Edge Function `notify-price-drop`

**Files:**
- Create: `supabase/functions/notify-price-drop/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.131.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const { productId, oldPrice, newPrice } = await req.json();
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Find users with this product in user_wishlist
  // Insert notification rows
  return new Response("ok");
});
```

**Step:** Deploy via `supabase functions deploy notify-price-drop`. Setze DB-Trigger der bei UPDATE auf `products.price_cents` diese Function aufruft.

**Step:** Commit.

---

## Done

- [ ] Migration deployed
- [ ] `lib/types/store.ts` + `lib/supabase/store.ts`
- [ ] Tauri-Commands `get_product_download_url` + `validate_license`
- [ ] StorePage mit Cart-Funktionen
- [ ] DeveloperDashboard (Backlog-Phase)
- [ ] Edge Function für Preisdrop (Backlog-Phase)
- [ ] `pnpm typecheck`/`lint`/`build` grün
- [ ] 9 Commits

## Nächste Pläne

Nach S3: **S4 (In-Game Overlay)** — Datei: `docs/plans/04-in-game-overlay.md`.
