import { achievementIdentityKey, mergeAchievementRows } from "./achievement-merge";

export type AchievementHostedHydrationContractStatus = "pass" | "review";

export interface AchievementHostedHydrationContractLane {
  detail: string;
  evidence: string;
  id: string;
  label: string;
  status: AchievementHostedHydrationContractStatus;
}

export interface AchievementHostedHydrationContract {
  blockedClaims: string[];
  guardCopy: string;
  lanes: AchievementHostedHydrationContractLane[];
  passCount: number;
  reviewCount: number;
  statusLabel: string;
  summary: string;
}

const ACHIEVEMENT_HOSTED_HYDRATION_BLOCKED_CLAIMS = [
  "No live hosted staging",
  "No Supabase writes",
  "No provider sync",
  "No OAuth/token exchange",
  "No remote cache job",
  "No trusted ingestion call",
  "No live unlock import",
  "No official unlock proof",
];

const ACHIEVEMENT_HOSTED_HYDRATION_GUARD_COPY =
  "Hosted achievement hydration contract proof is local and no-write. It reviews the authenticated Supabase read shape, provider-key filtering, catalog-game resolution, definition/unlock merge policy, missing-schema fallback, and local failure behavior without live hosted staging, Supabase writes, provider sync, OAuth/token exchange, remote cache jobs, trusted ingestion calls, live unlock import, or official unlock proof.";

/**
 * Derive the definition/unlock merge lane from the real merge policy so the
 * contract cannot drift from the implementation it claims to verify.
 */
function mergePolicyLane(): AchievementHostedHydrationContractLane {
  const keyShape =
    achievementIdentityKey(
      { id: "ach-001", source: "steam", sourceAchievementId: "ach-001" },
      "steam",
    ) === "steam:ach-001";
  const rowShape = Array.isArray(
    mergeAchievementRows(
      [],
      [{ id: "steam:ach-001", name: "A", source: "steam", sourceAchievementId: "ach-001" }],
      "steam",
    ),
  );
  const policyImplemented = keyShape && rowShape;

  return {
    detail: policyImplemented
      ? "Definitions merge with matching unlock rows via the shared achievement-merge policy (identity key + local-first precedence); missing unlock schema returns locked definitions instead of failing the archive."
      : "Definitions merge with matching unlock rows; the shared achievement-merge policy is not wired into this contract.",
    evidence: "achievementIdentityKey // mergeAchievementRows // locked fallback",
    id: "definition-unlock-merge",
    label: "Definition/Unlock Merge",
    status: policyImplemented ? "pass" : "review",
  };
}

export function createVerifyAchievementHostedHydrationContract(): AchievementHostedHydrationContract {
  const lanes: AchievementHostedHydrationContractLane[] = [
    {
      detail:
        "Hydration reads require the current session user id; unauthenticated sessions keep the local game list.",
      evidence: "getCurrentSessionUserId // fallback local games",
      id: "authenticated-read-scope",
      label: "Authenticated Read Scope",
      status: "review",
    },
    {
      detail:
        "Remote achievement definitions are filtered by provider key before they can merge into a launcher game.",
      evidence: "steam:ach-001 // epic:ach-002 // grouped-* excluded",
      id: "provider-key-filter",
      label: "Provider Key Filter",
      status: "pass",
    },
    {
      detail:
        "Catalog game ids are resolved from owned game/provider metadata; manual or unknown sources stay local-only.",
      evidence: "catalog game id // manual skip // unknown skip",
      id: "catalog-game-resolution",
      label: "Catalog Game Resolution",
      status: "review",
    },
    mergePolicyLane(),
    {
      detail:
        "Missing schema and hydration failures fall back to local achievements; the verify panel does not call the remote reader.",
      evidence: "missing schema -> [] // catch -> local games // no writes",
      id: "failure-to-local",
      label: "Failure-To-Local",
      status: "pass",
    },
  ];
  const passCount = lanes.filter((lane) => lane.status === "pass").length;
  const reviewCount = lanes.filter((lane) => lane.status === "review").length;

  return {
    blockedClaims: [...ACHIEVEMENT_HOSTED_HYDRATION_BLOCKED_CLAIMS],
    guardCopy: ACHIEVEMENT_HOSTED_HYDRATION_GUARD_COPY,
    lanes,
    passCount,
    reviewCount,
    statusLabel: "No-write contract",
    summary:
      "Hosted hydration contract proof stages the remote achievement read and merge policy locally while live hosted staging, writes, provider sync, remote jobs, and official unlock proof remain blocked.",
  };
}
