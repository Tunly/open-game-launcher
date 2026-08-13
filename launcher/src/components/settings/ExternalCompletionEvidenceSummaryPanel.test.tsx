import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  buildExternalCompletionEvidenceSummary,
  createVerifyExternalCompletionEvidenceSummary,
  EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS,
  type ExternalCompletionEvidenceDetailField,
  type ExternalCompletionEvidenceGateInput,
} from "../../lib/external-completion-evidence-summary";
import { ExternalCompletionEvidenceSummaryPanel } from "./ExternalCompletionEvidenceSummaryPanel";

const validationNow = "2026-06-17T12:00:00.000Z";
const rolloutProof = "Hosted community artwork rollout is exercised beyond fixtures.";
const evidenceDetails: Record<ExternalCompletionEvidenceDetailField, string> = {
  "Captured at": "2026-06-16T12:00:00.000Z",
  "Commit SHA": "0123456789abcdef0123456789abcdef01234567",
  Environment: "hosted staging",
  Operator: "Release Ops",
  "Release ref": "refs/tags/v0.1.0",
  "Redacted run IDs, dashboard links, screenshots, or signed deployment logs":
    "run-external-evidence-123",
  "Redaction notes": "Raw secrets removed before commit",
};

function envEvidenceFor(gate: ExternalCompletionEvidenceGateInput) {
  return gate.requiredEnv.map((name) => ({
    name,
    value: validEnvValue(name),
  }));
}

function validEnvValue(name: string) {
  const values: Record<string, string> = {
    ACCOUNT_DELETION_PROCESSOR_SECRET: "acctDel9f8e7d6c5b4a392817263abcd",
    PRESENCE_POLL_SECRET: "presencePoll9f8e7d6c5b4a392817abcd",
    PRESENCE_PROVIDER_TOKEN: "presenceProvider9f8e7d6c5b4a392817",
    STEAM_WEB_API_KEY: "0123456789abcdef0123456789abcdef",
    SUPABASE_URL: "https://awebfvfyqzwapcgixdfj.supabase.co",
  };
  return values[name] ?? `value9f8e7d6c5b4a392817263-${name.toLowerCase()}`;
}

function validStoreArtifactEvidence(gate: ExternalCompletionEvidenceGateInput) {
  const [schedulerArtifact] = gate.artifactProofs ?? [];

  return [
    {
      checkedProofs: schedulerArtifact.requiredProofs,
      evidenceDetails: {
        ...evidenceDetails,
      },
      path: schedulerArtifact.path,
      proofEvidence: {
        [schedulerArtifact.requiredProofs[0]]: "workflow-presence-poll-live-123",
      },
      readable: true,
    },
    {
      checkedProofs: schedulerArtifact.requiredProofs,
      evidenceDetails: {
        ...evidenceDetails,
        Function: "poll-platform-presence",
        "Hosted cron table": "presence_poll_runs",
        "Run ID": "run-presence-poll-live-123",
        Scheduled: "scheduled",
        Status: "completed",
        "dry_run=false": "false",
      },
      path: schedulerArtifact.path,
      proofEvidence: {
        [schedulerArtifact.requiredProofs[0]]: "workflow-presence-poll-live-123",
      },
      readable: true,
    },
  ];
}

describe("ExternalCompletionEvidenceSummaryPanel", () => {
  it("renders the no-write external evidence map without release overclaims", () => {
    render(
      <ExternalCompletionEvidenceSummaryPanel
        summary={createVerifyExternalCompletionEvidenceSummary()}
      />,
    );

    const panel = screen.getByRole("region", {
      name: /external completion evidence summary/i,
    });

    expect(within(panel).getByText("External Completion Evidence")).toBeInTheDocument();
    expect(within(panel).getByText("External Evidence Required")).toBeInTheDocument();
    expect(within(panel).getAllByText("Hosted Supabase cron").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("Provider live integrations").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("Hardware and OS E2E").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("Rollout tracks").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText(rolloutProof).length).toBeGreaterThan(0);
    expect(panel).not.toHaveTextContent(/community artwork\/screenshots|screenshot-rollout/i);
    expect(within(panel).getByText("ACCOUNT_DELETION_PROCESSOR_SECRET")).toBeInTheDocument();
    expect(within(panel).getByText("No external proof claim")).toBeInTheDocument();
    expect(within(panel).getByText("No hosted cron scheduled-row proof")).toBeInTheDocument();
    expect(within(panel).getAllByText("CLI-Style Blockers").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("Operator Commands").length).toBe(4);
    const releaseCommands = within(panel).getByRole("group", {
      name: /release boundary commands/i,
    });
    expect(within(releaseCommands).getByText("pnpm external:evidence:next")).toBeVisible();
    expect(within(releaseCommands).getByText("pnpm external:evidence:worklist")).toBeVisible();
    expect(within(releaseCommands).getByText("pnpm external:evidence:packet")).toBeVisible();
    expect(within(releaseCommands).getByText("pnpm external:evidence:runbook")).toBeVisible();
    expect(within(releaseCommands).getByText("pnpm external:evidence:preflight")).toBeVisible();
    expect(within(releaseCommands).getByText("pnpm completion:gate:status")).toBeVisible();
    expect(within(releaseCommands).getByText("pnpm completion:gate:external")).toBeVisible();
    expect(within(panel).getAllByText("pnpm external:evidence:packet")).toHaveLength(1);
    const artifactSnapshot = within(panel).getByRole("group", {
      name: /committed external artifact snapshot/i,
    });
    expect(within(artifactSnapshot).getByText("Committed Artifact Snapshot")).toBeVisible();
    expect(within(artifactSnapshot).getByRole("article", { name: "Readable: 4/4" })).toBeVisible();
    expect(
      within(artifactSnapshot).getByRole("article", { name: "Artifact Ready: 0/4" }),
    ).toBeVisible();
    expect(
      within(artifactSnapshot).getByRole("article", { name: "Proof Rows Missing: 14" }),
    ).toBeVisible();
    expect(
      within(artifactSnapshot).getByRole("article", { name: "Details Missing: 50" }),
    ).toBeVisible();
    expect(within(artifactSnapshot).getAllByText("Yes")).toHaveLength(4);
    expect(within(artifactSnapshot).getAllByText("blocked").length).toBeGreaterThan(0);
    expect(within(artifactSnapshot).getByText(/Sanitized committed snapshot only/i)).toBeVisible();
    expect(
      within(panel).getByText(
        "OGL_EXTERNAL_EVIDENCE_GATES=hosted-supabase-cron pnpm external:evidence:status",
      ),
    ).toBeVisible();
    expect(
      within(panel)
        .getByText("OGL_EXTERNAL_EVIDENCE_GATES=hosted-supabase-cron pnpm external:evidence:status")
        .closest("code"),
    ).toHaveClass("normal-case");
    expect(within(panel).getByText("pnpm hosted:cron-evidence:artifact-hints")).toBeVisible();
    expect(
      within(panel).getAllByText("pnpm hosted:deploy-gate:scheduler-packet").length,
    ).toBeGreaterThanOrEqual(1);
    expect(within(panel).getByText("pnpm hosted:deploy-gate:packet")).toBeVisible();
    expect(
      within(panel).getByText(
        "GitHub Actions CI main hosted_deploy_gate=true hosted_environment=hosted-production hosted_deploy_action=all hosted_deploy_dry_run=false",
      ),
    ).toBeVisible();
    expect(within(panel).getAllByText("Artifact Proof Map").length).toBeGreaterThan(0);
    expect(
      within(panel).getAllByText("docs/verification/external/hosted-supabase-cron.md").length,
    ).toBeGreaterThan(0);
    expect(within(panel).getAllByText("Next Operator Action")).toHaveLength(4);
    expect(
      within(panel).getByText(
        "Set 4 non-placeholder environment value(s), then rerun OGL_EXTERNAL_EVIDENCE_GATES=hosted-supabase-cron pnpm external:evidence:status.",
      ),
    ).toBeVisible();
    expect(
      within(panel).getAllByText(
        "Capture real external proof, then check the assigned artifact row(s) only after evidence is attached.",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      within(panel).getAllByText("Hosted Supabase cron scheduler lanes write fresh run evidence.")
        .length,
    ).toBeGreaterThan(0);
    expect(within(panel).getAllByText("Missing checked row").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText(/Secret Scan: Clean; no raw secrets rendered/i).length).toBe(
      6,
    );
    const storeSecretScanStatus = within(panel).getAllByText("Clean")[0];
    expect(storeSecretScanStatus).toBeVisible();
    expect(storeSecretScanStatus).toHaveClass("whitespace-nowrap");
    expect(storeSecretScanStatus.closest("dl")?.className).toContain(
      "[grid-template-columns:repeat(auto-fit,minmax(min(100%,10.5rem),1fr))]",
    );
    expect(within(panel).getAllByText("4 Missing")[0]).toHaveClass("whitespace-nowrap");
    expect(
      within(panel).queryAllByText(/Secret Scan: Not checked until artifact is readable/i).length,
    ).toBe(0);
    expect(within(panel).queryByText("Not checked: 2 missing/unreadable")).not.toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /(sk_live|whsec_|secret-value|external completion complete|production ready|production deployment verified|scheduler verified|provider approved|dashboard verified|rollout complete)/i,
    );
  });

  it("renders proof-specific mapping blockers for checked rows", () => {
    const [storeGate] = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS;
    const artifactEvidence = validStoreArtifactEvidence(storeGate);
    const missingMappingProof = storeGate.artifactProofs?.[0].requiredProofs[1] ?? "";
    delete artifactEvidence[0].proofEvidence[missingMappingProof];
    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...storeGate,
          artifactEvidence,
          envEvidence: envEvidenceFor(storeGate),
        },
      ],
      packetId: "external-evidence-panel-test",
      validationNow,
    });

    expect(summary.gates[0].missingEvidenceDetailCount).toBe(0);

    render(<ExternalCompletionEvidenceSummaryPanel summary={summary} />);

    const gate = screen.getByRole("article", {
      name: /store and stripe live staging external evidence gate/i,
    });

    expect(
      within(gate).getByText("1 missing proof-specific Evidence for mapping(s)"),
    ).toBeVisible();
    expect(within(gate).getByText("Missing Evidence for mapping")).toBeVisible();
    expect(within(gate).getAllByText(missingMappingProof).length).toBeGreaterThan(0);
    expect(within(gate).getAllByText("Artifact Proof Map")).toHaveLength(1);
    expect(gate).not.toHaveTextContent(/sk_live|whsec_|secret-value/i);
  });

  it("renders invariant guardrails instead of missing-proof claims once the packet passes", () => {
    const [storeGate] = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS;
    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...storeGate,
          artifactEvidence: validStoreArtifactEvidence(storeGate),
          envEvidence: envEvidenceFor(storeGate),
        },
      ],
      packetId: "external-evidence-panel-pass-test",
      validationNow,
    });

    expect(summary.statusLabel).toBe("Evidence Packet Pass");

    render(<ExternalCompletionEvidenceSummaryPanel summary={summary} />);

    const panel = screen.getByRole("region", {
      name: /external completion evidence summary/i,
    });

    expect(within(panel).getByText("Evidence Packet Pass")).toBeVisible();
    expect(within(panel).queryByText("No external proof claim")).not.toBeInTheDocument();
    expect(within(panel).getByText("External proof stays attached by reference")).toBeVisible();
    expect(
      within(panel).getByText(
        "Run OGL_EXTERNAL_EVIDENCE_GATES=store-stripe-live pnpm external:evidence:preflight, then use pnpm completion:gate:external at the release boundary.",
      ),
    ).toBeVisible();
  });
});
