import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useSearchParams } from "react-router-dom";

import {
  installXboxGame,
  launchGame,
  launchXboxGame,
  launchCrossPlayJoin,
  startDownload,
} from "../../lib/launcher";
import { syncGamePlaytimeStats } from "../../lib/supabase/playtime";
import { isInstallableGame, isPlayableGame, type GameGroup } from "../../lib/game-groups";
import { getErrorMessage } from "../../lib/formatters";
import { useActivityLogger } from "../useActivityLogger";
import type { Game } from "../../lib/types";

type ProviderPickerState = {
  mode: "play" | "install";
  title: string;
  variants: Game[];
} | null;

function trackPlaySessionStart(game: Game) {
  return syncGamePlaytimeStats({
    game,
    playtimeMinutes: game.playtimeMinutes,
    lastPlayedAt: new Date().toISOString(),
    countSessionStart: true,
  }).catch((error) => {
    console.warn("Failed to sync play session start:", error);
  });
}

export interface UseProviderPickingOptions {
  selectedGroup: GameGroup | null;
  setStatusMessage: Dispatch<SetStateAction<string | null>>;
  maybeAutoSyncOnLaunch: () => Promise<void>;
}

export interface UseProviderPickingResult {
  providerPicker: ProviderPickerState;
  setProviderPicker: Dispatch<SetStateAction<ProviderPickerState>>;
  handlePlay: () => Promise<void>;
  handlePlayVariant: (game: Game) => Promise<void>;
  handleInstallFromProvider: () => Promise<void>;
}

export function useProviderPicking({
  selectedGroup,
  setStatusMessage,
  maybeAutoSyncOnLaunch,
}: UseProviderPickingOptions): UseProviderPickingResult {
  const [providerPicker, setProviderPicker] = useState<ProviderPickerState>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const { logGameStart } = useActivityLogger();

  useEffect(() => {
    const joinGame = searchParams.get("join");
    const platform = searchParams.get("platform");
    if (joinGame && platform) {
      void launchCrossPlayJoin(platform, joinGame)
        .then(() => {
          setStatusMessage(`Joining game on ${platform}...`);
          setSearchParams({}, { replace: true });
        })
        .catch((err: unknown) => {
          setStatusMessage(err instanceof Error ? err.message : String(err));
          setSearchParams({}, { replace: true });
        });
    }
  }, [searchParams, setSearchParams, setStatusMessage]);

  const handlePlayVariant = async (game: Game) => {
    setStatusMessage(null);

    try {
      if (game.id.startsWith("xbox-owned-")) {
        const pfn = game.id.replace("xbox-owned-", "");
        await installXboxGame(pfn);
        setStatusMessage("Opened Microsoft Store for installation.");
        return;
      }

      if (game.id.startsWith("xbox-")) {
        const pfn = game.id.replace("xbox-", "");
        await launchXboxGame(pfn);
        setStatusMessage("Launching Xbox game...");
        void logGameStart(game.id, game.title, { launcher: "xbox" });
        void trackPlaySessionStart(game);
        return;
      }

      if (
        game.status !== "installed" &&
        (game.id.startsWith("steam-owned-") ||
          game.id.startsWith("gog-owned-") ||
          game.id.startsWith("epic-owned-") ||
          game.id.startsWith("ea-owned-") ||
          game.id.startsWith("ubisoft-owned-") ||
          game.id.startsWith("battlenet-owned-"))
      ) {
        const response = await startDownload(
          game.id,
          game.title,
          game.downloadUrl,
          game.downloadSha256,
        );
        setStatusMessage(response.message);
        return;
      }

      if (
        game.id.startsWith("steam-owned-") ||
        game.id.startsWith("gog-owned-") ||
        game.id.startsWith("epic-owned-")
      ) {
        const response = await launchGame(game.id);
        setStatusMessage(response.message);
        void logGameStart(game.id, game.title, { launcher: game.launcher });
        void trackPlaySessionStart(game);
        void maybeAutoSyncOnLaunch();
        return;
      }

      if (game.status === "installed") {
        const response = await launchGame(game.id);
        setStatusMessage(response.message);
        void logGameStart(game.id, game.title, { launcher: game.launcher });
        void trackPlaySessionStart(game);
        void maybeAutoSyncOnLaunch();
        return;
      }

      const response = await startDownload(
        game.id,
        game.title,
        game.downloadUrl,
        game.downloadSha256,
      );
      setStatusMessage(response.message);
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    }
  };

  const handlePlay = async () => {
    if (!selectedGroup) {
      return;
    }

    const playableVariants = selectedGroup.variants.filter(isPlayableGame);
    if (playableVariants.length > 1) {
      setProviderPicker({
        mode: "play",
        title: selectedGroup.title,
        variants: playableVariants,
      });
      return;
    }

    if (playableVariants.length === 1) {
      await handlePlayVariant(playableVariants[0]);
      return;
    }

    const installableVariants = selectedGroup.variants.filter(isInstallableGame);
    if (installableVariants.length > 1) {
      setProviderPicker({
        mode: "install",
        title: selectedGroup.title,
        variants: installableVariants,
      });
      return;
    }

    if (installableVariants.length === 1) {
      await handlePlayVariant(installableVariants[0]);
    }
  };

  const handleInstallFromProvider = async () => {
    if (!selectedGroup) {
      return;
    }

    const installableVariants = selectedGroup.variants.filter(isInstallableGame);
    if (installableVariants.length > 1) {
      setProviderPicker({
        mode: "install",
        title: selectedGroup.title,
        variants: installableVariants,
      });
      return;
    }

    if (installableVariants.length === 1) {
      await handlePlayVariant(installableVariants[0]);
    }
  };

  return {
    providerPicker,
    setProviderPicker,
    handlePlay,
    handlePlayVariant,
    handleInstallFromProvider,
  };
}
