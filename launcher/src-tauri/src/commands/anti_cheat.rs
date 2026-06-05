use serde::Serialize;
use std::collections::HashSet;
use sysinfo::{ProcessesToUpdate, System};

#[derive(Serialize, Clone, Debug)]
pub struct AntiCheatDetection {
    pub name: String,
    pub blocks_overlay: bool,
    pub process_name: String,
}

const AC_SIGNATURES: &[(&str, &str, bool)] = &[
    // (display_name, process_substring, blocks_overlay)
    ("Riot Vanguard", "vgtray", true),
    ("Riot Vanguard", "vgc", true),
    ("FACEIT Anti-Cheat", "faceit", true),
    ("BattlEye", "beservice", false),
    ("BattlEye", "bedaisy", false),
    ("Easy Anti-Cheat", "easyanticheat", false),
    ("ESEA Anti-Cheat", "eseaclient", true),
    ("PunkBuster", "pnkbstr", false),
    ("Norton Anti-Cheat", "nortonac", false),
    ("XignCode", "xigncode", false),
    ("nProtect GameGuard", "gameguard", false),
    ("Arkos", "arkos", false),
    ("Mihoyo Protect", "mhyprot", true),
];

/// Scan running processes for known anti-cheat software.
#[tauri::command]
pub fn detect_anti_cheat_processes() -> Vec<AntiCheatDetection> {
    let mut s = System::new();
    s.refresh_processes(ProcessesToUpdate::All, true);

    let mut found = Vec::new();
    let mut seen_names = HashSet::new();

    for process in s.processes().values() {
        let name = process.name().to_string_lossy().to_lowercase();
        for (display, pattern, blocks) in AC_SIGNATURES {
            if name.contains(*pattern) && !seen_names.contains(*display) {
                seen_names.insert(display.to_string());
                found.push(AntiCheatDetection {
                    name: display.to_string(),
                    blocks_overlay: *blocks,
                    process_name: process.name().to_string_lossy().into_owned(),
                });
                break;
            }
        }
    }

    found
}

/// Quick check: is any overlay-blocking AC running?
#[tauri::command]
pub fn is_overlay_blocked_by_anti_cheat() -> bool {
    detect_anti_cheat_processes()
        .into_iter()
        .any(|ac| ac.blocks_overlay)
}
