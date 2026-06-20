import { describe, expect, it } from "vitest";

import {
  buildInviteDeepLink,
  buildInviteFallbackPath,
  buildInviteFallbackUrl,
} from "../invite-links";

const shareToken =
  "ogl_eyJ0eXAiOiJvZ2wtc2hhcmUiLCJhbGciOiJIUzI1NiIsImtpZCI6InNoYXJlLXRva2VuLXYxIn0.eyJ2IjoxLCJqdGkiOiJpbnZpdGUtMTIzIiwiaWF0IjoxNzgxMTEyODAwLCJleHAiOjE3ODExMTQ2MDB9.VZRK5sql2xId2JWnCCprB3ViZnIJeWDC8BEvzLA9s-o";

describe("invite link helpers", () => {
  it("encodes game, platform, and invite token into the app deep link", () => {
    expect(
      buildInviteDeepLink({
        gameTitle: "Steel Battalion X",
        platform: "steam",
        token: "invite-123",
      }),
    ).toBe("oglauncher://join?game=Steel+Battalion+X&platform=steam&invite=invite-123");
  });

  it("encodes the invite token in the fallback path and keeps game context in query params", () => {
    expect(
      buildInviteFallbackPath({
        gameTitle: "Steel Battalion X",
        platform: "steam",
        token: "invite/123",
      }),
    ).toBe("/invite/invite%2F123?game=Steel+Battalion+X&platform=steam");
  });

  it("builds an absolute fallback URL when an origin is available", () => {
    expect(
      buildInviteFallbackUrl({
        gameTitle: "Steel Battalion X",
        origin: "https://og-launcher.test",
        platform: "steam",
        token: "invite-123",
      }),
    ).toBe("https://og-launcher.test/invite/invite-123?game=Steel+Battalion+X&platform=steam");
  });

  it("keeps JWT-like share token envelopes intact in fallback paths and deep links", () => {
    expect(
      buildInviteFallbackPath({
        gameTitle: "Steel Battalion X",
        platform: "steam",
        token: shareToken,
      }),
    ).toBe(`/invite/${shareToken}?game=Steel+Battalion+X&platform=steam`);

    expect(
      buildInviteDeepLink({
        gameTitle: "Steel Battalion X",
        platform: "steam",
        token: shareToken,
      }),
    ).toBe(`oglauncher://join?game=Steel+Battalion+X&platform=steam&invite=${shareToken}`);
  });

  it("requires a non-empty invite token", () => {
    expect(() =>
      buildInviteDeepLink({
        gameTitle: "Steel Battalion X",
        platform: "steam",
        token: "   ",
      }),
    ).toThrow("Invite token is required.");

    expect(() =>
      buildInviteFallbackPath({
        gameTitle: "Steel Battalion X",
        platform: "steam",
        token: "",
      }),
    ).toThrow("Invite token is required.");
  });
});
