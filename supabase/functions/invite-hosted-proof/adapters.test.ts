import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { createInviteHostedProofAdapters } from "./adapters.ts";
import type { InviteHostedProofRow } from "./contract.ts";

const endpoint = "https://functions.example/invite-hosted-proof";

Deno.test("invite hosted proof adapters bridge caller auth without live Supabase secrets", async () => {
  const calls: Operation[] = [];
  const adapters = createInviteHostedProofAdapters({
    ...deps(),
    createClient: (supabaseUrl, supabaseAnonKey, options) => {
      calls.push({
        args: [supabaseUrl, supabaseAnonKey, options],
        method: "createClient",
      });
      return supabaseClientStub({ calls });
    },
  });

  const callerClient = adapters.createCallerClient(
    new Request(endpoint, {
      headers: { Authorization: "Bearer test-token" },
    }),
  );

  assertEquals(await callerClient.getUser(), {
    data: { user: { id: "user-1" } },
    error: null,
  });
  assertEquals(calls, [
    {
      args: [
        "https://supabase.test",
        "anon-test",
        {
          auth: { autoRefreshToken: false, persistSession: false },
          global: { headers: { Authorization: "Bearer test-token" } },
        },
      ],
      method: "createClient",
    },
    { args: [], method: "getUser" },
  ]);
});

Deno.test("invite hosted proof adapters preserve allowed origins", () => {
  const adapters = createInviteHostedProofAdapters({
    ...deps(),
    allowedOrigins: ["https://og-launcher.example"],
  });

  assertEquals(adapters.allowedOrigins, ["https://og-launcher.example"]);
});

Deno.test("invite hosted proof adapters send empty auth bridge header when absent", () => {
  const calls: Operation[] = [];
  const adapters = createInviteHostedProofAdapters({
    ...deps(),
    createClient: (supabaseUrl, supabaseAnonKey, options) => {
      calls.push({
        args: [supabaseUrl, supabaseAnonKey, options],
        method: "createClient",
      });
      return supabaseClientStub();
    },
  });

  adapters.createCallerClient(new Request(endpoint));

  assertEquals(calls, [
    {
      args: [
        "https://supabase.test",
        "anon-test",
        {
          auth: { autoRefreshToken: false, persistSession: false },
          global: { headers: { Authorization: "" } },
        },
      ],
      method: "createClient",
    },
  ]);
});

Deno.test("invite hosted proof adapters call proof and replay RPCs with token_input args", async () => {
  const calls: Operation[] = [];
  const proof = proofRow();
  const adapters = createInviteHostedProofAdapters({
    ...deps(),
    createClient: () =>
      supabaseClientStub({
        calls,
        rpcResults: {
          prove_share_token_replay_denial: { data: proof, error: null },
          redeem_share_token: {
            data: null,
            error: { message: "Invite token is not redeemable." },
          },
        },
      }),
  });
  const callerClient = adapters.createCallerClient(
    new Request(endpoint, {
      headers: { Authorization: "Bearer test-token" },
    }),
  );

  assertEquals(
    await callerClient.proveShareTokenReplayDenial({
      token_input: "share-token",
    }),
    { data: proof, error: null },
  );
  assertEquals(
    await callerClient.redeemShareToken({ token_input: "share-token" }),
    { error: { message: "Invite token is not redeemable." } },
  );
  assertEquals(calls, [
    {
      args: [
        "prove_share_token_replay_denial",
        { token_input: "share-token" },
      ],
      method: "rpc",
    },
    {
      args: [],
      method: "maybeSingle",
      rpc: "prove_share_token_replay_denial",
    },
    {
      args: ["redeem_share_token", { token_input: "share-token" }],
      method: "rpc",
    },
    { args: [], method: "maybeSingle", rpc: "redeem_share_token" },
  ]);
});

Deno.test("invite hosted proof adapters pass Supabase RPC errors through", async () => {
  const adapters = createInviteHostedProofAdapters({
    ...deps(),
    createClient: () =>
      supabaseClientStub({
        rpcResults: {
          prove_share_token_replay_denial: {
            data: null,
            error: { message: "Proof RPC denied access" },
          },
          redeem_share_token: {
            data: null,
            error: { message: "Invite token is not redeemable." },
          },
        },
      }),
  });
  const callerClient = adapters.createCallerClient(new Request(endpoint));

  assertEquals(
    await callerClient.proveShareTokenReplayDenial({
      token_input: "share-token",
    }),
    { data: null, error: { message: "Proof RPC denied access" } },
  );
  assertEquals(
    await callerClient.redeemShareToken({ token_input: "share-token" }),
    { error: { message: "Invite token is not redeemable." } },
  );
});

type Operation = {
  args: unknown[];
  method: string;
  rpc?: string;
};

function deps() {
  return {
    allowedOrigins: ["https://og-launcher.example"],
    createClient: () => supabaseClientStub(),
    supabaseAnonKey: "anon-test",
    supabaseUrl: "https://supabase.test",
  };
}

function supabaseClientStub(options: {
  calls?: Operation[];
  rpcResults?: Record<
    string,
    { data: unknown; error: { message: string } | null }
  >;
} = {}) {
  const calls = options.calls ?? [];
  return {
    auth: {
      getUser: async () => {
        calls.push({ args: [], method: "getUser" });
        return { data: { user: { id: "user-1" } }, error: null };
      },
    },
    rpc: (functionName: string, args: { token_input: string }) => {
      calls.push({ args: [functionName, args], method: "rpc" });
      return {
        maybeSingle: () => {
          calls.push({ args: [], method: "maybeSingle", rpc: functionName });
          return Promise.resolve(
            options.rpcResults?.[functionName] ?? {
              data: null,
              error: null,
            },
          );
        },
      };
    },
  };
}

function proofRow(): InviteHostedProofRow {
  return {
    game_invite_id: "11111111-1111-4111-8111-111111111111",
    game_title: "Neon Circuit",
    invite_status: "accepted",
    max_uses: 1,
    platform: "steam",
    replay_denied: true,
    used_at: "2026-06-13T09:25:00.000Z",
    uses_count: 1,
  };
}
