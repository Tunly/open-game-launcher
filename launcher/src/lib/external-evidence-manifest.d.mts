// Type declarations for external-evidence-manifest.mjs (the runtime source of truth).
// These mirror the literal values exactly so `typeof X[number]` yields string-literal
// unions for the TypeScript consumer (external-completion-evidence-summary.ts).

export declare const requiredEvidenceDetailFields: readonly [
  "Captured at",
  "Release ref",
  "Commit SHA",
  "Operator",
  "Environment",
  "Redacted run IDs, dashboard links, screenshots, or signed deployment logs",
  "Redaction notes",
];

export declare const hostedCronEvidenceFields: readonly [
  "Hosted cron table",
  "Function",
  "Run ID",
  "Scheduled",
  "dry_run=false",
  "Status",
];

export declare const hostedSupabaseCronLaneIds: readonly ["presence-poll", "account-deletion"];

export declare const hostedCronExpectedValuesByLane: Record<
  (typeof hostedSupabaseCronLaneIds)[number],
  Partial<Record<(typeof hostedCronEvidenceFields)[number], RegExp>>
>;

export declare const providerEvidenceFields: readonly [
  "Provider/client matrix",
  "Live probe run ID",
  "Provider response evidence",
];

export declare const hardwareEvidenceFields: readonly [
  "OS/title/client matrix",
  "Hardware profile",
  "Session/run ID",
];

export declare const rolloutEvidenceFields: readonly [
  "Community rollout evidence",
  "Marketplace evidence",
  "Hosted deploy evidence",
];
