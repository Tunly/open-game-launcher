import { useMemo, useState } from "react";
import { BarChart3, Hourglass, Loader2, Sparkles, Trophy } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useUserPlaySessions } from "../../hooks/useUserPlaySessions";
import type { UserPlaySession } from "../../lib/supabase/playtime";

type ActivityRange = "day" | "week" | "month" | "year";

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

const AXIS_TICK_STYLE = {
  fill: "#171411",
  fontFamily: '"JetBrains Mono", "Courier New", ui-monospace, monospace',
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase" as const,
};

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
  return session.durationMinutes ?? 0;
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
        gameTitle: session.gameId,
        gameCoverUrl: null,
        minutes,
      });
    }
  }
  return Array.from(totals.values())
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, limit);
}

interface ActivityChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ value?: number | string }>;
}

function ActivityChartTooltip({ active, label, payload }: ActivityChartTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const minutes = Number(payload[0]?.value ?? 0);
  return (
    <div className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[10px] font-black uppercase shadow-[3px_3px_0_#1f1c0f]">
      <span className="block text-[#171411]">{String(label ?? "")}</span>
      <span className="mt-1 block text-[#087d6d]">{formatPlayTimeMinutes(minutes)}</span>
    </div>
  );
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
  return (
    <div
      aria-label={ariaLabel}
      className="h-72 w-full border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#1f1c0f]"
      role="img"
    >
      <ResponsiveContainer height="100%" width="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid
            stroke="#171411"
            strokeDasharray="2 4"
            strokeOpacity={0.18}
            vertical={false}
          />
          <XAxis
            dataKey="label"
            interval={range === "month" ? 2 : 0}
            stroke="#171411"
            tick={AXIS_TICK_STYLE}
            tickLine={false}
          />
          <YAxis
            stroke="#171411"
            tick={AXIS_TICK_STYLE}
            tickLine={false}
            width={48}
            tickFormatter={(value: number) => formatPlayTimeMinutes(value)}
          />
          <Tooltip
            content={<ActivityChartTooltip />}
            cursor={{ fill: "#087d6d", fillOpacity: 0.12 }}
            wrapperStyle={{ outline: "none" }}
          />
          <Bar dataKey="minutes" fill="#087d6d" stroke="#171411" strokeWidth={2} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface TopGamesListProps {
  games: TopGameEntry[];
  totalMinutes: number;
}

function TopGamesList({ games, totalMinutes }: TopGamesListProps) {
  if (games.length === 0) {
    return (
      <div className="border-2 border-black bg-[#fff9ed] p-4 shadow-[3px_3px_0_#1f1c0f]">
        <p className="neo-copy text-[10px] font-bold uppercase text-[#55504a]">
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
            className="grid grid-cols-[28px_minmax(0,1fr)_88px] items-center gap-3 border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#1f1c0f]"
          >
            <span className="neo-copy inline-flex h-7 w-7 items-center justify-center border-2 border-black bg-[#c20b2f] text-[11px] font-black text-white">
              {index + 1}
            </span>
            <div className="min-w-0">
              <span className="block truncate text-sm font-black uppercase text-[#171411]">
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
            <span className="neo-copy text-right text-[11px] font-black uppercase text-[#171411]">
              {formatPlayTimeMinutes(game.minutes)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function ActivitySection() {
  const [range, setRange] = useState<ActivityRange>("week");
  const { sessions, isLoading, error } = useUserPlaySessions();
  const now = useMemo(() => new Date(), []);

  const sessionsInRange = useMemo(
    () => filterSessionsByRange(sessions, range, now),
    [sessions, range, now],
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
          <p className="neo-copy text-[10px] font-bold uppercase text-[#55504a]">Session History</p>
          <h2 className="text-3xl font-black uppercase text-[#171411]">Activity</h2>
        </div>
        <BarChart3 aria-hidden="true" className="h-10 w-10 text-[#087d6d]" />
      </div>

      <div className="space-y-5 p-5">
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
            <p className="neo-copy text-[10px] font-bold uppercase text-[#55504a]">
              Total // {describeRange(range)}
            </p>
            <p className="neo-copy mt-1 truncate text-xl font-black uppercase text-[#171411]">
              {formatPlayTimeMinutes(totalMinutes)} across {sessionsInRange.length} session
              {sessionsInRange.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="border-2 border-black bg-[#fff9ed] p-6 shadow-[3px_3px_0_#1f1c0f]">
            <p className="neo-copy inline-flex items-center gap-2 text-xs font-bold uppercase text-[#55504a]">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              Loading activity...
            </p>
          </div>
        ) : error ? (
          <div className="border-2 border-black bg-[#fbd6dc] p-4 shadow-[3px_3px_0_#1f1c0f]">
            <p className="neo-copy text-[11px] font-black uppercase text-[#7a0918]">{error}</p>
          </div>
        ) : sessionsInRange.length === 0 ? (
          <div className="border-2 border-black bg-[#fff9ed] p-6 shadow-[3px_3px_0_#1f1c0f]">
            <div className="flex items-start gap-3">
              <Sparkles aria-hidden="true" className="h-5 w-5 shrink-0 text-[#087d6d]" />
              <div>
                <p className="text-sm font-black uppercase text-[#171411]">
                  No play sessions recorded yet
                </p>
                <p className="neo-copy mt-2 text-[10px] font-bold uppercase leading-relaxed text-[#55504a]">
                  Launch a game to start filling this dashboard. Synced sessions will appear here as
                  soon as your Rust poller flushes them to Supabase.
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
                <h3 className="neo-copy text-[11px] font-black uppercase text-[#171411]">
                  Top 5 Games // {describeRange(range)}
                </h3>
              </div>
              <TopGamesList games={topGames} totalMinutes={totalMinutes} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
