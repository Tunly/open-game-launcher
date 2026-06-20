import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BacklogPriorityPanel } from "./BacklogPriorityPanel";
import { buildBacklogRecommendationPlan } from "../../lib/backlog-recommendations";
import type { BacklogCandidate } from "../../lib/backlog-recommendations";
import { createVerifyBacklogCandidates } from "../../lib/library-backlog-candidates";

const LOCAL_BACKLOG_PREFERENCE_PROFILE_KEY = "og-launcher:backlog-preference-profile:v1";
const LOCAL_BACKLOG_LEARNING_PROFILE_KEY = "og-launcher:backlog-learning-profile:v1";
const LOCAL_BACKLOG_PLAY_NEXT_QUEUE_KEY = "og-launcher:backlog-play-next-queue:v1";

afterEach(() => {
  window.localStorage.clear();
});

describe("BacklogPriorityPanel", () => {
  it("renders local scoring guards without model or telemetry claims", () => {
    const plan = buildBacklogRecommendationPlan(createVerifyBacklogCandidates());

    render(<BacklogPriorityPanel plan={plan} />);

    const panel = screen.getByRole("region", { name: /backlog priority planner/i });

    expect(within(panel).getByText("Backlog Priority")).toBeInTheDocument();
    expect(within(panel).getByText("Mech Arcade")).toBeInTheDocument();
    expect(within(panel).getByText("Queue Fighter")).toBeInTheDocument();
    expect(within(panel).getByText("Missing Build")).toBeInTheDocument();
    expect(within(panel).getByText("Local Explanation Packet")).toBeInTheDocument();
    expect(within(panel).getByText(/Completion Gap:/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Social Signal:/i)).toBeInTheDocument();
    expect(within(panel).getByText("Skipped Model Steps")).toBeInTheDocument();
    expect(within(panel).getByText("No inference request sent")).toBeInTheDocument();
    expect(within(panel).getByText("No model call")).toBeInTheDocument();
    expect(within(panel).getByText("No hosted inference")).toBeInTheDocument();
    expect(within(panel).getByText("No cloud personalization")).toBeInTheDocument();
    expect(within(panel).getByText("Browser-local learning only")).toBeInTheDocument();
    expect(within(panel).getByText("No provider telemetry")).toBeInTheDocument();
    expect(within(panel).getByText("Play Next Queue")).toBeInTheDocument();
    expect(within(panel).getByText("No local picks queued")).toBeInTheDocument();
    expect(within(panel).getByText(/Manual browser-local queue only/i)).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /\b(?:model|llm|inference)\s+(?:connected|ready|enabled|active|served|trained|succeeded|sent)\b|\bhosted\s+(?:ai|model|inference)\s+(?:ready|enabled|connected|active|live)\b|\bcloud\s+(?:profile|personalization)\s+(?:ready|enabled|synced|active|live)\b|\blearned\s+user[- ]profile\s+(?:ready|synced|trained)\b|\bprovider\s+(?:telemetry|ranking)\s+(?:live|ready|enabled|synced|verified|connected)\b|\b(?:recommendation|ranking)\s+(?:model|service)\s+(?:ready|enabled|connected|active|live)\b|\bauto[- ]?launch\s+(?:ready|enabled|active)\b/i,
    );
  });

  it("stores a resettable browser-local preference profile without hosted-profile claims", () => {
    const candidates: BacklogCandidate[] = [
      {
        achievementsPercent: 20,
        downloadReady: true,
        estimatedSessionMinutes: 180,
        friendsPlaying: 3,
        id: "raid",
        installed: true,
        lastPlayedDaysAgo: 5,
        moodTags: ["raid"],
        playtimeMinutes: 0,
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
        playtimeMinutes: 0,
        storageReady: true,
        title: "Quick Solo Run",
      },
    ];
    const plan = buildBacklogRecommendationPlan(candidates);

    render(<BacklogPriorityPanel candidates={candidates} plan={plan} />);

    const panel = screen.getByRole("region", { name: /backlog priority planner/i });
    expect(within(panel).getByText(/Long Raid Night is the best local pick/i)).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: /quick/i }));

    expect(within(panel).getByText(/Quick Solo Run is the best local pick/i)).toBeInTheDocument();
    expect(within(panel).getByText(/45m target, any social mode/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Resettable local scoring profile only/i)).toBeInTheDocument();
    expect(within(panel).getAllByText(/Browser-local learning only/i).length).toBeGreaterThan(0);
    expect(
      JSON.parse(window.localStorage.getItem(LOCAL_BACKLOG_PREFERENCE_PROFILE_KEY) ?? "{}"),
    ).toMatchObject({
      preferredMoodTags: ["quick", "casual"],
      socialPreference: "any",
      targetSessionMinutes: 45,
    });
  });

  it("stores browser-local learning feedback and reranks the local pick", () => {
    const candidates: BacklogCandidate[] = [
      {
        achievementsPercent: 20,
        downloadReady: true,
        estimatedSessionMinutes: 120,
        friendsPlaying: 3,
        id: "raid",
        installed: true,
        lastPlayedDaysAgo: 5,
        moodTags: ["raid", "co-op"],
        playtimeMinutes: 0,
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
        playtimeMinutes: 0,
        storageReady: true,
        title: "Quick Solo Run",
      },
    ];
    const plan = buildBacklogRecommendationPlan(candidates);

    render(<BacklogPriorityPanel candidates={candidates} plan={plan} />);

    const panel = screen.getByRole("region", { name: /backlog priority planner/i });
    expect(within(panel).getByText(/Long Raid Night is the best local pick/i)).toBeInTheDocument();
    expect(within(panel).getByLabelText(/browser-local backlog learning profile/i)).toBeVisible();

    fireEvent.click(within(panel).getByRole("button", { name: /skip pick/i }));

    expect(within(panel).getByText(/Quick Solo Run is the best local pick/i)).toBeInTheDocument();
    expect(within(panel).getByText(/1 feedback entry/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Browser-local feedback adjusts mood/i)).toBeInTheDocument();
    expect(
      JSON.parse(window.localStorage.getItem(LOCAL_BACKLOG_LEARNING_PROFILE_KEY) ?? "{}"),
    ).toMatchObject({
      feedbackCount: 1,
      skippedCandidateIds: ["raid"],
    });
  });

  it("stores, removes, and clears a manual browser-local Play Next Queue", () => {
    const candidates: BacklogCandidate[] = [
      {
        achievementsPercent: 20,
        downloadReady: true,
        estimatedSessionMinutes: 120,
        friendsPlaying: 3,
        id: "raid",
        installed: true,
        lastPlayedDaysAgo: 5,
        moodTags: ["raid", "co-op"],
        playtimeMinutes: 0,
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
        playtimeMinutes: 0,
        storageReady: true,
        title: "Quick Solo Run",
      },
    ];
    const plan = buildBacklogRecommendationPlan(candidates);

    render(<BacklogPriorityPanel candidates={candidates} plan={plan} />);

    const panel = screen.getByRole("region", { name: /backlog priority planner/i });
    const queueRegion = within(panel).getByLabelText(/browser-local play next queue/i);

    fireEvent.click(within(queueRegion).getByRole("button", { name: /queue pick/i }));

    expect(within(queueRegion).getByText("Long Raid Night")).toBeInTheDocument();
    expect(
      within(queueRegion).getByText(/1 ready-next, 0 install-prep, 0 blocked queued picks/i),
    ).toBeInTheDocument();
    expect(within(queueRegion).getByText(/Ready next/i)).toBeInTheDocument();
    expect(
      within(queueRegion).getByText(/launch still stays user-controlled/i),
    ).toBeInTheDocument();
    expect(within(queueRegion).getByRole("button", { name: /queued/i })).toBeDisabled();
    expect(
      JSON.parse(window.localStorage.getItem(LOCAL_BACKLOG_PLAY_NEXT_QUEUE_KEY) ?? "[]"),
    ).toMatchObject([{ candidateId: "raid" }]);

    fireEvent.click(
      within(queueRegion).getByRole("button", {
        name: /remove long raid night from play next queue/i,
      }),
    );

    expect(within(queueRegion).getByText("No local picks queued")).toBeInTheDocument();
    expect(
      JSON.parse(window.localStorage.getItem(LOCAL_BACKLOG_PLAY_NEXT_QUEUE_KEY) ?? "[]"),
    ).toEqual([]);

    fireEvent.click(within(queueRegion).getByRole("button", { name: /queue pick/i }));
    fireEvent.click(within(queueRegion).getByRole("button", { name: /clear queue/i }));

    expect(
      JSON.parse(window.localStorage.getItem(LOCAL_BACKLOG_PLAY_NEXT_QUEUE_KEY) ?? "[]"),
    ).toEqual([]);
    expect(panel).not.toHaveTextContent(/auto-launch|cloud sync active|model queue ready/i);
  });

  it("shows a user-controlled Launch action only for ready-next queued picks when a callback exists", () => {
    const candidates: BacklogCandidate[] = [
      createBacklogCandidate({
        id: "ready-arcade",
        installed: true,
        title: "Ready Arcade",
      }),
      createBacklogCandidate({
        downloadReady: true,
        id: "install-fighter",
        installed: false,
        title: "Install Fighter",
      }),
      createBacklogCandidate({
        downloadReady: false,
        estimatedSessionMinutes: 0,
        id: "missing-build",
        installed: false,
        storageReady: false,
        title: "Missing Build",
      }),
    ];
    const plan = buildBacklogRecommendationPlan(candidates);
    const onLaunchCandidate = vi.fn();

    window.localStorage.setItem(
      LOCAL_BACKLOG_PLAY_NEXT_QUEUE_KEY,
      JSON.stringify([
        { candidateId: "ready-arcade", queuedAt: "2026-06-20T08:00:00.000Z" },
        { candidateId: "install-fighter", queuedAt: "2026-06-20T08:01:00.000Z" },
        { candidateId: "missing-build", queuedAt: "2026-06-20T08:02:00.000Z" },
      ]),
    );

    render(
      <BacklogPriorityPanel
        candidates={candidates}
        plan={plan}
        onLaunchCandidate={onLaunchCandidate}
      />,
    );

    const queueRegion = screen.getByLabelText(/browser-local play next queue/i);
    const readyLaunchButton = within(queueRegion).getByRole("button", {
      name: /launch ready arcade/i,
    });

    expect(
      within(queueRegion).queryByRole("button", { name: /launch install fighter/i }),
    ).not.toBeInTheDocument();
    expect(
      within(queueRegion).queryByRole("button", { name: /launch missing build/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(readyLaunchButton);

    expect(onLaunchCandidate).toHaveBeenCalledTimes(1);
    expect(onLaunchCandidate).toHaveBeenCalledWith("ready-arcade");
  });

  it("keeps queued ready-next picks non-launchable when no launch callback is provided", () => {
    const candidates: BacklogCandidate[] = [
      createBacklogCandidate({
        id: "ready-arcade",
        installed: true,
        title: "Ready Arcade",
      }),
    ];
    const plan = buildBacklogRecommendationPlan(candidates);

    window.localStorage.setItem(
      LOCAL_BACKLOG_PLAY_NEXT_QUEUE_KEY,
      JSON.stringify([{ candidateId: "ready-arcade", queuedAt: "2026-06-20T08:00:00.000Z" }]),
    );

    render(<BacklogPriorityPanel candidates={candidates} plan={plan} />);

    const queueRegion = screen.getByLabelText(/browser-local play next queue/i);

    expect(
      within(queueRegion).queryByRole("button", { name: /launch ready arcade/i }),
    ).not.toBeInTheDocument();
  });
});

function createBacklogCandidate(
  patch: Partial<BacklogCandidate> & Pick<BacklogCandidate, "id" | "title">,
): BacklogCandidate {
  return {
    achievementsPercent: 20,
    downloadReady: false,
    estimatedSessionMinutes: 70,
    friendsPlaying: 0,
    installed: true,
    lastPlayedDaysAgo: 12,
    moodTags: ["action"],
    playtimeMinutes: 120,
    storageReady: true,
    ...patch,
  };
}
