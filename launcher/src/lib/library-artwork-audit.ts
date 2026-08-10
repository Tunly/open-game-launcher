import type { Game } from "./types";

export interface LibraryArtworkAuditGroup {
  launcher: string;
  label: string;
  games: string[];
}

export interface LibraryArtworkAuditReport {
  totalGames: number;
  missingCount: number;
  byLauncher: LibraryArtworkAuditGroup[];
}

const LAUNCHER_LABELS: Record<string, string> = {
  battlenet: "Battle.net",
  ea: "EA",
  epic: "Epic",
  gog: "GOG",
  manual: "Manual",
  ogl: "OG Launcher",
  steam: "Steam",
  ubisoft: "Ubisoft",
  xbox: "Xbox",
};

export function getLibraryArtworkUrls(games: Game[]): string[] {
  return [
    ...new Set(
      games.flatMap((game) => [
        game.coverUrl,
        game.logoUrl,
        game.iconUrl,
        ...(game.logoUrls ?? []),
        ...(game.iconUrls ?? []),
      ]),
    ),
  ].filter((url): url is string => Boolean(url?.trim()));
}

function hasArtwork(game: Game, invalidUrls: ReadonlySet<string>): boolean {
  const urls = [
    game.coverUrl,
    game.logoUrl,
    game.iconUrl,
    ...(game.logoUrls ?? []),
    ...(game.iconUrls ?? []),
  ];
  return urls.some((url): url is string => Boolean(url?.trim()) && !(url && invalidUrls.has(url)));
}

export function auditLibraryArtwork(
  games: Game[],
  invalidUrls: ReadonlySet<string> = new Set(),
): LibraryArtworkAuditReport {
  const groups = new Map<string, string[]>();

  for (const game of games) {
    if (hasArtwork(game, invalidUrls)) continue;
    const launcher = game.launcher ?? "manual";
    const titles = groups.get(launcher) ?? [];
    titles.push(game.title);
    groups.set(launcher, titles);
  }

  return {
    totalGames: games.length,
    missingCount: [...groups.values()].reduce(
      (total, gamesInGroup) => total + gamesInGroup.length,
      0,
    ),
    byLauncher: [...groups].map(([launcher, gamesInGroup]) => ({
      launcher,
      label: LAUNCHER_LABELS[launcher] ?? launcher,
      games: gamesInGroup,
    })),
  };
}
