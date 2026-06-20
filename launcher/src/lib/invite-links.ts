export interface InviteLinkOptions {
  gameTitle?: string | null;
  origin?: string | null;
  platform?: string | null;
  token: string;
}

function normalizeToken(token: string) {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new Error("Invite token is required.");
  }
  return trimmed;
}

function addGameParams(params: URLSearchParams, options: InviteLinkOptions) {
  const gameTitle = options.gameTitle?.trim();
  const platform = options.platform?.trim();

  if (gameTitle) params.set("game", gameTitle);
  if (platform) params.set("platform", platform);
  params.set("invite", normalizeToken(options.token));
}

export function buildInviteDeepLink(options: InviteLinkOptions) {
  const params = new URLSearchParams();
  addGameParams(params, options);
  return `oglauncher://join?${params.toString()}`;
}

export function buildInviteFallbackPath(options: InviteLinkOptions) {
  const token = normalizeToken(options.token);
  const params = new URLSearchParams();
  const gameTitle = options.gameTitle?.trim();
  const platform = options.platform?.trim();

  if (gameTitle) params.set("game", gameTitle);
  if (platform) params.set("platform", platform);

  const query = params.toString();
  return `/invite/${encodeURIComponent(token)}${query ? `?${query}` : ""}`;
}

export function buildInviteFallbackUrl(options: InviteLinkOptions) {
  const path = buildInviteFallbackPath(options);
  const configuredOrigin = import.meta.env.VITE_INVITE_FALLBACK_ORIGIN?.trim() || null;
  const origin =
    options.origin ??
    configuredOrigin ??
    (typeof window === "undefined" || !window.location?.origin ? null : window.location.origin);

  if (!origin) return path;

  try {
    return new URL(path, origin).toString();
  } catch {
    return path;
  }
}
