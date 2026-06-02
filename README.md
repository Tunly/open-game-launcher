# Open Game Launcher

Desktop game launcher built with Tauri 2, React, TypeScript, Tailwind CSS, Rust, and Supabase. Native game library, store discovery, downloads, cloud saves, achievements, profiles, friends, chat, and launcher settings.

Not production-ready. Store commerce, entitlements, CDN delivery, real patching, and production-grade download/install services are still future work.

## Status

| Area | Status |
| --- | --- |
| Desktop shell | Tauri 2, custom title bar, frameless window, window-bounds guard |
| Visual system | Retro Manga Launcher (`docs/PROJECT_DESIGN.md`) |
| Library | Installed-game scan, cache, manual add, move, launch, favorites, hidden, collections |
| Unified game model | Cross-platform type with launcher source, external id, install path, metadata, playtime, artwork, achievements, saves |
| External libraries | Steam, GOG, Epic (Legendary), Xbox, Game Pass, Ubisoft, Battle.net, EA |
| Downloads | Persistent queue, resumable HTTP jobs, optional SHA-256 verification, GOG chunk-verified downloads, external launcher tracking |
| Cloud saves | Supabase Storage per-game upload/download/restore + library snapshots |
| Achievements | Xbox + Steam sync |
| Presence | Supabase Realtime |
| Chat & invites | Direct messages, group chat rooms, game invites via Supabase Realtime |
| Local DB sync | SQLite-backed local-first entity sync with dirty tracking and remote conflict resolution |
| Store | Mock data |
| Auth/Profile/Social | Supabase Auth, profile pages, friends, customization, privacy, blocks, comments, showcases, badges, social links, hardware |
| Tests | Minimal Rust coverage; frontend/Supabase/RLS tests needed |
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
| `/store` | Store discovery |
| `/home` | Launcher home |
| `/library` | Game library |
| `/mods` | Mods browser |
| `/community` | Community hub |
| `/downloads` | Download queue |
| `/friends` | Friends, requests, search, blocks |
| `/auth` | Sign in/sign up |
| `/u/:username` | Public profile |
| `/settings` | Launcher settings |
| `/settings/profile` | Edit profile |
| `/settings/profile/customize` | Theme/showcase customization |
| `/settings/privacy` | Visibility controls |
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
│           ├── lib.rs                 # Command registration
│           └── main.rs
├── supabase/
│   ├── migrations/                    # 7 migrations (schema, RLS, realtime, chat, local entities)
│   ├── seed.sql
│   └── functions/
│       └── rawg-assets/               # RAWG API artwork proxy
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

## Supabase

Migrations cover account, profile, social, chat, and game data. Auth owns user id; `handle_new_user()` trigger creates profile/settings/rows.

### Tables (33)

Profiles & accounts: `profiles`, `profile_private`, `user_settings`.

Profile system: `profile_themes`, `user_profile_cosmetics`, `profile_showcases`, `profile_comments`, `user_badges`, `user_social_links`, `user_hardware`.

Game catalog: `games`, `achievements`.

Social & presence: `user_presence`, `friendships`, `user_blocks`.

Library & stats: `user_library`, `user_game_stats`, `game_sessions`, `user_achievements`, `achievement_progress`, `user_wishlist`, `user_reviews`.

Activity & collections: `user_devices`, `user_notifications`, `user_activity`, `user_game_collections`, `user_game_collection_items`.

Cloud sync: `user_library_snapshots`, `user_cloud_save_sets`, `user_cloud_save_files`.

Chat & invites: `chat_rooms`, `chat_room_members`, `chat_messages`, `game_invites`.

Local entity sync: `launcher_local_entities`.

### RLS Helpers

`can_view_profile()`, `can_view_visibility()`, `is_friend()`, `is_blocked()`, `is_username_available()`, `build_dm_pair_key()`, `private.is_chat_room_member()`.

### Storage Buckets

`avatars`, `profile-banners`, `profile-showcases`, `screenshots` (public). `game-saves` (private).

### Realtime

`user_presence`, `chat_messages`, `game_invites` are on the `supabase_realtime` publication.

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
- Store catalog is mock data
- Store/CDN delivery still needs real catalog download URLs
- Verify/repair don't check real manifests
- Platform tokens rely on localStorage
- Xbox integration is Windows-focused
- Epic depends on Legendary CLI
- No automated tests, no CI/CD
- Chat/invites schema exists but frontend integration is minimal
- Local DB sync commands exist but full offline-first flow is incomplete

## Roadmap

**Core:** Improve game discovery across all launchers. Harden Steam scanning (registry, appmanifest, Web API). Integrate Epic via Legendary. Expand Xbox detection. Native folder picker. Real download/install service. File verification from manifests.

**Platform:** Expand GOG, Ubisoft, EA, Battle.net via APIs/URIs/local manifests. External metadata providers (SteamGridDB, IGDB, HowLongToBeat). Non-launcher executable scanning.

**Social:** Supabase OAuth (Google, Discord, GitHub). Expand profile/friends flows. Realtime presence. Text chat + invites. Local-first offline sync. Cloud save sync for known save paths.

**Achievements & Media:** Cross-platform achievement aggregation. Screenshot/gallery management. Controller detection. Mod management (Steam Workshop). GDPR export/delete.

**Store:** Real backend catalog. Product pages, reviews, ratings, wishlist, cart, orders. Stripe/PayPal via Edge Functions. Signed CDN URLs. License limits + device tracking. Developer portal.

**Overlay:** Transparent always-on-top Tauri window for windowed/borderless games. Global hotkeys, notifications, chat, invites, perf stats.

**Quality:** Automated tests (Rust, React, RLS). Performance targets. Windows/Linux release automation.

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
