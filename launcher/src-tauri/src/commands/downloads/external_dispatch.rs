use crate::commands::uri_safety::validate_slug;

/// Result of dispatching a download request to an external launcher
/// (Steam, Epic, EA, Ubisoft, Battle.net).
pub struct ExternalDispatch {
    pub steam_tracker_id: Option<String>,
    pub epic_tracker_id: Option<String>,
    pub is_external_download: bool,
    pub external_message: String,
}

pub fn is_external_launcher_game_id(game_id: &str) -> bool {
    game_id.starts_with("steam-owned-")
        || game_id.starts_with("steam-")
        || game_id.starts_with("epic-owned-")
        || game_id.starts_with("ea-owned-")
        || game_id.starts_with("ubisoft-owned-")
        || game_id.starts_with("battlenet-owned-")
}

/// Inspect `game_id` for external-launcher prefixes and open the
/// matching install URI. Each prefix branch is wrapped in
/// `validate_slug` so a malicious `game_id` cannot smuggle a
/// command into the launched shell. The function is infallible
/// because external launchers are best-effort; failures are
/// reflected in `external_message` so the caller can surface
/// them to the UI.
pub fn dispatch_external_launcher(game_id: &str) -> ExternalDispatch {
    dispatch_external_launcher_with_open_uri(game_id, crate::commands::system::open_uri)
}

fn dispatch_external_launcher_with_open_uri<F>(game_id: &str, mut open_uri: F) -> ExternalDispatch
where
    F: FnMut(&str) -> Result<(), String>,
{
    let mut result = ExternalDispatch {
        steam_tracker_id: None,
        epic_tracker_id: None,
        is_external_download: false,
        external_message: String::new(),
    };

    if game_id.starts_with("steam-owned-") || game_id.starts_with("steam-") {
        let steam_app_id = game_id
            .strip_prefix("steam-owned-")
            .or_else(|| game_id.strip_prefix("steam-"))
            .unwrap_or(game_id);
        // SECURITY: the AppID is interpolated into a URI. Validate before
        // building the URI so a malicious `game_id` like
        // `"steam-123 & calc.exe"` cannot smuggle a command into the
        // shell.
        let safe_steam_id = match validate_slug(steam_app_id) {
            Ok(id) => id.to_string(),
            Err(error) => {
                result.external_message = format!("Steam install link rejected: {error}");
                return result;
            }
        };
        let uri = format!("steam://install/{safe_steam_id}");
        match open_uri(&uri) {
            Ok(()) => {
                result.steam_tracker_id = Some(safe_steam_id);
                result.is_external_download = true;
                result.external_message =
                    "Installation started in Steam. Check Steam for download progress.".to_string();
            }
            Err(error) => {
                result.external_message = format!("Steam install link failed: {error}");
            }
        }
    } else if game_id.starts_with("epic-owned-") {
        let epic_id = game_id
            .strip_prefix("epic-owned-")
            .unwrap_or(game_id)
            .to_string();
        result.epic_tracker_id = Some(epic_id);
        result.is_external_download = true;
        result.external_message =
            "Installation started via Epic Games (Legendary). Check Legendary for progress."
                .to_string();
    } else if game_id.starts_with("ea-owned-") {
        let ea_id = game_id.strip_prefix("ea-owned-").unwrap_or(game_id);
        // SECURITY: validate before URI construction.
        match validate_slug(ea_id) {
            Ok(safe_ea_id) => {
                let uri = format!("origin2://game/launch?offerIds={safe_ea_id}&autoDownload=true");
                match open_uri(&uri) {
                    Ok(()) => {
                        result.is_external_download = true;
                        result.external_message =
                            "Installation started via EA App. Check EA App for progress."
                                .to_string();
                    }
                    Err(error) => {
                        result.external_message = format!("EA install link failed: {error}");
                    }
                }
            }
            Err(error) => {
                result.external_message = format!("EA install link rejected: {error}");
            }
        }
    } else if game_id.starts_with("ubisoft-owned-") {
        let uplay_id = game_id.strip_prefix("ubisoft-owned-").unwrap_or(game_id);
        // SECURITY: validate before URI construction.
        match validate_slug(uplay_id) {
            Ok(safe_uplay_id) => {
                let uri = format!("uplay://install/{safe_uplay_id}");
                match open_uri(&uri) {
                    Ok(()) => {
                        result.is_external_download = true;
                        result.external_message =
                            "Installation started in Ubisoft Connect. Check Ubisoft Connect for progress."
                                .to_string();
                    }
                    Err(error) => {
                        result.external_message = format!("Ubisoft install link failed: {error}");
                    }
                }
            }
            Err(error) => {
                result.external_message = format!("Ubisoft install link rejected: {error}");
            }
        }
    } else if game_id.starts_with("battlenet-owned-") {
        let bnet_id = game_id.strip_prefix("battlenet-owned-").unwrap_or(game_id);
        // SECURITY: validate before URI construction.
        match validate_slug(bnet_id) {
            Ok(safe_bnet_id) => {
                let uri = format!("battlenet://{safe_bnet_id}");
                match open_uri(&uri) {
                    Ok(()) => {
                        result.is_external_download = true;
                        result.external_message =
                            "Installation started in Battle.net. Check Battle.net for download progress."
                                .to_string();
                    }
                    Err(error) => {
                        result.external_message =
                            format!("Battle.net install link failed: {error}");
                    }
                }
            }
            Err(error) => {
                result.external_message = format!("Battle.net install link rejected: {error}");
            }
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_steam_ids_open_install_uri_and_track_id() {
        for (game_id, expected_steam_id) in
            [("steam-440", "440"), ("steam-owned-1245620", "1245620")]
        {
            let mut opened_uris = Vec::new();

            let result = dispatch_external_launcher_with_open_uri(game_id, |uri| {
                opened_uris.push(uri.to_string());
                Ok(())
            });

            assert_eq!(result.steam_tracker_id.as_deref(), Some(expected_steam_id));
            assert_eq!(result.epic_tracker_id, None);
            assert!(result.is_external_download);
            assert_eq!(
                opened_uris,
                vec![format!("steam://install/{expected_steam_id}")]
            );
            assert_eq!(
                result.external_message,
                "Installation started in Steam. Check Steam for download progress."
            );
        }
    }

    #[test]
    fn steam_slug_rejection_blocks_shell_and_path_like_payloads() {
        for game_id in [
            "steam-123 & calc.exe",
            "steam-owned-../payload",
            "steam-owned-C:\\Games\\payload",
            "steam-owned-foo/bar",
        ] {
            let result = dispatch_external_launcher_with_open_uri(game_id, |_| {
                panic!("rejected Steam payload should not open a URI")
            });

            assert_eq!(result.steam_tracker_id, None);
            assert_eq!(result.epic_tracker_id, None);
            assert!(!result.is_external_download);
            assert!(
                result
                    .external_message
                    .starts_with("Steam install link rejected:"),
                "unexpected message for {game_id:?}: {:?}",
                result.external_message
            );
        }
    }

    #[test]
    fn owned_launcher_slugs_reject_unsafe_payloads() {
        for (game_id, expected_prefix) in [
            ("ea-owned-offer & calc.exe", "EA install link rejected:"),
            ("ubisoft-owned-../payload", "Ubisoft install link rejected:"),
            (
                "battlenet-owned-product;shutdown",
                "Battle.net install link rejected:",
            ),
        ] {
            let result = dispatch_external_launcher_with_open_uri(game_id, |_| {
                panic!("rejected external launcher payload should not open a URI")
            });

            assert_eq!(result.steam_tracker_id, None);
            assert_eq!(result.epic_tracker_id, None);
            assert!(!result.is_external_download);
            assert!(
                result.external_message.starts_with(expected_prefix),
                "unexpected message for {game_id:?}: {:?}",
                result.external_message
            );
        }
    }

    #[test]
    fn safe_ubisoft_owned_id_opens_install_uri() {
        let mut opened_uris = Vec::new();

        let result = dispatch_external_launcher_with_open_uri("ubisoft-owned-635", |uri| {
            opened_uris.push(uri.to_string());
            Ok(())
        });

        assert!(result.is_external_download);
        assert_eq!(opened_uris, vec!["uplay://install/635"]);
        assert_eq!(
            result.external_message,
            "Installation started in Ubisoft Connect. Check Ubisoft Connect for progress."
        );
    }

    #[test]
    fn epic_owned_id_tracks_without_uri_validation_or_opening_uri() {
        let epic_id = "Fortnite/../../payload & still-tracked";
        let game_id = format!("epic-owned-{epic_id}");

        let result = dispatch_external_launcher_with_open_uri(&game_id, |_| {
            panic!("Epic dispatch should only hand off to Legendary tracking")
        });

        assert_eq!(result.steam_tracker_id, None);
        assert_eq!(result.epic_tracker_id.as_deref(), Some(epic_id));
        assert!(result.is_external_download);
        assert_eq!(
            result.external_message,
            "Installation started via Epic Games (Legendary). Check Legendary for progress."
        );
    }

    #[test]
    fn non_external_ids_return_no_external_download() {
        for game_id in ["local-game", "gog-owned-12345", "itch-owned-demo"] {
            let result = dispatch_external_launcher_with_open_uri(game_id, |_| {
                panic!("non-external ids should not open a URI")
            });

            assert_eq!(result.steam_tracker_id, None);
            assert_eq!(result.epic_tracker_id, None);
            assert!(!result.is_external_download);
            assert!(result.external_message.is_empty());
        }
    }

    #[test]
    fn ubisoft_open_failure_does_not_start_external_download() {
        let result = dispatch_external_launcher_with_open_uri("ubisoft-owned-635", |uri| {
            assert_eq!(uri, "uplay://install/635");
            Err("protocol handler is not registered".to_string())
        });

        assert_eq!(result.steam_tracker_id, None);
        assert_eq!(result.epic_tracker_id, None);
        assert!(!result.is_external_download);
        assert_eq!(
            result.external_message,
            "Ubisoft install link failed: protocol handler is not registered"
        );
    }
}
