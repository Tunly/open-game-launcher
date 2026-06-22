export type InviteHostedProofParseResult =
  | {
      args: {
        token_input: string;
      };
      status: "ok";
      token: string;
      tokenHint: string;
    }
  | {
      error: string;
      status: "error";
      statusCode: number;
    };

export interface InviteHostedProofRow {
  game_invite_id: string;
  game_title: string;
  invite_status: string;
  max_uses: number | null;
  platform: string | null;
  replay_denied: boolean;
  used_at: string | null;
  uses_count: number;
}

export interface InviteHostedProofPacket {
  checkedAt: string;
  deploymentScope: "hosted-staging";
  gameInviteId: string;
  gameTitle: string;
  guards: string[];
  inviteStatus: string;
  maxUses: number | null;
  origin: string;
  originVerified: boolean;
  platform: string | null;
  replayDenied: boolean;
  replayError: string;
  tokenHint: string;
  usedAt: string | null;
  usesCount: number;
}

export const inviteHostedProofCorsMethods = "OPTIONS, POST";
export const inviteHostedProofCorsHeaders =
  "authorization, x-client-info, apikey, content-type";

const INVITE_HOSTED_PROOF_GUARDS = [
  "Allowed HTTPS Origin only",
  "Authenticated receiver or sender",
  "No raw token echoed",
  "No token hash returned",
  "Second redeem rejected",
  "No production deployment claim",
];

export function parseInviteHostedProofRequest(
  body: unknown,
): InviteHostedProofParseResult {
  const record = readRecord(body);
  if (!record) {
    return errorResult("Request body must be a JSON object.");
  }

  const token = cleanShareToken(record.token ?? record.token_input);
  if (!token) {
    return errorResult("Invite share token is required.");
  }

  return {
    args: { token_input: token },
    status: "ok",
    token,
    tokenHint: buildShareTokenHint(token),
  };
}

export function parseInviteHostedProofAllowedOrigins(value: string | null | undefined) {
  return Array.from(
    new Set(
      (value ?? "")
        .split(",")
        .map((origin) => normalizeHttpsOrigin(origin))
        .filter((origin): origin is string => Boolean(origin)),
    ),
  );
}

export function verifyInviteHostedProofOrigin(input: {
  allowedOrigins: string[];
  origin: string | null;
}):
  | {
      origin: string;
      status: "ok";
    }
  | {
      error: string;
      status: "error";
      statusCode: number;
    } {
  const origin = normalizeHttpsOrigin(input.origin);
  if (!origin) {
    return errorResult("Hosted proof requires an HTTPS Origin header.", 403);
  }
  if (!input.allowedOrigins.includes(origin)) {
    return errorResult("Origin is not allowed for invite hosted proof.", 403);
  }

  return { origin, status: "ok" };
}

export function buildInviteHostedProofCorsHeaders(
  origin: string | null,
  allowedOrigins: string[],
) {
  const verified = verifyInviteHostedProofOrigin({ allowedOrigins, origin });
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": inviteHostedProofCorsHeaders,
    "Access-Control-Allow-Methods": inviteHostedProofCorsMethods,
    Vary: "Origin",
  };

  if (verified.status === "ok") {
    headers["Access-Control-Allow-Origin"] = verified.origin;
  }

  return headers;
}

export function buildInviteHostedProofPacket(input: {
  checkedAt: string;
  origin: string;
  proof: InviteHostedProofRow;
  replayError: string;
  tokenHint: string;
}): InviteHostedProofPacket {
  return {
    checkedAt: input.checkedAt,
    deploymentScope: "hosted-staging",
    gameInviteId: input.proof.game_invite_id,
    gameTitle: input.proof.game_title,
    guards: [...INVITE_HOSTED_PROOF_GUARDS],
    inviteStatus: input.proof.invite_status,
    maxUses: input.proof.max_uses,
    origin: input.origin,
    originVerified: true,
    platform: input.proof.platform,
    replayDenied: input.proof.replay_denied,
    replayError: sanitizeReplayError(input.replayError),
    tokenHint: input.tokenHint,
    usedAt: input.proof.used_at,
    usesCount: input.proof.uses_count,
  };
}

export function buildShareTokenHint(token: string) {
  const trimmed = token.trim();
  if (trimmed.length <= 18) return `${trimmed.slice(0, 6)}...`;
  return `${trimmed.slice(0, 10)}...${trimmed.slice(-6)}`;
}

function errorResult(
  error: string,
  statusCode = 400,
): InviteHostedProofParseResult & { status: "error" } {
  return { error, status: "error", statusCode };
}

function cleanShareToken(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 4096) return null;
  return trimmed;
}

function normalizeHttpsOrigin(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function sanitizeReplayError(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 240) : "Invite token is not redeemable.";
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
