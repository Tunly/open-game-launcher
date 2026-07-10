import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { StoreGame } from "../../lib/types";
import { StoreGameCard } from "./StoreGameCard";

function makeGame(overrides: Partial<StoreGame> = {}): StoreGame {
  return {
    coverImageUrl: "https://media.example.com/catalog-cover.jpg",
    description: "Description published with the hosted product.",
    id: "hosted-product",
    platform: ["windows"],
    price: 12.34,
    publisher: "Hosted Publisher",
    tagLine: "Hosted summary",
    title: "Hosted Product",
    ...overrides,
  };
}

const handlers = {
  onAddToCart: vi.fn(),
  onBuyNow: vi.fn(),
  onToggleWishlist: vi.fn(),
  onViewDetails: vi.fn(),
};

describe("StoreGameCard", () => {
  it("renders the hosted cover and publisher metadata", () => {
    const { container } = render(
      <StoreGameCard
        game={makeGame()}
        isAdded={false}
        isInCart={false}
        isProcessing={false}
        isWishlisted={false}
        {...handlers}
      />,
    );

    expect(screen.getByText("Hosted Publisher")).toBeInTheDocument();
    expect(
      container.querySelector('img[src="https://media.example.com/catalog-cover.jpg"]'),
    ).toBeInTheDocument();
  });

  it("shows a neutral missing-cover state instead of fictional product artwork", () => {
    render(
      <StoreGameCard
        game={makeGame({ coverImageUrl: undefined })}
        isAdded={false}
        isInCart={false}
        isProcessing={false}
        isWishlisted={false}
        {...handlers}
      />,
    );

    expect(screen.getByText("No cover published")).toBeInTheDocument();
  });
});
