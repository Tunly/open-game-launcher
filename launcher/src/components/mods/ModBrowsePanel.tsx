import { ChevronLeft, ChevronRight, SearchX } from "lucide-react";

import { ModCard, type ModCardView } from "./ModCard";

interface ModBrowsePanelProps {
  busyItemIds?: ReadonlySet<string>;
  error?: string | null;
  hasNextPage?: boolean;
  items: ModCardView[];
  loading?: boolean;
  onAction: (item: ModCardView) => void;
  onPageChange: (page: number) => void;
  page: number;
  providerLabel: string;
  query: string;
}

export function ModBrowsePanel({
  busyItemIds,
  error,
  hasNextPage = false,
  items,
  loading = false,
  onAction,
  onPageChange,
  page,
  providerLabel,
  query,
}: ModBrowsePanelProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="h-[410px] animate-pulse border-[3px] border-[#171411] bg-[#efe6d4] shadow-[5px_5px_0_#171411]"
          />
        ))}
        <span className="sr-only">Loading {providerLabel}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="border-[3px] border-[#171411] bg-[#b7102a] p-5 text-white shadow-[5px_5px_0_#171411]"
      >
        <p className="neo-copy text-xs font-black tracking-[0.14em] uppercase">
          Provider signal lost
        </p>
        <p className="neo-copy mt-2 text-sm">{error}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="neo-dots grid min-h-64 place-items-center border-[3px] border-[#171411] bg-[#f6edd8] p-6 text-center shadow-[5px_5px_0_#171411]">
        <div>
          <SearchX className="mx-auto h-10 w-10" strokeWidth={2.5} aria-hidden="true" />
          <h2 className="neo-title mt-3 text-2xl uppercase">No mods found</h2>
          <p className="neo-copy mt-2 max-w-md text-xs leading-5 text-[#655f58]">
            {query
              ? `No ${providerLabel} results match “${query}”. Try a shorter search.`
              : `${providerLabel} has no browse results for this game yet.`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <ModCard
            key={`${item.provider}:${item.id}`}
            item={item}
            busy={busyItemIds?.has(item.id) ?? false}
            onAction={onAction}
          />
        ))}
      </div>

      {(page > 1 || hasNextPage) && (
        <nav className="mt-6 flex items-center justify-center gap-3" aria-label="Mod result pages">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="neo-copy flex min-h-10 items-center gap-2 border-[3px] border-[#171411] bg-[#f6edd8] px-3 py-2 text-[10px] font-black tracking-[0.1em] uppercase shadow-[3px_3px_0_#171411] hover:bg-[#8cf5e4] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
          </button>
          <span className="neo-copy border-[3px] border-[#171411] bg-[#171411] px-3 py-2 text-[10px] font-black tracking-[0.12em] text-white uppercase">
            Page {page}
          </span>
          <button
            type="button"
            disabled={!hasNextPage}
            onClick={() => onPageChange(page + 1)}
            className="neo-copy flex min-h-10 items-center gap-2 border-[3px] border-[#171411] bg-[#f6edd8] px-3 py-2 text-[10px] font-black tracking-[0.1em] uppercase shadow-[3px_3px_0_#171411] hover:bg-[#8cf5e4] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </nav>
      )}
    </>
  );
}
