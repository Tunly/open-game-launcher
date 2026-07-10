import type { CommunityArtworkModerationQueueItem } from "./supabase/community-artwork";
import type { Game } from "./types";

export type HostedCommunityArtworkModerationAction =
  "approved" | "queued" | "rejected" | "reported-threshold" | "returned-to-pending";

export interface HostedCommunityArtworkModerationAuditEntry {
  action: HostedCommunityArtworkModerationAction;
  actor: string;
  artworkId: string;
  createdAt: string;
  id: string;
  newStatus: "approved" | "pending" | "rejected";
  previousStatus: "approved" | "pending" | "rejected";
  reason: string;
  reportCount: number;
}

export interface HostedCommunityArtworkModerationConsole {
  auditEntries: HostedCommunityArtworkModerationAuditEntry[];
  guardCopy: string;
  modeLabel: string;
  queueItems: CommunityArtworkModerationQueueItem[];
  statusLabel: string;
}

const VERIFY_NOW = "2026-06-12T10:30:00.000Z";
const VERIFY_REVIEW_NOW = "2026-06-12T10:45:00.000Z";

export function createVerifyHostedCommunityArtworkModerationConsole(
  game?: Game | null,
): HostedCommunityArtworkModerationConsole {
  const gameId = game?.id ?? "verify-game";
  const gameTitle = game?.title ?? "Akira's Revenge";
  const queueItems: CommunityArtworkModerationQueueItem[] = [
    {
      artist: "Manga Relay",
      createdAt: "2026-06-12T10:00:00.000Z",
      description: "Fresh creator upload waiting for review.",
      downloads: 0,
      gameId,
      hosted: true,
      id: `verify-pending-${gameId}`,
      kind: "cover",
      lastAuditAction: "queued",
      lastAuditAt: "2026-06-12T10:00:00.000Z",
      moderationStatus: "pending",
      reportCount: 0,
      sourceLabel: `${gameTitle} Queue Cover`,
      storagePath: `verify/games/${gameId}/cover-queue.svg`,
      submitterId: "submitter-redacted",
      tags: ["cover", "community-upload", "moderation"],
      title: `${gameTitle} Queue Cover`,
      updatedAt: "2026-06-12T10:00:00.000Z",
      url: "/artwork/community-panel-cover.svg",
      userVote: 0,
      votes: 0,
    },
    {
      artist: "Panel Break Studio",
      createdAt: "2026-06-12T09:10:00.000Z",
      description: "Approved art returned to review after report threshold.",
      downloads: 14,
      gameId,
      hosted: true,
      id: `verify-reported-${gameId}`,
      kind: "logo",
      lastReportReason: "wrong_game",
      lastReportedAt: "2026-06-12T10:25:00.000Z",
      moderationReason: "reported-by-community",
      moderationStatus: "pending",
      reportCount: 3,
      sourceLabel: "Reported Logo",
      storagePath: `verify/games/${gameId}/logo-reported.svg`,
      submitterId: "submitter-redacted",
      tags: ["logo", "reported"],
      title: "Reported Logo",
      updatedAt: "2026-06-12T10:25:00.000Z",
      url: "/artwork/community-panel-logo.svg",
      userVote: 0,
      votes: 9,
    },
    {
      artist: "Inkline Crew",
      createdAt: "2026-06-11T16:20:00.000Z",
      description: "Rejected fixture retained for audit visibility.",
      downloads: 0,
      gameId,
      hosted: true,
      id: `verify-rejected-${gameId}`,
      kind: "icon",
      lastAuditAction: "rejected",
      lastAuditAt: "2026-06-12T08:00:00.000Z",
      moderationReason: "wrong game art",
      moderationStatus: "rejected",
      reportCount: 1,
      sourceLabel: "Rejected Icon",
      storagePath: `verify/games/${gameId}/icon-rejected.svg`,
      submitterId: "submitter-redacted",
      tags: ["icon", "audit"],
      title: "Rejected Icon",
      updatedAt: "2026-06-12T08:00:00.000Z",
      url: "/artwork/community-panel-icon.svg",
      userVote: 0,
      votes: -2,
    },
  ];

  return {
    auditEntries: [
      {
        action: "reported-threshold",
        actor: "community-report-threshold",
        artworkId: `verify-reported-${gameId}`,
        createdAt: "2026-06-12T10:25:00.000Z",
        id: `audit-reported-${gameId}`,
        newStatus: "pending",
        previousStatus: "approved",
        reason: "3 active reports returned approved artwork to pending review.",
        reportCount: 3,
      },
      {
        action: "rejected",
        actor: "local-moderator-fixture",
        artworkId: `verify-rejected-${gameId}`,
        createdAt: "2026-06-12T08:00:00.000Z",
        id: `audit-rejected-${gameId}`,
        newStatus: "rejected",
        previousStatus: "pending",
        reason: "Wrong game art.",
        reportCount: 1,
      },
      {
        action: "queued",
        actor: "upload-helper",
        artworkId: `verify-pending-${gameId}`,
        createdAt: "2026-06-12T10:00:00.000Z",
        id: `audit-queued-${gameId}`,
        newStatus: "pending",
        previousStatus: "pending",
        reason: "Submission queued for moderation.",
        reportCount: 0,
      },
    ],
    guardCopy:
      "Local console previews service-role review actions and audit rows. Browser users do not receive service-role keys, live Supabase review writes, or content-scanning claims.",
    modeLabel: "Local Review Preview",
    queueItems,
    statusLabel: "Service-role contract staged",
  };
}

export function applyHostedCommunityArtworkReviewPreview(
  consoleState: HostedCommunityArtworkModerationConsole,
  artworkId: string,
  decision: "approve" | "pending" | "reject",
  reason: string,
): HostedCommunityArtworkModerationConsole {
  const target = consoleState.queueItems.find((item) => item.id === artworkId);
  if (!target) {
    return consoleState;
  }

  const nextStatus =
    decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "pending";
  const action =
    decision === "approve"
      ? "approved"
      : decision === "reject"
        ? "rejected"
        : "returned-to-pending";
  const cleanReason = reason.trim() || "Local review preview.";
  const currentReportCount = target.reportCount ?? 0;
  const nextReportCount = nextStatus === "pending" ? currentReportCount : 0;
  const auditEntry: HostedCommunityArtworkModerationAuditEntry = {
    action,
    actor: "local-moderator-fixture",
    artworkId,
    createdAt: VERIFY_REVIEW_NOW,
    id: `audit-${action}-${artworkId}-${VERIFY_NOW}`,
    newStatus: nextStatus,
    previousStatus: target.moderationStatus ?? "pending",
    reason: cleanReason,
    reportCount: currentReportCount,
  };

  return {
    ...consoleState,
    auditEntries: [auditEntry, ...consoleState.auditEntries],
    queueItems: consoleState.queueItems.map((item) =>
      item.id === artworkId
        ? {
            ...item,
            lastAuditAction: action,
            lastAuditAt: VERIFY_REVIEW_NOW,
            moderationReason: cleanReason,
            moderationStatus: nextStatus,
            reportCount: nextReportCount,
            updatedAt: VERIFY_REVIEW_NOW,
          }
        : item,
    ),
  };
}
