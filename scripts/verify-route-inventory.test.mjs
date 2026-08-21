import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  collectAppRoutePathsFromText,
  collectSourceVerifyFlags,
  collectVerifyFlagsFromText,
  documentedScreenshotArtifacts,
  documentedVerifyFlags,
  documentedVerifyScreenshotArtifacts,
  existingScreenshotArtifacts,
  inspectScreenshotArtifact,
  inventorySummary,
  legacyVerifyFlags,
  screenshotArtifactIntegrity,
  screenshotManifestErrors,
  verifyRouteInventory,
} from "./verify-route-inventory.mjs";

function pngChunk(type, data = Buffer.alloc(0)) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, 4, "ascii");
  return Buffer.concat([header, data, Buffer.alloc(4)]);
}

function pngFixture(width = 320, height = 180, { includeIend = true } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const chunks = [pngChunk("IHDR", ihdr), pngChunk("IDAT", Buffer.alloc(1024))];
  if (includeIend) chunks.push(pngChunk("IEND"));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ...chunks,
  ]);
}

const validPngFixture = pngFixture();

function tempRepo() {
  const root = mkdtempSync(join(tmpdir(), "ogl-verify-route-inventory-"));
  mkdirSync(join(root, "launcher", "src", "app"), { recursive: true });
  mkdirSync(join(root, "launcher", "src", "pages"), { recursive: true });
  mkdirSync(join(root, "docs", "verification"), { recursive: true });
  return {
    root,
    cleanup: () => rmSync(root, { force: true, recursive: true }),
  };
}

function writeFixture(root, source, docs, screenshotPaths = []) {
  writeFileSync(
    join(root, "launcher", "src", "pages", "ExamplePage.tsx"),
    source,
  );
  const screenshots = String(docs)
    .split(/\r?\n/)
    .map((line) => {
      const file = line.match(/`((?:docs\/verification\/)?screenshots\/[^`*]+\.png)`/)?.[1]
        ?.replace(/^docs\/verification\//, "");
      if (!file) return null;
      const routeTokens = [...line.matchAll(/`(\/[^`\s]+)`/g)].map(
        (match) => match[1],
      );
      return {
        file,
        routes: [
          ...new Set(
            routeTokens
              .map((route) => route.split(/[?#]/, 1)[0])
              .filter(Boolean),
          ),
        ],
        verify: [
          ...new Set(
            [...line.matchAll(/\?verify=([A-Za-z0-9_-]+)/g)].map(
              (match) => match[1],
            ),
          ),
        ],
        purpose: `${line.split(" - ").at(-1) ?? "fixture"} state`,
        boundary: "local",
      };
    })
    .filter(Boolean);
  writeFileSync(
    join(root, "docs", "verification", "screenshot-manifest.json"),
    JSON.stringify({
      version: 1,
      visualEvidence:
        "OG-Launcher Retro Manga styling and responsive overflow evidence",
      boundaries: { local: "Local verification; no hosted or live claim" },
      screenshots,
    }),
  );
  for (const screenshotPath of screenshotPaths) {
    const absolutePath = join(root, "docs", "verification", screenshotPath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, validPngFixture);
  }
}

function writeRouter(root, routePaths = []) {
  const routes = [
    '{ path: "/", element: <Navigate to="/library" replace /> }',
    ...routePaths.map(
      (routePath) => `{ path: "${routePath}", element: page(<ExamplePage />) }`,
    ),
    '{ path: "*", element: page(<NotFoundPage />) }',
  ];
  writeFileSync(
    join(root, "launcher", "src", "app", "router.tsx"),
    `export const router = createBrowserRouter([${routes.join(",")}]);`,
  );
}

function writeScreenshot(root, screenshotPath, bytes) {
  const absolutePath = join(root, "docs", "verification", screenshotPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, bytes);
}

test("collectVerifyFlagsFromText extracts route and branch literals", () => {
  const flags = collectVerifyFlagsFromText(`
    const verifyMode = searchParams.get("verify");
    const ready = verifyMode === "example-readiness";
    const alsoReady = searchParams.get("verify") === "activity-preview";
    renderRoute("/downloads?verify=example-readiness");
    renderWithLibrary(<GameDetailPanel verifyMode="backlog-priority" />);
  `);

  assert.deepEqual([...flags.keys()].sort(), [
    "activity-preview",
    "backlog-priority",
    "example-readiness",
  ]);
});

test("collectAppRoutePathsFromText extracts router paths", () => {
  const routePaths = collectAppRoutePathsFromText(
    `
      export const router = createBrowserRouter([
        { path: "/", element: <Navigate to="/library" replace /> },
        { path: "relative-child", element: page(<RelativePage />) },
        { path: "/library", element: page(<LibraryPage />) },
        { path: "/activity", element: page(<ActivityPage />) },
        { path: "/u/:username", element: page(<ProfilePage />) },
        { path: "*", element: page(<NotFoundPage />) },
      ]);
    `,
    "launcher/src/app/router.tsx",
  );

  assert.deepEqual(
    [...routePaths.keys()],
    ["/activity", "/library", "/u/:username", "relative-child"],
  );
  assert.deepEqual(routePaths.get("/library"), ["launcher/src/app/router.tsx:5"]);
});

test("verifyRouteInventory accepts documented verify routes", () => {
  const { root, cleanup } = tempRepo();
  try {
    writeFixture(
      root,
      'const isReady = searchParams.get("verify") === "example-readiness";',
      "- `screenshots/example-readiness-local.png` - `/downloads?verify=example-readiness` documented.",
      ["screenshots/example-readiness-local.png"],
    );

    assert.deepEqual(verifyRouteInventory(root).errors, []);
  } finally {
    cleanup();
  }
});

test("verifyRouteInventory rejects normal app routes without screenshot evidence", () => {
  const { root, cleanup } = tempRepo();
  try {
    writeRouter(root, ["/store", "/library"]);
    writeFixture(
      root,
      "",
      "- `screenshots/store-local.png` - `/store` documented.",
      ["screenshots/store-local.png"],
    );

    assert.match(
      verifyRouteInventory(root).errors.join("\n"),
      /App route '\/library'.*missing.*concrete screenshot route/,
    );
  } finally {
    cleanup();
  }
});

test("verifyRouteInventory accepts concrete dynamic route examples", () => {
  const { root, cleanup } = tempRepo();
  try {
    writeRouter(root, ["/invite/:token", "/u/:username"]);
    writeFixture(
      root,
      "",
      [
        "- `screenshots/invite-local.png` - `/invite/local-token` documented.",
        "- `screenshots/profile-local.png` - `/u/manga-rider` documented.",
      ].join("\n"),
      ["screenshots/invite-local.png", "screenshots/profile-local.png"],
    );

    const result = verifyRouteInventory(root);

    assert.deepEqual(result.errors, []);
    assert.deepEqual(
      [...result.appRouteArtifacts.keys()],
      ["/invite/:token", "/u/:username"],
    );
    assert.equal(
      result.appRouteArtifacts.get("/invite/:token")[0].documentedRoutePath,
      "/invite/local-token",
    );
  } finally {
    cleanup();
  }
});

test("verifyRouteInventory rejects relative app routes until parser support exists", () => {
  const { root, cleanup } = tempRepo();
  try {
    writeRouter(root, ["library"]);
    writeFixture(root, "", "");

    assert.match(
      verifyRouteInventory(root).errors.join("\n"),
      /App route path 'library' must be absolute/,
    );
  } finally {
    cleanup();
  }
});

test("verifyRouteInventory rejects dynamic placeholder route documentation", () => {
  const { root, cleanup } = tempRepo();
  try {
    writeRouter(root, ["/invite/:token"]);
    writeFixture(
      root,
      "",
      "- `screenshots/invite-placeholder.png` - `/invite/:token` documented.",
      ["screenshots/invite-placeholder.png"],
    );

    assert.match(
      verifyRouteInventory(root).errors.join("\n"),
      /App route '\/invite\/:token'.*missing.*concrete screenshot route/,
    );
  } finally {
    cleanup();
  }
});

test("collectSourceVerifyFlags ignores test files and resolves verify constants", () => {
  const { root, cleanup } = tempRepo();
  try {
    writeFixture(
      root,
      [
        'const PROVIDER_TELEMETRY_VERIFY_MODE = "example-readiness";',
        "const isProviderTelemetryVerify = verifyMode === PROVIDER_TELEMETRY_VERIFY_MODE;",
      ].join("\n"),
      "",
    );
    writeFileSync(
      join(root, "launcher", "src", "pages", "ExamplePage.test.tsx"),
      'renderRoute("/downloads?verify=test-only-readiness");',
    );

    const flags = collectSourceVerifyFlags(root);

    assert.deepEqual([...flags.keys()], ["example-readiness"]);
  } finally {
    cleanup();
  }
});

test("verifyRouteInventory allows active verify flags without permanent screenshots", () => {
  const { root, cleanup } = tempRepo();
  try {
    writeFixture(
      root,
      'const isReady = searchParams.get("verify") === "example-readiness";',
      "",
    );

    assert.deepEqual(verifyRouteInventory(root).errors, []);
  } finally {
    cleanup();
  }
});

test("verifyRouteInventory keeps screenshot evidence optional for documented flags", () => {
  const { root, cleanup } = tempRepo();
  try {
    writeFixture(
      root,
      'const isReady = searchParams.get("verify") === "example-readiness";',
      "",
    );

    const result = verifyRouteInventory(root);
    assert.equal(result.sourceFlags.has("example-readiness"), true);
    assert.equal(result.documentedFlags.has("example-readiness"), false);
    assert.deepEqual(result.errors, []);
  } finally {
    cleanup();
  }
});

test("verifyRouteInventory rejects documented verify routes that are not active source flags", () => {
  const { root, cleanup } = tempRepo();
  try {
    writeFixture(
      root,
      "",
      "- `screenshots/stale-route.png` - `/achievements?verify=stale-route` documented.",
      ["screenshots/stale-route.png"],
    );

    assert.match(
      verifyRouteInventory(root).errors.join("\n"),
      /stale-route.*not an active production source flag/,
    );
  } finally {
    cleanup();
  }
});

test("verifyRouteInventory rejects missing screenshot artifact files", () => {
  const { root, cleanup } = tempRepo();
  try {
    writeFixture(
      root,
      'const isReady = searchParams.get("verify") === "example-readiness";',
      "- `screenshots/example-readiness-local.png` - `/downloads?verify=example-readiness` documented.",
    );

    assert.match(
      verifyRouteInventory(root).errors.join("\n"),
      /references missing artifact.*example-readiness-local\.png/,
    );
  } finally {
    cleanup();
  }
});

test("verifyRouteInventory rejects documented screenshot artifacts that are missing", () => {
  const { root, cleanup } = tempRepo();
  try {
    writeFixture(
      root,
      "",
      "- `screenshots/missing-readiness.png` - documented screenshot.",
    );

    assert.match(
      verifyRouteInventory(root).errors[0],
      /Screenshot manifest references missing artifact 'screenshots\/missing-readiness\.png'/,
    );
  } finally {
    cleanup();
  }
});

test("verifyRouteInventory rejects screenshot files missing from the manifest", () => {
  const { root, cleanup } = tempRepo();
  try {
    writeFixture(root, "", "", ["screenshots/undocumented-readiness.png"]);

    assert.match(
      verifyRouteInventory(root).errors[0],
      /Screenshot artifact 'screenshots\/undocumented-readiness\.png' exists but is missing/,
    );
  } finally {
    cleanup();
  }
});

test("screenshotManifestErrors rejects weak evidence descriptions", () => {
  const { root, cleanup } = tempRepo();
  try {
    writeFixture(root, "", "");
    writeFileSync(
      join(root, "docs", "verification", "screenshot-manifest.json"),
      JSON.stringify({
        version: 1,
        visualEvidence: "generic screenshot",
        boundaries: { unknown: "unspecified" },
        screenshots: [
          {
            file: "screenshots/example.png",
            routes: ["relative"],
            verify: ["INVALID_FLAG"],
            purpose: "updated",
            boundary: "unknown",
          },
        ],
      }),
    );

    const errors = screenshotManifestErrors(root).join("\n");
    assert.match(errors, /visualEvidence.*OG-Launcher\/Retro Manga/);
    assert.match(errors, /routes must be an array of absolute routes/);
    assert.match(errors, /verify must be an array of verify flag names/);
    assert.match(errors, /purpose must name a concrete UI state/);
    assert.match(errors, /explicit evidence scope/);
  } finally {
    cleanup();
  }
});

test("inspectScreenshotArtifact reads valid PNG dimensions", () => {
  const { root, cleanup } = tempRepo();
  try {
    writeFixture(root, "", "", ["screenshots/valid-readiness.png"]);

    assert.deepEqual(
      inspectScreenshotArtifact(root, "screenshots/valid-readiness.png"),
      {
        exists: true,
        height: 180,
        size: validPngFixture.length,
        valid: true,
        width: 320,
      },
    );
  } finally {
    cleanup();
  }
});

test("verifyRouteInventory rejects invalid PNG screenshot artifacts", () => {
  const { root, cleanup } = tempRepo();
  try {
    writeFixture(
      root,
      'const isReady = searchParams.get("verify") === "example-readiness";',
      [
        "- `screenshots/empty.png` - `/downloads?verify=example-readiness` documented.",
        "- `screenshots/not-png.png` - documented screenshot.",
        "- `screenshots/tiny.png` - documented screenshot.",
        "- `screenshots/zero-width.png` - documented screenshot.",
        "- `screenshots/missing-iend.png` - documented screenshot.",
      ].join("\n"),
    );
    writeScreenshot(root, "screenshots/empty.png", "");
    writeScreenshot(root, "screenshots/not-png.png", Buffer.alloc(33, "x"));
    writeScreenshot(root, "screenshots/tiny.png", pngFixture(1, 1));
    writeScreenshot(root, "screenshots/zero-width.png", pngFixture(0, 180));
    writeScreenshot(
      root,
      "screenshots/missing-iend.png",
      pngFixture(320, 180, { includeIend: false }),
    );

    assert.match(
      verifyRouteInventory(root).errors.join("\n"),
      /empty\.png.*file is empty/,
    );
    assert.match(
      verifyRouteInventory(root).errors.join("\n"),
      /not-png\.png.*does not start with a PNG signature/,
    );
    assert.match(
      verifyRouteInventory(root).errors.join("\n"),
      /tiny\.png.*dimensions are invalid \(1x1; minimum 200x100\)/,
    );
    assert.match(
      verifyRouteInventory(root).errors.join("\n"),
      /zero-width\.png.*dimensions are invalid \(0x180; minimum 200x100\)/,
    );
    assert.match(
      verifyRouteInventory(root).errors.join("\n"),
      /missing-iend\.png.*PNG IEND chunk is missing/,
    );
  } finally {
    cleanup();
  }
});

test("verifyRouteInventory allows legacy aliases only when canonical route is documented", () => {
  const { root, cleanup } = tempRepo();
  try {
    writeFixture(
      root,
      [
        'const legacy = searchParams.get("verify") === "public-profile-privacy-guard";',
        'const nativeAlias = searchParams.get("verify") === "activity-preview";',
        'renderInviteRoute("/invite/local-token?verify=invite-hosted-ready");',
      ].join("\n"),
      [
        "- `screenshots/profile-privacy-guard-local.png` - `/u/localprivacy?verify=profile-privacy-guard` documented.",
        "- `screenshots/game-activity-dashboard-yearly-recap-local-preview.png` - `/activity/recap?verify=activity-preview` documented.",
      ].join("\n"),
      [
        "screenshots/profile-privacy-guard-local.png",
        "screenshots/game-activity-dashboard-yearly-recap-local-preview.png",
      ],
    );

    assert.deepEqual(verifyRouteInventory(root).errors, []);
  } finally {
    cleanup();
  }
});

test("current route inventory has curated visual coverage and explicit legacy aliases", () => {
  const result = verifyRouteInventory();

  assert.equal(result.sourceFlags.size, 18);
  assert.equal(result.appRoutePaths.size, 19);
  assert.equal(result.appRouteArtifacts.size, 19);
  assert.equal(result.appRoutePaths.has("/home"), false);
  assert.equal(result.appRoutePaths.has("/mods"), false);
  assert.equal(result.appRoutePaths.has("/library"), true);
  assert.deepEqual(result.errors, []);
  assert.equal(
    result.documentedScreenshots.size,
    result.existingScreenshots.size,
  );
  assert.ok(result.existingScreenshots.size >= 19);
  assert.ok(result.existingScreenshots.size <= 40);
  assert.equal(result.screenshotIntegrity.size, result.existingScreenshots.size);
  assert.equal(
    [...result.screenshotIntegrity.values()].every(
      (inspection) =>
        inspection.valid && inspection.width > 0 && inspection.height > 0,
    ),
    true,
  );
  assert.deepEqual(Object.keys(legacyVerifyFlags).sort(), [
    "cross-store-save-sync-e2e-readiness",
    "invite-hosted-ready",
    "public-profile-privacy-guard",
  ]);
  assert.equal(result.documentedFlags.has("remote-hydration"), false);
  assert.deepEqual(
    inventorySummary(result).filter((line) =>
      line.includes("normal app route paths"),
    ),
    [
      "Discovered 19 normal app route paths in launcher/src/app/router.tsx.",
      "Verified screenshot artifact coverage for 19 normal app route paths.",
    ],
  );
});

test("inventorySummary explains legacy alias route counts", () => {
  const { root, cleanup } = tempRepo();
  try {
    writeFixture(
      root,
      [
        'const canonical = searchParams.get("verify") === "profile-privacy-guard";',
        'const legacy = searchParams.get("verify") === "public-profile-privacy-guard";',
      ].join("\n"),
      "- `screenshots/profile-privacy-guard-local.png` - `/u/localprivacy?verify=profile-privacy-guard` documented.",
      ["screenshots/profile-privacy-guard-local.png"],
    );

    assert.deepEqual(inventorySummary(verifyRouteInventory(root)), [
      "Discovered 2 verify route flags in launcher/src.",
      "Verified screenshot artifact coverage for 1 documented verify route flags.",
      "Recognized 1 legacy verify route aliases.",
      "Verified 1 documented screenshot artifacts against 1 files.",
      "Verified 1 PNG screenshot artifacts with complete chunk structure.",
    ]);
  } finally {
    cleanup();
  }
});

test("documentedVerifyScreenshotArtifacts reads concrete route screenshot lines", () => {
  const { root, cleanup } = tempRepo();
  try {
    writeFixture(
      root,
      "",
      [
        "- Screenshot name contains example-readiness but no route.",
        "- `/downloads?verify=provider-telemetry-dry-run` documented without screenshot.",
        "- `screenshots/example-readiness-local.png` - `/downloads?verify=example-readiness` documented.",
      ].join("\n"),
      ["screenshots/example-readiness-local.png"],
    );

    const artifacts = documentedVerifyScreenshotArtifacts(root);
    assert.equal(artifacts.has("provider-telemetry-dry-run"), false);
    assert.deepEqual(artifacts.get("example-readiness"), [
      {
        artifactPath: "screenshots/example-readiness-local.png",
        exists: true,
        location:
          "docs/verification/screenshot-manifest.json:screenshots[0]",
      },
    ]);
  } finally {
    cleanup();
  }
});

test("documentedScreenshotArtifacts ignores wildcard examples and existingScreenshotArtifacts reads files", () => {
  const { root, cleanup } = tempRepo();
  try {
    writeFixture(
      root,
      "",
      [
        "- Store verification screenshots under `docs/verification/screenshots/*.png`.",
        "- `docs/verification/screenshots/example-readiness.png` - concrete screenshot.",
      ].join("\n"),
      ["screenshots/example-readiness.png"],
    );

    assert.deepEqual(
      [...documentedScreenshotArtifacts(root).keys()],
      ["screenshots/example-readiness.png"],
    );
    assert.deepEqual(
      [...existingScreenshotArtifacts(root)],
      ["screenshots/example-readiness.png"],
    );
    assert.deepEqual(
      [...screenshotArtifactIntegrity(root).keys()],
      ["screenshots/example-readiness.png"],
    );
  } finally {
    cleanup();
  }
});

test("documentedVerifyFlags reads concrete query routes only", () => {
  const { root, cleanup } = tempRepo();
  try {
    writeFixture(
      root,
      "",
      [
        "- Screenshot name contains example-readiness but no route.",
        "- `screenshots/provider-telemetry.png` - `/downloads?verify=provider-telemetry-dry-run` documented.",
      ].join("\n"),
      ["screenshots/provider-telemetry.png"],
    );

    assert.deepEqual([...documentedVerifyFlags(root)], ["provider-telemetry-dry-run"]);
  } finally {
    cleanup();
  }
});
