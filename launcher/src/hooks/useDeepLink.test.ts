import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDeepLinkLogSummary, useDeepLink, type DeepLinkParams } from "./useDeepLink";

const tauriMocks = vi.hoisted(() => ({
  isTauri: vi.fn(),
  listen: vi.fn(),
  unlisten: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: tauriMocks.isTauri,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: tauriMocks.listen,
}));

beforeEach(() => {
  tauriMocks.isTauri.mockReset();
  tauriMocks.isTauri.mockReturnValue(false);
  tauriMocks.listen.mockReset();
  tauriMocks.unlisten.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getDeepLinkLogSummary", () => {
  it("logs only action and parameter keys, not signed URL values", () => {
    const summary = getDeepLinkLogSummary({
      action: "install",
      params: {
        downloadUrl: "https://cdn.og-launcher.test/build.zip?token=secret",
        gameId: "demo",
        invite: "ogl.secret.payload",
      },
      rawUrl:
        "oglauncher://install?gameId=demo&downloadUrl=https%3A%2F%2Fcdn.og-launcher.test%2Fbuild.zip%3Ftoken%3Dsecret",
    });

    expect(summary).toEqual({
      action: "install",
      paramKeys: ["downloadUrl", "gameId", "invite"],
      rawUrlPresent: true,
    });
    expect(JSON.stringify(summary)).not.toContain("token=secret");
    expect(JSON.stringify(summary)).not.toContain("ogl.secret.payload");
    expect(JSON.stringify(summary)).not.toContain("oglauncher://install");
  });

  it("reports when a raw URL is absent without exposing params", () => {
    expect(
      getDeepLinkLogSummary({
        action: "open",
        params: {},
        rawUrl: "",
      }),
    ).toEqual({
      action: "open",
      paramKeys: [],
      rawUrlPresent: false,
    });
  });
});

describe("useDeepLink", () => {
  it("does not register a native listener in a browser session", () => {
    const onLink = vi.fn();

    renderHook(() => useDeepLink(onLink));

    expect(tauriMocks.listen).not.toHaveBeenCalled();
    expect(onLink).not.toHaveBeenCalled();
  });

  it("forwards native events with a redacted log and removes the listener on cleanup", async () => {
    tauriMocks.isTauri.mockReturnValue(true);
    let emit: ((payload: DeepLinkParams) => void) | undefined;
    tauriMocks.listen.mockImplementation(
      (
        _eventName: string,
        handler: (event: { payload: DeepLinkParams }) => void,
      ): Promise<() => void> => {
        emit = (payload) => handler({ payload });
        return Promise.resolve(tauriMocks.unlisten);
      },
    );
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const onLink = vi.fn();
    const link: DeepLinkParams = {
      action: "join",
      params: { invite: "secret-token", game: "Neon Circuit" },
      rawUrl: "oglauncher://join?invite=secret-token",
    };

    const hook = renderHook(() => useDeepLink(onLink));
    expect(tauriMocks.listen).toHaveBeenCalledWith("deep-link", expect.any(Function));

    act(() => {
      emit?.(link);
    });

    expect(onLink).toHaveBeenCalledWith(link);
    expect(log).toHaveBeenCalledWith("[deep-link]", {
      action: "join",
      paramKeys: ["game", "invite"],
      rawUrlPresent: true,
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-token");

    hook.unmount();
    await waitFor(() => {
      expect(tauriMocks.unlisten).toHaveBeenCalledTimes(1);
    });
  });
});
