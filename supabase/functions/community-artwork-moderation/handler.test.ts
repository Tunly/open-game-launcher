import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  type CommunityArtworkModerationHandlerDeps,
  handleCommunityArtworkModeration,
} from "./handler.ts";
import type {
  CommunityArtworkScanInput,
  CommunityArtworkScanPacket,
} from "./scan-policy.ts";

const endpoint = "https://functions.example/community-artwork-moderation";
const moderatorUserId = "22222222-2222-4222-8222-222222222222";
const artworkId = "33333333-3333-4333-8333-333333333333";

Deno.test("community artwork moderation handler answers CORS and method guards without dependencies", async () => {
  const deps = stubDeps({
    getUserId: () => {
      throw new Error("auth should not be checked");
    },
  });

  const optionsResponse = await handleCommunityArtworkModeration(
    new Request(endpoint, { method: "OPTIONS" }),
    deps,
  );
  assertEquals(optionsResponse.status, 200);
  assertEquals(optionsResponse.headers.get("Access-Control-Allow-Origin"), "*");
  assertEquals(
    optionsResponse.headers.get("Access-Control-Allow-Methods"),
    "POST, OPTIONS",
  );

  const getResponse = await handleCommunityArtworkModeration(
    new Request(endpoint, { method: "GET" }),
    deps,
  );
  assertEquals(getResponse.status, 405);
  assertEquals(await getResponse.json(), { error: "Method not allowed." });
});

Deno.test("community artwork moderation handler requires auth before body parsing", async () => {
  let roleReads = 0;
  const response = await handleCommunityArtworkModeration(
    new Request(endpoint, {
      body: "{",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
    stubDeps({
      getActiveModeratorRole: async () => {
        roleReads += 1;
        return "moderator";
      },
      getUserId: async () => null,
    }),
  );

  assertEquals(response.status, 401);
  assertEquals(await response.json(), { error: "Invalid or expired token." });
  assertEquals(roleReads, 0);
});

Deno.test("community artwork moderation handler rejects invalid bodies before moderator reads", async () => {
  let roleReads = 0;
  const response = await handleCommunityArtworkModeration(
    jsonRequest({ action: "publish" }),
    stubDeps({
      getActiveModeratorRole: async () => {
        roleReads += 1;
        return "moderator";
      },
    }),
  );

  assertEquals(response.status, 400);
  assertEquals(await response.json(), {
    error: "Community artwork moderation action is not supported.",
  });
  assertEquals(roleReads, 0);
});

Deno.test("community artwork moderation handler blocks inactive reviewers before RPC", async () => {
  let rpcCalls = 0;
  const response = await handleCommunityArtworkModeration(
    jsonRequest({ action: "list_queue", status: "pending" }),
    stubDeps({
      callModerationRpc: async () => {
        rpcCalls += 1;
        return { data: [], error: null };
      },
      getActiveModeratorRole: async () => null,
    }),
  );

  assertEquals(response.status, 403);
  assertEquals(await response.json(), {
    error: "Community artwork reviewer is not active.",
  });
  assertEquals(rpcCalls, 0);
});

Deno.test("community artwork moderation handler lists queue with service-role RPC", async () => {
  const rpcCalls: Array<{ args: Record<string, unknown>; rpcName: string }> =
    [];
  const response = await handleCommunityArtworkModeration(
    jsonRequest({ action: "queue", limit: 250, status: "Rejected" }),
    stubDeps({
      callModerationRpc: async (rpcName, args) => {
        rpcCalls.push({ args, rpcName });
        return { data: [{ id: artworkId }], error: null };
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    action: "list_queue",
    data: [{ id: artworkId }],
    reviewerRole: "moderator",
    rpc: "list_community_artwork_moderation_queue",
  });
  assertEquals(rpcCalls, [
    {
      args: { p_limit: 100, p_status: "rejected" },
      rpcName: "list_community_artwork_moderation_queue",
    },
  ]);
});

Deno.test("community artwork moderation handler injects authenticated reviewer for reviews", async () => {
  const rpcCalls: Array<{ args: Record<string, unknown>; rpcName: string }> =
    [];
  const response = await handleCommunityArtworkModeration(
    jsonRequest({
      action: "review",
      artworkId,
      decision: "approve",
      p_reviewer_user_id: "browser-spoof",
      reason: "Looks good",
    }),
    stubDeps({
      callModerationRpc: async (rpcName, args) => {
        rpcCalls.push({ args, rpcName });
        return { data: { status: "approved" }, error: null };
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    action: "review_artwork",
    data: { status: "approved" },
    reviewerRole: "moderator",
    rpc: "review_community_artwork",
  });
  assertEquals(rpcCalls, [
    {
      args: {
        p_artwork_id: artworkId,
        p_decision: "approve",
        p_reason: "Looks good",
        p_reviewer_user_id: moderatorUserId,
      },
      rpcName: "review_community_artwork",
    },
  ]);
});

Deno.test("community artwork moderation handler maps review RPC errors", async () => {
  const response = await handleCommunityArtworkModeration(
    jsonRequest({
      action: "review",
      artworkId,
      decision: "reject",
    }),
    stubDeps({
      callModerationRpc: async () => ({
        data: null,
        error: { message: "Review RPC rejected" },
      }),
    }),
  );

  assertEquals(response.status, 400);
  assertEquals(await response.json(), {
    action: "review_artwork",
    error: "Review RPC rejected",
    rpc: "review_community_artwork",
  });
});

Deno.test("community artwork moderation handler returns scan 404 before RPC", async () => {
  let scanCalls = 0;
  const response = await handleCommunityArtworkModeration(
    jsonRequest({ action: "scan", artwork_id: artworkId }),
    stubDeps({
      readArtworkForScan: async () => null,
      scanCommunityArtwork: async () => {
        scanCalls += 1;
        return { data: null, error: null };
      },
    }),
  );

  assertEquals(response.status, 404);
  assertEquals(await response.json(), {
    action: "scan_artwork",
    error: "Community artwork submission not found.",
    rpc: "scan_community_artwork",
  });
  assertEquals(scanCalls, 0);
});

Deno.test("community artwork moderation handler scans artwork with policy packet", async () => {
  const scans: Array<
    { artworkId: string; packet: CommunityArtworkScanPacket }
  > = [];
  const response = await handleCommunityArtworkModeration(
    jsonRequest({ action: "scan", artwork_id: artworkId }),
    stubDeps({
      readArtworkForScan: async () =>
        artwork({
          description: "Needs source review.",
          report_count: 2,
          source_url: "https://media.rawg.io/media/games/logo.png",
        }),
      scanCommunityArtwork: async (id, packet) => {
        scans.push({ artworkId: id, packet });
        return { data: { scan_id: "scan-1" }, error: null };
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    action: "scan_artwork",
    data: { scan_id: "scan-1" },
    reviewerRole: "moderator",
    rpc: "scan_community_artwork",
  });
  assertEquals(scans.length, 1);
  assertEquals(scans[0].artworkId, artworkId);
  assertEquals(scans[0].packet.verdict, "needs_review");
  assertEquals(scans[0].packet.signals, [
    "existing-report-context",
    "provider-source-review",
  ]);
});

Deno.test("community artwork moderation handler maps scan RPC errors", async () => {
  const response = await handleCommunityArtworkModeration(
    jsonRequest({ action: "scan", artwork_id: artworkId }),
    stubDeps({
      scanCommunityArtwork: async () => ({
        data: null,
        error: { message: "Scan RPC rejected" },
      }),
    }),
  );

  assertEquals(response.status, 400);
  assertEquals(await response.json(), {
    action: "scan_artwork",
    error: "Scan RPC rejected",
    rpc: "scan_community_artwork",
  });
});

function jsonRequest(body: unknown): Request {
  return new Request(endpoint, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

function artwork(
  overrides: Partial<CommunityArtworkScanInput> = {},
): CommunityArtworkScanInput {
  return {
    artist_name: "Manga Relay",
    description: "Original creator upload.",
    game_id: "steam-123",
    id: artworkId,
    kind: "cover",
    moderation_status: "pending",
    report_count: 0,
    source_url:
      "game-artwork/11111111-1111-4111-8111-111111111111/games/steam-123/cover.png",
    storage_path:
      "11111111-1111-4111-8111-111111111111/games/steam-123/cover.png",
    tags: ["cover", "community"],
    title: "Clean Cover",
    ...overrides,
  };
}

function stubDeps(
  overrides: Partial<CommunityArtworkModerationHandlerDeps> = {},
): CommunityArtworkModerationHandlerDeps {
  return {
    callModerationRpc: async () => ({ data: { ok: true }, error: null }),
    getActiveModeratorRole: async () => "moderator",
    getUserId: async () => moderatorUserId,
    readArtworkForScan: async () => artwork(),
    scanCommunityArtwork: async () => ({ data: { ok: true }, error: null }),
    ...overrides,
  };
}
