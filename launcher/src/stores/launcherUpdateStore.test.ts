import { describe, expect, it, vi } from "vitest";
import type {
  LauncherUpdateAdapter,
  LauncherUpdateDownloadEvent,
  LauncherUpdateHandle,
} from "../lib/launcher-update";
import { createLauncherUpdateStore } from "./launcherUpdateStore";

const checkedAt = new Date("2026-07-14T14:00:00.000Z");

function makeUpdate(overrides: Partial<LauncherUpdateHandle> = {}): LauncherUpdateHandle {
  return {
    currentVersion: "0.1.0",
    version: "0.2.0",
    body: "A faster launcher",
    downloadAndInstall: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeAdapter(overrides: Partial<LauncherUpdateAdapter> = {}): LauncherUpdateAdapter {
  return {
    getRuntimeSupport: () => ({ supported: true, reason: null }),
    getCurrentVersion: vi.fn().mockResolvedValue("0.1.0"),
    check: vi.fn().mockResolvedValue(null),
    relaunch: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeStore(adapterOverrides: Partial<LauncherUpdateAdapter> = {}) {
  return createLauncherUpdateStore(makeAdapter(adapterOverrides), () => checkedAt);
}

describe("launcher update store", () => {
  it("defaults to the system clock when no now function is provided", async () => {
    const store = createLauncherUpdateStore(
      makeAdapter({ check: vi.fn().mockResolvedValue(null) }),
    );

    const state = await store.checkForLauncherUpdate();

    expect(state.lastCheckedAt).not.toBeNull();
    expect(Number.isNaN(new Date(state.lastCheckedAt ?? "").getTime())).toBe(false);
  });

  it("guards browser and unsupported runtimes before loading the updater", async () => {
    const store = createLauncherUpdateStore(
      makeAdapter({
        getRuntimeSupport: () => ({
          supported: false,
          reason: "Launcher-Updates sind nur in der installierten Desktop-App verfügbar.",
        }),
      }),
      () => checkedAt,
    );

    await store.checkForLauncherUpdate();

    expect(store.useLauncherUpdateStore.getState()).toMatchObject({
      status: "unsupported",
      unsupportedReason: "Launcher-Updates sind nur in der installierten Desktop-App verfügbar.",
      error: null,
    });
  });

  it("reports the installed version as current when no update exists", async () => {
    const store = makeStore();

    const state = await store.checkForLauncherUpdate();

    expect(state).toMatchObject({
      status: "current",
      currentVersion: "0.1.0",
      latestVersion: "0.1.0",
      lastCheckedAt: checkedAt.toISOString(),
      error: null,
    });
  });

  it("retains one pending update and exposes its release metadata", async () => {
    const update = makeUpdate({ body: "  Signed release notes  " });
    const store = makeStore({ check: vi.fn().mockResolvedValue(update) });

    await store.checkForLauncherUpdate();

    expect(store.useLauncherUpdateStore.getState()).toMatchObject({
      status: "available",
      currentVersion: "0.1.0",
      latestVersion: "0.2.0",
      notes: "Signed release notes",
      lastCheckedAt: checkedAt.toISOString(),
    });
  });

  it("maps network errors to a safe message without exposing raw details", async () => {
    const store = makeStore({
      check: vi.fn().mockRejectedValue(new Error("fetch failed with token=secret")),
    });

    await store.checkForLauncherUpdate();

    const state = store.useLauncherUpdateStore.getState();
    expect(state.status).toBe("error");
    expect(state.error).toBe("Die Verbindung zum GitHub-Update-Dienst ist fehlgeschlagen.");
    expect(state.error).not.toContain("secret");
    expect(state.lastCheckedAt).toBe(checkedAt.toISOString());
  });

  it("maps permission and unknown check errors to safe localized messages", async () => {
    const store1 = makeStore({
      check: vi.fn().mockRejectedValue(new Error("EACCES: access denied")),
    });
    await store1.checkForLauncherUpdate();
    expect(store1.useLauncherUpdateStore.getState().error).toBe(
      "Das Launcher-Update konnte wegen fehlender Berechtigungen nicht installiert werden.",
    );

    const store2 = makeStore({
      check: vi.fn().mockRejectedValue(new Error("unexpected updater response")),
    });
    await store2.checkForLauncherUpdate();
    expect(store2.useLauncherUpdateStore.getState().error).toBe(
      "Die Launcher-Update-Prüfung ist fehlgeschlagen. Bitte versuche es später erneut.",
    );
  });

  it("deduplicates concurrent update checks", async () => {
    let finishCheck: ((update: LauncherUpdateHandle | null) => void) | undefined;
    const check = vi.fn(
      () =>
        new Promise<LauncherUpdateHandle | null>((resolve) => {
          finishCheck = resolve;
        }),
    );
    const store = makeStore({ check });

    const first = store.checkForLauncherUpdate();
    const second = store.checkForLauncherUpdate();
    await vi.waitFor(() => expect(check).toHaveBeenCalledOnce());
    expect(second).toBe(first);
    expect(store.useLauncherUpdateStore.getState().status).toBe("checking");

    finishCheck?.(null);
    await Promise.all([first, second]);
    expect(check).toHaveBeenCalledOnce();
  });

  it("tracks byte and percentage progress when content length is known", async () => {
    const events: LauncherUpdateDownloadEvent[] = [
      { event: "Started", data: { contentLength: 1_000 } },
      { event: "Progress", data: { chunkLength: 250 } },
      { event: "Progress", data: { chunkLength: 250 } },
      { event: "Finished", data: {} },
    ];
    const update = makeUpdate({
      downloadAndInstall: vi.fn(async (onEvent) => {
        for (const event of events) onEvent(event);
      }),
    });
    const store = makeStore({ check: vi.fn().mockResolvedValue(update) });
    await store.checkForLauncherUpdate();

    await store.installLauncherUpdate();

    expect(store.useLauncherUpdateStore.getState()).toMatchObject({
      status: "installing",
      progress: { downloadedBytes: 1_000, totalBytes: 1_000, percentage: 100 },
      error: null,
    });
  });

  it("tracks downloaded bytes without inventing a percentage for unknown totals", async () => {
    const update = makeUpdate({
      downloadAndInstall: vi.fn(async (onEvent) => {
        onEvent({ event: "Started", data: {} });
        onEvent({ event: "Progress", data: { chunkLength: 512 } });
        onEvent({ event: "Finished", data: {} });
      }),
    });
    const store = makeStore({ check: vi.fn().mockResolvedValue(update) });
    await store.checkForLauncherUpdate();

    await store.installLauncherUpdate();

    expect(store.useLauncherUpdateStore.getState().progress).toEqual({
      downloadedBytes: 512,
      totalBytes: null,
      percentage: null,
    });
  });

  it("finishes safely if an updater emits Finished after progress was cleared", async () => {
    const update = makeUpdate({
      downloadAndInstall: vi.fn(async (onEvent) => {
        store.useLauncherUpdateStore.setState({ progress: null });
        onEvent({ event: "Finished", data: {} });
      }),
    });
    const store = makeStore({ check: vi.fn().mockResolvedValue(update) });
    await store.checkForLauncherUpdate();

    await store.installLauncherUpdate();

    expect(store.useLauncherUpdateStore.getState().progress).toEqual({
      downloadedBytes: 0,
      totalBytes: null,
      percentage: null,
    });
  });

  it("deduplicates concurrent installs and relaunches once", async () => {
    let finishInstall: (() => void) | undefined;
    const update = makeUpdate({
      downloadAndInstall: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finishInstall = resolve;
          }),
      ),
    });
    const adapter = makeAdapter({ check: vi.fn().mockResolvedValue(update) });
    const store = createLauncherUpdateStore(adapter, () => checkedAt);
    await store.checkForLauncherUpdate();

    const first = store.installLauncherUpdate();
    const second = store.installLauncherUpdate();
    expect(second).toBe(first);
    expect(update.downloadAndInstall).toHaveBeenCalledOnce();

    finishInstall?.();
    await Promise.all([first, second]);
    expect(adapter.relaunch).toHaveBeenCalledOnce();
  });

  it("keeps the pending update retryable after signature or install errors", async () => {
    const downloadAndInstall = vi
      .fn()
      .mockRejectedValueOnce(new Error("signature verification failed"))
      .mockResolvedValueOnce(undefined);
    const update = makeUpdate({ downloadAndInstall });
    const adapter = makeAdapter({ check: vi.fn().mockResolvedValue(update) });
    const store = createLauncherUpdateStore(adapter, () => checkedAt);
    await store.checkForLauncherUpdate();

    await store.installLauncherUpdate();
    expect(store.useLauncherUpdateStore.getState()).toMatchObject({
      status: "error",
      error: "Die Signatur des Launcher-Updates konnte nicht verifiziert werden.",
    });

    await store.installLauncherUpdate();
    expect(downloadAndInstall).toHaveBeenCalledTimes(2);
    expect(adapter.relaunch).toHaveBeenCalledOnce();
  });

  it("uses the generic install error without exposing unexpected details", async () => {
    const update = makeUpdate({
      downloadAndInstall: vi.fn().mockRejectedValue(new Error("unexpected installer failure")),
    });
    const store = makeStore({ check: vi.fn().mockResolvedValue(update) });
    await store.checkForLauncherUpdate();

    await store.installLauncherUpdate();

    expect(store.useLauncherUpdateStore.getState().error).toBe(
      "Das Launcher-Update konnte nicht installiert werden. Bitte versuche es erneut.",
    );
  });

  it("fails safely when install is requested without a checked update", async () => {
    const store = makeStore();

    const state = await store.installLauncherUpdate();

    expect(state).toMatchObject({
      status: "error",
      error: "Es wurde noch kein installierbares Launcher-Update gefunden.",
    });
  });

  it("defers install while a check is still in flight", async () => {
    let finishCheck: ((update: LauncherUpdateHandle | null) => void) | undefined;
    const check = vi.fn(
      () =>
        new Promise<LauncherUpdateHandle | null>((resolve) => {
          finishCheck = resolve;
        }),
    );
    const store = makeStore({ check });

    const checkPromise = store.checkForLauncherUpdate();
    const install = store.installLauncherUpdate();
    await vi.waitFor(() => expect(check).toHaveBeenCalledOnce());

    expect(install).toBe(checkPromise);
    expect(store.useLauncherUpdateStore.getState().status).toBe("checking");

    finishCheck?.(null);
    await Promise.all([checkPromise, install]);
  });

  it("falls back to the installed version when the update omits currentVersion", async () => {
    const update = makeUpdate({ currentVersion: undefined });
    const store = makeStore({ check: vi.fn().mockResolvedValue(update) });
    await store.checkForLauncherUpdate();

    expect(store.useLauncherUpdateStore.getState()).toMatchObject({
      status: "available",
      currentVersion: "0.1.0",
      latestVersion: "0.2.0",
    });
  });

  it("clears notes when the update body is empty", async () => {
    const update = makeUpdate({ body: undefined });
    const store = makeStore({ check: vi.fn().mockResolvedValue(update) });
    await store.checkForLauncherUpdate();

    expect(store.useLauncherUpdateStore.getState().notes).toBeNull();
  });

  it("does not fabricate a percentage when the announced total is zero", async () => {
    const update = makeUpdate({
      downloadAndInstall: vi.fn(async (onEvent) => {
        onEvent({ event: "Started", data: { contentLength: 0 } });
        onEvent({ event: "Progress", data: { chunkLength: 10 } });
        onEvent({ event: "Finished", data: {} });
      }),
    });
    const store = makeStore({ check: vi.fn().mockResolvedValue(update) });
    await store.checkForLauncherUpdate();

    await store.installLauncherUpdate();

    expect(store.useLauncherUpdateStore.getState().progress).toEqual({
      downloadedBytes: 10,
      totalBytes: 0,
      percentage: null,
    });
  });

  it("ignores negative byte counts from the updater", async () => {
    const update = makeUpdate({
      downloadAndInstall: vi.fn(async (onEvent) => {
        onEvent({ event: "Started", data: { contentLength: -5 } });
        onEvent({ event: "Progress", data: { chunkLength: 512 } });
        onEvent({ event: "Finished", data: {} });
      }),
    });
    const store = makeStore({ check: vi.fn().mockResolvedValue(update) });
    await store.checkForLauncherUpdate();

    await store.installLauncherUpdate();

    expect(store.useLauncherUpdateStore.getState().progress).toEqual({
      downloadedBytes: 512,
      totalBytes: null,
      percentage: null,
    });
  });

  it("counts a progress event without a chunk length as zero bytes", async () => {
    const update = makeUpdate({
      downloadAndInstall: vi.fn(async (onEvent) => {
        onEvent({ event: "Started", data: { contentLength: 100 } });
        onEvent({ event: "Progress", data: {} });
        onEvent({ event: "Finished", data: {} });
      }),
    });
    const store = makeStore({ check: vi.fn().mockResolvedValue(update) });
    await store.checkForLauncherUpdate();

    await store.installLauncherUpdate();

    expect(store.useLauncherUpdateStore.getState().progress).toEqual({
      downloadedBytes: 100,
      totalBytes: 100,
      percentage: 100,
    });
  });
});
