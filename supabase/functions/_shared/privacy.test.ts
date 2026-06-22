import {
  assertEquals,
  assertInstanceOf,
  assertStrictEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import type { AuthenticatedRequest, PrivacyClientFactory } from "./privacy.ts";

type PrivacyModule = typeof import("./privacy.ts");
type CreateClientCall = {
  options: Parameters<PrivacyClientFactory>[2];
  supabaseKey: string;
  supabaseUrl: string;
};
type AuthResult = {
  data?: { user?: unknown | null } | null;
  error?: unknown;
};

const requiredEnv = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;
const fakeEnv = {
  SUPABASE_ANON_KEY: "anon-test",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
  SUPABASE_URL: "https://project.supabase.co",
};
const user = {
  app_metadata: {},
  aud: "authenticated",
  created_at: "2026-06-15T00:00:00.000Z",
  id: "11111111-1111-4111-8111-111111111111",
  user_metadata: {},
};

const envSnapshot = setDefaultPrivacyEnv();
let privacyModule: PrivacyModule;
try {
  privacyModule = await import("./privacy.ts");
} finally {
  restoreEnv(envSnapshot);
}

const {
  createPrivacyRuntime,
  privacyAdminClient,
  requireAuthenticatedRequest,
} = privacyModule;

Deno.test("privacy default boundary loads from fake Supabase env without live secrets", () => {
  assertEquals(typeof requireAuthenticatedRequest, "function");
  assertEquals(typeof privacyAdminClient.from, "function");
});

Deno.test("privacy runtime requires all Supabase env before creating clients", () => {
  for (const missingEnv of requiredEnv) {
    const calls: CreateClientCall[] = [];

    assertThrows(
      () =>
        createPrivacyRuntime({
          createClient: createClientRecorder(calls),
          getEnv: (name) =>
            name === missingEnv
              ? undefined
              : fakeEnv[name as keyof typeof fakeEnv],
        }),
      Error,
      `Missing required environment variable: ${missingEnv}`,
    );
    assertEquals(calls, []);
  }
});

Deno.test("privacy runtime builds admin client with the service role key", () => {
  const calls: CreateClientCall[] = [];
  const adminClient = supabaseClientStub();
  const runtime = createPrivacyRuntime({
    createClient: createClientRecorder(calls, { adminClient }),
    getEnv: envGetter,
  });

  assertStrictEquals(runtime.adminClient, adminClient);
  assertEquals(calls, [
    {
      options: {
        auth: { autoRefreshToken: false, persistSession: false },
      },
      supabaseKey: "service-role-test",
      supabaseUrl: "https://project.supabase.co",
    },
  ]);
});

Deno.test("requireAuthenticatedRequest rejects missing and anon bearer before Supabase auth", async () => {
  const calls: CreateClientCall[] = [];
  const runtime = createPrivacyRuntime({
    createClient: createClientRecorder(calls),
    getEnv: envGetter,
  });

  const missingAuth = await runtime.requireAuthenticatedRequest(
    new Request("https://edge.example/privacy"),
  );
  assertResponse(missingAuth);
  assertEquals(missingAuth.status, 401);
  assertEquals(await missingAuth.json(), {
    error: "Missing Authorization bearer token.",
  });

  const anonAuth = await runtime.requireAuthenticatedRequest(
    new Request("https://edge.example/privacy", {
      headers: { Authorization: "Bearer anon-test" },
    }),
  );
  assertResponse(anonAuth);
  assertEquals(anonAuth.status, 401);
  assertEquals(await anonAuth.json(), { error: "Sign in required." });

  assertEquals(calls, [
    {
      options: {
        auth: { autoRefreshToken: false, persistSession: false },
      },
      supabaseKey: "service-role-test",
      supabaseUrl: "https://project.supabase.co",
    },
  ]);
});

Deno.test("requireAuthenticatedRequest bridges bearer auth to Supabase and returns admin boundary", async () => {
  const calls: CreateClientCall[] = [];
  const adminClient = supabaseClientStub();
  const runtime = createPrivacyRuntime({
    createClient: createClientRecorder(calls, {
      adminClient,
      callerAuthResult: { data: { user }, error: null },
    }),
    getEnv: envGetter,
  });

  const result = await runtime.requireAuthenticatedRequest(
    new Request("https://edge.example/privacy", {
      headers: { Authorization: "Bearer user-jwt" },
    }),
  );

  assertAuthenticatedRequest(result);
  assertStrictEquals(result.adminClient, adminClient);
  assertEquals(result.token, "user-jwt");
  assertEquals(result.user, user);
  assertEquals(calls, [
    {
      options: {
        auth: { autoRefreshToken: false, persistSession: false },
      },
      supabaseKey: "service-role-test",
      supabaseUrl: "https://project.supabase.co",
    },
    {
      options: {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: "Bearer user-jwt" } },
      },
      supabaseKey: "anon-test",
      supabaseUrl: "https://project.supabase.co",
    },
  ]);
});

Deno.test("requireAuthenticatedRequest maps Supabase auth errors and empty users to 401", async () => {
  for (
    const authResult of [
      { data: { user: null }, error: null },
      { data: { user }, error: { message: "expired" } },
    ] satisfies AuthResult[]
  ) {
    const runtime = createPrivacyRuntime({
      createClient: createClientRecorder([], { callerAuthResult: authResult }),
      getEnv: envGetter,
    });

    const result = await runtime.requireAuthenticatedRequest(
      new Request("https://edge.example/privacy", {
        headers: { Authorization: "Bearer user-jwt" },
      }),
    );

    assertResponse(result);
    assertEquals(result.status, 401);
    assertEquals(await result.json(), { error: "Invalid or expired session." });
  }
});

function createClientRecorder(
  calls: CreateClientCall[],
  options: {
    adminClient?: ReturnType<PrivacyClientFactory>;
    callerAuthResult?: AuthResult;
  } = {},
): PrivacyClientFactory {
  return (supabaseUrl, supabaseKey, clientOptions) => {
    calls.push({ options: clientOptions, supabaseKey, supabaseUrl });
    if (supabaseKey === fakeEnv.SUPABASE_SERVICE_ROLE_KEY) {
      return options.adminClient ?? supabaseClientStub();
    }
    return supabaseClientStub(options.callerAuthResult);
  };
}

function envGetter(name: string) {
  return fakeEnv[name as keyof typeof fakeEnv];
}

function supabaseClientStub(
  authResult: AuthResult = { data: { user }, error: null },
): ReturnType<PrivacyClientFactory> {
  return {
    auth: {
      getUser: () => Promise.resolve(authResult),
    },
    from: () => {
      throw new Error("Unexpected table access in privacy boundary test.");
    },
  } as unknown as ReturnType<PrivacyClientFactory>;
}

function assertResponse(
  value: AuthenticatedRequest | Response,
): asserts value is Response {
  assertInstanceOf(value, Response);
}

function assertAuthenticatedRequest(
  value: AuthenticatedRequest | Response,
): asserts value is AuthenticatedRequest {
  if (value instanceof Response) {
    throw new Error("Expected authenticated request, received Response.");
  }
}

function setDefaultPrivacyEnv() {
  const snapshot = new Map<string, string | undefined>();
  for (const name of requiredEnv) {
    snapshot.set(name, Deno.env.get(name));
    Deno.env.set(name, fakeEnv[name]);
  }
  return snapshot;
}

function restoreEnv(snapshot: Map<string, string | undefined>) {
  for (const [name, value] of snapshot) {
    if (value === undefined) {
      Deno.env.delete(name);
    } else {
      Deno.env.set(name, value);
    }
  }
}
