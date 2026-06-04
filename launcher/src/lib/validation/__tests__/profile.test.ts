import { describe, expect, it } from "vitest";
import {
  commentSchema,
  createShowcaseSchema,
  hardwareSchema,
  socialLinksSchema,
  updatePrivacySchema,
  updateProfileSchema,
  updateShowcaseSchema,
  usernameSchema,
} from "../profile";

describe("usernameSchema", () => {
  it("accepts a valid username", () => {
    const result = usernameSchema.safeParse("Player_One.123");
    expect(result.success).toBe(true);
  });

  it("rejects usernames shorter than 3 chars", () => {
    const result = usernameSchema.safeParse("ab");
    expect(result.success).toBe(false);
  });

  it("rejects usernames longer than 32 chars", () => {
    const result = usernameSchema.safeParse("a".repeat(33));
    expect(result.success).toBe(false);
  });

  it("rejects forbidden characters", () => {
    expect(usernameSchema.safeParse("with space").success).toBe(false);
    expect(usernameSchema.safeParse("with/slash").success).toBe(false);
    expect(usernameSchema.safeParse("with@at").success).toBe(false);
  });
});

describe("updateProfileSchema", () => {
  it("accepts an empty object", () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a full update", () => {
    const result = updateProfileSchema.safeParse({
      username: "valid_name",
      displayName: "My Display",
      bio: "Hello",
      countryCode: "DE",
      language: "en",
      featuredGameId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid urls", () => {
    expect(updateProfileSchema.safeParse({ avatarUrl: "not-a-url" }).success).toBe(false);
  });

  it("rejects country codes that are not exactly 2 chars", () => {
    expect(updateProfileSchema.safeParse({ countryCode: "DE" }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ countryCode: "DEU" }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ countryCode: "D" }).success).toBe(false);
  });
});

describe("updatePrivacySchema", () => {
  it("accepts all visibility levels", () => {
    const levels = ["public", "friends_only", "private"];
    for (const level of levels) {
      const payload = {
        profileVisibility: level,
        onlineStatusVisibility: level,
        gameActivityVisibility: level,
        achievementVisibility: level,
        libraryVisibility: level,
        wishlistVisibility: level,
        commentsVisibility: level,
      };
      expect(updatePrivacySchema.safeParse(payload).success).toBe(true);
    }
  });

  it("rejects unknown visibility levels", () => {
    const payload = {
      profileVisibility: "open",
      onlineStatusVisibility: "public",
      gameActivityVisibility: "public",
      achievementVisibility: "public",
      libraryVisibility: "public",
      wishlistVisibility: "public",
      commentsVisibility: "public",
    };
    expect(updatePrivacySchema.safeParse(payload).success).toBe(false);
  });
});

describe("createShowcaseSchema / updateShowcaseSchema", () => {
  it("accepts each known showcase type on create", () => {
    const types = [
      "about",
      "favorite_games",
      "rare_achievements",
      "stats",
      "wishlist",
      "hardware_setup",
      "custom_text",
    ];
    for (const type of types) {
      expect(createShowcaseSchema.safeParse({ type }).success).toBe(true);
    }
  });

  it("rejects unknown showcase types", () => {
    expect(createShowcaseSchema.safeParse({ type: "invalid" }).success).toBe(false);
  });

  it("truncates titles longer than 80 chars", () => {
    const result = createShowcaseSchema.safeParse({
      type: "custom_text",
      title: "a".repeat(81),
    });
    expect(result.success).toBe(false);
  });

  it("updateShowcaseSchema accepts a partial payload", () => {
    expect(updateShowcaseSchema.safeParse({ title: "Just a title" }).success).toBe(true);
  });
});

describe("commentSchema", () => {
  it("requires a non-empty body", () => {
    expect(commentSchema.safeParse({ body: "" }).success).toBe(false);
    expect(commentSchema.safeParse({ body: "  " }).success).toBe(false);
  });

  it("rejects bodies longer than 1000 chars", () => {
    expect(commentSchema.safeParse({ body: "a".repeat(1001) }).success).toBe(false);
  });

  it("trims leading/trailing whitespace from bodies", () => {
    const result = commentSchema.safeParse({ body: "  hi  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.body).toBe("hi");
    }
  });
});

describe("socialLinksSchema", () => {
  it("accepts a list of valid links", () => {
    const result = socialLinksSchema.safeParse([
      { platform: "twitter", url: "https://twitter.com/example" },
      { platform: "discord", label: "DC", url: "https://discord.gg/abc" },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects non-url values", () => {
    const result = socialLinksSchema.safeParse([{ platform: "twitter", url: "not-a-url" }]);
    expect(result.success).toBe(false);
  });

  it("rejects empty platforms", () => {
    const result = socialLinksSchema.safeParse([{ platform: "", url: "https://example.com" }]);
    expect(result.success).toBe(false);
  });
});

describe("hardwareSchema", () => {
  it("accepts an empty object (all fields optional)", () => {
    expect(hardwareSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a full payload", () => {
    const result = hardwareSchema.safeParse({
      cpu: "AMD Ryzen 7 5800X",
      gpu: "RTX 4070",
      ram: "32GB DDR4",
      monitor: "LG 27GP950",
      keyboard: "Keychron K2",
      mouse: "Logitech G Pro",
      headset: "HyperX Cloud II",
      controller: "Xbox Elite v2",
      setupImageUrl: "https://example.com/setup.jpg",
      visibility: "public",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid setup image urls", () => {
    expect(hardwareSchema.safeParse({ setupImageUrl: "nope" }).success).toBe(false);
  });

  it("rejects fields longer than 120 chars", () => {
    expect(hardwareSchema.safeParse({ cpu: "x".repeat(121) }).success).toBe(false);
  });
});
