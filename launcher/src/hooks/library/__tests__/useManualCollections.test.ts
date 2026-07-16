import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
      result.current.setManualCollections({ MyCollection: ["g1"] });
    });
    act(() => {
      result.current.selectManualCollection("MyCollection");
    });
    expect(result.current.selectedManualCollectionName).toBe("MyCollection");
  });

  it("clearManualCollectionSelection resets to null", () => {
    const { result } = renderHook(() => useManualCollections());
    act(() => {
      result.current.setManualCollections({ MyCollection: ["g1"] });
    });
    act(() => {
      result.current.selectManualCollection("MyCollection");
    });
    act(() => {
      result.current.clearManualCollectionSelection();
    });
    expect(result.current.selectedManualCollectionName).toBeNull();
  });

  it("clears a selected collection when that collection is deleted", () => {
    const { result } = renderHook(() => useManualCollections());
    act(() => {
      result.current.setManualCollections({ MyCollection: ["g1"] });
    });
    act(() => {
      result.current.selectManualCollection("MyCollection");
    });
    act(() => {
      result.current.setManualCollections({});
    });

    expect(result.current.selectedManualCollectionName).toBeNull();
  });

  it("falls back safely when persisted records have invalid shapes", () => {
    window.localStorage.setItem(STORAGE_KEYS.LIBRARY_FAVORITES, JSON.stringify({ g1: "yes" }));
    window.localStorage.setItem(
      STORAGE_KEYS.LIBRARY_MANUAL_COLLECTIONS,
      JSON.stringify({ Broken: "g1" }),
    );

    const { result } = renderHook(() => useManualCollections());

    expect(result.current.favorites).toEqual({});
    expect(result.current.manualCollections).toEqual({});
  });

  it("keeps in-memory state usable when localStorage writes fail", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    const { result } = renderHook(() => useManualCollections());
    act(() => {
      result.current.setFavorites({ g1: true });
    });

    expect(result.current.favorites).toEqual({ g1: true });
    setItem.mockRestore();
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
