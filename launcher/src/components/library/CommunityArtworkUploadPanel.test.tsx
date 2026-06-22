import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CommunityArtworkUploadPanel } from "./CommunityArtworkUploadPanel";
import type { CommunityArtworkCandidate } from "../../lib/custom-artwork";

let root: Root | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  document.body.innerHTML = "";
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

describe("CommunityArtworkUploadPanel", () => {
  it("keeps submit disabled until a file is selected", () => {
    const container = renderWithRoot(
      <CommunityArtworkUploadPanel
        gameTitle="Akira's Revenge"
        pendingSubmissions={[]}
        onSubmit={vi.fn()}
      />,
    );

    expect(container).toHaveTextContent("Hosted Upload Queue");
    expect(container).toHaveTextContent(/public ranking/i);
    expect(
      container.querySelector<HTMLButtonElement>('button[type="button"]:not([aria-pressed])'),
    ).toBeTruthy();
    expect(container.querySelector<HTMLButtonElement>("button[disabled]")).toHaveTextContent(
      "Submit for Review",
    );
  });

  it("submits selected artwork metadata for moderation", async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    const container = renderWithRoot(
      <CommunityArtworkUploadPanel
        gameTitle="Akira's Revenge"
        pendingSubmissions={[]}
        onSubmit={onSubmit}
      />,
    );
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!fileInput) throw new Error("File input missing");

    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        configurable: true,
        value: [new File(["cover"], "panel-cover.png", { type: "image/png" })],
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const submitButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent?.includes("Submit for Review"),
    );
    if (!submitButton) throw new Error("Submit button missing");

    await act(async () => {
      submitButton.click();
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        artistName: "OG Player",
        kind: "cover",
        tags: ["cover", "community-upload"],
        title: "panel cover",
      }),
    );
  });

  it("renders pending submissions without import or vote actions", () => {
    const pending: CommunityArtworkCandidate = {
      artist: "Manga Relay",
      description: "Queued.",
      downloads: 0,
      hosted: true,
      id: "pending-art",
      kind: "logo",
      moderationStatus: "pending",
      sourceLabel: "Pending Logo",
      tags: ["logo"],
      title: "Pending Logo",
      url: "https://cdn.example/logo.png",
      userVote: 0,
      votes: 0,
    };
    const container = renderWithRoot(
      <CommunityArtworkUploadPanel
        gameTitle="Akira's Revenge"
        message="Submission queued for moderation."
        pendingSubmissions={[pending]}
        onSubmit={vi.fn()}
      />,
    );

    expect(container).toHaveTextContent("Submission queued for moderation.");
    expect(container).toHaveTextContent("Pending Review");
    expect(container).toHaveTextContent("Pending Logo");
    expect(container).not.toHaveTextContent("Import Art");
    expect(container).not.toHaveTextContent("Vote");
    expect(container).not.toHaveTextContent("Report");
  });
});
