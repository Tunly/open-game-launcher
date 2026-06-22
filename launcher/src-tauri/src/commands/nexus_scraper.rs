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

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NexusSearchResult {
    pub name: String,
    pub author: String,
    pub summary: String,
    pub url: String,
    pub icon_url: Option<String>,
    pub downloads: Option<String>,
    pub endorsements: Option<String>,
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

    let name = extract_meta_content(&html, "og:title").unwrap_or_else(|| "Unknown Mod".to_string());

    let author = extract_meta_content(&html, "author")
        .or_else(|| extract_user_class_author(&html))
        .unwrap_or_else(|| "Unknown Author".to_string());

    let summary = extract_meta_content(&html, "og:description").unwrap_or_default();

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

#[tauri::command]
pub async fn search_nexus_mods(
    game: String,
    query: String,
    page: Option<u32>,
) -> Result<Vec<NexusSearchResult>, String> {
    let page_num = page.unwrap_or(1);
    let url = format!(
        "https://www.nexusmods.com/{game}/mods/?tab=popular&search={query}&page={page_num}"
    );

    let client = reqwest::Client::builder()
        .user_agent("OpenGameLauncher/1.0")
        .build()
        .map_err(|error| format!("Failed to create HTTP client: {error}"))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|error| format!("Failed to fetch Nexus Mods search page: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Nexus Mods search page returned HTTP {}",
            response.status()
        ));
    }

    let html = response
        .text()
        .await
        .map_err(|error| format!("Failed to read search page body: {error}"))?;

    let results = parse_search_results(&html, &game);
    Ok(results)
}

fn parse_search_results(html: &str, game: &str) -> Vec<NexusSearchResult> {
    let mut results = Vec::new();

    if let Some(tiles) = find_all_tiles(html) {
        for tile in &tiles {
            if results.len() >= 20 {
                break;
            }
            if let Some(result) = parse_single_tile(tile, game) {
                results.push(result);
            }
        }
    }

    results
}

fn find_all_tiles(html: &str) -> Option<Vec<String>> {
    let mut tiles = Vec::new();

    let class_patterns = [
        "mod-tile",
        "tile-name",
        "mod-card",
        "modlist-tile",
        "listitem",
    ];

    for pattern in &class_patterns {
        let mut search_from = 0;
        while let Some(class_pos) = html[search_from..].find(pattern) {
            let abs_pos = search_from + class_pos;

            let tag_start = html[..abs_pos].rfind('<').unwrap_or(0);

            let open_tag_end = html[tag_start..]
                .find('>')
                .map(|i| tag_start + i + 1)
                .unwrap_or(tag_start);

            let close_tag = find_matching_close_tag(html, tag_start, pattern);
            if let Some(end) = close_tag {
                let tile_content = &html[open_tag_end..end];
                if tile_content.len() > 20 {
                    tiles.push(tile_content.to_string());
                }
            }

            search_from = abs_pos + pattern.len();
        }

        if !tiles.is_empty() {
            break;
        }
    }

    if tiles.is_empty() {
        let mut search_from = 0;
        while let Some(li_pos) = html[search_from..].find("<li") {
            let abs_pos = search_from + li_pos;
            let open_end = html[abs_pos..]
                .find('>')
                .map(|i| abs_pos + i + 1)
                .unwrap_or(abs_pos);
            if let Some(close) = html[open_end..].find("</li>") {
                let content = &html[open_end..open_end + close];
                if content.len() > 50 && content.contains("nexusmods.com") {
                    tiles.push(content.to_string());
                }
                search_from = open_end + close + 5;
            } else {
                break;
            }
        }
    }

    if tiles.is_empty() {
        None
    } else {
        Some(tiles)
    }
}

fn find_matching_close_tag(html: &str, start: usize, _tag_pattern: &str) -> Option<usize> {
    let tag_name = extract_tag_name(&html[start..])?;

    let close_pattern = format!("</{tag_name}>");
    html[start..].find(&close_pattern).map(|i| start + i)
}

fn extract_tag_name(html片段: &str) -> Option<String> {
    let after_bracket = html片段.get(1..)?;
    let end = after_bracket.find([' ', '>', '/'])?;
    let name = &after_bracket[..end];

    let valid_chars: Vec<char> = name.chars().collect();
    if valid_chars.is_empty() || !valid_chars[0].is_ascii_alphabetic() {
        return None;
    }

    Some(name.to_string())
}

fn parse_single_tile(tile: &str, _game: &str) -> Option<NexusSearchResult> {
    let name = extract_tile_name(tile)?;
    let url = extract_tile_url(tile)?;
    let author = extract_tile_stat(tile, "author").unwrap_or_else(|| "Unknown".to_string());
    let summary = extract_tile_summary(tile).unwrap_or_default();
    let icon_url = extract_tile_icon(tile);
    let downloads = extract_tile_stat(tile, "download");
    let endorsements = extract_tile_stat(tile, "endorse");

    Some(NexusSearchResult {
        name,
        author,
        summary,
        url,
        icon_url,
        downloads,
        endorsements,
    })
}

fn extract_tile_name(tile: &str) -> Option<String> {
    let class_markers = ["mod-title", "tile-name", "modcard-name", "name"];
    for marker in &class_markers {
        if let Some(pos) = tile.find(marker) {
            let after = &tile[pos..];
            if let Some(anchor_start) = after.find('>') {
                let text_start = anchor_start + 1;
                if let Some(text_end) = after[text_start..].find('<') {
                    let text = after[text_start..text_start + text_end].trim();
                    if !text.is_empty() {
                        return Some(decode_html_entities(text));
                    }
                }
            }
        }
    }
    None
}

fn extract_tile_url(tile: &str) -> Option<String> {
    let markers = ["nexusmods.com/", "href=\"/"];
    for marker in &markers {
        if let Some(pos) = tile.find(marker) {
            let mut start = pos;
            while start > 0
                && (tile.as_bytes().get(start - 1) == Some(&b'"')
                    || tile.as_bytes().get(start - 1) == Some(&b'\''))
            {
                start -= 1;
            }

            let quote_char = tile.as_bytes().get(start - 1).copied();
            if quote_char == Some(b'"') || quote_char == Some(b'\'') {
                let end_marker = if quote_char == Some(b'"') { '"' } else { '\'' };
                if let Some(end) = tile[start..].find(end_marker) {
                    let raw = &tile[start..start + end];
                    let url = if raw.starts_with("http") {
                        raw.to_string()
                    } else {
                        format!("https://www.nexusmods.com{raw}")
                    };
                    return Some(url);
                }
            }

            let end_chars = ['"', '\'', ' ', '>', '\n', '\r'];
            if let Some(end) = tile[start..].find(|c| end_chars.contains(&c)) {
                let raw = &tile[start..start + end];
                let url = if raw.starts_with("http") {
                    raw.to_string()
                } else {
                    format!("https://www.{raw}")
                };
                return Some(url);
            }
        }
    }
    None
}

fn extract_tile_summary(tile: &str) -> Option<String> {
    let markers = ["description", "summary", "tile-desc"];
    for marker in &markers {
        if let Some(pos) = tile.find(marker) {
            let after = &tile[pos..];
            if let Some(tag_close) = after.find('>') {
                let text_start = tag_close + 1;
                if let Some(text_end) = after[text_start..].find('<') {
                    let text = after[text_start..text_start + text_end].trim();
                    if !text.is_empty() && text.len() > 5 {
                        return Some(decode_html_entities(text));
                    }
                }
            }
        }
    }
    None
}

fn extract_tile_icon(tile: &str) -> Option<String> {
    let img_pos = tile.find("<img")?;
    let after_img = &tile[img_pos..];

    let attrs = ["src=\"", "data-src=\"", "srcset=\""];
    for attr in &attrs {
        if let Some(pos) = after_img.find(attr) {
            let val_start = pos + attr.len();
            let end_quote = '"';
            if let Some(end) = after_img[val_start..].find(end_quote) {
                let val = &after_img[val_start..val_start + end];
                if val.starts_with("http")
                    && (val.contains(".jpg")
                        || val.contains(".png")
                        || val.contains(".webp")
                        || val.contains("nexusmods"))
                {
                    return Some(val.to_string());
                }
            }
        }
    }

    None
}

fn extract_tile_stat(tile: &str, stat_name: &str) -> Option<String> {
    let lower = tile.to_lowercase();
    let stat_lower = stat_name.to_lowercase();

    if let Some(pos) = lower.find(&stat_lower) {
        let before = &tile[..pos];

        let mut start = before.len();
        while start > 0 {
            let ch = before.as_bytes()[start - 1];
            if ch.is_ascii_digit() || ch == b',' || ch == b'.' || ch == b'K' || ch == b'k' {
                start -= 1;
            } else {
                break;
            }
        }

        if start < before.len() {
            let number_part: String = before[start..]
                .chars()
                .filter(|c| c.is_ascii_digit() || *c == ',' || *c == '.' || *c == 'K' || *c == 'k')
                .collect();
            if !number_part.is_empty() {
                return Some(number_part);
            }
        }
    }

    None
}

fn extract_game_name(url: &str) -> Result<String, String> {
    let parsed = url
        .parse::<reqwest::Url>()
        .map_err(|error| format!("Invalid URL: {error}"))?;

    let path = parsed.path();
    let segments: Vec<&str> = path
        .trim_start_matches('/')
        .trim_end_matches('/')
        .split('/')
        .collect();

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
