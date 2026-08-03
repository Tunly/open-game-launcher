import { useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  CloudOff,
  Hourglass,
  Loader2,
  Sparkles,
  Trophy,
} from "lucide-react";
import { Link } from "react-router-dom";

import { useUserPlaySessions } from "../../hooks/useUserPlaySessions";
import {
  buildPerformanceHistoryPath,
  type ActivityRange,
} from "../../lib/activity-performance-links";
import type { UserPlaySession } from "../../lib/supabase/playtime";

interface RangeButton {
  id: ActivityRange;
  label: string;
  description: string;
}

const RANGE_BUTTONS: RangeButton[] = [
  { id: "day", label: "Day", description: "Last 24 hours" },
  { id: "week", label: "Week", description: "Last 7 days" },
  { id: "month", label: "Month", description: "Last 30 days" },
  { id: "year", label: "Year", description: "Last 12 months" },
];

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const HOUR_LABELS = Array.from({ length: 24 }, (_, hour) => {
  if (hour === 0) return "0";
  if (hour === 12) return "12";
  if (hour < 12) return `${hour}a`;
  return `${hour - 12}p`;
});

interface ChartPoint {
  label: string;
  minutes: number;
  key: string;
}

function formatPlayTimeMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "0m";
  }
  const totalMinutes = Math.round(minutes);
  const hours = Math.floor(totalMinutes / 60);
  const remainder = totalMinutes % 60;
  if (hours === 0) {
    return `${remainder}m`;
  }
  if (remainder === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${remainder}m`;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + amount);
  return next;
}

function weekdayIndex(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

function getRangeWindow(range: ActivityRange, now: Date): { since: Date; until: Date } {
  if (range === "day") {
    const since = new Date(now);
    since.setHours(since.getHours() - 24);
    const until = new Date(now);
    return { since, until };
  }
  if (range === "week") {
    const since = addDays(startOfLocalDay(now), -6);
    const until = addDays(startOfLocalDay(now), 1);
    return { since, until };
  }
  if (range === "month") {
    const since = addDays(startOfLocalDay(now), -29);
    const until = addDays(startOfLocalDay(now), 1);
    return { since, until };
  }
  const since = addMonths(new Date(now.getFullYear(), now.getMonth(), 1), -11);
  const until = addMonths(new Date(now.getFullYear(), now.getMonth(), 1), 1);
  return { since, until };
}

function filterSessionsByRange(
  sessions: UserPlaySession[],
  range: ActivityRange,
  now: Date,
): UserPlaySession[] {
  const { since, until } = getRangeWindow(range, now);
  const sinceMs = since.getTime();
  const untilMs = until.getTime();
  return sessions.filter((session) => {
    const startedAt = new Date(session.startedAt);
    if (Number.isNaN(startedAt.getTime())) {
      return false;
    }
    const ms = startedAt.getTime();
    return ms >= sinceMs && ms < untilMs;
  });
}

function sessionMinutes(session: UserPlaySession): number {
  if (typeof session.durationMinutes === "number" && Number.isFinite(session.durationMinutes)) {
    return Math.max(0, session.durationMinutes);
  }

  const startedAt = new Date(session.startedAt).getTime();
  const endedAt = session.endedAt ? new Date(session.endedAt).getTime() : Number.NaN;
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt <= startedAt) {
    return 0;
  }

  return Math.max(0, Math.round((endedAt - startedAt) / 60_000));
}

function aggregateChart(
  sessions: UserPlaySession[],
  range: ActivityRange,
  now: Date,
): ChartPoint[] {
  if (range === "day") {
    const buckets: ChartPoint[] = HOUR_LABELS.map((label, hour) => ({
      key: `h-${hour}`,
      label,
      minutes: 0,
    }));
    const bucketIndex = new Map<number, ChartPoint>();
    for (const point of buckets) {
      const hour = Number(point.key.slice(2));
      bucketIndex.set(hour, point);
    }
    for (const session of sessions) {
      const started = new Date(session.startedAt);
      if (Number.isNaN(started.getTime())) {
        continue;
      }
      const minutes = sessionMinutes(session);
      const point = bucketIndex.get(started.getHours());
      if (point) {
        point.minutes += minutes;
      }
    }
    return buckets;
  }

  if (range === "week") {
    const buckets: ChartPoint[] = WEEKDAY_LABELS.map((label, index) => ({
      key: `w-${index}`,
      label,
      minutes: 0,
    }));
    const dayStart = startOfLocalDay(now);
    const mondayOffset = weekdayIndex(dayStart);
    for (let offset = -mondayOffset; offset < -mondayOffset + 7; offset += 1) {
      const date = addDays(dayStart, offset);
      const weekday = weekdayIndex(date);
      const minutes = sessions
        .filter((session) => {
          const started = new Date(session.startedAt);
          if (Number.isNaN(started.getTime())) {
            return false;
          }
          return startOfLocalDay(started).getTime() === date.getTime();
        })
        .reduce((sum, session) => sum + sessionMinutes(session), 0);
      const point = buckets[weekday];
      if (point) {
        point.minutes = minutes;
      }
    }
    return buckets;
  }

  if (range === "month") {
    const dayStart = startOfLocalDay(now);
    const monthStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), 1);
    const nextMonthStart = new Date(dayStart.getFullYear(), dayStart.getMonth() + 1, 1);
    const daysInWindow: Date[] = [];
    for (let cursor = monthStart; cursor < nextMonthStart; cursor = addDays(cursor, 1)) {
      daysInWindow.push(new Date(cursor));
    }
    const buckets: ChartPoint[] = daysInWindow.map((date) => ({
      key: `d-${date.getTime()}`,
      label: String(date.getDate()),
      minutes: 0,
    }));
    for (const session of sessions) {
      const started = new Date(session.startedAt);
      if (Number.isNaN(started.getTime())) {
        continue;
      }
      const day = startOfLocalDay(started);
      if (day.getTime() < monthStart.getTime() || day.getTime() >= nextMonthStart.getTime()) {
        continue;
      }
      const offset = Math.round((day.getTime() - monthStart.getTime()) / (24 * 60 * 60 * 1000));
      const point = buckets[offset];
      if (point) {
        point.minutes += sessionMinutes(session);
      }
    }
    return buckets;
  }

  const yearStart = new Date(now.getFullYear(), 0, 1);
  const buckets: ChartPoint[] = MONTH_LABELS.map((label, index) => ({
    key: `m-${index}`,
    label,
    minutes: 0,
  }));
  for (const session of sessions) {
    const started = new Date(session.startedAt);
    if (Number.isNaN(started.getTime())) {
      continue;
    }
    if (started.getFullYear() !== yearStart.getFullYear()) {
      continue;
    }
    const point = buckets[started.getMonth()];
    if (point) {
      point.minutes += sessionMinutes(session);
    }
  }
  return buckets;
}

interface TopGameEntry {
  gameId: string;
  gameTitle: string;
  gameCoverUrl: string | null;
  minutes: number;
}

function topGamesForSessions(sessions: UserPlaySession[], limit: number): TopGameEntry[] {
  const totals = new Map<string, TopGameEntry>();
  for (const session of sessions) {
    const minutes = sessionMinutes(session);
    if (minutes <= 0) continue;
    const existing = totals.get(session.gameId);
    if (existing) {
      existing.minutes += minutes;
    } else {
      totals.set(session.gameId, {
        gameId: session.gameId,
        gameTitle: session.gameTitle ?? session.gameId,
        gameCoverUrl: session.gameCoverUrl ?? null,
        minutes,
      });
    }
  }
  return Array.from(totals.values())
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, limit);
}

function minutesBefore(now: Date, minutes: number) {
  return new Date(now.getTime() - minutes * 60_000);
}

function createLocalActivitySessions(now: Date): UserPlaySession[] {
  const makeSession = (
    id: string,
    gameId: string,
    gameTitle: string,
    startedMinutesAgo: number,
    durationMinutes: number,
  ): UserPlaySession => {
    const started = minutesBefore(now, startedMinutesAgo);
    const ended = new Date(started.getTime() + durationMinutes * 60_000);
    return {
      catalogGameId: gameId,
      durationMinutes,
      endedAt: ended.toISOString(),
      gameCoverUrl: null,
      gameId,
      gameTitle,
      id,
      launcherDeviceId: "browser-preview",
      platform: "web",
      startedAt: started.toISOString(),
    };
  };

  return [
    makeSession("local-activity-1", "local-demo-neon-runner", "Neon Runner", 150, 74),
    makeSession("local-activity-2", "local-demo-mecha-shift", "Mecha Shift", 1_620, 118),
    makeSession("local-activity-3", "local-demo-neon-runner", "Neon Runner", 3_180, 42),
    makeSession("local-activity-4", "local-demo-boss-rush", "Boss Rush EX", 6_900, 96),
  ];
}

function describeRange(range: ActivityRange): string {
  switch (range) {
    case "day":
      return "Last 24 hours";
    case "week":
      return "Last 7 days";
    case "month":
      return "Last 30 days";
    case "year":
    default:
      return "Last 12 months";
  }
}

interface ActivityBarChartProps {
  data: ChartPoint[];
  range: ActivityRange;
  totalMinutes: number;
}

function ActivityBarChart({ data, range, totalMinutes }: ActivityBarChartProps) {
  const ariaLabel = `${describeRange(range)} bar chart, total playtime ${formatPlayTimeMinutes(
    totalMinutes,
  )}`;
  const width = 1000;
  const height = 260;
  const plotTop = 10;
  const plotBottom = 218;
  const plotHeight = plotBottom - plotTop;
  const labelEvery = range === "month" ? 3 : range === "day" ? 3 : 1;
  const maxMinutes = Math.max(1, ...data.map((point) => point.minutes));
  const slotWidth = width / Math.max(1, data.length);
  const barWidth = Math.max(5, slotWidth - Math.min(12, slotWidth * 0.28));

  return (
    <div
      aria-label={ariaLabel}
      className="h-72 w-full border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#1f1c0f]"
      role="img"
    >
      <svg
        aria-hidden="true"
        className="h-full w-full"
        preserveAspectRatio="none"
        viewBox={`0 0 ${width} ${height}`}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const y = plotBottom - plotHeight * fraction;
          return (
            <line
              key={fraction}
              stroke="#171411"
              strokeDasharray="4 8"
              strokeOpacity="0.2"
              strokeWidth="2"
              x1="0"
              x2={width}
              y1={y}
              y2={y}
            />
          );
        })}
        {data.map((point, index) => {
          const barHeight = Math.max(
            point.minutes > 0 ? 3 : 0,
            (point.minutes / maxMinutes) * plotHeight,
          );
          const x = index * slotWidth + (slotWidth - barWidth) / 2;
          const y = plotBottom - barHeight;
          return (
            <g key={point.key}>
              <title>{`${point.label}: ${formatPlayTimeMinutes(point.minutes)}`}</title>
              <rect
                fill="#087d6d"
                height={barHeight}
                stroke="#171411"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                width={barWidth}
                x={x}
                y={y}
              />
              {index % labelEvery === 0 ? (
                <text
                  fill="#171411"
                  fontFamily="ui-monospace, monospace"
                  fontSize="15"
                  fontWeight="800"
                  textAnchor="middle"
                  x={x + barWidth / 2}
                  y="248"
                >
                  {point.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

interface TopGamesListProps {
  games: TopGameEntry[];
  range: ActivityRange;
  totalMinutes: number;
}

function TopGamesList({ games, range, totalMinutes }: TopGamesListProps) {
  if (games.length === 0) {
    return (
      <div className="border-2 border-black bg-[#fff9ed] p-4 shadow-[3px_3px_0_#1f1c0f]">
        <p className="neo-copy text-[10px] font-bold text-[#55504a] uppercase">
          No top games for this range yet.
        </p>
      </div>
    );
  }
  return (
    <ol className="space-y-2">
      {games.map((game, index) => {
        const percent = totalMinutes > 0 ? Math.min(100, (game.minutes / totalMinutes) * 100) : 0;
        return (
          <li
            key={game.gameId}
            className="grid grid-cols-[28px_minmax(0,1fr)_88px_40px] items-center gap-3 border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#1f1c0f]"
          >
            <span className="neo-copy inline-flex h-7 w-7 items-center justify-center border-2 border-black bg-[#c20b2f] text-[11px] font-black text-white">
              {index + 1}
            </span>
            <div className="min-w-0">
              <span className="block truncate text-sm font-black text-[#171411] uppercase">
                {game.gameTitle}
              </span>
              <div className="mt-1 h-3 w-full border border-black bg-[#efe6d4]">
                <div
                  aria-hidden="true"
                  className="h-full bg-[#087d6d]"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
            <span className="neo-copy text-right text-[11px] font-black text-[#171411] uppercase">
              {formatPlayTimeMinutes(game.minutes)}
            </span>
            <Link
              aria-label={`Open performance history for ${game.gameTitle}`}
              className="inline-flex h-9 w-9 items-center justify-center border-2 border-black bg-[#171411] text-white shadow-[2px_2px_0_#087d6d] hover:-translate-y-0.5"
              title="Open performance history"
              to={buildPerformanceHistoryPath(range, game.gameId)}
            >
              <BarChart3 aria-hidden="true" className="h-4 w-4" />
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

export function ActivitySection() {
  const [range, setRange] = useState<ActivityRange>("week");
  const now = useMemo(() => new Date(), []);
  const activityHistoryWindow = useMemo(() => getRangeWindow("year", now), [now]);
  const { sessions, isConfigured, isLoading, error } = useUserPlaySessions(activityHistoryWindow);
  const localPreviewSessions = useMemo(
    () => (isConfigured ? [] : createLocalActivitySessions(now)),
    [isConfigured, now],
  );
  const visibleSessions = isConfigured ? sessions : localPreviewSessions;

  const sessionsInRange = useMemo(
    () => filterSessionsByRange(visibleSessions, range, now),
    [visibleSessions, range, now],
  );
  const chartData = useMemo(
    () => aggregateChart(sessionsInRange, range, now),
    [sessionsInRange, range, now],
  );
  const totalMinutes = useMemo(
    () => sessionsInRange.reduce((sum, session) => sum + sessionMinutes(session), 0),
    [sessionsInRange],
  );
  const topGames = useMemo(() => topGamesForSessions(sessionsInRange, 5), [sessionsInRange]);

  return (
    <section
      aria-label="Session history and playtime activity"
      className="border-4 border-black bg-[#f5eedf] shadow-[4px_4px_0_#171411]"
    >
      <div className="flex items-center justify-between border-b-4 border-black p-5">
        <div>
          <p className="neo-copy text-[10px] font-bold text-[#55504a] uppercase">Session History</p>
          <h2 className="text-3xl font-black text-[#171411] uppercase">Activity</h2>
        </div>
        <BarChart3 aria-hidden="true" className="h-10 w-10 text-[#087d6d]" />
      </div>

      <div className="space-y-5 p-5">
        {!isConfigured ? (
          <div className="flex flex-wrap items-start gap-3 border-[3px] border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center border-2 border-black bg-[#c20b2f] text-white">
              <CloudOff aria-hidden="true" className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="neo-copy text-[10px] font-black tracking-[0.12em] text-[#c20b2f] uppercase">
                Local Activity Relay
              </p>
              <p className="neo-copy mt-2 text-[10px] leading-relaxed font-bold text-[#55504a] uppercase">
                Supabase is not configured, so browser preview uses local sample sessions while the
                launcher chart and performance links stay testable.
              </p>
            </div>
          </div>
        ) : null}

        <div aria-label="Activity range" className="flex flex-wrap gap-2" role="group">
          {RANGE_BUTTONS.map((button) => {
            const isActive = range === button.id;
            return (
              <button
                aria-pressed={isActive}
                aria-label={button.description}
                className={`neo-copy flex h-10 min-w-[64px] items-center justify-center border-2 border-black px-4 text-[11px] font-black uppercase shadow-[2px_2px_0_#1f1c0f] ${
                  isActive
                    ? "bg-[#087d6d] text-white"
                    : "bg-[#fff9ed] text-[#171411] hover:bg-[#f5eedf]"
                }`}
                key={button.id}
                type="button"
                onClick={() => setRange(button.id)}
              >
                {button.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#1f1c0f]">
          <span className="neo-copy inline-flex h-9 w-9 items-center justify-center border-2 border-black bg-[#171411] text-white">
            <Hourglass aria-hidden="true" className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="neo-copy text-[10px] font-bold text-[#55504a] uppercase">
              Total // {describeRange(range)}
            </p>
            <p className="neo-copy mt-1 truncate text-xl font-black text-[#171411] uppercase">
              {formatPlayTimeMinutes(totalMinutes)} across {sessionsInRange.length} session
              {sessionsInRange.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              aria-label="Open yearly activity dashboard"
              className="inline-flex h-10 w-10 items-center justify-center border-2 border-black bg-[#087d6d] text-white shadow-[2px_2px_0_#171411] hover:-translate-y-0.5"
              title="Open yearly activity dashboard"
              to="/activity/recap"
            >
              <CalendarDays aria-hidden="true" className="h-4 w-4" />
            </Link>
            <Link
              aria-label="Open performance history for this activity range"
              className="inline-flex h-10 w-10 items-center justify-center border-2 border-black bg-[#c20b2f] text-white shadow-[2px_2px_0_#171411] hover:-translate-y-0.5"
              title="Open performance history"
              to={buildPerformanceHistoryPath(range)}
            >
              <BarChart3 aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {isLoading ? (
          <div className="border-2 border-black bg-[#fff9ed] p-6 shadow-[3px_3px_0_#1f1c0f]">
            <p className="neo-copy inline-flex items-center gap-2 text-xs font-bold text-[#55504a] uppercase">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              Loading activity...
            </p>
          </div>
        ) : error ? (
          <div className="border-2 border-black bg-[#fbd6dc] p-4 shadow-[3px_3px_0_#1f1c0f]">
            <p className="neo-copy text-[11px] font-black text-[#7a0918] uppercase">{error}</p>
          </div>
        ) : sessionsInRange.length === 0 ? (
          <div className="border-2 border-black bg-[#fff9ed] p-6 shadow-[3px_3px_0_#1f1c0f]">
            <div className="flex items-start gap-3">
              <Sparkles aria-hidden="true" className="h-5 w-5 shrink-0 text-[#087d6d]" />
              <div>
                <p className="text-sm font-black text-[#171411] uppercase">
                  No play sessions recorded yet
                </p>
                <p className="neo-copy mt-2 text-[10px] leading-relaxed font-bold text-[#55504a] uppercase">
                  {isConfigured
                    ? "Launch a game to start filling this activity tape. Synced sessions appear here after the launcher records playtime."
                    : "Browser preview has no synced play sessions for this range yet. Change the range or connect Supabase to load real activity."}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <ActivityBarChart data={chartData} range={range} totalMinutes={totalMinutes} />
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Trophy aria-hidden="true" className="h-4 w-4 text-[#c20b2f]" />
                <h3 className="neo-copy text-[11px] font-black text-[#171411] uppercase">
                  Top 5 Games // {describeRange(range)}
                </h3>
              </div>
              <TopGamesList games={topGames} range={range} totalMinutes={totalMinutes} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
