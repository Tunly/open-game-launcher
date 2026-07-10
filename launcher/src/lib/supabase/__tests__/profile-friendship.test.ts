import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSessionUserId: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("../client", () => ({
  getCurrentSessionUserId: mocks.getCurrentSessionUserId,
  getSupabaseClient: () => ({ rpc: mocks.rpc }),
}));

import { isCurrentUserFriendWith } from "../profile/friendship";

describe("profile friendship viewer context", () => {
  beforeEach(() => {
    mocks.getCurrentSessionUserId.mockReset();
    mocks.rpc.mockReset();
    mocks.getCurrentSessionUserId.mockResolvedValue("viewer-1");
  });

  it("asks the caller-scoped RPC about the viewed profile", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });

    await expect(isCurrentUserFriendWith("profile-2")).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("is_current_user_friend", {
      profile_user_id: "profile-2",
    });
  });

  it("fails closed when the friendship RPC is not deployed", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Function is missing from the schema cache" },
    });

    await expect(isCurrentUserFriendWith("profile-2")).resolves.toBe(false);
  });

  it("does not query friendship for anonymous or owner views", async () => {
    mocks.getCurrentSessionUserId.mockResolvedValueOnce(null);
    await expect(isCurrentUserFriendWith("profile-2")).resolves.toBe(false);

    mocks.getCurrentSessionUserId.mockResolvedValueOnce("profile-2");
    await expect(isCurrentUserFriendWith("profile-2")).resolves.toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
