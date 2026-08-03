use std::collections::{HashMap, HashSet};
use std::time::Duration;

use serde::{Deserialize, Serialize};

use super::secure_store;

// ============================================================================
// Platform Friend Type
// ============================================================================

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlatformFriend {
    pub platform: String,
    pub platform_id: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub online_status: String,
}

const EPIC_FRIENDS_URL: &str =
    "https://friends-public-service-prod.ol.epicgames.com/friends/api/v1";
const EPIC_ACCOUNTS_URL: &str =
    "https://account-public-service-prod.ol.epicgames.com/account/api/public/account";
const EPIC_LAUNCHER_USER_AGENT: &str = "EpicGamesLauncher/14.0.8-22004686+++Portal+Release-Live";

#[derive(Deserialize)]
struct LegendaryBearerToken {
    access_token: String,
    account_id: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EpicFriendRelationship {
    account_id: String,
    alias: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EpicAccountProfile {
    id: String,
    display_name: Option<String>,
}

// ============================================================================
// Steam Friends — uses Steam Community XML (no API key needed for public profiles)
// ============================================================================

#[tauri::command]
pub async fn fetch_steam_friends(steam_id: String) -> Result<Vec<PlatformFriend>, String> {
    if steam_id.is_empty() {
        return Err("Steam ID is required.".to_string());
    }

    let url = format!(
        "https://steamcommunity.com/profiles/{}/friends/?xml=1",
        steam_id
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let response = client
        .get(&url)
        .header("User-Agent", "OG-Launcher/1.0")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch Steam friends: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Steam returned status {}. Profile may be private.",
            response.status()
        ));
    }

    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {e}"))?;

    // Parse XML friend list
    let mut friends = Vec::new();
    // Steam XML format: <friends><friend><steamid>...</steamid><friend_since>...</friend_since></friend>...</friends>
    // We also try the friendsList XML endpoint which has more data
    for segment in body.split("<friend>") {
        if let Some(steamid) = extract_xml_value(segment, "steamid") {
            let name = extract_xml_value(segment, "name")
                .or_else(|| extract_xml_value(segment, "steamid"))
                .unwrap_or_else(|| steamid.clone());
            let avatar = extract_xml_value(segment, "avatarMedium")
                .or_else(|| extract_xml_value(segment, "avatarIcon"));
            let status_text =
                extract_xml_value(segment, "onlineState").unwrap_or_else(|| "offline".to_string());
            let online_status = match status_text.as_str() {
                "online" | "in-game" => "online".to_string(),
                "away" => "away".to_string(),
                "busy" | "snooze" => "busy".to_string(),
                _ => "offline".to_string(),
            };

            friends.push(PlatformFriend {
                platform: "steam".to_string(),
                platform_id: steamid,
                display_name: name,
                avatar_url: avatar,
                online_status,
            });
        }
    }

    Ok(friends)
}

fn extract_xml_value(segment: &str, tag: &str) -> Option<String> {
    let open_tag = format!("<{}>", tag);
    let close_tag = format!("</{}>", tag);
    if let Some(start) = segment.find(&open_tag) {
        let value_start = start + open_tag.len();
        if let Some(end) = segment[value_start..].find(&close_tag) {
            let value = &segment[value_start..value_start + end];
            // Strip CDATA if present
            let cleaned = value
                .trim()
                .strip_prefix("<![CDATA[")
                .and_then(|s| s.strip_suffix("]]>"))
                .unwrap_or(value.trim());
            if !cleaned.is_empty() {
                return Some(cleaned.to_string());
            }
        }
    }
    None
}

// ============================================================================
// GOG Friends — uses GOG Galaxy API
// ============================================================================

#[tauri::command]
pub async fn fetch_gog_friends() -> Result<Vec<PlatformFriend>, String> {
    let access_token = read_gog_access_token()?;
    if access_token.is_empty() {
        return Err("GOG access token is required.".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    // First get the user's GOG user_id
    let user_resp = client
        .get("https://embed.gog.com/userData.json")
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch GOG user data: {e}"))?;

    if !user_resp.status().is_success() {
        return Err("Failed to authenticate with GOG. Token may be expired.".to_string());
    }

    let user_data: serde_json::Value = user_resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse GOG user data: {e}"))?;

    let user_id_str = if let Some(id) = user_data.get("userId").and_then(|v| v.as_u64()) {
        id.to_string()
    } else if let Some(id) = user_data.get("userId").and_then(|v| v.as_str()) {
        id.to_string()
    } else {
        return Err("Could not determine GOG user ID.".to_string());
    };

    // Fetch friends list from GOG Galaxy API
    let friends_url = format!("https://embed.gog.com/users/{}/friends", user_id_str);

    let friends_resp = client
        .get(&friends_url)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch GOG friends: {e}"))?;

    if !friends_resp.status().is_success() {
        return Err(format!(
            "GOG friends API returned status {}.",
            friends_resp.status()
        ));
    }

    let friends_data: serde_json::Value = friends_resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse GOG friends: {e}"))?;

    let mut friends = Vec::new();

    if let Some(friend_list) = friends_data.as_array() {
        for friend in friend_list {
            let gog_id = friend
                .get("user_id")
                .and_then(|v| {
                    v.as_str()
                        .map(|s| s.to_string())
                        .or_else(|| v.as_u64().map(|n| n.to_string()))
                })
                .unwrap_or_default();
            let username = friend
                .get("username")
                .and_then(|v| v.as_str())
                .unwrap_or("GOG User")
                .to_string();
            let avatar = friend
                .get("avatar")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let status = friend
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("offline");
            let online_status = match status {
                "online" | "in-game" => "online",
                _ => "offline",
            };

            if !gog_id.is_empty() {
                friends.push(PlatformFriend {
                    platform: "gog".to_string(),
                    platform_id: gog_id,
                    display_name: username,
                    avatar_url: avatar,
                    online_status: online_status.to_string(),
                });
            }
        }
    }

    Ok(friends)
}

fn read_gog_access_token() -> Result<String, String> {
    let Some(raw) = secure_store::get_secret_keychain_only("gog")? else {
        return Err("GOG token missing. Reconnect in Settings.".to_string());
    };
    let value: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("Failed to parse GOG token: {e}"))?;
    value
        .get("accessToken")
        .or_else(|| value.get("access_token"))
        .and_then(|token| token.as_str())
        .map(str::trim)
        .filter(|token| !token.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "GOG access token missing. Reconnect in Settings.".to_string())
}

// ============================================================================
// Epic Friends - uses Legendary for a fresh bearer token, then Epic friend services.
// ============================================================================

#[tauri::command]
pub async fn fetch_epic_friends() -> Result<Vec<PlatformFriend>, String> {
    let token = load_legendary_bearer_token().await?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent(EPIC_LAUNCHER_USER_AGENT)
        .build()
        .map_err(|_| "Could not initialize the Epic friends connection.".to_string())?;

    let response = client
        .get(format!("{EPIC_FRIENDS_URL}/{}/friends", token.account_id))
        .bearer_auth(&token.access_token)
        .send()
        .await
        .map_err(|_| {
            "Could not reach Epic friends. Check your connection and try again.".to_string()
        })?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED
        || response.status() == reqwest::StatusCode::FORBIDDEN
    {
        return Err("Epic session expired. Reconnect Epic Games in Settings.".to_string());
    }
    if !response.status().is_success() {
        return Err(format!(
            "Epic friends are temporarily unavailable (HTTP {}).",
            response.status().as_u16()
        ));
    }

    let relationships = response
        .json::<Vec<EpicFriendRelationship>>()
        .await
        .map_err(|_| "Epic returned an invalid friends response.".to_string())?;
    if relationships.is_empty() {
        return Ok(Vec::new());
    }

    let account_ids = relationships
        .iter()
        .map(|friend| friend.account_id.trim())
        .filter(|account_id| !account_id.is_empty())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    let mut profiles = HashMap::new();

    for account_id_chunk in account_ids.chunks(100) {
        let query = account_id_chunk
            .iter()
            .map(|account_id| ("accountId", *account_id))
            .collect::<Vec<_>>();
        let response = client
            .get(EPIC_ACCOUNTS_URL)
            .bearer_auth(&token.access_token)
            .query(&query)
            .send()
            .await
            .map_err(|_| {
                "Could not load Epic friend names. Check your connection and try again.".to_string()
            })?;

        if response.status() == reqwest::StatusCode::UNAUTHORIZED
            || response.status() == reqwest::StatusCode::FORBIDDEN
        {
            return Err("Epic session expired. Reconnect Epic Games in Settings.".to_string());
        }
        if !response.status().is_success() {
            return Err(format!(
                "Epic friend names are temporarily unavailable (HTTP {}).",
                response.status().as_u16()
            ));
        }

        let loaded_profiles = response
            .json::<Vec<EpicAccountProfile>>()
            .await
            .map_err(|_| "Epic returned an invalid account response.".to_string())?;
        for profile in loaded_profiles {
            if let Some(display_name) = non_empty_string(profile.display_name.as_deref()) {
                profiles.insert(profile.id, display_name.to_string());
            }
        }
    }

    Ok(map_epic_platform_friends(relationships, &profiles))
}

async fn load_legendary_bearer_token() -> Result<LegendaryBearerToken, String> {
    let legendary_path = super::epic::ensure_legendary_binary().await?;
    let output = tokio::time::timeout(
        Duration::from_secs(20),
        tokio::process::Command::new(&legendary_path)
            .args(["get-token", "--bearer", "--json"])
            .output(),
    )
    .await
    .map_err(|_| "Epic session refresh timed out. Try again.".to_string())?
    .map_err(|_| "Could not refresh the Epic session. Reconnect in Settings.".to_string())?;

    if !output.status.success() {
        return Err("Epic session expired. Reconnect Epic Games in Settings.".to_string());
    }

    parse_legendary_bearer_token(&output.stdout)
}

fn parse_legendary_bearer_token(output: &[u8]) -> Result<LegendaryBearerToken, String> {
    let token = serde_json::from_slice::<LegendaryBearerToken>(output).map_err(|_| {
        "Legendary returned an invalid Epic session. Reconnect in Settings.".to_string()
    })?;
    if token.access_token.trim().is_empty() || token.account_id.trim().is_empty() {
        return Err("Epic session is incomplete. Reconnect Epic Games in Settings.".to_string());
    }
    Ok(token)
}

fn map_epic_platform_friends(
    relationships: Vec<EpicFriendRelationship>,
    profiles: &HashMap<String, String>,
) -> Vec<PlatformFriend> {
    let mut seen = HashSet::new();

    relationships
        .into_iter()
        .filter_map(|relationship| {
            let account_id = relationship.account_id.trim();
            if account_id.is_empty() || !seen.insert(account_id.to_string()) {
                return None;
            }

            let display_name = profiles
                .get(account_id)
                .and_then(|name| non_empty_string(Some(name.as_str())))
                .or_else(|| non_empty_string(relationship.alias.as_deref()))
                .map(ToOwned::to_owned)
                .unwrap_or_else(|| format!("Epic Player {}", account_id_suffix(account_id)));

            Some(PlatformFriend {
                platform: "epic".to_string(),
                platform_id: account_id.to_string(),
                display_name,
                avatar_url: None,
                online_status: "unknown".to_string(),
            })
        })
        .collect()
}

fn non_empty_string(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

fn account_id_suffix(account_id: &str) -> &str {
    let start = account_id
        .char_indices()
        .rev()
        .nth(5)
        .map(|(index, _)| index)
        .unwrap_or(0);
    &account_id[start..]
}

// ============================================================================
// Xbox Friends — uses Xbox People API (requires auth token)
// ============================================================================

#[tauri::command]
pub async fn fetch_xbox_friends(xbox_token: String) -> Result<Vec<PlatformFriend>, String> {
    if xbox_token.is_empty() {
        return Err("Xbox auth token is required.".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let response = client
        .get("https://peoplehub.xboxlive.com/users/me/people/social")
        .header("Authorization", format!("XBL3.0 x={}", xbox_token))
        .header("x-xbl-contract-version", "5")
        .header("Accept-Language", "en-US")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch Xbox friends: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Xbox People API returned status {}. Token may be expired.",
            response.status()
        ));
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Xbox response: {e}"))?;

    let mut friends = Vec::new();

    if let Some(people) = data.get("people").and_then(|v| v.as_array()) {
        for person in people {
            let xuid = person
                .get("xuid")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            let gamertag = person
                .get("gamertag")
                .and_then(|v| v.as_str())
                .unwrap_or("Xbox User")
                .to_string();
            let avatar = person
                .get("displayPicRaw")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let presence_state = person
                .get("presenceState")
                .and_then(|v| v.as_str())
                .unwrap_or("Offline");
            let online_status = match presence_state {
                "Online" => "online",
                "Away" => "away",
                "Busy" => "busy",
                _ => "offline",
            };

            if !xuid.is_empty() {
                friends.push(PlatformFriend {
                    platform: "xbox".to_string(),
                    platform_id: xuid,
                    display_name: gamertag,
                    avatar_url: avatar,
                    online_status: online_status.to_string(),
                });
            }
        }
    }

    Ok(friends)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_legendary_bearer_token_without_exposing_it() {
        let token = parse_legendary_bearer_token(
            br#"{"access_token":"secret-access-token","account_id":"epic-account-1"}"#,
        )
        .expect("valid bearer token");

        assert_eq!(token.account_id, "epic-account-1");
        assert_eq!(token.access_token, "secret-access-token");

        let error =
            parse_legendary_bearer_token(br#"{"access_token":"","account_id":"epic-account-1"}"#)
                .err()
                .expect("empty token must fail");
        assert!(!error.contains("epic-account-1"));
    }

    #[test]
    fn maps_epic_friends_with_profiles_aliases_and_safe_fallbacks() {
        let relationships = vec![
            EpicFriendRelationship {
                account_id: "epic-account-1".to_string(),
                alias: Some("Ignored alias".to_string()),
            },
            EpicFriendRelationship {
                account_id: "epic-account-2".to_string(),
                alias: Some("Squad Mate".to_string()),
            },
            EpicFriendRelationship {
                account_id: "1234567890abcdef".to_string(),
                alias: None,
            },
            EpicFriendRelationship {
                account_id: "epic-account-1".to_string(),
                alias: None,
            },
            EpicFriendRelationship {
                account_id: "   ".to_string(),
                alias: None,
            },
        ];
        let profiles = HashMap::from([("epic-account-1".to_string(), "Display Name".to_string())]);

        let friends = map_epic_platform_friends(relationships, &profiles);

        assert_eq!(friends.len(), 3);
        assert_eq!(friends[0].display_name, "Display Name");
        assert_eq!(friends[1].display_name, "Squad Mate");
        assert_eq!(friends[2].display_name, "Epic Player abcdef");
        assert!(friends.iter().all(|friend| friend.platform == "epic"));
        assert!(friends
            .iter()
            .all(|friend| friend.online_status == "unknown"));
    }
}
