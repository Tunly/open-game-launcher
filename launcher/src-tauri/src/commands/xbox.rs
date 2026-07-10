use super::secure_store;
use crate::commands::system::OwnedGame;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT_LANGUAGE, AUTHORIZATION};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::process::Command;
use std::thread;

const XBOX_CLIENT_ID: &str = "38cd2fa8-66fd-4760-afb2-405eb65d5b0c";
const XBOX_SCOPE: &str = "Xboxlive.signin Xboxlive.offline_access";
const XBOX_REDIRECT_URI: &str = "https://login.live.com/oauth20_desktop.srf";

fn save_xbox_token(refresh_token: &str) {
    let _ = secure_store::set_secret("xbox", refresh_token);
}

fn load_xbox_token() -> Option<String> {
    secure_store::get_secret("xbox").ok().flatten()
}

#[derive(Deserialize, Debug)]
struct TokenResponse {
    access_token: String,
    refresh_token: String,
}

#[derive(Serialize)]
struct AuthProperties {
    #[serde(rename = "AuthMethod")]
    auth_method: String,
    #[serde(rename = "SiteName")]
    site_name: String,
    #[serde(rename = "RpsTicket")]
    rps_ticket: String,
}

#[derive(Serialize)]
struct AuthRequest {
    #[serde(rename = "Properties")]
    properties: AuthProperties,
    #[serde(rename = "RelyingParty")]
    relying_party: String,
    #[serde(rename = "TokenType")]
    token_type: String,
}

#[derive(Deserialize, Debug)]
struct AuthResponse {
    #[serde(rename = "Token")]
    token: String,
    #[serde(rename = "DisplayClaims")]
    display_claims: DisplayClaims,
}

#[derive(Deserialize, Debug)]
struct DisplayClaims {
    xui: Vec<Xui>,
}

#[derive(Serialize)]
pub struct XboxFetchResult {
    pub games: Vec<OwnedGame>,
    pub gamertag: Option<String>,
}

#[derive(Deserialize, Debug)]
struct Xui {
    uhs: String,
    xid: Option<String>,
    gtg: Option<String>,
}

#[derive(Serialize)]
struct XstsProperties {
    #[serde(rename = "SandboxId")]
    sandbox_id: String,
    #[serde(rename = "UserTokens")]
    user_tokens: Vec<String>,
}

#[derive(Serialize)]
struct XstsRequest {
    #[serde(rename = "Properties")]
    properties: XstsProperties,
    #[serde(rename = "RelyingParty")]
    relying_party: String,
    #[serde(rename = "TokenType")]
    token_type: String,
}

#[derive(Deserialize, Debug)]
struct TitleHistoryResponse {
    titles: Vec<Title>,
}

#[derive(Deserialize, Debug)]
struct Title {
    #[serde(rename = "titleId")]
    title_id: String,
    pfn: Option<String>,
    name: Option<String>,
    #[serde(rename = "type")]
    item_type: Option<String>,
    devices: Option<Vec<String>>,
    #[serde(rename = "titleHistory")]
    title_history: Option<TitleHistoryDetail>,
    stats: Option<serde_json::Value>,
}

#[derive(Deserialize, Debug)]
struct TitleHistoryDetail {
    #[serde(rename = "lastTimePlayed")]
    last_time_played: Option<String>,
}

fn start_xbox_callback_server(app: tauri::AppHandle) {
    thread::spawn(move || {
        let listener = match TcpListener::bind("127.0.0.1:18236") {
            Ok(l) => l,
            Err(e) => {
                println!("[Xbox Login] Failed to bind local server: {e}");
                return;
            }
        };

        println!("[Xbox Login] Local callback server listening on 127.0.0.1:18236");

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
                    let code = rest.split([' ', '&', '\r', '\n']).next().unwrap_or("");
                    if !code.is_empty() {
                        println!("[Xbox Login] Extracted Xbox Code: {}", code);

                        use tauri::{Emitter, Manager};
                        let _ = app.emit("xbox_login_code", code.to_string());

                        if let Some(window) = app.get_webview_window("xbox-login") {
                            let _ = window.close();
                        }

                        let response_body = r#"
                            <!DOCTYPE html>
                            <html>
                            <head>
                                <meta charset="utf-8">
                                <title>OG Launcher - Xbox Login Successful</title>
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
                                    <h1>Xbox Login Successful!</h1>
                                    <p>Your Xbox integration was successful. You can close this tab now and return to the Open Game Launcher.</p>
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
pub async fn open_xbox_login_window(app: tauri::AppHandle) -> Result<(), String> {
    // Close any existing xbox-login window first so we can create a fresh one
    use tauri::Manager;
    if let Some(existing) = app.get_webview_window("xbox-login") {
        let _ = existing.close();
        // Give the OS a moment to clean up the window
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }
    start_xbox_callback_server(app.clone());
    let url = format!(
        "https://login.live.com/oauth20_authorize.srf?client_id={}&response_type=code&approval_prompt=auto&scope={}&redirect_uri={}",
        XBOX_CLIENT_ID,
        "Xboxlive.signin%20Xboxlive.offline_access",
        "https://login.live.com/oauth20_desktop.srf"
    );

    let script = r#"
        window.addEventListener("DOMContentLoaded", () => {
            if (window.location.href.includes("oauth20_desktop.srf")) {
                let params = new URLSearchParams(window.location.search);
                if (!params.has("code") && window.location.hash.includes("code=")) {
                    params = new URLSearchParams(window.location.hash.substring(1));
                }
                let code = params.get("code");
                if (code) {
                    fetch("http://127.0.0.1:18236/?code=" + code).catch(console.error);
                }
            }
        });
    "#;

    let _window = tauri::WebviewWindowBuilder::new(
        &app,
        "xbox-login",
        tauri::WebviewUrl::External(
            url.parse()
                .map_err(|e| format!("Failed to parse login URL: {e}"))?,
        ),
    )
    .title("Xbox Login")
    .inner_size(500.0, 700.0)
    .center()
    .resizable(true)
    .initialization_script(script)
    .build()
    .map_err(|e| format!("Failed to create login window: {e}"))?;

    Ok(())
}

async fn get_oauth_token(code: &str) -> Result<TokenResponse, String> {
    let client = crate::commands::http::shared_http_client();
    let params = [
        ("grant_type", "authorization_code"),
        ("code", code),
        ("scope", XBOX_SCOPE),
        ("client_id", XBOX_CLIENT_ID),
        ("redirect_uri", XBOX_REDIRECT_URI),
    ];

    let res = client
        .post("https://login.live.com/oauth20_token.srf")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("OAuth token request failed: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("OAuth error: {}", res.status()));
    }

    res.json::<TokenResponse>()
        .await
        .map_err(|e| format!("Failed to parse OAuth token: {}", e))
}

async fn refresh_xbox_oauth_token(refresh_token: &str) -> Result<TokenResponse, String> {
    let client = crate::commands::http::shared_http_client();
    let params = [
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
        ("scope", XBOX_SCOPE),
        ("client_id", XBOX_CLIENT_ID),
    ];

    let res = client
        .post("https://login.live.com/oauth20_token.srf")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("OAuth token refresh failed: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("OAuth refresh error: {}", res.status()));
    }

    res.json::<TokenResponse>()
        .await
        .map_err(|e| format!("Failed to parse refreshed OAuth token: {}", e))
}

async fn authenticate_xbox_live(access_token: &str) -> Result<AuthResponse, String> {
    let client = crate::commands::http::shared_http_client();
    let req_body = AuthRequest {
        properties: AuthProperties {
            auth_method: "RPS".into(),
            site_name: "user.auth.xboxlive.com".into(),
            rps_ticket: format!("d={}", access_token),
        },
        relying_party: "http://auth.xboxlive.com".into(),
        token_type: "JWT".into(),
    };

    let mut headers = HeaderMap::new();
    headers.insert("x-xbl-contract-version", HeaderValue::from_static("1"));

    let res = client
        .post("https://user.auth.xboxlive.com/user/authenticate")
        .headers(headers)
        .json(&req_body)
        .send()
        .await
        .map_err(|e| format!("XBL auth failed: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("XBL auth error: {}", res.status()));
    }

    res.json::<AuthResponse>()
        .await
        .map_err(|e| format!("Failed to parse XBL auth: {}", e))
}

async fn authorize_xsts(user_token: &str) -> Result<AuthResponse, String> {
    let client = crate::commands::http::shared_http_client();
    let req_body = XstsRequest {
        properties: XstsProperties {
            sandbox_id: "RETAIL".into(),
            user_tokens: vec![user_token.to_string()],
        },
        relying_party: "http://xboxlive.com".into(),
        token_type: "JWT".into(),
    };

    let mut headers = HeaderMap::new();
    headers.insert("x-xbl-contract-version", HeaderValue::from_static("1"));

    let res = client
        .post("https://xsts.auth.xboxlive.com/xsts/authorize")
        .headers(headers)
        .json(&req_body)
        .send()
        .await
        .map_err(|e| format!("XSTS auth failed: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("XSTS auth error: {}", res.status()));
    }

    res.json::<AuthResponse>()
        .await
        .map_err(|e| format!("Failed to parse XSTS auth: {}", e))
}

#[tauri::command]
pub async fn fetch_xbox_owned_games(code: String) -> Result<XboxFetchResult, String> {
    println!(
        "[Xbox] Starting fetch_xbox_owned_games with code length: {}",
        code.len()
    );
    let oauth_token = match get_oauth_token(&code).await {
        Ok(t) => t,
        Err(e) => {
            println!("[Xbox] get_oauth_token failed: {}", e);
            return Err(e);
        }
    };
    save_xbox_token(&oauth_token.refresh_token);

    println!("[Xbox] Got OAuth token. Authenticating Xbox Live...");
    let xbl_auth = match authenticate_xbox_live(&oauth_token.access_token).await {
        Ok(t) => t,
        Err(e) => {
            println!("[Xbox] authenticate_xbox_live failed: {}", e);
            return Err(e);
        }
    };

    println!("[Xbox] Authorizing XSTS...");
    let xsts_auth = match authorize_xsts(&xbl_auth.token).await {
        Ok(t) => t,
        Err(e) => {
            println!("[Xbox] authorize_xsts failed: {}", e);
            return Err(e);
        }
    };

    let uhs = xsts_auth
        .display_claims
        .xui
        .first()
        .map(|x| x.uhs.clone())
        .unwrap_or_default();

    let gamertag = xsts_auth
        .display_claims
        .xui
        .first()
        .and_then(|x| x.gtg.clone());

    println!(
        "[Xbox] XSTS authorized. gamertag: {:?}, uhs: {}",
        gamertag, uhs
    );
    let xid = xsts_auth
        .display_claims
        .xui
        .first()
        .and_then(|x| x.xid.clone());

    let auth_header = format!("XBL3.0 x={};{}", uhs, xsts_auth.token);

    let client = crate::commands::http::shared_http_client();
    let url = format!(
        "https://titlehub.xboxlive.com/users/xuid({})/titles/titlehistory/decoration/detail,stat,achievement",
        xid.unwrap_or_default()
    );

    let mut headers = HeaderMap::new();
    headers.insert("x-xbl-contract-version", HeaderValue::from_static("2"));
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&auth_header).map_err(|e| e.to_string())?,
    );
    headers.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("en-US"));

    let res = client
        .get(&url)
        .headers(headers)
        .send()
        .await
        .map_err(|e| format!("Titlehub request failed: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Titlehub error: {}", res.status()));
    }

    let history: TitleHistoryResponse = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse title history: {}", e))?;

    let mut games = Vec::new();
    for title in history.titles {
        // Filter like Playnite: type == Game and devices contains PC
        if title.item_type.as_deref() != Some("Game") {
            continue;
        }

        let is_pc = title
            .devices
            .as_ref()
            .is_some_and(|devices| devices.iter().any(|d| d.eq_ignore_ascii_case("PC")));

        if !is_pc {
            continue;
        }

        let pfn = title.pfn.clone().unwrap_or_default();
        if pfn.is_empty() {
            continue;
        }

        let raw_name = title
            .name
            .clone()
            .unwrap_or_else(|| "Unknown Xbox Game".to_string());
        let clean_name = clean_xbox_title_name(&raw_name);

        let last_played = title.title_history.and_then(|th| th.last_time_played);

        let mut playtime_minutes = None;
        if let Some(stats) = &title.stats {
            if let Some(statlist) = stats.get("statlist").and_then(|s| s.as_array()) {
                for stat in statlist {
                    if stat.get("name").and_then(|n| n.as_str()) == Some("MinutesPlayed") {
                        if let Some(val) = stat.get("value").and_then(|v| v.as_u64()) {
                            playtime_minutes = Some(val);
                        }
                    }
                }
            } else if let Some(val) = stats.get("minutesPlayed").and_then(|v| v.as_u64()) {
                playtime_minutes = Some(val);
            } else if let Some(groups) = stats.get("groups").and_then(|g| g.as_array()) {
                for group in groups {
                    if let Some(group_stats) = group.get("statlist").and_then(|s| s.as_array()) {
                        for stat in group_stats {
                            if stat.get("name").and_then(|n| n.as_str()) == Some("MinutesPlayed") {
                                if let Some(val) = stat.get("value").and_then(|v| v.as_u64()) {
                                    playtime_minutes = Some(val);
                                }
                            }
                        }
                    }
                }
            }
        }

        games.push(OwnedGame {
            id: format!("xbox-{}", pfn), // We use the PFN as the unique identifier
            external_id: Some(title.title_id.clone()),
            title: clean_name,
            description: String::new(),
            cover_url: None, // Could be fetched via titlehub details if needed
            logo_url: None,
            icon_url: None,
            playtime_minutes,
            last_played_at: last_played,
            cloud_gaming_url: None,
        });
    }

    Ok(XboxFetchResult { games, gamertag })
}

#[tauri::command]
pub async fn launch_xbox_game(pfn: String) -> Result<(), String> {
    if !cfg!(target_os = "windows") {
        return Err("Only supported on Windows".into());
    }

    let pfn = validate_xbox_package_family_name(&pfn)?;
    let aumid = resolve_xbox_aumid(&pfn)?;
    let target = format!("shell:AppsFolder\\{}", aumid);

    Command::new("explorer.exe")
        .arg(&target)
        .spawn()
        .map_err(|e| format!("Failed to launch Xbox game: {}", e))?;

    Ok(())
}

fn validate_xbox_package_family_name(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty()
        || !value.contains('_')
        || !value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
        })
    {
        return Err("Xbox launch requires a valid installed Package Family Name.".to_string());
    }

    Ok(value.to_string())
}

fn resolve_xbox_aumid(pfn: &str) -> Result<String, String> {
    let script = r#"
$ErrorActionPreference = 'Stop'
$pfn = $env:OGL_XBOX_PFN
$ids = @(Get-StartApps | ForEach-Object { $_.AppID } | Where-Object { $_ -like "${pfn}!*" } | Sort-Object -Unique)
if ($ids.Count -eq 0) {
  $package = Get-AppxPackage | Where-Object { $_.PackageFamilyName -eq $pfn } | Select-Object -First 1
  if (-not $package) { throw "Installed package was not found." }
  $manifest = Get-AppxPackageManifest -Package $package.PackageFullName
  $ids = @($manifest.Package.Applications.Application | ForEach-Object { if ($_.Id) { "${pfn}!$($_.Id)" } } | Sort-Object -Unique)
}
$ids | ForEach-Object { Write-Output $_ }
"#;

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .env("OGL_XBOX_PFN", pfn)
        .output()
        .map_err(|error| format!("Could not inspect the Xbox application manifest: {error}"))?;

    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if detail.is_empty() {
            "Could not resolve the installed Xbox application's AUMID.".to_string()
        } else {
            format!("Could not resolve the installed Xbox application's AUMID: {detail}")
        });
    }

    parse_resolved_xbox_aumid(pfn, &String::from_utf8_lossy(&output.stdout))
}

fn parse_resolved_xbox_aumid(pfn: &str, output: &str) -> Result<String, String> {
    let expected_prefix = format!("{pfn}!");
    let mut matches = output
        .lines()
        .map(str::trim)
        .filter(|line| line.starts_with(&expected_prefix) && line.len() > expected_prefix.len())
        .map(str::to_string)
        .collect::<Vec<_>>();
    matches.sort();
    matches.dedup();

    match matches.as_slice() {
        [aumid] => Ok(aumid.clone()),
        [] => Err(format!(
            "Xbox package '{pfn}' has no registered launchable application."
        )),
        _ => Err(format!(
            "Xbox package '{pfn}' exposes multiple launchable applications; refusing to guess the AUMID."
        )),
    }
}

#[tauri::command]
pub async fn install_xbox_game(pfn: String) -> Result<(), String> {
    if !cfg!(target_os = "windows") {
        return Err("Only supported on Windows".into());
    }

    // If it doesn't contain an underscore, it's likely a ProductId instead of a PackageFamilyName
    let url = if pfn.contains('_') {
        format!("ms-windows-store://pdp/?PFN={}", pfn)
    } else {
        format!("ms-windows-store://pdp/?ProductId={}", pfn)
    };

    crate::commands::system::open_uri(&url)?;

    Ok(())
}

#[derive(Deserialize, Debug)]
#[allow(non_snake_case)]
struct XboxAchievementsResponse {
    achievements: Vec<XboxAchievement>,
}

#[derive(Deserialize, Debug)]
#[allow(non_snake_case)]
struct XboxAchievement {
    id: String,
    name: String,
    description: Option<String>,
    progressState: String,
    progression: Option<XboxAchievementProgression>,
    mediaAssets: Option<Vec<XboxAchievementMediaAsset>>,
    rarity: Option<XboxAchievementRarity>,
}

#[derive(Deserialize, Debug)]
#[allow(non_snake_case)]
struct XboxAchievementProgression {
    timeUnlocked: String,
}

#[derive(Deserialize, Debug)]
#[allow(non_snake_case)]
struct XboxAchievementMediaAsset {
    name: String,
    url: String,
}

#[derive(Deserialize, Debug)]
#[allow(non_snake_case)]
struct XboxAchievementRarity {
    currentPercentage: f64,
}

fn clean_xbox_title_name(name: &str) -> String {
    name.replace("(PC)", "")
        .replace("(Windows)", "")
        .replace("for Windows 10", "")
        .replace("- Windows 10", "")
        .trim()
        .to_string()
}

fn normalize_title_match(value: &str) -> String {
    value
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .flat_map(|c| c.to_lowercase())
        .collect()
}

fn title_matches_local_hint(title: &Title, hints: &HashSet<String>) -> bool {
    if hints.contains(&title.title_id.to_lowercase()) {
        return true;
    }

    if let Some(pfn) = &title.pfn {
        let pfn = pfn.to_lowercase();
        if hints.iter().any(|hint| hint.contains(&pfn)) {
            return true;
        }
    }

    if let Some(name) = &title.name {
        let clean_name = normalize_title_match(&clean_xbox_title_name(name));
        if !clean_name.is_empty()
            && hints
                .iter()
                .map(|hint| normalize_title_match(hint))
                .any(|hint| hint == clean_name)
        {
            return true;
        }
    }

    false
}

async fn fetch_xbox_title_history(
    client: &reqwest::Client,
    auth_header: &str,
    xid: &str,
) -> Result<TitleHistoryResponse, String> {
    let url = format!(
        "https://titlehub.xboxlive.com/users/xuid({})/titles/titlehistory/decoration/detail,stat,achievement",
        xid
    );

    let mut headers = HeaderMap::new();
    headers.insert("x-xbl-contract-version", HeaderValue::from_static("2"));
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(auth_header).map_err(|e| e.to_string())?,
    );
    headers.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("en-US"));

    let res = client
        .get(&url)
        .headers(headers)
        .send()
        .await
        .map_err(|e| format!("Titlehub request failed: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Titlehub error: {}", res.status()));
    }

    res.json()
        .await
        .map_err(|e| format!("Failed to parse title history: {}", e))
}

async fn resolve_xbox_title_id(
    client: &reqwest::Client,
    auth_header: &str,
    xid: &str,
    game_id: &str,
    title_hint: &str,
) -> Result<String, String> {
    let title_hint = title_hint.trim();
    if !title_hint.is_empty() && title_hint.chars().all(|c| c.is_ascii_digit()) {
        return Ok(title_hint.to_string());
    }

    let games = crate::commands::games::core::read_installed_games_cache_result()?;
    let game = games.iter().find(|game| game.id == game_id);
    let mut hints: HashSet<String> = HashSet::new();

    if !title_hint.is_empty() {
        hints.insert(title_hint.to_lowercase());
    }

    if let Some(game) = game {
        hints.insert(game.id.to_lowercase());
        hints.insert(game.title.to_lowercase());
        if !game.slug.is_empty() {
            hints.insert(game.slug.to_lowercase());
        }
        if let Some(external_id) = &game.external_id {
            let external_id = external_id.trim();
            if external_id.chars().all(|c| c.is_ascii_digit()) {
                return Ok(external_id.to_string());
            }
            if !external_id.is_empty() {
                hints.insert(external_id.to_lowercase());
            }
        }
        if let Some(launch_uri) = &game.launch_uri {
            hints.insert(launch_uri.to_lowercase());
        }
    }

    let history = fetch_xbox_title_history(client, auth_header, xid).await?;
    for title in history.titles {
        if title.item_type.as_deref() != Some("Game") {
            continue;
        }

        let is_pc = title
            .devices
            .as_ref()
            .is_some_and(|devices| devices.iter().any(|d| d.eq_ignore_ascii_case("PC")));

        if !is_pc {
            continue;
        }

        if title_matches_local_hint(&title, &hints) {
            return Ok(title.title_id);
        }
    }

    let label = game
        .map(|game| game.title.as_str())
        .filter(|title| !title.is_empty())
        .unwrap_or(game_id);
    Err(format!(
        "Xbox achievement sync could not resolve a numeric TitleId for {}. Refresh the Xbox library or import the game from Xbox owned games first.",
        label
    ))
}

#[tauri::command]
pub async fn sync_xbox_achievements(
    game_id: String,
    title_id: String,
) -> Result<crate::commands::games::types::SyncGameAchievementsResponse, String> {
    let refresh_token = load_xbox_token().ok_or("Xbox account not linked or token missing")?;
    let oauth_token = refresh_xbox_oauth_token(&refresh_token).await?;
    save_xbox_token(&oauth_token.refresh_token);

    let xbl_auth = authenticate_xbox_live(&oauth_token.access_token).await?;
    let xsts_auth = authorize_xsts(&xbl_auth.token).await?;

    let uhs = xsts_auth
        .display_claims
        .xui
        .first()
        .map(|x| x.uhs.clone())
        .unwrap_or_default();
    let xid = xsts_auth
        .display_claims
        .xui
        .first()
        .and_then(|x| x.xid.clone())
        .ok_or("No XUID found")?;

    let auth_header = format!("XBL3.0 x={};{}", uhs, xsts_auth.token);

    let client = crate::commands::http::shared_http_client();
    let title_id =
        resolve_xbox_title_id(client, &auth_header, &xid, &game_id, title_id.trim()).await?;
    let url = format!(
        "https://achievements.xboxlive.com/users/xuid({})/achievements?titleId={}&maxItems=1000",
        xid, title_id
    );

    let mut headers = HeaderMap::new();
    headers.insert("x-xbl-contract-version", HeaderValue::from_static("2"));
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&auth_header).map_err(|e| e.to_string())?,
    );
    headers.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("en-US"));

    let res = client
        .get(&url)
        .headers(headers)
        .send()
        .await
        .map_err(|e| format!("Xbox achievements request failed: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Xbox achievements error: {}", res.status()));
    }

    let ach_res: XboxAchievementsResponse = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse Xbox achievements: {}", e))?;

    let mut unified = Vec::new();
    for ach in ach_res.achievements {
        let icon_url = ach
            .mediaAssets
            .unwrap_or_default()
            .into_iter()
            .find(|m| m.name.eq_ignore_ascii_case("Icon"))
            .map(|m| m.url);

        let unlocked_at = if ach.progressState.eq_ignore_ascii_case("Achieved") {
            ach.progression.map(|p| p.timeUnlocked)
        } else {
            None
        };

        unified.push(crate::commands::games::types::UnifiedAchievement {
            id: ach.id.clone(),
            name: ach.name,
            description: ach.description,
            icon_url,
            unlocked_at,
            rarity: ach.rarity.map(|r| r.currentPercentage),
            source: Some("xbox".to_string()),
            source_achievement_id: Some(ach.id),
            provider_confidence: Some("official".to_string()),
        });
    }

    let unlocked_achievements = unified.iter().filter(|a| a.unlocked_at.is_some()).count();
    let synced_achievements = unified.len();
    let synced_at = crate::commands::games::core::unix_timestamp_to_iso(
        crate::commands::games::core::current_unix_timestamp(),
    );
    let game = crate::commands::games::core::update_installed_game_cache(&game_id, move |game| {
        game.achievements =
            crate::commands::games::core::preserve_known_unlocks(unified, &game.achievements);
        game.achievements_synced_at = Some(synced_at);
        Ok(())
    })?;

    Ok(
        crate::commands::games::types::SyncGameAchievementsResponse {
            game_id,
            success: true,
            game,
            synced_achievements,
            unlocked_achievements,
            message: format!(
                "Xbox achievements synced: {}/{} unlocked",
                unlocked_achievements, synced_achievements
            ),
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_title(title_id: &str, pfn: Option<&str>, name: Option<&str>) -> Title {
        Title {
            title_id: title_id.to_string(),
            pfn: pfn.map(str::to_string),
            name: name.map(str::to_string),
            item_type: Some("Game".to_string()),
            devices: Some(vec!["PC".to_string()]),
            title_history: None,
            stats: None,
        }
    }

    fn hints(values: &[&str]) -> HashSet<String> {
        values.iter().map(|value| value.to_lowercase()).collect()
    }

    #[test]
    fn cleans_xbox_title_suffixes_for_matching() {
        assert_eq!(
            clean_xbox_title_name("Forza Horizon 5 (PC)"),
            "Forza Horizon 5"
        );
        assert_eq!(
            clean_xbox_title_name("Halo Infinite - Windows 10"),
            "Halo Infinite"
        );
        assert_eq!(
            clean_xbox_title_name("Psychonauts 2 for Windows 10"),
            "Psychonauts 2"
        );
    }

    #[test]
    fn title_hint_matches_numeric_title_id() {
        let title = test_title(
            "123456789",
            Some("Microsoft.Test_8wekyb3d8bbwe"),
            Some("Test"),
        );

        assert!(title_matches_local_hint(&title, &hints(&["123456789"])));
    }

    #[test]
    fn title_hint_matches_package_family_name_inside_local_id() {
        let title = test_title(
            "123456789",
            Some("Microsoft.ForzaHorizon5_8wekyb3d8bbwe"),
            Some("Forza Horizon 5"),
        );

        assert!(title_matches_local_hint(
            &title,
            &hints(&["xbox-microsoft.forzahorizon5_8wekyb3d8bbwe"])
        ));
    }

    #[test]
    fn title_hint_matches_cleaned_game_name() {
        let title = test_title("123456789", None, Some("Forza Horizon 5 (PC)"));

        assert!(title_matches_local_hint(
            &title,
            &hints(&["Forza Horizon 5"])
        ));
    }

    #[test]
    fn title_hint_rejects_unrelated_game() {
        let title = test_title(
            "123456789",
            Some("Microsoft.ForzaHorizon5_8wekyb3d8bbwe"),
            Some("Forza Horizon 5"),
        );

        assert!(!title_matches_local_hint(
            &title,
            &hints(&["Halo Infinite"])
        ));
    }

    #[test]
    fn parses_exact_xbox_aumid_from_manifest_output() {
        let pfn = "Microsoft.Test_8wekyb3d8bbwe";
        assert_eq!(
            parse_resolved_xbox_aumid(pfn, "Microsoft.Test_8wekyb3d8bbwe!Game\n").unwrap(),
            "Microsoft.Test_8wekyb3d8bbwe!Game"
        );
    }

    #[test]
    fn refuses_to_guess_between_multiple_xbox_applications() {
        let pfn = "Microsoft.Test_8wekyb3d8bbwe";
        let error = parse_resolved_xbox_aumid(
            pfn,
            "Microsoft.Test_8wekyb3d8bbwe!Game\nMicrosoft.Test_8wekyb3d8bbwe!Editor\n",
        )
        .unwrap_err();

        assert!(error.contains("multiple launchable applications"));
    }
}
