# Cross-Platform Launcher UI Automation Implementation Plan

**Design:** `docs/superpowers/specs/2026-07-12-cross-platform-launcher-ui-automation-design.md`

**Goal:** Give every Game Options action an exact game-copy scope, an honest capability state, and a normalized native result before adding provider-specific accessibility automation.

## Audited Status — 2026-07-13

The selected-copy capability model, native target revalidation, action-bound
confirmation, Game Options dossier, session-state contracts, semantic provider
recipes, and feature-gated platform adapter modules exist in the current
working tree. Focused frontend/native action tests pass.

This does not make the full design production-ready. Default Cargo features
enable no live accessibility backend. The runtime bridge currently wires only
the optional Windows UIA backend; macOS Accessibility and Linux AT-SPI modules
are not connected to that runner. Live provider/client-version/locale
postcondition evidence, OCR/vision fallback, compatibility matrix, and rollout
remain open. Unsupported builds fail closed and must not claim completion.

## Stage 1 — Honest Game Action Foundation

### 1. Pure frontend capability model

Files:

- Create `launcher/src/lib/game-actions.ts`
- Create `launcher/src/lib/game-actions.test.ts`

Tasks:

- Define actions, modes, states, capability labels, group scope, and normalized outcomes.
- Resolve capabilities from provider, install state, platform, runtime, and desktop availability.
- Block browser-only native actions instead of fabricating verification failures.
- Distinguish `Remove from Library`, OG-managed uninstall, and provider automation/handoff.
- Add table-driven tests for every provider and manual/unknown entries.

### 2. Native capability and action contract

Files:

- Create `launcher/src-tauri/src/commands/games/actions.rs`
- Modify `launcher/src-tauri/src/commands/games/mod.rs`
- Modify `launcher/src-tauri/src/lib.rs`
- Add matching frontend request/response types and invocation helpers.

Tasks:

- Add `get_game_action_capabilities(game_id)`.
- Add `run_game_action(input)` with expected provider/title revalidation.
- Return `completed` only for observed local outcomes.
- Return `handoff_required`, `blocked`, `not_needed`, or `failed` for all other outcomes.
- Require a game/action-bound confirmation token before destructive execution.
- Preserve legacy commands temporarily behind the normalized contract.

### 3. Game Options dossier

Files:

- Modify `launcher/src/components/library/GameDetails.tsx`
- Modify `launcher/src/components/library/GameDetailPanel.tsx`
- Modify their focused tests.

Tasks:

- Add explicit variant selection for grouped games.
- Route selected-copy actions and artwork to the exact selected variant ID.
- Label all-copy actions and expose mixed group state.
- Make Client Manager reachable for the selected external provider.
- Replace placeholder support alerts with exact capability state.
- Keep the Retro Manga Launcher visual system and existing art classes.

### 4. Stage 1 verification

Run:

- `pnpm test -- src/lib/game-actions.test.ts src/components/library/GameDetails.test.tsx src/components/library/GameDetailPanel.test.tsx`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `cargo fmt --check`
- `cargo check`
- Focused Rust unit tests for the capability resolver and identity checks.

## Stage 2 — Automation Session Engine

Files:

- Create `launcher/src-tauri/src/launcher_automation/mod.rs`
- Create `launcher/src-tauri/src/launcher_automation/capabilities.rs`
- Create `launcher/src-tauri/src/launcher_automation/session.rs`
- Create `launcher/src-tauri/src/launcher_automation/platform/mod.rs`
- Create mock platform backend tests.

Tasks:

- Implement persisted, cancellable sessions and progress events.
- Model validate, start client, wait window, navigate, reconfirm, invoke, monitor, rescan, and validate phases.
- Add handoff checkpoints for login, CAPTCHA, consent, security, elevation, and unknown structure.
- Add provider fingerprint circuit breakers and safe retry/resume.

## Stage 3 — Windows UI Automation

Files:

- Create `launcher/src-tauri/src/launcher_automation/platform/windows.rs`
- Create provider adapters under `launcher/src-tauri/src/launcher_automation/providers/`.

Tasks:

- Use Microsoft UI Automation tree properties and control patterns.
- Prefer stable IDs, roles, relationships, and exact provider identity.
- Refuse elevated, secure-desktop, locked-desktop, or ambiguous target states.
- Implement provider adapters for Steam, Epic, GOG, EA, Ubisoft, Battle.net, and Xbox.
- Add accessibility-tree fixtures and dedicated-machine compatibility evidence.

## Stage 4 — macOS Accessibility

Tasks:

- Add AXUIElement-based tree discovery and actions.
- Detect Accessibility permission and return a guided handoff when missing.
- Implement only providers with an official macOS client.
- Validate each adapter on dedicated test accounts.

## Stage 5 — Linux AT-SPI

Tasks:

- Add AT-SPI tree discovery and action invocation.
- Support native clients and explicitly configured compatibility-layer clients only.
- Detect missing accessibility bus/session support and return a guided handoff.
- Validate each supported client/desktop combination.

## Stage 6 — Local Vision Fallback

Tasks:

- Add on-device OCR and icon/layout matching behind semantic selectors.
- Keep screenshots/crops in memory and redact logs.
- Require provider-specific confidence thresholds and exact-target reconfirmation.
- Refuse destructive actions on ambiguous or low-confidence matches.

## Stage 7 — Compatibility Matrix and Rollout

Tasks:

- Record OS, locale, provider client version, structure fingerprint, action, and observed result.
- Gate adapters per known fingerprint instead of globally enabling unfinished automation.
- Keep unknown fingerprints in resumable handoff mode.
- Never label a provider/OS/language combination verified without live evidence.
