#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export function tauriDebugBundleArgs(platform = process.platform) {
  const args = [
    "--dir",
    "launcher",
    "tauri",
    "build",
    "--debug",
    "--ci",
    "--no-sign",
  ];

  if (platform === "linux") {
    args.push("--bundles", "deb");
  }

  args.push("--", "--locked");

  return args;
}

export function tauriDebugBundleEnv(
  env = process.env,
  platform = process.platform,
) {
  const next = { ...env };

  if (platform === "linux") {
    next.APPIMAGE_EXTRACT_AND_RUN ??= "1";
    next.NO_STRIP ??= "1";
  }

  return next;
}

export function tauriDebugBundleInvocation(
  platform = process.platform,
  env = process.env,
) {
  const args = tauriDebugBundleArgs(platform);
  if (platform === "win32") {
    return {
      args: ["/d", "/s", "/c", "pnpm", ...args],
      command: env.ComSpec ?? env.COMSPEC ?? "cmd.exe",
    };
  }

  return { args, command: "pnpm" };
}

export function runTauriDebugBundle({
  cwd = repoRoot,
  env = process.env,
  platform = process.platform,
  runCommand = spawnSync,
} = {}) {
  const invocation = tauriDebugBundleInvocation(platform, env);
  const result = runCommand(invocation.command, invocation.args, {
    cwd,
    env: tauriDebugBundleEnv(env, platform),
    stdio: "inherit",
  });

  if (result.error) {
    console.error(
      result.error instanceof Error ? result.error.message : result.error,
    );
    return 1;
  }

  return result.status ?? 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exit(runTauriDebugBundle());
}
