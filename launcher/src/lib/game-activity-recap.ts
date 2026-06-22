import type { UserPlaySession } from "./supabase/playtime";

export interface GameActivityRecapGameMetadata {
  coverUrl?: string | null;
  gameId: string;
  title: string;
}

export interface GameActivityRecapOptions {
  games?: GameActivityRecapGameMetadata[];
  now?: Date;
  topGameLimit?: number;
  year?: number;
}

export interface GameActivityRecapBucket {
  key: string;
  label: string;
  minutes: number;
}

export interface GameActivityRecapTopGame {
  coverUrl: string | null;
  gameId: string;
  minutes: number;
  percent: number;
  sessions: number;
  title: string;
}

export interface GameActivityRecapLongestSession {
  gameId: string;
  id: string;
  minutes: number;
  startedAt: string;
  title: string;
}

export interface GameActivityRecap {
  activeDayCount: number;
  bestMonth: GameActivityRecapBucket | null;
  favoriteTimeOfDay: GameActivityRecapBucket | null;
  favoriteWeekday: GameActivityRecapBucket | null;
  longestActiveDayStreak: number;
  longestSession: GameActivityRecapLongestSession | null;
  monthlyMinutes: GameActivityRecapBucket[];
  timeOfDayMinutes: GameActivityRecapBucket[];
  topGame: GameActivityRecapTopGame | null;
  topGames: GameActivityRecapTopGame[];
  totalHours: number;
  totalMinutes: number;
  totalSessions: number;
  uniqueGameCount: number;
  weekdayMinutes: GameActivityRecapBucket[];
  year: number;
}

export interface GameActivityRecapShareCard {
  fileName: string;
  text: string;
  title: string;
}

export interface GameActivityRecapShareImage {
  dataUri: string;
  fileName: string;
  mimeType: "image/svg+xml";
  svg: string;
}

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

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const TIME_OF_DAY_BUCKETS = [
  { key: "late", label: "Late Night", start: 0, end: 6 },
  { key: "morning", label: "Morning", start: 6, end: 12 },
  { key: "afternoon", label: "Afternoon", start: 12, end: 18 },
  { key: "prime", label: "Prime Time", start: 18, end: 24 },
];

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function dayOrdinal(dayKey: string): number {
  const [year, month, day] = dayKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function weekdayIndex(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatShareMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0m";
  const totalMinutes = Math.round(minutes);
  const hours = Math.floor(totalMinutes / 60);
  const remainder = totalMinutes % 60;
  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function svgText(
  text: string,
  x: number,
  y: number,
  options: {
    color?: string;
    fontSize?: number;
    fontWeight?: number;
    letterSpacing?: number;
  } = {},
) {
  const color = options.color ?? "#171411";
  const fontSize = options.fontSize ?? 28;
  const fontWeight = options.fontWeight ?? 800;
  const letterSpacing = options.letterSpacing ?? 0;

  return `<text x="${x}" y="${y}" fill="${color}" font-family="Impact, Arial Black, sans-serif" font-size="${fontSize}" font-weight="${fontWeight}" letter-spacing="${letterSpacing}">${escapeSvgText(
    text,
  )}</text>`;
}

function emptyMonthBuckets(): GameActivityRecapBucket[] {
  return MONTH_LABELS.map((label, index) => ({
    key: `month-${index + 1}`,
    label,
    minutes: 0,
  }));
}

function emptyWeekdayBuckets(): GameActivityRecapBucket[] {
  return WEEKDAY_LABELS.map((label, index) => ({
    key: `weekday-${index}`,
    label,
    minutes: 0,
  }));
}

function emptyTimeOfDayBuckets(): GameActivityRecapBucket[] {
  return TIME_OF_DAY_BUCKETS.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    minutes: 0,
  }));
}

function maxBucket(buckets: GameActivityRecapBucket[]): GameActivityRecapBucket | null {
  const winner = buckets.reduce<GameActivityRecapBucket | null>((best, bucket) => {
    if (bucket.minutes <= 0) return best;
    if (!best || bucket.minutes > best.minutes) return bucket;
    return best;
  }, null);
  return winner ? { ...winner } : null;
}

function timeOfDayIndex(date: Date): number {
  const hour = date.getHours();
  const index = TIME_OF_DAY_BUCKETS.findIndex(
    (bucket) => hour >= bucket.start && hour < bucket.end,
  );
  return index >= 0 ? index : 0;
}

export function getPlaySessionMinutes(session: UserPlaySession): number {
  if (typeof session.durationMinutes === "number" && Number.isFinite(session.durationMinutes)) {
    return Math.max(0, Math.round(session.durationMinutes));
  }

  const startedAt = new Date(session.startedAt).getTime();
  const endedAt = session.endedAt ? new Date(session.endedAt).getTime() : Number.NaN;
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt <= startedAt) {
    return 0;
  }

  return Math.max(0, Math.round((endedAt - startedAt) / 60_000));
}

export function buildGameActivityYearRecap(
  sessions: UserPlaySession[],
  options: GameActivityRecapOptions = {},
): GameActivityRecap {
  const now = options.now ?? new Date();
  const year = options.year ?? now.getFullYear();
  const topGameLimit = Math.max(1, Math.floor(options.topGameLimit ?? 5));
  const metadata = new Map((options.games ?? []).map((game) => [game.gameId, game]));
  const monthlyMinutes = emptyMonthBuckets();
  const weekdayMinutes = emptyWeekdayBuckets();
  const timeOfDayMinutes = emptyTimeOfDayBuckets();
  const activeDayKeys = new Set<string>();
  const gameTotals = new Map<string, GameActivityRecapTopGame>();
  let longestSession: GameActivityRecapLongestSession | null = null;
  let totalMinutes = 0;
  let totalSessions = 0;

  for (const session of sessions) {
    const startedAt = new Date(session.startedAt);
    if (Number.isNaN(startedAt.getTime()) || startedAt.getFullYear() !== year) {
      continue;
    }

    const minutes = getPlaySessionMinutes(session);
    if (minutes <= 0) {
      continue;
    }

    const gameId = session.gameId || session.catalogGameId;
    if (!gameId) {
      continue;
    }

    const knownGame = metadata.get(gameId);
    const title = session.gameTitle ?? knownGame?.title ?? gameId;
    const coverUrl = session.gameCoverUrl ?? knownGame?.coverUrl ?? null;

    totalMinutes += minutes;
    totalSessions += 1;
    activeDayKeys.add(localDayKey(startedAt));
    monthlyMinutes[startedAt.getMonth()].minutes += minutes;
    weekdayMinutes[weekdayIndex(startedAt)].minutes += minutes;
    timeOfDayMinutes[timeOfDayIndex(startedAt)].minutes += minutes;

    const existing = gameTotals.get(gameId);
    if (existing) {
      existing.minutes += minutes;
      existing.sessions += 1;
    } else {
      gameTotals.set(gameId, {
        coverUrl,
        gameId,
        minutes,
        percent: 0,
        sessions: 1,
        title,
      });
    }

    if (!longestSession || minutes > longestSession.minutes) {
      longestSession = {
        gameId,
        id: session.id,
        minutes,
        startedAt: session.startedAt,
        title,
      };
    }
  }

  const topGames = Array.from(gameTotals.values())
    .sort((a, b) => b.minutes - a.minutes || a.title.localeCompare(b.title))
    .slice(0, topGameLimit)
    .map((game) => ({
      ...game,
      percent: totalMinutes > 0 ? roundOneDecimal((game.minutes / totalMinutes) * 100) : 0,
    }));

  const sortedDayOrdinals = Array.from(activeDayKeys)
    .map(dayOrdinal)
    .sort((a, b) => a - b);
  let longestActiveDayStreak = 0;
  let currentStreak = 0;
  let previousOrdinal: number | null = null;
  for (const ordinal of sortedDayOrdinals) {
    currentStreak =
      previousOrdinal !== null && ordinal === previousOrdinal + 1 ? currentStreak + 1 : 1;
    longestActiveDayStreak = Math.max(longestActiveDayStreak, currentStreak);
    previousOrdinal = ordinal;
  }

  return {
    activeDayCount: activeDayKeys.size,
    bestMonth: maxBucket(monthlyMinutes),
    favoriteTimeOfDay: maxBucket(timeOfDayMinutes),
    favoriteWeekday: maxBucket(weekdayMinutes),
    longestActiveDayStreak,
    longestSession,
    monthlyMinutes,
    timeOfDayMinutes,
    topGame: topGames[0] ?? null,
    topGames,
    totalHours: roundOneDecimal(totalMinutes / 60),
    totalMinutes,
    totalSessions,
    uniqueGameCount: gameTotals.size,
    weekdayMinutes,
    year,
  };
}

export function buildGameActivityRecapShareCard(
  recap: GameActivityRecap,
): GameActivityRecapShareCard {
  const topGame = recap.topGame
    ? `${recap.topGame.title} (${formatShareMinutes(recap.topGame.minutes)})`
    : "No top game yet";
  const primeWindow = [
    recap.favoriteTimeOfDay?.label,
    recap.favoriteWeekday?.label,
    recap.bestMonth?.label,
  ]
    .filter(Boolean)
    .join(" / ");
  const longestRun = recap.longestSession
    ? `${recap.longestSession.title} (${formatShareMinutes(recap.longestSession.minutes)})`
    : "No session yet";
  const lines = [
    `OG-Launcher Gaming Year ${recap.year}`,
    `${formatShareMinutes(recap.totalMinutes)} played across ${recap.totalSessions} sessions`,
    `${recap.uniqueGameCount} games / ${recap.activeDayCount} active days / ${recap.longestActiveDayStreak} day streak`,
    `Top game: ${topGame}`,
    `Prime window: ${primeWindow || "No pattern yet"}`,
    `Longest run: ${longestRun}`,
  ];

  return {
    fileName: `og-launcher-activity-recap-${recap.year}.txt`,
    text: lines.join("\n"),
    title: `OG-Launcher Gaming Year ${recap.year}`,
  };
}

export function buildGameActivityRecapShareImage(
  recap: GameActivityRecap,
): GameActivityRecapShareImage {
  const width = 1200;
  const height = 630;
  const topGame = recap.topGame?.title ?? "No top game yet";
  const topGameMinutes = recap.topGame ? formatShareMinutes(recap.topGame.minutes) : "0m";
  const primeWindow =
    [recap.favoriteTimeOfDay?.label, recap.favoriteWeekday?.label, recap.bestMonth?.label]
      .filter(Boolean)
      .join(" / ") || "No pattern yet";
  const longestRun = recap.longestSession
    ? `${recap.longestSession.title} / ${formatShareMinutes(recap.longestSession.minutes)}`
    : "No session yet";
  const rows = recap.topGames.slice(0, 3).map((game, index) => {
    const y = 390 + index * 50;
    const barWidth = Math.max(18, Math.round((game.percent / 100) * 340));
    return [
      `<rect x="760" y="${y - 27}" width="360" height="28" fill="#f5eedf" stroke="#171411" stroke-width="4"/>`,
      `<rect x="760" y="${y - 27}" width="${barWidth}" height="28" fill="${
        index === 0 ? "#087d6d" : "#8cf5e4"
      }"/>`,
      svgText(`${index + 1}. ${game.title}`, 780, y - 6, { fontSize: 20 }),
      svgText(formatShareMinutes(game.minutes), 1018, y - 6, { fontSize: 18 }),
    ].join("");
  });
  const halftoneDots = Array.from({ length: 11 }, (_, index) => {
    const radius = 3 + index * 0.8;
    return `<circle cx="${970 + index * 18}" cy="${88 + index * 10}" r="${radius.toFixed(
      1,
    )}" fill="#171411" opacity="0.22"/>`;
  }).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeSvgText(
    `OG-Launcher Gaming Year ${recap.year}`,
  )}">
  <rect width="1200" height="630" fill="#efe6d4"/>
  <path d="M0 0h1200v630H0z" fill="url(#paper)"/>
  <defs>
    <pattern id="paper" width="18" height="18" patternUnits="userSpaceOnUse">
      <rect width="18" height="18" fill="#f5eedf"/>
      <circle cx="3" cy="4" r="1.4" fill="#171411" opacity="0.06"/>
      <circle cx="13" cy="14" r="1.1" fill="#b7102a" opacity="0.05"/>
    </pattern>
  </defs>
  <rect x="36" y="34" width="1128" height="562" fill="none" stroke="#171411" stroke-width="10"/>
  <rect x="58" y="58" width="1084" height="518" fill="#fff9ed" stroke="#171411" stroke-width="4"/>
  <rect x="72" y="76" width="206" height="42" fill="#171411" stroke="#171411" stroke-width="4"/>
  ${svgText("OG-LAUNCHER", 90, 105, { color: "#8cf5e4", fontSize: 26 })}
  <rect x="72" y="138" width="620" height="180" fill="#f5eedf" stroke="#171411" stroke-width="6"/>
  ${svgText(`${recap.year} GAMING YEAR`, 104, 205, { color: "#171411", fontSize: 64 })}
  ${svgText(`${formatShareMinutes(recap.totalMinutes)} PLAYED`, 108, 262, {
    color: "#b7102a",
    fontSize: 40,
  })}
  ${svgText(`${recap.totalSessions} SESSIONS / ${recap.uniqueGameCount} GAMES`, 110, 298, {
    color: "#5b403f",
    fontSize: 22,
  })}
  <rect x="86" y="350" width="188" height="118" fill="#8cf5e4" stroke="#171411" stroke-width="6"/>
  ${svgText(`${recap.activeDayCount}`, 126, 414, { fontSize: 58 })}
  ${svgText("ACTIVE DAYS", 112, 450, { fontSize: 22 })}
  <rect x="306" y="350" width="188" height="118" fill="#fff9ed" stroke="#171411" stroke-width="6"/>
  ${svgText(`${recap.longestActiveDayStreak}`, 350, 414, { fontSize: 58 })}
  ${svgText("DAY STREAK", 332, 450, { fontSize: 22 })}
  <rect x="526" y="350" width="188" height="118" fill="#b7102a" stroke="#171411" stroke-width="6"/>
  ${svgText(topGameMinutes, 552, 414, { color: "#fff9ed", fontSize: 46 })}
  ${svgText("TOP GAME", 560, 450, { color: "#fff9ed", fontSize: 22 })}
  <rect x="742" y="136" width="386" height="190" fill="#171411" stroke="#171411" stroke-width="6"/>
  ${svgText("TOP GAME", 770, 184, { color: "#8cf5e4", fontSize: 28 })}
  ${svgText(topGame.slice(0, 24), 770, 238, { color: "#fff9ed", fontSize: 44 })}
  ${svgText(primeWindow.slice(0, 38), 770, 288, { color: "#f5eedf", fontSize: 22 })}
  <rect x="742" y="350" width="386" height="170" fill="#fff9ed" stroke="#171411" stroke-width="6"/>
  ${svgText("TOP TAPE", 764, 382, { color: "#087d6d", fontSize: 24 })}
  ${rows.join("")}
  <rect x="72" y="500" width="642" height="52" fill="#171411" stroke="#171411" stroke-width="4"/>
  ${svgText(`LONGEST RUN: ${longestRun}`.slice(0, 48), 96, 535, {
    color: "#fff9ed",
    fontSize: 22,
  })}
  ${halftoneDots}
</svg>`;

  return {
    dataUri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    fileName: `og-launcher-activity-recap-${recap.year}.svg`,
    mimeType: "image/svg+xml",
    svg,
  };
}
