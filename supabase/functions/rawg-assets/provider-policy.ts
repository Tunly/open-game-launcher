export type RawgAssetProviderPolicyVerdict = "approved" | "blocked" | "review";

export interface RawgAssetProviderPolicyAsset {
  host: string | null;
  kind: "cover" | "icon";
  reason: string;
  url: string;
  verdict: RawgAssetProviderPolicyVerdict;
}

export interface RawgAssetProviderPolicyEvidence {
  assets: RawgAssetProviderPolicyAsset[];
  policyVersion: "2026-06-12";
  provider: "rawg";
  reason: string;
  sourceId: string | null;
  verdict: RawgAssetProviderPolicyVerdict;
}

export interface RawgAssetProviderPolicyInput {
  coverUrl: string | null;
  gameId: number | null;
  iconUrl: string | null;
}

export function buildRawgAssetProviderPolicyEvidence(
  input: RawgAssetProviderPolicyInput,
): RawgAssetProviderPolicyEvidence {
  const sourceId = input.gameId ? String(input.gameId) : null;
  const assets = [
    buildRawgAssetPolicyAsset("cover", input.coverUrl, sourceId),
    buildRawgAssetPolicyAsset("icon", input.iconUrl, sourceId),
  ].filter((asset): asset is RawgAssetProviderPolicyAsset => Boolean(asset));
  const verdict = getPolicyVerdict(assets);

  return {
    assets,
    policyVersion: "2026-06-12",
    provider: "rawg",
    reason: getPolicyReason(verdict, assets, sourceId),
    sourceId,
    verdict,
  };
}

function buildRawgAssetPolicyAsset(
  kind: RawgAssetProviderPolicyAsset["kind"],
  url: string | null,
  sourceId: string | null,
): RawgAssetProviderPolicyAsset | null {
  if (!url) {
    return null;
  }

  const parsedUrl = parseHttpsUrl(url);
  if (!parsedUrl) {
    return {
      host: null,
      kind,
      reason: "RAWG provider artwork must use HTTPS media URLs.",
      url,
      verdict: "blocked",
    };
  }

  const host = parsedUrl.host.toLowerCase();
  if (host !== "media.rawg.io") {
    return {
      host,
      kind,
      reason: "RAWG provider artwork must come from the RAWG media host.",
      url,
      verdict: "blocked",
    };
  }

  if (!sourceId) {
    return {
      host,
      kind,
      reason: "RAWG media requires a matching RAWG game id before auto-import.",
      url,
      verdict: "review",
    };
  }

  return {
    host,
    kind,
    reason: "RAWG media asset is tied to a RAWG game API result.",
    url,
    verdict: "approved",
  };
}

function getPolicyVerdict(
  assets: RawgAssetProviderPolicyAsset[],
): RawgAssetProviderPolicyVerdict {
  if (assets.some((asset) => asset.verdict === "blocked")) {
    return "blocked";
  }

  if (
    assets.length === 0 || assets.some((asset) => asset.verdict === "review")
  ) {
    return "review";
  }

  return "approved";
}

function getPolicyReason(
  verdict: RawgAssetProviderPolicyVerdict,
  assets: RawgAssetProviderPolicyAsset[],
  sourceId: string | null,
) {
  if (verdict === "approved") {
    return `RAWG artwork is backed by RAWG game ${sourceId} and RAWG media URLs.`;
  }

  if (verdict === "blocked") {
    return "RAWG artwork includes a source URL outside the approved RAWG media policy.";
  }

  return assets.length === 0
    ? "RAWG returned no media assets to evaluate."
    : "RAWG artwork needs review until a RAWG game id ties the media to an API result.";
}

function parseHttpsUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}
