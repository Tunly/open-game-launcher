import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DownloadItem } from "../lib/types";
import { useDownloadStore } from "../stores/downloadStore";

const launcherMocks = vi.hoisted(() => ({
  archiveDownload: vi.fn(() => Promise.resolve()),
  cancelDownload: vi.fn(() => Promise.resolve()),
  cancelModInstall: vi.fn(() => Promise.resolve()),
  getDownloadQueue: vi.fn(() => Promise.resolve([])),
  launchGame: vi.fn(() => Promise.resolve()),
  listInstalledGames: vi.fn(() => Promise.resolve([])),
  pauseDownload: vi.fn(() => Promise.resolve()),
}));
vi.mock("../lib/launcher", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/launcher")>();
  return {
    ...actual,
    archiveDownload: launcherMocks.archiveDownload,
    cancelDownload: launcherMocks.cancelDownload,
    cancelModInstall: launcherMocks.cancelModInstall,
    getDownloadQueue: launcherMocks.getDownloadQueue,
    launchGame: launcherMocks.launchGame,
    listInstalledGames: launcherMocks.listInstalledGames,
    pauseDownload: launcherMocks.pauseDownload,
  };
});

import { DownloadsPage } from "./DownloadsPage";

function makeDownloadItem(overrides: Partial<DownloadItem> = {}): DownloadItem {
  return {
    gameId: "game-1",
    id: "download-game-1",
    progress: 100,
    speed: "Complete",
    status: "completed",
    title: "Archive Candidate",
    ...overrides,
  };
}

function renderDownloadsRoute(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<DownloadsPage />} path="/downloads" />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  launcherMocks.archiveDownload.mockReset();
  launcherMocks.archiveDownload.mockResolvedValue(undefined);
  launcherMocks.cancelDownload.mockReset();
  launcherMocks.cancelDownload.mockResolvedValue(undefined);
  launcherMocks.cancelModInstall.mockReset();
  launcherMocks.cancelModInstall.mockResolvedValue(undefined);
  launcherMocks.getDownloadQueue.mockReset();
  launcherMocks.getDownloadQueue.mockResolvedValue([]);
  launcherMocks.launchGame.mockReset();
  launcherMocks.launchGame.mockResolvedValue(undefined);
  launcherMocks.listInstalledGames.mockReset();
  launcherMocks.listInstalledGames.mockResolvedValue([]);
  launcherMocks.pauseDownload.mockReset();
  launcherMocks.pauseDownload.mockResolvedValue(undefined);
  useDownloadStore.setState({ items: [] });
});

afterEach(() => {
  vi.unstubAllEnvs();
  useDownloadStore.setState({ items: [] });
});

describe("DownloadsPage", () => {
  it("renders the queue without the removed source chooser", async () => {
    launcherMocks.getDownloadQueue.mockResolvedValue([]);
    launcherMocks.listInstalledGames.mockResolvedValue([]);

    renderDownloadsRoute("/downloads?verify=removed-download-source");

    expect(await screen.findByText("There are no downloads in the queue")).toBeInTheDocument();
    expect(launcherMocks.getDownloadQueue).not.toHaveBeenCalled();
    expect(screen.queryByText(/Total Progress/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "All" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Done" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: /provider telemetry readiness/i }),
    ).not.toBeInTheDocument();
  });

  it("guards archive clicks while the archive command is pending", async () => {
    let resolveArchive!: () => void;
    launcherMocks.archiveDownload.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveArchive = resolve;
      }),
    );
    useDownloadStore.setState({
      items: [makeDownloadItem({ gameId: "archive-game", id: "download-archive-game" })],
    });

    renderDownloadsRoute("/downloads");

    const archiveButton = await screen.findByRole("button", { name: "Archive" });
    fireEvent.click(archiveButton);
    fireEvent.click(archiveButton);

    expect(launcherMocks.archiveDownload).toHaveBeenCalledTimes(1);
    expect(launcherMocks.archiveDownload).toHaveBeenCalledWith("archive-game");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Busy" })).toBeDisabled();
    });

    resolveArchive();

    await waitFor(() => {
      expect(screen.queryByText("Archive Candidate")).not.toBeInTheDocument();
    });
  });
});
