import { describe, expect, it } from "vitest";

import {
  createProfileThemeExchangePayload,
  parseProfileThemeExchangePayload,
  themeExchangeFileName,
} from "../profile-theme-exchange";
import type { ProfileTheme } from "../types/profile";

describe("profile theme exchange", () => {
  it("exports a versioned local profile theme payload", () => {
    const payload = createProfileThemeExchangePayload(
      makeTheme({ name: "Retro Import Tape" }),
      "2026-06-11T10:00:00.000Z",
    );

    expect(payload).toEqual({
      exportedAt: "2026-06-11T10:00:00.000Z",
      schema: "og-launcher.profile-theme",
      theme: {
        accentColor: "#b7102a",
        backgroundType: "solid",
        backgroundValue: "#f6edd8",
        cardStyle: "pixel",
        description: "Theme",
        name: "Retro Import Tape",
        textColor: "#171411",
      },
      version: 1,
    });
    expect(themeExchangeFileName(makeTheme({ name: "Retro Import Tape" }))).toBe(
      "og-launcher-theme-retro-import-tape.json",
    );
  });

  it("imports a Retro Manga safe local theme", () => {
    const imported = parseProfileThemeExchangePayload(
      JSON.stringify(createProfileThemeExchangePayload(makeTheme({ name: "Teal Review Skin" }))),
      "2026-06-11T11:00:00.000Z",
    );

    expect(imported).toMatchObject({
      accentColor: "#b7102a",
      backgroundType: "solid",
      backgroundValue: "#f6edd8",
      cardStyle: "pixel",
      createdAt: "2026-06-11T11:00:00.000Z",
      id: "local-custom-theme-teal-review-skin",
      isActive: true,
      isPremium: false,
      key: "custom-teal-review-skin",
      name: "Teal Review Skin",
      textColor: "#171411",
    });
  });

  it("rejects invalid JSON, unsupported schema, unsafe background types, and invalid colors", () => {
    expect(() => parseProfileThemeExchangePayload("{")).toThrow("valid JSON");
    expect(() =>
      parseProfileThemeExchangePayload(JSON.stringify({ schema: "other", version: 1 })),
    ).toThrow("schema is not supported");
    expect(() =>
      parseProfileThemeExchangePayload(
        JSON.stringify(
          createProfileThemeExchangePayload(makeTheme({ backgroundType: "gradient" })),
        ),
      ),
    ).toThrow("background type");
    expect(() =>
      parseProfileThemeExchangePayload(
        JSON.stringify(createProfileThemeExchangePayload(makeTheme({ accentColor: "#gggggg" }))),
      ),
    ).toThrow("#rrggbb");
  });
});

function makeTheme(patch: Partial<ProfileTheme> = {}): ProfileTheme {
  return {
    accentColor: "#b7102a",
    backgroundType: "solid",
    backgroundValue: "#f6edd8",
    cardStyle: "pixel",
    createdAt: "2026-06-11T09:00:00.000Z",
    description: "Theme",
    id: "theme",
    isActive: true,
    isPremium: false,
    key: "theme",
    name: "Retro Theme",
    textColor: "#171411",
    ...patch,
  };
}
