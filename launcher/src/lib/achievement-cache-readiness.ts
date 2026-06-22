export type AchievementCacheReadinessStatus = "blocked" | "review";

export interface AchievementCacheReadinessInput {
  cacheFolderHandoffReady: boolean;
  liveUnlockImportStaged: boolean;
  localParserCoverageReady: boolean;
  oauthTokenExchangeStaged: boolean;
  providerStatusMatrixReady: boolean;
  remoteCacheJobStaged: boolean;
  remoteHydrationStaged: boolean;
  sidecarFormatMapReady: boolean;
  supabaseAchievementWriteStaged: boolean;
}

export interface AchievementCacheReadinessItem {
  action: string;
  detail: string;
  evidence: string;
  id: string;
  label: string;
  status: AchievementCacheReadinessStatus;
}

export interface AchievementCacheReadiness {
  blockedCount: number;
  guardCopy: string;
  guards: string[];
  items: AchievementCacheReadinessItem[];
  reviewCount: number;
  statusLabel: string;
  summary: string;
}

const ACHIEVEMENT_CACHE_READINESS_GUARDS = [
  "Local cache fixtures only",
  "Sidecar review only",
  "No Steam/Xbox/GOG/Epic/EA/Ubisoft/Battle.net provider sync",
  "No hosted hydration",
  "No Supabase writes",
  "No OAuth/token exchange",
  "No live unlock import",
  "No remote cache job",
  "No provider credential use",
  "No official unlock proof",
];

const ACHIEVEMENT_CACHE_READINESS_GUARD_COPY =
  "Local achievement cache readiness only. The launcher renders deterministic local cache folder, sidecar, parser, and provider-status fixtures; no provider API calls, no hosted hydration, no Supabase writes, no OAuth/token flow, no live unlock sync, no remote cache job, no provider credential use, and no official unlock proof.";

export function buildAchievementCacheReadiness(
  input: AchievementCacheReadinessInput,
): AchievementCacheReadiness {
  const items: AchievementCacheReadinessItem[] = [
    {
      action: input.cacheFolderHandoffReady
        ? "Keep Cache Folder as a user handoff until a real cache scanner is explicitly staged."
        : "Restore the desktop cache-folder handoff before local parser review.",
      detail: input.cacheFolderHandoffReady
        ? "The existing Cache Folder control can open the local achievement cache location, but this readiness panel does not scan it."
        : "No local achievement cache folder handoff is available.",
      evidence: input.cacheFolderHandoffReady ? "desktop handoff // user-opened folder" : "missing",
      id: "cache-folder-handoff",
      label: "Cache folder handoff",
      status: input.cacheFolderHandoffReady ? "review" : "blocked",
    },
    {
      action: input.sidecarFormatMapReady
        ? "Keep sidecar format assumptions visible until live client fixtures are validated per provider."
        : "Draft sidecar format mapping before parser coverage review.",
      detail: input.sidecarFormatMapReady
        ? "Local sidecar map covers known Steam/Xbox/GOG/Epic/EA/Ubisoft/Battle.net shaped achievement sources."
        : "No local sidecar format map is staged.",
      evidence: input.sidecarFormatMapReady
        ? "json sidecars // galaxy cache // legendary metadata"
        : "missing",
      id: "sidecar-format-map",
      label: "Sidecar format map",
      status: input.sidecarFormatMapReady ? "review" : "blocked",
    },
    {
      action: input.localParserCoverageReady
        ? "Keep parser coverage local until real client cache samples are added to fixture review."
        : "Stage parser coverage before claiming local achievement import support.",
      detail: input.localParserCoverageReady
        ? "Parser coverage is represented as local fixture lanes only; no provider cache or token is read."
        : "No parser coverage matrix is staged.",
      evidence: input.localParserCoverageReady
        ? "GOG // Epic // EA // Ubisoft // Battle.net"
        : "missing",
      id: "local-parser-coverage",
      label: "Local parser coverage",
      status: input.localParserCoverageReady ? "review" : "blocked",
    },
    {
      action: input.providerStatusMatrixReady
        ? "Keep provider statuses as UI evidence for available/not connected/private/failed/unsupported states."
        : "Stage provider status matrix before exposing cache readiness.",
      detail: input.providerStatusMatrixReady
        ? "Provider badges already distinguish official, unofficial, local, available, not connected, private, failed, and unsupported states."
        : "No provider status matrix is staged.",
      evidence: input.providerStatusMatrixReady
        ? "official // unofficial // local // unsupported"
        : "missing",
      id: "provider-status-matrix",
      label: "Provider status matrix",
      status: input.providerStatusMatrixReady ? "review" : "blocked",
    },
    {
      action: input.remoteHydrationStaged
        ? "Keep hosted hydration behind review until Supabase reads and merge policy are audited."
        : "Block hosted hydration until remote achievement reads and merge policy are staged.",
      detail: input.remoteHydrationStaged
        ? "Hosted hydration evidence exists, but remote unlock merging remains disabled here."
        : "No hosted achievement hydration path is staged by this local panel.",
      evidence: input.remoteHydrationStaged ? "contract draft only" : "blocked",
      id: "hosted-hydration",
      label: "Hosted hydration",
      status: input.remoteHydrationStaged ? "review" : "blocked",
    },
    {
      action: input.supabaseAchievementWriteStaged
        ? "Keep Supabase achievement writes behind RLS, retention, and duplicate-key review."
        : "Block Supabase achievement row writes until RLS and trusted ingestion are staged.",
      detail: input.supabaseAchievementWriteStaged
        ? "Supabase write evidence exists, but this panel does not mutate achievement rows."
        : "No Supabase achievement or user_achievements write path is staged.",
      evidence: input.supabaseAchievementWriteStaged ? "schema checklist only" : "blocked",
      id: "supabase-achievement-write",
      label: "Supabase achievement write",
      status: input.supabaseAchievementWriteStaged ? "review" : "blocked",
    },
    {
      action: input.oauthTokenExchangeStaged
        ? "Keep OAuth/token exchange behind review until provider scopes and token vaulting pass."
        : "Block OAuth/token exchange for cache readiness.",
      detail: input.oauthTokenExchangeStaged
        ? "OAuth evidence exists, but this panel does not connect accounts or read provider tokens."
        : "No OAuth token exchange or provider token read is staged.",
      evidence: input.oauthTokenExchangeStaged ? "scope checklist only" : "blocked",
      id: "oauth-token-exchange",
      label: "OAuth/token exchange",
      status: input.oauthTokenExchangeStaged ? "review" : "blocked",
    },
    {
      action: input.remoteCacheJobStaged
        ? "Keep remote cache jobs behind review until scheduling, redaction, and rollback pass."
        : "Block remote cache jobs until hosted scheduler and audit contracts exist.",
      detail: input.remoteCacheJobStaged
        ? "Remote cache job evidence is represented as a local scheduler checklist only."
        : "No remote achievement cache job is staged.",
      evidence: input.remoteCacheJobStaged ? "scheduler checklist only" : "blocked",
      id: "remote-cache-job",
      label: "Remote cache job",
      status: input.remoteCacheJobStaged ? "review" : "blocked",
    },
    {
      action: input.liveUnlockImportStaged
        ? "Keep live unlock import behind review until provider delivery and conflict handling are tested."
        : "Block live unlock import until provider delivery, dedupe, and rollback are staged.",
      detail: input.liveUnlockImportStaged
        ? "Live unlock import evidence exists, but this panel does not import provider unlocks."
        : "No live unlock import or remote unlock merge is staged.",
      evidence: input.liveUnlockImportStaged ? "import checklist only" : "blocked",
      id: "live-unlock-import",
      label: "Live unlock import",
      status: input.liveUnlockImportStaged ? "review" : "blocked",
    },
  ];

  const reviewCount = items.filter((item) => item.status === "review").length;
  const blockedCount = items.filter((item) => item.status === "blocked").length;

  return {
    blockedCount,
    guardCopy: ACHIEVEMENT_CACHE_READINESS_GUARD_COPY,
    guards: [...ACHIEVEMENT_CACHE_READINESS_GUARDS],
    items,
    reviewCount,
    statusLabel: "Local cache review",
    summary:
      "Local achievement cache readiness covers cache-folder handoff, sidecar formats, parser coverage, and provider status badges while provider sync, hosted hydration, Supabase writes, OAuth/token flow, remote cache jobs, credential use, official unlock proof, and live unlock imports stay blocked.",
  };
}

export function createVerifyAchievementCacheReadiness(): AchievementCacheReadiness {
  return buildAchievementCacheReadiness({
    cacheFolderHandoffReady: true,
    liveUnlockImportStaged: false,
    localParserCoverageReady: true,
    oauthTokenExchangeStaged: false,
    providerStatusMatrixReady: true,
    remoteCacheJobStaged: false,
    remoteHydrationStaged: false,
    sidecarFormatMapReady: true,
    supabaseAchievementWriteStaged: false,
  });
}
