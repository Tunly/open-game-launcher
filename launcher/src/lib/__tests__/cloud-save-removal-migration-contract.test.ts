// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("../supabase/migrations/20260708120000_remove_first_party_cloud_saves.sql"),
  "utf8",
);

describe("cloud-save removal migration contract", () => {
  it("locks object and metadata writes before checking for save data", () => {
    const objectLockPosition = migration.indexOf("lock table storage.objects");
    const fileLockPosition = migration.indexOf("lock table public.user_cloud_save_files");
    const setLockPosition = migration.indexOf("lock table public.user_cloud_save_sets");
    const guardPosition = migration.indexOf("if exists (");
    const policyPosition = migration.indexOf("drop policy");

    expect(migration.trimStart().toLowerCase()).toMatch(/^--[\s\S]*\bbegin;/);
    expect(objectLockPosition).toBeGreaterThanOrEqual(0);
    expect(fileLockPosition).toBeGreaterThan(objectLockPosition);
    expect(setLockPosition).toBeGreaterThan(fileLockPosition);
    expect(guardPosition).toBeGreaterThan(setLockPosition);
    expect(guardPosition).toBeGreaterThanOrEqual(0);
    expect(policyPosition).toBeGreaterThan(guardPosition);
    expect(migration).toMatch(/from storage\.objects\s+where bucket_id = 'game-saves'/i);
    expect(migration).toMatch(/exists \(select 1 from public\.user_cloud_save_files\)/i);
    expect(migration).toMatch(/exists \(select 1 from public\.user_cloud_save_sets\)/i);
    expect(migration).toMatch(/raise exception[\s\S]*refusing to remove the game-saves bucket/i);
    expect(migration.trimEnd().toLowerCase()).toMatch(/commit;$/);
  });

  it("never silently deletes stored save files", () => {
    expect(migration).not.toMatch(/delete from storage\.objects/i);
    expect(migration).not.toMatch(/(?:delete|update|insert)\s+(?:from|into)?\s*storage\.buckets/i);
    expect(migration).not.toMatch(/drop table[^;]*cascade/i);
    expect(migration).toMatch(/Supabase blocks direct writes to storage\.buckets/i);
  });
});
