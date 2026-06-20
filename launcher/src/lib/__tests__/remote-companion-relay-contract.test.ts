// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  parseRemoteCompanionRelayRequest,
  redactRemoteCompanionRelayArgs,
  sanitizeRemotePackageRef,
} from "../../../../supabase/functions/remote-companion-relay/contract";

const deviceId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const buildId = "33333333-3333-4333-8333-333333333333";

describe("remote companion relay contract", () => {
  it("maps create-pairing requests to the hashed pairing RPC", () => {
    const parsed = parseRemoteCompanionRelayRequest({
      action: "create-pairing",
      deviceKind: "desktop",
      deviceLabel: "Desk Relay",
      ttlSeconds: 1200,
    });

    expect(parsed).toEqual({
      action: "create_pairing",
      args: {
        device_kind_input: "desktop",
        device_label_input: "Desk Relay",
        ttl_seconds_input: 1200,
      },
      rpcName: "create_remote_companion_pairing",
      status: "ok",
    });
  });

  it("maps opaque enqueue requests without raw package locations", () => {
    const parsed = parseRemoteCompanionRelayRequest({
      action: "enqueue_install",
      buildId,
      companionDeviceId: deviceId,
      gameId: "remote-demo",
      packageRef: {
        channel: "stable",
        delivery: "store-build-ticket",
        downloadTicketRequired: true,
      },
      platform: "windows",
      productId,
      source: "web-dashboard",
      title: "Remote Demo",
    });

    expect(parsed).toEqual({
      action: "enqueue_install",
      args: {
        build_id_input: buildId,
        companion_device_id_input: deviceId,
        game_id_input: "remote-demo",
        package_ref_input: {
          channel: "stable",
          delivery: "store-build-ticket",
          downloadTicketRequired: true,
        },
        platform_input: "windows",
        product_id_input: productId,
        source_input: "web-dashboard",
        title_input: "Remote Demo",
      },
      rpcName: "enqueue_remote_install_job",
      status: "ok",
    });
  });

  it("rejects store enqueue requests without a store build ticket package ref", () => {
    expect(
      parseRemoteCompanionRelayRequest({
        action: "enqueue_install",
        companionDeviceId: deviceId,
        gameId: "remote-demo",
        packageRef: {
          provider: "steam",
        },
        productId,
        source: "web-dashboard",
        title: "Remote Demo",
      }),
    ).toEqual({
      error: "Store remote install jobs require a store-build-ticket package reference.",
      status: "error",
      statusCode: 400,
    });
  });

  it("rejects store build enqueue requests without a store product id", () => {
    expect(
      parseRemoteCompanionRelayRequest({
        action: "enqueue_install",
        buildId,
        companionDeviceId: deviceId,
        gameId: "remote-demo",
        packageRef: {
          channel: "stable",
          delivery: "store-build-ticket",
          downloadTicketRequired: true,
        },
        source: "web-dashboard",
        title: "Remote Demo",
      }),
    ).toEqual({
      error: "Store remote install jobs require a store product id.",
      status: "error",
      statusCode: 400,
    });
  });

  it("rejects package refs that contain URLs, signed URL fields, tokens, or secrets", () => {
    for (const packageRef of [
      { downloadUrl: "https://cdn.og-launcher.test/build.zip" },
      { install_manifest_url: "https://cdn.og-launcher.test/manifest.json" },
      { nested: { token: "abc" } },
      { note: "sig=abc123" },
      { secret: "device-secret" },
      { accessToken: "abc" },
      { authorization: "Bearer abc" },
    ]) {
      expect(sanitizeRemotePackageRef(packageRef)).toEqual({
        error: "Remote package reference must not contain package locations or secrets.",
        ok: false,
      });
    }
  });

  it("requires device secrets for ping and maps active pings", () => {
    expect(
      parseRemoteCompanionRelayRequest({
        action: "ping",
        deviceId,
      }),
    ).toEqual({
      error: "Active companion device secret is required.",
      status: "error",
      statusCode: 400,
    });

    expect(
      parseRemoteCompanionRelayRequest({
        action: "ping",
        deviceId,
        deviceSecret: "ogd_secret_value",
      }),
    ).toEqual({
      action: "ping",
      args: {
        device_id_input: deviceId,
        device_secret_input: "ogd_secret_value",
      },
      rpcName: "record_remote_companion_ping",
      status: "ok",
    });
  });

  it("maps claim requests and redacts device secrets for logging or echoes", () => {
    const parsed = parseRemoteCompanionRelayRequest({
      action: "claim_jobs",
      deviceId,
      deviceSecret: "ogd_secret_value",
      limit: 50,
    });

    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") throw new Error("unexpected parse failure");
    expect(parsed.rpcName).toBe("claim_remote_install_jobs");
    expect(parsed.args).toMatchObject({
      device_id_input: deviceId,
      device_secret_input: "ogd_secret_value",
      limit_input: 25,
    });
    expect(redactRemoteCompanionRelayArgs(parsed.args)).toMatchObject({
      device_id_input: deviceId,
      device_secret_input: "[redacted]",
      limit_input: 25,
    });
  });

  it("maps status updates and rejects status messages with URL-shaped secrets", () => {
    const jobId = "44444444-4444-4444-8444-444444444444";

    expect(
      parseRemoteCompanionRelayRequest({
        action: "update_job_status",
        deviceId,
        deviceSecret: "ogd_secret_value",
        jobId,
        message: "started https://cdn.og-launcher.test/build.zip",
        status: "started",
      }),
    ).toEqual({
      error: "Remote install job status must not contain package locations or secrets.",
      status: "error",
      statusCode: 400,
    });

    expect(
      parseRemoteCompanionRelayRequest({
        action: "update_job_status",
        deviceId,
        deviceSecret: "ogd_secret_value",
        jobId,
        localQueueId: "queue-1",
        message: "Download started.",
        status: "started",
      }),
    ).toEqual({
      action: "update_job_status",
      args: {
        device_id_input: deviceId,
        device_secret_input: "ogd_secret_value",
        job_id_input: jobId,
        local_queue_id_input: "queue-1",
        message_input: "Download started.",
        status_input: "started",
      },
      rpcName: "update_remote_install_job_status",
      status: "ok",
    });
  });
});
