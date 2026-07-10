import { describe, expect, it, vi } from "vitest";

import { replaceSocialLinksAtomically } from "../profile/social-link-replacement";

function socialLinkRow(overrides: Record<string, unknown> = {}) {
  return {
    created_at: "2026-07-09T12:00:00.000Z",
    id: "5e3b8940-0ab2-4cd8-b2d5-1fd2b564aeb3",
    label: "Steam",
    platform: "steam",
    sort_order: 0,
    updated_at: "2026-07-09T12:00:00.000Z",
    url: "https://steamcommunity.com/id/og-player",
    user_id: "9aed826f-cad6-4ec7-884a-ce3a14226968",
    visibility: "friends_only",
    ...overrides,
  };
}

describe("atomic social-link replacement", () => {
  it("sends the complete replacement set through one RPC call", async () => {
    const row = socialLinkRow();
    const rpc = vi.fn().mockResolvedValue({ data: [row], error: null });

    await expect(
      replaceSocialLinksAtomically({ rpc }, [
        {
          label: "Steam",
          platform: "steam",
          url: "https://steamcommunity.com/id/og-player",
          visibility: "friends_only",
        },
      ]),
    ).resolves.toEqual([row]);

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("replace_my_social_links", {
      links_input: [
        {
          label: "Steam",
          platform: "steam",
          sort_order: 0,
          url: "https://steamcommunity.com/id/og-player",
          visibility: "friends_only",
        },
      ],
    });
  });

  it("uses the atomic RPC for an empty replacement instead of deleting client-side", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });

    await expect(replaceSocialLinksAtomically({ rpc }, [])).resolves.toEqual([]);
    expect(rpc).toHaveBeenCalledWith("replace_my_social_links", { links_input: [] });
  });

  it("fails closed when the RPC is missing and leaves existing links untouched", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function in the schema cache" },
    });

    await expect(
      replaceSocialLinksAtomically({ rpc }, [
        { platform: "steam", url: "https://steamcommunity.com/id/og-player" },
      ]),
    ).rejects.toThrow("Existing social links were left unchanged");

    expect(rpc).toHaveBeenCalledOnce();
  });
});
