$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:APPDATA\npm;$env:LOCALAPPDATA\Microsoft\WinGet\Packages\BrechtSanders.WinLibs.POSIX.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe\mingw64\bin;$env:PATH"
$env:RUSTUP_TOOLCHAIN = 'stable-x86_64-pc-windows-gnu'
$env:CC = 'x86_64-w64-mingw32-gcc'
$env:CXX = 'x86_64-w64-mingw32-g++'
$env:AR = 'x86_64-w64-mingw32-ar'
$env:CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER = 'x86_64-w64-mingw32-gcc'
pnpm tauri dev --target x86_64-pc-windows-gnu
