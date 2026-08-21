import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tauriIsTauriMock = vi.hoisted(() => vi.fn(() => false));

const launcherMocks = vi.hoisted(() => ({
  authenticateEpicLegendary: vi.fn(() => Promise.resolve("Epic authenticated.")),
  eaGetToken: vi.fn(() => Promise.resolve(null)),
  eaLogout: vi.fn(() => Promise.resolve()),
  fetchSteamProfileName: vi.fn(() => Promise.resolve("Steam User")),
  fetchXboxOwnedGames: vi.fn(() => Promise.resolve({ games: [], gamertag: "Xbox User" })),
  gogExchangeCode: vi.fn(() => Promise.resolve({ accessToken: "token" })),
  gogGetToken: vi.fn(() => Promise.resolve(null)),
  gogLogout: vi.fn(() => Promise.resolve()),
  openBattleNetLoginWindow: vi.fn(() => Promise.resolve()),
  openEaLoginWindow: vi.fn(() => Promise.resolve()),
  openEpicLoginWindow: vi.fn(() => Promise.resolve()),
  openGogLoginWindow: vi.fn(() => Promise.resolve()),
  openSteamLoginWindow: vi.fn(() => Promise.resolve()),
  openXboxLoginWindow: vi.fn(() => Promise.resolve()),
  processBattleNetGamesPayload: vi.fn(() => Promise.resolve([])),
  verifySteamOpenIdLocally: vi.fn(() =>
    Promise.resolve({
      steamId: "76561198000000000",
      claimedId: "https://steamcommunity.com/openid/id/76561198000000000",
      verifiedAt: "2026-08-20T00:00:00Z",
    }),
  ),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: tauriIsTauriMock,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => undefined)),
}));

vi.mock("../lib/launcher", () => launcherMocks);

vi.mock("../lib/steam-owned-games", () => ({
  normalizeSteamOwnedGames: (games: unknown[]) => games,
}));

import { SettingsPage } from "./SettingsPage";

function renderSettingsRoute(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Suspense fallback={null}>
        <Routes>
          <Route element={<SettingsPage />} path="/settings" />
        </Routes>
      </Suspense>
    </MemoryRouter>,
  );
}

describe("SettingsPage One-Click Setup E2E readiness", () => {
  beforeEach(() => {
    tauriIsTauriMock.mockReturnValue(false);
    window.localStorage.clear();
  });

  it("does not render first-party cloud save management", () => {
    renderSettingsRoute("/settings");

    expect(screen.queryByText("E2E Cloud Saves")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /cloud saves mock/i })).not.toBeInTheDocument();
  });

  it("does not render the fake game-update toggle", () => {
    renderSettingsRoute("/settings");

    expect(screen.queryByRole("switch", { name: "Auto-Update Games" })).not.toBeInTheDocument();
  });
});

describe("SettingsPage Steam local verification", () => {
  beforeEach(() => {
    tauriIsTauriMock.mockReturnValue(false);
    window.localStorage.clear();
  });

  it("shows the local fallback state without a verified session", () => {
    window.localStorage.setItem("launcher.steamId", JSON.stringify("76561198000000000"));
    window.localStorage.setItem("launcher.steamUsername", JSON.stringify("Manga Pilot"));

    renderSettingsRoute("/settings");

    expect(screen.getByText("Manga Pilot")).toBeInTheDocument();
    expect(screen.getByText("Local fallback")).toBeInTheDocument();
  });
});
