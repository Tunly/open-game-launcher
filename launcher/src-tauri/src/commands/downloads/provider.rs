//! Deep module: provider taxonomy for downloads.
//!
//! "Which launcher does this `game_id` belong to and how do we track its
//! downloads?" was previously answered by hand-rolled prefix tables in
//! utils.rs, reconcile.rs, external_dispatch.rs, lifecycle.rs, watcher.rs,
//! start.rs and control.rs. That copy-paste already failed in practice:
//! reconcile.rs's staleness confirmation only knew steam/epic/ea/battlenet,
//! so non-terminal Ubisoft and Xbox entries older than 7 days were always
//! cleaned as stale.
//!
//! This module owns the taxonomy once. Everything downstream consults it.

use crate::commands::games::detect;

/// Every launcher/provider the download tracker understands.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ProviderKind {
    Steam,
    Epic,
    Gog,
    Ea,
    Ubisoft,
    Battlenet,
    Xbox,
    /// Internal / OG-store downloads (HTTP range).
    Internal,
}

impl ProviderKind {
    pub(crate) fn platform_label(self) -> &'static str {
        match self {
            ProviderKind::Steam => "Steam",
            ProviderKind::Epic => "Epic Games",
            ProviderKind::Gog => "GOG Galaxy",
            ProviderKind::Ea => "EA App",
            ProviderKind::Ubisoft => "Ubisoft Connect",
            ProviderKind::Battlenet => "Battle.net",
            ProviderKind::Xbox => "Xbox App / PC Game Pass",
            ProviderKind::Internal => "OG Store",
        }
    }

    pub(crate) fn provider_key(self) -> &'static str {
        match self {
            ProviderKind::Steam => "steam",
            ProviderKind::Epic => "epic",
            ProviderKind::Gog => "gog",
            ProviderKind::Ea => "ea",
            ProviderKind::Ubisoft => "ubisoft",
            ProviderKind::Battlenet => "battlenet",
            ProviderKind::Xbox => "xbox",
            ProviderKind::Internal => "internal",
        }
    }

    /// Where download progress comes from for this provider.
    pub(crate) fn progress_source(self) -> &'static str {
        match self {
            ProviderKind::Steam => "steam_acf",
            ProviderKind::Epic => "epic_stderr",
            ProviderKind::Gog => "gog_api",
            ProviderKind::Ea
            | ProviderKind::Ubisoft
            | ProviderKind::Battlenet
            | ProviderKind::Xbox => "external_tracker",
            ProviderKind::Internal => "http_range",
        }
    }

    /// True when progress is tracked by polling the official launcher
    /// client rather than by an OG-owned download worker. GOG is tracked
    /// through its own API poll (gog_api), not the official client, so it
    /// is not an external tracker either.
    pub(crate) fn is_external_tracker(self) -> bool {
        matches!(
            self,
            ProviderKind::Steam
                | ProviderKind::Epic
                | ProviderKind::Ea
                | ProviderKind::Ubisoft
                | ProviderKind::Battlenet
                | ProviderKind::Xbox
        )
    }

    /// A fresh non-terminal entry older than the staleness threshold should
    /// only be cleaned when the provider itself confirms the game is gone.
    /// Returns `Some(true)` when the provider confirms the entry is still
    /// live, `Some(false)` when the provider confirms it is gone, and
    /// `None` when the provider cannot confirm either way (entry is kept).
    pub(crate) fn confirms_still_live(self, game_id: &str) -> Option<bool> {
        match self {
            ProviderKind::Steam => {
                let app_id =
                    crate::commands::downloads::utils::steam_app_id_from_download_id(game_id)?;
                Some(crate::commands::downloads::steam_state::steam_download_work_exists(app_id))
            }
            ProviderKind::Epic => Some(detect::scan_epic_games().iter().any(|g| g.id == game_id)),
            ProviderKind::Ea => Some(detect::scan_ea_games().iter().any(|g| g.id == game_id)),
            ProviderKind::Battlenet => Some(
                detect::scan_battlenet_games()
                    .iter()
                    .any(|g| g.id == game_id),
            ),
            ProviderKind::Ubisoft => {
                Some(detect::scan_ubisoft_games().iter().any(|g| g.id == game_id))
            }
            ProviderKind::Xbox => Some(detect::scan_xbox_games().iter().any(|g| g.id == game_id)),
            // Internal / GOG downloads are OG-owned; staleness is decided
            // by the queue itself, not by an external launcher.
            ProviderKind::Gog | ProviderKind::Internal => None,
        }
    }
}

/// Classify a download `game_id` into its provider.
pub(crate) fn classify(game_id: &str) -> ProviderKind {
    if game_id.starts_with("steam-") {
        ProviderKind::Steam
    } else if game_id.starts_with("epic-") {
        ProviderKind::Epic
    } else if game_id.starts_with("gog-") {
        ProviderKind::Gog
    } else if game_id.starts_with("ea-") {
        ProviderKind::Ea
    } else if game_id.starts_with("ubisoft-") {
        ProviderKind::Ubisoft
    } else if game_id.starts_with("xbox-") {
        ProviderKind::Xbox
    } else if game_id.starts_with("battlenet-") {
        ProviderKind::Battlenet
    } else {
        ProviderKind::Internal
    }
}

/// True for any id that belongs to an external (non-OG) tracker.
pub(crate) fn is_external_tracker_game_id(game_id: &str) -> bool {
    classify(game_id).is_external_tracker()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_all_provider_prefixes() {
        assert_eq!(classify("steam-owned-12345"), ProviderKind::Steam);
        assert_eq!(classify("steam-12345"), ProviderKind::Steam);
        assert_eq!(classify("epic-owned-fortnite"), ProviderKind::Epic);
        assert_eq!(classify("gog-owned-witcher3"), ProviderKind::Gog);
        assert_eq!(classify("ea-owned-dragonage"), ProviderKind::Ea);
        assert_eq!(classify("ubisoft-owned-farcry"), ProviderKind::Ubisoft);
        assert_eq!(classify("xbox-microsoft.forzahorizon5"), ProviderKind::Xbox);
        assert_eq!(classify("battlenet-owned-diablo"), ProviderKind::Battlenet);
        assert_eq!(classify("internal-thing"), ProviderKind::Internal);
    }

    #[test]
    fn labels_and_keys_cover_xbox_and_ubisoft() {
        assert_eq!(
            ProviderKind::Xbox.platform_label(),
            "Xbox App / PC Game Pass"
        );
        assert_eq!(ProviderKind::Ubisoft.provider_key(), "ubisoft");
        assert_eq!(ProviderKind::Ubisoft.progress_source(), "external_tracker");
        assert_eq!(ProviderKind::Xbox.progress_source(), "external_tracker");
    }

    #[test]
    fn external_tracker_detection_matches_legacy_list() {
        for id in [
            "steam-owned-1",
            "epic-owned-x",
            "ea-owned-x",
            "ubisoft-owned-x",
            "battlenet-owned-x",
            "xbox-x",
        ] {
            assert!(is_external_tracker_game_id(id), "{id}");
        }
        assert!(!is_external_tracker_game_id("internal-download"));
        assert!(!is_external_tracker_game_id("gog-owned-x"));
    }

    #[test]
    fn staleness_confirmation_covers_all_external_providers() {
        // Every external provider must have a confirmation branch so no
        // non-terminal entry is silently cleaned as stale (the ubisoft/xbox
        // gap that shipped). Scan results are environment-dependent, so we
        // only assert the shape: Some for trackable providers, None for
        // OG-owned ones.
        for (id, expected_none) in [
            ("steam-owned-12345", false),
            ("epic-owned-x", false),
            ("ea-owned-x", false),
            ("ubisoft-owned-x", false),
            ("battlenet-owned-x", false),
            ("xbox-x", false),
            ("gog-owned-x", true),
            ("internal-x", true),
        ] {
            let result = classify(id).confirms_still_live(id);
            if expected_none {
                assert_eq!(result, None, "{id}");
            } else {
                assert!(result.is_some(), "{id} must have a confirmation branch");
            }
        }
    }
}
