import { describe, expect, it } from "vitest";

import { auditLibraryArtwork } from "./library-artwork-audit";
import type { Game } from "./types";

function game(overrides: Partial<Game> = {}): Game {
  return {
    description: "",
    id: "steam-1",
    launcher: "steam",
    platform: "windows",
    status: "installed",
    title: "Test Game",
    version: "1.0",
    ...overrides,
  };
}

describe("auditLibraryArtwork", () => {
  it("reports games without any image candidate grouped by launcher", () => {
    const report = auditLibraryArtwork([
      game({ id: "steam-1", title: "Missing Steam" }),
      game({
        id: "gog-2",
        launcher: "gog",
        title: "Has GOG Icon",
        iconUrls: ["https://example.test/icon.png"],
      }),
      game({ id: "ea-3", launcher: "ea", title: "Missing EA" }),
    ]);

    expect(report.totalGames).toBe(3);
    expect(report.missingCount).toBe(2);
    expect(report.byLauncher).toEqual([
      { launcher: "steam", label: "Steam", games: ["Missing Steam"] },
      { launcher: "ea", label: "EA", games: ["Missing EA"] },
    ]);
  });

  it("uses manual for games without a launcher and counts array fallbacks as artwork", () => {
    const report = auditLibraryArtwork([
      game({ id: "manual-1", launcher: undefined, title: "Manual Game", logoUrls: ["logo"] }),
      game({ id: "manual-2", launcher: undefined, title: "No Artwork" }),
    ]);

    expect(report.byLauncher).toEqual([
      { launcher: "manual", label: "Manual", games: ["No Artwork"] },
    ]);
  });

  it("treats image URLs that failed to load as missing artwork", () => {
    const report = auditLibraryArtwork(
      [
        game({
          title: "Broken Cover",
          coverUrl: "https://cdn.example.test/broken.jpg",
          iconUrl: "https://cdn.example.test/icon.png",
        }),
      ],
      new Set(["https://cdn.example.test/broken.jpg", "https://cdn.example.test/icon.png"]),
    );

    expect(report.missingCount).toBe(1);
    expect(report.byLauncher[0]?.games).toEqual(["Broken Cover"]);
  });
});
