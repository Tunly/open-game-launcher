// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("../supabase/migrations/20260710122000_bind_launcher_presence_to_session_generation.sql"),
  "utf8",
);

describe("launcher presence session-generation migration", () => {
  it("adds a nullable UUID generation for server-side conditional cleanup", () => {
    expect(migration).toMatch(
      /alter table public\.user_presence[\s\S]*add column if not exists session_generation uuid default null/i,
    );
    expect(migration).not.toMatch(/session_generation uuid not null/i);
  });

  it("preserves an active generation when generic or poller upserts omit it", () => {
    expect(migration).toMatch(
      /if new\.session_generation is null and old\.session_generation is not null then[\s\S]*new\.session_generation := old\.session_generation/i,
    );
    expect(migration).toMatch(
      /create trigger preserve_user_presence_session_generation[\s\S]*before update on public\.user_presence/i,
    );
  });
});
