//! Fail-closed Windows semantic automation backend.
//!
//! The pure backend and its mock tests compile without platform dependencies.
//! To enable the live adapter, add this optional dependency and feature before
//! wiring the module into the crate:
//!
//! ```toml
//! [features]
//! windows-uiautomation = ["dep:uiautomation"]
//!
//! [target.'cfg(windows)'.dependencies]
//! uiautomation = { version = "=0.25.0", optional = true, default-features = false, features = ["control", "input"] }
//! ```
//!
//! The live adapter uses only UI Automation properties, tree relationships,
//! `InvokePattern`, and `SelectionItemPattern`. It deliberately exposes no
//! coordinate click, keyboard input, password entry, CAPTCHA handling, consent
//! acceptance, or elevation API.

use std::fmt::{Display, Formatter};

use super::providers::{
    detect_blocking_state, provider_spec, rank_candidates, ActionRecipe, BlockingState,
    CompletionProof, ControlRole, ElementDescriptor, MaintenanceAction, ProviderId, RecipeStep,
    SelectionError, StructuralRelationship,
};

const MAX_TREE_DEPTH: usize = 10;
const MAX_TREE_NODES: usize = 10_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ElementSnapshot {
    pub automation_id: String,
    pub role: ControlRole,
    pub name: String,
    pub class_name: String,
    pub framework_id: String,
    pub process_id: u32,
    pub process_name: String,
    pub enabled: bool,
    pub visible: bool,
    pub password: bool,
    pub dialog: bool,
    pub item_status: String,
    pub help_text: String,
    pub ancestor_roles: Vec<ControlRole>,
    pub ancestor_identity_tokens: Vec<String>,
}

impl ElementSnapshot {
    fn identity_matches(&self, expected: &str) -> bool {
        [
            &self.automation_id,
            &self.name,
            &self.item_status,
            &self.help_text,
        ]
        .into_iter()
        .chain(self.ancestor_identity_tokens.iter())
        .any(|value| exact_identity_token_match(value, expected))
    }

    fn relationship(&self, exact_game_bound: bool) -> StructuralRelationship {
        if self.dialog && matches!(self.role, ControlRole::Dialog | ControlRole::Window) {
            return StructuralRelationship::BlockingDialog;
        }
        if exact_game_bound && self.role == ControlRole::ProgressBar {
            return StructuralRelationship::ProgressForExactGame;
        }
        if exact_game_bound
            && self
                .ancestor_roles
                .iter()
                .any(|role| matches!(role, ControlRole::Menu))
        {
            return StructuralRelationship::MaintenanceMenuOfExactGame;
        }
        if exact_game_bound {
            return StructuralRelationship::DescendantOfExactGame;
        }
        StructuralRelationship::ProviderWindow
    }

    fn descriptor(&self, provider: ProviderId, expected_game: &str) -> ElementDescriptor {
        let exact_game_bound = self.identity_matches(expected_game);
        ElementDescriptor {
            automation_id: self.automation_id.clone(),
            role: self.role,
            name: self.name.clone(),
            provider: Some(provider),
            bound_game_identity: exact_game_bound.then(|| expected_game.to_string()),
            relationship: self.relationship(exact_game_bound),
            enabled: self.enabled,
            visible: self.visible,
            password: self.password,
        }
    }

    fn blocking_descriptor(&self, provider: ProviderId) -> ElementDescriptor {
        ElementDescriptor {
            automation_id: self.automation_id.clone(),
            role: self.role,
            name: self.name.clone(),
            provider: Some(provider),
            bound_game_identity: None,
            relationship: if self.dialog {
                StructuralRelationship::BlockingDialog
            } else {
                StructuralRelationship::ProviderWindow
            },
            enabled: self.enabled,
            visible: self.visible,
            password: self.password,
        }
    }
}

pub trait SemanticNode: Clone {
    fn snapshot(&self) -> Result<ElementSnapshot, BackendError>;
    fn children(&self) -> Result<Vec<Self>, BackendError>;
    fn invoke_pattern(&self) -> Result<(), BackendError>;
    fn selection_item_pattern(&self) -> Result<(), BackendError>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BackendError {
    DependencyUnavailable,
    Inspection(String),
    TreeLimitExceeded,
    ProviderWindowNotFound,
    AmbiguousProviderWindow,
    NoSafeSelectorMatch,
    AmbiguousSelectorMatch,
    PatternUnavailable(&'static str),
}

impl Display for BackendError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DependencyUnavailable => formatter.write_str(
                "Windows UI Automation is not enabled; no provider action was attempted.",
            ),
            Self::Inspection(message) => {
                write!(formatter, "UI Automation inspection failed: {message}")
            }
            Self::TreeLimitExceeded => {
                formatter.write_str("UI Automation tree exceeded the bounded inspection limit.")
            }
            Self::ProviderWindowNotFound => {
                formatter.write_str("No exact provider process/window match was found.")
            }
            Self::AmbiguousProviderWindow => formatter
                .write_str("Multiple provider windows matched with equal identity evidence."),
            Self::NoSafeSelectorMatch => formatter.write_str(
                "No semantic control matched the exact provider, game, role, and structure.",
            ),
            Self::AmbiguousSelectorMatch => {
                formatter.write_str("Multiple semantic controls tied; automation was stopped.")
            }
            Self::PatternUnavailable(pattern) => {
                write!(
                    formatter,
                    "Required {pattern} is unavailable; no fallback click was used."
                )
            }
        }
    }
}

impl std::error::Error for BackendError {}

impl From<SelectionError> for BackendError {
    fn from(value: SelectionError) -> Self {
        match value {
            SelectionError::NoSafeMatch => Self::NoSafeSelectorMatch,
            SelectionError::Ambiguous { .. } => Self::AmbiguousSelectorMatch,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClientFingerprint {
    pub provider: ProviderId,
    pub process_name: String,
    pub process_id: u32,
    pub executable_version: String,
    pub window_class: String,
    pub framework_id: String,
    pub structure_version: String,
    pub semantic_tree_hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BoundConfirmation<'a> {
    pub provider: ProviderId,
    pub game_identity: &'a str,
    pub action: MaintenanceAction,
    pub expires_at_unix: u64,
}

impl BoundConfirmation<'_> {
    fn valid_for(
        &self,
        provider: ProviderId,
        game_identity: &str,
        action: MaintenanceAction,
        now_unix: u64,
    ) -> bool {
        self.provider == provider
            && self.game_identity == game_identity
            && self.action == action
            && now_unix <= self.expires_at_unix
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExecutionState {
    StartedAwaitingObservation { proof: CompletionProof },
    HandoffRequired { state: BlockingState },
    Blocked { reason: String },
    Failed { reason: String },
}

#[derive(Debug, Default, Clone, Copy)]
pub struct WindowsSemanticBackend;

impl WindowsSemanticBackend {
    pub fn find_provider_window<N: SemanticNode>(
        &self,
        roots: &[N],
        provider: ProviderId,
        expected_process_id: Option<u32>,
    ) -> Result<N, BackendError> {
        let spec = provider_spec(provider);
        let mut matches = Vec::new();
        for root in roots {
            let snapshot = root.snapshot()?;
            if snapshot.role != ControlRole::Window
                || !spec.process_matches(&snapshot.process_name)
                || expected_process_id.is_some_and(|pid| snapshot.process_id != pid)
            {
                continue;
            }
            let automation_id_match = spec
                .window_automation_ids
                .iter()
                .any(|id| id.eq_ignore_ascii_case(snapshot.automation_id.trim()));
            if automation_id_match || spec.window_class_matches(&snapshot.class_name) {
                matches.push(root.clone());
            }
        }
        match matches.len() {
            0 => Err(BackendError::ProviderWindowNotFound),
            1 => Ok(matches.remove(0)),
            _ => Err(BackendError::AmbiguousProviderWindow),
        }
    }

    pub fn fingerprint<N: SemanticNode>(
        &self,
        provider_window: &N,
        provider: ProviderId,
        executable_version: &str,
    ) -> Result<ClientFingerprint, BackendError> {
        let spec = provider_spec(provider);
        let root = provider_window.snapshot()?;
        if root.role != ControlRole::Window || !spec.process_matches(&root.process_name) {
            return Err(BackendError::ProviderWindowNotFound);
        }
        let nodes = flatten_tree(provider_window)?;
        let semantic_tree_hash = semantic_tree_hash(&nodes)?;
        Ok(ClientFingerprint {
            provider,
            process_name: root.process_name,
            process_id: root.process_id,
            executable_version: executable_version.trim().to_string(),
            window_class: root.class_name,
            framework_id: root.framework_id,
            structure_version: spec.structure_version.to_string(),
            semantic_tree_hash,
        })
    }

    pub fn execute<N: SemanticNode>(
        &self,
        provider_window: &N,
        recipe: &ActionRecipe,
        exact_game_identity: &str,
        confirmation: Option<&BoundConfirmation<'_>>,
        now_unix: u64,
    ) -> ExecutionState {
        if exact_game_identity.trim().is_empty() {
            return ExecutionState::Blocked {
                reason: "Exact provider game identity is required before automation.".to_string(),
            };
        }

        for step in &recipe.steps {
            let nodes = match flatten_tree(provider_window) {
                Ok(nodes) => nodes,
                Err(error) => {
                    return ExecutionState::Failed {
                        reason: error.to_string(),
                    }
                }
            };
            match blocking_state(&nodes, recipe.provider) {
                Ok(Some(state)) => return ExecutionState::HandoffRequired { state },
                Ok(None) => {}
                Err(error) => {
                    return ExecutionState::Blocked {
                        reason: error.to_string(),
                    }
                }
            }

            match step {
                RecipeStep::SelectExactGame(selector) => {
                    let node =
                        match select_node(&nodes, selector, recipe.provider, exact_game_identity) {
                            Ok(node) => node,
                            Err(error) => return blocked_from_error(error),
                        };
                    if let Err(error) = node.selection_item_pattern() {
                        return ExecutionState::Blocked {
                            reason: error.to_string(),
                        };
                    }
                }
                RecipeStep::OpenMaintenanceMenu(selector) => {
                    let node =
                        match select_node(&nodes, selector, recipe.provider, exact_game_identity) {
                            Ok(node) => node,
                            Err(error) => return blocked_from_error(error),
                        };
                    if let Err(error) = node.invoke_pattern() {
                        return ExecutionState::Blocked {
                            reason: error.to_string(),
                        };
                    }
                }
                RecipeStep::InvokeAction {
                    selector,
                    requires_bound_confirmation,
                } => {
                    if *requires_bound_confirmation
                        && !confirmation.is_some_and(|confirmation| {
                            confirmation.valid_for(
                                recipe.provider,
                                exact_game_identity,
                                recipe.action,
                                now_unix,
                            )
                        })
                    {
                        return ExecutionState::Blocked {
                            reason: "A valid short-lived confirmation bound to this provider, game, and action is required."
                                .to_string(),
                        };
                    }
                    let node =
                        match select_node(&nodes, selector, recipe.provider, exact_game_identity) {
                            Ok(node) => node,
                            Err(error) => return blocked_from_error(error),
                        };
                    if let Err(error) = node.invoke_pattern() {
                        return ExecutionState::Blocked {
                            reason: error.to_string(),
                        };
                    }
                }
                RecipeStep::Observe(proof) => {
                    // Invoking a provider control is never completion. A separate monitor
                    // must observe this proof before the session may become completed.
                    return ExecutionState::StartedAwaitingObservation { proof: *proof };
                }
            }
        }

        ExecutionState::Blocked {
            reason: "Recipe did not declare an observable completion proof.".to_string(),
        }
    }
}

fn blocked_from_error(error: BackendError) -> ExecutionState {
    ExecutionState::Blocked {
        reason: error.to_string(),
    }
}

fn flatten_tree<N: SemanticNode>(root: &N) -> Result<Vec<N>, BackendError> {
    let mut flattened = Vec::new();
    let mut pending = vec![(root.clone(), 0_usize)];
    while let Some((node, depth)) = pending.pop() {
        if flattened.len() >= MAX_TREE_NODES {
            return Err(BackendError::TreeLimitExceeded);
        }
        flattened.push(node.clone());
        if depth >= MAX_TREE_DEPTH {
            continue;
        }
        let mut children = node.children()?;
        children.reverse();
        pending.extend(children.into_iter().map(|child| (child, depth + 1)));
    }
    Ok(flattened)
}

fn select_node<'a, N: SemanticNode>(
    nodes: &'a [N],
    selector: &super::providers::SemanticSelector,
    provider: ProviderId,
    exact_game_identity: &str,
) -> Result<&'a N, BackendError> {
    let descriptors = nodes
        .iter()
        .map(SemanticNode::snapshot)
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .map(|snapshot| snapshot.descriptor(provider, exact_game_identity))
        .collect::<Vec<_>>();
    let ranked = rank_candidates(selector, &descriptors, provider, exact_game_identity)?;
    nodes.get(ranked.index).ok_or_else(|| {
        BackendError::Inspection("ranked candidate index left the inspected tree".to_string())
    })
}

fn blocking_state<N: SemanticNode>(
    nodes: &[N],
    provider: ProviderId,
) -> Result<Option<BlockingState>, BackendError> {
    let descriptors = nodes
        .iter()
        .map(SemanticNode::snapshot)
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .map(|snapshot| snapshot.blocking_descriptor(provider))
        .collect::<Vec<_>>();
    Ok(detect_blocking_state(&descriptors))
}

fn exact_identity_token_match(candidate: &str, expected: &str) -> bool {
    let expected = expected.trim();
    if expected.is_empty() {
        return false;
    }
    if candidate.trim().eq_ignore_ascii_case(expected) {
        return true;
    }
    candidate
        .split(|character: char| !character.is_alphanumeric())
        .filter(|part| !part.is_empty())
        .any(|part| part.eq_ignore_ascii_case(expected))
}

fn semantic_tree_hash<N: SemanticNode>(nodes: &[N]) -> Result<String, BackendError> {
    // FNV-1a over non-sensitive structure only. Accessible names, window titles,
    // account identifiers, and OCR text are deliberately excluded.
    let mut hash = 0xcbf29ce484222325_u64;
    let mut parts = nodes
        .iter()
        .map(SemanticNode::snapshot)
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .map(|snapshot| {
            format!(
                "{}|{:?}|{}|{}",
                snapshot.automation_id, snapshot.role, snapshot.class_name, snapshot.framework_id
            )
        })
        .collect::<Vec<_>>();
    parts.sort();
    for byte in parts.join("\n").bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    Ok(format!("{hash:016x}"))
}

/// Live `uiautomation` 0.25 adapter. The Windows desktop build enables this
/// feature by default; unsupported targets and explicit no-default-feature
/// builds continue to fail closed.
#[cfg(all(windows, feature = "windows-uiautomation"))]
pub mod uiautomation_025 {
    use std::rc::Rc;

    use uiautomation::patterns::{UIInvokePattern, UISelectionItemPattern};
    use uiautomation::types::ControlType;
    use uiautomation::{UIAutomation, UIElement};

    use super::{BackendError, ControlRole, ElementSnapshot, ProviderId, SemanticNode};

    #[derive(Clone)]
    pub struct UiaNode {
        automation: Rc<UIAutomation>,
        element: UIElement,
        provider: ProviderId,
        process_name: String,
        ancestor_roles: Vec<ControlRole>,
        ancestor_identity_tokens: Vec<String>,
    }

    pub struct LiveWindowsUiaBackend {
        automation: Rc<UIAutomation>,
    }

    impl LiveWindowsUiaBackend {
        pub fn new() -> Result<Self, BackendError> {
            UIAutomation::new()
                .map(|automation| Self {
                    automation: Rc::new(automation),
                })
                .map_err(|error| BackendError::Inspection(error.to_string()))
        }

        pub fn top_level_windows<F>(
            &self,
            provider: ProviderId,
            mut process_name_for_pid: F,
        ) -> Result<Vec<UiaNode>, BackendError>
        where
            F: FnMut(u32) -> Option<String>,
        {
            let root = self
                .automation
                .get_root_element()
                .map_err(|error| BackendError::Inspection(error.to_string()))?;
            let walker = self
                .automation
                .get_control_view_walker()
                .map_err(|error| BackendError::Inspection(error.to_string()))?;
            let mut windows = Vec::new();
            let Ok(mut child) = walker.get_first_child(&root) else {
                return Ok(windows);
            };
            loop {
                if child.get_control_type().ok() == Some(ControlType::Window) {
                    let pid = child.get_process_id().unwrap_or_default();
                    if let Some(process_name) = process_name_for_pid(pid) {
                        windows.push(UiaNode {
                            automation: Rc::clone(&self.automation),
                            element: child.clone(),
                            provider,
                            process_name,
                            ancestor_roles: Vec::new(),
                            ancestor_identity_tokens: Vec::new(),
                        });
                    }
                }
                match walker.get_next_sibling(&child) {
                    Ok(next) => child = next,
                    Err(_) => break,
                }
            }
            Ok(windows)
        }
    }

    impl SemanticNode for UiaNode {
        fn snapshot(&self) -> Result<ElementSnapshot, BackendError> {
            let is_dialog = self.element.is_dialog().unwrap_or(false);
            Ok(ElementSnapshot {
                automation_id: self.element.get_automation_id().unwrap_or_default(),
                role: map_control_role(
                    self.element
                        .get_control_type()
                        .map_err(|error| BackendError::Inspection(error.to_string()))?,
                    is_dialog,
                ),
                name: self.element.get_name().unwrap_or_default(),
                class_name: self.element.get_classname().unwrap_or_default(),
                framework_id: self.element.get_framework_id().unwrap_or_default(),
                process_id: self.element.get_process_id().unwrap_or_default(),
                process_name: self.process_name.clone(),
                enabled: self.element.is_enabled().unwrap_or(false),
                visible: !self.element.is_offscreen().unwrap_or(true),
                password: self.element.is_password().unwrap_or(true),
                dialog: is_dialog,
                item_status: self.element.get_item_status().unwrap_or_default(),
                help_text: self.element.get_help_text().unwrap_or_default(),
                ancestor_roles: self.ancestor_roles.clone(),
                ancestor_identity_tokens: self.ancestor_identity_tokens.clone(),
            })
        }

        fn children(&self) -> Result<Vec<Self>, BackendError> {
            let walker = self
                .automation
                .get_control_view_walker()
                .map_err(|error| BackendError::Inspection(error.to_string()))?;
            let Ok(mut child) = walker.get_first_child(&self.element) else {
                return Ok(Vec::new());
            };
            let parent = self.snapshot()?;
            let mut ancestor_roles = self.ancestor_roles.clone();
            ancestor_roles.push(parent.role);
            let mut ancestor_identity_tokens = self.ancestor_identity_tokens.clone();
            ancestor_identity_tokens.extend([
                parent.automation_id,
                parent.name,
                parent.item_status,
                parent.help_text,
            ]);
            let mut children = Vec::new();
            loop {
                children.push(Self {
                    automation: Rc::clone(&self.automation),
                    element: child.clone(),
                    provider: self.provider,
                    process_name: self.process_name.clone(),
                    ancestor_roles: ancestor_roles.clone(),
                    ancestor_identity_tokens: ancestor_identity_tokens.clone(),
                });
                match walker.get_next_sibling(&child) {
                    Ok(next) => child = next,
                    Err(_) => break,
                }
            }
            Ok(children)
        }

        fn invoke_pattern(&self) -> Result<(), BackendError> {
            let pattern = self
                .element
                .get_pattern::<UIInvokePattern>()
                .map_err(|_| BackendError::PatternUnavailable("InvokePattern"))?;
            pattern
                .invoke()
                .map_err(|error| BackendError::Inspection(error.to_string()))
        }

        fn selection_item_pattern(&self) -> Result<(), BackendError> {
            let pattern = self
                .element
                .get_pattern::<UISelectionItemPattern>()
                .map_err(|_| BackendError::PatternUnavailable("SelectionItemPattern"))?;
            pattern
                .select()
                .map_err(|error| BackendError::Inspection(error.to_string()))
        }
    }

    fn map_control_role(control_type: ControlType, dialog: bool) -> ControlRole {
        if dialog {
            return ControlRole::Dialog;
        }
        match control_type {
            ControlType::Window => ControlRole::Window,
            ControlType::Pane => ControlRole::Pane,
            ControlType::Group => ControlRole::Group,
            ControlType::List => ControlRole::List,
            ControlType::ListItem => ControlRole::ListItem,
            ControlType::Tree => ControlRole::Tree,
            ControlType::TreeItem => ControlRole::TreeItem,
            ControlType::Menu => ControlRole::Menu,
            ControlType::MenuItem => ControlRole::MenuItem,
            ControlType::Button => ControlRole::Button,
            ControlType::Tab => ControlRole::Tab,
            ControlType::TabItem => ControlRole::TabItem,
            ControlType::Text => ControlRole::Text,
            ControlType::ProgressBar => ControlRole::ProgressBar,
            ControlType::Edit => ControlRole::Edit,
            _ => ControlRole::Custom,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;
    use std::rc::Rc;

    use super::*;

    #[derive(Clone)]
    struct MockNode {
        snapshot: ElementSnapshot,
        children: Vec<MockNode>,
        calls: Rc<RefCell<Vec<String>>>,
        invoke_available: bool,
        selection_available: bool,
        inspection_error: bool,
    }

    impl MockNode {
        fn new(snapshot: ElementSnapshot, calls: Rc<RefCell<Vec<String>>>) -> Self {
            Self {
                snapshot,
                children: Vec::new(),
                calls,
                invoke_available: true,
                selection_available: true,
                inspection_error: false,
            }
        }

        fn with_children(mut self, children: Vec<MockNode>) -> Self {
            self.children = children;
            self
        }
    }

    impl SemanticNode for MockNode {
        fn snapshot(&self) -> Result<ElementSnapshot, BackendError> {
            if self.inspection_error {
                return Err(BackendError::Inspection("mock read failure".to_string()));
            }
            Ok(self.snapshot.clone())
        }

        fn children(&self) -> Result<Vec<Self>, BackendError> {
            Ok(self.children.clone())
        }

        fn invoke_pattern(&self) -> Result<(), BackendError> {
            if !self.invoke_available {
                return Err(BackendError::PatternUnavailable("InvokePattern"));
            }
            self.calls
                .borrow_mut()
                .push(format!("invoke:{}", self.snapshot.automation_id));
            Ok(())
        }

        fn selection_item_pattern(&self) -> Result<(), BackendError> {
            if !self.selection_available {
                return Err(BackendError::PatternUnavailable("SelectionItemPattern"));
            }
            self.calls
                .borrow_mut()
                .push(format!("select:{}", self.snapshot.automation_id));
            Ok(())
        }
    }

    fn snapshot(
        id: &str,
        role: ControlRole,
        name: &str,
        ancestor_roles: Vec<ControlRole>,
        ancestor_tokens: Vec<&str>,
    ) -> ElementSnapshot {
        ElementSnapshot {
            automation_id: id.to_string(),
            role,
            name: name.to_string(),
            class_name: "Chrome_WidgetWin_1".to_string(),
            framework_id: "Chrome".to_string(),
            process_id: 42,
            process_name: "steam.exe".to_string(),
            enabled: true,
            visible: true,
            password: false,
            dialog: role == ControlRole::Dialog,
            item_status: String::new(),
            help_text: String::new(),
            ancestor_roles,
            ancestor_identity_tokens: ancestor_tokens.into_iter().map(str::to_string).collect(),
        }
    }

    fn steam_tree(action_id: &str, calls: Rc<RefCell<Vec<String>>>) -> MockNode {
        let action = MockNode::new(
            snapshot(
                action_id,
                ControlRole::MenuItem,
                "Localized action",
                vec![
                    ControlRole::Window,
                    ControlRole::ListItem,
                    ControlRole::Menu,
                ],
                vec!["440"],
            ),
            Rc::clone(&calls),
        );
        let menu = MockNode::new(
            snapshot(
                "maintenance-menu",
                ControlRole::Menu,
                "Menu",
                vec![ControlRole::Window, ControlRole::ListItem],
                vec!["440"],
            ),
            Rc::clone(&calls),
        )
        .with_children(vec![action]);
        let manage = MockNode::new(
            snapshot(
                "game_manage_button",
                ControlRole::Button,
                "Manage",
                vec![ControlRole::Window, ControlRole::ListItem],
                vec!["440"],
            ),
            Rc::clone(&calls),
        );
        let game = MockNode::new(
            snapshot(
                "library_game_list_item",
                ControlRole::ListItem,
                "Team Fortress 2",
                vec![ControlRole::Window],
                vec!["440"],
            ),
            Rc::clone(&calls),
        )
        .with_children(vec![manage, menu]);
        MockNode::new(
            snapshot("SteamRoot", ControlRole::Window, "Steam", vec![], vec![]),
            calls,
        )
        .with_children(vec![game])
    }

    #[test]
    fn provider_window_requires_exact_process_and_window_identity() {
        let calls = Rc::new(RefCell::new(Vec::new()));
        let correct = steam_tree("verify_integrity", Rc::clone(&calls));
        let mut spoof = correct.clone();
        spoof.snapshot.process_name = "evil-steam.exe".to_string();
        let found = WindowsSemanticBackend
            .find_provider_window(&[spoof, correct.clone()], ProviderId::Steam, Some(42))
            .unwrap();
        assert_eq!(found.snapshot.automation_id, "SteamRoot");
    }

    #[test]
    fn ambiguous_provider_windows_fail_closed() {
        let calls = Rc::new(RefCell::new(Vec::new()));
        let first = steam_tree("verify_integrity", Rc::clone(&calls));
        let second = first.clone();
        assert!(matches!(
            WindowsSemanticBackend.find_provider_window(&[first, second], ProviderId::Steam, None),
            Err(BackendError::AmbiguousProviderWindow)
        ));
    }

    #[test]
    fn fingerprint_hashes_structure_without_accessible_names() {
        let calls = Rc::new(RefCell::new(Vec::new()));
        let first = steam_tree("verify_integrity", Rc::clone(&calls));
        let mut renamed = first.clone();
        renamed.snapshot.name = "Private account window title".to_string();
        let first_fingerprint = WindowsSemanticBackend
            .fingerprint(&first, ProviderId::Steam, "1.2.3")
            .unwrap();
        let renamed_fingerprint = WindowsSemanticBackend
            .fingerprint(&renamed, ProviderId::Steam, "1.2.3")
            .unwrap();
        assert_eq!(
            first_fingerprint.semantic_tree_hash,
            renamed_fingerprint.semantic_tree_hash
        );
        assert!(!format!("{first_fingerprint:?}").contains("Private account"));
    }

    #[test]
    fn verify_uses_selection_and_invoke_patterns_then_waits_for_observation() {
        let calls = Rc::new(RefCell::new(Vec::new()));
        let tree = steam_tree("verify_integrity", Rc::clone(&calls));
        let recipe = provider_spec(ProviderId::Steam).recipe(MaintenanceAction::Verify);
        let state = WindowsSemanticBackend.execute(&tree, &recipe, "440", None, 100);
        assert_eq!(
            state,
            ExecutionState::StartedAwaitingObservation {
                proof: CompletionProof::ProviderProgressThenTerminalState
            }
        );
        assert_eq!(
            calls.borrow().as_slice(),
            [
                "select:library_game_list_item",
                "invoke:game_manage_button",
                "invoke:verify_integrity"
            ]
        );
    }

    #[test]
    fn destructive_action_never_invokes_without_bound_confirmation() {
        let calls = Rc::new(RefCell::new(Vec::new()));
        let tree = steam_tree("uninstall", Rc::clone(&calls));
        let recipe = provider_spec(ProviderId::Steam).recipe(MaintenanceAction::Uninstall);
        let state = WindowsSemanticBackend.execute(&tree, &recipe, "440", None, 100);
        assert!(matches!(state, ExecutionState::Blocked { .. }));
        assert!(!calls.borrow().iter().any(|call| call == "invoke:uninstall"));
    }

    #[test]
    fn expired_or_wrong_confirmation_never_authorizes_uninstall() {
        let cases = [
            BoundConfirmation {
                provider: ProviderId::Epic,
                game_identity: "440",
                action: MaintenanceAction::Uninstall,
                expires_at_unix: 200,
            },
            BoundConfirmation {
                provider: ProviderId::Steam,
                game_identity: "730",
                action: MaintenanceAction::Uninstall,
                expires_at_unix: 200,
            },
            BoundConfirmation {
                provider: ProviderId::Steam,
                game_identity: "440",
                action: MaintenanceAction::Uninstall,
                expires_at_unix: 99,
            },
        ];
        for confirmation in cases {
            let calls = Rc::new(RefCell::new(Vec::new()));
            let tree = steam_tree("uninstall", Rc::clone(&calls));
            let recipe = provider_spec(ProviderId::Steam).recipe(MaintenanceAction::Uninstall);
            let state =
                WindowsSemanticBackend.execute(&tree, &recipe, "440", Some(&confirmation), 100);
            assert!(matches!(state, ExecutionState::Blocked { .. }));
            assert!(!calls.borrow().iter().any(|call| call == "invoke:uninstall"));
        }
    }

    #[test]
    fn valid_confirmation_still_returns_awaiting_observation_not_completed() {
        let calls = Rc::new(RefCell::new(Vec::new()));
        let tree = steam_tree("uninstall", Rc::clone(&calls));
        let recipe = provider_spec(ProviderId::Steam).recipe(MaintenanceAction::Uninstall);
        let confirmation = BoundConfirmation {
            provider: ProviderId::Steam,
            game_identity: "440",
            action: MaintenanceAction::Uninstall,
            expires_at_unix: 200,
        };
        assert!(matches!(
            WindowsSemanticBackend.execute(&tree, &recipe, "440", Some(&confirmation), 100),
            ExecutionState::StartedAwaitingObservation { .. }
        ));
        assert!(calls.borrow().iter().any(|call| call == "invoke:uninstall"));
    }

    #[test]
    fn password_or_captcha_state_requires_user_handoff_before_any_action() {
        for blocking in [
            {
                let mut value = snapshot(
                    "password",
                    ControlRole::Edit,
                    "Password",
                    vec![ControlRole::Window],
                    vec![],
                );
                value.password = true;
                value
            },
            {
                let mut value = snapshot(
                    "captcha",
                    ControlRole::Dialog,
                    "Human verification",
                    vec![ControlRole::Window],
                    vec![],
                );
                value.dialog = true;
                value
            },
        ] {
            let calls = Rc::new(RefCell::new(Vec::new()));
            let mut tree = steam_tree("verify_integrity", Rc::clone(&calls));
            tree.children
                .push(MockNode::new(blocking, Rc::clone(&calls)));
            let recipe = provider_spec(ProviderId::Steam).recipe(MaintenanceAction::Verify);
            assert!(matches!(
                WindowsSemanticBackend.execute(&tree, &recipe, "440", None, 100),
                ExecutionState::HandoffRequired { .. }
            ));
            assert!(calls.borrow().is_empty());
        }
    }

    #[test]
    fn unknown_dialog_requires_handoff_instead_of_guessing() {
        let calls = Rc::new(RefCell::new(Vec::new()));
        let mut tree = steam_tree("verify_integrity", Rc::clone(&calls));
        let mut dialog = snapshot(
            "new-provider-modal",
            ControlRole::Dialog,
            "Provider changed",
            vec![ControlRole::Window],
            vec![],
        );
        dialog.dialog = true;
        tree.children.push(MockNode::new(dialog, Rc::clone(&calls)));
        let recipe = provider_spec(ProviderId::Steam).recipe(MaintenanceAction::Verify);
        assert_eq!(
            WindowsSemanticBackend.execute(&tree, &recipe, "440", None, 100),
            ExecutionState::HandoffRequired {
                state: BlockingState::UnknownModal
            }
        );
    }

    #[test]
    fn missing_invoke_pattern_blocks_without_coordinate_fallback() {
        let calls = Rc::new(RefCell::new(Vec::new()));
        let mut tree = steam_tree("verify_integrity", Rc::clone(&calls));
        tree.children[0].children[0].invoke_available = false;
        let recipe = provider_spec(ProviderId::Steam).recipe(MaintenanceAction::Verify);
        let state = WindowsSemanticBackend.execute(&tree, &recipe, "440", None, 100);
        assert!(matches!(state, ExecutionState::Blocked { .. }));
        assert_eq!(calls.borrow().as_slice(), ["select:library_game_list_item"]);
    }

    #[test]
    fn missing_exact_game_identity_blocks_before_patterns() {
        let calls = Rc::new(RefCell::new(Vec::new()));
        let tree = steam_tree("verify_integrity", Rc::clone(&calls));
        let recipe = provider_spec(ProviderId::Steam).recipe(MaintenanceAction::Verify);
        let state = WindowsSemanticBackend.execute(&tree, &recipe, "730", None, 100);
        assert!(matches!(state, ExecutionState::Blocked { .. }));
        assert!(calls.borrow().is_empty());
    }

    #[test]
    fn unreadable_elements_block_instead_of_hiding_blocking_state() {
        let calls = Rc::new(RefCell::new(Vec::new()));
        let mut tree = steam_tree("verify_integrity", Rc::clone(&calls));
        let mut unreadable = MockNode::new(
            snapshot(
                "unreadable",
                ControlRole::Dialog,
                "",
                vec![ControlRole::Window],
                vec![],
            ),
            Rc::clone(&calls),
        );
        unreadable.inspection_error = true;
        tree.children.push(unreadable);
        let recipe = provider_spec(ProviderId::Steam).recipe(MaintenanceAction::Verify);
        assert!(matches!(
            WindowsSemanticBackend.execute(&tree, &recipe, "440", None, 100),
            ExecutionState::Blocked { .. }
        ));
        assert!(calls.borrow().is_empty());
    }

    #[test]
    fn identity_token_matching_rejects_substrings() {
        assert!(exact_identity_token_match("game-440-tile", "440"));
        assert!(!exact_identity_token_match("game-1440-tile", "440"));
        assert!(exact_identity_token_match(
            "Team Fortress 2",
            "Team Fortress 2"
        ));
    }
}
