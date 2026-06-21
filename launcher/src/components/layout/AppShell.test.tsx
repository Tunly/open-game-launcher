import { act, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  APP_SHELL_SKIN_STORAGE_KEY,
  notifyAppShellSkinChanged,
  writeAppShellSkinId,
} from "../../lib/app-shell-skins";
import { AppShell } from "./AppShell";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

vi.mock("../../lib/launcher", () => ({
  getDownloadQueue: vi.fn(() => Promise.resolve([])),
  runBackupPlan: vi.fn(() => Promise.resolve({ manifestId: "manifest", message: "Backup done" })),
  runScheduledPlatformClientUpdateChecks: vi.fn(() =>
    Promise.resolve({ checkedAt: "2026-06-12T10:00:00.000Z", message: "", updateCount: 0 }),
  ),
}));

vi.mock("./RemoteCompanionAutoPollHost", () => ({
  RemoteCompanionAutoPollHost: () => null,
}));

describe("AppShell browser-local shell skins", () => {
  it("applies the stored shell skin to the shell root and document", () => {
    window.localStorage.setItem(APP_SHELL_SKIN_STORAGE_KEY, "teal-print");

    const { container, unmount } = renderShell();
    const shell = container.querySelector("[data-og-shell-skin]");

    expect(shell).toHaveAttribute("data-og-shell-skin", "teal-print");
    expect(document.documentElement.dataset.ogShellSkin).toBe("teal-print");

    unmount();

    expect(document.documentElement.dataset.ogShellSkin).toBeUndefined();
  });

  it("updates when the browser-only shell skin event fires", () => {
    const { container } = renderShell();
    const shell = container.querySelector("[data-og-shell-skin]");

    expect(shell).toHaveAttribute("data-og-shell-skin", "retro-paper");

    act(() => {
      const skinId = writeAppShellSkinId("redline-print");
      notifyAppShellSkinChanged(skinId);
    });

    expect(shell).toHaveAttribute("data-og-shell-skin", "redline-print");
  });

  it("keeps the OG-Launcher brand and required primary nav in the header", () => {
    renderShell();

    const header = screen.getByRole("banner");
    expect(within(header).getByRole("button", { name: "OG-Launcher" })).toBeInTheDocument();
    for (const label of ["Store", "Library", "Community", "Downloads", "Controllers"]) {
      expect(within(header).getByRole("button", { name: label })).toBeInTheDocument();
    }
  });
});

function renderShell() {
  return render(
    <AppShell
      activePage="library"
      authAvatarUrl={null}
      authDisplayName={null}
      authEmail={null}
      authProfilePath={null}
      authUsername={null}
      isAuthConfigured={false}
      isAuthLoading={false}
      isAuthProfileLoading={false}
      isAuthenticated={false}
      subtitle="Local shell skin test"
      title="OG-Launcher"
      onLogout={() => Promise.resolve()}
      onNavigate={() => undefined}
    >
      <div>Library content</div>
    </AppShell>,
  );
}
