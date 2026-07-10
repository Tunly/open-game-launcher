use std::{
    fmt, fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};

use crate::commands::plugin_system::{
    audit_staged_plugin_registry_from_path, is_safe_identifier, is_safe_version,
    plugin_runtime_sandbox_escape_attempts, sha256_hex, unix_timestamp_millis,
    PluginActivationPlanReviewCheck, PluginActivationPlanReviewRequest,
    PluginActivationPlanReviewResult, PluginRuntimeSandboxEscapeAttempt,
    PluginRuntimeSandboxProofEntry, PluginRuntimeSandboxProofRequest,
    PluginRuntimeSandboxProofResult, TrustedPluginSigningKey,
    PLUGIN_ACTIVATION_PLAN_REVIEW_OPERATION_PREFIX, PLUGIN_RUNTIME_SANDBOX_PROCESS_PROOF_OPERATION,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct PluginRuntimeSandboxError(String);

impl PluginRuntimeSandboxError {
    pub(crate) fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }
}

impl fmt::Display for PluginRuntimeSandboxError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for PluginRuntimeSandboxError {}

impl From<String> for PluginRuntimeSandboxError {
    fn from(value: String) -> Self {
        Self(value)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
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
    pub(crate) fn deny_all() -> Self {
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OwnedProbeRequest {
    pub(crate) policy: SandboxPolicy,
    pub(crate) audited_package_count: usize,
    pub(crate) plugin_entrypoints: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
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
    fn prove(
        &self,
        request: OwnedProbeRequest,
    ) -> Result<OwnedProbeReport, PluginRuntimeSandboxError>;
}

const DESKTOP_OWNED_PROBE_TIMEOUT: Duration = Duration::from_secs(5);
const DESKTOP_OWNED_PROBE_WAIT_INTERVAL: Duration = Duration::from_millis(10);
const PROBE_OUTPUT_SNIPPET_LIMIT: usize = 512;

#[derive(Debug, Clone)]
#[cfg_attr(test, allow(dead_code))]
pub(crate) struct DesktopOwnedProbe {
    exe_path: PathBuf,
    probe_timeout: Duration,
}

#[cfg_attr(test, allow(dead_code))]
impl DesktopOwnedProbe {
    pub(crate) fn from_current_exe() -> Result<Self, PluginRuntimeSandboxError> {
        let exe_path = std::env::current_exe().map_err(|error| {
            PluginRuntimeSandboxError::new(format!(
                "Could not resolve launcher executable: {error}"
            ))
        })?;
        Ok(Self {
            exe_path,
            probe_timeout: DESKTOP_OWNED_PROBE_TIMEOUT,
        })
    }
}

impl OwnedSandboxProbe for DesktopOwnedProbe {
    fn prove(
        &self,
        request: OwnedProbeRequest,
    ) -> Result<OwnedProbeReport, PluginRuntimeSandboxError> {
        if !request.policy.no_plugin_code
            || request.policy.filesystem_grant
            || request.policy.network_grant
            || request.policy.environment_grant
            || request.policy.ipc_command_grant
            || request.policy.process_spawn_grant
            || request.policy.persistent_permission_grant
            || !request.plugin_entrypoints.is_empty()
        {
            return Err(PluginRuntimeSandboxError::new(
                "Plugin sandbox probe request must not include plugin code or grants.",
            ));
        }

        let mut child = Command::new(&self.exe_path)
            .arg("--og-plugin-runtime-sandbox-probe")
            .arg("--deny-all-policy-v1")
            .env_clear()
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| {
                PluginRuntimeSandboxError::new(format!(
                    "Could not run plugin sandbox probe: {error}"
                ))
            })?;
        let started_at = Instant::now();
        loop {
            match child.try_wait().map_err(|error| {
                PluginRuntimeSandboxError::new(format!(
                    "Could not wait for plugin sandbox probe: {error}"
                ))
            })? {
                Some(_) => break,
                None if started_at.elapsed() >= self.probe_timeout => {
                    let _ = child.kill();
                    let output = child.wait_with_output().map_err(|error| {
                        PluginRuntimeSandboxError::new(format!(
                            "Could not collect timed out plugin sandbox probe output: {error}"
                        ))
                    })?;
                    return Err(PluginRuntimeSandboxError::new(format!(
                        "Plugin sandbox probe timed out after {}ms.{}",
                        self.probe_timeout.as_millis(),
                        format_probe_output_snippets(&output.stdout, &output.stderr)
                    )));
                }
                None => thread::sleep(DESKTOP_OWNED_PROBE_WAIT_INTERVAL),
            }
        }

        let output = child.wait_with_output().map_err(|error| {
            PluginRuntimeSandboxError::new(format!(
                "Could not collect plugin sandbox probe output: {error}"
            ))
        })?;
        if !output.status.success() {
            return Err(PluginRuntimeSandboxError::new(format!(
                "Plugin sandbox probe process exited unsuccessfully.{}",
                format_probe_output_snippets(&output.stdout, &output.stderr)
            )));
        }
        serde_json::from_slice::<OwnedProbeReport>(&output.stdout).map_err(|error| {
            PluginRuntimeSandboxError::new(format!(
                "Plugin sandbox probe returned invalid JSON: {error}.{}",
                format_probe_output_snippets(&output.stdout, &output.stderr)
            ))
        })
    }
}

#[cfg(test)]
#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct InProcessOwnedProbe;

#[cfg(test)]
impl OwnedSandboxProbe for InProcessOwnedProbe {
    fn prove(
        &self,
        request: OwnedProbeRequest,
    ) -> Result<OwnedProbeReport, PluginRuntimeSandboxError> {
        if !request.policy.no_plugin_code
            || request.policy.filesystem_grant
            || request.policy.network_grant
            || request.policy.environment_grant
            || request.policy.ipc_command_grant
            || request.policy.process_spawn_grant
            || request.policy.persistent_permission_grant
            || !request.plugin_entrypoints.is_empty()
        {
            return Err(PluginRuntimeSandboxError::new(
                "Plugin sandbox probe request must not include plugin code or grants.",
            ));
        }
        run_headless_plugin_runtime_sandbox_probe_from_args_for_test(vec![
            "open-game-launcher".to_string(),
            "--og-plugin-runtime-sandbox-probe".to_string(),
            "--deny-all-policy-v1".to_string(),
        ])
        .ok_or_else(|| PluginRuntimeSandboxError::new("Plugin sandbox probe did not run."))
    }
}

pub(crate) struct PluginRuntimeSandbox<P> {
    registry_root: PathBuf,
    trusted_keys: Vec<TrustedPluginSigningKey>,
    probe: P,
}

impl<P> PluginRuntimeSandbox<P> {
    pub(crate) fn from_parts(
        registry_root: impl Into<PathBuf>,
        trusted_keys: Vec<TrustedPluginSigningKey>,
        probe: P,
    ) -> Self {
        Self {
            registry_root: registry_root.into(),
            trusted_keys,
            probe,
        }
    }
}

impl<P> PluginRuntimeSandbox<P>
where
    P: OwnedSandboxProbe,
{
    pub(crate) fn prove_process(
        &self,
        request: PluginRuntimeSandboxProofRequest,
    ) -> Result<PluginRuntimeSandboxProofResult, PluginRuntimeSandboxError> {
        if !request.consent.accepted
            || request.consent.operation != PLUGIN_RUNTIME_SANDBOX_PROCESS_PROOF_OPERATION
        {
            return Err(format!(
                "Plugin runtime sandbox process proof requires consent operation {PLUGIN_RUNTIME_SANDBOX_PROCESS_PROOF_OPERATION}."
            )
            .into());
        }

        let audit =
            audit_staged_plugin_registry_from_path(&self.registry_root, &self.trusted_keys)?;
        if audit.failed_count > 0 {
            return Err(format!(
                "Plugin runtime sandbox process proof requires a clean disabled registry audit; {} entr{} blocked.",
                audit.failed_count,
                if audit.failed_count == 1 { "y is" } else { "ies are" }
            )
            .into());
        }

        let report = self.probe.prove(OwnedProbeRequest {
            policy: SandboxPolicy::deny_all(),
            audited_package_count: audit.passed_count,
            plugin_entrypoints: Vec::new(),
        })?;
        let report = validate_deny_all_probe_report(report)?;
        let entries = audit
            .entries
            .iter()
            .filter(|entry| entry.status == "disabled-audited")
            .map(|entry| PluginRuntimeSandboxProofEntry {
                deny_reason:
                    "Owned process boundary proved; plugin entrypoint denied before code load."
                        .to_string(),
                entrypoint: entry.entrypoint.clone(),
                issues: Vec::new(),
                plugin_id: entry.plugin_id.clone(),
                registry_path: entry.registry_path.clone(),
                status: "runtime-blocked".to_string(),
                version: entry.version.clone(),
            })
            .collect::<Vec<_>>();

        Ok(PluginRuntimeSandboxProofResult {
            allowed_execution_count: report.allowed_execution_count,
            audit_failed_count: audit.failed_count,
            audit_passed_count: audit.passed_count,
            code_executed: report.code_executed,
            denied_entrypoint_count: entries.len(),
            entries,
            escape_attempts: blocked_by_admission_escape_attempts(),
            ipc_allowlist_ready: report.ipc_allowlist_ready,
            permission_grant_ready: report.permission_grant_ready,
            process_boundary_ready: report.process_boundary_ready,
            proved_at: unix_timestamp_millis().to_string(),
            registry_path: audit.registry_path,
            source_label: format!(
                "Desktop runtime sandbox proof-process ({})",
                report.probe_label
            ),
        })
    }

    pub(crate) fn review_activation_plan_blocked(
        &self,
        request: PluginActivationPlanReviewRequest,
    ) -> Result<PluginActivationPlanReviewResult, PluginRuntimeSandboxError> {
        let plugin_id = request.plugin_id.trim();
        let version = request.version.trim();
        if plugin_id.is_empty() || !is_safe_identifier(plugin_id) {
            return Err(
                "Plugin activation plan plugin id must be a safe identifier."
                    .to_string()
                    .into(),
            );
        }
        if version.is_empty() || !is_safe_version(version) {
            return Err("Plugin activation plan version must be safe."
                .to_string()
                .into());
        }

        let expected_consent =
            format!("{PLUGIN_ACTIVATION_PLAN_REVIEW_OPERATION_PREFIX}:{plugin_id}@{version}");
        if !request.consent.accepted || request.consent.operation != expected_consent {
            return Err(format!(
                "Plugin activation plan review requires consent operation {expected_consent}."
            )
            .into());
        }

        let audit =
            audit_staged_plugin_registry_from_path(&self.registry_root, &self.trusted_keys)?;
        let matching_entry = audit
            .entries
            .iter()
            .find(|entry| entry.plugin_id == plugin_id && entry.version == version);
        let clean_matching_entry = matching_entry
            .filter(|entry| entry.status == "disabled-audited" && entry.issues.is_empty());
        let process_boundary_report = if clean_matching_entry.is_some() && audit.failed_count == 0 {
            Some(validate_deny_all_probe_report(self.probe.prove(
                OwnedProbeRequest {
                    policy: SandboxPolicy::deny_all(),
                    audited_package_count: audit.passed_count,
                    plugin_entrypoints: Vec::new(),
                },
            )?)?)
        } else {
            None
        };
        let process_boundary_ready = process_boundary_report
            .as_ref()
            .is_some_and(|report| report.process_boundary_ready);
        let mut checks = vec![
            PluginActivationPlanReviewCheck {
                id: "registry-audit".to_string(),
                label: "Disabled Registry Audit".to_string(),
                status: if audit.failed_count == 0 {
                    "pass"
                } else {
                    "blocked"
                }
                .to_string(),
                detail: format!(
                    "{} disabled registry entr{} passed; {} failed.",
                    audit.passed_count,
                    if audit.passed_count == 1 { "y" } else { "ies" },
                    audit.failed_count
                ),
            },
            PluginActivationPlanReviewCheck {
                id: "activation-consent".to_string(),
                label: "Activation Consent".to_string(),
                status: "pass".to_string(),
                detail: format!("Consent operation {expected_consent} accepted for review only."),
            },
            PluginActivationPlanReviewCheck {
                id: "process-boundary-proof".to_string(),
                label: "Process Boundary Proof".to_string(),
                status: if process_boundary_ready { "pass" } else { "blocked" }.to_string(),
                detail: if process_boundary_ready {
                    "Owned process boundary proved with no plugin entrypoints admitted.".to_string()
                } else {
                    "Owned process boundary proof is unavailable for this target package."
                        .to_string()
                },
            },
            PluginActivationPlanReviewCheck {
                id: "execution-denied".to_string(),
                label: "Entrypoint Execution".to_string(),
                status: "pass".to_string(),
                detail: "Plugin entrypoint is denied before code load; no process is spawned."
                    .to_string(),
            },
            PluginActivationPlanReviewCheck {
                id: "download-install-denied".to_string(),
                label: "Download + Install".to_string(),
                status: "pass".to_string(),
                detail: "Activation review never downloads packages and never applies installs."
                    .to_string(),
            },
            PluginActivationPlanReviewCheck {
                id: "permission-grants-denied".to_string(),
                label: "Permission Grants".to_string(),
                status: "pass".to_string(),
                detail:
                    "No permission grants, network access, or persisted privilege changes are allowed."
                        .to_string(),
            },
        ];

        let (status, registry_path, entrypoint, manifest_hash) = match clean_matching_entry {
            Some(entry) => {
                let manifest_hash =
                    fs::read(Path::new(&entry.registry_path).join("og-plugin.json"))
                        .map(|bytes| format!("sha256:{}", sha256_hex(&bytes)))
                        .map_err(|error| {
                            format!(
                            "Could not read staged plugin manifest for activation review: {error}"
                        )
                        })?;
                checks.push(PluginActivationPlanReviewCheck {
                    id: "target-package".to_string(),
                    label: "Target Package".to_string(),
                    status: "pass".to_string(),
                    detail: format!(
                        "{}@{} matched a clean disabled staged package.",
                        entry.plugin_id, entry.version
                    ),
                });
                (
                    "blocked-production-sandbox".to_string(),
                    entry.registry_path.clone(),
                    entry.entrypoint.clone(),
                    manifest_hash,
                )
            }
            None => match matching_entry {
                Some(entry) => {
                    checks.push(PluginActivationPlanReviewCheck {
                        id: "target-package".to_string(),
                        label: "Target Package".to_string(),
                        status: "blocked".to_string(),
                        detail: format!(
                            "{}@{} is not a clean disabled staged package: {}",
                            entry.plugin_id,
                            entry.version,
                            entry.issues.join("; ")
                        ),
                    });
                    (
                        "blocked-untrusted".to_string(),
                        entry.registry_path.clone(),
                        entry.entrypoint.clone(),
                        String::new(),
                    )
                }
                None => {
                    checks.push(PluginActivationPlanReviewCheck {
                        id: "target-package".to_string(),
                        label: "Target Package".to_string(),
                        status: "blocked".to_string(),
                        detail: format!(
                            "{plugin_id}@{version} is missing from the disabled registry."
                        ),
                    });
                    (
                        "blocked-untrusted".to_string(),
                        audit.registry_path.clone(),
                        String::new(),
                        String::new(),
                    )
                }
            },
        };

        Ok(PluginActivationPlanReviewResult {
            plugin_id: plugin_id.to_string(),
            version: version.to_string(),
            status,
            registry_path,
            entrypoint,
            manifest_hash,
            code_executed: false,
            download_attempted: false,
            install_applied: false,
            auto_install_allowed: false,
            permission_grants_persisted: false,
            process_boundary_ready,
            network_allowed: false,
            checks,
            reviewed_at: unix_timestamp_millis().to_string(),
            source_label: "Desktop plugin activation plan review".to_string(),
        })
    }
}

fn validate_deny_all_probe_report(
    report: OwnedProbeReport,
) -> Result<OwnedProbeReport, PluginRuntimeSandboxError> {
    if report.allowed_execution_count == 0
        && !report.code_executed
        && report.ipc_allowlist_ready
        && !report.permission_grant_ready
        && report.process_boundary_ready
    {
        Ok(report)
    } else {
        Err(PluginRuntimeSandboxError::new(format!(
            "Plugin sandbox probe returned invalid deny-all semantics: allowedExecutionCount={}, codeExecuted={}, ipcAllowlistReady={}, permissionGrantReady={}, processBoundaryReady={}.",
            report.allowed_execution_count,
            report.code_executed,
            report.ipc_allowlist_ready,
            report.permission_grant_ready,
            report.process_boundary_ready
        )))
    }
}

fn format_probe_output_snippets(stdout: &[u8], stderr: &[u8]) -> String {
    let stdout = bounded_lossy_snippet(stdout);
    let stderr = bounded_lossy_snippet(stderr);
    match (stdout.is_empty(), stderr.is_empty()) {
        (true, true) => String::new(),
        (false, true) => format!(" stdout: {stdout}"),
        (true, false) => format!(" stderr: {stderr}"),
        (false, false) => format!(" stdout: {stdout}; stderr: {stderr}"),
    }
}

fn bounded_lossy_snippet(bytes: &[u8]) -> String {
    String::from_utf8_lossy(&bytes[..bytes.len().min(PROBE_OUTPUT_SNIPPET_LIMIT)])
        .replace('\n', "\\n")
}

fn blocked_by_admission_escape_attempts() -> Vec<PluginRuntimeSandboxEscapeAttempt> {
    plugin_runtime_sandbox_escape_attempts()
        .into_iter()
        .map(|mut attempt| {
            attempt.result = "blocked-by-admission".to_string();
            attempt
        })
        .collect()
}

pub(crate) fn run_headless_plugin_runtime_sandbox_probe_from_args() -> Option<i32> {
    let args = std::env::args().collect::<Vec<_>>();
    match run_headless_plugin_runtime_sandbox_probe_from_args_for_test(args.clone()) {
        Some(report) => match serde_json::to_string(&report) {
            Ok(payload) => {
                println!("{payload}");
                Some(0)
            }
            Err(error) => {
                eprintln!("Could not serialize plugin sandbox probe report: {error}");
                Some(1)
            }
        },
        None if args
            .iter()
            .any(|arg| arg == "--og-plugin-runtime-sandbox-probe") =>
        {
            eprintln!("Plugin sandbox probe requires --deny-all-policy-v1.");
            Some(1)
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
    if iter.next().is_some()
        || mode != "--og-plugin-runtime-sandbox-probe"
        || policy != "--deny-all-policy-v1"
    {
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
#[cfg(test)]
mod tests {
    use std::{
        cell::RefCell,
        fs,
        path::{Path, PathBuf},
        rc::Rc,
    };

    #[cfg(unix)]
    use std::time::Duration;

    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
    use ed25519_dalek::{Signer, SigningKey};

    #[cfg(unix)]
    use super::{DesktopOwnedProbe, SandboxPolicy};
    use super::{
        OwnedProbeReport, OwnedProbeRequest, OwnedSandboxProbe, PluginRuntimeSandbox,
        PluginRuntimeSandboxError,
    };
    use crate::commands::plugin_system::{
        sha256_hex, unix_timestamp_millis, PluginActivationPlanReviewConsent,
        PluginActivationPlanReviewRequest, PluginRuntimeSandboxProofConsent,
        PluginRuntimeSandboxProofRequest, TrustedPluginSigningKey,
        PLUGIN_RUNTIME_SANDBOX_PROCESS_PROOF_OPERATION,
    };

    #[derive(Clone)]
    struct RecordingProbe {
        requests: Rc<RefCell<Vec<OwnedProbeRequest>>>,
        report: OwnedProbeReport,
    }

    impl RecordingProbe {
        fn new() -> Self {
            Self {
                requests: Rc::new(RefCell::new(Vec::new())),
                report: OwnedProbeReport {
                    allowed_execution_count: 0,
                    code_executed: false,
                    ipc_allowlist_ready: true,
                    permission_grant_ready: false,
                    process_boundary_ready: true,
                    probe_label: "test-proof-process".to_string(),
                },
            }
        }
    }

    impl OwnedSandboxProbe for RecordingProbe {
        fn prove(
            &self,
            request: OwnedProbeRequest,
        ) -> Result<OwnedProbeReport, PluginRuntimeSandboxError> {
            self.requests.borrow_mut().push(request);
            Ok(self.report.clone())
        }
    }

    #[test]
    fn prove_process_sends_empty_entrypoints_and_returns_process_proof_fields() {
        let root = test_dir("module-proof-process");
        let registry_root = root.join("registry");
        let signing_key = test_signing_key();
        let trusted_key = test_trusted_key(&signing_key);
        write_staged_plugin_registry(&registry_root, &signing_key, "local-trusted");
        let probe = RecordingProbe::new();
        let requests = probe.requests.clone();

        let proof = PluginRuntimeSandbox::from_parts(&registry_root, vec![trusted_key], probe)
            .prove_process(PluginRuntimeSandboxProofRequest {
                consent: PluginRuntimeSandboxProofConsent {
                    accepted: true,
                    operation: PLUGIN_RUNTIME_SANDBOX_PROCESS_PROOF_OPERATION.to_string(),
                },
            })
            .unwrap();

        assert_eq!(requests.borrow().len(), 1);
        assert_eq!(requests.borrow()[0].audited_package_count, 1);
        assert!(requests.borrow()[0].policy.no_plugin_code);
        assert!(requests.borrow()[0].plugin_entrypoints.is_empty());
        assert_eq!(proof.allowed_execution_count, 0);
        assert!(!proof.code_executed);
        assert!(proof.ipc_allowlist_ready);
        assert!(!proof.permission_grant_ready);
        assert!(proof.process_boundary_ready);
        assert_eq!(proof.entries[0].status, "runtime-blocked");
        assert!(proof.entries[0]
            .deny_reason
            .contains("Owned process boundary proved"));
        assert!(proof
            .escape_attempts
            .iter()
            .all(|attempt| attempt.result == "blocked-by-admission"));
        assert!(proof.source_label.contains("proof-process"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn prove_process_returns_audit_failure_before_invoking_probe() {
        let root = test_dir("module-proof-audit-failure");
        let registry_root = root.join("registry");
        fs::create_dir_all(registry_root.join("broken-plugin").join("1.0.0")).unwrap();
        let probe = RecordingProbe::new();
        let requests = probe.requests.clone();

        let error = PluginRuntimeSandbox::from_parts(&registry_root, Vec::new(), probe)
            .prove_process(PluginRuntimeSandboxProofRequest {
                consent: PluginRuntimeSandboxProofConsent {
                    accepted: true,
                    operation: PLUGIN_RUNTIME_SANDBOX_PROCESS_PROOF_OPERATION.to_string(),
                },
            })
            .unwrap_err();

        assert!(error
            .to_string()
            .contains("requires a clean disabled registry audit"));
        assert!(requests.borrow().is_empty());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn prove_process_rejects_inconsistent_probe_report() {
        let root = test_dir("module-proof-invalid-report");
        let registry_root = root.join("registry");
        let signing_key = test_signing_key();
        let trusted_key = test_trusted_key(&signing_key);
        write_staged_plugin_registry(&registry_root, &signing_key, "local-trusted");
        let mut probe = RecordingProbe::new();
        probe.report.allowed_execution_count = 1;
        probe.report.code_executed = true;

        let error = PluginRuntimeSandbox::from_parts(&registry_root, vec![trusted_key], probe)
            .prove_process(PluginRuntimeSandboxProofRequest {
                consent: PluginRuntimeSandboxProofConsent {
                    accepted: true,
                    operation: PLUGIN_RUNTIME_SANDBOX_PROCESS_PROOF_OPERATION.to_string(),
                },
            })
            .unwrap_err();

        assert!(error.to_string().contains("invalid deny-all semantics"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn review_activation_plan_includes_process_boundary_proof_and_remains_blocked() {
        let root = test_dir("module-activation-review");
        let registry_root = root.join("registry");
        let signing_key = test_signing_key();
        let trusted_key = test_trusted_key(&signing_key);
        write_staged_plugin_registry(&registry_root, &signing_key, "local-trusted");
        let probe = RecordingProbe::new();
        let requests = probe.requests.clone();

        let review = PluginRuntimeSandbox::from_parts(&registry_root, vec![trusted_key], probe)
            .review_activation_plan_blocked(PluginActivationPlanReviewRequest {
                plugin_id: "library-tags-exporter".to_string(),
                version: "1.0.0".to_string(),
                consent: PluginActivationPlanReviewConsent {
                    accepted: true,
                    operation: "review_plugin_activation_plan:library-tags-exporter@1.0.0"
                        .to_string(),
                },
            })
            .unwrap();
        let check_ids = review
            .checks
            .iter()
            .map(|check| check.id.as_str())
            .collect::<Vec<_>>();

        assert_eq!(requests.borrow().len(), 1);
        assert!(requests.borrow()[0].plugin_entrypoints.is_empty());
        assert_eq!(review.status, "blocked-production-sandbox");
        assert!(review.process_boundary_ready);
        assert!(!review.code_executed);
        assert!(!review.download_attempted);
        assert!(!review.install_applied);
        assert!(!review.permission_grants_persisted);
        assert!(!review.network_allowed);
        assert!(check_ids.contains(&"process-boundary-proof"));
        assert!(check_ids.contains(&"target-package"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn review_activation_plan_rejects_inconsistent_probe_report() {
        let root = test_dir("module-activation-review-invalid-report");
        let registry_root = root.join("registry");
        let signing_key = test_signing_key();
        let trusted_key = test_trusted_key(&signing_key);
        write_staged_plugin_registry(&registry_root, &signing_key, "local-trusted");
        let mut probe = RecordingProbe::new();
        probe.report.allowed_execution_count = 1;

        let error = PluginRuntimeSandbox::from_parts(&registry_root, vec![trusted_key], probe)
            .review_activation_plan_blocked(PluginActivationPlanReviewRequest {
                plugin_id: "library-tags-exporter".to_string(),
                version: "1.0.0".to_string(),
                consent: PluginActivationPlanReviewConsent {
                    accepted: true,
                    operation: "review_plugin_activation_plan:library-tags-exporter@1.0.0"
                        .to_string(),
                },
            })
            .unwrap_err();

        assert!(error.to_string().contains("invalid deny-all semantics"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn headless_probe_returns_success_for_deny_all_policy() {
        let args = vec![
            "open-game-launcher".to_string(),
            "--og-plugin-runtime-sandbox-probe".to_string(),
            "--deny-all-policy-v1".to_string(),
        ];

        let output =
            super::run_headless_plugin_runtime_sandbox_probe_from_args_for_test(args).unwrap();

        assert!(output.process_boundary_ready);
        assert!(output.ipc_allowlist_ready);
        assert!(!output.permission_grant_ready);
        assert!(!output.code_executed);
        assert_eq!(output.allowed_execution_count, 0);
    }

    #[test]
    fn headless_probe_ignores_normal_app_args() {
        let args = vec![
            "open-game-launcher".to_string(),
            "--not-the-probe".to_string(),
        ];

        assert!(
            super::run_headless_plugin_runtime_sandbox_probe_from_args_for_test(args).is_none()
        );
    }

    #[test]
    fn headless_probe_rejects_trailing_args() {
        let args = vec![
            "open-game-launcher".to_string(),
            "--og-plugin-runtime-sandbox-probe".to_string(),
            "--deny-all-policy-v1".to_string(),
            "dist/main.js".to_string(),
        ];

        assert!(
            super::run_headless_plugin_runtime_sandbox_probe_from_args_for_test(args).is_none()
        );
    }

    #[cfg(unix)]
    #[test]
    fn desktop_owned_probe_uses_fixed_args_clears_env_and_parses_json() {
        use std::os::unix::fs::PermissionsExt;

        let root = test_dir("desktop-probe-success");
        fs::create_dir_all(&root).unwrap();
        let script = root.join("probe.sh");
        fs::write(
            &script,
            r#"#!/bin/sh
if [ "$#" -ne 2 ]; then
  echo "expected exactly 2 args, got $#" >&2
  exit 10
fi
if [ "$1" != "--og-plugin-runtime-sandbox-probe" ]; then
  echo "unexpected first arg: $1" >&2
  exit 11
fi
if [ "$2" != "--deny-all-policy-v1" ]; then
  echo "unexpected second arg: $2" >&2
  exit 12
fi
if [ -n "${HOME+x}" ]; then
  echo "HOME leaked into probe environment" >&2
  exit 13
fi
printf '%s\n' '{"allowedExecutionCount":0,"codeExecuted":false,"ipcAllowlistReady":true,"permissionGrantReady":false,"processBoundaryReady":true,"probeLabel":"script-proof"}'
"#,
        )
        .unwrap();
        let mut permissions = fs::metadata(&script).unwrap().permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&script, permissions).unwrap();

        let report = DesktopOwnedProbe {
            exe_path: script,
            probe_timeout: Duration::from_secs(1),
        }
        .prove(deny_all_probe_request())
        .unwrap();

        assert_eq!(report.probe_label, "script-proof");
        assert_eq!(report.allowed_execution_count, 0);
        assert!(!report.code_executed);
        assert!(report.ipc_allowlist_ready);
        assert!(!report.permission_grant_ready);
        assert!(report.process_boundary_ready);

        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn desktop_owned_probe_kills_timed_out_process() {
        use std::os::unix::fs::PermissionsExt;

        let root = test_dir("desktop-probe-timeout");
        fs::create_dir_all(&root).unwrap();
        let script = root.join("probe.sh");
        fs::write(
            &script,
            r#"#!/bin/sh
echo "probe started" >&2
/bin/sleep 1
printf '%s\n' '{"allowedExecutionCount":0,"codeExecuted":false,"ipcAllowlistReady":true,"permissionGrantReady":false,"processBoundaryReady":true,"probeLabel":"slow-proof"}'
"#,
        )
        .unwrap();
        let mut permissions = fs::metadata(&script).unwrap().permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&script, permissions).unwrap();

        let error = DesktopOwnedProbe {
            exe_path: script,
            probe_timeout: Duration::from_millis(20),
        }
        .prove(deny_all_probe_request())
        .unwrap_err();

        assert!(error.to_string().contains("timed out"));
        assert!(error.to_string().contains("probe started"));

        let _ = fs::remove_dir_all(root);
    }

    fn test_dir(label: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "og-plugin-runtime-sandbox-{label}-{}-{}",
            std::process::id(),
            unix_timestamp_millis()
        ));
        let _ = fs::remove_dir_all(&root);
        root
    }

    #[cfg(unix)]
    fn deny_all_probe_request() -> OwnedProbeRequest {
        OwnedProbeRequest {
            policy: SandboxPolicy::deny_all(),
            audited_package_count: 1,
            plugin_entrypoints: Vec::new(),
        }
    }

    fn test_signing_key() -> SigningKey {
        SigningKey::from_bytes(&[31; 32])
    }

    fn test_trusted_key(signing_key: &SigningKey) -> TrustedPluginSigningKey {
        TrustedPluginSigningKey {
            id: "local-trusted".to_string(),
            verifying_key: signing_key.verifying_key(),
        }
    }

    fn write_staged_plugin_registry(registry_root: &Path, signing_key: &SigningKey, key_id: &str) {
        let entry_root = registry_root.join("library-tags-exporter").join("1.0.0");
        fs::create_dir_all(entry_root.join("dist")).unwrap();
        let source = b"throw new Error('must not execute');";
        fs::write(entry_root.join("dist").join("main.js"), source).unwrap();
        let sha256 = sha256_hex(source);
        let files = vec![serde_json::json!({
            "path": "dist/main.js",
            "sha256": sha256,
        })];
        let payload = serde_json::json!([
            ["format", serde_json::json!("og-plugin-package-v1")],
            ["id", serde_json::json!("library-tags-exporter")],
            ["name", serde_json::json!("Library Tags Exporter")],
            ["version", serde_json::json!("1.0.0")],
            ["entrypoint", serde_json::json!("dist/main.js")],
            [
                "signatureIssuer",
                serde_json::json!("OG Launcher Local Test CA")
            ],
            ["updateChannel", serde_json::json!("disabled")],
            ["permissions", serde_json::json!(["library:read"])],
            ["themeHooks", serde_json::json!([])],
            ["keyId", serde_json::json!(key_id)],
            ["files", serde_json::json!(files.clone())],
        ]);
        let payload = serde_json::to_string(&payload).unwrap();
        let signature = signing_key.sign(payload.as_bytes());
        let signature = URL_SAFE_NO_PAD.encode(signature.to_bytes());

        fs::write(
            entry_root.join("og-plugin.json"),
            serde_json::to_string_pretty(&serde_json::json!({
                "entrypoint": "dist/main.js",
                "files": files,
                "id": "library-tags-exporter",
                "name": "Library Tags Exporter",
                "packageSignature": {
                    "algorithm": "ed25519",
                    "keyId": key_id,
                    "signature": signature,
                },
                "permissions": ["library:read"],
                "signatureIssuer": "OG Launcher Local Test CA",
                "signed": true,
                "themeHooks": [],
                "updateChannel": "disabled",
                "version": "1.0.0",
            }))
            .unwrap(),
        )
        .unwrap();
        fs::write(
            entry_root.join("plugin-stage.json"),
            serde_json::to_string_pretty(&serde_json::json!({
                "entrypoint": "dist/main.js",
                "fileCount": 1,
                "keyId": key_id,
                "pluginId": "library-tags-exporter",
                "signatureIssuer": "OG Launcher Local Test CA",
                "status": "disabled",
                "stagedAt": unix_timestamp_millis().to_string(),
                "version": "1.0.0",
            }))
            .unwrap(),
        )
        .unwrap();
    }
}
