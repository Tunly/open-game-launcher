const XBOX_CATALOG_SUFFIXES = [
  /\s*\((?:pc|windows(?: 10| 11)?|game preview|spielvorschau)\)\s*$/i,
  /\s+(?:for|-)\s+windows(?: 10| 11)?\s*$/i,
];

export function normalizeXboxCatalogTitle(value: string): string {
  let normalized = value.trim();
  let previous: string;
  do {
    previous = normalized;
    for (const suffix of XBOX_CATALOG_SUFFIXES) {
      normalized = normalized.replace(suffix, "").trim();
    }
  } while (normalized !== previous);

  return normalized
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function isProtectedXboxAsset(value?: string): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.replaceAll("\\", "/");
  return /(?:^|\/)(?:program files\/)?windowsapps(?:\/|$)/i.test(normalized);
}

export function preferXboxArtwork(current?: string, candidate?: string): string | undefined {
  if (isUsableXboxArtwork(current)) {
    return current;
  }
  return isUsableXboxArtwork(candidate) ? candidate : undefined;
}

export function mergeXboxArtworkCandidates(
  primary: string | undefined,
  ...candidates: Array<string | undefined>
): string[] {
  return [primary, ...candidates].filter(
    (url, index, values): url is string =>
      isUsableXboxArtwork(url) && values.indexOf(url) === index,
  );
}

export function normalizeXboxStoreProductId(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized && /^[a-z0-9]{12}$/i.test(normalized) ? normalized.toUpperCase() : undefined;
}

function isUsableXboxArtwork(value?: string): value is string {
  if (!value) {
    return false;
  }
  const isAbsoluteLocalPath = /^[a-z]:[\\/]/i.test(value) || /^\\\\/.test(value);
  if (isAbsoluteLocalPath) {
    const normalized = value.replaceAll("\\", "/");
    return !isProtectedXboxAsset(value) && /\/open-game-launcher\/xbox-assets\//i.test(normalized);
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}
