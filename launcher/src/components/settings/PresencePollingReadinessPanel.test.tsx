import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const evidenceMocks = vi.hoisted(() => ({
  getLatestPresencePollRunEvidence: vi.fn(),
  getMyPlatformAccounts: vi.fn(),
  getMyPresence: vi.fn(),
}));

vi.mock("../../lib/supabase/platform-accounts", () => ({
  getMyPlatformAccounts: evidenceMocks.getMyPlatformAccounts,
}));

vi.mock("../../lib/supabase/presence", () => ({
  getLatestPresencePollRunEvidence: evidenceMocks.getLatestPresencePollRunEvidence,
  getMyPresence: evidenceMocks.getMyPresence,
  isTrustedPresencePollRunEvidence: (
    evidence: {
      completedAt?: string | null;
      dryRun?: boolean;
      status?: string;
      triggerSource?: string;
    } | null,
    now: Date | number | string,
  ) => {
    if (
      !evidence?.completedAt ||
      evidence.dryRun ||
      evidence.status !== "completed" ||
      evidence.triggerSource !== "scheduled"
    ) {
      return false;
    }
    const completedAt = Date.parse(evidence.completedAt);
    const nowMs =
      now instanceof Date ? now.getTime() : typeof now === "number" ? now : Date.parse(now);
    return Number.isFinite(completedAt) && Number.isFinite(nowMs) && nowMs - completedAt <= 300_000;
  },
}));

import { PresencePollingReadinessPanel } from "./PresencePollingReadinessPanel";

describe("PresencePollingReadinessPanel", () => {
  beforeEach(() => {
    evidenceMocks.getLatestPresencePollRunEvidence.mockReset();
    evidenceMocks.getLatestPresencePollRunEvidence.mockResolvedValue(null);
    evidenceMocks.getMyPlatformAccounts.mockReset();
    evidenceMocks.getMyPresence.mockReset();
  });

  it("renders client-readable evidence without marking hosted staging trusted", () => {
    render(
      <PresencePollingReadinessPanel
        connectedPlatforms={{ steam: true }}
        now="2026-06-11T10:00:00.000Z"
        ownPresence={{ platformLastPolledAt: "2026-06-11T09:59:45.000Z" }}
        platformAccounts={[
          {
            metadata: {
              presencePollCache: {
                fetchedAt: "2026-06-11T09:59:30.000Z",
                platform: "steam",
                source: "steam_web_api",
                status: "online",
              },
            },
            platform: "steam",
          },
        ]}
        supabaseConfigured
      />,
    );

    expect(screen.getByRole("region", { name: /Presence polling readiness/i })).toBeVisible();
    expect(screen.getByText("Needs hosted cron")).toBeInTheDocument();
    expect(screen.getByText("Hosted cron")).toBeInTheDocument();
    expect(screen.getByText("Presence writeback")).toBeInTheDocument();
    expect(screen.getByText("Poll OK")).toBeInTheDocument();
    expect(screen.getByText("1/1")).toBeInTheDocument();
    expect(screen.getByText(/client-readable presencePollCache/i)).toBeInTheDocument();
    expect(screen.getByText(/trusted scheduler proof is still required/i)).toBeInTheDocument();
  });

  it("renders trusted dry-run review packets without claiming writeback", () => {
    render(
      <PresencePollingReadinessPanel
        connectedPlatforms={{ epic: true, steam: true }}
        now="2026-06-11T10:00:00.000Z"
        ownPresence={{ platformLastPolledAt: "2026-06-11T09:59:45.000Z" }}
        platformAccounts={[
          {
            metadata: {
              presencePollCache: {
                dryRun: true,
                fetchedAt: "2026-06-11T09:59:30.000Z",
                platform: "steam",
                runId: "presence-dry-run-steam-001",
                source: "steam_web_api",
                status: "online",
                writeMode: "dry-run",
              },
            },
            platform: "steam",
          },
          {
            metadata: {
              presencePollCache: {
                dryRun: true,
                fetchedAt: "2026-06-11T09:59:25.000Z",
                platform: "epic",
                reason: "provider-error",
                runId: "presence-dry-run-epic-001",
                source: "epic_presence_endpoint",
                writeMode: "dry-run",
              },
            },
            platform: "epic",
          },
        ]}
        supabaseConfigured
      />,
    );

    const panel = screen.getByRole("region", { name: /Presence polling readiness/i });

    expect(screen.getByText("Trusted Dry-Run Review")).toBeInTheDocument();
    expect(screen.getByText("Review only")).toBeInTheDocument();
    expect(screen.getByText("presence-dry-run-steam-001")).toBeInTheDocument();
    expect(screen.getByText("presence-dry-run-epic-001")).toBeInTheDocument();
    expect(screen.getByText("steam // dry-run")).toBeInTheDocument();
    expect(screen.getByText("epic // dry-run")).toBeInTheDocument();
    expect(screen.getAllByText("Writes: none")).toHaveLength(2);
    expect(panel).not.toHaveTextContent(/user_presence writeback ready|activity inserted/i);
  });

  it("renders hosted cron staging without claiming a live scheduler run", () => {
    render(
      <PresencePollingReadinessPanel
        connectedPlatforms={{ steam: true }}
        hostedCronStaging={{
          dryRunPayload:
            '{"dryRun":true,"force":false,"limit":1,"platforms":["og"],"triggerSource":"hosted_deploy_gate"}',
          environment: "hosted-staging",
          expectedNoWriteKeys: [
            "presenceUpdated: 0",
            "activityInserted: 0",
            "evidenceRecorded: true",
            "runId present",
          ],
          functionName: "poll-platform-presence",
          reviewedAt: "2026-06-14T13:30:00.000Z",
          runbookPath: "docs/runbooks/hosted-deploy-gate.md",
          schedulerCadence: "every minute after smoke passes",
          schedulerPayload:
            '{"dryRun":false,"force":false,"limit":100,"triggerSource":"scheduled"}',
          secretEnv: "PRESENCE_POLL_SECRET",
          status: "pass",
          workflow: "hosted_deploy_gate",
        }}
        now="2026-06-11T10:00:00.000Z"
        platformAccounts={[
          {
            metadata: {
              presencePollCache: {
                dryRun: true,
                fetchedAt: "2026-06-11T09:59:30.000Z",
                platform: "steam",
                runId: "presence-dry-run-steam-001",
                source: "steam_web_api",
                status: "online",
                writeMode: "dry-run",
              },
            },
            platform: "steam",
          },
        ]}
        supabaseConfigured
      />,
    );

    const panel = screen.getByRole("region", { name: /Presence polling readiness/i });

    expect(screen.getByText("Hosted Cron Staging Packet")).toBeInTheDocument();
    expect(screen.getByText(/Workflow: hosted_deploy_gate/i)).toBeInTheDocument();
    expect(screen.getByText(/Environment: hosted-staging/i)).toBeInTheDocument();
    expect(screen.getByText("presenceUpdated: 0")).toBeInTheDocument();
    expect(screen.getByText("activityInserted: 0")).toBeInTheDocument();
    expect(screen.getByText("evidenceRecorded: true")).toBeInTheDocument();
    expect(screen.getByText("runId present")).toBeInTheDocument();
    expect(screen.getAllByText(/Scheduler handoff/i).length).toBeGreaterThanOrEqual(1);
    expect(panel).not.toHaveTextContent(/live scheduled run ready|activity inserted/i);
  });

  it("renders provider bridge contract matrix without claiming live provider coverage", () => {
    render(
      <PresencePollingReadinessPanel
        connectedPlatforms={{ ea: true, epic: true, gog: true }}
        now="2026-06-11T10:00:00.000Z"
        platformAccounts={[
          {
            metadata: {
              presenceProviderBridgeContract: {
                authBoundary: "EPIC_PRESENCE_ENDPOINT plus redacted relay token",
                evidence: "Provider returned an error-shaped fixture.",
                requestShape: "POST /presence/epic { platformUserId, dryRun }",
                responseShape: "{ status, gameTitle?, errorCode }",
                status: "warning",
                tokenHandling: "Bearer token redacted before cache review",
              },
            },
            platform: "epic",
          },
          {
            metadata: {
              presenceProviderBridgeContract: {
                authBoundary: "GOG_PRESENCE_ENDPOINT not configured",
                evidence: "Missing-provider path stays explicit.",
                requestShape: "POST /presence/gog { platformUserId, dryRun }",
                responseShape: "{ status, galaxyState?, reason }",
                status: "blocked",
                tokenHandling: "No provider token present in browser metadata",
              },
            },
            platform: "gog",
          },
          {
            metadata: {
              presencePollCache: {
                dryRun: true,
                fetchedAt: "2026-06-11T09:59:18.000Z",
                platform: "ea",
                runId: "presence-dry-run-ea-001",
                source: "ea_presence_endpoint",
                status: "online",
                writeMode: "dry-run",
              },
              presenceProviderBridgeContract: {
                authBoundary: "EA_PRESENCE_ENDPOINT through hosted relay only",
                evidence: "Successful local response fixture staged for parser review only.",
                requestShape: "POST /presence/ea { platformUserId, runId, dryRun }",
                responseShape: "{ status: online, titleId?, titleName? }",
                status: "pass",
                tokenHandling: "Token hint stored as sha256 prefix only",
              },
            },
            platform: "ea",
          },
        ]}
        supabaseConfigured
      />,
    );

    const panel = screen.getByRole("region", { name: /Presence polling readiness/i });

    expect(screen.getByText("Provider Bridge Contract Matrix")).toBeInTheDocument();
    expect(screen.getByText("1/3 staged")).toBeInTheDocument();
    expect(screen.getByText("epic")).toBeInTheDocument();
    expect(screen.getByText("gog")).toBeInTheDocument();
    expect(screen.getByText("ea")).toBeInTheDocument();
    expect(screen.getByText(/POST \/presence\/epic/i)).toBeInTheDocument();
    expect(screen.getByText(/Token hint stored as sha256 prefix only/i)).toBeInTheDocument();
    expect(screen.getByText(/No live provider coverage/i)).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /live provider coverage ready|user_presence writeback ready|activity inserted|provider token exposed/i,
    );
  });

  it("renders provider bridge warnings without crashing on evidence errors", () => {
    render(
      <PresencePollingReadinessPanel
        connectedPlatforms={{ epic: true, steam: true }}
        evidenceError="You must be signed in."
        platformAccounts={[]}
        supabaseConfigured
      />,
    );

    expect(screen.getByText("Provider bridges")).toBeInTheDocument();
    expect(screen.getByText("Hosted cron")).toBeInTheDocument();
    expect(screen.getByText(/Presence evidence read failed/i)).toBeInTheDocument();
    expect(screen.getByText(/connected non-Steam bridge/i)).toBeInTheDocument();
  });

  it("loads evidence and clears stale evidence after a refresh error", async () => {
    const completedAt = new Date().toISOString();
    evidenceMocks.getMyPlatformAccounts.mockResolvedValueOnce([
      {
        metadata: {
          presencePollCache: {
            fetchedAt: completedAt,
            platform: "steam",
            source: "steam_web_api",
            status: "online",
          },
        },
        platform: "steam",
      },
    ]);
    evidenceMocks.getMyPresence.mockResolvedValueOnce({
      platformLastPolledAt: completedAt,
    });
    evidenceMocks.getLatestPresencePollRunEvidence.mockResolvedValueOnce({
      completedAt,
      dryRun: false,
      runId: "presence-run-scheduled-001",
      status: "completed",
      triggerSource: "scheduled",
    });

    render(
      <PresencePollingReadinessPanel connectedPlatforms={{ steam: true }} supabaseConfigured />,
    );

    expect(screen.getByText(/Loading latest poll evidence/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("1/1")).toBeInTheDocument());
    expect(screen.getByText(/recent trusted poll evidence/i)).toBeInTheDocument();

    evidenceMocks.getMyPlatformAccounts.mockRejectedValueOnce(new Error("session expired"));
    evidenceMocks.getMyPresence.mockResolvedValueOnce(null);
    evidenceMocks.getLatestPresencePollRunEvidence.mockResolvedValueOnce(null);
    fireEvent.click(screen.getByRole("button", { name: /Refresh presence readiness evidence/i }));

    await waitFor(() => expect(screen.getByText(/session expired/i)).toBeInTheDocument());
    expect(screen.queryByText("1/1")).not.toBeInTheDocument();
  });
});
