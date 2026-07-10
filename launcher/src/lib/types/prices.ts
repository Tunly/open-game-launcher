export interface PriceAlert {
  id: string;
  userId: string;
  gameId: string;
  platform: string;
  targetPriceCents: number;
  isActive: boolean;
  lastNotifiedAt: string | null;
  createdAt: string;
}
