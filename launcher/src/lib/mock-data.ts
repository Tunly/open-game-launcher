import type { DownloadItem, Game, StoreGame } from "./types";

export const libraryGames: Game[] = [
  {
    id: "starfall-outpost",
    title: "Neo-Tokyo Drift",
    description:
      "Last played: today. New content pack...",
    version: "1.8.2",
    status: "installed",
    platform: "windows",
    installPath: "C:/Games/OpenGameLauncher/Starfall Outpost",
    lastPlayed: "Today",
    playtimeMinutes: 3480,
  },
  {
    id: "iron-vale",
    title: "Steel Battalion X",
    description:
      "52 hours played",
    version: "0.9.4",
    status: "update_available",
    platform: "windows",
    installPath: "C:/Games/OpenGameLauncher/Iron Vale",
    lastPlayed: "May 17, 2026",
    playtimeMinutes: 920,
  },
  {
    id: "neon-rally",
    title: "Netrunner: Phantom",
    description:
      "Never played",
    version: "2.1.0",
    status: "update_available",
    platform: "linux",
    playtimeMinutes: 0,
  },
  {
    id: "embers-and-engines",
    title: "Akira's Revenge",
    description:
      "Downloading",
    version: "1.2.7",
    status: "installed",
    platform: "linux",
    installPath: "~/.local/share/open-game-launcher/games/embers-and-engines",
    lastPlayed: "May 12, 2026",
    playtimeMinutes: 2145,
  },
];

export const storeGames: StoreGame[] = [
  {
    id: "deep-signal",
    title: "Wasteland Drifter",
    description: "Racing / Arcade",
    price: 19.99,
    platform: ["windows", "linux"],
    tagLine: "Racing / Arcade",
  },
  {
    id: "redline-tactics",
    title: "System Crash",
    description: "Puzzle / Hacking",
    price: 9.99,
    isFree: false,
    platform: ["windows"],
    tagLine: "Puzzle / Hacking",
  },
  {
    id: "haven-forge",
    title: "Blood Tide",
    description: "Action / RPG",
    price: 29.99,
    platform: ["windows", "linux", "macos"],
    tagLine: "Action / RPG",
  },
];

export const downloads: DownloadItem[] = [
  {
    id: "download-iron-vale",
    gameId: "iron-vale",
    title: "Steel Battalion X // Update 0.9.5",
    progress: 68,
    speed: "18.4 MB/s",
    status: "downloading",
  },
  {
    id: "download-neon-rally",
    gameId: "neon-rally",
    title: "Netrunner: Phantom // Base Data",
    progress: 31,
    speed: "Paused",
    status: "paused",
  },
  {
    id: "download-starfall-dlc",
    gameId: "starfall-outpost",
    title: "Neo-Tokyo Drift // Neon District Pack",
    progress: 100,
    speed: "Complete",
    status: "completed",
  },
];
