function readBooleanEnv(value: unknown): boolean | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

export function isTrustedIngestionStrictMode() {
  const explicit = readBooleanEnv(import.meta.env.VITE_OG_TRUSTED_INGESTION_STRICT);
  if (explicit != null) return explicit;
  return import.meta.env.MODE === "production";
}

export function trustedIngestionStrictModeError(surface: string, reason: string) {
  return new Error(
    `Trusted ${surface} ingestion is required in production; direct authenticated table fallback is disabled (${reason}).`,
  );
}
