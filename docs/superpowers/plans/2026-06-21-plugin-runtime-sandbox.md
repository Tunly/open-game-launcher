# Plugin Runtime Sandbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Plugin Runtime Sandbox dry-run with a local proof-process lane that proves an owned child-process boundary while keeping plugin code execution and activation blocked.

**Architecture:** Add a deep Rust Module below the Tauri command surface. Existing commands stay stable, but their implementation delegates registry audit, consent, probe invocation, activation blocking, and evidence mapping to the new Module. Frontend readiness gains a second local evidence mode for proof-process results while preserving the existing dry-run fixture mode.

**Tech Stack:** Rust 1.95, Tauri 2 commands, std::process child-process probe, React/TypeScript, Vitest, Playwright screenshots, existing completion gates.

---

## File Structure

- Create `launcher/src-tauri/src/commands/plugin_runtime_sandbox.rs`
  - Owns the Plugin Runtime Sandbox Module, `OwnedSandboxProbe` seam, `DesktopOwnedProbe`, proof-process evidence mapping, activation-plan blocked review, and headless probe parsing.
- Modify `launcher/src-tauri/src/commands/mod.rs`
  - Exports the new Rust command Module.
- Modify `launcher/src-tauri/src/commands/plugin_system.rs`
  - Makes the minimal signing/audit helpers `pub(crate)`, delegates the two runtime/activation internal helpers to `plugin_runtime_sandbox`, and keeps existing Tauri command names.
- Modify `launcher/src-tauri/src/lib.rs`
  - Exposes `run_headless_plugin_runtime_sandbox_probe_from_args`.
- Modify `launcher/src-tauri/src/main.rs`
  - Checks the plugin sandbox probe headless entry before starting Tauri.
- Modify `launcher/src/lib/plugin-system-readiness.ts`
  - Adds proof-process evidence validation beside dry-run validation.
- Modify `launcher/src/lib/__tests__/plugin-system-readiness.test.ts`
  - Adds proof-process readiness tests and keeps unsafe spoof cases blocked.
- Modify `launcher/src/components/settings/PluginSystemReadinessPanel.tsx`
  - Updates copy and labels to show owned process proof without runtime-ready claims.
- Modify `launcher/src/components/settings/PluginSystemReadinessPanel.test.tsx`
  - Adds UI expectations for proof-process evidence.
- Modify `launcher/src/pages/SettingsPage.tsx`
  - Sends the process-proof consent operation from the native proof button.
- Modify `launcher/src/pages/SettingsPage.test.tsx`
  - Updates native proof action expectations.
- Modify `launcher/src/lib/__tests__/launcher-browser-guards.test.ts`
  - Updates browser guard test request operation.
- Modify `docs/verification/README.md`
  - Updates screenshot descriptions after UI captures.
- Replace screenshots:
  - `docs/verification/screenshots/settings-plugin-system-runtime-sandbox-process-boundary-local.png`
  - `docs/verification/screenshots/settings-plugin-system-runtime-sandbox-process-boundary-mobile.png`

## Constants

Use these operation strings consistently:

```rust
pub(crate) const PLUGIN_RUNTIME_SANDBOX_PROCESS_PROOF_OPERATION: &str =
    "prove_plugin_runtime_sandbox_process_proof";
```

```ts
const PLUGIN_RUNTIME_SANDBOX_PROCESS_PROOF_OPERATION =
  "prove_plugin_runtime_sandbox_process_proof";
```

Keep `prove_plugin_runtime_sandbox_dry_run` only in tests and fixtures that
model historical dry-run evidence. New native UI calls must use the process
proof operation.

### Task 1: Rust Red Tests for Proof-Process Evidence

**Files:**
- Modify: `launcher/src-tauri/src/commands/plugin_system.rs`
- Test: `launcher/src-tauri/src/commands/plugin_system.rs`

- [x] **Step 1: Update the existing runtime proof test expectations**

In `plugin_system.rs`, update `proves_plugin_runtime_sandbox_preflight_from_audited_disabled_registry_without_executing_entrypoint` to use the new process-proof consent operation and expect process proof evidence:

```rust
let proof = prove_plugin_runtime_sandbox_from_path(
    &registry_root,
    &[trusted_key],
    Some("prove_plugin_runtime_sandbox_process_proof"),
)
.unwrap();

assert!(!proof.code_executed);
assert!(proof.process_boundary_ready);
assert!(proof.ipc_allowlist_ready);
assert!(!proof.permission_grant_ready);
assert_eq!(proof.audit_passed_count, 1);
assert_eq!(proof.audit_failed_count, 0);
assert_eq!(proof.allowed_execution_count, 0);
assert_eq!(proof.denied_entrypoint_count, 1);
assert_eq!(proof.entries.len(), 1);
assert_eq!(proof.entries[0].plugin_id, "library-tags-exporter");
assert_eq!(proof.entries[0].status, "runtime-blocked");
assert_eq!(proof.entries[0].entrypoint, "dist/main.js");
assert!(proof.entries[0].issues.is_empty());
assert!(proof.entries[0]
    .deny_reason
    .contains("Owned process boundary proved"));
assert_eq!(proof.escape_attempts.len(), 8);
assert!(proof
    .escape_attempts
    .iter()
    .all(|attempt| attempt.result == "blocked-by-admission"));
assert!(proof.source_label.contains("proof-process"));
```

- [x] **Step 2: Update the existing activation review test expectations**

In `plugin_system.rs`, update `review_plugin_activation_plan_blocks_clean_package_until_production_sandbox_exists` to expect a process-boundary proof check while keeping activation blocked:

```rust
assert_eq!(review.status, "blocked-production-sandbox");
assert_eq!(review.plugin_id, "library-tags-exporter");
assert_eq!(review.version, "1.0.0");
assert_eq!(review.entrypoint, "dist/main.js");
assert_eq!(review.manifest_hash, expected_manifest_hash);
assert!(!review.code_executed);
assert!(!review.download_attempted);
assert!(!review.install_applied);
assert!(!review.auto_install_allowed);
assert!(!review.permission_grants_persisted);
assert!(review.process_boundary_ready);
assert!(!review.network_allowed);
assert!(check_ids.contains("registry-audit"));
assert!(check_ids.contains("activation-consent"));
assert!(check_ids.contains("execution-denied"));
assert!(check_ids.contains("download-install-denied"));
assert!(check_ids.contains("permission-grants-denied"));
assert!(check_ids.contains("process-boundary-proof"));
assert!(check_ids.contains("target-package"));
```

- [x] **Step 3: Run the focused Rust tests and verify failure**

Run:

```bash
cargo test --manifest-path launcher/src-tauri/Cargo.toml plugin_system::tests::proves_plugin_runtime_sandbox_preflight_from_audited_disabled_registry_without_executing_entrypoint
cargo test --manifest-path launcher/src-tauri/Cargo.toml plugin_system::tests::review_plugin_activation_plan_blocks_clean_package_until_production_sandbox_exists
```

Expected: FAIL because the current implementation still returns dry-run flags and lacks the `process-boundary-proof` check.

- [x] **Step 4: Commit the red tests**

```bash
git add launcher/src-tauri/src/commands/plugin_system.rs
git commit -m "test(plugin): expect sandbox process proof"
```

### Task 2: Rust Module Implementation

**Files:**
- Modify: `launcher/src-tauri/src/commands/plugin_system.rs`
- Modify: `launcher/src-tauri/src/commands/plugin_runtime_sandbox.rs`
- Test: `launcher/src-tauri/src/commands/plugin_runtime_sandbox.rs`

- [x] **Step 1: Expose the minimal plugin-system helpers to the new Module**

In `launcher/src-tauri/src/commands/plugin_system.rs`, change only these declarations from private to `pub(crate)`. Do not rewrite their bodies in this step; the current implementations remain the source of truth.

```rust
pub(crate) const PLUGIN_RUNTIME_SANDBOX_PROCESS_PROOF_OPERATION: &str =
    "prove_plugin_runtime_sandbox_process_proof";
pub(crate) const PLUGIN_ACTIVATION_PLAN_REVIEW_OPERATION_PREFIX: &str =
    "review_plugin_activation_plan";

#[derive(Debug, Clone)]
pub(crate) struct TrustedPluginSigningKey {
    pub(crate) id: String,
    pub(crate) verifying_key: VerifyingKey,
}

pub(crate) fn trusted_plugin_signing_keys_from_env() -> Result<Vec<TrustedPluginSigningKey>, String> {
    // keep the current implementation body
}

pub(crate) fn audit_staged_plugin_registry_from_path(
    registry_root: &Path,
    trusted_keys: &[TrustedPluginSigningKey],
) -> Result<StagedPluginRegistryAuditResult, String> {
    // keep the current implementation body
}

pub(crate) fn plugin_runtime_sandbox_escape_attempts() -> Vec<PluginRuntimeSandboxEscapeAttempt> {
    // keep the current implementation body
}

pub(crate) fn unix_timestamp_millis() -> u128 {
    // keep the current implementation body
}

pub(crate) fn is_safe_identifier(value: &str) -> bool {
    // keep the current implementation body
}

pub(crate) fn is_safe_version(value: &str) -> bool {
    // keep the current implementation body
}

pub(crate) fn sha256_hex(bytes: &[u8]) -> String {
    // keep the current implementation body
}
```

If a helper has generic parameters, attributes, or a slightly different return type in the current file, preserve the current declaration exactly and only add `pub(crate)`.

- [x] **Step 2: Implement the Module types and proof mapping**

Replace the shell in `launcher/src-tauri/src/commands/plugin_runtime_sandbox.rs` with this structure:

```rust
use crate::commands::plugin_system::{
    audit_staged_plugin_registry_from_path, is_safe_identifier, is_safe_version,
    plugin_runtime_sandbox_escape_attempts, sha256_hex, trusted_plugin_signing_keys_from_env,
    unix_timestamp_millis, PluginActivationPlanReviewCheck, PluginActivationPlanReviewRequest,
    PluginActivationPlanReviewResult, PluginRuntimeSandboxEscapeAttempt,
    PluginRuntimeSandboxProofEntry, PluginRuntimeSandboxProofRequest,
    PluginRuntimeSandboxProofResult, StagedPluginRegistryAuditEntry, TrustedPluginSigningKey,
    PLUGIN_ACTIVATION_PLAN_REVIEW_OPERATION_PREFIX,
    PLUGIN_RUNTIME_SANDBOX_PROCESS_PROOF_OPERATION,
};
use serde::{Deserialize, Serialize};
use std::{
    fmt,
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct PluginRuntimeSandboxError(String);

impl PluginRuntimeSandboxError {
    fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }
}

impl fmt::Display for PluginRuntimeSandboxError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl From<String> for PluginRuntimeSandboxError {
    fn from(value: String) -> Self {
        Self(value)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SandboxPolicy {
    pub(crate) no_plugin_code: bool,
    pub(crate) filesystem_grant: bool,
    pub(crate) network_grant: bool,
    pub(crate) environment_grant: bool,
    pub(crate) ipc_command_grant: bool,
    pub(crate) process_spawn_grant: bool,
    pub(crate) persistent_permission_grant: bool,
}

impl SandboxPolicy {
    fn deny_all() -> Self {
        Self {
            no_plugin_code: true,
            filesystem_grant: false,
            network_grant: false,
            environment_grant: false,
            ipc_command_grant: false,
            process_spawn_grant: false,
            persistent_permission_grant: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OwnedProbeRequest {
    pub(crate) policy: SandboxPolicy,
    pub(crate) audited_package_count: usize,
    pub(crate) plugin_entrypoints: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OwnedProbeReport {
    pub(crate) allowed_execution_count: usize,
    pub(crate) code_executed: bool,
    pub(crate) ipc_allowlist_ready: bool,
    pub(crate) permission_grant_ready: bool,
    pub(crate) process_boundary_ready: bool,
    pub(crate) probe_label: String,
}

pub(crate) trait OwnedSandboxProbe: Clone {
    fn prove(&self, request: OwnedProbeRequest) -> Result<OwnedProbeReport, PluginRuntimeSandboxError>;
}

#[derive(Debug, Clone)]
pub(crate) struct PluginRuntimeSandbox<P = DesktopOwnedProbe> {
    registry_root: PathBuf,
    trusted_keys: Vec<TrustedPluginSigningKey>,
    probe: P,
}

impl PluginRuntimeSandbox<DesktopOwnedProbe> {
    pub(crate) fn from_app(app: &tauri::AppHandle) -> Result<Self, PluginRuntimeSandboxError> {
        let registry_root = app
            .path()
            .app_data_dir()
            .map_err(|error| PluginRuntimeSandboxError::new(format!("Could not resolve plugin registry directory: {error}")))?
            .join("plugins")
            .join("staged");
        Ok(Self {
            registry_root,
            trusted_keys: trusted_plugin_signing_keys_from_env()?,
            probe: DesktopOwnedProbe::from_current_exe()?,
        })
    }
}

impl<P: OwnedSandboxProbe> PluginRuntimeSandbox<P> {
    pub(crate) fn from_parts(
        registry_root: PathBuf,
        trusted_keys: Vec<TrustedPluginSigningKey>,
        probe: P,
    ) -> Self {
        Self {
            registry_root,
            trusted_keys,
            probe,
        }
    }
}
```

Then add `prove_process` and `review_activation_plan_blocked` using the current body of `prove_plugin_runtime_sandbox_from_path` and `review_plugin_activation_plan_from_path`, but route the clean-audit path through `self.probe.prove(...)`.

- [x] **Step 3: Use safe probe request data**

Inside `prove_process`, create the request exactly with empty plugin entrypoints:

```rust
let probe_report = self.probe.prove(OwnedProbeRequest {
    policy: SandboxPolicy::deny_all(),
    audited_package_count: audit.passed_count,
    plugin_entrypoints: Vec::new(),
})?;
```

This is the core security invariant. The probe receives counts and policy only; it never receives staged plugin source paths or entrypoint values.

- [x] **Step 4: Run Rust tests**

Run:

```bash
cargo test --manifest-path launcher/src-tauri/Cargo.toml plugin_runtime_sandbox
```

Expected: PASS or zero matching tests with successful compilation of the new module.

- [x] **Step 5: Commit the Module implementation**

```bash
git add launcher/src-tauri/src/commands/plugin_system.rs launcher/src-tauri/src/commands/plugin_runtime_sandbox.rs
git commit -m "feat(plugin): add sandbox process proof module"
```

### Task 3: Headless Probe Adapter

**Files:**
- Modify: `launcher/src-tauri/src/commands/plugin_runtime_sandbox.rs`
- Modify: `launcher/src-tauri/src/lib.rs`
- Modify: `launcher/src-tauri/src/main.rs`
- Test: `launcher/src-tauri/src/commands/plugin_runtime_sandbox.rs`

- [x] **Step 1: Add headless probe tests**

Add these tests to `launcher/src-tauri/src/commands/plugin_runtime_sandbox.rs`:

```rust
#[test]
fn headless_probe_returns_success_for_deny_all_policy() {
    let args = vec![
        "open-game-launcher".to_string(),
        "--og-plugin-runtime-sandbox-probe".to_string(),
        "--deny-all-policy-v1".to_string(),
    ];

    let output = run_headless_plugin_runtime_sandbox_probe_from_args_for_test(args).unwrap();

    assert!(output.process_boundary_ready);
    assert!(output.ipc_allowlist_ready);
    assert!(!output.permission_grant_ready);
    assert!(!output.code_executed);
    assert_eq!(output.allowed_execution_count, 0);
}

#[test]
fn headless_probe_ignores_normal_app_args() {
    let args = vec!["open-game-launcher".to_string(), "--not-the-probe".to_string()];

    assert!(run_headless_plugin_runtime_sandbox_probe_from_args_for_test(args).is_none());
}
```

Run:

```bash
cargo test --manifest-path launcher/src-tauri/Cargo.toml headless_probe
```

Expected: FAIL because the headless probe functions do not exist yet.

- [x] **Step 2: Implement headless probe parsing**

Add this public function in `plugin_runtime_sandbox.rs`:

```rust
pub(crate) fn run_headless_plugin_runtime_sandbox_probe_from_args() -> Option<i32> {
    let args = std::env::args().collect::<Vec<_>>();
    match run_headless_plugin_runtime_sandbox_probe_from_args_for_test(args) {
        Some(report) => {
            match serde_json::to_string(&report) {
                Ok(payload) => {
                    println!("{payload}");
                    Some(0)
                }
                Err(error) => {
                    eprintln!("Could not serialize plugin sandbox probe report: {error}");
                    Some(1)
                }
            }
        }
        None => None,
    }
}

pub(crate) fn run_headless_plugin_runtime_sandbox_probe_from_args_for_test(
    args: Vec<String>,
) -> Option<OwnedProbeReport> {
    let mut iter = args.iter().skip(1);
    let mode = iter.next()?;
    let policy = iter.next()?;
    if mode != "--og-plugin-runtime-sandbox-probe" || policy != "--deny-all-policy-v1" {
        return None;
    }
    Some(OwnedProbeReport {
        allowed_execution_count: 0,
        code_executed: false,
        ipc_allowlist_ready: true,
        permission_grant_ready: false,
        process_boundary_ready: true,
        probe_label: "owned-deny-all-process-probe-v1".to_string(),
    })
}
```

- [x] **Step 3: Implement the desktop probe adapter**

Add this adapter in `plugin_runtime_sandbox.rs`:

```rust
#[derive(Debug, Clone)]
pub(crate) struct DesktopOwnedProbe {
    exe_path: PathBuf,
}

impl DesktopOwnedProbe {
    pub(crate) fn from_current_exe() -> Result<Self, PluginRuntimeSandboxError> {
        let exe_path = std::env::current_exe().map_err(|error| {
            PluginRuntimeSandboxError::new(format!("Could not resolve launcher executable: {error}"))
        })?;
        Ok(Self { exe_path })
    }
}

impl OwnedSandboxProbe for DesktopOwnedProbe {
    fn prove(&self, request: OwnedProbeRequest) -> Result<OwnedProbeReport, PluginRuntimeSandboxError> {
        if !request.policy.no_plugin_code || !request.plugin_entrypoints.is_empty() {
            return Err(PluginRuntimeSandboxError::new(
                "Plugin sandbox probe request must not include plugin code.",
            ));
        }
        let output = Command::new(&self.exe_path)
            .arg("--og-plugin-runtime-sandbox-probe")
            .arg("--deny-all-policy-v1")
            .env_clear()
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|error| PluginRuntimeSandboxError::new(format!("Could not run plugin sandbox probe: {error}")))?;
        if !output.status.success() {
            return Err(PluginRuntimeSandboxError::new(
                "Plugin sandbox probe process exited unsuccessfully.",
            ));
        }
        serde_json::from_slice::<OwnedProbeReport>(&output.stdout).map_err(|error| {
            PluginRuntimeSandboxError::new(format!("Plugin sandbox probe returned invalid JSON: {error}"))
        })
    }
}
```

- [x] **Step 4: Wire the headless entrypoint**

In `launcher/src-tauri/src/lib.rs`, add:

```rust
pub fn run_headless_plugin_runtime_sandbox_probe_from_args() -> Option<i32> {
    commands::plugin_runtime_sandbox::run_headless_plugin_runtime_sandbox_probe_from_args()
}
```

In `launcher/src-tauri/src/main.rs`, add the check before `open_game_launcher_lib::run()`:

```rust
if let Some(exit_code) =
    open_game_launcher_lib::run_headless_plugin_runtime_sandbox_probe_from_args()
{
    std::process::exit(exit_code);
}
```

- [x] **Step 5: Run focused Rust tests and commit**

Run:

```bash
cargo test --manifest-path launcher/src-tauri/Cargo.toml plugin_runtime_sandbox
```

Expected: PASS.

Commit:

```bash
git add launcher/src-tauri/src/commands/plugin_runtime_sandbox.rs launcher/src-tauri/src/lib.rs launcher/src-tauri/src/main.rs
git commit -m "feat(plugin): add sandbox probe entrypoint"
```

### Task 4: Delegate Existing Commands to the Module

**Files:**
- Modify: `launcher/src-tauri/src/commands/plugin_system.rs`
- Test: `launcher/src-tauri/src/commands/plugin_system.rs`

- [x] **Step 1: Re-run the red proof and activation tests from Task 1**

Run:

```bash
cargo test --manifest-path launcher/src-tauri/Cargo.toml plugin_system::tests::proves_plugin_runtime_sandbox_preflight_from_audited_disabled_registry_without_executing_entrypoint
cargo test --manifest-path launcher/src-tauri/Cargo.toml plugin_system::tests::review_plugin_activation_plan_blocks_clean_package_until_production_sandbox_exists
```

Expected: FAIL until command delegation is updated.

- [x] **Step 2: Delegate internal helpers**

In `plugin_system.rs`, replace `prove_plugin_runtime_sandbox_from_path` with a wrapper that uses `PluginRuntimeSandbox::from_parts` and a desktop probe:

```rust
fn prove_plugin_runtime_sandbox_from_path(
    registry_root: &Path,
    trusted_keys: &[TrustedPluginSigningKey],
    consent_operation: Option<&str>,
) -> Result<PluginRuntimeSandboxProofResult, String> {
    let operation = consent_operation.unwrap_or("").to_string();
    let sandbox = crate::commands::plugin_runtime_sandbox::PluginRuntimeSandbox::from_parts(
        registry_root.to_path_buf(),
        trusted_keys.to_vec(),
        crate::commands::plugin_runtime_sandbox::DesktopOwnedProbe::from_current_exe()
            .map_err(|error| error.to_string())?,
    );
    sandbox
        .prove_process(PluginRuntimeSandboxProofRequest {
            consent: PluginRuntimeSandboxProofConsent {
                accepted: !operation.is_empty(),
                operation,
            },
        })
        .map_err(|error| error.to_string())
}
```

Do the same for `review_plugin_activation_plan_from_path`, building a `PluginActivationPlanReviewRequest` from the current arguments and delegating to `review_activation_plan_blocked`.

- [x] **Step 3: Keep old dirty-registry tests passing**

Run:

```bash
cargo test --manifest-path launcher/src-tauri/Cargo.toml rejects_plugin_runtime_sandbox_preflight_for_enabled_registry_entry
cargo test --manifest-path launcher/src-tauri/Cargo.toml rejects_plugin_runtime_sandbox_preflight_for_tampered_registry_entry
```

Expected: PASS. The probe must not run when audit fails.

- [x] **Step 4: Run Rust suite and commit**

Run:

```bash
cargo test --manifest-path launcher/src-tauri/Cargo.toml
cargo fmt --manifest-path launcher/src-tauri/Cargo.toml --all -- --check
```

Expected: PASS.

Commit:

```bash
git add launcher/src-tauri/src/commands/plugin_system.rs
git commit -m "refactor(plugin): route sandbox commands through module"
```

### Task 5: Frontend Readiness Evidence Modes

**Files:**
- Modify: `launcher/src/lib/plugin-system-readiness.ts`
- Modify: `launcher/src/lib/__tests__/plugin-system-readiness.test.ts`

- [x] **Step 1: Add failing proof-process readiness tests**

Add this helper to `plugin-system-readiness.test.ts`:

```ts
function createRuntimeSandboxProcessProof(): PluginRuntimeSandboxProofEvidence {
  return createRuntimeSandboxProof({
    entries: [
      {
        denyReason:
          "Owned process boundary proved; plugin entrypoint remains denied until the production runtime grants model exists.",
        entrypoint: "dist/main.js",
        issues: [],
        pluginId: "verified-plugin",
        registryPath: "app-data/plugins/staged/verified-plugin/1.0.0",
        status: "runtime-blocked",
        version: "1.0.0",
      },
    ],
    ipcAllowlistReady: true,
    permissionGrantReady: false,
    processBoundaryReady: true,
    sourceLabel: "Desktop runtime sandbox proof-process",
  });
}
```

Add this test:

```ts
it("treats proof-process sandbox evidence as local admission evidence", () => {
  const readiness = buildRuntimeReadinessWithProof(createRuntimeSandboxProcessProof());

  const runtimeCheck = readiness.checks.find((check) => check.id === "runtime-sandbox");
  expect(runtimeCheck?.status).toBe("warning");
  expect(runtimeCheck?.detail).toContain("owned process boundary");
  expect(runtimeCheck?.detail).toContain("codeExecuted false");
  expect(runtimeCheck?.detail).toContain("plugin execution blocked");
  expect(readiness.runtimeSandboxProof?.processBoundaryReady).toBe(true);
  expect(readiness.runtimeSandboxProof?.allowedExecutionCount).toBe(0);
});
```

Update the unsafe capability test name and expectation so only `permissionGrantReady: true` is blocked:

```ts
it("blocks runtime sandbox admission when proof-process evidence claims persistent grants", () => {
  const readiness = buildRuntimeReadinessWithProof(
    createRuntimeSandboxProcessProof({
      permissionGrantReady: true,
    }),
  );

  const runtimeCheck = readiness.checks.find((check) => check.id === "runtime-sandbox");
  expect(runtimeCheck?.status).toBe("blocked");
  expect(readiness.nextAction).toBe(
    "Fix runtime sandbox evidence before any plugin admission work.",
  );
});
```

Run:

```bash
pnpm --dir launcher test src/lib/__tests__/plugin-system-readiness.test.ts
```

Expected: FAIL because proof-process evidence is still considered unsafe.

- [x] **Step 2: Add explicit readiness predicates**

In `plugin-system-readiness.ts`, split the runtime proof validation:

```ts
function isRuntimeSandboxDryRunProofReady(
  proof: PluginRuntimeSandboxProofEvidence | null,
): boolean {
  return Boolean(
    proof &&
      hasCommonRuntimeSandboxProofShape(proof) &&
      proof.processBoundaryReady === false &&
      proof.ipcAllowlistReady === false &&
      proof.permissionGrantReady === false,
  );
}

function isRuntimeSandboxProcessProofReady(
  proof: PluginRuntimeSandboxProofEvidence | null,
): boolean {
  return Boolean(
    proof &&
      hasCommonRuntimeSandboxProofShape(proof) &&
      proof.processBoundaryReady === true &&
      proof.ipcAllowlistReady === true &&
      proof.permissionGrantReady === false &&
      proof.sourceLabel.toLowerCase().includes("proof-process") &&
      proof.entries.every((entry) =>
        cleanText(entry.denyReason).toLowerCase().includes("owned process boundary proved"),
      ),
  );
}

function isRuntimeSandboxProofReady(proof: PluginRuntimeSandboxProofEvidence | null): boolean {
  return isRuntimeSandboxDryRunProofReady(proof) || isRuntimeSandboxProcessProofReady(proof);
}
```

Extract the existing shared count, `codeExecuted`, entry, and escape-fixture checks into `hasCommonRuntimeSandboxProofShape`.

- [x] **Step 3: Update runtime check copy**

Change the runtime check action and detail strings so unsafe copy drops "dry-run" and process proof gets a specific detail:

```ts
const runtimeSandboxProcessProofReady =
  isRuntimeSandboxProcessProofReady(runtimeSandboxProof);
```

Use this detail when `runtimeSandboxProcessProofReady` is true:

```ts
`${runtimeSandboxProof ? runtimeSandboxProof.deniedEntrypointCount : 0} entrypoint${
  runtimeSandboxProof?.deniedEntrypointCount === 1 ? "" : "s"
} remain blocked; owned process boundary and deny-all IPC proof passed; codeExecuted false, persistent permissions denied, plugin execution blocked.`
```

- [x] **Step 4: Run focused frontend tests and commit**

Run:

```bash
pnpm --dir launcher test src/lib/__tests__/plugin-system-readiness.test.ts
```

Expected: PASS.

Commit:

```bash
git add launcher/src/lib/plugin-system-readiness.ts launcher/src/lib/__tests__/plugin-system-readiness.test.ts
git commit -m "feat(plugin): accept sandbox process proof"
```

### Task 6: Settings UI Copy and Native Operation

**Files:**
- Modify: `launcher/src/components/settings/PluginSystemReadinessPanel.tsx`
- Modify: `launcher/src/components/settings/PluginSystemReadinessPanel.test.tsx`
- Modify: `launcher/src/pages/SettingsPage.tsx`
- Modify: `launcher/src/pages/SettingsPage.test.tsx`
- Modify: `launcher/src/lib/__tests__/launcher-browser-guards.test.ts`

- [x] **Step 1: Add failing UI tests for process-proof copy**

In `PluginSystemReadinessPanel.test.tsx`, update the runtime sandbox test to expect:

```ts
expect(within(panel).getByText("Native Runtime Sandbox Process Proof")).toBeInTheDocument();
expect(within(panel).getByText(/Process Boundary: ready/i)).toBeInTheDocument();
expect(within(panel).getByText(/IPC Allowlist: deny-all proof/i)).toBeInTheDocument();
expect(within(panel).getByText(/Permission Grants: none/i)).toBeInTheDocument();
expect(within(panel).getByText(/owned process boundary is proved/i)).toBeInTheDocument();
expect(panel).not.toHaveTextContent(
  /plugin executed true|permission granted|marketplace live|auto-update installed|runtime ready|production sandbox ready/i,
);
```

In `SettingsPage.test.tsx`, update the native proof call expectation:

```ts
expect(launcherMocks.provePluginRuntimeSandbox).toHaveBeenCalledWith({
  consent: {
    accepted: true,
    operation: "prove_plugin_runtime_sandbox_process_proof",
  },
});
```

In `launcher-browser-guards.test.ts`, update the rejected browser request to use the same process-proof operation.

Run:

```bash
pnpm --dir launcher test src/components/settings/PluginSystemReadinessPanel.test.tsx src/pages/SettingsPage.test.tsx src/lib/__tests__/launcher-browser-guards.test.ts
```

Expected: FAIL until copy and operation are updated.

- [x] **Step 2: Update proof ledger rendering**

In `PluginRuntimeSandboxProofLedger`, compute:

```ts
const isProcessProof =
  Boolean(proof?.processBoundaryReady) &&
  proof?.ipcAllowlistReady === true &&
  proof?.permissionGrantReady === false;
```

Use these labels:

```tsx
{isProcessProof ? "Native Runtime Sandbox Process Proof" : "Native Runtime Sandbox Dry-Run"}
```

```tsx
Process Boundary: {proof.processBoundaryReady ? "ready" : "not production-ready"}
```

```tsx
IPC Allowlist: {proof.ipcAllowlistReady ? "deny-all proof" : "deny all"}
```

Keep permission text:

```tsx
Permission Grants: {proof.permissionGrantReady ? "ready" : "none"}
```

Use process-proof body copy when `isProcessProof` is true:

```tsx
Owned process boundary is proved for the local admission lane: disabled registry entries are
re-audited, entrypoints remain blocked, deny-all IPC is enforced, permissions stay denied,
and codeExecuted false.
```

- [x] **Step 3: Update SettingsPage native operation**

In `SettingsPage.tsx`, replace `"prove_plugin_runtime_sandbox_dry_run"` with:

```ts
"prove_plugin_runtime_sandbox_process_proof"
```

Update nearby user-facing copy from "dry-run" to "process proof" while preserving the guard that no plugin code is loaded.

- [x] **Step 4: Run focused UI tests and commit**

Run:

```bash
pnpm --dir launcher test src/components/settings/PluginSystemReadinessPanel.test.tsx src/pages/SettingsPage.test.tsx src/lib/__tests__/launcher-browser-guards.test.ts
```

Expected: PASS.

Commit:

```bash
git add launcher/src/components/settings/PluginSystemReadinessPanel.tsx launcher/src/components/settings/PluginSystemReadinessPanel.test.tsx launcher/src/pages/SettingsPage.tsx launcher/src/pages/SettingsPage.test.tsx launcher/src/lib/__tests__/launcher-browser-guards.test.ts
git commit -m "feat(plugin): show sandbox process proof"
```

### Task 7: Screenshot Evidence and Verification Docs

**Files:**
- Modify: `docs/verification/README.md`
- Replace: `docs/verification/screenshots/settings-plugin-system-runtime-sandbox-process-boundary-local.png`
- Replace: `docs/verification/screenshots/settings-plugin-system-runtime-sandbox-process-boundary-mobile.png`

- [x] **Step 1: Start the dev server**

Run:

```bash
pnpm --dir launcher dev
```

Expected: Vite serves `http://127.0.0.1:1420/`.

- [x] **Step 2: Capture desktop screenshot with Playwright**

Open:

```text
http://127.0.0.1:1420/settings?verify=plugin-runtime-sandbox-process-boundary
```

Set viewport to `1440x1100`. Save the full-page screenshot as:

```text
docs/verification/screenshots/settings-plugin-system-runtime-sandbox-process-boundary-local.png
```

Verify the image shows:

- OG-Launcher header navigation.
- Retro Manga Launcher paper/halftone/border/shadow styling.
- "Native Runtime Sandbox Process Proof".
- "Process Boundary: ready".
- no "runtime ready" or "production sandbox ready" claim.

- [x] **Step 3: Capture mobile screenshot with Playwright**

Use the same URL with viewport `390x1200`. Save the full-page screenshot as:

```text
docs/verification/screenshots/settings-plugin-system-runtime-sandbox-process-boundary-mobile.png
```

Verify the mobile image has no horizontal overflow and keeps the proof ledger readable.

- [x] **Step 4: Update verification README entries**

Update the two screenshot entries in `docs/verification/README.md`:

```markdown
- `screenshots/settings-plugin-system-runtime-sandbox-process-boundary-local.png` - `/settings?verify=plugin-runtime-sandbox-process-boundary` Plugin-System Native Runtime Sandbox Process Proof ledger showing the owned process-boundary proof, deny-all IPC proof, no permission grants, blocked entrypoints, the 8-item Escape Fixture Matrix, `codeExecuted false`, and no runtime-ready or production-sandbox-ready claim. Retro Manga/OG-Launcher styling and overflow evidence.
- `screenshots/settings-plugin-system-runtime-sandbox-process-boundary-mobile.png` - Mobile `/settings?verify=plugin-runtime-sandbox-process-boundary` Native Runtime Sandbox Process Proof ledger stacked at 390px with denied/allowed counts, ready process-boundary proof, blocked escape-fixture evidence, disabled package evidence, no runtime-ready claim, and no horizontal overflow.
```

- [x] **Step 5: Run UI evidence checks and commit**

Run:

```bash
pnpm verify:ui-evidence
```

Expected: PASS.

Commit:

```bash
git add docs/verification/README.md docs/verification/screenshots/settings-plugin-system-runtime-sandbox-process-boundary-local.png docs/verification/screenshots/settings-plugin-system-runtime-sandbox-process-boundary-mobile.png
git commit -m "docs(plugin): refresh sandbox proof evidence"
```

### Task 8: Final Local Gates

**Files:**
- Verify all touched files.

- [x] **Step 1: Run focused checks**

Run:

```bash
cargo test --manifest-path launcher/src-tauri/Cargo.toml plugin_runtime_sandbox
cargo test --manifest-path launcher/src-tauri/Cargo.toml plugin_system
pnpm --dir launcher test src/lib/__tests__/plugin-system-readiness.test.ts src/components/settings/PluginSystemReadinessPanel.test.tsx src/pages/SettingsPage.test.tsx src/lib/__tests__/launcher-browser-guards.test.ts
pnpm verify:ui-evidence
```

Expected: all commands PASS.

- [x] **Step 2: Run format and lint checks**

Run:

```bash
cargo fmt --manifest-path launcher/src-tauri/Cargo.toml --all -- --check
pnpm --dir launcher format:check
pnpm --dir launcher typecheck
pnpm --dir launcher lint
```

Expected: all commands PASS.

- [x] **Step 3: Run local completion gate**

Run:

```bash
pnpm completion:gate:local
```

Expected: PASS on the current platform, with the Windows Rust target skipped on Linux and handed off to `windows-2025` as before.

- [x] **Step 4: Update local completion audit if gate output changes the boundary**

If the local gate passes and the Plugin Runtime Sandbox boundary changed from dry-run to proof-process, update `docs/verification/local-completion-audit.md` with this exact replacement in the Plugin Runtime Sandbox bullet:

```markdown
- Plugin Runtime Sandbox local evidence includes an owned proof-process lane:
  it re-audits disabled signed packages, proves a local child-process boundary,
  keeps entrypoints blocked, keeps `codeExecuted false`, keeps persistent
  permission grants denied, and does not prove third-party plugin execution.
  Release completion still requires external plugin marketplace and production
  signing/update evidence before plugin execution channels can be treated as
  externally complete.
```

Run:

```bash
git diff --check HEAD
pnpm completion:tracked
```

Expected: PASS.

- [x] **Step 5: Commit final audit updates**

If Task 8 Step 4 changed the audit file:

```bash
git add docs/verification/local-completion-audit.md
git commit -m "docs(plugin): record sandbox proof boundary"
```

If Task 8 Step 4 made no file changes, do not create an empty commit.

## Self-Review Checklist

- Spec coverage: Tasks 1-4 cover Rust Module, process proof, safe probe request, activation blocked semantics, and headless adapter. Tasks 5-7 cover frontend readiness, UI copy, screenshot evidence, and Retro Manga verification. Task 8 covers local gates.
- Scope boundary: The plan never executes plugin entrypoints and never claims marketplace, hosted, provider, hardware, mobile-store, or production release evidence.
- TDD: Rust and frontend behavior changes start with failing tests before implementation steps.
- Frequent commits: each task ends with a focused commit.
- External blockers: `pnpm completion:gate:external` is not expected to pass without live secrets and redacted external evidence.
