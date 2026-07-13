use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepLinkEvent {
    pub raw_url: String,
    pub action: String, // "join", "open", "install"
    pub params: HashMap<String, String>,
}

/// Register the oglauncher:// protocol handler in the OS.
#[cfg(target_os = "windows")]
pub fn register_protocol_handler() {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let exe = std::env::current_exe().unwrap_or_default();
    let exe_path = exe.to_string_lossy().to_string();
    let icon_path = format!("\"{}\",0", exe_path);
    let open_cmd = format!("\"{}\" \"%1\"", exe_path);

    let _ = (|| -> Result<(), Box<dyn std::error::Error>> {
        let (class, _) = hkcu.create_subkey(r"Software\Classes\oglauncher")?;
        class.set_value("", &"URL: Open Game Launcher Protocol")?;
        class.set_value("URL Protocol", &"")?;
        let (icon, _) = hkcu.create_subkey(r"Software\Classes\oglauncher\DefaultIcon")?;
        icon.set_value("", &icon_path)?;
        let (cmd, _) = hkcu.create_subkey(r"Software\Classes\oglauncher\shell\open\command")?;
        cmd.set_value("", &open_cmd)?;
        Ok(())
    })();
}

#[cfg(not(target_os = "windows"))]
pub fn register_protocol_handler() {
    // macOS: Info.plist CFBundleURLSchemes / Linux: .desktop MimeType
    // For now, best-effort noop on non-Windows
}

/// Parse any command-line argument that starts with oglauncher://
pub fn check_deep_link_on_startup() -> Option<DeepLinkEvent> {
    let args: Vec<String> = std::env::args().collect();
    for arg in args.iter().skip(1) {
        if arg.starts_with("oglauncher://") {
            return Some(parse_deep_link(arg));
        }
    }
    None
}

pub fn parse_deep_link(raw: &str) -> DeepLinkEvent {
    let rest = raw.strip_prefix("oglauncher://").unwrap_or(raw);
    // Find the action before ? or end
    let (action, query) = if let Some(idx) = rest.find('?') {
        (&rest[..idx], Some(&rest[idx + 1..]))
    } else {
        (rest, None)
    };
    let mut params = HashMap::new();
    if let Some(q) = query {
        for pair in q.split('&') {
            let mut kv = pair.splitn(2, '=');
            if let (Some(k), Some(v)) = (kv.next(), kv.next()) {
                if !k.is_empty() {
                    params.insert(urlencoding_decode(k), urlencoding_decode(v));
                }
            }
        }
    }
    DeepLinkEvent {
        raw_url: raw.to_string(),
        action: action.trim_matches('/').to_string(),
        params,
    }
}

fn urlencoding_decode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(hi), Some(lo)) = (hex_val(bytes[i + 1]), hex_val(bytes[i + 2])) {
                out.push((hi << 4 | lo) as char);
                i += 3;
                continue;
            }
        }
        if bytes[i] == b'+' {
            out.push(' ');
        } else {
            out.push(bytes[i] as char);
        }
        i += 1;
    }
    out
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'A'..=b'F' => Some(b - b'A' + 10),
        b'a'..=b'f' => Some(b - b'a' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_join_link() {
        let share_token = "ogl_header.payload.signature";
        let ev = parse_deep_link(&format!(
            "oglauncher://join?game=elden-ring&platform=steam&invite={share_token}"
        ));
        assert_eq!(ev.action, "join");
        assert_eq!(
            ev.params.get("game").map(String::as_str),
            Some("elden-ring")
        );
        assert_eq!(ev.params.get("platform").map(String::as_str), Some("steam"));
        assert_eq!(
            ev.params.get("invite").map(String::as_str),
            Some(share_token)
        );
    }

    #[test]
    fn parse_url_encoded() {
        let ev = parse_deep_link("oglauncher://open?title=Dark+Souls&id=abc%20123");
        assert_eq!(
            ev.params.get("title").map(String::as_str),
            Some("Dark Souls")
        );
        assert_eq!(ev.params.get("id").map(String::as_str), Some("abc 123"));
    }

    #[test]
    fn no_query_params() {
        let ev = parse_deep_link("oglauncher://open");
        assert_eq!(ev.action, "open");
        assert!(ev.params.is_empty());
    }

    #[test]
    fn hex_val_works() {
        assert_eq!(hex_val(b'f'), Some(15));
        assert_eq!(hex_val(b'A'), Some(10));
        assert_eq!(hex_val(b'z'), None);
    }
}
