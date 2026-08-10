import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import type { StoreProduct } from "../lib/types/store";
import { StorePage } from "./StorePage";

const storeMocks = vi.hoisted(() => ({
  addToStoreWishlist: vi.fn(),
  openExternalUrl: vi.fn(),
  listMyStoreWishlist: vi.fn(),
  listPublishedProductsPage: vi.fn(),
  removeFromStoreWishlist: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
}));

const apiMocks = vi.hoisted(() => ({
  filterSupportedPlatforms: (product: StoreProduct) => {
    const supported = new Set([
      "windows",
      "linux",
      "macos",
      "steam",
      "epic games",
      "gog",
      "xbox",
      "ubisoft",
      "ea",
      "battle.net",
    ]);
    const platforms = product.platforms.filter((value) => supported.has(value.toLowerCase()));
    return platforms.length > 0 ? { ...product, platforms } : null;
  },
  isKeyResellerName: (value: string) => value.toLowerCase().includes("g2a"),
}));

const catalogMocks = vi.hoisted(() => ({
  listStoreCatalogPage: vi.fn(),
}));

vi.mock("../lib/supabase/store", () => storeMocks);
vi.mock("../lib/store-api", () => apiMocks);
vi.mock("../lib/supabase/store-catalog", () => catalogMocks);
vi.mock("../lib/launcher/platform-auth", () => ({
  openExternalUrl: storeMocks.openExternalUrl,
}));
vi.mock("../hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ user: authMocks.user }),
}));

function makeProduct(overrides: Partial<StoreProduct> = {}): StoreProduct {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Platform Game",
    slug: "platform-game",
    description: "A hosted game.",
    shortDescription: "Action adventure",
    developerId: "developer-1",
    publisher: "OG Studio",
    releaseDate: "2026-01-01",
    genres: ["Action"],
    tags: ["Adventure"],
    platforms: ["windows", "playstation", "xbox"],
    priceCents: 1999,
    discountPercent: 0,
    coverImageUrl: "https://example.com/cover.jpg",
    trailerUrl: null,
    minSystemRequirements: {},
    recSystemRequirements: {},
    rating: 4.5,
    ratingsCount: 12,
    downloadsCount: 42,
    status: "published",
    metadata: { storeUrl: "steam://store/123" },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderStore() {
  return render(
    <MemoryRouter initialEntries={["/store"]}>
      <Routes>
        <Route element={<StorePage />} path="/store" />
      </Routes>
    </MemoryRouter>,
  );
}

describe("StorePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeMocks.listPublishedProductsPage.mockReset();
    catalogMocks.listStoreCatalogPage.mockReset();
    authMocks.user = { id: "user-1" };
    storeMocks.listPublishedProductsPage.mockResolvedValue([
      makeProduct(),
      makeProduct({
        id: "22222222-2222-4222-8222-222222222222",
        platforms: ["linux", "macos"],
        priceCents: 999,
        slug: "second-game",
        title: "Second Game",
      }),
    ]);
    catalogMocks.listStoreCatalogPage.mockResolvedValue([]);
    storeMocks.listMyStoreWishlist.mockResolvedValue([]);
    storeMocks.addToStoreWishlist.mockResolvedValue(undefined);
    storeMocks.removeFromStoreWishlist.mockResolvedValue(undefined);
    storeMocks.openExternalUrl.mockResolvedValue(undefined);
    vi.spyOn(window, "open").mockImplementation(() => null);
  });

  it("shows hosted games and only supported catalog platforms", async () => {
    renderStore();

    expect((await screen.findAllByText("Platform Game")).length).toBeGreaterThan(0);
    expect(screen.getByText("€19.99")).toBeInTheDocument();
    expect(screen.queryByText("Playstation")).not.toBeInTheDocument();
    expect(screen.getAllByText("Xbox").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Open platform store").length).toBeGreaterThan(0);
    expect(screen.queryByText("Warenkorb")).not.toBeInTheDocument();
  });

  it("hides games sold through key reseller pages", async () => {
    storeMocks.listPublishedProductsPage.mockResolvedValueOnce([
      makeProduct({
        metadata: { purchaseUrl: "https://www.g2a.com/example-key" },
        platforms: ["Steam"],
        title: "Key Shop Game",
      }),
    ]);
    renderStore();

    await waitFor(() => expect(screen.queryByText("Key Shop Game")).not.toBeInTheDocument());
  });

  it("hides games that have no supported platform", async () => {
    storeMocks.listPublishedProductsPage.mockResolvedValueOnce([
      makeProduct({ platforms: ["playstation", "nintendo"], title: "Unsupported Game" }),
    ]);
    renderStore();

    await waitFor(() => expect(screen.queryByText("Unsupported Game")).not.toBeInTheDocument());
  });

  it("adds API games instead of hiding them when hosted products exist", async () => {
    catalogMocks.listStoreCatalogPage.mockResolvedValueOnce([
      makeProduct({
        id: "33333333-3333-4333-8333-333333333333",
        metadata: { purchaseUrl: "https://store.example/api-game" },
        platforms: ["Steam"],
        slug: "api-game",
        title: "API Game",
      }),
    ]);
    renderStore();

    expect((await screen.findAllByText("API Game")).length).toBeGreaterThan(0);
  });

  it("loads the next catalog page only after pressing the bottom button", async () => {
    const firstPage = Array.from({ length: 40 }, (_, index) =>
      makeProduct({
        id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        slug: `page-one-${index}`,
        title: `Page One Game ${index}`,
      }),
    );
    const secondPage = [
      makeProduct({
        id: "99999999-9999-4999-8999-999999999999",
        slug: "page-two-game",
        title: "Page Two Game",
      }),
    ];
    storeMocks.listPublishedProductsPage
      .mockReset()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage);

    renderStore();
    expect((await screen.findAllByText("Page One Game 0")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Page Two Game")).not.toBeInTheDocument();
    expect(storeMocks.listPublishedProductsPage).toHaveBeenCalledWith(
      expect.objectContaining({ page: 0, pageSize: 40 }),
    );

    fireEvent.click(screen.getByRole("button", { name: /Next page/i }));
    expect((await screen.findAllByText("Page Two Game")).length).toBeGreaterThan(0);
    expect(storeMocks.listPublishedProductsPage).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 40 }),
    );
    storeMocks.listPublishedProductsPage.mockResolvedValue([
      makeProduct(),
      makeProduct({
        id: "22222222-2222-4222-8222-222222222222",
        platforms: ["linux", "macos"],
        priceCents: 999,
        slug: "second-game",
        title: "Second Game",
      }),
    ]);
  });

  it("filters games by a platform", async () => {
    renderStore();

    await screen.findAllByText("Platform Game");
    fireEvent.click(screen.getByRole("button", { name: "Linux" }));

    expect((await screen.findAllByText("Second Game")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Platform Game")).not.toBeInTheDocument();
  });

  it("opens the platform store directly", async () => {
    renderStore();

    await screen.findAllByText("Platform Game");
    fireEvent.click(screen.getByRole("button", { name: /Open store for Platform Game/ }));
    await waitFor(() =>
      expect(window.open).toHaveBeenCalledWith(
        "steam://store/123",
        "_blank",
        "noopener,noreferrer",
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      /official platform store was opened/i,
    );
  });

  it("opens the generated platform store link when metadata has no URL", async () => {
    storeMocks.listPublishedProductsPage.mockResolvedValueOnce([
      makeProduct({
        metadata: {},
        platforms: ["gog"],
        slug: "gog-adventure",
        title: "GOG Adventure",
      }),
    ]);
    renderStore();

    await screen.findAllByText("GOG Adventure");
    fireEvent.click(screen.getByRole("button", { name: /Open store for GOG Adventure/ }));

    await waitFor(() =>
      expect(window.open).toHaveBeenCalledWith(
        "https://www.gog.com/en/game/gog-adventure",
        "_blank",
        "noopener,noreferrer",
      ),
    );
  });

  it("opens the platform launcher without requiring an OG Store account", async () => {
    authMocks.user = null;
    renderStore();

    await screen.findAllByText("Platform Game");
    fireEvent.click(screen.getAllByRole("button", { name: /Open store for/ })[0]);

    await waitFor(() =>
      expect(window.open).toHaveBeenCalledWith(
        "steam://store/123",
        "_blank",
        "noopener,noreferrer",
      ),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
