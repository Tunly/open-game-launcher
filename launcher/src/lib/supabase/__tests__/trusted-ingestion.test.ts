import { beforeEach, describe, expect, it, vi } from "vitest";

import { isTrustedIngestionStrictMode } from "../trusted-ingestion";

describe("isTrustedIngestionStrictMode", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to true in production", () => {
    vi.stubEnv("MODE", "production");

    expect(isTrustedIngestionStrictMode()).toBe(true);
  });

  it("defaults to false outside production", () => {
    vi.stubEnv("MODE", "development");

    expect(isTrustedIngestionStrictMode()).toBe(false);
  });

  it.each(["true", "1", "yes", "on"])("treats %s as explicitly enabled", (value) => {
    vi.stubEnv("MODE", "development");
    vi.stubEnv("VITE_OG_TRUSTED_INGESTION_STRICT", value);

    expect(isTrustedIngestionStrictMode()).toBe(true);
  });

  it.each(["false", "0", "no", "off"])("treats %s as explicitly disabled", (value) => {
    vi.stubEnv("MODE", "production");
    vi.stubEnv("VITE_OG_TRUSTED_INGESTION_STRICT", value);

    expect(isTrustedIngestionStrictMode()).toBe(false);
  });

  it("falls back to MODE when the explicit value is invalid", () => {
    vi.stubEnv("MODE", "production");
    vi.stubEnv("VITE_OG_TRUSTED_INGESTION_STRICT", "sometimes");

    expect(isTrustedIngestionStrictMode()).toBe(true);

    vi.stubEnv("MODE", "development");

    expect(isTrustedIngestionStrictMode()).toBe(false);
  });
});
