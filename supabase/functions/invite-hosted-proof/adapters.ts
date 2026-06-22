import type { InviteHostedProofRow } from "./contract.ts";
import type { InviteHostedProofHandlerDeps } from "./handler.ts";

type SupabaseRpcError = {
  message: string;
};

type SupabaseRpcResult<T> = {
  data: T | null;
  error: SupabaseRpcError | null;
};

type SupabaseRpcBuilder = {
  maybeSingle: () => PromiseLike<SupabaseRpcResult<unknown>>;
};

type InviteHostedProofSupabaseClient = {
  auth: {
    getUser: () => Promise<{ data: unknown; error: unknown }>;
  };
  rpc: (
    functionName: string,
    args: { token_input: string },
  ) => SupabaseRpcBuilder;
};

export interface InviteHostedProofAdapterDeps {
  allowedOrigins: string[];
  createClient: (
    supabaseUrl: string,
    supabaseAnonKey: string,
    options: {
      auth: { autoRefreshToken: false; persistSession: false };
      global: { headers: { Authorization: string } };
    },
  ) => InviteHostedProofSupabaseClient;
  supabaseAnonKey: string;
  supabaseUrl: string;
}

export type InviteHostedProofAdapters = Pick<
  InviteHostedProofHandlerDeps,
  "allowedOrigins" | "createCallerClient"
>;

export function createInviteHostedProofAdapters(
  deps: InviteHostedProofAdapterDeps,
): InviteHostedProofAdapters {
  return {
    allowedOrigins: deps.allowedOrigins,
    createCallerClient: (request) => {
      const authorization = request.headers.get("Authorization") ?? "";
      const client = deps.createClient(
        deps.supabaseUrl,
        deps.supabaseAnonKey,
        {
          auth: { autoRefreshToken: false, persistSession: false },
          global: { headers: { Authorization: authorization } },
        },
      );

      return {
        getUser: () => client.auth.getUser(),
        proveShareTokenReplayDenial: async (args) => {
          const result = await client
            .rpc("prove_share_token_replay_denial", args)
            .maybeSingle();
          return result as SupabaseRpcResult<InviteHostedProofRow>;
        },
        redeemShareToken: async (args) => {
          const { error } = await client
            .rpc("redeem_share_token", args)
            .maybeSingle();
          return { error };
        },
      };
    },
  };
}
