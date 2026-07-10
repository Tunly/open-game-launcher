#!/usr/bin/env node
import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export const denoVersion = "2.8.3";
export const denoNpmSpecifier = `deno@${denoVersion}`;

export function functionsRootFor(root = repoRoot) {
  return join(root, "supabase", "functions");
}

function collectFiles(
  dir,
  predicate,
  { root = repoRoot, readdir = readdirSync } = {},
  results = [],
) {
  for (const entry of readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(path, predicate, { root, readdir }, results);
    } else if (entry.isFile() && predicate(entry.name)) {
      results.push(relative(root, path).replaceAll("\\", "/"));
    }
  }
  return results;
}

export function collectTestFiles(dir, options = {}, results = []) {
  return collectFiles(
    dir,
    (name) => name.endsWith(".test.ts"),
    options,
    results,
  );
}

export function collectCheckFiles(dir, options = {}, results = []) {
  return collectFiles(
    dir,
    (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"),
    options,
    results,
  );
}

export function buildDenoArgs(testFiles) {
  return [
    "test",
    "--no-prompt",
    "--lock=deno.lock",
    "--frozen=true",
    "--node-modules-dir=auto",
    "--allow-env=SUPABASE_URL,SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,STRIPE_SECRET_KEY,OGL_LICENSE_SIGNING_KEY,OGL_LICENSE_ALLOW_UNSIGNED_FALLBACK",
    "--allow-read=supabase",
    ...testFiles,
  ];
}

export function buildDenoCheckArgs(checkFiles) {
  return [
    "check",
    "--lock=deno.lock",
    "--frozen=true",
    "--node-modules-dir=auto",
    ...checkFiles,
  ];
}

export function run(
  command,
  args,
  { cwd = repoRoot, env = process.env, stdio = "inherit" } = {},
) {
  const usesWindowsCmdShim =
    process.platform === "win32" &&
    ["npm", "npx", "pnpm", "yarn"].includes(command);
  const spawnCommand = usesWindowsCmdShim
    ? process.env.ComSpec || "cmd.exe"
    : command;
  const spawnArgs = usesWindowsCmdShim
    ? ["/d", "/s", "/c", command, ...args]
    : args;
  const options = {
    cwd,
    env,
    stdio,
  };
  if (stdio === "pipe") options.encoding = "utf8";
  return spawnSync(spawnCommand, spawnArgs, options);
}

function parseDenoVersion(output) {
  return output.match(/^deno\s+([0-9]+\.[0-9]+\.[0-9]+)/im)?.[1] ?? null;
}

function runDenoWithFallback(args, { env, logger, root, runCommand }) {
  const versionCheck = runCommand("deno", ["--version"], {
    cwd: root,
    env,
    stdio: "pipe",
  });
  if (!versionCheck.error) {
    if ((versionCheck.status ?? 1) !== 0) return versionCheck.status ?? 1;
    const version = parseDenoVersion(
      `${versionCheck.stdout ?? ""}\n${versionCheck.stderr ?? ""}`,
    );
    if (version !== denoVersion) {
      logger.error(
        `Expected Deno ${denoVersion}; found ${version ?? "unknown"}.`,
      );
      return 1;
    }

    const direct = runCommand("deno", args, { cwd: root, env });
    if (direct.error) throw direct.error;
    return direct.status ?? 1;
  }
  if (versionCheck.error.code !== "ENOENT") {
    throw versionCheck.error;
  }

  const npx = runCommand("npx", ["--yes", denoNpmSpecifier, ...args], {
    cwd: root,
    env,
  });
  if (npx.error) throw npx.error;
  return npx.status ?? 1;
}

export function runSupabaseFunctionsTests({
  env = process.env,
  logger = console,
  readdir = readdirSync,
  root = repoRoot,
  runCommand = run,
  stat = statSync,
} = {}) {
  const functionsRoot = functionsRootFor(root);

  if (!stat(functionsRoot, { throwIfNoEntry: false })?.isDirectory()) {
    logger.error("supabase/functions directory not found.");
    return 1;
  }

  const testFiles = collectTestFiles(functionsRoot, { root, readdir }).sort();
  if (testFiles.length === 0) {
    logger.error("No Supabase Edge Function test files found.");
    return 1;
  }

  const denoArgs = buildDenoArgs(testFiles);

  logger.log(`Running ${testFiles.length} Supabase Edge Function test files.`);

  return runDenoWithFallback(denoArgs, { env, logger, root, runCommand });
}

export function runSupabaseFunctionsCheck({
  env = process.env,
  logger = console,
  readdir = readdirSync,
  root = repoRoot,
  runCommand = run,
  stat = statSync,
} = {}) {
  const functionsRoot = functionsRootFor(root);

  if (!stat(functionsRoot, { throwIfNoEntry: false })?.isDirectory()) {
    logger.error("supabase/functions directory not found.");
    return 1;
  }

  const checkFiles = collectCheckFiles(functionsRoot, { root, readdir }).sort();
  if (checkFiles.length === 0) {
    logger.error("No Supabase Edge Function source files found.");
    return 1;
  }

  const denoArgs = buildDenoCheckArgs(checkFiles);

  logger.log(
    `Running Deno check for ${checkFiles.length} Supabase Edge Function files.`,
  );

  return runDenoWithFallback(denoArgs, { env, logger, root, runCommand });
}

export function main(argv = process.argv.slice(2)) {
  const action = argv.find((arg) => !arg.startsWith("-")) ?? "test";
  if (action === "check") return runSupabaseFunctionsCheck();
  if (action === "test") return runSupabaseFunctionsTests();
  throw new Error('Unknown Supabase functions action. Use "test" or "check".');
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
