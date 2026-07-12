# Cross-Platform Launcher UI Automation Design

## Goal

Make every visible Game Options action perform a real, observable operation for each available game copy across Steam, Epic Games, GOG Galaxy, the EA app, Ubisoft Connect, Battle.net, Xbox/Game Pass, manual entries, and OG-managed games.

Third-party clients are controlled with provider- and operating-system-specific UI automation. The launcher must never report completion merely because it opened another client. When a client, operating system, language pack, login state, or provider workflow prevents safe automation, OG-Launcher pauses with an explicit handoff and resumes after the user completes the blocking step.

This is comprehensive best-effort support for current client versions. It is not a permanent guarantee against future third-party UI changes or unavailable provider/OS combinations.

## Supported Scope

### Providers

- Steam
- Epic Games Launcher
- GOG Galaxy
- EA app
- Ubisoft Connect
- Battle.net
- Xbox app / Microsoft Store packages
- Manual library entries
- OG-managed installations

### Operating Systems

- Windows 10 and Windows 11 via Microsoft UI Automation.
- macOS via the Accessibility API for providers that ship a macOS client.
- Linux via AT-SPI for providers that ship a native client or are explicitly configured through a supported compatibility layer.

A provider that does not exist on the current operating system is `not_applicable`, not failed or unsupported globally.

### Languages

Automation must prefer locale-independent identifiers, roles, control types, window classes, process identity, game identifiers, and stable layout relationships. Localized visible text is a fallback only.

If semantic accessibility data is insufficient, OG-Launcher may use local on-device OCR and icon/layout matching. OCR uses the operating system's installed language support where available. Missing language support produces an explicit user handoff rather than an unsafe coordinate click.

## User Experience

Replace the narrow settings popover with a Retro Manga **Game Options dossier**. It keeps the aged paper, halftone texture, thick black borders, hard shadows, sharp corners, `neo-title`, and `neo-copy` styling.

For cross-store groups, the dossier begins with a variant rail such as:

`STEAM · INSTALLED` | `GOG · INSTALLED` | `XBOX · NOT INSTALLED`

Maintenance actions always target the explicitly selected copy. Group actions show their scope:

- **Selected copy:** Support, Verify, Repair, Update, Uninstall/Remove, Client Manager, local artwork.
- **All copies:** Favorite, Hidden state, categories, and collections.

Each action displays one of these states:

- `ready`: OG can start the operation.
- `busy`: automation is running.
- `handoff_required`: a login, CAPTCHA, consent, elevation, or unrecognized UI requires the user.
- `completed`: the result was observed and validated.
- `blocked`: the operation cannot be performed safely in the current state.
- `not_applicable`: the action does not apply to this game copy.
- `failed`: automation ran but did not achieve or verify the requested result.

Provider handoffs use exact labels such as **Repair in Steam**, **Verify in Epic**, **Uninstall with EA app**, or **Remove manual entry**. Generic success messages are prohibited.

## Architecture

### Capability Resolver

A pure capability resolver maps a concrete game variant and runtime context to action capabilities:

```ts
type GameAction =
  | "support"
  | "verify"
  | "repair"
  | "check_update"
  | "update"
  | "uninstall"
  | "remove_from_library"
  | "open_provider";

type ExecutionMode =
  | "local_read_only"
  | "local_managed"
  | "provider_automation"
  | "os_automation"
  | "user_handoff"
  | "not_applicable";

interface GameActionCapability {
  action: GameAction;
  available: boolean;
  completionObservable: boolean;
  destructive: boolean;
  label: string;
  mode: ExecutionMode;
  reason: string;
  requiresConfirmation: boolean;
}
```

The resolver considers provider, operating system, desktop/browser runtime, install status, exact provider identity, local paths, manifest trust, client installation, client version fingerprint, login state, and current game runtime.

### Native Command Contract

The frontend requests one action through a normalized Tauri command:

```ts
interface RunGameActionInput {
  action: GameAction;
  gameId: string;
  expectedProvider: string;
  expectedTitle: string;
  confirmationToken?: string;
}

type GameActionOutcome =
  | "completed"
  | "handoff_required"
  | "not_needed"
  | "blocked"
  | "failed";

interface GameActionResult {
  action: GameAction;
  details: string[];
  gameId: string;
  libraryChanged: boolean;
  message: string;
  outcome: GameActionOutcome;
  provider: string;
  rescanRecommended: boolean;
  sessionId: string;
}
```

The backend reparses the cached game row and validates the expected provider/title before any destructive or external action. A stale or mismatched selection is blocked.

### Automation Engine

The Rust backend owns the automation engine. It is split into:

- `launcher_automation/capabilities`: capability resolution and reason strings.
- `launcher_automation/session`: persisted state machine, timeout handling, cancellation, and resume.
- `launcher_automation/platform/windows`: UI Automation backend.
- `launcher_automation/platform/macos`: Accessibility backend.
- `launcher_automation/platform/linux`: AT-SPI backend.
- `launcher_automation/providers/{steam,epic,gog,ea,ubisoft,battlenet,xbox}`: provider workflow adapters.
- `launcher_automation/vision`: local OCR and icon/layout fallback with confidence thresholds.

Every adapter uses the same state machine:

1. Validate the selected game identity and requested action.
2. Detect or start the official provider client.
3. Wait for a recognized, non-splash client window.
4. Detect login, CAPTCHA, consent, security, elevation, update, or blocking modal states.
5. Navigate to the exact game using provider identity before using title search.
6. Reconfirm the target game from accessible text, provider ID, artwork fingerprint, or local install path.
7. Open the maintenance menu.
8. Select Verify/Repair/Update/Uninstall using semantic selectors, then structured layout, then high-confidence local vision.
9. Pause before the final destructive confirmation unless the original OG confirmation token authorizes that exact game and action.
10. Monitor provider progress and terminal state.
11. Rescan the local library and validate observable postconditions.
12. Return `completed` only when the postcondition is observed.

### Selector Priority

Adapters must select controls in this order:

1. Stable automation ID or provider-specific semantic identifier.
2. Accessible role/control type plus exact game container relationship.
3. Process/window class plus structural relationship and provider identity.
4. Localized text from a versioned synonym catalog.
5. On-device OCR plus icon/layout matching above a provider-specific confidence threshold.

Raw screen coordinates alone are never sufficient for Verify, Repair, Update, or Uninstall. Low-confidence matching pauses the session.

### Version Fingerprints and Circuit Breaker

Each provider adapter records a non-sensitive client fingerprint: executable version, window class, recognized structure version, operating system, and locale. Unknown structures enter `handoff_required` and disable automated destructive clicks for that session.

Repeated selector failures open a circuit breaker for the affected provider fingerprint. Other providers and known fingerprints continue to work.

## Provider Behavior

### OG-managed Games

- Verify uses the signed/trusted OG manifest and hashes.
- Repair uses only the validated local package and trusted manifest.
- Update stays blocked until a signed update package exists.
- Uninstall deletes only paths proven to be inside the OG-managed root, after reparse-point and ownership checks.

### Steam, Epic, GOG, EA, Ubisoft, and Battle.net

- OG starts the client automatically when needed.
- The adapter selects the exact game and performs the provider's own Verify/Repair/Update/Uninstall workflow.
- Client progress is monitored through accessibility state, provider-local manifests/cache changes, and library rescans.
- A provider confirmation dialog may be accepted only for the exact pre-authorized game/action.
- Login, CAPTCHA, account recovery, license agreement, payment, security, and elevation prompts require user handoff.

### Xbox / Game Pass

- Verification and repair use the Xbox/Microsoft-supported app maintenance surface when discoverable.
- Uninstall resolves an exact package family name to one exact package. Wildcards are prohibited.
- The backend waits for the uninstall process and confirms package removal before updating the library.
- Microsoft Store/Xbox login, consent, and elevation prompts require user handoff.

### Manual Entries

- Verify is labeled **Check launch target** and checks the configured file/folder.
- Repair and provider update are `not_applicable`.
- Uninstall is labeled **Remove from Library** and never deletes user files.
- Local artwork, categories, collections, favorite, and hidden state remain available.

## Local and Group Data

Custom artwork remains local-only and is keyed to the selected variant. Banner, Icon, Logo, preview, compression, per-kind reset, and full reset remain available. No hosted/community artwork request is reintroduced.

Favorite, hidden state, categories, and collections remain local and apply to all variants in the group. The UI shows `all`, `some`, or `none` before changing group-wide state.

Manual collections add removal, rename, and delete operations so the collection surface is complete rather than add-only.

## Support Action

The placeholder alert is removed. Each provider adapter supplies a verified official support destination. When a game-specific destination is unavailable, OG opens the provider's official support landing page and passes no private account or machine data in the URL.

## Safety and Privacy

- Never type, read, store, or transmit passwords, authentication codes, payment data, recovery codes, or CAPTCHA answers.
- Never bypass browser, operating-system, anti-cheat, or provider security warnings.
- Never accept new terms, licenses, privacy agreements, or account permissions automatically.
- Never automate purchases, subscriptions, refunds, cloud deletion, or account deletion.
- Never recursively delete provider-managed or manual game paths.
- Destructive actions require confirmation bound to game ID, provider, action, and a short expiry.
- Screenshots and OCR crops remain in memory by default and are never uploaded.
- Logs redact account names, tokens, personal paths, window titles containing user data, and OCR text outside the matched control region.
- Sessions are cancellable from OG-Launcher and stop when target identity becomes ambiguous.

## Error Handling and Recovery

Automation sessions persist non-sensitive state so they can resume after client launch, OG focus changes, or a user handoff. Each session has provider-specific timeouts and emits progress events to the frontend.

Failures include an exact stage, safe reason, and recovery action. The UI offers Retry, Open Client, Continue After Handoff, or Cancel as appropriate. Retry starts from the last safe checkpoint and revalidates the selected game.

## Testing and Evidence

### Unit and Contract Tests

- Table-driven capability resolver tests across provider, OS, locale, runtime, install status, manifest trust, and selected variant.
- Provider adapter tests against versioned accessibility-tree fixtures for every supported client workflow.
- Localized text fixtures for available client locales plus unknown-language fallbacks.
- OCR/icon/layout confidence tests, including ambiguous and low-confidence refusal cases.
- State-machine tests for client startup, splash screens, login, CAPTCHA, consent, elevation, progress, completion, timeout, cancellation, retry, and resume.
- Exact-target and confirmation-token tests for every destructive action.

### Integration Tests

- Mock platform backends exercise Windows UIA, macOS Accessibility, and Linux AT-SPI through one contract suite.
- `GameDetails` tests prove variant selection routes actions to the exact game ID.
- Group-state tests cover `all`, `some`, and `none` plus collection removal/rename/delete.
- Local artwork tests prove selected-variant persistence and the absence of hosted artwork requests.
- Browser mode tests block all native automation with a desktop-required reason.

### Live Compatibility Tests

Live end-to-end checks run only on dedicated test machines/accounts. Each provider/client fingerprint is recorded with OS, locale, client version, action, and observed result. Destructive E2E uses disposable test installations only.

A provider is marked production-ready only after a real Verify/Repair workflow and a safe uninstall or explicit non-destructive limitation have been observed on every OS where that provider client is officially available. Unknown languages remain eligible through semantic selectors; OCR-dependent languages require live evidence before being labeled verified.

## Delivery Sequence

1. Capability resolver, normalized action/result contracts, selected-variant UI, honest status semantics, and removal of placeholder success states.
2. Automation state machine, safe session persistence, cancellation, user handoff, and mock platform backend contract.
3. Windows UI Automation backend plus Steam, Epic, GOG, EA, Ubisoft, Battle.net, and Xbox adapters.
4. macOS Accessibility backend and adapters for officially available macOS clients.
5. Linux AT-SPI backend and adapters for officially available native or explicitly configured compatibility-layer clients.
6. Local OCR/icon/layout fallback, locale evidence catalog, version fingerprints, and circuit breaker.
7. Dedicated live compatibility matrix and rollout gates.

Each sequence stage must leave unsupported or unverified combinations visibly blocked; no stage may fabricate completion while later adapters are unfinished.

## Acceptance Criteria

- Every visible Game Options action has a real capability state and exact scope.
- Every installed provider client can be started automatically.
- Known client fingerprints can navigate to the exact selected game without relying only on title text.
- Known Verify/Repair/Update/Uninstall workflows execute and report `completed` only after observable confirmation.
- Unknown languages or changed client structures pause safely with a resumable handoff.
- Grouped games never receive a destructive action on an implicit primary variant.
- Artwork remains local-only.
- Support uses official destinations.
- Manual games never lose local files through Remove from Library.
- No password, CAPTCHA, payment, security bypass, or unsafe recursive deletion is automated.

