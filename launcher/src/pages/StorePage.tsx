import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Heart,
  Play,
  ReceiptText,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Tags,
  Trophy,
} from "lucide-react";
import { StoreGameCard } from "../components/launcher/StoreGameCard";
import { CartDrawer, CartPanel } from "../components/store/StoreCartPanels";
import { EmptyStorePanel } from "../components/store/EmptyStorePanel";
import { StoreOrderPanel } from "../components/store/StoreOrderPanel";
import { STORE_REFUND_REASON_OPTIONS } from "../components/store/storeOrderOptions";
import { ProductDetailPanel } from "../components/store/StoreProductDetailPanel";
import { StoreMetric } from "../components/store/StoreReadinessPanels";
import { StoreReviewsPanel } from "../components/store/StoreReviewsPanel";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { getSupabaseClient } from "../lib/supabase/client";
import {
  addToStoreWishlist,
  addToCart as addStoreCartItem,
  createStoreBuildDownloadTicket,
  getCartItems,
  getMyLicenses,
  getMyOrderByStripeSession,
  getMyStoreReview,
  listMyOrderItems,
  listMyStoreOrderInvoices,
  listMyStoreRefundRequests,
  listMyStoreReviewReports,
  listMyStoreWishlist,
  listStoreReviewReplies,
  listStoreProductReviews,
  listMyOrders,
  listPublishedProducts,
  reportStoreReview,
  removeFromStoreWishlist,
  removeFromCart as removeStoreCartItem,
  requestStoreOrderRefund,
  syncStoreOrderInvoice,
  upsertStoreReviewReply,
  upsertStoreReview,
} from "../lib/supabase/store";
import { getLicenseDeviceId, validateLicense } from "../lib/launcher";
import { STORAGE_KEYS } from "../lib/storage-keys";
import { canSyncStoreInvoice, getStoreInvoiceStatusLabel } from "../lib/store-support";
import {
  formatCurrency,
  formatDateTime,
  formatFileSize,
  formatStoreReason,
} from "../lib/store-formatters";
import type { Platform, StoreGame } from "../lib/types";
import type {
  StoreLicense,
  StoreLicenseValidationResult,
  StoreOrder,
  StoreOrderInvoice,
  StoreOrderItem,
  StoreProduct,
  StoreReview,
  StoreReviewReply,
  StoreReviewReport,
  StoreReviewReportReason,
  StoreRefundRequest,
} from "../lib/types/store";

type StoreTab = "browse" | "wishlist" | "cart" | "orders";
type StoreCatalogSource = "loading" | "hosted" | "empty" | "error";
type StorePlatformFilter = "all" | Platform;
type StorePriceFilter = "all" | "discounts" | "free" | "under-15";
type StoreSortMode = "featured" | "newest" | "price-asc" | "price-desc" | "discount";
type CheckoutResponse = {
  id: string | null;
  url: string | null;
  order_id?: string;
  status?: "fulfilled" | "pending";
};

function isStoreTab(value: string | null): value is StoreTab {
  return value === "browse" || value === "wishlist" || value === "cart" || value === "orders";
}

function isPlatform(value: string): value is Platform {
  return value === "windows" || value === "linux" || value === "macos";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function createCheckoutAttemptId() {
  return crypto.randomUUID();
}

function firstText(...values: Array<string | null | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim();
}

const STRIPE_LIVE_STAGING_VERIFY_ORDER_ID = "11111111-1111-4111-8111-111111111111";

function createStripeLiveStagingVerifyState(): {
  invoices: StoreOrderInvoice[];
  orderItemsByOrderId: Record<string, StoreOrderItem[]>;
  orders: StoreOrder[];
  refundRequests: StoreRefundRequest[];
} {
  const now = "2026-06-15T12:00:00.000Z";
  const order: StoreOrder = {
    createdAt: now,
    currency: "eur",
    id: STRIPE_LIVE_STAGING_VERIFY_ORDER_ID,
    paidAt: "2026-06-15T12:01:00.000Z",
    paymentMethod: "card",
    status: "fulfilled",
    stripePaymentIntent: "pi_test_redacted_staging",
    stripeSessionId: "cs_test_redacted_staging",
    subtotalCents: 1999,
    taxCents: 380,
    totalCents: 2379,
    updatedAt: "2026-06-15T12:02:00.000Z",
    userId: "user-local-stripe-verify",
  };

  return {
    invoices: [
      {
        createdAt: now,
        hostedInvoiceUrl: null,
        id: "invoice-stripe-staging-verify",
        invoiceNumber: "INV-STAGING-REDACTED",
        issuedAt: "2026-06-15T12:03:00.000Z",
        metadata: { source: "verify-route-fixture" },
        orderId: order.id,
        pdfUrl: null,
        provider: "stripe",
        providerInvoiceId: "in_test_redacted",
        status: "available",
        updatedAt: "2026-06-15T12:03:00.000Z",
        userId: order.userId,
      },
    ],
    orderItemsByOrderId: {
      [order.id]: [
        {
          id: "order-item-stripe-staging-verify",
          orderId: order.id,
          priceCentsSnapshot: 1999,
          productId: "neo-strike",
          quantity: 1,
          titleSnapshot: "Neo-Strike Staging Fixture",
        },
      ],
    },
    orders: [order],
    refundRequests: [
      {
        cancelledAt: null,
        createdAt: now,
        details: "Verify fixture for refund replay contract; no Stripe refund was created.",
        failureReason: null,
        id: "refund-stripe-staging-verify",
        metadata: { source: "verify-route-fixture" },
        orderId: order.id,
        processedAt: null,
        provider: "stripe",
        providerRefundId: "re_test_redacted",
        providerRefundStatus: "pending",
        reason: "duplicate_purchase",
        refundAmountCents: 2379,
        requestedAt: now,
        reviewedAt: "2026-06-15T12:04:00.000Z",
        status: "approved",
        updatedAt: "2026-06-15T12:04:00.000Z",
        userId: order.userId,
      },
    ],
  };
}

function mapProductToStoreGame(product: StoreProduct): StoreGame {
  const originalPrice = product.priceCents / 100;
  const discountMultiplier = Math.max(0, 100 - product.discountPercent) / 100;
  const price = Math.round(originalPrice * discountMultiplier * 100) / 100;
  const tagLine =
    firstText(
      product.shortDescription,
      product.tags.slice(0, 2).join(" / "),
      product.genres.slice(0, 2).join(" / "),
    ) ?? "Store Product";

  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    description: firstText(product.description, product.shortDescription) ?? "",
    coverImageUrl: product.coverImageUrl ?? undefined,
    downloadsCount: product.downloadsCount,
    price,
    originalPrice: product.discountPercent > 0 ? originalPrice : undefined,
    discountPercent: product.discountPercent || undefined,
    isFree: product.priceCents === 0,
    platform: product.platforms.filter(isPlatform),
    publisher: product.publisher ?? undefined,
    rating: product.rating ?? undefined,
    ratingsCount: product.ratingsCount,
    releaseDate: product.releaseDate ?? undefined,
    genres: product.genres.length > 0 ? product.genres : undefined,
    tagLine,
  };
}

const ownedKey = STORAGE_KEYS.STORE_OWNED;
const wishlistKey = STORAGE_KEYS.STORE_WISHLIST;
const cartKey = STORAGE_KEYS.STORE_CART;
const ordersKey = STORAGE_KEYS.STORE_ORDERS;
const legacyStoreAccountKeys = [ownedKey, wishlistKey, cartKey, ordersKey] as const;
const emptyStoreIds = new Set<string>();
function clearLegacyLocalStoreAccountState() {
  try {
    legacyStoreAccountKeys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage can be unavailable in hardened webviews. In-memory account isolation still applies.
  }
}

function formatStorePrice(game: StoreGame) {
  return game.isFree || game.price <= 0 ? "Free" : formatCurrency(game.price);
}

function releaseTime(game: StoreGame) {
  const timestamp = game.releaseDate ? new Date(game.releaseDate).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function storeScore(game: StoreGame) {
  return (
    (game.downloadsCount ?? 0) * 10 +
    (game.ratingsCount ?? 0) * 2 +
    (game.rating ?? 0) * 10 +
    (game.discountPercent ?? 0)
  );
}

function gameSearchText(game: StoreGame) {
  return [
    game.title,
    game.description,
    game.publisher,
    game.tagLine,
    ...(game.genres ?? []),
    ...game.platform,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function sortedStoreGames(games: StoreGame[], sortMode: StoreSortMode) {
  const sorted = [...games];
  switch (sortMode) {
    case "newest":
      return sorted.sort((a, b) => releaseTime(b) - releaseTime(a));
    case "price-asc":
      return sorted.sort((a, b) => a.price - b.price);
    case "price-desc":
      return sorted.sort((a, b) => b.price - a.price);
    case "discount":
      return sorted.sort((a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0));
    case "featured":
      return sorted.sort((a, b) => storeScore(b) - storeScore(a));
  }
}

function indexDeveloperReplyDrafts(replies: StoreReviewReply[]) {
  return replies.reduce<Record<string, string>>((drafts, reply) => {
    drafts[reply.reviewId] = reply.body;
    return drafts;
  }, {});
}

export function StorePage() {
  const { isLoading: isStoreAuthLoading, user: storeUser } = useCurrentUser();
  const storeUserId = storeUser?.id ?? null;
  const isStoreSignedIn = storeUserId !== null;
  const [activeTab, setActiveTab] = useState<StoreTab>("browse");
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set());
  const [cartIds, setCartIds] = useState<Set<string>>(new Set());
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [orderItemsByOrderId, setOrderItemsByOrderId] = useState<Record<string, StoreOrderItem[]>>(
    {},
  );
  const [refundRequests, setRefundRequests] = useState<StoreRefundRequest[]>([]);
  const [orderInvoices, setOrderInvoices] = useState<StoreOrderInvoice[]>([]);
  const [licenses, setLicenses] = useState<StoreLicense[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const isStripeLiveStagingContractVerify =
    searchParams.get("verify") === "stripe-live-staging-contract";
  const [isProcessing, setIsProcessing] = useState(false);
  const [products, setProducts] = useState<StoreGame[]>([]);
  const [storeProducts, setStoreProducts] = useState<StoreProduct[]>([]);
  const [catalogSource, setCatalogSource] = useState<StoreCatalogSource>("loading");
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [accountStateUserId, setAccountStateUserId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<StoreReview[]>([]);
  const [myReview, setMyReview] = useState<StoreReview | null>(null);
  const [reviewReplies, setReviewReplies] = useState<StoreReviewReply[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [reviewReports, setReviewReports] = useState<StoreReviewReport[]>([]);
  const [reportingReviewId, setReportingReviewId] = useState<string | null>(null);
  const [reviewReportReason, setReviewReportReason] = useState<StoreReviewReportReason>("spam");
  const [reviewReportDetails, setReviewReportDetails] = useState("");
  const [reviewReportSaving, setReviewReportSaving] = useState(false);
  const [developerReplyDrafts, setDeveloperReplyDrafts] = useState<Record<string, string>>({});
  const [developerReplySavingReviewId, setDeveloperReplySavingReviewId] = useState<string | null>(
    null,
  );
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);
  const [licenseToken, setLicenseToken] = useState("");
  const [licenseValidationResults, setLicenseValidationResults] = useState<
    Record<string, StoreLicenseValidationResult>
  >({});
  const [validatingLicenseKey, setValidatingLicenseKey] = useState<string | null>(null);
  const [refundDraftOrderId, setRefundDraftOrderId] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState(STORE_REFUND_REASON_OPTIONS[0].value);
  const [refundDetails, setRefundDetails] = useState("");
  const [refundSavingOrderId, setRefundSavingOrderId] = useState<string | null>(null);
  const [invoiceSyncingOrderId, setInvoiceSyncingOrderId] = useState<string | null>(null);
  const [downloadPreparingLicenseId, setDownloadPreparingLicenseId] = useState<string | null>(null);
  const [storeSearch, setStoreSearch] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("all");
  const [selectedPlatform, setSelectedPlatform] = useState<StorePlatformFilter>("all");
  const [priceFilter, setPriceFilter] = useState<StorePriceFilter>("all");
  const [sortMode, setSortMode] = useState<StoreSortMode>("featured");
  const activeStoreUserIdRef = useRef(storeUserId);
  const checkoutInFlightRef = useRef<string | null>(null);

  useEffect(() => {
    activeStoreUserIdRef.current = storeUserId;
  }, [storeUserId]);

  const clearStoreAccountState = useCallback(() => {
    setAccountStateUserId(null);
    setOwnedIds(new Set());
    setWishlistIds(new Set());
    setCartIds(new Set());
    setOrders([]);
    setOrderItemsByOrderId({});
    setRefundRequests([]);
    setOrderInvoices([]);
    setLicenses([]);
    setLicenseToken("");
    setLicenseValidationResults({});
    setRefundDraftOrderId(null);
    setRefundDetails("");
    setIsCartDrawerOpen(false);
    checkoutInFlightRef.current = null;
    setIsProcessing(false);
  }, []);

  const refreshStorePurchaseState = useCallback(async () => {
    const requestedUserId = storeUserId;
    if (!requestedUserId) {
      clearStoreAccountState();
      return [];
    }

    const [
      remoteOrders,
      remoteRefundRequests,
      remoteInvoices,
      latestLicenses,
      cartItems,
      wishlistItems,
    ] = await Promise.all([
      listMyOrders(),
      listMyStoreRefundRequests(),
      listMyStoreOrderInvoices(),
      getMyLicenses(),
      getCartItems(),
      listMyStoreWishlist(),
    ]);

    if (activeStoreUserIdRef.current !== requestedUserId) {
      return [];
    }

    setOrders(remoteOrders);
    setRefundRequests(remoteRefundRequests);
    setOrderInvoices(remoteInvoices);
    setLicenses(latestLicenses);
    setCartIds(new Set(cartItems.map((item) => item.productId)));
    setWishlistIds(new Set(wishlistItems.map((item) => item.productId)));
    setOwnedIds(new Set(latestLicenses.map((license) => license.productId)));
    setAccountStateUserId(requestedUserId);

    return remoteOrders;
  }, [clearStoreAccountState, storeUserId]);

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      setCatalogSource("loading");
      try {
        const publishedProducts = await listPublishedProducts();

        if (cancelled) return;

        if (publishedProducts.length === 0) {
          setStoreProducts([]);
          setProducts([]);
          setSelectedProductId(null);
          setCatalogSource("empty");
        } else {
          const mapped = publishedProducts.map(mapProductToStoreGame);
          setStoreProducts(publishedProducts);
          setProducts(mapped);
          setCatalogSource("hosted");
          if (!cancelled && selectedProductId === null && mapped.length > 0) {
            setSelectedProductId(mapped[0].id);
          }
        }
      } catch {
        if (!cancelled) {
          setStoreProducts([]);
          setProducts([]);
          setSelectedProductId(null);
          setCatalogSource("error");
        }
      }
    }

    loadProducts();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- selectedProductId set inside causes loop

  useEffect(() => {
    let cancelled = false;

    clearStoreAccountState();
    clearLegacyLocalStoreAccountState();

    if (isStoreAuthLoading) {
      setOrdersLoading(true);
      return () => {
        cancelled = true;
      };
    }

    if (!storeUserId) {
      setOrdersLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setOrdersLoading(true);
    void refreshStorePurchaseState()
      .catch((error: unknown) => {
        if (cancelled || activeStoreUserIdRef.current !== storeUserId) return;
        clearStoreAccountState();
        setStatusMessage(
          error instanceof Error
            ? `Store account sync unavailable: ${error.message}`
            : "Store account sync unavailable.",
        );
      })
      .finally(() => {
        if (!cancelled && activeStoreUserIdRef.current === storeUserId) {
          setOrdersLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clearStoreAccountState, isStoreAuthLoading, refreshStorePurchaseState, storeUserId]);

  const availableGenres = useMemo(
    () =>
      Array.from(new Set(products.flatMap((game) => game.genres ?? [game.tagLine])))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [products],
  );
  const filteredProducts = useMemo(() => {
    const normalizedSearch = storeSearch.trim().toLowerCase();
    const filtered = products.filter((game) => {
      const matchesSearch =
        normalizedSearch.length === 0 || gameSearchText(game).includes(normalizedSearch);
      const matchesGenre =
        selectedGenre === "all" || (game.genres ?? [game.tagLine]).includes(selectedGenre);
      const matchesPlatform =
        selectedPlatform === "all" || game.platform.includes(selectedPlatform);
      const matchesPrice =
        priceFilter === "all" ||
        (priceFilter === "discounts" && Boolean(game.discountPercent)) ||
        (priceFilter === "free" && (game.isFree || game.price <= 0)) ||
        (priceFilter === "under-15" && game.price > 0 && game.price < 15);

      return matchesSearch && matchesGenre && matchesPlatform && matchesPrice;
    });

    return sortedStoreGames(filtered, sortMode);
  }, [priceFilter, products, selectedGenre, selectedPlatform, sortMode, storeSearch]);
  const hasCurrentStoreAccount =
    storeUserId !== null && accountStateUserId === storeUserId && !isStoreAuthLoading;
  const purchaseActionsDisabled = isProcessing || !hasCurrentStoreAccount;
  const scopedOwnedIds = hasCurrentStoreAccount ? ownedIds : emptyStoreIds;
  const scopedWishlistIds = hasCurrentStoreAccount ? wishlistIds : emptyStoreIds;
  const scopedCartIds = hasCurrentStoreAccount ? cartIds : emptyStoreIds;
  const scopedOrders = useMemo(
    () => (hasCurrentStoreAccount ? orders : []),
    [hasCurrentStoreAccount, orders],
  );
  const scopedRefundRequests = hasCurrentStoreAccount ? refundRequests : [];
  const scopedOrderInvoices = hasCurrentStoreAccount ? orderInvoices : [];
  const scopedLicenses = hasCurrentStoreAccount ? licenses : [];
  const scopedOrderItemsByOrderId = hasCurrentStoreAccount ? orderItemsByOrderId : {};
  const wishlistGames = useMemo(
    () => products.filter((game) => scopedWishlistIds.has(game.id)),
    [products, scopedWishlistIds],
  );
  const filteredWishlistGames = useMemo(
    () => filteredProducts.filter((game) => scopedWishlistIds.has(game.id)),
    [filteredProducts, scopedWishlistIds],
  );
  const cartGames = useMemo(
    () => products.filter((game) => scopedCartIds.has(game.id) && !scopedOwnedIds.has(game.id)),
    [products, scopedCartIds, scopedOwnedIds],
  );
  const cartTotal = cartGames.reduce((total, game) => total + game.price, 0);
  const activeGames = activeTab === "wishlist" ? filteredWishlistGames : filteredProducts;
  const discoveryGames = filteredProducts.length > 0 ? filteredProducts : products;
  const specialOfferGames = useMemo(
    () =>
      sortedStoreGames(
        products.filter((game) => game.discountPercent),
        "discount",
      ).slice(0, 4),
    [products],
  );
  const topSellerGames = useMemo(
    () =>
      [...products]
        .filter((game) => (game.downloadsCount ?? 0) > 0)
        .sort((a, b) => (b.downloadsCount ?? 0) - (a.downloadsCount ?? 0))
        .slice(0, 4),
    [products],
  );
  const newReleaseGames = useMemo(
    () => sortedStoreGames(products, "newest").slice(0, 4),
    [products],
  );
  const stripeLiveStagingVerifyState = useMemo(createStripeLiveStagingVerifyState, []);
  const visibleOrders = isStripeLiveStagingContractVerify
    ? stripeLiveStagingVerifyState.orders
    : scopedOrders;
  const visibleOrderInvoices = isStripeLiveStagingContractVerify
    ? stripeLiveStagingVerifyState.invoices
    : scopedOrderInvoices;
  const visibleRefundRequests = isStripeLiveStagingContractVerify
    ? stripeLiveStagingVerifyState.refundRequests
    : scopedRefundRequests;
  const visibleOrderItemsByOrderId = isStripeLiveStagingContractVerify
    ? stripeLiveStagingVerifyState.orderItemsByOrderId
    : scopedOrderItemsByOrderId;
  const selectedProduct =
    products.find((game) => game.id === selectedProductId) ?? products[0] ?? null;
  const selectedStoreProduct =
    selectedProduct === null
      ? null
      : (storeProducts.find((product) => product.id === selectedProduct.id) ?? null);
  const selectedProductOwned = selectedProduct ? scopedOwnedIds.has(selectedProduct.id) : false;
  const commerceEnabled = catalogSource === "hosted";
  const heroTrailerUrl = firstText(selectedStoreProduct?.trailerUrl) ?? null;
  const canManageSelectedProductReplies =
    Boolean(storeUserId && selectedStoreProduct?.developerId === storeUserId) &&
    Boolean(selectedProduct && isUuid(selectedProduct.id));
  const selectedDiscoveryIndex =
    selectedProduct === null
      ? -1
      : discoveryGames.findIndex((game) => game.id === selectedProduct.id);
  const activeFilterCount = [
    storeSearch.trim().length > 0,
    selectedGenre !== "all",
    selectedPlatform !== "all",
    priceFilter !== "all",
    sortMode !== "featured",
  ].filter(Boolean).length;
  const reviewRepliesByReviewId = useMemo(
    () => new Map(reviewReplies.map((reply) => [reply.reviewId, reply])),
    [reviewReplies],
  );
  const reportedReviewIds = useMemo(
    () =>
      new Set(
        reviewReports
          .filter((report) => report.status === "active")
          .map((report) => report.reviewId),
      ),
    [reviewReports],
  );

  useEffect(() => {
    if (!selectedProduct || !isUuid(selectedProduct.id)) {
      setReviews([]);
      setMyReview(null);
      setReviewReports([]);
      setReviewReplies([]);
      setDeveloperReplyDrafts({});
      setReviewsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadReviews() {
      setReviewsLoading(true);
      try {
        const [productReviews, ownReview] = await Promise.all([
          listStoreProductReviews(selectedProduct.id),
          getMyStoreReview(selectedProduct.id),
        ]);
        const reviewIds = productReviews.map((review) => review.id);
        const [ownReports, developerReplies] = await Promise.all([
          listMyStoreReviewReports(reviewIds),
          listStoreReviewReplies(reviewIds),
        ]);

        if (cancelled) return;

        setReviews(productReviews);
        setReviewReports(ownReports);
        setReviewReplies(developerReplies);
        setDeveloperReplyDrafts(indexDeveloperReplyDrafts(developerReplies));
        setMyReview(ownReview);
        setReviewRating(ownReview?.rating ?? 5);
        setReviewTitle(ownReview?.title ?? "");
        setReviewBody(ownReview?.body ?? "");
      } catch (error) {
        if (!cancelled) {
          setReviews([]);
          setMyReview(null);
          setReviewReplies([]);
          setDeveloperReplyDrafts({});
          setStatusMessage(
            error instanceof Error
              ? `Store reviews unavailable: ${error.message}`
              : "Store reviews unavailable.",
          );
        }
      } finally {
        if (!cancelled) setReviewsLoading(false);
      }
    }

    loadReviews();
    return () => {
      cancelled = true;
    };
  }, [selectedProduct, storeUserId]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (isStoreTab(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    if (isStripeLiveStagingContractVerify) {
      setActiveTab("orders");
    }
  }, [isStripeLiveStagingContractVerify]);

  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    if (!sessionId || isStoreAuthLoading || !storeUserId) return;
    const checkoutSessionId = sessionId;

    let cancelled = false;

    async function confirmCheckoutReturn() {
      setActiveTab("orders");
      setOrdersLoading(true);
      setStatusMessage("Confirming checkout return...");

      try {
        const [matchedOrder, latestOrders] = await Promise.all([
          getMyOrderByStripeSession(checkoutSessionId).catch(() => null),
          refreshStorePurchaseState(),
        ]);
        if (cancelled) return;

        const order =
          matchedOrder ??
          latestOrders.find((candidate) => candidate.stripeSessionId === checkoutSessionId) ??
          null;
        if (!order) {
          setStatusMessage(
            "Checkout returned. Waiting for the Stripe webhook to create the order.",
          );
        } else if (order.status === "fulfilled") {
          setStatusMessage("Checkout fulfilled. Issued licenses and downloads are now available.");
        } else if (order.status === "paid") {
          setStatusMessage(
            "Payment confirmed. Fulfillment and license issuance are still pending.",
          );
        } else if (order.status === "pending") {
          setStatusMessage("Checkout received. Fulfillment is still pending.");
        } else {
          setStatusMessage(`Checkout returned with order status: ${order.status}.`);
        }
      } catch (error) {
        if (!cancelled) {
          setStatusMessage(
            error instanceof Error
              ? `Checkout confirmation failed: ${error.message}`
              : "Checkout confirmation failed.",
          );
        }
      } finally {
        if (!cancelled) {
          setOrdersLoading(false);
          const next = new URLSearchParams(searchParams);
          next.set("tab", "orders");
          next.delete("session_id");
          setSearchParams(next, { replace: true });
        }
      }
    }

    void confirmCheckoutReturn();
    return () => {
      cancelled = true;
    };
  }, [isStoreAuthLoading, refreshStorePurchaseState, searchParams, setSearchParams, storeUserId]);

  useEffect(() => {
    const orderIds = scopedOrders.map((order) => order.id).filter(isUuid);
    if (orderIds.length === 0) {
      setOrderItemsByOrderId({});
      return;
    }

    let cancelled = false;
    async function loadOrderItems() {
      try {
        const items = await listMyOrderItems(orderIds);
        const entries = Object.fromEntries(
          orderIds.map((orderId) => [orderId, items.filter((item) => item.orderId === orderId)]),
        );
        if (!cancelled) {
          setOrderItemsByOrderId(entries);
        }
      } catch {
        if (!cancelled) setOrderItemsByOrderId({});
      }
    }

    void loadOrderItems();
    return () => {
      cancelled = true;
    };
  }, [scopedOrders]);

  useEffect(() => {
    const slug = searchParams.get("slug");
    if (!slug) return;
    if (catalogSource === "loading") return;

    const wantsInstall = searchParams.get("install") === "1";
    const wanted = slug.toLowerCase();
    const match = products.find(
      (game) =>
        game.id.toLowerCase() === wanted ||
        game.slug?.toLowerCase() === wanted ||
        game.title.toLowerCase() === wanted,
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
  }, [catalogSource, products, searchParams, setSearchParams, setStatusMessage]);

  async function toggleWishlist(gameId: string) {
    if (!commerceEnabled) {
      setStatusMessage("Preview items cannot be wishlisted. A hosted catalog product is required.");
      return;
    }

    if (!isStoreSignedIn || !hasCurrentStoreAccount) {
      setStatusMessage("Sign in and wait for account sync before changing your wishlist.");
      return;
    }

    if (!isUuid(gameId)) {
      setStatusMessage("Wishlist sync requires a hosted product ID.");
      return;
    }

    const requestedUserId = storeUserId;
    const wasWishlisted = scopedWishlistIds.has(gameId);
    try {
      if (wasWishlisted) {
        await removeFromStoreWishlist(gameId);
      } else {
        await addToStoreWishlist(gameId);
      }
      if (activeStoreUserIdRef.current !== requestedUserId) return;

      setWishlistIds((current) => {
        const next = new Set(current);
        if (wasWishlisted) next.delete(gameId);
        else next.add(gameId);
        return next;
      });
      setStatusMessage(
        wasWishlisted ? "Wishlist removed and synced." : "Wishlist saved and synced.",
      );
    } catch (error) {
      if (activeStoreUserIdRef.current !== requestedUserId) return;
      setStatusMessage(
        error instanceof Error
          ? `Store wishlist sync failed: ${error.message}`
          : "Store wishlist sync failed.",
      );
    }
  }

  async function handleAddToCart(gameId: string) {
    if (!commerceEnabled) {
      setStatusMessage(
        "Preview items cannot be added to cart. A hosted catalog product is required.",
      );
      return;
    }

    if (!isStoreSignedIn || !hasCurrentStoreAccount) {
      setStatusMessage("Sign in and wait for account sync before changing your cart.");
      return;
    }

    if (scopedOwnedIds.has(gameId)) {
      setStatusMessage("This game is already owned.");
      return;
    }

    const requestedUserId = storeUserId;
    try {
      await addStoreCartItem(gameId);
      if (activeStoreUserIdRef.current !== requestedUserId) return;
      setCartIds((current) => new Set(current).add(gameId));
      setIsCartDrawerOpen(true);
      setStatusMessage("Added to cart.");
    } catch (error) {
      if (activeStoreUserIdRef.current !== requestedUserId) return;
      setStatusMessage(
        error instanceof Error
          ? `Store cart sync failed: ${error.message}`
          : "Store cart sync failed.",
      );
    }
  }

  async function handleRemoveFromCart(gameId: string) {
    if (!isStoreSignedIn || !hasCurrentStoreAccount) {
      setStatusMessage("Sign in and wait for account sync before changing your cart.");
      return;
    }

    const requestedUserId = storeUserId;
    try {
      await removeStoreCartItem(gameId);
      if (activeStoreUserIdRef.current !== requestedUserId) return;
      setCartIds((current) => {
        const next = new Set(current);
        next.delete(gameId);
        return next;
      });
      setStatusMessage("Removed from cart.");
    } catch (error) {
      if (activeStoreUserIdRef.current !== requestedUserId) return;
      setStatusMessage(
        error instanceof Error
          ? `Store cart sync failed: ${error.message}`
          : "Store cart sync failed.",
      );
    }
  }

  async function startCheckout(productIds: string[]) {
    if (!commerceEnabled) {
      setStatusMessage("Preview items cannot be purchased. A hosted catalog product is required.");
      return;
    }

    if (!isStoreSignedIn || !hasCurrentStoreAccount || !storeUserId) {
      setStatusMessage("Sign in and wait for account sync before starting checkout.");
      return;
    }

    if (productIds.length === 0 || checkoutInFlightRef.current) {
      return;
    }

    const checkoutUserId = storeUserId;
    const checkoutAttemptId = createCheckoutAttemptId();
    checkoutInFlightRef.current = checkoutAttemptId;
    setIsProcessing(true);
    try {
      const licenseDeviceId = await getLicenseDeviceId().catch(() => null);
      if (
        activeStoreUserIdRef.current !== checkoutUserId ||
        checkoutInFlightRef.current !== checkoutAttemptId
      ) {
        return;
      }
      const { data, error } = await getSupabaseClient().functions.invoke<CheckoutResponse>(
        "stripe-create-checkout",
        {
          body: {
            product_ids: productIds,
            checkout_attempt_id: checkoutAttemptId,
            ...(licenseDeviceId ? { device_id: licenseDeviceId } : {}),
            success_url:
              window.location.origin + "/store?tab=orders&session_id={CHECKOUT_SESSION_ID}",
            cancel_url: window.location.origin + "/store?tab=browse",
          },
        },
      );

      if (
        activeStoreUserIdRef.current !== checkoutUserId ||
        checkoutInFlightRef.current !== checkoutAttemptId
      ) {
        return;
      }

      if (error) {
        setStatusMessage(error.message);
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
        return;
      }

      if (data?.status === "fulfilled") {
        const didRefresh = await refreshStorePurchaseState()
          .then(() => true)
          .catch(() => false);
        if (
          activeStoreUserIdRef.current !== checkoutUserId ||
          checkoutInFlightRef.current !== checkoutAttemptId
        ) {
          return;
        }
        setStatusMessage(
          didRefresh
            ? "Free checkout fulfilled. Account licenses refreshed; library handoff remains separate."
            : "Free checkout fulfilled. License refresh is still pending; check Orders again shortly.",
        );
      } else {
        setStatusMessage("Checkout session created but no URL was returned.");
      }
    } catch (err) {
      if (activeStoreUserIdRef.current === checkoutUserId) {
        setStatusMessage(err instanceof Error ? err.message : "Checkout failed.");
      }
    } finally {
      if (checkoutInFlightRef.current === checkoutAttemptId) {
        checkoutInFlightRef.current = null;
        setIsProcessing(false);
      }
    }
  }

  async function buyNow(gameId: string) {
    if (!commerceEnabled) {
      setStatusMessage("Preview items cannot be purchased. A hosted catalog product is required.");
      return;
    }

    if (scopedOwnedIds.has(gameId)) {
      setStatusMessage("This game is already in your library.");
      return;
    }

    const game = products.find((g) => g.id === gameId);
    if (!game) {
      setStatusMessage("Game not found.");
      return;
    }

    await startCheckout([gameId]);
  }

  async function completeCheckout(gameIds = cartGames.map((game) => game.id)) {
    if (!commerceEnabled) {
      setStatusMessage(
        "Preview items cannot be checked out. A hosted catalog product is required.",
      );
      return;
    }

    const purchasableIds = gameIds.filter((gameId) => !scopedOwnedIds.has(gameId));
    if (purchasableIds.length === 0) {
      setStatusMessage("Your cart is empty.");
      return;
    }

    await startCheckout(purchasableIds);
  }

  async function handleValidateLicense(token: string, resultKey: string) {
    const trimmedToken = token.trim();
    if (!trimmedToken) {
      setStatusMessage("Paste a license token before validating.");
      return;
    }

    setValidatingLicenseKey(resultKey);
    try {
      const result = await validateLicense(trimmedToken);
      setLicenseValidationResults((current) => ({
        ...current,
        [resultKey]: result,
      }));
      setStatusMessage(
        result.valid
          ? "License token is valid for this device."
          : `License token invalid: ${formatStoreReason(result.reason)}.`,
      );
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? `License validation failed: ${error.message}`
          : "License validation failed.",
      );
    } finally {
      setValidatingLicenseKey(null);
    }
  }

  async function handleSubmitReview(gameId: string) {
    if (!scopedOwnedIds.has(gameId)) {
      setStatusMessage("Reviews require an active store license.");
      return;
    }

    setReviewSaving(true);
    try {
      const savedReview = await upsertStoreReview(gameId, {
        rating: reviewRating,
        title: reviewTitle,
        body: reviewBody,
      });

      if (!savedReview) {
        setStatusMessage("Sign in to publish a review.");
        return;
      }

      const productReviews = await listStoreProductReviews(gameId);
      const developerReplies = await listStoreReviewReplies(
        productReviews.map((review) => review.id),
      );
      setMyReview(savedReview);
      setReviews(productReviews);
      setReviewReplies(developerReplies);
      setDeveloperReplyDrafts(indexDeveloperReplyDrafts(developerReplies));
      setStatusMessage(myReview ? "Review updated." : "Review published.");
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? `Review failed: ${error.message}` : "Review failed.",
      );
    } finally {
      setReviewSaving(false);
    }
  }

  function handleOpenReviewReport(review: StoreReview) {
    if (!isStoreSignedIn) {
      setStatusMessage("Sign in to report review abuse.");
      return;
    }

    if (review.id === myReview?.id) {
      setStatusMessage("Own reviews cannot be reported.");
      return;
    }

    if (reportedReviewIds.has(review.id)) {
      setStatusMessage("Review report already logged.");
      return;
    }

    setReportingReviewId((current) => (current === review.id ? null : review.id));
    setReviewReportReason("spam");
    setReviewReportDetails("");
  }

  async function handleSubmitReviewReport(reviewId: string, productId: string) {
    if (!isStoreSignedIn) {
      setStatusMessage("Sign in to report review abuse.");
      return;
    }

    setReviewReportSaving(true);
    try {
      const savedReport = await reportStoreReview(reviewId, {
        reason: reviewReportReason,
        details: reviewReportDetails,
      });

      if (!savedReport) {
        setStatusMessage("Sign in to report review abuse.");
        return;
      }

      const productReviews = await listStoreProductReviews(productId);
      const reviewIds = productReviews.map((review) => review.id);
      const [ownReports, developerReplies] = await Promise.all([
        listMyStoreReviewReports(reviewIds),
        listStoreReviewReplies(reviewIds),
      ]);

      setReviews(productReviews);
      setReviewReplies(developerReplies);
      setDeveloperReplyDrafts(indexDeveloperReplyDrafts(developerReplies));
      setReviewReports((current) => {
        const next = current.filter((report) => report.id !== savedReport.id);
        return [
          ...next,
          savedReport,
          ...ownReports.filter((report) => report.id !== savedReport.id),
        ];
      });
      setReportingReviewId(null);
      setReviewReportDetails("");
      setStatusMessage("Review report logged for support review.");
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? `Report failed: ${error.message}` : "Report failed.",
      );
    } finally {
      setReviewReportSaving(false);
    }
  }

  async function handleSubmitDeveloperReply(review: StoreReview) {
    if (!canManageSelectedProductReplies) {
      setStatusMessage("Developer replies require ownership of this store product.");
      return;
    }

    const body = developerReplyDrafts[review.id]?.trim() ?? "";
    if (!body) {
      setStatusMessage("Developer reply requires a short message.");
      return;
    }

    setDeveloperReplySavingReviewId(review.id);
    try {
      const savedReply = await upsertStoreReviewReply(review.id, review.productId, { body });

      if (!savedReply) {
        setStatusMessage("Sign in as the product developer to reply.");
        return;
      }

      setReviewReplies((current) => {
        const next = current.filter((reply) => reply.reviewId !== savedReply.reviewId);
        return [savedReply, ...next];
      });
      setDeveloperReplyDrafts((current) => ({
        ...current,
        [savedReply.reviewId]: savedReply.body,
      }));
      setStatusMessage("Developer reply saved.");
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? `Developer reply failed: ${error.message}`
          : "Developer reply failed.",
      );
    } finally {
      setDeveloperReplySavingReviewId(null);
    }
  }

  async function handleRequestRefund(orderId: string) {
    const order = scopedOrders.find((item) => item.id === orderId);
    if (!order || !["paid", "fulfilled"].includes(order.status) || order.totalCents <= 0) {
      setStatusMessage("Refund execution requires a paid or fulfilled order.");
      return;
    }

    setRefundSavingOrderId(orderId);
    try {
      const supportResult = await requestStoreOrderRefund(orderId, {
        reason: refundReason,
        details: refundDetails,
      });

      if (!supportResult?.refundRequest) {
        setStatusMessage("Sign in to request a refund.");
        return;
      }

      const updatedRefundRequest = supportResult.refundRequest;
      const updatedOrder = supportResult.order;
      const updatedInvoice = supportResult.invoice;

      setRefundRequests((current) => {
        const next = current.filter((request) => request.orderId !== orderId);
        return [updatedRefundRequest, ...next];
      });
      if (updatedOrder) {
        setOrders((current) =>
          current.map((item) => (item.id === updatedOrder.id ? updatedOrder : item)),
        );
      }
      if (updatedInvoice) {
        setOrderInvoices((current) => {
          const next = current.filter((invoice) => invoice.orderId !== updatedInvoice.orderId);
          return [updatedInvoice, ...next];
        });
      }
      setRefundDraftOrderId(null);
      setRefundDetails("");
      if (updatedOrder?.status === "refunded") {
        const refundedProductIds =
          scopedOrderItemsByOrderId[orderId]?.map((item) => item.productId) ?? [];
        if (refundedProductIds.length > 0) {
          setOwnedIds((current) => {
            const next = new Set(current);
            refundedProductIds.forEach((productId) => next.delete(productId));
            return next;
          });
        }
        await refreshStorePurchaseState().catch(() => []);
        setStatusMessage("Stripe refund processed. Store license was revoked.");
      } else if (updatedRefundRequest.providerRefundStatus === "pending") {
        setStatusMessage("Stripe refund accepted. Provider status is pending.");
      } else {
        setStatusMessage("Stripe refund staged. Provider status is syncing.");
      }
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? `Refund request failed: ${error.message}`
          : "Refund request failed.",
      );
    } finally {
      setRefundSavingOrderId(null);
    }
  }

  async function handleSyncInvoice(orderId: string) {
    const order = scopedOrders.find((item) => item.id === orderId);
    if (!order || !canSyncStoreInvoice(order.status)) {
      setStatusMessage("Invoice sync requires a paid, fulfilled, or refunded Stripe order.");
      return;
    }

    setInvoiceSyncingOrderId(orderId);
    try {
      const supportResult = await syncStoreOrderInvoice(orderId);
      if (supportResult.invoice) {
        const syncedInvoice = supportResult.invoice;
        setOrderInvoices((current) => {
          const next = current.filter((invoice) => invoice.orderId !== syncedInvoice.orderId);
          return [syncedInvoice, ...next];
        });
      }
      if (supportResult.order) {
        const syncedOrder = supportResult.order;
        setOrders((current) =>
          current.map((item) => (item.id === syncedOrder.id ? syncedOrder : item)),
        );
      }
      const label = getStoreInvoiceStatusLabel(supportResult.invoice ?? undefined, order.status);
      setStatusMessage(`Stripe invoice sync complete: ${label}.`);
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? `Invoice sync failed: ${error.message}` : "Invoice sync failed.",
      );
    } finally {
      setInvoiceSyncingOrderId(null);
    }
  }

  async function handleDownloadLicense(license: StoreLicense) {
    setDownloadPreparingLicenseId(license.id);
    try {
      const ticket = await createStoreBuildDownloadTicket(license.productId, license.platform);
      window.open(ticket.url, "_blank", "noopener,noreferrer");
      setStatusMessage(
        `Download unlocked: ${ticket.build.fileName} (${formatFileSize(ticket.build.sizeBytes)}). Link expires ${formatDateTime(ticket.expiresAt)}.`,
      );
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? `Download unavailable: ${error.message}` : "Download unavailable.",
      );
    } finally {
      setDownloadPreparingLicenseId(null);
    }
  }

  function handleOpenHeroTrailer() {
    if (!heroTrailerUrl) return;
    window.open(heroTrailerUrl, "_blank", "noopener,noreferrer");
  }

  function resetStoreBrowseFilters() {
    setStoreSearch("");
    setSelectedGenre("all");
    setSelectedPlatform("all");
    setPriceFilter("all");
    setSortMode("featured");
  }

  function moveDiscoveryQueue(offset: number) {
    if (discoveryGames.length === 0) return;
    const startIndex = selectedDiscoveryIndex >= 0 ? selectedDiscoveryIndex : 0;
    const nextIndex = (startIndex + offset + discoveryGames.length) % discoveryGames.length;
    setSelectedProductId(discoveryGames[nextIndex].id);
  }

  return (
    <div className="min-h-[600px]">
      <section className="space-y-7">
        <nav
          aria-label="Store section navigation"
          className="neo-copy border-[3px] border-black bg-[#171411] text-[10px] font-black tracking-[0.08em] text-[#fff9ed] uppercase shadow-[4px_4px_0_#171411]"
        >
          <div className="grid gap-0 lg:grid-cols-[auto_auto_auto_auto_auto_auto_minmax(220px,1fr)_auto]">
            <button
              className={`flex h-12 items-center justify-center gap-1 border-b-2 border-black px-4 lg:border-r-2 lg:border-b-0 ${
                activeTab === "browse" ? "bg-[#8cf5e4] text-[#171411]" : "bg-[#171411]"
              }`}
              type="button"
              onClick={() => setActiveTab("browse")}
            >
              Browse
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button
              className="flex h-12 items-center justify-center gap-1 border-b-2 border-black bg-[#242019] px-4 hover:bg-[#30291f] lg:border-r-2 lg:border-b-0"
              type="button"
              onClick={() => {
                setActiveTab("browse");
                setSortMode("featured");
              }}
            >
              Published
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <label className="relative flex h-12 items-center border-b-2 border-black bg-[#171411] lg:border-r-2 lg:border-b-0">
              <span className="sr-only">Store categories</span>
              <select
                className="h-full w-full appearance-none bg-transparent px-4 pr-8 text-[#fff9ed] outline-none"
                value={selectedGenre}
                onChange={(event) => {
                  setActiveTab("browse");
                  setSelectedGenre(event.target.value);
                }}
              >
                <option className="bg-[#fff9ed] text-[#171411]" value="all">
                  Categories
                </option>
                {availableGenres.map((genre) => (
                  <option className="bg-[#fff9ed] text-[#171411]" key={genre} value={genre}>
                    {genre}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 h-3.5 w-3.5" />
            </label>
            <label className="relative flex h-12 items-center border-b-2 border-black bg-[#242019] lg:border-r-2 lg:border-b-0">
              <span className="sr-only">Store platforms</span>
              <select
                className="h-full w-full appearance-none bg-transparent px-4 pr-8 text-[#fff9ed] outline-none"
                value={selectedPlatform}
                onChange={(event) => {
                  setActiveTab("browse");
                  setSelectedPlatform(event.target.value as StorePlatformFilter);
                }}
              >
                <option className="bg-[#fff9ed] text-[#171411]" value="all">
                  Platforms
                </option>
                <option className="bg-[#fff9ed] text-[#171411]" value="windows">
                  Windows
                </option>
                <option className="bg-[#fff9ed] text-[#171411]" value="linux">
                  Linux
                </option>
                <option className="bg-[#fff9ed] text-[#171411]" value="macos">
                  macOS
                </option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 h-3.5 w-3.5" />
            </label>
            <label className="relative flex h-12 items-center border-b-2 border-black bg-[#171411] lg:border-r-2 lg:border-b-0">
              <span className="sr-only">Store ways to play</span>
              <select
                className="h-full w-full appearance-none bg-transparent px-4 pr-8 text-[#fff9ed] outline-none"
                value={priceFilter}
                onChange={(event) => {
                  setActiveTab("browse");
                  setPriceFilter(event.target.value as StorePriceFilter);
                }}
              >
                <option className="bg-[#fff9ed] text-[#171411]" value="all">
                  Ways To Play
                </option>
                <option className="bg-[#fff9ed] text-[#171411]" value="discounts">
                  Specials
                </option>
                <option className="bg-[#fff9ed] text-[#171411]" value="free">
                  Free
                </option>
                <option className="bg-[#fff9ed] text-[#171411]" value="under-15">
                  Under 15
                </option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 h-3.5 w-3.5" />
            </label>
            <label className="relative flex h-12 items-center border-b-2 border-black bg-[#242019] lg:border-r-2 lg:border-b-0">
              <span className="sr-only">Store special sections</span>
              <select
                className="h-full w-full appearance-none bg-transparent px-4 pr-8 text-[#fff9ed] outline-none"
                value={sortMode}
                onChange={(event) => {
                  setActiveTab("browse");
                  setSortMode(event.target.value as StoreSortMode);
                }}
              >
                <option className="bg-[#fff9ed] text-[#171411]" value="featured">
                  Special Sections
                </option>
                <option className="bg-[#fff9ed] text-[#171411]" value="discount">
                  Special Offers
                </option>
                <option className="bg-[#fff9ed] text-[#171411]" value="newest">
                  New Releases
                </option>
                <option className="bg-[#fff9ed] text-[#171411]" value="price-asc">
                  Price Low
                </option>
                <option className="bg-[#fff9ed] text-[#171411]" value="price-desc">
                  Price High
                </option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 h-3.5 w-3.5" />
            </label>
            <label className="flex h-12 min-w-0 items-center border-b-2 border-black bg-[#f6edd8] text-[#171411] lg:border-r-2 lg:border-b-0">
              <span className="sr-only">Search the store</span>
              <input
                className="h-full min-w-0 flex-1 bg-transparent px-4 text-[11px] font-black text-[#171411] uppercase outline-none placeholder:text-[#655f58]"
                placeholder="Search the store"
                value={storeSearch}
                onChange={(event) => {
                  setActiveTab("browse");
                  setStoreSearch(event.target.value);
                }}
              />
              <Search className="mr-3 h-4 w-4 text-[#b7102a]" />
            </label>
            <button
              className={`flex h-12 items-center justify-center gap-2 px-4 ${
                activeTab === "wishlist" ? "bg-[#b7102a] text-white" : "bg-[#087d6d] text-white"
              }`}
              type="button"
              onClick={() => setActiveTab("wishlist")}
            >
              <Heart className="h-4 w-4 fill-current" />
              Wishlist {wishlistGames.length}
            </button>
          </div>
        </nav>

        <div className="hero-art relative min-h-[420px] overflow-hidden border-4 border-black shadow-[5px_5px_0_#171411] sm:min-h-[340px] sm:shadow-[6px_6px_0_#171411]">
          {selectedProduct?.coverImageUrl ? (
            <img
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              src={selectedProduct.coverImageUrl}
            />
          ) : null}
          <div className="absolute inset-0 bg-black/55" />
          <div className="absolute inset-x-0 top-0 h-24 bg-black/35" />
          <div className="neo-dots-ink relative m-4 flex min-h-[330px] items-center border-l-4 border-[#c20b2f] p-5 sm:m-6 sm:min-h-[280px] sm:p-9">
            <div className="max-w-[590px]">
              <h1 className="neo-title text-[3.25rem] leading-none text-[#fffaf0] sm:text-[4rem] lg:text-[4.5rem]">
                {selectedProduct?.title ?? "Store Desk"}
              </h1>
              <p className="mt-4 max-w-[560px] text-base leading-7 text-[#fffaf0] sm:text-lg">
                {selectedProduct
                  ? selectedProduct.description || "No product description has been published."
                  : catalogSource === "loading"
                    ? "Loading published products from the hosted catalog."
                    : catalogSource === "error"
                      ? "The hosted catalog could not be loaded. No local product data is substituted."
                      : "No published products are currently available."}
              </p>
              <div className="mt-8 grid gap-3 sm:flex sm:flex-wrap sm:items-center sm:gap-5">
                <button
                  className="neo-copy flex h-12 items-center justify-center gap-3 border-2 border-black bg-[#c20b2f] px-5 text-xs font-bold text-[#fffaf0] uppercase shadow-[4px_4px_0_#171411] disabled:opacity-50 sm:px-7"
                  type="button"
                  disabled={
                    !commerceEnabled ||
                    !selectedProduct ||
                    selectedProductOwned ||
                    purchaseActionsDisabled
                  }
                  onClick={() => {
                    if (selectedProduct) buyNow(selectedProduct.id);
                  }}
                >
                  <Play className="h-4 w-4 fill-current" />
                  {!selectedProduct
                    ? catalogSource === "loading"
                      ? "Store Loading"
                      : "Unavailable"
                    : selectedProductOwned
                      ? "Owned"
                      : selectedProduct
                        ? `${selectedProduct.isFree ? "Claim" : "Buy Now"} - ${formatStorePrice(
                            selectedProduct,
                          )}`
                        : "Unavailable"}
                </button>
                <button
                  className="neo-copy h-12 border-2 border-[#fffaf0] bg-black/35 px-5 text-xs font-bold text-[#fffaf0] uppercase disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!heroTrailerUrl}
                  type="button"
                  onClick={handleOpenHeroTrailer}
                >
                  {heroTrailerUrl ? "Watch Trailer" : "Trailer Unavailable"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <section
          aria-label="Store discovery controls"
          className="border-[3px] border-black bg-[#fff9ed] p-3 shadow-[4px_4px_0_#171411]"
        >
          <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
            <div>
              <div className="flex flex-col gap-3 border-b-2 border-black pb-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="neo-copy text-[10px] font-black tracking-[0.14em] text-[#b7102a] uppercase">
                    Discovery Queue
                  </p>
                  <h2 className="neo-title text-3xl leading-none text-[#171411]">
                    Browse The Store
                  </h2>
                </div>
                <div className="neo-copy grid grid-cols-2 gap-2 text-[10px] font-black tracking-[0.1em] uppercase sm:flex">
                  {[
                    {
                      icon: <Sparkles className="h-3.5 w-3.5" />,
                      label: "Discover",
                      tab: "browse" as const,
                    },
                    {
                      icon: <Heart className="h-3.5 w-3.5" />,
                      label: "Wishlist",
                      tab: "wishlist" as const,
                    },
                    {
                      icon: <ShoppingCart className="h-3.5 w-3.5" />,
                      label: "Cart",
                      tab: "cart" as const,
                    },
                    {
                      icon: <ReceiptText className="h-3.5 w-3.5" />,
                      label: "Orders",
                      tab: "orders" as const,
                    },
                  ].map((item) => (
                    <button
                      className={`flex items-center justify-center gap-2 border-2 border-black px-3 py-2 shadow-[2px_2px_0_#171411] ${
                        activeTab === item.tab
                          ? "bg-[#171411] text-[#fff9ed]"
                          : "bg-[#f6edd8] text-[#171411]"
                      }`}
                      key={item.label}
                      type="button"
                      onClick={() => setActiveTab(item.tab)}
                    >
                      {item.icon}
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_180px_170px]">
                <label className="neo-copy block border-2 border-black bg-[#f6edd8] p-2 text-[10px] font-black tracking-[0.1em] text-[#171411] uppercase shadow-[2px_2px_0_#171411]">
                  <span className="flex items-center gap-2 text-[#b7102a]">
                    <Search className="h-4 w-4" />
                    Search
                  </span>
                  <input
                    className="mt-2 h-10 w-full border-2 border-black bg-[#fff9ed] px-3 text-[12px] font-black text-[#171411] uppercase outline-none"
                    placeholder="Find games, tags, studios"
                    value={storeSearch}
                    onChange={(event) => setStoreSearch(event.target.value)}
                  />
                </label>
                <label className="neo-copy block border-2 border-black bg-[#f6edd8] p-2 text-[10px] font-black tracking-[0.1em] text-[#171411] uppercase shadow-[2px_2px_0_#171411]">
                  <span className="flex items-center gap-2 text-[#b7102a]">
                    <Tags className="h-4 w-4" />
                    Genre
                  </span>
                  <select
                    className="mt-2 h-10 w-full border-2 border-black bg-[#fff9ed] px-2 text-[11px] font-black text-[#171411] uppercase"
                    value={selectedGenre}
                    onChange={(event) => setSelectedGenre(event.target.value)}
                  >
                    <option value="all">All Genres</option>
                    {availableGenres.map((genre) => (
                      <option key={genre} value={genre}>
                        {genre}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="neo-copy block border-2 border-black bg-[#f6edd8] p-2 text-[10px] font-black tracking-[0.1em] text-[#171411] uppercase shadow-[2px_2px_0_#171411]">
                  <span className="flex items-center gap-2 text-[#b7102a]">
                    <SlidersHorizontal className="h-4 w-4" />
                    Price
                  </span>
                  <select
                    className="mt-2 h-10 w-full border-2 border-black bg-[#fff9ed] px-2 text-[11px] font-black text-[#171411] uppercase"
                    value={priceFilter}
                    onChange={(event) => setPriceFilter(event.target.value as StorePriceFilter)}
                  >
                    <option value="all">Any Price</option>
                    <option value="discounts">Specials</option>
                    <option value="free">Free</option>
                    <option value="under-15">Under 15</option>
                  </select>
                </label>
                <label className="neo-copy block border-2 border-black bg-[#f6edd8] p-2 text-[10px] font-black tracking-[0.1em] text-[#171411] uppercase shadow-[2px_2px_0_#171411]">
                  <span className="flex items-center gap-2 text-[#b7102a]">
                    <Trophy className="h-4 w-4" />
                    Sort
                  </span>
                  <select
                    className="mt-2 h-10 w-full border-2 border-black bg-[#fff9ed] px-2 text-[11px] font-black text-[#171411] uppercase"
                    value={sortMode}
                    onChange={(event) => setSortMode(event.target.value as StoreSortMode)}
                  >
                    <option value="featured">Featured</option>
                    <option value="newest">New Releases</option>
                    <option value="discount">Discount</option>
                    <option value="price-asc">Price Low</option>
                    <option value="price-desc">Price High</option>
                  </select>
                </label>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {(["all", "windows", "linux", "macos"] as const).map((platform) => (
                  <button
                    className={`neo-copy border-2 border-black px-3 py-2 text-[10px] font-black tracking-[0.1em] uppercase shadow-[2px_2px_0_#171411] ${
                      selectedPlatform === platform
                        ? "bg-[#087d6d] text-white"
                        : "bg-[#fff9ed] text-[#171411]"
                    }`}
                    key={platform}
                    type="button"
                    onClick={() => setSelectedPlatform(platform)}
                  >
                    {platform === "all" ? "All Platforms" : platform}
                  </button>
                ))}
                <button
                  className="neo-copy border-2 border-black bg-[#171411] px-3 py-2 text-[10px] font-black tracking-[0.1em] text-[#fff9ed] uppercase shadow-[2px_2px_0_#171411]"
                  type="button"
                  onClick={resetStoreBrowseFilters}
                >
                  Reset {activeFilterCount > 0 ? `(${activeFilterCount})` : ""}
                </button>
              </div>
            </div>

            <div className="neo-dots border-2 border-black bg-[#f6edd8] p-3 shadow-[3px_3px_0_#171411]">
              <p className="neo-copy text-[10px] font-black tracking-[0.14em] text-[#b7102a] uppercase">
                Queue Slot
              </p>
              <p className="neo-title mt-1 text-3xl leading-none text-[#171411]">
                {selectedDiscoveryIndex >= 0 ? selectedDiscoveryIndex + 1 : 1}/
                {Math.max(discoveryGames.length, 1)}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  aria-label="Previous discovery game"
                  className="flex h-10 items-center justify-center border-2 border-black bg-[#fff9ed] text-[#171411] shadow-[2px_2px_0_#171411]"
                  type="button"
                  onClick={() => moveDiscoveryQueue(-1)}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  aria-label="Next discovery game"
                  className="flex h-10 items-center justify-center border-2 border-black bg-[#8cf5e4] text-[#171411] shadow-[2px_2px_0_#171411]"
                  type="button"
                  onClick={() => moveDiscoveryQueue(1)}
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
              <p className="neo-copy mt-3 border-2 border-black bg-[#fff9ed] p-2 text-[9px] leading-4 font-black tracking-[0.08em] text-[#655f58] uppercase">
                {filteredProducts.length} matches / {wishlistGames.length} wishlisted /{" "}
                {cartGames.length} cart
              </p>
            </div>
          </div>
        </section>

        {statusMessage ? (
          <div className="neo-copy border-[3px] border-black bg-[#8cf5e4] p-3 text-[11px] font-black tracking-[0.12em] text-[#171411] uppercase shadow-[4px_4px_0_#171411]">
            {statusMessage}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-4">
          <StoreMetric
            icon={<Tags className="h-4 w-4" />}
            label="Deals"
            value={products.filter((game) => game.discountPercent).length}
          />
          <StoreMetric
            icon={<Heart className="h-4 w-4" />}
            label="Wishlist"
            value={scopedWishlistIds.size}
          />
          <StoreMetric
            icon={<ShoppingCart className="h-4 w-4" />}
            label="Cart"
            value={cartGames.length}
            onClick={() => setIsCartDrawerOpen(true)}
          />
          <StoreMetric
            icon={<ReceiptText className="h-4 w-4" />}
            label="Orders"
            value={scopedOrders.length}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <StoreShelf
            games={specialOfferGames}
            icon={<Flame className="h-4 w-4" />}
            isProcessing={purchaseActionsDisabled}
            title="Special Offers"
            onBuyNow={buyNow}
            onSelect={setSelectedProductId}
          />
          <StoreShelf
            games={topSellerGames}
            icon={<Trophy className="h-4 w-4" />}
            isProcessing={purchaseActionsDisabled}
            title="Top Sellers"
            onBuyNow={buyNow}
            onSelect={setSelectedProductId}
          />
          <StoreShelf
            games={newReleaseGames}
            icon={<Clock className="h-4 w-4" />}
            isProcessing={purchaseActionsDisabled}
            title="New Releases"
            onBuyNow={buyNow}
            onSelect={setSelectedProductId}
          />
        </div>

        <CartDrawer
          cartGames={cartGames}
          commerceEnabled={commerceEnabled}
          isOpen={isCartDrawerOpen}
          isProcessing={purchaseActionsDisabled}
          total={cartTotal}
          onCheckout={() => completeCheckout()}
          onClose={() => setIsCartDrawerOpen(false)}
          onRemove={handleRemoveFromCart}
          onViewCart={() => {
            setActiveTab("cart");
            setIsCartDrawerOpen(false);
          }}
        />

        {selectedProduct ? (
          <>
            <ProductDetailPanel
              game={selectedProduct}
              storeProduct={selectedStoreProduct}
              isOwned={scopedOwnedIds.has(selectedProduct.id)}
              isWishlisted={scopedWishlistIds.has(selectedProduct.id)}
              isProcessing={purchaseActionsDisabled}
              onAddToCart={handleAddToCart}
              onBuyNow={buyNow}
              onToggleWishlist={toggleWishlist}
            />
            <StoreReviewsPanel
              body={reviewBody}
              canManageDeveloperReplies={canManageSelectedProductReplies}
              developerRepliesByReviewId={reviewRepliesByReviewId}
              developerReplyDrafts={developerReplyDrafts}
              developerReplySavingReviewId={developerReplySavingReviewId}
              game={selectedProduct}
              isOwned={scopedOwnedIds.has(selectedProduct.id)}
              isSignedIn={isStoreSignedIn}
              loading={reviewsLoading}
              rating={reviewRating}
              reportedReviewIds={reportedReviewIds}
              reportingReviewId={reportingReviewId}
              reportDetails={reviewReportDetails}
              reportReason={reviewReportReason}
              reportSaving={reviewReportSaving}
              reviews={reviews}
              saving={reviewSaving}
              title={reviewTitle}
              userReview={myReview}
              onBodyChange={setReviewBody}
              onCancelReport={() => setReportingReviewId(null)}
              onDeveloperReplyChange={(reviewId, value) =>
                setDeveloperReplyDrafts((current) => ({ ...current, [reviewId]: value }))
              }
              onDeveloperReplySubmit={handleSubmitDeveloperReply}
              onOpenReport={handleOpenReviewReport}
              onRatingChange={setReviewRating}
              onReportDetailsChange={setReviewReportDetails}
              onReportReasonChange={setReviewReportReason}
              onReportSubmit={handleSubmitReviewReport}
              onSubmit={handleSubmitReview}
              onTitleChange={setReviewTitle}
            />
          </>
        ) : null}

        <div>
          <div className="mb-6 flex flex-col gap-3 border-b-4 border-black pb-3 lg:flex-row lg:items-end lg:justify-between">
            <h2 className="neo-title bg-black px-4 pb-1 text-[2.6rem] leading-none text-[#fffaf0] sm:text-[3rem]">
              Browse Catalog
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
              commerceEnabled={commerceEnabled}
              total={cartTotal}
              isProcessing={purchaseActionsDisabled}
              onCheckout={() => completeCheckout()}
              onRemove={handleRemoveFromCart}
            />
          ) : activeTab === "orders" ? (
            <StoreOrderPanel
              downloadPreparingLicenseId={downloadPreparingLicenseId}
              invoiceSyncingOrderId={invoiceSyncingOrderId}
              licenses={scopedLicenses}
              licenseToken={licenseToken}
              loading={isStripeLiveStagingContractVerify ? false : ordersLoading}
              invoices={visibleOrderInvoices}
              orderItemsByOrderId={visibleOrderItemsByOrderId}
              orders={visibleOrders}
              refundDetails={refundDetails}
              refundDraftOrderId={refundDraftOrderId}
              refundReason={refundReason}
              refundRequests={visibleRefundRequests}
              refundSavingOrderId={refundSavingOrderId}
              validationResults={licenseValidationResults}
              validatingLicenseKey={validatingLicenseKey}
              onCancelRefund={() => setRefundDraftOrderId(null)}
              onDownloadLicense={handleDownloadLicense}
              onRefundDetailsChange={setRefundDetails}
              onRefundReasonChange={setRefundReason}
              onRefundSubmit={handleRequestRefund}
              onSyncInvoice={handleSyncInvoice}
              onStartRefund={(orderId) => {
                setRefundDraftOrderId(orderId);
                setRefundReason(STORE_REFUND_REASON_OPTIONS[0].value);
                setRefundDetails("");
              }}
              onLicenseTokenChange={setLicenseToken}
              onValidateLicense={handleValidateLicense}
            />
          ) : activeGames.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {activeGames.map((game) => (
                <StoreGameCard
                  key={game.id}
                  game={game}
                  isAdded={scopedOwnedIds.has(game.id)}
                  isInCart={scopedCartIds.has(game.id)}
                  isProcessing={purchaseActionsDisabled}
                  isWishlisted={scopedWishlistIds.has(game.id)}
                  onAddToCart={handleAddToCart}
                  onBuyNow={buyNow}
                  onToggleWishlist={toggleWishlist}
                  onViewDetails={setSelectedProductId}
                />
              ))}
            </div>
          ) : (
            <EmptyStorePanel
              label={
                activeTab === "wishlist"
                  ? "No wishlist matches yet."
                  : catalogSource === "loading"
                    ? "Loading the hosted catalog."
                    : catalogSource === "error"
                      ? "The hosted catalog could not be loaded. No local products are shown."
                      : catalogSource === "empty"
                        ? "No published products are currently available."
                        : "No games match filters."
              }
            />
          )}
        </div>
      </section>
    </div>
  );
}

function StoreShelf({
  games,
  icon,
  isProcessing,
  title,
  onBuyNow,
  onSelect,
}: {
  games: StoreGame[];
  icon: ReactNode;
  isProcessing: boolean;
  title: string;
  onBuyNow: (gameId: string) => void;
  onSelect: (gameId: string) => void;
}) {
  return (
    <section
      aria-label={title}
      className="border-[3px] border-black bg-[#fff9ed] p-3 shadow-[4px_4px_0_#171411]"
    >
      <div className="flex items-center justify-between gap-3 border-b-2 border-black pb-2">
        <div>
          <p className="neo-copy flex items-center gap-2 text-[10px] font-black tracking-[0.12em] text-[#b7102a] uppercase">
            {icon}
            Store Rail
          </p>
          <h2 className="neo-title text-2xl leading-none text-[#171411]">{title}</h2>
        </div>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[10px] font-black text-[#171411] uppercase">
          {games.length}
        </span>
      </div>
      <div className="mt-3 grid gap-2">
        {games.length > 0 ? (
          games.map((game) => (
            <article
              className="grid grid-cols-[70px_minmax(0,1fr)] gap-3 border-2 border-black bg-[#f6edd8] p-2 shadow-[2px_2px_0_#171411]"
              key={`${title}-${game.id}`}
            >
              <button
                aria-label={`View ${game.title}`}
                className="relative min-h-16 overflow-hidden border-2 border-black bg-[#171411]"
                type="button"
                onClick={() => onSelect(game.id)}
              >
                {game.coverImageUrl ? (
                  <img
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    src={game.coverImageUrl}
                  />
                ) : (
                  <span className="neo-copy grid h-full min-h-16 place-items-center bg-[#efe6d4] p-1 text-[8px] font-black text-[#655f58] uppercase">
                    No cover
                  </span>
                )}
              </button>
              <div className="min-w-0">
                <button
                  className="block max-w-full text-left"
                  type="button"
                  onClick={() => onSelect(game.id)}
                >
                  <span className="neo-title block truncate text-xl leading-none text-[#171411]">
                    {game.title}
                  </span>
                </button>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(game.genres ?? [game.tagLine]).slice(0, 2).map((genre) => (
                    <span
                      className="neo-copy border border-black bg-[#fff9ed] px-1.5 py-0.5 text-[8px] font-black tracking-[0.08em] text-[#655f58] uppercase"
                      key={`${game.id}-${genre}`}
                    >
                      {genre}
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-lg font-black text-[#171411]">
                    {formatStorePrice(game)}
                  </span>
                  <button
                    className="neo-copy border-2 border-black bg-[#b7102a] px-2 py-1 text-[9px] font-black tracking-[0.08em] text-white uppercase shadow-[2px_2px_0_#171411] disabled:opacity-50"
                    type="button"
                    disabled={isProcessing}
                    onClick={() => onBuyNow(game.id)}
                  >
                    {game.isFree ? "Claim" : "Buy"}
                  </button>
                </div>
              </div>
            </article>
          ))
        ) : (
          <p className="neo-copy border-2 border-dashed border-black bg-[#f6edd8] p-3 text-[10px] leading-5 font-black text-[#655f58] uppercase">
            No catalog rows.
          </p>
        )}
      </div>
    </section>
  );
}
