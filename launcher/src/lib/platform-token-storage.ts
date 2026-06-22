import { STORAGE_KEYS } from "./storage-keys";

export function clearLegacyPlatformTokenCopies() {
  localStorage.removeItem(STORAGE_KEYS.GOG_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.EA_TOKEN);
}

export function clearLegacyGogTokenCopy() {
  localStorage.removeItem(STORAGE_KEYS.GOG_TOKEN);
}

export function clearLegacyEaTokenCopy() {
  localStorage.removeItem(STORAGE_KEYS.EA_TOKEN);
}

export function readEpicSessionMarker() {
  const marker = localStorage.getItem(STORAGE_KEYS.EPIC_SESSION_MARKER);
  if (marker) return marker;

  const legacyToken = localStorage.getItem(STORAGE_KEYS.EPIC_TOKEN);
  if (!legacyToken) return "";

  clearEpicSessionMarker();
  localStorage.setItem(STORAGE_KEYS.EPIC_SESSION_MARKER, "Epic User");
  return "Epic User";
}

export function writeEpicSessionMarker(displayName = "Epic User") {
  localStorage.removeItem(STORAGE_KEYS.EPIC_TOKEN);
  localStorage.setItem(STORAGE_KEYS.EPIC_SESSION_MARKER, displayName);
}

export function clearEpicSessionMarker() {
  localStorage.removeItem(STORAGE_KEYS.EPIC_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.EPIC_SESSION_MARKER);
}
