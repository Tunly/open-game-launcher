import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createVerifyAppWideThemeReadiness } from "../../lib/app-wide-theme-readiness";
import { AppWideThemeReadinessPanel } from "./AppWideThemeReadinessPanel";

describe("AppWideThemeReadinessPanel", () => {
  it("renders local app-wide theme gates without hosted shell skin claims", () => {
    render(<AppWideThemeReadinessPanel readiness={createVerifyAppWideThemeReadiness()} />);

    const panel = screen.getByRole("region", {
      name: /app-wide theme\/skin readiness/i,
    });

    expect(within(panel).getByText("App-Wide Theme")).toBeInTheDocument();
    expect(within(panel).getByText("Profile Themes")).toBeInTheDocument();
    expect(within(panel).getByText("Local Draft")).toBeInTheDocument();
    expect(within(panel).getByText("Design Guard")).toBeInTheDocument();
    expect(within(panel).getByText("Shell Skin Switch")).toBeInTheDocument();
    expect(within(panel).getByText("Import + Export")).toBeInTheDocument();
    expect(within(panel).getByText("Hosted Sync")).toBeInTheDocument();
    expect(within(panel).getByText("Rollback")).toBeInTheDocument();
    expect(within(panel).getByText("Browser-only shell skin selected")).toBeInTheDocument();
    expect(within(panel).getByText("Local custom theme JSON only")).toBeInTheDocument();
    expect(within(panel).getByText("Shell-skin query-shape evidence only")).toBeInTheDocument();
    expect(
      within(panel).getByText("Custom-theme draft query-shape evidence only"),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText("profile_theme_id query-shape evidence only"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("No live profile-theme persistence")).toBeInTheDocument();
    expect(within(panel).getByText("Browser-only default-skin reset only")).toBeInTheDocument();
    expect(within(panel).getByText("No marketplace rollback claim")).toBeInTheDocument();
    expect(
      within(panel).getByText(
        "Local JSON import/export is staged with schema and Retro Manga color safety checks.",
      ),
    ).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /(app[- ]?wide (?:theme|skin) (?:enabled|synced|ready|active)|shell skin (?:enabled|ready)|custom theme (?:loaded|installed|ready)|theme (?:import|export) (?:complete|ready|succeeded)|profile_theme_id (?:persisted|synced|verified|written)|hosted profile theme (?:persisted|synced|verified|ready)|live theme sync(?:ed| ready| complete)|custom theme safety verified|arbitrary css theme accepted|rollback (?:verified|complete|ready)|theme rollback (?:verified|complete|ready))/i,
    );
  });
});
