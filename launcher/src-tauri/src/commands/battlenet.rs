use super::system::OwnedGame;
use std::time::Duration;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub async fn open_battlenet_login_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("battlenet-login") {
        let _ = existing.close();
        tokio::time::sleep(Duration::from_millis(200)).await;
    }

    let url = "https://account.battle.net/login";
    let app_clone = app.clone();

    let script = r#"
        (function() {
            let fetched = false;
            const interval = setInterval(async () => {
                if (fetched) return;
                const path = window.location.pathname.toLowerCase();
                // Avoid running fetch on the login page or intermediate OAuth/signup pages
                if (!path.includes('/login') && !path.includes('/oauth') && !path.includes('/signup')) {
                    fetched = true;
                    try {
                        const [res1, res2] = await Promise.all([
                            fetch('/api/games-and-subs'),
                            fetch('/api/classic-games')
                        ]);
                        
                        // Check if we actually got a JSON response (redirects can return 200 HTML)
                        const cType1 = res1.headers.get('content-type') || '';
                        const cType2 = res2.headers.get('content-type') || '';
                        const isJson1 = res1.ok && cType1.includes('json');
                        const isJson2 = res2.ok && cType2.includes('json');
                        
                        if (isJson1 || isJson2) {
                            const data1 = isJson1 ? await res1.json() : {};
                            const data2 = isJson2 ? await res2.json() : {};
                            
                            let extractedGames = [];
                            const walk = (v) => {
                                if (Array.isArray(v)) v.forEach(walk);
                                else if (v && typeof v === 'object') {
                                    const name = v.localizedGameName || v.name || v.title;
                                    const id = v.titleId || v.id || v.gameId || v.uid;
                                    if (name && typeof name === 'string' && name.length > 1) {
                                        let finalId = id;
                                        if (!finalId && name) finalId = name.replace(/\s+/g, '-').toLowerCase();
                                        if (finalId) {
                                            extractedGames.push({ n: name, i: finalId.toString() });
                                            return;
                                        }
                                    }
                                    Object.values(v).forEach(walk);
                                }
                            };
                            walk({ d1: data1, d2: data2 });
                            
                            // Deduplicate
                            const unique = [];
                            const seen = new Set();
                            for (const g of extractedGames) {
                                if (!seen.has(g.n)) {
                                    seen.add(g.n);
                                    unique.push(g);
                                }
                            }

                            const jsonStr = JSON.stringify(unique);
                            
                            // Let's use navigation with a base64 encoded payload.
                            const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
                            window.location.href = "https://localhost/launcher/battlenet-auth?data=" + encodeURIComponent(b64);
                        } else {
                            fetched = false; // retry later
                        }
                    } catch (e) {
                        console.error('[Battle.net Auth] Fetch error:', e);
                        fetched = false;
                    }
                }
            }, 2000);
        })();
    "#;

    let _window = WebviewWindowBuilder::new(
        &app,
        "battlenet-login",
        WebviewUrl::External(
            url.parse()
                .map_err(|e| format!("Failed to parse login URL: {e}"))?,
        ),
    )
    .title("Battle.net Login")
    .inner_size(500.0, 700.0)
    .center()
    .resizable(true)
    .initialization_script(script)
    .on_navigation(move |url| {
        let url_str = url.to_string();
        if url_str.starts_with("https://localhost/launcher/battlenet-auth") {
            let mut b64_opt = None;
            for (key, val) in url.query_pairs() {
                if key == "data" {
                    b64_opt = Some(val.into_owned());
                    break;
                }
            }

            if let Some(b64) = b64_opt {
                use tauri::Emitter;
                let _ = app_clone.emit("battlenet_login_data", b64);

                if let Some(window) = app_clone.get_webview_window("battlenet-login") {
                    let _ = window.close();
                }
            }
            return false;
        }
        true
    })
    .build()
    .map_err(|e| format!("Failed to create login window: {e}"))?;

    Ok(())
}

fn decode_base64(input: &str) -> Option<Vec<u8>> {
    let mut output = Vec::new();
    let mut buffer = 0u32;
    let mut bits = 0u8;

    for byte in input.bytes().filter(|byte| !byte.is_ascii_whitespace()) {
        if byte == b'=' {
            break;
        }
        let value = match byte {
            b'A'..=b'Z' => byte - b'A',
            b'a'..=b'z' => byte - b'a' + 26,
            b'0'..=b'9' => byte - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => return None,
        } as u32;

        buffer = (buffer << 6) | value;
        bits += 6;

        while bits >= 8 {
            bits -= 8;
            output.push((buffer >> bits) as u8);
            buffer &= (1 << bits) - 1;
        }
    }
    Some(output)
}

#[tauri::command]
pub async fn process_battlenet_games_payload(
    payload_b64: String,
) -> Result<Vec<OwnedGame>, String> {
    let bytes = decode_base64(&payload_b64).ok_or("Failed to decode base64")?;
    let json_str = String::from_utf8_lossy(&bytes).into_owned();
    // decodeURIComponent might be needed if JS encoded it. The JS does unescape(encodeURIComponent()), which is UTF-8 to b64.
    // So the base64 contains the UTF-8 bytes directly.

    let data: serde_json::Value =
        serde_json::from_str(&json_str).map_err(|e| format!("Invalid JSON: {}", e))?;
    let _ = std::fs::write("battlenet_debug.json", &json_str);

    let mut games = Vec::new();

    if let serde_json::Value::Array(arr) = data {
        for obj in arr {
            if let (Some(n), Some(i)) = (
                obj.get("n").and_then(|v| v.as_str()),
                obj.get("i").and_then(|v| v.as_str()),
            ) {
                let n_clone = n.to_string();
                let i_clone = i.to_string();
                let assets = std::thread::spawn(move || {
                    crate::commands::games::detect::get_rawg_battlenet_assets(&i_clone, &n_clone)
                })
                .join()
                .unwrap_or(None);

                games.push(OwnedGame {
                    id: format!("battlenet-owned-{}", i.replace(" ", "-").to_lowercase()),
                    external_id: Some(i.to_string()),
                    title: n.to_string(),
                    description: format!("Battle.net game (Owned). ID: {}", i),
                    cover_url: assets.as_ref().and_then(|a| a.cover_url.clone()),
                    logo_url: assets.as_ref().and_then(|a| a.logo_url.clone()),
                    icon_url: assets.as_ref().and_then(|a| a.icon_url.clone()),
                    playtime_minutes: 0,
                    last_played_at: None,
                    cloud_gaming_url: None,
                });
            }
        }
    }

    // Deduplication should already be done in JS, but doesn't hurt
    games.sort_by(|a, b| a.title.cmp(&b.title));
    games.dedup_by(|a, b| a.title == b.title);

    Ok(games)
}
