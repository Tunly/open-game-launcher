import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ModsPage } from "./ModsPage";

const launcherMocks = vi.hoisted(() => ({
  disableMod: vi.fn(),
  enableMod: vi.fn(),
  listInstalledGames: vi.fn(),
  scanGameMods: vi.fn(),
  scrapeNexusModInfo: vi.fn(),
  searchNexusMods: vi.fn(),
  setModProviderSecret: vi.fn(),
  startModInstall: vi.fn(),
  uninstallMod: vi.fn(),
}));

const supabaseModMocks = vi.hoisted(() => ({
  listModCatalogEntries: vi.fn(),
  listSharedModProviderGameMappings: vi.fn(),
  recordUserModInstall: vi.fn(),
  upsertSharedModProviderGameMapping: vi.fn(),
}));

const nativeSearchMocks = vi.hoisted(() => ({
  searchNativeMods: vi.fn(),
}));

vi.mock("../lib/launcher", () => launcherMocks);

vi.mock("../lib/supabase/mods", () => supabaseModMocks);

vi.mock("../lib/mod-provider-search", () => nativeSearchMocks);

function seedModsPageMocks() {
  launcherMocks.listInstalledGames.mockResolvedValue([
    {
      id: "game-1",
      platform: "windows",
      source: "steam",
      status: "installed",
      title: "Cyber Drift",
    },
  ]);
  launcherMocks.scanGameMods.mockResolvedValue([]);
  supabaseModMocks.listModCatalogEntries.mockResolvedValue([]);
  supabaseModMocks.listSharedModProviderGameMappings.mockResolvedValue([]);
  supabaseModMocks.recordUserModInstall.mockResolvedValue(null);
  supabaseModMocks.upsertSharedModProviderGameMapping.mockResolvedValue(null);
  nativeSearchMocks.searchNativeMods.mockResolvedValue([]);
}

function renderModsRoute(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<ModsPage />} path="/mods" />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ModsPage provider API key staging readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedModsPageMocks();
  });

  it("does not render provider API key staging readiness on the base route", async () => {
    renderModsRoute("/mods");

    expect(await screen.findByText("Installed Mods")).toBeInTheDocument();
    expect(
      screen.queryByRole("region", {
        name: /mod provider api key staging readiness/i,
      }),
    ).not.toBeInTheDocument();
    await waitFor(() => {
      expect(launcherMocks.scanGameMods).toHaveBeenCalledWith("game-1");
      expect(supabaseModMocks.listModCatalogEntries).toHaveBeenCalled();
      expect(supabaseModMocks.listSharedModProviderGameMappings).toHaveBeenCalled();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it("renders local readiness on the verify route without live provider calls", async () => {
    renderModsRoute("/mods?verify=provider-api-key-staging");

    expect(await screen.findByText("Native Provider Search")).toBeInTheDocument();

    const panel = await screen.findByRole("region", {
      name: /mod provider api key staging readiness/i,
    });

    expect(screen.getByText("Cyber Drift")).toBeInTheDocument();
    expect(screen.queryByText(/cannot read properties of undefined/i)).not.toBeInTheDocument();
    expect(within(panel).getByText("API Staging Readiness")).toBeInTheDocument();
    expect(within(panel).getByText("Provider Staging Probe")).toBeInTheDocument();
    expect(within(panel).getByText("Terms + Limits Policy")).toBeInTheDocument();
    expect(within(panel).getByText("One-result staging requests")).toBeInTheDocument();
    expect(within(panel).getByText("Provider Response Review")).toBeInTheDocument();
    expect(within(panel).getByText("mod.io Response Shape")).toBeInTheDocument();
    expect(within(panel).getByText("CurseForge Response Shape")).toBeInTheDocument();
    expect(within(panel).getByText(/api_key=<redacted>/i)).toBeInTheDocument();
    expect(within(panel).getByText("No real provider key configured")).toBeInTheDocument();
    expect(within(panel).getByText("No live mod.io/CurseForge API call")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /live api ready|hosted download ready|moderation ready|direct download ready|overwolf installed/i,
    );
    expect(panel).not.toHaveTextContent(/downloadUrl|edge\.forgecdn\.net|super-secret/i);
    await waitFor(() => {
      expect(supabaseModMocks.listModCatalogEntries).toHaveBeenCalled();
      expect(supabaseModMocks.listSharedModProviderGameMappings).toHaveBeenCalled();
      expect(launcherMocks.scanGameMods).toHaveBeenCalled();
    });
    expect(nativeSearchMocks.searchNativeMods).not.toHaveBeenCalled();
    expect(launcherMocks.setModProviderSecret).not.toHaveBeenCalled();
  });

  it("uses a browser-local verify fixture when native game listing is unavailable", async () => {
    launcherMocks.listInstalledGames.mockRejectedValueOnce(
      new Error("Cannot read properties of undefined (reading 'invoke')"),
    );

    renderModsRoute("/mods?verify=provider-api-key-staging");

    const panel = await screen.findByRole("region", {
      name: /mod provider api key staging readiness/i,
    });

    expect(screen.getByText("Mod API Staging Demo")).toBeInTheDocument();
    expect(screen.queryByText(/cannot read properties of undefined/i)).not.toBeInTheDocument();
    expect(within(panel).getByText("Terms + Limits Policy")).toBeInTheDocument();
    await waitFor(() => {
      expect(supabaseModMocks.listModCatalogEntries).toHaveBeenCalled();
      expect(supabaseModMocks.listSharedModProviderGameMappings).toHaveBeenCalled();
    });
    expect(await screen.findByText("No mods found in catalog")).toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(launcherMocks.scanGameMods).not.toHaveBeenCalled();
    expect(nativeSearchMocks.searchNativeMods).not.toHaveBeenCalled();
  });

  it("uses the Retro Manga halftone overlay for the provider keys modal", async () => {
    renderModsRoute("/mods?verify=provider-api-key-staging");

    const providerKeysButton = await screen.findByTitle("Provider Keys");
    fireEvent.click(providerKeysButton);

    const modal = await screen.findByText("Provider Keys");
    const backdrop = modal.closest(".fixed");

    expect(backdrop?.className).toContain("bg-[#171411]/90");
    expect(backdrop?.className).toContain("radial-gradient");
    expect(backdrop?.className).toContain("bg-[length:10px_10px]");
    expect(backdrop?.className).not.toContain("bg-black/50");
    expect(backdrop?.className).not.toContain("backdrop-blur");
  });
});
