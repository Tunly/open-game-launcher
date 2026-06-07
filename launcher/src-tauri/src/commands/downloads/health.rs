use std::path::PathBuf;

use serde::Serialize;

use crate::commands::downloads::steam_cef::steam_cef_targets;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProviderHealthStatus {
    pub provider: String,
    pub installed: bool,
    pub data_readable: bool,
    pub details: String,
    pub manifests_count: u32,
}

pub fn check_provider_health() -> Result<Vec<ProviderHealthStatus>, String> {
    let results = vec![
        check_steam_health(),
        check_epic_health(),
        check_ea_health(),
        check_battlenet_health(),
    ];

    Ok(results)
}

fn check_steam_health() -> ProviderHealthStatus {
    let steam_dir = crate::commands::games::detect::find_steam_dir();
    let Some(steam_dir) = steam_dir else {
        return ProviderHealthStatus {
            provider: "steam".to_string(),
            installed: false,
            data_readable: false,
            details: "Steam installation not found".to_string(),
            manifests_count: 0,
        };
    };

    let libraries = crate::commands::games::detect::read_steam_library_folders(&steam_dir);
    let mut folders = vec![steam_dir.clone()];
    folders.extend(libraries);

    let mut manifest_count = 0u32;
    for lib in &folders {
        let steamapps = lib.join("steamapps");
        if let Ok(entries) = std::fs::read_dir(&steamapps) {
            for entry in entries.flatten() {
                if let Some(name) = entry.path().file_name().and_then(|n| n.to_str()) {
                    if name.starts_with("appmanifest_") && name.ends_with(".acf") {
                        manifest_count += 1;
                    }
                }
            }
        }
    }

    let cef_reachable = steam_cef_targets().is_ok();
    let details = if cef_reachable {
        format!("{} manifests, CEF reachable", manifest_count)
    } else {
        format!("{} manifests, CEF not available", manifest_count)
    };

    ProviderHealthStatus {
        provider: "steam".to_string(),
        installed: true,
        data_readable: manifest_count > 0,
        details,
        manifests_count: manifest_count,
    }
}

fn check_epic_health() -> ProviderHealthStatus {
    let manifest_dir =
        PathBuf::from(r"C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests");
    if !manifest_dir.exists() {
        return ProviderHealthStatus {
            provider: "epic".to_string(),
            installed: false,
            data_readable: false,
            details: "Epic Games manifest directory not found".to_string(),
            manifests_count: 0,
        };
    }

    let mut count = 0u32;
    if let Ok(entries) = std::fs::read_dir(&manifest_dir) {
        for entry in entries.flatten() {
            if entry.path().extension().and_then(|e| e.to_str()) == Some("item") {
                count += 1;
            }
        }
    }

    ProviderHealthStatus {
        provider: "epic".to_string(),
        installed: true,
        data_readable: count > 0,
        details: format!("{} item manifests found", count),
        manifests_count: count,
    }
}

fn check_ea_health() -> ProviderHealthStatus {
    let games = crate::commands::games::detect::scan_ea_games();
    let count = games.len() as u32;

    ProviderHealthStatus {
        provider: "ea".to_string(),
        installed: count > 0,
        data_readable: count > 0,
        details: if count > 0 {
            format!("{} EA games detected via registry", count)
        } else {
            "No EA entries found in registry".to_string()
        },
        manifests_count: count,
    }
}

fn check_battlenet_health() -> ProviderHealthStatus {
    let games = crate::commands::games::detect::scan_battlenet_games();
    let count = games.len() as u32;

    ProviderHealthStatus {
        provider: "battlenet".to_string(),
        installed: count > 0,
        data_readable: count > 0,
        details: if count > 0 {
            format!("{} Battle.net games detected via registry", count)
        } else {
            "No Battle.net entries found in registry".to_string()
        },
        manifests_count: count,
    }
}
