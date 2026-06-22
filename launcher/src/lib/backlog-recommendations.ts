export type BacklogRecommendationStatus = "blocked" | "ready" | "warning";

export interface BacklogCandidate {
  achievementsPercent: number;
  downloadReady: boolean;
  estimatedSessionMinutes: number;
  friendsPlaying: number;
  id: string;
  installed: boolean;
  lastPlayedDaysAgo: number | null;
  moodTags: string[];
  playtimeMinutes: number;
  storageReady: boolean;
  title: string;
}

export interface BacklogRecommendation extends BacklogCandidate {
  blockers: string[];
  reason: string;
  score: number;
  scoreSignals: BacklogRecommendationScoreSignal[];
  status: BacklogRecommendationStatus;
  warnings: string[];
}

export type BacklogPlayNextQueueAction = "blocked" | "install-prep" | "ready-next";

export interface BacklogPlayNextQueueItem {
  action: BacklogPlayNextQueueAction;
  actionLabel: string;
  candidateId: string;
  guard: string;
  position: number;
  reason: string;
  score: number;
  status: BacklogRecommendationStatus;
  timeBudgetLabel: string;
  title: string;
}

export interface BacklogPlayNextQueueEntry {
  candidateId: string;
  queuedAt: string;
}

export interface BacklogRecommendationScoreSignal {
  detail: string;
  id: string;
  label: string;
  points: number;
}

export interface BacklogRecommendationExplanation {
  candidateId: string;
  inputSignals: string[];
  privacyNotes: string[];
  score: number;
  scoreSignals: BacklogRecommendationScoreSignal[];
  skippedModelSteps: string[];
  status: BacklogRecommendationStatus;
  title: string;
}

export type BacklogSocialPreference = "any" | "solo" | "social";

export interface BacklogPreferenceProfile {
  avoidedMoodTags: string[];
  preferredMoodTags: string[];
  socialPreference: BacklogSocialPreference;
  targetSessionMinutes: number;
}

export type BacklogLearningFeedback = "boost" | "complete" | "skip";

export interface BacklogLearningProfile {
  boostedCandidateIds: string[];
  completedCandidateIds: string[];
  feedbackCount: number;
  learnedSessionMinutes: number | null;
  moodWeights: Record<string, number>;
  skippedCandidateIds: string[];
  socialWeight: number;
}

export interface BacklogRecommendationPlan {
  blockedCount: number;
  checklist: string[];
  explanation: BacklogRecommendationExplanation | null;
  learningProfile: BacklogLearningProfile;
  learningSummary: string;
  playNextQueue: BacklogPlayNextQueueItem[];
  preferenceProfile: BacklogPreferenceProfile;
  preferenceSummary: string;
  queueSummary: string;
  recommendations: BacklogRecommendation[];
  readyCount: number;
  summary: string;
  topPick: BacklogRecommendation | null;
  warningCount: number;
}

export const DEFAULT_BACKLOG_PREFERENCE_PROFILE: BacklogPreferenceProfile = {
  avoidedMoodTags: [],
  preferredMoodTags: [],
  socialPreference: "any",
  targetSessionMinutes: 75,
};

export const DEFAULT_BACKLOG_LEARNING_PROFILE: BacklogLearningProfile = {
  boostedCandidateIds: [],
  completedCandidateIds: [],
  feedbackCount: 0,
  learnedSessionMinutes: null,
  moodWeights: {},
  skippedCandidateIds: [],
  socialWeight: 0,
};

export const BACKLOG_PLAY_NEXT_QUEUE_LIMIT = 8;

export function buildBacklogRecommendationPlan(
  candidates: BacklogCandidate[],
  preferenceProfile: Partial<BacklogPreferenceProfile> | null = null,
  learningProfile: Partial<BacklogLearningProfile> | null = null,
): BacklogRecommendationPlan {
  const normalizedProfile = normalizeBacklogPreferenceProfile(preferenceProfile);
  const normalizedLearningProfile = normalizeBacklogLearningProfile(learningProfile);
  const recommendations = candidates
    .map((candidate) => planCandidate(candidate, normalizedProfile, normalizedLearningProfile))
    .sort(sortRecommendations);
  const topPick = recommendations.find((candidate) => candidate.status !== "blocked") ?? null;
  const readyCount = recommendations.filter((candidate) => candidate.status === "ready").length;
  const warningCount = recommendations.filter((candidate) => candidate.status === "warning").length;
  const blockedCount = recommendations.filter((candidate) => candidate.status === "blocked").length;
  const playNextQueue = buildPlayNextQueue(recommendations);

  return {
    blockedCount,
    checklist: buildChecklist(
      recommendations,
      topPick,
      normalizedProfile,
      normalizedLearningProfile,
    ),
    explanation: buildExplanation(topPick, normalizedProfile, normalizedLearningProfile),
    learningProfile: normalizedLearningProfile,
    learningSummary: buildLearningSummary(normalizedLearningProfile),
    playNextQueue,
    preferenceProfile: normalizedProfile,
    preferenceSummary: buildPreferenceSummary(normalizedProfile),
    queueSummary: buildQueueSummary(playNextQueue),
    readyCount,
    recommendations,
    summary: buildSummary(recommendations, topPick),
    topPick,
    warningCount,
  };
}

export function normalizeBacklogLearningProfile(
  profile: Partial<BacklogLearningProfile> | null | undefined,
): BacklogLearningProfile {
  const moodWeights =
    profile?.moodWeights && typeof profile.moodWeights === "object" ? profile.moodWeights : {};
  const normalizedMoodWeights = Object.fromEntries(
    Object.entries(moodWeights)
      .filter(([tag, value]) => tag.trim() && Number.isFinite(value))
      .map(([tag, value]) => [tag.trim().toLowerCase(), clamp(Math.round(value * 10) / 10, -6, 6)])
      .slice(0, 12),
  );

  return {
    boostedCandidateIds: normalizeCandidateIds(profile?.boostedCandidateIds),
    completedCandidateIds: normalizeCandidateIds(profile?.completedCandidateIds),
    feedbackCount: Number.isFinite(profile?.feedbackCount)
      ? clamp(Math.round(profile?.feedbackCount ?? 0), 0, 999)
      : DEFAULT_BACKLOG_LEARNING_PROFILE.feedbackCount,
    learnedSessionMinutes: Number.isFinite(profile?.learnedSessionMinutes)
      ? clamp(Math.round(profile?.learnedSessionMinutes ?? 75), 30, 180)
      : null,
    moodWeights: normalizedMoodWeights,
    skippedCandidateIds: normalizeCandidateIds(profile?.skippedCandidateIds),
    socialWeight: Number.isFinite(profile?.socialWeight)
      ? clamp(Math.round((profile?.socialWeight ?? 0) * 10) / 10, -6, 6)
      : DEFAULT_BACKLOG_LEARNING_PROFILE.socialWeight,
  };
}

export function normalizeBacklogPreferenceProfile(
  profile: Partial<BacklogPreferenceProfile> | null | undefined,
): BacklogPreferenceProfile {
  return {
    avoidedMoodTags: normalizePreferenceTags(profile?.avoidedMoodTags),
    preferredMoodTags: normalizePreferenceTags(profile?.preferredMoodTags),
    socialPreference:
      profile?.socialPreference === "solo" || profile?.socialPreference === "social"
        ? profile.socialPreference
        : "any",
    targetSessionMinutes: Number.isFinite(profile?.targetSessionMinutes)
      ? clamp(Math.round(profile?.targetSessionMinutes ?? 75), 30, 180)
      : DEFAULT_BACKLOG_PREFERENCE_PROFILE.targetSessionMinutes,
  };
}

export function applyBacklogLearningFeedback(
  profile: Partial<BacklogLearningProfile> | null | undefined,
  candidate: BacklogCandidate,
  feedback: BacklogLearningFeedback,
): BacklogLearningProfile {
  const current = normalizeBacklogLearningProfile(profile);
  const moodWeights = { ...current.moodWeights };
  const moodDelta = feedback === "skip" ? -1.5 : feedback === "complete" ? 0.75 : 1.5;
  for (const moodTag of candidate.moodTags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)) {
    moodWeights[moodTag] = clamp((moodWeights[moodTag] ?? 0) + moodDelta, -6, 6);
  }

  const learnedSessionMinutes =
    feedback === "skip"
      ? current.learnedSessionMinutes
      : current.learnedSessionMinutes === null
        ? candidate.estimatedSessionMinutes
        : Math.round(current.learnedSessionMinutes * 0.7 + candidate.estimatedSessionMinutes * 0.3);
  const socialDelta =
    feedback === "skip"
      ? candidate.friendsPlaying > 0
        ? -0.8
        : 0.4
      : candidate.friendsPlaying > 0
        ? 0.8
        : -0.4;

  return normalizeBacklogLearningProfile({
    boostedCandidateIds:
      feedback === "boost"
        ? addUniqueId(current.boostedCandidateIds, candidate.id)
        : removeId(current.boostedCandidateIds, candidate.id),
    completedCandidateIds:
      feedback === "complete"
        ? addUniqueId(current.completedCandidateIds, candidate.id)
        : current.completedCandidateIds,
    feedbackCount: current.feedbackCount + 1,
    learnedSessionMinutes,
    moodWeights,
    skippedCandidateIds:
      feedback === "skip"
        ? addUniqueId(current.skippedCandidateIds, candidate.id)
        : removeId(current.skippedCandidateIds, candidate.id),
    socialWeight: current.socialWeight + socialDelta,
  });
}

export function normalizeBacklogPlayNextQueue(queue: unknown): BacklogPlayNextQueueEntry[] {
  if (!Array.isArray(queue)) return [];

  const seen = new Set<string>();
  const normalized: BacklogPlayNextQueueEntry[] = [];

  for (const item of queue) {
    if (!item || typeof item !== "object") continue;

    const candidateId =
      "candidateId" in item && typeof item.candidateId === "string" ? item.candidateId.trim() : "";
    if (!candidateId || seen.has(candidateId)) continue;

    const queuedAt =
      "queuedAt" in item && typeof item.queuedAt === "string" && isIsoDateString(item.queuedAt)
        ? item.queuedAt
        : new Date(0).toISOString();

    seen.add(candidateId);
    normalized.push({ candidateId, queuedAt });
    if (normalized.length >= BACKLOG_PLAY_NEXT_QUEUE_LIMIT) break;
  }

  return normalized;
}

export function queueBacklogPlayNextCandidate(
  queue: unknown,
  candidate: Pick<BacklogRecommendation, "id" | "status">,
  now: Date = new Date(),
): BacklogPlayNextQueueEntry[] {
  const current = normalizeBacklogPlayNextQueue(queue);
  if (candidate.status === "blocked") return current;

  return normalizeBacklogPlayNextQueue([
    { candidateId: candidate.id, queuedAt: now.toISOString() },
    ...current,
  ]);
}

export function removeBacklogPlayNextCandidate(
  queue: unknown,
  candidateId: string,
): BacklogPlayNextQueueEntry[] {
  const id = candidateId.trim();
  if (!id) return normalizeBacklogPlayNextQueue(queue);

  return normalizeBacklogPlayNextQueue(queue).filter((item) => item.candidateId !== id);
}

function planCandidate(
  candidate: BacklogCandidate,
  preferenceProfile: BacklogPreferenceProfile,
  learningProfile: BacklogLearningProfile,
): BacklogRecommendation {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!candidate.installed && !candidate.downloadReady) {
    blockers.push("Game is neither installed nor download-ready");
  }
  if (!candidate.storageReady) blockers.push("Storage gate is not ready");
  if (candidate.estimatedSessionMinutes <= 0) {
    blockers.push("Session length estimate is missing");
  }

  if (!candidate.installed && candidate.downloadReady) {
    warnings.push("Install before launch; this is a planning pick");
  }
  if (candidate.achievementsPercent >= 90) {
    warnings.push("Nearly complete; better as a cleanup pick");
  }
  if (candidate.lastPlayedDaysAgo !== null && candidate.lastPlayedDaysAgo > 180) {
    warnings.push("Cold backlog item; verify saves and mods before launch");
  }

  const status = blockers.length > 0 ? "blocked" : warnings.length > 0 ? "warning" : "ready";

  return {
    ...candidate,
    blockers,
    reason: buildReason(candidate),
    score:
      status === "blocked"
        ? 0
        : scoreCandidate(candidate, warnings.length, preferenceProfile, learningProfile),
    scoreSignals: buildScoreSignals(candidate, warnings.length, preferenceProfile, learningProfile),
    status,
    warnings,
  };
}

function scoreCandidate(
  candidate: BacklogCandidate,
  warningCount: number,
  preferenceProfile: BacklogPreferenceProfile,
  learningProfile: BacklogLearningProfile,
) {
  return Math.round(
    buildScoreSignals(candidate, warningCount, preferenceProfile, learningProfile).reduce(
      (total, signal) => total + signal.points,
      0,
    ),
  );
}

function buildScoreSignals(
  candidate: BacklogCandidate,
  warningCount: number,
  preferenceProfile: BacklogPreferenceProfile,
  learningProfile: BacklogLearningProfile,
): BacklogRecommendationScoreSignal[] {
  const completionGap = Math.max(0, 100 - clamp(candidate.achievementsPercent, 0, 100));
  const recencyScore =
    candidate.lastPlayedDaysAgo === null
      ? 18
      : Math.max(0, 32 - Math.min(candidate.lastPlayedDaysAgo, 32));
  const sessionFit = Math.max(0, 35 - Math.abs(candidate.estimatedSessionMinutes - 75) / 3);
  const playtimePenalty = -Math.min(candidate.playtimeMinutes / 120, 20);
  const warningPenalty = -warningCount * 8;

  return [
    {
      detail: `${completionGap}% unfinished local achievements`,
      id: "completion-gap",
      label: "Completion Gap",
      points: roundSignalPoints(completionGap * 0.5),
    },
    {
      detail:
        candidate.lastPlayedDaysAgo === null
          ? "No recent play timestamp, neutral local recency"
          : `${candidate.lastPlayedDaysAgo} day local recency window`,
      id: "local-recency",
      label: "Local Recency",
      points: roundSignalPoints(recencyScore),
    },
    {
      detail: `${candidate.estimatedSessionMinutes}m estimate against 75m target`,
      id: "session-fit",
      label: "Session Fit",
      points: roundSignalPoints(sessionFit),
    },
    {
      detail: `${candidate.friendsPlaying} local friend-count signal${
        candidate.friendsPlaying === 1 ? "" : "s"
      }`,
      id: "social-signal",
      label: "Social Signal",
      points: candidate.friendsPlaying * 12,
    },
    {
      detail: candidate.installed ? "Installed game can launch locally" : "Not installed locally",
      id: "install-state",
      label: "Install State",
      points: candidate.installed ? 30 : 0,
    },
    {
      detail: candidate.downloadReady
        ? "Download-ready fallback exists"
        : "No download-ready fallback",
      id: "download-state",
      label: "Download State",
      points: candidate.downloadReady ? 10 : 0,
    },
    {
      detail:
        candidate.moodTags.length > 0
          ? `${candidate.moodTags.slice(0, 3).join(", ")} local mood tags`
          : "No local mood tags",
      id: "mood-tags",
      label: "Mood Tags",
      points: candidate.moodTags.length > 0 ? 8 : 0,
    },
    {
      detail: `${candidate.playtimeMinutes}m existing playtime saturation`,
      id: "playtime-saturation",
      label: "Playtime Saturation",
      points: roundSignalPoints(playtimePenalty),
    },
    {
      detail: `${warningCount} local warning${warningCount === 1 ? "" : "s"} on candidate`,
      id: "warning-penalty",
      label: "Warning Penalty",
      points: warningPenalty,
    },
    buildLocalPreferenceSignal(candidate, preferenceProfile),
    buildBrowserLocalLearningSignal(candidate, learningProfile),
  ];
}

function buildLocalPreferenceSignal(
  candidate: BacklogCandidate,
  preferenceProfile: BacklogPreferenceProfile,
): BacklogRecommendationScoreSignal {
  const moodTags = new Set(candidate.moodTags.map((tag) => tag.toLowerCase()));
  const preferredMatches = preferenceProfile.preferredMoodTags.filter((tag) => moodTags.has(tag));
  const avoidedMatches = preferenceProfile.avoidedMoodTags.filter((tag) => moodTags.has(tag));
  const sessionDelta = Math.abs(
    candidate.estimatedSessionMinutes - preferenceProfile.targetSessionMinutes,
  );
  const sessionPoints = Math.max(0, 12 - sessionDelta / 5);
  const tagPoints = preferredMatches.length * 9 - avoidedMatches.length * 12;
  const socialPoints =
    preferenceProfile.socialPreference === "social"
      ? Math.min(candidate.friendsPlaying * 8, 16)
      : preferenceProfile.socialPreference === "solo"
        ? candidate.friendsPlaying === 0
          ? 8
          : -Math.min(candidate.friendsPlaying * 5, 12)
        : 0;

  return {
    detail: `${preferenceProfile.targetSessionMinutes}m local target // ${
      preferenceProfile.preferredMoodTags.length > 0
        ? `${preferenceProfile.preferredMoodTags.join("+")} preferred`
        : "no preferred tags"
    } // ${preferenceProfile.socialPreference} social mode${
      avoidedMatches.length > 0 ? ` // ${avoidedMatches.join("+")} avoided` : ""
    }`,
    id: "local-preference-profile",
    label: "Local Preference",
    points: roundSignalPoints(sessionPoints + tagPoints + socialPoints),
  };
}

function buildBrowserLocalLearningSignal(
  candidate: BacklogCandidate,
  learningProfile: BacklogLearningProfile,
): BacklogRecommendationScoreSignal {
  if (learningProfile.feedbackCount === 0) {
    return {
      detail: "No browser-local feedback yet",
      id: "browser-local-learning-profile",
      label: "Local Learning",
      points: 0,
    };
  }

  const moodPoints = candidate.moodTags.reduce(
    (total, moodTag) => total + (learningProfile.moodWeights[moodTag.toLowerCase()] ?? 0) * 4,
    0,
  );
  const boostedPoints = learningProfile.boostedCandidateIds.includes(candidate.id) ? 22 : 0;
  const skippedPenalty = learningProfile.skippedCandidateIds.includes(candidate.id) ? -30 : 0;
  const completedPenalty = learningProfile.completedCandidateIds.includes(candidate.id) ? -18 : 0;
  const sessionPoints =
    learningProfile.learnedSessionMinutes === null
      ? 0
      : Math.max(
          0,
          10 -
            Math.abs(candidate.estimatedSessionMinutes - learningProfile.learnedSessionMinutes) / 6,
        );
  const socialPoints =
    learningProfile.socialWeight === 0
      ? 0
      : candidate.friendsPlaying > 0
        ? learningProfile.socialWeight * 3
        : -learningProfile.socialWeight * 2;

  return {
    detail: `${learningProfile.feedbackCount} browser-local feedback entr${
      learningProfile.feedbackCount === 1 ? "y" : "ies"
    } // ${
      learningProfile.learnedSessionMinutes
        ? `${learningProfile.learnedSessionMinutes}m learned session`
        : "no learned session"
    } // ${Object.keys(learningProfile.moodWeights).slice(0, 3).join("+") || "no mood weights"}`,
    id: "browser-local-learning-profile",
    label: "Local Learning",
    points: roundSignalPoints(
      clamp(
        moodPoints +
          boostedPoints +
          skippedPenalty +
          completedPenalty +
          sessionPoints +
          socialPoints,
        -40,
        40,
      ),
    ),
  };
}

function sortRecommendations(left: BacklogRecommendation, right: BacklogRecommendation) {
  const statusRank: Record<BacklogRecommendationStatus, number> = {
    ready: 0,
    warning: 0,
    blocked: 2,
  };
  const byStatus = statusRank[left.status] - statusRank[right.status];
  if (byStatus !== 0) return byStatus;

  const byScore = right.score - left.score;
  if (byScore !== 0) return byScore;

  return left.title.localeCompare(right.title);
}

function buildReason(candidate: BacklogCandidate) {
  const tags = candidate.moodTags.slice(0, 2).join(" + ");
  const social =
    candidate.friendsPlaying > 0
      ? `${candidate.friendsPlaying} friend${candidate.friendsPlaying === 1 ? "" : "s"} active`
      : "solo lane";
  const session = `${candidate.estimatedSessionMinutes}m session`;

  return tags ? `${tags} // ${social} // ${session}` : `${social} // ${session}`;
}

function buildChecklist(
  recommendations: BacklogRecommendation[],
  topPick: BacklogRecommendation | null,
  preferenceProfile: BacklogPreferenceProfile,
  learningProfile: BacklogLearningProfile,
) {
  if (recommendations.length === 0) {
    return [
      "No local backlog candidates staged",
      "Add installed or download-ready games before scoring",
    ];
  }

  const installedCount = recommendations.filter((candidate) => candidate.installed).length;
  const socialCount = recommendations.filter((candidate) => candidate.friendsPlaying > 0).length;
  const moodCount = recommendations.filter((candidate) => candidate.moodTags.length > 0).length;

  return [
    `${installedCount} installed backlog item${installedCount === 1 ? "" : "s"} scored`,
    `${socialCount} social signal${socialCount === 1 ? "" : "s"} considered`,
    `${moodCount} mood tag lane${moodCount === 1 ? "" : "s"} matched`,
    topPick
      ? `${topPick.title} is the current local pick`
      : "No local recommendation can be picked until blockers clear",
    topPick
      ? "Local explanation packet generated without model calls"
      : "Explanation packet waits for an unblocked local pick",
    `Browser-local preference profile: ${buildPreferenceSummary(preferenceProfile)}`,
    `Browser-local learning profile: ${buildLearningSummary(learningProfile)}`,
  ];
}

function buildExplanation(
  topPick: BacklogRecommendation | null,
  preferenceProfile: BacklogPreferenceProfile,
  learningProfile: BacklogLearningProfile,
): BacklogRecommendationExplanation | null {
  if (!topPick) return null;

  return {
    candidateId: topPick.id,
    inputSignals: [
      topPick.installed ? "Installed locally" : "Download-ready planning pick",
      topPick.storageReady ? "Storage gate ready" : "Storage gate blocked",
      `${topPick.achievementsPercent}% achievement progress`,
      `${topPick.friendsPlaying} local friend-count signal${
        topPick.friendsPlaying === 1 ? "" : "s"
      }`,
      topPick.lastPlayedDaysAgo === null
        ? "No local last-played timestamp"
        : `${topPick.lastPlayedDaysAgo} days since local play`,
      topPick.moodTags.length > 0
        ? `${topPick.moodTags.slice(0, 3).join(", ")} mood tags`
        : "No local mood tags",
      `Local preference profile: ${buildPreferenceSummary(preferenceProfile)}`,
      `Browser-local learning profile: ${buildLearningSummary(learningProfile)}`,
    ],
    privacyNotes: [
      "Explanation is derived from local launcher fields only",
      "No prompt, cloud profile vector, or provider telemetry payload is generated",
      "Ranking feedback is stored only in browser localStorage",
      "Local learning can be inspected and reset without account sync",
    ],
    score: topPick.score,
    scoreSignals: topPick.scoreSignals,
    skippedModelSteps: [
      "Hosted model prompt not built",
      "No inference request sent",
      "Cloud personalization blocked",
      "No provider telemetry fetch",
      "No hosted learned-profile update",
      "No provider ranking sync",
    ],
    status: topPick.status,
    title: topPick.title,
  };
}

function buildSummary(
  recommendations: BacklogRecommendation[],
  topPick: BacklogRecommendation | null,
) {
  if (recommendations.length === 0) {
    return "Backlog Priority is waiting for local library signals.";
  }

  if (!topPick) {
    return "Backlog Priority found games, but every candidate is blocked.";
  }

  if (topPick.status === "warning") {
    return `${topPick.title} is the best local pick, but needs launch prep.`;
  }

  return `${topPick.title} is the best local pick for the next session.`;
}

function buildPlayNextQueue(recommendations: BacklogRecommendation[]): BacklogPlayNextQueueItem[] {
  return recommendations.slice(0, BACKLOG_PLAY_NEXT_QUEUE_LIMIT).map((recommendation, index) => {
    const action: BacklogPlayNextQueueAction =
      recommendation.status === "blocked"
        ? "blocked"
        : recommendation.installed
          ? "ready-next"
          : "install-prep";

    return {
      action,
      actionLabel:
        action === "ready-next"
          ? "Ready next"
          : action === "install-prep"
            ? "Install prep"
            : "Blocked",
      candidateId: recommendation.id,
      guard:
        action === "ready-next"
          ? "Installed locally; launch still stays user-controlled."
          : action === "install-prep"
            ? "Download-ready only; install before play."
            : (recommendation.blockers[0] ?? "Blocked until local gates clear."),
      position: index + 1,
      reason: recommendation.reason,
      score: recommendation.score,
      status: recommendation.status,
      timeBudgetLabel: `${recommendation.estimatedSessionMinutes}m local session lane`,
      title: recommendation.title,
    };
  });
}

function buildQueueSummary(queue: BacklogPlayNextQueueItem[]) {
  if (queue.length === 0) return "Play Next Queue is waiting for local backlog candidates.";

  const readyCount = queue.filter((item) => item.action === "ready-next").length;
  const prepCount = queue.filter((item) => item.action === "install-prep").length;
  const blockedCount = queue.filter((item) => item.action === "blocked").length;

  return `${readyCount} ready, ${prepCount} install-prep, ${blockedCount} blocked local queue lanes.`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundSignalPoints(value: number) {
  return Math.round(value * 10) / 10;
}

function normalizePreferenceTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];

  return Array.from(
    new Set(
      tags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, 4);
}

function normalizeCandidateIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];

  return Array.from(
    new Set(
      ids
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ).slice(0, 24);
}

function addUniqueId(ids: string[], id: string) {
  return Array.from(new Set([id, ...ids])).slice(0, 24);
}

function removeId(ids: string[], id: string) {
  return ids.filter((existingId) => existingId !== id);
}

function isIsoDateString(value: string) {
  return !Number.isNaN(new Date(value).getTime());
}

function buildPreferenceSummary(profile: BacklogPreferenceProfile) {
  const preferred =
    profile.preferredMoodTags.length > 0
      ? `${profile.preferredMoodTags.join("+")} tags`
      : "no tag boost";
  const avoided =
    profile.avoidedMoodTags.length > 0 ? `, avoids ${profile.avoidedMoodTags.join("+")}` : "";
  return `${profile.targetSessionMinutes}m target, ${profile.socialPreference} social mode, ${preferred}${avoided}`;
}

function buildLearningSummary(profile: BacklogLearningProfile) {
  if (profile.feedbackCount === 0) return "0 feedback entries, browser-local learning idle";

  const moods = Object.entries(profile.moodWeights)
    .sort(([, left], [, right]) => Math.abs(right) - Math.abs(left))
    .slice(0, 3)
    .map(([tag, weight]) => `${tag}:${weight > 0 ? "+" : ""}${weight}`)
    .join(" ");
  const session = profile.learnedSessionMinutes
    ? `${profile.learnedSessionMinutes}m learned session`
    : "no learned session";

  return `${profile.feedbackCount} feedback entr${
    profile.feedbackCount === 1 ? "y" : "ies"
  }, ${session}, ${moods || "no mood weights"}, social ${profile.socialWeight}`;
}
