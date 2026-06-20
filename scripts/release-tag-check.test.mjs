import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertReleaseTag,
  packageVersionFromCargoToml,
  releaseVersionFromTag,
  releaseVersionReport,
} from "./release-tag-check.mjs";

function writeVersionFixture(version) {
  const root = mkdtempSync(join(tmpdir(), "ogl-release-tag-"));
  mkdirSync(join(root, "launcher", "src-tauri"), { recursive: true });
  writeFileSync(
    join(root, "launcher", "package.json"),
    `${JSON.stringify({ version }, null, 2)}\n`,
  );
  writeFileSync(
    join(root, "launcher", "src-tauri", "tauri.conf.json"),
    `${JSON.stringify({ version }, null, 2)}\n`,
  );
  writeFileSync(
    join(root, "launcher", "src-tauri", "Cargo.toml"),
    `[package]\nname = "open-game-launcher"\nversion = "${version}"\n\n[dependencies]\n`,
  );
  return root;
}

test("releaseVersionFromTag accepts strict semver release tags", () => {
  assert.equal(releaseVersionFromTag("v0.1.0"), "0.1.0");
  assert.equal(releaseVersionFromTag("v1.2.3-beta.1"), "1.2.3-beta.1");
  assert.equal(releaseVersionFromTag("v1.2.3+build.5"), "1.2.3+build.5");
});

test("releaseVersionFromTag accepts non-numeric prerelease identifiers starting with digits", () => {
  assert.equal(releaseVersionFromTag("v1.2.3-1a"), "1.2.3-1a");
});

test("releaseVersionFromTag accepts build metadata numeric identifiers with leading zeroes", () => {
  assert.equal(releaseVersionFromTag("v1.2.3+01"), "1.2.3+01");
});

test("releaseVersionFromTag rejects loose v-prefix tags", () => {
  assert.equal(releaseVersionFromTag("vfoo"), null);
  assert.equal(releaseVersionFromTag("1.2.3"), null);
  assert.equal(releaseVersionFromTag("v01.2.3"), null);
  assert.equal(releaseVersionFromTag("v1.2.3-"), null);
  assert.equal(releaseVersionFromTag("v1.2.3-alpha..1"), null);
  assert.equal(releaseVersionFromTag("v1.2.3-01"), null);
});

test("packageVersionFromCargoToml reads the package version only", () => {
  assert.equal(
    packageVersionFromCargoToml(
      `[workspace]\nversion = "9.9.9"\n\n[package]\nname = "ogl"\nversion = "1.2.3"\n\n[dependencies]\nversion = "0.0.1"\n`,
    ),
    "1.2.3",
  );
});

test("release tag must match launcher and Tauri versions", () => {
  const root = writeVersionFixture("0.1.0");

  assert.deepEqual(releaseVersionReport({ root, tag: "v0.1.0" }).errors, []);
  assert.throws(
    () => assertReleaseTag({ root, tag: "v0.2.0" }),
    /launcher\/package\.json/,
  );
});

test("release tag must match Cargo package version", () => {
  const root = writeVersionFixture("0.1.0");
  writeFileSync(
    join(root, "launcher", "src-tauri", "Cargo.toml"),
    `[package]\nname = "open-game-launcher"\nversion = "0.2.0"\n`,
  );

  assert.deepEqual(releaseVersionReport({ root, tag: "v0.1.0" }).errors, [
    "release tag version must match launcher/src-tauri/Cargo.toml",
  ]);
});

test("release tag report names invalid tags without reading secrets", () => {
  const root = writeVersionFixture("0.1.0");
  const report = releaseVersionReport({ root, tag: "vfoo" });

  assert.equal(report.ok, false);
  assert.deepEqual(report.errors, ["release tag must match v<semver>"]);
});
