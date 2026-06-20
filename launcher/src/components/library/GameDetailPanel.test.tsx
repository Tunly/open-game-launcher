import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { LibraryContext, type LibraryContextValue } from "../../context/LibraryContext";
import { aggregateGameGroup, type GameGroup } from "../../lib/game-groups";
import type { Game } from "../../lib/types";
import { GameDetailPanel } from "./GameDetailPanel";

vi.mock("../../hooks/useActivityLogger", () => ({
  useActivityLogger: () => ({ logScreenshot: vi.fn() }),
}));

vi.mock("../../lib/launcher", () => ({
  captureScreenshot: vi.fn(),
  moveGame: vi.fn(),
}));

vi.mock("./GameDetails", () => ({
  GameDetails: (props: {
    aiRecommendationHostedEvalContract?: { statusLabel: string };
    aiRecommendationReadiness?: { statusLabel: string };
    backlogPriorityPlan?: { recommendations: Array<{ id: string; title: string }> };
    crossStoreSaveMigrationReadiness?: {
      keychainRestoreEvidence?: { guards: string[]; label: string } | null;
      statusLabel: string;
    };
    crossStoreSaveSyncPlan?: { label: string };
    enrichedSelectedGame?: { externalId?: string; title?: string } | null;
    hostedCommunityArtworkModerationConsole?: { modeLabel: string };
    hostedCommunityArtworkReadiness?: { statusLabel: string };
    igdbCrossPlayReadinessPlan?: { statusLabel: string };
    remotePlayEpicEosProviderContract?: { statusLabel: string };
    remotePlayLocalProof?: boolean;
    selectedGame?: { externalId?: string; title?: string } | null;
    seedHostedArtworkUploadPending?: boolean;
    onLaunchBacklogCandidate?: (candidateId: string) => void;
  }) => (
    <section aria-label="game details mock">
      {props.aiRecommendationReadiness ? (
        <p>AI readiness: {props.aiRecommendationReadiness.statusLabel}</p>
      ) : null}
      {props.aiRecommendationHostedEvalContract ? (
        <p>AI hosted eval: {props.aiRecommendationHostedEvalContract.statusLabel}</p>
      ) : null}
      {props.crossStoreSaveMigrationReadiness ? (
        <>
          <p>Cross-store E2E: {props.crossStoreSaveMigrationReadiness.statusLabel}</p>
          {props.crossStoreSaveMigrationReadiness.keychainRestoreEvidence ? (
            <>
              <p>{props.crossStoreSaveMigrationReadiness.keychainRestoreEvidence.label}</p>
              {props.crossStoreSaveMigrationReadiness.keychainRestoreEvidence.guards.map(
                (guard) => (
                  <p key={guard}>{guard}</p>
                ),
              )}
            </>
          ) : null}
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
      {props.remotePlayLocalProof ? (
        <p>
          Remote Play proof: {props.selectedGame?.title} / AppID{" "}
          {props.enrichedSelectedGame?.externalId}
        </p>
      ) : null}
      {props.remotePlayEpicEosProviderContract ? (
        <p>
          Epic/EOS provider contract: {props.remotePlayEpicEosProviderContract.statusLabel} /{" "}
          {props.selectedGame?.title}
        </p>
      ) : null}
      {props.seedHostedArtworkUploadPending ? <p>Seed hosted pending upload</p> : null}
      {props.backlogPriorityPlan?.recommendations.map((recommendation) => (
        <div key={recommendation.id}>
          <p>{recommendation.title}</p>
          {props.onLaunchBacklogCandidate ? (
            <button
              type="button"
              onClick={() => props.onLaunchBacklogCandidate?.(recommendation.id)}
            >
              Launch backlog {recommendation.title}
            </button>
          ) : null}
        </div>
      ))}
    </section>
  ),
}));

describe("GameDetailPanel backlog launch handoff", () => {
  it("resolves a normal library backlog candidate to the only playable variant", async () => {
    const playable = createGame({
      id: "steam-ready-variant",
      launcher: "steam",
      status: "installed",
      title: "Single Variant Proof",
    });
    const installable = createGame({
      downloadUrl: "https://downloads.example/single-variant-proof",
      id: "epic-owned-variant",
      launcher: "epic",
      status: "not_installed",
      title: "Single Variant Proof",
    });
    const group = aggregateGameGroup([installable, playable]);
    const handlePlayVariant = vi.fn().mockResolvedValue(undefined);
    const setProviderPicker = vi.fn();

    renderWithLibrary(<GameDetailPanel />, {
      libraryGroups: [group],
      picking: { handlePlayVariant, setProviderPicker },
      selectedGroup: group,
    });

    fireEvent.click(screen.getByRole("button", { name: /launch backlog single variant proof/i }));

    await waitFor(() => expect(handlePlayVariant).toHaveBeenCalledWith(playable));
    expect(setProviderPicker).not.toHaveBeenCalled();
  });

  it("opens the play provider picker when a backlog candidate has multiple playable variants", async () => {
    const steamVariant = createGame({
      id: "steam-ready-variant",
      launcher: "steam",
      status: "installed",
      title: "Multi Variant Proof",
    });
    const gogVariant = createGame({
      id: "gog-ready-variant",
      launcher: "gog",
      status: "update_available",
      title: "Multi Variant Proof",
    });
    const group = aggregateGameGroup([gogVariant, steamVariant]);
    const handlePlayVariant = vi.fn().mockResolvedValue(undefined);
    const setProviderPicker = vi.fn();

    renderWithLibrary(<GameDetailPanel />, {
      libraryGroups: [group],
      picking: { handlePlayVariant, setProviderPicker },
      selectedGroup: group,
    });

    fireEvent.click(screen.getByRole("button", { name: /launch backlog multi variant proof/i }));

    await waitFor(() =>
      expect(setProviderPicker).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "play",
          title: group.title,
          variants: expect.arrayContaining([steamVariant, gogVariant]),
        }),
      ),
    );
    expect(setProviderPicker.mock.calls[0][0].variants).toHaveLength(2);
    expect(handlePlayVariant).not.toHaveBeenCalled();
  });

  it("does not provide backlog launch handoff controls in backlog-priority verification mode", () => {
    const playable = createGame({
      id: "steam-ready-variant",
      launcher: "steam",
      status: "installed",
      title: "Single Variant Proof",
    });
    const group = aggregateGameGroup([playable]);
    const handlePlayVariant = vi.fn().mockResolvedValue(undefined);
    const setProviderPicker = vi.fn();

    renderWithLibrary(<GameDetailPanel verifyMode="backlog-priority" />, {
      libraryGroups: [group],
      picking: { handlePlayVariant, setProviderPicker },
      selectedGroup: group,
    });

    expect(screen.getByText("Mech Arcade")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /launch backlog mech arcade/i }),
    ).not.toBeInTheDocument();
    expect(handlePlayVariant).not.toHaveBeenCalled();
    expect(setProviderPicker).not.toHaveBeenCalled();
  });
});

describe("GameDetailPanel verification modes", () => {
  it("does not expose AI readiness on the base detail route", () => {
    renderWithLibrary(<GameDetailPanel />);

    expect(screen.getByRole("region", { name: /game details mock/i })).toBeVisible();
    expect(screen.queryByText(/AI readiness/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Cross-store E2E/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/IGDB readiness/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Hosted artwork/i)).not.toBeInTheDocument();
  });

  it("passes AI recommendation readiness for the AI verification route", () => {
    renderWithLibrary(<GameDetailPanel verifyMode="ai-recommendations-readiness" />);

    expect(screen.getByText("AI readiness: Local only")).toBeInTheDocument();
    expect(screen.getByText("Mech Arcade")).toBeInTheDocument();
    expect(screen.getByText("Queue Fighter")).toBeInTheDocument();
    expect(screen.getByText("Missing Build")).toBeInTheDocument();
  });

  it("passes AI hosted eval contract for the hosted eval verification route", () => {
    renderWithLibrary(<GameDetailPanel verifyMode="ai-recommendations-hosted-eval-contract" />);

    expect(screen.getByText("AI hosted eval: Local eval contract")).toBeInTheDocument();
    expect(screen.queryByText(/AI readiness/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Hosted artwork/i)).not.toBeInTheDocument();
  });

  it("keeps backlog-priority verification on deterministic local candidates", () => {
    renderWithLibrary(<GameDetailPanel verifyMode="backlog-priority" />);

    expect(screen.getByText("Mech Arcade")).toBeInTheDocument();
    expect(screen.getByText("Queue Fighter")).toBeInTheDocument();
    expect(screen.getByText("Missing Build")).toBeInTheDocument();
    expect(screen.queryByText(/AI readiness/i)).not.toBeInTheDocument();
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
    expect(screen.getByText("Keychain Restore Contract")).toBeInTheDocument();
    expect(screen.getByText("No live keychain restore run")).toBeInTheDocument();
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
    expect(screen.getByText("Seed hosted pending upload")).toBeInTheDocument();
    expect(screen.queryByText(/AI readiness/i)).not.toBeInTheDocument();
  });

  it("passes the Remote Play local proof fixture for the verification route", () => {
    renderWithLibrary(<GameDetailPanel verifyMode="remote-play-local-proof" />);

    expect(
      screen.getByText("Remote Play proof: Portal 2 Remote Proof / AppID 620"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/AI readiness/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Hosted artwork/i)).not.toBeInTheDocument();
  });

  it("passes the Epic/EOS Remote Play provider contract for the verification route", () => {
    renderWithLibrary(<GameDetailPanel verifyMode="remote-play-epic-eos-provider-contract" />);

    expect(
      screen.getByText(
        "Epic/EOS provider contract: Provider Proof Required / Epic EOS Remote Proof",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/AI readiness/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Hosted artwork/i)).not.toBeInTheDocument();
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
      handleSyncAchievements: noop,
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

function createGame(patch: Partial<Game>): Game {
  return {
    description: "Backlog launch handoff fixture",
    developer: "OG Launcher Test",
    id: "game-fixture",
    platform: "windows",
    playtimeMinutes: 60,
    publisher: "OG Launcher",
    releaseDate: "2024-01-01",
    sizeGb: 12,
    status: "installed",
    title: "Launch Handoff Fixture",
    version: "1.0.0",
    ...patch,
  };
}
