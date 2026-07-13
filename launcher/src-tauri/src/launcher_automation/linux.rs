//! Fail-closed semantic Linux AT-SPI automation.
//!
//! Steam is the only native Linux provider. Other supported launchers require an exact,
//! explicit compatibility-layer binding; this module never discovers or guesses prefixes.
//! It exposes no pointer, keyboard, authentication, consent, or elevation primitive.
//!
//! Optional live Action-interface adapter (not wired by this isolated slice):
//! `linux-atspi = ["dep:atspi"]` with target dependency
//! `atspi = { version = "=0.30.0", optional = true, features = ["proxies"] }`.

use std::time::{SystemTime, UNIX_EPOCH};

use super::providers::{
    detect_blocking_state, provider_spec, rank_candidates, ActionRecipe, BlockingState,
    CompletionProof, ControlRole, ElementDescriptor, MaintenanceAction, ProviderId, RecipeStep,
    SelectionError, StructuralRelationship,
};

const MAX_NODES: usize = 2_048;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AtspiAvailability {
    Available,
    Disabled,
    BusUnavailable,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CompatibilityLayer {
    Wine,
    Proton,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CompatibilityLayerConfig {
    pub provider: ProviderId,
    pub layer: CompatibilityLayer,
    /// Exact process name reported by the configured prefix, for example an `.exe` name.
    pub process_name: String,
    /// Stable caller-owned prefix identity. Paths are resolved outside this module.
    pub prefix_id: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LinuxProviderMode {
    NativeSteam,
    Compatibility(CompatibilityLayerConfig),
}

pub fn resolve_linux_provider(
    provider: ProviderId,
    compatibility: Option<&CompatibilityLayerConfig>,
) -> Result<LinuxProviderMode, String> {
    if provider == ProviderId::Steam {
        return Ok(LinuxProviderMode::NativeSteam);
    }
    if provider == ProviderId::Xbox {
        return Err("Xbox is not an available Linux provider".into());
    }
    let config = compatibility.ok_or_else(|| {
        format!(
            "{} requires an explicit compatibility-layer configuration",
            provider.key()
        )
    })?;
    if config.provider != provider || config.process_name.is_empty() || config.prefix_id.is_empty()
    {
        return Err(
            "compatibility configuration is incomplete or bound to another provider".into(),
        );
    }
    Ok(LinuxProviderMode::Compatibility(config.clone()))
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AtspiSnapshot {
    /// Stable object path or application-provided accessible identifier.
    pub accessible_id: String,
    /// Raw AT-SPI role name; never a localized role description.
    pub role: String,
    pub name: String,
    pub description: String,
    pub bus_name: String,
    pub process_name: String,
    pub pid: u32,
    pub compatibility_prefix_id: Option<String>,
    pub enabled: bool,
    pub visible: bool,
    pub sensitive: bool,
    pub password: bool,
    pub modal: bool,
    /// Machine-readable Action interface names, never key bindings.
    pub action_names: Vec<String>,
    pub ancestor_roles: Vec<ControlRole>,
    pub identity_tokens: Vec<String>,
}

impl AtspiSnapshot {
    fn descriptor(&self, provider: ProviderId, expected_game: &str) -> ElementDescriptor {
        let exact_game = self.has_identity(expected_game);
        let relationship = if self.modal {
            StructuralRelationship::BlockingDialog
        } else if exact_game && self.ancestor_roles.contains(&ControlRole::Menu) {
            StructuralRelationship::MaintenanceMenuOfExactGame
        } else if exact_game {
            StructuralRelationship::DescendantOfExactGame
        } else {
            StructuralRelationship::ProviderWindow
        };
        ElementDescriptor {
            automation_id: self.accessible_id.clone(),
            role: map_atspi_role(&self.role),
            name: self.name.clone(),
            provider: Some(provider),
            bound_game_identity: exact_game.then(|| expected_game.to_string()),
            relationship,
            enabled: self.enabled,
            visible: self.visible,
            password: self.password,
        }
    }

    fn blocking_descriptor(&self, provider: ProviderId) -> ElementDescriptor {
        ElementDescriptor {
            automation_id: self.accessible_id.clone(),
            role: map_atspi_role(&self.role),
            name: format!("{} {}", self.name, self.description),
            provider: Some(provider),
            bound_game_identity: None,
            relationship: if self.modal {
                StructuralRelationship::BlockingDialog
            } else {
                StructuralRelationship::ProviderWindow
            },
            enabled: self.enabled,
            visible: self.visible,
            password: self.password,
        }
    }

    fn has_identity(&self, expected: &str) -> bool {
        self.identity_tokens.iter().any(|token| token == expected)
    }
}

pub fn map_atspi_role(role: &str) -> ControlRole {
    match role {
        "application" | "frame" | "window" => ControlRole::Window,
        "dialog" | "alert" => ControlRole::Dialog,
        "push button" | "button" => ControlRole::Button,
        "menu item" | "check menu item" | "radio menu item" => ControlRole::MenuItem,
        "list item" | "table row" => ControlRole::ListItem,
        "panel" | "scroll pane" | "section" => ControlRole::Pane,
        "text" | "password text" | "entry" => ControlRole::Text,
        _ => ControlRole::Custom,
    }
}

pub trait AtspiNode: Clone {
    type Error: ToString;

    fn snapshot(&self) -> Result<AtspiSnapshot, Self::Error>;
    fn children(&self) -> Result<Vec<Self>, Self::Error>;
    fn invoke_action(&self, exact_action_name: &str) -> Result<bool, Self::Error>;
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LinuxApplication<N> {
    pub bus_name: String,
    pub process_name: String,
    pub pid: u32,
    pub compatibility_prefix_id: Option<String>,
    pub root: N,
}

pub trait AtspiSource {
    type Node: AtspiNode;
    type Error: ToString;

    fn availability(&self) -> AtspiAvailability;
    fn applications(&self) -> Result<Vec<LinuxApplication<Self::Node>>, Self::Error>;
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LinuxBoundConfirmation {
    pub provider: ProviderId,
    pub game_identity: String,
    pub action: MaintenanceAction,
    pub bus_name: String,
    pub pid: u32,
    pub compatibility_prefix_id: Option<String>,
    pub expires_at_unix_ms: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LinuxHandoffReason {
    AtspiUnavailable(AtspiAvailability),
    BlockingState(BlockingState),
    UnknownModal,
    SensitiveControl,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LinuxExecutionState {
    StartedAwaitingObservation { proof: CompletionProof },
    HandoffRequired(LinuxHandoffReason),
    NotApplicable(String),
    Blocked(String),
    Failed(String),
}

pub struct LinuxAtspiBackend<S> {
    source: S,
}

impl<S: AtspiSource> LinuxAtspiBackend<S> {
    pub fn new(source: S) -> Self {
        Self { source }
    }

    pub fn execute(
        &self,
        provider: ProviderId,
        compatibility: Option<&CompatibilityLayerConfig>,
        game_identity: &str,
        action: MaintenanceAction,
        confirmation: Option<&LinuxBoundConfirmation>,
    ) -> LinuxExecutionState {
        let availability = self.source.availability();
        if availability != AtspiAvailability::Available {
            return LinuxExecutionState::HandoffRequired(LinuxHandoffReason::AtspiUnavailable(
                availability,
            ));
        }
        let mode = match resolve_linux_provider(provider, compatibility) {
            Ok(mode) => mode,
            Err(error) => return LinuxExecutionState::NotApplicable(error),
        };
        let applications = match self.source.applications() {
            Ok(applications) => applications,
            Err(error) => return LinuxExecutionState::Failed(error.to_string()),
        };
        let matches: Vec<_> = applications
            .into_iter()
            .filter(|application| application_matches(application, &mode))
            .collect();
        let [application] = matches.as_slice() else {
            return LinuxExecutionState::Blocked(if matches.is_empty() {
                "no exact AT-SPI provider application identity matched".into()
            } else {
                "AT-SPI provider application identity was ambiguous".into()
            });
        };

        let recipe = provider_spec(provider).recipe(action);
        if action.destructive()
            && !valid_confirmation(confirmation, provider, game_identity, action, application)
        {
            return LinuxExecutionState::Blocked(
                "a current confirmation bound to provider, game, action, bus, process, and prefix is required"
                    .into(),
            );
        }
        let nodes = match flatten(&application.root) {
            Ok(nodes) => nodes,
            Err(error) => return LinuxExecutionState::Failed(error),
        };
        let snapshots: Vec<_> = nodes
            .iter()
            .filter_map(|node| node.snapshot().ok())
            .collect();
        let descriptors: Vec<_> = snapshots
            .iter()
            .map(|snapshot| snapshot.blocking_descriptor(provider))
            .collect();
        if let Some(state) = detect_blocking_state(&descriptors) {
            return LinuxExecutionState::HandoffRequired(LinuxHandoffReason::BlockingState(state));
        }
        if snapshots.iter().any(|snapshot| snapshot.modal) {
            return LinuxExecutionState::HandoffRequired(LinuxHandoffReason::UnknownModal);
        }
        if snapshots
            .iter()
            .any(|snapshot| snapshot.sensitive || snapshot.password)
        {
            return LinuxExecutionState::HandoffRequired(LinuxHandoffReason::SensitiveControl);
        }
        match run_recipe(&nodes, &recipe, provider, game_identity) {
            Ok(()) => match completion_proof(&recipe) {
                Some(proof) => LinuxExecutionState::StartedAwaitingObservation { proof },
                None => LinuxExecutionState::Blocked(
                    "recipe did not declare an observable completion proof".into(),
                ),
            },
            Err(state) => state,
        }
    }
}

fn completion_proof(recipe: &ActionRecipe) -> Option<CompletionProof> {
    recipe.steps.iter().find_map(|step| match step {
        RecipeStep::Observe(proof) => Some(*proof),
        _ => None,
    })
}

fn application_matches<N>(application: &LinuxApplication<N>, mode: &LinuxProviderMode) -> bool {
    match mode {
        LinuxProviderMode::NativeSteam => {
            application.process_name == "steam"
                && application.compatibility_prefix_id.is_none()
                && !application.bus_name.is_empty()
        }
        LinuxProviderMode::Compatibility(config) => {
            application.process_name == config.process_name
                && application.compatibility_prefix_id.as_deref() == Some(&config.prefix_id)
                && !application.bus_name.is_empty()
        }
    }
}

fn valid_confirmation<N>(
    confirmation: Option<&LinuxBoundConfirmation>,
    provider: ProviderId,
    game_identity: &str,
    action: MaintenanceAction,
    application: &LinuxApplication<N>,
) -> bool {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(u64::MAX, |duration| duration.as_millis() as u64);
    confirmation.is_some_and(|bound| {
        bound.provider == provider
            && bound.game_identity == game_identity
            && bound.action == action
            && bound.bus_name == application.bus_name
            && bound.pid == application.pid
            && bound.compatibility_prefix_id == application.compatibility_prefix_id
            && bound.expires_at_unix_ms >= now
    })
}

fn flatten<N: AtspiNode>(root: &N) -> Result<Vec<N>, String> {
    let mut pending = vec![root.clone()];
    let mut nodes = Vec::new();
    while let Some(node) = pending.pop() {
        if nodes.len() >= MAX_NODES {
            return Err("AT-SPI tree exceeded the fail-closed node limit".into());
        }
        pending.extend(node.children().map_err(|error| error.to_string())?);
        nodes.push(node);
    }
    Ok(nodes)
}

fn run_recipe<N: AtspiNode>(
    nodes: &[N],
    recipe: &ActionRecipe,
    provider: ProviderId,
    game_identity: &str,
) -> Result<(), LinuxExecutionState> {
    for step in &recipe.steps {
        let (selector, relationship, allowed_actions): (_, _, &[&str]) = match step {
            RecipeStep::SelectExactGame(selector) => (
                selector,
                StructuralRelationship::DescendantOfExactGame,
                &["select", "click", "press"],
            ),
            RecipeStep::OpenMaintenanceMenu(selector) => (
                selector,
                StructuralRelationship::DescendantOfExactGame,
                &["open", "show menu", "click", "press"],
            ),
            RecipeStep::InvokeAction { selector, .. } => (
                selector,
                StructuralRelationship::MaintenanceMenuOfExactGame,
                &["click", "press"],
            ),
            RecipeStep::Observe(_) => continue,
        };
        let snapshots: Vec<_> = nodes
            .iter()
            .filter_map(|node| node.snapshot().ok())
            .collect();
        let mut descriptors: Vec<_> = snapshots
            .iter()
            .map(|snapshot| snapshot.descriptor(provider, game_identity))
            .collect();
        for descriptor in &mut descriptors {
            if descriptor.relationship != StructuralRelationship::BlockingDialog
                && descriptor.bound_game_identity.is_some()
            {
                descriptor.relationship = relationship;
            }
        }
        let candidate =
            rank_candidates(selector, &descriptors, provider, game_identity).map_err(|error| {
                match error {
                    SelectionError::NoSafeMatch => LinuxExecutionState::Blocked(
                        "required semantic AT-SPI target was not found".into(),
                    ),
                    SelectionError::Ambiguous { .. } => {
                        LinuxExecutionState::Blocked("semantic AT-SPI target was ambiguous".into())
                    }
                }
            })?;
        let snapshot = &snapshots[candidate.index];
        let Some(action_name) = allowed_actions
            .iter()
            .find(|name| snapshot.action_names.iter().any(|actual| actual == **name))
        else {
            return Err(LinuxExecutionState::Blocked(
                "target exposes no allowed semantic AT-SPI action".into(),
            ));
        };
        nodes[candidate.index]
            .invoke_action(action_name)
            .map_err(|error| LinuxExecutionState::Failed(error.to_string()))?
            .then_some(())
            .ok_or_else(|| LinuxExecutionState::Blocked("AT-SPI action was rejected".into()))?;
    }
    Ok(())
}

/// Optional native Action-interface adapter. It resolves an exact action name to its index;
/// keyboard bindings returned by AT-SPI are intentionally ignored.
#[cfg(all(target_os = "linux", feature = "linux-atspi"))]
pub mod native {
    use atspi::proxy::action::ActionProxy;

    pub async fn invoke_exact_action(
        proxy: &ActionProxy<'_>,
        expected_name: &str,
    ) -> Result<bool, Box<dyn std::error::Error>> {
        let count = proxy.n_actions().await?;
        for index in 0..count {
            if proxy.get_name(index).await? == expected_name {
                return proxy.do_action(index).await;
            }
        }
        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use std::{cell::RefCell, rc::Rc};

    use super::*;

    #[derive(Clone)]
    struct Node {
        snapshot: AtspiSnapshot,
        children: Vec<Node>,
        calls: Rc<RefCell<Vec<String>>>,
    }

    impl AtspiNode for Node {
        type Error = String;

        fn snapshot(&self) -> Result<AtspiSnapshot, Self::Error> {
            Ok(self.snapshot.clone())
        }

        fn children(&self) -> Result<Vec<Self>, Self::Error> {
            Ok(self.children.clone())
        }

        fn invoke_action(&self, name: &str) -> Result<bool, Self::Error> {
            self.calls.borrow_mut().push(name.into());
            Ok(true)
        }
    }

    struct Source {
        availability: AtspiAvailability,
        applications: Vec<LinuxApplication<Node>>,
    }

    impl AtspiSource for Source {
        type Node = Node;
        type Error = String;

        fn availability(&self) -> AtspiAvailability {
            self.availability
        }

        fn applications(&self) -> Result<Vec<LinuxApplication<Self::Node>>, Self::Error> {
            Ok(self.applications.clone())
        }
    }

    fn node(id: &str, role: &str, actions: &[&str]) -> Node {
        Node {
            snapshot: AtspiSnapshot {
                accessible_id: id.into(),
                role: role.into(),
                name: "beliebiger lokalisierter Text".into(),
                description: String::new(),
                bus_name: ":1.42".into(),
                process_name: "steam".into(),
                pid: 42,
                compatibility_prefix_id: None,
                enabled: true,
                visible: true,
                sensitive: false,
                password: false,
                modal: false,
                action_names: actions.iter().map(|action| (*action).into()).collect(),
                ancestor_roles: vec![ControlRole::Pane],
                identity_tokens: Vec::new(),
            },
            children: Vec::new(),
            calls: Rc::new(RefCell::new(Vec::new())),
        }
    }

    fn steam_tree() -> Node {
        let mut game = node("library_game_list_item", "list item", &["select"]);
        game.snapshot.identity_tokens.push("app-42".into());
        let mut manage = node("game_manage_button", "push button", &["open"]);
        manage.snapshot.ancestor_roles = vec![ControlRole::ListItem];
        manage.snapshot.identity_tokens.push("app-42".into());
        let mut verify = node("repair", "menu item", &["click"]);
        verify.snapshot.ancestor_roles = vec![ControlRole::Menu];
        verify.snapshot.identity_tokens.push("app-42".into());
        let mut root = node("root", "application", &[]);
        root.children = vec![game, manage, verify];
        root
    }

    fn source(root: Node) -> Source {
        Source {
            availability: AtspiAvailability::Available,
            applications: vec![LinuxApplication {
                bus_name: ":1.42".into(),
                process_name: "steam".into(),
                pid: 42,
                compatibility_prefix_id: None,
                root,
            }],
        }
    }

    fn confirmation() -> LinuxBoundConfirmation {
        LinuxBoundConfirmation {
            provider: ProviderId::Steam,
            game_identity: "app-42".into(),
            action: MaintenanceAction::Repair,
            bus_name: ":1.42".into(),
            pid: 42,
            compatibility_prefix_id: None,
            expires_at_unix_ms: u64::MAX,
        }
    }

    fn compat(provider: ProviderId) -> CompatibilityLayerConfig {
        CompatibilityLayerConfig {
            provider,
            layer: CompatibilityLayer::Wine,
            process_name: "EpicGamesLauncher.exe".into(),
            prefix_id: "prefix-epic".into(),
        }
    }

    #[test]
    fn bus_or_accessibility_unavailable_hands_off() {
        let backend = LinuxAtspiBackend::new(Source {
            availability: AtspiAvailability::BusUnavailable,
            applications: Vec::new(),
        });
        assert_eq!(
            backend.execute(
                ProviderId::Steam,
                None,
                "app-42",
                MaintenanceAction::Repair,
                None
            ),
            LinuxExecutionState::HandoffRequired(LinuxHandoffReason::AtspiUnavailable(
                AtspiAvailability::BusUnavailable
            ))
        );
    }

    #[test]
    fn compatibility_is_explicit_and_never_guessed() {
        assert_eq!(
            resolve_linux_provider(ProviderId::Steam, None),
            Ok(LinuxProviderMode::NativeSteam)
        );
        assert!(resolve_linux_provider(ProviderId::Epic, None).is_err());
        assert!(resolve_linux_provider(ProviderId::Epic, Some(&compat(ProviderId::Epic))).is_ok());
        assert!(resolve_linux_provider(ProviderId::Gog, Some(&compat(ProviderId::Epic))).is_err());
        assert!(resolve_linux_provider(ProviderId::Xbox, Some(&compat(ProviderId::Xbox))).is_err());
    }

    #[test]
    fn exact_process_prefix_and_ambiguity_are_fail_closed() {
        let mut wrong = source(steam_tree());
        wrong.applications[0].process_name = "steamwebhelper".into();
        assert!(matches!(
            LinuxAtspiBackend::new(wrong).execute(
                ProviderId::Steam,
                None,
                "app-42",
                MaintenanceAction::Repair,
                Some(&confirmation())
            ),
            LinuxExecutionState::Blocked(_)
        ));
        let mut ambiguous = source(steam_tree());
        ambiguous
            .applications
            .push(ambiguous.applications[0].clone());
        assert!(matches!(
            LinuxAtspiBackend::new(ambiguous).execute(
                ProviderId::Steam,
                None,
                "app-42",
                MaintenanceAction::Repair,
                Some(&confirmation())
            ),
            LinuxExecutionState::Blocked(_)
        ));
        let mut ambiguous_control = steam_tree();
        ambiguous_control
            .children
            .push(ambiguous_control.children[0].clone());
        assert!(matches!(
            LinuxAtspiBackend::new(source(ambiguous_control)).execute(
                ProviderId::Steam,
                None,
                "app-42",
                MaintenanceAction::Repair,
                Some(&confirmation())
            ),
            LinuxExecutionState::Blocked(_)
        ));

        let config = compat(ProviderId::Epic);
        let application = LinuxApplication {
            bus_name: ":1.99".into(),
            process_name: config.process_name.clone(),
            pid: 99,
            compatibility_prefix_id: Some(config.prefix_id.clone()),
            root: steam_tree(),
        };
        assert!(application_matches(
            &application,
            &LinuxProviderMode::Compatibility(config.clone())
        ));
        let mut wrong_prefix = config;
        wrong_prefix.prefix_id = "another-prefix".into();
        assert!(!application_matches(
            &application,
            &LinuxProviderMode::Compatibility(wrong_prefix)
        ));
    }

    #[test]
    fn stable_identifiers_and_action_names_ignore_localized_labels() {
        assert!(matches!(
            LinuxAtspiBackend::new(source(steam_tree())).execute(
                ProviderId::Steam,
                None,
                "app-42",
                MaintenanceAction::Repair,
                Some(&confirmation())
            ),
            LinuxExecutionState::StartedAwaitingObservation { .. }
        ));
    }

    #[test]
    fn sensitive_controls_and_unknown_modals_handoff() {
        let mut sensitive = steam_tree();
        sensitive.children[0].snapshot.sensitive = true;
        assert_eq!(
            LinuxAtspiBackend::new(source(sensitive)).execute(
                ProviderId::Steam,
                None,
                "app-42",
                MaintenanceAction::Repair,
                Some(&confirmation())
            ),
            LinuxExecutionState::HandoffRequired(LinuxHandoffReason::SensitiveControl)
        );
        let mut modal = steam_tree();
        modal.snapshot.modal = true;
        assert_eq!(
            LinuxAtspiBackend::new(source(modal)).execute(
                ProviderId::Steam,
                None,
                "app-42",
                MaintenanceAction::Repair,
                Some(&confirmation())
            ),
            LinuxExecutionState::HandoffRequired(LinuxHandoffReason::BlockingState(
                BlockingState::UnknownModal
            ))
        );
        let mut consent = steam_tree();
        consent.snapshot.modal = true;
        consent.snapshot.name = "License agreement".into();
        assert_eq!(
            LinuxAtspiBackend::new(source(consent)).execute(
                ProviderId::Steam,
                None,
                "app-42",
                MaintenanceAction::Repair,
                Some(&confirmation())
            ),
            LinuxExecutionState::HandoffRequired(LinuxHandoffReason::BlockingState(
                BlockingState::Consent
            ))
        );
    }

    #[test]
    fn confirmation_and_action_interface_are_required() {
        assert!(matches!(
            LinuxAtspiBackend::new(source(steam_tree())).execute(
                ProviderId::Steam,
                None,
                "app-42",
                MaintenanceAction::Repair,
                None
            ),
            LinuxExecutionState::Blocked(_)
        ));
        let wrong_game_confirmation = LinuxBoundConfirmation {
            game_identity: "wrong-game".into(),
            ..confirmation()
        };
        assert!(matches!(
            LinuxAtspiBackend::new(source(steam_tree())).execute(
                ProviderId::Steam,
                None,
                "wrong-game",
                MaintenanceAction::Repair,
                Some(&wrong_game_confirmation)
            ),
            LinuxExecutionState::Blocked(_)
        ));
        let mut no_action = steam_tree();
        no_action.children[2].snapshot.action_names.clear();
        assert!(matches!(
            LinuxAtspiBackend::new(source(no_action)).execute(
                ProviderId::Steam,
                None,
                "app-42",
                MaintenanceAction::Repair,
                Some(&confirmation())
            ),
            LinuxExecutionState::Blocked(_)
        ));
    }

    #[test]
    fn valid_invocation_never_claims_completion() {
        assert_eq!(
            LinuxAtspiBackend::new(source(steam_tree())).execute(
                ProviderId::Steam,
                None,
                "app-42",
                MaintenanceAction::Repair,
                Some(&confirmation())
            ),
            LinuxExecutionState::StartedAwaitingObservation {
                proof: CompletionProof::ProviderProgressThenTerminalState
            }
        );
    }
}
