#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  missingRequiredEnv as missingHostedCronEnv,
  planSummary as hostedCronPlanSummary,
} from "./hosted-cron-evidence.mjs";
import { missingRequiredEnv as missingHostedDeployEnv } from "./hosted-deploy-gate.mjs";
import { statusReport as externalEvidenceStatusReport } from "./external-evidence-check.mjs";

export const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export const localCompletionReceiptRelativePath =
  ".codex/completion-gate-local-latest.json";

export const completionLocalChecks = Object.freeze([
  {
    args: ["diff", "--check", "HEAD"],
    command: "git",
    id: "git-diff-check",
    label: "Git diff whitespace check against HEAD",
  },
  {
    args: ["completion:tracked"],
    command: "pnpm",
    id: "release-tracking-check",
    label: "Release artifact tracking check",
  },
  {
    args: ["--dir", "launcher", "format:check"],
    command: "pnpm",
    id: "frontend-format",
    label: "Frontend format check",
  },
  {
    args: ["--dir", "launcher", "typecheck"],
    command: "pnpm",
    id: "frontend-typecheck",
    label: "Frontend typecheck",
  },
  {
    args: ["--dir", "launcher", "lint"],
    command: "pnpm",
    id: "frontend-lint",
    label: "Frontend lint",
  },
  {
    args: ["--dir", "launcher", "test"],
    command: "pnpm",
    id: "frontend-tests",
    label: "Frontend Vitest suite",
  },
  {
    args: ["--dir", "launcher", "test:cov"],
    command: "pnpm",
    id: "frontend-coverage",
    label: "Frontend coverage run",
  },
  {
    args: ["--dir", "launcher", "build"],
    command: "pnpm",
    id: "frontend-build",
    label: "Frontend build",
  },
  {
    args: ["tauri:debug-bundle:test"],
    command: "pnpm",
    id: "tauri-debug-bundle-test",
    label: "Tauri debug bundle wrapper tests",
  },
  {
    args: ["tauri:debug-bundle"],
    command: "pnpm",
    id: "tauri-debug-bundle",
    label: "Tauri current-platform debug bundle smoke",
  },
  {
    args: ["show", "active-toolchain"],
    command: "rustup",
    id: "rust-active-toolchain",
    label: "Rust active toolchain",
  },
  {
    args: [
      "fmt",
      "--manifest-path",
      "launcher/src-tauri/Cargo.toml",
      "--all",
      "--",
      "--check",
    ],
    command: "cargo",
    id: "rust-format",
    label: "Rust format check",
  },
  {
    args: ["test", "--manifest-path", "launcher/src-tauri/Cargo.toml"],
    command: "cargo",
    id: "rust-tests",
    label: "Rust command tests",
  },
  {
    args: [
      "check",
      "--manifest-path",
      "launcher/src-tauri/Cargo.toml",
      "--lib",
      "--target",
      "x86_64-pc-windows-msvc",
    ],
    command: "cargo",
    id: "rust-windows-check",
    label: "Rust Windows target check",
    platformNote:
      "requires the Windows MSVC toolchain; GitHub Actions runs this on windows-2025",
    platforms: ["win32"],
  },
  {
    args: [
      "clippy",
      "--manifest-path",
      "launcher/src-tauri/Cargo.toml",
      "--lib",
      "--all-targets",
      "--",
      "-D",
      "warnings",
    ],
    command: "cargo",
    id: "rust-clippy-lib",
    label: "Rust lib clippy",
  },
  {
    args: [
      "clippy",
      "--manifest-path",
      "launcher/src-tauri/Cargo.toml",
      "--bins",
      "--",
      "-D",
      "warnings",
    ],
    command: "cargo",
    id: "rust-clippy-bins",
    label: "Rust bin clippy",
  },
  {
    args: ["hosted:deploy-gate:test"],
    command: "pnpm",
    id: "hosted-deploy-gate-test",
    label: "Hosted deploy gate script tests",
  },
  {
    args: ["completion:gate:test"],
    command: "pnpm",
    id: "completion-gate-test",
    label: "Completion gate script tests",
  },
  {
    args: ["release:tag:test"],
    command: "pnpm",
    id: "release-tag-test",
    label: "Release tag script tests",
  },
  {
    args: ["external:evidence:test"],
    command: "pnpm",
    id: "external-evidence-test",
    label: "External evidence script tests",
  },
  {
    args: ["hosted:cron-evidence:test"],
    command: "pnpm",
    id: "hosted-cron-evidence-test",
    label: "Hosted cron evidence script tests",
  },
  {
    args: ["supabase:db:lint:test"],
    command: "pnpm",
    id: "supabase-db-lint-test",
    label: "Supabase DB lint wrapper tests",
  },
  {
    args: ["supabase:db:lint"],
    command: "pnpm",
    id: "supabase-db-lint",
    label: "Supabase migration lint",
  },
  {
    args: ["supabase:functions:runner:test"],
    command: "pnpm",
    id: "supabase-functions-runner-test",
    label: "Supabase functions runner tests",
  },
  {
    args: ["supabase:functions:check"],
    command: "pnpm",
    id: "supabase-functions-check",
    label: "Supabase Edge Function typecheck",
  },
  {
    args: ["verify:ui-evidence:test"],
    command: "pnpm",
    id: "verify-ui-evidence-test",
    label: "UI evidence guard tests",
  },
  {
    args: ["verify:ui-evidence"],
    command: "pnpm",
    id: "verify-ui-evidence",
    label: "UI evidence guard",
  },
  {
    args: ["verify:routes:test"],
    command: "pnpm",
    id: "verify-route-inventory-test",
    label: "Verify route inventory tests",
  },
  {
    args: ["verify:routes"],
    command: "pnpm",
    id: "verify-route-inventory",
    label: "Verify route inventory CLI",
  },
  {
    args: ["supabase:functions:test"],
    command: "pnpm",
    id: "supabase-functions-test",
    label: "Supabase Edge Function contracts",
  },
]);

export const completionExternalChecks = Object.freeze([
  {
    args: ["hosted:deploy-gate", "preflight"],
    command: "pnpm",
    forceAllEvidence: true,
    id: "hosted-deploy-preflight",
    label: "Hosted deploy gate preflight",
  },
  {
    args: ["hosted:deploy-gate", "smoke"],
    command: "pnpm",
    forceAllEvidence: true,
    id: "hosted-deploy-smoke",
    label: "Hosted deploy gate smoke",
  },
  {
    args: ["hosted:cron-evidence"],
    command: "pnpm",
    forceAllEvidence: true,
    id: "hosted-cron-evidence",
    label: "Hosted cron evidence",
  },
  {
    args: ["external:evidence:preflight"],
    command: "pnpm",
    forceAllEvidence: true,
    id: "external-evidence-preflight",
    label: "External completion evidence preflight",
  },
]);

export const releaseBoundaryScopeEnvNames = Object.freeze([
  "OGL_EXTERNAL_EVIDENCE_GATES",
  "OGL_HOSTED_DEPLOY_FUNCTIONS",
  "OGL_HOSTED_CRON_EVIDENCE_CHECKS",
]);

const actions = new Set(["check", "external", "local", "plan", "status"]);

export function parseArgs(argv) {
  const action = argv.find((arg) => !arg.startsWith("-")) ?? "check";
  if (!actions.has(action)) {
    throw new Error(
      'Unknown completion gate action. Use "plan", "status", "local", "external", or "check".',
    );
  }
  return { action };
}

export function checksForAction(action) {
  if (action === "local") return [...completionLocalChecks];
  if (action === "external") return [...completionExternalChecks];
  if (action === "check") {
    return [...completionLocalChecks, ...completionExternalChecks];
  }
  return [];
}

function commandLine(check) {
  return [check.command, ...check.args].join(" ");
}

export function releaseBoundaryEnv(env = process.env) {
  const next = { ...env };
  for (const name of releaseBoundaryScopeEnvNames) {
    delete next[name];
  }
  return next;
}

function envForCheck(check, env) {
  if (!check.forceAllEvidence) return env;
  return releaseBoundaryEnv(env);
}

function checksSummary(checks, platform) {
  return checks.map((check) => ({
    command: commandLine(check),
    id: check.id,
    label: check.label,
    platformNote: check.platformNote ?? null,
    skippedOnThisPlatform: Boolean(
      check.platforms && !check.platforms.includes(platform),
    ),
  }));
}

function platformSkippedChecks(checksSummaryResult) {
  return checksSummaryResult
    .filter((check) => check.skippedOnThisPlatform)
    .map(({ id, label, platformNote }) => ({ id, label, platformNote }));
}

export function localCompletionReceiptPath(root = repoRoot) {
  return join(root, localCompletionReceiptRelativePath);
}

function localCompletionReceiptSummary(root = repoRoot) {
  const path = localCompletionReceiptPath(root);
  if (!existsSync(path)) {
    return {
      path: localCompletionReceiptRelativePath,
      present: false,
      releaseProof: false,
    };
  }

  try {
    const receipt = JSON.parse(readFileSync(path, "utf8"));
    const checkIds = Array.isArray(receipt.checkIds) ? receipt.checkIds : [];
    const skippedOnThisPlatform = Array.isArray(receipt.skippedOnThisPlatform)
      ? receipt.skippedOnThisPlatform
      : [];
    const valid =
      receipt?.version === 1 &&
      receipt.action === "local" &&
      receipt.command === "pnpm completion:gate:local" &&
      receipt.result === "passed" &&
      typeof receipt.recordedAt === "string" &&
      typeof receipt.platform === "string";

    return {
      action: valid ? receipt.action : null,
      checkCount: valid ? checkIds.length : 0,
      command: valid ? receipt.command : null,
      externalEvidenceCollected: false,
      path: localCompletionReceiptRelativePath,
      platform: valid ? receipt.platform : null,
      present: true,
      recordedAt: valid ? receipt.recordedAt : null,
      releaseProof: false,
      result: valid ? receipt.result : "unreadable",
      skippedOnThisPlatformCount: valid ? skippedOnThisPlatform.length : 0,
      valid,
    };
  } catch {
    return {
      externalEvidenceCollected: false,
      path: localCompletionReceiptRelativePath,
      present: true,
      releaseProof: false,
      result: "unreadable",
      valid: false,
    };
  }
}

function writeLocalCompletionReceipt({ platform, root, skippedChecks }) {
  const receipt = {
    action: "local",
    checkIds: completionLocalChecks.map((check) => check.id),
    command: "pnpm completion:gate:local",
    externalEvidenceCollected: false,
    platform,
    recordedAt: new Date().toISOString(),
    releaseProof: false,
    result: "passed",
    skippedOnThisPlatform: skippedChecks.map(({ id, label, platformNote }) => ({
      id,
      label,
      platformNote: platformNote ?? null,
    })),
    version: 1,
  };
  const path = localCompletionReceiptPath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return receipt;
}

export function completionStatusReport({
  env = process.env,
  platform = process.platform,
  root = repoRoot,
} = {}) {
  const externalBoundaryEnv = releaseBoundaryEnv(env);
  const hostedDeployMissingEnv = {
    deploy: missingHostedDeployEnv("deploy", externalBoundaryEnv),
    preflight: missingHostedDeployEnv("preflight", externalBoundaryEnv),
    smoke: missingHostedDeployEnv("smoke", externalBoundaryEnv),
  };
  const hostedCronMissingEnv = missingHostedCronEnv(externalBoundaryEnv);
  const externalEvidence = externalEvidenceStatusReport(externalBoundaryEnv);
  const localChecks = checksSummary(completionLocalChecks, platform);
  const externalChecks = checksSummary(completionExternalChecks, platform);
  const hostedDeployReady = Object.values(hostedDeployMissingEnv).every(
    (missing) => missing.length === 0,
  );
  const hostedCronReady = hostedCronMissingEnv.length === 0;
  const artifactEvidence = {
    missingCount: externalEvidence.missingCount,
    ready: externalEvidence.ready,
    readyCount: externalEvidence.readyCount,
    totalCount: externalEvidence.totalCount,
  };
  const externalStatusPrerequisites = {
    artifactEvidence,
    hostedCron: {
      missingEnv: hostedCronMissingEnv,
      ready: hostedCronReady,
      selectedChecks: hostedCronPlanSummary(externalBoundaryEnv).selectedChecks,
    },
    hostedDeploy: {
      missingEnv: hostedDeployMissingEnv,
      ready: hostedDeployReady,
    },
    ready: artifactEvidence.ready && hostedCronReady && hostedDeployReady,
  };
  const skippedLocalChecks = platformSkippedChecks(localChecks);

  return {
    external: {
      checks: externalChecks,
      command: "pnpm completion:gate:external",
      evaluated: false,
      evidence: artifactEvidence,
      hostedCron: externalStatusPrerequisites.hostedCron,
      hostedDeploy: externalStatusPrerequisites.hostedDeploy,
      liveEvidence: {
        command: "pnpm completion:gate:external",
        evaluated: false,
        ready: null,
        reason:
          "Status mode does not run hosted deploy smoke, hosted cron evidence, or external completion evidence preflight.",
      },
      ready: null,
      readySource: "notEvaluated",
      statusPrerequisites: externalStatusPrerequisites,
    },
    local: {
      checks: localChecks,
      command: "pnpm completion:gate:local",
      deterministic: true,
      evaluated: false,
      latestReceipt: localCompletionReceiptSummary(root),
      ready: null,
      skippedOnThisPlatform: skippedLocalChecks,
      skippedOnThisPlatformCount: skippedLocalChecks.length,
    },
    releaseReady: false,
    releaseReadyReason:
      "Status mode does not execute local checks or collect live evidence; run pnpm completion:gate at the release boundary.",
  };
}

export function renderStatus(
  env = process.env,
  platform = process.platform,
  root = repoRoot,
) {
  return JSON.stringify(completionStatusReport({ env, platform, root }), null, 2);
}

export function renderPlan() {
  const lines = ["Completion gate plan", "", "Local deterministic checks:"];
  for (const check of completionLocalChecks) {
    const platformSuffix = check.platforms
      ? ` (${check.platforms.join(", ")} only)`
      : "";
    lines.push(`- ${check.label}${platformSuffix}: \`${commandLine(check)}\``);
  }
  lines.push("", "External evidence checks:");
  for (const check of completionExternalChecks) {
    lines.push(`- ${check.label}: \`${commandLine(check)}\``);
  }
  lines.push(
    "",
    "`completion:gate:local` uses no live external secrets but requires the deterministic local toolchain and database prerequisites listed above.",
    "`pnpm completion:gate:status` prints a redacted prerequisite/status inventory without running checks; readiness fields stay null and `releaseReady: false` in status mode.",
    "`completion:gate` also runs external evidence checks and must fail until the hosted and external proof artifacts pass preflight.",
  );
  return lines.join("\n");
}

export function run(command, args, { cwd = repoRoot, env = process.env } = {}) {
  return spawnSync(command, args, {
    cwd,
    env,
    stdio: "inherit",
  });
}

function renderSuccessMessage(action, { platform, skippedChecks }) {
  const platformSkipLine =
    skippedChecks.length === 0
      ? ""
      : `\nPlatform-scoped local checks skipped on ${platform}: ${skippedChecks
          .map((check) => check.label)
          .join(", ")}.`;

  if (action === "local") {
    return `\nLocal deterministic completion checks passed for this platform.
External evidence was not checked or collected; this is not a full release gate.${platformSkipLine}`;
  }

  if (action === "external") {
    return `\nExternal completion evidence checks passed: ${completionExternalChecks
      .map((check) => check.label)
      .join(", ")}. Local deterministic checks were not run by this action.`;
  }

  if (skippedChecks.length > 0) {
    return [
      "\nRelease-boundary completion gate passed for this platform: local deterministic checks and external evidence checks passed for the checks available here.",
      " Platform-scoped checks still require their configured CI platform before cross-platform release signoff.",
      platformSkipLine,
    ].join("");
  }

  return "\nRelease-boundary completion gate passed: local deterministic checks and external evidence checks passed.";
}

export function runCompletionGate({
  action = "check",
  env = process.env,
  logger = console,
  platform = process.platform,
  root = repoRoot,
  runCommand = run,
} = {}) {
  if (action === "plan") {
    logger.log(renderPlan());
    return 0;
  }
  if (action === "status") {
    logger.log(renderStatus(env, platform, root));
    return 0;
  }

  const failures = [];
  const skippedChecks = [];
  for (const check of checksForAction(action)) {
    logger.log(`\n== ${check.label} ==`);
    if (check.platforms && !check.platforms.includes(platform)) {
      logger.log(`Skipped on ${platform}: ${check.platformNote}.`);
      skippedChecks.push(check);
      continue;
    }
    const result = runCommand(check.command, check.args, {
      cwd: root,
      env: envForCheck(check, env),
    });
    if (result.error) {
      failures.push(check.label);
      logger.error(`${check.label} failed to start.`);
      continue;
    }
    if ((result.status ?? 1) !== 0) {
      failures.push(check.label);
    }
  }

  if (failures.length > 0) {
    logger.error(`Completion gate failed: ${failures.join(", ")}.`);
    return 1;
  }

  if (action === "local") {
    writeLocalCompletionReceipt({ platform, root, skippedChecks });
  }

  logger.log(renderSuccessMessage(action, { platform, skippedChecks }));
  return 0;
}

export function main(argv = process.argv.slice(2)) {
  const { action } = parseArgs(argv);
  return runCompletionGate({ action });
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
