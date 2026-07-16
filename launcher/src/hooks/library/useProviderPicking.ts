import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { isTauri } from "@tauri-apps/api/core";

import { launchGame, launchXboxGame, startDownload } from "../../lib/launcher";
import { syncGamePlaytimeStats } from "../../lib/supabase/playtime";
import { writeActivePerformanceGameContext } from "../../lib/performance-context";
import { isInstallableGame, isPlayableGame, type GameGroup } from "../../lib/game-groups";
import { getErrorMessage } from "../../lib/formatters";
import { useActivityLogger } from "../useActivityLogger";
import type { Game } from "../../lib/types";

type ProviderPickerState = {
  mode: "play" | "install";
  title: string;
  variants: Game[];
} | null;

type ProviderPickerMode = NonNullable<ProviderPickerState>["mode"];

function isInstallOrUpdateCandidate(game: Game) {
  return isInstallableGame(game) || game.status === "update_available";
}

function desktopActionMessage(mode: ProviderPickerMode) {
  return mode === "play"
    ? "Launching games is available only in the OG-Launcher desktop app."
    : "Installing and updating games is available only in the OG-Launcher desktop app.";
}

const XBOX_PACKAGE_FAMILY_NAME_PATTERN = /^[a-z0-9][a-z0-9.-]*_[a-z0-9]{13}$/i;

function getXboxPackageFamilyName(gameId: string) {
  let packageFamilyName: string | null = null;
  if (gameId.startsWith("xbox-owned-")) {
    packageFamilyName = gameId.slice("xbox-owned-".length);
  } else if (gameId.startsWith("xbox-")) {
    packageFamilyName = gameId.slice("xbox-".length);
  }

  return packageFamilyName && XBOX_PACKAGE_FAMILY_NAME_PATTERN.test(packageFamilyName)
    ? packageFamilyName
    : null;
}

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

function trackActivePerformanceGame(game: Game) {
  writeActivePerformanceGameContext({
    gameId: game.id,
    gameTitle: game.title,
    launcher: game.launcher ?? null,
  });
}

export interface UseProviderPickingOptions {
  selectedGroup: GameGroup | null;
  setStatusMessage: Dispatch<SetStateAction<string | null>>;
}

export interface UseProviderPickingResult {
  providerPicker: ProviderPickerState;
  setProviderPicker: Dispatch<SetStateAction<ProviderPickerState>>;
  handlePlay: () => Promise<void>;
  handlePlayVariant: (game: Game, mode?: ProviderPickerMode) => Promise<void>;
  handleInstallFromProvider: () => Promise<void>;
}

export function useProviderPicking({
  selectedGroup,
  setStatusMessage,
}: UseProviderPickingOptions): UseProviderPickingResult {
  const [providerPicker, setProviderPicker] = useState<ProviderPickerState>(null);
  const { logGameStart } = useActivityLogger();

  const handleInstallOrUpdateVariant = async (game: Game) => {
    setStatusMessage(null);

    if (!isTauri()) {
      setStatusMessage(desktopActionMessage("install"));
      return;
    }

    try {
      if (!isInstallOrUpdateCandidate(game)) {
        setStatusMessage(`${game.title} is already installed and up to date.`);
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

  const handlePlayVariant = async (game: Game, mode: ProviderPickerMode = "play") => {
    if (mode === "install") {
      await handleInstallOrUpdateVariant(game);
      return;
    }

    setStatusMessage(null);

    if (!isTauri()) {
      setStatusMessage(desktopActionMessage("play"));
      return;
    }

    try {
      if (!isPlayableGame(game)) {
        const response = await startDownload(
          game.id,
          game.title,
          game.downloadUrl,
          game.downloadSha256,
        );
        setStatusMessage(response.message);
        return;
      }

      const xboxPackageFamilyName = getXboxPackageFamilyName(game.id);
      if (xboxPackageFamilyName) {
        await launchXboxGame(xboxPackageFamilyName);
        setStatusMessage("Launching Xbox game...");
        trackActivePerformanceGame(game);
        void logGameStart(game.id, game.title, { launcher: "xbox" });
        void trackPlaySessionStart(game);
        return;
      }

      if (
        game.id.startsWith("steam-owned-") ||
        game.id.startsWith("gog-owned-") ||
        game.id.startsWith("epic-owned-")
      ) {
        const response = await launchGame(game.id);
        setStatusMessage(response.message);
        trackActivePerformanceGame(game);
        void logGameStart(game.id, game.title, { launcher: game.launcher });
        void trackPlaySessionStart(game);
        return;
      }

      const response = await launchGame(game.id);
      setStatusMessage(response.message);
      trackActivePerformanceGame(game);
      void logGameStart(game.id, game.title, { launcher: game.launcher });
      void trackPlaySessionStart(game);
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    }
  };

  const handlePlay = async () => {
    if (!isTauri()) {
      setStatusMessage(desktopActionMessage("play"));
      return;
    }

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

    const installableVariants = selectedGroup.variants.filter(isInstallOrUpdateCandidate);
    if (installableVariants.length > 1) {
      setProviderPicker({
        mode: "install",
        title: selectedGroup.title,
        variants: installableVariants,
      });
      return;
    }

    if (installableVariants.length === 1) {
      await handlePlayVariant(installableVariants[0], "install");
      return;
    }

    setStatusMessage(`No installable copy of ${selectedGroup.title} is available.`);
  };

  const handleInstallFromProvider = async () => {
    if (!isTauri()) {
      setStatusMessage(desktopActionMessage("install"));
      return;
    }

    if (!selectedGroup) {
      return;
    }

    const installableVariants = selectedGroup.variants.filter(isInstallOrUpdateCandidate);
    if (installableVariants.length > 1) {
      setProviderPicker({
        mode: "install",
        title: selectedGroup.title,
        variants: installableVariants,
      });
      return;
    }

    if (installableVariants.length === 1) {
      await handlePlayVariant(installableVariants[0], "install");
      return;
    }

    setStatusMessage(`${selectedGroup.title} is already installed and up to date.`);
  };

  return {
    providerPicker,
    setProviderPicker,
    handlePlay,
    handlePlayVariant,
    handleInstallFromProvider,
  };
}
