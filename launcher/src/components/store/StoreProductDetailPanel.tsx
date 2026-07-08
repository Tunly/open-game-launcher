import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCurrency } from "../../lib/store-formatters";
import type { StoreGame } from "../../lib/types";
import type { StorePricePoint, StoreProduct } from "../../lib/types/store";

function formatPriceDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Now";
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

function effectivePriceCents(point: StorePricePoint) {
  const discountMultiplier = Math.max(0, 100 - point.discountPercent) / 100;
  return Math.round(point.priceCents * discountMultiplier);
}

const PRICE_AXIS_TICK_STYLE = {
  fill: "#171411",
  fontFamily: '"JetBrains Mono", "Courier New", ui-monospace, monospace',
  fontSize: 10,
  fontWeight: 800,
  textTransform: "uppercase" as const,
};

export function ProductDetailPanel({
  game,
  storeProduct,
  isOwned,
  isWishlisted,
  isProcessing,
  priceHistory,
  priceHistoryLoading,
  onAddToCart,
  onBuyNow,
  onToggleWishlist,
}: {
  game: StoreGame;
  storeProduct: StoreProduct | null;
  isOwned: boolean;
  isWishlisted: boolean;
  isProcessing: boolean;
  priceHistory: StorePricePoint[];
  priceHistoryLoading: boolean;
  onAddToCart: (gameId: string) => void;
  onBuyNow: (gameId: string) => void;
  onToggleWishlist: (gameId: string) => void;
}) {
  return (
    <section className="grid overflow-hidden border-4 border-black bg-[#fff9ed] shadow-[6px_6px_0_#171411] lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-h-72 border-b-4 border-black bg-[repeating-linear-gradient(112deg,#171411_0_14px,#302c25_14px_28px,#b7102a_28px_32px,#007166_32px_36px)] p-5 lg:border-b-0 lg:border-r-4">
        <div className="neo-dots-ink flex h-full min-h-64 items-end border-4 border-black p-5 shadow-[5px_5px_0_#171411]">
          <div>
            <p className="neo-copy inline-flex border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#171411]">
              Product Page
            </p>
            <h2 className="neo-title mt-3 text-[3rem] leading-none text-[#fff9ed] sm:text-[4rem] lg:text-[5rem]">
              {game.title}
            </h2>
          </div>
        </div>
      </div>
      <aside className="p-5">
        <div className="border-b-[3px] border-black pb-4">
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
            {game.developer ?? "Independent Developer"}
          </p>
          <p className="mt-3 text-sm font-bold leading-6 text-[#5b403f]">
            {game.tagLine}. Built for players who want quick installs, launcher-native ownership,
            wishlist tracking, and clean library handoff after purchase.
          </p>
        </div>
        <div className="my-4 grid gap-2 text-[11px] font-black uppercase tracking-[0.08em]">
          <ProductFact label="Release" value={game.releaseDate ?? "TBA"} />
          <ProductFact label="Platforms" value={game.platform.join(", ")} />
          <ProductFact label="Genres" value={(game.genres ?? [game.tagLine]).join(", ")} />
          <ProductFact label="Price" value={formatCurrency(game.price)} />
        </div>
        <SystemRequirementsPanel
          minRequirements={storeProduct?.minSystemRequirements ?? null}
          recRequirements={storeProduct?.recSystemRequirements ?? null}
        />
        <PriceTapePanel game={game} loading={priceHistoryLoading} priceHistory={priceHistory} />
        <div className="grid gap-2">
          <button
            className="neo-copy h-11 border-2 border-black bg-[#b7102a] text-[11px] font-black uppercase tracking-[0.12em] text-white shadow-[3px_3px_0_#171411] disabled:opacity-50"
            disabled={isOwned || isProcessing}
            type="button"
            onClick={() => onBuyNow(game.id)}
          >
            {isOwned ? "Owned" : game.isFree ? "Claim" : "Buy Now"}
          </button>
          <button
            className="neo-copy h-11 border-2 border-black bg-[#007166] text-[11px] font-black uppercase tracking-[0.12em] text-white shadow-[3px_3px_0_#171411] disabled:opacity-50"
            disabled={isOwned || isProcessing}
            type="button"
            onClick={() => onAddToCart(game.id)}
          >
            Add To Cart
          </button>
          <button
            className={`neo-copy h-11 border-2 border-black text-[11px] font-black uppercase tracking-[0.12em] shadow-[3px_3px_0_#171411] ${
              isWishlisted ? "bg-[#b7102a] text-white" : "bg-[#fff9ed] text-[#171411]"
            }`}
            type="button"
            onClick={() => onToggleWishlist(game.id)}
          >
            {isWishlisted ? "Wishlisted" : "Add To Wishlist"}
          </button>
        </div>
      </aside>
    </section>
  );
}

interface RequirementEntry {
  label: string;
  value: string;
}

const REQUIREMENT_LABELS: Record<string, string> = {
  cpu: "CPU",
  gpu: "GPU",
  memory: "RAM",
  os: "OS",
  processor: "CPU",
  ram: "RAM",
  vram: "VRAM",
};

function formatRequirementLabel(key: string) {
  const normalized = key.replace(/[\s_-]+/g, "").toLowerCase();
  const mapped = REQUIREMENT_LABELS[normalized];
  if (mapped) return mapped;

  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[\s_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatRequirementValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (Array.isArray(value)) {
    const values = value
      .map((item) => formatRequirementValue(item))
      .filter((item): item is string => item !== null);
    return values.length > 0 ? values.join(", ") : null;
  }

  if (value && typeof value === "object") {
    const values = Object.entries(value as Record<string, unknown>)
      .map(([key, nestedValue]) => {
        const formattedValue = formatRequirementValue(nestedValue);
        return formattedValue ? `${formatRequirementLabel(key)}: ${formattedValue}` : null;
      })
      .filter((item): item is string => item !== null);
    return values.length > 0 ? values.join(" / ") : null;
  }

  return null;
}

function getRequirementEntries(requirements: Record<string, unknown> | null): RequirementEntry[] {
  if (!requirements) return [];

  return Object.entries(requirements)
    .map(([key, value]) => {
      const formattedValue = formatRequirementValue(value);
      return formattedValue ? { label: formatRequirementLabel(key), value: formattedValue } : null;
    })
    .filter((entry): entry is RequirementEntry => entry !== null);
}

function SystemRequirementsPanel({
  minRequirements,
  recRequirements,
}: {
  minRequirements: Record<string, unknown> | null;
  recRequirements: Record<string, unknown> | null;
}) {
  const minimum = getRequirementEntries(minRequirements);
  const recommended = getRequirementEntries(recRequirements);

  return (
    <section className="my-4 border-[3px] border-black bg-[#f6edd8] p-3 shadow-[3px_3px_0_#171411]">
      <div className="border-b-2 border-black pb-2">
        <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
          Spec Sheet
        </p>
        <h3 className="neo-title text-2xl leading-none text-[#171411]">System Requirements</h3>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <RequirementPanel
          accent="teal"
          emptyLabel="No minimum spec sheet filed."
          entries={minimum}
          title="Minimum"
        />
        <RequirementPanel
          accent="red"
          emptyLabel="No recommended spec sheet filed."
          entries={recommended}
          title="Recommended"
        />
      </div>
    </section>
  );
}

function RequirementPanel({
  accent,
  emptyLabel,
  entries,
  title,
}: {
  accent: "red" | "teal";
  emptyLabel: string;
  entries: RequirementEntry[];
  title: string;
}) {
  const accentClass = accent === "red" ? "bg-[#b7102a] text-white" : "bg-[#8cf5e4] text-[#171411]";

  return (
    <div className="border-2 border-black bg-[#fff9ed] shadow-[2px_2px_0_#171411]">
      <div
        className={`neo-copy border-b-2 border-black px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] ${accentClass}`}
      >
        {title}
      </div>
      {entries.length > 0 ? (
        <dl className="grid gap-2 p-3">
          {entries.map((entry) => (
            <div
              key={entry.label}
              className="border-b-2 border-black pb-2 last:border-b-0 last:pb-0"
            >
              <dt className="neo-copy text-[9px] font-black uppercase tracking-[0.1em] text-[#655f58]">
                {entry.label}
              </dt>
              <dd className="mt-1 text-xs font-black leading-5 text-[#171411]">{entry.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="neo-copy m-3 border-2 border-dashed border-black bg-[#f5eedf] p-3 text-[10px] font-black uppercase leading-5 tracking-[0.08em] text-[#655f58]">
          {emptyLabel}
        </p>
      )}
    </div>
  );
}

interface PriceChartPoint {
  id: string;
  label: string;
  fullDate: string;
  platform: string;
  effectivePrice: number;
  listPrice: number;
  discountPercent: number;
}

function PriceTapePanel({
  game,
  loading,
  priceHistory,
}: {
  game: StoreGame;
  loading: boolean;
  priceHistory: StorePricePoint[];
}) {
  const chartData = useMemo<PriceChartPoint[]>(
    () =>
      priceHistory.map((point) => {
        const recorded = new Date(point.recordedAt);
        return {
          id: point.id,
          label: formatPriceDate(point.recordedAt),
          fullDate: Number.isNaN(recorded.getTime()) ? "Recorded price" : recorded.toLocaleString(),
          platform: point.platform,
          effectivePrice: effectivePriceCents(point) / 100,
          listPrice: point.priceCents / 100,
          discountPercent: point.discountPercent,
        };
      }),
    [priceHistory],
  );
  const latestPoint = priceHistory[priceHistory.length - 1];
  const latestPrice = latestPoint ? effectivePriceCents(latestPoint) / 100 : game.price;
  const lowPrice =
    chartData.length > 0
      ? chartData.reduce((lowest, point) => Math.min(lowest, point.effectivePrice), Infinity)
      : game.price;
  const lowPoint =
    chartData.length > 0
      ? chartData.reduce((lowest, point) =>
          point.effectivePrice < lowest.effectivePrice ? point : lowest,
        )
      : null;
  const platformLabel =
    Array.from(new Set(priceHistory.map((point) => point.platform).filter(Boolean))).join(" / ") ||
    game.platform.join(" / ") ||
    "Store";
  const currentListPrice = game.originalPrice ?? game.price;
  const currentDiscount = game.discountPercent ?? 0;
  const lowestBadgeLabel = lowPoint
    ? `${formatCurrency(lowPoint.effectivePrice)} // ${lowPoint.label} // ${lowPoint.platform}`
    : `${formatCurrency(game.price)} // current catalog price`;

  return (
    <section className="my-4 border-[3px] border-black bg-[#f6edd8] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex items-start justify-between gap-3 border-b-2 border-black pb-2">
        <div>
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
            Price Tape
          </p>
          <h3 className="neo-title text-2xl leading-none text-[#171411]">Store Price History</h3>
        </div>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[10px] font-black uppercase text-[#171411]">
          {platformLabel}
        </span>
      </div>

      <div
        aria-label={`Lowest historical price: ${lowestBadgeLabel}`}
        className="neo-dots mt-3 border-[3px] border-black bg-[#8cf5e4] p-3 text-[#171411] shadow-[3px_3px_0_#171411]"
      >
        <p className="neo-copy text-[9px] font-black uppercase tracking-[0.12em]">
          Lowest Price Badge
        </p>
        <p className="neo-title mt-1 text-3xl leading-none">{formatCurrency(lowPrice)}</p>
        <p className="neo-copy mt-1 truncate text-[10px] font-black uppercase tracking-[0.08em]">
          {lowPoint ? `${lowPoint.label} / ${lowPoint.platform}` : "Current catalog price"}
        </p>
      </div>

      {loading ? (
        <div className="neo-copy mt-3 border-2 border-dashed border-black bg-[#fff9ed] p-4 text-center text-[10px] font-black uppercase tracking-[0.12em] text-[#655f58]">
          Loading price tape...
        </div>
      ) : chartData.length > 0 ? (
        <>
          <div
            aria-label={`${game.title} price history chart`}
            className="mt-3 h-44 border-2 border-black bg-[#fff9ed] p-2 shadow-[2px_2px_0_#171411]"
            role="img"
          >
            <ResponsiveContainer height="100%" minHeight={1} minWidth={1} width="100%">
              <LineChart data={chartData} margin={{ bottom: 2, left: 0, right: 4, top: 8 }}>
                <CartesianGrid
                  stroke="#171411"
                  strokeDasharray="2 4"
                  strokeOpacity={0.2}
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  interval="preserveStartEnd"
                  stroke="#171411"
                  tick={PRICE_AXIS_TICK_STYLE}
                  tickLine={false}
                />
                <YAxis
                  stroke="#171411"
                  tick={PRICE_AXIS_TICK_STYLE}
                  tickFormatter={(value: number) => formatCurrency(value)}
                  tickLine={false}
                  width={58}
                />
                <Tooltip
                  contentStyle={{
                    background: "#fff9ed",
                    border: "2px solid #171411",
                    borderRadius: 0,
                    boxShadow: "3px 3px 0 #171411",
                    color: "#171411",
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                  cursor={{ stroke: "#007166", strokeWidth: 2 }}
                  formatter={(value) => [formatCurrency(Number(value)), "Price"]}
                  labelFormatter={(_, payload) => {
                    const item = payload?.[0]?.payload as PriceChartPoint | undefined;
                    if (!item) return "Recorded price";
                    return `${item.fullDate} / ${item.platform} / ${item.discountPercent}% off`;
                  }}
                  labelStyle={{ color: "#b7102a", fontWeight: 900 }}
                  wrapperStyle={{ outline: "none" }}
                />
                <Line
                  activeDot={{ fill: "#b7102a", r: 6, stroke: "#171411", strokeWidth: 2 }}
                  dataKey="effectivePrice"
                  dot={{ fill: "#8cf5e4", r: 4, stroke: "#171411", strokeWidth: 2 }}
                  stroke="#b7102a"
                  strokeWidth={4}
                  type="monotone"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <PriceTapeCell accent="red" label="Latest" value={formatCurrency(latestPrice)} />
            <PriceTapeCell accent="teal" label="Low" value={formatCurrency(lowPrice)} />
            <PriceTapeCell accent="paper" label="Rows" value={String(chartData.length)} />
          </div>
        </>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <PriceTapeCell accent="red" label="Now" value={formatCurrency(game.price)} />
            <PriceTapeCell accent="teal" label="List" value={formatCurrency(currentListPrice)} />
            <PriceTapeCell accent="paper" label="Deal" value={`${currentDiscount}%`} />
          </div>
          <p className="neo-copy mt-3 border-2 border-dashed border-black bg-[#fff9ed] p-3 text-[10px] font-black uppercase leading-5 text-[#655f58]">
            No saved price_history rows yet. Showing the current catalog price without external
            price-history proof.
          </p>
        </>
      )}
    </section>
  );
}

function PriceTapeCell({
  accent,
  label,
  value,
}: {
  accent: "paper" | "red" | "teal";
  label: string;
  value: string;
}) {
  const accentClass =
    accent === "red"
      ? "bg-[#b7102a] text-white"
      : accent === "teal"
        ? "bg-[#8cf5e4] text-[#171411]"
        : "bg-[#fff9ed] text-[#171411]";

  return (
    <div className={`border-2 border-black px-2 py-2 shadow-[2px_2px_0_#171411] ${accentClass}`}>
      <p className="neo-copy text-[9px] font-black uppercase tracking-[0.08em]">{label}</p>
      <p className="neo-title mt-1 truncate text-xl leading-none">{value}</p>
    </div>
  );
}

function ProductFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-2 border-black bg-[#f6edd8] px-3 py-2 shadow-[2px_2px_0_#171411]">
      <span className="text-[#655f58]">{label}</span>
      <span className="text-right text-[#171411]">{value}</span>
    </div>
  );
}
