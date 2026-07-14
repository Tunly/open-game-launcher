//! Provider-specific, locale-resilient recipes for launcher UI automation.
//!
//! This module is intentionally pure. It contains no process launching, input
//! synthesis, coordinates, OCR, or platform API calls. The Windows backend
//! consumes these recipes and must prove exact provider and game identity before
//! it can invoke an accessible control pattern.

use std::cmp::Reverse;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ProviderId {
    Steam,
    Epic,
    Gog,
    Ea,
    Ubisoft,
    Battlenet,
    Xbox,
}

impl ProviderId {
    pub const ALL: [Self; 7] = [
        Self::Steam,
        Self::Epic,
        Self::Gog,
        Self::Ea,
        Self::Ubisoft,
        Self::Battlenet,
        Self::Xbox,
    ];

    pub const fn key(self) -> &'static str {
        match self {
            Self::Steam => "steam",
            Self::Epic => "epic",
            Self::Gog => "gog",
            Self::Ea => "ea",
            Self::Ubisoft => "ubisoft",
            Self::Battlenet => "battlenet",
            Self::Xbox => "xbox",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum MaintenanceAction {
    Verify,
    Repair,
    Update,
    Uninstall,
}

impl MaintenanceAction {
    pub const ALL: [Self; 4] = [Self::Verify, Self::Repair, Self::Update, Self::Uninstall];

    pub const fn destructive(self) -> bool {
        matches!(self, Self::Repair | Self::Update | Self::Uninstall)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ControlRole {
    Window,
    Pane,
    Group,
    List,
    ListItem,
    Tree,
    TreeItem,
    Menu,
    MenuItem,
    Button,
    Tab,
    TabItem,
    Text,
    Dialog,
    ProgressBar,
    Edit,
    Custom,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum StructuralRelationship {
    ProviderWindow,
    DescendantOfExactGame,
    MaintenanceMenuOfExactGame,
    BlockingDialog,
    ProgressForExactGame,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SemanticPattern {
    SelectionItem,
    Invoke,
    ObserveOnly,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SemanticSelector {
    pub automation_ids: Vec<&'static str>,
    pub roles: Vec<ControlRole>,
    pub relationship: StructuralRelationship,
    pub localized_names: Vec<&'static str>,
    pub minimum_score: u16,
    pub pattern: SemanticPattern,
    pub require_enabled: bool,
    pub require_exact_game: bool,
    pub require_exact_provider: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RecipeStep {
    SelectExactGame(SemanticSelector),
    OpenMaintenanceMenu(SemanticSelector),
    InvokeAction {
        selector: SemanticSelector,
        requires_bound_confirmation: bool,
    },
    Observe(CompletionProof),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompletionProof {
    ProviderProgressThenTerminalState,
    LocalManifestOrCacheChange,
    ExactPackageRemoved,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActionRecipe {
    pub provider: ProviderId,
    pub action: MaintenanceAction,
    pub steps: Vec<RecipeStep>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProviderSpec {
    pub provider: ProviderId,
    pub process_names: Vec<&'static str>,
    pub window_class_hints: Vec<&'static str>,
    pub window_automation_ids: Vec<&'static str>,
    pub structure_version: &'static str,
}

impl ProviderSpec {
    pub fn process_matches(&self, candidate: &str) -> bool {
        self.process_names
            .iter()
            .any(|expected| expected.eq_ignore_ascii_case(candidate.trim()))
    }

    pub fn window_class_matches(&self, candidate: &str) -> bool {
        self.window_class_hints
            .iter()
            .any(|expected| expected.eq_ignore_ascii_case(candidate.trim()))
    }

    pub fn recipe(&self, action: MaintenanceAction) -> ActionRecipe {
        build_recipe(self.provider, action)
    }
}

pub fn provider_spec(provider: ProviderId) -> ProviderSpec {
    match provider {
        ProviderId::Steam => ProviderSpec {
            provider,
            process_names: vec!["steam.exe", "steamwebhelper.exe"],
            window_class_hints: vec!["vguiPopupWindow", "Chrome_WidgetWin_1"],
            window_automation_ids: vec!["SteamRoot", "SteamDesktopWindow"],
            structure_version: "steam-semantic-v1",
        },
        ProviderId::Epic => ProviderSpec {
            provider,
            process_names: vec!["EpicGamesLauncher.exe"],
            window_class_hints: vec!["UnrealWindow", "Chrome_WidgetWin_1"],
            window_automation_ids: vec!["EpicGamesLauncher", "LibraryView"],
            structure_version: "epic-semantic-v1",
        },
        ProviderId::Gog => ProviderSpec {
            provider,
            process_names: vec!["GalaxyClient.exe", "GalaxyClient Helper.exe"],
            window_class_hints: vec!["Chrome_WidgetWin_1", "GalaxyClientWindow"],
            window_automation_ids: vec!["GalaxyMainWindow", "OwnedGamesView"],
            structure_version: "gog-semantic-v1",
        },
        ProviderId::Ea => ProviderSpec {
            provider,
            process_names: vec!["EADesktop.exe", "EALauncher.exe"],
            window_class_hints: vec!["Chrome_WidgetWin_1", "EADesktopWindow"],
            window_automation_ids: vec!["EADesktopMainWindow", "GameLibrary"],
            structure_version: "ea-semantic-v1",
        },
        ProviderId::Ubisoft => ProviderSpec {
            provider,
            process_names: vec!["UbisoftConnect.exe", "upc.exe"],
            window_class_hints: vec!["Qt5152QWindowIcon", "UbisoftConnectWindow"],
            window_automation_ids: vec!["UbisoftConnectMainWindow", "GamesLibrary"],
            structure_version: "ubisoft-semantic-v1",
        },
        ProviderId::Battlenet => ProviderSpec {
            provider,
            process_names: vec!["Battle.net.exe", "Battle.net Launcher.exe"],
            window_class_hints: vec!["Chrome_WidgetWin_1", "Battle.net"],
            window_automation_ids: vec!["BattleNetMainWindow", "GameNavigation"],
            structure_version: "battlenet-semantic-v1",
        },
        ProviderId::Xbox => ProviderSpec {
            provider,
            process_names: vec!["XboxPcApp.exe", "GamingApp.exe"],
            window_class_hints: vec!["ApplicationFrameWindow", "WinUIDesktopWin32WindowClass"],
            window_automation_ids: vec!["XboxAppRoot", "GameManagementView"],
            structure_version: "xbox-semantic-v1",
        },
    }
}

fn build_recipe(provider: ProviderId, action: MaintenanceAction) -> ActionRecipe {
    let select_game = SemanticSelector {
        automation_ids: game_container_ids(provider),
        roles: vec![
            ControlRole::ListItem,
            ControlRole::TreeItem,
            ControlRole::Custom,
        ],
        relationship: StructuralRelationship::DescendantOfExactGame,
        localized_names: Vec::new(),
        minimum_score: 760,
        pattern: SemanticPattern::SelectionItem,
        require_enabled: true,
        require_exact_game: true,
        require_exact_provider: true,
    };
    let maintenance_menu = SemanticSelector {
        automation_ids: maintenance_menu_ids(provider),
        roles: vec![ControlRole::Button, ControlRole::MenuItem],
        relationship: StructuralRelationship::DescendantOfExactGame,
        localized_names: maintenance_menu_names(),
        minimum_score: 700,
        pattern: SemanticPattern::Invoke,
        require_enabled: true,
        require_exact_game: true,
        require_exact_provider: true,
    };
    let action_selector = SemanticSelector {
        automation_ids: action_ids(provider, action),
        roles: vec![
            ControlRole::MenuItem,
            ControlRole::Button,
            ControlRole::ListItem,
        ],
        relationship: StructuralRelationship::MaintenanceMenuOfExactGame,
        localized_names: action_names(action),
        minimum_score: 700,
        pattern: SemanticPattern::Invoke,
        require_enabled: true,
        require_exact_game: true,
        require_exact_provider: true,
    };
    let proof = if provider == ProviderId::Xbox && action == MaintenanceAction::Uninstall {
        CompletionProof::ExactPackageRemoved
    } else if action == MaintenanceAction::Uninstall {
        CompletionProof::LocalManifestOrCacheChange
    } else {
        CompletionProof::ProviderProgressThenTerminalState
    };

    ActionRecipe {
        provider,
        action,
        steps: vec![
            RecipeStep::SelectExactGame(select_game),
            RecipeStep::OpenMaintenanceMenu(maintenance_menu),
            RecipeStep::InvokeAction {
                selector: action_selector,
                requires_bound_confirmation: action.destructive(),
            },
            RecipeStep::Observe(proof),
        ],
    }
}

fn game_container_ids(provider: ProviderId) -> Vec<&'static str> {
    match provider {
        ProviderId::Steam => vec!["library_game_list_item", "game_details_root"],
        ProviderId::Epic => vec!["library-game-tile", "game-detail-container"],
        ProviderId::Gog => vec!["owned-game-tile", "game-view-root"],
        ProviderId::Ea => vec!["game-library-tile", "game-details-page"],
        ProviderId::Ubisoft => vec!["game-library-item", "game-page-root"],
        ProviderId::Battlenet => vec!["game-navigation-item", "game-page"],
        ProviderId::Xbox => vec!["game-library-item", "game-management-root"],
    }
}

fn maintenance_menu_ids(provider: ProviderId) -> Vec<&'static str> {
    match provider {
        ProviderId::Steam => vec!["game_manage_button", "game_context_menu_button"],
        ProviderId::Epic => vec!["game-options-button", "manage-game-button"],
        ProviderId::Gog => vec!["more-actions-button", "manage-installation-button"],
        ProviderId::Ea => vec!["manage-game-button", "game-options-button"],
        ProviderId::Ubisoft => vec!["game-properties-button", "more-actions-button"],
        ProviderId::Battlenet => vec!["game-options-button", "options-menu-button"],
        ProviderId::Xbox => vec!["manage-game-button", "game-options-button"],
    }
}

fn action_ids(provider: ProviderId, action: MaintenanceAction) -> Vec<&'static str> {
    let generic = match action {
        MaintenanceAction::Verify => "verify-files-action",
        MaintenanceAction::Repair => "repair-files-action",
        MaintenanceAction::Update => "update-game-action",
        MaintenanceAction::Uninstall => "uninstall-game-action",
    };
    let provider_specific = match (provider, action) {
        (ProviderId::Steam, MaintenanceAction::Verify) => "verify_integrity",
        (ProviderId::Epic, MaintenanceAction::Verify) => "verify-installation",
        (ProviderId::Gog, MaintenanceAction::Repair) => "verify-repair-installation",
        (ProviderId::Ea, MaintenanceAction::Repair) => "repair-game",
        (ProviderId::Ubisoft, MaintenanceAction::Verify) => "verify-files",
        (ProviderId::Battlenet, MaintenanceAction::Repair) => "scan-and-repair",
        (ProviderId::Xbox, MaintenanceAction::Repair) => "repair-app",
        (_, MaintenanceAction::Update) => "check-for-updates",
        (_, MaintenanceAction::Uninstall) => "uninstall",
        (_, MaintenanceAction::Verify) => "verify",
        (_, MaintenanceAction::Repair) => "repair",
    };
    vec![provider_specific, generic]
}

fn maintenance_menu_names() -> Vec<&'static str> {
    vec![
        "Manage",
        "Options",
        "More actions",
        "Verwalten",
        "Optionen",
        "Gérer",
        "Más acciones",
    ]
}

fn action_names(action: MaintenanceAction) -> Vec<&'static str> {
    match action {
        MaintenanceAction::Verify => vec![
            "Verify integrity of game files",
            "Verify files",
            "Dateien auf Fehler überprüfen",
            "Spieldateien überprüfen",
            "Vérifier les fichiers",
            "Verificar archivos",
        ],
        MaintenanceAction::Repair => vec![
            "Scan and repair",
            "Repair",
            "Reparieren",
            "Scannen und reparieren",
            "Analyser et réparer",
            "Reparar",
        ],
        MaintenanceAction::Update => vec![
            "Update",
            "Check for updates",
            "Aktualisieren",
            "Nach Updates suchen",
            "Mettre à jour",
            "Actualizar",
        ],
        MaintenanceAction::Uninstall => {
            vec!["Uninstall", "Deinstallieren", "Désinstaller", "Desinstalar"]
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ElementDescriptor {
    pub automation_id: String,
    pub role: ControlRole,
    pub name: String,
    pub provider: Option<ProviderId>,
    pub bound_game_identity: Option<String>,
    pub relationship: StructuralRelationship,
    pub enabled: bool,
    pub visible: bool,
    pub password: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RankedCandidate {
    pub index: usize,
    pub score: u16,
    pub used_localized_text: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SelectionError {
    NoSafeMatch,
    Ambiguous { score: u16, candidates: usize },
}

pub fn rank_candidates(
    selector: &SemanticSelector,
    candidates: &[ElementDescriptor],
    expected_provider: ProviderId,
    expected_game_identity: &str,
) -> Result<RankedCandidate, SelectionError> {
    let mut ranked = candidates
        .iter()
        .enumerate()
        .filter_map(|(index, candidate)| {
            score_candidate(
                selector,
                candidate,
                expected_provider,
                expected_game_identity,
            )
            .map(|(score, used_localized_text)| RankedCandidate {
                index,
                score,
                used_localized_text,
            })
        })
        .filter(|candidate| candidate.score >= selector.minimum_score)
        .collect::<Vec<_>>();
    ranked.sort_by_key(|candidate| Reverse(candidate.score));

    let Some(best) = ranked.first().cloned() else {
        return Err(SelectionError::NoSafeMatch);
    };
    let tied = ranked
        .iter()
        .take_while(|candidate| candidate.score == best.score)
        .count();
    if tied > 1 {
        return Err(SelectionError::Ambiguous {
            score: best.score,
            candidates: tied,
        });
    }
    Ok(best)
}

fn score_candidate(
    selector: &SemanticSelector,
    candidate: &ElementDescriptor,
    expected_provider: ProviderId,
    expected_game_identity: &str,
) -> Option<(u16, bool)> {
    if candidate.password || !candidate.visible || (selector.require_enabled && !candidate.enabled)
    {
        return None;
    }
    if selector.require_exact_provider && candidate.provider != Some(expected_provider) {
        return None;
    }
    if selector.require_exact_game
        && candidate.bound_game_identity.as_deref() != Some(expected_game_identity)
    {
        return None;
    }
    if candidate.relationship != selector.relationship {
        return None;
    }
    if !selector.roles.is_empty() && !selector.roles.contains(&candidate.role) {
        return None;
    }

    let normalized_id = normalize_semantic(&candidate.automation_id);
    let id_match = !normalized_id.is_empty()
        && selector
            .automation_ids
            .iter()
            .any(|value| normalize_semantic(value) == normalized_id);
    let normalized_name = normalize_semantic(&candidate.name);
    let name_match = !normalized_name.is_empty()
        && selector
            .localized_names
            .iter()
            .any(|value| normalize_semantic(value) == normalized_name);

    // A localized name is a fallback, never a sufficient identity signal by itself.
    if !id_match && !name_match && !selector.automation_ids.is_empty() {
        return None;
    }

    let mut score = 180_u16; // exact control role
    score += 220; // exact structural relationship
    if selector.require_exact_provider {
        score += 140;
    }
    if selector.require_exact_game {
        score += 260;
    }
    if id_match {
        score += 700;
    } else if name_match {
        score += 80;
    }
    Some((score, !id_match && name_match))
}

pub fn normalize_semantic(value: &str) -> String {
    value
        .chars()
        .flat_map(char::to_lowercase)
        .filter(|character| character.is_alphanumeric())
        .collect()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BlockingState {
    Login,
    Captcha,
    Consent,
    Elevation,
    SecurityChallenge,
    AccountRecovery,
    Payment,
    UnknownModal,
}

pub fn detect_blocking_state(elements: &[ElementDescriptor]) -> Option<BlockingState> {
    for element in elements {
        if !element.visible {
            continue;
        }
        if element.password {
            return Some(BlockingState::Login);
        }
        let semantic = normalize_semantic(&format!("{} {}", element.automation_id, element.name));
        for (needles, state) in blocking_rules() {
            if needles
                .iter()
                .any(|needle| semantic.contains(&normalize_semantic(needle)))
            {
                return Some(state);
            }
        }
        if element.relationship == StructuralRelationship::BlockingDialog
            && matches!(element.role, ControlRole::Dialog | ControlRole::Window)
        {
            return Some(BlockingState::UnknownModal);
        }
    }
    None
}

fn blocking_rules() -> Vec<(Vec<&'static str>, BlockingState)> {
    vec![
        (
            vec!["captcha", "robot check", "human verification"],
            BlockingState::Captcha,
        ),
        (
            vec!["sign in", "log in", "anmelden", "connexion"],
            BlockingState::Login,
        ),
        (
            vec!["terms", "license agreement", "privacy consent", "zustimmen"],
            BlockingState::Consent,
        ),
        (
            vec!["administrator", "elevation", "user account control", "uac"],
            BlockingState::Elevation,
        ),
        (
            vec!["security code", "two-factor", "2fa", "verification code"],
            BlockingState::SecurityChallenge,
        ),
        (
            vec![
                "account recovery",
                "recover account",
                "konto wiederherstellen",
            ],
            BlockingState::AccountRecovery,
        ),
        (
            vec!["payment", "purchase", "subscription", "checkout"],
            BlockingState::Payment,
        ),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate(
        provider: ProviderId,
        game: &str,
        automation_id: &str,
        name: &str,
        relationship: StructuralRelationship,
    ) -> ElementDescriptor {
        ElementDescriptor {
            automation_id: automation_id.to_string(),
            role: ControlRole::MenuItem,
            name: name.to_string(),
            provider: Some(provider),
            bound_game_identity: Some(game.to_string()),
            relationship,
            enabled: true,
            visible: true,
            password: false,
        }
    }

    #[test]
    fn provider_inventory_is_complete_and_unique() {
        let keys = ProviderId::ALL.map(ProviderId::key);
        assert_eq!(
            keys,
            ["steam", "epic", "gog", "ea", "ubisoft", "battlenet", "xbox"]
        );
    }

    #[test]
    fn process_identity_is_exact_and_case_insensitive() {
        let steam = provider_spec(ProviderId::Steam);
        assert!(steam.process_matches("STEAM.EXE"));
        assert!(!steam.process_matches("evil-steam.exe"));
        assert!(!steam.process_matches("steam.exe.backup"));
    }

    #[test]
    fn every_provider_has_every_safe_recipe() {
        for provider in ProviderId::ALL {
            let spec = provider_spec(provider);
            assert!(!spec.process_names.is_empty());
            assert!(!spec.window_class_hints.is_empty());
            for action in MaintenanceAction::ALL {
                let recipe = spec.recipe(action);
                assert_eq!(recipe.provider, provider);
                assert_eq!(recipe.action, action);
                assert_eq!(recipe.steps.len(), 4);
            }
        }
    }

    #[test]
    fn recipes_bind_selection_and_actions_to_exact_game_and_provider() {
        for provider in ProviderId::ALL {
            for action in MaintenanceAction::ALL {
                for step in provider_spec(provider).recipe(action).steps {
                    let selector = match step {
                        RecipeStep::SelectExactGame(selector)
                        | RecipeStep::OpenMaintenanceMenu(selector) => Some(selector),
                        RecipeStep::InvokeAction { selector, .. } => Some(selector),
                        RecipeStep::Observe(_) => None,
                    };
                    if let Some(selector) = selector {
                        assert!(selector.require_exact_game);
                        assert!(selector.require_exact_provider);
                    }
                }
            }
        }
    }

    #[test]
    fn destructive_recipes_require_bound_confirmation() {
        for provider in ProviderId::ALL {
            for action in MaintenanceAction::ALL {
                let recipe = provider_spec(provider).recipe(action);
                let confirmation = recipe.steps.into_iter().find_map(|step| match step {
                    RecipeStep::InvokeAction {
                        requires_bound_confirmation,
                        ..
                    } => Some(requires_bound_confirmation),
                    _ => None,
                });
                assert_eq!(confirmation, Some(action.destructive()));
            }
        }
    }

    #[test]
    fn automation_id_outranks_localized_text_fallback() {
        let selector = provider_spec(ProviderId::Steam)
            .recipe(MaintenanceAction::Verify)
            .steps
            .into_iter()
            .find_map(|step| match step {
                RecipeStep::InvokeAction { selector, .. } => Some(selector),
                _ => None,
            })
            .unwrap();
        let candidates = vec![
            candidate(
                ProviderId::Steam,
                "440",
                "unknown-action",
                "Verify files",
                StructuralRelationship::MaintenanceMenuOfExactGame,
            ),
            candidate(
                ProviderId::Steam,
                "440",
                "verify_integrity",
                "Completely localized",
                StructuralRelationship::MaintenanceMenuOfExactGame,
            ),
        ];
        let ranked = rank_candidates(&selector, &candidates, ProviderId::Steam, "440").unwrap();
        assert_eq!(ranked.index, 1);
        assert!(!ranked.used_localized_text);
    }

    #[test]
    fn localized_fallback_still_requires_exact_structure_and_identity() {
        let selector = provider_spec(ProviderId::Ea)
            .recipe(MaintenanceAction::Repair)
            .steps
            .into_iter()
            .find_map(|step| match step {
                RecipeStep::InvokeAction { selector, .. } => Some(selector),
                _ => None,
            })
            .unwrap();
        let fallback = candidate(
            ProviderId::Ea,
            "offer-1",
            "unknown",
            "Reparieren",
            StructuralRelationship::MaintenanceMenuOfExactGame,
        );
        let ranked = rank_candidates(&selector, &[fallback], ProviderId::Ea, "offer-1").unwrap();
        assert!(ranked.used_localized_text);
    }

    #[test]
    fn wrong_provider_or_game_identity_is_rejected() {
        let selector = provider_spec(ProviderId::Steam)
            .recipe(MaintenanceAction::Uninstall)
            .steps
            .into_iter()
            .find_map(|step| match step {
                RecipeStep::InvokeAction { selector, .. } => Some(selector),
                _ => None,
            })
            .unwrap();
        let wrong_provider = candidate(
            ProviderId::Epic,
            "440",
            "uninstall",
            "Uninstall",
            StructuralRelationship::MaintenanceMenuOfExactGame,
        );
        let wrong_game = candidate(
            ProviderId::Steam,
            "730",
            "uninstall",
            "Uninstall",
            StructuralRelationship::MaintenanceMenuOfExactGame,
        );
        assert_eq!(
            rank_candidates(
                &selector,
                &[wrong_provider, wrong_game],
                ProviderId::Steam,
                "440"
            ),
            Err(SelectionError::NoSafeMatch)
        );
    }

    #[test]
    fn ambiguous_top_rank_fails_closed() {
        let selector = provider_spec(ProviderId::Xbox)
            .recipe(MaintenanceAction::Repair)
            .steps
            .into_iter()
            .find_map(|step| match step {
                RecipeStep::InvokeAction { selector, .. } => Some(selector),
                _ => None,
            })
            .unwrap();
        let item = candidate(
            ProviderId::Xbox,
            "pfn-1",
            "repair-app",
            "Repair",
            StructuralRelationship::MaintenanceMenuOfExactGame,
        );
        assert!(matches!(
            rank_candidates(&selector, &[item.clone(), item], ProviderId::Xbox, "pfn-1"),
            Err(SelectionError::Ambiguous { candidates: 2, .. })
        ));
    }

    #[test]
    fn password_controls_are_never_action_candidates() {
        let selector = provider_spec(ProviderId::Gog)
            .recipe(MaintenanceAction::Update)
            .steps
            .into_iter()
            .find_map(|step| match step {
                RecipeStep::InvokeAction { selector, .. } => Some(selector),
                _ => None,
            })
            .unwrap();
        let mut item = candidate(
            ProviderId::Gog,
            "game-1",
            "check-for-updates",
            "Update",
            StructuralRelationship::MaintenanceMenuOfExactGame,
        );
        item.password = true;
        assert_eq!(
            rank_candidates(&selector, &[item], ProviderId::Gog, "game-1"),
            Err(SelectionError::NoSafeMatch)
        );
    }

    #[test]
    fn xbox_uninstall_requires_exact_package_removal_proof() {
        let recipe = provider_spec(ProviderId::Xbox).recipe(MaintenanceAction::Uninstall);
        assert!(matches!(
            recipe.steps.last(),
            Some(RecipeStep::Observe(CompletionProof::ExactPackageRemoved))
        ));
    }

    #[test]
    fn blocking_states_cover_sensitive_and_unsafe_flows() {
        let cases = [
            ("captcha", BlockingState::Captcha),
            ("Sign in", BlockingState::Login),
            ("License agreement", BlockingState::Consent),
            ("User Account Control", BlockingState::Elevation),
            ("Verification code", BlockingState::SecurityChallenge),
            ("Account recovery", BlockingState::AccountRecovery),
            ("Payment", BlockingState::Payment),
        ];
        for (name, expected) in cases {
            let element = ElementDescriptor {
                automation_id: String::new(),
                role: ControlRole::Dialog,
                name: name.to_string(),
                provider: None,
                bound_game_identity: None,
                relationship: StructuralRelationship::BlockingDialog,
                enabled: true,
                visible: true,
                password: false,
            };
            assert_eq!(detect_blocking_state(&[element]), Some(expected), "{name}");
        }
    }

    #[test]
    fn unknown_visible_modal_requires_handoff() {
        let element = ElementDescriptor {
            automation_id: "unexpected-modal".into(),
            role: ControlRole::Dialog,
            name: "Something changed".into(),
            provider: Some(ProviderId::Epic),
            bound_game_identity: None,
            relationship: StructuralRelationship::BlockingDialog,
            enabled: true,
            visible: true,
            password: false,
        };
        assert_eq!(
            detect_blocking_state(&[element]),
            Some(BlockingState::UnknownModal)
        );
    }

    #[test]
    fn normalization_is_case_and_punctuation_insensitive() {
        assert_eq!(normalize_semantic("Scan & Repair…"), "scanrepair");
        assert_eq!(
            normalize_semantic("DATEIEN-ÜBERPRÜFEN"),
            "dateienüberprüfen"
        );
    }
}
