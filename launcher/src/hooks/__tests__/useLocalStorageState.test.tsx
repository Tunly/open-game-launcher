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
    const { result } = renderHook(() => useLocalStorageState("key", { count: 0 }, schema));
    expect(result.current[0]).toEqual({ count: 5 });
  });

  it("falls back to the initial value when the stored value fails schema validation", () => {
    const schema = z.object({ count: z.number() });
    window.localStorage.setItem("key", JSON.stringify({ wrong: "shape" }));
    const { result } = renderHook(() => useLocalStorageState("key", { count: 0 }, schema));
    expect(result.current[0]).toEqual({ count: 0 });
  });

  it("falls back to the initial value when the stored value is invalid JSON", () => {
    window.localStorage.setItem("key", "not-json");
    const { result } = renderHook(() => useLocalStorageState("key", "default"));
    expect(result.current[0]).toBe("default");
  });

  it("persists updates triggered by an external effect (key change)", () => {
    // The hook is intentionally key-stable: the state initializer only runs
    // on first render, so changing the key does NOT rehydrate the new key's
    // value from localStorage. Document that behaviour here.
    const { result, rerender } = renderHook(({ key }) => useLocalStorageState(key, "default"), {
      initialProps: { key: "alpha" },
    });

    act(() => {
      result.current[1]("alpha-value");
    });
    expect(window.localStorage.getItem("alpha")).toBe(JSON.stringify("alpha-value"));

    rerender({ key: "beta" });
    // State carries over; "beta" is not consulted.
    expect(result.current[0]).toBe("alpha-value");
  });

  it("does not overwrite the stored value on the first render", () => {
    // The hook guards with skipInitialWrite; this test ensures the first
    // render does not immediately clobber an existing localStorage entry.
    window.localStorage.setItem("key", JSON.stringify("preexisting"));
    renderHook(() => useLocalStorageState("key", "default"));
    expect(window.localStorage.getItem("key")).toBe(JSON.stringify("preexisting"));
  });

  it("accepts functional updates like React.useState", () => {
    const { result } = renderHook(() => useLocalStorageState<number>("count", 0));

    act(() => {
      result.current[1]((current) => current + 1);
    });
    act(() => {
      result.current[1]((current) => current + 1);
    });

    expect(result.current[0]).toBe(2);
    expect(window.localStorage.getItem("count")).toBe(JSON.stringify(2));
  });
});
