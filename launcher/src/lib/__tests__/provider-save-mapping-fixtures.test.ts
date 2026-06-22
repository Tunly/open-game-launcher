import { describe, expect, it } from "vitest";

import {
  getProviderSaveMappingFixture,
  listProviderSaveMappingFixtures,
  reviewProviderSaveMappingFixture,
  type ProviderSaveMappingFixture,
} from "../provider-save-mapping-fixtures";

describe("provider save mapping fixtures", () => {
  it("stages local Steam, GOG, and Epic provider IDs without live-provider claims", () => {
    const fixtures = listProviderSaveMappingFixtures();

    expect(fixtures.map((fixture) => fixture.provider)).toEqual(["steam", "gog", "epic"]);
    expect(fixtures.map((fixture) => fixture.canonicalExternalId)).toEqual([
      "110011",
      "mech-arcade",
      "mech-arcade-epic",
    ]);
    expect(fixtures.every((fixture) => fixture.providerSource.includes("fixture"))).toBe(true);

    for (const fixture of fixtures) {
      expect(fixture.guards).toContain("No provider API calls");
      expect(fixture.guards).toContain("No live Supabase claims");
      expect(fixture.blockers).toContain("Provider save-root discovery APIs are not called.");
    }
  });

  it("keeps provider-specific install and save-root exemplars structured", () => {
    expect(getProviderSaveMappingFixture("steam")).toMatchObject({
      installRoot: "C:\\Games\\Steam\\steamapps\\common\\Mech Arcade",
      saveRoot: {
        exemplarRoot: "C:\\Program Files (x86)\\Steam\\userdata\\424242\\110011",
        pattern: "%STEAM_USERDATA%\\<steam-user-id>\\<steam-app-id>",
        scope: "Steam user id plus app id",
      },
    });
    expect(getProviderSaveMappingFixture("gog")).toMatchObject({
      installRoot: "C:\\Games\\GOG Galaxy\\Games\\Mech Arcade",
      saveRoot: {
        exemplarRoot: "C:\\Users\\Player\\Documents\\GOG Galaxy\\Mech Arcade",
        pattern: "%USERPROFILE%\\Documents\\GOG Galaxy\\<game-slug>",
        scope: "Windows user profile plus GOG game slug",
      },
    });
    expect(getProviderSaveMappingFixture("epic")).toMatchObject({
      installRoot: "C:\\Games\\Epic Games\\MechArcade",
      saveRoot: {
        exemplarRoot: "C:\\Users\\Player\\AppData\\Local\\MechArcade",
        pattern: "%LOCALAPPDATA%\\<epic-artifact-id>",
        scope: "Windows local app data plus Epic artifact id",
      },
    });
  });

  it("stages source-to-target profile and settings relative path mapping rules", () => {
    for (const fixture of listProviderSaveMappingFixtures()) {
      expect(fixture.mappingRules.map((rule) => rule.slot).sort()).toEqual(["profile", "settings"]);
      expect(fixture.mappingRules.every((rule) => rule.sourceRelativePath.length > 0)).toBe(true);
      expect(fixture.mappingRules.every((rule) => rule.targetRelativePath.length > 0)).toBe(true);
    }

    expect(getProviderSaveMappingFixture("steam").mappingRules).toContainEqual(
      expect.objectContaining({
        sourceRelativePath: "remote/profile.sav",
        targetRelativePath: "profile/profile.sav",
      }),
    );
    expect(getProviderSaveMappingFixture("gog").mappingRules).toContainEqual(
      expect.objectContaining({
        sourceRelativePath: "settings/user_settings.json",
        targetRelativePath: "settings/settings.json",
      }),
    );
    expect(getProviderSaveMappingFixture("epic").mappingRules).toContainEqual(
      expect.objectContaining({
        sourceRelativePath: "Saved\\Config\\Windows\\GameUserSettings.ini",
        targetRelativePath: "settings/settings.ini",
      }),
    );
  });

  it("blocks review when external ID, install root, or save root exemplars are missing", () => {
    const fixture = withFixtureOverrides({
      canonicalExternalId: " ",
      installRoot: "",
      saveRoot: {
        ...getProviderSaveMappingFixture("steam").saveRoot,
        exemplarRoot: " ",
      },
    });

    const review = reviewProviderSaveMappingFixture(fixture);

    expect(review.status).toBe("blocked");
    expect(review.blockers).toContain("Canonical external ID is missing.");
    expect(review.blockers).toContain("Install root exemplar is missing.");
    expect(review.blockers).toContain("Save root exemplar is missing.");
  });

  it("blocks duplicate target relative path mappings after path normalization", () => {
    const steam = getProviderSaveMappingFixture("steam");
    const fixture = withFixtureOverrides({
      mappingRules: [
        steam.mappingRules[0],
        {
          ...steam.mappingRules[1],
          id: "steam-settings-duplicate-profile-target",
          targetRelativePath: "PROFILE\\profile.sav",
        },
      ],
    });

    const review = reviewProviderSaveMappingFixture(fixture);

    expect(review.status).toBe("blocked");
    expect(review.duplicateTargetRelativePaths).toEqual(["profile/profile.sav"]);
    expect(review.blockers).toContain("Duplicate target relative mapping: profile/profile.sav");
  });
});

function withFixtureOverrides(
  overrides: Partial<ProviderSaveMappingFixture>,
): ProviderSaveMappingFixture {
  return {
    ...getProviderSaveMappingFixture("steam"),
    ...overrides,
  };
}
