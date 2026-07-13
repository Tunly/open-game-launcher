use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

use super::{local_db, secure_store};

const STREAM_KEY_SAVE_OPERATION: &str = "broadcast_stream_key_vault_save";
const STREAM_KEY_CLEAR_OPERATION: &str = "broadcast_stream_key_vault_clear";
const STREAM_KEY_METADATA_COLLECTION: &str = "broadcast_stream_key_vault";
const STREAM_KEY_DOMAIN_PREFIX: &str = "bck";

#[derive(Debug, Clone, Copy, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum BroadcastStreamProvider {
    Custom,
    Twitch,
    Youtube,
}

impl BroadcastStreamProvider {
    fn as_str(self) -> &'static str {
        match self {
            Self::Custom => "custom",
            Self::Twitch => "twitch",
            Self::Youtube => "youtube",
        }
    }

    fn display_name(self) -> &'static str {
        match self {
            Self::Custom => "Custom",
            Self::Twitch => "Twitch",
            Self::Youtube => "YouTube",
        }
    }
}

#[derive(Debug, Clone, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastStreamKeyVaultConsent {
    pub accepted: bool,
    pub channel_id: String,
    pub operation: String,
    pub provider: BroadcastStreamProvider,
}

#[derive(Debug, Clone, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastStreamKeyVaultStatusRequest {
    pub channel_id: String,
    pub provider: BroadcastStreamProvider,
}

#[derive(Debug, Clone, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastStreamKeyVaultSaveRequest {
    pub channel_id: String,
    pub consent: BroadcastStreamKeyVaultConsent,
    pub provider: BroadcastStreamProvider,
    pub secret: String,
}

#[derive(Debug, Clone, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastStreamKeyVaultClearRequest {
    pub channel_id: String,
    pub consent: BroadcastStreamKeyVaultConsent,
    pub provider: BroadcastStreamProvider,
}

#[derive(Debug, Clone, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastStreamKeyVaultStatus {
    pub channel_id: String,
    pub configured: bool,
    pub message: String,
    pub provider: BroadcastStreamProvider,
    pub secret_hint: Option<String>,
    pub storage: String,
}

#[derive(Debug, Clone, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct BroadcastStreamKeyVaultMetadata {
    id: String,
    channel_id: String,
    provider: BroadcastStreamProvider,
    secret_hint: String,
    updated_at_epoch_ms: u64,
}

#[tauri::command]
pub fn get_broadcast_stream_key_vault_status(
    input: BroadcastStreamKeyVaultStatusRequest,
) -> Result<BroadcastStreamKeyVaultStatus, String> {
    let channel_id = normalize_broadcast_channel_id(&input.channel_id)?;
    broadcast_stream_key_vault_status(input.provider, &channel_id)
}

#[tauri::command]
pub fn set_broadcast_stream_key_secret(
    input: BroadcastStreamKeyVaultSaveRequest,
) -> Result<BroadcastStreamKeyVaultStatus, String> {
    let channel_id = normalize_broadcast_channel_id(&input.channel_id)?;
    validate_stream_key_consent(
        &input.consent,
        STREAM_KEY_SAVE_OPERATION,
        input.provider,
        &channel_id,
    )?;
    let secret = normalize_stream_key_secret(&input.secret)?;
    let domain = broadcast_stream_key_domain(input.provider, &channel_id);
    secure_store::set_secret(&domain, &secret)?;
    let metadata = BroadcastStreamKeyVaultMetadata {
        id: broadcast_stream_key_metadata_id(input.provider, &channel_id),
        channel_id: channel_id.clone(),
        provider: input.provider,
        secret_hint: secret_hint(&secret),
        updated_at_epoch_ms: now_epoch_ms(),
    };
    upsert_broadcast_stream_key_metadata(metadata.clone())?;
    Ok(BroadcastStreamKeyVaultStatus {
        channel_id,
        configured: true,
        message: format!(
            "{} stream key saved in the desktop vault.",
            input.provider.display_name()
        ),
        provider: input.provider,
        secret_hint: Some(metadata.secret_hint),
        storage: "desktop keychain slot + local metadata".to_string(),
    })
}

#[tauri::command]
pub fn clear_broadcast_stream_key_secret(
    input: BroadcastStreamKeyVaultClearRequest,
) -> Result<BroadcastStreamKeyVaultStatus, String> {
    let channel_id = normalize_broadcast_channel_id(&input.channel_id)?;
    validate_stream_key_consent(
        &input.consent,
        STREAM_KEY_CLEAR_OPERATION,
        input.provider,
        &channel_id,
    )?;
    let domain = broadcast_stream_key_domain(input.provider, &channel_id);
    secure_store::delete_secret(&domain)?;
    local_db::remove_item(
        STREAM_KEY_METADATA_COLLECTION,
        &broadcast_stream_key_metadata_id(input.provider, &channel_id),
    )?;
    Ok(BroadcastStreamKeyVaultStatus {
        channel_id,
        configured: false,
        message: format!(
            "{} stream key cleared from the desktop vault.",
            input.provider.display_name()
        ),
        provider: input.provider,
        secret_hint: None,
        storage: "desktop keychain slot + local metadata".to_string(),
    })
}

fn broadcast_stream_key_vault_status(
    provider: BroadcastStreamProvider,
    channel_id: &str,
) -> Result<BroadcastStreamKeyVaultStatus, String> {
    let metadata = read_broadcast_stream_key_metadata(provider, channel_id)?;
    let configured = metadata.is_some();
    Ok(BroadcastStreamKeyVaultStatus {
        channel_id: channel_id.to_string(),
        configured,
        message: if configured {
            format!(
                "{} stream key is present in the desktop vault.",
                provider.display_name()
            )
        } else {
            format!(
                "No {} stream key is stored for this channel.",
                provider.display_name()
            )
        },
        provider,
        secret_hint: metadata.map(|value| value.secret_hint),
        storage: "desktop keychain slot + local metadata".to_string(),
    })
}

fn read_broadcast_stream_key_metadata(
    provider: BroadcastStreamProvider,
    channel_id: &str,
) -> Result<Option<BroadcastStreamKeyVaultMetadata>, String> {
    let id = broadcast_stream_key_metadata_id(provider, channel_id);
    local_db::read_item(STREAM_KEY_METADATA_COLLECTION, &id)
}

fn upsert_broadcast_stream_key_metadata(
    metadata: BroadcastStreamKeyVaultMetadata,
) -> Result<(), String> {
    local_db::upsert_item(STREAM_KEY_METADATA_COLLECTION, &metadata.id, &metadata)
}

fn validate_stream_key_consent(
    consent: &BroadcastStreamKeyVaultConsent,
    operation: &str,
    provider: BroadcastStreamProvider,
    channel_id: &str,
) -> Result<(), String> {
    if !consent.accepted {
        return Err("Broadcast stream-key vault consent is required.".to_string());
    }
    if consent.operation != operation {
        return Err("Broadcast stream-key vault consent operation mismatch.".to_string());
    }
    if consent.provider != provider {
        return Err("Broadcast stream-key vault consent provider mismatch.".to_string());
    }
    let consent_channel_id = normalize_broadcast_channel_id(&consent.channel_id)?;
    if consent_channel_id != channel_id {
        return Err("Broadcast stream-key vault consent channel mismatch.".to_string());
    }
    Ok(())
}

fn normalize_broadcast_channel_id(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.len() < 2 {
        return Err("Broadcast channel id must be at least 2 characters.".to_string());
    }
    if trimmed.len() > 48 {
        return Err("Broadcast channel id must be 48 characters or fewer.".to_string());
    }
    if trimmed.contains("..") {
        return Err("Broadcast channel id must not contain parent traversal.".to_string());
    }
    if !trimmed
        .chars()
        .all(|value| value.is_ascii_alphanumeric() || value == '_' || value == '-' || value == '.')
    {
        return Err(
            "Broadcast channel id may only contain letters, numbers, dot, underscore, or hyphen."
                .to_string(),
        );
    }
    Ok(trimmed.to_ascii_lowercase())
}

fn normalize_stream_key_secret(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.len() < 8 {
        return Err("Broadcast stream key must be at least 8 characters.".to_string());
    }
    if trimmed.len() > 512 {
        return Err("Broadcast stream key must be 512 characters or fewer.".to_string());
    }
    if trimmed.chars().any(char::is_control) {
        return Err("Broadcast stream key must not contain control characters.".to_string());
    }
    Ok(trimmed.to_string())
}

fn broadcast_stream_key_domain(provider: BroadcastStreamProvider, channel_id: &str) -> String {
    format!(
        "{STREAM_KEY_DOMAIN_PREFIX}:{}:{}",
        provider.as_str(),
        channel_id
    )
}

fn broadcast_stream_key_metadata_id(provider: BroadcastStreamProvider, channel_id: &str) -> String {
    format!("{}:{}", provider.as_str(), channel_id)
}

fn secret_hint(secret: &str) -> String {
    format!("stored // {} chars", secret.chars().count())
}

fn now_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_channel_id() -> String {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        format!("test-{nonce}")
    }

    fn save_consent(
        provider: BroadcastStreamProvider,
        channel_id: &str,
    ) -> BroadcastStreamKeyVaultConsent {
        BroadcastStreamKeyVaultConsent {
            accepted: true,
            channel_id: channel_id.to_string(),
            operation: STREAM_KEY_SAVE_OPERATION.to_string(),
            provider,
        }
    }

    fn clear_consent(
        provider: BroadcastStreamProvider,
        channel_id: &str,
    ) -> BroadcastStreamKeyVaultConsent {
        BroadcastStreamKeyVaultConsent {
            accepted: true,
            channel_id: channel_id.to_string(),
            operation: STREAM_KEY_CLEAR_OPERATION.to_string(),
            provider,
        }
    }

    #[test]
    fn broadcast_stream_key_vault_saves_status_and_clears_without_returning_secret() {
        let provider = BroadcastStreamProvider::Twitch;
        let channel_id = unique_channel_id();
        let save = set_broadcast_stream_key_secret(BroadcastStreamKeyVaultSaveRequest {
            channel_id: channel_id.clone(),
            consent: save_consent(provider, &channel_id),
            provider,
            secret: "stream-key-secret-123".to_string(),
        })
        .expect("save stream key");
        assert!(save.configured);
        assert_eq!(save.channel_id, channel_id);
        assert_eq!(save.secret_hint.as_deref(), Some("stored // 21 chars"));

        let status = get_broadcast_stream_key_vault_status(BroadcastStreamKeyVaultStatusRequest {
            channel_id: channel_id.clone(),
            provider,
        })
        .expect("read status");
        assert!(status.configured);
        assert_eq!(status.secret_hint.as_deref(), Some("stored // 21 chars"));
        assert!(!status.message.contains("stream-key-secret-123"));

        let cleared = clear_broadcast_stream_key_secret(BroadcastStreamKeyVaultClearRequest {
            channel_id: channel_id.clone(),
            consent: clear_consent(provider, &channel_id),
            provider,
        })
        .expect("clear stream key");
        assert!(!cleared.configured);
        assert!(cleared.secret_hint.is_none());

        let status = get_broadcast_stream_key_vault_status(BroadcastStreamKeyVaultStatusRequest {
            channel_id,
            provider,
        })
        .expect("read cleared status");
        assert!(!status.configured);
    }

    #[test]
    fn broadcast_stream_key_vault_requires_matching_consent() {
        let provider = BroadcastStreamProvider::Youtube;
        let channel_id = unique_channel_id();
        let error = set_broadcast_stream_key_secret(BroadcastStreamKeyVaultSaveRequest {
            channel_id: channel_id.clone(),
            consent: BroadcastStreamKeyVaultConsent {
                accepted: true,
                channel_id: "other-channel".to_string(),
                operation: STREAM_KEY_SAVE_OPERATION.to_string(),
                provider,
            },
            provider,
            secret: "stream-key-secret-123".to_string(),
        })
        .expect_err("channel mismatch");
        assert!(error.contains("channel mismatch"));
    }

    #[test]
    fn broadcast_stream_key_vault_rejects_unsafe_channel_ids_and_short_keys() {
        assert!(
            get_broadcast_stream_key_vault_status(BroadcastStreamKeyVaultStatusRequest {
                channel_id: "../bad".to_string(),
                provider: BroadcastStreamProvider::Custom,
            })
            .is_err()
        );

        let channel_id = unique_channel_id();
        let error = set_broadcast_stream_key_secret(BroadcastStreamKeyVaultSaveRequest {
            channel_id: channel_id.clone(),
            consent: save_consent(BroadcastStreamProvider::Custom, &channel_id),
            provider: BroadcastStreamProvider::Custom,
            secret: "short".to_string(),
        })
        .expect_err("short key");
        assert!(error.contains("at least 8"));
    }
}
