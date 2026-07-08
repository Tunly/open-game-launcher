#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const defaultLauncherRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export function huskyBinPath(launcherRoot = defaultLauncherRoot, platform = process.platform) {
  const executable = platform === "win32" ? "husky.cmd" : "husky";
  return join(launcherRoot, "node_modules", ".bin", executable);
}

export function runPrepareHusky({
  exists = existsSync,
  launcherRoot = defaultLauncherRoot,
  logger = console,
  platform = process.platform,
  runCommand = spawnSync,
} = {}) {
  const bin = huskyBinPath(launcherRoot, platform);
  if (!exists(bin)) {
    logger.log("Husky binary not present; skipping hook install.");
    return 0;
  }

  const result = runCommand(bin, [], {
    cwd: dirname(launcherRoot),
    ...(platform === "win32" ? { shell: true } : {}),
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runPrepareHusky();
}
