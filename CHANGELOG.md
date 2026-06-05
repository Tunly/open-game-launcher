# Changelog

All notable changes to Open Game Launcher are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/) as far as the AGPL-3.0 release permits.

## [Unreleased]

### Added
- **Controller Support**: Integrated device scanning via `gilrs` Rust crate, custom keyboard/mouse `SendInput` emulation runtime (Windows), and re-mapping layout editor UI (`ControllerLayoutEditor.tsx`).
- **Mod-Management Engine**: Full mod installation pipeline supporting direct URL, local archive, and local folder installations, with active mod list settings and queue management.
- **Playtime Session Tracking & Sync**: Added background session poller, idle detection, manual playtime adjustments, and interactive settings charts utilizing `recharts`.
- **Achievement Auto-Sync**: Automatically sync achievements across multiple launchers.
- **Epic Games Scanner**: Created a specialized parser for Epic Game manifests, filtering Unreal assets.
- **Database Schema Migrations**: Added migrations for controller mapping layouts, rawg asset caching, security definer view adjustments, and database security advisors.
- **Tooling**: Added Dependabot weekly updates config for NPM, Cargo, and GitHub Actions dependencies.
- Tooling: `.editorconfig`, `.gitattributes`, Prettier config, Husky pre-commit + lint-staged.
- Docs: `CONTRIBUTING.md`, `CHANGELOG.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`.
- ESLint: `eslint-plugin-jsx-a11y` recommended rules.
- `supabase/functions/.env.example` template for required edge-function secrets.

### Changed
- **Downloads Module**: Modularized the download system by packaging the legacy runner and introducing fresh Tauri command bindings.
- TypeScript: enabled `noImplicitOverride` and `noFallthroughCasesInSwitch`.
- `tsconfig.json` (Phase 2 / Tooling quick-wins).
- README: Updated feature list and documented unit tests counts (269+ automated tests).

## [0.1.0] — Initial pre-release

### Added
- Aggregator launcher for Steam, Epic, GOG, EA, Ubisoft, Battle.net, Xbox.
- Profile, library, social, family, mod, overlay, store, and settings pages.
- Cloud saves (Supabase Storage, AES-256-GCM, keychain-anchored keys).
- Achievements sync + per-game progress.
- In-game overlay: friends, chat, achievements, performance, screenshots.
- Tauri shell with Windows / macOS / Linux targets.
