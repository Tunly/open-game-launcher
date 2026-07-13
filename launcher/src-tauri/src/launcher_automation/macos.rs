//! Fail-closed semantic macOS Accessibility automation.
//!
//! This module deliberately exposes no pointer, keyboard, authentication, consent, or
//! elevation primitive. Invocation is limited to AXPress/AXShowMenu on an exactly bound
//! provider process and game identity.
//!
//! Optional live permission adapter (not wired by this isolated slice):
//! `macos-axuielement = ["dep:axuielement"]` with target dependency
//! `axuielement = { version = "=0.9.1", optional = true }`.

use std::time::{SystemTime, UNIX_EPOCH};

use super::providers::{
    detect_blocking_state, provider_spec, rank_candidates, ActionRecipe, BlockingState,
    CompletionProof, ControlRole, ElementDescriptor, MaintenanceAction, ProviderId, RecipeStep,
    SelectionError, StructuralRelationship,
};

const MAX_NODES: usize = 2_048;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MacPermissionState {
    Granted,
    ApiDisabled,
    Denied,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AxAction {
    Press,
    ShowMenu,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MacProviderSpec {
    pub provider: ProviderId,
    pub bundle_ids: &'static [&'static str],
    pub process_names: &'static [&'static str],
}

pub const MAC_PROVIDER_SPECS: &[MacProviderSpec] = &[
    MacProviderSpec {
        provider: ProviderId::Steam,
        bundle_ids: &["com.valvesoftware.steam"],
        process_names: &["steam_osx"],
    },
    MacProviderSpec {
        provider: ProviderId::Epic,
        bundle_ids: &["com.epicgames.EpicGamesLauncher"],
        process_names: &["EpicGamesLauncher-Mac-Shipping"],
    },
    MacProviderSpec {
        provider: ProviderId::Gog,
        bundle_ids: &["com.gog.galaxy"],
        process_names: &["GOG Galaxy"],
    },
    MacProviderSpec {
        provider: ProviderId::Ea,
        bundle_ids: &["com.ea.app"],
        process_names: &["EADesktop"],
    },
    MacProviderSpec {
        provider: ProviderId::Battlenet,
        bundle_ids: &["net.battle.app", "net.battle.desktop"],
        process_names: &["Battle.net"],
    },
];

pub fn mac_provider_spec(provider: ProviderId) -> Option<&'static MacProviderSpec> {
    MAC_PROVIDER_SPECS
        .iter()
        .find(|spec| spec.provider == provider)
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AxSnapshot {
    /// AXIdentifier, never a localized label.
    pub identifier: String,
    /// Raw AX role such as `AXButton`.
    pub role: String,
    /// Raw AX subrole when supplied by the application.
    pub subrole: Option<String>,
    pub title: String,
    pub help: String,
    pub bundle_id: String,
    pub process_name: String,
    pub pid: u32,
    pub enabled: bool,
    pub visible: bool,
    pub secure: bool,
    pub modal: bool,
    pub actions: Vec<AxAction>,
    pub ancestor_roles: Vec<ControlRole>,
    pub identity_tokens: Vec<String>,
}

impl AxSnapshot {
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
            automation_id: self.identifier.clone(),
            role: map_ax_role(&self.role, self.subrole.as_deref()),
            name: self.title.clone(),
            provider: Some(provider),
            bound_game_identity: exact_game.then(|| expected_game.to_string()),
            relationship,
            enabled: self.enabled,
            visible: self.visible,
            password: self.secure,
        }
    }

    fn blocking_descriptor(&self, provider: ProviderId) -> ElementDescriptor {
        ElementDescriptor {
            automation_id: self.identifier.clone(),
            role: map_ax_role(&self.role, self.subrole.as_deref()),
            name: format!("{} {}", self.title, self.help),
            provider: Some(provider),
            bound_game_identity: None,
            relationship: if self.modal {
                StructuralRelationship::BlockingDialog
            } else {
                StructuralRelationship::ProviderWindow
            },
            enabled: self.enabled,
            visible: self.visible,
            password: self.secure,
        }
    }

    fn has_identity(&self, expected: &str) -> bool {
        self.identity_tokens.iter().any(|token| token == expected)
    }
}

pub fn map_ax_role(role: &str, subrole: Option<&str>) -> ControlRole {
    match (role, subrole) {
        ("AXWindow", Some("AXDialog")) | ("AXSheet", _) => ControlRole::Dialog,
        ("AXWindow", _) => ControlRole::Window,
        ("AXButton", _) => ControlRole::Button,
        ("AXMenuItem", _) => ControlRole::MenuItem,
        ("AXRow", _) => ControlRole::ListItem,
        ("AXGroup", _) | ("AXScrollArea", _) => ControlRole::Pane,
        ("AXTextField", _) | ("AXSecureTextField", _) => ControlRole::Text,
        _ => ControlRole::Custom,
    }
}

pub trait MacAxNode: Clone {
    type Error: ToString;

    fn snapshot(&self) -> Result<AxSnapshot, Self::Error>;
    fn children(&self) -> Result<Vec<Self>, Self::Error>;
    fn perform(&self, action: AxAction) -> Result<bool, Self::Error>;
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MacApplication<N> {
    pub bundle_id: String,
    pub process_name: String,
    pub pid: u32,
    pub root: N,
}

pub trait MacAccessibilitySource {
    type Node: MacAxNode;
    type Error: ToString;

    fn permission_state(&self) -> MacPermissionState;
    fn applications(&self) -> Result<Vec<MacApplication<Self::Node>>, Self::Error>;
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MacBoundConfirmation {
    pub provider: ProviderId,
    pub game_identity: String,
    pub action: MaintenanceAction,
    pub pid: u32,
    pub expires_at_unix_ms: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MacHandoffReason {
    AccessibilityPermissionMissing(MacPermissionState),
    BlockingState(BlockingState),
    UnknownModal,
    SensitiveControl,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MacExecutionState {
    StartedAwaitingObservation { proof: CompletionProof },
    HandoffRequired(MacHandoffReason),
    NotApplicable(String),
    Blocked(String),
    Failed(String),
}

pub struct MacAccessibilityBackend<S> {
    source: S,
}

impl<S: MacAccessibilitySource> MacAccessibilityBackend<S> {
    pub fn new(source: S) -> Self {
        Self { source }
    }

    pub fn execute(
        &self,
        provider: ProviderId,
        game_identity: &str,
        action: MaintenanceAction,
        confirmation: Option<&MacBoundConfirmation>,
    ) -> MacExecutionState {
        let permission = self.source.permission_state();
        if permission != MacPermissionState::Granted {
            return MacExecutionState::HandoffRequired(
                MacHandoffReason::AccessibilityPermissionMissing(permission),
            );
        }

        let Some(spec) = mac_provider_spec(provider) else {
            return MacExecutionState::NotApplicable(format!(
                "{} is not available as a native macOS provider",
                provider.key()
            ));
        };
        let applications = match self.source.applications() {
            Ok(applications) => applications,
            Err(error) => return MacExecutionState::Failed(error.to_string()),
        };
        let matches: Vec<_> = applications
            .into_iter()
            .filter(|application| {
                spec.bundle_ids.contains(&application.bundle_id.as_str())
                    && spec
                        .process_names
                        .contains(&application.process_name.as_str())
            })
            .collect();
        let [application] = matches.as_slice() else {
            return MacExecutionState::Blocked(if matches.is_empty() {
                "no exact provider application identity matched".into()
            } else {
                "provider application identity was ambiguous".into()
            });
        };

        let recipe = provider_spec(provider).recipe(action);
        if action.destructive()
            && !valid_confirmation(
                confirmation,
                provider,
                game_identity,
                action,
                application.pid,
            )
        {
            return MacExecutionState::Blocked(
                "a current confirmation bound to provider, game, action, and process is required"
                    .into(),
            );
        }

        let nodes = match flatten(&application.root) {
            Ok(nodes) => nodes,
            Err(error) => return MacExecutionState::Failed(error),
        };
        let snapshots = match snapshots(&nodes) {
            Ok(snapshots) => snapshots,
            Err(error) => return MacExecutionState::Failed(error),
        };
        let blocking = snapshots
            .iter()
            .map(|snapshot| snapshot.blocking_descriptor(provider))
            .collect::<Vec<_>>();
        if snapshots.iter().any(|snapshot| snapshot.secure) {
            return MacExecutionState::HandoffRequired(MacHandoffReason::SensitiveControl);
        }
        if let Some(state) = detect_blocking_state(&blocking) {
            return MacExecutionState::HandoffRequired(MacHandoffReason::BlockingState(state));
        }
        if nodes.iter().any(|node| {
            node.snapshot()
                .map(|snapshot| snapshot.modal)
                .unwrap_or(true)
        }) {
            return MacExecutionState::HandoffRequired(MacHandoffReason::UnknownModal);
        }

        match run_recipe(&nodes, &recipe, provider, game_identity) {
            Ok(()) => match completion_proof(&recipe) {
                Some(proof) => MacExecutionState::StartedAwaitingObservation { proof },
                None => MacExecutionState::Blocked(
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

fn valid_confirmation(
    confirmation: Option<&MacBoundConfirmation>,
    provider: ProviderId,
    game_identity: &str,
    action: MaintenanceAction,
    pid: u32,
) -> bool {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(u64::MAX, |duration| duration.as_millis() as u64);
    confirmation.is_some_and(|bound| {
        bound.provider == provider
            && bound.game_identity == game_identity
            && bound.action == action
            && bound.pid == pid
            && bound.expires_at_unix_ms >= now
    })
}

fn flatten<N: MacAxNode>(root: &N) -> Result<Vec<N>, String> {
    let mut pending = vec![root.clone()];
    let mut nodes = Vec::new();
    while let Some(node) = pending.pop() {
        if nodes.len() >= MAX_NODES {
            return Err("AX tree exceeded the fail-closed node limit".into());
        }
        pending.extend(node.children().map_err(|error| error.to_string())?);
        nodes.push(node);
    }
    Ok(nodes)
}

fn snapshots<N: MacAxNode>(nodes: &[N]) -> Result<Vec<AxSnapshot>, String> {
    nodes
        .iter()
        .map(|node| node.snapshot().map_err(|error| error.to_string()))
        .collect()
}

fn run_recipe<N: MacAxNode>(
    nodes: &[N],
    recipe: &ActionRecipe,
    provider: ProviderId,
    game_identity: &str,
) -> Result<(), MacExecutionState> {
    for step in &recipe.steps {
        let (selector, relationship, action) = match step {
            RecipeStep::SelectExactGame(selector) => (
                selector,
                StructuralRelationship::DescendantOfExactGame,
                AxAction::Press,
            ),
            RecipeStep::OpenMaintenanceMenu(selector) => (
                selector,
                StructuralRelationship::DescendantOfExactGame,
                AxAction::ShowMenu,
            ),
            RecipeStep::InvokeAction { selector, .. } => (
                selector,
                StructuralRelationship::MaintenanceMenuOfExactGame,
                AxAction::Press,
            ),
            RecipeStep::Observe(_) => continue,
        };
        let snapshots = snapshots(nodes).map_err(MacExecutionState::Failed)?;
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
                    SelectionError::NoSafeMatch => MacExecutionState::Blocked(
                        "required semantic AX target was not found".into(),
                    ),
                    SelectionError::Ambiguous { .. } => {
                        MacExecutionState::Blocked("semantic AX target was ambiguous".into())
                    }
                }
            })?;
        let snapshot = &snapshots[candidate.index];
        if snapshot.secure {
            return Err(MacExecutionState::HandoffRequired(
                MacHandoffReason::SensitiveControl,
            ));
        }
        if !snapshot.actions.contains(&action) {
            return Err(MacExecutionState::Blocked(format!(
                "target does not expose the required {action:?} action"
            )));
        }
        nodes[candidate.index]
            .perform(action)
            .map_err(|error| MacExecutionState::Failed(error.to_string()))?
            .then_some(())
            .ok_or_else(|| MacExecutionState::Blocked("AX action was rejected".into()))?;
    }
    Ok(())
}

/// Optional native bridge. It intentionally checks trust without requesting or prompting for it.
#[cfg(all(target_os = "macos", feature = "macos-axuielement"))]
pub mod native {
    use std::{collections::BTreeMap, sync::Arc};

    use axuielement::{
        ax_action::{AX_PRESS_ACTION, AX_SHOW_MENU_ACTION},
        ax_attribute::attributes::{
            AX_CHILDREN_ATTRIBUTE, AX_ENABLED_ATTRIBUTE, AX_HELP_ATTRIBUTE, AX_HIDDEN_ATTRIBUTE,
            AX_IDENTIFIER_ATTRIBUTE, AX_MODAL_ATTRIBUTE, AX_ROLE_ATTRIBUTE, AX_SUBROLE_ATTRIBUTE,
            AX_TITLE_ATTRIBUTE,
        },
        AXError, AXUIElement,
    };

    use super::{map_ax_role, AxAction, AxSnapshot, ControlRole, MacAxNode, MacPermissionState};

    #[derive(Clone, Debug)]
    pub struct NativeAxContext {
        pub bundle_id: String,
        pub process_name: String,
        pub pid: u32,
        /// Exact identities supplied by the caller after provider-owned metadata validation.
        pub identity_by_identifier: Arc<BTreeMap<String, Vec<String>>>,
    }

    #[derive(Clone)]
    pub struct NativeAxNode {
        element: AXUIElement,
        context: NativeAxContext,
        ancestor_roles: Vec<ControlRole>,
    }

    impl NativeAxNode {
        pub fn application(context: NativeAxContext) -> Option<Self> {
            let element = AXUIElement::from_pid(context.pid.try_into().ok()?)?;
            Some(Self {
                element,
                context,
                ancestor_roles: Vec::new(),
            })
        }

        fn string_attribute(&self, name: &str) -> Result<String, AXError> {
            Ok(self.element.string_attribute(name)?.unwrap_or_default())
        }
    }

    impl MacAxNode for NativeAxNode {
        type Error = AXError;

        fn snapshot(&self) -> Result<AxSnapshot, Self::Error> {
            let identifier = self.string_attribute(AX_IDENTIFIER_ATTRIBUTE)?;
            let role = self.string_attribute(AX_ROLE_ATTRIBUTE)?;
            let subrole = self.element.string_attribute(AX_SUBROLE_ATTRIBUTE)?;
            let actions = self
                .element
                .action_names()?
                .into_iter()
                .filter_map(|name| match name.as_str() {
                    AX_PRESS_ACTION => Some(AxAction::Press),
                    AX_SHOW_MENU_ACTION => Some(AxAction::ShowMenu),
                    _ => None,
                })
                .collect();
            Ok(AxSnapshot {
                identity_tokens: self
                    .context
                    .identity_by_identifier
                    .get(&identifier)
                    .cloned()
                    .unwrap_or_default(),
                identifier,
                secure: subrole.as_deref() == Some("AXSecureTextField"),
                role,
                subrole,
                title: self.string_attribute(AX_TITLE_ATTRIBUTE)?,
                help: self.string_attribute(AX_HELP_ATTRIBUTE)?,
                bundle_id: self.context.bundle_id.clone(),
                process_name: self.context.process_name.clone(),
                pid: self.context.pid,
                enabled: self
                    .element
                    .bool_attribute(AX_ENABLED_ATTRIBUTE)?
                    .unwrap_or(false),
                visible: !self
                    .element
                    .bool_attribute(AX_HIDDEN_ATTRIBUTE)?
                    .unwrap_or(true),
                modal: self
                    .element
                    .bool_attribute(AX_MODAL_ATTRIBUTE)?
                    .unwrap_or(false),
                actions,
                ancestor_roles: self.ancestor_roles.clone(),
            })
        }

        fn children(&self) -> Result<Vec<Self>, Self::Error> {
            let role = map_ax_role(
                &self.string_attribute(AX_ROLE_ATTRIBUTE)?,
                self.element
                    .string_attribute(AX_SUBROLE_ATTRIBUTE)?
                    .as_deref(),
            );
            let mut ancestor_roles = self.ancestor_roles.clone();
            ancestor_roles.push(role);
            Ok(self
                .element
                .element_array_attribute(AX_CHILDREN_ATTRIBUTE)?
                .into_iter()
                .map(|element| Self {
                    element,
                    context: self.context.clone(),
                    ancestor_roles: ancestor_roles.clone(),
                })
                .collect())
        }

        fn perform(&self, action: AxAction) -> Result<bool, Self::Error> {
            let action_name = match action {
                AxAction::Press => AX_PRESS_ACTION,
                AxAction::ShowMenu => AX_SHOW_MENU_ACTION,
            };
            if !self
                .element
                .action_names()?
                .iter()
                .any(|available| available == action_name)
            {
                return Ok(false);
            }
            self.element.perform_action(action_name)?;
            Ok(true)
        }
    }

    pub fn permission_state() -> MacPermissionState {
        if !axuielement::api_enabled() {
            MacPermissionState::ApiDisabled
        } else if !axuielement::is_process_trusted() {
            MacPermissionState::Denied
        } else {
            MacPermissionState::Granted
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{cell::RefCell, rc::Rc};

    use super::*;

    #[derive(Clone)]
    struct Node {
        snapshot: AxSnapshot,
        children: Vec<Node>,
        calls: Rc<RefCell<Vec<AxAction>>>,
    }

    impl MacAxNode for Node {
        type Error = String;

        fn snapshot(&self) -> Result<AxSnapshot, Self::Error> {
            Ok(self.snapshot.clone())
        }

        fn children(&self) -> Result<Vec<Self>, Self::Error> {
            Ok(self.children.clone())
        }

        fn perform(&self, action: AxAction) -> Result<bool, Self::Error> {
            self.calls.borrow_mut().push(action);
            Ok(true)
        }
    }

    struct Source {
        permission: MacPermissionState,
        applications: Vec<MacApplication<Node>>,
    }

    impl MacAccessibilitySource for Source {
        type Node = Node;
        type Error = String;

        fn permission_state(&self) -> MacPermissionState {
            self.permission
        }

        fn applications(&self) -> Result<Vec<MacApplication<Self::Node>>, Self::Error> {
            Ok(self.applications.clone())
        }
    }

    fn node(id: &str, role: &str, actions: Vec<AxAction>) -> Node {
        Node {
            snapshot: AxSnapshot {
                identifier: id.into(),
                role: role.into(),
                subrole: None,
                title: "lokalisierter Text".into(),
                help: String::new(),
                bundle_id: "com.valvesoftware.steam".into(),
                process_name: "steam_osx".into(),
                pid: 7,
                enabled: true,
                visible: true,
                secure: false,
                modal: false,
                actions,
                ancestor_roles: vec![ControlRole::Pane],
                identity_tokens: Vec::new(),
            },
            children: Vec::new(),
            calls: Rc::new(RefCell::new(Vec::new())),
        }
    }

    fn steam_tree() -> Node {
        let mut game = node("library_game_list_item", "AXRow", vec![AxAction::Press]);
        game.snapshot.identity_tokens.push("app-42".into());
        let mut manage = node("game_manage_button", "AXButton", vec![AxAction::ShowMenu]);
        manage.snapshot.ancestor_roles = vec![ControlRole::ListItem];
        manage.snapshot.identity_tokens.push("app-42".into());
        let mut verify = node("repair", "AXMenuItem", vec![AxAction::Press]);
        verify.snapshot.ancestor_roles = vec![ControlRole::Menu];
        verify.snapshot.identity_tokens.push("app-42".into());
        let mut root = node("root", "AXWindow", Vec::new());
        root.children = vec![game, manage, verify];
        root
    }

    fn source(root: Node) -> Source {
        Source {
            permission: MacPermissionState::Granted,
            applications: vec![MacApplication {
                bundle_id: "com.valvesoftware.steam".into(),
                process_name: "steam_osx".into(),
                pid: 7,
                root,
            }],
        }
    }

    fn confirmation() -> MacBoundConfirmation {
        MacBoundConfirmation {
            provider: ProviderId::Steam,
            game_identity: "app-42".into(),
            action: MaintenanceAction::Repair,
            pid: 7,
            expires_at_unix_ms: u64::MAX,
        }
    }

    #[test]
    fn only_real_native_macos_providers_are_exposed() {
        assert!(mac_provider_spec(ProviderId::Steam).is_some());
        assert!(mac_provider_spec(ProviderId::Ubisoft).is_none());
        assert!(mac_provider_spec(ProviderId::Xbox).is_none());
    }

    #[test]
    fn missing_permission_hands_off_without_tree_access() {
        let backend = MacAccessibilityBackend::new(Source {
            permission: MacPermissionState::Denied,
            applications: Vec::new(),
        });
        assert_eq!(
            backend.execute(ProviderId::Steam, "app-42", MaintenanceAction::Repair, None),
            MacExecutionState::HandoffRequired(MacHandoffReason::AccessibilityPermissionMissing(
                MacPermissionState::Denied
            ))
        );
    }

    #[test]
    fn exact_application_identity_is_required_and_ambiguity_blocks() {
        let root = steam_tree();
        let mut wrong = source(root.clone());
        wrong.applications[0].process_name = "steam_osx helper".into();
        assert!(matches!(
            MacAccessibilityBackend::new(wrong).execute(
                ProviderId::Steam,
                "app-42",
                MaintenanceAction::Repair,
                Some(&confirmation())
            ),
            MacExecutionState::Blocked(_)
        ));
        let mut ambiguous = source(root.clone());
        ambiguous
            .applications
            .push(ambiguous.applications[0].clone());
        assert!(matches!(
            MacAccessibilityBackend::new(ambiguous).execute(
                ProviderId::Steam,
                "app-42",
                MaintenanceAction::Repair,
                Some(&confirmation())
            ),
            MacExecutionState::Blocked(_)
        ));
        let mut ambiguous_control = steam_tree();
        ambiguous_control
            .children
            .push(ambiguous_control.children[0].clone());
        assert!(matches!(
            MacAccessibilityBackend::new(source(ambiguous_control)).execute(
                ProviderId::Steam,
                "app-42",
                MaintenanceAction::Repair,
                Some(&confirmation())
            ),
            MacExecutionState::Blocked(_)
        ));
    }

    #[test]
    fn machine_identifiers_work_with_unrelated_localized_titles() {
        let state = MacAccessibilityBackend::new(source(steam_tree())).execute(
            ProviderId::Steam,
            "app-42",
            MaintenanceAction::Repair,
            Some(&confirmation()),
        );
        assert!(matches!(
            state,
            MacExecutionState::StartedAwaitingObservation { .. }
        ));
    }

    #[test]
    fn sensitive_control_and_unknown_modal_handoff() {
        let mut sensitive = steam_tree();
        sensitive.children[0].snapshot.secure = true;
        assert_eq!(
            MacAccessibilityBackend::new(source(sensitive)).execute(
                ProviderId::Steam,
                "app-42",
                MaintenanceAction::Repair,
                Some(&confirmation())
            ),
            MacExecutionState::HandoffRequired(MacHandoffReason::SensitiveControl)
        );
        let mut modal = steam_tree();
        modal.snapshot.modal = true;
        assert_eq!(
            MacAccessibilityBackend::new(source(modal)).execute(
                ProviderId::Steam,
                "app-42",
                MaintenanceAction::Repair,
                Some(&confirmation())
            ),
            MacExecutionState::HandoffRequired(MacHandoffReason::BlockingState(
                BlockingState::UnknownModal
            ))
        );
        let mut consent = steam_tree();
        consent.snapshot.modal = true;
        consent.snapshot.title = "License agreement".into();
        assert_eq!(
            MacAccessibilityBackend::new(source(consent)).execute(
                ProviderId::Steam,
                "app-42",
                MaintenanceAction::Repair,
                Some(&confirmation())
            ),
            MacExecutionState::HandoffRequired(MacHandoffReason::BlockingState(
                BlockingState::Consent
            ))
        );
    }

    #[test]
    fn confirmation_is_bound_and_completion_is_only_awaiting_observation() {
        assert!(matches!(
            MacAccessibilityBackend::new(source(steam_tree())).execute(
                ProviderId::Steam,
                "app-42",
                MaintenanceAction::Repair,
                None
            ),
            MacExecutionState::Blocked(_)
        ));
        let mut wrong = confirmation();
        wrong.pid = 8;
        assert!(matches!(
            MacAccessibilityBackend::new(source(steam_tree())).execute(
                ProviderId::Steam,
                "app-42",
                MaintenanceAction::Repair,
                Some(&wrong)
            ),
            MacExecutionState::Blocked(_)
        ));
        assert!(matches!(
            MacAccessibilityBackend::new(source(steam_tree())).execute(
                ProviderId::Steam,
                "app-42",
                MaintenanceAction::Repair,
                Some(&confirmation())
            ),
            MacExecutionState::StartedAwaitingObservation { .. }
        ));
    }

    #[test]
    fn game_identity_and_required_ax_action_are_fail_closed() {
        assert!(matches!(
            MacAccessibilityBackend::new(source(steam_tree())).execute(
                ProviderId::Steam,
                "wrong-game",
                MaintenanceAction::Repair,
                Some(&MacBoundConfirmation {
                    game_identity: "wrong-game".into(),
                    ..confirmation()
                })
            ),
            MacExecutionState::Blocked(_)
        ));
        let mut no_menu = steam_tree();
        no_menu.children[1].snapshot.actions.clear();
        assert!(matches!(
            MacAccessibilityBackend::new(source(no_menu)).execute(
                ProviderId::Steam,
                "app-42",
                MaintenanceAction::Repair,
                Some(&confirmation())
            ),
            MacExecutionState::Blocked(_)
        ));
    }
}
