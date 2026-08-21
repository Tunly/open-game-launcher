import type { Game } from "./types";

export type AchievementProviderStatus = NonNullable<Game["achievementProviderStatuses"]>[number];

export {
  getAchievementProviderDisplayName,
  getAchievementProviderStatusLabel,
} from "./achievement-status-labels";

export { getAchievementProviderStatusMessage } from "./achievement-error-copy";
