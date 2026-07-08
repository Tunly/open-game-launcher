import { CheckCircle2, Download, ExternalLink, ReceiptText, Send, ShieldCheck } from "lucide-react";

import {
  canSyncStoreInvoice,
  getStoreInvoiceStatusLabel,
  getStoreRefundProviderState,
  getStoreStripeStagingReadiness,
} from "../../lib/store-support";
import { formatCurrency, formatDateTime, formatStoreReason } from "../../lib/store-formatters";
import type {
  StoreLicense,
  StoreLicenseValidationResult,
  StoreOrder,
  StoreOrderInvoice,
  StoreOrderItem,
  StoreRefundRequest,
} from "../../lib/types/store";
import { EmptyStorePanel } from "./EmptyStorePanel";
import { STORE_REFUND_REASON_OPTIONS } from "./storeOrderOptions";
import { storeStagingCheckClass } from "./storePanelUtils";
import { SupportStamp } from "./SupportStamp";

interface StoreOrderPanelProps {
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
}

export const StoreOrderPanel = ({
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
}: StoreOrderPanelProps) => {
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
};

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
      <span>{formatStoreReason(result.reason)}</span>
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
            {refundRequest ? formatStoreReason(refundRequest.status) : "Support Queue"}
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
          <SupportStamp label="Reason" value={formatStoreReason(refundRequest.reason)} />
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
            {STORE_REFUND_REASON_OPTIONS.map((option) => (
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
