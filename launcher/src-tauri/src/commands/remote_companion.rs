use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value as JsonValue};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use uuid::Uuid;

use crate::commands::downloads::DownloadStartStatus;
use crate::commands::downloads::{
    redact_download_error_message, start_trusted_internal_download, InternalDownloadSource,
    InternalDownloadTerminalEvent, InternalDownloadTerminalHook, StartDownloadResponse,
};
use crate::commands::games::read_supabase_access_token;
use crate::commands::http::shared_http_client;

use super::secure_store;

const DEVICE_SECRET_DOMAIN: &str = "remote-companion-device";
const DEVICE_SECRET_PREFIX: &str = "ogd_";
const DEVICE_SECRET_MIN_LEN: usize = 24;
const DEVICE_SECRET_MAX_LEN: usize = 256;
const DEVICE_SECRET_HINT_MAX_LEN: usize = 32;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteCompanionDeviceSecretInput {
    pub device_id: String,
    pub device_secret: String,
    pub device_secret_hint: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RemoteCompanionDeviceSecretRecord {
    device_id: String,
    device_secret: String,
    device_secret_hint: Option<String>,
    updated_at_epoch_ms: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteCompanionDeviceSecretStatus {
    pub device_id: Option<String>,
    pub device_secret_hint: Option<String>,
    pub has_secret: bool,
    pub updated_at_epoch_ms: Option<u64>,
}

#[tauri::command]
pub fn save_remote_companion_device_secret(
    input: RemoteCompanionDeviceSecretInput,
) -> Result<RemoteCompanionDeviceSecretStatus, String> {
    let record = normalize_device_secret_input(input)?;
    let serialized = serde_json::to_string(&record)
        .map_err(|error| format!("Serialize remote companion device secret: {error}"))?;
    secure_store::set_secret(DEVICE_SECRET_DOMAIN, &serialized)?;
    Ok(status_from_record(Some(&record)))
}

#[tauri::command]
pub fn get_remote_companion_device_secret_status(
) -> Result<RemoteCompanionDeviceSecretStatus, String> {
    Ok(status_from_record(read_device_secret_record()?.as_ref()))
}

#[tauri::command]
pub fn clear_remote_companion_device_secret() -> Result<RemoteCompanionDeviceSecretStatus, String> {
    secure_store::delete_secret(DEVICE_SECRET_DOMAIN)?;
    Ok(status_from_record(None))
}

#[allow(dead_code)]
pub fn read_remote_companion_device_secret() -> Result<Option<(String, String)>, String> {
    Ok(read_device_secret_record()?.map(|record| (record.device_id, record.device_secret)))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteCompanionPollOnceInput {
    pub supabase_url: String,
    pub api_key: String,
    pub limit: Option<u8>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteCompanionPollOnceResult {
    pub configured: bool,
    pub claimed: usize,
    pub started: usize,
    pub failed: usize,
    pub jobs: Vec<RemoteCompanionPollJobResult>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteCompanionPollJobResult {
    pub game_id: String,
    pub job_id: String,
    pub local_queue_id: Option<String>,
    pub message: String,
    pub status: String,
}

#[tauri::command]
pub async fn remote_companion_poll_once(
    app: AppHandle,
    input: RemoteCompanionPollOnceInput,
) -> Result<RemoteCompanionPollOnceResult, String> {
    let Some(device) = read_device_credentials()? else {
        return Ok(unconfigured_poll_result());
    };
    let Some(auth_token) = read_supabase_access_token() else {
        return Ok(unconfigured_poll_result());
    };
    let function_client = SupabaseFunctionClient::new(input, auth_token)?;

    let ping_body = build_ping_body(&device);
    function_client
        .invoke_remote_companion_relay_rows::<JsonValue>(&ping_body)
        .await?;

    let limit = normalize_claim_limit(function_client.limit);
    let claim_body = build_claim_jobs_body(&device.device_id, &device.device_secret, limit);
    let claimed_jobs = function_client
        .invoke_remote_companion_relay_rows::<RemoteInstallClaimedJobRow>(&claim_body)
        .await?;

    let mut jobs = Vec::with_capacity(claimed_jobs.len());
    for job in claimed_jobs {
        jobs.push(process_claimed_job(&app, &function_client, &device, job).await);
    }

    let started = jobs.iter().filter(|job| job.status == "started").count();
    let failed = jobs.iter().filter(|job| job.status == "failed").count();

    Ok(RemoteCompanionPollOnceResult {
        configured: true,
        claimed: jobs.len(),
        started,
        failed,
        jobs,
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct DeviceCreds {
    device_id: String,
    device_secret: String,
}

#[derive(Debug, Clone)]
struct SupabaseFunctionClient {
    api_key: String,
    auth_token: String,
    limit: Option<u8>,
    supabase_url: String,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
struct RemoteInstallClaimedJobRow {
    #[serde(default)]
    build_id: Option<String>,
    game_id: String,
    job_id: String,
    #[serde(default)]
    platform: Option<String>,
    #[serde(default)]
    product_id: Option<String>,
    title: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoreBuildDownloadTicket {
    build: StoreBuildDownloadTicketBuild,
    url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoreBuildDownloadTicketBuild {
    #[serde(default)]
    sha256: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
struct RemoteInstallJobStatusRow {
    job_id: String,
    status: String,
}

impl SupabaseFunctionClient {
    fn new(input: RemoteCompanionPollOnceInput, auth_token: String) -> Result<Self, String> {
        Ok(Self {
            api_key: normalize_api_key(&input.api_key)?,
            auth_token,
            limit: input.limit,
            supabase_url: normalize_supabase_url(&input.supabase_url)?,
        })
    }

    async fn invoke_remote_companion_relay_rows<T: DeserializeOwned>(
        &self,
        body: &JsonValue,
    ) -> Result<Vec<T>, String> {
        let envelope = self
            .invoke_supabase_function_value("remote-companion-relay", body)
            .await?;
        relay_rows_from_envelope(envelope)
    }

    async fn create_store_build_download_ticket(
        &self,
        body: &JsonValue,
    ) -> Result<StoreBuildDownloadTicket, String> {
        let ticket = self
            .invoke_supabase_function_value("store-download-build", body)
            .await?;
        serde_json::from_value::<StoreBuildDownloadTicket>(ticket)
            .map_err(|error| format!("Parse store download ticket: {error}"))
    }

    async fn invoke_supabase_function_value(
        &self,
        function_name: &str,
        body: &JsonValue,
    ) -> Result<JsonValue, String> {
        let url = format!("{}/functions/v1/{function_name}", self.supabase_url);
        let response = shared_http_client()
            .post(&url)
            .header("apikey", &self.api_key)
            .bearer_auth(&self.auth_token)
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .json(body)
            .send()
            .await
            .map_err(|error| {
                safe_remote_status_message(&format!("Remote request failed: {error}"))
            })?;
        let status = response.status();
        let text = response.text().await.map_err(|error| {
            safe_remote_status_message(&format!("Remote response failed: {error}"))
        })?;
        let value = serde_json::from_str::<JsonValue>(&text).map_err(|error| {
            safe_remote_status_message(&format!("Remote response parse failed: {error}"))
        })?;

        if !status.is_success() {
            let message = edge_error_message(&value).unwrap_or_else(|| format!("HTTP {status}"));
            return Err(safe_remote_status_message(&message));
        }
        if let Some(message) = edge_error_message(&value) {
            return Err(safe_remote_status_message(&message));
        }

        Ok(value)
    }
}

async fn process_claimed_job(
    app: &AppHandle,
    function_client: &SupabaseFunctionClient,
    device: &DeviceCreds,
    job: RemoteInstallClaimedJobRow,
) -> RemoteCompanionPollJobResult {
    let ticket_body = match build_store_ticket_body(&job) {
        Ok(body) => body,
        Err(error) => {
            let message = safe_remote_status_message(&error);
            let failed_body = failed_status_body(device, &job.job_id, &message);
            let _ = function_client
                .invoke_remote_companion_relay_rows::<RemoteInstallJobStatusRow>(&failed_body)
                .await;
            return failed_job_result(&job, message);
        }
    };

    let ticket = match function_client
        .create_store_build_download_ticket(&ticket_body)
        .await
    {
        Ok(ticket) => ticket,
        Err(error) => {
            let message = safe_remote_status_message(&error);
            let failed_body = failed_status_body(device, &job.job_id, &message);
            let _ = function_client
                .invoke_remote_companion_relay_rows::<RemoteInstallJobStatusRow>(&failed_body)
                .await;
            return failed_job_result(&job, message);
        }
    };

    let source = match source_from_store_ticket(&ticket) {
        Ok(source) => source,
        Err(error) => {
            let message = safe_remote_status_message(&error);
            let failed_body = failed_status_body(device, &job.job_id, &message);
            let _ = function_client
                .invoke_remote_companion_relay_rows::<RemoteInstallJobStatusRow>(&failed_body)
                .await;
            return failed_job_result(&job, message);
        }
    };

    let local_queue_id = format!("download-{}", job.game_id.trim());
    let terminal_hook =
        remote_companion_terminal_hook(device, function_client, &job.job_id, &local_queue_id);
    let start_response = match start_trusted_internal_download(
        app.clone(),
        job.game_id.clone(),
        Some(job.title.clone()),
        source,
        Some(terminal_hook),
    )
    .await
    {
        Ok(response) => response,
        Err(error) => {
            let message = safe_remote_status_message(&error);
            let failed_body = failed_status_body(device, &job.job_id, &message);
            let _ = function_client
                .invoke_remote_companion_relay_rows::<RemoteInstallJobStatusRow>(&failed_body)
                .await;
            return failed_job_result(&job, message);
        }
    };

    if matches!(start_response.status, DownloadStartStatus::AlreadyQueued) {
        let (failed_body, result) = already_queued_job_status(device, &job, &start_response);
        let _ = function_client
            .invoke_remote_companion_relay_rows::<RemoteInstallJobStatusRow>(&failed_body)
            .await;
        return result;
    }

    let started_body = started_status_body(device, &job.job_id, &start_response);
    let status_message = match function_client
        .invoke_remote_companion_relay_rows::<RemoteInstallJobStatusRow>(&started_body)
        .await
    {
        Ok(rows) => rows
            .first()
            .map(|row| {
                let _job_id = &row.job_id;
                format!(
                    "{} Remote status: {}.",
                    start_response.message,
                    safe_remote_status_message(&row.status)
                )
            })
            .unwrap_or_else(|| start_response.message.clone()),
        Err(error) => format!(
            "{} Remote status update failed: {}",
            start_response.message,
            safe_remote_status_message(&error)
        ),
    };

    RemoteCompanionPollJobResult {
        game_id: job.game_id,
        job_id: job.job_id,
        local_queue_id: Some(start_response.download_id),
        message: safe_remote_status_message(&status_message),
        status: "started".to_string(),
    }
}

fn remote_companion_terminal_hook(
    device: &DeviceCreds,
    function_client: &SupabaseFunctionClient,
    job_id: &str,
    local_queue_id: &str,
) -> InternalDownloadTerminalHook {
    let device = device.clone();
    let function_client = function_client.clone();
    let job_id = job_id.to_string();
    let local_queue_id = local_queue_id.to_string();

    Arc::new(move |event: InternalDownloadTerminalEvent| {
        let device = device.clone();
        let function_client = function_client.clone();
        let job_id = job_id.clone();
        let local_queue_id = local_queue_id.clone();

        Box::pin(async move {
            let Some(remote_status) = normalize_terminal_remote_status(&event.status) else {
                return;
            };
            let body = status_update_body(
                &device,
                &job_id,
                remote_status,
                Some(local_queue_id.as_str()),
                &event.message,
            );
            let _ = function_client
                .invoke_remote_companion_relay_rows::<RemoteInstallJobStatusRow>(&body)
                .await;
        })
    })
}

fn unconfigured_poll_result() -> RemoteCompanionPollOnceResult {
    RemoteCompanionPollOnceResult {
        configured: false,
        claimed: 0,
        started: 0,
        failed: 0,
        jobs: Vec::new(),
    }
}

fn read_device_credentials() -> Result<Option<DeviceCreds>, String> {
    Ok(
        read_remote_companion_device_secret()?.map(|(device_id, device_secret)| DeviceCreds {
            device_id,
            device_secret,
        }),
    )
}

fn normalize_api_key(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("Supabase publishable key is required.".to_string());
    }
    Ok(trimmed.to_string())
}

fn normalize_supabase_url(value: &str) -> Result<String, String> {
    let trimmed = value.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("Supabase URL is required.".to_string());
    }
    let parsed =
        reqwest::Url::parse(trimmed).map_err(|_| "Supabase URL must be valid.".to_string())?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "Supabase URL must include a host.".to_string())?;
    let is_localhost = matches!(host, "localhost" | "127.0.0.1" | "::1");
    if parsed.scheme() == "http" && !is_localhost {
        return Err("Supabase URL must use https outside localhost.".to_string());
    }
    if parsed.scheme() != "https" && parsed.scheme() != "http" {
        return Err("Supabase URL must use http or https.".to_string());
    }
    if !is_localhost && !host.ends_with(".supabase.co") {
        return Err("Supabase URL host is not allowed for remote companion polling.".to_string());
    }
    Ok(trimmed.to_string())
}

fn normalize_claim_limit(limit: Option<u8>) -> u8 {
    limit.unwrap_or(5).clamp(1, 25)
}

fn build_ping_body(device: &DeviceCreds) -> JsonValue {
    json!({
        "action": "ping",
        "deviceId": device.device_id,
        "deviceSecret": device.device_secret,
    })
}

fn build_claim_jobs_body(device_id: &str, device_secret: &str, limit: u8) -> JsonValue {
    json!({
        "action": "claim_jobs",
        "deviceId": device_id,
        "deviceSecret": device_secret,
        "limit": normalize_claim_limit(Some(limit)),
    })
}

fn build_store_ticket_body(job: &RemoteInstallClaimedJobRow) -> Result<JsonValue, String> {
    let product_id = normalize_required_uuid(
        job.product_id.as_deref(),
        "Remote install job is missing a store product id.",
    )?;
    let mut body = json!({ "product_id": product_id });

    if let Some(build_id) = normalize_optional_uuid(job.build_id.as_deref())? {
        body["build_id"] = json!(build_id);
    }
    if let Some(platform) = normalize_optional_platform(job.platform.as_deref()) {
        body["platform"] = json!(platform);
    }

    Ok(body)
}

fn source_from_store_ticket(
    ticket: &StoreBuildDownloadTicket,
) -> Result<InternalDownloadSource, String> {
    let url = ticket.url.trim();
    if url.is_empty() {
        return Err("Store download ticket did not include a URL.".to_string());
    }
    let parsed_url = reqwest::Url::parse(url)
        .map_err(|_| "Store download ticket URL is invalid.".to_string())?;
    if parsed_url.scheme() != "https" {
        return Err("Store download ticket URL must use https.".to_string());
    }
    Ok(InternalDownloadSource::ephemeral_remote_store_ticket(
        url.to_string(),
        normalize_optional_sha256(ticket.build.sha256.as_deref())?,
        None,
        None,
    ))
}

fn started_status_body(
    device: &DeviceCreds,
    job_id: &str,
    response: &StartDownloadResponse,
) -> JsonValue {
    status_update_body(
        device,
        job_id,
        "started",
        Some(response.download_id.as_str()),
        &response.message,
    )
}

fn failed_status_body(device: &DeviceCreds, job_id: &str, error: &str) -> JsonValue {
    status_update_body(device, job_id, "failed", None, error)
}

fn already_queued_job_status(
    device: &DeviceCreds,
    job: &RemoteInstallClaimedJobRow,
    response: &StartDownloadResponse,
) -> (JsonValue, RemoteCompanionPollJobResult) {
    let message = safe_remote_status_message(&response.message);
    (
        status_update_body(
            device,
            &job.job_id,
            "failed",
            Some(response.download_id.as_str()),
            &message,
        ),
        RemoteCompanionPollJobResult {
            game_id: job.game_id.clone(),
            job_id: job.job_id.clone(),
            local_queue_id: Some(response.download_id.clone()),
            message,
            status: "failed".to_string(),
        },
    )
}

fn status_update_body(
    device: &DeviceCreds,
    job_id: &str,
    status: &str,
    local_queue_id: Option<&str>,
    message: &str,
) -> JsonValue {
    json!({
        "action": "update_job_status",
        "deviceId": device.device_id,
        "deviceSecret": device.device_secret,
        "jobId": job_id,
        "localQueueId": local_queue_id,
        "message": safe_remote_status_message(message),
        "status": status,
    })
}

fn failed_job_result(
    job: &RemoteInstallClaimedJobRow,
    message: String,
) -> RemoteCompanionPollJobResult {
    RemoteCompanionPollJobResult {
        game_id: job.game_id.clone(),
        job_id: job.job_id.clone(),
        local_queue_id: None,
        message,
        status: "failed".to_string(),
    }
}

fn safe_remote_status_message(message: &str) -> String {
    let redacted = redact_download_error_message(message);
    let mut output = redacted
        .split_whitespace()
        .map(|part| {
            let lowered = part.to_ascii_lowercase();
            if lowered.contains("bearer")
                || lowered.contains("authorization")
                || lowered.contains("apikey")
                || lowered.contains("device_secret")
                || lowered.contains("devicesecret")
                || lowered.contains("access_token")
                || lowered.contains("accesstoken")
                || lowered.contains("refresh_token")
                || lowered.contains("refreshtoken")
                || lowered.contains("cookie")
                || lowered.contains("secret")
                || lowered.contains("storage_path")
                || lowered.contains("storagepath")
            {
                "[redacted]"
            } else {
                part
            }
        })
        .collect::<Vec<_>>()
        .join(" ");
    if output.len() > 240 {
        output.truncate(237);
        output.push_str("...");
    }
    if output.trim().is_empty() {
        "Remote install job failed.".to_string()
    } else {
        output
    }
}

fn normalize_terminal_remote_status(status: &str) -> Option<&'static str> {
    match status.trim().to_ascii_lowercase().as_str() {
        "completed" => Some("completed"),
        "cancelled" => Some("cancelled"),
        "failed" | "error" => Some("failed"),
        _ => None,
    }
}

fn edge_error_message(value: &JsonValue) -> Option<String> {
    value
        .get("error")
        .and_then(JsonValue::as_str)
        .map(ToString::to_string)
}

fn relay_rows_from_envelope<T: DeserializeOwned>(value: JsonValue) -> Result<Vec<T>, String> {
    let data = value.get("data").cloned().unwrap_or(JsonValue::Null);
    match data {
        JsonValue::Null => Ok(Vec::new()),
        JsonValue::Array(rows) => serde_json::from_value(JsonValue::Array(rows))
            .map_err(|error| format!("Parse remote companion relay rows: {error}")),
        JsonValue::Object(_) => serde_json::from_value(data)
            .map(|row| vec![row])
            .map_err(|error| format!("Parse remote companion relay row: {error}")),
        _ => Err("Remote companion relay data has an unsupported shape.".to_string()),
    }
}

fn normalize_required_uuid(value: Option<&str>, missing_message: &str) -> Result<String, String> {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Err(missing_message.to_string());
    };
    normalize_uuid(value).ok_or_else(|| "Remote install job contains an invalid UUID.".to_string())
}

fn normalize_optional_uuid(value: Option<&str>) -> Result<Option<String>, String> {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    normalize_uuid(value)
        .map(Some)
        .ok_or_else(|| "Remote install job contains an invalid UUID.".to_string())
}

fn normalize_uuid(value: &str) -> Option<String> {
    Uuid::parse_str(value)
        .ok()
        .map(|_| value.trim().to_lowercase())
}

fn normalize_optional_platform(value: Option<&str>) -> Option<String> {
    let normalized = value?.trim().to_ascii_lowercase();
    matches!(normalized.as_str(), "windows" | "macos" | "linux").then_some(normalized)
}

fn normalize_optional_sha256(value: Option<&str>) -> Result<Option<String>, String> {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let normalized = value.to_ascii_lowercase();
    if normalized.len() != 64 || !normalized.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Err("Store download ticket SHA-256 is invalid.".to_string());
    }
    Ok(Some(normalized))
}

fn read_device_secret_record() -> Result<Option<RemoteCompanionDeviceSecretRecord>, String> {
    let Some(raw) = secure_store::get_secret(DEVICE_SECRET_DOMAIN)? else {
        return Ok(None);
    };
    let record = serde_json::from_str::<RemoteCompanionDeviceSecretRecord>(&raw)
        .map_err(|error| format!("Read remote companion device secret metadata: {error}"))?;
    Ok(Some(record))
}

fn normalize_device_secret_input(
    input: RemoteCompanionDeviceSecretInput,
) -> Result<RemoteCompanionDeviceSecretRecord, String> {
    let device_id = normalize_device_id(&input.device_id)?;
    let device_secret = normalize_device_secret(&input.device_secret)?;
    let device_secret_hint = normalize_device_secret_hint(input.device_secret_hint.as_deref())?;

    Ok(RemoteCompanionDeviceSecretRecord {
        device_id,
        device_secret,
        device_secret_hint,
        updated_at_epoch_ms: now_epoch_ms(),
    })
}

fn status_from_record(
    record: Option<&RemoteCompanionDeviceSecretRecord>,
) -> RemoteCompanionDeviceSecretStatus {
    match record {
        Some(record) => RemoteCompanionDeviceSecretStatus {
            device_id: Some(record.device_id.clone()),
            device_secret_hint: record.device_secret_hint.clone(),
            has_secret: true,
            updated_at_epoch_ms: Some(record.updated_at_epoch_ms),
        },
        None => RemoteCompanionDeviceSecretStatus {
            device_id: None,
            device_secret_hint: None,
            has_secret: false,
            updated_at_epoch_ms: None,
        },
    }
}

fn normalize_device_id(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    Uuid::parse_str(trimmed)
        .map_err(|_| "Remote companion device id must be a valid UUID.".to_string())?;
    Ok(trimmed.to_lowercase())
}

fn normalize_device_secret(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if !trimmed.starts_with(DEVICE_SECRET_PREFIX) {
        return Err("Remote companion device secret has an invalid prefix.".to_string());
    }
    if trimmed.len() < DEVICE_SECRET_MIN_LEN || trimmed.len() > DEVICE_SECRET_MAX_LEN {
        return Err("Remote companion device secret has an invalid length.".to_string());
    }
    if !trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' || ch == '.')
    {
        return Err("Remote companion device secret contains invalid characters.".to_string());
    }
    Ok(trimmed.to_string())
}

fn normalize_device_secret_hint(value: Option<&str>) -> Result<Option<String>, String> {
    let Some(value) = value else {
        return Ok(None);
    };
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if trimmed.len() > DEVICE_SECRET_HINT_MAX_LEN {
        return Err("Remote companion device secret hint is too long.".to_string());
    }
    let lowered = trimmed.to_ascii_lowercase();
    if lowered.contains("http://")
        || lowered.contains("https://")
        || lowered.contains("token")
        || lowered.contains("sig=")
    {
        return Err("Remote companion device secret hint contains unsafe content.".to_string());
    }
    Ok(Some(trimmed.to_string()))
}

fn now_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::downloads::DownloadStartStatus;

    const BUILD_ID: &str = "22222222-2222-4222-8222-222222222222";
    const DEVICE_ID: &str = "11111111-1111-4111-8111-111111111111";
    const JOB_ID: &str = "33333333-3333-4333-8333-333333333333";
    const PRODUCT_ID: &str = "44444444-4444-4444-8444-444444444444";

    fn valid_input() -> RemoteCompanionDeviceSecretInput {
        RemoteCompanionDeviceSecretInput {
            device_id: "A3B14E4D-5D67-48C6-9F97-D81893F68A72".to_string(),
            device_secret: "ogd_abcdefghijklmnopqrstuvwxyz0123456789-_".to_string(),
            device_secret_hint: Some("ogd_abcd...7890".to_string()),
        }
    }

    fn device_creds() -> DeviceCreds {
        DeviceCreds {
            device_id: DEVICE_ID.to_string(),
            device_secret: "ogd_abcdefghijklmnopqrstuvwxyz0123456789-_".to_string(),
        }
    }

    fn claimed_job() -> RemoteInstallClaimedJobRow {
        RemoteInstallClaimedJobRow {
            build_id: Some(BUILD_ID.to_string()),
            game_id: "store-demo-game".to_string(),
            job_id: JOB_ID.to_string(),
            platform: Some("WINDOWS".to_string()),
            product_id: Some(PRODUCT_ID.to_string()),
            title: "Store Demo Game".to_string(),
        }
    }

    #[test]
    fn normalizes_valid_device_secret_record() {
        let record = normalize_device_secret_input(valid_input()).expect("valid input");

        assert_eq!(record.device_id, "a3b14e4d-5d67-48c6-9f97-d81893f68a72");
        assert_eq!(
            record.device_secret_hint.as_deref(),
            Some("ogd_abcd...7890")
        );
        assert!(record.updated_at_epoch_ms > 0);
    }

    #[test]
    fn status_redacts_secret_value() {
        let record = normalize_device_secret_input(valid_input()).expect("valid input");
        let status = status_from_record(Some(&record));
        let serialized = serde_json::to_string(&status).expect("serialize status");

        assert!(status.has_secret);
        assert!(serialized.contains("a3b14e4d-5d67-48c6-9f97-d81893f68a72"));
        assert!(serialized.contains("ogd_abcd...7890"));
        assert!(!serialized.contains("abcdefghijklmnopqrstuvwxyz0123456789"));
    }

    #[test]
    fn rejects_non_uuid_device_id() {
        let mut input = valid_input();
        input.device_id = "not-a-uuid".to_string();

        assert!(normalize_device_secret_input(input).is_err());
    }

    #[test]
    fn rejects_unsafe_secret_hint() {
        let mut input = valid_input();
        input.device_secret_hint = Some("https://example.test/token=abc".to_string());

        assert!(normalize_device_secret_input(input).is_err());
    }

    #[test]
    fn rejects_secret_without_companion_prefix() {
        let mut input = valid_input();
        input.device_secret = "abc_abcdefghijklmnopqrstuvwxyz0123456789-_".to_string();

        assert!(normalize_device_secret_input(input).is_err());
    }

    #[test]
    fn build_claim_jobs_body_clamps_limit_to_25() {
        let body = build_claim_jobs_body(DEVICE_ID, "ogd_secret", 250);

        assert_eq!(body["action"], "claim_jobs");
        assert_eq!(body["deviceId"], DEVICE_ID);
        assert_eq!(body["limit"], 25);
    }

    #[test]
    fn build_store_ticket_body_preserves_exact_build_id() {
        let body = build_store_ticket_body(&claimed_job()).expect("ticket body");

        assert_eq!(body["product_id"], PRODUCT_ID);
        assert_eq!(body["build_id"], BUILD_ID);
        assert_eq!(body["platform"], "windows");
    }

    #[test]
    fn build_store_ticket_body_fails_without_product_id() {
        let mut job = claimed_job();
        job.product_id = None;

        let error = build_store_ticket_body(&job).expect_err("missing product id fails");

        assert!(error.contains("product id"));
    }

    #[test]
    fn normalize_supabase_url_requires_allowed_https_or_localhost() {
        assert_eq!(
            normalize_supabase_url("https://project.supabase.co/").expect("supabase url"),
            "https://project.supabase.co"
        );
        assert_eq!(
            normalize_supabase_url("http://127.0.0.1:54321").expect("local supabase url"),
            "http://127.0.0.1:54321"
        );
        assert!(normalize_supabase_url("http://project.supabase.co").is_err());
        assert!(normalize_supabase_url("https://evil.example.test").is_err());
    }

    #[test]
    fn source_from_store_ticket_uses_ephemeral_remote_store_ticket() {
        let sha256 = "A".repeat(64);
        let ticket = StoreBuildDownloadTicket {
            build: StoreBuildDownloadTicketBuild {
                sha256: Some(sha256),
            },
            url: " https://example.test/build.zip?token=secret ".to_string(),
        };

        let source = source_from_store_ticket(&ticket).expect("download source");

        assert_eq!(source.url, "https://example.test/build.zip?token=secret");
        let expected_sha256 = "a".repeat(64);
        assert_eq!(source.sha256.as_deref(), Some(expected_sha256.as_str()));
        assert!(!source.persist_download_url);
        assert_eq!(source.manifest_download_url(), None);
    }

    #[test]
    fn source_from_store_ticket_rejects_invalid_urls_and_sha_before_start() {
        let mut ticket = StoreBuildDownloadTicket {
            build: StoreBuildDownloadTicketBuild { sha256: None },
            url: "http://example.test/build.zip".to_string(),
        };
        assert!(source_from_store_ticket(&ticket).is_err());

        ticket.url = "https://example.test/build.zip".to_string();
        ticket.build.sha256 = Some("not-a-sha".to_string());
        assert!(source_from_store_ticket(&ticket).is_err());
    }

    #[test]
    fn started_status_body_uses_download_id_as_local_queue_id() {
        let response = StartDownloadResponse {
            game_id: "store-demo-game".to_string(),
            download_id: "download-store-demo-game".to_string(),
            status: DownloadStartStatus::Started,
            message: "Download started.".to_string(),
        };

        let body = started_status_body(&device_creds(), JOB_ID, &response);

        assert_eq!(body["action"], "update_job_status");
        assert_eq!(body["jobId"], JOB_ID);
        assert_eq!(body["localQueueId"], "download-store-demo-game");
        assert_eq!(body["status"], "started");
    }

    #[test]
    fn already_queued_remote_job_fails_with_local_queue_id() {
        let response = StartDownloadResponse {
            game_id: "store-demo-game".to_string(),
            download_id: "download-store-demo-game".to_string(),
            status: DownloadStartStatus::AlreadyQueued,
            message: "Download is already queued. https://example.test/build.zip?token=abc"
                .to_string(),
        };

        let (body, result) = already_queued_job_status(&device_creds(), &claimed_job(), &response);
        let message = body["message"].as_str().expect("status message");

        assert_eq!(body["action"], "update_job_status");
        assert_eq!(body["jobId"], JOB_ID);
        assert_eq!(body["localQueueId"], "download-store-demo-game");
        assert_eq!(body["status"], "failed");
        assert_eq!(result.status, "failed");
        assert_eq!(
            result.local_queue_id.as_deref(),
            Some("download-store-demo-game")
        );
        assert!(message.contains("[redacted-url]"));
        assert!(!message.contains("https://example.test"));
        assert!(!message.contains("token=abc"));
    }

    #[test]
    fn terminal_status_body_preserves_local_queue_id_and_redacts_message() {
        let body = status_update_body(
            &device_creds(),
            JOB_ID,
            "completed",
            Some("download-store-demo-game"),
            "Complete https://example.test/build.zip?token=abc",
        );
        let serialized = serde_json::to_string(&body).expect("serialize status body");

        assert_eq!(body["action"], "update_job_status");
        assert_eq!(body["localQueueId"], "download-store-demo-game");
        assert_eq!(body["status"], "completed");
        assert!(serialized.contains("[redacted-url]"));
        assert!(!serialized.contains("https://example.test"));
        assert!(!serialized.contains("token=abc"));
    }

    #[test]
    fn normalize_terminal_remote_status_maps_lifecycle_statuses() {
        assert_eq!(
            normalize_terminal_remote_status("completed"),
            Some("completed")
        );
        assert_eq!(
            normalize_terminal_remote_status("cancelled"),
            Some("cancelled")
        );
        assert_eq!(normalize_terminal_remote_status("failed"), Some("failed"));
        assert_eq!(normalize_terminal_remote_status("error"), Some("failed"));
        assert_eq!(normalize_terminal_remote_status("downloading"), None);
    }

    #[test]
    fn failed_status_body_redacts_signed_urls_and_tokens() {
        let body = failed_status_body(
            &device_creds(),
            JOB_ID,
            "Ticket failed https://example.test/build.zip?token=abc sig=secret",
        );
        let serialized = serde_json::to_string(&body).expect("serialize status body");

        assert!(serialized.contains("[redacted-url]"));
        assert!(!serialized.contains("https://example.test"));
        assert!(!serialized.contains("token=abc"));
        assert!(!serialized.contains("sig=secret"));
    }

    #[test]
    fn failed_status_body_redacts_auth_and_secret_markers_from_message() {
        let body = failed_status_body(
            &device_creds(),
            JOB_ID,
            "Authorization: Bearer abc access_token=xyz refresh_token=zzz cookie=session deviceSecret=raw secret=value",
        );
        let message = body["message"]
            .as_str()
            .expect("status message")
            .to_ascii_lowercase();

        assert!(message.contains("[redacted]"));
        assert!(message.len() <= 240);
        assert!(!message.contains("authorization"));
        assert!(!message.contains("bearer"));
        assert!(!message.contains("access_token"));
        assert!(!message.contains("refresh_token"));
        assert!(!message.contains("cookie"));
        assert!(!message.contains("devicesecret"));
        assert!(!message.contains("secret=value"));
    }

    #[test]
    fn status_bodies_never_include_ticket_url_or_storage_path() {
        let response = StartDownloadResponse {
            game_id: "store-demo-game".to_string(),
            download_id: "download-store-demo-game".to_string(),
            status: DownloadStartStatus::Started,
            message: "Download started.".to_string(),
        };
        let started = started_status_body(&device_creds(), JOB_ID, &response);
        let failed = failed_status_body(
            &device_creds(),
            JOB_ID,
            "storage_path=private/build.zip https://example.test/build.zip?token=abc",
        );
        let serialized = serde_json::to_string(&serde_json::json!([started, failed]))
            .expect("serialize status bodies");

        assert!(!serialized.contains("https://example.test"));
        assert!(!serialized.contains("token=abc"));
        assert!(!serialized.contains("storage_path"));
        assert!(!serialized.contains("downloadUrl"));
        assert!(!serialized.contains("signedUrl"));
    }

    #[test]
    fn relay_envelope_accepts_array_and_single_data_payloads() {
        let single: Vec<RemoteInstallJobStatusRow> = relay_rows_from_envelope(serde_json::json!({
            "data": {
                "job_id": JOB_ID,
                "status": "started"
            }
        }))
        .expect("single row envelope");
        let rows: Vec<RemoteInstallJobStatusRow> = relay_rows_from_envelope(serde_json::json!({
            "data": [
                {
                    "job_id": JOB_ID,
                    "status": "started"
                },
                {
                    "job_id": "55555555-5555-4555-8555-555555555555",
                    "status": "failed"
                }
            ]
        }))
        .expect("array envelope");

        assert_eq!(single.len(), 1);
        assert_eq!(single[0].status, "started");
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[1].status, "failed");
    }
}
