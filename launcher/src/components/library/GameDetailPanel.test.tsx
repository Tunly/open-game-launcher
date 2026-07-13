import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { LibraryContext, type LibraryContextValue } from "../../context/LibraryContext";
import { type GameGroup } from "../../lib/game-groups";
import { GameDetailPanel } from "./GameDetailPanel";

vi.mock("../../lib/launcher", () => ({
  moveGame: vi.fn(),
}));

vi.mock("./GameDetails", () => ({
  GameDetails: (props: {
    crossStoreSaveMigrationReadiness?: {
      guards: string[];
      statusLabel: string;
    };
    crossStoreSaveSyncPlan?: { label: string };
    enrichedSelectedGame?: { externalId?: string; title?: string } | null;
    hostedCommunityArtworkModerationConsole?: { modeLabel: string };
    hostedCommunityArtworkReadiness?: { statusLabel: string };
    igdbCrossPlayReadinessPlan?: { statusLabel: string };
    selectedGame?: { externalId?: string; title?: string } | null;
  }) => (
    <section aria-label="game details mock">
      {props.crossStoreSaveMigrationReadiness ? (
        <>
          <p>Cross-store E2E: {props.crossStoreSaveMigrationReadiness.statusLabel}</p>
          {props.crossStoreSaveMigrationReadiness.guards.map((guard) => (
            <p key={guard}>{guard}</p>
          ))}
        </>
      ) : null}
      {props.crossStoreSaveSyncPlan ? (
        <p>Cross-store planner: {props.crossStoreSaveSyncPlan.label}</p>
      ) : null}
      {props.igdbCrossPlayReadinessPlan ? (
        <p>IGDB readiness: {props.igdbCrossPlayReadinessPlan.statusLabel}</p>
      ) : null}
      {props.hostedCommunityArtworkReadiness ? (
        <p>Hosted artwork: {props.hostedCommunityArtworkReadiness.statusLabel}</p>
      ) : null}
      {props.hostedCommunityArtworkModerationConsole ? (
        <p>Hosted moderation: {props.hostedCommunityArtworkModerationConsole.modeLabel}</p>
      ) : null}
    </section>
  ),
}));

describe("GameDetailPanel verification modes", () => {
  it("does not expose verification panels on the base detail route", () => {
    renderWithLibrary(<GameDetailPanel />);

    expect(screen.getByRole("region", { name: /game details mock/i })).toBeVisible();
    expect(screen.queryByText(/Cross-store E2E/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/IGDB readiness/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Hosted artwork/i)).not.toBeInTheDocument();
  });

  it("keeps cross-store save sync verification on the local planner", () => {
    renderWithLibrary(<GameDetailPanel verifyMode="cross-store-save-sync" />);

    expect(screen.getByText("Cross-store planner: Review Plan Only")).toBeInTheDocument();
    expect(screen.queryByText(/Cross-store E2E/i)).not.toBeInTheDocument();
  });

  it("passes cross-store save sync E2E readiness for the E2E verification route", () => {
    renderWithLibrary(<GameDetailPanel verifyMode="cross-store-save-sync-e2e-readiness" />);

    expect(screen.getByText("Cross-store E2E: Local only")).toBeInTheDocument();
    expect(screen.getByText("Cross-store planner: Review Plan Only")).toBeInTheDocument();
    expect(
      screen.getByText("Rollback restore requires explicit desktop consent"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Keychain Restore Contract")).not.toBeInTheDocument();
  });

  it("passes IGDB cross-play readiness for the IGDB verification route", () => {
    renderWithLibrary(<GameDetailPanel verifyMode="igdb-cross-play-readiness" />);

    expect(screen.getByText("IGDB readiness: Local only")).toBeInTheDocument();
    expect(screen.queryByText(/Cross-store E2E/i)).not.toBeInTheDocument();
  });

  it("passes hosted community artwork readiness for the artwork verification route", () => {
    renderWithLibrary(<GameDetailPanel verifyMode="hosted-community-artwork" />);

    expect(screen.getByText("Hosted artwork: Hosted v1 staged")).toBeInTheDocument();
    expect(screen.getByText("Hosted moderation: Local Review Preview")).toBeInTheDocument();
  });
});

interface LibraryRenderOptions {
  libraryGroups?: GameGroup[];
  picking?: Partial<LibraryContextValue["picking"]>;
  selectedGroup?: GameGroup | null;
}

function renderWithLibrary(node: ReactNode, options: LibraryRenderOptions = {}) {
  const context = createLibraryContext(options);

  return render(<LibraryContext.Provider value={context}>{node}</LibraryContext.Provider>);
}

function createLibraryContext(options: LibraryRenderOptions = {}): LibraryContextValue {
  const noop = vi.fn();

  return {
    achievements: {
      syncingAchievementGameId: null,
    },
    dynamic: {
      setSelectedCollectionName: noop,
    },
    filters: {
      libraryGroups: options.libraryGroups ?? [],
      selectedGroup: options.selectedGroup ?? null,
      setActivePlatformFilter: noop,
    },
    manual: {
      clearManualCollectionSelection: noop,
      customCategories: {},
      favorites: {},
      hiddenGames: {},
      manualCollections: {},
      setCustomCategories: noop,
      setFavorites: noop,
      setHiddenGames: noop,
      setManualCollections: noop,
    },
    picking: {
      handleInstallFromProvider: noop,
      handlePlay: noop,
      handlePlayVariant: noop,
      providerPicker: null,
      setProviderPicker: noop,
      ...options.picking,
    },
    setStatusMessage: noop,
    statusMessage: null,
    sync: {
      closeArtworkPreview: noop,
      customArtwork: {},
      discoveryMessage: null,
      gameRuntimeById: {},
      handleApplyCustomArtworkUrl: noop,
      handleArtworkDrop: noop,
      handleConfirmArtwork: noop,
      handleLogoError: noop,
      handleLogoLoad: noop,
      handleResetCustomArtwork: noop,
      handleSelectCustomArtwork: noop,
      installedGames: [],
      isDiscoveringGames: false,
      loadedLogoUrls: new Set<string>(),
      logoCandidateIndexes: {},
      openArtworkPreview: noop,
      pendingArtworkFile: null,
      pendingArtworkGameId: null,
      pendingArtworkKind: "cover",
      runAutomaticLibrarySync: vi.fn().mockResolvedValue(undefined),
      runningGameIds: new Set<string>(),
      shouldShowLibraryLoading: false,
    },
  } as unknown as LibraryContextValue;
}
