import { describe, expect, it } from "vitest";

import {
  buildExternalCompletionEvidenceSummary,
  createVerifyExternalCompletionEvidenceSummary,
  EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS,
  type ExternalCompletionEvidenceArtifactInput,
  type ExternalCompletionEvidenceDetailField,
  type ExternalCompletionEvidenceGateInput,
} from "../external-completion-evidence-summary";

const validationNow = "2026-06-17T12:00:00.000Z";
const committedExternalArtifactTemplates = import.meta.glob(
  "../../../../docs/verification/external/*.md",
  {
    eager: true,
    import: "default",
    query: "?raw",
  },
) as Record<string, string>;
const committedExternalArtifactTemplatePaths = Object.keys(committedExternalArtifactTemplates).map(
  (path) => path.replace("../../../../", ""),
);
const evidenceDetails: Record<ExternalCompletionEvidenceDetailField, string> = {
  "Captured at": "2026-06-16T12:00:00.000Z",
  "Commit SHA": "0123456789abcdef0123456789abcdef01234567",
  Environment: "hosted staging",
  Operator: "Release Ops",
  "Release ref": "refs/tags/v0.1.0",
  "Redacted run IDs, dashboard links, screenshots, or signed deployment logs":
    "run-external-evidence-123 https://dashboard.stripe.com/events/evt_redacted",
  "Redaction notes": "Raw secrets removed before commit",
};
const validHostedDeployEvidence =
  "hosted-deploy CI main hosted_deploy_gate=true hosted_environment=hosted-production hosted_deploy_action=all hosted_deploy_dry_run=false workflow: https://github.com/open-game-collective/open-game-launcher/actions/runs/12345";

function envEvidenceFor(gate: ExternalCompletionEvidenceGateInput) {
  return gate.requiredEnv.map((name) => ({
    name,
    value: validEnvValue(name),
  }));
}

function validEnvValue(name: string) {
  const values: Record<string, string> = {
    ACCOUNT_DELETION_PROCESSOR_SECRET: "acctDel9f8e7d6c5b4a392817263abcd",
    CURSEFORGE_API_KEY: "curseForge9f8e7d6c5b4a392817",
    MOD_IO_API_KEY: "modio9f8e7d6c5b4a392817263",
    PRESENCE_POLL_SECRET: "presencePoll9f8e7d6c5b4a392817abcd",
    PRESENCE_PROVIDER_TOKEN: "presenceProvider9f8e7d6c5b4a392817",
    PRICE_DROP_NOTIFY_SECRET: "priceDrop9f8e7d6c5b4a392817263abcd",
    STEAM_WEB_API_KEY: "0123456789abcdef0123456789abcdef",
    STRIPE_SECRET_KEY: "sk_live_51OgLauncherEvidenceAlpha1234567890",
    STRIPE_WEBHOOK_SECRET: "whsec_51OgLauncherEvidenceAlpha1234567890",
    SUPABASE_URL: "https://awebfvfyqzwapcgixdfj.supabase.co",
  };
  return values[name] ?? `value9f8e7d6c5b4a392817263-${name.toLowerCase()}`;
}

function validStoreArtifactEvidence(
  gate: ExternalCompletionEvidenceGateInput,
): ExternalCompletionEvidenceArtifactInput[] {
  const [checkoutArtifact, schedulerArtifact] = gate.artifactProofs ?? [];

  return [
    {
      checkedProofs: checkoutArtifact.requiredProofs,
      evidenceDetails: {
        ...evidenceDetails,
        "Stripe Dashboard evidence": "https://dashboard.stripe.com/events/evt_redacted",
        "Stripe webhook event ID": "evt_oglauncherlive123",
        "Supabase function log run ID": "run-supabase-stripe-webhook-123",
        "License key custody evidence": "license-key-custody workflow-123",
        "Live license issuance evidence": "live-license-issuance workflow-123",
      },
      path: checkoutArtifact.path,
      proofEvidence: {
        [checkoutArtifact.requiredProofs[0]]: "run-stripe-webhook-live-123",
        [checkoutArtifact.requiredProofs[1]]: "run-stripe-dashboard-tax-123",
        [checkoutArtifact.requiredProofs[2]]: "run-license-key-custody-live-license-issuance-123",
      },
      readable: true,
    },
    {
      checkedProofs: schedulerArtifact.requiredProofs,
      evidenceDetails: {
        ...evidenceDetails,
        Function: "notify-price-drop",
        "Hosted cron table": "store_price_drop_notification_runs",
        "Run ID": "run-price-drop-live-123",
        Scheduled: "scheduled",
        Status: "completed",
        "dry_run=false": "false",
      },
      path: schedulerArtifact.path,
      proofEvidence: {
        [schedulerArtifact.requiredProofs[0]]: "workflow-price-drop-live-123",
      },
      readable: true,
    },
  ];
}

function validHostedSupabaseCronArtifactEvidence(
  gate: ExternalCompletionEvidenceGateInput,
): ExternalCompletionEvidenceArtifactInput[] {
  const artifactPath = gate.artifactPaths[0];
  const laneDetails = {
    "account-deletion: Function": "process-account-deletions",
    "account-deletion: Hosted cron table": "account_deletion_processor_runs",
    "account-deletion: Run ID": "account-deletion-run-123",
    "account-deletion: Scheduled": "scheduled",
    "account-deletion: Status": "completed",
    "account-deletion: dry_run=false": "confirmed false",
    "presence-poll: Function": "poll-platform-presence",
    "presence-poll: Hosted cron table": "presence_poll_runs",
    "presence-poll: Run ID": "presence-poll-run-123",
    "presence-poll: Scheduled": "scheduled",
    "presence-poll: Status": "completed",
    "presence-poll: dry_run=false": "confirmed false",
    "price-drop: Function": "notify-price-drop",
    "price-drop: Hosted cron table": "store_price_drop_notification_runs",
    "price-drop: Run ID": "price-drop-run-123",
    "price-drop: Scheduled": "scheduled",
    "price-drop: Status": "completed",
    "price-drop: dry_run=false": "confirmed false",
  };

  return [
    {
      checkedProofs: gate.proofRequirements,
      evidenceDetails: {
        ...evidenceDetails,
        ...laneDetails,
      },
      path: artifactPath,
      proofEvidence: Object.fromEntries(
        gate.proofRequirements.map((proof) => [proof, hostedCronProofEvidenceFor(proof)]),
      ),
      readable: true,
    },
  ];
}

function hostedCronProofEvidenceFor(proof: string) {
  if (proof.includes("poll-platform-presence")) return "workflow-presence-poll-123";
  if (proof.includes("notify-price-drop")) return "workflow-price-drop-123";
  if (proof.includes("process-account-deletions")) return "workflow-account-deletion-123";
  return "workflow-hosted-cron-123";
}

function externalProofEvidenceFor(proof: string, fallback = "run-external-evidence-123") {
  if (proof.includes("Stripe webhook signature")) return "run-stripe-webhook-signature-123";
  if (proof.includes("Stripe Tax and invoice")) return "run-stripe-dashboard-tax-invoice-123";
  if (proof.includes("Production license signing key custody")) {
    return "run-license-key-custody-live-license-issuance-123";
  }
  if (proof.includes("Hosted price-drop scheduler")) return "workflow-price-drop-live-123";
  if (proof.includes("mod.io and CurseForge")) return "run-provider-mod.io-curseforge-probe-123";
  if (proof.includes("Non-Steam presence")) {
    return "run-non-steam-presence-bridge-provider-123";
  }
  if (proof.includes("Provider-approved catalog/cloud")) {
    return "run-provider-approved-catalog-cloud-transfer-123";
  }
  if (proof.includes("Achievement/provider cache")) {
    return "run-achievement-provider-cache-real-client-123";
  }
  if (proof.includes("Fullscreen/anti-cheat overlay")) {
    return "run-fullscreen-anticheat-overlay-session-123";
  }
  if (proof.includes("Long native overlay sessions")) return "run-native-overlay-long-session-123";
  if (proof.includes("External-drive backup/restore")) {
    return "run-external-drive-backup-restore-windows-macos-linux-e2e-123";
  }
  if (proof.includes("Real client mount/apply")) {
    return "run-client-mount-apply-provider-client-123";
  }
  if (proof.includes("Hosted community artwork")) {
    return "run-community-artwork-screenshot-rollout-123";
  }
  if (proof.includes("Plugin marketplace")) return "run-plugin-marketplace-execution-update-123";
  if (proof.includes("Native mobile apps"))
    return "run-mobile-push-provider-store-distribution-123";
  if (proof.includes("Hosted production deployment")) return validHostedDeployEvidence;
  return fallback;
}

function rolloutArtifactContent(
  gate: ExternalCompletionEvidenceGateInput,
  hostedDeployLocator: string,
) {
  return [
    ...gate.proofRequirements.map((proof) => `- [x] ${proof}`),
    "",
    ...gate.proofRequirements.map((proof, index) => {
      const value = proof.includes("Hosted production deployment")
        ? hostedDeployLocator
        : externalProofEvidenceFor(proof, `run-rollout-proof-${index + 1}`);
      return `- Evidence for ${proof}: ${value}`;
    }),
    "- Captured at: 2026-06-16T12:00:00.000Z",
    "- Release ref: refs/tags/v0.1.0",
    "- Commit SHA: 0123456789abcdef0123456789abcdef01234567",
    "- Operator: Release Ops",
    "- Environment: hosted staging",
    "- Redacted run IDs, dashboard links, screenshots, or signed deployment logs: workflow-rollout-123",
    "- Redaction notes: Raw secrets removed before commit",
    "- Community rollout evidence: community artwork screenshot rollout workflow-123",
    "- Marketplace evidence: plugin marketplace execution update workflow-123",
    "- Mobile distribution evidence: mobile push provider store distribution workflow-123",
    "- Push-provider evidence: push provider firebase onesignal workflow-123",
    `- Hosted deploy evidence: ${hostedDeployLocator}`,
  ].join("\n");
}

describe("external completion evidence summary", () => {
  it("keeps verify fixture artifact paths backed by committed docs templates", () => {
    const artifactPaths = [
      ...new Set(EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS.flatMap((gate) => gate.artifactPaths)),
    ];

    expect(artifactPaths).toHaveLength(6);
    expect(artifactPaths).toEqual(
      expect.arrayContaining([
        "docs/verification/external/hardware-os-e2e.md",
        "docs/verification/external/hosted-supabase-cron.md",
        "docs/verification/external/provider-live-integrations.md",
        "docs/verification/external/rollout-tracks.md",
        "docs/verification/external/store-price-drop-scheduler-live.md",
        "docs/verification/external/store-stripe-live-staging.md",
      ]),
    );
    for (const artifactPath of artifactPaths) {
      expect(committedExternalArtifactTemplatePaths).toContain(artifactPath);
      expect(committedExternalArtifactTemplates[`../../../../${artifactPath}`]).toMatch(/\S/);
    }
  });

  it("keeps the verify fixture as an external-gated no-write map", () => {
    const summary = createVerifyExternalCompletionEvidenceSummary();

    expect(summary.statusLabel).toBe("External Evidence Required");
    expect(summary.passCount).toBe(0);
    expect(summary.reviewCount).toBe(0);
    expect(summary.blockedCount).toBe(5);
    expect(summary.warningCount).toBe(0);
    expect(summary.blockedClaims).toContain("No external proof claim");
    expect(summary.blockedClaims).toContain("No live provider credential rendered");
    expect(summary.blockedClaims).toContain("No hosted cron scheduled-row proof");
    expect(summary.releaseBoundaryCommands).toEqual([
      "pnpm external:evidence:next",
      "pnpm external:evidence:worklist",
      "pnpm external:evidence:packet",
      "pnpm external:evidence:runbook",
      "pnpm external:evidence:preflight",
      "pnpm completion:gate:status",
      "pnpm completion:gate:external",
    ]);
    expect(summary.gates.map((gate) => gate.id)).toEqual([
      "store-stripe-live",
      "hosted-supabase-cron",
      "provider-live-integrations",
      "hardware-os-e2e",
      "rollout-tracks",
    ]);
    expect(summary.gates.every((gate) => gate.missingArtifactCount === 0)).toBe(true);
    expect(summary.gates.every((gate) => gate.unreadableArtifactCount === 0)).toBe(true);
    expect(summary.gates.every((gate) => gate.secretFindingCount === 0)).toBe(true);
    expect(
      summary.gates.every((gate) => gate.artifactProofs.every((artifact) => artifact.readable)),
    ).toBe(true);
    expect(summary.gates[0].recommendedCommands).toEqual(
      expect.arrayContaining([
        "OGL_EXTERNAL_EVIDENCE_GATES=store-stripe-live pnpm external:evidence:status",
        "OGL_EXTERNAL_EVIDENCE_GATES=store-stripe-live pnpm external:evidence:template",
        "OGL_HOSTED_CRON_EVIDENCE_CHECKS=price-drop pnpm hosted:cron-evidence",
        "OGL_HOSTED_CRON_EVIDENCE_CHECKS=price-drop pnpm hosted:cron-evidence:artifact-hints",
        "OGL_EXTERNAL_EVIDENCE_GATES=store-stripe-live pnpm external:evidence:preflight",
      ]),
    );
    expect(summary.gates[0].nextAction).toBe(
      "Set 4 non-placeholder environment value(s), then rerun OGL_EXTERNAL_EVIDENCE_GATES=store-stripe-live pnpm external:evidence:status.",
    );
    expect(summary.gates.find((gate) => gate.id === "hardware-os-e2e")?.nextAction).toBe(
      "Capture real external proof, then check the assigned artifact row(s) only after evidence is attached.",
    );
    expect(summary.gates.find((gate) => gate.id === "hardware-os-e2e")).toMatchObject({
      missingArtifactCount: 0,
      missingEvidenceDetailCount: 10,
      missingProofCount: 4,
    });
    expect(
      summary.gates.find((gate) => gate.id === "hosted-supabase-cron")?.recommendedCommands,
    ).toEqual(
      expect.arrayContaining([
        "pnpm hosted:deploy-gate:scheduler-packet",
        "pnpm hosted:cron-evidence",
        "pnpm hosted:cron-evidence:artifact-hints",
      ]),
    );
    expect(summary.gates.find((gate) => gate.id === "rollout-tracks")?.recommendedCommands).toEqual(
      expect.arrayContaining([
        "pnpm hosted:deploy-gate:packet",
        "GitHub Actions CI main hosted_deploy_gate=true hosted_environment=hosted-production hosted_deploy_action=all hosted_deploy_dry_run=false",
      ]),
    );
    expect(JSON.stringify(summary)).not.toMatch(/sk_live|whsec_|secret-value|bearer\s+[a-z0-9]/i);
    expect(JSON.stringify(summary)).not.toMatch(
      /(external completion complete|production ready|live webhook verified|dashboard verified|provider approved|hardware e2e passed|rollout complete)/i,
    );
  });

  it("does not pass a gate from labels-only env, artifact, and proof assertions", () => {
    const [storeGate] = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS;
    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...storeGate,
          availableArtifactPaths: storeGate.artifactPaths,
          provenRequirements: storeGate.proofRequirements,
          readyEnv: storeGate.requiredEnv,
        },
      ],
      packetId: "external-evidence-labels-only-test",
      validationNow,
    });

    expect(summary.passCount).toBe(0);
    expect(summary.blockedCount).toBe(1);
    expect(summary.warningCount).toBe(3);
    expect(summary.gates[0]).toMatchObject({
      blockerCount: expect.any(Number),
      missingArtifactCount: 0,
      missingEnvCount: storeGate.requiredEnv.length,
      missingProofCount: storeGate.proofRequirements.length,
      status: "blocked",
      unreadableArtifactCount: storeGate.artifactPaths.length,
      warningCount: 3,
    });
    expect(summary.gates[0].blockers).toEqual(
      expect.arrayContaining([
        "4 missing, placeholder, or malformed environment value(s)",
        "2 unreadable artifact file(s)",
        `${storeGate.proofRequirements.length} missing checked proof row(s)`,
      ]),
    );
    expect(summary.gates[0].warnings.join(" ")).toMatch(/are not evidence/i);
  });

  it("prioritizes proof rows after env and artifact evidence are present", () => {
    const [storeGate] = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS;
    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...storeGate,
          artifactEvidence: storeGate.artifactPaths.map((path) => ({
            content: "# External artifact\n",
            path,
            readable: true,
          })),
          envEvidence: envEvidenceFor(storeGate),
        },
      ],
      packetId: "external-evidence-next-action-proof-test",
      validationNow,
    });

    expect(summary.gates[0]).toMatchObject({
      missingArtifactCount: 0,
      missingEnvCount: 0,
      missingProofCount: storeGate.proofRequirements.length,
      status: "blocked",
    });
    expect(summary.gates[0].nextAction).toBe(
      "Capture real external proof, then check the assigned artifact row(s) only after evidence is attached.",
    );
  });

  it("passes a gate only with CLI-like structured evidence", () => {
    const [storeGate, cronGate] = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS;
    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...storeGate,
          artifactEvidence: validStoreArtifactEvidence(storeGate),
          envEvidence: envEvidenceFor(storeGate),
        },
        {
          ...cronGate,
          envEvidence: envEvidenceFor(cronGate).slice(0, 1),
        },
      ],
      packetId: "external-evidence-test",
      validationNow,
    });

    expect(summary.passCount).toBe(1);
    expect(summary.reviewCount).toBe(0);
    expect(summary.blockedCount).toBe(1);
    expect(summary.gates[0]).toMatchObject({
      missingArtifactCount: 0,
      missingEnvCount: 0,
      missingProofCount: 0,
      status: "pass",
    });
    expect(summary.gates[1]).toMatchObject({
      missingArtifactCount: 1,
      missingEnvCount: 3,
      missingProofCount: 3,
      status: "blocked",
    });
  });

  it("uses a packet-scoped pass label only when every evidence gate passes", () => {
    const [storeGate, cronGate, providerGate, hardwareGate, rolloutGate] =
      EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS;
    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...storeGate,
          artifactEvidence: validStoreArtifactEvidence(storeGate),
          envEvidence: envEvidenceFor(storeGate),
        },
        {
          ...cronGate,
          artifactEvidence: validHostedSupabaseCronArtifactEvidence(cronGate),
          envEvidence: envEvidenceFor(cronGate),
        },
        {
          ...providerGate,
          artifactEvidence: [
            {
              checkedProofs: providerGate.proofRequirements,
              evidenceDetails: {
                ...evidenceDetails,
                "Live probe run ID": "live-provider-probe-run-123",
                "Provider response evidence": "provider-response-probe-run-123",
                "Provider/client matrix": "provider-client-matrix-mod.io-curseforge-run-123",
              },
              path: providerGate.artifactPaths[0],
              proofEvidence: Object.fromEntries(
                providerGate.proofRequirements.map((proof) => [
                  proof,
                  externalProofEvidenceFor(proof),
                ]),
              ),
              readable: true,
            },
          ],
          envEvidence: envEvidenceFor(providerGate),
        },
        {
          ...hardwareGate,
          artifactEvidence: [
            {
              checkedProofs: hardwareGate.proofRequirements,
              evidenceDetails: {
                ...evidenceDetails,
                "Hardware profile": "hardware-profile-run-123",
                "OS/title/client matrix": "os-title-client-matrix-windows-macos-linux-run-123",
                "Session/run ID": "overlay-session-run-123",
              },
              path: hardwareGate.artifactPaths[0],
              proofEvidence: Object.fromEntries(
                hardwareGate.proofRequirements.map((proof) => [
                  proof,
                  externalProofEvidenceFor(proof),
                ]),
              ),
              readable: true,
            },
          ],
          envEvidence: envEvidenceFor(hardwareGate),
        },
        {
          ...rolloutGate,
          artifactEvidence: [
            {
              checkedProofs: rolloutGate.proofRequirements,
              evidenceDetails: {
                ...evidenceDetails,
                "Community rollout evidence": "community-artwork-screenshot-rollout-run-123",
                "Hosted deploy evidence": validHostedDeployEvidence,
                "Marketplace evidence": "plugin-marketplace-update-run-123",
                "Mobile distribution evidence": "mobile-store-distribution-run-123",
                "Push-provider evidence": "firebase-push-provider-run-123",
              },
              path: rolloutGate.artifactPaths[0],
              proofEvidence: Object.fromEntries(
                rolloutGate.proofRequirements.map((proof) => [
                  proof,
                  externalProofEvidenceFor(proof),
                ]),
              ),
              readable: true,
            },
          ],
          envEvidence: envEvidenceFor(rolloutGate),
        },
      ],
      packetId: "external-evidence-packet-pass-label-test",
      validationNow,
    });

    expect(summary.passCount).toBe(summary.totalCount);
    expect(summary.statusLabel).toBe("Evidence Packet Pass");
    expect(summary.statusLabel).not.toBe("Ready");
  });

  it("blocks env evidence values that do not match CLI shape requirements", () => {
    const [storeGate] = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS;
    const invalidEnvEvidence = [
      { name: "SUPABASE_URL", value: "https://example.supabase.co" },
      { name: "STRIPE_SECRET_KEY", value: "sk_test_51OgLauncherEvidenceAlpha1234567890" },
      { name: "STRIPE_WEBHOOK_SECRET", value: "whsec_short" },
      { name: "PRICE_DROP_NOTIFY_SECRET", value: "vault:og-launcher:price_drop_notify_secret" },
    ];
    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...storeGate,
          artifactEvidence: validStoreArtifactEvidence(storeGate),
          envEvidence: invalidEnvEvidence,
        },
      ],
      packetId: "external-evidence-env-shape-test",
      validationNow,
    });

    expect(summary.passCount).toBe(0);
    expect(summary.reviewCount).toBe(0);
    expect(summary.gates[0]).toMatchObject({
      missingEnvCount: 4,
      status: "blocked",
    });
    expect(summary.gates[0].blockers).toContain(
      "4 missing, placeholder, or malformed environment value(s)",
    );
    for (const { value } of invalidEnvEvidence) {
      expect(JSON.stringify(summary)).not.toContain(value);
    }
  });

  it("blocks scheduler secrets shorter than the hosted deploy gate minimum", () => {
    const cronGate = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS.find(
      (gate) => gate.id === "hosted-supabase-cron",
    );
    expect(cronGate).toBeDefined();
    const shortSchedulerSecret = `${"a".repeat(30)}1`;
    const invalidEnvEvidence = envEvidenceFor(cronGate!).map((item) =>
      item.name === "PRICE_DROP_NOTIFY_SECRET" ||
      item.name === "ACCOUNT_DELETION_PROCESSOR_SECRET" ||
      item.name === "PRESENCE_POLL_SECRET"
        ? { ...item, value: shortSchedulerSecret }
        : item,
    );

    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...cronGate!,
          artifactEvidence: validHostedSupabaseCronArtifactEvidence(cronGate!),
          envEvidence: invalidEnvEvidence,
        },
      ],
      packetId: "external-evidence-scheduler-secret-length-test",
      validationNow,
    });

    expect(summary.gates[0]).toMatchObject({
      missingEnvCount: 3,
      status: "blocked",
    });
    expect(JSON.stringify(summary)).not.toContain(shortSchedulerSecret);
  });

  it("blocks artifacts missing gate-specific evidence fields", () => {
    const [storeGate] = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS;
    const artifactEvidence = validStoreArtifactEvidence(storeGate);
    delete artifactEvidence[0]!.evidenceDetails!["Stripe webhook event ID"];

    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...storeGate,
          artifactEvidence,
          envEvidence: envEvidenceFor(storeGate),
        },
      ],
      packetId: "external-evidence-gate-specific-detail-test",
      validationNow,
    });

    expect(summary.gates[0]).toMatchObject({
      missingEvidenceDetailCount: 1,
      status: "blocked",
    });
    expect(summary.gates[0].artifactProofs[0].missingEvidenceDetails).toEqual([
      {
        field: "Stripe webhook event ID",
        path: storeGate.artifactPaths[0],
      },
    ]);
  });

  it.each(["Release ref", "Commit SHA"] as const)(
    "blocks artifacts missing release-boundary evidence detail field: %s",
    (field) => {
      const [storeGate] = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS;
      const artifactEvidence = validStoreArtifactEvidence(storeGate);
      delete artifactEvidence[0]!.evidenceDetails![field];

      const summary = buildExternalCompletionEvidenceSummary({
        createdAt: "2026-06-16T00:00:00.000Z",
        gates: [
          {
            ...storeGate,
            artifactEvidence,
            envEvidence: envEvidenceFor(storeGate),
          },
        ],
        packetId: `external-evidence-missing-${field.toLowerCase().replace(/\s+/g, "-")}-test`,
        validationNow,
      });

      expect(summary.gates[0]).toMatchObject({
        missingEvidenceDetailCount: 1,
        status: "blocked",
      });
      expect(summary.gates[0].artifactProofs[0].missingEvidenceDetails).toEqual([
        {
          field,
          path: storeGate.artifactPaths[0],
        },
      ]);
    },
  );

  it("rejects malformed Commit SHA evidence detail values", () => {
    const [storeGate] = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS;
    const artifactEvidence = validStoreArtifactEvidence(storeGate);
    artifactEvidence[0]!.evidenceDetails!["Commit SHA"] = "not-a-commit-sha";

    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...storeGate,
          artifactEvidence,
          envEvidence: envEvidenceFor(storeGate),
        },
      ],
      packetId: "external-evidence-malformed-commit-sha-test",
      validationNow,
    });

    expect(summary.gates[0]).toMatchObject({
      missingEvidenceDetailCount: 1,
      status: "blocked",
    });
    expect(summary.gates[0].artifactProofs[0].missingEvidenceDetails).toEqual([
      {
        field: "Commit SHA",
        path: storeGate.artifactPaths[0],
      },
    ]);
  });

  it("rejects release-boundary details that do not match expected CI tag and SHA", () => {
    const [storeGate] = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS;
    const artifactEvidence = validStoreArtifactEvidence(storeGate);
    artifactEvidence[1]!.evidenceDetails!["Release ref"] = "refs/tags/v0.2.0";
    artifactEvidence[1]!.evidenceDetails!["Commit SHA"] =
      "fedcba9876543210fedcba9876543210fedcba98";

    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...storeGate,
          artifactEvidence,
          envEvidence: envEvidenceFor(storeGate),
        },
      ],
      packetId: "external-evidence-release-boundary-mismatch-test",
      releaseBoundaryEnv: {
        GITHUB_REF_NAME: "v0.2.0",
        GITHUB_SHA: "fedcba9876543210fedcba9876543210fedcba98",
      },
      validationNow,
    });

    expect(summary.gates[0]).toMatchObject({
      missingEvidenceDetailCount: 2,
      status: "blocked",
    });
    expect(summary.gates[0].artifactProofs[0].missingEvidenceDetails).toEqual(
      expect.arrayContaining([
        {
          field: "Release ref",
          path: storeGate.artifactPaths[0],
        },
        {
          field: "Commit SHA",
          path: storeGate.artifactPaths[0],
        },
      ]),
    );
  });

  it("exposes redacted evidence finding reason codes without storing raw values", () => {
    const [storeGate] = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS;
    const artifactEvidence = validStoreArtifactEvidence(storeGate);
    const invalidLocator =
      "run-123 docs/verification/screenshots/settings-external-completion-evidence-summary-local.png";
    const genericProofLocator = "run-generic-proof-123";
    const checkoutArtifact = artifactEvidence[0]!;
    const checkoutProofs = storeGate.artifactProofs![0].requiredProofs;

    checkoutArtifact.evidenceDetails!["Captured at"] = "1970-01-01T00:00:00.000Z";
    checkoutArtifact.evidenceDetails![
      "Redacted run IDs, dashboard links, screenshots, or signed deployment logs"
    ] = invalidLocator;
    checkoutArtifact.proofEvidence![checkoutProofs[1]] = genericProofLocator;

    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...storeGate,
          artifactEvidence,
          envEvidence: envEvidenceFor(storeGate),
        },
      ],
      packetId: "external-evidence-reason-code-test",
      validationNow,
    });

    expect(summary.gates[0]).toMatchObject({
      missingEvidenceDetailCount: 2,
      missingProofEvidenceCount: 1,
      status: "blocked",
    });
    expect(summary.gates[0].artifactProofs[0].evidenceDetailFindings).toEqual([
      {
        field: "Captured at",
        path: storeGate.artifactPaths[0],
        reason: "stale_timestamp",
      },
      {
        field: "Redacted run IDs, dashboard links, screenshots, or signed deployment logs",
        path: storeGate.artifactPaths[0],
        reason: "local_path",
      },
    ]);
    expect(summary.gates[0].artifactProofs[0].proofEvidenceFindings).toEqual([
      {
        field: `Evidence for ${checkoutProofs[1]}`,
        path: storeGate.artifactPaths[0],
        proof: checkoutProofs[1],
        reason: "missing_lane_terms",
      },
    ]);
    expect(JSON.stringify(summary)).not.toContain("1970-01-01T00:00:00.000Z");
    expect(JSON.stringify(summary)).not.toContain("docs/verification/screenshots");
    expect(JSON.stringify(summary)).not.toContain(genericProofLocator);
  });

  it("rejects duplicate detail and proof evidence rows when any value is invalid", () => {
    const hardwareGate = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS.find(
      (gate) => gate.id === "hardware-os-e2e",
    );
    expect(hardwareGate).toBeDefined();
    const gate = hardwareGate!;
    const artifactPath = gate.artifactPaths[0];
    const firstProof = gate.proofRequirements[0];
    const localScreenshotPath =
      "docs/verification/screenshots/settings-external-completion-evidence-summary-local.png";
    const baseRows = [
      ...gate.proofRequirements.map((proof) => `- [x] ${proof}`),
      "",
      ...gate.proofRequirements.map(
        (proof, index) =>
          `- Evidence for ${proof}: ${externalProofEvidenceFor(proof, `run-hardware-proof-${index + 1}`)}`,
      ),
      ...Object.entries({
        ...evidenceDetails,
        "Hardware profile": "hardware-profile-run-123",
        "OS/title/client matrix": "os-title-client-matrix-windows-macos-linux-run-123",
        "Session/run ID": "overlay-session-run-123",
      }).map(([field, value]) => `- ${field}: ${value}`),
    ];

    const duplicateDetailSummary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...gate,
          artifactEvidence: [
            {
              content: [
                ...baseRows,
                `- Redacted run IDs, dashboard links, screenshots, or signed deployment logs: ${localScreenshotPath}`,
              ].join("\n"),
              path: artifactPath,
              readable: true,
            },
          ],
          envEvidence: envEvidenceFor(gate),
        },
      ],
      packetId: "external-evidence-duplicate-detail-row-test",
      validationNow,
    });

    expect(duplicateDetailSummary.gates[0]).toMatchObject({
      missingEvidenceDetailCount: 1,
      status: "blocked",
    });
    expect(duplicateDetailSummary.gates[0].artifactProofs[0].evidenceDetailFindings).toEqual([
      {
        field: "Redacted run IDs, dashboard links, screenshots, or signed deployment logs",
        path: artifactPath,
        reason: "local_path",
      },
    ]);

    const duplicateProofSummary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...gate,
          artifactEvidence: [
            {
              content: [...baseRows, `- Evidence for ${firstProof}: ${localScreenshotPath}`].join(
                "\n",
              ),
              path: artifactPath,
              readable: true,
            },
          ],
          envEvidence: envEvidenceFor(gate),
        },
      ],
      packetId: "external-evidence-duplicate-proof-row-test",
      validationNow,
    });

    expect(duplicateProofSummary.gates[0]).toMatchObject({
      missingProofEvidenceCount: 1,
      status: "blocked",
    });
    expect(duplicateProofSummary.gates[0].artifactProofs[0].proofEvidenceFindings).toEqual([
      {
        field: `Evidence for ${firstProof}`,
        path: artifactPath,
        proof: firstProof,
        reason: "local_path",
      },
    ]);
  });

  it("accepts release-boundary details that match expected CI tag and SHA", () => {
    const [storeGate] = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS;
    const artifactEvidence = validStoreArtifactEvidence(storeGate);

    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...storeGate,
          artifactEvidence,
          envEvidence: envEvidenceFor(storeGate),
        },
      ],
      packetId: "external-evidence-release-boundary-match-test",
      releaseBoundaryEnv: {
        GITHUB_REF: "refs/tags/v0.1.0",
        GITHUB_REF_NAME: "v0.1.0",
        GITHUB_SHA: evidenceDetails["Commit SHA"],
      },
      validationNow,
    });

    expect(summary.gates[0]).toMatchObject({
      missingEvidenceDetailCount: 0,
      status: "pass",
    });
  });

  it("does not bind release ref to non-release branch CI refs", () => {
    const [storeGate] = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS;
    const artifactEvidence = validStoreArtifactEvidence(storeGate);

    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...storeGate,
          artifactEvidence,
          envEvidence: envEvidenceFor(storeGate),
        },
      ],
      packetId: "external-evidence-release-boundary-branch-ref-test",
      releaseBoundaryEnv: {
        GITHUB_REF: "refs/heads/main",
        GITHUB_REF_NAME: "main",
        GITHUB_SHA: evidenceDetails["Commit SHA"],
      },
      validationNow,
    });

    expect(summary.gates[0]).toMatchObject({
      missingEvidenceDetailCount: 0,
      status: "pass",
    });
  });

  it("rejects branch refs as Release ref evidence detail values", () => {
    const [storeGate] = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS;
    const artifactEvidence = validStoreArtifactEvidence(storeGate);
    artifactEvidence[0]!.evidenceDetails!["Release ref"] = "refs/heads/main";

    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...storeGate,
          artifactEvidence,
          envEvidence: envEvidenceFor(storeGate),
        },
      ],
      packetId: "external-evidence-malformed-release-ref-test",
      validationNow,
    });

    expect(summary.gates[0]).toMatchObject({
      missingEvidenceDetailCount: 1,
      status: "blocked",
    });
    expect(summary.gates[0].artifactProofs[0].missingEvidenceDetails).toEqual([
      {
        field: "Release ref",
        path: storeGate.artifactPaths[0],
      },
    ]);
  });

  it("rejects Stripe Dashboard test-mode evidence URLs", () => {
    const [storeGate] = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS;
    const artifactEvidence = validStoreArtifactEvidence(storeGate);
    artifactEvidence[0]!.evidenceDetails!["Stripe Dashboard evidence"] =
      "https://dashboard.stripe.com/test/events/evt_123";

    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...storeGate,
          artifactEvidence,
          envEvidence: envEvidenceFor(storeGate),
        },
      ],
      packetId: "external-evidence-stripe-test-dashboard-url-test",
      validationNow,
    });

    expect(summary.gates[0]).toMatchObject({
      missingEvidenceDetailCount: 1,
      status: "blocked",
    });
    expect(summary.gates[0].artifactProofs[0].missingEvidenceDetails).toEqual([
      {
        field: "Stripe Dashboard evidence",
        path: storeGate.artifactPaths[0],
      },
    ]);
  });

  it.each([
    "https://user@dashboard.stripe.com/events/evt_1234567890",
    "https://user:pass@dashboard.stripe.com/events/evt_1234567890",
    "https://dashboard.stripe.com/events/evt_1234567890?proof=1",
    "https://dashboard.stripe.com/events/evt_1234567890#proof",
  ])("rejects evidence URLs with CLI-blocked URL parts: %s", (url) => {
    const [storeGate] = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS;
    const artifactEvidence = validStoreArtifactEvidence(storeGate);
    artifactEvidence[0]!.evidenceDetails!["Stripe Dashboard evidence"] = url;

    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...storeGate,
          artifactEvidence,
          envEvidence: envEvidenceFor(storeGate),
        },
      ],
      packetId: "external-evidence-url-component-parity-test",
      validationNow,
    });

    expect(summary.gates[0]).toMatchObject({
      missingEvidenceDetailCount: 1,
      status: "blocked",
    });
    expect(summary.gates[0].artifactProofs[0].missingEvidenceDetails).toEqual([
      {
        field: "Stripe Dashboard evidence",
        path: storeGate.artifactPaths[0],
      },
    ]);
    expect(JSON.stringify(summary)).not.toContain(url);
  });

  it("rejects generic locator IDs for Stripe Dashboard evidence", () => {
    const [storeGate] = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS;
    const artifactEvidence = validStoreArtifactEvidence(storeGate);
    artifactEvidence[0]!.evidenceDetails!["Stripe Dashboard evidence"] = "run-generic-123";

    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...storeGate,
          artifactEvidence,
          envEvidence: envEvidenceFor(storeGate),
        },
      ],
      packetId: "external-evidence-stripe-dashboard-generic-id-test",
      validationNow,
    });

    expect(summary.gates[0]).toMatchObject({
      missingEvidenceDetailCount: 1,
      status: "blocked",
    });
    expect(summary.gates[0].artifactProofs[0].missingEvidenceDetails).toEqual([
      {
        field: "Stripe Dashboard evidence",
        path: storeGate.artifactPaths[0],
      },
    ]);
  });

  it("blocks Store/Stripe proof evidence mappings that omit proof identity", () => {
    const [storeGate] = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS;
    const artifactEvidence = validStoreArtifactEvidence(storeGate);
    artifactEvidence[0]!.proofEvidence = Object.fromEntries(
      storeGate.artifactProofs![0].requiredProofs.map((proof, index) => [
        proof,
        `run-generic-store-stripe-${index + 1}`,
      ]),
    );

    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...storeGate,
          artifactEvidence,
          envEvidence: envEvidenceFor(storeGate),
        },
      ],
      packetId: "external-evidence-generic-store-stripe-proof-mapping-test",
      validationNow,
    });

    expect(summary.gates[0]).toMatchObject({
      missingProofEvidenceCount: storeGate.artifactProofs![0].requiredProofs.length,
      status: "blocked",
    });
    expect(
      summary.gates[0].artifactProofs[0].missingProofEvidenceMappings.map(({ proof }) => proof),
    ).toEqual(storeGate.artifactProofs![0].requiredProofs);
  });

  it("rejects weak gate-specific evidence detail values like the CLI preflight", () => {
    const providerGate = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS.find(
      (gate) => gate.id === "provider-live-integrations",
    );
    expect(providerGate).toBeDefined();

    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...providerGate!,
          artifactEvidence: [
            {
              checkedProofs: providerGate!.proofRequirements,
              evidenceDetails: {
                ...evidenceDetails,
                "Live probe run ID": "live-probe-run-123",
                "Provider response evidence": "provider-response artifact run-123",
                "Provider/client matrix": "ok",
              },
              path: providerGate!.artifactPaths[0],
              proofEvidence: Object.fromEntries(
                providerGate!.proofRequirements.map((proof, index) => [
                  proof,
                  externalProofEvidenceFor(proof, `run-provider-live-${index + 1}`),
                ]),
              ),
              readable: true,
            },
          ],
          envEvidence: envEvidenceFor(providerGate!),
        },
      ],
      packetId: "external-evidence-weak-gate-field-test",
      validationNow,
    });

    expect(summary.gates[0]).toMatchObject({
      missingEvidenceDetailCount: 1,
      status: "blocked",
    });
    expect(summary.gates[0].artifactProofs[0].missingEvidenceDetails).toEqual([
      {
        field: "Provider/client matrix",
        path: providerGate!.artifactPaths[0],
      },
    ]);
  });

  it.each([
    "ok",
    "Evidence reviewed",
    "not redacted",
    "unredacted",
    "contains raw secrets",
    "not reviewed",
  ])("rejects Redaction notes without CLI-positive wording: %s", (redactionNotes) => {
    const [storeGate] = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS;
    const artifactEvidence = validStoreArtifactEvidence(storeGate);
    artifactEvidence[0]!.evidenceDetails!["Redaction notes"] = redactionNotes;

    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...storeGate,
          artifactEvidence,
          envEvidence: envEvidenceFor(storeGate),
        },
      ],
      packetId: "external-evidence-redaction-notes-parity-test",
      validationNow,
    });

    expect(summary.gates[0]).toMatchObject({
      missingEvidenceDetailCount: 1,
      status: "blocked",
    });
    expect(summary.gates[0].artifactProofs[0].missingEvidenceDetails).toEqual([
      {
        field: "Redaction notes",
        path: storeGate.artifactPaths[0],
      },
    ]);
  });

  it("requires both mod.io and CurseForge in provider compound evidence", () => {
    const providerGate = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS.find(
      (gate) => gate.id === "provider-live-integrations",
    );
    expect(providerGate).toBeDefined();

    const compoundProof = providerGate!.proofRequirements.find((proof) =>
      proof.includes("mod.io and CurseForge"),
    );
    expect(compoundProof).toBeDefined();

    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...providerGate!,
          artifactEvidence: [
            {
              checkedProofs: providerGate!.proofRequirements,
              evidenceDetails: {
                ...evidenceDetails,
                "Live probe run ID": "live-probe-run-123",
                "Provider response evidence": "provider-response artifact run-123",
                "Provider/client matrix": "provider-client-matrix-mod.io-run-123",
              },
              path: providerGate!.artifactPaths[0],
              proofEvidence: Object.fromEntries(
                providerGate!.proofRequirements.map((proof) => [
                  proof,
                  proof === compoundProof
                    ? "run-provider-mod.io-probe-123"
                    : externalProofEvidenceFor(proof),
                ]),
              ),
              readable: true,
            },
          ],
          envEvidence: envEvidenceFor(providerGate!),
        },
      ],
      packetId: "external-evidence-provider-compound-parity-test",
      validationNow,
    });

    expect(summary.gates[0]).toMatchObject({
      missingEvidenceDetailCount: 1,
      missingProofEvidenceCount: 1,
      status: "blocked",
    });
    expect(summary.gates[0].artifactProofs[0].missingEvidenceDetails).toEqual([
      {
        field: "Provider/client matrix",
        path: providerGate!.artifactPaths[0],
      },
    ]);
    expect(summary.gates[0].artifactProofs[0].missingProofEvidenceMappings).toEqual([
      {
        path: providerGate!.artifactPaths[0],
        proof: compoundProof,
      },
    ]);
  });

  it("requires Windows, macOS, and Linux in hardware compound evidence", () => {
    const hardwareGate = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS.find(
      (gate) => gate.id === "hardware-os-e2e",
    );
    expect(hardwareGate).toBeDefined();

    const backupProof = hardwareGate!.proofRequirements.find((proof) =>
      proof.includes("External-drive backup/restore"),
    );
    expect(backupProof).toBeDefined();

    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...hardwareGate!,
          artifactEvidence: [
            {
              checkedProofs: hardwareGate!.proofRequirements,
              evidenceDetails: {
                ...evidenceDetails,
                "Hardware profile": "hardware-profile-run-123",
                "OS/title/client matrix": "os-title-client-matrix-windows-linux-run-123",
                "Session/run ID": "overlay-session-run-123",
              },
              path: hardwareGate!.artifactPaths[0],
              proofEvidence: Object.fromEntries(
                hardwareGate!.proofRequirements.map((proof) => [
                  proof,
                  proof === backupProof
                    ? "run-external-drive-backup-restore-windows-linux-e2e-123"
                    : externalProofEvidenceFor(proof),
                ]),
              ),
              readable: true,
            },
          ],
          envEvidence: envEvidenceFor(hardwareGate!),
        },
      ],
      packetId: "external-evidence-hardware-compound-parity-test",
      validationNow,
    });

    expect(summary.gates[0]).toMatchObject({
      missingEvidenceDetailCount: 1,
      missingProofEvidenceCount: 1,
      status: "blocked",
    });
    expect(summary.gates[0].artifactProofs[0].missingEvidenceDetails).toEqual([
      {
        field: "OS/title/client matrix",
        path: hardwareGate!.artifactPaths[0],
      },
    ]);
    expect(summary.gates[0].artifactProofs[0].missingProofEvidenceMappings).toEqual([
      {
        path: hardwareGate!.artifactPaths[0],
        proof: backupProof,
      },
    ]);
  });

  it("blocks non-cron proof evidence mappings that omit lane identity", () => {
    for (const gate of EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS.filter((item) =>
      ["provider-live-integrations", "hardware-os-e2e", "rollout-tracks"].includes(item.id),
    )) {
      const summary = buildExternalCompletionEvidenceSummary({
        createdAt: "2026-06-16T00:00:00.000Z",
        gates: [
          {
            ...gate,
            artifactEvidence: [
              {
                checkedProofs: gate.proofRequirements,
                evidenceDetails: {
                  ...evidenceDetails,
                  ...Object.fromEntries(
                    (gate.artifactEvidenceFields?.[0]?.requiredFields ?? []).map((field) => [
                      field,
                      `${field.toLowerCase()} evidence run-123`,
                    ]),
                  ),
                },
                path: gate.artifactPaths[0],
                proofEvidence: Object.fromEntries(
                  gate.proofRequirements.map((proof, index) => [
                    proof,
                    `run-generic-proof-${index + 1}`,
                  ]),
                ),
                readable: true,
              },
            ],
            envEvidence: envEvidenceFor(gate),
          },
        ],
        packetId: `external-evidence-generic-${gate.id}-proof-mapping-test`,
        validationNow,
      });

      expect(summary.gates[0]).toMatchObject({
        missingProofEvidenceCount: gate.proofRequirements.length,
        status: "blocked",
      });
      expect(
        summary.gates[0].artifactProofs[0].missingProofEvidenceMappings.map(({ proof }) => proof),
      ).toEqual(gate.proofRequirements);
    }
  });

  it("rejects generic gate-specific evidence identifiers like the CLI preflight", () => {
    const rolloutGate = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS.find(
      (gate) => gate.id === "rollout-tracks",
    );
    expect(rolloutGate).toBeDefined();

    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...rolloutGate!,
          artifactEvidence: [
            {
              checkedProofs: rolloutGate!.proofRequirements,
              evidenceDetails: {
                ...evidenceDetails,
                "Community rollout evidence": "community-artwork-screenshot-rollout-run-123",
                "Hosted deploy evidence": "run-generic-field-123",
                "Marketplace evidence": "run-generic-field-456",
                "Mobile distribution evidence": "mobile-distribution-run-123",
                "Push-provider evidence": "push-provider-run-123",
              },
              path: rolloutGate!.artifactPaths[0],
              proofEvidence: Object.fromEntries(
                rolloutGate!.proofRequirements.map((proof) => [
                  proof,
                  externalProofEvidenceFor(proof),
                ]),
              ),
              readable: true,
            },
          ],
          envEvidence: envEvidenceFor(rolloutGate!),
        },
      ],
      packetId: "external-evidence-generic-rollout-field-test",
      validationNow,
    });

    expect(summary.gates[0]).toMatchObject({
      missingEvidenceDetailCount: 2,
      status: "blocked",
    });
    expect(summary.gates[0].artifactProofs[0].missingEvidenceDetails).toEqual([
      {
        field: "Marketplace evidence",
        path: rolloutGate!.artifactPaths[0],
      },
      {
        field: "Hosted deploy evidence",
        path: rolloutGate!.artifactPaths[0],
      },
    ]);
  });

  it("requires hosted deploy production workflow evidence instead of partial locators", () => {
    const rolloutGate = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS.find(
      (gate) => gate.id === "rollout-tracks",
    );
    expect(rolloutGate).toBeDefined();
    const gate = rolloutGate!;
    const artifactPath = gate.artifactPaths[0];
    const hostedDeployProof = "Hosted production deployment evidence is attached.";

    for (const locator of [
      "hosted-deploy https://github.com/open-game-collective/open-game-launcher/pull/123",
      "hosted-deploy workflow-123 https://github.com/open-game-collective/open-game-launcher/pull/123",
      "hosted-deploy https://github.com/open-game-collective/open-game-launcher/commit/0123456789abcdef0123456789abcdef01234567",
      "hosted-deploy workflow-123 https://github.com/open-game-collective/open-game-launcher/commit/0123456789abcdef0123456789abcdef01234567",
      "hosted-deploy workflow: https://github.com/open-game-collective/open-game-launcher/actions/runs/12345",
      "hosted-deploy CI main hosted_environment=hosted-production hosted_deploy_action=all hosted_deploy_dry_run=false workflow: https://github.com/open-game-collective/open-game-launcher/actions/runs/12345",
      "hosted-deploy CI main hosted_deploy_gate=true hosted_deploy_action=all hosted_deploy_dry_run=false workflow: https://github.com/open-game-collective/open-game-launcher/actions/runs/12345",
      "hosted-deploy CI main hosted_deploy_gate=true hosted_environment=hosted-production hosted_deploy_dry_run=false workflow: https://github.com/open-game-collective/open-game-launcher/actions/runs/12345",
      "hosted-deploy CI main hosted_deploy_gate=true hosted_environment=hosted-production hosted_deploy_action=all workflow: https://github.com/open-game-collective/open-game-launcher/actions/runs/12345",
    ]) {
      const summary = buildExternalCompletionEvidenceSummary({
        createdAt: "2026-06-16T00:00:00.000Z",
        gates: [
          {
            ...gate,
            artifactEvidence: [
              {
                content: rolloutArtifactContent(gate, locator),
                path: artifactPath,
                readable: true,
              },
            ],
            envEvidence: envEvidenceFor(gate),
          },
        ],
        packetId: "external-evidence-hosted-deploy-workflow-required-test",
        validationNow,
      });

      expect(summary.gates[0]).toMatchObject({
        missingEvidenceDetailCount: 1,
        missingProofEvidenceCount: 1,
        status: "blocked",
      });
      expect(summary.gates[0].artifactProofs[0].missingProofEvidenceMappings).toEqual([
        {
          path: artifactPath,
          proof: hostedDeployProof,
        },
      ]);
      expect(summary.gates[0].artifactProofs[0].missingEvidenceDetails).toEqual([
        {
          field: "Hosted deploy evidence",
          path: artifactPath,
        },
      ]);
      expect(summary.gates[0].artifactProofs[0].proofEvidenceFindings).toEqual([
        {
          field: `Evidence for ${hostedDeployProof}`,
          path: artifactPath,
          proof: hostedDeployProof,
          reason: "missing_lane_terms",
        },
      ]);
    }

    const validSummary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...gate,
          artifactEvidence: [
            {
              content: rolloutArtifactContent(gate, validHostedDeployEvidence),
              path: artifactPath,
              readable: true,
            },
          ],
          envEvidence: envEvidenceFor(gate),
        },
      ],
      packetId: "external-evidence-hosted-deploy-workflow-valid-test",
      validationNow,
    });

    expect(validSummary.gates[0]).toMatchObject({
      missingEvidenceDetailCount: 0,
      missingProofEvidenceCount: 0,
      status: "pass",
    });
  });

  it("rejects Store price-drop scheduler values that do not match CLI preflight", () => {
    const [storeGate] = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS;
    const artifactEvidence = validStoreArtifactEvidence(storeGate);
    artifactEvidence[1]!.evidenceDetails!["Scheduled"] = "true";

    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...storeGate,
          artifactEvidence,
          envEvidence: envEvidenceFor(storeGate),
        },
      ],
      packetId: "external-evidence-store-scheduler-expected-value-test",
      validationNow,
    });

    expect(summary.gates[0]).toMatchObject({
      missingEvidenceDetailCount: 1,
      status: "blocked",
    });
    expect(summary.gates[0].artifactProofs[1].missingEvidenceDetails).toEqual([
      {
        field: "Scheduled",
        path: storeGate.artifactPaths[1],
      },
    ]);
  });

  it("requires lane-scoped hosted Supabase cron evidence details", () => {
    const cronGate = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS.find(
      (gate) => gate.id === "hosted-supabase-cron",
    );
    expect(cronGate).toBeDefined();

    const genericArtifactEvidence: ExternalCompletionEvidenceArtifactInput[] = [
      {
        checkedProofs: cronGate!.proofRequirements,
        evidenceDetails: {
          ...evidenceDetails,
          Function: "notify-price-drop",
          "Hosted cron table": "store_price_drop_notification_runs",
          "Run ID": "run-price-drop-live-123",
          Scheduled: "scheduled",
          Status: "completed",
          "dry_run=false": "confirmed false",
        },
        path: cronGate!.artifactPaths[0],
        proofEvidence: Object.fromEntries(
          cronGate!.proofRequirements.map((proof, index) => [
            proof,
            `workflow-hosted-cron-${index + 1}`,
          ]),
        ),
        readable: true,
      },
    ];

    const genericSummary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...cronGate!,
          artifactEvidence: genericArtifactEvidence,
          envEvidence: envEvidenceFor(cronGate!),
        },
      ],
      packetId: "external-evidence-generic-hosted-cron-test",
      validationNow,
    });

    expect(genericSummary.gates[0]).toMatchObject({
      missingEvidenceDetailCount: 18,
      status: "blocked",
    });
    expect(
      genericSummary.gates[0].artifactProofs[0].missingEvidenceDetails.map(({ field }) => field),
    ).toEqual([
      "price-drop: Hosted cron table",
      "price-drop: Function",
      "price-drop: Run ID",
      "price-drop: Scheduled",
      "price-drop: dry_run=false",
      "price-drop: Status",
      "presence-poll: Hosted cron table",
      "presence-poll: Function",
      "presence-poll: Run ID",
      "presence-poll: Scheduled",
      "presence-poll: dry_run=false",
      "presence-poll: Status",
      "account-deletion: Hosted cron table",
      "account-deletion: Function",
      "account-deletion: Run ID",
      "account-deletion: Scheduled",
      "account-deletion: dry_run=false",
      "account-deletion: Status",
    ]);

    const laneScopedSummary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...cronGate!,
          artifactEvidence: validHostedSupabaseCronArtifactEvidence(cronGate!),
          envEvidence: envEvidenceFor(cronGate!),
        },
      ],
      packetId: "external-evidence-lane-scoped-hosted-cron-test",
      validationNow,
    });

    expect(laneScopedSummary.gates[0]).toMatchObject({
      missingEvidenceDetailCount: 0,
      status: "pass",
    });
  });

  it("keeps hosted Supabase cron lane scope through nested artifact subsections", () => {
    const cronGate = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS.find(
      (gate) => gate.id === "hosted-supabase-cron",
    );
    expect(cronGate).toBeDefined();

    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...cronGate!,
          artifactEvidence: [
            {
              content: [
                ...cronGate!.proofRequirements.map((proof) => `- [x] ${proof}`),
                ...cronGate!.proofRequirements.map(
                  (proof) => `- Evidence for ${proof}: ${hostedCronProofEvidenceFor(proof)}`,
                ),
                "- Captured at: 2026-06-16T12:00:00.000Z",
                "- Release ref: refs/tags/v0.1.0",
                "- Commit SHA: 0123456789abcdef0123456789abcdef01234567",
                "- Environment: hosted staging",
                "- Operator: Release Ops",
                "- Redacted run IDs, dashboard links, screenshots, or signed deployment logs: run-hosted-cron-nested-123",
                "- Redaction notes: Raw secrets removed before commit",
                "## price-drop",
                "### Details",
                "- Hosted cron table: store_price_drop_notification_runs",
                "- Function: notify-price-drop",
                "- Run ID: price-drop-run-nested-123",
                "- Scheduled: scheduled",
                "- dry_run=false: confirmed false",
                "- Status: completed",
                "## presence-poll",
                "### Details",
                "- Hosted cron table: presence_poll_runs",
                "- Function: poll-platform-presence",
                "- Run ID: presence-poll-run-nested-123",
                "- Scheduled: scheduled",
                "- dry_run=false: confirmed false",
                "- Status: completed",
                "## account-deletion",
                "### Details",
                "- Hosted cron table: account_deletion_processor_runs",
                "- Function: process-account-deletions",
                "- Run ID: account-deletion-run-nested-123",
                "- Scheduled: scheduled",
                "- dry_run=false: confirmed false",
                "- Status: completed",
              ].join("\n"),
              path: cronGate!.artifactPaths[0],
            },
          ],
          envEvidence: envEvidenceFor(cronGate!),
        },
      ],
      packetId: "external-evidence-nested-hosted-cron-lanes-test",
      validationNow,
    });

    expect(summary.gates[0]).toMatchObject({
      missingEvidenceDetailCount: 0,
      status: "pass",
    });
  });

  it("rejects duplicate hosted Supabase cron lane details when any value is invalid", () => {
    const cronGate = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS.find(
      (gate) => gate.id === "hosted-supabase-cron",
    );
    expect(cronGate).toBeDefined();
    const artifactPath = cronGate!.artifactPaths[0];

    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...cronGate!,
          artifactEvidence: [
            {
              content: [
                ...cronGate!.proofRequirements.map((proof) => `- [x] ${proof}`),
                ...cronGate!.proofRequirements.map(
                  (proof) => `- Evidence for ${proof}: ${hostedCronProofEvidenceFor(proof)}`,
                ),
                "- Captured at: 2026-06-16T12:00:00.000Z",
                "- Release ref: refs/tags/v0.1.0",
                "- Commit SHA: 0123456789abcdef0123456789abcdef01234567",
                "- Environment: hosted staging",
                "- Operator: Release Ops",
                "- Redacted run IDs, dashboard links, screenshots, or signed deployment logs: run-hosted-cron-nested-123",
                "- Redaction notes: Raw secrets removed before commit",
                "## price-drop",
                "- Hosted cron table: store_price_drop_notification_runs",
                "- Hosted cron table: wrong_table",
                "- Function: notify-price-drop",
                "- Run ID: price-drop-run-nested-123",
                "- Scheduled: scheduled",
                "- dry_run=false: confirmed false",
                "- Status: completed",
                "## presence-poll",
                "- Hosted cron table: presence_poll_runs",
                "- Function: poll-platform-presence",
                "- Run ID: presence-poll-run-nested-123",
                "- Scheduled: scheduled",
                "- dry_run=false: confirmed false",
                "- Status: completed",
                "## account-deletion",
                "- Hosted cron table: account_deletion_processor_runs",
                "- Function: process-account-deletions",
                "- Run ID: account-deletion-run-nested-123",
                "- Scheduled: scheduled",
                "- dry_run=false: confirmed false",
                "- Status: completed",
              ].join("\n"),
              path: artifactPath,
            },
          ],
          envEvidence: envEvidenceFor(cronGate!),
        },
      ],
      packetId: "external-evidence-duplicate-hosted-cron-lane-test",
      validationNow,
    });

    expect(summary.gates[0]).toMatchObject({
      missingEvidenceDetailCount: 1,
      status: "blocked",
    });
    expect(summary.gates[0].artifactProofs[0].missingEvidenceDetails).toEqual([
      {
        field: "price-drop: Hosted cron table",
        path: artifactPath,
      },
    ]);
  });

  it("rejects hosted Supabase cron lane values that do not match CLI preflight", () => {
    const cronGate = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS.find(
      (gate) => gate.id === "hosted-supabase-cron",
    );
    expect(cronGate).toBeDefined();

    const artifactEvidence = validHostedSupabaseCronArtifactEvidence(cronGate!);
    artifactEvidence[0]!.evidenceDetails!["presence-poll: Function"] = "notify-price-drop";
    artifactEvidence[0]!.evidenceDetails!["price-drop: Scheduled"] = "true";
    artifactEvidence[0]!.evidenceDetails!["account-deletion: Status"] = "succeeded";

    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...cronGate!,
          artifactEvidence,
          envEvidence: envEvidenceFor(cronGate!),
        },
      ],
      packetId: "external-evidence-hosted-cron-expected-value-test",
      validationNow,
    });

    expect(summary.gates[0]).toMatchObject({
      missingEvidenceDetailCount: 3,
      status: "blocked",
    });
    expect(
      summary.gates[0].artifactProofs[0].missingEvidenceDetails.map(({ field }) => field),
    ).toEqual(["price-drop: Scheduled", "presence-poll: Function", "account-deletion: Status"]);
  });

  it("blocks scheduler proof evidence mappings that omit lane identity", () => {
    const cronGate = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS.find(
      (gate) => gate.id === "hosted-supabase-cron",
    );
    expect(cronGate).toBeDefined();

    const genericArtifactEvidence = validHostedSupabaseCronArtifactEvidence(cronGate!);
    genericArtifactEvidence[0]!.proofEvidence = Object.fromEntries(
      cronGate!.proofRequirements.map((proof, index) => [
        proof,
        `workflow-hosted-cron-${index + 1}`,
      ]),
    );

    const genericSummary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...cronGate!,
          artifactEvidence: genericArtifactEvidence,
          envEvidence: envEvidenceFor(cronGate!),
        },
      ],
      packetId: "external-evidence-generic-scheduler-proof-mapping-test",
      validationNow,
    });

    expect(genericSummary.gates[0]).toMatchObject({
      missingProofEvidenceCount: 3,
      status: "blocked",
    });
    expect(
      genericSummary.gates[0].artifactProofs[0].missingProofEvidenceMappings.map(
        ({ proof }) => proof,
      ),
    ).toEqual(cronGate!.proofRequirements);

    const laneScopedSummary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...cronGate!,
          artifactEvidence: validHostedSupabaseCronArtifactEvidence(cronGate!),
          envEvidence: envEvidenceFor(cronGate!),
        },
      ],
      packetId: "external-evidence-lane-scheduler-proof-mapping-test",
      validationNow,
    });

    expect(laneScopedSummary.gates[0]).toMatchObject({
      missingProofEvidenceCount: 0,
      status: "pass",
    });
  });

  it("blocks unapproved evidence locator urls and local screenshot paths", () => {
    const [storeGate] = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS;
    const artifactEvidence = validStoreArtifactEvidence(storeGate);
    artifactEvidence[0]!.evidenceDetails![
      "Redacted run IDs, dashboard links, screenshots, or signed deployment logs"
    ] = "https://google.com/proof docs/verification/screenshots/local-proof.png";

    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...storeGate,
          artifactEvidence,
          envEvidence: envEvidenceFor(storeGate),
        },
      ],
      packetId: "external-evidence-locator-test",
      validationNow,
    });

    expect(summary.gates[0]).toMatchObject({
      missingEvidenceDetailCount: 1,
      status: "blocked",
    });
    expect(JSON.stringify(summary)).not.toContain("https://google.com/proof");
    expect(JSON.stringify(summary)).not.toContain("docs/verification/screenshots/local-proof.png");
  });

  it("blocks allowed evidence locator hosts when URLs use explicit ports", () => {
    const [storeGate] = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS;
    const artifactEvidence = validStoreArtifactEvidence(storeGate);
    artifactEvidence[0]!.evidenceDetails![
      "Redacted run IDs, dashboard links, screenshots, or signed deployment logs"
    ] = "https://dashboard.stripe.com:8443/events/evt_1234567890";

    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...storeGate,
          artifactEvidence,
          envEvidence: envEvidenceFor(storeGate),
        },
      ],
      packetId: "external-evidence-port-locator-test",
      validationNow,
    });

    expect(summary.gates[0]).toMatchObject({
      missingEvidenceDetailCount: 1,
      status: "blocked",
    });
    expect(JSON.stringify(summary)).not.toContain("dashboard.stripe.com:8443");
  });

  it("rejects weak locator IDs and bare local evidence paths", () => {
    const [storeGate] = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS;
    const weakRunIdArtifactEvidence = validStoreArtifactEvidence(storeGate);
    weakRunIdArtifactEvidence[0]!.evidenceDetails![
      "Redacted run IDs, dashboard links, screenshots, or signed deployment logs"
    ] = "run-abc";
    const weakRunIdSummary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...storeGate,
          artifactEvidence: weakRunIdArtifactEvidence,
          envEvidence: envEvidenceFor(storeGate),
        },
      ],
      packetId: "external-evidence-weak-run-id-test",
      validationNow,
    });

    expect(weakRunIdSummary.gates[0]).toMatchObject({
      missingEvidenceDetailCount: 1,
      status: "blocked",
    });

    const localPathArtifactEvidence = validStoreArtifactEvidence(storeGate);
    localPathArtifactEvidence[0]!.evidenceDetails![
      "Redacted run IDs, dashboard links, screenshots, or signed deployment logs"
    ] = "run-123 docs/verification/external/local.md";
    const localPathSummary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...storeGate,
          artifactEvidence: localPathArtifactEvidence,
          envEvidence: envEvidenceFor(storeGate),
        },
      ],
      packetId: "external-evidence-local-path-locator-test",
      validationNow,
    });

    expect(localPathSummary.gates[0]).toMatchObject({
      missingEvidenceDetailCount: 1,
      status: "blocked",
    });
    expect(JSON.stringify(localPathSummary)).not.toContain("docs/verification/external/local.md");
  });

  it("blocks template-only artifacts once proof or detail rows are filled", () => {
    const [storeGate] = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS;
    const artifactEvidence = validStoreArtifactEvidence(storeGate);
    artifactEvidence[0]!.content = [
      "> Template only. No external evidence has been captured yet.",
      `- [x] ${storeGate.artifactProofs?.[0].requiredProofs[0]}`,
      "- Captured at: 2026-06-16T12:00:00.000Z",
    ].join("\n");

    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...storeGate,
          artifactEvidence,
          envEvidence: envEvidenceFor(storeGate),
        },
      ],
      packetId: "external-evidence-template-banner-test",
      validationNow,
    });

    expect(summary.gates[0]).toMatchObject({
      status: "blocked",
      templateOnlyFindingCount: 1,
    });
    expect(summary.gates[0].blockers).toContain("1 blocked template-only banner(s)");
  });

  it("blocks checked proofs that lack proof-specific evidence mappings", () => {
    const [storeGate] = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS;
    const artifactEvidence = validStoreArtifactEvidence(storeGate);
    const missingMappingProof = storeGate.artifactProofs?.[0].requiredProofs[1] ?? "";
    delete artifactEvidence[0]!.proofEvidence![missingMappingProof];

    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...storeGate,
          artifactEvidence,
          envEvidence: envEvidenceFor(storeGate),
        },
      ],
      packetId: "external-evidence-missing-proof-mapping-test",
      validationNow,
    });

    expect(summary.passCount).toBe(0);
    expect(summary.reviewCount).toBe(0);
    expect(summary.gates[0]).toMatchObject({
      missingArtifactProofCount: 0,
      missingProofCount: 0,
      missingProofEvidenceCount: 1,
      status: "blocked",
    });
    expect(summary.gates[0].blockers).toContain("1 missing proof-specific Evidence for mapping(s)");
    expect(summary.gates[0].recommendedCommands).toContain(
      "OGL_EXTERNAL_EVIDENCE_GATES=store-stripe-live pnpm external:evidence:template",
    );
    expect(summary.gates[0].artifactProofs[0].missingProofEvidenceMappings).toEqual([
      {
        path: storeGate.artifactPaths[0],
        proof: missingMappingProof,
      },
    ]);
  });

  it("keeps artifact-specific proof counts scoped to explicit artifact mappings", () => {
    const rolloutGate = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS.find(
      (gate) => gate.id === "rollout-tracks",
    );
    expect(rolloutGate).toBeDefined();
    const artifactPath = rolloutGate!.artifactPaths[0];

    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...rolloutGate!,
          artifactEvidence: [
            {
              checkedProofs: [],
              evidenceDetails,
              path: artifactPath,
              readable: true,
            },
          ],
          envEvidence: envEvidenceFor(rolloutGate!),
        },
      ],
      packetId: "external-evidence-rollout-artifact-proof-scope-test",
      validationNow,
    });

    expect(summary.gates[0]).toMatchObject({
      missingArtifactProofCount: 0,
      missingProofCount: rolloutGate!.proofRequirements.length,
      status: "blocked",
    });
    expect(summary.gates[0].artifactProofs[0].missingProofs).toEqual(
      rolloutGate!.proofRequirements,
    );
    expect(summary.gates[0].blockers).not.toContain(
      `${rolloutGate!.proofRequirements.length} missing artifact-specific proof row(s)`,
    );
  });

  it("reports secret-scan blockers without storing raw artifact content", () => {
    const [storeGate] = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS;
    const rawSecret = "sk_live_forbiddenfixture123";
    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...storeGate,
          artifactEvidence: [
            {
              ...validStoreArtifactEvidence(storeGate)[0],
              content: `- [x] ${storeGate.proofRequirements[0]}\n${rawSecret}`,
            },
            validStoreArtifactEvidence(storeGate)[1],
          ],
          envEvidence: envEvidenceFor(storeGate),
        },
      ],
      packetId: "external-evidence-secret-scan-test",
      validationNow,
    });

    expect(summary.gates[0].secretFindingCount).toBe(1);
    expect(summary.gates[0].blockers).toContain("1 blocked secret-scan finding(s)");
    expect(JSON.stringify(summary)).toContain("Stripe secret key");
    expect(JSON.stringify(summary)).not.toContain(rawSecret);
  });

  it("reports secret-scan blockers from structured evidence fields", () => {
    const [storeGate] = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS;
    const rawSecret = "sk_live_structured_forbidden_fixture_123";
    const artifactEvidence = validStoreArtifactEvidence(storeGate);
    artifactEvidence[0]!.evidenceDetails!["Supabase function log run ID"] =
      `run-supabase-stripe-webhook-123 ${rawSecret}`;

    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...storeGate,
          artifactEvidence,
          envEvidence: envEvidenceFor(storeGate),
        },
      ],
      packetId: "external-evidence-structured-secret-scan-test",
      validationNow,
    });

    expect(summary.gates[0].secretFindingCount).toBe(1);
    expect(summary.gates[0].blockers).toContain("1 blocked secret-scan finding(s)");
    expect(JSON.stringify(summary)).toContain("Stripe secret key");
    expect(JSON.stringify(summary)).not.toContain(rawSecret);
  });

  it("reports Stripe test and restricted key secret-scan blockers like the CLI preflight", () => {
    const [storeGate] = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS;
    const artifactEvidence = validStoreArtifactEvidence(storeGate);
    artifactEvidence[0]!.content = [
      "- STRIPE_SECRET_KEY=sk_test_51OgLauncherEvidenceAlpha1234567890",
      "- STRIPE_RESTRICTED_KEY=rk_live_51OgLauncherEvidenceAlpha1234567890",
    ].join("\n");

    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...storeGate,
          artifactEvidence,
          envEvidence: envEvidenceFor(storeGate),
        },
      ],
      packetId: "external-evidence-stripe-secret-scan-test",
      validationNow,
    });

    expect(summary.gates[0]).toMatchObject({
      secretFindingCount: 1,
      status: "blocked",
    });
    expect(summary.gates[0].blockers).toContain("1 blocked secret-scan finding(s)");
    expect(summary.gates[0].artifactProofs[0].secretFindingLabels).toEqual(["Stripe secret key"]);
    expect(JSON.stringify(summary)).not.toContain("sk_test_51OgLauncherEvidenceAlpha1234567890");
    expect(JSON.stringify(summary)).not.toContain("rk_live_51OgLauncherEvidenceAlpha1234567890");
  });

  it("reports GitHub token blockers without exposing raw token values", () => {
    const rolloutGate = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS.find(
      (gate) => gate.id === "rollout-tracks",
    );
    expect(rolloutGate).toBeDefined();
    const gate = rolloutGate!;
    const artifactPath = gate.artifactPaths[0];

    for (const rawGithubToken of [
      "ghp_abcdefghijklmnopqrstuvwxyz1234567890",
      "github_pat_11AA22BB03abcdefghijklmnopqrstuvwxyz1234567890",
      "GITHUB_TOKEN=ghs_abcdefghijklmnopqrstuvwxyz1234567890",
      "GH_TOKEN=gho_abcdefghijklmnopqrstuvwxyz1234567890",
      "GITHUB_PAT=ghp_abcdefghijklmnopqrstuvwxyz1234567890",
    ]) {
      const summary = buildExternalCompletionEvidenceSummary({
        createdAt: "2026-06-16T00:00:00.000Z",
        gates: [
          {
            ...gate,
            artifactEvidence: [
              {
                content: [
                  rolloutArtifactContent(gate, validHostedDeployEvidence),
                  rawGithubToken,
                ].join("\n"),
                path: artifactPath,
                readable: true,
              },
            ],
            envEvidence: envEvidenceFor(gate),
          },
        ],
        packetId: "external-evidence-github-token-secret-scan-test",
        validationNow,
      });

      expect(summary.gates[0].secretFindingCount).toBe(1);
      expect(summary.gates[0].blockers).toContain("1 blocked secret-scan finding(s)");
      expect(summary.gates[0].artifactProofs[0].secretFindingLabels).toEqual(["Raw GitHub token"]);
      expect(JSON.stringify(summary)).not.toContain(rawGithubToken);
    }

    const redactedSummary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...gate,
          artifactEvidence: [
            {
              content: [
                rolloutArtifactContent(gate, validHostedDeployEvidence),
                "GITHUB_TOKEN=[redacted]",
                "GH_TOKEN=<redacted>",
                "GITHUB_PAT=***",
              ].join("\n"),
              path: artifactPath,
              readable: true,
            },
          ],
          envEvidence: envEvidenceFor(gate),
        },
      ],
      packetId: "external-evidence-github-token-redacted-test",
      validationNow,
    });

    expect(redactedSummary.gates[0]).toMatchObject({
      secretFindingCount: 0,
      status: "pass",
    });
  });

  it("reports mobile push secret blockers from rollout artifacts", () => {
    const rolloutGate = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS.find(
      (gate) => gate.id === "rollout-tracks",
    );
    expect(rolloutGate).toBeDefined();
    const rawSecret = "FCM_SERVER_KEY=fcm_live_super_secret_1234567890";

    const summary = buildExternalCompletionEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      gates: [
        {
          ...rolloutGate!,
          artifactEvidence: [
            {
              checkedProofs: rolloutGate!.proofRequirements,
              content: [
                ...rolloutGate!.proofRequirements.map((proof) => `- [x] ${proof}`),
                rawSecret,
              ].join("\n"),
              evidenceDetails: {
                ...evidenceDetails,
                "Hosted deploy evidence": validHostedDeployEvidence,
                "Marketplace evidence": "marketplace-review-live-123",
                "Mobile distribution evidence": "mobile-store-review-live-123",
                "Push-provider evidence": "push-provider-live-123",
              },
              path: rolloutGate!.artifactPaths[0],
              proofEvidence: Object.fromEntries(
                rolloutGate!.proofRequirements.map((proof, index) => [
                  proof,
                  externalProofEvidenceFor(proof, `rollout-proof-${index + 1}`),
                ]),
              ),
              readable: true,
            },
          ],
          envEvidence: envEvidenceFor(rolloutGate!),
        },
      ],
      packetId: "external-evidence-mobile-push-secret-scan-test",
      validationNow,
    });

    expect(summary.gates[0].secretFindingCount).toBe(1);
    expect(summary.gates[0].blockers).toContain("1 blocked secret-scan finding(s)");
    expect(JSON.stringify(summary)).toContain("Raw mobile push secret");
    expect(JSON.stringify(summary)).not.toContain("fcm_live_super_secret");
  });

  it("keeps rollout evidence fields aligned with release lanes", () => {
    const rolloutGate = EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS.find(
      (gate) => gate.id === "rollout-tracks",
    );

    expect(rolloutGate?.artifactEvidenceFields?.[0]?.requiredFields).toEqual([
      "Community rollout evidence",
      "Marketplace evidence",
      "Mobile distribution evidence",
      "Push-provider evidence",
      "Hosted deploy evidence",
    ]);
  });
});
