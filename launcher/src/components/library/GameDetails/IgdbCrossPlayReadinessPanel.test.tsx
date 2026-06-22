import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createVerifyIgdbCrossPlayReadinessPlan } from "../../../lib/igdb-cross-play-readiness";
import { IgdbCrossPlayReadinessPanel } from "./IgdbCrossPlayReadinessPanel";

describe("IgdbCrossPlayReadinessPanel", () => {
  it("renders local import candidates and guards without live IGDB claims", () => {
    render(<IgdbCrossPlayReadinessPanel plan={createVerifyIgdbCrossPlayReadinessPlan()} />);

    const panel = screen.getByRole("region", { name: /igdb cross-play readiness/i });

    expect(within(panel).getByText("IGDB Cross-Play")).toBeInTheDocument();
    expect(within(panel).getByText("Steam PC Row")).toBeInTheDocument();
    expect(within(panel).getByText("Xbox Console Row")).toBeInTheDocument();
    expect(within(panel).getByText("Steam Conflicting Row")).toBeInTheDocument();
    expect(within(panel).getByText("Steam Duplicate ID Row")).toBeInTheDocument();
    expect(within(panel).getByText("Steam Platform Duplicate Row")).toBeInTheDocument();
    expect(within(panel).getByText("Switch Candidate")).toBeInTheDocument();
    expect(within(panel).getByText("Unknown Platform")).toBeInTheDocument();
    expect(within(panel).getByText("Staged Import Preview")).toBeInTheDocument();
    expect(within(panel).getByText("Sync Contract")).toBeInTheDocument();
    expect(within(panel).getByText("Preview only")).toBeInTheDocument();
    expect(within(panel).getByText("supabase write blocked")).toBeInTheDocument();
    expect(within(panel).getByText("Supabase write: blocked")).toBeInTheDocument();
    expect(within(panel).getByText("Hosted sync: not claimed")).toBeInTheDocument();
    expect(within(panel).getByText("Hosted Sync")).toBeInTheDocument();
    expect(within(panel).getByText("Review Issues")).toBeInTheDocument();
    expect(within(panel).getByText("game_cross_play // steam // unverified")).toBeInTheDocument();
    expect(within(panel).getByText("game_cross_play // xbox // unverified")).toBeInTheDocument();
    expect(within(panel).getByText("games.external_ids // steam:1091500")).toBeInTheDocument();
    expect(within(panel).getByText("games.external_ids // igdb:steam-alt-001")).toBeInTheDocument();
    expect(within(panel).getAllByText("games.external_ids issue // steam")).toHaveLength(2);
    expect(within(panel).getByText("game_cross_play issue // steam")).toBeInTheDocument();
    expect(within(panel).getAllByText("Target: games.external_ids")).toHaveLength(2);
    expect(within(panel).getByText("Target: game_cross_play")).toBeInTheDocument();
    expect(within(panel).getAllByText("Key: steam")).toHaveLength(3);
    expect(within(panel).getAllByText("Kept: steam:1091500")).toHaveLength(3);
    expect(within(panel).getByText("Incoming: steam:999999")).toBeInTheDocument();
    expect(within(panel).getByText("Incoming: igdb:steam-alt-001")).toBeInTheDocument();
    expect(within(panel).getByText("Decision: skip incoming")).toBeInTheDocument();
    expect(within(panel).getByText("Decision: dedupe incoming")).toBeInTheDocument();
    expect(within(panel).getByText("Decision: stage external id only")).toBeInTheDocument();
    expect(
      within(panel).getByText("Steam Conflicting Row // conflicting_external_id"),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText("Steam Duplicate ID Row // duplicate_external_id"),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText("Steam Platform Duplicate Row // duplicate_platform"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Switch Candidate // missing_external_id")).toBeInTheDocument();
    expect(within(panel).getByText("Unknown Platform // unmapped_platform")).toBeInTheDocument();
    expect(within(panel).getByText("No IGDB API access")).toBeInTheDocument();
    expect(within(panel).getByText("No Supabase writes")).toBeInTheDocument();
    expect(within(panel).getByText("No provider telemetry")).toBeInTheDocument();
    expect(within(panel).getByText("No hosted sync")).toBeInTheDocument();
    expect(within(panel).getByText("No live cross-play verification")).toBeInTheDocument();
    expect(within(panel).getByText("Preview rows only")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /api connected|live verified|provider telemetry live|hosted sync ready|supabase write complete/i,
    );
  });
});
