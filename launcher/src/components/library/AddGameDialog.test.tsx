import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(open).mockReset();
    vi.spyOn(window.navigator, "platform", "get").mockReturnValue("Win32");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the native dialog picker in the desktop app", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(open).mockResolvedValue("/games/super_mario-run.exe");

    render(<AddGameDialog isOpen onAddGame={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /browse exe/i }));

    await waitFor(() => {
      expect(open).toHaveBeenCalledWith(
        expect.objectContaining({
          directory: false,
          multiple: false,
          title: "Choose game executable",
        }),
      );
    });
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [
          {
            name: "Windows game executables",
            extensions: ["exe", "bat", "cmd"],
          },
        ],
      }),
    );
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

  it("marks local game registration desktop-only in the browser", () => {
    vi.mocked(isTauri).mockReturnValue(false);
    const onAddGame = vi.fn().mockResolvedValue(undefined);

    render(<AddGameDialog isOpen onAddGame={onAddGame} onClose={vi.fn()} />);

    expect(open).not.toHaveBeenCalled();
    expect(
      screen.getByText(/adding local games requires the og-launcher desktop app/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/game title/i)).toBeDisabled();
    expect(screen.getByLabelText(/executable/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /browse exe/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /desktop app required/i })).toBeDisabled();
    expect(onAddGame).not.toHaveBeenCalled();
  });

  it("rejects a manually entered non-executable Windows file before persisting it", async () => {
    const onAddGame = vi.fn().mockResolvedValue(undefined);
    render(<AddGameDialog isOpen onAddGame={onAddGame} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/game title/i), { target: { value: "Readme" } });
    fireEvent.change(screen.getByLabelText(/executable/i), {
      target: { value: "C:\\Games\\Readme.txt" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save game/i }));

    expect(
      await screen.findByText(
        "Choose a game executable (.exe, .bat, or .cmd) or its install folder.",
      ),
    ).toBeInTheDocument();
    expect(onAddGame).not.toHaveBeenCalled();
  });

  it("allows a supported Windows command launcher", async () => {
    const onAddGame = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<AddGameDialog isOpen onAddGame={onAddGame} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText(/game title/i), { target: { value: "Retro Game" } });
    fireEvent.change(screen.getByLabelText(/executable/i), {
      target: { value: "C:\\Games\\Retro Game\\launch.cmd" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save game/i }));

    await waitFor(() => {
      expect(onAddGame).toHaveBeenCalledWith({
        title: "Retro Game",
        installPath: "C:\\Games\\Retro Game\\launch.cmd",
      });
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("allows an install folder so the native backend can resolve its executable", async () => {
    const onAddGame = vi.fn().mockResolvedValue(undefined);
    render(<AddGameDialog isOpen onAddGame={onAddGame} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/game title/i), { target: { value: "Folder Game" } });
    fireEvent.change(screen.getByLabelText(/executable/i), {
      target: { value: "C:\\Games\\Folder Game" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save game/i }));

    await waitFor(() => {
      expect(onAddGame).toHaveBeenCalledWith({
        title: "Folder Game",
        installPath: "C:\\Games\\Folder Game",
      });
    });
  });
});
