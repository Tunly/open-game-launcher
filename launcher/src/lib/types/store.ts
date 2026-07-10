export type StoreProductStatus = "draft" | "review" | "published" | "delisted" | "suspended";
export type OrderStatus = "pending" | "paid" | "fulfilled" | "refunded" | "failed" | "expired";
export type BuildPlatform = "windows" | "macos" | "linux";
export type BuildArch = "x86_64" | "aarch64";
export type DevApplicationStatus = "pending" | "approved" | "rejected";
export type StoreReviewReportReason =
  | "spam"
  | "harassment"
  | "hate_or_abuse"
  | "spoilers"
  | "off_topic"
  | "fraud"
  | "other";
export type StoreReviewReportStatus = "active" | "dismissed" | "withdrawn";
export type StoreRefundRequestStatus =
  | "requested"
  | "reviewing"
  | "approved"
  | "rejected"
  | "cancelled"
  | "processed";
export type StoreInvoiceStatus = "pending" | "available" | "unavailable" | "void";

export interface StoreProduct {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  shortDescription: string | null;
  developerId: string;
  publisher: string | null;
  releaseDate: string | null;
  genres: string[];
  tags: string[];
  platforms: string[];
  priceCents: number;
  discountPercent: number;
  coverImageUrl: string | null;
  trailerUrl: string | null;
  minSystemRequirements: Record<string, unknown>;
  recSystemRequirements: Record<string, unknown>;
  rating: number | null;
  ratingsCount: number;
  downloadsCount: number;
  status: StoreProductStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface StoreCartItem {
  id: string;
  userId: string;
  productId: string;
  quantity: number;
  addedAt: string;
}

export interface StoreWishlistItem {
  id: string;
  userId: string;
  productId: string;
  addedAt: string;
}

export interface StorePriceAlert {
  id: string;
  userId: string;
  productId: string;
  targetPriceCents: number;
  isActive: boolean;
  lastNotifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoreOrder {
  id: string;
  userId: string;
  stripeSessionId: string | null;
  stripePaymentIntent: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  status: OrderStatus;
  paymentMethod: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoreOrderItem {
  id: string;
  orderId: string;
  productId: string;
  titleSnapshot: string;
  priceCentsSnapshot: number;
  quantity: number;
}

export interface StoreBuild {
  id: string;
  productId: string;
  version: string;
  platform: BuildPlatform;
  arch: BuildArch;
  fileName: string;
  sizeBytes: number;
  sha256: string | null;
  storagePath: string;
  changelog: string | null;
  isLatest: boolean;
  uploadedAt: string;
  createdAt: string;
}

export interface StoreBuildDownloadTicket {
  build: StoreBuild;
  expiresAt: string;
  licenseId: string;
  url: string;
}

export interface StoreLicense {
  id: string;
  userId: string;
  productId: string;
  orderId: string | null;
  licenseKey: string;
  platform: string;
  deviceId: string | null;
  activationsLeft: number;
  expiresAt: string | null;
  isRevoked: boolean;
  createdAt: string;
}

export interface StoreLicenseValidationResult {
  valid: boolean;
  reason: string;
  productId: string | null;
  platform: string | null;
  deviceId: string | null;
  expiresAt: string | null;
  remainingDays: number | null;
}

export interface StoreReview {
  id: string;
  productId: string;
  userId: string;
  rating: number;
  title: string | null;
  body: string | null;
  isPublished: boolean;
  isHiddenByReports: boolean;
  hiddenByReportsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoreReviewReply {
  id: string;
  reviewId: string;
  productId: string;
  developerUserId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoreReviewInput {
  rating: number;
  title?: string | null;
  body?: string | null;
}

export interface StoreReviewReplyInput {
  body: string;
}

export interface StoreReviewReport {
  id: string;
  reviewId: string;
  reporterUserId: string;
  reason: StoreReviewReportReason;
  details: string | null;
  status: StoreReviewReportStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StoreReviewReportInput {
  reason: StoreReviewReportReason;
  details?: string | null;
}

export interface StoreRefundRequest {
  id: string;
  orderId: string;
  userId: string;
  reason: string;
  details: string | null;
  status: StoreRefundRequestStatus;
  provider: string;
  providerRefundId: string | null;
  providerRefundStatus: string | null;
  refundAmountCents: number | null;
  failureReason: string | null;
  metadata: Record<string, unknown>;
  requestedAt: string;
  reviewedAt: string | null;
  processedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoreRefundRequestInput {
  reason: string;
  details?: string | null;
}

export interface StoreOrderInvoice {
  id: string;
  orderId: string;
  userId: string;
  provider: string;
  providerInvoiceId: string | null;
  invoiceNumber: string | null;
  status: StoreInvoiceStatus;
  hostedInvoiceUrl: string | null;
  pdfUrl: string | null;
  metadata: Record<string, unknown>;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeveloperApplication {
  id: string;
  userId: string;
  studioName: string;
  website: string | null;
  description: string | null;
  status: DevApplicationStatus;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
