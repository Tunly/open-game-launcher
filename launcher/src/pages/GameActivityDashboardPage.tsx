import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  BarChart3,
  CalendarDays,
  Clock3,
  CloudOff,
  Copy,
  Download,
  Gamepad2,
  Hourglass,
  Share2,
  Trophy,
  Zap,
} from "lucide-react";

import { useUserPlaySessions } from "../hooks/useUserPlaySessions";
import { buildPerformanceHistoryPath } from "../lib/activity-performance-links";
import {
  buildGameActivityRecapShareImage,
  buildGameActivityRecapShareCard,
  buildGameActivityYearRecap,
  type GameActivityRecap,
  type GameActivityRecapBucket,
  type GameActivityRecapShareCard,
  type GameActivityRecapShareImage,
  type GameActivityRecapTopGame,
} from "../lib/game-activity-recap";
import type { UserPlaySession } from "../lib/supabase/playtime";

function formatPlayTimeMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0m";
  const totalMinutes = Math.round(minutes);
  const hours = Math.floor(totalMinutes / 60);
  const remainder = totalMinutes % 60;
  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value);
}

type ActivityRecapShareStatus =
  | "copied"
  | "copy-failed"
  | "file-share-opened"
  | "idle"
  | "share-failed"
  | "share-opened"
  | "share-unavailable";

type ActivityRecapNativeShareData = {
  files?: File[];
  text: string;
  title: string;
};

type ActivityRecapNavigator = Navigator & {
  canShare?: (data: ActivityRecapNativeShareData) => boolean;
  share?: (data: ActivityRecapNativeShareData) => Promise<void>;
};

function dateInYear(year: number, month: number, day: number, hour: number, minute = 0): Date {
  return new Date(year, month, day, hour, minute, 0, 0);
}

function createSession(
  id: string,
  gameId: string,
  gameTitle: string,
  startedAt: Date,
  durationMinutes: number,
): UserPlaySession {
  const endedAt = new Date(startedAt.getTime() + durationMinutes * 60_000);
  return {
    catalogGameId: gameId,
    durationMinutes,
    endedAt: endedAt.toISOString(),
    gameCoverUrl: null,
    gameId,
    gameTitle,
    id,
    launcherDeviceId: "browser-preview",
    platform: "web",
    startedAt: startedAt.toISOString(),
  };
}

function createLocalRecapSessions(year: number): UserPlaySession[] {
  return [
    createSession(
      "recap-neon-jan",
      "local-demo-neon-runner",
      "Neon Runner",
      dateInYear(year, 0, 12, 22, 10),
      95,
    ),
    createSession(
      "recap-neon-feb",
      "local-demo-neon-runner",
      "Neon Runner",
      dateInYear(year, 1, 4, 21, 30),
      122,
    ),
    createSession(
      "recap-mecha-mar",
      "local-demo-mecha-shift",
      "Mecha Shift",
      dateInYear(year, 2, 7, 15),
      210,
    ),
    createSession(
      "recap-mecha-apr",
      "local-demo-mecha-shift",
      "Mecha Shift",
      dateInYear(year, 3, 3, 16),
      98,
    ),
    createSession(
      "recap-paper-may",
      "local-demo-paper-orbit",
      "Paper Orbit",
      dateInYear(year, 4, 11, 9),
      76,
    ),
    createSession(
      "recap-neon-jun-a",
      "local-demo-neon-runner",
      "Neon Runner",
      dateInYear(year, 5, 8, 19),
      88,
    ),
    createSession(
      "recap-neon-jun-b",
      "local-demo-neon-runner",
      "Neon Runner",
      dateInYear(year, 5, 9, 19),
      64,
    ),
    createSession(
      "recap-neon-jun-c",
      "local-demo-neon-runner",
      "Neon Runner",
      dateInYear(year, 5, 10, 20),
      52,
    ),
    createSession(
      "recap-boss-oct",
      "local-demo-boss-rush",
      "Boss Rush EX",
      dateInYear(year, 9, 15, 23),
      130,
    ),
    createSession(
      "recap-boss-nov",
      "local-demo-boss-rush",
      "Boss Rush EX",
      dateInYear(year, 10, 1, 23),
      156,
    ),
    createSession(
      "recap-paper-dec",
      "local-demo-paper-orbit",
      "Paper Orbit",
      dateInYear(year, 11, 6, 9, 20),
      80,
    ),
  ];
}

function availableYears(sessions: UserPlaySession[], fallbackYear: number): number[] {
  const years = new Set<number>([fallbackYear, fallbackYear - 1]);
  for (const session of sessions) {
    const startedAt = new Date(session.startedAt);
    if (!Number.isNaN(startedAt.getTime())) {
      years.add(startedAt.getFullYear());
    }
  }
  return Array.from(years).sort((a, b) => b - a);
}

function maxMinutes(buckets: GameActivityRecapBucket[]): number {
  return Math.max(1, ...buckets.map((bucket) => bucket.minutes));
}

function StatPanel({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="border-[3px] border-black bg-[#fff9ed] p-4 shadow-[4px_4px_0_#1f1c0f]">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center border-2 border-black bg-[#c20b2f] text-white shadow-[2px_2px_0_#1f1c0f]">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="neo-copy text-[10px] font-black uppercase text-[#655f58]">{label}</p>
          <p className="neo-title mt-1 truncate text-3xl leading-none text-[#171411]">{value}</p>
        </div>
      </div>
    </div>
  );
}

function MonthlyTape({ buckets }: { buckets: GameActivityRecapBucket[] }) {
  const peak = maxMinutes(buckets);
  return (
    <div
      aria-label="Monthly playtime tape"
      className="grid grid-cols-6 gap-2 border-[3px] border-black bg-[#fff9ed] p-4 shadow-[4px_4px_0_#1f1c0f] sm:grid-cols-12"
      role="img"
    >
      {buckets.map((bucket) => {
        const height = bucket.minutes > 0 ? Math.max(14, (bucket.minutes / peak) * 100) : 8;
        return (
          <div className="flex min-h-36 flex-col justify-end gap-2" key={bucket.key}>
            <div className="flex h-28 items-end border-2 border-black bg-[#efe6d4] p-1">
              <div
                aria-hidden="true"
                className="w-full border-2 border-black bg-[#087d6d]"
                style={{ height: `${height}%` }}
              />
            </div>
            <div className="min-w-0 text-center">
              <p className="neo-copy truncate text-[10px] font-black uppercase text-[#171411]">
                {bucket.label}
              </p>
              <p className="neo-copy text-[9px] font-black uppercase text-[#655f58]">
                {formatPlayTimeMinutes(bucket.minutes)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TopGamesPanel({
  games,
  totalMinutes,
}: {
  games: GameActivityRecapTopGame[];
  totalMinutes: number;
}) {
  if (games.length === 0) {
    return (
      <div className="border-[3px] border-black bg-[#fff9ed] p-5 shadow-[4px_4px_0_#1f1c0f]">
        <p className="neo-copy text-[11px] font-black uppercase text-[#655f58]">
          No yearly game sessions recorded yet.
        </p>
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {games.map((game, index) => {
        const percent = totalMinutes > 0 ? Math.min(100, (game.minutes / totalMinutes) * 100) : 0;
        return (
          <li
            className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 border-[3px] border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#1f1c0f]"
            key={game.gameId}
          >
            <div className="neo-title flex h-11 w-11 items-center justify-center border-2 border-black bg-[#171411] text-xl text-[#fff9ed]">
              {String(index + 1).padStart(2, "0")}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <p className="truncate text-base font-black uppercase text-[#171411]">
                  {game.title}
                </p>
                <p className="neo-copy text-[10px] font-black uppercase text-[#c20b2f]">
                  {formatNumber(game.percent)}%
                </p>
              </div>
              <div className="mt-2 h-4 border-2 border-black bg-[#efe6d4]">
                <div
                  aria-hidden="true"
                  className="h-full bg-[#087d6d]"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="neo-copy mt-1 text-[10px] font-black uppercase text-[#655f58]">
                {formatPlayTimeMinutes(game.minutes)} / {game.sessions} sessions
              </p>
            </div>
            <Link
              aria-label={`Open performance history for ${game.title}`}
              className="inline-flex h-10 w-10 items-center justify-center border-2 border-black bg-[#c20b2f] text-white shadow-[2px_2px_0_#1f1c0f] hover:-translate-y-0.5"
              title="Open performance history"
              to={buildPerformanceHistoryPath("year", game.gameId)}
            >
              <BarChart3 aria-hidden="true" className="h-4 w-4" />
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function PatternStrip({ buckets, title }: { buckets: GameActivityRecapBucket[]; title: string }) {
  const peak = maxMinutes(buckets);
  return (
    <div className="border-[3px] border-black bg-[#fff9ed] p-4 shadow-[4px_4px_0_#1f1c0f]">
      <h3 className="neo-copy text-[11px] font-black uppercase text-[#171411]">{title}</h3>
      <div className="mt-4 space-y-2">
        {buckets.map((bucket) => {
          const width = bucket.minutes > 0 ? Math.max(6, (bucket.minutes / peak) * 100) : 0;
          return (
            <div
              className="grid grid-cols-[82px_minmax(0,1fr)_72px] items-center gap-2"
              key={bucket.key}
            >
              <span className="neo-copy truncate text-[10px] font-black uppercase text-[#171411]">
                {bucket.label}
              </span>
              <div className="h-4 border-2 border-black bg-[#efe6d4]">
                <div
                  aria-hidden="true"
                  className="h-full bg-[#087d6d]"
                  style={{ width: `${width}%` }}
                />
              </div>
              <span className="neo-copy text-right text-[10px] font-black uppercase text-[#655f58]">
                {formatPlayTimeMinutes(bucket.minutes)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RecapSummaryPanel({ recap }: { recap: GameActivityRecap }) {
  return (
    <div className="grid gap-3 border-[3px] border-black bg-[#f5eedf] p-4 shadow-[4px_4px_0_#1f1c0f] md:grid-cols-2">
      <div className="border-2 border-black bg-[#fff9ed] p-3">
        <p className="neo-copy text-[10px] font-black uppercase text-[#655f58]">Top Game</p>
        <p className="mt-1 text-lg font-black uppercase text-[#171411]">
          {recap.topGame?.title ?? "No champion yet"}
        </p>
        <p className="neo-copy mt-1 text-[10px] font-black uppercase text-[#c20b2f]">
          {recap.topGame ? formatPlayTimeMinutes(recap.topGame.minutes) : "0m"}
        </p>
      </div>
      <div className="border-2 border-black bg-[#fff9ed] p-3">
        <p className="neo-copy text-[10px] font-black uppercase text-[#655f58]">Prime Window</p>
        <p className="mt-1 text-lg font-black uppercase text-[#171411]">
          {recap.favoriteTimeOfDay?.label ?? "No pattern yet"}
        </p>
        <p className="neo-copy mt-1 text-[10px] font-black uppercase text-[#087d6d]">
          {recap.favoriteWeekday?.label ?? "No day"} / {recap.bestMonth?.label ?? "No month"}
        </p>
      </div>
      <div className="border-2 border-black bg-[#fff9ed] p-3">
        <p className="neo-copy text-[10px] font-black uppercase text-[#655f58]">Longest Run</p>
        <p className="mt-1 text-lg font-black uppercase text-[#171411]">
          {recap.longestSession?.title ?? "No session yet"}
        </p>
        <p className="neo-copy mt-1 text-[10px] font-black uppercase text-[#c20b2f]">
          {recap.longestSession ? formatPlayTimeMinutes(recap.longestSession.minutes) : "0m"}
        </p>
      </div>
      <div className="border-2 border-black bg-[#fff9ed] p-3">
        <p className="neo-copy text-[10px] font-black uppercase text-[#655f58]">Active Streak</p>
        <p className="mt-1 text-lg font-black uppercase text-[#171411]">
          {recap.longestActiveDayStreak} day
          {recap.longestActiveDayStreak === 1 ? "" : "s"}
        </p>
        <p className="neo-copy mt-1 text-[10px] font-black uppercase text-[#087d6d]">
          {recap.activeDayCount} active days
        </p>
      </div>
    </div>
  );
}

function RecapShareCardPanel({
  onCopy,
  onShare,
  shareCard,
  shareImage,
  status,
}: {
  onCopy: () => void;
  onShare: () => void;
  shareCard: GameActivityRecapShareCard;
  shareImage: GameActivityRecapShareImage;
  status: ActivityRecapShareStatus;
}) {
  const href = `data:text/plain;charset=utf-8,${encodeURIComponent(shareCard.text)}`;
  const svgHref = shareImage.dataUri;
  const statusTone =
    status === "copied" || status === "share-opened" || status === "file-share-opened"
      ? "success"
      : status === "copy-failed" || status === "share-failed"
        ? "danger"
        : status === "share-unavailable"
          ? "warning"
          : "idle";
  const statusMessage =
    status === "copied"
      ? "Share card copied."
      : status === "copy-failed"
        ? "Clipboard unavailable."
        : status === "share-opened"
          ? "Browser share handoff opened."
          : status === "file-share-opened"
            ? "Image file share handoff opened."
            : status === "share-unavailable"
              ? "Browser share unavailable; TXT fallback ready."
              : status === "share-failed"
                ? "Browser share failed; TXT fallback ready."
                : shareCard.fileName;

  return (
    <section
      aria-label="Activity recap share card"
      className="grid gap-4 border-[4px] border-black bg-[#fff9ed] p-4 shadow-[5px_5px_0_#1f1c0f] lg:grid-cols-[minmax(0,1fr)_220px]"
    >
      <div className="min-w-0">
        <p className="neo-copy inline-flex border-2 border-black bg-[#171411] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-[#fff9ed]">
          Share Card
        </p>
        <h2 className="neo-title mt-2 text-4xl leading-none text-[#171411]">Export Recap</h2>
        <pre className="neo-copy mt-4 overflow-hidden whitespace-pre-wrap border-[3px] border-black bg-[#f5eedf] p-3 text-[11px] font-black uppercase leading-6 text-[#171411] shadow-[3px_3px_0_#1f1c0f]">
          {shareCard.text}
        </pre>
      </div>
      <div className="grid content-start gap-3">
        <button
          aria-label="Copy activity recap share card"
          className="neo-copy inline-flex h-11 items-center justify-center gap-2 border-[3px] border-black bg-[#087d6d] px-3 text-[10px] font-black uppercase tracking-[0.08em] text-white shadow-[3px_3px_0_#1f1c0f] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0_#1f1c0f]"
          type="button"
          onClick={onCopy}
        >
          <Copy aria-hidden="true" className="h-4 w-4" />
          Copy Card
        </button>
        <button
          aria-label="Open browser share handoff for activity recap"
          className="neo-copy inline-flex h-11 items-center justify-center gap-2 border-[3px] border-black bg-[#171411] px-3 text-[10px] font-black uppercase tracking-[0.08em] text-[#fff9ed] shadow-[3px_3px_0_#1f1c0f] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0_#1f1c0f]"
          type="button"
          onClick={onShare}
        >
          <Share2 aria-hidden="true" className="h-4 w-4" />
          Browser Share
        </button>
        <a
          className="neo-copy inline-flex h-11 items-center justify-center gap-2 border-[3px] border-black bg-[#c20b2f] px-3 text-[10px] font-black uppercase tracking-[0.08em] text-white shadow-[3px_3px_0_#1f1c0f] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0_#1f1c0f]"
          download={shareCard.fileName}
          href={href}
        >
          <Download aria-hidden="true" className="h-4 w-4" />
          Export TXT
        </a>
        <a
          className="neo-copy inline-flex h-11 items-center justify-center gap-2 border-[3px] border-black bg-[#f5eedf] px-3 text-[10px] font-black uppercase tracking-[0.08em] text-[#171411] shadow-[3px_3px_0_#1f1c0f] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4] hover:shadow-[5px_5px_0_#1f1c0f]"
          download={shareImage.fileName}
          href={svgHref}
        >
          <Download aria-hidden="true" className="h-4 w-4" />
          Export SVG
        </a>
        <p
          className={`neo-copy border-2 border-black px-2 py-2 text-[9px] font-black uppercase tracking-[0.08em] shadow-[2px_2px_0_#1f1c0f] ${
            statusTone === "success"
              ? "bg-[#8cf5e4] text-[#171411]"
              : statusTone === "danger"
                ? "bg-[#c20b2f] text-white"
                : statusTone === "warning"
                  ? "bg-[#f5c84b] text-[#171411]"
                  : "bg-[#efe6d4] text-[#655f58]"
          }`}
        >
          {statusMessage}
        </p>
      </div>
    </section>
  );
}

export function GameActivityDashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [shareStatus, setShareStatus] = useState<ActivityRecapShareStatus>("idle");
  const { sessions, isConfigured, isLoading, error } = useUserPlaySessions();
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const requestedYear = Number(searchParams.get("year"));
  const selectedYear =
    Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= currentYear + 1
      ? requestedYear
      : currentYear;
  const visibleSessions = useMemo(
    () => (isConfigured ? sessions : createLocalRecapSessions(selectedYear)),
    [isConfigured, selectedYear, sessions],
  );
  const yearOptions = useMemo(
    () => availableYears(visibleSessions, selectedYear),
    [selectedYear, visibleSessions],
  );
  const recap = useMemo(
    () => buildGameActivityYearRecap(visibleSessions, { year: selectedYear }),
    [selectedYear, visibleSessions],
  );
  const shareCard = useMemo(() => buildGameActivityRecapShareCard(recap), [recap]);
  const shareImage = useMemo(() => buildGameActivityRecapShareImage(recap), [recap]);

  async function copyShareCard() {
    try {
      await navigator.clipboard.writeText(shareCard.text);
      setShareStatus("copied");
    } catch {
      setShareStatus("copy-failed");
    }
  }

  async function openBrowserShare() {
    const filePayload =
      typeof File === "function"
        ? {
            files: [
              new File([shareImage.svg], shareImage.fileName, {
                type: shareImage.mimeType,
              }),
            ],
            text: shareCard.text,
            title: shareCard.title,
          }
        : null;
    const payload = { text: shareCard.text, title: shareCard.title };
    const shareNavigator = navigator as ActivityRecapNavigator;

    if (typeof shareNavigator.share !== "function") {
      setShareStatus("share-unavailable");
      return;
    }

    try {
      if (
        filePayload &&
        typeof shareNavigator.canShare === "function" &&
        shareNavigator.canShare(filePayload)
      ) {
        await shareNavigator.share(filePayload);
        setShareStatus("file-share-opened");
        return;
      }

      if (typeof shareNavigator.canShare === "function" && !shareNavigator.canShare(payload)) {
        setShareStatus("share-unavailable");
        return;
      }

      await shareNavigator.share(payload);
      setShareStatus("share-opened");
    } catch {
      setShareStatus("share-failed");
    }
  }

  return (
    <section aria-label="Game Activity Dashboard" className="space-y-6">
      <div className="border-[5px] border-black bg-[#f5eedf] shadow-[7px_7px_0_#171411]">
        <div className="grid gap-5 border-b-[5px] border-black p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <p className="neo-copy text-[11px] font-black uppercase tracking-[0.14em] text-[#c20b2f]">
              Game Activity Dashboard
            </p>
            <h1 className="neo-title mt-2 text-5xl leading-none text-[#171411] sm:text-6xl">
              {selectedYear} Gaming Year
            </h1>
            <p className="neo-copy mt-3 max-w-3xl text-[11px] font-bold uppercase leading-relaxed text-[#655f58]">
              Session tape, top games, peak month, and daily rhythm built from launcher playtime
              rows.
            </p>
          </div>
          <div className="border-[3px] border-black bg-[#171411] p-4 text-[#fff9ed] shadow-[4px_4px_0_#c20b2f]">
            <p className="neo-copy text-[10px] font-black uppercase tracking-[0.14em] text-[#8cf5e4]">
              Recap Deck
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <span className="neo-copy border-2 border-[#fff9ed] px-2 py-2 text-[10px] font-black uppercase">
                Games {recap.uniqueGameCount}
              </span>
              <span className="neo-copy border-2 border-[#fff9ed] px-2 py-2 text-[10px] font-black uppercase">
                Sessions {recap.totalSessions}
              </span>
              <span className="neo-copy border-2 border-[#fff9ed] px-2 py-2 text-[10px] font-black uppercase">
                Days {recap.activeDayCount}
              </span>
              <span className="neo-copy border-2 border-[#fff9ed] px-2 py-2 text-[10px] font-black uppercase">
                Streak {recap.longestActiveDayStreak}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div aria-label="Activity year" className="flex flex-wrap gap-2" role="group">
            {yearOptions.map((year) => {
              const isActive = year === selectedYear;
              return (
                <button
                  aria-pressed={isActive}
                  className={`neo-copy h-10 border-2 border-black px-4 text-[11px] font-black uppercase shadow-[2px_2px_0_#1f1c0f] ${
                    isActive
                      ? "bg-[#087d6d] text-white"
                      : "bg-[#fff9ed] text-[#171411] hover:bg-[#f6edd8]"
                  }`}
                  key={year}
                  type="button"
                  onClick={() => setSearchParams({ year: String(year) })}
                >
                  {year}
                </button>
              );
            })}
          </div>
          {!isConfigured ? (
            <div className="flex items-center gap-2 border-2 border-black bg-[#fff9ed] px-3 py-2 shadow-[2px_2px_0_#1f1c0f]">
              <CloudOff aria-hidden="true" className="h-4 w-4 text-[#c20b2f]" />
              <span className="neo-copy text-[10px] font-black uppercase text-[#171411]">
                Local Activity Relay
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <div className="border-[3px] border-black bg-[#fff9ed] p-6 shadow-[4px_4px_0_#1f1c0f]">
          <p className="neo-copy text-[11px] font-black uppercase text-[#655f58]">
            Loading yearly activity tape...
          </p>
        </div>
      ) : error ? (
        <div className="border-[3px] border-black bg-[#fbd6dc] p-5 shadow-[4px_4px_0_#1f1c0f]">
          <p className="neo-copy text-[11px] font-black uppercase text-[#7a0918]">{error}</p>
        </div>
      ) : recap.totalSessions === 0 ? (
        <div className="border-[3px] border-black bg-[#fff9ed] p-6 shadow-[4px_4px_0_#1f1c0f]">
          <p className="text-lg font-black uppercase text-[#171411]">No yearly sessions yet</p>
          <p className="neo-copy mt-2 text-[11px] font-bold uppercase leading-relaxed text-[#655f58]">
            Launch a game or sync playtime sessions to fill this activity dashboard.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatPanel
              icon={<Hourglass aria-hidden="true" className="h-5 w-5" />}
              label="Total Playtime"
              value={`${formatNumber(recap.totalHours)}h`}
            />
            <StatPanel
              icon={<Gamepad2 aria-hidden="true" className="h-5 w-5" />}
              label="Unique Games"
              value={String(recap.uniqueGameCount)}
            />
            <StatPanel
              icon={<CalendarDays aria-hidden="true" className="h-5 w-5" />}
              label="Active Days"
              value={String(recap.activeDayCount)}
            />
            <StatPanel
              icon={<Clock3 aria-hidden="true" className="h-5 w-5" />}
              label="Longest Session"
              value={formatPlayTimeMinutes(recap.longestSession?.minutes ?? 0)}
            />
          </div>

          <RecapShareCardPanel
            onCopy={() => void copyShareCard()}
            onShare={() => void openBrowserShare()}
            shareCard={shareCard}
            shareImage={shareImage}
            status={shareStatus}
          />

          <div>
            <div className="mb-3 flex items-center gap-2">
              <Zap aria-hidden="true" className="h-5 w-5 text-[#087d6d]" />
              <h2 className="neo-copy text-[12px] font-black uppercase text-[#171411]">
                Month Tape
              </h2>
            </div>
            <MonthlyTape buckets={recap.monthlyMinutes} />
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Trophy aria-hidden="true" className="h-5 w-5 text-[#c20b2f]" />
                <h2 className="neo-copy text-[12px] font-black uppercase text-[#171411]">
                  Top Games
                </h2>
              </div>
              <TopGamesPanel games={recap.topGames} totalMinutes={recap.totalMinutes} />
            </div>
            <div className="space-y-5">
              <RecapSummaryPanel recap={recap} />
              <PatternStrip buckets={recap.timeOfDayMinutes} title="Time-of-Day Pattern" />
              <PatternStrip buckets={recap.weekdayMinutes} title="Weekday Pattern" />
            </div>
          </div>
        </>
      )}
    </section>
  );
}
