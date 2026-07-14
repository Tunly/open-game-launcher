import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { HomePage } from "./HomePage";

describe("HomePage", () => {
  it("renders navigation without fabricated live runtime claims", () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Play Desk" })).toBeInTheDocument();
    expect(screen.getByText(/shows no synthetic telemetry/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Library/i })).toHaveAttribute("href", "/library");
    expect(screen.getByRole("link", { name: /Performance Runtime History/i })).toHaveAttribute(
      "href",
      "/settings/performance",
    );
    expect(screen.queryByRole("link", { name: /Mods/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/mod deck/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Owner locked")).not.toBeInTheDocument();
    expect(screen.queryByText("Steam client detected")).not.toBeInTheDocument();
    expect(screen.queryByText("2h uptime")).not.toBeInTheDocument();
  });
});
