import type { PostgrestError } from "@supabase/supabase-js";
import { getSupabaseClient } from "./client";
import type {
  ControllerLayout,
  ControllerMappingBinding,
  ControllerTemplate,
  ControllerType,
} from "../types/controllers";
import { DEFAULT_CONTROLLER_BINDINGS } from "../types/controllers";

type ControllerLayoutRow = {
  id: string;
  user_id: string;
  game_id: string | null;
  name: string;
  controller_type: string;
  template: string;
  bindings: unknown;
  gyro_enabled: boolean;
  haptics_enabled: boolean;
  is_community: boolean;
  is_default: boolean;
  author_name: string | null;
  created_at: string;
  updated_at: string;
};

type ControllerQueryResult = { data: unknown; error: PostgrestError | null };
type ControllerQuery = PromiseLike<ControllerQueryResult> & {
  delete: () => ControllerQuery;
  eq: (column: string, value: unknown) => ControllerQuery;
  insert: (payload: Record<string, unknown>) => ControllerQuery;
  is: (column: string, value: null) => ControllerQuery;
  or: (filters: string) => ControllerQuery;
  order: (column: string, options?: { ascending?: boolean }) => ControllerQuery;
  select: (columns: string) => ControllerQuery;
  single: () => ControllerQuery;
  update: (payload: Record<string, unknown>) => ControllerQuery;
};
type SupabaseControllerClient = ReturnType<typeof getSupabaseClient> & {
  from: (table: "controller_layouts") => ControllerQuery;
};

const SELECT = `id, user_id, game_id, name, controller_type, template, bindings,
  gyro_enabled, haptics_enabled, is_community, is_default, author_name, created_at, updated_at`;

function isBinding(value: unknown): value is ControllerMappingBinding {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { input?: unknown }).input === "string" &&
    typeof (value as { output?: unknown }).output === "string"
  );
}

function rowToLayout(row: ControllerLayoutRow): ControllerLayout {
  return {
    id: row.id,
    userId: row.user_id,
    gameId: row.game_id,
    name: row.name,
    controllerType: row.controller_type as ControllerType,
    template: row.template as ControllerTemplate,
    bindings: Array.isArray(row.bindings) ? row.bindings.filter(isBinding) : [],
    gyroEnabled: row.gyro_enabled,
    hapticsEnabled: row.haptics_enabled,
    isCommunity: row.is_community,
    isDefault: row.is_default,
    authorName: row.author_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function throwIfError(error: PostgrestError | null) {
  if (error) throw new Error(error.message);
}

export async function listControllerLayouts(
  options: {
    gameId?: string | null;
    controllerType?: ControllerType | "all";
    includeGlobal?: boolean;
  } = {},
): Promise<ControllerLayout[]> {
  const client = getSupabaseClient() as SupabaseControllerClient;
  const {
    data: { user },
  } = await client.auth.getUser();

  let query = client
    .from("controller_layouts")
    .select(SELECT)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false });

  if (options.controllerType && options.controllerType !== "all") {
    query = query.eq("controller_type", options.controllerType);
  }

  if (options.gameId) {
    query = options.includeGlobal
      ? query.or(`game_id.eq.${options.gameId},game_id.is.null`)
      : query.eq("game_id", options.gameId);
  } else if (options.includeGlobal !== false) {
    query = query.is("game_id", null);
  }

  if (!user) {
    query = query.eq("is_community", true);
  }

  const { data, error } = await query;
  throwIfError(error);
  return ((data ?? []) as ControllerLayoutRow[]).map(rowToLayout);
}

export async function saveControllerLayout(input: {
  id?: string;
  gameId?: string | null;
  name: string;
  controllerType: ControllerType;
  template: ControllerTemplate;
  bindings?: ControllerMappingBinding[];
  gyroEnabled?: boolean;
  hapticsEnabled?: boolean;
  isCommunity?: boolean;
  isDefault?: boolean;
  authorName?: string | null;
}): Promise<ControllerLayout> {
  const client = getSupabaseClient() as SupabaseControllerClient;
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new Error("You must be signed in to save controller layouts.");

  if (input.isDefault) {
    let clearQuery = client
      .from("controller_layouts")
      .update({ is_default: false })
      .eq("user_id", user.id)
      .eq("controller_type", input.controllerType);
    clearQuery = input.gameId
      ? clearQuery.eq("game_id", input.gameId)
      : clearQuery.is("game_id", null);
    const { error } = await clearQuery;
    throwIfError(error);
  }

  const payload = {
    user_id: user.id,
    game_id: input.gameId ?? null,
    name: input.name,
    controller_type: input.controllerType,
    template: input.template,
    bindings: input.bindings ?? DEFAULT_CONTROLLER_BINDINGS,
    gyro_enabled: input.gyroEnabled ?? false,
    haptics_enabled: input.hapticsEnabled ?? true,
    is_community: input.isCommunity ?? false,
    is_default: input.isDefault ?? false,
    author_name: input.authorName ?? null,
  };

  const query = input.id
    ? client.from("controller_layouts").update(payload).eq("id", input.id).select(SELECT).single()
    : client.from("controller_layouts").insert(payload).select(SELECT).single();

  const { data, error } = await query;
  throwIfError(error);
  return rowToLayout(data as ControllerLayoutRow);
}

export async function deleteControllerLayout(id: string): Promise<void> {
  const client = getSupabaseClient() as SupabaseControllerClient;
  const { error } = await client.from("controller_layouts").delete().eq("id", id);
  throwIfError(error);
}
