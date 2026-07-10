# Plugin Runtime Sandbox Proof-Process Design

Date: 2026-06-21

Status: Approved scope for design. User selected option A: proof-process slice.

## Problem

The Plugin System has strong local admission evidence, but its runtime sandbox
lane is still a dry-run. `prove_plugin_runtime_sandbox_from_path` re-audits the
disabled signed registry, denies every entrypoint before code load, and returns
`process_boundary_ready: false`, `ipc_allowlist_ready: false`,
`permission_grant_ready: false`, `allowed_execution_count: 0`, and
`code_executed: false`.

That is honest evidence, but it leaves the local product boundary short of a
real runtime process proof. The next local slice must prove an owned process
boundary and deny-by-default runtime policy without loading arbitrary staged
plugin code or claiming third-party plugin execution readiness.

## Goals

- Add a deep Rust Module for Plugin Runtime Sandbox proof work, with thin Tauri
  command callers.
- Prove an owned child-process/probe boundary for the desktop runtime lane.
- Keep staged plugin packages disabled and re-audited before any proof result is
  emitted.
- Keep arbitrary plugin code unexecuted: `code_executed` remains `false`, and
  `allowed_execution_count` remains `0`.
- Preserve explicit blocked activation semantics: no download, install,
  auto-install, network, persistent permission grants, or third-party plugin
  execution.
- Version the frontend readiness semantics so a proof-process result is treated
  as local admission evidence, not as a full production plugin runtime.
- Keep all proof evidence local and deterministic; no external provider,
  marketplace, hosted deployment, hardware, or live secret dependency is added.

## Non-Goals

- Do not execute arbitrary third-party plugin entrypoints.
- Do not add plugin marketplace discovery, install, update download, or
  auto-update execution.
- Do not persist permission grants.
- Do not claim OS-level filesystem or network sandboxing beyond what is actually
  enforced by this slice.
- Do not replace external release gates. External provider, hosted, hardware,
  marketplace, and rollout evidence remains separate.

## Current Callers

The existing Tauri commands are the external seam:

- `prove_plugin_runtime_sandbox(app, input)`
- `review_plugin_activation_plan(app, input)`

Today those commands resolve the staged registry path, load trusted signing
keys, and call private path-oriented helpers. The design moves runtime sandbox
coordination into a dedicated Module while preserving command result shapes.

## Module Interface

Introduce a Rust Module under the command layer:

```rust
pub(crate) mod plugin_runtime_sandbox {
    pub(crate) struct PluginRuntimeSandbox<P = DesktopOwnedProbe> {
        /* private */
    }

    impl PluginRuntimeSandbox<DesktopOwnedProbe> {
        pub(crate) fn from_app(app: &tauri::AppHandle) -> Result<Self, PluginRuntimeSandboxError>;
    }

    impl<P: OwnedSandboxProbe> PluginRuntimeSandbox<P> {
        pub(crate) fn prove_process(
            &self,
            input: PluginRuntimeSandboxProofRequest,
        ) -> Result<PluginRuntimeSandboxProofResult, PluginRuntimeSandboxError>;

        pub(crate) fn review_activation_plan_blocked(
            &self,
            input: PluginActivationPlanReviewRequest,
        ) -> Result<PluginActivationPlanReviewResult, PluginRuntimeSandboxError>;
    }

    pub(crate) trait OwnedSandboxProbe {
        fn prove(&self, request: OwnedProbeRequest) -> Result<OwnedProbeReport, PluginRuntimeSandboxError>;
    }
}
```

The public interface is intentionally small. It hides app-data path resolution,
trusted key loading, disabled-registry re-audit, consent checks, manifest hash
collection, owned probe invocation, evidence mapping, timestamps, and safe
failure modes.

Tests may use a path/probe constructor inside the Module implementation, but
callers outside the Module should not assemble audit, policy, or probe state by
hand.

## Proof-Process Behavior

`prove_process` performs these steps:

1. Validate exact runtime proof consent.
2. Re-audit the disabled staged plugin registry with trusted keys.
3. Fail closed if any registry entry is enabled, tampered, unsigned, unknown,
   symlink-escaped, path-escaped, or otherwise not `disabled-audited`.
4. Build a deny-by-default policy packet:
   - no plugin entrypoint execution,
   - no host filesystem grant,
   - no network grant,
   - no environment grant,
   - no IPC command grant,
   - no process-spawn grant,
   - no persistent permission grant.
5. Spawn only an owned probe process or owned probe adapter. The probe request
   must not include plugin source, plugin entrypoint arguments, or any value that
   lets the child process load staged plugin code.
6. Map the probe report and registry audit into `PluginRuntimeSandboxProofResult`.

Expected proof-process result semantics:

- `process_boundary_ready: true` means the owned probe boundary ran and reported
  expected deny-by-default policy evidence.
- `ipc_allowlist_ready: true` means the deny-all IPC policy was explicitly
  installed for the proof and no plugin-facing IPC command was granted.
- `permission_grant_ready: false` remains false because no durable grant model is
  being enabled.
- `code_executed: false` remains false because plugin entrypoints were not
  loaded.
- `allowed_execution_count: 0` remains zero.
- `denied_entrypoint_count` still matches the clean disabled package count.
- Entries remain blocked, but the deny reason changes from "runtime not
  implemented" to a proof-process denial reason such as "Owned process boundary
  proved; plugin entrypoint remains denied until the production runtime grants
  model exists."

## Activation Review Behavior

`review_activation_plan_blocked` keeps activation blocked. A clean package may
show that the proof-process boundary exists, but activation still returns a
blocked status until a later runtime slice can enforce and persist a real
grant model.

The activation result must keep these fields false:

- `code_executed`
- `download_attempted`
- `install_applied`
- `auto_install_allowed`
- `permission_grants_persisted`
- `network_allowed`

The result may include a process-boundary check with local proof evidence, but
it must not convert clean staged packages into enabled plugins.

## Frontend Readiness Semantics

`PluginRuntimeSandboxProofEvidence` already has the right core fields, but the
readiness predicate currently treats any `processBoundaryReady: true` value as
unsafe because it only recognizes the dry-run shape.

The implementation must update the frontend readiness logic to recognize two
local evidence modes:

- dry-run admission evidence: current behavior, no process boundary;
- proof-process admission evidence: owned process boundary proved, no plugin
  code executed, no durable permission grants.

The Settings UI must avoid "runtime ready" or "production sandbox ready" claims.
Copy should say that the owned process boundary is proved while third-party
plugin execution remains blocked.

Because this changes visible UI state, verification must include screenshots
under `docs/verification/screenshots/` and an updated
`docs/verification/README.md` entry following the OG Launcher Retro Manga
visual-system rules.

## Error Handling

The Module fails closed:

- Missing or wrong consent returns an error before filesystem reads beyond
  basic path resolution.
- Dirty disabled-registry audit returns an error before probe execution.
- Probe spawn failures return blocked proof evidence or an error; they must not
  be treated as partial success.
- Malformed probe output returns an error and leaves activation blocked.
- Any mismatch between audit counts and proof entries is unsafe.

Error strings should stay operator-readable because they surface through the
desktop command layer and existing readiness panels.

## Security Invariants

- No arbitrary plugin entrypoint is executed in this slice.
- The child process receives no plugin source path that can be loaded as code.
- The child process receives no live secrets.
- The child process receives a minimal environment and deterministic arguments.
- The staged registry remains disabled.
- Browser-local cache rows remain display-only and never become trust evidence.
- Network, filesystem, environment, process-spawn, and plugin-facing IPC grants
  remain denied.
- No permission grant is persisted.

## Verification Plan

Rust tests:

- `prove_process` rejects missing or wrong consent.
- `prove_process` rejects enabled or tampered registry entries before probe
  execution.
- `prove_process` invokes the owned probe only after a clean disabled audit.
- Probe request data excludes plugin code and plugin entrypoint execution args.
- Successful proof-process evidence sets `process_boundary_ready: true`,
  `ipc_allowlist_ready: true`, `permission_grant_ready: false`,
  `code_executed: false`, and `allowed_execution_count: 0`.
- Activation review remains blocked for a clean package and never downloads,
  installs, grants permissions, enables network, or executes code.

Frontend tests:

- Readiness accepts dry-run admission evidence.
- Readiness accepts proof-process admission evidence as warning/local evidence,
  not as production runtime readiness.
- Unsafe spoofed combinations remain blocked, including code execution,
  allowed execution count greater than zero, missing escape fixtures, mismatched
  audit counts, persistent permission grants, or runtime-ready copy.
- Settings panel copy renders process-boundary proof without implying plugin
  execution.

UI verification:

- Capture desktop and mobile screenshots for
  `/settings?verify=plugin-runtime-sandbox-process-boundary`.
- Confirm Retro Manga Launcher styling, OG-Launcher header navigation, no
  horizontal overflow, and no production-ready claim.

Release gates:

- Run focused Rust and frontend tests first.
- Run formatting/lint/typecheck as touched surfaces require.
- Run `pnpm verify:ui-evidence` after screenshot updates.
- Run `pnpm completion:gate:local` before claiming local completion for this
  slice.

## Implementation Order

1. Add failing Rust tests for the proof-process Module behavior.
2. Extract or introduce the `plugin_runtime_sandbox` Module behind the current
   command surface.
3. Add the owned probe adapter and test fake.
4. Update proof result mapping and activation review checks.
5. Add frontend readiness tests for dry-run and proof-process evidence modes.
6. Update Settings panel copy and proof ledger labels.
7. Capture required screenshots and update verification docs.
8. Run focused checks, then the local completion gate.

## Acceptance Criteria

- The existing dry-run evidence still works.
- A clean disabled signed registry can produce proof-process evidence.
- The proof-process path proves an owned process boundary without executing
  plugin code.
- Activation remains blocked.
- UI and tests distinguish local process proof from production plugin runtime
  readiness.
- The local completion gate passes after implementation.
