import { useMemo, useRef } from "react";

import { GameDetails } from "./GameDetails";
import { useLibraryContext } from "../../context/useLibraryContext";
import { createVerifyCrossStoreSaveMigrationReadiness } from "../../lib/cross-store-save-migration-readiness";
import { createVerifyHostedCommunityArtworkReadiness } from "../../lib/hosted-community-artwork-readiness";
import { createVerifyHostedCommunityArtworkModerationConsole } from "../../lib/hosted-community-artwork-moderation-console";
import {
  buildCrossStoreSaveSyncPlan,
  createVerifyCrossStoreSaveSyncCandidates,
} from "../../lib/cross-store-save-sync-planner";
import { createVerifyIgdbCrossPlayReadinessPlan } from "../../lib/igdb-cross-play-readiness";

export function GameDetailPanel({ verifyMode }: { verifyMode?: string | null }) {
  const ctx = useLibraryContext();
  const detailScrollRef = useRef<HTMLElement>(null);

  const selectedGroup = ctx.filters.selectedGroup;
  const selectedGame = selectedGroup?.displayGame ?? null;
  const selectedVariants = selectedGroup?.variants ?? [];
  const selectedRuntime =
    selectedVariants.map((game) => ctx.sync.gameRuntimeById[game.id]).find(Boolean) ?? null;
  const isCrossStoreMigrationReadinessVerify = verifyMode === "cross-store-save-sync-e2e-readiness";
  const isCrossStoreSaveVerify = verifyMode === "cross-store-save-sync";
  const isHostedCommunityArtworkVerify = verifyMode === "hosted-community-artwork";
  const isIgdbCrossPlayVerify = verifyMode === "igdb-cross-play-readiness";
  const crossStoreSaveSyncPlan = useMemo(() => {
    if (isCrossStoreSaveVerify || isCrossStoreMigrationReadinessVerify) {
      return buildCrossStoreSaveSyncPlan(createVerifyCrossStoreSaveSyncCandidates());
    }

    const variants = selectedGroup?.variants ?? [];
    const hasRelevantLocalEvidence =
      variants.length > 1 || variants.some((game) => (game.saveFiles?.length ?? 0) > 0);

    return hasRelevantLocalEvidence ? buildCrossStoreSaveSyncPlan(variants) : undefined;
  }, [isCrossStoreMigrationReadinessVerify, isCrossStoreSaveVerify, selectedGroup]);
  const crossStoreSaveMigrationReadiness = useMemo(
    () =>
      isCrossStoreMigrationReadinessVerify
        ? createVerifyCrossStoreSaveMigrationReadiness()
        : undefined,
    [isCrossStoreMigrationReadinessVerify],
  );
  const igdbCrossPlayReadinessPlan = useMemo(
    () => (isIgdbCrossPlayVerify ? createVerifyIgdbCrossPlayReadinessPlan() : undefined),
    [isIgdbCrossPlayVerify],
  );
  const hostedCommunityArtworkReadiness = useMemo(
    () =>
      isHostedCommunityArtworkVerify ? createVerifyHostedCommunityArtworkReadiness() : undefined,
    [isHostedCommunityArtworkVerify],
  );
  const hostedCommunityArtworkModerationConsole = useMemo(
    () =>
      isHostedCommunityArtworkVerify
        ? createVerifyHostedCommunityArtworkModerationConsole(selectedGame)
        : undefined,
    [isHostedCommunityArtworkVerify, selectedGame],
  );
  return (
    <GameDetails
      selectedGame={selectedGame}
      enrichedSelectedGame={selectedGame}
      shouldShowLibraryLoading={ctx.sync.shouldShowLibraryLoading}
      handlePlay={ctx.picking.handlePlay}
      onInstallFromProvider={ctx.picking.handleInstallFromProvider}
      hasInstallableVariants={Boolean(
        selectedVariants.some(
          (g) => g.status === "not_installed" || g.status === "update_available",
        ),
      )}
      isGameRunning={Boolean(selectedVariants.some((game) => ctx.sync.runningGameIds.has(game.id)))}
      gameRuntime={selectedRuntime}
      gameVariants={selectedVariants}
      hostedCommunityArtworkReadiness={hostedCommunityArtworkReadiness}
      hostedCommunityArtworkModerationConsole={hostedCommunityArtworkModerationConsole}
      crossStoreSaveMigrationReadiness={crossStoreSaveMigrationReadiness}
      crossStoreSaveSyncPlan={crossStoreSaveSyncPlan}
      igdbCrossPlayReadinessPlan={igdbCrossPlayReadinessPlan}
      seedHostedArtworkUploadPending={isHostedCommunityArtworkVerify}
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
      detailScrollRef={detailScrollRef}
      isDiscoveringGames={ctx.sync.isDiscoveringGames}
      discoveryMessage={ctx.sync.discoveryMessage}
      runAutomaticLibrarySync={ctx.sync.runAutomaticLibrarySync}
      customArtwork={
        selectedVariants[0] ? (ctx.sync.customArtwork[selectedVariants[0].id] ?? null) : null
      }
      artworkGameId={selectedVariants[0]?.id}
      onSelectCustomArtwork={ctx.sync.handleSelectCustomArtwork}
      onArtworkDrop={ctx.sync.handleArtworkDrop}
      onApplyCustomArtworkUrl={ctx.sync.handleApplyCustomArtworkUrl}
      onConfirmArtwork={ctx.sync.handleConfirmArtwork}
      onResetCustomArtwork={ctx.sync.handleResetCustomArtwork}
      pendingArtworkFile={ctx.sync.pendingArtworkFile}
      pendingArtworkKind={ctx.sync.pendingArtworkKind}
      pendingArtworkGameId={ctx.sync.pendingArtworkGameId}
      openArtworkPreview={ctx.sync.openArtworkPreview}
      closeArtworkPreview={ctx.sync.closeArtworkPreview}
    />
  );
}
