import { Menu, Search, X } from "lucide-react";

import { PLATFORM_FILTERS, type PriceFilter } from "./storeHelpers";

interface StoreFilterBarProps {
  search: string;
  sortBy: string;
  activeFilters: Array<{ label: string; onRemove: () => void }>;
  onSearchChange: (value: string) => void;
  onSortChange: (value: string) => void;
  onClearAllFilters: () => void;
  onToggleSidebar: () => void;
}

export function StoreFilterBar({
  search,
  sortBy,
  activeFilters,
  onSearchChange,
  onSortChange,
  onClearAllFilters,
  onToggleSidebar,
}: StoreFilterBarProps) {
  return (
    <div className="space-y-0">
      {/* Top Search & Controls Bar */}
      <div className="border-b-2 border-black bg-[#fff9ed] shadow-[0_3px_0_#171411]">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="flex h-9 w-9 items-center justify-center border-2 border-black bg-[#f6edd8] lg:hidden"
            aria-label="Open Navigation"
          >
            <Menu size={14} />
          </button>

          <div className="relative max-w-[620px] min-w-[180px] flex-1">
            <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-[#5b403f]" />
            <input
              className="neo-copy h-9 w-full border-2 border-black bg-[#f6edd8] pr-8 pl-9 text-[11px] font-black uppercase outline-none"
              placeholder="Search the store"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer border-none bg-transparent text-[#5b403f]"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
            className="neo-copy h-9 cursor-pointer border-2 border-black bg-[#f6edd8] px-3 text-[10px] font-black uppercase outline-none"
            aria-label="Sort by"
          >
            <option value="relevance">Relevance</option>
            <option value="release">Release Date</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
            <option value="name">Name (A-Z)</option>
          </select>
        </div>
      </div>

      {/* Active filter chips */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b-2 border-black bg-[#f6edd8] px-4 py-2 sm:px-6">
          <span className="neo-copy text-[9px] font-black text-[#b7102a] uppercase">
            Active filters:
          </span>
          {activeFilters.map((f, i) => (
            <button
              key={i}
              type="button"
              onClick={f.onRemove}
              className="neo-copy flex items-center gap-1 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black uppercase shadow-[1px_1px_0_#000] hover:bg-[#d8cdbb]"
            >
              {f.label} <X size={10} />
            </button>
          ))}
          <button
            type="button"
            onClick={onClearAllFilters}
            className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[9px] font-black uppercase shadow-[1px_1px_0_#000] hover:brightness-95"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

export function StorePillFilters({
  platform,
  priceFilter,
  onPlatformChange,
  onPriceFilterChange,
}: {
  platform: string;
  priceFilter: PriceFilter;
  onPlatformChange: (platform: string) => void;
  onPriceFilterChange: (filter: PriceFilter) => void;
}) {
  const priceOptions: Array<{ key: PriceFilter; label: string }> = [
    { key: "all", label: "All Prices" },
    { key: "free", label: "Free" },
    { key: "under-10", label: "Under 10 €" },
    { key: "under-20", label: "Under 20 €" },
    { key: "discounts", label: "Discounts" },
    { key: "big-discounts", label: "-50% or more" },
  ];

  return (
    <div className="mb-5 space-y-3">
      {/* Platform Pills */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Platform filters">
        {PLATFORM_FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`neo-copy border-2 border-black px-2.5 py-1 text-[9px] font-black uppercase shadow-[2px_2px_0_#171411] transition-colors ${
              platform === key
                ? "bg-[#007166] text-white"
                : "bg-[#fff9ed] text-[#171411] hover:bg-[#f6edd8]"
            }`}
            onClick={() => onPlatformChange(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Price Filter Pills */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Price filters">
        {priceOptions.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`neo-copy border-2 border-black px-2 py-0.5 text-[9px] font-black uppercase shadow-[1px_1px_0_#171411] transition-colors ${
              priceFilter === key
                ? "bg-[#b7102a] text-white"
                : "bg-[#f6edd8] text-[#171411] hover:bg-[#d8cdbb]"
            }`}
            onClick={() => onPriceFilterChange(key)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
