import { act, render, renderHook, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LibraryContext, type LibraryContextValue } from "../LibraryContext";
import { LibraryProvider } from "../LibraryProvider";
import { useLibraryContext } from "../useLibraryContext";

function makeContext(overrides: Partial<LibraryContextValue> = {}): LibraryContextValue {
  const setStatusMessage = vi.fn();
  return {
    sync: {} as never,
    manual: {} as never,
    filters: {} as never,
    dynamic: {} as never,
    achievements: {} as never,
    picking: {} as never,
    statusMessage: null,
    setStatusMessage,
    ...overrides,
  };
}

describe("useLibraryContext", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("throws when used outside a LibraryProvider", () => {
    expect(() => renderHook(() => useLibraryContext())).toThrow(
      /must be used within a LibraryProvider/,
    );
  });

  it("exposes the value passed to the provider to consumers", () => {
    const ctx = makeContext({ statusMessage: "hello" });

    function Consumer() {
      const value = useLibraryContext();
      return <span data-testid="status">{value.statusMessage ?? "none"}</span>;
    }

    render(
      <LibraryProvider value={ctx}>
        <Consumer />
      </LibraryProvider>,
    );

    expect(screen.getByTestId("status").textContent).toBe("hello");
  });

  it("calls setStatusMessage exposed by the provider", () => {
    const setStatusMessage = vi.fn();
    const ctx = makeContext({ setStatusMessage });

    function Consumer() {
      const value = useLibraryContext();
      return (
        <button type="button" onClick={() => value.setStatusMessage("new")}>
          emit
        </button>
      );
    }

    render(
      <LibraryProvider value={ctx}>
        <Consumer />
      </LibraryProvider>,
    );

    act(() => {
      screen.getByText("emit").click();
    });
    expect(setStatusMessage).toHaveBeenCalledWith("new");
  });

  it("re-renders children when the provider value changes", () => {
    function Wrapper() {
      const [msg, setMsg] = useState<string | null>(null);
      const ctx = makeContext({ statusMessage: msg, setStatusMessage: setMsg });
      return (
        <LibraryProvider value={ctx}>
          <Consumer />
        </LibraryProvider>
      );
    }

    function Consumer() {
      const value = useLibraryContext();
      return <span data-testid="status">{value.statusMessage ?? "none"}</span>;
    }

    render(<Wrapper />);
    expect(screen.getByTestId("status").textContent).toBe("none");
  });

  it("supports direct usage of the raw LibraryContext for advanced scenarios", () => {
    const ctx = makeContext({ statusMessage: "raw" });

    function Reader() {
      const [value] = useState(() => ({ current: ctx }));
      const observed = useLibraryContext();
      void value;
      return <span data-testid="raw">{observed.statusMessage ?? "none"}</span>;
    }

    render(
      <LibraryContext.Provider value={ctx}>
        <Reader />
      </LibraryContext.Provider>,
    );

    expect(screen.getByTestId("raw").textContent).toBe("raw");
  });

  it("exposes the setStatusMessage signature compatible with Dispatch<SetStateAction<string|null>>", () => {
    const setStatusMessage = vi.fn();
    const ctx = makeContext({ setStatusMessage });

    function DispatchProbe() {
      const value = useLibraryContext();
      return (
        <button
          type="button"
          onClick={() => value.setStatusMessage((current) => (current ? `${current}!` : "start"))}
        >
          bump
        </button>
      );
    }

    render(
      <LibraryProvider value={ctx}>
        <DispatchProbe />
      </LibraryProvider>,
    );

    act(() => {
      screen.getByText("bump").click();
    });
    expect(setStatusMessage).toHaveBeenCalledTimes(1);
    const updater = setStatusMessage.mock.calls[0][0] as (prev: string | null) => string | null;
    expect(updater("prev")).toBe("prev!");
    expect(updater(null)).toBe("start");
  });
});
