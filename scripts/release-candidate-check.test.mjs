import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  changelogVersionSectionReport,
  defaultReleaseTag,
  externalProofHashPolicyReport,
  parseArgs,
  releaseCandidateReport,
  renderReleaseCandidateReport,
} from "./release-candidate-check.mjs";

const head = "a".repeat(40);

function writeCandidateFixture({
  changelogVersion = "1.2.3",
  version = "1.2.3",
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "ogl-release-candidate-"));
  mkdirSync(join(root, "launcher", "src-tauri"), { recursive: true });
  mkdirSync(join(root, "docs", "verification", "external"), {
    recursive: true,
  });
  mkdirSync(join(root, "docs", "runbooks"), { recursive: true });

  writeFileSync(
    join(root, "launcher", "package.json"),
    `${JSON.stringify({ version }, null, 2)}\n`,
  );
  writeFileSync(
    join(root, "launcher", "src-tauri", "tauri.conf.json"),
    `${JSON.stringify({ version }, null, 2)}\n`,
  );
  writeFileSync(
    join(root, "launcher", "src-tauri", "Cargo.toml"),
    `[package]\nname = "open-game-launcher"\nversion = "${version}"\n`,
  );
  writeFileSync(
    join(root, "CHANGELOG.md"),
    `# Changelog\n\n## [Unreleased]\n\n## [${changelogVersion}] - Release\n`,
  );
  writeFileSync(
    join(root, "docs", "verification", "external", "README.md"),
    ["Hosted cron receipt SHA256", "pnpm completion:gate:external", ""].join(
      "\n",
    ),
  );
  writeFileSync(
    join(root, "docs", "runbooks", "external-completion-evidence.md"),
    [
      "Hosted cron receipt SHA256",
      "Evidence locator sha256:<64-hex>",
      "Commit SHA",
      "",
    ].join("\n"),
  );

  return root;
}

function validCompletionStatus() {
  return {
    local: {
      latestReceipt: {
        command: "pnpm completion:gate:local",
        currentGitHead: head,
        gitHead: head,
        path: ".codex/completion-gate-local-latest.json",
        present: true,
        releaseProof: false,
        valid: true,
      },
    },
  };
}

function cleanTrackingReport() {
  return {
    changedRequiredPaths: [],
    emptyTrackedDirectories: [],
    missingRequiredPaths: [],
    missingTrackedFiles: [],
    ready: true,
    untrackedRequiredPaths: [],
  };
}

function passingReport(root, overrides = {}) {
  return releaseCandidateReport({
    completionStatus: validCompletionStatus(),
    localTagExists: () => false,
    root,
    trackingReport: cleanTrackingReport(),
    workflowReport: { errors: [], ok: true },
    ...overrides,
  });
}

test("defaultReleaseTag derives the candidate tag from launcher/package.json", () => {
  const root = writeCandidateFixture({ version: "2.3.4" });

  assert.equal(defaultReleaseTag(root), "v2.3.4");
});

test("release candidate report accepts aligned local release prep signals", () => {
  const root = writeCandidateFixture();
  const report = passingReport(root, { tag: "v1.2.3" });

  assert.equal(report.ok, true);
  assert.deepEqual(
    report.checks.map(({ id, ok }) => [id, ok]),
    [
      ["tag-version", true],
      ["local-completion-receipt", true],
      ["local-tag-available", true],
      ["changelog-section", true],
      ["release-tracking-clean", true],
      ["release-workflow-policy", true],
      ["external-proof-hash-policy", true],
    ],
  );
});

test("release candidate report reuses release tag version alignment", () => {
  const root = writeCandidateFixture({ version: "1.2.3" });
  const report = passingReport(root, { tag: "v1.2.4" });

  assert.equal(report.ok, false);
  assert.match(
    report.errors.join("\n"),
    /release tag version must match launcher\/package\.json/,
  );
});

test("release candidate report rejects an existing local tag", () => {
  const root = writeCandidateFixture();
  const report = passingReport(root, {
    localTagExists: () => true,
    tag: "v1.2.3",
  });

  assert.equal(report.ok, false);
  assert.match(report.errors.join("\n"), /local tag v1\.2\.3 already exists/);
});

test("release candidate report requires a current local completion receipt", () => {
  const root = writeCandidateFixture();
  const report = passingReport(root, {
    completionStatus: {
      local: {
        latestReceipt: {
          path: ".codex/completion-gate-local-latest.json",
          present: true,
          valid: false,
          validationReason: "stale_checkout",
        },
      },
    },
    tag: "v1.2.3",
  });

  assert.equal(report.ok, false);
  assert.match(report.errors.join("\n"), /stale_checkout/);
});

test("release candidate report requires a versioned CHANGELOG section", () => {
  const root = writeCandidateFixture({ changelogVersion: "1.2.2" });
  const report = passingReport(root, { tag: "v1.2.3" });

  assert.equal(report.ok, false);
  assert.match(
    report.errors.join("\n"),
    /CHANGELOG\.md must include ## \[1\.2\.3\]/,
  );
});

test("release candidate report surfaces dirty release-critical paths", () => {
  const root = writeCandidateFixture();
  const report = passingReport(root, {
    tag: "v1.2.3",
    trackingReport: {
      changedRequiredPaths: ["scripts/release-tag-check.mjs"],
      emptyTrackedDirectories: [],
      missingRequiredPaths: [],
      missingTrackedFiles: [],
      ready: false,
      untrackedRequiredPaths: [],
    },
  });

  assert.equal(report.ok, false);
  assert.match(
    report.errors.join("\n"),
    /changed release-critical paths: scripts\/release-tag-check\.mjs/,
  );
});

test("release candidate report surfaces release workflow policy failures", () => {
  const root = writeCandidateFixture();
  const report = passingReport(root, {
    tag: "v1.2.3",
    workflowReport: {
      errors: ["release-boundary-gate must run only for v* tags"],
      ok: false,
    },
  });

  assert.equal(report.ok, false);
  assert.match(
    report.errors.join("\n"),
    /release-boundary-gate must run only for v\* tags/,
  );
});

test("release candidate report surfaces external proof hash policy failures", () => {
  const root = writeCandidateFixture();
  const report = passingReport(root, {
    externalProofHashPolicy: {
      errors: [
        "docs/runbooks/external-completion-evidence.md must mention sha256:<64-hex>",
      ],
      ok: false,
    },
    tag: "v1.2.3",
  });

  assert.equal(report.ok, false);
  assert.match(report.errors.join("\n"), /must mention sha256:<64-hex>/);
});

test("externalProofHashPolicyReport requires external receipt and sha256 policy anchors", () => {
  const report = externalProofHashPolicyReport({
    contracts: [
      {
        path: "policy.md",
        requiredText: ["Hosted cron receipt SHA256", "sha256:<64-hex>"],
      },
    ],
    readFile: () => "Hosted cron receipt SHA256\n",
  });

  assert.deepEqual(report.errors, ["policy.md must mention sha256:<64-hex>"]);
});

test("changelogVersionSectionReport accepts decorated section headings", () => {
  assert.equal(
    changelogVersionSectionReport({
      content: "## [1.2.3] - Release candidate\n",
      version: "1.2.3",
    }).ok,
    true,
  );
});

test("parseArgs accepts one optional candidate tag", () => {
  assert.deepEqual(parseArgs([]), { tag: undefined });
  assert.deepEqual(parseArgs(["v1.2.3"]), { tag: "v1.2.3" });
  assert.throws(() => parseArgs(["--tag", "v1.2.3"]), /Usage/);
  assert.throws(() => parseArgs(["v1.2.3", "v1.2.4"]), /at most one/);
});

test("renderReleaseCandidateReport lists failed findings", () => {
  const output = renderReleaseCandidateReport({
    checks: [
      {
        errors: ["broken"],
        id: "example",
        label: "Example check",
        ok: false,
      },
    ],
    errors: ["example: broken"],
    ok: false,
    tag: "v1.2.3",
    version: "1.2.3",
  });

  assert.match(output, /^Release candidate preflight/);
  assert.match(output, /FAIL Example check/);
  assert.match(output, /example: broken/);
});
