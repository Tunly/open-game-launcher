import type { ReactNode } from "react";
import { Bell, ChevronDown, LogIn, LogOut, Settings, UserCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useCurrentUser } from "../../hooks/useCurrentUser";
import { Sidebar, type PageKey } from "./Sidebar";

interface TopBarProps {
  activePage: PageKey;
  onNavigate: (page: PageKey) => void;
}

export function TopBar({ activePage, onNavigate }: TopBarProps) {
  const navigate = useNavigate();
  const { isConfigured, isLoading, signOut, user } = useCurrentUser();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const username = useMemo(() => {
    const metadata = user?.user_metadata as Record<string, unknown> | undefined;
    const metadataUsername = metadata?.username ?? metadata?.user_name;
    if (typeof metadataUsername === "string" && metadataUsername.trim()) {
      return metadataUsername;
    }

    return user?.email?.split("@")[0] ?? "profile";
  }, [user]);

  async function handleLogout() {
    setIsProfileOpen(false);
    await signOut();
    navigate("/");
  }

  return (
    <div className="sticky top-0 z-40 border-b border-white/10 bg-[#090b10]/95 backdrop-blur">
      <header className="mx-auto flex min-h-16 w-full max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
        <button
          className="text-left text-2xl font-black uppercase tracking-normal text-rose-400"
          type="button"
          onClick={() => navigate("/")}
        >
          OG Launcher
        </button>
        <div className="min-w-0 flex-1">
          <Sidebar activePage={activePage} onNavigate={onNavigate} />
        </div>
        <div className="relative">
          <button
            aria-expanded={isNotificationsOpen}
            aria-label="Notifications"
            className="relative flex h-10 w-10 items-center justify-center border border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.1]"
            disabled={!user}
            type="button"
            onClick={() => {
              setIsNotificationsOpen((isOpen) => !isOpen);
              setIsProfileOpen(false);
            }}
          >
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center bg-rose-500 px-1 text-xs font-bold">
              3
            </span>
            <Bell className="h-5 w-5" />
          </button>
          {isNotificationsOpen ? (
            <div className="absolute right-0 top-full mt-3 w-80 border border-white/15 bg-[#111827] p-4 shadow-2xl">
              <p className="text-xs font-bold uppercase text-sky-200">
                Launcher Feed
              </p>
              <h2 className="mt-1 text-xl font-bold text-white">
                Notifications
              </h2>
              {["Download ready", "New achievement", "Friend request"].map(
                (item) => (
                  <div
                    key={item}
                    className="mt-3 border border-white/10 bg-white/[0.04] p-3 text-sm text-slate-200"
                  >
                    {item}
                  </div>
                ),
              )}
            </div>
          ) : null}
        </div>
        {user ? (
          <div className="relative">
          <button
            aria-expanded={isProfileOpen}
            aria-label="Profile menu"
            className="flex h-10 items-center gap-2 border border-white/15 bg-white/[0.06] px-2 text-white hover:bg-white/[0.1]"
            disabled={isLoading || !isConfigured}
            type="button"
            onClick={() => {
              setIsProfileOpen((isOpen) => !isOpen);
              setIsNotificationsOpen(false);
            }}
          >
            <span className="flex h-7 w-7 items-center justify-center bg-teal-500 text-xs font-black text-slate-950">
              {username.slice(0, 2).toUpperCase()}
            </span>
            <ChevronDown className="h-4 w-4" />
          </button>
          {isProfileOpen ? (
            <div className="absolute right-0 top-full mt-3 w-64 border border-white/15 bg-[#111827] p-3 shadow-2xl">
              <p className="truncate text-sm font-bold text-white">
                {user?.email ?? "Not signed in"}
              </p>
              <div className="mt-3 space-y-2">
                <MenuButton
                  icon={<UserCircle className="h-4 w-4" />}
                  label="View profile"
                  onClick={() => {
                    setIsProfileOpen(false);
                    navigate(`/u/${username}`);
                  }}
                />
                <MenuButton
                  icon={<Settings className="h-4 w-4" />}
                  label="Profile settings"
                  onClick={() => {
                    setIsProfileOpen(false);
                    navigate("/settings/profile");
                  }}
                />
                <MenuButton
                  icon={<LogOut className="h-4 w-4" />}
                  label="Logout"
                  onClick={() => void handleLogout()}
                />
              </div>
            </div>
          ) : null}
          </div>
        ) : (
          <button
            className="inline-flex h-10 items-center gap-2 border border-white/15 bg-white/[0.06] px-3 text-sm font-bold text-white hover:bg-white/[0.1] disabled:opacity-50"
            disabled={isLoading || !isConfigured}
            type="button"
            onClick={() => navigate("/auth")}
          >
            <LogIn className="h-4 w-4" />
            Login
          </button>
        )}
      </header>
    </div>
  );
}

function MenuButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="flex w-full items-center gap-2 border border-white/10 bg-white/[0.04] px-3 py-2 text-left text-sm font-semibold text-slate-200 hover:bg-white/[0.08]"
      type="button"
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}
