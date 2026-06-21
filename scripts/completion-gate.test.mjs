import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  checksForAction,
  checkoutFingerprintAlgorithm,
  completionStatusReport,
  completionExternalChecks,
  completionLocalChecks,
  localCompletionReceiptPath,
  parseArgs,
  releaseBoundaryEnv,
  renderStatus,
  runCompletionGate,
} from "./completion-gate.mjs";

const expectedLocalCompletionCheckIds = Object.freeze([
  "git-diff-check",
  "release-tracking-check",
  "frontend-format",
  "frontend-typecheck",
  "frontend-lint",
  "frontend-tests",
  "frontend-coverage",
  "frontend-build",
  "tauri-debug-bundle-test",
  "tauri-debug-bundle",
  "rust-active-toolchain",
  "rust-format",
  "rust-tests",
  "rust-windows-check",
  "rust-clippy-lib",
  "rust-clippy-bins",
  "hosted-deploy-gate-test",
  "completion-gate-test",
  "release-tag-test",
  "release-workflow-test",
  "release-workflow-check",
  "external-evidence-test",
  "hosted-cron-evidence-test",
  "supabase-db-lint-test",
  "supabase-db-lint",
  "supabase-functions-runner-test",
  "supabase-functions-check",
  "verify-ui-evidence-test",
  "verify-ui-evidence",
  "verify-route-inventory-test",
  "verify-route-inventory",
  "supabase-functions-test",
]);

const expectedExternalCompletionCheckIds = Object.freeze([
  "hosted-deploy-preflight",
  "hosted-deploy-smoke",
  "hosted-cron-evidence",
  "external-evidence-preflight",
]);

const projectRef = "awebfvfyqzwapcgixdfj";
const plausibleSupabaseAccessToken =
  "sbp_0123456789abcdef0123456789abcdef01234567";
const plausibleAccountDeletionSecret =
  "account_deletion_0123456789abcdef0123456789";
const plausiblePriceDropSecret = "price_drop_0123456789abcdef0123456789abcdef";

function jwtJsonPart(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function syntheticSupabaseJwt(payload) {
  return [
    jwtJsonPart({ alg: "HS256", typ: "JWT" }),
    jwtJsonPart({
      exp: 2_082_758_400,
      iat: 1_780_000_000,
      iss: "supabase",
      ref: projectRef,
      ...payload,
    }),
    Buffer.from("synthetic-completion-gate-signature").toString("base64url"),
  ].join(".");
}

const serviceRoleJwt = syntheticSupabaseJwt({ role: "service_role" });

const requiredLocalCompletionCheckIds = Object.freeze([
  "release-tracking-check",
  "frontend-coverage",
  "tauri-debug-bundle",
  "rust-active-toolchain",
  "release-workflow-check",
  "supabase-db-lint-test",
  "supabase-db-lint",
  "supabase-functions-check",
  "rust-windows-check",
]);

const ciWorkflow = readFileSync(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);
const rustToolchainToml = readFileSync(
  new URL("../rust-toolchain.toml", import.meta.url),
  "utf8",
);
const cargoToml = readFileSync(
  new URL("../launcher/src-tauri/Cargo.toml", import.meta.url),
  "utf8",
);
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

const expectedCiActionRefs = Object.freeze({
  "Swatinem/rust-cache": {
    label: "v2",
    ref: "42dc69e1aa15d09112580998cf2ef0119e2e91ae",
  },
  "actions/checkout": {
    label: "v6",
    ref: "df4cb1c069e1874edd31b4311f1884172cec0e10",
  },
  "actions/download-artifact": {
    label: "v4",
    ref: "d3f86a106a0bac45b974a628896c90dbdf5c8093",
  },
  "actions/setup-node": {
    label: "v6",
    ref: "48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e",
  },
  "actions/upload-artifact": {
    label: "v4",
    ref: "ea165f8d65b6e75b540449e92b4886f43607fa02",
  },
  "denoland/setup-deno": {
    label: "v2",
    ref: "667a34cdef165d8d2b2e98dde39547c9daac7282",
  },
  "dtolnay/rust-toolchain": {
    label: "1.95.0",
    ref: "e081816240890017053eacbb1bdf337761dc5582",
  },
  "pnpm/action-setup": {
    label: "v6",
    ref: "b0f76dfb45f55f8421693e4803ac7bb65143bd34",
  },
  "softprops/action-gh-release": {
    label: "v2",
    ref: "3bb12739c298aeb8a4eeaf626c5b8d85266b0e65",
  },
  "supabase/setup-cli": {
    label: "v1",
    ref: "ab058987d8d6c725971f6cf9d0b5c98467e30bd1",
  },
});

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ciJobBlock(jobId) {
  const escapedJobId = escapeRegex(jobId);
  const jobHeader = ciWorkflow.match(new RegExp(`^  ${escapedJobId}:\\n`, "m"));
  assert.ok(jobHeader?.index !== undefined, `Expected CI job ${jobId}.`);

  const start = jobHeader.index;
  const afterHeaderStart = start + jobHeader[0].length;
  const afterHeader = ciWorkflow.slice(afterHeaderStart);
  const nextJobOffset = afterHeader.search(/^  [A-Za-z0-9_-]+:\n/m);
  const end =
    nextJobOffset === -1 ? ciWorkflow.length : afterHeaderStart + nextJobOffset;
  return ciWorkflow.slice(start, end);
}

function ciJobPropertyBlock(jobId, propertyName) {
  const jobBlock = ciJobBlock(jobId);
  const escapedPropertyName = escapeRegex(propertyName);
  const propertyHeader = jobBlock.match(
    new RegExp(`^    ${escapedPropertyName}:.*\\n`, "m"),
  );
  assert.ok(
    propertyHeader?.index !== undefined,
    `Expected CI job ${jobId} to define ${propertyName}.`,
  );

  const start = propertyHeader.index;
  const afterHeaderStart = start + propertyHeader[0].length;
  const afterHeader = jobBlock.slice(afterHeaderStart);
  const nextPropertyOffset = afterHeader.search(/^    [A-Za-z0-9_-]+:/m);
  const end =
    nextPropertyOffset === -1
      ? jobBlock.length
      : afterHeaderStart + nextPropertyOffset;
  return jobBlock.slice(start, end);
}

function readmeSection(heading) {
  const header = `## ${heading}\n`;
  const start = readme.indexOf(header);
  assert.notEqual(start, -1, `Expected README to include ${header.trim()}.`);

  const bodyStart = start + header.length;
  const body = readme.slice(bodyStart);
  const nextHeadingOffset = body.search(/^## /m);
  return nextHeadingOffset === -1 ? body : body.slice(0, nextHeadingOffset);
}

function captureLogger() {
  const logs = [];
  const errors = [];
  return {
    errors,
    logger: {
      error(message) {
        errors.push(message);
      },
      log(message = "") {
        logs.push(message);
      },
    },
    logs,
  };
}

function runGit(root, args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `git ${args.join(" ")} failed: ${result.stderr}`,
  );
  return result.stdout.trim();
}

function initializeGitRepo(root) {
  runGit(root, ["init"]);
  runGit(root, ["config", "user.email", "completion@example.invalid"]);
  runGit(root, ["config", "user.name", "Completion Gate Test"]);
  writeFileSync(join(root, ".gitignore"), ".codex/\n", "utf8");
  writeFileSync(join(root, "tracked.txt"), "initial\n", "utf8");
  runGit(root, ["add", ".gitignore", "tracked.txt"]);
  runGit(root, ["commit", "-m", "initial"]);
}

function commandLine(check) {
  return [check.command, ...check.args].join(" ");
}

function findCheckById(checks, id, laneName) {
  const check = checks.find((candidate) => candidate.id === id);
  assert.ok(check, `Expected ${laneName} completion checks to include ${id}.`);
  return check;
}

test("parseArgs defaults to the full check and accepts scoped actions", () => {
  assert.deepEqual(parseArgs([]), { action: "check" });
  assert.deepEqual(parseArgs(["plan"]), { action: "plan" });
  assert.deepEqual(parseArgs(["status"]), { action: "status" });
  assert.deepEqual(parseArgs(["local"]), { action: "local" });
  assert.deepEqual(parseArgs(["external"]), { action: "external" });
  assert.deepEqual(parseArgs(["check"]), { action: "check" });
  assert.throws(
    () => parseArgs(["sk_live_should_not_echo_123456"]),
    (error) => {
      assert.match(error.message, /Unknown completion gate action/);
      assert.equal(error.message.includes("sk_live_should_not_echo"), false);
      return true;
    },
  );
});

test("checksForAction separates local and external completion lanes", () => {
  assert.deepEqual(
    completionLocalChecks.map((check) => check.id),
    expectedLocalCompletionCheckIds,
  );
  assert.deepEqual(
    completionExternalChecks.map((check) => check.id),
    expectedExternalCompletionCheckIds,
  );
  assert.deepEqual(
    checksForAction("local").map((check) => check.id),
    expectedLocalCompletionCheckIds,
  );
  assert.deepEqual(
    checksForAction("external").map((check) => check.id),
    expectedExternalCompletionCheckIds,
  );
  assert.deepEqual(
    checksForAction("check").map((check) => check.id),
    [...expectedLocalCompletionCheckIds, ...expectedExternalCompletionCheckIds],
  );
});

test("README Checks documents the release-boundary completion gate", () => {
  const checksSection = readmeSection("Checks");
  const commandBlock = checksSection.match(/```bash\n(?<commands>[\s\S]*?)```/);
  assert.ok(
    commandBlock?.groups?.commands,
    "Expected README Checks to include a bash command block.",
  );

  assert.match(commandBlock.groups.commands, /^pnpm completion:gate$/m);
  assert.match(
    checksSection,
    /`pnpm completion:gate`[\s\S]*expected to fail until[\s\S]*external/i,
  );
});

test("local lane includes coverage, Tauri bundle smoke, Supabase DB lint, and Windows Rust checks before external checks", () => {
  const fullCheckIds = checksForAction("check").map((check) => check.id);
  const externalCheckIds = new Set(
    completionExternalChecks.map((check) => check.id),
  );
  const firstExternalCheckIndex = fullCheckIds.findIndex((id) =>
    externalCheckIds.has(id),
  );

  assert.ok(
    firstExternalCheckIndex > -1,
    "Expected the full check action to include external checks.",
  );

  for (const id of requiredLocalCompletionCheckIds) {
    findCheckById(completionLocalChecks, id, "local");
    assert.equal(
      completionExternalChecks.some((check) => check.id === id),
      false,
      `Expected ${id} to stay out of external completion checks.`,
    );

    const fullCheckIndex = fullCheckIds.indexOf(id);
    assert.ok(
      fullCheckIndex > -1,
      `Expected the full check action to include ${id}.`,
    );
    assert.ok(
      fullCheckIndex < firstExternalCheckIndex,
      `Expected ${id} to run before external completion checks.`,
    );
  }

  const supabaseDbLint = commandLine(
    findCheckById(completionLocalChecks, "supabase-db-lint", "local"),
  );
  assert.match(
    supabaseDbLint,
    /(?:\bsupabase\b|supabase:).*db(?::|\b).*lint\b/,
  );
  assert.match(
    ciWorkflow,
    /run: supabase db lint --workdir \. --local --fail-on error/,
  );
  const supabaseDbLintTest = commandLine(
    findCheckById(completionLocalChecks, "supabase-db-lint-test", "local"),
  );
  assert.equal(supabaseDbLintTest, "pnpm supabase:db:lint:test");
  assert.match(
    ciWorkflow,
    /run: node --test scripts\/supabase-db-lint\.test\.mjs/,
  );
  const releaseTrackingCheck = commandLine(
    findCheckById(completionLocalChecks, "release-tracking-check", "local"),
  );
  assert.equal(releaseTrackingCheck, "pnpm completion:tracked");
  assert.match(
    ciWorkflow,
    /run: node --test scripts\/release-tracking-check\.test\.mjs/,
  );
  const releaseWorkflowTest = commandLine(
    findCheckById(completionLocalChecks, "release-workflow-test", "local"),
  );
  assert.equal(releaseWorkflowTest, "pnpm release:workflow:test");
  assert.match(
    ciWorkflow,
    /run: node --test scripts\/release-workflow-check\.test\.mjs/,
  );
  const releaseWorkflowCheck = commandLine(
    findCheckById(completionLocalChecks, "release-workflow-check", "local"),
  );
  assert.equal(releaseWorkflowCheck, "pnpm release:workflow");

  const supabaseFunctionsCheck = commandLine(
    findCheckById(completionLocalChecks, "supabase-functions-check", "local"),
  );
  assert.match(supabaseFunctionsCheck, /pnpm supabase:functions:check/);
  assert.match(ciWorkflow, /run: pnpm supabase:functions:check/);

  const frontendCoverage = commandLine(
    findCheckById(completionLocalChecks, "frontend-coverage", "local"),
  );
  assert.equal(frontendCoverage, "pnpm --dir launcher test:cov");
  assert.match(ciWorkflow, /run: pnpm test:cov/);

  const tauriDebugBundle = commandLine(
    findCheckById(completionLocalChecks, "tauri-debug-bundle", "local"),
  );
  assert.equal(tauriDebugBundle, "pnpm tauri:debug-bundle");
  assert.match(
    ciWorkflow,
    /run: pnpm tauri build --target \$\{\{ matrix\.target \}\}/,
  );

  const tauriDebugBundleTest = commandLine(
    findCheckById(completionLocalChecks, "tauri-debug-bundle-test", "local"),
  );
  assert.equal(tauriDebugBundleTest, "pnpm tauri:debug-bundle:test");

  const rustWindowsCheck = commandLine(
    findCheckById(completionLocalChecks, "rust-windows-check", "local"),
  );
  assert.match(rustWindowsCheck, /\bcargo\b.*\bcheck\b/);
  assert.match(rustWindowsCheck, /launcher\/src-tauri\/Cargo\.toml/);
  assert.match(rustWindowsCheck, /x86_64-pc-windows-msvc/);

  const rustActiveToolchain = commandLine(
    findCheckById(completionLocalChecks, "rust-active-toolchain", "local"),
  );
  assert.equal(rustActiveToolchain, "rustup show active-toolchain");
});

test("Rust toolchain is pinned consistently across local metadata and CI", () => {
  const channel = rustToolchainToml.match(/^channel\s*=\s*"([^"]+)"/m)?.[1];
  assert.equal(channel, "1.95.0");
  assert.match(rustToolchainToml, /^profile\s*=\s*"minimal"/m);
  assert.match(rustToolchainToml, /^components\s*=\s*\["rustfmt", "clippy"\]/m);
  assert.doesNotMatch(ciWorkflow, /dtolnay\/rust-toolchain@stable/);
  assert.doesNotMatch(
    ciWorkflow,
    /\bruns-on:\s+(?:ubuntu|windows|macos)-latest\b/,
  );
  assert.doesNotMatch(ciWorkflow, /\bos:\s+(?:ubuntu|windows|macos)-latest\b/);
  assert.match(ciWorkflow, /\bruns-on:\s+ubuntu-24\.04\b/);
  assert.match(ciWorkflow, /\bruns-on:\s+windows-2025\b/);
  assert.match(ciWorkflow, /\bos:\s+macos-15\b/);

  const actionUses = [
    ...ciWorkflow.matchAll(/uses:\s+([^@\s#]+)@([0-9a-f]{40})\s+#\s+([^\n]+)/g),
  ];
  const allUsesCount = [...ciWorkflow.matchAll(/uses:\s+/g)].length;
  assert.equal(actionUses.length, allUsesCount);

  for (const [, action, ref, label] of actionUses) {
    assert.deepEqual(
      { label, ref },
      expectedCiActionRefs[action],
      `Expected ${action} to stay pinned to its verified ref.`,
    );
  }

  const ciToolchainRefs = [
    ...ciWorkflow.matchAll(
      /uses:\s+dtolnay\/rust-toolchain@([0-9a-f]{40})\s+#\s+([^\n]+)/g,
    ),
  ].map((match) => match[2]);
  assert.equal(ciToolchainRefs.length, 5);
  assert.deepEqual([...new Set(ciToolchainRefs)], [channel]);
  const rustBuildWindowsJob = ciJobBlock("rust-build-windows");
  assert.match(rustBuildWindowsJob, /^    runs-on:\s+windows-2025$/m);
  assert.match(
    rustBuildWindowsJob,
    /^        run: cargo check --lib --target x86_64-pc-windows-msvc$/m,
  );

  const buildUploadJob = ciJobBlock("build-upload");
  assert.match(buildUploadJob, /^    strategy:$/m);
  assert.match(
    ciJobPropertyBlock("build-upload", "needs"),
    /^        rust-build-windows,$/m,
  );

  const hostedDeployGateJob = ciJobBlock("hosted-deploy-gate");
  assert.match(hostedDeployGateJob, /^    steps:$/m);
  assert.match(
    ciJobPropertyBlock("hosted-deploy-gate", "needs"),
    /^        rust-build-windows,$/m,
  );

  const cargoRustVersion = cargoToml.match(
    /^rust-version\s*=\s*"([^"]+)"/m,
  )?.[1];
  assert.equal(cargoRustVersion, "1.95");
  assert.equal(channel.split(".").slice(0, 2).join("."), cargoRustVersion);
});

test("plan prints every gate command without running commands", () => {
  const { logger, logs } = captureLogger();
  const status = runCompletionGate({
    action: "plan",
    logger,
    runCommand() {
      throw new Error("plan must not execute commands");
    },
  });

  assert.equal(status, 0);
  const output = logs.join("\n");
  assert.match(output, /Completion gate plan/);
  assert.match(output, /git diff --check HEAD/);
  assert.match(output, /pnpm --dir launcher typecheck/);
  assert.match(output, /pnpm --dir launcher test:cov/);
  assert.match(output, /pnpm tauri:debug-bundle/);
  assert.match(
    output,
    /cargo test --manifest-path launcher\/src-tauri\/Cargo\.toml/,
  );
  assert.match(output, /rustup show active-toolchain/);
  assert.match(output, /pnpm supabase:functions:check/);
  assert.match(output, /pnpm verify:routes/);
  assert.match(output, /pnpm hosted:deploy-gate preflight/);
  assert.match(output, /pnpm hosted:deploy-gate smoke/);
  assert.match(output, /pnpm external:evidence:preflight/);
  assert.match(output, /pnpm completion:gate:status/);
  assert.match(output, /redacted prerequisite\/status inventory/);
  assert.match(output, /readiness fields stay null and `releaseReady: false`/);
  assert.doesNotMatch(output, /redacted JSON readiness summary/);

  const localSectionIndex = output.indexOf("Local deterministic checks:");
  const externalSectionIndex = output.indexOf("External evidence checks:");
  assert.ok(localSectionIndex > -1);
  assert.ok(externalSectionIndex > localSectionIndex);

  for (const id of requiredLocalCompletionCheckIds) {
    const check = findCheckById(completionLocalChecks, id, "local");
    const commandIndex = output.indexOf(`\`${commandLine(check)}\``);

    assert.ok(
      commandIndex > localSectionIndex,
      `Expected plan to print ${id}.`,
    );
    assert.ok(
      commandIndex < externalSectionIndex,
      `Expected plan to print ${id} before external checks.`,
    );
  }
});

test("status report summarizes readiness without running commands or leaking env values", () => {
  const env = {
    ACCOUNT_DELETION_PROCESSOR_SECRET: plausibleAccountDeletionSecret,
    PRICE_DROP_NOTIFY_SECRET: plausiblePriceDropSecret,
    SUPABASE_ACCESS_TOKEN: plausibleSupabaseAccessToken,
    SUPABASE_PROJECT_REF: projectRef,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleJwt,
    SUPABASE_URL: `https://${projectRef}.supabase.co`,
  };
  const report = completionStatusReport({ env, platform: "linux" });

  assert.equal(report.local.command, "pnpm completion:gate:local");
  assert.equal(report.local.deterministic, true);
  assert.equal(report.local.evaluated, false);
  assert.equal(report.local.ready, null);
  assert.equal(
    report.local.checks.some(
      (check) =>
        check.id === "rust-windows-check" && check.skippedOnThisPlatform,
    ),
    true,
  );
  assert.deepEqual(report.local.skippedOnThisPlatform, [
    {
      id: "rust-windows-check",
      label: "Rust Windows target check",
      platformNote:
        "requires the Windows MSVC toolchain; GitHub Actions runs this on windows-2025",
    },
  ]);
  assert.equal(report.local.skippedOnThisPlatformCount, 1);
  assert.equal(report.external.command, "pnpm completion:gate:external");
  assert.equal(report.external.evaluated, false);
  assert.equal(report.external.ready, null);
  assert.equal(report.external.readySource, "notEvaluated");
  assert.equal(report.external.liveEvidence.evaluated, false);
  assert.equal(report.external.liveEvidence.ready, null);
  assert.match(
    report.external.liveEvidence.reason,
    /does not run hosted deploy smoke/,
  );
  assert.equal(report.external.hostedDeploy.missingEnv.preflight.length, 1);
  assert.equal(report.external.hostedDeploy.missingEnv.smoke.length, 1);
  assert.deepEqual(report.external.hostedDeploy.missingEnv.preflight, [
    "PRESENCE_POLL_SECRET",
  ]);
  assert.deepEqual(report.external.hostedDeploy.missingEnv.smoke, [
    "PRESENCE_POLL_SECRET",
  ]);
  assert.deepEqual(report.external.hostedCron.missingEnv, []);
  assert.deepEqual(report.external.hostedCron.selectedChecks, [
    "price-drop",
    "presence-poll",
    "account-deletion",
  ]);
  assert.equal(report.external.evidence.ready, false);
  assert.deepEqual(
    report.external.statusPrerequisites.artifactEvidence,
    report.external.evidence,
  );
  assert.deepEqual(
    report.external.statusPrerequisites.hostedDeploy,
    report.external.hostedDeploy,
  );
  assert.deepEqual(
    report.external.statusPrerequisites.hostedCron,
    report.external.hostedCron,
  );
  assert.equal(report.external.statusPrerequisites.ready, false);
  assert.equal(report.releaseReady, false);
  assert.match(report.releaseReadyReason, /does not execute local checks/);

  const output = renderStatus(env, "linux");
  assert.match(output, /"hostedDeploy"/);
  assert.match(output, /"statusPrerequisites"/);
  assert.match(output, /"liveEvidence"/);
  assert.match(output, /"evaluated": false/);
  assert.match(output, /"PRESENCE_POLL_SECRET"/);
  for (const value of Object.values(env)) {
    assert.equal(output.includes(value), false);
  }
});

test("status action prints JSON without executing completion checks", () => {
  const { logger, logs } = captureLogger();
  const status = runCompletionGate({
    action: "status",
    env: {},
    logger,
    platform: "linux",
    runCommand() {
      throw new Error("status must not execute commands");
    },
  });

  assert.equal(status, 0);
  const parsed = JSON.parse(logs.join("\n"));
  assert.equal(parsed.releaseReady, false);
  assert.equal(parsed.local.command, "pnpm completion:gate:local");
  assert.equal(parsed.local.evaluated, false);
  assert.equal(parsed.local.ready, null);
  assert.equal(parsed.external.liveEvidence.evaluated, false);
  assert.equal(parsed.external.liveEvidence.ready, null);
  assert.equal(parsed.external.ready, null);
  assert.equal(parsed.external.readySource, "notEvaluated");
  assert.ok(Array.isArray(parsed.external.hostedCron.missingEnv));
  assert.ok(Array.isArray(parsed.external.hostedDeploy.missingEnv.preflight));
});

test("local action writes a local-only completion receipt without release-proof semantics", () => {
  const root = mkdtempSync(join(tmpdir(), "ogl-completion-gate-"));
  try {
    const { logger } = captureLogger();
    const executedCommands = [];
    const status = runCompletionGate({
      action: "local",
      logger,
      platform: "linux",
      root,
      runCommand(command, args) {
        executedCommands.push([command, ...args].join(" "));
        return { status: 0 };
      },
    });

    assert.equal(status, 0);
    const windowsCheck = findCheckById(
      completionLocalChecks,
      "rust-windows-check",
      "local",
    );
    assert.equal(executedCommands.includes(commandLine(windowsCheck)), false);
    assert.equal(executedCommands.length, completionLocalChecks.length - 1);

    const receiptPath = localCompletionReceiptPath(root);
    assert.equal(existsSync(receiptPath), true);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    assert.equal(receipt.action, "local");
    assert.equal(receipt.command, "pnpm completion:gate:local");
    assert.equal(receipt.result, "passed");
    assert.equal(receipt.releaseProof, false);
    assert.equal(receipt.externalEvidenceCollected, false);
    assert.equal(receipt.checkIds.length, completionLocalChecks.length);
    assert.deepEqual(receipt.skippedOnThisPlatform, [
      {
        id: "rust-windows-check",
        label: "Rust Windows target check",
        platformNote:
          "requires the Windows MSVC toolchain; GitHub Actions runs this on windows-2025",
      },
    ]);

    const report = completionStatusReport({ env: {}, platform: "linux", root });
    assert.equal(report.local.evaluated, false);
    assert.equal(report.local.ready, null);
    assert.equal(report.local.latestReceipt.present, true);
    assert.equal(report.local.latestReceipt.valid, true);
    assert.equal(report.local.latestReceipt.validationReason, "current");
    assert.equal(report.local.latestReceipt.checkIdsCurrent, true);
    assert.equal(report.local.latestReceipt.checkoutCurrent, true);
    assert.equal(report.local.latestReceipt.checkoutSnapshotAvailable, false);
    assert.equal(
      report.local.latestReceipt.checkoutFingerprintAlgorithm,
      checkoutFingerprintAlgorithm,
    );
    assert.equal(report.local.latestReceipt.releaseProof, false);
    assert.equal(report.local.latestReceipt.externalEvidenceCollected, false);
    assert.equal(
      report.local.latestReceipt.checkCount,
      completionLocalChecks.length,
    );
    assert.equal(
      report.local.latestReceipt.expectedCheckCount,
      completionLocalChecks.length,
    );
    assert.equal(report.releaseReady, false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("status report marks local receipts stale after tracked checkout changes", () => {
  const root = mkdtempSync(join(tmpdir(), "ogl-completion-gate-git-"));
  try {
    initializeGitRepo(root);
    const { logger } = captureLogger();
    const status = runCompletionGate({
      action: "local",
      logger,
      platform: "linux",
      root,
      runCommand() {
        return { status: 0 };
      },
    });
    assert.equal(status, 0);

    const currentReport = completionStatusReport({
      env: {},
      platform: "linux",
      root,
    });
    assert.equal(currentReport.local.latestReceipt.valid, true);
    assert.equal(currentReport.local.latestReceipt.checkoutCurrent, true);
    assert.equal(
      currentReport.local.latestReceipt.checkoutSnapshotAvailable,
      true,
    );
    assert.equal(
      currentReport.local.latestReceipt.checkoutFingerprintAlgorithm,
      checkoutFingerprintAlgorithm,
    );
    assert.match(currentReport.local.latestReceipt.gitHead, /^[a-f0-9]{40}$/);
    assert.equal(
      currentReport.local.latestReceipt.gitHead,
      currentReport.local.latestReceipt.currentGitHead,
    );

    writeFileSync(join(root, "tracked.txt"), "changed\n", "utf8");
    const dirtyReport = completionStatusReport({
      env: {},
      platform: "linux",
      root,
    });

    assert.equal(dirtyReport.local.latestReceipt.valid, false);
    assert.equal(
      dirtyReport.local.latestReceipt.validationReason,
      "stale_checkout",
    );
    assert.equal(dirtyReport.local.latestReceipt.checkoutCurrent, false);
    assert.equal(dirtyReport.local.latestReceipt.checkIdsCurrent, true);
    assert.equal(dirtyReport.local.latestReceipt.releaseProof, false);
    assert.equal(dirtyReport.local.ready, null);
    assert.equal(dirtyReport.releaseReady, false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("status report marks local receipts stale after new commits", () => {
  const root = mkdtempSync(join(tmpdir(), "ogl-completion-gate-git-"));
  try {
    initializeGitRepo(root);
    const { logger } = captureLogger();
    const status = runCompletionGate({
      action: "local",
      logger,
      platform: "linux",
      root,
      runCommand() {
        return { status: 0 };
      },
    });
    assert.equal(status, 0);

    writeFileSync(join(root, "tracked.txt"), "committed change\n", "utf8");
    runGit(root, ["add", "tracked.txt"]);
    runGit(root, ["commit", "-m", "change tracked"]);

    const report = completionStatusReport({ env: {}, platform: "linux", root });

    assert.equal(report.local.latestReceipt.valid, false);
    assert.equal(report.local.latestReceipt.validationReason, "stale_checkout");
    assert.equal(report.local.latestReceipt.checkoutCurrent, false);
    assert.notEqual(
      report.local.latestReceipt.gitHead,
      report.local.latestReceipt.currentGitHead,
    );
    assert.equal(report.local.latestReceipt.releaseProof, false);
    assert.equal(report.releaseReady, false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("status report marks local receipts stale after untracked files", () => {
  const root = mkdtempSync(join(tmpdir(), "ogl-completion-gate-git-"));
  try {
    initializeGitRepo(root);
    const { logger } = captureLogger();
    const status = runCompletionGate({
      action: "local",
      logger,
      platform: "linux",
      root,
      runCommand() {
        return { status: 0 };
      },
    });
    assert.equal(status, 0);

    writeFileSync(join(root, "operator-proof.log"), "local proof\n", "utf8");
    const report = completionStatusReport({ env: {}, platform: "linux", root });

    assert.equal(report.local.latestReceipt.valid, false);
    assert.equal(report.local.latestReceipt.validationReason, "stale_checkout");
    assert.equal(report.local.latestReceipt.checkoutCurrent, false);
    assert.equal(report.local.latestReceipt.checkIdsCurrent, true);
    assert.equal(report.local.latestReceipt.releaseProof, false);
    assert.equal(report.releaseReady, false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("status report marks stale local receipts when local check ids changed", () => {
  const root = mkdtempSync(join(tmpdir(), "ogl-completion-gate-"));
  try {
    const { logger } = captureLogger();
    const status = runCompletionGate({
      action: "local",
      logger,
      platform: "linux",
      root,
      runCommand() {
        return { status: 0 };
      },
    });
    assert.equal(status, 0);

    const receiptPath = localCompletionReceiptPath(root);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    receipt.checkIds = receipt.checkIds.slice(0, -1);
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

    const report = completionStatusReport({ env: {}, platform: "linux", root });

    assert.equal(report.local.latestReceipt.present, true);
    assert.equal(report.local.latestReceipt.valid, false);
    assert.equal(
      report.local.latestReceipt.validationReason,
      "stale_check_ids",
    );
    assert.equal(report.local.latestReceipt.checkIdsCurrent, false);
    assert.equal(
      report.local.latestReceipt.checkCount,
      completionLocalChecks.length - 1,
    );
    assert.equal(
      report.local.latestReceipt.expectedCheckCount,
      completionLocalChecks.length,
    );
    assert.equal(report.local.latestReceipt.releaseProof, false);
    assert.equal(report.local.ready, null);
    assert.equal(report.releaseReady, false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("status report ignores scoped evidence env at the release boundary", () => {
  const report = completionStatusReport({
    env: {
      OGL_EXTERNAL_EVIDENCE_GATES: "hardware-os-e2e",
      OGL_HOSTED_CRON_EVIDENCE_CHECKS: "price-drop",
    },
    platform: "linux",
  });

  assert.equal(report.external.evidence.totalCount, 5);
  assert.equal(report.external.evidence.readyCount, 0);
  assert.deepEqual(report.external.hostedCron.selectedChecks, [
    "price-drop",
    "presence-poll",
    "account-deletion",
  ]);
});

test("CI smoke covers the redacted completion status handoff", () => {
  const smokeStep = ciWorkflow.match(
    /- name: Smoke external evidence helper output\s+run: \|\n(?<body>(?:\s{10}.+\n?)+)/,
  )?.groups?.body;

  assert.ok(
    smokeStep,
    "Expected CI workflow to include the external smoke step.",
  );
  assert.match(smokeStep, /node scripts\/completion-gate\.mjs plan/);
  assert.match(smokeStep, /node scripts\/completion-gate\.mjs status/);
  assert.match(smokeStep, /node scripts\/release-tracking-check\.mjs/);
  assert.ok(
    smokeStep.indexOf("node scripts/completion-gate.mjs status") >
      smokeStep.indexOf("node scripts/completion-gate.mjs plan"),
    "Expected status smoke to run after the static completion gate plan.",
  );
});

test("CI smoke parses completion status JSON without requiring external proof", () => {
  const smokeStep = ciWorkflow.match(
    /- name: Smoke external evidence helper output\s+run: \|\n(?<body>(?:\s{10}.+\n?)+)/,
  )?.groups?.body;

  assert.ok(
    smokeStep,
    "Expected CI workflow to include the external smoke step.",
  );
  assert.match(
    smokeStep,
    /node scripts\/completion-gate\.mjs status \| tee completion-gate-status\.json/,
  );
  assert.match(
    smokeStep,
    /JSON\.parse\(fs\.readFileSync\('completion-gate-status\.json', 'utf8'\)\)/,
  );
  assert.match(smokeStep, /status\.releaseReady !== false/);
  assert.doesNotMatch(smokeStep, /completion:gate:external/);
});

test("release tags require external evidence gate before draft artifacts", () => {
  const releaseGateJob = ciJobBlock("release-boundary-gate");
  const releaseGateNeeds = ciJobPropertyBlock("release-boundary-gate", "needs");
  const buildUploadJob = ciJobBlock("build-upload");
  const buildUploadNeeds = ciJobPropertyBlock("build-upload", "needs");
  const createDraftReleaseJob = ciJobBlock("create-draft-release");

  assert.match(
    releaseGateJob,
    /^    if: startsWith\(github\.ref, 'refs\/tags\/v'\)$/m,
  );
  assert.match(releaseGateJob, /^    environment: hosted-production$/m);
  assert.match(
    releaseGateJob,
    /actions\/checkout@[0-9a-f]{40} # v6\n        with:\n          fetch-depth: 0/,
  );
  assert.ok(
    releaseGateJob.indexOf(
      'run: node scripts/release-tag-check.mjs "$GITHUB_REF_NAME"',
    ) < releaseGateJob.indexOf("run: pnpm completion:gate:external"),
    "Expected release tag validation before the external release gate.",
  );
  assert.match(
    releaseGateJob,
    /run: node scripts\/release-tag-check\.mjs "\$GITHUB_REF_NAME"/,
  );
  assert.match(releaseGateJob, /git fetch --no-tags origin main/);
  assert.match(releaseGateJob, /HEAD_SHA="\$\(git rev-parse HEAD\)"/);
  assert.match(releaseGateJob, /MAIN_SHA="\$\(git rev-parse origin\/main\)"/);
  assert.match(
    releaseGateJob,
    /release tags must point at the current origin\/main commit/,
  );
  assert.doesNotMatch(
    releaseGateJob,
    /git merge-base --is-ancestor HEAD origin\/main/,
  );
  assert.ok(
    releaseGateJob.indexOf('MAIN_SHA="$(git rev-parse origin/main)"') <
      releaseGateJob.indexOf("run: pnpm completion:gate:external"),
    "Expected release tags to be tied to main before the external release gate.",
  );
  assert.ok(
    releaseGateJob.indexOf(
      "run: pnpm --dir launcher install --frozen-lockfile",
    ) < releaseGateJob.indexOf("run: pnpm completion:gate:external"),
    "Expected release gate to install launcher dependencies before using pinned Supabase CLI.",
  );
  assert.match(
    releaseGateJob,
    /run: pnpm --dir launcher install --frozen-lockfile/,
  );
  assert.match(releaseGateJob, /run: pnpm completion:gate:external/);
  assert.doesNotMatch(releaseGateJob, /hosted:deploy-gate deploy/);
  assert.doesNotMatch(releaseGateJob, /\bOGL_HOSTED_DEPLOY_FUNCTIONS:/);
  assert.match(
    buildUploadJob,
    /^    if: startsWith\(github\.ref, 'refs\/tags\/v'\)$/m,
  );

  for (const job of [
    "frontend",
    "rust-fmt",
    "rust-clippy",
    "rust-test",
    "rust-build-windows",
    "supabase-db-lint",
    "supabase-edge-contracts",
  ]) {
    assert.match(releaseGateNeeds, new RegExp(`^        ${job},?$`, "m"));
  }

  for (const envName of [
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_PROJECT_REF",
    "SUPABASE_URL",
    "SUPABASE_FUNCTIONS_URL",
    "SUPABASE_REST_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_ANON_KEY",
    "SUPABASE_AUTH_JWT",
    "ACCOUNT_DELETION_PROCESSOR_SECRET",
    "PRICE_DROP_NOTIFY_SECRET",
    "PRESENCE_POLL_SECRET",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STEAM_WEB_API_KEY",
    "PRESENCE_PROVIDER_TOKEN",
    "MOD_IO_API_KEY",
    "CURSEFORGE_API_KEY",
  ]) {
    assert.match(releaseGateJob, new RegExp(`\\b${envName}:`));
  }

  assert.match(buildUploadNeeds, /^        release-boundary-gate,$/m);
  assert.doesNotMatch(buildUploadJob, /softprops\/action-gh-release/);
  assert.match(
    createDraftReleaseJob,
    /^    if: startsWith\(github\.ref, 'refs\/tags\/v'\)$/m,
  );
  assert.match(createDraftReleaseJob, /^    needs: \[build-upload\]$/m);
  assert.match(
    createDraftReleaseJob,
    /actions\/download-artifact@[0-9a-f]{40}/,
  );
  assert.match(
    createDraftReleaseJob,
    /softprops\/action-gh-release@[0-9a-f]{40}/,
  );
});

test("release boundary external checks ignore scoped evidence env", () => {
  assert.deepEqual(
    releaseBoundaryEnv({
      KEEP_ME: "yes",
      OGL_EXTERNAL_EVIDENCE_GATES: "store-stripe-live",
      OGL_HOSTED_DEPLOY_FUNCTIONS: "stripe-webhook",
      OGL_HOSTED_CRON_EVIDENCE_CHECKS: "price-drop",
    }),
    { KEEP_ME: "yes" },
  );

  const calls = [];
  const status = runCompletionGate({
    action: "external",
    env: {
      KEEP_ME: "yes",
      OGL_EXTERNAL_EVIDENCE_GATES: "store-stripe-live",
      OGL_HOSTED_DEPLOY_FUNCTIONS: "stripe-webhook",
      OGL_HOSTED_CRON_EVIDENCE_CHECKS: "price-drop",
    },
    logger: captureLogger().logger,
    platform: "linux",
    runCommand(command, args, options) {
      calls.push({
        commandLine: [command, ...args].join(" "),
        env: options.env,
      });
      return { status: 0 };
    },
  });

  assert.equal(status, 0);
  for (const call of calls) {
    assert.equal(call.env.KEEP_ME, "yes");
    assert.equal("OGL_EXTERNAL_EVIDENCE_GATES" in call.env, false);
    assert.equal("OGL_HOSTED_DEPLOY_FUNCTIONS" in call.env, false);
    assert.equal("OGL_HOSTED_CRON_EVIDENCE_CHECKS" in call.env, false);
  }
});

test("local action runs only local checks in order", () => {
  const calls = [];
  const { logger, logs } = captureLogger();
  const status = runCompletionGate({
    action: "local",
    logger,
    platform: "win32",
    runCommand(command, args) {
      calls.push([command, ...args].join(" "));
      return { status: 0 };
    },
  });

  assert.equal(status, 0);
  assert.deepEqual(
    calls,
    completionLocalChecks.map((check) => commandLine(check)),
  );

  for (const id of requiredLocalCompletionCheckIds) {
    assert.ok(
      calls.includes(
        commandLine(findCheckById(completionLocalChecks, id, "local")),
      ),
      `Expected local action to run ${id}.`,
    );
  }

  const output = logs.join("\n");
  assert.match(
    output,
    /Local deterministic completion checks passed for this platform/,
  );
  assert.match(output, /External evidence was not checked or collected/);
  assert.doesNotMatch(output, /Release-boundary completion gate passed/);

  const skippedCalls = [];
  const { logs: skippedLogs, logger: skippedLogger } = captureLogger();
  assert.equal(
    runCompletionGate({
      action: "local",
      logger: skippedLogger,
      platform: "linux",
      runCommand(command, args) {
        skippedCalls.push([command, ...args].join(" "));
        return { status: 0 };
      },
    }),
    0,
  );
  assert.equal(
    skippedCalls.includes(
      commandLine(
        findCheckById(completionLocalChecks, "rust-windows-check", "local"),
      ),
    ),
    false,
  );
  const skippedOutput = skippedLogs.join("\n");
  assert.match(skippedOutput, /Skipped on linux/);
  assert.match(
    skippedOutput,
    /Platform-scoped local checks skipped on linux: Rust Windows target check/,
  );
  assert.match(skippedOutput, /External evidence was not checked or collected/);
});

test("external action runs only external checks and names external evidence", () => {
  const calls = [];
  const { logger, logs } = captureLogger();
  const status = runCompletionGate({
    action: "external",
    logger,
    platform: "linux",
    runCommand(command, args) {
      calls.push([command, ...args].join(" "));
      return { status: 0 };
    },
  });

  assert.equal(status, 0);
  assert.deepEqual(
    calls,
    completionExternalChecks.map((check) => commandLine(check)),
  );

  const output = logs.join("\n");
  assert.match(output, /External completion evidence checks passed/);
  for (const check of completionExternalChecks) {
    assert.match(output, new RegExp(escapeRegex(check.label)));
  }
  assert.match(
    output,
    /Local deterministic checks were not run by this action/,
  );
  assert.doesNotMatch(output, /Release-boundary completion gate passed/);
});

test("full check success is the only release-boundary success summary", () => {
  const calls = [];
  const { logger, logs } = captureLogger();
  const status = runCompletionGate({
    action: "check",
    logger,
    platform: "win32",
    runCommand(command, args) {
      calls.push([command, ...args].join(" "));
      return { status: 0 };
    },
  });

  assert.equal(status, 0);
  assert.equal(
    calls.length,
    completionLocalChecks.length + completionExternalChecks.length,
  );
  const output = logs.join("\n");
  assert.match(output, /Release-boundary completion gate passed/);
  assert.match(
    output,
    /local deterministic checks and external evidence checks passed/,
  );
});

test("full check success with platform-scoped skips is not a cross-platform release claim", () => {
  const calls = [];
  const { logger, logs } = captureLogger();
  const status = runCompletionGate({
    action: "check",
    logger,
    platform: "linux",
    runCommand(command, args) {
      calls.push([command, ...args].join(" "));
      return { status: 0 };
    },
  });

  assert.equal(status, 0);
  assert.equal(
    calls.includes(
      commandLine(
        findCheckById(completionLocalChecks, "rust-windows-check", "local"),
      ),
    ),
    false,
  );
  const output = logs.join("\n");
  assert.match(
    output,
    /Release-boundary completion gate passed for this platform/,
  );
  assert.match(output, /Platform-scoped local checks skipped on linux/);
  assert.doesNotMatch(
    output,
    /^Release-boundary completion gate passed: local deterministic checks and external evidence checks passed\./m,
  );
});

test("full check continues through failures and returns non-zero", () => {
  const calls = [];
  const { errors, logger } = captureLogger();
  const status = runCompletionGate({
    action: "check",
    logger,
    platform: "win32",
    runCommand(command, args) {
      calls.push([command, ...args].join(" "));
      return {
        status: calls.length === 2 ? 1 : 0,
      };
    },
  });

  assert.equal(status, 1);
  assert.equal(
    calls.length,
    completionLocalChecks.length + completionExternalChecks.length,
  );
  assert.match(errors.join("\n"), /Completion gate failed/);
});
