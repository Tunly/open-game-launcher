import {
  Download,
  Gamepad2,
  Library,
  Settings,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";

import { cn } from "../../lib/utils";

export type PageKey = "library" | "store" | "downloads" | "settings";

interface NavItem {
  key: PageKey;
  label: string;
  icon: LucideIcon;
}

interface SidebarProps {
  activePage: PageKey;
  onNavigate: (page: PageKey) => void;
}

const navItems: NavItem[] = [
  { key: "library", label: "Library", icon: Library },
  { key: "store", label: "Store", icon: ShoppingBag },
  { key: "downloads", label: "Downloads", icon: Download },
  { key: "settings", label: "Settings", icon: Settings },
];

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  return (
    <aside className="sticky top-0 z-20 border-b border-white/10 bg-[#0b0e14]/95 px-4 py-4 backdrop-blur md:fixed md:inset-y-0 md:left-0 md:w-72 md:border-b-0 md:border-r md:px-5 md:py-6">
      <div className="flex items-center gap-3 md:mb-10">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-sky-300/30 bg-sky-400/10 text-sky-200">
          <Gamepad2 className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-bold text-white">Open Launcher</p>
          <p className="text-xs text-slate-500">Desktop MVP</p>
        </div>
      </div>

      <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 md:mt-0 md:block md:space-y-2 md:overflow-visible md:pb-0">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.key;

          return (
            <button
              key={item.key}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex h-11 shrink-0 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition md:w-full",
                isActive
                  ? "bg-sky-400 text-slate-950"
                  : "text-slate-400 hover:bg-white/[0.06] hover:text-white",
              )}
              type="button"
              onClick={() => onNavigate(item.key)}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="mt-8 hidden rounded-lg border border-white/10 bg-white/[0.04] p-4 md:block">
        <p className="text-xs font-semibold uppercase text-slate-500">
          Channel
        </p>
        <p className="mt-2 text-sm font-semibold text-white">Internal Alpha</p>
        <p className="mt-1 text-xs text-slate-400">Desktop launcher preview</p>
      </div>
    </aside>
  );
}
