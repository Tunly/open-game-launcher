import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  userId: null as string | null,
}));
const queryState = vi.hoisted(() => ({
  data: null as Record<string, unknown> | null,
  error: null as { message: string } | null,
  pollRunData: null as Record<string, unknown> | null,
  pollRunError: null as { code?: string; message: string } | null,
  requestedUserIds: [] as string[],
}));

vi.mock("../client", () => ({
  getCurrentSessionUserId: async () => authState.userId,
  getSupabaseClient: () => ({
    from: (table: string) => {
      if (table === "presence_poll_runs") {
        return {
          select: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: queryState.pollRunData,
                  error: queryState.pollRunError,
                }),
              }),
            }),
          }),
        };
      }

      return {
        select: () => ({
          eq: (_column: string, userId: string) => {
            queryState.requestedUserIds = [userId];
            return {
              maybeSingle: async () => ({ data: queryState.data, error: queryState.error }),
            };
          },
        }),
      };
    },
  }),
  supabase: null,
}));

import {
  getLatestPresencePollRunEvidence,
  getMyPresence,
  isTrustedPresencePollRunEvidence,
} from "../presence";

describe("presence reads", () => {
  beforeEach(() => {
    authState.userId = null;
    queryState.data = null;
    queryState.error = null;
    queryState.pollRunData = null;
    queryState.pollRunError = null;
    queryState.requestedUserIds = [];
  });

  it("returns null when the current user is signed out", async () => {
    await expect(getMyPresence()).resolves.toBeNull();
    expect(queryState.requestedUserIds).toEqual([]);
  });

  it("loads and maps the current user's own presence row", async () => {
    authState.userId = "user-1";
    queryState.data = {
      current_game_title: "Neon Drift",
      last_heartbeat_at: "2026-06-11T09:59:50.000Z",
      platform: "steam",
      platform_last_polled_at: "2026-06-11T09:59:45.000Z",
      platform_source: "steam_web_api",
      status: "online",
      updated_at: "2026-06-11T09:59:55.000Z",
      user_id: "user-1",
    };

    await expect(getMyPresence()).resolves.toMatchObject({
      currentGameTitle: "Neon Drift",
      platform: "steam",
      platformLastPolledAt: "2026-06-11T09:59:45.000Z",
      platformSource: "steam_web_api",
      status: "online",
      userId: "user-1",
    });
    expect(queryState.requestedUserIds).toEqual(["user-1"]);
  });

  it("loads the latest sanitized presence poll run evidence", async () => {
    queryState.pollRunData = {
      activity_inserted_count: 1,
      completed_at: "2026-06-14T13:31:00.000Z",
      dry_run: false,
      forced: false,
      polled_count: 3,
      presence_updated_count: 2,
      requested_user_count: 0,
      run_id: "presence-run-1",
      scanned_count: 4,
      skipped_count: 1,
      status: "completed",
      trigger_source: "scheduled",
    };

    await expect(getLatestPresencePollRunEvidence()).resolves.toEqual({
      activityInsertedCount: 1,
      completedAt: "2026-06-14T13:31:00.000Z",
      dryRun: false,
      forced: false,
      polledCount: 3,
      presenceUpdatedCount: 2,
      requestedUserCount: 0,
      runId: "presence-run-1",
      scannedCount: 4,
      skippedCount: 1,
      status: "completed",
      triggerSource: "scheduled",
    });
  });

  it("treats missing presence poll run schema as no trusted evidence", async () => {
    queryState.pollRunError = {
      code: "42P01",
      message: "relation presence_poll_runs does not exist",
    };

    await expect(getLatestPresencePollRunEvidence()).resolves.toBeNull();
  });

  it("trusts only fresh scheduled non-dry-run poll evidence", () => {
    const freshScheduledRun = {
      activityInsertedCount: 0,
      completedAt: "2026-06-14T13:31:00.000Z",
      dryRun: false,
      forced: false,
      polledCount: 3,
      presenceUpdatedCount: 2,
      requestedUserCount: 0,
      runId: "presence-run-1",
      scannedCount: 4,
      skippedCount: 1,
      status: "completed",
      triggerSource: "scheduled",
    };

    expect(isTrustedPresencePollRunEvidence(freshScheduledRun, "2026-06-14T13:32:00.000Z")).toBe(
      true,
    );
    expect(
      isTrustedPresencePollRunEvidence(
        { ...freshScheduledRun, dryRun: true },
        "2026-06-14T13:32:00.000Z",
      ),
    ).toBe(false);
    expect(
      isTrustedPresencePollRunEvidence(
        { ...freshScheduledRun, triggerSource: "hosted_deploy_gate" },
        "2026-06-14T13:32:00.000Z",
      ),
    ).toBe(false);
    expect(isTrustedPresencePollRunEvidence(freshScheduledRun, "2026-06-14T13:40:00.000Z")).toBe(
      false,
    );
  });
});
