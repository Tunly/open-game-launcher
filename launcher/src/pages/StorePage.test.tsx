import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import type { StoreProduct } from "../lib/types/store";
import { StorePage } from "./StorePage";

const storeMocks = vi.hoisted(() => ({
  addToStoreWishlist: vi.fn(),
  openExternalUrl: vi.fn(),
  listMyStoreWishlist: vi.fn(),
  removeFromStoreWishlist: vi.fn(),
  listStoreProductReviews: vi.fn(),
  getMyStoreReview: vi.fn(),
  upsertStoreReview: vi.fn(),
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
  queryCatalogPage: vi.fn(),
}));

const launcherMocks = vi.hoisted(() => ({
  listInstalledGames: vi.fn(),
  launchGame: vi.fn(),
}));

vi.mock("../lib/supabase/store", () => storeMocks);
vi.mock("../lib/store-api", () => apiMocks);
vi.mock("../lib/supabase/catalog-query", () => ({
  queryCatalogPage: catalogMocks.queryCatalogPage,
}));
vi.mock("../lib/launcher", () => ({
  listInstalledGames: () => launcherMocks.listInstalledGames(),
  launchGame: (id: string) => launcherMocks.launchGame(id),
}));
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
    catalogMocks.queryCatalogPage.mockReset();
    launcherMocks.listInstalledGames.mockReset();
    launcherMocks.listInstalledGames.mockResolvedValue([]);
    authMocks.user = { id: "user-1" };
    catalogMocks.queryCatalogPage.mockResolvedValue({
      products: [
        makeProduct(),
        makeProduct({
          id: "22222222-2222-4222-8222-222222222222",
          platforms: ["linux", "macos"],
          priceCents: 999,
          slug: "second-game",
          title: "Second Game",
        }),
      ],
      hasMore: false,
      bothFailed: false,
      hostedCount: 2,
      catalogCount: 0,
    });
    storeMocks.listMyStoreWishlist.mockResolvedValue([]);
    storeMocks.addToStoreWishlist.mockResolvedValue(undefined);
    storeMocks.removeFromStoreWishlist.mockResolvedValue(undefined);
    storeMocks.listStoreProductReviews.mockResolvedValue([]);
    storeMocks.getMyStoreReview.mockResolvedValue(null);
    storeMocks.upsertStoreReview.mockResolvedValue(null);
    storeMocks.openExternalUrl.mockResolvedValue(undefined);
    vi.spyOn(window, "open").mockImplementation(() => null);
  });

  it("shows hosted games and only supported catalog platforms", async () => {
    renderStore();

    expect((await screen.findAllByText("Platform Game")).length).toBeGreaterThan(0);
    expect(screen.getByText("€19.99")).toBeInTheDocument();
    expect(screen.queryByText("Playstation")).not.toBeInTheDocument();
    expect(screen.getAllByText("Xbox").length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: /Open store for Platform Game/i }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Warenkorb")).not.toBeInTheDocument();
  });

  it("hides games sold through key reseller pages", async () => {
    catalogMocks.queryCatalogPage.mockResolvedValueOnce({
      products: [],
      hasMore: false,
      bothFailed: false,
      hostedCount: 1,
      catalogCount: 0,
    });
    renderStore();

    // The visibility filtering (key-reseller + unsupported platforms) lives
    // in queryCatalogPage, so a filtered listing never reaches the page.
    expect(screen.queryByText("Key Shop Game")).not.toBeInTheDocument();
  });

  it("hides games that have no supported platform", async () => {
    catalogMocks.queryCatalogPage.mockResolvedValueOnce({
      products: [],
      hasMore: false,
      bothFailed: false,
      hostedCount: 1,
      catalogCount: 0,
    });
    renderStore();

    expect(screen.queryByText("Unsupported Game")).not.toBeInTheDocument();
  });

  it("adds API games instead of hiding them when hosted products exist", async () => {
    catalogMocks.queryCatalogPage.mockResolvedValueOnce({
      products: [
        makeProduct({
          id: "33333333-3333-4333-8333-333333333333",
          metadata: { purchaseUrl: "https://store.example/api-game" },
          platforms: ["Steam"],
          slug: "api-game",
          title: "API Game",
        }),
      ],
      hasMore: false,
      bothFailed: false,
      hostedCount: 1,
      catalogCount: 1,
    });
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
    catalogMocks.queryCatalogPage
      .mockReset()
      .mockResolvedValueOnce({
        products: firstPage,
        hasMore: true,
        bothFailed: false,
        hostedCount: 40,
        catalogCount: 0,
      })
      .mockResolvedValueOnce({
        products: secondPage,
        hasMore: false,
        bothFailed: false,
        hostedCount: 1,
        catalogCount: 0,
      });

    renderStore();
    expect((await screen.findAllByText("Page One Game 0")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Page Two Game")).not.toBeInTheDocument();
    expect(catalogMocks.queryCatalogPage).toHaveBeenCalledWith(
      expect.objectContaining({ page: 0, pageSize: 40 }),
      expect.any(Set),
    );

    fireEvent.click(screen.getByRole("button", { name: /Next page/i }));
    expect((await screen.findAllByText("Page Two Game")).length).toBeGreaterThan(0);
    expect(catalogMocks.queryCatalogPage).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 40 }),
      expect.any(Set),
    );
  });

  it("filters games by a platform", async () => {
    renderStore();

    await screen.findAllByText("Platform Game");
    fireEvent.click(screen.getByRole("button", { name: "Linux" }));

    expect((await screen.findAllByText("Second Game")).length).toBeGreaterThan(0);
    expect(
      within(screen.getByRole("region", { name: "Product browser" })).queryByText("Platform Game"),
    ).not.toBeInTheDocument();
  });

  it("filters the Top Sellers category instead of showing every game", async () => {
    const products = Array.from({ length: 13 }, (_, index) =>
      makeProduct({
        downloadsCount: 1_000 - index,
        id: `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        title: `Category Game ${index}`,
      }),
    );
    catalogMocks.queryCatalogPage.mockResolvedValueOnce({
      products,
      hasMore: false,
      bothFailed: false,
      hostedCount: products.length,
      catalogCount: 0,
    });

    renderStore();
    expect(await screen.findByText("Category Game 12")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Top Sellers$/ }));

    const browser = screen.getByRole("region", { name: "Product browser" });
    expect(within(browser).getByText("Category Game 0")).toBeInTheDocument();
    expect(within(browser).queryByText("Category Game 12")).not.toBeInTheDocument();
  });

  it("starts a fresh catalog deduplication set when the query changes", async () => {
    const seenSets: Set<string>[] = [];
    catalogMocks.queryCatalogPage.mockImplementation(
      async (query: { platform?: string }, seenIds: Set<string>) => {
        seenSets.push(seenIds);
        seenIds.add(query.platform ?? "all");
        return {
          products: [makeProduct({ platforms: ["windows", "linux"] })],
          hasMore: false,
          bothFailed: false,
          hostedCount: 1,
          catalogCount: 0,
        };
      },
    );

    renderStore();
    await screen.findAllByText("Platform Game");
    fireEvent.click(screen.getByRole("button", { name: "Linux" }));

    await waitFor(() => expect(seenSets).toHaveLength(2));
    expect(seenSets[1]).not.toBe(seenSets[0]);
    expect([...seenSets[0]]).toEqual(["all"]);
    expect([...seenSets[1]]).toEqual(["linux"]);
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
    catalogMocks.queryCatalogPage.mockResolvedValueOnce({
      products: [
        makeProduct({
          metadata: {},
          platforms: ["gog"],
          slug: "gog-adventure",
          title: "GOG Adventure",
        }),
      ],
      hasMore: false,
      bothFailed: false,
      hostedCount: 1,
      catalogCount: 0,
    });
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

  it("filters games by wishlist in the sidebar", async () => {
    storeMocks.listMyStoreWishlist.mockResolvedValueOnce([
      { productId: "22222222-2222-4222-8222-222222222222" },
    ]);
    renderStore();

    await screen.findAllByText("Platform Game");
    fireEvent.click(screen.getByRole("button", { name: "Filter by wishlist" }));

    expect(await screen.findByText("Your Wishlist")).toBeInTheDocument();
    expect((await screen.findAllByText("Second Game")).length).toBeGreaterThan(0);
    expect(
      within(screen.getByRole("region", { name: "Product browser" })).queryByText("Platform Game"),
    ).not.toBeInTheDocument();
  });

  it("displays owned badge when a game is in the installed library", async () => {
    launcherMocks.listInstalledGames.mockResolvedValueOnce([
      { id: "11111111-1111-4111-8111-111111111111", title: "Platform Game", status: "installed" },
    ]);
    renderStore();

    expect((await screen.findAllByText("Owned")).length).toBeGreaterThan(0);
  });

  it("filters games by price range", async () => {
    renderStore();

    await screen.findAllByText("Platform Game");
    fireEvent.click(screen.getByRole("button", { name: "Under 10 €" }));

    expect((await screen.findAllByText("Second Game")).length).toBeGreaterThan(0);
    expect(
      within(screen.getByRole("region", { name: "Product browser" })).queryByText("Platform Game"),
    ).not.toBeInTheDocument();
  });

  it("shows a Spielen button when an installed game is in the library", async () => {
    launcherMocks.listInstalledGames.mockResolvedValueOnce([
      { id: "11111111-1111-4111-8111-111111111111", title: "Platform Game", status: "installed" },
    ]);
    renderStore();

    expect((await screen.findAllByRole("button", { name: /Spielen/i })).length).toBeGreaterThan(0);
  });

  it("launches an installed game from the detail overlay", async () => {
    launcherMocks.launchGame.mockResolvedValueOnce({ status: "launched" } as never);
    launcherMocks.listInstalledGames.mockResolvedValueOnce([
      { id: "11111111-1111-4111-8111-111111111111", title: "Platform Game", status: "installed" },
    ]);
    renderStore();

    await screen.findAllByText("Platform Game");
    fireEvent.click(screen.getByRole("button", { name: "More Info" }));

    const dialog = await screen.findByRole("dialog", { name: "Platform Game details" });
    fireEvent.click(within(dialog).getByRole("button", { name: /Spielen/i }));

    await waitFor(() =>
      expect(launcherMocks.launchGame).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111"),
    );
  });

  it("shows an In Bibliothek button for an owned but not installed game", async () => {
    launcherMocks.listInstalledGames.mockResolvedValueOnce([
      {
        id: "11111111-1111-4111-8111-111111111111",
        title: "Platform Game",
        status: "not_installed",
      },
    ]);
    renderStore();

    await screen.findAllByText("Platform Game");
    fireEvent.click(screen.getByRole("button", { name: "More Info" }));

    const dialog = await screen.findByRole("dialog", { name: "Platform Game details" });
    expect(within(dialog).getByRole("button", { name: /In Bibliothek/i })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Spielen/i })).not.toBeInTheDocument();
  });

  it("renders screenshots, multi-store links, and system requirements in the detail overlay", async () => {
    catalogMocks.queryCatalogPage.mockResolvedValueOnce({
      products: [
        makeProduct({
          id: "rich-game-id",
          title: "Rich Cyber Game",
          minSystemRequirements: { OS: "Windows 11", Memory: "16 GB" },
          recSystemRequirements: { OS: "Windows 11", Graphics: "RTX 4080" },
          metadata: {
            screenshots: ["https://example.com/shot1.jpg", "https://example.com/shot2.jpg"],
            platformUrls: {
              Steam: "https://store.steampowered.com/app/999",
              GOG: "https://www.gog.com/game/rich_cyber_game",
            },
          },
        }),
      ],
      hasMore: false,
      bothFailed: false,
      hostedCount: 1,
      catalogCount: 0,
    });
    renderStore();

    expect((await screen.findAllByText("Rich Cyber Game")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "More Info" }));

    const dialog = await screen.findByRole("dialog", { name: "Rich Cyber Game details" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("System Requirements")).toBeInTheDocument();
    expect(within(dialog).getByText("Minimum Requirements")).toBeInTheDocument();
    expect(within(dialog).getByText("16 GB")).toBeInTheDocument();
    expect(within(dialog).getByText("Recommended Requirements")).toBeInTheDocument();
    expect(within(dialog).getByText("RTX 4080")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /Steam/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /GOG/i })).toBeInTheDocument();
  });
});
