//! Achievement sync: Steam session/community sync, best-effort local cache
//! import for GOG/Epic/EA/Ubisoft/Battle.net, and the Epic public fallback.
//! Split out of `core.rs`; re-exported through `games/mod.rs`.

use chrono::{DateTime, SecondsFormat, Utc};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    process::Command,
};

use super::core::{
    current_unix_timestamp, env_path, launcher_key_from_source, normalize_game_id,
    open_game_launcher_data_dir, path_to_string, read_installed_games_cache_result, slugify,
    unix_timestamp_to_iso, update_installed_game_cache,
};
use super::detect::{fetch_steam_achievements, steam_app_id_for_game};
use super::types::*;

const ACHIEVEMENT_CLIENT_CACHE_MAX_DEPTH: usize = 4;
const ACHIEVEMENT_CLIENT_CACHE_MAX_DISCOVERED_FILES: usize = 64;
const ACHIEVEMENT_CLIENT_CACHE_MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;

#[tauri::command]
pub fn open_achievement_cache_folder(provider: Option<String>) -> Result<String, String> {
    let base_dir = open_game_launcher_data_dir()
        .ok_or_else(|| "Could not resolve OG-Launcher data directory.".to_string())?
        .join("achievement-cache");

    let folder = provider
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty() && value.chars().all(|c| c.is_ascii_alphanumeric()))
        .map(|value| base_dir.join(value))
        .unwrap_or(base_dir);

    fs::create_dir_all(&folder)
        .map_err(|error| format!("Could not create achievement cache folder: {error}"))?;

    let folder = folder
        .canonicalize()
        .map_err(|error| format!("Could not resolve achievement cache folder: {error}"))?;
    open_local_directory(&folder)
        .map_err(|error| format!("Could not open achievement cache folder: {error}"))?;
    let folder_text = path_to_string(folder);

    Ok(folder_text)
}

fn open_local_directory(path: &Path) -> Result<(), String> {
    if !path.is_dir() {
        return Err("Local folder does not exist.".to_string());
    }

    #[cfg(target_os = "windows")]
    let mut command = Command::new("explorer.exe");
    #[cfg(target_os = "macos")]
    let mut command = Command::new("open");
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = Command::new("xdg-open");

    command
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not start the system folder opener: {error}"))
}

fn upsert_achievement_provider_status(game: &mut InstalledGame, status: AchievementProviderStatus) {
    game.achievement_provider_statuses
        .retain(|existing| existing.source != status.source);
    game.achievement_provider_statuses.push(status);
}

#[tauri::command]
pub fn update_achievement_provider_status(
    input: UpdateAchievementProviderStatusRequest,
) -> Result<InstalledGame, String> {
    let game_id = normalize_game_id(input.game_id)?;
    update_installed_game_cache(&game_id, move |game| {
        upsert_achievement_provider_status(game, input.status);
        Ok(())
    })
}

#[tauri::command]
pub async fn sync_game_achievements(
    app: tauri::AppHandle,
    game_id: String,
    steam_id: Option<String>,
    fallback_game: Option<InstalledGame>,
) -> Result<SyncGameAchievementsResponse, String> {
    sync_steam_achievements_impl(app, game_id, steam_id, fallback_game).await
}

#[tauri::command]
pub async fn sync_steam_session_achievements(
    app: tauri::AppHandle,
    game_id: String,
    steam_id: Option<String>,
    fallback_game: Option<InstalledGame>,
) -> Result<SyncGameAchievementsResponse, String> {
    sync_steam_achievements_impl(app, game_id, steam_id, fallback_game).await
}

async fn sync_steam_achievements_impl(
    app: tauri::AppHandle,
    game_id: String,
    steam_id: Option<String>,
    fallback_game: Option<InstalledGame>,
) -> Result<SyncGameAchievementsResponse, String> {
    let game_id = normalize_game_id(game_id)?;
    println!("[open-game-launcher] Steam session achievement sync requested for {game_id}");

    let (game, should_persist_to_native_cache) = resolve_achievement_sync_game(
        &game_id,
        read_installed_games_cache_result(),
        fallback_game,
    )?;
    let appid = steam_app_id_for_game(&game).ok_or_else(|| {
        format!(
            "{} does not expose a Steam app ID, so achievements cannot be synced yet.",
            game.title
        )
    })?;

    let steam_id = steam_id
        .map(|steam_id| steam_id.trim().to_string())
        .filter(|steam_id| !steam_id.is_empty());
    let (achievements, achievement_source) = if let Some(steam_id) = steam_id.as_deref() {
        match crate::commands::system::fetch_steam_session_achievements(&app, steam_id, appid).await
        {
            Ok(achievements) if !achievements.is_empty() => {
                (achievements, "steam_authenticated_session")
            }
            Ok(_) => {
                eprintln!(
                    "[open-game-launcher] Authenticated Steam session returned no achievements for {}. Trying the keyless Community fallback.",
                    game.title
                );
                (
                    fetch_steam_achievements(appid, Some(steam_id.to_string())).await?,
                    "steam_community_fallback",
                )
            }
            Err(error) => {
                eprintln!(
                    "[open-game-launcher] Authenticated Steam session was unavailable for {}: {error}. Trying the keyless Community fallback.",
                    game.title
                );
                (
                    fetch_steam_achievements(appid, Some(steam_id.to_string())).await?,
                    "steam_community_fallback",
                )
            }
        }
    } else {
        (
            fetch_steam_achievements(appid, None).await?,
            "steam_community_fallback",
        )
    };
    if achievements.is_empty() {
        return Err(format!(
            "Steam returned no achievements for {}. The game may not expose public achievement data.",
            game.title
        ));
    }

    let unlocked_achievements = achievements
        .iter()
        .filter(|achievement| achievement.unlocked_at.is_some())
        .count();
    let synced_achievements = achievements.len();
    // Merge with existing local data: keep any previously known unlock timestamps that the
    // new fetch did not return (e.g., transient API failure, dropped IDs).
    let synced_at = unix_timestamp_to_iso(current_unix_timestamp());
    let game = if should_persist_to_native_cache {
        update_installed_game_cache(&game_id, move |game| {
            game.achievements = preserve_known_unlocks(achievements, &game.achievements);
            game.achievements_synced_at = Some(synced_at);
            Ok(())
        })?
    } else {
        let mut synced_game = game;
        synced_game.achievements = preserve_known_unlocks(achievements, &synced_game.achievements);
        synced_game.achievements_synced_at = Some(synced_at);
        synced_game
    };

    Ok(SyncGameAchievementsResponse {
        achievement_source: Some(achievement_source.to_string()),
        game_id,
        success: true,
        game: game.clone(),
        synced_achievements,
        unlocked_achievements,
        message: format!(
            "{} achievements synced from {}: {unlocked_achievements}/{synced_achievements} unlocked.",
            game.title,
            if achievement_source == "steam_authenticated_session" {
                "the authenticated Steam session"
            } else {
                "the Steam Community fallback"
            }
        ),
    })
}

fn resolve_achievement_sync_game(
    game_id: &str,
    cached_games: Result<Vec<InstalledGame>, String>,
    fallback_game: Option<InstalledGame>,
) -> Result<(InstalledGame, bool), String> {
    let fallback_game = fallback_game.filter(|game| game.id == game_id);
    if let (Some(game), Some(provider)) = (
        fallback_game.as_ref(),
        achievement_provider_from_game_id(game_id),
    ) {
        validate_achievement_sync_game_provider(game, provider)?;
    }
    match cached_games {
        Ok(games) => {
            if let Some(game) = games.into_iter().find(|game| game.id == game_id) {
                return Ok((game, true));
            }
        }
        Err(_)
            if fallback_game.is_some() && achievement_provider_from_game_id(game_id).is_some() => {}
        Err(error) => return Err(error),
    }

    fallback_game
        .map(|game| (game, false))
        .ok_or_else(|| format!("Game '{game_id}' was not found in the local library cache."))
}

fn achievement_provider_from_game_id(game_id: &str) -> Option<&'static str> {
    for (prefix, provider) in [
        ("steam-owned-", "steam"),
        ("steam-", "steam"),
        ("gog-owned-", "gog"),
        ("gog-", "gog"),
        ("epic-owned-", "epic"),
        ("epic-", "epic"),
        ("ea-owned-", "ea"),
        ("ea-", "ea"),
        ("ubisoft-owned-", "ubisoft"),
        ("ubisoft-", "ubisoft"),
        ("battlenet-owned-", "battlenet"),
        ("battlenet-", "battlenet"),
    ] {
        if game_id.starts_with(prefix) {
            return Some(provider);
        }
    }
    None
}

fn validate_achievement_sync_game_provider(
    game: &InstalledGame,
    expected_provider: &str,
) -> Result<(), String> {
    let actual_provider = launcher_key_from_source(&game.launcher);
    if actual_provider != expected_provider {
        return Err(format!(
            "Game '{}' launcher '{}' does not match provider '{expected_provider}'.",
            game.id, game.launcher
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn sync_local_game_achievements(
    game_id: String,
    provider: String,
    fallback_game: Option<InstalledGame>,
) -> Result<SyncGameAchievementsResponse, String> {
    let game_id = normalize_game_id(game_id)?;
    let provider = normalize_local_achievement_provider(&provider)?;
    println!(
        "[open-game-launcher] sync_local_game_achievements requested for {game_id} via {provider}"
    );

    let (game, should_persist_to_native_cache) = resolve_achievement_sync_game(
        &game_id,
        read_installed_games_cache_result(),
        fallback_game,
    )?;
    validate_achievement_sync_game_provider(&game, &provider)?;
    let achievements = sync_best_effort_achievements(&provider, &game).await?;
    if achievements.is_empty() {
        return Err(format!(
            "Local {provider} achievement cache did not contain readable achievements for {}.",
            game.title
        ));
    }

    let unlocked_achievements = achievements
        .iter()
        .filter(|achievement| achievement.unlocked_at.is_some())
        .count();
    let synced_achievements = achievements.len();
    let synced_at = unix_timestamp_to_iso(current_unix_timestamp());
    let game = if should_persist_to_native_cache {
        update_installed_game_cache(&game_id, move |game| {
            game.achievements = preserve_known_unlocks(achievements, &game.achievements);
            game.achievements_synced_at = Some(synced_at);
            Ok(())
        })?
    } else {
        let mut synced_game = game;
        synced_game.achievements = preserve_known_unlocks(achievements, &synced_game.achievements);
        synced_game.achievements_synced_at = Some(synced_at);
        synced_game
    };

    Ok(SyncGameAchievementsResponse {
        achievement_source: None,
        game_id,
        success: true,
        game: game.clone(),
        synced_achievements,
        unlocked_achievements,
        message: format!(
            "{} local {provider} achievements imported: {unlocked_achievements}/{synced_achievements} unlocked.",
            game.title
        ),
    })
}

async fn sync_best_effort_achievements(
    provider: &str,
    game: &InstalledGame,
) -> Result<Vec<UnifiedAchievement>, String> {
    if provider == "gog" {
        if let Some(gog_id) = game
            .external_id
            .as_deref()
            .filter(|value| !value.is_empty())
        {
            match crate::commands::gog::fetch_gog_achievements(gog_id).await {
                Ok(achievements) if !achievements.is_empty() => {
                    return Ok(merge_local_achievement_cache_overlay(
                        provider,
                        game,
                        achievements,
                    ));
                }
                Ok(_) => {
                    eprintln!(
                        "[open-game-launcher] GOG achievements API returned no achievements for {}. Trying local cache.",
                        game.title
                    );
                }
                Err(error) => {
                    eprintln!(
                        "[open-game-launcher] GOG achievements API failed for {}: {error}. Trying local cache.",
                        game.title
                    );
                }
            }
        }
    }
    if provider == "epic" {
        if let Some(app_name) = game
            .external_id
            .as_deref()
            .filter(|value| !value.is_empty())
        {
            match crate::commands::epic::fetch_epic_legendary_achievements(app_name).await {
                Ok(achievements) if !achievements.is_empty() => {
                    return Ok(merge_local_achievement_cache_overlay(
                        provider,
                        game,
                        achievements,
                    ));
                }
                Ok(_) => {
                    eprintln!(
                        "[open-game-launcher] Legendary info returned no achievements for {}. Trying local cache.",
                        game.title
                    );
                }
                Err(error) => {
                    eprintln!(
                        "[open-game-launcher] Legendary achievement metadata unavailable for {}: {error}. Trying local cache.",
                        game.title
                    );
                }
            }
        }
    }

    match read_local_achievement_cache(provider, game) {
        Ok(achievements) => Ok(achievements),
        Err(local_error) if provider == "epic" => fetch_epic_public_achievements(game)
            .await
            .map(|achievements| merge_local_achievement_cache_overlay(provider, game, achievements))
            .map_err(|epic_error| {
                format!("{local_error} Epic public fallback failed: {epic_error}")
            }),
        Err(error) => Err(error),
    }
}

fn merge_local_achievement_cache_overlay(
    provider: &str,
    game: &InstalledGame,
    achievements: Vec<UnifiedAchievement>,
) -> Vec<UnifiedAchievement> {
    if !matches!(provider, "epic" | "gog") {
        return achievements;
    }

    match read_local_achievement_cache(provider, game) {
        Ok(local_achievements) if !local_achievements.is_empty() => {
            preserve_known_unlocks(achievements, &local_achievements)
        }
        Ok(_) => achievements,
        Err(error) => {
            eprintln!(
                "[open-game-launcher] No local {provider} unlock overlay applied for {}: {error}",
                game.title
            );
            achievements
        }
    }
}

fn read_local_achievement_cache(
    provider: &str,
    game: &InstalledGame,
) -> Result<Vec<UnifiedAchievement>, String> {
    let candidates = local_achievement_cache_candidates(provider, game);
    let cache_path = candidates
        .iter()
        .find(|path| path.is_file())
        .ok_or_else(|| {
            format!(
                "No local {provider} achievement cache found for {}. Checked: {}",
                game.title,
                local_achievement_candidate_summary(&candidates)
            )
        })?;

    let contents = fs::read_to_string(cache_path)
        .map_err(|error| format!("Could not read local achievement cache: {error}"))?;
    let value: serde_json::Value = serde_json::from_str(&contents)
        .map_err(|error| format!("Could not parse local achievement cache JSON: {error}"))?;
    parse_local_achievement_cache(&value, provider)
}

fn normalize_local_achievement_provider(provider: &str) -> Result<String, String> {
    let normalized = provider.trim().to_lowercase();
    match normalized.as_str() {
        "gog" | "epic" | "ea" | "ubisoft" | "battlenet" => Ok(normalized),
        _ => Err(format!(
            "Local achievement import is not configured for provider '{provider}'."
        )),
    }
}

fn local_achievement_cache_candidates(provider: &str, game: &InstalledGame) -> Vec<PathBuf> {
    let mut keys = vec![game.id.clone(), slugify(&game.title)];
    if let Some(external_id) = game.external_id.as_ref().filter(|value| !value.is_empty()) {
        keys.push(external_id.clone());
        keys.push(slugify(external_id));
    }

    let mut candidates = Vec::new();

    if let Some(root) =
        open_game_launcher_data_dir().map(|data_dir| data_dir.join("achievement-cache"))
    {
        for scoped_root in [root.join(provider), root.join("local")] {
            for key in &keys {
                let safe_key = slugify(key);
                for candidate in [key.clone(), safe_key] {
                    push_unique_path(
                        &mut candidates,
                        scoped_root.join(format!("{candidate}.json")),
                    );
                }
            }
        }
    }

    for root in local_achievement_client_cache_roots(provider) {
        for key in &keys {
            let safe_key = slugify(key);
            for candidate in [key.clone(), safe_key] {
                push_unique_path(&mut candidates, root.join(format!("{candidate}.json")));
                push_unique_path(
                    &mut candidates,
                    root.join(&candidate).join("achievements.json"),
                );
                push_unique_path(
                    &mut candidates,
                    root.join(&candidate)
                        .join(format!("{provider}-achievements.json")),
                );
                push_unique_path(
                    &mut candidates,
                    root.join("achievements").join(format!("{candidate}.json")),
                );
            }
        }
        discover_local_achievement_cache_files(&root, &keys, &mut candidates);
    }

    if let Some(install_path) = game.install_path.as_ref().filter(|value| !value.is_empty()) {
        let install_root = PathBuf::from(install_path);
        for filename in [
            "og-achievements.json".to_string(),
            "achievements.json".to_string(),
            format!("{provider}-achievements.json"),
        ] {
            push_unique_path(&mut candidates, install_root.join(&filename));
            push_unique_path(
                &mut candidates,
                install_root.join(".og-launcher").join(&filename),
            );
        }
    }

    candidates
}

fn local_achievement_client_cache_roots(provider: &str) -> Vec<PathBuf> {
    let mut roots = Vec::new();

    if let Some(data_dir) = open_game_launcher_data_dir() {
        roots.push(data_dir.join("client-cache").join(provider));
    }

    push_provider_achievement_client_cache_roots(
        &mut roots,
        provider,
        env_path("LOCALAPPDATA"),
        env_path("ProgramData"),
        env_path("APPDATA"),
    );

    roots
}

fn push_provider_achievement_client_cache_roots(
    roots: &mut Vec<PathBuf>,
    provider: &str,
    local_app_data: Option<PathBuf>,
    program_data: Option<PathBuf>,
    app_data: Option<PathBuf>,
) {
    match provider {
        "ea" => {
            if let Some(local_app_data) = local_app_data.as_ref() {
                roots.push(local_app_data.join("Electronic Arts").join("EA Desktop"));
                roots.push(
                    local_app_data
                        .join("Electronic Arts")
                        .join("EA Desktop")
                        .join("cache"),
                );
                roots.push(local_app_data.join("Origin"));
            }
            if let Some(program_data) = program_data.as_ref() {
                roots.push(program_data.join("EA Desktop"));
                roots.push(program_data.join("Electronic Arts").join("EA Desktop"));
                roots.push(program_data.join("Origin"));
            }
        }
        "ubisoft" => {
            if let Some(local_app_data) = local_app_data.as_ref() {
                roots.push(
                    local_app_data
                        .join("Ubisoft")
                        .join("Ubisoft Game Launcher")
                        .join("cache"),
                );
                roots.push(local_app_data.join("Ubisoft Game Launcher").join("cache"));
            }
            if let Some(program_data) = program_data.as_ref() {
                roots.push(
                    program_data
                        .join("Ubisoft")
                        .join("Ubisoft Game Launcher")
                        .join("cache"),
                );
            }
        }
        "battlenet" => {
            if let Some(program_data) = program_data.as_ref() {
                roots.push(program_data.join("Battle.net"));
                roots.push(
                    program_data
                        .join("Blizzard Entertainment")
                        .join("Battle.net"),
                );
            }
            if let Some(local_app_data) = local_app_data.as_ref() {
                roots.push(local_app_data.join("Battle.net"));
                roots.push(
                    local_app_data
                        .join("Blizzard Entertainment")
                        .join("Battle.net"),
                );
            }
            if let Some(app_data) = app_data.as_ref() {
                roots.push(app_data.join("Battle.net"));
            }
        }
        "gog" => {
            if let Some(program_data) = program_data.as_ref() {
                roots.push(program_data.join("GOG.com").join("Galaxy").join("webcache"));
            }
            if let Some(local_app_data) = local_app_data.as_ref() {
                roots.push(
                    local_app_data
                        .join("GOG.com")
                        .join("Galaxy")
                        .join("webcache"),
                );
            }
        }
        "epic" => {
            if let Some(program_data) = program_data.as_ref() {
                roots.push(
                    program_data
                        .join("Epic")
                        .join("EpicGamesLauncher")
                        .join("Data"),
                );
            }
            if let Some(local_app_data) = local_app_data.as_ref() {
                roots.push(local_app_data.join("EpicGamesLauncher").join("Saved"));
            }
        }
        _ => {}
    }
}

fn discover_local_achievement_cache_files(
    root: &Path,
    keys: &[String],
    candidates: &mut Vec<PathBuf>,
) {
    if !root.is_dir() {
        return;
    }

    let key_tokens = keys
        .iter()
        .flat_map(|key| [key.to_lowercase(), slugify(key)])
        .filter(|key| !key.is_empty())
        .collect::<HashSet<_>>();
    if key_tokens.is_empty() {
        return;
    }

    let mut discovered = 0usize;
    discover_local_achievement_cache_files_inner(
        root,
        &key_tokens,
        candidates,
        0,
        &mut discovered,
        false,
    );
}

fn discover_local_achievement_cache_files_inner(
    dir: &Path,
    key_tokens: &HashSet<String>,
    candidates: &mut Vec<PathBuf>,
    depth: usize,
    discovered: &mut usize,
    descended_from_matching_key_dir: bool,
) {
    if depth > ACHIEVEMENT_CLIENT_CACHE_MAX_DEPTH
        || *discovered >= ACHIEVEMENT_CLIENT_CACHE_MAX_DISCOVERED_FILES
    {
        return;
    }

    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        if *discovered >= ACHIEVEMENT_CLIENT_CACHE_MAX_DISCOVERED_FILES {
            return;
        }

        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        if file_type.is_dir() {
            let dir_name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
                .to_lowercase();
            let dir_matches_key = local_achievement_cache_name_matches(&dir_name, key_tokens);
            if depth == 0 || descended_from_matching_key_dir || dir_matches_key {
                discover_local_achievement_cache_files_inner(
                    &path,
                    key_tokens,
                    candidates,
                    depth + 1,
                    discovered,
                    descended_from_matching_key_dir || dir_matches_key,
                );
            }
            continue;
        }

        if !file_type.is_file() || !is_local_achievement_cache_file_candidate(&path, key_tokens) {
            continue;
        }

        if let Ok(metadata) = entry.metadata() {
            if metadata.len() > ACHIEVEMENT_CLIENT_CACHE_MAX_FILE_BYTES {
                continue;
            }
        }

        push_unique_path(candidates, path);
        *discovered += 1;
    }
}

fn is_local_achievement_cache_file_candidate(path: &Path, key_tokens: &HashSet<String>) -> bool {
    if !path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("json"))
    {
        return false;
    }

    let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
        return false;
    };

    local_achievement_cache_name_matches(&file_name.to_lowercase(), key_tokens)
}

fn local_achievement_cache_name_matches(name: &str, key_tokens: &HashSet<String>) -> bool {
    let achievement_hint = name.contains("achievement")
        || name.contains("achievements")
        || name.contains("trophy")
        || name.contains("trophies")
        || name.contains("stat")
        || name.contains("stats")
        || name.contains("progress");

    achievement_hint || key_tokens.iter().any(|key| name.contains(key))
}

fn push_unique_path(paths: &mut Vec<PathBuf>, path: PathBuf) {
    if !paths.contains(&path) {
        paths.push(path);
    }
}

fn local_achievement_candidate_summary(candidates: &[PathBuf]) -> String {
    if candidates.is_empty() {
        return "no candidate paths could be built".to_string();
    }

    const MAX_PATHS: usize = 8;
    let mut summary = candidates
        .iter()
        .take(MAX_PATHS)
        .map(|path| path.display().to_string())
        .collect::<Vec<_>>()
        .join("; ");

    if candidates.len() > MAX_PATHS {
        summary.push_str(&format!("; +{} more", candidates.len() - MAX_PATHS));
    }

    summary
}

async fn fetch_epic_public_achievements(
    game: &InstalledGame,
) -> Result<Vec<UnifiedAchievement>, String> {
    let client = reqwest::Client::builder()
        .user_agent("OG-Launcher achievement sync")
        .build()
        .map_err(|error| format!("Could not create Epic achievements client: {error}"))?;

    let mut errors = Vec::new();
    for slug in epic_achievement_slug_candidates(game) {
        let url = format!("https://store.epicgames.com/achievements/{slug}?lang=en-US");
        match client.get(&url).send().await {
            Ok(response) if response.status().is_success() => {
                let html = response
                    .text()
                    .await
                    .map_err(|error| format!("Could not read Epic achievements page: {error}"))?;
                let achievements = parse_epic_public_achievement_html(&html);
                if !achievements.is_empty() {
                    cache_epic_public_achievements(game, &achievements);
                    return Ok(achievements);
                }
                errors.push(format!("{slug}: no readable achievements in page"));
            }
            Ok(response) => {
                errors.push(format!("{slug}: HTTP {}", response.status()));
            }
            Err(error) => {
                errors.push(format!("{slug}: {error}"));
            }
        }
    }

    Err(format!(
        "No public Epic achievement page matched {}. {}",
        game.title,
        errors.join("; ")
    ))
}

fn cache_epic_public_achievements(game: &InstalledGame, achievements: &[UnifiedAchievement]) {
    let Some(root) = open_game_launcher_data_dir()
        .map(|data_dir| data_dir.join("achievement-cache").join("epic"))
    else {
        return;
    };
    if let Err(error) = fs::create_dir_all(&root) {
        eprintln!("[open-game-launcher] Could not create Epic achievement cache: {error}");
        return;
    }

    let payload = serde_json::json!({
        "source": "epic-public",
        "gameId": game.id,
        "externalId": game.external_id,
        "fetchedAt": unix_timestamp_to_iso(current_unix_timestamp()),
        "achievements": achievements,
    });
    let Ok(contents) = serde_json::to_string_pretty(&payload) else {
        return;
    };

    let mut keys = vec![game.id.clone(), slugify(&game.title)];
    if let Some(external_id) = game.external_id.as_ref().filter(|value| !value.is_empty()) {
        keys.push(external_id.clone());
        keys.push(slugify(external_id));
    }

    for key in keys {
        let safe_key = slugify(&key);
        if safe_key.is_empty() {
            continue;
        }
        let path = root.join(format!("{safe_key}.json"));
        if let Err(error) = fs::write(&path, &contents) {
            eprintln!(
                "[open-game-launcher] Could not write Epic achievement cache {}: {error}",
                path.display()
            );
        }
    }
}

fn epic_achievement_slug_candidates(game: &InstalledGame) -> Vec<String> {
    let mut candidates = Vec::new();
    for value in [
        game.slug.as_str(),
        game.external_id.as_deref().unwrap_or_default(),
        game.id
            .strip_prefix("epic-owned-")
            .or_else(|| game.id.strip_prefix("epic-"))
            .unwrap_or_default(),
        game.title.as_str(),
    ] {
        let slug = slugify(value);
        if !slug.is_empty() && !candidates.contains(&slug) {
            candidates.push(slug);
        }
    }
    candidates
}

fn parse_epic_public_achievement_html(html: &str) -> Vec<UnifiedAchievement> {
    let lines = html_to_text_lines(html);
    let mut achievements = Vec::new();

    for index in 3..lines.len() {
        let Some(rarity) = epic_unlock_percent(&lines[index]) else {
            continue;
        };
        if !lines[index - 1].ends_with(" XP") {
            continue;
        }

        let title = lines[index - 3].trim();
        let description = lines[index - 2].trim();
        if title.is_empty()
            || description.is_empty()
            || title.eq_ignore_ascii_case("achievements")
            || title.eq_ignore_ascii_case("alphabetical")
        {
            continue;
        }

        let id = slugify(title);
        if achievements
            .iter()
            .any(|achievement: &UnifiedAchievement| achievement.id == id)
        {
            continue;
        }

        achievements.push(UnifiedAchievement {
            id: id.clone(),
            name: title.to_string(),
            description: Some(description.to_string()),
            icon_url: None,
            unlocked_at: None,
            rarity: Some(rarity),
            source: Some("epic".to_string()),
            source_achievement_id: Some(id),
            provider_confidence: Some("unofficial".to_string()),
        });
    }

    achievements
}

fn html_to_text_lines(html: &str) -> Vec<String> {
    let mut text = String::with_capacity(html.len());
    let mut in_tag = false;
    let mut entity = String::new();
    let mut in_entity = false;

    for character in html.chars() {
        if in_tag {
            if character == '>' {
                in_tag = false;
                text.push('\n');
            }
            continue;
        }

        if in_entity {
            if character == ';' {
                text.push_str(&decode_html_entity(&entity));
                entity.clear();
                in_entity = false;
            } else if entity.len() < 16 {
                entity.push(character);
            } else {
                text.push('&');
                text.push_str(&entity);
                entity.clear();
                in_entity = false;
            }
            continue;
        }

        match character {
            '<' => in_tag = true,
            '&' => in_entity = true,
            _ => text.push(character),
        }
    }

    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn decode_html_entity(entity: &str) -> String {
    match entity {
        "amp" => "&".to_string(),
        "quot" => "\"".to_string(),
        "apos" | "#39" => "'".to_string(),
        "lt" => "<".to_string(),
        "gt" => ">".to_string(),
        "nbsp" => " ".to_string(),
        _ if entity.starts_with("#x") => u32::from_str_radix(&entity[2..], 16)
            .ok()
            .and_then(char::from_u32)
            .map(|character| character.to_string())
            .unwrap_or_default(),
        _ if entity.starts_with('#') => entity[1..]
            .parse::<u32>()
            .ok()
            .and_then(char::from_u32)
            .map(|character| character.to_string())
            .unwrap_or_default(),
        _ => String::new(),
    }
}

fn epic_unlock_percent(line: &str) -> Option<f64> {
    let trimmed = line.trim();
    let percent = trimmed.strip_suffix("% of players unlock")?.trim();
    percent.parse::<f64>().ok()
}

fn parse_local_achievement_cache(
    value: &serde_json::Value,
    provider: &str,
) -> Result<Vec<UnifiedAchievement>, String> {
    if let Some(achievements) = value.as_array() {
        return Ok(achievements
            .iter()
            .filter_map(|achievement| local_json_to_achievement(achievement, provider))
            .collect());
    }

    for key in ["achievements", "items"] {
        if let Some(achievements) = value.get(key).and_then(serde_json::Value::as_array) {
            return Ok(achievements
                .iter()
                .filter_map(|achievement| local_json_to_achievement(achievement, provider))
                .collect());
        }
        if let Some(achievement_map) = value.get(key).and_then(serde_json::Value::as_object) {
            return Ok(local_achievement_map_to_achievements(
                achievement_map,
                provider,
            ));
        }
    }

    let nested_achievements = nested_local_achievement_rows(value, provider);
    if !nested_achievements.is_empty() {
        return Ok(nested_achievements);
    }
    if has_nested_local_achievement_container(value) {
        return Ok(Vec::new());
    }

    if let Some(achievement_map) = value.as_object() {
        return Ok(local_achievement_map_to_achievements(
            achievement_map,
            provider,
        ));
    }

    Err(
        "Local achievement cache must be an array, an achievement object map, or contain achievements/items."
            .to_string(),
    )
}

fn local_achievement_map_to_achievements(
    achievement_map: &serde_json::Map<String, serde_json::Value>,
    provider: &str,
) -> Vec<UnifiedAchievement> {
    achievement_map
        .iter()
        .filter_map(|(key, value)| {
            let mut achievement = value.clone();
            if let Some(object) = achievement.as_object_mut() {
                object
                    .entry("id".to_string())
                    .or_insert_with(|| serde_json::Value::String(key.clone()));
                object
                    .entry("sourceAchievementId".to_string())
                    .or_insert_with(|| serde_json::Value::String(key.clone()));
            }
            local_json_to_achievement(&achievement, provider)
        })
        .collect()
}

fn has_nested_local_achievement_container(value: &serde_json::Value) -> bool {
    value.as_object().is_some_and(|object| {
        object.iter().any(|(key, child)| {
            let key = key.to_lowercase();
            let key_is_container = key.contains("achievement")
                || key.contains("unlock")
                || key.contains("trophy")
                || key.contains("progress")
                || key.contains("stat")
                || key.contains("challenge")
                || key.contains("criteria");
            key_is_container
                && (child.is_array()
                    || child.get("items").is_some()
                    || child.get("criteria").is_some()
                    || child.get("stats").is_some()
                    || child.get("statistics").is_some()
                    || child.get("challenges").is_some()
                    || child.get("actions").is_some())
        })
    })
}

fn nested_local_achievement_rows(
    value: &serde_json::Value,
    provider: &str,
) -> Vec<UnifiedAchievement> {
    let mut achievements = Vec::new();
    collect_nested_local_achievement_rows(value, provider, false, &mut achievements);
    achievements
}

fn collect_nested_local_achievement_rows(
    value: &serde_json::Value,
    provider: &str,
    in_achievement_context: bool,
    achievements: &mut Vec<UnifiedAchievement>,
) {
    match value {
        serde_json::Value::Array(items) => {
            let parsed = if in_achievement_context {
                items
                    .iter()
                    .filter_map(|item| local_json_to_achievement(item, provider))
                    .collect::<Vec<_>>()
            } else {
                Vec::new()
            };

            if !parsed.is_empty() {
                for achievement in parsed {
                    push_unique_achievement(achievements, achievement);
                }
            } else {
                for item in items {
                    collect_nested_local_achievement_rows(
                        item,
                        provider,
                        in_achievement_context,
                        achievements,
                    );
                }
            }
        }
        serde_json::Value::Object(object) => {
            for (key, child) in object {
                let key = key.to_lowercase();
                let child_is_achievement_context = in_achievement_context
                    || key.contains("achievement")
                    || key.contains("unlock")
                    || key.contains("trophy")
                    || key.contains("progress")
                    || key.contains("stat")
                    || key.contains("challenge")
                    || key.contains("criteria");
                collect_nested_local_achievement_rows(
                    child,
                    provider,
                    child_is_achievement_context,
                    achievements,
                );
            }
        }
        _ => {}
    }
}

fn push_unique_achievement(
    achievements: &mut Vec<UnifiedAchievement>,
    achievement: UnifiedAchievement,
) {
    let keys = achievement_identity_keys(&achievement);
    if achievements.iter().any(|existing| {
        let existing_keys = achievement_identity_keys(existing);
        keys.iter().any(|key| existing_keys.contains(key))
    }) {
        return;
    }

    achievements.push(achievement);
}

fn local_json_to_achievement(
    value: &serde_json::Value,
    provider: &str,
) -> Option<UnifiedAchievement> {
    if is_plain_non_achievement_stat(value) {
        return None;
    }

    let id = local_achievement_id(value, provider)?;
    let name = json_string_at(
        value,
        &[
            &["displayName"][..],
            &["display_name"][..],
            &["displayText"][..],
            &["display_text"][..],
            &["displayTitle"][..],
            &["display_title"][..],
            &["achievementTitle"][..],
            &["achievement_title"][..],
            &["title"][..],
            &["label"][..],
            &["statName"][..],
            &["stat_name"][..],
            &["challengeName"][..],
            &["challenge_name"][..],
            &["actionName"][..],
            &["action_name"][..],
            &["clubActionName"][..],
            &["club_action_name"][..],
            &["name"][..],
            &["localizedTitle"][..],
            &["localized_title"][..],
            &["localizedName"][..],
            &["localized_name"][..],
        ],
    )
    .unwrap_or_else(|| id.clone());
    let unlocked_at = json_datetime_at(
        value,
        &[
            &["unlockedAt"][..],
            &["unlocked_at"][..],
            &["unlockTime"][..],
            &["unlock_time"][..],
            &["unlockDate"][..],
            &["unlock_date"][..],
            &["unlockTimestamp"][..],
            &["unlock_timestamp"][..],
            &["earnedAt"][..],
            &["earned_at"][..],
            &["grantDate"][..],
            &["grant_date"][..],
            &["completedAt"][..],
            &["completed_at"][..],
            &["completionTime"][..],
            &["completion_time"][..],
            &["dateUnlocked"][..],
            &["date_unlocked"][..],
            &["timestamp"][..],
        ],
    )
    .or_else(|| {
        json_bool_at(
            value,
            &[
                &["unlocked"][..],
                &["isUnlocked"][..],
                &["is_unlocked"][..],
                &["achieved"][..],
                &["isAchieved"][..],
                &["is_achieved"][..],
                &["completed"][..],
                &["isComplete"][..],
                &["is_complete"][..],
                &["complete"][..],
                &["earned"][..],
                &["isEarned"][..],
                &["is_earned"][..],
                &["isCompleted"][..],
                &["is_completed"][..],
                &["claimed"][..],
                &["isClaimed"][..],
                &["is_claimed"][..],
            ],
        )
        .filter(|unlocked| *unlocked)
        .map(|_| unix_timestamp_to_iso(current_unix_timestamp()))
    })
    .or_else(|| {
        json_unlock_status_at(
            value,
            &[
                &["status"][..],
                &["state"][..],
                &["unlockState"][..],
                &["unlock_state"][..],
                &["completionState"][..],
                &["completion_state"][..],
                &["grantState"][..],
                &["grant_state"][..],
            ],
        )
        .filter(|unlocked| *unlocked)
        .map(|_| unix_timestamp_to_iso(current_unix_timestamp()))
    });

    Some(UnifiedAchievement {
        id: id.clone(),
        name,
        description: json_string_at(
            value,
            &[
                &["description"][..],
                &["desc"][..],
                &["summary"][..],
                &["details"][..],
                &["displayDescription"][..],
                &["display_description"][..],
                &["localizedDescription"][..],
                &["localized_description"][..],
            ],
        ),
        icon_url: json_string_at(
            value,
            &[
                &["iconUrl"][..],
                &["icon_url"][..],
                &["icon"][..],
                &["imageUrl"][..],
                &["image_url"][..],
                &["unlockedIconUrl"][..],
                &["unlocked_icon_url"][..],
                &["badgeUrl"][..],
                &["badge_url"][..],
                &["tileUrl"][..],
                &["tile_url"][..],
                &["thumbnailUrl"][..],
                &["thumbnail_url"][..],
                &["imageUrlUnlocked"][..],
                &["image_url_unlocked"][..],
                &["imageUrlLocked"][..],
                &["image_url_locked"][..],
            ],
        ),
        unlocked_at,
        rarity: json_number_at(
            value,
            &[
                &["rarity"][..],
                &["percent"][..],
                &["unlockPercentage"][..],
                &["unlock_percentage"][..],
                &["percentComplete"][..],
                &["percent_complete"][..],
                &["completionPercent"][..],
                &["completion_percent"][..],
                &["progressPercent"][..],
                &["progress_percent"][..],
            ],
        ),
        source: json_string_at(value, &[&["source"][..]]).or(Some(provider.to_string())),
        source_achievement_id: local_source_achievement_id(value, provider).or(Some(id)),
        provider_confidence: json_string_at(
            value,
            &[&["providerConfidence"][..], &["provider_confidence"][..]],
        )
        .or_else(|| Some("unofficial".to_string())),
    })
}

fn is_plain_non_achievement_stat(value: &serde_json::Value) -> bool {
    let stat_id = json_string_at(
        value,
        &[
            &["statId"][..],
            &["stat_id"][..],
            &["statName"][..],
            &["stat_name"][..],
        ],
    )
    .map(|value| value.to_lowercase())
    .unwrap_or_default();
    let unit = json_string_at(value, &[&["unit"][..]])
        .map(|value| value.to_lowercase())
        .unwrap_or_default();

    let has_unlock_signal = json_datetime_at(
        value,
        &[
            &["unlockedAt"][..],
            &["unlocked_at"][..],
            &["unlockTime"][..],
            &["unlock_time"][..],
            &["earnedAt"][..],
            &["earned_at"][..],
            &["grantDate"][..],
            &["grant_date"][..],
            &["completedAt"][..],
            &["completed_at"][..],
        ],
    )
    .is_some()
        || json_bool_at(
            value,
            &[
                &["unlocked"][..],
                &["isUnlocked"][..],
                &["is_unlocked"][..],
                &["isEarned"][..],
                &["is_earned"][..],
                &["isCompleted"][..],
                &["is_completed"][..],
                &["complete"][..],
            ],
        )
        .unwrap_or(false)
        || json_unlock_status_at(
            value,
            &[
                &["status"][..],
                &["state"][..],
                &["grantState"][..],
                &["grant_state"][..],
            ],
        )
        .unwrap_or(false);

    if has_unlock_signal || stat_id.is_empty() {
        return false;
    }

    let looks_like_achievement = stat_id.contains("ach")
        || stat_id.contains("trophy")
        || stat_id.contains("challenge")
        || stat_id.contains("criteria")
        || stat_id.contains("medal");
    let looks_like_playtime = stat_id.contains("minute")
        || stat_id.contains("seconds")
        || stat_id.contains("hours")
        || stat_id.contains("timeplayed")
        || stat_id.contains("playtime")
        || matches!(
            unit.as_str(),
            "minute" | "minutes" | "second" | "seconds" | "hour" | "hours"
        );

    looks_like_playtime && !looks_like_achievement
}

fn local_achievement_id(value: &serde_json::Value, provider: &str) -> Option<String> {
    if provider == "gog" {
        return json_string_at(
            value,
            &[
                &["id"][..],
                &["key"][..],
                &["apiKey"][..],
                &["achievementKey"][..],
                &["achievement_key"][..],
                &["achievementId"][..],
                &["achievement_id"][..],
                &["achievementCode"][..],
                &["achievement_code"][..],
                &["achievementName"][..],
                &["achievement_name"][..],
                &["statId"][..],
                &["stat_id"][..],
                &["statName"][..],
                &["stat_name"][..],
                &["challengeId"][..],
                &["challenge_id"][..],
                &["challengeName"][..],
                &["challenge_name"][..],
                &["actionId"][..],
                &["action_id"][..],
                &["actionName"][..],
                &["action_name"][..],
                &["clubActionId"][..],
                &["club_action_id"][..],
                &["clubActionName"][..],
                &["club_action_name"][..],
                &["objectiveId"][..],
                &["objective_id"][..],
                &["criteriaId"][..],
                &["criteria_id"][..],
                &["trophyId"][..],
                &["trophy_id"][..],
                &["medalId"][..],
                &["medal_id"][..],
                &["uid"][..],
                &["code"][..],
                &["sourceAchievementId"][..],
                &["source_achievement_id"][..],
                &["name"][..],
            ],
        );
    }

    json_string_at(
        value,
        &[
            &["id"][..],
            &["key"][..],
            &["apiKey"][..],
            &["achievementId"][..],
            &["achievement_id"][..],
            &["achievementCode"][..],
            &["achievement_code"][..],
            &["achievementKey"][..],
            &["achievement_key"][..],
            &["achievementName"][..],
            &["achievement_name"][..],
            &["statId"][..],
            &["stat_id"][..],
            &["statName"][..],
            &["stat_name"][..],
            &["challengeId"][..],
            &["challenge_id"][..],
            &["challengeName"][..],
            &["challenge_name"][..],
            &["actionId"][..],
            &["action_id"][..],
            &["actionName"][..],
            &["action_name"][..],
            &["clubActionId"][..],
            &["club_action_id"][..],
            &["clubActionName"][..],
            &["club_action_name"][..],
            &["objectiveId"][..],
            &["objective_id"][..],
            &["criteriaId"][..],
            &["criteria_id"][..],
            &["trophyId"][..],
            &["trophy_id"][..],
            &["medalId"][..],
            &["medal_id"][..],
            &["uid"][..],
            &["code"][..],
            &["sourceAchievementId"][..],
            &["source_achievement_id"][..],
            &["name"][..],
        ],
    )
}

fn local_source_achievement_id(value: &serde_json::Value, provider: &str) -> Option<String> {
    if provider == "gog" {
        return json_string_at(
            value,
            &[
                &["sourceAchievementId"][..],
                &["source_achievement_id"][..],
                &["achievementKey"][..],
                &["achievement_key"][..],
                &["achievementId"][..],
                &["achievement_id"][..],
                &["achievementCode"][..],
                &["achievement_code"][..],
                &["achievementName"][..],
                &["achievement_name"][..],
                &["statId"][..],
                &["stat_id"][..],
                &["statName"][..],
                &["stat_name"][..],
                &["challengeId"][..],
                &["challenge_id"][..],
                &["challengeName"][..],
                &["challenge_name"][..],
                &["actionId"][..],
                &["action_id"][..],
                &["actionName"][..],
                &["action_name"][..],
                &["clubActionId"][..],
                &["club_action_id"][..],
                &["clubActionName"][..],
                &["club_action_name"][..],
                &["objectiveId"][..],
                &["objective_id"][..],
                &["criteriaId"][..],
                &["criteria_id"][..],
                &["trophyId"][..],
                &["trophy_id"][..],
                &["medalId"][..],
                &["medal_id"][..],
                &["uid"][..],
                &["code"][..],
            ],
        );
    }

    json_string_at(
        value,
        &[
            &["sourceAchievementId"][..],
            &["source_achievement_id"][..],
            &["achievementName"][..],
            &["achievement_name"][..],
            &["achievementId"][..],
            &["achievement_id"][..],
            &["achievementCode"][..],
            &["achievement_code"][..],
            &["achievementKey"][..],
            &["achievement_key"][..],
            &["statId"][..],
            &["stat_id"][..],
            &["statName"][..],
            &["stat_name"][..],
            &["challengeId"][..],
            &["challenge_id"][..],
            &["challengeName"][..],
            &["challenge_name"][..],
            &["actionId"][..],
            &["action_id"][..],
            &["actionName"][..],
            &["action_name"][..],
            &["clubActionId"][..],
            &["club_action_id"][..],
            &["clubActionName"][..],
            &["club_action_name"][..],
            &["objectiveId"][..],
            &["objective_id"][..],
            &["criteriaId"][..],
            &["criteria_id"][..],
            &["trophyId"][..],
            &["trophy_id"][..],
            &["medalId"][..],
            &["medal_id"][..],
            &["uid"][..],
            &["code"][..],
        ],
    )
}

fn json_unlock_status_at(value: &serde_json::Value, paths: &[&[&str]]) -> Option<bool> {
    json_string_at(value, paths).map(|status| {
        matches!(
            status.to_lowercase().as_str(),
            "unlocked"
                | "unlock"
                | "achieved"
                | "complete"
                | "completed"
                | "earned"
                | "done"
                | "finished"
                | "granted"
                | "claimed"
                | "true"
        )
    })
}

fn json_datetime_at(value: &serde_json::Value, paths: &[&[&str]]) -> Option<String> {
    paths.iter().find_map(|path| {
        let mut current = value;
        for key in *path {
            current = current.get(*key)?;
        }

        match current {
            serde_json::Value::Number(value) => {
                value.as_f64().and_then(unix_timestamp_number_to_iso)
            }
            serde_json::Value::String(value) => {
                let value = value.trim();
                if value.is_empty() {
                    return None;
                }
                if value
                    .chars()
                    .all(|character| character.is_ascii_digit() || character == '.')
                {
                    value
                        .parse::<f64>()
                        .ok()
                        .and_then(unix_timestamp_number_to_iso)
                } else {
                    DateTime::parse_from_rfc3339(value)
                        .ok()
                        .map(|_| value.to_string())
                }
            }
            _ => None,
        }
    })
}

fn unix_timestamp_number_to_iso(timestamp: f64) -> Option<String> {
    if !timestamp.is_finite() || timestamp <= 0.0 {
        None
    } else {
        // Provider caches use both Unix seconds and Unix milliseconds. Values
        // above year 2286 in seconds are treated as milliseconds; chrono then
        // rejects values outside its supported calendar range.
        let milliseconds = if timestamp >= 10_000_000_000.0 {
            timestamp
        } else {
            timestamp * 1_000.0
        };
        if milliseconds > i64::MAX as f64 {
            return None;
        }
        DateTime::<Utc>::from_timestamp_millis(milliseconds.round() as i64)
            .map(|value| value.to_rfc3339_opts(SecondsFormat::AutoSi, true))
    }
}

fn json_string_at(value: &serde_json::Value, paths: &[&[&str]]) -> Option<String> {
    paths.iter().find_map(|path| {
        let mut current = value;
        for key in *path {
            current = current.get(*key)?;
        }
        match current {
            serde_json::Value::String(value) => Some(value.trim().to_string()),
            serde_json::Value::Number(value) => Some(value.to_string()),
            _ => None,
        }
        .filter(|value| !value.is_empty())
    })
}

fn json_bool_at(value: &serde_json::Value, paths: &[&[&str]]) -> Option<bool> {
    paths.iter().find_map(|path| {
        let mut current = value;
        for key in *path {
            current = current.get(*key)?;
        }
        current.as_bool()
    })
}

fn json_number_at(value: &serde_json::Value, paths: &[&[&str]]) -> Option<f64> {
    paths.iter().find_map(|path| {
        let mut current = value;
        for key in *path {
            current = current.get(*key)?;
        }
        current
            .as_f64()
            .or_else(|| current.as_str()?.trim_end_matches('%').parse::<f64>().ok())
    })
}

pub(crate) fn preserve_known_unlocks(
    new_achievements: Vec<UnifiedAchievement>,
    previous: &[UnifiedAchievement],
) -> Vec<UnifiedAchievement> {
    let mut previous_unlocks: HashMap<String, String> = HashMap::new();
    for achievement in previous {
        let Some(unlocked_at) = achievement.unlocked_at.as_ref() else {
            continue;
        };
        for key in achievement_identity_keys(achievement) {
            previous_unlocks.insert(key, unlocked_at.clone());
        }
    }
    // A successful provider response is authoritative about the definition
    // set. Preserve known unlock timestamps only when the same achievement is
    // still present. Do not append missing previous definitions: that made
    // deleted or remapped provider achievements live forever in the cache.
    new_achievements
        .into_iter()
        .map(|mut ach| {
            if ach.unlocked_at.is_none() {
                for key in achievement_identity_keys(&ach) {
                    if let Some(prev_unlock) = previous_unlocks.get(&key) {
                        ach.unlocked_at = Some(prev_unlock.clone());
                        break;
                    }
                }
            }
            ach
        })
        .collect()
}

fn achievement_identity_keys(achievement: &UnifiedAchievement) -> Vec<String> {
    let mut keys = vec![achievement.id.clone()];
    if let Some(source) = achievement
        .source
        .as_ref()
        .filter(|value| !value.is_empty())
    {
        keys.push(format!("{source}:{}", achievement.id));
        if let Some(source_id) = achievement
            .source_achievement_id
            .as_ref()
            .filter(|value| !value.is_empty())
        {
            keys.push(format!("{source}:{source_id}"));
        }
    }
    if let Some(source_id) = achievement
        .source_achievement_id
        .as_ref()
        .filter(|value| !value.is_empty() && *value != &achievement.id)
    {
        keys.push(source_id.clone());
    }
    keys.sort();
    keys.dedup();
    keys
}

#[cfg(test)]
mod tests {
    use super::*;

    use super::super::installed_game;

    fn normalized_path_text(path: &Path) -> String {
        path.to_string_lossy().replace('\\', "/")
    }

    #[test]
    fn upserts_achievement_provider_status_by_source() {
        let mut game = installed_game(
            "game-1",
            "Game".to_string(),
            "steam".to_string(),
            None,
            None,
        );
        game.achievement_provider_statuses
            .push(AchievementProviderStatus {
                source: "steam".to_string(),
                status: "failed".to_string(),
                stability: "official".to_string(),
                message: "previous failure".to_string(),
            });
        game.achievement_provider_statuses
            .push(AchievementProviderStatus {
                source: "xbox".to_string(),
                status: "available".to_string(),
                stability: "official".to_string(),
                message: "xbox synced".to_string(),
            });

        upsert_achievement_provider_status(
            &mut game,
            AchievementProviderStatus {
                source: "steam".to_string(),
                status: "available".to_string(),
                stability: "official".to_string(),
                message: "steam synced".to_string(),
            },
        );

        assert_eq!(game.achievement_provider_statuses.len(), 2);
        assert!(game.achievement_provider_statuses.iter().any(|status| {
            status.source == "steam"
                && status.status == "available"
                && status.message == "steam synced"
        }));
        assert!(game.achievement_provider_statuses.iter().any(|status| {
            status.source == "xbox"
                && status.status == "available"
                && status.message == "xbox synced"
        }));
    }

    #[test]
    fn parses_local_achievement_cache_array() {
        let value = serde_json::json!([
            {
                "id": "ACH_WIN",
                "displayName": "Winner",
                "description": "Win once",
                "unlocked": true,
                "rarity": "12.5%"
            },
            {
                "key": "ACH_LOCKED",
                "title": "Locked",
                "desc": "Not yet"
            }
        ]);

        let achievements = parse_local_achievement_cache(&value, "epic").unwrap();

        assert_eq!(achievements.len(), 2);
        assert_eq!(achievements[0].id, "ACH_WIN");
        assert_eq!(achievements[0].name, "Winner");
        assert_eq!(achievements[0].description.as_deref(), Some("Win once"));
        assert!(achievements[0].unlocked_at.is_some());
        assert_eq!(achievements[0].rarity, Some(12.5));
        assert_eq!(achievements[0].source.as_deref(), Some("epic"));
        assert_eq!(
            achievements[0].provider_confidence.as_deref(),
            Some("unofficial")
        );
        assert_eq!(achievements[1].id, "ACH_LOCKED");
        assert!(achievements[1].unlocked_at.is_none());
    }

    #[test]
    fn parses_local_achievement_cache_object() {
        let value = serde_json::json!({
            "achievements": [
                {
                    "achievementId": "first_steps",
                    "name": "First Steps",
                    "unlockTimestamp": 1767225600
                }
            ]
        });

        let achievements = parse_local_achievement_cache(&value, "gog").unwrap();

        assert_eq!(achievements.len(), 1);
        assert_eq!(
            achievements[0].source_achievement_id.as_deref(),
            Some("first_steps")
        );
        assert_eq!(
            achievements[0].unlocked_at.as_deref(),
            Some("2026-01-01T00:00:00Z")
        );
    }

    #[test]
    fn parses_local_achievement_cache_snake_case_aliases() {
        let value = serde_json::json!({
            "items": [
                {
                    "id": "local-id",
                    "display_name": "Snake Case",
                    "localized_description": "Imported by a script",
                    "icon_url": "https://example.test/icon.png",
                    "unlocked_at": "2026-01-04T00:00:00Z",
                    "unlock_percentage": "7.5%",
                    "source": "gog",
                    "source_achievement_id": "snake_case",
                    "provider_confidence": "local"
                }
            ]
        });

        let achievements = parse_local_achievement_cache(&value, "gog").unwrap();

        assert_eq!(achievements.len(), 1);
        assert_eq!(achievements[0].name, "Snake Case");
        assert_eq!(
            achievements[0].description.as_deref(),
            Some("Imported by a script")
        );
        assert_eq!(
            achievements[0].icon_url.as_deref(),
            Some("https://example.test/icon.png")
        );
        assert_eq!(
            achievements[0].unlocked_at.as_deref(),
            Some("2026-01-04T00:00:00Z")
        );
        assert_eq!(achievements[0].rarity, Some(7.5));
        assert_eq!(
            achievements[0].source_achievement_id.as_deref(),
            Some("snake_case")
        );
        assert_eq!(
            achievements[0].provider_confidence.as_deref(),
            Some("local")
        );
    }

    #[test]
    fn parses_local_gog_galaxy_achievement_aliases() {
        let value = serde_json::json!({
            "items": [
                {
                    "achievement_id": "48497841707623054",
                    "achievement_key": "ACHIEVEMENT_NODEATH1",
                    "name": "Early Bird",
                    "description": "Complete level 1 without dying",
                    "image_url_unlocked": "https://images.gog.com/unlocked.jpg",
                    "image_url_locked": "https://images.gog.com/locked.jpg",
                    "date_unlocked": "2026-06-07T01:10:00+00:00",
                    "provider_confidence": "local"
                }
            ]
        });

        let achievements = parse_local_achievement_cache(&value, "gog").unwrap();

        assert_eq!(achievements.len(), 1);
        assert_eq!(achievements[0].id, "ACHIEVEMENT_NODEATH1");
        assert_eq!(
            achievements[0].source_achievement_id.as_deref(),
            Some("ACHIEVEMENT_NODEATH1")
        );
        assert_eq!(
            achievements[0].unlocked_at.as_deref(),
            Some("2026-06-07T01:10:00+00:00")
        );
        assert_eq!(
            achievements[0].icon_url.as_deref(),
            Some("https://images.gog.com/unlocked.jpg")
        );
    }

    #[test]
    fn parses_local_achievement_cache_map_format() {
        let value = serde_json::json!({
            "ACH_WIN": {
                "displayName": "Winner",
                "description": "Win once",
                "unlocked": true
            },
            "ACH_LOCKED": {
                "title": "Locked",
                "desc": "Not yet"
            }
        });

        let achievements = parse_local_achievement_cache(&value, "ubisoft").unwrap();

        assert_eq!(achievements.len(), 2);
        assert!(achievements.iter().any(|achievement| {
            achievement.id == "ACH_WIN"
                && achievement.source_achievement_id.as_deref() == Some("ACH_WIN")
                && achievement.unlocked_at.is_some()
        }));
        assert!(achievements.iter().any(|achievement| {
            achievement.id == "ACH_LOCKED"
                && achievement.name == "Locked"
                && achievement.unlocked_at.is_none()
        }));
    }

    #[test]
    fn parses_nested_local_achievement_cache_map_format() {
        let value = serde_json::json!({
            "achievements": {
                "story_start": {
                    "name": "Story Start",
                    "provider_confidence": "local"
                }
            }
        });

        let achievements = parse_local_achievement_cache(&value, "ea").unwrap();

        assert_eq!(achievements.len(), 1);
        assert_eq!(achievements[0].id, "story_start");
        assert_eq!(
            achievements[0].source_achievement_id.as_deref(),
            Some("story_start")
        );
        assert_eq!(
            achievements[0].provider_confidence.as_deref(),
            Some("local")
        );
    }

    #[test]
    fn parses_local_ea_stats_achievement_cache() {
        let value = serde_json::json!({
            "achievementStats": {
                "items": [
                    {
                        "statName": "EA_WIN_01",
                        "displayTitle": "Club Legend",
                        "summary": "Win a season match.",
                        "badgeUrl": "https://ea.example.test/badge.png",
                        "earnedAt": "2026-06-08T18:00:00Z",
                        "percentComplete": "100",
                        "provider_confidence": "local"
                    }
                ]
            }
        });

        let achievements = parse_local_achievement_cache(&value, "ea").unwrap();

        assert_eq!(achievements.len(), 1);
        assert_eq!(achievements[0].id, "EA_WIN_01");
        assert_eq!(achievements[0].name, "Club Legend");
        assert_eq!(
            achievements[0].description.as_deref(),
            Some("Win a season match.")
        );
        assert_eq!(
            achievements[0].icon_url.as_deref(),
            Some("https://ea.example.test/badge.png")
        );
        assert_eq!(
            achievements[0].unlocked_at.as_deref(),
            Some("2026-06-08T18:00:00Z")
        );
        assert_eq!(achievements[0].rarity, Some(100.0));
        assert_eq!(achievements[0].source.as_deref(), Some("ea"));
    }

    #[test]
    fn skips_plain_ea_playtime_stats_cache_rows() {
        let value = serde_json::json!({
            "stats": {
                "items": [
                    {
                        "statId": "minutesPlayed",
                        "displayText": "Minutes Played",
                        "value": 120,
                        "unit": "minutes"
                    }
                ]
            }
        });

        let achievements = parse_local_achievement_cache(&value, "ea").unwrap();

        assert!(achievements.is_empty());
    }

    #[test]
    fn parses_local_ubisoft_challenge_cache() {
        let value = serde_json::json!({
            "challenges": [
                {
                    "challengeId": "ubi_story_01",
                    "localizedTitle": "Welcome to DedSec",
                    "displayDescription": "Complete the opening operation.",
                    "thumbnailUrl": "https://ubisoft.example.test/challenge.png",
                    "completionState": "GRANTED",
                    "completedAt": "2026-06-08T19:00:00Z",
                    "providerConfidence": "local"
                }
            ]
        });

        let achievements = parse_local_achievement_cache(&value, "ubisoft").unwrap();

        assert_eq!(achievements.len(), 1);
        assert_eq!(achievements[0].id, "ubi_story_01");
        assert_eq!(achievements[0].name, "Welcome to DedSec");
        assert_eq!(
            achievements[0].description.as_deref(),
            Some("Complete the opening operation.")
        );
        assert_eq!(
            achievements[0].unlocked_at.as_deref(),
            Some("2026-06-08T19:00:00Z")
        );
        assert_eq!(achievements[0].source.as_deref(), Some("ubisoft"));
    }

    #[test]
    fn parses_local_battlenet_criteria_cache() {
        let value = serde_json::json!({
            "progress": {
                "criteria": [
                    {
                        "criteriaId": "bn_raid_clear",
                        "label": "Raid Night",
                        "details": "Clear a raid wing.",
                        "state": "DONE",
                        "updatedAt": "2026-06-08T20:00:00Z",
                        "progressPercent": "100",
                        "provider_confidence": "local"
                    }
                ]
            }
        });

        let achievements = parse_local_achievement_cache(&value, "battlenet").unwrap();

        assert_eq!(achievements.len(), 1);
        assert_eq!(achievements[0].id, "bn_raid_clear");
        assert_eq!(achievements[0].name, "Raid Night");
        assert_eq!(
            achievements[0].description.as_deref(),
            Some("Clear a raid wing.")
        );
        assert!(achievements[0].unlocked_at.is_some());
        assert_eq!(achievements[0].rarity, Some(100.0));
        assert_eq!(achievements[0].source.as_deref(), Some("battlenet"));
    }

    #[test]
    fn updated_at_does_not_unlock_a_locked_achievement() {
        let value = serde_json::json!({
            "achievements": [{
                "id": "still_locked",
                "name": "Still Locked",
                "unlocked": false,
                "updatedAt": "2026-06-08T20:00:00Z"
            }]
        });

        let achievements = parse_local_achievement_cache(&value, "battlenet").unwrap();

        assert_eq!(achievements.len(), 1);
        assert!(achievements[0].unlocked_at.is_none());
    }

    #[test]
    fn steam_owned_achievement_sync_uses_the_frontend_fallback_without_native_persistence() {
        let fallback = installed_game(
            "steam-owned-10",
            "Counter-Strike".to_string(),
            "steam".to_string(),
            None,
            None,
        );

        let (game, should_persist) =
            resolve_achievement_sync_game("steam-owned-10", Ok(Vec::new()), Some(fallback))
                .unwrap();

        assert_eq!(game.id, "steam-owned-10");
        assert!(!should_persist);
    }

    #[test]
    fn epic_owned_achievement_sync_uses_valid_fallback_when_native_cache_is_unavailable() {
        let fallback = installed_game(
            "epic-owned-catalog-app",
            "Epic Account Game".to_string(),
            "epic".to_string(),
            None,
            None,
        );

        let (game, should_persist) = resolve_achievement_sync_game(
            "epic-owned-catalog-app",
            Err("native cache unavailable".to_string()),
            Some(fallback),
        )
        .unwrap();

        assert_eq!(game.id, "epic-owned-catalog-app");
        assert!(!should_persist);
    }

    #[test]
    fn epic_owned_achievement_sync_rejects_a_cross_provider_fallback() {
        let fallback = installed_game(
            "epic-owned-catalog-app",
            "Cross-provider Account Game".to_string(),
            "gog".to_string(),
            None,
            None,
        );

        let error =
            resolve_achievement_sync_game("epic-owned-catalog-app", Ok(Vec::new()), Some(fallback))
                .unwrap_err();

        assert!(error.contains("does not match provider 'epic'"));
    }

    #[test]
    fn steam_achievement_sync_prefers_the_native_cache_when_present() {
        let cached = installed_game(
            "steam-10",
            "Cached Counter-Strike".to_string(),
            "steam".to_string(),
            None,
            None,
        );
        let fallback = installed_game(
            "steam-10",
            "Fallback Counter-Strike".to_string(),
            "steam".to_string(),
            None,
            None,
        );

        let (game, should_persist) =
            resolve_achievement_sync_game("steam-10", Ok(vec![cached]), Some(fallback)).unwrap();

        assert_eq!(game.title, "Cached Counter-Strike");
        assert!(should_persist);
    }

    #[test]
    fn parses_unix_achievement_timestamps_in_seconds_and_milliseconds() {
        let value = serde_json::json!({
            "achievements": [
                { "id": "seconds", "unlockTime": 1767225600 },
                { "id": "milliseconds", "unlockTime": 1767225600000_i64 }
            ]
        });

        let achievements = parse_local_achievement_cache(&value, "epic").unwrap();

        assert_eq!(achievements.len(), 2);
        assert_eq!(
            achievements[0].unlocked_at.as_deref(),
            Some("2026-01-01T00:00:00Z")
        );
        assert_eq!(achievements[1].unlocked_at, achievements[0].unlocked_at);
    }

    #[test]
    fn invalid_achievement_dates_do_not_unlock() {
        let value = serde_json::json!({
            "achievements": [
                { "id": "invalid-text", "unlockTime": "not-a-date" },
                { "id": "invalid-number", "unlockTime": 999999999999999999_u64 }
            ]
        });

        let achievements = parse_local_achievement_cache(&value, "epic").unwrap();

        assert_eq!(achievements.len(), 2);
        assert!(achievements
            .iter()
            .all(|achievement| achievement.unlocked_at.is_none()));
    }

    #[test]
    fn parses_nested_epic_local_achievement_status_items() {
        let value = serde_json::json!({
            "metadata": {
                "achievementStatus": {
                    "items": [
                        {
                            "achievementName": "A_HOUSE_DIVIDED",
                            "displayName": "A House Divided",
                            "isUnlocked": true,
                            "unlockTime": 1767225600
                        }
                    ]
                }
            }
        });

        let achievements = parse_local_achievement_cache(&value, "epic").unwrap();

        assert_eq!(achievements.len(), 1);
        assert_eq!(achievements[0].id, "A_HOUSE_DIVIDED");
        assert_eq!(
            achievements[0].source_achievement_id.as_deref(),
            Some("A_HOUSE_DIVIDED")
        );
        assert_eq!(
            achievements[0].unlocked_at.as_deref(),
            Some("2026-01-01T00:00:00Z")
        );
    }

    #[test]
    fn local_achievement_candidates_include_install_sidecars() {
        let mut game = installed_game(
            "epic-game-1",
            "Epic Game".to_string(),
            "epic".to_string(),
            Some(r"C:\Games\Epic Game".to_string()),
            None,
        );
        game.external_id = Some("epic-app".to_string());

        let candidates = local_achievement_cache_candidates("epic", &game);

        assert!(candidates
            .iter()
            .any(|path| normalized_path_text(path)
                .ends_with("C:/Games/Epic Game/og-achievements.json")));
        assert!(candidates.iter().any(|path| normalized_path_text(path)
            .ends_with("C:/Games/Epic Game/epic-achievements.json")));
        assert!(candidates.iter().any(|path| normalized_path_text(path)
            .ends_with("C:/Games/Epic Game/.og-launcher/achievements.json")));
        assert!(candidates.iter().any(|path| path
            .ends_with("achievement-cache\\epic\\epic-app.json")
            || path.ends_with("achievement-cache/epic/epic-app.json")));
    }

    #[test]
    fn local_achievement_candidates_include_client_cache_roots() {
        let mut game = installed_game(
            "ea-owned-offer-123",
            "EA Test Game".to_string(),
            "EA App".to_string(),
            None,
            None,
        );
        game.launcher = "ea".to_string();
        game.external_id = Some("offer-123".to_string());

        let candidates = local_achievement_cache_candidates("ea", &game);

        assert!(candidates.iter().any(|path| {
            let text = path.to_string_lossy();
            text.contains("client-cache\\ea\\offer-123.json")
                || text.contains("client-cache/ea/offer-123.json")
        }));
    }

    #[test]
    fn local_achievement_client_cache_roots_cover_unofficial_providers() {
        for provider in ["ubisoft", "battlenet", "gog", "epic"] {
            let provider_roots = local_achievement_client_cache_roots(provider);
            assert!(provider_roots.iter().any(|path| {
                let text = normalized_path_text(path);
                text.contains(&format!("client-cache/{provider}"))
            }));
        }

        let mut roots = Vec::new();
        push_provider_achievement_client_cache_roots(
            &mut roots,
            "ea",
            Some(PathBuf::from("C:/Users/Test/AppData/Local")),
            Some(PathBuf::from("C:/ProgramData")),
            Some(PathBuf::from("C:/Users/Test/AppData/Roaming")),
        );
        assert!(roots
            .iter()
            .any(|path| path.to_string_lossy().contains("EA Desktop")));

        roots.clear();
        push_provider_achievement_client_cache_roots(
            &mut roots,
            "ubisoft",
            Some(PathBuf::from("C:/Users/Test/AppData/Local")),
            Some(PathBuf::from("C:/ProgramData")),
            None,
        );
        assert!(roots
            .iter()
            .any(|path| path.to_string_lossy().contains("Ubisoft Game Launcher")));

        roots.clear();
        push_provider_achievement_client_cache_roots(
            &mut roots,
            "battlenet",
            Some(PathBuf::from("C:/Users/Test/AppData/Local")),
            Some(PathBuf::from("C:/ProgramData")),
            Some(PathBuf::from("C:/Users/Test/AppData/Roaming")),
        );
        assert!(roots
            .iter()
            .any(|path| path.to_string_lossy().contains("Battle.net")));

        roots.clear();
        push_provider_achievement_client_cache_roots(
            &mut roots,
            "gog",
            Some(PathBuf::from("C:/Users/Test/AppData/Local")),
            Some(PathBuf::from("C:/ProgramData")),
            None,
        );
        assert!(roots
            .iter()
            .any(|path| path.to_string_lossy().contains("Galaxy")));

        roots.clear();
        push_provider_achievement_client_cache_roots(
            &mut roots,
            "epic",
            Some(PathBuf::from("C:/Users/Test/AppData/Local")),
            Some(PathBuf::from("C:/ProgramData")),
            None,
        );
        assert!(roots
            .iter()
            .any(|path| path.to_string_lossy().contains("EpicGamesLauncher")));
    }

    #[test]
    fn discovers_bounded_client_cache_json_candidates() {
        let root = std::env::temp_dir().join(format!(
            "ogl-achievement-cache-test-{}",
            current_unix_timestamp()
        ));
        let game_dir = root.join("offer-123").join("nested");
        fs::create_dir_all(&game_dir).unwrap();
        fs::write(game_dir.join("achievements.json"), "{}").unwrap();
        fs::write(game_dir.join("notes.txt"), "{}").unwrap();
        fs::write(root.join("unrelated.json"), "{}").unwrap();

        let mut candidates = Vec::new();
        discover_local_achievement_cache_files(
            &root,
            &["offer-123".to_string(), "EA Test Game".to_string()],
            &mut candidates,
        );

        assert!(candidates
            .iter()
            .any(|path| path.ends_with("achievements.json")));
        assert!(!candidates.iter().any(|path| path.ends_with("notes.txt")));
        assert!(!candidates
            .iter()
            .any(|path| path.ends_with("unrelated.json")));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn discovers_stats_subdirectory_client_cache_candidates() {
        let root = std::env::temp_dir().join(format!(
            "ogl-achievement-stats-cache-test-{}",
            current_unix_timestamp()
        ));
        let stats_dir = root.join("stats");
        fs::create_dir_all(&stats_dir).unwrap();
        fs::write(stats_dir.join("wow.json"), "{}").unwrap();

        let mut candidates = Vec::new();
        discover_local_achievement_cache_files(&root, &["wow".to_string()], &mut candidates);

        assert!(candidates
            .iter()
            .any(|path| { normalized_path_text(path).ends_with("stats/wow.json") }));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn discovered_client_cache_candidates_skip_large_files() {
        let root = std::env::temp_dir().join(format!(
            "ogl-achievement-cache-large-test-{}",
            current_unix_timestamp()
        ));
        fs::create_dir_all(&root).unwrap();
        fs::write(
            root.join("offer-123-achievements.json"),
            vec![b' '; (ACHIEVEMENT_CLIENT_CACHE_MAX_FILE_BYTES + 1) as usize],
        )
        .unwrap();

        let mut candidates = Vec::new();
        discover_local_achievement_cache_files(&root, &["offer-123".to_string()], &mut candidates);

        assert!(candidates.is_empty());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn local_achievement_candidate_summary_handles_empty_candidates() {
        assert_eq!(
            local_achievement_candidate_summary(&[]),
            "no candidate paths could be built"
        );
    }

    #[test]
    fn local_achievement_candidate_summary_limits_long_lists() {
        let candidates = (0..10)
            .map(|index| PathBuf::from(format!("candidate-{index}.json")))
            .collect::<Vec<_>>();

        let summary = local_achievement_candidate_summary(&candidates);

        assert!(summary.contains("candidate-0.json"));
        assert!(summary.contains("candidate-7.json"));
        assert!(!summary.contains("candidate-8.json"));
        assert!(summary.ends_with("+2 more"));
    }

    #[test]
    fn epic_slug_candidates_use_slug_external_id_and_title() {
        let mut game = installed_game(
            "epic-owned-legendary-app",
            "Mass Effect Legendary Edition".to_string(),
            "epic".to_string(),
            None,
            None,
        );
        game.slug = "mass-effect-legendary-edition".to_string();
        game.external_id = Some("legendary-app".to_string());

        let candidates = epic_achievement_slug_candidates(&game);

        assert_eq!(
            candidates,
            vec![
                "mass-effect-legendary-edition".to_string(),
                "legendary-app".to_string()
            ]
        );
    }

    #[test]
    fn parses_epic_public_achievement_html() {
        let html = r#"
            <html><body>
              <h1>Achievements</h1>
              <img alt="Achievement icon" />
              <div>A House Divided</div>
              <div>ME2: Hack a geth collective</div>
              <div>10 XP</div>
              <div>28% of players unlock</div>
              <div>A Personal Touch</div>
              <div>ME3: Modify a weapon.</div>
              <div>10 XP</div>
              <div>31% of players unlock</div>
            </body></html>
        "#;

        let achievements = parse_epic_public_achievement_html(html);

        assert_eq!(achievements.len(), 2);
        assert_eq!(achievements[0].id, "a-house-divided");
        assert_eq!(achievements[0].name, "A House Divided");
        assert_eq!(
            achievements[0].description.as_deref(),
            Some("ME2: Hack a geth collective")
        );
        assert_eq!(achievements[0].rarity, Some(28.0));
        assert_eq!(achievements[0].source.as_deref(), Some("epic"));
        assert!(achievements[0].unlocked_at.is_none());
    }

    #[test]
    fn epic_public_cache_payload_roundtrips_through_local_parser() {
        let achievements = parse_epic_public_achievement_html(
            r#"
            <div>A House Divided</div>
            <div>ME2: Hack a geth collective</div>
            <div>10 XP</div>
            <div>28% of players unlock</div>
        "#,
        );
        let payload = serde_json::json!({
            "source": "epic-public",
            "gameId": "epic-game",
            "achievements": achievements,
        });

        let parsed = parse_local_achievement_cache(&payload, "epic").unwrap();

        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].id, "a-house-divided");
        assert_eq!(parsed[0].rarity, Some(28.0));
        assert_eq!(parsed[0].provider_confidence.as_deref(), Some("unofficial"));
    }

    #[test]
    fn epic_definition_overlay_preserves_local_unlocks() {
        let definitions = vec![UnifiedAchievement {
            id: "epic-a-house-divided".to_string(),
            name: "A House Divided".to_string(),
            description: Some("Hack a geth collective".to_string()),
            icon_url: None,
            unlocked_at: None,
            rarity: Some(28.0),
            source: Some("epic".to_string()),
            source_achievement_id: Some("A_HOUSE_DIVIDED".to_string()),
            provider_confidence: Some("unofficial".to_string()),
        }];
        let local_unlocks = vec![UnifiedAchievement {
            id: "A_HOUSE_DIVIDED".to_string(),
            name: "A House Divided".to_string(),
            description: None,
            icon_url: None,
            unlocked_at: Some("2026-01-01T00:00:00Z".to_string()),
            rarity: None,
            source: Some("epic".to_string()),
            source_achievement_id: Some("A_HOUSE_DIVIDED".to_string()),
            provider_confidence: Some("local".to_string()),
        }];

        let merged = preserve_known_unlocks(definitions, &local_unlocks);

        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].id, "epic-a-house-divided");
        assert_eq!(
            merged[0].unlocked_at.as_deref(),
            Some("2026-01-01T00:00:00Z")
        );
        assert_eq!(merged[0].rarity, Some(28.0));
    }

    #[test]
    fn gog_definition_overlay_preserves_local_unlocks() {
        let definitions = vec![UnifiedAchievement {
            id: "gog-ACHIEVEMENT_NODEATH1".to_string(),
            name: "Early Bird".to_string(),
            description: Some("Complete level 1 without dying".to_string()),
            icon_url: Some("https://images.gog.com/locked.jpg".to_string()),
            unlocked_at: None,
            rarity: None,
            source: Some("gog".to_string()),
            source_achievement_id: Some("ACHIEVEMENT_NODEATH1".to_string()),
            provider_confidence: Some("official".to_string()),
        }];
        let local_unlocks = vec![UnifiedAchievement {
            id: "ACHIEVEMENT_NODEATH1".to_string(),
            name: "Early Bird".to_string(),
            description: None,
            icon_url: Some("https://images.gog.com/unlocked.jpg".to_string()),
            unlocked_at: Some("2026-06-07T01:10:00+00:00".to_string()),
            rarity: None,
            source: Some("gog".to_string()),
            source_achievement_id: Some("ACHIEVEMENT_NODEATH1".to_string()),
            provider_confidence: Some("local".to_string()),
        }];

        let merged = preserve_known_unlocks(definitions, &local_unlocks);

        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].id, "gog-ACHIEVEMENT_NODEATH1");
        assert_eq!(merged[0].name, "Early Bird");
        assert_eq!(
            merged[0].unlocked_at.as_deref(),
            Some("2026-06-07T01:10:00+00:00")
        );
        assert_eq!(merged[0].provider_confidence.as_deref(), Some("official"));
    }

    #[test]
    fn preserve_known_unlocks_matches_source_achievement_id() {
        let previous = vec![UnifiedAchievement {
            id: "old-public-id".to_string(),
            name: "Collector".to_string(),
            description: None,
            icon_url: None,
            unlocked_at: Some("2026-01-02T00:00:00Z".to_string()),
            rarity: None,
            source: Some("epic".to_string()),
            source_achievement_id: Some("collector".to_string()),
            provider_confidence: Some("unofficial".to_string()),
        }];
        let new = vec![UnifiedAchievement {
            id: "new-local-id".to_string(),
            name: "Collector".to_string(),
            description: None,
            icon_url: None,
            unlocked_at: None,
            rarity: Some(12.0),
            source: Some("epic".to_string()),
            source_achievement_id: Some("collector".to_string()),
            provider_confidence: Some("unofficial".to_string()),
        }];

        let merged = preserve_known_unlocks(new, &previous);

        assert_eq!(merged.len(), 1);
        assert_eq!(
            merged[0].unlocked_at.as_deref(),
            Some("2026-01-02T00:00:00Z")
        );
        assert_eq!(merged[0].id, "new-local-id");
    }

    #[test]
    fn preserve_known_unlocks_drops_definitions_missing_from_authoritative_snapshot() {
        let previous = vec![UnifiedAchievement {
            id: "same-id".to_string(),
            name: "Story".to_string(),
            description: None,
            icon_url: None,
            unlocked_at: Some("2026-01-03T00:00:00Z".to_string()),
            rarity: None,
            source: Some("gog".to_string()),
            source_achievement_id: Some("story".to_string()),
            provider_confidence: Some("unofficial".to_string()),
        }];
        let new = vec![UnifiedAchievement {
            id: "other-id".to_string(),
            name: "Story".to_string(),
            description: None,
            icon_url: None,
            unlocked_at: None,
            rarity: None,
            source: Some("gog".to_string()),
            source_achievement_id: Some("other-story".to_string()),
            provider_confidence: Some("unofficial".to_string()),
        }];

        let merged = preserve_known_unlocks(new, &previous);

        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].id, "other-id");
        assert_eq!(merged[0].unlocked_at, None);
    }
}
