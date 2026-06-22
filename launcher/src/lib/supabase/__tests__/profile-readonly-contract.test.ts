// @vitest-environment node

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const profileSource = readFileSync(new URL("../profile.ts", import.meta.url), "utf8");

const trustedProgressionTables = [
  "achievement_progress",
  "user_achievements",
  "user_badges",
  "user_game_stats",
  "user_library",
];

function tableSegments(tableName: string) {
  return profileSource
    .split(`.from("${tableName}")`)
    .slice(1)
    .map((segment) => segment.split(".from(")[0] ?? "");
}

describe("profile Supabase trusted progression contract", () => {
  it("keeps badge and achievement progression tables read-only in the profile client", () => {
    for (const tableName of trustedProgressionTables) {
      for (const segment of tableSegments(tableName)) {
        expect(segment).toContain(".select(");
        expect(segment).not.toMatch(/\.(?:delete|insert|update|upsert)\(/);
      }
    }
  });

  it("does not keep the old direct-write production TODO after trusted ingestion", () => {
    expect(profileSource).not.toContain(
      "TODO: Move writes for badges, XP, entitlements, playtime, and achievements",
    );
  });
});
