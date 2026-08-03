// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function readMigration(name: string) {
  return readFileSync(resolve(`../supabase/migrations/${name}`), "utf8");
}

function expectSafeRemoval(migration: string, tableName: string) {
  expect(migration).toMatch(/lock table %s in access exclusive mode/i);
  expect(migration).toMatch(/select exists \(select 1 from %s\)/i);
  expect(migration).toMatch(/from pg_constraint dependency/i);
  expect(migration).toMatch(/from pg_depend dependency[\s\S]*join pg_rewrite rewrite/i);
  expect(migration).toMatch(new RegExp(`drop table if exists public\\.${tableName} restrict`, "i"));
  expect(migration).not.toMatch(/\bcascade\b/i);
  expect(migration).not.toMatch(/\b(?:delete|truncate)\s+from\b/i);

  const preflight = migration.indexOf("select exists (select 1 from %s)");
  const tableDrop = migration.indexOf(`drop table if exists public.${tableName} restrict`);
  expect(preflight).toBeGreaterThanOrEqual(0);
  expect(tableDrop).toBeGreaterThan(preflight);
}

describe("retired feature removal migration contracts", () => {
  it("refuses to discard screenshot data or unknown dependants", () => {
    const migration = readMigration("20260710140000_remove_screenshot_support.sql");

    for (const table of [
      "screenshot_moderation_audit",
      "screenshot_reports",
      "screenshot_likes",
      "screenshots",
    ]) {
      expectSafeRemoval(migration, table);
    }

    expect(migration).toMatch(/while screenshot storage objects remain/i);
    expect(migration).toMatch(/while screenshot profile showcases remain/i);
    expect(migration).toMatch(/while screenshot activity rows remain/i);
    expect(migration).toMatch(/while store or mod screenshot arrays remain/i);
    expect(migration).toMatch(
      /drop function if exists public\.report_screenshot\(uuid, text, text\) restrict/i,
    );
    expect(migration).toMatch(/bucket is removed through the Storage API/i);
    expect(migration).not.toMatch(/delete from storage\.buckets/i);
    expect(migration).not.toMatch(/\bcascade\b/i);
  });

  it("refuses to discard controller layouts or unknown dependants", () => {
    const migration = readMigration("20260709140000_remove_controller_support.sql");

    expectSafeRemoval(migration, "controller_layouts");
    expect(migration).toMatch(/while user layout rows remain/i);
    expect(migration).toMatch(/drop trigger if exists controller_layouts_touch_updated_at/i);
    expect(migration).toMatch(
      /drop function if exists public\.touch_controller_layouts_updated_at\(\) restrict/i,
    );
  });

  it("refuses to discard populated price history or unknown dependants", () => {
    const migration = readMigration("20260708121000_drop_price_history.sql");

    expectSafeRemoval(migration, "price_history");
    expect(migration).toMatch(/while recorded price rows remain/i);
    expect(migration).toMatch(/drop policy if exists price_history_read_public/i);
  });

  it("refuses to discard mod data or unknown dependants", () => {
    const migration = readMigration("20260802120000_remove_mod_support.sql");

    for (const table of [
      "user_mod_install_files",
      "user_mod_profile_entries",
      "user_mod_installs",
      "mod_catalog_dependencies",
      "mod_catalog_files",
      "mod_catalog_versions",
      "mod_catalog_entries",
      "mod_provider_game_mappings",
      "mod_dependencies",
      "mod_files",
      "mod_versions",
      "mod_reviews",
      "mods",
      "mod_profiles",
    ]) {
      expectSafeRemoval(migration, table);
    }

    expect(migration).toMatch(/while mod rows remain/i);
    expect(migration).toMatch(/while mod storage objects remain/i);
    expect(migration).toMatch(/drop trigger if exists set_mod_catalog_entries_updated_at/i);
    expect(migration).toMatch(/drop trigger if exists set_user_mod_installs_updated_at/i);
    expect(migration).toMatch(/drop trigger if exists set_mod_provider_game_mappings_updated_at/i);
    expect(migration).toMatch(/drop policy if exists mods_read_public on public\.mods/i);
    expect(migration).toMatch(
      /drop policy if exists user_mod_installs_own_select on public\.user_mod_installs/i,
    );
  });

  it("preflights all remote/mobile tables and drops only known dependencies", () => {
    const migration = readMigration("20260708123000_remove_remote_mobile_companion.sql");

    for (const tableName of [
      "remote_install_jobs",
      "remote_companion_devices",
      "mobile_push_registrations",
    ]) {
      expectSafeRemoval(migration, tableName);
    }
    expect(migration).toMatch(/while user rows remain in %/i);
    expect(migration).toMatch(
      /dependency\.confrelid = any\(target_oids\)[\s\S]*not \(dependency\.conrelid = any\(target_oids\)\)/i,
    );
    expect(migration).toMatch(
      /drop trigger if exists enforce_remote_install_jobs_terminal_immutability/i,
    );
    expect(migration).toMatch(
      /drop function if exists public\.update_remote_install_job_status\([^)]+\) restrict/i,
    );
    expect(migration).toMatch(
      /drop function if exists public\.create_remote_companion_pairing\([^)]+\) restrict/i,
    );

    const childDrop = migration.indexOf("drop table if exists public.remote_install_jobs restrict");
    const parentDrop = migration.indexOf(
      "drop table if exists public.remote_companion_devices restrict",
    );
    expect(childDrop).toBeGreaterThanOrEqual(0);
    expect(parentDrop).toBeGreaterThan(childDrop);
  });
});
