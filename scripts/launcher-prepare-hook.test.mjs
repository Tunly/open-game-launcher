import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  huskyBinPath,
  runPrepareHusky,
} from "../launcher/scripts/prepare-husky.mjs";

const launcherPackage = JSON.parse(
  readFileSync(new URL("../launcher/package.json", import.meta.url), "utf8"),
);

function tempRepo() {
  const root = mkdtempSync(join(tmpdir(), "ogl-prepare-husky-"));
  const launcherRoot = join(root, "launcher");
  mkdirSync(launcherRoot, { recursive: true });
  return {
    launcherRoot,
    root,
    cleanup: () => rmSync(root, { force: true, recursive: true }),
  };
}

test("launcher prepare script is a production-safe Node wrapper", () => {
  assert.equal(
    launcherPackage.scripts.prepare,
    "node scripts/prepare-husky.mjs",
  );
});

test("prepare hook skips cleanly when production installs omit husky", () => {
  const { cleanup, launcherRoot } = tempRepo();
  const calls = [];
  try {
    const status = runPrepareHusky({
      exists: () => false,
      launcherRoot,
      logger: { log() {} },
      runCommand(...args) {
        calls.push(args);
        return { status: 0 };
      },
    });

    assert.equal(status, 0);
    assert.deepEqual(calls, []);
  } finally {
    cleanup();
  }
});

test("prepare hook runs the local husky binary from the repo root when present", () => {
  const { cleanup, launcherRoot, root } = tempRepo();
  const calls = [];
  try {
    const bin = huskyBinPath(launcherRoot, "linux");
    mkdirSync(join(launcherRoot, "node_modules", ".bin"), { recursive: true });
    writeFileSync(bin, "");

    const status = runPrepareHusky({
      exists: (path) => path === bin,
      launcherRoot,
      logger: { log() {} },
      platform: "linux",
      runCommand(command, args, options) {
        calls.push({ args, command, options });
        return { status: 0 };
      },
    });

    assert.equal(status, 0);
    assert.deepEqual(calls, [
      {
        args: [],
        command: bin,
        options: { cwd: root, stdio: "inherit" },
      },
    ]);
  } finally {
    cleanup();
  }
});

test("prepare hook runs the Windows husky cmd shim through a shell", () => {
  const { cleanup, launcherRoot, root } = tempRepo();
  const calls = [];
  try {
    const bin = huskyBinPath(launcherRoot, "win32");
    mkdirSync(join(launcherRoot, "node_modules", ".bin"), { recursive: true });
    writeFileSync(bin, "");

    const status = runPrepareHusky({
      exists: (path) => path === bin,
      launcherRoot,
      logger: { log() {} },
      platform: "win32",
      runCommand(command, args, options) {
        calls.push({ args, command, options });
        return { status: 0 };
      },
    });

    assert.equal(status, 0);
    assert.deepEqual(calls, [
      {
        args: [],
        command: bin,
        options: { cwd: root, shell: true, stdio: "inherit" },
      },
    ]);
  } finally {
    cleanup();
  }
});
