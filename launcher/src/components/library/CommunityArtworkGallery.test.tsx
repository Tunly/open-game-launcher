import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getLocalCommunityArtworkCandidates,
  type GameCustomArtwork,
} from "../../lib/custom-artwork";
import { CommunityArtworkGallery } from "./CommunityArtworkGallery";

let root: Root | null = null;
const LOCAL_COMMUNITY_ARTWORK_VOTES_KEY = "og-launcher:community-artwork-votes:v1";

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  document.body.innerHTML = "";
  window.localStorage.clear();
});

function renderWithRoot(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(node);
  });
  return container;
}

describe("CommunityArtworkGallery", () => {
  it("renders local community artwork and applies a selected entry", () => {
    const onApply = vi.fn();
    const [candidate] = getLocalCommunityArtworkCandidates();
    const container = renderWithRoot(
      <CommunityArtworkGallery artwork={null} candidates={[candidate]} onApply={onApply} />,
    );

    expect(container).toHaveTextContent("Community Art Deck");
    expect(container).toHaveTextContent(candidate.title);
    expect(container).toHaveTextContent("Local Votes");

    const button = container.querySelector<HTMLButtonElement>(
      `button[title="Import ${candidate.title}"]`,
    );
    if (!button) throw new Error("Import button not found");

    act(() => {
      button.click();
    });

    expect(onApply).toHaveBeenCalledWith(candidate);
  });

  it("marks already imported artwork", () => {
    const [candidate] = getLocalCommunityArtworkCandidates();
    const artwork: GameCustomArtwork =
      candidate.kind === "cover"
        ? { coverUrl: candidate.url }
        : candidate.kind === "icon"
          ? { iconUrl: candidate.url }
          : { logoUrl: candidate.url };
    const container = renderWithRoot(
      <CommunityArtworkGallery artwork={artwork} candidates={[candidate]} onApply={vi.fn()} />,
    );

    expect(container).toHaveTextContent("Imported");
    expect(container.querySelector(`button[title="Imported ${candidate.title}"]`)).toBeDisabled();
  });

  it("persists local community artwork votes without hosted ranking claims", () => {
    const [candidate] = getLocalCommunityArtworkCandidates();
    const container = renderWithRoot(
      <CommunityArtworkGallery artwork={null} candidates={[candidate]} onApply={vi.fn()} />,
    );

    expect(container).toHaveTextContent("Browser-local vote ledger only");
    expect(container).toHaveTextContent(`${candidate.votes} Vote`);

    const voteButton = container.querySelector<HTMLButtonElement>(
      `button[aria-label="Add local vote for ${candidate.title}"]`,
    );
    if (!voteButton) throw new Error("Vote button not found");

    act(() => {
      voteButton.click();
    });

    expect(container).toHaveTextContent(`${candidate.votes + 1} Local`);
    expect(container).toHaveTextContent("Hosted ranking sync is still disabled");
    expect(
      JSON.parse(window.localStorage.getItem(LOCAL_COMMUNITY_ARTWORK_VOTES_KEY) ?? "[]"),
    ).toEqual([candidate.id]);
  });

  it("routes hosted community artwork votes and reports without local vote storage", () => {
    const [localCandidate] = getLocalCommunityArtworkCandidates();
    const candidate = {
      ...localCandidate,
      hosted: true,
      id: "hosted-artwork-1",
      title: "Hosted Panel Cover",
      userVote: 0 as const,
      votes: 41,
    };
    const onReport = vi.fn();
    const onVote = vi.fn();
    const container = renderWithRoot(
      <CommunityArtworkGallery
        artwork={null}
        candidates={[candidate]}
        hostedStatus={{ mode: "hosted", message: "Approved hosted artwork loaded." }}
        onApply={vi.fn()}
        onReport={onReport}
        onVote={onVote}
      />,
    );

    expect(container).toHaveTextContent("Hosted + Local Votes");
    expect(container).toHaveTextContent("Approved hosted artwork loaded.");
    expect(container).toHaveTextContent("Hosted");

    const voteButton = container.querySelector<HTMLButtonElement>(
      `button[aria-label="Add hosted vote for ${candidate.title}"]`,
    );
    if (!voteButton) throw new Error("Hosted vote button not found");

    act(() => {
      voteButton.click();
    });

    const reportButton = container.querySelector<HTMLButtonElement>(
      `button[title="Report ${candidate.title}"]`,
    );
    if (!reportButton) throw new Error("Report button not found");

    act(() => {
      reportButton.click();
    });

    expect(onVote).toHaveBeenCalledWith(candidate, 1);
    expect(onReport).toHaveBeenCalledWith(candidate);
    expect(window.localStorage.getItem(LOCAL_COMMUNITY_ARTWORK_VOTES_KEY)).toBeNull();
  });
});
