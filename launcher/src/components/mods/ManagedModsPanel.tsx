import { ExternalLink, Power, RefreshCcw, Trash2, X } from "lucide-react";
import { useState } from "react";

import type { ModProvider } from "../../lib/types/mods";

type ActiveModProvider = Extract<ModProvider, "nexus" | "steam_workshop">;

export interface ManagedModView {
  author?: string | null;
  canRemove: boolean;
  canToggle: boolean;
  enabled: boolean;
  id: string;
  installedAt?: number | string | null;
  provider: ActiveModProvider;
  title: string;
  updateAvailable?: boolean;
  version?: string | null;
  status: "installed" | "disabled" | "external" | "update_available" | "damaged";
}

interface ManagedModsPanelProps {
  busyItemIds?: ReadonlySet<string>;
  error?: string | null;
  items: ManagedModView[];
  loading?: boolean;
  onOpenProvider: (item: ManagedModView) => void;
  onRemove: (item: ManagedModView) => void;
  onToggle: (item: ManagedModView) => void;
  onUpdate: (item: ManagedModView) => void;
}

export function ManagedModsPanel({
  busyItemIds,
  error,
  items,
  loading = false,
  onOpenProvider,
  onRemove,
  onToggle,
  onUpdate,
}: ManagedModsPanelProps) {
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  if (loading) {
    return (
      <div
        className="border-[3px] border-[#171411] bg-[#f6edd8] p-6 shadow-[5px_5px_0_#171411]"
        aria-busy="true"
      >
        <p className="neo-copy animate-pulse text-xs font-black tracking-[0.14em] uppercase">
          Reconciling local mods...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="border-[3px] border-[#171411] bg-[#b7102a] p-5 text-white shadow-[5px_5px_0_#171411]"
      >
        <p className="neo-copy text-xs font-black tracking-[0.14em] uppercase">Mod scan failed</p>
        <p className="neo-copy mt-2 text-sm">{error}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="neo-dots grid min-h-64 place-items-center border-[3px] border-[#171411] bg-[#f6edd8] p-6 text-center shadow-[5px_5px_0_#171411]">
        <div>
          <Power className="mx-auto h-10 w-10" strokeWidth={2.5} aria-hidden="true" />
          <h2 className="neo-title mt-3 text-2xl uppercase">No managed mods</h2>
          <p className="neo-copy mt-2 max-w-md text-xs leading-5 text-[#655f58]">
            Install a Nexus mod or subscribe in Steam, then it will appear here after local
            detection.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const busy = busyItemIds?.has(item.id) ?? false;
        const confirming = confirmRemoveId === item.id;
        return (
          <article
            key={`${item.provider}:${item.id}`}
            className="border-[3px] border-[#171411] bg-[#fff9ed] p-4 shadow-[4px_4px_0_#171411]"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`neo-copy border-2 border-[#171411] px-2 py-1 text-[9px] font-black tracking-[0.12em] uppercase ${
                      item.provider === "nexus"
                        ? "bg-[#b7102a] text-white"
                        : "bg-[#007166] text-white"
                    }`}
                  >
                    {item.provider === "nexus" ? "Nexus Mods" : "Steam Workshop"}
                  </span>
                  <span
                    className={`neo-copy border-2 border-[#171411] px-2 py-1 text-[9px] font-black tracking-[0.12em] uppercase ${
                      item.status === "damaged"
                        ? "bg-[#b7102a] text-white"
                        : item.provider === "steam_workshop"
                          ? "bg-[#007166] text-white"
                          : item.enabled
                            ? "bg-[#8cf5e4]"
                            : "bg-[#efe6d4] text-[#655f58]"
                    }`}
                  >
                    {item.status === "damaged"
                      ? "Needs attention"
                      : item.provider === "steam_workshop"
                        ? "Steam managed"
                        : item.enabled
                          ? "Enabled"
                          : "Disabled"}
                  </span>
                  {item.updateAvailable ? (
                    <span className="neo-copy border-2 border-[#171411] bg-[#b7102a] px-2 py-1 text-[9px] font-black tracking-[0.12em] text-white uppercase">
                      Update ready
                    </span>
                  ) : null}
                </div>
                <h3 className="neo-title truncate text-xl uppercase">{item.title}</h3>
                <p className="neo-copy mt-1 text-[10px] font-black tracking-[0.1em] text-[#655f58] uppercase">
                  {item.author?.trim() || "Unknown creator"}
                  {item.version ? ` // v${item.version}` : ""}
                  {item.installedAt ? ` // Installed ${formatInstalledAt(item.installedAt)}` : ""}
                </p>
              </div>

              {item.provider === "steam_workshop" || item.status === "damaged" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onOpenProvider(item)}
                  className="neo-copy flex min-h-10 shrink-0 items-center justify-center gap-2 border-[3px] border-[#171411] bg-[#007166] px-4 py-2 text-[10px] font-black tracking-[0.1em] text-white uppercase shadow-[3px_3px_0_#171411] hover:-translate-y-0.5 disabled:opacity-50"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />{" "}
                  {item.provider === "steam_workshop" ? "Manage in Steam" : "Continue on Nexus"}
                </button>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy || !item.canToggle}
                    onClick={() => onToggle(item)}
                    aria-label={`${item.enabled ? "Disable" : "Enable"} ${item.title}`}
                    className="neo-copy flex min-h-10 items-center gap-2 border-[3px] border-[#171411] bg-[#f6edd8] px-3 py-2 text-[10px] font-black tracking-[0.1em] uppercase shadow-[3px_3px_0_#171411] hover:bg-[#8cf5e4] disabled:opacity-50"
                  >
                    <Power className="h-4 w-4" aria-hidden="true" />{" "}
                    {item.enabled ? "Disable" : "Enable"}
                  </button>
                  {item.updateAvailable ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onUpdate(item)}
                      aria-label={`Update ${item.title}`}
                      className="neo-copy flex min-h-10 items-center gap-2 border-[3px] border-[#171411] bg-[#007166] px-3 py-2 text-[10px] font-black tracking-[0.1em] text-white uppercase shadow-[3px_3px_0_#171411] hover:-translate-y-0.5 disabled:opacity-50"
                    >
                      <RefreshCcw className="h-4 w-4" aria-hidden="true" /> Update
                    </button>
                  ) : null}
                  {item.canRemove && confirming ? (
                    <div className="flex border-[3px] border-[#171411] bg-[#b7102a] text-white">
                      <span className="neo-copy self-center px-2 text-[9px] font-black tracking-[0.08em] uppercase">
                        Remove?
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setConfirmRemoveId(null);
                          onRemove(item);
                        }}
                        aria-label={`Confirm remove ${item.title}`}
                        className="border-l-2 border-[#171411] px-3 py-2 hover:bg-[#171411] disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemoveId(null)}
                        aria-label={`Cancel removing ${item.title}`}
                        className="border-l-2 border-[#171411] px-3 py-2 hover:bg-[#171411]"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ) : item.canRemove ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmRemoveId(item.id)}
                      aria-label={`Remove ${item.title}`}
                      className="neo-copy flex min-h-10 items-center gap-2 border-[3px] border-[#171411] bg-[#b7102a] px-3 py-2 text-[10px] font-black tracking-[0.1em] text-white uppercase shadow-[3px_3px_0_#171411] hover:-translate-y-0.5 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" /> Remove
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function formatInstalledAt(value: string | number) {
  const date = new Date(typeof value === "number" && value < 10_000_000_000 ? value * 1000 : value);
  return Number.isNaN(date.getTime()) ? "recently" : date.toLocaleDateString();
}
