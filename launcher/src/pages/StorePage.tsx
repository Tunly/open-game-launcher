import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, Heart, Play, ReceiptText, ShoppingCart, Tags, Trash2 } from "lucide-react";

import { StoreGameCard } from "../components/launcher/StoreGameCard";
import { storeGames } from "../lib/mock-data";
import { STORAGE_KEYS } from "../lib/storage-keys";

type StoreTab = "browse" | "wishlist" | "cart" | "orders";

interface StoreOrder {
  id: string;
  gameIds: string[];
  total: number;
  createdAt: string;
}

const ownedKey = STORAGE_KEYS.STORE_OWNED;
const wishlistKey = STORAGE_KEYS.STORE_WISHLIST;
const cartKey = STORAGE_KEYS.STORE_CART;
const priceAlertsKey = STORAGE_KEYS.STORE_PRICE_ALERTS;
const ordersKey = STORAGE_KEYS.STORE_ORDERS;

function readStringArray(key: string) {
  try {
    const value = localStorage.getItem(key);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function readPriceAlerts() {
  try {
    const value = localStorage.getItem(priceAlertsKey);
    const parsed = value ? JSON.parse(value) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, number>)
      : {};
  } catch {
    return {};
  }
}

function readOrders() {
  try {
    const value = localStorage.getItem(ordersKey);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? (parsed as StoreOrder[]) : [];
  } catch {
    return [];
  }
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "EUR",
    style: "currency",
  }).format(value);
}

export function StorePage() {
  const [activeTab, setActiveTab] = useState<StoreTab>("browse");
  const [ownedIds, setOwnedIds] = useState<Set<string>>(() => new Set(readStringArray(ownedKey)));
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(
    () => new Set(readStringArray(wishlistKey)),
  );
  const [cartIds, setCartIds] = useState<Set<string>>(() => new Set(readStringArray(cartKey)));
  const [priceAlerts, setPriceAlerts] = useState<Record<string, number>>(readPriceAlerts);
  const [orders, setOrders] = useState<StoreOrder[]>(readOrders);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState(storeGames[0]?.id ?? null);
  const [searchParams, setSearchParams] = useSearchParams();

  const wishlistGames = useMemo(
    () => storeGames.filter((game) => wishlistIds.has(game.id)),
    [wishlistIds],
  );
  const cartGames = useMemo(
    () => storeGames.filter((game) => cartIds.has(game.id) && !ownedIds.has(game.id)),
    [cartIds, ownedIds],
  );
  const cartTotal = cartGames.reduce((total, game) => total + game.price, 0);
  const activeGames = activeTab === "wishlist" ? wishlistGames : storeGames;
  const activePriceAlertHits = storeGames.filter((game) => {
    const alertPrice = priceAlerts[game.id];
    return typeof alertPrice === "number" && game.price <= alertPrice;
  });
  const selectedProduct =
    storeGames.find((game) => game.id === selectedProductId) ?? storeGames[0] ?? null;

  useEffect(() => {
    localStorage.setItem(ownedKey, JSON.stringify([...ownedIds]));
  }, [ownedIds]);

  useEffect(() => {
    localStorage.setItem(wishlistKey, JSON.stringify([...wishlistIds]));
  }, [wishlistIds]);

  useEffect(() => {
    localStorage.setItem(cartKey, JSON.stringify([...cartIds]));
  }, [cartIds]);

  useEffect(() => {
    localStorage.setItem(priceAlertsKey, JSON.stringify(priceAlerts));
  }, [priceAlerts]);

  useEffect(() => {
    localStorage.setItem(ordersKey, JSON.stringify(orders));
  }, [orders]);

  // Deep-link `?slug=...&install=1` from a universallauncher://open or
  // universallauncher://install URL. Selects the matching store product and, if
  // `install=1` is set, surfaces a prompt so the user can install it immediately.
  // The store is mock-data only, so unknown slugs are reported via statusMessage.
  useEffect(() => {
    const slug = searchParams.get("slug");
    if (!slug) return;

    const wantsInstall = searchParams.get("install") === "1";
    const wanted = slug.toLowerCase();
    const match = storeGames.find(
      (game) => game.id.toLowerCase() === wanted || game.title.toLowerCase() === wanted,
    );

    if (!match) {
      setStatusMessage(
        `Store link "${slug}" did not match a known product. Browse the store manually.`,
      );
      const next = new URLSearchParams(searchParams);
      next.delete("slug");
      next.delete("install");
      setSearchParams(next, { replace: true });
      return;
    }

    setSelectedProductId(match.id);
    setStatusMessage(
      wantsInstall
        ? `Opening ${match.title}. Click "Install" to add it to your library.`
        : `Opened ${match.title} from a shared link.`,
    );

    const next = new URLSearchParams(searchParams);
    next.delete("slug");
    next.delete("install");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, setStatusMessage]);

  function toggleWishlist(gameId: string) {
    setWishlistIds((current) => {
      const next = new Set(current);
      if (next.has(gameId)) {
        next.delete(gameId);
        setStatusMessage("Removed from wishlist.");
      } else {
        next.add(gameId);
        setStatusMessage("Added to wishlist.");
      }
      return next;
    });
  }

  function addToCart(gameId: string) {
    if (ownedIds.has(gameId)) {
      setStatusMessage("This game is already owned.");
      return;
    }

    setCartIds((current) => new Set(current).add(gameId));
    setStatusMessage("Added to cart.");
  }

  function buyNow(gameId: string) {
    if (ownedIds.has(gameId)) {
      setStatusMessage("This game is already in your library.");
      return;
    }

    completeCheckout([gameId]);
  }

  function completeCheckout(gameIds = cartGames.map((game) => game.id)) {
    const purchasableIds = gameIds.filter((gameId) => !ownedIds.has(gameId));
    if (purchasableIds.length === 0) {
      setStatusMessage("Your cart is empty.");
      return;
    }

    const total = storeGames
      .filter((game) => purchasableIds.includes(game.id))
      .reduce((sum, game) => sum + game.price, 0);
    const order: StoreOrder = {
      createdAt: new Date().toISOString(),
      gameIds: purchasableIds,
      id: crypto.randomUUID(),
      total,
    };

    setOrders((current) => [order, ...current]);
    setOwnedIds((current) => new Set([...current, ...purchasableIds]));
    setCartIds((current) => {
      const next = new Set(current);
      purchasableIds.forEach((gameId) => next.delete(gameId));
      return next;
    });
    setWishlistIds((current) => {
      const next = new Set(current);
      purchasableIds.forEach((gameId) => next.delete(gameId));
      return next;
    });
    setStatusMessage("Order complete. Games were added to your library.");
    setActiveTab("orders");
  }

  function setPriceAlert(gameId: string, value: number | null) {
    setPriceAlerts((current) => {
      const next = { ...current };
      if (value === null) {
        delete next[gameId];
        setStatusMessage("Price alert cleared.");
      } else {
        next[gameId] = value;
        setStatusMessage("Price alert saved.");
      }
      return next;
    });
  }

  return (
    <div className="relative min-h-[600px]">
      {/* Centered Coming Soon Overlay */}
      <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
        <div className="max-w-md rotate-[-3deg] border-[6px] border-black bg-[#f2c14e] p-8 text-center shadow-[12px_12px_0_#171411] transition duration-300 hover:rotate-[0deg] hover:scale-105 md:p-12">
          <h2 className="neo-title text-5xl uppercase leading-none tracking-tight text-[#171411] md:text-7xl">
            Coming
          </h2>
          <h2 className="neo-title mt-1 text-5xl uppercase leading-none tracking-tight text-[#171411] md:text-7xl">
            Soon
          </h2>
          <p className="neo-copy mt-5 border-t-2 border-black pt-4 text-[11px] font-black uppercase tracking-[0.2em] text-[#171411]">
            Official Game Store slice
          </p>
        </div>
      </div>

      {/* Blurred Store Content */}
      <div className="pointer-events-none select-none opacity-75 blur-[6px]">
        <section className="space-y-7">
          <div className="hero-art relative min-h-[420px] overflow-hidden border-4 border-black shadow-[5px_5px_0_#171411] sm:min-h-[340px] sm:shadow-[6px_6px_0_#171411]">
            <div className="absolute inset-x-0 top-0 h-24 bg-black/35" />
            <div className="bg-black/62 relative m-4 flex min-h-[330px] items-center border-l-4 border-[#c20b2f] p-5 sm:m-6 sm:min-h-[280px] sm:p-9">
              <div className="max-w-[590px]">
                <div className="neo-copy flex flex-wrap gap-2 text-[11px] font-bold uppercase">
                  <span className="border-2 border-[#c20b2f] px-3 py-1 text-[#c20b2f]">
                    New Release
                  </span>
                  <span className="border-2 border-[#087d6d] px-3 py-1 text-[#087d6d]">Action</span>
                </div>
                <h1 className="neo-title mt-4 text-[clamp(3.25rem,16vw,4.5rem)] leading-none text-[#fffaf0]">
                  Neo-Strike
                </h1>
                <p className="mt-4 max-w-[560px] text-base leading-7 text-[#fffaf0] sm:text-lg">
                  The ultimate cyber brawler. Fight through the neon canyons of Neo-Berlin. Survive
                  the night. Break the system.
                </p>
                <div className="mt-8 grid gap-3 sm:flex sm:flex-wrap sm:items-center sm:gap-5">
                  <button
                    className="neo-copy flex h-12 items-center justify-center gap-3 border-2 border-black bg-[#c20b2f] px-5 text-xs font-bold uppercase text-[#fffaf0] shadow-[4px_4px_0_#171411] sm:px-7"
                    type="button"
                    onClick={() =>
                      setStatusMessage(
                        "Neo-Strike checkout opens when the first-party store backend is connected.",
                      )
                    }
                  >
                    <Play className="h-4 w-4 fill-current" />
                    Buy Now - 49.99 EUR
                  </button>
                  <button
                    className="neo-copy h-12 border-2 border-[#fffaf0] bg-black/35 px-5 text-xs font-bold uppercase text-[#fffaf0]"
                    type="button"
                    onClick={() =>
                      setStatusMessage("Trailer playback is queued for the media feature slice.")
                    }
                  >
                    Watch Trailer
                  </button>
                </div>
              </div>
            </div>
          </div>

          {statusMessage ? (
            <div className="neo-copy border-[3px] border-black bg-[#8cf5e4] p-3 text-[11px] font-black uppercase tracking-[0.12em] text-[#171411] shadow-[4px_4px_0_#171411]">
              {statusMessage}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-4">
            <StoreMetric
              icon={<Tags className="h-4 w-4" />}
              label="Deals"
              value={storeGames.filter((game) => game.discountPercent).length}
            />
            <StoreMetric
              icon={<Heart className="h-4 w-4" />}
              label="Wishlist"
              value={wishlistIds.size}
            />
            <StoreMetric
              icon={<ShoppingCart className="h-4 w-4" />}
              label="Cart"
              value={cartGames.length}
            />
            <StoreMetric
              icon={<ReceiptText className="h-4 w-4" />}
              label="Orders"
              value={orders.length}
            />
          </div>

          {activePriceAlertHits.length > 0 ? (
            <div className="border-4 border-black bg-[#f2c14e] p-4 shadow-[5px_5px_0_#171411]">
              <h2 className="neo-title text-3xl leading-none text-[#171411]">Price Alerts</h2>
              <p className="neo-copy mt-2 text-[11px] font-black uppercase leading-5 text-[#171411]">
                {activePriceAlertHits.map((game) => game.title).join(", ")} reached your target
                price.
              </p>
            </div>
          ) : null}

          {selectedProduct ? (
            <ProductDetailPanel
              game={selectedProduct}
              isOwned={ownedIds.has(selectedProduct.id)}
              isWishlisted={wishlistIds.has(selectedProduct.id)}
              onAddToCart={addToCart}
              onBuyNow={buyNow}
              onToggleWishlist={toggleWishlist}
            />
          ) : null}

          <div>
            <div className="mb-6 flex flex-col gap-3 border-b-4 border-black pb-3 lg:flex-row lg:items-end lg:justify-between">
              <h2 className="neo-title bg-black px-4 pb-1 text-[clamp(2.6rem,12vw,3rem)] leading-none text-[#fffaf0]">
                Store Desk
              </h2>
              <div className="neo-copy grid grid-cols-2 gap-2 text-[11px] font-bold uppercase sm:flex">
                {(["browse", "wishlist", "cart", "orders"] as const).map((tab) => (
                  <button
                    key={tab}
                    className={`border-2 border-black px-4 py-2 ${
                      activeTab === tab
                        ? "bg-[#171411] text-[#fff9ed]"
                        : "bg-[#fff9ed] text-[#171411]"
                    }`}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {activeTab === "cart" ? (
              <CartPanel
                cartGames={cartGames}
                total={cartTotal}
                onCheckout={() => completeCheckout()}
                onRemove={(gameId) => {
                  setCartIds((current) => {
                    const next = new Set(current);
                    next.delete(gameId);
                    return next;
                  });
                }}
              />
            ) : activeTab === "orders" ? (
              <OrderPanel orders={orders} />
            ) : activeGames.length > 0 ? (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {activeGames.map((game) => (
                  <StoreGameCard
                    key={game.id}
                    game={game}
                    isAdded={ownedIds.has(game.id)}
                    isInCart={cartIds.has(game.id)}
                    isWishlisted={wishlistIds.has(game.id)}
                    priceAlert={priceAlerts[game.id] ?? null}
                    onAddToCart={addToCart}
                    onBuyNow={buyNow}
                    onSetPriceAlert={setPriceAlert}
                    onToggleWishlist={toggleWishlist}
                    onViewDetails={setSelectedProductId}
                  />
                ))}
              </div>
            ) : (
              <EmptyStorePanel label="No wishlist games yet." />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function StoreMetric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="border-[3px] border-black bg-[#fff9ed] p-4 shadow-[4px_4px_0_#171411]">
      <div className="neo-copy flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
        {icon}
        {label}
      </div>
      <p className="neo-title mt-2 text-3xl leading-none text-[#171411]">{value}</p>
    </div>
  );
}

function ProductDetailPanel({
  game,
  isOwned,
  isWishlisted,
  onAddToCart,
  onBuyNow,
  onToggleWishlist,
}: {
  game: (typeof storeGames)[number];
  isOwned: boolean;
  isWishlisted: boolean;
  onAddToCart: (gameId: string) => void;
  onBuyNow: (gameId: string) => void;
  onToggleWishlist: (gameId: string) => void;
}) {
  return (
    <section className="grid overflow-hidden border-4 border-black bg-[#fff9ed] shadow-[6px_6px_0_#171411] lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-h-72 border-b-4 border-black bg-[repeating-linear-gradient(112deg,#171411_0_14px,#302c25_14px_28px,#b7102a_28px_32px,#007166_32px_36px)] p-5 lg:border-b-0 lg:border-r-4">
        <div className="flex h-full min-h-64 items-end border-4 border-black bg-black/45 p-5 shadow-[5px_5px_0_#171411]">
          <div>
            <p className="neo-copy inline-flex border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#171411]">
              Product Page
            </p>
            <h2 className="neo-title mt-3 text-[clamp(3rem,10vw,5rem)] leading-none text-[#fff9ed]">
              {game.title}
            </h2>
          </div>
        </div>
      </div>
      <aside className="p-5">
        <div className="border-b-[3px] border-black pb-4">
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
            {game.developer ?? "Independent Developer"}
          </p>
          <p className="mt-3 text-sm font-bold leading-6 text-[#5b403f]">
            {game.tagLine}. Built for players who want quick installs, launcher-native ownership,
            wishlist tracking, and clean library handoff after purchase.
          </p>
        </div>
        <div className="my-4 grid gap-2 text-[11px] font-black uppercase tracking-[0.08em]">
          <ProductFact label="Release" value={game.releaseDate ?? "TBA"} />
          <ProductFact label="Platforms" value={game.platform.join(", ")} />
          <ProductFact label="Genres" value={(game.genres ?? [game.tagLine]).join(", ")} />
          <ProductFact label="Price" value={formatCurrency(game.price)} />
        </div>
        <div className="grid gap-2">
          <button
            className="neo-copy h-11 border-2 border-black bg-[#b7102a] text-[11px] font-black uppercase tracking-[0.12em] text-white shadow-[3px_3px_0_#171411] disabled:opacity-50"
            disabled={isOwned}
            type="button"
            onClick={() => onBuyNow(game.id)}
          >
            {isOwned ? "Owned" : game.isFree ? "Claim" : "Buy Now"}
          </button>
          <button
            className="neo-copy h-11 border-2 border-black bg-[#007166] text-[11px] font-black uppercase tracking-[0.12em] text-white shadow-[3px_3px_0_#171411] disabled:opacity-50"
            disabled={isOwned}
            type="button"
            onClick={() => onAddToCart(game.id)}
          >
            Add To Cart
          </button>
          <button
            className={`neo-copy h-11 border-2 border-black text-[11px] font-black uppercase tracking-[0.12em] shadow-[3px_3px_0_#171411] ${
              isWishlisted ? "bg-[#f2c14e] text-[#171411]" : "bg-[#fff9ed] text-[#171411]"
            }`}
            type="button"
            onClick={() => onToggleWishlist(game.id)}
          >
            {isWishlisted ? "Wishlisted" : "Add To Wishlist"}
          </button>
        </div>
      </aside>
    </section>
  );
}

function ProductFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-2 border-black bg-[#f6edd8] px-3 py-2 shadow-[2px_2px_0_#171411]">
      <span className="text-[#655f58]">{label}</span>
      <span className="text-right text-[#171411]">{value}</span>
    </div>
  );
}

function CartPanel({
  cartGames,
  onCheckout,
  onRemove,
  total,
}: {
  cartGames: typeof storeGames;
  onCheckout: () => void;
  onRemove: (gameId: string) => void;
  total: number;
}) {
  if (cartGames.length === 0) {
    return <EmptyStorePanel label="Cart is empty." />;
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-3">
        {cartGames.map((game) => (
          <div
            key={game.id}
            className="flex items-center justify-between gap-4 border-[3px] border-black bg-[#f5eedf] p-4 shadow-[3px_3px_0_#171411]"
          >
            <div>
              <p className="neo-title text-2xl leading-none text-[#171411]">{game.title}</p>
              <p className="neo-copy mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#655f58]">
                {game.tagLine}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xl font-black text-[#171411]">
                {formatCurrency(game.price)}
              </span>
              <button
                aria-label={`Remove ${game.title} from cart`}
                className="flex h-9 w-9 items-center justify-center border-2 border-black bg-[#b7102a] text-white shadow-[2px_2px_0_#171411]"
                type="button"
                onClick={() => onRemove(game.id)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <aside className="border-4 border-black bg-[#fff9ed] p-5 shadow-[5px_5px_0_#171411]">
        <h3 className="neo-title border-b-[3px] border-black pb-3 text-3xl leading-none text-[#171411]">
          Checkout
        </h3>
        <p className="neo-copy mt-4 text-[10px] font-black uppercase tracking-[0.12em] text-[#655f58]">
          Local order simulation until Stripe/PayPal Edge Functions are connected.
        </p>
        <div className="my-4 flex justify-between border-y-2 border-black py-3 text-xl font-black">
          <span>Total</span>
          <span>{formatCurrency(total)}</span>
        </div>
        <button
          className="neo-copy h-12 w-full border-2 border-black bg-[#b7102a] text-[11px] font-black uppercase tracking-[0.12em] text-white shadow-[3px_3px_0_#171411]"
          type="button"
          onClick={onCheckout}
        >
          Complete Order
        </button>
      </aside>
    </div>
  );
}

function OrderPanel({ orders }: { orders: StoreOrder[] }) {
  if (orders.length === 0) {
    return <EmptyStorePanel label="No orders yet." />;
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <article
          key={order.id}
          className="border-[3px] border-black bg-[#f5eedf] p-4 shadow-[3px_3px_0_#171411]"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="neo-title text-2xl leading-none text-[#171411]">
                Order {order.id.slice(0, 8)}
              </p>
              <p className="neo-copy mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#655f58]">
                {new Date(order.createdAt).toLocaleString()}
              </p>
            </div>
            <p className="text-2xl font-black text-[#171411]">{formatCurrency(order.total)}</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {order.gameIds.map((gameId) => {
              const game = storeGames.find((item) => item.id === gameId);
              return (
                <span
                  key={gameId}
                  className="neo-copy inline-flex items-center gap-2 border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#171411]"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {game?.title ?? gameId}
                </span>
              );
            })}
          </div>
        </article>
      ))}
    </div>
  );
}

function EmptyStorePanel({ label }: { label: string }) {
  return (
    <div className="neo-copy border-[3px] border-dashed border-black bg-[#f5eedf] p-6 text-center text-[12px] font-black uppercase tracking-[0.12em] text-[#655f58]">
      {label}
    </div>
  );
}
