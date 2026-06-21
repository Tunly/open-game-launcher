import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assertReleaseWorkflow,
  releaseWorkflowReport,
  workflowJobBlock,
} from "./release-workflow-check.mjs";

const ciWorkflow = readFileSync(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);

function errorsFor(content) {
  return releaseWorkflowReport({ content }).errors;
}

test("release workflow contract accepts the committed CI workflow", () => {
  assert.deepEqual(releaseWorkflowReport({ content: ciWorkflow }), {
    errors: [],
    ok: true,
    path: ".github/workflows/ci.yml",
  });
  assert.doesNotThrow(() => assertReleaseWorkflow({ content: ciWorkflow }));
});

test("workflowJobBlock extracts one CI job block", () => {
  const block = workflowJobBlock(ciWorkflow, "release-boundary-gate");

  assert.match(block, /^  release-boundary-gate:/);
  assert.match(block, /pnpm completion:gate:external/);
  assert.doesNotMatch(block, /^  build-upload:/m);
});

test("release workflow contract requires hosted-production external boundary", () => {
  const broken = ciWorkflow.replace(
    "environment: hosted-production",
    "environment: hosted-staging",
  );

  assert.deepEqual(errorsFor(broken), [
    "release-boundary-gate must use hosted-production environment",
  ]);
});

test("release workflow contract requires external gate before packaging", () => {
  const broken = ciWorkflow.replace(
    "pnpm completion:gate:external",
    "pnpm completion:gate:status",
  );

  assert.deepEqual(errorsFor(broken), [
    "release-boundary-gate must run external completion gate before packaging",
  ]);
});

test("release workflow contract requires build-upload to depend on release boundary", () => {
  const broken = ciWorkflow.replace("        release-boundary-gate,\n", "");

  assert.deepEqual(errorsFor(broken), [
    "build-upload must depend on release-boundary-gate",
  ]);
});

test("release workflow contract keeps the packaged platform matrix pinned", () => {
  const broken = ciWorkflow.replace(
    "          - os: windows-2025",
    "          - os: windows-latest",
  );

  assert.deepEqual(errorsFor(broken), [
    "build-upload matrix must include windows-2025 x86_64-pc-windows-msvc _x64.msi",
  ]);
});

test("release workflow contract keeps each matrix target with its platform row", () => {
  const broken = ciWorkflow.replace(
    "            target: x86_64-pc-windows-msvc",
    "            target: x86_64-unknown-linux-gnu",
  );

  assert.deepEqual(errorsFor(broken), [
    "build-upload matrix must include windows-2025 x86_64-pc-windows-msvc _x64.msi",
  ]);
});

test("release workflow contract reads build-upload needs structurally", () => {
  const broken = ciWorkflow.replace(
    "        release-boundary-gate,\n",
    "        # release-boundary-gate moved into a comment must not count.\n",
  );

  assert.deepEqual(errorsFor(broken), [
    "build-upload must depend on release-boundary-gate",
  ]);
});

test("release workflow contract preserves signing and Linux bundle env", () => {
  const broken = ciWorkflow.replace(
    "          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}\n",
    "",
  );

  assert.deepEqual(errorsFor(broken), [
    "build-upload must preserve TAURI_SIGNING_PRIVATE_KEY",
  ]);
});

test("release workflow contract rejects unscoped bundle upload globs", () => {
  const broken = ciWorkflow.replace(
    "launcher/src-tauri/target/${{ matrix.target }}/release/bundle/**/*.AppImage",
    "launcher/src-tauri/target/release/bundle/**/*.AppImage",
  );

  assert.deepEqual(errorsFor(broken), [
    "build-upload artifact globs must not use unscoped target/release paths",
    "build-upload must upload target-scoped AppImage bundles",
  ]);
});

test("release workflow contract requires draft releases after upload", () => {
  const broken = ciWorkflow.replace(
    "          draft: true",
    "          draft: false",
  );

  assert.deepEqual(errorsFor(broken), [
    "create-draft-release must create a draft release",
  ]);
});

test("release workflow contract requires CI to run its test file", () => {
  const broken = ciWorkflow.replace(
    "      - name: Validate release workflow contract\n        run: node --test scripts/release-workflow-check.test.mjs\n",
    "",
  );

  assert.deepEqual(errorsFor(broken), [
    "script validation must run release workflow contract tests",
  ]);
});
