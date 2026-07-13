use serde::Serialize;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Instant;
use sysinfo::System;

const FPS_SOURCE_HUD_WEBVIEW: &str = "hud_webview";

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
    /// Identifies that FPS is measured from the launcher's HUD/webview render loop.
    /// It is not a game-process FPS measurement.
    pub fps_source: &'static str,
    pub uptime: String,
}

// Both samplers must live across command calls. In particular, sysinfo computes
// CPU usage from the delta between refreshes, so recreating System on every poll
// produces an invalid first sample instead of CPU usage for the elapsed interval.
lazy_static::lazy_static! {
    static ref FPS_STATE: Arc<Mutex<FpsState>> = Arc::new(Mutex::new(FpsState::default()));
    static ref SYSTEM_SAMPLER: Mutex<SystemSampler> = Mutex::new(SystemSampler::new());
}

struct SystemSampler {
    system: System,
}

impl SystemSampler {
    fn new() -> Self {
        // `new_all` establishes the first CPU counter snapshot. Later command
        // calls refresh the same System and can therefore calculate a delta.
        Self {
            system: System::new_all(),
        }
    }

    fn sample(&mut self) -> (f64, f64) {
        self.system.refresh_cpu_usage();
        self.system.refresh_memory();

        let cpu_percent = normalize_cpu_percent(self.system.global_cpu_usage());
        let ram_mb = bytes_to_rounded_megabytes(self.system.used_memory());
        (cpu_percent, ram_mb)
    }
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
    let mut state = lock_recover(&FPS_STATE);
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
    let (cpu_percent, ram_mb) = lock_recover(&SYSTEM_SAMPLER).sample();
    let uptime_secs = System::uptime();
    let uptime = format!("{}h {}m", uptime_secs / 3600, (uptime_secs % 3600) / 60);

    let (gpu_percent, gpu_vram_mb, gpu_temp_c) = poll_gpu_metrics();

    let fps_state = lock_recover(&FPS_STATE);
    let fps = fps_state.current_fps.round();
    let frame_time_ms = fps_state.current_frame_time_ms;
    drop(fps_state);

    Ok(RealtimeMetrics {
        // sysinfo already reports this value on a 0..=100 percentage scale.
        cpu_percent,
        ram_mb,
        gpu_percent,
        gpu_vram_mb,
        gpu_temp_c,
        fps,
        frame_time_ms: (frame_time_ms * 10.0).round() / 10.0,
        fps_source: FPS_SOURCE_HUD_WEBVIEW,
        uptime,
    })
}

fn lock_recover<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    // Keep telemetry available after a panic in a previous lock holder. The
    // guarded sampler state is still valid enough to refresh on the next poll.
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

fn normalize_cpu_percent(cpu_percent: f32) -> f64 {
    if !cpu_percent.is_finite() {
        return 0.0;
    }

    ((cpu_percent as f64).clamp(0.0, 100.0) * 10.0).round() / 10.0
}

fn bytes_to_rounded_megabytes(bytes: u64) -> f64 {
    (bytes as f64 / 1024.0 / 1024.0).round()
}

fn poll_gpu_metrics() -> (Option<f64>, Option<f64>, Option<f64>) {
    #[cfg(target_os = "windows")]
    {
        try_nvidia_gpu().unwrap_or_default()
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::thread;

    #[test]
    fn keeps_sysinfo_percentage_on_its_native_scale() {
        assert_eq!(normalize_cpu_percent(42.56), 42.6);
        assert_eq!(normalize_cpu_percent(100.0), 100.0);
        assert_eq!(normalize_cpu_percent(-1.0), 0.0);
        assert_eq!(normalize_cpu_percent(150.0), 100.0);
        assert_eq!(normalize_cpu_percent(f32::NAN), 0.0);
    }

    #[test]
    fn converts_memory_bytes_to_rounded_megabytes() {
        assert_eq!(bytes_to_rounded_megabytes(1_572_864), 2.0);
    }

    #[test]
    fn labels_fps_as_a_hud_webview_measurement() {
        let metrics = RealtimeMetrics {
            cpu_percent: 42.6,
            ram_mb: 1024.0,
            gpu_percent: None,
            gpu_vram_mb: None,
            gpu_temp_c: None,
            fps: 60.0,
            frame_time_ms: 16.7,
            fps_source: FPS_SOURCE_HUD_WEBVIEW,
            uptime: "1h 2m".to_owned(),
        };

        let serialized = serde_json::to_value(metrics).expect("metrics should serialize");
        assert_eq!(serialized["fpsSource"], json!("hud_webview"));
        assert_eq!(serialized["cpuPercent"], json!(42.6));
    }

    #[test]
    fn recovers_a_poisoned_sampler_lock() {
        let state = Arc::new(Mutex::new(1_u8));
        let poisoned = Arc::clone(&state);

        let _ = thread::spawn(move || {
            let _guard = poisoned.lock().expect("test lock should initially work");
            panic!("poison the test mutex");
        })
        .join();

        let mut recovered = lock_recover(&state);
        *recovered = 2;
        assert_eq!(*recovered, 2);
    }
}
