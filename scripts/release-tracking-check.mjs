#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export const releaseTrackedPathSpecs = Object.freeze([
  { path: ".github", type: "dir" },
  { path: ".github/workflows/ci.yml", type: "file" },
  { path: ".node-version", type: "file" },
  { path: "deno.lock", type: "file" },
  { path: "package.json", type: "file" },
  { path: "launcher/.env.example", type: "file" },
  { path: "launcher/eslint.config.js", type: "file" },
  { path: "launcher/index.html", type: "file" },
  { path: "launcher/package.json", type: "file" },
  { path: "launcher/pnpm-lock.yaml", type: "file" },
  { path: "launcher/postcss.config.js", type: "file" },
  { path: "launcher/tailwind.config.ts", type: "file" },
  { path: "launcher/tsconfig.json", type: "file" },
  { path: "launcher/vite.config.ts", type: "file" },
  { path: "launcher/vitest.config.ts", type: "file" },
  { path: "lint-staged.config.mjs", type: "file" },
  { path: "rust-toolchain.toml", type: "file" },
  { path: "scripts", type: "dir" },
  { path: "docs/runbooks", type: "dir" },
  { path: "docs/verification/README.md", type: "file" },
  { path: "docs/verification/screenshot-manifest.json", type: "file" },
  { path: "docs/verification/local-completion-audit.md", type: "file" },
  { path: "docs/verification/external", type: "dir" },
  { path: "docs/verification/screenshots", type: "dir" },
  { path: "launcher/src", type: "dir" },
  { path: "launcher/public", type: "dir" },
  {
    path: "launcher/src/lib/external-completion-evidence-summary.ts",
    type: "file",
  },
  { path: "launcher/src/lib/hosted-cron-evidence-summary.ts", type: "file" },
  {
    path: "launcher/src/components/settings/ExternalCompletionEvidenceSummaryPanel.tsx",
    type: "file",
  },
  {
    path: "launcher/src/components/settings/ExternalCompletionEvidenceSummaryPanel.test.tsx",
    type: "file",
  },
  {
    path: "launcher/src/components/settings/HostedCronEvidenceSummaryPanel.tsx",
    type: "file",
  },
  {
    path: "launcher/src/components/settings/HostedCronEvidenceSummaryPanel.test.tsx",
    type: "file",
  },
  { path: "launcher/src-tauri", type: "dir" },
  { path: "supabase/config.toml", type: "file" },
  { path: "supabase/functions", type: "dir" },
  { path: "supabase/migrations", type: "dir" },
]);

function normalizePath(path) {
  return String(path ?? "")
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "");
}

function statusPath(line) {
  const path = line.slice(3).trim();
  const renamedPath = path.includes(" -> ") ? path.split(" -> ").pop() : path;
  return normalizePath(renamedPath ?? path);
}

function pathMatchesSpec(path, spec) {
  const normalizedPath = normalizePath(path);
  const normalizedSpecPath = normalizePath(spec.path);
  if (spec.type === "file") return normalizedPath === normalizedSpecPath;
  return (
    normalizedPath === normalizedSpecPath ||
    normalizedPath.startsWith(`${normalizedSpecPath}/`)
  );
}

function pathIsInSpecs(path, specs) {
  return specs.some((spec) => pathMatchesSpec(path, spec));
}

function trackedFilesForSpec(trackedFiles, spec) {
  return trackedFiles.filter((file) => pathMatchesSpec(file, spec));
}

function statusPathsMatchingSpecs(statusEntries, specs, predicate) {
  return [
    ...new Set(
      statusEntries
        .filter(predicate)
        .map((entry) => entry.path)
        .filter((path) => pathIsInSpecs(path, specs)),
    ),
  ].sort();
}

function statusRootsForPaths(paths, specs) {
  return [
    ...new Set(
      paths
        .map((path) => specs.find((spec) => pathMatchesSpec(path, spec))?.path)
        .filter(Boolean),
    ),
  ].sort();
}

export function parseGitStatus(output) {
  return String(output ?? "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => ({
      code: line.slice(0, 2),
      path: statusPath(line),
    }));
}

export function releaseTrackingReport({
  exists = (path) => existsSync(join(repoRoot, path)),
  specs = releaseTrackedPathSpecs,
  statusEntries = [],
  trackedFiles = [],
} = {}) {
  const normalizedTrackedFiles = trackedFiles.map(normalizePath);
  const missingRequiredPaths = specs
    .filter((spec) => !exists(spec.path))
    .map((spec) => spec.path);
  const changedRequiredPathList = statusPathsMatchingSpecs(
    statusEntries,
    specs,
    (entry) => entry.code !== "??",
  );
  const untrackedRequiredPathList = statusPathsMatchingSpecs(
    statusEntries,
    specs,
    (entry) => entry.code === "??",
  );
  const changedRequiredRoots = statusRootsForPaths(
    changedRequiredPathList,
    specs,
  );
  const untrackedRequiredRoots = statusRootsForPaths(
    untrackedRequiredPathList,
    specs,
  );
  const missingTrackedFiles = specs
    .filter((spec) => spec.type === "file")
    .filter(
      (spec) => !normalizedTrackedFiles.includes(normalizePath(spec.path)),
    )
    .map((spec) => spec.path);
  const emptyTrackedDirectories = specs
    .filter((spec) => spec.type === "dir")
    .filter(
      (spec) => trackedFilesForSpec(normalizedTrackedFiles, spec).length === 0,
    )
    .map((spec) => spec.path);

  const ready =
    missingRequiredPaths.length === 0 &&
    changedRequiredPathList.length === 0 &&
    untrackedRequiredPathList.length === 0 &&
    missingTrackedFiles.length === 0 &&
    emptyTrackedDirectories.length === 0;

  return {
    changedRequiredPathCount: changedRequiredPathList.length,
    changedRequiredPaths: changedRequiredPathList,
    changedRequiredRoots,
    emptyTrackedDirectories,
    missingRequiredPaths,
    missingTrackedFiles,
    ready,
    requiredPathCount: specs.length,
    trackedFileCount: normalizedTrackedFiles.length,
    untrackedRequiredPathCount: untrackedRequiredPathList.length,
    untrackedRequiredPaths: untrackedRequiredPathList,
    untrackedRequiredRoots,
  };
}

function runGit(args, root = repoRoot) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    throw new Error(result.stderr?.trim() || `git ${args.join(" ")} failed.`);
  }
  return result.stdout;
}

export function releaseTrackingReportFromGit({
  root = repoRoot,
  specs = releaseTrackedPathSpecs,
} = {}) {
  const paths = specs.map((spec) => spec.path);
  const statusEntries = parseGitStatus(
    runGit(
      ["status", "--porcelain", "--untracked-files=all", "--", ...paths],
      root,
    ),
  );
  const trackedFiles = runGit(["ls-files", "--", ...paths], root)
    .split(/\r?\n/)
    .map(normalizePath)
    .filter(Boolean);

  return releaseTrackingReport({
    exists: (path) => existsSync(join(root, path)),
    specs,
    statusEntries,
    trackedFiles,
  });
}

function formatList(label, values, limit = 30) {
  if (values.length === 0) return [];
  const lines = [`${label}:`];
  for (const value of values.slice(0, limit)) lines.push(`- ${value}`);
  if (values.length > limit) lines.push(`- ... ${values.length - limit} more`);
  return lines;
}

export function renderReleaseTrackingReport(report) {
  const changedRequiredPaths = report.changedRequiredPaths ?? [];
  const changedRequiredRoots = report.changedRequiredRoots ?? [];
  const changedRequiredPathCount =
    report.changedRequiredPathCount ?? changedRequiredPaths.length;
  const lines = [
    "Release artifact tracking check",
    "",
    `Required path groups: ${report.requiredPathCount}`,
    `Tracked files in required groups: ${report.trackedFileCount}`,
    `Changed required files: ${changedRequiredPathCount}`,
    `Untracked required files: ${report.untrackedRequiredPathCount}`,
  ];
  if (report.ready) {
    lines.push("", "Release artifact tracking check passed.");
    return lines.join("\n");
  }
  lines.push("", "Release artifact tracking check failed:");
  lines.push(
    ...formatList("Missing required paths", report.missingRequiredPaths),
  );
  lines.push(
    ...formatList(
      "Required files missing from git ls-files",
      report.missingTrackedFiles,
    ),
  );
  lines.push(
    ...formatList(
      "Required directories with no tracked files",
      report.emptyTrackedDirectories,
    ),
  );
  lines.push(
    ...formatList("Changed required roots", changedRequiredRoots),
  );
  lines.push(
    ...formatList("Changed required file examples", changedRequiredPaths),
  );
  lines.push(
    ...formatList("Untracked required roots", report.untrackedRequiredRoots),
  );
  lines.push(
    ...formatList(
      "Untracked required file examples",
      report.untrackedRequiredPaths,
    ),
  );
  return lines.join("\n");
}

export function main() {
  const report = releaseTrackingReportFromGit();
  console.log(renderReleaseTrackingReport(report));
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
