#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const semverPrereleaseIdentifier = String.raw`(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)`;
const semverPrereleaseDotIdentifiers = String.raw`${semverPrereleaseIdentifier}(?:\.${semverPrereleaseIdentifier})*`;
const semverBuildIdentifier = String.raw`[0-9A-Za-z-]+`;
const semverBuildDotIdentifiers = String.raw`${semverBuildIdentifier}(?:\.${semverBuildIdentifier})*`;
export const releaseTagPattern = new RegExp(
  String.raw`^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-${semverPrereleaseDotIdentifiers})?(?:\+${semverBuildDotIdentifiers})?$`,
);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function packageVersionFromCargoToml(content) {
  const lines = String(content ?? "").split(/\r?\n/);
  let inPackageSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const section = trimmed.match(/^\[([^\]]+)\]$/)?.[1];
    if (section) {
      inPackageSection = section === "package";
      continue;
    }
    if (!inPackageSection || trimmed.startsWith("#")) continue;

    const version = trimmed.match(/^version\s*=\s*"([^"]+)"\s*(?:#.*)?$/)?.[1];
    if (version) return version;
  }

  return "";
}

export function releaseVersionFromTag(tag) {
  const value = String(tag ?? "").trim();
  if (!releaseTagPattern.test(value)) {
    return null;
  }
  return value.slice(1);
}

export function releaseVersionReport({ root = repoRoot, tag } = {}) {
  const version = releaseVersionFromTag(tag);
  const packageVersion = readJson(
    join(root, "launcher", "package.json"),
  ).version;
  const tauriVersion = readJson(
    join(root, "launcher", "src-tauri", "tauri.conf.json"),
  ).version;
  const cargoVersion = packageVersionFromCargoToml(
    readFileSync(join(root, "launcher", "src-tauri", "Cargo.toml"), "utf8"),
  );
  const errors = [];

  if (!version) {
    errors.push("release tag must match v<semver>");
  }
  if (version && version !== packageVersion) {
    errors.push("release tag version must match launcher/package.json");
  }
  if (version && version !== tauriVersion) {
    errors.push(
      "release tag version must match launcher/src-tauri/tauri.conf.json",
    );
  }
  if (version && version !== cargoVersion) {
    errors.push("release tag version must match launcher/src-tauri/Cargo.toml");
  }

  return {
    cargoVersion,
    errors,
    ok: errors.length === 0,
    packageVersion,
    tag: String(tag ?? "").trim(),
    tauriVersion,
    version,
  };
}

export function assertReleaseTag(options) {
  const report = releaseVersionReport(options);
  if (!report.ok) {
    throw new Error(report.errors.join("; "));
  }
  return report;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
  try {
    const report = assertReleaseTag({ tag });
    console.log(
      `Release tag ${report.tag} matches launcher and Tauri version ${report.version}.`,
    );
  } catch (error) {
    console.error(`Release tag validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
