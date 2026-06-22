# Achievement Sidecar Import

OG Launcher can import best-effort achievement data without developer API keys. External tools may write JSON files to the launcher cache or next to an installed game.

## Supported Paths

Central cache:

```text
<launcher-data>/achievement-cache/<provider>/<game-id>.json
<launcher-data>/achievement-cache/<provider>/<external-id>.json
<launcher-data>/achievement-cache/local/<game-id>.json
```

Game folder sidecars:

```text
<install-dir>/og-achievements.json
<install-dir>/achievements.json
<install-dir>/<provider>-achievements.json
<install-dir>/.og-launcher/og-achievements.json
<install-dir>/.og-launcher/achievements.json
<install-dir>/.og-launcher/<provider>-achievements.json
```

Supported providers for local import: `gog`, `epic`, `ea`, `ubisoft`, `battlenet`.

## Array Format

```json
{
  "source": "local-scraper",
  "achievements": [
    {
      "id": "story_start",
      "name": "Story Start",
      "description": "Begin the campaign",
      "iconUrl": "https://example.test/story.png",
      "unlockedAt": "2026-01-01T00:00:00Z",
      "rarity": 12.5,
      "source": "gog",
      "sourceAchievementId": "story_start",
      "providerConfidence": "local"
    }
  ]
}
```

## Map Format

The map key is used as `id` and `sourceAchievementId` when the entry omits them.

```json
{
  "achievements": {
    "story_start": {
      "name": "Story Start",
      "description": "Begin the campaign",
      "unlocked": true,
      "rarity": "12.5%",
      "provider_confidence": "local"
    }
  }
}
```

## Accepted Fields

IDs:

```text
id, key, apiKey, achievementId, achievement_id, achievementCode, achievement_code
achievementKey, achievement_key
achievementName, achievement_name, statId, stat_id, statName, stat_name
challengeId, challenge_id, challengeName, challenge_name
actionId, action_id, actionName, action_name, clubActionId, club_action_id
clubActionName, club_action_name, objectiveId, objective_id, criteriaId, criteria_id
trophyId, trophy_id, medalId, medal_id, uid, code
sourceAchievementId, source_achievement_id, name
```

For GOG/Galaxy-shaped sidecars, `achievementKey`/`achievement_key` is preferred over
`achievementId`/`achievement_id` because the GOG API also uses the key as the stable merge id.

Display text:

```text
displayName, display_name, displayText, display_text, displayTitle, display_title
achievementTitle, achievement_title, title, label, statName, stat_name
challengeName, challenge_name, actionName, action_name, clubActionName, club_action_name, name
localizedTitle, localized_title, localizedName, localized_name
description, desc, summary, details, displayDescription, display_description
localizedDescription, localized_description
```

Unlocks:

```text
unlockedAt, unlocked_at, unlockTime, unlock_time
unlockDate, unlock_date, unlockTimestamp, unlock_timestamp, dateUnlocked, date_unlocked
earnedAt, earned_at, completedAt, completed_at, completionTime, completion_time
grantDate, grant_date, timestamp, updatedAt, updated_at
unlocked, isUnlocked, is_unlocked, achieved, completed, earned
isAchieved, is_achieved, isComplete, is_complete, complete
isEarned, is_earned, isCompleted, is_completed, claimed, isClaimed, is_claimed
status, state, unlockState, unlock_state, completionState, completion_state, grantState, grant_state
```

Unlock status strings such as `unlocked`, `achieved`, `complete`, `done`, `granted`, and
`claimed` are treated as unlocked in local best-effort imports.

Media and rarity:

```text
iconUrl, icon_url, icon, imageUrl, image_url, unlockedIconUrl, unlocked_icon_url
badgeUrl, badge_url, tileUrl, tile_url, thumbnailUrl, thumbnail_url
imageUrlUnlocked, image_url_unlocked, imageUrlLocked, image_url_locked
rarity, percent, unlockPercentage, unlock_percentage
percentComplete, percent_complete, completionPercent, completion_percent
progressPercent, progress_percent
```

Provider metadata:

```text
source
sourceAchievementId, source_achievement_id
providerConfidence, provider_confidence
```

`providerConfidence` should be one of `official`, `unofficial`, or `local`. For sidecars and scraper output, prefer `local`.

## Provider-Shaped Examples

EA App stats-shaped cache:

```json
{
  "offerId": "offer-123",
  "achievementStats": {
    "items": [
      {
        "statId": "ACH_STORY_START",
        "displayText": "Story Start",
        "description": "Begin the campaign",
        "isEarned": true,
        "earnedAt": "2026-01-01T00:00:00Z",
        "completionPercent": "12.5%",
        "badgeUrl": "https://example.test/ea/story.png"
      }
    ]
  }
}
```

Ubisoft challenge-shaped cache:

```json
{
  "challenges": [
    {
      "challengeId": "ubi_story_01",
      "localizedTitle": "Welcome to DedSec",
      "displayDescription": "Complete the opening operation.",
      "completionState": "GRANTED",
      "completedAt": "2026-06-08T19:00:00Z"
    }
  ]
}
```

Battle.net criteria-shaped cache:

```json
{
  "progress": {
    "criteria": [
      {
        "criteriaId": "bn_raid_clear",
        "label": "Raid Night",
        "details": "Clear a raid wing.",
        "state": "DONE",
        "updatedAt": "2026-06-08T20:00:00Z"
      }
    ]
  }
}
```

## Merge Behavior

Known unlocks are preserved across later imports using `id`, `source:id`, `source:sourceAchievementId`, and `sourceAchievementId`. A provider returning an empty or failed response does not delete known unlocks.
