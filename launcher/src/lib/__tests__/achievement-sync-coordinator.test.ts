import { describe, expect, it, vi } from "vitest";

import {
  achievementProviderSyncGameKey,
  coordinateAchievementProviderSync,
} from "../achievement-sync-coordinator";
import type { Game } from "../types";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("achievement sync coordinator", () => {
  it("uses collision-safe, case-preserving game keys", () => {
    const game = (id: string, externalId: string): Game => ({
      description: "",
      externalId,
      id,
      launcher: "xbox",
      platform: "windows",
      status: "installed",
      title: id,
      version: "1.0.0",
    });

    expect(achievementProviderSyncGameKey(game("a:b", "c"), "xbox")).not.toBe(
      achievementProviderSyncGameKey(game("a", "b:c"), "xbox"),
    );
    expect(achievementProviderSyncGameKey(game("CaseID", "c"), "xbox")).not.toBe(
      achievementProviderSyncGameKey(game("caseid", "c"), "xbox"),
    );
  });

  it("serializes different games from the same provider", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const firstSync = vi.fn(() => first.promise);
    const secondSync = vi.fn(() => second.promise);

    const firstResult = coordinateAchievementProviderSync({
      gameKey: "xbox:first",
      provider: "xbox",
      sync: firstSync,
    });
    const secondResult = coordinateAchievementProviderSync({
      gameKey: "xbox:second",
      provider: "xbox",
      sync: secondSync,
    });

    await vi.waitFor(() => expect(firstSync).toHaveBeenCalledTimes(1));
    expect(secondSync).not.toHaveBeenCalled();
    first.resolve("first-result");
    await expect(firstResult).resolves.toBe("first-result");
    await vi.waitFor(() => expect(secondSync).toHaveBeenCalledTimes(1));
    second.resolve("second-result");
    await expect(secondResult).resolves.toBe("second-result");
  });

  it("deduplicates the same game across independent callers", async () => {
    const pending = deferred<string>();
    const archiveSync = vi.fn(() => pending.promise);
    const librarySync = vi.fn(() => Promise.resolve("duplicate-result"));

    const archiveResult = coordinateAchievementProviderSync({
      gameKey: "gog:shared",
      provider: "gog",
      sync: archiveSync,
    });
    const libraryResult = coordinateAchievementProviderSync({
      gameKey: "gog:shared",
      provider: "gog",
      sync: librarySync,
    });

    await vi.waitFor(() => expect(archiveSync).toHaveBeenCalledTimes(1));
    expect(librarySync).not.toHaveBeenCalled();
    pending.resolve("shared-result");
    await expect(Promise.all([archiveResult, libraryResult])).resolves.toEqual([
      "shared-result",
      "shared-result",
    ]);
  });
});
