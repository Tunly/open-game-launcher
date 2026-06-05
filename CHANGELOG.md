# Changelog

All notable changes to Open Game Launcher are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/) as far as the AGPL-3.0 release permits.

## [Unreleased]

### Added
- Tooling: `.editorconfig`, `.gitattributes`, Prettier config, Husky pre-commit + lint-staged.
- Docs: `CONTRIBUTING.md`, `CHANGELOG.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`.
- ESLint: `eslint-plugin-jsx-a11y` recommended rules.
- `supabase/functions/.env.example` template for required edge-function secrets.

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
