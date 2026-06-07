# Changelog

All notable changes to Open Game Launcher are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/) as far as the AGPL-3.0 release permits.

## [Unreleased]

### Fixed
- `useLibrarySync` test suite: three pre-existing failures aligned with the refactored hook. The hook now uses `compressAndReadImage` (canvas + Image) instead of a raw `FileReader`, and the rejection message is more specific. Tests now mock `image-compress` directly and `waitFor` the first render before asserting. 288/288 tests pass.
- **Security (path-traversal)**: `commands/overlay.rs::delete_screenshot` now canonicalises the path and rejects anything outside the screenshots allow-root (`df11a4b`). The legacy `commands/mod_install.rs::scan_mod_directory` `#[tauri::command]` was removed (no callers; would have been a path-traversal sink).
- **Security (command-injection)**: New `commands/uri_safety` module centralises `validate_slug`, `validate_uri_scheme`, and `open_uri_safely` (`1743813`). The historical `cmd /C start "" <uri>` shell-out — which let any `&` in a URI become a command separator — has been removed from `crossplay.rs`, `system.rs`, and `games/core.rs::open_uri`. Windows now uses `rundll32 url.dll,FileProtocolHandler`, which doesn't parse the URI through a shell. The four `format!`-based URI builders in `commands/downloads/start.rs` (Steam/EA/Ubisoft/Battle.net) validate the slug before any string concatenation.
- **Security (WebView surface)**: `tauri.conf.json`'s `assetProtocol.scope` is no longer `["**"]` (`acb71fc`). It now allowlists `$APPDATA/**`, `$APPLOCALDATA/**`, `$APPCACHE/**`, `$HOME/**`, plus four explicit Steam library-cache paths. The `csp: null` setting has been replaced with a strict policy (`default-src 'self'`, `script-src 'self'`, `connect-src 'self' ipc: https://*.supabase.co`, `frame-src 'none'`, `object-src 'none'`, `form-action 'none'`).

### Changed
- Documentation: ROADMAP/CHANGELOG no longer claim "Phase 1 Security — Completed" or "CI workflow in place". The actual sub-areas closed in this release (path-traversal, command-injection, asset-scope/CSP) and the open sub-areas (Stripe secret handling, missing webhook handler) are tracked in `ROADMAP.md` under "Phase 1 — status".

### Tests
- `commands/overlay::path_traversal_tests` — 6 cases (legitimate path, parent traversal, non-existent file, file outside root, symlink-inside-allowed, exact reject logic).
- `commands::uri_safety::tests` — 8 cases (typical platform IDs, shell-meta rejection, path-separator rejection, oversize rejection, known-scheme acceptance, unknown-scheme rejection).
- Total: 84/84 cargo lib tests pass, 288/288 vitest tests pass.

### Added
- Tooling: `.editorconfig`, `.gitattributes`, Prettier config, Husky pre-commit + lint-staged.
- Docs: `CONTRIBUTING.md`, `CHANGELOG.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`.
- ESLint: `eslint-plugin-jsx-a11y` recommended rules.
- `supabase/functions/.env.example` template for required edge-function secrets.

### Removed
- **Husky pre-commit + lint-staged**: bots disabled per user request (see README "Automation"). Replaced with empty `.husky/pre-commit` stub.
- **Dependabot**: bot disabled (see README "Automation"). All remaining Dependabot branches deleted; in-repo `.github/dependabot.yml` was removed earlier. GitHub-side toggle must be flipped manually in `Settings → Code security and analysis`.

### Fixed
- `useLibrarySync` test suite: three pre-existing failures aligned with the refactored hook. The hook now uses `compressAndReadImage` (canvas + Image) instead of a raw `FileReader`, and the rejection message is more specific. Tests now mock `image-compress` directly and `waitFor` the first render before asserting. 288/288 tests pass.

## Historical / Disabled

This section records bot-driven work that has been turned off. It stays here for context, but **Dependabot is no longer running** on this repository.

### Dependabot merge results (historical)

Merged:
- `dirs` 5.0.1 → 6.0.0 (Cargo).
- `nvml-wrapper` 0.11.x → 0.12.1 (Cargo).
- `globals` 15.14.0 → 17.6.0 (npm).
- `@testing-library/react` 16.x → 16.3.2 (npm).
- `tailwindcss` 3.4.17 → 4.3.0 (npm, major).
- `lint-staged` 15.x → 17.0.7 (npm) — merge commit resolves in favor of the prior removal; lint-staged stays out of `devDependencies`.

Reverted (breaking changes, require code migration):
- `keyring` 3.6.3 → 4.0.1 (Cargo). The 4.x release renames `Entry` and the platform store crates; the existing `commands/*` call sites need migration. See commit `8a6d364`.
- `rand` 0.8.6 → 0.10.1 (Cargo). 0.10 hides `RngCore` / `OsRng` behind a different path; `fill_bytes` now needs the trait in scope. See commit `d5f729c`. Migration completed in `f273ef1` — see "Follow-up" below.
- `eslint-plugin-react-hooks` 5.x → 7.1.1 (npm). 7.x adds a new `react-hooks/set-state-in-effect` rule that fails on 53 existing useEffect → setState sites. Migrating all of them is a separate refactor; for now we keep the 5.x plugin. See commit `12985ec`.

Not merged (would require code migration before being useful):
- `reqwest` 0.12 → 0.13.3 (Cargo). 0.13 removes `.form()` and `.query()` from `RequestBuilder` behind separate feature flags; ~5 call sites in `commands/` need updates. Migration completed in `f26886c` — see "Follow-up" below.

### Follow-up: reqwest 0.12 → 0.13 migration completed
- `Cargo.toml`: enabled reqwest features `form` and `query`; added `Win32_UI_Input` and `Win32_UI_Input_KeyboardAndMouse` to `windows-sys` (the transitive `0.60 → 0.61` bump that reqwest 0.13 pulls in split that module behind its own gate).
- No call-site changes needed: all 8 `.form()` / `.query()` sites in `commands/gog.rs`, `commands/games/detect/steam.rs`, `commands/xbox.rs`, `commands/system.rs` work as-is once the right features are on.
- Merge commit: `f26886c`. Feature gate fix commit: `fb2e9ff`.

### Follow-up: rand 0.8 → 0.10 migration completed
- `Cargo.toml`: `rand = "0.8"` → `rand = "0.10"`.
- `OsRng` is gone in 0.10; replaced with `rand::rngs::SysRng`, which implements `TryRng` (the new fallible trait) instead of `Rng`. The 6 call sites in `commands/cloud_crypto.rs` and `commands/secure_store.rs` now use `SysRng.try_fill_bytes(buf).expect("OS RNG failed")` — explicit error handling is the right call for crypto paths.
- Dropped the `aes_gcm::aead::OsRng` re-export from `cloud_crypto.rs`: that path resolves to the rand 0.8 type (aes-gcm 0.10 transitively depends on rand 0.8), so mixing the two APIs in one function was a footgun. We use `rand::rngs::SysRng` directly now.
- Migration commit: `f273ef1`.

### Changed
- TypeScript: enabled `noImplicitOverride` and `noFallthroughCasesInSwitch`.
- `tsconfig.json` (Phase 2 / Tooling quick-wins).

## [0.1.0] — Initial pre-release

### Added
- Aggregator launcher for Steam, Epic, GOG, EA, Ubisoft, Battle.net, Xbox.
- Profile, library, social, family, mod, overlay, store, and settings pages.
- Cloud saves (Supabase Storage, AES-256-GCM, keychain-anchored keys).
- Achievements sync + per-game progress.
- In-game overlay: friends, chat, achievements, performance, screenshots.
- Tauri shell with Windows / macOS / Linux targets.
