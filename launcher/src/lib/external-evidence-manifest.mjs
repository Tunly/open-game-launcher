// Single source of truth for the external-completion evidence field vocabulary.
//
// Shared by two runtimes:
//   - Node CI gate:  scripts/external-evidence-check.mjs  (imports this file directly)
//   - Vite frontend: launcher/src/lib/external-completion-evidence-summary.ts
//     (imports this file; types come from external-evidence-manifest.d.mts)
//
// Keep this file dependency-free and side-effect-free. Validation policy
// (placeholder/weak value sets, redaction patterns, timestamp/SHA/UUID patterns,
// age limits) intentionally stays in each consumer, because releaseTagPattern and
// the environment placeholder set legitimately differ between the two runtimes.

export const requiredEvidenceDetailFields = Object.freeze([
  "Captured at",
  "Release ref",
  "Commit SHA",
  "Operator",
  "Environment",
  "Redacted run IDs, dashboard links, screenshots, or signed deployment logs",
  "Redaction notes",
]);

export const hostedCronEvidenceFields = Object.freeze([
  "Hosted cron table",
  "Function",
  "Run ID",
  "Scheduled",
  "dry_run=false",
  "Status",
]);

export const hostedSupabaseCronLaneIds = Object.freeze(["presence-poll", "account-deletion"]);

export const hostedCronExpectedValuesByLane = Object.freeze({
  "presence-poll": Object.freeze({
    Function: /^poll-platform-presence$/i,
    "Hosted cron table": /^presence_poll_runs$/i,
    Scheduled: /^scheduled$/i,
    Status: /^completed$/i,
  }),
  "account-deletion": Object.freeze({
    Function: /^process-account-deletions$/i,
    "Hosted cron table": /^account_deletion_processor_runs$/i,
    Scheduled: /^scheduled$/i,
    Status: /^completed$/i,
  }),
});

export const providerEvidenceFields = Object.freeze([
  "Provider/client matrix",
  "Live probe run ID",
  "Provider response evidence",
]);

export const hardwareEvidenceFields = Object.freeze([
  "OS/title/client matrix",
  "Hardware profile",
  "Session/run ID",
]);

export const rolloutEvidenceFields = Object.freeze([
  "Community rollout evidence",
  "Marketplace evidence",
  "Hosted deploy evidence",
]);
