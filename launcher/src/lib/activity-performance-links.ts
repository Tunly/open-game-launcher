export type ActivityRange = "day" | "week" | "month" | "year";

type PerformanceHistoryRangeParam = "1d" | "7d" | "30d" | "365d";

export function activityRangeToPerformanceRange(
  range: ActivityRange,
): PerformanceHistoryRangeParam {
  if (range === "day") return "1d";
  if (range === "month") return "30d";
  if (range === "year") return "365d";
  return "7d";
}

export function buildPerformanceHistoryPath(range: ActivityRange, gameId?: string): string {
  const params = new URLSearchParams();
  params.set("range", activityRangeToPerformanceRange(range));

  if (gameId) {
    params.set("gameId", gameId);
  }

  params.set("bucket", "auto");
  params.set("source", "activity");

  return `/settings/performance?${params.toString()}#playtime-detail`;
}
