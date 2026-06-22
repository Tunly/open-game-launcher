import { describe, expect, it } from "vitest";

import {
  applyProfilePrivacyGuard,
  createVerifyProfilePrivacyGuardData,
} from "../profile-privacy-guard";

const privateFixtureTerms =
  /Private Backlog RPG|RTX Private Lab|Secret Guestbook|Friends Raid Session|Hidden Boss Clear|Private Showcase Notes|Private Discord/i;

describe("profile privacy guard", () => {
  it("redacts non-public profile lanes for public viewers", () => {
    const source = createVerifyProfilePrivacyGuardData();
    source.profile.onlineStatusVisibility = "friends_only";
    source.profile.lastSeenAt = "2026-06-14T09:30:00.000Z";
    const { data, guard } = applyProfilePrivacyGuard(source, {
      isFriend: false,
      isOwnProfile: false,
      route: "/u/localprivacy",
    });

    expect(data.libraryPreview).toEqual([]);
    expect(data.achievementPreview).toEqual([]);
    expect(data.activity).toEqual([]);
    expect(data.comments).toEqual([]);
    expect(data.hardware).toBeNull();
    expect(data.profile.lastSeenAt).toBeNull();
    expect(data.socialLinks).toHaveLength(1);
    expect(data.socialLinks[0]?.label).toBe("Public Notes");
    expect(data.showcases.every((showcase) => showcase.visibility === "public")).toBe(true);
    expect(data.stats).toMatchObject({
      achievementsUnlocked: 0,
      friendsCount: 0,
      gamesOwned: 0,
      playtimeMinutes: 0,
    });
    expect(guard.status).toBe("public-safe");
    expect(guard.blockedLanes.map((lane) => lane.label)).toEqual(
      expect.arrayContaining([
        "Library Preview",
        "Achievement Strip",
        "Activity Feed",
        "Guestbook",
        "Hardware Setup",
        "Private Showcases",
        "Private Social Links",
      ]),
    );
    expect(JSON.stringify({ data, guard })).not.toMatch(privateFixtureTerms);
  });

  it("keeps private lanes available to the profile owner", () => {
    const source = createVerifyProfilePrivacyGuardData();
    const { data, guard } = applyProfilePrivacyGuard(source, {
      isFriend: false,
      isOwnProfile: true,
      route: "/u/localprivacy",
    });

    expect(data.libraryPreview).toHaveLength(2);
    expect(data.achievementPreview).toHaveLength(1);
    expect(data.activity).toHaveLength(1);
    expect(data.comments).toHaveLength(1);
    expect(data.hardware?.gpu).toBe("RTX Private Lab");
    expect(data.socialLinks.map((link) => link.label)).toEqual(["Public Notes", "Private Discord"]);
    expect(guard.status).toBe("owner-visible");
    expect(guard.blockedLanes).toEqual([]);
  });

  it("keeps verify evidence scoped to local dry-run claims", () => {
    const { guard } = applyProfilePrivacyGuard(createVerifyProfilePrivacyGuardData(), {
      isFriend: false,
      isOwnProfile: false,
      route: "/u/localprivacy",
    });

    expect(guard.guardrails).toEqual(
      expect.arrayContaining([
        "No Supabase writes",
        "No private table replay",
        "No friend graph assumption",
      ]),
    );
    expect(guard.viewerLabel).toBe("Public viewer");
    expect(guard.route).toBe("/u/localprivacy");
  });
});
