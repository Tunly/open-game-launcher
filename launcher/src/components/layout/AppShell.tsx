import type { ReactNode } from "react";
import { Bell, LogOut, Search, Settings, User } from "lucide-react";

import { Sidebar, type PageKey } from "./Sidebar";

interface AppShellProps {
  activePage: PageKey;
  authEmail: string | null;
  children: ReactNode;
  isAuthConfigured: boolean;
  isAuthLoading: boolean;
  isAuthenticated: boolean;
  title: string;
  subtitle: string;
  onLogout: () => Promise<void>;
  onNavigate: (page: PageKey) => void;
}

export function AppShell({
  activePage,
  authEmail,
  children,
  isAuthConfigured,
  isAuthLoading,
  isAuthenticated,
  onLogout,
  onNavigate,
}: AppShellProps) {
  const isLocked = !isAuthenticated;

  return (
    <div className="min-h-screen bg-[#f5eedf] text-[#171411]">
      <div className="sticky top-0 z-30 border-b-4 border-black bg-[#f5eedf]">
        <header className="grid min-h-20 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-6 lg:flex lg:flex-wrap lg:gap-4 lg:py-4">
          <button
            className="neo-title min-w-0 truncate text-left text-[clamp(1.75rem,7vw,2.65rem)] leading-none text-[#c20b2f] lg:shrink-0"
            type="button"
            onClick={() => onNavigate("library")}
          >
            Open-Game-Launcher
          </button>
          <Sidebar
            activePage={activePage}
            isDisabled={isLocked}
            onNavigate={onNavigate}
          />
          <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3 lg:ml-auto">
            <label className="hidden h-10 w-[280px] items-center gap-3 border-2 border-black bg-[#efe6d4] px-3 shadow-[3px_3px_0_#171411] xl:flex">
              <Search className="h-5 w-5 shrink-0" />
              <input
                disabled={isLocked}
                className="neo-copy min-w-0 flex-1 bg-transparent text-xs font-bold uppercase text-[#171411] outline-none placeholder:text-[#171411]"
                placeholder="Datenbank durchsuchen ..."
                type="search"
              />
            </label>
            <button
              aria-label="Settings"
              className="flex h-10 w-10 items-center justify-center border-2 border-black bg-[#efe6d4] shadow-[2px_2px_0_#171411] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={isLocked}
              type="button"
              onClick={() => onNavigate("settings")}
            >
              <Settings className="h-5 w-5" />
            </button>
            <button
              aria-label="Notifications"
              className="relative flex h-10 w-10 items-center justify-center border-2 border-black bg-[#efe6d4] shadow-[2px_2px_0_#171411] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={isLocked}
              type="button"
            >
              <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border border-black bg-[#c20b2f]" />
              <Bell className="h-5 w-5" />
            </button>
            <button
              aria-label={authEmail ? "Logout" : "Profile"}
              className="neo-copy flex h-10 max-w-[190px] items-center justify-center gap-2 border-2 border-black bg-[#171411] px-3 text-[10px] font-bold uppercase text-[#f5eedf] shadow-[2px_2px_0_#171411] disabled:opacity-60 sm:min-w-10"
              disabled={isAuthLoading || !isAuthConfigured}
              type="button"
              onClick={() => {
                if (authEmail) {
                  void onLogout();
                } else {
                  onNavigate("library");
                }
              }}
            >
              {authEmail ? (
                <LogOut className="h-5 w-5 shrink-0" />
              ) : (
                <User className="h-5 w-5 shrink-0" />
              )}
              <span className="hidden min-w-0 truncate 2xl:inline">
                {authEmail ?? "Login"}
              </span>
            </button>
          </div>
        </header>
      </div>

      <main className="neo-dots min-w-0">
        <div className="mx-auto w-full max-w-[1180px] px-4 py-5 sm:px-6 sm:py-6 lg:px-7">
          {children}
        </div>
      </main>
    </div>
  );
}
