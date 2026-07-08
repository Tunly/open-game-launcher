import { render, screen } from "@testing-library/react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { Game } from "../../lib/types";
import { GameDetails } from "./GameDetails";

vi.mock("../../lib/supabase/crossplay", () => ({
  getCrossPlayPlatforms: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../lib/supabase/community-artwork", () => ({
  listHostedCommunityArtworkCandidates: vi.fn().mockResolvedValue({
    ok: true,
    value: [],
  }),
  reportHostedCommunityArtwork: vi.fn(),
  setHostedCommunityArtworkVote: vi.fn(),
  uploadCommunityArtworkForGame: vi.fn(),
}));

describe("GameDetails actions", () => {
  it("does not render screenshot or platform cloud save panels", async () => {
    renderGameDetails();

    expect(screen.getByRole("button", { name: "Game Settings" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Capture screenshot" })).not.toBeInTheDocument();
    expect(screen.queryByText("Screenshots")).not.toBeInTheDocument();
    expect(screen.queryByText(/captures/i)).not.toBeInTheDocument();
    await expect(
      screen.findByRole("region", { name: /platform cloud saves/i }, { timeout: 250 }),
    ).rejects.toThrow();
  });

  it("describes achievement auto-sync instead of a missing trophy control", () => {
    renderGameDetails();

    expect(screen.getByText(/achievement auto-sync runs/i)).toBeInTheDocument();
    expect(screen.queryByText(/trophy button/i)).not.toBeInTheDocument();
  });

  it("does not render the red achievement progress bar", () => {
    const { container } = renderGameDetails({
      achievements: [
        {
          id: "first-clear",
          name: "First Clear",
          description: "Finish the opening route.",
          unlockedAt: "2026-07-01T10:00:00.000Z",
        },
        {
          id: "secret-route",
          name: "Secret Route",
          description: "Find the hidden route.",
        },
      ],
    });

    expect(screen.getByText("1/2 · 50%")).toBeInTheDocument();
    expect(
      Array.from(container.querySelectorAll("div")).some((element) =>
        element.className.includes("bg-[#c20b2f]"),
      ),
    ).toBe(false);
  });
});

const selectedGame: Game = {
  id: "local-test-game",
  title: "Local Test Game",
  description: "Local game without a source client.",
  version: "1.0.0",
  status: "installed",
  platform: "windows",
  installPath: "C:\\Games\\Local Test Game",
  executablePath: "C:\\Games\\Local Test Game\\game.exe",
};

function renderGameDetails(gameOverrides: Partial<Game> = {}) {
  const noop = vi.fn();
  const game = { ...selectedGame, ...gameOverrides };

  return render(
    <MemoryRouter>
      <GameDetails
        selectedGame={game}
        enrichedSelectedGame={game}
        shouldShowLibraryLoading={false}
        handlePlay={noop}
        logoCandidateIndexes={{}}
        loadedLogoUrls={new Set<string>()}
        handleLogoLoad={noop}
        handleLogoError={noop}
        statusMessage={null}
        setStatusMessage={noop}
        favorites={{}}
        setFavorites={stateSetter<Record<string, boolean>>()}
        hiddenGames={{}}
        setHiddenGames={stateSetter<Record<string, boolean>>()}
        customCategories={{}}
        setCustomCategories={stateSetter<Record<string, string[]>>()}
        manualCollections={{}}
        setManualCollections={stateSetter<Record<string, string[]>>()}
        setActivePlatformFilter={noop}
        clearCollectionSelection={noop}
        detailScrollRef={{ current: null } as RefObject<HTMLElement | null>}
        isDiscoveringGames={false}
        discoveryMessage={null}
        moveGame={vi.fn().mockResolvedValue(undefined)}
        runAutomaticLibrarySync={vi.fn().mockResolvedValue(undefined)}
        customArtwork={null}
        onSelectCustomArtwork={noop}
        onArtworkDrop={noop}
        onApplyCustomArtworkUrl={noop}
        onConfirmArtwork={noop}
        onResetCustomArtwork={noop}
        pendingArtworkFile={null}
        pendingArtworkKind="cover"
        pendingArtworkGameId={null}
        openArtworkPreview={noop}
        closeArtworkPreview={noop}
      />
    </MemoryRouter>,
  );
}

function stateSetter<T>(): Dispatch<SetStateAction<T>> {
  return vi.fn() as unknown as Dispatch<SetStateAction<T>>;
}
