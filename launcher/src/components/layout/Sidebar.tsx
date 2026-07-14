import {
  Activity,
  Gamepad2,
  HardDriveDownload,
  MessageSquareMore,
  PackagePlus,
  Store,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import { MODS_PAGE_ENABLED } from "../../lib/feature-flags";
import { cn } from "../../lib/utils";

export type PageKey =
  | "home"
  | "library"
  | "store"
  | "community"
  | "downloads"
  | "activity"
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
  { key: "activity", label: "Activity", icon: Activity },
  { key: "downloads", label: "Downloads", icon: HardDriveDownload },
  ...(MODS_PAGE_ENABLED
    ? ([{ key: "mods", label: "Mods", icon: PackagePlus }] satisfies NavItem[])
    : []),
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
      <div className="flex scrollbar-none gap-1 overflow-x-auto px-0.5 pb-1 sm:gap-2 sm:px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.key && activePage === item.key;
          const showBadge = item.key === "downloads" && downloadCount > 0;

          return (
            <button
              key={item.label}
              aria-current={isActive ? "page" : undefined}
              aria-label={item.label}
              className={cn(
                "neo-copy relative flex h-10 shrink-0 items-center gap-2 border-2 px-2 text-[11px] font-bold uppercase transition disabled:cursor-not-allowed disabled:opacity-45 sm:px-3 xl:px-4",
                isActive
                  ? "app-shell-active-nav border-black"
                  : "app-shell-dim-hover border-transparent bg-transparent text-current hover:border-black",
              )}
              disabled={isDisabled || !item.key}
              type="button"
              onClick={() => item.key && onNavigate(item.key)}
            >
              <Icon className="h-5 w-5" />
              <span className="xs:inline hidden xl:inline">{item.label}</span>
              {showBadge ? (
                <span className="neo-copy app-shell-primary absolute top-0 -right-1 flex h-5 min-w-5 items-center justify-center border-2 border-black px-1 text-[10px] font-black">
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
