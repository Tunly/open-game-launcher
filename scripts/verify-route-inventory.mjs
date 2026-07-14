#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export const legacyVerifyFlags = Object.freeze({
  "cross-store-save-sync-e2e-readiness": {
    canonical: "cross-store-save-sync",
    reason:
      "Retired composite readiness alias; current evidence covers the local copy planner only.",
  },
  "invite-hosted-ready": {
    canonical: null,
    reason:
      "Legacy test-only query flag that must not be treated as hosted proof.",
  },
  "plugin-system-native-disabled-registry-audit": {
    canonical: "plugin-disabled-registry-audit",
    reason:
      "Backward-compatible alias for the documented disabled-registry audit route.",
  },
  "public-profile-privacy-guard": {
    canonical: "profile-privacy-guard",
    reason:
      "Backward-compatible alias for the documented public profile privacy guard.",
  },
});

const sourceExtensions = new Set([".ts", ".tsx"]);
const verifyRegexes = [
  /verify(?:Mode|Param)?\s*={1,3}\s*["']([a-z0-9-]+)["']/g,
  /searchParams\.get\(["']verify["']\)\s*={1,3}\s*["']([a-z0-9-]+)["']/g,
  /verify=([A-Za-z0-9_-]+)/g,
  /verifyMode="([^"]+)"/g,
];
const verifyIdentifierRegexes = [
  /verify(?:Mode|Param)?\s*={1,3}\s*([A-Z][A-Z0-9_]*)\b/g,
  /searchParams\.get\(["']verify["']\)\s*={1,3}\s*([A-Z][A-Z0-9_]*)\b/g,
];
const verifyConstantRegex =
  /\b(?:export\s+)?const\s+([A-Z0-9_]*VERIFY[A-Z0-9_]*)\s*=\s*["']([a-z0-9-]+)["']/g;
const routerPathRegex = /\bpath\s*:\s*["']([^"']+)["']/g;
export const screenshotManifestRelativePath =
  "docs/verification/screenshot-manifest.json";
const pngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const pngHeaderByteLength = 33;
const minScreenshotByteLength = 1024;
const minScreenshotWidth = 200;
const minScreenshotHeight = 100;
const maxScreenshotDimension = 100_000;

function walkFiles(dir, results = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(path, results);
    } else if (entry.isFile()) {
      results.push(path);
    }
  }
  return results;
}

function addLocation(map, flag, location) {
  if (!map.has(flag)) map.set(flag, []);
  map.get(flag).push(location);
}

export function collectVerifyConstantsFromText(text, filePath = "inline") {
  const constants = new Map();
  const lines = String(text).split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    verifyConstantRegex.lastIndex = 0;
    for (const match of line.matchAll(verifyConstantRegex)) {
      constants.set(match[1], {
        flag: match[2],
        location: `${filePath}:${index + 1}`,
      });
    }
  }
  return constants;
}

export function collectVerifyFlagsFromText(
  text,
  filePath = "inline",
  constants = collectVerifyConstantsFromText(text, filePath),
) {
  const flags = new Map();
  const lines = String(text).split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    for (const regex of verifyRegexes) {
      regex.lastIndex = 0;
      for (const match of line.matchAll(regex)) {
        addLocation(flags, match[1], `${filePath}:${index + 1}`);
      }
    }
    for (const regex of verifyIdentifierRegexes) {
      regex.lastIndex = 0;
      for (const match of line.matchAll(regex)) {
        const constant = constants.get(match[1]);
        if (constant) {
          addLocation(flags, constant.flag, `${filePath}:${index + 1}`);
        }
      }
    }
  }
  return flags;
}

export function mergeFlagMaps(target, source) {
  for (const [flag, locations] of source.entries()) {
    for (const location of locations) addLocation(target, flag, location);
  }
  return target;
}

export function isSourceInventoryFile(relativePath) {
  const normalizedPath = relativePath.replaceAll("\\", "/");
  const fileName = normalizedPath.split("/").pop() ?? normalizedPath;
  if (!sourceExtensions.has(extname(fileName))) return false;
  if (fileName.endsWith(".d.ts")) return false;
  if (/(^|\/)__tests__\//.test(normalizedPath)) return false;
  if (/(^|\/)(test|tests)\//.test(normalizedPath)) return false;
  if (/\.(test|spec|story|stories)\.[cm]?[tj]sx?$/.test(fileName)) {
    return false;
  }
  return true;
}

export function collectSourceVerifyFlags(root = repoRoot) {
  const sourceRoot = join(root, "launcher", "src");
  const flags = new Map();
  const sourceFiles = walkFiles(sourceRoot)
    .map((filePath) => ({
      filePath,
      relativePath: relative(root, filePath).replaceAll("\\", "/"),
    }))
    .filter(({ relativePath }) => isSourceInventoryFile(relativePath));
  const constants = new Map();

  for (const { filePath, relativePath } of sourceFiles) {
    for (const [identifier, constant] of collectVerifyConstantsFromText(
      readFileSync(filePath, "utf8"),
      relativePath,
    ).entries()) {
      if (!constants.has(identifier)) constants.set(identifier, constant);
    }
  }

  for (const { filePath, relativePath } of sourceFiles) {
    mergeFlagMaps(
      flags,
      collectVerifyFlagsFromText(
        readFileSync(filePath, "utf8"),
        relativePath,
        constants,
      ),
    );
  }
  return new Map(
    [...flags.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function isIgnoredAppRoutePath(routePath) {
  return routePath === "/" || routePath === "*";
}

export function collectAppRoutePathsFromText(text, filePath = "inline") {
  const routePaths = new Map();
  const lines = String(text).split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    routerPathRegex.lastIndex = 0;
    for (const match of line.matchAll(routerPathRegex)) {
      const routePath = match[1];
      if (isIgnoredAppRoutePath(routePath)) continue;
      if (!routePaths.has(routePath)) routePaths.set(routePath, []);
      routePaths.get(routePath).push(`${filePath}:${index + 1}`);
    }
  }
  return new Map(
    [...routePaths.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

export function collectAppRoutePaths(root = repoRoot) {
  const routerPath = join(root, "launcher", "src", "app", "router.tsx");
  if (!statSync(routerPath, { throwIfNoEntry: false })?.isFile()) {
    return new Map();
  }
  return collectAppRoutePathsFromText(
    readFileSync(routerPath, "utf8"),
    relative(root, routerPath).replaceAll("\\", "/"),
  );
}

export function readScreenshotManifest(root = repoRoot) {
  const path = join(root, screenshotManifestRelativePath);
  const text = readFileSync(path, "utf8");
  return JSON.parse(text);
}

function manifestEntries(root = repoRoot) {
  const manifest = readScreenshotManifest(root);
  return Array.isArray(manifest.screenshots) ? manifest.screenshots : [];
}

function manifestEntryLocation(index) {
  return `${screenshotManifestRelativePath}:screenshots[${index}]`;
}

export function screenshotManifestErrors(root = repoRoot) {
  const path = join(root, screenshotManifestRelativePath);
  if (!statSync(path, { throwIfNoEntry: false })?.isFile()) {
    return [`Screenshot manifest missing: ${screenshotManifestRelativePath}`];
  }

  let manifest;
  try {
    manifest = readScreenshotManifest(root);
  } catch (error) {
    return [
      `Screenshot manifest is not valid JSON: ${error instanceof Error ? error.message : error}`,
    ];
  }

  const errors = [];
  if (manifest.version !== 1) {
    errors.push("Screenshot manifest version must be 1.");
  }
  if (
    typeof manifest.visualEvidence !== "string" ||
    !/OG-Launcher|Retro Manga/i.test(manifest.visualEvidence) ||
    !/overflow|responsive|wrapp/i.test(manifest.visualEvidence)
  ) {
    errors.push(
      "Screenshot manifest visualEvidence must describe OG-Launcher/Retro Manga styling and responsive overflow coverage.",
    );
  }
  if (
    !manifest.boundaries ||
    typeof manifest.boundaries !== "object" ||
    Array.isArray(manifest.boundaries)
  ) {
    errors.push("Screenshot manifest boundaries must be an object.");
  }
  if (!Array.isArray(manifest.screenshots)) {
    errors.push("Screenshot manifest screenshots must be an array.");
    return errors;
  }

  const seen = new Set();
  for (const [index, entry] of manifest.screenshots.entries()) {
    const location = manifestEntryLocation(index);
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`${location} must be an object.`);
      continue;
    }
    if (
      typeof entry.file !== "string" ||
      !/^screenshots\/[^/]+\.png$/.test(entry.file)
    ) {
      errors.push(`${location}.file must match screenshots/<name>.png.`);
    } else if (seen.has(entry.file)) {
      errors.push(`${location}.file duplicates '${entry.file}'.`);
    } else {
      seen.add(entry.file);
    }
    if (
      !Array.isArray(entry.routes) ||
      entry.routes.some(
        (route) => typeof route !== "string" || !route.startsWith("/"),
      )
    ) {
      errors.push(`${location}.routes must be an array of absolute routes.`);
    }
    if (
      !Array.isArray(entry.verify) ||
      entry.verify.some(
        (flag) => typeof flag !== "string" || !/^[a-z0-9-]+$/.test(flag),
      )
    ) {
      errors.push(`${location}.verify must be an array of verify flag names.`);
    }
    if (
      typeof entry.purpose !== "string" ||
      entry.purpose.trim().length < 8 ||
      !/\b(?:state|view|page|panel|modal|dialog|drawer|flow|mode|layout|screen|hud)\b/i.test(
        entry.purpose,
      )
    ) {
      errors.push(`${location}.purpose must name a concrete UI state.`);
    }
    if (
      typeof entry.boundary !== "string" ||
      typeof manifest.boundaries?.[entry.boundary] !== "string" ||
      !/\b(?:local|mock|fixture|browser|no-write|dry-run|staging|preflight|live|hosted|production|external)\b/i.test(
        manifest.boundaries?.[entry.boundary] ?? "",
      )
    ) {
      errors.push(
        `${location}.boundary must reference a boundary description with an explicit evidence scope.`,
      );
    }
  }
  return errors;
}

export function screenshotEntryDescription(manifest, entry) {
  return [
    ...(entry.routes ?? []),
    ...(entry.verify ?? []).map((flag) => `?verify=${flag}`),
    entry.purpose,
    manifest.boundaries?.[entry.boundary],
    manifest.visualEvidence,
  ]
    .filter(Boolean)
    .join("; ");
}

export function documentedVerifyFlags(root = repoRoot) {
  return new Set(manifestEntries(root).flatMap((entry) => entry.verify ?? []));
}

function resolveScreenshotArtifact(root, artifactPath) {
  if (artifactPath.startsWith("docs/verification/")) {
    return join(root, artifactPath);
  }
  return join(root, "docs", "verification", artifactPath);
}

function normalizeDocumentedRoutePath(routePath) {
  const pathOnly = routePath.split(/[?#]/, 1)[0];
  if (
    pathOnly.length === 0 ||
    pathOnly === "/" ||
    pathOnly === "*" ||
    pathOnly.includes(":") ||
    pathOnly.includes("*")
  ) {
    return null;
  }
  return pathOnly.length > 1 ? pathOnly.replace(/\/+$/, "") : pathOnly;
}

function routePathToRegex(routePath) {
  const escapedSegments = routePath
    .split("/")
    .filter(Boolean)
    .map((segment) =>
      segment.startsWith(":")
        ? "[^/]+"
        : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    );
  return new RegExp(`^/${escapedSegments.join("/")}$`);
}

function documentedRouteMatchesAppRoute(documentedRoutePath, appRoutePath) {
  const normalizedRoutePath =
    appRoutePath.length > 1 ? appRoutePath.replace(/\/+$/, "") : appRoutePath;
  if (normalizedRoutePath.includes(":")) {
    return routePathToRegex(normalizedRoutePath).test(documentedRoutePath);
  }
  return documentedRoutePath === normalizedRoutePath;
}

export function documentedScreenshotArtifacts(root = repoRoot) {
  const artifacts = new Map();
  for (const [index, entry] of manifestEntries(root).entries()) {
    if (typeof entry.file !== "string") continue;
    if (!artifacts.has(entry.file)) artifacts.set(entry.file, []);
    artifacts.get(entry.file).push(manifestEntryLocation(index));
  }
  return artifacts;
}

export function documentedAppRouteScreenshotArtifacts(
  root = repoRoot,
  appRoutePaths = collectAppRoutePaths(root),
) {
  const artifacts = new Map();
  for (const [index, entry] of manifestEntries(root).entries()) {
    if (typeof entry.file !== "string") continue;
    const documentedRoutes = (entry.routes ?? [])
      .map(normalizeDocumentedRoutePath)
      .filter((routePath) => routePath !== null);
    if (documentedRoutes.length === 0) continue;

    for (const [appRoutePath] of appRoutePaths.entries()) {
      const matchingRoute = documentedRoutes.find((documentedRoutePath) =>
        documentedRouteMatchesAppRoute(documentedRoutePath, appRoutePath),
      );
      if (!matchingRoute) continue;

      if (!artifacts.has(appRoutePath)) artifacts.set(appRoutePath, []);
      const resolvedPath = resolveScreenshotArtifact(root, entry.file);
      artifacts.get(appRoutePath).push({
        artifactPath: entry.file,
        documentedRoutePath: matchingRoute,
        exists: statSync(resolvedPath, { throwIfNoEntry: false })?.isFile() ?? false,
        location: manifestEntryLocation(index),
      });
    }
  }

  return artifacts;
}

export function existingScreenshotArtifacts(root = repoRoot) {
  const screenshotRoot = join(root, "docs", "verification", "screenshots");
  if (!statSync(screenshotRoot, { throwIfNoEntry: false })?.isDirectory()) {
    return new Set();
  }
  return new Set(
    walkFiles(screenshotRoot)
      .filter((filePath) => extname(filePath) === ".png")
      .map((filePath) =>
        relative(join(root, "docs", "verification"), filePath).replaceAll(
          "\\",
          "/",
        ),
      )
      .sort(),
  );
}

export function inspectScreenshotArtifact(root, artifactPath) {
  const resolvedPath = resolveScreenshotArtifact(root, artifactPath);
  const stat = statSync(resolvedPath, { throwIfNoEntry: false });
  if (!stat?.isFile()) {
    return {
      exists: false,
      valid: false,
      error: "file is missing",
    };
  }
  if (stat.size === 0) {
    return {
      exists: true,
      size: stat.size,
      valid: false,
      error: "file is empty",
    };
  }

  const bytes = readFileSync(resolvedPath);
  if (bytes.length < pngHeaderByteLength) {
    return {
      exists: true,
      size: stat.size,
      valid: false,
      error: "PNG header is truncated",
    };
  }
  if (!bytes.subarray(0, pngSignature.length).equals(pngSignature)) {
    return {
      exists: true,
      size: stat.size,
      valid: false,
      error: "file does not start with a PNG signature",
    };
  }
  if (stat.size < minScreenshotByteLength) {
    return {
      exists: true,
      size: stat.size,
      valid: false,
      error: `PNG screenshot is too small to be a captured UI artifact (${stat.size} bytes; minimum ${minScreenshotByteLength})`,
    };
  }

  const ihdrLength = bytes.readUInt32BE(8);
  const ihdrType = bytes.subarray(12, 16).toString("ascii");
  if (ihdrLength !== 13 || ihdrType !== "IHDR") {
    return {
      exists: true,
      size: stat.size,
      valid: false,
      error: "PNG IHDR chunk is missing or malformed",
    };
  }

  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (
    width < minScreenshotWidth ||
    height < minScreenshotHeight ||
    width > maxScreenshotDimension ||
    height > maxScreenshotDimension
  ) {
    return {
      exists: true,
      height,
      size: stat.size,
      valid: false,
      width,
      error: `PNG dimensions are invalid (${width}x${height}; minimum ${minScreenshotWidth}x${minScreenshotHeight})`,
    };
  }

  let offset = pngSignature.length;
  let sawIhdr = false;
  let sawIend = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) {
      return {
        exists: true,
        height,
        size: stat.size,
        valid: false,
        width,
        error: "PNG chunk is truncated",
      };
    }
    const chunkLength = bytes.readUInt32BE(offset);
    const chunkType = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const nextOffset = offset + 12 + chunkLength;
    if (nextOffset > bytes.length) {
      return {
        exists: true,
        height,
        size: stat.size,
        valid: false,
        width,
        error: `PNG ${chunkType || "unknown"} chunk is truncated`,
      };
    }
    if (chunkType === "IHDR") sawIhdr = true;
    if (chunkType === "IEND") {
      sawIend = true;
      if (nextOffset !== bytes.length) {
        return {
          exists: true,
          height,
          size: stat.size,
          valid: false,
          width,
          error: "PNG has trailing data after IEND",
        };
      }
      break;
    }
    offset = nextOffset;
  }

  if (!sawIhdr || !sawIend) {
    return {
      exists: true,
      height,
      size: stat.size,
      valid: false,
      width,
      error: sawIhdr ? "PNG IEND chunk is missing" : "PNG IHDR chunk is missing",
    };
  }

  return {
    exists: true,
    height,
    size: stat.size,
    valid: true,
    width,
  };
}

export function screenshotArtifactIntegrity(root = repoRoot) {
  const artifacts = new Map();
  for (const artifactPath of existingScreenshotArtifacts(root)) {
    artifacts.set(artifactPath, inspectScreenshotArtifact(root, artifactPath));
  }
  return artifacts;
}

export function documentedVerifyScreenshotArtifacts(root = repoRoot) {
  const artifacts = new Map();
  for (const [index, entry] of manifestEntries(root).entries()) {
    if (typeof entry.file !== "string") continue;
    for (const flag of entry.verify ?? []) {
      if (!artifacts.has(flag)) artifacts.set(flag, []);
      const resolvedPath = resolveScreenshotArtifact(root, entry.file);
      artifacts.get(flag).push({
        artifactPath: entry.file,
        exists: statSync(resolvedPath, { throwIfNoEntry: false })?.isFile() ?? false,
        location: manifestEntryLocation(index),
      });
    }
  }
  return artifacts;
}

export function verifyRouteInventory(root = repoRoot) {
  const manifestPath = join(root, screenshotManifestRelativePath);
  const sourceRoot = join(root, "launcher", "src");
  const errors = [];

  if (!statSync(sourceRoot, { throwIfNoEntry: false })?.isDirectory()) {
    errors.push(`Source directory missing: ${relative(root, sourceRoot)}`);
    return {
      appRouteArtifacts: new Map(),
      appRoutePaths: new Map(),
      documentedFlags: new Set(),
      errors,
      sourceFlags: new Map(),
    };
  }
  if (!statSync(manifestPath, { throwIfNoEntry: false })?.isFile()) {
    errors.push(`Screenshot manifest missing: ${screenshotManifestRelativePath}`);
    return {
      appRouteArtifacts: new Map(),
      appRoutePaths: collectAppRoutePaths(root),
      documentedFlags: new Set(),
      errors,
      sourceFlags: collectSourceVerifyFlags(root),
    };
  }

  const manifestErrors = screenshotManifestErrors(root);
  errors.push(...manifestErrors);
  if (manifestErrors.some((error) => /not valid JSON|screenshots must/.test(error))) {
    return {
      appRouteArtifacts: new Map(),
      appRoutePaths: collectAppRoutePaths(root),
      documentedFlags: new Set(),
      errors,
      sourceFlags: collectSourceVerifyFlags(root),
    };
  }

  const sourceFlags = collectSourceVerifyFlags(root);
  const appRoutePaths = collectAppRoutePaths(root);
  const documentedFlags = documentedVerifyFlags(root);
  const documentedScreenshots = documentedScreenshotArtifacts(root);
  const existingScreenshots = existingScreenshotArtifacts(root);
  const screenshotIntegrity = screenshotArtifactIntegrity(root);
  const screenshotArtifacts = documentedVerifyScreenshotArtifacts(root);
  const appRouteArtifacts = documentedAppRouteScreenshotArtifacts(
    root,
    appRoutePaths,
  );

  for (const [artifactPath, locations] of documentedScreenshots.entries()) {
    if (!existingScreenshots.has(artifactPath)) {
      errors.push(
        `Screenshot manifest references missing artifact '${artifactPath}' at ${locations[0]}.`,
      );
    }
  }

  for (const artifactPath of existingScreenshots) {
    if (!documentedScreenshots.has(artifactPath)) {
      errors.push(
        `Screenshot artifact '${artifactPath}' exists but is missing from ${screenshotManifestRelativePath}.`,
      );
    }
    const integrity = screenshotIntegrity.get(artifactPath);
    if (integrity && !integrity.valid) {
      errors.push(
        `Screenshot artifact '${artifactPath}' is not a valid PNG screenshot: ${integrity.error}.`,
      );
    }
  }

  for (const [routePath, locations] of appRoutePaths.entries()) {
    if (!routePath.startsWith("/")) {
      errors.push(
        `App route path '${routePath}' must be absolute for static screenshot inventory, or the inventory parser must be extended to resolve relative child routes. First seen at ${locations[0]}.`,
      );
      continue;
    }

    const artifacts = appRouteArtifacts.get(routePath) ?? [];
    if (artifacts.length === 0) {
      errors.push(
        `App route '${routePath}' is missing from ${screenshotManifestRelativePath} as a concrete screenshot route. First seen at ${locations[0]}.`,
      );
      continue;
    }
    for (const artifact of artifacts) {
      if (!artifact.exists) {
        errors.push(
          `App route '${routePath}' references missing screenshot artifact '${artifact.artifactPath}' at ${artifact.location}.`,
        );
      }
    }
  }

  const activeDocumentedFlags = new Set();
  for (const flag of sourceFlags.keys()) {
    const legacy = legacyVerifyFlags[flag];
    if (legacy) {
      if (legacy.canonical) activeDocumentedFlags.add(legacy.canonical);
    } else {
      activeDocumentedFlags.add(flag);
    }
  }
  for (const flag of documentedFlags) {
    if (!activeDocumentedFlags.has(flag)) {
      errors.push(
        `Verify flag '${flag}' is documented in ${screenshotManifestRelativePath} but is not an active production source flag or canonical legacy route.`,
      );
    }
  }

  return {
    appRouteArtifacts,
    appRoutePaths,
    documentedFlags,
    documentedScreenshots,
    errors,
    existingScreenshots,
    screenshotIntegrity,
    screenshotArtifacts,
    sourceFlags,
  };
}

export function inventorySummary({
  appRouteArtifacts = new Map(),
  appRoutePaths = new Map(),
  documentedScreenshots,
  existingScreenshots,
  screenshotArtifacts,
  screenshotIntegrity,
  sourceFlags,
}) {
  const legacyAliasCount = [...sourceFlags.keys()].filter(
    (flag) => legacyVerifyFlags[flag],
  ).length;
  const lines = [
    `Discovered ${sourceFlags.size} verify route flags in launcher/src.`,
    `Verified screenshot artifact coverage for ${screenshotArtifacts.size} documented verify route flags.`,
  ];
  if (appRoutePaths.size > 0) {
    lines.push(
      `Discovered ${appRoutePaths.size} normal app route paths in launcher/src/app/router.tsx.`,
      `Verified screenshot artifact coverage for ${appRouteArtifacts.size} normal app route paths.`,
    );
  }
  if (legacyAliasCount > 0) {
    lines.push(
      `Recognized ${legacyAliasCount} legacy verify route aliases.`,
    );
  }
  lines.push(
    `Verified ${documentedScreenshots.size} documented screenshot artifacts against ${existingScreenshots.size} files.`,
    `Verified ${screenshotIntegrity.size} PNG screenshot artifacts with complete chunk structure.`,
  );
  return lines;
}

export function main() {
  const {
    documentedScreenshots,
    errors,
    existingScreenshots,
    appRouteArtifacts,
    appRoutePaths,
    screenshotIntegrity,
    screenshotArtifacts,
    sourceFlags,
  } = verifyRouteInventory();
  for (const line of inventorySummary({
    appRouteArtifacts,
    appRoutePaths,
    documentedScreenshots,
    existingScreenshots,
    screenshotArtifacts,
    screenshotIntegrity,
    sourceFlags,
  })) {
    console.log(line);
  }
  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    return 1;
  }
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exit(main());
}
