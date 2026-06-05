use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};

lazy_static! {
    static ref CONTROLLER_RUNTIME: Mutex<Option<ControllerRuntimeHandle>> = Mutex::new(None);
}

struct ControllerRuntimeHandle {
    stop: Arc<AtomicBool>,
    thread: Option<thread::JoinHandle<()>>,
}

impl ControllerRuntimeHandle {
    fn stop(mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(handle) = self.thread.take() {
            let _ = handle.join();
        }
    }
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyControllerLayoutRequest {
    pub game_id: String,
    pub layout: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ControllerRuntimeStatus {
    pub active_game_id: Option<String>,
    pub active_layout_name: Option<String>,
    pub active_template: Option<String>,
    pub native_passthrough_ready: bool,
    pub keyboard_mouse_emulation_ready: bool,
    pub vigem_bus_detected: bool,
    pub driver_message: String,
    pub config_path: Option<String>,
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

#[tauri::command]
pub fn apply_controller_layout(
    app: AppHandle,
    input: ApplyControllerLayoutRequest,
) -> Result<ControllerRuntimeStatus, String> {
    let game_id = sanitize_file_component(&input.game_id)?;
    let layout_name = input
        .layout
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or("Controller Layout")
        .to_string();
    let template = input
        .layout
        .get("template")
        .and_then(Value::as_str)
        .unwrap_or("gamepad")
        .to_string();

    let dir = controller_runtime_dir(&app)?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Could not create controller runtime dir: {error}"))?;

    let active_path = dir.join("active-controller-layout.json");
    let game_path = dir.join(format!("{game_id}.json"));
    let payload = serde_json::json!({
        "gameId": input.game_id,
        "layout": input.layout,
        "activatedAt": chrono::Utc::now().to_rfc3339(),
        "runtime": runtime_mode_for_template(&template),
    });
    let serialized = serde_json::to_string_pretty(&payload)
        .map_err(|error| format!("Could not serialize controller layout: {error}"))?;
    fs::write(&active_path, &serialized)
        .map_err(|error| format!("Could not write active controller layout: {error}"))?;
    fs::write(&game_path, serialized)
        .map_err(|error| format!("Could not write game controller layout: {error}"))?;

    restart_controller_runtime(&template, &input.layout)?;

    let status = runtime_status_from_payload(Some(payload), Some(active_path));
    let _ = app.emit("controller-layout-applied", &status);
    println!(
        "[open-game-launcher] Controller layout '{layout_name}' active for {} ({template})",
        input.game_id
    );
    Ok(status)
}

#[tauri::command]
pub fn clear_controller_layout(app: AppHandle) -> Result<ControllerRuntimeStatus, String> {
    let dir = controller_runtime_dir(&app)?;
    let active_path = dir.join("active-controller-layout.json");
    if active_path.exists() {
        fs::remove_file(&active_path)
            .map_err(|error| format!("Could not clear active controller layout: {error}"))?;
    }
    stop_controller_runtime();
    let status = runtime_status_from_payload(None, None);
    let _ = app.emit("controller-layout-cleared", &status);
    Ok(status)
}

#[tauri::command]
pub fn get_controller_runtime_status(app: AppHandle) -> Result<ControllerRuntimeStatus, String> {
    let active_path = controller_runtime_dir(&app)?.join("active-controller-layout.json");
    if !active_path.exists() {
        return Ok(runtime_status_from_payload(None, None));
    }

    let payload = fs::read_to_string(&active_path)
        .ok()
        .and_then(|contents| serde_json::from_str::<Value>(&contents).ok());
    Ok(runtime_status_from_payload(payload, Some(active_path)))
}

fn controller_runtime_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Could not resolve app config dir: {error}"))?;
    Ok(base.join("controller-runtime"))
}

fn sanitize_file_component(value: &str) -> Result<String, String> {
    let sanitized = value
        .chars()
        .map(|character| match character {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' | '.' => character,
            _ => '_',
        })
        .collect::<String>();
    if sanitized.trim_matches('_').is_empty() {
        Err("Game id must not be empty.".to_string())
    } else {
        Ok(sanitized)
    }
}

fn stop_controller_runtime() {
    if let Ok(mut runtime) = CONTROLLER_RUNTIME.lock() {
        if let Some(handle) = runtime.take() {
            handle.stop();
        }
    }
}

fn restart_controller_runtime(template: &str, layout: &Value) -> Result<(), String> {
    stop_controller_runtime();
    if template != "keyboardMouse" {
        return Ok(());
    }

    let bindings = extract_keyboard_mouse_bindings(layout);
    if bindings.is_empty() {
        return Ok(());
    }

    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = Arc::clone(&stop);
    let thread = thread::Builder::new()
        .name("og-controller-keyboard-mouse-runtime".to_string())
        .spawn(move || run_keyboard_mouse_runtime(bindings, thread_stop))
        .map_err(|error| format!("Could not start controller runtime: {error}"))?;

    let mut runtime = CONTROLLER_RUNTIME
        .lock()
        .map_err(|_| "Controller runtime lock poisoned.".to_string())?;
    *runtime = Some(ControllerRuntimeHandle {
        stop,
        thread: Some(thread),
    });
    Ok(())
}

fn extract_keyboard_mouse_bindings(layout: &Value) -> HashMap<String, String> {
    layout
        .get("bindings")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|binding| {
            let input = binding.get("input")?.as_str()?.to_string();
            let output = binding.get("output")?.as_str()?.to_string();
            if virtual_output_supported(&output) {
                Some((input, output))
            } else {
                None
            }
        })
        .collect()
}

fn virtual_output_supported(output: &str) -> bool {
    key_code_for_output(output).is_some() || mouse_button_for_output(output).is_some()
}

fn run_keyboard_mouse_runtime(bindings: HashMap<String, String>, stop: Arc<AtomicBool>) {
    let Ok(mut gilrs) = gilrs::Gilrs::new() else {
        return;
    };

    while !stop.load(Ordering::SeqCst) {
        while let Some(event) = gilrs.next_event() {
            match event.event {
                gilrs::EventType::ButtonPressed(button, _) => {
                    if let Some(output) = bindings.get(input_name_for_button(button)) {
                        send_virtual_output(output, true);
                    }
                }
                gilrs::EventType::ButtonReleased(button, _) => {
                    if let Some(output) = bindings.get(input_name_for_button(button)) {
                        send_virtual_output(output, false);
                    }
                }
                _ => {}
            }
        }
        thread::sleep(Duration::from_millis(8));
    }
}

fn input_name_for_button(button: gilrs::Button) -> &'static str {
    match button {
        gilrs::Button::South => "A / Cross",
        gilrs::Button::East => "B / Circle",
        gilrs::Button::West => "X / Square",
        gilrs::Button::North => "Y / Triangle",
        gilrs::Button::LeftTrigger => "LB / L1",
        gilrs::Button::RightTrigger => "RB / R1",
        gilrs::Button::LeftTrigger2 => "LT / L2",
        gilrs::Button::RightTrigger2 => "RT / R2",
        gilrs::Button::LeftThumb => "Left Stick Click",
        gilrs::Button::RightThumb => "Right Stick Click",
        gilrs::Button::DPadUp => "D-Pad Up",
        gilrs::Button::DPadDown => "D-Pad Down",
        gilrs::Button::DPadLeft => "D-Pad Left",
        gilrs::Button::DPadRight => "D-Pad Right",
        gilrs::Button::Start => "Menu / Start",
        gilrs::Button::Select => "View / Select",
        _ => "",
    }
}

fn key_code_for_output(output: &str) -> Option<u16> {
    match output {
        "W" => Some(0x57),
        "A" => Some(0x41),
        "S" => Some(0x53),
        "D" => Some(0x44),
        "E" => Some(0x45),
        "F" => Some(0x46),
        "R" => Some(0x52),
        "Space" => Some(0x20),
        "Left Shift" => Some(0xA0),
        "Left Ctrl" => Some(0xA2),
        "Tab" => Some(0x09),
        "Escape" => Some(0x1B),
        "Enter" => Some(0x0D),
        _ => None,
    }
}

fn mouse_button_for_output(output: &str) -> Option<u32> {
    match output {
        "Mouse Left" => Some(0),
        "Mouse Right" => Some(1),
        "Mouse Middle" => Some(2),
        _ => None,
    }
}

#[cfg(target_os = "windows")]
fn send_virtual_output(output: &str, pressed: bool) {
    if let Some(key_code) = key_code_for_output(output) {
        send_keyboard_input(key_code, pressed);
        return;
    }
    if let Some(button) = mouse_button_for_output(output) {
        send_mouse_input(button, pressed);
    }
}

#[cfg(not(target_os = "windows"))]
fn send_virtual_output(_output: &str, _pressed: bool) {}

#[cfg(target_os = "windows")]
fn send_keyboard_input(key_code: u16, pressed: bool) {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP,
    };

    let input = INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: key_code,
                wScan: 0,
                dwFlags: if pressed { 0 } else { KEYEVENTF_KEYUP },
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    unsafe {
        SendInput(1, &input, std::mem::size_of::<INPUT>() as i32);
    }
}

#[cfg(target_os = "windows")]
fn send_mouse_input(button: u32, pressed: bool) {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
        MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP,
        MOUSEINPUT,
    };

    let flags = match (button, pressed) {
        (0, true) => MOUSEEVENTF_LEFTDOWN,
        (0, false) => MOUSEEVENTF_LEFTUP,
        (1, true) => MOUSEEVENTF_RIGHTDOWN,
        (1, false) => MOUSEEVENTF_RIGHTUP,
        (2, true) => MOUSEEVENTF_MIDDLEDOWN,
        (2, false) => MOUSEEVENTF_MIDDLEUP,
        _ => return,
    };
    let input = INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx: 0,
                dy: 0,
                mouseData: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    unsafe {
        SendInput(1, &input, std::mem::size_of::<INPUT>() as i32);
    }
}

fn runtime_mode_for_template(template: &str) -> &'static str {
    match template {
        "keyboardMouse" => "sendinput-emulation",
        "disabled" => "disabled",
        _ => "native-passthrough",
    }
}

fn runtime_status_from_payload(
    payload: Option<Value>,
    config_path: Option<PathBuf>,
) -> ControllerRuntimeStatus {
    let layout = payload.as_ref().and_then(|value| value.get("layout"));
    let active_template = layout
        .and_then(|value| value.get("template"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let vigem_bus_detected = is_vigem_bus_detected();
    let keyboard_mouse_emulation_ready = true;
    let driver_message = if active_template.as_deref() == Some("keyboardMouse") {
        "Keyboard/mouse runtime is active via Windows SendInput. ViGEmBus is only needed for virtual gamepad drivers.".to_string()
    } else if vigem_bus_detected {
        "ViGEmBus detected. Native passthrough is active and virtual gamepad adapters can be added."
            .to_string()
    } else {
        "Native controller passthrough is active. Games with controller support can read the device directly.".to_string()
    };

    ControllerRuntimeStatus {
        active_game_id: payload
            .as_ref()
            .and_then(|value| value.get("gameId"))
            .and_then(Value::as_str)
            .map(str::to_string),
        active_layout_name: layout
            .and_then(|value| value.get("name"))
            .and_then(Value::as_str)
            .map(str::to_string),
        active_template,
        native_passthrough_ready: true,
        keyboard_mouse_emulation_ready,
        vigem_bus_detected,
        driver_message,
        config_path: config_path.map(|path| path.to_string_lossy().to_string()),
    }
}

#[cfg(target_os = "windows")]
fn is_vigem_bus_detected() -> bool {
    use winreg::{enums::HKEY_LOCAL_MACHINE, RegKey};

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    hklm.open_subkey("SYSTEM\\CurrentControlSet\\Services\\ViGEmBus")
        .is_ok()
        || hklm
            .open_subkey("SOFTWARE\\Nefarius Software Solutions e.U.\\ViGEm Bus Driver")
            .is_ok()
}

#[cfg(not(target_os = "windows"))]
fn is_vigem_bus_detected() -> bool {
    false
}
