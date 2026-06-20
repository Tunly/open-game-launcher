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

    pub fn seconds_since_last_input() -> u64 {
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
