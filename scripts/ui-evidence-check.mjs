#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const uiSourcePattern =
  /^launcher\/src\/(?:.*\/)?[^/]+\.tsx$|^launcher\/src\/index\.css$|^launcher\/tailwind\.config\.ts$/;
const uiTsWatchlistPattern =
  /^launcher\/src\/(?:components\/layout\/navigation|lib\/(?:app-shell-skins|external-completion-evidence-summary|[^/]+-readiness))\.ts$/;
const ignoredSourcePattern =
  /(?:^|\/)__tests__\/|(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?[tj]sx?$|^launcher\/src\/(?:vite-env\.d\.ts|.*\.d\.ts|lib\/types(?:\.ts|\/.*\.ts))$/;
const screenshotPattern = /^docs\/verification\/screenshots\/[^/]+\.png$/;
const routeOrStatePattern =
  /`\/[^`]+`|\?verify=|\b(?:route|state|view|page|panel|modal|dialog|drawer|flow|mode)\b/i;
const evidenceBoundaryPattern =
  /\b(?:local|mock|fixture|browser|no-write|dry-run|staging|env-gated|live|hosted|production|external)\b|no[-\s](?:supabase|hosted|write|live)/i;
const retroOrOverflowPattern =
  /\b(?:OG-Launcher|Retro Manga|manga|paper|halftone|thick|border|shadow|overflow|wrapp|stacked|mobile)\b/i;

function normalizePath(path) {
  return path.replaceAll("\\", "/");
}

export function parseGitStatusPaths(output) {
  return String(output)
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const path = line.slice(3);
      const renamedPath = path.includes(" -> ")
        ? path.split(" -> ").pop()
        : path;
      return normalizePath(renamedPath ?? path);
    })
    .filter(Boolean);
}

export function parseGitDiffPaths(output) {
  return String(output)
    .split(/\r?\n/)
    .map((line) => normalizePath(line.trim()))
    .filter(Boolean);
}

export function parseArgs(argv = []) {
  const baseIndex = argv.indexOf("--base");
  const baseEqualsArg = argv.find((arg) => arg.startsWith("--base="));
  const base =
    baseIndex >= 0
      ? (argv[baseIndex + 1] ?? "")
      : baseEqualsArg
        ? baseEqualsArg.slice("--base=".length)
        : "";

  if (argv.includes("--help") || argv.includes("-h")) {
    return { base, help: true };
  }
  if (baseIndex >= 0 && !base) {
    throw new Error("Missing value for --base.");
  }
  return { base, help: false };
}

export function changedPathsFromGitStatus(root = repoRoot) {
  const result = spawnSync(
    "git",
    ["status", "--porcelain", "--untracked-files=all"],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    throw new Error("Unable to read git status for UI evidence check.");
  }
  return parseGitStatusPaths(result.stdout);
}

export function changedPathsFromGitDiff(base, root = repoRoot) {
  const result = spawnSync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMRTUXB", base],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    const details = result.stderr?.trim();
    throw new Error(
      `Unable to read git diff for UI evidence check${details ? `: ${details}` : "."}`,
    );
  }
  return parseGitDiffPaths(result.stdout);
}

export function changedPathsFromGit({ base = "", root = repoRoot } = {}) {
  return base
    ? changedPathsFromGitDiff(base, root)
    : changedPathsFromGitStatus(root);
}

function screenshotReadmeToken(screenshotPath) {
  return screenshotPath.replace(/^docs\/verification\//, "");
}

function readmeLineForScreenshot(readmeText, screenshotPath) {
  const token = screenshotReadmeToken(screenshotPath);
  return String(readmeText)
    .split(/\r?\n/)
    .find((line) => line.includes(token) || line.includes(screenshotPath));
}

function fileExists(root, path) {
  return (
    statSync(join(root, path), { throwIfNoEntry: false })?.isFile() ?? false
  );
}

function screenshotEntryFindings({ line, root, screenshotPath }) {
  const findings = [];
  if (!fileExists(root, screenshotPath)) {
    findings.push(
      `Screenshot artifact is listed as changed but missing: ${screenshotPath}.`,
    );
    return findings;
  }

  if (!line) {
    findings.push(
      `Screenshot artifact is missing a docs/verification/README.md entry: ${screenshotReadmeToken(
        screenshotPath,
      )}.`,
    );
    return findings;
  }

  if (!routeOrStatePattern.test(line)) {
    findings.push(
      `Screenshot README entry must name the route or UI state: ${screenshotReadmeToken(
        screenshotPath,
      )}.`,
    );
  }
  if (!evidenceBoundaryPattern.test(line)) {
    findings.push(
      `Screenshot README entry must state local/mock/env-gated/live evidence boundary: ${screenshotReadmeToken(
        screenshotPath,
      )}.`,
    );
  }
  if (!retroOrOverflowPattern.test(line)) {
    findings.push(
      `Screenshot README entry must mention Retro Manga/OG-Launcher styling or overflow/wrapping evidence: ${screenshotReadmeToken(
        screenshotPath,
      )}.`,
    );
  }
  return findings;
}

export function uiEvidenceReport({
  base = "",
  changedPaths,
  readmeText,
  root = repoRoot,
} = {}) {
  const paths = (changedPaths ?? changedPathsFromGit({ base, root })).map(
    normalizePath,
  );
  const uiChanges = paths.filter(
    (path) =>
      !ignoredSourcePattern.test(path) &&
      (uiSourcePattern.test(path) || uiTsWatchlistPattern.test(path)),
  );
  const screenshotChanges = paths.filter((path) =>
    screenshotPattern.test(path),
  );
  const readme =
    readmeText ??
    readFileSync(join(root, "docs", "verification", "README.md"), "utf8");
  const findings = [];

  if (uiChanges.length === 0) {
    return {
      completeScreenshotEntries: [],
      findings,
      ready: true,
      screenshotChanges,
      uiChanges,
    };
  }

  const screenshotReviews = screenshotChanges.map((screenshotPath) => ({
    findings: screenshotEntryFindings({
      line: readmeLineForScreenshot(readme, screenshotPath),
      root,
      screenshotPath,
    }),
    path: screenshotPath,
  }));
  const completeScreenshotEntries = screenshotReviews.filter(
    (review) => review.findings.length === 0,
  );

  if (screenshotChanges.length === 0) {
    findings.push(
      `UI changes detected (${uiChanges.join("; ")}) but no changed docs/verification/screenshots/*.png artifact is present.`,
    );
  }

  const incompleteScreenshotFindings = screenshotReviews.flatMap(
    (review) => review.findings,
  );

  if (screenshotChanges.length > 0 && incompleteScreenshotFindings.length > 0) {
    findings.push(
      "UI changes detected, but one or more changed screenshot artifacts have incomplete README entries with route/state, evidence boundary, and Retro Manga/overflow language.",
    );
    findings.push(...incompleteScreenshotFindings.slice(0, 20));
  }

  return {
    completeScreenshotEntries: completeScreenshotEntries.map(
      (review) => review.path,
    ),
    findings,
    ready: findings.length === 0,
    screenshotChanges,
    uiChanges,
  };
}

export function renderUiEvidenceReport(report) {
  const lines = [
    "UI verification evidence check",
    "",
    `UI source changes: ${report.uiChanges.length}`,
    `Screenshot artifact changes: ${report.screenshotChanges.length}`,
    `Complete screenshot README entries: ${report.completeScreenshotEntries.length}`,
  ];
  if (report.ready) {
    lines.push("", "UI evidence check passed.");
    return lines.join("\n");
  }
  lines.push("", "UI evidence check failed:");
  for (const finding of report.findings) lines.push(`- ${finding}`);
  return lines.join("\n");
}

export function renderHelp() {
  return [
    "UI verification evidence check",
    "",
    "Usage: node scripts/ui-evidence-check.mjs [--base <git-diff-range>]",
    "",
    "Without --base, the check reads the dirty working tree with git status.",
    "With --base, the check reads committed changes with git diff --name-only <range>.",
  ].join("\n");
}

export function main(argv = process.argv.slice(2)) {
  const { base, help } = parseArgs(argv);
  if (help) {
    console.log(renderHelp());
    return 0;
  }
  const report = uiEvidenceReport({ base });
  console.log(renderUiEvidenceReport(report));
  return report.ready ? 0 : 1;
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
