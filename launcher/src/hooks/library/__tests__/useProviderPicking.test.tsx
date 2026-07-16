import { act, renderHook, waitFor } from "@testing-library/react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GameGroup } from "../../../lib/game-groups";
import type { Game } from "../../../lib/types";

const mocks = vi.hoisted(() => ({
  isTauri: vi.fn(),
  launchCrossPlayJoin: vi.fn(),
  launchGame: vi.fn(),
  launchXboxGame: vi.fn(),
  logGameStart: vi.fn(),
  startDownload: vi.fn(),
  syncGamePlaytimeStats: vi.fn(),
  writeActivePerformanceGameContext: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: mocks.isTauri,
}));

vi.mock("../../../lib/launcher", () => ({
  launchCrossPlayJoin: (...args: unknown[]) => mocks.launchCrossPlayJoin(...args),
  launchGame: (...args: unknown[]) => mocks.launchGame(...args),
  launchXboxGame: (...args: unknown[]) => mocks.launchXboxGame(...args),
  startDownload: (...args: unknown[]) => mocks.startDownload(...args),
}));

vi.mock("../../../lib/performance-context", () => ({
  writeActivePerformanceGameContext: (...args: unknown[]) =>
    mocks.writeActivePerformanceGameContext(...args),
}));

vi.mock("../../../lib/supabase/playtime", () => ({
  syncGamePlaytimeStats: (...args: unknown[]) => mocks.syncGamePlaytimeStats(...args),
}));

vi.mock("../../useActivityLogger", () => ({
  useActivityLogger: () => ({
    logGameStart: (...args: unknown[]) => mocks.logGameStart(...args),
  }),
}));

import { useProviderPicking } from "../useProviderPicking";

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "steam-1",
    title: "Test Game",
    description: "",
    version: "1.0",
    status: "not_installed",
    platform: "windows",
    launcher: "steam",
    ...overrides,
  } as Game;
}

function makeGroup(variants: Game[], title = "Test Group"): GameGroup {
  return {
    id: "test-group",
    key: "test-group",
    title,
    variants,
    primaryGame: variants[0],
    displayGame: variants[0],
    sources: variants.map((variant) => variant.launcher ?? "manual"),
    status: variants[0]?.status ?? "not_installed",
    playtimeMinutes: 0,
    achievements: [],
  } as GameGroup;
}

function renderProviderPicking(
  options: {
    initialEntry?: string;
    selectedGroup?: GameGroup | null;
    setStatusMessage?: Dispatch<SetStateAction<string | null>>;
  } = {},
) {
  const {
    initialEntry = "/",
    selectedGroup = null,
    setStatusMessage = vi.fn<Dispatch<SetStateAction<string | null>>>(),
  } = options;
  function wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>;
  }

  return {
    setStatusMessage,
    hook: renderHook(
      ({ group }: { group: GameGroup | null }) =>
        useProviderPicking({
          selectedGroup: group,
          setStatusMessage,
        }),
      { initialProps: { group: selectedGroup }, wrapper },
    ),
  };
}

describe("useProviderPicking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isTauri.mockReturnValue(true);
    mocks.startDownload.mockResolvedValue({ message: "Queued external install." });
    mocks.launchCrossPlayJoin.mockResolvedValue(undefined);
    mocks.launchGame.mockResolvedValue({ message: "Launching game." });
    mocks.launchXboxGame.mockResolvedValue(undefined);
    mocks.logGameStart.mockResolvedValue(undefined);
    mocks.syncGamePlaytimeStats.mockResolvedValue(undefined);
  });

  it("blocks play, install, and provider selection in the browser without native calls", async () => {
    mocks.isTauri.mockReturnValue(false);
    const game = makeGame({ status: "installed" });
    const { hook, setStatusMessage } = renderProviderPicking({
      selectedGroup: makeGroup([game]),
    });

    await act(async () => {
      await hook.result.current.handlePlay();
      await hook.result.current.handlePlayVariant(game);
      await hook.result.current.handleInstallFromProvider();
      await hook.result.current.handlePlayVariant(game, "install");
    });

    expect(setStatusMessage).toHaveBeenCalledWith(
      "Launching games is available only in the OG-Launcher desktop app.",
    );
    expect(setStatusMessage).toHaveBeenLastCalledWith(
      "Installing and updating games is available only in the OG-Launcher desktop app.",
    );
    expect(hook.result.current.providerPicker).toBeNull();
    expect(mocks.launchGame).not.toHaveBeenCalled();
    expect(mocks.launchXboxGame).not.toHaveBeenCalled();
    expect(mocks.startDownload).not.toHaveBeenCalled();
    expect(mocks.logGameStart).not.toHaveBeenCalled();
    expect(mocks.syncGamePlaytimeStats).not.toHaveBeenCalled();
  });

  it.each([
    ["steam-owned-1245620", "Steam"],
    ["steam-440", "Steam direct"],
    ["gog-owned-1207658995", "GOG"],
    ["gog-1207658995", "GOG direct"],
    ["epic-owned-fortnite", "Epic"],
    ["ea-owned-offer-1", "EA"],
    ["ubisoft-owned-635", "Ubisoft"],
    ["battlenet-owned-wow", "Battle.net"],
    ["xbox-owned-Microsoft.ForzaHorizon5_8wekyb3d8bbwe", "Xbox owned"],
    ["xbox-9NBLGGH4R315", "Xbox product"],
  ])("queues a non-installed %s variant through startDownload", async (id, title) => {
    const { hook, setStatusMessage } = renderProviderPicking();

    await act(async () => {
      await hook.result.current.handlePlayVariant(
        makeGame({
          id,
          title,
          launcher: id.startsWith("xbox-") ? "xbox" : undefined,
        }),
      );
    });

    expect(mocks.startDownload).toHaveBeenCalledWith(id, title, undefined, undefined);
    expect(mocks.launchXboxGame).not.toHaveBeenCalled();
    expect(setStatusMessage).toHaveBeenNthCalledWith(1, null);
    expect(setStatusMessage).toHaveBeenLastCalledWith("Queued external install.");
  });

  it.each([
    ["xbox-Microsoft.ForzaHorizon5_8wekyb3d8bbwe", "Microsoft.ForzaHorizon5_8wekyb3d8bbwe"],
    ["xbox-owned-Microsoft.ForzaHorizon5_8wekyb3d8bbwe", "Microsoft.ForzaHorizon5_8wekyb3d8bbwe"],
  ])("launches installed Xbox variant %s instead of queuing an install", async (id, pfn) => {
    const { hook, setStatusMessage } = renderProviderPicking();

    await act(async () => {
      await hook.result.current.handlePlayVariant(
        makeGame({
          id,
          title: "Forza Horizon 5",
          status: "installed",
          launcher: "xbox",
        }),
      );
    });

    expect(mocks.startDownload).not.toHaveBeenCalled();
    expect(mocks.launchXboxGame).toHaveBeenCalledWith(pfn);
    expect(setStatusMessage).toHaveBeenLastCalledWith("Launching Xbox game...");
    expect(mocks.writeActivePerformanceGameContext).toHaveBeenCalledWith({
      gameId: id,
      gameTitle: "Forza Horizon 5",
      launcher: "xbox",
    });
    expect(mocks.logGameStart).toHaveBeenCalledWith(id, "Forza Horizon 5", {
      launcher: "xbox",
    });
    expect(mocks.syncGamePlaytimeStats).toHaveBeenCalledWith(
      expect.objectContaining({
        countSessionStart: true,
        game: expect.objectContaining({ id }),
      }),
    );
  });

  it.each(["xbox-Forza Horizon 5", "xbox-Hades", "xbox-Halo_Infinite"])(
    "launches installed scanner-shaped Xbox variant %s through launchGame",
    async (id) => {
      const game = makeGame({
        id,
        title: "Scanner Xbox Game",
        status: "installed",
        launcher: "xbox",
      });
      const { hook, setStatusMessage } = renderProviderPicking();

      await act(async () => {
        await hook.result.current.handlePlayVariant(game);
      });

      expect(mocks.launchXboxGame).not.toHaveBeenCalled();
      expect(mocks.launchGame).toHaveBeenCalledWith(id);
      expect(setStatusMessage).toHaveBeenLastCalledWith("Launching game.");
      expect(mocks.writeActivePerformanceGameContext).toHaveBeenCalledWith({
        gameId: id,
        gameTitle: "Scanner Xbox Game",
        launcher: "xbox",
      });
      expect(mocks.logGameStart).toHaveBeenCalledWith(id, "Scanner Xbox Game", {
        launcher: "xbox",
      });
      expect(mocks.syncGamePlaytimeStats).toHaveBeenCalledWith(
        expect.objectContaining({
          countSessionStart: true,
          game,
        }),
      );
    },
  );

  it("leaves cross-play join queries to the library page", async () => {
    const { setStatusMessage } = renderProviderPicking({
      initialEntry: "/library?join=match-42&platform=steam",
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.launchCrossPlayJoin).not.toHaveBeenCalled();
    expect(setStatusMessage).not.toHaveBeenCalled();
  });

  it("launches an installed owned-provider game and records the session context", async () => {
    const game = makeGame({
      id: "epic-owned-fortnite",
      launcher: "epic",
      playtimeMinutes: 125,
      status: "installed",
      title: "Fortnite",
    });
    const { hook, setStatusMessage } = renderProviderPicking();

    await act(async () => {
      await hook.result.current.handlePlayVariant(game);
    });

    expect(mocks.launchGame).toHaveBeenCalledWith("epic-owned-fortnite");
    expect(setStatusMessage).toHaveBeenLastCalledWith("Launching game.");
    expect(mocks.writeActivePerformanceGameContext).toHaveBeenCalledWith({
      gameId: "epic-owned-fortnite",
      gameTitle: "Fortnite",
      launcher: "epic",
    });
    expect(mocks.logGameStart).toHaveBeenCalledWith("epic-owned-fortnite", "Fortnite", {
      launcher: "epic",
    });
    expect(mocks.syncGamePlaytimeStats).toHaveBeenCalledWith({
      countSessionStart: true,
      game,
      lastPlayedAt: expect.any(String),
      playtimeMinutes: 125,
    });
  });

  it("launches an owned-provider copy with an available update instead of queuing it", async () => {
    const game = makeGame({
      id: "steam-owned-1245620",
      launcher: "steam",
      status: "update_available",
      title: "Update Ready",
    });
    const { hook, setStatusMessage } = renderProviderPicking();

    await act(async () => {
      await hook.result.current.handlePlayVariant(game);
    });

    expect(mocks.launchGame).toHaveBeenCalledWith("steam-owned-1245620");
    expect(mocks.startDownload).not.toHaveBeenCalled();
    expect(setStatusMessage).toHaveBeenLastCalledWith("Launching game.");
    expect(mocks.logGameStart).toHaveBeenCalledWith("steam-owned-1245620", "Update Ready", {
      launcher: "steam",
    });
  });

  it("launches an installed manual game and tolerates playtime sync failure", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.syncGamePlaytimeStats.mockRejectedValue(new Error("offline"));
    const game = makeGame({
      id: "manual-game",
      launcher: undefined,
      status: "installed",
      title: "Manual Game",
    });
    const { hook } = renderProviderPicking();

    await act(async () => {
      await hook.result.current.handlePlayVariant(game);
    });

    expect(mocks.launchGame).toHaveBeenCalledWith("manual-game");
    expect(mocks.writeActivePerformanceGameContext).toHaveBeenCalledWith({
      gameId: "manual-game",
      gameTitle: "Manual Game",
      launcher: null,
    });
    await waitFor(() => {
      expect(warn).toHaveBeenCalledWith("Failed to sync play session start:", expect.any(Error));
    });
  });

  it("downloads an ordinary non-installed game and forwards integrity metadata", async () => {
    const game = makeGame({
      downloadSha256: "sha256-value",
      downloadUrl: "https://cdn.example.test/game.zip",
      id: "catalog-game",
      launcher: undefined,
    });
    const { hook, setStatusMessage } = renderProviderPicking();

    await act(async () => {
      await hook.result.current.handlePlayVariant(game);
    });

    expect(mocks.startDownload).toHaveBeenCalledWith(
      "catalog-game",
      "Test Game",
      "https://cdn.example.test/game.zip",
      "sha256-value",
    );
    expect(setStatusMessage).toHaveBeenLastCalledWith("Queued external install.");
  });

  it("reports launch failures without recording a play session", async () => {
    mocks.launchGame.mockRejectedValue(new Error("Executable missing"));
    const { hook, setStatusMessage } = renderProviderPicking();

    await act(async () => {
      await hook.result.current.handlePlayVariant(
        makeGame({ id: "manual-broken", status: "installed" }),
      );
    });

    expect(setStatusMessage).toHaveBeenLastCalledWith("Executable missing");
    expect(mocks.writeActivePerformanceGameContext).not.toHaveBeenCalled();
    expect(mocks.logGameStart).not.toHaveBeenCalled();
    expect(mocks.syncGamePlaytimeStats).not.toHaveBeenCalled();
  });

  it("opens a play picker when several playable variants exist", async () => {
    const variants = [
      makeGame({ id: "steam-owned-1", status: "installed" }),
      makeGame({ id: "gog-owned-2", launcher: "gog", status: "update_available" }),
    ];
    const { hook } = renderProviderPicking({ selectedGroup: makeGroup(variants, "Shared Game") });

    await act(async () => {
      await hook.result.current.handlePlay();
    });

    expect(hook.result.current.providerPicker).toEqual({
      mode: "play",
      title: "Shared Game",
      variants,
    });
    expect(mocks.launchGame).not.toHaveBeenCalled();
  });

  it("plays the only playable variant before considering installable copies", async () => {
    const playable = makeGame({ id: "manual-installed", status: "installed" });
    const installable = makeGame({ id: "catalog-copy", status: "not_installed" });
    const { hook } = renderProviderPicking({
      selectedGroup: makeGroup([playable, installable]),
    });

    await act(async () => {
      await hook.result.current.handlePlay();
    });

    expect(mocks.launchGame).toHaveBeenCalledWith("manual-installed");
    expect(mocks.startDownload).not.toHaveBeenCalled();
  });

  it("opens an install picker when no copy is playable and several are installable", async () => {
    const variants = [
      makeGame({ id: "catalog-one" }),
      makeGame({ id: "catalog-two", launcher: "gog" }),
    ];
    const { hook } = renderProviderPicking({ selectedGroup: makeGroup(variants) });

    await act(async () => {
      await hook.result.current.handlePlay();
    });

    expect(hook.result.current.providerPicker).toEqual({
      mode: "install",
      title: "Test Group",
      variants,
    });
  });

  it("installs the only eligible variant from the play action", async () => {
    const installable = makeGame({ id: "catalog-only" });
    const { hook } = renderProviderPicking({
      selectedGroup: makeGroup([installable]),
    });

    await act(async () => {
      await hook.result.current.handlePlay();
    });

    expect(mocks.startDownload).toHaveBeenCalledWith(
      "catalog-only",
      "Test Game",
      undefined,
      undefined,
    );
  });

  it("reports when a selected group has no playable or installable variant", async () => {
    const { hook, setStatusMessage } = renderProviderPicking();

    await act(async () => {
      await hook.result.current.handlePlay();
    });
    act(() => {
      hook.rerender({ group: makeGroup([]) });
    });
    await act(async () => {
      await hook.result.current.handlePlay();
    });

    expect(hook.result.current.providerPicker).toBeNull();
    expect(mocks.launchGame).not.toHaveBeenCalled();
    expect(mocks.startDownload).not.toHaveBeenCalled();
    expect(setStatusMessage).toHaveBeenLastCalledWith(
      "No installable copy of Test Group is available.",
    );
  });

  it("handles explicit provider installation for zero, one, or several candidates", async () => {
    const { hook, setStatusMessage } = renderProviderPicking();

    await act(async () => {
      await hook.result.current.handleInstallFromProvider();
    });
    act(() => {
      hook.rerender({ group: makeGroup([]) });
    });
    await act(async () => {
      await hook.result.current.handleInstallFromProvider();
    });
    expect(mocks.startDownload).not.toHaveBeenCalled();
    expect(setStatusMessage).toHaveBeenLastCalledWith(
      "Test Group is already installed and up to date.",
    );

    const only = makeGame({ id: "catalog-only" });
    act(() => {
      hook.rerender({ group: makeGroup([only]) });
    });
    await act(async () => {
      await hook.result.current.handleInstallFromProvider();
    });
    expect(mocks.startDownload).toHaveBeenCalledWith(
      "catalog-only",
      "Test Game",
      undefined,
      undefined,
    );

    const variants = [
      makeGame({ id: "catalog-a" }),
      makeGame({ id: "gog-owned-b", launcher: "gog", status: "update_available" }),
    ];
    act(() => {
      hook.rerender({ group: makeGroup(variants, "Install Choice") });
    });
    await act(async () => {
      await hook.result.current.handleInstallFromProvider();
    });
    expect(hook.result.current.providerPicker).toEqual({
      mode: "install",
      title: "Install Choice",
      variants,
    });
  });

  it("queues an explicit provider update instead of launching the playable copy", async () => {
    const update = makeGame({
      id: "gog-owned-1207658995",
      launcher: "gog",
      status: "update_available",
      title: "Update Ready",
    });
    const { hook, setStatusMessage } = renderProviderPicking({
      selectedGroup: makeGroup([update]),
    });

    await act(async () => {
      await hook.result.current.handleInstallFromProvider();
    });

    expect(mocks.startDownload).toHaveBeenCalledWith(
      "gog-owned-1207658995",
      "Update Ready",
      undefined,
      undefined,
    );
    expect(mocks.launchGame).not.toHaveBeenCalled();
    expect(setStatusMessage).toHaveBeenLastCalledWith("Queued external install.");
  });

  it("reports provider install and update failures", async () => {
    mocks.startDownload.mockRejectedValue(new Error("Provider client unavailable"));
    const update = makeGame({ status: "update_available" });
    const { hook, setStatusMessage } = renderProviderPicking();

    await act(async () => {
      await hook.result.current.handlePlayVariant(update, "install");
    });

    expect(setStatusMessage).toHaveBeenLastCalledWith("Provider client unavailable");
    expect(mocks.launchGame).not.toHaveBeenCalled();
  });
});
