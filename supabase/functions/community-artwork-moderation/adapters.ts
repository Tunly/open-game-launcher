import type {
  CommunityArtworkModerationHandlerDeps,
  CommunityArtworkModerationRpcError,
} from "./handler.ts";
import type {
  CommunityArtworkScanInput,
  CommunityArtworkScanPacket,
} from "./scan-policy.ts";

type SupabaseQueryError = {
  message?: string;
};

type SupabaseQueryResult<T> = {
  data: T | null;
  error: SupabaseQueryError | null;
};

type SupabaseQueryPromise<T> = PromiseLike<SupabaseQueryResult<T>>;

type SupabaseTableClient = {
  eq: (column: string, value: unknown) => SupabaseTableClient;
  maybeSingle: <T>() => Promise<SupabaseQueryResult<T>>;
  select: (columns: string) => SupabaseTableClient;
};

type SupabaseSchemaClient = {
  from: (table: string) => unknown;
};

type SupabaseAdminClient = {
  from: (table: string) => unknown;
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => SupabaseQueryPromise<unknown>;
  schema: (schema: string) => SupabaseSchemaClient;
};

type CallerClient = {
  auth: {
    getUser: () => Promise<{
      data?: { user?: { id?: string } | null } | null;
      error?: unknown;
    }>;
  };
};

export type CommunityArtworkModerationAdapterDeps = {
  createClient: (
    supabaseUrl: string,
    supabaseAnonKey: string,
    options: {
      auth: { autoRefreshToken: false; persistSession: false };
      global: { headers: { Authorization: string } };
    },
  ) => CallerClient;
  supabaseAdmin: SupabaseAdminClient;
  supabaseAnonKey: string;
  supabaseUrl: string;
};

export function createCommunityArtworkModerationAdapters(
  deps: CommunityArtworkModerationAdapterDeps,
): CommunityArtworkModerationHandlerDeps {
  return {
    callModerationRpc: (rpcName, args) =>
      callModerationRpc(deps.supabaseAdmin, rpcName, args),
    getActiveModeratorRole: (userId) =>
      getActiveModeratorRole(deps.supabaseAdmin, userId),
    getUserId: (request) => getUserId(deps, request),
    readArtworkForScan: (artworkId) =>
      readArtworkForScan(deps.supabaseAdmin, artworkId),
    scanCommunityArtwork: (artworkId, packet) =>
      scanCommunityArtwork(deps.supabaseAdmin, artworkId, packet),
  };
}

async function getUserId(
  deps: Pick<
    CommunityArtworkModerationAdapterDeps,
    "createClient" | "supabaseAnonKey" | "supabaseUrl"
  >,
  request: Request,
): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return null;

  const callerClient = deps.createClient(
    deps.supabaseUrl,
    deps.supabaseAnonKey,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    },
  );
  const { data, error } = await callerClient.auth.getUser();
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

async function getActiveModeratorRole(
  supabaseAdmin: SupabaseAdminClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await tableClient(
    supabaseAdmin.schema("private"),
    "community_artwork_moderators",
  )
    .select("role")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle<{ role?: unknown }>();

  if (error) {
    throw new Error(
      `Failed to read moderator allowlist: ${errorMessage(error)}`,
    );
  }

  return typeof data?.role === "string" ? data.role : null;
}

async function readArtworkForScan(
  supabaseAdmin: SupabaseAdminClient,
  artworkId: string,
): Promise<CommunityArtworkScanInput | null> {
  const { data: item, error } = await tableClient(
    supabaseAdmin,
    "community_artwork_items",
  )
    .select(
      "id, game_id, kind, title, artist_name, description, source_url, storage_path, tags, moderation_status, report_count",
    )
    .eq("id", artworkId)
    .maybeSingle<CommunityArtworkScanInput>();

  if (error) {
    throw new Error(`Failed to read community artwork: ${errorMessage(error)}`);
  }

  return item;
}

async function callModerationRpc(
  supabaseAdmin: SupabaseAdminClient,
  rpcName: string,
  args: Record<string, unknown>,
): Promise<
  { data: unknown; error: CommunityArtworkModerationRpcError | null }
> {
  const { data, error } = await supabaseAdmin.rpc(rpcName, args);
  return { data, error: mapRpcError(error) };
}

async function scanCommunityArtwork(
  supabaseAdmin: SupabaseAdminClient,
  artworkId: string,
  packet: CommunityArtworkScanPacket,
): Promise<
  { data: unknown; error: CommunityArtworkModerationRpcError | null }
> {
  const { data, error } = await supabaseAdmin.rpc("scan_community_artwork", {
    p_artwork_id: artworkId,
    p_metadata: packet.metadata,
    p_scanner: packet.scanner,
    p_signals: packet.signals,
    p_summary: packet.summary,
    p_verdict: packet.verdict,
  });

  return { data, error: mapRpcError(error) };
}

function tableClient(
  client: Pick<SupabaseAdminClient, "from"> | SupabaseSchemaClient,
  table: string,
): SupabaseTableClient {
  return client.from(table) as SupabaseTableClient;
}

function mapRpcError(
  error: SupabaseQueryError | null,
): CommunityArtworkModerationRpcError | null {
  return error ? { message: errorMessage(error) } : null;
}

function errorMessage(error: SupabaseQueryError): string {
  return typeof error.message === "string" && error.message.length > 0
    ? error.message
    : "Unknown Supabase error";
}
