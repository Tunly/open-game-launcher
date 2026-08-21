import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { type CustomArtworkKind, type CustomArtworkMap } from "../../lib/custom-artwork";
import { getGameLogoCandidates } from "../../lib/formatters";
import { getProviderErrorMessage } from "../../lib/library-providers";
import { compressAndReadImage, isAllowedImageType } from "../../lib/image-compress";
import { STORAGE_KEYS } from "../../lib/storage-keys";
import type { Game } from "../../lib/types";

function readCustomArtworkMap(): CustomArtworkMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LIBRARY_CUSTOM_ARTWORK);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as CustomArtworkMap) : {};
  } catch {
    return {};
  }
}

export interface UseCustomArtworkOptions {
  setStatusMessage: Dispatch<SetStateAction<string | null>>;
}

export interface UseCustomArtworkResult {
  logoCandidateIndexes: Record<string, number>;
  loadedLogoUrls: Set<string>;
  customArtwork: CustomArtworkMap;
  pendingArtworkFile: File | null;
  pendingArtworkKind: CustomArtworkKind;
  pendingArtworkGameId: string | null;
  handleLogoLoad: (logoUrl: string) => void;
  handleLogoError: (game: Game) => void;
  handleSelectCustomArtwork: (gameId: string, kind: CustomArtworkKind, file: File) => Promise<void>;
  handleArtworkDrop: (gameId: string, kind: CustomArtworkKind, file: File) => Promise<void>;
  handleApplyCustomArtworkUrl: (
    gameId: string,
    kind: CustomArtworkKind,
    url: string,
    sourceLabel: string,
  ) => void;
  openArtworkPreview: (gameId: string, kind: CustomArtworkKind, file: File) => void;
  closeArtworkPreview: () => void;
  handleConfirmArtwork: (dataUrl: string, kind: CustomArtworkKind) => void;
  handleResetCustomArtwork: (gameId: string, kind?: CustomArtworkKind) => void;
}

export function useCustomArtwork({
  setStatusMessage,
}: UseCustomArtworkOptions): UseCustomArtworkResult {
  const [logoCandidateIndexes, setLogoCandidateIndexes] = useState<Record<string, number>>({});
  const [loadedLogoUrls, setLoadedLogoUrls] = useState<Set<string>>(() => new Set());
  const [customArtwork, setCustomArtwork] = useState<CustomArtworkMap>(readCustomArtworkMap);
  const [pendingArtworkFile, setPendingArtworkFile] = useState<File | null>(null);
  const [pendingArtworkKind, setPendingArtworkKind] = useState<CustomArtworkKind>("cover");
  const [pendingArtworkGameId, setPendingArtworkGameId] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.LIBRARY_CUSTOM_ARTWORK, JSON.stringify(customArtwork));
    } catch (error) {
      console.warn("Failed to persist custom artwork:", error);
      setStatusMessage("Artwork could not be saved. Try a smaller image file.");
    }
  }, [customArtwork, setStatusMessage]);

  function handleLogoError(game: Game) {
    const candidates = getGameLogoCandidates(game);

    setLogoCandidateIndexes((current) => {
      const currentIndex = current[game.id] ?? 0;
      return {
        ...current,
        [game.id]: currentIndex + 1 >= candidates.length ? candidates.length : currentIndex + 1,
      };
    });
  }

  function handleLogoLoad(logoUrl: string) {
    setLoadedLogoUrls((current) => {
      if (current.has(logoUrl)) {
        return current;
      }

      const next = new Set(current);
      next.add(logoUrl);
      return next;
    });
  }

  async function handleSelectCustomArtwork(gameId: string, kind: CustomArtworkKind, file: File) {
    if (!isAllowedImageType(file)) {
      setStatusMessage("Only JPG, PNG, and WebP images can be used as custom artwork.");
      return;
    }

    try {
      const dataUrl = await compressAndReadImage(file, kind);
      setCustomArtwork((current) => {
        const next = {
          ...current,
          [gameId]: {
            ...current[gameId],
            [`${kind}Url`]: dataUrl,
            updatedAt: Date.now(),
          },
        };
        return next;
      });
      setLogoCandidateIndexes((current) => ({ ...current, [gameId]: 0 }));
      setStatusMessage(`Custom ${kind} artwork saved.`);
    } catch (error) {
      setStatusMessage(getProviderErrorMessage(error));
    }
  }

  async function handleArtworkDrop(gameId: string, kind: CustomArtworkKind, file: File) {
    await handleSelectCustomArtwork(gameId, kind, file);
  }

  function handleApplyCustomArtworkUrl(
    gameId: string,
    kind: CustomArtworkKind,
    url: string,
    sourceLabel: string,
  ) {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setStatusMessage("Artwork candidate is missing a URL.");
      return;
    }

    setCustomArtwork((current) => {
      const next = {
        ...current,
        [gameId]: {
          ...current[gameId],
          [`${kind}Url`]: trimmedUrl,
          updatedAt: Date.now(),
        },
      };
      return next;
    });
    setLogoCandidateIndexes((current) => ({ ...current, [gameId]: 0 }));
    setStatusMessage(`${sourceLabel} ${kind} artwork applied.`);
  }

  function openArtworkPreview(gameId: string, kind: CustomArtworkKind, file: File) {
    setPendingArtworkGameId(gameId);
    setPendingArtworkKind(kind);
    setPendingArtworkFile(file);
  }

  function closeArtworkPreview() {
    setPendingArtworkFile(null);
    setPendingArtworkGameId(null);
  }

  function handleConfirmArtwork(dataUrl: string, kind: CustomArtworkKind) {
    if (!pendingArtworkGameId) return;

    setCustomArtwork((current) => {
      const next = {
        ...current,
        [pendingArtworkGameId]: {
          ...current[pendingArtworkGameId],
          [`${kind}Url`]: dataUrl,
          updatedAt: Date.now(),
        },
      };
      return next;
    });
    setLogoCandidateIndexes((current) => ({ ...current, [pendingArtworkGameId]: 0 }));
    setStatusMessage(`Custom ${kind} artwork saved.`);
    closeArtworkPreview();
  }

  function handleResetCustomArtwork(gameId: string, kind?: CustomArtworkKind) {
    setCustomArtwork((current) => {
      const currentArtwork = current[gameId];
      if (!currentArtwork) {
        return current;
      }

      const next = { ...current };
      if (!kind) {
        delete next[gameId];
        return next;
      }

      const nextArtwork = { ...currentArtwork };
      delete nextArtwork[`${kind}Url`];
      nextArtwork.updatedAt = Date.now();

      if (!nextArtwork.coverUrl && !nextArtwork.iconUrl && !nextArtwork.logoUrl) {
        delete next[gameId];
      } else {
        next[gameId] = nextArtwork;
      }
      return next;
    });
    setLogoCandidateIndexes((current) => ({ ...current, [gameId]: 0 }));
    setStatusMessage(kind ? `Custom ${kind} artwork reset.` : "Custom artwork reset.");
  }

  return {
    logoCandidateIndexes,
    loadedLogoUrls,
    customArtwork,
    pendingArtworkFile,
    pendingArtworkKind,
    pendingArtworkGameId,
    handleLogoLoad,
    handleLogoError,
    handleSelectCustomArtwork,
    handleArtworkDrop,
    handleApplyCustomArtworkUrl,
    openArtworkPreview,
    closeArtworkPreview,
    handleConfirmArtwork,
    handleResetCustomArtwork,
  };
}
