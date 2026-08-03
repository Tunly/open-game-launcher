import { describe, expect, it } from "vitest";

import {
  calculateSteamAverageGameCompletionRate,
  calculateSteamGameCompletionPercent,
} from "../achievement-completion";

describe("calculateSteamGameCompletionPercent", () => {
  it("rounds a game's achievement percentage to the nearest whole number like Steam", () => {
    expect(calculateSteamGameCompletionPercent({ unlocked: 2, total: 3 })).toBe(67);
    expect(calculateSteamGameCompletionPercent({ unlocked: 1, total: 3 })).toBe(33);
  });

  it("keeps invalid and out-of-range progress within zero and one hundred percent", () => {
    expect(calculateSteamGameCompletionPercent({ unlocked: 4, total: 3 })).toBe(100);
    expect(calculateSteamGameCompletionPercent({ unlocked: -1, total: 3 })).toBe(0);
    expect(calculateSteamGameCompletionPercent({ unlocked: 1, total: 0 })).toBe(0);
  });
});

describe("calculateSteamAverageGameCompletionRate", () => {
  it("averages unrounded game percentages with equal weight and floors only the final result", () => {
    expect(
      calculateSteamAverageGameCompletionRate([
        { unlocked: 3, total: 10 },
        { unlocked: 12, total: 20 },
        { unlocked: 25, total: 50 },
      ]),
    ).toBe(46);
  });

  it("does not weight games with larger achievement catalogs more heavily", () => {
    expect(
      calculateSteamAverageGameCompletionRate([
        { unlocked: 1, total: 2 },
        { unlocked: 90, total: 1_000 },
      ]),
    ).toBe(29);
  });

  it("ignores games without an unlocked achievement", () => {
    expect(
      calculateSteamAverageGameCompletionRate([
        { unlocked: 1, total: 2 },
        { unlocked: 0, total: 100 },
      ]),
    ).toBe(50);
    expect(calculateSteamAverageGameCompletionRate([{ unlocked: 0, total: 10 }])).toBe(0);
  });
});
