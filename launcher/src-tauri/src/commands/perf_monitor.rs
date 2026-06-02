use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct RealtimeMetrics {
    pub cpu_percent: f64,
    pub ram_mb: f64,
    pub gpu_percent: Option<f64>,
    pub fps: f64,
    pub frame_time_ms: f64,
    pub uptime: String,
}

#[tauri::command]
pub fn poll_performance_metrics() -> Result<RealtimeMetrics, String> {
    let mut sys = sysinfo::System::new_all();
    sys.refresh_all();
    let cpu = sys.global_cpu_usage() as f64;
    let used = sys.used_memory();
    let total = sys.total_memory();
    let ram_mb = (used as f64 / 1024.0 / 1024.0).round();
    let uptime_secs = sysinfo::System::uptime();
    let uptime = format!("{}h {}m", uptime_secs / 3600, (uptime_secs % 3600) / 60);

    Ok(RealtimeMetrics {
        cpu_percent: (cpu * 100.0).round(),
        ram_mb,
        gpu_percent: None, // GPU metrics require platform-specific C bindings — TODO in S4 overlay phase
        fps: 0.0,
        frame_time_ms: 0.0,
        uptime,
    })
}
