use std::io::Write;
use std::process::{Command, Stdio};

/// Copies the family invite code to the clipboard and returns it.
#[tauri::command]
pub fn copy_family_invite(invite_code: String) -> Result<String, String> {
    if invite_code.is_empty() {
        return Err("Invite code is empty".to_string());
    }
    let code = invite_code.to_uppercase();

    // Validate: only A-Z, 0-9 (and length) so a malicious caller cannot smuggle
    // shell metacharacters. Even though we no longer route through `cmd /C`, we
    // also do not want to write arbitrary user-controlled bytes to the
    // clipboard.
    if code.len() > 32 || !code.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err("Invite code must be 1-32 alphanumeric characters".to_string());
    }

    #[cfg(windows)]
    {
        // Pipe the code via stdin so we never invoke a shell. The previous
        // implementation used `cmd /C echo {} | clip` which is a shell-
        // injection sink: a code containing `&` or `|` would have been
        // interpreted by cmd.exe.
        let mut child = Command::new("clip")
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Could not start clip.exe: {e}"))?;
        if let Some(stdin) = child.stdin.as_mut() {
            stdin
                .write_all(code.as_bytes())
                .map_err(|e| format!("Could not write to clip.exe stdin: {e}"))?;
        }
        let status = child
            .wait()
            .map_err(|e| format!("Could not wait for clip.exe: {e}"))?;
        if !status.success() {
            return Err(format!(
                "clip.exe exited with non-zero status: {status}"
            ));
        }
    }

    #[cfg(not(windows))]
    {
        // On non-Windows hosts we cannot use clip.exe. Use the platform
        // clipboard via `pbcopy` (mac) / `xclip` / `xsel` (linux). We avoid
        // the shell by spawning the binary directly with stdin.
        let bin = if cfg!(target_os = "macos") { "pbcopy" } else { "xclip" };
        let mut child = Command::new(bin);
        if bin == "xclip" {
            child.args(["-selection", "clipboard"]);
        }
        let mut child = child
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Could not start {bin}: {e}"))?;
        if let Some(stdin) = child.stdin.as_mut() {
            stdin
                .write_all(code.as_bytes())
                .map_err(|e| format!("Could not write to {bin} stdin: {e}"))?;
        }
        let status = child
            .wait()
            .map_err(|e| format!("Could not wait for {bin}: {e}"))?;
        if !status.success() {
            return Err(format!("{bin} exited with non-zero status: {status}"));
        }
    }

    Ok(code)
}
