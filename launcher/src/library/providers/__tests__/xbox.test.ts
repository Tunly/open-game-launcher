import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_KEYS } from "../../../lib/storage-keys";
import type { Game } from "../../../lib/types";
import {
  isProtectedXboxAsset,
  normalizeXboxCatalogTitle,
  preferXboxArtwork,
} from "../xbox-metadata";
import { mergeXboxOwned } from "../xbox";
import type { MergeContext } from "../types";

function makeContext(): MergeContext {
  return {
    forceRefresh: false,
    setStatusMessage: vi.fn(),
    shouldApplyResult: () => true,
  };
}

function installedXboxGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "xbox-installed",
    externalId: "9PFNXM9G4N83",
    title: "Roadside Research",
    description: "Installed game",
    version: "1.0",
    status: "installed",
    platform: "windows",
    launcher: "xbox",
    installPath: "C:\\XboxGames\\Roadside Research",
    executablePath: "C:\\XboxGames\\Roadside Research\\game.exe",
    ...overrides,
  };
}

function linkedXboxGame(overrides: Record<string, unknown> = {}) {
  return {
    id: "xbox-owned-123",
    externalId: "9PFNXM9G4N83",
    title: "Roadside Research (Game Preview)",
    description: "Linked Xbox title",
    coverUrl: "https://xbox.example/display.png",
    logoUrl: null,
    iconUrl: "https://xbox.example/display.png",
    ...overrides,
  };
}

describe("Xbox metadata matching", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("merges linked artwork into an installed Xbox row without a duplicate", async () => {
    localStorage.setItem(STORAGE_KEYS.XBOX_GAMES_CACHE, JSON.stringify([linkedXboxGame()]));

    const result = await mergeXboxOwned([installedXboxGame()], makeContext());

    expect(result.games).toEqual([
      expect.objectContaining({
        id: "xbox-installed",
        status: "installed",
        installPath: "C:\\XboxGames\\Roadside Research",
        coverUrl: "https://xbox.example/display.png",
        iconUrl: "https://xbox.example/display.png",
      }),
    ]);
  });

  it("uses valid linked artwork instead of a protected WindowsApps asset", async () => {
    localStorage.setItem(STORAGE_KEYS.XBOX_GAMES_CACHE, JSON.stringify([linkedXboxGame()]));
    const protectedAsset =
      "C:\\Program Files\\WindowsApps\\Microsoft.Roadside_1.0.0.0_x64__8wekyb3d8bbwe\\Assets\\Splash.png";

    const result = await mergeXboxOwned(
      [installedXboxGame({ coverUrl: protectedAsset, iconUrl: protectedAsset })],
      makeContext(),
    );

    expect(result.games[0]).toMatchObject({
      coverUrl: "https://xbox.example/display.png",
      iconUrl: "https://xbox.example/display.png",
    });
    expect(result.games[0].iconUrls).toContain("https://xbox.example/display.png");
  });

  it("matches a TitleHub PFN to an installed launch URI despite different titles and IDs", async () => {
    localStorage.setItem(
      STORAGE_KEYS.XBOX_GAMES_CACHE,
      JSON.stringify([
        linkedXboxGame({
          id: "xbox-Microsoft.Roadside_8wekyb3d8bbwe",
          externalId: "1234567890",
          title: "Roadside Research",
        }),
      ]),
    );
    const installed = installedXboxGame({
      id: "xbox-installiert",
      title: "Forschung am Straßenrand",
      launchUri: "shell:AppsFolder\\Microsoft.Roadside_8wekyb3d8bbwe!Game",
    });

    const result = await mergeXboxOwned([installed], makeContext());

    expect(result.games).toHaveLength(1);
    expect(result.games[0]).toMatchObject({
      id: "xbox-installiert",
      externalId: "9PFNXM9G4N83",
      status: "installed",
      coverUrl: "https://xbox.example/display.png",
      iconUrl: "https://xbox.example/display.png",
    });
  });

  it("prefers an external ID match over PFN, exact ID, and title aliases", async () => {
    localStorage.setItem(
      STORAGE_KEYS.XBOX_GAMES_CACHE,
      JSON.stringify([
        linkedXboxGame({
          id: "xbox-installed",
          externalId: "2222222222",
          coverUrl: "https://xbox.example/id.png",
          iconUrl: "https://xbox.example/id.png",
        }),
        linkedXboxGame({
          id: "xbox-another-alias",
          externalId: "9PFNXM9G4N83",
          title: "Another catalog title",
          coverUrl: "https://xbox.example/external.png",
          iconUrl: "https://xbox.example/external.png",
        }),
      ]),
    );

    const result = await mergeXboxOwned([installedXboxGame()], makeContext());

    expect(result.games[0]).toMatchObject({
      coverUrl: "https://xbox.example/external.png",
      iconUrl: "https://xbox.example/external.png",
    });
  });

  it("prefers a PFN match over exact ID and title aliases", async () => {
    localStorage.setItem(
      STORAGE_KEYS.XBOX_GAMES_CACHE,
      JSON.stringify([
        linkedXboxGame({
          id: "xbox-installed",
          externalId: "2222222222",
          coverUrl: "https://xbox.example/id.png",
          iconUrl: "https://xbox.example/id.png",
        }),
        linkedXboxGame({
          id: "xbox-Microsoft.Roadside_8wekyb3d8bbwe",
          externalId: "3333333333",
          title: "Another catalog title",
          coverUrl: "https://xbox.example/pfn.png",
          iconUrl: "https://xbox.example/pfn.png",
        }),
      ]),
    );
    const installed = installedXboxGame({
      externalId: undefined,
      launchUri: "shell:AppsFolder\\Microsoft.Roadside_8wekyb3d8bbwe!Game",
    });

    const result = await mergeXboxOwned([installed], makeContext());

    expect(result.games[0]).toMatchObject({
      coverUrl: "https://xbox.example/pfn.png",
      iconUrl: "https://xbox.example/pfn.png",
    });
  });

  it("appends linked aliases for the same external identity only once", async () => {
    localStorage.setItem(
      STORAGE_KEYS.XBOX_GAMES_CACHE,
      JSON.stringify([
        linkedXboxGame({ id: "xbox-Microsoft.Roadside_8wekyb3d8bbwe" }),
        linkedXboxGame({ id: "xbox-owned-123", title: "Roadside Research" }),
      ]),
    );

    const result = await mergeXboxOwned([], makeContext());

    expect(result.games).toHaveLength(1);
    expect(result.games[0]).toMatchObject({
      externalId: "9PFNXM9G4N83",
      title: "Roadside Research (Game Preview)",
    });
  });

  it("normalizes only known Xbox catalog qualifiers", () => {
    expect(normalizeXboxCatalogTitle("Roadside Research (Spielvorschau)")).toBe(
      normalizeXboxCatalogTitle("Roadside Research"),
    );
    expect(normalizeXboxCatalogTitle("Roadside Research (Game Preview)")).toBe(
      normalizeXboxCatalogTitle("Roadside Research"),
    );
    expect(normalizeXboxCatalogTitle("Roadside Research (Deluxe Edition)")).not.toBe(
      normalizeXboxCatalogTitle("Roadside Research"),
    );
  });

  it("recognizes protected WindowsApps paths without rejecting app-local assets", () => {
    expect(
      isProtectedXboxAsset(
        "C:\\Program Files\\WindowsApps\\Microsoft.Roadside_1.0.0.0_x64__8wekyb3d8bbwe\\Assets\\Logo.png",
      ),
    ).toBe(true);
    expect(
      isProtectedXboxAsset(
        "D:\\WindowsApps\\Microsoft.Roadside_1.0.0.0_x64__8wekyb3d8bbwe\\Logo.png",
      ),
    ).toBe(true);
    expect(
      isProtectedXboxAsset("C:\\Users\\Danie\\AppData\\Local\\OG Launcher\\xbox-assets\\logo.png"),
    ).toBe(false);
    expect(isProtectedXboxAsset("https://xbox.example/display.png")).toBe(false);
  });

  it("accepts only safe local or HTTPS artwork candidates when current artwork is missing", () => {
    expect(preferXboxArtwork(undefined, "not artwork")).toBeUndefined();
    expect(preferXboxArtwork(undefined, "http://xbox.example/display.png")).toBeUndefined();
    expect(
      preferXboxArtwork(
        undefined,
        "D:\\WindowsApps\\Microsoft.Roadside_1.0.0.0_x64__8wekyb3d8bbwe\\Logo.png",
      ),
    ).toBeUndefined();
    expect(preferXboxArtwork(undefined, "https://xbox.example/display.png")).toBe(
      "https://xbox.example/display.png",
    );
    expect(
      preferXboxArtwork(
        undefined,
        "C:\\Users\\Danie\\AppData\\Local\\open-game-launcher\\xbox-assets\\logo.png",
      ),
    ).toBe("C:\\Users\\Danie\\AppData\\Local\\open-game-launcher\\xbox-assets\\logo.png");
  });

  it("clears unrenderable current raw paths when no usable replacement exists", () => {
    expect(
      preferXboxArtwork(
        "C:\\Program Files\\WindowsApps\\Microsoft.Roadside_1.0.0.0_x64__8wekyb3d8bbwe\\Logo.png",
        undefined,
      ),
    ).toBeUndefined();
    expect(
      preferXboxArtwork("C:\\XboxGames\\Roadside Research\\Content\\Logo.png", undefined),
    ).toBeUndefined();
    expect(
      preferXboxArtwork(undefined, "C:\\XboxGames\\Roadside Research\\Content\\Logo.png"),
    ).toBeUndefined();
  });
});
