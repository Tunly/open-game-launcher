import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LauncherUpdatePanel } from "./LauncherUpdatePanel";

const updaterMocks = vi.hoisted(() => ({
  check: vi.fn(),
  install: vi.fn(),
  state: {
    status: "idle",
    currentVersion: null,
    latestVersion: null,
    notes: null,
    progress: null,
    error: null,
    unsupportedReason: null,
    lastCheckedAt: null,
  } as Record<string, unknown>,
}));

vi.mock("../../stores/launcherUpdateStore", () => ({
  checkForLauncherUpdate: updaterMocks.check,
  installLauncherUpdate: updaterMocks.install,
  useLauncherUpdateStore: () => updaterMocks.state,
}));

describe("LauncherUpdatePanel", () => {
  beforeEach(() => {
    updaterMocks.check.mockReset();
    updaterMocks.install.mockReset();
    updaterMocks.state = {
      status: "idle",
      currentVersion: null,
      latestVersion: null,
      notes: null,
      progress: null,
      error: null,
      unsupportedReason: null,
      lastCheckedAt: null,
    };
  });

  it("shows the Windows-only browser guard and still offers a manual retry", () => {
    updaterMocks.state = {
      ...updaterMocks.state,
      status: "unsupported",
      currentVersion: "0.1.0",
      unsupportedReason: "Self-update is available in the installed Windows app only.",
    };

    render(<LauncherUpdatePanel />);

    const panel = screen.getByRole("region", { name: /og launcher update/i });
    expect(within(panel).getByText("v0.1.0")).toBeInTheDocument();
    expect(within(panel).getByText("Windows Only")).toBeInTheDocument();
    expect(within(panel).getByText(/installed Windows app only/i)).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /install/i })).toBeDisabled();

    fireEvent.click(within(panel).getByRole("button", { name: /check/i }));
    expect(updaterMocks.check).toHaveBeenCalledOnce();
  });

  it("requires confirmation before installing an available signed update", () => {
    updaterMocks.state = {
      ...updaterMocks.state,
      status: "available",
      currentVersion: "0.1.0",
      latestVersion: "0.2.0",
      notes: "Signed release notes",
    };

    render(<LauncherUpdatePanel />);
    const panel = screen.getByRole("region", { name: /og launcher update/i });

    expect(within(panel).getByText("v0.2.0")).toBeInTheDocument();
    expect(within(panel).getByText("Signed release notes")).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: /install/i }));

    const dialog = screen.getByRole("dialog", { name: /install launcher update/i });
    expect(within(dialog).getByText(/v0.2.0/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /not now/i }));
    expect(updaterMocks.install).not.toHaveBeenCalled();

    fireEvent.click(within(panel).getByRole("button", { name: /install/i }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: /install launcher update/i })).getByRole("button", {
        name: /download & restart/i,
      }),
    );
    expect(updaterMocks.install).toHaveBeenCalledOnce();
  });

  it("shows byte progress without inventing a percentage for unknown totals", () => {
    updaterMocks.state = {
      ...updaterMocks.state,
      status: "downloading",
      currentVersion: "0.1.0",
      latestVersion: "0.2.0",
      progress: { downloadedBytes: 1_048_576, totalBytes: null, percentage: null },
    };

    render(<LauncherUpdatePanel />);

    const progress = screen.getByLabelText(/update download progress/i);
    expect(progress).toHaveTextContent("1.0 MB");
    expect(progress).not.toHaveTextContent("NaN");
  });
});
