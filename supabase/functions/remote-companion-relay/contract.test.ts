import {
  buildRemoteCompanionRelayErrorContract,
  buildRemoteCompanionRelayRpcErrorContract,
  guardRemoteCompanionRelayAuth,
  guardRemoteCompanionRelayMethod,
  parseRemoteCompanionRelayRequest,
  redactRemoteCompanionRelayArgs,
  sanitizeRemotePackageRef,
} from "./contract.ts";

const desktopDeviceId = "11111111-1111-4111-8111-111111111111";
const mobileDeviceId = "22222222-2222-4222-8222-222222222222";
const jobId = "33333333-3333-4333-8333-333333333333";
const productId = "44444444-4444-4444-8444-444444444444";
const buildId = "55555555-5555-4555-8555-555555555555";

Deno.test("remote companion relay enforces method and auth contracts", () => {
  assertEquals(guardRemoteCompanionRelayMethod("OPTIONS"), {
    status: "options",
  });
  assertEquals(guardRemoteCompanionRelayMethod("POST"), { status: "ok" });
  assertEquals(guardRemoteCompanionRelayMethod("GET"), {
    body: { error: "Method not allowed." },
    status: "error",
    statusCode: 405,
  });

  assertEquals(
    guardRemoteCompanionRelayAuth({ user: { id: "user-1" } }, null),
    { status: "ok" },
  );
  assertEquals(guardRemoteCompanionRelayAuth({ user: null }, null), {
    body: { error: "Invalid or expired token." },
    status: "error",
    statusCode: 401,
  });
  assertEquals(
    guardRemoteCompanionRelayAuth(
      { user: { id: "user-1" } },
      new Error("expired"),
    ),
    {
      body: { error: "Invalid or expired token." },
      status: "error",
      statusCode: 401,
    },
  );
});

Deno.test("remote companion relay rejects invalid body and action inputs", () => {
  assertEquals(parseRemoteCompanionRelayRequest(null), {
    error: "Request body must be a JSON object.",
    status: "error",
    statusCode: 400,
  });
  assertEquals(parseRemoteCompanionRelayRequest({ action: "launch_game" }), {
    error: "Remote companion action is not supported.",
    status: "error",
    statusCode: 400,
  });
  assertEquals(
    buildRemoteCompanionRelayErrorContract(
      "Request body must be a JSON object.",
    ),
    {
      body: { error: "Request body must be a JSON object." },
      status: "error",
      statusCode: 400,
    },
  );
});

Deno.test("remote companion relay parses pairing and ping device guards", () => {
  assertEquals(
    parseRemoteCompanionRelayRequest({
      action: "create-pairing",
      deviceKind: "console",
      deviceLabel: " OG Deck ",
      ttlSeconds: 99999,
    }),
    {
      action: "create_pairing",
      args: {
        device_kind_input: "desktop",
        device_label_input: "OG Deck",
        ttl_seconds_input: 3600,
      },
      rpcName: "create_remote_companion_pairing",
      status: "ok",
    },
  );

  assertEquals(
    parseRemoteCompanionRelayRequest({
      action: "redeem_pairing",
      device_kind: "web",
      device_label: " Companion Browser ",
      pairing_code: "  OGL-PAIR-123  ",
    }),
    {
      action: "redeem_pairing",
      args: {
        device_kind_input: "web",
        device_label_input: "Companion Browser",
        pairing_code_input: "OGL-PAIR-123",
      },
      rpcName: "redeem_remote_companion_pairing",
      status: "ok",
    },
  );

  assertEquals(
    parseRemoteCompanionRelayRequest({
      action: "ping",
      deviceId: desktopDeviceId,
      deviceSecret: " desktop-secret ",
    }),
    {
      action: "ping",
      args: {
        device_id_input: desktopDeviceId,
        device_secret_input: "desktop-secret",
      },
      rpcName: "record_remote_companion_ping",
      status: "ok",
    },
  );

  assertEquals(
    parseRemoteCompanionRelayRequest({
      action: "ping",
      deviceId: desktopDeviceId,
    }),
    {
      error: "Active companion device secret is required.",
      status: "error",
      statusCode: 400,
    },
  );
});

Deno.test("remote companion relay parses job claim and status guards", () => {
  assertEquals(
    parseRemoteCompanionRelayRequest({
      action: "claim_jobs",
      deviceId: desktopDeviceId,
      deviceSecret: "desktop-secret",
      limit: 250,
    }),
    {
      action: "claim_jobs",
      args: {
        device_id_input: desktopDeviceId,
        device_secret_input: "desktop-secret",
        limit_input: 25,
      },
      rpcName: "claim_remote_install_jobs",
      status: "ok",
    },
  );

  assertEquals(
    parseRemoteCompanionRelayRequest({
      action: "update-job-status",
      deviceId: desktopDeviceId,
      deviceSecret: "desktop-secret",
      jobId,
      localQueueId: " queue-1 ",
      message: " Installed locally. ",
      status: "Completed",
    }),
    {
      action: "update_job_status",
      args: {
        device_id_input: desktopDeviceId,
        device_secret_input: "desktop-secret",
        job_id_input: jobId,
        local_queue_id_input: "queue-1",
        message_input: "Installed locally.",
        status_input: "completed",
      },
      rpcName: "update_remote_install_job_status",
      status: "ok",
    },
  );

  assertEquals(
    parseRemoteCompanionRelayRequest({
      action: "update_job_status",
      deviceId: desktopDeviceId,
      deviceSecret: "desktop-secret",
      jobId: "not-a-uuid",
      status: "completed",
    }),
    {
      error: "Remote install job id is required.",
      status: "error",
      statusCode: 400,
    },
  );

  assertEquals(
    parseRemoteCompanionRelayRequest({
      action: "update_job_status",
      deviceId: desktopDeviceId,
      deviceSecret: "desktop-secret",
      jobId,
      message: "download_url=https://cdn.example/build.zip",
      status: "failed",
    }),
    {
      error:
        "Remote install job status must not contain package locations or secrets.",
      status: "error",
      statusCode: 400,
    },
  );
});

Deno.test("remote companion relay sanitizes enqueue package refs", () => {
  assertEquals(
    parseRemoteCompanionRelayRequest({
      action: "enqueue-install",
      buildId,
      companionDeviceId: mobileDeviceId,
      gameId: " steam:123 ",
      packageRef: {
        branch: "default",
        delivery: "store-build-ticket",
        downloadTicketRequired: true,
      },
      platform: " linux ",
      productId,
      source: "WEB-DASHBOARD",
      title: " Neon Circuit ",
    }),
    {
      action: "enqueue_install",
      args: {
        build_id_input: buildId,
        companion_device_id_input: mobileDeviceId,
        game_id_input: "steam:123",
        package_ref_input: {
          branch: "default",
          delivery: "store-build-ticket",
          downloadTicketRequired: true,
        },
        platform_input: "linux",
        product_id_input: productId,
        source_input: "web-dashboard",
        title_input: "Neon Circuit",
      },
      rpcName: "enqueue_remote_install_job",
      status: "ok",
    },
  );

  assertEquals(
    parseRemoteCompanionRelayRequest({
      action: "enqueue-install",
      companionDeviceId: mobileDeviceId,
      gameId: "steam:123",
      packageRef: {
        provider: "steam",
      },
      productId,
      title: "Neon Circuit",
    }),
    {
      error:
        "Store remote install jobs require a store-build-ticket package reference.",
      status: "error",
      statusCode: 400,
    },
  );

  assertEquals(
    parseRemoteCompanionRelayRequest({
      action: "enqueue-install",
      buildId,
      companionDeviceId: mobileDeviceId,
      gameId: "steam:123",
      packageRef: {
        branch: "default",
        delivery: "store-build-ticket",
        downloadTicketRequired: true,
      },
      title: "Neon Circuit",
    }),
    {
      error: "Store remote install jobs require a store product id.",
      status: "error",
      statusCode: 400,
    },
  );

  assertEquals(
    sanitizeRemotePackageRef({ download_url: "https://example.test" }),
    {
      error:
        "Remote package reference must not contain package locations or secrets.",
      ok: false,
    },
  );
  assertEquals(
    parseRemoteCompanionRelayRequest({
      action: "enqueue_install",
      companionDeviceId: mobileDeviceId,
      gameId: "steam:123",
      packageRef: { manifest: "oglauncher://install/secret" },
      title: "Neon Circuit",
    }),
    {
      error:
        "Remote package reference must not contain package locations or secrets.",
      status: "error",
      statusCode: 400,
    },
  );
});

Deno.test("remote companion relay redacts device secrets from error contracts", () => {
  const parsed = assertOk(
    parseRemoteCompanionRelayRequest({
      action: "claim_jobs",
      deviceId: desktopDeviceId,
      deviceSecret: "desktop-secret",
    }),
  );
  const redacted = redactRemoteCompanionRelayArgs(parsed.args);
  const rpcError = buildRemoteCompanionRelayRpcErrorContract({
    action: parsed.action,
    errorMessage: "permission denied",
    rpcName: parsed.rpcName,
  });
  const rpcErrorJson = stableJson(rpcError);

  assertEquals(redacted.device_secret_input, "[redacted]");
  assertEquals(rpcErrorJson.includes("desktop-secret"), false);
  assertEquals(rpcErrorJson.includes("device_secret_input"), false);
  assertEquals(rpcError, {
    body: {
      action: "claim_jobs",
      error: "permission denied",
      rpc: "claim_remote_install_jobs",
    },
    status: "error",
    statusCode: 400,
  });
});

function assertOk(
  result: ReturnType<typeof parseRemoteCompanionRelayRequest>,
): Extract<
  ReturnType<typeof parseRemoteCompanionRelayRequest>,
  { status: "ok" }
> {
  if (result.status !== "ok") {
    throw new Error(`Expected ok parse result, got ${stableJson(result)}`);
  }
  return result;
}

function assertEquals(actual: unknown, expected: unknown) {
  const actualJson = stableJson(actual);
  const expectedJson = stableJson(expected);
  if (actualJson !== expectedJson) {
    throw new Error(
      `Assertion failed:\nactual:   ${actualJson}\nexpected: ${expectedJson}`,
    );
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${
      Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
        .join(",")
    }}`;
  }

  return JSON.stringify(value);
}
