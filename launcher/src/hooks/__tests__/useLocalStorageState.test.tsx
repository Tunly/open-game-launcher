import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { useLocalStorageState } from "../useLocalStorageState";

describe("useLocalStorageState", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("returns the initial value when nothing is stored", () => {
    const { result } = renderHook(() => useLocalStorageState("key", "default"));
    expect(result.current[0]).toBe("default");
  });

  it("loads the stored value if present", () => {
    window.localStorage.setItem("key", JSON.stringify("stored"));
    const { result } = renderHook(() => useLocalStorageState("key", "default"));
    expect(result.current[0]).toBe("stored");
  });

  it("persists changes back to localStorage", () => {
    const { result } = renderHook(() => useLocalStorageState("key", "default"));

    act(() => {
      result.current[1]("updated");
    });

    expect(result.current[0]).toBe("updated");
    expect(window.localStorage.getItem("key")).toBe(JSON.stringify("updated"));
  });

  it("parses stored values against a zod schema", () => {
    const schema = z.object({ count: z.number() });
    window.localStorage.setItem("key", JSON.stringify({ count: 5 }));
    const { result } = renderHook(() =>
      useLocalStorageState("key", { count: 0 }, schema),
    );
    expect(result.current[0]).toEqual({ count: 5 });
  });

  it("falls back to the initial value when the stored value fails schema validation", () => {
    const schema = z.object({ count: z.number() });
    window.localStorage.setItem("key", JSON.stringify({ wrong: "shape" }));
    const { result } = renderHook(() =>
      useLocalStorageState("key", { count: 0 }, schema),
    );
    expect(result.current[0]).toEqual({ count: 0 });
  });

  it("falls back to the initial value when the stored value is invalid JSON", () => {
    window.localStorage.setItem("key", "not-json");
    const { result } = renderHook(() => useLocalStorageState("key", "default"));
    expect(result.current[0]).toBe("default");
  });
});