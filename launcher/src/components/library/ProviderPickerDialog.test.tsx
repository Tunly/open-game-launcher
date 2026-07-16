import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Game } from "../../lib/types";
import { ProviderPickerDialog } from "./ProviderPickerDialog";

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    description: "Provider picker fixture",
    id: "steam-fixture",
    launcher: "steam",
    platform: "windows",
    status: "installed",
    title: "Provider Picker Fixture",
    version: "1.0.0",
    ...overrides,
  } as Game;
}

describe("ProviderPickerDialog", () => {
  it("dispatches play selections with the play mode", () => {
    const game = makeGame();
    const onClose = vi.fn();
    const onSelect = vi.fn().mockResolvedValue(undefined);

    render(
      <ProviderPickerDialog
        state={{ mode: "play", title: game.title, variants: [game] }}
        onClose={onClose}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /steam.*play/i }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(game, "play");
  });

  it("labels mixed install actions coherently and dispatches install mode", () => {
    const install = makeGame({ id: "steam-new", status: "not_installed" });
    const update = makeGame({
      id: "gog-update",
      launcher: "gog",
      status: "update_available",
    });
    const onSelect = vi.fn().mockResolvedValue(undefined);

    render(
      <ProviderPickerDialog
        state={{ mode: "install", title: "Shared Game", variants: [install, update] }}
        onClose={vi.fn()}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText("Choose install / update platform")).toBeVisible();
    expect(screen.getByText("Install")).toBeVisible();
    expect(screen.getByText("Update")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /gog.*update available.*update/i }));

    expect(onSelect).toHaveBeenCalledWith(update, "install");
  });
});
