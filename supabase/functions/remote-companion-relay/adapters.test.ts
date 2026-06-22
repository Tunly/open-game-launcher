import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { createRemoteCompanionRelayAdapters } from "./adapters.ts";

Deno.test("remote companion relay adapters bridge caller auth into Supabase client without live secrets", async () => {
  const createClientCalls: unknown[] = [];
  const adapters = createRemoteCompanionRelayAdapters({
    createClient: (supabaseUrl, supabaseAnonKey, options) => {
      createClientCalls.push({ options, supabaseAnonKey, supabaseUrl });
      return {
        auth: {
          getUser: async () => ({
            data: { user: { id: "user-1" } },
            error: null,
          }),
        },
        rpc: async () => ({ data: null, error: null }),
      };
    },
    supabaseAnonKey: "anon-test",
    supabaseUrl: "https://supabase.test",
  });

  const client = adapters.createCallerClient(
    new Request("https://functions.test/remote-companion-relay", {
      headers: { Authorization: "Bearer caller-token" },
    }),
  );

  assertEquals(await client.getUser(), {
    data: { user: { id: "user-1" } },
    error: null,
  });
  assertEquals(createClientCalls, [
    {
      options: {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: "Bearer caller-token" } },
      },
      supabaseAnonKey: "anon-test",
      supabaseUrl: "https://supabase.test",
    },
  ]);
});

Deno.test("remote companion relay adapters preserve empty auth header and delegate RPC calls", async () => {
  const rpcCalls: unknown[] = [];
  const createClientCalls: unknown[] = [];
  const adapters = createRemoteCompanionRelayAdapters({
    createClient: (supabaseUrl, supabaseAnonKey, options) => {
      createClientCalls.push({ options, supabaseAnonKey, supabaseUrl });
      return {
        auth: {
          getUser: async () => ({
            data: { user: { id: "user-1" } },
            error: null,
          }),
        },
        rpc: async (rpcName, args) => {
          rpcCalls.push({ args, rpcName });
          return {
            data: { ok: true },
            error: null,
          };
        },
      };
    },
    supabaseAnonKey: "anon-test",
    supabaseUrl: "https://supabase.test",
  });

  const client = adapters.createCallerClient(
    new Request("https://functions.test/remote-companion-relay"),
  );

  assertEquals(
    await client.rpc("record_remote_companion_ping", {
      device_id_input: "device-1",
      device_secret_input: "secret-1",
    }),
    { data: { ok: true }, error: null },
  );
  assertEquals(createClientCalls, [
    {
      options: {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: "" } },
      },
      supabaseAnonKey: "anon-test",
      supabaseUrl: "https://supabase.test",
    },
  ]);
  assertEquals(rpcCalls, [
    {
      args: {
        device_id_input: "device-1",
        device_secret_input: "secret-1",
      },
      rpcName: "record_remote_companion_ping",
    },
  ]);
});
