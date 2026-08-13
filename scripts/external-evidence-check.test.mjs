import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

import {
  artifactTemplate,
  artifactWorklistReport,
  collectStatuses,
  evidenceGates,
  gateStatus,
  nextStepsReport,
  operatorPacketReport,
  parseArgs,
  preflightReport,
  requiredEnvForArtifact,
  runbookReport,
  selectedGates,
  statusReport,
} from "./external-evidence-check.mjs";
import {
  completionGateRunIdEnvName,
  hostedCronEvidenceArtifactDigest,
  hostedCronEvidenceReceiptDigest,
  hostedCronEvidenceReceiptDigestAlgorithm,
  hostedCronEvidenceReceiptEnvName,
} from "./hosted-cron-evidence.mjs";

const runbook = readFileSync(
  new URL("../docs/runbooks/external-completion-evidence.md", import.meta.url),
  "utf8",
);
const externalEvidenceIndex = readFileSync(
  new URL("../docs/verification/external/README.md", import.meta.url),
  "utf8",
);
const verificationReadme = readFileSync(
  new URL("../docs/verification/README.md", import.meta.url),
  "utf8",
);
const screenshotManifest = JSON.parse(
  readFileSync(
    new URL("../docs/verification/screenshot-manifest.json", import.meta.url),
    "utf8",
  ),
);
const functionsEnvExample = readFileSync(
  new URL("../supabase/functions/.env.example", import.meta.url),
  "utf8",
);
const localAudit = readFileSync(
  new URL("../docs/verification/local-completion-audit.md", import.meta.url),
  "utf8",
);
const featurePlan = readFileSync(
  new URL("../FEATURE_PLAN.md", import.meta.url),
  "utf8",
);
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const prBody = readFileSync(new URL("../PR_BODY.md", import.meta.url), "utf8");
const security = readFileSync(new URL("../SECURITY.md", import.meta.url), "utf8");
const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const externalSummarySource = readFileSync(
  new URL(
    "../launcher/src/lib/external-completion-evidence-summary.ts",
    import.meta.url,
  ),
  "utf8",
);

function fakeExists(existing) {
  return (path) => existing.includes(path);
}

function fakeRead(contentsByPath) {
  return (path) => {
    if (!(path in contentsByPath)) throw new Error(`missing fixture: ${path}`);
    return contentsByPath[path];
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const baseEvidenceDetailFields = Object.freeze([
  "Captured at",
  "Release ref",
  "Commit SHA",
  "Operator",
  "Environment",
  "Redacted run IDs, dashboard links, screenshots, or signed deployment logs",
  "Redaction notes",
]);
const hostedCronRestUrlPrerequisite =
  "SUPABASE_REST_URL or SUPABASE_URL or SUPABASE_PROJECT_REF";
const hostedCronRestAuthPrerequisite =
  "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY + SUPABASE_AUTH_JWT";
const validHardwareOsMatrix =
  "Windows title:redacted-game client:Steam run:win-matrix-123 | macOS title:redacted-game client:Steam run:macos-matrix-123 | Linux title:redacted-game client:Steam run:linux-matrix-123";
const validHostedDeployEvidence =
  "hosted-deploy CI main hosted_deploy_gate=true hosted_environment=hosted-production hosted_deploy_action=all hosted_deploy_dry_run=false workflow: https://github.com/open-game-collective/open-game-launcher/actions/runs/12345";
const rolloutProof =
  "Hosted community artwork rollout is exercised beyond fixtures.";
const rolloutEvidence = "run-community-artwork-rollout-123";
const fixedEvidenceClock = Object.freeze({
  OGL_EXTERNAL_EVIDENCE_NOW: "2026-06-17T12:00:00.000Z",
});

function requiredEvidenceFieldsForArtifact(gate, artifactPath) {
  return [
    ...baseEvidenceDetailFields,
    ...(gate.artifactEvidenceFields?.find((item) => item.path === artifactPath)
      ?.requiredFields ?? []),
  ];
}

function missingEvidenceDetails(gate, artifactPath, fields) {
  return (fields ?? requiredEvidenceFieldsForArtifact(gate, artifactPath)).map(
    (field) => ({
      field,
      path: artifactPath,
    }),
  );
}

function gateSpecificEvidenceDetails(gate) {
  const fields = [
    ...new Set(
      gate.artifactEvidenceFields?.flatMap((item) => item.requiredFields) ?? [],
    ),
  ];
  return fields
    .map((field) => {
      if (field === "dry_run=false") return "- dry_run=false: false";
      if (field === "Function") return "- Function: poll-platform-presence";
      if (field === "Hosted cron table") {
        return "- Hosted cron table: presence_poll_runs";
      }
      if (field === "Scheduled") return "- Scheduled: scheduled";
      if (field === "Status") return "- Status: completed";
      if (field === "Stripe Dashboard evidence") {
        return "- Stripe Dashboard evidence: https://dashboard.stripe.com/events/evt_1234567890abcdef";
      }
      if (field === "Stripe webhook event ID") {
        return "- Stripe webhook event ID: evt_1234567890abcdef";
      }
      if (field === "Supabase function log run ID") {
        return "- Supabase function log run ID: https://supabase.com/dashboard/project/awebfvfyqzwapcgixdfj/functions/logs/run-12345";
      }
      if (field === "License key custody evidence") {
        return "- License key custody evidence: license-key-custody workflow-123";
      }
      if (field === "Live license issuance evidence") {
        return "- Live license issuance evidence: live-license-issuance workflow-123";
      }
      if (field === "OS/title/client matrix") {
        return `- OS/title/client matrix: ${validHardwareOsMatrix}`;
      }
      if (field === "Session/run ID") {
        return "- Session/run ID: overlay-session-run-123 duration:30m";
      }
      if (field === "Provider/client matrix") {
        return "- Provider/client matrix: provider-client matrix workflow-123";
      }
      if (field === "Hosted deploy evidence") {
        return `- Hosted deploy evidence: ${validHostedDeployEvidence}`;
      }
      if (field === "Community rollout evidence") {
        return `- Community rollout evidence: ${rolloutEvidence}`;
      }
      if (field === "Marketplace evidence") {
        return "- Marketplace evidence: plugin marketplace execution update workflow-123";
      }
      return `- ${field}: ${field.toLowerCase()} evidence run-123`;
    })
    .join("\n");
}

function proofEvidenceValueForProof(proof, fallback) {
  if (proof.includes("Stripe webhook signature"))
    return "run-stripe-webhook-signature-123";
  if (proof.includes("Stripe Tax and invoice"))
    return "run-stripe-dashboard-tax-invoice-123";
  if (proof.includes("Production license signing key custody"))
    return "run-license-key-custody-live-license-issuance-123";
  if (proof.includes("poll-platform-presence"))
    return "workflow-presence-poll-123";
  if (proof.includes("process-account-deletions"))
    return "workflow-account-deletion-123";
  if (proof.includes("Non-Steam presence"))
    return "run-non-steam-presence-bridge-provider-123";
  if (proof.includes("Provider-approved catalog/cloud"))
    return "run-provider-approved-catalog-cloud-transfer-123";
  if (proof.includes("Achievement/provider cache"))
    return "run-achievement-provider-cache-real-client-e2e-123";
  if (proof.includes("Fullscreen/anti-cheat overlay"))
    return "run-fullscreen-anticheat-overlay-session-123";
  if (proof.includes("Long native overlay sessions"))
    return "run-native-overlay-long-session-duration-45min-123";
  if (proof.includes("External-drive backup/restore"))
    return "run-external-drive-backup-restore-Windows-macOS-Linux-e2e-123";
  if (proof.includes("Real client mount/apply"))
    return "run-client-mount-apply-provider-client-123";
  if (proof === rolloutProof) return rolloutEvidence;
  if (proof.includes("Plugin marketplace"))
    return "run-plugin-marketplace-execution-update-review-123";
  if (proof.includes("Hosted production deployment"))
    return validHostedDeployEvidence;
  return fallback;
}

const hostedCronLaneDetails = Object.freeze({
  "account-deletion": [
    "### account-deletion",
    "- Hosted cron table: account_deletion_processor_runs",
    "- Function: process-account-deletions",
    "- Run ID: account-deletion-run-123",
    "- Scheduled: scheduled",
    "- dry_run=false: confirmed false",
    "- Status: completed",
  ].join("\n"),
  "presence-poll": [
    "### presence-poll",
    "- Hosted cron table: presence_poll_runs",
    "- Function: poll-platform-presence",
    "- Run ID: presence-poll-run-123",
    "- Scheduled: scheduled",
    "- dry_run=false: confirmed false",
    "- Status: completed",
  ].join("\n"),
});

function allHostedCronLaneDetails() {
  return Object.values(hostedCronLaneDetails).join("\n");
}

function hostedCronLaneDetailsWithReceiptDigest(digest) {
  return Object.fromEntries(
    Object.entries(hostedCronLaneDetails).map(([id, details]) => [
      id,
      [details, `- Hosted cron receipt SHA256: ${digest}`].join("\n"),
    ]),
  );
}

function allHostedCronLaneDetailsWithReceiptDigest(digest) {
  return Object.values(hostedCronLaneDetailsWithReceiptDigest(digest)).join(
    "\n",
  );
}

function hostedCronReceiptFixture(overrides = {}) {
  const receipt = {
    digestAlgorithm: hostedCronEvidenceReceiptDigestAlgorithm,
    freshnessHours: {
      "account-deletion": 25,
      "presence-poll": 0.25,
    },
    gateRunId: overrides.gateRunId ?? "completion-gate-run-123",
    generatedAt: overrides.generatedAt ?? "2026-06-17T11:50:00.000Z",
    lanes: overrides.lanes ?? [
      {
        completedAt: "2026-06-17T11:45:00.000Z",
        counts: {},
        dryRun: false,
        functionName: "poll-platform-presence",
        id: "presence-poll",
        runId: "presence-poll-run-123",
        status: "completed",
        table: "presence_poll_runs",
        triggerSource: "scheduled",
      },
      {
        completedAt: "2026-06-17T11:45:00.000Z",
        counts: {},
        dryRun: false,
        functionName: "process-account-deletions",
        id: "account-deletion",
        runId: "account-deletion-run-123",
        status: "completed",
        table: "account_deletion_processor_runs",
        triggerSource: "scheduled",
      },
    ],
    release: {
      commitSha: "0123456789abcdef0123456789abcdef01234567",
      ref: "v1.2.3",
    },
    restTargetProjectRef: "awebfvfyqzwapcgixdfj",
    selectedChecks: overrides.selectedChecks ?? [
      "presence-poll",
      "account-deletion",
    ],
    type: "hosted-cron-evidence-receipt",
    version: 1,
  };
  const receiptWithArtifactDigest = {
    ...receipt,
    artifactDigest: hostedCronEvidenceArtifactDigest(receipt),
  };
  return {
    ...receiptWithArtifactDigest,
    digest: hostedCronEvidenceReceiptDigest(receiptWithArtifactDigest),
  };
}

function receiptEnv(receiptPath = ".codex/completion-gate/hosted-cron.json") {
  return {
    ...configuredEnv,
    ...releaseBoundaryContext,
    [completionGateRunIdEnvName]: "completion-gate-run-123",
    [hostedCronEvidenceReceiptEnvName]: receiptPath,
  };
}

function proofContent(gate, extra = "") {
  return [
    ...gate.requiredProofs.map((proof) => `- [x] ${proof}`),
    "",
    ...gate.requiredProofs.map(
      (proof, index) =>
        `- Evidence for ${proof}: ${proofEvidenceValueForProof(
          proof,
          `run-${gate.id}-${index + 1}, dashboard screenshot redacted in artifact bundle`,
        )}`,
    ),
    gateSpecificEvidenceDetails(gate),
    extra,
  ]
    .filter(Boolean)
    .join("\n");
}

function checkedProofContentWithoutProofEvidence(gate, extra = "") {
  return [
    ...gate.requiredProofs.map((proof) => `- [x] ${proof}`),
    gateSpecificEvidenceDetails(gate),
    extra,
  ]
    .filter(Boolean)
    .join("\n");
}

function capturedEvidenceDetails(overrides = {}) {
  const capturedAt = overrides.capturedAt ?? "2026-06-16T12:00:00.000Z";
  const releaseRef = overrides.releaseRef ?? "v1.2.3";
  const commitSha =
    overrides.commitSha ?? "0123456789abcdef0123456789abcdef01234567";
  const locator =
    overrides.locator ??
    "run-123, dashboard screenshot redacted in artifact bundle";
  return [
    `- Captured at: ${capturedAt}`,
    ...(overrides.includeReleaseBoundary === false
      ? []
      : [`- Release ref: ${releaseRef}`, `- Commit SHA: ${commitSha}`]),
    "- Operator: release-runner",
    "- Environment: hosted-staging",
    `- Redacted run IDs, dashboard links, screenshots, or signed deployment logs: ${locator}`,
    "- Redaction notes: raw secrets removed before commit",
  ].join("\n");
}

function completeEvidenceContentForGate(
  gate,
  details = capturedEvidenceDetails(),
) {
  const extra =
    gate.id === "hosted-supabase-cron"
      ? [allHostedCronLaneDetails(), details].join("\n")
      : details;
  return proofContent(gate, extra);
}

function completeEvidenceArtifacts(details = capturedEvidenceDetails()) {
  return Object.fromEntries(
    evidenceGates.flatMap((gate) =>
      gate.artifactPaths.map((artifactPath) => [
        artifactPath,
        completeEvidenceContentForGate(gate, details),
      ]),
    ),
  );
}

function placeholderEvidenceDetails() {
  return [
    "- Captured at: TBD",
    "- Release ref: TBD",
    "- Commit SHA: TODO",
    "- Operator: TODO",
    "- Environment: N/A",
    "- Redacted run IDs, dashboard links, screenshots, or signed deployment logs: example",
    "- Redaction notes: none",
  ].join("\n");
}

function weakEvidenceDetails() {
  return [
    "- Captured at: 2026-06-16T12:00:00.000Z",
    "- Release ref: v1.2.3",
    "- Commit SHA: 0123456789abcdef0123456789abcdef01234567",
    "- Operator: me",
    "- Environment: test",
    "- Redacted run IDs, dashboard links, screenshots, or signed deployment logs: see above",
    "- Redaction notes: ok",
  ].join("\n");
}

function externalSummaryGateBlock(id) {
  const idMarker = `id: "${id}"`;
  const markerIndex = externalSummarySource.indexOf(idMarker);
  assert.notEqual(markerIndex, -1, `External summary gate ${id} not found.`);
  const blockStarts = [
    ...externalSummarySource.slice(0, markerIndex).matchAll(/^  \{/gm),
  ];
  const blockStart = blockStarts.at(-1)?.index ?? -1;
  const blockEnd = externalSummarySource.indexOf("\n  },", markerIndex);
  assert.notEqual(
    blockStart,
    -1,
    `External summary gate ${id} start not found.`,
  );
  assert.notEqual(blockEnd, -1, `External summary gate ${id} end not found.`);
  return externalSummarySource.slice(blockStart, blockEnd);
}

const configuredEnv = Object.freeze({
  ...fixedEvidenceClock,
  ACCOUNT_DELETION_PROCESSOR_SECRET: "acctDel9f8e7d6c5b4a392817263abcd",
  PRESENCE_POLL_SECRET: "presencePoll9f8e7d6c5b4a392817abcd",
  PRESENCE_PROVIDER_TOKEN: "presenceProvider9f8e7d6c5b4a392817",
  STEAM_WEB_API_KEY: "0123456789abcdef0123456789abcdef",
  STRIPE_SECRET_KEY: "sk_live_51OgLauncherEvidenceAlpha1234567890",
  STRIPE_WEBHOOK_SECRET: "whsec_51OgLauncherEvidenceAlpha1234567890",
  SUPABASE_URL: "https://awebfvfyqzwapcgixdfj.supabase.co",
});
const releaseBoundaryContext = Object.freeze({
  GITHUB_REF_NAME: "v1.2.3",
  GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
});

test("parseArgs accepts external evidence actions", () => {
  assert.deepEqual(parseArgs([]), { action: "plan" });
  assert.deepEqual(parseArgs(["preflight"]), { action: "preflight" });
  assert.deepEqual(parseArgs(["status"]), { action: "status" });
  assert.deepEqual(parseArgs(["template"]), { action: "template" });
  assert.deepEqual(parseArgs(["next"]), { action: "next" });
  assert.deepEqual(parseArgs(["next-steps"]), { action: "next" });
  assert.deepEqual(parseArgs(["worklist"]), { action: "worklist" });
  assert.deepEqual(parseArgs(["artifact-worklist"]), { action: "worklist" });
  assert.deepEqual(parseArgs(["packet"]), { action: "packet" });
  assert.deepEqual(parseArgs(["operator-packet"]), { action: "packet" });
  assert.deepEqual(parseArgs(["runbook"]), { action: "runbook" });
  assert.deepEqual(parseArgs(["operator-runbook"]), { action: "runbook" });
  assert.throws(
    () => parseArgs(["deploy"]),
    (error) => {
      assert.match(error.message, /Unknown external evidence action/);
      assert.equal(error.message.includes("deploy"), false);
      return true;
    },
  );
  assert.throws(
    () => parseArgs(["--sk_live_should_not_echo_123456"]),
    (error) => {
      assert.match(error.message, /Unknown external evidence option/);
      assert.equal(error.message.includes("sk_live_should_not_echo"), false);
      return true;
    },
  );
  assert.throws(
    () => parseArgs(["status", "preflight"]),
    (error) => {
      assert.match(error.message, /at most one external evidence action/);
      assert.equal(error.message.includes("preflight"), false);
      return true;
    },
  );
});



test("operator packet report is redacted and preserves external proof boundary", () => {
  const output = operatorPacketReport(
    {
      ...configuredEnv,
      OGL_EXTERNAL_EVIDENCE_GATES: "hosted-supabase-cron",
      SUPABASE_URL: "",
    },
    fakeExists(["docs/verification/external/hosted-supabase-cron.md"]),
    fakeRead({
      "docs/verification/external/hosted-supabase-cron.md": [
        "- Captured at: 2026-06-16T12:00:00.000Z",
        "- Operator: release-runner",
        "- Environment: hosted-staging",
        "- Redacted run IDs, dashboard links, screenshots, or signed deployment logs: run-hosted-cron-123",
        "- Redaction notes: raw secrets removed before commit",
      ].join("\n"),
    }),
  );

  assert.match(output, /External completion evidence operator packet/);
  assert.match(output, /Selected gates: 1/);
  assert.match(output, /Ready gates: 0\/1/);
  assert.match(
    output,
    /External completion: not proven; live evidence is still required/,
  );
  assert.match(
    output,
    /Required env names: SUPABASE_URL; ACCOUNT_DELETION_PROCESSOR_SECRET/,
  );
  assert.match(
    output,
    /docs\/verification\/external\/hosted-supabase-cron\.md/,
  );
  assert.match(
    output,
    /poll-platform-presence scheduled run writes fresh evidence/,
  );
  assert.match(output, /Capture handoffs:/);
  assert.match(output, /pnpm hosted:cron-evidence:artifact-hints/);
  assert.match(output, /presence_poll_runs/);
  assert.equal(output.match(/^- Capture handoffs:/gm)?.length, 1);
  assert.match(output, /Missing Evidence Next Steps/);
  assert.match(output, /pnpm hosted:cron-evidence/);
  assert.match(output, new RegExp(escapeRegExp(hostedCronRestUrlPrerequisite)));
  assert.match(
    output,
    new RegExp(escapeRegExp(hostedCronRestAuthPrerequisite)),
  );
  assert.doesNotMatch(output, /\[[xX ]\]/);
  for (const value of Object.values(configuredEnv)) {
    assert.equal(output.includes(value), false);
  }
});

test("operator packet report limits readiness wording for scoped selected gates", () => {
  const gate = evidenceGates.find((item) => item.id === "hardware-os-e2e");
  assert.ok(gate);
  const artifactPath = "docs/verification/external/hardware-os-e2e.md";
  const output = operatorPacketReport(
    {
      ...configuredEnv,
      OGL_EXTERNAL_EVIDENCE_GATES: "hardware-os-e2e",
    },
    fakeExists(gate.artifactPaths),
    fakeRead({
      [artifactPath]: proofContent(gate, capturedEvidenceDetails()),
    }),
  );

  const completionLine = output
    .split("\n")
    .find((line) => line.startsWith("External completion:"));
  assert.ok(completionLine);
  assert.match(output, /Selected gates: 1/);
  assert.match(output, /Ready gates: 1\/1/);
  assert.doesNotMatch(
    completionLine,
    /^External completion: ready for release-boundary preflight$/,
  );
  assert.match(completionLine, /(?:scoped|selected gates?)/i);
});

test("next steps report prints redacted operator actions without proof checkboxes", () => {
  const output = nextStepsReport(
    {
      ...configuredEnv,
      OGL_EXTERNAL_EVIDENCE_GATES: "hosted-supabase-cron",
      SUPABASE_URL: "",
    },
    fakeExists(["docs/verification/external/hosted-supabase-cron.md"]),
    fakeRead({
      "docs/verification/external/hosted-supabase-cron.md": [
        "- [x] poll-platform-presence scheduled run writes fresh evidence.",
        "- Evidence for poll-platform-presence scheduled run writes fresh evidence: docs/verification/screenshots/local-proof.png",
        "- Captured at: 2026-06-16T12:00:00.000Z",
        "- Operator: release-runner",
        "- Environment: hosted-staging",
        "- Redacted run IDs, dashboard links, screenshots, or signed deployment logs: docs/verification/screenshots/local-proof.png",
        "- Redaction notes: raw secrets removed before commit",
      ].join("\n"),
    }),
  );

  assert.match(output, /Hosted Supabase cron \(hosted-supabase-cron\)/);
  assert.match(output, /Missing env names: SUPABASE_URL/);
  assert.match(output, /Missing proofs:/);
  assert.match(output, /Missing detail fields:/);
  assert.match(
    output,
    /OGL_EXTERNAL_EVIDENCE_GATES=hosted-supabase-cron pnpm external:evidence:template/,
  );
  assert.match(output, /pnpm hosted:deploy-gate:scheduler-packet/);
  assert.match(output, /pnpm hosted:cron-evidence:plan/);
  assert.match(output, /pnpm hosted:cron-evidence:packet/);
  assert.match(output, /pnpm hosted:cron-evidence:artifact-hints/);
  assert.match(output, /Capture handoffs:/);
  assert.match(output, /presence_poll_runs/);
  assert.match(output, new RegExp(escapeRegExp(hostedCronRestUrlPrerequisite)));
  assert.match(
    output,
    new RegExp(escapeRegExp(hostedCronRestAuthPrerequisite)),
  );
  assert.doesNotMatch(output, /OGL_HOSTED_CRON_EVIDENCE_CHECKS=notify-price-drop/);
  assert.doesNotMatch(output, /\[[xX ]\]/);
  assert.doesNotMatch(output, /docs\/verification\/screenshots/);
  for (const value of Object.values(configuredEnv)) {
    assert.equal(output.includes(value), false);
  }
});

test("handoff reports include a release-boundary reminder but artifact templates do not", () => {
  const gate = evidenceGates.find((item) => item.id === "hardware-os-e2e");
  assert.ok(gate);
  const env = {
    ...configuredEnv,
    OGL_EXTERNAL_EVIDENCE_GATES: "hardware-os-e2e",
  };
  const fileExists = fakeExists([]);
  const readFile = fakeRead({});

  for (const [name, output] of [
    ["nextStepsReport", nextStepsReport(env, fileExists, readFile)],
    [
      "artifactWorklistReport",
      artifactWorklistReport(env, fileExists, readFile),
    ],
    ["operatorPacketReport", operatorPacketReport(env, fileExists, readFile)],
    ["runbookReport", runbookReport(env, fileExists, readFile)],
  ]) {
    assert.match(output, /Release-boundary reminder/i, name);
    assert.match(output, /pnpm hosted:deploy-gate:preflight/, name);
    assert.match(output, /pnpm hosted:deploy-gate:smoke/, name);
    assert.doesNotMatch(
      output,
      /hosted deploy preflight, hosted deploy smoke/,
      name,
    );
  }

  assert.doesNotMatch(
    artifactTemplate(gate, gate.artifactPaths[0]),
    /Release-boundary reminder/i,
  );
});



test("hosted cron worklist includes lane-specific rows to fill", () => {
  const output = artifactWorklistReport(
    {
      ...configuredEnv,
      OGL_EXTERNAL_EVIDENCE_GATES: "hosted-supabase-cron",
    },
    fakeExists([]),
    fakeRead({}),
  );

  assert.match(output, /Hosted Supabase cron \(hosted-supabase-cron\)/);
  assert.match(output, /Rows to fill:/);
  assert.match(
    output,
    /Proof row: poll-platform-presence scheduled run writes fresh evidence\./,
  );
  assert.match(
    output,
    /Proof evidence row: Evidence for poll-platform-presence scheduled run writes fresh evidence\.:/,
  );
  assert.match(output, /Lane-specific evidence row: presence-poll \/ Run ID:/);
  assert.match(
    output,
    /Lane-specific evidence row: presence-poll \/ Function:/,
  );
  assert.match(
    output,
    /Lane-specific evidence row: account-deletion \/ Status:/,
  );
  assert.match(output, /pnpm hosted:cron-evidence:artifact-hints/);
  assert.doesNotMatch(output, /\[[xX ]\]/);
  assert.doesNotMatch(output, /run-123/);
  assert.doesNotMatch(output, /2026-/);
  for (const value of Object.values(configuredEnv)) {
    assert.equal(output.includes(value), false);
  }
});

test("artifact worklist includes all fill rows for unreadable artifacts", () => {
  const output = artifactWorklistReport(
    {
      ...configuredEnv,
      OGL_EXTERNAL_EVIDENCE_GATES: "hosted-supabase-cron",
    },
    fakeExists(["docs/verification/external/hosted-supabase-cron.md"]),
    fakeRead({}),
  );

  assert.match(output, /State: unreadable artifact/);
  assert.match(output, /Rows to fill:/);
  assert.match(
    output,
    /Proof row: poll-platform-presence scheduled run writes fresh evidence\./,
  );
  assert.match(output, /Evidence detail row: Captured at:/);
  assert.match(output, /Lane-specific evidence row: presence-poll \/ Run ID:/);
  assert.match(
    output,
    /Lane-specific evidence row: account-deletion \/ Status:/,
  );
  assert.doesNotMatch(output, /\[[xX ]\]/);
  assert.doesNotMatch(output, /run-123/);
  assert.doesNotMatch(output, /2026-/);
});

test("rollout worklist includes hosted deploy packet handoff commands", () => {
  const output = artifactWorklistReport(
    {
      ...configuredEnv,
      OGL_EXTERNAL_EVIDENCE_GATES: "rollout-tracks",
    },
    fakeExists(["docs/verification/external/rollout-tracks.md"]),
    fakeRead({
      "docs/verification/external/rollout-tracks.md": "",
    }),
  );

  assert.match(output, /Rollout tracks \(rollout-tracks\)/);
  assert.match(output, /Hosted production deployment evidence is attached/);
  assert.match(output, /pnpm hosted:deploy-gate:packet/);
  assert.match(output, /pnpm hosted:deploy-gate:plan/);
  assert.match(output, /GitHub Actions `CI` from `main`/);
  assert.match(output, /hosted_deploy_gate=true/);
  assert.match(output, /hosted_environment=hosted-production/);
  assert.match(output, /hosted_deploy_action=all/);
  assert.match(output, /hosted_deploy_dry_run=false/);
  assert.match(
    output,
    /OGL_EXTERNAL_EVIDENCE_GATES=rollout-tracks pnpm external:evidence:preflight/,
  );
  assert.doesNotMatch(output, /\[[xX ]\]/);
});

test("rollout operator packet and runbook name the production hosted deploy proof run", () => {
  const env = {
    ...configuredEnv,
    OGL_EXTERNAL_EVIDENCE_GATES: "rollout-tracks",
  };
  const exists = fakeExists(["docs/verification/external/rollout-tracks.md"]);
  const read = fakeRead({
    "docs/verification/external/rollout-tracks.md": "",
  });

  for (const output of [
    operatorPacketReport(env, exists, read),
    runbookReport(env, exists, read),
  ]) {
    assert.match(output, /GitHub Actions `CI` from `main`/);
    assert.match(output, /hosted_deploy_gate=true/);
    assert.match(output, /hosted_environment=hosted-production/);
    assert.match(output, /hosted_deploy_action=all/);
    assert.match(output, /hosted_deploy_dry_run=false/);
    assert.match(output, /labelled/);
    assert.match(output, /hosted-deploy/);
    assert.match(output, /actions\/runs\/<id>/);
    assert.match(
      output,
      /Evidence for Hosted production deployment evidence is attached/,
    );
    assert.match(output, /Hosted deploy evidence/);
    assert.doesNotMatch(output, /\[[xX ]\]/);
  }
});

test("status report summarizes selected gates without secret values", () => {
  const gate = evidenceGates.find((item) => item.id === "hosted-supabase-cron");
  assert.ok(gate);
  const env = {
    ...configuredEnv,
    OGL_EXTERNAL_EVIDENCE_GATES: "hosted-supabase-cron",
  };
  const report = statusReport(
    env,
    fakeExists(gate.artifactPaths),
    fakeRead({
      "docs/verification/external/hosted-supabase-cron.md": [
        proofContent(gate),
        allHostedCronLaneDetails(),
        capturedEvidenceDetails(),
      ].join("\n"),
    }),
  );

  assert.equal(report.ready, true);
  assert.equal(report.readyCount, 1);
  assert.equal(report.missingCount, 0);
  assert.equal(report.totalCount, 1);
  assert.deepEqual(
    report.gates.map((item) => item.id),
    ["hosted-supabase-cron"],
  );
  assert.deepEqual(report.gates[0].commands, [
    "OGL_EXTERNAL_EVIDENCE_GATES=hosted-supabase-cron pnpm external:evidence:status",
    "pnpm hosted:deploy-gate:scheduler-packet",
    "pnpm hosted:cron-evidence:plan",
    "pnpm hosted:cron-evidence",
    "pnpm hosted:cron-evidence:packet",
    "pnpm hosted:cron-evidence:artifact-hints",
    "OGL_EXTERNAL_EVIDENCE_GATES=hosted-supabase-cron pnpm external:evidence:preflight",
  ]);
  assert.equal(
    JSON.stringify(report).includes(configuredEnv.ACCOUNT_DELETION_PROCESSOR_SECRET),
    false,
  );
});

test("missing gate command recommendations scope template generation", () => {
  const gate = evidenceGates.find((item) => item.id === "hardware-os-e2e");
  assert.ok(gate);
  const env = {
    ...configuredEnv,
    OGL_EXTERNAL_EVIDENCE_GATES: "hardware-os-e2e",
  };
  const fileExists = fakeExists([]);
  const readFile = fakeRead({});

  const expectedCommand =
    "OGL_EXTERNAL_EVIDENCE_GATES=hardware-os-e2e pnpm external:evidence:template";

  const status = statusReport(env, fileExists, readFile);
  assert.ok(status.gates[0].commands.includes(expectedCommand));
  assert.equal(
    status.gates[0].commands.includes("pnpm external:evidence:template"),
    false,
  );

  const next = nextStepsReport(env, fileExists, readFile);
  assert.match(next, new RegExp(escapeForRegExp(expectedCommand)));
  assert.doesNotMatch(next, /; `pnpm external:evidence:template`/);

  const worklist = artifactWorklistReport(env, fileExists, readFile);
  assert.match(worklist, new RegExp(escapeForRegExp(expectedCommand)));
  assert.doesNotMatch(worklist, /; `pnpm external:evidence:template`/);
});

test("gate ids are stable and unique", () => {
  const ids = evidenceGates.map((gate) => gate.id);
  assert.deepEqual(ids, [...new Set(ids)]);
  assert.deepEqual(ids, [
    "hosted-supabase-cron",
    "provider-live-integrations",
    "hardware-os-e2e",
    "rollout-tracks",
  ]);
});

test("rollout track evidence fields cover community and release rollout lanes", () => {
  const gate = evidenceGates.find((item) => item.id === "rollout-tracks");
  assert.ok(gate);
  const fields =
    gate.artifactEvidenceFields?.flatMap((item) => item.requiredFields) ?? [];

  assert.deepEqual(fields, [
    "Community rollout evidence",
    "Marketplace evidence",
    "Hosted deploy evidence",
  ]);
  assert.equal(gate.requiredProofs[0], rolloutProof);
  assert.doesNotMatch(
    JSON.stringify(gate),
    /community artwork\/screenshots|screenshot-rollout/i,
  );
});



test("rollout status commands include hosted production CI handoff", () => {
  const report = statusReport(
    {
      ...configuredEnv,
      OGL_EXTERNAL_EVIDENCE_GATES: "rollout-tracks",
    },
    fakeExists(["docs/verification/external/rollout-tracks.md"]),
    fakeRead({
      "docs/verification/external/rollout-tracks.md": "",
    }),
  );

  assert.deepEqual(
    report.gates
      .flatMap((gate) => gate.commands)
      .filter((command) => command.includes("hosted_deploy_gate=true")),
    [
      "GitHub Actions CI main hosted_deploy_gate=true hosted_environment=hosted-production hosted_deploy_action=all hosted_deploy_dry_run=false",
    ],
  );
});

test("gate selection can focus one or more external lanes", () => {
  assert.deepEqual(
    selectedGates({
      OGL_EXTERNAL_EVIDENCE_GATES: "hardware-os-e2e,rollout-tracks",
    }).map((gate) => gate.id),
    ["hardware-os-e2e", "rollout-tracks"],
  );
  assert.throws(
    () => selectedGates({ OGL_EXTERNAL_EVIDENCE_GATES: "unknown" }),
    (error) => {
      assert.match(error.message, /Unknown OGL_EXTERNAL_EVIDENCE_GATES item/);
      assert.equal(error.message.includes("unknown"), false);
      return true;
    },
  );
  assert.throws(
    () =>
      selectedGates({
        OGL_EXTERNAL_EVIDENCE_GATES: "sk_live_should_not_echo_123456",
      }),
    (error) => {
      assert.match(error.message, /Unknown OGL_EXTERNAL_EVIDENCE_GATES item/);
      assert.equal(error.message.includes("sk_live_should_not_echo"), false);
      return true;
    },
  );
  assert.throws(
    () =>
      selectedGates({
        OGL_EXTERNAL_EVIDENCE_GATES: "hardware-os-e2e,hardware-os-e2e",
      }),
    (error) => {
      assert.match(error.message, /must not include duplicate gates/);
      return true;
    },
  );
  assert.throws(
    () =>
      selectedGates({
        OGL_EXTERNAL_EVIDENCE_GATES:
          "sk_live_should_not_echo_123456,sk_live_should_not_echo_123456",
      }),
    (error) => {
      assert.match(error.message, /must not include duplicate gates/);
      assert.equal(error.message.includes("sk_live_should_not_echo"), false);
      return true;
    },
  );
  assert.throws(
    () => selectedGates({ OGL_EXTERNAL_EVIDENCE_GATES: "," }),
    (error) => {
      assert.match(
        error.message,
        /OGL_EXTERNAL_EVIDENCE_GATES selected no gates/,
      );
      return true;
    },
  );
});







test.skip("functions env example documents 32 character scheduler secrets", () => {
  for (const name of [
    "ACCOUNT_DELETION_PROCESSOR_SECRET",
    "PRESENCE_POLL_SECRET",
  ]) {
    const lineIndex = functionsEnvExample
      .split("\n")
      .findIndex((line) => line.startsWith(`${name}=`));
    assert.ok(lineIndex > -1, `Expected ${name} in functions env example.`);
    const nearbyText = functionsEnvExample
      .split("\n")
      .slice(Math.max(0, lineIndex - 2), lineIndex + 2)
      .join("\n");
    assert.match(nearbyText, /32\+?\s+characters/i);
  }
});





test("preflight reports redacted artifact reason codes without raw evidence values", () => {
  const gate = evidenceGates.find((item) => item.id === "hardware-os-e2e");
  assert.ok(gate);
  const artifactPath = "docs/verification/external/hardware-os-e2e.md";
  const badLocator =
    "run-123 docs/verification/screenshots/settings-external-completion-evidence-summary-local.png";
  const genericProofLocator = "run-generic-proof-123";
  const env = {
    ...configuredEnv,
    GITHUB_REF_NAME: "v1.2.3",
    GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
    OGL_EXTERNAL_EVIDENCE_GATES: "hardware-os-e2e",
  };
  const content = [
    ...gate.requiredProofs.map((proof) => `- [x] ${proof}`),
    ...gate.requiredProofs.map(
      (proof) => `- Evidence for ${proof}: ${genericProofLocator}`,
    ),
    gateSpecificEvidenceDetails(gate),
    capturedEvidenceDetails({
      capturedAt: "1970-01-01T00:00:00.000Z",
      commitSha: "89abcdef0123456789abcdef0123456789abcdef",
      locator: badLocator,
      releaseRef: "v1.2.2",
    }),
  ].join("\n");
  const report = preflightReport(
    env,
    fakeExists([artifactPath]),
    fakeRead({ [artifactPath]: content }),
  );
  const status = report.statuses[0];

  assert.equal(status.ready, false);
  assert.deepEqual(status.evidenceDetailFindings, [
    { field: "Captured at", path: artifactPath, reason: "stale_timestamp" },
    {
      field: "Release ref",
      path: artifactPath,
      reason: "release_ref_mismatch",
    },
    {
      field: "Commit SHA",
      path: artifactPath,
      reason: "commit_sha_mismatch",
    },
    {
      field:
        "Redacted run IDs, dashboard links, screenshots, or signed deployment logs",
      path: artifactPath,
      reason: "local_path",
    },
  ]);
  assert.equal(status.proofEvidenceFindings.length, gate.requiredProofs.length);
  assert.ok(
    status.proofEvidenceFindings.every(
      (finding) => finding.reason === "missing_lane_terms",
    ),
  );
  assert.match(report.output, /Captured at \(stale_timestamp\)/);
  assert.match(report.output, /Release ref \(release_ref_mismatch\)/);
  assert.match(report.output, /Commit SHA \(commit_sha_mismatch\)/);
  assert.match(
    report.output,
    /Redacted run IDs, dashboard links, screenshots, or signed deployment logs \(local_path\)/,
  );
  assert.match(report.output, /proof evidence findings:/);
  assert.doesNotMatch(report.output, /1970-01-01T00:00:00\.000Z/);
  assert.doesNotMatch(report.output, /89abcdef0123456789abcdef/);
  assert.doesNotMatch(report.output, /v1\.2\.2/);
  assert.doesNotMatch(report.output, /docs\/verification\/screenshots/);
  assert.doesNotMatch(report.output, /run-generic-proof-123/);
});

test("preflight status validates Supabase REST and Functions URL shapes", () => {
  const gate = {
    id: "supabase-url-shapes",
    artifactPaths: [],
    requiredEnv: [
      "SUPABASE_URL",
      "SUPABASE_REST_URL",
      "SUPABASE_FUNCTIONS_URL",
    ],
    requiredProofs: [],
  };

  assert.equal(
    gateStatus(gate, {
      SUPABASE_URL: "https://awebfvfyqzwapcgixdfj.supabase.co",
      SUPABASE_FUNCTIONS_URL:
        "https://awebfvfyqzwapcgixdfj.supabase.co/functions/v1",
      SUPABASE_REST_URL: "https://awebfvfyqzwapcgixdfj.supabase.co/rest/v1",
    }).ready,
    true,
  );

  const portStatus = gateStatus(gate, {
    SUPABASE_URL: "https://awebfvfyqzwapcgixdfj.supabase.co:8443",
    SUPABASE_FUNCTIONS_URL:
      "https://awebfvfyqzwapcgixdfj.supabase.co:8443/functions/v1",
    SUPABASE_REST_URL: "https://awebfvfyqzwapcgixdfj.supabase.co:8443/rest/v1",
  });

  assert.equal(portStatus.ready, false);
  assert.deepEqual(portStatus.missingEnv, [
    "SUPABASE_URL",
    "SUPABASE_REST_URL",
    "SUPABASE_FUNCTIONS_URL",
  ]);

  const status = gateStatus(gate, {
    SUPABASE_URL: "https://abc123.supabase.co",
    SUPABASE_FUNCTIONS_URL: "https://example.supabase.co/functions/v1",
    SUPABASE_REST_URL: "https://awebfvfyqzwapcgixdfj.supabase.co/not-rest",
  });

  assert.equal(status.ready, false);
  assert.deepEqual(status.missingEnv, [
    "SUPABASE_URL",
    "SUPABASE_REST_URL",
    "SUPABASE_FUNCTIONS_URL",
  ]);
  assert.equal(JSON.stringify(status).includes("abc123.supabase.co"), false);
  assert.equal(JSON.stringify(status).includes("example.supabase.co"), false);
});

test("preflight status requires checked proof rows inside existing artifacts", () => {
  const gate = evidenceGates.find((item) => item.id === "hosted-supabase-cron");
  assert.ok(gate);
  const status = gateStatus(
    gate,
    configuredEnv,
    fakeExists(["docs/verification/external/hosted-supabase-cron.md"]),
    fakeRead({
      "docs/verification/external/hosted-supabase-cron.md":
        "- [x] poll-platform-presence scheduled run writes fresh evidence.",
    }),
  );

  assert.equal(status.ready, false);
  assert.deepEqual(status.missingArtifacts, []);
  assert.deepEqual(status.missingEnv, []);
  assert.deepEqual(status.missingProofs, [
    "process-account-deletions scheduled run writes fresh evidence.",
  ]);
});





test("preflight status requires hosted cron details for every scheduler lane", () => {
  const gate = evidenceGates.find((item) => item.id === "hosted-supabase-cron");
  assert.ok(gate);
  const artifactPath = "docs/verification/external/hosted-supabase-cron.md";

  const partialStatus = gateStatus(
    gate,
    configuredEnv,
    fakeExists([artifactPath]),
    fakeRead({
      [artifactPath]: [
        proofContent(gate),
        hostedCronLaneDetails["presence-poll"],
        capturedEvidenceDetails(),
      ].join("\n"),
    }),
  );

  assert.equal(partialStatus.ready, false);
  assert.deepEqual(partialStatus.missingProofs, []);
  assert.deepEqual(
    partialStatus.missingEvidenceDetails.map((detail) => detail.field),
    [
      "account-deletion: Hosted cron table",
      "account-deletion: Function",
      "account-deletion: Run ID",
      "account-deletion: Scheduled",
      "account-deletion: dry_run=false",
      "account-deletion: Status",
    ],
  );

  const completeStatus = gateStatus(
    gate,
    configuredEnv,
    fakeExists([artifactPath]),
    fakeRead({
      [artifactPath]: [
        proofContent(gate),
        hostedCronLaneDetails["presence-poll"],
        hostedCronLaneDetails["account-deletion"],
        capturedEvidenceDetails(),
      ].join("\n"),
    }),
  );

  assert.equal(completeStatus.ready, true);
  assert.deepEqual(completeStatus.missingEvidenceDetails, []);

  const duplicateInvalidStatus = gateStatus(
    gate,
    configuredEnv,
    fakeExists([artifactPath]),
    fakeRead({
      [artifactPath]: [
        proofContent(gate),
        hostedCronLaneDetails["presence-poll"],
        "- Hosted cron table: wrong_table",
        hostedCronLaneDetails["account-deletion"],
        capturedEvidenceDetails(),
      ].join("\n"),
    }),
  );

  assert.equal(duplicateInvalidStatus.ready, false);
  assert.deepEqual(duplicateInvalidStatus.missingProofs, []);
  assert.deepEqual(duplicateInvalidStatus.missingEvidenceDetails, [
    {
      field: "presence-poll: Hosted cron table",
      path: artifactPath,
    },
  ]);
});

test("preflight binds hosted cron artifacts to the live collector receipt when present", () => {
  const gate = evidenceGates.find((item) => item.id === "hosted-supabase-cron");
  assert.ok(gate);
  const artifactPath = "docs/verification/external/hosted-supabase-cron.md";
  const receiptPath = ".codex/completion-gate/hosted-cron.json";
  const receipt = hostedCronReceiptFixture();
  const artifactContent = [
    proofContent(gate),
    allHostedCronLaneDetailsWithReceiptDigest(receipt.artifactDigest),
    capturedEvidenceDetails(),
  ].join("\n");

  const readyStatus = gateStatus(
    gate,
    receiptEnv(receiptPath),
    fakeExists([artifactPath, receiptPath]),
    fakeRead({
      [artifactPath]: artifactContent,
      [receiptPath]: JSON.stringify(receipt),
    }),
  );

  assert.equal(readyStatus.ready, true);
  assert.deepEqual(readyStatus.hostedCronReceiptFindings, []);

  const missingReceiptStatus = gateStatus(
    gate,
    receiptEnv(receiptPath),
    fakeExists([artifactPath]),
    fakeRead({
      [artifactPath]: artifactContent,
    }),
  );

  assert.equal(missingReceiptStatus.ready, false);
  assert.deepEqual(missingReceiptStatus.hostedCronReceiptFindings, [
    {
      field: "Hosted cron receipt",
      path: receiptPath,
      reason: "missing",
    },
  ]);

  const staleRunStatus = gateStatus(
    gate,
    receiptEnv(receiptPath),
    fakeExists([artifactPath, receiptPath]),
    fakeRead({
      [artifactPath]: artifactContent.replaceAll(
        "- Run ID: presence-poll-run-123",
        "- Run ID: presence-poll-run-999",
      ),
      [receiptPath]: JSON.stringify(receipt),
    }),
  );

  assert.equal(staleRunStatus.ready, false);
  assert.deepEqual(staleRunStatus.hostedCronReceiptFindings, [
    {
      field: "presence-poll: Run ID",
      path: artifactPath,
      reason: "receipt_mismatch",
    },
  ]);

  const wrongDigestStatus = gateStatus(
    gate,
    receiptEnv(receiptPath),
    fakeExists([artifactPath, receiptPath]),
    fakeRead({
      [artifactPath]: artifactContent.replaceAll(
        receipt.artifactDigest,
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ),
      [receiptPath]: JSON.stringify(receipt),
    }),
  );

  assert.equal(wrongDigestStatus.ready, false);
  assert.deepEqual(wrongDigestStatus.hostedCronReceiptFindings, [
    {
      field: "presence-poll: Hosted cron receipt SHA256",
      path: artifactPath,
      reason: "receipt_mismatch",
    },
    {
      field: "account-deletion: Hosted cron receipt SHA256",
      path: artifactPath,
      reason: "receipt_mismatch",
    },
  ]);

  const tamperedReceiptStatus = gateStatus(
    gate,
    receiptEnv(receiptPath),
    fakeExists([artifactPath, receiptPath]),
    fakeRead({
      [artifactPath]: artifactContent,
      [receiptPath]: JSON.stringify({
        ...receipt,
        generatedAt: "2026-06-17T11:55:00.000Z",
      }),
    }),
  );

  assert.equal(tamperedReceiptStatus.ready, false);
  assert.deepEqual(tamperedReceiptStatus.hostedCronReceiptFindings, [
    {
      field: "Hosted cron receipt SHA256",
      path: receiptPath,
      reason: "mismatch",
    },
  ]);

  const presencePollOnlyReceipt = hostedCronReceiptFixture({
    lanes: receipt.lanes.filter((lane) => lane.id === "presence-poll"),
    selectedChecks: ["presence-poll"],
  });
  const scopedReceiptStatus = gateStatus(
    gate,
    receiptEnv(receiptPath),
    fakeExists([artifactPath, receiptPath]),
    fakeRead({
      [artifactPath]: artifactContent.replaceAll(
        receipt.artifactDigest,
        presencePollOnlyReceipt.artifactDigest,
      ),
      [receiptPath]: JSON.stringify(presencePollOnlyReceipt),
    }),
  );

  assert.equal(scopedReceiptStatus.ready, false);
  assert.deepEqual(scopedReceiptStatus.hostedCronReceiptFindings, [
    {
      field: "account-deletion: Hosted cron receipt lane",
      path: artifactPath,
      reason: "missing",
    },
  ]);

  const selectedChecksMismatchReceipt = hostedCronReceiptFixture({
    selectedChecks: ["presence-poll"],
  });
  const selectedChecksMismatchStatus = gateStatus(
    gate,
    receiptEnv(receiptPath),
    fakeExists([artifactPath, receiptPath]),
    fakeRead({
      [artifactPath]: artifactContent.replaceAll(
        receipt.artifactDigest,
        selectedChecksMismatchReceipt.artifactDigest,
      ),
      [receiptPath]: JSON.stringify(selectedChecksMismatchReceipt),
    }),
  );

  assert.equal(selectedChecksMismatchStatus.ready, false);
  assert.deepEqual(selectedChecksMismatchStatus.hostedCronReceiptFindings, [
    {
      field: "Hosted cron receipt selectedChecks",
      path: receiptPath,
      reason: "mismatch",
    },
  ]);

  const staleReceipt = hostedCronReceiptFixture({
    lanes: receipt.lanes.map((lane) => ({
      ...lane,
      completedAt: "2026-06-15T00:00:00.000Z",
    })),
  });
  const staleReceiptStatus = gateStatus(
    gate,
    receiptEnv(receiptPath),
    fakeExists([artifactPath, receiptPath]),
    fakeRead({
      [artifactPath]: artifactContent.replaceAll(
        receipt.artifactDigest,
        staleReceipt.artifactDigest,
      ),
      [receiptPath]: JSON.stringify(staleReceipt),
    }),
  );

  assert.equal(staleReceiptStatus.ready, false);
  assert.deepEqual(staleReceiptStatus.hostedCronReceiptFindings, [
    {
      field: "Hosted cron receipt completedAt",
      path: `${receiptPath}#presence-poll`,
      reason: "stale_timestamp",
    },
    {
      field: "Hosted cron receipt completedAt",
      path: `${receiptPath}#account-deletion`,
      reason: "stale_timestamp",
    },
  ]);

  const secretReceiptStatus = gateStatus(
    gate,
    receiptEnv(receiptPath),
    fakeExists([artifactPath, receiptPath]),
    fakeRead({
      [artifactPath]: artifactContent,
      [receiptPath]: JSON.stringify({
        ...receipt,
        note: "SUPABASE_SERVICE_ROLE_KEY=service-role-secret-123456",
      }),
    }),
  );

  assert.equal(secretReceiptStatus.ready, false);
  assert.equal(
    secretReceiptStatus.hostedCronReceiptFindings.some(
      (finding) =>
        finding.field === "Hosted cron receipt" &&
        finding.reason === "Raw Supabase credential",
    ),
    true,
  );
});

test("preflight status rejects unchecked template proof rows", () => {
  const gate = evidenceGates.find((item) => item.id === "hardware-os-e2e");
  assert.ok(gate);
  const uncheckedTemplate = gate.requiredProofs
    .map((proof) => `- [ ] ${proof}`)
    .join("\n");

  const status = gateStatus(
    gate,
    {},
    fakeExists(gate.artifactPaths),
    fakeRead({
      "docs/verification/external/hardware-os-e2e.md": uncheckedTemplate,
    }),
  );

  assert.equal(status.ready, false);
  assert.deepEqual(status.missingProofs, gate.requiredProofs);
});

test("preflight status blocks template-only banner once proof or detail rows are filled", () => {
  const gate = evidenceGates.find((item) => item.id === "hardware-os-e2e");
  assert.ok(gate);
  const artifactPath = "docs/verification/external/hardware-os-e2e.md";

  const emptyTemplateStatus = gateStatus(
    gate,
    {},
    fakeExists(gate.artifactPaths),
    fakeRead({
      [artifactPath]: artifactTemplate(gate, artifactPath),
    }),
  );
  assert.equal(emptyTemplateStatus.ready, false);
  assert.deepEqual(emptyTemplateStatus.templateOnlyFindings, []);

  const checkedProofStatus = gateStatus(
    gate,
    fixedEvidenceClock,
    fakeExists(gate.artifactPaths),
    fakeRead({
      [artifactPath]: [
        "> Template only. No external evidence has been captured yet.",
        proofContent(gate, capturedEvidenceDetails()),
      ].join("\n"),
    }),
  );
  assert.equal(checkedProofStatus.ready, false);
  assert.deepEqual(checkedProofStatus.missingEvidenceDetails, []);
  assert.deepEqual(checkedProofStatus.templateOnlyFindings, [
    { path: artifactPath },
  ]);

  const filledDetailsStatus = gateStatus(
    gate,
    {},
    fakeExists(gate.artifactPaths),
    fakeRead({
      [artifactPath]: [
        "> Template only. No external evidence has been captured yet.",
        capturedEvidenceDetails(),
      ].join("\n"),
    }),
  );
  assert.equal(filledDetailsStatus.ready, false);
  assert.deepEqual(filledDetailsStatus.templateOnlyFindings, [
    { path: artifactPath },
  ]);

  const hostedCronGate = evidenceGates.find(
    (item) => item.id === "hosted-supabase-cron",
  );
  assert.ok(hostedCronGate);
  const hostedCronArtifactPath =
    "docs/verification/external/hosted-supabase-cron.md";
  const filledLaneDetailsStatus = gateStatus(
    hostedCronGate,
    {},
    fakeExists(hostedCronGate.artifactPaths),
    fakeRead({
      [hostedCronArtifactPath]: [
        "> Template only. No external evidence has been captured yet.",
        "## Lane-Specific Evidence",
        "",
        "### presence-poll",
        "- Hosted cron table: presence_poll_runs",
      ].join("\n"),
    }),
  );
  assert.equal(filledLaneDetailsStatus.ready, false);
  assert.deepEqual(filledLaneDetailsStatus.templateOnlyFindings, [
    { path: hostedCronArtifactPath },
  ]);
});

test("preflight status rejects checked proofs without captured evidence details", () => {
  const gate = evidenceGates.find((item) => item.id === "hardware-os-e2e");
  assert.ok(gate);

  const status = gateStatus(
    gate,
    {},
    fakeExists(gate.artifactPaths),
    fakeRead({
      "docs/verification/external/hardware-os-e2e.md": proofContent(gate),
    }),
  );

  assert.equal(status.ready, false);
  assert.deepEqual(status.missingProofs, []);
  assert.deepEqual(
    status.missingEvidenceDetails,
    missingEvidenceDetails(
      gate,
      "docs/verification/external/hardware-os-e2e.md",
      baseEvidenceDetailFields,
    ),
  );
});

test("preflight status requires release ref and commit SHA on otherwise complete evidence", () => {
  const gate = evidenceGates.find((item) => item.id === "hardware-os-e2e");
  assert.ok(gate);
  const artifactPath = "docs/verification/external/hardware-os-e2e.md";

  const status = gateStatus(
    gate,
    configuredEnv,
    fakeExists(gate.artifactPaths),
    fakeRead({
      [artifactPath]: proofContent(
        gate,
        capturedEvidenceDetails({ includeReleaseBoundary: false }),
      ),
    }),
  );

  assert.equal(status.ready, false);
  assert.deepEqual(status.missingProofs, []);
  assert.deepEqual(status.missingEvidenceDetails, [
    {
      field: "Release ref",
      path: artifactPath,
    },
    {
      field: "Commit SHA",
      path: artifactPath,
    },
  ]);
});

test("preflight status rejects release ref and commit SHA that do not match GitHub env", () => {
  const gate = evidenceGates.find((item) => item.id === "hardware-os-e2e");
  assert.ok(gate);
  const artifactPath = "docs/verification/external/hardware-os-e2e.md";
  const env = {
    ...configuredEnv,
    GITHUB_REF_NAME: "v1.2.3",
    GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
  };

  for (const { name, details, missingField } of [
    {
      name: "stale release ref",
      details: {
        releaseRef: "v1.2.2",
        commitSha: env.GITHUB_SHA,
      },
      missingField: "Release ref",
    },
    {
      name: "stale commit SHA",
      details: {
        releaseRef: env.GITHUB_REF_NAME,
        commitSha: "89abcdef0123456789abcdef0123456789abcdef",
      },
      missingField: "Commit SHA",
    },
  ]) {
    const status = gateStatus(
      gate,
      env,
      fakeExists(gate.artifactPaths),
      fakeRead({
        [artifactPath]: proofContent(gate, capturedEvidenceDetails(details)),
      }),
    );

    assert.equal(status.ready, false, name);
    assert.deepEqual(status.missingProofs, [], name);
    assert.deepEqual(
      status.missingEvidenceDetails,
      [{ field: missingField, path: artifactPath }],
      name,
    );
  }

  const matchingStatus = gateStatus(
    gate,
    env,
    fakeExists(gate.artifactPaths),
    fakeRead({
      [artifactPath]: proofContent(
        gate,
        capturedEvidenceDetails({
          releaseRef: env.GITHUB_REF_NAME,
          commitSha: env.GITHUB_SHA,
        }),
      ),
    }),
  );

  assert.equal(matchingStatus.ready, true);
  assert.deepEqual(matchingStatus.missingEvidenceDetails, []);
});

test("preflight status does not bind Release ref to non-release GitHub refs", () => {
  const gate = evidenceGates.find((item) => item.id === "hardware-os-e2e");
  assert.ok(gate);
  const artifactPath = "docs/verification/external/hardware-os-e2e.md";
  const env = {
    ...configuredEnv,
    GITHUB_REF_NAME: "main",
    GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
  };

  const status = gateStatus(
    gate,
    env,
    fakeExists(gate.artifactPaths),
    fakeRead({
      [artifactPath]: proofContent(
        gate,
        capturedEvidenceDetails({
          commitSha: env.GITHUB_SHA,
          releaseRef: "v1.2.3",
        }),
      ),
    }),
  );

  assert.equal(status.ready, true);
  assert.deepEqual(status.missingEvidenceDetails, []);

  const staleShaStatus = gateStatus(
    gate,
    env,
    fakeExists(gate.artifactPaths),
    fakeRead({
      [artifactPath]: proofContent(
        gate,
        capturedEvidenceDetails({
          commitSha: "89abcdef0123456789abcdef0123456789abcdef",
          releaseRef: "v1.2.3",
        }),
      ),
    }),
  );

  assert.equal(staleShaStatus.ready, false);
  assert.deepEqual(staleShaStatus.missingEvidenceDetails, [
    {
      field: "Commit SHA",
      path: artifactPath,
    },
  ]);
});

test("unscoped release-boundary status requires release tag and commit context", () => {
  const artifacts = completeEvidenceArtifacts();
  const report = statusReport(
    configuredEnv,
    fakeExists(Object.keys(artifacts)),
    fakeRead(artifacts),
  );

  assert.equal(report.ready, false);
  assert.equal(report.readyCount, 0);
  assert.equal(report.totalCount, evidenceGates.length);
  for (const gate of report.gates) {
    assert.equal(gate.ready, false, gate.id);
    assert.ok(
      gate.evidenceDetailFindings.some(
        (finding) => finding.reason === "release_ref_context_missing",
      ),
      `${gate.id} should require release ref context`,
    );
    assert.ok(
      gate.evidenceDetailFindings.some(
        (finding) => finding.reason === "commit_sha_context_missing",
      ),
      `${gate.id} should require commit SHA context`,
    );
  }
});

test("unscoped release-boundary handoffs require release tag and commit context", () => {
  const artifacts = completeEvidenceArtifacts();
  const fileExists = fakeExists(Object.keys(artifacts));
  const readFile = fakeRead(artifacts);

  const handoffs = [
    ["nextStepsReport", nextStepsReport(configuredEnv, fileExists, readFile)],
    [
      "operatorPacketReport",
      operatorPacketReport(configuredEnv, fileExists, readFile),
    ],
    ["runbookReport", runbookReport(configuredEnv, fileExists, readFile)],
  ];

  for (const [name, output] of handoffs) {
    assert.match(output, /release_ref_context_missing/, name);
    assert.match(output, /commit_sha_context_missing/, name);
    assert.match(output, /pnpm completion:gate:external/, name);
  }

  const packet = operatorPacketReport(configuredEnv, fileExists, readFile);
  assert.match(packet, /Ready gates: 0\/4/);
  assert.match(
    packet,
    /External completion: not proven; live evidence is still required/,
  );
});

test("unscoped release-boundary status accepts matching release tag and commit context", () => {
  const artifacts = completeEvidenceArtifacts();
  const report = statusReport(
    {
      ...configuredEnv,
      ...releaseBoundaryContext,
    },
    fakeExists(Object.keys(artifacts)),
    fakeRead(artifacts),
  );

  assert.equal(report.ready, true);
  assert.equal(report.readyCount, evidenceGates.length);
  assert.deepEqual(
    report.gates.map((gate) => [gate.id, gate.ready]),
    evidenceGates.map((gate) => [gate.id, true]),
  );
});

test("scoped external evidence status remains usable without CI release context", () => {
  const gate = evidenceGates.find((item) => item.id === "hosted-supabase-cron");
  assert.ok(gate);
  const artifactPath = "docs/verification/external/hosted-supabase-cron.md";
  const report = statusReport(
    {
      ...configuredEnv,
      OGL_EXTERNAL_EVIDENCE_GATES: gate.id,
    },
    fakeExists([artifactPath]),
    fakeRead({
      [artifactPath]: completeEvidenceContentForGate(gate),
    }),
  );

  assert.equal(report.ready, true);
  assert.equal(report.readyCount, 1);
  assert.deepEqual(
    report.gates.map((item) => item.id),
    [gate.id],
  );
  assert.deepEqual(report.gates[0].evidenceDetailFindings, []);
});

test("preflight status rejects checked proofs without proof-specific evidence mappings", () => {
  const gate = evidenceGates.find((item) => item.id === "hardware-os-e2e");
  assert.ok(gate);

  const status = gateStatus(
    gate,
    fixedEvidenceClock,
    fakeExists(gate.artifactPaths),
    fakeRead({
      "docs/verification/external/hardware-os-e2e.md":
        checkedProofContentWithoutProofEvidence(
          gate,
          capturedEvidenceDetails(),
        ),
    }),
  );

  assert.equal(status.ready, false);
  assert.deepEqual(status.missingProofs, []);
  assert.deepEqual(
    status.missingEvidenceDetails.map((detail) => detail.field),
    gate.requiredProofs.map((proof) => `Evidence for ${proof}`),
  );
});

test("preflight status rejects generic proof-specific evidence mappings", () => {
  const gate = evidenceGates.find((item) => item.id === "hardware-os-e2e");
  assert.ok(gate);

  const status = gateStatus(
    gate,
    fixedEvidenceClock,
    fakeExists(gate.artifactPaths),
    fakeRead({
      "docs/verification/external/hardware-os-e2e.md": [
        ...gate.requiredProofs.map((proof) => `- [x] ${proof}`),
        ...gate.requiredProofs.map(
          (proof) => `- Evidence for ${proof}: see above`,
        ),
        gateSpecificEvidenceDetails(gate),
        capturedEvidenceDetails(),
      ].join("\n"),
    }),
  );

  assert.equal(status.ready, false);
  assert.deepEqual(status.missingProofs, []);
  assert.deepEqual(
    status.missingEvidenceDetails.map((detail) => detail.field),
    gate.requiredProofs.map((proof) => `Evidence for ${proof}`),
  );
});



test("preflight status requires compound provider proof evidence terms", () => {
  const gate = evidenceGates.find(
    (item) => item.id === "provider-live-integrations",
  );
  assert.ok(gate);
  const artifactPath =
    "docs/verification/external/provider-live-integrations.md";
  const compoundProof =
    "Achievement/provider cache E2E runs against real client data.";

  const contentWithCompoundProofEvidence = (value) =>
    [
      ...gate.requiredProofs.map((proof) => `- [x] ${proof}`),
      ...gate.requiredProofs.map(
        (proof, index) =>
          `- Evidence for ${proof}: ${
            proof === compoundProof
              ? value
              : proofEvidenceValueForProof(
                  proof,
                  `run-provider-live-${index + 1}`,
                )
          }`,
      ),
      gateSpecificEvidenceDetails(gate),
      capturedEvidenceDetails(),
    ].join("\n");

  const partialStatus = gateStatus(
    gate,
    configuredEnv,
    fakeExists(gate.artifactPaths),
    fakeRead({
      [artifactPath]: contentWithCompoundProofEvidence(
        "run-provider-cache-staging-probe-123",
      ),
    }),
  );

  assert.equal(partialStatus.ready, false);
  assert.deepEqual(partialStatus.missingProofs, []);
  assert.deepEqual(partialStatus.missingEvidenceDetails, [
    {
      field: `Evidence for ${compoundProof}`,
      path: artifactPath,
    },
  ]);

  const completeStatus = gateStatus(
    gate,
    configuredEnv,
    fakeExists(gate.artifactPaths),
    fakeRead({
      [artifactPath]: contentWithCompoundProofEvidence(
        "run-achievement-provider-cache-real-client-123",
      ),
    }),
  );

  assert.equal(completeStatus.ready, true);
  assert.deepEqual(completeStatus.missingEvidenceDetails, []);
});

test("preflight status requires hardware OS proof and matrix to name every OS title client lane", () => {
  const gate = evidenceGates.find((item) => item.id === "hardware-os-e2e");
  assert.ok(gate);
  const artifactPath = "docs/verification/external/hardware-os-e2e.md";
  const osProof =
    "External-drive backup/restore E2E runs on Windows, macOS, and Linux.";

  const contentWithOsEvidence = ({ matrix, proofEvidence }) =>
    [
      ...gate.requiredProofs.map((proof) => `- [x] ${proof}`),
      ...gate.requiredProofs.map(
        (proof, index) =>
          `- Evidence for ${proof}: ${
            proof === osProof
              ? proofEvidence
              : proofEvidenceValueForProof(
                  proof,
                  `run-hardware-os-${index + 1}`,
                )
          }`,
      ),
      `- OS/title/client matrix: ${matrix}`,
      "- Hardware profile: hardware-profile-run-123",
      "- Session/run ID: overlay-session-run-123 duration:30m",
      capturedEvidenceDetails(),
    ].join("\n");

  const windowsOnlyStatus = gateStatus(
    gate,
    configuredEnv,
    fakeExists(gate.artifactPaths),
    fakeRead({
      [artifactPath]: contentWithOsEvidence({
        matrix: "Windows title:redacted-game client:Steam run:win-matrix-123",
        proofEvidence: "workflow-backup-restore-Windows-123",
      }),
    }),
  );

  assert.equal(windowsOnlyStatus.ready, false);
  assert.deepEqual(windowsOnlyStatus.missingProofs, []);
  assert.deepEqual(windowsOnlyStatus.missingEvidenceDetails, [
    {
      field: "OS/title/client matrix",
      path: artifactPath,
    },
    {
      field: `Evidence for ${osProof}`,
      path: artifactPath,
    },
  ]);

  const osOnlyStatus = gateStatus(
    gate,
    configuredEnv,
    fakeExists(gate.artifactPaths),
    fakeRead({
      [artifactPath]: contentWithOsEvidence({
        matrix: "matrix Windows macOS Linux workflow-123",
        proofEvidence: "workflow-backup-restore-Windows-macOS-Linux-123",
      }),
    }),
  );

  assert.equal(osOnlyStatus.ready, false);
  assert.deepEqual(osOnlyStatus.missingEvidenceDetails, [
    {
      field: "OS/title/client matrix",
      path: artifactPath,
    },
  ]);

  const allOsStatus = gateStatus(
    gate,
    configuredEnv,
    fakeExists(gate.artifactPaths),
    fakeRead({
      [artifactPath]: contentWithOsEvidence({
        matrix: validHardwareOsMatrix,
        proofEvidence: "workflow-backup-restore-Windows-macOS-Linux-123",
      }),
    }),
  );

  assert.equal(allOsStatus.ready, true);
  assert.deepEqual(allOsStatus.missingEvidenceDetails, []);
});

test("preflight status requires compound hardware overlay proof terms", () => {
  const gate = evidenceGates.find((item) => item.id === "hardware-os-e2e");
  assert.ok(gate);
  const artifactPath = "docs/verification/external/hardware-os-e2e.md";
  const overlayProof =
    "Fullscreen/anti-cheat overlay evidence is captured on real titles.";

  const contentWithOverlayProofEvidence = (value) =>
    [
      ...gate.requiredProofs.map((proof) => `- [x] ${proof}`),
      ...gate.requiredProofs.map(
        (proof, index) =>
          `- Evidence for ${proof}: ${
            proof === overlayProof
              ? value
              : proofEvidenceValueForProof(
                  proof,
                  `run-hardware-os-${index + 1}`,
                )
          }`,
      ),
      gateSpecificEvidenceDetails(gate),
      capturedEvidenceDetails(),
    ].join("\n");

  const overlayOnlyStatus = gateStatus(
    gate,
    configuredEnv,
    fakeExists(gate.artifactPaths),
    fakeRead({
      [artifactPath]: contentWithOverlayProofEvidence("workflow-overlay-123"),
    }),
  );

  assert.equal(overlayOnlyStatus.ready, false);
  assert.deepEqual(overlayOnlyStatus.missingProofs, []);
  assert.deepEqual(overlayOnlyStatus.missingEvidenceDetails, [
    {
      field: `Evidence for ${overlayProof}`,
      path: artifactPath,
    },
  ]);

  const fullOverlayStatus = gateStatus(
    gate,
    configuredEnv,
    fakeExists(gate.artifactPaths),
    fakeRead({
      [artifactPath]: contentWithOverlayProofEvidence(
        "workflow-fullscreen-anti-cheat-overlay-123",
      ),
    }),
  );

  assert.equal(fullOverlayStatus.ready, true);
  assert.deepEqual(fullOverlayStatus.missingEvidenceDetails, []);
});

test("preflight status requires long native overlay proof to include measured duration", () => {
  const gate = evidenceGates.find((item) => item.id === "hardware-os-e2e");
  assert.ok(gate);
  const artifactPath = "docs/verification/external/hardware-os-e2e.md";
  const longOverlayProof =
    "Long native overlay sessions produce stable runtime/session evidence.";

  const contentWithLongOverlayProofEvidence = (value) =>
    [
      ...gate.requiredProofs.map((proof) => `- [x] ${proof}`),
      ...gate.requiredProofs.map(
        (proof, index) =>
          `- Evidence for ${proof}: ${
            proof === longOverlayProof
              ? value
              : proofEvidenceValueForProof(
                  proof,
                  `run-hardware-os-${index + 1}`,
                )
          }`,
      ),
      gateSpecificEvidenceDetails(gate),
      capturedEvidenceDetails(),
    ].join("\n");

  const noDurationStatus = gateStatus(
    gate,
    configuredEnv,
    fakeExists(gate.artifactPaths),
    fakeRead({
      [artifactPath]: contentWithLongOverlayProofEvidence(
        "workflow-native-overlay-long-session-123",
      ),
    }),
  );

  assert.equal(noDurationStatus.ready, false);
  assert.deepEqual(noDurationStatus.missingProofs, []);
  assert.deepEqual(noDurationStatus.missingEvidenceDetails, [
    {
      field: `Evidence for ${longOverlayProof}`,
      path: artifactPath,
    },
  ]);

  const noUnitDurationStatus = gateStatus(
    gate,
    configuredEnv,
    fakeExists(gate.artifactPaths),
    fakeRead({
      [artifactPath]: contentWithLongOverlayProofEvidence(
        "workflow-native-overlay-long-session-duration-123",
      ),
    }),
  );

  assert.equal(noUnitDurationStatus.ready, false);
  assert.deepEqual(noUnitDurationStatus.missingEvidenceDetails, [
    {
      field: `Evidence for ${longOverlayProof}`,
      path: artifactPath,
    },
  ]);

  const durationStatus = gateStatus(
    gate,
    configuredEnv,
    fakeExists(gate.artifactPaths),
    fakeRead({
      [artifactPath]: contentWithLongOverlayProofEvidence(
        "workflow-native-overlay-long-session-duration-45min-123",
      ),
    }),
  );

  assert.equal(durationStatus.ready, true);
  assert.deepEqual(durationStatus.missingEvidenceDetails, []);
});

test("preflight status rejects weak proof-specific run IDs without digits", () => {
  const gate = evidenceGates.find((item) => item.id === "hardware-os-e2e");
  assert.ok(gate);

  const status = gateStatus(
    gate,
    fixedEvidenceClock,
    fakeExists(gate.artifactPaths),
    fakeRead({
      "docs/verification/external/hardware-os-e2e.md": [
        ...gate.requiredProofs.map((proof) => `- [x] ${proof}`),
        ...gate.requiredProofs.map(
          (proof) => `- Evidence for ${proof}: run-abc`,
        ),
        gateSpecificEvidenceDetails(gate),
        capturedEvidenceDetails(),
      ].join("\n"),
    }),
  );

  assert.equal(status.ready, false);
  assert.deepEqual(status.missingProofs, []);
  assert.deepEqual(
    status.missingEvidenceDetails.map((detail) => detail.field),
    gate.requiredProofs.map((proof) => `Evidence for ${proof}`),
  );
});

test("preflight status ignores checked proof rows inside markdown code fences", () => {
  const gate = evidenceGates.find((item) => item.id === "hardware-os-e2e");
  assert.ok(gate);

  const status = gateStatus(
    gate,
    {},
    fakeExists(gate.artifactPaths),
    fakeRead({
      "docs/verification/external/hardware-os-e2e.md": [
        "```md",
        proofContent(gate, capturedEvidenceDetails()),
        "```",
      ].join("\n"),
    }),
  );

  assert.equal(status.ready, false);
  assert.deepEqual(status.missingProofs, gate.requiredProofs);
  assert.deepEqual(
    status.missingEvidenceDetails,
    missingEvidenceDetails(
      gate,
      "docs/verification/external/hardware-os-e2e.md",
    ),
  );
});

test("preflight status ignores checked proof rows and evidence details inside inactive markdown", () => {
  const gate = evidenceGates.find((item) => item.id === "hardware-os-e2e");
  assert.ok(gate);

  const status = gateStatus(
    gate,
    {},
    fakeExists(gate.artifactPaths),
    fakeRead({
      "docs/verification/external/hardware-os-e2e.md": [
        "<!--",
        proofContent(gate, capturedEvidenceDetails()),
        "-->",
        "",
        ...proofContent(gate, capturedEvidenceDetails())
          .split("\n")
          .map((line) => `    ${line}`),
      ].join("\n"),
    }),
  );

  assert.equal(status.ready, false);
  assert.deepEqual(status.missingProofs, gate.requiredProofs);
  assert.deepEqual(
    status.missingEvidenceDetails,
    missingEvidenceDetails(
      gate,
      "docs/verification/external/hardware-os-e2e.md",
    ),
  );
});

test("preflight status rejects placeholder evidence detail values", () => {
  const gate = evidenceGates.find((item) => item.id === "hardware-os-e2e");
  assert.ok(gate);

  const status = gateStatus(
    gate,
    fixedEvidenceClock,
    fakeExists(gate.artifactPaths),
    fakeRead({
      "docs/verification/external/hardware-os-e2e.md": proofContent(
        gate,
        placeholderEvidenceDetails(),
      ),
    }),
  );

  assert.equal(status.ready, false);
  assert.deepEqual(status.missingProofs, []);
  assert.deepEqual(status.missingEvidenceDetails, [
    {
      field: "Captured at",
      path: "docs/verification/external/hardware-os-e2e.md",
    },
    {
      field: "Release ref",
      path: "docs/verification/external/hardware-os-e2e.md",
    },
    {
      field: "Commit SHA",
      path: "docs/verification/external/hardware-os-e2e.md",
    },
    {
      field: "Operator",
      path: "docs/verification/external/hardware-os-e2e.md",
    },
    {
      field: "Environment",
      path: "docs/verification/external/hardware-os-e2e.md",
    },
    {
      field:
        "Redacted run IDs, dashboard links, screenshots, or signed deployment logs",
      path: "docs/verification/external/hardware-os-e2e.md",
    },
    {
      field: "Redaction notes",
      path: "docs/verification/external/hardware-os-e2e.md",
    },
  ]);
});

test("preflight status rejects weak evidence detail values", () => {
  const gate = evidenceGates.find((item) => item.id === "hardware-os-e2e");
  assert.ok(gate);

  const status = gateStatus(
    gate,
    fixedEvidenceClock,
    fakeExists(gate.artifactPaths),
    fakeRead({
      "docs/verification/external/hardware-os-e2e.md": proofContent(
        gate,
        weakEvidenceDetails(),
      ),
    }),
  );

  assert.equal(status.ready, false);
  assert.deepEqual(status.missingProofs, []);
  assert.deepEqual(status.missingEvidenceDetails, [
    {
      field: "Operator",
      path: "docs/verification/external/hardware-os-e2e.md",
    },
    {
      field: "Environment",
      path: "docs/verification/external/hardware-os-e2e.md",
    },
    {
      field:
        "Redacted run IDs, dashboard links, screenshots, or signed deployment logs",
      path: "docs/verification/external/hardware-os-e2e.md",
    },
    {
      field: "Redaction notes",
      path: "docs/verification/external/hardware-os-e2e.md",
    },
  ]);
});

test("preflight status rejects contradictory redaction notes and accepts positive redaction notes", () => {
  const gate = evidenceGates.find((item) => item.id === "hardware-os-e2e");
  assert.ok(gate);
  const artifactPath = "docs/verification/external/hardware-os-e2e.md";
  const baseDetails = capturedEvidenceDetails();

  for (const note of [
    "not redacted",
    "unredacted",
    "contains raw provider output",
    "not reviewed",
  ]) {
    const status = gateStatus(
      gate,
      configuredEnv,
      fakeExists(gate.artifactPaths),
      fakeRead({
        [artifactPath]: proofContent(
          gate,
          baseDetails.replace(
            "- Redaction notes: raw secrets removed before commit",
            `- Redaction notes: ${note}`,
          ),
        ),
      }),
    );

    assert.equal(status.ready, false, note);
    assert.deepEqual(status.missingProofs, []);
    assert.deepEqual(status.missingEvidenceDetails, [
      {
        field: "Redaction notes",
        path: artifactPath,
      },
    ]);
    assert.equal(JSON.stringify(status).includes(note), false);
  }

  for (const note of [
    "raw secrets removed",
    "tokens redacted",
    "no raw secrets",
  ]) {
    const status = gateStatus(
      gate,
      configuredEnv,
      fakeExists(gate.artifactPaths),
      fakeRead({
        [artifactPath]: proofContent(
          gate,
          baseDetails.replace(
            "- Redaction notes: raw secrets removed before commit",
            `- Redaction notes: ${note}`,
          ),
        ),
      }),
    );

    assert.equal(status.ready, true, note);
    assert.deepEqual(status.missingEvidenceDetails, []);
  }
});

test("preflight status rejects generic gate-specific evidence identifiers", () => {
  const cases = [
    {
      artifactPath: "docs/verification/external/provider-live-integrations.md",
      fields: ["Provider/client matrix", "Provider response evidence"],
      gateId: "provider-live-integrations",
      replacements: [
        "- Provider/client matrix: run-generic-field-123",
        "- Live probe run ID: live-probe-run-123",
        "- Provider response evidence: run-generic-field-456",
      ],
    },
    {
      artifactPath: "docs/verification/external/hardware-os-e2e.md",
      fields: ["OS/title/client matrix", "Hardware profile"],
      gateId: "hardware-os-e2e",
      replacements: [
        "- OS/title/client matrix: run-generic-field-123",
        "- Hardware profile: run-generic-field-456",
        "- Session/run ID: overlay-session-run-123 duration:30m",
      ],
    },
    {
      artifactPath: "docs/verification/external/rollout-tracks.md",
      fields: ["Marketplace evidence", "Hosted deploy evidence"],
      gateId: "rollout-tracks",
      replacements: [
        `- Community rollout evidence: ${rolloutEvidence}`,
        "- Marketplace evidence: run-generic-field-123",
        "- Hosted deploy evidence: run-generic-field-456",
      ],
    },
  ];

  for (const { artifactPath, fields, gateId, replacements } of cases) {
    const gate = evidenceGates.find((item) => item.id === gateId);
    assert.ok(gate);

    const status = gateStatus(
      gate,
      configuredEnv,
      fakeExists(gate.artifactPaths),
      fakeRead({
        [artifactPath]: [
          ...gate.requiredProofs.map((proof) => `- [x] ${proof}`),
          ...gate.requiredProofs.map(
            (proof, index) =>
              `- Evidence for ${proof}: ${proofEvidenceValueForProof(
                proof,
                `run-${gate.id}-${index + 1}`,
              )}`,
          ),
          capturedEvidenceDetails(),
          ...replacements,
        ].join("\n"),
      }),
    );

    assert.equal(status.ready, false, gateId);
    assert.deepEqual(
      status.missingEvidenceDetails,
      fields.map((field) => ({ field, path: artifactPath })),
      gateId,
    );
  }
});

test("preflight status rejects weak gate-specific evidence detail values", () => {
  const gate = evidenceGates.find(
    (item) => item.id === "provider-live-integrations",
  );
  assert.ok(gate);

  const content = [
    ...gate.requiredProofs.map((proof) => `- [x] ${proof}`),
    ...gate.requiredProofs.map(
      (proof, index) =>
        `- Evidence for ${proof}: ${proofEvidenceValueForProof(
          proof,
          `run-provider-live-${index + 1}`,
        )}`,
    ),
    capturedEvidenceDetails(),
    "- Provider/client matrix: ok",
    "- Live probe run ID: live-probe-run-123",
    "- Provider response evidence: provider-response artifact run-123",
  ].join("\n");

  const status = gateStatus(
    gate,
    configuredEnv,
    fakeExists(gate.artifactPaths),
    fakeRead({
      "docs/verification/external/provider-live-integrations.md": content,
    }),
  );

  assert.equal(status.ready, false);
  assert.deepEqual(status.missingProofs, []);
  assert.deepEqual(status.missingEvidenceDetails, [
    {
      field: "Provider/client matrix",
      path: "docs/verification/external/provider-live-integrations.md",
    },
  ]);
});

test("preflight status rejects weak rollout track evidence detail values", () => {
  const gate = evidenceGates.find((item) => item.id === "rollout-tracks");
  assert.ok(gate);
  const artifactPath = "docs/verification/external/rollout-tracks.md";
  const baseContent = [
    ...gate.requiredProofs.map((proof) => `- [x] ${proof}`),
    ...gate.requiredProofs.map(
      (proof, index) =>
        `- Evidence for ${proof}: ${proofEvidenceValueForProof(
          proof,
          `run-rollout-${index + 1}`,
        )}`,
    ),
    capturedEvidenceDetails(),
  ];

  const weakStatus = gateStatus(
    gate,
    configuredEnv,
    fakeExists(gate.artifactPaths),
    fakeRead({
      [artifactPath]: [
        ...baseContent,
        "- Community rollout evidence: ok",
        "- Marketplace evidence: marketplace-run-123",
        "- Hosted deploy evidence: deployment-run-123",
      ].join("\n"),
    }),
  );

  assert.equal(weakStatus.ready, false);
  assert.deepEqual(weakStatus.missingProofs, []);
  assert.deepEqual(weakStatus.missingEvidenceDetails, [
    {
      field: "Community rollout evidence",
      path: artifactPath,
    },
    {
      field: "Marketplace evidence",
      path: artifactPath,
    },
    {
      field: "Hosted deploy evidence",
      path: artifactPath,
    },
  ]);

  const specificStatus = gateStatus(
    gate,
    configuredEnv,
    fakeExists(gate.artifactPaths),
    fakeRead({
      [artifactPath]: [
        ...baseContent,
        `- Community rollout evidence: ${rolloutEvidence}`,
        "- Marketplace evidence: plugin marketplace execution update run-123",
        `- Hosted deploy evidence: ${validHostedDeployEvidence}`,
      ].join("\n"),
    }),
  );

  assert.equal(specificStatus.ready, true);
});

test("preflight status rejects weak hosted cron run identifiers", () => {
  const gate = evidenceGates.find((item) => item.id === "hosted-supabase-cron");
  assert.ok(gate);

  const content = [
    ...gate.requiredProofs.map((proof) => `- [x] ${proof}`),
    ...gate.requiredProofs.map(
      (proof, index) =>
        `- Evidence for ${proof}: ${proofEvidenceValueForProof(
          proof,
          `run-hosted-cron-${index + 1}`,
        )}`,
    ),
    capturedEvidenceDetails(),
    allHostedCronLaneDetails().replace(
      "- Run ID: presence-poll-run-123",
      "- Run ID: banana",
    ),
  ].join("\n");

  const status = gateStatus(
    gate,
    configuredEnv,
    fakeExists(gate.artifactPaths),
    fakeRead({
      "docs/verification/external/hosted-supabase-cron.md": content,
    }),
  );

  assert.equal(status.ready, false);
  assert.deepEqual(status.missingProofs, []);
  assert.deepEqual(status.missingEvidenceDetails, [
    {
      field: "presence-poll: Run ID",
      path: "docs/verification/external/hosted-supabase-cron.md",
    },
  ]);
});

test("preflight status accepts hosted cron UUID run identifiers", () => {
  const gate = evidenceGates.find((item) => item.id === "hosted-supabase-cron");
  assert.ok(gate);

  const content = [
    ...gate.requiredProofs.map((proof) => `- [x] ${proof}`),
    ...gate.requiredProofs.map(
      (proof, index) =>
        `- Evidence for ${proof}: ${proofEvidenceValueForProof(
          proof,
          `run-hosted-cron-${index + 1}`,
        )}`,
    ),
    capturedEvidenceDetails(),
    allHostedCronLaneDetails()
      .replace(
        "- Run ID: presence-poll-run-123",
        "- Run ID: 97d8100a-b9d0-4d9c-8a93-6eecaa3a3112",
      )
      .replace(
        "- Run ID: account-deletion-run-123",
        "- Run ID: 1a7bf9df-3ea7-457b-80ff-3cb5a821e113",
      ),
  ].join("\n");

  const status = gateStatus(
    gate,
    configuredEnv,
    fakeExists(gate.artifactPaths),
    fakeRead({
      "docs/verification/external/hosted-supabase-cron.md": content,
    }),
  );

  assert.equal(status.ready, true);
  assert.deepEqual(status.missingEvidenceDetails, []);
});

test("preflight status accepts hosted cron collector run identifiers", () => {
  const gate = evidenceGates.find((item) => item.id === "hosted-supabase-cron");
  assert.ok(gate);

  const content = [
    ...gate.requiredProofs.map((proof) => `- [x] ${proof}`),
    ...gate.requiredProofs.map(
      (proof, index) =>
        `- Evidence for ${proof}: ${proofEvidenceValueForProof(
          proof,
          `run-hosted-cron-${index + 1}`,
        )}`,
    ),
    capturedEvidenceDetails(),
    allHostedCronLaneDetails()
      .replace(
        "- Run ID: presence-poll-run-123",
        "- Run ID: presence-poll-cli-scheduled",
      )
      .replace(
        "- Run ID: account-deletion-run-123",
        "- Run ID: account-deletion-cli-scheduled",
      ),
  ].join("\n");

  const status = gateStatus(
    gate,
    configuredEnv,
    fakeExists(gate.artifactPaths),
    fakeRead({
      "docs/verification/external/hosted-supabase-cron.md": content,
    }),
  );

  assert.equal(status.ready, true);
  assert.deepEqual(status.missingEvidenceDetails, []);
});

test("preflight status rejects scheduler proof evidence mappings without lane identity", () => {
  const gate = evidenceGates.find((item) => item.id === "hosted-supabase-cron");
  assert.ok(gate);
  const artifactPath = "docs/verification/external/hosted-supabase-cron.md";
  const baseContent = [
    ...gate.requiredProofs.map((proof) => `- [x] ${proof}`),
    capturedEvidenceDetails(),
    allHostedCronLaneDetails(),
  ];

  const genericStatus = gateStatus(
    gate,
    configuredEnv,
    fakeExists(gate.artifactPaths),
    fakeRead({
      [artifactPath]: [
        ...gate.requiredProofs.map(
          (proof, index) =>
            `- Evidence for ${proof}: workflow-hosted-cron-${index + 1}`,
        ),
        ...baseContent,
      ].join("\n"),
    }),
  );

  assert.equal(genericStatus.ready, false);
  assert.deepEqual(genericStatus.missingProofs, []);
  assert.deepEqual(
    genericStatus.missingEvidenceDetails.map(({ field }) => field),
    gate.requiredProofs.map((proof) => `Evidence for ${proof}`),
  );

  const laneScopedStatus = gateStatus(
    gate,
    configuredEnv,
    fakeExists(gate.artifactPaths),
    fakeRead({
      [artifactPath]: [
        " - Evidence for poll-platform-presence scheduled run writes fresh evidence.: workflow-presence-poll-123",
        " - Evidence for process-account-deletions scheduled run writes fresh evidence.: workflow-account-deletion-123",
        ...baseContent,
      ].join("\n"),
    }),
  );

  assert.equal(laneScopedStatus.ready, true);
  assert.deepEqual(laneScopedStatus.missingEvidenceDetails, []);
});

test("preflight status rejects non-ISO captured timestamps", () => {
  const gate = evidenceGates.find((item) => item.id === "hardware-os-e2e");
  assert.ok(gate);

  const status = gateStatus(
    gate,
    {},
    fakeExists(gate.artifactPaths),
    fakeRead({
      "docs/verification/external/hardware-os-e2e.md": proofContent(
        gate,
        capturedEvidenceDetails({ capturedAt: "yesterday at noon" }),
      ),
    }),
  );

  assert.equal(status.ready, false);
  assert.deepEqual(status.missingProofs, []);
  assert.deepEqual(status.missingEvidenceDetails, [
    {
      field: "Captured at",
      path: "docs/verification/external/hardware-os-e2e.md",
    },
  ]);
});

test("preflight status rejects stale and future captured timestamps", () => {
  const gate = evidenceGates.find((item) => item.id === "hardware-os-e2e");
  assert.ok(gate);

  for (const capturedAt of [
    "1970-01-01T00:00:00.000Z",
    "2026-06-17T12:11:00.000Z",
  ]) {
    const status = gateStatus(
      gate,
      configuredEnv,
      fakeExists(gate.artifactPaths),
      fakeRead({
        "docs/verification/external/hardware-os-e2e.md": proofContent(
          gate,
          capturedEvidenceDetails({ capturedAt }),
        ),
      }),
    );

    assert.equal(status.ready, false);
    assert.deepEqual(status.missingProofs, []);
    assert.deepEqual(status.missingEvidenceDetails, [
      {
        field: "Captured at",
        path: "docs/verification/external/hardware-os-e2e.md",
      },
    ]);
  }
});

test("preflight status rejects generic evidence locator values", () => {
  const gate = evidenceGates.find((item) => item.id === "hardware-os-e2e");
  assert.ok(gate);

  for (const locator of [
    "redacted",
    "available on request",
    "see attached later",
    "pending in dashboard",
    "run-abc",
  ]) {
    const status = gateStatus(
      gate,
      configuredEnv,
      fakeExists(gate.artifactPaths),
      fakeRead({
        "docs/verification/external/hardware-os-e2e.md": proofContent(
          gate,
          capturedEvidenceDetails({ locator }),
        ),
      }),
    );

    assert.equal(status.ready, false);
    assert.deepEqual(status.missingProofs, []);
    assert.deepEqual(status.missingEvidenceDetails, [
      {
        field:
          "Redacted run IDs, dashboard links, screenshots, or signed deployment logs",
        path: "docs/verification/external/hardware-os-e2e.md",
      },
    ]);
  }
});

test("preflight status rejects local verification screenshot locators as external evidence", () => {
  const gate = evidenceGates.find((item) => item.id === "hardware-os-e2e");
  assert.ok(gate);

  const status = gateStatus(
    gate,
    configuredEnv,
    fakeExists(gate.artifactPaths),
    fakeRead({
      "docs/verification/external/hardware-os-e2e.md": proofContent(
        gate,
        capturedEvidenceDetails({
          locator:
            "docs/verification/screenshots/settings-external-completion-evidence-summary-local.png",
        }),
      ),
    }),
  );

  assert.equal(status.ready, false);
  assert.deepEqual(status.missingProofs, []);
  assert.deepEqual(status.missingEvidenceDetails, [
    {
      field:
        "Redacted run IDs, dashboard links, screenshots, or signed deployment logs",
      path: "docs/verification/external/hardware-os-e2e.md",
    },
  ]);
});

test("preflight status rejects duplicate evidence rows when any value is invalid", () => {
  const gate = evidenceGates.find((item) => item.id === "hardware-os-e2e");
  assert.ok(gate);
  const artifactPath = "docs/verification/external/hardware-os-e2e.md";
  const firstProof = gate.requiredProofs[0];
  const localScreenshotPath =
    "docs/verification/screenshots/settings-external-completion-evidence-summary-local.png";
  const windowsLocalScreenshotPath =
    "docs\\verification\\screenshots\\settings-external-completion-evidence-summary-local.png";

  const duplicateDetailStatus = gateStatus(
    gate,
    configuredEnv,
    fakeExists(gate.artifactPaths),
    fakeRead({
      [artifactPath]: proofContent(
        gate,
        [
          capturedEvidenceDetails(),
          `- Redacted run IDs, dashboard links, screenshots, or signed deployment logs: ${localScreenshotPath}`,
        ].join("\n"),
      ),
    }),
  );

  assert.equal(duplicateDetailStatus.ready, false);
  assert.deepEqual(duplicateDetailStatus.missingProofs, []);
  assert.deepEqual(duplicateDetailStatus.missingEvidenceDetails, [
    {
      field:
        "Redacted run IDs, dashboard links, screenshots, or signed deployment logs",
      path: artifactPath,
    },
  ]);
  assert.deepEqual(duplicateDetailStatus.evidenceDetailFindings, [
    {
      field:
        "Redacted run IDs, dashboard links, screenshots, or signed deployment logs",
      path: artifactPath,
      reason: "local_path",
    },
  ]);

  const duplicateProofStatus = gateStatus(
    gate,
    configuredEnv,
    fakeExists(gate.artifactPaths),
    fakeRead({
      [artifactPath]: proofContent(
        gate,
        [
          capturedEvidenceDetails(),
          `- Evidence for ${firstProof}: ${localScreenshotPath}`,
        ].join("\n"),
      ),
    }),
  );

  assert.equal(duplicateProofStatus.ready, false);
  assert.deepEqual(duplicateProofStatus.missingProofs, []);
  assert.deepEqual(duplicateProofStatus.missingEvidenceDetails, [
    {
      field: `Evidence for ${firstProof}`,
      path: artifactPath,
    },
  ]);
  assert.deepEqual(duplicateProofStatus.proofEvidenceFindings, [
    {
      field: `Evidence for ${firstProof}`,
      path: artifactPath,
      proof: firstProof,
      reason: "local_path",
    },
  ]);

  const duplicateWindowsProofStatus = gateStatus(
    gate,
    configuredEnv,
    fakeExists(gate.artifactPaths),
    fakeRead({
      [artifactPath]: proofContent(
        gate,
        [
          capturedEvidenceDetails(),
          `- Evidence for ${firstProof}: run-fullscreen-anticheat-overlay-123 ${windowsLocalScreenshotPath}`,
        ].join("\n"),
      ),
    }),
  );

  assert.equal(duplicateWindowsProofStatus.ready, false);
  assert.deepEqual(duplicateWindowsProofStatus.missingProofs, []);
  assert.deepEqual(duplicateWindowsProofStatus.missingEvidenceDetails, [
    {
      field: `Evidence for ${firstProof}`,
      path: artifactPath,
    },
  ]);
  assert.deepEqual(duplicateWindowsProofStatus.proofEvidenceFindings, [
    {
      field: `Evidence for ${firstProof}`,
      path: artifactPath,
      proof: firstProof,
      reason: "local_path",
    },
  ]);
});

test.skip("preflight status rejects unapproved URL and local path evidence locators", () => {
  const gate = evidenceGates.find((item) => item.id === "hardware-os-e2e");
  assert.ok(gate);

  for (const locator of [
    "run-123 docs/verification/screenshots/settings-external-completion-evidence-summary-local.png",
    "run-123 docs\\verification\\screenshots\\settings-external-completion-evidence-summary-local.png",
    "./artifact-run-123.log",
    ".\\artifact-run-123.log",
    "../logs/run-123.log",
    "..\\logs\\run-123.log",
    "run-123 docs/verification/external/local.md",
    "run-123 scripts/operator-proof.log",
    "run-123 scripts\\operator-proof.log",
    "run-123 launcher\\src\\local-proof.log",
    "/tmp/run-123.log",
    "C:\\logs\\run-123.log",
    "https://example.com/proof",
    "https://sub.example.org/dashboard/run-123",
    "https://supabase.com/dashboard/project/example/functions/logs/run-12345",
    "https://app.supabase.com/project/example/functions/logs/run-12345",
    "https://supabase.com:8443/dashboard/project/awebfvfyqzwapcgixdfj/functions/logs/run-12345",
    "https://github.com:8443/open-game-collective/open-game-launcher/actions/runs/12345",
    "https://dashboard.stripe.com/test/events/evt_1234567890",
    "https://dashboard.stripe.com:8443/events/evt_1234567890",
    "https://storage.googleapis.com/ogl/run-123",
    "http://localhost:3000/run-123",
    "http://127.0.0.1/run-123",
    "http://10.0.0.12/log-123",
    "http://192.168.1.10/artifact-123",
    "http://172.20.0.5/workflow-123",
    "file:///tmp/proof.log",
  ]) {
    const status = gateStatus(
      gate,
      configuredEnv,
      fakeExists(gate.artifactPaths),
      fakeRead({
        "docs/verification/external/hardware-os-e2e.md": proofContent(
          gate,
          capturedEvidenceDetails({ locator }),
        ),
      }),
    );

    assert.equal(status.ready, false);
    assert.deepEqual(status.missingProofs, []);
    assert.deepEqual(status.missingEvidenceDetails, [
      {
        field:
          "Redacted run IDs, dashboard links, screenshots, or signed deployment logs",
        path: "docs/verification/external/hardware-os-e2e.md",
      },
    ]);
  }

  const validStatus = gateStatus(
    gate,
    configuredEnv,
    fakeExists(gate.artifactPaths),
    fakeRead({
      "docs/verification/external/hardware-os-e2e.md": proofContent(
        gate,
        capturedEvidenceDetails({
          locator:
            "https://supabase.com/dashboard/project/awebfvfyqzwapcgixdfj/functions/logs/run-12345",
        }),
      ),
    }),
  );

  assert.equal(validStatus.ready, true);
  assert.deepEqual(validStatus.missingEvidenceDetails, []);

  const validStripeStatus = gateStatus(
    gate,
    configuredEnv,
    fakeExists(gate.artifactPaths),
    fakeRead({
      "docs/verification/external/hardware-os-e2e.md": proofContent(
        gate,
        capturedEvidenceDetails({
          locator: "https://dashboard.stripe.com/events/evt_1234567890",
        }),
      ),
    }),
  );

  assert.equal(validStripeStatus.ready, true);
  assert.deepEqual(validStripeStatus.missingEvidenceDetails, []);
});

function rolloutEvidenceContent(gate, hostedDeployLocator) {
  return [
    ...gate.requiredProofs.map((proof) => `- [x] ${proof}`),
    "",
    ...gate.requiredProofs.map((proof, index) => {
      const value = proof.includes("Hosted production deployment")
        ? hostedDeployLocator
        : proofEvidenceValueForProof(proof, `run-${gate.id}-${index + 1}`);
      return `- Evidence for ${proof}: ${value}`;
    }),
    capturedEvidenceDetails(),
    `- Community rollout evidence: ${rolloutEvidence}`,
    "- Marketplace evidence: plugin marketplace execution update workflow-123",
    `- Hosted deploy evidence: ${hostedDeployLocator}`,
  ].join("\n");
}

test("preflight status requires hosted deploy workflow evidence with production CI inputs", () => {
  const gate = evidenceGates.find((item) => item.id === "rollout-tracks");
  assert.ok(gate);
  const artifactPath = "docs/verification/external/rollout-tracks.md";
  const hostedDeployProof =
    "Hosted production deployment evidence is attached.";

  for (const locator of [
    "hosted-deploy workflow-123",
    "hosted-deploy workflow: https://github.com/open-game-collective/open-game-launcher/actions/runs/12345",
    "hosted-deploy CI main hosted_deploy_action=all hosted_deploy_dry_run=false workflow: https://github.com/open-game-collective/open-game-launcher/actions/runs/12345",
    "hosted-deploy CI main hosted_deploy_gate=true hosted_environment=hosted-production hosted_deploy_dry_run=false workflow: https://github.com/open-game-collective/open-game-launcher/actions/runs/12345",
    "hosted-deploy CI main hosted_deploy_gate=true hosted_environment=hosted-production hosted_deploy_action=all workflow: https://github.com/open-game-collective/open-game-launcher/actions/runs/12345",
    "hosted-deploy https://github.com/open-game-collective/open-game-launcher/pull/123",
    "hosted-deploy workflow-123 https://github.com/open-game-collective/open-game-launcher/pull/123",
    "hosted-deploy https://github.com/open-game-collective/open-game-launcher/commit/0123456789abcdef0123456789abcdef01234567",
    "hosted-deploy workflow-123 https://github.com/open-game-collective/open-game-launcher/commit/0123456789abcdef0123456789abcdef01234567",
  ]) {
    const status = gateStatus(
      gate,
      configuredEnv,
      fakeExists(gate.artifactPaths),
      fakeRead({
        [artifactPath]: rolloutEvidenceContent(gate, locator),
      }),
    );

    assert.equal(status.ready, false);
    assert.deepEqual(status.missingEvidenceDetails, [
      {
        field: "Hosted deploy evidence",
        path: artifactPath,
      },
      {
        field: `Evidence for ${hostedDeployProof}`,
        path: artifactPath,
      },
    ]);
    assert.deepEqual(status.proofEvidenceFindings, [
      {
        field: `Evidence for ${hostedDeployProof}`,
        path: artifactPath,
        proof: hostedDeployProof,
        reason: "missing_lane_terms",
      },
    ]);
  }

  const validStatus = gateStatus(
    gate,
    configuredEnv,
    fakeExists(gate.artifactPaths),
    fakeRead({
      [artifactPath]: rolloutEvidenceContent(gate, validHostedDeployEvidence),
    }),
  );

  assert.equal(validStatus.ready, true);
  assert.deepEqual(validStatus.missingEvidenceDetails, []);
});

test("preflight status rejects accepted-host evidence URLs with userinfo query or hash without echoing values", () => {
  const gate = evidenceGates.find((item) => item.id === "hardware-os-e2e");
  assert.ok(gate);
  const artifactPath = "docs/verification/external/hardware-os-e2e.md";

  for (const { locator, secretFragments } of [
    {
      locator:
        "https://github.com/open-game-collective/open-game-launcher/actions/runs/12345?token=ghp_raw_secret_123",
      secretFragments: ["ghp_raw_secret_123"],
    },
    {
      locator:
        "https://supabase.com/dashboard/project/awebfvfyqzwapcgixdfj/functions/logs/run-12345#access_token=supabase_raw_secret_123",
      secretFragments: ["supabase_raw_secret_123"],
    },
    {
      locator:
        "https://operator:stripe_raw_secret_123@dashboard.stripe.com/events/evt_1234567890abcdef",
      secretFragments: ["operator", "stripe_raw_secret_123"],
    },
  ]) {
    const status = gateStatus(
      gate,
      configuredEnv,
      fakeExists(gate.artifactPaths),
      fakeRead({
        [artifactPath]: proofContent(
          gate,
          capturedEvidenceDetails({ locator }),
        ),
      }),
    );

    assert.equal(status.ready, false, locator);
    assert.deepEqual(status.missingProofs, []);
    assert.deepEqual(status.missingEvidenceDetails, [
      {
        field:
          "Redacted run IDs, dashboard links, screenshots, or signed deployment logs",
        path: artifactPath,
      },
    ]);
    for (const fragment of secretFragments) {
      assert.equal(JSON.stringify(status).includes(fragment), false);
    }
  }
});









test("preflight status rejects dry_run=false value no", () => {
  const gate = evidenceGates.find((item) => item.id === "hosted-supabase-cron");
  assert.ok(gate);

  const content = [
    ...gate.requiredProofs.map((proof) => `- [x] ${proof}`),
    ...gate.requiredProofs.map(
      (proof, index) =>
        `- Evidence for ${proof}: ${proofEvidenceValueForProof(
          proof,
          `run-hosted-cron-${index + 1}`,
        )}`,
    ),
    capturedEvidenceDetails(),
    allHostedCronLaneDetails().replace(
      "- dry_run=false: confirmed false",
      "- dry_run=false: no",
    ),
  ].join("\n");

  const status = gateStatus(
    gate,
    configuredEnv,
    fakeExists(gate.artifactPaths),
    fakeRead({
      "docs/verification/external/hosted-supabase-cron.md": content,
    }),
  );

  assert.equal(status.ready, false);
  assert.deepEqual(status.missingProofs, []);
  assert.deepEqual(status.missingEvidenceDetails, [
    {
      field: "account-deletion: dry_run=false",
      path: "docs/verification/external/hosted-supabase-cron.md",
    },
  ]);
});



test("preflight status blocks raw GitHub token artifact content", () => {
  const gate = evidenceGates.find((item) => item.id === "rollout-tracks");
  assert.ok(gate);
  const artifactPath = "docs/verification/external/rollout-tracks.md";

  for (const rawGithubToken of [
    "ghp_abcdefghijklmnopqrstuvwxyz1234567890",
    "github_pat_11AA22BB03abcdefghijklmnopqrstuvwxyz1234567890",
    "GITHUB_TOKEN=ghs_abcdefghijklmnopqrstuvwxyz1234567890",
    "GH_TOKEN=gho_abcdefghijklmnopqrstuvwxyz1234567890",
    "GITHUB_PAT=ghp_abcdefghijklmnopqrstuvwxyz1234567890",
  ]) {
    const status = gateStatus(
      gate,
      configuredEnv,
      fakeExists(gate.artifactPaths),
      fakeRead({
        [artifactPath]: rolloutEvidenceContent(
          gate,
          validHostedDeployEvidence,
        ).concat("\n", rawGithubToken),
      }),
    );

    assert.equal(status.ready, false);
    assert.deepEqual(status.missingProofs, []);
    assert.deepEqual(status.secretFindings, [
      {
        label: "Raw GitHub token",
        path: artifactPath,
      },
    ]);
    assert.equal(JSON.stringify(status).includes(rawGithubToken), false);
  }

  const redactedStatus = gateStatus(
    gate,
    configuredEnv,
    fakeExists(gate.artifactPaths),
    fakeRead({
      [artifactPath]: [
        rolloutEvidenceContent(gate, validHostedDeployEvidence),
        "GITHUB_TOKEN=[redacted]",
        "GH_TOKEN=<redacted>",
        "GITHUB_PAT=***",
      ].join("\n"),
    }),
  );

  assert.equal(redactedStatus.ready, true);
  assert.deepEqual(redactedStatus.secretFindings, []);
});

test("preflight status blocks raw provider API key artifact content", () => {
  const gate = evidenceGates.find(
    (item) => item.id === "provider-live-integrations",
  );
  assert.ok(gate);
  const artifactPath =
    "docs/verification/external/provider-live-integrations.md";
  const rawProviderSecrets = [
    "STEAM_WEB_API_KEY=steam_live_super_secret_1234567890",
    "RAWG_API_KEY=rawg_live_super_secret_1234567890",
    "PRESENCE_PROVIDER_TOKEN=presence_live_super_secret_1234567890",
    "X-Api-Key: provider_...90",
    "Authorization: Token provider_...7890",
  ];

  for (const rawProviderSecret of rawProviderSecrets) {
    const status = gateStatus(
      gate,
      configuredEnv,
      fakeExists(gate.artifactPaths),
      fakeRead({
        [artifactPath]: proofContent(
          gate,
          [capturedEvidenceDetails(), rawProviderSecret].join("\n"),
        ),
      }),
    );

    assert.equal(status.ready, false);
    assert.deepEqual(status.missingProofs, []);
    assert.deepEqual(status.secretFindings, [
      {
        label: "Raw provider API key",
        path: artifactPath,
      },
    ]);
    assert.equal(JSON.stringify(status).includes("super_secret"), false);
  }

  const redactedStatus = gateStatus(
    gate,
    configuredEnv,
    fakeExists(gate.artifactPaths),
    fakeRead({
      [artifactPath]: [
        proofContent(gate, capturedEvidenceDetails()),
        "STEAM_WEB_API_KEY=[redacted]",
        "RAWG_API_KEY=[redacted]",
        "PRESENCE_PROVIDER_TOKEN=<redacted>",
        "X-Api-Key: ***",
        "Authorization: Token ***",
      ].join("\n"),
    }),
  );

  assert.equal(redactedStatus.ready, true);
  assert.deepEqual(redactedStatus.secretFindings, []);
});



test("preflight status blocks raw Supabase and hosted cron secrets", () => {
  const gate = evidenceGates.find((item) => item.id === "hosted-supabase-cron");
  assert.ok(gate);
  const artifactPath = "docs/verification/external/hosted-supabase-cron.md";
  const rawSecrets = [
    {
      label: "Raw Supabase credential",
      value: "SUPABASE_SERVICE_ROLE_KEY=service_role_live_value_1234567890",
    },
    {
      label: "Raw Supabase credential",
      value: "SUPABASE_ANON_KEY=anon_key_live_value_1234567890",
    },
    {
      label: "Raw Supabase credential",
      value: "SUPABASE_AUTH_JWT=auth_jwt_live_value_1234567890",
    },
    {
      label: "Raw Supabase access token",
      value: "SUPABASE_ACCESS_TOKEN=sbp_abcdefghijklmnopqrstuvwxyz1234567890",
    },
    {
      label: "Raw Supabase access token",
      value: "copied token sbp_abcdefghijklmnopqrstuvwxyz1234567890",
    },
    {
      label: "Raw hosted cron secret",
      value:
        "ACCOUNT_DELETION_PROCESSOR_SECRET=account_delete_live_value_1234567890",
    },
    {
      label: "Raw hosted cron secret",
      value: "PRESENCE_POLL_SECRET=presence_poll_live_value_1234567890",
    },
  ];

  for (const { label, value } of rawSecrets) {
    const status = gateStatus(
      gate,
      configuredEnv,
      fakeExists(gate.artifactPaths),
      fakeRead({
        [artifactPath]: proofContent(
          gate,
          [capturedEvidenceDetails(), value].join("\n"),
        ),
      }),
    );

    assert.equal(status.ready, false);
    assert.deepEqual(status.missingProofs, []);
    assert.deepEqual(status.secretFindings, [{ label, path: artifactPath }]);
    assert.equal(JSON.stringify(status).includes("live_value"), false);
  }

  const redactedStatus = gateStatus(
    gate,
    configuredEnv,
    fakeExists(gate.artifactPaths),
    fakeRead({
      [artifactPath]: [
        proofContent(
          gate,
          [allHostedCronLaneDetails(), capturedEvidenceDetails()].join("\n"),
        ),
        "SUPABASE_SERVICE_ROLE_KEY=[redacted]",
        "SUPABASE_AUTH_JWT=<redacted>",
        "SUPABASE_ACCESS_TOKEN=***",
      ].join("\n"),
    }),
  );

  assert.equal(redactedStatus.ready, true);
  assert.deepEqual(redactedStatus.secretFindings, []);
});

test("preflight status blocks raw private-key artifact content", () => {
  const gate = evidenceGates.find((item) => item.id === "rollout-tracks");
  assert.ok(gate);
  const artifactPath = "docs/verification/external/rollout-tracks.md";
  const rawSecrets = [
    {
      label: "Raw private key",
      value: "-----BEGIN PRIVATE KEY-----",
    },
  ];

  for (const { label, value } of rawSecrets) {
    const status = gateStatus(
      gate,
      configuredEnv,
      fakeExists(gate.artifactPaths),
      fakeRead({
        [artifactPath]: proofContent(
          gate,
          [capturedEvidenceDetails(), value].join("\n"),
        ),
      }),
    );

    assert.equal(status.ready, false);
    assert.deepEqual(status.missingProofs, []);
    assert.deepEqual(status.secretFindings, [{ label, path: artifactPath }]);
  }

  const redactedStatus = gateStatus(
    gate,
    configuredEnv,
    fakeExists(gate.artifactPaths),
    fakeRead({
      [artifactPath]: [
        proofContent(gate, capturedEvidenceDetails()),
        "PRIVATE_KEY=[redacted]",
      ].join("\n"),
    }),
  );

  assert.equal(redactedStatus.ready, true);
  assert.deepEqual(redactedStatus.secretFindings, []);
});

test("collectStatuses marks a fully evidenced filtered gate ready", () => {
  const gate = evidenceGates.find((item) => item.id === "hosted-supabase-cron");
  assert.ok(gate);
  const env = {
    OGL_EXTERNAL_EVIDENCE_GATES: "hosted-supabase-cron",
    ...configuredEnv,
  };
  assert.deepEqual(
    collectStatuses(
      env,
      fakeExists(["docs/verification/external/hosted-supabase-cron.md"]),
      fakeRead({
        "docs/verification/external/hosted-supabase-cron.md": proofContent(
          gate,
          [allHostedCronLaneDetails(), capturedEvidenceDetails()].join("\n"),
        ),
      }),
    ),
    [
      {
        id: "hosted-supabase-cron",
        evidenceDetailFindings: [],
        envFindings: [],
        hostedCronReceiptFindings: [],
        missingArtifacts: [],
        missingArtifactProofs: [],
        missingEnv: [],
        missingEvidenceDetails: [],
        missingProofs: [],
        proofEvidenceFindings: [],
        ready: true,
        secretFindings: [],
        templateOnlyFindings: [],
        unreadableArtifacts: [],
      },
    ],
  );
});

test("multi-artifact gates assign every required proof exactly once", () => {
  for (const gate of evidenceGates.filter(
    (item) => item.artifactPaths.length > 1,
  )) {
    assert.ok(
      gate.artifactProofs,
      `${gate.id} must define per-artifact proof mapping.`,
    );
    assert.deepEqual(
      gate.artifactProofs.map((item) => item.path).sort(),
      [...gate.artifactPaths].sort(),
    );

    const mappedProofs = gate.artifactProofs.flatMap(
      (item) => item.requiredProofs,
    );
    assert.deepEqual(
      [...new Set(mappedProofs)].sort(),
      [...mappedProofs].sort(),
    );
    assert.deepEqual(mappedProofs.sort(), [...gate.requiredProofs].sort());
  }
});

test("external evidence capture handoffs cover every required proof exactly once", () => {
  for (const gate of evidenceGates) {
    const handoffProofs = Object.keys(gate.captureHandoffs ?? {});
    assert.deepEqual(
      handoffProofs.sort(),
      [...gate.requiredProofs].sort(),
      `${gate.id} must define one capture handoff for each required proof.`,
    );

    for (const proof of gate.requiredProofs) {
      const handoff = gate.captureHandoffs[proof];
      assert.equal(typeof handoff.capture, "string");
      assert.ok(handoff.capture.trim().length > 20);
      assert.ok(Array.isArray(handoff.terms));
      assert.ok(handoff.terms.length > 0);
      assert.doesNotMatch(
        `${handoff.capture} ${handoff.terms.join(" ")}`,
        /sk_live_[a-z0-9_=-]+|whsec_[a-z0-9_=-]+|bearer\s+[a-z0-9._~+/=-]{12,}|eyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}/i,
      );
    }
  }
});

test.skip("artifactTemplate prints required proof checklist rows without secret values", () => {
  const gate = evidenceGates.find(
    (item) => item.id === "provider-live-integrations",
  );
  assert.ok(gate);
  const template = artifactTemplate(gate, gate.artifactPaths[0]);

  assert.match(template, /Provider live integrations Evidence/);
  assert.doesNotMatch(template, /NEXUS_MODS_APP_ID/);
  assert.match(
    template,
    /Preflight requires non-empty, non-placeholder values/,
  );
  assert.match(template, /UTC ISO-8601 timestamp/);
  assert.match(template, /^## Capture Handoff$/m);
  assert.match(template, /Handoffs are guidance only/);
  assert.match(template, /Proof Evidence Mapping/);
  assert.match(template, /Gate-Specific Evidence/);
  assert.match(template, /`sha256:<64-hex>` reference/);
  assert.match(template, /Accepted dashboard URL hosts are Supabase/);
  assert.match(template, /Proof evidence values must name the proof lane/);
  assert.match(template, /non-steam-presence-bridge-provider/);
  assert.match(
    template,
    /run:.*probe-.*session-.*workflow-.*deployment-.*artifact-/s,
  );
  for (const proof of gate.requiredProofs) {
    assert.match(
      template,
      new RegExp(proof.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.match(
      template,
      new RegExp(
        `Evidence for ${proof}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      ),
    );
    assert.match(
      template,
      new RegExp(`- ${proof}:`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }
  for (const field of requiredEvidenceFieldsForArtifact(
    gate,
    gate.artifactPaths[0],
  )) {
    assert.match(template, new RegExp(`[-*]\\s+${escapeRegExp(field)}:`));
  }
  assert.doesNotMatch(
    template,
    /sk_live_[a-z0-9_=-]+|whsec_[a-z0-9_=-]+|bearer\s+[a-z0-9._~+/=-]{12,}/i,
  );

  const storeGate = evidenceGates.find(
    (item) => item.id === "hosted-supabase-cron",
  );
  assert.ok(storeGate);
  const schedulerTemplate = artifactTemplate(
    storeGate,
    "docs/verification/external/hosted-supabase-cron.md",
  );
  assert.match(schedulerTemplate, /poll-platform-presence/);
  const schedulerCaptureSection = schedulerTemplate.slice(
    schedulerTemplate.indexOf("## Capture Handoff"),
    schedulerTemplate.indexOf("## Proof Evidence Mapping"),
  );
  assert.match(
    schedulerCaptureSection,
    /OGL_HOSTED_CRON_EVIDENCE_CHECKS=presence-poll pnpm hosted:cron-evidence:artifact-hints/,
  );
  assert.match(
    schedulerCaptureSection,
    /pnpm hosted:deploy-gate:scheduler-packet/,
  );
  assert.match(schedulerCaptureSection, /scheduler dashboard\/config proof/);
  assert.match(
    schedulerCaptureSection,
    /artifact hints fill Gate-Specific Evidence only/,
  );
  assert.match(schedulerTemplate, /Hosted Cron REST Collector Environment/);
  assert.match(
    schedulerTemplate,
    new RegExp(escapeRegExp(hostedCronRestUrlPrerequisite)),
  );
  assert.match(
    schedulerTemplate,
    new RegExp(escapeRegExp(hostedCronRestAuthPrerequisite)),
  );
  assert.match(schedulerCaptureSection, /presence_poll_runs/);
  assert.match(
    schedulerTemplate,
    /Expected hosted cron values: `Hosted cron table: presence_poll_runs`, `Function: poll-platform-presence`, `Scheduled: scheduled`, `dry_run=false: false` or `confirmed false`, and `Status: completed`/,
  );
  assert.doesNotMatch(
    schedulerTemplate,
    /Stripe webhook signature delivery reaches stripe-webhook\./,
  );
  assert.doesNotMatch(
    schedulerTemplate,
    /Stripe Tax and invoice settings are verified in Dashboard\./,
  );
  for (const field of [
    "Hosted cron table",
    "Function",
    "Run ID",
    "Scheduled",
    "dry_run=false",
    "Status",
  ]) {
    assert.match(
      schedulerTemplate,
      new RegExp(`[-*]\\s+${escapeRegExp(field)}:`),
    );
  }

  const hostedCronGate = evidenceGates.find(
    (item) => item.id === "hosted-supabase-cron",
  );
  assert.ok(hostedCronGate);
  const hostedCronTemplate = artifactTemplate(
    hostedCronGate,
    "docs/verification/external/hosted-supabase-cron.md",
  );
  const hostedCronCaptureSection = hostedCronTemplate.slice(
    hostedCronTemplate.indexOf("## Capture Handoff"),
    hostedCronTemplate.indexOf("## Proof Evidence Mapping"),
  );
  assert.match(
    hostedCronCaptureSection,
    /--checks=presence-poll[\s\S]*interim validation/i,
  );
  assert.match(
    hostedCronCaptureSection,
    /final hosted-supabase-cron proof needs unscoped grouped `pnpm hosted:cron-evidence:artifact-hints` output/i,
  );
  assert.match(hostedCronTemplate, /Hosted Cron REST Collector Environment/);
  assert.match(
    hostedCronTemplate,
    new RegExp(escapeRegExp(hostedCronRestUrlPrerequisite)),
  );
  assert.match(
    hostedCronTemplate,
    new RegExp(escapeRegExp(hostedCronRestAuthPrerequisite)),
  );

  const rolloutGate = evidenceGates.find(
    (item) => item.id === "rollout-tracks",
  );
  assert.ok(rolloutGate);
  const rolloutTemplate = artifactTemplate(
    rolloutGate,
    "docs/verification/external/rollout-tracks.md",
  );
  const rolloutCaptureSection = rolloutTemplate.slice(
    rolloutTemplate.indexOf("## Capture Handoff"),
    rolloutTemplate.indexOf("## Proof Evidence Mapping"),
  );
  assert.match(rolloutCaptureSection, /pnpm hosted:deploy-gate:packet/);
  assert.match(rolloutCaptureSection, /GitHub Actions `CI` from `main`/);
  assert.match(rolloutCaptureSection, /hosted_deploy_gate=true/);
  assert.match(rolloutCaptureSection, /hosted_environment=hosted-production/);
  assert.match(rolloutCaptureSection, /hosted_deploy_action=all/);
  assert.match(rolloutCaptureSection, /hosted_deploy_dry_run=false/);
  assert.match(rolloutCaptureSection, /Hosted deploy evidence/);
  assert.match(rolloutCaptureSection, /Handoffs are guidance only/);
  assert.doesNotMatch(rolloutCaptureSection, /Required lane terms/);
  assert.match(
    rolloutTemplate,
    /Community rollout evidence must include `community`, `artwork`, and `rollout`/,
  );
  assert.doesNotMatch(
    rolloutTemplate,
    /community artwork\/screenshots|screenshot-rollout/i,
  );
});

test("required external evidence artifacts exist and cover required structure", () => {
  const statuses = collectStatuses({}, existsSync, readFileSync);
  for (const status of statuses) {
    assert.deepEqual(status.missingArtifacts, []);
    assert.deepEqual(status.unreadableArtifacts, []);
  }

  for (const gate of evidenceGates) {
    for (const artifactPath of gate.artifactPaths) {
      const artifact = readFileSync(
        new URL(`../${artifactPath}`, import.meta.url),
        "utf8",
      );
      assert.match(
        artifact,
        new RegExp(`Artifact: \`${escapeRegExp(artifactPath)}\``),
      );
      for (const section of [
        "Required Environment Names",
        "Required Proof Checklist",
        "Capture Handoff",
        "Proof Evidence Mapping",
        "Gate-Specific Evidence",
        "Lane-Specific Evidence",
        "Evidence Captured",
        "Secret Handling",
      ]) {
        assert.match(
          artifact,
          new RegExp(`^## ${escapeRegExp(section)}$`, "m"),
        );
      }

      if (gate.requiredEnv.length === 0) {
        assert.match(artifact, /^- none$/m);
      } else {
        for (const envName of requiredEnvForArtifact(gate, artifactPath)) {
          assert.match(
            artifact,
            new RegExp(`[-*]\\s+\`${escapeRegExp(envName)}\``),
          );
        }
      }

      const requiredProofs =
        gate.artifactProofs?.find((item) => item.path === artifactPath)
          ?.requiredProofs ?? gate.requiredProofs;
      for (const proof of requiredProofs) {
        assert.match(
          artifact,
          new RegExp(`[-*]\\s+\\[[ xX]\\]\\s+${escapeRegExp(proof)}`),
        );
        assert.match(artifact, new RegExp(`[-*]\\s+${escapeRegExp(proof)}:`));
        assert.match(
          artifact,
          new RegExp(`[-*]\\s+Evidence for ${escapeRegExp(proof)}:`),
        );
      }

      for (const field of requiredEvidenceFieldsForArtifact(
        gate,
        artifactPath,
      )) {
        assert.match(artifact, new RegExp(`[-*]\\s+${escapeRegExp(field)}:`));
      }

      const requiredEvidenceGroups = gate.artifactEvidenceGroups?.find(
        (item) => item.path === artifactPath,
      )?.groups;
      if (requiredEvidenceGroups) {
        assert.match(artifact, /^## Lane-Specific Evidence$/m);
        for (const group of requiredEvidenceGroups) {
          assert.match(
            artifact,
            new RegExp(`^### ${escapeRegExp(group.heading)}$`, "m"),
          );
          for (const field of group.requiredFields) {
            assert.match(
              artifact,
              new RegExp(`[-*]\\s+${escapeRegExp(field)}:`),
            );
          }
        }
      }

      if (/^>\s*Template only\b/m.test(artifact)) {
        assert.equal(
          artifact.trimEnd(),
          artifactTemplate(gate, artifactPath).trimEnd(),
          `${artifactPath} should match the generated template until live evidence replaces it.`,
        );
      }
    }
  }
});

test("committed external guidance does not contain stale fixed timestamp example", () => {
  const staleTimestamp = "2026-06-16T12:00:00.000Z";
  const guidance = [
    {
      label: "docs/runbooks/external-completion-evidence.md",
      content: runbook,
    },
  ];

  for (const gate of evidenceGates) {
    for (const artifactPath of gate.artifactPaths) {
      guidance.push({
        label: artifactPath,
        content: readFileSync(
          new URL(`../${artifactPath}`, import.meta.url),
          "utf8",
        ),
      });
      guidance.push({
        label: `template:${artifactPath}`,
        content: artifactTemplate(gate, artifactPath),
      });
    }
  }

  for (const item of guidance) {
    assert.equal(
      item.content.includes(staleTimestamp),
      false,
      `${item.label} must use fresh current UTC timestamp guidance`,
    );
  }
});

test("runbook and local audit mention every external gate", () => {
  for (const gate of evidenceGates) {
    assert.match(runbook, new RegExp(gate.id));
    for (const artifact of gate.artifactPaths) {
      assert.match(
        runbook,
        new RegExp(artifact.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );
    }
  }

  assert.match(localAudit, /Hosted Supabase cron/);
  assert.match(localAudit, /Provider integrations/);
  assert.match(localAudit, /Hardware\/OS E2E/);
  assert.match(localAudit, /Rollout tracks/);
});

test("external evidence index mentions every external gate and artifact", () => {
  assert.match(externalEvidenceIndex, /External Evidence Index/);
  assert.match(externalEvidenceIndex, /pnpm completion:gate:external/);
  assert.match(externalEvidenceIndex, /OGL_EXTERNAL_EVIDENCE_GATES=<gate-id>/);
  assert.match(externalEvidenceIndex, /pnpm hosted:deploy-gate:preflight/);
  assert.match(externalEvidenceIndex, /pnpm hosted:deploy-gate:smoke/);
  assert.match(
    externalEvidenceIndex,
    /pnpm hosted:deploy-gate:scheduler-packet/,
  );
  assert.match(
    externalEvidenceIndex,
    /pnpm hosted:cron-evidence:artifact-hints/,
  );
  assert.match(externalEvidenceIndex, /pnpm hosted:deploy-gate:packet/);

  for (const gate of evidenceGates) {
    assert.match(externalEvidenceIndex, new RegExp(gate.id));
    for (const artifact of gate.artifactPaths) {
      assert.match(
        externalEvidenceIndex,
        new RegExp(escapeForRegExp(artifact)),
      );
    }
    assert.match(
      externalEvidenceIndex,
      new RegExp(
        escapeForRegExp(
          `OGL_EXTERNAL_EVIDENCE_GATES=${gate.id} pnpm external:evidence:preflight`,
        ),
      ),
    );
  }
});



test("provider runbook documents non-Steam presence bridge collection inputs", () => {
  const providerRunbook = runbookSection("provider-live-integrations");

  for (const value of [
    "PRESENCE_PROVIDER_TOKEN",
    "EPIC_PRESENCE_ENDPOINT",
    "GOG_PRESENCE_ENDPOINT",
    "EA_PRESENCE_ENDPOINT",
    "XBOX_PRESENCE_ENDPOINT",
    "BATTLENET_PRESENCE_ENDPOINT",
    "UBISOFT_PRESENCE_ENDPOINT",
  ]) {
    assert.match(providerRunbook, new RegExp(escapeForRegExp(value)));
  }
  assert.match(providerRunbook, /non-dry-run live\s+session/);
  assert.match(providerRunbook, /provider bridge run ID/);
});

test("documentation no longer advertises the removed mods product surface", () => {
  assert.doesNotMatch(readme, /scan_mod_directory/);
  assert.doesNotMatch(featurePlan, /scan_mod_directory/);
  assert.doesNotMatch(readme, /Nexus\/CurseForge/);
  assert.doesNotMatch(featurePlan, /Nexus\/CurseForge/);
  assert.doesNotMatch(readme, /run_mod_provider_staging_probe/);
  assert.doesNotMatch(featurePlan, /run_mod_provider_staging_probe/);
  assert.doesNotMatch(readme, /Nexus Mods[\s\S]*Steam Workshop/);
  assert.doesNotMatch(featurePlan, /Nexus Mods[\s\S]*Steam Workshop/);
  for (const document of [readme, featurePlan, prBody, security, changelog, localAudit]) {
    assert.doesNotMatch(document, /no[- ]slug/i);
  }
  assert.doesNotMatch(prBody, /Nexus requires a registered app ID/i);
  assert.doesNotMatch(security, /active surface is limited to the registered Nexus/i);
});

test("runbook documents proof evidence lane identity", () => {
  assert.match(runbook, /Proof evidence values must name the proof lane/);
  assert.match(runbook, /non-steam-presence-bridge-provider/);
  assert.match(runbook, /provider-approved-catalog-cloud-transfer/);
  assert.match(runbook, /achievement-provider-cache-real-client/);
  assert.match(runbook, /fullscreen-anti-cheat-overlay/);
  assert.match(runbook, /community-artwork-rollout/);
  assert.doesNotMatch(runbook, /community-artwork-screenshot-rollout/);
  assert.match(runbook, /plugin-marketplace-execution-update/);
});

test("runbook documents the external evidence next steps mode", () => {
  assert.match(runbook, /pnpm external:evidence:next/);
  assert.match(runbook, /compact\s+non-mutating handoff/);
  assert.match(runbook, /pnpm external:evidence:runbook/);
  assert.match(runbook, /sequenced\s+operator runbook/);
  assert.match(runbook, /20-character lowercase alphanumeric project ref/);
  assert.match(runbook, /SUPABASE_ACCESS_TOKEN[\s\S]{0,80}`sbp_`/);
  assert.match(runbook, /REST auth values must\s+be JWT-shaped/i);
});

test("runbook command list includes hosted cron plan and collector", () => {
  assert.match(runbook, /^pnpm hosted:deploy-gate:plan$/m);
  assert.match(runbook, /^pnpm hosted:deploy-gate:packet$/m);
  assert.match(runbook, /pnpm hosted:deploy-gate:preflight/);
  assert.match(runbook, /pnpm hosted:deploy-gate:smoke/);
  assert.match(
    runbook,
    /^OGL_HOSTED_CRON_EVIDENCE_CHECKS=presence-poll pnpm hosted:cron-evidence:plan$/m,
  );
  assert.match(runbook, /^pnpm hosted:cron-evidence:plan$/m);
  assert.match(runbook, /^pnpm hosted:cron-evidence$/m);
});

test("README documents explicit hosted deploy gate aliases", () => {
  for (const command of [
    "pnpm hosted:deploy-gate:preflight",
    "pnpm hosted:deploy-gate:deploy:dry-run",
    "pnpm hosted:deploy-gate:deploy:live",
    "pnpm hosted:deploy-gate:smoke",
    "pnpm hosted:deploy-gate:all:live",
  ]) {
    assert.match(readme, new RegExp(`^${escapeRegExp(command)}$`, "m"));
  }
  assert.match(readme, /pnpm hosted:deploy-gate:preflight/);
  assert.match(readme, /pnpm hosted:deploy-gate:smoke/);
  assert.doesNotMatch(readme, /hosted deploy preflight\/smoke/);
});

test("verification manifest and guide document the external next handoff", () => {
  const externalSummaryRows = screenshotManifest.screenshots.filter((entry) =>
    /screenshots\/settings-external-completion-evidence-summary-(?:local|mobile)\.png/.test(
      entry.file,
    ),
  );

  assert.equal(externalSummaryRows.length, 2);
  const documentedCommands = [
    "pnpm external:evidence:next",
    "pnpm external:evidence:worklist",
    "pnpm external:evidence:packet",
    "pnpm external:evidence:runbook",
    "pnpm external:evidence:preflight",
    "pnpm completion:gate:status",
    "pnpm completion:gate:external",
  ];
  for (const row of externalSummaryRows) {
    assert.deepEqual(row.routes, ["/settings", "/settings/diagnostics"]);
    assert.deepEqual(row.verify, ["external-completion-evidence-summary"]);
  }
  for (const command of documentedCommands) {
    assert.match(verificationReadme, new RegExp(escapeForRegExp(command)));
  }
});

test("external evidence CLI gates stay in sync with the UI summary and plan boundary", () => {
  const uiGateIds = [...externalSummarySource.matchAll(/id:\s*"([^"]+)"/g)].map(
    ([, id]) => id,
  );
  assert.deepEqual(
    uiGateIds,
    evidenceGates.map((gate) => gate.id),
  );

  for (const gate of evidenceGates) {
    const uiGate = externalSummaryGateBlock(gate.id);
    assert.match(uiGate, new RegExp(escapeForRegExp(`label: "${gate.title}"`)));

    for (const artifact of gate.artifactPaths) {
      assert.match(runbook, new RegExp(escapeForRegExp(artifact)));
      assert.match(uiGate, new RegExp(escapeForRegExp(`"${artifact}"`)));
    }
    for (const envName of gate.requiredEnv) {
      assert.match(runbook, new RegExp(escapeForRegExp(envName)));
      assert.match(uiGate, new RegExp(escapeForRegExp(`"${envName}"`)));
    }
    for (const proof of gate.requiredProofs) {
      const owningArtifact =
        gate.artifactProofs?.find((item) => item.requiredProofs.includes(proof))
          ?.path ?? gate.artifactPaths[0];
      const artifact = readFileSync(
        new URL(`../${owningArtifact}`, import.meta.url),
        "utf8",
      );
      assert.match(artifact, new RegExp(escapeForRegExp(proof)));
      assert.match(uiGate, new RegExp(escapeForRegExp(`"${proof}"`)));
    }
  }

  assert.match(featurePlan, /Hosted Cron/);
  assert.match(featurePlan, /Provider-Live/);
  assert.match(featurePlan, /Hardware\/OS/);
  assert.match(featurePlan, /Rollout/);
});

function escapeForRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function runbookSection(heading) {
  const marker = `## ${heading}`;
  const start = runbook.indexOf(marker);
  assert.notEqual(start, -1, `Runbook section ${heading} not found.`);
  const next = runbook.indexOf("\n## ", start + marker.length);
  return next === -1 ? runbook.slice(start) : runbook.slice(start, next);
}
