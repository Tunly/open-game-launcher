import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Game } from "../../../lib/types";
import { CloudSavesPanel } from "./CloudSavesPanel";

vi.mock("../../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({
    isConfigured: false,
    session: null,
  }),
}));

describe("CloudSavesPanel provider fixture suggestions", () => {
  it("renders fixture-only provider save-root suggestions without live provider claims", () => {
    render(
      <CloudSavesPanel
        game={makeGame({
          id: "steam-akira",
          launcher: undefined,
          saveFiles: [],
        })}
      />,
    );

    const panel = screen.getByText("Provider Save Map: Local Review").closest("div");
    expect(panel).not.toBeNull();
    const suggestion = panel?.parentElement;
    expect(suggestion).not.toBeNull();

    expect(screen.getByText("Fixture Only")).toBeInTheDocument();
    expect(screen.getByText("Steam Save Root")).toBeInTheDocument();
    expect(screen.getByText(/steam_userdata_remote/i)).toBeInTheDocument();
    expect(screen.getByText("2 / ID 110011")).toBeInTheDocument();
    expect(
      screen.getByText(/Local provider save-root suggestion only; no provider API/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /track/i })).toBeDisabled();
    expect(
      within(suggestion as HTMLElement).queryByText(/provider verified/i),
    ).not.toBeInTheDocument();
    expect(
      within(suggestion as HTMLElement).queryByText(/cloud transfer ready/i),
    ).not.toBeInTheDocument();
    expect(
      within(suggestion as HTMLElement).queryByText(/migration complete/i),
    ).not.toBeInTheDocument();
  });
});

function makeGame(overrides: Partial<Game>): Game {
  return {
    description: "Fixture component game",
    id: "steam-akira",
    platform: "windows",
    status: "installed",
    title: "Akira's Revenge",
    version: "1.0.0",
    ...overrides,
  };
}
