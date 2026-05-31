import { useEffect, useRef, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  Bell,
  ChevronDown,
  CheckCircle2,
  Download,
  Gift,
  LogIn,
  LogOut,
  Settings,
  UserCircle,
  Users,
  X,
} from "lucide-react";

import { Sidebar, type PageKey } from "./Sidebar";
import { DesktopTitleBar } from "./DesktopTitleBar";
import { useDownloadStore } from "../../stores/downloadStore";
import { getDownloadQueue } from "../../lib/launcher";
import type { DownloadItem } from "../../lib/types";

interface AppShellProps {
  activePage: PageKey;
  authAvatarUrl: string | null;
  authDisplayName: string | null;
  authEmail: string | null;
  authUsername: string | null;
  authProfilePath: string | null;
  children: ReactNode;
  isAuthConfigured: boolean;
  isAuthLoading: boolean;
  isAuthProfileLoading: boolean;
  isAuthenticated: boolean;
  title: string;
  subtitle: string;
  onLogout: () => Promise<void>;
  onNavigate: (page: PageKey) => void;
  onRoute?: (path: string) => void;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: string;
  isUnread: boolean;
  type: "download" | "update" | "social";
  action?: {
    label: string;
    page: PageKey;
  };
}

const notificationItems: NotificationItem[] = [
  {
    id: "download-complete",
    title: "Download Complete",
    message: "Akira's Revenge is ready to launch.",
    time: "Just now",
    isUnread: true,
    type: "download",
    action: { label: "Open Downloads", page: "downloads" },
  },
  {
    id: "update-ready",
    title: "Update Available",
    message: "Neo-Tokyo Drift has a new content pack.",
    time: "12 Min.",
    isUnread: true,
    type: "update",
    action: { label: "Open Library", page: "library" },
  },
  {
    id: "store-drop",
    title: "New Store Drop",
    message: "Three new indie titles just landed in the store.",
    time: "1 hr",
    isUnread: true,
    type: "social",
    action: { label: "View Store", page: "store" },
  },
];

export function AppShell({
  activePage,
  authAvatarUrl,
  authDisplayName,
  authEmail,
  authUsername,
  authProfilePath,
  children,
  isAuthConfigured,
  isAuthLoading,
  isAuthProfileLoading,
  isAuthenticated,
  onLogout,
  onNavigate,
  onRoute,
}: AppShellProps) {
  const [isNotificationMenuOpen, setIsNotificationMenuOpen] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const notificationMenuRef = useRef<HTMLDivElement | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const accountLabel = authDisplayName ?? authEmail ?? "Account";
  const avatarInitials = getInitials(accountLabel);
  const profileMenuLabel = authUsername ?? accountLabel;
  const profileMenuInitials = getInitials(profileMenuLabel);
  const unreadNotificationCount = notificationItems.filter(
    (item) => item.isUnread && !readNotificationIds.has(item.id),
  ).length;

  const downloadCount = useDownloadStore((s) => s.activeCount());

  useEffect(() => {
    if (!isProfileMenuOpen && !isNotificationMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;

      if (
        isProfileMenuOpen &&
        profileMenuRef.current &&
        !profileMenuRef.current.contains(target)
      ) {
        setIsProfileMenuOpen(false);
      }

      if (
        isNotificationMenuOpen &&
        notificationMenuRef.current &&
        !notificationMenuRef.current.contains(target)
      ) {
        setIsNotificationMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsProfileMenuOpen(false);
        setIsNotificationMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isNotificationMenuOpen, isProfileMenuOpen]);

  useEffect(() => {
    function resetHorizontalScroll() {
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;

      if (window.scrollX !== 0) {
        window.scrollTo({ left: 0, top: window.scrollY });
      }
    }

    resetHorizontalScroll();
    window.addEventListener("resize", resetHorizontalScroll);

    return () => {
      window.removeEventListener("resize", resetHorizontalScroll);
    };
  }, [activePage]);

  // Initial download queue load + global listener for badge/cross-page state
  useEffect(() => {
    let active = true;

    const unlistenPromise = listen<DownloadItem>(
      "download_progress",
      (event) => {
        if (active) {
          useDownloadStore.getState().upsertItem(event.payload);
        }
      },
    );

    getDownloadQueue()
      .then((queue) => {
        if (active) {
          useDownloadStore.getState().setItems(queue);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  async function handleLogout() {
    setIsProfileMenuOpen(false);
    await onLogout();
    onNavigate("store");
  }

  return (
    <div className="flex min-h-screen min-w-0 bg-[#fff9ed] text-[#1f1c0f]">
      <div className="min-w-0 flex-1">
        <DesktopTitleBar />
        <header className="app-main-header sticky top-0 z-30 flex min-h-20 w-full max-w-full flex-wrap items-center gap-x-3 gap-y-2 overflow-visible border-b-[7px] border-black bg-[#fff9ed] px-3 py-3 sm:px-4 lg:px-5">
          <button
            className="neo-title max-w-[min(50vw,250px)] shrink truncate text-left text-[clamp(1.75rem,3.2vw,2.75rem)] leading-none text-[#b7102a] xl:max-w-none xl:text-[clamp(2rem,3vw,3rem)]"
            type="button"
            onClick={() => onNavigate("store")}
          >
            OG-Launcher
          </button>

          <div className="order-3 min-w-0 flex-1 basis-full sm:order-none sm:basis-auto">
            <Sidebar activePage={activePage} downloadCount={downloadCount} onNavigate={onNavigate} />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            <div ref={notificationMenuRef} className="relative">
              <TopIconButton
                label="Notifications"
                disabled={!isAuthenticated}
                onClick={() => {
                  setIsNotificationMenuOpen((isOpen) => !isOpen);
                  setIsProfileMenuOpen(false);
                }}
              >
                {unreadNotificationCount > 0 ? (
                  <span className="neo-copy absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center border-2 border-black bg-[#b7102a] px-1 text-[10px] font-black text-white">
                    {unreadNotificationCount}
                  </span>
                ) : null}
                <Bell className="h-5 w-5" />
              </TopIconButton>

              {isNotificationMenuOpen ? (
                <NotificationMenu
                  unreadNotificationCount={unreadNotificationCount}
                  readNotificationIds={readNotificationIds}
                  onClose={() => setIsNotificationMenuOpen(false)}
                  onMarkAllRead={() =>
                    setReadNotificationIds(
                      new Set(notificationItems.map((item) => item.id)),
                    )
                  }
                  onAction={(item, page) => {
                    setReadNotificationIds((current) => {
                      const next = new Set(current);
                      next.add(item.id);
                      return next;
                    });
                    setIsNotificationMenuOpen(false);
                    onNavigate(page);
                  }}
                />
              ) : null}
            </div>

            {authEmail ? (
              <div ref={profileMenuRef} className="relative">
                <button
                  aria-expanded={isProfileMenuOpen}
                  aria-haspopup="menu"
                  aria-label="Open profile menu"
                  className="flex h-12 items-center gap-2 border-[3px] border-black bg-[#fff9ed] p-1 shadow-[3px_3px_0_#1f1c0f] transition hover:-translate-y-0.5 hover:bg-[#f6edd8]"
                  disabled={isAuthLoading || !isAuthConfigured}
                  type="button"
                  onClick={() => {
                    setIsProfileMenuOpen((isOpen) => !isOpen);
                    setIsNotificationMenuOpen(false);
                  }}
                >
                  <Avatar
                    avatarUrl={authAvatarUrl}
                    initials={avatarInitials}
                    label={accountLabel}
                  />
                  <ChevronDown
                    aria-hidden="true"
                    className="mr-1 h-4 w-4 text-[#1f1c0f]"
                  />
                </button>

                {isProfileMenuOpen ? (
                  <ProfileMenu
                    accountLabel={accountLabel}
                    authAvatarUrl={authAvatarUrl}
                    authProfilePath={authProfilePath}
                    avatarInitials={profileMenuInitials}
                    isAuthProfileLoading={isAuthProfileLoading}
                    usernameLabel={profileMenuLabel}
                    onClose={() => setIsProfileMenuOpen(false)}
                    onLogout={() => void handleLogout()}
                    onNavigate={onNavigate}
                    onRoute={onRoute}
                  />
                ) : null}
              </div>
            ) : (
              <TopIconButton
                label="Login"
                disabled={isAuthLoading || !isAuthConfigured}
                onClick={() => onRoute?.("/auth")}
              >
                <LogIn className="h-5 w-5" />
              </TopIconButton>
            )}
          </div>
        </header>

        <main
          className={
            activePage === "library"
              ? "app-library-main neo-dots h-[calc(100vh-80px)] min-h-0 min-w-0 overflow-hidden"
              : "neo-dots min-h-[calc(100vh-80px)] min-w-0"
          }
        >
          <div
            className={
              activePage === "library"
                ? "h-full min-h-0 w-full overflow-hidden px-0 py-0"
                : "mx-auto w-full max-w-[1220px] px-6 py-7"
            }
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function TopIconButton({
  children,
  disabled = false,
  label,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="relative flex h-12 w-12 items-center justify-center border-[3px] border-black bg-[#fff9ed] text-[#1f1c0f] shadow-[3px_3px_0_#1f1c0f] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4] disabled:cursor-not-allowed disabled:opacity-45"
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function NotificationMenu({
  onAction,
  onClose,
  onMarkAllRead,
  readNotificationIds,
  unreadNotificationCount,
}: {
  onAction: (item: NotificationItem, page: PageKey) => void;
  onClose: () => void;
  onMarkAllRead: () => void;
  readNotificationIds: Set<string>;
  unreadNotificationCount: number;
}) {
  return (
    <div
      aria-label="Notifications"
      className="absolute right-0 top-full z-50 mt-3 w-[min(22rem,calc(100vw-2rem))] border-4 border-black bg-[#fff9ed] p-3 shadow-[7px_7px_0_#1f1c0f]"
      role="dialog"
    >
      <div className="mb-3 flex items-start justify-between gap-3 border-b-2 border-black pb-3">
        <div>
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.14em] text-[#b7102a]">
            Launcher Feed
          </p>
          <h2 className="neo-title text-3xl leading-none text-[#1f1c0f]">
            Notifications
          </h2>
        </div>
        <button
          aria-label="Close notifications"
          className="flex h-9 w-9 items-center justify-center border-2 border-black bg-[#f6edd8] shadow-[2px_2px_0_#1f1c0f]"
          type="button"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-2">
        {notificationItems.map((item) => (
          <NotificationCard
            key={item.id}
            item={item}
            isUnread={item.isUnread && !readNotificationIds.has(item.id)}
            onAction={(page) => onAction(item, page)}
          />
        ))}
      </div>

      <button
        className="neo-copy mt-3 h-10 w-full border-2 border-black bg-[#1f1c0f] px-3 text-[11px] font-black uppercase tracking-[0.1em] text-[#fff9ed] shadow-[2px_2px_0_#1f1c0f] disabled:cursor-not-allowed disabled:opacity-45"
        disabled={unreadNotificationCount === 0}
        type="button"
        onClick={onMarkAllRead}
      >
        Mark all as read
      </button>
    </div>
  );
}

function NotificationCard({
  item,
  isUnread,
  onAction,
}: {
  item: NotificationItem;
  isUnread: boolean;
  onAction: (page: PageKey) => void;
}) {
  const action = item.action;

  return (
    <article
      className={`border-2 border-black p-3 shadow-[2px_2px_0_#1f1c0f] ${
        isUnread ? "bg-[#f6edd8]" : "bg-[#fff9ed]"
      }`}
    >
      <div className="flex gap-3">
        <NotificationIcon type={item.type} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="neo-copy text-[11px] font-black uppercase text-[#1f1c0f]">
              {item.title}
            </h3>
            <span className="neo-copy shrink-0 text-[10px] font-bold uppercase text-[#5b403f]">
              {item.time}
            </span>
          </div>
          <p className="mt-1 text-sm leading-5 text-[#5b403f]">
            {item.message}
          </p>
          {action ? (
            <button
              className="neo-copy mt-3 border-2 border-black bg-[#007166] px-3 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-white shadow-[2px_2px_0_#1f1c0f] transition hover:-translate-y-0.5"
              type="button"
              onClick={() => onAction(action.page)}
            >
              {action.label}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function NotificationIcon({ type }: { type: NotificationItem["type"] }) {
  const className =
    "flex h-9 w-9 shrink-0 items-center justify-center border-2 border-black bg-[#1f1c0f] text-[#fff9ed]";

  if (type === "download") {
    return (
      <span className={className}>
        <Download className="h-5 w-5" />
      </span>
    );
  }

  if (type === "update") {
    return (
      <span className={className}>
        <CheckCircle2 className="h-5 w-5" />
      </span>
    );
  }

  return (
    <span className={className}>
      <Gift className="h-5 w-5" />
    </span>
  );
}

function ProfileMenu({
  accountLabel,
  authAvatarUrl,
  authProfilePath,
  avatarInitials,
  isAuthProfileLoading,
  usernameLabel,
  onClose,
  onLogout,
  onNavigate,
  onRoute,
}: {
  accountLabel: string;
  authAvatarUrl: string | null;
  authProfilePath: string | null;
  avatarInitials: string;
  isAuthProfileLoading: boolean;
  usernameLabel: string;
  onClose: () => void;
  onLogout: () => void;
  onNavigate: (page: PageKey) => void;
  onRoute?: (path: string) => void;
}) {
  return (
    <div
      className="absolute right-0 top-full z-50 mt-3 w-72 border-4 border-black bg-[#fff9ed] p-3 shadow-[7px_7px_0_#1f1c0f]"
      role="menu"
    >
      <div className="mb-3 flex min-w-0 items-center gap-3 border-b-2 border-black pb-3">
        <Avatar
          avatarUrl={authAvatarUrl}
          initials={avatarInitials}
          label={accountLabel}
          size="lg"
        />
        <div className="min-w-0">
          <p className="neo-copy truncate text-[11px] font-black uppercase text-[#1f1c0f]">
            {usernameLabel}
          </p>
        </div>
      </div>
      <div className="space-y-2">
        <ProfileMenuItem
          disabled={isAuthProfileLoading || !authProfilePath}
          icon={<UserCircle className="h-5 w-5" />}
          label={isAuthProfileLoading ? "Loading profile" : "View profile"}
          onClick={() => {
            onClose();
            if (authProfilePath) {
              onRoute?.(authProfilePath);
            }
          }}
        />
        <ProfileMenuItem
          icon={<Users className="h-5 w-5" />}
          label="Friends"
          onClick={() => {
            onClose();
            onNavigate("friends");
          }}
        />
        <ProfileMenuItem
          icon={<Settings className="h-5 w-5" />}
          label="Settings"
          onClick={() => {
            onClose();
            onNavigate("settings");
          }}
        />
        <ProfileMenuItem
          icon={<LogOut className="h-5 w-5" />}
          label="Logout"
          tone="danger"
          onClick={onLogout}
        />
      </div>
    </div>
  );
}

function getInitials(label: string) {
  const [first = "", second = ""] = label
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);

  return `${first[0] ?? "U"}${second[0] ?? ""}`.toUpperCase();
}

function Avatar({
  avatarUrl,
  initials,
  label,
  size = "md",
}: {
  avatarUrl: string | null;
  initials: string;
  label: string;
  size?: "md" | "lg";
}) {
  const sizeClass = size === "lg" ? "h-12 w-12 text-sm" : "h-9 w-9 text-xs";

  if (avatarUrl) {
    return (
      <img
        alt={label}
        className={`${sizeClass} shrink-0 border-2 border-black bg-[#f6edd8] object-cover`}
        src={avatarUrl}
      />
    );
  }

  return (
    <span
      className={`neo-copy ${sizeClass} flex shrink-0 items-center justify-center border-2 border-black bg-[#007166] font-black uppercase text-white`}
    >
      {initials}
    </span>
  );
}

function ProfileMenuItem({
  disabled = false,
  icon,
  label,
  onClick,
  tone = "default",
}: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      className={`neo-copy flex h-11 w-full items-center gap-3 border-2 border-black px-3 text-left text-[11px] font-black uppercase tracking-[0.1em] shadow-[2px_2px_0_#1f1c0f] transition hover:-translate-y-0.5 ${
        tone === "danger"
          ? "bg-[#b7102a] text-white"
          : "bg-[#f6edd8] text-[#1f1c0f]"
      } disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0`}
      disabled={disabled}
      role="menuitem"
      type="button"
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}
