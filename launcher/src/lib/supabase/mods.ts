import type { ManagedMod, ModProvider, StoredModProvider } from "../types/mods";
import { getSupabaseClient } from "./client";

interface UserModInstallRow {
  user_id: string;
  local_install_id: string;
  local_game_id: string;
  catalog_mod_id: null;
  catalog_version_id: null;
  provider_item_id: string | null;
  provider_version_id: string | null;
  game_title: string;
  install_path: null;
  last_error: null;
  legacy_mod_id: null;
  name_snapshot: string;
  provider: ModProvider;
  source_url: null;
  install_state: "installed" | "disabled" | "failed";
  target_dir: null;
  manifest: {
    provider: ModProvider;
    providerItemId: string | null;
  };
  installed_at: string;
  checked_at: string;
}

type ManagedModSyncInput = Omit<ManagedMod, "provider"> & { provider: StoredModProvider };

/**
 * Mirrors only redacted state for the two active providers. Historical rows stay
 * untouched in Supabase and are never loaded into the current mod-manager flow.
 */
export async function syncUserManagedMods(
  gameId: string,
  installOrInstalls: ManagedModSyncInput | ManagedModSyncInput[],
): Promise<void> {
  const localGameId = gameId.trim();
  if (!localGameId) return;
  const installs = Array.isArray(installOrInstalls) ? installOrInstalls : [installOrInstalls];
  const activeInstalls = installs.filter(
    (install): install is ManagedModSyncInput & { provider: ModProvider } =>
      install.provider === "nexus" || install.provider === "steam_workshop",
  );

  const client = getSupabaseClient();
  if (!client) return;

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return;

  const checkedAt = new Date().toISOString();
  const { data: existingRows, error: existingRowsError } = await client
    .from("user_mod_installs")
    .select("local_install_id,provider")
    .eq("user_id", user.id)
    .eq("local_game_id", localGameId)
    .in("provider", ["nexus", "steam_workshop"]);
  if (existingRowsError) throw new Error(existingRowsError.message);

  const payload: UserModInstallRow[] = activeInstalls.map((install) => ({
    user_id: user.id,
    local_install_id: install.installId,
    local_game_id: localGameId,
    // Provider IDs are text, not UUID foreign keys into the retired internal
    // catalog. Keep those catalog references null and use dedicated columns.
    catalog_mod_id: null,
    catalog_version_id: null,
    provider_item_id: install.providerItemId,
    provider_version_id: install.version,
    game_title: "Managed game",
    install_path: null,
    last_error: null,
    legacy_mod_id: null,
    name_snapshot: "Managed mod",
    provider: install.provider,
    source_url: null,
    install_state:
      install.status === "damaged" ? "failed" : install.enabled ? "installed" : "disabled",
    // Local paths and ownership manifests stay on the device. Hosted state is
    // deliberately limited to redacted status plus provider identifiers.
    target_dir: null,
    manifest: {
      provider: install.provider,
      providerItemId: install.providerItemId,
    },
    installed_at: install.installedAt
      ? new Date(install.installedAt * 1000).toISOString()
      : checkedAt,
    checked_at: checkedAt,
  }));

  if (payload.length > 0) {
    const { error } = await client
      .from("user_mod_installs")
      .upsert(payload, { onConflict: "user_id,local_install_id" });
    if (error) throw new Error(error.message);
  }

  const currentIds = new Set(activeInstalls.map((install) => install.installId));
  const removedIds = (existingRows ?? [])
    .filter((row) => !currentIds.has(row.local_install_id))
    .map((row) => row.local_install_id);
  if (removedIds.length === 0) return;

  const { error: removedError } = await client
    .from("user_mod_installs")
    .update({
      catalog_mod_id: null,
      catalog_version_id: null,
      checked_at: checkedAt,
      game_title: "Managed game",
      install_path: null,
      install_state: "removed",
      last_error: null,
      legacy_mod_id: null,
      manifest: {},
      name_snapshot: "Managed mod",
      source_url: null,
      target_dir: null,
    })
    .eq("user_id", user.id)
    .eq("local_game_id", localGameId)
    .in("provider", ["nexus", "steam_workshop"])
    .in("local_install_id", removedIds);
  if (removedError) throw new Error(removedError.message);
}
