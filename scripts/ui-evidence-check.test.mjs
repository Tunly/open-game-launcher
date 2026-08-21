import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  parseArgs,
  parseGitDiffPaths,
  parseGitStatusPaths,
  renderUiEvidenceReport,
  uiEvidenceReport as inspectUiEvidence,
} from "./ui-evidence-check.mjs";

function manifestFixture(rows = "") {
  const screenshots = String(rows)
    .split(/\r?\n/)
    .map((line) => {
      const file = line.match(/`(screenshots\/[^`]+\.png)`/)?.[1];
      if (!file) return null;
      const routeTokens = [...line.matchAll(/`(\/[^`\s]+)`/g)].map(
        (match) => match[1],
      );
      return {
        file,
        routes: routeTokens.map((route) => route.split(/[?#]/, 1)[0]),
        verify: [...line.matchAll(/\?verify=([A-Za-z0-9_-]+)/g)].map(
          (match) => match[1],
        ),
        purpose: line.split(" - ").at(-1) ?? "",
        boundary: "fixture",
      };
    })
    .filter(Boolean);
  return {
    version: 1,
    visualEvidence:
      "OG-Launcher Retro Manga styling and responsive overflow evidence",
    boundaries: {
      fixture: /\b(?:local|mock|browser|no-write|dry-run|staging|live|hosted|production|external)\b/i.test(
        rows,
      )
        ? "Local fixture; no hosted or live claim"
        : "unspecified",
    },
    screenshots,
  };
}

function uiEvidenceReport({ manifestRows = "", ...options } = {}) {
  return inspectUiEvidence({
    ...options,
    manifest: manifestFixture(manifestRows),
  });
}

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "ogl-ui-evidence-"));
  mkdirSync(join(root, "docs", "verification", "screenshots"), {
    recursive: true,
  });
  return root;
}

function writePngFixture(root, path = "docs/verification/screenshots/ui.png") {
  writeFileSync(
    join(root, path),
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(2048, 1),
    ]),
  );
}

test("parseGitStatusPaths extracts changed and untracked paths", () => {
  assert.deepEqual(
    parseGitStatusPaths(
      [
        " M launcher/src/pages/SettingsPage.tsx",
        "?? docs/verification/screenshots/settings.png",
        "R  old.png -> docs/verification/screenshots/new.png",
        " D docs/verification/screenshots/removed.png",
        "D  launcher/src/pages/RemovedPage.tsx",
      ].join("\n"),
    ),
    [
      "launcher/src/pages/SettingsPage.tsx",
      "docs/verification/screenshots/settings.png",
      "docs/verification/screenshots/new.png",
    ],
  );
});

test("parseGitStatusPaths ignores deleted UI sources and screenshot artifacts", () => {
  assert.deepEqual(
    parseGitStatusPaths(
      [
        " D launcher/src/pages/RemovedPage.tsx",
        "D  docs/verification/screenshots/removed.png",
        " M launcher/src/pages/LibraryPage.tsx",
      ].join("\n"),
    ),
    ["launcher/src/pages/LibraryPage.tsx"],
  );
});

test("parseGitDiffPaths extracts committed diff paths", () => {
  assert.deepEqual(
    parseGitDiffPaths(
      [
        "launcher/src/pages/SettingsPage.tsx",
        "docs/verification/screenshots/settings.png",
        "",
      ].join("\n"),
    ),
    [
      "launcher/src/pages/SettingsPage.tsx",
      "docs/verification/screenshots/settings.png",
    ],
  );
});

test("parseArgs accepts a git diff base range", () => {
  assert.deepEqual(parseArgs(["--base", "origin/main...HEAD"]), {
    base: "origin/main...HEAD",
    help: false,
  });
  assert.deepEqual(parseArgs(["--base=HEAD^...HEAD"]), {
    base: "HEAD^...HEAD",
    help: false,
  });
  assert.throws(() => parseArgs(["--base"]), /Missing value/);
});

test("uiEvidenceReport passes when no UI files changed", () => {
  const root = fixtureRoot();
  const report = uiEvidenceReport({
    changedPaths: ["scripts/completion-gate.mjs"],
    manifestRows: "",
    root,
  });

  assert.equal(report.ready, true);
  assert.deepEqual(report.findings, []);
  assert.deepEqual(report.completeScreenshotEntries, []);
  assert.match(renderUiEvidenceReport(report), /UI evidence check passed/);
});

test("uiEvidenceReport rejects UI changes without screenshot evidence", () => {
  const root = fixtureRoot();
  const report = uiEvidenceReport({
    changedPaths: ["launcher/src/pages/SettingsPage.tsx"],
    manifestRows: "",
    root,
  });

  assert.equal(report.ready, false);
  assert.match(
    report.findings.join("\n"),
    /no changed docs\/verification\/screenshots/,
  );
});

test("uiEvidenceReport rejects watchlisted UI TypeScript changes without screenshot evidence", () => {
  const root = fixtureRoot();
  const report = uiEvidenceReport({
    changedPaths: ["launcher/src/components/layout/navigation.ts"],
    manifestRows: "",
    root,
  });

  assert.equal(report.ready, false);
  assert.deepEqual(report.uiChanges, [
    "launcher/src/components/layout/navigation.ts",
  ]);
  assert.match(
    report.findings.join("\n"),
    /no changed docs\/verification\/screenshots/,
  );
});

test("uiEvidenceReport rejects Tailwind visual system changes without screenshot evidence", () => {
  const root = fixtureRoot();
  const report = uiEvidenceReport({
    changedPaths: ["launcher/tailwind.config.ts"],
    manifestRows: "",
    root,
  });

  assert.equal(report.ready, false);
  assert.deepEqual(report.uiChanges, ["launcher/tailwind.config.ts"]);
  assert.match(
    report.findings.join("\n"),
    /no changed docs\/verification\/screenshots/,
  );
});

test("uiEvidenceReport rejects visible readiness data module changes without screenshot evidence", () => {
  const root = fixtureRoot();
  const report = uiEvidenceReport({
    changedPaths: [
      "launcher/src/lib/plugin-system-readiness.ts",
      "launcher/src/lib/achievement-providers.ts",
    ],
    manifestRows: "",
    root,
  });

  assert.equal(report.ready, false);
  assert.deepEqual(report.uiChanges, [
    "launcher/src/lib/plugin-system-readiness.ts",
    "launcher/src/lib/achievement-providers.ts",
  ]);
  assert.match(
    report.findings.join("\n"),
    /no changed docs\/verification\/screenshots/,
  );
});

test("uiEvidenceReport rejects visible local evidence data modules without screenshot evidence", () => {
  const root = fixtureRoot();
  const report = uiEvidenceReport({
    changedPaths: [
      "launcher/src/lib/achievement-providers.ts",
      "launcher/src/lib/library-filters.ts",
      "launcher/src/lib/mock-data.ts",
      "launcher/src/lib/app-shell-skins.ts",
    ],
    manifestRows: "",
    root,
  });

  assert.equal(report.ready, false);
  assert.deepEqual(report.uiChanges, [
    "launcher/src/lib/achievement-providers.ts",
    "launcher/src/lib/library-filters.ts",
    "launcher/src/lib/mock-data.ts",
    "launcher/src/lib/app-shell-skins.ts",
  ]);
  assert.match(
    report.findings.join("\n"),
    /no changed docs\/verification\/screenshots/,
  );
});

test("uiEvidenceReport accepts documented watchlisted UI TypeScript evidence", () => {
  const root = fixtureRoot();
  writePngFixture(root);
  const report = uiEvidenceReport({
    changedPaths: [
      "launcher/src/lib/app-shell-skins.ts",
      "docs/verification/screenshots/ui.png",
    ],
    manifestRows:
      "- `screenshots/ui.png` - `/profile/customize?verify=app-shell-skins` local no-write skin panel with OG-Launcher header and Retro Manga paper borders.",
    root,
  });

  assert.equal(report.ready, true);
  assert.deepEqual(report.findings, []);
});

test("uiEvidenceReport ignores tests, declarations, types, and non-visual TypeScript", () => {
  const root = fixtureRoot();
  const report = uiEvidenceReport({
    changedPaths: [
      "launcher/src/lib/types/profile.ts",
      "launcher/src/lib/__tests__/theme-skin-readiness.test.ts",
      "launcher/src/components/ui/ConfirmDialog.test.tsx",
      "launcher/src/vite-env.d.ts",
    ],
    manifestRows: "",
    root,
  });

  assert.equal(report.ready, true);
  assert.deepEqual(report.uiChanges, []);
  assert.deepEqual(report.findings, []);
});

test("uiEvidenceReport rejects undocumented screenshot artifacts", () => {
  const root = fixtureRoot();
  writePngFixture(root);
  const report = uiEvidenceReport({
    changedPaths: [
      "launcher/src/pages/SettingsPage.tsx",
      "docs/verification/screenshots/ui.png",
    ],
    manifestRows: "",
    root,
  });

  assert.equal(report.ready, false);
  assert.match(
    report.findings.join("\n"),
    /missing a docs\/verification\/screenshot-manifest\.json entry/,
  );
});

test("uiEvidenceReport rejects weak screenshot manifest entries", () => {
  const root = fixtureRoot();
  writePngFixture(root);
  const report = uiEvidenceReport({
    changedPaths: [
      "launcher/src/pages/SettingsPage.tsx",
      "docs/verification/screenshots/ui.png",
    ],
    manifestRows: "- `screenshots/ui.png` - Updated screen.",
    root,
  });

  assert.equal(report.ready, false);
  assert.match(report.findings.join("\n"), /route or UI state/);
  assert.match(report.findings.join("\n"), /evidence boundary/);
});

test("uiEvidenceReport accepts documented local Retro Manga screenshot evidence", () => {
  const root = fixtureRoot();
  writePngFixture(root);
  const report = uiEvidenceReport({
    changedPaths: [
      "launcher/src/pages/SettingsPage.tsx",
      "docs/verification/screenshots/ui.png",
    ],
    manifestRows:
      "- `screenshots/ui.png` - `/settings` local Retro Manga settings panel with OG-Launcher header and no horizontal overflow.",
    root,
  });

  assert.equal(report.ready, true);
  assert.deepEqual(report.findings, []);
});

test("uiEvidenceReport requires screenshot route family to match the UI change", () => {
  const root = fixtureRoot();
  writePngFixture(root, "docs/verification/screenshots/downloads.png");
  writePngFixture(root, "docs/verification/screenshots/library.png");
  writePngFixture(root, "docs/verification/screenshots/settings.png");

  const wrongRouteReport = uiEvidenceReport({
    changedPaths: [
      "launcher/src/pages/SettingsPage.tsx",
      "docs/verification/screenshots/downloads.png",
    ],
    manifestRows:
      "- `screenshots/downloads.png` - `/downloads` local Retro Manga panel with OG-Launcher header and no horizontal overflow.",
    root,
  });

  assert.equal(wrongRouteReport.ready, false);
  assert.match(
    wrongRouteReport.findings.join("\n"),
    /SettingsPage\.tsx.*affected route family \(\/settings\)/,
  );

  const matchingRouteReport = uiEvidenceReport({
    changedPaths: [
      "launcher/src/pages/SettingsPage.tsx",
      "docs/verification/screenshots/settings.png",
    ],
    manifestRows:
      "- `screenshots/settings.png` - `/settings` local Retro Manga panel with OG-Launcher header and no horizontal overflow.",
    root,
  });

  assert.equal(matchingRouteReport.ready, true);
  assert.deepEqual(matchingRouteReport.findings, []);

  const unrelatedLibraryRouteReport = uiEvidenceReport({
    changedPaths: [
      "launcher/src/pages/LibraryPage.tsx",
      "docs/verification/screenshots/settings.png",
    ],
    manifestRows:
      "- `screenshots/settings.png` - `/settings/performance` local Retro Manga panel with OG-Launcher header and no horizontal overflow.",
    root,
  });

  assert.equal(unrelatedLibraryRouteReport.ready, false);
  assert.match(
    unrelatedLibraryRouteReport.findings.join("\n"),
    /LibraryPage\.tsx.*affected route family \(\/library\)/,
  );

  const matchingLibraryRouteReport = uiEvidenceReport({
    changedPaths: [
      "launcher/src/pages/LibraryPage.tsx",
      "docs/verification/screenshots/library.png",
    ],
    manifestRows:
      "- `screenshots/library.png` - `/library` local Retro Manga launcher panel with OG-Launcher header and no horizontal overflow.",
    root,
  });

  assert.equal(matchingLibraryRouteReport.ready, true);
  assert.deepEqual(matchingLibraryRouteReport.findings, []);
});

test("uiEvidenceReport maps the FPS HUD page to its registered /fps-hud route", () => {
  const root = fixtureRoot();
  writePngFixture(root, "docs/verification/screenshots/fps-hud.png");

  const report = uiEvidenceReport({
    changedPaths: [
      "launcher/src/pages/FpsHudPage.tsx",
      "docs/verification/screenshots/fps-hud.png",
    ],
    manifestRows:
      "- `screenshots/fps-hud.png` - `/fps-hud` local browser-preview HUD with Retro Manga styling and no horizontal overflow.",
    root,
  });

  assert.equal(report.ready, true);
  assert.deepEqual(report.findings, []);
});

test("uiEvidenceReport maps ActivityFeed to the registered /activity route", () => {
  const root = fixtureRoot();
  writePngFixture(root, "docs/verification/screenshots/activity.png");

  const report = uiEvidenceReport({
    changedPaths: [
      "launcher/src/components/friends/ActivityFeed.tsx",
      "docs/verification/screenshots/activity.png",
    ],
    manifestRows:
      "- `screenshots/activity.png` - `/activity` local signed-out browser fallback with OG-Launcher header, Retro Manga styling, and no horizontal overflow.",
    root,
  });

  assert.equal(report.ready, true);
  assert.deepEqual(report.findings, []);
});

test("uiEvidenceReport rejects incomplete screenshot entries in a dirty screenshot set", () => {
  const root = fixtureRoot();
  writePngFixture(root, "docs/verification/screenshots/weak.png");
  writePngFixture(root, "docs/verification/screenshots/strong.png");
  const report = uiEvidenceReport({
    changedPaths: [
      "launcher/src/pages/SettingsPage.tsx",
      "docs/verification/screenshots/weak.png",
      "docs/verification/screenshots/strong.png",
    ],
    manifestRows: [
      "- `screenshots/weak.png` - Updated screen.",
      "- `screenshots/strong.png` - `/settings` local Retro Manga settings panel with OG-Launcher header and no horizontal overflow.",
    ].join("\n"),
    root,
  });

  assert.equal(report.ready, false);
  assert.deepEqual(report.completeScreenshotEntries, [
    "docs/verification/screenshots/strong.png",
  ]);
  assert.match(
    report.findings.join("\n"),
    /one or more changed screenshot artifacts/,
  );
  assert.match(report.findings.join("\n"), /route or UI state/);
});
