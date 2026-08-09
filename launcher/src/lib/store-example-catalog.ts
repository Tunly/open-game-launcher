import type { StoreGame } from "./types";

/**
 * Local example store catalog.
 *
 * These entries are shown by the store page only when the hosted Supabase
 * catalog is empty or unreachable. They are explicit local fixtures: ids are
 * prefixed with `example-` (never real uuids) and are labeled as a local
 * catalog. Buy opens a platform search link; these fixtures are not hosted
 * products and must never be treated as owned licenses.
 */
export const EXAMPLE_STORE_CATALOG: StoreGame[] = [
  {
    id: "example-void-harvest",
    slug: "example-void-harvest",
    title: "Void Harvest",
    description:
      "A roguelike salvage run through abandoned orbital wrecks. Scavenge tech, outrun the void, and drag your haul back to the ring station before the drift claims it.",
    tagLine: "Roguelike / Action",
    price: 14.99,
    originalPrice: 19.99,
    discountPercent: 25,
    isFree: false,
    platform: ["windows", "linux"],
    publisher: "Greybox Assembly",
    rating: 4.7,
    ratingsCount: 234,
    downloadsCount: 8412,
    releaseDate: "2026-02-10",
    genres: ["Roguelike", "Action"],
  },
  {
    id: "example-petal-and-ash",
    slug: "example-petal-and-ash",
    title: "Petal & Ash",
    description:
      "A cozy puzzle adventure about regrowing a burnt garden. Replant memory flowers, untangle forgotten riddles, and coax color back into the valley.",
    tagLine: "Puzzle / Adventure",
    price: 9.99,
    isFree: false,
    platform: ["windows", "macos"],
    publisher: "Northgate Interactive",
    rating: 4.9,
    ratingsCount: 312,
    downloadsCount: 2105,
    releaseDate: "2026-05-18",
    genres: ["Puzzle", "Adventure"],
  },
  {
    id: "example-dungeon-post",
    slug: "example-dungeon-post",
    title: "Dungeon Post",
    description:
      "A free arcade delivery roguelite. Haul scrolls, potions, and questionable cheese through monster-infested corridors on a strict deadline.",
    tagLine: "Arcade / Simulation",
    price: 0,
    isFree: true,
    temporaryFreeUntil: "2026-08-31T23:59:59.000Z",
    platform: ["windows", "linux", "macos"],
    publisher: "Open Forge Studio",
    rating: 4.2,
    ratingsCount: 1011,
    downloadsCount: 15900,
    releaseDate: "2026-07-01",
    genres: ["Arcade", "Simulation"],
  },
  {
    id: "example-crimson-circuit",
    slug: "example-crimson-circuit",
    title: "Crimson Circuit",
    description:
      "Competitive mech duels in a collapsing arena league. Build a loadout, read the enemy chassis, and land the deciding strike in ranked circuit battles.",
    tagLine: "Action / Multiplayer",
    price: 22.49,
    originalPrice: 24.99,
    discountPercent: 10,
    isFree: false,
    platform: ["windows"],
    publisher: "Open Forge Studio",
    rating: 4.4,
    ratingsCount: 76,
    downloadsCount: 987,
    releaseDate: "2026-08-05",
    genres: ["Action", "Multiplayer"],
  },
];

export function isExampleStoreGame(gameId: string) {
  return gameId.startsWith("example-");
}
