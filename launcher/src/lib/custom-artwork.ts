import type { Game } from "./types";
import {
  buildProviderArtworkPolicyEvidence,
  type ProviderArtworkPolicyEvidence,
} from "./provider-artwork-policy";

export type CustomArtworkKind = "cover" | "icon" | "logo";

export interface GameCustomArtwork {
  coverUrl?: string;
  iconUrl?: string;
  logoUrl?: string;
  updatedAt?: number;
}

export type CustomArtworkMap = Record<string, GameCustomArtwork>;

export interface CustomArtworkCandidate {
  kind: CustomArtworkKind;
  providerPolicy?: ProviderArtworkPolicyEvidence;
  sourceLabel: string;
  url: string;
}

export interface CommunityArtworkCandidate extends CustomArtworkCandidate {
  id: string;
  title: string;
  artist: string;
  description: string;
  votes: number;
  downloads: number;
  tags: string[];
  createdAt?: string;
  hosted?: boolean;
  moderationStatus?: "approved" | "pending" | "rejected";
  reportCount?: number;
  updatedAt?: string;
  userVote?: -1 | 0 | 1;
}

const LOCAL_COMMUNITY_ARTWORK_CANDIDATES: CommunityArtworkCandidate[] = [
  {
    artist: "Manga Relay",
    description: "Halftone cover panel for local import previews.",
    downloads: 1280,
    id: "panel-break-cover",
    kind: "cover",
    sourceLabel: "Panel Break Cover",
    tags: ["cover", "halftone"],
    title: "Panel Break Cover",
    url: "/artwork/community-panel-cover.svg",
    votes: 214,
  },
  {
    artist: "Pad Club",
    description: "Square stamp icon for launcher rows.",
    downloads: 940,
    id: "relay-stamp-icon",
    kind: "icon",
    sourceLabel: "Relay Stamp Icon",
    tags: ["icon", "stamp"],
    title: "Relay Stamp Icon",
    url: "/artwork/community-panel-icon.svg",
    votes: 176,
  },
  {
    artist: "Inkline Crew",
    description: "Wide logo tape for the game hero.",
    downloads: 802,
    id: "inkline-logo-tape",
    kind: "logo",
    sourceLabel: "Inkline Logo Tape",
    tags: ["logo", "tape"],
    title: "Inkline Logo Tape",
    url: "/artwork/community-panel-logo.svg",
    votes: 149,
  },
];

function uniqueStrings(values: Array<string | undefined>): string[] {
  return values.filter(
    (value, index, allValues): value is string =>
      Boolean(value) && allValues.indexOf(value) === index,
  );
}

export function applyCustomArtwork(game: Game, artwork?: GameCustomArtwork): Game {
  if (!artwork?.coverUrl && !artwork?.iconUrl && !artwork?.logoUrl) {
    return game;
  }

  return {
    ...game,
    coverUrl: artwork.coverUrl ?? game.coverUrl,
    iconUrl: artwork.iconUrl ?? game.iconUrl,
    iconUrls: uniqueStrings([artwork.iconUrl, game.iconUrl, ...(game.iconUrls ?? [])]),
    logoUrl: artwork.logoUrl ?? game.logoUrl,
    logoUrls: uniqueStrings([artwork.logoUrl, game.logoUrl, ...(game.logoUrls ?? [])]),
  };
}

export function hasCustomArtwork(artwork?: GameCustomArtwork | null): boolean {
  return Boolean(artwork?.coverUrl || artwork?.iconUrl || artwork?.logoUrl);
}

export function customArtworkHasKind(
  artwork: GameCustomArtwork | null | undefined,
  kind: CustomArtworkKind,
): boolean {
  return Boolean(artwork?.[`${kind}Url`]);
}

export function getAutoArtworkCandidates(game: Game): CustomArtworkCandidate[] {
  const steamAppId = getSteamAppId(game);
  const candidates: CustomArtworkCandidate[] = [];

  pushArtworkCandidate(candidates, "cover", game.coverUrl, "Current Cover");
  pushArtworkCandidate(candidates, "cover", firstGameScreenshotUrl(game), "Screenshot");
  if (steamAppId) {
    pushArtworkCandidate(
      candidates,
      "cover",
      `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/header.jpg`,
      "Steam Header",
      buildProviderArtworkPolicyEvidence({
        provider: "steam",
        sourceId: steamAppId,
        url: `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/header.jpg`,
      }),
    );
    pushArtworkCandidate(
      candidates,
      "cover",
      `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_600x900.jpg`,
      "Steam Capsule",
      buildProviderArtworkPolicyEvidence({
        provider: "steam",
        sourceId: steamAppId,
        url: `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_600x900.jpg`,
      }),
    );
  }

  for (const url of [game.iconUrl, ...(game.iconUrls ?? [])]) {
    pushArtworkCandidate(candidates, "icon", url, "Launcher Icon");
  }
  if (steamAppId) {
    pushArtworkCandidate(
      candidates,
      "icon",
      `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/capsule_184x69.jpg`,
      "Steam Icon",
      buildProviderArtworkPolicyEvidence({
        provider: "steam",
        sourceId: steamAppId,
        url: `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/capsule_184x69.jpg`,
      }),
    );
  }

  for (const url of [game.logoUrl, ...(game.logoUrls ?? [])]) {
    pushArtworkCandidate(candidates, "logo", url, "Launcher Logo");
  }
  if (steamAppId) {
    pushArtworkCandidate(
      candidates,
      "logo",
      `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/logo.png`,
      "Steam Logo",
      buildProviderArtworkPolicyEvidence({
        provider: "steam",
        sourceId: steamAppId,
        url: `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/logo.png`,
      }),
    );
  }

  return dedupeArtworkCandidates(candidates);
}

export function getLocalCommunityArtworkCandidates(): CommunityArtworkCandidate[] {
  const seen = new Set<string>();
  return LOCAL_COMMUNITY_ARTWORK_CANDIDATES.filter((candidate) => {
    if (!isRemoteImageUrl(candidate.url)) return false;
    const key = `${candidate.kind}:${candidate.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((candidate) => ({ ...candidate, tags: [...candidate.tags] }));
}

export function isCommunityArtworkImported(
  artwork: GameCustomArtwork | null | undefined,
  candidate: CommunityArtworkCandidate,
): boolean {
  return artwork?.[`${candidate.kind}Url`] === candidate.url;
}

function pushArtworkCandidate(
  candidates: CustomArtworkCandidate[],
  kind: CustomArtworkKind,
  value: string | null | undefined,
  sourceLabel: string,
  providerPolicy?: ProviderArtworkPolicyEvidence,
) {
  const url = value?.trim();
  if (!url || !isRemoteImageUrl(url)) return;
  candidates.push({ kind, providerPolicy, sourceLabel, url });
}

function dedupeArtworkCandidates(candidates: CustomArtworkCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.kind}:${candidate.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function firstGameScreenshotUrl(game: Game): string | undefined {
  for (const entry of game.screenshots ?? []) {
    if (typeof entry === "string") return entry;
    const url = entry.imageUrl ?? entry.url ?? entry.thumbnailUrl ?? undefined;
    if (url) return url;
  }
  return game.screenshotUrls?.[0];
}

function getSteamAppId(game: Game): string | null {
  if (game.launcher !== "steam" && !game.id.startsWith("steam-")) {
    return null;
  }
  const rawId = game.externalId ?? game.id.replace(/^steam-/, "");
  return /^\d{1,10}$/.test(rawId) ? rawId : null;
}

function isRemoteImageUrl(url: string): boolean {
  return /^https:\/\//i.test(url) || /^data:image\//i.test(url) || url.startsWith("/");
}
