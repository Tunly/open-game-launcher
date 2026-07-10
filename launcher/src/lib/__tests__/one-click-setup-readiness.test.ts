import { describe, expect, it } from "vitest";

import { buildOneClickSetupReadiness } from "../one-click-setup-readiness";

describe("buildOneClickSetupReadiness", () => {
  it("keeps the setup tape order stable for rollback/audit packets", () => {
    const readiness = buildOneClickSetupReadiness({
      backupReminderConfigured: true,
      installDir: "/games",
      isDesktopRuntime: true,
      librarySnapshotCount: 3,
      platforms: [{ gamesCount: 12, id: "steam", label: "Steam", linked: true }],
      supabaseConfigured: true,
    });

    expect(readiness.steps.map((step) => step.id)).toEqual([
      "desktop-runtime",
      "install-target",
      "platform-links",
      "library-seed",
      "backup-restore",
      "cloud-account",
    ]);
  });

  it("blocks native setup in browser preview while preserving actionable warnings", () => {
    const readiness = buildOneClickSetupReadiness({
      backupReminderConfigured: false,
      installDir: "Desktop app manages native install folders.",
      isDesktopRuntime: false,
      librarySnapshotCount: 0,
      platforms: [],
      supabaseConfigured: false,
    });

    expect(readiness.blockedCount).toBe(1);
    expect(readiness.warningCount).toBe(4);
    expect(readiness.nextAction).toBe("Open the Tauri desktop app.");
    expect(readiness.steps.find((step) => step.id === "desktop-runtime")?.status).toBe("blocked");
  });

  it("counts linked platform imports and local library snapshots as a setup seed", () => {
    const readiness = buildOneClickSetupReadiness({
      backupReminderConfigured: true,
      installDir: "/games",
      isDesktopRuntime: true,
      librarySnapshotCount: 3,
      platforms: [
        { gamesCount: 12, id: "steam", label: "Steam", linked: true },
        { id: "gog", label: "GOG", linked: false },
      ],
      supabaseConfigured: true,
    });

    expect(readiness.blockedCount).toBe(0);
    expect(readiness.readyCount).toBe(6);
    expect(readiness.progress).toBe(100);
    expect(readiness.summary).toBe(
      "One-Click Setup can replay the local launcher bootstrap checklist.",
    );
    expect(readiness.steps.find((step) => step.id === "library-seed")?.detail).toBe(
      "15 local game records staged.",
    );
  });

  it("keeps a selected install folder in review until a native consumer applies it", () => {
    const readiness = buildOneClickSetupReadiness({
      backupReminderConfigured: true,
      installDir: "D:\\OG Games",
      installDirApplied: false,
      isDesktopRuntime: true,
      librarySnapshotCount: 3,
      platforms: [{ gamesCount: 12, id: "steam", label: "Steam", linked: true }],
      supabaseConfigured: true,
    });

    const installTarget = readiness.steps.find((step) => step.id === "install-target");
    expect(installTarget).toEqual(
      expect.objectContaining({
        action: "Keep this selection in review until a native install-path setter consumes it.",
        detail: "D:\\OG Games is selected for review only and is not applied to installs.",
        status: "warning",
      }),
    );
    expect(readiness.progress).toBe(83);
  });

  it("keeps setup as warning-only when desktop is ready but stores are not linked", () => {
    const readiness = buildOneClickSetupReadiness({
      backupReminderConfigured: true,
      installDir: "/games",
      isDesktopRuntime: true,
      librarySnapshotCount: 0,
      platforms: [],
      supabaseConfigured: false,
    });

    expect(readiness.blockedCount).toBe(0);
    expect(readiness.warningCount).toBe(3);
    expect(readiness.nextAction).toBe("Connect at least one game platform.");
  });
});
