import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { buildOneClickSetupReadiness } from "../../lib/one-click-setup-readiness";
import { OneClickSetupReadinessPanel } from "./OneClickSetupReadinessPanel";

describe("OneClickSetupReadinessPanel", () => {
  it("renders the local setup checklist and next action", () => {
    const readiness = buildOneClickSetupReadiness({
      backupReminderConfigured: true,
      installDir: "D:\\OGLauncher\\Games",
      isDesktopRuntime: true,
      librarySnapshotCount: 18,
      platforms: [
        { gamesCount: 42, id: "steam", label: "Steam", linked: true },
        { gamesCount: 12, id: "gog", label: "GOG", linked: true },
      ],
      supabaseConfigured: true,
    });

    render(<OneClickSetupReadinessPanel readiness={readiness} />);

    expect(screen.getByRole("region", { name: /one-click setup readiness/i })).toBeVisible();
    expect(screen.getByText("New PC Setup Tape")).toBeInTheDocument();
    expect(screen.getByText("Setup tape is ready for first launch.")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("72 local game records staged.")).toBeInTheDocument();
  });
});
