//! Library state: installed-game cache CRUD, manual game registration,
//! move/uninstall, inventory refresh merging, and asset repair. The OG
//! manifest, achievement sync, launch, and watcher concerns live in their
//! own sibling modules; everything is re-exported through `games/mod.rs`.

use serde::Deserialize;
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    env, fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::AppHandle;

use super::detect::{
    find_local_banner_asset, find_local_icon_asset, find_local_logo_asset,
    scan_installed_games, sync_game_metadata,
};
use super::launch::{find_launch_executable, resolve_manual_game_executable};
use super::og_manifest::{is_og_managed_install_path, remove_managed_install_path};
use super::types::*;

#[tauri::command]
pub async fn list_installed_games() -> Result<Vec<InstalledGame>, String> {
    list_installed_games_from_cache(read_installed_games_cache_result)
}

fn list_installed_games_from_cache<F>(read_cache: F) -> Result<Vec<InstalledGame>, String>
where
    F: FnOnce() -> Result<Vec<InstalledGame>, String>,
{
    read_cache()
}

#[tauri::command]
pub async fn refresh_installed_games() -> Result<Vec<InstalledGame>, String> {
    let cached_games = read_installed_games_cache_result()?;
    let baseline_games = cached_games
        .iter()
        .map(|game| (game.id.clone(), game.clone()))
        .collect::<HashMap<_, _>>();

    let mut refreshed_manual_games = BTreeMap::<String, InstalledGame>::new();
    for mut game in cached_games.into_iter().filter(is_refresh_preserved_game) {
        if game.genres.is_empty() {
            game = sync_game_metadata(game).await;
        }
        refreshed_manual_games.insert(game.id.clone(), game);
    }

    let scanned = tokio::task::spawn_blocking(scan_installed_games)
        .await
        .map_err(|error| format!("Failed to scan installed games: {error}"))?;
    let mut scanned_games = BTreeMap::<String, InstalledGame>::new();
    for mut game in scanned {
        if let Some(cached_game) = baseline_games.get(&game.id) {
            merge_cached_game_activity(&mut game, cached_game);
        }

        if game.genres.is_empty() {
            game = sync_game_metadata(game).await;
        }

        scanned_games.insert(game.id.clone(), game);
    }

    mutate_installed_games_cache(move |latest_games| {
        let merged = merge_refreshed_inventory(
            std::mem::take(latest_games),
            &baseline_games,
            refreshed_manual_games,
            scanned_games,
        );
        *latest_games = merged;
        Ok(latest_games.clone())
    })
}

#[tauri::command]
pub async fn add_manual_game(input: AddManualGameRequest) -> Result<InstalledGame, String> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err("Title must not be empty.".to_string());
    }

    let install_path = input.install_path.trim();
    if install_path.is_empty() {
        return Err("Install path must not be empty.".to_string());
    }

    let path = PathBuf::from(install_path);
    if !path.exists() {
        return Err(format!("Path was not found: {install_path}"));
    }
    let executable = resolve_manual_game_executable(&path, title)?;

    let asset_root = if path.is_dir() {
        path.as_path()
    } else {
        path.parent().unwrap_or(path.as_path())
    };
    let mut game = installed_game(
        &format!("manual-{title}-{install_path}"),
        title.to_string(),
        "Manual".to_string(),
        Some(path.to_string_lossy().to_string()),
        find_local_banner_asset(asset_root),
    );
    game.icon_url = find_local_icon_asset(asset_root);
    game.logo_url = find_local_logo_asset(asset_root);
    game.executable_path = Some(path_to_string(executable.clone()));
    game.process_names = executable
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| vec![name.to_string()])
        .unwrap_or_default();

    game = sync_game_metadata(game).await;

    upsert_installed_game_cache(&game)?;

    Ok(game)
}

#[tauri::command]
pub fn update_game_metadata(input: UpdateGameMetadataRequest) -> Result<InstalledGame, String> {
    let game_id = normalize_game_id(input.game_id)?;
    update_installed_game_cache(&game_id, move |game| {
        if let Some(cover_url) = sanitize_optional_text(input.cover_url) {
            game.cover_url = Some(cover_url);
        }
        if let Some(logo_url) = sanitize_optional_text(input.logo_url) {
            game.logo_url = Some(logo_url.clone());
            if !game.logo_urls.contains(&logo_url) {
                game.logo_urls.insert(0, logo_url);
            }
        }
        if let Some(icon_url) = sanitize_optional_text(input.icon_url) {
            game.icon_url = Some(icon_url.clone());
            if !game.icon_urls.contains(&icon_url) {
                game.icon_urls.insert(0, icon_url);
            }
        }
        if let Some(rating) = input.rating {
            game.rating = Some(rating.clamp(0.0, 5.0));
        }
        if let Some(achievements) = input.achievements {
            game.achievements = achievements
                .into_iter()
                .filter(|achievement| !achievement.name.trim().is_empty())
                .collect();
        }
        if let Some(save_files) = input.save_files {
            game.save_files = save_files
                .into_iter()
                .filter(|save_file| !save_file.path.trim().is_empty())
                .collect();
        }
        if let Some(friends_playing) = input.friends_playing {
            game.friends_playing = friends_playing
                .into_iter()
                .map(|friend| friend.trim().to_string())
                .filter(|friend| !friend.is_empty())
                .collect();
        }
        Ok(())
    })
}

#[tauri::command]
pub fn import_library_snapshot(games: Vec<InstalledGame>) -> Result<Vec<InstalledGame>, String> {
    let mut imported_games = Vec::new();
    let mut seen_ids = HashSet::new();

    for mut game in games {
        game.id = game.id.trim().to_string();
        game.title = game.title.trim().to_string();

        if game.id.is_empty() || game.title.is_empty() || !seen_ids.insert(game.id.clone()) {
            continue;
        }

        if game.slug.trim().is_empty() {
            game.slug = slugify(&game.title);
        }
        if game.launcher.trim().is_empty() {
            game.launcher = "unknown".to_string();
        }
        if game.description.trim().is_empty() {
            game.description = format!("Imported Library entry for {}.", game.title);
        }
        if game.version.trim().is_empty() {
            game.version = "unknown".to_string();
        }

        imported_games.push(game);
    }

    replace_installed_games_cache(&imported_games)?;
    Ok(imported_games)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveGameRequest {
    pub game_id: String,
    pub new_path: String,
}

#[tauri::command]
pub async fn move_game(input: MoveGameRequest) -> Result<(), String> {
    let game_id = normalize_game_id(input.game_id)?;
    let game = read_installed_games_cache_result()?
        .into_iter()
        .find(|game| game.id == game_id)
        .ok_or_else(|| "Game was not found in the cache.".to_string())?;
    ensure_game_can_be_moved(&game)?;

    let old_path = game
        .install_path
        .as_ref()
        .ok_or_else(|| "Game has no install path.".to_string())?;

    let old_path_buf = PathBuf::from(old_path)
        .canonicalize()
        .map_err(|error| format!("Could not resolve the existing game path: {error}"))?;
    let new_path_buf = PathBuf::from(&input.new_path)
        .canonicalize()
        .map_err(|error| format!("Could not resolve the target directory: {error}"))?;

    if !old_path_buf.exists() {
        return Err("Old install path does not exist.".to_string());
    }

    if !new_path_buf.is_absolute() || !new_path_buf.is_dir() {
        return Err("Target path must be an existing absolute directory.".to_string());
    }

    let folder_name = old_path_buf
        .file_name()
        .ok_or_else(|| "Invalid path.".to_string())?;
    let final_new_path = new_path_buf.join(folder_name);

    if final_new_path.exists() {
        return Err("Target folder already exists.".to_string());
    }

    if !paths_share_volume(&old_path_buf, &final_new_path) {
        return Err(
            "Moving games across drives is not supported safely yet. No files were changed."
                .to_string(),
        );
    }

    let relocated_executable = game
        .executable_path
        .as_deref()
        .map(|path| relocated_game_path(Path::new(path), &old_path_buf, &final_new_path))
        .transpose()?;

    fs::rename(&old_path_buf, &final_new_path)
        .map_err(|e| format!("Failed to move game; no cache entry was changed: {e}"))?;

    let moved_path = final_new_path.clone();
    let final_new_path = final_new_path.to_string_lossy().to_string();
    let rollback_path = old_path_buf.clone();
    if let Err(error) = update_installed_game_cache(&game_id, move |game| {
        game.install_path = Some(final_new_path);
        game.executable_path = relocated_executable;
        Ok(())
    }) {
        return match fs::rename(&moved_path, &rollback_path) {
            Ok(()) => Err(format!(
                "The library cache update failed after moving the game, so the file move was rolled back: {error}"
            )),
            Err(rollback_error) => Err(format!(
                "The library cache update failed after moving the game, and the file rollback also failed: {error}. Rollback error: {rollback_error}"
            )),
        };
    }

    Ok(())
}

fn ensure_game_can_be_moved(game: &InstalledGame) -> Result<(), String> {
    let is_manual = is_manual_game(game) || launcher_key_from_source(&game.launcher) == "manual";
    let is_managed = game
        .install_path
        .as_deref()
        .is_some_and(|path| is_og_managed_install_path(Path::new(path)));
    if is_manual || is_managed {
        return Ok(());
    }

    Err(format!(
        "{} is managed by {}. Move it with the provider client so its installation metadata stays valid.",
        game.title,
        launcher_display_name(&game.launcher)
    ))
}

fn relocated_game_path(path: &Path, old_root: &Path, new_root: &Path) -> Result<String, String> {
    let path = path.canonicalize().map_err(|error| {
        format!("Could not resolve the configured game executable before moving: {error}")
    })?;
    let old_root = old_root
        .canonicalize()
        .map_err(|error| format!("Could not resolve the existing game path: {error}"))?;
    let relative = path.strip_prefix(&old_root).map_err(|_| {
        "The configured executable is outside the game path. No files were moved.".to_string()
    })?;
    Ok(path_to_string(new_root.join(relative)))
}

#[cfg(windows)]
fn paths_share_volume(source: &Path, target: &Path) -> bool {
    fn volume(path: &Path) -> Option<String> {
        path.components().find_map(|component| match component {
            Component::Prefix(prefix) => Some(prefix.as_os_str().to_string_lossy().to_lowercase()),
            _ => None,
        })
    }

    match (volume(source), volume(target)) {
        (Some(source), Some(target)) => source == target,
        _ => true,
    }
}

#[cfg(not(windows))]
fn paths_share_volume(_source: &Path, _target: &Path) -> bool {
    true
}

pub fn uninstall_local_game(game_id: String) -> Result<UninstallGameResponse, String> {
    let game_id = normalize_game_id(game_id)?;
    println!("[open-game-launcher] uninstall_local_game requested for {game_id}");

    let mut game = read_installed_games_cache()
        .unwrap_or_default()
        .into_iter()
        .find(|game| game.id == game_id)
        .ok_or_else(|| format!("Game '{game_id}' was not found in the local library cache."))?;

    if is_manual_game(&game) {
        remove_installed_game_cache(&game_id)?;
        return Ok(UninstallGameResponse {
            game_id,
            success: true,
            removed_from_library: true,
            game: None,
            message: format!("{} was removed from the Library.", game.title),
        });
    }

    if let Some(install_path) = game.install_path.as_deref() {
        let install_path = PathBuf::from(install_path);
        if is_og_managed_install_path(&install_path) {
            remove_managed_install_path(&install_path)?;
            game = update_installed_game_cache(&game_id, |game| {
                mark_game_not_installed(game);
                Ok(())
            })?;
            return Ok(UninstallGameResponse {
                game_id,
                success: true,
                removed_from_library: false,
                game: Some(game.clone()),
                message: format!(
                    "{} was uninstalled from the OG managed library.",
                    game.title
                ),
            });
        }
    }

    Err(format!(
        "{} is not an OG-managed or manually added game; use the confirmed provider action instead.",
        game.title
    ))
}

pub fn uninstall_xbox_game(game_id: String) -> Result<UninstallGameResponse, String> {
    let game_id = normalize_game_id(game_id)?;
    println!("[open-game-launcher] uninstall_xbox_game requested for {game_id}");

    let game = read_installed_games_cache_result()?
        .into_iter()
        .find(|game| game.id == game_id)
        .ok_or_else(|| format!("Game '{game_id}' was not found in the local library cache."))?;
    if launcher_key_from_source(&game.launcher) != "xbox" {
        return Err("The selected game is not an Xbox package.".to_string());
    }
    let package_family_name = xbox_package_family_name_for_game(&game)
        .ok_or_else(|| "Xbox uninstall requires an exact package family name.".to_string())?;

    remove_exact_xbox_package(package_family_name)?;
    let game = update_installed_game_cache(&game_id, |game| {
        mark_game_not_installed(game);
        Ok(())
    })?;

    Ok(UninstallGameResponse {
        game_id,
        success: true,
        removed_from_library: false,
        game: Some(game.clone()),
        message: format!(
            "{} was uninstalled and the package removal was verified.",
            game.title
        ),
    })
}

fn validated_xbox_package_family_name(value: &str) -> Option<&str> {
    let value = value.trim();
    let (name, publisher_id) = value.rsplit_once('_')?;
    (!name.is_empty()
        && !publisher_id.is_empty()
        && value.len() <= 256
        && name
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '.' | '-'))
        && publisher_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric()))
    .then_some(value)
}

pub fn xbox_package_family_name_for_game(game: &InstalledGame) -> Option<&str> {
    game.launch_uri
        .as_deref()
        .and_then(|uri| uri.strip_prefix("shell:AppsFolder\\"))
        .and_then(|aumid| aumid.split('!').next())
        .and_then(validated_xbox_package_family_name)
        .or_else(|| {
            game.id
                .strip_prefix("xbox-")
                .and_then(|id| id.split('!').next())
                .and_then(validated_xbox_package_family_name)
        })
        .or_else(|| {
            game.external_id
                .as_deref()
                .and_then(validated_xbox_package_family_name)
        })
}

#[cfg(target_os = "windows")]
fn remove_exact_xbox_package(package_family_name: &str) -> Result<(), String> {
    use std::io::Write;
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;

    const SCRIPT: &str = r#"$ErrorActionPreference = 'Stop'
$pfn = $env:OG_LAUNCHER_XBOX_PFN
$packages = @(Get-AppxPackage | Where-Object { $_.PackageFamilyName -ceq $pfn })
if ($packages.Count -ne 1) { throw "Expected exactly one installed Xbox package for the selected game." }
$package = $packages[0]
if ($package.NonRemovable) { throw "The selected Xbox package is marked as non-removable." }
Remove-AppxPackage -Package $package.PackageFullName -ErrorAction Stop
$remaining = @(Get-AppxPackage | Where-Object { $_.PackageFamilyName -ceq $pfn })
if ($remaining.Count -ne 0) { throw "Xbox package is still installed after Remove-AppxPackage returned." }
"#;

    let mut command = Command::new("powershell");
    command
        .args(["-NoProfile", "-NonInteractive", "-Command", "-"])
        .env("OG_LAUNCHER_XBOX_PFN", package_family_name)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW);
    let mut child = command
        .spawn()
        .map_err(|error| format!("Could not start the Xbox package uninstaller: {error}"))?;
    child
        .stdin
        .take()
        .ok_or_else(|| "Could not open the Xbox uninstaller input stream.".to_string())?
        .write_all(SCRIPT.as_bytes())
        .map_err(|error| format!("Could not send the Xbox uninstall command: {error}"))?;
    let output = child
        .wait_with_output()
        .map_err(|error| format!("Could not wait for the Xbox uninstaller: {error}"))?;
    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let detail = stderr.trim().chars().take(500).collect::<String>();
    Err(if detail.is_empty() {
        format!(
            "Xbox package uninstall failed with status {}.",
            output.status
        )
    } else {
        format!("Xbox package uninstall failed: {detail}")
    })
}

#[cfg(not(target_os = "windows"))]
fn remove_exact_xbox_package(_package_family_name: &str) -> Result<(), String> {
    Err("Native Xbox package uninstall is available only on Windows.".to_string())
}

// Utility Helpers

pub fn is_manual_game(game: &InstalledGame) -> bool {
    game.id.starts_with("manual-")
}

pub fn mark_game_not_installed(game: &mut InstalledGame) {
    game.status = GameStatus::NotInstalled;
    game.install_path = None;
    game.executable_path = None;
    game.process_names = Vec::new();
    game.launch_uri = None;
}

pub fn update_uri_for_game(game: &InstalledGame) -> Option<String> {
    match game.launcher.as_str() {
        "steam" => game
            .external_id
            .as_deref()
            .map(|external_id| format!("steam://rungameid/{external_id}")),
        "epic" => game.launch_uri.clone(),
        "gog" => game
            .external_id
            .as_deref()
            .map(|external_id| format!("goggalaxy://open-game-view/{external_id}")),
        _ => None,
    }
}

pub fn save_sync_root_for_game(game_id: &str) -> Option<PathBuf> {
    open_game_launcher_data_dir().map(|data_dir| data_dir.join("save-sync").join(slugify(game_id)))
}

pub fn sync_destination_for_save(sync_root: &Path, save_file: &SaveFile, source: &Path) -> PathBuf {
    let label = save_file
        .label
        .as_deref()
        .filter(|label| !label.trim().is_empty())
        .or_else(|| source.file_name().and_then(|name| name.to_str()))
        .unwrap_or("save");
    let mut destination_name = slugify(label);
    if destination_name.is_empty() {
        destination_name = "save".to_string();
    }

    if source.is_file() {
        if let Some(extension) = source.extension().and_then(|extension| extension.to_str()) {
            destination_name.push('.');
            destination_name.push_str(extension);
        }
    }

    sync_root.join(destination_name)
}

pub fn launcher_display_name(launcher: &str) -> &'static str {
    match launcher {
        "steam" => "Steam",
        "epic" => "Epic Games Launcher",
        "ubisoft" => "Ubisoft Connect",
        "ea" => "EA App",
        "battlenet" => "Battle.net",
        "gog" => "GOG Galaxy",
        "xbox" => "Xbox app",
        "manual" => "OG Launcher",
        _ => "the source launcher",
    }
}

pub fn merge_cached_game_activity(game: &mut InstalledGame, cached_game: &InstalledGame) {
    // Older scanner versions used the install-directory mtime as "last played".
    // Only carry cached timestamps that are backed by recorded playtime; provider
    // timestamps discovered during the current scan remain on `game` untouched.
    if cached_game.playtime_minutes.is_some() {
        match (&game.last_played_at, &cached_game.last_played_at) {
            (Some(current), Some(cached)) if cached > current => {
                game.last_played_at = Some(cached.clone());
            }
            (None, Some(cached)) => {
                game.last_played_at = Some(cached.clone());
            }
            _ => {}
        }
    }

    if let Some(cached_minutes) = cached_game.playtime_minutes {
        game.playtime_minutes = Some(
            game.playtime_minutes
                .map_or(cached_minutes, |minutes| minutes.max(cached_minutes)),
        );
    }

    if !cached_game.genres.is_empty() {
        game.genres = cached_game.genres.clone();
        game.developer = cached_game.developer.clone();
        game.publisher = cached_game.publisher.clone();
        game.release_date = cached_game.release_date.clone();
        game.features = cached_game.features.clone();
        game.rating = cached_game.rating;
        if !cached_game.description.contains("//") {
            game.description = cached_game.description.clone();
        }
    }

    if game.external_id.is_none() {
        game.external_id = cached_game.external_id.clone();
    }
    if game.executable_path.is_none() {
        game.executable_path = cached_game.executable_path.clone();
    }
    if game.process_names.is_empty() {
        game.process_names = cached_game.process_names.clone();
    }
    if game.achievements.is_empty() {
        game.achievements = cached_game.achievements.clone();
    }
    if game.achievement_provider_statuses.is_empty() {
        game.achievement_provider_statuses = cached_game.achievement_provider_statuses.clone();
    }
    if game.save_files.is_empty() {
        game.save_files = cached_game.save_files.clone();
    }
    if game.friends_playing.is_empty() {
        game.friends_playing = cached_game.friends_playing.clone();
    }
    if game.achievements_synced_at.is_none() {
        game.achievements_synced_at = cached_game.achievements_synced_at.clone();
    }
    if cached_game.cover_url.is_some() {
        game.cover_url = cached_game.cover_url.clone();
    }
    if cached_game.icon_url.is_some() {
        game.icon_url = cached_game.icon_url.clone();
    }
    if !cached_game.icon_urls.is_empty() {
        game.icon_urls = cached_game.icon_urls.clone();
    }
    if cached_game.logo_url.is_some() {
        game.logo_url = cached_game.logo_url.clone();
    }
    if !cached_game.logo_urls.is_empty() {
        game.logo_urls = cached_game.logo_urls.clone();
    }
    if cached_game.logo_url.is_some() || !cached_game.logo_urls.is_empty() {
        game.logo_position = cached_game.logo_position.clone();
        game.logo_width_percent = cached_game.logo_width_percent;
        game.logo_height_percent = cached_game.logo_height_percent;
    }
}

fn merge_refreshed_inventory(
    latest_games: Vec<InstalledGame>,
    baseline_games: &HashMap<String, InstalledGame>,
    mut refreshed_manual_games: BTreeMap<String, InstalledGame>,
    mut scanned_games: BTreeMap<String, InstalledGame>,
) -> Vec<InstalledGame> {
    for mut latest_game in latest_games {
        if is_refresh_preserved_game(&latest_game) {
            // Manual entries are not scanner-owned. Only retain entries that still
            // exist in the transaction's latest snapshot, so a concurrent remove is
            // not undone and a concurrent add is not dropped.
            if latest_game.genres.is_empty() {
                if let Some(refreshed) = refreshed_manual_games.remove(&latest_game.id) {
                    copy_game_metadata(&mut latest_game, &refreshed);
                }
            }
            scanned_games.insert(latest_game.id.clone(), latest_game);
            continue;
        }

        if let Some(scanned_game) = scanned_games.get_mut(&latest_game.id) {
            // Scanner data owns inventory fields, while activity and user-enriched
            // fields must be merged from the row as it exists at commit time.
            merge_cached_game_activity(scanned_game, &latest_game);
            // These fields can already contain a baseline copy from the refresh's
            // first merge. The transaction-latest values must therefore replace
            // them even when the scanner result is non-empty.
            scanned_game.achievements = latest_game.achievements.clone();
            scanned_game.achievement_provider_statuses =
                latest_game.achievement_provider_statuses.clone();
            scanned_game.save_files = latest_game.save_files.clone();
            scanned_game.friends_playing = latest_game.friends_playing.clone();
            if latest_game.achievements_synced_at.is_some() {
                scanned_game.achievements_synced_at = latest_game.achievements_synced_at.clone();
            }
            if let Some(baseline_game) = baseline_games.get(&latest_game.id) {
                preserve_concurrent_game_changes(scanned_game, &latest_game, baseline_game);
            } else {
                *scanned_game = latest_game;
            }
        } else if !baseline_games.contains_key(&latest_game.id) {
            // A row added after scanning began was never eligible to appear in the
            // scan result. Keep it; a later refresh can determine whether it is stale.
            scanned_games.insert(latest_game.id.clone(), latest_game);
        }
    }

    scanned_games.into_values().collect()
}

fn preserve_concurrent_game_changes(
    scanned: &mut InstalledGame,
    latest: &InstalledGame,
    baseline: &InstalledGame,
) {
    fn copy_if_changed<T: Clone + PartialEq>(target: &mut T, latest: &T, baseline: &T) {
        if latest != baseline {
            *target = latest.clone();
        }
    }

    copy_if_changed(&mut scanned.title, &latest.title, &baseline.title);
    copy_if_changed(&mut scanned.slug, &latest.slug, &baseline.slug);
    copy_if_changed(
        &mut scanned.description,
        &latest.description,
        &baseline.description,
    );
    copy_if_changed(&mut scanned.version, &latest.version, &baseline.version);
    copy_if_changed(&mut scanned.launcher, &latest.launcher, &baseline.launcher);
    copy_if_changed(
        &mut scanned.external_id,
        &latest.external_id,
        &baseline.external_id,
    );
    copy_if_changed(
        &mut scanned.cover_url,
        &latest.cover_url,
        &baseline.cover_url,
    );
    copy_if_changed(&mut scanned.icon_url, &latest.icon_url, &baseline.icon_url);
    copy_if_changed(
        &mut scanned.icon_urls,
        &latest.icon_urls,
        &baseline.icon_urls,
    );
    copy_if_changed(&mut scanned.logo_url, &latest.logo_url, &baseline.logo_url);
    copy_if_changed(
        &mut scanned.logo_urls,
        &latest.logo_urls,
        &baseline.logo_urls,
    );
    copy_if_changed(
        &mut scanned.logo_position,
        &latest.logo_position,
        &baseline.logo_position,
    );
    copy_if_changed(
        &mut scanned.logo_width_percent,
        &latest.logo_width_percent,
        &baseline.logo_width_percent,
    );
    copy_if_changed(
        &mut scanned.logo_height_percent,
        &latest.logo_height_percent,
        &baseline.logo_height_percent,
    );
    copy_if_changed(&mut scanned.status, &latest.status, &baseline.status);
    copy_if_changed(&mut scanned.platform, &latest.platform, &baseline.platform);
    copy_if_changed(
        &mut scanned.install_path,
        &latest.install_path,
        &baseline.install_path,
    );
    copy_if_changed(
        &mut scanned.executable_path,
        &latest.executable_path,
        &baseline.executable_path,
    );
    copy_if_changed(
        &mut scanned.process_names,
        &latest.process_names,
        &baseline.process_names,
    );
    copy_if_changed(
        &mut scanned.launch_uri,
        &latest.launch_uri,
        &baseline.launch_uri,
    );
    copy_if_changed(
        &mut scanned.last_played_at,
        &latest.last_played_at,
        &baseline.last_played_at,
    );
    copy_if_changed(
        &mut scanned.playtime_minutes,
        &latest.playtime_minutes,
        &baseline.playtime_minutes,
    );
    copy_if_changed(&mut scanned.genres, &latest.genres, &baseline.genres);
    copy_if_changed(
        &mut scanned.developer,
        &latest.developer,
        &baseline.developer,
    );
    copy_if_changed(
        &mut scanned.publisher,
        &latest.publisher,
        &baseline.publisher,
    );
    copy_if_changed(
        &mut scanned.release_date,
        &latest.release_date,
        &baseline.release_date,
    );
    copy_if_changed(&mut scanned.features, &latest.features, &baseline.features);
    copy_if_changed(&mut scanned.rating, &latest.rating, &baseline.rating);
    copy_if_changed(
        &mut scanned.achievements,
        &latest.achievements,
        &baseline.achievements,
    );
    copy_if_changed(
        &mut scanned.achievements_synced_at,
        &latest.achievements_synced_at,
        &baseline.achievements_synced_at,
    );
    copy_if_changed(
        &mut scanned.achievement_provider_statuses,
        &latest.achievement_provider_statuses,
        &baseline.achievement_provider_statuses,
    );
    copy_if_changed(
        &mut scanned.save_files,
        &latest.save_files,
        &baseline.save_files,
    );
    copy_if_changed(
        &mut scanned.friends_playing,
        &latest.friends_playing,
        &baseline.friends_playing,
    );
}

fn is_refresh_preserved_game(game: &InstalledGame) -> bool {
    is_manual_game(game) || launcher_key_from_source(&game.launcher) == "manual"
}

fn copy_game_metadata(game: &mut InstalledGame, metadata: &InstalledGame) {
    if metadata.genres.is_empty() {
        return;
    }

    game.genres = metadata.genres.clone();
    game.developer = metadata.developer.clone();
    game.publisher = metadata.publisher.clone();
    game.release_date = metadata.release_date.clone();
    game.features = metadata.features.clone();
    game.rating = metadata.rating;
    if !metadata.description.contains("//") {
        game.description = metadata.description.clone();
    }
}

pub fn read_installed_games_cache() -> Option<Vec<InstalledGame>> {
    read_installed_games_cache_result().ok()
}

pub fn read_installed_games_cache_result() -> Result<Vec<InstalledGame>, String> {
    crate::commands::local_db::read_collection::<InstalledGame>("games")
        .map(|games| games.into_iter().map(repair_cached_game_assets).collect())
}

fn repaired_installed_games(games: &[InstalledGame]) -> Vec<InstalledGame> {
    games
        .iter()
        .cloned()
        .map(repair_cached_game_assets)
        .collect()
}

pub fn replace_installed_games_cache(games: &[InstalledGame]) -> Result<(), String> {
    let repaired_games = repaired_installed_games(games);
    crate::commands::local_db::replace_collection("games", &repaired_games, |game| &game.id)
}

pub fn upsert_installed_game_cache(game: &InstalledGame) -> Result<(), String> {
    let mut incoming = repair_cached_game_assets(game.clone());
    mutate_installed_games_cache(move |games| {
        if let Some(existing) = games.iter_mut().find(|game| game.id == incoming.id) {
            merge_cached_game_activity(&mut incoming, existing);
            *existing = incoming;
        } else {
            games.push(incoming);
        }
        Ok(())
    })
}

pub fn remove_installed_game_cache(game_id: &str) -> Result<(), String> {
    crate::commands::local_db::remove_item("games", game_id)
}

pub fn mutate_installed_games_cache<R, F>(mutate: F) -> Result<R, String>
where
    F: FnOnce(&mut Vec<InstalledGame>) -> Result<R, String>,
{
    crate::commands::local_db::mutate_collection(
        "games",
        |game: &InstalledGame| &game.id,
        |games| {
            for game in games.iter_mut() {
                *game = repair_cached_game_assets(game.clone());
            }
            let result = mutate(games)?;
            for game in games.iter_mut() {
                *game = repair_cached_game_assets(game.clone());
            }
            Ok(result)
        },
    )
}

pub fn update_installed_game_cache<F>(game_id: &str, update: F) -> Result<InstalledGame, String>
where
    F: FnOnce(&mut InstalledGame) -> Result<(), String>,
{
    crate::commands::local_db::update_item("games", game_id, |game: &mut InstalledGame| {
        let mut repaired = repair_cached_game_assets(game.clone());
        update(&mut repaired)?;
        *game = repair_cached_game_assets(repaired);
        Ok(())
    })
    .map(repair_cached_game_assets)
}

/// Manually overwrite a game's cached `playtime_minutes` (FEATURE_PLAN §14
/// "Manuelle Korrektur"). Returns the resulting `GameActivityUpdate` so the
/// frontend can refresh and the Supabase sync listener can react.
#[tauri::command]
pub fn set_cached_game_playtime(
    app: AppHandle,
    game_id: String,
    playtime_minutes: u32,
) -> Result<GameActivityUpdate, String> {
    use tauri::Emitter;

    let played_at = unix_timestamp_to_iso(current_unix_timestamp());
    let game = update_installed_game_cache(&game_id, move |game| {
        game.playtime_minutes = Some(playtime_minutes);
        game.last_played_at = Some(played_at);
        Ok(())
    })?;

    let update = GameActivityUpdate {
        game_id: game_id.clone(),
        last_played: game.last_played_at.clone(),
        playtime_minutes: game.playtime_minutes,
    };
    let _ = app.emit("game_activity_updated", &update);
    Ok(update)
}

pub fn repair_cached_game_assets(mut game: InstalledGame) -> InstalledGame {
    if game.slug.is_empty() {
        game.slug = slugify(&game.title);
    }
    if game.launcher.is_empty() {
        game.launcher = launcher_key_from_source(&game.description).to_string();
    }
    let normalized_description = game.description.trim().to_lowercase();
    let has_legacy_placeholder_description = (normalized_description.starts_with("a ")
        && normalized_description.ends_with(" game managed by og launcher."))
        || (normalized_description.contains("game (owned)")
            && (normalized_description.contains("id:")
                || normalized_description.contains("appid:")
                || normalized_description.contains("offer:")))
        || matches!(
            normalized_description.as_str(),
            "xbox game (installed)" | "xbox game (not installed)"
        );
    if has_legacy_placeholder_description {
        game.description.clear();
        if game.version == "1.0.0" || game.version == "1.0" {
            game.version.clear();
        }
    }
    if launcher_key_from_source(&game.launcher) != "steam" && game.playtime_minutes.is_none() {
        game.last_played_at = None;
    }
    if game.executable_path.is_none() {
        if let Some(install_path) = game.install_path.as_deref() {
            game.executable_path =
                find_launch_executable(Path::new(install_path), &game.title).map(path_to_string);
        }
    }
    if game.process_names.is_empty() {
        game.process_names = game
            .executable_path
            .as_deref()
            .and_then(|path| {
                Path::new(path)
                    .file_name()
                    .and_then(|name| name.to_str())
                    .map(|name| vec![name.to_string()])
            })
            .unwrap_or_default();
    }

    if is_gog_game(&game) && gog_game_needs_asset_repair(&game) {
        game = apply_gog_assets(game);
    }

    if is_battlenet_game(&game) {
        return apply_battlenet_assets(game, None);
    }

    game
}

pub fn is_gog_game(game: &InstalledGame) -> bool {
    game.id.starts_with("gog-")
        || launcher_key_from_source(&game.launcher) == "gog"
        || game
            .launch_uri
            .as_deref()
            .is_some_and(|uri| uri.starts_with("goggalaxy://"))
}

fn gog_game_needs_asset_repair(game: &InstalledGame) -> bool {
    !game
        .cover_url
        .as_deref()
        .is_some_and(gog_artwork_url_is_usable)
        || !game
            .logo_url
            .as_deref()
            .is_some_and(gog_artwork_url_is_usable)
        || !game
            .icon_url
            .as_deref()
            .is_some_and(gog_artwork_url_is_usable)
}

fn gog_artwork_url_is_usable(url: &str) -> bool {
    !is_gog_galaxy_webcache_artwork(url)
        && (url.starts_with("http://")
            || url.starts_with("https://")
            || url.starts_with("data:")
            || url.starts_with("blob:")
            || url.starts_with("/artwork/")
            || Path::new(url).is_file())
}

fn is_gog_galaxy_webcache_artwork(url: &str) -> bool {
    url.replace('\\', "/")
        .to_ascii_lowercase()
        .contains("gog.com/galaxy/webcache/")
}

pub fn apply_gog_assets(mut game: InstalledGame) -> InstalledGame {
    let Some(game_id) = game
        .external_id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| game.id.strip_prefix("gog-owned-"))
    else {
        return game;
    };
    let install_dir = game.install_path.as_deref().map(Path::new);
    let assets = super::detect::get_gog_assets(game_id, install_dir);

    let cover_url = game
        .cover_url
        .take()
        .filter(|url| gog_artwork_url_is_usable(url))
        .or(assets.cover_url);
    let logo_url = game
        .logo_url
        .take()
        .filter(|url| gog_artwork_url_is_usable(url))
        .or(assets.logo_url);
    let icon_url = game
        .icon_url
        .take()
        .filter(|url| gog_artwork_url_is_usable(url))
        .or(assets.icon_url)
        .or_else(|| logo_url.clone())
        .or_else(|| cover_url.clone());

    game.cover_url = cover_url;
    game.logo_url = logo_url.clone();
    game.icon_url = icon_url.clone();
    if let Some(url) = logo_url {
        game.logo_urls.retain(|candidate| candidate != &url);
        game.logo_urls.insert(0, url);
    }
    if let Some(url) = icon_url {
        game.icon_urls.retain(|candidate| candidate != &url);
        game.icon_urls.insert(0, url);
    }
    game
}

pub fn is_battlenet_game(game: &InstalledGame) -> bool {
    game.id.starts_with("battlenet-")
        || game
            .launch_uri
            .as_deref()
            .is_some_and(|uri| uri.starts_with("battlenet://"))
        || game.description.starts_with("Battle.net")
}

pub fn apply_battlenet_assets(
    mut game: InstalledGame,
    _display_icon: Option<&str>,
) -> InstalledGame {
    let uid = game
        .launch_uri
        .as_deref()
        .and_then(|uri| uri.strip_prefix("battlenet://"))
        .or_else(|| game.id.strip_prefix("battlenet-"))
        .unwrap_or(&game.id);
    let (fallback_cover, fallback_logo, fallback_icon) =
        super::detect::get_battlenet_assets(uid, &game.title);
    let rawg_assets = super::detect::get_rawg_battlenet_assets(uid, &game.title);
    let existing_cover = game
        .cover_url
        .take()
        .filter(|url| !is_generated_battlenet_artwork(url));
    let existing_logo = game
        .logo_url
        .take()
        .filter(|url| !is_generated_battlenet_artwork(url));
    let existing_icon = game
        .icon_url
        .take()
        .filter(|url| !is_generated_battlenet_artwork(url));
    let rawg_cover = rawg_assets
        .as_ref()
        .and_then(|assets| assets.cover_url.clone());
    let rawg_logo = rawg_assets
        .as_ref()
        .and_then(|assets| assets.logo_url.clone());
    let rawg_icon = rawg_assets
        .as_ref()
        .and_then(|assets| assets.icon_url.clone());
    let cover = existing_cover
        .or_else(|| {
            fallback_cover
                .clone()
                .filter(|url| !is_generated_battlenet_artwork(url))
        })
        .or(rawg_cover)
        .or(fallback_cover);
    let logo = existing_logo
        .or_else(|| {
            fallback_logo
                .clone()
                .filter(|url| !is_generated_battlenet_artwork(url))
        })
        .or(rawg_logo)
        .or(fallback_logo);
    let icon = existing_icon
        .or_else(|| {
            fallback_icon
                .clone()
                .filter(|url| !is_generated_battlenet_artwork(url))
        })
        .or(rawg_icon)
        .or(fallback_icon);

    game.cover_url = cover;
    game.logo_url = logo.clone();
    game.logo_urls = logo.into_iter().collect();
    game.icon_url = icon.clone();
    game.icon_urls = icon.into_iter().collect();
    game.logo_position = LogoPosition::CenterCenter;
    game.logo_width_percent = Some(58.0);
    game.logo_height_percent = Some(48.0);
    game
}

fn is_generated_battlenet_artwork(url: &str) -> bool {
    url.starts_with("data:image/svg+xml,")
}

pub fn installed_game(
    id: &str,
    title: String,
    launcher: String,
    install_path: Option<String>,
    cover_url: Option<String>,
) -> InstalledGame {
    let slug = slugify(&title);
    let description = String::new();
    let platform = current_platform();

    InstalledGame {
        id: id.to_string(),
        title,
        slug,
        description,
        version: String::new(),
        launcher,
        external_id: None,
        cover_url,
        icon_url: None,
        icon_urls: Vec::new(),
        logo_url: None,
        logo_urls: Vec::new(),
        logo_position: LogoPosition::BottomLeft,
        logo_width_percent: None,
        logo_height_percent: None,
        status: GameStatus::Installed,
        platform,
        install_path,
        executable_path: None,
        process_names: Vec::new(),
        launch_uri: None,
        last_played_at: None,
        playtime_minutes: None,
        genres: Vec::new(),
        developer: None,
        publisher: None,
        release_date: None,
        features: Vec::new(),
        rating: None,
        achievements: Vec::new(),
        achievements_synced_at: None,
        achievement_provider_statuses: Vec::new(),
        save_files: Vec::new(),
        friends_playing: Vec::new(),
    }
}

pub fn launcher_key_from_source(source: &str) -> &'static str {
    let normalized = source.to_lowercase();
    if normalized.contains("steam") {
        "steam"
    } else if normalized.contains("epic") {
        "epic"
    } else if normalized.contains("ubisoft") || normalized.contains("uplay") {
        "ubisoft"
    } else if normalized.contains("origin")
        || normalized.starts_with("ea")
        || normalized.contains("ea app")
        || normalized.contains("ea desktop")
        || normalized == "ea"
    {
        "ea"
    } else if normalized.contains("battle.net") || normalized.contains("battlenet") {
        "battlenet"
    } else if normalized.contains("gog") {
        "gog"
    } else if normalized.contains("xbox") {
        "xbox"
    } else if normalized.contains("manual") {
        "manual"
    } else {
        "unknown"
    }
}

pub fn current_platform() -> Platform {
    if cfg!(target_os = "windows") {
        Platform::Windows
    } else if cfg!(target_os = "macos") {
        Platform::Macos
    } else {
        Platform::Linux
    }
}

pub fn env_path(key: &str) -> Option<PathBuf> {
    env::var_os(key).map(PathBuf::from)
}

pub fn path_to_string(path: PathBuf) -> String {
    path.to_string_lossy().to_string()
}

pub fn slugify(value: &str) -> String {
    let mut slug = String::new();
    let mut last_was_dash = false;

    for character in value.chars().flat_map(char::to_lowercase) {
        if character.is_ascii_alphanumeric() {
            slug.push(character);
            last_was_dash = false;
        } else if !last_was_dash {
            slug.push('-');
            last_was_dash = true;
        }
    }

    slug.trim_matches('-').to_string()
}

pub fn normalize_game_id(game_id: String) -> Result<String, String> {
    let normalized = game_id.trim().to_string();

    if normalized.is_empty() {
        return Err("game_id must not be empty.".to_string());
    }

    Ok(normalized)
}

pub fn sanitize_optional_text(value: Option<String>) -> Option<String> {
    value
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

pub fn unix_timestamp_to_iso(timestamp: u64) -> String {
    let secs = timestamp as i64;
    let days = secs / 86400;
    let remaining = secs % 86400;
    let hours = (remaining / 3600) as u32;
    let minutes = ((remaining % 3600) / 60) as u32;
    let seconds = (remaining % 60) as u32;

    let (year, month, day) = civil_from_days(days);

    format!("{year:04}-{month:02}-{day:02}T{hours:02}:{minutes:02}:{seconds:02}Z")
}

fn civil_from_days(days: i64) -> (i32, u32, u32) {
    let days = days + 719468;
    let era = if days >= 0 {
        days / 146097
    } else {
        (days - 146096) / 146097
    };
    let doe = days - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };

    (year as i32, m as u32, d as u32)
}

pub fn get_dir_last_modified(path: &Path) -> Option<u64> {
    let metadata = fs::metadata(path).ok()?;
    let modified = metadata.modified().ok()?;
    system_time_to_unix_timestamp(modified)
}

pub fn current_unix_timestamp() -> u64 {
    system_time_to_unix_timestamp(SystemTime::now()).unwrap_or_default()
}

pub fn system_time_to_unix_timestamp(time: SystemTime) -> Option<u64> {
    time.duration_since(UNIX_EPOCH).ok().map(|d| d.as_secs())
}

pub fn open_game_launcher_data_dir() -> Option<PathBuf> {
    dirs::data_local_dir()
        .or_else(dirs::data_dir)
        .map(|data_dir| data_dir.join("open-game-launcher"))
}

fn supabase_access_token_path() -> Option<PathBuf> {
    open_game_launcher_data_dir().map(|data_dir| data_dir.join("supabase-access-token"))
}

const SUPABASE_ACCESS_TOKEN_SECRET_DOMAIN: &str = "supabase-access-token";

pub fn read_supabase_access_token() -> Option<String> {
    if let Some(token) =
        crate::commands::secure_store::get_secret_keychain_only(SUPABASE_ACCESS_TOKEN_SECRET_DOMAIN)
            .ok()
            .flatten()
            .map(|token| token.trim().to_string())
            .filter(|token| !token.is_empty())
    {
        if let Some(path) = supabase_access_token_path().filter(|path| path.exists()) {
            let _ = fs::remove_file(path);
        }
        return Some(token);
    }

    let path = supabase_access_token_path()?;
    let token = fs::read_to_string(&path).ok()?.trim().to_string();
    if token.is_empty() {
        let _ = fs::remove_file(path);
        return None;
    }
    if crate::commands::secure_store::set_secret_keychain_only(
        SUPABASE_ACCESS_TOKEN_SECRET_DOMAIN,
        &token,
    )
    .is_err()
    {
        // Fail closed: retain the legacy source for a later migration attempt,
        // but never expose it to the running application.
        return None;
    }
    let _ = fs::remove_file(path);
    Some(token)
}

#[tauri::command]
pub fn cache_supabase_access_token(token: String) -> Result<(), String> {
    let legacy_path = supabase_access_token_path();
    let trimmed = token.trim();
    if trimmed.is_empty() {
        let keychain_result = crate::commands::secure_store::delete_secret_keychain_only(
            SUPABASE_ACCESS_TOKEN_SECRET_DOMAIN,
        );
        if let Some(path) = legacy_path.filter(|path| path.exists()) {
            fs::remove_file(path).map_err(|error| error.to_string())?;
        }
        return keychain_result;
    }

    crate::commands::secure_store::set_secret_keychain_only(
        SUPABASE_ACCESS_TOKEN_SECRET_DOMAIN,
        trimmed,
    )?;
    if let Some(path) = legacy_path.filter(|path| path.exists()) {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn rawg_asset_cache_path() -> Option<PathBuf> {
    open_game_launcher_data_dir().map(|data_dir| data_dir.join("rawg-assets.json"))
}

pub fn epic_catalog_asset_cache_path() -> Option<PathBuf> {
    open_game_launcher_data_dir().map(|data_dir| data_dir.join("epic-catalog-assets.json"))
}

pub fn is_ignored_game_directory(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
        return true;
    };

    let normalized = name.trim().to_lowercase();
    normalized.is_empty()
        || normalized.starts_with('.')
        || matches!(
            normalized.as_str(),
            "content"
                | "gamesave"
                | "modifiablewindowsapps"
                | "msixvc"
                | "pgs"
                | "program files"
                | "wgs"
                | "windowsapps"
        )
}

pub fn local_drive_roots() -> Vec<PathBuf> {
    #[cfg(windows)]
    {
        let mut drives = Vec::new();
        for letter in b'A'..=b'Z' {
            let drive_path = format!("{}:\\", letter as char);
            let path = PathBuf::from(&drive_path);
            if path.exists() {
                drives.push(path);
            }
        }
        drives
    }
    #[cfg(not(windows))]
    {
        vec![PathBuf::from("/")]
    }
}

pub fn ensure_path_inside_root(path: &Path, root: &Path) -> Result<(), String> {
    let normalized_root = root.canonicalize().map_err(|e| {
        format!("Refusing to write outside the OG save-sync folder: root is not resolvable ({e}).")
    })?;
    let candidate = if path.is_absolute() {
        path.to_path_buf()
    } else {
        normalized_root.join(path)
    };

    // Sync destinations usually do not exist yet. Reject lexical traversal,
    // then canonicalize the nearest existing ancestor so symlink escapes are
    // still caught before any destination directory is created.
    for component in path.components() {
        if matches!(component, std::path::Component::ParentDir) {
            return Err(
                "Refusing to write outside the OG save-sync folder: path contains '..'."
                    .to_string(),
            );
        }
    }

    let existing_ancestor = candidate
        .ancestors()
        .find(|ancestor| ancestor.exists())
        .ok_or_else(|| {
            "Refusing to write outside the OG save-sync folder: path has no resolvable ancestor."
                .to_string()
        })?;
    let normalized_ancestor = existing_ancestor.canonicalize().map_err(|e| {
        format!("Refusing to write outside the OG save-sync folder: path is not resolvable ({e}).")
    })?;

    if path_is_within_root(&normalized_ancestor, &normalized_root) {
        Ok(())
    } else {
        Err("Refusing to write outside the OG save-sync folder.".to_string())
    }
}

pub(crate) fn path_is_within_root(path: &Path, root: &Path) -> bool {
    #[cfg(windows)]
    {
        let path = path.to_string_lossy().to_lowercase();
        let root = root.to_string_lossy().to_lowercase();
        path == root
            || path
                .strip_prefix(&root)
                .is_some_and(|suffix| suffix.starts_with(['\\', '/']))
    }
    #[cfg(not(windows))]
    {
        path.starts_with(root)
    }
}

pub fn path_size_bytes(path: &Path) -> Option<u64> {
    if path.is_file() {
        return fs::metadata(path).ok().map(|metadata| metadata.len());
    }

    if path.is_dir() {
        let mut size = 0_u64;
        collect_path_size(path, &mut size);
        return Some(size);
    }

    None
}

fn collect_path_size(path: &Path, size: &mut u64) {
    let Ok(entries) = fs::read_dir(path) else {
        return;
    };

    for entry in entries.flatten() {
        let entry_path = entry.path();
        if entry_path.is_dir() {
            collect_path_size(&entry_path, size);
        } else if let Ok(metadata) = fs::metadata(entry_path) {
            *size = size.saturating_add(metadata.len());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_temp_dir(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "ogl-{name}-{}-{}",
            std::process::id(),
            current_unix_timestamp()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn launcher_key_normalizes_legacy_uplay_labels() {
        assert_eq!(launcher_key_from_source("Uplay"), "ubisoft");
        assert_eq!(launcher_key_from_source("Uplay game import"), "ubisoft");
    }

    #[test]
    fn xbox_package_family_name_requires_an_exact_safe_identity() {
        assert_eq!(
            validated_xbox_package_family_name("Microsoft.ForzaHorizon5_8wekyb3d8bbwe"),
            Some("Microsoft.ForzaHorizon5_8wekyb3d8bbwe")
        );
        for invalid in [
            "",
            "Microsoft.ForzaHorizon5",
            "Microsoft.ForzaHorizon5_",
            "Microsoft.Forza Horizon5_8wekyb3d8bbwe",
            "Microsoft.ForzaHorizon5_8wekyb3d8bbwe;Remove-Item",
        ] {
            assert_eq!(validated_xbox_package_family_name(invalid), None);
        }
    }

    #[test]
    fn refreshed_inventory_merges_latest_rows_and_removes_scanner_stale_games() {
        let mut baseline_scanned = installed_game(
            "steam-1",
            "Scanned Game".to_string(),
            "steam".to_string(),
            None,
            None,
        );
        baseline_scanned.friends_playing = vec!["Baseline Friend".to_string()];
        let mut latest_scanned = baseline_scanned.clone();
        latest_scanned.playtime_minutes = Some(99);
        latest_scanned.friends_playing = vec!["Concurrent Friend".to_string()];

        let baseline_manual = installed_game(
            "manual-existing",
            "Manual Game".to_string(),
            "manual".to_string(),
            None,
            None,
        );
        let mut latest_manual = baseline_manual.clone();
        latest_manual.friends_playing = vec!["Latest Friend".to_string()];

        let stale = installed_game(
            "epic-stale",
            "Removed Provider Game".to_string(),
            "epic".to_string(),
            None,
            None,
        );
        let concurrent_manual = installed_game(
            "manual-concurrent",
            "Concurrent Manual".to_string(),
            "manual".to_string(),
            None,
            None,
        );
        let concurrent_provider_game = installed_game(
            "gog-concurrent",
            "Concurrent Provider Game".to_string(),
            "gog".to_string(),
            None,
            None,
        );

        let mut refreshed_manual = baseline_manual.clone();
        refreshed_manual.genres = vec!["Action".to_string()];
        let removed_manual = installed_game(
            "manual-removed",
            "Removed Manual".to_string(),
            "manual".to_string(),
            None,
            None,
        );
        let scanned = baseline_scanned.clone();
        // The refresh's first-stage merge may carry baseline activity into the
        // scanner result. A commit-time mutation must still win over that copy.
        let baseline_games = HashMap::from([
            (baseline_scanned.id.clone(), baseline_scanned),
            (baseline_manual.id.clone(), baseline_manual),
            (removed_manual.id.clone(), removed_manual.clone()),
            (stale.id.clone(), stale.clone()),
        ]);

        let merged = merge_refreshed_inventory(
            vec![
                latest_scanned,
                latest_manual,
                stale,
                concurrent_manual,
                concurrent_provider_game,
            ],
            &baseline_games,
            BTreeMap::from([
                ("manual-existing".to_string(), refreshed_manual),
                ("manual-removed".to_string(), removed_manual),
            ]),
            BTreeMap::from([("steam-1".to_string(), scanned)]),
        );

        let scanned = merged.iter().find(|game| game.id == "steam-1").unwrap();
        assert_eq!(scanned.playtime_minutes, Some(99));
        assert_eq!(scanned.friends_playing, ["Concurrent Friend"]);
        let manual = merged
            .iter()
            .find(|game| game.id == "manual-existing")
            .unwrap();
        assert_eq!(manual.genres, ["Action"]);
        assert_eq!(manual.friends_playing, ["Latest Friend"]);
        assert!(merged.iter().any(|game| game.id == "manual-concurrent"));
        assert!(merged.iter().any(|game| game.id == "gog-concurrent"));
        assert!(!merged.iter().any(|game| game.id == "manual-removed"));
        assert!(!merged.iter().any(|game| game.id == "epic-stale"));
    }

    #[test]
    fn refreshed_inventory_preserves_concurrent_non_monotonic_and_cache_owned_updates() {
        let mut baseline = installed_game(
            "steam-corrected",
            "Corrected Game".to_string(),
            "steam".to_string(),
            None,
            Some("baseline-cover".to_string()),
        );
        baseline.playtime_minutes = Some(120);
        baseline.achievements_synced_at = Some("2026-07-12T10:00:00Z".to_string());

        // Simulate the first-stage scanner merge carrying the baseline values.
        let scanned = baseline.clone();
        let mut latest = baseline.clone();
        latest.playtime_minutes = Some(30);
        latest.achievements_synced_at = Some("2026-07-12T10:05:00Z".to_string());
        latest.cover_url = Some("concurrent-custom-cover".to_string());

        let merged = merge_refreshed_inventory(
            vec![latest],
            &HashMap::from([(baseline.id.clone(), baseline)]),
            BTreeMap::new(),
            BTreeMap::from([("steam-corrected".to_string(), scanned)]),
        );
        let merged = merged
            .iter()
            .find(|game| game.id == "steam-corrected")
            .unwrap();

        assert_eq!(merged.playtime_minutes, Some(30));
        assert_eq!(
            merged.achievements_synced_at.as_deref(),
            Some("2026-07-12T10:05:00Z")
        );
        assert_eq!(merged.cover_url.as_deref(), Some("concurrent-custom-cover"));
    }

    #[test]
    fn refreshed_inventory_keeps_new_scanner_values_when_cached_row_is_unchanged() {
        let mut baseline = installed_game(
            "steam-new-scan",
            "New Scan".to_string(),
            "steam".to_string(),
            None,
            None,
        );
        baseline.playtime_minutes = Some(120);
        let latest = baseline.clone();
        let mut scanned = baseline.clone();
        scanned.playtime_minutes = Some(150);

        let merged = merge_refreshed_inventory(
            vec![latest],
            &HashMap::from([(baseline.id.clone(), baseline)]),
            BTreeMap::new(),
            BTreeMap::from([("steam-new-scan".to_string(), scanned)]),
        );

        assert_eq!(merged[0].playtime_minutes, Some(150));
    }

    #[cfg(windows)]

    #[test]
    fn move_volume_check_rejects_cross_drive_target() {
        assert!(paths_share_volume(
            Path::new(r"C:\Games\Test"),
            Path::new(r"c:\Library\Test")
        ));
        assert!(!paths_share_volume(
            Path::new(r"C:\Games\Test"),
            Path::new(r"D:\Library\Test")
        ));
    }

    #[test]
    fn move_rejects_provider_managed_games_without_touching_the_provider_library() {
        let provider_game = installed_game(
            "steam-440",
            "Team Fortress 2".to_string(),
            "steam".to_string(),
            Some("/provider/steamapps/common/Team Fortress 2".to_string()),
            None,
        );

        let error = ensure_game_can_be_moved(&provider_game).unwrap_err();

        assert!(error.contains("managed by Steam"));
        assert!(error.contains("provider client"));
    }

    #[test]
    fn move_allows_manually_registered_games() {
        let manual_game = installed_game(
            "manual-local-game",
            "Local Game".to_string(),
            "manual".to_string(),
            Some("/games/local-game".to_string()),
            None,
        );

        assert!(ensure_game_can_be_moved(&manual_game).is_ok());
    }

    #[test]
    fn move_relocates_the_executable_path_relative_to_the_game_root() {
        let root = unique_temp_dir("move-relative-executable");
        let old_root = root.join("old");
        let new_root = root.join("new");
        let executable = old_root.join("bin").join("game.exe");
        fs::create_dir_all(executable.parent().unwrap()).unwrap();
        fs::write(&executable, b"game").unwrap();

        let relocated = relocated_game_path(&executable, &old_root, &new_root).unwrap();

        assert_eq!(
            relocated,
            path_to_string(new_root.join("bin").join("game.exe"))
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn cache_only_library_list_propagates_cache_read_errors() {
        let error = list_installed_games_from_cache(|| {
            Err("SQLite games collection could not be read".to_string())
        })
        .unwrap_err();

        assert_eq!(error, "SQLite games collection could not be read");
    }

    #[test]
    fn installed_game_does_not_seed_unverified_catalog_metadata() {
        let game = installed_game(
            "manual-game",
            "Unknown Game".to_string(),
            "manual".to_string(),
            None,
            None,
        );

        assert!(game.description.is_empty());
        assert!(game.version.is_empty());
        assert!(game.genres.is_empty());
        assert!(game.features.is_empty());
        assert!(game.developer.is_none());
        assert!(game.publisher.is_none());
        assert!(game.release_date.is_none());
        assert!(game.rating.is_none());
    }

    #[test]
    fn cached_game_repair_removes_legacy_placeholder_metadata_and_mtime_activity() {
        let mut game = installed_game(
            "epic-game",
            "Game".to_string(),
            "epic".to_string(),
            None,
            None,
        );
        game.description = "A epic game managed by OG Launcher.".to_string();
        game.version = "1.0.0".to_string();
        game.last_played_at = Some("2026-06-01T12:00:00Z".to_string());

        let repaired = repair_cached_game_assets(game);

        assert!(repaired.description.is_empty());
        assert!(repaired.version.is_empty());
        assert!(repaired.last_played_at.is_none());
    }

    #[test]
    fn cached_game_repair_preserves_activity_with_provenance() {
        let mut steam = installed_game(
            "steam-1",
            "Steam Game".to_string(),
            "steam".to_string(),
            None,
            None,
        );
        steam.last_played_at = Some("2026-06-01T12:00:00Z".to_string());
        assert!(repair_cached_game_assets(steam).last_played_at.is_some());

        let mut recorded = installed_game(
            "epic-game",
            "Epic Game".to_string(),
            "epic".to_string(),
            None,
            None,
        );
        recorded.playtime_minutes = Some(12);
        recorded.last_played_at = Some("2026-06-01T12:00:00Z".to_string());
        assert!(repair_cached_game_assets(recorded).last_played_at.is_some());
    }

    #[test]
    fn merge_cached_game_activity_drops_unproven_directory_timestamp() {
        let mut scanned_game =
            installed_game("game-1", "Game".to_string(), "epic".to_string(), None, None);
        let mut cached_game = scanned_game.clone();
        cached_game.last_played_at = Some("2026-06-01T12:00:00Z".to_string());

        merge_cached_game_activity(&mut scanned_game, &cached_game);

        assert!(scanned_game.last_played_at.is_none());

        cached_game.playtime_minutes = Some(0);
        merge_cached_game_activity(&mut scanned_game, &cached_game);
        assert_eq!(
            scanned_game.last_played_at.as_deref(),
            Some("2026-06-01T12:00:00Z")
        );

        scanned_game.last_played_at = None;
        cached_game.playtime_minutes = Some(12);
        merge_cached_game_activity(&mut scanned_game, &cached_game);
        assert_eq!(
            scanned_game.last_played_at.as_deref(),
            Some("2026-06-01T12:00:00Z")
        );
    }

    #[test]
    fn merge_cached_game_activity_preserves_achievement_provider_statuses() {
        let mut scanned_game = installed_game(
            "game-1",
            "Game".to_string(),
            "steam".to_string(),
            None,
            None,
        );
        let mut cached_game = installed_game(
            "game-1",
            "Game".to_string(),
            "steam".to_string(),
            None,
            None,
        );
        cached_game
            .achievement_provider_statuses
            .push(AchievementProviderStatus {
                source: "steam".to_string(),
                status: "available".to_string(),
                stability: "official".to_string(),
                message: "steam synced".to_string(),
            });

        merge_cached_game_activity(&mut scanned_game, &cached_game);

        assert_eq!(scanned_game.achievement_provider_statuses.len(), 1);
        assert_eq!(
            scanned_game.achievement_provider_statuses[0].message,
            "steam synced"
        );
    }

    #[test]
    fn merge_cached_game_activity_keeps_fresh_provider_statuses() {
        let mut scanned_game = installed_game(
            "game-1",
            "Game".to_string(),
            "steam".to_string(),
            None,
            None,
        );
        scanned_game
            .achievement_provider_statuses
            .push(AchievementProviderStatus {
                source: "steam".to_string(),
                status: "failed".to_string(),
                stability: "official".to_string(),
                message: "fresh failure".to_string(),
            });
        let mut cached_game = installed_game(
            "game-1",
            "Game".to_string(),
            "steam".to_string(),
            None,
            None,
        );
        cached_game
            .achievement_provider_statuses
            .push(AchievementProviderStatus {
                source: "steam".to_string(),
                status: "available".to_string(),
                stability: "official".to_string(),
                message: "cached success".to_string(),
            });

        merge_cached_game_activity(&mut scanned_game, &cached_game);

        assert_eq!(scanned_game.achievement_provider_statuses.len(), 1);
        assert_eq!(
            scanned_game.achievement_provider_statuses[0].message,
            "fresh failure"
        );
    }

    #[test]
    fn gog_artwork_repair_rejects_missing_local_files() {
        let missing = env::temp_dir().join(format!(
            "og-launcher-missing-gog-artwork-{}-cover.webp",
            current_unix_timestamp()
        ));

        assert!(!gog_artwork_url_is_usable(&path_to_string(missing)));
        assert!(gog_artwork_url_is_usable(
            "https://images-1.gog-statics.com/jotun-background.jpg"
        ));
        assert!(is_gog_galaxy_webcache_artwork(
            r"C:\ProgramData\GOG.com\Galaxy\webcache\123\gog\1458127099\cover.webp"
        ));
        assert!(!gog_artwork_url_is_usable(
            r"C:\ProgramData\GOG.com\Galaxy\webcache\123\gog\1458127099\cover.webp"
        ));
    }

    #[test]
    fn save_sync_path_guard_accepts_a_new_destination_below_the_root() {
        let root = unique_temp_dir("sync-path-new-destination");
        let destination = root.join("game-1").join("slot").join("save.dat");

        assert!(ensure_path_inside_root(&destination, &root).is_ok());
        assert!(ensure_path_inside_root(Path::new("game-1/slot/save.dat"), &root).is_ok());

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn save_sync_path_guard_rejects_siblings_and_parent_traversal() {
        let root = unique_temp_dir("sync-path-root");
        let sibling = root.with_file_name(format!(
            "{}-sibling",
            root.file_name().unwrap().to_string_lossy()
        ));
        fs::create_dir_all(&sibling).unwrap();

        assert!(ensure_path_inside_root(&sibling.join("save.dat"), &root).is_err());
        assert!(ensure_path_inside_root(Path::new("safe/../escape.dat"), &root).is_err());

        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(sibling).unwrap();
    }
}
