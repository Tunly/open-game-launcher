#!/usr/bin/env node
import { pathToFileURL } from "node:url";

import {
  completionStatusReport,
  repoRoot as completionRepoRoot,
} from "./completion-gate.mjs";
import {
  artifactWorklistReport,
  nextStepsReport,
  operatorPacketReport,
  runbookReport,
} from "./external-evidence-check.mjs";
import {
  buildSchedulerPacket,
  hostedDeployGatePacket,
} from "./hosted-deploy-gate.mjs";
import { hostedCronEvidencePacket } from "./hosted-cron-evidence.mjs";
import {
  defaultReleaseTag,
  releaseCandidateReport,
  renderReleaseCandidateReport,
  repoRoot,
} from "./release-candidate-check.mjs";

export function parseArgs(argv) {
  if (argv.length > 1) {
    throw new Error("Usage: pnpm release:evidence:bundle [vX.Y.Z]");
  }
  return { tag: argv[0] };
}

function fenced(language, value) {
  return ["```" + language, value.trimEnd(), "```"].join("\n");
}

function completionSummary(status) {
  const receipt = status.local.latestReceipt;
  return [
    `- Local receipt: ${receipt.valid ? "current" : "missing or stale"}`,
    `- Local receipt path: ${receipt.path ?? "none"}`,
    `- Local receipt commit: ${receipt.gitHead ?? "none"}`,
    `- External artifact evidence: ${status.external.evidence.readyCount}/${status.external.evidence.totalCount}`,
    `- Hosted deploy prereqs: ${status.external.hostedDeploy.ready ? "configured" : "missing"}`,
    `- Hosted cron prereqs: ${status.external.hostedCron.ready ? "configured" : "missing"}`,
    `- Release ready from status mode: ${status.releaseReady}`,
    `- Release boundary command: \`pnpm completion:gate\``,
  ].join("\n");
}

export function releaseEvidenceBundle({
  env = process.env,
  now = new Date(),
  platform = process.platform,
  root = repoRoot,
  tag = defaultReleaseTag(root),
} = {}) {
  const releaseReport = releaseCandidateReport({ root, tag });
  const completionStatus = completionStatusReport({
    env,
    platform,
    root: completionRepoRoot === repoRoot ? root : completionRepoRoot,
  });
  const schedulerPacket = buildSchedulerPacket(undefined, env);
  const cronPacket = hostedCronEvidencePacket([], env, now);

  const sections = [
    "Release evidence operator bundle",
    "",
    `Generated at: ${now.toISOString()}`,
    `Target tag: ${tag}`,
    "",
    "This bundle is redacted and non-mutating. It does not print environment values, run hosted deploys, call hosted functions, read hosted cron rows, write evidence artifacts, check proof rows, or assert external release completion.",
    "",
    "## 1. Release Candidate Preflight",
    "",
    renderReleaseCandidateReport(releaseReport),
    "",
    "## 2. Completion Gate Status Summary",
    "",
    completionSummary(completionStatus),
    "",
    "## 3. External Evidence Next Steps",
    "",
    nextStepsReport(env),
    "",
    "## 4. External Evidence Artifact Worklist",
    "",
    artifactWorklistReport(env),
    "",
    "## 5. External Evidence Operator Packet",
    "",
    operatorPacketReport(env),
    "",
    "## 6. External Evidence Operator Runbook",
    "",
    runbookReport(env),
    "",
    "## 7. Hosted Deploy Gate Operator Packet",
    "",
    hostedDeployGatePacket(env),
    "",
    "## 8. Hosted Scheduler Packet",
    "",
    fenced("json", JSON.stringify(schedulerPacket, null, 2)),
    "",
    "## 9. Hosted Cron Evidence Packet",
    "",
    cronPacket,
    "",
    "## 10. Final Release Boundary",
    "",
    "- Fill the external artifacts with redacted live evidence only.",
    "- Run scoped `pnpm external:evidence:preflight` while preparing each gate.",
    "- Run unscoped `pnpm completion:gate` at the release boundary.",
  ];

  return sections.join("\n").trimEnd();
}

export function main(argv = process.argv.slice(2)) {
  const { tag } = parseArgs(argv);
  console.log(releaseEvidenceBundle({ tag }));
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.exit(main());
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
