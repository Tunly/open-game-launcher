#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const hostedCronEvidenceFields = Object.freeze([
  "Hosted cron table",
  "Function",
  "Run ID",
  "Scheduled",
  "dry_run=false",
  "Status",
]);
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
  "Controller layout/profile sync evidence",
  "Marketplace evidence",
  "Mobile distribution evidence",
  "Push-provider evidence",
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
      "Hosted price-drop scheduler writes fresh run evidence.",
    ],
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
  },
  {
    id: "provider-live-integrations",
    title: "Provider live integrations",
    requiredEnv: [
      "STEAM_WEB_API_KEY",
      "PRESENCE_PROVIDER_TOKEN",
      "MOD_IO_API_KEY",
      "CURSEFORGE_API_KEY",
    ],
    artifactPaths: ["docs/verification/external/provider-live-integrations.md"],
    artifactEvidenceFields: [
      {
        path: "docs/verification/external/provider-live-integrations.md",
        requiredFields: providerEvidenceFields,
      },
    ],
    requiredProofs: [
      "mod.io and CurseForge staging probes use real provider keys.",
      "Non-Steam presence bridges return redacted live provider evidence.",
      "Provider-approved catalog/cloud transfer flows are verified.",
      "Achievement/provider cache E2E runs against real client data.",
    ],
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
      "Hosted community artwork/screenshots rollout is exercised beyond fixtures.",
      "Production controller layout rollout and profile sync are verified.",
      "Plugin marketplace execution/update channels are externally reviewed.",
      "Native mobile apps, push-provider delivery, and store distribution are verified.",
      "Hosted production deployment evidence is attached.",
    ],
  },
]);

const actionNames = Object.freeze([
  "plan",
  "preflight",
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
    label: "Raw provider API key",
    pattern:
      /\b(?:STEAM_WEB_API_KEY|MOD_IO_API_KEY|CURSEFORGE_API_KEY|PRESENCE_PROVIDER_TOKEN)\s*[:=]\s*(?!(?:\[?redacted\]?|<redacted>|\*{3,})(?:\s|$))[^\s`"'<>]{8,}/i,
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
    label: "Raw mobile push secret",
    pattern:
      /\b(?:APNS_AUTH_KEY|APNS_PRIVATE_KEY|FCM_SERVER_KEY|FCM_SERVICE_ACCOUNT|FIREBASE_SERVICE_ACCOUNT|FIREBASE_PRIVATE_KEY|GOOGLE_SERVICE_ACCOUNT_JSON|GOOGLE_APPLICATION_CREDENTIALS_JSON)\s*[:=]\s*(?!(?:\[?redacted\]?|<redacted>|\*{3,})(?:\s|$))[^\n`]{8,}/i,
  },
  {
    label: "Raw mobile device token",
    pattern:
      /\b(?:APNS_DEVICE_TOKEN|FCM_DEVICE_TOKEN|DEVICE_PUSH_TOKEN|MOBILE_PUSH_TOKEN)\s*[:=]\s*(?!(?:\[?redacted\]?|<redacted>|\*{3,})(?:\s|$))[^\s`"'<>]{16,}/i,
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
  "Release-boundary reminder: run `pnpm completion:gate:status` before final verification. The final `pnpm completion:gate:external` run is unscoped and also runs hosted deploy preflight, hosted deploy smoke, hosted cron evidence, and external evidence preflight.";

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

function releaseRefIssueReason(value, env = {}) {
  const normalized = normalizedReleaseRef(value);
  if (!releaseTagPattern.test(normalized)) return "malformed";
  const expected = expectedReleaseRef(env);
  if (expected && normalized !== expected) return "release_ref_mismatch";
  return null;
}

function commitShaValueIsValid(value, env = {}) {
  return commitShaIssueReason(value, env) === null;
}

function commitShaIssueReason(value, env = {}) {
  const normalized = clean(value).toLowerCase();
  if (!commitShaPattern.test(normalized)) return "malformed";
  const expected = clean(env.GITHUB_SHA).toLowerCase();
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

function evidenceLocatorContainsBlockedLocalPath(value) {
  return /(?:^|[\s([<])(?:\.{1,2}\/[^\s,;)>]+|~\/[^\s,;)>]+|\/[^\s,;)>]+|[a-z]:[\\/][^\s,;)>]+|(?:docs|scripts|launcher|supabase|\.github|\.husky)\/[^\s,;)>]+)(?=$|[\s,;)>])/i.test(
    value,
  );
}

function evidenceLocatorContainsLocalVerificationPath(value) {
  return /(?:^|[\s([<])(?:\.{1,2}\/)?docs\/verification\/screenshots\//i.test(
    value,
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
  {
    host: /^console\.firebase\.google\.com$/i,
    path: /^\/.+/i,
  },
  {
    host: /^(?:app\.)?onesignal\.com$/i,
    path: /^\/.+/i,
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
  if (evidenceLocatorContainsLocalVerificationPath(cleaned)) return "local_path";
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

function valueContainsAllowedStripeDashboardUrl(value) {
  const urls = value.match(/\bhttps:\/\/[^\s<>)\]]+/gi) ?? [];
  return urls.some((rawUrl) => {
    try {
      const url = new URL(normalizeEvidenceUrl(rawUrl));
      return (
        /^dashboard\.stripe\.com$/i.test(url.hostname) &&
        evidenceUrlIsAllowed(url)
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
  if (valueContainsAllowedStripeDashboardUrl(cleaned)) return true;
  return evidenceIdentifierValueMatches(cleaned, [
    /stripe/i,
    /dashboard/i,
    /tax/i,
    /invoice/i,
  ]);
}

const fieldSpecificEvidenceValidators = Object.freeze({
  "Community rollout evidence": (value) =>
    evidenceIdentifierValueMatches(value, [
      /community/i,
      /artwork/i,
      /screenshot/i,
      /rollout/i,
    ]),
  "Controller layout/profile sync evidence": (value) =>
    evidenceIdentifierValueMatches(value, [
      /controller/i,
      /layout/i,
      /profile/i,
      /sync/i,
    ]),
  "Hosted deploy evidence": (value) =>
    evidenceIdentifierValueMatches(value, [
      /hosted/i,
      /deploy/i,
      /deployment/i,
    ]),
  "Hardware profile": (value) =>
    evidenceIdentifierValueMatches(value, [/hardware/i, /profile/i]),
  "Live probe run ID": (value) =>
    evidenceIdentifierValueMatches(value, [/live/i, /probe/i]),
  "Marketplace evidence": (value) =>
    evidenceIdentifierValueMatches(value, [/marketplace/i, /plugin/i]),
  "Mobile distribution evidence": (value) =>
    evidenceIdentifierValueMatches(value, [
      /mobile/i,
      /distribution/i,
      /store/i,
    ]),
  "OS/title/client matrix": (value) =>
    evidenceIdentifierValueMatchesAll(value, [
      /matrix/i,
      /windows/i,
      /mac\s?os/i,
      /linux/i,
    ]),
  "Provider response evidence": (value) =>
    evidenceIdentifierValueMatches(value, [/provider/i, /response/i, /probe/i]),
  "Provider/client matrix": (value) =>
    evidenceIdentifierValueMatchesAll(value, [
      /matrix/i,
      /provider/i,
      /client/i,
      /mod[._\s-]?io/i,
      /curseforge/i,
    ]),
  "Push-provider evidence": (value) =>
    evidenceIdentifierValueMatches(value, [
      /push/i,
      /provider/i,
      /firebase/i,
      /onesignal/i,
    ]),
  "Run ID": runIdValueIsSpecific,
  "Session/run ID": (value) =>
    evidenceIdentifierValueMatches(value, [/session/i, /run/i, /overlay/i]),
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
) {
  const cleaned = clean(value);
  if (!cleaned) return "missing";
  const normalized = cleaned.toLowerCase().replace(/[.!]+$/, "");
  if (placeholderEvidenceDetailValues.has(normalized)) return "placeholder";
  if (weakEvidenceDetailValuesByField[field]?.has(normalized)) return "weak";
  if (field === "Captured at") return timestampEvidenceIssueReason(cleaned, now);
  if (field === "Release ref") return releaseRefIssueReason(cleaned, env);
  if (field === "Commit SHA") return commitShaIssueReason(cleaned, env);
  if (field === "Redaction notes") {
    return redactionNotesValueIsValid(cleaned) ? null : "wrong_expected_value";
  }
  if (
    field ===
    "Redacted run IDs, dashboard links, screenshots, or signed deployment logs"
  ) {
    return evidenceLocatorValueIsSpecific(cleaned)
      ? null
      : evidenceLocatorIssueReason(cleaned) ?? "malformed_locator";
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
  CURSEFORGE_API_KEY: (value) => secretValueLooksPlausible(value, 24),
  MOD_IO_API_KEY: (value) => secretValueLooksPlausible(value, 24),
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

    if (
      values.some(
        (value) =>
          evidenceDetailValueIssueReason(field, value, now, env, expected) ===
          null,
      )
    ) {
      return [];
    }

    const reason =
      values.length === 0
        ? "missing"
        : evidenceDetailValueIssueReason(
            field,
            values[0],
            now,
            env,
            expected,
          ) ?? "malformed";
    return [{ field, path, reason }];
  });
}

function missingEvidenceDetailsFromArtifactContent(
  path,
  content,
  requiredFields,
  now,
  expectedValues = {},
  env = {},
) {
  return evidenceDetailFindingsFromArtifactContent(
    path,
    content,
    requiredFields,
    now,
    expectedValues,
    env,
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

      if (
        values.some(
          (value) =>
            evidenceDetailValueIssueReason(field, value, now, {}, expected) ===
            null,
        )
      ) {
        return [];
      }

      const reason =
        values.length === 0
          ? "missing"
          : evidenceDetailValueIssueReason(
              field,
              values[0],
              now,
              {},
              expected,
            ) ?? "malformed";
      return [{ field: `${group.heading}: ${field}`, path, reason }];
    });
  });
}

function missingEvidenceGroupDetailsFromArtifactContent(
  path,
  content,
  groups,
  now,
) {
  return evidenceGroupDetailFindingsFromArtifactContent(
    path,
    content,
    groups,
    now,
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
      /(?:stripe[-_\s]?webhook|webhook[-_\s]?signature|dashboard\.stripe\.com\/(?:accts?\/[^/]+\/)?(?:events|webhooks)|evt_[a-z0-9]{8,})/i,
    ];
  }
  if (/stripe tax and invoice/.test(normalizedProof)) {
    return [
      /(?:stripe[-_\s]?(?:tax|invoice)|dashboard[-_\s]?(?:tax|invoice)|tax[-_\s]?invoice|dashboard\.stripe\.com\/(?:accts?\/[^/]+\/)?(?:settings|invoices|tax))/i,
    ];
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
  if (/mod\.io and curseforge/.test(normalizedProof)) {
    return [/mod[._\s-]?io/i, /curseforge/i];
  }
  if (/non-steam presence/.test(normalizedProof)) {
    return [
      /(?:non[-_\s]?steam|presence[-_\s]?bridge|presence[-_\s]?provider)/i,
    ];
  }
  if (/provider-approved catalog\/cloud/.test(normalizedProof)) {
    return [/(?:provider[-_\s]?approved|catalog|cloud[-_\s]?transfer)/i];
  }
  if (/achievement\/provider cache/.test(normalizedProof)) {
    return [/(?:achievement|provider[-_\s]?cache|real[-_\s]?client)/i];
  }
  if (/fullscreen\/anti-cheat overlay/.test(normalizedProof)) {
    return [/(?:fullscreen|anti[-_\s]?cheat|overlay)/i];
  }
  if (/long native overlay sessions/.test(normalizedProof)) {
    return [
      /(?:native[-_\s]?overlay|long[-_\s]?session|runtime[-_\s]?session)/i,
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
      /(?:client[-_\s]?mount|mount[-_\s]?apply|provider[-_\s]?clients?)/i,
    ];
  }
  if (/hosted community artwork\/screenshots/.test(normalizedProof)) {
    return [
      /(?:community[-_\s]?(?:artwork|screenshots?)|screenshot[-_\s]?rollout)/i,
    ];
  }
  if (/production controller layout/.test(normalizedProof)) {
    return [/(?:controller[-_\s]?layout|profile[-_\s]?sync)/i];
  }
  if (/plugin marketplace/.test(normalizedProof)) {
    return [
      /(?:plugin[-_\s]?marketplace|marketplace[-_\s]?(?:execution|update)|plugin[-_\s]?update)/i,
    ];
  }
  if (/native mobile apps/.test(normalizedProof)) {
    return [/(?:mobile|push[-_\s]?provider|store[-_\s]?distribution)/i];
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
  const locatorReason = proofEvidenceValueIssueReason(value);
  if (locatorReason) return locatorReason;
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
      if (
        values.some(
          (value) => proofEvidenceValueIssueReasonForProof(proof, value) === null,
        )
      ) {
        return [];
      }
      const reason =
        values.length === 0
          ? "missing"
          : proofEvidenceValueIssueReasonForProof(proof, values[0]) ??
            "malformed_locator";
      return [{ field: `Evidence for ${proof}`, path, proof, reason }];
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
  const requestedAction = argv.find((arg) => !arg.startsWith("-")) ?? "plan";
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

export function gateStatus(
  gate,
  env = process.env,
  fileExists = existsSync,
  readFile = readFileSync,
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
  const secretFindings = [];
  const templateOnlyFindings = [];
  const unreadableArtifacts = [];
  const now = evidenceValidationNow(env);

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
      secretFindings.length === 0 &&
      templateOnlyFindings.length === 0 &&
      unreadableArtifacts.length === 0,
    missingArtifactProofs,
    missingEvidenceDetails,
    secretFindings,
    templateOnlyFindings,
    unreadableArtifacts,
  };
}

export function collectStatuses(
  env = process.env,
  fileExists = existsSync,
  readFile = readFileSync,
) {
  return selectedGates(env).map((gate) =>
    gateStatus(gate, env, fileExists, readFile),
  );
}

export function statusReport(
  env = process.env,
  fileExists = existsSync,
  readFile = readFileSync,
) {
  const gates = selectedGates(env).map((gate) => {
    const status = gateStatus(gate, env, fileExists, readFile);
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
    "## Required Proof Checklist",
    "",
    "Leave each item unchecked until the external run evidence is captured and redacted. `pnpm external:evidence:preflight` accepts checked `- [x]` rows only in the artifact assigned to that proof.",
    "",
    ...requiredProofs.map((proof) => `- [ ] ${proof}`),
    ...(gate.id === "rollout-tracks"
      ? [
          "",
          "Here, screenshots means hosted community screenshot content, not `docs/verification/screenshots/*` artifacts.",
        ]
      : []),
    "",
    "## Proof Evidence Mapping",
    "",
    "When a proof row is checked, fill the matching evidence line with a specific redacted run ID, dashboard link, external artifact locator, workflow ID, signed log, or `sha256:<64-hex>` reference. Accepted dashboard URL hosts are Supabase, Stripe live Dashboard, GitHub Actions/releases/deployments, Vercel, Netlify, Cloudflare, App Store Connect, Google Play Console, Firebase, and OneSignal; otherwise use `run:`/`artifact:`/`sha256:` style locators. Generic text such as `redacted`, `see above`, local files, localhost URLs, and example URLs do not satisfy preflight.",
    "Proof evidence values must name the proof lane they support, for example `stripe-webhook`, `stripe-tax-invoice`, `price-drop`, `presence-poll`, `account-deletion`, `mod.io/CurseForge`, `presence-bridge`, `catalog-cloud-transfer`, `achievement-cache`, `overlay`, `backup-restore`, `client-mount-apply`, `community-rollout`, `controller-profile-sync`, `plugin-marketplace`, `mobile-push`, or `hosted-deploy`; bare `evt_...` values are accepted only for the Stripe webhook signature proof. Syntactically specific but generic IDs such as `run-generic-1` stay blocked. Compound proof values must include every required term in the same value: mod-provider evidence includes both `mod.io` and `CurseForge`; external-drive backup/restore proof evidence and hardware matrix evidence include `Windows`, `macOS`, and `Linux`.",
    "",
    ...requiredProofs.map((proof) => `- Evidence for ${proof}:`),
    "",
    "## Gate-Specific Evidence",
    "",
    requiredArtifactEvidenceFields.length === 0
      ? "- none"
      : "Fill these rows with concrete external values for this gate. Keep secrets redacted; values must still include a specific accepted locator or ID containing digits, such as `run:...`, `probe-...`, `session-...`, `workflow-...`, `deployment-...`, or `artifact-...`; lane-specific hosted cron collector IDs such as `price-drop-cli-scheduled` are accepted for hosted cron Run ID rows, and Stripe webhook event IDs must be bare `evt_...` values.",
    ...(requiredArtifactEvidenceFields.includes("Provider/client matrix")
      ? [
          "Provider/client matrix values must include both `mod.io` and `CurseForge`.",
        ]
      : []),
    ...(requiredArtifactEvidenceFields.includes("OS/title/client matrix")
      ? [
          "OS/title/client matrix values must include `Windows`, `macOS`, and `Linux`.",
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
      ...group.requiredFields.map((field) => `- ${field}:`),
      "",
    ]),
    "## Evidence Captured",
    "",
    "Preflight requires non-empty, non-placeholder values for each evidence detail field below. `Captured at` must be a freshly captured current UTC ISO-8601 timestamp within 30 days and not more than 10 minutes in the future. `Release ref` must name the release tag, `Commit SHA` must be a full 40-hex commit, and release CI requires them to match `GITHUB_REF_NAME` and `GITHUB_SHA` exactly. `Redaction notes` must use positive wording such as `raw secrets removed`, `tokens redacted`, or `no raw secrets`; contradictory wording such as `not redacted`, `unredacted`, `contains raw`, or `not reviewed` is rejected. Local `docs/verification/screenshots/*` paths, `file://` URLs, localhost/loopback/private-network URLs, and `example.com` URLs do not satisfy external completion evidence.",
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
    "Operator reminders only. Preflight enforces this boundary by scanning artifact content for secret-shaped values.",
    "",
    "- Raw provider keys, Stripe secrets, bearer tokens, JWTs, Supabase service-role/auth/access tokens, scheduler secrets, mobile push/provider secrets, private keys, device tokens, and webhook secrets are absent.",
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
    "- Hosted deploy proof: run GitHub Actions `CI` from `main` with `hosted_deploy_gate=true`, `hosted_environment=hosted-production`, `hosted_deploy_action=all`, and `hosted_deploy_dry_run=false`; paste a labelled locator such as `hosted-deploy workflow: https://github.com/<owner>/<repo>/actions/runs/<id>` or `hosted-deploy workflow-<id>` into `Evidence for Hosted production deployment evidence is attached.` and `Hosted deploy evidence`.",
  );
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
  const hasBlockers =
    status.secretFindings.some((item) => item.path === artifactPath) ||
    status.templateOnlyFindings.some((item) => item.path === artifactPath);

  if (hasBlockers) return "blocked";
  if (hasMissingProofs || hasMissingDetails || hasProofEvidenceFindings) {
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
  const statuses = gates.map((gate) => ({
    gate,
    status: gateStatus(gate, env, fileExists, readFile),
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
    "This worklist is redacted and non-mutating. It lists artifact paths, missing proof labels, missing detail field names, blocking finding labels, and commands only; it does not print environment values, mark proof rows checked, write artifacts, or assert external success.",
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
      lines.push(`- Blockers: ${formatInlineList(compactList(blockers))}`);
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd();
}

export function nextStepsReport(
  env = process.env,
  fileExists = existsSync,
  readFile = readFileSync,
) {
  const gates = selectedGates(env);
  const statuses = gates.map((gate) => ({
    gate,
    status: gateStatus(gate, env, fileExists, readFile),
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
  const statuses = gates.map((gate) => ({
    gate,
    status: gateStatus(gate, env, fileExists, readFile),
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
    "This packet is redacted and non-mutating. It lists environment names, artifact paths, proof requirements, and commands only; it does not print environment values, mark proof rows checked, or assert external success.",
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
  lines.push(nextStepsReport(env, fileExists, readFile));

  return lines.join("\n").trimEnd();
}

export function runbookReport(
  env = process.env,
  fileExists = existsSync,
  readFile = readFileSync,
) {
  const gates = selectedGates(env);
  const statuses = gates.map((gate) => ({
    gate,
    status: gateStatus(gate, env, fileExists, readFile),
  }));
  const lines = [
    "External completion evidence operator runbook",
    "",
    `Selected gates: ${statuses.length}`,
    "",
    "This runbook is redacted and non-mutating. It gives the capture order, artifact paths, proof labels, detail field names, and commands only; it does not print environment values, include proof checkboxes, write artifacts, or assert external success.",
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

function runPreflight(env = process.env) {
  const report = preflightReport(env);
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
