use std::fmt;

use serde::{Deserialize, Serialize};

pub const AUTOMATION_SESSION_SCHEMA_VERSION: u16 = 1;

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AutomationProvider {
    Steam,
    Epic,
    Gog,
    Ea,
    Ubisoft,
    Battlenet,
    Xbox,
    Manual,
    Og,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AutomationAction {
    Verify,
    Repair,
    CheckUpdate,
    Update,
    Uninstall,
}

impl AutomationAction {
    pub fn is_destructive(self) -> bool {
        matches!(self, Self::Repair | Self::Update | Self::Uninstall)
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AutomationTarget {
    pub game_id: String,
    pub provider: AutomationProvider,
    pub action: AutomationAction,
    /// A non-sensitive digest or stable provider identity, never a path or title.
    pub identity_fingerprint: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClientFingerprint {
    pub executable_version: String,
    pub window_class: String,
    pub structure_version: String,
    pub operating_system: String,
    pub locale: String,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AutomationStage {
    ValidateTarget,
    DetectClient,
    StartClient,
    WaitRecognizedWindow,
    DetectBlockingState,
    NavigateToTarget,
    ReconfirmExactTarget,
    OpenMaintenanceMenu,
    InvokeAction,
    MonitorProgress,
    RescanLibrary,
    ValidatePostcondition,
    AwaitingHandoff,
    Completed,
    Blocked,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AutomationStatus {
    Running,
    HandoffRequired,
    Completed,
    Blocked,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum SafeCheckpoint {
    Created,
    TargetValidated,
    ClientReady,
    TargetReconfirmed,
    MenuReady,
    ActionInvoked,
    ProviderCompleted,
    LibraryRescanned,
    PostconditionValidated,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HandoffKind {
    Login,
    Captcha,
    Consent,
    Security,
    Elevation,
    ClientUpdate,
    UnknownUi,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RecoveryAction {
    Retry,
    ContinueAfterHandoff,
    OpenClient,
    Cancel,
    None,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionIssueCode {
    TargetChanged,
    Timeout,
    PostconditionNotObserved,
    PlatformFailure,
    RetryLimitReached,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionIssue {
    pub code: SessionIssueCode,
    pub failed_at_stage: AutomationStage,
    pub recovery: RecoveryAction,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HandoffState {
    pub kind: HandoffKind,
    pub required_at_stage: AutomationStage,
    pub resume_checkpoint: SafeCheckpoint,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConfirmationGrant {
    pub game_id: String,
    pub provider: AutomationProvider,
    pub action: AutomationAction,
    pub identity_fingerprint: String,
    pub expires_at_ms: u64,
}

impl ConfirmationGrant {
    fn authorizes(&self, target: &AutomationTarget, now_ms: u64) -> bool {
        self.game_id == target.game_id
            && self.provider == target.provider
            && self.action == target.action
            && self.identity_fingerprint == target.identity_fingerprint
            && now_ms <= self.expires_at_ms
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AutomationSessionConfig {
    pub stage_timeout_ms: u64,
    pub max_retries: u32,
}

impl Default for AutomationSessionConfig {
    fn default() -> Self {
        Self {
            stage_timeout_ms: 30_000,
            max_retries: 3,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(tag = "type", content = "data", rename_all = "snake_case")]
pub enum SessionSignal {
    TargetValidated(AutomationTarget),
    ClientDetected,
    ClientMissing,
    ClientStarted,
    SplashObserved,
    WindowRecognized(ClientFingerprint),
    WindowUnrecognized,
    NoBlockingState,
    BlockingStateDetected(HandoffKind),
    NavigationCompleted,
    TargetReconfirmed {
        target: AutomationTarget,
        confirmation: Option<ConfirmationGrant>,
    },
    MaintenanceMenuOpened,
    ActionInvoked,
    ProgressObserved,
    ProviderActionFinished,
    LibraryRescanned,
    PostconditionValidated(bool),
    StepFailed(SessionIssueCode),
    Tick,
    CancelRequested,
    RetryRequested,
    ResumeRequested,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(tag = "type", content = "data", rename_all = "snake_case")]
pub enum AutomationDirective {
    ValidateTarget,
    DetectClient,
    StartClient,
    WaitForRecognizedWindow,
    DetectBlockingState,
    NavigateToTarget,
    ReconfirmExactTarget,
    OpenMaintenanceMenu,
    InvokeAction,
    MonitorProgress,
    RescanLibrary,
    ValidatePostcondition,
    RequestHandoff(HandoffKind),
    None,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AutomationTransition {
    pub session_id: String,
    pub revision: u64,
    pub previous_stage: AutomationStage,
    pub stage: AutomationStage,
    pub status: AutomationStatus,
    pub checkpoint: SafeCheckpoint,
    pub directive: AutomationDirective,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionErrorCode {
    InvalidInput,
    InvalidTransition,
    TerminalSession,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionError {
    pub code: SessionErrorCode,
    pub stage: AutomationStage,
}

impl fmt::Display for SessionError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{:?} at {:?}", self.code, self.stage)
    }
}

impl std::error::Error for SessionError {}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AutomationSession {
    pub schema_version: u16,
    pub session_id: String,
    pub target: AutomationTarget,
    pub config: AutomationSessionConfig,
    pub stage: AutomationStage,
    pub status: AutomationStatus,
    pub last_safe_checkpoint: SafeCheckpoint,
    pub resume_checkpoint: Option<SafeCheckpoint>,
    pub handoff: Option<HandoffState>,
    pub issue: Option<SessionIssue>,
    pub client_fingerprint: Option<ClientFingerprint>,
    pub client_started_by_session: bool,
    pub confirmation_authorized_until_ms: Option<u64>,
    pub attempt: u32,
    pub retry_count: u32,
    pub revision: u64,
    pub started_at_ms: u64,
    pub updated_at_ms: u64,
    pub stage_deadline_ms: Option<u64>,
}

impl AutomationSession {
    pub fn new(
        session_id: impl Into<String>,
        target: AutomationTarget,
        config: AutomationSessionConfig,
        now_ms: u64,
    ) -> Result<Self, SessionError> {
        let session_id = session_id.into();
        validate_token(&session_id).map_err(|_| SessionError {
            code: SessionErrorCode::InvalidInput,
            stage: AutomationStage::ValidateTarget,
        })?;
        validate_target(&target)?;
        if config.stage_timeout_ms == 0 {
            return Err(SessionError {
                code: SessionErrorCode::InvalidInput,
                stage: AutomationStage::ValidateTarget,
            });
        }

        Ok(Self {
            schema_version: AUTOMATION_SESSION_SCHEMA_VERSION,
            session_id,
            target,
            config: config.clone(),
            stage: AutomationStage::ValidateTarget,
            status: AutomationStatus::Running,
            last_safe_checkpoint: SafeCheckpoint::Created,
            resume_checkpoint: None,
            handoff: None,
            issue: None,
            client_fingerprint: None,
            client_started_by_session: false,
            confirmation_authorized_until_ms: None,
            attempt: 1,
            retry_count: 0,
            revision: 0,
            started_at_ms: now_ms,
            updated_at_ms: now_ms,
            stage_deadline_ms: Some(now_ms.saturating_add(config.stage_timeout_ms)),
        })
    }

    pub fn directive(&self) -> AutomationDirective {
        directive_for(self.stage, self.handoff.as_ref())
    }

    pub fn apply(
        &mut self,
        signal: SessionSignal,
        now_ms: u64,
    ) -> Result<AutomationTransition, SessionError> {
        let mut candidate = self.clone();
        let transition = candidate.apply_inner(signal, now_ms)?;
        *self = candidate;
        Ok(transition)
    }

    fn apply_inner(
        &mut self,
        signal: SessionSignal,
        now_ms: u64,
    ) -> Result<AutomationTransition, SessionError> {
        let previous_stage = self.stage;

        if self.status == AutomationStatus::Completed {
            return Err(self.error(SessionErrorCode::TerminalSession));
        }

        match signal {
            SessionSignal::CancelRequested => {
                if self.status == AutomationStatus::Cancelled {
                    return Err(self.error(SessionErrorCode::TerminalSession));
                }
                self.cancel(now_ms);
                return Ok(self.transition(previous_stage));
            }
            SessionSignal::RetryRequested => {
                self.retry(now_ms)?;
                return Ok(self.transition(previous_stage));
            }
            SessionSignal::ResumeRequested => {
                self.resume(now_ms)?;
                return Ok(self.transition(previous_stage));
            }
            _ => {}
        }

        if self.status != AutomationStatus::Running {
            return Err(self.error(SessionErrorCode::InvalidTransition));
        }

        if self
            .stage_deadline_ms
            .is_some_and(|deadline| now_ms >= deadline)
        {
            self.fail(
                SessionIssueCode::Timeout,
                previous_stage,
                RecoveryAction::Retry,
                now_ms,
            );
            return Ok(self.transition(previous_stage));
        }

        if let SessionSignal::BlockingStateDetected(kind) = signal {
            if self.stage == AutomationStage::ValidateTarget {
                return Err(self.error(SessionErrorCode::InvalidTransition));
            }
            self.require_handoff(kind, previous_stage, now_ms);
            return Ok(self.transition(previous_stage));
        }

        match (self.stage, signal) {
            (AutomationStage::ValidateTarget, SessionSignal::TargetValidated(observed)) => {
                if validate_target(&observed).is_err() || observed != self.target {
                    self.block(
                        SessionIssueCode::TargetChanged,
                        AutomationStage::ValidateTarget,
                        RecoveryAction::Retry,
                        now_ms,
                    );
                } else {
                    let resume_checkpoint = self.resume_checkpoint.take();
                    if resume_checkpoint.is_none() {
                        self.last_safe_checkpoint = SafeCheckpoint::TargetValidated;
                    }
                    self.advance(
                        resume_checkpoint
                            .map(resume_stage_for)
                            .unwrap_or(AutomationStage::DetectClient),
                        None,
                        now_ms,
                    );
                }
            }
            (AutomationStage::DetectClient, SessionSignal::ClientDetected) => {
                self.advance(AutomationStage::WaitRecognizedWindow, None, now_ms);
            }
            (AutomationStage::DetectClient, SessionSignal::ClientMissing) => {
                self.advance(AutomationStage::StartClient, None, now_ms);
            }
            (AutomationStage::StartClient, SessionSignal::ClientStarted) => {
                self.client_started_by_session = true;
                self.advance(AutomationStage::WaitRecognizedWindow, None, now_ms);
            }
            (AutomationStage::WaitRecognizedWindow, SessionSignal::SplashObserved) => {
                self.touch_without_extending_deadline(now_ms);
            }
            (
                AutomationStage::WaitRecognizedWindow,
                SessionSignal::WindowRecognized(fingerprint),
            ) => {
                if validate_fingerprint(&fingerprint) {
                    self.client_fingerprint = Some(fingerprint);
                    self.advance(AutomationStage::DetectBlockingState, None, now_ms);
                } else {
                    self.require_handoff(HandoffKind::UnknownUi, previous_stage, now_ms);
                }
            }
            (AutomationStage::WaitRecognizedWindow, SessionSignal::WindowUnrecognized) => {
                self.require_handoff(HandoffKind::UnknownUi, previous_stage, now_ms);
            }
            (AutomationStage::DetectBlockingState, SessionSignal::NoBlockingState) => {
                self.advance(
                    AutomationStage::NavigateToTarget,
                    Some(SafeCheckpoint::ClientReady),
                    now_ms,
                );
            }
            (AutomationStage::NavigateToTarget, SessionSignal::NavigationCompleted) => {
                self.advance(AutomationStage::ReconfirmExactTarget, None, now_ms);
            }
            (
                AutomationStage::ReconfirmExactTarget,
                SessionSignal::TargetReconfirmed {
                    target,
                    confirmation,
                },
            ) => {
                if validate_target(&target).is_err() || target != self.target {
                    self.block(
                        SessionIssueCode::TargetChanged,
                        AutomationStage::ReconfirmExactTarget,
                        RecoveryAction::Retry,
                        now_ms,
                    );
                } else if self.target.action.is_destructive() {
                    if let Some(grant) =
                        confirmation.filter(|grant| grant.authorizes(&self.target, now_ms))
                    {
                        self.confirmation_authorized_until_ms = Some(grant.expires_at_ms);
                        self.advance(
                            AutomationStage::OpenMaintenanceMenu,
                            Some(SafeCheckpoint::TargetReconfirmed),
                            now_ms,
                        );
                    } else {
                        self.require_handoff(HandoffKind::Consent, previous_stage, now_ms);
                    }
                } else {
                    self.advance(
                        AutomationStage::OpenMaintenanceMenu,
                        Some(SafeCheckpoint::TargetReconfirmed),
                        now_ms,
                    );
                }
            }
            (AutomationStage::OpenMaintenanceMenu, SessionSignal::MaintenanceMenuOpened) => {
                self.advance(
                    AutomationStage::InvokeAction,
                    Some(SafeCheckpoint::MenuReady),
                    now_ms,
                );
            }
            (AutomationStage::InvokeAction, SessionSignal::ActionInvoked) => {
                let confirmation_is_fresh = self
                    .confirmation_authorized_until_ms
                    .is_some_and(|expires_at| now_ms <= expires_at);
                if self.target.action.is_destructive() && !confirmation_is_fresh {
                    self.require_handoff(HandoffKind::Consent, previous_stage, now_ms);
                } else {
                    self.advance(
                        AutomationStage::MonitorProgress,
                        Some(SafeCheckpoint::ActionInvoked),
                        now_ms,
                    );
                }
            }
            (AutomationStage::MonitorProgress, SessionSignal::ProgressObserved) => {
                self.touch_and_extend_deadline(now_ms);
            }
            (AutomationStage::MonitorProgress, SessionSignal::ProviderActionFinished) => {
                self.confirmation_authorized_until_ms = None;
                self.advance(
                    AutomationStage::RescanLibrary,
                    Some(SafeCheckpoint::ProviderCompleted),
                    now_ms,
                );
            }
            (AutomationStage::RescanLibrary, SessionSignal::LibraryRescanned) => {
                self.advance(
                    AutomationStage::ValidatePostcondition,
                    Some(SafeCheckpoint::LibraryRescanned),
                    now_ms,
                );
            }
            (
                AutomationStage::ValidatePostcondition,
                SessionSignal::PostconditionValidated(true),
            ) => {
                self.complete(now_ms);
            }
            (
                AutomationStage::ValidatePostcondition,
                SessionSignal::PostconditionValidated(false),
            ) => {
                self.fail(
                    SessionIssueCode::PostconditionNotObserved,
                    previous_stage,
                    RecoveryAction::Retry,
                    now_ms,
                );
            }
            (_, SessionSignal::StepFailed(code)) => {
                if code == SessionIssueCode::TargetChanged {
                    self.block(code, previous_stage, RecoveryAction::Retry, now_ms);
                } else {
                    let recovery = if code == SessionIssueCode::RetryLimitReached {
                        RecoveryAction::None
                    } else {
                        RecoveryAction::Retry
                    };
                    self.fail(code, previous_stage, recovery, now_ms);
                }
            }
            (_, SessionSignal::Tick) => {
                return Ok(self.transition(previous_stage));
            }
            _ => return Err(self.error(SessionErrorCode::InvalidTransition)),
        }

        Ok(self.transition(previous_stage))
    }

    fn retry(&mut self, now_ms: u64) -> Result<(), SessionError> {
        if !matches!(
            self.status,
            AutomationStatus::Failed | AutomationStatus::Blocked | AutomationStatus::Cancelled
        ) {
            return Err(self.error(SessionErrorCode::InvalidTransition));
        }
        if self.retry_count >= self.config.max_retries {
            let failed_at_stage = self.stage;
            self.fail(
                SessionIssueCode::RetryLimitReached,
                failed_at_stage,
                RecoveryAction::None,
                now_ms,
            );
            return Ok(());
        }

        self.retry_count = self.retry_count.saturating_add(1);
        self.attempt = self.attempt.saturating_add(1);
        self.restart_from_checkpoint(now_ms);
        Ok(())
    }

    fn resume(&mut self, now_ms: u64) -> Result<(), SessionError> {
        if self.status != AutomationStatus::HandoffRequired {
            return Err(self.error(SessionErrorCode::InvalidTransition));
        }
        self.attempt = self.attempt.saturating_add(1);
        self.restart_from_checkpoint(now_ms);
        Ok(())
    }

    fn restart_from_checkpoint(&mut self, now_ms: u64) {
        self.resume_checkpoint = Some(self.last_safe_checkpoint);
        self.stage = AutomationStage::ValidateTarget;
        self.status = AutomationStatus::Running;
        self.handoff = None;
        self.issue = None;
        self.confirmation_authorized_until_ms = None;
        self.mark_changed(now_ms, true);
    }

    fn advance(&mut self, stage: AutomationStage, checkpoint: Option<SafeCheckpoint>, now_ms: u64) {
        self.stage = stage;
        self.status = AutomationStatus::Running;
        if let Some(checkpoint) = checkpoint {
            self.last_safe_checkpoint = self.last_safe_checkpoint.max(checkpoint);
        }
        self.issue = None;
        self.handoff = None;
        self.mark_changed(now_ms, true);
    }

    fn require_handoff(
        &mut self,
        kind: HandoffKind,
        required_at_stage: AutomationStage,
        now_ms: u64,
    ) {
        self.handoff = Some(HandoffState {
            kind,
            required_at_stage,
            resume_checkpoint: self.last_safe_checkpoint,
        });
        self.issue = None;
        self.stage = AutomationStage::AwaitingHandoff;
        self.status = AutomationStatus::HandoffRequired;
        self.confirmation_authorized_until_ms = None;
        self.mark_changed(now_ms, false);
    }

    fn fail(
        &mut self,
        code: SessionIssueCode,
        failed_at_stage: AutomationStage,
        recovery: RecoveryAction,
        now_ms: u64,
    ) {
        self.issue = Some(SessionIssue {
            code,
            failed_at_stage,
            recovery,
        });
        self.handoff = None;
        self.stage = AutomationStage::Failed;
        self.status = AutomationStatus::Failed;
        self.confirmation_authorized_until_ms = None;
        self.mark_changed(now_ms, false);
    }

    fn block(
        &mut self,
        code: SessionIssueCode,
        failed_at_stage: AutomationStage,
        recovery: RecoveryAction,
        now_ms: u64,
    ) {
        self.issue = Some(SessionIssue {
            code,
            failed_at_stage,
            recovery,
        });
        self.handoff = None;
        self.stage = AutomationStage::Blocked;
        self.status = AutomationStatus::Blocked;
        self.confirmation_authorized_until_ms = None;
        self.mark_changed(now_ms, false);
    }

    fn complete(&mut self, now_ms: u64) {
        self.stage = AutomationStage::Completed;
        self.status = AutomationStatus::Completed;
        self.last_safe_checkpoint = SafeCheckpoint::PostconditionValidated;
        self.issue = None;
        self.handoff = None;
        self.confirmation_authorized_until_ms = None;
        self.mark_changed(now_ms, false);
    }

    fn cancel(&mut self, now_ms: u64) {
        self.stage = AutomationStage::Cancelled;
        self.status = AutomationStatus::Cancelled;
        self.issue = None;
        self.handoff = None;
        self.confirmation_authorized_until_ms = None;
        self.resume_checkpoint = None;
        self.mark_changed(now_ms, false);
    }

    fn touch_without_extending_deadline(&mut self, now_ms: u64) {
        self.updated_at_ms = now_ms;
        self.revision = self.revision.saturating_add(1);
    }

    fn touch_and_extend_deadline(&mut self, now_ms: u64) {
        self.mark_changed(now_ms, true);
    }

    fn mark_changed(&mut self, now_ms: u64, reset_deadline: bool) {
        self.updated_at_ms = now_ms;
        self.revision = self.revision.saturating_add(1);
        self.stage_deadline_ms =
            reset_deadline.then(|| now_ms.saturating_add(self.config.stage_timeout_ms));
    }

    fn transition(&self, previous_stage: AutomationStage) -> AutomationTransition {
        AutomationTransition {
            session_id: self.session_id.clone(),
            revision: self.revision,
            previous_stage,
            stage: self.stage,
            status: self.status,
            checkpoint: self.last_safe_checkpoint,
            directive: self.directive(),
        }
    }

    fn error(&self, code: SessionErrorCode) -> SessionError {
        SessionError {
            code,
            stage: self.stage,
        }
    }
}

fn resume_stage_for(checkpoint: SafeCheckpoint) -> AutomationStage {
    match checkpoint {
        SafeCheckpoint::Created | SafeCheckpoint::TargetValidated => AutomationStage::DetectClient,
        SafeCheckpoint::ClientReady => AutomationStage::WaitRecognizedWindow,
        SafeCheckpoint::TargetReconfirmed | SafeCheckpoint::MenuReady => {
            AutomationStage::NavigateToTarget
        }
        SafeCheckpoint::ActionInvoked => AutomationStage::MonitorProgress,
        SafeCheckpoint::ProviderCompleted => AutomationStage::RescanLibrary,
        SafeCheckpoint::LibraryRescanned | SafeCheckpoint::PostconditionValidated => {
            AutomationStage::ValidatePostcondition
        }
    }
}

fn directive_for(stage: AutomationStage, handoff: Option<&HandoffState>) -> AutomationDirective {
    match stage {
        AutomationStage::ValidateTarget => AutomationDirective::ValidateTarget,
        AutomationStage::DetectClient => AutomationDirective::DetectClient,
        AutomationStage::StartClient => AutomationDirective::StartClient,
        AutomationStage::WaitRecognizedWindow => AutomationDirective::WaitForRecognizedWindow,
        AutomationStage::DetectBlockingState => AutomationDirective::DetectBlockingState,
        AutomationStage::NavigateToTarget => AutomationDirective::NavigateToTarget,
        AutomationStage::ReconfirmExactTarget => AutomationDirective::ReconfirmExactTarget,
        AutomationStage::OpenMaintenanceMenu => AutomationDirective::OpenMaintenanceMenu,
        AutomationStage::InvokeAction => AutomationDirective::InvokeAction,
        AutomationStage::MonitorProgress => AutomationDirective::MonitorProgress,
        AutomationStage::RescanLibrary => AutomationDirective::RescanLibrary,
        AutomationStage::ValidatePostcondition => AutomationDirective::ValidatePostcondition,
        AutomationStage::AwaitingHandoff => handoff
            .map(|state| AutomationDirective::RequestHandoff(state.kind))
            .unwrap_or(AutomationDirective::None),
        AutomationStage::Completed
        | AutomationStage::Blocked
        | AutomationStage::Failed
        | AutomationStage::Cancelled => AutomationDirective::None,
    }
}

fn validate_target(target: &AutomationTarget) -> Result<(), SessionError> {
    validate_token(&target.game_id)
        .and_then(|_| validate_token(&target.identity_fingerprint))
        .map_err(|_| SessionError {
            code: SessionErrorCode::InvalidInput,
            stage: AutomationStage::ValidateTarget,
        })
}

fn validate_fingerprint(fingerprint: &ClientFingerprint) -> bool {
    [
        fingerprint.executable_version.as_str(),
        fingerprint.window_class.as_str(),
        fingerprint.structure_version.as_str(),
        fingerprint.operating_system.as_str(),
        fingerprint.locale.as_str(),
    ]
    .into_iter()
    .all(|value| validate_token(value).is_ok())
}

fn validate_token(value: &str) -> Result<(), ()> {
    if value.is_empty() || value.len() > 128 {
        return Err(());
    }
    if value
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || "._:-".contains(character))
    {
        Ok(())
    } else {
        Err(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const START: u64 = 1_000;

    fn target(action: AutomationAction) -> AutomationTarget {
        AutomationTarget {
            game_id: "steam-440".to_string(),
            provider: AutomationProvider::Steam,
            action,
            identity_fingerprint: "steam:440:v1".to_string(),
        }
    }

    fn fingerprint() -> ClientFingerprint {
        ClientFingerprint {
            executable_version: "10.2.1".to_string(),
            window_class: "vguiPopupWindow".to_string(),
            structure_version: "steam-library-v4".to_string(),
            operating_system: "windows-11".to_string(),
            locale: "en-US".to_string(),
        }
    }

    fn session(action: AutomationAction) -> AutomationSession {
        AutomationSession::new(
            "session-01",
            target(action),
            AutomationSessionConfig {
                stage_timeout_ms: 100,
                max_retries: 2,
            },
            START,
        )
        .unwrap()
    }

    fn apply(
        session: &mut AutomationSession,
        signal: SessionSignal,
        now_ms: u64,
    ) -> AutomationTransition {
        session.apply(signal, now_ms).unwrap()
    }

    fn validate(session: &mut AutomationSession, now_ms: u64) {
        let observed_target = session.target.clone();
        apply(
            session,
            SessionSignal::TargetValidated(observed_target),
            now_ms,
        );
    }

    fn reach_reconfirm(session: &mut AutomationSession, now_ms: u64) {
        validate(session, now_ms);
        apply(session, SessionSignal::ClientDetected, now_ms + 1);
        apply(
            session,
            SessionSignal::WindowRecognized(fingerprint()),
            now_ms + 2,
        );
        apply(session, SessionSignal::NoBlockingState, now_ms + 3);
        apply(session, SessionSignal::NavigationCompleted, now_ms + 4);
    }

    fn confirmation(target: &AutomationTarget, expires_at_ms: u64) -> ConfirmationGrant {
        ConfirmationGrant {
            game_id: target.game_id.clone(),
            provider: target.provider,
            action: target.action,
            identity_fingerprint: target.identity_fingerprint.clone(),
            expires_at_ms,
        }
    }

    fn reach_monitoring(session: &mut AutomationSession, now_ms: u64) {
        reach_reconfirm(session, now_ms);
        let grant = session
            .target
            .action
            .is_destructive()
            .then(|| confirmation(&session.target, now_ms + 100));
        let observed_target = session.target.clone();
        apply(
            session,
            SessionSignal::TargetReconfirmed {
                target: observed_target,
                confirmation: grant,
            },
            now_ms + 5,
        );
        apply(session, SessionSignal::MaintenanceMenuOpened, now_ms + 6);
        apply(session, SessionSignal::ActionInvoked, now_ms + 7);
    }

    #[test]
    fn starts_with_target_validation_and_non_sensitive_identity() {
        let session = session(AutomationAction::Verify);

        assert_eq!(session.stage, AutomationStage::ValidateTarget);
        assert_eq!(session.directive(), AutomationDirective::ValidateTarget);
        assert_eq!(session.last_safe_checkpoint, SafeCheckpoint::Created);
        assert_eq!(session.stage_deadline_ms, Some(START + 100));
    }

    #[test]
    fn completes_only_after_rescan_and_observed_postcondition() {
        let mut session = session(AutomationAction::Verify);
        reach_monitoring(&mut session, START + 1);

        apply(
            &mut session,
            SessionSignal::ProviderActionFinished,
            START + 9,
        );
        assert_eq!(session.stage, AutomationStage::RescanLibrary);
        apply(&mut session, SessionSignal::LibraryRescanned, START + 10);
        assert_eq!(session.stage, AutomationStage::ValidatePostcondition);
        apply(
            &mut session,
            SessionSignal::PostconditionValidated(true),
            START + 11,
        );

        assert_eq!(session.status, AutomationStatus::Completed);
        assert_eq!(session.stage, AutomationStage::Completed);
        assert_eq!(
            session.last_safe_checkpoint,
            SafeCheckpoint::PostconditionValidated
        );
    }

    #[test]
    fn missing_client_routes_through_start_before_waiting_for_a_window() {
        let mut session = session(AutomationAction::Verify);
        validate(&mut session, START + 1);
        apply(&mut session, SessionSignal::ClientMissing, START + 2);
        assert_eq!(session.directive(), AutomationDirective::StartClient);
        apply(&mut session, SessionSignal::ClientStarted, START + 3);

        assert!(session.client_started_by_session);
        assert_eq!(
            session.directive(),
            AutomationDirective::WaitForRecognizedWindow
        );
    }

    #[test]
    fn login_captcha_consent_security_elevation_and_unknown_ui_require_handoff() {
        let blockers = [
            HandoffKind::Login,
            HandoffKind::Captcha,
            HandoffKind::Consent,
            HandoffKind::Security,
            HandoffKind::Elevation,
            HandoffKind::ClientUpdate,
            HandoffKind::UnknownUi,
        ];

        for blocker in blockers {
            let mut session = session(AutomationAction::Verify);
            validate(&mut session, START + 1);
            apply(&mut session, SessionSignal::ClientDetected, START + 2);
            apply(
                &mut session,
                SessionSignal::WindowRecognized(fingerprint()),
                START + 3,
            );
            apply(
                &mut session,
                SessionSignal::BlockingStateDetected(blocker),
                START + 4,
            );

            assert_eq!(session.status, AutomationStatus::HandoffRequired);
            assert_eq!(session.stage, AutomationStage::AwaitingHandoff);
            assert_eq!(
                session.directive(),
                AutomationDirective::RequestHandoff(blocker)
            );
            assert_eq!(session.stage_deadline_ms, None);
        }
    }

    #[test]
    fn unrecognized_or_sensitive_window_fingerprint_requires_unknown_ui_handoff() {
        let mut unrecognized_session = session(AutomationAction::Verify);
        validate(&mut unrecognized_session, START + 1);
        apply(
            &mut unrecognized_session,
            SessionSignal::ClientDetected,
            START + 2,
        );
        apply(
            &mut unrecognized_session,
            SessionSignal::WindowUnrecognized,
            START + 3,
        );
        assert_eq!(
            unrecognized_session.directive(),
            AutomationDirective::RequestHandoff(HandoffKind::UnknownUi)
        );

        let mut session = session(AutomationAction::Verify);
        validate(&mut session, START + 1);
        apply(&mut session, SessionSignal::ClientDetected, START + 2);
        let mut unsafe_fingerprint = fingerprint();
        unsafe_fingerprint.window_class = "C:\\Users\\name\\secret".to_string();
        apply(
            &mut session,
            SessionSignal::WindowRecognized(unsafe_fingerprint),
            START + 3,
        );
        assert_eq!(
            session.directive(),
            AutomationDirective::RequestHandoff(HandoffKind::UnknownUi)
        );
        assert_eq!(session.client_fingerprint, None);
    }

    #[test]
    fn target_mismatch_blocks_before_the_menu_or_action() {
        let mut session = session(AutomationAction::Uninstall);
        reach_reconfirm(&mut session, START + 1);
        let mut changed = session.target.clone();
        changed.game_id = "steam-570".to_string();
        apply(
            &mut session,
            SessionSignal::TargetReconfirmed {
                target: changed,
                confirmation: None,
            },
            START + 6,
        );

        assert_eq!(session.status, AutomationStatus::Blocked);
        assert_eq!(session.stage, AutomationStage::Blocked);
        assert_eq!(
            session.issue.as_ref().unwrap().code,
            SessionIssueCode::TargetChanged
        );
        assert_eq!(session.last_safe_checkpoint, SafeCheckpoint::ClientReady);
    }

    #[test]
    fn destructive_action_requires_fresh_exact_confirmation_without_storing_a_token() {
        let mut session = session(AutomationAction::Repair);
        reach_reconfirm(&mut session, START + 1);
        let observed_target = session.target.clone();
        apply(
            &mut session,
            SessionSignal::TargetReconfirmed {
                target: observed_target,
                confirmation: None,
            },
            START + 6,
        );
        assert_eq!(
            session.directive(),
            AutomationDirective::RequestHandoff(HandoffKind::Consent)
        );

        let serialized = serde_json::to_string(&session).unwrap();
        assert!(!serialized.to_lowercase().contains("token"));
    }

    #[test]
    fn expired_or_mismatched_confirmation_cannot_authorize_destructive_action() {
        for grant in [
            confirmation(&target(AutomationAction::Uninstall), START),
            ConfirmationGrant {
                game_id: "steam-570".to_string(),
                provider: AutomationProvider::Steam,
                action: AutomationAction::Uninstall,
                identity_fingerprint: "steam:570:v1".to_string(),
                expires_at_ms: START + 100,
            },
        ] {
            let mut session = session(AutomationAction::Uninstall);
            reach_reconfirm(&mut session, START + 1);
            let observed_target = session.target.clone();
            apply(
                &mut session,
                SessionSignal::TargetReconfirmed {
                    target: observed_target,
                    confirmation: Some(grant),
                },
                START + 6,
            );
            assert_eq!(session.status, AutomationStatus::HandoffRequired);
            assert_eq!(session.last_safe_checkpoint, SafeCheckpoint::ClientReady);
        }
    }

    #[test]
    fn destructive_confirmation_must_still_be_fresh_at_invoke_boundary() {
        let mut session = session(AutomationAction::Uninstall);
        reach_reconfirm(&mut session, START + 1);
        let observed_target = session.target.clone();
        let grant = confirmation(&session.target, START + 7);
        apply(
            &mut session,
            SessionSignal::TargetReconfirmed {
                target: observed_target,
                confirmation: Some(grant),
            },
            START + 6,
        );
        apply(
            &mut session,
            SessionSignal::MaintenanceMenuOpened,
            START + 7,
        );
        apply(&mut session, SessionSignal::ActionInvoked, START + 8);

        assert_eq!(session.status, AutomationStatus::HandoffRequired);
        assert_eq!(
            session.directive(),
            AutomationDirective::RequestHandoff(HandoffKind::Consent)
        );
        assert_eq!(session.last_safe_checkpoint, SafeCheckpoint::MenuReady);
    }

    #[test]
    fn progress_refreshes_timeout_but_splash_does_not() {
        let mut waiting = session(AutomationAction::Verify);
        validate(&mut waiting, START + 1);
        apply(&mut waiting, SessionSignal::ClientDetected, START + 2);
        let original_deadline = waiting.stage_deadline_ms;
        apply(&mut waiting, SessionSignal::SplashObserved, START + 20);
        assert_eq!(waiting.stage_deadline_ms, original_deadline);

        let mut monitoring = session(AutomationAction::Verify);
        reach_monitoring(&mut monitoring, START + 1);
        apply(&mut monitoring, SessionSignal::ProgressObserved, START + 30);
        assert_eq!(monitoring.stage_deadline_ms, Some(START + 130));
    }

    #[test]
    fn timeout_records_exact_stage_and_retry_revalidates_from_safe_checkpoint() {
        let mut session = session(AutomationAction::Verify);
        reach_monitoring(&mut session, START + 1);
        let deadline = session.stage_deadline_ms.unwrap();
        apply(&mut session, SessionSignal::Tick, deadline);

        assert_eq!(session.status, AutomationStatus::Failed);
        assert_eq!(
            session.issue.as_ref().unwrap().code,
            SessionIssueCode::Timeout
        );
        assert_eq!(
            session.issue.as_ref().unwrap().failed_at_stage,
            AutomationStage::MonitorProgress
        );
        assert_eq!(session.last_safe_checkpoint, SafeCheckpoint::ActionInvoked);

        apply(&mut session, SessionSignal::RetryRequested, deadline + 1);
        assert_eq!(session.stage, AutomationStage::ValidateTarget);
        validate(&mut session, deadline + 2);
        assert_eq!(session.stage, AutomationStage::MonitorProgress);
    }

    #[test]
    fn resume_after_handoff_revalidates_target_before_using_checkpoint() {
        let mut session = session(AutomationAction::Verify);
        validate(&mut session, START + 1);
        apply(&mut session, SessionSignal::ClientDetected, START + 2);
        apply(
            &mut session,
            SessionSignal::WindowRecognized(fingerprint()),
            START + 3,
        );
        apply(
            &mut session,
            SessionSignal::BlockingStateDetected(HandoffKind::Login),
            START + 4,
        );
        apply(&mut session, SessionSignal::ResumeRequested, START + 5);

        assert_eq!(session.stage, AutomationStage::ValidateTarget);
        assert_eq!(session.attempt, 2);
        validate(&mut session, START + 6);
        assert_eq!(session.stage, AutomationStage::DetectClient);
    }

    #[test]
    fn handoff_after_invoke_resumes_monitoring_without_invoking_twice() {
        let mut session = session(AutomationAction::Update);
        reach_monitoring(&mut session, START + 1);
        apply(
            &mut session,
            SessionSignal::BlockingStateDetected(HandoffKind::Elevation),
            START + 10,
        );
        assert_eq!(session.last_safe_checkpoint, SafeCheckpoint::ActionInvoked);

        apply(&mut session, SessionSignal::ResumeRequested, START + 11);
        validate(&mut session, START + 12);

        assert_eq!(session.stage, AutomationStage::MonitorProgress);
        assert_eq!(session.directive(), AutomationDirective::MonitorProgress);
    }

    #[test]
    fn cancellation_is_serializable_and_retryable_from_last_safe_checkpoint() {
        let mut session = session(AutomationAction::Verify);
        reach_monitoring(&mut session, START + 1);
        apply(&mut session, SessionSignal::CancelRequested, START + 10);
        assert_eq!(session.status, AutomationStatus::Cancelled);
        assert_eq!(session.stage_deadline_ms, None);

        let json = serde_json::to_string(&session).unwrap();
        let mut restored: AutomationSession = serde_json::from_str(&json).unwrap();
        apply(&mut restored, SessionSignal::RetryRequested, START + 11);
        validate(&mut restored, START + 12);
        assert_eq!(restored.stage, AutomationStage::MonitorProgress);
    }

    #[test]
    fn retry_limit_fails_closed() {
        let mut session = session(AutomationAction::Verify);
        for retry in 0..=2 {
            apply(
                &mut session,
                SessionSignal::CancelRequested,
                START + retry * 10 + 1,
            );
            apply(
                &mut session,
                SessionSignal::RetryRequested,
                START + retry * 10 + 2,
            );
            if retry < 2 {
                validate(&mut session, START + retry * 10 + 3);
            }
        }

        assert_eq!(session.status, AutomationStatus::Failed);
        assert_eq!(
            session.issue.as_ref().unwrap().code,
            SessionIssueCode::RetryLimitReached
        );
    }

    #[test]
    fn false_postcondition_is_failed_not_completed() {
        let mut session = session(AutomationAction::Verify);
        reach_monitoring(&mut session, START + 1);
        apply(
            &mut session,
            SessionSignal::ProviderActionFinished,
            START + 9,
        );
        apply(&mut session, SessionSignal::LibraryRescanned, START + 10);
        apply(
            &mut session,
            SessionSignal::PostconditionValidated(false),
            START + 11,
        );

        assert_eq!(session.status, AutomationStatus::Failed);
        assert_eq!(
            session.issue.as_ref().unwrap().code,
            SessionIssueCode::PostconditionNotObserved
        );
    }

    #[test]
    fn invalid_transition_does_not_mutate_session() {
        let mut session = session(AutomationAction::Verify);
        let before = session.clone();
        let error = session
            .apply(SessionSignal::ActionInvoked, START + 1)
            .unwrap_err();

        assert_eq!(error.code, SessionErrorCode::InvalidTransition);
        assert_eq!(session, before);
    }

    #[test]
    fn typed_json_has_no_secret_or_capture_fields() {
        let session = session(AutomationAction::Uninstall);
        let json = serde_json::to_string(&session).unwrap();
        let lower = json.to_lowercase();

        for forbidden in [
            "password",
            "token",
            "captcha_answer",
            "ocr_text",
            "screenshot",
            "window_title",
            "install_path",
        ] {
            assert!(!lower.contains(forbidden));
        }
        let restored: AutomationSession = serde_json::from_str(&json).unwrap();
        assert_eq!(restored, session);
    }

    #[test]
    fn rejects_paths_urls_whitespace_and_empty_identity_fields() {
        for value in ["", "C:\\Games\\secret", "https://example.test", "has space"] {
            let mut unsafe_target = target(AutomationAction::Verify);
            unsafe_target.identity_fingerprint = value.to_string();
            let error = AutomationSession::new(
                "session-01",
                unsafe_target,
                AutomationSessionConfig::default(),
                START,
            )
            .unwrap_err();
            assert_eq!(error.code, SessionErrorCode::InvalidInput);
        }
    }

    #[test]
    fn completed_session_rejects_late_cancel_or_duplicate_completion() {
        let mut session = session(AutomationAction::Verify);
        reach_monitoring(&mut session, START + 1);
        apply(
            &mut session,
            SessionSignal::ProviderActionFinished,
            START + 9,
        );
        apply(&mut session, SessionSignal::LibraryRescanned, START + 10);
        apply(
            &mut session,
            SessionSignal::PostconditionValidated(true),
            START + 11,
        );

        assert_eq!(
            session
                .apply(SessionSignal::CancelRequested, START + 12)
                .unwrap_err()
                .code,
            SessionErrorCode::TerminalSession
        );
    }

    #[test]
    fn step_failure_records_stage_and_retry_recovery_without_freeform_text() {
        let mut session = session(AutomationAction::Verify);
        validate(&mut session, START + 1);
        apply(
            &mut session,
            SessionSignal::StepFailed(SessionIssueCode::PlatformFailure),
            START + 2,
        );

        assert_eq!(session.status, AutomationStatus::Failed);
        assert_eq!(
            session.issue,
            Some(SessionIssue {
                code: SessionIssueCode::PlatformFailure,
                failed_at_stage: AutomationStage::DetectClient,
                recovery: RecoveryAction::Retry,
            })
        );
    }

    #[test]
    fn action_destructiveness_is_explicit() {
        assert!(!AutomationAction::Verify.is_destructive());
        assert!(!AutomationAction::CheckUpdate.is_destructive());
        assert!(AutomationAction::Repair.is_destructive());
        assert!(AutomationAction::Update.is_destructive());
        assert!(AutomationAction::Uninstall.is_destructive());
    }
}
