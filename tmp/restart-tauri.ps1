$targets = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'tauri dev|vite --host 127.0.0.1 --port 1420' -or $_.Name -eq 'open-game-launcher.exe' }
$targets | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
