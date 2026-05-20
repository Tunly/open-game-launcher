import {
  Download,
  PlaySquare,
  Settings,
  ShoppingBag,
  Users,
  type LucideIcon,
} from "lucide-react";

import { cn } from "../../lib/utils";

export type PageKey =
  | "library"
  | "store"
  | "community"
  | "downloads"
  | "settings";

interface NavItem {
  key?: PageKey;
  label: string;
  icon: LucideIcon;
}

interface SidebarProps {
  activePage: PageKey;
  onNavigate: (page: PageKey) => void;
}

const navItems: NavItem[] = [
  { key: "store", label: "Store", icon: ShoppingBag },
  { key: "library", label: "Library", icon: PlaySquare },
  { key: "community", label: "Community", icon: Users },
  { key: "downloads", label: "Downloads", icon: Download },
  { key: "settings", label: "Settings", icon: Settings },
];

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  return (
    <aside className="sticky top-20 z-20 border-b-4 border-black bg-[#f5eedf] px-4 py-4 md:fixed md:bottom-0 md:left-0 md:top-20 md:flex md:w-64 md:flex-col md:border-b-0 md:px-6 md:py-5">
      <nav className="flex gap-3 overflow-x-auto pb-1 md:block md:space-y-4 md:overflow-visible md:pb-0">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.key && activePage === item.key;

          return (
            <button
              key={item.label}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "neo-copy flex h-12 shrink-0 items-center gap-3 border-2 px-4 text-xs font-bold uppercase transition md:w-full",
                isActive
                  ? "border-black bg-[#087d6d] text-white shadow-[4px_4px_0_#171411]"
                  : "border-transparent bg-transparent text-[#171411] hover:border-black hover:bg-[#efe6d4]",
              )}
              disabled={!item.key}
              type="button"
              onClick={() => item.key && onNavigate(item.key)}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto hidden md:block">
        <div className="h-0.5 bg-[#171411]" />
      </div>
    </aside>
  );
}
