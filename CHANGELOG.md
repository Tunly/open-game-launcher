# Changelog

All notable changes to Open Game Launcher are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/) as far as the AGPL-3.0 release permits.

## [Unreleased]

### Changed
- **Architectural pivot**: Open Game Launcher is now positioned as a full **Embedded Client-Manager**, not a pure aggregator. Silent-Install (where licensable), Auto-Updates, and Client-Modifications (path overlays, asset caches, mod roots) are in scope. Client launch continues via official URI protocols. See README "Architectural Decisions".

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
