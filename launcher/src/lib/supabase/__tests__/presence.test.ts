import { describe, expect, it } from "vitest";

import {
  getActivityPlatformLabel,
  getPresenceGameLine,
  getPresencePlatformLabel,
  normalizePresencePlatform,
} from "../presence";

describe("presence platform helpers", () => {
  it("normalizes known platform ids", () => {
    expect(normalizePresencePlatform("Steam")).toBe("steam");
    expect(normalizePresencePlatform(" EPIC ")).toBe("epic");
    expect(normalizePresencePlatform("unknown")).toBeNull();
    expect(normalizePresencePlatform(null)).toBeNull();
  });

  it("prefers platform labels over raw sources", () => {
    expect(getPresencePlatformLabel("steam", "steam_web_api")).toBe("Steam");
    expect(getPresencePlatformLabel(null, "epic_presence_endpoint")).toBe("Epic Presence Endpoint");
    expect(getPresencePlatformLabel(null, null)).toBeNull();
  });

  it("builds game copy with platform context when available", () => {
    expect(
      getPresenceGameLine({
        currentGameTitle: "Fortnite",
        platform: "epic",
        platformSource: "epic_presence_endpoint",
      }),
    ).toBe("Playing Fortnite on Epic");

    expect(
      getPresenceGameLine({
        currentGameTitle: "Fortnite",
        platform: null,
        platformSource: null,
      }),
    ).toBe("Playing Fortnite");
  });

  it("extracts activity platform labels from camel and snake metadata", () => {
    expect(getActivityPlatformLabel({ platform: "steam" })).toBe("Steam");
    expect(getActivityPlatformLabel({ platform_source: "gog_bridge" })).toBe("Gog Bridge");
    expect(getActivityPlatformLabel({ platform: "nope" })).toBeNull();
  });
});
