import { STORAGE_KEYS } from "./storage-keys";
import type { BackupCompressionMode } from "./types/backup";

export const BACKUP_REMINDER_SETTINGS_CHANGED_EVENT = "og-launcher:backup-reminder-settings";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export type BackupReminderCadence = "daily" | "weekly";
export type BackupReminderTone = "ready" | "warning" | "blocked";

export interface BackupReminderSettings {
  autoRunWhenDue: boolean;
  cadence: BackupReminderCadence;
  compression: BackupCompressionMode;
  enabled: boolean;
  includeLibraryData: boolean;
  lastRunAt: string | null;
  nextDueAt: string | null;
  snoozedUntil: string | null;
  targetPath: string;
  updatedAt: string | null;
}

export interface BackupReminderStatus {
  isDue: boolean;
  message: string;
  title: string;
  tone: BackupReminderTone;
}

export const DEFAULT_BACKUP_REMINDER_SETTINGS: BackupReminderSettings = {
  autoRunWhenDue: false,
  cadence: "weekly",
  compression: "none",
  enabled: false,
  includeLibraryData: true,
  lastRunAt: null,
  nextDueAt: null,
  snoozedUntil: null,
  targetPath: "",
  updatedAt: null,
};

export function computeNextBackupReminderDueAt(
  cadence: BackupReminderCadence,
  from: Date | string,
): string {
  const baseDate = coerceDate(from) ?? new Date();
  const interval = cadence === "daily" ? DAY_MS : WEEK_MS;
  return new Date(baseDate.getTime() + interval).toISOString();
}

export function normalizeBackupReminderSettings(
  value: unknown,
  now: Date = new Date(),
): BackupReminderSettings {
  if (!isPlainObject(value)) {
    return { ...DEFAULT_BACKUP_REMINDER_SETTINGS };
  }

  const cadence: BackupReminderCadence = value.cadence === "daily" ? "daily" : "weekly";
  const compression: BackupCompressionMode = value.compression === "zip" ? "zip" : "none";
  const targetPath = typeof value.targetPath === "string" ? value.targetPath.trim() : "";
  const enabled = value.enabled === true && targetPath.length > 0;
  const lastRunAt = normalizeIsoString(value.lastRunAt);
  const updatedAt = normalizeIsoString(value.updatedAt);
  const snoozedUntil = normalizeIsoString(value.snoozedUntil);
  const storedNextDueAt = normalizeIsoString(value.nextDueAt);

  return {
    autoRunWhenDue: value.autoRunWhenDue === true,
    cadence,
    compression,
    enabled,
    includeLibraryData: value.includeLibraryData !== false,
    lastRunAt,
    nextDueAt: enabled
      ? (storedNextDueAt ?? computeNextBackupReminderDueAt(cadence, lastRunAt ?? now))
      : null,
    snoozedUntil,
    targetPath,
    updatedAt,
  };
}

export function readBackupReminderSettings(): BackupReminderSettings {
  const storage = getLocalStorage();
  if (!storage) {
    return { ...DEFAULT_BACKUP_REMINDER_SETTINGS };
  }

  const rawValue = storage.getItem(STORAGE_KEYS.BACKUP_REMINDER_SETTINGS);
  if (!rawValue) {
    return { ...DEFAULT_BACKUP_REMINDER_SETTINGS };
  }

  try {
    return normalizeBackupReminderSettings(JSON.parse(rawValue));
  } catch {
    return { ...DEFAULT_BACKUP_REMINDER_SETTINGS };
  }
}

export function writeBackupReminderSettings(
  value: BackupReminderSettings,
  now: Date = new Date(),
): BackupReminderSettings {
  const settings = normalizeBackupReminderSettings(
    {
      ...value,
      updatedAt: value.updatedAt ?? now.toISOString(),
    },
    now,
  );
  const storage = getLocalStorage();
  if (storage) {
    storage.setItem(STORAGE_KEYS.BACKUP_REMINDER_SETTINGS, JSON.stringify(settings));
  }
  return settings;
}

export function saveBackupReminderSettings(
  value: BackupReminderSettings,
  now: Date = new Date(),
): BackupReminderSettings {
  const settings = writeBackupReminderSettings(value, now);
  notifyBackupReminderSettingsChanged();
  return settings;
}

export function isBackupReminderDue(
  value: BackupReminderSettings,
  now: Date = new Date(),
): boolean {
  const settings = normalizeBackupReminderSettings(value, now);
  if (!settings.enabled || !settings.nextDueAt) {
    return false;
  }

  const snoozedUntil = coerceDate(settings.snoozedUntil);
  if (snoozedUntil && snoozedUntil.getTime() > now.getTime()) {
    return false;
  }

  return new Date(settings.nextDueAt).getTime() <= now.getTime();
}

export function shouldAutoRunBackupReminder(
  value: BackupReminderSettings,
  now: Date = new Date(),
  isDesktopApp = true,
): boolean {
  const settings = normalizeBackupReminderSettings(value, now);
  return isDesktopApp && settings.autoRunWhenDue && isBackupReminderDue(settings, now);
}

export function markBackupReminderDone(
  value: BackupReminderSettings,
  runAt: Date = new Date(),
): BackupReminderSettings {
  const settings = normalizeBackupReminderSettings(value, runAt);
  return {
    ...settings,
    lastRunAt: runAt.toISOString(),
    nextDueAt: settings.enabled ? computeNextBackupReminderDueAt(settings.cadence, runAt) : null,
    snoozedUntil: null,
    updatedAt: runAt.toISOString(),
  };
}

export function snoozeBackupReminder(
  value: BackupReminderSettings,
  snoozedUntil: Date,
  updatedAt: Date = new Date(),
): BackupReminderSettings {
  const settings = normalizeBackupReminderSettings(value, snoozedUntil);
  return {
    ...settings,
    snoozedUntil: snoozedUntil.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}

export function getBackupReminderStatus(
  value: BackupReminderSettings,
  now: Date = new Date(),
): BackupReminderStatus {
  const settings = normalizeBackupReminderSettings(value, now);

  if (!settings.enabled) {
    return {
      isDue: false,
      message: "Daily or weekly local backup reminders are off.",
      title: "Reminder Off",
      tone: "blocked",
    };
  }

  const snoozedUntil = coerceDate(settings.snoozedUntil);
  if (snoozedUntil && snoozedUntil.getTime() > now.getTime()) {
    return {
      isDue: false,
      message: `Reminder returns ${formatBackupReminderDate(settings.snoozedUntil)}.`,
      title: "Reminder Snoozed",
      tone: "warning",
    };
  }

  if (isBackupReminderDue(settings, now)) {
    return {
      isDue: true,
      message: `Local backup is due for ${settings.targetPath}.`,
      title: "Backup Due",
      tone: "warning",
    };
  }

  return {
    isDue: false,
    message: `Next reminder ${formatBackupReminderDate(settings.nextDueAt)}.`,
    title: "Reminder Armed",
    tone: "ready",
  };
}

export function formatBackupReminderDate(value: string | null): string {
  if (!value) return "not scheduled";
  const date = coerceDate(value);
  if (!date) return value;
  return date.toLocaleString(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function notifyBackupReminderSettingsChanged() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(BACKUP_REMINDER_SETTINGS_CHANGED_EVENT));
}

function getLocalStorage(): Storage | null {
  if (typeof globalThis.localStorage === "undefined") {
    return null;
  }
  return globalThis.localStorage;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeIsoString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  return coerceDate(value)?.toISOString() ?? null;
}

function coerceDate(value: Date | string | null): Date | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
