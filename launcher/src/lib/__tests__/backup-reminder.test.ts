import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  computeNextBackupReminderDueAt,
  DEFAULT_BACKUP_REMINDER_SETTINGS,
  getBackupReminderStatus,
  isBackupReminderDue,
  markBackupReminderDone,
  normalizeBackupReminderSettings,
  readBackupReminderSettings,
  saveBackupReminderSettings,
  shouldAutoRunBackupReminder,
  snoozeBackupReminder,
} from "../backup-reminder";
import { STORAGE_KEYS } from "../storage-keys";

const now = new Date("2026-06-10T12:00:00.000Z");

describe("backup reminder settings", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("normalizes invalid or missing values to a disabled reminder", () => {
    expect(normalizeBackupReminderSettings(null, now)).toEqual(DEFAULT_BACKUP_REMINDER_SETTINGS);
    expect(normalizeBackupReminderSettings({ enabled: true, targetPath: "" }, now)).toMatchObject({
      enabled: false,
      nextDueAt: null,
      targetPath: "",
    });
  });

  it("computes daily and weekly next due timestamps", () => {
    expect(computeNextBackupReminderDueAt("daily", now)).toBe("2026-06-11T12:00:00.000Z");
    expect(computeNextBackupReminderDueAt("weekly", now)).toBe("2026-06-17T12:00:00.000Z");
  });

  it("hydrates and persists reminder settings through localStorage", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    const saved = saveBackupReminderSettings(
      {
        ...DEFAULT_BACKUP_REMINDER_SETTINGS,
        autoRunWhenDue: true,
        cadence: "daily",
        compression: "zip",
        enabled: true,
        nextDueAt: null,
        targetPath: "/mnt/og-backups",
      },
      now,
    );

    expect(saved).toMatchObject({
      autoRunWhenDue: true,
      cadence: "daily",
      compression: "zip",
      enabled: true,
      nextDueAt: "2026-06-11T12:00:00.000Z",
      targetPath: "/mnt/og-backups",
    });
    expect(readBackupReminderSettings()).toMatchObject(saved);
    expect(window.localStorage.getItem(STORAGE_KEYS.BACKUP_REMINDER_SETTINGS)).toContain(
      "/mnt/og-backups",
    );
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
  });

  it("treats enabled reminders as due only after next due and outside snooze", () => {
    const dueSettings = normalizeBackupReminderSettings(
      {
        cadence: "daily",
        enabled: true,
        nextDueAt: "2026-06-10T11:00:00.000Z",
        targetPath: "/backup",
      },
      now,
    );

    expect(isBackupReminderDue(dueSettings, now)).toBe(true);
    expect(
      isBackupReminderDue(
        snoozeBackupReminder(
          dueSettings,
          new Date("2026-06-10T18:00:00.000Z"),
          new Date("2026-06-10T12:05:00.000Z"),
        ),
        now,
      ),
    ).toBe(false);
  });

  it("keeps older persisted settings compatible", () => {
    expect(
      normalizeBackupReminderSettings(
        {
          cadence: "weekly",
          enabled: true,
          nextDueAt: "2026-06-17T12:00:00.000Z",
          targetPath: "/backup",
        },
        now,
      ),
    ).toMatchObject({
      autoRunWhenDue: false,
      compression: "none",
      enabled: true,
    });
  });

  it("marks a completed backup and advances the next reminder", () => {
    const settings = normalizeBackupReminderSettings(
      {
        cadence: "weekly",
        enabled: true,
        nextDueAt: "2026-06-10T10:00:00.000Z",
        snoozedUntil: "2026-06-10T18:00:00.000Z",
        targetPath: "/backup",
      },
      now,
    );

    expect(markBackupReminderDone(settings, now)).toMatchObject({
      lastRunAt: "2026-06-10T12:00:00.000Z",
      nextDueAt: "2026-06-17T12:00:00.000Z",
      snoozedUntil: null,
    });
  });

  it("reports status for disabled, due, snoozed and armed reminders", () => {
    expect(getBackupReminderStatus(DEFAULT_BACKUP_REMINDER_SETTINGS, now)).toMatchObject({
      isDue: false,
      title: "Reminder Off",
      tone: "blocked",
    });
    expect(
      getBackupReminderStatus(
        normalizeBackupReminderSettings(
          {
            enabled: true,
            nextDueAt: "2026-06-10T10:00:00.000Z",
            targetPath: "/backup",
          },
          now,
        ),
        now,
      ),
    ).toMatchObject({
      isDue: true,
      title: "Backup Due",
      tone: "warning",
    });
    expect(
      getBackupReminderStatus(
        snoozeBackupReminder(
          normalizeBackupReminderSettings(
            {
              enabled: true,
              nextDueAt: "2026-06-10T10:00:00.000Z",
              targetPath: "/backup",
            },
            now,
          ),
          new Date("2026-06-10T18:00:00.000Z"),
          now,
        ),
        now,
      ),
    ).toMatchObject({
      isDue: false,
      title: "Reminder Snoozed",
      tone: "warning",
    });
    expect(
      getBackupReminderStatus(
        normalizeBackupReminderSettings(
          {
            enabled: true,
            nextDueAt: "2026-06-11T10:00:00.000Z",
            targetPath: "/backup",
          },
          now,
        ),
        now,
      ),
    ).toMatchObject({
      isDue: false,
      title: "Reminder Armed",
      tone: "ready",
    });
  });

  it("allows auto-run only for due desktop reminders with explicit opt-in", () => {
    const settings = normalizeBackupReminderSettings(
      {
        autoRunWhenDue: true,
        enabled: true,
        nextDueAt: "2026-06-10T10:00:00.000Z",
        targetPath: "/backup",
      },
      now,
    );

    expect(shouldAutoRunBackupReminder(settings, now, true)).toBe(true);
    expect(shouldAutoRunBackupReminder(settings, now, false)).toBe(false);
    expect(
      shouldAutoRunBackupReminder(
        {
          ...settings,
          autoRunWhenDue: false,
        },
        now,
        true,
      ),
    ).toBe(false);
    expect(
      shouldAutoRunBackupReminder(
        {
          ...settings,
          nextDueAt: "2026-06-11T10:00:00.000Z",
        },
        now,
        true,
      ),
    ).toBe(false);
  });
});
