pub mod providers;
pub mod runner;

// AutomationSession (state machine for provider-client maintenance) is
// unreachable from any live code path: providers.rs + runner.rs, the only
// modules with production consumers (commands/games/actions.rs), never import
// it. Compile it only when explicitly requested so the default build stays
// free of the dead module and its ~570 lines of test-island tests.
#[cfg(feature = "automation-session")]
pub mod session;

// Linux/macOS UI-automation backends. runner.rs only wires the Windows
// backend; on Linux/macOS NativeProviderAutomationRunner::run returns Failed.
// Gate on the matching feature (in addition to target_os) so they do not
// compile into the default build.
#[cfg(all(target_os = "linux", feature = "linux-atspi"))]
pub mod linux;

#[cfg(all(target_os = "linux", feature = "linux-atspi"))]
pub mod linux_live;

#[cfg(all(target_os = "macos", feature = "macos-axuielement"))]
pub mod macos;

#[cfg(all(target_os = "windows", feature = "windows-uiautomation"))]
pub mod windows;
