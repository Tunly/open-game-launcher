export interface DevDashboardStats {
  totalProducts: number;
  totalRevenueCents: number;
  totalDownloads: number;
  publishedProducts: number;
}

export interface DevRevenueEntry {
  month: string; // "2026-06"
  revenueCents: number;
  ordersCount: number;
}
