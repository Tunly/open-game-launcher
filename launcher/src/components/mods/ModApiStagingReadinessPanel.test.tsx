import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createVerifyModApiStagingReadiness } from "../../lib/mod-api-staging-readiness";
import type { ModProviderStagingProbeResult } from "../../lib/types/mods";
import { ModApiStagingReadinessPanel } from "./ModApiStagingReadinessPanel";

describe("ModApiStagingReadinessPanel", () => {
  it("renders local provider API staging gates without live API claims", () => {
    render(<ModApiStagingReadinessPanel readiness={createVerifyModApiStagingReadiness()} />);

    const panel = screen.getByRole("region", { name: /mod provider api key staging readiness/i });

    expect(within(panel).getByText("API Staging Readiness")).toBeInTheDocument();
    expect(within(panel).getByText("Keychain Slot")).toBeInTheDocument();
    expect(within(panel).getByText("Provider ID Map")).toBeInTheDocument();
    expect(within(panel).getByText("mod.io Key")).toBeInTheDocument();
    expect(within(panel).getByText("CurseForge Key")).toBeInTheDocument();
    expect(within(panel).getByText("Terms + Limits")).toBeInTheDocument();
    expect(within(panel).getByText("Overwolf Handoff")).toBeInTheDocument();
    expect(within(panel).getByText("No real provider key configured")).toBeInTheDocument();
    expect(within(panel).getByText("No live mod.io/CurseForge API call")).toBeInTheDocument();
    expect(within(panel).getByText("No hosted moderation/download claim")).toBeInTheDocument();
    expect(
      within(panel).getByText("No Overwolf/CurseForge direct-download claim"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Keys stay out of Supabase")).toBeInTheDocument();
    expect(within(panel).getByText("Local Response Fixture")).toBeInTheDocument();
    expect(within(panel).getByText("Terms + Limits Policy")).toBeInTheDocument();
    expect(within(panel).getByText("One-result staging requests")).toBeInTheDocument();
    expect(within(panel).getByText("429/provider errors use capped retry")).toBeInTheDocument();
    expect(
      within(panel).getByText("Provider terms review required before rollout"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Provider Response Review")).toBeInTheDocument();
    expect(within(panel).getByText("No live call")).toBeInTheDocument();
    expect(within(panel).getByText("mod.io Response Shape")).toBeInTheDocument();
    expect(within(panel).getByText("CurseForge Response Shape")).toBeInTheDocument();
    expect(within(panel).getAllByText("Direct archive URL").length).toBeGreaterThanOrEqual(2);
    expect(within(panel).getAllByText("Raw file CDN host").length).toBeGreaterThanOrEqual(2);
    expect(panel).not.toHaveTextContent(
      /api key verified|provider request sent|curseforge direct download ready|provider telemetry synced/i,
    );
    expect(panel).not.toHaveTextContent(/downloadUrl|edge\.forgecdn\.net|apiKey|super-secret/i);
  });

  it("renders redacted provider staging probe telemetry without secret URLs", () => {
    const probe: ModProviderStagingProbeResult = {
      directDownloadCount: 1,
      durationMs: 48,
      guards: [
        "API key redacted",
        "Single-result staging probe",
        "No direct-download URL exposed to UI/logs",
      ],
      liveRequestAttempted: true,
      message: "CurseForge staging probe returned 1 result with redacted telemetry.",
      pageSize: 1,
      provider: "curseforge",
      providerAppHandoffCount: 1,
      providerGameId: "432",
      queryHint: "ui",
      redactedRequest:
        "GET https://api.curseforge.com/v1/mods/search?gameId=432&searchFilter=ui&pageSize=1&index=0 x-api-key=<redacted>",
      resultCount: 1,
      status: "ready",
    };

    render(
      <ModApiStagingReadinessPanel
        readiness={createVerifyModApiStagingReadiness()}
        stagingProbe={probe}
      />,
    );

    const panel = screen.getByRole("region", { name: /mod provider api key staging readiness/i });

    expect(within(panel).getByText("Provider Staging Probe")).toBeInTheDocument();
    expect(
      within(panel).getByText(
        "CurseForge staging probe returned 1 result with redacted telemetry.",
      ),
    ).toBeInTheDocument();
    expect(within(panel).getByText(/x-api-key=<redacted>/i)).toBeInTheDocument();
    expect(
      within(panel).getByText("No direct-download URL exposed to UI/logs"),
    ).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(/super-secret|edge\.forgecdn\.net|downloadUrl/i);
  });
});
