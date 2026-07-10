use crate::commands::downloads::types::InternalDownloadSource;

/// The kind of launcher that will provide a download for this
/// game. `External` covers Steam, Epic, EA App, Ubisoft Connect,
/// Battle.net and Xbox App / PC Game Pass. `Internal` covers HTTP(S)
/// downloads served by `internal_download::download_internal_game_file`.
#[derive(Debug, Clone)]
pub enum DownloadLifecycle {
    /// External launcher tracking. The tracker is the live
    /// install/install-poll source. `Other` is the catch-all for
    /// launchers that do not provide a numeric tracker id (EA
    /// App, Ubisoft Connect, Battle.net, Xbox App / PC Game Pass): progress
    /// is detected by polling `detect::scan_*_games` for the new
    /// entry instead.
    External(ExternalTracker),
    /// Internal HTTP(S) download. `source` is the URL/SHA pair
    /// supplied by the caller, or `None` if the game is configured
    /// without a manual download link (legacy / discovery-only
    /// entries).
    Internal {
        source: Option<InternalDownloadSource>,
    },
}

#[derive(Debug, Clone)]
pub enum ExternalTracker {
    /// `steam-owned-<appid>` / `steam-<appid>`. Manifest is
    /// `steamapps/appmanifest_<appid>.acf` polled until the
    /// `StateFlags` reach the fully-installed bit, with
    /// `downloading/<appid>` directory size as the progress
    /// signal.
    Steam(String),
    /// `epic-owned-<legendary_id>`. Spawns the `legendary install
    /// <id> --yes` process and parses its stderr for
    /// `Progress: <pct>%` lines.
    Epic(String),
    /// `ea-owned-`, `ubisoft-owned-`, `battlenet-owned-`,
    /// `xbox-`. The platform already showed a URI to the user
    /// (`origin2://`, `uplay://`, `battlenet://`, `ms-xbox://`).
    /// Progress is detected by polling the relevant
    /// `scan_*_games` and counting consecutive "installed"
    /// observations (>= 2 with at least 10 seconds elapsed).
    #[allow(dead_code)]
    Other { platform: String },
}

impl DownloadLifecycle {
    /// True for any external-launcher lifecycle. Used by the
    /// `ActiveDownload` builder below to pick the right initial
    /// `speed` / `status` / `phase` text.
    pub fn is_external(&self) -> bool {
        matches!(self, DownloadLifecycle::External(_))
    }

    /// The `external` flag value for the `ActiveDownload` struct.
    pub fn external_flag(&self) -> bool {
        self.is_external()
    }

    /// True when the download can be cancelled by the user.
    /// Internal downloads can always be cancelled; Steam external
    /// downloads can be cancelled (CEF toggle); Epic/Other
    /// external downloads are controlled by their own launcher
    /// and not cancelable through our state machine.
    pub fn can_cancel(&self) -> bool {
        !self.is_external()
    }

    /// True when the user can pause/resume through our UI.
    /// Internal downloads can always be paused; Steam external
    /// downloads can be paused through the CEF shim; other
    /// external launchers do not expose a pause signal.
    pub fn can_pause(&self) -> bool {
        match self {
            DownloadLifecycle::Internal { .. } => true,
            DownloadLifecycle::External(ExternalTracker::Steam(_)) => true,
            DownloadLifecycle::External(ExternalTracker::Epic(_))
            | DownloadLifecycle::External(ExternalTracker::Other { .. }) => false,
        }
    }

    /// The "phase" string stored on `ActiveDownload`.
    pub fn phase(&self) -> &'static str {
        match self {
            DownloadLifecycle::Internal { .. } => "download",
            DownloadLifecycle::External(_) => "external",
        }
    }

    /// The initial `status` for the `ActiveDownload`.
    pub fn initial_status(&self) -> &'static str {
        match self {
            DownloadLifecycle::Internal { .. } => "downloading",
            DownloadLifecycle::External(_) => "starting",
        }
    }

    /// The initial `speed` placeholder shown in the UI before
    /// any progress has been reported.
    pub fn initial_speed(&self) -> &'static str {
        match self {
            DownloadLifecycle::Internal { .. } => "Waiting...",
            DownloadLifecycle::External(_) => "Starting external launcher...",
        }
    }
}
