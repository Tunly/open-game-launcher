import type { ReactNode } from "react";

import type { StorePriceDropSchedulerReadiness } from "../../lib/store-price-drop-readiness";
import { storeStagingCheckClass } from "./storePanelUtils";
import { SupportStamp } from "./SupportStamp";

type StoreCatalogSource = "hosted" | "local-preview" | "empty" | "error";

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

export function PriceDropSchedulerReadinessPanel({
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

export function CatalogSourceTape({
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

export function StoreMetric({
  icon,
  label,
  onClick,
  value,
}: {
  icon: ReactNode;
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
