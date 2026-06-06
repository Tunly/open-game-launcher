# Changelog

All notable changes to Open Game Launcher are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/) as far as the AGPL-3.0 release permits.

## [Unreleased]

### Changed
- **Architectural pivot**: Open Game Launcher is now positioned as a full **Embedded Client-Manager**, not a pure aggregator. Silent-Install (where licensable), Auto-Updates, and Client-Modifications (path overlays, asset caches, mod roots) are in scope. Client launch continues via official URI protocols. See README "Architectural Decisions".
- **Dependency updates (Dependabot merge batch)**: merged 10 Dependabot branches. Reverted 3 due to breaking API changes; details below.

### Added
- Tooling: `.editorconfig`, `.gitattributes`, Prettier config, Husky pre-commit + lint-staged.
- Docs: `CONTRIBUTING.md`, `CHANGELOG.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`.
- ESLint: `eslint-plugin-jsx-a11y` recommended rules.
- `supabase/functions/.env.example` template for required edge-function secrets.

### Removed
- **Husky pre-commit + lint-staged**: bots disabled per user request (see README "Automation"). Replaced with empty `.husky/pre-commit` stub.

### Fixed
- `useLibrarySync` test suite: three pre-existing failures aligned with the refactored hook. The hook now uses `compressAndReadImage` (canvas + Image) instead of a raw `FileReader`, and the rejection message is more specific. Tests now mock `image-compress` directly and `waitFor` the first render before asserting. 288/288 tests pass.

### Dependabot merge results

Merged:
- `dirs` 5.0.1 → 6.0.0 (Cargo).
- `nvml-wrapper` 0.11.x → 0.12.1 (Cargo).
- `globals` 15.14.0 → 17.6.0 (npm).
- `@testing-library/react` 16.x → 16.3.2 (npm).
- `tailwindcss` 3.4.17 → 4.3.0 (npm, major).
- `lint-staged` 15.x → 17.0.7 (npm) — merge commit resolves in favor of the prior removal; lint-staged stays out of `devDependencies`.

Reverted (breaking changes, require code migration):
- `keyring` 3.6.3 → 4.0.1 (Cargo). The 4.x release renames `Entry` and the platform store crates; the existing `commands/*` call sites need migration. See commit `8a6d364`.
- `rand` 0.8.6 → 0.10.1 (Cargo). 0.10 hides `RngCore` / `OsRng` behind a different path; `fill_bytes` now needs the trait in scope. See commit `d5f729c`.
- `eslint-plugin-react-hooks` 5.x → 7.1.1 (npm). 7.x adds a new `react-hooks/set-state-in-effect` rule that fails on 53 existing useEffect → setState sites. Migrating all of them is a separate refactor; for now we keep the 5.x plugin. See commit `12985ec`.

Not merged (would require code migration before being useful):
- `reqwest` 0.12 → 0.13.3 (Cargo). 0.13 removes `.form()` and `.query()` from `RequestBuilder` behind separate feature flags; ~5 call sites in `commands/` need updates. Branch is left open in `origin/dependabot/cargo/launcher/src-tauri/reqwest-0.13.3`.

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
