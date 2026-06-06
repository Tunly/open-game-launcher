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
id, key, apiKey, achievementId, sourceAchievementId, source_achievement_id, name
```

Display text:

```text
displayName, display_name, title, name, localizedName, localized_name
description, desc, localizedDescription, localized_description
```

Unlocks:

```text
unlockedAt, unlocked_at, unlockTime, unlock_time
unlockTimestamp, unlock_timestamp, dateUnlocked, date_unlocked
unlocked, achieved, completed
```

Media and rarity:

```text
iconUrl, icon_url, icon, imageUrl, image_url, unlockedIconUrl, unlocked_icon_url
rarity, percent, unlockPercentage, unlock_percentage
```

Provider metadata:

```text
source
sourceAchievementId, source_achievement_id
providerConfidence, provider_confidence
```

`providerConfidence` should be one of `official`, `unofficial`, or `local`. For sidecars and scraper output, prefer `local`.

## Merge Behavior

Known unlocks are preserved across later imports using `id`, `source:id`, `source:sourceAchievementId`, and `sourceAchievementId`. A provider returning an empty or failed response does not delete known unlocks.
