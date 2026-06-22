export type MobileSessionLibraryChatStatus = "blocked" | "pass" | "review";

export interface MobileSessionLibraryChatContractInput {
  chatReadScopeReady: boolean;
  chatSendQueueReady: boolean;
  libraryProjectionReady: boolean;
  sessionEnvelopeReady: boolean;
  tokenRedactionReady: boolean;
}

export interface MobileSessionLibraryChatLane {
  detail: string;
  evidence: string;
  id: string;
  label: string;
  skipped: string;
  status: MobileSessionLibraryChatStatus;
  surface: "Chat" | "Library" | "Secrets" | "Session";
}

export interface MobileSessionLibraryChatContract {
  blockedClaims: string[];
  createdAt: string;
  guardCopy: string;
  lanes: MobileSessionLibraryChatLane[];
  packetId: string;
  blockedCount: number;
  passCount: number;
  reviewCount: number;
  statusLabel: string;
  summary: string;
}

export const MOBILE_SESSION_LIBRARY_CHAT_BLOCKED_CLAIMS = [
  "No live mobile session",
  "No native iOS/Android app build",
  "No mobile auth/session write",
  "No raw access/refresh token",
  "No raw session token rendered",
  "No Supabase write from verify route",
  "No game_sessions upsert/update/delete",
  "No library mutation",
  "No provider/library scrape or account sync",
  "No chat_messages insert",
  "No room/member creation",
  "No realtime subscription opened",
  "No mobile chat send or invite send claim",
  "No APNs/FCM send",
  "No app-store distribution",
  "No hosted production E2E",
];

const MOBILE_SESSION_LIBRARY_CHAT_GUARD_COPY =
  "Local no-write contract only. This reviews a mobile session envelope, scoped library projection, chat read/send queue policy, and token redaction rules without native app storage, token writes, library mutation, chat dispatch, push delivery, or hosted production proof.";

export function buildMobileSessionLibraryChatContract(
  input: MobileSessionLibraryChatContractInput,
): MobileSessionLibraryChatContract {
  const lanes: MobileSessionLibraryChatLane[] = [
    {
      detail:
        "Reviews a mobile-facing session envelope that carries user id, device id, scope ids, and expiry metadata only.",
      evidence: "session-envelope:user+device+scopes+expires",
      id: "session-envelope",
      label: "Session Envelope",
      skipped: "No native secure-storage write",
      status: input.sessionEnvelopeReady ? "review" : "blocked",
      surface: "Session",
    },
    {
      detail:
        "Pins a read-only library projection with public game identity, source, install state, and artwork hint fields.",
      evidence: "fields:id,title,source,installStatus,artworkHint",
      id: "library-projection",
      label: "Scoped Library Projection",
      skipped: "No install path, save path, or mutation payload",
      status: input.libraryProjectionReady ? "pass" : "review",
      surface: "Library",
    },
    {
      detail:
        "Reviews direct/group room read scope with member ids, room ids, and redacted last-message preview metadata.",
      evidence: "chat-read:roomId+memberIds+redactedPreview",
      id: "chat-read-scope",
      label: "Chat Read Scope",
      skipped: "No mobile realtime subscription",
      status: input.chatReadScopeReady ? "review" : "blocked",
      surface: "Chat",
    },
    {
      detail:
        "Stages a send-queue envelope with room id, nonce, content hash, and moderation state for later hosted review.",
      evidence: "send-queue:roomId+nonce+contentHash+moderationState",
      id: "chat-send-queue",
      label: "Chat Send Queue Policy",
      skipped: "No chat insert or dispatch",
      status: input.chatSendQueueReady ? "review" : "blocked",
      surface: "Chat",
    },
    {
      detail:
        "Keeps token-looking values out of the packet and exposes only stable redacted hints for UI/debug review.",
      evidence: "tokenHint:mobile-session-[redacted]",
      id: "token-redaction",
      label: "Token Redaction",
      skipped: "No access token or refresh token exposure",
      status: input.tokenRedactionReady ? "pass" : "review",
      surface: "Secrets",
    },
  ];
  const passCount = lanes.filter((lane) => lane.status === "pass").length;
  const reviewCount = lanes.filter((lane) => lane.status === "review").length;
  const blockedCount = lanes.filter((lane) => lane.status === "blocked").length;

  return {
    blockedCount,
    blockedClaims: [...MOBILE_SESSION_LIBRARY_CHAT_BLOCKED_CLAIMS],
    createdAt: "2026-06-16T00:00:00.000Z",
    guardCopy: MOBILE_SESSION_LIBRARY_CHAT_GUARD_COPY,
    lanes,
    packetId: "mobile-session-library-chat-contract-local-001",
    passCount,
    reviewCount,
    statusLabel: blockedCount > 0 ? "Blocked" : "No-write review",
    summary:
      "Local mobile session/library/chat contract for scoped projection and redaction review; native app, mobile storage, push delivery, app-store distribution, and hosted production E2E stay open.",
  };
}

export function createVerifyMobileSessionLibraryChatContract(): MobileSessionLibraryChatContract {
  return buildMobileSessionLibraryChatContract({
    chatReadScopeReady: true,
    chatSendQueueReady: true,
    libraryProjectionReady: true,
    sessionEnvelopeReady: true,
    tokenRedactionReady: true,
  });
}
