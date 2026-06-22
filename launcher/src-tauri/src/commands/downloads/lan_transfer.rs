use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File, OpenOptions},
    io::{ErrorKind, Read, Write},
    net::{TcpListener, UdpSocket},
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex, OnceLock,
    },
    thread,
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::sync::watch;

use crate::commands::games::{
    find_launch_executable, og_manifest_file_for_path, og_manifest_path_for_entry,
    og_manifest_relative_path, read_og_managed_manifest, sha256_file_hex,
    verify_og_managed_manifest_signature, write_og_managed_manifest_details, OgManagedManifest,
    OgManagedManifestFile, OG_MANAGED_MANIFEST_FILE,
};

use super::utils::normalize_game_id;

const LAN_COPY_OPERATION: &str = "lan_native_copy_verify_manifest";
const LAN_RESUME_COPY_OPERATION: &str = "lan_native_resume_copy_verify_manifest";
const LAN_CLEANUP_CANDIDATES_OPERATION: &str = "lan_native_cleanup_candidates_delete";
const LAN_PEER_DISCOVERY_PREFLIGHT_OPERATION: &str = "lan_peer_discovery_preflight_review";
const LAN_COPY_JOB_CHUNK_SIZE: usize = 256 * 1024;
const LAN_COPY_JOB_STATUS_QUEUED: &str = "queued";
const LAN_COPY_JOB_STATUS_RUNNING: &str = "running";
const LAN_COPY_JOB_STATUS_CANCELLING: &str = "cancelling";
const LAN_COPY_JOB_STATUS_CANCELLED: &str = "cancelled";
const LAN_COPY_JOB_STATUS_COMPLETED: &str = "completed";
const LAN_COPY_JOB_STATUS_FAILED: &str = "failed";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanTransferCopyRequest {
    pub game_id: String,
    pub title: String,
    pub source_path: String,
    pub target_path: String,
    pub consent: LanTransferCopyConsent,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanTransferCopyConsent {
    pub accepted: bool,
    pub source_path: String,
    pub target_path: String,
    pub operation: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LanTransferCopyFile {
    pub relative_path: String,
    pub size_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanTransferCopyPreview {
    pub game_id: String,
    pub title: String,
    pub source_path: String,
    pub target_path: String,
    pub file_count: usize,
    pub bytes_total: u64,
    pub files: Vec<LanTransferCopyFile>,
    pub message: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LanTransferCopyResult {
    pub game_id: String,
    pub title: String,
    pub source_path: String,
    pub target_path: String,
    pub manifest_path: String,
    pub executable_path: Option<String>,
    pub file_count: usize,
    pub bytes_copied: u64,
    pub verified_files: usize,
    pub files: Vec<LanTransferCopyFile>,
    pub message: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LanTransferResumeCopyResult {
    pub game_id: String,
    pub title: String,
    pub source_path: String,
    pub target_path: String,
    pub manifest_path: String,
    pub executable_path: Option<String>,
    pub file_count: usize,
    pub bytes_copied: u64,
    pub bytes_reused: u64,
    pub copied_file_count: usize,
    pub reused_file_count: usize,
    pub verified_files: usize,
    pub files: Vec<LanTransferCopyFile>,
    pub message: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LanTransferCopyJob {
    pub job_id: String,
    pub game_id: String,
    pub title: String,
    pub source_path: String,
    pub target_path: String,
    pub status: String,
    pub progress: u32,
    pub bytes_copied: u64,
    pub bytes_total: u64,
    pub copied_file_count: usize,
    pub file_count: usize,
    pub can_cancel: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manifest_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub executable_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanTransferCleanupCandidatesConsent {
    pub accepted: bool,
    pub source_path: String,
    pub target_path: String,
    pub operation: String,
    pub cleanup_candidate_count: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanTransferCleanupCandidatesRequest {
    pub game_id: String,
    pub title: String,
    pub source_path: String,
    pub target_path: String,
    pub consent: LanTransferCleanupCandidatesConsent,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanTransferCleanupCandidatesResult {
    pub game_id: String,
    pub title: String,
    pub source_path: String,
    pub target_path: String,
    pub deleted_count: usize,
    pub deleted_candidates: Vec<LanTransferResumeCancelCleanupCandidate>,
    pub message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanTransferResumeCancelLedgerRequest {
    pub game_id: String,
    pub title: String,
    pub source_path: String,
    pub target_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanTransferResumeCancelLedgerFile {
    pub relative_path: String,
    pub status: String,
    pub source_size_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_size_bytes: Option<u64>,
    pub source_sha256: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_sha256: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LanTransferResumeCancelCleanupCandidate {
    pub relative_path: String,
    pub entry_kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanTransferResumeCancelLedger {
    pub game_id: String,
    pub title: String,
    pub source_path: String,
    pub target_path: String,
    pub reusable_file_count: usize,
    pub pending_file_count: usize,
    pub conflict_file_count: usize,
    pub cleanup_candidate_count: usize,
    pub bytes_reusable: u64,
    pub bytes_pending: u64,
    pub bytes_conflicting: u64,
    pub files: Vec<LanTransferResumeCancelLedgerFile>,
    pub cleanup_candidates: Vec<LanTransferResumeCancelCleanupCandidate>,
    pub message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanTransferPeerDiscoveryPreflightConsent {
    pub accepted: bool,
    pub operation: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanTransferPeerDiscoveryPreflightRequest {
    pub consent: LanTransferPeerDiscoveryPreflightConsent,
    #[serde(default)]
    pub manual_source_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanTransferPeerDiscoveryManualSource {
    pub path: String,
    pub reachable: bool,
    pub file_count: usize,
    pub bytes_total: u64,
    pub symlink_free: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanTransferPeerDiscoveryPreflightResult {
    pub operation: String,
    pub status: String,
    pub broadcast_sent: bool,
    pub relay_called: bool,
    pub firewall_rule_changed: bool,
    pub share_mounted: bool,
    pub loopback_tcp_bind_ready: bool,
    pub loopback_udp_bind_ready: bool,
    pub redacted_endpoint: String,
    pub manual_source: Option<LanTransferPeerDiscoveryManualSource>,
    pub guards: Vec<String>,
    pub warnings: Vec<String>,
    pub message: String,
}

#[derive(Clone)]
struct ResolvedLanTransferCopy {
    game_id: String,
    title: String,
    source_path: PathBuf,
    target_path: PathBuf,
}

struct ActiveLanTransferCopyJob {
    job: LanTransferCopyJob,
    cancel_tx: watch::Sender<bool>,
}

type LanTransferCopyJobMap = Arc<Mutex<HashMap<String, ActiveLanTransferCopyJob>>>;

pub fn preview_lan_transfer_copy(
    input: LanTransferCopyRequest,
) -> Result<LanTransferCopyPreview, String> {
    let resolved = resolve_lan_transfer_copy(&input)?;
    let files = collect_lan_transfer_files(&resolved.source_path, false)?;
    if files.is_empty() {
        return Err("LAN transfer source folder does not contain copyable files.".to_string());
    }
    let bytes_total = files.iter().map(|file| file.size_bytes).sum();

    Ok(LanTransferCopyPreview {
        game_id: resolved.game_id,
        title: resolved.title,
        source_path: path_to_string(&resolved.source_path),
        target_path: path_to_string(&resolved.target_path),
        file_count: files.len(),
        bytes_total,
        files,
        message: "LAN transfer source is ready for native local-path copy review.".to_string(),
    })
}

pub fn preview_lan_transfer_peer_discovery_preflight(
    input: LanTransferPeerDiscoveryPreflightRequest,
) -> Result<LanTransferPeerDiscoveryPreflightResult, String> {
    validate_lan_transfer_peer_discovery_preflight_consent(&input)?;

    let loopback_tcp_bind_ready = TcpListener::bind("127.0.0.1:0").is_ok();
    let loopback_udp_bind_ready = UdpSocket::bind("127.0.0.1:0").is_ok();
    let manual_source = input
        .manual_source_path
        .as_deref()
        .and_then(|path| inspect_lan_transfer_manual_source(path).ok());
    let mut warnings = vec![
        "Native preflight did not send UDP broadcast.".to_string(),
        "Native preflight did not call hosted relay lookup.".to_string(),
        "Native preflight did not mount a network share.".to_string(),
        "Native preflight did not create or change firewall rules.".to_string(),
    ];

    if !loopback_tcp_bind_ready {
        warnings
            .push("Loopback TCP bind failed; discovery service cannot be staged yet.".to_string());
    }
    if !loopback_udp_bind_ready {
        warnings.push("Loopback UDP bind failed; mDNS listener cannot be staged yet.".to_string());
    }
    if input
        .manual_source_path
        .as_deref()
        .is_some_and(|path| manual_source.is_none() && !path.trim().is_empty())
    {
        warnings.push(
            "Manual source path was not reachable as a symlink-free folder during preflight."
                .to_string(),
        );
    }

    Ok(LanTransferPeerDiscoveryPreflightResult {
        operation: LAN_PEER_DISCOVERY_PREFLIGHT_OPERATION.to_string(),
        status: if loopback_tcp_bind_ready && loopback_udp_bind_ready {
            "warning"
        } else {
            "blocked"
        }
        .to_string(),
        broadcast_sent: false,
        relay_called: false,
        firewall_rule_changed: false,
        share_mounted: false,
        loopback_tcp_bind_ready,
        loopback_udp_bind_ready,
        redacted_endpoint: "127.0.0.1:<ephemeral>".to_string(),
        manual_source,
        guards: vec![
            "No UDP broadcast is sent".to_string(),
            "No relay request is executed".to_string(),
            "No peer is auto-selected".to_string(),
            "No share is mounted".to_string(),
            "No firewall rule is changed".to_string(),
            "Candidate endpoints stay redacted".to_string(),
        ],
        warnings,
        message:
            "LAN peer discovery/share preflight completed without broadcast, relay, mount, firewall mutation, pairing, or copy."
                .to_string(),
    })
}

pub fn preview_lan_transfer_resume_cancel_ledger(
    input: LanTransferResumeCancelLedgerRequest,
) -> Result<LanTransferResumeCancelLedger, String> {
    let resolved = resolve_lan_transfer_resume_cancel_ledger(&input)?;
    build_lan_transfer_resume_cancel_ledger(&resolved)
}

pub fn get_lan_transfer_copy_jobs() -> Result<Vec<LanTransferCopyJob>, String> {
    let mut jobs = get_lan_transfer_copy_job_manager()
        .lock()
        .map_err(|error| format!("LAN transfer copy job manager lock poisoned: {error}"))?
        .values()
        .map(|active| active.job.clone())
        .collect::<Vec<_>>();
    jobs.sort_by(|left, right| left.job_id.cmp(&right.job_id));
    Ok(jobs)
}

pub fn start_lan_transfer_copy_job(
    input: LanTransferCopyRequest,
) -> Result<LanTransferCopyJob, String> {
    validate_lan_transfer_copy_consent(&input, LAN_COPY_OPERATION, "copy job")?;
    let resolved = resolve_lan_transfer_copy(&input)?;
    ensure_empty_copy_target(&resolved.target_path)?;

    let source_files = collect_lan_transfer_files(&resolved.source_path, true)?;
    if source_files.is_empty() {
        return Err("LAN transfer source folder does not contain copyable files.".to_string());
    }
    let bytes_total = source_files.iter().map(|file| file.size_bytes).sum();
    let job_id = build_lan_transfer_copy_job_id(&resolved.game_id);
    let (cancel_tx, cancel_rx) = watch::channel(false);
    let job = LanTransferCopyJob {
        job_id: job_id.clone(),
        game_id: resolved.game_id.clone(),
        title: resolved.title.clone(),
        source_path: path_to_string(&resolved.source_path),
        target_path: path_to_string(&resolved.target_path),
        status: LAN_COPY_JOB_STATUS_QUEUED.to_string(),
        progress: 0,
        bytes_copied: 0,
        bytes_total,
        copied_file_count: 0,
        file_count: source_files.len(),
        can_cancel: true,
        manifest_path: None,
        executable_path: None,
        error: None,
        message: "LAN transfer copy job queued for cancellable local-path copy.".to_string(),
    };

    {
        let mut guard = get_lan_transfer_copy_job_manager()
            .lock()
            .map_err(|error| format!("LAN transfer copy job manager lock poisoned: {error}"))?;
        if guard.values().any(|active| {
            !is_lan_transfer_copy_job_terminal(&active.job.status)
                && active.job.game_id == resolved.game_id
                && active.job.target_path == path_to_string(&resolved.target_path)
        }) {
            return Err(
                "LAN transfer copy job is already active for this game and target.".to_string(),
            );
        }
        guard.insert(
            job_id.clone(),
            ActiveLanTransferCopyJob {
                job: job.clone(),
                cancel_tx,
            },
        );
    }

    thread::spawn({
        let resolved = resolved.clone();
        let source_files = source_files.clone();
        let job_id = job_id.clone();
        move || run_lan_transfer_copy_job_worker(job_id, resolved, source_files, cancel_rx)
    });

    Ok(job)
}

pub fn cancel_lan_transfer_copy_job(job_id: String) -> Result<LanTransferCopyJob, String> {
    let job_id = normalize_lan_transfer_copy_job_id(&job_id)?;
    let mut guard = get_lan_transfer_copy_job_manager()
        .lock()
        .map_err(|error| format!("LAN transfer copy job manager lock poisoned: {error}"))?;
    let Some(active) = guard.get_mut(&job_id) else {
        return Err("LAN transfer copy job was not found.".to_string());
    };
    if is_lan_transfer_copy_job_terminal(&active.job.status) {
        return Ok(active.job.clone());
    }

    let _ = active.cancel_tx.send(true);
    active.job.status = LAN_COPY_JOB_STATUS_CANCELLING.to_string();
    active.job.can_cancel = false;
    active.job.progress = active.job.progress.min(99);
    active.job.message =
        "LAN transfer copy job cancel requested; waiting for the current file chunk to stop."
            .to_string();
    Ok(active.job.clone())
}

fn build_lan_transfer_resume_cancel_ledger(
    resolved: &ResolvedLanTransferCopy,
) -> Result<LanTransferResumeCancelLedger, String> {
    let source_files = collect_lan_transfer_files(&resolved.source_path, true)?;
    if source_files.is_empty() {
        return Err("LAN transfer source folder does not contain copyable files.".to_string());
    }

    let source_relative_paths = source_files
        .iter()
        .map(|file| file.relative_path.clone())
        .collect::<HashSet<_>>();
    let mut files = Vec::with_capacity(source_files.len());
    let mut reusable_file_count = 0_usize;
    let mut pending_file_count = 0_usize;
    let mut conflict_file_count = 0_usize;
    let mut bytes_reusable = 0_u64;
    let mut bytes_pending = 0_u64;
    let mut bytes_conflicting = 0_u64;

    for source_file in &source_files {
        let target_file_path =
            og_manifest_path_for_entry(&resolved.target_path, &source_file.relative_path)
                .ok_or_else(|| {
                    "LAN transfer target contains an unsafe relative path.".to_string()
                })?;
        let source_sha256 = source_file.sha256.clone().ok_or_else(|| {
            "LAN transfer resume/cancel ledger could not hash source file.".to_string()
        })?;

        if !target_file_path.exists() {
            pending_file_count += 1;
            bytes_pending = bytes_pending.saturating_add(source_file.size_bytes);
            files.push(LanTransferResumeCancelLedgerFile {
                relative_path: source_file.relative_path.clone(),
                status: "pending".to_string(),
                source_size_bytes: source_file.size_bytes,
                target_size_bytes: None,
                source_sha256,
                target_sha256: None,
            });
            continue;
        }

        let metadata = fs::symlink_metadata(&target_file_path)
            .map_err(|error| format!("Could not inspect LAN transfer target entry: {error}"))?;
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            conflict_file_count += 1;
            bytes_conflicting = bytes_conflicting.saturating_add(source_file.size_bytes);
            files.push(LanTransferResumeCancelLedgerFile {
                relative_path: source_file.relative_path.clone(),
                status: "conflict".to_string(),
                source_size_bytes: source_file.size_bytes,
                target_size_bytes: None,
                source_sha256,
                target_sha256: None,
            });
            continue;
        }

        let target_size_bytes = metadata.len();
        let target_sha256 = sha256_file_hex(&target_file_path)?;
        if target_size_bytes == source_file.size_bytes && target_sha256 == source_sha256 {
            reusable_file_count += 1;
            bytes_reusable = bytes_reusable.saturating_add(source_file.size_bytes);
            files.push(LanTransferResumeCancelLedgerFile {
                relative_path: source_file.relative_path.clone(),
                status: "reusable".to_string(),
                source_size_bytes: source_file.size_bytes,
                target_size_bytes: Some(target_size_bytes),
                source_sha256,
                target_sha256: Some(target_sha256),
            });
        } else {
            conflict_file_count += 1;
            bytes_conflicting = bytes_conflicting.saturating_add(source_file.size_bytes);
            files.push(LanTransferResumeCancelLedgerFile {
                relative_path: source_file.relative_path.clone(),
                status: "conflict".to_string(),
                source_size_bytes: source_file.size_bytes,
                target_size_bytes: Some(target_size_bytes),
                source_sha256,
                target_sha256: Some(target_sha256),
            });
        }
    }

    let mut cleanup_candidates = Vec::new();
    collect_lan_transfer_cleanup_candidates(
        &resolved.target_path,
        &source_relative_paths,
        &mut cleanup_candidates,
    )?;
    cleanup_candidates.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));

    Ok(LanTransferResumeCancelLedger {
        game_id: resolved.game_id.clone(),
        title: resolved.title.clone(),
        source_path: path_to_string(&resolved.source_path),
        target_path: path_to_string(&resolved.target_path),
        reusable_file_count,
        pending_file_count,
        conflict_file_count,
        cleanup_candidate_count: cleanup_candidates.len(),
        bytes_reusable,
        bytes_pending,
        bytes_conflicting,
        files,
        cleanup_candidates,
        message: "LAN transfer resume/cancel ledger prepared without copying or deleting files."
            .to_string(),
    })
}

pub fn run_lan_transfer_copy(
    input: LanTransferCopyRequest,
) -> Result<LanTransferCopyResult, String> {
    validate_lan_transfer_copy_consent(&input, LAN_COPY_OPERATION, "copy")?;
    let resolved = resolve_lan_transfer_copy(&input)?;
    ensure_empty_copy_target(&resolved.target_path)?;

    let source_files = collect_lan_transfer_files(&resolved.source_path, true)?;
    if source_files.is_empty() {
        return Err("LAN transfer source folder does not contain copyable files.".to_string());
    }

    fs::create_dir_all(&resolved.target_path)
        .map_err(|error| format!("Could not create LAN transfer target folder: {error}"))?;

    let mut copied_manifest_files = Vec::with_capacity(source_files.len());
    let mut result_files = Vec::with_capacity(source_files.len());
    let mut bytes_copied = 0_u64;

    for source_file in &source_files {
        let copied = copy_lan_transfer_file(&resolved, source_file)?;
        verify_copied_lan_file(source_file, &copied)?;
        bytes_copied = bytes_copied.saturating_add(copied.size_bytes.unwrap_or(0));
        result_files.push(LanTransferCopyFile {
            relative_path: copied.path.clone(),
            size_bytes: copied.size_bytes.unwrap_or(0),
            sha256: copied.sha256.clone(),
        });
        copied_manifest_files.push(copied);
    }

    let executable_path = find_launch_executable(&resolved.target_path, &resolved.title)
        .and_then(|path| og_manifest_relative_path(&resolved.target_path, &path));
    let manifest = OgManagedManifest {
        game_id: resolved.game_id.clone(),
        title: resolved.title.clone(),
        version: "lan-copy".to_string(),
        managed_by: "OG-Launcher".to_string(),
        files: copied_manifest_files,
        executable_path: executable_path.clone(),
        ..Default::default()
    };
    write_and_verify_lan_manifest(&resolved.target_path, &manifest)?;

    Ok(LanTransferCopyResult {
        game_id: resolved.game_id,
        title: resolved.title,
        source_path: path_to_string(&resolved.source_path),
        target_path: path_to_string(&resolved.target_path),
        manifest_path: path_to_string(&resolved.target_path.join(OG_MANAGED_MANIFEST_FILE)),
        executable_path,
        file_count: result_files.len(),
        bytes_copied,
        verified_files: result_files.len(),
        files: result_files,
        message: "LAN transfer native copy completed with post-copy manifest hash verification."
            .to_string(),
    })
}

pub fn run_lan_transfer_resume_copy(
    input: LanTransferCopyRequest,
) -> Result<LanTransferResumeCopyResult, String> {
    validate_lan_transfer_copy_consent(&input, LAN_RESUME_COPY_OPERATION, "resume copy")?;
    let resolved = resolve_lan_transfer_copy(&input)?;
    let ledger = build_lan_transfer_resume_cancel_ledger(&resolved)?;
    if ledger.conflict_file_count > 0 {
        return Err(
            "LAN transfer resume copy requires a conflict-free target; run the ledger review and clear conflicting files first."
                .to_string(),
        );
    }
    if ledger.cleanup_candidate_count > 0 {
        return Err(
            "LAN transfer resume copy requires cleanup candidates to be reviewed before writing a manifest."
                .to_string(),
        );
    }

    let source_files = collect_lan_transfer_files(&resolved.source_path, true)?;
    if source_files.is_empty() {
        return Err("LAN transfer source folder does not contain copyable files.".to_string());
    }

    fs::create_dir_all(&resolved.target_path)
        .map_err(|error| format!("Could not create LAN transfer target folder: {error}"))?;

    let mut manifest_files = Vec::with_capacity(source_files.len());
    let mut result_files = Vec::with_capacity(source_files.len());
    let mut bytes_copied = 0_u64;
    let mut bytes_reused = 0_u64;
    let mut copied_file_count = 0_usize;
    let mut reused_file_count = 0_usize;

    for source_file in &source_files {
        let target_path =
            og_manifest_path_for_entry(&resolved.target_path, &source_file.relative_path)
                .ok_or_else(|| {
                    "LAN transfer target contains an unsafe relative path.".to_string()
                })?;
        let manifest_file = if target_path.exists() {
            let existing = verify_existing_lan_transfer_file(&resolved, source_file)?;
            bytes_reused = bytes_reused.saturating_add(existing.size_bytes.unwrap_or(0));
            reused_file_count += 1;
            existing
        } else {
            let copied = copy_lan_transfer_file(&resolved, source_file)?;
            verify_copied_lan_file(source_file, &copied)?;
            bytes_copied = bytes_copied.saturating_add(copied.size_bytes.unwrap_or(0));
            copied_file_count += 1;
            copied
        };
        result_files.push(LanTransferCopyFile {
            relative_path: manifest_file.path.clone(),
            size_bytes: manifest_file.size_bytes.unwrap_or(0),
            sha256: manifest_file.sha256.clone(),
        });
        manifest_files.push(manifest_file);
    }

    let executable_path = find_launch_executable(&resolved.target_path, &resolved.title)
        .and_then(|path| og_manifest_relative_path(&resolved.target_path, &path));
    let manifest = OgManagedManifest {
        game_id: resolved.game_id.clone(),
        title: resolved.title.clone(),
        version: "lan-resume-copy".to_string(),
        managed_by: "OG-Launcher".to_string(),
        files: manifest_files,
        executable_path: executable_path.clone(),
        ..Default::default()
    };
    write_and_verify_lan_manifest(&resolved.target_path, &manifest)?;

    Ok(LanTransferResumeCopyResult {
        game_id: resolved.game_id,
        title: resolved.title,
        source_path: path_to_string(&resolved.source_path),
        target_path: path_to_string(&resolved.target_path),
        manifest_path: path_to_string(&resolved.target_path.join(OG_MANAGED_MANIFEST_FILE)),
        executable_path,
        file_count: result_files.len(),
        bytes_copied,
        bytes_reused,
        copied_file_count,
        reused_file_count,
        verified_files: result_files.len(),
        files: result_files,
        message: "LAN transfer resume copy completed with reusable-file verification and manifest hash verification."
            .to_string(),
    })
}

pub fn run_lan_transfer_cleanup_candidates(
    input: LanTransferCleanupCandidatesRequest,
) -> Result<LanTransferCleanupCandidatesResult, String> {
    validate_lan_transfer_cleanup_candidates_consent(&input)?;
    let resolved = resolve_lan_transfer_cleanup_candidates(&input)?;
    let ledger = build_lan_transfer_resume_cancel_ledger(&resolved)?;
    if ledger.conflict_file_count > 0 {
        return Err(
            "LAN transfer cleanup requires a conflict-free target; resolve target conflicts before deleting cleanup candidates."
                .to_string(),
        );
    }
    if ledger.cleanup_candidate_count != input.consent.cleanup_candidate_count {
        return Err(format!(
            "LAN transfer cleanup candidate count changed from {} to {}; preview the ledger again.",
            input.consent.cleanup_candidate_count, ledger.cleanup_candidate_count
        ));
    }

    let mut deleted_candidates = Vec::with_capacity(ledger.cleanup_candidates.len());
    for candidate in &ledger.cleanup_candidates {
        delete_lan_transfer_cleanup_candidate(&resolved.target_path, candidate)?;
        deleted_candidates.push(candidate.clone());
    }

    let post_cleanup_ledger = build_lan_transfer_resume_cancel_ledger(&resolved)?;
    if post_cleanup_ledger.cleanup_candidate_count > 0 {
        return Err(
            "LAN transfer cleanup did not clear all reviewed cleanup candidates.".to_string(),
        );
    }

    Ok(LanTransferCleanupCandidatesResult {
        game_id: resolved.game_id,
        title: resolved.title,
        source_path: path_to_string(&resolved.source_path),
        target_path: path_to_string(&resolved.target_path),
        deleted_count: deleted_candidates.len(),
        deleted_candidates,
        message:
            "LAN transfer cleanup candidates deleted after ledger review and post-delete verification."
                .to_string(),
    })
}

fn resolve_lan_transfer_copy(
    input: &LanTransferCopyRequest,
) -> Result<ResolvedLanTransferCopy, String> {
    resolve_lan_transfer_paths(
        &input.game_id,
        &input.title,
        &input.source_path,
        &input.target_path,
    )
}

fn resolve_lan_transfer_resume_cancel_ledger(
    input: &LanTransferResumeCancelLedgerRequest,
) -> Result<ResolvedLanTransferCopy, String> {
    resolve_lan_transfer_paths(
        &input.game_id,
        &input.title,
        &input.source_path,
        &input.target_path,
    )
}

fn resolve_lan_transfer_cleanup_candidates(
    input: &LanTransferCleanupCandidatesRequest,
) -> Result<ResolvedLanTransferCopy, String> {
    resolve_lan_transfer_paths(
        &input.game_id,
        &input.title,
        &input.source_path,
        &input.target_path,
    )
}

fn get_lan_transfer_copy_job_manager() -> &'static LanTransferCopyJobMap {
    static MANAGER: OnceLock<LanTransferCopyJobMap> = OnceLock::new();
    MANAGER.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

fn build_lan_transfer_copy_job_id(game_id: &str) -> String {
    static JOB_ID_SEQUENCE: AtomicU64 = AtomicU64::new(0);

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let sequence = JOB_ID_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    format!("lan-copy-{game_id}-{nonce}-{sequence}")
}

fn normalize_lan_transfer_copy_job_id(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("LAN transfer copy job id must not be empty.".to_string());
    }
    if trimmed.len() > 160
        || !trimmed
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
    {
        return Err("LAN transfer copy job id contains unsafe characters.".to_string());
    }
    if !trimmed.starts_with("lan-copy-") {
        return Err("LAN transfer copy job id is not a LAN copy job.".to_string());
    }
    Ok(trimmed.to_string())
}

fn is_lan_transfer_copy_job_terminal(status: &str) -> bool {
    matches!(
        status,
        LAN_COPY_JOB_STATUS_CANCELLED | LAN_COPY_JOB_STATUS_COMPLETED | LAN_COPY_JOB_STATUS_FAILED
    )
}

fn update_lan_transfer_copy_job<F>(job_id: &str, update: F)
where
    F: FnOnce(&mut LanTransferCopyJob),
{
    let Ok(mut guard) = get_lan_transfer_copy_job_manager().lock() else {
        return;
    };
    if let Some(active) = guard.get_mut(job_id) {
        update(&mut active.job);
    }
}

fn run_lan_transfer_copy_job_worker(
    job_id: String,
    resolved: ResolvedLanTransferCopy,
    source_files: Vec<LanTransferCopyFile>,
    mut cancel_rx: watch::Receiver<bool>,
) {
    update_lan_transfer_copy_job(&job_id, |job| {
        job.status = LAN_COPY_JOB_STATUS_RUNNING.to_string();
        job.message = "LAN transfer copy job is copying local files.".to_string();
    });

    let result =
        run_lan_transfer_copy_job_worker_inner(&job_id, &resolved, &source_files, &mut cancel_rx);
    match result {
        Ok(result) => {
            update_lan_transfer_copy_job(&job_id, |job| {
                job.status = LAN_COPY_JOB_STATUS_COMPLETED.to_string();
                job.progress = 100;
                job.bytes_copied = result.bytes_copied;
                job.copied_file_count = result.file_count;
                job.can_cancel = false;
                job.manifest_path = Some(result.manifest_path.clone());
                job.executable_path = result.executable_path.clone();
                job.error = None;
                job.message = result.message;
            });
        }
        Err(error) if error == "cancelled" => {
            update_lan_transfer_copy_job(&job_id, |job| {
                job.status = LAN_COPY_JOB_STATUS_CANCELLED.to_string();
                job.can_cancel = false;
                job.progress = job.progress.min(99);
                job.message = "LAN transfer copy job cancelled before manifest write.".to_string();
            });
        }
        Err(error) => {
            update_lan_transfer_copy_job(&job_id, |job| {
                job.status = LAN_COPY_JOB_STATUS_FAILED.to_string();
                job.can_cancel = false;
                job.progress = job.progress.min(99);
                job.error = Some(error.clone());
                job.message = "LAN transfer copy job failed.".to_string();
            });
        }
    }
}

fn run_lan_transfer_copy_job_worker_inner(
    job_id: &str,
    resolved: &ResolvedLanTransferCopy,
    source_files: &[LanTransferCopyFile],
    cancel_rx: &mut watch::Receiver<bool>,
) -> Result<LanTransferCopyResult, String> {
    if *cancel_rx.borrow() {
        return Err("cancelled".to_string());
    }

    fs::create_dir_all(&resolved.target_path)
        .map_err(|error| format!("Could not create LAN transfer target folder: {error}"))?;

    let bytes_total = source_files
        .iter()
        .fold(0_u64, |sum, file| sum.saturating_add(file.size_bytes));
    let mut copied_manifest_files = Vec::with_capacity(source_files.len());
    let mut result_files = Vec::with_capacity(source_files.len());
    let mut bytes_copied = 0_u64;

    for source_file in source_files {
        if *cancel_rx.borrow() {
            return Err("cancelled".to_string());
        }

        let copied = copy_lan_transfer_file_cancelable(resolved, source_file, cancel_rx)?;
        verify_copied_lan_file(source_file, &copied)?;
        bytes_copied = bytes_copied.saturating_add(copied.size_bytes.unwrap_or(0));
        result_files.push(LanTransferCopyFile {
            relative_path: copied.path.clone(),
            size_bytes: copied.size_bytes.unwrap_or(0),
            sha256: copied.sha256.clone(),
        });
        copied_manifest_files.push(copied);

        let progress = bytes_copied
            .saturating_mul(95)
            .checked_div(bytes_total)
            .unwrap_or(0)
            .min(95) as u32;
        update_lan_transfer_copy_job(job_id, |job| {
            job.bytes_copied = bytes_copied;
            job.copied_file_count = result_files.len();
            job.progress = progress;
            job.message = format!(
                "LAN transfer copy job copied {}/{} files.",
                result_files.len(),
                source_files.len()
            );
        });
    }

    if *cancel_rx.borrow() {
        return Err("cancelled".to_string());
    }

    let executable_path = find_launch_executable(&resolved.target_path, &resolved.title)
        .and_then(|path| og_manifest_relative_path(&resolved.target_path, &path));
    let manifest = OgManagedManifest {
        game_id: resolved.game_id.clone(),
        title: resolved.title.clone(),
        version: "lan-copy-job".to_string(),
        managed_by: "OG-Launcher".to_string(),
        files: copied_manifest_files,
        executable_path: executable_path.clone(),
        ..Default::default()
    };
    write_and_verify_lan_manifest(&resolved.target_path, &manifest)?;

    Ok(LanTransferCopyResult {
        game_id: resolved.game_id.clone(),
        title: resolved.title.clone(),
        source_path: path_to_string(&resolved.source_path),
        target_path: path_to_string(&resolved.target_path),
        manifest_path: path_to_string(&resolved.target_path.join(OG_MANAGED_MANIFEST_FILE)),
        executable_path,
        file_count: result_files.len(),
        bytes_copied,
        verified_files: result_files.len(),
        files: result_files,
        message: "LAN transfer cancellable copy job completed with manifest hash verification."
            .to_string(),
    })
}

fn resolve_lan_transfer_paths(
    game_id: &str,
    title: &str,
    source_path: &str,
    target_path: &str,
) -> Result<ResolvedLanTransferCopy, String> {
    let game_id = normalize_game_id(game_id.to_string())?;
    let title = title.trim();
    if title.is_empty() {
        return Err("LAN transfer title must not be empty.".to_string());
    }

    let source_path = canonical_existing_dir(source_path, "source")?;
    let target_path = canonical_target_candidate(target_path)?;
    if target_path.starts_with(&source_path) {
        return Err("LAN transfer target must not be inside the source folder.".to_string());
    }
    if source_path.starts_with(&target_path) {
        return Err("LAN transfer source must not be inside the target folder.".to_string());
    }

    Ok(ResolvedLanTransferCopy {
        game_id,
        title: title.to_string(),
        source_path,
        target_path,
    })
}

fn validate_lan_transfer_copy_consent(
    input: &LanTransferCopyRequest,
    operation: &str,
    label: &str,
) -> Result<(), String> {
    if !input.consent.accepted {
        return Err(format!("LAN transfer {label} requires explicit consent."));
    }
    if input.consent.operation != operation {
        return Err(format!("LAN transfer {label} consent operation mismatch."));
    }
    if input.consent.source_path.trim() != input.source_path.trim() {
        return Err(format!("LAN transfer {label} consent source mismatch."));
    }
    if input.consent.target_path.trim() != input.target_path.trim() {
        return Err(format!("LAN transfer {label} consent target mismatch."));
    }
    Ok(())
}

fn validate_lan_transfer_peer_discovery_preflight_consent(
    input: &LanTransferPeerDiscoveryPreflightRequest,
) -> Result<(), String> {
    if !input.consent.accepted {
        return Err("LAN peer discovery preflight requires explicit consent.".to_string());
    }
    if input.consent.operation != LAN_PEER_DISCOVERY_PREFLIGHT_OPERATION {
        return Err("LAN peer discovery preflight consent operation mismatch.".to_string());
    }
    Ok(())
}

fn validate_lan_transfer_cleanup_candidates_consent(
    input: &LanTransferCleanupCandidatesRequest,
) -> Result<(), String> {
    if !input.consent.accepted {
        return Err("LAN transfer cleanup requires explicit consent.".to_string());
    }
    if input.consent.operation != LAN_CLEANUP_CANDIDATES_OPERATION {
        return Err("LAN transfer cleanup consent operation mismatch.".to_string());
    }
    if input.consent.source_path.trim() != input.source_path.trim() {
        return Err("LAN transfer cleanup consent source mismatch.".to_string());
    }
    if input.consent.target_path.trim() != input.target_path.trim() {
        return Err("LAN transfer cleanup consent target mismatch.".to_string());
    }
    Ok(())
}

fn inspect_lan_transfer_manual_source(
    value: &str,
) -> Result<LanTransferPeerDiscoveryManualSource, String> {
    let source_path = canonical_existing_dir(value, "manual source")?;
    let files = collect_lan_transfer_files(&source_path, false)?;
    let bytes_total = files
        .iter()
        .fold(0_u64, |sum, file| sum.saturating_add(file.size_bytes));

    Ok(LanTransferPeerDiscoveryManualSource {
        path: path_to_string(&source_path),
        reachable: true,
        file_count: files.len(),
        bytes_total,
        symlink_free: true,
    })
}

fn canonical_existing_dir(value: &str, label: &str) -> Result<PathBuf, String> {
    let path = raw_absolute_path(value, label)?;
    if is_symlink(&path)? {
        return Err(format!(
            "LAN transfer {label} folder must not be a symbolic link."
        ));
    }
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("Could not read LAN transfer {label} folder: {error}"))?;
    if !canonical.is_dir() {
        return Err(format!("LAN transfer {label} path must be a folder."));
    }
    Ok(canonical)
}

fn canonical_target_candidate(value: &str) -> Result<PathBuf, String> {
    let path = raw_absolute_path(value, "target")?;
    if path_is_root(&path) {
        return Err("LAN transfer target must not be a filesystem root.".to_string());
    }
    if path.exists() {
        if is_symlink(&path)? {
            return Err("LAN transfer target folder must not be a symbolic link.".to_string());
        }
        let canonical = path
            .canonicalize()
            .map_err(|error| format!("Could not read LAN transfer target folder: {error}"))?;
        if !canonical.is_dir() {
            return Err("LAN transfer target path must be a folder.".to_string());
        }
        return Ok(canonical);
    }

    let parent = path
        .parent()
        .ok_or_else(|| "LAN transfer target must have a parent folder.".to_string())?;
    if is_symlink(parent)? {
        return Err("LAN transfer target parent folder must not be a symbolic link.".to_string());
    }
    let parent = parent
        .canonicalize()
        .map_err(|error| format!("Could not read LAN transfer target parent: {error}"))?;
    let name = path
        .file_name()
        .ok_or_else(|| "LAN transfer target must include a folder name.".to_string())?;
    Ok(parent.join(name))
}

fn raw_absolute_path(value: &str, label: &str) -> Result<PathBuf, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("LAN transfer {label} path must not be empty."));
    }
    let path = PathBuf::from(trimmed);
    if !path.is_absolute() {
        return Err(format!("LAN transfer {label} path must be absolute."));
    }
    if path
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        return Err(format!(
            "LAN transfer {label} path must not contain parent traversal segments."
        ));
    }
    Ok(path)
}

fn ensure_empty_copy_target(target_path: &Path) -> Result<(), String> {
    if !target_path.exists() {
        return Ok(());
    }
    let mut entries = fs::read_dir(target_path)
        .map_err(|error| format!("Could not inspect LAN transfer target folder: {error}"))?;
    if entries.next().is_some() {
        return Err(
            "LAN transfer target folder must be empty; resume and overwrite are not enabled yet."
                .to_string(),
        );
    }
    Ok(())
}

fn collect_lan_transfer_files(
    root: &Path,
    include_hashes: bool,
) -> Result<Vec<LanTransferCopyFile>, String> {
    let mut files = Vec::new();
    collect_lan_transfer_files_inner(root, root, include_hashes, &mut files)?;
    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(files)
}

fn collect_lan_transfer_cleanup_candidates(
    target_root: &Path,
    source_relative_paths: &HashSet<String>,
    candidates: &mut Vec<LanTransferResumeCancelCleanupCandidate>,
) -> Result<(), String> {
    if !target_root.exists() {
        return Ok(());
    }
    collect_lan_transfer_cleanup_candidates_inner(
        target_root,
        target_root,
        source_relative_paths,
        candidates,
    )
}

fn collect_lan_transfer_cleanup_candidates_inner(
    root: &Path,
    current: &Path,
    source_relative_paths: &HashSet<String>,
    candidates: &mut Vec<LanTransferResumeCancelCleanupCandidate>,
) -> Result<(), String> {
    for entry in fs::read_dir(current)
        .map_err(|error| format!("Could not read LAN transfer target folder: {error}"))?
    {
        let entry =
            entry.map_err(|error| format!("Could not read LAN transfer target entry: {error}"))?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)
            .map_err(|error| format!("Could not inspect LAN transfer target entry: {error}"))?;
        let relative_path = relative_manifest_path(root, &path)?;
        if relative_path.eq_ignore_ascii_case(OG_MANAGED_MANIFEST_FILE) {
            continue;
        }
        if metadata.is_dir() && !metadata.file_type().is_symlink() {
            collect_lan_transfer_cleanup_candidates_inner(
                root,
                &path,
                source_relative_paths,
                candidates,
            )?;
            continue;
        }
        if source_relative_paths.contains(&relative_path) {
            continue;
        }

        let entry_kind = if metadata.file_type().is_symlink() {
            "symlink"
        } else if metadata.is_file() {
            "file"
        } else {
            "unsupported"
        };
        candidates.push(LanTransferResumeCancelCleanupCandidate {
            relative_path,
            entry_kind: entry_kind.to_string(),
            size_bytes: metadata.is_file().then_some(metadata.len()),
        });
    }
    Ok(())
}

fn collect_lan_transfer_files_inner(
    root: &Path,
    current: &Path,
    include_hashes: bool,
    files: &mut Vec<LanTransferCopyFile>,
) -> Result<(), String> {
    for entry in fs::read_dir(current)
        .map_err(|error| format!("Could not read LAN transfer source folder: {error}"))?
    {
        let entry =
            entry.map_err(|error| format!("Could not read LAN transfer source entry: {error}"))?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)
            .map_err(|error| format!("Could not inspect LAN transfer source entry: {error}"))?;
        if metadata.file_type().is_symlink() {
            return Err("LAN transfer source must not contain symbolic links.".to_string());
        }
        if metadata.is_dir() {
            collect_lan_transfer_files_inner(root, &path, include_hashes, files)?;
            continue;
        }
        if !metadata.is_file() {
            return Err(
                "LAN transfer source contains an unsupported filesystem entry.".to_string(),
            );
        }

        let relative_path = relative_manifest_path(root, &path)?;
        if relative_path.eq_ignore_ascii_case(OG_MANAGED_MANIFEST_FILE) {
            continue;
        }
        files.push(LanTransferCopyFile {
            relative_path,
            size_bytes: metadata.len(),
            sha256: include_hashes.then(|| sha256_file_hex(&path)).transpose()?,
        });
    }
    Ok(())
}

fn relative_manifest_path(root: &Path, path: &Path) -> Result<String, String> {
    let relative = path
        .strip_prefix(root)
        .map_err(|_| "LAN transfer source entry escaped its root.".to_string())?;
    if relative.components().any(|component| {
        matches!(
            component,
            Component::Prefix(_) | Component::RootDir | Component::ParentDir
        )
    }) {
        return Err("LAN transfer source entry has an unsafe relative path.".to_string());
    }
    let value = relative
        .components()
        .filter_map(|component| match component {
            Component::Normal(value) => Some(value.to_string_lossy().to_string()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/");
    if value.trim().is_empty() {
        return Err("LAN transfer source entry path must not be empty.".to_string());
    }
    Ok(value)
}

fn copy_lan_transfer_file(
    resolved: &ResolvedLanTransferCopy,
    source_file: &LanTransferCopyFile,
) -> Result<OgManagedManifestFile, String> {
    let source_path = og_manifest_path_for_entry(&resolved.source_path, &source_file.relative_path)
        .ok_or_else(|| "LAN transfer source contains an unsafe relative path.".to_string())?;
    let target_path = og_manifest_path_for_entry(&resolved.target_path, &source_file.relative_path)
        .ok_or_else(|| "LAN transfer target contains an unsafe relative path.".to_string())?;
    if target_path.exists() {
        return Err(format!(
            "LAN transfer target file changed during resume copy for {}.",
            source_file.relative_path
        ));
    }
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create LAN transfer target folder: {error}"))?;
    }

    fs::copy(&source_path, &target_path)
        .map_err(|error| format!("Could not copy LAN transfer file: {error}"))?;

    og_manifest_file_for_path(&resolved.target_path, &target_path)
        .ok_or_else(|| "Copied LAN transfer file could not be added to manifest.".to_string())
}

fn copy_lan_transfer_file_cancelable(
    resolved: &ResolvedLanTransferCopy,
    source_file: &LanTransferCopyFile,
    cancel_rx: &watch::Receiver<bool>,
) -> Result<OgManagedManifestFile, String> {
    let source_path = og_manifest_path_for_entry(&resolved.source_path, &source_file.relative_path)
        .ok_or_else(|| "LAN transfer source contains an unsafe relative path.".to_string())?;
    let target_path = og_manifest_path_for_entry(&resolved.target_path, &source_file.relative_path)
        .ok_or_else(|| "LAN transfer target contains an unsafe relative path.".to_string())?;
    if target_path.exists() {
        return Err(format!(
            "LAN transfer target file changed during copy job for {}.",
            source_file.relative_path
        ));
    }
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create LAN transfer target folder: {error}"))?;
    }

    let copy_result = copy_file_in_cancelable_chunks(&source_path, &target_path, cancel_rx);
    if matches!(&copy_result, Err(error) if error == "cancelled") {
        cleanup_partial_lan_copy_file(&target_path)?;
    }
    copy_result?;

    og_manifest_file_for_path(&resolved.target_path, &target_path)
        .ok_or_else(|| "Copied LAN transfer file could not be added to manifest.".to_string())
}

fn copy_file_in_cancelable_chunks(
    source_path: &Path,
    target_path: &Path,
    cancel_rx: &watch::Receiver<bool>,
) -> Result<(), String> {
    let mut source = File::open(source_path)
        .map_err(|error| format!("Could not open LAN transfer source file: {error}"))?;
    let mut target = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target_path)
        .map_err(|error| format!("Could not create LAN transfer target file: {error}"))?;
    let mut buffer = vec![0_u8; LAN_COPY_JOB_CHUNK_SIZE];

    loop {
        if *cancel_rx.borrow() {
            return Err("cancelled".to_string());
        }
        let read = source
            .read(&mut buffer)
            .map_err(|error| format!("Could not read LAN transfer source file: {error}"))?;
        if read == 0 {
            break;
        }
        if *cancel_rx.borrow() {
            return Err("cancelled".to_string());
        }
        target
            .write_all(&buffer[..read])
            .map_err(|error| format!("Could not write LAN transfer target file: {error}"))?;
    }
    target
        .sync_all()
        .map_err(|error| format!("Could not flush LAN transfer target file: {error}"))?;
    Ok(())
}

fn cleanup_partial_lan_copy_file(target_path: &Path) -> Result<(), String> {
    let Ok(metadata) = fs::symlink_metadata(target_path) else {
        return Ok(());
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(
            "LAN transfer cancel refused to delete a changed partial target entry.".to_string(),
        );
    }
    fs::remove_file(target_path)
        .map_err(|error| format!("Could not delete partial LAN transfer target file: {error}"))
}

fn verify_existing_lan_transfer_file(
    resolved: &ResolvedLanTransferCopy,
    source_file: &LanTransferCopyFile,
) -> Result<OgManagedManifestFile, String> {
    let target_path = og_manifest_path_for_entry(&resolved.target_path, &source_file.relative_path)
        .ok_or_else(|| "LAN transfer target contains an unsafe relative path.".to_string())?;
    let metadata = fs::symlink_metadata(&target_path)
        .map_err(|error| format!("Could not inspect LAN transfer target entry: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(format!(
            "LAN transfer resume copy target is not a reusable file for {}.",
            source_file.relative_path
        ));
    }
    let existing = og_manifest_file_for_path(&resolved.target_path, &target_path)
        .ok_or_else(|| "Reusable LAN transfer file could not be added to manifest.".to_string())?;
    verify_copied_lan_file(source_file, &existing)?;
    Ok(existing)
}

fn write_and_verify_lan_manifest(
    target_path: &Path,
    manifest: &OgManagedManifest,
) -> Result<(), String> {
    ensure_lan_manifest_path_safe(target_path)?;
    write_og_managed_manifest_details(target_path, manifest)?;
    let written = read_og_managed_manifest(target_path)
        .ok_or_else(|| "LAN transfer manifest could not be read back after write.".to_string())?;
    verify_og_managed_manifest_signature(target_path, &written)?;
    if written.game_id != manifest.game_id
        || written.title != manifest.title
        || written.version != manifest.version
        || written.files.len() != manifest.files.len()
    {
        return Err(
            "LAN transfer manifest readback did not match the written manifest.".to_string(),
        );
    }
    for expected_file in &manifest.files {
        let Some(written_file) = written
            .files
            .iter()
            .find(|file| file.path == expected_file.path)
        else {
            return Err(format!(
                "LAN transfer manifest readback is missing {}.",
                expected_file.path
            ));
        };
        if written_file.size_bytes != expected_file.size_bytes
            || written_file.sha256 != expected_file.sha256
        {
            return Err(format!(
                "LAN transfer manifest readback changed file metadata for {}.",
                expected_file.path
            ));
        }
    }
    Ok(())
}

fn ensure_lan_manifest_path_safe(target_path: &Path) -> Result<(), String> {
    let manifest_path = target_path.join(OG_MANAGED_MANIFEST_FILE);
    let Ok(metadata) = fs::symlink_metadata(&manifest_path) else {
        return Ok(());
    };
    if metadata.file_type().is_symlink() {
        return Err("LAN transfer manifest path must not be a symbolic link.".to_string());
    }
    if !metadata.is_file() {
        return Err("LAN transfer manifest path must be a regular file.".to_string());
    }
    Ok(())
}

fn verify_copied_lan_file(
    expected: &LanTransferCopyFile,
    copied: &OgManagedManifestFile,
) -> Result<(), String> {
    if copied.path != expected.relative_path {
        return Err("LAN transfer copied file path changed during copy.".to_string());
    }
    if copied.size_bytes != Some(expected.size_bytes) {
        return Err(format!(
            "LAN transfer copied file size mismatch for {}.",
            expected.relative_path
        ));
    }
    if copied.sha256.as_deref() != expected.sha256.as_deref() {
        return Err(format!(
            "LAN transfer copied file SHA-256 mismatch for {}.",
            expected.relative_path
        ));
    }
    Ok(())
}

fn delete_lan_transfer_cleanup_candidate(
    target_root: &Path,
    candidate: &LanTransferResumeCancelCleanupCandidate,
) -> Result<(), String> {
    if candidate
        .relative_path
        .eq_ignore_ascii_case(OG_MANAGED_MANIFEST_FILE)
    {
        return Err("LAN transfer cleanup must not delete the OG manifest.".to_string());
    }
    let candidate_path = og_manifest_path_for_entry(target_root, &candidate.relative_path)
        .ok_or_else(|| "LAN transfer cleanup candidate path is unsafe.".to_string())?;
    let metadata = fs::symlink_metadata(&candidate_path)
        .map_err(|error| format!("Could not inspect LAN transfer cleanup candidate: {error}"))?;
    if metadata.is_dir() && !metadata.file_type().is_symlink() {
        return Err("LAN transfer cleanup refuses to delete directories recursively.".to_string());
    }
    let actual_kind = if metadata.file_type().is_symlink() {
        "symlink"
    } else if metadata.is_file() {
        "file"
    } else {
        "unsupported"
    };
    if actual_kind != candidate.entry_kind {
        return Err(format!(
            "LAN transfer cleanup candidate changed during review for {}.",
            candidate.relative_path
        ));
    }

    fs::remove_file(&candidate_path)
        .map_err(|error| format!("Could not delete LAN transfer cleanup candidate: {error}"))?;
    match fs::symlink_metadata(&candidate_path) {
        Ok(_) => Err(format!(
            "LAN transfer cleanup candidate still exists after delete for {}.",
            candidate.relative_path
        )),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "Could not verify LAN transfer cleanup candidate removal: {error}"
        )),
    }
}

fn is_symlink(path: &Path) -> Result<bool, String> {
    fs::symlink_metadata(path)
        .map(|metadata| metadata.file_type().is_symlink())
        .map_err(|error| format!("Could not inspect LAN transfer path: {error}"))
}

fn path_is_root(path: &Path) -> bool {
    path.components()
        .all(|component| !matches!(component, Component::Normal(_)))
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        env,
        time::{Duration, SystemTime, UNIX_EPOCH},
    };

    fn unique_test_nonce() -> u128 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    }

    fn temp_test_dir(label: &str) -> PathBuf {
        let nonce = unique_test_nonce();
        let path = env::temp_dir().join(format!("og-lan-copy-{label}-{nonce}"));
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn request(source_path: &Path, target_path: &Path) -> LanTransferCopyRequest {
        let source_path = path_to_string(source_path);
        let target_path = path_to_string(target_path);
        LanTransferCopyRequest {
            game_id: "lan-game-1".to_string(),
            title: "LAN Game".to_string(),
            consent: LanTransferCopyConsent {
                accepted: true,
                operation: LAN_COPY_OPERATION.to_string(),
                source_path: source_path.clone(),
                target_path: target_path.clone(),
            },
            source_path,
            target_path,
        }
    }

    fn resume_request(source_path: &Path, target_path: &Path) -> LanTransferCopyRequest {
        let mut input = request(source_path, target_path);
        input.consent.operation = LAN_RESUME_COPY_OPERATION.to_string();
        input
    }

    fn ledger_request(
        source_path: &Path,
        target_path: &Path,
    ) -> LanTransferResumeCancelLedgerRequest {
        LanTransferResumeCancelLedgerRequest {
            game_id: "lan-game-1".to_string(),
            title: "LAN Game".to_string(),
            source_path: path_to_string(source_path),
            target_path: path_to_string(target_path),
        }
    }

    fn cleanup_request(
        source_path: &Path,
        target_path: &Path,
        cleanup_candidate_count: usize,
    ) -> LanTransferCleanupCandidatesRequest {
        let source_path = path_to_string(source_path);
        let target_path = path_to_string(target_path);
        LanTransferCleanupCandidatesRequest {
            game_id: "lan-game-1".to_string(),
            title: "LAN Game".to_string(),
            consent: LanTransferCleanupCandidatesConsent {
                accepted: true,
                cleanup_candidate_count,
                operation: LAN_CLEANUP_CANDIDATES_OPERATION.to_string(),
                source_path: source_path.clone(),
                target_path: target_path.clone(),
            },
            source_path,
            target_path,
        }
    }

    fn discovery_preflight_request(
        manual_source_path: Option<&Path>,
    ) -> LanTransferPeerDiscoveryPreflightRequest {
        LanTransferPeerDiscoveryPreflightRequest {
            consent: LanTransferPeerDiscoveryPreflightConsent {
                accepted: true,
                operation: LAN_PEER_DISCOVERY_PREFLIGHT_OPERATION.to_string(),
            },
            manual_source_path: manual_source_path.map(path_to_string),
        }
    }

    fn remove_lan_copy_job(job_id: &str) {
        if let Ok(mut guard) = get_lan_transfer_copy_job_manager().lock() {
            guard.remove(job_id);
        }
    }

    fn wait_for_lan_copy_job(job_id: &str) -> LanTransferCopyJob {
        for _ in 0..100 {
            let jobs = get_lan_transfer_copy_jobs().unwrap();
            if let Some(job) = jobs
                .into_iter()
                .find(|job| job.job_id == job_id && is_lan_transfer_copy_job_terminal(&job.status))
            {
                return job;
            }
            thread::sleep(Duration::from_millis(10));
        }
        panic!("LAN copy job did not reach a terminal state");
    }

    #[test]
    fn lan_copy_job_ids_include_sequence_for_parallel_starts() {
        let first = build_lan_transfer_copy_job_id("lan-game-1");
        let second = build_lan_transfer_copy_job_id("lan-game-1");

        assert_ne!(first, second);
        assert!(first.starts_with("lan-copy-lan-game-1-"));
        assert!(second.starts_with("lan-copy-lan-game-1-"));
    }

    #[test]
    fn preview_lan_peer_discovery_preflight_never_runs_network_automation() {
        let result =
            preview_lan_transfer_peer_discovery_preflight(discovery_preflight_request(None))
                .unwrap();

        assert_eq!(result.operation, LAN_PEER_DISCOVERY_PREFLIGHT_OPERATION);
        assert_eq!(result.status, "warning");
        assert!(!result.broadcast_sent);
        assert!(!result.relay_called);
        assert!(!result.firewall_rule_changed);
        assert!(!result.share_mounted);
        assert!(result.loopback_tcp_bind_ready);
        assert!(result.loopback_udp_bind_ready);
        assert_eq!(result.redacted_endpoint, "127.0.0.1:<ephemeral>");
        assert!(result.manual_source.is_none());
        assert!(result
            .guards
            .contains(&"No UDP broadcast is sent".to_string()));
        assert!(result
            .guards
            .contains(&"No relay request is executed".to_string()));
        assert!(result
            .guards
            .contains(&"No firewall rule is changed".to_string()));
        assert!(result.message.contains("without broadcast"));
    }

    #[test]
    fn preview_lan_peer_discovery_preflight_inspects_manual_source_without_copying() {
        let root = temp_test_dir("peer-preflight");
        let source = root.join("source");
        fs::create_dir_all(source.join("data")).unwrap();
        fs::write(source.join("data").join("asset.bin"), b"asset").unwrap();

        let result = preview_lan_transfer_peer_discovery_preflight(discovery_preflight_request(
            Some(&source),
        ))
        .unwrap();
        let manual_source = result.manual_source.unwrap();

        assert_eq!(
            manual_source.path,
            path_to_string(&source.canonicalize().unwrap())
        );
        assert!(manual_source.reachable);
        assert!(manual_source.symlink_free);
        assert_eq!(manual_source.file_count, 1);
        assert_eq!(manual_source.bytes_total, 5);
        assert!(!root.join("target").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn preview_lan_peer_discovery_preflight_requires_exact_consent() {
        let mut input = discovery_preflight_request(None);
        input.consent.operation = "lan_native_copy_verify_manifest".to_string();

        let error = preview_lan_transfer_peer_discovery_preflight(input).unwrap_err();

        assert_eq!(
            error,
            "LAN peer discovery preflight consent operation mismatch."
        );
    }

    #[test]
    fn preview_lan_transfer_copy_summarizes_source_without_copying() {
        let root = temp_test_dir("preview");
        let source = root.join("source");
        let target = root.join("target");
        fs::create_dir_all(source.join("data")).unwrap();
        fs::write(source.join("data").join("asset.bin"), b"asset").unwrap();

        let preview = preview_lan_transfer_copy(request(&source, &target)).unwrap();

        assert_eq!(preview.file_count, 1);
        assert_eq!(preview.bytes_total, 5);
        assert_eq!(preview.files[0].relative_path, "data/asset.bin");
        assert!(!target.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn run_lan_transfer_copy_copies_hashes_and_writes_manifest() {
        let root = temp_test_dir("run");
        let source = root.join("source");
        let target = root.join("target");
        fs::create_dir_all(source.join("bin")).unwrap();
        let executable = source.join("bin").join("LAN Game.exe");
        fs::write(&executable, b"exe").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut permissions = fs::metadata(&executable).unwrap().permissions();
            permissions.set_mode(0o755);
            fs::set_permissions(&executable, permissions).unwrap();
        }
        fs::write(source.join("data.pak"), b"payload").unwrap();

        let result = run_lan_transfer_copy(request(&source, &target)).unwrap();

        assert_eq!(result.file_count, 2);
        assert_eq!(result.verified_files, 2);
        assert_eq!(result.bytes_copied, 10);
        assert!(target.join("bin").join("LAN Game.exe").exists());
        assert!(target.join("data.pak").exists());
        assert!(target.join(OG_MANAGED_MANIFEST_FILE).exists());
        assert_eq!(result.executable_path.as_deref(), Some("bin/LAN Game.exe"));
        assert!(result
            .files
            .iter()
            .all(|file| file.sha256.as_deref().is_some_and(|hash| hash.len() == 64)));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn run_lan_transfer_copy_requires_matching_consent() {
        let root = temp_test_dir("consent");
        let source = root.join("source");
        let target = root.join("target");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("game.bin"), b"payload").unwrap();
        let mut input = request(&source, &target);
        input.consent.target_path = path_to_string(&root.join("other"));

        let error = run_lan_transfer_copy(input).unwrap_err();

        assert!(error.contains("consent target mismatch"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn start_lan_transfer_copy_job_completes_with_manifest() {
        let root = temp_test_dir("job-complete");
        let source = root.join("source");
        let target = root.join("target");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("game.bin"), b"payload").unwrap();

        let job = start_lan_transfer_copy_job(request(&source, &target)).unwrap();
        let completed = wait_for_lan_copy_job(&job.job_id);

        assert_eq!(completed.status, LAN_COPY_JOB_STATUS_COMPLETED);
        assert_eq!(completed.progress, 100);
        assert_eq!(completed.copied_file_count, 1);
        assert_eq!(completed.bytes_copied, 7);
        assert!(!completed.can_cancel);
        assert!(completed.manifest_path.is_some());
        assert!(target.join("game.bin").exists());
        assert!(target.join(OG_MANAGED_MANIFEST_FILE).exists());
        remove_lan_copy_job(&job.job_id);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn cancel_lan_transfer_copy_job_marks_active_job_cancelling() {
        let job_id = format!("lan-copy-test-{}", unique_test_nonce());
        let (cancel_tx, cancel_rx) = watch::channel(false);
        {
            let mut guard = get_lan_transfer_copy_job_manager().lock().unwrap();
            guard.insert(
                job_id.clone(),
                ActiveLanTransferCopyJob {
                    job: LanTransferCopyJob {
                        job_id: job_id.clone(),
                        game_id: "lan-game-1".to_string(),
                        title: "LAN Game".to_string(),
                        source_path: "/tmp/source".to_string(),
                        target_path: "/tmp/target".to_string(),
                        status: LAN_COPY_JOB_STATUS_RUNNING.to_string(),
                        progress: 12,
                        bytes_copied: 4,
                        bytes_total: 20,
                        copied_file_count: 1,
                        file_count: 3,
                        can_cancel: true,
                        manifest_path: None,
                        executable_path: None,
                        error: None,
                        message: "running".to_string(),
                    },
                    cancel_tx,
                },
            );
        }

        let cancelled = cancel_lan_transfer_copy_job(job_id.clone()).unwrap();

        assert_eq!(cancelled.status, LAN_COPY_JOB_STATUS_CANCELLING);
        assert!(!cancelled.can_cancel);
        assert!(*cancel_rx.borrow());
        remove_lan_copy_job(&job_id);
    }

    #[test]
    fn cancelable_lan_copy_removes_partial_file_before_manifest() {
        let root = temp_test_dir("job-cancel-partial");
        let source = root.join("source");
        let target = root.join("target");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(
            source.join("game.bin"),
            vec![1_u8; LAN_COPY_JOB_CHUNK_SIZE + 5],
        )
        .unwrap();
        let resolved = resolve_lan_transfer_paths(
            "lan-game-1",
            "LAN Game",
            &path_to_string(&source),
            &path_to_string(&target),
        )
        .unwrap();
        let source_file = LanTransferCopyFile {
            relative_path: "game.bin".to_string(),
            size_bytes: (LAN_COPY_JOB_CHUNK_SIZE + 5) as u64,
            sha256: None,
        };
        let (_cancel_tx, cancel_rx) = watch::channel(true);

        let error =
            copy_lan_transfer_file_cancelable(&resolved, &source_file, &cancel_rx).unwrap_err();

        assert_eq!(error, "cancelled");
        assert!(!target.join("game.bin").exists());
        assert!(!target.join(OG_MANAGED_MANIFEST_FILE).exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn preview_lan_transfer_resume_cancel_ledger_classifies_target_state() {
        let root = temp_test_dir("resume-ledger");
        let source = root.join("source");
        let target = root.join("target");
        fs::create_dir_all(source.join("data")).unwrap();
        fs::create_dir_all(target.join("data")).unwrap();
        fs::write(source.join("data").join("same.bin"), b"same").unwrap();
        fs::write(source.join("data").join("missing.bin"), b"missing").unwrap();
        fs::write(source.join("data").join("changed.bin"), b"source").unwrap();
        fs::write(target.join("data").join("same.bin"), b"same").unwrap();
        fs::write(target.join("data").join("changed.bin"), b"target").unwrap();
        fs::write(target.join("stale.tmp"), b"stale").unwrap();

        let ledger =
            preview_lan_transfer_resume_cancel_ledger(ledger_request(&source, &target)).unwrap();

        assert_eq!(ledger.reusable_file_count, 1);
        assert_eq!(ledger.pending_file_count, 1);
        assert_eq!(ledger.conflict_file_count, 1);
        assert_eq!(ledger.cleanup_candidate_count, 1);
        assert_eq!(ledger.bytes_reusable, 4);
        assert_eq!(ledger.bytes_pending, 7);
        assert_eq!(ledger.bytes_conflicting, 6);
        assert!(ledger.files.iter().any(|file| {
            file.relative_path == "data/same.bin"
                && file.status == "reusable"
                && file.target_sha256.is_some()
        }));
        assert!(ledger.files.iter().any(|file| {
            file.relative_path == "data/missing.bin"
                && file.status == "pending"
                && file.target_sha256.is_none()
        }));
        assert!(ledger.files.iter().any(|file| {
            file.relative_path == "data/changed.bin"
                && file.status == "conflict"
                && file.target_sha256.is_some()
        }));
        assert_eq!(ledger.cleanup_candidates[0].relative_path, "stale.tmp");
        assert!(target.join("stale.tmp").exists());
        assert!(!target.join(OG_MANAGED_MANIFEST_FILE).exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn run_lan_transfer_resume_copy_reuses_existing_and_copies_pending() {
        let root = temp_test_dir("resume-run");
        let source = root.join("source");
        let target = root.join("target");
        fs::create_dir_all(source.join("data")).unwrap();
        fs::create_dir_all(target.join("data")).unwrap();
        fs::write(source.join("data").join("same.bin"), b"same").unwrap();
        fs::write(source.join("data").join("missing.bin"), b"missing").unwrap();
        fs::write(target.join("data").join("same.bin"), b"same").unwrap();

        let result = run_lan_transfer_resume_copy(resume_request(&source, &target)).unwrap();

        assert_eq!(result.file_count, 2);
        assert_eq!(result.verified_files, 2);
        assert_eq!(result.reused_file_count, 1);
        assert_eq!(result.copied_file_count, 1);
        assert_eq!(result.bytes_reused, 4);
        assert_eq!(result.bytes_copied, 7);
        assert!(target.join("data").join("same.bin").exists());
        assert!(target.join("data").join("missing.bin").exists());
        assert!(target.join(OG_MANAGED_MANIFEST_FILE).exists());
        assert!(result
            .files
            .iter()
            .all(|file| file.sha256.as_deref().is_some_and(|hash| hash.len() == 64)));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn run_lan_transfer_resume_copy_rejects_conflict_before_copying_pending_files() {
        let root = temp_test_dir("resume-conflict");
        let source = root.join("source");
        let target = root.join("target");
        fs::create_dir_all(source.join("data")).unwrap();
        fs::create_dir_all(target.join("data")).unwrap();
        fs::write(source.join("data").join("changed.bin"), b"source").unwrap();
        fs::write(source.join("data").join("missing.bin"), b"missing").unwrap();
        fs::write(target.join("data").join("changed.bin"), b"target").unwrap();

        let error = run_lan_transfer_resume_copy(resume_request(&source, &target)).unwrap_err();

        assert!(error.contains("conflict-free target"));
        assert!(!target.join("data").join("missing.bin").exists());
        assert!(!target.join(OG_MANAGED_MANIFEST_FILE).exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn run_lan_transfer_resume_copy_rejects_cleanup_candidates_before_manifest_write() {
        let root = temp_test_dir("resume-cleanup");
        let source = root.join("source");
        let target = root.join("target");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(source.join("game.bin"), b"payload").unwrap();
        fs::write(target.join("stale.tmp"), b"stale").unwrap();

        let error = run_lan_transfer_resume_copy(resume_request(&source, &target)).unwrap_err();

        assert!(error.contains("cleanup candidates"));
        assert!(target.join("stale.tmp").exists());
        assert!(!target.join("game.bin").exists());
        assert!(!target.join(OG_MANAGED_MANIFEST_FILE).exists());
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn run_lan_transfer_resume_copy_rejects_manifest_symlink() {
        use std::os::unix::fs::symlink;

        let root = temp_test_dir("resume-manifest-symlink");
        let source = root.join("source");
        let target = root.join("target");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(source.join("game.bin"), b"payload").unwrap();
        fs::write(target.join("game.bin"), b"payload").unwrap();
        fs::write(root.join("outside-manifest.json"), b"{}").unwrap();
        symlink(
            root.join("outside-manifest.json"),
            target.join(OG_MANAGED_MANIFEST_FILE),
        )
        .unwrap();

        let error = run_lan_transfer_resume_copy(resume_request(&source, &target)).unwrap_err();

        assert!(error.contains("manifest path must not be a symbolic link"));
        assert_eq!(fs::read(root.join("outside-manifest.json")).unwrap(), b"{}");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn run_lan_transfer_resume_copy_requires_resume_consent_operation() {
        let root = temp_test_dir("resume-consent");
        let source = root.join("source");
        let target = root.join("target");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("game.bin"), b"payload").unwrap();

        let error = run_lan_transfer_resume_copy(request(&source, &target)).unwrap_err();

        assert!(error.contains("resume copy consent operation mismatch"));
        assert!(!target.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn run_lan_transfer_cleanup_candidates_deletes_only_reviewed_target_extras() {
        let root = temp_test_dir("cleanup-run");
        let source = root.join("source");
        let target = root.join("target");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(target.join("nested")).unwrap();
        fs::write(source.join("game.bin"), b"payload").unwrap();
        fs::write(target.join("game.bin"), b"payload").unwrap();
        fs::write(target.join("stale.tmp"), b"stale").unwrap();
        fs::write(target.join("nested").join("stale.dat"), b"nested").unwrap();
        fs::write(target.join(OG_MANAGED_MANIFEST_FILE), b"manifest").unwrap();
        let mut expected_deleted_count = 2_usize;
        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;

            fs::write(root.join("outside.tmp"), b"outside").unwrap();
            symlink(root.join("outside.tmp"), target.join("stale-link.tmp")).unwrap();
            expected_deleted_count += 1;
        }

        let ledger =
            preview_lan_transfer_resume_cancel_ledger(ledger_request(&source, &target)).unwrap();
        assert_eq!(ledger.cleanup_candidate_count, expected_deleted_count);

        let result = run_lan_transfer_cleanup_candidates(cleanup_request(
            &source,
            &target,
            expected_deleted_count,
        ))
        .unwrap();

        assert_eq!(result.deleted_count, expected_deleted_count);
        assert!(!target.join("stale.tmp").exists());
        assert!(!target.join("nested").join("stale.dat").exists());
        assert!(target.join("nested").is_dir());
        assert!(target.join(OG_MANAGED_MANIFEST_FILE).exists());
        assert_eq!(fs::read(source.join("game.bin")).unwrap(), b"payload");
        #[cfg(unix)]
        assert!(fs::symlink_metadata(target.join("stale-link.tmp")).is_err());
        let post_cleanup_ledger =
            preview_lan_transfer_resume_cancel_ledger(ledger_request(&source, &target)).unwrap();
        assert_eq!(post_cleanup_ledger.cleanup_candidate_count, 0);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn run_lan_transfer_cleanup_candidates_rejects_conflicts_before_delete() {
        let root = temp_test_dir("cleanup-conflict");
        let source = root.join("source");
        let target = root.join("target");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(source.join("game.bin"), b"source").unwrap();
        fs::write(target.join("game.bin"), b"target").unwrap();
        fs::write(target.join("stale.tmp"), b"stale").unwrap();

        let error =
            run_lan_transfer_cleanup_candidates(cleanup_request(&source, &target, 1)).unwrap_err();

        assert!(error.contains("conflict-free target"));
        assert!(target.join("stale.tmp").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn run_lan_transfer_cleanup_candidates_rejects_count_mismatch() {
        let root = temp_test_dir("cleanup-count");
        let source = root.join("source");
        let target = root.join("target");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(source.join("game.bin"), b"payload").unwrap();
        fs::write(target.join("game.bin"), b"payload").unwrap();
        fs::write(target.join("stale.tmp"), b"stale").unwrap();

        let error =
            run_lan_transfer_cleanup_candidates(cleanup_request(&source, &target, 0)).unwrap_err();

        assert!(error.contains("candidate count changed"));
        assert!(target.join("stale.tmp").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn run_lan_transfer_cleanup_candidates_requires_cleanup_consent_operation() {
        let root = temp_test_dir("cleanup-consent");
        let source = root.join("source");
        let target = root.join("target");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("game.bin"), b"payload").unwrap();
        let mut input = cleanup_request(&source, &target, 0);
        input.consent.operation = LAN_RESUME_COPY_OPERATION.to_string();

        let error = run_lan_transfer_cleanup_candidates(input).unwrap_err();

        assert!(error.contains("cleanup consent operation mismatch"));
        assert!(!target.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn run_lan_transfer_copy_rejects_non_empty_target_without_resume() {
        let root = temp_test_dir("non-empty");
        let source = root.join("source");
        let target = root.join("target");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(source.join("game.bin"), b"payload").unwrap();
        fs::write(target.join("old.bin"), b"old").unwrap();

        let error = run_lan_transfer_copy(request(&source, &target)).unwrap_err();

        assert!(error.contains("must be empty"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn run_lan_transfer_copy_rejects_target_inside_source() {
        let root = temp_test_dir("inside");
        let source = root.join("source");
        let target = source.join("target");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("game.bin"), b"payload").unwrap();

        let error = run_lan_transfer_copy(request(&source, &target)).unwrap_err();

        assert!(error.contains("target must not be inside the source"));
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn run_lan_transfer_copy_rejects_symlink_entries() {
        use std::os::unix::fs::symlink;

        let root = temp_test_dir("symlink");
        let source = root.join("source");
        let target = root.join("target");
        fs::create_dir_all(&source).unwrap();
        fs::write(root.join("outside.bin"), b"payload").unwrap();
        symlink(root.join("outside.bin"), source.join("link.bin")).unwrap();

        let error = run_lan_transfer_copy(request(&source, &target)).unwrap_err();

        assert!(error.contains("symbolic links"));
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn run_lan_transfer_copy_rejects_symlink_target_parent() {
        use std::os::unix::fs::symlink;

        let root = temp_test_dir("target-parent-symlink");
        let source = root.join("source");
        let real_parent = root.join("real-parent");
        let link_parent = root.join("link-parent");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&real_parent).unwrap();
        fs::write(source.join("game.bin"), b"payload").unwrap();
        symlink(&real_parent, &link_parent).unwrap();

        let error =
            run_lan_transfer_copy(request(&source, &link_parent.join("target"))).unwrap_err();

        assert!(error.contains("target parent folder must not be a symbolic link"));
        assert!(!real_parent.join("target").exists());
        let _ = fs::remove_dir_all(root);
    }
}
