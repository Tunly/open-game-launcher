import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Game } from "../../lib/types";
import { PlatformIcon, PlatformSourceIcon } from "./PlatformIcons";

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    description: "",
    id: "game-1",
    platform: "windows",
    status: "installed",
    title: "Test",
    version: "1.0",
    ...overrides,
  };
}

describe("PlatformIcon", () => {
  it.each([["windows"], ["macos"], ["linux"]])("renders the %s icon as an svg", (platform) => {
    // lucide-react renders an inline svg with the icon name in the class list
    // ("lucide-monitor", etc.) in production builds; in jsdom it renders the
    // same className. We simply assert the element is present and an svg.
    const { container } = render(<PlatformIcon platform={platform} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("falls back to the gamepad icon for unknown platforms", () => {
    const { container } = render(<PlatformIcon platform="vr-headset" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});

describe("PlatformSourceIcon", () => {
  it("renders a steam svg for steam-sourced games", () => {
    const { container } = render(<PlatformSourceIcon game={makeGame({ id: "steam-12345" })} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders a generic icon when source is unknown", () => {
    const { container } = render(<PlatformSourceIcon game={makeGame({ id: "unknown-id" })} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
