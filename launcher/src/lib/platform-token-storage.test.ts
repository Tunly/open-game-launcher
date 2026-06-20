import { beforeEach, describe, expect, it } from "vitest";

import {
  clearLegacyPlatformTokenCopies,
  readEpicSessionMarker,
  writeEpicSessionMarker,
} from "./platform-token-storage";
import { STORAGE_KEYS } from "./storage-keys";

describe("platform token storage helpers", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("clears legacy sensitive platform token copies", () => {
    window.localStorage.setItem(STORAGE_KEYS.GOG_TOKEN, JSON.stringify({ accessToken: "gog" }));
    window.localStorage.setItem(STORAGE_KEYS.EA_TOKEN, JSON.stringify({ accessToken: "ea" }));

    clearLegacyPlatformTokenCopies();

    expect(window.localStorage.getItem(STORAGE_KEYS.GOG_TOKEN)).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.EA_TOKEN)).toBeNull();
  });

  it("migrates legacy Epic token JSON into a non-sensitive session marker", () => {
    window.localStorage.setItem(STORAGE_KEYS.EPIC_TOKEN, JSON.stringify({ accessToken: "epic" }));

    expect(readEpicSessionMarker()).toBe("Epic User");
    expect(window.localStorage.getItem(STORAGE_KEYS.EPIC_TOKEN)).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.EPIC_SESSION_MARKER)).toBe("Epic User");
  });

  it("writes Epic session marker without preserving legacy token JSON", () => {
    window.localStorage.setItem(STORAGE_KEYS.EPIC_TOKEN, JSON.stringify({ accessToken: "epic" }));

    writeEpicSessionMarker("Legendary User");

    expect(window.localStorage.getItem(STORAGE_KEYS.EPIC_TOKEN)).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.EPIC_SESSION_MARKER)).toBe("Legendary User");
  });
});
