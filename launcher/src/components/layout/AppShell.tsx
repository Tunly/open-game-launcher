import type { ReactNode } from "react";

import { Sidebar, type PageKey } from "./Sidebar";

interface AppShellProps {
  activePage: PageKey;
  children: ReactNode;
  title: string;
  subtitle: string;
  onNavigate: (page: PageKey) => void;
}

export function AppShell({
  activePage,
  children,
  title,
  subtitle,
  onNavigate,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-launcher-bg text-slate-100 md:flex">
      <Sidebar activePage={activePage} onNavigate={onNavigate} />
      <main className="min-w-0 flex-1 md:pl-72">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <header className="mb-6 flex flex-col justify-between gap-4 border-b border-white/10 pb-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-sm font-semibold uppercase text-sky-200">
                Open Game Launcher
              </p>
              <h1 className="mt-2 text-3xl font-bold text-white">{title}</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">
                {subtitle}
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Runtime
                </p>
                <p className="text-sm font-semibold text-white">Tauri 2</p>
              </div>
            </div>
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
