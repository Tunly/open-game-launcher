import { BarChart3, RefreshCw, Play, Power, RotateCcw, Timer, Trash2 } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import {
  listClientUsagePlatformStats,
  readClientUsageStats,
  recordClientUsageSample,
  resetClientUsageStats,
  setClientUsageStatsEnabled,
} from "../../lib/client-usage-stats";
import {
  getPlatformClientUpdateSchedulerStatus,
  installPlatformClientUpdateScheduler,
  runPlatformClientUpdateSchedulerNow,
  uninstallPlatformClientUpdateScheduler,
} from "../../lib/launcher";
import type { ClientUsageStatsState } from "../../lib/client-usage-stats";
import type { ClientUpdateSchedulerStatus } from "../../lib/types";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function formatSchedulerDate(value: string | null | undefined): string {
  if (!value) return "not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function ClientUpdateSchedulerSettings() {
  const [status, setStatus] = useState<ClientUpdateSchedulerStatus | null>(null);
  const [usageStats, setUsageStats] = useState<ClientUsageStatsState>(() => readClientUsageStats());
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void refreshStatus(true);
  }, []);

  async function refreshStatus(quiet = false) {
    setBusyAction((current) => current ?? "refresh");
    if (!quiet) setMessage(null);
    try {
      const nextStatus = await getPlatformClientUpdateSchedulerStatus();
      setStatus(nextStatus);
      if (!quiet) setMessage(nextStatus.message);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusyAction((current) => (current === "refresh" ? null : current));
    }
  }

  async function runAction(action: string, task: () => Promise<ClientUpdateSchedulerStatus>) {
    setBusyAction(action);
    setMessage(null);
    try {
      const nextStatus = await task();
      setStatus(nextStatus);
      setMessage(nextStatus.message);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function runSchedulerNow() {
    setBusyAction("run");
    setMessage(null);
    try {
      const runStatus = await runPlatformClientUpdateSchedulerNow();
      const nextStatus = await getPlatformClientUpdateSchedulerStatus();
      setStatus({ ...nextStatus, lastRun: runStatus });
      setUsageStats(recordClientUsageSample(runStatus.checkedClients ?? []));
      setMessage(runStatus.message);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  function toggleUsageStats() {
    setUsageStats((current) => setClientUsageStatsEnabled(!current.enabled));
  }

  function resetUsageStatsPanel() {
    setUsageStats(resetClientUsageStats());
  }

  const installed = status?.installed ?? false;
  const supported = status?.supported ?? false;
  const platformStats = listClientUsagePlatformStats(usageStats);

  return (
    <section className="border-4 border-black bg-[#f5eedf] shadow-[4px_4px_0_#171411]">
      <div className="flex flex-col gap-3 border-b-4 border-black p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="neo-copy text-[10px] font-bold uppercase text-[#55504a]">Client Manager</p>
          <h2 className="text-3xl font-black uppercase text-[#171411]">Platform Client Timer</h2>
        </div>
        <Timer className="h-10 w-10 text-[#c20b2f]" />
      </div>

      <div className="space-y-3 p-5">
        <div
          className={`border-2 border-black p-3 shadow-[2px_2px_0_#171411] ${
            installed ? "bg-[#8cf5e4]" : supported ? "bg-[#fff9ed]" : "bg-[#efe6d4]"
          }`}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="neo-copy text-[10px] font-black uppercase text-[#55504a]">
                Headless Update Check
              </p>
              <h3 className="mt-1 text-xl font-black uppercase text-[#171411]">
                {installed ? "Timer Armed" : "Timer Not Installed"}
              </h3>
              <p className="neo-copy mt-1 break-words text-[10px] font-bold uppercase leading-4 text-[#55504a]">
                {status?.message ?? "Checking platform-client timer status."}
              </p>
              <p className="neo-copy mt-2 break-words text-[9px] font-black uppercase leading-4 text-[#55504a]">
                Notify Only records due checks. Open Client opens the configured updater only after
                a detected version gap.
              </p>
            </div>
            <span
              className={`neo-copy h-fit border-2 border-black px-2 py-1 text-[8px] font-black uppercase ${
                installed
                  ? "bg-[#087d6d] text-white"
                  : supported
                    ? "bg-[#c20b2f] text-white"
                    : "bg-[#efe6d4] text-[#171411]"
              }`}
            >
              {installed ? "Installed" : "Off"}
            </span>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <SchedulerStat label="Provider" value={status?.provider ?? "Checking"} />
            <SchedulerStat
              label="Last Headless Run"
              value={formatSchedulerDate(status?.lastRun?.checkedAt)}
            />
            <SchedulerStat
              label="Next Due"
              value={formatSchedulerDate(status?.lastRun?.nextCheckAt)}
            />
          </div>

          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <p className="neo-copy truncate border-2 border-black bg-[#fff9ed] px-3 py-2 text-[9px] font-bold uppercase text-[#55504a]">
              Config: {status?.configPath ?? "not loaded"}
            </p>
            <p className="neo-copy truncate border-2 border-black bg-[#fff9ed] px-3 py-2 text-[9px] font-bold uppercase text-[#55504a]">
              Last Result:{" "}
              {status?.lastRun
                ? `${status.lastRun.success ? "success" : "failed"} / ${status.lastRun.checkedCount} checked / ${status.lastRun.updateCount} updates`
                : "no run"}
            </p>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <SchedulerButton
              disabled={busyAction !== null || !isTauri() || !supported}
              icon={<Power className="h-4 w-4" />}
              label={installed ? "Reinstall" : "Install"}
              onClick={() => void runAction("install", installPlatformClientUpdateScheduler)}
            />
            <SchedulerButton
              disabled={busyAction !== null || !isTauri() || !installed}
              icon={<Trash2 className="h-4 w-4" />}
              label="Remove"
              onClick={() => void runAction("remove", uninstallPlatformClientUpdateScheduler)}
            />
            <SchedulerButton
              disabled={busyAction !== null || !isTauri()}
              icon={<Play className="h-4 w-4" />}
              label="Run Now"
              onClick={() => void runSchedulerNow()}
            />
            <SchedulerButton
              disabled={busyAction !== null || !isTauri()}
              icon={<RefreshCw className="h-4 w-4" />}
              label="Refresh"
              onClick={() => void refreshStatus()}
            />
          </div>
        </div>

        {message ? (
          <div className="neo-copy border-2 border-black bg-[#087d6d] px-3 py-2 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#171411]">
            {message}
          </div>
        ) : null}

        <div className="border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="neo-copy text-[10px] font-black uppercase text-[#55504a]">
                Local Usage Stats
              </p>
              <h3 className="mt-1 flex items-center gap-2 text-xl font-black uppercase text-[#171411]">
                <BarChart3 className="h-5 w-5 text-[#087d6d]" />
                Platform Counters
              </h3>
              <p className="neo-copy mt-1 text-[10px] font-bold uppercase leading-4 text-[#55504a]">
                Opt-in only. Stored locally. No network telemetry.
              </p>
            </div>
            <span
              className={`neo-copy h-fit border-2 border-black px-2 py-1 text-[8px] font-black uppercase ${
                usageStats.enabled ? "bg-[#8cf5e4] text-[#171411]" : "bg-[#efe6d4] text-[#171411]"
              }`}
            >
              {usageStats.enabled ? "Armed" : "Off"}
            </span>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {platformStats.length > 0 ? (
              platformStats
                .slice(0, 3)
                .map((stat) => (
                  <SchedulerStat
                    key={stat.platformId}
                    label={stat.displayName}
                    value={`${stat.checkCount} checks / ${stat.updateCount} updates`}
                  />
                ))
            ) : (
              <div className="neo-copy border-2 border-dashed border-black bg-[#f6edd8] p-2 text-[9px] font-bold uppercase leading-4 text-[#55504a] md:col-span-3">
                No local samples recorded yet.
              </div>
            )}
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <SchedulerButton
              disabled={busyAction !== null}
              icon={<BarChart3 className="h-4 w-4" />}
              label={usageStats.enabled ? "Disable Stats" : "Enable Stats"}
              onClick={toggleUsageStats}
            />
            <SchedulerButton
              disabled={busyAction !== null || platformStats.length === 0}
              icon={<RotateCcw className="h-4 w-4" />}
              label="Reset Stats"
              onClick={resetUsageStatsPanel}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function SchedulerButton({
  disabled,
  icon,
  label,
  onClick,
}: {
  disabled: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="neo-copy flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#171411] px-3 text-[9px] font-black uppercase text-white shadow-[2px_2px_0_#171411] disabled:cursor-not-allowed disabled:bg-[#8f887d] disabled:opacity-70"
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function SchedulerStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-black bg-[#fff9ed] p-2 shadow-[2px_2px_0_#171411]">
      <p className="neo-copy text-[8px] font-black uppercase text-[#55504a]">{label}</p>
      <p className="neo-copy mt-1 truncate text-[10px] font-black uppercase leading-4 text-[#171411]">
        {value}
      </p>
    </div>
  );
}
