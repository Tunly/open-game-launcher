import { describe, expect, it } from "vitest";

import {
  customArtworkHasKind,
  getAutoArtworkCandidates,
  getLocalCommunityArtworkCandidates,
  isCommunityArtworkImported,
  type GameCustomArtwork,
} from "../custom-artwork";
import type { Game } from "../types";

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    description: "",
    id: "steam-440",
    launcher: "steam",
    platform: "windows",
    status: "installed",
    title: "Team Fortress 2",
    version: "1.0.0",
    ...overrides,
  };
}

describe("custom artwork helpers", () => {
  it("builds Steam cover icon and logo candidates from app id", () => {
    const candidates = getAutoArtworkCandidates(makeGame({ externalId: "440" }));

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "cover", sourceLabel: "Steam Header" }),
        expect.objectContaining({ kind: "cover", sourceLabel: "Steam Capsule" }),
        expect.objectContaining({ kind: "icon", sourceLabel: "Steam Icon" }),
        expect.objectContaining({ kind: "logo", sourceLabel: "Steam Logo" }),
      ]),
    );
    expect(
      candidates
        .filter((candidate) => candidate.sourceLabel.startsWith("Steam "))
        .map((candidate) => candidate.providerPolicy),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "steam",
          sourceId: "440",
          verdict: "approved",
        }),
      ]),
    );
  });

  it("deduplicates repeated launcher artwork urls per kind", () => {
    const candidates = getAutoArtworkCandidates(
      makeGame({
        coverUrl: "https://cdn.example/cover.jpg",
        iconUrl: "https://cdn.example/icon.png",
        iconUrls: ["https://cdn.example/icon.png"],
      }),
    );

    expect(
      candidates.filter((candidate) => candidate.url === "https://cdn.example/icon.png"),
    ).toHaveLength(1);
  });

  it("detects existing custom artwork by kind", () => {
    const artwork: GameCustomArtwork = { coverUrl: "data:image/jpeg;base64,cover" };

    expect(customArtworkHasKind(artwork, "cover")).toBe(true);
    expect(customArtworkHasKind(artwork, "logo")).toBe(false);
  });

  it("provides deduplicated local community artwork import candidates", () => {
    const candidates = getLocalCommunityArtworkCandidates();

    expect(candidates).toHaveLength(3);
    expect(candidates.map((candidate) => candidate.kind)).toEqual(["cover", "icon", "logo"]);
    expect(candidates.every((candidate) => candidate.url.startsWith("/artwork/"))).toBe(true);
    expect(new Set(candidates.map((candidate) => `${candidate.kind}:${candidate.url}`)).size).toBe(
      candidates.length,
    );
  });

  it("detects imported community artwork by matching the applied URL", () => {
    const [candidate] = getLocalCommunityArtworkCandidates();
    const artwork: GameCustomArtwork = { coverUrl: candidate.url };

    expect(isCommunityArtworkImported(artwork, candidate)).toBe(true);
    expect(isCommunityArtworkImported({ coverUrl: "/artwork/other.svg" }, candidate)).toBe(false);
  });
});
