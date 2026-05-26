# Open Game Launcher

Open Game Launcher is an early-stage desktop game launcher MVP built with Tauri 2, React, TypeScript, Tailwind CSS, Rust, and Supabase. It provides a native desktop shell for a game library, store discovery, downloads, launcher settings, authentication, profiles, friends, and account customization.

The app is not production-ready yet. The current codebase has a real desktop runtime, native game/library discovery, launcher login integrations for Steam/GOG/Epic flows, profile and social database foundations, and a complete launcher UI direction. Store commerce, entitlements, CDN delivery, real patching, refunds, and production-grade download/install services are still future work.

## Status

| Area | Status |
| --- | --- |
| Desktop shell | Tauri 2 app with a custom desktop title bar and frameless main window |
| Visual system | Retro Manga Launcher style from `docs/PROJECT_DESIGN.md` |
| Navigation | Header-first navigation with `OG-Launcher` branding |
| Library | Native installed-game scan, cache, manual game add, launch actions, favorites, hidden games, and collections |
| External libraries | Steam, GOG, Epic, Ubisoft, Xbox, Battle.net, and EA discovery paths are partially implemented |
| Downloads | Queue UI and native progress events exist, but downloads still use a test file and mock install output |
| Verification | File verification is still simulated |
| Store | Uses local mock data, not a backend catalog |
| Auth/Profile/Social | Supabase Auth, profile pages, friends surfaces, profile customization, storage policies, and RLS migrations exist |
| Commerce | Entitlements, ownership grants, payments, refunds, CDN, and trusted writes are not production implemented |
| Tests | Minimal Rust coverage only; frontend, Supabase policy, and command tests need expansion |
| Releases | Tauri bundling exists; release automation is not configured |

## Visual Direction

All UI work must follow the project visual system in `docs/PROJECT_DESIGN.md`.

Required style: **Retro Manga Launcher**.

Use an aged paper background, halftone texture, thick black borders, hard offset shadows, sharp corners, dense launcher panels, red/teal accents, game art surfaces, and header navigation. Keep the header brand as `OG-Launcher`. Reuse `neo-title`, `neo-copy`, `neo-dots`, and the existing art placeholder classes. Do not replace the app with a dark SaaS/admin dashboard style.

## Features

- Tauri 2 desktop application shell with React/Vite frontend.
- Header-first launcher layout with Library, Store, Community, Downloads, Friends, Profile, and Settings surfaces.
- Native system info, disk info, hardware detection, default install directory resolution, and window bounds guard.
- Installed game discovery and local cache under the user's app data directory.
- Manual game add and move flows.
- Native launch attempts for installed games and platform URI launches for owned Steam/GOG/Epic entries.
- Steam login/scraper window flow and owned game normalization.
- GOG and Epic login windows plus owned game fetch wrappers.
- Download queue with progress, pause/resume, cancel, and Tauri events.
- Store page with featured/trending mock catalog data.
- Supabase sign in/sign up flow.
- Public profile route, profile edit, profile customization, privacy settings, friends, requests, search, blocks, comments, showcases, badges, social links, and hardware surfaces.
- Supabase migrations for profile, social, library, achievement, wishlist, activity, collection, storage, and RLS foundations.

## Tech Stack

| Area | Technology |
| --- | --- |
| Desktop runtime | Tauri 2 |
| Frontend | React 18, Vite 6, TypeScript |
| Styling | Tailwind CSS |
| Native layer | Rust |
| Backend services | Supabase Auth, Database, Storage |
| Validation | Zod |
| Icons | Lucide React |
| Package manager | pnpm |

## Repository Structure

```text
.
|-- docs/
|   `-- PROJECT_DESIGN.md        # Required Retro Manga Launcher design system
|-- launcher/
|   |-- src/
|   |   |-- app/                 # Router and app providers
|   |   |-- components/          # Layout, launcher UI, profile, friends, reusable UI
|   |   |-- features/            # Feature-scoped profile/friends code
|   |   |-- hooks/               # React hooks and auth state
|   |   |-- lib/                 # Tauri wrappers, Supabase client, types, mock data
|   |   |-- pages/               # App pages and route screens
|   |   `-- main.tsx
|   |-- src-tauri/
|   |   |-- src/
|   |   |   |-- commands/        # Rust command modules exposed to the frontend
|   |   |   |-- lib.rs
|   |   |   `-- main.rs
|   |   |-- capabilities/
|   |   |-- icons/
|   |   |-- Cargo.toml
|   |   `-- tauri.conf.json
|   |-- package.json
|   `-- vite.config.ts
|-- supabase/
|   |-- migrations/              # Database schema, triggers, functions, RLS, storage policies
|   `-- seed.sql                 # Local development seed data
|-- LICENSE
`-- README.md
```

## Prerequisites

- Node.js 20 or newer
- pnpm
- Rust stable
- Tauri 2 system dependencies
  - Windows: Microsoft Visual Studio Build Tools and WebView2
  - Linux: WebKitGTK/WebView dependencies for your distribution
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

| Script | Description |
| --- | --- |
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
| `get_hardware_info()` | Reads native hardware details where available |
| `get_disk_info()` | Returns disk capacity and filesystem data |
| `open_steam_login_window()` | Opens the Steam OpenID login window |
| `open_steam_scraper_window(steam_id)` | Opens a Steam owned-games scraper window |
| `open_gog_login_window()` | Opens the GOG OAuth/login flow |
| `open_epic_login_window()` | Opens the Epic login flow |
| `fetch_steam_owned_games(steam_id)` | Reads local Steam cache first, then attempts Steam community owned-games parsing |
| `fetch_gog_owned_games(access_token)` | Fetches owned GOG products with a provided token |
| `fetch_epic_owned_games(access_token, account_id)` | Fetches owned Epic library records with a provided token |
| `list_installed_games()` | Reads the local installed-game cache or refreshes native discovery |
| `refresh_installed_games()` | Scans installed games and writes the local cache |
| `add_manual_game(input)` | Adds a manually selected installed game path to the cache |
| `move_game(input)` | Moves a cached game's install directory and updates the cache |
| `launch_game(game_id)` | Launches installed games or opens Steam/GOG/Epic install URIs for owned entries |
| `verify_game_files(game_id)` | Simulates verification; this is not real manifest verification yet |
| `start_download(game_id)` | Starts a test download and writes a mock game executable on completion |
| `pause_download(game_id)` | Pauses or resumes an active test download |
| `cancel_download(game_id)` | Cancels an active test download |
| `get_download_queue()` | Returns the in-memory native download queue |

The Rust command layer is split by domain in `launcher/src-tauri/src/commands`: `system.rs`, `games.rs`, and `downloads.rs`.

## Local Data

The launcher currently stores state in several places:

- Installed game cache: local app data under `open-game-launcher/installed-games.json`.
- RAWG/Steam asset cache: local app data under `open-game-launcher/rawg-assets.json`.
- Download state: in-memory while the app is running.
- UI preferences, connected platform cache data, favorites, hidden games, and collections: browser `localStorage`.
- Profile, friends, privacy, comments, and public social data: Supabase when configured.

The local app configuration story is still incomplete. Settings should move out of scattered `localStorage` keys and into a native config file before production.

## Supabase

The project includes Supabase migrations for the account, profile, social, and game data model. Supabase Auth remains the source of truth for users. Public schema tables reference `auth.users` instead of duplicating authentication records.

Major schema areas include:

- Public and private profile data
- Profile themes, cosmetics, badges, showcases, comments, social links, and hardware
- Friend requests, friendships, and user blocks
- Game catalog records and user libraries
- Game stats, sessions, achievements, and achievement progress
- Wishlists, reviews, notifications, activity, and user collections
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

Supabase Auth owns the user id. The `handle_new_user()` trigger creates the public profile, private profile row, optional settings/hardware rows, and default showcases after a new `auth.users` row is inserted.

Visibility is enforced with RLS helper functions, including:

- `can_view_profile(viewer_id, profile_user_id)`
- `can_view_visibility(viewer_id, owner_id, visibility)`
- `is_friend(user_a, user_b)`
- `is_blocked(user_a, user_b)`

Profile cosmetics and private profile settings are safe for direct user writes under RLS. Ownership, purchases, library grants, playtime, achievements, badges, XP, trusted activity, payments, refunds, and entitlements must move behind a secure backend or Supabase `service_role` API before production.

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
- Patch state and local game manifests are not production-defined.
- Connected platform tokens/cache data still rely heavily on `localStorage`.
- Supabase trusted writes for ownership, purchases, achievements, playtime, notifications, and activity are not server-side yet.
- Automated tests are sparse.
- There is no GitHub Actions or equivalent release automation in the repository.

## Roadmap

### MVP / Core Launcher

- Improve native game discovery across Steam, Epic, GOG, Ubisoft, Xbox, Battle.net, and EA.
- Build a unified local game model with launcher source, external id, install path, executable path, launch command, process names, metadata, playtime, and artwork.
- Add stronger search, filters, sorting, store badges, favorites, hidden games, manual collections, and dynamic collections.
- Add game detail pages with launch options, language/settings controls, artwork customization, stats, achievements, friends, and install state.
- Add a native folder picker for install locations.
- Replace scattered launcher `localStorage` settings with a native config file.
- Move library, settings, offline cache, collections, artwork overrides, and sync state toward a local-first SQLite store.
- Turn installed-game cache data into a clearer local manifest format.
- Add uninstall, repair, move, update, and multi-drive install semantics.
- Implement real file verification from manifests and hashes.
- Replace the test download worker with a real install/download service.
- Add bandwidth limits, pause/resume persistence, retry handling, CDN manifest support, and platform-specific download backends.

### Platform Integrations

- Harden Steam scanning through registry/libraryfolders/appmanifest parsing, Steam Web API metadata, Steam URI launching, and local playtime parsing.
- Integrate Epic through Legendary CLI or equivalent tooling for owned games, install, launch, update, and uninstall.
- Expand GOG and Xbox integrations through official APIs where possible.
- Expand Ubisoft, EA, and Battle.net integrations through URI launching, local manifests, process tracking, and researched download/update paths.
- Add external metadata/artwork providers such as SteamGridDB, IGDB, HowLongToBeat, and fallback custom artwork uploads.
- Add non-launcher game detection through executable scanning, hash matching, and manual user confirmation.

### Account, Sync, And Social

- Add Supabase PKCE/deep-link OAuth for Google, Discord, GitHub, and Magic Link in the desktop app.
- Expand profile, privacy, and friends flows on top of the Supabase schema.
- Add Supabase Realtime presence, online status, current game activity, and friend activity.
- Add text chat, direct/group rooms, invitations, and deep-link game invites.
- Add local-first offline sync between SQLite and Supabase for account-linked settings, collections, social state, and profile data.
- Add cloud save sync research and implementation for known save paths, manual mappings, and cross-store save matching.
- Move trusted writes to backend/service-role code.

### Achievements, Media, And Tools

- Add achievement aggregation from Steam, Epic/Legendary, local manifests, and community mappings.
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

## Development Notes

- Keep UI changes aligned with `docs/PROJECT_DESIGN.md`.
- Keep `OG-Launcher` as the header brand and keep primary navigation in the header.
- Use the Tauri wrapper functions in `launcher/src/lib/launcher.ts` instead of direct `invoke()` calls in components.
- Preserve the separation between UI, native commands, Supabase access, and validation.
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
