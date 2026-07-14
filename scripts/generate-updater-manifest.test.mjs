import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
import { fileURLToPath } from "node:url";

import {
  createUpdaterManifest,
  generateUpdaterManifest,
} from "./generate-updater-manifest.mjs";

const scriptPath = fileURLToPath(
  new URL("./generate-updater-manifest.mjs", import.meta.url),
);

function fixture({ filename = "Open Game Launcher_1.2.3_x64-setup.exe" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "ogl-updater-manifest-"));
  const nested = join(root, "windows", "nsis");
  mkdirSync(nested, { recursive: true });
  const installer = join(nested, filename);
  writeFileSync(installer, "installer fixture");
  writeFileSync(`${installer}.sig`, "trusted-signature\n");
  return { installer, root };
}

test("creates a Tauri Windows x64 manifest from nested NSIS artifacts", () => {
  const { root } = fixture();

  assert.deepEqual(
    createUpdaterManifest({
      artifactsRoot: root,
      notes: "Security and launcher fixes.",
      pubDate: "2026-07-14T15:16:17+02:00",
      repository: "Tunly/open-game-launcher",
      tag: "v1.2.3",
    }),
    {
      version: "1.2.3",
      notes: "Security and launcher fixes.",
      pub_date: "2026-07-14T13:16:17.000Z",
      platforms: {
        "windows-x86_64": {
          signature: "trusted-signature",
          url: "https://github.com/Tunly/open-game-launcher/releases/download/v1.2.3/Open%20Game%20Launcher_1.2.3_x64-setup.exe",
        },
      },
    },
  );
});

test("writes latest.json with a default short release note", () => {
  const { root } = fixture();
  const output = join(root, "latest.json");

  generateUpdaterManifest({
    artifactsRoot: root,
    output,
    pubDate: "2026-07-14T12:00:00Z",
    repository: "Tunly/open-game-launcher",
    tag: "v1.2.3-beta.1",
  });

  assert.equal(
    JSON.parse(readFileSync(output, "utf8")).notes,
    "OG Launcher 1.2.3-beta.1",
  );
});

test("rejects missing and ambiguous NSIS installers", () => {
  const empty = mkdtempSync(join(tmpdir(), "ogl-updater-empty-"));
  assert.throws(
    () => createUpdaterManifest({ artifactsRoot: empty, tag: "v1.2.3" }),
    /exactly one Windows x64 NSIS.*found 0/,
  );

  const { root } = fixture();
  const second = join(root, "second_1.2.3_x64-setup.exe");
  writeFileSync(second, "second installer");
  writeFileSync(`${second}.sig`, "second-signature");
  assert.throws(
    () => createUpdaterManifest({ artifactsRoot: root, tag: "v1.2.3" }),
    /exactly one Windows x64 NSIS.*found 2/,
  );
});

test("rejects a missing, empty, or non-matching signature", () => {
  const missing = fixture();
  rmSync(`${missing.installer}.sig`);
  assert.throws(
    () => createUpdaterManifest({ artifactsRoot: missing.root, tag: "v1.2.3" }),
    /matching signature.*found 0/,
  );

  const empty = fixture();
  writeFileSync(`${empty.installer}.sig`, "");
  assert.throws(
    () => createUpdaterManifest({ artifactsRoot: empty.root, tag: "v1.2.3" }),
    /signature must not be empty/,
  );

  const mismatch = fixture();
  writeFileSync(
    join(mismatch.root, "other_1.2.3_x64-setup.exe.sig"),
    "unrelated-signature",
  );
  assert.throws(
    () =>
      createUpdaterManifest({ artifactsRoot: mismatch.root, tag: "v1.2.3" }),
    /exactly one Windows x64 NSIS signature, found 2/,
  );
});

test("rejects invalid tag, timestamp, and repository inputs", () => {
  const { root } = fixture();
  assert.throws(
    () => createUpdaterManifest({ artifactsRoot: root, tag: "latest" }),
    /release tag must match v<semver>/,
  );
  assert.throws(
    () =>
      createUpdaterManifest({
        artifactsRoot: root,
        pubDate: "yesterday",
        tag: "v1.2.3",
      }),
    /pub_date must be an RFC 3339 timestamp/,
  );
  assert.throws(
    () =>
      createUpdaterManifest({
        artifactsRoot: root,
        pubDate: "2026-07-14T12:00:00",
        tag: "v1.2.3",
      }),
    /pub_date must be an RFC 3339 timestamp/,
  );
  assert.throws(
    () =>
      createUpdaterManifest({
        artifactsRoot: root,
        repository: "not-a-repository",
        tag: "v1.2.3",
      }),
    /owner\/name pair/,
  );
});

test("CLI runs from any working directory", () => {
  const { root } = fixture();
  const output = join(root, "latest.json");
  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      "--artifacts",
      root,
      "--output",
      output,
      "--tag",
      "v1.2.3",
      "--repository",
      "Tunly/open-game-launcher",
      "--pub-date",
      "2026-07-14T12:00:00Z",
    ],
    { cwd: tmpdir(), encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /Wrote signed updater manifest/);
  assert.equal(JSON.parse(readFileSync(output, "utf8")).version, "1.2.3");
});
