import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("renders children and forwards click", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    const button = screen.getByRole("button", { name: "Save" });
    fireEvent.click(button);

    expect(button).toBeInTheDocument();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it("defaults to type=button to avoid form submission", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("keeps interactive buttons flat without an offset shadow", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });

    expect(button.className).not.toMatch(/shadow-/);
  });

  it("applies variant and size classes", () => {
    render(
      <Button size="sm" variant="secondary">
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save" });
    // Secondary uses the paper background token; primary uses red.
    expect(button.className).toMatch(/bg-\[#fbf4e7\]/);
    expect(button.className).toMatch(/h-8/);
  });

  it("merges custom className", () => {
    render(<Button className="custom-class">Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveClass("custom-class");
  });
});
