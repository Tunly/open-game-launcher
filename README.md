# Open Game Launcher

Open Game Launcher is an early-stage desktop game launcher MVP built with Tauri 2, React, TypeScript, Tailwind CSS, Rust, and Supabase. It provides a native desktop shell for a game library, store discovery, downloads, launcher settings, authentication, profiles, and social features.

The current implementation focuses on a clean application foundation: a modern React UI, isolated Tauri command wrappers, native Rust command modules, and a Supabase schema for account, profile, social, and game data. Windows and Linux are the primary targets. macOS support is structurally prepared through Tauri and Rust, but is not the main target yet.

## Status

This repository is an MVP foundation, not a production-ready launcher. The UI already includes realistic launcher flows, while game launch, download, verification, entitlement, catalog, and payment behavior still need real backend and native service implementations.

## Features

- Cross-platform desktop application shell powered by Tauri 2
- React, Vite, TypeScript, and Tailwind CSS frontend
- Responsive launcher layout with sidebar navigation
- Library view with installed games, update states, play/install actions, and file verification flow
- Store view for featured games and add-to-library interactions
- Download queue UI with progress, pause/resume, and cancel controls
- Settings page with native system info, default install path resolution, and local preferences
- Supabase authentication flow for sign in and sign up
- Profile and friends pages for account and social launcher surfaces
- Supabase migrations for profiles, friendships, blocks, libraries, achievements, wishlists, activity, collections, and profile customization
- Rust command modules for launcher, download, and system operations

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
|-- launcher/
|   |-- src/
|   |   |-- app/                 # Application-level providers
|   |   |-- components/          # Layout, launcher, and reusable UI components
|   |   |-- hooks/               # React hooks and auth state
|   |   |-- lib/                 # Tauri wrappers, Supabase client, types, mock data
|   |   |-- pages/               # Library, Store, Downloads, Community, Settings, Profile, Friends, Auth
|   |   |-- App.tsx
|   |   `-- main.tsx
|   |-- src-tauri/
|   |   |-- src/
|   |   |   |-- commands/        # Rust command modules exposed to the frontend
|   |   |   |-- lib.rs
|   |   |   `-- main.rs
|   |   |-- capabilities/
|   |   |-- Cargo.toml
|   |   `-- tauri.conf.json
|   |-- package.json
|   `-- vite.config.ts
`-- supabase/
    |-- migrations/              # Database schema, triggers, functions, and RLS policies
    `-- seed.sql                 # Local development seed data
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

For frontend-only development in the browser:

```bash
pnpm dev
```

The browser-only Vite preview can render the UI, but native Tauri `invoke()` commands only work inside the Tauri desktop runtime.

## Available Scripts

Run these from the `launcher/` directory.

| Script | Description |
| --- | --- |
| `pnpm dev` | Starts Vite on `127.0.0.1:1420` |
| `pnpm build` | Runs TypeScript project build and creates the Vite production build |
| `pnpm preview` | Serves the built frontend for preview |
| `pnpm tauri dev` | Starts the Tauri desktop app in development mode |
| `pnpm tauri build` | Builds desktop application bundles |
| `pnpm typecheck` | Runs TypeScript checks without emitting files |
| `pnpm lint` | Runs ESLint with zero-warning enforcement |

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

Current commands:

| Command | Purpose |
| --- | --- |
| `get_system_info()` | Returns operating system, architecture, and app version |
| `get_default_install_dir()` | Resolves a platform-aware default game installation directory |
| `launch_game(game_id)` | Accepts a launch request and returns a stubbed success response |
| `verify_game_files(game_id)` | Simulates file verification and returns checked/missing file information |
| `start_download(game_id)` | Queues a stubbed download response |

The command boundaries are intentionally in place so real process launching, file verification, patching, and download management can be added without coupling UI components to native implementation details.

## Supabase

The project includes Supabase migrations for the account, profile, social, and game data model. Supabase Auth remains the source of truth for users. Public schema tables reference `auth.users` instead of duplicating authentication records.

Major schema areas include:

- Public and private profile data
- Profile themes, badges, showcases, comments, social links, and hardware
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

The profile system lives in `supabase/migrations/0002_profile_system.sql` and the Vite frontend under `launcher/src/pages`, `launcher/src/components/profile`, `launcher/src/components/friends`, and `launcher/src/lib/supabase/profile.ts`.

Created data areas:

- `profiles` and `profile_private` split public gamer identity from private personal data.
- `profile_themes`, `user_profile_cosmetics`, `user_badges`, `profile_showcases`, `user_social_links`, and `user_hardware` power profile customization.
- `friendships`, `user_blocks`, and `profile_comments` cover social access, blocking, requests, and guestbook behavior.
- `games`, `user_library`, `user_game_stats`, `achievements`, `user_achievements`, `user_wishlist`, `user_activity`, `user_game_collections`, and `user_game_collection_items` prepare launcher-owned game/profile surfaces.

Supabase Auth owns the user id. The `handle_new_user()` trigger creates the public profile, private profile row, optional settings/hardware rows, and default showcases after a new `auth.users` row is inserted. Usernames come from auth metadata when present, otherwise from `user_` plus the first id characters with a random suffix on conflict.

Visibility is enforced with RLS helper functions:

- `can_view_profile(viewer_id, profile_user_id)`
- `can_view_visibility(viewer_id, owner_id, visibility)`
- `is_friend(user_a, user_b)`
- `is_blocked(user_a, user_b)`

Public profile data can be read only when visibility rules allow it. Private profile data is readable and writable only by the owning user. Showcases, comments, library previews, achievements, wishlist, activity, badges, social links, and hardware all use ownership plus public/friends/private checks.

Important production boundary: profile cosmetics and private profile settings are safe for direct user writes under RLS. Ownership, purchases, library grants, playtime, achievements, badges, XP, and trusted activity must be written by a secure backend or Supabase `service_role` API. The client code intentionally reads these areas and includes TODO comments where production writes must move server-side.

Storage buckets created by the migration:

- `avatars`
- `profile-banners`
- `profile-showcases`
- `screenshots`

The policies allow public reads and restrict authenticated uploads, updates, and deletes to paths prefixed by the user's id, for example `avatars/{user_id}/...`.

Run the profile migration locally:

```bash
supabase db reset
```

Seed local profile themes and sample game data:

```bash
supabase db reset
# seed.sql is loaded by Supabase CLI during reset when configured for local development
```

Frontend pages added for Vite/React Router:

- `/u/:username` public profile
- `/settings/profile` edit profile
- `/settings/profile/customize` theme and showcase customization
- `/settings/privacy` visibility controls
- `/friends` friends, requests, search, and block MVP

The profile UI uses React Router, Supabase Auth context, typed Supabase wrapper functions, Zod validation, and dark launcher-styled components. Empty states are shown when library, achievements, comments, or social data are not available yet.

## Development Notes

- The fixed project design system is documented in `docs/PROJECT_DESIGN.md`. New UI work should follow the Retro Manga Launcher style instead of introducing generic dark dashboard patterns.
- UI state is currently backed by a mix of mock data, local storage, Supabase Auth, and Supabase profile APIs.
- Sensitive writes such as entitlements, purchases, achievements, notifications, and system activity should move behind a trusted backend or Supabase `service_role` API before production.
- The Rust command layer is already split by domain so launcher, download, and system behavior can evolve independently.
- The frontend wrapper in `launcher/src/lib/launcher.ts` centralizes native command error handling.

## Roadmap

- Implement a native folder picker for install locations
- Persist launcher configuration in a local app config file
- Replace launch/download/verify stubs with real native services
- Define local manifests for installed games and patch state
- Connect the store catalog to a real backend source
- Add entitlement, ownership, payment, refund, and CDN integration
- Expand automated testing for Rust commands, Supabase policies, and React flows
- Add packaging and release automation for Windows and Linux

## Contributing

Contributions are welcome while the project is still forming. Keep changes focused, preserve the separation between UI, native commands, and backend access, and run the relevant checks before opening a pull request.

Recommended checks:

```bash
cd launcher
pnpm typecheck
pnpm lint
pnpm build
```

## License

This project is licensed under the Creative Commons Attribution-NonCommercial 4.0 International License (CC BY-NC 4.0).

You are free to:
- **Share** - copy and redistribute the material in any medium or format
- **Adapt** - remix, transform, and build upon the material

Under the following terms:
- **Attribution** - You must give appropriate credit, provide a link to the license, and indicate if changes were made.
- **NonCommercial** - You may not use the material for commercial purposes.

See the [LICENSE](LICENSE) file for the full license text.

For commercial use, please contact the project author for separate licensing arrangements.
