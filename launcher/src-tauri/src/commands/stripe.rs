use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{DateTime, Duration, Utc};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sha2::{Digest, Sha256};

const LICENSE_TOKEN_PREFIX: &str = "OGL1";
const MAX_LICENSE_TOKEN_BYTES: usize = 16 * 1024;
const MAX_LICENSE_DURATION_DAYS: i64 = 30;
const CLOCK_SKEW_MINUTES: i64 = 5;

#[derive(Debug, Serialize, Deserialize)]
pub struct CheckoutSessionResponse {
    pub session_id: String,
    pub checkout_url: String,
    pub order_id: Option<String>,
    pub status: Option<String>,
}

/// Creates a Stripe Checkout Session via local Supabase Edge Function.
/// Accepts supabase URL + anon key directly (same pattern as sync commands).
#[tauri::command]
pub async fn create_stripe_checkout_session(
    supabase_url: String,
    supabase_anon_key: String,
    auth_token: String,
    product_ids: Vec<String>,
) -> Result<CheckoutSessionResponse, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "{}/functions/v1/stripe-create-checkout",
        supabase_url.trim_end_matches('/')
    );

    let body = serde_json::json!({
        "product_ids": product_ids,
        "success_url": format!("{}/store/checkout/success?session_id={{CHECKOUT_SESSION_ID}}", supabase_url),
        "cancel_url": format!("{}/store/checkout/cancel", supabase_url),
        "device_id": local_license_device_id(),
    });

    let resp = client
        .post(&url)
        .header("apikey", &supabase_anon_key)
        .bearer_auth(auth_token)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Stripe checkout request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let txt = resp.text().await.unwrap_or_default();
        return Err(format!("Stripe checkout returned {status}: {txt}"));
    }

    let session: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Stripe checkout parse failed: {e}"))?;

    Ok(CheckoutSessionResponse {
        session_id: session["id"].as_str().unwrap_or("").to_string(),
        checkout_url: session["url"].as_str().unwrap_or("").to_string(),
        order_id: session["order_id"].as_str().map(ToString::to_string),
        status: session["status"].as_str().map(ToString::to_string),
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseValidationResult {
    pub valid: bool,
    pub reason: String,
    pub product_id: Option<String>,
    pub platform: Option<String>,
    pub device_id: Option<String>,
    pub expires_at: Option<String>,
    pub remaining_days: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct LicenseTokenPayload {
    #[serde(default, alias = "productId")]
    product_id: Option<String>,
    #[serde(default)]
    platform: Option<String>,
    #[serde(default, alias = "deviceId")]
    device_id: Option<String>,
    #[serde(default, alias = "issuedAt")]
    issued_at: Option<JsonValue>,
    #[serde(default, alias = "expiresAt")]
    expires_at: Option<JsonValue>,
}

#[tauri::command]
pub fn validate_license(token: String) -> LicenseValidationResult {
    validate_license_with_context(
        &token,
        Utc::now(),
        &local_license_device_id(),
        current_platform(),
        license_verifying_key().as_ref(),
    )
}

#[tauri::command]
pub fn get_license_device_id() -> String {
    local_license_device_id()
}

fn validate_license_with_context(
    token: &str,
    now: DateTime<Utc>,
    local_device_id: &str,
    current_platform: &str,
    verifying_key: Option<&VerifyingKey>,
) -> LicenseValidationResult {
    let trimmed = token.trim();
    if trimmed.is_empty() {
        return invalid_result("empty_token");
    }

    if trimmed.len() > MAX_LICENSE_TOKEN_BYTES {
        return invalid_result("token_too_large");
    }

    let parts: Vec<&str> = trimmed.split('.').collect();
    if parts.len() != 3 || parts[0] != LICENSE_TOKEN_PREFIX {
        return invalid_result("unsupported_format");
    }

    let payload_bytes = match URL_SAFE_NO_PAD.decode(parts[1].as_bytes()) {
        Ok(bytes) if bytes.len() <= MAX_LICENSE_TOKEN_BYTES => bytes,
        Ok(_) => return invalid_result("payload_too_large"),
        Err(_) => return invalid_result("invalid_payload_encoding"),
    };

    let payload = match serde_json::from_slice::<LicenseTokenPayload>(&payload_bytes) {
        Ok(payload) => payload,
        Err(_) => return invalid_result("invalid_payload"),
    };
    let mut result = result_from_payload(&payload);

    let signature = match URL_SAFE_NO_PAD.decode(parts[2].as_bytes()) {
        Ok(signature) => signature,
        Err(_) => return result.invalid("invalid_signature_encoding"),
    };
    let signature = match Signature::from_slice(&signature) {
        Ok(signature) => signature,
        Err(_) => return result.invalid("invalid_signature"),
    };

    let Some(verifying_key) = verifying_key else {
        return result.invalid("missing_verifying_key");
    };

    let signing_input = format!("{}.{}", parts[0], parts[1]);
    if verifying_key
        .verify(signing_input.as_bytes(), &signature)
        .is_err()
    {
        return result.invalid("bad_signature");
    }

    let product_id = match clean_string(payload.product_id.as_deref(), 256) {
        Some(product_id) => product_id,
        None => return result.invalid("missing_product_id"),
    };
    result.product_id = Some(product_id);

    let platform = match clean_string(payload.platform.as_deref(), 32) {
        Some(platform) => normalize_platform(&platform),
        None => return result.invalid("missing_platform"),
    };
    result.platform = Some(platform.clone());
    if !platform_matches_current(&platform, current_platform) {
        return result.invalid("platform_mismatch");
    }

    let device_id = match clean_string(payload.device_id.as_deref(), 128) {
        Some(device_id) => device_id,
        None => return result.invalid("missing_device_id"),
    };
    result.device_id = Some(device_id.clone());
    if device_id != local_device_id {
        return result.invalid("device_mismatch");
    }

    let expires_at = match payload.expires_at.as_ref().and_then(parse_datetime_value) {
        Some(expires_at) => expires_at,
        None => return result.invalid("invalid_expires_at"),
    };
    result.expires_at = Some(expires_at.to_rfc3339());

    if expires_at <= now {
        result.remaining_days = Some(0);
        return result.invalid("expired");
    }

    if let Some(issued_at_value) = payload.issued_at.as_ref() {
        let Some(issued_at) = parse_datetime_value(issued_at_value) else {
            return result.invalid("invalid_issued_at");
        };
        if issued_at > now + Duration::minutes(CLOCK_SKEW_MINUTES) {
            return result.invalid("issued_in_future");
        }
        if expires_at - issued_at > Duration::days(MAX_LICENSE_DURATION_DAYS) {
            return result.invalid("expires_too_far");
        }
    } else if expires_at - now > Duration::days(MAX_LICENSE_DURATION_DAYS) {
        return result.invalid("expires_too_far");
    }

    let remaining_seconds = (expires_at - now).num_seconds().max(0);
    result.remaining_days = Some((remaining_seconds + 86_399) / 86_400);
    result.valid = true;
    result.reason = "valid".to_string();
    result
}

impl LicenseValidationResult {
    fn invalid(mut self, reason: &str) -> Self {
        self.valid = false;
        self.reason = reason.to_string();
        self
    }
}

fn invalid_result(reason: &str) -> LicenseValidationResult {
    LicenseValidationResult {
        valid: false,
        reason: reason.to_string(),
        product_id: None,
        platform: None,
        device_id: None,
        expires_at: None,
        remaining_days: None,
    }
}

fn result_from_payload(payload: &LicenseTokenPayload) -> LicenseValidationResult {
    LicenseValidationResult {
        valid: false,
        reason: "invalid".to_string(),
        product_id: clean_string(payload.product_id.as_deref(), 256),
        platform: clean_string(payload.platform.as_deref(), 32)
            .map(|value| normalize_platform(&value)),
        device_id: clean_string(payload.device_id.as_deref(), 128),
        expires_at: payload
            .expires_at
            .as_ref()
            .and_then(parse_datetime_value)
            .map(|value| value.to_rfc3339()),
        remaining_days: None,
    }
}

fn parse_datetime_value(value: &JsonValue) -> Option<DateTime<Utc>> {
    if let Some(text) = value.as_str() {
        return DateTime::parse_from_rfc3339(text)
            .map(|datetime| datetime.with_timezone(&Utc))
            .ok();
    }

    if let Some(timestamp) = value.as_i64() {
        return DateTime::<Utc>::from_timestamp(timestamp, 0);
    }

    None
}

fn clean_string(value: Option<&str>, max_len: usize) -> Option<String> {
    let trimmed = value?.trim();
    if trimmed.is_empty() || trimmed.len() > max_len {
        return None;
    }

    Some(trimmed.to_string())
}

fn normalize_platform(platform: &str) -> String {
    match platform.trim().to_ascii_lowercase().as_str() {
        "darwin" | "mac" | "osx" => "macos".to_string(),
        "win32" | "win64" => "windows".to_string(),
        "gnu/linux" => "linux".to_string(),
        other => other.to_string(),
    }
}

fn platform_matches_current(token_platform: &str, current_platform: &str) -> bool {
    token_platform == "pc" || token_platform == normalize_platform(current_platform)
}

fn current_platform() -> &'static str {
    std::env::consts::OS
}

fn license_verifying_key() -> Option<VerifyingKey> {
    std::env::var("OGL_LICENSE_VERIFYING_KEY")
        .ok()
        .and_then(|value| clean_string(Some(&value), 4096))
        .or_else(|| option_env!("OGL_LICENSE_VERIFYING_KEY").map(ToString::to_string))
        .and_then(|value| parse_verifying_key(&value))
}

fn local_license_device_id() -> String {
    let mut parts = vec![
        std::env::consts::OS.to_string(),
        std::env::consts::ARCH.to_string(),
    ];

    if let Some(home_dir) = dirs::home_dir() {
        parts.push(home_dir.to_string_lossy().to_string());
    }
    for key in ["COMPUTERNAME", "HOSTNAME", "USER", "USERNAME"] {
        if let Ok(value) = std::env::var(key) {
            if let Some(cleaned) = clean_string(Some(&value), 512) {
                parts.push(cleaned);
            }
        }
    }

    let digest = Sha256::digest(parts.join("|").as_bytes());
    format!("ogl-{}", hex_encode(&digest[..16]))
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        let byte = *byte;
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

fn parse_verifying_key(value: &str) -> Option<VerifyingKey> {
    let trimmed = value.trim();
    let bytes = URL_SAFE_NO_PAD
        .decode(trimmed.as_bytes())
        .ok()
        .filter(|bytes| bytes.len() == 32)
        .or_else(|| hex_decode(trimmed));
    let bytes = bytes?;
    let key_bytes: [u8; 32] = bytes.try_into().ok()?;
    VerifyingKey::from_bytes(&key_bytes).ok()
}

fn hex_decode(value: &str) -> Option<Vec<u8>> {
    let value = value.trim();
    if !value.len().is_multiple_of(2) {
        return None;
    }

    value
        .as_bytes()
        .chunks(2)
        .map(|chunk| {
            let high = hex_value(chunk[0])?;
            let low = hex_value(chunk[1])?;
            Some((high << 4) | low)
        })
        .collect()
}

fn hex_value(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use serde_json::json;

    const TEST_DEVICE_ID: &str = "device-123";
    const TEST_PLATFORM: &str = "linux";
    const TEST_SIGNING_KEY_BYTES: [u8; 32] = [7; 32];

    fn fixed_now() -> DateTime<Utc> {
        DateTime::parse_from_rfc3339("2026-06-09T12:00:00Z")
            .unwrap()
            .with_timezone(&Utc)
    }

    fn sign_payload(payload: JsonValue) -> String {
        let payload_json = serde_json::to_vec(&payload).unwrap();
        let payload_b64 = URL_SAFE_NO_PAD.encode(payload_json);
        let signing_input = format!("{LICENSE_TOKEN_PREFIX}.{payload_b64}");
        let signing_key = SigningKey::from_bytes(&TEST_SIGNING_KEY_BYTES);
        let signature = signing_key.sign(signing_input.as_bytes());
        let signature_b64 = URL_SAFE_NO_PAD.encode(signature.to_bytes());
        format!("{signing_input}.{signature_b64}")
    }

    fn test_verifying_key() -> VerifyingKey {
        SigningKey::from_bytes(&TEST_SIGNING_KEY_BYTES).verifying_key()
    }

    fn valid_payload() -> JsonValue {
        json!({
            "product_id": "product-1",
            "platform": TEST_PLATFORM,
            "device_id": TEST_DEVICE_ID,
            "issued_at": "2026-06-09T12:00:00Z",
            "expires_at": "2026-06-19T12:00:00Z"
        })
    }

    fn validate_test_token(token: &str) -> LicenseValidationResult {
        validate_license_with_context(
            token,
            fixed_now(),
            TEST_DEVICE_ID,
            TEST_PLATFORM,
            Some(&test_verifying_key()),
        )
    }

    #[test]
    fn validates_signed_license_token() {
        let token = sign_payload(valid_payload());
        let result = validate_test_token(&token);

        assert!(result.valid);
        assert_eq!(result.reason, "valid");
        assert_eq!(result.product_id.as_deref(), Some("product-1"));
        assert_eq!(result.platform.as_deref(), Some(TEST_PLATFORM));
        assert_eq!(result.device_id.as_deref(), Some(TEST_DEVICE_ID));
        assert_eq!(result.remaining_days, Some(10));
    }

    #[test]
    fn rejects_plain_legacy_license_keys_without_panicking() {
        let result = validate_test_token("OGL-00000000-0000-4000-8000-000000000000");

        assert!(!result.valid);
        assert_eq!(result.reason, "unsupported_format");
        assert_eq!(result.product_id, None);
    }

    #[test]
    fn rejects_unsigned_staging_license_keys_without_panicking() {
        let result =
            validate_test_token("OGL-STAGING-UNSIGNED-00000000-0000-4000-8000-000000000000");

        assert!(!result.valid);
        assert_eq!(result.reason, "unsupported_format");
        assert_eq!(result.product_id, None);
    }

    #[test]
    fn rejects_expired_license_token() {
        let mut payload = valid_payload();
        payload["expires_at"] = json!("2026-06-08T12:00:00Z");

        let result = validate_test_token(&sign_payload(payload));

        assert!(!result.valid);
        assert_eq!(result.reason, "expired");
        assert_eq!(result.remaining_days, Some(0));
    }

    #[test]
    fn rejects_tokens_longer_than_thirty_days() {
        let mut payload = valid_payload();
        payload["expires_at"] = json!("2026-07-10T12:00:00Z");

        let result = validate_test_token(&sign_payload(payload));

        assert!(!result.valid);
        assert_eq!(result.reason, "expires_too_far");
    }

    #[test]
    fn rejects_device_mismatch() {
        let mut payload = valid_payload();
        payload["device_id"] = json!("other-device");

        let result = validate_test_token(&sign_payload(payload));

        assert!(!result.valid);
        assert_eq!(result.reason, "device_mismatch");
        assert_eq!(result.device_id.as_deref(), Some("other-device"));
    }

    #[test]
    fn rejects_bad_signature() {
        let token = sign_payload(valid_payload());
        let signature = token.rsplit_once('.').unwrap().1;
        let mut payload = valid_payload();
        payload["product_id"] = json!("product-2");
        let payload_b64 = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&payload).unwrap());
        let tampered = format!("{LICENSE_TOKEN_PREFIX}.{payload_b64}.{signature}");
        let result = validate_test_token(&tampered);

        assert!(!result.valid);
        assert_eq!(result.reason, "bad_signature");
    }

    #[test]
    fn rejects_signed_tokens_when_verify_key_is_missing() {
        let token = sign_payload(valid_payload());
        let result =
            validate_license_with_context(&token, fixed_now(), TEST_DEVICE_ID, TEST_PLATFORM, None);

        assert!(!result.valid);
        assert_eq!(result.reason, "missing_verifying_key");
    }

    #[test]
    fn parses_verify_keys_from_base64url_and_hex() {
        let key = test_verifying_key();
        let key_bytes = key.to_bytes();
        let encoded = URL_SAFE_NO_PAD.encode(key_bytes);
        let hex = hex_encode(&key_bytes);

        assert_eq!(parse_verifying_key(&encoded).unwrap().to_bytes(), key_bytes);
        assert_eq!(parse_verifying_key(&hex).unwrap().to_bytes(), key_bytes);
    }
}
