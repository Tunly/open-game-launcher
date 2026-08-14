# Changelog

All notable changes to Open Game Launcher are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/) as far as the AGPL-3.0 release permits.

## [Unreleased]

### Changed

- Store catalog querying is unified behind one module (`catalog-query.ts`
  over a shared `store-query-core.ts`): the twin paginated query builders for
  `store_products` and `store_catalog` were merged, and deduplication now
  spans batches instead of a single page, so overlapping products can no
  longer duplicate across scroll pages.
- Game artwork resolution is centralized in one resolver with a single
  Steamstatic URL builder and a title-to-AppID data map. Custom artwork now
  wins over provider metadata (IGDB no longer overwrites a user choice), and
  the library filter pipeline is a pure derivation again (the hidden IGDB
  fetch effect moved into its own hook).
- Provider identity is centralized in `downloads/provider.rs`: one taxonomy
  for platform labels, external-tracker status, and still-live confirmation.
  Reconcile now keeps Ubisoft and Xbox download entries alive past the
  staleness threshold instead of marking them `stale_cleaned`.
- The download state machine is typed: pause/resume/cancel/commit legality is
  a property of `DownloadStatusKind` instead of string comparisons, and the
  Steam watcher's duplicated tombstone-exit and pause-hold loop primitives
  were extracted into `downloads/worker.rs`.
- Save-copy hardening (containment checks, symlink rejection, post-copy
  SHA-256/size verification) is shared via `save_mirror.rs` between the game
  save-sync and the cross-store copy/rollback flows.
- Provider maintenance automation backends (`session.rs`, `linux.rs`,
  `macos.rs`) are compiled only behind non-default features
  (`automation-session`, `linux-atspi`, `macos-axuielement`). They are
  unreachable from any live code path; the default build drops them and their
  test islands, while `--all-features` keeps them available for future wiring.
- `/activity` is now the friends activity feed; the yearly game-activity recap
  moved to `/activity/recap`.
- First-party Cloud Saves were removed from the active product path, including launcher-managed storage/schema, upload/download/restore/conflict UI, encryption, and Supabase/keychain staging; provider clients own cloud synchronization. The remaining Cross-Store Save Copy proof is local-only.
- The supported overlay is explicitly a separate transparent always-on-top Tauri window. Game-process injection is not used and is not a product target.
- Library and store surfaces now display only scanner, provider, or hosted catalog metadata. Missing size, category, playtime, compatibility, artwork, and catalog fields remain explicitly unavailable instead of being inferred from titles, IDs, directory timestamps, or local demo products.
- Game Options now targets an explicitly selected game copy, distinguishes
  selected-copy maintenance from all-copy metadata actions, revalidates the
  native target, and uses action-bound confirmation for destructive work.
- Normal GameDetails artwork controls are local-only Banner/Icon/Logo actions.
  Auto, community, and hosted artwork controls were removed from the active UI;
  hosted moderation/schema review remains isolated behind a verify route.
- Provider UI automation is optional and fail-closed. The default native build
  does not enable live accessibility automation or report provider completion
  without an observed postcondition.

### Fixed

- Rust checks now pass on Linux out of the box: Windows-only download tests
  (xbox_app, settings, actions) are properly gated on
  `all(windows, feature = "windows-uiautomation")`, so `cargo test`, clippy
  with `-D warnings`, and `cargo fmt --check` run clean in CI and locally.
- The evidence-summary test suites were pinned to the current four-gate
  structure (hosted cron, provider live, hardware/OS, rollout) after the
  store/stripe gate was removed; the full frontend suite (1616 tests) is
  green again, including the panels and settings-page coverage.
- Activity feed reactions and comments now use visibility-aware RLS/RPCs and
  Realtime updates, and Store purchases, friend relationships, achievements,
  play sessions, and status posts can emit the corresponding feed events.
- Cross-platform invite sends now bind feasibility and generated links to the exact user/recipient/mode/game/platform context, synchronously reject duplicate sends, and discard stale async results before token creation or UI publication.
- Removed title-hash library metadata, synthetic cloud status, provider-ID descriptions, legacy directory-mtime activity, fictional store products, seeded launcher notifications, and fallback news articles from normal runtime routes.
- Real sub-minute activity now persists explicit zero-minute provenance so
  `lastPlayed` survives refresh, and the first observed process transition is
  written immediately.
- Xbox package artwork is materialized below the app-owned asset root, linked
  TitleHub images are retained, and Xbox/Game Pass metadata merges by Store ID
  before conservative localized-title fallback.
- PC Game Pass catalog-only titles are included in the Achievement inventory.
- Direct/group chat creation, blocked-DM access, trusted playtime aggregation,
  provider integration changes, social-link replacement, invite transitions, and
  submitted artwork identity are hardened through atomic RPCs/RLS guards.
- The legacy mod-export code block in the export-user-data Edge Function was
  removed (it read tables dropped a day earlier); export tests now pin the
  real manifest contract. A latent zbus error-type mismatch in the
  Linux AT-SPI adapter also surfaced and was fixed once the module compiled.

### Added

- Authenticated Steam account linking via native OpenID callback and a trusted
  hosted Steam achievement relay with attestation-bound ingestion.
- Activity feed events for Store activity, friend relationships, achievements,
  play sessions, and status posts.
- The store shows a clearly labeled local example catalog (four entries) when
  the hosted catalog is empty or unreachable; example entries cannot be
  wishlisted and are never presented as hosted or purchasable products.
- RLS-protected activity reactions and comments with Realtime updates.
- Local completion and external-evidence gates for hosted cron, provider
  integrations, hardware/OS, and rollout tracks.
- Security hardening for URI opening, WebView scope/CSP, selected-copy game
  actions, trusted ingestion, social mutations, and path-contained local file
  operations.

### Removed

- The Mods product surface was removed entirely: Nexus Mods website handoff,
  Steam Workshop integration, mod browsing, managed mods, the mod install
  queue, NXM link handling, client-manager mod roots, and all related UI,
  native commands, types, and documentation.

No supported release has been published yet. Development-only migration notes,
dependency bot history, test inventories, and fixture details belong in commit
history and verification documentation rather than this changelog.
