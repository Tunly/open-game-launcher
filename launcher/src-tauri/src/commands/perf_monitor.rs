use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use sysinfo::System;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RealtimeMetrics {
    pub cpu_percent: f64,
    pub ram_mb: f64,
    pub gpu_percent: Option<f64>,
    pub gpu_vram_mb: Option<f64>,
    pub gpu_temp_c: Option<f64>,
    pub fps: f64,
    pub frame_time_ms: f64,
    pub uptime: String,
}

// Shared FPS counter state
lazy_static::lazy_static! {
    static ref FPS_STATE: Arc<Mutex<FpsState>> = Arc::new(Mutex::new(FpsState::default()));
}

#[derive(Default)]
struct FpsState {
    frame_count: u64,
    last_time: Option<Instant>,
    current_fps: f64,
    current_frame_time_ms: f64,
}

/// Call this every rendered frame from the frontend to compute FPS.
#[tauri::command]
pub fn report_frame_rendered() {
    // If a previous holder of the lock panicked, the mutex becomes
    // "poisoned". `.unwrap()` on a poisoned lock would crash the FPS sampler
    // for the rest of the session; instead we recover the inner value via
    // `into_inner()` and keep the FPS counter running.
    let mut state = match FPS_STATE.lock() {
        Ok(g) => g,
        Err(poisoned) => poisoned.into_inner(),
    };
    let now = Instant::now();
    if let Some(last) = state.last_time {
        let delta = now.duration_since(last).as_secs_f64() * 1000.0;
        state.current_frame_time_ms = delta;
        // smooth
        let alpha = 0.1;
        state.current_fps = state.current_fps * (1.0 - alpha) + (1000.0 / delta.max(1.0)) * alpha;
    } else {
        state.current_fps = 0.0;
    }
    state.last_time = Some(now);
    state.frame_count += 1;
}

#[tauri::command]
pub fn poll_performance_metrics() -> Result<RealtimeMetrics, String> {
    let mut sys = System::new_all();
    sys.refresh_all();

    let cpu = sys.global_cpu_usage() as f64;
    let used = sys.used_memory();
    let ram_mb = (used as f64 / 1024.0 / 1024.0).round();
    let uptime_secs = System::uptime();
    let uptime = format!("{}h {}m", uptime_secs / 3600, (uptime_secs % 3600) / 60);

    let (gpu_percent, gpu_vram_mb, gpu_temp_c) = poll_gpu_metrics();

    // Same poisoned-lock recovery as in `report_frame_rendered`. A poisoned
    // lock means a previous thread panicked while holding it; we still want
    // the overlay to keep showing metrics instead of crashing the backend.
    let fps_state = match FPS_STATE.lock() {
        Ok(g) => g,
        Err(poisoned) => poisoned.into_inner(),
    };
    let fps = fps_state.current_fps.round();
    let frame_time_ms = fps_state.current_frame_time_ms;
    drop(fps_state);

    Ok(RealtimeMetrics {
        cpu_percent: (cpu * 100.0).round(),
        ram_mb,
        gpu_percent,
        gpu_vram_mb,
        gpu_temp_c,
        fps,
        frame_time_ms: (frame_time_ms * 10.0).round() / 10.0,
        uptime,
    })
}

fn poll_gpu_metrics() -> (Option<f64>, Option<f64>, Option<f64>) {
    #[cfg(target_os = "windows")]
    {
        match try_nvidia_gpu() {
            Some(metrics) => metrics,
            None => (None, None, None),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        (None, None, None)
    }
}

#[cfg(target_os = "windows")]
fn try_nvidia_gpu() -> Option<(Option<f64>, Option<f64>, Option<f64>)> {
    use nvml_wrapper::{enum_wrappers::device::TemperatureSensor, Nvml};

    let nvml = Nvml::init().ok()?;
    let device = nvml.device_by_index(0).ok()?;

    let util = device.utilization_rates().ok()?;
    let mem = device.memory_info().ok()?;
    let temp = device.temperature(TemperatureSensor::Gpu).ok()?;

    let gpu_pct = Some(util.gpu as f64);
    let vram_mb = Some((mem.used / 1024 / 1024) as f64);
    let temp_c = Some(temp as f64);

    Some((gpu_pct, vram_mb, temp_c))
}
