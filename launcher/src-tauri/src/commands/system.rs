use serde::Serialize;
use tauri::Manager;
use std::{
    env, fs,
    io::{Read, Write},
    net::TcpListener,
    path::PathBuf,
    process::Command,
    thread,
};

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

fn open_uri(uri: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", uri])
            .spawn()
            .map_err(|e| format!("Fehler beim Öffnen des Browsers: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(uri)
            .spawn()
            .map_err(|e| format!("Fehler beim Öffnen des Browsers: {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(uri)
            .spawn()
            .map_err(|e| format!("Fehler beim Öffnen des Browsers: {e}"))?;
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

            let body_str = String::from_utf8_lossy(&buffer[body_start..body_start + content_length]);

            // CASE 1: POST /scraped (scraped games list from WebView)
            if headers_str.starts_with("POST /scraped") {
                if let Ok(parsed_data) = serde_json::from_str::<serde_json::Value>(&body_str) {
                    use tauri::Emitter;

                    if let Some(games_array) = parsed_data.get("games") {
                        if games_array.as_array().map_or(0, |a| a.len()) > 0 {
                            println!("[Steam Scraper] Received {} owned games from Webview!", games_array.as_array().unwrap().len());
                            let _ = app.emit("steam_scraped_games_success", games_array.clone());
                            
                            // Close both standard login window and silent scraper if present
                            if let Some(login_window) = app.get_webview_window("steam-login") {
                                let _ = login_window.close();
                            }
                            if let Some(scraper_window) = app.get_webview_window("steam-silent-scraper") {
                                let _ = scraper_window.close();
                            }
                        }
                    } else if let Some(is_private) = parsed_data.get("isPrivate").and_then(|v| v.as_bool()) {
                        if is_private {
                            println!("[Steam Scraper] Scraper reported profile or game details are private.");
                            let _ = app.emit("steam_scraped_games_error", "Steam-Profil oder Spieldetails sind privat.".to_string());
                            
                            if let Some(login_window) = app.get_webview_window("steam-login") {
                                let _ = login_window.close();
                            }
                            if let Some(scraper_window) = app.get_webview_window("steam-silent-scraper") {
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
                    let redirect_html = format!(r#"
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
                                <h1>Login erfolgreich!</h1>
                                <p>Deine Steam-Spieleliste wird geladen...</p>
                            </div>
                            <script>
                                window.location.href = "https://steamcommunity.com/profiles/{}/games/?tab=all";
                            </script>
                        </body>
                        </html>
                    "#, sid);

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

            let response_body = "HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
            let _ = stream.write_all(response_body.as_bytes());
        }
    });
}

#[tauri::command]
pub async fn open_steam_login_window(app: tauri::AppHandle) -> Result<(), String> {
    start_local_callback_server(app.clone());

    let url = "https://steamcommunity.com/openid/login?openid.ns=http://specs.openid.net/auth/2.0&openid.mode=checkid_setup&openid.return_to=http://localhost:18234/&openid.realm=http://localhost:18234/&openid.identity=http://specs.openid.net/auth/2.0/identifier_select&openid.claimed_id=http://specs.openid.net/auth/2.0/identifier_select";
    
    // Injected JavaScript to scrape rgGames list automatically and post it to our local server
    let scraper_script = r#"
        (function() {
            console.log("[Steam Scraper] Active!");
            
            function tryScrape() {
                const url = window.location.href;
                if (!url.includes("steamcommunity.com/profiles/") && !url.includes("steamcommunity.com/id/")) {
                    return;
                }
                if (!url.includes("/games")) {
                    return;
                }
                
                console.log("[Steam Scraper] We are on the games page, attempting scrape...");
                const games = window.rgGames || window.g_rgGames;
                const isPrivate = document.body.innerHTML.includes("This profile is private") || 
                                  document.body.innerHTML.includes("profile_private_info") || 
                                  document.title.includes("Sign In");
                                  
                if (games && games.length > 0) {
                    console.log("[Steam Scraper] Found games: " + games.length + ", posting to backend...");
                    fetch("http://localhost:18234/scraped", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ games })
                    }).catch(e => console.error("[Steam Scraper] Fetch error: ", e));
                } else if (isPrivate) {
                    console.log("[Steam Scraper] Profile is private or requires login, reporting to backend...");
                    fetch("http://localhost:18234/scraped", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ isPrivate: true })
                    }).catch(e => console.error("[Steam Scraper] Fetch error: ", e));
                }
            }

            window.addEventListener("DOMContentLoaded", tryScrape);
            setInterval(tryScrape, 1500);
        })();
    "#;

    // Create a native Tauri window for logging in, sharing cookies
    let _window = tauri::WebviewWindowBuilder::new(
        &app,
        "steam-login",
        tauri::WebviewUrl::External(url.parse().map_err(|e| format!("Failed to parse login URL: {e}"))?)
    )
    .title("Steam Login")
    .inner_size(800.0, 600.0)
    .center()
    .resizable(true)
    .initialization_script(scraper_script)
    .build()
    .map_err(|e| format!("Failed to create login window: {e}"))?;

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
                    let code = rest.split(|c| c == ' ' || c == '&' || c == '\r' || c == '\n').next().unwrap_or("");
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
                                        <div class="success-icon">✓</div>
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

            let response_body = "HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
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

#[tauri::command]
pub async fn fetch_steam_owned_games(steam_id: String) -> Result<Vec<OwnedGame>, String> {
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
        return Err(format!("Steam HTTP {status} for ID '{steam_id}': {preview}"));
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

    println!("[Steam] Found rgGames JSON, length: {} chars", json_array.len());

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
            if escape_next { escape_next = false; continue; }
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
                    "https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/library_600x900.jpg"
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
    let end = rest.find(|c: char| !c.is_ascii_digit() && c != '.').unwrap_or(rest.len());
    let num = &rest[..end];
    if num.is_empty() { None } else { Some(num.to_string()) }
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
        return Err(format!("GOG user data returned status {}", data_resp.status()));
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
                        if u.starts_with("//") { format!("https:{u}") } else { u.to_string() }
                    });
                    let icon = detail["images"]["icon"].as_str().map(|u| {
                        if u.starts_with("//") { format!("https:{u}") } else { u.to_string() }
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
