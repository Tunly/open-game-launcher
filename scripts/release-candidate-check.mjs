#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { completionStatusReport } from "./completion-gate.mjs";
import {
  releaseVersionFromTag,
  releaseVersionReport,
} from "./release-tag-check.mjs";
import { releaseTrackingReportFromGit } from "./release-tracking-check.mjs";
import { releaseWorkflowReport } from "./release-workflow-check.mjs";

export const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export const changelogRelativePath = "CHANGELOG.md";
export const externalProofHashPolicyContracts = Object.freeze([
  {
    path: "docs/verification/external/README.md",
    requiredText: [
      "Hosted cron receipt SHA256",
      "pnpm completion:gate:external",
    ],
  },
  {
    path: "docs/runbooks/external-completion-evidence.md",
    requiredText: [
      "Hosted cron receipt SHA256",
      "sha256:<64-hex>",
      "Commit SHA",
    ],
  },
]);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compactList(values, limit = 8) {
  const selected = values.slice(0, limit);
  if (values.length > limit) selected.push(`... ${values.length - limit} more`);
  return selected.join(", ");
}

export function defaultReleaseTag(root = repoRoot) {
  return `v${readJson(join(root, "launcher", "package.json")).version}`;
}

export function parseArgs(argv) {
  if (argv.some((arg) => arg.startsWith("-"))) {
    throw new Error("Usage: pnpm release:candidate [v<semver>]");
  }
  if (argv.length > 1) {
    throw new Error("Expected at most one release tag.");
  }
  return { tag: argv[0] };
}

export function changelogVersionSectionReport({
  content,
  path = changelogRelativePath,
  root = repoRoot,
  version,
} = {}) {
  if (!version) {
    return {
      errors: ["release tag version is required before checking CHANGELOG"],
      ok: false,
      path,
      version: null,
    };
  }

  const changelogPath = join(root, path);
  if (content === undefined && !existsSync(changelogPath)) {
    return {
      errors: [`${path} is missing`],
      ok: false,
      path,
      version,
    };
  }

  const changelog = content ?? readFileSync(changelogPath, "utf8");
  const sectionPattern = new RegExp(
    `^## \\[${escapeRegex(version)}\\](?:\\s|$)`,
    "m",
  );
  const ok = sectionPattern.test(changelog);
  return {
    errors: ok ? [] : [`${path} must include ## [${version}]`],
    ok,
    path,
    version,
  };
}

export function externalProofHashPolicyReport({
  contracts = externalProofHashPolicyContracts,
  root = repoRoot,
  readFile = (path) => readFileSync(join(root, path), "utf8"),
} = {}) {
  const errors = [];

  for (const contract of contracts) {
    let content = "";
    try {
      content = readFile(contract.path);
    } catch {
      errors.push(`${contract.path} is missing`);
      continue;
    }

    for (const text of contract.requiredText) {
      if (!content.includes(text)) {
        errors.push(`${contract.path} must mention ${text}`);
      }
    }
  }

  return {
    contracts: contracts.map((contract) => contract.path),
    errors,
    ok: errors.length === 0,
  };
}

export function localGitTagExists(tag, root = repoRoot) {
  const result = spawnSync(
    "git",
    ["show-ref", "--verify", "--quiet", `refs/tags/${tag}`],
    { cwd: root },
  );
  if (result.error) throw result.error;
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error("git show-ref failed while checking local release tags");
}

function trackingErrors(report) {
  if (report.ready) return [];

  const errors = [];
  if (report.missingRequiredPaths?.length) {
    errors.push(
      `missing required paths: ${compactList(report.missingRequiredPaths)}`,
    );
  }
  if (report.missingTrackedFiles?.length) {
    errors.push(
      `required files missing from git: ${compactList(
        report.missingTrackedFiles,
      )}`,
    );
  }
  if (report.emptyTrackedDirectories?.length) {
    errors.push(
      `required directories have no tracked files: ${compactList(
        report.emptyTrackedDirectories,
      )}`,
    );
  }
  if (report.changedRequiredPaths?.length) {
    errors.push(
      `changed release-critical paths: ${compactList(
        report.changedRequiredPaths,
      )}`,
    );
  }
  if (report.untrackedRequiredPaths?.length) {
    errors.push(
      `untracked release-critical paths: ${compactList(
        report.untrackedRequiredPaths,
      )}`,
    );
  }
  return errors.length > 0 ? errors : ["release-critical paths are not clean"];
}

function localReceiptErrors(receipt) {
  if (!receipt?.present) {
    return [`${receipt?.path ?? "local completion receipt"} is missing`];
  }
  if (!receipt.valid) {
    return [
      `${receipt.path} is not current (${receipt.validationReason ?? "invalid"})`,
    ];
  }
  if (!receipt.gitHead || !receipt.currentGitHead) {
    return [`${receipt.path} must include a current git HEAD`];
  }
  if (receipt.gitHead !== receipt.currentGitHead) {
    return [`${receipt.path} does not match current HEAD`];
  }
  if (receipt.command !== "pnpm completion:gate:local") {
    return [`${receipt.path} must be from pnpm completion:gate:local`];
  }
  if (receipt.releaseProof !== false) {
    return [`${receipt.path} must remain local-only releaseProof: false`];
  }
  return [];
}

function tagExistsErrors({ tag, version, exists }) {
  if (!version) return ["release tag is invalid; local tag check skipped"];
  return exists ? [`local tag ${tag} already exists`] : [];
}

function check(id, label, errors, details = {}) {
  return {
    details,
    errors,
    id,
    label,
    ok: errors.length === 0,
  };
}

export function releaseCandidateReport({
  completionStatus,
  env = {},
  externalProofHashPolicy,
  localTagExists = (candidateTag, candidateRoot) =>
    localGitTagExists(candidateTag, candidateRoot),
  platform = process.platform,
  root = repoRoot,
  tag = defaultReleaseTag(root),
  trackingReport,
  workflowReport,
} = {}) {
  const candidateTag = String(tag ?? "").trim();
  const versionReport = releaseVersionReport({ root, tag: candidateTag });
  const version = releaseVersionFromTag(candidateTag);
  const status =
    completionStatus ?? completionStatusReport({ env, platform, root });
  const receipt = status.local?.latestReceipt ?? null;
  const tracking = trackingReport ?? releaseTrackingReportFromGit({ root });
  const workflow = workflowReport ?? releaseWorkflowReport({ root });
  const externalHash =
    externalProofHashPolicy ?? externalProofHashPolicyReport({ root });

  let localTagAlreadyExists = false;
  let localTagCheckErrors = [];
  try {
    localTagAlreadyExists = version
      ? localTagExists(candidateTag, root)
      : false;
    localTagCheckErrors = tagExistsErrors({
      exists: localTagAlreadyExists,
      tag: candidateTag,
      version,
    });
  } catch (error) {
    localTagCheckErrors = [
      error instanceof Error ? error.message : "local tag check failed",
    ];
  }

  const changelog = changelogVersionSectionReport({
    root,
    version,
  });

  const checks = [
    check("tag-version", "Release tag matches package versions", [
      ...versionReport.errors,
    ]),
    check("local-completion-receipt", "Current local completion receipt", [
      ...localReceiptErrors(receipt),
    ]),
    check("local-tag-available", "No existing local release tag", [
      ...localTagCheckErrors,
    ]),
    check("changelog-section", "Versioned CHANGELOG section exists", [
      ...changelog.errors,
    ]),
    check("release-tracking-clean", "Release-critical paths are clean", [
      ...trackingErrors(tracking),
    ]),
    check("release-workflow-policy", "Release workflow policy is detectable", [
      ...workflow.errors,
    ]),
    check(
      "external-proof-hash-policy",
      "External evidence hash policy is documented",
      [...externalHash.errors],
    ),
  ];

  const errors = checks.flatMap((item) =>
    item.errors.map((message) => `${item.id}: ${message}`),
  );

  return {
    checks,
    errors,
    ok: errors.length === 0,
    tag: candidateTag,
    version,
  };
}

export function renderReleaseCandidateReport(report) {
  const lines = [
    "Release candidate preflight",
    "",
    `Tag: ${report.tag || "(missing)"}`,
    `Version: ${report.version ?? "(invalid)"}`,
    `Status: ${report.ok ? "passed" : "failed"}`,
    "",
    "Checks:",
  ];

  for (const item of report.checks) {
    lines.push(`- ${item.ok ? "PASS" : "FAIL"} ${item.label}`);
  }

  if (!report.ok) {
    lines.push("", "Findings:");
    for (const error of report.errors) lines.push(`- ${error}`);
  }

  return lines.join("\n");
}

export function main(argv = process.argv.slice(2)) {
  const { tag } = parseArgs(argv);
  const report = releaseCandidateReport({ tag });
  console.log(renderReleaseCandidateReport(report));
  return report.ok ? 0 : 1;
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
