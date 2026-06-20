import { buildCommunityArtworkScanPacket } from "./scan-policy.ts";

Deno.test("community artwork scan policy passes clean hosted uploads", () => {
  const result = buildCommunityArtworkScanPacket({
    artist_name: "Manga Relay",
    description: "Original creator upload.",
    id: "art-1",
    kind: "cover",
    report_count: 0,
    source_url:
      "game-artwork/11111111-1111-4111-8111-111111111111/games/steam-123/cover.png",
    storage_path:
      "11111111-1111-4111-8111-111111111111/games/steam-123/cover.png",
    tags: ["cover", "community"],
    title: "Clean Cover",
  });

  assertEquals(result.verdict, "passed");
  assertEquals(result.signals, []);
  assertEquals(result.metadata.sourceKind, "hosted-storage");
});

Deno.test("community artwork scan policy blocks unsafe text and paths", () => {
  const result = buildCommunityArtworkScanPacket({
    artist_name: "Unknown",
    description: "stolen explicit art",
    id: "art-2",
    kind: "cover",
    report_count: 0,
    source_url: "ftp://example.invalid/cover.png",
    storage_path: "../cover.png",
    tags: [],
    title: "Unsafe Cover",
  });

  assertEquals(result.verdict, "blocked");
  assertEquals(result.signals, [
    "blocked-text-signal",
    "storage-path-outside-owner-game-folder",
    "unsafe-source-url",
  ]);
});

Deno.test(
  "community artwork scan policy flags provider and report context",
  () => {
    const result = buildCommunityArtworkScanPacket({
      artist_name: "Provider Import",
      description: "Needs source review.",
      id: "art-3",
      kind: "logo",
      report_count: 2,
      source_url: "https://media.rawg.io/media/games/logo.png",
      storage_path: null,
      tags: ["logo"],
      title: "Provider Logo",
    });

    assertEquals(result.verdict, "needs_review");
    assertEquals(result.signals, [
      "existing-report-context",
      "provider-source-review",
    ]);
    assertEquals(result.metadata.providerReviewHost, "media.rawg.io");
  },
);

Deno.test("community artwork scan policy passes approved Steam provider paths", () => {
  const result = buildCommunityArtworkScanPacket({
    artist_name: "Provider Import",
    description: "Steam static source with app id.",
    id: "art-4",
    kind: "cover",
    game_id: "steam-440",
    report_count: 0,
    source_url:
      "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/440/header.jpg",
    storage_path: null,
    tags: ["cover"],
    title: "Steam Cover",
  });

  assertEquals(result.verdict, "passed");
  assertEquals(result.signals, ["provider-source-approved"]);
  assertEquals(result.metadata.providerPolicy, {
    host: "shared.cloudflare.steamstatic.com",
    provider: "steam",
    reason: "Steam static artwork path contains an approved Steam app id.",
    sourceId: "440",
    verdict: "approved",
  });
});

Deno.test("community artwork scan policy blocks mismatched Steam provider paths", () => {
  const result = buildCommunityArtworkScanPacket({
    artist_name: "Provider Import",
    description: "Steam static source with wrong app id.",
    id: "art-5",
    kind: "cover",
    game_id: "steam-570",
    report_count: 0,
    source_url:
      "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/440/header.jpg",
    storage_path: null,
    tags: ["cover"],
    title: "Wrong Steam Cover",
  });

  assertEquals(result.verdict, "blocked");
  assertEquals(result.signals, ["provider-source-mismatch"]);
  assertEquals(result.metadata.providerPolicy, {
    host: "shared.cloudflare.steamstatic.com",
    provider: "steam",
    reason: "Steam provider URL app id does not match the artwork game id.",
    sourceId: "440",
    verdict: "blocked",
  });
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
    return `{${
      Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
        .join(",")
    }}`;
  }

  return JSON.stringify(value);
}
