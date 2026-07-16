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

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === "boolean")
  );
}

function isStringArrayRecord(value: unknown): value is Record<string, string[]> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (entry) => Array.isArray(entry) && entry.every((item) => typeof item === "string"),
    )
  );
}

function readJsonRecord<T>(key: string, fallback: T, isValid: (value: unknown) => value is T): T {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) {
      return fallback;
    }

    const parsed: unknown = JSON.parse(saved);
    return isValid(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable or full. Keep the in-memory library usable.
  }
}

export function useManualCollections(): UseManualCollectionsResult {
  const [favorites, setFavorites] = useState<Record<string, boolean>>(() =>
    readJsonRecord(STORAGE_KEYS.LIBRARY_FAVORITES, {}, isBooleanRecord),
  );
  const [hiddenGames, setHiddenGames] = useState<Record<string, boolean>>(() =>
    readJsonRecord(STORAGE_KEYS.LIBRARY_HIDDEN, {}, isBooleanRecord),
  );
  const [customCategories, setCustomCategories] = useState<Record<string, string[]>>(() =>
    readJsonRecord(STORAGE_KEYS.LIBRARY_CUSTOM_CATEGORIES, {}, isStringArrayRecord),
  );
  const [manualCollections, setManualCollections] = useState<Record<string, string[]>>(() =>
    readJsonRecord(STORAGE_KEYS.LIBRARY_MANUAL_COLLECTIONS, {}, isStringArrayRecord),
  );
  const [selectedManualCollectionName, setSelectedManualCollectionName] = useState<string | null>(
    null,
  );

  useEffect(() => {
    writeJson(STORAGE_KEYS.LIBRARY_FAVORITES, favorites);
  }, [favorites]);

  useEffect(() => {
    writeJson(STORAGE_KEYS.LIBRARY_HIDDEN, hiddenGames);
  }, [hiddenGames]);

  useEffect(() => {
    writeJson(STORAGE_KEYS.LIBRARY_CUSTOM_CATEGORIES, customCategories);
  }, [customCategories]);

  useEffect(() => {
    writeJson(STORAGE_KEYS.LIBRARY_MANUAL_COLLECTIONS, manualCollections);
  }, [manualCollections]);

  useEffect(() => {
    if (
      selectedManualCollectionName !== null &&
      !Object.prototype.hasOwnProperty.call(manualCollections, selectedManualCollectionName)
    ) {
      setSelectedManualCollectionName(null);
    }
  }, [manualCollections, selectedManualCollectionName]);

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
