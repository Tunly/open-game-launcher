import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Game } from "../../../lib/types";
import { CloudSavesPanel } from "./CloudSavesPanel";

vi.mock("../../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({
    isConfigured: false,
    session: null,
  }),
}));

describe("CloudSavesPanel platform-only notice", () => {
  it("directs users to platform cloud saves without first-party sync controls", () => {
    render(
      <CloudSavesPanel
        game={makeGame({
          id: "steam-akira",
          launcher: "steam",
          saveFiles: [],
        })}
      />,
    );

    expect(screen.getByRole("region", { name: /platform cloud saves/i })).toBeInTheDocument();
    expect(screen.getByText("Steam Cloud")).toBeInTheDocument();
    expect(screen.getByText(/use steam cloud for save sync/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /upload/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /restore/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sync mode/i })).not.toBeInTheDocument();
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
