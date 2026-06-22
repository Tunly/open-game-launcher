import { describe, expect, it } from "vitest";

import {
  buildModProviderGameIdHints,
  buildModProviderGameIdPromotionEvidence,
  getEffectiveModProviderGameId,
  getModProviderGameIdSource,
  getPreferredModProviderGameId,
  getStoredModProviderGameId,
  normalizeModProviderGameId,
  normalizeModProviderGameIdMappings,
  readModProviderGameIdMappings,
  removeModProviderGameIdMapping,
  setModProviderGameIdMapping,
  sharedModProviderGameMappingsToLocalShape,
  slugifyProviderId,
  writeModProviderGameIdMappings,
} from "../mod-provider-game-ids";
import { STORAGE_KEYS } from "../storage-keys";
import type { Game } from "../types";

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "steam-owned-1086940",
    title: "Baldur's Gate 3",
    slug: "baldurs-gate-3",
    description: "",
    version: "1.0",
    launcher: "steam",
    externalId: "1086940",
    platform: "windows",
    status: "installed",
    ...overrides,
  };
}

describe("mod provider game id hints", () => {
  it("uses local slugs before Steam AppIDs for mod.io", () => {
    const game = makeGame();
    const hints = buildModProviderGameIdHints(game, "modio");

    expect(getPreferredModProviderGameId(game, "modio")).toBe("baldurs-gate-3");
    expect(hints[0]).toMatchObject({
      label: "Library Slug",
      value: "baldurs-gate-3",
      action: "use",
    });
    expect(hints).toContainEqual(
      expect.objectContaining({
        label: "Steam AppID",
        value: "1086940",
        action: "reference",
      }),
    );
  });

  it("deduplicates matching library and title slugs", () => {
    const hints = buildModProviderGameIdHints(makeGame(), "modio");

    expect(hints.filter((hint) => hint.value === "baldurs-gate-3")).toHaveLength(1);
  });

  it("uses explicit CurseForge markers when present", () => {
    const game = makeGame({
      id: "manual-game",
      slug: "curseforge:432",
      launcher: "manual",
      externalId: undefined,
    });

    expect(getPreferredModProviderGameId(game, "curseforge")).toBe("432");
    expect(buildModProviderGameIdHints(game, "curseforge")[0]).toMatchObject({
      label: "CurseForge ID",
      value: "432",
      action: "use",
    });
  });

  it("keeps Steam AppIDs as CurseForge reference hints", () => {
    const game = makeGame();
    const hints = buildModProviderGameIdHints(game, "curseforge");

    expect(getPreferredModProviderGameId(game, "curseforge")).toBe("");
    expect(hints).toContainEqual(
      expect.objectContaining({
        label: "Steam AppID",
        value: "1086940",
        action: "reference",
      }),
    );
  });

  it("normalizes provider slugs", () => {
    expect(slugifyProviderId("  Dragon's Dogma II: Deluxe  ")).toBe("dragons-dogma-ii-deluxe");
  });

  it("builds provider API promotion evidence from matching native search results", () => {
    expect(
      buildModProviderGameIdPromotionEvidence({
        provider: "modio",
        providerGameId: " https://mod.io/g/Baldurs Gate 3/mods ",
        query: " dice ",
        results: [
          {
            author: "Larian",
            downloadUrl: "https://cdn.example.test/bg3.zip",
            downloads: "1K",
            externalId: "123",
            fileSizeBytes: 42,
            follows: "5",
            iconUrl: null,
            latestVersion: "1.0",
            name: "Dice Skin",
            provider: "modio",
            summary: "Adds dice.",
            url: "https://mod.io/g/baldurs-gate-3/m/dice-skin",
          },
        ],
      }),
    ).toEqual({
      provider: "modio",
      providerGameId: "baldurs-gate-3",
      query: "dice",
      resultCount: 1,
      sampleExternalIds: ["123"],
    });
  });

  it("does not build promotion evidence from empty or mismatched native results", () => {
    expect(
      buildModProviderGameIdPromotionEvidence({
        provider: "curseforge",
        providerGameId: "432",
        query: "inventory",
        results: [],
      }),
    ).toBeNull();
    expect(
      buildModProviderGameIdPromotionEvidence({
        provider: "curseforge",
        providerGameId: "432",
        query: "inventory",
        results: [
          {
            author: null,
            downloadUrl: null,
            downloads: null,
            externalId: "999",
            fileSizeBytes: null,
            follows: null,
            iconUrl: null,
            latestVersion: null,
            name: "Wrong Provider",
            provider: "modio",
            summary: null,
            url: "https://mod.io/g/example/m/wrong-provider",
          },
        ],
      }),
    ).toBeNull();
  });
});

describe("mod provider game id mapping", () => {
  it("reads an empty mapping when localStorage is empty or invalid", () => {
    expect(readModProviderGameIdMappings()).toEqual({});

    window.localStorage.setItem(STORAGE_KEYS.MODS_PROVIDER_GAME_IDS, "not-json");
    expect(readModProviderGameIdMappings()).toEqual({});

    window.localStorage.setItem(STORAGE_KEYS.MODS_PROVIDER_GAME_IDS, JSON.stringify([]));
    expect(readModProviderGameIdMappings()).toEqual({});
  });

  it("persists mappings per game and provider", () => {
    let mappings = setModProviderGameIdMapping({}, "game-a", "modio", "  baldurs-gate-3  ");
    mappings = setModProviderGameIdMapping(mappings, "game-a", "curseforge", " 432 ");
    mappings = setModProviderGameIdMapping(mappings, "game-b", "modio", "skyrim");

    expect(getStoredModProviderGameId(mappings, { id: "game-a" }, "modio")).toBe("baldurs-gate-3");
    expect(getStoredModProviderGameId(mappings, { id: "game-a" }, "curseforge")).toBe("432");
    expect(getStoredModProviderGameId(mappings, { id: "game-b" }, "modio")).toBe("skyrim");
    expect(getStoredModProviderGameId(mappings, { id: "game-b" }, "curseforge")).toBe("");
  });

  it("rejects non-numeric CurseForge mappings", () => {
    expect(normalizeModProviderGameId("curseforge", "minecraft")).toBe("");
    expect(normalizeModProviderGameId("curseforge", "cf:432")).toBe("");
    expect(normalizeModProviderGameId("curseforge", "12.3")).toBe("");
    expect(setModProviderGameIdMapping({}, "game-a", "curseforge", "minecraft")).toEqual({});
  });

  it("normalizes mod.io mappings to slug or numeric id format", () => {
    expect(normalizeModProviderGameId("modio", "  Baldur's Gate 3  ")).toBe("baldurs-gate-3");
    expect(normalizeModProviderGameId("modio", "https://mod.io/g/Cyber Drift/mods")).toBe(
      "cyber-drift",
    );
    expect(normalizeModProviderGameId("modio", "12345")).toBe("12345");
  });

  it("normalizes persisted JSON and drops invalid provider values", () => {
    expect(
      normalizeModProviderGameIdMappings({
        "game-a": {
          modio: " cyberpunk-2077 ",
          curseforge: "nope",
          ignored: "value",
        },
        "game-b": {
          curseforge: " 432 ",
        },
        "game-c": null,
      }),
    ).toEqual({
      "game-a": { modio: "cyberpunk-2077" },
      "game-b": { curseforge: "432" },
    });
  });

  it("writes and removes stored mappings without deleting unrelated entries", () => {
    let mappings = setModProviderGameIdMapping({}, "game-a", "modio", "baldurs-gate-3");
    mappings = setModProviderGameIdMapping(mappings, "game-a", "curseforge", "432");
    mappings = setModProviderGameIdMapping(mappings, "game-b", "modio", "fallout-4");

    const next = removeModProviderGameIdMapping(mappings, "game-a", "modio");
    writeModProviderGameIdMappings(next);

    expect(
      JSON.parse(window.localStorage.getItem(STORAGE_KEYS.MODS_PROVIDER_GAME_IDS) ?? "{}"),
    ).toEqual({
      "game-a": { curseforge: "432" },
      "game-b": { modio: "fallout-4" },
    });
  });

  it("uses stored mappings before heuristic hints", () => {
    const game = makeGame();
    const mappings = setModProviderGameIdMapping({}, game.id, "modio", "bg3");

    expect(getEffectiveModProviderGameId(game, "modio", mappings)).toBe("bg3");
    expect(getEffectiveModProviderGameId(game, "curseforge", mappings)).toBe("");
    expect(getEffectiveModProviderGameId(game, "modio", {})).toBe("baldurs-gate-3");
  });

  it("uses local mappings before shared mappings and shared mappings before hints", () => {
    const game = makeGame();
    const localMappings = setModProviderGameIdMapping({}, game.id, "modio", "local-bg3");
    const sharedMappings = setModProviderGameIdMapping({}, game.id, "modio", "shared-bg3");

    expect(getEffectiveModProviderGameId(game, "modio", localMappings, sharedMappings)).toBe(
      "local-bg3",
    );
    expect(getModProviderGameIdSource(game, "modio", localMappings, sharedMappings)).toBe("local");
    expect(getEffectiveModProviderGameId(game, "modio", {}, sharedMappings)).toBe("shared-bg3");
    expect(getModProviderGameIdSource(game, "modio", {}, sharedMappings)).toBe("shared");
    expect(getEffectiveModProviderGameId(game, "modio", {}, {})).toBe("baldurs-gate-3");
    expect(getModProviderGameIdSource(game, "modio", {}, {})).toBe("hint");
  });

  it("collapses shared mapping rows by verification and confidence", () => {
    const mappings = sharedModProviderGameMappingsToLocalShape([
      {
        confidence: "low",
        createdAt: "2026-06-10T10:00:00.000Z",
        id: "low",
        localGameId: "game-a",
        provider: "modio",
        providerGameId: "low-id",
        source: "local_hint",
        status: "active",
        updatedAt: "2026-06-10T10:00:00.000Z",
      },
      {
        confidence: "verified",
        createdAt: "2026-06-10T09:00:00.000Z",
        id: "verified",
        localGameId: "game-a",
        provider: "modio",
        providerGameId: "verified-id",
        source: "admin",
        status: "active",
        updatedAt: "2026-06-10T09:00:00.000Z",
        verifiedAt: "2026-06-10T09:30:00.000Z",
      },
      {
        confidence: "high",
        createdAt: "2026-06-10T11:00:00.000Z",
        id: "archived",
        localGameId: "game-b",
        provider: "curseforge",
        providerGameId: "999",
        source: "provider_api",
        status: "archived",
        updatedAt: "2026-06-10T11:00:00.000Z",
      },
    ]);

    expect(mappings).toEqual({
      "game-a": { modio: "verified-id" },
    });
  });
});
