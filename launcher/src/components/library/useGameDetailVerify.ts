import { useMemo } from "react";

import type { GameGroup } from "../../lib/game-groups";
import type { Game } from "../../lib/types";
import {
  createVerifyCrossStoreSaveMigrationReadiness,
  type CrossStoreSaveMigrationReadiness,
} from "../../lib/cross-store-save-migration-readiness";
import {
  buildCrossStoreSaveSyncPlan,
  createVerifyCrossStoreSaveSyncCandidates,
  type CrossStoreSaveSyncPlan,
} from "../../lib/cross-store-save-sync-planner";
import {
  createVerifyHostedCommunityArtworkReadiness,
  type HostedCommunityArtworkReadiness,
} from "../../lib/hosted-community-artwork-readiness";
import {
  createVerifyHostedCommunityArtworkModerationConsole,
  type HostedCommunityArtworkModerationConsole,
} from "../../lib/hosted-community-artwork-moderation-console";
import {
  createVerifyIgdbCrossPlayReadinessPlan,
  type IgdbCrossPlayReadinessPlan,
} from "../../lib/igdb-cross-play-readiness";

export interface GameDetailVerifyData {
  crossStoreSaveMigrationReadiness: CrossStoreSaveMigrationReadiness | undefined;
  crossStoreSaveSyncPlan: CrossStoreSaveSyncPlan | undefined;
  hostedCommunityArtworkModerationConsole: HostedCommunityArtworkModerationConsole | undefined;
  hostedCommunityArtworkReadiness: HostedCommunityArtworkReadiness | undefined;
  igdbCrossPlayReadinessPlan: IgdbCrossPlayReadinessPlan | undefined;
}

export function useGameDetailVerify(
  verifyMode: string | null | undefined,
  selectedGroup: GameGroup | null | undefined,
  selectedGame: Game | null,
): GameDetailVerifyData {
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

  return {
    crossStoreSaveMigrationReadiness,
    crossStoreSaveSyncPlan,
    hostedCommunityArtworkModerationConsole,
    hostedCommunityArtworkReadiness,
    igdbCrossPlayReadinessPlan,
  };
}
