import type { ReactNode } from "react";

import { SupportStamp } from "./SupportStamp";

type StoreCatalogSource = "loading" | "hosted" | "empty" | "error";

function catalogSourceLabel(source: StoreCatalogSource) {
  switch (source) {
    case "loading":
      return "Loading Catalog";
    case "hosted":
      return "Hosted Catalog";
    case "empty":
      return "Hosted Empty";
    case "error":
      return "Hosted Error";
  }
}

function catalogSourceDetail(source: StoreCatalogSource) {
  switch (source) {
    case "loading":
      return "Loading published products from the hosted catalog. No local fixture catalog is rendered.";
    case "hosted":
      return "Published Supabase products loaded. Buttons use the selected product ID and hosted price.";
    case "empty":
      return "Hosted catalog returned no published products. No local product data is substituted.";
    case "error":
      return "Hosted catalog could not be loaded. No local product data is substituted.";
  }
}

export function CatalogSourceTape({
  errorMessage,
  productCount,
  source,
}: {
  errorMessage?: string | null;
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
        <p className="neo-copy text-[9px] font-black tracking-[0.16em] text-[#b7102a] uppercase">
          Catalog Source
        </p>
        <h2 className="neo-title mt-1 text-2xl leading-none text-[#171411]">
          {catalogSourceLabel(source)}
        </h2>
      </div>
      <p className="neo-copy border-2 border-black bg-[#f6edd8] p-2 text-[10px] leading-5 font-black tracking-[0.08em] text-[#171411] uppercase">
        {catalogSourceDetail(source)}
        {source === "error" && errorMessage ? ` Error: ${errorMessage}` : ""}
      </p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
        <SupportStamp label="Products" value={String(productCount)} />
        <span
          className={`neo-copy inline-flex items-center justify-center border-2 border-black px-2 py-1 text-[10px] font-black tracking-[0.1em] uppercase shadow-[2px_2px_0_#171411] ${
            isHosted ? "bg-[#8cf5e4] text-[#171411]" : "bg-[#f6edd8] text-[#171411]"
          }`}
        >
          {isHosted ? "Hosted" : source === "loading" ? "Loading" : "Unavailable"}
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
      <div className="neo-copy flex items-center gap-2 text-[10px] font-black tracking-[0.12em] text-[#b7102a] uppercase">
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
