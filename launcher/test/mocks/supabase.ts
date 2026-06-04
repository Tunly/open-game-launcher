import { vi } from "vitest";

/**
 * Lightweight fake for `@/lib/supabase/client` and friends. The row-converter
 * tests need a way to feed a fixed row shape into the to* helpers without
 * spinning up a real Supabase instance. We expose `mockSupabaseRow` and
 * `mockSupabaseClient` helpers that return a client whose `.from().select()`
 * chain resolves to a pre-canned row.
 */

type Row = Record<string, unknown>;

export interface MockSupabaseClient {
  from: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
  auth: {
    getUser: ReturnType<typeof vi.fn>;
  };
  storage: {
    from: ReturnType<typeof vi.fn>;
  };
}

function buildSelectChain(payload: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const methods = [
    "select",
    "insert",
    "update",
    "upsert",
    "delete",
    "eq",
    "neq",
    "in",
    "or",
    "ilike",
    "order",
    "limit",
    "maybeSingle",
    "single",
  ];
  for (const method of methods) {
    chain[method] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(payload));
  chain.single = vi.fn(() => Promise.resolve(payload));
  return chain;
}

export function mockSupabaseClient(rows: Record<string, Row[] | Row | null> = {}): MockSupabaseClient {
  const from = vi.fn((table: string) => buildSelectChain({
    data: rows[table] ?? null,
    error: null,
  }));
  const rpc = vi.fn(() => Promise.resolve({ data: null, error: null }));
  return {
    auth: {
      getUser: vi.fn(() => Promise.resolve({
        data: { user: { id: "user-1", email: "test@example.com" } },
        error: null,
      })),
    },
    from,
    rpc,
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(() => Promise.resolve({ error: null })),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://cdn/avatar.png" } })),
      })),
    },
  };
}

export function mockSupabaseRow(table: string, row: Row): MockSupabaseClient {
  return mockSupabaseClient({ [table]: row });
}
