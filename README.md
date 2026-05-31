# Open Game Launcher

Desktop game launcher built with Tauri 2, React, TypeScript, Tailwind CSS, Rust, and Supabase. Native game library, store discovery, downloads, cloud saves, achievements, profiles, friends, and launcher settings.

Not production-ready. Store commerce, entitlements, CDN delivery, real patching, and production-grade download/install services are still future work.

## Status

| Area | Status |
| --- | --- |
| Desktop shell | Tauri 2, custom title bar, frameless window, window-bounds guard |
| Visual system | Retro Manga Launcher (`docs/PROJECT_DESIGN.md`) |
| Library | Installed-game scan, cache, manual add, move, launch, favorites, hidden, collections |
| Unified game model | Cross-platform type with launcher source, external id, install path, metadata, playtime, artwork, achievements, saves |
| External libraries | Steam, GOG, Epic (Legendary), Xbox, Game Pass, Ubisoft, Battle.net, EA — partially implemented |
| Downloads | Persistent queue, resumable HTTP jobs, optional SHA-256 verification, GOG downloads, external launcher tracking |
| Cloud saves | Supabase Storage per-game upload/download/restore + library snapshots |
| Achievements | Xbox + Steam sync |
| Presence | Supabase Realtime |
| Store | Mock data |
| Auth/Profile/Social | Supabase Auth, profile pages, friends, customization, privacy, blocks, comments, showcases, badges, social links, hardware |
| Tests | Minimal Rust coverage; frontend/Supabase/RLS tests needed |
| Releases | Tauri bundling exists; no release automation |

## Tech Stack

| Area | Technology |
| --- | --- |
| Runtime | Tauri 2 |
| Frontend | React 18, Vite 6, TypeScript |
| Styling | Tailwind CSS, Retro Manga design tokens |
| Native | Rust 1.77+ |
| Backend | Supabase Auth, Database, Storage, Realtime |
| Validation | Zod |
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
| `/`, `/store` | Store discovery |
| `/home` | Launcher home |
| `/library` | Game library |
| `/mods`, `/community` | Mods and community |
| `/downloads` | Download queue |
| `/friends` | Friends, requests, search, blocks |
| `/auth` | Sign in/sign up |
| `/u/:username` | Public profile |
| `/settings` | Launcher settings |
| `/settings/profile` | Edit profile |
| `/settings/profile/customize` | Theme/showcase customization |
| `/settings/privacy` | Visibility controls |

## Repository Structure

```
.
├── docs/PROJECT_DESIGN.md        # Design system
├── launcher/
│   ├── src/
│   │   ├── app/                  # Router + providers
│   │   ├── components/           # Layout, UI, profile, friends
│   │   ├── features/             # Feature-scoped code
│   │   ├── hooks/                # React hooks + auth
│   │   ├── lib/                  # Tauri wrappers, Supabase, types, mock data
│   │   │   ├── supabase/         # Services: profile, social, sync, presence
│   │   │   └── types/            # Domain types
│   │   ├── pages/                # Route screens
│   │   └── main.tsx
│   └── src-tauri/
│       └── src/commands/         # Rust: system, epic, xbox, downloads, games/
├── supabase/
│   ├── migrations/               # Schema, triggers, RLS, storage policies
│   ├── seed.sql
│   └── functions/                # Edge Functions
├── LICENSE                       # AGPL-3.0
└── README.md
```

## Native Commands

Accessed through `launcher/src/lib/launcher.ts`. Do not call `invoke()` directly.

| Command | Behavior |
| --- | --- |
| `get_system_info()` | OS, architecture, app version |
| `get_default_install_dir()` | Platform-aware default install dir |
| `get_hardware_info()` | Hardware details; WebGL fallback in renderer |
| `get_disk_info()` | Disk capacity, free space |
| `open_steam_login_window()` | Steam OpenID login WebView |
| `open_steam_scraper_window(steamId)` | Hidden Steam owned-games scraper |
| `open_gog_login_window()` | GOG OAuth in default browser |
| `open_epic_login_window()` | Epic login in default browser |
| `authenticate_epic_legendary(code)` | Epic SID/code → Legendary auth |
| `fetch_steam_owned_games(steamId)` | Local Steam cache + community page parsing |
| `fetch_gog_owned_games(accessToken)` | GOG owned products |
| `fetch_epic_owned_games()` | Legendary-owned Epic games |
| `add_manual_game(input)` | Add installed game path to cache |
| `update_game_metadata(input)` | Update cover, logo, achievements, saves, friends |
| `import_library_snapshot(games)` | Bulk-import game entries |
| `move_game(input)` | Move install dir + update cache |
| `list_installed_games()` | Installed-game cache with overrides |
| `refresh_installed_games()` | Scan + write local cache |
| `launch_game(gameId)` | Launch installed / open URI for owned |
| `verify_game_files(gameId)` | Verify install path, launch executable, saves, and OG manifest files |
| `repair_game_files(gameId)` | Repair pass |
| `check_game_updates()` | Check for updates |
| `install_game_update(gameId)` | Install update |
| `sync_game_saves(gameId)` | Local save sync → detected files |
| `upload_game_saves_to_cloud(input)` | Upload saves to Supabase |
| `download_game_saves_from_cloud(input)` | Download saves from Supabase |
| `restore_game_saves_from_cloud(input)` | Restore saves to disk |
| `sync_game_achievements(game, steamId?, apiKey?)` | Xbox/Steam achievement sync |
| `sync_xbox_achievements(gameId, titleId)` | Xbox Live achievements |
| `uninstall_game(gameId)` | Remove game + managed install dir |
| `start_download(gameId, title?, downloadUrl?, downloadSha256?)` | Queue internal HTTP download or external launcher tracker |
| `pause_download(gameId)` | Pause/resume download |
| `cancel_download(gameId)` | Cancel download |
| `get_download_queue()` | Persistent native queue |
| `open_xbox_login_window()` | Xbox Live login WebView |
| `fetch_xbox_owned_games(code)` | Xbox auth → owned titles |
| `launch_xbox_game(pfn)` | Launch Xbox game by package family name |
| `install_xbox_game(pfn)` | Open Microsoft Store install page |
| `fetch_game_pass_catalog()` | PC Game Pass catalog |

## Supabase

Migrations cover account, profile, social, and game data. Auth owns user id; `handle_new_user()` trigger creates profile/settings rows.

Key schema areas: profiles, themes, cosmetics, badges, showcases, comments, social links, hardware, friendships, blocks, games, library, stats, achievements, wishlists, activity, collections, library snapshots, cloud saves, presence.

RLS helpers: `can_view_profile()`, `can_view_visibility()`, `is_friend()`, `is_blocked()`.

Storage buckets: `avatars`, `profile-banners`, `profile-showcases`, `screenshots`.

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

## Roadmap

**Core:** Improve game discovery across all launchers. Harden Steam scanning (registry, appmanifest, Web API). Integrate Epic via Legendary. Expand Xbox detection. Native folder picker. Local-first SQLite store. Real download/install service. File verification from manifests.

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
