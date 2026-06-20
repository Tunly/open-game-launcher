import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  buildOneClickSetupRollbackAuditContract,
  createVerifyOneClickSetupRollbackAuditContract,
} from "../../lib/one-click-setup-rollback-audit-contract";
import { buildOneClickSetupReadiness } from "../../lib/one-click-setup-readiness";
import { OneClickSetupRollbackAuditContractPanel } from "./OneClickSetupRollbackAuditContractPanel";

const falseRollbackAuditClaim =
  /\b(?:hosted\s*auth\s*(?:verified|complete|passed)|oauth\s*(?:replayed|complete|verified)|tokens?\s*(?:replayed|restored|migrated|verified)|silent\s*install\s*(?:started|ready|complete|approved)|automatic\s*install\s*(?:started|complete)|setup\s*(?:completed|replayed)|rollback\s*(?:verified|complete|succeeded)|cleanup\s*(?:complete|succeeded)|audit\s*(?:row\s*)?(?:inserted|verified|complete|succeeded)|production\s*(?:setup\s*)?(?:deployment\s*)?(?:ready|complete|verified))\b/i;

describe("OneClickSetupRollbackAuditContractPanel", () => {
  it("renders rollback/audit rehearsal evidence without execution claims", () => {
    render(
      <OneClickSetupRollbackAuditContractPanel
        contract={createVerifyOneClickSetupRollbackAuditContract()}
      />,
    );

    const panel = screen.getByRole("region", {
      name: /one-click setup rollback audit contract/i,
    });

    expect(within(panel).getByText("Setup Rollback Audit")).toBeInTheDocument();
    expect(within(panel).getByText("Setup Step Ledger")).toBeInTheDocument();
    expect(within(panel).getByText("Undo / Cleanup Order")).toBeInTheDocument();
    expect(within(panel).getByText("Partial Failure Map")).toBeInTheDocument();
    expect(within(panel).getByText("Audit Envelope")).toBeInTheDocument();
    expect(within(panel).getByText("No hosted auth E2E")).toBeInTheDocument();
    expect(within(panel).getByText("No provider OAuth/token replay")).toBeInTheDocument();
    expect(within(panel).getByText("No rollback execution or success claim")).toBeInTheDocument();
    expect(within(panel).getByText("No audit row persisted")).toBeInTheDocument();
    expect(within(panel).getByText("Writes")).toBeInTheDocument();
    expect(within(panel).getByText("Deletes")).toBeInTheDocument();
    expect(within(panel).getByText("Live Calls")).toBeInTheDocument();
    expect(
      within(panel).getByText("Rollback executed false / Audit persisted false"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Validation errors 0")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(falseRollbackAuditClaim);
  });

  it("renders a redacted failure drill without raw operator secrets", () => {
    const contract = buildOneClickSetupRollbackAuditContract({
      auditEnvelopeReady: true,
      cleanupPlanReady: true,
      failure: {
        failedStepId: "platform-links",
        rawError:
          "Authorization: Bearer secret.jwt.value https://x.test/a?access_token=access-secret /home/daniel/.config/og/token.txt D:\\Secrets\\token.txt ogd_supersecretvalue",
        source: "operator-review",
      },
      partialFailureMapReady: true,
      readiness: buildOneClickSetupReadiness({
        backupReminderConfigured: true,
        installDir: "/games",
        isDesktopRuntime: true,
        librarySnapshotCount: 3,
        platforms: [{ gamesCount: 12, id: "steam", label: "Steam", linked: true }],
        supabaseConfigured: true,
      }),
      setupStepLedgerReady: true,
      undoPlanReady: true,
    });

    render(<OneClickSetupRollbackAuditContractPanel contract={contract} />);

    const panel = screen.getByRole("region", {
      name: /one-click setup rollback audit contract/i,
    });

    expect(within(panel).getByText("Failure Drill")).toBeInTheDocument();
    expect(within(panel).getByText("Step platform-links")).toBeInTheDocument();
    expect(panel).toHaveTextContent("[redacted-url]");
    expect(panel).toHaveTextContent("[redacted-path]");
    expect(panel).not.toHaveTextContent("secret.jwt.value");
    expect(panel).not.toHaveTextContent("https://x.test");
    expect(panel).not.toHaveTextContent("/home/daniel");
    expect(panel).not.toHaveTextContent("D:\\Secrets");
    expect(panel).not.toHaveTextContent("ogd_supersecretvalue");
  });
});
