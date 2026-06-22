import {
  createVerifySmartInstallLocalMirrorAuditPacket,
  type SmartInstallLocalMirrorAuditPacket,
} from "./smart-install-local-mirror-audit";

export type SmartInstallProviderTelemetryStatus = "blocked" | "ready" | "warning";

export interface SmartInstallProviderTelemetryReadinessInput {
  dryRunContractReady?: boolean;
  dryRunPacket?: SmartInstallProviderTelemetryDryRunPacket;
  entitlementCheckReady: boolean;
  localPlannerReady: boolean;
  localSourceScoringReady: boolean;
  localMirrorAuditPacket?: SmartInstallLocalMirrorAuditPacket | null;
  mirrorMeasurementReady: boolean;
  providerTelemetryReady: boolean;
  rankingSyncReady: boolean;
  rateLimitPolicyReady: boolean;
}

export interface SmartInstallProviderTelemetryGate {
  action: string;
  detail: string;
  id: string;
  label: string;
  status: SmartInstallProviderTelemetryStatus;
}

export interface SmartInstallProviderTelemetryDryRunSignal {
  blockedFields: string[];
  cacheTtlMinutes: number;
  consent: string;
  id: string;
  label: string;
  provider: string;
  purpose: string;
  rankingImpact: string;
  rateLimit: string;
  redactedRequest: string;
  responseShape: string;
  signals: string[];
}

export interface SmartInstallProviderTelemetryDryRunPacket {
  cachePolicy: string;
  liveCalls: "none";
  mode: string;
  rankingPolicy: string;
  redactedFieldCount: number;
  reviewSteps: string[];
  signals: SmartInstallProviderTelemetryDryRunSignal[];
  title: string;
  writes: "none";
}

export interface SmartInstallProviderTelemetryReadiness {
  blockedCount: number;
  dryRunPacket: SmartInstallProviderTelemetryDryRunPacket | null;
  gates: SmartInstallProviderTelemetryGate[];
  guardCopy: string;
  guards: string[];
  localMirrorAuditPacket: SmartInstallLocalMirrorAuditPacket | null;
  nextAction: string;
  progress: number;
  readyCount: number;
  statusLabel: string;
  summary: string;
  warningCount: number;
}

const SMART_INSTALL_TELEMETRY_GUARDS = [
  "No live provider telemetry",
  "No entitlement API call",
  "No live mirror speed measurement",
  "No provider ranking sync",
  "No auto-purchase/download claim",
];

const SMART_INSTALL_TELEMETRY_GUARD_COPY =
  "Local Smart Install provider-telemetry readiness only. This panel reviews source-selection gates from launcher state; it does not fetch live provider telemetry, call entitlement APIs, run live mirror probes, sync provider rankings, or trigger auto-purchase/downloads.";

export function buildSmartInstallProviderTelemetryReadiness(
  input: SmartInstallProviderTelemetryReadinessInput,
): SmartInstallProviderTelemetryReadiness {
  const dryRunPacket =
    input.dryRunPacket ??
    (input.dryRunContractReady ? createSmartInstallProviderTelemetryDryRunPacket() : null);
  const localMirrorAuditPacket = input.localMirrorAuditPacket ?? null;
  const dryRunSignalCount = dryRunPacket?.signals.length ?? 0;
  const gates: SmartInstallProviderTelemetryGate[] = [
    {
      action: input.localPlannerReady
        ? "Keep local source selection deterministic while live signals are absent."
        : "Restore local Smart Install planning before provider telemetry staging.",
      detail: input.localPlannerReady
        ? "Smart Install can already score local CDN, LAN, and launcher candidates."
        : "No local planner evidence exists for provider telemetry staging.",
      id: "local-planner",
      label: "Local Planner",
      status: input.localPlannerReady ? "ready" : "blocked",
    },
    {
      action: input.localSourceScoringReady
        ? "Keep local source scores separated from live provider rankings."
        : "Stage deterministic score inputs before any live provider signal.",
      detail: input.localSourceScoringReady
        ? "Local scoring can rank sources from speed estimates, trust, price, and blockers."
        : "Source ranking needs stable local score inputs first.",
      id: "local-scoring",
      label: "Source Scoring",
      status: input.localSourceScoringReady ? "ready" : "blocked",
    },
    {
      action: dryRunPacket
        ? "Review the redacted packet before enabling any provider fetch."
        : "Stage a no-write, redacted telemetry packet before live provider work.",
      detail: dryRunPacket
        ? `${dryRunSignalCount} provider signal fixtures are staged with writes ${dryRunPacket.writes} and live calls ${dryRunPacket.liveCalls}.`
        : "No local dry-run packet exists for consent, redaction, cache, or ranking review.",
      id: "dry-run-contract",
      label: "Dry-Run Packet",
      status: dryRunPacket ? "ready" : "blocked",
    },
    {
      action: input.providerTelemetryReady
        ? "Dry-run provider telemetry with redacted logs before using it for picks."
        : "Define provider telemetry schema, consent, and redaction before live fetches.",
      detail: input.providerTelemetryReady
        ? "Provider telemetry evidence exists, but live ranking remains disabled."
        : "No live provider availability, CDN health, or install telemetry is staged.",
      id: "provider-telemetry",
      label: "Provider Telemetry",
      status: input.providerTelemetryReady ? "warning" : "blocked",
    },
    {
      action: input.entitlementCheckReady
        ? "Run entitlement checks as review-only before source selection changes."
        : "Add scoped entitlement checks that never purchase or start downloads automatically.",
      detail: input.entitlementCheckReady
        ? "Entitlement evidence exists, but auto-purchase/download remains disabled."
        : "No live entitlement API call or ownership confirmation is staged.",
      id: "entitlement-check",
      label: "Entitlement Check",
      status: input.entitlementCheckReady ? "warning" : "blocked",
    },
    {
      action:
        input.mirrorMeasurementReady || localMirrorAuditPacket
          ? "Keep mirror samples fixture-only, cached, and separate from download starts."
          : "Stage mirror speed measurement without fetching packages or starting installs.",
      detail: localMirrorAuditPacket
        ? `${localMirrorAuditPacket.samples.length} redacted mirror samples produce a no-write rank diff with ${localMirrorAuditPacket.staleCount} stale cache row${localMirrorAuditPacket.staleCount === 1 ? "" : "s"}.`
        : input.mirrorMeasurementReady
          ? "Mirror measurement evidence exists, but live speed probes remain disabled here."
          : "No live CDN mirror speed measurement or endpoint probing is staged.",
      id: "mirror-measurement",
      label: "Mirror Measurement",
      status: input.mirrorMeasurementReady || localMirrorAuditPacket ? "warning" : "blocked",
    },
    {
      action: input.rateLimitPolicyReady
        ? "Apply rate limits before any provider telemetry dry-run."
        : "Document rate limits, cache TTLs, retries, and provider terms first.",
      detail: input.rateLimitPolicyReady
        ? "Rate-limit policy evidence exists, but live calls remain blocked."
        : "Provider telemetry still needs terms, throttling, and cache policy.",
      id: "rate-limit-policy",
      label: "Terms + Limits",
      status: input.rateLimitPolicyReady ? "warning" : "blocked",
    },
    {
      action: input.rankingSyncReady
        ? "Sync provider rankings only after review and rollback are staged."
        : "Keep live provider rankings out of persisted source picks until reviewed.",
      detail: input.rankingSyncReady
        ? "Ranking sync evidence exists, but production sync remains disabled."
        : "No hosted/provider ranking sync, audit trail, or rollback is staged.",
      id: "ranking-sync",
      label: "Ranking Sync",
      status: input.rankingSyncReady ? "warning" : "blocked",
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
    dryRunPacket,
    gates,
    guardCopy: SMART_INSTALL_TELEMETRY_GUARD_COPY,
    guards: [...SMART_INSTALL_TELEMETRY_GUARDS],
    localMirrorAuditPacket,
    nextAction: nextGate?.action ?? "Smart Install provider telemetry is ready for staged review.",
    progress: Math.round((readyCount / gates.length) * 100),
    readyCount,
    statusLabel:
      blockedCount > 0 ? "Local only" : warningCount > 0 ? "Needs staging" : "Review ready",
    summary:
      blockedCount > 0
        ? "Smart Install provider telemetry is still local readiness evidence; live provider checks remain open."
        : warningCount > 0
          ? "Smart Install has telemetry evidence, but live source ranking still needs staging."
          : "Smart Install provider telemetry gates can enter controlled review.",
    warningCount,
  };
}

export function createSmartInstallProviderTelemetryDryRunPacket(): SmartInstallProviderTelemetryDryRunPacket {
  const signals: SmartInstallProviderTelemetryDryRunSignal[] = [
    {
      blockedFields: ["account_id", "access_token", "machine_id", "purchase_history"],
      cacheTtlMinutes: 15,
      consent: "User review required before provider query",
      id: "steam-entitlement-cdn",
      label: "Entitlement + CDN Shape",
      provider: "Steam",
      purpose: "Review owned-app and depot-health fields without contacting Steam.",
      rankingImpact: "May add provider health as a warning-only local score input after review.",
      rateLimit: "1 review packet per provider per 15 minutes",
      redactedRequest: "GET /provider/steam/app-entitlement?app_id=1190000&access_token=<redacted>",
      responseShape:
        "owned fixture, client-installed flag, depot region label, CDN health enum, no signed URLs",
      signals: ["ownership fixture", "client installed", "CDN health enum"],
    },
    {
      blockedFields: ["account_email", "bearer_token", "download_url", "receipt_id"],
      cacheTtlMinutes: 30,
      consent: "Manual provider-account consent required",
      id: "gog-offline-installer",
      label: "Offline Installer Shape",
      provider: "GOG",
      purpose: "Review offline-installer metadata fields before any entitlement fetch.",
      rankingImpact: "May lower score when only stale installer metadata exists.",
      rateLimit: "1 review packet per provider per 30 minutes",
      redactedRequest:
        "GET /provider/gog/offline-installers?catalog_id=local-demo&bearer=<redacted>",
      responseShape:
        "installer count, build age bucket, language coverage, checksum-present flag, URL removed",
      signals: ["installer count", "build age bucket", "checksum-present flag"],
    },
    {
      blockedFields: ["device_ip", "device_token", "share_path", "signed_ticket"],
      cacheTtlMinutes: 5,
      consent: "LAN peer consent remains separate from provider telemetry",
      id: "lan-peer-source",
      label: "LAN Peer Source Shape",
      provider: "OG LAN",
      purpose: "Keep LAN transfer evidence separate while source scoring reviews mixed candidates.",
      rankingImpact: "Can remain a local-only speed estimate; provider ranking sync stays blocked.",
      rateLimit: "Local fixture only; no network peer scan",
      redactedRequest: "LOCAL /smart-install/lan-source-review?peer=<redacted>",
      responseShape:
        "peer trust label, manifest age bucket, estimated Mbps fixture, no network share path",
      signals: ["peer trust", "manifest age bucket", "estimated Mbps fixture"],
    },
  ];

  return {
    cachePolicy: "Provider-shaped evidence is cache-reviewed only; no background refresh.",
    liveCalls: "none",
    mode: "Review-only dry-run",
    rankingPolicy:
      "Dry-run signals can explain local scores but cannot persist provider rankings or start installs.",
    redactedFieldCount: signals.reduce((count, signal) => count + signal.blockedFields.length, 0),
    reviewSteps: [
      "Confirm consent text before any provider request.",
      "Keep secrets, account identifiers, package locators, and URL-shaped payloads out of logs.",
      "Apply per-provider TTL and rate-limit policy before staged native probes.",
      "Use dry-run signals only as review evidence until hosted ranking rollback exists.",
    ],
    signals,
    title: "Provider Telemetry Dry-Run Contract",
    writes: "none",
  };
}

export function createVerifySmartInstallProviderTelemetryReadiness(): SmartInstallProviderTelemetryReadiness {
  return buildSmartInstallProviderTelemetryReadiness({
    dryRunContractReady: true,
    entitlementCheckReady: false,
    localPlannerReady: true,
    localSourceScoringReady: true,
    localMirrorAuditPacket: createVerifySmartInstallLocalMirrorAuditPacket(),
    mirrorMeasurementReady: true,
    providerTelemetryReady: false,
    rankingSyncReady: false,
    rateLimitPolicyReady: true,
  });
}
