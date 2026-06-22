import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createVerifyOverlayE2EReadiness } from "../../lib/overlay-e2e-readiness";
import { OverlayE2EReadinessPanel } from "./OverlayE2EReadinessPanel";

describe("OverlayE2EReadinessPanel", () => {
  it("renders local overlay E2E gates without live overlay or hosted claims", () => {
    render(<OverlayE2EReadinessPanel readiness={createVerifyOverlayE2EReadiness()} />);

    const panel = screen.getByRole("region", { name: /overlay e2e readiness/i });

    expect(within(panel).getByText("Overlay E2E Readiness")).toBeInTheDocument();
    expect(within(panel).getByText("Overlay Runtime Attribution")).toBeInTheDocument();
    expect(within(panel).getByText("Local Perf History")).toBeInTheDocument();
    expect(within(panel).getByText("Activity Cross-Filter")).toBeInTheDocument();
    expect(within(panel).getByText("Session Flush Contract")).toBeInTheDocument();
    expect(within(panel).getByText("Local Flush Proof")).toBeInTheDocument();
    expect(within(panel).getByText("300 sample cap")).toBeInTheDocument();
    expect(within(panel).getByText("close-overlay")).toBeInTheDocument();
    expect(within(panel).getByText("External Overlay Window E2E")).toBeInTheDocument();
    expect(within(panel).getByText("Long Native Session")).toBeInTheDocument();
    expect(within(panel).getByText("Supabase Session E2E")).toBeInTheDocument();
    expect(within(panel).getByText("Anti-Cheat Fallback E2E")).toBeInTheDocument();
    expect(
      within(panel).getByText(/Blocked-title fallback UI evidence is attached/i),
    ).toBeInTheDocument();
    expect(within(panel).getByText("No live overlay E2E")).toBeInTheDocument();
    expect(within(panel).getByText("No external window proof")).toBeInTheDocument();
    expect(within(panel).getAllByText("No long-running native session").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("No Supabase write/read proof").length).toBeGreaterThan(0);
    expect(within(panel).getByText("No anti-cheat compatibility claim")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /live overlay (verified|passed|ready\b|opened)|external overlay window (opened|verified|ready\b)|long-running native session (passed|verified|ready\b)|supabase (write\/read|session) (passed|verified|ready\b)|anti-cheat compatibility (verified|ready\b|passed)/i,
    );
  });
});
