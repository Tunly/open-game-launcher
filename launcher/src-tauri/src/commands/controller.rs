use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ControllerDevice {
    pub id: String,
    pub name: String,
    pub vendor_id: Option<u16>,
    pub product_id: Option<u16>,
    pub controller_type: String,
    pub power_level: Option<String>,
    pub is_connected: bool,
    pub source: String,
}

fn classify_controller(name: &str) -> String {
    let lower = name.to_lowercase();
    if lower.contains("xbox") || lower.contains("xinput") {
        "xbox".to_string()
    } else if lower.contains("dualsense")
        || lower.contains("dualshock")
        || lower.contains("playstation")
        || lower.contains("wireless controller")
    {
        "playstation".to_string()
    } else if lower.contains("switch")
        || lower.contains("joy-con")
        || lower.contains("pro controller")
    {
        "switch".to_string()
    } else if lower.contains("steam") {
        "steam".to_string()
    } else {
        "generic".to_string()
    }
}

#[tauri::command]
pub fn list_controllers() -> Result<Vec<ControllerDevice>, String> {
    let mut gilrs =
        gilrs::Gilrs::new().map_err(|error| format!("Controller backend unavailable: {error}"))?;

    while gilrs.next_event().is_some() {}

    let controllers = gilrs
        .gamepads()
        .map(|(id, gamepad)| {
            let name = gamepad.name().to_string();
            ControllerDevice {
                id: id.to_string(),
                controller_type: classify_controller(&name),
                name,
                vendor_id: gamepad.vendor_id(),
                product_id: gamepad.product_id(),
                power_level: Some(format!("{:?}", gamepad.power_info())),
                is_connected: gamepad.is_connected(),
                source: "gilrs".to_string(),
            }
        })
        .collect();

    Ok(controllers)
}
