import { Gamepad2, RefreshCw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  getPlatformClientPollingSettings,
  getPlatformClientUpdateStatus,
  pollPlatformClientHealth,
  savePlatformClientPollingSettings,
} from "../../lib/launcher";
import type {
  ClientPlatformId,
  ClientPollingSettings,
  ClientUpdateStatus,
  PlatformClientHealth,
} from "../../lib/types";
import {
  buildPlatformHealthSummary,
  PLATFORM_HEALTH_TARGETS,
  type PlatformLoginStatuses,
} from "./PlatformHealthPanel.helpers";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function scoreClass(score: number, tone: "good" | "warning" | "missing"): string {
  if (tone === "missing") return "bg-[#b7102a] text-white";
  if (tone === "warning") return "bg-[#8cf5e4] text-[#171411]";
  if (score >= 80) return "bg-[#087d6d] text-white";
  return "bg-[#fbf4e7] text-[#171411]";
}

function badgeClass(label: string): string {
  if (label === "Running" || label === "Current") return "bg-[#087d6d] text-white";
  if (label === "Missing" || label === "Update available") return "bg-[#b7102a] text-white";
  return "bg-[#fbf4e7] text-[#171411]";
}

interface PlatformHealthPanelProps {
  loginStatuses?: PlatformLoginStatuses;
}

export function PlatformHealthPanel({ loginStatuses = {} }: PlatformHealthPanelProps) {
  const [healthStatuses, setHealthStatuses] = useState<PlatformClientHealth[]>([]);
  const [updateStatuses, setUpdateStatuses] = useState<
    Partial<Record<ClientPlatformId, ClientUpdateStatus | null>>
  >({});
  const [pollingSettings, setPollingSettings] = useState<ClientPollingSettings | null>(null);
  const [pollIntervalDraft, setPollIntervalDraft] = useState("10");
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingPolling, setIsSavingPolling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadPollingSettings() {
    try {
      const settings = await getPlatformClientPollingSettings();
      setPollingSettings(settings);
      setPollIntervalDraft(String(settings.lifecyclePollIntervalSeconds));
    } catch (error) {
      setMessage(`Client poll settings unavailable: ${getErrorMessage(error)}`);
    }
  }

  async function refreshHealth(quiet = false) {
    setIsLoading(true);
    if (!quiet) setMessage(null);
    try {
      const health = await pollPlatformClientHealth({ maxAgeMs: 0 });
      const updateResults = await Promise.allSettled(
        PLATFORM_HEALTH_TARGETS.map((target) => getPlatformClientUpdateStatus(target.id)),
      );
      const nextUpdates: Partial<Record<ClientPlatformId, ClientUpdateStatus | null>> = {};
      updateResults.forEach((result, index) => {
        const platformId = PLATFORM_HEALTH_TARGETS[index]?.id;
        if (!platformId) return;
        nextUpdates[platformId] = result.status === "fulfilled" ? result.value : null;
      });

      setHealthStatuses(health);
      setUpdateStatuses(nextUpdates);
      if (!quiet) setMessage("Platform health refreshed.");
    } catch (error) {
      setMessage(`Platform health unavailable: ${getErrorMessage(error)}`);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refreshHealth(true);
    void loadPollingSettings();
  }, []);

  async function savePollingSettings() {
    const parsedInterval = Number.parseInt(pollIntervalDraft, 10);
    const lifecyclePollIntervalSeconds = Number.isFinite(parsedInterval) ? parsedInterval : 10;
    setIsSavingPolling(true);
    setMessage(null);
    try {
      const saved = await savePlatformClientPollingSettings({
        lifecyclePollIntervalSeconds,
        updatedAt: pollingSettings?.updatedAt ?? null,
      });
      setPollingSettings(saved);
      setPollIntervalDraft(String(saved.lifecyclePollIntervalSeconds));
      setMessage(`Client poll interval saved: ${saved.lifecyclePollIntervalSeconds}s.`);
    } catch (error) {
      setMessage(`Client poll interval save failed: ${getErrorMessage(error)}`);
    } finally {
      setIsSavingPolling(false);
    }
  }

  const summary = useMemo(
    () => buildPlatformHealthSummary({ healthStatuses, loginStatuses, updateStatuses }),
    [healthStatuses, loginStatuses, updateStatuses],
  );
  const runningCount = summary.cards.filter((card) => card.badges.includes("Running")).length;
  const updateCount = summary.cards.filter((card) =>
    card.badges.includes("Update available"),
  ).length;

  return (
    <div className="border-4 border-black bg-[#f5eedf] shadow-[4px_4px_0_#171411]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-4 border-black p-5">
        <div>
          <p className="neo-copy text-[10px] font-bold uppercase text-[#55504a]">
            System Compatibility
          </p>
          <h2 className="text-3xl font-black uppercase text-[#171411]">Platform Health Score</h2>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`neo-copy border-2 border-black px-3 py-2 text-[10px] font-black uppercase shadow-[2px_2px_0_#171411] ${scoreClass(
              summary.score,
              summary.tone,
            )}`}
          >
            Health {summary.score}%
          </span>
          <button
            className="grid h-10 w-10 place-items-center border-2 border-black bg-[#fbf4e7] text-[#171411] shadow-[2px_2px_0_#171411] hover:bg-[#8cf5e4] disabled:opacity-60"
            type="button"
            aria-label="Refresh platform health"
            disabled={isLoading}
            onClick={() => void refreshHealth()}
          >
            <RefreshCw className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
          <Gamepad2 className="h-10 w-10 text-[#c20b2f]" />
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="border-2 border-black bg-[#fbf4e7] p-3 shadow-[2px_2px_0_#171411]">
            <span className="neo-copy block text-[9px] font-black uppercase text-[#55504a]">
              Running
            </span>
            <strong className="block text-2xl font-black text-[#171411]">{runningCount}</strong>
          </div>
          <div className="border-2 border-black bg-[#fbf4e7] p-3 shadow-[2px_2px_0_#171411]">
            <span className="neo-copy block text-[9px] font-black uppercase text-[#55504a]">
              Updates
            </span>
            <strong className="block text-2xl font-black text-[#171411]">{updateCount}</strong>
          </div>
          <div className="border-2 border-black bg-[#fbf4e7] p-3 shadow-[2px_2px_0_#171411]">
            <span className="neo-copy block text-[9px] font-black uppercase text-[#55504a]">
              Scanned
            </span>
            <strong className="block text-2xl font-black text-[#171411]">
              {summary.detectedCount}/{summary.totalPlatforms}
            </strong>
          </div>
          <div className="border-2 border-black bg-[#fbf4e7] p-3 shadow-[2px_2px_0_#171411]">
            <span className="neo-copy block text-[9px] font-black uppercase text-[#55504a]">
              Logins
            </span>
            <strong className="block text-2xl font-black text-[#171411]">
              {summary.loginConnectedCount}/{summary.loginPlatformCount}
            </strong>
          </div>
          <div className="border-2 border-black bg-[#fbf4e7] p-3 shadow-[2px_2px_0_#171411]">
            <span className="neo-copy block text-[9px] font-black uppercase text-[#55504a]">
              Current
            </span>
            <strong className="block text-2xl font-black text-[#171411]">
              {summary.updateCurrentCount}/{summary.updateCheckedCount || 0}
            </strong>
          </div>
        </div>

        <div className="grid gap-2 border-2 border-black bg-[#efe6d4] p-3 shadow-[2px_2px_0_#171411] md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <span className="neo-copy block text-[9px] font-black uppercase text-[#55504a]">
              Client poll interval
            </span>
            <strong className="neo-copy mt-1 block text-xl font-black uppercase text-[#171411]">
              {pollingSettings?.lifecyclePollIntervalSeconds ?? 10}s
            </strong>
            <p className="neo-copy mt-1 truncate text-[9px] font-bold uppercase text-[#55504a]">
              Lifecycle events refresh every saved interval
            </p>
          </div>
          <div className="flex items-end gap-2">
            <label className="neo-copy block text-[9px] font-black uppercase text-[#55504a]">
              Seconds
              <input
                className="mt-1 h-10 w-24 border-2 border-black bg-[#fbf4e7] px-2 text-[12px] font-black text-[#171411] outline-none"
                type="number"
                min={5}
                max={120}
                step={5}
                value={pollIntervalDraft}
                onChange={(event) => setPollIntervalDraft(event.currentTarget.value)}
              />
            </label>
            <button
              className="neo-copy inline-flex h-10 items-center gap-1.5 border-2 border-black bg-[#087d6d] px-3 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#171411] hover:bg-[#00695f] disabled:cursor-not-allowed disabled:bg-[#d8cbb7] disabled:text-[#655f58]"
              type="button"
              disabled={isSavingPolling}
              onClick={() => void savePollingSettings()}
            >
              <Save className="h-4 w-4" />
              Save
            </button>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {summary.cards.map((card) => (
            <div
              key={card.id}
              className="flex min-h-[132px] flex-col justify-between border-2 border-black bg-[#efe6d4] p-3 shadow-[2px_2px_0_#171411]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="block truncate text-sm font-black uppercase text-[#171411]">
                    {card.label}
                  </span>
                  <span className="neo-copy mt-1 block text-[8px] font-bold uppercase leading-tight text-[#55504a]">
                    {card.detail}
                  </span>
                </div>
                <span
                  className={`neo-copy shrink-0 border-2 border-black px-2 py-1 text-[10px] font-black uppercase shadow-[1px_1px_0_#171411] ${scoreClass(
                    card.score,
                    card.tone,
                  )}`}
                >
                  {card.score}%
                </span>
              </div>
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap gap-1">
                  {card.badges.map((badge) => (
                    <span
                      key={badge}
                      className={`neo-copy border border-black px-1.5 py-0.5 text-[8px] font-black uppercase ${badgeClass(
                        badge,
                      )}`}
                    >
                      {badge}
                    </span>
                  ))}
                </div>
                <p className="neo-copy truncate text-[9px] font-bold uppercase text-[#55504a]">
                  {card.statusLabel} // {card.detailLine}
                </p>
              </div>
            </div>
          ))}
        </div>

        {message ? (
          <p className="neo-copy border-2 border-black bg-[#fbf4e7] px-3 py-2 text-[10px] font-bold uppercase text-[#171411] shadow-[2px_2px_0_#171411]">
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
