import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertReleaseWorkflow,
  releaseWorkflowReport,
  workflowJobBlock,
} from "./release-workflow-check.mjs";

const releaseWorkflowScriptPath = fileURLToPath(
  new URL("./release-workflow-check.mjs", import.meta.url),
);

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

test("release workflow contract ignores commented external gate commands", () => {
  const broken = ciWorkflow.replace(
    "      - name: Run external release boundary gate\n        run: pnpm completion:gate:external",
    "      - name: Run external release boundary gate\n        # run: pnpm completion:gate:external\n        run: pnpm completion:gate:status",
  );

  assert.deepEqual(errorsFor(broken), [
    "release-boundary-gate must run external completion gate before packaging",
  ]);
});

test("release workflow contract ignores commented release boundary env secrets", () => {
  const broken = ciWorkflow.replace(
    "          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}",
    "          # SUPABASE_URL: ${{ secrets.SUPABASE_URL }}",
  );

  assert.deepEqual(errorsFor(broken), [
    "release-boundary-gate must pass SUPABASE_URL from secrets",
  ]);
});

test("release workflow contract requires secrets on the external gate step", () => {
  const broken = ciWorkflow
    .replace("          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}\n", "")
    .replace(
      "      - name: Run external release boundary gate\n",
      "      - name: Detached release secret fixture\n        env:\n          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}\n        run: node -e \"console.log('not the external gate')\"\n      - name: Run external release boundary gate\n",
    );

  assert.deepEqual(errorsFor(broken), [
    "release-boundary-gate must pass SUPABASE_URL from secrets",
  ]);
});

test("release workflow contract requires build-upload to depend on release boundary", () => {
  const broken = ciWorkflow.replace("        release-boundary-gate,\n", "");

  assert.deepEqual(errorsFor(broken), [
    "build-upload must depend on release-boundary-gate",
  ]);
});

test("release workflow contract requires release tags to wait for coverage", () => {
  const broken = ciWorkflow.replaceAll("        coverage,\n", "");

  assert.deepEqual(errorsFor(broken), [
    "release-boundary-gate must depend on coverage",
    "build-upload must depend on coverage",
  ]);
});

test("release workflow contract requires the real desktop E2E smoke", () => {
  const broken = ciWorkflow.replace(
    "        run: pnpm test:e2e:desktop",
    "        run: pnpm test",
  );

  assert.deepEqual(errorsFor(broken), [
    "desktop E2E must execute the UI to IPC smoke",
  ]);
});

test("release workflow contract makes the release boundary wait for desktop E2E", () => {
  const broken = ciWorkflow.replace("        desktop-e2e-windows,\n", "");

  assert.deepEqual(errorsFor(broken), [
    "release-boundary-gate must depend on desktop-e2e-windows",
  ]);
});

test("release workflow contract keeps the packaged platform matrix pinned", () => {
  const broken = ciWorkflow.replace(
    "          - os: windows-2025",
    "          - os: windows-latest",
  );

  assert.deepEqual(errorsFor(broken), [
    "build-upload matrix must include windows-2025 x86_64-pc-windows-msvc _windows_x64",
  ]);
});

test("release workflow contract keeps each matrix target with its platform row", () => {
  const broken = ciWorkflow.replace(
    "            target: x86_64-pc-windows-msvc",
    "            target: x86_64-unknown-linux-gnu",
  );

  assert.deepEqual(errorsFor(broken), [
    "build-upload matrix must include windows-2025 x86_64-pc-windows-msvc _windows_x64",
  ]);
});

test("release workflow contract keeps Tauri release builds Cargo-locked", () => {
  const broken = ciWorkflow.replace(
    "node ./node_modules/@tauri-apps/cli/tauri.js build --target ${{ matrix.target }} ${{ matrix.tauri_config }} -- --locked",
    "node ./node_modules/@tauri-apps/cli/tauri.js build --target ${{ matrix.target }} ${{ matrix.tauri_config }}",
  );

  assert.deepEqual(errorsFor(broken), [
    "build-upload must build the matrix target explicitly with Cargo.lock frozen",
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

test("release workflow contract validates signing secrets before building", () => {
  const start = ciWorkflow.indexOf(
    "      - name: Validate Windows updater signing secrets\n",
  );
  const end = ciWorkflow.indexOf(
    "      - name: Import Windows Authenticode certificate\n",
  );
  assert.ok(start >= 0 && end > start);
  const signingStep = ciWorkflow
    .slice(start, end)
    .replace(
      "          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}\n",
      "",
    );
  const broken =
    ciWorkflow.slice(0, start) + signingStep + ciWorkflow.slice(end);

  assert.deepEqual(errorsFor(broken), [
    "build-upload signing secret validation must pass TAURI_SIGNING_PRIVATE_KEY from secrets",
  ]);
});

test("release workflow contract requires Authenticode certificate import", () => {
  const broken = ciWorkflow.replace(
    "      - name: Import Windows Authenticode certificate",
    "      - name: Import detached certificate fixture",
  );

  assert.deepEqual(errorsFor(broken), [
    "build-upload must import the Windows Authenticode certificate",
  ]);
});

test("release workflow contract verifies macOS notarization", () => {
  const broken = ciWorkflow.replace(
    "      - name: Verify macOS code signing and notarization",
    "      - name: Skip macOS code signing and notarization",
  );

  assert.deepEqual(errorsFor(broken), [
    "build-upload must run Verify macOS code signing and notarization",
  ]);
});

test("release workflow contract rejects unscoped bundle upload globs", () => {
  const broken = ciWorkflow.replace(
    "launcher/src-tauri/target/x86_64-unknown-linux-gnu/release/bundle/**/*.AppImage",
    "launcher/src-tauri/target/release/bundle/**/*.AppImage",
  );

  assert.deepEqual(errorsFor(broken), [
    "build-upload matrix must contract ubuntu-24.04 x86_64-unknown-linux-gnu AppImage artifact path",
    "build-upload artifact contract must not use unscoped target/release paths",
  ]);
});

test("release workflow contract requires platform artifact inventory rows", () => {
  const broken = ciWorkflow.replace(
    "              launcher/src-tauri/target/x86_64-unknown-linux-gnu/release/bundle/**/*.rpm\n",
    "",
  );

  assert.deepEqual(errorsFor(broken), [
    "build-upload matrix must contract ubuntu-24.04 x86_64-unknown-linux-gnu rpm artifact path",
  ]);
});

test("release workflow contract requires upload to use matrix artifact inventory", () => {
  const broken = ciWorkflow.replace(
    "          path: ${{ matrix.artifacts }}",
    "          path: launcher/src-tauri/target/${{ matrix.target }}/release/bundle/**/*.AppImage",
  );

  assert.deepEqual(errorsFor(broken), [
    "build-upload artifact upload must use the matrix artifact contract",
  ]);
});

test("release workflow contract requires missing upload files to fail", () => {
  const broken = ciWorkflow.replace("          if-no-files-found: error\n", "");

  assert.deepEqual(errorsFor(broken), [
    "build-upload artifact upload must fail when contract paths match no files",
  ]);
});

test("release workflow contract publishes releases after all gates", () => {
  const broken = ciWorkflow.replace(
    "          draft: false",
    "          draft: true",
  );

  assert.deepEqual(errorsFor(broken), [
    "create-release must publish automatically after all release gates",
  ]);
});

test("release workflow contract requires release checksums", () => {
  const broken = ciWorkflow.replace(
    /      - name: Generate release artifact checksums\n(?:        .+\n|        run: \|\n(?:          .+\n)+)/,
    "",
  );

  assert.deepEqual(errorsFor(broken), [
    "create-release must generate release artifact checksums",
  ]);
});

test("release workflow contract requires updater generator tests in CI", () => {
  const broken = ciWorkflow.replace(
    "      - name: Validate updater manifest generator\n        run: node --test scripts/generate-updater-manifest.test.mjs\n",
    "",
  );

  assert.deepEqual(errorsFor(broken), [
    "script validation must run updater manifest generator tests",
  ]);
});

test("release workflow contract requires desktop E2E contract tests in CI", () => {
  const broken = ciWorkflow.replace(
    "      - name: Validate desktop E2E contract\n        run: node --test scripts/desktop-e2e-contract.test.mjs\n",
    "",
  );

  assert.deepEqual(errorsFor(broken), [
    "script validation must run desktop E2E contract tests",
  ]);
});

test("release workflow contract requires the Windows updater signature", () => {
  const broken = ciWorkflow.replace(
    "              launcher/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/**/*.exe.sig\n",
    "",
  );

  assert.deepEqual(errorsFor(broken), [
    "build-upload matrix must contract windows-2025 x86_64-pc-windows-msvc exe.sig artifact path",
  ]);
});

test("release workflow contract requires the Windows updater config", () => {
  const broken = ciWorkflow.replace(
    "            tauri_config: --config src-tauri/tauri.windows.conf.json\n",
    "",
  );

  assert.deepEqual(errorsFor(broken), [
    "build-upload Windows row must merge tauri.windows.conf.json",
  ]);
});

test("release workflow contract passes signing secrets to the Tauri build", () => {
  const broken = ciWorkflow.replace(
    "      - name: Build (Tauri)\n        working-directory: launcher\n        run: node ./node_modules/@tauri-apps/cli/tauri.js build --target ${{ matrix.target }} ${{ matrix.tauri_config }} -- --locked\n        env:\n          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}",
    "      - name: Build (Tauri)\n        working-directory: launcher\n        run: node ./node_modules/@tauri-apps/cli/tauri.js build --target ${{ matrix.target }} ${{ matrix.tauri_config }} -- --locked\n        env:\n          TAURI_SIGNING_PRIVATE_KEY: detached-value",
  );

  assert.deepEqual(errorsFor(broken), [
    "build-upload Tauri build must pass TAURI_SIGNING_PRIVATE_KEY from secrets",
  ]);
});

test("release workflow has no nexus mod dependency", () => {
  assert.doesNotMatch(ciWorkflow, /NEXUS_MODS_APP_ID/);
  assert.doesNotMatch(ciWorkflow, /nexus/i);
  assert.deepEqual(errorsFor(ciWorkflow), []);
});

test("release workflow contract requires latest.json before checksums", () => {
  const manifestStart = ciWorkflow.indexOf(
    "      - name: Generate signed updater manifest\n",
  );
  const checksumStart = ciWorkflow.indexOf(
    "      - name: Generate release artifact checksums\n",
  );
  assert.ok(manifestStart >= 0);
  assert.ok(checksumStart > manifestStart);

  const manifestStep = ciWorkflow.slice(manifestStart, checksumStart);
  const withoutManifest =
    ciWorkflow.slice(0, manifestStart) + ciWorkflow.slice(checksumStart);
  const releaseStart = withoutManifest.indexOf(
    "      - name: Create GitHub Release\n",
  );
  assert.ok(releaseStart > 0);
  const broken =
    withoutManifest.slice(0, releaseStart) +
    manifestStep +
    withoutManifest.slice(releaseStart);

  assert.deepEqual(errorsFor(broken), [
    "create-release must generate latest.json before checksums",
  ]);
});

test("release workflow contract protects the stable latest channel", () => {
  const broken = ciWorkflow
    .replace(
      "          prerelease: ${{ steps.release-channel.outputs.prerelease }}\n",
      "",
    )
    .replace(
      "          make_latest: ${{ steps.release-channel.outputs.prerelease == 'false' }}\n",
      "",
    );

  assert.deepEqual(errorsFor(broken), [
    "create-release must mark SemVer prereleases on GitHub",
    "create-release must make only stable releases latest",
  ]);
});

test("release workflow contract requires checksum manifest before release upload", () => {
  const checksumStart = ciWorkflow.indexOf(
    "      - name: Generate release artifact checksums\n",
  );
  const releaseStart = ciWorkflow.indexOf(
    "      - name: Create GitHub Release\n",
  );
  assert.ok(checksumStart >= 0);
  assert.ok(releaseStart > checksumStart);

  const checksumStep = ciWorkflow.slice(checksumStart, releaseStart);
  const withoutChecksum =
    ciWorkflow.slice(0, checksumStart) + ciWorkflow.slice(releaseStart);
  const hostedDeployComment = withoutChecksum.indexOf(
    "\n  # ---------- Supabase: manual hosted deploy gate ----------",
  );
  assert.ok(hostedDeployComment > 0);
  const broken =
    withoutChecksum.slice(0, hostedDeployComment) +
    checksumStep +
    withoutChecksum.slice(hostedDeployComment);

  assert.deepEqual(errorsFor(broken), [
    "create-release must checksum artifacts before release upload",
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

test("release workflow CLI runs from any working directory", () => {
  const result = spawnSync(process.execPath, [releaseWorkflowScriptPath], {
    cwd: tmpdir(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.match(
    result.stdout,
    /\.github\/workflows\/ci\.yml preserves release workflow contract\./,
  );
});
