import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
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
  writeFileSync(join(root, "docs", "verification", "README.md"), docs);
  for (const screenshotPath of screenshotPaths) {
    const absolutePath = join(root, "docs", "verification", screenshotPath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, validPngFixture);
  }
}

function writeScreenshot(root, screenshotPath, bytes) {
  const absolutePath = join(root, "docs", "verification", screenshotPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, bytes);
}

test("collectVerifyFlagsFromText extracts route and branch literals", () => {
  const flags = collectVerifyFlagsFromText(`
    const verifyMode = searchParams.get("verify");
    const ready = verifyMode === "remote-play-local-proof";
    const alsoReady = searchParams.get("verify") === "hosted-cron-evidence-summary";
    renderRoute("/downloads?verify=mobile-app-readiness");
    renderWithLibrary(<GameDetailPanel verifyMode="backlog-priority" />);
  `);

  assert.deepEqual([...flags.keys()].sort(), [
    "backlog-priority",
    "hosted-cron-evidence-summary",
    "mobile-app-readiness",
    "remote-play-local-proof",
  ]);
});

test("verifyRouteInventory accepts documented verify routes", () => {
  const { root, cleanup } = tempRepo();
  try {
    writeFixture(
      root,
      'const isReady = searchParams.get("verify") === "mobile-app-readiness";',
      "- `screenshots/downloads-mobile-app-readiness-local.png` - `/downloads?verify=mobile-app-readiness` documented.",
      ["screenshots/downloads-mobile-app-readiness-local.png"],
    );

    assert.deepEqual(verifyRouteInventory(root).errors, []);
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
        'const REMOTE_HOSTED_RELAY_VERIFY_MODE = "remote-hosted-contract-ready";',
        "const isRemoteHostedVerify = verifyMode === REMOTE_HOSTED_RELAY_VERIFY_MODE;",
      ].join("\n"),
      "",
    );
    writeFileSync(
      join(root, "launcher", "src", "pages", "ExamplePage.test.tsx"),
      'renderRoute("/downloads?verify=test-only-readiness");',
    );

    const flags = collectSourceVerifyFlags(root);

    assert.deepEqual([...flags.keys()], ["remote-hosted-contract-ready"]);
  } finally {
    cleanup();
  }
});

test("verifyRouteInventory rejects undocumented verify routes", () => {
  const { root, cleanup } = tempRepo();
  try {
    writeFixture(
      root,
      'const isReady = searchParams.get("verify") === "mobile-app-readiness";',
      "- Downloads local readiness screenshot exists.",
    );

    assert.match(
      verifyRouteInventory(root).errors[0],
      /mobile-app-readiness.*missing.*\?verify=mobile-app-readiness/,
    );
  } finally {
    cleanup();
  }
});

test("verifyRouteInventory rejects routes without screenshot artifact lines", () => {
  const { root, cleanup } = tempRepo();
  try {
    writeFixture(
      root,
      'const isReady = searchParams.get("verify") === "mobile-app-readiness";',
      "- `/downloads?verify=mobile-app-readiness` documented.",
    );

    assert.match(
      verifyRouteInventory(root).errors[0],
      /mobile-app-readiness.*missing.*screenshot artifact line/,
    );
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
      'const isReady = searchParams.get("verify") === "mobile-app-readiness";',
      "- `screenshots/downloads-mobile-app-readiness-local.png` - `/downloads?verify=mobile-app-readiness` documented.",
    );

    assert.match(
      verifyRouteInventory(root).errors.join("\n"),
      /mobile-app-readiness.*missing screenshot artifact.*downloads-mobile-app-readiness-local\.png/,
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
      /README references missing screenshot artifact 'screenshots\/missing-readiness\.png'/,
    );
  } finally {
    cleanup();
  }
});

test("verifyRouteInventory rejects screenshot files missing from the README", () => {
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
      'const isReady = searchParams.get("verify") === "mobile-app-readiness";',
      [
        "- `screenshots/empty.png` - `/downloads?verify=mobile-app-readiness` documented.",
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
        'const nativeAlias = searchParams.get("verify") === "plugin-system-native-disabled-registry-audit";',
        'renderInviteRoute("/invite/local-token?verify=invite-hosted-ready");',
      ].join("\n"),
      [
        "- `screenshots/profile-privacy-guard-local.png` - `/u/localprivacy?verify=profile-privacy-guard` documented.",
        "- `screenshots/settings-plugin-disabled-registry-audit-local.png` - `/settings?verify=plugin-disabled-registry-audit` documented.",
      ].join("\n"),
      [
        "screenshots/profile-privacy-guard-local.png",
        "screenshots/settings-plugin-disabled-registry-audit-local.png",
      ],
    );

    assert.deepEqual(verifyRouteInventory(root).errors, []);
  } finally {
    cleanup();
  }
});

test("current verify route inventory is documented with explicit legacy aliases", () => {
  const result = verifyRouteInventory();

  assert.equal(result.sourceFlags.size, 70);
  assert.deepEqual(result.errors, []);
  assert.equal(
    result.documentedScreenshots.size,
    result.existingScreenshots.size,
  );
  assert.equal(result.existingScreenshots.size, 387);
  assert.equal(result.screenshotIntegrity.size, 387);
  assert.equal(
    [...result.screenshotIntegrity.values()].every(
      (inspection) =>
        inspection.valid && inspection.width > 0 && inspection.height > 0,
    ),
    true,
  );
  assert.equal(
    result.screenshotArtifacts.has("remote-companion-poll-redaction"),
    true,
  );
  assert.deepEqual(Object.keys(legacyVerifyFlags).sort(), [
    "invite-hosted-ready",
    "plugin-system-native-disabled-registry-audit",
    "public-profile-privacy-guard",
  ]);
  assert.equal(
    result.documentedFlags.has("remote-companion-poll-redaction"),
    true,
  );
  assert.equal(result.documentedFlags.has("remote-hydration"), false);
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
      "Recognized 1 legacy verify route aliases; aliases reuse canonical screenshot coverage.",
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
        "- Screenshot name contains mobile-app-readiness but no route.",
        "- `/downloads?verify=mobile-push-dry-run` documented without screenshot.",
        "- `screenshots/downloads-mobile-app-readiness-local.png` - `/downloads?verify=mobile-app-readiness` documented.",
      ].join("\n"),
      ["screenshots/downloads-mobile-app-readiness-local.png"],
    );

    const artifacts = documentedVerifyScreenshotArtifacts(root);
    assert.equal(artifacts.has("mobile-push-dry-run"), false);
    assert.deepEqual(artifacts.get("mobile-app-readiness"), [
      {
        artifactPath: "screenshots/downloads-mobile-app-readiness-local.png",
        exists: true,
        location: "docs/verification/README.md:3",
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
        "- `docs/verification/screenshots/mobile-app-readiness.png` - concrete screenshot.",
      ].join("\n"),
      ["screenshots/mobile-app-readiness.png"],
    );

    assert.deepEqual(
      [...documentedScreenshotArtifacts(root).keys()],
      ["screenshots/mobile-app-readiness.png"],
    );
    assert.deepEqual(
      [...existingScreenshotArtifacts(root)],
      ["screenshots/mobile-app-readiness.png"],
    );
    assert.deepEqual(
      [...screenshotArtifactIntegrity(root).keys()],
      ["screenshots/mobile-app-readiness.png"],
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
        "- Screenshot name contains mobile-app-readiness but no route.",
        "- `/downloads?verify=mobile-push-dry-run` documented.",
      ].join("\n"),
    );

    assert.deepEqual([...documentedVerifyFlags(root)], ["mobile-push-dry-run"]);
  } finally {
    cleanup();
  }
});
