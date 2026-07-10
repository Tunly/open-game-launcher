use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeSet,
    fs,
    path::{Component, Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

const MANIFEST_FILE_NAMES: [&str; 3] = ["og-plugin.json", "plugin.json", "manifest.json"];
const MAX_SCAN_DEPTH: usize = 2;
const MAX_MANIFEST_BYTES: u64 = 64 * 1024;
const MAX_SCANNED_ENTRIES: usize = 240;
const MAX_MANIFESTS: usize = 32;
const MAX_MARKETPLACE_UPDATE_INDEX_BYTES: u64 = 256 * 1024;
const MAX_LIST_ITEMS: usize = 32;
const MAX_ENTRYPOINT_CHARS: usize = 260;
const MAX_ID_CHARS: usize = 96;
const MAX_NAME_CHARS: usize = 96;
const MAX_SIGNATURE_ISSUER_CHARS: usize = 160;
const MAX_UPDATE_CHANNEL_CHARS: usize = 96;
const MAX_VERSION_CHARS: usize = 64;
const MAX_LIST_ITEM_CHARS: usize = 96;
const PLUGIN_TRUSTED_KEYS_ENV: &str = "OG_PLUGIN_TRUSTED_KEYS";
#[allow(dead_code)]
const PLUGIN_RUNTIME_SANDBOX_DRY_RUN_OPERATION: &str = "prove_plugin_runtime_sandbox_dry_run";
pub(crate) const PLUGIN_RUNTIME_SANDBOX_PROCESS_PROOF_OPERATION: &str =
    "prove_plugin_runtime_sandbox_process_proof";
pub(crate) const PLUGIN_ACTIVATION_PLAN_REVIEW_OPERATION_PREFIX: &str =
    "review_plugin_activation_plan";
const PLUGIN_MARKETPLACE_UPDATE_INDEX_REVIEW_OPERATION: &str =
    "review_plugin_marketplace_update_index_trust";
const PLUGIN_UPDATE_SIGNING_ENVELOPE_REVIEW_OPERATION: &str =
    "review_plugin_update_signing_envelope";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifestEvidence {
    pub entrypoint: Option<String>,
    pub id: Option<String>,
    pub name: Option<String>,
    pub permissions: Option<Vec<String>>,
    pub signature_issuer: Option<String>,
    pub signed: Option<bool>,
    pub theme_hooks: Option<Vec<String>>,
    pub update_channel: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifestDiscoveryResult {
    pub discovery_path: String,
    pub loaded_at: String,
    pub manifests: Vec<PluginManifestEvidence>,
    pub max_depth: usize,
    pub scanned_file_count: usize,
    pub skipped_entries: Vec<String>,
    pub source_label: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignedPluginPackageStageRequest {
    pub package_path: String,
    pub consent: SignedPluginPackageStageConsent,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignedPluginPackageStageConsent {
    pub accepted: bool,
    pub operation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StagedSignedPluginPackageResult {
    pub entrypoint: String,
    pub file_count: usize,
    pub key_id: String,
    pub message: String,
    pub plugin_id: String,
    pub registry_path: String,
    pub signature_issuer: String,
    pub status: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StagedPluginRegistryAuditResult {
    pub audited_at: String,
    pub entries: Vec<StagedPluginRegistryAuditEntry>,
    pub failed_count: usize,
    pub passed_count: usize,
    pub registry_path: String,
    pub source_label: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StagedPluginRegistryAuditEntry {
    pub entrypoint: String,
    pub file_count: usize,
    pub issues: Vec<String>,
    pub key_id: String,
    pub plugin_id: String,
    pub registry_path: String,
    pub signature_issuer: String,
    pub status: String,
    pub version: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginRuntimeSandboxProofRequest {
    pub consent: PluginRuntimeSandboxProofConsent,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginRuntimeSandboxProofConsent {
    pub accepted: bool,
    pub operation: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PluginRuntimeSandboxProofResult {
    pub allowed_execution_count: usize,
    pub audit_failed_count: usize,
    pub audit_passed_count: usize,
    pub code_executed: bool,
    pub denied_entrypoint_count: usize,
    pub entries: Vec<PluginRuntimeSandboxProofEntry>,
    pub escape_attempts: Vec<PluginRuntimeSandboxEscapeAttempt>,
    pub ipc_allowlist_ready: bool,
    pub permission_grant_ready: bool,
    pub process_boundary_ready: bool,
    pub proved_at: String,
    pub registry_path: String,
    pub source_label: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PluginRuntimeSandboxProofEntry {
    pub deny_reason: String,
    pub entrypoint: String,
    pub issues: Vec<String>,
    pub plugin_id: String,
    pub registry_path: String,
    pub status: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PluginRuntimeSandboxEscapeAttempt {
    pub blocked_by: String,
    pub boundary: String,
    pub id: String,
    pub label: String,
    pub payload: String,
    pub result: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginActivationPlanReviewRequest {
    pub plugin_id: String,
    pub version: String,
    pub consent: PluginActivationPlanReviewConsent,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginActivationPlanReviewConsent {
    pub accepted: bool,
    pub operation: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PluginActivationPlanReviewResult {
    pub plugin_id: String,
    pub version: String,
    pub status: String,
    pub registry_path: String,
    pub entrypoint: String,
    pub manifest_hash: String,
    pub code_executed: bool,
    pub download_attempted: bool,
    pub install_applied: bool,
    pub auto_install_allowed: bool,
    pub permission_grants_persisted: bool,
    pub process_boundary_ready: bool,
    pub network_allowed: bool,
    pub checks: Vec<PluginActivationPlanReviewCheck>,
    pub reviewed_at: String,
    pub source_label: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PluginActivationPlanReviewCheck {
    pub id: String,
    pub label: String,
    pub status: String,
    pub detail: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginMarketplaceUpdateIndexTrustReviewRequest {
    pub index_path: String,
    pub consent: PluginMarketplaceUpdateIndexTrustReviewConsent,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginMarketplaceUpdateIndexTrustReviewConsent {
    pub accepted: bool,
    pub operation: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginUpdateSigningEnvelopeReviewRequest {
    pub envelope_path: String,
    pub consent: PluginUpdateSigningEnvelopeReviewConsent,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginUpdateSigningEnvelopeReviewConsent {
    pub accepted: bool,
    pub operation: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PluginUpdateSigningEnvelopeReviewResult {
    pub auto_install_blocked: bool,
    pub entries: Vec<PluginUpdateSigningEnvelopeReviewEntry>,
    pub manifest_hash_ready: bool,
    pub reviewed_at: String,
    pub rollback_plan_ready: bool,
    pub signature_verified_count: usize,
    pub source_label: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PluginUpdateSigningEnvelopeReviewEntry {
    pub auto_install: bool,
    pub channel: String,
    pub current_version: String,
    pub issues: Vec<String>,
    pub manifest_hash: String,
    pub plugin_id: String,
    pub proposed_version: String,
    pub rollback_version: Option<String>,
    pub signature_issuer: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PluginMarketplaceUpdateIndexTrustReviewResult {
    pub auto_update_allowed: bool,
    pub blocked_count: usize,
    pub catalog_entry_count: usize,
    pub download_allowed: bool,
    pub entries: Vec<PluginMarketplaceUpdateIndexTrustReviewEntry>,
    pub index_path: String,
    pub install_allowed: bool,
    pub matched_disabled_package_count: usize,
    pub registry_path: String,
    pub revoked_count: usize,
    pub reviewed_at: String,
    pub signature_issuer: String,
    pub signature_key_id: String,
    pub signature_verified: bool,
    pub source_label: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PluginMarketplaceUpdateIndexTrustReviewEntry {
    pub channel: String,
    pub issues: Vec<String>,
    pub manifest_hash: String,
    pub moderation_status: String,
    pub plugin_id: String,
    pub registry_status: String,
    pub revoked: bool,
    pub status: String,
    pub version: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StagedPluginRegistryRecord {
    entrypoint: String,
    file_count: usize,
    key_id: String,
    plugin_id: String,
    signature_issuer: String,
    #[serde(default)]
    staged_at: Option<String>,
    status: String,
    version: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SignedPluginPackageManifest {
    entrypoint: String,
    files: Vec<SignedPluginPackageFile>,
    id: String,
    name: String,
    package_signature: SignedPluginPackageSignature,
    permissions: Option<Vec<String>>,
    signature_issuer: Option<String>,
    signed: Option<bool>,
    theme_hooks: Option<Vec<String>>,
    update_channel: Option<String>,
    version: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SignedPluginPackageSignature {
    algorithm: String,
    key_id: String,
    signature: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SignedPluginPackageFile {
    path: String,
    sha256: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SignedMarketplaceUpdateIndex {
    schema: String,
    version: u32,
    generated_at: String,
    source_label: String,
    entries: Vec<SignedMarketplaceUpdateIndexEntry>,
    index_signature: SignedMarketplaceUpdateIndexSignature,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SignedMarketplaceUpdateIndexEntry {
    plugin_id: String,
    version: String,
    channel: String,
    manifest_hash: String,
    moderation_status: String,
    revoked: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SignedMarketplaceUpdateIndexSignature {
    algorithm: String,
    key_id: String,
    signature: String,
    signature_issuer: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SignedPluginUpdateEnvelope {
    schema: String,
    version: u32,
    generated_at: String,
    source_label: String,
    entries: Vec<SignedPluginUpdateEnvelopeEntry>,
    envelope_signature: SignedPluginUpdateEnvelopeSignature,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SignedPluginUpdateEnvelopeEntry {
    plugin_id: String,
    current_version: String,
    proposed_version: String,
    channel: String,
    manifest_hash: String,
    rollback_version: Option<String>,
    auto_install: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SignedPluginUpdateEnvelopeSignature {
    algorithm: String,
    key_id: String,
    signature: String,
    signature_issuer: String,
}

#[derive(Debug, Clone)]
pub(crate) struct TrustedPluginSigningKey {
    pub(crate) id: String,
    pub(crate) verifying_key: VerifyingKey,
}

#[derive(Debug, Clone)]
struct VerifiedPluginPackageFile {
    bytes: Vec<u8>,
    relative_path: String,
    sha256: String,
}

#[tauri::command]
pub fn scan_local_plugin_manifests(
    root_path: String,
) -> Result<PluginManifestDiscoveryResult, String> {
    scan_local_plugin_manifests_from_path(Path::new(root_path.trim()))
}

#[tauri::command]
pub fn stage_signed_plugin_package(
    app: tauri::AppHandle,
    input: SignedPluginPackageStageRequest,
) -> Result<StagedSignedPluginPackageResult, String> {
    let registry_root = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve plugin registry directory: {error}"))?
        .join("plugins")
        .join("staged");
    let trusted_keys = trusted_plugin_signing_keys_from_env()?;
    stage_signed_plugin_package_from_path(
        Path::new(input.package_path.trim()),
        &registry_root,
        &trusted_keys,
        Some(input.consent.operation.as_str()).filter(|_| input.consent.accepted),
    )
}

#[tauri::command]
pub fn audit_staged_plugin_registry(
    app: tauri::AppHandle,
) -> Result<StagedPluginRegistryAuditResult, String> {
    let registry_root = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve plugin registry directory: {error}"))?
        .join("plugins")
        .join("staged");
    let trusted_keys = trusted_plugin_signing_keys_from_env()?;
    audit_staged_plugin_registry_from_path(&registry_root, &trusted_keys)
}

#[tauri::command]
pub fn prove_plugin_runtime_sandbox(
    app: tauri::AppHandle,
    input: PluginRuntimeSandboxProofRequest,
) -> Result<PluginRuntimeSandboxProofResult, String> {
    let registry_root = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve plugin registry directory: {error}"))?
        .join("plugins")
        .join("staged");
    let trusted_keys = trusted_plugin_signing_keys_from_env()?;
    prove_plugin_runtime_sandbox_from_path(
        &registry_root,
        &trusted_keys,
        Some(input.consent.operation.as_str()).filter(|_| input.consent.accepted),
    )
}

#[tauri::command]
pub fn review_plugin_activation_plan(
    app: tauri::AppHandle,
    input: PluginActivationPlanReviewRequest,
) -> Result<PluginActivationPlanReviewResult, String> {
    let registry_root = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve plugin registry directory: {error}"))?
        .join("plugins")
        .join("staged");
    let trusted_keys = trusted_plugin_signing_keys_from_env()?;
    review_plugin_activation_plan_from_path(
        &registry_root,
        &trusted_keys,
        input.plugin_id.trim(),
        input.version.trim(),
        Some(input.consent.operation.as_str()).filter(|_| input.consent.accepted),
    )
}

#[tauri::command]
pub fn review_plugin_marketplace_update_index_trust(
    app: tauri::AppHandle,
    input: PluginMarketplaceUpdateIndexTrustReviewRequest,
) -> Result<PluginMarketplaceUpdateIndexTrustReviewResult, String> {
    let registry_root = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve plugin registry directory: {error}"))?
        .join("plugins")
        .join("staged");
    let trusted_keys = trusted_plugin_signing_keys_from_env()?;
    review_plugin_marketplace_update_index_trust_from_path(
        Path::new(input.index_path.trim()),
        &registry_root,
        &trusted_keys,
        Some(input.consent.operation.as_str()).filter(|_| input.consent.accepted),
    )
}

#[tauri::command]
pub fn review_plugin_update_signing_envelope(
    app: tauri::AppHandle,
    input: PluginUpdateSigningEnvelopeReviewRequest,
) -> Result<PluginUpdateSigningEnvelopeReviewResult, String> {
    let registry_root = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve plugin registry directory: {error}"))?
        .join("plugins")
        .join("staged");
    let trusted_keys = trusted_plugin_signing_keys_from_env()?;
    review_plugin_update_signing_envelope_from_path(
        Path::new(input.envelope_path.trim()),
        &registry_root,
        &trusted_keys,
        Some(input.consent.operation.as_str()).filter(|_| input.consent.accepted),
    )
}

fn scan_local_plugin_manifests_from_path(
    root_path: &Path,
) -> Result<PluginManifestDiscoveryResult, String> {
    if root_path.as_os_str().is_empty() {
        return Err("Plugin discovery path is required.".to_string());
    }

    let root_metadata = fs::symlink_metadata(root_path).map_err(|error| {
        format!(
            "Could not inspect plugin discovery path {}: {error}",
            root_path.display()
        )
    })?;

    if root_metadata.file_type().is_symlink() {
        return Err("Plugin discovery root cannot be a symlink.".to_string());
    }

    if !root_metadata.is_dir() {
        return Err("Plugin discovery path must be a directory.".to_string());
    }

    let canonical_root = root_path.canonicalize().map_err(|error| {
        format!(
            "Could not resolve plugin discovery path {}: {error}",
            root_path.display()
        )
    })?;
    let mut scanned_file_count = 0usize;
    let mut skipped_entries = Vec::new();
    let mut manifests = Vec::new();
    let mut stack = vec![(canonical_root.clone(), 0usize)];
    let mut visited_entries = 0usize;

    while let Some((directory, depth)) = stack.pop() {
        let entries = match fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(error) => {
                skipped_entries.push(format!("{}: read failed: {error}", directory.display()));
                continue;
            }
        };

        for entry in entries {
            if visited_entries >= MAX_SCANNED_ENTRIES {
                skipped_entries.push(format!(
                    "Scan stopped after {MAX_SCANNED_ENTRIES} filesystem entries."
                ));
                stack.clear();
                break;
            }
            visited_entries += 1;

            let entry = match entry {
                Ok(entry) => entry,
                Err(error) => {
                    skipped_entries.push(format!("Unreadable directory entry: {error}"));
                    continue;
                }
            };
            let path = entry.path();
            let metadata = match fs::symlink_metadata(&path) {
                Ok(metadata) => metadata,
                Err(error) => {
                    skipped_entries.push(format!("{}: metadata failed: {error}", path.display()));
                    continue;
                }
            };

            if metadata.file_type().is_symlink() {
                skipped_entries.push(format!("{}: symlink skipped", path.display()));
                continue;
            }

            if metadata.is_dir() {
                if depth < MAX_SCAN_DEPTH {
                    stack.push((path, depth + 1));
                }
                continue;
            }

            if !metadata.is_file() || !is_manifest_file_name(&path) {
                continue;
            }

            scanned_file_count += 1;
            if manifests.len() >= MAX_MANIFESTS {
                skipped_entries.push(format!("{}: manifest limit reached", path.display()));
                continue;
            }
            if metadata.len() > MAX_MANIFEST_BYTES {
                skipped_entries.push(format!(
                    "{}: manifest exceeds {} bytes",
                    path.display(),
                    MAX_MANIFEST_BYTES
                ));
                continue;
            }

            match fs::read_to_string(&path) {
                Ok(contents) => match serde_json::from_str::<PluginManifestEvidence>(&contents) {
                    Ok(manifest) => manifests.push(normalize_manifest_evidence(manifest)),
                    Err(error) => {
                        skipped_entries.push(format!("{}: invalid JSON: {error}", path.display()))
                    }
                },
                Err(error) => {
                    skipped_entries.push(format!("{}: read failed: {error}", path.display()))
                }
            }
        }
    }

    Ok(PluginManifestDiscoveryResult {
        discovery_path: canonical_root.display().to_string(),
        loaded_at: unix_timestamp_millis().to_string(),
        manifests,
        max_depth: MAX_SCAN_DEPTH,
        scanned_file_count,
        skipped_entries,
        source_label: "Desktop read-only scan".to_string(),
    })
}

fn is_manifest_file_name(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| {
            MANIFEST_FILE_NAMES
                .iter()
                .any(|candidate| name.eq_ignore_ascii_case(candidate))
        })
        .unwrap_or(false)
}

fn normalize_manifest_evidence(manifest: PluginManifestEvidence) -> PluginManifestEvidence {
    PluginManifestEvidence {
        entrypoint: normalize_string(manifest.entrypoint, MAX_ENTRYPOINT_CHARS),
        id: normalize_string(manifest.id, MAX_ID_CHARS),
        name: normalize_string(manifest.name, MAX_NAME_CHARS),
        permissions: normalize_string_list(manifest.permissions),
        signature_issuer: normalize_string(manifest.signature_issuer, MAX_SIGNATURE_ISSUER_CHARS),
        signed: manifest.signed,
        theme_hooks: normalize_string_list(manifest.theme_hooks),
        update_channel: normalize_string(manifest.update_channel, MAX_UPDATE_CHANNEL_CHARS),
        version: normalize_string(manifest.version, MAX_VERSION_CHARS),
    }
}

fn normalize_string(value: Option<String>, max_chars: usize) -> Option<String> {
    let trimmed = value?.trim().to_string();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.chars().take(max_chars).collect())
}

fn normalize_string_list(values: Option<Vec<String>>) -> Option<Vec<String>> {
    let mut normalized: Vec<String> = values?
        .into_iter()
        .filter_map(|value| normalize_string(Some(value), MAX_LIST_ITEM_CHARS))
        .take(MAX_LIST_ITEMS)
        .collect();
    normalized.sort();
    normalized.dedup();
    Some(normalized)
}

pub(crate) fn unix_timestamp_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn stage_signed_plugin_package_from_path(
    package_root: &Path,
    registry_root: &Path,
    trusted_keys: &[TrustedPluginSigningKey],
    consent_operation: Option<&str>,
) -> Result<StagedSignedPluginPackageResult, String> {
    if package_root.as_os_str().is_empty() {
        return Err("Plugin package path is required.".to_string());
    }
    let package_metadata = fs::symlink_metadata(package_root).map_err(|error| {
        format!(
            "Could not inspect plugin package path {}: {error}",
            package_root.display()
        )
    })?;
    if package_metadata.file_type().is_symlink() {
        return Err("Plugin package root cannot be a symlink.".to_string());
    }
    if !package_metadata.is_dir() {
        return Err("Plugin package path must be a directory.".to_string());
    }

    let package_root = package_root.canonicalize().map_err(|error| {
        format!(
            "Could not resolve plugin package path {}: {error}",
            package_root.display()
        )
    })?;
    let manifest_path = find_package_manifest_path(&package_root)?;
    let manifest_contents = fs::read_to_string(&manifest_path)
        .map_err(|error| format!("Could not read plugin package manifest: {error}"))?;
    let manifest: SignedPluginPackageManifest = serde_json::from_str(&manifest_contents)
        .map_err(|error| format!("Plugin package manifest is not valid JSON: {error}"))?;

    validate_signed_plugin_manifest(&manifest)?;
    let plugin_id = manifest.id.trim();
    let version = manifest.version.trim();
    let expected_consent = format!("stage_plugin_package:{plugin_id}@{version}");
    if consent_operation != Some(expected_consent.as_str()) {
        return Err(format!(
            "Plugin package staging requires consent operation {expected_consent}."
        ));
    }

    let verified_files = verify_plugin_package_files(&package_root, &manifest)?;
    if !verified_files
        .iter()
        .any(|file| file.relative_path == manifest.entrypoint.trim())
    {
        return Err("Plugin package entrypoint must be included in signed file list.".to_string());
    }

    let trusted_key = trusted_keys
        .iter()
        .find(|key| key.id == manifest.package_signature.key_id.trim())
        .ok_or_else(|| {
            format!(
                "Plugin package was signed by unknown trusted signing key {}.",
                manifest.package_signature.key_id.trim()
            )
        })?;
    verify_plugin_package_signature(&manifest, &verified_files, trusted_key)?;

    let registry_root = prepare_plugin_registry_root(registry_root)?;
    let target_root = create_safe_registry_target(&registry_root, plugin_id, version)?;

    for file in &verified_files {
        let target_path = safe_join_relative(&target_root, &file.relative_path)?;
        if let Some(parent) = target_path.parent() {
            create_safe_directory_tree(&target_root, parent)
                .map_err(|error| format!("Could not create plugin file directory: {error}"))?;
        }
        fs::write(&target_path, &file.bytes).map_err(|error| {
            format!(
                "Could not stage plugin file {}: {error}",
                file.relative_path
            )
        })?;
    }
    fs::write(target_root.join("og-plugin.json"), manifest_contents)
        .map_err(|error| format!("Could not stage plugin manifest: {error}"))?;
    let stage_record = serde_json::json!({
        "entrypoint": manifest.entrypoint.trim(),
        "fileCount": verified_files.len(),
        "keyId": trusted_key.id,
        "pluginId": plugin_id,
        "signatureIssuer": manifest.signature_issuer.as_deref().unwrap_or("unknown"),
        "status": "disabled",
        "stagedAt": unix_timestamp_millis().to_string(),
        "version": version
    });
    fs::write(
        target_root.join("plugin-stage.json"),
        serde_json::to_string_pretty(&stage_record).unwrap_or_else(|_| "{}".to_string()),
    )
    .map_err(|error| format!("Could not write plugin stage record: {error}"))?;

    Ok(StagedSignedPluginPackageResult {
        entrypoint: manifest.entrypoint.trim().to_string(),
        file_count: verified_files.len(),
        key_id: trusted_key.id.clone(),
        message: "Signed plugin package staged as disabled; no plugin code was executed."
            .to_string(),
        plugin_id: plugin_id.to_string(),
        registry_path: target_root.display().to_string(),
        signature_issuer: manifest
            .signature_issuer
            .as_deref()
            .unwrap_or("unknown")
            .trim()
            .to_string(),
        status: "disabled".to_string(),
        version: version.to_string(),
    })
}

pub(crate) fn audit_staged_plugin_registry_from_path(
    registry_root: &Path,
    trusted_keys: &[TrustedPluginSigningKey],
) -> Result<StagedPluginRegistryAuditResult, String> {
    let audited_at = unix_timestamp_millis().to_string();
    reject_existing_symlink_components(registry_root)?;

    let root_metadata = match fs::symlink_metadata(registry_root) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(StagedPluginRegistryAuditResult {
                audited_at,
                entries: Vec::new(),
                failed_count: 0,
                passed_count: 0,
                registry_path: registry_root.display().to_string(),
                source_label: "Desktop disabled registry audit".to_string(),
            });
        }
        Err(error) => {
            return Err(format!(
                "Could not inspect plugin registry directory {}: {error}",
                registry_root.display()
            ));
        }
    };

    if root_metadata.file_type().is_symlink() {
        return Err("Plugin registry directory cannot be a symlink.".to_string());
    }
    if !root_metadata.is_dir() {
        return Err("Plugin registry path must be a directory.".to_string());
    }

    let canonical_root = registry_root
        .canonicalize()
        .map_err(|error| format!("Could not resolve plugin registry directory: {error}"))?;
    let mut entries = Vec::new();

    for plugin_entry in sorted_directory_entries(&canonical_root)? {
        let plugin_path = plugin_entry.path();
        let plugin_id = plugin_entry.file_name().to_string_lossy().to_string();
        let Ok(metadata) = fs::symlink_metadata(&plugin_path) else {
            entries.push(blocked_registry_audit_entry(
                plugin_id,
                String::new(),
                plugin_path.display().to_string(),
                "Could not inspect plugin registry plugin directory.".to_string(),
            ));
            continue;
        };
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            entries.push(blocked_registry_audit_entry(
                plugin_id,
                String::new(),
                plugin_path.display().to_string(),
                "Plugin registry plugin directory must be a real directory, not a symlink."
                    .to_string(),
            ));
            continue;
        }

        for version_entry in sorted_directory_entries(&plugin_path)? {
            let version_path = version_entry.path();
            let version = version_entry.file_name().to_string_lossy().to_string();
            entries.push(audit_staged_plugin_registry_entry(
                &canonical_root,
                &version_path,
                &plugin_id,
                &version,
                trusted_keys,
            ));
        }
    }

    let passed_count = entries
        .iter()
        .filter(|entry| entry.status == "disabled-audited")
        .count();
    let failed_count = entries.len().saturating_sub(passed_count);

    Ok(StagedPluginRegistryAuditResult {
        audited_at,
        entries,
        failed_count,
        passed_count,
        registry_path: canonical_root.display().to_string(),
        source_label: "Desktop disabled registry audit".to_string(),
    })
}

fn prove_plugin_runtime_sandbox_from_path(
    registry_root: &Path,
    trusted_keys: &[TrustedPluginSigningKey],
    consent_operation: Option<&str>,
) -> Result<PluginRuntimeSandboxProofResult, String> {
    let operation = consent_operation.unwrap_or_default().to_string();
    #[cfg(test)]
    let probe = crate::commands::plugin_runtime_sandbox::InProcessOwnedProbe;
    #[cfg(not(test))]
    let probe = crate::commands::plugin_runtime_sandbox::DesktopOwnedProbe::from_current_exe()
        .map_err(|error| error.to_string())?;
    let sandbox = crate::commands::plugin_runtime_sandbox::PluginRuntimeSandbox::from_parts(
        registry_root.to_path_buf(),
        trusted_keys.to_vec(),
        probe,
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

pub(crate) fn plugin_runtime_sandbox_escape_attempts() -> Vec<PluginRuntimeSandboxEscapeAttempt> {
    vec![
        PluginRuntimeSandboxEscapeAttempt {
            blocked_by: "entrypoint path containment".to_string(),
            boundary: "path".to_string(),
            id: "path-traversal-entrypoint".to_string(),
            label: "Path Traversal Entrypoint".to_string(),
            payload: "../secrets/token.txt".to_string(),
            result: "blocked-before-code-load".to_string(),
        },
        PluginRuntimeSandboxEscapeAttempt {
            blocked_by: "deny-all IPC allowlist".to_string(),
            boundary: "ipc".to_string(),
            id: "ipc-open-shell".to_string(),
            label: "Deny-All IPC Invoke".to_string(),
            payload: "tauri.invoke('open_shell')".to_string(),
            result: "blocked-before-code-load".to_string(),
        },
        PluginRuntimeSandboxEscapeAttempt {
            blocked_by: "no environment grants".to_string(),
            boundary: "environment".to_string(),
            id: "environment-secret-read".to_string(),
            label: "Environment Secret Read".to_string(),
            payload: "process.env.OG_SECRET".to_string(),
            result: "blocked-before-code-load".to_string(),
        },
        PluginRuntimeSandboxEscapeAttempt {
            blocked_by: "disabled registry read-only containment".to_string(),
            boundary: "filesystem".to_string(),
            id: "filesystem-host-write".to_string(),
            label: "Filesystem Host Write".to_string(),
            payload: "/etc/hosts".to_string(),
            result: "blocked-before-code-load".to_string(),
        },
        PluginRuntimeSandboxEscapeAttempt {
            blocked_by: "registry symlink ancestor rejection".to_string(),
            boundary: "filesystem".to_string(),
            id: "filesystem-symlink-entrypoint".to_string(),
            label: "Symlink Entrypoint Escape".to_string(),
            payload: "dist/linked-main.js -> /tmp/escape.js".to_string(),
            result: "blocked-before-code-load".to_string(),
        },
        PluginRuntimeSandboxEscapeAttempt {
            blocked_by: "manifest path normalization".to_string(),
            boundary: "path".to_string(),
            id: "manifest-nested-path-escape".to_string(),
            label: "Nested Manifest Path Escape".to_string(),
            payload: "plugins/../manifest.json".to_string(),
            result: "blocked-before-code-load".to_string(),
        },
        PluginRuntimeSandboxEscapeAttempt {
            blocked_by: "network IPC allowlist is empty".to_string(),
            boundary: "ipc".to_string(),
            id: "ipc-network-fetch".to_string(),
            label: "Network IPC Fetch".to_string(),
            payload: "tauri.invoke('fetch_url', 'https://plugins.example')".to_string(),
            result: "blocked-before-code-load".to_string(),
        },
        PluginRuntimeSandboxEscapeAttempt {
            blocked_by: "deny-by-default permission ledger".to_string(),
            boundary: "permission".to_string(),
            id: "permission-process-spawn".to_string(),
            label: "Permission Escalation".to_string(),
            payload: "process:spawn".to_string(),
            result: "blocked-before-code-load".to_string(),
        },
    ]
}

fn review_plugin_activation_plan_from_path(
    registry_root: &Path,
    trusted_keys: &[TrustedPluginSigningKey],
    plugin_id: &str,
    version: &str,
    consent_operation: Option<&str>,
) -> Result<PluginActivationPlanReviewResult, String> {
    let operation = consent_operation.unwrap_or_default().to_string();
    #[cfg(test)]
    let probe = crate::commands::plugin_runtime_sandbox::InProcessOwnedProbe;
    #[cfg(not(test))]
    let probe = crate::commands::plugin_runtime_sandbox::DesktopOwnedProbe::from_current_exe()
        .map_err(|error| error.to_string())?;
    let sandbox = crate::commands::plugin_runtime_sandbox::PluginRuntimeSandbox::from_parts(
        registry_root.to_path_buf(),
        trusted_keys.to_vec(),
        probe,
    );
    sandbox
        .review_activation_plan_blocked(PluginActivationPlanReviewRequest {
            plugin_id: plugin_id.to_string(),
            version: version.to_string(),
            consent: PluginActivationPlanReviewConsent {
                accepted: !operation.is_empty(),
                operation,
            },
        })
        .map_err(|error| error.to_string())
}

fn review_plugin_marketplace_update_index_trust_from_path(
    index_path: &Path,
    registry_root: &Path,
    trusted_keys: &[TrustedPluginSigningKey],
    consent_operation: Option<&str>,
) -> Result<PluginMarketplaceUpdateIndexTrustReviewResult, String> {
    if consent_operation != Some(PLUGIN_MARKETPLACE_UPDATE_INDEX_REVIEW_OPERATION) {
        return Err(format!(
            "Plugin marketplace update index trust review requires consent operation {PLUGIN_MARKETPLACE_UPDATE_INDEX_REVIEW_OPERATION}."
        ));
    }

    let index_path = validate_marketplace_update_index_path(index_path)?;
    let contents = fs::read_to_string(&index_path)
        .map_err(|error| format!("Could not read plugin marketplace update index: {error}"))?;
    validate_marketplace_update_index_path(&index_path)?;
    let index: SignedMarketplaceUpdateIndex = serde_json::from_str(&contents)
        .map_err(|error| format!("Plugin marketplace update index is not valid JSON: {error}"))?;

    validate_marketplace_update_index_schema(&index)?;
    let trusted_key = trusted_keys
        .iter()
        .find(|key| key.id == index.index_signature.key_id.trim())
        .ok_or_else(|| {
            format!(
                "Plugin marketplace update index was signed by unknown trusted signing key {}.",
                index.index_signature.key_id.trim()
            )
        })?;
    verify_marketplace_update_index_signature(&index, trusted_key)?;

    let audit = audit_staged_plugin_registry_from_path(registry_root, trusted_keys)?;
    let entries = index
        .entries
        .iter()
        .map(|catalog_entry| review_marketplace_update_index_entry(catalog_entry, &audit.entries))
        .collect::<Vec<_>>();
    let matched_disabled_package_count = entries
        .iter()
        .filter(|entry| entry.status == "trusted-disabled-match")
        .count();
    let blocked_count = entries
        .iter()
        .filter(|entry| entry.status == "blocked")
        .count();
    let revoked_count = entries.iter().filter(|entry| entry.revoked).count();

    Ok(PluginMarketplaceUpdateIndexTrustReviewResult {
        auto_update_allowed: false,
        blocked_count,
        catalog_entry_count: index.entries.len(),
        download_allowed: false,
        entries,
        index_path: index_path.display().to_string(),
        install_allowed: false,
        matched_disabled_package_count,
        registry_path: audit.registry_path,
        revoked_count,
        reviewed_at: unix_timestamp_millis().to_string(),
        signature_issuer: index.index_signature.signature_issuer.trim().to_string(),
        signature_key_id: index.index_signature.key_id.trim().to_string(),
        signature_verified: true,
        source_label: index.source_label.trim().to_string(),
    })
}

fn review_plugin_update_signing_envelope_from_path(
    envelope_path: &Path,
    registry_root: &Path,
    trusted_keys: &[TrustedPluginSigningKey],
    consent_operation: Option<&str>,
) -> Result<PluginUpdateSigningEnvelopeReviewResult, String> {
    if consent_operation != Some(PLUGIN_UPDATE_SIGNING_ENVELOPE_REVIEW_OPERATION) {
        return Err(format!(
            "Plugin update signing envelope review requires consent operation {PLUGIN_UPDATE_SIGNING_ENVELOPE_REVIEW_OPERATION}."
        ));
    }

    let envelope_path = validate_plugin_update_envelope_path(envelope_path)?;
    let contents = fs::read_to_string(&envelope_path)
        .map_err(|error| format!("Could not read plugin update signing envelope: {error}"))?;
    validate_plugin_update_envelope_path(&envelope_path)?;
    let envelope: SignedPluginUpdateEnvelope = serde_json::from_str(&contents)
        .map_err(|error| format!("Plugin update signing envelope is not valid JSON: {error}"))?;

    validate_plugin_update_envelope_schema(&envelope)?;
    let trusted_key = trusted_keys
        .iter()
        .find(|key| key.id == envelope.envelope_signature.key_id.trim())
        .ok_or_else(|| {
            format!(
                "Plugin update signing envelope was signed by unknown trusted signing key {}.",
                envelope.envelope_signature.key_id.trim()
            )
        })?;
    verify_plugin_update_envelope_signature(&envelope, trusted_key)?;

    let audit = audit_staged_plugin_registry_from_path(registry_root, trusted_keys)?;
    let entries = envelope
        .entries
        .iter()
        .map(|entry| {
            review_plugin_update_envelope_entry(
                entry,
                &audit.entries,
                envelope.envelope_signature.signature_issuer.trim(),
            )
        })
        .collect::<Vec<_>>();
    let auto_install_blocked = entries.iter().all(|entry| !entry.auto_install);
    let manifest_hash_ready = entries.iter().all(|entry| {
        is_sha256_manifest_hash(&entry.manifest_hash)
            && !entry
                .issues
                .iter()
                .any(|issue| issue.contains("manifestHash"))
    });
    let rollback_plan_ready = entries.iter().all(|entry| {
        entry
            .rollback_version
            .as_deref()
            .is_some_and(is_safe_version)
            && !entry
                .issues
                .iter()
                .any(|issue| issue.contains("rollbackVersion"))
    });
    let signature_verified_count = entries.len();

    Ok(PluginUpdateSigningEnvelopeReviewResult {
        auto_install_blocked,
        entries,
        manifest_hash_ready,
        reviewed_at: unix_timestamp_millis().to_string(),
        rollback_plan_ready,
        signature_verified_count,
        source_label: envelope.source_label.trim().to_string(),
    })
}

fn validate_plugin_update_envelope_path(envelope_path: &Path) -> Result<PathBuf, String> {
    if envelope_path.as_os_str().is_empty() {
        return Err("Plugin update signing envelope path is required.".to_string());
    }
    let metadata = fs::symlink_metadata(envelope_path).map_err(|error| {
        format!(
            "Could not inspect plugin update signing envelope {}: {error}",
            envelope_path.display()
        )
    })?;
    if metadata.file_type().is_symlink() {
        return Err("Plugin update signing envelope cannot be a symlink.".to_string());
    }
    if metadata.is_dir() {
        return Err("Plugin update signing envelope must be a file.".to_string());
    }
    if !metadata.is_file() {
        return Err("Plugin update signing envelope must be a file.".to_string());
    }
    if metadata.len() > MAX_MARKETPLACE_UPDATE_INDEX_BYTES {
        return Err(format!(
            "Plugin update signing envelope exceeds {MAX_MARKETPLACE_UPDATE_INDEX_BYTES} bytes."
        ));
    }
    envelope_path
        .canonicalize()
        .map_err(|error| format!("Could not resolve plugin update signing envelope: {error}"))
}

fn validate_plugin_update_envelope_schema(
    envelope: &SignedPluginUpdateEnvelope,
) -> Result<(), String> {
    if envelope.schema.trim() != "og-launcher.plugin-update-signing-envelope" {
        return Err("Plugin update signing envelope schema is unsupported.".to_string());
    }
    if envelope.version != 1 {
        return Err("Plugin update signing envelope version is unsupported.".to_string());
    }
    if envelope.generated_at.trim().is_empty() {
        return Err("Plugin update signing envelope generatedAt is required.".to_string());
    }
    if envelope.source_label.trim().is_empty() {
        return Err("Plugin update signing envelope sourceLabel is required.".to_string());
    }
    if envelope.entries.is_empty() || envelope.entries.len() > MAX_LIST_ITEMS {
        return Err(format!(
            "Plugin update signing envelope must include 1 to {MAX_LIST_ITEMS} entries."
        ));
    }
    if envelope.envelope_signature.algorithm.trim() != "ed25519" {
        return Err(
            "Plugin update signing envelope signature algorithm must be ed25519.".to_string(),
        );
    }
    if envelope.envelope_signature.key_id.trim().is_empty() {
        return Err("Plugin update signing envelope signature key id is required.".to_string());
    }
    if envelope
        .envelope_signature
        .signature_issuer
        .trim()
        .is_empty()
    {
        return Err("Plugin update signing envelope signature issuer is required.".to_string());
    }
    Ok(())
}

fn verify_plugin_update_envelope_signature(
    envelope: &SignedPluginUpdateEnvelope,
    trusted_key: &TrustedPluginSigningKey,
) -> Result<(), String> {
    let signature =
        parse_signature(envelope.envelope_signature.signature.trim()).ok_or_else(|| {
            "Plugin update signing envelope signature must be base64url or hex Ed25519.".to_string()
        })?;
    let payload = plugin_update_envelope_signature_payload(envelope);
    trusted_key
        .verifying_key
        .verify(payload.as_bytes(), &signature)
        .map_err(|_| "Plugin update signing envelope signature verification failed.".to_string())
}

fn plugin_update_envelope_signature_payload(envelope: &SignedPluginUpdateEnvelope) -> String {
    let entries = envelope
        .entries
        .iter()
        .map(|entry| {
            serde_json::json!({
                "pluginId": entry.plugin_id.trim(),
                "currentVersion": entry.current_version.trim(),
                "proposedVersion": entry.proposed_version.trim(),
                "channel": entry.channel.trim(),
                "manifestHash": entry.manifest_hash.trim(),
                "rollbackVersion": entry.rollback_version.as_deref().unwrap_or("").trim(),
                "autoInstall": entry.auto_install,
            })
        })
        .collect::<Vec<_>>();
    let payload = serde_json::json!([
        ["format", "og-plugin-update-signing-envelope-v1"],
        ["schema", envelope.schema.trim()],
        ["version", envelope.version],
        ["generatedAt", envelope.generated_at.trim()],
        ["sourceLabel", envelope.source_label.trim()],
        [
            "signatureAlgorithm",
            envelope.envelope_signature.algorithm.trim()
        ],
        ["signatureKeyId", envelope.envelope_signature.key_id.trim()],
        [
            "signatureIssuer",
            envelope.envelope_signature.signature_issuer.trim()
        ],
        ["entries", &entries],
    ]);
    serde_json::to_string(&payload).unwrap_or_else(|_| "[]".to_string())
}

fn review_plugin_update_envelope_entry(
    update_entry: &SignedPluginUpdateEnvelopeEntry,
    audit_entries: &[StagedPluginRegistryAuditEntry],
    signature_issuer: &str,
) -> PluginUpdateSigningEnvelopeReviewEntry {
    let plugin_id = update_entry.plugin_id.trim();
    let current_version = update_entry.current_version.trim();
    let proposed_version = update_entry.proposed_version.trim();
    let channel = update_entry.channel.trim();
    let manifest_hash = update_entry.manifest_hash.trim();
    let rollback_version = update_entry.rollback_version.as_deref().map(str::trim);
    let mut issues = Vec::new();

    if plugin_id.is_empty() || !is_safe_identifier(plugin_id) {
        issues.push("Plugin update envelope pluginId must be a safe identifier.".to_string());
    }
    if current_version.is_empty() || !is_safe_version(current_version) {
        issues.push("Plugin update envelope currentVersion must be safe.".to_string());
    }
    if proposed_version.is_empty() || !is_safe_version(proposed_version) {
        issues.push("Plugin update envelope proposedVersion must be safe.".to_string());
    }
    if channel.is_empty() || !is_safe_identifier(channel) {
        issues.push("Plugin update envelope channel must be safe.".to_string());
    }
    if !is_sha256_manifest_hash(manifest_hash) {
        issues.push("Plugin update envelope manifestHash must be sha256:<hex>.".to_string());
    }
    match rollback_version {
        Some(version) if is_safe_version(version) && version == current_version => {}
        Some(version) if !is_safe_version(version) => {
            issues.push("Plugin update envelope rollbackVersion must be safe.".to_string());
        }
        Some(_) => issues.push(
            "Plugin update envelope rollbackVersion must point to currentVersion.".to_string(),
        ),
        None => issues.push("Plugin update envelope rollbackVersion is required.".to_string()),
    }
    if update_entry.auto_install {
        issues.push("Plugin update envelope must keep autoInstall disabled.".to_string());
    }

    let matching_audit = audit_entries
        .iter()
        .find(|entry| entry.plugin_id == plugin_id && entry.version == proposed_version);
    match matching_audit {
        Some(entry) if entry.status == "disabled-audited" => {
            let staged_manifest_hash =
                fs::read(Path::new(&entry.registry_path).join("og-plugin.json"))
                    .map(|bytes| format!("sha256:{}", sha256_hex(&bytes)));
            match staged_manifest_hash {
                Ok(hash) if hash == manifest_hash => {}
                Ok(_) => issues.push(
                    "Plugin update envelope manifestHash does not match staged plugin manifest."
                        .to_string(),
                ),
                Err(error) => issues.push(format!(
                    "Could not read staged plugin manifest for update signing review: {error}"
                )),
            }
        }
        Some(entry) => {
            issues.push(
                "Plugin update envelope proposedVersion does not match a clean disabled staged package."
                    .to_string(),
            );
            issues.extend(entry.issues.clone());
        }
        None => issues.push(
            "Plugin update envelope proposedVersion has no matching disabled staged package."
                .to_string(),
        ),
    }

    let status = if issues.is_empty() {
        "review-only"
    } else {
        "blocked"
    }
    .to_string();

    PluginUpdateSigningEnvelopeReviewEntry {
        auto_install: update_entry.auto_install,
        channel: channel.to_string(),
        current_version: current_version.to_string(),
        issues,
        manifest_hash: manifest_hash.to_string(),
        plugin_id: plugin_id.to_string(),
        proposed_version: proposed_version.to_string(),
        rollback_version: rollback_version.map(str::to_string),
        signature_issuer: signature_issuer.to_string(),
        status,
    }
}

fn validate_marketplace_update_index_path(index_path: &Path) -> Result<PathBuf, String> {
    if index_path.as_os_str().is_empty() {
        return Err("Plugin marketplace update index path is required.".to_string());
    }
    let metadata = fs::symlink_metadata(index_path).map_err(|error| {
        format!(
            "Could not inspect plugin marketplace update index {}: {error}",
            index_path.display()
        )
    })?;
    if metadata.file_type().is_symlink() {
        return Err("Plugin marketplace update index cannot be a symlink.".to_string());
    }
    if metadata.is_dir() {
        return Err("Plugin marketplace update index must be a file.".to_string());
    }
    if !metadata.is_file() {
        return Err("Plugin marketplace update index must be a file.".to_string());
    }
    if metadata.len() > MAX_MARKETPLACE_UPDATE_INDEX_BYTES {
        return Err(format!(
            "Plugin marketplace update index exceeds {MAX_MARKETPLACE_UPDATE_INDEX_BYTES} bytes."
        ));
    }
    index_path
        .canonicalize()
        .map_err(|error| format!("Could not resolve plugin marketplace update index: {error}"))
}

fn validate_marketplace_update_index_schema(
    index: &SignedMarketplaceUpdateIndex,
) -> Result<(), String> {
    if index.schema.trim() != "og-launcher.plugin-marketplace-update-index" {
        return Err("Plugin marketplace update index schema is unsupported.".to_string());
    }
    if index.version != 1 {
        return Err("Plugin marketplace update index version is unsupported.".to_string());
    }
    if index.generated_at.trim().is_empty() {
        return Err("Plugin marketplace update index generatedAt is required.".to_string());
    }
    if index.source_label.trim().is_empty() {
        return Err("Plugin marketplace update index sourceLabel is required.".to_string());
    }
    if index.index_signature.algorithm.trim() != "ed25519" {
        return Err(
            "Plugin marketplace update index signature algorithm must be ed25519.".to_string(),
        );
    }
    if index.index_signature.key_id.trim().is_empty() {
        return Err("Plugin marketplace update index signature key id is required.".to_string());
    }
    if index.index_signature.signature_issuer.trim().is_empty() {
        return Err("Plugin marketplace update index signature issuer is required.".to_string());
    }
    Ok(())
}

fn verify_marketplace_update_index_signature(
    index: &SignedMarketplaceUpdateIndex,
    trusted_key: &TrustedPluginSigningKey,
) -> Result<(), String> {
    let signature = parse_signature(index.index_signature.signature.trim()).ok_or_else(|| {
        "Plugin marketplace update index signature must be base64url or hex Ed25519.".to_string()
    })?;
    let payload = marketplace_update_index_signature_payload(index);
    trusted_key
        .verifying_key
        .verify(payload.as_bytes(), &signature)
        .map_err(|_| "Plugin marketplace update index signature verification failed.".to_string())
}

fn marketplace_update_index_signature_payload(index: &SignedMarketplaceUpdateIndex) -> String {
    let entries = index
        .entries
        .iter()
        .map(|entry| {
            serde_json::json!({
                "pluginId": entry.plugin_id.trim(),
                "version": entry.version.trim(),
                "channel": entry.channel.trim(),
                "manifestHash": entry.manifest_hash.trim(),
                "moderationStatus": entry.moderation_status.trim(),
                "revoked": entry.revoked,
            })
        })
        .collect::<Vec<_>>();
    let payload = serde_json::json!([
        ["format", "og-plugin-marketplace-update-index-v1"],
        ["schema", index.schema.trim()],
        ["version", index.version],
        ["generatedAt", index.generated_at.trim()],
        ["sourceLabel", index.source_label.trim()],
        ["signatureAlgorithm", index.index_signature.algorithm.trim()],
        ["signatureKeyId", index.index_signature.key_id.trim()],
        [
            "signatureIssuer",
            index.index_signature.signature_issuer.trim()
        ],
        ["entries", &entries],
    ]);
    serde_json::to_string(&payload).unwrap_or_else(|_| "[]".to_string())
}

fn review_marketplace_update_index_entry(
    catalog_entry: &SignedMarketplaceUpdateIndexEntry,
    audit_entries: &[StagedPluginRegistryAuditEntry],
) -> PluginMarketplaceUpdateIndexTrustReviewEntry {
    let plugin_id = catalog_entry.plugin_id.trim();
    let version = catalog_entry.version.trim();
    let channel = catalog_entry.channel.trim();
    let manifest_hash = catalog_entry.manifest_hash.trim();
    let moderation_status = catalog_entry.moderation_status.trim();
    let mut issues = Vec::new();

    if plugin_id.is_empty() || !is_safe_identifier(plugin_id) {
        issues.push("Marketplace index pluginId must be a safe identifier.".to_string());
    }
    if version.is_empty() || !is_safe_version(version) {
        issues.push("Marketplace index version must be a safe identifier.".to_string());
    }
    if channel.is_empty() || !is_safe_identifier(channel) {
        issues.push("Marketplace index channel must be a safe non-empty identifier.".to_string());
    }
    if !is_sha256_manifest_hash(manifest_hash) {
        issues.push("Marketplace index manifestHash must be sha256:<hex>.".to_string());
    }
    if moderation_status != "approved" {
        issues.push("Marketplace index entry moderationStatus must be approved.".to_string());
    }
    if catalog_entry.revoked {
        issues.push("Marketplace index entry is revoked.".to_string());
    }

    let matching_audit = audit_entries
        .iter()
        .find(|entry| entry.plugin_id == plugin_id && entry.version == version);
    let mut registry_status = matching_audit
        .map(|entry| entry.status.clone())
        .unwrap_or_else(|| "missing".to_string());

    match matching_audit {
        Some(entry) if entry.status == "disabled-audited" => {
            let staged_manifest_hash =
                fs::read(Path::new(&entry.registry_path).join("og-plugin.json"))
                    .map(|bytes| format!("sha256:{}", sha256_hex(&bytes)));
            match staged_manifest_hash {
                Ok(hash) if hash == manifest_hash => {}
                Ok(_) => {
                    issues.push(
                        "Marketplace index manifestHash does not match staged plugin manifest."
                            .to_string(),
                    );
                }
                Err(error) => {
                    issues.push(format!(
                        "Could not read staged plugin manifest for marketplace hash review: {error}"
                    ));
                }
            }
        }
        Some(entry) => {
            registry_status = entry.status.clone();
            issues.push(
                "Marketplace index entry does not match a clean disabled staged package."
                    .to_string(),
            );
            issues.extend(entry.issues.clone());
        }
        None => {
            issues.push(
                "Marketplace index entry has no matching disabled staged package.".to_string(),
            );
        }
    }

    let status = if issues.is_empty() {
        "trusted-disabled-match"
    } else {
        "blocked"
    }
    .to_string();

    PluginMarketplaceUpdateIndexTrustReviewEntry {
        channel: channel.to_string(),
        issues,
        manifest_hash: manifest_hash.to_string(),
        moderation_status: moderation_status.to_string(),
        plugin_id: plugin_id.to_string(),
        registry_status,
        revoked: catalog_entry.revoked,
        status,
        version: version.to_string(),
    }
}

fn is_sha256_manifest_hash(value: &str) -> bool {
    let Some(hash) = value.strip_prefix("sha256:") else {
        return false;
    };
    hash.len() == 64 && hash.chars().all(|character| character.is_ascii_hexdigit())
}

fn sorted_directory_entries(path: &Path) -> Result<Vec<fs::DirEntry>, String> {
    let mut entries = fs::read_dir(path)
        .map_err(|error| format!("Could not read plugin registry directory: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read plugin registry entry: {error}"))?;
    entries.sort_by_key(|entry| entry.file_name());
    Ok(entries)
}

fn blocked_registry_audit_entry(
    plugin_id: String,
    version: String,
    registry_path: String,
    issue: String,
) -> StagedPluginRegistryAuditEntry {
    StagedPluginRegistryAuditEntry {
        entrypoint: String::new(),
        file_count: 0,
        issues: vec![issue],
        key_id: String::new(),
        plugin_id,
        registry_path,
        signature_issuer: String::new(),
        status: "blocked".to_string(),
        version,
    }
}

fn audit_staged_plugin_registry_entry(
    canonical_root: &Path,
    entry_root: &Path,
    directory_plugin_id: &str,
    directory_version: &str,
    trusted_keys: &[TrustedPluginSigningKey],
) -> StagedPluginRegistryAuditEntry {
    let mut entry = StagedPluginRegistryAuditEntry {
        entrypoint: String::new(),
        file_count: 0,
        issues: Vec::new(),
        key_id: String::new(),
        plugin_id: directory_plugin_id.to_string(),
        registry_path: entry_root.display().to_string(),
        signature_issuer: String::new(),
        status: "blocked".to_string(),
        version: directory_version.to_string(),
    };

    match fs::symlink_metadata(entry_root) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
            entry.issues.push(
                "Plugin registry version entry must be a real directory, not a symlink."
                    .to_string(),
            );
            return entry;
        }
        Ok(_) => {}
        Err(error) => {
            entry.issues.push(format!(
                "Could not inspect plugin registry version entry: {error}"
            ));
            return entry;
        }
    }

    let canonical_entry = match entry_root.canonicalize() {
        Ok(path) if path.starts_with(canonical_root) => path,
        Ok(_) => {
            entry
                .issues
                .push("Plugin registry entry escaped the registry directory.".to_string());
            return entry;
        }
        Err(error) => {
            entry
                .issues
                .push(format!("Could not resolve plugin registry entry: {error}"));
            return entry;
        }
    };
    entry.registry_path = canonical_entry.display().to_string();

    let stage_record_path = canonical_entry.join("plugin-stage.json");
    let stage_record = match read_registry_json_file::<StagedPluginRegistryRecord>(
        &stage_record_path,
        "Plugin registry stage record",
    ) {
        Ok(record) => {
            entry.entrypoint = record.entrypoint.trim().to_string();
            entry.file_count = record.file_count;
            entry.key_id = record.key_id.trim().to_string();
            entry.plugin_id = record.plugin_id.trim().to_string();
            entry.signature_issuer = record.signature_issuer.trim().to_string();
            entry.version = record.version.trim().to_string();
            if record.status.trim() != "disabled" {
                entry
                    .issues
                    .push("Plugin registry stage record must remain disabled.".to_string());
            }
            if record.staged_at.as_deref().unwrap_or("").trim().is_empty() {
                entry.issues.push(
                    "Plugin registry stage record must include stagedAt evidence.".to_string(),
                );
            }
            Some(record)
        }
        Err(error) => {
            entry.issues.push(error);
            None
        }
    };

    let manifest_path = canonical_entry.join("og-plugin.json");
    let manifest = match read_registry_json_file::<SignedPluginPackageManifest>(
        &manifest_path,
        "Plugin manifest",
    ) {
        Ok(manifest) => Some(manifest),
        Err(error) => {
            entry.issues.push(error);
            None
        }
    };

    if let Some(manifest) = manifest {
        entry.entrypoint = manifest.entrypoint.trim().to_string();
        entry.plugin_id = manifest.id.trim().to_string();
        entry.key_id = manifest.package_signature.key_id.trim().to_string();
        entry.signature_issuer = manifest
            .signature_issuer
            .as_deref()
            .unwrap_or("unknown")
            .trim()
            .to_string();
        entry.version = manifest.version.trim().to_string();

        if let Err(error) = validate_signed_plugin_manifest(&manifest) {
            entry.issues.push(error);
        }
        if normalize_relative_package_path(manifest.entrypoint.trim()).is_err() {
            entry
                .issues
                .push("Plugin package entrypoint cannot traverse directories.".to_string());
        }
        if directory_plugin_id != manifest.id.trim() {
            entry
                .issues
                .push("Plugin registry plugin id does not match the manifest.".to_string());
        }
        if directory_version != manifest.version.trim() {
            entry
                .issues
                .push("Plugin registry version does not match the manifest.".to_string());
        }

        let verified_files = match verify_plugin_package_files(&canonical_entry, &manifest) {
            Ok(files) => {
                entry.file_count = files.len();
                Some(files)
            }
            Err(error) => {
                entry.issues.push(error);
                None
            }
        };

        if let Some(files) = verified_files.as_ref() {
            let normalized_entrypoint = normalize_relative_package_path(manifest.entrypoint.trim());
            if normalized_entrypoint
                .as_ref()
                .map(|entrypoint| files.iter().any(|file| &file.relative_path == entrypoint))
                != Ok(true)
            {
                entry.issues.push(
                    "Plugin package entrypoint must be included in signed file list.".to_string(),
                );
            }

            match trusted_keys
                .iter()
                .find(|key| key.id == manifest.package_signature.key_id.trim())
            {
                Some(trusted_key) => {
                    if let Err(error) =
                        verify_plugin_package_signature(&manifest, files, trusted_key)
                    {
                        entry.issues.push(error);
                    }
                }
                None => entry.issues.push(format!(
                    "Plugin package was signed by unknown trusted signing key {}.",
                    manifest.package_signature.key_id.trim()
                )),
            }

            if let Err(error) = verify_registry_entry_inventory(&canonical_entry, files) {
                entry.issues.push(error);
            }

            if let Some(record) = stage_record.as_ref() {
                if record.plugin_id.trim() != manifest.id.trim()
                    || record.version.trim() != manifest.version.trim()
                    || record.key_id.trim() != manifest.package_signature.key_id.trim()
                    || record.entrypoint.trim() != manifest.entrypoint.trim()
                    || record.file_count != files.len()
                {
                    entry.issues.push(
                        "Plugin registry stage record does not match verified manifest evidence."
                            .to_string(),
                    );
                }
            }
        }
    }

    if entry.issues.is_empty() {
        entry.status = "disabled-audited".to_string();
    }
    entry
}

fn read_registry_json_file<T: for<'de> Deserialize<'de>>(
    path: &Path,
    label: &str,
) -> Result<T, String> {
    validate_registry_json_file(path, label)?;
    let contents =
        fs::read_to_string(path).map_err(|error| format!("{label} read failed: {error}"))?;
    validate_registry_json_file(path, label)?;
    serde_json::from_str(&contents).map_err(|error| format!("{label} is not valid JSON: {error}"))
}

fn validate_registry_json_file(path: &Path, label: &str) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("{label} is missing or unreadable: {error}"))?;
    if metadata.file_type().is_symlink() {
        return Err(format!("{label} cannot be a symlink."));
    }
    if !metadata.is_file() {
        return Err(format!("{label} must be a file."));
    }
    Ok(())
}

fn find_package_manifest_path(package_root: &Path) -> Result<PathBuf, String> {
    for name in MANIFEST_FILE_NAMES {
        let path = package_root.join(name);
        let Ok(metadata) = fs::symlink_metadata(&path) else {
            continue;
        };
        if metadata.file_type().is_symlink() {
            return Err(format!(
                "Plugin package manifest {name} cannot be a symlink."
            ));
        }
        if metadata.is_file() {
            return Ok(path);
        }
    }
    Err("Plugin package must include og-plugin.json, plugin.json, or manifest.json.".to_string())
}

fn validate_signed_plugin_manifest(manifest: &SignedPluginPackageManifest) -> Result<(), String> {
    let id = manifest.id.trim();
    let version = manifest.version.trim();
    let entrypoint = manifest.entrypoint.trim();
    if id.is_empty() || !is_safe_identifier(id) {
        return Err("Plugin package id must be a safe identifier.".to_string());
    }
    if manifest.name.trim().is_empty() {
        return Err("Plugin package name is required.".to_string());
    }
    if version.is_empty() || !is_safe_version(version) {
        return Err("Plugin package version must be a safe identifier.".to_string());
    }
    if entrypoint.is_empty() {
        return Err("Plugin package entrypoint is required.".to_string());
    }
    if manifest.signed != Some(true) {
        return Err("Plugin package manifest must declare signed=true.".to_string());
    }
    if manifest.package_signature.algorithm.trim() != "ed25519" {
        return Err("Plugin package signature algorithm must be ed25519.".to_string());
    }
    if manifest.package_signature.key_id.trim().is_empty() {
        return Err("Plugin package signature key id is required.".to_string());
    }
    if manifest.files.is_empty() {
        return Err("Plugin package must include signed file hashes.".to_string());
    }
    Ok(())
}

fn verify_plugin_package_files(
    package_root: &Path,
    manifest: &SignedPluginPackageManifest,
) -> Result<Vec<VerifiedPluginPackageFile>, String> {
    let mut verified_files = Vec::with_capacity(manifest.files.len());
    for file in &manifest.files {
        let relative_path = normalize_relative_package_path(&file.path)?;
        let source_path = verified_package_file_path(package_root, &relative_path)?;
        let bytes = fs::read(&source_path).map_err(|error| {
            format!("Could not read plugin package file {relative_path}: {error}")
        })?;
        let hash = sha256_hex(&bytes);
        if !hash.eq_ignore_ascii_case(file.sha256.trim()) {
            return Err(format!(
                "Plugin package file {relative_path} hash mismatch."
            ));
        }
        verified_package_file_path(package_root, &relative_path)?;
        verified_files.push(VerifiedPluginPackageFile {
            bytes,
            relative_path,
            sha256: hash,
        });
    }
    verified_files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    verified_files.dedup_by(|left, right| left.relative_path == right.relative_path);
    Ok(verified_files)
}

fn verified_package_file_path(package_root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let normalized = normalize_relative_package_path(relative_path)?;
    let canonical_root = package_root
        .canonicalize()
        .map_err(|error| format!("Could not resolve plugin package root: {error}"))?;
    let parts = normalized.split('/').collect::<Vec<_>>();
    let mut current = canonical_root.clone();

    for (index, part) in parts.iter().enumerate() {
        current.push(part);
        let metadata = fs::symlink_metadata(&current).map_err(|error| {
            format!("Could not inspect plugin package file {normalized}: {error}")
        })?;
        if metadata.file_type().is_symlink() {
            return Err(format!(
                "Plugin package file path {normalized} cannot contain symlinks."
            ));
        }
        if index + 1 < parts.len() {
            if !metadata.is_dir() {
                return Err(format!(
                    "Plugin package file parent for {normalized} must be a directory."
                ));
            }
        } else if !metadata.is_file() {
            return Err(format!("Plugin package file {normalized} must be a file."));
        }
    }

    let canonical_file = current
        .canonicalize()
        .map_err(|error| format!("Could not resolve plugin package file {normalized}: {error}"))?;
    if !canonical_file.starts_with(&canonical_root) {
        return Err(format!(
            "Plugin package file {normalized} escaped the package directory."
        ));
    }
    Ok(canonical_file)
}

fn verify_registry_entry_inventory(
    entry_root: &Path,
    verified_files: &[VerifiedPluginPackageFile],
) -> Result<(), String> {
    let mut allowed_files = BTreeSet::from([
        "og-plugin.json".to_string(),
        "plugin-stage.json".to_string(),
    ]);
    let mut allowed_directories = BTreeSet::new();

    for file in verified_files {
        allowed_files.insert(file.relative_path.clone());
        let parts = file.relative_path.split('/').collect::<Vec<_>>();
        for index in 0..parts.len().saturating_sub(1) {
            allowed_directories.insert(parts[..=index].join("/"));
        }
    }

    verify_registry_entry_inventory_at(entry_root, entry_root, &allowed_files, &allowed_directories)
}

fn verify_registry_entry_inventory_at(
    entry_root: &Path,
    current_directory: &Path,
    allowed_files: &BTreeSet<String>,
    allowed_directories: &BTreeSet<String>,
) -> Result<(), String> {
    for dir_entry in sorted_directory_entries(current_directory)? {
        let path = dir_entry.path();
        let relative_path = registry_relative_path(entry_root, &path)?;
        let metadata = fs::symlink_metadata(&path).map_err(|error| {
            format!("Could not inspect plugin registry entry path {relative_path}: {error}")
        })?;
        if metadata.file_type().is_symlink() {
            return Err(format!(
                "Plugin registry entry path {relative_path} cannot be a symlink."
            ));
        }
        if metadata.is_dir() {
            if !allowed_directories.contains(&relative_path) {
                return Err(format!(
                    "Plugin registry contains unsigned or untracked directory {relative_path}."
                ));
            }
            verify_registry_entry_inventory_at(
                entry_root,
                &path,
                allowed_files,
                allowed_directories,
            )?;
        } else if metadata.is_file() {
            if !allowed_files.contains(&relative_path) {
                return Err(format!(
                    "Plugin registry contains unsigned or untracked file {relative_path}."
                ));
            }
        } else {
            return Err(format!(
                "Plugin registry entry path {relative_path} must be a file or directory."
            ));
        }
    }
    Ok(())
}

fn registry_relative_path(root: &Path, path: &Path) -> Result<String, String> {
    let relative = path
        .strip_prefix(root)
        .map_err(|_| "Plugin registry entry escaped the registry directory.".to_string())?;
    let mut parts = Vec::new();
    for component in relative.components() {
        match component {
            Component::Normal(part) => parts.push(part.to_string_lossy().to_string()),
            _ => return Err("Plugin registry entry path is invalid.".to_string()),
        }
    }
    if parts.is_empty() {
        return Err("Plugin registry entry path is invalid.".to_string());
    }
    Ok(parts.join("/"))
}

fn verify_plugin_package_signature(
    manifest: &SignedPluginPackageManifest,
    files: &[VerifiedPluginPackageFile],
    trusted_key: &TrustedPluginSigningKey,
) -> Result<(), String> {
    let signature = parse_signature(manifest.package_signature.signature.trim())
        .ok_or_else(|| "Plugin package signature must be base64url or hex Ed25519.".to_string())?;
    let payload = plugin_package_signature_payload(manifest, files);
    trusted_key
        .verifying_key
        .verify(payload.as_bytes(), &signature)
        .map_err(|_| "Plugin package signature verification failed.".to_string())
}

fn plugin_package_signature_payload(
    manifest: &SignedPluginPackageManifest,
    files: &[VerifiedPluginPackageFile],
) -> String {
    let mut permissions = normalize_manifest_list_for_signature(&manifest.permissions);
    let mut theme_hooks = normalize_manifest_list_for_signature(&manifest.theme_hooks);
    permissions.sort();
    theme_hooks.sort();
    let files = files
        .iter()
        .map(|file| {
            serde_json::json!({
                "path": file.relative_path,
                "sha256": file.sha256,
            })
        })
        .collect::<Vec<_>>();
    let payload = serde_json::json!([
        ["format", "og-plugin-package-v1"],
        ["id", manifest.id.trim()],
        ["name", manifest.name.trim()],
        ["version", manifest.version.trim()],
        ["entrypoint", manifest.entrypoint.trim()],
        [
            "signatureIssuer",
            manifest.signature_issuer.as_deref().unwrap_or("").trim()
        ],
        [
            "updateChannel",
            manifest.update_channel.as_deref().unwrap_or("").trim()
        ],
        ["permissions", &permissions],
        ["themeHooks", &theme_hooks],
        ["keyId", manifest.package_signature.key_id.trim()],
        ["files", &files],
    ]);
    serde_json::to_string(&payload).unwrap_or_else(|_| "[]".to_string())
}

fn normalize_manifest_list_for_signature(values: &Option<Vec<String>>) -> Vec<String> {
    values
        .as_ref()
        .map(|items| {
            items
                .iter()
                .map(|item| item.trim().to_string())
                .filter(|item| !item.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

fn trusted_plugin_signing_keys_from_env() -> Result<Vec<TrustedPluginSigningKey>, String> {
    let value = std::env::var(PLUGIN_TRUSTED_KEYS_ENV).unwrap_or_default();
    if value.trim().is_empty() {
        return Ok(Vec::new());
    }
    value
        .split(',')
        .filter(|entry| !entry.trim().is_empty())
        .map(parse_trusted_plugin_signing_key)
        .collect()
}

fn parse_trusted_plugin_signing_key(value: &str) -> Result<TrustedPluginSigningKey, String> {
    let trimmed = value.trim();
    let (id, key) = trimmed
        .split_once('=')
        .or_else(|| trimmed.split_once(':'))
        .ok_or_else(|| {
            format!("{PLUGIN_TRUSTED_KEYS_ENV} entries must use key-id=base64url-public-key.")
        })?;
    let verifying_key = parse_verifying_key(key.trim()).ok_or_else(|| {
        format!("{PLUGIN_TRUSTED_KEYS_ENV} contains an invalid Ed25519 public key.")
    })?;
    Ok(TrustedPluginSigningKey {
        id: id.trim().to_string(),
        verifying_key,
    })
}

fn normalize_relative_package_path(path: &str) -> Result<String, String> {
    let trimmed = path.trim().replace('\\', "/");
    if trimmed.is_empty() {
        return Err("Plugin package relative package path is required.".to_string());
    }
    let candidate = Path::new(&trimmed);
    if candidate.is_absolute() {
        return Err("Plugin package relative package path cannot be absolute.".to_string());
    }
    let mut parts = Vec::new();
    for component in candidate.components() {
        match component {
            Component::Normal(part) => {
                let value = part.to_string_lossy();
                if value.is_empty() {
                    return Err("Plugin package relative package path is invalid.".to_string());
                }
                parts.push(value.to_string());
            }
            _ => {
                return Err(
                    "Plugin package relative package path cannot traverse directories.".to_string(),
                )
            }
        }
    }
    if parts.is_empty() {
        return Err("Plugin package relative package path is required.".to_string());
    }
    Ok(parts.join("/"))
}

fn safe_join_relative(root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let normalized = normalize_relative_package_path(relative_path)?;
    Ok(normalized
        .split('/')
        .fold(root.to_path_buf(), |path, part| path.join(part)))
}

fn safe_registry_target(
    registry_root: &Path,
    plugin_id: &str,
    version: &str,
) -> Result<PathBuf, String> {
    let plugin_id = normalize_relative_package_path(plugin_id)?;
    let version = normalize_relative_package_path(version)?;
    Ok(registry_root.join(plugin_id).join(version))
}

fn prepare_plugin_registry_root(registry_root: &Path) -> Result<PathBuf, String> {
    reject_existing_symlink_components(registry_root)?;
    create_safe_directory_tree(
        registry_root.parent().unwrap_or_else(|| Path::new("")),
        registry_root,
    )?;
    let metadata = fs::symlink_metadata(registry_root)
        .map_err(|error| format!("Could not inspect plugin registry directory: {error}"))?;
    if metadata.file_type().is_symlink() {
        return Err("Plugin registry directory cannot be a symlink.".to_string());
    }
    if !metadata.is_dir() {
        return Err("Plugin registry path must be a directory.".to_string());
    }
    registry_root
        .canonicalize()
        .map_err(|error| format!("Could not prepare plugin registry directory: {error}"))
}

fn create_safe_registry_target(
    registry_root: &Path,
    plugin_id: &str,
    version: &str,
) -> Result<PathBuf, String> {
    let target_root = safe_registry_target(registry_root, plugin_id, version)?;
    if target_root.exists() {
        let metadata = fs::symlink_metadata(&target_root)
            .map_err(|error| format!("Could not inspect plugin registry entry: {error}"))?;
        if metadata.file_type().is_symlink() {
            return Err("Plugin registry entry cannot be a symlink.".to_string());
        }
        return Err("Signed plugin package is already staged in the local registry.".to_string());
    }
    let plugin_root = target_root
        .parent()
        .ok_or_else(|| "Plugin registry entry path is invalid.".to_string())?;
    create_safe_directory_tree(registry_root, plugin_root)?;
    fs::create_dir(&target_root)
        .map_err(|error| format!("Could not create plugin registry entry: {error}"))?;
    let canonical_target = target_root
        .canonicalize()
        .map_err(|error| format!("Could not resolve plugin registry entry: {error}"))?;
    if !canonical_target.starts_with(registry_root) {
        return Err("Plugin registry entry escaped the registry directory.".to_string());
    }
    Ok(canonical_target)
}

fn create_safe_directory_tree(root: &Path, target: &Path) -> Result<(), String> {
    if target == root {
        return Ok(());
    }
    if !target.starts_with(root) {
        return Err("Plugin registry directory escaped the registry root.".to_string());
    }
    let relative = target
        .strip_prefix(root)
        .map_err(|_| "Plugin registry directory escaped the registry root.".to_string())?;
    let mut current = root.to_path_buf();
    for component in relative.components() {
        let Component::Normal(part) = component else {
            return Err("Plugin registry directory path is invalid.".to_string());
        };
        current.push(part);
        match fs::symlink_metadata(&current) {
            Ok(metadata) => {
                if metadata.file_type().is_symlink() {
                    return Err("Plugin registry directory cannot contain symlinks.".to_string());
                }
                if !metadata.is_dir() {
                    return Err(
                        "Plugin registry directory path must contain directories.".to_string()
                    );
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                fs::create_dir(&current).map_err(|error| {
                    format!("Could not create plugin registry directory: {error}")
                })?;
            }
            Err(error) => {
                return Err(format!(
                    "Could not inspect plugin registry directory: {error}"
                ));
            }
        }
    }
    Ok(())
}

fn reject_existing_symlink_components(path: &Path) -> Result<(), String> {
    let mut current = PathBuf::new();
    for component in path.components() {
        current.push(component.as_os_str());
        if current.as_os_str().is_empty() {
            continue;
        }
        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err("Plugin registry directory cannot contain symlinks.".to_string());
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(error) => {
                return Err(format!(
                    "Could not inspect plugin registry directory: {error}"
                ));
            }
        }
    }
    Ok(())
}

pub(crate) fn is_safe_identifier(value: &str) -> bool {
    value.len() <= MAX_ID_CHARS
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
}

pub(crate) fn is_safe_version(value: &str) -> bool {
    value.len() <= MAX_VERSION_CHARS
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
}

pub(crate) fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn parse_verifying_key(value: &str) -> Option<VerifyingKey> {
    let bytes = parse_base64url_or_hex(value, 32)?;
    let key_bytes: [u8; 32] = bytes.try_into().ok()?;
    VerifyingKey::from_bytes(&key_bytes).ok()
}

fn parse_signature(value: &str) -> Option<Signature> {
    let bytes = parse_base64url_or_hex(value, 64)?;
    Signature::from_slice(&bytes).ok()
}

fn parse_base64url_or_hex(value: &str, expected_len: usize) -> Option<Vec<u8>> {
    let trimmed = value.trim();
    URL_SAFE_NO_PAD
        .decode(trimmed.as_bytes())
        .ok()
        .filter(|bytes| bytes.len() == expected_len)
        .or_else(|| parse_hex(trimmed).filter(|bytes| bytes.len() == expected_len))
}

fn parse_hex(value: &str) -> Option<Vec<u8>> {
    if !value.len().is_multiple_of(2) {
        return None;
    }
    (0..value.len())
        .step_by(2)
        .map(|index| u8::from_str_radix(&value[index..index + 2], 16).ok())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use std::path::PathBuf;

    #[test]
    fn scans_valid_manifests_without_executing_plugin_code() {
        let root = test_dir("valid");
        let plugin_dir = root.join("library-tags-exporter");
        fs::create_dir_all(&plugin_dir).unwrap();
        fs::write(
            plugin_dir.join("og-plugin.json"),
            r#"{
              "id": "library-tags-exporter",
              "name": "Library Tags Exporter",
              "version": "0.3.1",
              "entrypoint": "dist/main.js",
              "permissions": ["library:read"],
              "signed": true,
              "signatureIssuer": "OG Launcher Local Test CA"
            }"#,
        )
        .unwrap();
        fs::write(
            plugin_dir.join("main.js"),
            "throw new Error('must not execute');",
        )
        .unwrap();

        let result = scan_local_plugin_manifests_from_path(&root).unwrap();

        assert_eq!(result.scanned_file_count, 1);
        assert_eq!(result.manifests.len(), 1);
        assert_eq!(
            result.manifests[0].id.as_deref(),
            Some("library-tags-exporter")
        );
        assert_eq!(
            result.manifests[0].entrypoint.as_deref(),
            Some("dist/main.js")
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn reports_invalid_json_as_skipped_entry() {
        let root = test_dir("invalid-json");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("plugin.json"), "{not json").unwrap();

        let result = scan_local_plugin_manifests_from_path(&root).unwrap();

        assert_eq!(result.scanned_file_count, 1);
        assert!(result.manifests.is_empty());
        assert!(result
            .skipped_entries
            .iter()
            .any(|entry| entry.contains("invalid JSON")));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn preserves_unsafe_entrypoint_for_frontend_policy_review() {
        let root = test_dir("unsafe-entrypoint");
        fs::create_dir_all(&root).unwrap();
        fs::write(
            root.join("manifest.json"),
            r#"{
              "id": "unsafe-entrypoint-demo",
              "name": "Unsafe Entrypoint Demo",
              "version": "1.0.0",
              "entrypoint": "../escape.js"
            }"#,
        )
        .unwrap();

        let result = scan_local_plugin_manifests_from_path(&root).unwrap();

        assert_eq!(result.manifests.len(), 1);
        assert_eq!(
            result.manifests[0].entrypoint.as_deref(),
            Some("../escape.js")
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn normalizes_manifest_strings_and_lists_before_returning_payload() {
        let root = test_dir("normalize");
        fs::create_dir_all(&root).unwrap();
        let long_name = "n".repeat(MAX_NAME_CHARS + 20);
        let permissions: Vec<String> = (0..(MAX_LIST_ITEMS + 10))
            .map(|index| format!("permission-{index:02}"))
            .chain(["permission-00".to_string(), "  permission-01  ".to_string()])
            .collect();
        let manifest = serde_json::json!({
            "id": "  local-import-demo  ",
            "name": long_name,
            "version": "  1.0.0  ",
            "entrypoint": "  dist/main.js  ",
            "permissions": permissions,
            "themeHooks": ["store-card", "store-card", "  profile-card  "],
            "signatureIssuer": "  Local Test CA  ",
            "signed": true
        });
        fs::write(root.join("plugin.json"), manifest.to_string()).unwrap();

        let result = scan_local_plugin_manifests_from_path(&root).unwrap();
        let manifest = &result.manifests[0];

        assert_eq!(manifest.id.as_deref(), Some("local-import-demo"));
        assert_eq!(
            manifest.name.as_ref().unwrap().chars().count(),
            MAX_NAME_CHARS
        );
        assert_eq!(manifest.entrypoint.as_deref(), Some("dist/main.js"));
        assert_eq!(
            manifest.theme_hooks.as_ref().unwrap(),
            &vec!["profile-card".to_string(), "store-card".to_string()]
        );
        assert_eq!(manifest.permissions.as_ref().unwrap().len(), MAX_LIST_ITEMS);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn skips_manifest_files_over_size_limit() {
        let root = test_dir("oversized");
        fs::create_dir_all(&root).unwrap();
        fs::write(
            root.join("plugin.json"),
            "x".repeat((MAX_MANIFEST_BYTES + 1) as usize),
        )
        .unwrap();

        let result = scan_local_plugin_manifests_from_path(&root).unwrap();

        assert_eq!(result.scanned_file_count, 1);
        assert!(result.manifests.is_empty());
        assert!(result
            .skipped_entries
            .iter()
            .any(|entry| entry.contains("manifest exceeds")));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn respects_max_scan_depth() {
        let root = test_dir("depth");
        let depth_two = root.join("one").join("two");
        let depth_three = depth_two.join("three");
        fs::create_dir_all(&depth_three).unwrap();
        fs::write(
            depth_two.join("plugin.json"),
            r#"{
              "id": "depth-two-plugin",
              "name": "Depth Two Plugin",
              "version": "1.0.0",
              "entrypoint": "dist/main.js"
            }"#,
        )
        .unwrap();
        fs::write(
            depth_three.join("plugin.json"),
            r#"{
              "id": "depth-three-plugin",
              "name": "Depth Three Plugin",
              "version": "1.0.0",
              "entrypoint": "dist/main.js"
            }"#,
        )
        .unwrap();

        let result = scan_local_plugin_manifests_from_path(&root).unwrap();

        assert_eq!(result.manifests.len(), 1);
        assert_eq!(result.manifests[0].id.as_deref(), Some("depth-two-plugin"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn caps_manifest_count_and_reports_extra_manifest_files() {
        let root = test_dir("manifest-cap");
        fs::create_dir_all(&root).unwrap();
        for index in 0..(MAX_MANIFESTS + 3) {
            let plugin_dir = root.join(format!("plugin-{index:02}"));
            fs::create_dir_all(&plugin_dir).unwrap();
            fs::write(
                plugin_dir.join("plugin.json"),
                format!(
                    r#"{{
                      "id": "plugin-{index:02}",
                      "name": "Plugin {index:02}",
                      "version": "1.0.0",
                      "entrypoint": "dist/main.js"
                    }}"#
                ),
            )
            .unwrap();
        }

        let result = scan_local_plugin_manifests_from_path(&root).unwrap();

        assert_eq!(result.manifests.len(), MAX_MANIFESTS);
        assert!(result
            .skipped_entries
            .iter()
            .any(|entry| entry.contains("manifest limit reached")));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn caps_scanned_filesystem_entries() {
        let root = test_dir("entry-cap");
        fs::create_dir_all(&root).unwrap();
        for index in 0..(MAX_SCANNED_ENTRIES + 5) {
            fs::write(root.join(format!("note-{index:03}.txt")), "not a manifest").unwrap();
        }

        let result = scan_local_plugin_manifests_from_path(&root).unwrap();

        assert!(result.manifests.is_empty());
        assert!(result
            .skipped_entries
            .iter()
            .any(|entry| entry.contains("Scan stopped after")));

        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_roots_and_skips_symlinked_manifests() {
        use std::os::unix::fs::symlink;

        let root = test_dir("symlink");
        let real_root = root.join("real");
        let linked_root = root.join("linked-root");
        fs::create_dir_all(&real_root).unwrap();
        fs::write(
            real_root.join("plugin.json"),
            r#"{
              "id": "real-plugin",
              "name": "Real Plugin",
              "version": "1.0.0",
              "entrypoint": "dist/main.js"
            }"#,
        )
        .unwrap();
        symlink(&real_root, &linked_root).unwrap();

        let root_error = scan_local_plugin_manifests_from_path(&linked_root).unwrap_err();
        assert!(root_error.contains("cannot be a symlink"));

        let symlinked_manifest = real_root.join("manifest.json");
        symlink(real_root.join("plugin.json"), &symlinked_manifest).unwrap();
        let result = scan_local_plugin_manifests_from_path(&real_root).unwrap();

        assert_eq!(result.manifests.len(), 1);
        assert!(result
            .skipped_entries
            .iter()
            .any(|entry| entry.contains("symlink skipped")));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn stages_signed_plugin_package_disabled_without_executing_entrypoint() {
        let root = test_dir("signed-package");
        let package_root = root.join("package");
        let registry_root = root.join("registry");
        let signing_key = test_signing_key();
        let trusted_key = test_trusted_key(&signing_key);
        create_signed_plugin_package(
            &package_root,
            &signing_key,
            "local-trusted",
            &[("dist/main.js", "throw new Error('must not execute');")],
        );

        let result = stage_signed_plugin_package_from_path(
            &package_root,
            &registry_root,
            &[trusted_key],
            Some("stage_plugin_package:library-tags-exporter@1.0.0"),
        )
        .unwrap();

        assert_eq!(result.status, "disabled");
        assert_eq!(result.plugin_id, "library-tags-exporter");
        assert_eq!(result.key_id, "local-trusted");
        assert_eq!(result.file_count, 1);
        assert!(Path::new(&result.registry_path).starts_with(registry_root.canonicalize().unwrap()));
        assert!(registry_root
            .join("library-tags-exporter")
            .join("1.0.0")
            .join("dist")
            .join("main.js")
            .exists());
        assert!(registry_root
            .join("library-tags-exporter")
            .join("1.0.0")
            .join("plugin-stage.json")
            .exists());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn audits_disabled_registry_records_without_executing_entrypoint() {
        let root = test_dir("registry-audit");
        let package_root = root.join("package");
        let registry_root = root.join("registry");
        let signing_key = test_signing_key();
        let trusted_key = test_trusted_key(&signing_key);
        create_signed_plugin_package(
            &package_root,
            &signing_key,
            "local-trusted",
            &[("dist/main.js", "throw new Error('must not execute');")],
        );
        stage_signed_plugin_package_from_path(
            &package_root,
            &registry_root,
            std::slice::from_ref(&trusted_key),
            Some("stage_plugin_package:library-tags-exporter@1.0.0"),
        )
        .unwrap();

        let result =
            audit_staged_plugin_registry_from_path(&registry_root, &[trusted_key]).unwrap();

        assert_eq!(result.passed_count, 1);
        assert_eq!(result.failed_count, 0);
        assert_eq!(result.entries.len(), 1);
        assert_eq!(result.entries[0].plugin_id, "library-tags-exporter");
        assert_eq!(result.entries[0].status, "disabled-audited");
        assert!(result.entries[0].issues.is_empty());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn proves_plugin_runtime_sandbox_preflight_from_audited_disabled_registry_without_executing_entrypoint(
    ) {
        let root = test_dir("runtime-sandbox-proof");
        let package_root = root.join("package");
        let registry_root = root.join("registry");
        let signing_key = test_signing_key();
        let trusted_key = test_trusted_key(&signing_key);
        create_signed_plugin_package(
            &package_root,
            &signing_key,
            "local-trusted",
            &[("dist/main.js", "throw new Error('must not execute');")],
        );
        stage_signed_plugin_package_from_path(
            &package_root,
            &registry_root,
            std::slice::from_ref(&trusted_key),
            Some("stage_plugin_package:library-tags-exporter@1.0.0"),
        )
        .unwrap();

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
        assert!(proof
            .escape_attempts
            .iter()
            .any(|attempt| attempt.id == "path-traversal-entrypoint"));
        assert!(proof
            .escape_attempts
            .iter()
            .any(|attempt| attempt.id == "ipc-open-shell"));
        assert!(proof
            .escape_attempts
            .iter()
            .any(|attempt| attempt.id == "filesystem-symlink-entrypoint"));
        assert!(proof
            .escape_attempts
            .iter()
            .any(|attempt| attempt.id == "manifest-nested-path-escape"));
        assert!(proof
            .escape_attempts
            .iter()
            .any(|attempt| attempt.id == "ipc-network-fetch"));
        assert!(proof
            .escape_attempts
            .iter()
            .any(|attempt| attempt.id == "permission-process-spawn"));
        let mut escape_ids = proof
            .escape_attempts
            .iter()
            .map(|attempt| attempt.id.as_str())
            .collect::<Vec<_>>();
        escape_ids.sort_unstable();
        assert_eq!(
            escape_ids,
            vec![
                "environment-secret-read",
                "filesystem-host-write",
                "filesystem-symlink-entrypoint",
                "ipc-network-fetch",
                "ipc-open-shell",
                "manifest-nested-path-escape",
                "path-traversal-entrypoint",
                "permission-process-spawn",
            ]
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn reviews_signed_marketplace_update_index_trust_without_allowing_download_or_install() {
        let root = test_dir("marketplace-update-index-trust");
        let package_root = root.join("package");
        let registry_root = root.join("registry");
        let index_path = root.join("marketplace-index.json");
        let signing_key = test_signing_key();
        let trusted_key = test_trusted_key(&signing_key);
        create_signed_plugin_package(
            &package_root,
            &signing_key,
            "local-trusted",
            &[("dist/main.js", "throw new Error('must not execute');")],
        );
        stage_signed_plugin_package_from_path(
            &package_root,
            &registry_root,
            std::slice::from_ref(&trusted_key),
            Some("stage_plugin_package:library-tags-exporter@1.0.0"),
        )
        .unwrap();
        let staged_manifest = registry_root
            .join("library-tags-exporter")
            .join("1.0.0")
            .join("og-plugin.json");
        let manifest_hash = format!("sha256:{}", sha256_hex(&fs::read(staged_manifest).unwrap()));
        create_signed_marketplace_update_index(
            &index_path,
            &signing_key,
            "local-trusted",
            &manifest_hash,
        );

        let review = review_plugin_marketplace_update_index_trust_from_path(
            &index_path,
            &registry_root,
            &[trusted_key],
            Some("review_plugin_marketplace_update_index_trust"),
        )
        .unwrap();

        assert!(review.signature_verified);
        assert_eq!(review.catalog_entry_count, 1);
        assert_eq!(review.matched_disabled_package_count, 1);
        assert_eq!(review.blocked_count, 0);
        assert_eq!(review.revoked_count, 0);
        assert!(!review.download_allowed);
        assert!(!review.install_allowed);
        assert!(!review.auto_update_allowed);
        assert_eq!(review.entries.len(), 1);
        assert_eq!(review.entries[0].plugin_id, "library-tags-exporter");
        assert_eq!(review.entries[0].registry_status, "disabled-audited");
        assert_eq!(review.entries[0].status, "trusted-disabled-match");
        assert!(review.entries[0].issues.is_empty());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_tampered_marketplace_update_index_signature() {
        let root = test_dir("marketplace-update-index-tamper");
        let package_root = root.join("package");
        let registry_root = root.join("registry");
        let index_path = root.join("marketplace-index.json");
        let signing_key = test_signing_key();
        let trusted_key = test_trusted_key(&signing_key);
        create_signed_plugin_package(
            &package_root,
            &signing_key,
            "local-trusted",
            &[("dist/main.js", "throw new Error('must not execute');")],
        );
        stage_signed_plugin_package_from_path(
            &package_root,
            &registry_root,
            std::slice::from_ref(&trusted_key),
            Some("stage_plugin_package:library-tags-exporter@1.0.0"),
        )
        .unwrap();
        let staged_manifest = registry_root
            .join("library-tags-exporter")
            .join("1.0.0")
            .join("og-plugin.json");
        let manifest_hash = format!("sha256:{}", sha256_hex(&fs::read(staged_manifest).unwrap()));
        create_signed_marketplace_update_index(
            &index_path,
            &signing_key,
            "local-trusted",
            &manifest_hash,
        );
        let mut index_json: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&index_path).unwrap()).unwrap();
        index_json["entries"][0]["manifestHash"] = serde_json::json!("sha256:tampered");
        fs::write(
            &index_path,
            serde_json::to_string_pretty(&index_json).unwrap(),
        )
        .unwrap();

        let error = review_plugin_marketplace_update_index_trust_from_path(
            &index_path,
            &registry_root,
            &[trusted_key],
            Some("review_plugin_marketplace_update_index_trust"),
        )
        .unwrap_err();

        assert!(error.contains("signature verification failed"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn reviews_signed_plugin_update_envelope_without_allowing_install_or_execution() {
        let root = test_dir("update-envelope-review");
        let package_root = root.join("package");
        let registry_root = root.join("registry");
        let envelope_path = root.join("plugin-update-envelope.json");
        let signing_key = test_signing_key();
        let trusted_key = test_trusted_key(&signing_key);
        create_signed_plugin_package(
            &package_root,
            &signing_key,
            "local-trusted",
            &[("dist/main.js", "throw new Error('must not execute');")],
        );
        stage_signed_plugin_package_from_path(
            &package_root,
            &registry_root,
            std::slice::from_ref(&trusted_key),
            Some("stage_plugin_package:library-tags-exporter@1.0.0"),
        )
        .unwrap();
        let staged_manifest = registry_root
            .join("library-tags-exporter")
            .join("1.0.0")
            .join("og-plugin.json");
        let manifest_hash = format!("sha256:{}", sha256_hex(&fs::read(staged_manifest).unwrap()));
        create_signed_plugin_update_envelope(
            &envelope_path,
            &signing_key,
            "local-trusted",
            &manifest_hash,
            Some("0.9.0"),
            false,
        );

        let review = review_plugin_update_signing_envelope_from_path(
            &envelope_path,
            &registry_root,
            &[trusted_key],
            Some("review_plugin_update_signing_envelope"),
        )
        .unwrap();

        assert!(review.auto_install_blocked);
        assert!(review.manifest_hash_ready);
        assert!(review.rollback_plan_ready);
        assert_eq!(review.signature_verified_count, 1);
        assert_eq!(review.entries.len(), 1);
        assert_eq!(review.entries[0].plugin_id, "library-tags-exporter");
        assert_eq!(review.entries[0].current_version, "0.9.0");
        assert_eq!(review.entries[0].proposed_version, "1.0.0");
        assert_eq!(review.entries[0].rollback_version.as_deref(), Some("0.9.0"));
        assert_eq!(review.entries[0].status, "review-only");
        assert!(!review.entries[0].auto_install);
        assert!(review.entries[0].issues.is_empty());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_tampered_plugin_update_envelope_signature() {
        let root = test_dir("update-envelope-tamper");
        let package_root = root.join("package");
        let registry_root = root.join("registry");
        let envelope_path = root.join("plugin-update-envelope.json");
        let signing_key = test_signing_key();
        let trusted_key = test_trusted_key(&signing_key);
        create_signed_plugin_package(
            &package_root,
            &signing_key,
            "local-trusted",
            &[("dist/main.js", "console.log('signed');")],
        );
        stage_signed_plugin_package_from_path(
            &package_root,
            &registry_root,
            std::slice::from_ref(&trusted_key),
            Some("stage_plugin_package:library-tags-exporter@1.0.0"),
        )
        .unwrap();
        let staged_manifest = registry_root
            .join("library-tags-exporter")
            .join("1.0.0")
            .join("og-plugin.json");
        let manifest_hash = format!("sha256:{}", sha256_hex(&fs::read(staged_manifest).unwrap()));
        create_signed_plugin_update_envelope(
            &envelope_path,
            &signing_key,
            "local-trusted",
            &manifest_hash,
            Some("0.9.0"),
            false,
        );
        let mut envelope_json: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&envelope_path).unwrap()).unwrap();
        envelope_json["entries"][0]["proposedVersion"] = serde_json::json!("1.0.1");
        fs::write(
            &envelope_path,
            serde_json::to_string_pretty(&envelope_json).unwrap(),
        )
        .unwrap();

        let error = review_plugin_update_signing_envelope_from_path(
            &envelope_path,
            &registry_root,
            &[trusted_key],
            Some("review_plugin_update_signing_envelope"),
        )
        .unwrap_err();

        assert!(error.contains("signature verification failed"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn blocks_plugin_update_envelope_auto_install_review() {
        let root = test_dir("update-envelope-auto-install");
        let package_root = root.join("package");
        let registry_root = root.join("registry");
        let envelope_path = root.join("plugin-update-envelope.json");
        let signing_key = test_signing_key();
        let trusted_key = test_trusted_key(&signing_key);
        create_signed_plugin_package(
            &package_root,
            &signing_key,
            "local-trusted",
            &[("dist/main.js", "console.log('signed');")],
        );
        stage_signed_plugin_package_from_path(
            &package_root,
            &registry_root,
            std::slice::from_ref(&trusted_key),
            Some("stage_plugin_package:library-tags-exporter@1.0.0"),
        )
        .unwrap();
        let staged_manifest = registry_root
            .join("library-tags-exporter")
            .join("1.0.0")
            .join("og-plugin.json");
        let manifest_hash = format!("sha256:{}", sha256_hex(&fs::read(staged_manifest).unwrap()));
        create_signed_plugin_update_envelope(
            &envelope_path,
            &signing_key,
            "local-trusted",
            &manifest_hash,
            Some("0.9.0"),
            true,
        );

        let review = review_plugin_update_signing_envelope_from_path(
            &envelope_path,
            &registry_root,
            &[trusted_key],
            Some("review_plugin_update_signing_envelope"),
        )
        .unwrap();

        assert!(!review.auto_install_blocked);
        assert_eq!(review.entries[0].status, "blocked");
        assert!(review.entries[0]
            .issues
            .iter()
            .any(|issue| issue.contains("autoInstall disabled")));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn blocks_plugin_update_envelope_missing_rollback_review() {
        let root = test_dir("update-envelope-missing-rollback");
        let package_root = root.join("package");
        let registry_root = root.join("registry");
        let envelope_path = root.join("plugin-update-envelope.json");
        let signing_key = test_signing_key();
        let trusted_key = test_trusted_key(&signing_key);
        create_signed_plugin_package(
            &package_root,
            &signing_key,
            "local-trusted",
            &[("dist/main.js", "console.log('signed');")],
        );
        stage_signed_plugin_package_from_path(
            &package_root,
            &registry_root,
            std::slice::from_ref(&trusted_key),
            Some("stage_plugin_package:library-tags-exporter@1.0.0"),
        )
        .unwrap();
        let staged_manifest = registry_root
            .join("library-tags-exporter")
            .join("1.0.0")
            .join("og-plugin.json");
        let manifest_hash = format!("sha256:{}", sha256_hex(&fs::read(staged_manifest).unwrap()));
        create_signed_plugin_update_envelope(
            &envelope_path,
            &signing_key,
            "local-trusted",
            &manifest_hash,
            None,
            false,
        );

        let review = review_plugin_update_signing_envelope_from_path(
            &envelope_path,
            &registry_root,
            &[trusted_key],
            Some("review_plugin_update_signing_envelope"),
        )
        .unwrap();

        assert!(!review.rollback_plan_ready);
        assert_eq!(review.entries[0].status, "blocked");
        assert!(review.entries[0]
            .issues
            .iter()
            .any(|issue| issue.contains("rollbackVersion is required")));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn blocks_plugin_update_envelope_manifest_hash_mismatch() {
        let root = test_dir("update-envelope-hash-mismatch");
        let package_root = root.join("package");
        let registry_root = root.join("registry");
        let envelope_path = root.join("plugin-update-envelope.json");
        let signing_key = test_signing_key();
        let trusted_key = test_trusted_key(&signing_key);
        create_signed_plugin_package(
            &package_root,
            &signing_key,
            "local-trusted",
            &[("dist/main.js", "console.log('signed');")],
        );
        stage_signed_plugin_package_from_path(
            &package_root,
            &registry_root,
            std::slice::from_ref(&trusted_key),
            Some("stage_plugin_package:library-tags-exporter@1.0.0"),
        )
        .unwrap();
        create_signed_plugin_update_envelope(
            &envelope_path,
            &signing_key,
            "local-trusted",
            "sha256:0000000000000000000000000000000000000000000000000000000000000000",
            Some("0.9.0"),
            false,
        );

        let review = review_plugin_update_signing_envelope_from_path(
            &envelope_path,
            &registry_root,
            &[trusted_key],
            Some("review_plugin_update_signing_envelope"),
        )
        .unwrap();

        assert!(!review.manifest_hash_ready);
        assert_eq!(review.entries[0].status, "blocked");
        assert!(review.entries[0]
            .issues
            .iter()
            .any(|issue| issue.contains("manifestHash does not match")));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn review_plugin_activation_plan_blocks_clean_package_until_production_sandbox_exists() {
        let root = test_dir("activation-plan-review");
        let package_root = root.join("package");
        let registry_root = root.join("registry");
        let signing_key = test_signing_key();
        let trusted_key = test_trusted_key(&signing_key);
        create_signed_plugin_package(
            &package_root,
            &signing_key,
            "local-trusted",
            &[("dist/main.js", "throw new Error('must not execute');")],
        );
        stage_signed_plugin_package_from_path(
            &package_root,
            &registry_root,
            std::slice::from_ref(&trusted_key),
            Some("stage_plugin_package:library-tags-exporter@1.0.0"),
        )
        .unwrap();
        let staged_manifest = registry_root
            .join("library-tags-exporter")
            .join("1.0.0")
            .join("og-plugin.json");
        let expected_manifest_hash = format!(
            "sha256:{}",
            sha256_hex(&fs::read(&staged_manifest).unwrap())
        );

        let review = review_plugin_activation_plan_from_path(
            &registry_root,
            &[trusted_key],
            "library-tags-exporter",
            "1.0.0",
            Some("review_plugin_activation_plan:library-tags-exporter@1.0.0"),
        )
        .unwrap();
        let check_ids = review
            .checks
            .iter()
            .map(|check| check.id.as_str())
            .collect::<BTreeSet<_>>();

        assert_eq!(review.status, "blocked-production-sandbox");
        assert_eq!(review.plugin_id, "library-tags-exporter");
        assert_eq!(review.version, "1.0.0");
        assert_eq!(review.entrypoint, "dist/main.js");
        assert!(Path::new(&review.registry_path).starts_with(registry_root.canonicalize().unwrap()));
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
        assert!(check_ids.contains("process-boundary-proof"));
        assert!(check_ids.contains("execution-denied"));
        assert!(check_ids.contains("download-install-denied"));
        assert!(check_ids.contains("permission-grants-denied"));
        assert!(check_ids.contains("target-package"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn review_plugin_activation_plan_requires_exact_consent() {
        let root = test_dir("activation-plan-consent");
        let registry_root = root.join("registry");

        for consent in [
            None,
            Some("review_plugin_activation_plan:library-tags-exporter@1.0.1"),
            Some("review_plugin_activation_plan:other@1.0.0"),
            Some("prove_plugin_runtime_sandbox_dry_run"),
        ] {
            let error = review_plugin_activation_plan_from_path(
                &registry_root,
                &[],
                "library-tags-exporter",
                "1.0.0",
                consent,
            )
            .unwrap_err();

            assert_eq!(
                error,
                "Plugin activation plan review requires consent operation review_plugin_activation_plan:library-tags-exporter@1.0.0."
            );
        }

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn review_plugin_activation_plan_blocks_missing_package_without_side_effects() {
        let root = test_dir("activation-plan-missing");
        let registry_root = root.join("registry");

        let review = review_plugin_activation_plan_from_path(
            &registry_root,
            &[],
            "library-tags-exporter",
            "1.0.0",
            Some("review_plugin_activation_plan:library-tags-exporter@1.0.0"),
        )
        .unwrap();
        let target_check = review
            .checks
            .iter()
            .find(|check| check.id == "target-package")
            .unwrap();

        assert_eq!(review.status, "blocked-untrusted");
        assert_eq!(review.registry_path, registry_root.display().to_string());
        assert_eq!(review.entrypoint, "");
        assert_eq!(review.manifest_hash, "");
        assert!(!review.code_executed);
        assert!(!review.download_attempted);
        assert!(!review.install_applied);
        assert!(!review.auto_install_allowed);
        assert!(!review.permission_grants_persisted);
        assert!(!review.process_boundary_ready);
        assert!(!review.network_allowed);
        assert_eq!(target_check.status, "blocked");
        assert!(target_check
            .detail
            .contains("is missing from the disabled registry"));
        assert!(!registry_root.exists());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_plugin_runtime_sandbox_preflight_for_enabled_registry_entry() {
        let root = test_dir("runtime-sandbox-enabled");
        let package_root = root.join("package");
        let registry_root = root.join("registry");
        let signing_key = test_signing_key();
        let trusted_key = test_trusted_key(&signing_key);
        create_signed_plugin_package(
            &package_root,
            &signing_key,
            "local-trusted",
            &[("dist/main.js", "console.log('never execute');")],
        );
        stage_signed_plugin_package_from_path(
            &package_root,
            &registry_root,
            std::slice::from_ref(&trusted_key),
            Some("stage_plugin_package:library-tags-exporter@1.0.0"),
        )
        .unwrap();
        let stage_record_path = registry_root
            .join("library-tags-exporter")
            .join("1.0.0")
            .join("plugin-stage.json");
        let mut stage_record: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&stage_record_path).unwrap()).unwrap();
        stage_record["status"] = serde_json::json!("enabled");
        fs::write(
            &stage_record_path,
            serde_json::to_string_pretty(&stage_record).unwrap(),
        )
        .unwrap();

        let error = prove_plugin_runtime_sandbox_from_path(
            &registry_root,
            &[trusted_key],
            Some("prove_plugin_runtime_sandbox_process_proof"),
        )
        .unwrap_err();

        assert!(error.contains("clean disabled registry audit"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_plugin_runtime_sandbox_preflight_for_tampered_registry_entry() {
        let root = test_dir("runtime-sandbox-tamper");
        let package_root = root.join("package");
        let registry_root = root.join("registry");
        let signing_key = test_signing_key();
        let trusted_key = test_trusted_key(&signing_key);
        create_signed_plugin_package(
            &package_root,
            &signing_key,
            "local-trusted",
            &[("dist/main.js", "console.log('original');")],
        );
        stage_signed_plugin_package_from_path(
            &package_root,
            &registry_root,
            std::slice::from_ref(&trusted_key),
            Some("stage_plugin_package:library-tags-exporter@1.0.0"),
        )
        .unwrap();
        fs::write(
            registry_root
                .join("library-tags-exporter")
                .join("1.0.0")
                .join("dist")
                .join("main.js"),
            "console.log('tampered');",
        )
        .unwrap();

        let error = prove_plugin_runtime_sandbox_from_path(
            &registry_root,
            &[trusted_key],
            Some("prove_plugin_runtime_sandbox_process_proof"),
        )
        .unwrap_err();

        assert!(error.contains("clean disabled registry audit"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn audits_reject_enabled_or_missing_stage_records() {
        let root = test_dir("registry-audit-enabled");
        let package_root = root.join("package");
        let registry_root = root.join("registry");
        let signing_key = test_signing_key();
        let trusted_key = test_trusted_key(&signing_key);
        create_signed_plugin_package(
            &package_root,
            &signing_key,
            "local-trusted",
            &[("dist/main.js", "console.log('never execute');")],
        );
        stage_signed_plugin_package_from_path(
            &package_root,
            &registry_root,
            std::slice::from_ref(&trusted_key),
            Some("stage_plugin_package:library-tags-exporter@1.0.0"),
        )
        .unwrap();
        let stage_record_path = registry_root
            .join("library-tags-exporter")
            .join("1.0.0")
            .join("plugin-stage.json");
        let mut stage_record: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&stage_record_path).unwrap()).unwrap();
        stage_record["status"] = serde_json::json!("enabled");
        fs::write(
            &stage_record_path,
            serde_json::to_string_pretty(&stage_record).unwrap(),
        )
        .unwrap();

        let result =
            audit_staged_plugin_registry_from_path(&registry_root, &[trusted_key]).unwrap();

        assert_eq!(result.passed_count, 0);
        assert_eq!(result.failed_count, 1);
        assert_eq!(result.entries[0].status, "blocked");
        assert!(result.entries[0]
            .issues
            .iter()
            .any(|issue| issue.contains("disabled")));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn audits_reject_registry_file_hash_tampering() {
        let root = test_dir("registry-audit-tamper");
        let package_root = root.join("package");
        let registry_root = root.join("registry");
        let signing_key = test_signing_key();
        let trusted_key = test_trusted_key(&signing_key);
        create_signed_plugin_package(
            &package_root,
            &signing_key,
            "local-trusted",
            &[("dist/main.js", "console.log('original');")],
        );
        stage_signed_plugin_package_from_path(
            &package_root,
            &registry_root,
            std::slice::from_ref(&trusted_key),
            Some("stage_plugin_package:library-tags-exporter@1.0.0"),
        )
        .unwrap();
        fs::write(
            registry_root
                .join("library-tags-exporter")
                .join("1.0.0")
                .join("dist")
                .join("main.js"),
            "console.log('tampered');",
        )
        .unwrap();

        let result =
            audit_staged_plugin_registry_from_path(&registry_root, &[trusted_key]).unwrap();

        assert_eq!(result.passed_count, 0);
        assert_eq!(result.failed_count, 1);
        assert_eq!(result.entries[0].status, "blocked");
        assert!(result.entries[0]
            .issues
            .iter()
            .any(|issue| issue.contains("hash mismatch")));

        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn audits_reject_registry_parent_symlink_file_escape() {
        use std::os::unix::fs::symlink;

        let root = test_dir("registry-audit-parent-symlink");
        let package_root = root.join("package");
        let registry_root = root.join("registry");
        let signing_key = test_signing_key();
        let trusted_key = test_trusted_key(&signing_key);
        create_signed_plugin_package(
            &package_root,
            &signing_key,
            "local-trusted",
            &[("dist/main.js", "console.log('original');")],
        );
        stage_signed_plugin_package_from_path(
            &package_root,
            &registry_root,
            std::slice::from_ref(&trusted_key),
            Some("stage_plugin_package:library-tags-exporter@1.0.0"),
        )
        .unwrap();
        let entry_root = registry_root.join("library-tags-exporter").join("1.0.0");
        let outside_root = root.join("outside-dist");
        fs::create_dir_all(&outside_root).unwrap();
        fs::write(outside_root.join("main.js"), "console.log('original');").unwrap();
        fs::remove_dir_all(entry_root.join("dist")).unwrap();
        symlink(&outside_root, entry_root.join("dist")).unwrap();

        let result =
            audit_staged_plugin_registry_from_path(&registry_root, &[trusted_key]).unwrap();

        assert_eq!(result.passed_count, 0);
        assert_eq!(result.failed_count, 1);
        assert_eq!(result.entries[0].status, "blocked");
        assert!(result.entries[0]
            .issues
            .iter()
            .any(|issue| issue.contains("symlink")));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn audits_reject_registry_unsigned_extra_files() {
        let root = test_dir("registry-audit-extra-file");
        let package_root = root.join("package");
        let registry_root = root.join("registry");
        let signing_key = test_signing_key();
        let trusted_key = test_trusted_key(&signing_key);
        create_signed_plugin_package(
            &package_root,
            &signing_key,
            "local-trusted",
            &[("dist/main.js", "console.log('original');")],
        );
        stage_signed_plugin_package_from_path(
            &package_root,
            &registry_root,
            std::slice::from_ref(&trusted_key),
            Some("stage_plugin_package:library-tags-exporter@1.0.0"),
        )
        .unwrap();
        fs::write(
            registry_root
                .join("library-tags-exporter")
                .join("1.0.0")
                .join("dist")
                .join("unsigned.js"),
            "console.log('unsigned');",
        )
        .unwrap();

        let result =
            audit_staged_plugin_registry_from_path(&registry_root, &[trusted_key]).unwrap();

        assert_eq!(result.passed_count, 0);
        assert_eq!(result.failed_count, 1);
        assert_eq!(result.entries[0].status, "blocked");
        assert!(result.entries[0]
            .issues
            .iter()
            .any(|issue| issue.contains("untracked file")));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_signed_plugin_package_with_unknown_key() {
        let root = test_dir("unknown-key");
        let package_root = root.join("package");
        let registry_root = root.join("registry");
        let signing_key = test_signing_key();
        create_signed_plugin_package(
            &package_root,
            &signing_key,
            "untrusted-key",
            &[("dist/main.js", "console.log('never execute');")],
        );

        let error = stage_signed_plugin_package_from_path(
            &package_root,
            &registry_root,
            &[test_trusted_key(&signing_key)],
            Some("stage_plugin_package:library-tags-exporter@1.0.0"),
        )
        .unwrap_err();

        assert!(error.contains("trusted signing key"));
        assert!(!registry_root.exists());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_signed_plugin_package_with_signature_or_hash_mismatch() {
        let root = test_dir("mismatch");
        let package_root = root.join("package");
        let registry_root = root.join("registry");
        let signing_key = test_signing_key();
        create_signed_plugin_package(
            &package_root,
            &signing_key,
            "local-trusted",
            &[("dist/main.js", "console.log('original');")],
        );
        fs::write(
            package_root.join("dist").join("main.js"),
            "console.log('tampered');",
        )
        .unwrap();

        let error = stage_signed_plugin_package_from_path(
            &package_root,
            &registry_root,
            &[test_trusted_key(&signing_key)],
            Some("stage_plugin_package:library-tags-exporter@1.0.0"),
        )
        .unwrap_err();

        assert!(error.contains("hash"));
        assert!(!registry_root.exists());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_signed_plugin_package_unknown_manifest_fields() {
        let root = test_dir("package-unknown-field");
        let package_root = root.join("package");
        let registry_root = root.join("registry");
        let signing_key = test_signing_key();
        let trusted_key = test_trusted_key(&signing_key);
        create_signed_plugin_package(
            &package_root,
            &signing_key,
            "local-trusted",
            &[("dist/main.js", "console.log('signed');")],
        );
        let manifest_path = package_root.join("og-plugin.json");
        let mut manifest_json: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&manifest_path).unwrap()).unwrap();
        manifest_json["runtimeReady"] = serde_json::json!(true);
        fs::write(
            &manifest_path,
            serde_json::to_string_pretty(&manifest_json).unwrap(),
        )
        .unwrap();

        let error = stage_signed_plugin_package_from_path(
            &package_root,
            &registry_root,
            &[trusted_key],
            Some("stage_plugin_package:library-tags-exporter@1.0.0"),
        )
        .unwrap_err();

        assert!(error.contains("unknown field") || error.contains("valid JSON"));
        assert!(!registry_root.exists());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_signed_plugin_package_traversal_file_entries() {
        let root = test_dir("traversal");
        let package_root = root.join("package");
        let registry_root = root.join("registry");
        let signing_key = test_signing_key();
        create_signed_plugin_package(
            &package_root,
            &signing_key,
            "local-trusted",
            &[("../escape.js", "console.log('escape');")],
        );

        let error = stage_signed_plugin_package_from_path(
            &package_root,
            &registry_root,
            &[test_trusted_key(&signing_key)],
            Some("stage_plugin_package:library-tags-exporter@1.0.0"),
        )
        .unwrap_err();

        assert!(error.contains("relative package path"));
        assert!(!registry_root.exists());

        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn rejects_signed_plugin_package_symlink_file_entries() {
        use std::os::unix::fs::symlink;

        let root = test_dir("package-symlink");
        let package_root = root.join("package");
        let registry_root = root.join("registry");
        let signing_key = test_signing_key();
        create_signed_plugin_package(
            &package_root,
            &signing_key,
            "local-trusted",
            &[("dist/main.js", "console.log('original');")],
        );
        fs::remove_file(package_root.join("dist").join("main.js")).unwrap();
        symlink(
            root.join("outside.js"),
            package_root.join("dist").join("main.js"),
        )
        .unwrap();

        let error = stage_signed_plugin_package_from_path(
            &package_root,
            &registry_root,
            &[test_trusted_key(&signing_key)],
            Some("stage_plugin_package:library-tags-exporter@1.0.0"),
        )
        .unwrap_err();

        assert!(error.contains("symlink"));
        assert!(!registry_root.exists());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_signed_plugin_package_unsafe_versions_before_staging() {
        let root = test_dir("unsafe-version");
        let package_root = root.join("package");
        let registry_root = root.join("registry");
        let signing_key = test_signing_key();
        create_signed_plugin_package(
            &package_root,
            &signing_key,
            "local-trusted",
            &[("dist/main.js", "console.log('original');")],
        );
        let manifest_path = package_root.join("og-plugin.json");
        let mut manifest_json: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&manifest_path).unwrap()).unwrap();
        manifest_json["version"] = serde_json::json!("beta/1");
        fs::write(
            &manifest_path,
            serde_json::to_string_pretty(&manifest_json).unwrap(),
        )
        .unwrap();

        let error = stage_signed_plugin_package_from_path(
            &package_root,
            &registry_root,
            &[test_trusted_key(&signing_key)],
            Some("stage_plugin_package:library-tags-exporter@beta/1"),
        )
        .unwrap_err();

        assert!(error.contains("version"));
        assert!(!registry_root.exists());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn signature_payload_preserves_array_boundaries() {
        let file = VerifiedPluginPackageFile {
            bytes: b"console.log('one');".to_vec(),
            relative_path: "dist/main.js".to_string(),
            sha256: sha256_hex(b"console.log('one');"),
        };
        let mut comma_manifest = SignedPluginPackageManifest {
            entrypoint: "dist/main.js".to_string(),
            files: vec![SignedPluginPackageFile {
                path: "dist/main.js".to_string(),
                sha256: file.sha256.clone(),
            }],
            id: "payload-demo".to_string(),
            name: "Payload Demo".to_string(),
            package_signature: SignedPluginPackageSignature {
                algorithm: "ed25519".to_string(),
                key_id: "local-trusted".to_string(),
                signature: String::new(),
            },
            permissions: Some(vec!["a,b".to_string()]),
            signature_issuer: Some("issuer\nwith newline".to_string()),
            signed: Some(true),
            theme_hooks: Some(vec![]),
            update_channel: Some("disabled".to_string()),
            version: "1.0.0".to_string(),
        };
        let comma_payload =
            plugin_package_signature_payload(&comma_manifest, std::slice::from_ref(&file));
        comma_manifest.permissions = Some(vec!["a".to_string(), "b".to_string()]);
        let split_payload =
            plugin_package_signature_payload(&comma_manifest, std::slice::from_ref(&file));

        assert_ne!(comma_payload, split_payload);
        assert!(comma_payload.contains(r#""a,b""#));
        assert!(comma_payload.contains(r#"\n"#));
    }

    #[cfg(unix)]
    #[test]
    fn rejects_signed_plugin_package_symlink_manifest() {
        use std::os::unix::fs::symlink;

        let root = test_dir("package-manifest-symlink");
        let package_root = root.join("package");
        let registry_root = root.join("registry");
        let signing_key = test_signing_key();
        create_signed_plugin_package(
            &package_root,
            &signing_key,
            "local-trusted",
            &[("dist/main.js", "console.log('original');")],
        );
        fs::rename(
            package_root.join("og-plugin.json"),
            package_root.join("real-og-plugin.json"),
        )
        .unwrap();
        symlink(
            package_root.join("real-og-plugin.json"),
            package_root.join("og-plugin.json"),
        )
        .unwrap();

        let error = stage_signed_plugin_package_from_path(
            &package_root,
            &registry_root,
            &[test_trusted_key(&signing_key)],
            Some("stage_plugin_package:library-tags-exporter@1.0.0"),
        )
        .unwrap_err();

        assert!(error.contains("manifest"));
        assert!(error.contains("symlink"));
        assert!(!registry_root.exists());

        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn rejects_signed_plugin_package_symlink_registry_components() {
        use std::os::unix::fs::symlink;

        let root = test_dir("registry-symlink");
        let package_root = root.join("package");
        let registry_root = root.join("registry");
        let outside_root = root.join("outside-registry");
        let signing_key = test_signing_key();
        create_signed_plugin_package(
            &package_root,
            &signing_key,
            "local-trusted",
            &[("dist/main.js", "console.log('original');")],
        );
        fs::create_dir_all(&registry_root).unwrap();
        fs::create_dir_all(&outside_root).unwrap();
        symlink(&outside_root, registry_root.join("library-tags-exporter")).unwrap();

        let error = stage_signed_plugin_package_from_path(
            &package_root,
            &registry_root,
            &[test_trusted_key(&signing_key)],
            Some("stage_plugin_package:library-tags-exporter@1.0.0"),
        )
        .unwrap_err();

        assert!(error.contains("symlink"));
        assert!(!outside_root.join("1.0.0").exists());

        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn rejects_signed_plugin_package_symlink_registry_ancestors() {
        use std::os::unix::fs::symlink;

        let root = test_dir("registry-ancestor-symlink");
        let package_root = root.join("package");
        let registry_link = root.join("plugins");
        let registry_root = registry_link.join("staged");
        let outside_root = root.join("outside-registry");
        let signing_key = test_signing_key();
        create_signed_plugin_package(
            &package_root,
            &signing_key,
            "local-trusted",
            &[("dist/main.js", "console.log('original');")],
        );
        fs::create_dir_all(&outside_root).unwrap();
        symlink(&outside_root, &registry_link).unwrap();

        let error = stage_signed_plugin_package_from_path(
            &package_root,
            &registry_root,
            &[test_trusted_key(&signing_key)],
            Some("stage_plugin_package:library-tags-exporter@1.0.0"),
        )
        .unwrap_err();

        assert!(error.contains("symlink"));
        assert!(!outside_root.join("staged").exists());

        let _ = fs::remove_dir_all(root);
    }

    fn test_dir(label: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "og-plugin-scan-{label}-{}-{}",
            std::process::id(),
            unix_timestamp_millis()
        ));
        let _ = fs::remove_dir_all(&root);
        root
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

    fn create_signed_plugin_package(
        package_root: &Path,
        signing_key: &SigningKey,
        key_id: &str,
        files: &[(&str, &str)],
    ) {
        fs::create_dir_all(package_root).unwrap();
        let mut verified_files = Vec::new();
        let mut manifest_files = Vec::new();

        for (relative_path, contents) in files {
            let target_path = package_root.join(relative_path);
            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent).unwrap();
            }
            fs::write(&target_path, contents).unwrap();
            let sha256 = sha256_hex(contents.as_bytes());
            verified_files.push(VerifiedPluginPackageFile {
                bytes: contents.as_bytes().to_vec(),
                relative_path: relative_path.replace('\\', "/"),
                sha256: sha256.clone(),
            });
            manifest_files.push(SignedPluginPackageFile {
                path: relative_path.to_string(),
                sha256,
            });
        }
        verified_files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));

        let mut manifest = SignedPluginPackageManifest {
            entrypoint: "dist/main.js".to_string(),
            files: manifest_files,
            id: "library-tags-exporter".to_string(),
            name: "Library Tags Exporter".to_string(),
            package_signature: SignedPluginPackageSignature {
                algorithm: "ed25519".to_string(),
                key_id: key_id.to_string(),
                signature: String::new(),
            },
            permissions: Some(vec!["library:read".to_string()]),
            signature_issuer: Some("OG Launcher Local Test CA".to_string()),
            signed: Some(true),
            theme_hooks: Some(vec![]),
            update_channel: Some("disabled".to_string()),
            version: "1.0.0".to_string(),
        };
        let payload = plugin_package_signature_payload(&manifest, &verified_files);
        let signature = signing_key.sign(payload.as_bytes());
        manifest.package_signature.signature = URL_SAFE_NO_PAD.encode(signature.to_bytes());

        fs::write(
            package_root.join("og-plugin.json"),
            serde_json::to_string_pretty(&manifest_to_json(&manifest)).unwrap(),
        )
        .unwrap();
    }

    fn create_signed_marketplace_update_index(
        index_path: &Path,
        signing_key: &SigningKey,
        key_id: &str,
        manifest_hash: &str,
    ) {
        let mut index = SignedMarketplaceUpdateIndex {
            schema: "og-launcher.plugin-marketplace-update-index".to_string(),
            version: 1,
            generated_at: "1700000000000".to_string(),
            source_label: "Local signed test marketplace".to_string(),
            entries: vec![SignedMarketplaceUpdateIndexEntry {
                plugin_id: "library-tags-exporter".to_string(),
                version: "1.0.0".to_string(),
                channel: "stable".to_string(),
                manifest_hash: manifest_hash.to_string(),
                moderation_status: "approved".to_string(),
                revoked: false,
            }],
            index_signature: SignedMarketplaceUpdateIndexSignature {
                algorithm: "ed25519".to_string(),
                key_id: key_id.to_string(),
                signature: String::new(),
                signature_issuer: "OG Launcher Local Test CA".to_string(),
            },
        };
        let payload = marketplace_update_index_signature_payload(&index);
        let signature = signing_key.sign(payload.as_bytes());
        index.index_signature.signature = URL_SAFE_NO_PAD.encode(signature.to_bytes());

        fs::write(
            index_path,
            serde_json::to_string_pretty(&marketplace_update_index_to_json(&index)).unwrap(),
        )
        .unwrap();
    }

    fn create_signed_plugin_update_envelope(
        envelope_path: &Path,
        signing_key: &SigningKey,
        key_id: &str,
        manifest_hash: &str,
        rollback_version: Option<&str>,
        auto_install: bool,
    ) {
        let mut envelope = SignedPluginUpdateEnvelope {
            schema: "og-launcher.plugin-update-signing-envelope".to_string(),
            version: 1,
            generated_at: "1700000000000".to_string(),
            source_label: "Local signed test update envelope".to_string(),
            entries: vec![SignedPluginUpdateEnvelopeEntry {
                plugin_id: "library-tags-exporter".to_string(),
                current_version: "0.9.0".to_string(),
                proposed_version: "1.0.0".to_string(),
                channel: "stable".to_string(),
                manifest_hash: manifest_hash.to_string(),
                rollback_version: rollback_version.map(str::to_string),
                auto_install,
            }],
            envelope_signature: SignedPluginUpdateEnvelopeSignature {
                algorithm: "ed25519".to_string(),
                key_id: key_id.to_string(),
                signature: String::new(),
                signature_issuer: "OG Launcher Local Test CA".to_string(),
            },
        };
        let payload = plugin_update_envelope_signature_payload(&envelope);
        let signature = signing_key.sign(payload.as_bytes());
        envelope.envelope_signature.signature = URL_SAFE_NO_PAD.encode(signature.to_bytes());

        fs::write(
            envelope_path,
            serde_json::to_string_pretty(&plugin_update_envelope_to_json(&envelope)).unwrap(),
        )
        .unwrap();
    }

    fn manifest_to_json(manifest: &SignedPluginPackageManifest) -> serde_json::Value {
        serde_json::json!({
            "entrypoint": manifest.entrypoint,
            "files": manifest.files.iter().map(|file| {
                serde_json::json!({
                    "path": file.path,
                    "sha256": file.sha256
                })
            }).collect::<Vec<_>>(),
            "id": manifest.id,
            "name": manifest.name,
            "packageSignature": {
                "algorithm": manifest.package_signature.algorithm,
                "keyId": manifest.package_signature.key_id,
                "signature": manifest.package_signature.signature
            },
            "permissions": manifest.permissions,
            "signatureIssuer": manifest.signature_issuer,
            "signed": manifest.signed,
            "themeHooks": manifest.theme_hooks,
            "updateChannel": manifest.update_channel,
            "version": manifest.version
        })
    }

    fn marketplace_update_index_to_json(index: &SignedMarketplaceUpdateIndex) -> serde_json::Value {
        serde_json::json!({
            "schema": index.schema,
            "version": index.version,
            "generatedAt": index.generated_at,
            "sourceLabel": index.source_label,
            "entries": index.entries.iter().map(|entry| {
                serde_json::json!({
                    "pluginId": entry.plugin_id,
                    "version": entry.version,
                    "channel": entry.channel,
                    "manifestHash": entry.manifest_hash,
                    "moderationStatus": entry.moderation_status,
                    "revoked": entry.revoked
                })
            }).collect::<Vec<_>>(),
            "indexSignature": {
                "algorithm": index.index_signature.algorithm,
                "keyId": index.index_signature.key_id,
                "signature": index.index_signature.signature,
                "signatureIssuer": index.index_signature.signature_issuer
            }
        })
    }

    fn plugin_update_envelope_to_json(envelope: &SignedPluginUpdateEnvelope) -> serde_json::Value {
        serde_json::json!({
            "schema": envelope.schema,
            "version": envelope.version,
            "generatedAt": envelope.generated_at,
            "sourceLabel": envelope.source_label,
            "entries": envelope.entries.iter().map(|entry| {
                serde_json::json!({
                    "pluginId": entry.plugin_id,
                    "currentVersion": entry.current_version,
                    "proposedVersion": entry.proposed_version,
                    "channel": entry.channel,
                    "manifestHash": entry.manifest_hash,
                    "rollbackVersion": entry.rollback_version,
                    "autoInstall": entry.auto_install
                })
            }).collect::<Vec<_>>(),
            "envelopeSignature": {
                "algorithm": envelope.envelope_signature.algorithm,
                "keyId": envelope.envelope_signature.key_id,
                "signature": envelope.envelope_signature.signature,
                "signatureIssuer": envelope.envelope_signature.signature_issuer
            }
        })
    }
}
