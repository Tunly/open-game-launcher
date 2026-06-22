export type InviteHostedReadinessStatus = "blocked" | "ready" | "warning";

export type InviteRedeemState = "accepted" | "error" | "idle" | "loading";

export type InviteHostedReplayProofState = "idle" | "loading" | "unavailable" | "verified";

export type InviteHostedReadinessRowId =
  | "deep-link"
  | "hosted-web"
  | "receiver-auth"
  | "share-rpc"
  | "web-fallback";

export type InviteHostedReplayProofRowId =
  | "hosted-origin"
  | "consumed-token"
  | "replay-denial"
  | "sanitized-proof"
  | "deployment-scope";

export type InviteHostedStagingStepId =
  | "create-token"
  | "receiver-auth"
  | "redeem-token"
  | "replay-guard"
  | "resolve-token";

export type InviteLookupState = "idle" | "loading" | "missing" | "resolved";

export interface InviteHostedReadinessInput {
  hasConfiguredHostedOrigin: boolean;
  hostedVerified: boolean;
  isSignedIn: boolean;
  isSupabaseConfigured: boolean;
  lookupState: InviteLookupState;
  token: string;
}

export interface InviteHostedReadinessRow {
  detail: string;
  id: InviteHostedReadinessRowId;
  label: string;
  status: InviteHostedReadinessStatus;
}

export interface InviteHostedReadiness {
  blocker: InviteHostedReadinessRow | null;
  progress: number;
  rows: InviteHostedReadinessRow[];
  statusLabel: "Blocked" | "Needs hosted web" | "Ready";
  tone: InviteHostedReadinessStatus;
}

export interface InviteHostedStagingInput {
  isSignedIn: boolean;
  isSupabaseConfigured: boolean;
  lookupState: InviteLookupState;
  redeemState: InviteRedeemState;
  token: string;
}

export interface InviteHostedReplayProofEvidence {
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

export interface InviteHostedReplayProofInput {
  configuredHostedOrigin: string;
  isSignedIn: boolean;
  isSupabaseConfigured: boolean;
  proof: InviteHostedReplayProofEvidence | null;
  proofState: InviteHostedReplayProofState;
  redeemState: InviteRedeemState;
  token: string;
}

export interface InviteHostedStagingStep {
  detail: string;
  id: InviteHostedStagingStepId;
  label: string;
  status: InviteHostedReadinessStatus;
}

export interface InviteHostedStagingRehearsal {
  guards: string[];
  progress: number;
  statusLabel: "Accepted locally" | "Blocked" | "Rehearsal pending";
  steps: InviteHostedStagingStep[];
  summary: string;
  tone: InviteHostedReadinessStatus;
}

export interface InviteHostedReplayProofRow {
  detail: string;
  id: InviteHostedReplayProofRowId;
  label: string;
  status: InviteHostedReadinessStatus;
}

export interface InviteHostedReplayProofReadiness {
  checkedAt: string | null;
  guards: string[];
  origin: string | null;
  progress: number;
  rows: InviteHostedReplayProofRow[];
  statusLabel: "Blocked" | "Checking" | "Proof captured" | "Proof pending";
  summary: string;
  tokenHint: string | null;
  tone: InviteHostedReadinessStatus;
}

const INVITE_HOSTED_STAGING_GUARDS = [
  "No raw token stored",
  "No anonymous invite row read",
  "No hosted web success claim",
  "No replay accepted",
];

const INVITE_HOSTED_REPLAY_PROOF_GUARDS = [
  "Allowed HTTPS Origin only",
  "Authenticated receiver or sender",
  "No raw token echoed",
  "No token hash returned",
  "Second redeem rejected",
  "No production deployment claim",
];

export function getInviteHostedReadiness(input: InviteHostedReadinessInput): InviteHostedReadiness {
  const hasToken = input.token.trim().length > 0;
  const rows: InviteHostedReadinessRow[] = [
    webFallbackRow(hasToken),
    deepLinkRow(hasToken),
    shareRpcRow(input.isSupabaseConfigured, input.lookupState),
    receiverAuthRow(input.isSignedIn, input.lookupState),
    hostedWebRow(input.hasConfiguredHostedOrigin, input.hostedVerified),
  ];
  const blocker = rows.find((row) => row.status === "blocked") ?? null;
  const hasWarning = rows.some((row) => row.status === "warning");
  const readyCount = rows.filter((row) => row.status === "ready").length;
  const tone = blocker ? "blocked" : hasWarning ? "warning" : "ready";

  return {
    blocker,
    progress: Math.round((readyCount / rows.length) * 100),
    rows,
    statusLabel: tone === "ready" ? "Ready" : tone === "warning" ? "Needs hosted web" : "Blocked",
    tone,
  };
}

export function getInviteHostedReplayProofReadiness(
  input: InviteHostedReplayProofInput,
): InviteHostedReplayProofReadiness {
  const hasToken = input.token.trim().length > 0;
  const hasConfiguredOrigin = input.configuredHostedOrigin.trim().startsWith("https://");
  const proofValid = Boolean(
    input.proof?.originVerified &&
    input.proof.replayDenied &&
    input.proof.deploymentScope === "hosted-staging",
  );
  const rows: InviteHostedReplayProofRow[] = [
    hostedOriginProofRow(input, hasConfiguredOrigin, proofValid),
    consumedTokenProofRow(input.proof, input.redeemState, proofValid),
    replayDenialProofRow(input.proof, input.proofState, proofValid),
    sanitizedProofRow(input.proof, proofValid),
    deploymentScopeProofRow(input.proof, proofValid),
  ];
  const hasBlocker =
    !hasToken || (!proofValid && (!input.isSupabaseConfigured || !hasConfiguredOrigin));
  const readyCount = rows.filter((row) => row.status === "ready").length;
  const tone: InviteHostedReadinessStatus = hasBlocker
    ? "blocked"
    : proofValid
      ? "ready"
      : "warning";
  const statusLabel =
    tone === "blocked"
      ? "Blocked"
      : input.proofState === "loading"
        ? "Checking"
        : proofValid
          ? "Proof captured"
          : "Proof pending";

  return {
    checkedAt: input.proof?.checkedAt ?? null,
    guards: [...new Set([...INVITE_HOSTED_REPLAY_PROOF_GUARDS, ...(input.proof?.guards ?? [])])],
    origin:
      input.proof?.origin ?? (hasConfiguredOrigin ? input.configuredHostedOrigin.trim() : null),
    progress: Math.round((readyCount / rows.length) * 100),
    rows,
    statusLabel,
    summary: proofValid
      ? "Hosted staging proof packet captured an allowed Origin and a rejected second redeem without echoing the raw token."
      : input.proofState === "loading"
        ? "Hosted replay/origin proof is checking the consumed-token state through the staging Edge Function."
        : "Hosted replay/origin proof waits for a configured HTTPS origin, signed-in receiver, accepted token, and a rejected second redeem.",
    tokenHint: input.proof?.tokenHint ?? null,
    tone,
  };
}

export function getInviteHostedStagingRehearsal(
  input: InviteHostedStagingInput,
): InviteHostedStagingRehearsal {
  const hasToken = input.token.trim().length > 0;
  const steps: InviteHostedStagingStep[] = [
    createTokenStep(input.isSupabaseConfigured, input.token),
    resolveTokenStep(input.isSupabaseConfigured, hasToken, input.lookupState),
    receiverAuthStep(input.isSignedIn, input.lookupState),
    redeemTokenStep(input),
    replayGuardStep(input.redeemState),
  ];
  const hasBlocker = steps.some((step) => step.status === "blocked");
  const hasWarning = steps.some((step) => step.status === "warning");
  const readyCount = steps.filter((step) => step.status === "ready").length;
  const tone = hasBlocker ? "blocked" : hasWarning ? "warning" : "ready";
  const statusLabel =
    tone === "blocked"
      ? "Blocked"
      : input.redeemState === "accepted"
        ? "Accepted locally"
        : "Rehearsal pending";

  return {
    guards: [...INVITE_HOSTED_STAGING_GUARDS],
    progress: Math.round((readyCount / steps.length) * 100),
    statusLabel,
    steps,
    summary:
      input.redeemState === "accepted"
        ? "Local staged evidence covers create, resolve, receiver auth, redeem, and replay guard review; hosted deployment proof is still external."
        : "Local staged evidence tracks the hosted share-token path without creating a live hosted success claim.",
    tone,
  };
}

function webFallbackRow(hasToken: boolean): InviteHostedReadinessRow {
  if (!hasToken) {
    return {
      detail: "Invite route is missing a token segment.",
      id: "web-fallback",
      label: "Web Fallback",
      status: "blocked",
    };
  }

  return {
    detail: "Fallback route can render the share token without exposing server secrets.",
    id: "web-fallback",
    label: "Web Fallback",
    status: "ready",
  };
}

function deepLinkRow(hasToken: boolean): InviteHostedReadinessRow {
  if (!hasToken) {
    return {
      detail: "Launcher deep link cannot be built without a token.",
      id: "deep-link",
      label: "App Deep Link",
      status: "blocked",
    };
  }

  return {
    detail: "oglauncher://join keeps game context in query params and preserves the token.",
    id: "deep-link",
    label: "App Deep Link",
    status: "ready",
  };
}

function shareRpcRow(
  isSupabaseConfigured: boolean,
  lookupState: InviteLookupState,
): InviteHostedReadinessRow {
  if (!isSupabaseConfigured) {
    return {
      detail: "Supabase is not configured, so hosted share-token lookup is unavailable.",
      id: "share-rpc",
      label: "Share RPC",
      status: "blocked",
    };
  }
  if (lookupState === "resolved") {
    return {
      detail: "Share token resolved through the server RPC with game/platform context.",
      id: "share-rpc",
      label: "Share RPC",
      status: "ready",
    };
  }
  if (lookupState === "loading") {
    return {
      detail: "Share-token lookup is in flight.",
      id: "share-rpc",
      label: "Share RPC",
      status: "warning",
    };
  }

  return {
    detail: "Share token has not resolved yet, or the local schema/row is missing.",
    id: "share-rpc",
    label: "Share RPC",
    status: "warning",
  };
}

function receiverAuthRow(
  isSignedIn: boolean,
  lookupState: InviteLookupState,
): InviteHostedReadinessRow {
  if (isSignedIn && lookupState === "resolved") {
    return {
      detail: "Signed-in receiver can attempt the one-use redeem RPC.",
      id: "receiver-auth",
      label: "Receiver Auth",
      status: "ready",
    };
  }

  return {
    detail: isSignedIn
      ? "Receiver is signed in; redeem waits for a resolved server token."
      : "Receiver must sign in before accepting the hosted share token.",
    id: "receiver-auth",
    label: "Receiver Auth",
    status: "warning",
  };
}

function hostedWebRow(
  hasConfiguredHostedOrigin: boolean,
  hostedVerified: boolean,
): InviteHostedReadinessRow {
  if (!hasConfiguredHostedOrigin) {
    return {
      detail: "Set VITE_INVITE_FALLBACK_ORIGIN to the hosted web origin before staging.",
      id: "hosted-web",
      label: "Hosted Web",
      status: "blocked",
    };
  }
  if (!hostedVerified) {
    return {
      detail:
        "Hosted fallback origin is configured, but an end-to-end staging run is still needed.",
      id: "hosted-web",
      label: "Hosted Web",
      status: "warning",
    };
  }

  return {
    detail: "Hosted web fallback and token redeem path have staging verification evidence.",
    id: "hosted-web",
    label: "Hosted Web",
    status: "ready",
  };
}

function createTokenStep(isSupabaseConfigured: boolean, token: string): InviteHostedStagingStep {
  if (!isSupabaseConfigured) {
    return {
      detail: "Supabase is not configured, so create_game_invite_share_token cannot be staged.",
      id: "create-token",
      label: "Create Share Token",
      status: "blocked",
    };
  }
  if (isSignedShareTokenEnvelope(token)) {
    return {
      detail:
        "Signed share-token envelope is present; plaintext token remains route-only and is not stored.",
      id: "create-token",
      label: "Create Share Token",
      status: "ready",
    };
  }
  if (token.trim().length > 0) {
    return {
      detail:
        "Route token exists, but a signed create_game_invite_share_token envelope is still needed for hosted staging.",
      id: "create-token",
      label: "Create Share Token",
      status: "warning",
    };
  }

  return {
    detail: "Invite route is missing the share token produced by the create RPC.",
    id: "create-token",
    label: "Create Share Token",
    status: "blocked",
  };
}

function resolveTokenStep(
  isSupabaseConfigured: boolean,
  hasToken: boolean,
  lookupState: InviteLookupState,
): InviteHostedStagingStep {
  if (!isSupabaseConfigured || !hasToken) {
    return {
      detail: "resolve_share_token waits for Supabase config and a route token.",
      id: "resolve-token",
      label: "Resolve Share Token",
      status: "blocked",
    };
  }
  if (lookupState === "resolved") {
    return {
      detail:
        "resolve_share_token returned game/platform context without exposing game_invites rows.",
      id: "resolve-token",
      label: "Resolve Share Token",
      status: "ready",
    };
  }
  if (lookupState === "loading") {
    return {
      detail: "resolve_share_token is in flight.",
      id: "resolve-token",
      label: "Resolve Share Token",
      status: "warning",
    };
  }

  return {
    detail: "resolve_share_token has no verified hosted row yet; fallback context remains local.",
    id: "resolve-token",
    label: "Resolve Share Token",
    status: "warning",
  };
}

function receiverAuthStep(
  isSignedIn: boolean,
  lookupState: InviteLookupState,
): InviteHostedStagingStep {
  if (isSignedIn && lookupState === "resolved") {
    return {
      detail: "Signed-in receiver can claim the resolved one-use share token.",
      id: "receiver-auth",
      label: "Receiver Auth",
      status: "ready",
    };
  }

  return {
    detail: isSignedIn
      ? "Receiver auth is present, but token resolve must pass before redeem."
      : "Receiver sign-in is required before redeem_share_token can run.",
    id: "receiver-auth",
    label: "Receiver Auth",
    status: "warning",
  };
}

function redeemTokenStep(input: InviteHostedStagingInput): InviteHostedStagingStep {
  if (!input.isSupabaseConfigured || input.token.trim().length === 0) {
    return {
      detail: "redeem_share_token waits for Supabase config and a route token.",
      id: "redeem-token",
      label: "Redeem Token",
      status: "blocked",
    };
  }
  if (input.redeemState === "accepted") {
    return {
      detail: "redeem_share_token accepted the staged token for the signed-in receiver.",
      id: "redeem-token",
      label: "Redeem Token",
      status: "ready",
    };
  }
  if (input.redeemState === "error") {
    return {
      detail: "redeem_share_token rejected the token; keep this as failed hosted-staging evidence.",
      id: "redeem-token",
      label: "Redeem Token",
      status: "warning",
    };
  }

  return {
    detail:
      input.isSignedIn && input.lookupState === "resolved"
        ? "Accept Invite can run redeem_share_token for the signed-in receiver."
        : "Redeem waits for a signed-in receiver and resolved token.",
    id: "redeem-token",
    label: "Redeem Token",
    status: "warning",
  };
}

function replayGuardStep(redeemState: InviteRedeemState): InviteHostedStagingStep {
  if (redeemState === "accepted") {
    return {
      detail: "One-use claim path is staged; replay must remain rejected by consumed-token checks.",
      id: "replay-guard",
      label: "Replay Guard",
      status: "ready",
    };
  }

  return {
    detail: "Replay denial remains pending until a redeem attempt has been staged.",
    id: "replay-guard",
    label: "Replay Guard",
    status: "warning",
  };
}

function hostedOriginProofRow(
  input: InviteHostedReplayProofInput,
  hasConfiguredOrigin: boolean,
  proofValid: boolean,
): InviteHostedReplayProofRow {
  if (!hasConfiguredOrigin) {
    return {
      detail: "Set VITE_INVITE_FALLBACK_ORIGIN to the hosted HTTPS origin before replay proof.",
      id: "hosted-origin",
      label: "Hosted Origin",
      status: "blocked",
    };
  }
  if (proofValid && input.proof?.originVerified) {
    return {
      detail: `Allowed browser Origin matched ${input.proof.origin}.`,
      id: "hosted-origin",
      label: "Hosted Origin",
      status: "ready",
    };
  }

  return {
    detail: "Configured HTTPS origin is present; no hosted proof packet has confirmed it yet.",
    id: "hosted-origin",
    label: "Hosted Origin",
    status: "warning",
  };
}

function consumedTokenProofRow(
  proof: InviteHostedReplayProofEvidence | null,
  redeemState: InviteRedeemState,
  proofValid: boolean,
): InviteHostedReplayProofRow {
  if (proofValid) {
    return {
      detail: `Invite is ${proof?.inviteStatus ?? "accepted"} with uses ${proof?.usesCount ?? 0}/${proof?.maxUses ?? 1}.`,
      id: "consumed-token",
      label: "Consumed Token",
      status: "ready",
    };
  }
  if (redeemState === "accepted") {
    return {
      detail:
        "First redeem succeeded; consumed-token proof is waiting for the hosted proof function.",
      id: "consumed-token",
      label: "Consumed Token",
      status: "warning",
    };
  }

  return {
    detail: "Accept the invite before proving the consumed one-use token.",
    id: "consumed-token",
    label: "Consumed Token",
    status: "warning",
  };
}

function replayDenialProofRow(
  proof: InviteHostedReplayProofEvidence | null,
  proofState: InviteHostedReplayProofState,
  proofValid: boolean,
): InviteHostedReplayProofRow {
  if (proofValid) {
    return {
      detail: proof?.replayError || "Second redeem was rejected by the hosted proof function.",
      id: "replay-denial",
      label: "Replay Denial",
      status: "ready",
    };
  }
  if (proofState === "unavailable") {
    return {
      detail: "Hosted replay proof function is unavailable or rejected the staging request.",
      id: "replay-denial",
      label: "Replay Denial",
      status: "warning",
    };
  }

  return {
    detail: "Second authenticated redeem rejection has not been captured yet.",
    id: "replay-denial",
    label: "Replay Denial",
    status: "warning",
  };
}

function sanitizedProofRow(
  proof: InviteHostedReplayProofEvidence | null,
  proofValid: boolean,
): InviteHostedReplayProofRow {
  if (proofValid) {
    return {
      detail: `Proof packet shows token hint ${proof?.tokenHint ?? "hidden"} only; no raw token or hash is returned.`,
      id: "sanitized-proof",
      label: "Sanitized Packet",
      status: "ready",
    };
  }

  return {
    detail: "Proof packet must expose only token hint, status, counters, and guard copy.",
    id: "sanitized-proof",
    label: "Sanitized Packet",
    status: "warning",
  };
}

function deploymentScopeProofRow(
  proof: InviteHostedReplayProofEvidence | null,
  proofValid: boolean,
): InviteHostedReplayProofRow {
  if (proofValid) {
    return {
      detail: "Proof is scoped to hosted-staging and does not claim production deployment.",
      id: "deployment-scope",
      label: "Deployment Scope",
      status: proof?.deploymentScope === "hosted-staging" ? "ready" : "warning",
    };
  }

  return {
    detail: "Keep this as hosted staging evidence until a production deployment run exists.",
    id: "deployment-scope",
    label: "Deployment Scope",
    status: "warning",
  };
}

function isSignedShareTokenEnvelope(token: string) {
  return /^ogl_[^.]+\.[^.]+\.[^.]+$/.test(token.trim());
}
