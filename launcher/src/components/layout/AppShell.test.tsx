import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  APP_SHELL_SKIN_STORAGE_KEY,
  notifyAppShellSkinChanged,
  writeAppShellSkinId,
} from "../../lib/app-shell-skins";
import { useLauncherUpdateStore } from "../../stores/launcherUpdateStore";
import { useDownloadStore } from "../../stores/downloadStore";
import { useModInstallStore } from "../../stores/modInstallStore";
import { getDownloadQueue, getModQueue } from "../../lib/launcher";
import type { DownloadItem } from "../../lib/types";
import type { ModInstallQueueItem } from "../../lib/types/mods";
import { AppShell } from "./AppShell";
import type { PageKey } from "./Sidebar";

const tauriWindowMock = vi.hoisted(() => ({
  currentWindow: {
    close: vi.fn(() => Promise.resolve()),
    isMaximized: vi.fn(() => Promise.resolve(false)),
    minimize: vi.fn(() => Promise.resolve()),
    startDragging: vi.fn(() => Promise.resolve()),
    toggleMaximize: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => undefined)),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => tauriWindowMock.currentWindow),
}));

vi.mock("../../lib/launcher", () => ({
  getDownloadQueue: vi.fn(() => Promise.resolve([])),
  getModQueue: vi.fn(() => Promise.resolve([])),
  runBackupPlan: vi.fn(() => Promise.resolve({ manifestId: "manifest", message: "Backup done" })),
  runScheduledPlatformClientUpdateChecks: vi.fn(() =>
    Promise.resolve({ checkedAt: "2026-06-12T10:00:00.000Z", message: "", updateCount: 0 }),
  ),
}));

function makeModQueueItem(overrides: Partial<ModInstallQueueItem> = {}): ModInstallQueueItem {
  return {
    id: "mod-install-1",
    installId: "mod-install-1",
    gameId: "game-1",
    title: "Startup Mod",
    provider: "nexus",
    progress: 10,
    speed: "1 MB/s",
    status: "downloading",
    phase: "Downloading",
    canPause: false,
    canCancel: true,
    external: false,
    lastUpdatedAt: 1,
    ...overrides,
  };
}

function makeDownloadItem(overrides: Partial<DownloadItem> = {}): DownloadItem {
  return {
    gameId: "game-1",
    id: "download-game-1",
    progress: 10,
    speed: "1 MB/s",
    status: "downloading",
    title: "Startup Download",
    canCancel: true,
    canPause: true,
    lastUpdatedAt: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listen).mockImplementation(() => Promise.resolve(() => undefined));
  vi.mocked(getDownloadQueue).mockResolvedValue([]);
  vi.mocked(getModQueue).mockResolvedValue([]);
  useDownloadStore.setState({ items: [] });
  useModInstallStore.setState({ items: [] });
});

describe("AppShell browser-local shell skins", () => {
  it("hydrates the central mod queue and applies global progress events", async () => {
    vi.mocked(getModQueue).mockResolvedValue([makeModQueueItem()]);
    renderShell({ isDesktop: true });

    await waitFor(() => {
      expect(useModInstallStore.getState().items).toHaveLength(1);
    });
    expect(useModInstallStore.getState().items[0]).toMatchObject({
      installId: "mod-install-1",
      progress: 10,
    });

    const progressCall = vi
      .mocked(listen)
      .mock.calls.find(([eventName]) => eventName === "mod_install_progress");
    expect(progressCall).toBeDefined();

    act(() => {
      const handler = progressCall?.[1] as (event: { payload: ModInstallQueueItem }) => void;
      handler({ payload: makeModQueueItem({ progress: 65, lastUpdatedAt: 2 }) });
    });

    expect(useModInstallStore.getState().items[0]).toMatchObject({
      installId: "mod-install-1",
      progress: 65,
    });
  });

  it("keeps progress events that arrive while the download queue is hydrating", async () => {
    let resolveQueue!: (items: DownloadItem[]) => void;
    vi.mocked(getDownloadQueue).mockReturnValue(
      new Promise((resolve) => {
        resolveQueue = resolve;
      }),
    );
    renderShell({ isDesktop: true });

    const progressCall = vi
      .mocked(listen)
      .mock.calls.find(([eventName]) => eventName === "download_progress");
    expect(progressCall).toBeDefined();

    act(() => {
      const handler = progressCall?.[1] as (event: { payload: DownloadItem }) => void;
      handler({ payload: makeDownloadItem({ progress: 65, lastUpdatedAt: 2 }) });
    });

    await act(async () => {
      resolveQueue([makeDownloadItem()]);
      await Promise.resolve();
    });

    expect(useDownloadStore.getState().items).toHaveLength(1);
    expect(useDownloadStore.getState().items[0]).toMatchObject({
      gameId: "game-1",
      progress: 65,
    });
  });

  it("keeps a newer download snapshot when an older progress event was buffered", async () => {
    let resolveQueue!: (items: DownloadItem[]) => void;
    vi.mocked(getDownloadQueue).mockReturnValue(
      new Promise((resolve) => {
        resolveQueue = resolve;
      }),
    );
    renderShell({ isDesktop: true });

    const progressCall = vi
      .mocked(listen)
      .mock.calls.find(([eventName]) => eventName === "download_progress");
    expect(progressCall).toBeDefined();

    act(() => {
      const handler = progressCall?.[1] as (event: { payload: DownloadItem }) => void;
      handler({ payload: makeDownloadItem({ progress: 40, lastUpdatedAt: 10 }) });
    });

    await act(async () => {
      resolveQueue([makeDownloadItem({ progress: 80, lastUpdatedAt: 20 })]);
      await Promise.resolve();
    });

    expect(useDownloadStore.getState().items[0]).toMatchObject({
      gameId: "game-1",
      lastUpdatedAt: 20,
      progress: 80,
    });
  });

  it("uses event revisions when download updates share the same second", async () => {
    let resolveQueue!: (items: DownloadItem[]) => void;
    vi.mocked(getDownloadQueue).mockReturnValue(
      new Promise((resolve) => {
        resolveQueue = resolve;
      }),
    );
    renderShell({ isDesktop: true });

    const progressCall = vi
      .mocked(listen)
      .mock.calls.find(([eventName]) => eventName === "download_progress");
    act(() => {
      const handler = progressCall?.[1] as (event: { payload: DownloadItem }) => void;
      handler({
        payload: makeDownloadItem({
          eventRevision: 100,
          lastUpdatedAt: 10,
          progress: 40,
        }),
      });
    });

    await act(async () => {
      resolveQueue([makeDownloadItem({ eventRevision: 101, lastUpdatedAt: 10, progress: 100 })]);
      await Promise.resolve();
    });

    expect(useDownloadStore.getState().items[0]).toMatchObject({
      eventRevision: 101,
      lastUpdatedAt: 10,
      progress: 100,
    });
  });

  it("keeps a newer mod snapshot when an older progress event was buffered", async () => {
    let resolveQueue!: (items: ModInstallQueueItem[]) => void;
    vi.mocked(getModQueue).mockReturnValue(
      new Promise((resolve) => {
        resolveQueue = resolve;
      }),
    );
    renderShell({ isDesktop: true });

    const progressCall = vi
      .mocked(listen)
      .mock.calls.find(([eventName]) => eventName === "mod_install_progress");
    expect(progressCall).toBeDefined();

    act(() => {
      const handler = progressCall?.[1] as (event: { payload: ModInstallQueueItem }) => void;
      handler({ payload: makeModQueueItem({ progress: 40, lastUpdatedAt: 10 }) });
    });

    await act(async () => {
      resolveQueue([makeModQueueItem({ progress: 80, lastUpdatedAt: 20 })]);
      await Promise.resolve();
    });

    expect(useModInstallStore.getState().items[0]).toMatchObject({
      installId: "mod-install-1",
      lastUpdatedAt: 20,
      progress: 80,
    });
  });

  it("uses event revisions when mod updates share the same second", async () => {
    let resolveQueue!: (items: ModInstallQueueItem[]) => void;
    vi.mocked(getModQueue).mockReturnValue(
      new Promise((resolve) => {
        resolveQueue = resolve;
      }),
    );
    renderShell({ isDesktop: true });

    const progressCall = vi
      .mocked(listen)
      .mock.calls.find(([eventName]) => eventName === "mod_install_progress");
    act(() => {
      const handler = progressCall?.[1] as (event: { payload: ModInstallQueueItem }) => void;
      handler({
        payload: makeModQueueItem({
          eventRevision: 100,
          lastUpdatedAt: 10,
          progress: 40,
        }),
      });
    });

    await act(async () => {
      resolveQueue([makeModQueueItem({ eventRevision: 101, lastUpdatedAt: 10, progress: 100 })]);
      await Promise.resolve();
    });

    expect(useModInstallStore.getState().items[0]).toMatchObject({
      eventRevision: 101,
      lastUpdatedAt: 10,
      progress: 100,
    });
  });

  it("waits for download listeners before requesting the initial queue", async () => {
    let resolveProgressListener!: (unlisten: () => void) => void;
    let resolveRemovedListener!: (unlisten: () => void) => void;
    vi.mocked(listen).mockImplementation((eventName) => {
      if (eventName === "download_progress") {
        return new Promise((resolve) => {
          resolveProgressListener = resolve;
        });
      }
      if (eventName === "download_removed") {
        return new Promise((resolve) => {
          resolveRemovedListener = resolve;
        });
      }
      return Promise.resolve(() => undefined);
    });

    renderShell({ isDesktop: true });

    expect(
      vi.mocked(listen).mock.calls.some(([eventName]) => eventName === "download_progress"),
    ).toBe(true);
    expect(
      vi.mocked(listen).mock.calls.some(([eventName]) => eventName === "download_removed"),
    ).toBe(true);
    expect(getDownloadQueue).not.toHaveBeenCalled();

    await act(async () => {
      resolveProgressListener(() => undefined);
      resolveRemovedListener(() => undefined);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(getDownloadQueue).toHaveBeenCalledTimes(1);
    });
  });

  it("does not restore a download removed while the queue is hydrating", async () => {
    let resolveQueue!: (items: DownloadItem[]) => void;
    vi.mocked(getDownloadQueue).mockReturnValue(
      new Promise((resolve) => {
        resolveQueue = resolve;
      }),
    );
    renderShell({ isDesktop: true });

    const removedCall = vi
      .mocked(listen)
      .mock.calls.find(([eventName]) => eventName === "download_removed");
    expect(removedCall).toBeDefined();

    act(() => {
      const handler = removedCall?.[1] as (event: { payload: { gameId: string } }) => void;
      handler({ payload: { gameId: "game-1" } });
    });

    await act(async () => {
      resolveQueue([makeDownloadItem()]);
      await Promise.resolve();
    });

    expect(useDownloadStore.getState().items).toEqual([]);
  });

  it("applies the stored shell skin to the shell root and document", () => {
    window.localStorage.setItem(APP_SHELL_SKIN_STORAGE_KEY, "teal-print");

    const { container, unmount } = renderShell();
    const shell = container.querySelector("[data-og-shell-skin]");

    expect(shell).toHaveAttribute("data-og-shell-skin", "teal-print");
    expect(document.documentElement.dataset.ogShellSkin).toBe("teal-print");

    unmount();

    expect(document.documentElement.dataset.ogShellSkin).toBeUndefined();
  });

  it("updates when the browser-only shell skin event fires", () => {
    const { container } = renderShell();
    const shell = container.querySelector("[data-og-shell-skin]");

    expect(shell).toHaveAttribute("data-og-shell-skin", "retro-paper");

    act(() => {
      const skinId = writeAppShellSkinId("redline-print");
      notifyAppShellSkinChanged(skinId);
    });

    expect(shell).toHaveAttribute("data-og-shell-skin", "redline-print");
  });

  it("keeps the OG-Launcher brand and required primary nav in the header", () => {
    renderShell();

    const header = screen.getByRole("banner");
    expect(within(header).getByRole("button", { name: "OG-Launcher" })).toBeInTheDocument();
    for (const label of ["Store", "Library", "Community", "Downloads"]) {
      expect(within(header).getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("keeps the brand row above the primary navigation row", () => {
    renderShell();

    const header = screen.getByRole("banner");
    const brandRow = header.querySelector(".app-shell-brand-row");
    const navRow = header.querySelector(".app-shell-nav-row");

    expect(header).toHaveClass("flex-col");
    expect(brandRow).toContainElement(within(header).getByRole("button", { name: "OG-Launcher" }));
    expect(navRow).toContainElement(within(header).getByRole("button", { name: "Library" }));
    expect(navRow).toContainElement(within(header).getByRole("button", { name: "Notifications" }));
    expect(navRow).toContainElement(within(header).getByRole("button", { name: "Login" }));
    expect(brandRow).not.toContainElement(
      within(header).getByRole("button", { name: "Notifications" }),
    );
    expect(brandRow?.nextElementSibling).toBe(navRow);
  });

  it("shows an honest empty notification feed without invented account events", () => {
    window.localStorage.clear();
    renderShell({ isAuthenticated: true });

    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));

    const dialog = screen.getByRole("dialog", { name: "Notifications" });
    expect(within(dialog).getByText(/no launcher notifications yet/i)).toBeInTheDocument();
    expect(
      within(dialog).queryByText("Akira's Revenge is ready to launch."),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByText("Neo-Tokyo Drift has a new content pack."),
    ).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/three new indie titles/i)).not.toBeInTheDocument();
  });

  it("announces a signed launcher update and routes its action to settings", () => {
    const onNavigate = vi.fn();
    act(() => {
      useLauncherUpdateStore.setState({
        status: "available",
        currentVersion: "0.1.0",
        latestVersion: "0.2.0",
        notes: "Signed release",
        progress: null,
        error: null,
        unsupportedReason: null,
        lastCheckedAt: "2026-07-14T14:00:00.000Z",
      });
    });

    renderShell({ onNavigate });
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));

    const dialog = screen.getByRole("dialog", { name: "Notifications" });
    expect(within(dialog).getByText("OG Launcher Update")).toBeInTheDocument();
    expect(within(dialog).getByText(/signed version v0.2.0/i)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /review update/i }));
    expect(onNavigate).toHaveBeenCalledWith("settings");

    act(() => {
      useLauncherUpdateStore.setState({
        status: "idle",
        currentVersion: null,
        latestVersion: null,
        notes: null,
        progress: null,
        error: null,
        unsupportedReason: null,
        lastCheckedAt: null,
      });
    });
  });

  it("places desktop window controls in the header brand row without a separate title bar", async () => {
    const { container } = renderShell({ isDesktop: true });

    const header = screen.getByRole("banner");
    const brandRow = header.querySelector(".app-shell-brand-row");

    expect(container.querySelector(".app-shell-titlebar")).not.toBeInTheDocument();
    expect(await within(header).findByRole("button", { name: "Minimize" })).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: "Maximize" })).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(brandRow).toContainElement(within(header).getByRole("button", { name: "Close" }));
    expect(brandRow?.querySelector(".app-window-controls")).toBeInTheDocument();
    expect(brandRow?.querySelector(".app-window-controls")).not.toHaveClass("border-[3px]");
    expect(brandRow?.querySelector(".app-window-control-button")).toHaveClass(
      "border-transparent",
      "bg-transparent",
    );
    const dragRegion = brandRow?.querySelector("[data-tauri-drag-region]");
    expect(dragRegion).toBeInTheDocument();
    expect(dragRegion).toHaveClass("self-stretch", "min-h-8");

    tauriWindowMock.currentWindow.startDragging.mockClear();
    fireEvent.mouseDown(dragRegion as Element, { button: 0 });
    expect(tauriWindowMock.currentWindow.startDragging).toHaveBeenCalledTimes(1);
  });

  it("sizes the library shell from the real header height instead of a fixed viewport subtraction", () => {
    const { container } = renderShell();

    const shell = container.querySelector(".app-shell-root");
    const shellFrame = shell?.firstElementChild;
    const header = screen.getByRole("banner");
    const main = container.querySelector(".app-library-main");

    expect(shell).toHaveClass("h-screen", "min-h-0", "overflow-hidden");
    expect(shell).not.toHaveClass("min-h-screen");
    expect(shellFrame).toHaveClass("flex", "h-full", "min-h-0", "flex-col", "overflow-hidden");
    expect(header).toHaveClass("shrink-0");
    expect(main).toHaveClass("flex-1", "overflow-hidden");
    expect(main?.className).not.toContain("h-[calc(100vh-80px)]");
  });
});

function renderShell({
  isDesktop = false,
  isAuthenticated = false,
  onNavigate = () => undefined,
}: {
  isDesktop?: boolean;
  isAuthenticated?: boolean;
  onNavigate?: (page: PageKey) => void;
} = {}) {
  vi.mocked(isTauri).mockReturnValue(isDesktop);

  return render(
    <AppShell
      activePage="library"
      authAvatarUrl={null}
      authDisplayName={null}
      authEmail={null}
      authProfilePath={null}
      authUsername={null}
      isAuthConfigured={false}
      isAuthLoading={false}
      isAuthProfileLoading={false}
      isAuthenticated={isAuthenticated}
      subtitle="Local shell skin test"
      title="OG-Launcher"
      onLogout={() => Promise.resolve()}
      onNavigate={onNavigate}
    >
      <div>Library content</div>
    </AppShell>,
  );
}
