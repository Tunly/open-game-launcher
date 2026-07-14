#!/usr/bin/env node
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { releaseVersionFromTag } from "./release-tag-check.mjs";

export const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export const defaultRepository = "Tunly/open-game-launcher";

function walkFiles(root) {
  const files = [];

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}

function updaterArtifactInventory(artifactsRoot) {
  const root = resolve(artifactsRoot);
  if (!statSync(root).isDirectory()) {
    throw new Error(`artifact root is not a directory: ${root}`);
  }

  const files = walkFiles(root);
  const installers = files.filter((file) => /_x64-setup\.exe$/i.test(file));
  if (installers.length !== 1) {
    throw new Error(
      `expected exactly one Windows x64 NSIS *_x64-setup.exe artifact, found ${installers.length}`,
    );
  }

  const installer = installers[0];
  const signatures = files.filter(
    (file) => file.toLowerCase() === `${installer}.sig`.toLowerCase(),
  );
  if (signatures.length !== 1) {
    throw new Error(
      `expected exactly one matching signature ${basename(installer)}.sig, found ${signatures.length}`,
    );
  }

  const updaterSignatures = files.filter((file) =>
    /_x64-setup\.exe\.sig$/i.test(file),
  );
  if (updaterSignatures.length !== 1) {
    throw new Error(
      `expected exactly one Windows x64 NSIS signature, found ${updaterSignatures.length}`,
    );
  }

  const signature = readFileSync(signatures[0], "utf8").trim();
  if (!signature) throw new Error("updater signature must not be empty");

  return { installer, signature, signatureFile: signatures[0] };
}

function assertRfc3339(value) {
  const rfc3339Pattern =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  const timestamp = Date.parse(value);
  if (!rfc3339Pattern.test(value) || !Number.isFinite(timestamp)) {
    throw new Error(`pub_date must be an RFC 3339 timestamp: ${value}`);
  }
  return new Date(timestamp).toISOString();
}

function encodedReleaseAssetUrl({ filename, repository, tag }) {
  const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
  if (!repositoryPattern.test(repository)) {
    throw new Error(`repository must be an owner/name pair: ${repository}`);
  }

  return `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(filename)}`;
}

export function createUpdaterManifest({
  artifactsRoot,
  notes,
  pubDate = new Date().toISOString(),
  repository = defaultRepository,
  tag,
}) {
  const version = releaseVersionFromTag(tag);
  if (!version) throw new Error("release tag must match v<semver>");

  const { installer, signature } = updaterArtifactInventory(artifactsRoot);
  const filename = basename(installer);

  return {
    version,
    notes: String(notes ?? `OG Launcher ${version}`).trim(),
    pub_date: assertRfc3339(pubDate),
    platforms: {
      "windows-x86_64": {
        signature,
        url: encodedReleaseAssetUrl({ filename, repository, tag }),
      },
    },
  };
}

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) {
      throw new Error(`unexpected argument: ${argument}`);
    }
    const key = argument.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`missing value for --${key}`);
    }
    options[key] = value;
    index += 1;
  }
  return options;
}

export function generateUpdaterManifest({
  artifactsRoot,
  notes,
  output,
  pubDate,
  repository,
  tag,
}) {
  if (!artifactsRoot) throw new Error("--artifacts is required");
  if (!output) throw new Error("--output is required");
  if (!tag) throw new Error("--tag is required");

  const manifest = createUpdaterManifest({
    artifactsRoot,
    notes,
    pubDate,
    repository,
    tag,
  });
  writeFileSync(resolve(output), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const args = parseArguments(process.argv.slice(2));
    const output = args.output;
    generateUpdaterManifest({
      artifactsRoot: args.artifacts,
      notes: args.notes,
      output,
      pubDate: args["pub-date"],
      repository: args.repository ?? process.env.GITHUB_REPOSITORY,
      tag: args.tag ?? process.env.GITHUB_REF_NAME,
    });
    console.log(`Wrote signed updater manifest to ${resolve(output)}.`);
  } catch (error) {
    console.error(`Updater manifest generation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
