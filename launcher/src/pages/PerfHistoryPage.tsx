import {
  Activity,
  BarChart3,
  CalendarDays,
  Clock,
  CloudOff,
  Database,
  Filter,
  Gamepad2,
  Gauge,
  Loader2,
  RefreshCw,
  TimerReset,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { OverlayE2EReadinessPanel } from "../components/settings/OverlayE2EReadinessPanel";
import { OverlayFullscreenAntiCheatReadinessPanel } from "../components/settings/OverlayFullscreenAntiCheatReadinessPanel";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { createVerifyOverlayFullscreenAntiCheatReadiness } from "../lib/overlay-fullscreen-anti-cheat-readiness";
import { createVerifyOverlayE2EReadiness } from "../lib/overlay-e2e-readiness";
import { isStandalonePerformanceGameId, OVERLAY_RUNTIME_GAME_ID } from "../lib/performance-context";
import { listPerformanceSessions, listPerformanceSnapshots } from "../lib/supabase/performance";
import type {
  PerformanceHistoryRange,
  PerformanceSession,
  PerformanceSnapshot,
} from "../lib/types/performance";

const filterOptions: Array<{ label: string; value: PerformanceHistoryRange }> = [
  { label: "Tag", value: "1d" },
  { label: "Woche", value: "7d" },
  { label: "Monat", value: "30d" },
  { label: "Jahr", value: "365d" },
  { label: "Alle", value: "all" },
];

type PerformanceBucketMode = "auto" | "hour" | "day" | "week" | "month";

const bucketOptions: Array<{ label: string; value: PerformanceBucketMode }> = [
  { label: "Auto", value: "auto" },
  { label: "Stunde", value: "hour" },
  { label: "Tag", value: "day" },
  { label: "Woche", value: "week" },
  { label: "Monat", value: "month" },
];

const performanceRangeValues = new Set<PerformanceHistoryRange>(["1d", "7d", "30d", "365d", "all"]);
const bucketModeValues = new Set<PerformanceBucketMode>(["auto", "hour", "day", "week", "month"]);

const snapshotLimits: Record<PerformanceHistoryRange, number> = {
  "1d": 288,
  "7d": 420,
  "30d": 720,
  "365d": 1200,
  all: 1500,
};

const sessionLimits: Record<PerformanceHistoryRange, number> = {
  "1d": 80,
  "7d": 160,
  "30d": 320,
  "365d": 600,
  all: 800,
};

const localPerformanceGameLabels: Record<string, string> = {
  "local-demo-mecha-shift": "Mecha Shift",
  "local-demo-neon-runner": "Neon Runner",
};

export function PerfHistoryPage() {
  const { isConfigured, isLoading: isAuthLoading, user } = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const [range, setRange] = useState<PerformanceHistoryRange>(
    () => readPerformanceRangeParam(searchParams.get("range")) ?? "7d",
  );
  const [bucketMode, setBucketMode] = useState<PerformanceBucketMode>(
    () => readBucketModeParam(searchParams.get("bucket")) ?? "auto",
  );
  const [selectedGameId, setSelectedGameId] = useState(
    () => normalizeGameFilterParam(searchParams.get("gameId")) ?? "all",
  );
  const [sessions, setSessions] = useState<PerformanceSession[]>([]);
  const [snapshots, setSnapshots] = useState<PerformanceSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const verifyMode = searchParams.get("verify");
  const isOverlayE2EReadinessVerify = verifyMode === "overlay-e2e-readiness";
  const isOverlayFullscreenAntiCheatReadinessVerify =
    verifyMode === "overlay-fullscreen-anti-cheat-readiness";
  const isPerformanceTelemetryVerify =
    import.meta.env.DEV && verifyMode === "performance-system-telemetry";
  const isLocalPreview = !isConfigured || isPerformanceTelemetryVerify;
  const localPreview = useMemo(() => createLocalPerformancePreview(new Date()), []);
  const historySnapshots = isLocalPreview ? localPreview.snapshots : snapshots;
  const historySessions = isLocalPreview ? localPreview.sessions : sessions;

  const filteredSnapshots = useMemo(
    () =>
      selectedGameId === "all"
        ? historySnapshots
        : historySnapshots.filter((snapshot) => snapshot.gameId === selectedGameId),
    [historySnapshots, selectedGameId],
  );
  const filteredSessions = useMemo(
    () =>
      selectedGameId === "all"
        ? historySessions
        : historySessions.filter((session) => session.gameId === selectedGameId),
    [historySessions, selectedGameId],
  );
  const orderedSnapshots = useMemo(
    () =>
      [...filteredSnapshots].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [filteredSnapshots],
  );
  const gameOptions = useMemo(
    () =>
      [
        ...new Set([
          ...historySnapshots.map((snapshot) => snapshot.gameId),
          ...historySessions.map((session) => session.gameId),
          ...(selectedGameId === "all" ? [] : [selectedGameId]),
        ]),
      ]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [historySessions, historySnapshots, selectedGameId],
  );
  const activeBucketMode = useMemo(() => resolveBucketMode(range, bucketMode), [bucketMode, range]);
  const buckets = useMemo(
    () => buildPerformanceBuckets(orderedSnapshots, filteredSessions, activeBucketMode),
    [activeBucketMode, filteredSessions, orderedSnapshots],
  );
  const stats = useMemo(() => summarize(filteredSnapshots), [filteredSnapshots]);
  const sessionStats = useMemo(() => summarizeSessions(filteredSessions), [filteredSessions]);
  const bucketStats = useMemo(() => summarizeBuckets(buckets), [buckets]);
  const attributionStats = useMemo(
    () => summarizeAttribution(filteredSnapshots, filteredSessions),
    [filteredSessions, filteredSnapshots],
  );
  const isActivityCrossFilter =
    searchParams.get("source") === "activity" && selectedGameId !== "all";
  const hasSelectedGameHistory =
    selectedGameId === "all" || filteredSnapshots.length > 0 || filteredSessions.length > 0;

  useEffect(() => {
    const nextRange = readPerformanceRangeParam(searchParams.get("range")) ?? "7d";
    const nextBucketMode = readBucketModeParam(searchParams.get("bucket")) ?? "auto";
    const nextGameId = normalizeGameFilterParam(searchParams.get("gameId")) ?? "all";

    setRange((current) => (current === nextRange ? current : nextRange));
    setBucketMode((current) => (current === nextBucketMode ? current : nextBucketMode));
    setSelectedGameId((current) => (current === nextGameId ? current : nextGameId));
  }, [searchParams]);

  useEffect(() => {
    let isMounted = true;

    if (isLocalPreview || !user) {
      setSnapshots([]);
      setSessions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    void Promise.all([
      listPerformanceSnapshots({ range, limit: snapshotLimits[range] }),
      listPerformanceSessions({ range, limit: sessionLimits[range] }),
    ])
      .then(([snapshotRows, sessionRows]) => {
        if (!isMounted) return;
        setSnapshots(snapshotRows);
        setSessions(sessionRows);
      })
      .catch((error: unknown) => {
        if (isMounted) setErrorMessage(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isLocalPreview, range, user]);

  function handleReload() {
    setRange((current) => current);
    if (isLocalPreview) {
      setErrorMessage(null);
      return;
    }
    if (!isConfigured || !user) return;

    setIsLoading(true);
    setErrorMessage(null);
    void Promise.all([
      listPerformanceSnapshots({ range, limit: snapshotLimits[range] }),
      listPerformanceSessions({ range, limit: sessionLimits[range] }),
    ])
      .then(([snapshotRows, sessionRows]) => {
        setSnapshots(snapshotRows);
        setSessions(sessionRows);
      })
      .catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      })
      .finally(() => setIsLoading(false));
  }

  function updatePerformanceSearchParams(nextState: {
    bucketMode?: PerformanceBucketMode;
    gameId?: string;
    range?: PerformanceHistoryRange;
  }) {
    const nextRange = nextState.range ?? range;
    const nextBucketMode = nextState.bucketMode ?? bucketMode;
    const nextGameId = nextState.gameId ?? selectedGameId;
    const next = new URLSearchParams(searchParams);

    next.set("range", nextRange);
    next.set("bucket", nextBucketMode);
    if (nextGameId === "all") {
      next.delete("gameId");
      next.delete("source");
    } else {
      next.set("gameId", nextGameId);
    }

    setSearchParams(next, { replace: true });
  }

  function handleRangeChange(nextRange: PerformanceHistoryRange) {
    setRange(nextRange);
    updatePerformanceSearchParams({ range: nextRange });
  }

  function handleGameFilterChange(nextGameId: string) {
    setSelectedGameId(nextGameId);
    updatePerformanceSearchParams({ gameId: nextGameId });
  }

  function handleBucketModeChange(nextBucketMode: PerformanceBucketMode) {
    setBucketMode(nextBucketMode);
    updatePerformanceSearchParams({ bucketMode: nextBucketMode });
  }

  return (
    <div className="mx-auto w-full max-w-[1220px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-8 border-b-4 border-black pb-4">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <span className="neo-copy inline-flex border-2 border-black bg-[#171411] px-3 py-1 text-xs font-bold text-white uppercase shadow-[3px_3px_0_#171411]">
              System Tape
            </span>
            <h1 className="neo-title mt-2 max-w-[780px] text-[3.3rem] leading-[0.82] text-[#171411] sm:text-[4.5rem] lg:text-[5.4rem] xl:text-[6rem]">
              Perf History
            </h1>
            <p className="neo-copy mt-3 text-xs font-bold text-[#55504a] uppercase">
              System telemetry // HUD webview trace // active-game context
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-3">
            <div className="grid grid-cols-5 border-2 border-black bg-[#efe6d4] shadow-[3px_3px_0_#171411]">
              {filterOptions.map((option) => (
                <button
                  key={option.value}
                  className={`neo-copy h-11 border-r-2 border-black px-2 text-[10px] font-black uppercase last:border-r-0 sm:px-4 ${
                    range === option.value
                      ? "bg-[#087d6d] text-white"
                      : "bg-[#f5eedf] text-[#171411]"
                  }`}
                  type="button"
                  onClick={() => handleRangeChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(180px,1fr)_minmax(160px,220px)_auto]">
              <label className="flex h-11 items-center gap-2 border-2 border-black bg-[#f5eedf] px-3 shadow-[3px_3px_0_#171411]">
                <Filter className="h-4 w-4 text-[#c20b2f]" />
                <select
                  className="neo-copy min-w-0 flex-1 bg-transparent text-[10px] font-black text-[#171411] uppercase outline-none"
                  value={selectedGameId}
                  onChange={(event) => handleGameFilterChange(event.target.value)}
                >
                  <option value="all">Alle Kontexte</option>
                  {gameOptions.map((gameId) => (
                    <option key={gameId} value={gameId}>
                      {formatPerformanceGameLabel(gameId)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex h-11 items-center gap-2 border-2 border-black bg-[#f5eedf] px-3 shadow-[3px_3px_0_#171411]">
                <CalendarDays className="h-4 w-4 text-[#087d6d]" />
                <select
                  className="neo-copy min-w-0 flex-1 bg-transparent text-[10px] font-black text-[#171411] uppercase outline-none"
                  value={bucketMode}
                  onChange={(event) =>
                    handleBucketModeChange(event.target.value as PerformanceBucketMode)
                  }
                >
                  {bucketOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="neo-copy flex h-11 items-center justify-center gap-2 border-2 border-black bg-[#c20b2f] px-4 text-[10px] font-black text-white uppercase shadow-[3px_3px_0_#171411] disabled:cursor-not-allowed disabled:bg-[#8f887c] disabled:text-white disabled:opacity-100"
                disabled={isLoading || isLocalPreview}
                type="button"
                onClick={handleReload}
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                Reload
              </button>
            </div>
            {isActivityCrossFilter && (
              <div className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[10px] font-black text-[#171411] uppercase shadow-[3px_3px_0_#171411]">
                <span className="text-[#c20b2f]">Activity Filter</span>
                <span className="mx-2 text-[#55504a]">//</span>
                <span>{formatPerformanceGameLabel(selectedGameId)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {isAuthLoading || (isLoading && !isLocalPreview) ? (
        <div className="grid min-h-80 place-items-center border-4 border-black bg-[#f5eedf] shadow-[5px_5px_0_#171411]">
          <Loader2 className="h-8 w-8 animate-spin text-[#087d6d]" />
        </div>
      ) : !isLocalPreview && !user ? (
        <Notice
          title="Login erforderlich"
          body="Melde dich an, damit Overlay-Samples gespeichert und gelesen werden koennen."
        />
      ) : errorMessage ? (
        <Notice title="History offline" body={errorMessage} tone="error" />
      ) : (
        <div className="space-y-5">
          {isOverlayFullscreenAntiCheatReadinessVerify ? (
            <OverlayFullscreenAntiCheatReadinessPanel
              readiness={createVerifyOverlayFullscreenAntiCheatReadiness()}
            />
          ) : null}
          {isOverlayE2EReadinessVerify ? (
            <OverlayE2EReadinessPanel readiness={createVerifyOverlayE2EReadiness()} />
          ) : null}
          {isLocalPreview ? (
            <LocalPerformancePreviewNotice isVerification={isPerformanceTelemetryVerify} />
          ) : null}
          {!hasSelectedGameHistory ? (
            <MissingSelectedGameHistoryNotice
              isActivityCrossFilter={isActivityCrossFilter}
              label={formatPerformanceGameLabel(selectedGameId)}
            />
          ) : null}
          <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
            <div className="space-y-5">
              <section
                className="border-4 border-black bg-[#f5eedf] shadow-[5px_5px_0_#171411]"
                id="playtime-detail"
              >
                <div className="flex items-center justify-between border-b-4 border-black bg-[#171411] p-5 text-white">
                  <div>
                    <p className="neo-copy text-[10px] font-bold text-[#8cf5e4] uppercase">
                      System Tape
                    </p>
                    <h2 className="neo-title mt-1 text-3xl leading-none">
                      Legacy HUD FPS / System CPU
                    </h2>
                  </div>
                  <BarChart3 className="h-10 w-10 text-[#8cf5e4]" />
                </div>
                <div className="p-5">
                  {orderedSnapshots.length > 0 ? (
                    <div className="space-y-4">
                      <HistoryChart buckets={buckets} />
                      <div className="grid gap-3 sm:grid-cols-4">
                        <Readout label="Samples" value={filteredSnapshots.length.toString()} />
                        <Readout label="Buckets" value={buckets.length.toString()} />
                        <Readout label="Legacy HUD FPS Avg" value={formatNumber(stats.avgFps, 0)} />
                        <Readout
                          label="System CPU Avg"
                          value={`${formatNumber(stats.avgCpu, 0)}%`}
                        />
                      </div>
                      <p className="neo-copy mt-3 border-2 border-black bg-[#f6edd8] p-3 text-[9px] font-black text-[#b7102a] uppercase">
                        FPS and frame values are legacy launcher HUD-webview samples. They are not
                        game-process FPS and must not be read as a game benchmark.
                      </p>
                    </div>
                  ) : (
                    <EmptyHistory />
                  )}
                </div>
              </section>

              <section className="border-4 border-black bg-[#f5eedf] shadow-[5px_5px_0_#171411]">
                <div className="flex items-center justify-between border-b-4 border-black p-5">
                  <div>
                    <p className="neo-copy text-[10px] font-bold text-[#55504a] uppercase">
                      Run Buckets
                    </p>
                    <h2 className="text-3xl font-black text-[#171411] uppercase">
                      Monitorzeit / Detail
                    </h2>
                  </div>
                  <TimerReset className="h-9 w-9 text-[#087d6d]" />
                </div>
                <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_260px]">
                  {buckets.length > 0 ? (
                    <>
                      <BucketBars buckets={buckets} />
                      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                        <Readout label="Modus" value={formatBucketMode(activeBucketMode)} />
                        <Readout
                          label="Monitorzeit"
                          value={formatDurationLong(bucketStats.durationSeconds)}
                        />
                        <Readout
                          label="Legacy HUD FPS Peak"
                          value={formatNumber(bucketStats.peakFps, 0)}
                        />
                      </div>
                      <div className="overflow-x-auto lg:col-span-2">
                        <table className="w-full min-w-[760px] border-2 border-black bg-[#fff9ed] text-left">
                          <thead className="border-b-2 border-black bg-[#171411] text-white">
                            <tr>
                              {[
                                "Bucket",
                                "Samples",
                                "Monitor Runs",
                                "Monitor Time",
                                "Legacy HUD FPS Avg",
                                "System CPU Avg",
                              ].map((heading) => (
                                <th
                                  key={heading}
                                  className="neo-copy px-3 py-2 text-[10px] font-black uppercase"
                                >
                                  {heading}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {[...buckets]
                              .slice(-10)
                              .reverse()
                              .map((bucket) => (
                                <tr
                                  key={bucket.key}
                                  className="border-b-2 border-black last:border-b-0"
                                >
                                  <td className="px-3 py-3 text-xs font-black text-[#171411] uppercase">
                                    {bucket.label}
                                  </td>
                                  <td className="px-3 py-3 text-sm font-black text-[#171411]">
                                    {bucket.sampleCount}
                                  </td>
                                  <td className="px-3 py-3 text-sm font-black text-[#087d6d]">
                                    {bucket.sessionCount}
                                  </td>
                                  <td className="px-3 py-3 text-sm font-black text-[#171411]">
                                    {formatDurationLong(bucket.durationSeconds)}
                                  </td>
                                  <td className="px-3 py-3 text-sm font-black text-[#b7102a]">
                                    {formatNumber(bucket.avgFps, 0)}
                                  </td>
                                  <td className="px-3 py-3 text-sm font-black text-[#087d6d]">
                                    {formatNumber(bucket.avgCpu, 0)}%
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <EmptyHistory />
                  )}
                </div>
              </section>

              <section className="border-4 border-black bg-[#f5eedf] shadow-[5px_5px_0_#171411]">
                <div className="flex items-center justify-between border-b-4 border-black p-5">
                  <div>
                    <p className="neo-copy text-[10px] font-bold text-[#55504a] uppercase">
                      Raw Table
                    </p>
                    <h2 className="text-3xl font-black text-[#171411] uppercase">Snapshot Rows</h2>
                  </div>
                  <Database className="h-9 w-9 text-[#c20b2f]" />
                </div>
                <div className="overflow-x-auto p-5">
                  <table className="w-full min-w-[760px] border-2 border-black bg-[#fff9ed] text-left">
                    <thead className="border-b-2 border-black bg-[#171411] text-white">
                      <tr>
                        {[
                          "Zeit",
                          "Capture Context",
                          "Legacy HUD FPS",
                          "HUD Frame",
                          "System CPU",
                          "System GPU",
                          "System RAM",
                        ].map((heading) => (
                          <th
                            key={heading}
                            className="neo-copy px-3 py-2 text-[10px] font-black uppercase"
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSnapshots.slice(0, 18).map((snapshot) => (
                        <tr key={snapshot.id} className="border-b-2 border-black last:border-b-0">
                          <td className="px-3 py-3 text-xs font-black text-[#171411]">
                            {formatDateTime(snapshot.createdAt)}
                          </td>
                          <td className="max-w-[190px] px-3 py-3">
                            <p className="neo-copy truncate text-[10px] font-bold text-[#55504a] uppercase">
                              {formatPerformanceGameLabel(snapshot.gameId)}
                            </p>
                            {isStandalonePerformanceGameId(snapshot.gameId) && (
                              <p className="neo-copy mt-1 text-[8px] font-black text-[#b7102a] uppercase">
                                {OVERLAY_RUNTIME_GAME_ID}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-3 text-sm font-black text-[#b7102a]">
                            {formatNumber(snapshot.fps, 0)}
                          </td>
                          <td className="px-3 py-3 text-sm font-black text-[#171411]">
                            {formatNumber(snapshot.frameTimeMs, 1)} ms
                          </td>
                          <td className="px-3 py-3 text-sm font-black text-[#087d6d]">
                            {formatNumber(snapshot.cpuPercent, 0)}%
                          </td>
                          <td className="px-3 py-3 text-sm font-black text-[#171411]">
                            {snapshot.gpuPercent == null
                              ? "N/A"
                              : `${formatNumber(snapshot.gpuPercent, 0)}%`}
                          </td>
                          <td className="px-3 py-3 text-sm font-black text-[#171411]">
                            {formatNumber(snapshot.ramMb, 0)} MB
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <aside className="space-y-4">
              <ReadoutPanel
                icon={<Activity className="h-7 w-7 text-[#c20b2f]" />}
                label="Last Legacy HUD FPS"
                value={formatNumber(stats.lastFps, 0)}
              />
              <ReadoutPanel
                icon={<Clock className="h-7 w-7 text-[#087d6d]" />}
                label="Last Sample"
                value={stats.lastCreatedAt ? formatDateTime(stats.lastCreatedAt) : "No data"}
              />
              <ReadoutPanel
                icon={<Gauge className="h-7 w-7 text-[#c20b2f]" />}
                label="Avg HUD Frame"
                value={`${formatNumber(bucketStats.avgFrameTimeMs, 1)} ms`}
              />
              <div className="border-4 border-black bg-[#f5eedf] p-5 shadow-[5px_5px_0_#171411]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="neo-copy text-[10px] font-bold text-[#55504a] uppercase">
                      Capture Context
                    </p>
                    <h2 className="mt-2 text-2xl font-black text-[#171411] uppercase">
                      {attributionStats.statusLabel}
                    </h2>
                  </div>
                  <Gamepad2 className="h-8 w-8 text-[#087d6d]" />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 border-y-2 border-black py-3">
                  <div>
                    <p className="neo-copy text-[9px] font-bold text-[#55504a] uppercase">
                      Active-game Contexts
                    </p>
                    <p className="mt-1 text-xl font-black text-[#087d6d] uppercase">
                      {attributionStats.activeGameCount}
                    </p>
                  </div>
                  <div>
                    <p className="neo-copy text-[9px] font-bold text-[#55504a] uppercase">
                      Standalone Rows
                    </p>
                    <p className="mt-1 text-xl font-black text-[#b7102a] uppercase">
                      {attributionStats.standaloneRowCount}
                    </p>
                  </div>
                </div>
                <div className="mt-3 border-2 border-black bg-[#fff9ed] p-3">
                  <p className="neo-copy text-[9px] font-black text-[#55504a] uppercase">
                    Fallback ID
                  </p>
                  <p className="mt-1 text-sm font-black break-words text-[#171411] uppercase">
                    {OVERLAY_RUNTIME_GAME_ID}
                  </p>
                </div>
              </div>
              <div className="border-4 border-black bg-[#f5eedf] p-5 shadow-[5px_5px_0_#171411]">
                <p className="neo-copy text-[10px] font-bold text-[#55504a] uppercase">
                  System Session Aggregates
                </p>
                <h2 className="mt-2 text-3xl font-black text-[#171411] uppercase">
                  {sessionStats.count} Runs
                </h2>
                <div className="mt-4 grid grid-cols-2 gap-3 border-y-2 border-black py-3">
                  <div>
                    <p className="neo-copy text-[9px] font-bold text-[#55504a] uppercase">
                      Legacy HUD FPS Avg
                    </p>
                    <p className="mt-1 text-xl font-black text-[#b7102a] uppercase">
                      {formatNumber(sessionStats.avgFps, 0)}
                    </p>
                  </div>
                  <div>
                    <p className="neo-copy text-[9px] font-bold text-[#55504a] uppercase">
                      System RAM Peak
                    </p>
                    <p className="mt-1 text-xl font-black text-[#087d6d] uppercase">
                      {formatNumber(sessionStats.peakRamMb, 0)} MB
                    </p>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {filteredSessions.slice(0, 3).map((session) => (
                    <div
                      key={session.id}
                      className="border-b-2 border-black pb-2 last:border-b-0 last:pb-0"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-black text-[#171411] uppercase">
                          {formatPerformanceGameLabel(session.gameId)}
                        </p>
                        <p className="neo-copy shrink-0 text-[9px] font-black text-[#55504a] uppercase">
                          {formatDuration(session.durationSeconds)}
                        </p>
                      </div>
                      <p className="neo-copy mt-1 text-[9px] font-bold text-[#55504a] uppercase">
                        {session.sampleCount} samples // avg{" "}
                        {formatNumber(session.avgCpuPercent, 0)}% system cpu //{" "}
                        {formatNumber(session.avgFps, 0)} legacy hud fps
                      </p>
                      {isStandalonePerformanceGameId(session.gameId) && (
                        <p className="neo-copy mt-1 text-[8px] font-black text-[#b7102a] uppercase">
                          standalone source // {OVERLAY_RUNTIME_GAME_ID}
                        </p>
                      )}
                    </div>
                  ))}
                  {filteredSessions.length === 0 && (
                    <p className="neo-copy text-[10px] leading-relaxed font-bold text-[#55504a] uppercase">
                      No flushed sessions yet.
                    </p>
                  )}
                </div>
              </div>
              <div className="border-4 border-black bg-[#171411] p-5 text-[#f5eedf] shadow-[5px_5px_0_#171411]">
                <p className="neo-copy text-[10px] font-bold text-[#8cf5e4] uppercase">
                  Write Source
                </p>
                <h2 className="mt-2 text-2xl font-black uppercase">
                  {isLocalPreview ? "Local Preview" : "Overlay Monitor"}
                </h2>
                <p className="neo-copy mt-4 text-[10px] leading-relaxed font-bold text-[#f5eedf] uppercase">
                  {isLocalPreview
                    ? "Sample rows are generated locally because Supabase env vars are missing."
                    : "Persisted samples are written from the performance overlay at a throttled cadence."}
                </p>
              </div>
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}

type ResolvedBucketMode = Exclude<PerformanceBucketMode, "auto">;

type PerformanceBucket = {
  avgCpu: number | null;
  avgFps: number | null;
  avgFrameTimeMs: number | null;
  avgGpu: number | null;
  avgRamMb: number | null;
  durationSeconds: number;
  key: string;
  label: string;
  peakFps: number | null;
  sampleCount: number;
  sessionCount: number;
  startedAt: number;
};

function HistoryChart({ buckets }: { buckets: PerformanceBucket[] }) {
  const visibleBuckets = buckets.slice(-96);

  return (
    <div className="border-2 border-black bg-[#fff9ed] p-4 shadow-[3px_3px_0_#171411]">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Legend color="#b7102a" label="Legacy HUD FPS" />
        <Legend color="#087d6d" label="System CPU %" />
        <Legend color="#8cf5e4" label="System GPU %" />
        <Legend color="#171411" label="HUD Frame MS" />
      </div>
      <svg
        className="h-64 w-full border-2 border-black bg-[#efe6d4]"
        role="img"
        viewBox="0 0 720 260"
      >
        <title>Performance history chart</title>
        {[40, 90, 140, 190, 240].map((y) => (
          <line
            key={y}
            stroke="#171411"
            strokeDasharray="6 8"
            strokeOpacity="0.25"
            x1="20"
            x2="700"
            y1={y}
            y2={y}
          />
        ))}
        <polyline
          fill="none"
          points={toPoints(
            visibleBuckets.map((bucket) => bucket.avgFps),
            720,
            260,
            120,
          )}
          stroke="#b7102a"
          strokeLinejoin="miter"
          strokeWidth="5"
        />
        <polyline
          fill="none"
          points={toPoints(
            visibleBuckets.map((bucket) => bucket.avgCpu),
            720,
            260,
            100,
          )}
          stroke="#087d6d"
          strokeLinejoin="miter"
          strokeWidth="4"
        />
        <polyline
          fill="none"
          points={toPoints(
            visibleBuckets.map((bucket) => bucket.avgGpu),
            720,
            260,
            100,
          )}
          stroke="#8cf5e4"
          strokeLinejoin="miter"
          strokeWidth="4"
        />
        <polyline
          fill="none"
          points={toPoints(
            visibleBuckets.map((bucket) => bucket.avgFrameTimeMs),
            720,
            260,
            40,
          )}
          stroke="#171411"
          strokeLinejoin="miter"
          strokeWidth="3"
        />
      </svg>
    </div>
  );
}

function BucketBars({ buckets }: { buckets: PerformanceBucket[] }) {
  const visibleBuckets = buckets.slice(-36);
  const maxDuration = Math.max(1, ...visibleBuckets.map((bucket) => bucket.durationSeconds));
  const barGap = 4;
  const innerWidth = 680;
  const barWidth = Math.max(
    4,
    (innerWidth - barGap * (visibleBuckets.length - 1)) / visibleBuckets.length,
  );

  return (
    <div className="border-2 border-black bg-[#fff9ed] p-4 shadow-[3px_3px_0_#171411]">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Legend color="#087d6d" label="Playtime" />
        <Legend color="#c20b2f" label="Runs" />
      </div>
      <svg
        className="h-64 w-full border-2 border-black bg-[#efe6d4]"
        role="img"
        viewBox="0 0 720 260"
      >
        <title>Performance playtime bucket chart</title>
        {[50, 100, 150, 200].map((y) => (
          <line
            key={y}
            stroke="#171411"
            strokeDasharray="6 8"
            strokeOpacity="0.2"
            x1="20"
            x2="700"
            y1={y}
            y2={y}
          />
        ))}
        {visibleBuckets.map((bucket, index) => {
          const height = Math.max(4, (bucket.durationSeconds / maxDuration) * 200);
          const x = 20 + index * (barWidth + barGap);
          const y = 230 - height;
          const runHeight = Math.max(0, Math.min(44, bucket.sessionCount * 8));

          return (
            <g key={bucket.key}>
              <rect
                fill="#087d6d"
                height={height}
                stroke="#171411"
                strokeWidth="2"
                width={barWidth}
                x={x}
                y={y}
              />
              {runHeight > 0 && (
                <rect
                  fill="#c20b2f"
                  height={runHeight}
                  stroke="#171411"
                  strokeWidth="2"
                  width={barWidth}
                  x={x}
                  y={230 - runHeight}
                />
              )}
            </g>
          );
        })}
      </svg>
      <div className="neo-copy mt-3 flex justify-between gap-3 text-[9px] font-black text-[#55504a] uppercase">
        <span>{visibleBuckets[0]?.label ?? "N/A"}</span>
        <span>{visibleBuckets[visibleBuckets.length - 1]?.label ?? "N/A"}</span>
      </div>
    </div>
  );
}

function toPoints(
  values: Array<number | null>,
  width: number,
  height: number,
  baselineMax: number,
) {
  if (values.length === 0) return "";
  const normalizedValues = values.map((value) =>
    typeof value === "number" && Number.isFinite(value) ? value : 0,
  );
  const max = Math.max(baselineMax, ...normalizedValues);
  const innerWidth = width - 40;
  const innerHeight = height - 40;
  return normalizedValues
    .map((value, index) => {
      const x =
        20 +
        (normalizedValues.length === 1 ? 0 : (index / (normalizedValues.length - 1)) * innerWidth);
      const y = 20 + innerHeight - (Math.max(0, value) / max) * innerHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="neo-copy inline-flex items-center gap-2 border-2 border-black bg-[#f5eedf] px-2 py-1 text-[10px] font-black text-[#171411] uppercase">
      <span className="h-3 w-5 border-2 border-black" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-black bg-[#efe6d4] p-3 shadow-[2px_2px_0_#171411]">
      <p className="neo-copy text-[9px] font-bold text-[#55504a] uppercase">{label}</p>
      <p className="mt-1 text-2xl font-black text-[#171411] uppercase">{value}</p>
    </div>
  );
}

function ReadoutPanel({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="border-4 border-black bg-[#f5eedf] p-5 shadow-[5px_5px_0_#171411]">
      <div className="flex items-center justify-between gap-4">
        <p className="neo-copy text-[10px] font-bold text-[#55504a] uppercase">{label}</p>
        {icon}
      </div>
      <p className="mt-4 text-3xl font-black break-words text-[#171411] uppercase">{value}</p>
    </div>
  );
}

function LocalPerformancePreviewNotice({ isVerification = false }: { isVerification?: boolean }) {
  return (
    <div className="flex flex-wrap items-start gap-4 border-4 border-black bg-[#fff9ed] p-4 shadow-[5px_5px_0_#171411]">
      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center border-2 border-black bg-[#c20b2f] text-white shadow-[2px_2px_0_#171411]">
        <CloudOff aria-hidden="true" className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="neo-copy text-[10px] font-black tracking-[0.12em] text-[#c20b2f] uppercase">
          Browser Performance Relay
        </p>
        <h2 className="mt-1 text-2xl font-black text-[#171411] uppercase">
          Local Performance Preview
        </h2>
        <p className="neo-copy mt-2 text-[10px] leading-relaxed font-bold text-[#55504a] uppercase">
          {isVerification
            ? "Development-only verification data proves the System/HUD labels without Supabase reads, writes, or a game benchmark claim."
            : "Supabase is not configured, so this route renders local performance samples instead of opening an empty settings dead end."}
        </p>
      </div>
    </div>
  );
}

function MissingSelectedGameHistoryNotice({
  isActivityCrossFilter,
  label,
}: {
  isActivityCrossFilter: boolean;
  label: string;
}) {
  return (
    <div className="flex flex-wrap items-start gap-4 border-4 border-black bg-[#fff9ed] p-4 shadow-[5px_5px_0_#171411]">
      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center border-2 border-black bg-[#171411] text-white shadow-[2px_2px_0_#c20b2f]">
        <Filter aria-hidden="true" className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="neo-copy text-[10px] font-black tracking-[0.12em] text-[#c20b2f] uppercase">
          {isActivityCrossFilter ? "Activity Crossfilter" : "Game Filter"}
        </p>
        <h2 className="mt-1 text-2xl font-black text-[#171411] uppercase">
          No Performance Rows For {label}
        </h2>
        <p className="neo-copy mt-2 text-[10px] leading-relaxed font-bold text-[#55504a] uppercase">
          The selected game stays pinned so the mismatch is visible. Launch this game with the
          overlay monitor active, or switch the game filter back to all games.
        </p>
      </div>
    </div>
  );
}

function Notice({
  body,
  title,
  tone = "info",
}: {
  body: string;
  title: string;
  tone?: "info" | "error";
}) {
  return (
    <div className="border-4 border-black bg-[#f5eedf] p-6 shadow-[5px_5px_0_#171411]">
      <p
        className={`neo-copy inline-flex border-2 border-black px-3 py-1 text-[10px] font-black text-white uppercase ${tone === "error" ? "bg-[#c20b2f]" : "bg-[#087d6d]"}`}
      >
        {title}
      </p>
      <p className="neo-copy mt-4 text-xs leading-relaxed font-bold text-[#55504a] uppercase">
        {body}
      </p>
    </div>
  );
}

function EmptyHistory() {
  return (
    <div className="border-2 border-black bg-[#efe6d4] p-6 text-center shadow-[3px_3px_0_#171411]">
      <p className="text-3xl font-black text-[#171411] uppercase">No Samples Yet</p>
      <p className="neo-copy mx-auto mt-3 max-w-[520px] text-[10px] leading-relaxed font-bold text-[#55504a] uppercase">
        Open the performance overlay while signed in. New system-telemetry samples will appear here
        after the next write interval.
      </p>
    </div>
  );
}

function createLocalPerformancePreview(now: Date): {
  sessions: PerformanceSession[];
  snapshots: PerformanceSnapshot[];
} {
  const userId = "local-browser-preview";
  const gameIds = ["local-demo-neon-runner", "local-demo-mecha-shift", OVERLAY_RUNTIME_GAME_ID];
  const snapshots: PerformanceSnapshot[] = Array.from({ length: 18 }, (_, index) => {
    const minutesAgo = (17 - index) * 8 * 60 + (index % 3) * 22;
    const gameId = gameIds[index % gameIds.length] ?? gameIds[0];
    const isOverlay = isStandalonePerformanceGameId(gameId);
    const createdAt = new Date(now.getTime() - minutesAgo * 60_000);

    return {
      cpuPercent: 34 + ((index * 7) % 38),
      createdAt: createdAt.toISOString(),
      diskReadMbps: index % 4 === 0 ? 12 : 3,
      diskWriteMbps: index % 5 === 0 ? 8 : 2,
      durationSeconds: 420 + index * 35,
      fps: isOverlay ? 55 + (index % 5) * 3 : 72 + (index % 6) * 4,
      frameTimeMs: isOverlay ? 18.5 - (index % 4) : 15.8 - (index % 3) * 0.7,
      gameId,
      gpuPercent: isOverlay ? 48 + (index % 4) * 5 : 58 + (index % 5) * 6,
      gpuTempC: 62 + (index % 5),
      gpuVramMb: null,
      id: `local-performance-snapshot-${index + 1}`,
      networkDownKbps: 400 + index * 18,
      networkUpKbps: 90 + index * 9,
      ramMb: 7_200 + index * 96,
      userId,
    };
  });

  const sessions: PerformanceSession[] = [
    {
      avgCpuPercent: 43,
      avgFps: 82,
      avgGpuPercent: 66,
      avgRamMb: 7_650,
      createdAt: new Date(now.getTime() - 58 * 60_000).toISOString(),
      durationSeconds: 2_940,
      endedAt: new Date(now.getTime() - 52 * 60_000).toISOString(),
      gameId: "local-demo-neon-runner",
      id: "local-performance-session-1",
      maxCpuPercent: 71,
      maxFps: 96,
      maxGpuPercent: 84,
      maxRamMb: 8_420,
      sampleCount: 9,
      startedAt: new Date(now.getTime() - 101 * 60_000).toISOString(),
      userId,
    },
    {
      avgCpuPercent: 39,
      avgFps: 74,
      avgGpuPercent: 61,
      avgRamMb: 7_180,
      createdAt: new Date(now.getTime() - 2 * 60 * 60_000).toISOString(),
      durationSeconds: 2_220,
      endedAt: new Date(now.getTime() - 2 * 60 * 60_000).toISOString(),
      gameId: "local-demo-mecha-shift",
      id: "local-performance-session-2",
      maxCpuPercent: 64,
      maxFps: 88,
      maxGpuPercent: 79,
      maxRamMb: 7_940,
      sampleCount: 7,
      startedAt: new Date(now.getTime() - 2 * 60 * 60_000 - 2_220_000).toISOString(),
      userId,
    },
    {
      avgCpuPercent: 31,
      avgFps: 57,
      avgGpuPercent: 49,
      avgRamMb: 6_910,
      createdAt: new Date(now.getTime() - 3 * 60 * 60_000).toISOString(),
      durationSeconds: 1_260,
      endedAt: new Date(now.getTime() - 3 * 60 * 60_000).toISOString(),
      gameId: OVERLAY_RUNTIME_GAME_ID,
      id: "local-performance-session-3",
      maxCpuPercent: 46,
      maxFps: 66,
      maxGpuPercent: 58,
      maxRamMb: 7_320,
      sampleCount: 5,
      startedAt: new Date(now.getTime() - 3 * 60 * 60_000 - 1_260_000).toISOString(),
      userId,
    },
  ];

  return { sessions, snapshots };
}

function readPerformanceRangeParam(value: string | null): PerformanceHistoryRange | null {
  return performanceRangeValues.has(value as PerformanceHistoryRange)
    ? (value as PerformanceHistoryRange)
    : null;
}

function readBucketModeParam(value: string | null): PerformanceBucketMode | null {
  return bucketModeValues.has(value as PerformanceBucketMode)
    ? (value as PerformanceBucketMode)
    : null;
}

function normalizeGameFilterParam(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

type BucketAccumulator = {
  cpuValues: number[];
  durationSeconds: number;
  fpsValues: number[];
  frameTimeValues: number[];
  gpuValues: number[];
  key: string;
  label: string;
  peakFpsValues: number[];
  ramValues: number[];
  sampleCount: number;
  sessionCount: number;
  sessionFpsValues: number[];
  startedAt: number;
};

function resolveBucketMode(
  range: PerformanceHistoryRange,
  bucketMode: PerformanceBucketMode,
): ResolvedBucketMode {
  if (bucketMode !== "auto") return bucketMode;
  if (range === "1d") return "hour";
  if (range === "365d" || range === "all") return "month";
  return "day";
}

function buildPerformanceBuckets(
  snapshots: PerformanceSnapshot[],
  sessions: PerformanceSession[],
  mode: ResolvedBucketMode,
): PerformanceBucket[] {
  const buckets = new Map<string, BucketAccumulator>();

  snapshots.forEach((snapshot) => {
    const bucket = ensureBucket(buckets, snapshot.createdAt, mode);
    if (!bucket) return;

    bucket.sampleCount += 1;
    bucket.cpuValues.push(snapshot.cpuPercent);
    bucket.ramValues.push(snapshot.ramMb);
    if (typeof snapshot.fps === "number") {
      bucket.fpsValues.push(snapshot.fps);
      bucket.peakFpsValues.push(snapshot.fps);
    }
    if (typeof snapshot.gpuPercent === "number") bucket.gpuValues.push(snapshot.gpuPercent);
    if (typeof snapshot.frameTimeMs === "number") bucket.frameTimeValues.push(snapshot.frameTimeMs);
  });

  sessions.forEach((session) => {
    const bucket = ensureBucket(buckets, session.endedAt || session.startedAt, mode);
    if (!bucket) return;

    bucket.sessionCount += 1;
    bucket.durationSeconds += Math.max(0, session.durationSeconds);
    if (typeof session.avgFps === "number") bucket.sessionFpsValues.push(session.avgFps);
    if (typeof session.maxFps === "number") bucket.peakFpsValues.push(session.maxFps);
  });

  return [...buckets.values()]
    .map((bucket) => {
      const fpsValues = bucket.fpsValues.length > 0 ? bucket.fpsValues : bucket.sessionFpsValues;

      return {
        avgCpu: average(bucket.cpuValues),
        avgFps: average(fpsValues),
        avgFrameTimeMs: average(bucket.frameTimeValues),
        avgGpu: average(bucket.gpuValues),
        avgRamMb: average(bucket.ramValues),
        durationSeconds: bucket.durationSeconds,
        key: bucket.key,
        label: bucket.label,
        peakFps: maxNumber(bucket.peakFpsValues),
        sampleCount: bucket.sampleCount,
        sessionCount: bucket.sessionCount,
        startedAt: bucket.startedAt,
      };
    })
    .sort((a, b) => a.startedAt - b.startedAt);
}

function ensureBucket(
  buckets: Map<string, BucketAccumulator>,
  value: string,
  mode: ResolvedBucketMode,
) {
  const date = toValidDate(value);
  if (!date) return null;

  const startedAt = bucketStart(date, mode);
  const key = startedAt.toISOString();
  const existing = buckets.get(key);
  if (existing) return existing;

  const bucket: BucketAccumulator = {
    cpuValues: [],
    durationSeconds: 0,
    fpsValues: [],
    frameTimeValues: [],
    gpuValues: [],
    key,
    label: formatBucketLabel(startedAt, mode),
    peakFpsValues: [],
    ramValues: [],
    sampleCount: 0,
    sessionCount: 0,
    sessionFpsValues: [],
    startedAt: startedAt.getTime(),
  };
  buckets.set(key, bucket);
  return bucket;
}

function bucketStart(date: Date, mode: ResolvedBucketMode) {
  const next = new Date(date);
  next.setSeconds(0, 0);

  if (mode === "hour") {
    next.setMinutes(0, 0, 0);
    return next;
  }

  next.setHours(0, 0, 0, 0);
  if (mode === "day") return next;

  if (mode === "week") {
    const dayOffset = (next.getDay() + 6) % 7;
    next.setDate(next.getDate() - dayOffset);
    return next;
  }

  next.setDate(1);
  return next;
}

function toValidDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatBucketLabel(date: Date, mode: ResolvedBucketMode) {
  if (mode === "hour") {
    return new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      hour: "2-digit",
      month: "short",
    }).format(date);
  }

  if (mode === "month") {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      year: "2-digit",
    }).format(date);
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

function formatBucketMode(mode: ResolvedBucketMode) {
  if (mode === "hour") return "Stunde";
  if (mode === "day") return "Tag";
  if (mode === "week") return "Woche";
  return "Monat";
}

function summarizeBuckets(buckets: PerformanceBucket[]) {
  const frameValues = buckets
    .map((bucket) => bucket.avgFrameTimeMs)
    .filter((value): value is number => typeof value === "number");
  const peakFpsValues = buckets
    .map((bucket) => bucket.peakFps)
    .filter((value): value is number => typeof value === "number");

  return {
    avgFrameTimeMs: average(frameValues),
    durationSeconds: buckets.reduce((total, bucket) => total + bucket.durationSeconds, 0),
    peakFps: maxNumber(peakFpsValues),
  };
}

function summarize(snapshots: PerformanceSnapshot[]) {
  const fpsValues = snapshots
    .map((snapshot) => snapshot.fps)
    .filter((value): value is number => typeof value === "number");
  const cpuValues = snapshots.map((snapshot) => snapshot.cpuPercent);
  const newest = snapshots[0] ?? null;

  return {
    avgCpu: average(cpuValues),
    avgFps: average(fpsValues),
    lastCreatedAt: newest?.createdAt ?? null,
    lastFps: newest?.fps ?? null,
  };
}

function summarizeSessions(sessions: PerformanceSession[]) {
  const avgFpsValues = sessions
    .map((session) => session.avgFps)
    .filter((value): value is number => typeof value === "number");
  const peakRamValues = sessions.map((session) => session.maxRamMb);

  return {
    avgFps: average(avgFpsValues),
    count: sessions.length,
    peakRamMb: peakRamValues.length > 0 ? Math.max(...peakRamValues) : null,
  };
}

function summarizeAttribution(snapshots: PerformanceSnapshot[], sessions: PerformanceSession[]) {
  const rowGameIds = [
    ...snapshots.map((snapshot) => snapshot.gameId),
    ...sessions.map((session) => session.gameId),
  ];
  const standaloneRowCount = rowGameIds.filter(isStandalonePerformanceGameId).length;
  const activeGameCount = new Set(
    rowGameIds.filter((gameId) => gameId && !isStandalonePerformanceGameId(gameId)),
  ).size;

  return {
    activeGameCount,
    standaloneRowCount,
    statusLabel: standaloneRowCount > 0 ? "Mixed Source" : "Launch Context",
  };
}

function formatPerformanceGameLabel(gameId: string) {
  if (isStandalonePerformanceGameId(gameId)) {
    return "Standalone Overlay";
  }

  if (localPerformanceGameLabels[gameId]) {
    return localPerformanceGameLabels[gameId];
  }

  return gameId;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function maxNumber(values: number[]) {
  return values.length > 0 ? Math.max(...values) : null;
}

function formatNumber(value: number | null, maximumFractionDigits: number) {
  if (value == null || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  if (minutes <= 0) return `${remainingSeconds}s`;
  return `${minutes}m ${remainingSeconds.toString().padStart(2, "0")}s`;
}

function formatDurationLong(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${remainingSeconds}s`;
}

function formatDateTime(value: string) {
  if (!value) return "N/A";
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}
