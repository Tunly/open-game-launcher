import type { ModProviderStagingProbeResult } from "./types/mods";

export type ModApiStagingStatus = "blocked" | "ready" | "warning";

export interface ModApiStagingReadinessInput {
  curseForgeKeyReady: boolean;
  localKeychainSlotReady: boolean;
  modioKeyReady: boolean;
  overwolfHandoffReady: boolean;
  providerIdMappingReady: boolean;
  rateLimitPolicyReady: boolean;
  sharedCatalogReviewReady: boolean;
}

export interface ModApiStagingGate {
  action: string;
  detail: string;
  id: string;
  label: string;
  status: ModApiStagingStatus;
}

export interface ModApiStagingResponseReview {
  blockedFields: string[];
  detail: string;
  handoffPolicy: string;
  id: string;
  label: string;
  provider: "modio" | "curseforge";
  redaction: string;
  safeFields: string[];
  status: ModApiStagingStatus;
}

export interface ModApiStagingPolicyProviderRule {
  directDownloadPolicy: string;
  provider: "modio" | "curseforge";
  redaction: string;
  retry: string;
  termsBoundary: string;
  throttle: string;
}

export interface ModApiStagingPolicyEvidence {
  guardCopy: string;
  guards: string[];
  id: string;
  label: string;
  providerRules: ModApiStagingPolicyProviderRule[];
  status: ModApiStagingStatus;
}

export interface ModApiStagingReadiness {
  blockedCount: number;
  gates: ModApiStagingGate[];
  guardCopy: string;
  guards: string[];
  nextAction: string;
  policyEvidence: ModApiStagingPolicyEvidence | null;
  progress: number;
  readyCount: number;
  responseReviews: ModApiStagingResponseReview[];
  statusLabel: string;
  summary: string;
  warningCount: number;
}

const MOD_API_STAGING_GUARDS = [
  "No real provider key configured",
  "No live mod.io/CurseForge API call",
  "No hosted moderation/download claim",
  "No Overwolf/CurseForge direct-download claim",
  "Keys stay out of Supabase",
];

const MOD_API_STAGING_GUARD_COPY =
  "Local provider API-key staging only. This panel reviews launcher UI, local keychain wiring, and deterministic fixtures; no real mod.io or CurseForge key is configured, no live provider API request is made, and no hosted moderation, hosted download, CurseForge direct-download, or Overwolf install path is claimed.";

const MOD_API_STAGING_RESPONSE_REVIEWS: ModApiStagingResponseReview[] = [
  {
    blockedFields: [
      "Direct archive URL",
      "API key query/header",
      "Private uploader metadata",
      "Raw file CDN host",
    ],
    detail:
      "mod.io fixture keeps public metadata reviewable while direct package handoff remains blocked until a consented desktop install path exists.",
    handoffPolicy: "Provider page handoff only; package URLs stay out of telemetry.",
    id: "modio-response",
    label: "mod.io Response Shape",
    provider: "modio",
    redaction: "API key query params and bearer-style headers are replaced with <redacted>.",
    safeFields: ["Mod ID", "Name", "Summary", "Profile page", "Subscriber counts"],
    status: "warning",
  },
  {
    blockedFields: [
      "Direct archive URL",
      "x-api-key header",
      "Raw file CDN host",
      "Installer command",
    ],
    detail:
      "CurseForge fixture keeps metadata search review separate from Overwolf/provider-app fallback and avoids direct file claims.",
    handoffPolicy:
      "Overwolf or project-page fallback only when safe direct source evidence is missing.",
    id: "curseforge-response",
    label: "CurseForge Response Shape",
    provider: "curseforge",
    redaction: "x-api-key and provider error bodies are redacted before UI or logs.",
    safeFields: ["Project ID", "Slug", "Website link", "Summary", "Download counts"],
    status: "warning",
  },
];

const MOD_API_STAGING_POLICY_EVIDENCE: ModApiStagingPolicyEvidence = {
  guardCopy:
    "Terms and limits are local policy evidence only: staging requests stay one-result, user-consented, rate-limited, redacted, and provider-app-first until real keys and provider terms are approved.",
  guards: [
    "One-result staging requests",
    "No background crawl",
    "429/provider errors use capped retry",
    "Raw keys and CDN URLs redacted",
    "Provider terms review required before rollout",
  ],
  id: "provider-terms-limits-policy",
  label: "Terms + Limits Policy",
  providerRules: [
    {
      directDownloadPolicy:
        "Provider page handoff only; direct archive URLs stay blocked until provider terms allow launcher-side transfer.",
      provider: "modio",
      redaction: "api_key query params, bearer tokens, and provider error bodies are redacted.",
      retry: "Retry only one consented staging request after a provider 429 or transient 5xx.",
      termsBoundary:
        "Use public metadata search for reviewed game IDs; no scraping or package mirroring.",
      throttle: "Limit verify/staging probes to pageSize=1 and no automatic pagination.",
    },
    {
      directDownloadPolicy:
        "Overwolf/project-page fallback remains the default; launcher direct-download stays blocked.",
      provider: "curseforge",
      redaction: "x-api-key, CDN hosts, and raw file payload metadata are redacted.",
      retry: "Retry only one consented staging request after a provider 429 or transient 5xx.",
      termsBoundary:
        "Use official metadata API shape only; no direct CDN handoff without explicit approval.",
      throttle: "Limit verify/staging probes to pageSize=1 and no automatic pagination.",
    },
  ],
  status: "warning",
};

export function buildModApiStagingReadiness(
  input: ModApiStagingReadinessInput,
): ModApiStagingReadiness {
  const gates: ModApiStagingGate[] = [
    {
      action: input.localKeychainSlotReady
        ? "Keep provider secrets in native keychain slots only."
        : "Restore native secret storage before any API-key staging run.",
      detail: input.localKeychainSlotReady
        ? "Provider secret storage command exists, but no live key is verified here."
        : "No local OS-keychain slot evidence is available for provider secrets.",
      id: "keychain-slot",
      label: "Keychain Slot",
      status: input.localKeychainSlotReady ? "ready" : "blocked",
    },
    {
      action: input.providerIdMappingReady
        ? "Continue staging mod.io slugs and CurseForge numeric IDs before search."
        : "Add provider game-id hints/mappings before API staging.",
      detail: input.providerIdMappingReady
        ? "Local provider game-id hints and mappings can prepare search inputs."
        : "Provider searches need reviewed mod.io slugs or CurseForge numeric IDs.",
      id: "provider-id-map",
      label: "Provider ID Map",
      status: input.providerIdMappingReady ? "ready" : "blocked",
    },
    {
      action: input.modioKeyReady
        ? "Dry-run mod.io search with redacted logs in staging."
        : "Stage a real mod.io key and consented test search outside this local panel.",
      detail: input.modioKeyReady
        ? "mod.io key evidence exists, but live provider calls stay disabled here."
        : "No real mod.io API key has been verified in this readiness panel.",
      id: "modio-key",
      label: "mod.io Key",
      status: input.modioKeyReady ? "warning" : "blocked",
    },
    {
      action: input.curseForgeKeyReady
        ? "Dry-run CurseForge metadata search while preserving Overwolf fallback."
        : "Stage a real CurseForge key and validate provider terms before direct search.",
      detail: input.curseForgeKeyReady
        ? "CurseForge key evidence exists, but direct downloads are not claimed."
        : "No real CurseForge API key has been verified in this readiness panel.",
      id: "curseforge-key",
      label: "CurseForge Key",
      status: input.curseForgeKeyReady ? "warning" : "blocked",
    },
    {
      action: input.rateLimitPolicyReady
        ? "Keep provider staging behind one-result probes, capped retries, and redaction."
        : "Document rate limits, terms, retries, and redaction before staging calls.",
      detail: input.rateLimitPolicyReady
        ? "Terms, throttling, retry, and redaction policy evidence exists, but no live traffic is generated here."
        : "Provider terms, throttling, and redacted error contracts still need staging.",
      id: "rate-limits",
      label: "Terms + Limits",
      status: input.rateLimitPolicyReady ? "warning" : "blocked",
    },
    {
      action: input.sharedCatalogReviewReady
        ? "Review shared mappings before trusting provider API promotion."
        : "Stage moderation/review for shared provider mapping promotion.",
      detail: input.sharedCatalogReviewReady
        ? "Shared catalog mapping exists, but moderation remains a staging concern."
        : "Shared mapping promotion still needs review and abuse controls.",
      id: "shared-catalog",
      label: "Shared Catalog",
      status: input.sharedCatalogReviewReady ? "warning" : "blocked",
    },
    {
      action: input.overwolfHandoffReady
        ? "Keep CurseForge no-download results delegated to the provider app."
        : "Preserve provider-app fallback before enabling CurseForge staging.",
      detail: input.overwolfHandoffReady
        ? "CurseForge results without direct URLs can stay delegated to Overwolf."
        : "CurseForge fallback is missing for no-direct-download results.",
      id: "overwolf-handoff",
      label: "Overwolf Handoff",
      status: input.overwolfHandoffReady ? "ready" : "blocked",
    },
  ];
  const readyCount = gates.filter((gate) => gate.status === "ready").length;
  const warningCount = gates.filter((gate) => gate.status === "warning").length;
  const blockedCount = gates.filter((gate) => gate.status === "blocked").length;
  const nextGate =
    gates.find((gate) => gate.status === "blocked") ??
    gates.find((gate) => gate.status === "warning") ??
    null;

  return {
    blockedCount,
    gates,
    guardCopy: MOD_API_STAGING_GUARD_COPY,
    guards: [...MOD_API_STAGING_GUARDS],
    nextAction: nextGate?.action ?? "mod.io and CurseForge API staging can enter review.",
    policyEvidence: input.rateLimitPolicyReady
      ? {
          ...MOD_API_STAGING_POLICY_EVIDENCE,
          guards: [...MOD_API_STAGING_POLICY_EVIDENCE.guards],
          providerRules: MOD_API_STAGING_POLICY_EVIDENCE.providerRules.map((rule) => ({
            ...rule,
          })),
        }
      : null,
    progress: Math.round((readyCount / gates.length) * 100),
    readyCount,
    responseReviews: MOD_API_STAGING_RESPONSE_REVIEWS.map((review) => ({
      ...review,
      blockedFields: [...review.blockedFields],
      safeFields: [...review.safeFields],
    })),
    statusLabel:
      blockedCount > 0 ? "Local only" : warningCount > 0 ? "Needs staging" : "Review ready",
    summary:
      blockedCount > 0
        ? input.rateLimitPolicyReady
          ? "mod.io and CurseForge API staging has local keychain, provider-id, terms, limits, and handoff evidence; live keys and provider calls remain open."
          : "mod.io and CurseForge API staging is still local readiness evidence; live keys and provider calls remain open."
        : warningCount > 0
          ? "Provider search evidence exists, but live API-key staging still needs review."
          : "Provider API staging gates can enter a controlled review run.",
    warningCount,
  };
}

export function createVerifyModApiStagingReadiness(): ModApiStagingReadiness {
  return buildModApiStagingReadiness({
    curseForgeKeyReady: false,
    localKeychainSlotReady: true,
    modioKeyReady: false,
    overwolfHandoffReady: true,
    providerIdMappingReady: true,
    rateLimitPolicyReady: true,
    sharedCatalogReviewReady: true,
  });
}

export function createVerifyModProviderStagingProbe(): ModProviderStagingProbeResult {
  return {
    directDownloadCount: 0,
    durationMs: 0,
    guards: [
      "API key redacted",
      "Single-result staging probe",
      "No direct-download URL exposed to UI/logs",
      "Keys stay out of Supabase",
    ],
    liveRequestAttempted: false,
    message:
      "No stored provider key in this verify route; redacted staging packet is ready for a consented desktop probe.",
    pageSize: 1,
    provider: "modio",
    providerAppHandoffCount: 0,
    providerGameId: "example-game",
    queryHint: "ui",
    redactedRequest:
      "GET https://api.mod.io/v1/games/example-game/mods?api_key=<redacted>&_q=ui&limit=1&offset=0",
    resultCount: 0,
    status: "blocked",
  };
}
