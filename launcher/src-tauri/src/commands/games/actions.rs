use std::{
    collections::HashMap,
    path::Path,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

use chrono::{Duration as ChronoDuration, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::launcher_automation::{
    providers::{MaintenanceAction, ProviderId},
    runner::{
        NativeProviderAutomationRunner, ProviderAutomationInvocation, ProviderAutomationResult,
        ProviderAutomationRunner,
    },
};

use super::{
    check_game_updates, is_manual_game, is_og_managed_install_path, launcher_key_from_source,
    normalize_game_id, open_uri, read_installed_games_cache_result, repair_game_files,
    uninstall_local_game, uninstall_xbox_game, verify_game_files,
    xbox_package_family_name_for_game, GameStatus, InstalledGame,
};

const XBOX_CLIENT_URI: &str = "ms-xbl-38966778-3f57-4f6e-a6e9-3b81c79fbb3f://";
const CONFIRMATION_GRANT_TTL: Duration = Duration::from_secs(120);
static CONFIRMATION_GRANTS: OnceLock<Mutex<ConfirmationGrantStore>> = OnceLock::new();
const ALL_GAME_ACTIONS: [GameAction; 8] = [
    GameAction::Support,
    GameAction::Verify,
    GameAction::Repair,
    GameAction::CheckUpdate,
    GameAction::Update,
    GameAction::Uninstall,
    GameAction::RemoveFromLibrary,
    GameAction::OpenProvider,
];

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum GameAction {
    Support,
    Verify,
    Repair,
    CheckUpdate,
    Update,
    Uninstall,
    RemoveFromLibrary,
    OpenProvider,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[allow(dead_code)] // Reserved by the cross-layer action contract for later verified adapters.
pub enum GameActionMode {
    LocalReadOnly,
    LocalManaged,
    ProviderAutomation,
    OsAutomation,
    UserHandoff,
    NotApplicable,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GameActionOutcome {
    Completed,
    HandoffRequired,
    NotNeeded,
    Blocked,
    Failed,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameActionCapability {
    pub action: GameAction,
    pub available: bool,
    pub completion_observable: bool,
    pub destructive: bool,
    pub label: String,
    pub mode: GameActionMode,
    pub reason: String,
    pub requires_confirmation: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunGameActionInput {
    pub action: GameAction,
    pub game_id: String,
    pub expected_provider: String,
    pub expected_title: String,
    #[serde(default)]
    pub confirmation_token: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareGameActionConfirmationInput {
    pub action: GameAction,
    pub game_id: String,
    pub expected_provider: String,
    pub expected_title: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareGameActionConfirmationResult {
    pub game_id: String,
    pub action: GameAction,
    pub confirmation_token: String,
    pub expires_at: String,
    pub expires_in_seconds: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameActionResult {
    pub action: GameAction,
    pub details: Vec<String>,
    pub game_id: String,
    pub library_changed: bool,
    pub message: String,
    pub outcome: GameActionOutcome,
    pub provider: String,
    pub rescan_recommended: bool,
    pub session_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ConfirmationBinding {
    game_id: String,
    action: GameAction,
    provider: String,
    provider_game_identity: String,
    title: String,
}

#[derive(Debug, Clone)]
struct ConfirmationGrant {
    binding: ConfirmationBinding,
    expires_at: Instant,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ConfirmationGrantError {
    InvalidOrUsed,
    Expired,
    BindingMismatch,
}

impl ConfirmationGrantError {
    fn message(self) -> &'static str {
        match self {
            Self::InvalidOrUsed => "Confirmation grant is invalid or has already been used.",
            Self::Expired => "Confirmation grant expired before the action could run.",
            Self::BindingMismatch => {
                "Confirmation grant does not match the selected game, provider, title, or action."
            }
        }
    }
}

#[derive(Debug, Default)]
struct ConfirmationGrantStore {
    grants: HashMap<String, ConfirmationGrant>,
}

impl ConfirmationGrantStore {
    fn issue(&mut self, binding: ConfirmationBinding, now: Instant) -> String {
        self.grants.retain(|_, grant| grant.expires_at > now);
        let token = Uuid::new_v4().to_string();
        self.grants.insert(
            token.clone(),
            ConfirmationGrant {
                binding,
                expires_at: now + CONFIRMATION_GRANT_TTL,
            },
        );
        token
    }

    fn consume(
        &mut self,
        token: &str,
        binding: &ConfirmationBinding,
        now: Instant,
    ) -> Result<(), ConfirmationGrantError> {
        let Some(grant) = self.grants.remove(token) else {
            return Err(ConfirmationGrantError::InvalidOrUsed);
        };
        if grant.expires_at <= now {
            return Err(ConfirmationGrantError::Expired);
        }
        if &grant.binding != binding {
            return Err(ConfirmationGrantError::BindingMismatch);
        }
        Ok(())
    }

    #[cfg(test)]
    fn insert_for_test(&mut self, token: &str, binding: ConfirmationBinding, expires_at: Instant) {
        self.grants.insert(
            token.to_string(),
            ConfirmationGrant {
                binding,
                expires_at,
            },
        );
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum PlannedExecutor {
    LocalVerify,
    LocalCheckUpdate,
    LocalRepair,
    LocalUninstall,
    XboxPackageUninstall,
    RemoveLibraryEntry,
    ProviderAutomation(ProviderAutomationInvocation),
    Handoff(String),
    Blocked,
}

#[derive(Debug, Clone)]
struct PlannedGameAction {
    mode: GameActionMode,
    available: bool,
    completion_observable: bool,
    destructive: bool,
    requires_confirmation: bool,
    label: String,
    reason: String,
    executor: PlannedExecutor,
}

impl PlannedGameAction {
    fn capability(self, action: GameAction) -> GameActionCapability {
        GameActionCapability {
            action,
            available: self.available,
            completion_observable: self.completion_observable,
            destructive: self.destructive,
            label: self.label,
            mode: self.mode,
            reason: self.reason,
            requires_confirmation: self.requires_confirmation,
        }
    }

    #[cfg(test)]
    fn mode(&self) -> GameActionMode {
        self.mode
    }
}

#[tauri::command]
pub fn get_game_action_capabilities(game_id: String) -> Result<Vec<GameActionCapability>, String> {
    let game_id = normalize_game_id(game_id)?;
    let game = read_installed_games_cache_result()?
        .into_iter()
        .find(|game| game.id == game_id)
        .ok_or_else(|| format!("Game '{game_id}' was not found in the local library cache."))?;

    Ok(build_game_action_capabilities(&game))
}

#[tauri::command]
pub fn prepare_game_action_confirmation(
    input: PrepareGameActionConfirmationInput,
) -> Result<PrepareGameActionConfirmationResult, String> {
    let validation_input = RunGameActionInput {
        action: input.action,
        game_id: input.game_id,
        expected_provider: input.expected_provider,
        expected_title: input.expected_title,
        confirmation_token: None,
    };
    let game = reload_expected_game(&validation_input)?;
    let plan = plan_game_action(&game, validation_input.action);
    if !plan.available {
        return Err(plan.reason);
    }
    if !plan.requires_confirmation {
        return Err(format!(
            "{} does not require a destructive-action confirmation grant.",
            action_label(validation_input.action)
        ));
    }

    let token = confirmation_grants()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .issue(
            confirmation_binding(&game, validation_input.action)?,
            Instant::now(),
        );
    let expires_at = (Utc::now()
        + ChronoDuration::seconds(CONFIRMATION_GRANT_TTL.as_secs() as i64))
    .to_rfc3339_opts(SecondsFormat::Secs, true);

    Ok(PrepareGameActionConfirmationResult {
        game_id: game.id,
        action: validation_input.action,
        confirmation_token: token,
        expires_at,
        expires_in_seconds: CONFIRMATION_GRANT_TTL.as_secs(),
    })
}

#[tauri::command]
pub fn run_game_action(input: RunGameActionInput) -> GameActionResult {
    let normalized_game_id = match normalize_game_id(input.game_id.clone()) {
        Ok(game_id) => game_id,
        Err(error) => return input_failure_result(&input, GameActionOutcome::Blocked, error),
    };

    let games = match read_installed_games_cache_result() {
        Ok(games) => games,
        Err(error) => return input_failure_result(&input, GameActionOutcome::Failed, error),
    };
    let Some(game) = games.into_iter().find(|game| game.id == normalized_game_id) else {
        return input_failure_result(
            &input,
            GameActionOutcome::Blocked,
            format!(
                "Game '{}' is no longer present in the local library cache.",
                normalized_game_id
            ),
        );
    };

    if let Err(error) = validate_expected_game(&game, &input) {
        return action_result(
            &game,
            input.action,
            GameActionOutcome::Blocked,
            GameActionMode::NotApplicable,
            false,
            error,
            false,
            false,
        );
    }

    let mut plan = plan_game_action(&game, input.action);
    if !plan.available {
        return action_result(
            &game,
            input.action,
            GameActionOutcome::Blocked,
            plan.mode,
            plan.completion_observable,
            plan.reason,
            false,
            false,
        );
    }

    // External and destructive actions are planned from a second fresh cache read.
    // This closes the gap between rendering a confirmation and dispatching it.
    let requires_fresh_snapshot = plan.destructive
        || matches!(
            plan.mode,
            GameActionMode::UserHandoff
                | GameActionMode::ProviderAutomation
                | GameActionMode::OsAutomation
        );
    let execution_game = if requires_fresh_snapshot {
        match reload_expected_game(&input) {
            Ok(game) => game,
            Err(error) => {
                return action_result(
                    &game,
                    input.action,
                    GameActionOutcome::Blocked,
                    plan.mode,
                    plan.completion_observable,
                    error,
                    false,
                    false,
                )
            }
        }
    } else {
        game
    };
    plan = plan_game_action(&execution_game, input.action);
    if !plan.available {
        return action_result(
            &execution_game,
            input.action,
            GameActionOutcome::Blocked,
            plan.mode,
            plan.completion_observable,
            plan.reason,
            false,
            false,
        );
    }

    let confirmation_consumed = if plan.requires_confirmation {
        if let Err(error) = consume_confirmation_grant(&execution_game, &input) {
            return action_result(
                &execution_game,
                input.action,
                GameActionOutcome::Blocked,
                plan.mode,
                plan.completion_observable,
                error.message().to_string(),
                false,
                false,
            );
        }
        true
    } else {
        false
    };

    execute_planned_action(&execution_game, input.action, plan, confirmation_consumed)
}

fn build_game_action_capabilities(game: &InstalledGame) -> Vec<GameActionCapability> {
    ALL_GAME_ACTIONS
        .into_iter()
        .map(|action| plan_game_action(game, action).capability(action))
        .collect()
}

fn plan_game_action(game: &InstalledGame, action: GameAction) -> PlannedGameAction {
    if action == GameAction::Support {
        return unavailable_plan(
            "Support / Help",
            "No verified per-game support URL is available.",
        );
    }

    let managed = game
        .install_path
        .as_deref()
        .is_some_and(|path| is_og_managed_install_path(Path::new(path)));
    if managed {
        return plan_managed_action(action);
    }

    if is_manual_game(game) || launcher_key_from_source(&game.launcher) == "manual" {
        return plan_manual_action(action);
    }

    plan_provider_action(game, action)
}

fn plan_managed_action(action: GameAction) -> PlannedGameAction {
    match action {
        GameAction::Verify => available_plan(
            "Verify Files",
            "OG-Launcher can inspect the managed install and manifest locally.",
            GameActionMode::LocalReadOnly,
            true,
            false,
            false,
            PlannedExecutor::LocalVerify,
        ),
        GameAction::Repair => available_plan(
            "Repair Files",
            "Repair can overwrite managed files and requires server-issued confirmation.",
            GameActionMode::LocalManaged,
            true,
            true,
            true,
            PlannedExecutor::LocalRepair,
        ),
        GameAction::CheckUpdate => available_plan(
            "Check for Updates",
            "OG-Launcher can compare the managed manifest version locally.",
            GameActionMode::LocalReadOnly,
            true,
            false,
            false,
            PlannedExecutor::LocalCheckUpdate,
        ),
        GameAction::Update => unavailable_plan(
            "Update Game",
            "No signed managed update-package workflow is available yet.",
        ),
        GameAction::Uninstall => available_plan(
            "Uninstall Game",
            "Only the exact OG-managed install may be removed after server-issued confirmation.",
            GameActionMode::LocalManaged,
            true,
            true,
            true,
            PlannedExecutor::LocalUninstall,
        ),
        GameAction::RemoveFromLibrary => unavailable_plan(
            "Remove from Library",
            "Managed installs remain represented in the library; uninstall them instead.",
        ),
        GameAction::OpenProvider => unavailable_plan(
            "Open Provider",
            "This game is managed directly by OG-Launcher.",
        ),
        GameAction::Support => unreachable!("support is planned before management routing"),
    }
}

fn plan_manual_action(action: GameAction) -> PlannedGameAction {
    match action {
        GameAction::Verify => available_plan(
            "Check Launch Target",
            "OG-Launcher can check only the local path and executable, not file integrity.",
            GameActionMode::LocalReadOnly,
            true,
            false,
            false,
            PlannedExecutor::LocalVerify,
        ),
        GameAction::RemoveFromLibrary => available_plan(
            "Remove from Library",
            "Only the manual library entry would be removed; game files stay untouched.",
            GameActionMode::LocalManaged,
            true,
            true,
            true,
            PlannedExecutor::RemoveLibraryEntry,
        ),
        GameAction::Repair => unavailable_plan(
            "Repair Files",
            "Manual games have no trusted repair manifest or provider handoff.",
        ),
        GameAction::CheckUpdate | GameAction::Update => unavailable_plan(
            action_label(action),
            "Manual games have no verified update provider.",
        ),
        GameAction::Uninstall => unavailable_plan(
            "Uninstall Game",
            "OG-Launcher will not delete files for a manually added game.",
        ),
        GameAction::OpenProvider => unavailable_plan(
            "Open Provider",
            "No external provider is associated with this manual entry.",
        ),
        GameAction::Support => unreachable!("support is planned before management routing"),
    }
}

fn plan_provider_action(game: &InstalledGame, action: GameAction) -> PlannedGameAction {
    if game.status == GameStatus::NotInstalled
        && matches!(
            action,
            GameAction::Verify | GameAction::Repair | GameAction::Update | GameAction::Uninstall
        )
    {
        return unavailable_plan(
            action_label(action),
            "This provider copy is not installed; no local installation is available for this action.",
        );
    }

    if action == GameAction::RemoveFromLibrary {
        return unavailable_plan(
            "Remove from Library",
            "Provider-discovered games return on the next library scan.",
        );
    }

    let provider = launcher_key_from_source(&game.launcher);
    if !provider_supported_on_current_os(provider) {
        return unavailable_plan(
            action_label(action),
            format!(
                "{} is not supported on this operating system.",
                provider_display_name(provider)
            ),
        );
    }
    let destructive = matches!(
        action,
        GameAction::Repair | GameAction::Update | GameAction::Uninstall
    );
    if provider == "xbox" && action == GameAction::Uninstall {
        if provider_game_identity(game, provider).is_err() {
            return unavailable_plan(
                action_label(action),
                "Xbox uninstall requires an exact package family name.",
            );
        }
        return available_plan(
            action_label(action),
            "OG-Launcher removes the exact Xbox package and verifies that it is gone before updating the library.",
            GameActionMode::OsAutomation,
            true,
            true,
            true,
            PlannedExecutor::XboxPackageUninstall,
        );
    }
    if provider == "steam" && action == GameAction::Uninstall {
        let uri = match provider_handoff_uri(game, provider, action) {
            Ok(uri) => uri,
            Err(reason) => return unavailable_plan(action_label(action), reason),
        };
        return available_plan(
            action_label(action),
            "OG-Launcher opens Steam's exact AppID-bound uninstall flow instead of guessing through client UI.",
            GameActionMode::UserHandoff,
            false,
            true,
            true,
            PlannedExecutor::Handoff(uri),
        );
    }
    if provider_automation_enabled() {
        if let Some(maintenance_action) = maintenance_action(action) {
            let Some(provider_id) = provider_id(provider) else {
                return unavailable_plan(
                    action_label(action),
                    "No verified automation provider mapping is available.",
                );
            };
            // A safe client handoff may still exist, but semantic automation is
            // unavailable without an exact provider-owned game identity.
            let game_identity = provider_game_identity(game, provider).unwrap_or_default();
            if !game_identity.is_empty() {
                let mode = if provider_id == ProviderId::Xbox {
                    GameActionMode::OsAutomation
                } else {
                    GameActionMode::ProviderAutomation
                };
                return available_plan(
                    action_label(action),
                    format!(
                        "{} can be opened and driven through exact semantic controls; completion remains unobserved.",
                        provider_display_name(provider)
                    ),
                    mode,
                    false,
                    destructive,
                    destructive,
                    PlannedExecutor::ProviderAutomation(ProviderAutomationInvocation {
                        provider: provider_id,
                        action: maintenance_action,
                        game_identity,
                        confirmation_consumed: false,
                    }),
                );
            }
        }
    }

    let uri = match provider_handoff_uri(game, provider, action) {
        Ok(uri) => uri,
        Err(reason) => return unavailable_plan(action_label(action), reason),
    };
    available_plan(
        action_label(action),
        format!(
            "{} must finish this action in its official client; OG-Launcher cannot observe completion.",
            provider_display_name(provider)
        ),
        GameActionMode::UserHandoff,
        false,
        destructive,
        destructive,
        PlannedExecutor::Handoff(uri),
    )
}

const fn provider_automation_enabled() -> bool {
    cfg!(all(windows, feature = "windows-uiautomation"))
}

fn provider_id(provider: &str) -> Option<ProviderId> {
    match provider {
        "steam" => Some(ProviderId::Steam),
        "epic" => Some(ProviderId::Epic),
        "gog" => Some(ProviderId::Gog),
        "ea" => Some(ProviderId::Ea),
        "ubisoft" => Some(ProviderId::Ubisoft),
        "battlenet" => Some(ProviderId::Battlenet),
        "xbox" => Some(ProviderId::Xbox),
        _ => None,
    }
}

fn maintenance_action(action: GameAction) -> Option<MaintenanceAction> {
    match action {
        GameAction::Verify => Some(MaintenanceAction::Verify),
        GameAction::Repair => Some(MaintenanceAction::Repair),
        GameAction::Update => Some(MaintenanceAction::Update),
        GameAction::Uninstall => Some(MaintenanceAction::Uninstall),
        _ => None,
    }
}

fn provider_game_identity(game: &InstalledGame, provider: &str) -> Result<String, String> {
    let candidate = if provider_id(provider).is_none() {
        game.id.clone()
    } else if provider == "steam" {
        steam_app_id(game).map(str::to_string)?
    } else if provider == "xbox" {
        xbox_package_family_name_for_game(game)
            .ok_or_else(|| "Exact Xbox package family name is missing.".to_string())?
            .to_string()
    } else {
        game.external_id
            .clone()
            .ok_or_else(|| "Exact provider game identity is missing.".to_string())?
    };
    let candidate = candidate.trim();
    if candidate.is_empty() || candidate.len() > 256 || candidate.chars().any(char::is_control) {
        return Err("Exact provider game identity is missing or unsafe.".to_string());
    }
    Ok(candidate.to_string())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)] // Non-host variants are exercised by the cross-platform planning tests.
enum TargetOs {
    Windows,
    Macos,
    Linux,
}

fn provider_supported_on_current_os(provider: &str) -> bool {
    #[cfg(target_os = "windows")]
    {
        provider_supported_on_os(provider, TargetOs::Windows)
    }
    #[cfg(target_os = "macos")]
    {
        provider_supported_on_os(provider, TargetOs::Macos)
    }
    #[cfg(target_os = "linux")]
    {
        provider_supported_on_os(provider, TargetOs::Linux)
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        let _ = provider;
        false
    }
}

fn provider_supported_on_os(provider: &str, target_os: TargetOs) -> bool {
    match provider {
        "steam" => true,
        "epic" | "gog" | "ea" | "battlenet" => {
            matches!(target_os, TargetOs::Windows | TargetOs::Macos)
        }
        "ubisoft" | "xbox" => target_os == TargetOs::Windows,
        _ => false,
    }
}

fn provider_handoff_uri(
    game: &InstalledGame,
    provider: &str,
    action: GameAction,
) -> Result<String, String> {
    match provider {
        "steam" => match action {
            GameAction::Verify | GameAction::Repair => {
                Ok(format!("steam://validate/{}", steam_app_id(game)?))
            }
            GameAction::Uninstall => Ok(format!("steam://uninstall/{}", steam_app_id(game)?)),
            GameAction::CheckUpdate | GameAction::Update => {
                Ok("steam://open/settings/downloads".to_string())
            }
            GameAction::OpenProvider => Ok("steam://open/main".to_string()),
            _ => Err("Steam does not expose a safe handoff for this action.".to_string()),
        },
        "epic" => provider_client_action_uri(
            action,
            "com.epicgames.launcher://store",
            "Epic Games Launcher",
        ),
        "gog" => {
            if matches!(
                action,
                GameAction::Verify
                    | GameAction::Repair
                    | GameAction::CheckUpdate
                    | GameAction::Update
                    | GameAction::Uninstall
            ) {
                if let Some(product_id) = game.external_id.as_deref().and_then(validated_numeric_id)
                {
                    return Ok(format!("goggalaxy://open-game-view/{product_id}"));
                }
            }
            provider_client_action_uri(action, "goggalaxy://openLibrary", "GOG Galaxy")
        }
        "ea" => provider_client_action_uri(action, "origin2://", "EA app"),
        "ubisoft" => provider_client_action_uri(action, "uplay://open", "Ubisoft Connect"),
        "battlenet" => provider_client_action_uri(action, "battlenet://", "Battle.net"),
        "xbox" => provider_client_action_uri(action, XBOX_CLIENT_URI, "Xbox app"),
        _ => Err("No verified provider handoff is configured for this game.".to_string()),
    }
}

fn provider_client_action_uri(
    action: GameAction,
    uri: &str,
    provider: &str,
) -> Result<String, String> {
    if matches!(
        action,
        GameAction::Verify
            | GameAction::Repair
            | GameAction::CheckUpdate
            | GameAction::Update
            | GameAction::Uninstall
            | GameAction::OpenProvider
    ) {
        Ok(uri.to_string())
    } else {
        Err(format!(
            "{provider} does not expose a safe handoff for this action."
        ))
    }
}

fn steam_app_id(game: &InstalledGame) -> Result<&str, String> {
    game.external_id
        .as_deref()
        .and_then(validated_numeric_id)
        .or_else(|| {
            game.id
                .strip_prefix("steam-")
                .and_then(validated_numeric_id)
        })
        .ok_or_else(|| "Steam action requires an exact numeric AppID.".to_string())
}

fn validated_numeric_id(value: &str) -> Option<&str> {
    Some(value).filter(|value| {
        !value.is_empty()
            && value.len() <= 20
            && value.chars().all(|character| character.is_ascii_digit())
    })
}

fn validate_expected_game(game: &InstalledGame, input: &RunGameActionInput) -> Result<(), String> {
    if game.id != input.game_id {
        return Err("The selected game changed before the action could run.".to_string());
    }

    let actual_provider = launcher_key_from_source(&game.launcher);
    let expected_provider = launcher_key_from_source(input.expected_provider.trim());
    if actual_provider != expected_provider {
        return Err(format!(
            "Provider changed from '{}' to '{}'; action was blocked.",
            input.expected_provider, actual_provider
        ));
    }

    if game.title != input.expected_title {
        return Err(
            "Game title changed after the action was prepared; action was blocked.".to_string(),
        );
    }

    Ok(())
}

fn reload_expected_game(input: &RunGameActionInput) -> Result<InstalledGame, String> {
    let game_id = normalize_game_id(input.game_id.clone())?;
    let game = read_installed_games_cache_result()?
        .into_iter()
        .find(|game| game.id == game_id)
        .ok_or_else(|| "The selected game disappeared before execution.".to_string())?;
    validate_expected_game(&game, input)?;
    Ok(game)
}

fn confirmation_grants() -> &'static Mutex<ConfirmationGrantStore> {
    CONFIRMATION_GRANTS.get_or_init(|| Mutex::new(ConfirmationGrantStore::default()))
}

fn confirmation_binding(
    game: &InstalledGame,
    action: GameAction,
) -> Result<ConfirmationBinding, String> {
    let provider = launcher_key_from_source(&game.launcher);
    Ok(ConfirmationBinding {
        game_id: game.id.clone(),
        action,
        provider: provider.to_string(),
        provider_game_identity: provider_game_identity(game, provider)?,
        title: game.title.clone(),
    })
}

fn consume_confirmation_grant(
    game: &InstalledGame,
    input: &RunGameActionInput,
) -> Result<(), ConfirmationGrantError> {
    let token = input
        .confirmation_token
        .as_deref()
        .map(str::trim)
        .filter(|token| Uuid::parse_str(token).is_ok())
        .ok_or(ConfirmationGrantError::InvalidOrUsed)?;
    confirmation_grants()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .consume(
            token,
            &confirmation_binding(game, input.action)
                .map_err(|_| ConfirmationGrantError::BindingMismatch)?,
            Instant::now(),
        )
}

#[derive(Debug, Clone)]
struct LocalExecutionResult {
    outcome: GameActionOutcome,
    message: String,
    details: Vec<String>,
    library_changed: bool,
    rescan_recommended: bool,
}

trait PlannedActionExecutor {
    fn execute_local(
        &self,
        game: &InstalledGame,
        executor: &PlannedExecutor,
    ) -> Result<LocalExecutionResult, String>;

    fn open_handoff(&self, uri: &str) -> Result<(), String>;

    fn run_provider_automation(
        &self,
        invocation: &ProviderAutomationInvocation,
    ) -> ProviderAutomationResult;
}

struct NativePlannedActionExecutor;

impl PlannedActionExecutor for NativePlannedActionExecutor {
    fn execute_local(
        &self,
        game: &InstalledGame,
        executor: &PlannedExecutor,
    ) -> Result<LocalExecutionResult, String> {
        match executor {
            PlannedExecutor::LocalVerify => {
                let verification = verify_game_files(game.id.clone())?;
                let verified = matches!(verification.status, super::VerificationStatus::Verified);
                Ok(LocalExecutionResult {
                    outcome: GameActionOutcome::Completed,
                    message: if verified {
                        format!(
                            "Checked {} local file target(s); no issues were found.",
                            verification.checked_files
                        )
                    } else {
                        format!(
                            "Checked {} local file target(s); {} issue(s) require attention.",
                            verification.checked_files,
                            verification.missing_files.len()
                        )
                    },
                    details: verification.missing_files,
                    library_changed: false,
                    rescan_recommended: false,
                })
            }
            PlannedExecutor::LocalCheckUpdate => {
                let response = check_game_updates()?;
                let refreshed = response
                    .games
                    .iter()
                    .find(|candidate| candidate.id == game.id)
                    .ok_or_else(|| {
                        "Managed game disappeared while checking for updates.".to_string()
                    })?;
                let update_available = refreshed.status == GameStatus::UpdateAvailable;
                let library_changed = refreshed.status != game.status;
                Ok(LocalExecutionResult {
                    outcome: if update_available {
                        GameActionOutcome::Completed
                    } else {
                        GameActionOutcome::NotNeeded
                    },
                    message: if update_available {
                        "A managed update is marked available.".to_string()
                    } else {
                        "No managed update is currently needed.".to_string()
                    },
                    details: Vec::new(),
                    library_changed,
                    rescan_recommended: library_changed,
                })
            }
            PlannedExecutor::LocalRepair => {
                let repair = repair_game_files(game.id.clone())?;
                Ok(LocalExecutionResult {
                    outcome: GameActionOutcome::Completed,
                    message: repair.message,
                    details: repair.repaired_files,
                    library_changed: true,
                    rescan_recommended: true,
                })
            }
            PlannedExecutor::LocalUninstall | PlannedExecutor::RemoveLibraryEntry => {
                let uninstall = uninstall_local_game(game.id.clone())?;
                if !uninstall.success {
                    return Err(uninstall.message);
                }
                Ok(LocalExecutionResult {
                    outcome: GameActionOutcome::Completed,
                    message: uninstall.message.clone(),
                    details: vec![uninstall.message],
                    library_changed: true,
                    rescan_recommended: false,
                })
            }
            PlannedExecutor::XboxPackageUninstall => {
                let uninstall = uninstall_xbox_game(game.id.clone())?;
                if !uninstall.success {
                    return Err(uninstall.message);
                }
                Ok(LocalExecutionResult {
                    outcome: GameActionOutcome::Completed,
                    message: uninstall.message.clone(),
                    details: vec![uninstall.message],
                    library_changed: true,
                    rescan_recommended: false,
                })
            }
            PlannedExecutor::ProviderAutomation(_)
            | PlannedExecutor::Handoff(_)
            | PlannedExecutor::Blocked => Err(format!(
                "{} is not a local execution route.",
                executor.route_name()
            )),
        }
    }

    fn open_handoff(&self, uri: &str) -> Result<(), String> {
        open_uri(uri).map_err(|error| error.to_string())
    }

    fn run_provider_automation(
        &self,
        invocation: &ProviderAutomationInvocation,
    ) -> ProviderAutomationResult {
        NativeProviderAutomationRunner.run(invocation)
    }
}

impl PlannedExecutor {
    fn route_name(&self) -> &'static str {
        match self {
            Self::LocalVerify => "local_verify",
            Self::LocalCheckUpdate => "local_check_update",
            Self::LocalRepair => "local_repair",
            Self::LocalUninstall => "local_uninstall",
            Self::XboxPackageUninstall => "xbox_package_uninstall",
            Self::RemoveLibraryEntry => "remove_library_entry",
            Self::ProviderAutomation(_) => "provider_automation",
            Self::Handoff(_) => "provider_handoff",
            Self::Blocked => "blocked",
        }
    }
}

fn execute_planned_action(
    game: &InstalledGame,
    action: GameAction,
    plan: PlannedGameAction,
    confirmation_consumed: bool,
) -> GameActionResult {
    execute_planned_action_with_executor(
        game,
        action,
        plan,
        confirmation_consumed,
        &NativePlannedActionExecutor,
    )
}

fn execute_planned_action_with_executor(
    game: &InstalledGame,
    action: GameAction,
    plan: PlannedGameAction,
    confirmation_consumed: bool,
    executor: &dyn PlannedActionExecutor,
) -> GameActionResult {
    match &plan.executor {
        PlannedExecutor::ProviderAutomation(invocation) => {
            let mut invocation = invocation.clone();
            invocation.confirmation_consumed = confirmation_consumed;
            match executor.run_provider_automation(&invocation) {
                ProviderAutomationResult::StartedAwaitingObservation { detail } => {
                    action_result_with_details(
                        game,
                        action,
                        GameActionOutcome::HandoffRequired,
                        plan.mode,
                        false,
                        "Provider action started; completion still requires observation."
                            .to_string(),
                        vec![detail],
                        false,
                        action_can_change_install(action),
                    )
                }
                ProviderAutomationResult::HandoffRequired { reason } => action_result_with_details(
                    game,
                    action,
                    GameActionOutcome::HandoffRequired,
                    plan.mode,
                    false,
                    "Provider client requires user interaction before automation can continue."
                        .to_string(),
                    vec![reason],
                    false,
                    false,
                ),
                ProviderAutomationResult::Blocked { reason } => action_result_with_details(
                    game,
                    action,
                    GameActionOutcome::Blocked,
                    plan.mode,
                    false,
                    "Provider automation was blocked without guessing.".to_string(),
                    vec![reason],
                    false,
                    false,
                ),
                ProviderAutomationResult::Failed { reason } => action_result_with_details(
                    game,
                    action,
                    GameActionOutcome::Failed,
                    plan.mode,
                    false,
                    "Provider automation failed before observable completion.".to_string(),
                    vec![reason],
                    false,
                    false,
                ),
            }
        }
        PlannedExecutor::Handoff(uri) => match executor.open_handoff(uri) {
            Ok(()) => action_result(
                game,
                action,
                GameActionOutcome::HandoffRequired,
                GameActionMode::UserHandoff,
                false,
                format!(
                    "Opened {}. Finish '{}' in the provider client.",
                    provider_display_name(launcher_key_from_source(&game.launcher)),
                    action_label(action)
                ),
                false,
                action_can_change_install(action),
            ),
            Err(error) => failed_action_result(
                game,
                action,
                GameActionMode::UserHandoff,
                false,
                format!("Could not open provider handoff: {error}"),
            ),
        },
        PlannedExecutor::Blocked => action_result(
            game,
            action,
            GameActionOutcome::Blocked,
            GameActionMode::NotApplicable,
            false,
            plan.reason,
            false,
            false,
        ),
        _ => match executor.execute_local(game, &plan.executor) {
            Ok(result) => action_result_with_details(
                game,
                action,
                result.outcome,
                plan.mode,
                plan.completion_observable,
                result.message,
                result.details,
                result.library_changed,
                result.rescan_recommended,
            ),
            Err(error) => {
                failed_action_result(game, action, plan.mode, plan.completion_observable, error)
            }
        },
    }
}

fn available_plan(
    label: impl Into<String>,
    reason: impl Into<String>,
    mode: GameActionMode,
    completion_observable: bool,
    destructive: bool,
    requires_confirmation: bool,
    executor: PlannedExecutor,
) -> PlannedGameAction {
    PlannedGameAction {
        mode,
        available: true,
        completion_observable,
        destructive,
        requires_confirmation,
        label: label.into(),
        reason: reason.into(),
        executor,
    }
}

fn unavailable_plan(label: impl Into<String>, reason: impl Into<String>) -> PlannedGameAction {
    PlannedGameAction {
        mode: GameActionMode::NotApplicable,
        available: false,
        completion_observable: false,
        destructive: false,
        requires_confirmation: false,
        label: label.into(),
        reason: reason.into(),
        executor: PlannedExecutor::Blocked,
    }
}

#[allow(clippy::too_many_arguments)]
fn action_result(
    game: &InstalledGame,
    action: GameAction,
    outcome: GameActionOutcome,
    _mode: GameActionMode,
    _completion_observable: bool,
    message: String,
    library_changed: bool,
    rescan_recommended: bool,
) -> GameActionResult {
    action_result_with_details(
        game,
        action,
        outcome,
        _mode,
        _completion_observable,
        message,
        Vec::new(),
        library_changed,
        rescan_recommended,
    )
}

#[allow(clippy::too_many_arguments)]
fn action_result_with_details(
    game: &InstalledGame,
    action: GameAction,
    outcome: GameActionOutcome,
    _mode: GameActionMode,
    _completion_observable: bool,
    message: String,
    details: Vec<String>,
    library_changed: bool,
    rescan_recommended: bool,
) -> GameActionResult {
    GameActionResult {
        action,
        details,
        game_id: game.id.clone(),
        library_changed,
        message,
        outcome,
        provider: launcher_key_from_source(&game.launcher).to_string(),
        rescan_recommended,
        session_id: Uuid::new_v4().to_string(),
    }
}

fn failed_action_result(
    game: &InstalledGame,
    action: GameAction,
    mode: GameActionMode,
    completion_observable: bool,
    message: String,
) -> GameActionResult {
    action_result(
        game,
        action,
        GameActionOutcome::Failed,
        mode,
        completion_observable,
        message,
        false,
        false,
    )
}

fn input_failure_result(
    input: &RunGameActionInput,
    outcome: GameActionOutcome,
    message: String,
) -> GameActionResult {
    GameActionResult {
        action: input.action,
        details: Vec::new(),
        game_id: input.game_id.trim().to_string(),
        library_changed: false,
        message,
        outcome,
        provider: launcher_key_from_source(&input.expected_provider).to_string(),
        rescan_recommended: false,
        session_id: Uuid::new_v4().to_string(),
    }
}

fn action_can_change_install(action: GameAction) -> bool {
    matches!(
        action,
        GameAction::Repair | GameAction::Update | GameAction::Uninstall
    )
}

fn action_label(action: GameAction) -> &'static str {
    match action {
        GameAction::Support => "Support / Help",
        GameAction::Verify => "Verify Files",
        GameAction::Repair => "Repair Files",
        GameAction::CheckUpdate => "Check for Updates",
        GameAction::Update => "Update Game",
        GameAction::Uninstall => "Uninstall Game",
        GameAction::RemoveFromLibrary => "Remove from Library",
        GameAction::OpenProvider => "Open Provider",
    }
}

fn provider_display_name(provider: &str) -> &'static str {
    match provider {
        "steam" => "Steam",
        "epic" => "Epic Games Launcher",
        "gog" => "GOG Galaxy",
        "ea" => "EA app",
        "ubisoft" => "Ubisoft Connect",
        "battlenet" => "Battle.net",
        "xbox" => "Xbox app",
        "manual" => "OG-Launcher",
        _ => "the provider client",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::games::{GameStatus, InstalledGame, LogoPosition, Platform};
    use crate::launcher_automation::runner::{
        provider_client_start_uri, ProviderAutomationInvocation, ProviderAutomationResult,
    };
    use std::sync::Mutex;
    use std::time::{Duration, Instant};

    fn game(id: &str, title: &str, launcher: &str) -> InstalledGame {
        InstalledGame {
            id: id.to_string(),
            title: title.to_string(),
            slug: title.to_lowercase().replace(' ', "-"),
            description: String::new(),
            version: String::new(),
            launcher: launcher.to_string(),
            external_id: None,
            cover_url: None,
            icon_url: None,
            icon_urls: Vec::new(),
            logo_url: None,
            logo_urls: Vec::new(),
            logo_position: LogoPosition::BottomLeft,
            logo_width_percent: None,
            logo_height_percent: None,
            status: GameStatus::Installed,
            platform: Platform::Windows,
            install_path: None,
            executable_path: None,
            process_names: Vec::new(),
            launch_uri: None,
            last_played_at: None,
            playtime_minutes: None,
            genres: Vec::new(),
            developer: None,
            publisher: None,
            release_date: None,
            features: Vec::new(),
            rating: None,
            achievements: Vec::new(),
            achievements_synced_at: None,
            achievement_provider_statuses: Vec::new(),
            save_files: Vec::new(),
            friends_playing: Vec::new(),
        }
    }

    #[test]
    fn steam_verify_is_an_observable_false_user_handoff() {
        let mut steam = game("steam-440", "Team Fortress 2", "steam");
        steam.external_id = Some("440".to_string());

        let capabilities = build_game_action_capabilities(&steam);
        let verify = capabilities
            .iter()
            .find(|capability| capability.action == GameAction::Verify)
            .expect("verify capability");

        assert!(verify.available);
        assert_eq!(
            verify.mode,
            if provider_automation_enabled() {
                GameActionMode::ProviderAutomation
            } else {
                GameActionMode::UserHandoff
            }
        );
        assert!(!verify.completion_observable);
    }

    #[test]
    fn manual_games_remove_only_the_library_entry() {
        let manual = game("manual-demo", "Demo", "manual");
        let capabilities = build_game_action_capabilities(&manual);

        let uninstall = capability(&capabilities, GameAction::Uninstall);
        let remove = capability(&capabilities, GameAction::RemoveFromLibrary);

        assert!(!uninstall.available);
        assert!(remove.available);
        assert_eq!(remove.mode, GameActionMode::LocalManaged);
        assert!(remove.destructive);
        assert!(remove.requires_confirmation);
    }

    #[test]
    fn stale_provider_or_title_blocks_action_before_execution() {
        let steam = game("steam-440", "Team Fortress 2", "steam");
        let wrong_provider = RunGameActionInput {
            action: GameAction::OpenProvider,
            game_id: steam.id.clone(),
            expected_provider: "epic".to_string(),
            expected_title: steam.title.clone(),
            confirmation_token: None,
        };
        let wrong_title = RunGameActionInput {
            expected_provider: "steam".to_string(),
            expected_title: "Changed title".to_string(),
            ..wrong_provider.clone()
        };

        assert!(validate_expected_game(&steam, &wrong_provider).is_err());
        assert!(validate_expected_game(&steam, &wrong_title).is_err());
    }

    #[test]
    fn xbox_uninstall_uses_verified_native_package_removal() {
        let mut xbox = game("xbox-forza-horizon-5", "Forza Horizon 5", "xbox");
        xbox.external_id = Some("9NKX70BBCDRN".to_string());
        xbox.launch_uri =
            Some("shell:AppsFolder\\Microsoft.ForzaHorizon5_8wekyb3d8bbwe!App".to_string());

        let plan = plan_game_action(&xbox, GameAction::Uninstall);

        assert_eq!(plan.mode(), GameActionMode::OsAutomation);
        assert!(plan.completion_observable);
        assert!(plan.destructive);
        assert!(plan.requires_confirmation);
        assert!(matches!(
            plan.executor,
            PlannedExecutor::XboxPackageUninstall
        ));

        xbox.launch_uri = None;
        assert!(!plan_game_action(&xbox, GameAction::Uninstall).available);
    }

    #[test]
    fn confirmation_grant_is_bound_to_snapshot_and_single_use() {
        let now = Instant::now();
        let binding = confirmation_binding(
            &game("manual-demo", "Demo", "manual"),
            GameAction::RemoveFromLibrary,
        )
        .unwrap();
        let other_binding = ConfirmationBinding {
            provider_game_identity: "changed-provider-identity".to_string(),
            ..binding.clone()
        };
        let mut store = ConfirmationGrantStore::default();
        store.insert_for_test("grant-1", binding.clone(), now + Duration::from_secs(120));

        assert_eq!(
            store.consume("grant-1", &other_binding, now),
            Err(ConfirmationGrantError::BindingMismatch)
        );
        assert_eq!(
            store.consume("grant-1", &binding, now),
            Err(ConfirmationGrantError::InvalidOrUsed)
        );

        store.insert_for_test("grant-2", binding.clone(), now + Duration::from_secs(120));
        assert_eq!(store.consume("grant-2", &binding, now), Ok(()));
        assert_eq!(
            store.consume("grant-2", &binding, now),
            Err(ConfirmationGrantError::InvalidOrUsed)
        );
    }

    #[test]
    fn confirmation_grant_expires() {
        let now = Instant::now();
        let binding = confirmation_binding(
            &game("manual-demo", "Demo", "manual"),
            GameAction::RemoveFromLibrary,
        )
        .unwrap();
        let mut store = ConfirmationGrantStore::default();
        store.insert_for_test("grant", binding.clone(), now + Duration::from_secs(1));

        assert_eq!(
            store.consume("grant", &binding, now + Duration::from_secs(1)),
            Err(ConfirmationGrantError::Expired)
        );
    }

    #[test]
    fn provider_mutations_require_confirmation_and_never_observable_completion() {
        let mut steam = game("steam-440", "Team Fortress 2", "steam");
        steam.external_id = Some("440".to_string());

        for action in [
            GameAction::Repair,
            GameAction::Update,
            GameAction::Uninstall,
        ] {
            let plan = plan_game_action(&steam, action);
            assert!(plan.available);
            assert!(plan.destructive);
            assert!(plan.requires_confirmation);
            assert!(!plan.completion_observable);
            if action == GameAction::Uninstall {
                assert_eq!(plan.mode, GameActionMode::UserHandoff);
                assert!(matches!(plan.executor, PlannedExecutor::Handoff(_)));
            } else if provider_automation_enabled() {
                assert_eq!(plan.mode, GameActionMode::ProviderAutomation);
                assert!(matches!(
                    plan.executor,
                    PlannedExecutor::ProviderAutomation(_)
                ));
            } else {
                assert_eq!(plan.mode, GameActionMode::UserHandoff);
                assert!(matches!(plan.executor, PlannedExecutor::Handoff(_)));
            }
        }
    }

    #[test]
    fn provider_not_installed_copy_blocks_install_dependent_actions() {
        let mut steam = game("steam-440", "Team Fortress 2", "steam");
        steam.external_id = Some("440".to_string());
        steam.status = GameStatus::NotInstalled;

        let capabilities = build_game_action_capabilities(&steam);
        for action in [
            GameAction::Verify,
            GameAction::Repair,
            GameAction::Update,
            GameAction::Uninstall,
        ] {
            let blocked = capability(&capabilities, action);
            assert!(!blocked.available, "{action:?} must be unavailable");
            assert_eq!(blocked.mode, GameActionMode::NotApplicable);
        }

        assert!(capability(&capabilities, GameAction::CheckUpdate).available);
        assert!(capability(&capabilities, GameAction::OpenProvider).available);
    }

    #[test]
    fn provider_identity_never_falls_back_to_title() {
        let epic = game("epic-demo", "Demo Title", "epic");
        assert!(provider_game_identity(&epic, "epic").is_err());

        let manual = game("manual-demo", "Demo Title", "manual");
        assert_eq!(
            provider_game_identity(&manual, "manual").unwrap(),
            "manual-demo"
        );

        let mut xbox = game("xbox-demo", "Xbox Demo", "xbox");
        xbox.external_id = Some("not-a-package-family".to_string());
        assert!(provider_game_identity(&xbox, "xbox").is_err());
        xbox.external_id = Some("Microsoft.XboxDemo_8wekyb3d8bbwe".to_string());
        assert_eq!(
            provider_game_identity(&xbox, "xbox").unwrap(),
            "Microsoft.XboxDemo_8wekyb3d8bbwe"
        );
    }

    #[cfg(all(windows, feature = "windows-uiautomation"))]
    #[test]
    fn missing_external_identity_falls_back_to_safe_handoff_not_automation() {
        let epic = game("epic-demo", "Demo Title", "epic");

        let plan = plan_game_action(&epic, GameAction::Verify);

        assert_eq!(plan.mode, GameActionMode::UserHandoff);
        assert!(matches!(plan.executor, PlannedExecutor::Handoff(_)));
    }

    #[test]
    fn impossible_provider_os_pairs_are_not_applicable() {
        assert!(!provider_supported_on_os("xbox", TargetOs::Linux));
        assert!(!provider_supported_on_os("xbox", TargetOs::Macos));
        assert!(!provider_supported_on_os("ubisoft", TargetOs::Linux));
        assert!(provider_supported_on_os("steam", TargetOs::Linux));
    }

    struct FakeExecutor {
        routes: Mutex<Vec<&'static str>>,
        automation_result: Mutex<Option<ProviderAutomationResult>>,
        automation_invocations: Mutex<Vec<ProviderAutomationInvocation>>,
    }

    impl Default for FakeExecutor {
        fn default() -> Self {
            Self {
                routes: Mutex::new(Vec::new()),
                automation_result: Mutex::new(None),
                automation_invocations: Mutex::new(Vec::new()),
            }
        }
    }

    impl FakeExecutor {
        fn returning_automation(result: ProviderAutomationResult) -> Self {
            Self {
                automation_result: Mutex::new(Some(result)),
                ..Self::default()
            }
        }
    }

    impl PlannedActionExecutor for FakeExecutor {
        fn execute_local(
            &self,
            _game: &InstalledGame,
            executor: &PlannedExecutor,
        ) -> Result<LocalExecutionResult, String> {
            let route = executor.route_name();
            self.routes.lock().unwrap().push(route);
            Ok(LocalExecutionResult {
                outcome: GameActionOutcome::Completed,
                message: format!("executed {route}"),
                details: vec![route.to_string()],
                library_changed: true,
                rescan_recommended: false,
            })
        }

        fn open_handoff(&self, _uri: &str) -> Result<(), String> {
            self.routes.lock().unwrap().push("handoff");
            Ok(())
        }

        fn run_provider_automation(
            &self,
            invocation: &ProviderAutomationInvocation,
        ) -> ProviderAutomationResult {
            self.routes.lock().unwrap().push("provider_automation");
            self.automation_invocations
                .lock()
                .unwrap()
                .push(invocation.clone());
            self.automation_result
                .lock()
                .unwrap()
                .take()
                .unwrap_or_else(|| ProviderAutomationResult::Failed {
                    reason: "mock result missing".to_string(),
                })
        }
    }

    #[test]
    fn dispatcher_routes_managed_repair_through_injected_executor() {
        let managed = game("managed-demo", "Managed Demo", "manual");
        let executor = FakeExecutor::default();

        let result = execute_planned_action_with_executor(
            &managed,
            GameAction::Repair,
            plan_managed_action(GameAction::Repair),
            true,
            &executor,
        );

        assert_eq!(result.outcome, GameActionOutcome::Completed);
        assert_eq!(*executor.routes.lock().unwrap(), vec!["local_repair"]);
        assert_eq!(result.details, vec!["local_repair"]);
    }

    #[test]
    fn automation_started_state_is_handoff_never_completed() {
        let steam = game("steam-440", "Team Fortress 2", "steam");
        let plan = available_plan(
            "Update Game",
            "provider automation",
            GameActionMode::ProviderAutomation,
            false,
            true,
            true,
            PlannedExecutor::ProviderAutomation(ProviderAutomationInvocation {
                provider: ProviderId::Steam,
                action: MaintenanceAction::Update,
                game_identity: "440".to_string(),
                confirmation_consumed: false,
            }),
        );
        let executor = FakeExecutor::returning_automation(
            ProviderAutomationResult::StartedAwaitingObservation {
                detail: "provider progress requires monitoring".to_string(),
            },
        );

        let result =
            execute_planned_action_with_executor(&steam, GameAction::Update, plan, true, &executor);

        assert_eq!(result.outcome, GameActionOutcome::HandoffRequired);
        assert!(result.rescan_recommended);
        assert_ne!(result.outcome, GameActionOutcome::Completed);
        assert!(executor.automation_invocations.lock().unwrap()[0].confirmation_consumed);
    }

    #[test]
    fn automation_blocking_and_ambiguous_states_never_report_completed() {
        let epic = game("epic-demo", "Demo", "epic");
        let plan = || {
            available_plan(
                "Verify Files",
                "provider automation",
                GameActionMode::ProviderAutomation,
                false,
                false,
                false,
                PlannedExecutor::ProviderAutomation(ProviderAutomationInvocation {
                    provider: ProviderId::Epic,
                    action: MaintenanceAction::Verify,
                    game_identity: "Demo".to_string(),
                    confirmation_consumed: false,
                }),
            )
        };

        for (automation, expected) in [
            (
                ProviderAutomationResult::HandoffRequired {
                    reason: "login required".to_string(),
                },
                GameActionOutcome::HandoffRequired,
            ),
            (
                ProviderAutomationResult::Blocked {
                    reason: "ambiguous window".to_string(),
                },
                GameActionOutcome::Blocked,
            ),
        ] {
            let executor = FakeExecutor::returning_automation(automation);
            let result = execute_planned_action_with_executor(
                &epic,
                GameAction::Verify,
                plan(),
                false,
                &executor,
            );
            assert_eq!(result.outcome, expected);
            assert_ne!(result.outcome, GameActionOutcome::Completed);
        }
    }

    #[cfg(all(windows, feature = "windows-uiautomation"))]
    #[test]
    fn windows_feature_plan_uses_safe_client_start_before_semantic_automation() {
        let mut steam = game("steam-440", "Team Fortress 2", "steam");
        steam.external_id = Some("440".to_string());
        let plan = plan_game_action(&steam, GameAction::Repair);

        assert_eq!(plan.mode, GameActionMode::ProviderAutomation);
        let PlannedExecutor::ProviderAutomation(invocation) = plan.executor else {
            panic!("expected provider automation");
        };
        let start_uri = provider_client_start_uri(invocation.provider);
        assert_eq!(start_uri, "steam://open/main");
        assert!(!start_uri.contains("uninstall"));
        assert_eq!(invocation.game_identity, "440");

        let uninstall = plan_game_action(&steam, GameAction::Uninstall);
        assert_eq!(uninstall.mode, GameActionMode::UserHandoff);
        assert!(matches!(
            uninstall.executor,
            PlannedExecutor::Handoff(ref uri) if uri == "steam://uninstall/440"
        ));

        let mut xbox = game("xbox-demo", "Xbox Demo", "xbox");
        xbox.external_id = Some("Microsoft.XboxDemo_8wekyb3d8bbwe".to_string());
        assert_eq!(
            plan_game_action(&xbox, GameAction::Verify).mode,
            GameActionMode::OsAutomation
        );
    }

    fn capability(
        capabilities: &[GameActionCapability],
        action: GameAction,
    ) -> &GameActionCapability {
        capabilities
            .iter()
            .find(|capability| capability.action == action)
            .expect("capability")
    }
}
