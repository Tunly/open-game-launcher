// deno-lint-ignore-file no-import-prefix
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

import type {
  RemoteCompanionRelayHandlerDeps,
  RemoteCompanionRelayRpcError,
} from "./handler.ts";

type RemoteCompanionRelayAuthResult = {
  data: unknown;
  error: unknown;
};

type SupabaseCallerClient = {
  auth: {
    getUser: () => Promise<RemoteCompanionRelayAuthResult>;
  };
  rpc: (
    rpcName: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RemoteCompanionRelayRpcError | null }>;
};

type CreateSupabaseCallerClient = (
  supabaseUrl: string,
  supabaseAnonKey: string,
  options: {
    auth: { autoRefreshToken: false; persistSession: false };
    global: { headers: { Authorization: string } };
  },
) => SupabaseCallerClient;

export type RemoteCompanionRelayAdapterDeps = {
  createClient?: CreateSupabaseCallerClient;
  supabaseAnonKey: string;
  supabaseUrl: string;
};

export function createRemoteCompanionRelayAdapters(
  deps: RemoteCompanionRelayAdapterDeps,
): RemoteCompanionRelayHandlerDeps {
  const createClient = deps.createClient ?? createSupabaseClient;

  return {
    createCallerClient: (request) => {
      const authorization = request.headers.get("Authorization") ?? "";
      const client = createClient(
        deps.supabaseUrl,
        deps.supabaseAnonKey,
        {
          auth: { autoRefreshToken: false, persistSession: false },
          global: { headers: { Authorization: authorization } },
        },
      );

      return {
        getUser: () => client.auth.getUser(),
        rpc: async (rpcName, args) => await client.rpc(rpcName, args),
      };
    },
  };
}
