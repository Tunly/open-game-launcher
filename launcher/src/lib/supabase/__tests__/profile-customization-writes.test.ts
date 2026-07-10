import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProfileTheme } from "../../types/profile";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  requireCurrentSupabaseUser: vi.fn(),
}));

vi.mock("../client", () => ({
  getSupabaseClient: () => ({ from: mocks.from }),
  requireCurrentSupabaseUser: mocks.requireCurrentSupabaseUser,
}));

import { updateMyAppShellSkin, updateMyCustomTheme } from "../profile";

const missingColumnError = {
  code: "42703",
  message: "column does not exist",
};

function mockMissingProfileColumn() {
  mocks.from.mockReturnValue({
    update: () => ({
      eq: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: null, error: missingColumnError }),
        }),
      }),
    }),
  });
}

function customTheme(): ProfileTheme {
  return {
    accentColor: "#007166",
    backgroundType: "solid",
    backgroundValue: "#fff9ed",
    cardStyle: "pixel",
    createdAt: "2026-07-09T12:00:00.000Z",
    description: "Local draft",
    id: "local-theme",
    isActive: true,
    isPremium: false,
    key: "local-theme",
    name: "Local Theme",
    textColor: "#171411",
  };
}

describe("profile customization hosted writes", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.requireCurrentSupabaseUser.mockReset();
    mocks.requireCurrentSupabaseUser.mockResolvedValue({ id: "user-1" });
    mockMissingProfileColumn();
  });

  it("does not report an app shell skin as synced when its column is missing", async () => {
    await expect(updateMyAppShellSkin("teal-print")).rejects.toThrow(
      "app_shell_skin is unavailable",
    );
  });

  it("does not report a custom theme as synced when its column is missing", async () => {
    await expect(updateMyCustomTheme(customTheme())).rejects.toThrow(
      "custom_theme_json is unavailable",
    );
  });
});
