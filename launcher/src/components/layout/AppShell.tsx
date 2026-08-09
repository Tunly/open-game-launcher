import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Bell,
  ChevronDown,
  CheckCircle2,
  DatabaseBackup,
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
import { DesktopWindowChrome, WindowDragRegion } from "./DesktopWindowChrome";
import {
  APP_SHELL_SKIN_CHANGED_EVENT,
  APP_SHELL_SKIN_STORAGE_KEY,
  readAppShellSkinId,
  resolveAppShellSkinId,
  type AppShellSkinId,
} from "../../lib/app-shell-skins";
import { selectActiveCount, useDownloadStore } from "../../stores/downloadStore";
import { useLauncherUpdateStore } from "../../stores/launcherUpdateStore";
import {
  BACKUP_REMINDER_SETTINGS_CHANGED_EVENT,
  formatBackupReminderDate,
  getBackupReminderStatus,
  isBackupReminderDue,
  markBackupReminderDone,
  readBackupReminderSettings,
  saveBackupReminderSettings,
  shouldAutoRunBackupReminder,
  snoozeBackupReminder,
} from "../../lib/backup-reminder";
import {
  getDownloadQueue,
  runBackupPlan,
  runScheduledPlatformClientUpdateChecks,
} from "../../lib/launcher";
import { STORAGE_KEYS } from "../../lib/storage-keys";
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
  type: "backup" | "download" | "update" | "social";
  action?: {
    label: string;
    page: PageKey;
  };
}

const BACKUP_REMINDER_POLL_MS = 60 * 60 * 1000;
const CLIENT_UPDATE_SCHEDULER_POLL_MS = 60 * 60 * 1000;
const BACKUP_AUTORUN_FAILURE_SNOOZE_MS = 60 * 60 * 1000;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isQueueItemAtLeastAsRecent(
  incoming: { eventRevision?: number; lastUpdatedAt?: number },
  current: { eventRevision?: number; lastUpdatedAt?: number },
) {
  const incomingRevision = incoming.eventRevision ?? 0;
  const currentRevision = current.eventRevision ?? 0;
  if (incomingRevision > 0 || currentRevision > 0) {
    if (currentRevision > 0 && incomingRevision <= 0) return false;
    if (incomingRevision > 0 && currentRevision <= 0) return true;
    return incomingRevision > currentRevision;
  }

  const incomingTimestamp = incoming.lastUpdatedAt ?? 0;
  const currentTimestamp = current.lastUpdatedAt ?? 0;

  if (currentTimestamp > 0 && incomingTimestamp <= 0) return false;
  if (incomingTimestamp <= 0 || currentTimestamp <= 0) return true;
  return incomingTimestamp >= currentTimestamp;
}

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
  onLogout,
  onNavigate,
  onRoute,
}: AppShellProps) {
  const [isNotificationMenuOpen, setIsNotificationMenuOpen] = useState(false);
  const [scheduledClientUpdateNotifications, setScheduledClientUpdateNotifications] = useState<
    NotificationItem[]
  >([]);
  const [scheduledBackupReminderNotifications, setScheduledBackupReminderNotifications] = useState<
    NotificationItem[]
  >([]);
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(() => new Set());
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [shellSkinId, setShellSkinId] = useState<AppShellSkinId>(() => readAppShellSkinId());
  const notificationMenuRef = useRef<HTMLDivElement | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const notificationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const profileTriggerRef = useRef<HTMLButtonElement | null>(null);
  const wasNotificationMenuOpenRef = useRef(false);
  const wasProfileMenuOpenRef = useRef(false);
  const isAutoBackupRunningRef = useRef(false);
  const accountLabel = authDisplayName ?? authEmail ?? "Account";
  const avatarInitials = getInitials(accountLabel);
  const profileMenuLabel = authUsername ?? accountLabel;
  const profileMenuInitials = getInitials(profileMenuLabel);
  const launcherUpdateStatus = useLauncherUpdateStore((state) => state.status);
  const launcherUpdateVersion = useLauncherUpdateStore((state) => state.latestVersion);
  const launcherUpdateNotifications: NotificationItem[] =
    launcherUpdateStatus === "available" && launcherUpdateVersion
      ? [
          {
            id: `launcher-update-${launcherUpdateVersion}`,
            title: "OG Launcher Update",
            message: `Signed version v${launcherUpdateVersion.replace(/^v/, "")} is ready to install.`,
            time: "Now",
            isUnread: true,
            type: "update",
            action: { label: "Review update", page: "settings" },
          },
        ]
      : [];
  const notificationItems = [
    ...launcherUpdateNotifications,
    ...scheduledBackupReminderNotifications,
    ...scheduledClientUpdateNotifications,
  ];
  const unreadNotificationCount = notificationItems.filter(
    (item) => item.isUnread && !readNotificationIds.has(item.id),
  ).length;

  const downloadCount = useDownloadStore(selectActiveCount);
  const isLibraryPage = activePage === "library";

  useEffect(() => {
    document.documentElement.dataset.ogShellSkin = shellSkinId;

    return () => {
      if (document.documentElement.dataset.ogShellSkin === shellSkinId) {
        delete document.documentElement.dataset.ogShellSkin;
      }
    };
  }, [shellSkinId]);

  useEffect(() => {
    function syncShellSkin(value: unknown = readAppShellSkinId()) {
      setShellSkinId(resolveAppShellSkinId(value));
    }

    function handleShellSkinChanged(event: Event) {
      const detail = event instanceof CustomEvent ? (event.detail as { skinId?: unknown }) : null;
      syncShellSkin(detail?.skinId ?? readAppShellSkinId());
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === APP_SHELL_SKIN_STORAGE_KEY) {
        syncShellSkin(event.newValue);
      }
    }

    syncShellSkin();
    window.addEventListener(APP_SHELL_SKIN_CHANGED_EVENT, handleShellSkinChanged);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(APP_SHELL_SKIN_CHANGED_EVENT, handleShellSkinChanged);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!isProfileMenuOpen && !isNotificationMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;

      if (isProfileMenuOpen && profileMenuRef.current && !profileMenuRef.current.contains(target)) {
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
    if (wasNotificationMenuOpenRef.current && !isNotificationMenuOpen && !isProfileMenuOpen) {
      notificationTriggerRef.current?.focus();
    }
    wasNotificationMenuOpenRef.current = isNotificationMenuOpen;
  }, [isNotificationMenuOpen, isProfileMenuOpen]);

  useEffect(() => {
    if (wasProfileMenuOpenRef.current && !isProfileMenuOpen && !isNotificationMenuOpen) {
      profileTriggerRef.current?.focus();
    }
    wasProfileMenuOpenRef.current = isProfileMenuOpen;
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
    let hydrated = false;
    let unlistenProgress: (() => void) | null = null;
    let unlistenRemoved: (() => void) | null = null;
    const pendingDownloadProgress = new Map<string, DownloadItem>();
    const removedBeforeHydration = new Set<string>();
    let flushHandle: number | null = null;
    let flushUsesAnimationFrame = false;

    function flushPendingDownloadProgress() {
      flushHandle = null;
      if (!active) {
        pendingDownloadProgress.clear();
        return;
      }
      if (!hydrated || pendingDownloadProgress.size === 0) return;

      const state = useDownloadStore.getState();
      const batch = [...pendingDownloadProgress.values()].filter((item) => {
        const current = state.items.find((entry) => entry.gameId === item.gameId);
        return !current || isQueueItemAtLeastAsRecent(item, current);
      });
      pendingDownloadProgress.clear();
      state.upsertItems(batch);
    }

    function scheduleDownloadProgressFlush() {
      if (flushHandle !== null) {
        return;
      }

      if (typeof window.requestAnimationFrame === "function") {
        flushUsesAnimationFrame = true;
        flushHandle = window.requestAnimationFrame(flushPendingDownloadProgress);
      } else {
        flushUsesAnimationFrame = false;
        flushHandle = window.setTimeout(flushPendingDownloadProgress, 16);
      }
    }

    const progressListenerRegistration = isTauri()
      ? listen<DownloadItem>("download_progress", (event) => {
          if (active) {
            removedBeforeHydration.delete(event.payload.gameId);
            pendingDownloadProgress.set(event.payload.gameId, event.payload);
            if (hydrated) {
              scheduleDownloadProgressFlush();
            }
          }
        }).then((unlisten) => {
          if (active) {
            unlistenProgress = unlisten;
          } else {
            unlisten();
          }
        })
      : Promise.resolve();
    const removedListenerRegistration = isTauri()
      ? listen<{ gameId: string }>("download_removed", (event) => {
          if (active) {
            pendingDownloadProgress.delete(event.payload.gameId);
            if (!hydrated) {
              removedBeforeHydration.add(event.payload.gameId);
            }
            useDownloadStore.getState().removeItem(event.payload.gameId);
          }
        }).then((unlisten) => {
          if (active) {
            unlistenRemoved = unlisten;
          } else {
            unlisten();
          }
        })
      : Promise.resolve();

    async function hydrateDownloadQueue() {
      await Promise.allSettled([progressListenerRegistration, removedListenerRegistration]);
      if (!active) return;

      try {
        const queue = await getDownloadQueue();
        if (!active) return;
        useDownloadStore
          .getState()
          .setItems(queue.filter((item) => !removedBeforeHydration.has(item.gameId)));
        hydrated = true;
        flushPendingDownloadProgress();
        removedBeforeHydration.clear();
      } catch {
        if (!active) return;
        hydrated = true;
        flushPendingDownloadProgress();
        removedBeforeHydration.clear();
      }
    }

    void hydrateDownloadQueue();

    return () => {
      active = false;
      if (flushHandle !== null) {
        if (flushUsesAnimationFrame) {
          window.cancelAnimationFrame(flushHandle);
        } else {
          window.clearTimeout(flushHandle);
        }
      }
      pendingDownloadProgress.clear();
      removedBeforeHydration.clear();
      unlistenProgress?.();
      unlistenRemoved?.();
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let active = true;

    async function runScheduledChecks() {
      try {
        const result = await runScheduledPlatformClientUpdateChecks();
        if (!active || result.updateCount === 0) {
          return;
        }
        setScheduledClientUpdateNotifications([
          {
            id: `client-update-scheduler-${result.checkedAt}`,
            title: "Client Update Check",
            message: result.message,
            time: "Just now",
            isUnread: true,
            type: "update",
            action: { label: "Open Library", page: "library" },
          },
        ]);
      } catch {
        if (!active) {
          return;
        }
      }
    }

    void runScheduledChecks();
    const intervalId = window.setInterval(runScheduledChecks, CLIENT_UPDATE_SCHEDULER_POLL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function syncBackupReminderNotification() {
      const settings = readBackupReminderSettings();
      if (!active) {
        return;
      }

      if (!isBackupReminderDue(settings)) {
        setScheduledBackupReminderNotifications([]);
        return;
      }

      const status = getBackupReminderStatus(settings);
      if (
        shouldAutoRunBackupReminder(settings, new Date(), isTauri()) &&
        !isAutoBackupRunningRef.current
      ) {
        isAutoBackupRunningRef.current = true;
        setScheduledBackupReminderNotifications([
          {
            id: `backup-auto-run-started-${settings.nextDueAt ?? settings.updatedAt ?? "due"}`,
            title: "Backup Auto-Run",
            message: `Running scheduled backup for ${settings.targetPath}.`,
            time: "Now",
            isUnread: true,
            type: "backup",
            action: { label: "Open Settings", page: "settings" },
          },
        ]);

        try {
          const result = await runBackupPlan({
            compression: settings.compression,
            includeLibraryData: settings.includeLibraryData,
            targetPath: settings.targetPath,
          });
          if (!active) {
            return;
          }
          const savedSettings = saveBackupReminderSettings(markBackupReminderDone(settings));
          setScheduledBackupReminderNotifications([
            {
              id: `backup-auto-run-finished-${result.manifestId}`,
              title: "Backup Auto-Run Complete",
              message: `${result.message} Next: ${formatBackupReminderDate(savedSettings.nextDueAt)}.`,
              time: "Just now",
              isUnread: true,
              type: "backup",
              action: { label: "Open Settings", page: "settings" },
            },
          ]);
        } catch (error) {
          if (!active) {
            return;
          }
          const retryAt = new Date(Date.now() + BACKUP_AUTORUN_FAILURE_SNOOZE_MS);
          const savedSettings = saveBackupReminderSettings(
            snoozeBackupReminder(settings, retryAt, new Date()),
          );
          setScheduledBackupReminderNotifications([
            {
              id: `backup-auto-run-failed-${settings.nextDueAt ?? settings.updatedAt ?? "due"}`,
              title: "Backup Auto-Run Failed",
              message: `${errorMessage(error)} Retry: ${formatBackupReminderDate(
                savedSettings.snoozedUntil,
              )}.`,
              time: "Just now",
              isUnread: true,
              type: "backup",
              action: { label: "Open Settings", page: "settings" },
            },
          ]);
        } finally {
          isAutoBackupRunningRef.current = false;
        }
        return;
      }

      setScheduledBackupReminderNotifications([
        {
          id: `backup-reminder-${settings.nextDueAt ?? settings.updatedAt ?? "due"}`,
          title: status.title,
          message: status.message,
          time: "Due now",
          isUnread: true,
          type: "backup",
          action: { label: "Open Settings", page: "settings" },
        },
      ]);
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEYS.BACKUP_REMINDER_SETTINGS) {
        void syncBackupReminderNotification();
      }
    }

    function handleReminderSettingsChanged() {
      void syncBackupReminderNotification();
    }

    void syncBackupReminderNotification();
    window.addEventListener(BACKUP_REMINDER_SETTINGS_CHANGED_EVENT, handleReminderSettingsChanged);
    window.addEventListener("storage", handleStorage);
    const intervalId = window.setInterval(syncBackupReminderNotification, BACKUP_REMINDER_POLL_MS);

    return () => {
      active = false;
      window.removeEventListener(
        BACKUP_REMINDER_SETTINGS_CHANGED_EVENT,
        handleReminderSettingsChanged,
      );
      window.removeEventListener("storage", handleStorage);
      window.clearInterval(intervalId);
    };
  }, []);

  async function handleLogout() {
    setIsProfileMenuOpen(false);
    await onLogout();
    onNavigate("store");
  }

  return (
    <div
      className={
        isLibraryPage
          ? "app-shell-root flex h-screen min-h-0 min-w-0 overflow-hidden"
          : "app-shell-root flex min-h-screen min-w-0"
      }
      data-og-shell-skin={shellSkinId}
    >
      <div
        className={
          isLibraryPage
            ? "flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            : "min-w-0 flex-1"
        }
      >
        <header
          className={`app-main-header app-shell-header sticky top-0 z-30 flex min-h-20 w-full max-w-full items-center gap-3 overflow-visible border-b-[7px] border-black px-3 py-3 sm:px-4 lg:px-5 ${
            isLibraryPage ? "shrink-0" : ""
          }`}
        >
          <button
            className="neo-title app-shell-brand max-w-[min(65vw,420px)] min-w-0 shrink truncate text-left text-[1.75rem] leading-none sm:text-[2rem] lg:text-[2.5rem] xl:text-[3rem]"
            type="button"
            onClick={() => onNavigate("library")}
          >
            OG-Launcher
          </button>

          <div className="app-shell-nav-row flex min-w-0 flex-1 items-center gap-3">
            <div className="min-w-0 flex-1">
              <Sidebar
                activePage={activePage}
                downloadCount={downloadCount}
                onNavigate={onNavigate}
              />
            </div>

            <WindowDragRegion />

            <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
              <div ref={notificationMenuRef} className="relative">
                <TopIconButton
                  ariaExpanded={isNotificationMenuOpen}
                  ariaHasPopup="dialog"
                  buttonRef={notificationTriggerRef}
                  label="Notifications"
                  noLift
                  onClick={() => {
                    setIsNotificationMenuOpen((isOpen) => !isOpen);
                    setIsProfileMenuOpen(false);
                  }}
                >
                  {unreadNotificationCount > 0 ? (
                    <span className="neo-copy app-shell-primary absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center border-2 border-black px-1 text-[10px] font-black">
                      {unreadNotificationCount}
                    </span>
                  ) : null}
                  <Bell className="h-4 w-4" />
                </TopIconButton>

                {isNotificationMenuOpen ? (
                  <NotificationMenu
                    items={notificationItems}
                    unreadNotificationCount={unreadNotificationCount}
                    readNotificationIds={readNotificationIds}
                    onClose={() => setIsNotificationMenuOpen(false)}
                    onMarkAllRead={() =>
                      setReadNotificationIds(new Set(notificationItems.map((item) => item.id)))
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
                    ref={profileTriggerRef}
                    aria-expanded={isProfileMenuOpen}
                    aria-haspopup="menu"
                    aria-label="Open profile menu"
                    className="app-shell-surface app-shell-dim-hover flex h-10 items-center gap-1.5 border-2 border-black p-1 transition"
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
                    <ChevronDown aria-hidden="true" className="mr-0.5 h-3.5 w-3.5 text-[#1f1c0f]" />
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
                  <LogIn className="h-4 w-4" />
                </TopIconButton>
              )}
            </div>
          </div>

          <DesktopWindowChrome />
        </header>

        <main
          className={
            isLibraryPage
              ? "app-library-main neo-dots min-h-0 min-w-0 flex-1 overflow-hidden"
              : "neo-dots min-h-[calc(100vh-80px)] min-w-0"
          }
        >
          <div
            className={
              isLibraryPage
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
  ariaExpanded,
  ariaHasPopup,
  buttonRef,
  children,
  disabled = false,
  label,
  noLift = false,
  onClick,
}: {
  ariaExpanded?: boolean;
  ariaHasPopup?: "dialog" | "menu";
  buttonRef?: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  noLift?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      ref={buttonRef}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHasPopup}
      aria-label={label}
      className={`app-shell-surface app-shell-dim-hover relative flex h-10 w-10 items-center justify-center border-2 border-black transition disabled:cursor-not-allowed disabled:opacity-45 ${
        noLift ? "" : "hover:-translate-y-0.5"
      }`}
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function NotificationMenu({
  items,
  onAction,
  onClose,
  onMarkAllRead,
  readNotificationIds,
  unreadNotificationCount,
}: {
  items: NotificationItem[];
  onAction: (item: NotificationItem, page: PageKey) => void;
  onClose: () => void;
  onMarkAllRead: () => void;
  readNotificationIds: Set<string>;
  unreadNotificationCount: number;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const menu = menuRef.current;
    menu?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();

    const handleKeyDown = (event: KeyboardEvent) =>
      handleMenuKeyDown(event, menu, "button:not([disabled])");
    menu?.addEventListener("keydown", handleKeyDown);
    return () => menu?.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div
      ref={menuRef}
      aria-label="Notifications"
      className="app-shell-surface absolute top-full right-0 z-50 mt-3 w-[min(22rem,calc(100vw-2rem))] border-4 border-black p-3 shadow-[7px_7px_0_#1f1c0f]"
      role="dialog"
      tabIndex={-1}
    >
      <div className="mb-3 flex items-start justify-between gap-3 border-b-2 border-black pb-3">
        <div>
          <p className="neo-copy text-[10px] font-black tracking-[0.14em] text-[#b7102a] uppercase">
            Launcher Feed
          </p>
          <h2 className="neo-title text-3xl leading-none text-[#1f1c0f]">Notifications</h2>
        </div>
        <button
          aria-label="Close notifications"
          className="app-shell-surface-dim app-shell-dim-hover flex h-9 w-9 items-center justify-center border-2 border-black shadow-[2px_2px_0_#1f1c0f]"
          type="button"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-2">
        {items.length > 0 ? (
          items.map((item) => (
            <NotificationCard
              key={item.id}
              item={item}
              isUnread={item.isUnread && !readNotificationIds.has(item.id)}
              onAction={(page) => onAction(item, page)}
            />
          ))
        ) : (
          <p className="neo-copy border-2 border-dashed border-black bg-[#f6edd8] p-4 text-[10px] leading-5 font-black text-[#5b403f] uppercase">
            No launcher notifications yet. Real launcher-update, download, backup, and client-update
            events will appear here.
          </p>
        )}
      </div>

      <button
        className="neo-copy mt-3 h-10 w-full border-2 border-black bg-[#1f1c0f] px-3 text-[11px] font-black tracking-[0.1em] text-[#fff9ed] uppercase shadow-[2px_2px_0_#1f1c0f] disabled:cursor-not-allowed disabled:opacity-45"
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
            <h3 className="neo-copy text-[11px] font-black text-[#1f1c0f] uppercase">
              {item.title}
            </h3>
            <span className="neo-copy shrink-0 text-[10px] font-bold text-[#5b403f] uppercase">
              {item.time}
            </span>
          </div>
          <p className="mt-1 text-sm leading-5 text-[#5b403f]">{item.message}</p>
          {action ? (
            <button
              className="neo-copy app-shell-secondary app-shell-secondary-hover mt-3 border-2 border-black px-3 py-2 text-[10px] font-black tracking-[0.1em] uppercase shadow-[2px_2px_0_#1f1c0f] transition hover:-translate-y-0.5"
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

  if (type === "backup") {
    return (
      <span className={className}>
        <DatabaseBackup className="h-5 w-5" />
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
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus();
  }, []);

  return (
    <div
      ref={menuRef}
      aria-label="Account menu"
      className="app-shell-surface absolute top-full right-0 z-50 mt-3 w-72 border-4 border-black p-3 shadow-[7px_7px_0_#1f1c0f]"
      role="menu"
      tabIndex={-1}
      onKeyDown={(event) =>
        handleMenuKeyDown(event, menuRef.current, '[role="menuitem"]:not([disabled])')
      }
    >
      <div className="mb-3 flex min-w-0 items-center gap-3 border-b-2 border-black pb-3">
        <Avatar
          avatarUrl={authAvatarUrl}
          initials={avatarInitials}
          label={accountLabel}
          size="lg"
        />
        <div className="min-w-0">
          <p className="neo-copy truncate text-[11px] font-black text-[#1f1c0f] uppercase">
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

function handleMenuKeyDown(
  event: { key: string; preventDefault: () => void },
  container: HTMLElement | null,
  selector: string,
) {
  if (!container || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;

  const items = Array.from(container.querySelectorAll<HTMLButtonElement>(selector));
  if (items.length === 0) return;

  event.preventDefault();
  const currentIndex = items.findIndex((item) => item === document.activeElement);
  if (event.key === "Home") {
    items[0]?.focus();
    return;
  }
  if (event.key === "End") {
    items.at(-1)?.focus();
    return;
  }

  const direction = event.key === "ArrowDown" ? 1 : -1;
  const nextIndex =
    currentIndex < 0
      ? direction === 1
        ? 0
        : items.length - 1
      : (currentIndex + direction + items.length) % items.length;
  items[nextIndex]?.focus();
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
  const sizeClass = size === "lg" ? "h-10 w-10 text-sm" : "h-8 w-8 text-xs";

  if (avatarUrl) {
    return (
      <img
        alt={label}
        className={`app-shell-surface-dim ${sizeClass} shrink-0 border-2 border-black object-cover`}
        src={avatarUrl}
      />
    );
  }

  return (
    <span
      className={`neo-copy app-shell-secondary ${sizeClass} flex shrink-0 items-center justify-center border-2 border-black font-black uppercase`}
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
      className={`neo-copy flex h-11 w-full items-center gap-3 border-2 border-black px-3 text-left text-[11px] font-black tracking-[0.1em] uppercase shadow-[2px_2px_0_#1f1c0f] transition ${tone === "danger" ? "app-shell-primary" : "app-shell-surface-dim"} disabled:cursor-not-allowed disabled:opacity-50`}
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
