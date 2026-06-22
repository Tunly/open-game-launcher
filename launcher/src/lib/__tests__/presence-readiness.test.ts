// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { getPresencePollingReadiness } from "../presence-readiness";
import type { PlatformType } from "../types/friends";

const now = "2026-06-11T10:00:00.000Z";
const hostedCronStaging = {
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
  schedulerPayload: '{"dryRun":false,"force":false,"limit":100,"triggerSource":"scheduled"}',
  secretEnv: "PRESENCE_POLL_SECRET",
  status: "pass" as const,
  workflow: "hosted_deploy_gate",
};

function account(platform: PlatformType, presencePollCache: Record<string, unknown>) {
  return {
    metadata: { presencePollCache },
    platform,
  };
}

describe("presence polling readiness", () => {
  it("shows fresh client-readable evidence without marking hosted staging trusted", () => {
    const readiness = getPresencePollingReadiness({
      connectedPlatforms: { steam: true },
      now,
      ownPresence: { platformLastPolledAt: "2026-06-11T09:59:45.000Z" },
      platformAccounts: [
        account("steam", {
          fetchedAt: "2026-06-11T09:59:30.000Z",
          platform: "steam",
          source: "steam_web_api",
          status: "online",
        }),
      ],
      supabaseConfigured: true,
    });

    expect(readiness.statusLabel).toBe("Needs hosted cron");
    expect(readiness.blockedCount).toBe(0);
    expect(readiness.freshCacheCount).toBe(1);
    expect(readiness.hasRecentWriteback).toBe(true);
    expect(readiness.bridgeCoverageCount).toBe(1);
    expect(readiness.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Supabase client", status: "pass" }),
        expect.objectContaining({ label: "Polling function", status: "pass" }),
        expect.objectContaining({ label: "Secret gate", status: "pass" }),
        expect.objectContaining({
          label: "Hosted cron",
          status: "warning",
          detail: expect.stringMatching(/client-readable/),
        }),
        expect.objectContaining({
          label: "Presence writeback",
          status: "warning",
          detail: expect.stringMatching(/client-writable/),
        }),
        expect.objectContaining({
          label: "Steam bridge",
          status: "warning",
          detail: expect.stringMatching(/trusted scheduler proof/),
        }),
        expect.objectContaining({ label: "Provider bridges", status: "warning" }),
      ]),
    );
  });

  it("can mark hosted checks as pass only when evidence is trusted", () => {
    const readiness = getPresencePollingReadiness({
      connectedPlatforms: { steam: true },
      now,
      ownPresence: { platformLastPolledAt: "2026-06-11T09:59:45.000Z" },
      platformAccounts: [
        account("steam", {
          fetchedAt: "2026-06-11T09:59:30.000Z",
          platform: "steam",
          source: "steam_web_api",
          status: "online",
        }),
      ],
      supabaseConfigured: true,
      trustedEvidence: true,
    });

    expect(readiness.statusLabel).toBe("Needs provider bridge");
    expect(readiness.summary).toContain("trusted scheduler evidence");
    expect(readiness.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Hosted cron", status: "pass" }),
        expect.objectContaining({ label: "Presence writeback", status: "pass" }),
        expect.objectContaining({ label: "Steam bridge", status: "pass" }),
      ]),
    );
  });

  it("separates trusted dry-run review packets from hosted cron writeback proof", () => {
    const readiness = getPresencePollingReadiness({
      connectedPlatforms: { epic: true, steam: true },
      hostedCronStaging,
      now,
      ownPresence: { platformLastPolledAt: "2026-06-11T09:59:45.000Z" },
      platformAccounts: [
        account("steam", {
          dryRun: true,
          fetchedAt: "2026-06-11T09:59:30.000Z",
          platform: "steam",
          runId: "presence-dry-run-steam-001",
          source: "steam_web_api",
          status: "online",
          writeMode: "dry-run",
        }),
        account("epic", {
          dryRun: true,
          fetchedAt: "2026-06-11T09:59:25.000Z",
          platform: "epic",
          reason: "provider-error",
          runId: "presence-dry-run-epic-001",
          source: "epic_presence_endpoint",
          writeMode: "dry-run",
        }),
      ],
      supabaseConfigured: true,
    });

    expect(readiness.statusLabel).toBe("Needs hosted cron");
    expect(readiness.hostedCronStaging).toEqual(hostedCronStaging);
    expect(readiness.dryRunEvidenceCount).toBe(2);
    expect(readiness.dryRunEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          platform: "steam",
          runId: "presence-dry-run-steam-001",
          source: "steam_web_api",
          status: "online",
          writeMode: "dry-run",
        }),
        expect.objectContaining({
          platform: "epic",
          reason: "provider-error",
          runId: "presence-dry-run-epic-001",
          writeMode: "dry-run",
        }),
      ]),
    );
    expect(readiness.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Hosted deploy gate", status: "pass" }),
        expect.objectContaining({ label: "Trusted dry-run review", status: "pass" }),
        expect.objectContaining({ label: "Hosted cron", status: "warning" }),
        expect.objectContaining({ label: "Presence writeback", status: "warning" }),
      ]),
    );
  });

  it("shows hosted deploy-gate staging separately from live hosted cron proof", () => {
    const readiness = getPresencePollingReadiness({
      connectedPlatforms: { steam: true },
      hostedCronStaging,
      now,
      platformAccounts: [
        account("steam", {
          dryRun: true,
          fetchedAt: "2026-06-11T09:59:30.000Z",
          platform: "steam",
          runId: "presence-dry-run-steam-001",
          source: "steam_web_api",
          status: "online",
          writeMode: "dry-run",
        }),
      ],
      supabaseConfigured: true,
    });

    expect(readiness.summary).toContain("local hosted deploy-gate staging");
    expect(readiness.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          detail: expect.stringContaining("presenceUpdated: 0"),
          label: "Hosted deploy gate",
          status: "pass",
        }),
        expect.objectContaining({ label: "Hosted cron", status: "warning" }),
      ]),
    );
  });

  it("surfaces non-Steam provider bridge contract rows without treating them as live coverage", () => {
    const readiness = getPresencePollingReadiness({
      connectedPlatforms: {
        battlenet: true,
        ea: true,
        epic: true,
        gog: true,
        steam: true,
        ubisoft: true,
        xbox: true,
      },
      now,
      platformAccounts: [
        account("epic", {
          dryRun: true,
          fetchedAt: "2026-06-11T09:59:25.000Z",
          platform: "epic",
          reason: "provider-error",
          runId: "presence-dry-run-epic-001",
          source: "epic_presence_endpoint",
          writeMode: "dry-run",
        }),
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
          platform: "ea" as PlatformType,
        },
        {
          metadata: {
            presenceProviderBridgeContract: {
              authBoundary: "GOG_PRESENCE_ENDPOINT not configured",
              evidence: "Missing-provider path is explicit.",
              requestShape: "POST /presence/gog { platformUserId, dryRun }",
              responseShape: "{ status, galaxyState?, reason }",
              status: "blocked",
              tokenHandling: "No provider token present in browser metadata",
            },
          },
          platform: "gog" as PlatformType,
        },
        {
          metadata: {
            presenceProviderBridgeContract: {
              authBoundary: "XBOX_PRESENCE_ENDPOINT with rate-limit handling",
              evidence: "Rate-limit fixture keeps retry metadata visible.",
              requestShape: "POST /presence/xbox { xuid, runId, dryRun }",
              responseShape: "{ status?, retryAfterSeconds, reason }",
              status: "warning",
              tokenHandling: "Provider token never leaves hosted relay boundary",
            },
          },
          platform: "xbox" as PlatformType,
        },
      ],
      supabaseConfigured: true,
    });

    expect(readiness.providerBridgeContractCount).toBe(3);
    expect(readiness.providerBridgeReadyCount).toBe(1);
    expect(readiness.providerBridgeContracts.map((row) => row.platform)).toEqual([
      "gog",
      "ea",
      "xbox",
    ]);
    expect(readiness.bridgeCoverageCount).toBe(1);
    expect(readiness.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Provider bridges",
          status: "warning",
          detail: expect.stringMatching(/provider bridge contract row/),
        }),
      ]),
    );
  });

  it("does not accept incomplete dry-run metadata as trusted review evidence", () => {
    const readiness = getPresencePollingReadiness({
      connectedPlatforms: { steam: true },
      now,
      platformAccounts: [
        account("steam", {
          dryRun: true,
          fetchedAt: "2026-06-11T09:59:30.000Z",
          platform: "steam",
          source: "steam_web_api",
          status: "online",
        }),
      ],
      supabaseConfigured: true,
    });

    expect(readiness.dryRunEvidenceCount).toBe(0);
    expect(readiness.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Trusted dry-run review", status: "warning" }),
      ]),
    );
  });

  it("keeps hosted cron warning when cache evidence is stale", () => {
    const readiness = getPresencePollingReadiness({
      connectedPlatforms: { steam: true },
      now,
      ownPresence: { platformLastPolledAt: "2026-06-11T09:40:00.000Z" },
      platformAccounts: [
        account("steam", {
          fetchedAt: "2026-06-11T09:40:00.000Z",
          platform: "steam",
          source: "steam_web_api",
          status: "online",
        }),
      ],
      supabaseConfigured: true,
    });

    expect(readiness.freshCacheCount).toBe(0);
    expect(readiness.hasRecentWriteback).toBe(false);
    expect(readiness.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Hosted cron", status: "warning" }),
        expect.objectContaining({ label: "Presence writeback", status: "warning" }),
        expect.objectContaining({
          label: "Steam bridge",
          status: "warning",
          detail: expect.stringMatching(/stale/i),
        }),
      ]),
    );
  });

  it("does not treat fresh provider errors as successful bridge evidence", () => {
    const readiness = getPresencePollingReadiness({
      connectedPlatforms: { epic: true, steam: true },
      now,
      platformAccounts: [
        account("steam", {
          fetchedAt: "2026-06-11T09:59:30.000Z",
          platform: "steam",
          reason: "missing-provider",
        }),
        account("epic", {
          fetchedAt: "2026-06-11T09:59:30.000Z",
          platform: "epic",
          reason: "provider-error",
        }),
      ],
      supabaseConfigured: true,
    });

    expect(readiness.freshCacheCount).toBe(2);
    expect(readiness.bridgeCoverageCount).toBe(0);
    expect(readiness.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Hosted cron", status: "warning" }),
        expect.objectContaining({
          label: "Steam bridge",
          status: "warning",
          detail: expect.stringMatching(/missing-provider/),
        }),
        expect.objectContaining({
          label: "Provider bridges",
          status: "warning",
          detail: expect.stringMatching(/0\/1/),
        }),
      ]),
    );
  });

  it("rejects far future timestamps as freshness evidence", () => {
    const readiness = getPresencePollingReadiness({
      connectedPlatforms: { steam: true },
      now,
      ownPresence: { platformLastPolledAt: "2099-06-11T09:59:45.000Z" },
      platformAccounts: [
        account("steam", {
          fetchedAt: "2099-06-11T09:59:30.000Z",
          platform: "steam",
          source: "steam_web_api",
          status: "online",
        }),
      ],
      supabaseConfigured: true,
      trustedEvidence: true,
    });

    expect(readiness.freshCacheCount).toBe(0);
    expect(readiness.hasRecentWriteback).toBe(false);
    expect(readiness.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Hosted cron", status: "warning" }),
        expect.objectContaining({ label: "Presence writeback", status: "warning" }),
        expect.objectContaining({ label: "Steam bridge", status: "warning" }),
      ]),
    );
  });

  it("warns in browser/local preview when Supabase env is missing", () => {
    const readiness = getPresencePollingReadiness({
      connectedPlatforms: {},
      supabaseConfigured: false,
    });

    expect(readiness.statusLabel).toBe("Needs hosted cron");
    expect(readiness.warningCount).toBeGreaterThan(0);
    expect(readiness.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Supabase client", status: "warning" }),
        expect.objectContaining({ label: "Steam bridge", status: "warning" }),
      ]),
    );
  });

  it("keeps trusted cron functions callable by secret-gated schedulers", () => {
    const config = readFileSync(resolve("../supabase/config.toml"), "utf8");

    expect(config).toMatch(/\[functions\.poll-platform-presence\][\s\S]*?verify_jwt\s*=\s*false/);
  });
});
