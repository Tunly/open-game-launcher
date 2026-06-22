import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FriendImport } from "./FriendImport";
import { STORAGE_KEYS } from "../../lib/storage-keys";
import type { PlatformFriend, PlatformType } from "../../lib/types/friends";

const mocks = vi.hoisted(() => ({
  fetchEpicFriends: vi.fn(),
  fetchGogFriends: vi.fn(),
  fetchSteamFriends: vi.fn(),
  fetchXboxFriends: vi.fn(),
  importPlatformFriends: vi.fn(),
  isTauri: vi.fn(),
}));

vi.mock("./DeduplicationPanel", () => ({
  DeduplicationPanel: () => null,
}));

vi.mock("../../lib/launcher", () => ({
  fetchEpicFriends: mocks.fetchEpicFriends,
  fetchGogFriends: mocks.fetchGogFriends,
  fetchSteamFriends: mocks.fetchSteamFriends,
  fetchXboxFriends: mocks.fetchXboxFriends,
}));

vi.mock("../../lib/supabase/friend-links", () => ({
  importPlatformFriends: mocks.importPlatformFriends,
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: mocks.isTauri,
}));

const platformLabels: Array<{ key: PlatformType; label: string }> = [
  { key: "steam", label: "Steam" },
  { key: "epic", label: "Epic" },
  { key: "gog", label: "GOG" },
  { key: "ea", label: "EA App" },
  { key: "xbox", label: "Xbox" },
  { key: "battlenet", label: "Battle.net" },
  { key: "ubisoft", label: "Ubisoft" },
  { key: "og", label: "OG-Launcher" },
];

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getPlatformButton(label: string) {
  return screen.getByRole("button", { name: new RegExp(escapeRegex(label), "i") });
}

describe("FriendImport", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.fetchEpicFriends.mockReset();
    mocks.fetchGogFriends.mockReset();
    mocks.fetchSteamFriends.mockReset();
    mocks.fetchXboxFriends.mockReset();
    mocks.isTauri.mockReset();
    mocks.isTauri.mockReturnValue(false);
    mocks.importPlatformFriends.mockReset();
    mocks.importPlatformFriends.mockResolvedValue(3);
  });

  it("renders an import option for every typed friend platform", () => {
    render(<FriendImport />);

    for (const platform of platformLabels) {
      expect(getPlatformButton(platform.label)).toBeInTheDocument();
    }
  });

  it.each([
    { key: "ea", label: "EA App" },
    { key: "battlenet", label: "Battle.net" },
    { key: "ubisoft", label: "Ubisoft" },
    { key: "og", label: "OG-Launcher" },
  ] satisfies Array<{ key: PlatformType; label: string }>)(
    "imports a local preview roster for $label",
    async ({ key, label }) => {
      const onImported = vi.fn();
      render(<FriendImport onImported={onImported} />);

      fireEvent.click(getPlatformButton(label));

      await waitFor(() => {
        expect(mocks.importPlatformFriends).toHaveBeenCalledTimes(1);
      });

      const importedFriends = mocks.importPlatformFriends.mock.calls[0][0] as PlatformFriend[];
      expect(importedFriends).toHaveLength(3);
      expect(importedFriends.every((friend) => friend.platform === key)).toBe(true);
      expect(
        importedFriends.every((friend) => friend.platformId.startsWith(`preview-${key}`)),
      ).toBe(true);
      expect(onImported).toHaveBeenCalledTimes(1);
      expect(
        await screen.findByText(
          new RegExp(`Imported 3 preview friends from ${escapeRegex(label)}`),
        ),
      ).toBeInTheDocument();
    },
  );

  it("imports GOG friends through the native token-aware bridge without reading localStorage tokens", async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.importPlatformFriends.mockResolvedValueOnce(1);
    mocks.fetchGogFriends.mockResolvedValueOnce([
      {
        avatarUrl: null,
        displayName: "GOG Friend",
        onlineStatus: "online",
        platform: "gog",
        platformId: "gog-1",
      },
    ]);
    render(<FriendImport />);

    fireEvent.click(getPlatformButton("GOG"));

    await waitFor(() => {
      expect(mocks.fetchGogFriends).toHaveBeenCalledWith();
      expect(mocks.importPlatformFriends).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText(/Imported 1 live friend from GOG/i)).toBeInTheDocument();
  });

  it("requires the non-sensitive Epic session marker before native Epic friend import", async () => {
    mocks.isTauri.mockReturnValue(true);
    render(<FriendImport />);

    fireEvent.click(getPlatformButton("Epic"));

    expect(
      await screen.findByText(/Native fetch skipped: Connect Epic Games first in Settings/i),
    ).toBeInTheDocument();
    expect(mocks.fetchEpicFriends).not.toHaveBeenCalled();

    window.localStorage.setItem(STORAGE_KEYS.EPIC_SESSION_MARKER, "Epic User");
    fireEvent.click(getPlatformButton("Epic"));

    await waitFor(() => {
      expect(mocks.fetchEpicFriends).toHaveBeenCalledTimes(1);
    });
  });
});
