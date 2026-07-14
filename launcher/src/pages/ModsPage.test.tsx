import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ManagedMod, ModBrowseItem, ModProvider } from "../lib/types/mods";
import { ModsPage } from "./ModsPage";

const launcherMocks = vi.hoisted(() => ({
  browseMods: vi.fn(),
  connectNexus: vi.fn(),
  disconnectNexus: vi.fn(),
  getModProviderStatus: vi.fn(),
  getNxmHandlerStatus: vi.fn(),
  installMod: vi.fn(),
  listInstalledGames: vi.fn(),
  listManagedMods: vi.fn(),
  openProviderMod: vi.fn(),
  openNxmHandlerSettings: vi.fn(),
  removeMod: vi.fn(),
  setModEnabled: vi.fn(),
  takePendingNxmStatus: vi.fn(),
}));

vi.mock("../lib/launcher", () => launcherMocks);

const nexusItem: ModBrowseItem = {
  author: "Mika K.",
  bannerUrl: null,
  downloads: "128K",
  endorsements: "8K",
  iconUrl: null,
  id: "nexus-42",
  installCapability: "native",
  installed: false,
  fileSizeBytes: 2048,
  name: "Photo Mode Overhaul",
  provider: "nexus",
  summary: "A compact camera and lighting toolkit.",
  updateAvailable: false,
  url: "https://www.nexusmods.com/cyberdrift/mods/42",
  version: "2.1",
};

const steamItem: ModBrowseItem = {
  author: "Steam Community",
  bannerUrl: null,
  downloads: null,
  endorsements: null,
  iconUrl: null,
  id: "workshop",
  installCapability: "steam_handoff",
  installed: false,
  fileSizeBytes: null,
  name: "Cyber Drift Workshop",
  provider: "steam_workshop",
  summary: "Browse compatible subscriptions in the Steam client.",
  updateAvailable: false,
  url: "steam://url/CommunityFilePage/123",
  version: null,
};

const managedNexus: ManagedMod = {
  canRemove: true,
  canToggle: true,
  enabled: true,
  gameId: "game-1",
  installId: "install-42",
  installedAt: 1_788_000_000,
  manageUrl: "https://www.nexusmods.com/cyberdrift/mods/42",
  provider: "nexus",
  providerItemId: "nexus-42",
  status: "update_available",
  title: "Photo Mode Overhaul",
  version: "2.0",
};

const managedSteam: ManagedMod = {
  canRemove: false,
  canToggle: false,
  enabled: true,
  gameId: "game-1",
  installId: "steam-123",
  installedAt: null,
  manageUrl: "steam://url/CommunityFilePage/123",
  provider: "steam_workshop",
  providerItemId: "123",
  status: "external",
  title: "Neon Garage",
  version: null,
};

function seedMocks() {
  launcherMocks.takePendingNxmStatus.mockResolvedValue(null);
  launcherMocks.getNxmHandlerStatus.mockResolvedValue({
    isDefault: true,
    message: "OG-Launcher handles Nexus download links.",
    registered: true,
    state: "registered",
  });
  launcherMocks.openNxmHandlerSettings.mockResolvedValue(undefined);
  launcherMocks.listInstalledGames.mockResolvedValue([
    {
      description: "",
      id: "game-1",
      launcher: "steam",
      platform: "windows",
      status: "installed",
      title: "Cyber Drift",
      version: "1.0",
    },
    {
      description: "",
      id: "game-2",
      launcher: "steam",
      platform: "windows",
      status: "installed",
      title: "Space Quest",
      version: "1.0",
    },
  ]);
  launcherMocks.getModProviderStatus.mockImplementation((provider: ModProvider) =>
    Promise.resolve({
      action: provider === "nexus" ? "disconnect" : "open_provider",
      actionLabel: provider === "nexus" ? "Disconnect Nexus" : "Open Steam Workshop",
      available: true,
      connected: provider === "nexus",
      message:
        provider === "nexus"
          ? "Official Nexus connection is ready."
          : "Subscriptions are managed by Steam.",
      provider,
      supportsBrowse: provider === "nexus",
      supportsNativeInstall: provider === "nexus",
    }),
  );
  launcherMocks.browseMods.mockImplementation(({ provider }: { provider: ModProvider }) =>
    Promise.resolve({
      items: provider === "nexus" ? [nexusItem] : [steamItem],
      message: null,
      nextCursor: null,
      total: 1,
    }),
  );
  launcherMocks.listManagedMods.mockResolvedValue([]);
  launcherMocks.connectNexus.mockResolvedValue({
    action: "disconnect",
    actionLabel: "Disconnect Nexus",
    available: true,
    connected: true,
    message: "Nexus connected.",
    provider: "nexus",
    supportsBrowse: true,
    supportsNativeInstall: true,
  });
  launcherMocks.disconnectNexus.mockResolvedValue({
    action: "connect",
    actionLabel: "Connect Nexus",
    available: true,
    connected: false,
    message: "Nexus disconnected.",
    provider: "nexus",
    supportsBrowse: false,
    supportsNativeInstall: false,
  });
  launcherMocks.installMod.mockResolvedValue({
    delegatedUrl: null,
    installId: "install-42",
    message: "Install queued.",
    status: "queued",
  });
  launcherMocks.setModEnabled.mockResolvedValue({ ...managedNexus, enabled: false });
  launcherMocks.removeMod.mockResolvedValue(undefined);
  launcherMocks.openProviderMod.mockResolvedValue({
    delegatedUrl: "steam://url/CommunityFilePage/123",
    installId: null,
    message: "Steam Workshop opened.",
    status: "handoff",
  });
}

function renderModsRoute(initialEntry = "/mods") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<ModsPage />} path="/mods" />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ModsPage simplified multi-provider manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedMocks();
  });

  it("opens on Browse with only Nexus and Steam controls and loads popular Nexus mods", async () => {
    renderModsRoute();

    expect(screen.getByRole("tab", { name: "Browse" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("Photo Mode Overhaul")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nexus Mods/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /Steam Workshop/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByLabelText("Target Game")).toHaveValue("game-1");
    expect(screen.getByRole("button", { name: "popular" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Install" })).toBeInTheDocument();
    expect(screen.getByText("Photo Mode Overhaul").closest("article")?.parentElement).toHaveClass(
      "grid-cols-1",
      "sm:grid-cols-2",
      "lg:grid-cols-3",
    );
    expect(screen.queryByText("No manual API keys")).not.toBeInTheDocument();
    expect(screen.getByText("Official catalog + manager handoff")).toHaveClass(
      "whitespace-normal",
      "sm:truncate",
    );

    expect(
      screen.queryByText(/mod\.io|curseforge|direct url|local archive/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/api key|game slug|provider id|source url/i),
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(launcherMocks.browseMods).toHaveBeenCalledWith({
        cursor: undefined,
        gameId: "game-1",
        pageSize: 12,
        provider: "nexus",
        query: "",
        sort: "popular",
      });
    });
  });

  it("keeps the gameId route contract and reloads when game, provider, search, or sort changes", async () => {
    renderModsRoute("/mods?gameId=game-2");
    expect(await screen.findByText("Photo Mode Overhaul")).toBeInTheDocument();
    expect(screen.getByLabelText("Target Game")).toHaveValue("game-2");

    fireEvent.change(screen.getByLabelText("Target Game"), { target: { value: "game-1" } });
    fireEvent.click(screen.getByRole("button", { name: /Steam Workshop/i }));
    expect(await screen.findByText("Cyber Drift Workshop")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Browse in Steam" })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "garage" } });
    fireEvent.submit(screen.getByRole("search"));
    fireEvent.click(screen.getByRole("button", { name: "latest" }));

    await waitFor(() => {
      expect(launcherMocks.browseMods).toHaveBeenCalledWith(
        expect.objectContaining({
          gameId: "game-1",
          provider: "steam_workshop",
          query: "garage",
          sort: "latest",
        }),
      );
    });
  });

  it("runs a native install once and never turns a provider handoff into an installed mod", async () => {
    let finishInstall!: (result: {
      delegatedUrl: null;
      installId: string;
      message: string;
      status: "queued";
    }) => void;
    launcherMocks.installMod.mockReturnValueOnce(
      new Promise((resolve) => {
        finishInstall = resolve;
      }),
    );

    renderModsRoute();
    const installButton = await screen.findByRole("button", { name: "Install" });
    fireEvent.click(installButton);
    fireEvent.click(installButton);

    await waitFor(() => expect(launcherMocks.installMod).toHaveBeenCalledTimes(1));
    expect(launcherMocks.installMod).toHaveBeenCalledWith({
      capability: "native",
      gameId: "game-1",
      itemId: "nexus-42",
      provider: "nexus",
      title: nexusItem.name,
    });
    finishInstall({
      delegatedUrl: null,
      installId: "install-42",
      message: "Install queued.",
      status: "queued",
    });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Install queued."));

    launcherMocks.installMod.mockResolvedValueOnce({
      delegatedUrl: steamItem.url,
      installId: null,
      message: "Steam Workshop opened.",
      status: "handoff",
    });
    fireEvent.click(screen.getByRole("button", { name: /Steam Workshop/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Browse in Steam" }));

    await waitFor(() => expect(launcherMocks.installMod).toHaveBeenCalledTimes(2));
    expect(
      (await screen.findAllByText(/Provider opened \/\/ Steam Workshop opened/i)).length,
    ).toBeGreaterThan(0);
    expect(launcherMocks.listManagedMods).toHaveBeenCalled();
    expect(screen.queryByText("Installed", { selector: "span" })).not.toBeInTheDocument();
  });

  it("resets search and sort when the target game changes", async () => {
    renderModsRoute();
    await screen.findByText("Photo Mode Overhaul");

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "garage" } });
    fireEvent.submit(screen.getByRole("search"));
    fireEvent.click(screen.getByRole("button", { name: "latest" }));
    await waitFor(() => {
      expect(launcherMocks.browseMods).toHaveBeenCalledWith(
        expect.objectContaining({ query: "garage", sort: "latest" }),
      );
    });

    fireEvent.change(screen.getByLabelText("Target Game"), { target: { value: "game-2" } });
    await waitFor(() => {
      expect(launcherMocks.browseMods).toHaveBeenCalledWith(
        expect.objectContaining({ gameId: "game-2", query: "", sort: "popular" }),
      );
    });
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getByRole("button", { name: "popular" })).toHaveAttribute("aria-pressed", "true");
  });

  it("uses provider cursors for next and previous result pages", async () => {
    launcherMocks.browseMods
      .mockResolvedValueOnce({
        items: [nexusItem],
        message: null,
        nextCursor: "cursor-page-2",
        total: 2,
      })
      .mockResolvedValueOnce({
        items: [{ ...nexusItem, id: "nexus-43", name: "Night City Weather" }],
        message: null,
        nextCursor: null,
        total: 2,
      })
      .mockResolvedValueOnce({
        items: [nexusItem],
        message: null,
        nextCursor: "cursor-page-2",
        total: 2,
      });

    renderModsRoute();
    fireEvent.click(await screen.findByRole("button", { name: /Next/i }));
    expect(await screen.findByText("Night City Weather")).toBeInTheDocument();
    expect(launcherMocks.browseMods).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "cursor-page-2" }),
    );

    fireEvent.click(screen.getByRole("button", { name: /Previous/i }));
    expect(await screen.findByText("Photo Mode Overhaul")).toBeInTheDocument();
    expect(launcherMocks.browseMods).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: undefined }),
    );
  });

  it("renders explicit loading, empty, and provider-error states without mock catalog data", async () => {
    launcherMocks.browseMods.mockReturnValueOnce(new Promise(() => undefined));
    const loadingView = renderModsRoute();
    expect(await screen.findByText("Loading Nexus Mods")).toBeInTheDocument();
    loadingView.unmount();

    launcherMocks.browseMods.mockResolvedValueOnce({
      items: [],
      message: "No official results are available.",
      nextCursor: null,
      total: 0,
    });
    const emptyView = renderModsRoute();
    expect(await screen.findByText("No official results are available.")).toBeInTheDocument();
    expect(screen.getByText("No mods found")).toBeInTheDocument();
    emptyView.unmount();

    launcherMocks.browseMods.mockRejectedValueOnce(new Error("Provider rate limited"));
    renderModsRoute();
    expect(await screen.findByRole("alert")).toHaveTextContent("Provider rate limited");
    expect(screen.queryByText("Photo Mode Overhaul")).not.toBeInTheDocument();
  });

  it("manages Nexus locally, confirms removal, and delegates Steam management", async () => {
    launcherMocks.listManagedMods.mockResolvedValue([managedNexus, managedSteam]);
    renderModsRoute();

    const myModsTab = await screen.findByRole("tab", { name: /My Mods/i });
    fireEvent.click(myModsTab);
    const panel = screen.getByRole("tabpanel", { name: /My Mods/i });
    expect(await within(panel).findByText("Neon Garage")).toBeInTheDocument();
    expect(within(panel).getByText("Steam managed")).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: "Disable Photo Mode Overhaul" }));
    await waitFor(() => {
      expect(launcherMocks.setModEnabled).toHaveBeenCalledWith("install-42", false);
    });
    await waitFor(() => {
      expect(within(panel).queryByText("Reconciling local mods...")).not.toBeInTheDocument();
      expect(launcherMocks.listManagedMods).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(within(panel).getByRole("button", { name: "Remove Photo Mode Overhaul" }));
    expect(within(panel).getByText("Remove?")).toBeInTheDocument();
    expect(launcherMocks.removeMod).not.toHaveBeenCalled();
    fireEvent.click(
      within(panel).getByRole("button", { name: "Confirm remove Photo Mode Overhaul" }),
    );
    await waitFor(() => expect(launcherMocks.removeMod).toHaveBeenCalledWith("install-42"));
    await waitFor(() => {
      expect(within(panel).queryByText("Reconciling local mods...")).not.toBeInTheDocument();
      expect(launcherMocks.listManagedMods).toHaveBeenCalledTimes(3);
    });

    fireEvent.click(within(panel).getByRole("button", { name: "Manage in Steam" }));
    await waitFor(() => {
      expect(launcherMocks.openProviderMod).toHaveBeenCalledWith({
        gameId: "game-1",
        itemId: "123",
        provider: "steam_workshop",
        url: managedSteam.manageUrl,
      });
    });
  });

  it("offers one system action when another app owns the NXM handler", async () => {
    launcherMocks.getNxmHandlerStatus.mockResolvedValue({
      isDefault: false,
      message: "Another application handles Nexus download links.",
      registered: false,
      state: "handler_conflict",
    });
    renderModsRoute();

    fireEvent.click(await screen.findByRole("button", { name: "Change NXM Handler" }));
    await waitFor(() => {
      expect(launcherMocks.openNxmHandlerSettings).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByRole("status")).toHaveTextContent("System settings opened");
  });

  it("connects and disconnects Nexus without exposing credentials", async () => {
    launcherMocks.getModProviderStatus.mockResolvedValueOnce({
      action: "connect",
      actionLabel: "Connect Nexus",
      available: true,
      connected: false,
      message: "Connect through the official browser flow.",
      provider: "nexus",
      supportsBrowse: false,
      supportsNativeInstall: false,
    });
    const disconnectedView = renderModsRoute();
    fireEvent.click(await screen.findByRole("button", { name: "Connect Nexus" }));
    await waitFor(() => expect(launcherMocks.connectNexus).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText(/api key/i)).not.toBeInTheDocument();
    disconnectedView.unmount();

    vi.clearAllMocks();
    seedMocks();
    renderModsRoute();
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect Nexus" }));
    await waitFor(() => expect(launcherMocks.disconnectNexus).toHaveBeenCalledTimes(1));
  });

  it("uses official Nexus web handoff without requiring an app slug", async () => {
    launcherMocks.getModProviderStatus.mockResolvedValue({
      action: "open_provider",
      actionLabel: "Browse on Nexus",
      available: true,
      connected: false,
      message: "Browse Nexus Mods on its official website without an API key or app slug.",
      provider: "nexus",
      supportsBrowse: false,
      supportsNativeInstall: false,
    });
    launcherMocks.browseMods.mockResolvedValue({
      items: [],
      message: "Search continues on the official Nexus Mods website.",
      nextCursor: null,
      total: null,
    });

    renderModsRoute();
    fireEvent.click(await screen.findByRole("button", { name: "Browse on Nexus" }));

    await waitFor(() => {
      expect(launcherMocks.openProviderMod).toHaveBeenCalledWith({
        gameId: "game-1",
        provider: "nexus",
        query: "",
        sort: "popular",
      });
    });
    expect(launcherMocks.connectNexus).not.toHaveBeenCalled();
    expect(launcherMocks.getNxmHandlerStatus).not.toHaveBeenCalled();
    expect(launcherMocks.installMod).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Continue on Nexus" })).not.toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent("Provider opened");
  });

  it("announces a redacted pending NXM continuation failure", async () => {
    launcherMocks.takePendingNxmStatus
      .mockResolvedValueOnce({
        accepted: false,
        code: "continuation_failed",
        fileId: null,
        gameDomain: null,
        message: "The Nexus continuation could not be completed. Try the download again.",
        modId: null,
      })
      .mockResolvedValueOnce(null);

    renderModsRoute();

    expect(await screen.findByRole("status")).toHaveTextContent(
      "NXM continuation failed // The Nexus continuation could not be completed",
    );
    expect(screen.getByRole("status")).not.toHaveTextContent("nxm://");
  });

  it("queues an available Nexus update exactly once", async () => {
    launcherMocks.listManagedMods.mockResolvedValue([managedNexus]);
    renderModsRoute();
    fireEvent.click(await screen.findByRole("tab", { name: /My Mods/i }));

    const updateButton = await screen.findByRole("button", {
      name: "Update Photo Mode Overhaul",
    });
    fireEvent.click(updateButton);
    fireEvent.click(updateButton);

    await waitFor(() => {
      expect(launcherMocks.installMod).toHaveBeenCalledTimes(1);
      expect(launcherMocks.installMod).toHaveBeenCalledWith({
        capability: "native",
        gameId: "game-1",
        itemId: "nexus-42",
        provider: "nexus",
        title: "Photo Mode Overhaul",
      });
    });
  });

  it("supports arrow-key tab navigation and exposes loading and status semantics", async () => {
    renderModsRoute();
    const browseTab = screen.getByRole("tab", { name: "Browse" });
    fireEvent.keyDown(browseTab, { key: "ArrowRight" });

    const managedTab = await screen.findByRole("tab", { name: /My Mods/i });
    expect(managedTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: /My Mods/i })).toHaveAttribute(
      "aria-labelledby",
      "mods-tab-managed",
    );
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
});
