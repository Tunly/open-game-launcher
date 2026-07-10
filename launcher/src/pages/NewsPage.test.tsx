import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NewsItem } from "../lib/types/news";
import { NewsPage } from "./NewsPage";

const newsMocks = vi.hoisted(() => ({
  listPublishedNews: vi.fn(),
}));

vi.mock("../lib/supabase/news", () => newsMocks);

const hostedNews: NewsItem = {
  authorId: "author-hosted",
  body: "Full hosted bulletin body.",
  coverImageUrl: null,
  createdAt: "2026-07-10T10:00:00.000Z",
  excerpt: "Hosted bulletin excerpt.",
  gameId: null,
  id: "hosted-news",
  isPublished: true,
  publishedAt: "2026-07-10T10:00:00.000Z",
  slug: "hosted-news",
  tags: ["Hosted"],
  title: "Hosted News Bulletin",
  updatedAt: "2026-07-10T10:00:00.000Z",
};

describe("NewsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    newsMocks.listPublishedNews.mockResolvedValue([]);
  });

  it("shows an honest empty state when no published news exists", async () => {
    render(<NewsPage />);

    expect(await screen.findByRole("heading", { name: "No Bulletins" })).toBeInTheDocument();
    expect(screen.getByText(/no published news articles yet/i)).toBeInTheDocument();
    expect(screen.queryByText("Patch Wire: Client Health Relay")).not.toBeInTheDocument();
    expect(screen.queryByText("Store Desk: Review Replies Live")).not.toBeInTheDocument();
  });

  it("shows an error without substituting local articles and can retry", async () => {
    newsMocks.listPublishedNews
      .mockRejectedValueOnce(new Error("news service offline"))
      .mockResolvedValueOnce([hostedNews]);

    render(<NewsPage />);

    const alert = await screen.findByText(/hosted news unavailable: news service offline/i);
    expect(alert).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "No Bulletins" })).not.toBeInTheDocument();
    expect(screen.queryByText("Patch Wire: Client Health Relay")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry news" }));

    await waitFor(() => expect(newsMocks.listPublishedNews).toHaveBeenCalledTimes(2));
    expect(await screen.findAllByText("Hosted News Bulletin")).not.toHaveLength(0);
  });
});
