# Open Game Launcher

Desktop game launcher built with Tauri 2, React, TypeScript, Tailwind CSS, Rust, and Supabase. Native game library, store discovery, downloads, cloud saves, achievements, profiles, friends, chat, and launcher settings.

Not production-ready. Store commerce, entitlements, CDN delivery, real patching, and production-grade download/install services are still future work.

## Status

| Area | Status |
| --- | --- |
| Desktop shell | Tauri 2, custom title bar, frameless window, window-bounds guard |
| Visual system | Retro Manga Launcher (`docs/PROJECT_DESIGN.md`) |
| Library | Installed-game scan, cache, manual add, move, launch, favorites, hidden, collections, custom categories, dynamic collections |
| Unified game model | Cross-platform type with launcher source, external id, install path, metadata, playtime, artwork, achievements, saves |
| External libraries | Steam, GOG, Epic (Legendary), Xbox, Game Pass, Ubisoft, Battle.net, EA |
| Downloads | Persistent queue, resumable HTTP jobs, optional SHA-256 verification, GOG chunk-verified downloads, external launcher tracking |
| Cloud saves | Supabase Storage per-game upload/download/restore + library snapshots + AES-256-GCM E2E encryption with Argon2id key derivation |
| Achievements | Xbox + Steam + cross-platform aggregation; provider-status display for GOG/Epic/EA/Ubisoft/Battle.net; local JSON sidecar import; Epic public-fallback scraping |
| Cross-Play | `game_universal_id` mapping, CrossPlayBadge, Smart-Join button in friends list, `launch_cross_play_join` command |
| Presence | Supabase Realtime, platform hooks, overlay friends tab |
| Chat & invites | Direct messages, group chat rooms, game invites, universal-friends links via Supabase Realtime |
| Local DB sync | SQLite-backed local-first entity sync with dirty tracking and remote conflict resolution |
| Store | Backend: Stripe checkout EF, store schema, Developer Portal. Frontend: `StorePage` is still mock data with "Coming Soon" overlay |
| Mods | Full installer engine (URL/Archive/Folder, Steam-Workshop extractor), enable/disable, queue, pause/cancel, provider delegation |
| Controller | `gilrs` device detection, re-mapping editor, per-game layouts, templates, runtime translation, ViGEmBus detection |
| In-Game Overlay | Transparent Tauri window, 4 tabs (Freunde/Chat/Erfolge/Performance), Shift+F1 hotkey, anti-cheat banner, GDI screenshots persisted to AppData, DXGI FPS + NVML GPU |
| Performance-Monitor | Overlay tab + `FpsHudPage` with real CPU/RAM/FPS/GPU, DXGI frame-pacing, NVML |
| Auth/Profile/Social | Supabase Auth, profile pages, friends, customization, privacy, blocks, comments, showcases, badges, social links, hardware, family sharing |
| Custom Artwork | Drag-Drop-Upload in GameDetails + RAWG-Edge-Function proxy + asset cache |
| Deep Links | `universallauncher://` URI handler (`useDeepLink` hook) |
| Tests | 269+ automated tests across UI, hooks, stores, and Supabase database helpers |
| Releases | Tauri bundling exists; no release automation |

## Tech Stack

| Area | Technology |
| --- | --- |
| Runtime | Tauri 2 |
| Frontend | React 18, Vite 6, TypeScript 5.7 |
| Routing | React Router DOM 7 |
| State | Zustand 5 |
| Styling | Tailwind CSS 3.4, Retro Manga design tokens |
| Native | Rust 1.77+ (edition 2021) |
| Backend | Supabase Auth, Database, Storage, Realtime |
| Validation | Zod 4 |
| Icons | Lucide React |
| Package manager | pnpm |

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

RAWG artwork via Edge Function (`supabase/functions/rawg-assets`):

```bash
supabase secrets set RAWG_API_KEY=your_rawg_key
supabase functions deploy rawg-assets
```

For local Edge Function testing, create `supabase/functions/.env.local` with `RAWG_API_KEY=...` and run:

```bash
supabase functions serve rawg-assets --env-file supabase/functions/.env.local
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

| Command | Description |
| --- | --- |
| `pnpm dev` | Vite on `127.0.0.1:1420` |
| `pnpm build` | TypeScript + Vite production build |
| `pnpm preview` | Serve built frontend |
| `pnpm tauri dev` | Tauri desktop dev mode |
| `pnpm tauri build` | Desktop bundles |
| `pnpm typecheck` | TypeScript checks |
| `pnpm lint` | ESLint (zero-warning) |

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Redirects to `/library` |
| `/home` | Launcher home |
| `/library` | Game library |
| `/store` | Store discovery (mock data) |
| `/community` | Community hub |
| `/news` | News feed |
| `/mods` | Mods browser + install queue |
| `/downloads` | Download queue |
| `/friends` | Friends, requests, search, blocks, smart-join |
| `/family` | Family sharing + invites |
| `/controllers` | Controller hub (detection + layout editor) |
| `/achievements` | Achievements dashboard |
| `/auth` | Sign in/sign up |
| `/u/:username` | Public profile |
| `/settings` | Launcher settings |
| `/settings/profile` | Edit profile |
| `/settings/profile/customize` | Theme/showcase customization |
| `/settings/privacy` | Visibility controls |
| `/developer` | Developer Portal (store management) |
| `/overlay` | In-Game Overlay window (friends/chat/achievements/perf) |
| `/fps-hud` | Standalone FPS HUD |
| `*` | 404 not found |

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
│   │   │   ├── layout/                # AppLayout, AppShell, Sidebar, DesktopTitleBar
│   │   │   ├── library/               # GameDetails, LibraryRow, LibrarySidebar, PlatformIcons
│   │   │   ├── profile/               # ProfileHeader, ProfileBanner, ProfileAvatar, etc.
│   │   │   │   └── showcases/         # 9 showcase panels (About, Activity, Stats, etc.)
│   │   │   └── ui/                    # Button, ConfirmDialog
│   │   ├── features/                  # Scaffolded feature modules (friends, profile)
│   │   ├── hooks/                     # useCurrentUser, useLocalStorageState
│   │   ├── lib/
│   │   │   ├── supabase/              # client, config, helpers, profile, social, presence, local-entity-sync
│   │   │   ├── types/                 # Domain types
│   │   │   ├── validation/            # Zod schemas
│   │   │   ├── launcher.ts            # Tauri invoke wrappers
│   │   │   ├── library-filters.ts     # Library filtering logic
│   │   │   └── mock-data.ts           # Store mock data
│   │   ├── pages/                     # 14 route pages + NotFound
│   │   ├── stores/                    # Zustand stores (downloadStore)
│   │   └── main.tsx
│   └── src-tauri/
│       └── src/
│           ├── commands/
│           │   ├── system.rs          # System, hardware, Steam login/scrape
│           │   ├── gog.rs             # GOG OAuth, library, downloads, cloud saves
│           │   ├── epic.rs            # Epic (Legendary) auth + library
│           │   ├── xbox.rs            # Xbox login, library, Game Pass, achievements
│           │   ├── battlenet.rs       # Battle.net login + game scraping
│           │   ├── ea.rs              # EA token management + library
│           │   ├── ubisoft.rs         # Ubisoft local config parsing
│           │   ├── downloads.rs       # Download queue management
│           │   ├── http.rs            # Generic HTTP download worker
│           │   ├── local_db.rs        # Local SQLite entity sync
│           │   └── games/
│           │       ├── core.rs        # Game CRUD, launch, uninstall
│           │       ├── verify.rs      # File verification + repair
│           │       ├── sync.rs        # Cloud save sync
│           │       ├── detect.rs      # Game detection helpers
│           │       ├── playtime.rs    # Playtime tracking
│           │       └── types.rs       # Game types
│       └── src-tauri/
│           └── src/
│               ├── commands/
│               │   ├── system.rs          # System, hardware, Steam login/scrape
│               │   ├── gog.rs             # GOG OAuth, library, downloads, cloud saves
│               │   ├── epic.rs            # Epic (Legendary) auth + library
│               │   ├── xbox.rs            # Xbox login, library, Game Pass, achievements
│               │   ├── battlenet.rs       # Battle.net login + game scraping
│               │   ├── ea.rs              # EA token management + library
│               │   ├── ubisoft.rs         # Ubisoft local config parsing
│               │   ├── downloads.rs       # Download queue management
│               │   ├── http.rs            # Generic HTTP download worker
│               │   ├── local_db.rs        # Local SQLite entity sync
│               │   ├── crossplay.rs       # Cross-Play + Smart-Join command
│               │   ├── controller.rs      # `gilrs` device detection
│               │   ├── mod_install.rs     # Mod installer engine (URL/Archive/Folder/Steam Workshop)
│               │   ├── family.rs          # Family sharing + invite codes
│               │   ├── friends.rs         # Friend merge + universal-friends
│               │   ├── deeplink.rs        # `universallauncher://` URI handler
│               │   ├── overlay.rs         # In-Game Overlay window + GDI screenshots
│               │   ├── anti_cheat.rs      # AC process scanning
│               │   ├── perf_monitor.rs    # CPU/RAM/FPS/DXGI/NVML polling
│               │   ├── cloud_crypto.rs    # AES-256-GCM + Argon2id for cloud saves
│               │   ├── secure_store.rs    # OS keychain wrapper
│               │   ├── stripe.rs          # Stripe checkout wrapper
│               │   └── games/
│               │       ├── core.rs             # Game CRUD, launch, uninstall
│               │       ├── verify.rs           # File verification + repair
│               │       ├── sync.rs             # Cloud save sync
│               │       ├── detect/             # Game detection (epic, steam, mod)
│               │       ├── playtime.rs         # Playtime tracking
│               │       ├── idle.rs             # Platform-specific idle detection
│               │       ├── play_sessions.rs    # Session persistence
│               │       ├── device_id.rs        # Stable device fingerprint
│               │       └── types.rs            # Game types
│               ├── lib.rs                 # Command registration
│               └── main.rs
├── supabase/
│   ├── migrations/                    # 26+ migrations (schema, RLS, realtime, chat, local entities, cross-play, store, mods, family, controller, achievements)
│   ├── seed.sql
│   └── functions/
│       ├── rawg-assets/               # RAWG API artwork proxy
│       └── stripe-create-checkout/    # Stripe checkout session EF
├── LICENSE                            # AGPL-3.0
└── README.md
```

## Native Commands

Accessed through `launcher/src/lib/launcher.ts`. Do not call `invoke()` directly.

### System & Hardware

| Command | Behavior |
| --- | --- |
| `get_system_info()` | OS, architecture, app version |
| `get_default_install_dir()` | Platform-aware default install dir |
| `get_hardware_info()` | CPU, GPU, RAM, peripherals |
| `get_disk_info()` | Disk capacity, free space, filesystem |

### Steam

| Command | Behavior |
| --- | --- |
| `open_steam_login_window()` | Steam OpenID login WebView |
| `open_steam_scraper_window(steamId)` | Hidden Steam owned-games scraper |
| `fetch_steam_owned_games(steamId)` | Local Steam cache + community page parsing |
| `fetch_steam_profile_name(steamId)` | Steam display name via Steam XML API |
| `sync_game_achievements(game, steamId?, apiKey?)` | Steam achievement sync via Web API |

### GOG

| Command | Behavior |
| --- | --- |
| `open_gog_login_window()` | GOG OAuth login window |
| `gog_exchange_code(code)` | Exchange OAuth code for access/refresh token |
| `gog_refresh_token_command()` | Refresh stored GOG token if expired |
| `gog_get_token()` | Return stored GOG token |
| `gog_logout()` | Delete stored GOG token |
| `gog_fetch_owned_games()` | Fetch owned GOG library (catalog API + fallback) |
| `gog_get_download_info(gameId)` | GOG installer metadata (files, chunks, checksums) |
| `gog_start_download(gameId)` | Native GOG download with chunk verification |
| `gog_get_cloud_saves(gameId)` | List GOG cloud save files |

### Epic

| Command | Behavior |
| --- | --- |
| `open_epic_login_window()` | Epic login via Legendary CLI auth flow |
| `authenticate_epic_legendary(code)` | Epic SID/code → Legendary auth |
| `fetch_epic_owned_games()` | Legendary-owned Epic games |

### Xbox

| Command | Behavior |
| --- | --- |
| `open_xbox_login_window()` | Xbox Live OAuth login WebView |
| `fetch_xbox_owned_games(code)` | Xbox auth → owned titles + Game Pass |
| `launch_xbox_game(pfn)` | Launch Xbox game by package family name |
| `install_xbox_game(pfn)` | Open Microsoft Store install page |
| `fetch_game_pass_catalog()` | PC Game Pass catalog |
| `sync_xbox_achievements(gameId, titleId)` | Xbox Live achievements |

### Battle.net

| Command | Behavior |
| --- | --- |
| `open_battlenet_login_window()` | Battle.net login + owned game scraping |
| `process_battlenet_games_payload(payload)` | Decode base64 Battle.net games JSON |

### EA

| Command | Behavior |
| --- | --- |
| `open_ea_login_window()` | EA login, captures bearer token |
| `ea_get_token()` | Return stored EA token if valid |
| `ea_logout()` | Delete stored EA token |
| `ea_fetch_owned_games()` | Fetch owned EA library |

### Ubisoft

| Command | Behavior |
| --- | --- |
| `fetch_ubisoft_owned_games()` | Parse locally cached Ubisoft Connect config |

### Game Management

| Command | Behavior |
| --- | --- |
| `list_installed_games()` | Installed-game cache with overrides |
| `refresh_installed_games()` | Scan + write local cache |
| `add_manual_game(input)` | Add installed game path to cache |
| `update_game_metadata(input)` | Update cover, logo, achievements, saves, friends |
| `import_library_snapshot(games)` | Bulk-import game entries |
| `move_game(input)` | Move install dir + update cache |
| `launch_game(gameId)` | Launch installed / open URI for owned |
| `uninstall_game(gameId)` | Remove game + managed install dir |
| `cache_supabase_access_token(token?)` | Save/clear Supabase token for cloud sync |

### Verification & Updates

| Command | Behavior |
| --- | --- |
| `verify_game_files(gameId)` | Check installed files against OG manifest |
| `repair_game_files(gameId)` | Re-extract from local package to repair |
| `check_game_updates()` | Check OG-managed games for version updates |
| `install_game_update(gameId)` | Re-download to apply update |

### Cloud Save Sync

| Command | Behavior |
| --- | --- |
| `sync_game_saves(gameId)` | Copy save files to local sync cache |
| `upload_game_saves_to_cloud(input)` | Upload saves to Supabase Storage |
| `download_game_saves_from_cloud(input)` | Download saves to local restore folder |
| `restore_game_saves_from_cloud(input)` | Download + copy back to original paths |

### Downloads

| Command | Behavior |
| --- | --- |
| `start_download(gameId, title?, downloadUrl?, downloadSha256?)` | Queue HTTP download or external launcher tracker |
| `pause_download(gameId)` | Pause/resume download |
| `cancel_download(gameId)` | Cancel download + cleanup |
| `archive_download(gameId)` | Remove completed/cancelled download from queue |
| `get_download_queue()` | Persistent native queue |

### Local Database Sync

| Command | Behavior |
| --- | --- |
| `get_pending_local_entities()` | Dirty entities needing remote sync |
| `get_all_local_entities()` | All local entities regardless of sync status |
| `mark_local_entities_synced(entities)` | Clear dirty flag after sync |
| `apply_remote_local_entities(entities)` | Apply remote data with conflict resolution |
| `get_local_database_path()` | Filesystem path to local SQLite DB |
| `get_local_sync_status()` | Pending change count + last sync timestamp |

### Cross-Play & Smart-Join

| Command | Behavior |
| --- | --- |
| `get_cross_play_platforms(universalGameId)` | Lookup cross-play combinations |
| `launch_cross_play_join(universalGameId, platform)` | Launch game on compatible platform |

### Controller

| Command | Behavior |
| --- | --- |
| `list_controllers()` | Enumerate `gilrs`-detected gamepads |
| `set_controller_layout(layout)` | Persist per-game layout |
| `activate_controller_layout(gameId)` | Apply best layout before launch |
| `detect_vigembus()` | Check ViGEmBus driver presence |

### Mods

| Command | Behavior |
| --- | --- |
| `install_mod_from_url(input)` | Download + SHA-256 + extract mod archive |
| `scan_mod_directory(path)` | Scan folder for installed mods |
| `scan_game_mods(gameId)` | Detect installed mods for a game |
| `enable_mod(modId)` / `disable_mod(modId)` | Toggle mod activation |
| `uninstall_mod(modId)` | Remove mod + cleanup |
| `set_mod_provider_secret(provider, secret)` | Store API key for Nexus/CurseForge |

### Family Sharing

| Command | Behavior |
| --- | --- |
| `create_family_invite()` | Generate invite code |
| `join_family(inviteCode)` | Accept invite |
| `list_family_members()` | Enumerate current family |
| `leave_family()` | Remove self from family |

### In-Game Overlay

| Command | Behavior |
| --- | --- |
| `toggle_in_game_overlay()` | Show/hide transparent overlay window |
| `is_overlay_blocked_by_anti_cheat()` | Scan running processes for AC |
| `capture_screenshot()` | GDI `BitBlt` → JPEG, persist to AppData |
| `poll_performance_metrics()` | CPU/RAM/FPS/GPU/Frame-Time sample |
| `report_frame_rendered()` | DXGI frame-pacing tick |

### Cloud Save Crypto

| Command | Behavior |
| --- | --- |
| `generate_cloud_key()` | Create AES-256-GCM master key in OS keychain |
| `rotate_cloud_key()` | Replace master key, re-encrypt |
| `is_cloud_key_present()` | Check keychain for key |
| `encrypt_file(path)` | AES-256-GCM + Argon2id → `${user_id}/${game_id}/...enc` |
| `decrypt_file(path)` | Decrypt + verify meta |

### Store / Stripe

| Command | Behavior |
| --- | --- |
| `create_stripe_checkout(items)` | Start Stripe checkout session via EF |
| `validate_license(token)` | Offline license token check (30-day, device limit) |

## Supabase

Migrations cover account, profile, social, chat, and game data. Auth owns user id; `handle_new_user()` trigger creates profile/settings/rows.

### Tables

Profiles & accounts: `profiles`, `profile_private`, `user_settings`.

Profile system: `profile_themes`, `user_profile_cosmetics`, `profile_showcases`, `profile_comments`, `user_badges`, `user_social_links`, `user_hardware`.

Game catalog: `games`, `game_external_ids`, `achievements`.

Social & presence: `user_presence`, `friendships`, `user_blocks`, `friend_merge_groups`.

Library & stats: `user_library`, `user_game_stats`, `game_sessions`, `user_achievements`, `achievement_progress`, `user_wishlist`, `user_reviews`, `user_playtime_stats_writes`.

Activity & collections: `user_devices`, `user_notifications`, `user_activity`, `user_game_collections`, `user_game_collection_items`.

Cloud sync: `user_library_snapshots`, `user_cloud_save_sets`, `user_cloud_save_files`.

Chat & invites: `chat_rooms`, `chat_room_members`, `chat_messages`, `game_invites`, `share_tokens` (universal-friends).

Local entity sync: `launcher_local_entities`.

Cross-Play: `game_universal_ids`, `cross_play_combinations`.

Mods: `managed_mods`, `mod_profiles`, `mod_catalog`, `mod_catalog_versions`, `mod_catalog_user_installs`, `mod_catalog_dependencies`.

Store: `products`, `orders`, `cart_items`, `licenses`, `store_reviews`, `price_history`.

Family: `families`, `family_members`, `family_invites`.

Controller: `controller_layouts`.

### RLS Helpers

`can_view_profile()`, `can_view_visibility()`, `is_friend()`, `is_blocked()`, `is_username_available()`, `build_dm_pair_key()`, `private.is_chat_room_member()`.

### Storage Buckets

`avatars`, `profile-banners`, `profile-showcases`, `screenshots`, `game-artwork` (public). `game-saves` (private).

### Realtime

`user_presence`, `chat_messages`, `game_invites` are on the `supabase_realtime` publication.

### Edge Functions

`rawg-assets` (RAWG artwork proxy), `stripe-create-checkout` (Stripe checkout session).

Run locally:

```bash
supabase start
supabase db reset
```

Generate types:

```bash
supabase gen types typescript --local > launcher/src/lib/database.types.ts
```

## Environment Variables

| Variable | Description |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/publishable key |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Alternate anon key name |
| `RAWG_API_KEY` | Edge Function + dev fallback; do not ship in client builds |

## Known Gaps

- No native folder picker yet
- `StorePage` still uses mock data; backend (products, orders, Stripe) is real but not wired to UI
- Store/CDN delivery still needs real catalog download URLs
- Verify/repair don't check real manifests
- Platform tokens rely on localStorage
- Xbox integration is Windows-focused
- Epic depends on Legendary CLI
- No automated release deployment (CI lint, typecheck, and tests are automated via GitHub Actions)
- DSGVO: data export (JSON) and 30-day account deletion not implemented
- Cloud-Save Conflict-UI missing (no diff/merge view; sync is last-write-wins)
- `ActivitySection` (Recharts session-history) is built but not mounted in SettingsPage
- `PerfHistoryPage` route does not exist; per-session perf persistence not implemented
- Real platform polling for presence (Steam/Epic/Xbox) not implemented
- Backup/Restore and Remote Play/Downloads not started
- CurseForge/Mod.io mod providers have config but no native API integration

## Current State

Open Game Launcher is a working desktop application. This section describes what runs today. The complete product spec is in [`FEATURE_PLAN.md`](./FEATURE_PLAN.md).

### What works today
- Desktop shell (Tauri 2, custom title bar, frameless window, window-bounds guard)
- Visual system: **Retro Manga Launcher** ([`docs/PROJECT_DESIGN.md`](./docs/PROJECT_DESIGN.md)) — aged paper, halftone, red/teal, sharp corners
- Library: Installed-game scan, cache, manual add, move, launch, favorites, hidden, collections, custom categories, dynamic collections
- Unified game model with cross-platform type, launcher source, external id, install path, metadata, playtime, artwork, achievements, saves
- External libraries: **Steam, GOG, Epic (Legendary), Xbox, Game Pass, Ubisoft, Battle.net, EA**
- Downloads: Persistent queue, resumable HTTP jobs, optional SHA-256 verification, GOG chunk-verified downloads, external launcher tracking
- Cloud saves: Supabase Storage per-game upload/download/restore + library snapshots + **AES-256-GCM E2E encryption** with Argon2id key derivation (OS keychain master key)
- Achievements: Xbox + Steam sync via Web/Live APIs; cross-platform aggregation with provider-status display for GOG/Epic/EA/Ubisoft/Battle.net; local JSON sidecar import; Epic public-fallback scraping
- Cross-Play: `game_universal_id` mapping, CrossPlayBadge, **Smart-Join button in friends list**
- Presence: Supabase Realtime
- Chat & invites: Direct messages, group chat rooms, game invites, universal-friends links
- Local DB sync: SQLite-backed entity sync with dirty tracking and remote conflict resolution
- Auth/Profile/Social: Supabase Auth, profile pages, friends, customization, privacy, blocks, comments, showcases, badges, social links, hardware, **family sharing**
- 9 Profile showcase panels (About, Activity, Stats, ...)
- **Mod-Management**: full installer engine (URL/Archive/Folder), Steam-Workshop extractor, enable/disable, queue, pause/cancel, provider delegation
- **Controller support**: `gilrs` device detection, re-mapping editor, per-game layouts, templates, runtime translation, ViGEmBus detection
- **In-Game Overlay**: transparent Tauri window, 4 tabs, Shift+F1 hotkey, anti-cheat banner, GDI screenshots persisted to AppData, real DXGI FPS + NVML GPU
- **Performance-Monitor**: Overlay tab + `FpsHudPage` with CPU/RAM/FPS/GPU
- RAWG artwork via Edge Function proxy
- Custom Artwork: Drag-Drop-Upload in GameDetails
- Deep Links: `universallauncher://` URI handler
- Store backend: Stripe checkout EF, Developer Portal, store schema with products/orders/cart/licenses/reviews/price-history
- News feed page (`/news`)
- 26+ Supabase migrations (schema, RLS, realtime, chat, local entities, cross-play, store, mods, family, controller)

## Open Work

Features described in [`FEATURE_PLAN.md`](./FEATURE_PLAN.md) that are not yet implemented or only partially implemented.

### Embedded Client-Manager
- Full scope, Bereits-implementiert-Status und Offene Tasks: siehe [FEATURE_PLAN.md §0](./FEATURE_PLAN.md)
- Kurzfassung: 7-Plattform-Client-Detection, Process-Status-Polling, Library-Status-Indikatoren, Silent-Install, Auto-Updates, Client-Modifikation (Pfad-Overlays, Asset-Cache, Mod-Wurzelverzeichnisse)
- Client-Start weiterhin via offizielles URI-Protokoll

### Real Store Frontend
- `StorePage` is mock data; needs `listPublishedProducts()` wiring
- Product page: cover, description, price, reviews, sysreq
- Cart drawer + checkout flow
- Reviews (verified-purchase, 1-5 stars, abuse protection, developer replies)
- Wishlist + Price-Tracker (`PriceChart` over `price_history`, `notify-price-drop` EF)
- Order history + `validate_license` command (offline token 30 days, device limit)
- `Coming Soon` overlay needs to be removed once products land

### Custom-Link Invites (Partial)
- `universallauncher://` URI handler is wired (Tauri deeplink, `useDeepLink` hook)
- Universal-friends migration (`share_tokens`) is deployed
- Missing: JWT-based share tokens, web fallback page, cross-platform invite flow

### Cloud-Save Conflict-UI
- Currently last-write-wins (local or cloud overrides)
- Need: diff/merge view, manual "Lokal vs. Cloud" selection, conflict counter

### Performance History
- `PerfHistoryPage` route does not exist
- `ActivitySection` (Recharts session-history) is built but not mounted in SettingsPage
- Per-session perf persistence (300-sample buffer → `savePerfSession()` bulk-insert)

### Real Presence Platform Polling
- 60s polling per platform (Steam/Epic/Xbox) via Edge Function
- Real per-platform display in friends list (currently hardcoded `"steam"`)
- Friend activity feed enrichment

### Cross-Platform Achievements
- GOG local client scraper
- Epic local client data + Unlocks merge
- EA/Ubisoft/Battle.net local client caches
- Remote/Supabase sync for aggregated achievements

### DSGVO Compliance Gaps
- JSON data export (profile, friends, playtime, achievements, orders)
- 30-day account deletion (reactivation window + hard delete)

### Backup/Restore (lokal)
- External drive, ZIP/tar.gz compression
- Incremental diff-based backups
- Single-game or full restore

### Remote Play & Downloads
- Steam Remote Play / Epic EOS delegation
- Web dashboard `app.og-launcher.com` for remote install triggers

### Additional Open Features
- CurseForge/Mod.io native API integration (provider config exists, no API)
- Real manifests for `verify_game_files()`/`repair_game_files()`
- Real platform native folder picker
- IGDB API integration for Cross-Play data population
- Game Activity Dashboard (Spotify-Wrapped-style)
- Plugin-System, Themes, LAN-Transfer, Broadcasting, Mobile App
- Kernel-Level Virtual-Gamepad driver (Steam Input/ViGEm)
- Controller Community-Layouts with voting/moderation
- Real Gyro/Haptik driver integration

## Architectural Decisions

- **Cloud-first** (Supabase) mit Local-Cache (SQLite `launcher_local_entities`) für Offline-Resilienz
- **AGPL-3.0 Open-Source** Lizenz
- **Retro Manga Launcher** als fixes Design-System (siehe [`docs/PROJECT_DESIGN.md`](./docs/PROJECT_DESIGN.md))
- **Embedded Client-Manager** als Default: Open Game Launcher ist ein vollwertiger Client-Manager für alle unterstützten Plattformen. Erkennung laufender Clients, Silent-Install (wo lizenzrechtlich zulässig), Auto-Updates und Client-Modifikationen (Pfad-Overlays, Asset-Cache, Mod-Wurzelverzeichnisse) sind im Scope. Client-Start erfolgt über die offiziellen URI-Protokolle der jeweiligen Plattformen.
- **Tauri 2 + React 18 + TypeScript 5.7 + Rust 1.77+** als Stack
- **Supabase** für Auth, DB, Storage, Realtime

## Automation

All bot-style automation is **intentionally disabled** in this repository. This section documents what is off and how to re-enable it, so future contributors do not turn it on by accident.

| Bot | State | Where | How to re-enable |
| --- | --- | --- | --- |
| Dependabot (GitHub Actions) | Disabled | `.github/dependabot.yml` | Set `enabled: true` and re-add `schedule.interval` |
| Dependabot (npm) | Disabled | `.github/dependabot.yml` | Same as above |
| Dependabot (cargo) | Disabled | `.github/dependabot.yml` | Same as above |
| GitHub Actions CI | Manual only (`workflow_dispatch`) | `.github/workflows/ci.yml` | Switch `on` back to `push` + `pull_request` and remove the `if: ${{ false }}` guard on the `build` job |
| Husky pre-commit hook | Empty stub (does nothing) | `.husky/pre-commit` | Add commands to the file; `husky` and `lint-staged` deps have been removed from `launcher/package.json` so they need to be re-added too |
| `lint-staged` | Removed from `package.json` | n/a | Re-add the `lint-staged` block in `launcher/package.json` and the dev dep |
| `prepare: husky` script | Removed from `package.json` | n/a | Re-add `"prepare": "husky || true"` to `launcher/package.json` |

**Why off for now:** the project is in heavy architectural flux. Auto-bots fight the work-in-progress, churn PRs, and waste CI minutes. Re-enable when the codebase stabilizes.

**Manual checks** are still expected before pushing (see the "Checks" section below).

## Checks

```bash
cd launcher
pnpm typecheck
pnpm lint
pnpm build
```

Rust:

```bash
cd launcher/src-tauri
cargo test
```

Supabase:

```bash
supabase db reset
```

## License

AGPL-3.0-only. See [LICENSE](LICENSE).
