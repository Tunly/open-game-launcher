import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { isTauri } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";

import {
  APP_SHELL_SKIN_STORAGE_KEY,
  notifyAppShellSkinChanged,
  writeAppShellSkinId,
} from "../../lib/app-shell-skins";
import { AppShell } from "./AppShell";

const tauriWindowMock = vi.hoisted(() => ({
  currentWindow: {
    close: vi.fn(() => Promise.resolve()),
    isMaximized: vi.fn(() => Promise.resolve(false)),
    minimize: vi.fn(() => Promise.resolve()),
    startDragging: vi.fn(() => Promise.resolve()),
    toggleMaximize: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => undefined)),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => tauriWindowMock.currentWindow),
}));

vi.mock("../../lib/launcher", () => ({
  getDownloadQueue: vi.fn(() => Promise.resolve([])),
  runBackupPlan: vi.fn(() => Promise.resolve({ manifestId: "manifest", message: "Backup done" })),
  runScheduledPlatformClientUpdateChecks: vi.fn(() =>
    Promise.resolve({ checkedAt: "2026-06-12T10:00:00.000Z", message: "", updateCount: 0 }),
  ),
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
    for (const label of ["Store", "Library", "Community", "Downloads"]) {
      expect(within(header).getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("keeps the brand row above the primary navigation row", () => {
    renderShell();

    const header = screen.getByRole("banner");
    const brandRow = header.querySelector(".app-shell-brand-row");
    const navRow = header.querySelector(".app-shell-nav-row");

    expect(header).toHaveClass("flex-col");
    expect(brandRow).toContainElement(within(header).getByRole("button", { name: "OG-Launcher" }));
    expect(navRow).toContainElement(within(header).getByRole("button", { name: "Library" }));
    expect(navRow).toContainElement(within(header).getByRole("button", { name: "Notifications" }));
    expect(navRow).toContainElement(within(header).getByRole("button", { name: "Login" }));
    expect(brandRow).not.toContainElement(
      within(header).getByRole("button", { name: "Notifications" }),
    );
    expect(brandRow?.nextElementSibling).toBe(navRow);
  });

  it("shows an honest empty notification feed without invented account events", () => {
    window.localStorage.clear();
    renderShell({ isAuthenticated: true });

    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));

    const dialog = screen.getByRole("dialog", { name: "Notifications" });
    expect(within(dialog).getByText(/no launcher notifications yet/i)).toBeInTheDocument();
    expect(
      within(dialog).queryByText("Akira's Revenge is ready to launch."),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByText("Neo-Tokyo Drift has a new content pack."),
    ).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/three new indie titles/i)).not.toBeInTheDocument();
  });

  it("places desktop window controls in the header brand row without a separate title bar", async () => {
    const { container } = renderShell({ isDesktop: true });

    const header = screen.getByRole("banner");
    const brandRow = header.querySelector(".app-shell-brand-row");

    expect(container.querySelector(".app-shell-titlebar")).not.toBeInTheDocument();
    expect(await within(header).findByRole("button", { name: "Minimize" })).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: "Maximize" })).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(brandRow).toContainElement(within(header).getByRole("button", { name: "Close" }));
    expect(brandRow?.querySelector(".app-window-controls")).toBeInTheDocument();
    expect(brandRow?.querySelector(".app-window-controls")).not.toHaveClass("border-[3px]");
    expect(brandRow?.querySelector(".app-window-control-button")).toHaveClass(
      "border-transparent",
      "bg-transparent",
    );
    const dragRegion = brandRow?.querySelector("[data-tauri-drag-region]");
    expect(dragRegion).toBeInTheDocument();
    expect(dragRegion).toHaveClass("self-stretch", "min-h-8");

    tauriWindowMock.currentWindow.startDragging.mockClear();
    fireEvent.mouseDown(dragRegion as Element, { button: 0 });
    expect(tauriWindowMock.currentWindow.startDragging).toHaveBeenCalledTimes(1);
  });

  it("sizes the library shell from the real header height instead of a fixed viewport subtraction", () => {
    const { container } = renderShell();

    const shell = container.querySelector(".app-shell-root");
    const shellFrame = shell?.firstElementChild;
    const header = screen.getByRole("banner");
    const main = container.querySelector(".app-library-main");

    expect(shell).toHaveClass("h-screen", "min-h-0", "overflow-hidden");
    expect(shell).not.toHaveClass("min-h-screen");
    expect(shellFrame).toHaveClass("flex", "h-full", "min-h-0", "flex-col", "overflow-hidden");
    expect(header).toHaveClass("shrink-0");
    expect(main).toHaveClass("flex-1", "overflow-hidden");
    expect(main?.className).not.toContain("h-[calc(100vh-80px)]");
  });
});

function renderShell({
  isDesktop = false,
  isAuthenticated = false,
}: {
  isDesktop?: boolean;
  isAuthenticated?: boolean;
} = {}) {
  vi.mocked(isTauri).mockReturnValue(isDesktop);

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
      isAuthenticated={isAuthenticated}
      subtitle="Local shell skin test"
      title="OG-Launcher"
      onLogout={() => Promise.resolve()}
      onNavigate={() => undefined}
    >
      <div>Library content</div>
    </AppShell>,
  );
}
