/**
 * Provider-name normalization lives here so every consumer derives the same
 * key and label from the same source string. Previously three modules each
 * implemented their own variant, and one of them stripped non-alphanumerics
 * while the others did not — so the same provider could compare equal in one
 * place and unequal in another.
 */

/**
 * Normalize a provider name for stable comparison and map keys.
 * Strips everything except letters and digits so "battle.net", "battle net"
 * and "Battlenet" all resolve to the same key.
 */
export function normalizeProviderKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Normalize a provider name for display-facing comparisons (case + trim only,
 * preserving separators like "battle.net").
 */
export function normalizeProviderLabel(value: string): string {
  return value.trim().toLowerCase();
}
