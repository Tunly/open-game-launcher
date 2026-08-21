import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Game } from "../../lib/types";
import { useGameDetailVerify } from "./useGameDetailVerify";

const selectedGame: Game = {
  id: "local-test-game",
  title: "Local Test Game",
  description: "Local game without a source client.",
  version: "1.0.0",
  status: "installed",
  platform: "windows",
  installPath: "C:\\Games\\Local Test Game",
  executablePath: "C:\\Games\\Local Test Game\\game.exe",
};

describe("useGameDetailVerify", () => {
  it("returns no verify data on the base detail route", () => {
    const { result } = renderHook(() => useGameDetailVerify(null, null, selectedGame));

    expect(result.current.crossStoreSaveMigrationReadiness).toBeUndefined();
    expect(result.current.crossStoreSaveSyncPlan).toBeUndefined();
    expect(result.current.hostedCommunityArtworkReadiness).toBeUndefined();
    expect(result.current.hostedCommunityArtworkModerationConsole).toBeUndefined();
    expect(result.current.igdbCrossPlayReadinessPlan).toBeUndefined();
  });

  it("keeps cross-store save sync verification on the local planner", () => {
    const { result } = renderHook(() =>
      useGameDetailVerify("cross-store-save-sync", null, selectedGame),
    );

    expect(result.current.crossStoreSaveSyncPlan?.label).toBe("Review Plan Only");
    expect(result.current.crossStoreSaveMigrationReadiness).toBeUndefined();
  });

  it("adds cross-store save sync E2E readiness for the E2E verification route", () => {
    const { result } = renderHook(() =>
      useGameDetailVerify("cross-store-save-sync-e2e-readiness", null, selectedGame),
    );

    expect(result.current.crossStoreSaveSyncPlan?.label).toBe("Review Plan Only");
    expect(result.current.crossStoreSaveMigrationReadiness?.statusLabel).toBe("Local only");
    expect(result.current.crossStoreSaveMigrationReadiness?.guards).toContain(
      "Rollback restore requires explicit desktop consent",
    );
  });

  it("returns IGDB cross-play readiness for the IGDB verification route", () => {
    const { result } = renderHook(() =>
      useGameDetailVerify("igdb-cross-play-readiness", null, selectedGame),
    );

    expect(result.current.igdbCrossPlayReadinessPlan?.statusLabel).toBe("Local only");
    expect(result.current.crossStoreSaveMigrationReadiness).toBeUndefined();
  });

  it("returns hosted community artwork readiness for the artwork verification route", () => {
    const { result } = renderHook(() =>
      useGameDetailVerify("hosted-community-artwork", null, selectedGame),
    );

    expect(result.current.hostedCommunityArtworkReadiness?.statusLabel).toBe("Hosted v1 staged");
    expect(result.current.hostedCommunityArtworkModerationConsole?.modeLabel).toBe(
      "Local Review Preview",
    );
  });
});
