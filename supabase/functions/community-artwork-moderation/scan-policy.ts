export type CommunityArtworkScanVerdict = "blocked" | "needs_review" | "passed";

export interface CommunityArtworkScanInput {
  artist_name?: string | null;
  description?: string | null;
  game_id?: string | null;
  id: string;
  kind?: string | null;
  moderation_status?: string | null;
  report_count?: number | null;
  source_url?: string | null;
  storage_path?: string | null;
  tags?: string[] | null;
  title?: string | null;
}

export interface CommunityArtworkScanPacket {
  metadata: Record<string, unknown>;
  scanner: "policy_v1";
  signals: string[];
  summary: string;
  verdict: CommunityArtworkScanVerdict;
}

const allowedKinds = new Set(["cover", "icon", "logo"]);
const blockedTextPatterns = [
  /\bexplicit\b/i,
  /\bhate\b/i,
  /\bnazi\b/i,
  /\bnsfw\b/i,
  /\bporn\b/i,
  /\bstolen\b/i,
];
const providerReviewHosts = [
  "cdn1.epicgames.com",
  "images.igdb.com",
  "media.rawg.io",
];
const steamStaticHosts = [
  "cdn.cloudflare.steamstatic.com",
  "cdn.akamai.steamstatic.com",
  "shared.cloudflare.steamstatic.com",
];

export function buildCommunityArtworkScanPacket(
  item: CommunityArtworkScanInput,
): CommunityArtworkScanPacket {
  const signals = new Set<string>();
  const sourceUrl = item.source_url?.trim() ?? "";
  const storagePath = item.storage_path?.trim() ?? "";
  const tags = (item.tags ?? []).filter(
    (tag): tag is string => typeof tag === "string",
  );
  const joinedText = [item.title, item.artist_name, item.description, ...tags]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

  if (!allowedKinds.has(item.kind ?? "")) {
    signals.add("invalid-kind");
  }

  if (!isAllowedSource(sourceUrl)) {
    signals.add("unsafe-source-url");
  }

  if (storagePath && !/^[0-9a-f-]+\/games\//i.test(storagePath)) {
    signals.add("storage-path-outside-owner-game-folder");
  }

  if (blockedTextPatterns.some((pattern) => pattern.test(joinedText))) {
    signals.add("blocked-text-signal");
  }

  const providerPolicy = getProviderSourcePolicy(sourceUrl, item.game_id);
  if (providerPolicy.verdict === "approved") {
    signals.add("provider-source-approved");
  } else if (providerPolicy.verdict === "blocked") {
    signals.add("provider-source-mismatch");
  } else if (providerPolicy.verdict === "review") {
    signals.add("provider-source-review");
  }

  if ((item.report_count ?? 0) > 0) {
    signals.add("existing-report-context");
  }

  const sortedSignals = [...signals].sort();
  const verdict = getVerdict(sortedSignals);

  return {
    metadata: {
      policyVersion: "2026-06-12",
      providerPolicy,
      providerReviewHost: providerPolicy.verdict === "review"
        ? providerPolicy.host
        : null,
      reportCount: item.report_count ?? 0,
      sourceKind: storagePath ? "hosted-storage" : getSourceKind(sourceUrl),
    },
    scanner: "policy_v1",
    signals: sortedSignals,
    summary: getSummary(verdict, sortedSignals),
    verdict,
  };
}

function getVerdict(signals: string[]): CommunityArtworkScanVerdict {
  if (
    signals.includes("blocked-text-signal") ||
    signals.includes("invalid-kind") ||
    signals.includes("provider-source-mismatch") ||
    signals.includes("unsafe-source-url") ||
    signals.includes("storage-path-outside-owner-game-folder")
  ) {
    return "blocked";
  }

  if (
    signals.includes("provider-source-review") ||
    signals.includes("existing-report-context")
  ) {
    return "needs_review";
  }

  return "passed";
}

function getSummary(
  verdict: CommunityArtworkScanVerdict,
  signals: string[],
): string {
  if (verdict === "passed") {
    return "Policy scanner found no blocked metadata, source, or provider-risk signals.";
  }

  if (verdict === "blocked") {
    return `Policy scanner blocked the submission for ${signals.join(", ")}.`;
  }

  return `Policy scanner requires moderator review for ${signals.join(", ")}.`;
}

function isAllowedSource(sourceUrl: string): boolean {
  return (
    sourceUrl.startsWith("https://") ||
    sourceUrl.startsWith("/artwork/") ||
    sourceUrl.startsWith("game-artwork/")
  );
}

function getSourceKind(sourceUrl: string): "external" | "local" | "storage" {
  if (sourceUrl.startsWith("/artwork/")) return "local";
  if (sourceUrl.startsWith("game-artwork/")) return "storage";
  return "external";
}

function getProviderSourcePolicy(
  sourceUrl: string,
  gameId?: string | null,
): {
  host: string | null;
  provider: "epic" | "igdb" | "rawg" | "steam" | "unknown";
  reason: string;
  sourceId: string | null;
  verdict: "approved" | "blocked" | "none" | "review";
} {
  try {
    if (!sourceUrl.startsWith("https://")) {
      return {
        host: null,
        provider: "unknown",
        reason: "No provider-hosted source URL.",
        sourceId: null,
        verdict: "none",
      };
    }
    const host = new URL(sourceUrl).host.toLowerCase();
    if (steamStaticHosts.includes(host)) {
      return getSteamProviderSourcePolicy(sourceUrl, host, gameId);
    }
    if (providerReviewHosts.includes(host)) {
      return {
        host,
        provider: getReviewProvider(host),
        reason:
          "Provider-hosted artwork requires explicit API/source evidence before approval.",
        sourceId: null,
        verdict: "review",
      };
    }
    return {
      host,
      provider: "unknown",
      reason: "Source host is not handled by the provider artwork policy.",
      sourceId: null,
      verdict: "none",
    };
  } catch {
    return {
      host: null,
      provider: "unknown",
      reason: "Source URL could not be parsed for provider policy.",
      sourceId: null,
      verdict: "none",
    };
  }
}

function getSteamProviderSourcePolicy(
  sourceUrl: string,
  host: string,
  gameId?: string | null,
): {
  host: string;
  provider: "steam";
  reason: string;
  sourceId: string | null;
  verdict: "approved" | "blocked" | "review";
} {
  const pathname = new URL(sourceUrl).pathname;
  const sourceId = getSteamAppIdFromPath(pathname);
  if (!sourceId) {
    return {
      host,
      provider: "steam",
      reason: "Steam provider URL needs a numeric Steam app id in the path.",
      sourceId: null,
      verdict: "review",
    };
  }

  const expectedAppId = getSteamAppIdFromGameId(gameId);
  if (expectedAppId && expectedAppId !== sourceId) {
    return {
      host,
      provider: "steam",
      reason: "Steam provider URL app id does not match the artwork game id.",
      sourceId,
      verdict: "blocked",
    };
  }

  return {
    host,
    provider: "steam",
    reason: "Steam static artwork path contains an approved Steam app id.",
    sourceId,
    verdict: "approved",
  };
}

function getSteamAppIdFromPath(pathname: string): string | null {
  const match =
    pathname.match(/\/store_item_assets\/steam\/apps\/(\d{1,10})\//) ??
      pathname.match(/\/steam\/apps\/(\d{1,10})\//);
  return match?.[1] ?? null;
}

function getSteamAppIdFromGameId(gameId?: string | null): string | null {
  const value = gameId?.trim() ?? "";
  const match = value.match(/^steam-(\d{1,10})$/) ??
    value.match(/^(\d{1,10})$/);
  return match?.[1] ?? null;
}

function getReviewProvider(host: string): "epic" | "igdb" | "rawg" | "unknown" {
  if (host === "cdn1.epicgames.com") return "epic";
  if (host === "images.igdb.com") return "igdb";
  if (host === "media.rawg.io") return "rawg";
  return "unknown";
}
