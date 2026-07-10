import type { Game } from "./types";

type CoordinatedAchievementSync<T> = {
  gameKey: string;
  provider: string;
  sync: () => Promise<T>;
};

const inFlightGameSyncs = new Map<string, Promise<unknown>>();
const providerSyncQueues = new Map<string, Promise<void>>();

function normalizeProvider(value: string) {
  return value.trim().toLowerCase();
}

function encodeKeyTuple(parts: string[]) {
  return parts.map((part) => `${part.length}:${part}`).join("|");
}

export function achievementProviderSyncGameKey(game: Game, provider: string) {
  return encodeKeyTuple([normalizeProvider(provider), game.id, game.externalId ?? ""]);
}

export function coordinateAchievementProviderSync<T>({
  gameKey,
  provider,
  sync,
}: CoordinatedAchievementSync<T>): Promise<T> {
  const providerKey = normalizeProvider(provider);
  const requestKey = encodeKeyTuple([providerKey, gameKey]);
  const existing = inFlightGameSyncs.get(requestKey);
  if (existing) {
    return existing as Promise<T>;
  }

  const previous = providerSyncQueues.get(providerKey) ?? Promise.resolve();
  const result = previous.then(sync);
  inFlightGameSyncs.set(requestKey, result);

  const queueTail = result.then(
    () => undefined,
    () => undefined,
  );
  providerSyncQueues.set(providerKey, queueTail);

  const clearInFlight = () => {
    if (inFlightGameSyncs.get(requestKey) === result) {
      inFlightGameSyncs.delete(requestKey);
    }
  };
  void result.then(clearInFlight, clearInFlight);
  void queueTail.then(() => {
    if (providerSyncQueues.get(providerKey) === queueTail) {
      providerSyncQueues.delete(providerKey);
    }
  });

  return result;
}
