import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createVerifyHostedCronEvidenceSummary } from "../../lib/hosted-cron-evidence-summary";
import { HostedCronEvidenceSummaryPanel } from "./HostedCronEvidenceSummaryPanel";

describe("HostedCronEvidenceSummaryPanel", () => {
  it("renders the no-write hosted cron summary without live scheduler claims", () => {
    render(<HostedCronEvidenceSummaryPanel summary={createVerifyHostedCronEvidenceSummary()} />);

    const panel = screen.getByRole("region", { name: /hosted cron evidence summary/i });

    expect(within(panel).getByText("Hosted Cron Evidence")).toBeInTheDocument();
    expect(within(panel).getByText("External Evidence Required")).toBeInTheDocument();
    expect(within(panel).getByText("Price-Drop Scheduler")).toBeInTheDocument();
    expect(within(panel).getByText("Account Deletion Processor")).toBeInTheDocument();
    expect(within(panel).getByText("Presence Polling")).toBeInTheDocument();
    expect(panel).toHaveTextContent("trigger_source=scheduled");
    expect(panel).toHaveTextContent("valid aggregate counts");
    expect(panel).toHaveTextContent("failed_count=0");
    expect(panel).toHaveTextContent("safe Supabase REST target");
    expect(panel).toHaveTextContent("external dashboard/config proof");
    expect(
      within(panel).getByText("Scheduler origin must be trigger_source=scheduled"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Dashboard or config proof required")).toBeInTheDocument();
    expect(
      within(panel).getByText("Manual authorized calls do not substitute"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Missing aggregate count blocks evidence")).toBeInTheDocument();
    expect(within(panel).getByText("Invalid aggregate count blocks evidence")).toBeInTheDocument();
    expect(within(panel).getByText("failed_count must be zero")).toBeInTheDocument();
    expect(within(panel).getByText("Unsafe REST targets are blocked")).toBeInTheDocument();
    expect(within(panel).getByText("Dry-run rows do not pass")).toBeInTheDocument();
    expect(within(panel).getByText("Stale rows do not pass")).toBeInTheDocument();
    expect(within(panel).getByText("No secret material rendered")).toBeInTheDocument();
    expect(panel).toHaveTextContent("triggerSource:manual");
    expect(panel).toHaveTextContent("aggregateCount:invalid");
    expect(panel).toHaveTextContent("aggregateCount:missing");
    expect(panel).not.toHaveTextContent(
      /(live cron ready|scheduler verified|manual call accepted|secret leaked|sk_live|production deployment verified|stripe webhook verified)/i,
    );
  });
});
