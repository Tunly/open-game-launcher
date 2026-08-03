#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  completionGateRunIdEnvName,
  hostedCronEvidenceArtifactDigest,
  hostedCronEvidenceReceiptDigest,
  hostedCronEvidenceReceiptDigestAlgorithm,
  hostedCronEvidenceReceiptEnvName,
} from "./hosted-cron-evidence.mjs";

const hostedCronEvidenceFields = Object.freeze([
  "Hosted cron table",
  "Function",
  "Run ID",
  "Scheduled",
  "dry_run=false",
  "Status",
]);
const hostedCronReceiptDigestField = "Hosted cron receipt SHA256";
const hostedCronRestCollectorPrerequisites = Object.freeze([
  "SUPABASE_REST_URL or SUPABASE_URL or SUPABASE_PROJECT_REF",
  "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY + SUPABASE_AUTH_JWT",
]);

const hostedCronArtifactEvidenceGroups = Object.freeze([
  {
    heading: "price-drop",
    requiredFields: hostedCronEvidenceFields,
    expectedValues: {
      Function: /^notify-price-drop$/i,
      "Hosted cron table": /^store_price_drop_notification_runs$/i,
      Scheduled: /^scheduled$/i,
      Status: /^completed$/i,
    },
  },
  {
    heading: "presence-poll",
    requiredFields: hostedCronEvidenceFields,
    expectedValues: {
      Function: /^poll-platform-presence$/i,
      "Hosted cron table": /^presence_poll_runs$/i,
      Scheduled: /^scheduled$/i,
      Status: /^completed$/i,
    },
  },
  {
    heading: "account-deletion",
    requiredFields: hostedCronEvidenceFields,
    expectedValues: {
      Function: /^process-account-deletions$/i,
      "Hosted cron table": /^account_deletion_processor_runs$/i,
      Scheduled: /^scheduled$/i,
      Status: /^completed$/i,
    },
  },
]);

const stripeLiveEvidenceFields = Object.freeze([
  "Stripe webhook event ID",
  "Stripe Dashboard evidence",
  "Supabase function log run ID",
  "License key custody evidence",
  "Live license issuance evidence",
]);

const providerEvidenceFields = Object.freeze([
  "Provider/client matrix",
  "Live probe run ID",
  "Provider response evidence",
]);

const hardwareEvidenceFields = Object.freeze([
  "OS/title/client matrix",
  "Hardware profile",
  "Session/run ID",
]);

const rolloutEvidenceFields = Object.freeze([
  "Community rollout evidence",
  "Marketplace evidence",
  "Hosted deploy evidence",
]);

export const evidenceGates = Object.freeze([
  {
    id: "store-stripe-live",
    title: "Store and Stripe live staging",
    requiredEnv: [
      "SUPABASE_URL",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "PRICE_DROP_NOTIFY_SECRET",
    ],
    artifactTitles: {
      "docs/verification/external/store-price-drop-scheduler-live.md":
        "Store price-drop scheduler live",
    },
    artifactEnv: [
      {
        path: "docs/verification/external/store-stripe-live-staging.md",
        requiredEnv: [
          "SUPABASE_URL",
          "STRIPE_SECRET_KEY",
          "STRIPE_WEBHOOK_SECRET",
        ],
      },
      {
        path: "docs/verification/external/store-price-drop-scheduler-live.md",
        requiredEnv: ["SUPABASE_URL", "PRICE_DROP_NOTIFY_SECRET"],
      },
    ],
    artifactPaths: [
      "docs/verification/external/store-stripe-live-staging.md",
      "docs/verification/external/store-price-drop-scheduler-live.md",
    ],
    artifactProofs: [
      {
        path: "docs/verification/external/store-stripe-live-staging.md",
        requiredProofs: [
          "Stripe webhook signature delivery reaches stripe-webhook.",
          "Stripe Tax and invoice settings are verified in Dashboard.",
          "Production license signing key custody and live license issuance are verified.",
        ],
      },
      {
        path: "docs/verification/external/store-price-drop-scheduler-live.md",
        requiredProofs: [
          "Hosted price-drop scheduler writes fresh run evidence.",
        ],
      },
    ],
    artifactEvidenceFields: [
      {
        path: "docs/verification/external/store-stripe-live-staging.md",
        requiredFields: stripeLiveEvidenceFields,
      },
      {
        path: "docs/verification/external/store-price-drop-scheduler-live.md",
        requiredFields: hostedCronEvidenceFields,
        expectedValues: {
          Function: /^notify-price-drop$/i,
          "Hosted cron table": /^store_price_drop_notification_runs$/i,
          Scheduled: /^scheduled$/i,
          Status: /^completed$/i,
        },
      },
    ],
    requiredProofs: [
      "Stripe webhook signature delivery reaches stripe-webhook.",
      "Stripe Tax and invoice settings are verified in Dashboard.",
      "Production license signing key custody and live license issuance are verified.",
      "Hosted price-drop scheduler writes fresh run evidence.",
    ],
    captureHandoffs: {
      "Stripe webhook signature delivery reaches stripe-webhook.": {
        capture:
          "Trigger a live Stripe webhook delivery to stripe-webhook, then attach the redacted Stripe event locator and Supabase function log run ID.",
        terms: ["stripe-webhook", "evt_"],
      },
      "Stripe Tax and invoice settings are verified in Dashboard.": {
        capture:
          "Capture redacted Stripe live Dashboard evidence for Tax, invoice creation, and billing settings used by the release checkout lane.",
        terms: ["stripe-tax-invoice", "dashboard"],
      },
      "Production license signing key custody and live license issuance are verified.":
        {
          capture:
            "Capture redacted hosted runtime-secret custody evidence for the production license signing key, then issue a live license through the Stripe webhook fulfillment path and attach the redacted license/order/function locator without exposing the signing key.",
          terms: ["license-key-custody", "live-license-issuance"],
        },
      "Hosted price-drop scheduler writes fresh run evidence.": {
        capture:
          "Run `pnpm hosted:deploy-gate:scheduler-packet`, capture redacted scheduler dashboard/config proof, then run the price-drop scheduled lane and collect `OGL_HOSTED_CRON_EVIDENCE_CHECKS=price-drop pnpm hosted:cron-evidence:artifact-hints` for the redacted `store_price_drop_notification_runs` row with `notify-price-drop`, `scheduled`, `dry_run=false`, and `completed`; artifact hints fill Gate-Specific Evidence only and do not satisfy the proof row by themselves.",
        terms: ["price-drop", "store_price_drop_notification_runs"],
      },
    },
  },
  {
    id: "hosted-supabase-cron",
    title: "Hosted Supabase cron",
    requiredEnv: [
      "SUPABASE_URL",
      "PRICE_DROP_NOTIFY_SECRET",
      "ACCOUNT_DELETION_PROCESSOR_SECRET",
      "PRESENCE_POLL_SECRET",
    ],
    artifactPaths: ["docs/verification/external/hosted-supabase-cron.md"],
    artifactEvidenceGroups: [
      {
        path: "docs/verification/external/hosted-supabase-cron.md",
        groups: hostedCronArtifactEvidenceGroups,
      },
    ],
    requiredProofs: [
      "poll-platform-presence scheduled run writes fresh evidence.",
      "notify-price-drop scheduled run writes fresh evidence.",
      "process-account-deletions scheduled run writes fresh evidence.",
    ],
    captureHandoffs: {
      "poll-platform-presence scheduled run writes fresh evidence.": {
        capture:
          "Run the presence scheduled lane, use `pnpm hosted:cron-evidence:artifact-hints --checks=presence-poll` for interim validation, then remember that the final hosted-supabase-cron proof needs unscoped grouped `pnpm hosted:cron-evidence:artifact-hints` output after all three scheduler lanes are fresh; paste the reviewed latest non-dry-run `presence_poll_runs` row for `poll-platform-presence`.",
        terms: ["presence-poll", "presence_poll_runs"],
      },
      "notify-price-drop scheduled run writes fresh evidence.": {
        capture:
          "Run the price-drop scheduled lane, use `pnpm hosted:cron-evidence:artifact-hints --checks=price-drop` for interim validation, then remember that the final hosted-supabase-cron proof needs unscoped grouped `pnpm hosted:cron-evidence:artifact-hints` output after all three scheduler lanes are fresh; paste the reviewed latest non-dry-run `store_price_drop_notification_runs` row for `notify-price-drop`.",
        terms: ["price-drop", "store_price_drop_notification_runs"],
      },
      "process-account-deletions scheduled run writes fresh evidence.": {
        capture:
          "Run the account-deletion scheduled lane, use `pnpm hosted:cron-evidence:artifact-hints --checks=account-deletion` for interim validation, then remember that the final hosted-supabase-cron proof needs unscoped grouped `pnpm hosted:cron-evidence:artifact-hints` output after all three scheduler lanes are fresh; paste the reviewed latest non-dry-run `account_deletion_processor_runs` row for `process-account-deletions`.",
        terms: ["account-deletion", "account_deletion_processor_runs"],
      },
    },
  },
  {
    id: "provider-live-integrations",
    title: "Provider live integrations",
    requiredEnv: [
      "STEAM_WEB_API_KEY",
      "PRESENCE_PROVIDER_TOKEN",
    ],
    artifactPaths: ["docs/verification/external/provider-live-integrations.md"],
    artifactEvidenceFields: [
      {
        path: "docs/verification/external/provider-live-integrations.md",
        requiredFields: providerEvidenceFields,
      },
    ],
    requiredProofs: [
      "Non-Steam presence bridges return redacted live provider evidence.",
      "Provider-approved catalog/cloud transfer flows are verified.",
      "Achievement/provider cache E2E runs against real client data.",
    ],
    captureHandoffs: {
      "Non-Steam presence bridges return redacted live provider evidence.": {
        capture:
          "Exercise non-Steam presence bridges against live provider sessions and attach redacted response evidence for the presence bridge lane.",
        terms: ["non-steam", "presence-bridge", "presence-provider"],
      },
      "Provider-approved catalog/cloud transfer flows are verified.": {
        capture:
          "Record provider-approved catalog and cloud-transfer review evidence, including the client/provider matrix and approval source.",
        terms: ["catalog-cloud-transfer", "provider-approved"],
      },
      "Achievement/provider cache E2E runs against real client data.": {
        capture:
          "Run achievement/provider cache E2E against real client data and attach redacted run evidence from the cache hydration lane.",
        terms: ["achievement-cache", "provider-cache", "real-client"],
      },
    },
  },
  {
    id: "hardware-os-e2e",
    title: "Hardware and OS E2E",
    requiredEnv: [],
    artifactPaths: ["docs/verification/external/hardware-os-e2e.md"],
    artifactEvidenceFields: [
      {
        path: "docs/verification/external/hardware-os-e2e.md",
        requiredFields: hardwareEvidenceFields,
      },
    ],
    requiredProofs: [
      "Fullscreen/anti-cheat overlay evidence is captured on real titles.",
      "Long native overlay sessions produce stable runtime/session evidence.",
      "External-drive backup/restore E2E runs on Windows, macOS, and Linux.",
      "Real client mount/apply behavior is tested against provider clients.",
    ],
    captureHandoffs: {
      "Fullscreen/anti-cheat overlay evidence is captured on real titles.": {
        capture:
          "Capture real-title fullscreen and anti-cheat overlay behavior with redacted title, OS, and session evidence.",
        terms: ["overlay", "fullscreen", "anti-cheat"],
      },
      "Long native overlay sessions produce stable runtime/session evidence.": {
        capture:
          "Run long native overlay sessions and attach redacted runtime/session evidence showing stability over the measured window.",
        terms: ["native-overlay", "long-session"],
      },
      "External-drive backup/restore E2E runs on Windows, macOS, and Linux.": {
        capture:
          "Run external-drive backup and restore E2E on Windows, macOS, and Linux, then attach redacted per-OS run evidence.",
        terms: [
          "external-drive",
          "backup-restore",
          "Windows",
          "macOS",
          "Linux",
        ],
      },
      "Real client mount/apply behavior is tested against provider clients.": {
        capture:
          "Exercise real client mount/apply behavior against provider clients and attach redacted apply, rollback, and provider-client evidence.",
        terms: ["client-mount", "mount-apply", "provider-client"],
      },
    },
  },
  {
    id: "rollout-tracks",
    title: "Rollout tracks",
    requiredEnv: [],
    artifactPaths: ["docs/verification/external/rollout-tracks.md"],
    artifactEvidenceFields: [
      {
        path: "docs/verification/external/rollout-tracks.md",
        requiredFields: rolloutEvidenceFields,
      },
    ],
    requiredProofs: [
      "Hosted community artwork rollout is exercised beyond fixtures.",
      "Plugin marketplace execution/update channels are externally reviewed.",
      "Hosted production deployment evidence is attached.",
    ],
    captureHandoffs: {
      "Hosted community artwork rollout is exercised beyond fixtures.": {
        capture:
          "Exercise hosted community artwork rollout beyond local fixtures, then attach redacted rollout evidence.",
        terms: ["community-artwork", "artwork-rollout"],
      },
      "Plugin marketplace execution/update channels are externally reviewed.": {
        capture:
          "Attach external review evidence for plugin marketplace execution and update channels without including raw package secrets.",
        terms: [
          "plugin-marketplace",
          "marketplace-execution",
          "marketplace-update",
          "plugin-update",
        ],
      },
      "Hosted production deployment evidence is attached.": {
        capture:
          "Run `pnpm hosted:deploy-gate:packet`, then run GitHub Actions `CI` from `main` with `hosted_deploy_gate=true`, `hosted_environment=hosted-production`, `hosted_deploy_action=all`, and `hosted_deploy_dry_run=false`; paste a labelled `hosted-deploy` GitHub Actions run URL plus those CI inputs into both the proof evidence row and `Hosted deploy evidence`.",
        terms: ["hosted-deploy", "workflow"],
      },
    },
  },
]);

const actionNames = Object.freeze([
  "plan",
  "preflight",
  "artifact-preflight",
  "status",
  "template",
  "next",
  "next-steps",
  "worklist",
  "artifact-worklist",
  "packet",
  "operator-packet",
  "runbook",
  "operator-runbook",
]);
const actions = new Set(actionNames);
const actionAliases = Object.freeze({
  "artifact-worklist": "worklist",
  "next-steps": "next",
  "operator-packet": "packet",
  "operator-runbook": "runbook",
});

const forbiddenArtifactPatterns = Object.freeze([
  {
    label: "Stripe secret key",
    pattern: /\b(?:sk|rk)_(?:live|test)_[a-z0-9_=-]+/i,
  },
  {
    label: "Stripe webhook secret",
    pattern: /whsec_[a-z0-9_=-]+/i,
  },
  {
    label: "Bearer token",
    pattern: /bearer\s+[a-z0-9._~+/=-]{12,}/i,
  },
  {
    label: "Raw GitHub token",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[a-z0-9_]{20,}\b/i,
  },
  {
    label: "Raw GitHub token",
    pattern: /\bgithub_pat_[a-z0-9_]{20,}\b/i,
  },
  {
    label: "Raw GitHub token",
    pattern:
      /\b(?:GITHUB_TOKEN|GH_TOKEN|GITHUB_PAT)\s*[:=]\s*(?!(?:\[?redacted\]?|<redacted>|\*{3,})(?:\s|$))[^\s`"'<>]{8,}/i,
  },
  {
    label: "Raw provider API key",
    pattern:
      /\b(?:STEAM_WEB_API_KEY|RAWG_API_KEY|PRESENCE_PROVIDER_TOKEN)\s*[:=]\s*(?!(?:\[?redacted\]?|<redacted>|\*{3,})(?:\s|$))[^\s`"'<>]{8,}/i,
  },
  {
    label: "Raw license signing key",
    pattern:
      /\bOGL_LICENSE_SIGNING_KEY\s*[:=]\s*(?!(?:\[?redacted\]?|<redacted>|\*{3,})(?:\s|$))[^\s`"'<>]{8,}/i,
  },
  {
    label: "Raw provider API key",
    pattern:
      /\bx-api-key\s*:\s*(?!(?:\[?redacted\]?|<redacted>|\*{3,})(?:\s|$))[a-z0-9._~+/=-]{8,}/i,
  },
  {
    label: "Raw provider API key",
    pattern:
      /\bauthorization\s*:\s*token\s+(?!(?:\[?redacted\]?|<redacted>|\*{3,})(?:\s|$))[a-z0-9._~+/=-]{8,}/i,
  },
  {
    label: "Raw Supabase credential",
    pattern:
      /\b(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY|SUPABASE_AUTH_JWT)\s*[:=]\s*(?!(?:\[?redacted\]?|<redacted>|\*{3,})(?:\s|$))[^\s`"'<>]{8,}/i,
  },
  {
    label: "Raw Supabase access token",
    pattern:
      /\bSUPABASE_ACCESS_TOKEN\s*[:=]\s*(?!(?:\[?redacted\]?|<redacted>|\*{3,})(?:\s|$))[^\s`"'<>]{8,}/i,
  },
  {
    label: "Raw Supabase access token",
    pattern: /\bsbp_[a-z0-9_=-]{20,}\b/i,
  },
  {
    label: "Raw private key",
    pattern: /-----BEGIN (?:EC |RSA |)PRIVATE KEY-----/,
  },
  {
    label: "Raw hosted cron secret",
    pattern:
      /\b(?:PRICE_DROP_NOTIFY_SECRET|ACCOUNT_DELETION_PROCESSOR_SECRET|PRESENCE_POLL_SECRET)\s*[:=]\s*(?!(?:\[?redacted\]?|<redacted>|\*{3,})(?:\s|$))[^\s`"'<>]{8,}/i,
  },
  {
    label: "JWT-like token",
    pattern: /eyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}/,
  },
  {
    label: "Unredacted secret fixture",
    pattern: /\b(secret-value|sk_live_secret|whsec_secret)\b/i,
  },
]);

const requiredEvidenceDetailFields = Object.freeze([
  "Captured at",
  "Release ref",
  "Commit SHA",
  "Operator",
  "Environment",
  "Redacted run IDs, dashboard links, screenshots, or signed deployment logs",
  "Redaction notes",
]);

const releaseBoundaryReminder =
  "Release-boundary reminder: run `pnpm completion:gate:status` before final verification. The final `pnpm completion:gate:external` run is unscoped and also runs `pnpm hosted:deploy-gate:preflight`, `pnpm hosted:deploy-gate:smoke`, `pnpm hosted:cron-evidence`, and `pnpm external:evidence:preflight`.";

const hostedDeployProofRunHandoff =
  "GitHub Actions CI main hosted_deploy_gate=true hosted_environment=hosted-production hosted_deploy_action=all hosted_deploy_dry_run=false";

const placeholderEvidenceDetailValues = new Set([
  "-",
  "--",
  "dummy",
  "example",
  "n/a",
  "na",
  "none",
  "null",
  "pending",
  "placeholder",
  "sample",
  "tbd",
  "todo",
]);

const weakEvidenceDetailValuesByField = Object.freeze({
  Operator: new Set(["me"]),
  Environment: new Set(["test"]),
  "Redacted run IDs, dashboard links, screenshots, or signed deployment logs":
    new Set([
      "available on request",
      "pending in dashboard",
      "redacted",
      "see above",
      "see attached later",
    ]),
  "Redaction notes": new Set(["ok"]),
});

const rejectedRedactionNotePattern =
  /\b(?:not\s+redacted|unredacted|contains\s+raw|not\s+reviewed)\b/i;
const positiveRedactionNotePatterns = Object.freeze([
  /\braw\s+secrets?\s+removed\b/i,
  /\btokens?\s+redacted\b/i,
  /\bno\s+raw\s+secrets?\b/i,
]);

const placeholderEnvironmentValues = new Set([
  ...placeholderEvidenceDetailValues,
  "api-key",
  "api_key",
  "secret",
  "secret-value",
  "set",
  "sk_live_secret",
  "token",
  "whsec_secret",
]);

const utcIsoTimestampPattern =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/;
const releaseTagPattern =
  /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const commitShaPattern = /^[a-f0-9]{40}$/i;
const uuidRunIdPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const maxEvidenceAgeMs = 30 * 24 * 60 * 60 * 1000;
const maxEvidenceFutureSkewMs = 10 * 60 * 1000;

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function evidenceMarkdownLines(content) {
  const lines = String(content).split(/\r?\n/);
  let fenceMarker = null;
  let htmlComment = false;

  return lines.filter((line) => {
    if (htmlComment) {
      if (line.includes("-->")) htmlComment = false;
      return false;
    }

    const marker = line.trimStart().match(/^(```|~~~)/)?.[1] ?? null;
    if (marker && !fenceMarker) {
      fenceMarker = marker;
      return false;
    }
    if (marker && marker === fenceMarker) {
      fenceMarker = null;
      return false;
    }
    if (fenceMarker) return false;

    const commentStart = line.indexOf("<!--");
    if (commentStart >= 0) {
      if (!line.includes("-->", commentStart + 4)) htmlComment = true;
      return false;
    }

    if (/^(?: {4,}|\t)/.test(line) && line.trim() !== "") return false;

    return true;
  });
}

function markdownHeading(line) {
  const match = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
  if (!match) return null;
  return {
    level: match[1].length,
    text: match[2].replace(/`/g, "").trim().toLowerCase(),
  };
}

function evidenceGroupLines(content, heading) {
  const lines = evidenceMarkdownLines(content);
  const normalizedHeading = heading.toLowerCase();
  const startIndex = lines.findIndex(
    (line) => markdownHeading(line)?.text === normalizedHeading,
  );
  if (startIndex < 0) return [];

  const startLevel = markdownHeading(lines[startIndex])?.level ?? 6;
  const groupLines = [];
  for (const line of lines.slice(startIndex + 1)) {
    const headingMatch = markdownHeading(line);
    if (headingMatch && headingMatch.level <= startLevel) break;
    groupLines.push(line);
  }
  return groupLines;
}

function evidenceDetailValuesFromLines(lines, field) {
  const pattern = new RegExp(
    `^\\s*[-*]\\s+${escapeRegExp(field)}:\\s*(\\S.*)$`,
  );
  return lines.map((line) => clean(line.match(pattern)?.[1])).filter(Boolean);
}

function firstEvidenceDetailValue(lines, field) {
  return evidenceDetailValuesFromLines(lines, field)[0] ?? "";
}

function hostedCronReceiptPath(env = process.env) {
  return clean(env[hostedCronEvidenceReceiptEnvName]);
}

function hostedCronReceiptFinding(path, field, reason) {
  return { field, path, reason };
}

function setValuesMatch(left, right) {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function hostedCronReceiptLaneFreshnessIssue(receipt, lane, now) {
  const completedAt = clean(lane?.completedAt);
  const parsedCompletedAt = new Date(completedAt);
  if (
    !completedAt ||
    Number.isNaN(parsedCompletedAt.valueOf()) ||
    parsedCompletedAt.toISOString() !== canonicalUtcIsoTimestamp(completedAt)
  ) {
    return "malformed_timestamp";
  }
  const ageMs = now.valueOf() - parsedCompletedAt.valueOf();
  if (ageMs < -maxEvidenceFutureSkewMs) return "future_timestamp";

  const freshnessHours = Number(receipt?.freshnessHours?.[clean(lane?.id)]);
  if (!Number.isFinite(freshnessHours) || freshnessHours <= 0) {
    return "missing_freshness";
  }
  if (ageMs > freshnessHours * 60 * 60 * 1000) return "stale_timestamp";
  return null;
}

function hostedCronReceiptContext(
  env = process.env,
  fileExists = existsSync,
  readFile = readFileSync,
) {
  const path = hostedCronReceiptPath(env);
  if (!path) return { required: false };

  if (!fileExists(path)) {
    return {
      findings: [
        hostedCronReceiptFinding(path, "Hosted cron receipt", "missing"),
      ],
      path,
      required: true,
    };
  }

  let content;
  try {
    content = String(readFile(path, "utf8"));
  } catch {
    return {
      findings: [
        hostedCronReceiptFinding(path, "Hosted cron receipt", "unreadable"),
      ],
      path,
      required: true,
    };
  }

  const findings = scanForbiddenArtifactContent(path, content).map((finding) =>
    hostedCronReceiptFinding(path, "Hosted cron receipt", finding.label),
  );

  let receipt;
  try {
    receipt = JSON.parse(content);
  } catch {
    return {
      findings: [
        ...findings,
        hostedCronReceiptFinding(path, "Hosted cron receipt", "malformed_json"),
      ],
      path,
      required: true,
    };
  }

  if (receipt?.version !== 1) {
    findings.push(
      hostedCronReceiptFinding(path, "Hosted cron receipt", "schema_version"),
    );
  }
  if (receipt?.type !== "hosted-cron-evidence-receipt") {
    findings.push(
      hostedCronReceiptFinding(path, "Hosted cron receipt", "schema_type"),
    );
  }
  if (
    receipt?.digestAlgorithm !== hostedCronEvidenceReceiptDigestAlgorithm ||
    receipt?.digest !== hostedCronEvidenceReceiptDigest(receipt)
  ) {
    findings.push(
      hostedCronReceiptFinding(path, "Hosted cron receipt SHA256", "mismatch"),
    );
  }
  if (receipt?.artifactDigest !== hostedCronEvidenceArtifactDigest(receipt)) {
    findings.push(
      hostedCronReceiptFinding(path, "Hosted cron artifact SHA256", "mismatch"),
    );
  }
  const expectedGateRunId = clean(env[completionGateRunIdEnvName]);
  if (expectedGateRunId && receipt?.gateRunId !== expectedGateRunId) {
    findings.push(
      hostedCronReceiptFinding(path, "Hosted cron receipt run", "mismatch"),
    );
  }
  const expectedRef = expectedReleaseRef(env);
  if (
    expectedRef &&
    normalizedReleaseRef(receipt?.release?.ref) !== expectedRef
  ) {
    findings.push(
      hostedCronReceiptFinding(
        path,
        "Hosted cron receipt release ref",
        "mismatch",
      ),
    );
  }
  const expectedSha = clean(env.GITHUB_SHA).toLowerCase();
  if (
    expectedSha &&
    clean(receipt?.release?.commitSha).toLowerCase() !== expectedSha
  ) {
    findings.push(
      hostedCronReceiptFinding(
        path,
        "Hosted cron receipt commit SHA",
        "mismatch",
      ),
    );
  }
  const generatedAtIssue = timestampEvidenceIssueReason(
    clean(receipt?.generatedAt),
    evidenceValidationNow(env),
  );
  if (generatedAtIssue) {
    findings.push(
      hostedCronReceiptFinding(
        path,
        "Hosted cron receipt generatedAt",
        generatedAtIssue,
      ),
    );
  }

  const lanes = Array.isArray(receipt?.lanes) ? receipt.lanes : [];
  const selectedChecks = Array.isArray(receipt?.selectedChecks)
    ? receipt.selectedChecks.map(clean).filter(Boolean)
    : [];
  if (lanes.length === 0 || selectedChecks.length === 0) {
    findings.push(
      hostedCronReceiptFinding(path, "Hosted cron receipt lanes", "missing"),
    );
  }

  const laneById = new Map();
  const laneIds = [];
  const now = evidenceValidationNow(env);
  for (const lane of lanes) {
    const lanePath = `${path}#${clean(lane?.id) || "unknown-lane"}`;
    if (!clean(lane?.id)) {
      findings.push(
        hostedCronReceiptFinding(
          lanePath,
          "Hosted cron receipt lane",
          "missing",
        ),
      );
      continue;
    }
    laneIds.push(clean(lane.id));
    laneById.set(clean(lane.id), lane);
    for (const [field, expected] of [
      ["triggerSource", "scheduled"],
      ["status", "completed"],
    ]) {
      if (clean(lane?.[field]) !== expected) {
        findings.push(
          hostedCronReceiptFinding(
            lanePath,
            `Hosted cron receipt ${field}`,
            "mismatch",
          ),
        );
      }
    }
    if (lane?.dryRun !== false) {
      findings.push(
        hostedCronReceiptFinding(
          lanePath,
          "Hosted cron receipt dryRun",
          "mismatch",
        ),
      );
    }
    if (!runIdValueIsSpecific(clean(lane?.runId))) {
      findings.push(
        hostedCronReceiptFinding(
          lanePath,
          "Hosted cron receipt runId",
          "malformed",
        ),
      );
    }
    const freshnessIssue = hostedCronReceiptLaneFreshnessIssue(
      receipt,
      lane,
      now,
    );
    if (freshnessIssue) {
      findings.push(
        hostedCronReceiptFinding(
          lanePath,
          "Hosted cron receipt completedAt",
          freshnessIssue,
        ),
      );
    }
  }

  if (selectedChecks.length > 0 && !setValuesMatch(selectedChecks, laneIds)) {
    findings.push(
      hostedCronReceiptFinding(
        path,
        "Hosted cron receipt selectedChecks",
        "mismatch",
      ),
    );
  }

  return {
    digest: clean(receipt?.artifactDigest),
    findings,
    laneById,
    path,
    receipt,
    required: true,
  };
}

function hostedCronArtifactUsesReceipt(gate, artifactPath) {
  return artifactUsesHostedCronEvidence(gate, artifactPath);
}

function hostedCronLaneForFlatArtifact(gate, artifactPath) {
  const expectedValues = expectedEvidenceValuesForArtifact(gate, artifactPath);
  if (expectedValues?.Function?.test("notify-price-drop")) {
    return "price-drop";
  }
  return "";
}

function hostedCronReceiptArtifactFinding(path, field, reason) {
  return { field, path, reason };
}

function fieldLabelForHostedCronLane(laneId, field) {
  return laneId ? `${laneId}: ${field}` : field;
}

function compareHostedCronReceiptLane({
  artifactPath,
  digest,
  lane,
  laneId,
  lines,
}) {
  const findings = [];
  if (!lane) {
    findings.push(
      hostedCronReceiptArtifactFinding(
        artifactPath,
        fieldLabelForHostedCronLane(laneId, "Hosted cron receipt lane"),
        "missing",
      ),
    );
    return findings;
  }

  for (const [field, expectedValue] of [
    ["Hosted cron table", lane.table],
    ["Function", lane.functionName],
    ["Run ID", lane.runId],
    ["Scheduled", lane.triggerSource],
    ["Status", lane.status],
  ]) {
    const value = firstEvidenceDetailValue(lines, field);
    if (!value) continue;
    if (clean(value) !== clean(expectedValue)) {
      findings.push(
        hostedCronReceiptArtifactFinding(
          artifactPath,
          fieldLabelForHostedCronLane(laneId, field),
          "receipt_mismatch",
        ),
      );
    }
  }

  const dryRunValue = firstEvidenceDetailValue(lines, "dry_run=false");
  if (dryRunValue && !/^(?:false|confirmed false)$/i.test(clean(dryRunValue))) {
    findings.push(
      hostedCronReceiptArtifactFinding(
        artifactPath,
        fieldLabelForHostedCronLane(laneId, "dry_run=false"),
        "receipt_mismatch",
      ),
    );
  }

  const digestValues = evidenceDetailValuesFromLines(
    lines,
    hostedCronReceiptDigestField,
  );
  if (digestValues.length === 0) {
    findings.push(
      hostedCronReceiptArtifactFinding(
        artifactPath,
        fieldLabelForHostedCronLane(laneId, hostedCronReceiptDigestField),
        "missing",
      ),
    );
  } else if (!digestValues.some((value) => clean(value) === digest)) {
    findings.push(
      hostedCronReceiptArtifactFinding(
        artifactPath,
        fieldLabelForHostedCronLane(laneId, hostedCronReceiptDigestField),
        "receipt_mismatch",
      ),
    );
  }

  return findings;
}

function hostedCronReceiptFindingsFromArtifactContent(
  gate,
  artifactPath,
  content,
  receiptContext,
) {
  if (!receiptContext.required) return [];
  if (!hostedCronArtifactUsesReceipt(gate, artifactPath)) return [];
  if (receiptContext.findings?.length > 0) return receiptContext.findings;

  const findings = [];
  const digest = receiptContext.digest;
  for (const group of requiredEvidenceGroupsForArtifact(gate, artifactPath)) {
    findings.push(
      ...compareHostedCronReceiptLane({
        artifactPath,
        digest,
        lane: receiptContext.laneById?.get(group.heading),
        laneId: group.heading,
        lines: evidenceGroupLines(content, group.heading),
      }),
    );
  }

  const flatLaneId = hostedCronLaneForFlatArtifact(gate, artifactPath);
  if (flatLaneId) {
    findings.push(
      ...compareHostedCronReceiptLane({
        artifactPath,
        digest,
        lane: receiptContext.laneById?.get(flatLaneId),
        laneId: "",
        lines: evidenceMarkdownLines(content),
      }),
    );
  }

  return findings;
}

function verifiedProofsFromArtifactContent(content) {
  return new Set(
    evidenceMarkdownLines(content)
      .map((line) => line.match(/^\s*[-*]\s+\[[xX]\]\s+(.+?)\s*$/)?.[1])
      .filter(Boolean)
      .map((proof) => proof.trim()),
  );
}

function requiredProofsForArtifact(gate, artifactPath) {
  return (
    gate.artifactProofs?.find((item) => item.path === artifactPath)
      ?.requiredProofs ?? gate.requiredProofs
  );
}

export function requiredEnvForArtifact(gate, artifactPath) {
  return (
    gate.artifactEnv?.find((item) => item.path === artifactPath)?.requiredEnv ??
    gate.requiredEnv
  );
}

function titleForArtifact(gate, artifactPath) {
  return gate.artifactTitles?.[artifactPath] ?? gate.title;
}

function requiredEvidenceFieldsForArtifact(gate, artifactPath) {
  return (
    gate.artifactEvidenceFields?.find((item) => item.path === artifactPath)
      ?.requiredFields ?? []
  );
}

function expectedEvidenceValuesForArtifact(gate, artifactPath) {
  return (
    gate.artifactEvidenceFields?.find((item) => item.path === artifactPath)
      ?.expectedValues ?? {}
  );
}

function requiredEvidenceGroupsForArtifact(gate, artifactPath) {
  return (
    gate.artifactEvidenceGroups?.find((item) => item.path === artifactPath)
      ?.groups ?? []
  );
}

function requiredEvidenceGroupDetailFieldsForArtifact(gate, artifactPath) {
  return requiredEvidenceGroupsForArtifact(gate, artifactPath).flatMap(
    (group) =>
      group.requiredFields.map((field) => `${group.heading}: ${field}`),
  );
}

function requiredEvidenceDetailFieldsForArtifact(gate, artifactPath) {
  return [
    ...requiredEvidenceDetailFields,
    ...requiredEvidenceFieldsForArtifact(gate, artifactPath),
  ];
}

function canonicalUtcIsoTimestamp(value) {
  const match = value.match(utcIsoTimestampPattern);
  if (!match) return null;
  return `${match[1]}.${(match[2] ?? "").padEnd(3, "0")}Z`;
}

function isValidUtcIsoTimestamp(value, now = new Date()) {
  return timestampEvidenceIssueReason(value, now) === null;
}

function timestampEvidenceIssueReason(value, now = new Date()) {
  const canonical = canonicalUtcIsoTimestamp(value);
  if (!canonical) return "malformed_timestamp";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== canonical) {
    return "malformed_timestamp";
  }
  const timestamp = parsed.valueOf();
  const nowMs = now.valueOf();
  if (timestamp < nowMs - maxEvidenceAgeMs) return "stale_timestamp";
  if (timestamp > nowMs + maxEvidenceFutureSkewMs) {
    return "future_timestamp";
  }
  return null;
}

function normalizedReleaseRef(value) {
  return clean(value).replace(/^refs\/tags\//, "");
}

function expectedReleaseRef(env = {}) {
  const refName = normalizedReleaseRef(env.GITHUB_REF_NAME);
  if (releaseTagPattern.test(refName)) return refName;
  const ref = clean(env.GITHUB_REF);
  if (!ref) return "";
  const normalizedRef = normalizedReleaseRef(ref);
  return releaseTagPattern.test(normalizedRef) ? normalizedRef : "";
}

function releaseRefValueIsValid(value, env = {}) {
  return releaseRefIssueReason(value, env) === null;
}

function releaseRefIssueReason(
  value,
  env = {},
  { requireReleaseBoundaryIdentity = false } = {},
) {
  const normalized = normalizedReleaseRef(value);
  if (!releaseTagPattern.test(normalized)) return "malformed";
  const expected = expectedReleaseRef(env);
  if (!expected && requireReleaseBoundaryIdentity) {
    return "release_ref_context_missing";
  }
  if (expected && normalized !== expected) return "release_ref_mismatch";
  return null;
}

function commitShaValueIsValid(value, env = {}) {
  return commitShaIssueReason(value, env) === null;
}

function commitShaIssueReason(
  value,
  env = {},
  { requireReleaseBoundaryIdentity = false } = {},
) {
  const normalized = clean(value).toLowerCase();
  if (!commitShaPattern.test(normalized)) return "malformed";
  const expected = clean(env.GITHUB_SHA).toLowerCase();
  if (!expected && requireReleaseBoundaryIdentity) {
    return "commit_sha_context_missing";
  }
  if (expected && normalized !== expected) return "commit_sha_mismatch";
  return null;
}

function urlHostnameIsLocalOrPlaceholder(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    normalized === "localhost" ||
    normalized === "localhost.localdomain" ||
    normalized === "::1" ||
    normalized.endsWith(".local")
  ) {
    return true;
  }
  if (
    /^(?:example\.(?:com|org|net)|.+\.example\.(?:com|org|net))$/.test(
      normalized,
    )
  ) {
    return true;
  }
  if (/^(?:127|10|0)\./.test(normalized)) return true;
  if (/^192\.168\./.test(normalized)) return true;
  if (/^169\.254\./.test(normalized)) return true;
  if (/^172\.(?:1[6-9]|2\d|3[0-1])\./.test(normalized)) return true;
  return false;
}

function normalizeEvidenceUrl(rawUrl) {
  return rawUrl.replace(/[.,;:'"]+$/g, "");
}

function normalizeEvidenceLocatorPathSeparators(value) {
  return value.replace(/\\/g, "/");
}

function evidenceLocatorContainsBlockedLocalPath(value) {
  const normalizedPathSeparators =
    normalizeEvidenceLocatorPathSeparators(value);
  return /(?:^|[\s([<])(?:\.{1,2}\/[^\s,;)>]+|~\/[^\s,;)>]+|\/[^\s,;)>]+|[a-z]:[\\/][^\s,;)>]+|(?:docs|scripts|launcher|supabase|\.github|\.husky)\/[^\s,;)>]+)(?=$|[\s,;)>])/i.test(
    normalizedPathSeparators,
  );
}

function evidenceLocatorContainsLocalVerificationPath(value) {
  const normalizedPathSeparators =
    normalizeEvidenceLocatorPathSeparators(value);
  return /(?:^|[\s([<])(?:\.{1,2}\/)?docs\/verification\/screenshots\//i.test(
    normalizedPathSeparators,
  );
}

const allowedEvidenceUrlPatterns = Object.freeze([
  {
    host: /^(?:www\.)?supabase\.com$/i,
    path: /^\/dashboard\/project\/[a-z0-9]{20}\/.+/i,
  },
  {
    host: /^app\.supabase\.com$/i,
    path: /^\/project\/[a-z0-9]{20}\/.+/i,
  },
  {
    host: /^dashboard\.stripe\.com$/i,
    path: /^\/(?:accts?\/[^/]+\/)?(?:events|webhooks|settings|invoices|tax|logs|customers|payments|payment-links|subscriptions)\/?.*/i,
  },
  {
    host: /^github\.com$/i,
    path: /^\/[^/\s]+\/[^/\s]+\/(?:actions\/runs\/\d+|releases\/tag\/[^/\s]+|deployments\/[^/\s]+|pull\/\d+|commit\/[a-f0-9]{7,40})(?:\/.*)?$/i,
  },
  {
    host: /^(?:[^.\s]+\.)?vercel\.com$/i,
    path: /^\/.+/i,
  },
  {
    host: /^(?:[^.\s]+\.)?netlify\.app$/i,
    path: /^\/.+/i,
  },
  {
    host: /^app\.netlify\.com$/i,
    path: /^\/sites\/[^/\s]+\/deploys\/[^/\s]+(?:\/.*)?$/i,
  },
  {
    host: /^dash\.cloudflare\.com$/i,
    path: /^\/.+/i,
  },
  {
    host: /^appstoreconnect\.apple\.com$/i,
    path: /^\/.+/i,
  },
  {
    host: /^play\.google\.com$/i,
    path: /^\/console\/.+/i,
  },
]);

function evidenceUrlIsAllowed(url) {
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.port) return false;
  if (url.search || url.hash) return false;
  if (urlHostnameIsLocalOrPlaceholder(url.hostname)) return false;
  return allowedEvidenceUrlPatterns.some(
    ({ host, path }) => host.test(url.hostname) && path.test(url.pathname),
  );
}

function evidenceLocatorContainsRejectedUrl(value) {
  if (/(?:^|[\s([<])file:\/\//i.test(value)) return true;
  const urls = value.match(/\bhttps?:\/\/[^\s<>)\]]+/gi) ?? [];
  return urls.some((rawUrl) => {
    const candidate = normalizeEvidenceUrl(rawUrl);
    try {
      return !evidenceUrlIsAllowed(new URL(candidate));
    } catch {
      return true;
    }
  });
}

function evidenceLocatorContainsAllowedUrl(value) {
  const urls = value.match(/\bhttps:\/\/[^\s<>)\]]+/gi) ?? [];
  return urls.some((rawUrl) => {
    try {
      return evidenceUrlIsAllowed(new URL(normalizeEvidenceUrl(rawUrl)));
    } catch {
      return false;
    }
  });
}

function evidenceLocatorContainsGithubActionsRunUrl(value) {
  const urls = value.match(/\bhttps:\/\/[^\s<>)\]]+/gi) ?? [];
  return urls.some((rawUrl) => {
    try {
      const url = new URL(normalizeEvidenceUrl(rawUrl));
      return (
        evidenceUrlIsAllowed(url) &&
        /^github\.com$/i.test(url.hostname) &&
        /^\/[^/\s]+\/[^/\s]+\/actions\/runs\/\d+(?:\/.*)?$/i.test(url.pathname)
      );
    } catch {
      return false;
    }
  });
}

function evidenceLocatorContainsGithubPullOrCommitUrl(value) {
  const urls = value.match(/\bhttps:\/\/[^\s<>)\]]+/gi) ?? [];
  return urls.some((rawUrl) => {
    try {
      const url = new URL(normalizeEvidenceUrl(rawUrl));
      return (
        /^github\.com$/i.test(url.hostname) &&
        /^\/[^/\s]+\/[^/\s]+\/(?:pull\/\d+|commit\/[a-f0-9]{7,40})(?:\/.*)?$/i.test(
          url.pathname,
        )
      );
    } catch {
      return false;
    }
  });
}

function evidenceLocatorValueIsSpecific(value) {
  if (evidenceLocatorIssueReason(value)) return false;
  if (evidenceLocatorContainsAllowedUrl(value)) return true;
  const specificLocatorIds =
    value.match(
      /(?:^|[\s,;])((?:run|run_id|workflow|deployment|log|artifact|signed-log)[-_: #][a-z0-9][a-z0-9._:-]{2,})(?=$|[\s,;.])/gi,
    ) ?? [];
  return (
    specificLocatorIds.some((id) => /\d/.test(id)) ||
    /(?:^|[\s,;])sha256:[a-f0-9]{64}(?:$|[\s,;.])/i.test(value)
  );
}

function evidenceLocatorIssueReason(value) {
  const cleaned = clean(value);
  if (!cleaned) return "missing";
  const normalized = cleaned.toLowerCase().replace(/[.!]+$/, "");
  if (placeholderEvidenceDetailValues.has(normalized)) return "placeholder";
  if (
    weakEvidenceDetailValuesByField[
      "Redacted run IDs, dashboard links, screenshots, or signed deployment logs"
    ]?.has(normalized)
  ) {
    return "weak";
  }
  if (evidenceLocatorContainsLocalVerificationPath(cleaned))
    return "local_path";
  if (evidenceLocatorContainsBlockedLocalPath(cleaned)) return "local_path";
  if (/(?:^|[\s([<])file:\/\//i.test(cleaned)) return "local_path";
  if (evidenceLocatorContainsRejectedUrl(cleaned)) return "unapproved_url";
  return null;
}

function evidenceIdentifierValueIsSpecific(value) {
  const cleaned = clean(value);
  if (cleaned.length < 6 || cleaned.length > 240) return false;
  if (evidenceLocatorValueIsSpecific(cleaned)) return true;
  if (evidenceLocatorContainsLocalVerificationPath(cleaned)) return false;
  if (evidenceLocatorContainsBlockedLocalPath(cleaned)) return false;
  if (evidenceLocatorContainsRejectedUrl(cleaned)) return false;
  const specificIds =
    cleaned.match(
      /\b(?:run|run_id|probe|session|workflow|deployment|deploy|log|event|artifact|ticket|build)[-_: #]?[a-z0-9][a-z0-9._:-]{2,}\b/gi,
    ) ?? [];
  return specificIds.some((id) => /\d/.test(id));
}

function evidenceIdentifierIssueReason(value) {
  const cleaned = clean(value);
  const locatorReason = evidenceLocatorIssueReason(cleaned);
  if (locatorReason) return locatorReason;
  if (cleaned.length < 6 || cleaned.length > 240) return "weak";
  if (evidenceLocatorValueIsSpecific(cleaned)) return null;
  const specificIds =
    cleaned.match(
      /\b(?:run|run_id|probe|session|workflow|deployment|deploy|log|event|artifact|ticket|build)[-_: #]?[a-z0-9][a-z0-9._:-]{2,}\b/gi,
    ) ?? [];
  if (specificIds.length > 0 && !specificIds.some((id) => /\d/.test(id))) {
    return "weak";
  }
  return "malformed_locator";
}

function runIdValueIsSpecific(value) {
  const cleaned = clean(value);
  return (
    evidenceIdentifierValueIsSpecific(cleaned) ||
    uuidRunIdPattern.test(cleaned) ||
    hostedCronCollectorRunIdValueIsSpecific(cleaned)
  );
}

function hostedCronCollectorRunIdValueIsSpecific(value) {
  const cleaned = clean(value);
  if (cleaned.length < 6 || cleaned.length > 127) return false;
  if (!/^[a-z0-9][a-z0-9._:-]{2,127}$/i.test(cleaned)) return false;
  if (evidenceLocatorContainsLocalVerificationPath(cleaned)) return false;
  if (evidenceLocatorContainsBlockedLocalPath(cleaned)) return false;
  if (evidenceLocatorContainsRejectedUrl(cleaned)) return false;
  if (
    /sk_(?:live|test)_|whsec_|bearer\s+[a-z0-9._~+/=-]{12,}|eyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}|\b(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY|SUPABASE_AUTH_JWT|PRICE_DROP_NOTIFY_SECRET|ACCOUNT_DELETION_PROCESSOR_SECRET|PRESENCE_POLL_SECRET)\b/i.test(
      cleaned,
    )
  ) {
    return false;
  }
  return (
    /scheduled/i.test(cleaned) &&
    /(?:price[-_.:\s]?drop|notify[-_.:\s]?price[-_.:\s]?drop|presence[-_.:\s]?poll|poll[-_.:\s]?platform[-_.:\s]?presence|account[-_.:\s]?deletion|process[-_.:\s]?account[-_.:\s]?deletions?)/i.test(
      cleaned,
    )
  );
}

function stripeDashboardPathWithoutAccount(pathname) {
  const normalized = pathname.replace(/\/+$/g, "") || "/";
  const accountMatch = normalized.match(/^\/accts?\/[^/]+(\/.*)?$/i);
  return accountMatch ? (accountMatch[1] ?? "/") : normalized;
}

const specificStripeDashboardPathPatterns = Object.freeze([
  /^\/events\/evt_[a-z0-9]{8,}(?:\/.*)?$/i,
  /^\/webhooks\/we_[a-z0-9]{8,}(?:\/.*)?$/i,
  /^\/logs\/(?:log|req)_[a-z0-9]{8,}(?:\/.*)?$/i,
  /^\/invoices\/in_[a-z0-9]{8,}(?:\/.*)?$/i,
  /^\/payments\/(?:ch|cs|pi|py)_(?:live_|test_)?[a-z0-9]{8,}(?:\/.*)?$/i,
  /^\/payment-links\/plink_[a-z0-9]{8,}(?:\/.*)?$/i,
  /^\/subscriptions\/sub_[a-z0-9]{8,}(?:\/.*)?$/i,
  /^\/customers\/cus_[a-z0-9]{8,}(?:\/.*)?$/i,
  /^\/settings\/(?:billing|invoice|invoicing|tax)(?:\/.*)?$/i,
  /^\/tax\/(?:calculations|registrations|settings|transactions)\/.+$/i,
]);

function stripeDashboardUrlIsSpecific(url) {
  if (
    !/^dashboard\.stripe\.com$/i.test(url.hostname) ||
    !evidenceUrlIsAllowed(url)
  ) {
    return false;
  }
  const path = stripeDashboardPathWithoutAccount(url.pathname);
  return specificStripeDashboardPathPatterns.some((pattern) =>
    pattern.test(path),
  );
}

function valueContainsStripeDashboardUrl(value) {
  const urls = value.match(/\bhttps:\/\/[^\s<>)\]]+/gi) ?? [];
  return urls.some((rawUrl) => {
    try {
      const url = new URL(normalizeEvidenceUrl(rawUrl));
      return /^dashboard\.stripe\.com$/i.test(url.hostname);
    } catch {
      return false;
    }
  });
}

function valueContainsSpecificStripeDashboardUrl(value) {
  const urls = value.match(/\bhttps:\/\/[^\s<>)\]]+/gi) ?? [];
  return urls.some((rawUrl) => {
    try {
      return stripeDashboardUrlIsSpecific(
        new URL(normalizeEvidenceUrl(rawUrl)),
      );
    } catch {
      return false;
    }
  });
}

function valueContainsGenericStripeDashboardUrl(value) {
  const urls = value.match(/\bhttps:\/\/[^\s<>)\]]+/gi) ?? [];
  return urls.some((rawUrl) => {
    try {
      const url = new URL(normalizeEvidenceUrl(rawUrl));
      return (
        /^dashboard\.stripe\.com$/i.test(url.hostname) &&
        !stripeDashboardUrlIsSpecific(url)
      );
    } catch {
      return false;
    }
  });
}

function evidenceIdentifierValueMatches(value, patterns) {
  if (!evidenceIdentifierValueIsSpecific(value)) return false;
  return patterns.some((pattern) => pattern.test(value));
}

function evidenceIdentifierValueMatchesAll(value, patterns) {
  if (!evidenceIdentifierValueIsSpecific(value)) return false;
  return patterns.every((pattern) => pattern.test(value));
}

function stripeEventIdValueIsSpecific(value) {
  const cleaned = clean(value);
  if (evidenceLocatorContainsLocalVerificationPath(cleaned)) return false;
  if (evidenceLocatorContainsBlockedLocalPath(cleaned)) return false;
  if (evidenceLocatorContainsRejectedUrl(cleaned)) return false;
  return /^evt_[a-z0-9]{8,}$/i.test(cleaned);
}

function stripeDashboardEvidenceValueIsSpecific(value) {
  const cleaned = clean(value);
  if (evidenceLocatorContainsLocalVerificationPath(cleaned)) return false;
  if (evidenceLocatorContainsBlockedLocalPath(cleaned)) return false;
  if (evidenceLocatorContainsRejectedUrl(cleaned)) return false;
  if (valueContainsStripeDashboardUrl(cleaned)) {
    return (
      valueContainsSpecificStripeDashboardUrl(cleaned) &&
      !valueContainsGenericStripeDashboardUrl(cleaned)
    );
  }
  return evidenceIdentifierValueMatches(cleaned, [
    /stripe/i,
    /dashboard/i,
    /tax/i,
    /invoice/i,
  ]);
}

const measuredSessionDurationPattern =
  /\b(?:duration|window|measured[-_\s]?window)[-_: #=]*(?:[1-9]\d{0,3})\s?(?:m|min|mins|minutes|h|hr|hrs|hours)\b/i;

const hostedDeployRequiredInputPatterns = Object.freeze([
  /\bCI\b/,
  /\bmain\b/,
  /\bhosted_deploy_gate=true\b/,
  /\bhosted_environment=hosted-production\b/,
  /\bhosted_deploy_action=all\b/,
  /\bhosted_deploy_dry_run=false\b/,
]);

function hostedDeployWorkflowEvidenceValueIsSpecific(value) {
  const cleaned = clean(value);
  if (evidenceLocatorIssueReason(cleaned)) return false;
  if (!/\bhosted[-_\s]?deploy\b/i.test(cleaned)) return false;
  if (evidenceLocatorContainsGithubPullOrCommitUrl(cleaned)) return false;
  if (!evidenceLocatorContainsGithubActionsRunUrl(cleaned)) return false;
  return hostedDeployRequiredInputPatterns.every((pattern) =>
    pattern.test(cleaned),
  );
}

function hostedDeployWorkflowEvidenceIssueReason(value) {
  const locatorReason = evidenceLocatorIssueReason(value);
  if (locatorReason) return locatorReason;
  return hostedDeployWorkflowEvidenceValueIsSpecific(value)
    ? null
    : "missing_lane_terms";
}

function hardwareOsMatrixValueIsSpecific(value) {
  const cleaned = clean(value);
  if (evidenceLocatorIssueReason(cleaned)) return false;
  const rows = cleaned.split(/\s*(?:\||;)\s*/).filter(Boolean);
  if (rows.length < 3) return false;
  return [/windows/i, /mac\s?os/i, /linux/i].every((osPattern) =>
    rows.some(
      (row) =>
        osPattern.test(row) &&
        /\btitle\s*[:=]\s*[^|;]{2,}/i.test(row) &&
        /\bclient\s*[:=]\s*[^|;]{2,}/i.test(row) &&
        evidenceIdentifierValueIsSpecific(row),
    ),
  );
}

function sessionRunEvidenceValueIsSpecific(value) {
  const cleaned = clean(value);
  return (
    evidenceIdentifierValueMatchesAll(cleaned, [
      /session/i,
      /run/i,
      /overlay/i,
    ]) && measuredSessionDurationPattern.test(cleaned)
  );
}

const fieldSpecificEvidenceValidators = Object.freeze({
  "Community rollout evidence": (value) =>
    evidenceIdentifierValueMatchesAll(value, [
      /community/i,
      /artwork/i,
      /rollout/i,
    ]),
  "Hosted deploy evidence": hostedDeployWorkflowEvidenceValueIsSpecific,
  "Hardware profile": (value) =>
    evidenceIdentifierValueMatches(value, [/hardware/i, /profile/i]),
  "License key custody evidence": (value) =>
    evidenceIdentifierValueMatchesAll(value, [/license/i, /key/i, /custody/i]),
  "Live probe run ID": (value) =>
    evidenceIdentifierValueMatches(value, [/live/i, /probe/i]),
  "Live license issuance evidence": (value) =>
    evidenceIdentifierValueMatchesAll(value, [
      /live/i,
      /license/i,
      /issuance/i,
    ]),
  "Marketplace evidence": (value) =>
    evidenceIdentifierValueMatchesAll(value, [
      /marketplace/i,
      /plugin/i,
      /(?:execution|update)/i,
    ]),
  "OS/title/client matrix": hardwareOsMatrixValueIsSpecific,
  "Provider response evidence": (value) =>
    evidenceIdentifierValueMatches(value, [/provider/i, /response/i, /probe/i]),
  "Provider/client matrix": (value) =>
    evidenceIdentifierValueMatchesAll(value, [/matrix/i, /provider/i, /client/i]),
  "Run ID": runIdValueIsSpecific,
  "Session/run ID": sessionRunEvidenceValueIsSpecific,
  "Stripe Dashboard evidence": stripeDashboardEvidenceValueIsSpecific,
  "Stripe webhook event ID": stripeEventIdValueIsSpecific,
  "Supabase function log run ID": evidenceIdentifierValueIsSpecific,
});

function redactionNotesValueIsValid(value) {
  if (rejectedRedactionNotePattern.test(value)) return false;
  return positiveRedactionNotePatterns.some((pattern) => pattern.test(value));
}

function evidenceDetailValueIsValid(field, value, now = new Date(), env = {}) {
  return evidenceDetailValueIssueReason(field, value, now, env) === null;
}

function evidenceDetailValueIssueReason(
  field,
  value,
  now = new Date(),
  env = {},
  expected = null,
  options = {},
) {
  const cleaned = clean(value);
  if (!cleaned) return "missing";
  const normalized = cleaned.toLowerCase().replace(/[.!]+$/, "");
  if (placeholderEvidenceDetailValues.has(normalized)) return "placeholder";
  if (weakEvidenceDetailValuesByField[field]?.has(normalized)) return "weak";
  if (field === "Captured at")
    return timestampEvidenceIssueReason(cleaned, now);
  if (field === "Release ref")
    return releaseRefIssueReason(cleaned, env, options);
  if (field === "Commit SHA")
    return commitShaIssueReason(cleaned, env, options);
  if (field === "Redaction notes") {
    return redactionNotesValueIsValid(cleaned) ? null : "wrong_expected_value";
  }
  if (
    field ===
    "Redacted run IDs, dashboard links, screenshots, or signed deployment logs"
  ) {
    return evidenceLocatorValueIsSpecific(cleaned)
      ? null
      : (evidenceLocatorIssueReason(cleaned) ?? "malformed_locator");
  }
  if (field === "dry_run=false") {
    return /^(?:false|confirmed false|dry_run=false)$/i.test(cleaned)
      ? null
      : "wrong_expected_value";
  }
  const fieldValidator = fieldSpecificEvidenceValidators[field];
  if (fieldValidator && !fieldValidator(cleaned)) {
    return evidenceIdentifierIssueReason(cleaned) ?? "missing_lane_terms";
  }
  if (expected && !expected.test(cleaned)) return "wrong_expected_value";
  return null;
}

function supabaseProjectUrlIsConfigured(value, allowedPathPattern) {
  try {
    const url = new URL(value);
    const projectRefMatch = url.hostname.match(
      /^([a-z0-9]{20})\.supabase\.co$/i,
    );
    const projectRef = projectRefMatch?.[1];
    if (
      !projectRef ||
      /^(?:example|sample|placeholder|test|your-project-ref)$/i.test(projectRef)
    ) {
      return false;
    }
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash &&
      allowedPathPattern.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function secretValueLooksPlausible(value, minLength = 24) {
  if (value.length < minLength) return false;
  if (!/^[a-z0-9._~+/=-]+$/i.test(value)) return false;
  if (!/[a-z]/i.test(value) || !/[0-9]/.test(value)) return false;
  return !/(?:^|[-_.])(?:api[-_]?key|configured|dummy|example|placeholder|replace|sample|secret|test|token)(?:$|[-_.])/i.test(
    value,
  );
}

const envShapeValidators = Object.freeze({
  ACCOUNT_DELETION_PROCESSOR_SECRET: (value) =>
    secretValueLooksPlausible(value, 32),
  PRESENCE_POLL_SECRET: (value) => secretValueLooksPlausible(value, 32),
  PRESENCE_PROVIDER_TOKEN: (value) => secretValueLooksPlausible(value, 24),
  PRICE_DROP_NOTIFY_SECRET: (value) => secretValueLooksPlausible(value, 32),
  STEAM_WEB_API_KEY: (value) => /^[a-f0-9]{32}$/i.test(value),
  STRIPE_SECRET_KEY: (value) => /^sk_live_[a-z0-9]{16,}$/i.test(value),
  STRIPE_WEBHOOK_SECRET: (value) => /^whsec_[a-z0-9]{16,}$/i.test(value),
  SUPABASE_FUNCTIONS_URL: (value) =>
    supabaseProjectUrlIsConfigured(value, /^\/functions\/v1\/?$/),
  SUPABASE_FUNCTIONS_BASE_URL: (value) =>
    supabaseProjectUrlIsConfigured(value, /^\/functions\/v1\/?$/),
  SUPABASE_REST_URL: (value) =>
    supabaseProjectUrlIsConfigured(value, /^\/rest\/v1\/?$/),
  SUPABASE_URL: (value) => supabaseProjectUrlIsConfigured(value, /^\/?$/),
});

function envValueIssueReason(name, value) {
  const cleaned = clean(value);
  if (!cleaned) return "missing";
  const normalized = cleaned.toLowerCase().replace(/[.!]+$/, "");
  if (placeholderEnvironmentValues.has(normalized)) return "placeholder";
  if (normalized.includes("example.supabase.co")) return "placeholder";
  if (
    /^(?:your|replace|change|insert|paste|configured)[-_ ]/.test(normalized)
  ) {
    return "placeholder";
  }
  if (envShapeValidators[name] && !envShapeValidators[name](cleaned)) {
    return "malformed";
  }
  return null;
}

function envValueIsConfigured(name, value) {
  return envValueIssueReason(name, value) === null;
}

function envFindingsForGate(gate, env) {
  return gate.requiredEnv
    .map((name) => {
      const reason = envValueIssueReason(name, env[name]);
      return reason ? { name, reason } : null;
    })
    .filter(Boolean);
}

function evidenceValidationNow(env) {
  const configuredNow = clean(env.OGL_EXTERNAL_EVIDENCE_NOW);
  if (!configuredNow) return new Date();
  const parsed = new Date(configuredNow);
  return Number.isNaN(parsed.valueOf()) ? new Date() : parsed;
}

function evidenceDetailFindingsFromArtifactContent(
  path,
  content,
  requiredFields,
  now,
  expectedValues = {},
  env = {},
  options = {},
) {
  const lines = evidenceMarkdownLines(content);
  return requiredFields.flatMap((field) => {
    const pattern = new RegExp(
      `^\\s*[-*]\\s+${escapeRegExp(field)}:\\s*(\\S.*)$`,
    );
    const expected = expectedValues[field] ?? null;
    const values = lines
      .map((line) => clean(line.match(pattern)?.[1]))
      .filter(Boolean);

    if (values.length === 0) {
      return [{ field, path, reason: "missing" }];
    }

    const issueReasons = values
      .map((value) =>
        evidenceDetailValueIssueReason(
          field,
          value,
          now,
          env,
          expected,
          options,
        ),
      )
      .filter(Boolean);
    if (issueReasons.length === 0) {
      return [];
    }

    return [{ field, path, reason: issueReasons[0] ?? "malformed" }];
  });
}

function missingEvidenceDetailsFromArtifactContent(
  path,
  content,
  requiredFields,
  now,
  expectedValues = {},
  env = {},
  options = {},
) {
  return evidenceDetailFindingsFromArtifactContent(
    path,
    content,
    requiredFields,
    now,
    expectedValues,
    env,
    options,
  ).map(({ field, path }) => ({ field, path }));
}

function evidenceGroupDetailValueIsValid(group, field, value, now) {
  if (!evidenceDetailValueIsValid(field, value, now)) return false;
  const expected = group.expectedValues?.[field];
  if (!expected) return true;
  return expected.test(value);
}

function evidenceGroupDetailFindingsFromArtifactContent(
  path,
  content,
  groups,
  now,
  options = {},
) {
  return groups.flatMap((group) => {
    const lines = evidenceGroupLines(content, group.heading);
    return group.requiredFields.flatMap((field) => {
      const pattern = new RegExp(
        `^\\s*[-*]\\s+${escapeRegExp(field)}:\\s*(\\S.*)$`,
      );
      const expected = group.expectedValues?.[field] ?? null;
      const values = lines
        .map((line) => clean(line.match(pattern)?.[1]))
        .filter(Boolean);

      if (values.length === 0) {
        return [
          { field: `${group.heading}: ${field}`, path, reason: "missing" },
        ];
      }

      const issueReasons = values
        .map((value) =>
          evidenceDetailValueIssueReason(
            field,
            value,
            now,
            {},
            expected,
            options,
          ),
        )
        .filter(Boolean);
      if (issueReasons.length === 0) {
        return [];
      }

      return [
        {
          field: `${group.heading}: ${field}`,
          path,
          reason: issueReasons[0] ?? "malformed",
        },
      ];
    });
  });
}

function missingEvidenceGroupDetailsFromArtifactContent(
  path,
  content,
  groups,
  now,
  options = {},
) {
  return evidenceGroupDetailFindingsFromArtifactContent(
    path,
    content,
    groups,
    now,
    options,
  ).map(({ field, path }) => ({ field, path }));
}

function artifactHasTemplateOnlyBanner(content) {
  return evidenceMarkdownLines(content).some((line) =>
    /^>\s*Template only\b/i.test(line),
  );
}

function artifactHasCheckedRequiredProof(content, requiredProofs) {
  const requiredProofSet = new Set(requiredProofs);
  return evidenceMarkdownLines(content).some((line) => {
    const proof = line.match(/^\s*[-*]\s+\[[xX]\]\s+(.+?)\s*$/)?.[1]?.trim();
    return proof ? requiredProofSet.has(proof) : false;
  });
}

function artifactHasFilledEvidenceDetails(content, requiredFields) {
  const fieldPatterns = requiredFields.map(
    (field) => new RegExp(`^\\s*[-*]\\s+${escapeRegExp(field)}:\\s*(\\S.*)$`),
  );
  return evidenceMarkdownLines(content).some((line) =>
    fieldPatterns.some((pattern) => pattern.test(line)),
  );
}

function artifactHasFilledEvidenceGroupDetails(content, requiredGroups) {
  return requiredGroups.some((group) => {
    const fieldPatterns = group.requiredFields.map(
      (field) => new RegExp(`^\\s*[-*]\\s+${escapeRegExp(field)}:\\s*(\\S.*)$`),
    );
    return evidenceGroupLines(content, group.heading).some((line) =>
      fieldPatterns.some((pattern) => pattern.test(line)),
    );
  });
}

function templateOnlyFindingsFromArtifactContent(
  path,
  content,
  requiredProofs,
  requiredFields,
  requiredGroups = [],
) {
  if (!artifactHasTemplateOnlyBanner(content)) return [];
  if (
    !artifactHasCheckedRequiredProof(content, requiredProofs) &&
    !artifactHasFilledEvidenceDetails(content, requiredFields) &&
    !artifactHasFilledEvidenceGroupDetails(content, requiredGroups)
  ) {
    return [];
  }
  return [{ path }];
}

function proofEvidenceValueIsValid(value) {
  return proofEvidenceValueIssueReason(value) === null;
}

function proofEvidenceValueIssueReason(value) {
  const locatorReason = evidenceLocatorIssueReason(value);
  if (locatorReason) return locatorReason;
  return evidenceLocatorValueIsSpecific(value) ? null : "malformed_locator";
}

function expectedProofEvidenceValuePatterns(proof) {
  const normalizedProof = proof.toLowerCase();
  if (/stripe webhook signature/.test(normalizedProof)) {
    return [
      /(?:stripe[-_\s]?webhook|webhook[-_\s]?signature|dashboard\.stripe\.com\/(?:accts?\/[^/]+\/)?(?:events\/evt_[a-z0-9]{8,}|webhooks\/we_[a-z0-9]{8,})|evt_[a-z0-9]{8,})/i,
    ];
  }
  if (/stripe tax and invoice/.test(normalizedProof)) {
    return [
      /(?:stripe[-_\s]?(?:tax|invoice)|dashboard[-_\s]?(?:tax|invoice)|tax[-_\s]?invoice|dashboard\.stripe\.com\/(?:accts?\/[^/]+\/)?(?:settings\/(?:billing|invoice|invoicing|tax)|invoices\/in_[a-z0-9]{8,}|tax\/(?:calculations|registrations|settings|transactions)\/.+))/i,
    ];
  }
  if (/license signing key custody/.test(normalizedProof)) {
    return [/license/i, /key/i, /custody/i, /live/i, /issuance/i];
  }
  if (/(?:price-drop|notify-price-drop)/.test(normalizedProof)) {
    return [
      /(?:price[-_\s]?drop|notify[-_\s]?price[-_\s]?drop|store_price_drop_notification_runs)/i,
    ];
  }
  if (/poll-platform-presence/.test(normalizedProof)) {
    return [
      /(?:presence[-_\s]?poll|poll[-_\s]?platform[-_\s]?presence|presence_poll_runs)/i,
    ];
  }
  if (/process-account-deletions/.test(normalizedProof)) {
    return [
      /(?:account[-_\s]?deletions?|process[-_\s]?account[-_\s]?deletions|account_deletion_processor_runs)/i,
    ];
  }
  if (/non-steam presence/.test(normalizedProof)) {
    return [/non[-_\s]?steam/i, /presence/i, /bridge/i, /provider/i];
  }
  if (/provider-approved catalog\/cloud/.test(normalizedProof)) {
    return [/provider[-_\s]?approved/i, /catalog/i, /cloud[-_\s]?transfer/i];
  }
  if (/achievement\/provider cache/.test(normalizedProof)) {
    return [/achievement/i, /provider[-_\s]?cache/i, /real[-_\s]?client/i];
  }
  if (/fullscreen\/anti-cheat overlay/.test(normalizedProof)) {
    return [/fullscreen/i, /anti[-_\s]?cheat/i, /overlay/i];
  }
  if (/long native overlay sessions/.test(normalizedProof)) {
    return [
      /native[-_\s]?overlay/i,
      /(?:long[-_\s]?session|runtime[-_\s]?session)/i,
      measuredSessionDurationPattern,
    ];
  }
  if (/external-drive backup\/restore/.test(normalizedProof)) {
    return [
      /(?:external[-_\s]?drive|backup[-_\s]?restore)/i,
      /windows/i,
      /mac\s?os/i,
      /linux/i,
    ];
  }
  if (/real client mount\/apply/.test(normalizedProof)) {
    return [
      /client[-_\s]?mount/i,
      /mount[-_\s]?apply/i,
      /provider[-_\s]?clients?/i,
    ];
  }
  if (/hosted community artwork rollout/.test(normalizedProof)) {
    return [/community/i, /artwork/i, /rollout/i];
  }
  if (/plugin marketplace/.test(normalizedProof)) {
    return [
      /plugin[-_\s]?marketplace/i,
      /marketplace[-_\s]?execution/i,
      /(?:marketplace[-_\s]?update|plugin[-_\s]?update|execution[-_\s]?update)/i,
    ];
  }
  if (/hosted production deployment/.test(normalizedProof)) {
    return [
      /(?:hosted[-_\s]?(?:production[-_\s]?)?deploy|production[-_\s]?deployment|deployment)/i,
    ];
  }
  return [];
}

function proofEvidenceValueIsValidForProof(proof, value) {
  return proofEvidenceValueIssueReasonForProof(proof, value) === null;
}

function proofEvidenceValueIssueReasonForProof(proof, value) {
  if (
    /stripe webhook signature/i.test(proof) &&
    stripeEventIdValueIsSpecific(value)
  ) {
    return null;
  }
  if (/hosted production deployment/i.test(proof)) {
    return hostedDeployWorkflowEvidenceIssueReason(value);
  }
  const locatorReason = proofEvidenceValueIssueReason(value);
  if (locatorReason) return locatorReason;
  if (
    /stripe (?:webhook signature|tax and invoice)/i.test(proof) &&
    valueContainsGenericStripeDashboardUrl(value)
  ) {
    return "missing_lane_terms";
  }
  const expectedPatterns = expectedProofEvidenceValuePatterns(proof);
  return expectedPatterns.every((pattern) => pattern.test(value))
    ? null
    : "missing_lane_terms";
}

function proofEvidenceFindingsFromArtifactContent(
  path,
  content,
  requiredProofs,
) {
  const lines = evidenceMarkdownLines(content);
  const verifiedProofs = verifiedProofsFromArtifactContent(content);
  const evidenceByProof = new Map();

  for (const line of lines) {
    const match = line.match(/^\s*[-*]\s+Evidence for (.+?):\s*(\S.*)$/);
    if (!match) continue;
    const proof = match[1].trim();
    const value = clean(match[2]);
    if (!evidenceByProof.has(proof)) evidenceByProof.set(proof, []);
    evidenceByProof.get(proof).push(value);
  }

  return requiredProofs
    .filter((proof) => verifiedProofs.has(proof))
    .flatMap((proof) => {
      const values = evidenceByProof.get(proof) ?? [];
      if (values.length === 0) {
        return [
          { field: `Evidence for ${proof}`, path, proof, reason: "missing" },
        ];
      }

      const issueReasons = values
        .map((value) => proofEvidenceValueIssueReasonForProof(proof, value))
        .filter(Boolean);
      if (issueReasons.length === 0) {
        return [];
      }
      return [
        {
          field: `Evidence for ${proof}`,
          path,
          proof,
          reason: issueReasons[0] ?? "malformed_locator",
        },
      ];
    });
}

function proofEvidenceDetailsFromArtifactContent(
  path,
  content,
  requiredProofs,
) {
  return proofEvidenceFindingsFromArtifactContent(
    path,
    content,
    requiredProofs,
  ).map(({ field, path }) => ({ field, path }));
}

export function parseArgs(argv) {
  const positional = [];
  for (const arg of argv) {
    if (arg.startsWith("-")) {
      throw new Error(
        `Unknown external evidence option. Use one of: ${actionNames.join(", ")}.`,
      );
    }
    positional.push(arg);
  }
  if (positional.length > 1) {
    throw new Error("Expected at most one external evidence action.");
  }
  const requestedAction = positional[0] ?? "plan";
  if (!actions.has(requestedAction)) {
    throw new Error(
      `Unknown external evidence action. Use one of: ${actionNames.join(", ")}.`,
    );
  }
  return { action: actionAliases[requestedAction] ?? requestedAction };
}

export function selectedGates(env = process.env) {
  const requested = clean(env.OGL_EXTERNAL_EVIDENCE_GATES);
  if (!requested) return [...evidenceGates];

  const known = new Map(evidenceGates.map((gate) => [gate.id, gate]));
  const requestedIds = requested
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (requestedIds.length === 0) {
    throw new Error(
      `OGL_EXTERNAL_EVIDENCE_GATES selected no gates. Use one of: ${Array.from(
        known.keys(),
      ).join(", ")}.`,
    );
  }
  const duplicateRequested = requestedIds.some(
    (id, index) => requestedIds.indexOf(id) !== index,
  );
  if (duplicateRequested) {
    throw new Error(
      `OGL_EXTERNAL_EVIDENCE_GATES must not include duplicate gates. Use one of: ${Array.from(
        known.keys(),
      ).join(", ")}.`,
    );
  }

  return requestedIds.map((id) => {
    const gate = known.get(id);
    if (!gate) {
      throw new Error(
        `Unknown OGL_EXTERNAL_EVIDENCE_GATES item. Use one of: ${Array.from(
          known.keys(),
        ).join(", ")}.`,
      );
    }
    return gate;
  });
}

function hasScopedGateSelection(env = process.env) {
  return clean(env.OGL_EXTERNAL_EVIDENCE_GATES) !== "";
}

function statusValidationOptions(env = process.env) {
  return {
    requireReleaseBoundaryIdentity: !hasScopedGateSelection(env),
  };
}

export function gateStatus(
  gate,
  env = process.env,
  fileExists = existsSync,
  readFile = readFileSync,
  options = {},
) {
  const envFindings = envFindingsForGate(gate, env);
  const missingEnv = envFindings.map((finding) => finding.name);
  const missingArtifacts = gate.artifactPaths.filter(
    (path) => !fileExists(path),
  );
  const artifactContents = [];
  const evidenceDetailFindings = [];
  const missingArtifactProofs = [];
  const missingEvidenceDetails = [];
  const proofEvidenceFindings = [];
  const hostedCronReceiptFindings = [];
  const secretFindings = [];
  const templateOnlyFindings = [];
  const unreadableArtifacts = [];
  const now = evidenceValidationNow(env);
  const receiptContext = hostedCronReceiptContext(env, fileExists, readFile);

  for (const path of gate.artifactPaths) {
    if (missingArtifacts.includes(path)) continue;
    try {
      const content = readFile(path, "utf8");
      const artifactProofRequirements = requiredProofsForArtifact(gate, path);
      const artifactDetailRequirements =
        requiredEvidenceDetailFieldsForArtifact(gate, path);
      artifactContents.push(String(content));
      if (gate.artifactProofs) {
        const artifactProofs = verifiedProofsFromArtifactContent(content);
        for (const proof of artifactProofRequirements) {
          if (artifactProofs.has(proof)) continue;
          missingArtifactProofs.push({
            path,
            proof,
          });
        }
      }
      const artifactEvidenceDetailFindings =
        evidenceDetailFindingsFromArtifactContent(
          path,
          content,
          artifactDetailRequirements,
          now,
          expectedEvidenceValuesForArtifact(gate, path),
          env,
          options,
        );
      evidenceDetailFindings.push(...artifactEvidenceDetailFindings);
      missingEvidenceDetails.push(
        ...artifactEvidenceDetailFindings.map(({ field, path }) => ({
          field,
          path,
        })),
      );
      const artifactEvidenceGroupFindings =
        evidenceGroupDetailFindingsFromArtifactContent(
          path,
          content,
          requiredEvidenceGroupsForArtifact(gate, path),
          now,
          options,
        );
      evidenceDetailFindings.push(...artifactEvidenceGroupFindings);
      missingEvidenceDetails.push(
        ...artifactEvidenceGroupFindings.map(({ field, path }) => ({
          field,
          path,
        })),
      );
      const artifactProofEvidenceFindings =
        proofEvidenceFindingsFromArtifactContent(
          path,
          content,
          artifactProofRequirements,
        );
      proofEvidenceFindings.push(...artifactProofEvidenceFindings);
      missingEvidenceDetails.push(
        ...artifactProofEvidenceFindings.map(({ field, path }) => ({
          field,
          path,
        })),
      );
      hostedCronReceiptFindings.push(
        ...hostedCronReceiptFindingsFromArtifactContent(
          gate,
          path,
          content,
          receiptContext,
        ),
      );
      templateOnlyFindings.push(
        ...templateOnlyFindingsFromArtifactContent(
          path,
          content,
          artifactProofRequirements,
          artifactDetailRequirements,
          requiredEvidenceGroupsForArtifact(gate, path),
        ),
      );
      for (const finding of scanForbiddenArtifactContent(path, content)) {
        secretFindings.push(finding);
      }
    } catch (error) {
      unreadableArtifacts.push({
        path,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const verifiedProofs = verifiedProofsFromArtifactContent(
    artifactContents.join("\n"),
  );
  const missingProofs = gate.requiredProofs.filter(
    (proof) => !verifiedProofs.has(proof),
  );

  return {
    id: gate.id,
    evidenceDetailFindings,
    envFindings,
    missingArtifacts,
    missingEnv,
    missingProofs,
    proofEvidenceFindings,
    ready:
      missingEnv.length === 0 &&
      missingArtifacts.length === 0 &&
      missingProofs.length === 0 &&
      missingArtifactProofs.length === 0 &&
      missingEvidenceDetails.length === 0 &&
      hostedCronReceiptFindings.length === 0 &&
      secretFindings.length === 0 &&
      templateOnlyFindings.length === 0 &&
      unreadableArtifacts.length === 0,
    missingArtifactProofs,
    missingEvidenceDetails,
    hostedCronReceiptFindings,
    secretFindings,
    templateOnlyFindings,
    unreadableArtifacts,
  };
}

function artifactReadyStatus(status) {
  return (
    status.missingArtifacts.length === 0 &&
    status.missingProofs.length === 0 &&
    status.missingArtifactProofs.length === 0 &&
    status.missingEvidenceDetails.length === 0 &&
    status.proofEvidenceFindings.length === 0 &&
    status.hostedCronReceiptFindings.length === 0 &&
    status.secretFindings.length === 0 &&
    status.templateOnlyFindings.length === 0 &&
    status.unreadableArtifacts.length === 0
  );
}

export function collectStatuses(
  env = process.env,
  fileExists = existsSync,
  readFile = readFileSync,
) {
  const options = statusValidationOptions(env);
  return selectedGates(env).map((gate) =>
    gateStatus(gate, env, fileExists, readFile, options),
  );
}

export function statusReport(
  env = process.env,
  fileExists = existsSync,
  readFile = readFileSync,
) {
  const options = statusValidationOptions(env);
  const gates = selectedGates(env).map((gate) => {
    const status = gateStatus(gate, env, fileExists, readFile, options);
    return {
      ...status,
      commands: recommendedCommandsForGate(gate, status),
    };
  });
  const readyCount = gates.filter((gate) => gate.ready).length;

  return {
    gates,
    missingCount: gates.length - readyCount,
    ready: readyCount === gates.length,
    readyCount,
    totalCount: gates.length,
  };
}

export function artifactTemplate(gate, artifactPath) {
  const requiredProofs = requiredProofsForArtifact(gate, artifactPath);
  const requiredArtifactEnv = requiredEnvForArtifact(gate, artifactPath);
  const hostedCronCollectorPrerequisites =
    hostedCronCollectorPrerequisitesForArtifact(gate, artifactPath);
  const requiredArtifactEvidenceFields = requiredEvidenceFieldsForArtifact(
    gate,
    artifactPath,
  );
  const requiredArtifactEvidenceGroups = requiredEvidenceGroupsForArtifact(
    gate,
    artifactPath,
  );
  return [
    `# ${titleForArtifact(gate, artifactPath)} Evidence`,
    "",
    `Gate: \`${gate.id}\``,
    `Artifact: \`${artifactPath}\``,
    "",
    "> Template only. No external evidence has been captured yet; leave proof rows unchecked until live evidence is attached and redacted.",
    "",
    "## Required Environment Names",
    "",
    ...(requiredArtifactEnv.length === 0
      ? ["- none"]
      : requiredArtifactEnv.map(
          (name) => `- \`${name}\` set in the external run environment`,
        )),
    "",
    ...(hostedCronCollectorPrerequisites.length === 0
      ? []
      : [
          "## Hosted Cron REST Collector Environment",
          "",
          "Required when running `pnpm hosted:cron-evidence`, `pnpm hosted:cron-evidence:packet`, or `pnpm hosted:cron-evidence:artifact-hints` for this artifact; these values collect row evidence only and do not satisfy proof rows by themselves.",
          "",
          ...hostedCronCollectorPrerequisites.map(
            (name) => `- \`${name}\` set in the operator shell`,
          ),
          "",
        ]),
    "## Required Proof Checklist",
    "",
    "Check a row only after capturing and redacting its live evidence. `pnpm external:evidence:preflight` accepts `- [x]` only in the artifact assigned to that proof.",
    "",
    ...requiredProofs.map((proof) => `- [ ] ${proof}`),
    "",
    "## Capture Handoff",
    "",
    "Use these handoffs to collect redacted live evidence. Handoffs are guidance only; they do not execute commands or satisfy preflight by themselves.",
    "",
    ...captureHandoffsForArtifact(gate, artifactPath).map(
      (handoff) => `- ${formatCaptureHandoff(handoff)}`,
    ),
    "",
    "## Proof Evidence Mapping",
    "",
    "For every checked proof, add a specific redacted run/dashboard/workflow/artifact locator, signed log, or `sha256:<64-hex>` reference. Accepted dashboard URL hosts are Supabase, Stripe live Dashboard, GitHub Actions/releases/deployments, Vercel, Netlify, Cloudflare, App Store Connect, and Google Play Console; otherwise use `run:`/`artifact:`/`sha256:`. Local/example URLs and generic text do not pass.",
    "Stripe Dashboard evidence must use a concrete event, invoice, or tax/invoice-settings path, not generic `/settings`, `/customers`, or `/payments` pages.",
    "Proof evidence values must name the proof lane: `stripe-webhook`, `stripe-tax-invoice`, `license-key-custody-live-license-issuance`, `price-drop`, `presence-poll`, `account-deletion`, `non-steam-presence-bridge-provider`, `provider-approved-catalog-cloud-transfer`, `achievement-provider-cache-real-client`, `fullscreen-anti-cheat-overlay`, `backup-restore`, `client-mount-apply-provider-client`, `community-artwork-rollout`, `plugin-marketplace-execution-update`, or `hosted-deploy`. Compound values must include their required providers, OSes, duration/window, and matrix fields; bare `evt_...` is accepted only for Stripe webhook proof.",
    "",
    ...requiredProofs.map((proof) => `- Evidence for ${proof}:`),
    "",
    "## Gate-Specific Evidence",
    "",
    requiredArtifactEvidenceFields.length === 0
      ? "- none"
      : "Add concrete redacted locators or IDs containing digits (`run:`, `probe-`, `session-`, `workflow-`, `deployment-`, or `artifact-`). Hosted cron Run IDs may use lane-specific collector IDs; Stripe webhook IDs must be bare `evt_...` values.",
    ...(requiredArtifactEvidenceFields.includes("Provider/client matrix")
      ? [
          "Provider/client matrix values must include `matrix`, `provider`, and `client`.",
        ]
      : []),
    ...(requiredArtifactEvidenceFields.includes("Community rollout evidence")
      ? [
          "Community rollout evidence must include `community`, `artwork`, and `rollout`.",
        ]
      : []),
    ...(requiredArtifactEvidenceFields.includes("Marketplace evidence")
      ? [
          "Marketplace evidence must include `plugin`, `marketplace`, and either `execution` or `update`.",
        ]
      : []),
    ...(requiredArtifactEvidenceFields.includes("Hosted deploy evidence")
      ? [
          "Hosted deploy evidence must include `hosted-deploy`, a GitHub Actions run URL, `CI`, `main`, `hosted_deploy_gate=true`, `hosted_environment=hosted-production`, `hosted_deploy_action=all`, and `hosted_deploy_dry_run=false`.",
        ]
      : []),
    ...(requiredArtifactEvidenceFields.includes("OS/title/client matrix")
      ? [
          "OS/title/client matrix values must include one `Windows`, one `macOS`, and one `Linux` row separated by `|` or `;`; each row must include `title:`, `client:`, and a specific locator.",
        ]
      : []),
    ...(requiredArtifactEvidenceFields.includes("Session/run ID")
      ? [
          "Session/run ID values must include `overlay`, `session`/`run`, and a numeric duration/window such as `duration:30m`.",
        ]
      : []),
    ...(requiredArtifactEvidenceFields.includes("Hosted cron table")
      ? [
          "Expected hosted cron values: `Hosted cron table: store_price_drop_notification_runs`, `Function: notify-price-drop`, `Scheduled: scheduled`, `dry_run=false: false` or `confirmed false`, and `Status: completed`.",
        ]
      : []),
    "",
    ...(requiredArtifactEvidenceFields.length === 0
      ? []
      : requiredArtifactEvidenceFields.map((field) => `- ${field}:`)),
    ...(requiredArtifactEvidenceFields.some((field) =>
      hostedCronEvidenceFields.includes(field),
    )
      ? [`- ${hostedCronReceiptDigestField}:`]
      : []),
    ...(requiredArtifactEvidenceFields.length === 0 ? [] : [""]),
    "## Lane-Specific Evidence",
    "",
    requiredArtifactEvidenceGroups.length === 0
      ? "- none"
      : "Fill one section per lane with the matching `pnpm hosted:cron-evidence:artifact-hints` output after operator review. A single hosted cron detail block cannot satisfy multiple scheduled lanes.",
    ...(requiredArtifactEvidenceGroups.length === 0
      ? []
      : [
          "Expected hosted cron values: `Hosted cron table: store_price_drop_notification_runs`, `Function: notify-price-drop`, `Scheduled: scheduled`, `dry_run=false: false` or `confirmed false`, and `Status: completed` for price-drop; `Hosted cron table: presence_poll_runs`, `Function: poll-platform-presence`, `Scheduled: scheduled`, `dry_run=false: false` or `confirmed false`, and `Status: completed` for presence-poll; `Hosted cron table: account_deletion_processor_runs`, `Function: process-account-deletions`, `Scheduled: scheduled`, `dry_run=false: false` or `confirmed false`, and `Status: completed` for account-deletion.",
        ]),
    "",
    ...requiredArtifactEvidenceGroups.flatMap((group) => [
      `### ${group.heading}`,
      "",
      ...group.requiredFields.map((field) => `- ${field}:`),
      ...(group.requiredFields.some((field) =>
        hostedCronEvidenceFields.includes(field),
      )
        ? [`- ${hostedCronReceiptDigestField}:`]
        : []),
      "",
    ]),
    "## Evidence Captured",
    "",
    "Preflight requires non-empty, non-placeholder values below. `Captured at` is a current UTC ISO-8601 timestamp (at most 30 days old and no more than 10 minutes ahead). `Release ref` and the full 40-hex `Commit SHA` must match release CI context. Use positive redaction wording such as `raw secrets removed`; local/private/example locators are invalid.",
    "",
    "- Captured at:",
    "- Release ref:",
    "- Commit SHA:",
    "- Operator:",
    "- Environment:",
    "- Redacted run IDs, dashboard links, screenshots, or signed deployment logs:",
    "- Redaction notes:",
    "",
    "## Secret Handling",
    "",
    "Preflight scans artifact content for secret-shaped values.",
    "",
    "- Raw provider keys, Stripe secrets, bearer tokens, JWTs, Supabase service-role/auth/access tokens, scheduler secrets, private keys, and webhook secrets are absent.",
    "- Logs and screenshots are redacted before this artifact is committed.",
  ].join("\n");
}

function compactList(values, limit = 6) {
  const uniqueValues = [...new Set(values)].filter(Boolean);
  if (uniqueValues.length <= limit) return uniqueValues;
  return [
    ...uniqueValues.slice(0, limit),
    `${uniqueValues.length - limit} more`,
  ];
}

function formatInlineList(values) {
  return values.length === 0 ? "none" : values.join("; ");
}

function formatFindingReason(item) {
  return `${item.field} (${item.reason})`;
}

function gateUsesHostedCronEvidence(gate) {
  return (
    gate.artifactEvidenceFields?.some((item) =>
      item.requiredFields.some((field) =>
        hostedCronEvidenceFields.includes(field),
      ),
    ) ||
    gate.artifactEvidenceGroups?.some((item) =>
      item.groups.some((group) =>
        group.requiredFields.some((field) =>
          hostedCronEvidenceFields.includes(field),
        ),
      ),
    ) ||
    false
  );
}

function artifactUsesHostedCronEvidence(gate, artifactPath) {
  return (
    gate.artifactEvidenceFields
      ?.find((item) => item.path === artifactPath)
      ?.requiredFields.some((field) =>
        hostedCronEvidenceFields.includes(field),
      ) ||
    gate.artifactEvidenceGroups
      ?.find((item) => item.path === artifactPath)
      ?.groups.some((group) =>
        group.requiredFields.some((field) =>
          hostedCronEvidenceFields.includes(field),
        ),
      ) ||
    false
  );
}

function hostedCronEvidenceCheckIdsForGate(gate) {
  if (!gateUsesHostedCronEvidence(gate)) return [];
  if (gate.id === "store-stripe-live") return ["price-drop"];
  return ["price-drop", "presence-poll", "account-deletion"];
}

function hostedCronEvidenceCommandPrefix(checkIds) {
  const allCheckIds = ["price-drop", "presence-poll", "account-deletion"];
  const includesAllChecks =
    checkIds.length === allCheckIds.length &&
    checkIds.every((id, index) => id === allCheckIds[index]);
  if (includesAllChecks) return "";
  return `OGL_HOSTED_CRON_EVIDENCE_CHECKS=${checkIds.join(",")} `;
}

function hostedCronCollectorPrerequisitesForGate(gate) {
  return gateUsesHostedCronEvidence(gate)
    ? [...hostedCronRestCollectorPrerequisites]
    : [];
}

function hostedCronCollectorPrerequisitesForArtifact(gate, artifactPath) {
  return artifactUsesHostedCronEvidence(gate, artifactPath)
    ? [...hostedCronRestCollectorPrerequisites]
    : [];
}

function pushHostedCronCollectorPrerequisites(lines, gate) {
  const prerequisites = hostedCronCollectorPrerequisitesForGate(gate);
  if (prerequisites.length === 0) return;
  lines.push(
    `- Hosted cron REST collector env: ${formatInlineList(prerequisites)}`,
  );
}

function pushHostedDeployProofHandoff(lines, gate) {
  if (gate.id !== "rollout-tracks") return;
  lines.push(
    "- Hosted deploy proof: run GitHub Actions `CI` from `main` with `hosted_deploy_gate=true`, `hosted_environment=hosted-production`, `hosted_deploy_action=all`, and `hosted_deploy_dry_run=false`; paste a labelled locator such as `hosted-deploy CI main hosted_deploy_gate=true hosted_environment=hosted-production hosted_deploy_action=all hosted_deploy_dry_run=false workflow: https://github.com/<owner>/<repo>/actions/runs/<id>` into `Evidence for Hosted production deployment evidence is attached.` and `Hosted deploy evidence`.",
  );
}

function captureHandoffForProof(gate, proof) {
  const handoff = gate.captureHandoffs?.[proof];
  return {
    capture:
      handoff?.capture ??
      "No capture handoff is configured; update external evidence tooling before release.",
    proof,
    terms: handoff?.terms ?? [],
  };
}

function captureHandoffsForArtifact(gate, artifactPath) {
  return requiredProofsForArtifact(gate, artifactPath).map((proof) =>
    captureHandoffForProof(gate, proof),
  );
}

function captureHandoffsForGate(gate) {
  return gate.artifactPaths.flatMap((artifactPath) =>
    captureHandoffsForArtifact(gate, artifactPath),
  );
}

function formatCaptureHandoff(handoff) {
  const terms =
    handoff.terms.length === 0
      ? ""
      : ` Evidence cues: ${handoff.terms.map((term) => `\`${term}\``).join(", ")}.`;
  return `${handoff.proof}: ${handoff.capture}${terms}`;
}

function pushCaptureHandoffs(lines, handoffs, { indent = "- " } = {}) {
  for (const handoff of handoffs) {
    lines.push(`${indent}${formatCaptureHandoff(handoff)}`);
  }
}

function fieldRequirementHint(field, group = null) {
  if (group && hostedCronEvidenceFields.includes(field)) {
    return "paste the reviewed hosted cron artifact-hints row for this lane with scheduled, non-dry-run, completed evidence";
  }

  if (hostedCronEvidenceFields.includes(field)) {
    return "paste reviewed hosted cron artifact-hints output with scheduled, non-dry-run, completed evidence";
  }

  switch (field) {
    case "Captured at":
      return "current UTC ISO-8601 timestamp from the external capture";
    case "Release ref":
      return "release tag or release ref for the external run";
    case "Commit SHA":
      return "full 40-hex commit SHA for the release checkout";
    case "Operator":
      return "human or automation owner for the external capture";
    case "Environment":
      return "external environment name, not local";
    case "Redacted run IDs, dashboard links, screenshots, or signed deployment logs":
      return "specific accepted external locator or signed log, with secrets redacted";
    case "Redaction notes":
      return "positive redaction statement such as raw secrets removed or tokens redacted";
    case "Provider/client matrix":
      return "include matrix, provider, and client evidence";
    case "Community rollout evidence":
      return "include community artwork rollout evidence";
    case "Marketplace evidence":
      return "include plugin marketplace execution or update review evidence";
    case "Hosted deploy evidence":
      return "include hosted-deploy, GitHub Actions run URL, CI, main, hosted_deploy_gate=true, hosted_environment=hosted-production, hosted_deploy_action=all, hosted_deploy_dry_run=false";
    case "OS/title/client matrix":
      return "include Windows, macOS, and Linux rows, each with title, client, and external locator";
    case "Session/run ID":
      return "include overlay session or run plus measured numeric duration or window";
    default:
      return "specific accepted external locator or ID; keep secrets redacted";
  }
}

function proofEvidenceRequirementHint(gate, proof) {
  const handoff = captureHandoffForProof(gate, proof);
  const cueText =
    handoff.terms.length === 0
      ? ""
      : `include cues ${handoff.terms.map((term) => `\`${term}\``).join(", ")}; `;
  return `${cueText}include a specific accepted external locator or ID; keep secrets redacted`;
}

function pushUniqueFillRow(rows, seen, label, hint = "") {
  const row = hint ? `${label} - ${hint}` : label;
  if (seen.has(row)) return;
  seen.add(row);
  rows.push(row);
}

function artifactFillRows(gate, status, artifactPath) {
  const artifactUnavailable =
    status.missingArtifacts.includes(artifactPath) ||
    status.unreadableArtifacts.some((item) => item.path === artifactPath);
  const missingProofs = artifactUnavailable
    ? requiredProofsForArtifact(gate, artifactPath)
    : artifactMissingProofs(gate, status, artifactPath);
  const missingDetailFields = status.missingEvidenceDetails
    .filter((item) => item.path === artifactPath)
    .map((item) => item.field);
  const missingDetailSet = new Set(missingDetailFields);
  const rows = [];
  const seen = new Set();

  for (const proof of missingProofs) {
    pushUniqueFillRow(
      rows,
      seen,
      `Proof row: ${proof}`,
      "check only after live evidence is captured and redacted",
    );
  }

  const proofEvidenceFields = new Set([
    ...missingProofs.map((proof) => `Evidence for ${proof}`),
    ...missingDetailFields.filter((field) => field.startsWith("Evidence for ")),
  ]);
  for (const field of proofEvidenceFields) {
    const proof = field.replace(/^Evidence for\s+/, "");
    pushUniqueFillRow(
      rows,
      seen,
      `Proof evidence row: ${field}:`,
      proofEvidenceRequirementHint(gate, proof),
    );
  }

  const gateSpecificFields = new Set(
    requiredEvidenceFieldsForArtifact(gate, artifactPath),
  );
  for (const field of requiredEvidenceDetailFieldsForArtifact(
    gate,
    artifactPath,
  )) {
    if (!artifactUnavailable && !missingDetailSet.has(field)) continue;
    const labelPrefix = gateSpecificFields.has(field)
      ? "Gate-specific evidence row"
      : "Evidence detail row";
    pushUniqueFillRow(
      rows,
      seen,
      `${labelPrefix}: ${field}:`,
      fieldRequirementHint(field),
    );
  }

  for (const group of requiredEvidenceGroupsForArtifact(gate, artifactPath)) {
    for (const field of group.requiredFields) {
      const detailField = `${group.heading}: ${field}`;
      if (!artifactUnavailable && !missingDetailSet.has(detailField)) continue;
      pushUniqueFillRow(
        rows,
        seen,
        `Lane-specific evidence row: ${group.heading} / ${field}:`,
        fieldRequirementHint(field, group),
      );
    }
  }

  return rows;
}

function pushArtifactFillRows(lines, gate, status, artifactPath) {
  lines.push("- Rows to fill:");
  const rows = artifactFillRows(gate, status, artifactPath);
  if (rows.length === 0) {
    lines.push("  - none");
    return;
  }

  for (const row of rows) {
    lines.push(`  - ${row}`);
  }
}

function recommendedCommandsForGate(gate, status) {
  const commands = new Set([
    `OGL_EXTERNAL_EVIDENCE_GATES=${gate.id} pnpm external:evidence:status`,
  ]);

  if (
    status.missingArtifacts.length > 0 ||
    status.missingProofs.length > 0 ||
    status.missingArtifactProofs.length > 0 ||
    status.missingEvidenceDetails.length > 0 ||
    status.templateOnlyFindings.length > 0
  ) {
    commands.add(
      `OGL_EXTERNAL_EVIDENCE_GATES=${gate.id} pnpm external:evidence:template`,
    );
  }

  const hostedCronCheckIds = hostedCronEvidenceCheckIdsForGate(gate);
  if (hostedCronCheckIds.length > 0) {
    const prefix = hostedCronEvidenceCommandPrefix(hostedCronCheckIds);
    commands.add("pnpm hosted:deploy-gate:scheduler-packet");
    commands.add(`${prefix}pnpm hosted:cron-evidence:plan`);
    commands.add(`${prefix}pnpm hosted:cron-evidence`);
    commands.add(`${prefix}pnpm hosted:cron-evidence:packet`);
    commands.add(`${prefix}pnpm hosted:cron-evidence:artifact-hints`);
  }

  if (gate.id === "rollout-tracks") {
    commands.add("pnpm hosted:deploy-gate:plan");
    commands.add("pnpm hosted:deploy-gate:packet");
    commands.add(hostedDeployProofRunHandoff);
  }

  commands.add(
    `OGL_EXTERNAL_EVIDENCE_GATES=${gate.id} pnpm external:evidence:preflight`,
  );
  return [...commands];
}

function artifactMissingProofs(gate, status, artifactPath) {
  if (status.missingArtifacts.includes(artifactPath)) {
    return requiredProofsForArtifact(gate, artifactPath);
  }

  if (gate.artifactProofs) {
    return status.missingArtifactProofs
      .filter((item) => item.path === artifactPath)
      .map((item) => item.proof);
  }

  const artifactProofs = new Set(requiredProofsForArtifact(gate, artifactPath));
  return status.missingProofs.filter((proof) => artifactProofs.has(proof));
}

function artifactState(gate, status, artifactPath) {
  if (status.missingArtifacts.includes(artifactPath)) return "missing artifact";
  if (status.unreadableArtifacts.some((item) => item.path === artifactPath)) {
    return "unreadable artifact";
  }

  const hasMissingProofs =
    artifactMissingProofs(gate, status, artifactPath).length > 0;
  const hasMissingDetails = status.missingEvidenceDetails.some(
    (item) => item.path === artifactPath,
  );
  const hasProofEvidenceFindings = status.proofEvidenceFindings.some(
    (item) => item.path === artifactPath,
  );
  const hasHostedCronReceiptFindings = status.hostedCronReceiptFindings.some(
    (item) => item.path === artifactPath || item.path.startsWith(`${artifactPath}#`),
  );
  const hasBlockers =
    status.secretFindings.some((item) => item.path === artifactPath) ||
    status.templateOnlyFindings.some((item) => item.path === artifactPath);

  if (hasBlockers) return "blocked";
  if (
    hasMissingProofs ||
    hasMissingDetails ||
    hasProofEvidenceFindings ||
    hasHostedCronReceiptFindings
  ) {
    return "needs evidence";
  }
  return "artifact ready";
}

export function artifactWorklistReport(
  env = process.env,
  fileExists = existsSync,
  readFile = readFileSync,
) {
  const gates = selectedGates(env);
  const options = statusValidationOptions(env);
  const statuses = gates.map((gate) => ({
    gate,
    status: gateStatus(gate, env, fileExists, readFile, options),
  }));
  const readyArtifacts = statuses.flatMap(({ gate, status }) =>
    gate.artifactPaths.filter(
      (path) => artifactState(gate, status, path) === "artifact ready",
    ),
  ).length;
  const totalArtifacts = statuses.reduce(
    (total, { gate }) => total + gate.artifactPaths.length,
    0,
  );
  const lines = [
    "External completion evidence artifact worklist",
    "",
    `Selected gates: ${statuses.length}`,
    `Artifact readiness: ${readyArtifacts}/${totalArtifacts}`,
    "",
    "This worklist is redacted and non-mutating. It lists artifact paths, missing proof labels, capture handoffs, fill-row labels, missing detail field names, blocking finding labels, and commands only; it does not print environment values, mark proof rows checked, write artifacts, or assert external success.",
    releaseBoundaryReminder,
    "",
  ];

  for (const { gate, status } of statuses) {
    lines.push(`## ${gate.title} (${gate.id})`);
    lines.push(
      `- Gate env state: ${status.missingEnv.length === 0 ? "configured" : "missing"}`,
    );
    lines.push(
      `- Missing env names: ${formatInlineList(compactList(status.missingEnv))}`,
    );
    lines.push(
      `- Commands: ${recommendedCommandsForGate(gate, status)
        .map((command) => `\`${command}\``)
        .join("; ")}`,
    );
    pushHostedCronCollectorPrerequisites(lines, gate);
    pushHostedDeployProofHandoff(lines, gate);
    lines.push("");

    for (const artifactPath of gate.artifactPaths) {
      const missingProofs = artifactMissingProofs(gate, status, artifactPath);
      const missingDetails = status.missingEvidenceDetails
        .filter((item) => item.path === artifactPath)
        .map((item) => item.field);
      const detailFindings = status.evidenceDetailFindings
        .filter((item) => item.path === artifactPath)
        .map(formatFindingReason);
      const proofEvidenceFindings = status.proofEvidenceFindings
        .filter((item) => item.path === artifactPath)
        .map(formatFindingReason);
      const hostedCronReceiptFindings = status.hostedCronReceiptFindings
        .filter(
          (item) =>
            item.path === artifactPath ||
            item.path.startsWith(`${artifactPath}#`),
        )
        .map(formatFindingReason);
      const blockers = [
        ...status.secretFindings
          .filter((item) => item.path === artifactPath)
          .map((item) => item.label),
        ...status.templateOnlyFindings
          .filter((item) => item.path === artifactPath)
          .map(() => "Template only banner still present"),
        ...status.unreadableArtifacts
          .filter((item) => item.path === artifactPath)
          .map(() => "Unreadable artifact"),
      ];

      lines.push(`### ${artifactPath}`);
      lines.push(`- State: ${artifactState(gate, status, artifactPath)}`);
      lines.push(
        `- Missing proof rows: ${formatInlineList(compactList(missingProofs, 8))}`,
      );
      lines.push(
        `- Missing detail fields: ${formatInlineList(missingDetails)}`,
      );
      lines.push(
        `- Evidence detail findings: ${formatInlineList(detailFindings)}`,
      );
      lines.push(
        `- Proof evidence findings: ${formatInlineList(proofEvidenceFindings)}`,
      );
      lines.push(
        `- Hosted cron receipt findings: ${formatInlineList(
          hostedCronReceiptFindings,
        )}`,
      );
      lines.push(`- Blockers: ${formatInlineList(compactList(blockers))}`);
      lines.push("- Capture handoffs:");
      pushCaptureHandoffs(
        lines,
        captureHandoffsForArtifact(gate, artifactPath),
        {
          indent: "  - ",
        },
      );
      pushArtifactFillRows(lines, gate, status, artifactPath);
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd();
}

export function nextStepsReport(
  env = process.env,
  fileExists = existsSync,
  readFile = readFileSync,
  { includeCaptureHandoffs = true } = {},
) {
  const gates = selectedGates(env);
  const options = statusValidationOptions(env);
  const statuses = gates.map((gate) => ({
    gate,
    status: gateStatus(gate, env, fileExists, readFile, options),
  }));
  const missingStatuses = statuses.filter(({ status }) => !status.ready);
  const lines = [
    "External completion evidence next steps",
    "",
    releaseBoundaryReminder,
    "",
  ];

  if (missingStatuses.length === 0) {
    lines.push(
      "No missing next steps found in selected gate status. Confirm with `pnpm external:evidence:preflight` at the release boundary.",
    );
    return lines.join("\n");
  }

  lines.push(
    `${missingStatuses.length}/${statuses.length} selected gates need evidence work.`,
  );
  lines.push("");

  for (const { gate, status } of missingStatuses) {
    lines.push(`## ${gate.title} (${gate.id})`);
    lines.push(
      `- Missing env names: ${formatInlineList(compactList(status.missingEnv))}`,
    );
    lines.push(
      `- Missing artifacts: ${formatInlineList(compactList(status.missingArtifacts))}`,
    );
    lines.push(
      `- Missing proofs: ${formatInlineList(compactList(status.missingProofs))}`,
    );

    const artifactProofs = status.missingArtifactProofs.map(
      (item) => `${item.path}: ${item.proof}`,
    );
    if (artifactProofs.length > 0) {
      lines.push(
        `- Missing artifact proof coverage: ${formatInlineList(
          compactList(artifactProofs),
        )}`,
      );
    }

    const details = status.missingEvidenceDetails.map(
      (item) => `${item.path}: ${item.field}`,
    );
    lines.push(`- Missing detail fields: ${formatInlineList(details)}`);

    const detailFindings = status.evidenceDetailFindings.map(
      (item) => `${item.path}: ${formatFindingReason(item)}`,
    );
    if (detailFindings.length > 0) {
      lines.push(
        `- Evidence detail findings: ${formatInlineList(
          compactList(detailFindings),
        )}`,
      );
    }

    const proofEvidenceFindings = status.proofEvidenceFindings.map(
      (item) => `${item.path}: ${formatFindingReason(item)}`,
    );
    if (proofEvidenceFindings.length > 0) {
      lines.push(
        `- Proof evidence findings: ${formatInlineList(
          compactList(proofEvidenceFindings),
        )}`,
      );
    }

    const hostedCronReceiptFindings = status.hostedCronReceiptFindings.map(
      (item) => `${item.path}: ${formatFindingReason(item)}`,
    );
    if (hostedCronReceiptFindings.length > 0) {
      lines.push(
        `- Hosted cron receipt findings: ${formatInlineList(
          compactList(hostedCronReceiptFindings),
        )}`,
      );
    }

    const blockers = [
      ...status.secretFindings.map(
        (finding) => `${finding.path}: ${finding.label}`,
      ),
      ...status.templateOnlyFindings.map(
        (finding) => `${finding.path}: Template only banner still present`,
      ),
      ...status.unreadableArtifacts.map(
        (artifact) => `${artifact.path}: unreadable artifact`,
      ),
    ];
    if (blockers.length > 0) {
      lines.push(`- Blockers: ${formatInlineList(compactList(blockers))}`);
    }

    lines.push(
      `- Commands: ${recommendedCommandsForGate(gate, status)
        .map((command) => `\`${command}\``)
        .join("; ")}`,
    );
    if (includeCaptureHandoffs) {
      lines.push("- Capture handoffs:");
      pushCaptureHandoffs(lines, captureHandoffsForGate(gate), {
        indent: "  - ",
      });
    }
    pushHostedCronCollectorPrerequisites(lines, gate);
    pushHostedDeployProofHandoff(lines, gate);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function operatorPacketReport(
  env = process.env,
  fileExists = existsSync,
  readFile = readFileSync,
) {
  const gates = selectedGates(env);
  const options = statusValidationOptions(env);
  const statuses = gates.map((gate) => ({
    gate,
    status: gateStatus(gate, env, fileExists, readFile, options),
  }));
  const readyCount = statuses.filter(({ status }) => status.ready).length;
  const selectedIds = new Set(gates.map((gate) => gate.id));
  const fullGateSelection =
    selectedIds.size === evidenceGates.length &&
    evidenceGates.every((gate) => selectedIds.has(gate.id));
  const completionState =
    readyCount !== statuses.length
      ? "not proven; live evidence is still required"
      : fullGateSelection
        ? "ready for release-boundary preflight"
        : "selected gates ready; not full release-boundary completion";
  const lines = [
    "External completion evidence operator packet",
    "",
    `Selected gates: ${statuses.length}`,
    `Ready gates: ${readyCount}/${statuses.length}`,
    `External completion: ${completionState}`,
    "",
    "This packet is redacted and non-mutating. It lists environment names, artifact paths, proof requirements, capture handoffs, and commands only; it does not print environment values, mark proof rows checked, or assert external success.",
    releaseBoundaryReminder,
    "",
    "## Gate Checklist",
    "",
  ];

  for (const { gate, status } of statuses) {
    lines.push(`### ${gate.title} (${gate.id})`);
    lines.push(`- State: ${status.ready ? "ready" : "missing evidence"}`);
    lines.push(`- Required env names: ${formatInlineList(gate.requiredEnv)}`);
    lines.push(`- Evidence artifacts: ${formatInlineList(gate.artifactPaths)}`);
    lines.push(
      `- Required proofs: ${formatInlineList(compactList(gate.requiredProofs, 8))}`,
    );
    lines.push("- Capture handoffs:");
    pushCaptureHandoffs(lines, captureHandoffsForGate(gate), {
      indent: "  - ",
    });
    const detailFields = [
      ...new Set(
        gate.artifactPaths.flatMap((path) => [
          ...requiredEvidenceDetailFieldsForArtifact(gate, path),
          ...requiredEvidenceGroupDetailFieldsForArtifact(gate, path),
        ]),
      ),
    ];
    lines.push(`- Evidence detail fields: ${formatInlineList(detailFields)}`);
    lines.push(
      `- Commands: ${recommendedCommandsForGate(gate, status)
        .map((command) => `\`${command}\``)
        .join("; ")}`,
    );
    pushHostedCronCollectorPrerequisites(lines, gate);
    pushHostedDeployProofHandoff(lines, gate);
    lines.push("");
  }

  lines.push("## Missing Evidence Next Steps", "");
  lines.push(
    nextStepsReport(env, fileExists, readFile, {
      includeCaptureHandoffs: false,
    }),
  );

  return lines.join("\n").trimEnd();
}

export function runbookReport(
  env = process.env,
  fileExists = existsSync,
  readFile = readFileSync,
) {
  const gates = selectedGates(env);
  const options = statusValidationOptions(env);
  const statuses = gates.map((gate) => ({
    gate,
    status: gateStatus(gate, env, fileExists, readFile, options),
  }));
  const lines = [
    "External completion evidence operator runbook",
    "",
    `Selected gates: ${statuses.length}`,
    "",
    "This runbook is redacted and non-mutating. It gives the capture order, artifact paths, proof labels, capture handoffs, detail field names, and commands only; it does not print environment values, include proof checkboxes, write artifacts, or assert external success.",
    releaseBoundaryReminder,
    "",
    "## 1. Prepare redacted artifacts",
    "",
    "Run `pnpm external:evidence:template` if any listed artifact is missing, then replace template text with redacted external evidence before checking proof rows.",
    "",
  ];

  for (const { gate } of statuses) {
    lines.push(`### ${gate.title} (${gate.id})`);
    lines.push(`- Required env names: ${formatInlineList(gate.requiredEnv)}`);
    pushHostedCronCollectorPrerequisites(lines, gate);
    lines.push(`- Artifact paths: ${formatInlineList(gate.artifactPaths)}`);
    lines.push("");
  }

  lines.push("## 2. Capture gate evidence", "");
  for (const { gate, status } of statuses) {
    lines.push(`### ${gate.title} (${gate.id})`);
    lines.push(
      `- Missing env names: ${formatInlineList(compactList(status.missingEnv))}`,
    );
    const detailFindings = status.evidenceDetailFindings.map(
      (item) => `${item.path}: ${formatFindingReason(item)}`,
    );
    if (detailFindings.length > 0) {
      lines.push(
        `- Evidence detail findings: ${formatInlineList(
          compactList(detailFindings),
        )}`,
      );
    }
    lines.push(
      `- Commands: ${recommendedCommandsForGate(gate, status)
        .map((command) => `\`${command}\``)
        .join("; ")}`,
    );
    pushHostedCronCollectorPrerequisites(lines, gate);
    pushHostedDeployProofHandoff(lines, gate);

    for (const artifactPath of gate.artifactPaths) {
      const proofLabels = requiredProofsForArtifact(gate, artifactPath);
      const detailFields = requiredEvidenceDetailFieldsForArtifact(
        gate,
        artifactPath,
      );
      const groupDetailFields = requiredEvidenceGroupDetailFieldsForArtifact(
        gate,
        artifactPath,
      );
      lines.push(`- Artifact: ${artifactPath}`);
      lines.push(`  Proof labels: ${formatInlineList(proofLabels)}`);
      lines.push("  Capture handoffs:");
      pushCaptureHandoffs(
        lines,
        captureHandoffsForArtifact(gate, artifactPath),
        {
          indent: "  - ",
        },
      );
      lines.push(
        `  Detail fields: ${formatInlineList([
          ...detailFields,
          ...groupDetailFields,
        ])}`,
      );
    }
    lines.push("");
  }

  lines.push(
    "## 3. Release-boundary verification",
    "",
    "After all artifacts contain redacted external evidence, run `pnpm external:evidence:worklist`, then `pnpm external:evidence:preflight`, then `pnpm completion:gate:status`, and finally the unscoped `pnpm completion:gate:external` release-boundary check.",
  );

  return lines.join("\n").trimEnd();
}

function scanForbiddenArtifactContent(path, content) {
  const findings = [];
  const seen = new Set();
  for (const { label, pattern } of forbiddenArtifactPatterns) {
    if (!pattern.test(content)) continue;
    const key = `${path}\0${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({ label, path });
  }
  return findings;
}

function printPlan(env = process.env) {
  console.log("External completion evidence plan");
  console.log("");
  for (const gate of selectedGates(env)) {
    console.log(`## ${gate.title} (${gate.id})`);
    console.log("");
    console.log("Required environment names:");
    if (gate.requiredEnv.length === 0) {
      console.log("- none");
    } else {
      for (const name of gate.requiredEnv) console.log(`- ${name}`);
    }
    console.log("Required evidence artifacts:");
    for (const path of gate.artifactPaths) console.log(`- ${path}`);
    console.log("Proof requirements (must be checked as - [x] in artifacts):");
    for (const proof of gate.requiredProofs) console.log(`- ${proof}`);
    console.log("");
  }
}

function groupedValuesByPath(items, valueForItem) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.path)) groups.set(item.path, []);
    groups.get(item.path).push(valueForItem(item));
  }
  return [...groups.entries()];
}

function appendGroupedPathValues(lines, label, items, valueForItem) {
  if (items.length === 0) return;
  lines.push(`- ${label}:`);
  for (const [path, values] of groupedValuesByPath(items, valueForItem)) {
    lines.push(`  - ${path}: ${formatInlineList(values)}`);
  }
}

export function preflightReport(
  env = process.env,
  fileExists = existsSync,
  readFile = readFileSync,
) {
  const statuses = collectStatuses(env, fileExists, readFile);
  const lines = ["External completion evidence preflight", ""];
  const ready = statuses.every((status) => status.ready);

  for (const status of statuses) {
    const state = status.ready ? "ready" : "missing";
    lines.push(`${state} ${status.id}`);
    for (const finding of status.envFindings) {
      lines.push(`- env ${finding.reason}: ${finding.name}`);
    }
    for (const path of status.missingArtifacts) {
      lines.push(`- missing artifact: ${path}`);
    }
    for (const proof of status.missingProofs) {
      lines.push(`- missing verified proof: ${proof}`);
    }
    appendGroupedPathValues(
      lines,
      "missing artifact verified proofs",
      status.missingArtifactProofs,
      (proof) => proof.proof,
    );
    appendGroupedPathValues(
      lines,
      "missing evidence details",
      status.missingEvidenceDetails,
      (detail) => detail.field,
    );
    appendGroupedPathValues(
      lines,
      "evidence detail findings",
      status.evidenceDetailFindings,
      formatFindingReason,
    );
    appendGroupedPathValues(
      lines,
      "proof evidence findings",
      status.proofEvidenceFindings,
      formatFindingReason,
    );
    appendGroupedPathValues(
      lines,
      "hosted cron receipt findings",
      status.hostedCronReceiptFindings,
      formatFindingReason,
    );
    appendGroupedPathValues(
      lines,
      "blocked artifact secrets",
      status.secretFindings,
      (finding) => finding.label,
    );
    for (const finding of status.templateOnlyFindings) {
      lines.push(`- blocked template-only banner: ${finding.path}`);
    }
    for (const artifact of status.unreadableArtifacts) {
      lines.push(`- unreadable artifact: ${artifact.path}`);
    }
  }

  if (!ready) {
    lines.push("", "External completion evidence is incomplete.");
  }

  return {
    output: lines.join("\n"),
    ready,
    statuses,
  };
}

export function artifactPreflightReport(
  env = process.env,
  fileExists = existsSync,
  readFile = readFileSync,
) {
  const statuses = collectStatuses(env, fileExists, readFile);
  const lines = ["External completion evidence artifact preflight", ""];
  const ready = statuses.every(artifactReadyStatus);

  for (const status of statuses) {
    const state = artifactReadyStatus(status) ? "artifact-ready" : "missing";
    lines.push(`${state} ${status.id}`);
    for (const finding of status.envFindings) {
      lines.push(`- env ${finding.reason}: ${finding.name}`);
    }
    for (const path of status.missingArtifacts) {
      lines.push(`- missing artifact: ${path}`);
    }
    for (const proof of status.missingProofs) {
      lines.push(`- missing verified proof: ${proof}`);
    }
    appendGroupedPathValues(
      lines,
      "missing artifact verified proofs",
      status.missingArtifactProofs,
      (proof) => proof.proof,
    );
    appendGroupedPathValues(
      lines,
      "missing evidence details",
      status.missingEvidenceDetails,
      (detail) => detail.field,
    );
    appendGroupedPathValues(
      lines,
      "evidence detail findings",
      status.evidenceDetailFindings,
      formatFindingReason,
    );
    appendGroupedPathValues(
      lines,
      "proof evidence findings",
      status.proofEvidenceFindings,
      formatFindingReason,
    );
    appendGroupedPathValues(
      lines,
      "hosted cron receipt findings",
      status.hostedCronReceiptFindings,
      formatFindingReason,
    );
    appendGroupedPathValues(
      lines,
      "blocked artifact secrets",
      status.secretFindings,
      (finding) => finding.label,
    );
    for (const finding of status.templateOnlyFindings) {
      lines.push(`- blocked template-only banner: ${finding.path}`);
    }
    for (const artifact of status.unreadableArtifacts) {
      lines.push(`- unreadable artifact: ${artifact.path}`);
    }
  }

  if (!ready) {
    lines.push("", "External completion evidence artifacts are incomplete.");
  }

  lines.push(
    "",
    "Artifact preflight ignores missing live environment values; run `pnpm external:evidence:preflight` and `pnpm completion:gate:external` with release-boundary env before release.",
  );

  return {
    output: lines.join("\n"),
    ready,
    statuses,
  };
}

function runPreflight(env = process.env) {
  const report = preflightReport(env);
  if (report.output) console.log(report.output);
  if (!report.ready) {
    process.exitCode = 1;
  }
}

function runArtifactPreflight(env = process.env) {
  const report = artifactPreflightReport(env);
  if (report.output) console.log(report.output);
  if (!report.ready) {
    process.exitCode = 1;
  }
}

function printTemplates(env = process.env) {
  console.log("External completion evidence templates");
  console.log("");
  for (const gate of selectedGates(env)) {
    for (const artifactPath of gate.artifactPaths) {
      console.log(`--- ${artifactPath} ---`);
      console.log(artifactTemplate(gate, artifactPath));
      console.log("");
    }
  }
}

function printStatusJson(env = process.env) {
  console.log(JSON.stringify(statusReport(env), null, 2));
}

function printNextSteps(env = process.env) {
  console.log(nextStepsReport(env));
}

function printArtifactWorklist(env = process.env) {
  console.log(artifactWorklistReport(env));
}

function printOperatorPacket(env = process.env) {
  console.log(operatorPacketReport(env));
}

function printRunbook(env = process.env) {
  console.log(runbookReport(env));
}

function main() {
  const { action } = parseArgs(process.argv.slice(2));
  if (action === "runbook") {
    printRunbook();
    return;
  }
  if (action === "packet") {
    printOperatorPacket();
    return;
  }
  if (action === "next") {
    printNextSteps();
    return;
  }
  if (action === "worklist") {
    printArtifactWorklist();
    return;
  }
  if (action === "status") {
    printStatusJson();
    return;
  }
  if (action === "template") {
    printTemplates();
    return;
  }
  if (action === "preflight") {
    runPreflight();
    return;
  }
  if (action === "artifact-preflight") {
    runArtifactPreflight();
    return;
  }
  printPlan();
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
