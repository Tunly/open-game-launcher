import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DownloadItem, Game } from "../lib/types";
import { STORAGE_KEYS } from "../lib/storage-keys";
import { useDownloadStore } from "../stores/downloadStore";

const launcherMocks = vi.hoisted(() => ({
  archiveDownload: vi.fn((gameId: string) => {
    void gameId;
    return Promise.resolve();
  }),
  cancelDownload: vi.fn(() => Promise.resolve()),
  getDownloadQueue: vi.fn(() => Promise.resolve([])),
  launchGame: vi.fn(() => Promise.resolve()),
  listInstalledGames: vi.fn<() => Promise<Game[]>>(() => Promise.resolve([])),
  pauseDownload: vi.fn(() => Promise.resolve()),
  checkProviderHealth: vi.fn(() => Promise.resolve([])),
  reconcileDownloads: vi.fn(() =>
    Promise.resolve({ installedRemoved: [], activeRestored: [], staleCleaned: [], errors: [] }),
  ),
  getDownloadSettings: vi.fn(() =>
    Promise.resolve({ bandwidthLimitKbps: null, maxConcurrentDownloads: 3, installRoot: null }),
  ),
  saveDownloadSettings: vi.fn(
    (settings: {
      bandwidthLimitKbps: number | null;
      maxConcurrentDownloads: number;
      installRoot: string | null;
    }) => Promise.resolve(settings),
  ),
  startDownload: vi.fn(() => Promise.resolve({ status: "started" })),
}));
vi.mock("../lib/launcher", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/launcher")>();
  return {
    ...actual,
    archiveDownload: launcherMocks.archiveDownload,
    cancelDownload: launcherMocks.cancelDownload,
    getDownloadQueue: launcherMocks.getDownloadQueue,
    launchGame: launcherMocks.launchGame,
    listInstalledGames: launcherMocks.listInstalledGames,
    pauseDownload: launcherMocks.pauseDownload,
    checkProviderHealth: launcherMocks.checkProviderHealth,
    reconcileDownloads: launcherMocks.reconcileDownloads,
    getDownloadSettings: launcherMocks.getDownloadSettings,
    saveDownloadSettings: launcherMocks.saveDownloadSettings,
    startDownload: launcherMocks.startDownload,
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
  window.localStorage.clear();
  launcherMocks.archiveDownload.mockReset();
  launcherMocks.archiveDownload.mockResolvedValue(undefined);
  launcherMocks.cancelDownload.mockReset();
  launcherMocks.cancelDownload.mockResolvedValue(undefined);
  launcherMocks.getDownloadQueue.mockReset();
  launcherMocks.getDownloadQueue.mockResolvedValue([]);
  launcherMocks.launchGame.mockReset();
  launcherMocks.launchGame.mockResolvedValue(undefined);
  launcherMocks.listInstalledGames.mockReset();
  launcherMocks.listInstalledGames.mockResolvedValue([]);
  launcherMocks.pauseDownload.mockReset();
  launcherMocks.pauseDownload.mockResolvedValue(undefined);
  launcherMocks.checkProviderHealth.mockReset();
  launcherMocks.checkProviderHealth.mockResolvedValue([]);
  launcherMocks.reconcileDownloads.mockReset();
  launcherMocks.reconcileDownloads.mockResolvedValue({
    installedRemoved: [],
    activeRestored: [],
    staleCleaned: [],
    errors: [],
  });
  launcherMocks.getDownloadSettings.mockReset();
  launcherMocks.getDownloadSettings.mockResolvedValue({
    bandwidthLimitKbps: null,
    maxConcurrentDownloads: 3,
    installRoot: null,
  });
  launcherMocks.saveDownloadSettings.mockReset();
  launcherMocks.saveDownloadSettings.mockImplementation((settings) => Promise.resolve(settings));
  launcherMocks.startDownload.mockReset();
  launcherMocks.startDownload.mockResolvedValue({ status: "started" });
  useDownloadStore.setState({ items: [] });
});

afterEach(() => {
  vi.unstubAllEnvs();
  window.localStorage.clear();
  useDownloadStore.setState({ items: [] });
});

describe("DownloadsPage", () => {
  it("renders the queue without the removed source chooser", async () => {
    launcherMocks.getDownloadQueue.mockResolvedValue([]);
    launcherMocks.listInstalledGames.mockResolvedValue([]);

    renderDownloadsRoute("/downloads?verify=removed-download-source");

    expect(await screen.findByRole("heading", { level: 1, name: "Downloads" })).toBeInTheDocument();
    expect(await screen.findByText("Queue clear")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Library" })).toBeInTheDocument();
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
      expect(archiveButton).toBeDisabled();
      expect(archiveButton).toHaveAccessibleName("Archiving...");
    });

    await act(async () => {
      resolveArchive();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.queryByText("Archive Candidate")).not.toBeInTheDocument();
    });
  });

  it("removes interrupted external downloads from the unscheduled queue", async () => {
    useDownloadStore.setState({
      items: [
        makeDownloadItem({
          external: true,
          gameId: "steam-owned-1234",
          id: "download-steam-owned-1234",
          progress: 53,
          speed: "External tracker needs refresh",
          status: "paused",
          title: "Removed Steam Download",
        }),
      ],
    });

    renderDownloadsRoute("/downloads");

    expect(await screen.findByText("Unscheduled (1)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(launcherMocks.archiveDownload).toHaveBeenCalledWith("steam-owned-1234");
      expect(screen.queryByText("Removed Steam Download")).not.toBeInTheDocument();
      expect(screen.queryByText(/Unscheduled/)).not.toBeInTheDocument();
    });
  });

  it("shows a pausing download as paused instead of active", async () => {
    useDownloadStore.setState({
      items: [
        makeDownloadItem({
          canPause: false,
          gameId: "steam-owned-5678",
          id: "download-steam-owned-5678",
          progress: 37,
          speed: "Steam Pausing...",
          status: "pausing",
          title: "Pausing Steam Download",
        }),
      ],
    });

    renderDownloadsRoute("/downloads");

    expect(await screen.findByText("Up Next (0)")).toBeInTheDocument();
    expect(screen.getByText("Unscheduled (1)")).toBeInTheDocument();
    expect(screen.getByText("Pausing")).toBeInTheDocument();
    expect(screen.queryByText("Running")).not.toBeInTheDocument();
  });

  it("guards cancel clicks while the native command is pending", async () => {
    let resolveCancel!: () => void;
    launcherMocks.cancelDownload.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveCancel = resolve;
      }),
    );
    useDownloadStore.setState({
      items: [
        makeDownloadItem({
          canCancel: true,
          bytesDownloaded: 1024 * 1024,
          bytesTotal: 2 * 1024 * 1024,
          gameId: "cancel-game",
          id: "download-cancel-game",
          phase: "Downloading",
          platform: "Xbox App / PC Game Pass",
          progress: 25,
          speed: "2 MB/s",
          status: "downloading",
          title: "Cancel Candidate",
        }),
      ],
    });

    renderDownloadsRoute("/downloads");

    expect(
      await screen.findByRole("heading", { level: 3, name: "Cancel Candidate" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Cancel Candidate download progress" }),
    ).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByText("Xbox App · PC Game Pass")).toBeInTheDocument();
    expect(screen.getByText("25% complete · Downloading")).toBeInTheDocument();
    expect(screen.getByText("2 MBPS · 1.0 MB of 2.0 MB")).toBeInTheDocument();
    expect(screen.getAllByText("2.0 MB/s")).toHaveLength(2);
    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    fireEvent.click(cancelButton);
    fireEvent.click(cancelButton);

    expect(launcherMocks.cancelDownload).toHaveBeenCalledTimes(1);
    expect(launcherMocks.cancelDownload).toHaveBeenCalledWith("cancel-game");
    expect(cancelButton).toBeDisabled();
    expect(cancelButton).toHaveAccessibleName("Cancelling...");

    await act(async () => {
      resolveCancel();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.queryByText("Cancel Candidate")).not.toBeInTheDocument();
    });
  });

  it("disables clear-all while a completed game command is pending", async () => {
    let resolveLaunch!: () => void;
    launcherMocks.launchGame.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveLaunch = resolve;
      }),
    );
    useDownloadStore.setState({
      items: [
        makeDownloadItem({
          gameId: "launch-game",
          id: "download-launch-game",
          title: "Launch Candidate",
        }),
      ],
    });

    renderDownloadsRoute("/downloads");

    const playButton = await screen.findByRole("button", { name: "Play" });
    fireEvent.click(playButton);

    expect(playButton).toBeDisabled();
    expect(playButton).toHaveAccessibleName("Launching...");
    expect(screen.getByRole("button", { name: "Archive" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear All" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Clear All" }));
    expect(launcherMocks.archiveDownload).not.toHaveBeenCalled();

    await act(async () => {
      resolveLaunch();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Clear All" })).toBeEnabled();
    });
  });

  it("ignores a malformed non-array library snapshot when native artwork loading fails", async () => {
    launcherMocks.listInstalledGames.mockRejectedValue(new Error("native library unavailable"));
    window.localStorage.setItem(STORAGE_KEYS.LIBRARY_SNAPSHOT, JSON.stringify({ games: [] }));

    renderDownloadsRoute("/downloads");

    expect(await screen.findByRole("heading", { level: 1, name: "Downloads" })).toBeInTheDocument();
    expect(screen.getByText("Queue clear")).toBeInTheDocument();
  });

  it("reports partial clear-all failures and keeps failed items visible", async () => {
    launcherMocks.archiveDownload.mockImplementation((gameId: string) =>
      gameId === "archive-fails" ? Promise.reject(new Error("Archive denied")) : Promise.resolve(),
    );
    useDownloadStore.setState({
      items: [
        makeDownloadItem({
          gameId: "archive-ok",
          id: "download-archive-ok",
          title: "Cleared Download",
        }),
        makeDownloadItem({
          gameId: "archive-fails",
          id: "download-archive-fails",
          title: "Retained Download",
        }),
      ],
    });

    renderDownloadsRoute("/downloads");
    fireEvent.click(await screen.findByRole("button", { name: "Clear All" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not clear 1 completed download: archive denied/i,
    );
    expect(screen.queryByText("Cleared Download")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Retained Download" }),
    ).toBeInTheDocument();
  });

  it("retries a failed download with its library source metadata", async () => {
    launcherMocks.listInstalledGames.mockResolvedValue([
      {
        id: "failed-game",
        title: "Retry Candidate",
        description: "",
        version: "1",
        status: "not_installed",
        platform: "windows",
        downloadUrl: "https://cdn.example.test/game.zip",
        downloadSha256: "abc123",
      } as Game,
    ]);
    useDownloadStore.setState({
      items: [
        makeDownloadItem({
          gameId: "failed-game",
          id: "download-failed-game",
          status: "failed",
          title: "Retry Candidate",
          error: "Network error",
        }),
      ],
    });

    renderDownloadsRoute("/downloads");
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(launcherMocks.startDownload).toHaveBeenCalledWith(
        "failed-game",
        "Retry Candidate",
        "https://cdn.example.test/game.zip",
        "abc123",
      );
    });
  });

  it("runs queue reconciliation from the downloads header", async () => {
    renderDownloadsRoute("/downloads");

    fireEvent.click(await screen.findByRole("button", { name: "Refresh download state" }));

    await waitFor(() => {
      expect(launcherMocks.reconcileDownloads).toHaveBeenCalledTimes(1);
    });
  });

  it("opens and closes the download settings panel", async () => {
    renderDownloadsRoute("/downloads");

    const settingsToggle = await screen.findByRole("button", { name: "Download settings" });
    expect(settingsToggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("region", { name: "Download settings panel" }),
    ).not.toBeInTheDocument();

    fireEvent.click(settingsToggle);
    expect(
      await screen.findByRole("region", { name: "Download settings panel" }),
    ).toBeInTheDocument();
    expect(settingsToggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(settingsToggle);
    expect(
      screen.queryByRole("region", { name: "Download settings panel" }),
    ).not.toBeInTheDocument();
  });

  it("saves the folder, bandwidth, and parallel downloads together", async () => {
    renderDownloadsRoute("/downloads");
    fireEvent.click(await screen.findByRole("button", { name: "Download settings" }));
    await screen.findByRole("region", { name: "Download settings panel" });

    fireEvent.change(screen.getByRole("textbox", { name: "Install folder" }), {
      target: { value: "D:\\Games" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Bandwidth limit" }), {
      target: { value: "1024" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Parallel downloads" }), {
      target: { value: "2" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => {
      expect(launcherMocks.saveDownloadSettings).toHaveBeenCalledWith({
        bandwidthLimitKbps: 1024,
        maxConcurrentDownloads: 2,
        installRoot: "D:\\Games",
      });
    });
  });
});
