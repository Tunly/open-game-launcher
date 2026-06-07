import { getSupabaseClient } from "./client";
import type {
  InstalledModInfo,
  ManagedMod,
  ModCatalogEntry,
  ModCatalogVersion,
  ModProfile,
  ModProvider,
  ModSource,
} from "../types/mods";

// The Database type lags behind migrations for the mod catalog and
// user_mod_installs tables. Until those tables are added to the generated
// database.types.ts, this module relies on locally defined row shapes and
// narrows the client to an untyped variant at the call site.

const MOD_SELECT = `id, user_id, game_id, game_title, name, source, source_url, author,
  description, category, enabled, load_order, profile_id, current_version_id,
  installed_at, created_at, updated_at`;

const PROFILE_SELECT = `id, user_id, name, game_id, is_active, created_at`;
const CATALOG_SELECT = `id, slug, local_game_id, game_id, name, author, summary,
  description, provider, source_url, external_id, categories, tags, icon_url,
  banner_url, status, created_at, updated_at`;
const VERSION_SELECT = `id, catalog_mod_id, version, changelog, file_size_bytes,
  sha256, download_url, storage_path, install_strategy, is_latest, status, created_at`;

interface ModRow {
  id: string;
  user_id: string;
  game_id: string | null;
  game_title: string;
  name: string;
  source: string;
  source_url: string | null;
  author: string | null;
  description: string | null;
  category: string | null;
  enabled: boolean;
  load_order: number;
  profile_id: string | null;
  current_version_id: string | null;
  installed_at: string;
  created_at: string;
  updated_at: string;
}

interface ModOrderRow {
  id: string;
  load_order: number;
}

interface ProfileRow {
  id: string;
  user_id: string;
  name: string;
  game_id: string;
  is_active: boolean;
  created_at: string;
}

interface CatalogRow {
  id: string;
  slug: string;
  local_game_id: string | null;
  game_id: string | null;
  name: string;
  author: string | null;
  summary: string | null;
  description: string | null;
  provider: string;
  source_url: string | null;
  external_id: string | null;
  categories: string[] | null;
  tags: string[] | null;
  icon_url: string | null;
  banner_url: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
}

interface CatalogVersionRow {
  id: string;
  catalog_mod_id: string;
  version: string;
  changelog: string | null;
  file_size_bytes: number | null;
  sha256: string | null;
  download_url: string | null;
  storage_path: string | null;
  install_strategy: string | null;
  is_latest: boolean | null;
  status: string | null;
  created_at: string;
}

interface ModUpdateDb {
  enabled?: boolean;
  load_order?: number;
  name?: string;
  source_url?: string | null;
  category?: string | null;
  profile_id?: string | null;
}

function rowToMod(row: ModRow): ManagedMod {
  return {
    id: row.id,
    userId: row.user_id,
    gameId: row.game_id,
    gameTitle: row.game_title,
    name: row.name,
    source: row.source as ModSource,
    sourceUrl: row.source_url,
    author: row.author,
    description: row.description,
    category: row.category,
    enabled: row.enabled,
    loadOrder: row.load_order,
    profileId: row.profile_id,
    currentVersionId: row.current_version_id,
    installedAt: row.installed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToProfile(row: ProfileRow): ModProfile {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    gameId: row.game_id,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

function rowToCatalogVersion(row: CatalogVersionRow): ModCatalogVersion {
  return {
    id: row.id,
    catalogModId: row.catalog_mod_id,
    version: row.version,
    changelog: row.changelog,
    fileSizeBytes: row.file_size_bytes ?? 0,
    sha256: row.sha256,
    downloadUrl: row.download_url,
    storagePath: row.storage_path,
    installStrategy: (row.install_strategy ?? "archive") as ModCatalogVersion["installStrategy"],
    isLatest: Boolean(row.is_latest),
    status: (row.status ?? "published") as ModCatalogVersion["status"],
    createdAt: row.created_at,
  };
}

function rowToCatalogEntry(
  row: CatalogRow,
  latestVersion?: ModCatalogVersion | null,
): ModCatalogEntry {
  return {
    id: row.id,
    slug: row.slug,
    localGameId: row.local_game_id,
    gameId: row.game_id,
    name: row.name,
    author: row.author,
    summary: row.summary,
    description: row.description,
    provider: row.provider as ModProvider,
    sourceUrl: row.source_url,
    externalId: row.external_id,
    categories: Array.isArray(row.categories) ? row.categories : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    iconUrl: row.icon_url,
    bannerUrl: row.banner_url,
    status: (row.status ?? "published") as ModCatalogEntry["status"],
    latestVersion,
  };
}

// ── Mods CRUD ──
export async function listMods(): Promise<ManagedMod[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return [];
  const { data, error } = await client
    .from("mods")
    .select(MOD_SELECT)
    .eq("user_id", user.id)
    .order("load_order");
  if (error) throw new Error(error.message);
  return ((data ?? []) as ModRow[]).map(rowToMod);
}

export async function addMod(mod: {
  gameTitle: string;
  name: string;
  source: ModSource;
  sourceUrl?: string;
  gameId?: string;
  profileId?: string;
}): Promise<ManagedMod | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  let countQuery = client
    .from("mods")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (mod.profileId) {
    countQuery = countQuery.eq("profile_id", mod.profileId);
  } else {
    countQuery = countQuery.is("profile_id", null);
  }
  const { count } = await countQuery;
  const nextOrder = (count ?? 0) + 1;
  const { data, error } = await client
    .from("mods")
    .insert({
      user_id: user.id,
      game_id: mod.gameId ?? null,
      game_title: mod.gameTitle,
      name: mod.name,
      source: mod.source,
      source_url: mod.sourceUrl ?? null,
      profile_id: mod.profileId ?? null,
      load_order: nextOrder,
    })
    .select(MOD_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return rowToMod(data as ModRow);
}

export async function updateMod(
  id: string,
  patch: Partial<
    Pick<ManagedMod, "enabled" | "loadOrder" | "name" | "sourceUrl" | "category" | "profileId">
  >,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  const dbPatch: ModUpdateDb = {};
  if (patch.enabled !== undefined) dbPatch.enabled = patch.enabled;
  if (patch.loadOrder !== undefined) dbPatch.load_order = patch.loadOrder;
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.sourceUrl !== undefined) dbPatch.source_url = patch.sourceUrl;
  if (patch.category !== undefined) dbPatch.category = patch.category;
  if (patch.profileId !== undefined) dbPatch.profile_id = patch.profileId;
  const { error } = await client.from("mods").update(dbPatch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteMod(id: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  const { error } = await client.from("mods").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function swapModOrder(idA: string, idB: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  const { data: mods, error } = await client
    .from("mods")
    .select("id,load_order")
    .in("id", [idA, idB]);
  if (error || !mods || mods.length !== 2) throw new Error("Mods not found");
  const a = (mods as ModOrderRow[]).find((m) => m.id === idA);
  const b = (mods as ModOrderRow[]).find((m) => m.id === idB);
  if (!a || !b) throw new Error("Mods not found");
  await client.from("mods").update({ load_order: b.load_order }).eq("id", idA);
  await client.from("mods").update({ load_order: a.load_order }).eq("id", idB);
}

// ── Profiles ──
export async function listModProfiles(gameId: string): Promise<ModProfile[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return [];
  const { data, error } = await client
    .from("mod_profiles")
    .select(PROFILE_SELECT)
    .eq("user_id", user.id)
    .eq("game_id", gameId);
  if (error) return [];
  return ((data ?? []) as ProfileRow[]).map(rowToProfile);
}

export async function createModProfile(name: string, gameId: string): Promise<ModProfile | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await client
    .from("mod_profiles")
    .insert({ user_id: user.id, name, game_id: gameId })
    .select(PROFILE_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return rowToProfile(data as ProfileRow);
}

// ── Public mod catalog ──
export async function listModCatalogEntries(filters?: {
  provider?: ModProvider | "all";
  gameId?: string;
  search?: string;
}): Promise<ModCatalogEntry[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mod_catalog_entries not yet in Database types
  const client = getSupabaseClient() as any;
  if (!client) return [];
  let query = client
    .from("mod_catalog_entries")
    .select(CATALOG_SELECT)
    .eq("status", "published")
    .order("name");

  if (filters?.provider && filters.provider !== "all") {
    query = query.eq("provider", filters.provider);
  }
  if (filters?.gameId) {
    query = query.or(`local_game_id.eq.${filters.gameId},local_game_id.is.null`);
  }
  if (filters?.search?.trim()) {
    const safe = filters.search.trim().replace(/%/g, "").replace(/,/g, " ");
    query = query.or(`name.ilike.%${safe}%,summary.ilike.%${safe}%,author.ilike.%${safe}%`);
  }

  const { data, error } = await query.limit(80);
  if (error) {
    return [];
  }

  const entries = ((data ?? []) as CatalogRow[]).map((row) => rowToCatalogEntry(row));
  if (entries.length === 0) {
    return [];
  }

  const ids = entries.map((entry: ModCatalogEntry) => entry.id);
  const { data: versions } = await client
    .from("mod_catalog_versions")
    .select(VERSION_SELECT)
    .in("catalog_mod_id", ids)
    .eq("is_latest", true)
    .eq("status", "published");
  const versionByMod = new Map(
    ((versions ?? []) as CatalogVersionRow[]).map((row) => [
      row.catalog_mod_id,
      rowToCatalogVersion(row),
    ]),
  );

  return entries.map((entry: ModCatalogEntry) => ({
    ...entry,
    latestVersion: versionByMod.get(entry.id) ?? null,
  }));
}

interface UserModInstallRow {
  user_id: string;
  local_install_id: string;
  local_game_id: string;
  catalog_mod_id: string | null;
  catalog_version_id: string | null;
  game_title: string;
  name_snapshot: string;
  provider: ModProvider;
  source_url: string | null;
  install_state: "installed" | "disabled";
  target_dir: string;
  manifest: { installedFiles: string[]; provider: ModProvider };
  installed_at: string;
  checked_at: string;
}

export async function recordUserModInstall(install: InstalledModInfo): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- user_mod_installs not yet in Database types
  const client = getSupabaseClient() as any;
  if (!client) return;
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return;
  const payload: UserModInstallRow = {
    user_id: user.id,
    local_install_id: install.installId,
    local_game_id: install.gameId,
    catalog_mod_id: install.catalogItemId ?? null,
    catalog_version_id: install.versionId ?? null,
    game_title: install.gameId,
    name_snapshot: install.title,
    provider: install.provider,
    source_url: install.sourceUrl ?? null,
    install_state: install.enabled ? "installed" : "disabled",
    target_dir: install.targetPath,
    manifest: {
      installedFiles: install.installedFiles,
      provider: install.provider,
    },
    installed_at: new Date(install.installedAt * 1000).toISOString(),
    checked_at: new Date().toISOString(),
  };
  const { error } = await client
    .from("user_mod_installs")
    .upsert(payload, { onConflict: "user_id,local_install_id" });
  if (error) throw new Error(error.message);
}
