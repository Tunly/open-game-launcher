use crate::commands::downloads::types::DownloadItemPayload;

pub fn get_xbox_app_downloads() -> Result<Vec<DownloadItemPayload>, String> {
    #[cfg(all(windows, feature = "windows-uiautomation"))]
    {
        return read_xbox_downloads_from_ui_automation();
    }

    #[cfg(not(all(windows, feature = "windows-uiautomation")))]
    Ok(Vec::new())
}

// Reads active Xbox App / Microsoft Store / Gaming Services downloads through
// UI Automation. The Xbox app and the Microsoft Store both install Game Pass
// titles, so we scan any of those windows and look for progress readouts
// (a bare percentage, or a "12,3 GB von 27,4 GB" style line) with the game
// title nearby in the accessibility tree.
#[cfg(all(windows, feature = "windows-uiautomation"))]
fn read_xbox_downloads_from_ui_automation() -> Result<Vec<DownloadItemPayload>, String> {
    use std::collections::HashSet;
    use uiautomation::types::ControlType;
    use uiautomation::UIAutomation;

    let automation = UIAutomation::new().map_err(|error| error.to_string())?;
    let root = automation
        .get_root_element()
        .map_err(|error| error.to_string())?;
    let walker = automation
        .get_control_view_walker()
        .map_err(|error| error.to_string())?;
    let mut windows = Vec::new();
    let Ok(mut current) = walker.get_first_child(&root) else {
        return Ok(Vec::new());
    };
    loop {
        if current.get_control_type().ok() == Some(ControlType::Window)
            && is_downloader_window_name(&current.get_name().unwrap_or_default())
        {
            windows.push(current.clone());
        }
        match walker.get_next_sibling(&current) {
            Ok(next) => current = next,
            Err(_) => break,
        }
    }

    let mut result = Vec::new();
    let mut seen_game_ids = HashSet::new();
    for window in windows {
        let texts = collect_text_nodes(&walker, &window);
        collect_download_items(&texts, &mut result, &mut seen_game_ids);
    }
    Ok(result)
}

#[cfg(all(windows, feature = "windows-uiautomation"))]
fn is_downloader_window_name(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.contains("xbox")
        || lower.contains("microsoft store")
        || lower.contains("gaming services")
        || lower.contains("gamingservices")
        || lower == "store"
}

#[cfg(all(windows, feature = "windows-uiautomation"))]
fn collect_text_nodes(
    walker: &uiautomation::UITreeWalker,
    element: &uiautomation::UIElement,
) -> Vec<String> {
    let mut texts = Vec::new();
    let mut visited = std::collections::HashSet::new();
    collect_text_nodes_recursive(walker, element, &mut texts, &mut visited, 0);
    texts
}

#[cfg(all(windows, feature = "windows-uiautomation"))]
fn collect_text_nodes_recursive(
    walker: &uiautomation::UITreeWalker,
    element: &uiautomation::UIElement,
    texts: &mut Vec<String>,
    visited: &mut std::collections::HashSet<String>,
    depth: usize,
) {
    if depth > 24 {
        return;
    }
    let name = element.get_name().unwrap_or_default().trim().to_string();
    // Collect readable text controls, plus progress readouts that some apps
    // expose on non-text controls (progress bars with a percent name). The
    // control-type query is a cross-process call, so it only runs for elements
    // that actually have a name.
    if !name.is_empty()
        && (element.get_control_type().ok() == Some(uiautomation::types::ControlType::Text)
            || parse_download_text(&name).is_some()
            || parse_percent_text(&name).is_some())
        && visited.insert(format!("{depth}:{}", name.to_lowercase()))
    {
        texts.push(name);
    }
    let Ok(mut child) = walker.get_first_child(element) else {
        return;
    };
    loop {
        collect_text_nodes_recursive(walker, &child, texts, visited, depth + 1);
        match walker.get_next_sibling(&child) {
            Ok(next) => child = next,
            Err(_) => break,
        }
    }
}

#[cfg(all(windows, feature = "windows-uiautomation"))]
fn collect_download_items(
    texts: &[String],
    result: &mut Vec<DownloadItemPayload>,
    seen_game_ids: &mut std::collections::HashSet<String>,
) {
    for index in 0..texts.len() {
        let title = texts[index].trim();
        let parsed = parse_download_text(title);
        let Some(percent) = parsed
            .as_ref()
            .map(|(percent, _, _, _)| *percent)
            .or_else(|| parse_percent_text(title))
        else {
            continue;
        };
        let game_title =
            find_game_title(texts, index).unwrap_or_else(|| "Xbox App download".to_string());
        let game_id = format!("xbox-download-{}", slug(&game_title));
        if !seen_game_ids.insert(game_id.clone()) {
            continue;
        }
        let status = infer_download_status(texts, index);
        let speed = parsed
            .as_ref()
            .and_then(|(_, _, _, speed)| speed.clone())
            .unwrap_or_else(|| {
                if status == "paused" {
                    "Xbox App (Paused)".to_string()
                } else {
                    "Xbox App".to_string()
                }
            });
        result.push(DownloadItemPayload {
            id: format!("download-{game_id}"),
            game_id,
            title: game_title,
            progress: percent.min(100),
            speed,
            status: status.to_string(),
            eta: 999,
            platform: "Xbox App / PC Game Pass".to_string(),
            phase: "external".to_string(),
            bytes_downloaded: parsed.as_ref().map(|(_, downloaded, _, _)| *downloaded),
            bytes_total: parsed.as_ref().map(|(_, _, total, _)| *total),
            can_pause: false,
            can_cancel: false,
            external: true,
            last_updated_at: 0,
            event_revision: 0,
            provider: "xbox".to_string(),
            raw_status: "xbox_app_ui_automation".to_string(),
            progress_source: "xbox_app_ui_automation".to_string(),
            error: None,
            worker_generation: None,
        });
    }
}

// Full readout such as "Downloading 12,3 GB von 27,4 GB" or
// "Wird heruntergeladen (45 %)". Returns (percent, downloaded, total, speed).
#[cfg(all(windows, feature = "windows-uiautomation"))]
fn parse_download_text(value: &str) -> Option<(u32, u64, u64, Option<String>)> {
    let lower = value.to_lowercase();
    if !lower.contains("download") && !lower.contains("heruntergeladen") {
        return None;
    }
    let explicit_percent = lower
        .split_whitespace()
        .find_map(|part| part.trim_end_matches('%').parse::<u32>().ok());
    let parts: Vec<&str> = lower.split_whitespace().collect();
    let marker = parts
        .iter()
        .position(|part| *part == "von" || *part == "of")?;
    let downloaded = parse_size_at(&parts, marker.checked_sub(2)?)
        .or_else(|| parse_size_at(&parts, marker.checked_sub(1)?))?;
    let total = parse_size_at(&parts, marker + 1).or_else(|| parse_size_at(&parts, marker + 2))?;
    let percent = explicit_percent.unwrap_or_else(|| {
        if total == 0 {
            0
        } else {
            ((downloaded as f64 / total as f64) * 100.0)
                .round()
                .clamp(0.0, 100.0) as u32
        }
    });
    let speed = lower
        .split('·')
        .chain(lower.split('|'))
        .find(|part| part.contains("mb/s") || part.contains("gb/s"))
        .map(str::trim)
        .map(str::to_string);
    Some((percent.min(100), downloaded, total, speed))
}

// Bare progress readout such as "45 %", "45%", "Downloading 45 %" or
// "Wird heruntergeladen 45 %". Returns the percentage.
#[cfg(all(windows, feature = "windows-uiautomation"))]
fn parse_percent_text(value: &str) -> Option<u32> {
    let lower = value.to_lowercase();
    if lower.chars().count() > 60 {
        return None;
    }
    // A bare trailing number in a title ("Forza Horizon 5") must not be read
    // as a percentage; multi-token strings need an explicit percent sign.
    let token_count = lower.split_whitespace().count();
    if !lower.contains('%') && token_count > 1 {
        return None;
    }
    let percent = lower
        .split_whitespace()
        .find_map(|part| part.trim_end_matches('%').parse::<u32>().ok())?;
    if percent > 100 {
        return None;
    }
    // "45 MB of 100 MB" contains a bare number but no percent sign; only treat
    // size lines as percentages when they are explicit percent readouts.
    if (lower.contains(" of ") || lower.contains(" von ")) && !lower.contains('%') {
        return None;
    }
    Some(percent)
}

#[cfg(all(windows, feature = "windows-uiautomation"))]
fn find_game_title(texts: &[String], index: usize) -> Option<String> {
    let start = index.saturating_sub(12);
    for candidate in texts[start..index].iter().rev() {
        if looks_like_game_title(candidate) {
            return Some(candidate.trim().to_string());
        }
    }
    None
}

#[cfg(all(windows, feature = "windows-uiautomation"))]
fn infer_download_status(texts: &[String], index: usize) -> &'static str {
    let start = index.saturating_sub(6);
    let end = (index + 6).min(texts.len());
    let mut has_pause = false;
    let mut has_resume = false;
    for text in &texts[start..end] {
        let lower = text.to_lowercase();
        if lower.contains("fortsetzen") || lower.contains("resume") || lower.contains("fortgesetzt")
        {
            has_resume = true;
        }
        if lower.contains("pausier")
            || lower.contains("angehalten")
            || lower.contains("paused")
            || lower.contains("pausing")
        {
            has_pause = true;
        }
    }
    if has_pause && !has_resume {
        return "paused";
    }
    "downloading"
}

#[cfg(all(windows, feature = "windows-uiautomation"))]
fn looks_like_game_title(value: &str) -> bool {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.chars().count() > 80 {
        return false;
    }
    if parse_download_text(trimmed).is_some() || parse_percent_text(trimmed).is_some() {
        return false;
    }
    let lower = trimmed.to_lowercase();
    if lower
        .chars()
        .all(|ch| ch.is_ascii_digit() || ch.is_whitespace())
    {
        return false;
    }
    if lower.contains(" von ") || lower.contains(" of ") {
        return false;
    }
    const STOPWORDS: &[&str] = &[
        "home",
        "my library",
        "library",
        "search",
        "settings",
        "downloads",
        "queue",
        "queued",
        "install",
        "installs",
        "update",
        "updates",
        "play",
        "cloud gaming",
        "game pass",
        "store",
        "collection",
        "friends",
        "achievements",
        "profile",
        "notifications",
        "community",
        "news",
        "captures",
        "deals",
        "categories",
        "back",
        "close",
        "menu",
        "account",
        "sign in",
        "sign out",
        "wird heruntergeladen",
        "wird installiert",
        "download",
        "downloading",
        "installing",
        "installed",
        "paused",
        "pausing",
        "update available",
        "herunterladen",
        "installieren",
        "heruntergeladen",
        "updating",
        "pausiert",
        "angehalten",
        "abgebrochen",
        "failed",
        "error",
        "xbox",
        "microsoft store",
        "gaming services",
    ];
    !STOPWORDS.iter().any(|word| lower == *word)
}

#[cfg(all(windows, feature = "windows-uiautomation"))]
fn parse_size_at(parts: &[&str], index: usize) -> Option<u64> {
    let token = parts.get(index)?;
    if token.chars().all(|character| character.is_ascii_digit()) {
        let unit = parts.get(index + 1)?;
        return parse_size(token, unit);
    }
    // "12,3GB" / "1.2GB" (unit glued to the number) or "12,3" with the unit in
    // the following token ("12,3 GB"). Integer-only parsing used to reject
    // decimal sizes, which is why realistic readouts were never matched.
    if token
        .find(|character: char| character.is_ascii_alphabetic())
        .is_some()
    {
        return parse_size_token(token);
    }
    let unit = parts.get(index + 1)?;
    parse_size(token, unit)
}

#[cfg(all(windows, feature = "windows-uiautomation"))]
fn parse_size_token(token: &str) -> Option<u64> {
    let split_at = token.find(|character: char| character.is_ascii_alphabetic())?;
    parse_size(&token[..split_at], &token[split_at..])
}

#[cfg(all(windows, feature = "windows-uiautomation"))]
fn parse_size(number: &str, unit: &str) -> Option<u64> {
    let value = number.replace(',', ".").parse::<f64>().ok()?;
    let multiplier = if unit.trim_end_matches('·').eq_ignore_ascii_case("gb") {
        1024.0 * 1024.0 * 1024.0
    } else {
        1024.0 * 1024.0
    };
    Some((value * multiplier) as u64)
}

#[cfg(all(windows, feature = "windows-uiautomation"))]
fn slug(value: &str) -> String {
    let mut result = String::new();
    for character in value.to_lowercase().chars() {
        if character.is_ascii_alphanumeric() {
            result.push(character);
        } else if !result.ends_with('-') {
            result.push('-');
        }
    }
    result.trim_matches('-').to_string()
}

#[cfg(test)]
#[cfg(all(windows, feature = "windows-uiautomation"))]
mod tests {
    use super::*;

    #[test]
    fn parses_german_readout_with_decimal_commas() {
        let (percent, downloaded, total, _) =
            parse_download_text("Wird heruntergeladen 45 % · 12,3 GB von 27,4 GB")
                .expect("german readout should parse");
        assert_eq!(percent, 45);
        assert_eq!(downloaded, (12.3_f64 * 1024.0 * 1024.0 * 1024.0) as u64);
        assert_eq!(total, (27.4_f64 * 1024.0 * 1024.0 * 1024.0) as u64);
    }

    #[test]
    fn parses_english_readout_with_decimal_dots() {
        let (percent, downloaded, total, _) =
            parse_download_text("Downloading 45 % · 1.2 GB of 5.6 GB")
                .expect("english readout should parse");
        assert_eq!(percent, 45);
        assert_eq!(downloaded, (1.2_f64 * 1024.0 * 1024.0 * 1024.0) as u64);
        assert_eq!(total, (5.6_f64 * 1024.0 * 1024.0 * 1024.0) as u64);
    }

    #[test]
    fn parses_integer_readout() {
        let (percent, downloaded, total, _) =
            parse_download_text("Downloading 45 % · 123 MB of 456 MB")
                .expect("integer readout should parse");
        assert_eq!(percent, 45);
        assert_eq!(downloaded, 123 * 1024 * 1024);
        assert_eq!(total, 456 * 1024 * 1024);
    }

    #[test]
    fn derives_progress_when_transfer_readout_has_no_percent() {
        let (percent, downloaded, total, _) = parse_download_text("Downloading 12.3 GB of 27.4 GB")
            .expect("size-only readout should parse");
        assert_eq!(percent, 45);
        assert_eq!(downloaded, (12.3_f64 * 1024.0 * 1024.0 * 1024.0) as u64);
        assert_eq!(total, (27.4_f64 * 1024.0 * 1024.0 * 1024.0) as u64);
    }

    #[test]
    fn extracts_speed_from_readout() {
        let (_, _, _, speed) = parse_download_text("Downloading 5.0 GB of 20.0 GB · 23 MB/s")
            .expect("readout with speed should parse");
        assert_eq!(speed.as_deref(), Some("23 mb/s"));
    }

    #[test]
    fn rejects_non_download_text() {
        assert!(parse_download_text("Halo Infinite").is_none());
        assert!(parse_download_text("12,3 GB").is_none());
        assert!(parse_download_text("Garry's Mod").is_none());
    }

    #[test]
    fn parses_bare_percentages() {
        assert_eq!(parse_percent_text("45 %"), Some(45));
        assert_eq!(parse_percent_text("45%"), Some(45));
        assert_eq!(parse_percent_text("Downloading 45 %"), Some(45));
        assert_eq!(parse_percent_text("Wird heruntergeladen 45 %"), Some(45));
        assert_eq!(parse_percent_text("0 %"), Some(0));
        assert_eq!(parse_percent_text("100 %"), Some(100));
        assert_eq!(parse_percent_text("Halo Infinite"), None);
        assert_eq!(parse_percent_text("12,3 GB von 27,4 GB"), None);
        assert_eq!(parse_percent_text("101 %"), None);
    }

    #[test]
    fn identifies_game_titles_near_progress() {
        assert!(looks_like_game_title("Halo Infinite"));
        assert!(looks_like_game_title("Starfield"));
        assert!(looks_like_game_title("Forza Horizon 5"));
        assert!(!looks_like_game_title("45 %"));
        assert!(!looks_like_game_title("Downloading"));
        assert!(!looks_like_game_title("My Library"));
        assert!(!looks_like_game_title("Paused"));
    }

    #[test]
    fn infers_paused_status_from_neighboring_text() {
        let texts = vec![
            "Starfield".to_string(),
            "Paused".to_string(),
            "45 %".to_string(),
        ];
        assert_eq!(infer_download_status(&texts, 2), "paused");

        let texts = vec![
            "Halo Infinite".to_string(),
            "Downloading".to_string(),
            "45 %".to_string(),
        ];
        assert_eq!(infer_download_status(&texts, 2), "downloading");
    }

    #[test]
    fn rejects_size_lines_without_percent_sign() {
        assert_eq!(parse_percent_text("45 MB of 100 MB"), None);
        assert_eq!(parse_percent_text("45 % von 12,3 GB"), Some(45));
    }

    #[test]
    fn falls_back_to_generic_title_when_no_title_is_nearby() {
        let texts = vec!["45 %".to_string()];
        let mut result = Vec::new();
        let mut seen = std::collections::HashSet::new();
        collect_download_items(&texts, &mut result, &mut seen);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].title, "Xbox App download");
        assert_eq!(result[0].progress, 45);
    }

    #[test]
    fn builds_stable_game_ids() {
        assert_eq!(slug("Halo Infinite"), "halo-infinite");
        assert_eq!(slug("Forza Horizon 5"), "forza-horizon-5");
        assert_eq!(slug("Garry's Mod"), "garry-s-mod");
    }

    #[test]
    fn is_downloader_window_name_matches_store_and_xbox() {
        assert!(is_downloader_window_name("Xbox"));
        assert!(is_downloader_window_name("Microsoft Store"));
        assert!(is_downloader_window_name("Store"));
        assert!(is_downloader_window_name("Gaming Services"));
        assert!(!is_downloader_window_name("Open Game Launcher"));
        assert!(!is_downloader_window_name("Steam"));
    }

    #[test]
    fn collects_download_items_with_dedup_and_fallback_title() {
        let texts = vec![
            "Xbox".to_string(),
            "Downloads".to_string(),
            "Halo Infinite".to_string(),
            "45 %".to_string(),
            "Halo Infinite".to_string(),
            "45 %".to_string(),
            "Forza Horizon 5".to_string(),
            "Paused".to_string(),
            "10 %".to_string(),
        ];
        let mut result = Vec::new();
        let mut seen = std::collections::HashSet::new();
        collect_download_items(&texts, &mut result, &mut seen);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].title, "Halo Infinite");
        assert_eq!(result[0].progress, 45);
        assert_eq!(result[1].title, "Forza Horizon 5");
        assert_eq!(result[1].progress, 10);
        assert_eq!(result[1].status, "paused");
        assert!(result[0].external);
    }
}
