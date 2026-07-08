## Completion Sweep

Local completion pass for the current launcher checkout.

### Summary

- Fixed Stripe paid-checkout customer persistence by adding `store_customers` and removing the invalid `profiles.metadata` dependency.
- Configured `stripe-webhook` to accept external Stripe delivery with `verify_jwt = false`.
- Added missing scheduler/admin secrets to `supabase/functions/.env.example`.
- Fixed Overlay cloud screenshot sync to upload through Supabase Storage instead of saving local filesystem paths in metadata.
- Updated Tauri dev/build hooks to use the repo's pinned package manager, `pnpm`.
- Repaired backup external-drive write-proof Rust tests for the current consent and disk-evidence API.
- Wired the Backup/Restore write-proof UI to send the native command's expected mountpoint and explicit sentinel write/read/checksum/delete consent payload.
- Added Backup/Restore eject-safety preflight proof with explicit flush/write/delete-before-eject consent, pending proof-file checks, Settings UI handoff, and no OS-eject success claim.
- Added 28 routed-page smoke cases for Home, Library, AI Hosted Eval verify, Store, Community, Downloads, Remote Downloads, Controllers, Mods, Activity, 404, Auth, Invite Fallback, Developer Portal, Family, News, Achievements, FPS HUD, Friends, Settings, profile/settings subroutes, Profile, Overlay shell, and Broadcasting Audience Status verify routes.
- Added browser-local Family Relay fallback for no-Supabase local previews, with create/join persistence and screenshot evidence for created and joined relay states.
- Fixed local Supabase reset/lint blockers: duplicate screenshot migration version, storage policy comment ownership, ambiguous share-token `UPDATE`, and Remote Companion `digest()` search paths.
- Added LAN Transfer desktop local-path copy commands with explicit consent, empty-target safety, symlink rejection, copied-file SHA-256 verification, and `og-manifest.json` output.
- Updated LAN Transfer readiness/docs to mark native local-path copy, cancellable local copy jobs, manifest verification/readback, consent-gated resume-copy, cancel/cleanup ledgering, consent-gated cleanup-candidate deletion, the consent-gated peer discovery/share preflight command, the native path review console, and local firewall prompt/scope/fallback policy evidence as implemented while keeping live broadcast discovery, relay lookup, trusted pairing exchange, network-share mounting, and firewall rule changes open.
- Hardened Virtual Gamepad readiness with model-level guard copy and no-claim rows for kernel driver install, ViGEm/DS4Windows install, virtual HID emission, raw HID writes, Steam Input, gyro/haptics output, Windows SendInput proof, protected-title validation, anti-cheat compatibility, and launch-routing changes.
- Added Backup/Restore OS eject/unmount command path with final sentinel preflight, explicit consent, shell-free Linux/macOS command selection, Windows `Win32_Volume.Dismount` drive-root backend, and mount-disappearance verification before success.
- Updated Backup/Restore readiness/docs to mark local eject-safety preflight, Windows eject backend, and OS eject/unmount result proof as implemented while keeping Windows/macOS/Linux external-drive backup/restore E2E on real drives open.
- Added Cross-Store Save Sync provider catalog coverage packet, provider cloud transfer contract packet, migration-session rehearsal packet, dry-run audit packet, local provider save-mapping fixtures that review Steam/GOG/Epic external IDs, install paths, relative path mapping rules, save-root shapes, and save-file counts, Cloud Saves panel visibility for those path rules as local suggestions/metadata provenance, provider path-map review matrix, automatic path-map apply request templates with `accepted=false`, post-copy conflict verification packet, consent-gated desktop native copy/rollback proof, credential-free temp sandbox apply/rollback/cleanup proof, local keychain restore contract review, and opt-in redacted Supabase/keychain staging proof command with target snapshots, apply manifest, unchanged-target rollback guard, SHA-256 verification, user-scoped `game-saves` upload/list/download/decrypt/hash/cleanup evidence, and provider-transfer skip, while keeping provider API validation, provider cloud transfer execution, live Supabase/keychain E2E, and real migration sessions blocked.
- Added Plugin-System read-only local discovery plus a signed package staging console, signed local package staging, `/settings?verify=plugin-disabled-registry-audit` native disabled-registry audit evidence, `/settings?verify=plugin-runtime-sandbox-process-boundary` native runtime sandbox dry-run evidence with strict exact-matrix admission and 8 deterministic blocked escape fixtures, native activation-plan review with exact per-plugin consent, disabled-registry re-audit, staged manifest hash evidence, and execution/download/install/network/permission-grant blockers, native signed update-envelope review for `/settings?verify=plugin-update-signing-review` evidence, and `/settings?verify=plugin-marketplace-update-index-trust` local signed marketplace/update-index trust packet evidence with desktop manifest folder scan, browser JSON import, explicit consent-operation review, schema/entrypoint checks, denied unknown permission evidence, theme-hook policy, signature policy, Ed25519 package signature/hash/path/symlink checks, unsigned extra-file and unknown-field rejection, browser display-cache separation, disabled local registry stage, entrypoint denial before code load, blocked path traversal, symlink entrypoints, nested manifest paths, deny-all/network IPC, environment/filesystem attempts, permission escalation, partial/duplicate/unknown escape-matrix rejection, counter mismatch rejection, ready-flag spoof rejection, signed update envelopes, manifest hashes, rollback metadata, signed index envelopes, disabled-registry matching, blocked download/install/auto-update lanes, no permission grants, and `codeExecuted false` while keeping real plugin execution and marketplace paths blocked.
- Added AI recommendation local explanation packet with score signals, local input evidence, privacy notes, skipped model/cloud steps, a resettable browser-local Backlog Preference Tape, a manual browser-local Play Next Queue, a local Consent Audit Packet with redacted prompt envelope/no-write evidence, and `/library?verify=ai-recommendations-hosted-eval-contract` hosted-eval contract lanes for deterministic baseline, prompt regression, quality thresholds, safety fixtures, consent samples, hosted runner boundaries, cloud/profile replay blockers, provider telemetry blockers, and rollout rollback gates while keeping model execution, prompt upload, hosted inference, cloud replay, provider telemetry, hosted eval execution, rollout, and launch automation blocked.
- Added browser-local Retro Manga App Shell skin switching for header, navigation, and main shell plus default-skin reset/invalid-id fallback, hosted built-in shell-skin preference sync through `profiles.app_shell_skin`, and validated custom theme draft sync through `profiles.custom_theme_json`, while keeping live profile-theme catalog persistence and marketplace skins blocked.
- Added a redacted local Broadcasting RTMP dry-run packet plus local provider scope/terms policy evidence and a consent-gated stream-key desktop vault with non-secret local metadata and provider/live readiness wiring while keeping OAuth, RTMP output, live stream-key use, hosted moderation, VOD sync, callbacks, and audience/live-status proof blocked.
- Added local SVG file share/export for `/activity` yearly `OG-Launcher Gaming Year` recap cards with Browser Share file payloads, text fallback, Copy Card, and TXT export while keeping hosted share URLs and real social integrations out of scope.
- Added Controller Layout editor Apply/Clear Runtime controls that drive the existing desktop controller bridge and update the `/controllers` runtime strip without claiming driver install, gyro/haptics output, or anti-cheat compatibility.
- Added `/controllers?verify=controller-capability-evidence` with deterministic inferred gyro/haptics/virtual-pad rows, runtime flag evidence, and explicit no HID/SDL/Steam Input/haptics output or anti-cheat compatibility claims.
- Added `/controllers?verify=controller-per-game-safety-raw-input` with a deterministic per-game Raw-Input Safety Policy proof for protected-title layout scope, raw-input fallback, blocked virtual/motion lanes, and explicit no injection/driver/HID/Steam Input/haptics/anti-cheat/automatic launch-routing claims.
- Added Controller Community Layout review staging with a browser-local vote fallback plus Supabase approved-feed staging, one-user vote persistence, ranked feed order, hosted import/download counters, hosted report actions, report-backed moderation, service-role review/audit RPCs, launcher helper fallbacks, profile consent/rollback review evidence, and `/controllers?verify=hosted-controller-layouts` 8/8 staged review gates with separate blocked rollout lanes for production/community rollout, marketplace publish, and live profile sync.
- Added Hosted Community Artwork v1 with Supabase schema/RLS, `game-artwork` storage, approved-feed listing, authenticated vote persistence, report-backed moderation queue, ranking sync, launcher helper fallback, public upload UI, pending-submission cards, private moderator allowlist, service-role scan/review RPCs, trusted moderation Edge Function with HTTP handler coverage, local moderator console preview, deterministic content-scan evidence, provider artwork source-policy evidence for Steam/RAWG import paths, a local Steam/RAWG/Epic caps proof matrix with Epic review-only guardrails, rawg-assets HTTP handler coverage, approval gating, audit ledger evidence, and `/library?verify=hosted-community-artwork` readiness UI while keeping community-wide rollout and provider API approval blocked; ML image moderation and copyright fingerprinting are not claimed.
- Added default `/community` Public Screenshot Feed hosted-row loading when Supabase is configured, with no-Supabase/failed-read/empty-row local fixture fallback; `/community?verify=public-screenshot-feed` keeps the Supabase public-read staging for visible screenshot metadata, scoped signed media review, screenshot like counts, authenticated Heart-button like actions, deterministic moderation-before-ranking fallback cards, private/pending/reported/fixture-card lockouts, `screenshot_reports`, `screenshot_moderation_audit`, service-role review, approved-only storage/like/read policies, and an approved-only ranked-feed RPC while hosted moderation execution, production ranking rollout, and community-wide rollout stay blocked.
- Added `/invite/:token` Hosted Token Rehearsal for Custom-Link Invites with create-token, resolve-token, receiver-auth, redeem-token, and replay-guard evidence while keeping raw token storage, anonymous invite-row reads, hosted-web success, replay acceptance, and external hosted E2E out of scope.
- Added the Custom-Link Invite hosted replay/origin proof contract: `prove_share_token_replay_denial`, authenticated `invite-hosted-proof` Edge Function with exact HTTPS-Origin allowlist, extracted HTTP handler coverage for origin/auth/body/proof/replay guards, sanitized token-hint-only proof packets, and a Replay Origin UI console on `/invite/:token`.
- Added `/community?verify=broadcasting-chat-moderation-shadow` with deterministic local chat fixtures, redacted link/secret previews, and preview-only queue actions while keeping provider chat reads, Twitch/YouTube OAuth, hosted enforcement, Supabase moderation logs, RTMP/live output, VOD sync, and audience/live-status proof blocked.
- Added `/community?verify=broadcasting-vod-archive-policy` with local VOD retention, visibility, delete-coverage, Supabase-archive, signed-URL, provider-import, and sync-job policy gates while keeping OAuth, RTMP/live output, hosted moderation, VOD provider sync, Supabase archive writes, signed URL requests, public storage serving, provider imports/deletes, and audience/live-status proof blocked.
- Added `/community?verify=broadcasting-provider-oauth-contract` with local PKCE, state, redirect URI, scope, callback error, token storage boundary, and secret-redaction fixtures while keeping provider authorization redirects, OAuth token exchange, provider token storage, hosted callback endpoints, provider chat reads, VOD sync, RTMP/live output, and audience/live-status proof blocked.
- Added `/community?verify=broadcasting-provider-callback-contract` with local event-schema, signature-header, idempotency, replay-duplicate, and redacted audit-row fixtures while keeping hosted endpoints, callback runners, provider delivery proof, Supabase callback row mutation, replay runners, VOD sync jobs, and audience/live-status proof blocked.
- Added `/community?verify=broadcasting-live-session-rehearsal` with local preflight, desktop vault, provider OAuth, RTMP, chat, hosted moderation, VOD, callback, audience-status, and rollback sequence review while keeping OAuth launch, RTMP sockets, stream-key live use, provider chat reads, hosted moderation, VOD sync, callback replay, and audience/live-status updates blocked.
- Added `/community?verify=broadcasting-audience-status-contract` with local audience/live-status contract lanes for preview labels, stale fallback, rollback clear order, provider state events, audience counts, chat presence, public status writes, and Supabase audience row blockers while keeping provider reads, count polling, callback replay, public mutation, RTMP output, and VOD sync blocked.
- Added `/achievements?verify=achievement-cache-readiness` with local cache-folder, sidecar, parser, and provider-status fixtures while skipping hosted hydration and keeping provider sync, Supabase writes, OAuth/token exchange, live unlock imports, remote cache jobs, provider credentials, and official unlock proof blocked.
- Added `/achievements?verify=achievement-hosted-hydration-contract` with a local no-write hosted hydration contract for authenticated Supabase read shape, provider-key filtering, catalog-game resolution, definition/unlock merge, and fallback-to-local behavior while keeping live hosted staging, Supabase writes, provider sync, OAuth/token exchange, remote cache jobs, trusted ingestion calls, live unlock import, and official unlock proof blocked.
- Added `/settings/performance?verify=overlay-e2e-readiness` session-flush proof with a shared 300-sample buffer cap, `og-launcher:performance-session-flush` close/toggle handoff, promise settlement coverage, attached anti-cheat fallback evidence, and explicit no live external overlay, no Supabase write/read, no long-running native session, or anti-cheat compatibility claims.
- Added `/settings/performance?verify=overlay-fullscreen-anti-cheat-readiness` with local fullscreen-mode, overlay-settings, and anti-cheat fallback fixtures while keeping fullscreen injection, anti-cheat bypass, kernel/driver install, protected-process attach, game capture proof, compatibility certification, live title validation, external overlay window proof, E2E success, and real game process access blocked.
- Added `/settings?verify=client-manager-mount-apply-contract` with local Client Manager mount/apply contract fixtures, local auto-apply capability checks for runtime presence/install target/free disk/admin review, a read-only native capability preview command, a Steam/GOG/Epic/EA/Ubisoft/Battle.net/Xbox Provider Policy Matrix with no provider-approved launcher apply and terms-not-approved evidence, plus `/settings?verify=client-manager-mount-apply-sandbox-proof` for local sandbox copy, manifest readback, hash verification, and rollback proof while keeping provider-approved apply mechanisms, real OS mount creation, symlink/junction creation, admin elevation, driver/kernel install, destructive client writes, provider terms approval, live provider rollback/unmount, and live client mutation proof blocked.
- Added `/settings?verify=one-click-setup-rollback-audit-contract` with a local no-write One-Click Setup rollback/audit packet bound to the actual setup-step ledger, undo/cleanup order, partial-failure map, redacted audit envelope, empty writes/deletes/live-calls ledgers, unknown-step blocking, and UI-visible failure drill while keeping hosted auth E2E, provider OAuth/token replay, provider-approved silent install, consent/terms approval, production hosted deployment, local file writes/deletes, Supabase audit writes, provider-client mutation, token/keychain replay, setup execution, and real rollback/audit proof blocked.
- Added `/library?verify=igdb-cross-play-readiness` staged import preview evidence with review-only `game_cross_play` rows, a `games.external_ids` patch envelope, skipped-candidate reasons, duplicate/conflicting target-key review for external-id sources and platform rows, and no IGDB API, Supabase write, provider telemetry, hosted sync, or live verification claims.
- Added `/downloads?verify=mobile-push-dry-run` local Mobile App push packet evidence with target/platform, payload preview, consent, token-safety, `Writes: none`, and no push-send, APNs/FCM, Supabase-write, device-token-write, or background-mobile-download claims.
- Added `/downloads?verify=mobile-session-library-chat-contract` local Mobile session/library/chat no-write contract evidence with session envelope, scoped library projection, chat read/send queue policy, token redaction, and no live mobile session, native app, Supabase verify-route write, `game_sessions` mutation, chat insert/realtime subscription, raw token rendering, APNs/FCM send, app-store distribution, or hosted production E2E claims.
- Added `/downloads?verify=mobile-push-registration-contract` Mobile App token-hash registration Edge Function contract evidence with consent, owner scope, unregister, raw-token rejection, service-role-only writes, adapter query-shape coverage, Supabase RLS/account-export coverage, and no verify-route write, APNs/FCM send, or raw-token storage claims.
- Added `/downloads?verify=smart-install-provider-telemetry` Smart Install provider telemetry dry-run contract evidence with redacted Steam/GOG/LAN signal fixtures, `Writes: none`, `Live Calls: none`, TTL/rate-limit/cache review steps, blocked secret/account/package fields, and warning-only ranking input review while live provider telemetry, entitlement, mirror measurement, ranking sync, and auto-purchase/download stay blocked.
- Added a mod.io/CurseForge provider staging probe path that forces one-result requests, redacts mod.io query API keys and CurseForge `x-api-key` placement, returns only counts/guards rather than direct-download URLs, and shows a redacted request packet, local terms/rate-limit/retry/redaction policy evidence, plus local response-shape review fixtures on `/mods?verify=provider-api-key-staging` without invoking native search or storing secrets in verify mode.
- Added a Deno-tested Store license signing contract with explicit `OGL-STAGING-UNSIGNED-*` fallback labels for missing signing key/device ID, plus duplicate-key license conflict recovery that only succeeds after all expected active licenses exist.
- Hardened Store/Stripe staging with the current Stripe API-version pin, checkout-attempt UUID dedupe, Stripe idempotency keys, extracted no-live-secret Stripe Checkout HTTP handler plus adapter query-shape/session projection coverage, `store_customers` customer bootstrap coverage, service-role-only webhook replay ledger with stale retry leasing, adapter-level event claim/finalizer coverage, order/license fulfillment, invoice persistence, refund ledger/status handling, shared Store Stripe invoice/refund boundary coverage, and no-live-secret Deno contracts for the checkout/webhook wiring.
- Added `/store?verify=stripe-live-staging-contract` local Stripe live-staging contract evidence for `2026-05-27.dahlia`, signature-first webhook parsing, Tax/Invoice Dashboard checklist, refund replay ledger boundaries, no-write fixture orders, and no raw Stripe key/webhook secret/Dashboard success/refund replay success/live delivery claim.
- Hardened Store order support with no-live-secret contracts for HTTP CORS/auth/order-ownership/invoice/refund/error guards, adapter-level order/refund/invoice query shapes, refund staging/reject mutations, refund/invoice request parsing, refund reason mapping, and Stripe refund idempotency payloads.
- Hardened `notify-price-drop` with extracted no-live-secret HTTP handler and adapter coverage for CORS/method/auth/dry-run/live-write/error guards, exact cron secret headers, lazy secret reads, dry-run parsing, UUID filters, batch limit clamping, alert query shapes, notification insert/alert update mutations, sanitized `store_price_drop_notification_runs` aggregate evidence inserts, and `/store?verify=price-drop-scheduled-evidence` Hosted Scheduler Proof UI with no-write fixture rows and no hosted cron success claim without a trusted scheduled row.
- Hardened Hosted Community Artwork moderation with an extracted no-live-secret adapter boundary for caller auth, private moderator allowlist reads, artwork scan row query shape, generic moderation RPC delegation, scan RPC payloads, and Supabase error mapping.
- Pinned the profile Supabase client to read-only progression surfaces and removed the stale direct-write TODO now that trusted ingestion owns badge/XP/playtime/achievement write paths.
- Hardened trusted achievement ingestion so `providerConfidence: "official"` is accepted only for official providers, preventing local/unofficial providers from claiming full XP confidence.
- Hardened trusted playtime/achievement ingestion with extracted no-live-secret adapter boundaries for playtime auth/catalog/session-conflict/aggregate/session mutations and achievement auth/catalog/definition-upsert/trusted-unlock RPC payloads.
- Hardened Presence polling with an extracted no-live-provider HTTP handler and adapter coverage for CORS/auth/cache-skip/force/live-write/activity/evidence/error guards, platform account and existing-presence query shapes, cache update payloads, presence/activity/evidence mutations, Steam provider-client HTTP behavior, and bridge adapter rate-limit/error mapping; request parsing also keeps strings like `"false"`, `"0"`, and `"off"` from accidentally enabling `dryRun`/`force` cron paths, with Settings separating trusted dry-run review packets from hosted cron/writeback proof.
- Added a local Presence Provider Bridge Contract Matrix and Deno provider-client coverage for Epic/GOG/EA/Xbox/Battle.net/Ubisoft bridge HTTP mapping, token redaction, provider-error, missing-provider, and rate-limit paths while keeping live provider coverage and writeback unclaimed.
- Hardened Remote Companion cloud job status transitions so only reviewed accepted/started/terminal moves are allowed, terminal jobs are immutable, and the relay Edge Function has no-secret Deno contracts for method/auth/body/device/job/error guards.
- Hardened Remote Companion poll status rendering with a local redaction guard for URL/token-shaped poll metadata and thrown claim errors.
- Hardened Friends dedup merge-group acceptance so target links with an existing `merge_group_id` keep that group, the final accepted status update remains user-scoped, `og` platform rows pass hosted migration checks, and auto-match propagation stays owner-scoped by direct owner/platform/platform-friend matches.
- Added the Remote Hosted Relay normal-mode env gate so `/downloads/remote` can enqueue hosted jobs only when `VITE_OG_REMOTE_HOSTED_RELAY_ENABLED` is true-like, while `verify=remote-hosted-contract-ready` stays deterministic for readiness verification without bypassing enqueue.
- Hardened Remote Hosted Relay store jobs so the Edge relay parser and direct `enqueue_remote_install_job` RPC both require `store-build-ticket` package refs with `downloadTicketRequired`, and reject Build-ID jobs that omit a Store Product ID.
- Added DSGVO export/deletion contracts for the user-data export HTTP handler, shared privacy auth/admin runtime, adapter auth/read query shapes, empty dependent-read skips, missing-table warning mapping, newer user-scoped export data, account-deletion request/cancel HTTP handler guards, request adapter auth/active lookup/create mutation/`23505` preservation, cancel adapter auth/pending lookup/pending-only mutation/error propagation, active pending/processing uniqueness, process-account-deletions HTTP CORS/method/secret/dry-run/live delete/audit/evidence guards, processor claim/audit mutations, processor adapter due-request query shape, Auth delete delegation, evidence insert, recursive storage cleanup, missing-bucket handling, sanitized `account_deletion_processor_runs` evidence, secret-gated deletion processor dry-runs, limit clamping, non-destructive dry-run output, `game-artwork` storage cleanup coverage, a no-write Hosted Cron Staging Proof fixture, and Deploy Gate validation for `failedCount === 0`/`evidenceRecorded` while keeping real hosted cron execution blocked.
- Added `/settings?verify=hosted-cron-evidence-summary` with a local no-write scheduler evidence summary for `notify-price-drop`, `process-account-deletions`, and `poll-platform-presence`, keeping dry-run, stale, missing, placeholder-env, unsafe REST target, unsafe run-id, missing/invalid/semantically impossible aggregate-count, non-zero `failed_count`, secret-bearing, verify-route-write, Stripe webhook/dashboard, and production deployment claims blocked until fresh scheduled non-dry-run evidence rows exist.
- Added `/settings?verify=external-completion-evidence-summary` with a local no-write external evidence map for Store/Stripe, hosted cron, provider-live, hardware/OS, and rollout lanes, keeping env names, artifact paths, required proof checklist labels, and blocked claims visible without rendering secrets or claiming external completion.
- Added Public Profile Privacy Guard evidence on `/u/localprivacy?verify=profile-privacy-guard`, client redaction for public viewers, guarded showcase placeholders, and a Deno-pinned RLS migration contract for parent profile plus lane visibility.
- Added per-link Social Link Visibility for profile links, including editor visibility controls, `/settings/profile?verify=social-link-visibility-editor` local draft/payload proof, public-viewer filtering, and a Deno-pinned RLS migration contract for parent profile plus link visibility.
- Added production-strict trusted playtime/achievement ingestion mode that blocks direct authenticated playtime/session fallback writes and fails loud when trusted ingestion is unavailable in strict mode.
- Added focused strict-mode env parser coverage for trusted ingestion production/local defaults, accepted true/false aliases, and invalid-value fallback to `MODE`.
- Added a trusted-ingestion migration contract test that pins achievement/XP write revokes, JWT-protected ingestion functions, and the remaining staged DB direct-write exceptions for playtime, sessions, and narrow non-achievement activity posts.
- Added Cloud Save Supabase helper coverage for save-set/file mapping, CRUD query shapes, file metadata upsert/delete query shapes, usage aggregation, missing-schema fallback, unauthenticated usage fallback, and missing config propagation.
- Hardened native Cloud Save object path contracts with labeled save-root prefixes, non-empty single-file keys, exact encrypted sidecar suffix handling, and browser/non-Tauri guards for upload/download/restore/conflict wrappers.
- Added a local Cross-Store Save provider save-mapping fixture layer that reviews Steam/GOG/Epic external IDs, install paths, relative path mapping rules, save-root shapes, and save-file counts, surfaces those rules in the Cloud Saves panel as local suggestions/metadata provenance, and adds target collision blockers in the planner, native duplicate-target rejection, rollback manifest path/name guards, and consent-gated automatic path-map apply request templates with `accepted=false`, without provider API validation, provider cloud transfer, live Supabase/keychain E2E, or real migration execution.
- Added browser-local Backlog Learning feedback and a manual Play Next Queue to `/library?verify=backlog-priority`, with `Boost Pick`, `Skip Pick`, `Finished`, `Clear Learn`, `Queue Pick`, `Remove`, and `Clear Queue` controls that tune local mood/session/social weights and queue local picks without hosted model, cloud profile, provider telemetry, launch automation, or account sync.
- Wired the Library footer `Friends & Chat +` control to `/friends?tab=chat`.
- Added a browser-local `/community` Create Post composer that prepends local feed cards and stores only capped localStorage entries without hosted publishing, Supabase writes, provider sync, or moderation execution.
- Added `/community?verify=community-create-post` as deterministic in-memory Create Post evidence with desktop/mobile screenshots and no browser-storage write.
- Refreshed stale test-count documentation so fresh command output remains the
  source of truth instead of fixed frontend pass counts.
- Updated CI to include trusted playtime/achievement Edge Function contract tests and the Supabase DB lint wrapper test, and to block `v*` draft release packaging behind the `hosted-production` `pnpm completion:gate:external` release-boundary job, with release-tag version validation, `main` reachability validation, and a post-matrix draft-release job.
- Added the manual hosted Supabase deploy gate behind `workflow_dispatch` + GitHub Environments, with Function deploy planning, placeholder hosted deploy gate environment value and unsafe/non-Supabase hosted Functions base URL rejection before smoke fetch, redacted smoke failure summaries, safe evidence `runId` validation for dry-run smokes, non-mutating dry-run smokes, OPTIONS sanity for every deployed Edge Function, normal PR/push validation for the deploy-gate script, drift-free Edge Function test discovery, and scheduler handoff documentation with per-function bearer secret mapping.
- Hardened release packaging with a macOS `.icns` icon, Rust format gating before release/deploy jobs, Linux AppImage `APPIMAGE_EXTRACT_AND_RUN`/`NO_STRIP` CI environment for modern `.relr.dyn` system libraries, and package-file-only upload/release globs for nested Tauri bundle outputs.

### Verification

- Screenshot: `docs/verification/screenshots/downloads-remote-companion-poll-redaction-local.png`
- Screenshot: `docs/verification/screenshots/downloads-mobile-push-registration-contract-mobile.png`
- Screenshot: `docs/verification/screenshots/downloads-mobile-session-library-chat-contract-local.png`
- Screenshot: `docs/verification/screenshots/downloads-mobile-session-library-chat-contract-mobile.png`
- Screenshot: `docs/verification/screenshots/store-stripe-staging-tax-invoice.png`
- Screenshot: `docs/verification/screenshots/store-stripe-live-staging-contract.png`
- Screenshot: `docs/verification/screenshots/store-price-drop-hosted-scheduler-proof.png`
- Screenshot: `docs/verification/screenshots/store-cart-drawer-retro-manga-desktop.png`
- Screenshot: `docs/verification/screenshots/store-cart-checkout-retro-manga-desktop.png`
- Screenshot: `docs/verification/screenshots/store-cart-checkout-retro-manga-mobile.png`
- Screenshot: `docs/verification/screenshots/auth-signup-username-retro-manga-desktop.png`
- Screenshot: `docs/verification/screenshots/auth-signup-username-retro-manga-mobile.png`
- Screenshot: `docs/verification/screenshots/library-default-retro-manga-desktop.png`
- Screenshot: `docs/verification/screenshots/library-default-retro-manga-mobile.png`
- Screenshot: `docs/verification/screenshots/library-add-game-dialog-retro-manga-backdrop.png`
- Screenshot: `docs/verification/screenshots/mods-provider-keys-retro-manga-backdrop.png`
- Screenshot: `docs/verification/screenshots/library-hosted-community-artwork-readiness-local.png`
- Screenshot: `docs/verification/screenshots/settings-profile-app-wide-theme-readiness-local.png`
- Screenshot: `docs/verification/screenshots/privacy-deletion-processor-cron-dry-run-packet.png`
- Screenshot: `docs/verification/screenshots/privacy-deletion-processor-hosted-cron-staging.png`
- Screenshot: `docs/verification/screenshots/privacy-account-deletion-local-processing.png`
- Screenshot: `docs/verification/screenshots/controllers-hosted-controller-layouts-readiness-local.png`
- Screenshot: `docs/verification/screenshots/controllers-per-game-safety-raw-input-policy-local.png`
- Screenshot: `docs/verification/screenshots/controllers-per-game-safety-raw-input-policy-mobile.png`
- Screenshot: `docs/verification/screenshots/achievements-hosted-hydration-contract-local.png`
- Screenshot: `docs/verification/screenshots/achievements-hosted-hydration-contract-mobile.png`
- Screenshot: `docs/verification/screenshots/community-broadcasting-live-session-rehearsal-mobile.png`
- Screenshot: `docs/verification/screenshots/community-broadcasting-audience-status-contract-local.png`
- Screenshot: `docs/verification/screenshots/community-broadcasting-audience-status-contract-mobile.png`
- Screenshot: `docs/verification/screenshots/settings-performance-overlay-e2e-readiness-local.png`
- Screenshot: `docs/verification/screenshots/friends-dedup-merge-group-contract.png`
- Screenshot: `docs/verification/screenshots/friends-dedup-merge-group-contract-mobile.png`
- Screenshot: `docs/verification/screenshots/downloads-smart-install-provider-telemetry-dry-run-contract-local.png`
- Screenshot: `docs/verification/screenshots/settings-one-click-setup-rollback-audit-contract-local.png`
- Screenshot: `docs/verification/screenshots/settings-one-click-setup-rollback-audit-contract-mobile.png`
- Screenshot: `docs/verification/screenshots/settings-hosted-cron-evidence-summary-local.png`
- Screenshot: `docs/verification/screenshots/settings-hosted-cron-evidence-summary-mobile.png`
- Screenshot: `docs/verification/screenshots/settings-external-completion-evidence-summary-local.png`
- Screenshot: `docs/verification/screenshots/settings-external-completion-evidence-summary-mobile.png`
- Screenshot: `docs/verification/screenshots/library-ai-recommendations-hosted-eval-contract-local.png`
- Screenshot: `docs/verification/screenshots/library-ai-recommendations-hosted-eval-contract-mobile.png`
- Screenshot: `docs/verification/screenshots/friends-roster-action-handoff-local.png`
- Screenshot: `docs/verification/screenshots/friends-roster-action-handoff-local-mobile.png`
- Added `docs/verification/local-completion-audit.md` to pin the local completion boundary: local automated checks plus screenshot/DOM/static-class evidence are verified locally, while the five external evidence gates stay open in `FEATURE_PLAN.md`: `store-stripe-live` (two artifacts), `hosted-supabase-cron`, `provider-live-integrations`, `hardware-os-e2e`, and `rollout-tracks`; fresh command output is the source of truth for mutable counts.
- Added Friends roster handoff actions so local and configured friend cards expose Chat, Smart Join, and Invite routes through the existing launcher social tabs.
- Added native Rust contract coverage for external launcher dispatch URI validation/opener injection, controller runtime keyboard/mouse binding input/output filtering, and Cross-Store Save Sync nested multi-file apply/rollback plus symlink-ancestor/manifest-symlink apply/rollback preflight without launching provider clients, emitting virtual OS input, copying through linked save parents, writing through linked manifest paths, partially applying later-invalid copies, or partially restoring changed targets.
- Added `pnpm completion:gate:plan`, `pnpm completion:gate:status`, `pnpm completion:gate:local`, `pnpm completion:gate:external`, and `pnpm completion:gate` so the full local-plus-external completion boundary is a single discoverable gate with a redacted no-run prerequisite/status inventory, local `git diff --check HEAD`, Supabase DB lint wrapper tests, Supabase Edge Function Deno checking, hosted deploy preflight plus non-mutating hosted deploy smoke, a `v*` tag release-boundary CI job that validates `main` reachability and ignores scoped evidence env vars, and failure until hosted and external proof artifacts pass preflight.
- Re-enabled local developer automation with weekly Dependabot coverage for GitHub Actions, launcher npm, and Tauri Cargo dependencies plus a Husky pre-commit hook that runs the launcher `lint-staged` guard through the existing `format:check` and `lint` commands.
- Pinned reproducible tooling with Node.js `>=22.12 <26` in repo manifests, GitHub Actions reading `.node-version` (`22.12.0`), GitHub Actions refs pinned to verified SHAs on fixed runner labels, Rust `1.95.0` in `rust-toolchain.toml` and CI action refs, Deno CI/fallback `2.8.3`, Supabase CLI `2.104.0` in CI, hosted deploy Supabase calls through the launcher-pinned CLI, and local DB lint through a redacting start/lint/stop wrapper.
- Added `docs/runbooks/external-completion-evidence.md`, `scripts/external-evidence-check.mjs`, `docs/runbooks/hosted-cron-evidence.md`, and `scripts/hosted-cron-evidence.mjs` so the remaining external gates have no-write/check-only proof collection paths instead of ambiguous completion claims; `external:evidence:template` prints artifact templates, `external:evidence:runbook` prints a sequenced redacted operator capture runbook, `external:evidence:worklist` prints a per-artifact redacted fill list with complete detail field names and no proof checkboxes or writes, hosted cron packets print concrete matching external preflight handoffs, and `external:evidence:preflight` checks non-placeholder required environment values with redacted reason codes, artifact presence, per-artifact proof coverage, checked `- [x]` proof rows outside Markdown code fences, HTML comments, and indented code blocks, one lane-scoped hosted cron detail block per scheduler proof, non-empty, specific, non-placeholder captured evidence detail fields outside inactive Markdown, fresh UTC ISO-8601 `Captured at` timestamps, and secret-shaped Stripe, bearer/JWT, provider API key/token, Supabase service-role/auth/access token, hosted scheduler secret, mobile push/provider secret, private key, device token, and unredacted fixture blockers so placeholder/copied env values, unchecked templates, fenced/commented/indented examples, missing per-artifact proof coverage, placeholder/weak details, local `docs/verification/screenshots/*` locators, placeholder/local/file locator URLs, generic locator values, stale/future or non-ISO capture times, and checked rows without run details stay blocked; rollout handoffs include hosted deploy packet/plan commands without claiming production evidence.
- Playwright screenshot sweep: Store orders, Store Cart drawer/checkout desktop/mobile, Auth signup username desktop/mobile, default Library desktop/mobile, Remote Companion redaction, mobile push registration, Hosted Community Artwork, app-wide theme readiness, privacy deletion cron dry-run, hosted controller layouts, and mobile broadcast live-session rehearsal all loaded without 404, kept `OG-Launcher` in DOM, and reported no horizontal overflow.
- Library mobile header DOM check: viewport `390`, document `scrollWidth` `390`, all primary header nav buttons visible without clipped bounds.
- Modal backdrop check: Store Cart drawer, Library Add Game, Mods Provider Keys, Artwork Preview, and Provider Picker use ink/halftone backdrops in routed/component tests; the auth signup username screenshots cover the `/auth` signup username form, while `UsernamePromptModal` and the currently non-route-mounted Playtime editor overlays have implementation/static class evidence keeping them free of `backdrop-blur` and legacy `bg-black/45`/`bg-black/50` overlay classes.
- Store/Auth DOM checks: Store cart/checkout kept `scrollWidth` equal to viewport at `1440` and `390`, Auth signup username kept all form controls unclipped at `1440` and `390`, and both routes retained the OG-Launcher header brand.
- Remote Companion redaction DOM check: no JWT prefix, bearer token, signed URL query, raw companion secret, or signed HTTP path patterns found.

```bash
cd launcher
env -u NODE_ENV pnpm install --frozen-lockfile # passed
pnpm format:check # passed
pnpm typecheck # passed
pnpm lint # passed
pnpm exec vitest run src/pages/DownloadsPage.test.tsx # see fresh command output
pnpm exec vitest run src/lib/__tests__/igdb-cross-play-readiness.test.ts src/components/library/GameDetails/IgdbCrossPlayReadinessPanel.test.tsx src/pages/LibraryPage.test.tsx src/components/library/GameDetailPanel.test.tsx
pnpm exec vitest run src/lib/__tests__/mobile-app-push-dry-run.test.ts src/components/launcher/MobileAppPushDryRunPanel.test.tsx src/pages/DownloadsPage.test.tsx
pnpm exec vitest run src/lib/__tests__/mobile-push-registration-readiness.test.ts src/components/launcher/MobilePushRegistrationContractPanel.test.tsx src/pages/DownloadsPage.test.tsx src/lib/__tests__/mobile-app-readiness.test.ts
pnpm exec vitest run src/lib/__tests__/mobile-session-library-chat-contract.test.ts src/components/launcher/MobileSessionLibraryChatContractPanel.test.tsx src/pages/DownloadsPage.test.tsx
pnpm test -- src/lib/__tests__/smart-install-provider-telemetry-readiness.test.ts src/components/launcher/SmartInstallProviderTelemetryReadinessPanel.test.tsx src/pages/DownloadsPage.test.tsx
pnpm exec vitest run src/lib/__tests__/profile-privacy-guard.test.ts src/components/profile/ProfilePrivacyGuardPanel.test.tsx src/components/profile/ProfileShowcaseGrid.test.tsx src/pages/ProfilePage.test.tsx
pnpm test -- src/lib/__tests__/trusted-ingestion-migration-contract.test.ts
pnpm --dir launcher exec vitest run src/lib/supabase/__tests__/trusted-ingestion.test.ts # 11 passed
pnpm test -- src/lib/supabase/__tests__/cloud-saves.test.ts
pnpm test -- src/lib/supabase/__tests__/cloud-saves.test.ts src/lib/__tests__/cross-store-save-sync-planner.test.ts
pnpm test -- src/lib/__tests__/launcher-browser-guards.test.ts
pnpm test -- src/components/friends/DeduplicationPanel.test.tsx src/components/friends/FriendImport.test.tsx src/lib/supabase/__tests__/friend-links-merge-groups.test.ts src/lib/__tests__/friend-merge-groups-migration-contract.test.ts src/pages/PageSmoke.test.tsx
pnpm test -- src/lib/__tests__/launcher-browser-guards.test.ts src/lib/__tests__/cross-store-save-migration-readiness.test.ts src/components/library/GameDetails/CrossStoreSaveMigrationReadinessPanel.test.tsx
pnpm test -- src/lib/__tests__/cross-store-save-sync-planner.test.ts src/lib/__tests__/cross-store-save-migration-readiness.test.ts src/components/library/GameDetails/CrossStoreSaveSyncPlanner.test.tsx src/components/library/GameDetails/CrossStoreSaveMigrationReadinessPanel.test.tsx src/components/library/GameDetailPanel.test.tsx src/pages/LibraryPage.test.tsx src/lib/__tests__/launcher-browser-guards.test.ts
pnpm test -- src/lib/__tests__/controller-capability-evidence.test.ts src/lib/__tests__/controller-gyro-haptics-readiness.test.ts src/lib/__tests__/virtual-gamepad-readiness.test.ts src/pages/ControllersPage.test.tsx
pnpm test -- src/lib/__tests__/presence-readiness.test.ts src/components/settings/PresencePollingReadinessPanel.test.tsx src/pages/SettingsPage.test.tsx
pnpm test -- src/lib/__tests__/overlay-e2e-readiness.test.ts src/components/settings/OverlayE2EReadinessPanel.test.tsx src/pages/PerfHistoryPage.test.tsx # 8 passed
pnpm test -- src/pages/CommunityPage.test.tsx src/components/community/PublicScreenshotFeedPanel.test.tsx src/lib/__tests__/public-screenshot-feed-readiness.test.ts src/lib/supabase/__tests__/screenshots.test.ts src/lib/__tests__/public-screenshot-feed-migration-contract.test.ts
pnpm test -- src/lib/remote-hosted-relay-deployment.test.ts src/pages/DownloadsPage.test.tsx src/pages/RemoteInstallDashboardPage.test.tsx src/lib/remote-companion-cloud-readiness.test.ts src/lib/__tests__/remote-companion-relay-contract.test.ts src/lib/supabase/__tests__/remote-companion.test.ts
pnpm test -- src/lib/__tests__/store-support.test.ts src/pages/StorePage.test.tsx
pnpm test -- src/lib/__tests__/store-price-drop-readiness.test.ts src/pages/StorePage.test.tsx
pnpm test -- src/components/library/ModalBackdrops.test.tsx src/pages/ModsPage.test.tsx src/pages/StorePage.test.tsx src/pages/LibraryPage.test.tsx src/pages/PageSmoke.test.tsx src/components/layout/AppLayout.test.tsx # 48 passed
pnpm test -- src/lib/__tests__/mod-api-staging-readiness.test.ts src/components/mods/ModApiStagingReadinessPanel.test.tsx src/pages/ModsPage.test.tsx
pnpm vitest run src/lib/__tests__/plugin-system-readiness.test.ts src/components/settings/PluginSystemReadinessPanel.test.tsx src/pages/SettingsPage.test.tsx src/lib/__tests__/launcher-browser-guards.test.ts # 67 passed
pnpm exec vitest run src/lib/__tests__/one-click-setup-rollback-audit-contract.test.ts src/components/settings/OneClickSetupRollbackAuditContractPanel.test.tsx src/pages/SettingsPage.test.tsx
pnpm exec vitest run src/lib/__tests__/hosted-cron-evidence-summary.test.ts src/components/settings/HostedCronEvidenceSummaryPanel.test.tsx src/pages/SettingsPage.test.tsx
pnpm exec vitest run src/lib/__tests__/external-completion-evidence-summary.test.ts src/components/settings/ExternalCompletionEvidenceSummaryPanel.test.tsx src/pages/SettingsPage.test.tsx
pnpm exec vitest run src/lib/__tests__/broadcast-audience-status-contract.test.ts src/components/community/BroadcastAudienceStatusContractPanel.test.tsx src/pages/CommunityPage.test.tsx src/pages/PageSmoke.test.tsx
pnpm exec vitest run src/lib/__tests__/ai-recommendation-hosted-eval-contract.test.ts src/components/library/GameDetails/AiRecommendationHostedEvalContractPanel.test.tsx src/components/library/GameDetailPanel.test.tsx src/pages/LibraryPage.test.tsx src/pages/PageSmoke.test.tsx
pnpm test        # see fresh command output
pnpm test:cov    # see fresh command output; coverage report generated
pnpm build       # passed
cd ..
rustup show active-toolchain # 1.95.0
cargo test --manifest-path launcher/src-tauri/Cargo.toml commands::games::sync::tests -- --nocapture
cargo test --manifest-path launcher/src-tauri/Cargo.toml commands::cross_store_save::tests -- --nocapture
cargo test cross_store_staging --lib
cargo test --manifest-path launcher/src-tauri/Cargo.toml # 341 passed
RUSTFLAGS='-D warnings' cargo test --manifest-path launcher/src-tauri/Cargo.toml --lib # 341 passed
RUSTFLAGS='-D warnings' cargo check --manifest-path launcher/src-tauri/Cargo.toml --lib # passed
env -u NODE_ENV RUSTFLAGS='-D warnings' pnpm -C launcher tauri build --target x86_64-unknown-linux-gnu --no-bundle # passed
env -u NODE_ENV APPIMAGE_EXTRACT_AND_RUN=1 NO_STRIP=1 RUSTFLAGS='-D warnings' pnpm -C launcher tauri build --target x86_64-unknown-linux-gnu # passed; built deb, rpm, AppImage
cargo fmt --all -- --check # passed
cargo clippy --lib --all-targets -- -D warnings # passed
cargo clippy --bins -- -D warnings # passed
cargo check --manifest-path launcher/src-tauri/Cargo.toml --lib --target x86_64-pc-windows-msvc # hardware/OS E2E lane skipped on this Linux host; runs on windows-2025 with the Windows MSVC toolchain
pnpm hosted:deploy-gate:test # 52 passed
pnpm external:evidence:test # 53 passed
pnpm hosted:cron-evidence:test # 36 passed
pnpm completion:gate:test # 17 passed
pnpm release:tag:test # 4 passed
pnpm supabase:db:lint:test # 5 passed
NODE_ENV=development pnpm --dir launcher install --frozen-lockfile # passed; prepare installs Husky hook path
pnpm --dir launcher lint-staged --diff HEAD --no-stash --concurrent false # passed
pnpm completion:gate:local # passed
pnpm completion:gate:external # fails until hosted deploy, hosted cron, and external proof artifacts pass preflight
pnpm supabase:functions:runner:test # 6 passed
pnpm verify:routes:test # 17 passed
pnpm supabase:functions:test # 386 passed
pnpm supabase:functions:check # passed
pnpm --dir launcher test -- src/lib/supabase/__tests__/playtime.test.ts src/lib/supabase/__tests__/achievements.test.ts
cd launcher
pnpm test -- --run \
  src/lib/__tests__/broadcast-chat-moderation-shadow.test.ts \
  src/components/community/BroadcastChatModerationShadowPanel.test.tsx \
  src/lib/__tests__/broadcast-vod-archive-policy.test.ts \
  src/components/community/BroadcastVodArchivePolicyPanel.test.tsx \
  src/lib/__tests__/broadcast-provider-oauth-contract.test.ts \
  src/components/community/BroadcastProviderOAuthContractPanel.test.tsx \
  src/lib/__tests__/broadcast-provider-callback-contract.test.ts \
  src/components/community/BroadcastProviderCallbackContractPanel.test.tsx \
  src/pages/CommunityPage.test.tsx \
  src/lib/__tests__/achievement-cache-readiness.test.ts \
  src/components/achievements/AchievementCacheReadinessPanel.test.tsx \
  src/lib/__tests__/achievement-hosted-hydration-contract.test.ts \
  src/components/achievements/AchievementHostedHydrationContractPanel.test.tsx \
  src/pages/AchievementsPage.test.tsx \
  src/lib/__tests__/overlay-fullscreen-anti-cheat-readiness.test.ts \
  src/components/settings/OverlayFullscreenAntiCheatReadinessPanel.test.tsx \
  src/pages/PerfHistoryPage.test.tsx \
  src/lib/__tests__/client-manager-mount-apply-contract.test.ts \
  src/components/settings/ClientManagerMountApplyContractPanel.test.tsx \
  src/pages/SettingsPage.test.tsx \
  src/lib/__tests__/backlog-recommendations.test.ts \
  src/components/library/BacklogPriorityPanel.test.tsx \
  src/lib/__tests__/ai-recommendation-readiness.test.ts \
  src/components/library/GameDetails/AiRecommendationReadinessPanel.test.tsx \
  src/lib/supabase/__tests__/community-artwork.test.ts \
  src/lib/__tests__/hosted-controller-layout-readiness.test.ts \
  src/lib/__tests__/hosted-controller-layout-migration-contract.test.ts \
  src/lib/supabase/__tests__/controllers.test.ts \
  src/components/controllers/ControllerLayoutEditor.test.tsx \
  src/pages/ControllersPage.test.tsx \
  src/components/library/CommunityArtworkUploadPanel.test.tsx \
  src/lib/__tests__/community-artwork-migration-contract.test.ts \
  src/lib/__tests__/hosted-community-artwork-moderation-console.test.ts \
  src/lib/__tests__/hosted-community-artwork-readiness.test.ts \
  src/components/library/GameDetails/HostedCommunityArtworkModeratorConsolePanel.test.tsx \
  src/components/library/GameDetails/HostedCommunityArtworkReadinessPanel.test.tsx \
  src/components/library/CommunityArtworkGallery.test.tsx \
  src/components/library/GameDetailPanel.test.tsx \
  src/pages/LibraryPage.test.tsx

cd src-tauri
cargo test       # 341 passed

cd ../..
pnpm --dir launcher exec supabase db reset # passed
pnpm supabase:db:lint # no schema errors
pnpm supabase:functions:test
# 386 passed
pnpm supabase:functions:check # passed
```
