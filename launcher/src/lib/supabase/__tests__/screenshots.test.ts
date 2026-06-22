import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const authGetUser = vi.fn();
  const from = vi.fn();
  const getSupabaseClient = vi.fn();
  const getPublicUrl = vi.fn();
  const createSignedUrl = vi.fn();
  const rpc = vi.fn();
  const storageFrom = vi.fn();
  const upload = vi.fn();
  return {
    authGetUser,
    createSignedUrl,
    from,
    getPublicUrl,
    getSupabaseClient,
    rpc,
    storageFrom,
    upload,
  };
});

vi.mock("../client", () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}));

describe("screenshot supabase helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.authGetUser.mockReset();
    mocks.createSignedUrl.mockReset();
    mocks.from.mockReset();
    mocks.getPublicUrl.mockReset();
    mocks.getSupabaseClient.mockReset();
    mocks.rpc.mockReset();
    mocks.storageFrom.mockReset();
    mocks.upload.mockReset();

    mocks.authGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.getSupabaseClient.mockReturnValue({
      auth: { getUser: mocks.authGetUser },
      from: mocks.from,
      rpc: mocks.rpc,
      storage: { from: mocks.storageFrom },
    });
    mocks.storageFrom.mockReturnValue({
      createSignedUrl: mocks.createSignedUrl,
      getPublicUrl: mocks.getPublicUrl,
      upload: mocks.upload,
    });
    mocks.createSignedUrl.mockImplementation((path: string) =>
      Promise.resolve({ data: { signedUrl: `https://signed.example/${path}` }, error: null }),
    );
    mocks.getPublicUrl.mockImplementation((path: string) => ({
      data: { publicUrl: `https://cdn.example/${path}` },
    }));
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "function not found in schema cache" },
    });
  });

  it("returns an empty list when Supabase is not configured", async () => {
    mocks.getSupabaseClient.mockImplementation(() => {
      throw new Error("Missing Supabase config");
    });

    const { getMyScreenshots } = await import("../screenshots");
    await expect(getMyScreenshots()).resolves.toEqual([]);
  });

  it("lists screenshots for non-uuid game ids by storage path", async () => {
    const chain = makeScreenshotListChain([
      {
        id: "shot-1",
        user_id: "user-1",
        game_id: null,
        storage_path: "user-1/games/steam-game/cap.png",
        thumbnail_path: null,
        caption: "Cap",
        width: null,
        height: null,
        size_bytes: 10,
        is_public: false,
        created_at: "2026-06-10T10:00:00.000Z",
      },
      {
        id: "shot-2",
        user_id: "user-1",
        game_id: null,
        storage_path: "user-1/games/other/cap.png",
        thumbnail_path: null,
        caption: "Other",
        width: null,
        height: null,
        size_bytes: 10,
        is_public: false,
        created_at: "2026-06-10T10:00:00.000Z",
      },
    ]);
    mocks.from.mockReturnValue(chain);

    const { getMyScreenshotsForGame } = await import("../screenshots");
    const shots = await getMyScreenshotsForGame("steam-game");

    expect(chain.in).not.toHaveBeenCalled();
    expect(shots.map((shot) => shot.id)).toEqual(["shot-1"]);
    expect(shots[0].publicUrl).toBe("https://signed.example/user-1/games/steam-game/cap.png");
    expect(mocks.createSignedUrl).toHaveBeenCalledWith("user-1/games/steam-game/cap.png", 3600);
  });

  it("falls back to public storage URLs for older screenshot buckets", async () => {
    mocks.createSignedUrl.mockResolvedValue({
      data: null,
      error: { message: "signed urls unavailable" },
    });
    mocks.from.mockReturnValue(
      makeScreenshotListChain([
        {
          id: "shot-1",
          user_id: "user-1",
          game_id: null,
          storage_path: "user-1/games/steam-game/cap.png",
          thumbnail_path: null,
          caption: "Cap",
          width: null,
          height: null,
          size_bytes: 10,
          is_public: true,
          created_at: "2026-06-10T10:00:00.000Z",
        },
      ]),
    );

    const { getMyScreenshotsForGame } = await import("../screenshots");
    const shots = await getMyScreenshotsForGame("steam-game");

    expect(shots[0].publicUrl).toBe("https://cdn.example/user-1/games/steam-game/cap.png");
  });

  it("lists ranked public screenshot feed rows through the moderation RPC first", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          id: "shot-ranked",
          user_id: "user-1",
          game_id: null,
          storage_path: "user-1/games/steam-game/ranked.png",
          thumbnail_path: null,
          caption: "Ranked capture",
          width: null,
          height: null,
          size_bytes: 10,
          is_public: true,
          created_at: "2026-06-10T11:00:00.000Z",
          like_count: 22,
          moderation_status: "approved",
          report_count: 0,
        },
      ],
      error: null,
    });

    const { listPublicScreenshotFeedScreenshots } = await import("../screenshots");
    const result = await listPublicScreenshotFeedScreenshots({ limit: 99 });

    expect(result.ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("list_public_screenshot_feed_ranked", {
      p_limit: 48,
    });
    expect(mocks.from).not.toHaveBeenCalledWith("screenshots");
    expect(mocks.createSignedUrl).toHaveBeenCalledWith("user-1/games/steam-game/ranked.png", 3600);
    if (!result.ok) return;
    expect(result.value.map((shot) => shot.id)).toEqual(["shot-ranked"]);
  });

  it("falls back to table rows with signed display URLs when ranked RPC is unavailable", async () => {
    const chain = makePublicFeedChain([
      {
        id: "shot-1",
        user_id: "user-1",
        game_id: null,
        storage_path: "user-1/games/steam-game/public.png",
        thumbnail_path: null,
        caption: "Public capture",
        width: null,
        height: null,
        size_bytes: 10,
        is_public: true,
        created_at: "2026-06-10T10:00:00.000Z",
      },
      {
        id: "shot-private",
        user_id: "user-1",
        game_id: null,
        storage_path: "user-1/games/steam-game/private.png",
        thumbnail_path: null,
        caption: "Private capture",
        width: null,
        height: null,
        size_bytes: 10,
        is_public: false,
        created_at: "2026-06-10T09:00:00.000Z",
      },
    ]);
    mocks.from.mockReturnValue(chain);

    const { listPublicScreenshotFeedScreenshots } = await import("../screenshots");
    const result = await listPublicScreenshotFeedScreenshots({ limit: 99 });

    expect(result.ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("list_public_screenshot_feed_ranked", {
      p_limit: 48,
    });
    expect(chain.eq).toHaveBeenCalledWith("is_public", true);
    expect(chain.eq).toHaveBeenCalledWith("moderation_status", "approved");
    expect(chain.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(chain.limit).toHaveBeenCalledWith(48);
    expect(mocks.createSignedUrl).toHaveBeenCalledTimes(1);
    expect(mocks.createSignedUrl).toHaveBeenCalledWith("user-1/games/steam-game/public.png", 3600);
    if (!result.ok) return;
    expect(result.value.map((shot) => shot.id)).toEqual(["shot-1"]);
    expect(result.value[0].publicUrl).toBe(
      "https://signed.example/user-1/games/steam-game/public.png",
    );
  });

  it("returns a schema fallback when public screenshot feed metadata is unavailable", async () => {
    mocks.from.mockReturnValue(
      makePublicFeedChain([], { code: "42P01", message: "relation does not exist" }),
    );

    const { listPublicScreenshotFeedScreenshots } = await import("../screenshots");
    const result = await listPublicScreenshotFeedScreenshots();

    expect(result).toEqual({
      ok: false,
      reason: "schema",
      message: "Public screenshot feed schema is not applied yet.",
    });
  });

  it("uploads screenshot storage and writes private metadata", async () => {
    mocks.upload.mockResolvedValue({ error: null });
    const insertChain = makeScreenshotInsertChain({
      id: "shot-1",
      user_id: "user-1",
      game_id: null,
      storage_path: "user-1/games/steam-game/cap.png",
      thumbnail_path: null,
      caption: "cap.png",
      width: null,
      height: null,
      size_bytes: 4,
      is_public: false,
      created_at: "2026-06-10T10:00:00.000Z",
    });
    mocks.from.mockReturnValue(insertChain);

    const { uploadScreenshotForGame } = await import("../screenshots");
    const result = await uploadScreenshotForGame({
      file: new File(["test"], "cap.png", { type: "image/png" }),
      gameId: "steam-game",
    });

    expect(result.ok).toBe(true);
    expect(mocks.storageFrom).toHaveBeenCalledWith("screenshots");
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.stringContaining("user-1/games/steam-game/"),
      expect.any(File),
      expect.objectContaining({ upsert: false }),
    );
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        game_id: null,
        is_public: false,
        size_bytes: 4,
        user_id: "user-1",
      }),
    );
  });

  it("maps screenshot like counts and current user state", async () => {
    const likeChain = makeLikeSelectChain([
      { screenshot_id: "shot-1", user_id: "user-1" },
      { screenshot_id: "shot-1", user_id: "user-2" },
    ]);
    mocks.from.mockReturnValue({ select: vi.fn(() => likeChain) });

    const { getScreenshotLikeState } = await import("../screenshots");
    const result = await getScreenshotLikeState(["shot-1", "shot-2"]);

    expect(result.available).toBe(true);
    expect(result.canLike).toBe(true);
    expect(result.likes["shot-1"]).toEqual({ count: 2, likedByMe: true });
    expect(result.likes["shot-2"]).toEqual({ count: 0, likedByMe: false });
  });

  it("marks likes unavailable when the likes schema is absent", async () => {
    const likeChain = makeLikeSelectChain([], {
      code: "42P01",
      message: "relation does not exist",
    });
    mocks.from.mockReturnValue({ select: vi.fn(() => likeChain) });

    const { getScreenshotLikeState } = await import("../screenshots");
    const result = await getScreenshotLikeState(["shot-1"]);

    expect(result.available).toBe(false);
    expect(result.canLike).toBe(false);
    expect(result.likes["shot-1"]).toEqual({ count: 0, likedByMe: false });
  });

  it("inserts a screenshot like and returns refreshed like state", async () => {
    const insert = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const likeChain = makeLikeSelectChain([{ screenshot_id: "shot-1", user_id: "user-1" }]);
    const select = vi.fn(() => likeChain);
    mocks.from.mockReturnValueOnce({ insert }).mockReturnValueOnce({ select });

    const { setScreenshotLiked } = await import("../screenshots");
    const result = await setScreenshotLiked("shot-1", true);

    expect(insert).toHaveBeenCalledWith({ screenshot_id: "shot-1", user_id: "user-1" });
    expect(select).toHaveBeenCalledWith("screenshot_id,user_id");
    expect(likeChain.in).toHaveBeenCalledWith("screenshot_id", ["shot-1"]);
    expect(result).toEqual({
      ok: true,
      value: { count: 1, likedByMe: true },
    });
  });

  it("deletes a screenshot like and returns refreshed like state", async () => {
    const deleteChain = makeLikeDeleteChain();
    const deleteLike = vi.fn(() => deleteChain);
    const likeChain = makeLikeSelectChain([]);
    mocks.from
      .mockReturnValueOnce({ delete: deleteLike })
      .mockReturnValueOnce({ select: vi.fn(() => likeChain) });

    const { setScreenshotLiked } = await import("../screenshots");
    const result = await setScreenshotLiked("shot-1", false);

    expect(deleteLike).toHaveBeenCalled();
    expect(deleteChain.eq).toHaveBeenCalledWith("screenshot_id", "shot-1");
    expect(deleteChain.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(result).toEqual({
      ok: true,
      value: { count: 0, likedByMe: false },
    });
  });
});

function makeScreenshotListChain(rows: unknown[]) {
  const chain = {
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => Promise.resolve({ data: rows, error: null })),
    select: vi.fn(() => chain),
  };
  return chain;
}

function makePublicFeedChain(
  rows: unknown[],
  error: { code?: string; message?: string } | null = null,
) {
  const chain = {
    eq: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve({ data: rows, error })),
    order: vi.fn(() => chain),
    select: vi.fn(() => chain),
  };
  return chain;
}

function makeScreenshotInsertChain(row: unknown) {
  const maybeSingle = vi.fn(() => Promise.resolve({ data: row, error: null }));
  const select = vi.fn(() => ({ maybeSingle }));
  return {
    insert: vi.fn(() => ({ select })),
  };
}

function makeLikeSelectChain(
  rows: unknown[],
  error: { code?: string; message?: string } | null = null,
) {
  const chain = {
    in: vi.fn(() => Promise.resolve({ data: rows, error })),
  };
  return chain;
}

function makeLikeDeleteChain(error: { code?: string; message?: string } | null = null) {
  const chain = {
    error,
    eq: vi.fn(() => chain),
  };
  return chain;
}
