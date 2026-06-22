import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { AddGameDialog } from "./AddGameDialog";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

describe("AddGameDialog executable picker", () => {
  beforeEach(() => {
    vi.mocked(isTauri).mockReset();
    vi.mocked(open).mockReset();
  });

  it("uses the native dialog picker in the desktop app", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(open).mockResolvedValue("/games/super_mario-run.exe");

    render(<AddGameDialog isOpen onAddGame={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /browse exe/i }));

    await waitFor(() => {
      expect(open).toHaveBeenCalledWith({
        directory: false,
        multiple: false,
        title: "Choose game executable",
      });
    });
    expect(screen.getByLabelText(/executable/i)).toHaveValue("/games/super_mario-run.exe");
    expect(screen.getByLabelText(/game title/i)).toHaveValue("super mario run");
  });

  it("keeps manual entry available when the desktop dialog is cancelled", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(open).mockResolvedValue(null);

    render(<AddGameDialog isOpen onAddGame={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /browse exe/i }));

    expect(await screen.findByText("Executable selection cancelled.")).toBeInTheDocument();
    expect(screen.getByLabelText(/executable/i)).toHaveValue("");
  });

  it("explains the browser fallback instead of dead-ending file selection", async () => {
    vi.mocked(isTauri).mockReturnValue(false);

    render(<AddGameDialog isOpen onAddGame={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /browse exe/i }));

    expect(open).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Desktop app can open a native file picker. Browser preview keeps manual EXE entry available.",
      ),
    ).toBeInTheDocument();
  });
});
