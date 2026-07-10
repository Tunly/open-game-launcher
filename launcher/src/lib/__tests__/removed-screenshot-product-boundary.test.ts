// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(`../${path}`), "utf8");
}

describe("removed screenshot product boundary", () => {
  it("keeps active client models screenshot-free", () => {
    expect(read("launcher/src/lib/types.ts")).not.toMatch(
      /GameScreenshot|screenshotUrls|screenshots\?:/,
    );
    expect(read("launcher/src/lib/types/store.ts")).not.toMatch(/screenshots:/);
    expect(read("launcher/src/lib/supabase/store.ts")).not.toMatch(/\bscreenshots\b/);
    expect(read("launcher/src/pages/FriendsPage.tsx")).not.toMatch(
      /synced screenshots|gallery shots|\/ \d+ images/i,
    );
    expect(read("launcher/src/pages/CommunityPage.tsx")).not.toMatch(/controller notes/i);
  });

  it("keeps generated active schema types screenshot-free", () => {
    const types = read("launcher/src/lib/supabase/database.types.ts");
    expect(types).not.toMatch(/screenshot_likes:|\bscreenshots:\s*\{/);
    expect(types).not.toMatch(/screenshot_url:|screenshot_id:/);
  });
});
