#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export const releaseWorkflowRelativePath = ".github/workflows/ci.yml";

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function workflowJobBlock(content, jobId) {
  const escapedJobId = escapeRegex(jobId);
  const jobHeader = content.match(new RegExp(`^  ${escapedJobId}:\\n`, "m"));
  if (jobHeader?.index === undefined) return "";

  const start = jobHeader.index;
  const afterHeaderStart = start + jobHeader[0].length;
  const afterHeader = content.slice(afterHeaderStart);
  const nextJobOffset = afterHeader.search(/^  [A-Za-z0-9_-]+:\n/m);
  const end =
    nextJobOffset === -1 ? content.length : afterHeaderStart + nextJobOffset;
  return content.slice(start, end);
}

function workflowJobPropertyBlock(jobBlock, propertyName) {
  const escapedPropertyName = escapeRegex(propertyName);
  const propertyHeader = jobBlock.match(
    new RegExp(`^    ${escapedPropertyName}:.*\\n`, "m"),
  );
  if (propertyHeader?.index === undefined) return "";

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

function workflowListPropertyValues(jobBlock, propertyName) {
  const propertyBlock = workflowJobPropertyBlock(jobBlock, propertyName);
  if (!propertyBlock) return [];

  const [header, ...bodyLines] = propertyBlock.split("\n");
  const inlineValues = header.match(/:\s*\[(?<values>.*)\]\s*$/)?.groups
    ?.values;
  const sourceValues = inlineValues === undefined ? bodyLines : [inlineValues];

  return sourceValues
    .flatMap((line) => line.split(","))
    .map((line) =>
      line
        .replace(/#.*/, "")
        .replace(/^\s*-\s*/, "")
        .trim()
        .replace(/^["']|["']$/g, ""),
    )
    .filter((value) => value && value !== "[" && value !== "]");
}

function hasJobNeed(jobBlock, need) {
  return workflowListPropertyValues(jobBlock, "needs").includes(need);
}

function buildUploadMatrixRows(jobBlock) {
  const rows = [];
  let currentRow = null;
  let inIncludeBlock = false;

  for (const line of jobBlock.split("\n")) {
    if (/^        include:\s*$/.test(line)) {
      inIncludeBlock = true;
      continue;
    }
    if (inIncludeBlock && /^    steps:\s*$/.test(line)) break;
    if (!inIncludeBlock) continue;

    const os = line.match(/^          - os:\s*(?<value>.+)\s*$/)?.groups?.value;
    if (os) {
      if (currentRow) rows.push(currentRow);
      currentRow = { os: os.trim() };
      continue;
    }

    if (!currentRow) continue;

    const target = line.match(/^            target:\s*(?<value>.+)\s*$/)?.groups
      ?.value;
    if (target) {
      currentRow.target = target.trim();
      continue;
    }

    const artifact = line.match(/^            artifact:\s*(?<value>.+)\s*$/)
      ?.groups?.value;
    if (artifact) currentRow.artifact = artifact.trim();
  }

  if (currentRow) rows.push(currentRow);
  return rows;
}

function hasMatrixEntry(rows, [os, target, artifactSuffix]) {
  return rows.some(
    (row) =>
      row.os === os &&
      row.target === target &&
      row.artifact?.endsWith(artifactSuffix),
  );
}

function pushMissing(errors, block, value, message) {
  if (!block.includes(value)) errors.push(message);
}

function pushMissingRunLine(errors, block, command, message) {
  const commandPattern = escapeRegex(command);
  const runLinePattern = new RegExp(
    `^        run:\\s*${commandPattern}\\s*(?:#.*)?$`,
    "m",
  );
  if (!runLinePattern.test(block)) errors.push(message);
}

function releaseWorkflowContent({ content, root }) {
  return (
    content ?? readFileSync(join(root, releaseWorkflowRelativePath), "utf8")
  );
}

export function releaseWorkflowReport({ content, root = repoRoot } = {}) {
  const workflow = releaseWorkflowContent({ content, root });
  const errors = [];

  if (!/^\s+tags:\n\s+- "v\*"\s*$/m.test(workflow)) {
    errors.push("workflow must run on v* tag pushes");
  }

  const scriptValidationJob = workflowJobBlock(
    workflow,
    "supabase-edge-contracts",
  );
  if (!scriptValidationJob) {
    errors.push(
      "workflow must define supabase-edge-contracts script validation job",
    );
  } else {
    pushMissing(
      errors,
      scriptValidationJob,
      "node --test scripts/release-workflow-check.test.mjs",
      "script validation must run release workflow contract tests",
    );
  }

  const releaseBoundaryGate = workflowJobBlock(
    workflow,
    "release-boundary-gate",
  );
  if (!releaseBoundaryGate) {
    errors.push("workflow must define release-boundary-gate job");
  } else {
    pushMissing(
      errors,
      releaseBoundaryGate,
      "if: startsWith(github.ref, 'refs/tags/v')",
      "release-boundary-gate must run only for v* tags",
    );
    pushMissing(
      errors,
      releaseBoundaryGate,
      "environment: hosted-production",
      "release-boundary-gate must use hosted-production environment",
    );
    pushMissing(
      errors,
      releaseBoundaryGate,
      'node scripts/release-tag-check.mjs "$GITHUB_REF_NAME"',
      "release-boundary-gate must validate release tag version",
    );
    pushMissing(
      errors,
      releaseBoundaryGate,
      "release tags must point at the current origin/main commit.",
      "release-boundary-gate must reject tags that do not point at origin/main",
    );
    pushMissingRunLine(
      errors,
      releaseBoundaryGate,
      "pnpm completion:gate:external",
      "release-boundary-gate must run external completion gate before packaging",
    );
    for (const requiredNeed of [
      "frontend",
      "rust-fmt",
      "rust-clippy",
      "rust-test",
      "rust-build-windows",
      "supabase-db-lint",
      "supabase-edge-contracts",
    ]) {
      if (!hasJobNeed(releaseBoundaryGate, requiredNeed)) {
        errors.push(`release-boundary-gate must depend on ${requiredNeed}`);
      }
    }
    for (const secretName of [
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
      const secretReference = `${secretName}: \${{ secrets.${secretName} }}`;
      pushMissing(
        errors,
        releaseBoundaryGate,
        secretReference,
        `release-boundary-gate must pass ${secretName} from secrets`,
      );
    }
  }

  const buildUpload = workflowJobBlock(workflow, "build-upload");
  if (!buildUpload) {
    errors.push("workflow must define build-upload job");
  } else {
    pushMissing(
      errors,
      buildUpload,
      "if: startsWith(github.ref, 'refs/tags/v')",
      "build-upload must run only for v* tags",
    );
    if (!hasJobNeed(buildUpload, "release-boundary-gate")) {
      errors.push("build-upload must depend on release-boundary-gate");
    }
    const matrixRows = buildUploadMatrixRows(buildUpload);
    for (const matrixEntry of [
      ["ubuntu-24.04", "x86_64-unknown-linux-gnu", "_amd64.AppImage"],
      ["windows-2025", "x86_64-pc-windows-msvc", "_x64.msi"],
      ["macos-15", "aarch64-apple-darwin", "_aarch64.dmg"],
    ]) {
      if (!hasMatrixEntry(matrixRows, matrixEntry)) {
        errors.push(
          `build-upload matrix must include ${matrixEntry[0]} ${matrixEntry[1]} ${matrixEntry[2]}`,
        );
      }
    }
    pushMissing(
      errors,
      buildUpload,
      "pnpm tauri build --target ${{ matrix.target }}",
      "build-upload must build the matrix target explicitly",
    );
    for (const [envName, envAssignment] of [
      [
        "TAURI_SIGNING_PRIVATE_KEY",
        "TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}",
      ],
      [
        "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
        "TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}",
      ],
      [
        "APPIMAGE_EXTRACT_AND_RUN",
        "APPIMAGE_EXTRACT_AND_RUN: ${{ runner.os == 'Linux' && '1' || '' }}",
      ],
      ["NO_STRIP", "NO_STRIP: ${{ runner.os == 'Linux' && '1' || '' }}"],
    ]) {
      pushMissing(
        errors,
        buildUpload,
        envAssignment,
        `build-upload must preserve ${envName}`,
      );
    }
    if (buildUpload.includes("launcher/src-tauri/target/release/bundle/")) {
      errors.push(
        "build-upload artifact globs must not use unscoped target/release paths",
      );
    }
    for (const extension of [
      "AppImage",
      "deb",
      "rpm",
      "msi",
      "exe",
      "dmg",
      "app.tar.gz",
    ]) {
      pushMissing(
        errors,
        buildUpload,
        `launcher/src-tauri/target/\${{ matrix.target }}/release/bundle/**/*.${extension}`,
        `build-upload must upload target-scoped ${extension} bundles`,
      );
    }
  }

  const draftRelease = workflowJobBlock(workflow, "create-draft-release");
  if (!draftRelease) {
    errors.push("workflow must define create-draft-release job");
  } else {
    pushMissing(
      errors,
      draftRelease,
      "if: startsWith(github.ref, 'refs/tags/v')",
      "create-draft-release must run only for v* tags",
    );
    pushMissing(
      errors,
      draftRelease,
      "needs: [build-upload]",
      "create-draft-release must wait for build-upload",
    );
    pushMissing(
      errors,
      draftRelease,
      "softprops/action-gh-release",
      "create-draft-release must use GitHub release action",
    );
    pushMissing(
      errors,
      draftRelease,
      "files: release-artifacts/**",
      "create-draft-release must publish downloaded artifacts only",
    );
    pushMissing(
      errors,
      draftRelease,
      "draft: true",
      "create-draft-release must create a draft release",
    );
  }

  return {
    errors,
    ok: errors.length === 0,
    path: releaseWorkflowRelativePath,
  };
}

export function assertReleaseWorkflow(options) {
  const report = releaseWorkflowReport(options);
  if (!report.ok) throw new Error(report.errors.join("; "));
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const report = assertReleaseWorkflow();
    console.log(`${report.path} preserves release workflow contract.`);
  } catch (error) {
    console.error(`Release workflow contract failed: ${error.message}`);
    process.exitCode = 1;
  }
}
