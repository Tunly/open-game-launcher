import { formatCurrency } from "../../lib/store-formatters";
import type { StoreGame } from "../../lib/types";
import type { StoreProduct } from "../../lib/types/store";

export function ProductDetailPanel({
  game,
  storeProduct,
  isOwned,
  isWishlisted,
  isProcessing,
  onAddToCart,
  onBuyNow,
  onToggleWishlist,
}: {
  game: StoreGame;
  storeProduct: StoreProduct | null;
  isOwned: boolean;
  isWishlisted: boolean;
  isProcessing: boolean;
  onAddToCart: (gameId: string) => void;
  onBuyNow: (gameId: string) => void;
  onToggleWishlist: (gameId: string) => void;
}) {
  return (
    <section className="grid overflow-hidden border-4 border-black bg-[#fff9ed] shadow-[6px_6px_0_#171411] lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="relative min-h-72 overflow-hidden border-b-4 border-black bg-[repeating-linear-gradient(112deg,#171411_0_14px,#302c25_14px_28px,#b7102a_28px_32px,#007166_32px_36px)] p-5 lg:border-r-4 lg:border-b-0">
        {game.coverImageUrl ? (
          <img
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            src={game.coverImageUrl}
          />
        ) : null}
        <div className="absolute inset-0 bg-black/55" />
        <div className="neo-dots-ink relative flex h-full min-h-64 items-end border-4 border-black p-5 shadow-[5px_5px_0_#171411]">
          <div>
            <p className="neo-copy inline-flex border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[10px] font-black tracking-[0.12em] text-[#171411] uppercase">
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
          <p className="neo-copy text-[10px] font-black tracking-[0.12em] text-[#b7102a] uppercase">
            {game.publisher ?? "Publisher not listed"}
          </p>
          <p className="mt-3 text-sm leading-6 font-bold text-[#5b403f]">
            {game.description || "No product description has been published."}
          </p>
        </div>
        <div className="my-4 grid gap-2 text-[11px] font-black tracking-[0.08em] uppercase">
          <ProductFact label="Release" value={game.releaseDate ?? "TBA"} />
          <ProductFact label="Publisher" value={game.publisher ?? "Not listed"} />
          <ProductFact label="Platforms" value={game.platform.join(", ")} />
          <ProductFact label="Genres" value={(game.genres ?? [game.tagLine]).join(", ")} />
          <ProductFact label="Price" value={formatCurrency(game.price)} />
        </div>
        <SystemRequirementsPanel
          minRequirements={storeProduct?.minSystemRequirements ?? null}
          recRequirements={storeProduct?.recSystemRequirements ?? null}
        />
        <div className="grid gap-2">
          <button
            className="neo-copy h-11 border-2 border-black bg-[#b7102a] text-[11px] font-black tracking-[0.12em] text-white uppercase shadow-[3px_3px_0_#171411] disabled:opacity-50"
            disabled={isOwned || isProcessing}
            type="button"
            onClick={() => onBuyNow(game.id)}
          >
            {isOwned ? "Owned" : game.isFree ? "Claim" : "Buy Now"}
          </button>
          <button
            className="neo-copy h-11 border-2 border-black bg-[#007166] text-[11px] font-black tracking-[0.12em] text-white uppercase shadow-[3px_3px_0_#171411] disabled:opacity-50"
            disabled={isOwned || isProcessing}
            type="button"
            onClick={() => onAddToCart(game.id)}
          >
            Add To Cart
          </button>
          <button
            className={`neo-copy h-11 border-2 border-black text-[11px] font-black tracking-[0.12em] uppercase shadow-[3px_3px_0_#171411] ${
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
        <p className="neo-copy text-[10px] font-black tracking-[0.12em] text-[#b7102a] uppercase">
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
        className={`neo-copy border-b-2 border-black px-3 py-2 text-[10px] font-black tracking-[0.12em] uppercase ${accentClass}`}
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
              <dt className="neo-copy text-[9px] font-black tracking-[0.1em] text-[#655f58] uppercase">
                {entry.label}
              </dt>
              <dd className="mt-1 text-xs leading-5 font-black text-[#171411]">{entry.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="neo-copy m-3 border-2 border-dashed border-black bg-[#f5eedf] p-3 text-[10px] leading-5 font-black tracking-[0.08em] text-[#655f58] uppercase">
          {emptyLabel}
        </p>
      )}
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
