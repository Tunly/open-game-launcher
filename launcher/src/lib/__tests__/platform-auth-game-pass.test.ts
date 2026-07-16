import { invoke, isTauri } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchGamePassCatalog } from "../launcher/platform-auth";

describe("fetchGamePassCatalog", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue([]);
    vi.mocked(isTauri).mockReturnValue(true);
  });

  it("passes the browser language and market to the native catalog command", async () => {
    await fetchGamePassCatalog();

    expect(invoke).toHaveBeenCalledWith("fetch_game_pass_catalog", {
      language: navigator.language,
      market: expect.stringMatching(/^[A-Z]{2}$/),
    });
  });
});
