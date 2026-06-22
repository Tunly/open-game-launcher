import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DeduplicationPanel } from "./DeduplicationPanel";
import type { FriendLink } from "../../lib/types/friends";

const mocks = vi.hoisted(() => ({
  acceptMergeSuggestion: vi.fn(),
  dismissFriendLink: vi.fn(),
  generateHeuristicSuggestions: vi.fn(),
  getMergeSuggestions: vi.fn(),
  getUnmatchedFriendLinks: vi.fn(),
  rejectMergeSuggestion: vi.fn(),
}));

vi.mock("../../lib/supabase/friend-links", () => ({
  acceptMergeSuggestion: mocks.acceptMergeSuggestion,
  dismissFriendLink: mocks.dismissFriendLink,
  generateHeuristicSuggestions: mocks.generateHeuristicSuggestions,
  getMergeSuggestions: mocks.getMergeSuggestions,
  getUnmatchedFriendLinks: mocks.getUnmatchedFriendLinks,
  rejectMergeSuggestion: mocks.rejectMergeSuggestion,
}));

function createFriendLink(overrides: Partial<FriendLink>): FriendLink {
  return {
    id: "friend-link-1",
    ownerId: "owner-1",
    platform: "steam",
    platformFriendId: "steam-friend-1",
    platformFriendName: "Steam Rival",
    platformFriendAvatar: null,
    matchedUserId: null,
    matchMethod: null,
    dismissed: false,
    mergeGroupId: null,
    createdAt: "2026-06-15T00:00:00.000Z",
    updatedAt: "2026-06-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("DeduplicationPanel", () => {
  beforeEach(() => {
    mocks.acceptMergeSuggestion.mockReset();
    mocks.dismissFriendLink.mockReset();
    mocks.generateHeuristicSuggestions.mockReset();
    mocks.getMergeSuggestions.mockReset();
    mocks.getMergeSuggestions.mockResolvedValue([]);
    mocks.getUnmatchedFriendLinks.mockReset();
    mocks.rejectMergeSuggestion.mockReset();
  });

  it("renders staged merge-group evidence for unmatched friend links without narrow overflow classes", async () => {
    const mergeGroupId = "merge-group-2026-long-id-that-wraps-on-mobile";
    mocks.getUnmatchedFriendLinks.mockResolvedValue([
      createFriendLink({
        id: "friend-link-staged",
        platform: "gog",
        platformFriendId: "gog-friend-long-id",
        platformFriendName: "Very Long Cross Store Friend Alias That Needs Wrapping",
        mergeGroupId,
      }),
      createFriendLink({
        id: "friend-link-plain",
        platform: "epic",
        platformFriendId: "epic-friend-plain",
        platformFriendName: "Plain Epic Friend",
      }),
    ]);

    render(<DeduplicationPanel autoLoad />);

    const stagedLabel = await screen.findByText("Merge group staged");
    const stagedEvidence = stagedLabel.closest("div");

    expect(stagedLabel).toBeInTheDocument();
    expect(screen.getByText(mergeGroupId)).toBeInTheDocument();
    expect(screen.getByText("Very Long Cross Store Friend Alias That Needs Wrapping")).toHaveClass(
      "min-w-0",
      "break-words",
    );
    expect(screen.getByText(mergeGroupId)).toHaveClass("min-w-0", "break-words");
    expect(stagedEvidence).toHaveClass("min-w-0", "flex-wrap");

    const unmatchedPanel = screen.getByText("Unmatched Platform Friends").closest("div");
    expect(unmatchedPanel).not.toBeNull();
    expect(
      within(unmatchedPanel as HTMLElement).getByText("Plain Epic Friend"),
    ).toBeInTheDocument();
    expect(within(unmatchedPanel as HTMLElement).getAllByText("Merge group staged")).toHaveLength(
      1,
    );
  });
});
