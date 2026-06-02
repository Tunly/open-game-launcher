import { Gamepad2, Monitor, Smartphone, Globe, type LucideIcon } from "lucide-react";
import type { CrossPlayPlatform } from "../../lib/types/crossplay";

const PLATFORM_ICON: Record<CrossPlayPlatform, LucideIcon> = {
  windows: Monitor, macos: Monitor, linux: Monitor,
  steam: Monitor, epic: Monitor, gog: Monitor, origin: Monitor, uplay: Monitor, battlenet: Monitor,
  xbox: Gamepad2, playstation: Gamepad2, switch: Gamepad2,
  ios: Smartphone, android: Smartphone,
  web: Globe,
};

const PLATFORM_LABEL: Record<CrossPlayPlatform, string> = {
  windows: "Windows", macos: "macOS", linux: "Linux",
  steam: "Steam", epic: "Epic", gog: "GOG", origin: "Origin", uplay: "Ubisoft", battlenet: "Battle.net",
  xbox: "Xbox", playstation: "PlayStation", switch: "Switch",
  ios: "iOS", android: "Android", web: "Web",
};

interface Props {
  platforms: CrossPlayPlatform[];
  className?: string;
}

export function CrossPlayBadge({ platforms, className = "" }: Props) {
  if (platforms.length === 0) return null;
  const shown = platforms.slice(0, 4);
  const remaining = platforms.length - shown.length;
  return (
    <div
      className={`inline-flex flex-wrap items-center gap-1 border-2 border-black bg-[#fff9ed] px-2 py-1 shadow-[2px_2px_0_#1f1c0f] ${className}`}
      title={`Cross-Play mit ${platforms.map((p) => PLATFORM_LABEL[p]).join(", ")}`}
    >
      <span className="text-[10px] font-bold uppercase tracking-wider">Cross-Play</span>
      {shown.map((p) => {
        const Icon = PLATFORM_ICON[p];
        return (
          <span
            key={p}
            className="inline-flex items-center gap-0.5 border border-black bg-[#8cf5e4] px-1 text-[10px] font-bold"
            title={PLATFORM_LABEL[p]}
          >
            <Icon className="h-3 w-3" />
          </span>
        );
      })}
      {remaining > 0 && (
        <span className="text-[10px] font-bold text-[#171411]">+{remaining}</span>
      )}
    </div>
  );
}
