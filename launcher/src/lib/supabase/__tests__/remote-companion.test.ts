import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("../client", () => ({
  getSupabaseClient: () => ({
    functions: {
      invoke: mocks.invoke,
    },
  }),
}));

const deviceId = "11111111-1111-4111-8111-111111111111";
const buildId = "33333333-3333-4333-8333-333333333333";

describe("remote companion supabase relay client", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.invoke.mockReset();
  });

  it("creates a remote companion pairing through the hosted relay", async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        action: "create_pairing",
        data: [
          {
            device_id: deviceId,
            device_secret: "ogd_secret_once",
            device_secret_hint: "ogd_secr...once",
            expires_at: "2026-06-11T12:15:00.000Z",
            pairing_code: "ogc_pair_once",
            pairing_code_hint: "ogc_pair...once",
          },
        ],
        rpc: "create_remote_companion_pairing",
      },
      error: null,
    });

    const { createRemoteCompanionCloudPairing } = await import("../remote-companion");
    const result = await createRemoteCompanionCloudPairing({
      deviceKind: "desktop",
      deviceLabel: "Desk Relay",
      ttlSeconds: 900,
    });

    expect(mocks.invoke).toHaveBeenCalledWith("remote-companion-relay", {
      body: {
        action: "create_pairing",
        deviceKind: "desktop",
        deviceLabel: "Desk Relay",
        ttlSeconds: 900,
      },
    });
    expect(result).toEqual({
      deviceId,
      deviceSecret: "ogd_secret_once",
      deviceSecretHint: "ogd_secr...once",
      expiresAt: "2026-06-11T12:15:00.000Z",
      pairingCode: "ogc_pair_once",
      pairingCodeHint: "ogc_pair...once",
    });
  });

  it("enqueues opaque install jobs without raw download URLs", async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        action: "enqueue_install",
        data: [
          {
            expires_at: "2026-06-11T12:30:00.000Z",
            job_id: "job-1",
            status: "pending",
          },
        ],
        rpc: "enqueue_remote_install_job",
      },
      error: null,
    });

    const { enqueueRemoteCompanionInstallJob } = await import("../remote-companion");
    const result = await enqueueRemoteCompanionInstallJob({
      buildId: "33333333-3333-4333-8333-333333333333",
      companionDeviceId: deviceId,
      gameId: "remote-demo",
      packageRef: {
        channel: "stable",
        delivery: "store-build-ticket",
        downloadTicketRequired: true,
      },
      platform: "windows",
      productId: "22222222-2222-4222-8222-222222222222",
      source: "web-dashboard",
      title: "Remote Demo",
    });

    expect(mocks.invoke).toHaveBeenCalledWith("remote-companion-relay", {
      body: expect.objectContaining({
        action: "enqueue_install",
        buildId: "33333333-3333-4333-8333-333333333333",
        companionDeviceId: deviceId,
        gameId: "remote-demo",
        packageRef: {
          channel: "stable",
          delivery: "store-build-ticket",
          downloadTicketRequired: true,
        },
        productId: "22222222-2222-4222-8222-222222222222",
        source: "web-dashboard",
        title: "Remote Demo",
      }),
    });
    expect(JSON.stringify(mocks.invoke.mock.calls[0][1].body)).not.toMatch(/https?:\/\//i);
    expect(JSON.stringify(mocks.invoke.mock.calls[0][1].body)).not.toMatch(
      /oglauncher:\/\/|token=|sig=|downloadUrl|installManifestUrl|signedUrl/i,
    );
    expect(result).toEqual({
      expiresAt: "2026-06-11T12:30:00.000Z",
      jobId: "job-1",
      status: "pending",
    });
  });

  it("records active companion pings through the relay with the device secret", async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        action: "ping",
        data: [
          {
            device_id: deviceId,
            last_seen_at: "2026-06-11T12:05:00.000Z",
            status: "active",
          },
        ],
        rpc: "record_remote_companion_ping",
      },
      error: null,
    });

    const { recordRemoteCompanionCloudPing } = await import("../remote-companion");
    const result = await recordRemoteCompanionCloudPing({
      deviceId,
      deviceSecret: "ogd_secret_once",
    });

    expect(mocks.invoke).toHaveBeenCalledWith("remote-companion-relay", {
      body: {
        action: "ping",
        deviceId,
        deviceSecret: "ogd_secret_once",
      },
    });
    expect(result).toEqual({
      deviceId,
      lastSeenAt: "2026-06-11T12:05:00.000Z",
      status: "active",
    });
  });

  it("claims jobs with the one-time desktop device secret and maps sanitized refs", async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        action: "claim_jobs",
        data: [
          {
            build_id: buildId,
            created_at: "2026-06-11T12:00:00.000Z",
            expires_at: "2026-06-11T12:30:00.000Z",
            game_id: "remote-demo",
            job_id: "job-1",
            package_ref: { downloadTicketRequired: true },
            platform: "windows",
            product_id: null,
            source: "mobile-companion",
            status: "accepted",
            title: "Remote Demo",
          },
        ],
        rpc: "claim_remote_install_jobs",
      },
      error: null,
    });

    const { claimRemoteCompanionInstallJobs } = await import("../remote-companion");
    const result = await claimRemoteCompanionInstallJobs({
      deviceId,
      deviceSecret: "ogd_secret_once",
      limit: 10,
    });

    expect(mocks.invoke).toHaveBeenCalledWith("remote-companion-relay", {
      body: {
        action: "claim_jobs",
        deviceId,
        deviceSecret: "ogd_secret_once",
        limit: 10,
      },
    });
    expect(result).toEqual([
      {
        buildId,
        createdAt: "2026-06-11T12:00:00.000Z",
        expiresAt: "2026-06-11T12:30:00.000Z",
        gameId: "remote-demo",
        jobId: "job-1",
        packageRef: { downloadTicketRequired: true },
        platform: "windows",
        productId: null,
        source: "mobile-companion",
        status: "accepted",
        title: "Remote Demo",
      },
    ]);
  });

  it("updates claimed job status without package URLs in the message", async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        action: "update_job_status",
        data: [
          {
            job_id: "job-1",
            status: "started",
            updated_at: "2026-06-11T12:06:00.000Z",
          },
        ],
        rpc: "update_remote_install_job_status",
      },
      error: null,
    });

    const { updateRemoteCompanionInstallJobStatus } = await import("../remote-companion");
    const result = await updateRemoteCompanionInstallJobStatus({
      deviceId,
      deviceSecret: "ogd_secret_once",
      jobId: "job-1",
      localQueueId: "queue-1",
      message: "Download started.",
      status: "started",
    });

    expect(mocks.invoke).toHaveBeenCalledWith("remote-companion-relay", {
      body: {
        action: "update_job_status",
        deviceId,
        deviceSecret: "ogd_secret_once",
        jobId: "job-1",
        localQueueId: "queue-1",
        message: "Download started.",
        status: "started",
      },
    });
    expect(JSON.stringify(mocks.invoke.mock.calls[0][1].body)).not.toMatch(/https?:\/\//i);
    expect(result).toEqual({
      jobId: "job-1",
      status: "started",
      updatedAt: "2026-06-11T12:06:00.000Z",
    });
  });

  it("returns null when the hosted relay is not deployed yet", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Function not found" },
    });

    const { createRemoteCompanionCloudPairing } = await import("../remote-companion");
    await expect(createRemoteCompanionCloudPairing({})).resolves.toBeNull();
  });
});
