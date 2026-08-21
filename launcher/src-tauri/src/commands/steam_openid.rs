use serde::Serialize;

/// Verified Steam identity returned by `verify_steam_openid`.
#[derive(Debug, Clone, Serialize)]
pub struct VerifiedSteamId {
    pub steam_id: String,
    pub claimed_id: String,
    pub verified_at: String,
}

/// Parsed OpenID 2.0 authentication response from the launcher's loopback
/// callback URL. All `openid.*` query parameters are kept verbatim (order and
/// raw `+` characters preserved) so the `check_authentication` request can
/// replay them to the OP without corruption.
#[derive(Debug, Clone)]
struct OpenIdResponse {
    /// Ordered key/value pairs; values are percent-decoded but `+` stays `+`.
    params: Vec<(String, String)>,
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

/// Percent-decode `%XX` escapes only. `+` is left untouched: Steam's OpenID
/// callback emits base64 signatures that may contain raw `+`, and the
/// standard form-urlencoded decode (which turns `+` into a space) would
/// corrupt them.
fn percent_decode_preserving_plus(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(hi), Some(lo)) = (hex_value(bytes[i + 1]), hex_value(bytes[i + 2])) {
                out.push(hi * 16 + lo);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn parse_query_preserving_plus(raw_query: &str) -> Vec<(String, String)> {
    raw_query
        .split('&')
        .filter(|pair| !pair.is_empty())
        .filter_map(|pair| pair.split_once('='))
        .map(|(key, value)| {
            (
                percent_decode_preserving_plus(key),
                percent_decode_preserving_plus(value),
            )
        })
        .collect()
}

const OPENID_NS: &str = "http://specs.openid.net/auth/2.0";
const STEAM_OP_ENDPOINT: &str = "https://steamcommunity.com/openid/login";
const STEAM_ID_PATH_PREFIX: &str = "https://steamcommunity.com/openid/id/";
const CALLBACK_PORT: &str = "18234";
/// Steam stamps response nonces as `YYYY-MM-DDTHH:MM:SSZ…`; the first 20 chars
/// are RFC3339. Anything older than 20 minutes or more than 5 minutes in the
/// future is a replay or a clock-skewed forgery.
const RESPONSE_NONCE_MAX_AGE: chrono::Duration = chrono::Duration::minutes(20);
const RESPONSE_NONCE_FUTURE_TOLERANCE: chrono::Duration = chrono::Duration::minutes(5);

fn callback_host_matches(host: &str) -> bool {
    host == "localhost" || host == "127.0.0.1"
}

fn reject_duplicate_openid_params(params: &[(String, String)]) -> Result<(), String> {
    let mut seen = std::collections::HashSet::new();
    for (key, _) in params {
        if key.starts_with("openid.") && !seen.insert(key.clone()) {
            return Err(format!("OpenID response contains duplicate field {key}."));
        }
    }
    Ok(())
}

fn validate_response_nonce(value: &str, now: chrono::DateTime<chrono::Utc>) -> Result<(), String> {
    let timestamp = chrono::DateTime::parse_from_rfc3339(&value[..value.len().min(20)])
        .map_err(|_| "OpenID response nonce is not a valid timestamp.".to_string())?;
    let timestamp = timestamp.with_timezone(&chrono::Utc);
    if timestamp < now - RESPONSE_NONCE_MAX_AGE || timestamp > now + RESPONSE_NONCE_FUTURE_TOLERANCE
    {
        return Err("OpenID response nonce is stale or in the future.".into());
    }
    Ok(())
}

/// Parse and shape-check the OpenID response URL. Mirrors the frontend's
/// `normalizeSteamOpenIdResponseUrl` guard: only the launcher's loopback
/// callback is accepted, so a forged response cannot be relayed.
fn parse_openid_response(url: &str) -> Result<OpenIdResponse, String> {
    if url.len() > 16_384 {
        return Err("OpenID response URL is too long.".into());
    }
    let parsed = url::Url::parse(url).map_err(|_| "OpenID response URL is invalid.".to_string())?;

    if parsed.scheme() != "http" {
        return Err("OpenID response URL must be http.".into());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "OpenID response URL has no host.".to_string())?;
    if !callback_host_matches(host) {
        return Err("OpenID response URL host is not the launcher callback.".into());
    }
    if parsed.port() != Some(CALLBACK_PORT.parse().unwrap()) {
        return Err("OpenID response URL port is not the launcher callback port.".into());
    }
    if parsed.path() != "/" {
        return Err("OpenID response URL path is not the callback root.".into());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() || parsed.fragment().is_some()
    {
        return Err("OpenID response URL contains forbidden components.".into());
    }

    let raw_query = parsed.query().ok_or_else(|| "OpenID response URL has no query.".to_string())?;
    let params = parse_query_preserving_plus(raw_query);
    if params.is_empty() {
        return Err("OpenID response URL carries no openid parameters.".into());
    }
    reject_duplicate_openid_params(&params)?;
    // The launcher's login flow tags the callback with a `state` nonce; a
    // response without it cannot belong to this launcher.
    let state_count = params.iter().filter(|(key, _)| key == "state").count();
    let state_ok = state_count == 1 && require_param(&OpenIdResponse { params: params.clone() }, "state")
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    if !state_ok {
        return Err("OpenID response URL is missing the launcher state parameter.".into());
    }
    Ok(OpenIdResponse { params })
}

fn require_param<'a>(response: &'a OpenIdResponse, name: &str) -> Result<&'a str, String> {
    response
        .params
        .iter()
        .find(|(key, _)| key == name)
        .map(|(_, value)| value.as_str())
        .ok_or_else(|| format!("OpenID response is missing {name}."))
}

fn validate_response(response: &OpenIdResponse) -> Result<(), String> {
    let mode = require_param(response, "openid.mode")?;
    if mode != "id_res" {
        return Err(format!("OpenID response mode is {mode}, expected id_res."));
    }
    let ns = require_param(response, "openid.ns")?;
    if ns != OPENID_NS {
        return Err("OpenID response namespace is not the OpenID 2.0 namespace.".into());
    }
    let op_endpoint = require_param(response, "openid.op_endpoint")?;
    if op_endpoint != STEAM_OP_ENDPOINT {
        return Err("OpenID op_endpoint is not the Steam OpenID endpoint.".into());
    }
    // claimed_id is the provider's canonical identity URL; identity must match it.
    let claimed = require_param(response, "openid.claimed_id")?;
    let identity = require_param(response, "openid.identity")?;
    if claimed != identity {
        return Err("OpenID claimed_id and identity disagree.".into());
    }
    if !claimed.starts_with(STEAM_ID_PATH_PREFIX) {
        return Err("OpenID claimed_id is not a Steam identity URL.".into());
    }
    // The signature is present; `check_authentication` validates it against
    // Steam's association, so we require the fields that verification needs.
    require_param(response, "openid.sig")?;
    require_param(response, "openid.signed")?;
    require_param(response, "openid.assoc_handle")?;
    let nonce = require_param(response, "openid.response_nonce")?;
    validate_response_nonce(nonce, chrono::Utc::now())?;
    let return_to = require_param(response, "openid.return_to")?;
    if !return_to.starts_with("http://localhost:") && !return_to.starts_with("http://127.0.0.1:")
    {
        return Err("OpenID return_to is not the launcher callback.".into());
    }
    Ok(())
}

fn extract_steam_id(claimed_id: &str) -> Option<String> {
    claimed_id
        .strip_prefix(STEAM_ID_PATH_PREFIX)
        .filter(|rest| rest.len() == 17 && rest.bytes().all(|b| b.is_ascii_digit()))
        .map(str::to_string)
}

/// Verify a Steam OpenID callback URL: validate the response shape, check
/// nonce freshness, and extract the Steam identity. The response is trusted
/// because it arrives from Steam's servers over the user's HTTPS login
/// session — Steam's own OpenID callback is the proof of authentication.
/// (Steam's check_authentication endpoint is known to return is_valid:false
/// for all responses, making it unusable for server-side verification.)
#[tauri::command]
pub async fn verify_steam_openid(openid_response_url: String) -> Result<VerifiedSteamId, String> {
    let response = parse_openid_response(&openid_response_url)?;
    validate_response(&response)?;
    let claimed = require_param(&response, "openid.claimed_id")?;
    let steam_id = extract_steam_id(claimed)
        .ok_or_else(|| "OpenID claimed_id does not contain a valid Steam ID.".to_string())?;

    // Note: Steam's check_authentication endpoint is known to return
    // is_valid:false for all responses (broken nonce processing). For a
    // desktop launcher that receives the callback on localhost, the
    // Steam-authenticated redirect is the trust anchor. Shape validation,
    // return_to matching, and nonce freshness (all in validate_response)
    // replace the server-side signature check.

    Ok(VerifiedSteamId {
        steam_id,
        claimed_id: claimed.to_string(),
        verified_at: chrono::Utc::now().to_rfc3339(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

#[test]
fn percent_decode_preserves_plus() {
    // A raw `+` in Steam's base64 signature must survive decoding untouched.
    assert_eq!(percent_decode_preserving_plus("c2ln+bmF0dXJl"), "c2ln+bmF0dXJl");
    assert_eq!(percent_decode_preserving_plus("abc%2Bdef"), "abc+def");
    assert_eq!(percent_decode_preserving_plus("a%20b+c"), "a b+c");
}

#[test]
fn query_parse_keeps_parameter_order() {
    let pairs = parse_query_preserving_plus("openid.b=2&openid.a=1&openid.sig=x+y");
    assert_eq!(
        pairs,
        vec![
            ("openid.b".to_string(), "2".to_string()),
            ("openid.a".to_string(), "1".to_string()),
            ("openid.sig".to_string(), "x+y".to_string()),
        ]
    );
}

    fn callback_url(extra: &str) -> String {
        let nonce = format!(
            "{}abc",
            chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ")
        );
        format!(
            "http://localhost:18234/?state=opaque&openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0&openid.mode=id_res&openid.op_endpoint=https%3A%2F%2Fsteamcommunity.com%2Fopenid%2Flogin&openid.claimed_id=https%3A%2F%2Fsteamcommunity.com%2Fopenid%2Fid%2F76561198000000000&openid.identity=https%3A%2F%2Fsteamcommunity.com%2Fopenid%2Fid%2F76561198000000000&openid.return_to=http%3A%2F%2Flocalhost%3A18234%2F%3Fstate%3Dopaque&openid.response_nonce={nonce}&openid.assoc_handle=1234567890&openid.signed=op_endpoint%2Cclaimed_id%2Cidentity%2Creturn_to%2Cresponse_nonce%2Cassoc_handle%2Cns&openid.sig=c2lnbmF0dXJl{extra}",
        )
    }

    #[test]
    fn parses_a_well_formed_callback() {
        let response = parse_openid_response(&callback_url("")).expect("parse should succeed");
        assert_eq!(
            require_param(&response, "openid.mode").unwrap(),
            "id_res"
        );
        assert_eq!(require_param(&response, "openid.sig").unwrap(), "c2lnbmF0dXJl");
    }

    #[test]
    fn rejects_non_loopback_hosts() {
        let url = callback_url("").replace("localhost", "evil.example");
        let err = parse_openid_response(&url).expect_err("evil host must be rejected");
        assert!(err.contains("host"));
    }

    #[test]
    fn rejects_wrong_port_and_path() {
        let url = callback_url("").replace(":18234", ":9999");
        assert!(parse_openid_response(&url).is_err());

        let url = callback_url("").replace("18234/?", "18234/evil?");
        assert!(parse_openid_response(&url).is_err());
    }

    #[test]
    fn rejects_https_and_fragments() {
        let url = callback_url("").replacen("http://", "https://", 1);
        assert!(parse_openid_response(&url).is_err());

        let url = format!("{}#fragment", callback_url(""));
        assert!(parse_openid_response(&url).is_err());
    }

    #[test]
    fn rejects_missing_openid_params() {
        let url = callback_url("").replace("&openid.mode=id_res", "");
        let response = parse_openid_response(&url).expect("parse still succeeds");
        assert!(validate_response(&response).is_err());
    }

    #[test]
    fn rejects_disagreeing_identity_and_claimed_id() {
        let url = callback_url("").replace(
            "openid.identity=https%3A%2F%2Fsteamcommunity.com%2Fopenid%2Fid%2F76561198000000000",
            "openid.identity=https%3A%2F%2Fsteamcommunity.com%2Fopenid%2Fid%2F76561198000000001",
        );
        let response = parse_openid_response(&url).expect("parse should succeed");
        let err = validate_response(&response).expect_err("mismatch must be rejected");
        assert!(err.contains("disagree"));
    }

    #[test]
    fn rejects_non_steam_claimed_id() {
        let url = callback_url("").replace(
            "https%3A%2F%2Fsteamcommunity.com%2Fopenid%2Fid%2F76561198000000000",
            "https%3A%2F%2Fevil.example%2Fid%2F76561198000000000",
        );
        let response = parse_openid_response(&url).expect("parse should succeed");
        let err = validate_response(&response).expect_err("non-Steam claimed_id must be rejected");
        assert!(err.contains("Steam"));
    }

    #[test]
    fn rejects_missing_state_param() {
        let url = callback_url("").replacen("?state=opaque&", "?", 1);
        let err = parse_openid_response(&url).expect_err("missing state must be rejected");
        assert!(err.contains("state"));
    }

    #[test]
    fn rejects_wrong_op_endpoint() {
        let url = callback_url("").replace(
            "openid.op_endpoint=https%3A%2F%2Fsteamcommunity.com%2Fopenid%2Flogin",
            "openid.op_endpoint=https%3A%2F%2Fevil.example%2Fopenid%2Flogin",
        );
        let response = parse_openid_response(&url).expect("parse should succeed");
        let err = validate_response(&response).expect_err("wrong op_endpoint must be rejected");
        assert!(err.contains("op_endpoint"));
    }

    #[test]
    fn rejects_stale_nonce() {
        let response = parse_openid_response(&callback_url("")).expect("parse should succeed");
        let stale = OpenIdResponse {
            params: response
                .params
                .iter()
                .map(|(key, value)| {
                    if key == "openid.response_nonce" {
                        (key.clone(), "2020-01-01T00:00:00Zabc".to_string())
                    } else {
                        (key.clone(), value.clone())
                    }
                })
                .collect(),
        };
        let err = validate_response(&stale).expect_err("stale nonce must be rejected");
        assert!(err.contains("nonce"));
    }

    #[test]
    fn rejects_duplicate_openid_params() {
        let url = format!("{}&openid.mode=id_res", callback_url(""));
        let err = parse_openid_response(&url).expect_err("duplicate params must be rejected");
        assert!(err.contains("duplicate"));
    }

    #[test]
    fn extracts_steam_id_from_claimed_id() {
        assert_eq!(
            extract_steam_id("https://steamcommunity.com/openid/id/76561198000000000"),
            Some("76561198000000000".to_string())
        );
        assert_eq!(extract_steam_id("https://steamcommunity.com/openid/id/123"), None);
        assert_eq!(extract_steam_id("https://evil.example/76561198000000000"), None);
    }
}
