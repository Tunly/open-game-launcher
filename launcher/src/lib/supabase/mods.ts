/* eslint-disable @typescript-eslint/no-explicit-any */
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

const MOD_SELECT = `id, user_id, game_id, game_title, name, source, source_url, author,
  description, category, enabled, load_order, profile_id, current_version_id,
  installed_at, created_at, updated_at`;

const PROFILE_SELECT = `id, user_id, name, game_id, is_active, created_at`;
const CATALOG_SELECT = `id, slug, local_game_id, game_id, name, author, summary,
  description, provider, source_url, external_id, categories, tags, icon_url,
  banner_url, status, created_at, updated_at`;
const VERSION_SELECT = `id, catalog_mod_id, version, changelog, file_size_bytes,
  sha256, download_url, storage_path, install_strategy, is_latest, status, created_at`;

function rowToMod(row: any): ManagedMod {
  return {
    id: row.id, userId: row.user_id, gameId: row.game_id, gameTitle: row.game_title,
    name: row.name, source: row.source as ModSource, sourceUrl: row.source_url,
    author: row.author, description: row.description, category: row.category,
    enabled: row.enabled, loadOrder: row.load_order,
    profileId: row.profile_id, currentVersionId: row.current_version_id,
    installedAt: row.installed_at, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function rowToProfile(row: any): ModProfile {
  return { id: row.id, userId: row.user_id, name: row.name, gameId: row.game_id, isActive: row.is_active, createdAt: row.created_at };
}

function rowToCatalogVersion(row: any): ModCatalogVersion {
  return {
    id: row.id,
    catalogModId: row.catalog_mod_id,
    version: row.version,
    changelog: row.changelog,
    fileSizeBytes: row.file_size_bytes ?? 0,
    sha256: row.sha256,
    downloadUrl: row.download_url,
    storagePath: row.storage_path,
    installStrategy: row.install_strategy ?? "archive",
    isLatest: Boolean(row.is_latest),
    status: row.status ?? "published",
    createdAt: row.created_at,
  };
}

function rowToCatalogEntry(row: any, latestVersion?: ModCatalogVersion | null): ModCatalogEntry {
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
    status: row.status ?? "published",
    latestVersion,
  };
}

// ── Mods CRUD ──
export async function listMods(): Promise<ManagedMod[]> {
  const client = getSupabaseClient(); if (!client) return [];
  const { data: { user } } = await client.auth.getUser(); if (!user) return [];
  const { data, error } = await client.from("mods").select(MOD_SELECT).eq("user_id", user.id).order("load_order");
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToMod);
}

export async function addMod(mod: { gameTitle: string; name: string; source: ModSource; sourceUrl?: string; gameId?: string; profileId?: string }): Promise<ManagedMod | null> {
  const client = getSupabaseClient(); if (!client) return null;
  const { data: { user } } = await client.auth.getUser(); if (!user) return null;
  const { count } = await client.from("mods").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("profile_id", mod.profileId ?? undefined as any);
  const nextOrder = (count ?? 0) + 1;
  const { data, error } = await client.from("mods")
    .insert({ user_id: user.id, game_id: mod.gameId ?? null, game_title: mod.gameTitle, name: mod.name, source: mod.source, source_url: mod.sourceUrl ?? null, profile_id: mod.profileId ?? null, load_order: nextOrder })
    .select(MOD_SELECT).single();
  if (error) throw new Error(error.message);
  return rowToMod(data);
}

export async function updateMod(id: string, patch: Partial<Pick<ManagedMod, "enabled" | "loadOrder" | "name" | "sourceUrl" | "category" | "profileId">>): Promise<void> {
  const client = getSupabaseClient(); if (!client) return;
  const dbPatch: any = {};
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
  const client = getSupabaseClient(); if (!client) return;
  const { error } = await client.from("mods").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function swapModOrder(idA: string, idB: string): Promise<void> {
  const client = getSupabaseClient(); if (!client) return;
  const { data: mods, error } = await client.from("mods").select("id,load_order").in("id", [idA, idB]);
  if (error || !mods || mods.length !== 2) throw new Error("Mods not found");
  const a = mods.find((m: any) => m.id === idA);
  const b = mods.find((m: any) => m.id === idB);
  if (!a || !b) throw new Error("Mods not found");
  await client.from("mods").update({ load_order: b.load_order }).eq("id", idA);
  await client.from("mods").update({ load_order: a.load_order }).eq("id", idB);
}

// ── Profiles ──
export async function listModProfiles(gameId: string): Promise<ModProfile[]> {
  const client = getSupabaseClient(); if (!client) return [];
  const { data: { user } } = await client.auth.getUser(); if (!user) return [];
  const { data, error } = await client.from("mod_profiles").select(PROFILE_SELECT).eq("user_id", user.id).eq("game_id", gameId);
  if (error) return [];
  return (data ?? []).map(rowToProfile);
}

export async function createModProfile(name: string, gameId: string): Promise<ModProfile | null> {
  const client = getSupabaseClient(); if (!client) return null;
  const { data: { user } } = await client.auth.getUser(); if (!user) return null;
  const { data, error } = await client.from("mod_profiles").insert({ user_id: user.id, name, game_id: gameId }).select(PROFILE_SELECT).single();
  if (error) throw new Error(error.message);
  return rowToProfile(data);
}

// ── Public mod catalog ──
export async function listModCatalogEntries(filters?: {
  provider?: ModProvider | "all";
  gameId?: string;
  search?: string;
}): Promise<ModCatalogEntry[]> {
  const client = getSupabaseClient() as any; if (!client) return [];
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

  const entries = (data ?? []).map((row: any) => rowToCatalogEntry(row));
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
    (versions ?? []).map((row: any) => [row.catalog_mod_id, rowToCatalogVersion(row)]),
  );

  return entries.map((entry: ModCatalogEntry) => ({
    ...entry,
    latestVersion: versionByMod.get(entry.id) ?? null,
  }));
}

export async function recordUserModInstall(install: InstalledModInfo): Promise<void> {
  const client = getSupabaseClient() as any; if (!client) return;
  const { data: { user } } = await client.auth.getUser(); if (!user) return;
  const { error } = await client.from("user_mod_installs").upsert({
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
  }, { onConflict: "user_id,local_install_id" });
  if (error) throw new Error(error.message);
}
