import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Heart, Play, ReceiptText, ShoppingCart, Tags } from "lucide-react";
import { StoreGameCard } from "../components/launcher/StoreGameCard";
import { CartDrawer, CartPanel } from "../components/store/StoreCartPanels";
import { EmptyStorePanel } from "../components/store/EmptyStorePanel";
import { StoreOrderPanel } from "../components/store/StoreOrderPanel";
import { STORE_REFUND_REASON_OPTIONS } from "../components/store/storeOrderOptions";
import { ProductDetailPanel } from "../components/store/StoreProductDetailPanel";
import {
  CatalogSourceTape,
  PriceDropSchedulerReadinessPanel,
  StoreMetric,
} from "../components/store/StoreReadinessPanels";
import { StoreReviewsPanel } from "../components/store/StoreReviewsPanel";
import { storeGames } from "../lib/mock-data";
import { getSupabaseClient } from "../lib/supabase/client";
import {
  addToStoreWishlist,
  addToCart as addStoreCartItem,
  createStoreBuildDownloadTicket,
  getCartItems,
  getMyLicenses,
  getMyOrderByStripeSession,
  getMyStoreReview,
  getLatestStorePriceDropNotificationRunEvidence,
  getStoreProductPriceHistory,
  isTrustedStorePriceDropNotificationRunEvidence,
  listMyOrderItems,
  listMyStoreOrderInvoices,
  listMyStorePriceAlerts,
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
  removeStorePriceAlert,
  requestStoreOrderRefund,
  syncStoreOrderInvoice,
  upsertStorePriceAlert,
  upsertStoreReviewReply,
  upsertStoreReview,
  type StorePriceDropNotificationRunEvidence,
} from "../lib/supabase/store";
import { getLicenseDeviceId, validateLicense } from "../lib/launcher";
import { STORAGE_KEYS } from "../lib/storage-keys";
import { canSyncStoreInvoice, getStoreInvoiceStatusLabel } from "../lib/store-support";
import { getStorePriceDropSchedulerReadiness } from "../lib/store-price-drop-readiness";
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
  StorePricePoint,
  StoreProduct,
  StoreReview,
  StoreReviewReply,
  StoreReviewReport,
  StoreReviewReportReason,
  StoreRefundRequest,
} from "../lib/types/store";

type StoreTab = "browse" | "wishlist" | "cart" | "orders";
type StoreCatalogSource = "hosted" | "local-preview" | "empty" | "error";
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

function createPriceDropScheduledEvidenceVerifyRun(): StorePriceDropNotificationRunEvidence {
  return {
    alertsMarkedCount: 1,
    candidateCount: 2,
    completedAt: "2026-06-15T10:05:00.000Z",
    dryRun: false,
    limit: 500,
    notificationsRecordedCount: 1,
    requestedAlertCount: 0,
    requestedProductCount: 0,
    requestedUserCount: 0,
    runId: "price-drop-scheduled-fixture",
    scannedCount: 7,
    status: "completed",
    triggerSource: "scheduled",
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
    description: firstText(product.shortDescription, product.description, tagLine) ?? tagLine,
    price,
    originalPrice: product.discountPercent > 0 ? originalPrice : undefined,
    discountPercent: product.discountPercent || undefined,
    isFree: product.priceCents === 0,
    platform: product.platforms.filter(isPlatform),
    developer: product.publisher ?? undefined,
    releaseDate: product.releaseDate ?? undefined,
    genres: product.genres.length > 0 ? product.genres : undefined,
    tagLine,
  };
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

function readStringField(row: Record<string, unknown>, key: string, fallback = "") {
  const value = row[key];
  return typeof value === "string" ? value : fallback;
}

function readNumberField(row: Record<string, unknown>, key: string, fallback = 0) {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readOrderStatus(row: Record<string, unknown>): StoreOrder["status"] {
  const value = readStringField(row, "status");
  return ["pending", "paid", "fulfilled", "refunded", "failed", "expired"].includes(value)
    ? (value as StoreOrder["status"])
    : "pending";
}

function normalizeStoredOrder(row: unknown): StoreOrder | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return null;
  }

  const order = row as Record<string, unknown>;
  const id = readStringField(order, "id");
  if (!id) {
    return null;
  }

  return {
    id,
    userId: readStringField(order, "userId", readStringField(order, "user_id")),
    stripeSessionId:
      readStringField(order, "stripeSessionId", readStringField(order, "stripe_session_id")) ||
      null,
    stripePaymentIntent:
      readStringField(
        order,
        "stripePaymentIntent",
        readStringField(order, "stripe_payment_intent"),
      ) || null,
    subtotalCents: readNumberField(
      order,
      "subtotalCents",
      readNumberField(order, "subtotal_cents"),
    ),
    taxCents: readNumberField(order, "taxCents", readNumberField(order, "tax_cents")),
    totalCents: readNumberField(order, "totalCents", readNumberField(order, "total_cents")),
    currency: readStringField(order, "currency", "eur"),
    status: readOrderStatus(order),
    paymentMethod:
      readStringField(order, "paymentMethod", readStringField(order, "payment_method")) || null,
    paidAt: readStringField(order, "paidAt", readStringField(order, "paid_at")) || null,
    createdAt: readStringField(order, "createdAt", readStringField(order, "created_at")) || id,
    updatedAt: readStringField(order, "updatedAt", readStringField(order, "updated_at")) || id,
  };
}

function readLocalOrders() {
  try {
    const value = localStorage.getItem(ordersKey);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed)
      ? parsed.map(normalizeStoredOrder).filter((order): order is StoreOrder => order !== null)
      : [];
  } catch {
    return [];
  }
}

function formatStorePrice(game: StoreGame) {
  return game.isFree || game.price <= 0 ? "Free" : formatCurrency(game.price);
}

function catalogSourceLabel(source: StoreCatalogSource) {
  switch (source) {
    case "hosted":
      return "Hosted Catalog";
    case "empty":
      return "Hosted Empty";
    case "error":
      return "Hosted Error";
    case "local-preview":
      return "Local Preview";
  }
}

function heroAccentLabel(game: StoreGame) {
  if (game.discountPercent) return `${game.discountPercent}% Off`;
  if (game.isFree || game.price <= 0) return "Free";
  return "Featured";
}

function heroGenreLabel(game: StoreGame) {
  return game.genres?.[0] ?? game.tagLine.split("/")[0]?.trim() ?? "Store";
}

function indexDeveloperReplyDrafts(replies: StoreReviewReply[]) {
  return replies.reduce<Record<string, string>>((drafts, reply) => {
    drafts[reply.reviewId] = reply.body;
    return drafts;
  }, {});
}

export function StorePage() {
  const [activeTab, setActiveTab] = useState<StoreTab>("browse");
  const [ownedIds, setOwnedIds] = useState<Set<string>>(() => new Set(readStringArray(ownedKey)));
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(
    () => new Set(readStringArray(wishlistKey)),
  );
  const [cartIds, setCartIds] = useState<Set<string>>(() => new Set(readStringArray(cartKey)));
  const [priceAlerts, setPriceAlerts] = useState<Record<string, number>>(readPriceAlerts);
  const [remotePriceAlertIds, setRemotePriceAlertIds] = useState<Set<string>>(() => new Set());
  const [priceDropNotificationRunEvidence, setPriceDropNotificationRunEvidence] =
    useState<StorePriceDropNotificationRunEvidence | null>(null);
  const [orders, setOrders] = useState<StoreOrder[]>(readLocalOrders);
  const [orderItemsByOrderId, setOrderItemsByOrderId] = useState<Record<string, StoreOrderItem[]>>(
    {},
  );
  const [refundRequests, setRefundRequests] = useState<StoreRefundRequest[]>([]);
  const [orderInvoices, setOrderInvoices] = useState<StoreOrderInvoice[]>([]);
  const [licenses, setLicenses] = useState<StoreLicense[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const isPriceDropScheduledEvidenceVerify =
    searchParams.get("verify") === "price-drop-scheduled-evidence";
  const isStripeLiveStagingContractVerify =
    searchParams.get("verify") === "stripe-live-staging-contract";
  const [isProcessing, setIsProcessing] = useState(false);
  const [products, setProducts] = useState<StoreGame[]>(storeGames);
  const [storeProducts, setStoreProducts] = useState<StoreProduct[]>([]);
  const [catalogSource, setCatalogSource] = useState<StoreCatalogSource>("local-preview");
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState(storeGames[0]?.id ?? null);
  const [isStoreSignedIn, setIsStoreSignedIn] = useState(false);
  const [storeUserId, setStoreUserId] = useState<string | null>(null);
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
  const [priceHistory, setPriceHistory] = useState<StorePricePoint[]>([]);
  const [priceHistoryLoading, setPriceHistoryLoading] = useState(false);
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

  const refreshStorePurchaseState = useCallback(async () => {
    const [remoteOrders, remoteRefundRequests, remoteInvoices, latestLicenses, cartItems] =
      await Promise.all([
        listMyOrders(),
        listMyStoreRefundRequests(),
        listMyStoreOrderInvoices(),
        getMyLicenses(),
        getCartItems(),
      ]);

    setOrders(remoteOrders.length > 0 ? remoteOrders : readLocalOrders());
    setRefundRequests(remoteRefundRequests);
    setOrderInvoices(remoteInvoices);
    setLicenses(latestLicenses);
    setCartIds(new Set(cartItems.map((item) => item.productId)));
    if (latestLicenses.length > 0) {
      setOwnedIds((current) => {
        const next = new Set(current);
        for (const license of latestLicenses) {
          next.add(license.productId);
        }
        return next;
      });
    }

    return remoteOrders;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      try {
        const publishedProducts = await listPublishedProducts();

        if (cancelled) return;

        if (publishedProducts.length === 0) {
          setStoreProducts([]);
          setProducts(storeGames);
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
          setProducts(storeGames);
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

    async function loadUserStoreState() {
      try {
        const {
          data: { user },
        } = await getSupabaseClient().auth.getUser();
        if (cancelled) return;

        setIsStoreSignedIn(Boolean(user));
        setStoreUserId(user?.id ?? null);
        if (!user) {
          setLicenses([]);
          setRemotePriceAlertIds(new Set());
          setPriceDropNotificationRunEvidence(null);
          return;
        }

        const [cartItems, licenses, wishlistItems, remotePriceAlerts, latestPriceDropRunEvidence] =
          await Promise.all([
            getCartItems(),
            getMyLicenses(),
            listMyStoreWishlist(),
            listMyStorePriceAlerts(),
            getLatestStorePriceDropNotificationRunEvidence(),
          ]);
        if (cancelled) return;

        setLicenses(licenses);
        setPriceDropNotificationRunEvidence(latestPriceDropRunEvidence);
        setRemotePriceAlertIds(
          new Set(
            remotePriceAlerts
              .filter(
                (alert) => alert.isActive && alert.targetPriceCents > 0 && isUuid(alert.productId),
              )
              .map((alert) => alert.productId),
          ),
        );

        if (cartItems.length > 0) {
          setCartIds(new Set(cartItems.map((item) => item.productId)));
        }

        if (wishlistItems.length > 0) {
          setWishlistIds((current) => {
            const next = new Set(current);
            for (const item of wishlistItems) {
              next.add(item.productId);
            }
            return next;
          });
        }

        if (remotePriceAlerts.length > 0) {
          setPriceAlerts((current) => {
            const next = { ...current };
            for (const alert of remotePriceAlerts) {
              next[alert.productId] = alert.targetPriceCents / 100;
            }
            return next;
          });
        }

        if (licenses.length > 0) {
          setOwnedIds((current) => {
            const next = new Set(current);
            for (const license of licenses) {
              next.add(license.productId);
            }
            return next;
          });
        }
      } catch (error) {
        if (!cancelled) {
          setIsStoreSignedIn(false);
          setStoreUserId(null);
          setLicenses([]);
          setRemotePriceAlertIds(new Set());
          setPriceDropNotificationRunEvidence(null);
          setStatusMessage(
            error instanceof Error
              ? `Store account sync unavailable: ${error.message}`
              : "Store account sync unavailable.",
          );
        }
      }
    }

    loadUserStoreState();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadOrders() {
      setOrdersLoading(true);
      try {
        const [remoteOrders, remoteRefundRequests, remoteInvoices] = await Promise.all([
          listMyOrders(),
          listMyStoreRefundRequests(),
          listMyStoreOrderInvoices(),
        ]);

        if (cancelled) return;

        if (remoteOrders.length === 0) {
          setOrders(readLocalOrders());
        } else {
          setOrders(remoteOrders);
        }
        setRefundRequests(remoteRefundRequests);
        setOrderInvoices(remoteInvoices);
      } catch {
        if (!cancelled) {
          setOrders(readLocalOrders());
          setRefundRequests([]);
          setOrderInvoices([]);
        }
      } finally {
        if (!cancelled) setOrdersLoading(false);
      }
    }

    loadOrders();
    return () => {
      cancelled = true;
    };
  }, []);

  const wishlistGames = useMemo(
    () => products.filter((game) => wishlistIds.has(game.id)),
    [wishlistIds, products],
  );
  const cartGames = useMemo(
    () => products.filter((game) => cartIds.has(game.id) && !ownedIds.has(game.id)),
    [cartIds, ownedIds, products],
  );
  const cartTotal = cartGames.reduce((total, game) => total + game.price, 0);
  const activeGames = activeTab === "wishlist" ? wishlistGames : products;
  const activePriceAlertHits = products.filter((game) => {
    const alertPrice = priceAlerts[game.id];
    return typeof alertPrice === "number" && game.price <= alertPrice;
  });
  const activeLocalPriceAlertCount = Object.values(priceAlerts).filter(
    (value) => typeof value === "number" && Number.isFinite(value) && value > 0,
  ).length;
  const activeRemotePriceAlertCount = remotePriceAlertIds.size;
  const effectiveRemotePriceAlertCount = isPriceDropScheduledEvidenceVerify
    ? Math.max(activeRemotePriceAlertCount, 1)
    : activeRemotePriceAlertCount;
  const effectiveStoreSignedIn = isStoreSignedIn || isPriceDropScheduledEvidenceVerify;
  const priceDropScheduledEvidenceVerifyRun = useMemo(
    createPriceDropScheduledEvidenceVerifyRun,
    [],
  );
  const visiblePriceDropRunEvidence =
    isPriceDropScheduledEvidenceVerify && !priceDropNotificationRunEvidence
      ? priceDropScheduledEvidenceVerifyRun
      : priceDropNotificationRunEvidence;
  const stripeLiveStagingVerifyState = useMemo(createStripeLiveStagingVerifyState, []);
  const visibleOrders = isStripeLiveStagingContractVerify
    ? stripeLiveStagingVerifyState.orders
    : orders;
  const visibleOrderInvoices = isStripeLiveStagingContractVerify
    ? stripeLiveStagingVerifyState.invoices
    : orderInvoices;
  const visibleRefundRequests = isStripeLiveStagingContractVerify
    ? stripeLiveStagingVerifyState.refundRequests
    : refundRequests;
  const visibleOrderItemsByOrderId = isStripeLiveStagingContractVerify
    ? stripeLiveStagingVerifyState.orderItemsByOrderId
    : orderItemsByOrderId;
  const hasTrustedPriceDropEvidence =
    !isPriceDropScheduledEvidenceVerify &&
    isTrustedStorePriceDropNotificationRunEvidence(visiblePriceDropRunEvidence);
  const priceDropSchedulerReadiness = useMemo(
    () =>
      getStorePriceDropSchedulerReadiness({
        hostedRunEvidence: visiblePriceDropRunEvidence,
        localAlertCount: activeLocalPriceAlertCount,
        remoteAlertCount: effectiveRemotePriceAlertCount,
        isSignedIn: effectiveStoreSignedIn,
        trustedEvidence: hasTrustedPriceDropEvidence,
      }),
    [
      activeLocalPriceAlertCount,
      effectiveRemotePriceAlertCount,
      effectiveStoreSignedIn,
      hasTrustedPriceDropEvidence,
      visiblePriceDropRunEvidence,
    ],
  );
  const selectedProduct =
    products.find((game) => game.id === selectedProductId) ?? products[0] ?? null;
  const selectedStoreProduct =
    selectedProduct === null
      ? null
      : (storeProducts.find((product) => product.id === selectedProduct.id) ?? null);
  const selectedProductOwned = selectedProduct ? ownedIds.has(selectedProduct.id) : false;
  const heroTrailerUrl = firstText(selectedStoreProduct?.trailerUrl) ?? null;
  const canManageSelectedProductReplies =
    Boolean(storeUserId && selectedStoreProduct?.developerId === storeUserId) &&
    Boolean(selectedProduct && isUuid(selectedProduct.id));
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
      setPriceHistory([]);
      setPriceHistoryLoading(false);
      return;
    }

    let cancelled = false;

    async function loadPriceHistory() {
      setPriceHistoryLoading(true);
      try {
        const history = await getStoreProductPriceHistory(selectedProduct.id);
        if (!cancelled) setPriceHistory(history);
      } catch {
        if (!cancelled) setPriceHistory([]);
      } finally {
        if (!cancelled) setPriceHistoryLoading(false);
      }
    }

    loadPriceHistory();
    return () => {
      cancelled = true;
    };
  }, [selectedProduct]);

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
  }, [selectedProduct]);

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
    if (!sessionId) return;
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
        } else if (order.status === "fulfilled" || order.status === "paid") {
          setStatusMessage("Checkout confirmed. Licenses and downloads are unlocked.");
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
  }, [refreshStorePurchaseState, searchParams, setSearchParams]);

  useEffect(() => {
    const orderIds = orders.map((order) => order.id).filter(isUuid);
    if (orderIds.length === 0) {
      setOrderItemsByOrderId({});
      return;
    }

    let cancelled = false;
    async function loadOrderItems() {
      try {
        const entries = await Promise.all(
          orderIds.map(async (orderId) => [orderId, await listMyOrderItems(orderId)] as const),
        );
        if (!cancelled) {
          setOrderItemsByOrderId(Object.fromEntries(entries));
        }
      } catch {
        if (!cancelled) setOrderItemsByOrderId({});
      }
    }

    void loadOrderItems();
    return () => {
      cancelled = true;
    };
  }, [orders]);

  useEffect(() => {
    const slug = searchParams.get("slug");
    if (!slug) return;

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
  }, [searchParams, setSearchParams, setStatusMessage, products]);

  async function toggleWishlist(gameId: string) {
    const wasWishlisted = wishlistIds.has(gameId);

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

    if (!isStoreSignedIn || !isUuid(gameId)) {
      return;
    }

    try {
      if (wasWishlisted) {
        await removeFromStoreWishlist(gameId);
        setStatusMessage("Wishlist removed and synced.");
      } else {
        await addToStoreWishlist(gameId);
        setStatusMessage("Wishlist saved and synced.");
      }
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? `${
              wasWishlisted ? "Removed locally" : "Added locally"
            }. Store wishlist sync failed: ${error.message}`
          : `${wasWishlisted ? "Removed locally" : "Added locally"}. Store wishlist sync failed.`,
      );
    }
  }

  async function handleAddToCart(gameId: string) {
    if (ownedIds.has(gameId)) {
      setStatusMessage("This game is already owned.");
      return;
    }

    setCartIds((current) => new Set(current).add(gameId));
    setIsCartDrawerOpen(true);
    try {
      await addStoreCartItem(gameId);
      setStatusMessage("Added to cart.");
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? `Added locally. Store cart sync failed: ${error.message}`
          : "Added locally. Store cart sync failed.",
      );
    }
  }

  async function handleRemoveFromCart(gameId: string) {
    setCartIds((current) => {
      const next = new Set(current);
      next.delete(gameId);
      return next;
    });

    try {
      await removeStoreCartItem(gameId);
      setStatusMessage("Removed from cart.");
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? `Removed locally. Store cart sync failed: ${error.message}`
          : "Removed locally. Store cart sync failed.",
      );
    }
  }

  async function startCheckout(productIds: string[]) {
    setIsProcessing(true);
    try {
      const licenseDeviceId = await getLicenseDeviceId().catch(() => null);
      const { data, error } = await getSupabaseClient().functions.invoke<CheckoutResponse>(
        "stripe-create-checkout",
        {
          body: {
            product_ids: productIds,
            checkout_attempt_id: createCheckoutAttemptId(),
            ...(licenseDeviceId ? { device_id: licenseDeviceId } : {}),
            success_url:
              window.location.origin + "/store?tab=orders&session_id={CHECKOUT_SESSION_ID}",
            cancel_url: window.location.origin + "/store?tab=browse",
          },
        },
      );

      if (error) {
        setStatusMessage(error.message);
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
        return;
      }

      if (data?.status === "fulfilled") {
        await refreshStorePurchaseState().catch(() => []);
        setOwnedIds((current) => {
          const next = new Set(current);
          productIds.forEach((productId) => next.add(productId));
          return next;
        });
        setCartIds((current) => {
          const next = new Set(current);
          productIds.forEach((productId) => next.delete(productId));
          return next;
        });
        setStatusMessage("Free checkout completed. Added to your library.");
      } else {
        setStatusMessage("Checkout session created but no URL was returned.");
      }
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "Checkout failed.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function buyNow(gameId: string) {
    if (ownedIds.has(gameId)) {
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
    const purchasableIds = gameIds.filter((gameId) => !ownedIds.has(gameId));
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

  async function setPriceAlert(gameId: string, value: number | null) {
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

    if (!isStoreSignedIn || !isUuid(gameId)) {
      return;
    }

    try {
      if (value === null) {
        await removeStorePriceAlert(gameId);
        setRemotePriceAlertIds((current) => {
          const next = new Set(current);
          next.delete(gameId);
          return next;
        });
        setStatusMessage("Price alert cleared and synced.");
      } else {
        await upsertStorePriceAlert(gameId, Math.round(value * 100));
        setRemotePriceAlertIds((current) => {
          const next = new Set(current);
          next.add(gameId);
          return next;
        });
        setStatusMessage("Price alert saved and synced.");
      }
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? `${
              value === null ? "Cleared locally" : "Saved locally"
            }. Store price alert sync failed: ${error.message}`
          : `${value === null ? "Cleared locally" : "Saved locally"}. Store price alert sync failed.`,
      );
    }
  }

  async function handleSubmitReview(gameId: string) {
    if (!ownedIds.has(gameId)) {
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
    const order = orders.find((item) => item.id === orderId);
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
          orderItemsByOrderId[orderId]?.map((item) => item.productId) ?? [];
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
    const order = orders.find((item) => item.id === orderId);
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

  return (
    <div className="min-h-[600px]">
      <section className="space-y-7">
        <div className="hero-art relative min-h-[420px] overflow-hidden border-4 border-black shadow-[5px_5px_0_#171411] sm:min-h-[340px] sm:shadow-[6px_6px_0_#171411]">
          <div className="absolute inset-x-0 top-0 h-24 bg-black/35" />
          <div className="neo-dots-ink relative m-4 flex min-h-[330px] items-center border-l-4 border-[#c20b2f] p-5 sm:m-6 sm:min-h-[280px] sm:p-9">
            <div className="max-w-[590px]">
              <div className="neo-copy flex flex-wrap gap-2 text-[11px] font-bold uppercase">
                <span className="border-2 border-[#c20b2f] bg-[#fff9ed] px-3 py-1 text-[#c20b2f]">
                  {selectedProduct ? heroAccentLabel(selectedProduct) : "Store"}
                </span>
                <span className="border-2 border-[#087d6d] bg-[#fff9ed] px-3 py-1 text-[#087d6d]">
                  {selectedProduct ? heroGenreLabel(selectedProduct) : "Catalog"}
                </span>
                <span className="border-2 border-black bg-[#fff9ed] px-3 py-1 text-[#171411]">
                  {catalogSourceLabel(catalogSource)}
                </span>
              </div>
              <h1 className="neo-title mt-4 text-[3.25rem] leading-none text-[#fffaf0] sm:text-[4rem] lg:text-[4.5rem]">
                {selectedProduct?.title ?? "Store Desk"}
              </h1>
              <p className="mt-4 max-w-[560px] text-base leading-7 text-[#fffaf0] sm:text-lg">
                {selectedProduct
                  ? selectedProduct.description
                  : "Store catalog is still loading. Local preview fixtures stay labelled until hosted products arrive."}
              </p>
              <div className="mt-8 grid gap-3 sm:flex sm:flex-wrap sm:items-center sm:gap-5">
                <button
                  className="neo-copy flex h-12 items-center justify-center gap-3 border-2 border-black bg-[#c20b2f] px-5 text-xs font-bold uppercase text-[#fffaf0] shadow-[4px_4px_0_#171411] disabled:opacity-50 sm:px-7"
                  type="button"
                  disabled={!selectedProduct || selectedProductOwned || isProcessing}
                  onClick={() => {
                    if (selectedProduct) buyNow(selectedProduct.id);
                  }}
                >
                  <Play className="h-4 w-4 fill-current" />
                  {selectedProductOwned
                    ? "Owned"
                    : selectedProduct
                      ? `${selectedProduct.isFree ? "Claim" : "Buy Now"} - ${formatStorePrice(
                          selectedProduct,
                        )}`
                      : "Store Loading"}
                </button>
                <button
                  className="neo-copy h-12 border-2 border-[#fffaf0] bg-black/35 px-5 text-xs font-bold uppercase text-[#fffaf0] disabled:cursor-not-allowed disabled:opacity-60"
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

        <CatalogSourceTape productCount={products.length} source={catalogSource} />

        {statusMessage ? (
          <div className="neo-copy border-[3px] border-black bg-[#8cf5e4] p-3 text-[11px] font-black uppercase tracking-[0.12em] text-[#171411] shadow-[4px_4px_0_#171411]">
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
            value={wishlistIds.size}
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
            value={orders.length}
          />
        </div>

        {activePriceAlertHits.length > 0 ? (
          <div className="border-4 border-black bg-[#8cf5e4] p-4 shadow-[5px_5px_0_#171411]">
            <h2 className="neo-title text-3xl leading-none text-[#171411]">Price Alerts</h2>
            <p className="neo-copy mt-2 text-[11px] font-black uppercase leading-5 text-[#171411]">
              {activePriceAlertHits.map((game) => game.title).join(", ")} reached your target price.
            </p>
          </div>
        ) : null}

        <PriceDropSchedulerReadinessPanel readiness={priceDropSchedulerReadiness} />

        <CartDrawer
          cartGames={cartGames}
          isOpen={isCartDrawerOpen}
          isProcessing={isProcessing}
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
              isOwned={ownedIds.has(selectedProduct.id)}
              isWishlisted={wishlistIds.has(selectedProduct.id)}
              isProcessing={isProcessing}
              priceHistory={priceHistory}
              priceHistoryLoading={priceHistoryLoading}
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
              isOwned={ownedIds.has(selectedProduct.id)}
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
              isProcessing={isProcessing}
              onCheckout={() => completeCheckout()}
              onRemove={handleRemoveFromCart}
            />
          ) : activeTab === "orders" ? (
            <StoreOrderPanel
              downloadPreparingLicenseId={downloadPreparingLicenseId}
              invoiceSyncingOrderId={invoiceSyncingOrderId}
              licenses={licenses}
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
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {activeGames.map((game) => (
                <StoreGameCard
                  key={game.id}
                  game={game}
                  isAdded={ownedIds.has(game.id)}
                  isInCart={cartIds.has(game.id)}
                  isWishlisted={wishlistIds.has(game.id)}
                  priceAlert={priceAlerts[game.id] ?? null}
                  onAddToCart={handleAddToCart}
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
  );
}
