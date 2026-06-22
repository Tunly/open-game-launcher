import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Flag,
  Heart,
  ShieldCheck,
  Play,
  ReceiptText,
  Send,
  ShoppingCart,
  Star,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { StoreGameCard } from "../components/launcher/StoreGameCard";
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
import {
  canSyncStoreInvoice,
  getStoreInvoiceStatusLabel,
  getStoreRefundProviderState,
  getStoreStripeStagingReadiness,
} from "../lib/store-support";
import {
  getStorePriceDropSchedulerReadiness,
  type StorePriceDropSchedulerReadiness,
} from "../lib/store-price-drop-readiness";
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "EUR",
    style: "currency",
  }).format(value);
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

function catalogSourceDetail(source: StoreCatalogSource) {
  switch (source) {
    case "hosted":
      return "Published Supabase products loaded. Buttons use the selected product ID and hosted price.";
    case "empty":
      return "Hosted catalog returned no published products. Showing local preview fixtures only.";
    case "error":
      return "Hosted catalog could not be loaded. Showing local preview fixtures only.";
    case "local-preview":
      return "Local preview fixtures are visible until hosted catalog data is available.";
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

function formatDateTime(value: string | null) {
  if (!value) return "Pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Pending";
  return date.toLocaleString();
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function formatPriceDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Now";
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

function effectivePriceCents(point: StorePricePoint) {
  const discountMultiplier = Math.max(0, 100 - point.discountPercent) / 100;
  return Math.round(point.priceCents * discountMultiplier);
}

const PRICE_AXIS_TICK_STYLE = {
  fill: "#171411",
  fontFamily: '"JetBrains Mono", "Courier New", ui-monospace, monospace',
  fontSize: 10,
  fontWeight: 800,
  textTransform: "uppercase" as const,
};

const REVIEW_REPORT_REASONS: Array<{ label: string; value: StoreReviewReportReason }> = [
  { label: "Spam", value: "spam" },
  { label: "Harassment", value: "harassment" },
  { label: "Hate Or Abuse", value: "hate_or_abuse" },
  { label: "Spoilers", value: "spoilers" },
  { label: "Off Topic", value: "off_topic" },
  { label: "Fraud", value: "fraud" },
  { label: "Other", value: "other" },
];

const REFUND_REASON_OPTIONS = [
  { label: "Duplicate Purchase", value: "duplicate_purchase" },
  { label: "Technical Issue", value: "technical_issue" },
  { label: "Not As Expected", value: "not_as_expected" },
  { label: "Billing Issue", value: "billing_issue" },
  { label: "Other", value: "other" },
];

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
  const [refundReason, setRefundReason] = useState(REFUND_REASON_OPTIONS[0].value);
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
          : `License token invalid: ${formatLicenseReason(result.reason)}.`,
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
            <OrderPanel
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
                setRefundReason(REFUND_REASON_OPTIONS[0].value);
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

function PriceDropSchedulerReadinessPanel({
  readiness,
}: {
  readiness: StorePriceDropSchedulerReadiness;
}) {
  const statusClass =
    readiness.statusLabel === "Ready"
      ? "bg-[#8cf5e4] text-[#171411]"
      : readiness.statusLabel === "Blocked"
        ? "bg-[#b7102a] text-white"
        : "bg-[#fff9ed] text-[#171411]";

  return (
    <section
      aria-label="Price-drop scheduler readiness"
      className="neo-dots border-[3px] border-black bg-[#f5eedf] p-4 shadow-[3px_3px_0_#171411]"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.14em] text-[#b7102a]">
            Price-drop scheduler readiness
          </p>
          <h3 className="neo-title mt-1 text-2xl leading-none text-[#171411]">
            notify-price-drop cron
          </h3>
        </div>
        <span
          className={`neo-copy inline-flex items-center border-2 border-black px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] shadow-[2px_2px_0_#171411] ${statusClass}`}
        >
          {readiness.statusLabel}
        </span>
      </div>
      <p className="neo-copy mt-3 border-2 border-black bg-[#fff9ed] p-2 text-[10px] font-black uppercase leading-5 tracking-[0.08em] text-[#171411]">
        {readiness.summary}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <SupportStamp label="Local alerts" value={String(readiness.localAlertCount)} />
        <SupportStamp label="Cron rows" value={String(readiness.remoteAlertCount)} />
        <SupportStamp label="Passed" value={String(readiness.passedCount)} />
        <SupportStamp label="Warnings" value={String(readiness.warningCount)} />
        <SupportStamp label="Dry run" value={readiness.dryRunPayload} />
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        {readiness.checks.map((check) => (
          <div key={check.label} className="border-2 border-black bg-[#fff9ed] p-2">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <span className="neo-copy truncate text-[10px] font-black uppercase tracking-[0.1em] text-[#171411]">
                {check.label}
              </span>
              <span
                className={`neo-copy shrink-0 border border-black px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] ${storeStagingCheckClass(
                  check.status,
                )}`}
              >
                {check.status}
              </span>
            </div>
            <p className="neo-copy mt-1 line-clamp-2 text-[9px] font-black uppercase leading-4 tracking-[0.06em] text-[#655f58]">
              {check.detail}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3 border-2 border-black bg-[#efe6d4] p-3 shadow-[2px_2px_0_#171411]">
        <div className="flex flex-col gap-3 border-b-2 border-black pb-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="neo-copy text-[9px] font-black uppercase tracking-[0.16em] text-[#b7102a]">
              Hosted Scheduler Proof
            </p>
            <h4 className="neo-title mt-1 text-2xl leading-none text-[#171411]">
              store_price_drop_notification_runs
            </h4>
            <p className="neo-copy mt-2 max-w-4xl text-[10px] font-black uppercase leading-5 tracking-[0.06em] text-[#655f58]">
              {readiness.hostedProof.guardCopy}
            </p>
          </div>
          <div className="neo-copy grid w-full shrink-0 grid-cols-1 gap-2 text-[10px] font-black uppercase tracking-[0.08em] lg:w-[460px] lg:grid-cols-3">
            <SupportStamp label="Latest run" value={readiness.hostedProof.latestRunId} />
            <SupportStamp label="Trigger" value={readiness.hostedProof.triggerSource} />
            <SupportStamp label="Writes" value={readiness.hostedProof.writeMode} />
          </div>
        </div>
        <div className="mt-3 grid gap-2 xl:grid-cols-5">
          {readiness.hostedProof.rows.map((row) => (
            <div key={row.id} className="border-2 border-black bg-[#fff9ed] p-2">
              <div className="flex items-start justify-between gap-2">
                <span className="neo-copy text-[9px] font-black uppercase tracking-[0.08em] text-[#171411]">
                  {row.label}
                </span>
                <span
                  className={`neo-copy shrink-0 border border-black px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] ${storeStagingCheckClass(
                    row.status,
                  )}`}
                >
                  {row.status}
                </span>
              </div>
              <p className="neo-copy mt-2 text-[9px] font-black uppercase leading-4 tracking-[0.06em] text-[#655f58]">
                {row.detail}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {readiness.hostedProof.guards.map((guard) => (
            <p
              className="neo-copy border-2 border-black bg-[#171411] px-2 py-2 text-[8px] font-black uppercase leading-4 tracking-[0.08em] text-[#fff9ed]"
              key={guard}
            >
              {guard}
            </p>
          ))}
        </div>
      </div>
      <p className="neo-copy mt-3 border-2 border-black bg-[#b7102a] p-2 text-[10px] font-black uppercase leading-5 tracking-[0.08em] text-white">
        {readiness.statusLabel === "Ready"
          ? "Hosted scheduler evidence is present. Keep PRICE_DROP_NOTIFY_SECRET in the protected hosted environment and continue monitoring sanitized run rows."
          : "Do not enter or expose PRICE_DROP_NOTIFY_SECRET in the launcher. A real hosted Supabase Scheduled Function or trusted external cron run is still required before go-live."}
      </p>
    </section>
  );
}

function CatalogSourceTape({
  productCount,
  source,
}: {
  productCount: number;
  source: StoreCatalogSource;
}) {
  const isHosted = source === "hosted";

  return (
    <section
      aria-label="Store catalog source"
      className="grid gap-3 border-[3px] border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411] md:grid-cols-[220px_1fr_150px]"
    >
      <div>
        <p className="neo-copy text-[9px] font-black uppercase tracking-[0.16em] text-[#b7102a]">
          Catalog Source
        </p>
        <h2 className="neo-title mt-1 text-2xl leading-none text-[#171411]">
          {catalogSourceLabel(source)}
        </h2>
      </div>
      <p className="neo-copy border-2 border-black bg-[#f6edd8] p-2 text-[10px] font-black uppercase leading-5 tracking-[0.08em] text-[#171411]">
        {catalogSourceDetail(source)}
      </p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
        <SupportStamp label="Products" value={String(productCount)} />
        <span
          className={`neo-copy inline-flex items-center justify-center border-2 border-black px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] shadow-[2px_2px_0_#171411] ${
            isHosted ? "bg-[#8cf5e4] text-[#171411]" : "bg-[#f6edd8] text-[#171411]"
          }`}
        >
          {isHosted ? "Hosted" : "Preview"}
        </span>
      </div>
    </section>
  );
}

function StoreMetric({
  icon,
  label,
  onClick,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  value: number;
}) {
  const content = (
    <>
      <div className="neo-copy flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
        {icon}
        {label}
      </div>
      <p className="neo-title mt-2 text-3xl leading-none text-[#171411]">{value}</p>
    </>
  );

  if (onClick) {
    return (
      <button
        aria-label={`Open ${label}`}
        className="border-[3px] border-black bg-[#fff9ed] p-4 text-left shadow-[4px_4px_0_#171411] transition-transform hover:-translate-y-0.5"
        type="button"
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return (
    <div className="border-[3px] border-black bg-[#fff9ed] p-4 shadow-[4px_4px_0_#171411]">
      {content}
    </div>
  );
}

function ProductDetailPanel({
  game,
  storeProduct,
  isOwned,
  isWishlisted,
  isProcessing,
  priceHistory,
  priceHistoryLoading,
  onAddToCart,
  onBuyNow,
  onToggleWishlist,
}: {
  game: StoreGame;
  storeProduct: StoreProduct | null;
  isOwned: boolean;
  isWishlisted: boolean;
  isProcessing: boolean;
  priceHistory: StorePricePoint[];
  priceHistoryLoading: boolean;
  onAddToCart: (gameId: string) => void;
  onBuyNow: (gameId: string) => void;
  onToggleWishlist: (gameId: string) => void;
}) {
  return (
    <section className="grid overflow-hidden border-4 border-black bg-[#fff9ed] shadow-[6px_6px_0_#171411] lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-h-72 border-b-4 border-black bg-[repeating-linear-gradient(112deg,#171411_0_14px,#302c25_14px_28px,#b7102a_28px_32px,#007166_32px_36px)] p-5 lg:border-b-0 lg:border-r-4">
        <div className="neo-dots-ink flex h-full min-h-64 items-end border-4 border-black p-5 shadow-[5px_5px_0_#171411]">
          <div>
            <p className="neo-copy inline-flex border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#171411]">
              Product Page
            </p>
            <h2 className="neo-title mt-3 text-[3rem] leading-none text-[#fff9ed] sm:text-[4rem] lg:text-[5rem]">
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
        <SystemRequirementsPanel
          minRequirements={storeProduct?.minSystemRequirements ?? null}
          recRequirements={storeProduct?.recSystemRequirements ?? null}
        />
        <PriceTapePanel game={game} loading={priceHistoryLoading} priceHistory={priceHistory} />
        <div className="grid gap-2">
          <button
            className="neo-copy h-11 border-2 border-black bg-[#b7102a] text-[11px] font-black uppercase tracking-[0.12em] text-white shadow-[3px_3px_0_#171411] disabled:opacity-50"
            disabled={isOwned || isProcessing}
            type="button"
            onClick={() => onBuyNow(game.id)}
          >
            {isOwned ? "Owned" : game.isFree ? "Claim" : "Buy Now"}
          </button>
          <button
            className="neo-copy h-11 border-2 border-black bg-[#007166] text-[11px] font-black uppercase tracking-[0.12em] text-white shadow-[3px_3px_0_#171411] disabled:opacity-50"
            disabled={isOwned || isProcessing}
            type="button"
            onClick={() => onAddToCart(game.id)}
          >
            Add To Cart
          </button>
          <button
            className={`neo-copy h-11 border-2 border-black text-[11px] font-black uppercase tracking-[0.12em] shadow-[3px_3px_0_#171411] ${
              isWishlisted ? "bg-[#b7102a] text-white" : "bg-[#fff9ed] text-[#171411]"
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

interface RequirementEntry {
  label: string;
  value: string;
}

const REQUIREMENT_LABELS: Record<string, string> = {
  cpu: "CPU",
  gpu: "GPU",
  memory: "RAM",
  os: "OS",
  processor: "CPU",
  ram: "RAM",
  vram: "VRAM",
};

function formatRequirementLabel(key: string) {
  const normalized = key.replace(/[\s_-]+/g, "").toLowerCase();
  const mapped = REQUIREMENT_LABELS[normalized];
  if (mapped) return mapped;

  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[\s_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatRequirementValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (Array.isArray(value)) {
    const values = value
      .map((item) => formatRequirementValue(item))
      .filter((item): item is string => item !== null);
    return values.length > 0 ? values.join(", ") : null;
  }

  if (value && typeof value === "object") {
    const values = Object.entries(value as Record<string, unknown>)
      .map(([key, nestedValue]) => {
        const formattedValue = formatRequirementValue(nestedValue);
        return formattedValue ? `${formatRequirementLabel(key)}: ${formattedValue}` : null;
      })
      .filter((item): item is string => item !== null);
    return values.length > 0 ? values.join(" / ") : null;
  }

  return null;
}

function getRequirementEntries(requirements: Record<string, unknown> | null): RequirementEntry[] {
  if (!requirements) return [];

  return Object.entries(requirements)
    .map(([key, value]) => {
      const formattedValue = formatRequirementValue(value);
      return formattedValue ? { label: formatRequirementLabel(key), value: formattedValue } : null;
    })
    .filter((entry): entry is RequirementEntry => entry !== null);
}

function SystemRequirementsPanel({
  minRequirements,
  recRequirements,
}: {
  minRequirements: Record<string, unknown> | null;
  recRequirements: Record<string, unknown> | null;
}) {
  const minimum = getRequirementEntries(minRequirements);
  const recommended = getRequirementEntries(recRequirements);

  return (
    <section className="my-4 border-[3px] border-black bg-[#f6edd8] p-3 shadow-[3px_3px_0_#171411]">
      <div className="border-b-2 border-black pb-2">
        <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
          Spec Sheet
        </p>
        <h3 className="neo-title text-2xl leading-none text-[#171411]">System Requirements</h3>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <RequirementPanel
          accent="teal"
          emptyLabel="No minimum spec sheet filed."
          entries={minimum}
          title="Minimum"
        />
        <RequirementPanel
          accent="red"
          emptyLabel="No recommended spec sheet filed."
          entries={recommended}
          title="Recommended"
        />
      </div>
    </section>
  );
}

function RequirementPanel({
  accent,
  emptyLabel,
  entries,
  title,
}: {
  accent: "red" | "teal";
  emptyLabel: string;
  entries: RequirementEntry[];
  title: string;
}) {
  const accentClass = accent === "red" ? "bg-[#b7102a] text-white" : "bg-[#8cf5e4] text-[#171411]";

  return (
    <div className="border-2 border-black bg-[#fff9ed] shadow-[2px_2px_0_#171411]">
      <div
        className={`neo-copy border-b-2 border-black px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] ${accentClass}`}
      >
        {title}
      </div>
      {entries.length > 0 ? (
        <dl className="grid gap-2 p-3">
          {entries.map((entry) => (
            <div
              key={entry.label}
              className="border-b-2 border-black pb-2 last:border-b-0 last:pb-0"
            >
              <dt className="neo-copy text-[9px] font-black uppercase tracking-[0.1em] text-[#655f58]">
                {entry.label}
              </dt>
              <dd className="mt-1 text-xs font-black leading-5 text-[#171411]">{entry.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="neo-copy m-3 border-2 border-dashed border-black bg-[#f5eedf] p-3 text-[10px] font-black uppercase leading-5 tracking-[0.08em] text-[#655f58]">
          {emptyLabel}
        </p>
      )}
    </div>
  );
}

interface PriceChartPoint {
  id: string;
  label: string;
  fullDate: string;
  platform: string;
  effectivePrice: number;
  listPrice: number;
  discountPercent: number;
}

function PriceTapePanel({
  game,
  loading,
  priceHistory,
}: {
  game: StoreGame;
  loading: boolean;
  priceHistory: StorePricePoint[];
}) {
  const chartData = useMemo<PriceChartPoint[]>(
    () =>
      priceHistory.map((point) => {
        const recorded = new Date(point.recordedAt);
        return {
          id: point.id,
          label: formatPriceDate(point.recordedAt),
          fullDate: Number.isNaN(recorded.getTime()) ? "Recorded price" : recorded.toLocaleString(),
          platform: point.platform,
          effectivePrice: effectivePriceCents(point) / 100,
          listPrice: point.priceCents / 100,
          discountPercent: point.discountPercent,
        };
      }),
    [priceHistory],
  );
  const latestPoint = priceHistory[priceHistory.length - 1];
  const latestPrice = latestPoint ? effectivePriceCents(latestPoint) / 100 : game.price;
  const lowPrice =
    chartData.length > 0
      ? chartData.reduce((lowest, point) => Math.min(lowest, point.effectivePrice), Infinity)
      : game.price;
  const lowPoint =
    chartData.length > 0
      ? chartData.reduce((lowest, point) =>
          point.effectivePrice < lowest.effectivePrice ? point : lowest,
        )
      : null;
  const platformLabel =
    Array.from(new Set(priceHistory.map((point) => point.platform).filter(Boolean))).join(" / ") ||
    game.platform.join(" / ") ||
    "Store";
  const currentListPrice = game.originalPrice ?? game.price;
  const currentDiscount = game.discountPercent ?? 0;
  const lowestBadgeLabel = lowPoint
    ? `${formatCurrency(lowPoint.effectivePrice)} // ${lowPoint.label} // ${lowPoint.platform}`
    : `${formatCurrency(game.price)} // current catalog price`;

  return (
    <section className="my-4 border-[3px] border-black bg-[#f6edd8] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex items-start justify-between gap-3 border-b-2 border-black pb-2">
        <div>
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
            Price Tape
          </p>
          <h3 className="neo-title text-2xl leading-none text-[#171411]">Store Price History</h3>
        </div>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[10px] font-black uppercase text-[#171411]">
          {platformLabel}
        </span>
      </div>

      <div
        aria-label={`Lowest historical price: ${lowestBadgeLabel}`}
        className="neo-dots mt-3 border-[3px] border-black bg-[#8cf5e4] p-3 text-[#171411] shadow-[3px_3px_0_#171411]"
      >
        <p className="neo-copy text-[9px] font-black uppercase tracking-[0.12em]">
          Lowest Price Badge
        </p>
        <p className="neo-title mt-1 text-3xl leading-none">{formatCurrency(lowPrice)}</p>
        <p className="neo-copy mt-1 truncate text-[10px] font-black uppercase tracking-[0.08em]">
          {lowPoint ? `${lowPoint.label} / ${lowPoint.platform}` : "Current catalog price"}
        </p>
      </div>

      {loading ? (
        <div className="neo-copy mt-3 border-2 border-dashed border-black bg-[#fff9ed] p-4 text-center text-[10px] font-black uppercase tracking-[0.12em] text-[#655f58]">
          Loading price tape...
        </div>
      ) : chartData.length > 0 ? (
        <>
          <div
            aria-label={`${game.title} price history chart`}
            className="mt-3 h-44 border-2 border-black bg-[#fff9ed] p-2 shadow-[2px_2px_0_#171411]"
            role="img"
          >
            <ResponsiveContainer height="100%" minHeight={1} minWidth={1} width="100%">
              <LineChart data={chartData} margin={{ bottom: 2, left: 0, right: 4, top: 8 }}>
                <CartesianGrid
                  stroke="#171411"
                  strokeDasharray="2 4"
                  strokeOpacity={0.2}
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  interval="preserveStartEnd"
                  stroke="#171411"
                  tick={PRICE_AXIS_TICK_STYLE}
                  tickLine={false}
                />
                <YAxis
                  stroke="#171411"
                  tick={PRICE_AXIS_TICK_STYLE}
                  tickFormatter={(value: number) => formatCurrency(value)}
                  tickLine={false}
                  width={58}
                />
                <Tooltip
                  contentStyle={{
                    background: "#fff9ed",
                    border: "2px solid #171411",
                    borderRadius: 0,
                    boxShadow: "3px 3px 0 #171411",
                    color: "#171411",
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                  cursor={{ stroke: "#007166", strokeWidth: 2 }}
                  formatter={(value) => [formatCurrency(Number(value)), "Price"]}
                  labelFormatter={(_, payload) => {
                    const item = payload?.[0]?.payload as PriceChartPoint | undefined;
                    if (!item) return "Recorded price";
                    return `${item.fullDate} / ${item.platform} / ${item.discountPercent}% off`;
                  }}
                  labelStyle={{ color: "#b7102a", fontWeight: 900 }}
                  wrapperStyle={{ outline: "none" }}
                />
                <Line
                  activeDot={{ fill: "#b7102a", r: 6, stroke: "#171411", strokeWidth: 2 }}
                  dataKey="effectivePrice"
                  dot={{ fill: "#8cf5e4", r: 4, stroke: "#171411", strokeWidth: 2 }}
                  stroke="#b7102a"
                  strokeWidth={4}
                  type="monotone"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <PriceTapeCell accent="red" label="Latest" value={formatCurrency(latestPrice)} />
            <PriceTapeCell accent="teal" label="Low" value={formatCurrency(lowPrice)} />
            <PriceTapeCell accent="paper" label="Rows" value={String(chartData.length)} />
          </div>
        </>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <PriceTapeCell accent="red" label="Now" value={formatCurrency(game.price)} />
            <PriceTapeCell accent="teal" label="List" value={formatCurrency(currentListPrice)} />
            <PriceTapeCell accent="paper" label="Deal" value={`${currentDiscount}%`} />
          </div>
          <p className="neo-copy mt-3 border-2 border-dashed border-black bg-[#fff9ed] p-3 text-[10px] font-black uppercase leading-5 text-[#655f58]">
            No saved price_history rows yet. Showing the current catalog price without external
            price-history proof.
          </p>
        </>
      )}
    </section>
  );
}

function PriceTapeCell({
  accent,
  label,
  value,
}: {
  accent: "paper" | "red" | "teal";
  label: string;
  value: string;
}) {
  const accentClass =
    accent === "red"
      ? "bg-[#b7102a] text-white"
      : accent === "teal"
        ? "bg-[#8cf5e4] text-[#171411]"
        : "bg-[#fff9ed] text-[#171411]";

  return (
    <div className={`border-2 border-black px-2 py-2 shadow-[2px_2px_0_#171411] ${accentClass}`}>
      <p className="neo-copy text-[9px] font-black uppercase tracking-[0.08em]">{label}</p>
      <p className="neo-title mt-1 truncate text-xl leading-none">{value}</p>
    </div>
  );
}

function StoreReviewsPanel({
  body,
  canManageDeveloperReplies,
  developerRepliesByReviewId,
  developerReplyDrafts,
  developerReplySavingReviewId,
  game,
  isOwned,
  isSignedIn,
  loading,
  rating,
  reportedReviewIds,
  reportingReviewId,
  reportDetails,
  reportReason,
  reportSaving,
  reviews,
  saving,
  title,
  userReview,
  onBodyChange,
  onCancelReport,
  onDeveloperReplyChange,
  onDeveloperReplySubmit,
  onOpenReport,
  onRatingChange,
  onReportDetailsChange,
  onReportReasonChange,
  onReportSubmit,
  onSubmit,
  onTitleChange,
}: {
  body: string;
  canManageDeveloperReplies: boolean;
  developerRepliesByReviewId: Map<string, StoreReviewReply>;
  developerReplyDrafts: Record<string, string>;
  developerReplySavingReviewId: string | null;
  game: StoreGame;
  isOwned: boolean;
  isSignedIn: boolean;
  loading: boolean;
  rating: number;
  reportedReviewIds: Set<string>;
  reportingReviewId: string | null;
  reportDetails: string;
  reportReason: StoreReviewReportReason;
  reportSaving: boolean;
  reviews: StoreReview[];
  saving: boolean;
  title: string;
  userReview: StoreReview | null;
  onBodyChange: (value: string) => void;
  onCancelReport: () => void;
  onDeveloperReplyChange: (reviewId: string, value: string) => void;
  onDeveloperReplySubmit: (review: StoreReview) => void;
  onOpenReport: (review: StoreReview) => void;
  onRatingChange: (value: number) => void;
  onReportDetailsChange: (value: string) => void;
  onReportReasonChange: (value: StoreReviewReportReason) => void;
  onReportSubmit: (reviewId: string, productId: string) => void;
  onSubmit: (gameId: string) => void;
  onTitleChange: (value: string) => void;
}) {
  const canReview = isSignedIn && isOwned && isUuid(game.id);
  const averageRating =
    reviews.length > 0
      ? reviews.reduce((total, review) => total + review.rating, 0) / reviews.length
      : null;

  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="border-4 border-black bg-[#fff9ed] shadow-[5px_5px_0_#171411]">
        <div className="flex flex-col gap-3 border-b-4 border-black bg-[#171411] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="neo-title text-3xl leading-none text-[#fff9ed]">Player Reviews</h2>
          <div className="neo-copy flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#8cf5e4]">
            <Star className="h-4 w-4 fill-current" />
            {averageRating === null ? "No Score" : `${averageRating.toFixed(1)} / 5`}
          </div>
        </div>
        <div className="space-y-3 p-4">
          {loading ? (
            <div className="neo-copy border-[3px] border-dashed border-black bg-[#f6edd8] p-5 text-center text-[11px] font-black uppercase tracking-[0.12em] text-[#655f58]">
              Loading reviews...
            </div>
          ) : reviews.length > 0 ? (
            reviews.map((review) => {
              const isReported = reportedReviewIds.has(review.id);
              const isOwnReview = review.id === userReview?.id;
              const isReporting = reportingReviewId === review.id;
              const developerReply = developerRepliesByReviewId.get(review.id) ?? null;
              const developerReplyDraft =
                developerReplyDrafts[review.id] ?? developerReply?.body ?? "";
              const isSavingDeveloperReply = developerReplySavingReviewId === review.id;

              return (
                <article
                  key={review.id}
                  className="border-[3px] border-black bg-[#f5eedf] p-4 shadow-[3px_3px_0_#171411]"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="neo-title text-2xl leading-none text-[#171411]">
                        {review.title ?? "Store Verdict"}
                      </p>
                      <p className="neo-copy mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#655f58]">
                        {new Date(review.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <ReviewStars rating={review.rating} />
                      <button
                        className={`neo-copy flex h-8 items-center gap-1 border-2 border-black px-2 text-[9px] font-black uppercase tracking-[0.08em] shadow-[2px_2px_0_#171411] disabled:opacity-50 ${
                          isReported ? "bg-[#8cf5e4] text-[#171411]" : "bg-[#fff9ed] text-[#171411]"
                        }`}
                        disabled={isReported || reportSaving}
                        type="button"
                        onClick={() => onOpenReport(review)}
                      >
                        <Flag className="h-3 w-3" />
                        {isReported ? "Reported" : isReporting ? "Close" : "Report"}
                      </button>
                    </div>
                  </div>
                  {review.body ? (
                    <p className="mt-3 text-sm font-bold leading-6 text-[#5b403f]">{review.body}</p>
                  ) : null}
                  {developerReply ? <DeveloperReplyNote reply={developerReply} /> : null}
                  {canManageDeveloperReplies ? (
                    <form
                      className="mt-3 border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]"
                      onSubmit={(event) => {
                        event.preventDefault();
                        onDeveloperReplySubmit(review);
                      }}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#007166]">
                          Developer Reply
                        </p>
                        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-[#171411]">
                          {developerReply ? "Update" : "Add"}
                        </span>
                      </div>
                      <textarea
                        className="mt-3 min-h-24 w-full resize-y border-2 border-black bg-[#f6edd8] p-3 text-sm font-bold leading-6 text-[#171411] outline-none"
                        maxLength={1000}
                        placeholder="Short official reply"
                        value={developerReplyDraft}
                        onChange={(event) => onDeveloperReplyChange(review.id, event.target.value)}
                      />
                      <button
                        className="neo-copy mt-2 flex h-9 w-full items-center justify-center gap-2 border-2 border-black bg-[#007166] text-[10px] font-black uppercase tracking-[0.1em] text-white shadow-[2px_2px_0_#171411] disabled:opacity-50"
                        disabled={isSavingDeveloperReply || !developerReplyDraft.trim()}
                        type="submit"
                      >
                        <Send className="h-3 w-3" />
                        {isSavingDeveloperReply
                          ? "Saving"
                          : developerReply
                            ? "Update Reply"
                            : "Post Reply"}
                      </button>
                    </form>
                  ) : null}
                  {isReporting && !isOwnReview ? (
                    <form
                      className="mt-3 border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]"
                      onSubmit={(event) => {
                        event.preventDefault();
                        onReportSubmit(review.id, game.id);
                      }}
                    >
                      <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
                        <select
                          className="neo-copy h-10 border-2 border-black bg-[#f6edd8] px-2 text-[10px] font-black uppercase tracking-[0.08em] text-[#171411] outline-none"
                          value={reportReason}
                          onChange={(event) =>
                            onReportReasonChange(event.target.value as StoreReviewReportReason)
                          }
                        >
                          {REVIEW_REPORT_REASONS.map((reason) => (
                            <option key={reason.value} value={reason.value}>
                              {reason.label}
                            </option>
                          ))}
                        </select>
                        <input
                          className="neo-copy h-10 min-w-0 border-2 border-black bg-[#f6edd8] px-2 text-[10px] font-black uppercase tracking-[0.08em] text-[#171411] outline-none"
                          maxLength={2000}
                          placeholder="Optional details"
                          value={reportDetails}
                          onChange={(event) => onReportDetailsChange(event.target.value)}
                        />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          className="neo-copy h-9 border-2 border-black bg-[#fff9ed] text-[10px] font-black uppercase tracking-[0.1em] text-[#171411] shadow-[2px_2px_0_#171411]"
                          type="button"
                          onClick={onCancelReport}
                        >
                          Cancel
                        </button>
                        <button
                          className="neo-copy flex h-9 items-center justify-center gap-2 border-2 border-black bg-[#b7102a] text-[10px] font-black uppercase tracking-[0.1em] text-white shadow-[2px_2px_0_#171411] disabled:opacity-50"
                          disabled={reportSaving}
                          type="submit"
                        >
                          <Send className="h-3 w-3" />
                          {reportSaving ? "Sending" : "Send Report"}
                        </button>
                      </div>
                    </form>
                  ) : null}
                </article>
              );
            })
          ) : (
            <EmptyStorePanel label="No product reviews yet." />
          )}
        </div>
      </div>

      {canReview ? (
        <form
          className="border-4 border-black bg-[#f5eedf] p-5 shadow-[5px_5px_0_#171411]"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(game.id);
          }}
        >
          <div className="border-b-[3px] border-black pb-4">
            <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
              {userReview ? "Edit Review" : "Owner Review"}
            </p>
            <h3 className="neo-title mt-2 text-3xl leading-none text-[#171411]">{game.title}</h3>
          </div>
          <div className="mt-4 flex gap-2">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                aria-label={`Rate ${value} stars`}
                className={`flex h-10 w-10 items-center justify-center border-2 border-black shadow-[2px_2px_0_#171411] ${
                  value <= rating ? "bg-[#b7102a] text-white" : "bg-[#fff9ed] text-[#171411]"
                }`}
                type="button"
                onClick={() => onRatingChange(value)}
              >
                <Star className={`h-5 w-5 ${value <= rating ? "fill-current" : ""}`} />
              </button>
            ))}
          </div>
          <input
            className="neo-copy mt-4 h-11 w-full border-2 border-black bg-[#fff9ed] px-3 text-[11px] font-black uppercase tracking-[0.08em] text-[#171411] outline-none"
            maxLength={120}
            placeholder="Review title"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
          />
          <textarea
            className="mt-3 min-h-32 w-full resize-y border-2 border-black bg-[#fff9ed] p-3 text-sm font-bold leading-6 text-[#171411] outline-none"
            maxLength={5000}
            placeholder="Write your verdict"
            value={body}
            onChange={(event) => onBodyChange(event.target.value)}
          />
          <button
            className="neo-copy mt-3 flex h-11 w-full items-center justify-center gap-2 border-2 border-black bg-[#007166] text-[11px] font-black uppercase tracking-[0.12em] text-white shadow-[3px_3px_0_#171411] disabled:opacity-50"
            disabled={saving}
            type="submit"
          >
            <Send className="h-4 w-4" />
            {saving ? "Saving" : userReview ? "Update Review" : "Publish Review"}
          </button>
        </form>
      ) : null}
    </section>
  );
}

function DeveloperReplyNote({ reply }: { reply: StoreReviewReply }) {
  return (
    <div className="neo-dots mt-3 border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#007166]">
          Developer Reply
        </p>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-[#171411]">
          {new Date(reply.updatedAt).toLocaleDateString()}
        </span>
      </div>
      <p className="mt-2 text-sm font-bold leading-6 text-[#171411]">{reply.body}</p>
    </div>
  );
}

function ReviewStars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-1" aria-label={`${rating} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          className={`h-4 w-4 ${value <= rating ? "fill-[#b7102a] text-[#b7102a]" : "text-[#655f58]"}`}
        />
      ))}
    </div>
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

function CartDrawer({
  cartGames,
  isOpen,
  isProcessing,
  onCheckout,
  onClose,
  onRemove,
  onViewCart,
  total,
}: {
  cartGames: StoreGame[];
  isOpen: boolean;
  isProcessing: boolean;
  onCheckout: () => void;
  onClose: () => void;
  onRemove: (gameId: string) => void;
  onViewCart: () => void;
  total: number;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-[#171411]/80 bg-[radial-gradient(circle,rgba(255,249,237,0.12)_1px,transparent_1px)] bg-[length:10px_10px] p-3 sm:p-6">
      <button
        aria-label="Close cart drawer backdrop"
        className="min-w-0 flex-1 cursor-default"
        type="button"
        onClick={onClose}
      />
      <aside
        aria-label="Cart drawer"
        className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-md flex-col border-4 border-black bg-[#fff9ed] shadow-[8px_8px_0_#171411] sm:max-h-[calc(100vh-3rem)]"
        role="dialog"
      >
        <div className="flex items-center justify-between border-b-4 border-black bg-[#171411] px-4 py-3">
          <div>
            <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#8cf5e4]">
              Cart Drawer
            </p>
            <h2 className="neo-title text-3xl leading-none text-[#fff9ed]">Checkout Tape</h2>
          </div>
          <button
            aria-label="Close cart drawer"
            className="flex h-10 w-10 items-center justify-center border-2 border-black bg-[#fff9ed] text-[#171411] shadow-[2px_2px_0_#8cf5e4]"
            type="button"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {cartGames.length === 0 ? (
            <EmptyStorePanel label="Cart drawer is empty." />
          ) : (
            cartGames.map((game) => (
              <article
                key={game.id}
                className="border-[3px] border-black bg-[#f5eedf] p-3 shadow-[3px_3px_0_#171411]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="neo-title truncate text-2xl leading-none text-[#171411]">
                      {game.title}
                    </p>
                    <p className="neo-copy mt-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#655f58]">
                      {game.tagLine}
                    </p>
                  </div>
                  <button
                    aria-label={`Remove ${game.title} from cart`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-black bg-[#b7102a] text-white shadow-[2px_2px_0_#171411]"
                    type="button"
                    onClick={() => onRemove(game.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between border-t-2 border-black pt-2">
                  <span className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#655f58]">
                    Price
                  </span>
                  <span className="text-xl font-black text-[#171411]">
                    {formatCurrency(game.price)}
                  </span>
                </div>
              </article>
            ))
          )}
        </div>

        <div className="border-t-4 border-black bg-[#f6edd8] p-4">
          <div className="flex items-center justify-between border-y-2 border-black py-3">
            <span className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#655f58]">
              Total
            </span>
            <span className="neo-title text-3xl leading-none text-[#171411]">
              {formatCurrency(total)}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              className="neo-copy h-11 border-2 border-black bg-[#fff9ed] text-[10px] font-black uppercase tracking-[0.1em] text-[#171411] shadow-[3px_3px_0_#171411]"
              type="button"
              onClick={onViewCart}
            >
              Cart Tab
            </button>
            <button
              className="neo-copy h-11 border-2 border-black bg-[#b7102a] text-[10px] font-black uppercase tracking-[0.1em] text-white shadow-[3px_3px_0_#171411] disabled:opacity-50"
              disabled={cartGames.length === 0 || isProcessing}
              type="button"
              onClick={onCheckout}
            >
              Checkout
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function CartPanel({
  cartGames,
  onCheckout,
  onRemove,
  total,
  isProcessing,
}: {
  cartGames: StoreGame[];
  onCheckout: () => void;
  onRemove: (gameId: string) => void;
  total: number;
  isProcessing: boolean;
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
          Checkout via Stripe. You'll be redirected to complete payment.
        </p>
        <div className="my-4 flex justify-between border-y-2 border-black py-3 text-xl font-black">
          <span>Total</span>
          <span>{formatCurrency(total)}</span>
        </div>
        <button
          className="neo-copy h-12 w-full border-2 border-black bg-[#b7102a] text-[11px] font-black uppercase tracking-[0.12em] text-white shadow-[3px_3px_0_#171411] disabled:opacity-50"
          disabled={isProcessing}
          type="button"
          onClick={onCheckout}
        >
          Complete Order
        </button>
      </aside>
    </div>
  );
}

function formatLicenseReason(reason: string) {
  return reason.replace(/_/g, " ");
}

function licenseValidationClass(result: StoreLicenseValidationResult) {
  return result.valid ? "bg-[#8cf5e4] text-[#171411]" : "bg-[#b7102a] text-white";
}

function LicenseValidationTape({ result }: { result?: StoreLicenseValidationResult }) {
  if (!result) return null;

  return (
    <div
      className={`neo-copy mt-3 grid gap-2 border-2 border-black p-3 text-[10px] font-black uppercase tracking-[0.08em] shadow-[2px_2px_0_#171411] sm:grid-cols-4 ${licenseValidationClass(result)}`}
    >
      <span>{result.valid ? "Valid" : "Invalid"}</span>
      <span>{formatLicenseReason(result.reason)}</span>
      <span>{result.productId ?? "No product"}</span>
      <span>{result.remainingDays === null ? "No expiry" : `${result.remainingDays}d left`}</span>
    </div>
  );
}

function LicenseValidationPanel({
  downloadPreparingLicenseId,
  licenses,
  licenseToken,
  validationResults,
  validatingLicenseKey,
  onDownloadLicense,
  onLicenseTokenChange,
  onValidateLicense,
}: {
  downloadPreparingLicenseId: string | null;
  licenses: StoreLicense[];
  licenseToken: string;
  validationResults: Record<string, StoreLicenseValidationResult>;
  validatingLicenseKey: string | null;
  onDownloadLicense: (license: StoreLicense) => void;
  onLicenseTokenChange: (value: string) => void;
  onValidateLicense: (token: string, resultKey: string) => void;
}) {
  const manualToken = licenseToken.trim();

  return (
    <section className="border-4 border-black bg-[#fff9ed] p-4 shadow-[5px_5px_0_#171411]">
      <div className="flex flex-col gap-3 border-b-[3px] border-black pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
            License Desk
          </p>
          <h3 className="neo-title text-3xl leading-none text-[#171411]">Offline Token Check</h3>
        </div>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#171411]">
          {licenses.length} Licenses
        </span>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
        <input
          className="neo-copy h-11 min-w-0 border-2 border-black bg-[#f5eedf] px-3 text-[11px] font-black uppercase tracking-[0.08em] text-[#171411] outline-none"
          placeholder="Paste offline license token"
          value={licenseToken}
          onChange={(event) => onLicenseTokenChange(event.target.value)}
        />
        <button
          className="neo-copy flex h-11 items-center justify-center gap-2 border-2 border-black bg-[#007166] px-4 text-[11px] font-black uppercase tracking-[0.12em] text-white shadow-[3px_3px_0_#171411] disabled:opacity-50"
          disabled={!manualToken || validatingLicenseKey === "manual"}
          type="button"
          onClick={() => onValidateLicense(manualToken, "manual")}
        >
          <ShieldCheck className="h-4 w-4" />
          {validatingLicenseKey === "manual" ? "Checking" : "Validate"}
        </button>
      </div>
      <LicenseValidationTape result={validationResults.manual} />

      {licenses.length > 0 ? (
        <div className="mt-4 grid gap-3">
          {licenses.map((license) => {
            const resultKey = `license:${license.id}`;
            return (
              <article
                key={license.id}
                className="border-[3px] border-black bg-[#f5eedf] p-3 shadow-[3px_3px_0_#171411]"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="neo-title truncate text-2xl leading-none text-[#171411]">
                      {license.productId}
                    </p>
                    <p className="neo-copy mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#655f58]">
                      {license.platform} / {license.deviceId ?? "unbound"} /{" "}
                      {license.expiresAt
                        ? new Date(license.expiresAt).toLocaleDateString()
                        : "no expiry"}
                    </p>
                  </div>
                  <div className="grid shrink-0 gap-2 sm:grid-cols-2">
                    <button
                      className="neo-copy flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#007166] px-3 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[2px_2px_0_#171411] disabled:opacity-50"
                      disabled={downloadPreparingLicenseId === license.id}
                      type="button"
                      onClick={() => onDownloadLicense(license)}
                    >
                      <Download className="h-4 w-4" />
                      {downloadPreparingLicenseId === license.id ? "Unlocking" : "Download"}
                    </button>
                    <button
                      className="neo-copy flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#b7102a] px-3 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[2px_2px_0_#171411] disabled:opacity-50"
                      disabled={validatingLicenseKey === resultKey}
                      type="button"
                      onClick={() => onValidateLicense(license.licenseKey, resultKey)}
                    >
                      <ShieldCheck className="h-4 w-4" />
                      {validatingLicenseKey === resultKey ? "Checking" : "Check"}
                    </button>
                  </div>
                </div>
                <LicenseValidationTape result={validationResults[resultKey]} />
              </article>
            );
          })}
        </div>
      ) : (
        <div className="neo-copy mt-4 border-[3px] border-dashed border-black bg-[#f5eedf] p-4 text-center text-[11px] font-black uppercase tracking-[0.12em] text-[#655f58]">
          No stored licenses yet.
        </div>
      )}
    </section>
  );
}

function OrderPanel({
  downloadPreparingLicenseId,
  invoiceSyncingOrderId,
  invoices,
  licenses,
  licenseToken,
  loading,
  orderItemsByOrderId,
  orders,
  refundDetails,
  refundDraftOrderId,
  refundReason,
  refundRequests,
  refundSavingOrderId,
  validationResults,
  validatingLicenseKey,
  onCancelRefund,
  onDownloadLicense,
  onLicenseTokenChange,
  onRefundDetailsChange,
  onRefundReasonChange,
  onRefundSubmit,
  onSyncInvoice,
  onStartRefund,
  onValidateLicense,
}: {
  downloadPreparingLicenseId: string | null;
  invoiceSyncingOrderId: string | null;
  invoices: StoreOrderInvoice[];
  licenses: StoreLicense[];
  licenseToken: string;
  loading: boolean;
  orderItemsByOrderId: Record<string, StoreOrderItem[]>;
  orders: StoreOrder[];
  refundDetails: string;
  refundDraftOrderId: string | null;
  refundReason: string;
  refundRequests: StoreRefundRequest[];
  refundSavingOrderId: string | null;
  validationResults: Record<string, StoreLicenseValidationResult>;
  validatingLicenseKey: string | null;
  onCancelRefund: () => void;
  onDownloadLicense: (license: StoreLicense) => void;
  onLicenseTokenChange: (value: string) => void;
  onRefundDetailsChange: (value: string) => void;
  onRefundReasonChange: (value: string) => void;
  onRefundSubmit: (orderId: string) => void;
  onSyncInvoice: (orderId: string) => void;
  onStartRefund: (orderId: string) => void;
  onValidateLicense: (token: string, resultKey: string) => void;
}) {
  const invoiceByOrderId = new Map(invoices.map((invoice) => [invoice.orderId, invoice]));
  const refundByOrderId = new Map(refundRequests.map((request) => [request.orderId, request]));
  const stripeStagingReadiness = getStoreStripeStagingReadiness({
    invoices,
    orders,
    refundRequests,
  });

  return (
    <div className="space-y-4">
      <LicenseValidationPanel
        downloadPreparingLicenseId={downloadPreparingLicenseId}
        licenses={licenses}
        licenseToken={licenseToken}
        validationResults={validationResults}
        validatingLicenseKey={validatingLicenseKey}
        onDownloadLicense={onDownloadLicense}
        onLicenseTokenChange={onLicenseTokenChange}
        onValidateLicense={onValidateLicense}
      />

      <StripeStagingReadinessPanel readiness={stripeStagingReadiness} />

      {loading ? (
        <div className="neo-copy border-[3px] border-dashed border-black bg-[#f5eedf] p-6 text-center text-[12px] font-black uppercase tracking-[0.12em] text-[#655f58]">
          Loading orders...
        </div>
      ) : orders.length === 0 ? (
        <EmptyStorePanel label="No orders yet." />
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const invoice = invoiceByOrderId.get(order.id);
            const refundRequest = refundByOrderId.get(order.id);
            const orderItems = orderItemsByOrderId[order.id] ?? [];

            return (
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
                  <div className="flex items-center gap-3">
                    <span
                      className={`neo-copy inline-flex items-center gap-1 border-2 border-black px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
                        order.status === "paid" || order.status === "fulfilled"
                          ? "bg-[#8cf5e4] text-[#171411]"
                          : "bg-[#fff9ed] text-[#171411]"
                      }`}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      {order.status}
                    </span>
                    <p className="text-2xl font-black text-[#171411]">
                      {formatCurrency((order.totalCents ?? 0) / 100)}
                    </p>
                  </div>
                </div>
                <OrderItemsTape items={orderItems} />
                <div className="mt-4 grid gap-3 border-t-2 border-black pt-3 lg:grid-cols-2">
                  <OrderInvoiceTape
                    invoice={invoice}
                    isSyncing={invoiceSyncingOrderId === order.id}
                    order={order}
                    onSync={onSyncInvoice}
                  />
                  <OrderRefundTape
                    details={refundDetails}
                    draftOrderId={refundDraftOrderId}
                    order={order}
                    reason={refundReason}
                    refundRequest={refundRequest}
                    savingOrderId={refundSavingOrderId}
                    onCancel={onCancelRefund}
                    onDetailsChange={onRefundDetailsChange}
                    onReasonChange={onRefundReasonChange}
                    onStart={onStartRefund}
                    onSubmit={onRefundSubmit}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StripeStagingReadinessPanel({
  readiness,
}: {
  readiness: ReturnType<typeof getStoreStripeStagingReadiness>;
}) {
  const statusClass =
    readiness.statusLabel === "Ready"
      ? "bg-[#8cf5e4] text-[#171411]"
      : readiness.statusLabel === "Blocked"
        ? "bg-[#b7102a] text-white"
        : "bg-[#fff9ed] text-[#171411]";

  return (
    <section
      aria-label="Stripe staging readiness"
      className="neo-dots border-[3px] border-black bg-[#f5eedf] p-4 shadow-[3px_3px_0_#171411]"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.14em] text-[#b7102a]">
            Stripe staging readiness
          </p>
          <h3 className="neo-title mt-1 text-2xl leading-none text-[#171411]">
            Webhook / Tax / Invoice
          </h3>
        </div>
        <span
          className={`neo-copy inline-flex items-center border-2 border-black px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] shadow-[2px_2px_0_#171411] ${statusClass}`}
        >
          {readiness.statusLabel}
        </span>
      </div>
      <p className="neo-copy mt-3 border-2 border-black bg-[#fff9ed] p-2 text-[10px] font-black uppercase leading-5 tracking-[0.08em] text-[#171411]">
        {readiness.summary}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <SupportStamp label="Passed" value={String(readiness.passedCount)} />
        <SupportStamp label="Warnings" value={String(readiness.warningCount)} />
        <SupportStamp label="Blocked" value={String(readiness.blockedCount)} />
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        {readiness.checks.map((check) => (
          <div key={check.label} className="border-2 border-black bg-[#fff9ed] p-2">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <span className="neo-copy truncate text-[10px] font-black uppercase tracking-[0.1em] text-[#171411]">
                {check.label}
              </span>
              <span
                className={`neo-copy shrink-0 border border-black px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] ${storeStagingCheckClass(
                  check.status,
                )}`}
              >
                {check.status}
              </span>
            </div>
            <p className="neo-copy mt-1 line-clamp-2 text-[9px] font-black uppercase leading-4 tracking-[0.06em] text-[#655f58]">
              {check.detail}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3 border-2 border-black bg-[#efe6d4] p-3 shadow-[2px_2px_0_#171411]">
        <div className="flex flex-col gap-3 border-b-2 border-black pb-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="neo-copy text-[9px] font-black uppercase tracking-[0.16em] text-[#b7102a]">
              Live-Staging Contract
            </p>
            <h4 className="neo-title mt-1 text-2xl leading-none text-[#171411]">
              Stripe Live-Staging Contract
            </h4>
            <p className="neo-copy mt-2 max-w-4xl text-[10px] font-black uppercase leading-5 tracking-[0.06em] text-[#655f58]">
              {readiness.liveContract.summary}
            </p>
          </div>
          <div className="neo-copy grid w-full shrink-0 grid-cols-1 gap-2 text-[10px] font-black uppercase tracking-[0.08em] lg:w-[520px] lg:grid-cols-3">
            <SupportStamp label="API" value={readiness.liveContract.apiVersion} />
            <SupportStamp label="Mode" value={readiness.liveContract.statusLabel} />
            <SupportStamp label="Writes" value={readiness.liveContract.writeMode} />
          </div>
        </div>
        <p className="neo-copy mt-3 border-2 border-black bg-[#fff9ed] p-2 text-[9px] font-black uppercase leading-5 tracking-[0.06em] text-[#171411]">
          {readiness.liveContract.guardCopy}
        </p>
        <div className="mt-3 grid gap-2 xl:grid-cols-5">
          {readiness.liveContract.rows.map((row) => (
            <div key={row.id} className="border-2 border-black bg-[#fff9ed] p-2">
              <div className="flex items-start justify-between gap-2">
                <span className="neo-copy text-[9px] font-black uppercase tracking-[0.08em] text-[#171411]">
                  {row.label}
                </span>
                <span
                  className={`neo-copy shrink-0 border border-black px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] ${storeStagingCheckClass(
                    row.status,
                  )}`}
                >
                  {row.status}
                </span>
              </div>
              <p className="neo-copy mt-2 text-[9px] font-black uppercase leading-4 tracking-[0.06em] text-[#655f58]">
                {row.detail}
              </p>
              <p className="neo-copy mt-2 border-2 border-black bg-[#f5eedf] px-2 py-1 text-[8px] font-black uppercase leading-4 tracking-[0.06em] text-[#171411]">
                {row.evidence}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {readiness.liveContract.guards.map((guard) => (
            <p
              className="neo-copy border-2 border-black bg-[#171411] px-2 py-2 text-[8px] font-black uppercase leading-4 tracking-[0.08em] text-[#fff9ed]"
              key={guard}
            >
              {guard}
            </p>
          ))}
        </div>
      </div>
      <p className="neo-copy mt-3 border-2 border-black bg-[#b7102a] p-2 text-[10px] font-black uppercase leading-5 tracking-[0.08em] text-white">
        Final Stripe go-live still needs a real staging project run with webhook signature delivery,
        Stripe Tax settings, invoice merchant details, and refund webhook replay.
      </p>
    </section>
  );
}

function storeStagingCheckClass(status: "pass" | "warning" | "blocked") {
  switch (status) {
    case "pass":
      return "bg-[#8cf5e4] text-[#171411]";
    case "blocked":
      return "bg-[#b7102a] text-white";
    default:
      return "bg-[#fff9ed] text-[#171411]";
  }
}

function OrderItemsTape({ items }: { items: StoreOrderItem[] }) {
  if (items.length === 0) {
    return (
      <div className="neo-copy mt-3 border-2 border-dashed border-black bg-[#fff9ed] p-3 text-[10px] font-black uppercase tracking-[0.08em] text-[#655f58]">
        Line items are syncing.
      </div>
    );
  }

  return (
    <div className="neo-copy mt-3 grid gap-2 border-2 border-black bg-[#fff9ed] p-3 text-[10px] font-black uppercase tracking-[0.08em] text-[#655f58]">
      <div className="flex items-center justify-between border-b-2 border-black pb-2">
        <span>Unlocked Products</span>
        <span className="text-[#171411]">{items.length}</span>
      </div>
      {items.map((item) => (
        <div key={item.id} className="flex flex-wrap justify-between gap-2">
          <span className="text-[#171411]">{item.titleSnapshot}</span>
          <span>
            {item.quantity}x / {formatCurrency(item.priceCentsSnapshot / 100)}
          </span>
        </div>
      ))}
    </div>
  );
}

function canRequestRefund(order: StoreOrder) {
  return (order.status === "paid" || order.status === "fulfilled") && order.totalCents > 0;
}

function formatSupportReason(value: string) {
  return value.replace(/_/g, " ");
}

function OrderInvoiceTape({
  invoice,
  isSyncing,
  order,
  onSync,
}: {
  invoice: StoreOrderInvoice | undefined;
  isSyncing: boolean;
  order: StoreOrder;
  onSync: (orderId: string) => void;
}) {
  const pdfUrl = invoice?.pdfUrl?.trim() || null;
  const hostedUrl = invoice?.hostedInvoiceUrl?.trim() || null;
  const canSync = canSyncStoreInvoice(order.status);
  const statusLabel = getStoreInvoiceStatusLabel(invoice, order.status);
  const statusClass =
    statusLabel === "PDF Ready" ||
    statusLabel === "Hosted Ready" ||
    statusLabel === "Provider Ready"
      ? "bg-[#8cf5e4] text-[#171411]"
      : statusLabel === "Unavailable" || statusLabel === "Void"
        ? "bg-[#efe6d4] text-[#171411]"
        : "bg-[#fff9ed] text-[#171411]";

  return (
    <section className="border-2 border-black bg-[#fff9ed] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
            Invoice
          </p>
          <p className="neo-title mt-1 text-2xl leading-none text-[#171411]">
            {invoice?.invoiceNumber ?? "Reference Pending"}
          </p>
        </div>
        <span
          className={`neo-copy inline-flex items-center border-2 border-black px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${statusClass}`}
        >
          {statusLabel}
        </span>
      </div>
      <div className="neo-copy mt-3 grid gap-2 text-[10px] font-black uppercase tracking-[0.08em] text-[#655f58] sm:grid-cols-2">
        <SupportStamp label="Provider" value={invoice?.provider ?? "stripe"} />
        <SupportStamp label="Issued" value={formatDateTime(invoice?.issuedAt ?? null)} />
        <SupportStamp label="Provider ID" value={invoice?.providerInvoiceId ?? "Pending"} />
      </div>
      {pdfUrl || hostedUrl ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {pdfUrl ? (
            <a
              className="neo-copy inline-flex h-9 items-center gap-2 border-2 border-black bg-[#007166] px-3 text-[10px] font-black uppercase tracking-[0.1em] text-white shadow-[2px_2px_0_#171411]"
              href={pdfUrl}
              rel="noreferrer"
              target="_blank"
            >
              Invoice PDF
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
          {hostedUrl ? (
            <a
              className="neo-copy inline-flex h-9 items-center gap-2 border-2 border-black bg-[#fff9ed] px-3 text-[10px] font-black uppercase tracking-[0.1em] text-[#171411] shadow-[2px_2px_0_#171411]"
              href={hostedUrl}
              rel="noreferrer"
              target="_blank"
            >
              Stripe Hosted
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      ) : (
        <p className="neo-copy mt-3 border-2 border-dashed border-black bg-[#f6edd8] p-2 text-[10px] font-black uppercase tracking-[0.08em] text-[#655f58]">
          Stripe PDF {statusLabel.toLowerCase()}.
        </p>
      )}
      {canSync ? (
        <button
          className="neo-copy mt-3 inline-flex h-9 items-center gap-2 border-2 border-black bg-[#b7102a] px-3 text-[10px] font-black uppercase tracking-[0.1em] text-white shadow-[2px_2px_0_#171411] disabled:opacity-50"
          disabled={isSyncing}
          type="button"
          onClick={() => onSync(order.id)}
        >
          <ReceiptText className="h-3 w-3" />
          {isSyncing ? "Syncing" : "Sync Stripe"}
        </button>
      ) : null}
    </section>
  );
}

function OrderRefundTape({
  details,
  draftOrderId,
  order,
  reason,
  refundRequest,
  savingOrderId,
  onCancel,
  onDetailsChange,
  onReasonChange,
  onStart,
  onSubmit,
}: {
  details: string;
  draftOrderId: string | null;
  order: StoreOrder;
  reason: string;
  refundRequest: StoreRefundRequest | undefined;
  savingOrderId: string | null;
  onCancel: () => void;
  onDetailsChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onStart: (orderId: string) => void;
  onSubmit: (orderId: string) => void;
}) {
  const isEligible = canRequestRefund(order);
  const isDrafting = draftOrderId === order.id;
  const isSaving = savingOrderId === order.id;
  const stripeRefundState = getStoreRefundProviderState(refundRequest, order.status);
  const refundedAmount =
    typeof refundRequest?.refundAmountCents === "number"
      ? formatCurrency(refundRequest.refundAmountCents / 100)
      : "Pending";
  const refundStateClass =
    stripeRefundState === "Refunded"
      ? "bg-[#8cf5e4] text-[#171411]"
      : stripeRefundState === "Stripe Failed" || stripeRefundState === "Stripe Canceled"
        ? "bg-[#b7102a] text-white"
        : refundRequest
          ? "bg-[#fff9ed] text-[#171411]"
          : "bg-[#fff9ed] text-[#171411]";

  return (
    <section className="border-2 border-black bg-[#fff9ed] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
            Refund Desk
          </p>
          <p className="neo-title mt-1 text-2xl leading-none text-[#171411]">
            {refundRequest ? formatSupportReason(refundRequest.status) : "Support Queue"}
          </p>
        </div>
        <span
          className={`neo-copy inline-flex items-center border-2 border-black px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${refundStateClass}`}
        >
          {stripeRefundState}
        </span>
      </div>

      {refundRequest ? (
        <div className="neo-copy mt-3 grid gap-2 text-[10px] font-black uppercase tracking-[0.08em] text-[#655f58] sm:grid-cols-2">
          <SupportStamp label="Reason" value={formatSupportReason(refundRequest.reason)} />
          <SupportStamp label="Provider" value={refundRequest.provider} />
          <SupportStamp label="Stripe ID" value={refundRequest.providerRefundId ?? "Pending"} />
          <SupportStamp
            label="Stripe State"
            value={refundRequest.providerRefundStatus ?? "Pending"}
          />
          <SupportStamp label="Amount" value={refundedAmount} />
          <SupportStamp label="Requested" value={formatDateTime(refundRequest.requestedAt)} />
          <SupportStamp label="Reviewed" value={formatDateTime(refundRequest.reviewedAt)} />
          <SupportStamp label="Processed" value={formatDateTime(refundRequest.processedAt)} />
          {refundRequest.failureReason ? (
            <SupportStamp label="Failure" value={refundRequest.failureReason} />
          ) : null}
        </div>
      ) : isDrafting ? (
        <form
          className="mt-3"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(order.id);
          }}
        >
          <select
            className="neo-copy h-10 w-full border-2 border-black bg-[#f6edd8] px-2 text-[10px] font-black uppercase tracking-[0.08em] text-[#171411] outline-none"
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
          >
            {REFUND_REASON_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <textarea
            className="mt-2 min-h-20 w-full resize-y border-2 border-black bg-[#f6edd8] p-2 text-sm font-bold leading-5 text-[#171411] outline-none"
            maxLength={2000}
            placeholder="Refund details"
            value={details}
            onChange={(event) => onDetailsChange(event.target.value)}
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              className="neo-copy h-9 border-2 border-black bg-[#fff9ed] text-[10px] font-black uppercase tracking-[0.1em] text-[#171411] shadow-[2px_2px_0_#171411]"
              type="button"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              className="neo-copy flex h-9 items-center justify-center gap-2 border-2 border-black bg-[#b7102a] text-[10px] font-black uppercase tracking-[0.1em] text-white shadow-[2px_2px_0_#171411] disabled:opacity-50"
              disabled={isSaving}
              type="submit"
            >
              <Send className="h-3 w-3" />
              {isSaving ? "Sending" : "Refund"}
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-3">
          <p className="neo-copy border-2 border-dashed border-black bg-[#f6edd8] p-2 text-[10px] font-black uppercase tracking-[0.08em] text-[#655f58]">
            {isEligible ? "No refund request on file." : "Refund request unavailable."}
          </p>
          {isEligible ? (
            <button
              className="neo-copy mt-2 flex h-9 items-center gap-2 border-2 border-black bg-[#007166] px-3 text-[10px] font-black uppercase tracking-[0.1em] text-white shadow-[2px_2px_0_#171411]"
              type="button"
              onClick={() => onStart(order.id)}
            >
              <ReceiptText className="h-3 w-3" />
              Start Refund
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

function SupportStamp({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b-2 border-black pb-1">
      <span>{label}</span>
      <span className="min-w-0 break-all text-right text-[#171411]">{value}</span>
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
