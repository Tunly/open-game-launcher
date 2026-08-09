#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
  let blockProperty = null;
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
      blockProperty = null;
      continue;
    }

    if (!currentRow) continue;

    if (blockProperty) {
      const blockValue = line.match(/^              (?<value>.*)$/)?.groups
        ?.value;
      if (blockValue !== undefined) {
        const value = blockValue.trim();
        if (value) currentRow[blockProperty].push(value);
        continue;
      }
      blockProperty = null;
    }

    const blockPropertyMatch = line.match(
      /^            (?<key>[A-Za-z0-9_-]+):\s*\|\s*$/,
    );
    if (blockPropertyMatch) {
      blockProperty = blockPropertyMatch.groups.key;
      currentRow[blockProperty] = [];
      continue;
    }

    const property = line.match(
      /^            (?<key>[A-Za-z0-9_-]+):\s*(?<value>.+)\s*$/,
    )?.groups;
    if (property) currentRow[property.key] = property.value.trim();
  }

  if (currentRow) rows.push(currentRow);
  return rows;
}

function findMatrixRow(rows, { os, target, artifactSuffix }) {
  return rows.find(
    (row) =>
      row.os === os &&
      row.target === target &&
      row.artifact?.endsWith(artifactSuffix),
  );
}

function targetScopedBundlePattern(target, extension) {
  return `launcher/src-tauri/target/${target}/release/bundle/**/*.${extension}`;
}

const buildUploadArtifactContracts = [
  {
    os: "ubuntu-24.04",
    target: "x86_64-unknown-linux-gnu",
    artifactSuffix: "_amd64.AppImage",
    extensions: ["AppImage", "deb", "rpm"],
  },
  {
    os: "windows-2025",
    target: "x86_64-pc-windows-msvc",
    artifactSuffix: "_windows_x64",
    extensions: ["exe", "exe.sig"],
  },
  {
    os: "macos-15",
    target: "aarch64-apple-darwin",
    artifactSuffix: "_aarch64.dmg",
    extensions: ["dmg", "app.tar.gz"],
  },
];

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

function workflowStepBlocks(jobBlock) {
  return jobBlock
    .split(/(?=^      - )/m)
    .filter((block) => /^      - /.test(block));
}

function workflowStepWithRun(jobBlock, command) {
  const commandPattern = escapeRegex(command);
  const runLinePattern = new RegExp(
    `^        run:\\s*${commandPattern}\\s*(?:#.*)?$`,
    "m",
  );
  return (
    workflowStepBlocks(jobBlock).find((block) => runLinePattern.test(block)) ??
    ""
  );
}

function workflowStepWithName(jobBlock, name) {
  const namePattern = new RegExp(
    `^      - name:\\s*${escapeRegex(name)}\\s*(?:#.*)?$`,
    "m",
  );
  return workflowStepBlocks(jobBlock).find((block) => namePattern.test(block));
}

function workflowStepWithUse(jobBlock, actionPrefix) {
  const usePattern = new RegExp(
    `^        uses:\\s*${escapeRegex(actionPrefix)}`,
    "m",
  );
  return workflowStepBlocks(jobBlock).find((block) => usePattern.test(block));
}

function hasSecretEnvAssignment(stepBlock, secretName) {
  const expected = `${secretName}: \${{ secrets.${secretName} }}`;
  const envLinePattern = new RegExp(
    `^          ${escapeRegex(expected)}\\s*(?:#.*)?$`,
    "m",
  );
  return envLinePattern.test(stepBlock);
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
      "node --test scripts/generate-updater-manifest.test.mjs",
      "script validation must run updater manifest generator tests",
    );
    pushMissing(
      errors,
      scriptValidationJob,
      "node --test scripts/release-workflow-check.test.mjs",
      "script validation must run release workflow contract tests",
    );
    pushMissing(
      errors,
      scriptValidationJob,
      "node --test scripts/desktop-e2e-contract.test.mjs",
      "script validation must run desktop E2E contract tests",
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
    const externalGateStep = workflowStepWithRun(
      releaseBoundaryGate,
      "pnpm completion:gate:external",
    );
    for (const requiredNeed of [
      "desktop-e2e-windows",
      "frontend",
      "coverage",
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
    if (externalGateStep) {
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
        "STEAM_WEB_API_KEY",
        "PRESENCE_PROVIDER_TOKEN",
      ]) {
        if (!hasSecretEnvAssignment(externalGateStep, secretName)) {
          errors.push(
            `release-boundary-gate must pass ${secretName} from secrets`,
          );
        }
      }
    }
  }

  const desktopE2E = workflowJobBlock(workflow, "desktop-e2e-windows");
  if (!desktopE2E) {
    errors.push("workflow must define desktop-e2e-windows job");
  } else {
    for (const [requiredValue, message] of [
      [
        "runs-on: windows-2025",
        "desktop E2E must run on the pinned Windows runner",
      ],
      [
        "cargo install tauri-driver --version 2.0.6 --locked",
        "desktop E2E must install the pinned Tauri driver",
      ],
      [
        "--debug --no-bundle --target x86_64-pc-windows-msvc -- --locked",
        "desktop E2E must build the real Windows desktop binary",
      ],
      [
        "run: pnpm test:e2e:desktop",
        "desktop E2E must execute the UI to IPC smoke",
      ],
      [
        "OGL_E2E_APP_BINARY: src-tauri/target/x86_64-pc-windows-msvc/debug/open-game-launcher.exe",
        "desktop E2E must target the built launcher executable",
      ],
    ]) {
      pushMissing(errors, desktopE2E, requiredValue, message);
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
    if (!hasJobNeed(buildUpload, "coverage")) {
      errors.push("build-upload must depend on coverage");
    }
    if (!hasJobNeed(buildUpload, "desktop-e2e-windows")) {
      errors.push("build-upload must depend on desktop-e2e-windows");
    }
    const matrixRows = buildUploadMatrixRows(buildUpload);
    for (const contract of buildUploadArtifactContracts) {
      const matrixEntry = [
        contract.os,
        contract.target,
        contract.artifactSuffix,
      ];
      const row = findMatrixRow(matrixRows, contract);
      if (!row) {
        errors.push(
          `build-upload matrix must include ${matrixEntry[0]} ${matrixEntry[1]} ${matrixEntry[2]}`,
        );
        continue;
      }
      const artifacts = row.artifacts ?? [];
      for (const extension of contract.extensions) {
        const artifactPath = targetScopedBundlePattern(
          contract.target,
          extension,
        );
        if (!artifacts.includes(artifactPath)) {
          errors.push(
            `build-upload matrix must contract ${contract.os} ${contract.target} ${extension} artifact path`,
          );
        }
      }
    }
    pushMissing(
      errors,
      buildUpload,
      "node ./node_modules/@tauri-apps/cli/tauri.js build --target ${{ matrix.target }} ${{ matrix.tauri_config }} -- --locked",
      "build-upload must build the matrix target explicitly with Cargo.lock frozen",
    );
    const windowsRow = matrixRows.find(
      (row) =>
        row.os === "windows-2025" && row.target === "x86_64-pc-windows-msvc",
    );
    if (
      windowsRow &&
      windowsRow.tauri_config !== "--config src-tauri/tauri.windows.conf.json"
    ) {
      errors.push(
        "build-upload Windows row must merge tauri.windows.conf.json",
      );
    }
    for (const [envName, envAssignment] of [
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
    const tauriBuildStep = workflowStepWithName(buildUpload, "Build (Tauri)");
    if (!tauriBuildStep) {
      errors.push("build-upload must define the Tauri build step");
    } else {
      for (const secretName of [
        "TAURI_SIGNING_PRIVATE_KEY",
        "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
        "APPLE_CERTIFICATE",
        "APPLE_CERTIFICATE_PASSWORD",
        "APPLE_API_KEY",
        "APPLE_API_ISSUER",
      ]) {
        if (!hasSecretEnvAssignment(tauriBuildStep, secretName)) {
          errors.push(
            `build-upload Tauri build must pass ${secretName} from secrets`,
          );
        }
      }
    }
    if (buildUpload.includes("launcher/src-tauri/target/release/bundle/")) {
      errors.push(
        "build-upload artifact contract must not use unscoped target/release paths",
      );
    }
    const artifactInventoryStep = workflowStepWithName(
      buildUpload,
      "Validate release artifact inventory",
    );
    const uploadArtifactStep = workflowStepWithUse(
      buildUpload,
      "actions/upload-artifact@",
    );
    const signingSecretsStep = workflowStepWithName(
      buildUpload,
      "Validate Windows updater signing secrets",
    );
    if (!signingSecretsStep) {
      errors.push(
        "build-upload must fail early when Windows updater signing secrets are missing",
      );
    } else {
      for (const requiredValue of [
        "if: runner.os == 'Windows'",
        "TAURI_SIGNING_PRIVATE_KEY is required for Windows updater releases.",
        "TAURI_SIGNING_PRIVATE_KEY_PASSWORD is required for Windows updater releases.",
        "WINDOWS_CERTIFICATE is required for Windows Authenticode releases.",
        "WINDOWS_CERTIFICATE_PASSWORD is required for Windows Authenticode releases.",
        "WINDOWS_TIMESTAMP_URL is required for Windows Authenticode releases.",
      ]) {
        pushMissing(
          errors,
          signingSecretsStep,
          requiredValue,
          `build-upload signing secret validation must preserve ${requiredValue}`,
        );
      }
      for (const secretName of [
        "TAURI_SIGNING_PRIVATE_KEY",
        "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
        "WINDOWS_CERTIFICATE",
        "WINDOWS_CERTIFICATE_PASSWORD",
      ]) {
        if (!hasSecretEnvAssignment(signingSecretsStep, secretName)) {
          errors.push(
            `build-upload signing secret validation must pass ${secretName} from secrets`,
          );
        }
      }
    }
    const windowsCertificateStep = workflowStepWithName(
      buildUpload,
      "Import Windows Authenticode certificate",
    );
    if (!windowsCertificateStep) {
      errors.push(
        "build-upload must import the Windows Authenticode certificate",
      );
    } else {
      for (const requiredValue of [
        "certificateThumbprint",
        "digestAlgorithm",
        "timestampUrl",
      ]) {
        pushMissing(
          errors,
          windowsCertificateStep,
          requiredValue,
          `Windows Authenticode setup must configure ${requiredValue}`,
        );
      }
    }
    const macSigningStep = workflowStepWithName(
      buildUpload,
      "Validate macOS signing and notarization secrets",
    );
    if (!macSigningStep) {
      errors.push(
        "build-upload must validate macOS signing and notarization secrets",
      );
    } else {
      for (const secretName of [
        "APPLE_CERTIFICATE",
        "APPLE_CERTIFICATE_PASSWORD",
        "APPLE_API_KEY",
        "APPLE_API_ISSUER",
        "APPLE_API_PRIVATE_KEY",
      ]) {
        if (!hasSecretEnvAssignment(macSigningStep, secretName)) {
          errors.push(
            `macOS signing validation must pass ${secretName} from secrets`,
          );
        }
      }
      pushMissing(
        errors,
        macSigningStep,
        "APPLE_API_KEY_PATH=$key_path",
        "macOS signing validation must prepare the notarization private key",
      );
    }
    for (const stepName of [
      "Verify Windows Authenticode signatures",
      "Verify macOS code signing and notarization",
    ]) {
      if (!workflowStepWithName(buildUpload, stepName)) {
        errors.push(`build-upload must run ${stepName}`);
      }
    }
    if (!artifactInventoryStep) {
      errors.push("build-upload must validate release artifact inventory");
    } else {
      pushMissing(
        errors,
        artifactInventoryStep,
        "shopt -s globstar nullglob",
        "build-upload artifact inventory validation must enable recursive null globs",
      );
      pushMissing(
        errors,
        artifactInventoryStep,
        "No release artifact matched contract path",
        "build-upload artifact inventory validation must fail missing contract paths",
      );
      pushMissing(
        errors,
        artifactInventoryStep,
        "${{ matrix.artifacts }}",
        "build-upload artifact inventory validation must read matrix artifacts",
      );
    }
    if (!uploadArtifactStep) {
      errors.push("build-upload must upload release artifacts");
    } else {
      pushMissing(
        errors,
        uploadArtifactStep,
        "name: ${{ matrix.artifact }}",
        "build-upload artifact upload must use the matrix artifact name",
      );
      pushMissing(
        errors,
        uploadArtifactStep,
        "path: ${{ matrix.artifacts }}",
        "build-upload artifact upload must use the matrix artifact contract",
      );
      pushMissing(
        errors,
        uploadArtifactStep,
        "if-no-files-found: error",
        "build-upload artifact upload must fail when contract paths match no files",
      );
    }
    if (
      artifactInventoryStep &&
      uploadArtifactStep &&
      buildUpload.indexOf(artifactInventoryStep) >
        buildUpload.indexOf(uploadArtifactStep)
    ) {
      errors.push(
        "build-upload must validate release artifact inventory before upload",
      );
    }
  }

  const release = workflowJobBlock(workflow, "create-release");
  if (!release) {
    errors.push("workflow must define create-release job");
  } else {
    const checksumStep = workflowStepWithName(
      release,
      "Generate release artifact checksums",
    );
    const manifestStep = workflowStepWithName(
      release,
      "Generate signed updater manifest",
    );
    const releaseChannelStep = workflowStepWithName(
      release,
      "Determine release channel",
    );
    const createReleaseStep = workflowStepWithUse(
      release,
      "softprops/action-gh-release@",
    );

    pushMissing(
      errors,
      release,
      "if: startsWith(github.ref, 'refs/tags/v')",
      "create-release must run only for v* tags",
    );
    pushMissing(
      errors,
      release,
      "needs: [build-upload]",
      "create-release must wait for build-upload",
    );
    if (!manifestStep) {
      errors.push("create-release must generate signed latest.json");
    } else {
      for (const [value, message] of [
        [
          "node scripts/generate-updater-manifest.mjs",
          "create-release updater manifest must use the tested generator",
        ],
        [
          "--artifacts release-artifacts",
          "create-release updater manifest must scan downloaded artifacts",
        ],
        [
          "--output release-artifacts/latest.json",
          "create-release updater manifest must publish latest.json",
        ],
        [
          '--tag "$GITHUB_REF_NAME"',
          "create-release updater manifest must use the exact release tag",
        ],
        [
          '--repository "$GITHUB_REPOSITORY"',
          "create-release updater manifest must use the current GitHub repository",
        ],
      ]) {
        pushMissing(errors, manifestStep, value, message);
      }
    }
    if (!checksumStep) {
      errors.push("create-release must generate release artifact checksums");
    } else {
      pushMissing(
        errors,
        checksumStep,
        "find release-artifacts -type f ! -name SHA256SUMS.txt -print0",
        "create-release checksum step must hash downloaded artifacts",
      );
      pushMissing(
        errors,
        checksumStep,
        "sort -z",
        "create-release checksum step must sort artifacts deterministically",
      );
      pushMissing(
        errors,
        checksumStep,
        "sha256sum",
        "create-release checksum step must use sha256sum",
      );
      pushMissing(
        errors,
        checksumStep,
        "test -s",
        "create-release checksum step must fail empty checksum manifests",
      );
      pushMissing(
        errors,
        checksumStep,
        "release-artifacts/SHA256SUMS.txt",
        "create-release checksum step must publish SHA256SUMS.txt",
      );
    }
    if (!createReleaseStep) {
      errors.push("create-release must use GitHub release action");
    }
    pushMissing(
      errors,
      release,
      "files: release-artifacts/**",
      "create-release must publish downloaded artifacts only",
    );
    pushMissing(
      errors,
      release,
      "draft: false",
      "create-release must publish automatically after all release gates",
    );
    if (!releaseChannelStep) {
      errors.push(
        "create-release must determine stable versus prerelease tags",
      );
    } else {
      for (const [value, message] of [
        [
          'version_without_build="${version%%+*}"',
          "create-release channel detection must ignore build metadata",
        ],
        [
          'if [[ "$version_without_build" == *-* ]]',
          "create-release channel detection must recognize SemVer prereleases",
        ],
        [
          'echo "prerelease=true" >> "$GITHUB_OUTPUT"',
          "create-release channel detection must emit prerelease=true",
        ],
        [
          'echo "prerelease=false" >> "$GITHUB_OUTPUT"',
          "create-release channel detection must emit prerelease=false",
        ],
      ]) {
        pushMissing(errors, releaseChannelStep, value, message);
      }
    }
    pushMissing(
      errors,
      release,
      "prerelease: ${{ steps.release-channel.outputs.prerelease }}",
      "create-release must mark SemVer prereleases on GitHub",
    );
    pushMissing(
      errors,
      release,
      "make_latest: ${{ steps.release-channel.outputs.prerelease == 'false' }}",
      "create-release must make only stable releases latest",
    );
    if (
      manifestStep &&
      checksumStep &&
      release.indexOf(manifestStep) > release.indexOf(checksumStep)
    ) {
      errors.push("create-release must generate latest.json before checksums");
    }
    if (
      checksumStep &&
      createReleaseStep &&
      release.indexOf(checksumStep) > release.indexOf(createReleaseStep)
    ) {
      errors.push(
        "create-release must checksum artifacts before release upload",
      );
    }
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

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const report = assertReleaseWorkflow();
    console.log(`${report.path} preserves release workflow contract.`);
  } catch (error) {
    console.error(`Release workflow contract failed: ${error.message}`);
    process.exitCode = 1;
  }
}
