import type { DownloadItem, Game, StoreGame } from "./types";

export const libraryGames: Game[] = [
  {
    id: "starfall-outpost",
    title: "Starfall Outpost",
    description:
      "A tactical sci-fi survival game about rebuilding a remote orbital colony.",
    version: "1.8.2",
    status: "installed",
    platform: "windows",
    installPath: "C:/Games/OpenGameLauncher/Starfall Outpost",
    lastPlayed: "Yesterday",
    playtimeMinutes: 3480,
  },
  {
    id: "iron-vale",
    title: "Iron Vale",
    description:
      "A dark fantasy action RPG with precise combat and deep crafting systems.",
    version: "0.9.4",
    status: "update_available",
    platform: "windows",
    installPath: "C:/Games/OpenGameLauncher/Iron Vale",
    lastPlayed: "May 17, 2026",
    playtimeMinutes: 920,
  },
  {
    id: "neon-rally",
    title: "Neon Rally",
    description:
      "High-speed arcade racing through rain-soaked city circuits and desert highways.",
    version: "2.1.0",
    status: "not_installed",
    platform: "linux",
    playtimeMinutes: 0,
  },
  {
    id: "embers-and-engines",
    title: "Embers & Engines",
    description:
      "Build modular machines, automate production, and defend your settlement.",
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
    title: "Deep Signal",
    description:
      "Investigate a cold ocean moon in a tense narrative exploration game.",
    price: 24.99,
    platform: ["windows", "linux"],
    tagLine: "New release",
  },
  {
    id: "redline-tactics",
    title: "Redline Tactics",
    description:
      "Squad-based cyberpunk tactics with synchronized turns and destructible cover.",
    price: 0,
    isFree: true,
    platform: ["windows"],
    tagLine: "Free weekend",
  },
  {
    id: "haven-forge",
    title: "Haven Forge",
    description:
      "A relaxed co-op crafting game about running a workshop at the edge of the wilds.",
    price: 14.99,
    platform: ["windows", "linux", "macos"],
    tagLine: "Coming soon",
  },
];

export const downloads: DownloadItem[] = [
  {
    id: "download-iron-vale",
    gameId: "iron-vale",
    title: "Iron Vale Update 0.9.5",
    progress: 68,
    speed: "18.4 MB/s",
    status: "downloading",
  },
  {
    id: "download-neon-rally",
    gameId: "neon-rally",
    title: "Neon Rally Base Game",
    progress: 31,
    speed: "Paused",
    status: "paused",
  },
  {
    id: "download-starfall-dlc",
    gameId: "starfall-outpost",
    title: "Starfall Outpost: Frontier Pack",
    progress: 100,
    speed: "Complete",
    status: "completed",
  },
];
