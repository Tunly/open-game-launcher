export type StoreProductStatus = "draft" | "review" | "published" | "delisted" | "suspended";
export type DevApplicationStatus = "pending" | "approved" | "rejected";
export type StoreReviewReportReason =
  "spam" | "harassment" | "hate_or_abuse" | "spoilers" | "off_topic" | "fraud" | "other";
export type StoreReviewReportStatus = "active" | "dismissed" | "withdrawn";

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

export interface StoreWishlistItem {
  id: string;
  userId: string;
  productId: string;
  addedAt: string;
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
