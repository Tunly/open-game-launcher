import {
  assertEquals,
  assertMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const migration = await Deno.readTextFile(
  new URL(
    "../../migrations/20260711195000_make_submitted_artwork_immutable.sql",
    import.meta.url,
  ),
);

Deno.test("submitted community artwork objects are immutable to uploaders", () => {
  assertMatch(
    migration,
    /create policy community_artwork_storage_update_unsubmitted_own_folder[\s\S]*?for update[\s\S]*?not exists[\s\S]*?community_artwork_items[\s\S]*?item\.storage_path = name/i,
  );
  assertMatch(
    migration,
    /create policy community_artwork_storage_delete_unsubmitted_own_folder[\s\S]*?for delete[\s\S]*?not exists[\s\S]*?community_artwork_items[\s\S]*?item\.storage_path = name/i,
  );
  assertEquals((migration.match(/not exists \(/gi) ?? []).length, 3);
});
