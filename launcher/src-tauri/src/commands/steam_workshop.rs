use reqwest::Url;
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

use crate::commands::games::{
    detect::{find_steam_dir, read_steam_library_folders},
    launcher_key_from_source, steam_app_id_for_game, InstalledGame,
};

const MAX_MANIFEST_BYTES: u64 = 8 * 1024 * 1024;
const MAX_VDF_TOKENS: usize = 100_000;
const MAX_VDF_TOKEN_BYTES: usize = 4 * 1024;
const MAX_VDF_DEPTH: usize = 32;

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub(crate) enum SteamWorkshopScanStatus {
    ClientMissing,
    AppIdMissing,
    GameInstallMissing,
    LibraryNotRegistered,
    GameManifestMissing,
    GameManifestInvalid,
    GameManifestMismatch,
    ManifestMissing,
    ManifestUnreadable,
    ManifestTooLarge,
    ManifestInvalid,
    ManifestAppIdMismatch,
    Ready,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub(crate) enum SteamWorkshopContentState {
    Present,
    Missing,
    UnsafePath,
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub(crate) struct SteamWorkshopLocalItem {
    pub published_file_id: u64,
    pub manifest_id: Option<u64>,
    pub declared_size_bytes: Option<u64>,
    pub updated_at_unix: Option<u64>,
    pub content_path: Option<PathBuf>,
    pub content_state: SteamWorkshopContentState,
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub(crate) struct SteamWorkshopInspection {
    pub app_id: Option<u32>,
    pub status: SteamWorkshopScanStatus,
    pub items: Vec<SteamWorkshopLocalItem>,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub(crate) enum SteamWorkshopSort {
    Popular,
    Latest,
}

pub(crate) fn inspect_game_workshop(game: &InstalledGame) -> SteamWorkshopInspection {
    let app_id = steam_app_id(game);
    let Some(app_id) = app_id else {
        return inspection(None, SteamWorkshopScanStatus::AppIdMissing);
    };
    let Some(steam_root) = find_steam_dir() else {
        return inspection(Some(app_id), SteamWorkshopScanStatus::ClientMissing);
    };
    inspect_game_workshop_with_paths(game, app_id, &steam_root)
}

fn inspect_game_workshop_with_paths(
    game: &InstalledGame,
    app_id: u32,
    steam_root: &Path,
) -> SteamWorkshopInspection {
    let Some(game_path) = game.install_path.as_deref().map(Path::new) else {
        return inspection(Some(app_id), SteamWorkshopScanStatus::GameInstallMissing);
    };
    let Ok(game_path) = game_path.canonicalize() else {
        return inspection(Some(app_id), SteamWorkshopScanStatus::GameInstallMissing);
    };

    let mut libraries = vec![steam_root.join("steamapps")];
    libraries.extend(
        read_steam_library_folders(steam_root)
            .into_iter()
            .map(|library| library.join("steamapps")),
    );
    let registered_steamapps = libraries
        .into_iter()
        .filter_map(|path| path.canonicalize().ok())
        .collect::<Vec<_>>();
    let Some(steamapps) = registered_steamapps.into_iter().find(|steamapps| {
        let common = steamapps.join("common");
        common
            .canonicalize()
            .ok()
            .is_some_and(|common| game_path.starts_with(common))
    }) else {
        return inspection(Some(app_id), SteamWorkshopScanStatus::LibraryNotRegistered);
    };

    if let Err(status) = validate_game_app_manifest(app_id, &steamapps, &game_path) {
        return inspection(Some(app_id), status);
    }

    inspect_manifest(app_id, &steamapps)
}

fn validate_game_app_manifest(
    app_id: u32,
    steamapps: &Path,
    game_path: &Path,
) -> Result<(), SteamWorkshopScanStatus> {
    let manifest_path = steamapps.join(format!("appmanifest_{app_id}.acf"));
    let metadata = match fs::symlink_metadata(&manifest_path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Err(SteamWorkshopScanStatus::GameManifestMissing)
        }
        Err(_) => return Err(SteamWorkshopScanStatus::GameManifestInvalid),
    };
    if metadata.file_type().is_symlink()
        || !metadata.file_type().is_file()
        || metadata.len() > MAX_MANIFEST_BYTES
    {
        return Err(SteamWorkshopScanStatus::GameManifestInvalid);
    }
    let bytes =
        fs::read(&manifest_path).map_err(|_| SteamWorkshopScanStatus::GameManifestInvalid)?;
    let text = std::str::from_utf8(&bytes)
        .map(str::trim_start)
        .map_err(|_| SteamWorkshopScanStatus::GameManifestInvalid)?;
    let (manifest_app_id, install_dir) =
        parse_game_app_manifest(text).map_err(|_| SteamWorkshopScanStatus::GameManifestInvalid)?;
    if manifest_app_id != app_id {
        return Err(SteamWorkshopScanStatus::GameManifestMismatch);
    }
    let install_component = Path::new(&install_dir);
    if install_dir.is_empty()
        || install_dir.len() > MAX_VDF_TOKEN_BYTES
        || install_component.components().count() != 1
        || !matches!(
            install_component.components().next(),
            Some(std::path::Component::Normal(_))
        )
    {
        return Err(SteamWorkshopScanStatus::GameManifestInvalid);
    }
    let expected = steamapps
        .join("common")
        .join(install_component)
        .canonicalize()
        .map_err(|_| SteamWorkshopScanStatus::GameManifestMismatch)?;
    if expected != game_path {
        return Err(SteamWorkshopScanStatus::GameManifestMismatch);
    }
    Ok(())
}

fn inspect_manifest(app_id: u32, steamapps: &Path) -> SteamWorkshopInspection {
    let manifest_path = steamapps
        .join("workshop")
        .join(format!("appworkshop_{app_id}.acf"));
    let metadata = match fs::symlink_metadata(&manifest_path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return inspection(Some(app_id), SteamWorkshopScanStatus::ManifestMissing)
        }
        Err(_) => return inspection(Some(app_id), SteamWorkshopScanStatus::ManifestUnreadable),
    };
    if metadata.file_type().is_symlink() || !metadata.file_type().is_file() {
        return inspection(Some(app_id), SteamWorkshopScanStatus::ManifestUnreadable);
    }
    if metadata.len() > MAX_MANIFEST_BYTES {
        return inspection(Some(app_id), SteamWorkshopScanStatus::ManifestTooLarge);
    }
    let bytes = match fs::read(&manifest_path) {
        Ok(bytes) => bytes,
        Err(_) => return inspection(Some(app_id), SteamWorkshopScanStatus::ManifestUnreadable),
    };
    let text = match std::str::from_utf8(&bytes) {
        Ok(text) => text.trim_start_matches('\u{feff}'),
        Err(_) => return inspection(Some(app_id), SteamWorkshopScanStatus::ManifestInvalid),
    };
    let parsed = match parse_workshop_manifest(text) {
        Ok(parsed) => parsed,
        Err(_) => return inspection(Some(app_id), SteamWorkshopScanStatus::ManifestInvalid),
    };
    if parsed.app_id != app_id {
        return inspection(Some(app_id), SteamWorkshopScanStatus::ManifestAppIdMismatch);
    }

    let content_root = steamapps
        .join("workshop")
        .join("content")
        .join(app_id.to_string());
    let items = parsed
        .items
        .into_iter()
        .map(|item| item.with_content_state(&content_root))
        .collect();
    SteamWorkshopInspection {
        app_id: Some(app_id),
        status: SteamWorkshopScanStatus::Ready,
        items,
    }
}

pub(crate) fn workshop_browse_url(
    app_id: u32,
    query: &str,
    sort: SteamWorkshopSort,
) -> Result<String, String> {
    if app_id == 0 {
        return Err("Steam AppID must be greater than zero.".to_string());
    }
    let mut url = Url::parse("https://steamcommunity.com/workshop/browse/")
        .map_err(|_| "Could not construct the Steam Workshop URL.".to_string())?;
    url.query_pairs_mut()
        .append_pair("appid", &app_id.to_string())
        .append_pair("searchtext", query.trim())
        .append_pair(
            "browsesort",
            match sort {
                SteamWorkshopSort::Popular => "trend",
                SteamWorkshopSort::Latest => "lastupdated",
            },
        )
        .append_pair("section", "readytouseitems");
    Ok(url.to_string())
}

pub(crate) fn workshop_item_url(item_id: u64) -> Result<String, String> {
    require_item_id(item_id)?;
    Ok(format!(
        "https://steamcommunity.com/sharedfiles/filedetails/?id={item_id}"
    ))
}

pub(crate) fn workshop_item_steam_uri(item_id: u64) -> Result<String, String> {
    require_item_id(item_id)?;
    Ok(format!("steam://url/CommunityFilePage/{item_id}"))
}

fn require_item_id(item_id: u64) -> Result<(), String> {
    if item_id == 0 {
        Err("Steam Workshop item ID must be greater than zero.".to_string())
    } else {
        Ok(())
    }
}

fn steam_app_id(game: &InstalledGame) -> Option<u32> {
    (launcher_key_from_source(&game.launcher) == "steam").then_some(())?;
    steam_app_id_for_game(game).filter(|app_id| *app_id > 0)
}

fn inspection(app_id: Option<u32>, status: SteamWorkshopScanStatus) -> SteamWorkshopInspection {
    SteamWorkshopInspection {
        app_id,
        status,
        items: Vec::new(),
    }
}

#[derive(Debug, Clone, Eq, PartialEq)]
enum VdfToken {
    Text(String),
    Open,
    Close,
}

#[derive(Debug, Clone, Eq, PartialEq)]
enum VdfValue {
    Scalar(String),
    Object(Vec<(String, VdfValue)>),
}

#[derive(Debug)]
struct ParsedWorkshopManifest {
    app_id: u32,
    items: Vec<ParsedWorkshopItem>,
}

#[derive(Debug)]
struct ParsedWorkshopItem {
    published_file_id: u64,
    manifest_id: Option<u64>,
    declared_size_bytes: Option<u64>,
    updated_at_unix: Option<u64>,
}

fn parse_game_app_manifest(input: &str) -> Result<(u32, String), String> {
    let tokens = tokenize_vdf(input)?;
    let mut index = 0;
    let root = parse_pairs(&tokens, &mut index, 0, false)?;
    if index != tokens.len() || root.len() != 1 || root[0].0 != "AppState" {
        return Err("Steam game manifest root was invalid.".to_string());
    }
    let VdfValue::Object(app_state) = &root[0].1 else {
        return Err("Steam game manifest root was not an object.".to_string());
    };
    let app_id = unique_scalar(app_state, "appid")?
        .parse::<u32>()
        .ok()
        .filter(|value| *value > 0)
        .ok_or_else(|| "Steam game manifest AppID was invalid.".to_string())?;
    let install_dir = unique_scalar(app_state, "installdir")?.trim().to_string();
    Ok((app_id, install_dir))
}

impl ParsedWorkshopItem {
    fn with_content_state(self, content_root: &Path) -> SteamWorkshopLocalItem {
        let expected = content_root.join(self.published_file_id.to_string());
        let (content_path, content_state) = match fs::symlink_metadata(&expected) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                (None, SteamWorkshopContentState::Missing)
            }
            Err(_) => (None, SteamWorkshopContentState::UnsafePath),
            Ok(metadata) if metadata.file_type().is_symlink() || !metadata.file_type().is_dir() => {
                (None, SteamWorkshopContentState::UnsafePath)
            }
            Ok(_) => match (content_root.canonicalize(), expected.canonicalize()) {
                (Ok(root), Ok(content)) if content.starts_with(&root) => {
                    (Some(content), SteamWorkshopContentState::Present)
                }
                _ => (None, SteamWorkshopContentState::UnsafePath),
            },
        };
        SteamWorkshopLocalItem {
            published_file_id: self.published_file_id,
            manifest_id: self.manifest_id,
            declared_size_bytes: self.declared_size_bytes,
            updated_at_unix: self.updated_at_unix,
            content_path,
            content_state,
        }
    }
}

fn parse_workshop_manifest(input: &str) -> Result<ParsedWorkshopManifest, String> {
    let tokens = tokenize_vdf(input)?;
    let mut index = 0;
    let root = parse_pairs(&tokens, &mut index, 0, false)?;
    if index != tokens.len() || root.len() != 1 || root[0].0 != "AppWorkshop" {
        return Err("Steam Workshop manifest root was invalid.".to_string());
    }
    let VdfValue::Object(app_workshop) = &root[0].1 else {
        return Err("Steam Workshop manifest root was not an object.".to_string());
    };
    let app_id = unique_scalar(app_workshop, "appid")?
        .parse::<u32>()
        .ok()
        .filter(|value| *value > 0)
        .ok_or_else(|| "Steam Workshop manifest AppID was invalid.".to_string())?;
    let installed = unique_object(app_workshop, "WorkshopItemsInstalled")?;
    let details = optional_unique_object(app_workshop, "WorkshopItemDetails")?;
    let mut seen = HashSet::new();
    let mut items = Vec::with_capacity(installed.len());
    for (item_id, value) in installed {
        let item_id = item_id
            .parse::<u64>()
            .ok()
            .filter(|value| *value > 0)
            .ok_or_else(|| "Steam Workshop manifest contained an invalid item ID.".to_string())?;
        if !seen.insert(item_id) {
            return Err("Steam Workshop manifest contained a duplicate item ID.".to_string());
        }
        let VdfValue::Object(fields) = value else {
            return Err("Steam Workshop item state was not an object.".to_string());
        };
        let detail_fields = optional_item_object(details, item_id)?;
        let detail_u64 = |key| -> Result<Option<u64>, String> {
            detail_fields.map_or(Ok(None), |detail| optional_u64(detail, key))
        };
        items.push(ParsedWorkshopItem {
            published_file_id: item_id,
            manifest_id: optional_u64(fields, "manifest")?.or(detail_u64("manifest")?),
            declared_size_bytes: optional_u64(fields, "size")?.or(detail_u64("size")?),
            updated_at_unix: optional_u64(fields, "timeupdated")?
                .or(detail_u64("timeupdated")?)
                .or(detail_u64("timetouched")?),
        });
    }
    Ok(ParsedWorkshopManifest { app_id, items })
}

fn unique_scalar<'a>(pairs: &'a [(String, VdfValue)], key: &str) -> Result<&'a str, String> {
    let mut values = pairs.iter().filter(|(candidate, _)| candidate == key);
    let Some((_, VdfValue::Scalar(value))) = values.next() else {
        return Err(format!("Steam Workshop manifest was missing {key}."));
    };
    if values.next().is_some() {
        return Err(format!(
            "Steam Workshop manifest contained duplicate {key}."
        ));
    }
    Ok(value)
}

fn unique_object<'a>(
    pairs: &'a [(String, VdfValue)],
    key: &str,
) -> Result<&'a [(String, VdfValue)], String> {
    let mut values = pairs.iter().filter(|(candidate, _)| candidate == key);
    let Some((_, VdfValue::Object(value))) = values.next() else {
        return Err(format!("Steam Workshop manifest was missing {key}."));
    };
    if values.next().is_some() {
        return Err(format!(
            "Steam Workshop manifest contained duplicate {key}."
        ));
    }
    Ok(value)
}

fn optional_unique_object<'a>(
    pairs: &'a [(String, VdfValue)],
    key: &str,
) -> Result<Option<&'a [(String, VdfValue)]>, String> {
    let mut values = pairs.iter().filter(|(candidate, _)| candidate == key);
    let value = match values.next() {
        None => return Ok(None),
        Some((_, VdfValue::Object(value))) => value.as_slice(),
        Some(_) => return Err(format!("Steam Workshop manifest {key} was not an object.")),
    };
    if values.next().is_some() {
        return Err(format!(
            "Steam Workshop manifest contained duplicate {key}."
        ));
    }
    Ok(Some(value))
}

fn optional_item_object(
    pairs: Option<&[(String, VdfValue)]>,
    item_id: u64,
) -> Result<Option<&[(String, VdfValue)]>, String> {
    let Some(pairs) = pairs else {
        return Ok(None);
    };
    let item_id = item_id.to_string();
    let mut values = pairs.iter().filter(|(candidate, _)| candidate == &item_id);
    let value = match values.next() {
        None => return Ok(None),
        Some((_, VdfValue::Object(value))) => value.as_slice(),
        Some(_) => return Err("Steam Workshop item details were invalid.".to_string()),
    };
    if values.next().is_some() {
        return Err("Steam Workshop item details were duplicated.".to_string());
    }
    Ok(Some(value))
}

fn optional_u64(pairs: &[(String, VdfValue)], key: &str) -> Result<Option<u64>, String> {
    let mut values = pairs.iter().filter(|(candidate, _)| candidate == key);
    let value = match values.next() {
        None => return Ok(None),
        Some((_, VdfValue::Scalar(value))) => value,
        Some(_) => return Err(format!("Steam Workshop item {key} was invalid.")),
    };
    if values.next().is_some() {
        return Err(format!("Steam Workshop item {key} was duplicated."));
    }
    value
        .parse::<u64>()
        .map(Some)
        .map_err(|_| format!("Steam Workshop item {key} was invalid."))
}

fn parse_pairs(
    tokens: &[VdfToken],
    index: &mut usize,
    depth: usize,
    stop_at_close: bool,
) -> Result<Vec<(String, VdfValue)>, String> {
    if depth > MAX_VDF_DEPTH {
        return Err("Steam Workshop manifest exceeded the safe nesting limit.".to_string());
    }
    let mut pairs = Vec::new();
    loop {
        match tokens.get(*index) {
            None if stop_at_close => {
                return Err("Steam Workshop manifest contained an unterminated object.".to_string())
            }
            None => return Ok(pairs),
            Some(VdfToken::Close) if stop_at_close => {
                *index += 1;
                return Ok(pairs);
            }
            Some(VdfToken::Close) | Some(VdfToken::Open) => {
                return Err("Steam Workshop manifest structure was invalid.".to_string())
            }
            Some(VdfToken::Text(key)) => {
                let key = key.clone();
                *index += 1;
                let value = match tokens.get(*index) {
                    Some(VdfToken::Text(value)) => {
                        *index += 1;
                        VdfValue::Scalar(value.clone())
                    }
                    Some(VdfToken::Open) => {
                        *index += 1;
                        VdfValue::Object(parse_pairs(tokens, index, depth + 1, true)?)
                    }
                    _ => {
                        return Err(
                            "Steam Workshop manifest contained a key without a value.".to_string()
                        )
                    }
                };
                pairs.push((key, value));
            }
        }
    }
}

fn tokenize_vdf(input: &str) -> Result<Vec<VdfToken>, String> {
    let mut tokens = Vec::new();
    let mut chars = input.chars().peekable();
    while let Some(character) = chars.next() {
        match character {
            character if character.is_whitespace() || character == '\u{feff}' => {}
            '/' if chars.peek() == Some(&'/') => {
                chars.next();
                for next in chars.by_ref() {
                    if next == '\n' {
                        break;
                    }
                }
            }
            '{' => tokens.push(VdfToken::Open),
            '}' => tokens.push(VdfToken::Close),
            '"' => {
                let mut value = String::new();
                let mut closed = false;
                while let Some(next) = chars.next() {
                    match next {
                        '"' => {
                            closed = true;
                            break;
                        }
                        '\\' => match chars.next() {
                            Some('"') => value.push('"'),
                            Some('\\') => value.push('\\'),
                            Some(escaped) => {
                                value.push('\\');
                                value.push(escaped);
                            }
                            None => break,
                        },
                        other => value.push(other),
                    }
                    if value.len() > MAX_VDF_TOKEN_BYTES {
                        return Err("Steam Workshop manifest token was too long.".to_string());
                    }
                }
                if !closed {
                    return Err(
                        "Steam Workshop manifest contained an unterminated value.".to_string()
                    );
                }
                tokens.push(VdfToken::Text(value));
            }
            _ => {
                let mut value = String::from(character);
                while chars
                    .peek()
                    .is_some_and(|next| !next.is_whitespace() && !matches!(next, '{' | '}' | '"'))
                {
                    if let Some(next) = chars.next() {
                        value.push(next);
                    }
                    if value.len() > MAX_VDF_TOKEN_BYTES {
                        return Err("Steam Workshop manifest token was too long.".to_string());
                    }
                }
                tokens.push(VdfToken::Text(value));
            }
        }
        if tokens.len() > MAX_VDF_TOKENS {
            return Err("Steam Workshop manifest exceeded the safe token limit.".to_string());
        }
    }
    Ok(tokens)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parser_reads_only_direct_installed_items_and_metadata() {
        let parsed = parse_workshop_manifest(
            r#"
            "AppWorkshop"
            {
                "appid" "620"
                "WorkshopItemsInstalled"
                {
                    "111" { "manifest" "1" "size" "10" "timeupdated" "20" }
                    "222" { "manifest" "2" }
                }
                "WorkshopItemDetails"
                {
                    "222" { "manifest" "22" "size" "30" "timetouched" "40" }
                    "999" { "manifest" "9" }
                }
            }
            "#,
        )
        .unwrap();
        assert_eq!(parsed.app_id, 620);
        assert_eq!(parsed.items.len(), 2);
        assert_eq!(parsed.items[0].published_file_id, 111);
        assert_eq!(parsed.items[0].manifest_id, Some(1));
        assert_eq!(parsed.items[0].declared_size_bytes, Some(10));
        assert_eq!(parsed.items[0].updated_at_unix, Some(20));
        assert_eq!(parsed.items[1].manifest_id, Some(2));
        assert_eq!(parsed.items[1].declared_size_bytes, Some(30));
        assert_eq!(parsed.items[1].updated_at_unix, Some(40));
    }

    #[test]
    fn game_manifest_parser_requires_direct_appid_and_install_dir() {
        assert_eq!(
            parse_game_app_manifest(r#""AppState" { "appid" "620" "installdir" "Portal 2" }"#)
                .unwrap(),
            (620, "Portal 2".to_string())
        );
        assert!(parse_game_app_manifest(
            r#""AppState" { "wrapper" { "appid" "620" } "installdir" "Portal 2" }"#
        )
        .is_err());
        assert!(parse_game_app_manifest(
            r#""AppState" { "appid" "620" "appid" "621" "installdir" "Portal 2" }"#
        )
        .is_err());
    }

    #[test]
    fn parser_rejects_duplicate_app_and_item_ids() {
        let duplicate_app =
            r#""AppWorkshop" { "appid" "620" "appid" "621" "WorkshopItemsInstalled" {} }"#;
        assert!(parse_workshop_manifest(duplicate_app).is_err());
        let duplicate_item =
            r#""AppWorkshop" { "appid" "620" "WorkshopItemsInstalled" { "1" {} "1" {} } }"#;
        assert!(parse_workshop_manifest(duplicate_item).is_err());
    }

    #[test]
    fn parser_rejects_nested_or_malformed_installed_sections() {
        let nested =
            r#""AppWorkshop" { "appid" "620" "wrapper" { "WorkshopItemsInstalled" { "1" {} } } }"#;
        assert!(parse_workshop_manifest(nested).is_err());
        let malformed = r#""AppWorkshop" { "appid" "620" "WorkshopItemsInstalled" { "-1" {} } }"#;
        assert!(parse_workshop_manifest(malformed).is_err());
    }

    #[test]
    fn parser_accepts_bom_comments_and_escaped_paths() {
        let parsed = parse_workshop_manifest(
            "\u{feff}// Steam state\n\"AppWorkshop\" { \"appid\" \"620\" \"WorkshopItemsInstalled\" {} }",
        )
        .unwrap();
        assert_eq!(parsed.app_id, 620);
        assert!(parsed.items.is_empty());
    }

    #[test]
    fn urls_use_official_handoffs_and_encode_search_text() {
        let browse =
            workshop_browse_url(620, "portal coop & maps", SteamWorkshopSort::Latest).unwrap();
        assert!(browse.starts_with("https://steamcommunity.com/workshop/browse/?"));
        assert!(browse.contains("appid=620"));
        assert!(browse.contains("searchtext=portal+coop+%26+maps"));
        assert!(browse.contains("browsesort=lastupdated"));
        assert_eq!(
            workshop_item_url(123).unwrap(),
            "https://steamcommunity.com/sharedfiles/filedetails/?id=123"
        );
        assert_eq!(
            workshop_item_steam_uri(123).unwrap(),
            "steam://url/CommunityFilePage/123"
        );
        assert!(workshop_item_url(0).is_err());
    }

    #[test]
    fn inspection_distinguishes_present_and_missing_content() {
        let tree = TempTree::new();
        let steamapps = tree.path.join("steamapps");
        let workshop = steamapps.join("workshop");
        fs::create_dir_all(workshop.join("content/620/111")).unwrap();
        fs::write(
            workshop.join("appworkshop_620.acf"),
            r#""AppWorkshop" { "appid" "620" "WorkshopItemsInstalled" { "111" { "manifest" "1" } "222" { "manifest" "2" } } }"#,
        )
        .unwrap();

        let result = inspect_manifest(620, &steamapps);
        assert_eq!(result.status, SteamWorkshopScanStatus::Ready);
        assert_eq!(result.items.len(), 2);
        assert_eq!(
            result.items[0].content_state,
            SteamWorkshopContentState::Present
        );
        assert_eq!(
            result.items[1].content_state,
            SteamWorkshopContentState::Missing
        );
    }

    #[test]
    fn inspection_reports_missing_oversized_and_mismatched_manifests() {
        let tree = TempTree::new();
        let steamapps = tree.path.join("steamapps");
        fs::create_dir_all(steamapps.join("workshop")).unwrap();
        assert_eq!(
            inspect_manifest(620, &steamapps).status,
            SteamWorkshopScanStatus::ManifestMissing
        );

        let manifest = steamapps.join("workshop/appworkshop_620.acf");
        fs::write(
            &manifest,
            r#""AppWorkshop" { "appid" "621" "WorkshopItemsInstalled" {} }"#,
        )
        .unwrap();
        assert_eq!(
            inspect_manifest(620, &steamapps).status,
            SteamWorkshopScanStatus::ManifestAppIdMismatch
        );

        fs::File::create(&manifest)
            .unwrap()
            .set_len(MAX_MANIFEST_BYTES + 1)
            .unwrap();
        assert_eq!(
            inspect_manifest(620, &steamapps).status,
            SteamWorkshopScanStatus::ManifestTooLarge
        );
    }

    #[test]
    fn game_inspection_accepts_only_a_registered_steam_library() {
        let tree = TempTree::new();
        let steam_root = tree.path.join("Steam");
        let game_path = steam_root.join("steamapps/common/Portal 2");
        fs::create_dir_all(&game_path).unwrap();
        fs::create_dir_all(steam_root.join("steamapps/workshop")).unwrap();
        fs::write(
            steam_root.join("steamapps/appmanifest_620.acf"),
            r#""AppState" { "appid" "620" "installdir" "Portal 2" }"#,
        )
        .unwrap();
        fs::write(
            steam_root.join("steamapps/workshop/appworkshop_620.acf"),
            r#""AppWorkshop" { "appid" "620" "WorkshopItemsInstalled" {} }"#,
        )
        .unwrap();
        let game = test_game("steam", Some("620"), Some(&game_path));
        assert_eq!(
            inspect_game_workshop_with_paths(&game, 620, &steam_root).status,
            SteamWorkshopScanStatus::Ready
        );

        fs::write(
            steam_root.join("steamapps/appmanifest_620.acf"),
            r#""AppState" { "appid" "621" "installdir" "Portal 2" }"#,
        )
        .unwrap();
        assert_eq!(
            inspect_game_workshop_with_paths(&game, 620, &steam_root).status,
            SteamWorkshopScanStatus::GameManifestMismatch
        );

        let outside = tree.path.join("NotSteam/steamapps/common/Portal 2");
        fs::create_dir_all(&outside).unwrap();
        let game = test_game("steam", Some("620"), Some(&outside));
        assert_eq!(
            inspect_game_workshop_with_paths(&game, 620, &steam_root).status,
            SteamWorkshopScanStatus::LibraryNotRegistered
        );
    }

    #[test]
    fn app_id_is_only_accepted_for_steam_games() {
        let mut game = test_game("steam", Some("620"), None);
        assert_eq!(steam_app_id(&game), Some(620));
        game.launcher = "manual".to_string();
        assert_eq!(steam_app_id(&game), None);
    }

    fn test_game(
        launcher: &str,
        external_id: Option<&str>,
        install_path: Option<&Path>,
    ) -> InstalledGame {
        serde_json::from_value(serde_json::json!({
            "id": "test",
            "title": "Portal 2",
            "slug": "portal-2",
            "description": "",
            "version": "",
            "launcher": launcher,
            "externalId": external_id,
            "coverUrl": null,
            "iconUrl": null,
            "iconUrls": [],
            "logoUrl": null,
            "logoUrls": [],
            "logoPosition": "bottomLeft",
            "status": "installed",
            "platform": "windows",
            "installPath": install_path.map(|path| path.to_string_lossy().to_string()),
            "achievements": [],
            "achievementProviderStatuses": [],
            "saveFiles": [],
            "friendsPlaying": []
        }))
        .unwrap()
    }

    struct TempTree {
        path: PathBuf,
    }

    impl TempTree {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "og-launcher-steam-workshop-test-{}",
                uuid::Uuid::new_v4()
            ));
            fs::create_dir_all(&path).unwrap();
            Self { path }
        }
    }

    impl Drop for TempTree {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }
}
