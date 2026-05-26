import {
  Gamepad2,
  HardDriveDownload,
  MessageSquareMore,
  Store,
  type LucideIcon,
} from "lucide-react";

import { cn } from "../../lib/utils";

export type PageKey =
  | "home"
  | "library"
  | "store"
  | "community"
  | "downloads"
  | "settings"
  | "profile"
  | "friends";

interface NavItem {
  key?: PageKey;
  label: string;
  icon: LucideIcon;
}

interface SidebarProps {
  activePage: PageKey;
  isDisabled?: boolean;
  onNavigate: (page: PageKey) => void;
}

const navItems: NavItem[] = [
  { key: "store", label: "Store", icon: Store },
  { key: "library", label: "Library", icon: Gamepad2 },
  { key: "community", label: "Community", icon: MessageSquareMore },
  { key: "downloads", label: "Downloads", icon: HardDriveDownload },
];

export function Sidebar({
  activePage,
  isDisabled = false,
  onNavigate,
}: SidebarProps) {
  return (
    <nav className="min-w-0 overflow-hidden">
      <div className="flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.key && activePage === item.key;

          return (
            <button
              key={item.label}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "neo-copy flex h-10 shrink-0 items-center gap-2 border-2 px-3 text-[11px] font-bold uppercase transition disabled:cursor-not-allowed disabled:opacity-45 xl:px-4",
                isActive
                  ? "border-black bg-[#007166] text-white shadow-[4px_4px_0_#1f1c0f]"
                  : "border-transparent bg-transparent text-current hover:border-black hover:bg-[#f6edd8]",
              )}
              disabled={isDisabled || !item.key}
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
