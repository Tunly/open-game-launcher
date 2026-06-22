import { describe, expect, it } from "vitest";

import {
  buildBroadcastChatModerationShadowQueue,
  createVerifyBroadcastChatModerationShadowQueue,
} from "../broadcast-chat-moderation-shadow";

const falseHostedModerationClaim =
  /\b(?:(?:twitch|youtube|provider)\s*(?:chat|oauth|moderation)\s*(?:connected|ready|verified|enabled|synced|complete)|hosted\s*moderation\s*(?:ready|verified|enabled|complete)|(?:timeout|ban|delete)\s*(?:sent|executed|applied)|supabase\s*moderation\s*logs?\s*(?:written|synced|ready)|live\s*chat\s*replay\s*(?:ready|connected|synced)|rtmp(?:\/live|\s+live)?\s*output\s*(?:ready|started|enabled)|audience\s*status\s*(?:ready|updated|online))\b/i;

describe("buildBroadcastChatModerationShadowQueue", () => {
  it("builds a local chat moderation queue without hosted enforcement claims", () => {
    const queue = createVerifyBroadcastChatModerationShadowQueue();

    expect(queue.statusLabel).toBe("Local shadow review");
    expect(queue.allowCount).toBe(1);
    expect(queue.reviewCount).toBe(2);
    expect(queue.blockCount).toBe(1);
    expect(queue.summary).toContain("3/4 local chat fixtures");
    expect(queue.guards).toContain("No provider chat read");
    expect(queue.guards).toContain("No Twitch/YouTube OAuth");
    expect(queue.guards).toContain("No hosted enforcement");
    expect(queue.guards).toContain("No moderation action sent");
    expect(queue.guards).toContain("No Supabase moderation logs");
    expect(queue.guards).toContain("No live chat replay");
    expect(queue.guardCopy).toContain("start RTMP/live output");
    expect(queue.guardCopy).toContain("sync VOD");
    expect(queue.guardCopy).toContain("update audience/live status");
    expect(JSON.stringify(queue)).not.toMatch(falseHostedModerationClaim);
  });

  it("redacts unsafe preview text before adding queue items", () => {
    const queue = createVerifyBroadcastChatModerationShadowQueue();
    const previews = queue.queue.map((item) => item.messagePreview).join(" ");

    expect(previews).toContain("[link-redacted]");
    expect(previews).toContain("[secret-redacted]");
    expect(previews).not.toContain("https://spam.example");
    expect(previews).not.toContain("stream key");
    expect(previews).not.toContain("live_123456789_abcdef");
  });

  it("uses the same secret shape for rule hits and preview redaction", () => {
    const queue = buildBroadcastChatModerationShadowQueue([
      {
        authorHandle: "KeyDrop",
        channel: "local-fixture",
        id: "stream-key-drop",
        message: "stream key abc123 should rotate",
        timestamp: "2026-06-10T19:04:00.000Z",
      },
      {
        authorHandle: "SecretDrop",
        channel: "local-fixture",
        id: "secret-drop",
        message: "secret xyz789 posted",
        timestamp: "2026-06-10T19:05:00.000Z",
      },
    ]);

    expect(queue.blockCount).toBe(2);
    expect(queue.queue).toHaveLength(2);
    expect(queue.queue.every((item) => item.severity === "block")).toBe(true);
    const previews = queue.queue.map((item) => item.messagePreview).join(" ");
    expect(previews).toContain("[secret-redacted]");
    expect(previews).not.toContain("abc123");
    expect(previews).not.toContain("xyz789");
    expect(previews).not.toContain("stream key");
    expect(previews).not.toContain("secret xyz789");
  });

  it("orders shadow blocks before local review and allowed fixtures", () => {
    const queue = buildBroadcastChatModerationShadowQueue([
      {
        authorHandle: "CleanRun",
        channel: "local-fixture",
        id: "clean",
        message: "Nice run.",
        timestamp: "2026-06-10T19:00:00.000Z",
      },
      {
        authorHandle: "TokenDrop",
        channel: "twitch-staging",
        id: "secret",
        message: "token_live_abcd should rotate",
        timestamp: "2026-06-10T19:02:00.000Z",
      },
      {
        authorHandle: "LinkDrop",
        channel: "youtube-staging",
        id: "link",
        message: "try https://spam.example now",
        timestamp: "2026-06-10T19:01:00.000Z",
      },
    ]);

    expect(queue.queue.map((item) => item.id)).toEqual(["secret", "link", "clean"]);
    expect(queue.queue[0]).toMatchObject({
      actionLabel: "Shadow block preview",
      severity: "block",
    });
  });
});
