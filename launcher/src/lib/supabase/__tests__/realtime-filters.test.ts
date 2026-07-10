import { describe, expect, it } from "vitest";

import { buildRealtimeInFilters } from "../realtime-filters";

describe("Realtime filters", () => {
  it("deduplicates values and keeps unsafe filter syntax out", () => {
    expect(
      buildRealtimeInFilters("user_id", ["user-1", "user-1", "bad,value", " user-2 "]),
    ).toEqual(["user_id=in.(user-1,user-2)"]);
  });

  it("chunks filters at Supabase Realtime's 100-value limit", () => {
    const filters = buildRealtimeInFilters(
      "user_id",
      Array.from({ length: 205 }, (_, index) => `user-${index}`),
    );

    expect(filters).toHaveLength(3);
    expect(filters[0]?.split(",")).toHaveLength(100);
    expect(filters[2]?.split(",")).toHaveLength(5);
  });
});
