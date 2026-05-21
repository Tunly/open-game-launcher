use serde::Serialize;
use std::{env, fs, path::PathBuf, process::Command};

const LAUNCHER_DIR: &str = "open-game-launcher";
const PRODUCT_DIR: &str = "Open Game Launcher";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    os: String,
    arch: String,
    app_version: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareInfo {
    cpu: Option<String>,
    gpu: Option<String>,
    ram: Option<String>,
    monitor: Option<String>,
    keyboard: Option<String>,
    mouse: Option<String>,
    headset: Option<String>,
    controller: Option<String>,
    source: String,
}

#[tauri::command]
pub fn get_system_info() -> SystemInfo {
    SystemInfo {
        os: env::consts::OS.to_string(),
        arch: env::consts::ARCH.to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

#[tauri::command]
pub fn get_default_install_dir() -> Result<String, String> {
    let path = match env::consts::OS {
        "windows" => dirs::data_dir()
            .or_else(dirs::home_dir)
            .map(|base| base.join(PRODUCT_DIR).join("games")),
        "macos" => dirs::home_dir().map(|home| {
            home.join("Library")
                .join("Application Support")
                .join(PRODUCT_DIR)
                .join("games")
        }),
        _ => linux_install_dir(),
    };

    path.map(path_to_string)
        .ok_or_else(|| "Could not resolve a default install directory.".to_string())
}

#[tauri::command]
pub fn get_hardware_info() -> HardwareInfo {
    match env::consts::OS {
        "windows" => windows_hardware_info(),
        "macos" => macos_hardware_info(),
        _ => linux_hardware_info(),
    }
}

fn linux_install_dir() -> Option<PathBuf> {
    dirs::home_dir()
        .map(|home| {
            home.join(".local")
                .join("share")
                .join(LAUNCHER_DIR)
                .join("games")
        })
        .or_else(|| dirs::data_dir().map(|base| base.join(LAUNCHER_DIR).join("games")))
}

fn path_to_string(path: PathBuf) -> String {
    path.to_string_lossy().into_owned()
}

fn windows_hardware_info() -> HardwareInfo {
    HardwareInfo {
        cpu: powershell_first_line(
            "(Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty Name).Trim()",
        ),
        gpu: powershell_first_line(
            "(Get-CimInstance Win32_VideoController | Where-Object {$_.Name} | Select-Object -First 1 -ExpandProperty Name).Trim()",
        ),
        ram: powershell_first_line(
            "$bytes=(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory; if($bytes){ '{0} GB' -f [math]::Round($bytes / 1GB) }",
        ),
        monitor: powershell_first_line(
            "$video=Get-CimInstance Win32_VideoController | Where-Object {$_.CurrentHorizontalResolution -and $_.CurrentVerticalResolution} | Select-Object -First 1; if($video){ '{0}x{1}' -f $video.CurrentHorizontalResolution,$video.CurrentVerticalResolution }",
        ),
        keyboard: powershell_first_line(
            "(Get-CimInstance Win32_Keyboard | Select-Object -First 1 -ExpandProperty Name).Trim()",
        ),
        mouse: powershell_first_line(
            "(Get-CimInstance Win32_PointingDevice | Select-Object -First 1 -ExpandProperty Name).Trim()",
        ),
        headset: powershell_first_line(
            "(Get-CimInstance Win32_SoundDevice | Where-Object {$_.Name -match 'headset|headphone|audio|sound'} | Select-Object -First 1 -ExpandProperty Name).Trim()",
        ),
        controller: powershell_first_line(
            "Get-PnpDevice -PresentOnly | Where-Object {$_.FriendlyName -match 'xbox|controller|gamepad|dualsense|dualshock'} | Select-Object -First 1 -ExpandProperty FriendlyName",
        ),
        source: "native".to_string(),
    }
}

fn linux_hardware_info() -> HardwareInfo {
    HardwareInfo {
        cpu: linux_cpu_name(),
        gpu: shell_first_line("lspci 2>/dev/null | grep -Ei 'vga|3d|display' | head -n 1"),
        ram: linux_ram_size(),
        monitor: shell_first_line("xrandr --current 2>/dev/null | awk '/ connected primary/{print $3; exit} / connected/{print $3; exit}' | cut -d+ -f1"),
        keyboard: linux_input_device("keyboard"),
        mouse: linux_input_device("mouse"),
        headset: linux_input_device("headset").or_else(|| linux_input_device("headphone")),
        controller: linux_input_device("gamepad").or_else(|| linux_input_device("controller")),
        source: "native".to_string(),
    }
}

fn macos_hardware_info() -> HardwareInfo {
    HardwareInfo {
        cpu: command_first_line("sysctl", &["-n", "machdep.cpu.brand_string"]),
        gpu: shell_first_line("system_profiler SPDisplaysDataType 2>/dev/null | awk -F': ' '/Chipset Model/{print $2; exit}'"),
        ram: macos_ram_size(),
        monitor: shell_first_line("system_profiler SPDisplaysDataType 2>/dev/null | awk -F': ' '/Resolution/{print $2; exit}'"),
        keyboard: None,
        mouse: None,
        headset: None,
        controller: None,
        source: "native".to_string(),
    }
}

fn linux_cpu_name() -> Option<String> {
    fs::read_to_string("/proc/cpuinfo")
        .ok()
        .and_then(|content| {
            content.lines().find_map(|line| {
                line.strip_prefix("model name")
                    .and_then(|value| value.split_once(':'))
                    .and_then(|(_, name)| clean_line(name))
            })
        })
}

fn linux_ram_size() -> Option<String> {
    fs::read_to_string("/proc/meminfo")
        .ok()
        .and_then(|content| {
            content.lines().find_map(|line| {
                line.strip_prefix("MemTotal:").and_then(|value| {
                    let kb = value.split_whitespace().next()?.parse::<u64>().ok()?;
                    Some(format!(
                        "{} GB",
                        ((kb as f64 / 1024.0 / 1024.0).round()) as u64
                    ))
                })
            })
        })
}

fn macos_ram_size() -> Option<String> {
    command_first_line("sysctl", &["-n", "hw.memsize"]).and_then(|bytes| {
        let bytes = bytes.parse::<u64>().ok()?;
        Some(format!(
            "{} GB",
            ((bytes as f64 / 1024.0 / 1024.0 / 1024.0).round()) as u64
        ))
    })
}

fn linux_input_device(pattern: &str) -> Option<String> {
    fs::read_to_string("/proc/bus/input/devices")
        .ok()
        .and_then(|content| {
            content.lines().find_map(|line| {
                let name = line.strip_prefix("N: Name=\"")?.trim_end_matches('"');
                if name.to_lowercase().contains(pattern) {
                    clean_line(name)
                } else {
                    None
                }
            })
        })
}

fn powershell_first_line(script: &str) -> Option<String> {
    command_first_line(
        "powershell",
        &[
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ],
    )
}

fn shell_first_line(script: &str) -> Option<String> {
    command_first_line("sh", &["-c", script])
}

fn command_first_line(program: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(program).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }

    String::from_utf8(output.stdout)
        .ok()
        .and_then(|stdout| stdout.lines().find_map(clean_line))
}

fn clean_line(value: &str) -> Option<String> {
    let cleaned = value.trim().trim_matches('"').trim().to_string();
    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned)
    }
}
