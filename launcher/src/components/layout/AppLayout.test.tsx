import { render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  APP_SHELL_SKIN_CHANGED_EVENT,
  APP_SHELL_SKIN_STORAGE_KEY,
} from "../../lib/app-shell-skins";

const mocks = vi.hoisted(() => ({
  getMyProfile: vi.fn(),
  useCurrentUser: vi.fn(),
}));

vi.mock("../../hooks/useCurrentUser", () => ({
  useCurrentUser: mocks.useCurrentUser,
}));

vi.mock("../../lib/supabase/profile", () => ({
  getMyProfile: mocks.getMyProfile,
}));

vi.mock("./AppShell", () => ({
  AppShell: ({ activePage, children }: { activePage: string; children: ReactNode }) => (
    <div data-active-page={activePage}>{children}</div>
  ),
}));

import { AppLayout } from "./AppLayout";

describe("AppLayout hosted shell skin hydration", () => {
  beforeEach(() => {
    mocks.getMyProfile.mockReset();
    mocks.useCurrentUser.mockReset();
    mocks.useCurrentUser.mockReturnValue({
      isConfigured: true,
      isLoading: false,
      signOut: vi.fn(),
      user: {
        email: "player@example.test",
        id: "user-1",
        user_metadata: {},
      },
    });
    mocks.getMyProfile.mockResolvedValue({
      appShellSkinId: "redline-print",
      username: "hosted-player",
    });
  });

  it("hydrates the browser-local shell skin from the current hosted profile", async () => {
    const eventSpy = vi.fn();
    window.addEventListener(APP_SHELL_SKIN_CHANGED_EVENT, eventSpy);

    render(
      <MemoryRouter initialEntries={["/library"]}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/library" element={<div>Library</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(window.localStorage.getItem(APP_SHELL_SKIN_STORAGE_KEY)).toBe("redline-print");
      expect(eventSpy).toHaveBeenCalled();
    });

    window.removeEventListener(APP_SHELL_SKIN_CHANGED_EVENT, eventSpy);
  });

  it("falls back to the home page key for unknown routes", () => {
    mocks.useCurrentUser.mockReturnValue({
      isConfigured: false,
      isLoading: false,
      signOut: vi.fn(),
      user: null,
    });

    const { container } = render(
      <MemoryRouter initialEntries={["/retired-feature"]}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/retired-feature" element={<div>Removed feature route</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(container.querySelector("[data-active-page]")).toHaveAttribute(
      "data-active-page",
      "home",
    );
  });
});
