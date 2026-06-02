export interface PriceAlert {
  id: string; userId: string; gameId: string; platform: string;
  targetPriceCents: number; isActive: boolean; lastNotifiedAt: string | null; createdAt: string;
}
export interface PriceHistory {
  id: string; gameId: string; platform: string; priceCents: number;
  discountPercent: number; recordedAt: string;
}
