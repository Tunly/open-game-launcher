# Open Game Launcher

Open Game Launcher is an early-stage desktop game launcher MVP built with Tauri 2, React, TypeScript, Tailwind CSS, Rust, and Supabase. It provides a native desktop shell for a game library, store discovery, downloads, launcher settings, authentication, profiles, friends, account customization, cloud saves, and achievements.

The app is not production-ready yet. The current codebase has a real desktop runtime, native game/library discovery, unified game model, launcher login integrations for Steam/GOG/Epic flows, Xbox Live and Game Pass support, profile and social database foundations, cloud save sync, achievement sync, presence, and a complete launcher UI direction. Store commerce, entitlements, CDN delivery, real patching, refunds, and production-grade download/install services are still future work.

## Status

| Area | Status |
| --- | --- |
| Desktop shell | Tauri 2 app with a custom desktop title bar and frameless main window, plus window-bounds guard |
| Visual system | Retro Manga Launcher style from `docs/PROJECT_DESIGN.md` |
| Navigation | Header-first navigation with `OG-Launcher` branding |
| Library | Native installed-game scan, cache, manual game add, move, launch, favorites, hidden games, and collections |
| Unified game model | Cross-platform game type with launcher source, external id, install path, executable, metadata, playtime, artwork, achievements, and save files |
| External libraries | Steam, GOG, Epic (via Legendary), Xbox, Game Pass, Ubisoft, Battle.net, and EA discovery paths are partially implemented |
| Downloads | Queue UI and native progress events exist, but downloads still use a test file and mock install output |
| Verification | File verification is still simulated |
| Repair | Repair flow exists in Rust command layer |
| Updates | Check/install updates flows exist in Rust command layer |
| Cloud saves | Local-first cloud save sync via Supabase with per-game upload/download/restore and library snapshots |
| Achievements | Xbox achievement sync and Steam achievement sync fallback are implemented |
| Presence | Supabase Realtime presence with visible online presence feed |
| Store | Uses local mock data, not a backend catalog |
| Auth/Profile/Social | Supabase Auth, profile pages, friends surfaces, profile customization, privacy settings, blocks, comments, showcases, badges, social links, and hardware surfaces |
| Commerce | Entitlements, ownership grants, payments, refunds, CDN, and trusted writes are not production implemented |
| Tests | Minimal Rust coverage only; frontend, Supabase policy, and command tests need expansion |
| Releases | Tauri bundling exists; release automation is not configured |

## Visual Direction

All UI work must follow the project visual system in `docs/PROJECT_DESIGN.md`.

Required style: **Retro Manga Launcher**.

Use an aged paper background, halftone texture, thick black borders, hard offset shadows, sharp corners, dense launcher panels, red/teal accents, game art surfaces, and header navigation. Keep the header brand as `OG-Launcher`. Reuse `neo-title`, `neo-copy`, `neo-dots`, and the existing art placeholder classes. Do not replace the app with a dark SaaS/admin dashboard style.

### Tailwind Design Tokens

The Tailwind config (`tailwind.config.ts`) provides the Retro Manga palette:

| Token | Usage |
| --- | --- |
| `neo-paper` | `#fbf4e7` — Primary paper background |
| `neo-paperAlt` | `#f5eedf` — Secondary paper |
| `neo-paperDark` | `#eee4d2` — Darker paper for hover states |
| `neo-ink` | `#171411` — Text and borders |
| `neo-red` | `#c20b2f` — Primary red accent |
| `neo-redBright` | `#e92846` — Bright red for hover |
| `neo-redDark` | `#a60724` — Dark red for active |
| `neo-teal` | `#087d6d` — Primary teal accent |
| `neo-tealDark` | `#007166` — Dark teal |
| `neo-blue` | `#4aa5c8` — Secondary accent |
| `neo-yellow` | `#e2bd22` — Warning/highlight |
| `neo-muted` | `#55504a` — Muted text |

Font families: `font-oswald` (titles), `font-mono` (code/labels), `font-body` (body text).

Shadow tokens: `shadow-neo` (4px offset), `shadow-neo-sm` (3px offset).

## Features

- Tauri 2 desktop application shell with React/Vite frontend and native Rust runtime.
- Header-first launcher layout with Home, Library, Store, Mods, Community, Downloads, Friends, Profile, and Settings surfaces.
- Native system info, disk info, hardware detection, default install directory resolution, and window bounds guard.
- Installed game discovery and local cache under the user's app data directory, with background inventory watcher.
- Unified local game model with launcher source, externalId, install path, executable path, launch command, process names, metadata, playtime, artwork, achievements, and save files.
- Manual game add, move, uninstall, import library snapshot, and metadata update flows.
- Native launch attempts for installed games and platform URI launches for owned Steam/GOG/Epic/Xbox entries.
- Steam login/scraper window flow, local registry and appinfo parsing, and owned-game normalization.
- GOG login window plus owned game fetch via web API.
- Epic login flow and owned game fetch via Legendary CLI integration.
- Xbox Live login, owned games, Game Pass catalog, launch, install, and achievement sync.
- Background playtime poller for active game tracking.
- Download queue with progress, pause/resume, cancel, and Tauri events. Non-Steam downloads write a manifest and update the library cache.
- Store page with featured/trending mock catalog data.
- Supabase sign in/sign up flow with magic link.
- Public profile route, profile edit, profile customization, privacy settings, friends, requests, search, blocks, comments, showcases, badges, social links, and hardware surfaces.
- Supabase migrations for profile, social, library, achievement, wishlist, activity, collection, storage, and RLS foundations.
- Cloud save sync with Supabase Storage: per-game upload/download/restore, save-set metadata, and full library snapshots.
- Achievement sync surfaces for Xbox and Steam.
- Presence with Supabase Realtime visibility, last heartbeat, and custom status.

## Tech Stack

| Area | Technology |
| --- | --- |
| Desktop runtime | Tauri 2 |
| Frontend | React 18, Vite 6, TypeScript |
| Styling | Tailwind CSS, Retro Manga Launcher design tokens |
| Native layer | Rust 1.77+ |
| Backend services | Supabase Auth, Database, Storage, Realtime |
| Validation | Zod |
| Icons | Lucide React |
| Package manager | pnpm |

## Repository Structure

```text
.
|-- docs/
|   `-- PROJECT_DESIGN.md # Required Retro Manga Launcher design system
|-- launcher/
|   |-- src/
|   |   |-- app/           # Router and app providers
|   |   |-- components/    # Layout, launcher UI, profile, friends, reusable UI
|   |   |-- features/      # Feature-scoped profile/friends code
|   |   |-- hooks/         # React hooks and auth state
|   |   |-- lib/           # Tauri wrappers, Supabase client, types, mock data
|   |   |   |-- supabase/  # Supabase services: profile, social, library sync, presence, helpers
|   |   |   |-- storage-keys.ts # Centralized localStorage key registry
|   |   |   `-- types/     # Domain type definitions including profile types
|   |   |-- pages/         # App pages and route screens
|   |   `-- main.tsx
|   |-- src-tauri/
|   |   |-- src/
|   |   |   |-- commands/  # Rust command modules exposed to the frontend
|   |   |   |   |-- games.rs        # Re-export
|   |   |   |   |-- games/
|   |   |   |   |   |-- core.rs     # Core game cache and shared types
|   |   |   |   |   |-- detect.rs   # Installed game detection
|   |   |   |   |   |-- sync.rs     # Playtime poller and inventory watcher
|   |   |   |   |   |-- verify.rs   # File verification helper
|   |   |   |   |   `-- types.rs    # Shared Rust game/achievement types
|   |   |   |   |-- downloads.rs   # Download manager with pause/resume/cancel
|   |   |   |   |-- epic.rs        # Epic Login + Legendary + fetch owned games
|   |   |   |   |-- system.rs      # System info, hardware, disk, Steam/GOG/OAuth login, owned games
|   |   |   |   `-- xbox.rs        # Xbox Live auth, owned games, Game Pass, launch, install, achievements
|   |   |   |-- lib.rs     # Tauri builder and command registration
|   |   |   `-- main.rs
|   |   |-- capabilities/
|   |   |-- icons/
|   |   |-- Cargo.toml
|   |   `-- tauri.conf.json
|   |-- package.json
|   `-- vite.config.ts
|-- supabase/
|   |-- migrations/        # Database schema, triggers, functions, RLS, storage policies
|   |-- seed.sql           # Local development seed data
|   |-- functions/         # Edge Functions
|   `-- .gitignore         # Supabase local ignore rules
|-- LICENSE
`-- README.md
```

## Prerequisites

- Node.js 20 or newer
- pnpm
- Rust stable 1.77 or newer
- Tauri 2 system dependencies
- Windows: Microsoft Visual Studio Build Tools and WebView2
- Linux: WebKitGTK/WebView dependencies for your distribution
- macOS: Xcode Command Line Tools and WebKit dependencies
- Supabase CLI, if you want to run the database locally

For platform-specific Tauri setup, follow the official Tauri prerequisites for your operating system.

## Getting Started

Install frontend dependencies:

```bash
cd launcher
pnpm install
```

Create `launcher/.env.local`:

```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_or_publishable_key
```

`VITE_SUPABASE_PUBLISHABLE_KEY` is also supported as an alternative to `VITE_SUPABASE_ANON_KEY`. Do not expose a Supabase `service_role` key in the client.

RAWG artwork is fetched through the Supabase Edge Function in `supabase/functions/rawg-assets`, so production builds should keep the RAWG key in Supabase secrets instead of the launcher client:

```bash
supabase secrets set RAWG_API_KEY=your_rawg_key
supabase functions deploy rawg-assets
```

For local Edge Function testing, create `supabase/functions/.env.local` with `RAWG_API_KEY=...` and run:

```bash
supabase functions serve rawg-assets --env-file supabase/functions/.env.local
```

`launcher/.env.local` may still define `RAWG_API_KEY` as a development fallback for native scans, but do not ship it in client-facing builds.

Start the desktop app in development mode:

```bash
pnpm tauri dev
```

For frontend-only browser development:

```bash
pnpm dev
```

The browser-only Vite app can render most UI. Native Tauri `invoke()` commands only work in the Tauri desktop runtime.

## Available Scripts

Run these from `launcher/`.

| `pnpm dev` | Starts Vite on `127.0.0.1:1420` |
| `pnpm build` | Runs TypeScript project build and creates the Vite production build |
| `pnpm preview` | Serves the built frontend for preview |
| `pnpm tauri dev` | Starts the Tauri desktop app in development mode |
| `pnpm tauri build` | Builds desktop application bundles |
| `pnpm typecheck` | Runs TypeScript checks without emitting files |
| `pnpm lint` | Runs ESLint with zero-warning enforcement |

## Routes

| Route | Purpose |
| --- | --- |
| `/` and `/store` | Store discovery page with mock catalog data |
| `/home` | Launcher home surface |
| `/library` | Installed and connected game library |
| `/mods` | Mods surface |
| `/community` | Community surface |
| `/downloads` | Download queue |
| `/friends` | Friends, requests, search, and blocks |
| `/auth` | Supabase sign in/sign up |
| `/u/:username` | Public profile |
| `/settings` | Launcher settings and platform connections |
| `/settings/profile` | Edit profile |
| `/settings/profile/customize` | Profile theme/showcase customization |
| `/settings/privacy` | Visibility controls |

## Building

Create a production frontend build:

```bash
cd launcher
pnpm build
```

Create Tauri desktop bundles:

```bash
pnpm tauri build
```

Generated installers and bundles are created by Tauri under `launcher/src-tauri/target/`.

## Native Commands

Frontend code accesses native functionality through `launcher/src/lib/launcher.ts`. Components should use this wrapper instead of calling `invoke()` directly.

Current command groups:

| Command | Current behavior |
| --- | --- |
| `get_system_info()` | Returns operating system, architecture, and app version |
| `get_default_install_dir()` | Resolves a platform-aware default game install directory |
| `get_hardware_info()` | Reads native hardware details where available; falls back to browser WebGL/device info in renderer |
| `get_disk_info()` | Returns disk capacity, available space, and filesystem data |
| `open_steam_login_window()` | Opens the Steam OpenID login window in an embedded WebView |
| `open_steam_scraper_window(steamId)` | Opens a hidden Steam owned-games scraper WebView |
| `open_gog_login_window()` | Opens the GOG OAuth/login flow in the default browser |
| `open_epic_login_window()` | Opens the Epic login page in the default browser |
| `authenticate_epic_legendary(code)` | Completes Epic authentication by exchanging a SID/code for Legendary auth |
| `fetch_steam_owned_games(steamId)` | Reads local Steam cache first (appinfo, librarycache, playtime), then attempts community page parsing |
| `fetch_gog_owned_games(accessToken)` | Fetches owned GOG products with a provided token |
| `fetch_epic_owned_games()` | Returns Legendary-owned Epic games after auth |
| `add_manual_game(input)` | Adds a manually selected installed game path to the cache |
| `update_game_metadata(input)` | Updates game cover, logo, icon, rating, achievements, save files, and friends-playing metadata |
| `import_library_snapshot(games)` | Bulk-imports a snapshot of game entries into the local cache |
| `move_game(input)` | Moves a cached game's install directory and updates the cache |
| `list_installed_games()` | Returns the current installed-game cache including Steam exe discovery, metadata overrides, favorites, hidden, and features |
| `refresh_installed_games()` | Scans installed games and writes the local cache |
| `launch_game(gameId)` | Launches installed games or opens Steam/GOG/Epic/Xbox install/launch URIs for owned entries |
| `verify_game_files(gameId)` | Verifies files; simulated until a manifest approach is implemented |
| `repair_game_files(gameId)` | Begins a repair pass for a game |
| `check_game_updates()` | Checks the managed library for games that have updates available |
| `install_game_update(gameId)` | Begins installing an available update for the given game |
| `sync_game_saves(gameId)` | Starts a local save sync and returns detected local save files |
| `upload_game_saves_to_cloud(input)` | Uploads local save files to the cloud via Supabase backend |
| `download_game_saves_from_cloud(input)` | Downloads cloud save files for a game |
| `restore_game_saves_from_cloud(input)` | Restores a previously downloaded save set back onto disk |
| `sync_game_achievements(game, steamId?, apiKey?)` | Syncs achievements for the given game; Xbox uses `sync_xbox_achievements` internally |
| `sync_xbox_achievements(gameId, titleId)` | Fetches Xbox achievements from Xbox Live and updates the local cache |
| `uninstall_game(gameId)` | Removes a game from the library and removes its managed install directory where possible |
| `start_download(gameId)` | Starts a test download, writes a manifest and dummy executable on completion, and updates the library cache |
| `pause_download(gameId)` | Pauses or resumes an active test download |
| `cancel_download(gameId)` | Cancels an active test download |
| `get_download_queue()` | Returns the in-memory native download queue |
| `open_xbox_login_window()` | Opens an embedded Xbox Live login window |
| `fetch_xbox_owned_games(code)` | Exchanges a Microsoft auth code and returns owned Xbox titles with title history |
| `launch_xbox_game(pfn)` | Launches an installed Xbox game by package family name on Windows |
| `install_xbox_game(pfn)` | Opens the Microsoft Store install page for an Xbox title |
| `fetch_game_pass_catalog()` | Fetches the current PC Game Pass catalog from Microsoft display APIs |

The Rust command layer is split by domain in `launcher/src-tauri/src/commands`: `system.rs`, `epic.rs`, `xbox.rs`, `downloads.rs`, and `games/` (detect, core, sync, verify, playtime types).

## Local Data

The launcher currently stores state in several places:

- Installed game cache: local app data under `open-game-launcher/installed-games.json`.
- RAWG/Steam asset cache: local app data under `open-game-launcher/rawg-assets.json`.
- Download state: in-memory while the app is running.
- Cloud save metadata and snapshots: Supabase tables when configured; fallback behavior may still mark local state.
- UI preferences, connected platform cache data, favorites, hidden games, and collections: browser `localStorage` (keys centralized in `launcher/src/lib/storage-keys.ts`).
- Profile, friends, privacy, comments, achievements, presence, and public social data: Supabase when configured.

The local app configuration story is still incomplete. Settings should move out of scattered `localStorage` keys and into a native config file before production. Connected platform tokens (Xbox, Epic) still rely on external JSON files or Legendary state before production hardening.

## Supabase

The project includes Supabase migrations for the account, profile, social, and game data model. Supabase Auth remains the source of truth for users. Public schema tables reference `auth.users` instead of duplicating authentication records.

Major schema areas include:

- Public and private profile data
- Profile themes, cosmetics, badges, showcases, comments, social links, and hardware
- Friend requests, friendships, and user blocks
- Game catalog records and user libraries
- Game stats, sessions, achievements, and achievement progress
- Wishlists, reviews, notifications, activity, and user collections
- Library snapshots, cloud save sets, and cloud save files
- Row Level Security policies for ownership, visibility, and social access rules
- Storage policies for profile assets

Run Supabase locally:

```bash
supabase start
supabase db reset
```

Generate TypeScript database types after applying migrations:

```bash
supabase gen types typescript --local > launcher/src/lib/database.types.ts
```

Development users should be created through Supabase Auth. Do not seed directly into `auth.users`.

## Profile System

The profile system lives in `supabase/migrations/0001_user_social_game_schema.sql`, `supabase/migrations/0002_profile_system.sql`, and the frontend under `launcher/src/pages`, `launcher/src/components/profile`, `launcher/src/components/friends`, and `launcher/src/lib/supabase/profile.ts`.

Created data areas:

- `profiles` and `profile_private` split public gamer identity from private personal data.
- `profile_themes`, `user_profile_cosmetics`, `user_badges`, `profile_showcases`, `user_social_links`, and `user_hardware` power profile customization.
- `friendships`, `user_blocks`, and `profile_comments` cover social access, blocking, requests, and guestbook behavior.
- `games`, `user_library`, `user_game_stats`, `achievements`, `user_achievements`, `user_wishlist`, `user_activity`, `user_game_collections`, and `user_game_collection_items` prepare launcher-owned game/profile surfaces.
- `user_library_snapshots`, `user_cloud_save_sets`, and `user_cloud_save_files` support cloud save sync and restore behavior.
- `user_presence` supports online status, last heartbeat, current game activity, and custom status.

Supabase Auth owns the user id. The `handle_new_user()` trigger creates the public profile, private profile row, optional settings/hardware rows, and default showcases after a new `auth.users` row is inserted.

Visibility is enforced with RLS helper functions, including:

- `can_view_profile(viewer_id, profile_user_id)`
- `can_view_visibility(viewer_id, owner_id, visibility)`
- `is_friend(user_a, user_b)`
- `is_blocked(user_a, user_b)`

Profile cosmetics and private profile settings are safe for direct user writes under RLS. Ownership, purchases, library grants, playtime, achievements, badges, XP, trusted activity, payments, refunds, entitlements, and cloud saves must move behind a secure backend or Supabase `service_role` API before production.

Storage buckets created by the migration:

- `avatars`
- `profile-banners`
- `profile-showcases`
- `screenshots`

The policies allow public reads and restrict authenticated uploads, updates, and deletes to paths prefixed by the user's id, for example `avatars/{user_id}/...`.

## Known Gaps

- Native folder picker is not wired yet; settings currently show a placeholder message.
- Store catalog is mock data, not Supabase or a commerce backend.
- Download service uses a public 10 MB test file and writes a dummy executable.
- Verify flow does not check real manifests or file hashes.
- Patch state and full install/uninstall manifests are not production-defined.
- Connected platform tokens/cache data still rely heavily on localStorage, except Xbox/OAuth and Epic Legendary state.
- Supabase trusted writes for ownership, purchases, achievements, playtime, notifications, and activity are not server-side yet.
- Automated tests are sparse.
- There is no GitHub Actions or equivalent release automation in the repository.
- Epic integration depends on Legendary CLI download and local authed session state.
- Xbox integration is Windows-focused today.

## Roadmap

### MVP / Core Launcher

- Improve native game discovery across Steam, Epic, Xbox, GOG, Ubisoft, Battle.net, and EA.
- Harden Steam scanning through registry, libraryfolders, appmanifest parsing, Steam Web API metadata, Steam URI launching, and local playtime parsing.
- Integrate Epic through Legendary CLI for owned games, install, launch, update, and uninstall.
- Strengthen Xbox detection beyond UWP AppxPackage inspection.
- Build a unified game model with stronger game detail pages, launch options, language/settings controls, artwork customization, stats, achievements, friends, and install state.
- Add a native folder picker for install locations.
- Replace scattered launcher `localStorage` settings with a native config file.
- Move library, settings, offline cache, collections, artwork overrides, and sync state toward a local-first SQLite store.
- Turn installed-game cache data into a clearer local manifest format.
- Add uninstall, repair, move, update, and multi-drive install semantics.
- Implement real file verification from manifests and hashes.
- Replace the test download worker with a real install/download service.
- Add bandwidth limits, pause/resume persistence, retry handling, CDN manifest support, and platform-specific download backends.

### Platform Integrations

- Expand GOG integration through official APIs where possible.
- Expand Ubisoft, EA, and Battle.net integrations through URI launching, local manifests, process tracking, and researched download/update paths.
- Add external metadata/artwork providers such as SteamGridDB, IGDB, HowLongToBeat, and fallback custom artwork uploads.
- Add non-launcher game detection through executable scanning, hash matching, and manual user confirmation.

### Account, Sync, And Social

- Add Supabase PKCE/deep-link OAuth for Google, Discord, GitHub, and Magic Link in the desktop app.
- Expand profile, privacy, and friends flows on top of the Supabase schema.
- Add Supabase Realtime presence, online status, current game activity, and friend activity.
- Add text chat, direct/group rooms, invitations, and deep-link game invites.
- Add local-first offline sync between local state and Supabase for account-linked settings, collections, social state, and profile data.
- Add cloud save sync research and implementation for known save paths, manual mappings, and cross-store save matching.
- Move trusted writes to backend/service-role code.

### Achievements, Media, And Tools

- Add achievement aggregation from Steam, Epic/Legendary, Xbox, local manifests, and community mappings.
- Add screenshot/media management with local capture, gallery views, and Supabase Storage upload where appropriate.
- Add controller detection and later controller remapping support.
- Add mod-management research for Steam Workshop and manual mod installs.
- Add privacy/export/delete tooling for GDPR-style account and data management.

### Store And Commerce

- Connect the store catalog to a real backend source.
- Add product pages, screenshots/trailers, system requirements, reviews, ratings, recommendations, wishlist, sales, cart, order history, and refund surfaces.
- Add entitlement, ownership, payment, refund, and CDN integration.
- Implement Stripe first through Supabase Edge Functions, payment webhooks, deep-link return handling, and license creation.
- Add PayPal and other payment providers later.
- Add signed CDN URLs for owned game downloads through Cloudflare R2, BunnyCDN, Backblaze B2, or equivalent storage.
- Add license limits, offline tokens, family sharing rules, and device activation tracking.
- Add a developer portal for game submission, builds, malware scanning, analytics, revenue reports, and payouts.

### Overlay And Later Features

- Add a safe MVP overlay as a transparent always-on-top Tauri window for windowed/borderless games.
- Add global hotkey toggling, notifications, friend list, chat, invites, and performance stats in the overlay.
- Maintain an anti-cheat compatibility database and use external-window/toast fallbacks where overlay is unsafe.
- Research true in-game overlay approaches separately from the MVP.
- Explore cross-store save sync, smart install source selection, one-click new-PC setup, game activity recap dashboards, local multiplayer hub, plugin system, themes, AI recommendations, mobile companion app, LAN transfer, broadcasting, remote downloads, and remote play delegation.

### Quality And Releases

- Add automated tests for Rust commands, React flows, and Supabase RLS policies.
- Add performance targets and checks for startup time, idle RAM, idle CPU, and background scanner behavior.
- Add packaging and release automation for Windows and Linux.

## Environment Variables

| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/publishable key |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Alternate anon key name |
| `RAWG_API_KEY` | Used by the Edge Function and optional dev fallback for artwork; do not ship in client builds |

The Rust starter loads `.env` and `.env.local` automatically in development. Root and frontend `.env` files are also resolved.

## Development Notes

- Keep UI changes aligned with `docs/PROJECT_DESIGN.md`.
- Keep `OG-Launcher` as the header brand and keep primary navigation in the header.
- Use the Tauri wrapper functions in `launcher/src/lib/launcher.ts` instead of direct `invoke()` calls in components.
- Preserve the separation between UI, native commands, Supabase access, and validation.
- Use `launcher/src/lib/storage-keys.ts` for all `localStorage` keys instead of hardcoded strings.
- Use shared Supabase helpers from `launcher/src/lib/supabase/helpers.ts` (row accessors, error handling) instead of duplicating them across service files.
- Use the `neo-*` Tailwind tokens (`neo-paper`, `neo-ink`, `neo-red`, `neo-teal`, etc.) and font families (`font-oswald`, `font-mono`, `font-body`) for consistent Retro Manga styling.
- Do not commit local generated test artifacts such as temporary Steam JSON dumps unless they become intentional fixtures.

## Checks

Run relevant checks before finishing code changes:

```bash
cd launcher
pnpm typecheck
pnpm lint
pnpm build
```

For Rust-side command changes:

```bash
cd launcher/src-tauri
cargo test
```

For Supabase schema/RLS changes:

```bash
supabase db reset
```

## License

This project is licensed under the GNU Affero General Public License v3.0 only (AGPL-3.0-only).

See the [LICENSE](LICENSE) file for the full license text.
