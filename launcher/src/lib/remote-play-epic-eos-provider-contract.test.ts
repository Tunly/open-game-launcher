import { describe, expect, it } from "vitest";

import {
  createVerifyRemotePlayEpicEosProviderContract,
  REMOTE_PLAY_EPIC_EOS_BLOCKED_CLAIMS,
  replayRemotePlayEpicEosProviderFixtures,
} from "./remote-play-epic-eos-provider-contract";

describe("remote play Epic/EOS provider contract", () => {
  it("covers provider session, invite, URI fallback, error, and stream proof lanes", () => {
    const contract = createVerifyRemotePlayEpicEosProviderContract();

    expect(contract.statusLabel).toBe("Provider Proof Required");
    expect(contract.passCount).toBe(1);
    expect(contract.reviewCount).toBe(2);
    expect(contract.blockedCount).toBe(2);
    expect(contract.blockedClaims).toEqual([...REMOTE_PLAY_EPIC_EOS_BLOCKED_CLAIMS]);
    expect(contract.fixtureReplays).toEqual(replayRemotePlayEpicEosProviderFixtures());
    expect(contract.lanes.map((lane) => lane.id)).toEqual([
      "provider-session-state",
      "invite-envelope",
      "launch-uri-fallback",
      "provider-error-map",
      "stream-success-proof",
    ]);
    expect(contract.fixtureReplays.map((replay) => replay.id)).toEqual([
      "session-state-replay",
      "invite-envelope-transition",
      "uri-fallback-decision",
      "provider-error-mapping",
    ]);
    expect(contract.fixtureReplays).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          decision: "label-only",
          from: "epic-installed",
          to: "epic-current-title",
        }),
        expect.objectContaining({
          decision: "redact-and-hold",
          from: "invite-draft",
          to: "local-envelope-review",
        }),
        expect.objectContaining({
          decision: "allow-launcher-uri",
          evidence: expect.stringContaining("http, javascript, and file schemes blocked"),
          from: "provider-session-unavailable",
          to: "official-uri-fallback",
        }),
        expect.objectContaining({
          decision: "map-to-blocked-lane",
          from: "provider-error",
          to: "no-live-proof",
        }),
      ]),
    );
  });

  it("keeps the local contract free of live Epic/EOS or streaming success claims", () => {
    const text = JSON.stringify(createVerifyRemotePlayEpicEosProviderContract());

    expect(text).toContain("No Epic/EOS provider session proof");
    expect(text).toContain("No Epic/EOS invite delivery");
    expect(text).toContain("No live streaming session proof");
    expect(text).toContain("fixture-only transition replay");
    expect(text).not.toMatch(
      /(provider session active|epic invite delivered|eos invite accepted|live stream started|streaming verified|provider token:|bearer\s+[a-z0-9._~+/=-]{12,})/i,
    );
  });
});
