use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NexusModInfo {
    pub name: String,
    pub author: String,
    pub summary: String,
    pub icon_url: Option<String>,
    pub downloads_count: Option<String>,
    pub game_name: String,
}

#[tauri::command]
pub async fn scrape_nexus_mod_info(url: String) -> Result<NexusModInfo, String> {
    let game_name = extract_game_name(&url)?;

    let client = reqwest::Client::builder()
        .user_agent("OpenGameLauncher/1.0")
        .build()
        .map_err(|error| format!("Failed to create HTTP client: {error}"))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|error| format!("Failed to fetch Nexus Mods page: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Nexus Mods page returned HTTP {}",
            response.status()
        ));
    }

    let html = response
        .text()
        .await
        .map_err(|error| format!("Failed to read page body: {error}"))?;

    let name = extract_meta_content(&html, "og:title")
        .unwrap_or_else(|| "Unknown Mod".to_string());

    let author = extract_meta_content(&html, "author")
        .or_else(|| extract_user_class_author(&html))
        .unwrap_or_else(|| "Unknown Author".to_string());

    let summary = extract_meta_content(&html, "og:description")
        .unwrap_or_default();

    let icon_url = extract_meta_content(&html, "og:image");

    let downloads_count = extract_downloads_count(&html);

    Ok(NexusModInfo {
        name,
        author,
        summary,
        icon_url,
        downloads_count,
        game_name,
    })
}

fn extract_game_name(url: &str) -> Result<String, String> {
    let parsed = url
        .parse::<reqwest::Url>()
        .map_err(|error| format!("Invalid URL: {error}"))?;

    let path = parsed.path();
    let segments: Vec<&str> = path.trim_start_matches('/').trim_end_matches('/').split('/').collect();

    if segments.len() >= 2 && segments[1] == "mods" {
        return Ok(segments[0].to_string());
    }

    Err("Could not extract game name from Nexus Mods URL. Expected format: nexusmods.com/{game}/mods/{id}".to_string())
}

fn extract_meta_content(html: &str, property: &str) -> Option<String> {
    let patterns = [
        format!("property=\"{property}\""),
        format!("property = \"{property}\""),
        format!("name=\"{property}\""),
        format!("name = \"{property}\""),
    ];

    for pattern in &patterns {
        if let Some(idx) = html.find(pattern) {
            let before = &html[..idx];
            let _ = before.rfind("<meta");
            let after_pattern = &html[idx + pattern.len()..];
            if let Some(content_start) = after_pattern.find("content=\"") {
                let value_start = content_start + 9;
                if let Some(value_end) = after_pattern[value_start..].find('"') {
                    let value = &after_pattern[value_start..value_start + value_end];
                    let decoded = decode_html_entities(value);
                    return Some(decoded);
                }
            }
        }
    }

    None
}

fn extract_user_class_author(html: &str) -> Option<String> {
    let class_pattern = "class=\"user";
    let idx = html.find(class_pattern)?;

    let after = &html[idx..];
    let tag_close = after.find('>')?;
    let between = &after[tag_close + 1..];
    let text_end = between.find('<')?;
    let author = between[..text_end].trim().to_string();

    if !author.is_empty() {
        Some(decode_html_entities(&author))
    } else {
        None
    }
}

fn extract_downloads_count(html: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let needle = "downloads";
    let idx = lower.find(needle)?;

    let before = &html[..idx];

    let mut start = before.len();
    while start > 0 {
        let ch = before.as_bytes()[start - 1];
        if ch.is_ascii_digit() || ch == b',' || ch == b'.' {
            start -= 1;
        } else {
            break;
        }
    }

    if start < before.len() {
        let number_part: String = before[start..]
            .chars()
            .filter(|c| c.is_ascii_digit() || *c == ',' || *c == '.')
            .collect();
        if !number_part.is_empty() {
            return Some(number_part);
        }
    }

    None
}

fn decode_html_entities(input: &str) -> String {
    input
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&apos;", "'")
        .replace("&#x2F;", "/")
}
