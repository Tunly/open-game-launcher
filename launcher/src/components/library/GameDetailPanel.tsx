import { useRef } from "react";

import { GameDetails } from "./GameDetails";
import { useLibraryContext } from "../../context/useLibraryContext";
import { useActivityLogger } from "../../hooks/useActivityLogger";
import { captureScreenshot } from "../../lib/launcher";

export function GameDetailPanel() {
  const ctx = useLibraryContext();
  const detailScrollRef = useRef<HTMLElement>(null);
  const { logScreenshot } = useActivityLogger();

  const selectedGroup = ctx.filters.selectedGroup;
  const selectedGame = selectedGroup?.displayGame ?? null;

  async function handleCaptureScreenshot() {
    const target = selectedGame;
    if (!target) return;
    try {
      const dataUrl = await captureScreenshot();
      void logScreenshot(target.id, target.title, dataUrl);
      ctx.setStatusMessage("Screenshot captured and posted to your activity feed.");
    } catch (err) {
      ctx.setStatusMessage(
        `Screenshot failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return (
    <GameDetails
      selectedGame={selectedGame}
      enrichedSelectedGame={selectedGame}
      shouldShowLibraryLoading={ctx.sync.shouldShowLibraryLoading}
      handlePlay={ctx.picking.handlePlay}
      onInstallFromProvider={ctx.picking.handleInstallFromProvider}
      hasInstallableVariants={Boolean(
        selectedGroup?.variants.some(
          (g) => g.status === "not_installed" || g.status === "update_available",
        ),
      )}
      handleCaptureScreenshot={handleCaptureScreenshot}
      handleSyncAchievements={ctx.achievements.handleSyncAchievements}
      isSyncingAchievements={Boolean(
        ctx.achievements.syncingAchievementGameId &&
        selectedGroup?.variants.some(
          (game) => game.id === ctx.achievements.syncingAchievementGameId,
        ),
      )}
      gameVariants={selectedGroup?.variants ?? []}
      logoCandidateIndexes={ctx.sync.logoCandidateIndexes}
      loadedLogoUrls={ctx.sync.loadedLogoUrls}
      handleLogoLoad={ctx.sync.handleLogoLoad}
      handleLogoError={ctx.sync.handleLogoError}
      statusMessage={ctx.statusMessage}
      setStatusMessage={ctx.setStatusMessage}
      favorites={ctx.manual.favorites}
      setFavorites={ctx.manual.setFavorites}
      hiddenGames={ctx.manual.hiddenGames}
      setHiddenGames={ctx.manual.setHiddenGames}
      customCategories={ctx.manual.customCategories}
      setCustomCategories={ctx.manual.setCustomCategories}
      manualCollections={ctx.manual.manualCollections}
      setManualCollections={ctx.manual.setManualCollections}
      setActivePlatformFilter={ctx.filters.setActivePlatformFilter}
      clearCollectionSelection={() => {
        ctx.manual.clearManualCollectionSelection();
        ctx.dynamic.setSelectedCollectionName(null);
      }}
      detailScrollRef={detailScrollRef}
      isDiscoveringGames={ctx.sync.isDiscoveringGames}
      discoveryMessage={ctx.sync.discoveryMessage}
      moveGame={async () => {
        throw new Error("moveGame is not implemented in the refactored library page.");
      }}
      runAutomaticLibrarySync={ctx.sync.runAutomaticLibrarySync}
      customArtwork={
        selectedGroup?.primaryGame
          ? (ctx.sync.customArtwork[selectedGroup.primaryGame.id] ?? null)
          : null
      }
      artworkGameId={selectedGroup?.primaryGame?.id}
      onSelectCustomArtwork={ctx.sync.handleSelectCustomArtwork}
      onResetCustomArtwork={ctx.sync.handleResetCustomArtwork}
    />
  );
}
