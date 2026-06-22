import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
  supabaseConfig: {
    isSupabaseConfigured: true,
    supabaseAnonKey: "anon-public-key",
    supabaseConfigError: null as string | null,
    supabaseUrl: "https://project.supabase.co",
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
  isTauri: mocks.isTauri,
}));

vi.mock("./supabase/config", () => mocks.supabaseConfig);

describe("remote companion desktop vault wrappers", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.invoke.mockReset();
    mocks.isTauri.mockReset();
    mocks.supabaseConfig.supabaseAnonKey = "anon-public-key";
    mocks.supabaseConfig.supabaseConfigError = null;
    mocks.supabaseConfig.supabaseUrl = "https://project.supabase.co";
  });

  it("saves the one-time device secret through a desktop command", async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.invoke.mockResolvedValue({
      deviceId: "11111111-1111-4111-8111-111111111111",
      deviceSecretHint: "ogd_abcd...7890",
      hasSecret: true,
      updatedAtEpochMs: 1_781_160_000_000,
    });

    const { saveRemoteCompanionDeviceSecret } = await import("./launcher");
    const status = await saveRemoteCompanionDeviceSecret({
      deviceId: "11111111-1111-4111-8111-111111111111",
      deviceSecret: "ogd_desktop_secret_once_abcdefghijklmnopqrstuvwxyz",
      deviceSecretHint: "ogd_abcd...7890",
    });

    expect(mocks.invoke).toHaveBeenCalledWith("save_remote_companion_device_secret", {
      input: {
        deviceId: "11111111-1111-4111-8111-111111111111",
        deviceSecret: "ogd_desktop_secret_once_abcdefghijklmnopqrstuvwxyz",
        deviceSecretHint: "ogd_abcd...7890",
      },
    });
    expect(status).toEqual({
      deviceId: "11111111-1111-4111-8111-111111111111",
      deviceSecretHint: "ogd_abcd...7890",
      hasSecret: true,
      updatedAtEpochMs: 1_781_160_000_000,
    });
    expect(JSON.stringify(status)).not.toMatch(/desktop_secret_once/);
  });

  it("returns a redacted browser fallback for status reads", async () => {
    mocks.isTauri.mockReturnValue(false);

    const { getRemoteCompanionDeviceSecretStatus } = await import("./launcher");
    await expect(getRemoteCompanionDeviceSecretStatus()).resolves.toEqual({
      deviceId: null,
      deviceSecretHint: null,
      hasSecret: false,
      updatedAtEpochMs: null,
    });

    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("clears the desktop device secret through a desktop command", async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.invoke.mockResolvedValue({
      deviceId: null,
      deviceSecretHint: null,
      hasSecret: false,
      updatedAtEpochMs: null,
    });

    const { clearRemoteCompanionDeviceSecret } = await import("./launcher");
    await expect(clearRemoteCompanionDeviceSecret()).resolves.toEqual({
      deviceId: null,
      deviceSecretHint: null,
      hasSecret: false,
      updatedAtEpochMs: null,
    });

    expect(mocks.invoke).toHaveBeenCalledWith("clear_remote_companion_device_secret", undefined);
  });

  it("returns a redacted browser fallback for clear without opening IPC", async () => {
    mocks.isTauri.mockReturnValue(false);

    const { clearRemoteCompanionDeviceSecret } = await import("./launcher");
    await expect(clearRemoteCompanionDeviceSecret()).resolves.toEqual({
      deviceId: null,
      deviceSecretHint: null,
      hasSecret: false,
      updatedAtEpochMs: null,
    });

    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("propagates desktop clear errors without exposing secret-shaped values", async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.invoke.mockRejectedValue(new Error("Vault unavailable for device [redacted]."));

    const { clearRemoteCompanionDeviceSecret } = await import("./launcher");
    await clearRemoteCompanionDeviceSecret().catch((error: unknown) => {
      expect(String(error)).toMatch(/vault unavailable/i);
      expect(String(error)).not.toMatch(/ogd_|token=|signed url/i);
    });
  });

  it("rejects browser saves before a secret can leave web runtime memory", async () => {
    mocks.isTauri.mockReturnValue(false);

    const { saveRemoteCompanionDeviceSecret } = await import("./launcher");
    await expect(
      saveRemoteCompanionDeviceSecret({
        deviceId: "11111111-1111-4111-8111-111111111111",
        deviceSecret: "ogd_desktop_secret_once_abcdefghijklmnopqrstuvwxyz",
        deviceSecretHint: "ogd_abcd...7890",
      }),
    ).rejects.toThrow(/desktop app/i);

    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("polls remote companion jobs with only public Supabase config over IPC", async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.invoke.mockResolvedValue({
      claimed: 1,
      configured: true,
      failed: 0,
      jobs: [
        {
          gameId: "store-demo-game",
          jobId: "33333333-3333-4333-8333-333333333333",
          localQueueId: "download-store-demo-game",
          message: "Download started.",
          status: "started",
        },
      ],
      started: 1,
    });

    const { pollRemoteCompanionInstallJobsOnce } = await import("./launcher");
    const result = await pollRemoteCompanionInstallJobsOnce(3);

    expect(mocks.invoke).toHaveBeenCalledWith("remote_companion_poll_once", {
      input: {
        apiKey: "anon-public-key",
        limit: 3,
        supabaseUrl: "https://project.supabase.co",
      },
    });
    const input = mocks.invoke.mock.calls[0][1]?.input as Record<string, unknown>;
    expect(Object.keys(input).sort()).toEqual(["apiKey", "limit", "supabaseUrl"]);
    expect(JSON.stringify(input)).not.toMatch(/accessToken|deviceSecret|userId|service_role/i);
    expect(result.started).toBe(1);
  });

  it("returns an unconfigured browser fallback for companion polling", async () => {
    mocks.isTauri.mockReturnValue(false);

    const { pollRemoteCompanionInstallJobsOnce } = await import("./launcher");
    await expect(pollRemoteCompanionInstallJobsOnce()).resolves.toEqual({
      claimed: 0,
      configured: false,
      failed: 0,
      jobs: [],
      started: 0,
    });

    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("rejects polling when Supabase config is missing", async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.supabaseConfig.supabaseConfigError = "Missing VITE_SUPABASE_URL";
    mocks.supabaseConfig.supabaseUrl = undefined as unknown as string;

    const { pollRemoteCompanionInstallJobsOnce } = await import("./launcher");
    await expect(pollRemoteCompanionInstallJobsOnce()).rejects.toThrow(/Missing VITE_SUPABASE_URL/);

    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
