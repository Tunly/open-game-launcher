export type ProviderArtworkSource = "epic" | "igdb" | "rawg" | "steam" | "unknown";

export type ProviderArtworkPolicyVerdict = "approved" | "blocked" | "review";
export type ProviderArtworkCapsStatus = "blocked" | "pass" | "review";
export type ProviderArtworkAssetKind = "cover" | "icon" | "logo";

export interface ProviderArtworkPolicyEvidence {
  host: string | null;
  policyVersion: "2026-06-12";
  provider: ProviderArtworkSource;
  reason: string;
  sourceId: string | null;
  verdict: ProviderArtworkPolicyVerdict;
}

export interface ProviderArtworkPolicyInput {
  height?: number | null;
  kind?: ProviderArtworkAssetKind | null;
  provider?: ProviderArtworkSource | null;
  sizeBytes?: number | null;
  sourceId?: string | null;
  sourceLabel?: string | null;
  url: string;
  width?: number | null;
}

export interface ProviderArtworkCapsRule {
  allowedHosts: string[];
  maxHeight: number;
  maxSizeBytes: number;
  maxWidth: number;
  pathPatternLabel: string;
  provider: Exclude<ProviderArtworkSource, "igdb" | "unknown">;
  providerLabel: string;
  reviewOnly: boolean;
  sourceIdPattern: RegExp;
  sourceIdPatternLabel: string;
}

export interface ProviderArtworkCapsCheck {
  detail: string;
  label: string;
  status: ProviderArtworkCapsStatus;
}

export interface ProviderArtworkCapsReview {
  assetKind: ProviderArtworkAssetKind;
  checks: ProviderArtworkCapsCheck[];
  evidence: ProviderArtworkPolicyEvidence;
  host: string | null;
  provider: ProviderArtworkCapsRule["provider"];
  providerLabel: string;
  reviewOnly: boolean;
  sourceId: string | null;
  status: ProviderArtworkCapsStatus;
  statusLabel: string;
}

export interface ProviderArtworkCapsProof {
  blockedCount: number;
  entries: ProviderArtworkCapsReview[];
  guards: string[];
  passCount: number;
  policyVersion: "2026-06-12";
  reviewCount: number;
  statusLabel: string;
  summary: string;
}

const STEAM_STATIC_HOSTS = new Set([
  "cdn.akamai.steamstatic.com",
  "cdn.cloudflare.steamstatic.com",
  "shared.cloudflare.steamstatic.com",
]);
const REVIEW_HOSTS = new Map<string, ProviderArtworkSource>([
  ["cdn1.epicgames.com", "epic"],
  ["images.igdb.com", "igdb"],
  ["media.rawg.io", "rawg"],
]);

const PROVIDER_ARTWORK_CAPS: Record<ProviderArtworkCapsRule["provider"], ProviderArtworkCapsRule> =
  {
    epic: {
      allowedHosts: ["cdn1.epicgames.com"],
      maxHeight: 2160,
      maxSizeBytes: 5 * 1024 * 1024,
      maxWidth: 3840,
      pathPatternLabel: "/spt-assets/<catalog-id>/... or /offer/<catalog-id>/...",
      provider: "epic",
      providerLabel: "Epic",
      reviewOnly: true,
      sourceIdPattern: /^[a-z0-9][a-z0-9-]{2,80}$/i,
      sourceIdPatternLabel: "Epic catalog item slug/id",
    },
    rawg: {
      allowedHosts: ["media.rawg.io"],
      maxHeight: 2160,
      maxSizeBytes: 6 * 1024 * 1024,
      maxWidth: 3840,
      pathPatternLabel: "/media/<asset-family>/...",
      provider: "rawg",
      providerLabel: "RAWG",
      reviewOnly: false,
      sourceIdPattern: /^\d{1,10}$/,
      sourceIdPatternLabel: "RAWG numeric game id",
    },
    steam: {
      allowedHosts: Array.from(STEAM_STATIC_HOSTS),
      maxHeight: 2160,
      maxSizeBytes: 4 * 1024 * 1024,
      maxWidth: 3840,
      pathPatternLabel: "/store_item_assets/steam/apps/<app-id>/...",
      provider: "steam",
      providerLabel: "Steam",
      reviewOnly: false,
      sourceIdPattern: /^\d{1,10}$/,
      sourceIdPatternLabel: "Steam numeric app id",
    },
  };

const PROVIDER_ARTWORK_CAPS_GUARDS = [
  "Local provider artwork caps only",
  "No provider API calls",
  "No automatic artwork scrape",
  "No community rollout claim",
  "Epic CDN rows stay review-only until provider-approved source evidence exists",
];

export function buildProviderArtworkPolicyEvidence(
  input: ProviderArtworkPolicyInput,
): ProviderArtworkPolicyEvidence {
  const sourceId = normalizeSourceId(input.sourceId);
  const parsedUrl = parseHttpsUrl(input.url);
  if (!parsedUrl) {
    return createEvidence({
      host: null,
      provider: input.provider ?? "unknown",
      reason: "Provider artwork imports require HTTPS source URLs.",
      sourceId,
      verdict: "blocked",
    });
  }

  const host = parsedUrl.host.toLowerCase();
  const provider = input.provider ?? getProviderFromHost(host) ?? "unknown";

  if (provider === "steam" || STEAM_STATIC_HOSTS.has(host)) {
    return getSteamPolicyEvidence(parsedUrl, sourceId);
  }

  if (provider === "rawg" && host === "media.rawg.io" && sourceId) {
    return createEvidence({
      host,
      provider: "rawg",
      reason: "RAWG media asset is tied to an authenticated RAWG game API result.",
      sourceId,
      verdict: "approved",
    });
  }

  if (REVIEW_HOSTS.has(host)) {
    return createEvidence({
      host,
      provider: REVIEW_HOSTS.get(host) ?? provider,
      reason:
        "Provider-hosted artwork requires explicit API/source evidence before automatic import.",
      sourceId,
      verdict: "review",
    });
  }

  return createEvidence({
    host,
    provider,
    reason: "Artwork host is not part of the approved provider artwork policy.",
    sourceId,
    verdict: "blocked",
  });
}

export function buildProviderArtworkCapsReview(
  input: ProviderArtworkPolicyInput,
): ProviderArtworkCapsReview {
  const evidence = buildProviderArtworkPolicyEvidence(input);
  const provider = resolveCapsProvider(evidence.provider, evidence.host);
  const rule = PROVIDER_ARTWORK_CAPS[provider];
  const parsedUrl = parseHttpsUrl(input.url);
  const sourceId = normalizeSourceId(input.sourceId);
  const checks: ProviderArtworkCapsCheck[] = [
    checkHost(evidence.host, rule),
    checkSourceId(sourceId, rule),
    checkPath(parsedUrl?.pathname ?? null, sourceId, rule),
    checkDimensions(input.width, input.height, rule),
    checkSize(input.sizeBytes, rule),
    checkEvidence(evidence, rule),
  ];
  const status = summarizeCapsStatus(checks);

  return {
    assetKind: input.kind ?? "cover",
    checks,
    evidence,
    host: evidence.host,
    provider,
    providerLabel: rule.providerLabel,
    reviewOnly: rule.reviewOnly,
    sourceId,
    status,
    statusLabel:
      status === "blocked"
        ? "Blocked"
        : rule.reviewOnly || status === "review"
          ? "Review only"
          : "Caps passed",
  };
}

export function createProviderArtworkCapsProof(): ProviderArtworkCapsProof {
  const entries = [
    buildProviderArtworkCapsReview({
      height: 215,
      kind: "cover",
      provider: "steam",
      sizeBytes: 98_000,
      sourceId: "440",
      url: "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/440/header.jpg",
      width: 460,
    }),
    buildProviderArtworkCapsReview({
      height: 1080,
      kind: "cover",
      provider: "epic",
      sizeBytes: 420_000,
      sourceId: "mech-arcade-epic",
      url: "https://cdn1.epicgames.com/spt-assets/mech-arcade-epic/offer-image.jpg",
      width: 1920,
    }),
    buildProviderArtworkCapsReview({
      height: 1080,
      kind: "cover",
      provider: "rawg",
      sizeBytes: 550_000,
      sourceId: "3498",
      url: "https://media.rawg.io/media/games/3498/background.jpg",
      width: 1920,
    }),
  ];
  const blockedCount = entries.filter((entry) => entry.status === "blocked").length;
  const reviewCount = entries.filter((entry) => entry.status === "review").length;
  const passCount = entries.filter((entry) => entry.status === "pass").length;

  return {
    blockedCount,
    entries,
    guards: [...PROVIDER_ARTWORK_CAPS_GUARDS],
    passCount,
    policyVersion: "2026-06-12",
    reviewCount,
    statusLabel: blockedCount > 0 ? "Caps blocked" : reviewCount > 0 ? "Caps review" : "Caps pass",
    summary:
      "Steam, RAWG, and Epic artwork candidates are checked against local host, source-id, path, pixel, and byte caps; Epic remains review-only without provider API approval.",
  };
}

function getSteamPolicyEvidence(url: URL, sourceId: string | null): ProviderArtworkPolicyEvidence {
  const host = url.host.toLowerCase();
  const appId = getSteamAppIdFromPath(url.pathname);
  if (!STEAM_STATIC_HOSTS.has(host)) {
    return createEvidence({
      host,
      provider: "steam",
      reason: "Steam artwork must come from an approved Steam static CDN host.",
      sourceId,
      verdict: "blocked",
    });
  }

  if (!appId) {
    return createEvidence({
      host,
      provider: "steam",
      reason: "Steam static artwork path must include a numeric app id.",
      sourceId,
      verdict: "review",
    });
  }

  if (sourceId && sourceId !== appId) {
    return createEvidence({
      host,
      provider: "steam",
      reason: "Steam static artwork app id does not match the selected game.",
      sourceId,
      verdict: "blocked",
    });
  }

  return createEvidence({
    host,
    provider: "steam",
    reason: "Steam static artwork path matches an approved Steam app id source.",
    sourceId: sourceId ?? appId,
    verdict: "approved",
  });
}

function getSteamAppIdFromPath(pathname: string): string | null {
  const match =
    pathname.match(/\/store_item_assets\/steam\/apps\/(\d{1,10})\//) ??
    pathname.match(/\/steam\/apps\/(\d{1,10})\//);
  return match?.[1] ?? null;
}

function resolveCapsProvider(
  provider: ProviderArtworkSource,
  host: string | null,
): ProviderArtworkCapsRule["provider"] {
  if (provider === "steam" || provider === "epic" || provider === "rawg") return provider;
  if (host && STEAM_STATIC_HOSTS.has(host)) return "steam";
  if (host === "cdn1.epicgames.com") return "epic";
  if (host === "media.rawg.io") return "rawg";
  return "epic";
}

function checkHost(host: string | null, rule: ProviderArtworkCapsRule): ProviderArtworkCapsCheck {
  const pass = Boolean(host && rule.allowedHosts.includes(host));
  return {
    detail: pass
      ? `${host} is inside the ${rule.providerLabel} local host allowlist.`
      : `Expected ${rule.allowedHosts.join(" or ")} for ${rule.providerLabel} artwork.`,
    label: "Host",
    status: pass ? "pass" : "blocked",
  };
}

function checkSourceId(
  sourceId: string | null,
  rule: ProviderArtworkCapsRule,
): ProviderArtworkCapsCheck {
  const pass = Boolean(sourceId && rule.sourceIdPattern.test(sourceId));
  return {
    detail: pass
      ? `${sourceId} matches ${rule.sourceIdPatternLabel}.`
      : `Source ID must match ${rule.sourceIdPatternLabel}.`,
    label: "Source ID",
    status: pass ? "pass" : "review",
  };
}

function checkPath(
  pathname: string | null,
  sourceId: string | null,
  rule: ProviderArtworkCapsRule,
): ProviderArtworkCapsCheck {
  const normalized = pathname ?? "";
  const pass =
    rule.provider === "steam"
      ? Boolean(getSteamAppIdFromPath(normalized))
      : rule.provider === "rawg"
        ? normalized.startsWith("/media/")
        : Boolean(
            sourceId &&
            (normalized.startsWith(`/spt-assets/${sourceId}/`) ||
              normalized.startsWith(`/offer/${sourceId}/`)),
          );

  return {
    detail: pass
      ? `${rule.providerLabel} path matches ${rule.pathPatternLabel}.`
      : `${rule.providerLabel} path must match ${rule.pathPatternLabel}.`,
    label: "Path",
    status: pass ? "pass" : "blocked",
  };
}

function checkDimensions(
  width: number | null | undefined,
  height: number | null | undefined,
  rule: ProviderArtworkCapsRule,
): ProviderArtworkCapsCheck {
  const hasDimensions = typeof width === "number" && typeof height === "number";
  if (!hasDimensions) {
    return {
      detail: `Dimensions must be known and <= ${rule.maxWidth}x${rule.maxHeight}.`,
      label: "Pixels",
      status: "review",
    };
  }

  const pass = width > 0 && height > 0 && width <= rule.maxWidth && height <= rule.maxHeight;

  return {
    detail: pass
      ? `${width}x${height} fits ${rule.maxWidth}x${rule.maxHeight}.`
      : `Dimensions must be known and <= ${rule.maxWidth}x${rule.maxHeight}.`,
    label: "Pixels",
    status: pass ? "pass" : "blocked",
  };
}

function checkSize(
  sizeBytes: number | null | undefined,
  rule: ProviderArtworkCapsRule,
): ProviderArtworkCapsCheck {
  if (typeof sizeBytes !== "number") {
    return {
      detail: `Byte size must be known and <= ${rule.maxSizeBytes}.`,
      label: "Bytes",
      status: "review",
    };
  }

  const pass = typeof sizeBytes === "number" && sizeBytes > 0 && sizeBytes <= rule.maxSizeBytes;
  return {
    detail: pass
      ? `${sizeBytes} bytes fits ${rule.maxSizeBytes} byte cap.`
      : `Byte size must be known and <= ${rule.maxSizeBytes}.`,
    label: "Bytes",
    status: pass ? "pass" : "blocked",
  };
}

function checkEvidence(
  evidence: ProviderArtworkPolicyEvidence,
  rule: ProviderArtworkCapsRule,
): ProviderArtworkCapsCheck {
  if (evidence.verdict === "blocked") {
    return {
      detail: evidence.reason,
      label: "Policy",
      status: "blocked",
    };
  }

  return {
    detail: rule.reviewOnly
      ? `${rule.providerLabel} caps are local review only; provider API approval is still required.`
      : evidence.reason,
    label: "Policy",
    status: rule.reviewOnly || evidence.verdict === "review" ? "review" : "pass",
  };
}

function summarizeCapsStatus(checks: ProviderArtworkCapsCheck[]): ProviderArtworkCapsStatus {
  if (checks.some((check) => check.status === "blocked")) return "blocked";
  if (checks.some((check) => check.status === "review")) return "review";
  return "pass";
}

function parseHttpsUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function getProviderFromHost(host: string): ProviderArtworkSource | null {
  if (STEAM_STATIC_HOSTS.has(host)) return "steam";
  return REVIEW_HOSTS.get(host) ?? null;
}

function normalizeSourceId(sourceId?: string | null): string | null {
  const value = sourceId?.trim();
  return value ? value : null;
}

function createEvidence(
  evidence: Omit<ProviderArtworkPolicyEvidence, "policyVersion">,
): ProviderArtworkPolicyEvidence {
  return {
    ...evidence,
    policyVersion: "2026-06-12",
  };
}
