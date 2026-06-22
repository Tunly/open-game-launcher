import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createVerifySmartInstallProviderTelemetryReadiness } from "../../lib/smart-install-provider-telemetry-readiness";
import { SmartInstallProviderTelemetryReadinessPanel } from "./SmartInstallProviderTelemetryReadinessPanel";

describe("SmartInstallProviderTelemetryReadinessPanel", () => {
  it("renders local provider telemetry gates without live provider or download claims", () => {
    render(
      <SmartInstallProviderTelemetryReadinessPanel
        readiness={createVerifySmartInstallProviderTelemetryReadiness()}
      />,
    );

    const panel = screen.getByRole("region", {
      name: /smart install provider telemetry readiness/i,
    });

    expect(within(panel).getByText("Smart Install Telemetry")).toBeInTheDocument();
    expect(within(panel).getByText("Local Planner")).toBeInTheDocument();
    expect(within(panel).getByText("Source Scoring")).toBeInTheDocument();
    expect(within(panel).getByText("Dry-Run Packet")).toBeInTheDocument();
    expect(within(panel).getByText("Provider Telemetry")).toBeInTheDocument();
    expect(within(panel).getByText("Entitlement Check")).toBeInTheDocument();
    expect(within(panel).getByText("Mirror Measurement")).toBeInTheDocument();
    expect(within(panel).getByText("Provider Telemetry Dry-Run Contract")).toBeInTheDocument();
    expect(within(panel).getByText("No-Write Fixture Packet")).toBeInTheDocument();
    expect(within(panel).getByText("No-Write Mirror Audit")).toBeInTheDocument();
    expect(within(panel).getByText("Local Mirror Measurement + Rank Diff")).toBeInTheDocument();
    expect(within(panel).getByText("Entitlement + CDN Shape")).toBeInTheDocument();
    expect(within(panel).getByText("Offline Installer Shape")).toBeInTheDocument();
    expect(within(panel).getByText("LAN Peer Source Shape")).toBeInTheDocument();
    expect(within(panel).getAllByText("Writes")).toHaveLength(2);
    expect(within(panel).getAllByText("Live Calls")).toHaveLength(2);
    expect(within(panel).getAllByText("none")).toHaveLength(4);
    expect(within(panel).getByText(/access_token=<redacted>/i)).toBeInTheDocument();
    expect(within(panel).getByText(/bearer=<redacted>/i)).toBeInTheDocument();
    expect(within(panel).getByText(/peer=<redacted>/i)).toBeInTheDocument();
    expect(
      within(panel).getByText("https://downloads.og-launcher.local/<redacted-path>"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("lan://<redacted-peer>/<redacted-path>")).toBeInTheDocument();
    expect(
      within(panel).getByText("https://steam.example.invalid/<redacted-path>"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Fastest fixture: lan-peer-cache")).toBeInTheDocument();
    expect(within(panel).getByText("Rank 1 to 1")).toBeInTheDocument();
    expect(
      within(panel).getByText(/Dry-run signals can explain local scores/i),
    ).toBeInTheDocument();
    expect(within(panel).getByText(/Confirm consent text/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Treat rank deltas as review evidence/i)).toBeInTheDocument();
    expect(within(panel).getByText("No live provider telemetry")).toBeInTheDocument();
    expect(within(panel).getByText("No entitlement API call")).toBeInTheDocument();
    expect(within(panel).getByText("No live mirror speed measurement")).toBeInTheDocument();
    expect(within(panel).getByText("No provider ranking sync")).toBeInTheDocument();
    expect(within(panel).getByText("No auto-purchase/download claim")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /live telemetry ready|entitlement verified|provider ranking synced|download started|auto purchase|signed ticket|raw token|direct download url|ticket=|auth=|secret-fixture/i,
    );
  });
});
