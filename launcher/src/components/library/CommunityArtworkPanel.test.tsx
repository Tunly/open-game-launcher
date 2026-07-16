import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CommunityArtworkCandidate } from "../../lib/custom-artwork";
import type { Game } from "../../lib/types";
import { CommunityArtworkPanel } from "./CommunityArtworkPanel";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  report: vi.fn(),
  upload: vi.fn(),
  vote: vi.fn(),
}));

vi.mock("../../lib/supabase/community-artwork", () => ({
  listHostedCommunityArtworkCandidates: mocks.list,
  reportHostedCommunityArtwork: mocks.report,
  setHostedCommunityArtworkVote: mocks.vote,
  uploadCommunityArtworkForGame: mocks.upload,
}));

const hostedCandidate: CommunityArtworkCandidate = {
  artist: "Hosted Artist",
  description: "Approved hosted cover",
  downloads: 12,
  hosted: true,
  id: "hosted-cover",
  kind: "cover",
  moderationStatus: "approved",
  sourceLabel: "Hosted Cover",
  tags: ["cover"],
  title: "Hosted Cover",
  url: "https://cdn.example/cover.webp",
  userVote: 0,
  votes: 4,
};

const game: Game = {
  description: "Test game",
  id: "game-1",
  platform: "windows",
  status: "installed",
  title: "Test Game",
  version: "1.0.0",
};

describe("CommunityArtworkPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue({ ok: true, value: [hostedCandidate] });
    mocks.vote.mockResolvedValue({
      ok: true,
      value: { artworkId: hostedCandidate.id, userVote: 1, voteScore: 5 },
    });
    mocks.report.mockResolvedValue({
      ok: true,
      value: {
        artworkId: hostedCandidate.id,
        moderationStatus: "approved",
        reportCount: 1,
        reportStatus: "active",
      },
    });
    mocks.upload.mockResolvedValue({
      ok: true,
      message: "Community artwork uploaded for moderation.",
      value: { ...hostedCandidate, id: "pending-cover", moderationStatus: "pending" },
    });
  });

  it("loads hosted candidates and applies the selected artwork", async () => {
    const onApply = vi.fn();
    render(<CommunityArtworkPanel artwork={null} game={game} onApply={onApply} />);

    const importButton = await screen.findByTitle("Import Hosted Cover");
    fireEvent.click(importButton);

    expect(mocks.list).toHaveBeenCalledWith("game-1");
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ id: "hosted-cover" }));
  });

  it("persists hosted votes and reports", async () => {
    render(<CommunityArtworkPanel artwork={null} game={game} onApply={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: /add hosted vote/i }));
    await waitFor(() => expect(mocks.vote).toHaveBeenCalledWith("hosted-cover", 1));
    expect((await screen.findAllByText("Hosted vote saved.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTitle("Report Hosted Cover"));
    await waitFor(() =>
      expect(mocks.report).toHaveBeenCalledWith(
        "hosted-cover",
        "other",
        expect.stringContaining("Test Game"),
      ),
    );
    expect(
      (await screen.findAllByText("Artwork report submitted for moderation.")).length,
    ).toBeGreaterThan(0);
  });

  it("uploads a submission and keeps it visible in the pending queue", async () => {
    const { container } = render(
      <CommunityArtworkPanel artwork={null} game={game} onApply={vi.fn()} />,
    );
    await screen.findByTitle("Import Hosted Cover");

    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    const file = new File(["image"], "new-cover.webp", { type: "image/webp" });
    fireEvent.change(input!, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /submit for review/i }));

    await waitFor(() =>
      expect(mocks.upload).toHaveBeenCalledWith(
        expect.objectContaining({ file, gameId: "game-1" }),
      ),
    );
    expect(await screen.findByText("Pending Review")).toBeInTheDocument();
  });
});
