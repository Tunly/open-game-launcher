import type { ProfileTheme } from "./types/profile";

export const PROFILE_THEME_EXCHANGE_SCHEMA = "og-launcher.profile-theme";
export const PROFILE_THEME_EXCHANGE_VERSION = 1;

const safeCardStyles: ProfileTheme["cardStyle"][] = ["default", "solid", "pixel", "minimal"];
const safeBackgroundTypes: ProfileTheme["backgroundType"][] = ["solid"];
const hexColorPattern = /^#[0-9a-f]{6}$/i;

export interface ProfileThemeExchangePayload {
  exportedAt: string;
  schema: typeof PROFILE_THEME_EXCHANGE_SCHEMA;
  theme: ProfileThemeExchangeTheme;
  version: typeof PROFILE_THEME_EXCHANGE_VERSION;
}

export interface ProfileThemeExchangeTheme {
  accentColor: string;
  backgroundType: ProfileTheme["backgroundType"];
  backgroundValue: string;
  cardStyle: ProfileTheme["cardStyle"];
  description: string | null;
  name: string;
  textColor: string;
}

export function createProfileThemeExchangePayload(
  theme: ProfileTheme,
  exportedAt = new Date().toISOString(),
): ProfileThemeExchangePayload {
  return {
    exportedAt,
    schema: PROFILE_THEME_EXCHANGE_SCHEMA,
    theme: {
      accentColor: theme.accentColor ?? "#b7102a",
      backgroundType: theme.backgroundType,
      backgroundValue: theme.backgroundValue ?? "#fff9ed",
      cardStyle: theme.cardStyle,
      description: theme.description,
      name: theme.name,
      textColor: theme.textColor ?? "#171411",
    },
    version: PROFILE_THEME_EXCHANGE_VERSION,
  };
}

export function parseProfileThemeExchangePayload(
  raw: string,
  importedAt = new Date().toISOString(),
): ProfileTheme {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Theme import must be valid JSON.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Theme import must be a JSON object.");
  }

  const payload = parsed as Partial<ProfileThemeExchangePayload>;
  if (
    payload.schema !== PROFILE_THEME_EXCHANGE_SCHEMA ||
    payload.version !== PROFILE_THEME_EXCHANGE_VERSION
  ) {
    throw new Error("Theme import schema is not supported.");
  }

  const theme = payload.theme;
  if (!theme || typeof theme !== "object") {
    throw new Error("Theme import is missing theme data.");
  }

  const name = readTrimmedString(theme.name, "Theme name", 2, 48);
  const description =
    typeof theme.description === "string"
      ? theme.description.trim().slice(0, 160)
      : theme.description === null || theme.description === undefined
        ? null
        : (() => {
            throw new Error("Theme description must be text or null.");
          })();
  const backgroundType = readAllowedValue(
    theme.backgroundType,
    safeBackgroundTypes,
    "Theme background type",
  );
  const backgroundValue = readHexColor(theme.backgroundValue, "Theme background color");
  const accentColor = readHexColor(theme.accentColor, "Theme accent color");
  const textColor = readHexColor(theme.textColor, "Theme text color");
  const cardStyle = readAllowedValue(theme.cardStyle, safeCardStyles, "Theme card style");

  if (backgroundValue.toLowerCase() === textColor.toLowerCase()) {
    throw new Error("Theme text color must contrast the background color.");
  }

  return {
    accentColor,
    backgroundType,
    backgroundValue,
    cardStyle,
    createdAt: importedAt,
    description,
    id: `local-custom-theme-${slugifyThemeName(name)}`,
    isActive: true,
    isPremium: false,
    key: `custom-${slugifyThemeName(name)}`,
    name,
    textColor,
  };
}

export function parseProfileThemeExchangeValue(
  value: unknown,
  importedAt = new Date().toISOString(),
): ProfileTheme | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  try {
    return parseProfileThemeExchangePayload(JSON.stringify(value), importedAt);
  } catch {
    return null;
  }
}

export function isLocalCustomProfileTheme(theme: ProfileTheme) {
  return theme.key.startsWith("custom-") && theme.id.startsWith("local-custom-theme-");
}

export function isProfileThemeLike(value: unknown): value is ProfileTheme {
  if (!value || typeof value !== "object") return false;
  const theme = value as Partial<ProfileTheme>;
  return (
    typeof theme.id === "string" &&
    typeof theme.key === "string" &&
    typeof theme.name === "string" &&
    (theme.description === null || typeof theme.description === "string") &&
    typeof theme.backgroundType === "string" &&
    (theme.backgroundValue === null || typeof theme.backgroundValue === "string") &&
    (theme.accentColor === null || typeof theme.accentColor === "string") &&
    (theme.textColor === null || typeof theme.textColor === "string") &&
    typeof theme.cardStyle === "string" &&
    typeof theme.isPremium === "boolean" &&
    typeof theme.isActive === "boolean" &&
    typeof theme.createdAt === "string"
  );
}

export function themeExchangeFileName(theme: ProfileTheme) {
  return `og-launcher-theme-${slugifyThemeName(theme.name)}.json`;
}

function readTrimmedString(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length < min) throw new Error(`${label} is too short.`);
  if (trimmed.length > max) throw new Error(`${label} is too long.`);
  return trimmed;
}

function readHexColor(value: unknown, label: string) {
  const color = readTrimmedString(value, label, 7, 7);
  if (!hexColorPattern.test(color)) throw new Error(`${label} must be a #rrggbb color.`);
  return color.toLowerCase();
}

function readAllowedValue<T extends string>(value: unknown, allowed: T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${label} is not allowed.`);
  }
  return value as T;
}

function slugifyThemeName(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "custom";
}
