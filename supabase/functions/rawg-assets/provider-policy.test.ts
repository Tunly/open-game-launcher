import {
  buildRawgAssetProviderPolicyEvidence,
  type RawgAssetProviderPolicyEvidence,
} from "./provider-policy.ts";

Deno.test("RAWG provider policy approves media tied to a RAWG game id", () => {
  const evidence = buildRawgAssetProviderPolicyEvidence({
    coverUrl: "https://media.rawg.io/media/games/cover.jpg",
    gameId: 3498,
    iconUrl: "https://media.rawg.io/media/screenshots/icon.jpg",
  });

  assertEquals(evidence, {
    assets: [
      {
        host: "media.rawg.io",
        kind: "cover",
        reason: "RAWG media asset is tied to a RAWG game API result.",
        url: "https://media.rawg.io/media/games/cover.jpg",
        verdict: "approved",
      },
      {
        host: "media.rawg.io",
        kind: "icon",
        reason: "RAWG media asset is tied to a RAWG game API result.",
        url: "https://media.rawg.io/media/screenshots/icon.jpg",
        verdict: "approved",
      },
    ],
    policyVersion: "2026-06-12",
    provider: "rawg",
    reason: "RAWG artwork is backed by RAWG game 3498 and RAWG media URLs.",
    sourceId: "3498",
    verdict: "approved",
  });
});

Deno.test("RAWG provider policy reviews media without a RAWG game id", () => {
  const evidence = buildRawgAssetProviderPolicyEvidence({
    coverUrl: "https://media.rawg.io/media/games/cover.jpg",
    gameId: null,
    iconUrl: null,
  });

  assertEquals(evidence.verdict, "review");
  assertEquals(evidence.sourceId, null);
  assertEquals(evidence.assets[0]?.verdict, "review");
});

Deno.test("RAWG provider policy blocks non-RAWG media hosts", () => {
  const evidence = buildRawgAssetProviderPolicyEvidence({
    coverUrl: "https://cdn.example.invalid/cover.jpg",
    gameId: 3498,
    iconUrl: null,
  });

  assertEquals(evidence.verdict, "blocked");
  assertEquals(evidence.assets[0]?.host, "cdn.example.invalid");
});

function assertEquals(
  actual: unknown,
  expected: RawgAssetProviderPolicyEvidence | string | null | undefined,
) {
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
