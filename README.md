# Open Game Launcher

Open-source desktop game launcher built with Tauri, React, TypeScript, Rust,
and Supabase. OG Launcher brings local and provider libraries, downloads,
achievements, friends, chat, activity, and launcher settings into one
Retro Manga interface.

## Project Status

The application is under active development. Its main local product paths are
implemented and covered by deterministic checks, but a release is not complete
until all external evidence gates pass.

| Area                   | Current boundary                                                                                                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Library                | Installed-game scan, cache, manual games, collections, metadata, artwork, launch, move, repair, update, and removal flows                                                                                              |
| Providers              | Local/client integration paths for Steam, GOG, Epic, Xbox/Game Pass, Ubisoft, Battle.net, and EA; authenticated Steam linking and hosted achievement relay are implemented, while live provider proof remains external |
| Social                 | Supabase Auth, profiles, friends, chat, invites, presence, authenticated activity, reactions, comments, and privacy/RLS guards                                                                                         |
| Store                  | Materialized ITAD/IGDB catalog with wishlist, reviews, and official-platform redirects; OG commerce is not part of the launcher                                                                                        |
| Desktop                | Tauri shell, native library/download/provider commands, deep links, transparent overlay window, and system telemetry                                                                                                   |
| Evidence-only surfaces | Some unfinished hosted, marketplace, plugin, family, broadcast, and provider states exist only behind explicit `?verify=...` routes                                                                                    |

The four release gates are:

- `hosted-supabase-cron`
- `provider-live-integrations`
- `hardware-os-e2e`
- `rollout-tracks`

Run `pnpm external:evidence:status` for their current state. Evidence capture
requirements live in the
[external completion runbook](./docs/runbooks/external-completion-evidence.md).

## Design

All UI uses the fixed **Retro Manga Launcher** visual system: aged paper,
halftone texture, thick black borders, hard offset shadows, sharp corners,
red/teal accents, dense launcher panels, and header navigation. Keep
`OG-Launcher` as the header brand and reuse the established `neo-*` and artwork
placeholder classes.

See [docs/PROJECT_DESIGN.md](./docs/PROJECT_DESIGN.md) before changing UI.

## Tech Stack

| Area                 | Technology                                                 |
| -------------------- | ---------------------------------------------------------- |
| Desktop              | Tauri 2, Rust 1.95.0 pinned (edition 2021)                 |
| Frontend             | React 19.2, Vite 8.1, TypeScript 6.0, React Router 7       |
| State and validation | Zustand 5, Zod 4                                           |
| Styling              | Tailwind CSS 4.3 and project design tokens                 |
| Backend              | Supabase Auth, Postgres, Storage, Realtime, Edge Functions |
| Tooling              | Node.js >=22.12 <26, pnpm 9.15.4                           |

## Getting Started

Install the [Tauri 2 platform prerequisites](https://v2.tauri.app/start/prerequisites/),
Node.js, pnpm, and the pinned Rust toolchain. A Docker-compatible container
runtime is also required for the local Supabase stack.

```bash
cd launcher
pnpm install
```

Create `launcher/.env.local`:

```dotenv
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_or_publishable_key
VITE_INVITE_FALLBACK_ORIGIN=https://launcher.example
```

`VITE_SUPABASE_PUBLISHABLE_KEY` can replace `VITE_SUPABASE_ANON_KEY`. The
complete browser-side list is maintained in `launcher/.env.example`.

Start the desktop application:

```bash
pnpm tauri dev
```

Or start only the browser frontend:

```bash
pnpm dev
```

### Supabase catalog sync

The application uses a linked Supabase project. Artwork can use the
`rawg-assets` Edge Function, while the Store catalog is synchronized server-side
by `sync-store-catalog`:

```bash
pnpm supabase login
pnpm supabase link --project-ref your_project_ref
pnpm supabase secrets set IGDB_CLIENT_ID=your_twitch_client_id IGDB_CLIENT_SECRET=your_twitch_client_secret ITAD_API_KEY=your_itad_key
pnpm supabase functions deploy rawg-assets
pnpm supabase functions deploy sync-store-catalog
```

`sync-store-catalog` uses ITAD for discovery and prices and IGDB for metadata,
then writes normalized rows to `store_catalog`. Unknown prices stay unavailable.
Store actions open an allowlisted official platform URL. For local Edge Function
serving, put server-only values in `supabase/functions/.env.local`, never in
client bundles. Hosted deployment, scheduler configuration, secrets, and proof
capture are documented in:

- [Hosted deploy gate](./docs/runbooks/hosted-deploy-gate.md)
- [Hosted cron evidence](./docs/runbooks/hosted-cron-evidence.md)
- [External completion evidence](./docs/runbooks/external-completion-evidence.md)

## Common Scripts

Run application commands from `launcher/`:

| Command                        | Purpose                                              |
| ------------------------------ | ---------------------------------------------------- |
| `pnpm dev`                     | Start Vite on `127.0.0.1:1420`                       |
| `pnpm build`                   | Typecheck and build the frontend                     |
| `pnpm tauri dev`               | Start desktop development mode                       |
| `pnpm tauri build -- --locked` | Build desktop bundles with frozen Cargo dependencies |
| `pnpm typecheck`               | Check TypeScript                                     |
| `pnpm lint`                    | Run ESLint with zero warnings                        |
| `pnpm format:check`            | Verify Prettier formatting                           |
| `pnpm test`                    | Run frontend tests                                   |
| `pnpm test:cov`                | Run frontend coverage                                |

Run release, evidence, route, and Supabase wrapper commands from the repository
root. Use `pnpm run` in either directory for the complete generated script
inventory instead of maintaining it here.

## Routes

| Route                         | Purpose                                                                     |
| ----------------------------- | --------------------------------------------------------------------------- |
| `/`                           | Redirect to `/library`                                                      |
| `/library`                    | Game library and selected-copy details                                      |
| `/store`                      | Catalog discovery, filters, wishlist, reviews, and official-store redirects |
| `/community`                  | Authenticated community and friend activity                                 |
| `/news`                       | News feed                                                                   |
| `/downloads`                  | Download queue and local readiness panels                                   |
| `/friends`                    | Friends, requests, search, blocks, and smart join                           |
| `/family`                     | Device-local family preview and invites                                     |
| `/achievements`               | Achievements dashboard with local/provider sync status                      |
| `/activity`                   | Authenticated friends feed, posts, reactions, and comments                  |
| `/activity/recap`             | Local yearly game activity recap                                            |
| `/auth`                       | Sign in and sign up                                                         |
| `/invite/:token`              | Invite web fallback                                                         |
| `/u/:username`                | Public profile                                                              |
| `/settings`                   | Launcher settings                                                           |
| `/settings/profile`           | Edit profile and social-link visibility                                     |
| `/settings/profile/customize` | Theme and showcase customization                                            |
| `/settings/performance`       | Performance history and playtime filters                                    |
| `/settings/privacy`           | Visibility controls                                                         |
| `/overlay`                    | Separate in-game overlay window                                             |
| `/fps-hud`                    | Standalone FPS HUD                                                          |
| `*`                           | Not found                                                                   |

Verification-only route flags are intentionally omitted from this onboarding
list. They are discovered directly from production source; the curated visual
reference set is maintained in [docs/verification](./docs/verification/README.md).

## Architecture

```text
launcher/src/
  app/                 router, providers, and deep-link handlers
  components/          domain and shared UI
  hooks/               library, session, auth, and sync hooks
  lib/                 domain logic, clients, and shared types
  library/providers/   platform library adapters
  pages/               routed application surfaces
  stores/              Zustand stores
launcher/src-tauri/src/
  commands/            native provider, game, download, and system features
  launcher_automation/ fail-closed provider automation contracts (Windows
                       backend default; session/linux/macos backends compile
                       only behind non-default features)
supabase/
  functions/           Edge Functions and shared adapters
  migrations/          schema, RLS, RPC, and removal contracts
scripts/               completion, release, and evidence tooling
```

The frontend talks to native capabilities through the Tauri invoke boundary
and to hosted capabilities through Supabase. Local-first entities are cached in
SQLite and reconciled with their remote representation. Native commands are
registered in `launcher/src-tauri/src/lib.rs`; database and Edge Function
contracts are authoritative in `supabase/`. Those source files, rather than a
duplicated README table, define the exhaustive API surface.

Core decisions:

- AGPL-3.0-only open source.
- Retro Manga Launcher is the fixed visual language.
- Tauri 2 + React + TypeScript + pinned Rust form the desktop stack.
- Supabase provides auth, hosted data, storage, realtime, and Edge Functions;
  SQLite provides offline resilience.
- Supported platform clients remain the authority for licenses, platform cloud
  saves, Workshop subscriptions, and their own launch protocols.
- Provider automation is capability-checked and fail-closed on unsupported
  client builds.
- Steam account linking uses a native OpenID handoff to an authenticated hosted
  function. Trusted Steam achievement relay data is attested server-side before
  it reaches the existing ingestion boundary; live provider E2E remains a
  release-gate requirement.

## Product Boundaries

Local fixtures, static contracts, screenshots, and `?verify=...` routes must not
be presented as production or live-provider completion.

- Provider clients own first-party cloud saves. Cross-store save copy is a
  consent-gated local copy/rollback tool, not hosted cloud storage.
- Native Steam catalog and subscription mutation remain disabled until Valve
  grants the required app context or credentials.
- The overlay is a separate Tauri window. It does not inject into games, bypass
  anti-cheat, or claim real game-process FPS measurement.
- The Store is catalog-and-redirect only. It has no OG cart, checkout, payment,
  order, license, invoice, fulfillment, refund, or developer-publishing flow.
  Historical commerce tables and migrations are compatibility history, not an
  active product surface.
- The store falls back to a clearly labeled local example catalog only when the
  hosted catalog is empty or unreachable. Example entries are not hosted
  products or owned licenses, and actions open a platform-store search link.
- Presence polling, account-deletion jobs, provider integrations, hosted
  invites, and hardware/OS workflows require live external evidence.
- Plugins are staged and audited but not executed. Broadcasting has no live
  OAuth, RTMP, VOD, or audience mutation path.
- Family groups are device-local previews without license borrowing,
  cross-device membership, or seat enforcement.
- Normal Game Details supports selected-copy local artwork. Hosted community
  artwork remains isolated evidence, not a production feature.

## Checks

Run the completion lanes from the repository root:

```bash
pnpm completion:gate:plan
pnpm completion:gate:status
pnpm completion:gate:local
pnpm completion:gate
```

`pnpm completion:gate:local` is the deterministic developer gate. It includes
formatting, type, lint, tests and coverage, frontend build, Rust checks, a
current-platform Tauri debug-bundle smoke, Supabase migration/Edge checks,
route and UI-evidence inventories, and release-contract tests. Fresh command
output is authoritative; mutable test counts are not copied into docs.

`pnpm completion:gate:status` is a redacted, non-mutating prerequisite report.
It does not claim local or external readiness.

`pnpm completion:gate` evaluates the release boundary and is expected to fail until
required external secrets, hosted rows, provider/hardware proof, rollout
artifacts, and evidence fields pass external preflight. Scope override
variables for helper commands do not narrow this release-boundary evaluation.

Useful hosted operator commands are:

```bash
pnpm hosted:deploy-gate:preflight
pnpm hosted:deploy-gate:deploy:dry-run
pnpm hosted:deploy-gate:deploy:live
pnpm hosted:deploy-gate:smoke
pnpm hosted:deploy-gate:all:live
pnpm external:evidence:next
pnpm external:evidence:preflight
```

Coverage runs as a separate threshold-enforcing release-gated job in CI. Draft
GitHub Releases are created only for validated `v*` tags whose commits point at the current
`origin/main` commit and only after the external completion gate passes.

For every UI-facing change:

- follow [docs/PROJECT_DESIGN.md](./docs/PROJECT_DESIGN.md);
- update or replace a relevant canonical screenshot when visual evidence adds
  durable review value;
- capture desktop/mobile separately only where the layout materially differs;
- document the route, state, local/live boundary, and visual verification in
  [docs/verification/screenshot-manifest.json](./docs/verification/screenshot-manifest.json).

Do not treat dry-run packets, local receipts, screenshots, or verification
routes as live deployment evidence.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution workflow and
[SECURITY.md](./SECURITY.md) for vulnerability reporting. CI and the Husky
pre-commit hook enforce the repository checks; Dependabot updates still require
normal review.

## License

AGPL-3.0-only. See [LICENSE](./LICENSE).
