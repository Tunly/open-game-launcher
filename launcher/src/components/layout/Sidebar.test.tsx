import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Sidebar } from "./Sidebar";

describe("Sidebar", () => {
  it("keeps navigation labels visible when the header becomes narrow", () => {
    render(<Sidebar activePage="library" onNavigate={vi.fn()} />);

    for (const label of [
      "Library",
      "Achievements",
      "Activity",
      "Downloads",
      "Store",
      "Community",
    ]) {
      expect(screen.getByText(label)).not.toHaveClass("hidden");
    }
  });

  it("keeps the download count badge inside the navigation button", () => {
    render(<Sidebar activePage="downloads" downloadCount={6} onNavigate={vi.fn()} />);

    const downloadsButton = screen.getByRole("button", { name: "Downloads" });
    const downloadBadge = within(downloadsButton).getByText("6");

    expect(downloadBadge).toHaveClass("top-0");
    expect(downloadBadge).not.toHaveClass("-top-1");
  });

  it("scrolls the active item into view when the route changes", () => {
    const scrollIntoView = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    const { rerender } = render(<Sidebar activePage="library" onNavigate={vi.fn()} />);
    rerender(<Sidebar activePage="community" onNavigate={vi.fn()} />);

    expect(scrollIntoView).toHaveBeenLastCalledWith({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
    HTMLElement.prototype.scrollIntoView = original;
  });
});
