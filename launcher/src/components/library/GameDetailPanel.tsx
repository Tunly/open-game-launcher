import { useCallback, useMemo, useRef, useState } from "react";

import { GameDetails } from "./GameDetails";
import { useLibraryContext } from "../../context/useLibraryContext";
import { useActivityLogger } from "../../hooks/useActivityLogger";
import { captureScreenshot, moveGame } from "../../lib/launcher";
import type { Game } from "../../lib/types";
import { createVerifyAiRecommendationHostedEvalContract } from "../../lib/ai-recommendation-hosted-eval-contract";
import { createVerifyAiRecommendationReadiness } from "../../lib/ai-recommendation-readiness";
import { buildBacklogRecommendationPlan } from "../../lib/backlog-recommendations";
import { createVerifyCrossStoreSaveMigrationReadiness } from "../../lib/cross-store-save-migration-readiness";
import { createVerifyHostedCommunityArtworkReadiness } from "../../lib/hosted-community-artwork-readiness";
import { createVerifyHostedCommunityArtworkModerationConsole } from "../../lib/hosted-community-artwork-moderation-console";
import { createVerifyRemotePlayEpicEosProviderContract } from "../../lib/remote-play-epic-eos-provider-contract";
import {
  buildCrossStoreSaveSyncPlan,
  createVerifyCrossStoreSaveSyncCandidates,
} from "../../lib/cross-store-save-sync-planner";
import { createVerifyIgdbCrossPlayReadinessPlan } from "../../lib/igdb-cross-play-readiness";
import {
  buildBacklogCandidatesFromGroups,
  createVerifyBacklogCandidates,
} from "../../lib/library-backlog-candidates";
import { isPlayableGame } from "../../lib/game-groups";

const REMOTE_PLAY_LOCAL_PROOF_GAME: Game = {
  categories: ["Remote Play", "Verification"],
  cloudGamingUrl: "https://play.og-launcher.example/remote/portal-2",
  description:
    "Deterministic Remote Play fixture for Steam AppID delegation, Epic/EOS URI review, HTTPS cloud handoff review, browser guard evidence, and unsafe URI rejection.",
  developer: "Valve",
  externalId: "620",
  features: ["Steam delegation", "Epic/EOS URI review", "HTTPS cloud endpoint", "Browser guard"],
  genres: ["Puzzle", "Co-op"],
  id: "remote-play-proof-portal-2",
  launcher: "steam",
  platform: "windows",
  playtimeMinutes: 1240,
  publisher: "Valve",
  releaseDate: "2011-04-19",
  sizeGb: 12,
  status: "installed",
  tagLabels: ["Remote Proof", "Local Only", "No Provider Session"],
  title: "Portal 2 Remote Proof",
  version: "1.0.0",
};

const REMOTE_PLAY_EPIC_EOS_PROVIDER_CONTRACT_GAME: Game = {
  categories: ["Remote Play", "Verification"],
  description:
    "Deterministic Epic/EOS Remote Play fixture for provider-state labels, invite envelope review, URI fallback, provider error mapping, and explicit no-streaming-proof guards.",
  developer: "Epic Games",
  externalId: "Fortnite",
  features: ["Epic/EOS provider states", "Invite envelope", "URI fallback", "Error map"],
  genres: ["Action", "Online"],
  id: "remote-play-epic-eos-provider-contract",
  launchUri: "com.epicgames.launcher://apps/Fortnite?action=launch",
  launcher: "epic",
  platform: "windows",
  playtimeMinutes: 910,
  publisher: "Epic Games",
  releaseDate: "2017-07-21",
  sizeGb: 42,
  status: "installed",
  tagLabels: ["Epic/EOS", "Provider Contract", "No Live Session"],
  title: "Epic EOS Remote Proof",
  version: "1.0.0",
};

const AI_RECOMMENDATION_HOSTED_EVAL_CONTRACT_GAME: Game = {
  categories: ["AI Recommendations", "Verification"],
  description:
    "Deterministic AI hosted-eval fixture for baseline ranking, prompt regression, safety cases, consent review, hosted runner boundaries, profile replay blockers, provider telemetry blockers, and rollout rollback gates.",
  developer: "OG Launcher Lab",
  externalId: "ai-hosted-eval-local",
  features: ["Local baseline", "Prompt regression", "Safety fixtures", "Rollback gate"],
  genres: ["Strategy", "Backlog"],
  id: "ai-recommendation-hosted-eval-contract",
  launcher: "manual",
  platform: "windows",
  playtimeMinutes: 420,
  publisher: "OG Launcher",
  releaseDate: "2026-06-16",
  sizeGb: 4,
  status: "installed",
  tagLabels: ["AI Eval", "Local Contract", "No Model Call"],
  title: "AI Eval Proof Deck",
  version: "1.0.0",
};

export function GameDetailPanel({ verifyMode }: { verifyMode?: string | null }) {
  const ctx = useLibraryContext();
  const detailScrollRef = useRef<HTMLElement>(null);
  const [launchingBacklogCandidateId, setLaunchingBacklogCandidateId] = useState<string | null>(
    null,
  );
  const { logScreenshot } = useActivityLogger();
  const libraryGroups = ctx.filters.libraryGroups;
  const { handlePlayVariant, setProviderPicker } = ctx.picking;
  const setLibraryStatusMessage = ctx.setStatusMessage;

  const selectedGroup = ctx.filters.selectedGroup;
  const isAiRecommendationHostedEvalContractVerify =
    verifyMode === "ai-recommendations-hosted-eval-contract";
  const isRemotePlayLocalProofVerify = verifyMode === "remote-play-local-proof";
  const isRemotePlayEpicEosProviderContractVerify =
    verifyMode === "remote-play-epic-eos-provider-contract";
  const selectedGame = isAiRecommendationHostedEvalContractVerify
    ? AI_RECOMMENDATION_HOSTED_EVAL_CONTRACT_GAME
    : isRemotePlayLocalProofVerify
      ? REMOTE_PLAY_LOCAL_PROOF_GAME
      : isRemotePlayEpicEosProviderContractVerify
        ? REMOTE_PLAY_EPIC_EOS_PROVIDER_CONTRACT_GAME
        : (selectedGroup?.displayGame ?? null);
  const selectedVariants = isAiRecommendationHostedEvalContractVerify
    ? [AI_RECOMMENDATION_HOSTED_EVAL_CONTRACT_GAME]
    : isRemotePlayLocalProofVerify
      ? [REMOTE_PLAY_LOCAL_PROOF_GAME]
      : isRemotePlayEpicEosProviderContractVerify
        ? [REMOTE_PLAY_EPIC_EOS_PROVIDER_CONTRACT_GAME]
        : (selectedGroup?.variants ?? []);
  const selectedRuntime =
    selectedVariants.map((game) => ctx.sync.gameRuntimeById[game.id]).find(Boolean) ?? null;
  const isBacklogVerify = verifyMode === "backlog-priority";
  const isAiRecommendationVerify = verifyMode === "ai-recommendations-readiness";
  const isCrossStoreMigrationReadinessVerify = verifyMode === "cross-store-save-sync-e2e-readiness";
  const isCrossStoreSaveVerify = verifyMode === "cross-store-save-sync";
  const isHostedCommunityArtworkVerify = verifyMode === "hosted-community-artwork";
  const isIgdbCrossPlayVerify = verifyMode === "igdb-cross-play-readiness";
  const backlogPriorityPlan = useMemo(
    () =>
      buildBacklogRecommendationPlan(
        isBacklogVerify || isAiRecommendationVerify
          ? createVerifyBacklogCandidates()
          : buildBacklogCandidatesFromGroups(libraryGroups),
      ),
    [isAiRecommendationVerify, isBacklogVerify, libraryGroups],
  );
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
  const aiRecommendationReadiness = useMemo(
    () => (isAiRecommendationVerify ? createVerifyAiRecommendationReadiness() : undefined),
    [isAiRecommendationVerify],
  );
  const aiRecommendationHostedEvalContract = useMemo(
    () =>
      isAiRecommendationHostedEvalContractVerify
        ? createVerifyAiRecommendationHostedEvalContract()
        : undefined,
    [isAiRecommendationHostedEvalContractVerify],
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
  const remotePlayEpicEosProviderContract = useMemo(
    () =>
      isRemotePlayEpicEosProviderContractVerify
        ? createVerifyRemotePlayEpicEosProviderContract()
        : undefined,
    [isRemotePlayEpicEosProviderContractVerify],
  );
  const shouldEnableBacklogLaunch = !verifyMode;
  const handleLaunchBacklogCandidate = useCallback(
    async (candidateId: string) => {
      const group = libraryGroups.find(
        (libraryGroup) =>
          libraryGroup.id === candidateId ||
          libraryGroup.primaryGame.id === candidateId ||
          libraryGroup.displayGame.id === candidateId ||
          libraryGroup.variants.some((game) => game.id === candidateId),
      );

      if (!group) {
        setLibraryStatusMessage("Play Next launch target is no longer in the local library.");
        return;
      }

      const playableVariants = group.variants.filter(isPlayableGame);

      if (playableVariants.length > 1) {
        setLibraryStatusMessage(null);
        setProviderPicker({
          mode: "play",
          title: group.title,
          variants: playableVariants,
        });
        return;
      }

      if (playableVariants.length === 0) {
        setLibraryStatusMessage(`${group.title} is not installed locally yet.`);
        return;
      }

      setLaunchingBacklogCandidateId(candidateId);
      try {
        await handlePlayVariant(playableVariants[0]);
      } finally {
        setLaunchingBacklogCandidateId(null);
      }
    },
    [handlePlayVariant, libraryGroups, setLibraryStatusMessage, setProviderPicker],
  );

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
        selectedVariants.some(
          (g) => g.status === "not_installed" || g.status === "update_available",
        ),
      )}
      isGameRunning={Boolean(selectedVariants.some((game) => ctx.sync.runningGameIds.has(game.id)))}
      gameRuntime={selectedRuntime}
      handleCaptureScreenshot={handleCaptureScreenshot}
      handleSyncAchievements={ctx.achievements.handleSyncAchievements}
      isSyncingAchievements={Boolean(
        ctx.achievements.syncingAchievementGameId &&
        selectedVariants.some((game) => game.id === ctx.achievements.syncingAchievementGameId),
      )}
      gameVariants={selectedVariants}
      backlogPriorityPlan={backlogPriorityPlan}
      backlogLaunchingCandidateId={shouldEnableBacklogLaunch ? launchingBacklogCandidateId : null}
      onLaunchBacklogCandidate={
        shouldEnableBacklogLaunch ? handleLaunchBacklogCandidate : undefined
      }
      aiRecommendationHostedEvalContract={aiRecommendationHostedEvalContract}
      aiRecommendationReadiness={aiRecommendationReadiness}
      hostedCommunityArtworkReadiness={hostedCommunityArtworkReadiness}
      hostedCommunityArtworkModerationConsole={hostedCommunityArtworkModerationConsole}
      crossStoreSaveMigrationReadiness={crossStoreSaveMigrationReadiness}
      crossStoreSaveSyncPlan={crossStoreSaveSyncPlan}
      igdbCrossPlayReadinessPlan={igdbCrossPlayReadinessPlan}
      remotePlayLocalProof={isRemotePlayLocalProofVerify}
      remotePlayEpicEosProviderContract={remotePlayEpicEosProviderContract}
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
      setActivePlatformFilter={ctx.filters.setActivePlatformFilter}
      clearCollectionSelection={() => {
        ctx.manual.clearManualCollectionSelection();
        ctx.dynamic.setSelectedCollectionName(null);
      }}
      detailScrollRef={detailScrollRef}
      isDiscoveringGames={ctx.sync.isDiscoveringGames}
      discoveryMessage={ctx.sync.discoveryMessage}
      moveGame={moveGame}
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
