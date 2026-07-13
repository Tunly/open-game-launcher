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
  created_at: "2026-07-11T18:00:00.000Z",
  created_by: "user-1",
  dm_pair_key: "friend-1:user-1",
  id: "room-1",
  name: null,
  type: "dm",
  updated_at: "2026-07-11T18:00:00.000Z",
};

function mockRoomRpc(
  data: Record<string, unknown> | null = roomRow,
  error: { code?: string; message: string } | null = null,
) {
  const single = vi.fn().mockResolvedValue({ data, error });
  mocks.rpc.mockReturnValue({ single });
  return single;
}

function mockMessageRead(data: Array<Record<string, unknown>> = []) {
  const eq = vi.fn();
  const is = vi.fn();
  const limit = vi.fn();
  const or = vi.fn();
  const order = vi.fn();
  const select = vi.fn();
  const query = { eq, is, limit, or, order, select };

  eq.mockReturnValue(query);
  is.mockReturnValue(query);
  limit.mockResolvedValue({ data, error: null });
  or.mockReturnValue(query);
  order.mockReturnValue(query);
  select.mockReturnValue(query);

  mocks.from.mockImplementation((table: string) => {
    if (table !== "chat_messages") {
      throw new Error(`Unexpected direct client table access: ${table}`);
    }
    return query;
  });

  return query;
}

function messageRow(id: string, createdAt: string, roomId = "room-1") {
  return {
    content: id,
    created_at: createdAt,
    deleted_at: null,
    id,
    room_id: roomId,
    sender_id: "friend-1",
    updated_at: createdAt,
  };
}

describe("social message access", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.from.mockReset();
    mocks.getUser.mockReset();
    mocks.rpc.mockReset();
  });

  it("uses the repairing RPC for an existing room and maps the returned room", async () => {
    const single = mockRoomRpc();
    const messageRead = mockMessageRead([
      {
        content: "Still here",
        created_at: "2026-07-11T18:01:00.000Z",
        deleted_at: null,
        id: "message-1",
        room_id: "room-1",
        sender_id: "friend-1",
        updated_at: "2026-07-11T18:01:00.000Z",
      },
    ]);

    const { getDirectThread } = await import("../social");
    const result = await getDirectThread("friend-1");

    expect(mocks.rpc).toHaveBeenCalledWith("ensure_direct_room", {
      friend_id_input: "friend-1",
    });
    expect(single).toHaveBeenCalledOnce();
    expect(mocks.from).toHaveBeenCalledOnce();
    expect(mocks.from).toHaveBeenCalledWith("chat_messages");
    expect(messageRead.eq).toHaveBeenCalledWith("room_id", "room-1");
    expect(result).toEqual({
      messages: [
        {
          content: "Still here",
          createdAt: "2026-07-11T18:01:00.000Z",
          deletedAt: null,
          id: "message-1",
          roomId: "room-1",
          senderId: "friend-1",
          updatedAt: "2026-07-11T18:01:00.000Z",
        },
      ],
      room: {
        createdAt: "2026-07-11T18:00:00.000Z",
        createdBy: "user-1",
        id: "room-1",
        name: null,
        type: "dm",
        updatedAt: "2026-07-11T18:00:00.000Z",
      },
    });
  });

  it("routes concurrent idempotent ensures through the transactional RPC", async () => {
    const single = mockRoomRpc();
    mockMessageRead();

    const { getDirectThread } = await import("../social");
    const [first, second] = await Promise.all([
      getDirectThread("friend-1"),
      getDirectThread("friend-1"),
    ]);

    expect(single).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "ensure_direct_room", {
      friend_id_input: "friend-1",
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "ensure_direct_room", {
      friend_id_input: "friend-1",
    });
    expect(first.room.id).toBe("room-1");
    expect(second.room.id).toBe("room-1");
    expect(mocks.from).toHaveBeenCalledTimes(2);
    expect(mocks.from.mock.calls.every(([table]) => table === "chat_messages")).toBe(true);
  });

  it("propagates RPC errors before reading or writing chat tables", async () => {
    mockRoomRpc(null, {
      code: "42501",
      message: "Direct messages require an accepted friendship",
    });

    const { getDirectThread } = await import("../social");

    await expect(getDirectThread("stranger-1")).rejects.toThrow(
      "Direct messages require an accepted friendship",
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("fetches the newest direct-message page and returns it chronologically", async () => {
    mockRoomRpc();
    const messageRead = mockMessageRead([
      messageRow("message-3", "2026-07-11T18:03:00.000Z"),
      messageRow("message-2b", "2026-07-11T18:02:00.000Z"),
      messageRow("message-2a", "2026-07-11T18:02:00.000Z"),
    ]);

    const { getDirectThread } = await import("../social");
    const result = await getDirectThread("friend-1");

    expect(messageRead.order).toHaveBeenNthCalledWith(1, "created_at", {
      ascending: false,
    });
    expect(messageRead.order).toHaveBeenNthCalledWith(2, "id", { ascending: false });
    expect(messageRead.limit).toHaveBeenCalledWith(80);
    expect(result.messages.map((message) => message.id)).toEqual([
      "message-2a",
      "message-2b",
      "message-3",
    ]);
  });

  it("fetches the newest group page before a cursor and returns it chronologically", async () => {
    const before = {
      createdAt: "2026-07-11T18:10:00.000Z",
      id: "message-10",
    };
    const messageRead = mockMessageRead([
      messageRow("message-9", "2026-07-11T18:09:00.000Z", "group-1"),
      messageRow("message-8", "2026-07-11T18:08:00.000Z", "group-1"),
    ]);

    const { getGroupMessages } = await import("../social");
    const result = await getGroupMessages("group-1", 2, before);

    expect(messageRead.order).toHaveBeenNthCalledWith(1, "created_at", {
      ascending: false,
    });
    expect(messageRead.order).toHaveBeenNthCalledWith(2, "id", { ascending: false });
    expect(messageRead.or).toHaveBeenCalledWith(
      "created_at.lt.2026-07-11T18:10:00.000Z,and(created_at.eq.2026-07-11T18:10:00.000Z,id.lt.message-10)",
    );
    expect(messageRead.limit).toHaveBeenCalledWith(2);
    expect(messageRead.or.mock.invocationCallOrder[0]).toBeLessThan(
      messageRead.limit.mock.invocationCallOrder[0],
    );
    expect(result.map((message) => message.id)).toEqual(["message-8", "message-9"]);
  });
});
