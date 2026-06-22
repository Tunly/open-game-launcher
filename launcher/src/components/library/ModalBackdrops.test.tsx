import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Game } from "../../lib/types";
import { AddGameDialog } from "./AddGameDialog";
import { ArtworkPreviewModal } from "./ArtworkPreviewModal";
import { ProviderPickerDialog } from "./ProviderPickerDialog";

vi.mock("../../lib/image-compress", () => ({
  compressAndReadImage: vi.fn().mockResolvedValue("data:image/png;base64,preview"),
  isAllowedImageType: vi.fn().mockReturnValue(true),
}));

const modalBackdropClasses = ["bg-[#171411]/90", "bg-[length:10px_10px]"];

function expectRetroModalBackdrop(element: HTMLElement | null) {
  expect(element).toBeTruthy();
  for (const className of modalBackdropClasses) {
    expect(element?.className).toContain(className);
  }
  expect(element?.className).toContain("radial-gradient");
  expect(element?.className).not.toContain("bg-black/45");
  expect(element?.className).not.toContain("bg-black/50");
  expect(element?.className).not.toContain("backdrop-blur");
}

function makeGame(overrides: Partial<Game>): Game {
  return {
    description: "Provider picker fixture",
    id: "steam-fixture",
    platform: "windows",
    status: "installed",
    title: "Provider Picker Fixture",
    version: "1.0.0",
    ...overrides,
  };
}

describe("library modal backdrops", () => {
  it("uses the Retro Manga halftone overlay for AddGameDialog", () => {
    render(<AddGameDialog isOpen onAddGame={vi.fn()} onClose={vi.fn()} />);

    expectRetroModalBackdrop(screen.getByText("Add a Game").closest(".fixed"));
  });

  it("uses the Retro Manga halftone overlay for ArtworkPreviewModal", () => {
    render(
      <ArtworkPreviewModal
        file={new File(["fake"], "cover.png", { type: "image/png" })}
        initialKind="cover"
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expectRetroModalBackdrop(screen.getByText("Custom Artwork").closest(".fixed"));
  });

  it("uses the Retro Manga halftone overlay for ProviderPickerDialog", () => {
    render(
      <ProviderPickerDialog
        state={{
          mode: "play",
          title: "Provider Choice",
          variants: [
            makeGame({ id: "steam-fixture", launcher: "steam" }),
            makeGame({ id: "gog-fixture", launcher: "gog" }),
          ],
        }}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expectRetroModalBackdrop(screen.getByText("Provider Choice").closest(".fixed"));
  });
});
