import { Box, Radio, ShieldCheck } from "lucide-react";

import type { ModProvider } from "../../lib/types/mods";

type ActiveModProvider = Extract<ModProvider, "nexus" | "steam_workshop">;

interface ModProviderPickerProps {
  disabled?: boolean;
  onChange: (provider: ActiveModProvider) => void;
  value: ActiveModProvider;
}

const PROVIDERS: Array<{
  description: string;
  icon: typeof ShieldCheck;
  label: string;
  value: ActiveModProvider;
}> = [
  {
    description: "Official catalog + manager handoff",
    icon: ShieldCheck,
    label: "Nexus Mods",
    value: "nexus",
  },
  {
    description: "Steam client + local subscriptions",
    icon: Radio,
    label: "Steam Workshop",
    value: "steam_workshop",
  },
];

export function ModProviderPicker({ disabled = false, onChange, value }: ModProviderPickerProps) {
  return (
    <fieldset className="min-w-0">
      <legend className="neo-copy mb-2 text-[10px] font-black tracking-[0.18em] uppercase">
        02 // Provider
      </legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Mod provider">
        {PROVIDERS.map((provider) => {
          const Icon = provider.icon;
          const active = provider.value === value;

          return (
            <button
              key={provider.value}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onChange(provider.value)}
              className={`group flex min-h-14 items-center gap-3 border-[3px] border-[#171411] px-3 py-2 text-left shadow-[3px_3px_0_#171411] transition-transform focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#007166] disabled:cursor-not-allowed disabled:opacity-50 ${
                active
                  ? "bg-[#007166] text-white"
                  : "bg-[#f6edd8] text-[#171411] hover:-translate-y-0.5 hover:bg-[#8cf5e4]"
              }`}
            >
              <span
                className={`grid h-8 w-8 shrink-0 place-items-center border-2 border-[#171411] ${
                  active ? "bg-[#fff9ed] text-[#007166]" : "bg-[#fff9ed]"
                }`}
                aria-hidden="true"
              >
                <Icon className="h-4 w-4" strokeWidth={3} />
              </span>
              <span className="min-w-0">
                <span className="neo-copy block text-xs font-black tracking-[0.08em] uppercase">
                  {provider.label}
                </span>
                <span
                  className={`neo-copy block text-[9px] leading-tight font-bold tracking-[0.08em] whitespace-normal uppercase sm:truncate ${
                    active ? "text-white/80" : "text-[#655f58]"
                  }`}
                >
                  {provider.description}
                </span>
              </span>
              {active ? <Box className="ml-auto h-4 w-4 shrink-0" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
