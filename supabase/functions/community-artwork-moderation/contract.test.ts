import { parseCommunityArtworkModerationRequest } from "./contract.ts";

const artworkId = "33333333-3333-4333-8333-333333333333";

Deno.test("community artwork moderation contract parses queue requests", () => {
  assertEquals(
    parseCommunityArtworkModerationRequest({
      action: "list_queue",
      limit: 250,
      status: "Rejected",
    }),
    {
      action: "list_queue",
      args: {
        p_limit: 100,
        p_status: "rejected",
      },
      rpcName: "list_community_artwork_moderation_queue",
      status: "ok",
    },
  );
});

Deno.test(
  "community artwork moderation contract parses review requests",
  () => {
    assertEquals(
      parseCommunityArtworkModerationRequest({
        action: "review-artwork",
        artworkId,
        decision: "approved",
        reason: " Looks correct. ",
      }),
      {
        action: "review_artwork",
        args: {
          p_artwork_id: artworkId,
          p_decision: "approve",
          p_reason: "Looks correct.",
        },
        rpcName: "review_community_artwork",
        status: "ok",
      },
    );
  },
);

Deno.test("community artwork moderation contract parses scan requests", () => {
  assertEquals(
    parseCommunityArtworkModerationRequest({
      action: "scan",
      artwork_id: artworkId,
    }),
    {
      action: "scan_artwork",
      args: {
        p_artwork_id: artworkId,
      },
      rpcName: "scan_community_artwork",
      status: "ok",
    },
  );
});

Deno.test(
  "community artwork moderation contract rejects invalid artwork ids",
  () => {
    assertEquals(
      parseCommunityArtworkModerationRequest({
        action: "review",
        artworkId: "not-a-uuid",
        decision: "reject",
      }),
      {
        error: "artworkId must be a valid UUID.",
        status: "error",
        statusCode: 400,
      },
    );
  },
);

Deno.test(
  "community artwork moderation contract rejects unsupported actions",
  () => {
    assertEquals(
      parseCommunityArtworkModerationRequest({ action: "publish" }),
      {
        error: "Community artwork moderation action is not supported.",
        status: "error",
        statusCode: 400,
      },
    );
  },
);

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
