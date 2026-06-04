import {
  Gamepad2,
  HardDriveDownload,
  MessageSquareMore,
  PackagePlus,
  Store,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import { cn } from "../../lib/utils";

export type PageKey =
  | "home"
  | "library"
  | "store"
  | "community"
  | "downloads"
  | "mods"
  | "achievements"
  | "settings"
  | "profile"
  | "friends"
  | "family"
  | "developer"
  | "news";

interface NavItem {
  key?: PageKey;
  label: string;
  icon: LucideIcon;
}

interface SidebarProps {
  activePage: PageKey;
  downloadCount?: number;
  isDisabled?: boolean;
  onNavigate: (page: PageKey) => void;
}

const navItems: NavItem[] = [
  { key: "library", label: "Library", icon: Gamepad2 },
  { key: "achievements", label: "Achievements", icon: Trophy },
  { key: "downloads", label: "Downloads", icon: HardDriveDownload },
  { key: "mods", label: "Mods", icon: PackagePlus },
  { key: "store", label: "Store", icon: Store },
  { key: "community", label: "Community", icon: MessageSquareMore },
];

export function Sidebar({
  activePage,
  downloadCount = 0,
  isDisabled = false,
  onNavigate,
}: SidebarProps) {
  return (
    <nav className="min-w-0 overflow-hidden">
      <div className="scrollbar-none flex gap-2 overflow-x-auto px-1 pb-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.key && activePage === item.key;
          const showBadge = item.key === "downloads" && downloadCount > 0;

          return (
            <button
              key={item.label}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "neo-copy relative flex h-10 shrink-0 items-center gap-2 border-2 px-3 text-[11px] font-bold uppercase transition disabled:cursor-not-allowed disabled:opacity-45 xl:px-4",
                isActive
                  ? "border-black bg-[#007166] text-white shadow-[4px_4px_0_#1f1c0f]"
                  : "border-transparent bg-transparent text-current hover:border-black hover:bg-[#f6edd8]",
              )}
              disabled={isDisabled || !item.key}
              type="button"
              onClick={() => item.key && onNavigate(item.key)}
            >
              <Icon className="h-5 w-5" />
              <span className="xs:inline hidden xl:inline">{item.label}</span>
              {showBadge ? (
                <span className="neo-copy absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center border-2 border-black bg-[#b7102a] px-1 text-[10px] font-black text-white">
                  {downloadCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
