import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AchievementPopupPayload } from "../../lib/types/overlay";
import { AchievementPopupLayer } from "./AchievementPopupLayer";

let popupHandler: ((payload: AchievementPopupPayload) => void) | null = null;

vi.mock("../../lib/overlay", () => ({
  useAchievementPopup: (callback: (payload: AchievementPopupPayload) => void) => {
    popupHandler = callback;
  },
}));

describe("AchievementPopupLayer", () => {
  afterEach(() => {
    popupHandler = null;
    vi.useRealTimers();
  });

  it("renders camelCase native payloads and supports explicit dismissal", () => {
    render(<AchievementPopupLayer />);

    act(() => {
      popupHandler?.({
        achievementName: "First Win",
        description: "Win one match.",
        gameTitle: "Neon Arena",
        iconUrl: "https://example.test/achievement.png",
        rarity: "4.2% rarity",
      });
    });

    expect(screen.getByRole("region", { name: /achievement notifications/i })).toBeVisible();
    expect(screen.getByRole("heading", { name: "First Win" })).toBeVisible();
    expect(screen.getByText(/Neon Arena/)).toHaveTextContent("4.2% rarity");
    expect(screen.getByText("Win one match.")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /dismiss first win/i }));
    expect(screen.queryByRole("region", { name: /achievement notifications/i })).toBeNull();
  });

  it("expires popups after five seconds", () => {
    vi.useFakeTimers();
    render(<AchievementPopupLayer />);

    act(() => {
      popupHandler?.({
        achievementName: "Timed Unlock",
        description: "",
        gameTitle: "Clock Game",
        iconUrl: null,
        rarity: "",
      });
    });
    expect(screen.getByText("Timed Unlock")).toBeVisible();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText("Timed Unlock")).toBeNull();
  });
});
