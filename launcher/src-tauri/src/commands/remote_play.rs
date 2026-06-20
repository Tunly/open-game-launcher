use serde::{Deserialize, Serialize};

use crate::commands::uri_safety::{open_uri_safely, validate_uri_scheme};

const STEAM_RUN_PREFIX: &str = "steam://run/";
const STEAM_RUNGAMEID_PREFIX: &str = "steam://rungameid/";
const MAX_STEAM_APP_ID_LENGTH: usize = 10;

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemotePlayRequest {
    pub game_id: Option<String>,
    pub launcher: Option<String>,
    pub external_id: Option<String>,
    pub launch_uri: Option<String>,
    pub cloud_gaming_url: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemotePlayLaunch {
    pub provider: String,
    pub mode: String,
    pub uri: String,
    pub message: String,
}

#[tauri::command]
pub fn start_remote_play(input: RemotePlayRequest) -> Result<RemotePlayLaunch, String> {
    let launch = build_remote_play_launch(&input)?;
    open_uri_safely(&launch.uri)?;
    Ok(launch)
}

pub fn build_remote_play_launch(input: &RemotePlayRequest) -> Result<RemotePlayLaunch, String> {
    if let Some(app_id) = resolve_steam_app_id(input) {
        let uri = format!("{STEAM_RUN_PREFIX}{app_id}");
        let safe_uri = validate_remote_delegate_uri(&uri)?.to_string();
        return Ok(RemotePlayLaunch {
            provider: "steam".to_string(),
            mode: "steam_remote_play".to_string(),
            uri: safe_uri,
            message: "Delegating Remote Play to Steam.".to_string(),
        });
    }

    for (candidate, source) in [
        (input.cloud_gaming_url.as_deref(), "cloud"),
        (input.launch_uri.as_deref(), "launcher"),
    ] {
        let Some(uri) = clean_optional_uri(candidate) else {
            continue;
        };
        let Ok(safe_uri) = validate_remote_delegate_uri(uri) else {
            continue;
        };
        return Ok(RemotePlayLaunch {
            provider: provider_from_uri(safe_uri).to_string(),
            mode: if source == "cloud" {
                "cloud_gaming".to_string()
            } else {
                "launcher_delegation".to_string()
            },
            uri: safe_uri.to_string(),
            message: if source == "cloud" {
                "Opening the configured Remote Play cloud endpoint.".to_string()
            } else {
                "Delegating Remote Play to the platform launcher.".to_string()
            },
        });
    }

    Err("No supported Remote Play provider or URI is available for this game.".to_string())
}

pub fn validate_remote_delegate_uri(uri: &str) -> Result<&str, String> {
    let safe_uri = validate_uri_scheme(uri)?;
    if safe_uri.starts_with("http://") {
        return Err(
            "Remote Play only opens HTTPS URLs or official launcher URI schemes.".to_string(),
        );
    }
    Ok(safe_uri)
}

pub fn resolve_steam_app_id(input: &RemotePlayRequest) -> Option<String> {
    if is_steam_source(input) {
        if let Some(app_id) = input
            .external_id
            .as_deref()
            .and_then(normalize_steam_app_id)
        {
            return Some(app_id);
        }
        if let Some(app_id) = input.game_id.as_deref().and_then(normalize_steam_app_id) {
            return Some(app_id);
        }
    }

    input
        .launch_uri
        .as_deref()
        .and_then(steam_app_id_from_launch_uri)
}

fn clean_optional_uri(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

fn is_steam_source(input: &RemotePlayRequest) -> bool {
    input
        .launcher
        .as_deref()
        .map(|launcher| launcher.trim().eq_ignore_ascii_case("steam"))
        .unwrap_or(false)
        || input
            .game_id
            .as_deref()
            .map(|game_id| game_id.trim().to_ascii_lowercase().starts_with("steam-"))
            .unwrap_or(false)
}

fn normalize_steam_app_id(value: &str) -> Option<String> {
    let trimmed = value.trim();
    let candidate = trimmed.strip_prefix("steam-").unwrap_or(trimmed);
    if candidate.is_empty()
        || candidate.len() > MAX_STEAM_APP_ID_LENGTH
        || !candidate
            .chars()
            .all(|character| character.is_ascii_digit())
    {
        return None;
    }
    let parsed = candidate.parse::<u64>().ok()?;
    if parsed == 0 {
        return None;
    }
    Some(candidate.to_string())
}

fn steam_app_id_from_launch_uri(uri: &str) -> Option<String> {
    let trimmed = uri.trim();
    for prefix in [STEAM_RUN_PREFIX, STEAM_RUNGAMEID_PREFIX] {
        if let Some(rest) = trimmed.strip_prefix(prefix) {
            let app_id = rest.split(['?', '#', '/', '&']).next().unwrap_or_default();
            return normalize_steam_app_id(app_id);
        }
    }
    None
}

fn provider_from_uri(uri: &str) -> &'static str {
    if uri.starts_with("steam://") {
        "steam"
    } else if uri.starts_with("https://") {
        "cloud"
    } else {
        "launcher"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(input: RemotePlayRequest) -> RemotePlayRequest {
        input
    }

    #[test]
    fn steam_app_id_prefers_external_id() {
        let launch = build_remote_play_launch(&request(RemotePlayRequest {
            game_id: Some("steam-999".to_string()),
            launcher: Some("steam".to_string()),
            external_id: Some("440".to_string()),
            launch_uri: Some("steam://rungameid/620".to_string()),
            cloud_gaming_url: Some("https://play.example/half-life".to_string()),
        }))
        .unwrap();

        assert_eq!(launch.provider, "steam");
        assert_eq!(launch.mode, "steam_remote_play");
        assert_eq!(launch.uri, "steam://run/440");
    }

    #[test]
    fn steam_app_id_can_be_resolved_from_launch_uri() {
        let launch = build_remote_play_launch(&request(RemotePlayRequest {
            launcher: Some("manual".to_string()),
            launch_uri: Some("steam://rungameid/620".to_string()),
            ..RemotePlayRequest::default()
        }))
        .unwrap();

        assert_eq!(launch.uri, "steam://run/620");
    }

    #[test]
    fn numeric_non_steam_external_id_does_not_become_steam() {
        let launch = build_remote_play_launch(&request(RemotePlayRequest {
            launcher: Some("epic".to_string()),
            external_id: Some("730".to_string()),
            cloud_gaming_url: Some("https://cloud.example/play".to_string()),
            ..RemotePlayRequest::default()
        }))
        .unwrap();

        assert_eq!(launch.provider, "cloud");
        assert_eq!(launch.uri, "https://cloud.example/play");
    }

    #[test]
    fn cloud_https_url_is_allowed() {
        let launch = build_remote_play_launch(&request(RemotePlayRequest {
            cloud_gaming_url: Some(" https://remote.example/play ".to_string()),
            ..RemotePlayRequest::default()
        }))
        .unwrap();

        assert_eq!(launch.mode, "cloud_gaming");
        assert_eq!(launch.uri, "https://remote.example/play");
    }

    #[test]
    fn official_launcher_uri_is_allowed_as_fallback() {
        let launch = build_remote_play_launch(&request(RemotePlayRequest {
            launch_uri: Some("com.epicgames.launcher://apps/Fortnite?action=launch".to_string()),
            ..RemotePlayRequest::default()
        }))
        .unwrap();

        assert_eq!(launch.provider, "launcher");
        assert_eq!(launch.mode, "launcher_delegation");
    }

    #[test]
    fn unsafe_or_plain_http_urls_are_rejected() {
        assert!(validate_remote_delegate_uri("http://example.com/play").is_err());
        assert!(validate_remote_delegate_uri("javascript:alert(1)").is_err());
        assert!(validate_remote_delegate_uri("file:///tmp/game").is_err());
    }

    #[test]
    fn invalid_cloud_url_can_fall_back_to_safe_launch_uri() {
        let launch = build_remote_play_launch(&request(RemotePlayRequest {
            cloud_gaming_url: Some("javascript:alert(1)".to_string()),
            launch_uri: Some("goggalaxy://openGameView/1207664643".to_string()),
            ..RemotePlayRequest::default()
        }))
        .unwrap();

        assert_eq!(launch.uri, "goggalaxy://openGameView/1207664643");
    }

    #[test]
    fn unsupported_input_returns_error() {
        let result = build_remote_play_launch(&request(RemotePlayRequest {
            launcher: Some("manual".to_string()),
            external_id: Some("not-a-steam-app".to_string()),
            launch_uri: Some("file:///tmp/game".to_string()),
            ..RemotePlayRequest::default()
        }));

        assert!(result.is_err());
    }
}
