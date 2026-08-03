import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ModalDialog } from "./ModalDialog";

const backdropClassName = "fixed inset-0";
const panelClassName = "border-4 border-black";

describe("ModalDialog", () => {
  it("labels the modal, focuses its initial control, and dismisses on Escape", () => {
    const onDismiss = vi.fn();
    render(
      <ModalDialog
        labelledBy="dialog-title"
        backdropClassName={backdropClassName}
        panelClassName={panelClassName}
        initialFocusSelector="[data-initial]"
        onDismiss={onDismiss}
      >
        <h2 id="dialog-title">Choose provider</h2>
        <button type="button">First</button>
        <button type="button" data-initial>
          Preferred
        </button>
      </ModalDialog>,
    );

    expect(screen.getByRole("dialog", { name: "Choose provider" })).toHaveAttribute(
      "aria-modal",
      "true",
    );
    expect(screen.getByRole("button", { name: "Preferred" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("traps Tab navigation and restores focus when unmounted", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          {open ? (
            <ModalDialog
              labelledBy="trap-title"
              backdropClassName={backdropClassName}
              panelClassName={panelClassName}
              onDismiss={() => setOpen(false)}
            >
              <h2 id="trap-title">Trap focus</h2>
              <button type="button">First</button>
              <button type="button">Last</button>
            </ModalDialog>
          ) : null}
        </>
      );
    }

    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open" });
    opener.focus();
    fireEvent.click(opener);

    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });
    expect(first).toHaveFocus();
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(opener).toHaveFocus();
  });
});
