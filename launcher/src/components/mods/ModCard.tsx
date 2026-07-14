import { CheckCircle2, Download, ExternalLink, RefreshCcw } from "lucide-react";

import type { ModInstallCapability, ModProvider } from "../../lib/types/mods";

type ActiveModProvider = Extract<ModProvider, "nexus" | "steam_workshop">;

export interface ModCardView {
  artworkUrl?: string | null;
  author?: string | null;
  capability: ModInstallCapability;
  downloads?: number | string | null;
  id: string;
  installed?: boolean;
  provider: ActiveModProvider;
  summary?: string | null;
  title: string;
  updateAvailable?: boolean;
  version?: string | null;
}

interface ModCardProps {
  busy?: boolean;
  item: ModCardView;
  onAction: (item: ModCardView) => void;
}

export function ModCard({ busy = false, item, onAction }: ModCardProps) {
  const action = getPrimaryAction(item);

  return (
    <article className="flex min-w-0 flex-col border-[3px] border-[#171411] bg-[#fff9ed] shadow-[5px_5px_0_#171411]">
      <div className="relative h-36 overflow-hidden border-b-[3px] border-[#171411] bg-[#efe6d4]">
        {item.artworkUrl ? (
          <img
            src={item.artworkUrl}
            alt=""
            className="h-full w-full object-cover contrast-110 saturate-[0.85]"
          />
        ) : (
          <div
            className={`h-full w-full ${
              item.provider === "nexus" ? "card-art-crash" : "card-art-drift"
            }`}
            aria-hidden="true"
          />
        )}
        <div className="neo-dots pointer-events-none absolute inset-0 opacity-25" />
        <span
          className={`neo-copy absolute top-2 left-2 border-2 border-[#171411] px-2 py-1 text-[9px] font-black tracking-[0.14em] uppercase shadow-[2px_2px_0_#171411] ${
            item.provider === "nexus" ? "bg-[#b7102a] text-white" : "bg-[#007166] text-white"
          }`}
        >
          {item.provider === "nexus" ? "Nexus Mods" : "Steam Workshop"}
        </span>
        {item.installed ? (
          <span className="neo-copy absolute right-2 bottom-2 flex items-center gap-1 border-2 border-[#171411] bg-[#8cf5e4] px-2 py-1 text-[9px] font-black tracking-[0.12em] uppercase">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Installed
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-3 flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="neo-title line-clamp-2 text-xl leading-[0.95] uppercase">
              {item.title}
            </h3>
            <p className="neo-copy mt-1 truncate text-[10px] font-black tracking-[0.1em] text-[#655f58] uppercase">
              By {item.author?.trim() || "Unknown creator"}
            </p>
          </div>
          {item.version ? (
            <span className="neo-copy shrink-0 border-2 border-[#171411] bg-[#f6edd8] px-2 py-1 text-[9px] font-black uppercase">
              v{item.version}
            </span>
          ) : null}
        </div>

        <p className="neo-copy mb-4 line-clamp-3 min-h-[3.75rem] text-xs leading-5 text-[#5b403f]">
          {item.summary?.trim() || "No description supplied by this provider."}
        </p>

        <div className="neo-copy mt-auto mb-3 flex items-center justify-between gap-3 border-y-2 border-[#171411] py-2 text-[10px] font-black tracking-[0.08em] uppercase">
          <span className="flex items-center gap-1.5">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            {formatDownloads(item.downloads)}
          </span>
          <span>{capabilityLabel(item.capability)}</span>
        </div>

        <button
          type="button"
          disabled={busy || action.disabled}
          onClick={() => onAction(item)}
          className={`neo-copy flex min-h-10 w-full items-center justify-center gap-2 border-[3px] border-[#171411] px-3 py-2 text-xs font-black tracking-[0.1em] uppercase shadow-[3px_3px_0_#171411] transition-transform focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#007166] disabled:cursor-not-allowed disabled:bg-[#d8d0c1] disabled:text-[#655f58] ${
            item.provider === "nexus"
              ? "bg-[#b7102a] text-white hover:-translate-y-0.5"
              : "bg-[#007166] text-white hover:-translate-y-0.5"
          }`}
        >
          {busy ? <RefreshCcw className="h-4 w-4 animate-spin" aria-hidden="true" /> : action.icon}
          {busy ? "Working..." : action.label}
        </button>
      </div>
    </article>
  );
}

function getPrimaryAction(item: ModCardView) {
  if (item.capability === "unavailable") {
    return { disabled: true, icon: null, label: "Unavailable" };
  }
  if (item.capability === "steam_handoff") {
    return {
      disabled: false,
      icon: <ExternalLink className="h-4 w-4" aria-hidden="true" />,
      label: item.installed ? "Manage in Steam" : "Browse in Steam",
    };
  }
  if (item.capability === "nxm_handoff") {
    return {
      disabled: false,
      icon: <ExternalLink className="h-4 w-4" aria-hidden="true" />,
      label: "Continue on Nexus",
    };
  }
  if (item.installed && !item.updateAvailable) {
    return {
      disabled: true,
      icon: <CheckCircle2 className="h-4 w-4" aria-hidden="true" />,
      label: "Installed",
    };
  }
  return {
    disabled: false,
    icon: item.updateAvailable ? (
      <RefreshCcw className="h-4 w-4" aria-hidden="true" />
    ) : (
      <Download className="h-4 w-4" aria-hidden="true" />
    ),
    label: item.updateAvailable ? "Update" : "Install",
  };
}

function capabilityLabel(capability: ModInstallCapability) {
  switch (capability) {
    case "native":
      return "Native ready";
    case "nxm_handoff":
      return "Nexus handoff";
    case "steam_handoff":
      return "Steam managed";
    default:
      return "Not supported";
  }
}

function formatDownloads(value: ModCardView["downloads"]) {
  if (typeof value === "number") {
    return `${new Intl.NumberFormat("en", { notation: "compact" }).format(value)} downloads`;
  }
  if (typeof value === "string" && value.trim()) {
    return `${value} downloads`;
  }
  return "Downloads n/a";
}
