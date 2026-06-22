import {
  type PriceDropNotificationRunEvidenceRecord,
  type ScanRequest,
  verifyPriceDropNotifySecret,
} from "./contract.ts";
import type {
  NotifyPriceDropHandlerDeps,
  NotifyPriceDropWriteResult,
} from "./handler.ts";
import type { PriceDropCandidate, StorePriceAlertRow } from "./price-alerts.ts";

const NOTIFICATION_TYPE = "store_price_drop";
const ALERT_SELECT = `
  id,
  user_id,
  product_id,
  target_price_cents,
  is_active,
  last_notified_at,
  updated_at,
  product:store_products!store_price_alerts_product_id_fkey(
    id,
    title,
    slug,
    price_cents,
    discount_percent,
    status,
    updated_at
  )
`;

type NotificationInsertRow = {
  body: string;
  data: Record<string, unknown>;
  title: string;
  type: string;
  user_id: string;
};

type SupabaseQueryResult<T> = {
  count?: number | null;
  data: T | null;
  error: { message?: string } | null;
};

type SupabaseTableClient = {
  eq: (column: string, value: unknown) => SupabaseTableClient;
  in: (column: string, values: unknown[]) => SupabaseTableClient;
  insert: (value: unknown) => SupabaseTableClient;
  limit: (count: number) => SupabaseTableClient;
  order: (
    column: string,
    options: { ascending: boolean },
  ) => SupabaseTableClient;
  returns: <T>() => Promise<SupabaseQueryResult<T>>;
  select: (columns: string) => SupabaseTableClient;
  then: PromiseLike<SupabaseQueryResult<unknown>>["then"];
  update: (value: unknown, options?: unknown) => SupabaseTableClient;
};

type SupabaseAdminClient = {
  from: (table: string) => unknown;
};

export type NotifyPriceDropAdapterDeps = {
  getNotifySecret: () => string;
  supabaseAdmin: SupabaseAdminClient;
};

export type NotifyPriceDropAdapters = Pick<
  NotifyPriceDropHandlerDeps,
  | "loadActiveAlerts"
  | "recordNotifications"
  | "recordPriceDropNotificationRun"
  | "verifySecret"
>;

export function createNotifyPriceDropAdapters(
  deps: NotifyPriceDropAdapterDeps,
): NotifyPriceDropAdapters {
  return {
    loadActiveAlerts: (scanRequest) =>
      loadActiveAlerts(deps.supabaseAdmin, scanRequest),
    recordNotifications: (candidates, notifiedAt) =>
      recordNotifications(deps.supabaseAdmin, candidates, notifiedAt),
    recordPriceDropNotificationRun: (evidence) =>
      recordPriceDropNotificationRun(deps.supabaseAdmin, evidence),
    verifySecret: (request) =>
      verifyPriceDropNotifySecret(request, deps.getNotifySecret()),
  };
}

function centsLabel(cents: number): string {
  return `EUR ${(cents / 100).toFixed(2)}`;
}

function notificationRows(
  candidates: PriceDropCandidate[],
  notifiedAt: string,
): NotificationInsertRow[] {
  return candidates.map((candidate) => ({
    body: `${candidate.productTitle} is now ${
      centsLabel(
        candidate.currentPriceCents,
      )
    } (target ${centsLabel(candidate.targetPriceCents)}).`,
    data: {
      current_price_cents: candidate.currentPriceCents,
      delivery: "in_app",
      discount_percent: candidate.discountPercent,
      notified_at: notifiedAt,
      original_price_cents: candidate.originalPriceCents,
      product_id: candidate.productId,
      product_slug: candidate.productSlug,
      product_title: candidate.productTitle,
      source: "notify-price-drop",
      store_price_alert_id: candidate.alertId,
      target_price_cents: candidate.targetPriceCents,
    },
    title: `Price drop: ${candidate.productTitle}`,
    type: NOTIFICATION_TYPE,
    user_id: candidate.userId,
  }));
}

async function loadActiveAlerts(
  supabaseAdmin: SupabaseAdminClient,
  scanRequest: ScanRequest,
): Promise<StorePriceAlertRow[]> {
  let query = tableClient(supabaseAdmin, "store_price_alerts")
    .select(ALERT_SELECT)
    .eq("is_active", true)
    .order("updated_at", { ascending: true })
    .limit(scanRequest.limit);

  if (scanRequest.alertIds.length > 0) {
    query = query.in("id", scanRequest.alertIds);
  }
  if (scanRequest.productIds.length > 0) {
    query = query.in("product_id", scanRequest.productIds);
  }
  if (scanRequest.userIds.length > 0) {
    query = query.in("user_id", scanRequest.userIds);
  }

  const { data, error } = await query.returns<StorePriceAlertRow[]>();
  if (error) {
    throw new Error(`Failed to read store price alerts: ${error.message}`);
  }
  return data ?? [];
}

async function recordNotifications(
  supabaseAdmin: SupabaseAdminClient,
  candidates: PriceDropCandidate[],
  notifiedAt: string,
): Promise<NotifyPriceDropWriteResult> {
  if (candidates.length === 0) {
    return { alertsMarked: 0, notificationsRecorded: 0 };
  }

  const { error: notificationError } = await tableClient(
    supabaseAdmin,
    "user_notifications",
  )
    .insert(notificationRows(candidates, notifiedAt));
  if (notificationError) {
    throw new Error(
      `Failed to record price-drop notifications: ${notificationError.message}`,
    );
  }

  const alertIds = candidates.map((candidate) => candidate.alertId);
  const { count, error: updateError } = await tableClient(
    supabaseAdmin,
    "store_price_alerts",
  )
    .update({ last_notified_at: notifiedAt }, { count: "exact" })
    .in("id", alertIds);
  if (updateError) {
    throw new Error(
      `Failed to mark price alerts notified: ${updateError.message}`,
    );
  }

  return {
    alertsMarked: count ?? alertIds.length,
    notificationsRecorded: candidates.length,
  };
}

async function recordPriceDropNotificationRun(
  supabaseAdmin: SupabaseAdminClient,
  evidence: PriceDropNotificationRunEvidenceRecord,
): Promise<void> {
  const { error } = await tableClient(
    supabaseAdmin,
    "store_price_drop_notification_runs",
  )
    .insert(evidence);
  if (error) {
    throw new Error(`Price-drop run evidence write failed: ${error.message}`);
  }
}

function tableClient(
  supabaseAdmin: SupabaseAdminClient,
  table: string,
): SupabaseTableClient {
  return supabaseAdmin.from(table) as SupabaseTableClient;
}
