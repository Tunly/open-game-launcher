import { Download, Play, X } from "lucide-react";

import { PlatformSourceIcon } from "./PlatformIcons";
import { formatPlayTime, getGameSource } from "../../lib/formatters";
import type { Game } from "../../lib/types";

export interface ProviderPickerState {
  mode: "play" | "install";
  title: string;
  variants: Game[];
}

interface ProviderPickerDialogProps {
  state: ProviderPickerState | null;
  onClose: () => void;
  onSelect: (game: Game) => Promise<void>;
}

export function ProviderPickerDialog({ state, onClose, onSelect }: ProviderPickerDialogProps) {
  if (!state) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[85] grid place-items-center bg-[#171411]/90 bg-[radial-gradient(circle,rgba(255,249,237,0.14)_1px,transparent_1px)] bg-[length:10px_10px] px-4">
      <div className="w-full max-w-[560px] border-4 border-black bg-[#fbf4e7] shadow-[8px_8px_0_#171411]">
        <div className="flex items-center justify-between gap-3 border-b-4 border-black bg-[#b7102a] px-4 py-3 text-white">
          <div className="min-w-0">
            <p className="neo-copy text-[10px] font-black tracking-[0.14em] uppercase">
              {state.mode === "play" ? "Choose launch platform" : "Choose install platform"}
            </p>
            <h2 className="neo-title truncate text-2xl leading-none uppercase">{state.title}</h2>
          </div>
          <button
            type="button"
            className="grid h-8 w-8 shrink-0 place-items-center border-2 border-black bg-[#fbf4e7] text-[#171411] shadow-[2px_2px_0_#171411]"
            onClick={onClose}
            aria-label="Close provider picker"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2 p-4">
          {state.variants.map((variant) => {
            const source = getGameSource(variant);
            const isPlayMode = state.mode === "play";
            const ActionIcon = isPlayMode ? Play : Download;

            return (
              <button
                key={variant.id}
                type="button"
                className="grid w-full grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 border-4 border-black bg-[#f4ead8] p-3 text-left shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#efe3cf]"
                onClick={() => {
                  onClose();
                  void onSelect(variant);
                }}
              >
                <span className="grid h-9 w-9 place-items-center border-2 border-black bg-[#fbf4e7]">
                  <PlatformSourceIcon game={variant} className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] leading-tight font-black uppercase">
                    {source}
                  </span>
                  <span className="neo-copy mt-1 flex flex-wrap gap-2 text-[10px] font-bold text-[#55504a] uppercase">
                    <span>{variant.status.replace("_", " ")}</span>
                    <span>{formatPlayTime(variant.playtimeMinutes)}</span>
                  </span>
                </span>
                <span
                  className={`flex h-10 items-center gap-2 border-2 border-black px-3 text-[11px] font-black uppercase shadow-[2px_2px_0_#171411] ${
                    isPlayMode ? "bg-[#169b83] text-white" : "bg-[#b7102a] text-white"
                  }`}
                >
                  <ActionIcon className="h-4 w-4" />
                  {isPlayMode ? "Play" : "Install"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
