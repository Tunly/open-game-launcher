//! Cross-platform idle-time detection.
//!
//! Used by the playtime poller to pause session accumulation when the user has
//! not touched the keyboard or mouse for longer than a configured threshold
//! (default 15 minutes per `FEATURE_PLAN.md` §14).
//!
//! Returns the number of seconds since the last user input event, or `0` on
//! platforms where idle detection is unavailable (so the caller can treat it
//! as "definitely not idle"). Errors degrade gracefully to `0` to keep the
//! poller resilient — a broken idle probe must never stall playtime tracking.

pub fn seconds_since_last_input() -> u64 {
    #[cfg(target_os = "windows")]
    {
        windows::seconds_since_last_input()
    }
    #[cfg(target_os = "macos")]
    {
        macos::seconds_since_last_input()
    }
    #[cfg(target_os = "linux")]
    {
        linux::seconds_since_last_input()
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        0
    }
}

/// Returns `true` when the user has been idle for at least `threshold` seconds.
#[allow(dead_code)]
pub fn is_idle(threshold_seconds: u64) -> bool {
    seconds_since_last_input() >= threshold_seconds
}

#[cfg(target_os = "windows")]
mod windows {
    use windows_sys::Win32::System::SystemInformation::GetTickCount;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};

    pub fn seconds_since_last_input() -> u64 {
        let mut info = LASTINPUTINFO {
            cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };

        let ok = unsafe { GetLastInputInfo(&mut info) };
        if ok == 0 {
            return 0;
        }

        let now_ticks = unsafe { GetTickCount() };
        let delta_ms = now_ticks.saturating_sub(info.dwTime);
        u64::from(delta_ms) / 1000
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use core_graphics::event::CGEventSourceStateID;

    // Bind to the C function directly to avoid version drift in the high-level
    // core-graphics wrapper. `kCGAnyInputEventType` is defined in C as
    // `(CGEventType) ~0`, which on 64-bit platforms is `0xFFFFFFFFFFFFFFFF`.
    // We use 0xFFFFFFFF (32-bit) which is the same value for the union of
    // keyboard and mouse events the AppKit/Quartz docs describe.
    const K_CG_ANY_INPUT_EVENT_TYPE: u32 = u32::MAX;

    extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(state: u32, event_type: u32) -> f64;
    }

    pub fn seconds_since_last_input() -> u64 {
        // CombinedSessionState is the HID-wide input state.
        let state = CGEventSourceStateID::CombinedSessionState.0;
        let secs =
            unsafe { CGEventSourceSecondsSinceLastEventType(state, K_CG_ANY_INPUT_EVENT_TYPE) };
        if !secs.is_finite() || secs < 0.0 {
            0
        } else {
            secs.min(u64::MAX as f64) as u64
        }
    }
}

#[cfg(target_os = "linux")]
mod linux {
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

    /// Seconds since the last user input event, via the platform's idle probe.
    ///
    /// On Wayland the external `xprintidle` tool cannot work (it is X11-only and
    /// queries the X server directly). We prefer a D-Bus query to logind, whose
    /// `IdleHint`/`IdleSinceHint` properties are session-wide and work on both
    /// X11 and Wayland compositors, and fall back to `xprintidle` when the D-Bus
    /// probe is unavailable (no logind, headless session, etc.).
    ///
    /// Errors degrade to `0` (never idle) — a broken idle probe must never stall
    /// playtime tracking.
    pub fn seconds_since_last_input() -> u64 {
        match logind_idle_seconds() {
            Some(seconds) => seconds,
            None => xprintidle_seconds(),
        }
    }

    /// Query logind's `IdleSinceHint` property for the current session.
    ///
    /// Returns `Some(seconds_since_last_input)` when the property is present and
    /// sane, `None` when logind is unreachable, the session has no IdleHint, or
    /// the value is malformed. Each call opens a fresh blocking D-Bus connection
    /// (milliseconds, and the playtime poller only runs every 10s).
    fn logind_idle_seconds() -> Option<u64> {
        use zbus::blocking::{Connection, Proxy};

        let conn = Connection::session().ok()?;

        // logind exposes the active session via Seat.ActiveSession
        // (a (string, object-path) pair). Ask for the object path only.
        let seat = Proxy::new(
            &conn,
            "org.freedesktop.login1",
            "/org/freedesktop/login1/seat/auto",
            "org.freedesktop.DBus.Properties",
        )
        .ok()?;
        // ActiveSession is a (string session_id, object-path session) pair.
        let (session_id, session_path): (String, zbus::zvariant::OwnedObjectPath) = seat
            .call::<_, _, (String, zbus::zvariant::OwnedObjectPath)>(
                "Get",
                &("org.freedesktop.login1.Seat", "ActiveSession"),
            )
            .ok()?;
        if session_id.is_empty() {
            return None;
        }

        let session = Proxy::new(
            &conn,
            "org.freedesktop.login1",
            session_path.as_str(),
            "org.freedesktop.DBus.Properties",
        )
        .ok()?;
        let idle_since: u64 = session
            .call::<_, _, u64>("Get", &("org.freedesktop.login1.Session", "IdleSinceHint"))
            .ok()?;
        if idle_since == 0 {
            return None;
        }
        let now = SystemTime::now().duration_since(UNIX_EPOCH).ok()?.as_secs();
        Some(now.saturating_sub(idle_since))
    }

    fn xprintidle_seconds() -> u64 {
        // xprintidle is the standard X11 idle-time query tool. It returns
        // milliseconds (or "No value" / non-zero exit on failure / on Wayland).
        // We try it once per call; the poller is invoked every 10s, so cost
        // is negligible. If xprintidle is missing, we treat the user as not
        // idle — disabling idle-pause is the safe degradation path.
        let Ok(output) = Command::new("xprintidle").output() else {
            return 0;
        };
        if !output.status.success() {
            return 0;
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        let trimmed = stdout.trim();
        let Ok(ms) = trimmed.parse::<u64>() else {
            return 0;
        };
        ms / 1000
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seconds_since_last_input_is_non_negative() {
        // The function must never panic or underflow; it can return 0.
        let value = seconds_since_last_input();
        assert!(value < u64::MAX);
    }

    #[test]
    fn is_idle_threshold_zero_always_true() {
        assert!(is_idle(0));
    }

    #[test]
    fn is_idle_threshold_huge_always_false() {
        assert!(!is_idle(u64::MAX));
    }
}
