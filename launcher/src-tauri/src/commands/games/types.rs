use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstalledGame {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub slug: String,
    pub description: String,
    pub version: String,
    #[serde(default)]
    pub launcher: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external_id: Option<String>,
    pub cover_url: Option<String>,
    pub icon_url: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub icon_urls: Vec<String>,
    pub logo_url: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub logo_urls: Vec<String>,
    #[serde(default = "default_logo_position")]
    pub logo_position: LogoPosition,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logo_width_percent: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logo_height_percent: Option<f64>,
    pub status: GameStatus,
    pub platform: Platform,
    pub install_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub executable_path: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub process_names: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub launch_uri: Option<String>,
    #[serde(rename = "lastPlayed", skip_serializing_if = "Option::is_none")]
    pub last_played_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub playtime_minutes: Option<u32>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub genres: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub developer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub publisher: Option<String>,
    #[serde(rename = "releaseDate", skip_serializing_if = "Option::is_none")]
    pub release_date: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub features: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rating: Option<f64>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub achievements: Vec<UnifiedAchievement>,
    #[serde(
        rename = "achievementsSyncedAt",
        skip_serializing_if = "Option::is_none"
    )]
    pub achievements_synced_at: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub achievement_provider_statuses: Vec<AchievementProviderStatus>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub save_files: Vec<SaveFile>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub friends_playing: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UnifiedAchievement {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unlocked_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rarity: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(
        rename = "sourceAchievementId",
        skip_serializing_if = "Option::is_none"
    )]
    pub source_achievement_id: Option<String>,
    #[serde(rename = "providerConfidence", skip_serializing_if = "Option::is_none")]
    pub provider_confidence: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AchievementProviderStatus {
    pub source: String,
    pub status: String,
    pub stability: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SaveFile {
    pub id: String,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub synced_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum GameStatus {
    Installed,
    NotInstalled,
    UpdateAvailable,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum Platform {
    Windows,
    Linux,
    Macos,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub enum LogoPosition {
    BottomLeft,
    UpperCenter,
    CenterCenter,
    BottomCenter,
}

pub fn default_logo_position() -> LogoPosition {
    LogoPosition::BottomLeft
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LogoLayout {
    pub position: LogoPosition,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width_percent: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height_percent: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchGameResponse {
    pub game_id: String,
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyGameFilesResponse {
    pub game_id: String,
    pub checked_files: u32,
    pub missing_files: Vec<String>,
    pub status: VerificationStatus,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairGameFilesResponse {
    pub game_id: String,
    pub success: bool,
    pub game: InstalledGame,
    pub repaired_files: Vec<String>,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckGameUpdatesResponse {
    pub update_count: usize,
    pub games: Vec<InstalledGame>,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallGameUpdateResponse {
    pub game_id: String,
    pub success: bool,
    pub game: InstalledGame,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncGameSavesResponse {
    pub game_id: String,
    pub success: bool,
    pub game: InstalledGame,
    pub synced_files: Vec<String>,
    pub missing_files: Vec<String>,
    pub sync_root: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadGameSavesToCloudResponse {
    pub game_id: String,
    pub success: bool,
    pub game: InstalledGame,
    pub uploaded_files: Vec<String>,
    pub missing_files: Vec<String>,
    pub failed_files: Vec<String>,
    pub message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadGameSavesToCloudRequest {
    pub game_id: String,
    pub supabase_url: String,
    pub api_key: String,
    pub access_token: String,
    pub user_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadGameSavesFromCloudResponse {
    pub game_id: String,
    pub success: bool,
    pub restore_root: String,
    pub downloaded_files: Vec<String>,
    pub failed_files: Vec<String>,
    pub message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadGameSavesFromCloudRequest {
    pub game_id: String,
    pub supabase_url: String,
    pub api_key: String,
    pub access_token: String,
    pub user_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreGameSavesFromCloudResponse {
    pub game_id: String,
    pub success: bool,
    pub restored_files: Vec<String>,
    pub backed_up_files: Vec<String>,
    pub skipped_files: Vec<String>,
    pub failed_files: Vec<String>,
    pub message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreGameSavesFromCloudRequest {
    pub game_id: String,
    pub supabase_url: String,
    pub api_key: String,
    pub access_token: String,
    pub user_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncGameAchievementsResponse {
    pub game_id: String,
    pub success: bool,
    pub game: InstalledGame,
    pub synced_achievements: usize,
    pub unlocked_achievements: usize,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UninstallGameResponse {
    pub game_id: String,
    pub success: bool,
    pub removed_from_library: bool,
    pub game: Option<InstalledGame>,
    pub message: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GameActivityUpdate {
    pub game_id: String,
    pub last_played: Option<String>,
    pub playtime_minutes: Option<u32>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LibraryInventoryChanged {
    pub reason: String,
    pub game_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum VerificationStatus {
    Verified,
    RepairRequired,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddManualGameRequest {
    pub title: String,
    pub install_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateGameMetadataRequest {
    pub game_id: String,
    pub cover_url: Option<String>,
    pub logo_url: Option<String>,
    pub icon_url: Option<String>,
    pub rating: Option<f64>,
    pub achievements: Option<Vec<UnifiedAchievement>>,
    pub save_files: Option<Vec<SaveFile>>,
    pub friends_playing: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAchievementProviderStatusRequest {
    pub game_id: String,
    pub status: AchievementProviderStatus,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RawgAssetCache {
    pub entries: std::collections::HashMap<String, RawgAssets>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RawgAssets {
    pub cover_url: Option<String>,
    pub logo_url: Option<String>,
    pub icon_url: Option<String>,
    pub fetched_at: u64,
}
