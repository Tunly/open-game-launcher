#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function redactSupabaseOutput(value = "") {
  return String(value)
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgresql://[redacted]")
    .replace(
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      "[redacted-jwt]",
    )
    .replace(/\bsbp_[A-Za-z0-9_-]+\b/g, "[redacted-supabase-token]")
    .replace(
      /^(\s*(?:anon key|service_role key|jwt secret|db url|api url|graphql url|s3 storage url|studio url):\s*)\S+.*$/gim,
      "$1[redacted]",
    );
}

export function supabaseArgs(args) {
  return ["--dir", "launcher", "exec", "supabase", ...args];
}

function exitCodeFor(result) {
  if (typeof result.status === "number") return result.status;
  return result.signal || result.error ? 1 : 0;
}

export function pnpmExecutable(platform = process.platform) {
  return platform === "win32" ? "pnpm.cmd" : "pnpm";
}

export function pnpmInvocation(
  args,
  { platform = process.platform, comspec = process.env.ComSpec } = {},
) {
  const executable = pnpmExecutable(platform);
  if (platform === "win32") {
    return {
      command: comspec || "cmd.exe",
      args: ["/d", "/s", "/c", executable, ...args],
    };
  }
  return { command: executable, args };
}

function writeRedacted(stream, value) {
  const redacted = redactSupabaseOutput(value);
  if (redacted) stream.write(redacted);
}

export function runSupabaseCommand(args, options = {}) {
  const {
    cwd = process.cwd(),
    platform = process.platform,
    print = true,
    runCommand = spawnSync,
    stderr = process.stderr,
    stdout = process.stdout,
  } = options;
  const invocation = pnpmInvocation(supabaseArgs(args), { platform });
  const result = runCommand(invocation.command, invocation.args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  if (print) {
    writeRedacted(stdout, result.stdout ?? "");
    writeRedacted(stderr, result.stderr ?? "");
  }
  return result;
}

export function runSupabaseDbLint(options = {}) {
  const { runCommand = spawnSync } = options;
  const run = (args, print = true) =>
    runSupabaseCommand(args, { ...options, print, runCommand });

  const statusResult = run(
    ["status", "--workdir", "..", "--output", "json"],
    false,
  );
  const wasAlreadyRunning = exitCodeFor(statusResult) === 0;

  if (!wasAlreadyRunning) {
    const startResult = run([
      "start",
      "--workdir",
      "..",
      "--exclude",
      "edge-runtime,gotrue,imgproxy,kong,logflare,mailpit,postgres-meta,postgrest,realtime,storage-api,studio,supavisor,vector",
    ]);
    const startExit = exitCodeFor(startResult);
    if (startExit !== 0) return startExit;
  }

  let exitCode = 0;
  try {
    const lintResult = run([
      "db",
      "lint",
      "--workdir",
      "..",
      "--local",
      "--fail-on",
      "error",
    ]);
    exitCode = exitCodeFor(lintResult);
  } finally {
    if (!wasAlreadyRunning) {
      const stopResult = run(["stop", "--workdir", ".."]);
      const stopExit = exitCodeFor(stopResult);
      if (exitCode === 0 && stopExit !== 0) exitCode = stopExit;
    }
  }

  return exitCode;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = runSupabaseDbLint();
}
