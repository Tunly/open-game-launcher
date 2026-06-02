use std::process::Command;

/// Copies the family invite code to the clipboard and returns it.
#[tauri::command]
pub fn copy_family_invite(invite_code: String) -> Result<String, String> {
    if invite_code.is_empty() {
        return Err("Invite code is empty".to_string());
    }
    let code = invite_code.to_uppercase();
    let result = Command::new("cmd")
        .args(["/C", &format!("echo {} | clip", code)])
        .output();
    if let Err(e) = result {
        return Err(format!("Could not copy to clipboard: {e}"));
    }
    Ok(code)
}
