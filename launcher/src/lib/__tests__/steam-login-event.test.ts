import { describe, expect, it } from "vitest";

import { normalizeSteamLoginSuccessEvent } from "../launcher/platform-auth";

describe("Steam login success event", () => {
  it("keeps the legacy SteamID string payload compatible", () => {
    expect(normalizeSteamLoginSuccessEvent("76561198000000000")).toEqual({
      openidResponseUrl: null,
      steamId: "76561198000000000",
    });
  });

  it("accepts the callback-bearing payload used for hosted verification", () => {
    const payload = {
      openidResponseUrl:
        "http://localhost:18234/?state=opaque&openid.mode=id_res&openid.sig=signed",
      steamId: "76561198000000000",
    };
    expect(normalizeSteamLoginSuccessEvent(payload)).toEqual(payload);
  });

  it("rejects malformed or incomplete event payloads", () => {
    expect(normalizeSteamLoginSuccessEvent("not-a-steam-id")).toBeNull();
    expect(normalizeSteamLoginSuccessEvent({ steamId: "76561198000000000" })).toBeNull();
    expect(
      normalizeSteamLoginSuccessEvent({
        openidResponseUrl: "http://localhost:18234/?state=opaque",
        steamId: "42",
      }),
    ).toBeNull();
  });
});
