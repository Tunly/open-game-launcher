import type { PostgrestError } from "@supabase/supabase-js";
import { getSupabaseClient } from "./client";
import { isMissingSchemaError } from "./helpers";
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

type HostedControllerLayoutRow = ControllerLayoutRow & {
  download_count?: number | null;
  moderation_status?: string | null;
  report_count?: number | null;
  user_vote?: number | null;
  vote_score?: number | null;
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
  rpc: (
    name:
      | "list_community_controller_layouts"
      | "record_controller_layout_download"
      | "report_controller_layout"
      | "vote_controller_layout",
    params: Record<string, unknown>,
  ) => PromiseLike<ControllerQueryResult>;
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

function rowToHostedLayout(row: HostedControllerLayoutRow): ControllerLayout {
  return {
    ...rowToLayout({ ...row, is_community: true, is_default: false }),
    downloadCount: typeof row.download_count === "number" ? row.download_count : 0,
    moderationStatus: getModerationStatus(row.moderation_status),
    reportCount: typeof row.report_count === "number" ? row.report_count : 0,
    userVote: getUserVote(row.user_vote),
    voteScore: typeof row.vote_score === "number" ? row.vote_score : 0,
  };
}

function getModerationStatus(value: string | null | undefined) {
  return value === "pending" || value === "rejected" ? value : "approved";
}

function getUserVote(value: number | null | undefined): -1 | 0 | 1 {
  return value === -1 || value === 1 ? value : 0;
}

function throwIfError(error: PostgrestError | null) {
  if (error) throw new Error(error.message);
}

export type HostedControllerLayoutResult<T> =
  | { ok: true; value: T }
  | {
      message: string;
      ok: false;
      reason: "auth" | "config" | "database" | "schema";
    };

function mapHostedControllerLayoutError(error: unknown): HostedControllerLayoutResult<never> {
  const errorLike =
    error && typeof error === "object" && "message" in error
      ? (error as { code?: string; message: string })
      : null;
  const message = errorLike?.message ?? (error instanceof Error ? error.message : String(error));
  if (/supabase is not configured|missing supabase/i.test(message)) {
    return {
      ok: false,
      reason: "config",
      message: "Hosted controller layouts need Supabase configuration.",
    };
  }
  if (/sign in|required|auth/i.test(message)) {
    return {
      ok: false,
      reason: "auth",
      message: "Sign in required for hosted controller layout actions.",
    };
  }
  if (isMissingSchemaError(errorLike)) {
    return {
      ok: false,
      reason: "schema",
      message: "Hosted controller layout schema is not applied yet.",
    };
  }
  return {
    ok: false,
    reason: "database",
    message,
  };
}

function mapRpcError(error: PostgrestError | null): HostedControllerLayoutResult<never> | null {
  return error ? mapHostedControllerLayoutError(error) : null;
}

export async function listHostedControllerLayouts(
  options: {
    controllerType?: ControllerType | "all";
    gameId?: string | null;
    limit?: number;
  } = {},
): Promise<HostedControllerLayoutResult<ControllerLayout[]>> {
  try {
    const client = getSupabaseClient() as SupabaseControllerClient;
    const { data, error } = await client.rpc("list_community_controller_layouts", {
      p_controller_type:
        options.controllerType && options.controllerType !== "all" ? options.controllerType : null,
      p_game_id: options.gameId ?? null,
      p_limit: options.limit ?? 24,
    });
    const mappedError = mapRpcError(error);
    if (mappedError) return mappedError;
    return {
      ok: true,
      value: ((data ?? []) as HostedControllerLayoutRow[]).map(rowToHostedLayout),
    };
  } catch (error) {
    return mapHostedControllerLayoutError(error);
  }
}

export async function setHostedControllerLayoutVote(
  layoutId: string,
  vote: -1 | 0 | 1,
): Promise<
  HostedControllerLayoutResult<{ layoutId: string; userVote: -1 | 0 | 1; voteScore: number }>
> {
  try {
    const client = getSupabaseClient() as SupabaseControllerClient;
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) {
      return {
        ok: false,
        reason: "auth",
        message: "Sign in required for hosted controller layout actions.",
      };
    }

    const { data, error } = await client.rpc("vote_controller_layout", {
      p_layout_id: layoutId,
      p_vote: vote,
    });
    const mappedError = mapRpcError(error);
    if (mappedError) return mappedError;
    const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
    return {
      ok: true,
      value: {
        layoutId: typeof row?.layout_id === "string" ? row.layout_id : layoutId,
        userVote: getUserVote(typeof row?.user_vote === "number" ? row.user_vote : vote),
        voteScore: typeof row?.vote_score === "number" ? row.vote_score : 0,
      },
    };
  } catch (error) {
    return mapHostedControllerLayoutError(error);
  }
}

export async function recordHostedControllerLayoutDownload(
  layoutId: string,
): Promise<HostedControllerLayoutResult<{ downloadCount: number; layoutId: string }>> {
  try {
    const client = getSupabaseClient() as SupabaseControllerClient;
    const { data, error } = await client.rpc("record_controller_layout_download", {
      p_layout_id: layoutId,
    });
    const mappedError = mapRpcError(error);
    if (mappedError) return mappedError;
    const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
    return {
      ok: true,
      value: {
        downloadCount: typeof row?.download_count === "number" ? row.download_count : 0,
        layoutId: typeof row?.layout_id === "string" ? row.layout_id : layoutId,
      },
    };
  } catch (error) {
    return mapHostedControllerLayoutError(error);
  }
}

export async function reportHostedControllerLayout(
  layoutId: string,
  reason: string,
): Promise<
  HostedControllerLayoutResult<{
    layoutId: string;
    moderationStatus: "approved" | "pending" | "rejected";
    reportCount: number;
  }>
> {
  try {
    const client = getSupabaseClient() as SupabaseControllerClient;
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) {
      return {
        ok: false,
        reason: "auth",
        message: "Sign in required for hosted controller layout actions.",
      };
    }

    const { data, error } = await client.rpc("report_controller_layout", {
      p_layout_id: layoutId,
      p_reason: reason,
    });
    const mappedError = mapRpcError(error);
    if (mappedError) return mappedError;
    const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
    return {
      ok: true,
      value: {
        layoutId: typeof row?.layout_id === "string" ? row.layout_id : layoutId,
        moderationStatus: getModerationStatus(
          typeof row?.moderation_status === "string" ? row.moderation_status : null,
        ),
        reportCount: typeof row?.report_count === "number" ? row.report_count : 0,
      },
    };
  } catch (error) {
    return mapHostedControllerLayoutError(error);
  }
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
