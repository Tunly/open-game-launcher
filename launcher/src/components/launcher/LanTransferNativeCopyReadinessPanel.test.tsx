import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createVerifyLanTransferNativeCopyReadiness } from "../../lib/lan-transfer-native-copy-readiness";
import { LanTransferNativeCopyReadinessPanel } from "./LanTransferNativeCopyReadinessPanel";

describe("LanTransferNativeCopyReadinessPanel", () => {
  it("renders local LAN copy proof without peer discovery or network automation claims", () => {
    render(
      <LanTransferNativeCopyReadinessPanel
        readiness={createVerifyLanTransferNativeCopyReadiness()}
      />,
    );

    const panel = screen.getByRole("region", {
      name: /lan transfer native readiness/i,
    });

    expect(within(panel).getByText("LAN Native Copy")).toBeInTheDocument();
    expect(within(panel).getByText("Local Peer Planner")).toBeInTheDocument();
    expect(within(panel).getByText("Pairing Trust")).toBeInTheDocument();
    expect(within(panel).getByText("Peer Discovery")).toBeInTheDocument();
    expect(within(panel).getByText("Copy Engine")).toBeInTheDocument();
    expect(within(panel).getByText("Resume + Cancel")).toBeInTheDocument();
    expect(within(panel).getByText("Firewall Handling")).toBeInTheDocument();
    expect(within(panel).getByText("Manifest Verification")).toBeInTheDocument();
    expect(within(panel).getByText("Peer Discovery Preflight")).toBeInTheDocument();
    expect(within(panel).getByText("mDNS Private LAN")).toBeInTheDocument();
    expect(within(panel).getByText("Relay Lookup")).toBeInTheDocument();
    expect(within(panel).getByText("Manual Share Path")).toBeInTheDocument();
    expect(within(panel).getByText("No UDP broadcast is sent")).toBeInTheDocument();
    expect(within(panel).getByText("No relay request is executed")).toBeInTheDocument();
    expect(within(panel).getByText("Candidate endpoints stay redacted")).toBeInTheDocument();
    expect(within(panel).getByText("Firewall + Discovery Policy")).toBeInTheDocument();
    expect(within(panel).getByText("No automatic inbound rule creation")).toBeInTheDocument();
    expect(
      within(panel).getByText("Port probes stay redacted and rate-limited"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Manual OS instructions before rollout")).toBeInTheDocument();
    expect(within(panel).getByText("Windows")).toBeInTheDocument();
    expect(within(panel).getByText("macOS")).toBeInTheDocument();
    expect(within(panel).getByText("Linux")).toBeInTheDocument();
    expect(within(panel).getByText("No live LAN peer broadcast")).toBeInTheDocument();
    expect(within(panel).getByText("No trusted pairing exchange")).toBeInTheDocument();
    expect(within(panel).getByText("No firewall rule changes")).toBeInTheDocument();
    expect(within(panel).getByText("Local copy-job cancel only")).toBeInTheDocument();
    expect(within(panel).getByText("No automatic network share mount")).toBeInTheDocument();
    expect(
      within(panel).getByText(/Desktop can copy from a reachable source path/i),
    ).toBeInTheDocument();
    expect(within(panel).getByText(/start cancellable local copy jobs/i)).toBeInTheDocument();
    expect(
      within(panel).getByText(/writes og-manifest\.json after verification/i),
    ).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /broadcast sent|relay called|peer selected|share mounted|peer discovery active|trusted pairing established|network copy started|peer transfer resumed|peer transfer cancelled|cleanup auto-deleted|firewall opened|firewall rule applied|manifest verified|copy complete/i,
    );
  });
});
