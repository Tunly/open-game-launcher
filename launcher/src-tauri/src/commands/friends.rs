use serde::Serialize;

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
    let Some(raw) = secure_store::get_secret("gog")? else {
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
// Epic Friends — uses Legendary CLI friends list
// ============================================================================

#[tauri::command]
pub async fn fetch_epic_friends() -> Result<Vec<PlatformFriend>, String> {
    // Epic friends require the Legendary CLI to be authenticated
    let data_dir = super::games::core::open_game_launcher_data_dir()
        .ok_or_else(|| "Could not determine data directory.".to_string())?;

    let legendary_path = data_dir.join("tools").join(if cfg!(target_os = "windows") {
        "legendary.exe"
    } else {
        "legendary"
    });

    if !legendary_path.exists() {
        return Err(
            "Legendary CLI not installed. Connect Epic Games first in Settings.".to_string(),
        );
    }

    let output = tokio::process::Command::new(&legendary_path)
        .args(["friends", "list", "--json"])
        .output()
        .await
        .map_err(|e| format!("Failed to run Legendary: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Legendary friends failed: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse Legendary output: {e}"))?;

    let mut friends = Vec::new();

    if let Some(friend_list) = parsed.as_array() {
        for friend in friend_list {
            let account_id = friend
                .get("account_id")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            let display_name = friend
                .get("display_name")
                .and_then(|v| v.as_str())
                .unwrap_or("Epic User")
                .to_string();
            let status = friend
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("offline");
            let online_status = match status {
                "online" | "ONLINE" | "playing" => "online",
                "away" | "AWAY" => "away",
                _ => "offline",
            };

            if !account_id.is_empty() {
                friends.push(PlatformFriend {
                    platform: "epic".to_string(),
                    platform_id: account_id,
                    display_name,
                    avatar_url: None,
                    online_status: online_status.to_string(),
                });
            }
        }
    }

    Ok(friends)
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
