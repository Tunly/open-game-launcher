# Open Game Launcher

Desktop game launcher built with Tauri 2, React, TypeScript, Tailwind CSS, Rust, and Supabase. Native game library, store discovery, downloads, achievements, profiles, friends, chat, and launcher settings.

## Status

| Area                | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop shell       | Tauri 2, custom title bar, frameless window, window-bounds guard                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Visual system       | Retro Manga Launcher (`docs/PROJECT_DESIGN.md`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Library             | Installed-game scan, cache, manual add, move, launch, favorites, hidden, collections, custom categories, dynamic collections, footer Friends & Chat handoff, and file integrity verify/repair                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Unified game model  | Cross-platform type with launcher source, external id, install path, metadata, playtime, artwork, achievements, saves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| External libraries  | Local/client library detection and staged connector paths for Steam, GOG, Epic (Legendary), Xbox, Game Pass, Ubisoft, Battle.net, EA; live provider proof remains under `provider-live-integrations`                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Downloads           | Persistent queue, resumable HTTP jobs, optional SHA-256 verification, GOG chunk-verified downloads, external launcher tracking                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Cloud saves         | OG Launcher no longer stores first-party save archives. Games use their platform/provider-native cloud-save support.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Achievements        | Local Xbox/Steam sync paths and cross-platform aggregation contracts; provider-status display for GOG/Epic/EA/Ubisoft/Battle.net; local JSON sidecar import; Epic public-fallback scraping; local cache-readiness packet plus no-write hosted hydration contract proof with provider/hosted write guards; live provider E2E proof remains external                                                                                                                                                                                                                                                                                                                  |
| Cross-Play          | `game_universal_id` mapping, CrossPlayBadge, Smart-Join button in friends list, `launch_cross_play_join` command, local IGDB staged import preview/readiness                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Presence            | Supabase Realtime client paths, local platform hooks, overlay friends tab, platform polling Edge Function source/contract, local provider-bridge contract matrix; scheduled hosted polling proof remains open                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Chat & invites      | Direct messages, group chat rooms, game invites, universal-friends links via Supabase Realtime, and owner-scoped friend merge-group dedup contracts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Community           | Authenticated Supabase friend activity with realtime updates and real friends-only status posts. Static hubs, market/workshop data, and broadcast contract fixtures are restricted to explicit `?verify=...` routes.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Local DB sync       | SQLite-backed local-first entity sync with dirty tracking and remote conflict resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Store               | Hosted catalog/order schema and entitlement downloads are deployed. Bundled preview products are explicitly non-commerce; paid checkout, refunds, and webhook fulfillment remain disabled until real Stripe secrets and provider configuration are supplied.                                                                                                                                                                                                                                                                                                                                                                                                        |
| Mods                | Installer engine (URL/Archive/Folder, Steam-Workshop extractor), enable/disable, queue, cancel, and provider delegation. Pause is explicitly unsupported instead of reporting a false paused state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Setup               | Local One-Click Setup readiness tape for new-PC bootstrap plus local hosted/provider E2E readiness gates for auth, OAuth/token replay, silent install, consent, rollback, and a rollback/audit no-write contract                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Plugin System       | Local Settings readiness panel for read-only folder/JSON manifest discovery, static policy ledger, signed local package staging into a disabled registry, native disabled-registry audit evidence, native runtime sandbox process-boundary proof with deterministic blocked escape fixtures, native activation-plan review that keeps staged packages blocked until a production sandbox exists, native signed update-envelope review with disabled-registry manifest-hash matching, signed marketplace/update-index trust packet review, browser-cache separation, permission, theme-hook, sandbox, marketplace, and update-signing gates without plugin execution |
| In-Game Overlay     | Separate transparent always-on-top Tauri window (no game-process injection), 4 tabs (Freunde/Chat/Erfolge/Performance), live opacity/dock/FPS-HUD settings, configurable global hotkey with Shift+F1 default, anti-cheat guard, DXGI FPS, and NVML GPU metrics                                                                                                                                                                                                                                                                                                                                                                                                      |
| Performance-Monitor | Overlay tab with Recharts + `FpsHudPage` + `/settings/performance` history with real CPU/RAM/FPS/GPU, DXGI frame-pacing, NVML, explicit `overlay-runtime` attribution, ActivitySection→Performance query cross-filtering, local Overlay E2E and fullscreen/anti-cheat readiness panels, and `/activity` yearly playtime recap                                                                                                                                                                                                                                                                                                                                       |
| Auth/Profile/Social | Supabase Auth, profile pages, deployed privacy/RLS guards, friends, chat, customization, blocks, comments, showcases, badges, atomic social links, and hardware. Browser-local family groups are device-bound previews and do not claim real borrowing or seat enforcement.                                                                                                                                                                                                                                                                                                                                                                                         |
| Custom Artwork      | Drag-Drop-Upload in GameDetails + RAWG Edge Function proxy contract with source-policy evidence and HTTP handler coverage + asset cache + Auto-Artwork-Kandidaten mit Apply/Replace und Steam-CDN/App-ID-Policy + lokale Community-Artwork-Import-Galerie mit browser-lokalem Vote-Ledger plus Hosted/Supabase staging schema, RLS, approved-feed helper, upload/moderation UI, service-role review RPC contract, private moderator allowlist, trusted moderation Edge Function handler coverage, moderator console preview, provider scan policy, and audit ledger evidence; production deployment/community rollout proof remains external                        |
| Deep Links          | `oglauncher://` URI handler (`useDeepLink` hook)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Tests               | Local frontend, frontend coverage, Rust, Deno Edge, Node operational, screenshot-inventory, DOM, static-class, and current-platform Tauri debug-bundle smoke gates are covered by `pnpm completion:gate:local`; fresh command output is the source of truth for mutable counts                                                                                                                                                                                                                                                                                                                                                                                      |
| Releases            | Tauri bundling + draft GitHub Releases on `v*` tags only after the `hosted-production` external release-boundary gate passes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

Local completion boundary: this checkout is locally verified against the
automated, screenshot, DOM, and static-class evidence in
[`docs/verification/local-completion-audit.md`](./docs/verification/local-completion-audit.md).
External release evidence remains tracked in [`FEATURE_PLAN.md`](./FEATURE_PLAN.md)
under the five gate IDs reported by `pnpm external:evidence:status`:
`store-stripe-live`, `hosted-supabase-cron`, `provider-live-integrations`,
`hardware-os-e2e`, and `rollout-tracks`.
`pnpm completion:gate:status` reports aggregate readiness/prerequisite state
for the local-plus-external boundary, including the external `0/5` readiness
summary, without enumerating those gate IDs as the source of truth.
`/settings?verify=external-completion-evidence-summary` summarizes the external
completion lanes from the runbook as a local no-write evidence map and keeps
Store/Stripe, hosted cron, provider-live, hardware/OS, and rollout proof open
until the CLI preflight sees real redacted artifacts. Marketplace and production deployment proof are required rows inside `rollout-tracks`.

## Tech Stack

| Area            | Technology                                                           |
| --------------- | -------------------------------------------------------------------- |
| Runtime         | Tauri 2                                                              |
| Frontend        | React 19, Vite 6, TypeScript 5.7                                     |
| Routing         | React Router DOM 7                                                   |
| State           | Zustand 5                                                            |
| Styling         | Tailwind CSS 3.4, Retro Manga design tokens                          |
| Native          | Rust 1.95.0 pinned (edition 2021)                                    |
| Backend         | Supabase Auth, Database, Storage, Realtime                           |
| Validation      | Zod 4                                                                |
| Tooling         | Node.js >=22.12 <26 (CI: 22.12.0), pnpm 9.15.4, Supabase CLI 2.104.0 |
| Icons           | Lucide React                                                         |
| Package manager | pnpm                                                                 |

## Getting Started

```bash
cd launcher
pnpm install
```

Create `launcher/.env.local`:

```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

RAWG artwork via Edge Function (`supabase/functions/rawg-assets`) with Deno-tested handler coverage:

```bash
pnpm supabase secrets set RAWG_API_KEY=your_rawg_key
pnpm supabase functions deploy rawg-assets
```

For local Edge Function testing, create `supabase/functions/.env.local` with `RAWG_API_KEY=...` and run:

```bash
pnpm supabase functions serve rawg-assets --env-file ../supabase/functions/.env.local
```

Start desktop app:

```bash
pnpm tauri dev
```

Frontend-only (browser):

```bash
pnpm dev
```

## Scripts

Run from `launcher/`:

| Command                        | Description                            |
| ------------------------------ | -------------------------------------- |
| `pnpm dev`                     | Vite on `127.0.0.1:1420`               |
| `pnpm build`                   | TypeScript + Vite production build     |
| `pnpm preview`                 | Serve built frontend                   |
| `pnpm tauri dev`               | Tauri desktop dev mode                 |
| `pnpm tauri build -- --locked` | Desktop bundles with frozen Cargo deps |
| `pnpm typecheck`               | TypeScript checks                      |
| `pnpm lint`                    | ESLint (zero-warning)                  |
| `pnpm format`                  | Prettier write pass                    |
| `pnpm format:check`            | Prettier verification                  |
| `pnpm test`                    | Vitest frontend tests                  |
| `pnpm test:watch`              | Vitest watch mode                      |
| `pnpm test:cov`                | Vitest coverage run                    |

Run from the repository root:

| Command                         | Description                          |
| ------------------------------- | ------------------------------------ |
| `pnpm supabase <args>`          | Supabase CLI 2.104.0 via launcher    |
| `pnpm supabase:functions:check` | Deno check for Supabase Edge sources |

## Routes

| Route                         | Purpose                                                                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                           | Redirects to `/library`                                                                                                                  |
| `/home`                       | Launcher home                                                                                                                            |
| `/library`                    | Game library                                                                                                                             |
| `/store`                      | Store discovery, cart, checkout, orders                                                                                                  |
| `/community`                  | Community activity board + per-game hubs + local content staging + discussions/workshop/market/moderation + local broadcasting readiness |
| `/news`                       | News feed                                                                                                                                |
| `/mods`                       | Mods browser + install queue                                                                                                             |
| `/downloads`                  | Download queue + local readiness panels                                                                                                  |
| `/friends`                    | Friends, requests, search, blocks, smart-join                                                                                            |
| `/family`                     | Family sharing + invites + browser-local relay fallback                                                                                  |
| `/achievements`               | Achievements dashboard                                                                                                                   |
| `/activity`                   | Yearly game activity recap                                                                                                               |
| `/auth`                       | Sign in/sign up                                                                                                                          |
| `/invite/:token`              | Share-link invite web fallback                                                                                                           |
| `/u/:username`                | Public profile + `/u/:username?verify=profile-privacy-guard` local privacy guard evidence                                                |
| `/settings`                   | Launcher settings                                                                                                                        |
| `/settings/profile`           | Edit profile + `/settings/profile?verify=social-link-visibility-editor` local social-link visibility editor proof                        |
| `/settings/profile/customize` | Theme/showcase customization                                                                                                             |
| `/settings/performance`       | Performance history and playtime detail filters                                                                                          |
| `/settings/privacy`           | Visibility controls                                                                                                                      |
| `/developer`                  | Developer Portal (store management)                                                                                                      |
| `/overlay`                    | In-Game Overlay window (friends/chat/achievements/perf)                                                                                  |
| `/fps-hud`                    | Standalone FPS HUD                                                                                                                       |
| `*`                           | 404 not found                                                                                                                            |

## Repository Structure

```
.
├── AGENTS.md                          # Collaboration instructions
├── docs/
│   ├── PROJECT_DESIGN.md              # Design system
│   └── references/                    # Ubisoft reverse-engineering refs
├── launcher/
│   ├── src/
│   │   ├── app/
│   │   │   ├── App.tsx                # Root component + AuthProvider
│   │   │   ├── providers/             # Auth context + provider
│   │   │   └── router.tsx             # React Router config
│   │   ├── components/
│   │   │   ├── friends/               # FriendRequestList, FriendsList, UserSearch
│   │   │   ├── launcher/              # DownloadCard, StoreGameCard
│   │   │   ├── layout/                # AppLayout, AppShell, Sidebar, DesktopWindowChrome
│   │   │   ├── library/               # GameDetails, LibraryRow, LibrarySidebar, PlatformIcons
│   │   │   ├── profile/               # ProfileHeader, ProfileBanner, ProfileAvatar, etc.
│   │   │   │   └── showcases/         # 9 showcase components (8 panels plus ShowcasePanel wrapper)
│   │   │   └── ui/                    # Button, ConfirmDialog
│   │   ├── context/                   # Shared React context providers
│   │   ├── hooks/                     # useCurrentUser, useLocalStorageState
│   │   ├── lib/
│   │   │   ├── supabase/              # client, config, helpers, profile, social, presence, local-entity-sync
│   │   │   ├── types/                 # Domain types
│   │   │   ├── validation/            # Zod schemas
│   │   │   ├── launcher.ts            # Tauri invoke wrappers
│   │   │   ├── library-filters.ts     # Library filtering logic
│   │   │   └── mock-data.ts           # Store preview seed data
│   │   ├── pages/                     # 25 page components including NotFound
│   │   ├── stores/                    # Zustand stores (downloadStore)
│   │   └── main.tsx
│   └── src-tauri/
│       └── src/
│           ├── commands/
│           │   ├── system.rs          # System, hardware, Steam login/scrape
│           │   ├── gog.rs             # GOG OAuth, library, downloads, provider cloud saves
│           │   ├── epic.rs            # Epic (Legendary) auth + library
│           │   ├── xbox.rs            # Xbox login, library, Game Pass, achievements
│           │   ├── battlenet.rs       # Battle.net login + game scraping
│           │   ├── ea.rs              # EA token management + library
│           │   ├── ubisoft.rs         # Ubisoft local config parsing
│           │   ├── downloads/         # Download queue, lifecycle, health, history, install
│           │   ├── http.rs            # Generic HTTP download worker
│           │   ├── local_db.rs        # Local SQLite entity sync
│           │   └── games/
│           │       ├── core.rs        # Game CRUD, launch, uninstall
│           │       ├── verify.rs      # File verification + repair
│           │       ├── sync.rs        # Local save-cache sync
│           │       ├── detect.rs      # Game detection helpers
│           │       ├── playtime.rs    # Playtime tracking
│           │       └── types.rs       # Game types
│           ├── lib.rs                 # Command registration
│           └── main.rs
├── supabase/
│   ├── seed.sql
│   └── functions/
│       ├── rawg-assets/               # RAWG API artwork proxy
│       ├── stripe-create-checkout/    # Stripe checkout session EF
│       ├── stripe-webhook/            # Stripe fulfillment webhook
│       ├── store-download-build/      # Entitled store build tickets
│       ├── store-order-support/       # Authenticated order support/refunds
│       ├── poll-platform-presence/    # Secret-gated presence polling endpoint
│       ├── ingest-playtime/           # Trusted playtime ingestion
│       ├── ingest-achievements/       # Attestation-gated achievement ingestion
│       ├── export-user-data/          # Account data export
│       ├── request-account-deletion/  # Account deletion request
│       ├── cancel-account-deletion/   # Account deletion cancel
│       ├── process-account-deletions/ # Account deletion processor
│       ├── invite-hosted-proof/       # Hosted invite replay/origin proof
│       ├── community-artwork-moderation/ # Trusted artwork moderation
│       └── _shared/                   # Shared Edge helpers and Deno tests
├── LICENSE                            # AGPL-3.0
└── README.md
```

## Native Commands

Accessed through `launcher/src/lib/launcher.ts`. Do not call `invoke()` directly.

### System & Hardware

| Command                     | Behavior                                                                  |
| --------------------------- | ------------------------------------------------------------------------- |
| `get_system_info()`         | OS, architecture, app version                                             |
| `get_default_install_dir()` | Platform-aware default install dir                                        |
| `get_hardware_info()`       | CPU, GPU, RAM, peripherals                                                |
| `get_disk_info()`           | Disk capacity, free space, filesystem, kind, removable/read-only metadata |

### Steam

| Command                                           | Behavior                                   |
| ------------------------------------------------- | ------------------------------------------ |
| `open_steam_login_window()`                       | Steam OpenID login WebView                 |
| `open_steam_scraper_window(steamId)`              | Hidden Steam owned-games scraper           |
| `fetch_steam_owned_games(steamId)`                | Local Steam cache + community page parsing |
| `fetch_steam_profile_name(steamId)`               | Steam display name via Steam XML API       |
| `sync_game_achievements(game, steamId?, apiKey?)` | Steam achievement sync via Web API         |

### GOG

| Command                         | Behavior                                          |
| ------------------------------- | ------------------------------------------------- |
| `open_gog_login_window()`       | GOG OAuth login window                            |
| `gog_exchange_code(code)`       | Exchange OAuth code for access/refresh token      |
| `gog_refresh_token_command()`   | Refresh stored GOG token if expired               |
| `gog_get_token()`               | Return native secure-store GOG token              |
| `gog_logout()`                  | Delete stored GOG token                           |
| `gog_fetch_owned_games()`       | Fetch owned GOG library (catalog API + fallback)  |
| `gog_get_download_info(gameId)` | GOG installer metadata (files, chunks, checksums) |
| `gog_start_download(gameId)`    | Native GOG download with chunk verification       |
| `gog_get_cloud_saves(gameId)`   | List GOG cloud save files                         |

### Epic

| Command                             | Behavior                                              |
| ----------------------------------- | ----------------------------------------------------- |
| `open_epic_login_window()`          | Epic login via Legendary CLI auth flow                |
| `authenticate_epic_legendary(code)` | Epic SID/code → Legendary auth, no browser token copy |
| `fetch_epic_owned_games()`          | Legendary-owned Epic games                            |

### Xbox

| Command                                     | Behavior                                |
| ------------------------------------------- | --------------------------------------- |
| `open_xbox_login_window()`                  | Xbox Live OAuth login WebView           |
| `fetch_xbox_owned_games(code)`              | Xbox auth → linked PC title history     |
| `launch_xbox_game(pfn)`                     | Launch Xbox game by package family name |
| `install_xbox_game(pfn)`                    | Open Microsoft Store by PFN/Product ID  |
| `fetch_game_pass_catalog(language, market)` | Localized PC Game Pass catalog          |
| `sync_xbox_achievements(gameId, titleId)`   | Xbox Live achievements                  |

### Battle.net

| Command                                    | Behavior                               |
| ------------------------------------------ | -------------------------------------- |
| `open_battlenet_login_window()`            | Battle.net login + owned game scraping |
| `process_battlenet_games_payload(payload)` | Decode base64 Battle.net games JSON    |

### EA

| Command                  | Behavior                                     |
| ------------------------ | -------------------------------------------- |
| `open_ea_login_window()` | EA login, captures bearer token              |
| `ea_get_token()`         | Return native secure-store EA token if valid |
| `ea_logout()`            | Delete stored EA token                       |
| `ea_fetch_owned_games()` | Fetch owned EA library                       |

### Ubisoft

| Command                       | Behavior                                    |
| ----------------------------- | ------------------------------------------- |
| `fetch_ubisoft_owned_games()` | Parse locally cached Ubisoft Connect config |

### Game Management

| Command                               | Behavior                                         |
| ------------------------------------- | ------------------------------------------------ |
| `list_installed_games()`              | Installed-game cache with overrides              |
| `refresh_installed_games()`           | Scan + write local cache                         |
| `add_manual_game(input)`              | Add installed game path to cache                 |
| `update_game_metadata(input)`         | Update cover, logo, achievements, saves, friends |
| `import_library_snapshot(games)`      | Bulk-import game entries                         |
| `move_game(input)`                    | Move install dir + update cache                  |
| `launch_game(gameId)`                 | Launch installed / open URI for owned            |
| `uninstall_game(gameId)`              | Remove game + managed install dir                |
| `cache_supabase_access_token(token?)` | Save/clear Supabase token for cloud sync         |

### Verification & Updates

| Command                       | Behavior                                          |
| ----------------------------- | ------------------------------------------------- |
| `verify_game_files(gameId)`   | Check installed files against OG SHA-256 manifest |
| `repair_game_files(gameId)`   | Validate local package and re-extract to repair   |
| `check_game_updates()`        | Check OG-managed games for version updates        |
| `install_game_update(gameId)` | Re-download to apply update                       |

### Cloud Save Sync

First-party cloud-save sync commands were removed. OG Launcher does not upload,
download, encrypt, restore, or resolve conflicts for user save files; provider
clients remain responsible for cloud saves.

### Downloads

| Command                                                                                                      | Behavior                                                                                            |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `start_download(gameId, title?, downloadUrl?, downloadSha256?, installManifestUrl?, installManifestSha256?)` | Queue HTTP download or external launcher tracker, optionally with a signed install-manifest sidecar |
| `pause_download(gameId)`                                                                                     | Pause/resume download                                                                               |
| `cancel_download(gameId)`                                                                                    | Cancel download + cleanup                                                                           |
| `archive_download(gameId)`                                                                                   | Remove completed/cancelled download from queue                                                      |
| `get_download_queue()`                                                                                       | Persistent native queue                                                                             |

### Community / Broadcasting

| Command                                        | Behavior                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------ |
| `get_broadcast_stream_key_vault_status(input)` | Return non-secret local stream-key vault metadata for a provider/channel       |
| `set_broadcast_stream_key_secret(input)`       | Save a consent-matched broadcast stream key in the desktop secure store        |
| `clear_broadcast_stream_key_secret(input)`     | Clear a consent-matched broadcast stream key and its non-secret local metadata |

### Local Database Sync

| Command                                 | Behavior                                     |
| --------------------------------------- | -------------------------------------------- |
| `get_pending_local_entities()`          | Dirty entities needing remote sync           |
| `get_all_local_entities()`              | All local entities regardless of sync status |
| `mark_local_entities_synced(entities)`  | Clear dirty flag after sync                  |
| `apply_remote_local_entities(entities)` | Apply remote data with conflict resolution   |
| `get_local_database_path()`             | Filesystem path to local SQLite DB           |
| `get_local_sync_status()`               | Pending change count + last sync timestamp   |

### Cross-Play & Smart-Join

| Command                                             | Behavior                           |
| --------------------------------------------------- | ---------------------------------- |
| `get_cross_play_platforms(universalGameId)`         | Lookup cross-play combinations     |
| `launch_cross_play_join(universalGameId, platform)` | Launch game on compatible platform |

| Command | Behavior |
| ------- | -------- |

### Mods

| Command                                     | Behavior                                 |
| ------------------------------------------- | ---------------------------------------- |
| `install_mod_from_url(input)`               | Download + SHA-256 + extract mod archive |
| `scan_game_mods(gameId)`                    | Detect installed mods for a game         |
| `enable_mod(modId)` / `disable_mod(modId)`  | Toggle mod activation                    |
| `uninstall_mod(modId)`                      | Remove mod + cleanup                     |
| `set_mod_provider_secret(provider, secret)` | Store API key for mod.io/CurseForge      |
| `run_mod_provider_staging_probe(input)`     | Run redacted mod.io/CurseForge probe     |

### Family Sharing

| Client API                        | Behavior                               |
| --------------------------------- | -------------------------------------- |
| `createFamilyGroup(name)`         | Create a hosted or browser-local group |
| `joinFamilyGroup(inviteCode)`     | Join a hosted or same-browser group    |
| `listFamilyMembers(familyId)`     | Enumerate visible group members        |
| `listFamilySharedGames(familyId)` | Read hosted or local preview entries   |

The React `/family` route keeps the hosted Supabase path, but falls back to a clearly labelled, device-bound browser preview when Supabase is not configured. Browser-local invite codes work only inside that browser profile and do not provide license borrowing, cross-device membership, or seat enforcement.

### In-Game Overlay

| Command                              | Behavior                                                   |
| ------------------------------------ | ---------------------------------------------------------- |
| `toggle_in_game_overlay()`           | Show/hide separate transparent Tauri window (no injection) |
| `is_overlay_blocked_by_anti_cheat()` | Scan running processes for AC                              |
| `poll_performance_metrics()`         | CPU/RAM/FPS/GPU/Frame-Time sample                          |
| `report_frame_rendered()`            | DXGI frame-pacing tick                                     |

### First-party Cloud Save Crypto (removed)

Removed with first-party cloud-save storage. No launcher-managed save encryption
key or encrypted save archive is created.

<!-- Historical command table retained only for migration archaeology.
| Command                  | Behavior                                                |
| ------------------------ | ------------------------------------------------------- |
| `generate_cloud_key()`   | Create AES-256-GCM master key in OS keychain            |
| `rotate_cloud_key()`     | Replace master key, re-encrypt                          |
| `is_cloud_key_present()` | Check keychain for key                                  |
| `encrypt_file(path)`     | AES-256-GCM + Argon2id → `${user_id}/${game_id}/...enc` |
| `decrypt_file(path)`     | Decrypt + verify meta                                   |
-->

### Store / Stripe

| Command                                 | Behavior                                                                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `create_stripe_checkout_session(items)` | Start server-priced Stripe checkout via EF with automatic tax, tax ID collection, billing address collection, and invoice creation params |
| `validate_license(token)`               | Ed25519 offline license token check (30-day, device limit)                                                                                |

## Supabase

Migrations cover account, profile, social, chat, and game data. Auth owns user id; `handle_new_user()` trigger creates profile/settings/rows.

### Tables

Profiles & accounts: `profiles`, `profile_private`, `user_settings`.

Profile system: `profile_themes`, `user_profile_cosmetics`, `profile_showcases`, `profile_comments`, `user_badges`, `user_social_links`, `user_hardware`.

Game catalog: `games`, `game_external_ids`, `achievements`.

Social & presence: `user_presence`, `platform_accounts`, `friend_links`, `friendships`, `user_blocks`, `friend_merge_groups`.

Library & stats: `user_library`, `user_game_stats`, `game_sessions`, `user_achievements`, `achievement_progress`, `user_wishlist`, `user_reviews`, `user_playtime_stats_writes`.

Activity & collections: `user_devices`, `user_notifications`, `user_activity`, `user_game_collections`, `user_game_collection_items`.

Library snapshot sync: `user_library_snapshots`. First-party Cloud-Save tables `user_cloud_save_sets` and `user_cloud_save_files` were removed.

Chat & invites: `chat_rooms`, `chat_room_members`, `chat_messages`, `game_invites`, `share_tokens` (hashed public invite-token envelopes with narrow create/resolve/redeem RPCs).

Local entity sync: `launcher_local_entities`.

Cross-Play: `game_universal_ids`, `cross_play_combinations`.

Mods: `managed_mods`, `mod_profiles`, `mod_catalog`, `mod_catalog_versions`, `mod_catalog_user_installs`, `mod_catalog_dependencies`.

Store: `products`, `orders` (Stripe subtotal/tax/total and payment intent), `store_order_invoices`, `store_order_refund_requests`, `store_stripe_webhook_events`, `cart_items`, `licenses`, `store_reviews`.

Family: `families`, `family_members`, `family_invites`.

### RLS Helpers

`can_view_profile()`, `can_view_visibility()`, `is_friend()`, `is_blocked()`, `is_username_available()`, `build_dm_pair_key()`, `private.is_chat_room_member()`.

### Storage Buckets

`avatars`, `profile-banners`, `profile-showcases`, `game-artwork` (public). `game-saves`, `store-builds` (private).

### Realtime

`user_presence`, `chat_messages`, `game_invites` are on the `supabase_realtime` publication.

### Edge Functions

`rawg-assets` (RAWG artwork proxy with adapter-level env/auth/fetch coverage), `stripe-create-checkout` (Stripe checkout session with tax/billing/invoice staging params plus adapter-level Supabase/Stripe query-shape coverage), `stripe-webhook` (paid/async-safe fulfillment with claim/finalizer replay ledger, order/license fulfillment, totals/tax/payment intent/invoice persistence, and refund adapter handling), `store-download-build` (entitled store build links with adapter-level license/build query-shape and storage signed-URL coverage), `store-order-support` (authenticated order support/refunds with adapter-level query-shape coverage), `ingest-playtime` (authenticated service-role playtime ingestion with adapter-level auth/catalog/session-conflict/stat/session mutation coverage), `ingest-achievements` (launcher-JWT local-only intake plus server-attested catalog/unlock ingestion with adapter-level auth/attestation/catalog/definition/RPC coverage), `export-user-data` (account export with adapter-level auth/read query-shape and missing-table warning coverage), `request-account-deletion` (active lookup/create adapter coverage), `cancel-account-deletion` (pending-only cancel adapter coverage), `process-account-deletions` (destructive processor adapter coverage), `poll-platform-presence` (presence query/cache adapter coverage), `invite-hosted-proof` (hosted replay/origin proof with adapter-level auth/origin/RPC coverage), `community-artwork-moderation` (trusted artwork scan/review/moderation coverage).

Run locally:

```bash
pnpm supabase start
pnpm supabase db reset
```

Generate types:

```bash
pnpm supabase gen types typescript --local > launcher/src/lib/supabase/database.types.ts
```

Edge contract tests:

```bash
pnpm supabase:functions:test
```

CI runs Edge Function tests with Deno 2 and no live secrets through `scripts/supabase-functions-test.mjs`, which discovers all `supabase/functions/**/*.test.ts` files. These tests cover signed Store license token generation, unsigned staging fallback labels, active-license skip-before-signing, duplicate-key license conflict recovery, Stripe API-version pinning, checkout tax/invoice parameter staging, checkout-attempt idempotency wiring, Stripe checkout adapter Supabase/Stripe query shapes, Store customer bootstrap through `store_customers`, duplicate-attempt reuse, free-order fulfillment, attach/session/cart failure handling, session projection, Stripe checkout HTTP CORS/auth/body/product/ownership/signing/free-order/paid-session/rollback guards, Stripe webhook HTTP guards/routing, adapter-level event claim/finalizer behavior, checkout fulfillment/order/license mutation plans, invoice persistence, refund ledger/status handling, shared Store Stripe invoice/refund boundary query shapes, webhook replay-ledger stale retry leasing, lease-token-scoped webhook finalizers, hosted community artwork moderation request parsing plus HTTP CORS/auth/reviewer/RPC/scan guards, adapter auth/private moderator allowlist/artwork scan row/RPC query shapes, deterministic hosted artwork scan policy packets, RAWG provider artwork source-policy evidence plus rawg-assets HTTP CORS/method/auth/API-key/body/upstream/error guards and adapter env/auth/fetch JSON coverage, account data export HTTP handler, table coverage, shared privacy auth/admin runtime, auth bridge, equality/in/or read query shapes, empty dependent-read skips, missing-table warning mapping, and non-missing error propagation, account-deletion request/cancel HTTP handler guards, request auth bridging, active pending/processing lookup query shape, owner-scoped create mutation, duplicate-active `23505` preservation, cancel auth bridging, pending lookup query shape, pending-only cancel mutation, cancel Supabase error propagation, active pending/processing deletion guards, process-account-deletions HTTP CORS/method/secret/dry-run/live/delete/audit/evidence guards, processor claim/audit mutations, processor adapter due-request query shape, Auth delete delegation, evidence insert, recursive storage cleanup, and missing-bucket handling, presence polling boolean/request parsing plus HTTP handler CORS/auth/cache-skip/force/live-write/activity/evidence/error guards, adapter secret/runtime config wiring, platform account and existing-presence query shapes, cache update payloads, presence/activity/evidence mutations, presence provider-client Steam Web API mapping, provider bridge HTTP success/error/rate-limit handling, token redaction, and bridge status mapping, entitled build ticket request parsing plus Store Download Build HTTP CORS/auth/license/exact-build/latest-build/signed-URL/error guards, adapter-level license/build query shapes, storage signed-URL delegation, and storage error mapping, store order support refund/invoice request parsing, adapter-level order/refund/invoice query shapes, refund staging/reject mutations, Stripe refund delegation, Stripe refund idempotency payloads, and Store Order Support HTTP CORS/auth/order-ownership/invoice/refund/error guards, invite hosted replay/origin proof HTTP CORS/origin/method/auth/body/proof/replay/sanitization guards plus adapter auth/origin/RPC coverage, public profile privacy RLS lane guards, per-link social profile visibility guards, trusted playtime ingestion HTTP handling plus adapter auth/catalog/session-conflict/aggregate/session mutation query shapes, unverified achievement no-write handling plus server-attestation/auth/catalog/definition-upsert/unlock-RPC coverage, atomic achievement unlock side-effect RPC guards, stale-snapshot/privacy/RLS contracts, and provider-confidence anti-spoofing; they do not replace live Stripe webhook delivery, Stripe Dashboard tax/invoice checks, ML image moderation, copyright fingerprinting, a real provider-verification relay, hosted ingestion, hosted community moderation deployment, hosted account-deletion cron, or live RAWG API availability.

Manual hosted deploy gate:

```bash
pnpm hosted:deploy-gate:plan
pnpm hosted:deploy-gate:packet
pnpm hosted:deploy-gate:preflight
pnpm hosted:deploy-gate:deploy:dry-run
pnpm hosted:deploy-gate:deploy:live
pnpm hosted:deploy-gate:smoke
pnpm hosted:deploy-gate:all:live
pnpm hosted:deploy-gate:scheduler-packet
pnpm hosted:deploy-gate:test
pnpm hosted:cron-evidence:plan
pnpm hosted:cron-evidence
pnpm hosted:cron-evidence:packet
pnpm hosted:cron-evidence:artifact-hints
```

GitHub Actions exposes a manual `hosted_deploy_gate` workflow_dispatch path that uses the `hosted-staging` or `hosted-production` Environment, deploys the known Supabase Edge Function set on request, and can run hosted dry-run live smokes when invoked with real secrets. Presence and account-deletion smokes write only sanitized evidence rows (`presence_poll_runs`, `account_deletion_processor_runs`) and fail if the hosted function does not return `evidenceRecorded` with a server-authored `runId`. The deploy gate packet, scheduler packet, hosted cron packet, and artifact hints commands prepare redacted operator handoff text only; the scheduler packet also reports whether `SUPABASE_FUNCTIONS_URL` is configured or needs the emitted redacted derivation step from `SUPABASE_URL`/`SUPABASE_PROJECT_REF`. These helpers do not deploy functions, call hosted functions, create schedules, check proof rows, or prove external completion. `v*` tag builds have an additional `hosted-production` release-boundary job that validates the tag against launcher/Tauri versions, verifies the tagged commit is the current `origin/main` commit, and runs unscoped `pnpm completion:gate:external` before packaging; a single draft-release job runs only after the full OS build matrix uploads artifacts. Tags cannot publish release artifacts until `pnpm hosted:deploy-gate:preflight`, `pnpm hosted:deploy-gate:smoke`, hosted cron evidence, and checked external proof artifacts pass. `/settings?verify=hosted-cron-evidence-summary` summarizes scheduler lanes as a local no-write evidence gate while dry-run, stale, missing, placeholder-env, unsafe REST target, unsafe run-id, missing/invalid aggregate-count, semantically impossible aggregate-count, or non-zero `failed_count` rows stay blocked, and `/settings?verify=external-completion-evidence-summary` shows the wider Store/Stripe, hosted cron, provider-live, hardware/OS, and rollout artifact checklist without treating local dry-runs as external proof. See `docs/runbooks/hosted-deploy-gate.md`.

## Environment Variables

| Variable                                   | Description                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`                        | Supabase project URL                                                                                    |
| `VITE_SUPABASE_ANON_KEY`                   | Supabase anon/publishable key                                                                           |
| `VITE_SUPABASE_PUBLISHABLE_KEY`            | Alternate anon key name                                                                                 |
| `VITE_OG_TRUSTED_INGESTION_STRICT`         | Optional frontend override for production-strict trusted ingestion fallback                             |
| `ACHIEVEMENT_INGESTION_ATTESTATION_SECRET` | Server-only secret (minimum 32 chars) for a provider-verifying achievement relay; never ship in clients |
| `RAWG_API_KEY`                             | Edge Function + dev fallback; do not ship in client builds                                              |
| `RAWG_ASSETS_ALLOWED_ORIGINS`              | Optional comma-separated allowed origins for hosted RAWG asset proxy CORS                               |
| `STRIPE_SECRET_KEY`                        | Stripe secret key for Store checkout/refund/webhook Edge Functions                                      |
| `STRIPE_WEBHOOK_SECRET`                    | Stripe webhook signing secret required for live webhook verification                                    |
| `ACCOUNT_DELETION_PROCESSOR_SECRET`        | Shared secret for trusted hosted cron invocations of `process-account-deletions`                        |
| `OGL_LICENSE_SIGNING_KEY`                  | Base64url or hex Ed25519 private seed used by Store Edge Functions                                      |
| `OGL_LICENSE_VERIFYING_KEY`                | Base64url or hex Ed25519 public key used by `validate_license`                                          |
| `OGL_LICENSE_ALLOW_UNSIGNED_FALLBACK`      | Local/staging-only flag for explicit `OGL-STAGING-UNSIGNED-*` fallback keys                             |
| `OGL_INSTALL_MANIFEST_SIGNING_KEY`         | Optional base64url/hex Ed25519 private seed for release/staging manifest signing                        |
| `OGL_INSTALL_MANIFEST_VERIFYING_KEY`       | Base64url or hex Ed25519 public key used by signed OG install manifests                                 |
| `OGL_INSTALL_MANIFEST_KEY_ID`              | Optional key label embedded in signed OG install manifests                                              |
| `PRESENCE_POLL_SECRET`                     | Bearer token for trusted `poll-platform-presence` invocations                                           |
| `STEAM_WEB_API_KEY`                        | Enables direct Steam presence polling in `poll-platform-presence`                                       |
| `PRESENCE_PROVIDER_TOKEN`                  | Optional bearer token forwarded to configured provider bridge endpoints                                 |
| `PRESENCE_POLL_CADENCE_SECONDS`            | Optional hosted presence poll cache cadence, default `60`                                               |
| `PRESENCE_POLL_MAX_BATCH`                  | Optional hosted presence poll batch cap, default `100`                                                  |
| `PRESENCE_POLL_TIMEOUT_MS`                 | Optional provider bridge timeout, default `8000`                                                        |
| `<PLATFORM>_PRESENCE_ENDPOINT`             | Optional Epic/GOG/EA/Xbox/Battle.net/Ubisoft provider bridge endpoint                                   |
| `INVITE_HOSTED_PROOF_ALLOWED_ORIGINS`      | Comma-separated HTTPS origins allowed to request invite replay proof                                    |
| `STORE_BUILDS_BUCKET`                      | Storage bucket used by entitled store-build download tickets                                            |
| `SUPABASE_ACCESS_TOKEN`                    | GitHub Environment secret for manual hosted deploy gate                                                 |
| `SUPABASE_PROJECT_REF`                     | Supabase project ref used by the hosted deploy gate                                                     |
| `SUPABASE_FUNCTIONS_URL`                   | Optional explicit hosted Functions base URL for live smokes                                             |
| `SUPABASE_REST_URL`                        | Optional explicit hosted REST base URL for cron evidence collection                                     |
| `SUPABASE_SERVICE_ROLE_KEY`                | Preferred hosted REST auth for release-boundary cron evidence                                           |
| `SUPABASE_ANON_KEY`                        | Hosted REST anon key when paired with `SUPABASE_AUTH_JWT`                                               |
| `SUPABASE_AUTH_JWT`                        | Hosted REST authenticated caller JWT when paired with `SUPABASE_ANON_KEY`                               |

Deploy trusted Edge Functions after setting secrets:

```bash
pnpm supabase secrets set PRESENCE_POLL_SECRET=replace-me STEAM_WEB_API_KEY=replace-me
pnpm supabase functions deploy poll-platform-presence --no-verify-jwt
```

Schedule `poll-platform-presence` every minute from Supabase Scheduled Functions or an external cron runner with `Authorization: Bearer $PRESENCE_POLL_SECRET` and body `{"dryRun":false,"force":false,"limit":100,"triggerSource":"scheduled"}`. Every successful poll writes a sanitized `presence_poll_runs` row with aggregate counts only; no raw account IDs, user IDs, provider tokens, or game titles are stored there. Deno contracts pin request parsing, cache-skip/force behavior, provider-skip cache writes, best-result presence writes, start/stop activity rows, sanitized evidence, adapter-level platform account/existing-presence queries, cache update payloads, presence/activity/evidence mutations, and HTTP error branches without live provider calls.

Trusted playtime ingestion is implemented in `ingest-playtime`; deploy it with the default JWT verification enabled. The launcher first calls this function for `user_game_stats`/`game_sessions` writes and falls back to direct authenticated staging writes only when the function is not deployed or unreachable. Production-strict mode blocks launcher playtime/session write fallbacks; set `VITE_OG_TRUSTED_INGESTION_STRICT=false` only for explicit staging rollback. Focused Vitest coverage pins the strict-mode env parser for production defaults, local/staging defaults, accepted true/false values, and invalid-value fallback to `MODE`. Deno coverage pins the handler plus adapter auth bridge, catalog lookup, session conflict query, aggregate upsert, session insert, and Supabase error propagation without live Supabase writes. Database grants/RLS still intentionally leave `user_game_stats`, `game_sessions`, and narrow `activity_feed` direct-write exceptions for local/staging compatibility, and `trusted-ingestion-migration-contract.test.ts` pins those exceptions so a hardening migration cannot be confused with frontend strict mode.

Attestation-gated achievement ingestion is implemented in `ingest-achievements`; deploy it with the default JWT verification enabled. A normal launcher JWT proves only the caller identity, so the function returns `202` with `trust: unverified` and `persistence: local_only` and performs no catalog, unlock, XP, level, or activity writes. Only a server-side provider-verification relay holding `ACHIEVEMENT_INGESTION_ATTESTATION_SECRET` (minimum 32 characters; never ship it in the launcher) can reach the service-role definition and unlock RPCs. Those RPCs derive XP/name data from the trusted catalog, reject stale provider snapshots, keep unlocks idempotent, preserve numeric rarity, hide inactive/secret definitions, and strip `launcher_device_id` from hosted metadata. Deno coverage pins the unverified no-write response, attestation comparison, catalog/RPC paths, privacy/RLS migration contract, and Supabase error propagation. A real provider-verifying relay and hosted staging evidence remain required before production.

Local DSGVO deletion processor readiness is implemented and surfaced in `AccountDataPrivacyPanel`; `/settings/privacy?verify=deletion-processor-cron-dry-run-packet` stages the sanitized `dry_run` cron packet with redacted secret headers, a Hosted Cron Staging Proof fixture with no verify-route deletion writes, `account_deletion_processor_runs` aggregate evidence, and Deploy Gate validation for non-destructive `failedCount === 0` plus `evidenceRecorded` smokes. `/settings?verify=hosted-cron-evidence-summary` includes the deletion processor lane beside presence evidence and keeps stale or missing scheduled rows blocked. The trusted processor now atomically claims due rows as `processing` before storage/Auth deletion, new deletion requests treat `pending` and `processing` as active, completion/failure audit updates must match a processing row, and the UI shows processor-claimed requests as active instead of clear. Edge tests cover export HTTP handler and table coverage, account-deletion request/cancel HTTP handler guards, request adapter auth/active lookup/create mutation/`23505` preservation, cancel adapter auth/pending lookup/pending-only mutation/error propagation, active pending/processing uniqueness, process-account-deletions HTTP CORS/method/secret/dry-run/live delete/audit/evidence guards, processor claim/audit mutations, adapter-level due-request query shape, Auth delete delegation, evidence insert, recursive storage cleanup, missing-bucket handling, and sanitized processor-run evidence, and evidence is captured in `docs/verification/screenshots/privacy-deletion-processor-readiness.png`, `docs/verification/screenshots/privacy-deletion-processor-cron-dry-run-packet.png`, `docs/verification/screenshots/privacy-deletion-processor-hosted-cron-staging.png`, and `docs/verification/screenshots/privacy-account-deletion-local-processing.png`.

Remaining hosted setup: deploy `process-account-deletions` with `verify_jwt = false`, set `ACCOUNT_DELETION_PROCESSOR_SECRET`, and schedule Supabase Scheduled Functions or a trusted external cron runner with `Authorization: Bearer $ACCOUNT_DELETION_PROCESSOR_SECRET`.

## Known Gaps

- Verify/repair checks local SHA-256 manifests and validates signed OG install manifests when present; internal downloads can accept a signed install-manifest sidecar via `installManifestUrl`/`installManifestSha256`; release/staging manifest signing is opt-in via `OGL_INSTALL_MANIFEST_SIGNING_KEY`, while production key custody remains an operational concern
- Client Manager shows safe platform-client install staging, lookup-only shared asset-cache tables, path-overlay apply preflight, a local sandbox apply/rollback proof, a read-only native auto-apply capability preview for runtime/client presence, install target, free disk, admin review, and provider mechanism gates, a 7-provider Apply Policy Matrix for Steam/GOG/Epic/EA/Ubisoft/Battle.net/Xbox, and a guarded `autoApply` policy that records unsupported provider auto-apply as blocked; automatic client binary download/silent apply, provider-approved launcher apply, provider terms approval, real OS mount creation, and live provider-client mutation stay unsupported until official provider/OS-safe mechanisms exist
- GOG/EA platform tokens use the native secure store; Settings/Friends clean legacy browser token copies, and Epic keeps only a non-sensitive connected-session marker while Legendary owns credentials
- Xbox integration is Windows-focused
- Epic depends on Legendary CLI
- No automatic production deployment beyond draft GitHub Releases on validated `v*` tags whose commits point at the current `origin/main` commit; tag packaging is blocked by the `hosted-production` unscoped `pnpm completion:gate:external` release-boundary job, and the manual GitHub Environment-protected hosted Supabase deploy gate can run user-data-safe dry-run live smokes before scheduler handoff when invoked with real secrets
- DSGVO: local `process-account-deletions` readiness, extracted HTTP handler coverage, shared privacy auth/admin runtime coverage, request/cancel/processor adapter coverage, `/settings/privacy?verify=deletion-processor-cron-dry-run-packet` sanitized `dry_run` cron packet, Hosted Cron Staging Proof fixture, sanitized `account_deletion_processor_runs` evidence, `/settings?verify=hosted-cron-evidence-summary` cross-scheduler no-write evidence summary, AccountDataPrivacyPanel readiness UI, export coverage contract, processor secret/limit/dry-run contract, pending-to-processing claim guard, audit-update error handling, deploy-gate failed-count/evidence guard, and `game-artwork` storage cleanup coverage exist; remaining gap is Hosted Cron/Supabase Scheduled deployment with a real `ACCOUNT_DELETION_PROCESSOR_SECRET` and staging verification
- First-party cloud-save storage and its user-facing sync/conflict UI were removed; provider clients own cloud synchronization. The remaining Cross-Store Save Copy route is an isolated, consent-gated local verification sandbox, not a cloud service.
- Offline Store/Stripe staging contract, `/store?verify=stripe-live-staging-contract` local live-staging contract, current Stripe API-version pin, checkout-attempt idempotency, extracted Stripe Checkout HTTP handler coverage plus adapter-level Supabase/Stripe query-shape coverage for duplicate attempts, free fulfillment, attach/session/cart failures, session projection, `store_customers` customer bootstrap, shared Stripe invoice/refund boundary coverage, signed webhook replay ledger with adapter-level claim/finalizer coverage, order fulfillment, invoice persistence, refund ledger/status contracts, production-capable signed license token contract/checker, explicit unsigned-staging license fallback labels, and Store readiness panel exist; remaining gaps are production key custody/live license issuance and live Stripe staging with real webhook signature delivery and Stripe Dashboard tax/invoice configuration
- Performance samples and session aggregates use the active launch context when available; standalone overlay sessions are explicitly attributed to `overlay-runtime`; ActivitySection Top Games deep-link into `/settings/performance` with range/game/bucket filters and `#playtime-detail`; `/activity` renders the local yearly game activity recap from play sessions with browser share handoff, SVG file payload/export, TXT export, and copyable local share card fallbacks
- Playtime writes now prefer the authenticated `ingest-playtime` service-role function with direct-write fallback only for undeployed local/staging environments; production-strict mode blocks launcher playtime/session write fallback via `VITE_OG_TRUSTED_INGESTION_STRICT` or production build mode. Achievement provider syncs remain local-only for ordinary launcher JWTs; direct client XP/Achievement writes are blocked, and only a server-attested provider relay may persist catalog definitions, unlocks, XP/level, or activity. `launcher_device_id` is stripped from hosted/social metadata. Migration contract tests pin this trust boundary and the remaining DB direct-write exceptions for `user_game_stats`, `game_sessions`, and narrow non-achievement `activity_feed` posts. Remaining anti-tamper gap: the real provider-verification relay and hosted staging evidence before production
- Presence polling Edge Function exists with direct Steam support, local secret-gated function config, adapter-level Supabase query/cache mutation coverage, Deno-pinned request parsing for `dryRun`/`force`, limits, user IDs, platform filters, trigger source, cache-skip/force behavior, provider-skip cache writes, live presence/activity write branches, Steam provider-client HTTP behavior, provider bridge adapter mapping, rate-limit/error translation without live provider calls, and sanitized `presence_poll_runs` evidence, plus a Settings readiness panel that reads client-visible `presencePollCache`, latest `presence_poll_runs` scheduler evidence, separates trusted dry-run review packets from hosted cron/writeback proof, surfaces the manual hosted deploy-gate/scheduler handoff packet, and shows `platform_last_polled_at`; `/settings?verify=hosted-cron-evidence-summary` adds a no-write comparison against account-deletion scheduler evidence while keeping real hosted scheduling and non-Steam provider bridge execution open
- Friends dedup merge-group contracts now keep accepted suggestions on an existing target `merge_group_id` when present, scope final accepted-status writes to the current user, allow native `og` platform account/link rows in Supabase checks, and propagate auto-matches only across the same owner/platform/platform-friend id
- Client Manager has app-lifetime 24h scheduled update checks with persisted history, safe scheduled `openClient` updater launch, guarded `autoApply` blocked-state history, configurable lifecycle polling, lifecycle/window start/stop/update events with PID/process/uptime/input metadata, running-state Library chips, cross-source `via provider` running labels, Settings Platform Health Score, local One-Click Setup readiness tape, local hosted/provider E2E readiness gates, `/settings?verify=one-click-setup-rollback-audit-contract` no-write setup rollback/audit contract review, lookup-only shared asset-cache conflict previews, path-overlay apply preflight, read-only native auto-apply capability preview for runtime/client presence, install target, free disk, admin review, and provider mechanism gates, `/settings?verify=client-manager-mount-apply-contract` local mount/apply contract gates plus a Steam/GOG/Epic/EA/Ubisoft/Battle.net/Xbox Provider Policy Matrix, `/settings?verify=client-manager-mount-apply-sandbox-proof` local sandbox copy/manifest/hash/rollback proof, and a headless per-user OS timer; provider-approved auto-download/auto-apply, provider terms approval, real OS mount creation, and live client mutation remain open
- Backup/Restore has local manifest preview, incremental copy, restore review gate, restore result details, optional ZIP archive export, app-lifetime reminders, OS-login autostart catch-up, headless per-user OS timer, native target-folder picker, read-only removable-drive detection evidence, removable-media sentinel write/read/checksum/delete proof, consented eject-safety flush/read/delete preflight, shell-free Linux/macOS plus Windows drive-letter OS eject/unmount command paths with final preflight and mount-disappearance verification, and `/settings?verify=backup-external-drive-readiness` local external-drive gates; Windows/macOS/Linux external-drive backup/restore E2E remains open
- CurseForge/mod.io native search, local provider game-id hints, saved local mappings, shared provider catalog mapping, CurseForge/Overwolf handoff fallback, local provider API-key staging readiness, local terms/rate-limit/retry/redaction policy evidence, redacted single-result desktop staging probe path, and local provider response-shape review fixtures exist; real keyed provider staging runs remain open until verified with real provider keys

## Current State

Open Game Launcher is a working desktop application. This section describes what runs today. The complete product spec is in [`FEATURE_PLAN.md`](./FEATURE_PLAN.md).

### What works today

- Desktop shell (Tauri 2, custom title bar, frameless window, window-bounds guard)
- Visual system: **Retro Manga Launcher** ([`docs/PROJECT_DESIGN.md`](./docs/PROJECT_DESIGN.md)) — aged paper, halftone, red/teal, sharp corners
- Library: Installed-game scan, cache, manual add, move, launch, favorites, hidden, collections, custom categories, dynamic collections, and footer navigation into Friends chat
- Unified game model with cross-platform type, launcher source, external id, install path, metadata, playtime, artwork, achievements, saves
- External libraries: local/client library detection, launcher IDs, install-path metadata, provider badges, and launcher integration for **Steam, GOG, Epic (Legendary), Xbox, Game Pass, Ubisoft, Battle.net, EA**; live provider API, provider telemetry, and keyed-provider evidence stay in the external proof gates.
- Platform auth hardening: GOG/EA tokens stay in the native secure store, GOG Friends reads the backend token directly, and Epic stores only a non-sensitive browser session marker
- Cloud saves: first-party archive/sync/encryption paths are removed; provider clients remain responsible for save synchronization.
- Achievements: implemented Xbox/Steam sync paths and connector/UI coverage, cross-platform aggregation with provider-status display for GOG/Epic/EA/Ubisoft/Battle.net, local JSON sidecar import, and Epic public-fallback scraping; `/achievements?verify=achievement-cache-readiness` shows local cache-folder, sidecar, parser, and provider-status readiness without provider API calls, hosted hydration, Supabase writes, OAuth/token exchange, live unlock import, remote cache jobs, provider credentials, or official unlock proof; `/achievements?verify=achievement-hosted-hydration-contract` shows the no-write hosted hydration contract for authenticated Supabase read shape, provider-key filtering, catalog-game resolution, definition/unlock merge, and local fallback behavior without live hosted staging, provider sync, writes, OAuth, remote jobs, live imports, live provider E2E, or official unlock proof
- Cross-Play: `game_universal_id` mapping, CrossPlayBadge, **Smart-Join button in friends list**, and local IGDB staged import preview/readiness for platform/external-id mapping, review-only `game_cross_play` rows, `games.external_ids` patch evidence, and duplicate/conflicting target-key review without IGDB API access or Supabase writes
- Presence: Supabase Realtime/client paths, platform polling Edge Function contracts, sanitized polling evidence, and Settings readiness panel exist; proved Scheduled Function runs and real non-Steam provider bridge execution remain external evidence.
- Chat & invites: Direct messages, group chat rooms, game invites, universal-friends links, owner-scoped friend merge-group dedup contracts, and the Library footer `Friends & Chat +` handoff to `/friends?tab=chat`
- Community: the default route reads the real Supabase friend activity feed and creates real friends-only status posts. Static hubs, local market/workshop/moderation data, and broadcast/OAuth/RTMP fixtures are available only through explicit `?verify=...` review routes and never claim live provider execution.
- Local DB sync: SQLite-backed entity sync with dirty tracking and remote conflict resolution
- Auth/Profile/Social: Supabase-configured auth/profile paths with browser-local fallbacks, profile pages, public profile privacy guard with client-side redaction and RLS lane contracts, per-link social-link visibility with local editor proof, friends, customization, privacy, blocks, comments, showcases, badges, social links, hardware, and **family sharing** contracts.
- 9 Profile showcase components (8 panels plus ShowcasePanel wrapper)
- Profile customization includes local Theme/Skin readiness for profile themes while preserving the Retro Manga shell plus schema-validated custom theme JSON import/export, browser-local App Shell skin switching for the header, navigation, and main shell with default-skin reset and invalid-id fallback, Supabase-configured shell-skin preference sync path through `profiles.app_shell_skin`, and Supabase-configured custom theme draft sync path through `profiles.custom_theme_json`; `/settings/profile/customize?verify=app-wide-theme-readiness` shows local app-wide Theme/Skin gates for profile presets, local draft, design guard, shell skin, custom import/export, Supabase-configured sync paths, and rollback while live profile-theme catalog persistence, marketplace skins, and marketplace rollback proof remain open
- Plugin-System readiness is local-only on `/settings`: read-only desktop folder scan, browser JSON manifest import, manifest review, static policy ledger, a signed package staging console with explicit consent-operation input, Ed25519 signed local package staging into a disabled registry, `/settings?verify=plugin-disabled-registry-audit` native disabled-registry audit evidence for stage-record status, hashes, signatures, path containment, symlink rejection, `/settings?verify=plugin-runtime-sandbox-process-boundary` native runtime sandbox process-boundary proof that re-audits disabled packages, denies entrypoints before code load, requires exact unique 8-fixture escape coverage plus matching denied-entry counters and proof-only flags, and records deterministic blocked escape fixtures for path traversal, symlink entrypoints, nested manifest escapes, deny-all/network IPC, environment/filesystem attempts, and permission escalation, native activation-plan review requires exact `review_plugin_activation_plan:<plugin>@<version>` consent, reuses the disabled-registry audit, returns manifest hash evidence for clean staged packages, and keeps execution/download/install/network/permission grants blocked until a production sandbox exists, native update-signing envelope review now verifies Ed25519 envelopes, blocks auto-install, requires rollback metadata, and matches proposed manifest hashes against a clean disabled registry, `/settings?verify=plugin-update-signing-review` renders the local update-signing evidence for signed update envelopes, manifest hashes, rollback metadata, and blocked auto-install, `/settings?verify=plugin-marketplace-update-index-trust` local signed marketplace/update-index trust packet evidence for disabled-registry matching with download/install/auto-update lanes blocked, and browser-cache separation, permission, theme-hook, sandbox, marketplace, and update-signing gates plus a local manifest/permission/package ledger are visible, but real third-party plugin execution, production sandbox hardening, marketplace discovery/install, production signing trust, live update channels, update downloads, and auto-update installation remain unimplemented
- **Mod-Management**: full installer engine (URL/Archive/Folder), Steam-Workshop extractor, enable/disable, queue, pause/cancel, provider delegation, mod.io/CurseForge native search UI/bridge with local provider game-id hints, saved local/shared mappings, local provider API-key staging readiness, local terms/rate-limit/retry/redaction policy evidence, redacted single-result staging probe telemetry, local API response-shape review fixtures, and CurseForge/Overwolf handoff fallback; live keyed provider responses remain unverified.
- **In-Game Overlay**: transparent Tauri window, 4 tabs, configurable hotkey with local settings persistence, anti-cheat banner plus fallback deck, local fullscreen/anti-cheat research packet, real DXGI FPS + NVML GPU
- **Performance-Monitor**: Overlay Recharts + `FpsHudPage` + `/settings/performance` history with CPU/RAM/FPS/GPU samples, session aggregates, explicit `overlay-runtime` attribution for standalone overlay sessions, ActivitySection Top Games query links into the playtime detail target, local Overlay E2E and fullscreen/anti-cheat readiness panels, and `/activity` yearly recap dashboard with SVG file share/export, browser share fallback, local Share Card copy, and TXT export
- RAWG artwork Edge Function proxy contract with Deno-pinned HTTP handler coverage; live RAWG key/provider proof remains external
- Custom Artwork: Drag-Drop-Upload in GameDetails, Preview-Modal, Auto-Artwork-Kandidaten fuer Cover/Icon/Logo, lokale Community-Artwork-Import-Galerie mit browser-lokalem Vote-Ledger, hosted/Supabase staging for public upload, pending-submission cards, service-role review RPC contract, private moderator allowlist, trusted moderation Edge Function contract coverage, local moderator console preview, and audit ledger evidence without community-wide rollout proof
- Deep Links: `oglauncher://` URI handler
- Store: published-product UI, cart, Store Edge Function and adapter contracts for Stripe checkout with automatic tax/tax ID/billing/invoice params, adapter-level checkout query-shape/session projection coverage, paid/async-safe webhook fulfillment plan with replay-ledger claim/finalizer coverage, persisted tax/payment intent totals, invoice/refund ledgers, production-capable Ed25519 offline license contract/checker with production key custody/live issuance still open, explicit unsigned staging fallback labels that fail offline validation, verified reviews, Developer Portal, refunds, Store readiness panel with Stripe live-staging contract, and build download tickets; live Stripe staging, webhook delivery, Dashboard tax/invoice configuration, and production key custody remain open.
- Backup/Restore: local manifest preview, incremental backup, restore review gate, restore result details, optional ZIP archive export, app-lifetime reminder, OS-login autostart catch-up, headless per-user OS timer, native target-folder picker, read-only removable-drive detection evidence, consented removable-media sentinel write proof, consented eject-safety preflight, Windows eject backend, consented local OS eject/unmount result proof, Settings panel, and local external-drive readiness routes without backup-payload writes or restore execution
- DSGVO/Privacy: JSON export, shared privacy auth/admin runtime coverage, export coverage contract for newer user-scoped tables, 30-day account deletion request/cancel flow, trusted deletion processor with pending-to-processing claim safety, processor adapter coverage, sanitized local dry-run/no-write staging evidence, public profile privacy guard/RLS lane hardening, `game-artwork` storage cleanup coverage, AccountDataPrivacyPanel readiness UI, and a no-write Hosted Cron Staging Proof fixture; real Scheduled Function deployment remains open.
- News feed page (`/news`)

## External Evidence / Open Work

Features described in [`FEATURE_PLAN.md`](./FEATURE_PLAN.md) are split between locally complete work and gates that still require live external evidence.

### Embedded Client-Manager

- Full scope, Bereits-implementiert-Status und Offene Tasks: siehe [FEATURE_PLAN.md §0](./FEATURE_PLAN.md)
- Kurzfassung: 7-Plattform-Client-Detection, konfigurierbares Process-Status-Polling, Library-Status-Indikatoren, Silent-Install, Auto-Updates, Client-Modifikation (Pfad-Overlays, lookup-only Asset-Cache, Provider Policy Matrix, Mod-Wurzelverzeichnisse)
- Client-Start weiterhin via offizielles URI-Protokoll

### Real Store Frontend

- `StorePage` uses `listPublishedProducts()` with a local preview fallback
- Product page: cover, description, price, sysreq, verified reviews, reports, and developer replies
- Cart tab, cart drawer, checkout flow, and Stripe return refresh exist
- Reviews: verified-purchase 1-5 star basics, abuse reporting, and developer replies exist
- Store-Wishlist persists through `store_wishlist` with LocalStorage fallback
- Order history, line items, invoice/tax sync status, refund execution, `validate_license`, compact license checker, Store readiness panel, `/store?verify=stripe-live-staging-contract` local Stripe contract evidence, and signed build download tickets exist

### Custom-Link Invites (Partial)

- `oglauncher://join?...&invite=...` URI handler is wired (Tauri deeplink, `useDeepLink` hook, Library join path)
- `/invite/:token` web fallback page exists and opens/copies the generated app deep link
- `share_tokens` migration stores only token hashes, keeps the table off `anon` reads, and exposes `create_game_invite_share_token`/`resolve_share_token`/`redeem_share_token` RPCs
- New share tokens are `ogl_<header>.<payload>.<signature>` envelopes signed by the DB helper for format/tamper detection; `share_tokens.token_hash` plus the joined `game_invites` row remains authoritative for lookup and acceptance
- `CrossPlatformInvite` emits Web-Fallback and App-Deep-Link readouts after `game_invites` creation, then replaces the legacy invite-id link with a server share token when the RPC is deployed
- `/invite/:token` can resolve server tokens to game/platform context via the public minimal RPC
- Signed-in receivers can accept a server-verified token through `redeem_share_token`; the RPC locks token+invite rows, accepts known receivers or first-claim `receiver_id = null` share links, marks `game_invites.status = accepted`, and consumes one token use
- `CrossPlatformInvite` has a Share Link mode for not-yet-known recipients; any signed-in OG Launcher account with the one-use link can claim it first
- `/invite/:token` now shows Invite Readiness gates for Web Fallback, App Deep Link, Share RPC, Receiver Auth, and Hosted Web plus a Hosted Token Rehearsal for create/resolve/auth/redeem/replay-guard evidence; the static migration contract test verifies RLS/no-client-grants, private signing keys, envelope validation, unknown-recipient claim rules, replay-denial guards, and the authenticated hosted replay-proof RPC
- `invite-hosted-proof` stages an authenticated Edge Function contract with extracted HTTP handler coverage plus adapter-level auth/origin/RPC coverage for allowed HTTPS Origin/CORS checks, auth, request body guards, consumed-token proof, rejected second redeem evidence, unexpected replay acceptance, and sanitized proof packets that return token hints only, not raw tokens or token hashes
- Evidence: `docs/verification/screenshots/friends-custom-link-invite-fallback.png`, `docs/verification/screenshots/friends-custom-link-invite-compose.png`, `docs/verification/screenshots/friends-custom-link-invite-server-token.png`, `docs/verification/screenshots/friends-custom-link-token-lookup.png`, `docs/verification/screenshots/friends-custom-link-accept-success.png`, `docs/verification/screenshots/friends-custom-link-token-envelope.png`, `docs/verification/screenshots/friends-custom-link-unknown-recipient-accept-success.png`, `docs/verification/screenshots/friends-custom-link-hosted-readiness-local.png`, `docs/verification/screenshots/friends-custom-link-hosted-token-rehearsal-local.png`, `docs/verification/screenshots/friends-custom-link-hosted-token-rehearsal-local-mobile.png`, `docs/verification/screenshots/friends-custom-link-hosted-replay-origin-proof.png`, `docs/verification/screenshots/friends-custom-link-hosted-replay-origin-proof-mobile.png`
- Missing: external hosted Web/Supabase staging with real deployed token creation/redemption and a live hosted-origin replay proof run against deployed infrastructure

### Cloud-Save Conflict-UI

Removed. Provider-native cloud saves are the supported path.

The remaining Cross-Store Save Copy verification path is a consent-gated local file copy/rollback sandbox. It does not upload archives, use OG Launcher Cloud-Save storage, or restore the removed Supabase/keychain feature.

### Performance History

- `/settings/performance` exists with persisted overlay samples and range filters
- Active launch context is stored for launched games; standalone overlay sessions are explicitly attributed to `overlay-runtime`
- Per-session perf persistence writes 300-sample aggregate rows via `savePerformanceSession()`; the overlay close/toggle path dispatches a shared local flush event and waits for registered persistence promises before the window toggle
- ActivitySection Top Games links pass `range`, `gameId`, `bucket=auto`, `source=activity`, and `#playtime-detail` into the Performance History target
- `/settings/performance?verify=overlay-e2e-readiness` shows local Overlay E2E gates for overlay-runtime attribution, local history, activity cross-filter, a warning-scoped session-flush contract proof with a 300-sample cap, and attached anti-cheat fallback evidence while external window, long native session, and Supabase session E2E stay open without claiming live overlay, hosted proof, or anti-cheat compatibility
- `/settings/performance?verify=overlay-fullscreen-anti-cheat-readiness` shows a local fullscreen/anti-cheat research packet for mode inventory, overlay settings, and fallback UX without fullscreen injection, anti-cheat bypass, kernel/driver install, protected-process attach, game capture proof, compatibility certification, live title validation, external overlay window proof, E2E success, or real game process access
- Evidence: `docs/verification/screenshots/activity-performance-crossfilter-target.png`, `docs/verification/screenshots/settings-performance-overlay-e2e-readiness-local.png`, `docs/verification/screenshots/settings-performance-overlay-e2e-session-flush-local.png`, `docs/verification/screenshots/settings-performance-overlay-e2e-session-flush-local-mobile.png`, `docs/verification/screenshots/settings-performance-overlay-fullscreen-anti-cheat-readiness-local.png`
- Missing: live/external overlay E2E for standalone `overlay-runtime` attribution
- Missing: long-running E2E with real Native/Supabase sessions

### Real Presence Platform Polling

- Configured 60s polling path via `poll-platform-presence` Edge Function; live scheduled deployment remains missing
- Settings readiness panel keeps Supabase config, secret gate, trusted dry-run review, hosted cron, Steam bridge, and non-Steam provider bridge status visible
- `/settings?verify=presence-evidence` includes a Hosted Cron Staging Packet for the manual `hosted_deploy_gate`, dry-run smoke no-write assertions, and scheduler handoff body without claiming a live scheduled run
- Direct Steam Web API provider-client support when `STEAM_WEB_API_KEY` is configured, with Deno-pinned HTTP success/error/rate-limit mapping
- Optional bridge endpoints for Epic/GOG/EA/Xbox/Battle.net/Ubisoft
- `/settings?verify=presence-evidence` includes a local Provider Bridge Contract Matrix for Epic/GOG/EA/Xbox/Battle.net/Ubisoft request/response fixtures, provider-client bridge HTTP mapping, token redaction, provider error, missing-provider, and rate-limit paths without claiming live provider coverage or writeback
- Friends list and activity feed show platform/source badges
- Missing: scheduled deployment and real non-Steam bridge services

### Cross-Platform Achievements

- GOG local Galaxy/sidecar unlock overlays are merged into API definitions locally; remaining gap is live E2E against real Galaxy client data
- Epic local unlock overlays are merged into Legendary/public Store definitions locally; remaining gap is live E2E against real Epic/EOS client data
- EA/Ubisoft/Battle.net local stats/challenge/criteria cache shapes are parsed for best-effort unlock imports; remaining gap is live E2E against real client data
- `/achievements?verify=achievement-cache-readiness` is local readiness only; it reviews cache folder handoff, sidecar format mapping, parser coverage, and provider status badges while skipping hosted hydration and keeping provider sync, Supabase writes, OAuth/token exchange, live unlock imports, remote cache jobs, provider credential use, and official unlock proof blocked
- `/achievements?verify=achievement-hosted-hydration-contract` is local no-write contract proof only; it pins authenticated Supabase read shape, provider-key filtering, catalog-game resolution, definition/unlock merge, and local fallback behavior while blocking live hosted staging, Supabase writes, provider sync, OAuth/token exchange, remote cache jobs, live unlock import, trusted ingestion calls, and official unlock proof claims
- Need: hosted staging for remote Achievement hydration; local `/achievements` already reads Supabase provider rows back into real game variants before aggregation

### DSGVO Compliance Gaps

- Implemented: local readiness/dry-run evidence for `process-account-deletions`, including a sanitized `dry_run` cron packet, Hosted Cron Staging Proof fixture, no-write verify-route guards, sanitized `account_deletion_processor_runs` aggregate evidence, pending-to-processing claim safety, active pending/processing request uniqueness, checked completion/failure audit updates, extracted HTTP handler coverage, request/cancel/processor adapter coverage, and deploy-gate `failedCount === 0` plus `evidenceRecorded` validation surfaced in `AccountDataPrivacyPanel` and forced by `/settings/privacy?verify=deletion-processor-cron-dry-run-packet`; Edge contract tests cover newer export HTTP handler and table coverage, secret-gated deletion dry-runs, limit clamping, non-destructive dry-run output, live delete/audit paths, and cleanup of user-owned `game-artwork` storage prefixes
- Evidence: `docs/verification/screenshots/privacy-deletion-processor-readiness.png`, `docs/verification/screenshots/privacy-deletion-processor-cron-dry-run-packet.png`, `docs/verification/screenshots/privacy-deletion-processor-hosted-cron-staging.png`, `docs/verification/screenshots/privacy-account-deletion-local-processing.png`, `docs/verification/screenshots/settings-hosted-cron-evidence-summary-local.png`
- Missing: Hosted Cron/Supabase Scheduled deployment with a real `ACCOUNT_DELETION_PROCESSOR_SECRET` and staging verification against a real Supabase project

### Backup/Restore (lokal)

- Native manifest preview, incremental hash-based backup, optional ZIP archive export, latest manifest status, restore preview, restore, daily/weekly app-lifetime reminders, OS-login autostart catch-up, headless per-user OS timer, and a native target-folder picker are wired through Settings
- `/settings?verify=backup-external-drive-readiness` shows local external-drive gates for target folder, folder picker, manifest preview, restore review, ZIP archive, timer, Windows eject backend, removable-media sentinel write/read/checksum/delete proof, eject-safety preflight, and OS eject/unmount result proof while keeping cross-OS backup/restore E2E blocked
- `/settings?verify=backup-external-drive-detection-mounted` shows a deterministic read-only mounted removable-target fixture without claiming write, restore, checksum, eject, or cross-OS proof
- `/settings?verify=backup-external-drive-write-proof` shows deterministic mounted removable-target metadata plus consented sentinel write/read/checksum/delete fixture evidence without claiming backup payload writes, restore execution, eject/unmount execution, or cross-OS proof
- `/settings?verify=backup-external-drive-eject-safety-proof` shows deterministic write-proof plus eject-safety preflight fixture evidence without claiming OS eject/unmount execution, backup payload writes, restore execution, or cross-OS proof
- `/settings?verify=backup-external-drive-os-eject-proof` shows deterministic write-proof, eject-safety preflight, and local OS unmount result fixture evidence without claiming backup payload writes, restore execution, drive-format validation, or cross-OS proof
- Missing: backup/restore E2E on real Windows/macOS/Linux external drives

### Additional Open Features

- Real API-key staging for mod.io/CurseForge: `/mods?verify=provider-api-key-staging` shows local readiness, a redacted single-result request packet, local terms/rate-limit/retry/redaction policy evidence, and local mod.io/CurseForge response-shape review fixtures for safe fields, blocked direct archive/CDN fields, handoff policy, and redaction boundaries; the desktop bridge can run a consented keychain-backed staging probe, while real provider-key runs, live provider responses, hosted moderation/download rollout, CurseForge direct-download validation, and production telemetry staging remain unverified
- IGDB Cross-Play import: `/library?verify=igdb-cross-play-readiness` is local readiness only with staged preview rows for `game_cross_play`, a `games.external_ids` patch envelope, a deterministic no-write sync contract for `game_cross_play` upsert payloads plus merged `games.external_ids`, skipped/blocked candidate reasons, and duplicate/conflicting target-key review for external-id sources and platform rows; real IGDB API access, Supabase row writes, provider telemetry, hosted sync, and live cross-play verification remain unimplemented
- One-Click Setup E2E: `/settings?verify=one-click-setup-e2e-readiness` is local readiness only, and `/settings?verify=one-click-setup-rollback-audit-contract` reviews setup-step ledger order, undo/cleanup order, partial-failure map, redacted audit envelope, and empty writes/deletes/live-calls ledgers as a no-write contract; hosted auth E2E, provider OAuth/token replay, provider-approved silent install, consent/terms approval, production hosted deployment, and real rollback/audit proof remain unimplemented
- Client Manager Mount/Apply Contract: `/settings?verify=client-manager-mount-apply-contract` is local readiness only; path-overlay preflight, asset-cache lookup, auto-apply guard evidence, local auto-apply capability checks for runtime presence/install target/free disk/admin review, a read-only native capability preview command, a 7-provider Apply Policy Matrix with no provider-approved launcher apply and terms-not-approved evidence, and `/settings?verify=client-manager-mount-apply-sandbox-proof` local sandbox copy/manifest/hash/rollback proof are implemented, while provider-approved apply mechanisms, real OS mount creation, provider terms approval, symlink/junction creation, admin elevation, driver/kernel install, destructive client writes, live provider rollback/unmount, and live client mutation proof remain unimplemented
- Plugin-System readiness is local-only on `/settings`: read-only desktop manifest folder scanning, browser JSON manifest import, local manifest review, static schema/entrypoint policy checks, deny-by-default permission ledger, denied unknown permission evidence, theme-hook review, signature metadata, a package-staging console with package path plus explicit consent-operation review, signed local package staging into a disabled registry, `/settings?verify=plugin-disabled-registry-audit` native audit evidence that re-reads disabled stage records, signed files, signatures, path containment, and symlink guards while keeping browser localStorage rows display-only, `/settings?verify=plugin-runtime-sandbox-process-boundary` native runtime sandbox process-boundary proof that re-audits the disabled registry, denies entrypoints before code load, rejects partial/duplicate/unknown escape matrices and ready-flag spoofing, records blocked path-traversal, symlink-entrypoint, nested-manifest, deny-all/network IPC, environment/filesystem, and permission-escalation fixtures, grants no permissions, and keeps `codeExecuted false`, native activation-plan review requires exact consent per plugin version, re-audits the disabled registry, hashes the staged manifest for clean packages, and still denies execution/download/install/network/permission grants until a production sandbox exists, native update-signing envelope review verifies Ed25519 envelopes, blocks auto-install, requires rollback metadata, and matches proposed manifest hashes against a clean disabled registry before `/settings?verify=plugin-update-signing-review` displays local update-signing evidence for signed update envelopes, manifest hashes, rollback metadata, and blocked auto-install, and `/settings?verify=plugin-marketplace-update-index-trust` local signed marketplace/update-index trust packet evidence for signed index envelopes, publisher key fingerprints, disabled-registry matching, freshness/rollback metadata, channel/version constraints, and blocked install/download/execute lanes; real plugin loading/execution, marketplace discovery/install, production signing trust, live update channels, update downloads, auto-update installation, and production sandbox hardening remain unimplemented
- App-wide Themes/Skins: `/settings/profile/customize` includes browser-local App Shell skin switching for the Retro Manga header, navigation, and main shell with default-skin reset, invalid-id fallback, hosted built-in shell-skin preference sync through `profiles.app_shell_skin`, and validated custom theme draft sync through `profiles.custom_theme_json`; `/settings/profile/customize?verify=app-wide-theme-readiness` remains local readiness only, and custom theme JSON import/export keeps schema/color validation; live profile-theme catalog persistence, marketplace skins, and marketplace rollback proof remain unimplemented
- Broadcasting readiness exists only on explicit `/community?verify=...` routes. The normal `/community` route is the real friend activity/status surface; Twitch/YouTube OAuth, RTMP output, hosted moderation, VOD sync, and audience-status mutation remain out of scope until provider integration is configured.
- Achievement Cache Readiness is local-only on `/achievements?verify=achievement-cache-readiness`; it skips hosted hydration and renders deterministic cache-folder, sidecar, parser, and provider-status fixtures without provider API calls, Supabase writes, OAuth/token exchange, live unlock import, remote cache jobs, provider credentials, or official unlock proof
- Achievement Hosted Hydration Contract is local-only on `/achievements?verify=achievement-hosted-hydration-contract`; it renders deterministic no-write contract lanes for authenticated Supabase read shape, provider-key filtering, catalog-game resolution, definition/unlock merge, and fallback-to-local behavior while keeping live hosted staging, provider sync, Supabase writes, OAuth/token exchange, remote cache jobs, trusted ingestion calls, live unlock import, and official unlock proof blocked
- Overlay Fullscreen/Anti-Cheat readiness is local-only on `/settings/performance?verify=overlay-fullscreen-anti-cheat-readiness`; the supported overlay remains a separate always-on-top window. Game-process injection, anti-cheat bypass, kernel/driver install, and protected-process attachment are intentionally out of scope.
- Hosted Community Artwork: GameDetails keeps the browser-local artwork vote ledger as fallback, and `/library?verify=hosted-community-artwork` now stages Supabase `community_artwork_items`/votes/reports/scan results, `game-artwork` storage, approved-feed listing, authenticated vote persistence, report-backed moderation queue, ranking sync, public upload UI, pending-submission cards, private moderator allowlist, service-role scan/review RPCs, trusted moderation Edge Function contract with HTTP handler coverage, local moderator console preview, deterministic content-scan evidence, provider artwork source-policy evidence for Steam/RAWG import paths, a local Steam/RAWG/Epic caps proof matrix, approval gating, and audit ledger evidence; community-wide rollout, provider API approval, and live provider staging remain unimplemented, and ML image moderation or copyright fingerprinting are not claimed

## Architectural Decisions

- **Cloud-first** (Supabase) mit Local-Cache (SQLite `launcher_local_entities`) für Offline-Resilienz
- **AGPL-3.0 Open-Source** Lizenz
- **Retro Manga Launcher** als fixes Design-System (siehe [`docs/PROJECT_DESIGN.md`](./docs/PROJECT_DESIGN.md))
- **Embedded Client-Manager** als Default: Open Game Launcher ist ein vollwertiger Client-Manager für alle unterstützten Plattformen. Erkennung laufender Clients, Silent-Install (wo lizenzrechtlich zulässig), Auto-Updates und Client-Modifikationen (Pfad-Overlays, lookup-only Asset-Cache, Mod-Wurzelverzeichnisse) sind im Scope. Client-Start erfolgt über die offiziellen URI-Protokolle der jeweiligen Plattformen.
- **Tauri 2 + React 19 + TypeScript 5.7 + Rust 1.95.0 pinned** als Stack
- **Supabase** für Auth, DB, Storage, Realtime

## Automation

CI and local pre-commit automation are active in this repository. Dependency
updates are tracked through Dependabot and still require normal PR review before
merge.

| Automation              | State                                                 | Where                      | Notes                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | ----------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub Actions CI       | Active on `push`, `pull_request`, and manual dispatch | `.github/workflows/ci.yml` | Push/PR runs format, typecheck, lint, tests, frontend build, Rust checks, migration lint, external-evidence script tests/plan smoke, and Edge Function Deno contracts; manual dispatch can run the hosted deploy gate; coverage runs as a separate threshold-enforcing release-gated job; CI has no Tauri debug-bundle smoke |
| Dependabot              | Active weekly                                         | `.github/dependabot.yml`   | Tracks GitHub Actions, npm at `/launcher`, and Cargo at `/launcher/src-tauri`; dependency PRs still need review and the local/external gate policy below                                                                                                                                                                     |
| Husky pre-commit hook   | Active                                                | `.husky/pre-commit`        | Runs the staged-file launcher guard through `pnpm --dir launcher lint-staged`                                                                                                                                                                                                                                                |
| `lint-staged`           | Active                                                | `lint-staged.config.mjs`   | For staged launcher source/config files, runs the existing launcher `format:check` and `lint` commands without introducing repo-wide formatting churn                                                                                                                                                                        |
| `prepare: husky` script | Active                                                | `launcher/package.json`    | Installs the root `.husky` hook path from the launcher package after dependency install                                                                                                                                                                                                                                      |

**Manual checks** are still expected before pushing (see the "Checks" section below).

## Checks

Run these from the repository root:

```bash
pnpm completion:gate:plan
pnpm completion:gate:status
pnpm completion:gate:local
pnpm completion:gate
```

`pnpm completion:gate:local` starts with `git diff --check HEAD`, includes
Supabase DB lint wrapper tests, Supabase migration lint, Supabase Edge Function
Deno checking, frontend coverage, release-tag script tests, a current-platform
Tauri debug bundle smoke, the pinned Rust 1.95.0 active-toolchain check, and,
on Windows, the Rust MSVC target check. Cargo test, clippy, target check, and
Tauri bundle lanes run with `Cargo.lock` frozen. The
HEAD diff check covers staged and unstaged whitespace/patch metadata errors. On
non-Windows hosts that Windows check is skipped with an explicit handoff note
because GitHub Actions runs it on `windows-2025`. The Supabase migration lint
wrapper starts the local database when needed, redacts local Supabase
credentials from CLI output, and stops only a database instance it started
itself. The release-tracking lane rejects both untracked and changed
release-critical paths, so a dirty tracked release artifact cannot produce a
clean-checkout local receipt. The Tauri debug bundle smoke is local only; tag
release builds still produce the full Windows/macOS/Linux artifact matrix after
the external release-boundary gate passes, with explicit per-platform artifact
inventory rows, pre-upload inventory validation, and upload failure when a
contract path matches no files. A successful local run writes a gitignored
`.codex/completion-gate-local-latest.json` receipt with check IDs, platform,
skipped platform-scoped checks, and an explicit `releaseProof: false` /
`externalEvidenceCollected: false` boundary so operators can see the last local
run without treating it as external release evidence.

`pnpm completion:gate:status` prints a redacted prerequisite/status inventory
without running checks or printing secret values. In status mode,
`local.ready`, `external.ready`, and `external.liveEvidence.ready` stay `null`,
`external.readySource` is `notEvaluated`, and `releaseReady` stays `false`;
use `local.latestReceipt` for the optional local-only receipt,
`external.statusPrerequisites` for env/artifact readiness, and
`pnpm completion:gate` for release-boundary evaluation.

`pnpm completion:gate` runs the local deterministic checks plus
`pnpm hosted:deploy-gate:preflight`, `pnpm hosted:deploy-gate:smoke`,
`pnpm hosted:cron-evidence`, and `pnpm external:evidence:preflight`. It is
expected to fail until the required external secrets, scheduler
rows, provider/hardware evidence, rollout artifacts, checked proof rows, and
specific evidence detail fields pass external preflight.
`OGL_EXTERNAL_EVIDENCE_GATES` and `OGL_HOSTED_CRON_EVIDENCE_CHECKS` scope only
the direct helper commands such as `pnpm external:evidence:*` and
`pnpm hosted:cron-evidence:*`; they do not scope `pnpm completion:gate:status`,
`pnpm completion:gate`, or the release-boundary evaluation.
Use `pnpm external:evidence:packet` for a single redacted operator handoff of
the remaining external gates; it lists names, artifact paths, proof
requirements, evidence fields, and commands only, without printing secrets or
checking proof rows. Use `pnpm external:evidence:runbook` when the operator
needs the same boundary as a sequenced capture runbook, and
`pnpm external:evidence:worklist` when the operator needs it grouped by artifact
path, missing proof labels, capture handoffs, complete missing detail field
names, and blocker labels before filling redacted evidence. Rollout-track
handoffs include hosted deploy packet/plan commands without treating them as
external proof.

Feature verification:

- Capture a screenshot for every UI-facing feature change.
- Store verification screenshots under `docs/verification/screenshots/`.
- Name screenshots after the feature and state, e.g. `custom-artwork-auto-candidates-applied.png`.

Rust:

```bash
cd launcher/src-tauri
rustup show active-toolchain
cargo fmt --all -- --check
cargo clippy --locked --lib --all-targets -- -D warnings
cargo clippy --locked --bins -- -D warnings
cargo test --locked
```

Supabase:

```bash
pnpm supabase:db:lint:test
pnpm supabase:db:lint
```

## License

AGPL-3.0-only. See [LICENSE](LICENSE).
