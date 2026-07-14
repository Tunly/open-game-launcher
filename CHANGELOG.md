# Changelog

All notable changes to Open Game Launcher are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/) as far as the AGPL-3.0 release permits.

## [Unreleased]

### Changed

- `/activity` is now the friends activity feed; the yearly game-activity recap
  moved to `/activity/recap`.
- The Mods product surface now supports only Nexus Mods through an official
  no-slug website search handoff and Steam Workshop through provider-client
  handoff and local read-only detection. Registered Nexus SSO/native support is
  optional. Legacy mod.io/CurseForge search, provider-key and
  provider-ID UI, free URL/archive/folder imports, and scraper-based Nexus
  access were removed from the active path.
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

- Activity feed reactions and comments now use visibility-aware RLS/RPCs and
  Realtime updates, and Store purchases, friend relationships, achievements,
  play sessions, and status posts can emit the corresponding feed events.
- Mod provider constraints now accept Nexus and Steam for new rows while
  retaining historical provider values without presenting them as active.
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
  price-drop delivery, social-link replacement, invite transitions, and
  submitted artwork identity are hardened through atomic RPCs/RLS guards.

### Added

- Activity feed events for Store purchases, friend relationships, achievements,
  play sessions, and status posts.
- RLS-protected activity reactions and comments with Realtime updates.
- Official no-slug Nexus website search handoff and Steam Workshop client
  handoff with local read-only subscription detection; registered Nexus
  SSO/native support remains an optional build variant.
- Local completion and external-evidence gates for Store/Stripe, hosted cron,
  provider integrations, hardware/OS, and rollout tracks.
- Security hardening for URI opening, WebView scope/CSP, selected-copy game
  actions, trusted ingestion, social mutations, and path-contained local file
  operations.

No supported release has been published yet. Development-only migration notes,
dependency bot history, test inventories, and fixture details belong in commit
history and verification documentation rather than this changelog.
