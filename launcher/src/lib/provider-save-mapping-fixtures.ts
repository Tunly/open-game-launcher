export interface ProviderSaveRootFixture {
  exemplarRoot: string;
  pattern: string;
  scope: string;
  shape: string;
}

export interface ProviderSaveMappingRule {
  id: string;
  slot: "profile" | "settings";
  sourceRelativePath: string;
  targetRelativePath: string;
  targetRelativePaths: Partial<Record<string, string>>;
}

export interface ProviderSaveMappingFixture {
  blockers: string[];
  canonicalExternalId: string;
  canonicalExternalIdLabel: string;
  guards: string[];
  installRoot: string;
  mappingRules: ProviderSaveMappingRule[];
  provider: "steam" | "gog" | "epic";
  providerLabel: string;
  providerSource: string;
  saveRoot: ProviderSaveRootFixture;
}

export interface ProviderSaveMappingFixtureReview {
  blockers: string[];
  duplicateTargetRelativePaths: string[];
  status: "mapped" | "blocked";
}

export interface ProviderTargetRelativePathResolution {
  ruleId: string | null;
  targetRelativePath: string;
}

const SHARED_BLOCKERS = [
  "Provider-approved catalog ID validation is not run.",
  "Provider save-root discovery APIs are not called.",
  "Provider cloud save import/export contracts are still required.",
  "Real user-data migration session evidence is still required.",
];

const SHARED_GUARDS = [
  "No provider API calls",
  "No live Supabase claims",
  "No provider cloud transfer",
  "Automatic path-map apply is consent-gated",
  "Fixture review only",
];

const PROVIDER_SAVE_MAPPING_FIXTURES = [
  {
    blockers: [...SHARED_BLOCKERS],
    canonicalExternalId: "110011",
    canonicalExternalIdLabel: "Steam AppID",
    guards: [...SHARED_GUARDS],
    installRoot: "C:\\Games\\Steam\\steamapps\\common\\Mech Arcade",
    mappingRules: [
      {
        id: "steam-profile",
        slot: "profile",
        sourceRelativePath: "remote/profile.sav",
        targetRelativePath: "profile/profile.sav",
        targetRelativePaths: {
          epic: "Saved/Profile.sav",
          gog: "profile.sav",
        },
      },
      {
        id: "steam-settings",
        slot: "settings",
        sourceRelativePath: "remote/settings.json",
        targetRelativePath: "settings/settings.json",
        targetRelativePaths: {
          epic: "Config/settings.json",
          gog: "settings.json",
        },
      },
    ],
    provider: "steam",
    providerLabel: "Steam",
    providerSource: "local fixture: Steam AppID + userdata remote save root",
    saveRoot: {
      exemplarRoot: "C:\\Program Files (x86)\\Steam\\userdata\\424242\\110011",
      pattern: "%STEAM_USERDATA%\\<steam-user-id>\\<steam-app-id>",
      scope: "Steam user id plus app id",
      shape: "steam_userdata_remote",
    },
  },
  {
    blockers: [...SHARED_BLOCKERS],
    canonicalExternalId: "mech-arcade",
    canonicalExternalIdLabel: "GOG product slug",
    guards: [...SHARED_GUARDS],
    installRoot: "C:\\Games\\GOG Galaxy\\Games\\Mech Arcade",
    mappingRules: [
      {
        id: "gog-profile",
        slot: "profile",
        sourceRelativePath: "profile/profile.sav",
        targetRelativePath: "profile/profile.sav",
        targetRelativePaths: {
          epic: "Saved/Profile.sav",
          steam: "profile.sav",
        },
      },
      {
        id: "gog-settings",
        slot: "settings",
        sourceRelativePath: "settings/user_settings.json",
        targetRelativePath: "settings/settings.json",
        targetRelativePaths: {
          epic: "Config/settings.json",
          steam: "settings.json",
        },
      },
    ],
    provider: "gog",
    providerLabel: "GOG",
    providerSource: "local fixture: GOG product slug + Documents save root",
    saveRoot: {
      exemplarRoot: "C:\\Users\\Player\\Documents\\GOG Galaxy\\Mech Arcade",
      pattern: "%USERPROFILE%\\Documents\\GOG Galaxy\\<game-slug>",
      scope: "Windows user profile plus GOG game slug",
      shape: "gog_documents_game_folder",
    },
  },
  {
    blockers: [...SHARED_BLOCKERS],
    canonicalExternalId: "mech-arcade-epic",
    canonicalExternalIdLabel: "Epic catalog item ID",
    guards: [...SHARED_GUARDS],
    installRoot: "C:\\Games\\Epic Games\\MechArcade",
    mappingRules: [
      {
        id: "epic-profile",
        slot: "profile",
        sourceRelativePath: "Saved\\SaveGames\\Profile.sav",
        targetRelativePath: "profile/profile.sav",
        targetRelativePaths: {
          gog: "profile.sav",
          steam: "profile.sav",
        },
      },
      {
        id: "epic-settings",
        slot: "settings",
        sourceRelativePath: "Saved\\Config\\Windows\\GameUserSettings.ini",
        targetRelativePath: "settings/settings.ini",
        targetRelativePaths: {
          gog: "settings.json",
          steam: "settings.json",
        },
      },
    ],
    provider: "epic",
    providerLabel: "Epic",
    providerSource: "local fixture: Epic catalog item + LocalAppData save root",
    saveRoot: {
      exemplarRoot: "C:\\Users\\Player\\AppData\\Local\\MechArcade",
      pattern: "%LOCALAPPDATA%\\<epic-artifact-id>",
      scope: "Windows local app data plus Epic artifact id",
      shape: "epic_localappdata_saved",
    },
  },
] satisfies ProviderSaveMappingFixture[];

export function getProviderSaveMappingFixture(source: string): ProviderSaveMappingFixture {
  const fixture = PROVIDER_SAVE_MAPPING_FIXTURES.find(
    (candidate) => candidate.provider === normalizeProviderSource(source),
  );
  if (!fixture) return cloneProviderSaveMappingFixture(PROVIDER_SAVE_MAPPING_FIXTURES[0]);
  return cloneProviderSaveMappingFixture(fixture);
}

export function listProviderSaveMappingFixtures(): ProviderSaveMappingFixture[] {
  return PROVIDER_SAVE_MAPPING_FIXTURES.map(cloneProviderSaveMappingFixture);
}

export function providerCatalogKey(
  source: string,
  externalId: string | null,
  fallbackId: string,
): string {
  return `${normalizeProviderSource(source)}:${externalId ?? fallbackId}`;
}

export function resolveProviderTargetRelativePath(
  source: string,
  target: string,
  sourceRelativePath: string,
  fallbackTargetRelativePath: string,
): ProviderTargetRelativePathResolution {
  const sourceFixture = getProviderSaveMappingFixture(source);
  const normalizedSourcePath = normalizeRelativePathKey(sourceRelativePath);
  const normalizedTarget = normalizeProviderSource(target);
  const rule = sourceFixture.mappingRules.find(
    (candidate) =>
      relativePathMatches(candidate.sourceRelativePath, normalizedSourcePath) ||
      relativePathMatches(candidate.targetRelativePath, normalizedSourcePath),
  );
  const targetRelativePath =
    rule?.targetRelativePaths[normalizedTarget] ?? fallbackTargetRelativePath;

  return {
    ruleId: rule?.targetRelativePaths[normalizedTarget] ? rule.id : null,
    targetRelativePath,
  };
}

export function reviewProviderSaveMappingFixture(
  fixture: ProviderSaveMappingFixture,
): ProviderSaveMappingFixtureReview {
  const blockers = [
    fixture.canonicalExternalId.trim() ? null : "Canonical external ID is missing.",
    fixture.installRoot.trim() ? null : "Install root exemplar is missing.",
    fixture.saveRoot.exemplarRoot.trim() ? null : "Save root exemplar is missing.",
    ...duplicateTargetRelativePathBlockers(fixture.mappingRules),
  ].filter((item): item is string => Boolean(item));

  return {
    blockers,
    duplicateTargetRelativePaths: duplicateTargetRelativePaths(fixture.mappingRules),
    status: blockers.length === 0 ? "mapped" : "blocked",
  };
}

function duplicateTargetRelativePathBlockers(rules: ProviderSaveMappingRule[]): string[] {
  return duplicateTargetRelativePaths(rules).map(
    (path) => `Duplicate target relative mapping: ${path}`,
  );
}

function duplicateTargetRelativePaths(rules: ProviderSaveMappingRule[]): string[] {
  const counts = new Map<string, number>();
  for (const rule of rules) {
    const key = normalizeRelativePathKey(rule.targetRelativePath);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([path]) => path);
}

function cloneProviderSaveMappingFixture(
  fixture: ProviderSaveMappingFixture,
): ProviderSaveMappingFixture {
  return {
    ...fixture,
    blockers: [...fixture.blockers],
    guards: [...fixture.guards],
    mappingRules: fixture.mappingRules.map((rule) => ({
      ...rule,
      targetRelativePaths: { ...rule.targetRelativePaths },
    })),
    saveRoot: { ...fixture.saveRoot },
  };
}

function normalizeProviderSource(source: string): string {
  return source.trim().toLowerCase() || "unknown";
}

function relativePathMatches(candidatePath: string, normalizedSourcePath: string): boolean {
  const candidate = normalizeRelativePathKey(candidatePath);
  return (
    candidate === normalizedSourcePath || basename(candidate) === basename(normalizedSourcePath)
  );
}

function normalizeRelativePathKey(path: string): string {
  return path
    .trim()
    .replace(/[\\/]+/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
}

function basename(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}
