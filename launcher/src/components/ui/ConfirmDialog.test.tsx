import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  const baseProps = {
    message: "Are you sure?",
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
    title: "Confirm action",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when closed", () => {
    const { container } = render(<ConfirmDialog {...baseProps} open={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders title, message, and default button labels when open", () => {
    render(<ConfirmDialog {...baseProps} open />);

    expect(screen.getByRole("dialog", { name: "Confirm action" })).toBeInTheDocument();
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("uses the Retro Manga ink halftone backdrop", () => {
    render(<ConfirmDialog {...baseProps} open />);

    const backdrop = screen.getByRole("dialog", { name: "Confirm action" }).parentElement;
    expect(backdrop).not.toBeNull();
    if (!backdrop) return;
    expect(backdrop.className).toContain("neo-dots-ink");
    expect(backdrop.className).not.toContain("backdrop-blur");
    expect(backdrop.className).not.toContain("bg-black/45");
    expect(backdrop.className).not.toContain("bg-black/50");
  });

  it("uses the destructive variant button label and icon when destructive", () => {
    render(<ConfirmDialog {...baseProps} confirmLabel="Delete" destructive open />);

    const confirmButton = screen.getByRole("button", { name: "Delete" });
    expect(confirmButton).toBeInTheDocument();
    // Destructive variant uses the danger token (red bg).
    expect(confirmButton.className).toMatch(/bg-\[#d93728\]/);
    // The AlertTriangle icon is rendered as an svg in the header.
    expect(screen.getByRole("dialog").querySelectorAll("svg").length).toBeGreaterThan(0);
  });

  it("focuses the safe action and responds to Escape without globally confirming Enter", () => {
    render(<ConfirmDialog {...baseProps} open />);

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    expect(cancelButton).toHaveFocus();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(baseProps.onCancel).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(cancelButton, { key: "Enter" });
    expect(baseProps.onConfirm).not.toHaveBeenCalled();
  });
});
