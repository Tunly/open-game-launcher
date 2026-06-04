export type StoreProductStatus = "draft" | "review" | "published" | "delisted" | "suspended";
export type OrderStatus = "pending" | "paid" | "fulfilled" | "refunded" | "failed" | "expired";
export type BuildPlatform = "windows" | "macos" | "linux";
export type BuildArch = "x86_64" | "aarch64";
export type DevApplicationStatus = "pending" | "approved" | "rejected";

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
  screenshots: string[];
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
