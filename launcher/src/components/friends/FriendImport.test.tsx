import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FriendImport } from "./FriendImport";
import { STORAGE_KEYS } from "../../lib/storage-keys";
import type { PlatformType } from "../../lib/types/friends";

const mocks = vi.hoisted(() => ({
  fetchEpicFriends: vi.fn(),
  fetchGogFriends: vi.fn(),
  fetchSteamFriends: vi.fn(),
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
    "disables unsupported $label import instead of persisting preview users",
    ({ label }) => {
      render(<FriendImport />);

      expect(getPlatformButton(label)).toBeDisabled();
      expect(mocks.importPlatformFriends).not.toHaveBeenCalled();
    },
  );

  it("disables Xbox until a secure friend-token handoff exists", () => {
    render(<FriendImport />);

    expect(getPlatformButton("Xbox")).toBeDisabled();
    expect(mocks.importPlatformFriends).not.toHaveBeenCalled();
  });

  it("fails closed in the browser without persisting preview users", async () => {
    render(<FriendImport />);

    fireEvent.click(getPlatformButton("Steam"));

    expect(await screen.findByText(/desktop app only/i)).toBeInTheDocument();
    expect(mocks.fetchSteamFriends).not.toHaveBeenCalled();
    expect(mocks.importPlatformFriends).not.toHaveBeenCalled();
  });

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

    expect(await screen.findByText(/Connect Epic Games first in Settings/i)).toBeInTheDocument();
    expect(mocks.fetchEpicFriends).not.toHaveBeenCalled();
    expect(mocks.importPlatformFriends).not.toHaveBeenCalled();

    window.localStorage.setItem(STORAGE_KEYS.EPIC_SESSION_MARKER, "Epic User");
    fireEvent.click(getPlatformButton("Epic"));

    await waitFor(() => {
      expect(mocks.fetchEpicFriends).toHaveBeenCalledTimes(1);
    });
  });

  it("does not persist anything when a native provider fetch fails", async () => {
    mocks.isTauri.mockReturnValue(true);
    window.localStorage.setItem(STORAGE_KEYS.STEAM_ID, "76561198000000000");
    mocks.fetchSteamFriends.mockRejectedValueOnce(new Error("Steam friends are private."));
    render(<FriendImport />);

    fireEvent.click(getPlatformButton("Steam"));

    expect(await screen.findByText(/Steam friends are private/i)).toBeInTheDocument();
    expect(mocks.importPlatformFriends).not.toHaveBeenCalled();
  });
});
