import {
  Download,
  PlaySquare,
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
];

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  return (
    <nav className="col-span-2 -mx-1 min-w-0 overflow-hidden lg:col-span-1 lg:mx-0 lg:flex-1">
      <div className="flex gap-2 overflow-x-auto px-1 pb-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.key && activePage === item.key;

          return (
            <button
              key={item.label}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "neo-copy flex h-10 shrink-0 items-center gap-2 border-2 px-3 text-[11px] font-bold uppercase transition xl:px-4",
                isActive
                  ? "border-black bg-[#087d6d] text-white shadow-[4px_4px_0_#171411]"
                  : "border-transparent bg-transparent text-[#171411] hover:border-black hover:bg-[#efe6d4]",
              )}
              disabled={!item.key}
              type="button"
              onClick={() => item.key && onNavigate(item.key)}
            >
              <Icon className="h-5 w-5" />
              <span className="hidden xs:inline xl:inline">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
