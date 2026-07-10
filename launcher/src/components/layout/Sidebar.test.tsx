import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Sidebar } from "./Sidebar";

describe("Sidebar", () => {
  it("keeps the download count badge inside the navigation button", () => {
    render(<Sidebar activePage="downloads" downloadCount={6} onNavigate={vi.fn()} />);

    const downloadsButton = screen.getByRole("button", { name: "Downloads" });
    const downloadBadge = within(downloadsButton).getByText("6");

    expect(downloadBadge).toHaveClass("top-0");
    expect(downloadBadge).not.toHaveClass("-top-1");
  });
});
