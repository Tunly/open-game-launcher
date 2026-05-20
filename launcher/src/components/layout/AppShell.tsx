import type { ReactNode } from "react";
import { Bell, Search, Settings, User } from "lucide-react";

import { Sidebar, type PageKey } from "./Sidebar";

interface AppShellProps {
  activePage: PageKey;
  children: ReactNode;
  title: string;
  subtitle: string;
  onNavigate: (page: PageKey) => void;
}

export function AppShell({ activePage, children, onNavigate }: AppShellProps) {
  return (
    <div className="min-h-screen bg-[#f5eedf] text-[#171411]">
      <header className="sticky top-0 z-30 flex h-20 items-center justify-between gap-4 border-b-4 border-black bg-[#f5eedf] px-6">
        <button
          className="neo-title shrink-0 text-4xl leading-none text-[#c20b2f] sm:text-5xl"
          type="button"
          onClick={() => onNavigate("library")}
        >
          Neo-Launcher
        </button>
        <div className="flex min-w-0 items-center gap-3">
          <label className="hidden h-10 w-[315px] items-center gap-3 border-2 border-black bg-[#efe6d4] px-3 shadow-[3px_3px_0_#171411] sm:flex">
              <Search className="h-5 w-5 shrink-0" />
              <input
                className="neo-copy min-w-0 flex-1 bg-transparent text-xs font-bold uppercase text-[#171411] outline-none placeholder:text-[#171411]"
                placeholder="Datenbank durchsuchen ..."
                type="search"
              />
          </label>
          <button
            aria-label="Settings"
            className="flex h-10 w-10 items-center justify-center border-2 border-black bg-[#efe6d4] shadow-[2px_2px_0_#171411]"
            type="button"
            onClick={() => onNavigate("settings")}
          >
            <Settings className="h-5 w-5" />
          </button>
          <button
            aria-label="Notifications"
            className="relative flex h-10 w-10 items-center justify-center border-2 border-black bg-[#efe6d4] shadow-[2px_2px_0_#171411]"
            type="button"
          >
            <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border border-black bg-[#c20b2f]" />
            <Bell className="h-5 w-5" />
          </button>
          <button
            aria-label="Profile"
            className="flex h-10 w-10 items-center justify-center border-2 border-black bg-[#171411] text-[#f5eedf] shadow-[2px_2px_0_#171411]"
            type="button"
          >
            <User className="h-6 w-6" />
          </button>
        </div>
      </header>

      <div className="md:flex">
        <Sidebar activePage={activePage} onNavigate={onNavigate} />
        <main className="neo-dots min-w-0 flex-1 border-l-4 border-black md:ml-64">
          <div className="w-full max-w-[1100px] px-5 py-6 sm:px-7">
          {children}
          </div>
        </main>
      </div>
    </div>
  );
}
