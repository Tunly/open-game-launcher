import {
  buildInviteHostedProofCorsHeaders,
  buildInviteHostedProofPacket,
  buildShareTokenHint,
  parseInviteHostedProofAllowedOrigins,
  parseInviteHostedProofRequest,
  verifyInviteHostedProofOrigin,
} from "./contract.ts";

const shareToken =
  "ogl_header.payload.signature-redacted-for-contract-tests";

Deno.test("invite hosted proof parses and trims share-token requests", () => {
  assertEquals(parseInviteHostedProofRequest({ token: `  ${shareToken}  ` }), {
    args: { token_input: shareToken },
    status: "ok",
    token: shareToken,
    tokenHint: buildShareTokenHint(shareToken),
  });
});

Deno.test("invite hosted proof rejects missing token bodies", () => {
  assertEquals(parseInviteHostedProofRequest({ token: "   " }), {
    error: "Invite share token is required.",
    status: "error",
    statusCode: 400,
  });
});

Deno.test("invite hosted proof keeps only exact HTTPS allowed origins", () => {
  assertEquals(
    parseInviteHostedProofAllowedOrigins(
      "https://og-launcher.example, http://localhost:1420, https://og-launcher.example/path, invalid",
    ),
    ["https://og-launcher.example"],
  );
});

Deno.test("invite hosted proof verifies exact allowed origins", () => {
  assertEquals(
    verifyInviteHostedProofOrigin({
      allowedOrigins: ["https://og-launcher.example"],
      origin: "https://og-launcher.example/invite/test",
    }),
    {
      origin: "https://og-launcher.example",
      status: "ok",
    },
  );

  assertEquals(
    verifyInviteHostedProofOrigin({
      allowedOrigins: ["https://og-launcher.example"],
      origin: "https://evil.example",
    }),
    {
      error: "Origin is not allowed for invite hosted proof.",
      status: "error",
      statusCode: 403,
    },
  );
});

Deno.test("invite hosted proof CORS reflects only allowed origins", () => {
  assertEquals(
    buildInviteHostedProofCorsHeaders("https://og-launcher.example", [
      "https://og-launcher.example",
    ]),
    {
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "OPTIONS, POST",
      "Access-Control-Allow-Origin": "https://og-launcher.example",
      Vary: "Origin",
    },
  );

  assertEquals(
    buildInviteHostedProofCorsHeaders("https://evil.example", [
      "https://og-launcher.example",
    ]),
    {
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "OPTIONS, POST",
      Vary: "Origin",
    },
  );
});

Deno.test("invite hosted proof packet does not echo raw token or token hash", () => {
  const packet = buildInviteHostedProofPacket({
    checkedAt: "2026-06-13T09:30:00.000Z",
    origin: "https://og-launcher.example",
    proof: {
      game_invite_id: "11111111-1111-4111-8111-111111111111",
      game_title: "Neon Circuit",
      invite_status: "accepted",
      max_uses: 1,
      platform: "steam",
      replay_denied: true,
      used_at: "2026-06-13T09:25:00.000Z",
      uses_count: 1,
    },
    replayError: "Invite token is not redeemable.",
    tokenHint: buildShareTokenHint(shareToken),
  });

  assertEquals(packet.replayDenied, true);
  assertEquals(packet.originVerified, true);
  assertEquals(packet.tokenHint, "ogl_header...-tests");
  assertEquals(stableJson(packet).includes(shareToken), false);
  assertEquals(stableJson(packet).includes("token_hash"), false);
  assertEquals(packet.guards.includes("No raw token echoed"), true);
});

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
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}
