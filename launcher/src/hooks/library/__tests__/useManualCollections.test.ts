import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useManualCollections } from "../useManualCollections";
import { STORAGE_KEYS } from "../../../lib/storage-keys";

describe("useManualCollections", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("initializes with empty defaults", () => {
    const { result } = renderHook(() => useManualCollections());
    expect(result.current.favorites).toEqual({});
    expect(result.current.hiddenGames).toEqual({});
    expect(result.current.customCategories).toEqual({});
    expect(result.current.manualCollections).toEqual({});
    expect(result.current.selectedManualCollectionName).toBeNull();
  });

  it("hydrates from localStorage", () => {
    window.localStorage.setItem(STORAGE_KEYS.LIBRARY_FAVORITES, JSON.stringify({ g1: true }));
    window.localStorage.setItem(STORAGE_KEYS.LIBRARY_HIDDEN, JSON.stringify({ g2: true }));
    window.localStorage.setItem(
      STORAGE_KEYS.LIBRARY_MANUAL_COLLECTIONS,
      JSON.stringify({ Collection: ["g1", "g2"] }),
    );
    const { result } = renderHook(() => useManualCollections());
    expect(result.current.favorites).toEqual({ g1: true });
    expect(result.current.hiddenGames).toEqual({ g2: true });
    expect(result.current.manualCollections).toEqual({ Collection: ["g1", "g2"] });
  });

  it("selectManualCollection sets the selected name", () => {
    const { result } = renderHook(() => useManualCollections());
    act(() => {
      result.current.selectManualCollection("MyCollection");
    });
    expect(result.current.selectedManualCollectionName).toBe("MyCollection");
  });

  it("clearManualCollectionSelection resets to null", () => {
    const { result } = renderHook(() => useManualCollections());
    act(() => {
      result.current.selectManualCollection("MyCollection");
    });
    act(() => {
      result.current.clearManualCollectionSelection();
    });
    expect(result.current.selectedManualCollectionName).toBeNull();
  });

  it("persists favorites to localStorage", () => {
    const { result } = renderHook(() => useManualCollections());
    act(() => {
      result.current.setFavorites({ g1: true });
    });
    const stored = window.localStorage.getItem(STORAGE_KEYS.LIBRARY_FAVORITES);
    expect(JSON.parse(stored as string)).toEqual({ g1: true });
  });
});
