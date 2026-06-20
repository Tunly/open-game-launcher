import { describe, expect, it } from "vitest";

import { getGameAssetUrl } from "../assets";

describe("getGameAssetUrl", () => {
  it("keeps public artwork paths browser-safe", () => {
    expect(getGameAssetUrl("/artwork/demo-cover.svg")).toBe("/artwork/demo-cover.svg");
  });

  it("keeps remote and data image URLs unchanged", () => {
    expect(getGameAssetUrl("https://cdn.example/cover.jpg")).toBe("https://cdn.example/cover.jpg");
    expect(getGameAssetUrl("data:image/png;base64,abc")).toBe("data:image/png;base64,abc");
  });
});
