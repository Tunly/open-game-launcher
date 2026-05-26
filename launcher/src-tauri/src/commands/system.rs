use serde::Serialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    env, fs,
    io::{Read, Write},
    net::TcpListener,
    path::{Path, PathBuf},
    process::Command,
    thread,
};
use tauri::Manager;

const LAUNCHER_DIR: &str = "open-game-launcher";
const PRODUCT_DIR: &str = "Open Game Launcher";
const STEAM_ID64_BASE: u64 = 76_561_197_960_265_728;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    os: String,
    arch: String,
    app_version: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo {
    name: String,
    mount_point: String,
    total_space: u64,
    available_space: u64,
    file_system: String,
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

#[tauri::command]
pub fn get_disk_info() -> Vec<DiskInfo> {
    use sysinfo::Disks;
    let disks = Disks::new_with_refreshed_list();
    disks
        .iter()
        .map(|disk| DiskInfo {
            name: disk.name().to_string_lossy().into_owned(),
            mount_point: disk.mount_point().to_string_lossy().into_owned(),
            total_space: disk.total_space(),
            available_space: disk.available_space(),
            file_system: disk.file_system().to_string_lossy().into_owned(),
        })
        .collect()
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

fn open_uri(uri: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", uri])
            .spawn()
            .map_err(|e| format!("Failed to open browser: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(uri)
            .spawn()
            .map_err(|e| format!("Failed to open browser: {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(uri)
            .spawn()
            .map_err(|e| format!("Failed to open browser: {e}"))?;
    }
    Ok(())
}

fn start_local_callback_server(app: tauri::AppHandle) {
    thread::spawn(move || {
        let listener = match TcpListener::bind("127.0.0.1:18234") {
            Ok(l) => l,
            Err(e) => {
                println!("[Steam Login] Failed to bind local server: {e}");
                return;
            }
        };

        println!("[Steam Login] Local callback server listening on 127.0.0.1:18234");

        for stream in listener.incoming() {
            let mut stream = match stream {
                Ok(s) => s,
                Err(_) => continue,
            };

            let mut buffer = Vec::new();
            let mut temp_buf = [0u8; 4096];

            // Read headers first
            let mut headers_end = None;
            loop {
                let bytes_read = match stream.read(&mut temp_buf) {
                    Ok(0) => break,
                    Ok(n) => n,
                    Err(_) => break,
                };
                buffer.extend_from_slice(&temp_buf[..bytes_read]);

                // Find \r\n\r\n
                if let Some(pos) = buffer.windows(4).position(|w| w == b"\r\n\r\n") {
                    headers_end = Some(pos);
                    break;
                }
                if buffer.len() > 16384 {
                    break;
                }
            }

            let Some(h_end) = headers_end else {
                continue;
            };

            let headers_str = String::from_utf8_lossy(&buffer[..h_end]).into_owned();

            // Handle CORS preflight request (OPTIONS)
            if headers_str.starts_with("OPTIONS ") {
                let response = "HTTP/1.1 200 OK\r\n\
                                Access-Control-Allow-Origin: *\r\n\
                                Access-Control-Allow-Methods: POST, GET, OPTIONS\r\n\
                                Access-Control-Allow-Headers: content-type\r\n\
                                Connection: close\r\n\
                                Content-Length: 0\r\n\r\n";
                let _ = stream.write_all(response.as_bytes());
                continue;
            }

            // Extract Content-Length for POST requests
            let mut content_length = 0usize;
            for line in headers_str.lines() {
                if line.to_lowercase().starts_with("content-length:") {
                    if let Some(val) = line.split(':').nth(1) {
                        content_length = val.trim().parse().unwrap_or(0);
                    }
                }
            }

            // Read the remaining body bytes
            let body_start = h_end + 4;
            while buffer.len() < body_start + content_length {
                let mut chunk = [0u8; 4096];
                let bytes_read = match stream.read(&mut chunk) {
                    Ok(0) => break,
                    Ok(n) => n,
                    Err(_) => break,
                };
                buffer.extend_from_slice(&chunk[..bytes_read]);
            }

            let body_str =
                String::from_utf8_lossy(&buffer[body_start..body_start + content_length]);

            // CASE 1: POST /scraped (scraped games list from WebView)
            if headers_str.starts_with("POST /scraped") {
                if let Ok(parsed_data) = serde_json::from_str::<serde_json::Value>(&body_str) {
                    use tauri::Emitter;

                    if let Some(games_array) = parsed_data.get("games") {
                        if games_array.as_array().map_or(0, |a| a.len()) > 0 {
                            println!(
                                "[Steam Scraper] Received {} owned games from Webview!",
                                games_array.as_array().unwrap().len()
                            );
                            let _ = app.emit("steam_scraped_games_success", games_array.clone());

                            // Close both standard login window and silent scraper if present
                            if let Some(login_window) = app.get_webview_window("steam-login") {
                                let _ = login_window.close();
                            }
                            if let Some(scraper_window) =
                                app.get_webview_window("steam-silent-scraper")
                            {
                                let _ = scraper_window.close();
                            }
                        }
                    } else if let Some(is_private) =
                        parsed_data.get("isPrivate").and_then(|v| v.as_bool())
                    {
                        if is_private {
                            println!("[Steam Scraper] Scraper reported profile or game details are private.");
                            let _ = app.emit(
                                "steam_scraped_games_error",
                                "Steam profile or game details are private.".to_string(),
                            );

                            if let Some(login_window) = app.get_webview_window("steam-login") {
                                let _ = login_window.close();
                            }
                            if let Some(scraper_window) =
                                app.get_webview_window("steam-silent-scraper")
                            {
                                let _ = scraper_window.close();
                            }
                        }
                    }
                }

                let response = "HTTP/1.1 200 OK\r\n\
                                Access-Control-Allow-Origin: *\r\n\
                                Connection: close\r\n\
                                Content-Length: 0\r\n\r\n";
                let _ = stream.write_all(response.as_bytes());
                continue;
            }

            // CASE 2: GET / (OpenID Login Redirect)
            let mut steam_id = None;
            if let Some(pos) = headers_str.find("openid%2Fid%2F") {
                let start_idx = pos + "openid%2Fid%2F".len();
                if headers_str.len() >= start_idx + 17 {
                    steam_id = Some(&headers_str[start_idx..start_idx + 17]);
                }
            } else if let Some(pos) = headers_str.find("openid%2fid%2f") {
                let start_idx = pos + "openid%2fid%2f".len();
                if headers_str.len() >= start_idx + 17 {
                    steam_id = Some(&headers_str[start_idx..start_idx + 17]);
                }
            } else if let Some(pos) = headers_str.find("openid/id/") {
                let start_idx = pos + "openid/id/".len();
                if headers_str.len() >= start_idx + 17 {
                    steam_id = Some(&headers_str[start_idx..start_idx + 17]);
                }
            }

            if let Some(sid) = steam_id {
                if sid.chars().all(|c| c.is_ascii_digit()) {
                    println!("[Steam Login] Extracted SteamID64: {}", sid);

                    use tauri::Emitter;
                    let _ = app.emit("steam_login_success", sid.to_string());

                    // Respond with a page that immediately redirects to their games list.
                    // Since they just logged in inside the Webview, cookies are fully active!
                    let redirect_html = format!(
                        r#"
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <meta charset="utf-8">
                            <title>OG Launcher - Redirecting...</title>
                            <style>
                                body {{
                                    font-family: system-ui, -apple-system, sans-serif;
                                    background-color: #fbf4e7;
                                    color: #171411;
                                    text-align: center;
                                    padding: 50px;
                                    margin: 0;
                                }}
                                .container {{
                                    max-width: 500px;
                                    margin: 80px auto;
                                    border: 4px solid #000;
                                    background-color: #efe6d4;
                                    padding: 40px 30px;
                                    box-shadow: 6px 6px 0px #000;
                                }}
                                h1 {{
                                    font-weight: 900;
                                    text-transform: uppercase;
                                    margin-bottom: 20px;
                                    font-size: 24px;
                                    letter-spacing: -0.02em;
                                }}
                                p {{ font-weight: bold; font-size: 14px; color: #55504a; }}
                            </style>
                        </head>
                        <body>
                            <div class="container">
                                <h1>Login successful!</h1>
                                <p>Your Steam game list is loading...</p>
                            </div>
                            <script>
                                window.location.href = "https://steamcommunity.com/profiles/{}/games/?tab=all";
                            </script>
                        </body>
                        </html>
                    "#,
                        sid
                    );

                    let response = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        redirect_html.len(),
                        redirect_html
                    );

                    let _ = stream.write_all(response.as_bytes());
                    let _ = stream.flush();
                    continue;
                }
            }

            let response_body =
                "HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
            let _ = stream.write_all(response_body.as_bytes());
        }
    });
}

fn steam_scraper_script() -> &'static str {
    r#"
        (function() {
            console.log("[Steam Scraper] Active!");

            function appIdFromValue(value) {
                if (!value) return "";
                const match = String(value).match(/(?:app\/|appid[=:]|^)(\d{2,})/i);
                return match ? match[1] : "";
            }

            function cleanTitle(value) {
                return String(value || "")
                    .replace(/\s+/g, " ")
                    .replace(/\bView Store Page\b/gi, "")
                    .trim();
            }

            function pushGame(map, appid, title, playtimeHours) {
                appid = appIdFromValue(appid);
                title = cleanTitle(title);
                if (!appid || !title || map.has(appid)) return;
                map.set(appid, {
                    appid,
                    name: title,
                    hours_forever: playtimeHours || "0"
                });
            }

            function collectFromGlobals(map) {
                const sources = [window.rgGames, window.g_rgGames, window.g_rgGameList];
                for (const source of sources) {
                    if (!Array.isArray(source)) continue;
                    for (const game of source) {
                        pushGame(
                            map,
                            game && (game.appid || game.app_id || game.id),
                            game && (game.name || game.title),
                            game && (game.hours_forever || game.hours || game.playtime_forever)
                        );
                    }
                }
            }

            function collectFromDom(map) {
                const rows = document.querySelectorAll(
                    '[data-ds-appid], [data-appid], a[href*="/app/"], .gameListRow'
                );

                rows.forEach((row) => {
                    const hrefNode = row.matches && row.matches('a[href*="/app/"]')
                        ? row
                        : row.querySelector && row.querySelector('a[href*="/app/"]');
                    const appid =
                        row.getAttribute && (
                            row.getAttribute('data-ds-appid') ||
                            row.getAttribute('data-appid')
                        ) ||
                        (hrefNode && hrefNode.getAttribute('href')) ||
                        "";
                    const titleNode =
                        row.querySelector && (
                            row.querySelector('.gameListRowItemName') ||
                            row.querySelector('.gameListRowLogo img') ||
                            row.querySelector('img[alt]') ||
                            row.querySelector('[title]')
                        );
                    const title =
                        (titleNode && (
                            titleNode.getAttribute('alt') ||
                            titleNode.getAttribute('title') ||
                            titleNode.textContent
                        )) ||
                        row.getAttribute && (
                            row.getAttribute('aria-label') ||
                            row.getAttribute('title')
                        ) ||
                        row.textContent ||
                        "";
                    pushGame(map, appid, title, "0");
                });
            }

            function collectFromScripts(map) {
                const text = Array.from(document.scripts)
                    .map((script) => script.textContent || "")
                    .join("\n");
                const match = text.match(/(?:var\s+)?(?:rgGames|g_rgGames)\s*=\s*(\[[\s\S]*?\]);/);
                if (!match) return;

                try {
                    const games = JSON.parse(match[1]);
                    if (Array.isArray(games)) {
                        for (const game of games) {
                            pushGame(
                                map,
                                game && (game.appid || game.app_id || game.id),
                                game && (game.name || game.title),
                                game && (game.hours_forever || game.hours || game.playtime_forever)
                            );
                        }
                    }
                } catch (error) {
                    console.warn("[Steam Scraper] Failed to parse script game list", error);
                }
            }

            function post(payload) {
                if (window.__ogSteamScraperPosted) return;
                window.__ogSteamScraperPosted = true;
                fetch("http://127.0.0.1:18234/scraped", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                }).catch((error) => {
                    window.__ogSteamScraperPosted = false;
                    console.error("[Steam Scraper] Fetch error:", error);
                });
            }

            function tryScrape() {
                const url = window.location.href;
                if (!url.includes("steamcommunity.com/profiles/") && !url.includes("steamcommunity.com/id/")) {
                    return;
                }
                if (!url.includes("/games")) {
                    return;
                }

                const map = new Map();
                collectFromGlobals(map);
                collectFromScripts(map);
                collectFromDom(map);

                const games = Array.from(map.values());
                const bodyText = document.body ? document.body.innerText || document.body.innerHTML : "";
                const isPrivate =
                    bodyText.includes("This profile is private") ||
                    bodyText.includes("Game details are private") ||
                    bodyText.includes("profile_private_info") ||
                    document.title.includes("Sign In");

                if (games.length > 0) {
                    console.log("[Steam Scraper] Found games: " + games.length + ", posting to backend...");
                    post({ games });
                } else if (isPrivate) {
                    console.log("[Steam Scraper] Profile is private or requires login, reporting to backend...");
                    post({ isPrivate: true });
                }
            }

            window.addEventListener("DOMContentLoaded", tryScrape);
            window.addEventListener("load", tryScrape);
            setInterval(tryScrape, 1500);
        })();
    "#
}

#[tauri::command]
pub async fn open_steam_login_window(app: tauri::AppHandle) -> Result<(), String> {
    start_local_callback_server(app.clone());

    let url = "https://steamcommunity.com/openid/login?openid.ns=http://specs.openid.net/auth/2.0&openid.mode=checkid_setup&openid.return_to=http://localhost:18234/&openid.realm=http://localhost:18234/&openid.identity=http://specs.openid.net/auth/2.0/identifier_select&openid.claimed_id=http://specs.openid.net/auth/2.0/identifier_select";

    // Create a native Tauri window for logging in, sharing cookies
    let _window = tauri::WebviewWindowBuilder::new(
        &app,
        "steam-login",
        tauri::WebviewUrl::External(
            url.parse()
                .map_err(|e| format!("Failed to parse login URL: {e}"))?,
        ),
    )
    .title("Steam Login")
    .inner_size(800.0, 600.0)
    .center()
    .resizable(true)
    .initialization_script(steam_scraper_script())
    .build()
    .map_err(|e| format!("Failed to create login window: {e}"))?;

    Ok(())
}

#[tauri::command]
pub async fn open_steam_scraper_window(
    app: tauri::AppHandle,
    steam_id: String,
) -> Result<(), String> {
    let steam_id = steam_id.trim();
    if steam_id.is_empty() || !steam_id.chars().all(|c| c.is_ascii_digit()) {
        return Err("SteamID64 ist ungueltig.".to_string());
    }

    start_local_callback_server(app.clone());

    if let Some(existing_window) = app.get_webview_window("steam-silent-scraper") {
        let _ = existing_window.close();
    }

    let url = format!("https://steamcommunity.com/profiles/{steam_id}/games/?tab=all");
    let _window = tauri::WebviewWindowBuilder::new(
        &app,
        "steam-silent-scraper",
        tauri::WebviewUrl::External(
            url.parse()
                .map_err(|e| format!("Failed to parse Steam games URL: {e}"))?,
        ),
    )
    .title("Steam Library Sync")
    .inner_size(900.0, 700.0)
    .visible(false)
    .initialization_script(steam_scraper_script())
    .build()
    .map_err(|e| format!("Failed to create Steam sync window: {e}"))?;

    Ok(())
}

fn start_gog_callback_server(app: tauri::AppHandle) {
    thread::spawn(move || {
        let listener = match TcpListener::bind("127.0.0.1:18235") {
            Ok(l) => l,
            Err(e) => {
                println!("[GOG Login] Failed to bind local server: {e}");
                return;
            }
        };

        println!("[GOG Login] Local callback server listening on 127.0.0.1:18235");

        for stream in listener.incoming() {
            let mut stream = match stream {
                Ok(s) => s,
                Err(_) => continue,
            };

            let mut buffer = [0; 4096];
            let bytes_read = match stream.read(&mut buffer) {
                Ok(n) => n,
                Err(_) => continue,
            };

            let request = String::from_utf8_lossy(&buffer[..bytes_read]);

            if request.contains("code=") {
                if let Some(pos) = request.find("code=") {
                    let start_idx = pos + "code=".len();
                    let rest = &request[start_idx..];
                    let code = rest
                        .split(|c| c == ' ' || c == '&' || c == '\r' || c == '\n')
                        .next()
                        .unwrap_or("");
                    if !code.is_empty() {
                        println!("[GOG Login] Extracted GOG Code: {}", code);

                        use tauri::Emitter;
                        let _ = app.emit("gog_login_code", code.to_string());

                        let response_body = r#"
                                <!DOCTYPE html>
                                <html>
                                <head>
                                    <meta charset="utf-8">
                                    <title>OG Launcher - GOG Login Successful</title>
                                    <style>
                                        body {
                                            font-family: system-ui, -apple-system, sans-serif;
                                            background-color: #fbf4e7;
                                            color: #171411;
                                            text-align: center;
                                            padding: 50px;
                                            margin: 0;
                                        }
                                        .container {
                                            max-width: 500px;
                                            margin: 80px auto;
                                            border: 4px solid #000;
                                            background-color: #efe6d4;
                                            padding: 40px 30px;
                                            box-shadow: 6px 6px 0px #000;
                                        }
                                        h1 {
                                            font-weight: 900;
                                            text-transform: uppercase;
                                            margin-bottom: 20px;
                                            font-size: 28px;
                                            letter-spacing: -0.02em;
                                        }
                                        p { font-weight: bold; font-size: 16px; line-height: 1.5; color: #55504a; }
                                        .success-icon {
                                            font-size: 48px;
                                            color: #087d6d;
                                            margin-bottom: 20px;
                                        }
                                    </style>
                                </head>
                                <body>
                                    <div class="container">
                                        <div class="success-icon">OK</div>
                                        <h1>GOG Login Successful!</h1>
                                        <p>Your GOG integration was successful. You can close this tab now and return to the Open Game Launcher.</p>
                                    </div>
                                </body>
                                </html>
                            "#;

                        let response = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            response_body.len(),
                            response_body
                        );

                        let _ = stream.write_all(response.as_bytes());
                        let _ = stream.flush();
                        break;
                    }
                }
            }

            let response_body =
                "HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
            let _ = stream.write_all(response_body.as_bytes());
        }
    });
}

#[tauri::command]
pub async fn open_gog_login_window(app: tauri::AppHandle) -> Result<(), String> {
    start_gog_callback_server(app);

    let url = "https://auth.gog.com/auth?client_id=46899977096215655&redirect_uri=http://127.0.0.1:18235/&response_type=code&layout=client2";
    open_uri(url)?;

    Ok(())
}

#[tauri::command]
pub async fn open_epic_login_window() -> Result<(), String> {
    let url = "https://www.epicgames.com/id/login?redirectUrl=https%3A%2F%2Fwww.epicgames.com%2Fid%2Fapi%2Fredirect%3FclientId%3D34a02cf8f4414e29b1598528fb346245%26responseType%3Dcode";
    open_uri(url)?;

    Ok(())
}

// =====================================================================
// FETCH OWNED GAMES (backend HTTP to bypass CORS)
// =====================================================================

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OwnedGame {
    pub id: String,
    pub title: String,
    pub description: String,
    pub cover_url: Option<String>,
    pub logo_url: Option<String>,
    pub icon_url: Option<String>,
    pub playtime_minutes: u64,
}

fn fetch_local_steam_owned_games(steam_id: &str) -> Vec<OwnedGame> {
    let Some(steam_dir) = find_steam_dir() else {
        println!("[Steam] Local Steam install was not found.");
        return Vec::new();
    };

    let Some(account_id) = steam_account_id_from_id64(steam_id) else {
        println!("[Steam] Could not map SteamID64 '{steam_id}' to a local account id.");
        return Vec::new();
    };

    let account_config_dir = steam_dir.join("userdata").join(&account_id).join("config");
    if !account_config_dir.exists() {
        println!(
            "[Steam] Local Steam userdata was not found for SteamID64 '{steam_id}' (account id {account_id})."
        );
        return Vec::new();
    }

    let mut app_ids = collect_account_steam_app_ids(&account_config_dir);
    app_ids.extend(collect_steam_library_asset_app_ids(&steam_dir));

    if app_ids.is_empty() {
        println!("[Steam] Local Steam cache did not contain any app ids.");
        return Vec::new();
    }

    let titles = read_steam_appinfo_game_titles(&steam_dir);
    if titles.is_empty() {
        println!("[Steam] Local Steam appinfo cache did not contain game titles.");
        return Vec::new();
    }

    let playtimes = read_steam_playtime_minutes(&account_config_dir);
    let mut games = Vec::new();

    for app_id in app_ids {
        let Some(title) = titles.get(&app_id) else {
            continue;
        };

        games.push(OwnedGame {
            id: format!("steam-owned-{app_id}"),
            title: title.clone(),
            description: format!("Steam game (Owned). AppID: {app_id}"),
            cover_url: find_steam_cached_asset(
                &steam_dir,
                &app_id,
                &["library_hero.jpg", "library_header.jpg", "header.jpg"],
            )
            .or_else(|| {
                Some(format!(
                    "https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/library_hero.jpg"
                ))
            }),
            logo_url: find_steam_cached_asset(
                &steam_dir,
                &app_id,
                &[
                    "logo.png",
                    "library_logo.png",
                    "library_header.jpg",
                    "header.jpg",
                ],
            )
            .or_else(|| {
                Some(format!(
                    "https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/header.jpg"
                ))
            }),
            icon_url: find_steam_cached_asset(
                &steam_dir,
                &app_id,
                &["header.jpg", "library_header.jpg"],
            ),
            playtime_minutes: playtimes.get(&app_id).copied().unwrap_or_default(),
        });
    }

    games.sort_by(|a, b| {
        a.title
            .to_lowercase()
            .cmp(&b.title.to_lowercase())
            .then_with(|| a.id.cmp(&b.id))
    });

    games
}

fn steam_account_id_from_id64(steam_id: &str) -> Option<String> {
    let id64 = steam_id.trim().parse::<u64>().ok()?;
    id64.checked_sub(STEAM_ID64_BASE)
        .map(|account_id| account_id.to_string())
}

fn find_steam_dir() -> Option<PathBuf> {
    let mut candidates = Vec::new();

    if cfg!(target_os = "windows") {
        if let Some(program_files_x86) = env_path("ProgramFiles(x86)") {
            candidates.push(program_files_x86.join("Steam"));
        }

        if let Some(program_files) = env_path("ProgramFiles") {
            candidates.push(program_files.join("Steam"));
        }

        candidates.push(PathBuf::from(r"C:\Steam"));
    } else if let Some(home) = env_path("HOME") {
        candidates.push(home.join(".local/share/Steam"));
        candidates.push(home.join(".steam/steam"));
        candidates.push(home.join(".steam/root"));
        candidates.push(home.join(".var/app/com.valvesoftware.Steam/.local/share/Steam"));
        candidates.push(home.join(".var/app/com.valvesoftware.Steam/data/Steam"));
        candidates.push(home.join("Library/Application Support/Steam"));
    }

    candidates.into_iter().find(|candidate| candidate.exists())
}

fn env_path(key: &str) -> Option<PathBuf> {
    env::var_os(key).map(PathBuf::from)
}

fn collect_account_steam_app_ids(account_config_dir: &Path) -> BTreeSet<String> {
    let mut app_ids = BTreeSet::new();

    let library_cache_dir = account_config_dir.join("librarycache");
    if let Ok(entries) = fs::read_dir(library_cache_dir) {
        for entry in entries.filter_map(|entry| entry.ok()) {
            let path = entry.path();
            if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
                continue;
            }

            let Some(stem) = path.file_stem().and_then(|stem| stem.to_str()) else {
                continue;
            };

            if is_numeric_steam_app_id(stem) {
                app_ids.insert(stem.to_string());
            }
        }
    }

    let localconfig = account_config_dir.join("localconfig.vdf");
    if let Ok(contents) = fs::read_to_string(localconfig) {
        app_ids.extend(collect_vdf_block_keys(&contents, "apps"));
        app_ids.extend(collect_vdf_block_keys(&contents, "apptickets"));
    }

    app_ids
}

fn collect_steam_library_asset_app_ids(steam_dir: &Path) -> BTreeSet<String> {
    let mut app_ids = BTreeSet::new();
    let library_cache_dir = steam_dir.join("appcache").join("librarycache");

    let Ok(entries) = fs::read_dir(library_cache_dir) else {
        return app_ids;
    };

    for entry in entries.filter_map(|entry| entry.ok()) {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        if !file_type.is_dir() {
            continue;
        }

        let Some(name) = entry.file_name().to_str().map(|name| name.to_string()) else {
            continue;
        };

        if is_numeric_steam_app_id(&name) {
            app_ids.insert(name);
        }
    }

    app_ids
}

fn read_steam_appinfo_game_titles(steam_dir: &Path) -> BTreeMap<String, String> {
    let appinfo_path = steam_dir.join("appcache").join("appinfo.vdf");
    let Ok(contents) = fs::read(appinfo_path) else {
        return BTreeMap::new();
    };

    let mut titles = BTreeMap::new();
    let mut position = 16usize;

    while position + 8 <= contents.len() {
        let Some(app_id) = read_u32_le(&contents, position) else {
            break;
        };
        let Some(record_size) = read_u32_le(&contents, position + 4).map(|size| size as usize)
        else {
            break;
        };

        if app_id == 0 || record_size == 0 {
            break;
        }

        let record_start = position + 8;
        let record_end = record_start.saturating_add(record_size);
        if record_end > contents.len() {
            break;
        }

        let record = &contents[record_start..record_end];
        let title = extract_appinfo_string_field(record, 4);
        let product_type = extract_appinfo_string_field(record, 5);

        if let (Some(title), Some(product_type)) = (title, product_type) {
            if product_type.eq_ignore_ascii_case("game") && is_valid_steam_title(&title) {
                titles.insert(app_id.to_string(), title);
            }
        }

        position = record_end;
    }

    titles
}

fn read_u32_le(bytes: &[u8], position: usize) -> Option<u32> {
    let slice = bytes.get(position..position + 4)?;
    Some(u32::from_le_bytes(slice.try_into().ok()?))
}

fn extract_appinfo_string_field(record: &[u8], key: u32) -> Option<String> {
    let needle = [
        1,
        (key & 0xff) as u8,
        ((key >> 8) & 0xff) as u8,
        ((key >> 16) & 0xff) as u8,
        ((key >> 24) & 0xff) as u8,
    ];

    let index = find_bytes(record, &needle)?;
    let value_start = index + needle.len();
    let value_end = record[value_start..]
        .iter()
        .position(|byte| *byte == 0)
        .map(|relative| value_start + relative)?;

    let value = String::from_utf8_lossy(&record[value_start..value_end])
        .trim()
        .to_string();

    (!value.is_empty()).then_some(value)
}

fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn is_valid_steam_title(title: &str) -> bool {
    let title = title.trim();
    !title.is_empty()
        && title.len() <= 180
        && !title.contains('\u{fffd}')
        && !title.chars().any(|character| {
            character.is_control() && character != '\t' && character != '\n' && character != '\r'
        })
}

fn find_steam_cached_asset(steam_dir: &Path, app_id: &str, filenames: &[&str]) -> Option<String> {
    let app_cache_dir = steam_dir.join("appcache").join("librarycache").join(app_id);

    for filename in filenames {
        let path = app_cache_dir.join(filename);
        if path.is_file() {
            return Some(path_to_string(path));
        }
    }

    let entries = fs::read_dir(app_cache_dir).ok()?;
    for entry in entries.filter_map(|entry| entry.ok()) {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        if !file_type.is_dir() {
            continue;
        }

        for filename in filenames {
            let path = entry.path().join(filename);
            if path.is_file() {
                return Some(path_to_string(path));
            }
        }
    }

    None
}

fn read_steam_playtime_minutes(account_config_dir: &Path) -> BTreeMap<String, u64> {
    let localconfig = account_config_dir.join("localconfig.vdf");
    let Ok(contents) = fs::read_to_string(localconfig) else {
        return BTreeMap::new();
    };

    let mut playtimes = BTreeMap::new();
    let lines: Vec<&str> = contents.lines().collect();
    let Some(apps_section_start) = find_vdf_section_open_line(&lines, "apps") else {
        return playtimes;
    };

    let mut depth = 0usize;
    let mut current_app_id: Option<String> = None;

    for line in lines.iter().skip(apps_section_start) {
        let trimmed = line.trim();
        match trimmed {
            "{" => {
                depth += 1;
                continue;
            }
            "}" => {
                if depth == 2 {
                    current_app_id = None;
                }

                if depth == 0 {
                    break;
                }

                depth -= 1;
                if depth == 0 {
                    break;
                }
                continue;
            }
            _ => {}
        }

        if depth == 1 {
            if let Some(app_id) = quoted_vdf_key(trimmed) {
                if is_numeric_steam_app_id(&app_id) {
                    current_app_id = Some(app_id);
                }
            }
            continue;
        }

        if depth == 2 {
            let Some(app_id) = current_app_id.as_ref() else {
                continue;
            };

            if let Some((key, value)) = parse_vdf_key_value(trimmed) {
                if key == "Playtime" {
                    if let Ok(minutes) = value.parse::<u64>() {
                        playtimes.insert(app_id.clone(), minutes);
                    }
                }
            }
        }
    }

    playtimes
}

fn collect_vdf_block_keys(contents: &str, section_name: &str) -> BTreeSet<String> {
    let lines: Vec<&str> = contents.lines().collect();
    let Some(section_open_line) = find_vdf_section_open_line(&lines, section_name) else {
        return BTreeSet::new();
    };

    let mut keys = BTreeSet::new();
    let mut depth = 0usize;

    for line in lines.iter().skip(section_open_line) {
        let trimmed = line.trim();
        match trimmed {
            "{" => {
                depth += 1;
                continue;
            }
            "}" => {
                if depth == 0 {
                    break;
                }

                depth -= 1;
                if depth == 0 {
                    break;
                }
                continue;
            }
            _ => {}
        }

        if depth == 1 {
            if let Some(key) = quoted_vdf_key(trimmed) {
                if is_numeric_steam_app_id(&key) {
                    keys.insert(key);
                }
            }
        }
    }

    keys
}

fn find_vdf_section_open_line(lines: &[&str], section_name: &str) -> Option<usize> {
    for (index, line) in lines.iter().enumerate() {
        if quoted_vdf_key(line).as_deref() != Some(section_name) {
            continue;
        }

        let open_index = next_non_empty_line(lines, index + 1)?;
        if lines[open_index].trim() == "{" {
            return Some(open_index);
        }
    }

    None
}

fn next_non_empty_line(lines: &[&str], start: usize) -> Option<usize> {
    lines
        .iter()
        .enumerate()
        .skip(start)
        .find(|(_, line)| {
            let trimmed = line.trim();
            !trimmed.is_empty() && !trimmed.starts_with("//")
        })
        .map(|(index, _)| index)
}

fn quoted_vdf_key(line: &str) -> Option<String> {
    let trimmed = line.trim();
    let end_quote = trimmed.strip_prefix('"')?.find('"')?;
    Some(trimmed[1..end_quote + 1].to_string())
}

fn parse_vdf_key_value(line: &str) -> Option<(String, String)> {
    let trimmed = line.trim();
    let key_end = trimmed.strip_prefix('"')?.find('"')? + 1;
    let key = trimmed[1..key_end].to_string();
    let value_start = trimmed[key_end + 1..].find('"')? + key_end + 2;
    let value_end = trimmed[value_start..].find('"')? + value_start;

    Some((key, trimmed[value_start..value_end].to_string()))
}

fn is_numeric_steam_app_id(value: &str) -> bool {
    !value.is_empty() && value.chars().all(|character| character.is_ascii_digit())
}

#[tauri::command]
pub async fn fetch_steam_owned_games(steam_id: String) -> Result<Vec<OwnedGame>, String> {
    let local_games = fetch_local_steam_owned_games(&steam_id);
    if !local_games.is_empty() {
        println!(
            "[Steam] Loaded {} owned games from local Steam client cache for ID '{steam_id}'",
            local_games.len()
        );
        return Ok(local_games);
    }

    let url = format!(
        "https://steamcommunity.com/profiles/{}/games?tab=all",
        steam_id
    );

    println!("[Steam] Requesting HTML games page: {url}");

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {e}"))?;

    let status = response.status();
    println!("[Steam] Response status: {status}");

    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        let preview = &body[..body.len().min(300)];
        return Err(format!(
            "Steam HTTP {status} for ID '{steam_id}': {preview}"
        ));
    }

    let html = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {e}"))?;

    println!("[Steam] HTML length: {} bytes", html.len());

    // Steam embeds game data as: var rgGames = [...];
    // We find this JSON array and parse it directly.
    let json_array = extract_rg_games_json(&html).ok_or_else(|| {
        // Check if it's a private profile page
        if html.contains("This profile is private") || html.contains("profile_private_info") {
            format!("Steam profile or game details are private for ID '{steam_id}'. Set both 'Profile' and 'Game Details' to Public in Steam Privacy Settings.")
        } else if html.contains("sign in") || html.contains("login") || html.contains("Sign In") {
            format!("Steam requires login to view games anonymously for ID '{steam_id}'. Please connect your Steam account in Settings.")
        } else {
            format!("Could not find game list in Steam page for ID '{steam_id}'. The page may have changed format. HTML length: {} bytes.", html.len())
        }
    })?;

    println!(
        "[Steam] Found rgGames JSON, length: {} chars",
        json_array.len()
    );

    // Parse the JSON array of game objects
    let games = parse_rg_games_json(&json_array, &steam_id);
    println!("[Steam] Parsed {} games for ID '{steam_id}'", games.len());
    Ok(games)
}

/// Find and extract the JSON array from Steam's embedded `var rgGames = [...];`
fn extract_rg_games_json(html: &str) -> Option<String> {
    // Steam embeds the games as: var rgGames = [{...},...];
    // Try several known variable names Steam has used
    let needles = ["var rgGames = ", "var g_rgGames = ", "rgGames = "];

    for needle in &needles {
        if let Some(start) = html.find(needle) {
            let after = &html[start + needle.len()..];
            // The JSON array starts with '['
            if let Some(bracket_pos) = after.find('[') {
                let json_start = &after[bracket_pos..];
                // Find the matching closing bracket
                let mut depth = 0usize;
                let mut in_string = false;
                let mut escape_next = false;
                for (i, ch) in json_start.char_indices() {
                    if escape_next {
                        escape_next = false;
                        continue;
                    }
                    match ch {
                        '\\' if in_string => escape_next = true,
                        '"' => in_string = !in_string,
                        '[' if !in_string => depth += 1,
                        ']' if !in_string => {
                            depth -= 1;
                            if depth == 0 {
                                return Some(json_start[..=i].to_string());
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
    }
    None
}

/// Parse the extracted rgGames JSON into OwnedGame structs (no serde dependency needed)
fn parse_rg_games_json(json: &str, _steam_id: &str) -> Vec<OwnedGame> {
    let mut games = Vec::new();

    // Each game object: {"appid":730,"name":"Counter-Strike 2","hours_forever":"1,234",...}
    // We extract values using simple string search to avoid needing a full JSON parser dependency
    let mut pos = 0;
    while pos < json.len() {
        let obj_start = match json[pos..].find('{') {
            Some(i) => pos + i,
            None => break,
        };
        // Find matching closing brace
        let mut depth = 0usize;
        let mut in_string = false;
        let mut escape_next = false;
        let mut obj_end = None;
        for (i, ch) in json[obj_start..].char_indices() {
            if escape_next {
                escape_next = false;
                continue;
            }
            match ch {
                '\\' if in_string => escape_next = true,
                '"' => in_string = !in_string,
                '{' if !in_string => depth += 1,
                '}' if !in_string => {
                    depth -= 1;
                    if depth == 0 {
                        obj_end = Some(obj_start + i + 1);
                        break;
                    }
                }
                _ => {}
            }
        }
        let obj_end = match obj_end {
            Some(e) => e,
            None => break,
        };
        let obj = &json[obj_start..obj_end];

        let appid = extract_json_str_field(obj, "appid")
            .or_else(|| extract_json_num_field(obj, "appid"))
            .unwrap_or_default();
        let name = extract_json_str_field(obj, "name").unwrap_or_default();

        if !appid.is_empty() && !name.is_empty() {
            let hours_str = extract_json_str_field(obj, "hours_forever")
                .or_else(|| extract_json_str_field(obj, "hours"))
                .or_else(|| extract_json_num_field(obj, "hours_forever"))
                .unwrap_or_else(|| "0".to_string());
            let hours_clean = hours_str.replace(',', "");
            let playtime = (hours_clean.parse::<f64>().unwrap_or(0.0) * 60.0).round() as u64;

            games.push(OwnedGame {
                id: format!("steam-owned-{appid}"),
                title: name,
                description: format!("Steam game (Owned). AppID: {appid}"),
                cover_url: Some(format!(
                    "https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/library_hero.jpg"
                )),
                logo_url: Some(format!(
                    "https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/header.jpg"
                )),
                icon_url: None,
                playtime_minutes: playtime,
            });
        }
        pos = obj_end;
    }
    games
}

/// Extract a string field value from a JSON object string: `"key":"value"`
fn extract_json_str_field(obj: &str, key: &str) -> Option<String> {
    let needle = format!("\"{}\":", key);
    let start = obj.find(&needle)? + needle.len();
    let rest = obj[start..].trim_start();
    if !rest.starts_with('"') {
        return None;
    }
    let inner = &rest[1..];
    let mut result = String::new();
    let mut escape_next = false;
    for ch in inner.chars() {
        if escape_next {
            match ch {
                'n' => result.push('\n'),
                't' => result.push('\t'),
                'r' => result.push('\r'),
                other => result.push(other),
            }
            escape_next = false;
        } else if ch == '\\' {
            escape_next = true;
        } else if ch == '"' {
            break;
        } else {
            result.push(ch);
        }
    }
    Some(result)
}

/// Extract a numeric field value from a JSON object string: `"key":12345`
fn extract_json_num_field(obj: &str, key: &str) -> Option<String> {
    let needle = format!("\"{}\":", key);
    let start = obj.find(&needle)? + needle.len();
    let rest = obj[start..].trim_start();
    let end = rest
        .find(|c: char| !c.is_ascii_digit() && c != '.')
        .unwrap_or(rest.len());
    let num = &rest[..end];
    if num.is_empty() {
        None
    } else {
        Some(num.to_string())
    }
}

fn extract_xml_tag(block: &str, tag: &str) -> Option<String> {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    let start = block.find(&open)? + open.len();
    let end = block[start..].find(&close)? + start;
    let text = &block[start..end];
    // Decode common XML entities
    Some(
        text.replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&apos;", "'"),
    )
}

#[tauri::command]
pub async fn fetch_gog_owned_games(access_token: String) -> Result<Vec<OwnedGame>, String> {
    let client = reqwest::Client::new();

    // Step 1: Get list of owned product IDs
    let data_resp = client
        .get("https://embed.gog.com/user/data/games")
        .header("Authorization", format!("Bearer {access_token}"))
        .send()
        .await
        .map_err(|e| format!("GOG user data request failed: {e}"))?;

    if !data_resp.status().is_success() {
        return Err(format!(
            "GOG user data returned status {}",
            data_resp.status()
        ));
    }

    let data: serde_json::Value = data_resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse GOG user data: {e}"))?;

    let product_ids: Vec<u64> = data["games"]
        .as_array()
        .unwrap_or(&Vec::new())
        .iter()
        .filter_map(|v| v.as_u64())
        .collect();

    let mut games = Vec::new();

    // Step 2: Fetch details for up to 50 products
    for &id in product_ids.iter().take(50) {
        let detail_url = format!("https://api.gog.com/products/{id}");
        match client.get(&detail_url).send().await {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(detail) = resp.json::<serde_json::Value>().await {
                    let title = detail["title"]
                        .as_str()
                        .unwrap_or(&format!("GOG Game #{id}"))
                        .to_string();

                    let logo2x = detail["images"]["logo2x"].as_str().map(|u| {
                        if u.starts_with("//") {
                            format!("https:{u}")
                        } else {
                            u.to_string()
                        }
                    });
                    let icon = detail["images"]["icon"].as_str().map(|u| {
                        if u.starts_with("//") {
                            format!("https:{u}")
                        } else {
                            u.to_string()
                        }
                    });

                    games.push(OwnedGame {
                        id: format!("gog-owned-{id}"),
                        title,
                        description: format!("GOG game (Owned). ID: {id}"),
                        cover_url: logo2x.clone(),
                        logo_url: logo2x,
                        icon_url: icon,
                        playtime_minutes: 0,
                    });
                }
            }
            _ => {}
        }
    }

    Ok(games)
}

#[tauri::command]
pub async fn fetch_epic_owned_games(
    access_token: String,
    account_id: String,
) -> Result<Vec<OwnedGame>, String> {
    let client = reqwest::Client::new();

    let url = format!(
        "https://library-service.live.epicgames.dev/library/api/public/created/v1/accounts/{account_id}?includeMetadata=true"
    );

    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {access_token}"))
        .send()
        .await
        .map_err(|e| format!("Epic library request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Epic library returned status {}", resp.status()));
    }

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Epic library data: {e}"))?;

    let records = data["records"].as_array().cloned().unwrap_or_default();
    let mut games = Vec::new();

    for rec in &records {
        let catalog_item_id = rec["catalogItemId"].as_str().unwrap_or_default();
        let namespace = rec["namespace"].as_str().unwrap_or_default();
        let app_name = rec["appName"].as_str().unwrap_or_default();
        let catalog_item = &rec["catalogItem"];
        let title = catalog_item["title"]
            .as_str()
            .or_else(|| rec["appName"].as_str())
            .unwrap_or("Epic Game")
            .to_string();

        let mut cover_url: Option<String> = None;
        if let Some(images) = catalog_item["keyImages"].as_array() {
            for img in images {
                let img_type = img["type"].as_str().unwrap_or_default();
                if img_type == "DieselGameBox" || img_type == "Thumbnail" {
                    cover_url = img["url"].as_str().map(|s| s.to_string());
                    break;
                }
            }
        }

        if !catalog_item_id.is_empty() {
            games.push(OwnedGame {
                id: format!("epic-owned-{namespace}:{catalog_item_id}:{app_name}"),
                title,
                description: format!("Epic Games game (Owned). ID: {catalog_item_id}"),
                cover_url: cover_url.clone(),
                logo_url: cover_url,
                icon_url: None,
                playtime_minutes: 0,
            });
        }
    }

    Ok(games)
}
