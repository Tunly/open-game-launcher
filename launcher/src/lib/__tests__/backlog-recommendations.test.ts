import { describe, expect, it } from "vitest";

import {
  applyBacklogLearningFeedback,
  BACKLOG_PLAY_NEXT_QUEUE_LIMIT,
  buildBacklogRecommendationPlan,
  normalizeBacklogPlayNextQueue,
  queueBacklogPlayNextCandidate,
  removeBacklogPlayNextCandidate,
} from "../backlog-recommendations";

describe("buildBacklogRecommendationPlan", () => {
  it("recommends the strongest installed local backlog pick", () => {
    const plan = buildBacklogRecommendationPlan([
      {
        achievementsPercent: 42,
        downloadReady: true,
        estimatedSessionMinutes: 80,
        friendsPlaying: 2,
        id: "mech",
        installed: true,
        lastPlayedDaysAgo: 3,
        moodTags: ["co-op", "action"],
        playtimeMinutes: 360,
        storageReady: true,
        title: "Mech Arcade",
      },
      {
        achievementsPercent: 12,
        downloadReady: true,
        estimatedSessionMinutes: 90,
        friendsPlaying: 0,
        id: "solo",
        installed: true,
        lastPlayedDaysAgo: 45,
        moodTags: ["story"],
        playtimeMinutes: 20,
        storageReady: true,
        title: "Solo Drift",
      },
    ]);

    expect(plan.topPick?.title).toBe("Mech Arcade");
    expect(plan.topPick?.status).toBe("ready");
    expect(plan.readyCount).toBe(2);
    expect(plan.summary).toBe("Mech Arcade is the best local pick for the next session.");
    expect(plan.checklist).toContain("Mech Arcade is the current local pick");
    expect(plan.checklist).toContain("Local explanation packet generated without model calls");
    expect(plan.explanation).toMatchObject({
      candidateId: "mech",
      score: plan.topPick?.score,
      title: "Mech Arcade",
    });
    expect(plan.explanation?.inputSignals).toContain("Installed locally");
    expect(plan.explanation?.scoreSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "social-signal",
          label: "Social Signal",
          points: 24,
        }),
      ]),
    );
    expect(plan.explanation?.skippedModelSteps).toContain("No inference request sent");
    expect(plan.explanation?.privacyNotes).toContain(
      "No prompt, cloud profile vector, or provider telemetry payload is generated",
    );
    expect(plan.explanation?.scoreSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "browser-local-learning-profile",
          label: "Local Learning",
          points: 0,
        }),
      ]),
    );
    expect(plan.playNextQueue[0]).toMatchObject({
      action: "ready-next",
      actionLabel: "Ready next",
      candidateId: "mech",
      guard: "Installed locally; launch still stays user-controlled.",
      position: 1,
      title: "Mech Arcade",
    });
    expect(plan.queueSummary).toContain("ready");
  });

  it("marks download-ready games as warning planning picks", () => {
    const plan = buildBacklogRecommendationPlan([
      {
        achievementsPercent: 15,
        downloadReady: true,
        estimatedSessionMinutes: 70,
        friendsPlaying: 1,
        id: "not-installed",
        installed: false,
        lastPlayedDaysAgo: null,
        moodTags: ["quick"],
        playtimeMinutes: 0,
        storageReady: true,
        title: "Queue Fighter",
      },
    ]);

    expect(plan.topPick?.title).toBe("Queue Fighter");
    expect(plan.topPick?.status).toBe("warning");
    expect(plan.warningCount).toBe(1);
    expect(plan.topPick?.warnings).toContain("Install before launch; this is a planning pick");
  });

  it("keeps the ranked Play Next Queue aligned with the local storage limit", () => {
    const plan = buildBacklogRecommendationPlan(
      Array.from({ length: BACKLOG_PLAY_NEXT_QUEUE_LIMIT + 2 }, (_, index) => ({
        achievementsPercent: 10 + index,
        downloadReady: true,
        estimatedSessionMinutes: 60,
        friendsPlaying: index % 2,
        id: `candidate-${index}`,
        installed: true,
        lastPlayedDaysAgo: index,
        moodTags: ["arcade"],
        playtimeMinutes: 30 + index,
        storageReady: true,
        title: `Candidate ${index}`,
      })),
    );

    expect(plan.playNextQueue).toHaveLength(BACKLOG_PLAY_NEXT_QUEUE_LIMIT);
    expect(plan.playNextQueue.map((item) => item.position)).toEqual(
      Array.from({ length: BACKLOG_PLAY_NEXT_QUEUE_LIMIT }, (_, index) => index + 1),
    );
  });

  it("blocks candidates without install, download, or storage readiness", () => {
    const plan = buildBacklogRecommendationPlan([
      {
        achievementsPercent: 0,
        downloadReady: false,
        estimatedSessionMinutes: 0,
        friendsPlaying: 0,
        id: "blocked",
        installed: false,
        lastPlayedDaysAgo: null,
        moodTags: [],
        playtimeMinutes: 0,
        storageReady: false,
        title: "Missing Build",
      },
    ]);

    expect(plan.topPick).toBeNull();
    expect(plan.explanation).toBeNull();
    expect(plan.blockedCount).toBe(1);
    expect(plan.recommendations[0].blockers).toContain(
      "Game is neither installed nor download-ready",
    );
    expect(plan.recommendations[0].blockers).toContain("Storage gate is not ready");
    expect(plan.recommendations[0].blockers).toContain("Session length estimate is missing");
  });

  it("applies a local preference profile without learned ranking claims", () => {
    const plan = buildBacklogRecommendationPlan(
      [
        {
          achievementsPercent: 20,
          downloadReady: true,
          estimatedSessionMinutes: 120,
          friendsPlaying: 3,
          id: "raid",
          installed: true,
          lastPlayedDaysAgo: 5,
          moodTags: ["raid"],
          playtimeMinutes: 60,
          storageReady: true,
          title: "Long Raid Night",
        },
        {
          achievementsPercent: 20,
          downloadReady: true,
          estimatedSessionMinutes: 45,
          friendsPlaying: 0,
          id: "quick",
          installed: true,
          lastPlayedDaysAgo: 5,
          moodTags: ["quick"],
          playtimeMinutes: 60,
          storageReady: true,
          title: "Quick Solo Run",
        },
      ],
      {
        preferredMoodTags: ["quick"],
        socialPreference: "solo",
        targetSessionMinutes: 45,
      },
    );

    expect(plan.topPick?.title).toBe("Quick Solo Run");
    expect(plan.preferenceSummary).toContain("45m target");
    expect(plan.checklist).toContain(
      "Browser-local preference profile: 45m target, solo social mode, quick tags",
    );
    expect(plan.explanation?.inputSignals).toContain(
      "Local preference profile: 45m target, solo social mode, quick tags",
    );
    expect(plan.explanation?.privacyNotes).toContain(
      "Local learning can be inspected and reset without account sync",
    );
    expect(plan.explanation?.scoreSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "local-preference-profile",
          label: "Local Preference",
        }),
      ]),
    );
  });

  it("applies browser-local learning feedback to future local ranking", () => {
    const candidates = [
      {
        achievementsPercent: 20,
        downloadReady: true,
        estimatedSessionMinutes: 120,
        friendsPlaying: 3,
        id: "raid",
        installed: true,
        lastPlayedDaysAgo: 5,
        moodTags: ["raid", "co-op"],
        playtimeMinutes: 60,
        storageReady: true,
        title: "Long Raid Night",
      },
      {
        achievementsPercent: 20,
        downloadReady: true,
        estimatedSessionMinutes: 45,
        friendsPlaying: 0,
        id: "quick",
        installed: true,
        lastPlayedDaysAgo: 5,
        moodTags: ["quick"],
        playtimeMinutes: 60,
        storageReady: true,
        title: "Quick Solo Run",
      },
    ];
    const baseline = buildBacklogRecommendationPlan(candidates);
    const learned = applyBacklogLearningFeedback(null, baseline.topPick!, "skip");
    const tuned = buildBacklogRecommendationPlan(candidates, null, learned);

    expect(baseline.topPick?.title).toBe("Long Raid Night");
    expect(tuned.topPick?.title).toBe("Quick Solo Run");
    expect(tuned.learningSummary).toContain("1 feedback entry");
    expect(
      tuned.checklist.some((item) =>
        item.includes("Browser-local learning profile: 1 feedback entry"),
      ),
    ).toBe(true);
    expect(
      tuned.recommendations
        .find((candidate) => candidate.id === "raid")
        ?.scoreSignals.find((signal) => signal.id === "browser-local-learning-profile")?.points,
    ).toBeLessThan(0);
    expect(tuned.explanation?.privacyNotes).toContain(
      "Ranking feedback is stored only in browser localStorage",
    );
  });

  it("normalizes browser-local Play Next Queue entries with dedupe and limit", () => {
    const rawQueue = [
      { candidateId: "alpha", queuedAt: "2026-01-01T00:00:00.000Z" },
      { candidateId: "alpha", queuedAt: "2026-01-02T00:00:00.000Z" },
      { candidateId: "  beta  ", queuedAt: "invalid" },
      { candidateId: "", queuedAt: "2026-01-03T00:00:00.000Z" },
      ...Array.from({ length: 12 }, (_, index) => ({
        candidateId: `extra-${index}`,
        queuedAt: "2026-01-04T00:00:00.000Z",
      })),
    ];

    const normalized = normalizeBacklogPlayNextQueue(rawQueue);

    expect(normalized).toHaveLength(BACKLOG_PLAY_NEXT_QUEUE_LIMIT);
    expect(normalized[0]).toEqual({
      candidateId: "alpha",
      queuedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(normalized[1]).toEqual({
      candidateId: "beta",
      queuedAt: "1970-01-01T00:00:00.000Z",
    });
    expect(normalized.filter((item) => item.candidateId === "alpha")).toHaveLength(1);
  });

  it("queues only playable local picks and removes queued candidates", () => {
    const now = new Date("2026-05-01T12:00:00.000Z");
    const readyCandidate = {
      id: "ready",
      status: "ready" as const,
    };
    const blockedCandidate = {
      id: "blocked",
      status: "blocked" as const,
    };

    const queued = queueBacklogPlayNextCandidate([], readyCandidate, now);
    const blockedAttempt = queueBacklogPlayNextCandidate(queued, blockedCandidate, now);
    const duplicate = queueBacklogPlayNextCandidate(blockedAttempt, readyCandidate, now);

    expect(queued).toEqual([{ candidateId: "ready", queuedAt: now.toISOString() }]);
    expect(blockedAttempt).toEqual(queued);
    expect(duplicate).toEqual(queued);
    expect(removeBacklogPlayNextCandidate(duplicate, "ready")).toEqual([]);
  });
});
