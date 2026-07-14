import assert from "node:assert/strict";
import test from "node:test";

import {
  parseGitStatus,
  releaseTrackedPathSpecs,
  releaseTrackingReport,
  renderReleaseTrackingReport,
} from "./release-tracking-check.mjs";

const specs = Object.freeze([
  { path: "package.json", type: "file" },
  { path: "scripts", type: "dir" },
  { path: "docs/verification/screenshots", type: "dir" },
]);

function exists(path) {
  return new Set([
    "package.json",
    "scripts",
    "docs/verification/screenshots",
  ]).has(path);
}

test("parseGitStatus extracts untracked and renamed paths", () => {
  assert.deepEqual(
    parseGitStatus(
      [
        " M package.json",
        "?? scripts/release-tracking-check.mjs",
        "R  old.png -> docs/verification/screenshots/new.png",
      ].join("\n"),
    ),
    [
      { code: " M", path: "package.json" },
      { code: "??", path: "scripts/release-tracking-check.mjs" },
      { code: "R ", path: "docs/verification/screenshots/new.png" },
    ],
  );
});

test("releaseTrackingReport passes when required files and directories are tracked", () => {
  const report = releaseTrackingReport({
    exists,
    specs,
    statusEntries: [],
    trackedFiles: [
      "package.json",
      "scripts/completion-gate.mjs",
      "docs/verification/screenshots/settings.png",
    ],
  });

  assert.equal(report.ready, true);
  assert.deepEqual(report.changedRequiredPaths, []);
  assert.deepEqual(report.untrackedRequiredPaths, []);
  assert.deepEqual(report.missingTrackedFiles, []);
  assert.deepEqual(report.emptyTrackedDirectories, []);
});

test("releaseTrackingReport rejects changed required artifacts", () => {
  const report = releaseTrackingReport({
    exists,
    specs,
    statusEntries: parseGitStatus(
      [
        " M package.json",
        "M  scripts/release-tracking-check.mjs",
        "D  docs/verification/screenshots/settings.png",
        " M scratch-notes.txt",
      ].join("\n"),
    ),
    trackedFiles: [
      "package.json",
      "scripts/release-tracking-check.mjs",
      "docs/verification/screenshots/settings.png",
    ],
  });

  assert.equal(report.ready, false);
  assert.deepEqual(report.changedRequiredPaths, [
    "docs/verification/screenshots/settings.png",
    "package.json",
    "scripts/release-tracking-check.mjs",
  ]);
  assert.deepEqual(report.changedRequiredRoots, [
    "docs/verification/screenshots",
    "package.json",
    "scripts",
  ]);
  assert.match(
    renderReleaseTrackingReport(report),
    /Changed required file examples/,
  );
  assert.doesNotMatch(
    renderReleaseTrackingReport(report),
    /scratch-notes\.txt/,
  );
});

test("releaseTrackingReport rejects untracked required artifacts", () => {
  const report = releaseTrackingReport({
    exists,
    specs,
    statusEntries: parseGitStatus(
      [
        "?? scripts/release-tracking-check.mjs",
        "?? docs/verification/screenshots/settings.png",
        "?? scratch-notes.txt",
      ].join("\n"),
    ),
    trackedFiles: ["package.json"],
  });

  assert.equal(report.ready, false);
  assert.deepEqual(report.untrackedRequiredRoots, [
    "docs/verification/screenshots",
    "scripts",
  ]);
  assert.deepEqual(report.emptyTrackedDirectories, [
    "scripts",
    "docs/verification/screenshots",
  ]);
  assert.doesNotMatch(
    renderReleaseTrackingReport(report),
    /scratch-notes\.txt/,
  );
});

test("releaseTrackingReport rejects missing paths and untracked required files", () => {
  const report = releaseTrackingReport({
    exists: (path) => path === "scripts",
    specs,
    statusEntries: [],
    trackedFiles: ["scripts/completion-gate.mjs"],
  });

  assert.equal(report.ready, false);
  assert.deepEqual(report.missingRequiredPaths, [
    "package.json",
    "docs/verification/screenshots",
  ]);
  assert.deepEqual(report.missingTrackedFiles, ["package.json"]);
  assert.deepEqual(report.emptyTrackedDirectories, [
    "docs/verification/screenshots",
  ]);
});

test("default release specs cover source and release-critical roots", () => {
  const requiredSpecs = [
    [".github", "dir"],
    ["deno.lock", "file"],
    ["launcher/.env.example", "file"],
    ["launcher/eslint.config.js", "file"],
    ["launcher/index.html", "file"],
    ["launcher/pnpm-lock.yaml", "file"],
    ["launcher/postcss.config.js", "file"],
    ["docs/verification/screenshot-manifest.json", "file"],
    ["launcher/src", "dir"],
    ["launcher/public", "dir"],
    ["launcher/src-tauri", "dir"],
    ["launcher/tailwind.config.ts", "file"],
    ["launcher/tsconfig.json", "file"],
    ["launcher/vite.config.ts", "file"],
    ["launcher/vitest.config.ts", "file"],
    ["supabase/functions", "dir"],
    ["supabase/migrations", "dir"],
    ["lint-staged.config.mjs", "file"],
  ];

  for (const [path, type] of requiredSpecs) {
    assert.deepEqual(
      releaseTrackedPathSpecs.find((spec) => spec.path === path),
      { path, type },
    );
  }
});
