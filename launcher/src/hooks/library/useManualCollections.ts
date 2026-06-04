import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { STORAGE_KEYS } from "../../lib/storage-keys";

export interface UseManualCollectionsResult {
  favorites: Record<string, boolean>;
  setFavorites: Dispatch<SetStateAction<Record<string, boolean>>>;
  hiddenGames: Record<string, boolean>;
  setHiddenGames: Dispatch<SetStateAction<Record<string, boolean>>>;
  customCategories: Record<string, string[]>;
  setCustomCategories: Dispatch<SetStateAction<Record<string, string[]>>>;
  manualCollections: Record<string, string[]>;
  setManualCollections: Dispatch<SetStateAction<Record<string, string[]>>>;
  selectedManualCollectionName: string | null;
  setSelectedManualCollectionName: Dispatch<SetStateAction<string | null>>;
  selectManualCollection: (name: string) => void;
  clearManualCollectionSelection: () => void;
}

function readJsonRecord<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    return saved ? (JSON.parse(saved) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function useManualCollections(): UseManualCollectionsResult {
  const [favorites, setFavorites] = useState<Record<string, boolean>>(() =>
    readJsonRecord(STORAGE_KEYS.LIBRARY_FAVORITES, {}),
  );
  const [hiddenGames, setHiddenGames] = useState<Record<string, boolean>>(() =>
    readJsonRecord(STORAGE_KEYS.LIBRARY_HIDDEN, {}),
  );
  const [customCategories, setCustomCategories] = useState<Record<string, string[]>>(() =>
    readJsonRecord(STORAGE_KEYS.LIBRARY_CUSTOM_CATEGORIES, {}),
  );
  const [manualCollections, setManualCollections] = useState<Record<string, string[]>>(() =>
    readJsonRecord(STORAGE_KEYS.LIBRARY_MANUAL_COLLECTIONS, {}),
  );
  const [selectedManualCollectionName, setSelectedManualCollectionName] = useState<string | null>(
    null,
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.LIBRARY_FAVORITES, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.LIBRARY_HIDDEN, JSON.stringify(hiddenGames));
  }, [hiddenGames]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.LIBRARY_CUSTOM_CATEGORIES, JSON.stringify(customCategories));
  }, [customCategories]);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEYS.LIBRARY_MANUAL_COLLECTIONS,
      JSON.stringify(manualCollections),
    );
  }, [manualCollections]);

  function selectManualCollection(name: string) {
    setSelectedManualCollectionName(name);
  }

  function clearManualCollectionSelection() {
    setSelectedManualCollectionName(null);
  }

  return {
    favorites,
    setFavorites,
    hiddenGames,
    setHiddenGames,
    customCategories,
    setCustomCategories,
    manualCollections,
    setManualCollections,
    selectedManualCollectionName,
    setSelectedManualCollectionName,
    selectManualCollection,
    clearManualCollectionSelection,
  };
}
