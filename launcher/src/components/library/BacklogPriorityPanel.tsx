import {
  BookOpen,
  Brain,
  FileText,
  ListChecks,
  Play,
  PlusCircle,
  RotateCcw,
  ThumbsUp,
  TimerReset,
  Trophy,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import type {
  BacklogCandidate,
  BacklogLearningFeedback,
  BacklogLearningProfile,
  BacklogPlayNextQueueEntry,
  BacklogPlayNextQueueItem,
  BacklogPreferenceProfile,
  BacklogRecommendation,
  BacklogRecommendationPlan,
} from "../../lib/backlog-recommendations";
import {
  applyBacklogLearningFeedback,
  buildBacklogRecommendationPlan,
  DEFAULT_BACKLOG_LEARNING_PROFILE,
  DEFAULT_BACKLOG_PREFERENCE_PROFILE,
  normalizeBacklogLearningProfile,
  normalizeBacklogPlayNextQueue,
  normalizeBacklogPreferenceProfile,
  queueBacklogPlayNextCandidate,
  removeBacklogPlayNextCandidate,
} from "../../lib/backlog-recommendations";

const LOCAL_BACKLOG_PREFERENCE_PROFILE_KEY = "og-launcher:backlog-preference-profile:v1";
const LOCAL_BACKLOG_LEARNING_PROFILE_KEY = "og-launcher:backlog-learning-profile:v1";
const LOCAL_BACKLOG_PLAY_NEXT_QUEUE_KEY = "og-launcher:backlog-play-next-queue:v1";
const LEGACY_LOCAL_BACKLOG_PLAY_NEXT_QUEUE_KEY = "og-launcher:play-next-queue:v1";

export function BacklogPriorityPanel({
  candidates,
  launchingCandidateId = null,
  onLaunchCandidate,
  plan,
}: {
  candidates?: BacklogCandidate[];
  launchingCandidateId?: string | null;
  onLaunchCandidate?: (candidateId: string) => void | Promise<void>;
  plan: BacklogRecommendationPlan;
}) {
  const sourceCandidates = candidates ?? plan.recommendations;
  const [preferenceProfile, setPreferenceProfile] = useState<BacklogPreferenceProfile>(() =>
    readLocalBacklogPreferenceProfile(),
  );
  const [learningProfile, setLearningProfile] = useState<BacklogLearningProfile>(() =>
    readLocalBacklogLearningProfile(),
  );
  const [playNextQueue, setPlayNextQueue] = useState<BacklogPlayNextQueueEntry[]>(() =>
    readLocalBacklogPlayNextQueue(),
  );
  const activePlan = useMemo(
    () =>
      sourceCandidates.length > 0
        ? buildBacklogRecommendationPlan(sourceCandidates, preferenceProfile, learningProfile)
        : plan,
    [learningProfile, plan, preferenceProfile, sourceCandidates],
  );
  const queuedItems = useMemo(
    () => hydratePlayNextQueue(playNextQueue, activePlan.playNextQueue),
    [activePlan.playNextQueue, playNextQueue],
  );
  const queuedItemsSummary = useMemo(() => buildQueuedItemsSummary(queuedItems), [queuedItems]);
  const isTopPickQueued = Boolean(
    activePlan.topPick && playNextQueue.some((item) => item.candidateId === activePlan.topPick?.id),
  );

  function applyPreferenceProfile(profile: Partial<BacklogPreferenceProfile>) {
    const next = normalizeBacklogPreferenceProfile(profile);
    setPreferenceProfile(next);
    writeLocalBacklogPreferenceProfile(next);
  }

  function applyLearningFeedback(feedback: BacklogLearningFeedback) {
    if (!activePlan.topPick) return;

    const next = applyBacklogLearningFeedback(learningProfile, activePlan.topPick, feedback);
    setLearningProfile(next);
    writeLocalBacklogLearningProfile(next);
  }

  function resetLearningProfile() {
    setLearningProfile(DEFAULT_BACKLOG_LEARNING_PROFILE);
    writeLocalBacklogLearningProfile(DEFAULT_BACKLOG_LEARNING_PROFILE);
  }

  function queueTopPick() {
    if (!activePlan.topPick) return;

    const next = queueBacklogPlayNextCandidate(playNextQueue, activePlan.topPick);
    setPlayNextQueue(next);
    writeLocalBacklogPlayNextQueue(next);
  }

  function removeQueuedPick(candidateId: string) {
    const next = removeBacklogPlayNextCandidate(playNextQueue, candidateId);
    setPlayNextQueue(next);
    writeLocalBacklogPlayNextQueue(next);
  }

  function clearPlayNextQueue() {
    setPlayNextQueue([]);
    writeLocalBacklogPlayNextQueue([]);
  }

  return (
    <section
      aria-label="Backlog priority planner"
      className="border-4 border-black bg-[#fbf4e7] shadow-[3px_3px_0_#171411]"
    >
      <div className="border-b-2 border-black bg-[#171411] px-3 py-2 text-[#fbf4e7]">
        <p className="neo-copy text-[9px] font-black uppercase tracking-[0.14em] text-[#8cf5e4]">
          Local Assist
        </p>
        <h2 className="mt-1 flex items-center gap-2 text-[15px] font-black uppercase leading-none">
          <Brain aria-hidden="true" className="h-4 w-4" /> Backlog Priority
        </h2>
      </div>

      <div className="space-y-3 p-3">
        <div className="border-2 border-black bg-[#efe3cf] p-3 shadow-[2px_2px_0_#171411]">
          <p className="neo-copy text-[9px] font-black uppercase text-[#5b403f]">Top Pick</p>
          <p className="neo-title mt-1 text-3xl leading-none text-[#171411]">
            {activePlan.topPick ? activePlan.topPick.score : 0}
          </p>
          <p className="neo-copy mt-2 text-[9px] font-black uppercase leading-4 text-[#5b403f]">
            {activePlan.summary}
          </p>
        </div>

        {sourceCandidates.length > 0 ? (
          <div
            aria-label="Local backlog preference profile"
            className="border-2 border-black bg-[#fff9ed] p-2 shadow-[2px_2px_0_#171411]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="neo-copy text-[9px] font-black uppercase text-[#008f84]">
                  Preference Tape
                </p>
                <p className="neo-copy mt-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
                  {activePlan.preferenceSummary}
                </p>
              </div>
              <span className="neo-copy shrink-0 border-2 border-black bg-[#8cf5e4] px-1.5 py-0.5 text-[8px] font-black uppercase text-[#171411]">
                Browser local
              </span>
            </div>
            <p className="neo-copy mt-2 border-2 border-black bg-[#efe3cf] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
              Resettable local scoring profile only. No hosted model, cloud personalization,
              provider telemetry, or ranking sync.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <PreferenceButton
                active={activePlan.preferenceProfile.targetSessionMinutes === 45}
                icon={<TimerReset aria-hidden="true" className="h-3.5 w-3.5" />}
                label="Quick"
                toggle
                onClick={() =>
                  applyPreferenceProfile({
                    preferredMoodTags: ["quick", "casual"],
                    socialPreference: "any",
                    targetSessionMinutes: 45,
                  })
                }
              />
              <PreferenceButton
                active={activePlan.preferenceProfile.socialPreference === "social"}
                icon={<Users aria-hidden="true" className="h-3.5 w-3.5" />}
                label="Co-Op"
                toggle
                onClick={() =>
                  applyPreferenceProfile({
                    preferredMoodTags: ["co-op", "multiplayer", "action"],
                    socialPreference: "social",
                    targetSessionMinutes: 75,
                  })
                }
              />
              <PreferenceButton
                active={activePlan.preferenceProfile.preferredMoodTags.includes("story")}
                icon={<BookOpen aria-hidden="true" className="h-3.5 w-3.5" />}
                label="Story"
                toggle
                onClick={() =>
                  applyPreferenceProfile({
                    preferredMoodTags: ["story", "singleplayer"],
                    socialPreference: "solo",
                    targetSessionMinutes: 90,
                  })
                }
              />
              <PreferenceButton
                active={false}
                icon={<RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />}
                label="Reset"
                onClick={() => applyPreferenceProfile(DEFAULT_BACKLOG_PREFERENCE_PROFILE)}
              />
            </div>
          </div>
        ) : null}

        {sourceCandidates.length > 0 ? (
          <div
            aria-label="Browser-local backlog learning profile"
            className="border-2 border-black bg-[#fff9ed] p-2 shadow-[2px_2px_0_#171411]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="neo-copy text-[9px] font-black uppercase text-[#b7102a]">
                  Learning Tape
                </p>
                <p className="neo-copy mt-1 text-[8px] font-black uppercase leading-4 text-[#5b403f] [overflow-wrap:anywhere]">
                  {activePlan.learningSummary}
                </p>
              </div>
              <span className="neo-copy shrink-0 border-2 border-black bg-[#8cf5e4] px-1.5 py-0.5 text-[8px] font-black uppercase text-[#171411]">
                LocalStorage
              </span>
            </div>
            <p className="neo-copy mt-2 border-2 border-black bg-[#efe3cf] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
              Browser-local feedback adjusts mood, session, and social weights. No cloud profile,
              hosted learning, provider telemetry, or account sync.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <PreferenceButton
                active={false}
                disabled={!activePlan.topPick}
                icon={<ThumbsUp aria-hidden="true" className="h-3.5 w-3.5" />}
                label="Boost Pick"
                onClick={() => applyLearningFeedback("boost")}
              />
              <PreferenceButton
                active={false}
                disabled={!activePlan.topPick}
                icon={<XCircle aria-hidden="true" className="h-3.5 w-3.5" />}
                label="Skip Pick"
                onClick={() => applyLearningFeedback("skip")}
              />
              <PreferenceButton
                active={false}
                disabled={!activePlan.topPick}
                icon={<Trophy aria-hidden="true" className="h-3.5 w-3.5" />}
                label="Finished"
                onClick={() => applyLearningFeedback("complete")}
              />
              <PreferenceButton
                active={activePlan.learningProfile.feedbackCount === 0}
                icon={<RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />}
                label="Clear Learn"
                onClick={resetLearningProfile}
              />
            </div>
          </div>
        ) : null}

        {sourceCandidates.length > 0 ? (
          <div
            aria-label="Browser-local Play Next Queue"
            className="border-2 border-black bg-[#fff9ed] p-2 shadow-[2px_2px_0_#171411]"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="neo-copy text-[9px] font-black uppercase text-[#008f84]">
                  Play Next Queue
                </p>
                <p className="neo-copy mt-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
                  {queuedItems.length > 0
                    ? `${queuedItems.length} manual local pick${
                        queuedItems.length === 1 ? "" : "s"
                      } queued // ${queuedItemsSummary}`
                    : "No local picks queued // queue a top pick manually"}
                </p>
              </div>
              <span className="neo-copy shrink-0 border-2 border-black bg-[#8cf5e4] px-1.5 py-0.5 text-[8px] font-black uppercase text-[#171411]">
                LocalStorage
              </span>
            </div>

            <p className="neo-copy mt-2 border-2 border-black bg-[#efe3cf] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
              Manual browser-local queue only. No automatic launch; user-controlled local Launch
              only. No cloud sync, provider telemetry, or model call.
            </p>

            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <PreferenceButton
                active={isTopPickQueued}
                disabled={!activePlan.topPick || isTopPickQueued}
                icon={<PlusCircle aria-hidden="true" className="h-3.5 w-3.5" />}
                label={isTopPickQueued ? "Queued" : "Queue Pick"}
                onClick={queueTopPick}
              />
              <PreferenceButton
                active={queuedItems.length === 0}
                disabled={queuedItems.length === 0}
                icon={<Trash2 aria-hidden="true" className="h-3.5 w-3.5" />}
                label="Clear Queue"
                onClick={clearPlayNextQueue}
              />
            </div>

            <div className="mt-2 grid gap-1.5">
              {queuedItems.length > 0 ? (
                queuedItems.map((item) => (
                  <PlayNextQueueRow
                    canLaunch={item.action === "ready-next" && Boolean(onLaunchCandidate)}
                    isLaunching={launchingCandidateId === item.candidateId}
                    item={item}
                    key={item.candidateId}
                    onLaunch={onLaunchCandidate}
                    onRemove={removeQueuedPick}
                  />
                ))
              ) : (
                <p className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
                  No local picks queued
                </p>
              )}
            </div>
          </div>
        ) : null}

        <div className="grid gap-2">
          {activePlan.recommendations.slice(0, 3).map((recommendation) => (
            <RecommendationRow key={recommendation.id} recommendation={recommendation} />
          ))}
        </div>

        {activePlan.explanation ? (
          <div className="border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="neo-copy flex items-center gap-2 text-[9px] font-black uppercase text-[#008f84]">
                  <FileText aria-hidden="true" className="h-4 w-4" />
                  Local Explanation Packet
                </p>
                <p className="neo-copy mt-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
                  {activePlan.explanation.title} // {activePlan.explanation.status} // score{" "}
                  {activePlan.explanation.score}
                </p>
              </div>
              <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[8px] font-black uppercase text-[#171411] shadow-[1px_1px_0_#171411]">
                Local
              </span>
            </div>

            <div className="mt-3 grid gap-2">
              <div className="grid gap-1.5 sm:grid-cols-2">
                {activePlan.explanation.scoreSignals.map((signal) => (
                  <p
                    className="neo-copy border-2 border-black bg-[#efe3cf] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]"
                    key={signal.id}
                  >
                    {signal.label}: {formatSignalPoints(signal.points)} // {signal.detail}
                  </p>
                ))}
              </div>

              <div className="grid gap-1.5">
                {activePlan.explanation.inputSignals.slice(0, 5).map((signal) => (
                  <p
                    className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]"
                    key={signal}
                  >
                    {signal}
                  </p>
                ))}
              </div>

              <div className="border-2 border-black bg-[#171411] p-2 text-[#fbf4e7] shadow-[2px_2px_0_#b7102a]">
                <p className="neo-copy text-[8px] font-black uppercase text-[#8cf5e4]">
                  Skipped Model Steps
                </p>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {activePlan.explanation.skippedModelSteps.slice(0, 6).map((step) => (
                    <p
                      className="neo-copy border-2 border-[#fbf4e7] bg-[#2a221b] px-2 py-1 text-[8px] font-black uppercase leading-4"
                      key={step}
                    >
                      {step}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="border-2 border-black bg-[#171411] p-3 text-[#fbf4e7] shadow-[2px_2px_0_#b7102a]">
          <p className="neo-copy text-[9px] font-black uppercase text-[#8cf5e4]">
            Recommendation Guard
          </p>
          <div className="mt-2 grid gap-1.5">
            {[
              "No model call",
              "No hosted inference",
              "No cloud personalization",
              "Browser-local learning only",
              "No provider telemetry",
            ].map((item) => (
              <p
                className="neo-copy border-2 border-[#fbf4e7] bg-[#2a221b] px-2 py-1 text-[8px] font-black uppercase leading-4"
                key={item}
              >
                {item}
              </p>
            ))}
          </div>
        </div>

        <div className="border-2 border-black bg-[#efe3cf] p-2 shadow-[2px_2px_0_#171411]">
          <p className="neo-copy flex items-center gap-2 text-[9px] font-black uppercase text-[#b7102a]">
            <ListChecks aria-hidden="true" className="h-4 w-4" /> Local Checklist
          </p>
          <div className="mt-2 grid gap-1.5">
            {activePlan.checklist.slice(0, 5).map((item) => (
              <p
                className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]"
                key={item}
              >
                {item}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PlayNextQueueRow({
  canLaunch,
  isLaunching,
  item,
  onLaunch,
  onRemove,
}: {
  canLaunch: boolean;
  isLaunching: boolean;
  item: BacklogPlayNextQueueItem;
  onLaunch?: (candidateId: string) => void | Promise<void>;
  onRemove: (candidateId: string) => void;
}) {
  return (
    <article
      className={`border-2 border-black p-2 shadow-[2px_2px_0_#171411] ${getStatusClass(
        item.status,
      )}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy text-[8px] font-black uppercase tracking-[0.1em] text-[#5b403f]">
            #{item.position} // {item.actionLabel} // score {item.score}
          </p>
          <h3 className="mt-1 truncate text-sm font-black uppercase text-[#171411]">
            {item.title}
          </h3>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {canLaunch ? (
            <button
              aria-label={`Launch ${item.title} from Play Next Queue`}
              className="neo-copy inline-flex h-7 items-center justify-center gap-1 border-2 border-black bg-[#8cf5e4] px-2 text-[8px] font-black uppercase text-[#171411] shadow-[1px_1px_0_#171411] hover:bg-[#fff9ed] disabled:opacity-60"
              disabled={isLaunching}
              type="button"
              onClick={() => {
                void onLaunch?.(item.candidateId);
              }}
            >
              <Play aria-hidden="true" className="h-3.5 w-3.5" />
              {isLaunching ? "Launching" : "Launch"}
            </button>
          ) : null}
          <button
            aria-label={`Remove ${item.title} from Play Next Queue`}
            className="neo-copy h-7 border-2 border-black bg-[#fff9ed] px-2 text-[8px] font-black uppercase text-[#171411] shadow-[1px_1px_0_#171411] hover:bg-[#fbd6dc]"
            type="button"
            onClick={() => onRemove(item.candidateId)}
          >
            Remove
          </button>
        </div>
      </div>
      <p className="neo-copy mt-2 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
        {item.timeBudgetLabel} // {item.reason}
      </p>
      <p className="neo-copy mt-2 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
        {item.guard}
      </p>
    </article>
  );
}

function hydratePlayNextQueue(
  queue: BacklogPlayNextQueueEntry[],
  rankedItems: BacklogPlayNextQueueItem[],
) {
  const byId = new Map(rankedItems.map((item) => [item.candidateId, item]));
  return queue
    .map((entry, index) => {
      const ranked = byId.get(entry.candidateId);
      return ranked ? { ...ranked, position: index + 1 } : null;
    })
    .filter((item): item is BacklogPlayNextQueueItem => Boolean(item));
}

function buildQueuedItemsSummary(items: BacklogPlayNextQueueItem[]) {
  if (items.length === 0) return "No local queue picks selected.";

  const readyCount = items.filter((item) => item.action === "ready-next").length;
  const prepCount = items.filter((item) => item.action === "install-prep").length;
  const blockedCount = items.filter((item) => item.action === "blocked").length;

  return `${readyCount} ready-next, ${prepCount} install-prep, ${blockedCount} blocked queued picks.`;
}

function PreferenceButton({
  active,
  disabled = false,
  icon,
  label,
  onClick,
  toggle = false,
}: {
  active: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  toggle?: boolean;
}) {
  return (
    <button
      aria-pressed={toggle ? active : undefined}
      className={`neo-copy inline-flex h-8 items-center justify-center gap-1 border-2 border-black px-2 text-[8px] font-black uppercase shadow-[1px_1px_0_#171411] transition disabled:opacity-50 ${
        active ? "bg-[#8cf5e4] text-[#171411]" : "bg-[#efe3cf] text-[#171411] hover:bg-[#8cf5e4]"
      }`}
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function RecommendationRow({ recommendation }: { recommendation: BacklogRecommendation }) {
  return (
    <article
      className={`border-2 border-black p-2 shadow-[2px_2px_0_#171411] ${getStatusClass(
        recommendation.status,
      )}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy text-[8px] font-black uppercase tracking-[0.1em] text-[#5b403f]">
            {recommendation.status} // {recommendation.achievementsPercent}% archive
          </p>
          <h3 className="mt-1 truncate text-sm font-black uppercase text-[#171411]">
            {recommendation.title}
          </h3>
        </div>
        <span className="neo-title text-2xl leading-none text-[#171411]">
          {recommendation.score}
        </span>
      </div>
      <p className="neo-copy mt-2 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
        {recommendation.reason}
      </p>
      {[...recommendation.blockers, ...recommendation.warnings].slice(0, 1).map((item) => (
        <p
          className="neo-copy mt-2 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]"
          key={item}
        >
          {item}
        </p>
      ))}
    </article>
  );
}

function getStatusClass(status: BacklogRecommendation["status"]) {
  if (status === "ready") return "bg-[#8cf5e4]";
  if (status === "warning") return "bg-[#fff9ed]";
  return "bg-[#efe3cf]";
}

function formatSignalPoints(points: number) {
  const prefix = points > 0 ? "+" : "";
  return `${prefix}${Number.isInteger(points) ? points : points.toFixed(1)}`;
}

function readLocalBacklogPreferenceProfile(): BacklogPreferenceProfile {
  if (typeof window === "undefined") return DEFAULT_BACKLOG_PREFERENCE_PROFILE;

  try {
    const raw = window.localStorage.getItem(LOCAL_BACKLOG_PREFERENCE_PROFILE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return normalizeBacklogPreferenceProfile(
      parsed && typeof parsed === "object" ? (parsed as Partial<BacklogPreferenceProfile>) : null,
    );
  } catch {
    return DEFAULT_BACKLOG_PREFERENCE_PROFILE;
  }
}

function writeLocalBacklogPreferenceProfile(profile: BacklogPreferenceProfile) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(LOCAL_BACKLOG_PREFERENCE_PROFILE_KEY, JSON.stringify(profile));
}

function readLocalBacklogLearningProfile(): BacklogLearningProfile {
  if (typeof window === "undefined") return DEFAULT_BACKLOG_LEARNING_PROFILE;

  try {
    const raw = window.localStorage.getItem(LOCAL_BACKLOG_LEARNING_PROFILE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return normalizeBacklogLearningProfile(
      parsed && typeof parsed === "object" ? (parsed as Partial<BacklogLearningProfile>) : null,
    );
  } catch {
    return DEFAULT_BACKLOG_LEARNING_PROFILE;
  }
}

function writeLocalBacklogLearningProfile(profile: BacklogLearningProfile) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(LOCAL_BACKLOG_LEARNING_PROFILE_KEY, JSON.stringify(profile));
}

function readLocalBacklogPlayNextQueue(): BacklogPlayNextQueueEntry[] {
  if (typeof window === "undefined") return [];

  try {
    const raw =
      window.localStorage.getItem(LOCAL_BACKLOG_PLAY_NEXT_QUEUE_KEY) ??
      window.localStorage.getItem(LEGACY_LOCAL_BACKLOG_PLAY_NEXT_QUEUE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const normalized = normalizeBacklogPlayNextQueue(parsed);

    if (!window.localStorage.getItem(LOCAL_BACKLOG_PLAY_NEXT_QUEUE_KEY) && normalized.length > 0) {
      writeLocalBacklogPlayNextQueue(normalized);
      window.localStorage.removeItem(LEGACY_LOCAL_BACKLOG_PLAY_NEXT_QUEUE_KEY);
    }

    return normalized;
  } catch {
    return [];
  }
}

function writeLocalBacklogPlayNextQueue(queue: BacklogPlayNextQueueEntry[]) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    LOCAL_BACKLOG_PLAY_NEXT_QUEUE_KEY,
    JSON.stringify(normalizeBacklogPlayNextQueue(queue)),
  );
}
