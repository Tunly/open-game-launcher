import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "..", "supabase", "migrations", "20260714160000_mod_provider_rework.sql"),
  "utf8",
);
const redactionMigration = readFileSync(
  resolve(
    process.cwd(),
    "..",
    "supabase",
    "migrations",
    "20260714180000_redact_active_mod_install_state.sql",
  ),
  "utf8",
);

describe("simplified mod provider migration", () => {
  it("activates Nexus and Steam without deleting historical provider rows", () => {
    expect(migration).toContain("'nexus'");
    expect(migration).toContain("'steam_workshop'");
    expect(migration).not.toContain("'modio'");
    expect(migration).not.toContain("'curseforge'");
    expect(migration.match(/\)\s*not valid;/gi)).toHaveLength(2);
    expect(migration).not.toMatch(
      /delete\s+from\s+public\.(?:mod_catalog_entries|user_mod_installs)/i,
    );
  });

  it("replaces both provider constraints explicitly", () => {
    expect(migration).toContain("mod_catalog_entries_provider_check");
    expect(migration).toContain("user_mod_installs_provider_check");
  });

  it("redacts existing active-provider rows without deleting legacy provider state", () => {
    expect(redactionMigration).toMatch(/provider\s+in\s*\(\s*'nexus'\s*,\s*'steam_workshop'\s*\)/i);
    for (const column of ["install_path", "last_error", "source_url", "target_dir"]) {
      expect(redactionMigration).toMatch(new RegExp(`${column}\\s*=\\s*null`, "i"));
    }
    expect(redactionMigration).toMatch(/manifest\s*=\s*jsonb_build_object/i);
    expect(redactionMigration).toMatch(/delete\s+from\s+public\.user_mod_install_files/i);
    expect(redactionMigration).not.toMatch(
      /delete\s+from\s+public\.(?:mod_catalog_entries|user_mod_installs)/i,
    );
  });
});
