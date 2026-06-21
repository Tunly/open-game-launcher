import assert from "node:assert/strict";
import test from "node:test";

import {
  tauriDebugBundleArgs,
  tauriDebugBundleEnv,
  runTauriDebugBundle,
} from "./tauri-debug-bundle.mjs";

test("tauri debug bundle uses a Linux deb smoke bundle", () => {
  assert.deepEqual(tauriDebugBundleArgs("linux"), [
    "--dir",
    "launcher",
    "tauri",
    "build",
    "--debug",
    "--ci",
    "--no-sign",
    "--bundles",
    "deb",
    "--",
    "--locked",
  ]);
});

test("tauri debug bundle uses generic current-platform args off Linux", () => {
  assert.deepEqual(tauriDebugBundleArgs("win32"), [
    "--dir",
    "launcher",
    "tauri",
    "build",
    "--debug",
    "--ci",
    "--no-sign",
    "--",
    "--locked",
  ]);
  assert.deepEqual(tauriDebugBundleArgs("darwin"), [
    "--dir",
    "launcher",
    "tauri",
    "build",
    "--debug",
    "--ci",
    "--no-sign",
    "--",
    "--locked",
  ]);
});

test("tauri debug bundle sets Linux packaging compatibility env defaults", () => {
  assert.deepEqual(
    tauriDebugBundleEnv({ KEEP: "yes" }, "linux"),
    {
      APPIMAGE_EXTRACT_AND_RUN: "1",
      KEEP: "yes",
      NO_STRIP: "1",
    },
  );
  assert.deepEqual(
    tauriDebugBundleEnv(
      { APPIMAGE_EXTRACT_AND_RUN: "custom", NO_STRIP: "custom" },
      "linux",
    ),
    {
      APPIMAGE_EXTRACT_AND_RUN: "custom",
      NO_STRIP: "custom",
    },
  );
  assert.deepEqual(tauriDebugBundleEnv({ KEEP: "yes" }, "win32"), {
    KEEP: "yes",
  });
});

test("runTauriDebugBundle delegates to pnpm and returns the command status", () => {
  const calls = [];
  const status = runTauriDebugBundle({
    cwd: "/repo",
    env: { KEEP: "yes" },
    platform: "linux",
    runCommand(command, args, options) {
      calls.push({ args, command, options });
      return { status: 0 };
    },
  });

  assert.equal(status, 0);
  assert.deepEqual(calls, [
    {
      args: tauriDebugBundleArgs("linux"),
      command: "pnpm",
      options: {
        cwd: "/repo",
        env: tauriDebugBundleEnv({ KEEP: "yes" }, "linux"),
        stdio: "inherit",
      },
    },
  ]);
});
