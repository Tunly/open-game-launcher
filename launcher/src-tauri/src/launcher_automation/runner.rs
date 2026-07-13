//! Runtime bridge between game actions and the platform automation backends.
//!
//! The request is fully bound before it enters this module. The live Windows
//! branch opens only a fixed provider-client URI, discovers an exact process and
//! top-level window, and invokes semantic UI Automation patterns. It never uses
//! coordinates, keyboard input, OCR, or completion guesses.

use super::providers::{MaintenanceAction, ProviderId};

#[cfg(all(windows, feature = "windows-uiautomation"))]
use super::providers::BlockingState;

pub const WINDOWS_AUTOMATION_WINDOW_TIMEOUT_SECONDS: u64 = 15;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProviderAutomationInvocation {
    pub provider: ProviderId,
    pub action: MaintenanceAction,
    pub game_identity: String,
    pub confirmation_consumed: bool,
}

pub const fn provider_client_start_uri(provider: ProviderId) -> &'static str {
    match provider {
        ProviderId::Steam => "steam://open/main",
        ProviderId::Epic => "com.epicgames.launcher://store",
        ProviderId::Gog => "goggalaxy://openLibrary",
        ProviderId::Ea => "origin2://",
        ProviderId::Ubisoft => "uplay://open",
        ProviderId::Battlenet => "battlenet://",
        ProviderId::Xbox => "ms-xbl-38966778-3f57-4f6e-a6e9-3b81c79fbb3f://",
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProviderAutomationResult {
    StartedAwaitingObservation { detail: String },
    HandoffRequired { reason: String },
    Blocked { reason: String },
    Failed { reason: String },
}

pub trait ProviderAutomationRunner {
    fn run(&self, invocation: &ProviderAutomationInvocation) -> ProviderAutomationResult;
}

#[derive(Debug, Default, Clone, Copy)]
pub struct NativeProviderAutomationRunner;

impl ProviderAutomationRunner for NativeProviderAutomationRunner {
    fn run(&self, invocation: &ProviderAutomationInvocation) -> ProviderAutomationResult {
        #[cfg(all(windows, feature = "windows-uiautomation"))]
        {
            return run_live_windows(invocation);
        }

        #[cfg(not(all(windows, feature = "windows-uiautomation")))]
        {
            let _ = invocation;
            ProviderAutomationResult::Failed {
                reason: "Provider automation is not enabled for this build and operating system."
                    .to_string(),
            }
        }
    }
}

#[cfg(all(windows, feature = "windows-uiautomation"))]
fn run_live_windows(invocation: &ProviderAutomationInvocation) -> ProviderAutomationResult {
    use std::{collections::HashMap, thread, time::Duration};

    use sysinfo::{ProcessesToUpdate, System};

    use super::{
        providers::provider_spec,
        windows::{
            uiautomation_025::LiveWindowsUiaBackend, BackendError, BoundConfirmation,
            WindowsSemanticBackend,
        },
    };

    if invocation.game_identity.trim().is_empty() {
        return ProviderAutomationResult::Blocked {
            reason: "Exact provider game identity is required before automation.".to_string(),
        };
    }
    if let Err(error) =
        crate::commands::uri_safety::open_uri_safely(provider_client_start_uri(invocation.provider))
    {
        return ProviderAutomationResult::Failed {
            reason: format!("Could not start the official provider client: {error}"),
        };
    }

    let live = match LiveWindowsUiaBackend::new() {
        Ok(backend) => backend,
        Err(error) => {
            return ProviderAutomationResult::Failed {
                reason: error.to_string(),
            }
        }
    };
    let semantic = WindowsSemanticBackend;
    let spec = provider_spec(invocation.provider);
    let deadline =
        std::time::Instant::now() + Duration::from_secs(WINDOWS_AUTOMATION_WINDOW_TIMEOUT_SECONDS);

    loop {
        let mut system = System::new();
        system.refresh_processes(ProcessesToUpdate::All, true);
        let process_names = system
            .processes()
            .iter()
            .filter_map(|(pid, process)| {
                let name = process.name().to_string_lossy().into_owned();
                spec.process_matches(&name).then(|| (pid.as_u32(), name))
            })
            .collect::<HashMap<_, _>>();

        let roots = match live
            .top_level_windows(invocation.provider, |pid| process_names.get(&pid).cloned())
        {
            Ok(roots) => roots,
            Err(error) => {
                return ProviderAutomationResult::Failed {
                    reason: error.to_string(),
                }
            }
        };

        match semantic.find_provider_window(&roots, invocation.provider, None) {
            Ok(provider_window) => {
                let now_unix = unix_timestamp();
                let confirmation = invocation.confirmation_consumed.then(|| BoundConfirmation {
                    provider: invocation.provider,
                    game_identity: invocation.game_identity.as_str(),
                    action: invocation.action,
                    expires_at_unix: now_unix + WINDOWS_AUTOMATION_WINDOW_TIMEOUT_SECONDS,
                });
                let recipe = spec.recipe(invocation.action);
                return map_execution_state(semantic.execute(
                    &provider_window,
                    &recipe,
                    &invocation.game_identity,
                    confirmation.as_ref(),
                    now_unix,
                ));
            }
            Err(BackendError::ProviderWindowNotFound) if std::time::Instant::now() < deadline => {
                thread::sleep(Duration::from_millis(250));
            }
            Err(BackendError::ProviderWindowNotFound) => {
                return ProviderAutomationResult::Blocked {
                    reason: "The official provider client started, but no exact provider process/window match appeared within 15 seconds."
                        .to_string(),
                }
            }
            Err(BackendError::AmbiguousProviderWindow) => {
                return ProviderAutomationResult::Blocked {
                    reason: "Multiple provider windows matched; automation stopped without guessing."
                        .to_string(),
                }
            }
            Err(error) => {
                return ProviderAutomationResult::Failed {
                    reason: error.to_string(),
                }
            }
        }
    }
}

#[cfg(all(windows, feature = "windows-uiautomation"))]
fn map_execution_state(state: super::windows::ExecutionState) -> ProviderAutomationResult {
    match state {
        super::windows::ExecutionState::StartedAwaitingObservation { proof } => {
            ProviderAutomationResult::StartedAwaitingObservation {
                detail: format!("Provider action started; awaiting {proof:?}."),
            }
        }
        super::windows::ExecutionState::HandoffRequired { state } => {
            ProviderAutomationResult::HandoffRequired {
                reason: blocking_state_reason(state),
            }
        }
        super::windows::ExecutionState::Blocked { reason } => {
            ProviderAutomationResult::Blocked { reason }
        }
        super::windows::ExecutionState::Failed { reason } => {
            ProviderAutomationResult::Failed { reason }
        }
    }
}

#[cfg(all(windows, feature = "windows-uiautomation"))]
fn blocking_state_reason(state: BlockingState) -> String {
    format!("Provider client requires user interaction: {state:?}.")
}

#[cfg(all(windows, feature = "windows-uiautomation"))]
fn unix_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
