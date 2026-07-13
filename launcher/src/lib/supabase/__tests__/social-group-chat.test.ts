import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("../client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: mocks.getUser,
    },
    from: mocks.from,
    rpc: mocks.rpc,
  }),
  supabase: null,
}));

const roomRow = {
  created_at: "2026-07-12T08:00:00.000Z",
  created_by: "user-1",
  id: "group-room-1",
  name: "Raid Team",
  type: "group",
  updated_at: "2026-07-12T08:00:00.000Z",
};

function mockRoomRead() {
  const single = vi.fn().mockResolvedValue({ data: roomRow, error: null });
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  mocks.from.mockImplementation((table: string) => {
    if (table !== "chat_rooms") {
      throw new Error(`Unexpected group-chat table access: ${table}`);
    }
    return { select };
  });
  return { eq, select, single };
}

describe("social group-chat creation", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.from.mockReset();
    mocks.getUser.mockReset();
    mocks.rpc.mockReset();
  });

  it("uses the atomic group-room RPC and reads the committed room", async () => {
    mocks.rpc.mockResolvedValue({ data: "group-room-1", error: null });
    const roomRead = mockRoomRead();

    const { createGroupChat } = await import("../social");
    const room = await createGroupChat("  Raid Team  ", ["friend-2", "friend-2", "friend-1"]);

    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("create_group_room", {
      member_ids_input: ["friend-2", "friend-2", "friend-1"],
      title_input: "  Raid Team  ",
    });
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.from).toHaveBeenCalledOnce();
    expect(mocks.from).toHaveBeenCalledWith("chat_rooms");
    expect(roomRead.select).toHaveBeenCalledWith("*");
    expect(roomRead.eq).toHaveBeenCalledWith("id", "group-room-1");
    expect(roomRead.single).toHaveBeenCalledOnce();
    expect(room).toEqual({
      createdAt: "2026-07-12T08:00:00.000Z",
      createdBy: "user-1",
      id: "group-room-1",
      name: "Raid Team",
      type: "group",
      updatedAt: "2026-07-12T08:00:00.000Z",
    });
  });

  it("stops before table access when the RPC rejects validation", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Every invited group member must be an accepted friend" },
    });

    const { createGroupChat } = await import("../social");

    await expect(createGroupChat("Raid Team", ["stranger-1"])).rejects.toThrow(
      "Every invited group member must be an accepted friend",
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("fails closed when the RPC does not return a room ID", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    const { createGroupChat } = await import("../social");

    await expect(createGroupChat("Raid Team", ["friend-1"])).rejects.toThrow(
      "The group-chat room ID was not returned.",
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("adds members only through the authenticated group-member RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    const { addGroupMember } = await import("../social");
    await addGroupMember("group-room-1", "friend-3");

    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("add_group_room_member", {
      member_id_input: "friend-3",
      room_id_input: "group-room-1",
    });
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("propagates group-member RPC authorization errors without direct inserts", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Group rooms cannot include users who block one another" },
    });

    const { addGroupMember } = await import("../social");

    await expect(addGroupMember("group-room-1", "blocked-user")).rejects.toThrow(
      "Group rooms cannot include users who block one another",
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
