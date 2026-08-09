import { SlidersHorizontal, Sparkles, X } from "lucide-react";

import { LIBRARY_STORE_FILTER_OPTIONS } from "../../lib/library-filters";
import { useLibraryContext } from "../../context/useLibraryContext";

interface LibraryFiltersProps {
  isOpen: boolean;
  onClose: () => void;
}

function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
}

const PLATFORM_OPTIONS = ["Windows", "macOS", "Linux"] as const;
const PLAYER_OPTIONS = [
  "Singleplayer",
  "Multiplayer",
  "Co-op",
  "PvP",
  "Online Co-op",
  "Local Co-op",
  "Shared/Split Screen",
  "MMO",
] as const;
const HARDWARE_OPTIONS = ["Steam Deck Verified", "Steam Deck Playable", "VR"] as const;
const GENRE_OPTIONS = [
  "Action",
  "Adventure",
  "RPG",
  "Strategy",
  "Simulation",
  "Indie",
  "Casual",
  "Sports",
  "Racing",
  "Free to Play",
  "Early Access",
] as const;
const STATUS_OPTIONS = [
  "Installed",
  "Uninstalled",
  "Played",
  "Never Played",
  "Favorites",
  "Hidden",
] as const;
const PRODUCT_CATEGORIES = [
  { key: "game", label: "Games" },
  { key: "software", label: "Software" },
  { key: "video", label: "Videos" },
  { key: "dlc", label: "DLCs" },
  { key: "soundtrack", label: "Soundtracks" },
  { key: "demo", label: "Demos" },
  { key: "beta", label: "Beta Access" },
] as const;
const SIZE_PRESETS = ["size:>10gb", "size:<5gb", "size:=50gb"] as const;

export function LibraryFilters({ isOpen, onClose }: LibraryFiltersProps) {
  const ctx = useLibraryContext();
  const { advancedFilters, setAdvancedFilters } = ctx.filters;
  const { customCategories } = ctx.manual;
  const {
    dynamicCollections,
    selectedCollectionName,
    newCollectionName,
    setNewCollectionName,
    applyDynamicCollection,
    saveCurrentFilterAsCollection,
  } = ctx.dynamic;
  const { manualCollections, selectedManualCollectionName, selectManualCollection } = ctx.manual;

  if (!isOpen) {
    return null;
  }

  const allCustomCategoryLabels = Array.from(new Set(Object.values(customCategories).flat()));

  function onResetAdvanced() {
    ctx.filters.resetAdvancedFilters();
    onClearCollectionSelection();
  }

  function onClearCollectionSelection() {
    ctx.manual.clearManualCollectionSelection();
    ctx.dynamic.setSelectedCollectionName(null);
  }

  function onApplyDynamicCollection(name: string) {
    ctx.manual.clearManualCollectionSelection();
    applyDynamicCollection(name);
  }

  function onSelectManualCollection(name: string) {
    ctx.dynamic.setSelectedCollectionName(null);
    selectManualCollection(name);
  }

  function onSaveDynamicCollection(name: string) {
    ctx.manual.clearManualCollectionSelection();
    saveCurrentFilterAsCollection(name);
  }

  return (
    <div
      aria-label="Advanced Filters"
      className="absolute top-12 right-2 bottom-2 left-2 z-50 [scrollbar-gutter:stable] overflow-y-auto overscroll-contain border-4 border-black bg-[#fbf4e7] p-4 shadow-[6px_6px_0_#171411] sm:right-auto sm:left-[260px] sm:w-[380px] lg:left-[290px]"
      role="dialog"
      style={{ fontFamily: '"Arial Narrow", Impact, sans-serif' }}
    >
      <div className="mb-4 flex items-center justify-between gap-2 border-b-4 border-black pb-2">
        <h3 className="neo-title flex items-center gap-2 text-2xl">
          <SlidersHorizontal className="h-5 w-5 text-[#b7102a]" />
          Advanced Filters
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center border-2 border-black bg-[#efe3cf] hover:bg-[#d8cbb7]"
            type="button"
            aria-label="Close filters"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <FilterSection title="Platform">
          {PLATFORM_OPTIONS.map((plat) => {
            const isChecked = advancedFilters.platforms.includes(plat);
            return (
              <ToggleButton
                key={plat}
                label={plat}
                isChecked={isChecked}
                onToggle={() =>
                  setAdvancedFilters({
                    ...advancedFilters,
                    platforms: toggleValue(advancedFilters.platforms, plat),
                  })
                }
                wide
              />
            );
          })}
        </FilterSection>

        <FilterSection title="Game Platform (Store)">
          {LIBRARY_STORE_FILTER_OPTIONS.map((l) => {
            const isChecked = advancedFilters.launchers?.includes(l.toLowerCase());
            return (
              <ToggleButton
                key={l}
                label={l}
                isChecked={isChecked}
                onToggle={() => {
                  const launchers = advancedFilters.launchers || [];
                  setAdvancedFilters({
                    ...advancedFilters,
                    launchers: isChecked
                      ? launchers.filter((x) => x !== l.toLowerCase())
                      : [...launchers, l.toLowerCase()],
                  });
                }}
                wide
              />
            );
          })}
          <label className="col-span-3 mt-1 flex cursor-pointer items-center gap-2 border-2 border-black bg-[#f5eedf] px-2 py-1.5">
            <input
              aria-label="Show PC Game Pass catalog"
              type="checkbox"
              checked={advancedFilters.showGamePassCatalog}
              onChange={(event) =>
                setAdvancedFilters({
                  ...advancedFilters,
                  showGamePassCatalog: event.currentTarget.checked,
                })
              }
              className="h-4 w-4 shrink-0 border-2 border-black accent-[#087d6d]"
            />
            <span className="neo-copy min-w-0 flex-1 text-[9px] font-black tracking-[0.08em] text-[#171411] uppercase">
              PC Game Pass Catalog
            </span>
          </label>
        </FilterSection>

        <FilterCheckboxSection
          title="Player Count"
          values={advancedFilters.players}
          options={[...PLAYER_OPTIONS]}
          onClear={() => setAdvancedFilters({ ...advancedFilters, players: [] })}
          onToggle={(value) =>
            setAdvancedFilters({
              ...advancedFilters,
              players: toggleValue(advancedFilters.players, value),
            })
          }
        />

        <FilterCheckboxSection
          title="Hardware Compatibility"
          values={advancedFilters.hardware}
          options={[...HARDWARE_OPTIONS]}
          onClear={() => setAdvancedFilters({ ...advancedFilters, hardware: [] })}
          onToggle={(value) =>
            setAdvancedFilters({
              ...advancedFilters,
              hardware: toggleValue(advancedFilters.hardware, value),
            })
          }
        />

        <FilterSection title="Genre">
          {GENRE_OPTIONS.map((g) => {
            const isChecked = advancedFilters.genres.includes(g);
            return (
              <ToggleButton
                key={g}
                label={g}
                isChecked={isChecked}
                onToggle={() =>
                  setAdvancedFilters({
                    ...advancedFilters,
                    genres: toggleValue(advancedFilters.genres, g),
                  })
                }
              />
            );
          })}
        </FilterSection>

        <FilterCheckboxSection
          title="Play Status"
          values={advancedFilters.status}
          options={[...STATUS_OPTIONS]}
          onClear={() => setAdvancedFilters({ ...advancedFilters, status: [] })}
          onToggle={(value) =>
            setAdvancedFilters({
              ...advancedFilters,
              status: toggleValue(advancedFilters.status, value),
            })
          }
        />

        {allCustomCategoryLabels.length > 0 && (
          <div className="border-2 border-black bg-[#efe3cf] p-2 shadow-[2px_2px_0_#000]">
            <h4 className="mb-2 flex items-center justify-between border-b border-black pb-1 text-[12px] font-black uppercase">
              <span>Category (Custom)</span>
              {advancedFilters.categories.length > 0 && (
                <button
                  onClick={() => setAdvancedFilters({ ...advancedFilters, categories: [] })}
                  className="text-[10px] lowercase underline"
                  type="button"
                >
                  clear
                </button>
              )}
            </h4>
            <div className="flex flex-wrap gap-1">
              {allCustomCategoryLabels.map((cat) => {
                const isChecked = advancedFilters.categories.includes(cat);
                return (
                  <button
                    key={cat}
                    onClick={() =>
                      setAdvancedFilters({
                        ...advancedFilters,
                        categories: toggleValue(advancedFilters.categories, cat),
                      })
                    }
                    className={`border border-black px-1.5 py-0.5 text-[10px] font-bold transition ${
                      isChecked ? "bg-[#139a82] text-white" : "bg-[#ded3c1] hover:bg-[#d5c7b1]"
                    }`}
                    type="button"
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="border-2 border-black bg-[#efe3cf] p-2 shadow-[2px_2px_0_#000]">
          <h4 className="mb-2 border-b border-black pb-1 text-[11px] font-black uppercase">
            Product Categories (Show/Hide)
          </h4>
          <div className="grid grid-cols-2 gap-1.5">
            {PRODUCT_CATEGORIES.map(({ key, label }) => {
              const isChecked = advancedFilters.productCategories.includes(key);
              return (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-1.5 text-[11px] font-bold"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() =>
                      setAdvancedFilters({
                        ...advancedFilters,
                        productCategories: toggleValue(advancedFilters.productCategories, key),
                      })
                    }
                    className="h-3.5 w-3.5 border-2 border-black accent-[#139a82]"
                  />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="border-2 border-black bg-[#efe3cf] p-2 shadow-[2px_2px_0_#000]">
          <h4 className="mb-2 flex items-center justify-between border-b border-black pb-1 text-[12px] font-black uppercase">
            <span>Size</span>
            {advancedFilters.sizeQuery && (
              <button
                onClick={() => setAdvancedFilters({ ...advancedFilters, sizeQuery: "" })}
                className="text-[10px] lowercase underline"
                type="button"
              >
                clear
              </button>
            )}
          </h4>
          <div className="space-y-2">
            <input
              type="text"
              placeholder="z.B. size:>10gb, size:<5gb"
              value={advancedFilters.sizeQuery}
              onChange={(e) =>
                setAdvancedFilters({ ...advancedFilters, sizeQuery: e.target.value })
              }
              className="neo-copy h-8 w-full border-2 border-black bg-[#f4ead8] px-2 text-[11px] font-bold outline-none placeholder:text-[#686157]"
            />
            <div className="flex gap-1">
              {SIZE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => setAdvancedFilters({ ...advancedFilters, sizeQuery: preset })}
                  className="border border-black bg-[#ded3c1] px-1.5 py-0.5 text-[9px] font-black uppercase hover:bg-[#d5c7b1]"
                  type="button"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>

        {(dynamicCollections.length > 0 || Object.keys(manualCollections).length > 0) && (
          <div className="border-2 border-black bg-[#efe3cf] p-2 shadow-[2px_2px_0_#000]">
            <h4 className="mb-2 flex items-center justify-between border-b border-black pb-1 text-[12px] font-black uppercase">
              <span>Collections</span>
              {(selectedCollectionName || selectedManualCollectionName) && (
                <button
                  type="button"
                  onClick={onClearCollectionSelection}
                  className="text-[10px] lowercase underline"
                >
                  clear
                </button>
              )}
            </h4>
            <div className="flex flex-wrap gap-1">
              {dynamicCollections.map((collection) => (
                <button
                  key={`dynamic-${collection.name}`}
                  type="button"
                  onClick={() => onApplyDynamicCollection(collection.name)}
                  className={`border-2 border-black px-2 py-0.5 text-[10px] font-black uppercase transition ${
                    selectedCollectionName === collection.name
                      ? "bg-[#b7102a] text-white shadow-[1px_1px_0_#000]"
                      : "bg-[#ded3c1] hover:bg-[#d5c7b1]"
                  }`}
                >
                  {collection.name}
                </button>
              ))}
              {Object.keys(manualCollections).map((collectionName) => (
                <button
                  key={`manual-${collectionName}`}
                  type="button"
                  onClick={() => onSelectManualCollection(collectionName)}
                  className={`border-2 border-black px-2 py-0.5 text-[10px] font-black uppercase transition ${
                    selectedManualCollectionName === collectionName
                      ? "bg-[#139a82] text-white shadow-[1px_1px_0_#000]"
                      : "bg-[#ded3c1] hover:bg-[#d5c7b1]"
                  }`}
                >
                  {collectionName}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 border-4 border-[#b7102a] bg-[#fbf4e7] p-2 shadow-[2px_2px_0_#000]">
          <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-black text-[#b7102a] uppercase">
            <Sparkles className="h-3.5 w-3.5" />
            Save as Dynamic Collection
          </h4>
          <div className="flex gap-1.5">
            <input
              type="text"
              placeholder="Collection Name..."
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              className="neo-copy h-8 flex-1 border-2 border-black bg-[#f4ead8] px-2 text-[11px] font-bold outline-none"
            />
            <button
              onClick={() => onSaveDynamicCollection(newCollectionName)}
              disabled={!newCollectionName.trim()}
              className="border-2 border-black bg-[#b7102a] px-3 py-1 text-[10px] font-black text-white uppercase hover:bg-[#9a0b20] disabled:opacity-45"
              type="button"
            >
              Save
            </button>
          </div>
        </div>
      </div>

      <div className="mt-5 flex gap-2 border-t-2 border-black pt-3">
        <button
          onClick={onResetAdvanced}
          className="flex-1 border-2 border-black bg-[#efe3cf] py-1.5 text-[11px] font-black uppercase hover:bg-[#d8cbb7]"
          type="button"
        >
          Reset Filters
        </button>
        <button
          onClick={onClose}
          className="flex-1 border-2 border-black bg-black py-1.5 text-[11px] font-black text-white uppercase hover:bg-[#2c2c2c]"
          type="button"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-2 border-black bg-[#efe3cf] p-2 shadow-[2px_2px_0_#000]">
      <h4 className="mb-2 border-b border-black pb-1 text-[12px] font-black uppercase">{title}</h4>
      <div className="grid grid-cols-3 gap-1">{children}</div>
    </div>
  );
}

function FilterCheckboxSection({
  title,
  values,
  options,
  onClear,
  onToggle,
}: {
  title: string;
  values: string[];
  options: string[];
  onClear?: () => void;
  onToggle: (value: string) => void;
}) {
  return (
    <div className="border-2 border-black bg-[#efe3cf] p-2 shadow-[2px_2px_0_#000]">
      <h4 className="mb-2 flex items-center justify-between border-b border-black pb-1 text-[12px] font-black uppercase">
        <span>{title}</span>
        {values.length > 0 && (
          <button
            aria-label={`Clear ${title}`}
            onClick={() =>
              onClear
                ? onClear()
                : options.forEach((opt) => {
                    if (values.includes(opt)) onToggle(opt);
                  })
            }
            className="text-[10px] lowercase underline"
            type="button"
          >
            clear
          </button>
        )}
      </h4>
      <div className="grid grid-cols-2 gap-1.5">
        {options.map((opt) => {
          const isChecked = values.includes(opt);
          return (
            <label
              key={opt}
              className="flex cursor-pointer items-center gap-1.5 text-[11px] font-bold"
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => onToggle(opt)}
                className="h-3.5 w-3.5 border-2 border-black accent-[#139a82]"
              />
              <span>{opt}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function ToggleButton({
  label,
  isChecked,
  onToggle,
  wide,
}: {
  label: string;
  isChecked: boolean;
  onToggle: () => void;
  wide?: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      className={`border-2 border-black px-1 py-1 text-[10px] font-black uppercase transition ${
        isChecked
          ? "bg-[#139a82] text-white shadow-[1px_1px_0_#000]"
          : "bg-[#ded3c1] hover:bg-[#d5c7b1]"
      } ${wide ? "" : "text-[9px]"}`}
      type="button"
    >
      {label}
    </button>
  );
}
