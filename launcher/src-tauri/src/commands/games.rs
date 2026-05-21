use serde::Serialize;
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    env, fs,
    path::{Path, PathBuf},
    process::Command,
};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstalledGame {
    id: String,
    title: String,
    description: String,
    version: String,
    cover_url: Option<String>,
    icon_url: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    icon_urls: Vec<String>,
    logo_url: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    logo_urls: Vec<String>,
    logo_position: LogoPosition,
    #[serde(skip_serializing_if = "Option::is_none")]
    logo_width_percent: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    logo_height_percent: Option<f64>,
    status: GameStatus,
    platform: Platform,
    install_path: Option<String>,
    #[serde(skip_serializing)]
    launch_uri: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    last_played_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    playtime_minutes: Option<u32>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum GameStatus {
    Installed,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum Platform {
    Windows,
    Linux,
    Macos,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub enum LogoPosition {
    BottomLeft,
    UpperCenter,
    CenterCenter,
    BottomCenter,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LogoLayout {
    position: LogoPosition,
    #[serde(skip_serializing_if = "Option::is_none")]
    width_percent: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    height_percent: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchGameResponse {
    game_id: String,
    success: bool,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyGameFilesResponse {
    game_id: String,
    checked_files: u32,
    missing_files: Vec<String>,
    status: VerificationStatus,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum VerificationStatus {
    Verified,
    RepairRequired,
}

#[tauri::command]
pub fn list_installed_games() -> Result<Vec<InstalledGame>, String> {
    let mut games = BTreeMap::<String, InstalledGame>::new();

    for game in scan_steam_games() {
        games.entry(game.id.clone()).or_insert(game);
    }

    for game in scan_epic_games() {
        games.entry(game.id.clone()).or_insert(game);
    }

    for game in scan_gog_games() {
        games.entry(game.id.clone()).or_insert(game);
    }

    for game in scan_ubisoft_games() {
        games.entry(game.id.clone()).or_insert(game);
    }

    for game in scan_xbox_games() {
        games.entry(game.id.clone()).or_insert(game);
    }

    Ok(games.into_values().collect())
}

#[tauri::command]
pub fn launch_game(game_id: String) -> Result<LaunchGameResponse, String> {
    let game_id = normalize_game_id(game_id)?;
    println!("[open-game-launcher] launch_game requested for {game_id}");
    let game = list_installed_games()?
        .into_iter()
        .find(|game| game.id == game_id)
        .ok_or_else(|| format!("Game '{game_id}' wurde nicht gefunden."))?;

    launch_installed_game(&game)?;

    Ok(LaunchGameResponse {
        game_id,
        success: true,
        message: format!("{} wird gestartet.", game.title),
    })
}

#[tauri::command]
pub fn verify_game_files(game_id: String) -> Result<VerifyGameFilesResponse, String> {
    let game_id = normalize_game_id(game_id)?;
    println!("[open-game-launcher] verify_game_files requested for {game_id}");

    let (missing_files, status) = if game_id.contains("broken") {
        (
            vec!["content/manifest.json".to_string()],
            VerificationStatus::RepairRequired,
        )
    } else {
        (Vec::new(), VerificationStatus::Verified)
    };

    Ok(VerifyGameFilesResponse {
        game_id,
        checked_files: 128,
        missing_files,
        status,
    })
}

fn scan_steam_games() -> Vec<InstalledGame> {
    let Some(steam_dir) = find_steam_dir() else {
        return Vec::new();
    };

    let mut libraries = vec![steam_dir.clone()];
    libraries.extend(read_steam_library_folders(&steam_dir));

    let last_played_times = read_steam_last_played_times(&steam_dir);

    let mut seen_libraries = HashSet::new();
    let mut games = Vec::new();

    for library in libraries {
        let Ok(canonical_key) = library.canonicalize() else {
            continue;
        };

        if !seen_libraries.insert(canonical_key) {
            continue;
        }

        let steamapps = library.join("steamapps");
        let Ok(entries) = fs::read_dir(&steamapps) else {
            continue;
        };

        for entry in entries.flatten() {
            let path = entry.path();
            let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };

            if !file_name.starts_with("appmanifest_") || !file_name.ends_with(".acf") {
                continue;
            }

            let Ok(contents) = fs::read_to_string(&path) else {
                continue;
            };

            let name = find_quoted_value(&contents, "name");
            let install_dir = find_quoted_value(&contents, "installdir");
            let app_id = find_quoted_value(&contents, "appid")
                .or_else(|| steam_app_id_from_manifest_name(file_name));

            if let Some(title) = name.filter(|value| !value.trim().is_empty()) {
                let install_path = install_dir
                    .map(|dir| steamapps.join("common").join(dir))
                    .filter(|dir| dir.exists())
                    .map(path_to_string);
                let cover_url = app_id.as_ref().map(|id| {
                    format!(
                        "https://cdn.cloudflare.steamstatic.com/steam/apps/{id}/library_hero.jpg"
                    )
                });
                let mut game = installed_game(
                    &format!("steam-{title}"),
                    title,
                    "Steam".to_string(),
                    install_path,
                    cover_url,
                );
                if let Some(id) = &app_id {
                    let icon_candidates = steam_icon_urls(&id, &game.title, &steam_dir);
                    game.icon_url = icon_candidates.first().cloned();
                    game.logo_urls = steam_logo_urls(&id);
                    game.logo_url = game.logo_urls.first().cloned();
                    game.launch_uri = Some(format!("steam://rungameid/{id}"));
                    let logo_layout = steam_logo_layout(&id, &game.title, &steam_dir);
                    game.logo_position = logo_layout.position;
                    game.logo_width_percent = logo_layout.width_percent;
                    game.logo_height_percent = logo_layout.height_percent;

                    if let Some(&timestamp) = last_played_times.get(id) {
                        game.last_played_at = Some(unix_timestamp_to_iso(timestamp));
                    }
                }

                games.push(game);
            }
        }

        let steamapps = library.join("steamapps");
        let Ok(entries) = fs::read_dir(&steamapps) else {
            continue;
        };

        for entry in entries.flatten() {
            let path = entry.path();
            let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };

            if !file_name.starts_with("appmanifest_") || !file_name.ends_with(".acf") {
                continue;
            }

            let Ok(contents) = fs::read_to_string(&path) else {
                continue;
            };

            let name = find_quoted_value(&contents, "name");
            let install_dir = find_quoted_value(&contents, "installdir");
            let app_id = find_quoted_value(&contents, "appid")
                .or_else(|| steam_app_id_from_manifest_name(file_name));

            if let Some(title) = name.filter(|value| !value.trim().is_empty()) {
                let install_path = install_dir
                    .map(|dir| steamapps.join("common").join(dir))
                    .filter(|dir| dir.exists())
                    .map(path_to_string);
                let cover_url = app_id.as_ref().map(|id| {
                    format!(
                        "https://cdn.cloudflare.steamstatic.com/steam/apps/{id}/library_hero.jpg"
                    )
                });
                let mut game = installed_game(
                    &format!("steam-{title}"),
                    title,
                    "Steam".to_string(),
                    install_path,
                    cover_url,
                );
                if let Some(id) = app_id {
                    game.icon_urls = steam_icon_urls(&id, &game.title, &steam_dir);
                    game.icon_url = game.icon_urls.first().cloned();
                    game.logo_urls = steam_logo_urls(&id);
                    game.logo_url = game.logo_urls.first().cloned();
                    game.launch_uri = Some(format!("steam://rungameid/{id}"));
                    let logo_layout = steam_logo_layout(&id, &game.title, &steam_dir);
                    game.logo_position = logo_layout.position;
                    game.logo_width_percent = logo_layout.width_percent;
                    game.logo_height_percent = logo_layout.height_percent;
                }

                games.push(game);
            }
        }
    }

    games
}

fn scan_epic_games() -> Vec<InstalledGame> {
    let manifest_dir = PathBuf::from(r"C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests");
    let Ok(entries) = fs::read_dir(manifest_dir) else {
        return Vec::new();
    };

    entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if path.extension().and_then(|extension| extension.to_str()) != Some("item") {
                return None;
            }

            let contents = fs::read_to_string(path).ok()?;
            let value = serde_json::from_str::<serde_json::Value>(&contents).ok()?;
            let title = value.get("DisplayName")?.as_str()?.trim().to_string();

            if title.is_empty() {
                return None;
            }

            let install_path = value
                .get("InstallLocation")
                .and_then(|location| location.as_str())
                .map(str::trim)
                .filter(|location| !location.is_empty())
                .map(ToOwned::to_owned);
            let cover_url = install_path
                .as_ref()
                .and_then(|path| find_local_banner_asset(&PathBuf::from(path)));
            let logo_url = install_path
                .as_ref()
                .and_then(|path| find_local_logo_asset(&PathBuf::from(path)));

            let mut game = installed_game(
                &format!("epic-{title}"),
                title,
                "Epic Games".to_string(),
                install_path.clone(),
                cover_url,
            );
            game.logo_url = logo_url;
            game.icon_url = install_path
                .as_ref()
                .and_then(|path| find_local_icon_asset(&PathBuf::from(path)));

            Some(game)
        })
        .collect()
}

fn scan_gog_games() -> Vec<InstalledGame> {
    let mut candidates = Vec::new();

    if let Some(program_files) = env_path("ProgramFiles") {
        candidates.push(program_files.join("GOG Galaxy").join("Games"));
    }

    if let Some(program_files_x86) = env_path("ProgramFiles(x86)") {
        candidates.push(program_files_x86.join("GOG Galaxy").join("Games"));
    }

    candidates.push(PathBuf::from(r"C:\GOG Games"));

    let gog_last_played = read_gog_last_played_data();

    let mut games = Vec::new();
    let mut seen = HashSet::new();

    for candidate in candidates {
        let Ok(entries) = fs::read_dir(candidate) else {
            continue;
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            let Some(title) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };

            let title = title.trim();
            if title.is_empty() || !seen.insert(title.to_lowercase()) {
                continue;
            }

            let mut game = installed_game(
                &format!("gog-{title}"),
                title.to_string(),
                "GOG".to_string(),
                Some(path_to_string(path.clone())),
                find_local_banner_asset(&path),
            );
            game.logo_url = find_local_logo_asset(&path);
            game.icon_url = find_local_icon_asset(&path);

            if let Some((last_played, playtime)) = gog_last_played.get(title) {
                game.last_played_at = Some(unix_timestamp_to_iso(*last_played));
                game.playtime_minutes = Some(*playtime);
            }

            games.push(game);
        }
    }

    games
}

fn scan_ubisoft_games() -> Vec<InstalledGame> {
    let mut candidates = Vec::new();

    if let Some(program_files_x86) = env_path("ProgramFiles(x86)") {
        candidates.push(
            program_files_x86
                .join("Ubisoft")
                .join("Ubisoft Game Launcher")
                .join("games"),
        );
        candidates.push(
            program_files_x86
                .join("Ubisoft Game Launcher")
                .join("games"),
        );
    }

    if let Some(program_files) = env_path("ProgramFiles") {
        candidates.push(
            program_files
                .join("Ubisoft")
                .join("Ubisoft Game Launcher")
                .join("games"),
        );
        candidates.push(program_files.join("Ubisoft Game Launcher").join("games"));
    }

    candidates.push(PathBuf::from(r"C:\Ubisoft Games"));

    let mut games = collect_directory_games(candidates, "ubisoft", "Ubisoft Connect");
    let mut seen_titles = games
        .iter()
        .map(|game| game.title.to_lowercase())
        .collect::<HashSet<_>>();

    for path in read_ubisoft_registry_install_dirs() {
        if !path.is_dir() || is_ignored_game_directory(&path) {
            continue;
        }

        let Some(title) = path
            .file_name()
            .and_then(|name| name.to_str())
            .map(str::trim)
            .filter(|title| !title.is_empty())
        else {
            continue;
        };

        if !seen_titles.insert(title.to_lowercase()) {
            continue;
        }

        let mut game = installed_game(
            &format!("ubisoft-{title}"),
            title.to_string(),
            "Ubisoft Connect".to_string(),
            Some(path_to_string(path.clone())),
            find_local_banner_asset(&path),
        );
        game.logo_url = find_local_logo_asset(&path);
        game.icon_url = find_local_icon_asset(&path);

        games.push(game);
    }

    games
}

fn scan_xbox_games() -> Vec<InstalledGame> {
    let candidates = local_drive_roots()
        .into_iter()
        .map(|drive| drive.join("XboxGames"))
        .collect::<Vec<_>>();

    collect_directory_games_with_title_resolver(candidates, "xbox", "Xbox", xbox_game_title)
}

fn collect_directory_games(
    candidates: Vec<PathBuf>,
    id_prefix: &str,
    source: &str,
) -> Vec<InstalledGame> {
    collect_directory_games_with_title_resolver(candidates, id_prefix, source, |_| None)
}

fn collect_directory_games_with_title_resolver(
    candidates: Vec<PathBuf>,
    id_prefix: &str,
    source: &str,
    title_resolver: fn(&Path) -> Option<String>,
) -> Vec<InstalledGame> {
    let mut games = Vec::new();
    let mut seen = HashSet::new();

    for candidate in candidates {
        let Ok(entries) = fs::read_dir(candidate) else {
            continue;
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() || is_ignored_game_directory(&path) {
                continue;
            }

            let Some(folder_title) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };

            let title = title_resolver(&path).unwrap_or_else(|| folder_title.trim().to_string());
            if title.is_empty() || !seen.insert(title.to_lowercase()) {
                continue;
            }

            let mut game = installed_game(
                &format!("{id_prefix}-{title}"),
                title,
                source.to_string(),
                Some(path_to_string(path.clone())),
                find_local_banner_asset(&path),
            );
            game.logo_url = find_local_logo_asset(&path);
            game.icon_url = find_local_icon_asset(&path);

            games.push(game);
        }
    }

    games
}

fn xbox_game_title(path: &Path) -> Option<String> {
    let config_paths = [
        path.join("MicrosoftGame.config"),
        path.join("Content").join("MicrosoftGame.config"),
    ];

    config_paths
        .into_iter()
        .filter_map(|config_path| fs::read_to_string(config_path).ok())
        .filter_map(|contents| {
            find_xml_attribute(&contents, "ShellVisuals", "DefaultDisplayName")
                .or_else(|| find_xml_attribute(&contents, "Game", "Name"))
                .or_else(|| find_xml_attribute(&contents, "Identity", "Name"))
        })
        .map(|title| title.trim().to_string())
        .find(|title| !title.is_empty() && !title.starts_with("ms-resource:"))
}

fn find_local_banner_asset(path: &Path) -> Option<String> {
    let config_paths = [
        path.join("MicrosoftGame.config"),
        path.join("Content").join("MicrosoftGame.config"),
    ];

    for config_path in config_paths {
        let Ok(contents) = fs::read_to_string(&config_path) else {
            continue;
        };

        let base_path = config_path.parent().unwrap_or(path);
        for attribute in [
            "Wide310x150Logo",
            "StoreLogo",
            "Logo",
            "Square150x150Logo",
            "SplashScreenImage",
        ] {
            if let Some(asset_path) = find_xml_attribute(&contents, "ShellVisuals", attribute)
                .and_then(|asset| resolve_local_asset(base_path, &asset))
            {
                return Some(path_to_string(asset_path));
            }
        }
    }

    find_named_image_asset(
        path,
        &[
            "header",
            "banner",
            "capsule",
            "cover",
            "wide310x150logo",
            "storelogo",
            "logo",
        ],
    )
}

fn find_local_logo_asset(path: &Path) -> Option<String> {
    let config_paths = [
        path.join("MicrosoftGame.config"),
        path.join("Content").join("MicrosoftGame.config"),
    ];

    for config_path in config_paths {
        let Ok(contents) = fs::read_to_string(&config_path) else {
            continue;
        };

        let base_path = config_path.parent().unwrap_or(path);
        for attribute in ["Logo", "StoreLogo", "Square150x150Logo"] {
            if let Some(asset_path) = find_xml_attribute(&contents, "ShellVisuals", attribute)
                .and_then(|asset| resolve_local_asset(base_path, &asset))
            {
                return Some(path_to_string(asset_path));
            }
        }
    }

    find_named_image_asset(path, &["library_logo", "title", "storelogo", "logo"])
}

fn find_local_icon_asset(path: &Path) -> Option<String> {
    let config_paths = [
        path.join("MicrosoftGame.config"),
        path.join("Content").join("MicrosoftGame.config"),
    ];

    for config_path in config_paths {
        let Ok(contents) = fs::read_to_string(&config_path) else {
            continue;
        };

        let base_path = config_path.parent().unwrap_or(path);
        for attribute in ["Square44x44Logo", "Square150x150Logo", "StoreLogo", "Logo"] {
            if let Some(asset_path) = find_xml_attribute(&contents, "ShellVisuals", attribute)
                .and_then(|asset| resolve_local_asset(base_path, &asset))
            {
                return Some(path_to_string(asset_path));
            }
        }
    }

    find_named_image_asset(
        path,
        &[
            "icon",
            "appicon",
            "square44",
            "square150",
            "storelogo",
            "logo",
        ],
    )
}

fn resolve_local_asset(base_path: &Path, asset: &str) -> Option<PathBuf> {
    let normalized = asset.trim().replace('/', "\\");
    if normalized.is_empty() || normalized.starts_with("ms-resource:") {
        return None;
    }

    let direct_path = base_path.join(&normalized);
    if direct_path.exists() {
        return Some(direct_path);
    }

    let asset_path = PathBuf::from(&normalized);
    let parent = asset_path.parent()?;
    let stem = asset_path.file_stem()?.to_str()?.to_lowercase();

    let Ok(entries) = fs::read_dir(base_path.join(parent)) else {
        return None;
    };

    entries.flatten().map(|entry| entry.path()).find(|path| {
        path.is_file()
            && is_supported_image(path)
            && path
                .file_stem()
                .and_then(|name| name.to_str())
                .map(|name| name.to_lowercase().starts_with(&stem))
                .unwrap_or(false)
    })
}

fn find_named_image_asset(path: &Path, name_needles: &[&str]) -> Option<String> {
    let mut directories = vec![path.to_path_buf()];
    for child in ["assets", "Assets", "Content", "content"] {
        directories.push(path.join(child));
    }

    for directory in directories {
        let Ok(entries) = fs::read_dir(directory) else {
            continue;
        };

        if let Some(asset) = entries.flatten().map(|entry| entry.path()).find(|path| {
            path.is_file()
                && is_supported_image(path)
                && path
                    .file_stem()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| {
                        let normalized = name.to_lowercase();
                        name_needles
                            .iter()
                            .any(|needle| normalized.contains(needle))
                    })
        }) {
            return Some(path_to_string(asset));
        }
    }

    None
}

fn is_supported_image(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|extension| extension.to_str())
            .map(str::to_lowercase)
            .as_deref(),
        Some("jpg" | "jpeg" | "png" | "webp")
    )
}

fn find_xml_attribute(contents: &str, element: &str, attribute: &str) -> Option<String> {
    let element_start = contents.find(&format!("<{element}"))?;
    let after_element = &contents[element_start..];
    let element_end = after_element.find('>')?;
    let element_text = &after_element[..element_end];
    let attribute_start = element_text.find(&format!("{attribute}=\""))?;
    let after_attribute = &element_text[attribute_start + attribute.len() + 2..];
    let value_end = after_attribute.find('"')?;

    Some(after_attribute[..value_end].to_string())
}

fn is_ignored_game_directory(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
        return true;
    };

    let normalized = name.trim().to_lowercase();
    normalized.is_empty()
        || normalized.starts_with('.')
        || matches!(
            normalized.as_str(),
            "content" | "modifiablewindowsapps" | "msixvc" | "program files" | "windowsapps"
        )
}

fn local_drive_roots() -> Vec<PathBuf> {
    if !cfg!(target_os = "windows") {
        return Vec::new();
    }

    (b'C'..=b'Z')
        .map(|letter| PathBuf::from(format!("{}:\\", letter as char)))
        .filter(|path| path.exists())
        .collect()
}

fn read_ubisoft_registry_install_dirs() -> Vec<PathBuf> {
    if !cfg!(target_os = "windows") {
        return Vec::new();
    }

    [
        r"HKLM\SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs",
        r"HKLM\SOFTWARE\Ubisoft\Launcher\Installs",
    ]
    .into_iter()
    .filter_map(|key| Command::new("reg").args(["query", key, "/s"]).output().ok())
    .filter(|output| output.status.success())
    .flat_map(|output| {
        String::from_utf8_lossy(&output.stdout)
            .into_owned()
            .lines()
            .map(str::to_string)
            .collect::<Vec<_>>()
    })
    .filter_map(|line| registry_string_value(&line, "InstallDir"))
    .map(PathBuf::from)
    .filter(|path| path.exists())
    .collect()
}

fn registry_string_value(line: &str, value_name: &str) -> Option<String> {
    let trimmed = line.trim();
    let remainder = trimmed.strip_prefix(value_name)?.trim_start();
    let value = remainder.strip_prefix("REG_SZ")?.trim();

    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

fn find_steam_dir() -> Option<PathBuf> {
    let mut candidates = Vec::new();

    if let Some(program_files_x86) = env_path("ProgramFiles(x86)") {
        candidates.push(program_files_x86.join("Steam"));
    }

    if let Some(program_files) = env_path("ProgramFiles") {
        candidates.push(program_files.join("Steam"));
    }

    candidates.push(PathBuf::from(r"C:\Steam"));

    candidates.into_iter().find(|candidate| candidate.exists())
}

fn read_steam_library_folders(steam_dir: &Path) -> Vec<PathBuf> {
    let library_file = steam_dir.join("steamapps").join("libraryfolders.vdf");
    let Ok(contents) = fs::read_to_string(library_file) else {
        return Vec::new();
    };

    contents
        .lines()
        .filter_map(|line| find_quoted_value(line, "path"))
        .map(|path| PathBuf::from(path.replace("\\\\", "\\")))
        .filter(|path| path.exists())
        .collect()
}

fn find_steam_userdata_dirs(steam_dir: &Path) -> Vec<PathBuf> {
    let userdata = steam_dir.join("userdata");
    let Ok(entries) = fs::read_dir(&userdata) else {
        return Vec::new();
    };

    entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().is_dir())
        .filter(|entry| {
            entry
                .file_name()
                .to_str()
                .map(|name| name.chars().all(|c| c.is_ascii_digit()))
                .unwrap_or(false)
        })
        .map(|entry| entry.path())
        .collect()
}

fn read_steam_last_played_times(steam_dir: &Path) -> HashMap<String, u64> {
    let mut result = HashMap::new();

    for userdata_dir in find_steam_userdata_dirs(steam_dir) {
        let localconfig = userdata_dir.join("config").join("localconfig.vdf");
        let Ok(contents) = fs::read_to_string(&localconfig) else {
            continue;
        };

        parse_steam_last_played_from_vdf(&contents, &mut result);
    }

    result
}

fn parse_steam_last_played_from_vdf(contents: &str, out: &mut HashMap<String, u64>) {
    let mut stack: Vec<String> = Vec::new();
    let mut current_app_id: Option<String> = None;

    for line in contents.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("//") {
            continue;
        }

        if let Some((key, is_object_open)) = parse_vdf_line(trimmed) {
            if is_object_open {
                if key.chars().all(|c| c.is_ascii_digit())
                    && stack.last() == Some(&"Apps".to_string())
                {
                    current_app_id = Some(key.clone());
                }
                stack.push(key);
            } else if key == "LastPlayed" {
                if let Some(app_id) = &current_app_id {
                    if let Some(value) = extract_vdf_value(trimmed) {
                        if let Ok(timestamp) = value.parse::<u64>() {
                            if timestamp > 1_000_000_000 && timestamp < 2_000_000_000 {
                                out.insert(app_id.clone(), timestamp);
                            }
                        }
                    }
                }
            }
        } else if trimmed == "}" {
            stack.pop();
            if stack.last() != Some(&"Apps".to_string()) {
                current_app_id = None;
            }
        }
    }
}

fn parse_vdf_line(line: &str) -> Option<(String, bool)> {
    let trimmed = line.trim();
    if trimmed.starts_with('"') {
        if let Some(end_quote) = trimmed[1..].find('"').map(|index| index + 1) {
            let key = &trimmed[1..end_quote];
            let after_key = trimmed[end_quote + 1..].trim();
            let is_object_open = after_key == "{";
            return Some((key.to_string(), is_object_open));
        }
    }
    None
}

fn extract_vdf_value(line: &str) -> Option<String> {
    let trimmed = line.trim();
    let parts: Vec<&str> = trimmed.split('"').collect();
    if parts.len() >= 4 {
        return Some(parts[1].to_string());
    }
    let remainder = trimmed.split_whitespace().nth(1)?;
    Some(remainder.trim_matches('"').to_string())
}

fn find_gog_database_path() -> Option<PathBuf> {
    let candidates = [
        PathBuf::from(r"C:\ProgramData\GOG.com\Galaxy\storage\galaxy-2.0.db"),
        PathBuf::from(r"C:\ProgramData\GOG.com\Galaxy\galaxy-2.0.db"),
    ];

    candidates.into_iter().find(|path| path.exists())
}

fn read_gog_last_played_data() -> HashMap<String, (u64, u32)> {
    let mut result = HashMap::new();

    let Some(db_path) = find_gog_database_path() else {
        return result;
    };

    let Some(conn) =
        rusqlite::Connection::open_with_flags(&db_path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
            .ok()
    else {
        return result;
    };

    let query = "
        SELECT LR.title, LPD.lastPlayedDate, GT.minutesInGame
        FROM LibraryReleases LR
        LEFT JOIN LastPlayedDates LPD ON LPD.gameReleaseKey = LR.releaseKey
        LEFT JOIN GameTimes GT ON GT.releaseKey = LR.releaseKey
        WHERE LR.title IS NOT NULL AND LPD.lastPlayedDate IS NOT NULL
    ";

    let Some(mut stmt) = conn.prepare(query).ok() else {
        return result;
    };
    let Some(rows) = stmt
        .query_map([], |row| {
            let title: String = row.get(0)?;
            let last_played_date: Option<String> = row.get(1)?;
            let minutes: Option<i64> = row.get(2)?;
            Ok((title, last_played_date, minutes))
        })
        .ok()
    else {
        return result;
    };

    for row in rows.flatten() {
        let (title, last_played_date, minutes) = row;
        if let Some(date_str) = last_played_date {
            if let Some(timestamp) = parse_gog_date(&date_str) {
                let playtime = minutes.unwrap_or(0).max(0) as u32;
                result.insert(title, (timestamp, playtime));
            }
        }
    }

    result
}

fn parse_gog_date(date_str: &str) -> Option<u64> {
    if let Ok(ts) = date_str.parse::<u64>() {
        if ts > 1_000_000_000 && ts < 2_000_000_000 {
            return Some(ts);
        }
        if ts > 1_000_000_000_000 {
            return Some(ts / 1000);
        }
    }

    let cleaned = date_str.trim();
    if cleaned.len() >= 19 {
        let parts: Vec<&str> = cleaned[0..19]
            .split(|c: char| !c.is_ascii_digit())
            .collect();
        if parts.len() >= 6 {
            let year = parts[0].parse::<i32>().ok()?;
            let month = parts[1].parse::<u32>().ok()?;
            let day = parts[2].parse::<u32>().ok()?;
            let hour = parts[3].parse::<u32>().ok()?;
            let minute = parts[4].parse::<u32>().ok()?;
            let second = parts[5].parse::<u32>().ok()?;

            let days_since_epoch = days_from_civil(year, month, day);
            let seconds =
                days_since_epoch * 86400 + hour as i64 * 3600 + minute as i64 * 60 + second as i64;
            if seconds > 0 {
                return Some(seconds as u64);
            }
        }
    }

    None
}

fn days_from_civil(year: i32, month: u32, day: u32) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let m = if month <= 2 { month + 9 } else { month - 3 };
    let era = if y >= 0 { y / 400 } else { (y - 399) / 400 };
    let yoe = (y - era * 400) as u32;
    let doy = (153 * m + 2) / 5 + day - 1;
    let doe = yoe as i64 * 365 + yoe as i64 / 4 - yoe as i64 / 100 + doy as i64;
    era as i64 * 146097 + doe - 719468
}

fn steam_app_id_from_manifest_name(file_name: &str) -> Option<String> {
    file_name
        .strip_prefix("appmanifest_")?
        .strip_suffix(".acf")?
        .chars()
        .all(char::is_numeric)
        .then(|| {
            file_name
                .trim_start_matches("appmanifest_")
                .trim_end_matches(".acf")
                .to_string()
        })
}

fn steam_logo_urls(app_id: &str) -> Vec<String> {
    [
        format!("https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/{app_id}/logo.png"),
        format!("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{app_id}/logo.png"),
        format!("https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/library_logo.png"),
        format!("https://cdn.akamai.steamstatic.com/steam/apps/{app_id}/library_logo.png"),
    ]
    .into_iter()
    .collect()
}

fn steam_icon_urls(app_id: &str, title: &str, steam_dir: &Path) -> Vec<String> {
    let mut urls = Vec::new();

    if let Some(local_icon) = find_local_steam_icon_asset(app_id, steam_dir) {
        push_unique(&mut urls, local_icon);
    }

    for hash in read_steam_assetcache_icon_hashes(app_id, steam_dir) {
        push_unique(&mut urls, steam_community_icon_url(app_id, &hash, "jpg"));
        push_unique(&mut urls, steam_community_icon_url(app_id, &hash, "ico"));
    }

    if let Some(hashes) = read_steam_app_hashes_by_app_id(app_id, steam_dir) {
        push_steam_icon_hash_candidates(&mut urls, app_id, &hashes);
    }

    if let Some(hashes) = read_steam_app_hashes_by_title(title, steam_dir) {
        push_steam_icon_hash_candidates(&mut urls, app_id, &hashes);
    }

    urls
}

fn find_local_steam_icon_asset(app_id: &str, steam_dir: &Path) -> Option<String> {
    let library_cache = steam_dir.join("appcache").join("librarycache");
    let steam_games = steam_dir.join("steam").join("games");
    let icon_hash = read_steam_client_icon_hash(app_id, steam_dir);

    let mut candidates = vec![
        library_cache.join(format!("{app_id}_icon.jpg")),
        library_cache.join(format!("{app_id}_icon.png")),
        library_cache.join(app_id).join("icon.jpg"),
        library_cache.join(app_id).join("icon.png"),
    ];

    if let Some(hash) = icon_hash {
        candidates.push(steam_games.join(format!("{hash}.ico")));
    }

    candidates
        .into_iter()
        .find(|path| path.exists() && path.is_file())
        .map(path_to_string)
}

fn push_steam_icon_hash_candidates(urls: &mut Vec<String>, app_id: &str, hashes: &[String]) {
    for hash in hashes.iter().take(6) {
        push_unique(urls, steam_community_icon_url(app_id, hash, "jpg"));
        push_unique(urls, steam_community_icon_url(app_id, hash, "ico"));
    }
}

fn steam_community_icon_url(app_id: &str, hash: &str, extension: &str) -> String {
    format!(
        "https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/{app_id}/{hash}.{extension}"
    )
}

fn push_unique(values: &mut Vec<String>, value: String) {
    if !values.iter().any(|existing| existing == &value) {
        values.push(value);
    }
}

fn read_steam_assetcache_icon_hashes(app_id: &str, steam_dir: &Path) -> Vec<String> {
    let assetcache_path = steam_dir
        .join("appcache")
        .join("librarycache")
        .join("assetcache.vdf");
    let Some(contents) = fs::read(assetcache_path).ok() else {
        return Vec::new();
    };
    let contents = String::from_utf8_lossy(&contents);
    let Some(app_index) = contents.find(app_id) else {
        return Vec::new();
    };
    let searchable = contents.get(app_index..).unwrap_or_default();
    let record_end = searchable
        .find("change")
        .map(|index| app_index + index)
        .unwrap_or_else(|| next_char_boundary(&contents, app_index + 800));
    let record_end = next_char_boundary(&contents, record_end);
    let Some(segment) = contents.get(app_index..record_end) else {
        return Vec::new();
    };

    extract_steam_jpg_hashes(segment)
}

fn read_steam_client_icon_hash(app_id: &str, steam_dir: &Path) -> Option<String> {
    let appinfo_path = steam_dir.join("appcache").join("appinfo.vdf");
    let contents = fs::read(appinfo_path).ok()?;
    let contents = String::from_utf8_lossy(&contents);
    let app_index = contents.find(app_id)?;
    let segment_start = app_index.saturating_sub(4_000);
    let segment_end = next_char_boundary(&contents, app_index + 12_000);
    let segment = contents.get(segment_start..segment_end)?;
    let hashes = extract_steam_hashes(segment);

    hashes.get(2).cloned()
}

fn read_steam_app_hashes_by_app_id(app_id: &str, steam_dir: &Path) -> Option<Vec<String>> {
    let appinfo_path = steam_dir.join("appcache").join("appinfo.vdf");
    let contents = fs::read(appinfo_path).ok()?;
    let contents = String::from_utf8_lossy(&contents);
    let app_index = contents.find(app_id)?;
    let segment_start = app_index.saturating_sub(1_000);
    let segment_end = next_char_boundary(&contents, app_index + 12_000);
    let segment = contents.get(segment_start..segment_end)?;
    let hashes = extract_steam_hashes(segment);

    (hashes.len() >= 2).then_some(hashes)
}

fn read_steam_app_hashes_by_title(title: &str, steam_dir: &Path) -> Option<Vec<String>> {
    let appinfo_path = steam_dir.join("appcache").join("appinfo.vdf");
    let contents = fs::read(appinfo_path).ok()?;
    let contents = String::from_utf8_lossy(&contents);

    let mut search_from = 0;
    while let Some(searchable_contents) = contents.get(search_from..) {
        let Some(relative_index) = searchable_contents.find(title) else {
            break;
        };

        let title_index = search_from + relative_index;
        let segment_end = next_char_boundary(&contents, title_index + 12_000);
        let Some(segment) = contents.get(title_index..segment_end) else {
            break;
        };

        let hashes = extract_steam_hashes(segment);
        if hashes.len() >= 2 {
            return Some(hashes);
        }

        search_from = title_index + title.len();
    }

    None
}

fn extract_steam_hashes(segment: &str) -> Vec<String> {
    let mut hashes = Vec::new();

    for value in segment.split(|character: char| !character.is_ascii_hexdigit()) {
        if value.len() != 40 || hashes.iter().any(|hash| hash == value) {
            continue;
        }

        hashes.push(value.to_string());
    }

    hashes
}

fn extract_steam_jpg_hashes(segment: &str) -> Vec<String> {
    extract_steam_hashes(segment)
        .into_iter()
        .filter(|hash| segment.contains(&format!("{hash}.jpg")))
        .collect()
}

fn steam_logo_layout(app_id: &str, title: &str, steam_dir: &Path) -> LogoLayout {
    if let Some(layout) = read_cached_steam_logo_layout(app_id) {
        return layout;
    }

    if let Some(layout) = read_local_steam_logo_layout(title, steam_dir) {
        cache_steam_logo_layout(app_id, &layout);
        return layout;
    }

    LogoLayout {
        position: LogoPosition::BottomLeft,
        width_percent: None,
        height_percent: None,
    }
}

fn read_cached_steam_logo_layout(app_id: &str) -> Option<LogoLayout> {
    let cache = read_steam_logo_layout_cache();
    cache.get(app_id).and_then(logo_layout_from_cache_value)
}

fn cache_steam_logo_layout(app_id: &str, layout: &LogoLayout) {
    let Some(cache_path) = steam_logo_position_cache_path() else {
        return;
    };

    let mut cache = read_steam_logo_layout_cache();
    cache.insert(
        app_id.to_string(),
        serde_json::json!({
            "position": logo_position_to_pinned_value(&layout.position),
            "widthPercent": layout.width_percent,
            "heightPercent": layout.height_percent,
        }),
    );

    if let Some(parent) = cache_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    if let Ok(contents) = serde_json::to_string_pretty(&cache) {
        let _ = fs::write(cache_path, contents);
    }
}

fn read_steam_logo_layout_cache() -> BTreeMap<String, serde_json::Value> {
    let Some(cache_path) = steam_logo_position_cache_path() else {
        return BTreeMap::new();
    };

    fs::read_to_string(cache_path)
        .ok()
        .and_then(|contents| {
            serde_json::from_str::<BTreeMap<String, serde_json::Value>>(&contents).ok()
        })
        .unwrap_or_default()
}

fn steam_logo_position_cache_path() -> Option<PathBuf> {
    dirs::cache_dir().map(|cache_dir| {
        cache_dir
            .join("open-game-launcher")
            .join("steam-logo-layouts.json")
    })
}

fn read_local_steam_logo_layout(title: &str, steam_dir: &Path) -> Option<LogoLayout> {
    let appinfo_path = steam_dir.join("appcache").join("appinfo.vdf");
    let contents = fs::read(appinfo_path).ok()?;
    let contents = String::from_utf8_lossy(&contents);

    let mut search_from = 0;
    while let Some(searchable_contents) = contents.get(search_from..) {
        let Some(relative_index) = searchable_contents.find(title) else {
            break;
        };

        let title_index = search_from + relative_index;
        let segment_end = next_char_boundary(&contents, title_index + 8_000);
        let Some(segment) = contents.get(title_index..segment_end) else {
            break;
        };

        if segment.contains("library_hero") && segment.contains("logo.png") {
            if let Some(layout) = parse_steam_logo_layout_segment(segment) {
                return Some(layout);
            }
        }

        search_from = title_index + title.len();
    }

    None
}

fn next_char_boundary(contents: &str, index: usize) -> usize {
    let mut index = index.min(contents.len());
    while index > 0 && !contents.is_char_boundary(index) {
        index -= 1;
    }
    index
}

fn parse_steam_logo_layout_segment(segment: &str) -> Option<LogoLayout> {
    let search_start = segment
        .find("logo.png")
        .or_else(|| segment.find("library_hero"))
        .unwrap_or(0);
    let searchable = &segment[search_start..];

    let (position_name, position_index) =
        ["BottomLeft", "UpperCenter", "CenterCenter", "BottomCenter"]
            .into_iter()
            .filter_map(|position| searchable.find(position).map(|index| (position, index)))
            .min_by_key(|(_, index)| *index)?;

    let after_position = &searchable[position_index + position_name.len()..];
    let value_text_end = after_position
        .find("logo_2x")
        .unwrap_or(after_position.len());
    let value_text_end = next_char_boundary(after_position, value_text_end.min(600));
    let value_text = after_position
        .get(..value_text_end)
        .unwrap_or(after_position);
    let mut percentages = value_text
        .split(|character: char| {
            !(character.is_ascii_digit() || character == '.' || character == '-')
        })
        .filter(|value| value.contains('.'))
        .filter_map(|value| value.parse::<f64>().ok())
        .filter_map(sanitize_logo_percent);

    Some(LogoLayout {
        position: logo_position_from_pinned_value(position_name),
        width_percent: percentages.next(),
        height_percent: percentages.next(),
    })
}

fn sanitize_logo_percent(value: f64) -> Option<f64> {
    (10.0..=100.0).contains(&value).then_some(value)
}

fn logo_layout_from_cache_value(value: &serde_json::Value) -> Option<LogoLayout> {
    if let Some(position) = value.as_str() {
        return Some(LogoLayout {
            position: logo_position_from_pinned_value(position),
            width_percent: None,
            height_percent: None,
        });
    }

    let position = value.get("position")?.as_str()?;
    let width_percent = value
        .get("widthPercent")
        .and_then(serde_json::Value::as_f64)
        .and_then(sanitize_logo_percent);
    let height_percent = value
        .get("heightPercent")
        .and_then(serde_json::Value::as_f64)
        .and_then(sanitize_logo_percent);

    Some(LogoLayout {
        position: logo_position_from_pinned_value(position),
        width_percent,
        height_percent,
    })
}

fn logo_position_to_pinned_value(position: &LogoPosition) -> &'static str {
    match position {
        LogoPosition::BottomLeft => "BottomLeft",
        LogoPosition::UpperCenter => "UpperCenter",
        LogoPosition::CenterCenter => "CenterCenter",
        LogoPosition::BottomCenter => "BottomCenter",
    }
}

fn logo_position_from_pinned_value(value: &str) -> LogoPosition {
    match value {
        "UpperCenter" => LogoPosition::UpperCenter,
        "CenterCenter" => LogoPosition::CenterCenter,
        "BottomCenter" => LogoPosition::BottomCenter,
        "BottomLeft" => LogoPosition::BottomLeft,
        _ => LogoPosition::BottomLeft,
    }
}

fn find_quoted_value(contents: &str, key: &str) -> Option<String> {
    let needle = format!("\"{key}\"");
    let index = contents.find(&needle)?;
    let after_key = &contents[index + needle.len()..];
    let value_start = after_key.find('"')? + 1;
    let after_quote = &after_key[value_start..];
    let value_end = after_quote.find('"')?;

    Some(after_quote[..value_end].to_string())
}

fn installed_game(
    id_seed: &str,
    title: String,
    source: String,
    install_path: Option<String>,
    cover_url: Option<String>,
) -> InstalledGame {
    InstalledGame {
        id: slugify(id_seed),
        description: install_path
            .as_ref()
            .map(|path| format!("{source} // {path}"))
            .unwrap_or(source),
        title,
        version: "local".to_string(),
        cover_url,
        icon_url: None,
        icon_urls: Vec::new(),
        logo_url: None,
        logo_urls: Vec::new(),
        logo_position: LogoPosition::BottomLeft,
        logo_width_percent: None,
        logo_height_percent: None,
        status: GameStatus::Installed,
        platform: current_platform(),
        install_path,
        launch_uri: None,
        last_played_at: None,
        playtime_minutes: None,
    }
}

fn launch_installed_game(game: &InstalledGame) -> Result<(), String> {
    if let Some(uri) = &game.launch_uri {
        open_uri(uri).map_err(|error| format!("Konnte {} nicht starten: {error}", game.title))?;
        return Ok(());
    }

    let Some(install_path) = game.install_path.as_ref().map(PathBuf::from) else {
        return Err(format!("Kein Startpfad fur {} gefunden.", game.title));
    };

    let executable = find_launch_executable(&install_path, &game.title)
        .ok_or_else(|| format!("Keine passende .exe fur {} gefunden.", game.title))?;
    let working_dir = executable.parent().unwrap_or(&install_path);

    Command::new(&executable)
        .current_dir(working_dir)
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn open_uri(uri: &str) -> std::io::Result<()> {
    if cfg!(target_os = "windows") {
        Command::new("cmd").args(["/C", "start", "", uri]).spawn()?;
        return Ok(());
    }

    if cfg!(target_os = "macos") {
        Command::new("open").arg(uri).spawn()?;
        return Ok(());
    }

    Command::new("xdg-open").arg(uri).spawn()?;
    Ok(())
}

fn find_launch_executable(install_path: &Path, title: &str) -> Option<PathBuf> {
    let title_score = normalize_executable_name(title);
    let mut candidates = Vec::new();
    collect_executable_candidates(install_path, 0, &mut candidates);

    candidates
        .into_iter()
        .filter(|path| !is_ignored_executable(path))
        .max_by_key(|path| executable_score(path, &title_score))
}

fn collect_executable_candidates(path: &Path, depth: usize, candidates: &mut Vec<PathBuf>) {
    if depth > 3 {
        return;
    }

    let Ok(entries) = fs::read_dir(path) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            let normalized = name.to_lowercase();
            if matches!(
                normalized.as_str(),
                "_commonredist" | "redist" | "redistributables" | "support" | "tools"
            ) {
                continue;
            }
            collect_executable_candidates(&path, depth + 1, candidates);
        } else if path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"))
        {
            candidates.push(path);
        }
    }
}

fn executable_score(path: &Path, title_score: &str) -> i32 {
    let Some(stem) = path.file_stem().and_then(|stem| stem.to_str()) else {
        return 0;
    };

    let normalized = normalize_executable_name(stem);
    let mut score = 10;

    if normalized == title_score {
        score += 100;
    } else if normalized.contains(title_score) || title_score.contains(&normalized) {
        score += 60;
    }

    if let Some(parent) = path
        .parent()
        .and_then(|parent| parent.file_name())
        .and_then(|name| name.to_str())
    {
        let parent = parent.to_lowercase();
        if matches!(parent.as_str(), "bin" | "binaries" | "win64" | "x64") {
            score += 10;
        }
    }

    score
}

fn is_ignored_executable(path: &Path) -> bool {
    path.file_stem()
        .and_then(|stem| stem.to_str())
        .map(|stem| {
            let normalized = stem.to_lowercase();
            normalized.contains("unins")
                || normalized.contains("setup")
                || normalized.contains("install")
                || normalized.contains("crash")
                || normalized.contains("redist")
                || normalized.contains("vcredist")
                || normalized.contains("dxsetup")
        })
        .unwrap_or(true)
}

fn normalize_executable_name(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn current_platform() -> Platform {
    if cfg!(target_os = "windows") {
        Platform::Windows
    } else if cfg!(target_os = "macos") {
        Platform::Macos
    } else {
        Platform::Linux
    }
}

fn env_path(key: &str) -> Option<PathBuf> {
    env::var_os(key).map(PathBuf::from)
}

fn path_to_string(path: PathBuf) -> String {
    path.to_string_lossy().to_string()
}

fn slugify(value: &str) -> String {
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

fn normalize_game_id(game_id: String) -> Result<String, String> {
    let normalized = game_id.trim().to_string();

    if normalized.is_empty() {
        return Err("game_id must not be empty.".to_string());
    }

    Ok(normalized)
}

fn unix_timestamp_to_iso(timestamp: u64) -> String {
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
