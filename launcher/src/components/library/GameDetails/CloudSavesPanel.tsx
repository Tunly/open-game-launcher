import { Cloud, ExternalLink, ShieldCheck } from "lucide-react";

import type { Game } from "../../../lib/types";

interface CloudSavesPanelProps {
  game: Game;
}

const PLATFORM_CLOUD_LABELS: Record<string, string> = {
  battlenet: "Battle.net Cloud",
  ea: "EA App Cloud",
  epic: "Epic Cloud Saves",
  gog: "GOG Galaxy Cloud Saves",
  steam: "Steam Cloud",
  ubisoft: "Ubisoft Connect Cloud",
  xbox: "Xbox Cloud Saves",
};

function getPlatformCloudLabel(game: Game): string {
  const launcher = game.launcher?.toLowerCase() ?? "";
  return PLATFORM_CLOUD_LABELS[launcher] ?? "Platform Cloud Saves";
}

export function CloudSavesPanel({ game }: CloudSavesPanelProps) {
  const platformCloudLabel = getPlatformCloudLabel(game);

  return (
    <section
      aria-label="Platform cloud saves"
      className="neo-dots border-4 border-black bg-[#fbf4e7] shadow-[3px_3px_0_#171411]"
      style={{ fontFamily: '"Arial Narrow", Impact, sans-serif' }}
    >
      <div className="flex items-center justify-between gap-2 border-b-2 border-black px-3 py-2">
        <div>
          <p className="neo-copy text-[9px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
            Platform Managed
          </p>
          <h2 className="neo-title text-[15px] font-black uppercase leading-none">
            Platform Cloud Saves
          </h2>
        </div>
        <Cloud className="h-7 w-7 text-[#087d6d]" />
      </div>

      <div className="space-y-3 p-3 text-[12px] font-bold">
        <div className="border-2 border-black bg-[#f3e8d7] p-3 shadow-[2px_2px_0_#171411]">
          <div className="mb-2 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#087d6d]" />
            <span className="neo-copy text-[10px] font-black uppercase text-[#171411]">
              {platformCloudLabel}
            </span>
          </div>
          <p className="neo-copy text-[10px] font-black uppercase leading-5 text-[#55504a]">
            Use {platformCloudLabel} for save sync. OG-Launcher no longer uploads, restores, or
            stores game saves in its own cloud.
          </p>
        </div>

        <div className="grid gap-2 text-[10px] font-black uppercase sm:grid-cols-2">
          <div className="border-2 border-black bg-[#fff9ed] p-2">
            <p className="neo-copy mb-1 text-[9px] font-black uppercase text-[#655f58]">
              Launcher Action
            </p>
            <p className="text-[#171411]">Launch and track locally</p>
          </div>
          <div className="border-2 border-black bg-[#fff9ed] p-2">
            <p className="neo-copy mb-1 text-[9px] font-black uppercase text-[#655f58]">
              Sync Owner
            </p>
            <p className="text-[#087d6d]">Handled by the platform</p>
          </div>
        </div>

        <p className="neo-copy flex items-start gap-2 border-2 border-black bg-[#171411] p-2 text-[9px] font-black uppercase leading-4 text-white">
          <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8cf5e4]" />
          Open the original platform client to review cloud status, conflicts, and restore options.
        </p>
      </div>
    </section>
  );
}
