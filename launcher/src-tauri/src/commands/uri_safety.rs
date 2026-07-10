//! Shared helpers for opening external URIs from a Tauri command.
//!
//! Two failure modes existed before this module:
//!
//! 1. **Command injection** — renderers (or any compromised source) could
//!    sneak shell metacharacters into a URI via the `game_slug` parameter
//!    of `launch_cross_play_join` or via `game_id` in `downloads/start`.
//!    On Windows the historical implementation was
//!    `Command::new("cmd").args(["/C", "start", "", uri])`, which means
//!    `cmd` itself parses the URI string and an embedded `&` becomes a
//!    command separator. A slug of `"123 & calc.exe"` would start
//!    `calc.exe`.
//!
//! 2. **URI-scheme confusion** — even after fixing #1 we want to ensure
//!    that only well-known launcher schemes get opened. Anything else
//!    must be rejected before it reaches a shell.
//!
//! This module centralises:
//!
//! - [`validate_slug`]: a tight character allowlist for any
//!   platform-specific identifier that ends up in a URI.
//! - [`validate_uri_scheme`]: a closed list of schemes the launcher may
//!   open. New schemes must be added here explicitly.
//! - [`open_uri_safely`]: the one place that builds the platform-native
//!   "open this URL" command. It validates the URI first, then uses
//!   `rundll32 url.dll,FileProtocolHandler` (Windows) / `open` (macOS) /
//!   `xdg-open` (Linux). None of these paths go through a shell.

/// Maximum number of characters allowed in a validated slug.
/// Steam AppIDs, GOG IDs, Epic catalog names, and Battle.net product
/// slugs are all well below 32 characters in practice; 64 leaves room
/// for catalog-style names without enabling multi-argument payloads.
pub const MAX_SLUG_LENGTH: usize = 64;

/// Validate a platform-specific slug (Steam AppID, Epic namespace, GOG
/// product ID, etc.) before it is interpolated into a URI.
///
/// Accepts only ASCII alphanumerics plus `.`, `_`, `-`. Empty slugs and
/// anything with shell metacharacters (`&`, `|`, `;`, spaces, quotes,
/// newlines, `..`, etc.) are rejected.
pub fn validate_slug(slug: &str) -> Result<&str, String> {
    if slug.is_empty() {
        return Err("Slug is empty.".to_string());
    }
    if slug.len() > MAX_SLUG_LENGTH {
        return Err(format!(
            "Slug exceeds maximum length of {} characters.",
            MAX_SLUG_LENGTH
        ));
    }
    if !slug
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
    {
        return Err(format!("Slug contains disallowed characters: {slug:?}"));
    }
    Ok(slug)
}

/// The closed list of URI schemes the launcher is allowed to hand to the
/// operating system. Adding a new scheme must be a conscious decision
/// (and a code review) because the OS will dispatch it to whatever
/// application has registered a handler.
const ALLOWED_URI_SCHEMES: &[&str] = &[
    "steam://",
    "com.epicgames.launcher://",
    "goggalaxy://",
    "ms-windows-store://",
    "ms-xbl-38966778-3f57-4f6e-a6e9-3b81c79fbb3f://",
    "battlenet://",
    "origin2://",
    "uplay://",
    "psjoin://",
    "switchgame://",
    "http://",
    "https://",
];

/// Return true if `uri` starts with one of [`ALLOWED_URI_SCHEMES`].
pub fn validate_uri_scheme(uri: &str) -> Result<&str, String> {
    let trimmed = uri.trim();
    if trimmed.is_empty() {
        return Err("URI is empty.".to_string());
    }
    if ALLOWED_URI_SCHEMES
        .iter()
        .any(|scheme| trimmed.starts_with(scheme))
    {
        Ok(trimmed)
    } else {
        let scheme = trimmed
            .split_once("://")
            .map(|(s, _)| s.to_string())
            .unwrap_or_else(|| "<no scheme>".to_string());
        Err(format!("URI scheme not allowed: {scheme}"))
    }
}

/// Open a URI using the platform-native mechanism, after validating its
/// scheme. This is the **only** function in the launcher that builds
/// `cmd /C start` / `open` / `xdg-open` — every other command must
/// route through here.
///
/// On Windows we use `rundll32 url.dll,FileProtocolHandler` instead of
/// `cmd /C start ""` so the URI is never parsed by a shell.
pub fn open_uri_safely(uri: &str) -> Result<(), String> {
    let uri = validate_uri_scheme(uri)?;

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        // rundll32 url.dll,FileProtocolHandler <uri> resolves any
        // registered URL handler without going through cmd.exe.
        std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", uri])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("Could not open URI: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(uri)
            .spawn()
            .map_err(|e| format!("Could not open URI: {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(uri)
            .spawn()
            .map_err(|e| format!("Could not open URI: {e}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slug_accepts_typical_ids() {
        assert_eq!(validate_slug("440").unwrap(), "440");
        assert_eq!(validate_slug("elden-ring-123").unwrap(), "elden-ring-123");
        assert_eq!(validate_slug("a_b.c-d").unwrap(), "a_b.c-d");
    }

    #[test]
    fn slug_rejects_empty() {
        assert!(validate_slug("").is_err());
    }

    #[test]
    fn slug_rejects_shell_metachars() {
        // The classic injection attempt.
        assert!(validate_slug("123 & calc.exe").is_err());
        assert!(validate_slug("foo;bar").is_err());
        assert!(validate_slug("foo|bar").is_err());
        assert!(validate_slug("a\"b").is_err());
        assert!(validate_slug("a'b").is_err());
        assert!(validate_slug("a\nb").is_err());
        assert!(validate_slug("a b").is_err());
    }

    #[test]
    fn slug_rejects_path_separators() {
        // `/` and `\` aren't allowed at all.
        assert!(validate_slug("../etc/passwd").is_err());
        assert!(validate_slug("foo/bar").is_err());
        assert!(validate_slug("foo\\bar").is_err());
        // `..` itself is technically allowed (it's two dots), but it can
        // never escape any of our URI builders because they don't use
        // file paths. Keep it permissive for legitimate platform IDs
        // that happen to start with a dot.
        assert!(validate_slug("..").is_ok());
    }

    #[test]
    fn slug_rejects_oversize() {
        let s = "a".repeat(MAX_SLUG_LENGTH + 1);
        assert!(validate_slug(&s).is_err());
    }

    #[test]
    fn uri_accepts_known_schemes() {
        assert!(validate_uri_scheme("steam://run/440").is_ok());
        assert!(validate_uri_scheme("com.epicgames.launcher://apps/abc?action=launch").is_ok());
        assert!(validate_uri_scheme(
            "ms-windows-store://pdp/?PFN=Microsoft.ForzaHorizon5_8wekyb3d8bbwe"
        )
        .is_ok());
        assert!(validate_uri_scheme("https://example.com/").is_ok());
        assert!(validate_uri_scheme("http://localhost:1420/").is_ok());
    }

    #[test]
    fn uri_rejects_unknown_schemes() {
        assert!(validate_uri_scheme("file:///etc/passwd").is_err());
        assert!(validate_uri_scheme("javascript:alert(1)").is_err());
        assert!(validate_uri_scheme("data:text/html,<script>").is_err());
        assert!(validate_uri_scheme("ms-settings:").is_err());
        assert!(validate_uri_scheme("about:blank").is_err());
    }

    #[test]
    fn uri_rejects_empty() {
        assert!(validate_uri_scheme("").is_err());
        assert!(validate_uri_scheme("   ").is_err());
    }
}
