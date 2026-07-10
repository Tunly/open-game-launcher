import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useCurrentUserMock = vi.hoisted(() => vi.fn());
const profileMocks = vi.hoisted(() => ({ getFriends: vi.fn() }));
const activityMocks = vi.hoisted(() => ({ postActivity: vi.fn() }));
const activityFeedPropsMock = vi.hoisted(() => vi.fn());

vi.mock("../hooks/useCurrentUser", () => ({
  useCurrentUser: () => useCurrentUserMock(),
}));

vi.mock("../lib/supabase/profile", () => ({
  getFriends: (...args: unknown[]) => profileMocks.getFriends(...args),
}));

vi.mock("../lib/supabase/activity", () => ({
  postActivity: (...args: unknown[]) => activityMocks.postActivity(...args),
}));

vi.mock("../components/friends/ActivityFeed", () => ({
  ActivityFeed: ({ friendIds }: { friendIds: string[] }) => {
    activityFeedPropsMock(friendIds);
    return <div data-testid="live-activity-feed">Live friend IDs: {friendIds.join(", ")}</div>;
  },
}));

import { CommunityPage } from "./CommunityPage";

const COMMUNITY_LOCAL_POSTS_STORAGE_KEY = "og-launcher:community-posts:v1";

describe("CommunityPage live activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/community");
    useCurrentUserMock.mockReturnValue({
      error: null,
      isConfigured: true,
      isLoading: false,
      session: null,
      signOut: vi.fn(),
      user: { id: "user-current" },
    });
    profileMocks.getFriends.mockResolvedValue([
      {
        addresseeId: "friend-2",
        requesterId: "user-current",
      },
      {
        addresseeId: "user-current",
        requesterId: "friend-1",
      },
    ]);
    activityMocks.postActivity.mockResolvedValue({ id: "status-live-1" });
  });

  it("loads accepted friends into the real activity feed without default demo surfaces", async () => {
    render(<CommunityPage />);

    expect(screen.getByRole("heading", { name: /community activity/i })).toBeInTheDocument();
    expect(profileMocks.getFriends).toHaveBeenCalledWith("user-current");
    expect(await screen.findByTestId("live-activity-feed")).toHaveTextContent("friend-2, friend-1");
    expect(activityFeedPropsMock).toHaveBeenLastCalledWith(["friend-2", "friend-1"]);
    expect(screen.queryByRole("region", { name: /popular hubs/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /community workshop/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /community market/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Neo-Tokyo Drift")).not.toBeInTheDocument();
  });

  it("publishes a trimmed friends-only status and refreshes the activity feed", async () => {
    render(<CommunityPage />);
    await screen.findByTestId("live-activity-feed");
    const feedRenderCountBeforePost = activityFeedPropsMock.mock.calls.length;

    const composer = screen.getByRole("form", { name: /friends-only status composer/i });
    fireEvent.change(within(composer).getByRole("textbox", { name: /status for accepted/i }), {
      target: { value: "  Ready for co-op  " },
    });
    fireEvent.click(within(composer).getByRole("button", { name: /post status/i }));

    await waitFor(() => {
      expect(activityMocks.postActivity).toHaveBeenCalledWith("status", {
        metadata: { text: "Ready for co-op" },
        visibility: "friends_only",
      });
    });
    expect(await screen.findByRole("status", { name: "" })).toHaveTextContent(
      "Status posted to your accepted friends.",
    );
    expect(within(composer).getByRole("textbox", { name: /status for accepted/i })).toHaveValue("");
    expect(activityFeedPropsMock.mock.calls.length).toBeGreaterThan(feedRenderCountBeforePost);
    expect(activityFeedPropsMock).toHaveBeenLastCalledWith(["friend-2", "friend-1"]);
  });

  it("shows an honest unavailable state when Supabase is not configured", () => {
    useCurrentUserMock.mockReturnValue({
      error: null,
      isConfigured: false,
      isLoading: false,
      session: null,
      signOut: vi.fn(),
      user: null,
    });

    render(<CommunityPage />);

    expect(screen.getByRole("region", { name: /community feed/i })).toHaveTextContent(
      "Supabase is not configured",
    );
    expect(screen.getByRole("textbox", { name: /status for accepted/i })).toBeDisabled();
    expect(profileMocks.getFriends).not.toHaveBeenCalled();
    expect(screen.queryByTestId("live-activity-feed")).not.toBeInTheDocument();
  });

  it("reports friend-feed loading failures and offers a real retry", async () => {
    profileMocks.getFriends
      .mockRejectedValueOnce(new Error("friend query denied"))
      .mockResolvedValueOnce([]);

    render(<CommunityPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("friend query denied");
    fireEvent.click(screen.getByRole("button", { name: /retry live feed/i }));

    await waitFor(() => expect(profileMocks.getFriends).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId("live-activity-feed")).toBeInTheDocument();
    expect(screen.getByText(/you have no accepted friends yet/i)).toBeInTheDocument();
  });
});

describe("CommunityPage verification preview activity shell", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/community?verify=community-preview");
    window.localStorage.clear();
  });

  it("renders the Steam-like community sections in the retro manga launcher shell", () => {
    render(<CommunityPage />);

    const home = screen.getByRole("region", { name: /community activity home/i });
    expect(within(home).getByRole("heading", { name: /community activity/i })).toBeInTheDocument();

    const nav = within(home).getByRole("navigation", { name: /community sections/i });
    expect(within(nav).getByRole("button", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("button", { name: "Discussions" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Workshop" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Market" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Broadcasts" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /community section board/i })).toHaveTextContent(
      "Live Arcade Lobby",
    );

    expect(screen.getByRole("region", { name: /popular hubs/i })).toHaveTextContent(
      "Neo-Tokyo Drift",
    );
    expect(screen.getByRole("form", { name: /find hubs/i })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: /find people/i })).toBeInTheDocument();
    const filters = screen.getByRole("region", { name: /community content filters/i });
    const contentTypeGroup = within(filters).getByRole("group", { name: /content type/i });
    expect(within(contentTypeGroup).getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(contentTypeGroup).getByRole("button", { name: "Artwork" })).toBeInTheDocument();
    expect(
      within(contentTypeGroup).getByRole("button", { name: "Broadcasts" }),
    ).toBeInTheDocument();
    expect(within(contentTypeGroup).getByRole("button", { name: "Workshop" })).toBeInTheDocument();
  });

  it("filters visible activity cards by community content type", () => {
    render(<CommunityPage />);

    const filters = screen.getByRole("region", { name: /community content filters/i });
    const contentTypeGroup = within(filters).getByRole("group", { name: /content type/i });
    fireEvent.click(within(contentTypeGroup).getByRole("button", { name: "Broadcasts" }));

    const feed = screen.getByRole("region", { name: /community feed/i });
    expect(feed).toHaveTextContent("Netrunner Phantom Cup locks Friday");
    expect(feed).not.toHaveTextContent("Neo-Tokyo Drift ranked queue opens");
  });

  it("does not expose screenshot product surfaces", () => {
    window.history.replaceState(null, "", "/community");
    render(<CommunityPage />);

    expect(screen.queryByRole("button", { name: "Screenshots" })).not.toBeInTheDocument();
    expect(screen.queryByText(/public screenshot feed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/screenshot set/i)).not.toBeInTheDocument();
  });

  it("filters popular hubs from the hub search", () => {
    render(<CommunityPage />);

    fireEvent.change(screen.getByRole("textbox", { name: /hub name/i }), {
      target: { value: "phantom" },
    });

    const popular = screen.getByRole("region", { name: /popular hubs/i });
    expect(popular).toHaveTextContent("Netrunner Phantom");
    expect(popular).not.toHaveTextContent("Steel Battalion X");
  });

  it("switches section tabs into matching feed lanes", () => {
    render(<CommunityPage />);

    const home = screen.getByRole("region", { name: /community activity home/i });
    const nav = within(home).getByRole("navigation", { name: /community sections/i });
    fireEvent.click(within(nav).getByRole("button", { name: "Workshop" }));

    expect(within(nav).getByRole("button", { name: "Workshop" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("region", { name: /community section board/i })).toHaveTextContent(
      "Workshop Dispatch",
    );
    const feed = screen.getByRole("region", { name: /community feed/i });
    expect(feed).toHaveTextContent("Steel Battalion X raid slot free");
    expect(feed).not.toHaveTextContent("Neo-Tokyo Drift ranked queue opens");
  });

  it("routes the Market section to the artwork board", () => {
    render(<CommunityPage />);

    const home = screen.getByRole("region", { name: /community activity home/i });
    const nav = within(home).getByRole("navigation", { name: /community sections/i });
    fireEvent.click(within(nav).getByRole("button", { name: "Market" }));

    const filters = screen.getByRole("region", { name: /community content filters/i });
    const contentTypeGroup = within(filters).getByRole("group", { name: /content type/i });
    expect(within(contentTypeGroup).getByRole("button", { name: "Artwork" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("region", { name: /community section board/i })).toHaveTextContent(
      "Poster Market",
    );
    expect(screen.getByRole("region", { name: /community feed/i })).toHaveTextContent(
      "Steel Battalion zine cover wins",
    );
  });

  it("switches game hub details from the popular hub cards", () => {
    render(<CommunityPage />);

    const popular = screen.getByRole("region", { name: /popular hubs/i });
    fireEvent.click(within(popular).getByRole("button", { name: /Steel Battalion X/i }));

    const hubDetails = screen.getByRole("region", { name: /game community hub details/i });
    expect(hubDetails).toHaveTextContent("Steel Battalion X");
    expect(hubDetails).toHaveTextContent("24");
    expect(hubDetails).toHaveTextContent("Workshop");
    expect(hubDetails).toHaveTextContent("9");
    expect(hubDetails).toHaveTextContent("Market");
  });

  it("stages local community content into the selected content lane", () => {
    render(<CommunityPage />);

    const studio = screen.getByRole("region", { name: /community content studio/i });
    fireEvent.click(within(studio).getByRole("button", { name: /upload local/i }));

    const form = within(studio).getByRole("form", { name: /local community content upload/i });
    fireEvent.change(within(form).getByRole("textbox", { name: /content title/i }), {
      target: { value: "Local boss artwork" },
    });
    expect(within(form).getByRole("button", { name: "Artwork" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(within(form).getByRole("button", { name: /stage content/i }));

    expect(studio).toHaveTextContent("Artwork staged locally for Neo-Tokyo Drift.");
    expect(screen.getByRole("region", { name: /community feed/i })).toHaveTextContent(
      "Local boss artwork",
    );
  });

  it("adds a browser-local reply to the active discussion topic", () => {
    render(<CommunityPage />);

    const discussions = screen.getByRole("region", { name: /community discussions/i });
    fireEvent.change(within(discussions).getByRole("textbox", { name: /topic reply/i }), {
      target: { value: "Local reply card" },
    });
    fireEvent.click(within(discussions).getByRole("button", { name: "Reply" }));

    expect(discussions).toHaveTextContent("Local reply card");
  });

  it("toggles workshop subscription, market watch, and moderation status locally", () => {
    render(<CommunityPage />);

    const workshop = screen.getByRole("region", { name: /community workshop/i });
    fireEvent.click(within(workshop).getByRole("button", { name: "Subscribe" }));
    expect(within(workshop).getByRole("button", { name: "Subscribed locally" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const market = screen.getByRole("region", { name: /community market/i });
    fireEvent.click(within(market).getByRole("button", { name: "Watch" }));
    expect(within(market).getByRole("button", { name: "Watching locally" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const moderation = screen.getByRole("region", { name: /community moderation queue/i });
    fireEvent.click(within(moderation).getAllByRole("button", { name: "Hide" })[0]);
    expect(moderation).toHaveTextContent("hidden // Missing spoiler tag");
  });
});

describe("CommunityPage broadcast readiness", () => {
  const falseLiveProviderClaim =
    /\b(?:live\s*(?:now|ready|online|enabled|started)|go[-\s]?live\s*(?:ready|enabled|available)|ready\s+for\s+(?:local\s+)?broadcast(?:\s+staging)?|rtmp(?:\s+ingest)?\s*(?:ready|connected|enabled|started)|(?:twitch|youtube|provider)\s*(?:oauth|stream(?:ing)?|live|chat|vod)\s*(?:ready|verified|connected|enabled|synced|complete)|chat\s+moderation\s*(?:ready|verified|enabled)|vod(?:\s+provider)?\s*(?:sync|archive)\s*(?:ready|verified|synced|enabled)|broadcast\s*(?:started|online))\b/i;
  const falseHostedModerationClaim =
    /\b(?:(?:twitch|youtube|provider)\s*(?:chat|oauth|moderation)\s*(?:connected|ready|verified|enabled|synced|complete)|hosted\s*moderation\s*(?:ready|verified|enabled|complete)|(?:timeout|ban|delete)\s*(?:sent|executed|applied)|supabase\s*moderation\s*logs?\s*(?:written|synced|ready)|live\s*chat\s*replay\s*(?:ready|connected|synced)|rtmp(?:\/live|\s+live)?\s*output\s*(?:ready|started|enabled)|audience\s*status\s*(?:ready|updated|online))\b/i;
  const falseVodArchivePolicyClaim =
    /\b(?:(?:twitch|youtube|provider)\s*(?:oauth|vod|archive|video)\s*(?:ready|verified|connected|enabled|synced|complete|imported|published)|vod\s+archive\s+policy\s*(?:ready|verified|synced|enabled|complete)|vod(?:\s+(?:provider|archive))?\s*(?:sync|archive|import|publish|delete|retention)\s*(?:ready|verified|synced|enabled|complete|executed|applied)|archive\s*(?:created|written|served|published|synced|deleted)|supabase\s*(?:vod|archive(?:\s+row)?|storage|bucket|row)\s*(?:ready|verified|synced|enabled|written|inserted|updated|served|complete)|signed\s+url\s*(?:ready|created|generated|served)|public\s+storage\s*(?:ready|served|enabled|synced)|(?:rtmp(?:\/live|\s+live|\s+ingest)?|live\s+output)\s*(?:ready|connected|enabled|started)|audience(?:\/live)?\s*status\s*(?:ready|updated|online)|hosted\s*(?:moderation|archive|vod)\s*(?:ready|verified|enabled|synced|complete))\b/i;
  const falseProviderCallbackContractClaim =
    /\b(?:(?:twitch|youtube|provider)\s*(?:oauth|callback|webhook|event)\s*(?:ready|verified|connected|enabled|complete|received|processed)|oauth\s*(?:token\s*)?(?:exchanged|connected|verified|complete)|(?:rtmp(?:\/live|\s+live|\s+ingest)?|live\s+output)\s*(?:ready|connected|enabled|started|published)|hosted\s*(?:callback|webhook|endpoint|function)\s*(?:executed|execution|ready|verified|enabled|deployed|complete|called)|supabase\s*(?:callback|webhook|broadcast(?:ing)?|row|audit)\s*(?:write|writes|written|inserted|updated|synced|ready|verified|complete)|provider\s*webhooks?\s*(?:received|verified|processed|complete)|callback\s+row\s*(?:inserted|written|processed|verified)|callback\s*(?:received|verified|processed|complete)|webhook\s*(?:received|verified|processed|complete)|replay\s*(?:processed|replayed|drained|complete)|vod(?:\s+provider)?\s*(?:sync|archive)\s*(?:ready|verified|synced|enabled|complete|processed)|audience(?:\/live)?\s*status\s*(?:ready|updated|online|synced)|live\s*status\s*(?:ready|updated|online|synced))\b/i;
  const falseProviderOAuthContractClaim =
    /\b(?:(?:twitch|youtube|provider)\s*(?:oauth|authorization|auth|token|chat|vod|live)\s*(?:ready|verified|connected|enabled|complete|authorized|stored|synced)|oauth\s*(?:authorization|redirect|token|exchange)\s*(?:ready|opened|sent|complete|verified|connected|enabled|exchanged)|token\s*(?:exchange|request|storage|refresh|revocation)\s*(?:ready|sent|complete|verified|connected|enabled|stored)|provider\s*(?:chat|vod)\s*(?:read|sync|archive)\s*(?:ready|verified|synced|enabled|complete)|hosted\s*(?:oauth|callback|endpoint|function)\s*(?:ready|verified|enabled|deployed|complete|called)|(?:rtmp(?:\/live|\s+live|\s+ingest)?|live\s+output)\s*(?:ready|connected|enabled|started|published)|audience(?:\/live)?\s*status\s*(?:ready|updated|online|synced))\b/i;
  const falseLiveSessionRehearsalClaim =
    /\b(?:go[-\s]?live\s*(?:ready|enabled|available|complete)|live\s*(?:now|ready|online|enabled|started)|provider\s*(?:oauth|chat|callback)\s*(?:ready|verified|connected|enabled|complete|replayed)|rtmp(?:\s+ingest|\s+socket)?\s*(?:ready|connected|started|published)|hosted\s*moderation\s*(?:ready|verified|enabled|executed)|vod(?:\s+provider)?\s*(?:sync|archive)\s*(?:ready|verified|synced|complete)|audience(?:\/live)?\s*status\s*(?:ready|updated|online|synced))\b/i;
  const falseAudienceStatusContractClaim =
    /\b(?:live\s*(?:now|ready|online|enabled|started)|audience(?:\/live)?\s*status\s*(?:ready|updated|online|synced)|provider\s*live-state\s*(?:ready|connected|verified|synced)|viewer\s*count\s*(?:verified|polled|synced)|public\s*live\s*badge\s*(?:updated|synced|enabled)|supabase\s*audience\s*row\s*(?:written|inserted|updated|synced)|chat\s*presence\s*(?:synced|connected|verified)|callback\s*(?:received|processed|replayed)|rtmp(?:\s+ingest|\s+socket|\s+live)?\s*(?:ready|connected|started|published))\b/i;

  beforeEach(() => {
    window.history.replaceState(null, "", "/community?verify=broadcasting-readiness");
  });

  it("renders local broadcast readiness without claiming provider live streaming", () => {
    render(<CommunityPage />);

    const panel = screen.getByRole("region", { name: /local broadcasting readiness/i });

    expect(within(panel).getByText("Broadcasting Readiness")).toBeInTheDocument();
    expect(within(panel).getByText("Local Preview Only")).toBeInTheDocument();
    expect(within(panel).getByText("Twitch Staging")).toBeInTheDocument();
    expect(within(panel).getByText("Local Recording Lane")).toBeInTheDocument();
    expect(within(panel).getByText("Unlinked YouTube Slot")).toBeInTheDocument();
    expect(within(panel).getByText("Provider OAuth not executed")).toBeInTheDocument();
    expect(within(panel).getByText("RTMP ingest not started")).toBeInTheDocument();
    expect(within(panel).getByText("Hosted chat moderation unverified")).toBeInTheDocument();
    expect(within(panel).getByText("No VOD provider sync")).toBeInTheDocument();
    expect(within(panel).getByText("Local Lanes")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(falseLiveProviderClaim);
    expect(panel).not.toHaveTextContent(/(^|[^a-z-])ready \/\/ \d+ kbps headroom/i);
  });

  it("does not treat the explicit local preview as desktop vault evidence", () => {
    window.history.replaceState(null, "", "/community?verify=community-preview");

    render(<CommunityPage />);

    const panel = screen.getByRole("region", { name: /local broadcasting readiness/i });
    const localPreviewHeading = within(panel).getByRole("heading", {
      name: /local stream preview/i,
    });
    const localPreview = localPreviewHeading.closest("article");

    expect(
      within(panel).getByText("0 desktop vault stream-key records present"),
    ).toBeInTheDocument();
    expect(panel).not.toHaveTextContent("1 desktop vault stream-key record present");
    expect(localPreview).not.toBeNull();
    expect(
      within(localPreview as HTMLElement).getByText("Stream key is not in the desktop vault"),
    ).toBeInTheDocument();
  });

  it("renders provider/live readiness without claiming hosted broadcast execution", async () => {
    window.history.replaceState(null, "", "/community?verify=broadcasting-provider-live-readiness");

    render(<CommunityPage />);

    const panel = await screen.findByRole("region", {
      name: /broadcasting provider readiness/i,
    });

    expect(within(panel).getByText("Broadcast Provider Live Readiness")).toBeInTheDocument();
    expect(within(panel).getByText("Local Capture Evidence")).toBeInTheDocument();
    expect(within(panel).getByText("Overlay Safety Review")).toBeInTheDocument();
    expect(within(panel).getByText("Upload Headroom Estimate")).toBeInTheDocument();
    expect(within(panel).getByText("Desktop Vault Slot")).toBeInTheDocument();
    expect(within(panel).getByText("Provider Policy")).toBeInTheDocument();
    expect(within(panel).getByText("Provider Scope + Terms Policy")).toBeInTheDocument();
    expect(within(panel).getByText("OAuth scope review only")).toBeInTheDocument();
    expect(within(panel).getByText("No authorization redirect launch")).toBeInTheDocument();
    expect(within(panel).getByText("No provider chat/VOD writes")).toBeInTheDocument();
    expect(within(panel).getByText("Provider OAuth Gate")).toBeInTheDocument();
    expect(within(panel).getByText("RTMP Live Output Gate")).toBeInTheDocument();
    expect(within(panel).getByText("Hosted Chat Moderation Gate")).toBeInTheDocument();
    expect(within(panel).getByText("VOD Provider Sync Gate")).toBeInTheDocument();
    expect(within(panel).getByText("Go-Live Review Gate")).toBeInTheDocument();
    expect(within(panel).getByText("Local fixtures only")).toBeInTheDocument();
    expect(within(panel).getByText("No Twitch/YouTube OAuth")).toBeInTheDocument();
    expect(within(panel).getByText("No RTMP/live output")).toBeInTheDocument();
    expect(within(panel).getByText("No stream-key live use")).toBeInTheDocument();
    expect(within(panel).getByText("No hosted chat moderation")).toBeInTheDocument();
    expect(within(panel).getByText("No VOD provider sync")).toBeInTheDocument();
    expect(within(panel).getByText("No audience/live-status claim")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(falseLiveProviderClaim);

    const vault = await screen.findByRole("region", { name: /broadcast stream-key vault/i });
    expect(within(vault).getByText("Stream-Key Vault")).toBeInTheDocument();
    expect(within(vault).getByText("Desktop Required")).toBeInTheDocument();
    expect(within(vault).getByText("Not stored")).toBeInTheDocument();
    expect(
      within(vault).getByText("Broadcast stream-key vault is available in the desktop app."),
    ).toBeInTheDocument();
    expect(within(vault).getByRole("button", { name: /save key/i })).toBeDisabled();
    expect(within(vault).getByRole("button", { name: /clear key/i })).toBeDisabled();
    expect(vault).not.toHaveTextContent(falseLiveProviderClaim);
  });

  it("keeps broadcast stream-key save disabled until local vault consent is checked", async () => {
    window.history.replaceState(null, "", "/community?verify=broadcasting-provider-live-readiness");

    render(<CommunityPage />);

    const vault = await screen.findByRole("region", { name: /broadcast stream-key vault/i });
    fireEvent.change(within(vault).getByLabelText(/broadcast stream key/i), {
      target: { value: "stream-key-secret-123" },
    });
    const saveButton = within(vault).getByRole("button", { name: /save key/i });
    expect(saveButton).toBeDisabled();

    fireEvent.click(within(vault).getByRole("checkbox", { name: /store or clear/i }));
    expect(saveButton).toBeEnabled();
  });

  it("renders RTMP dry-run packet without opening provider or stream execution claims", () => {
    window.history.replaceState(null, "", "/community?verify=broadcasting-rtmp-dry-run");

    render(<CommunityPage />);

    const panel = screen.getByRole("region", {
      name: /broadcasting rtmp dry-run packet/i,
    });

    expect(within(panel).getByText("RTMP Dry-Run Packet")).toBeInTheDocument();
    expect(within(panel).getByText("Dry-run packet only")).toBeInTheDocument();
    expect(within(panel).getByText("No socket opened")).toBeInTheDocument();
    expect(within(panel).getByText("No RTMP publish attempt")).toBeInTheDocument();
    expect(within(panel).getByText("No stream-key reveal")).toBeInTheDocument();
    expect(within(panel).getByText("No OAuth token exchange")).toBeInTheDocument();
    expect(within(panel).getByText("No live output")).toBeInTheDocument();
    expect(within(panel).getByText("No audience status")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent("live_123456789_abcdef");
    expect(panel).not.toHaveTextContent(falseLiveProviderClaim);
  });

  it("renders local chat moderation shadow queue without provider enforcement claims", () => {
    window.history.replaceState(null, "", "/community?verify=broadcasting-chat-moderation-shadow");

    render(<CommunityPage />);

    const panel = screen.getByRole("region", {
      name: /broadcasting chat moderation shadow queue/i,
    });

    expect(within(panel).getByText("Moderation Shadow Queue")).toBeInTheDocument();
    expect(within(panel).getAllByText("Local shadow review")).toHaveLength(2);
    expect(within(panel).getByText("Shadow block preview")).toBeInTheDocument();
    expect(within(panel).getByText("No provider chat read")).toBeInTheDocument();
    expect(within(panel).getByText("No Twitch/YouTube OAuth")).toBeInTheDocument();
    expect(within(panel).getByText("No hosted enforcement")).toBeInTheDocument();
    expect(within(panel).getByText("No moderation action sent")).toBeInTheDocument();
    expect(within(panel).getByText("No Supabase moderation logs")).toBeInTheDocument();
    expect(within(panel).getByText("No live chat replay")).toBeInTheDocument();
    expect(panel).toHaveTextContent("start RTMP/live output");
    expect(panel).toHaveTextContent("sync VOD");
    expect(panel).toHaveTextContent("update audience/live status");
    expect(panel).toHaveTextContent("[secret-redacted]");
    expect(panel).not.toHaveTextContent("stream key");
    expect(panel).not.toHaveTextContent("live_123456789_abcdef");
    expect(panel).not.toHaveTextContent(falseHostedModerationClaim);
  });

  it("renders local VOD archive policy without hosted archive claims", () => {
    window.history.replaceState(null, "", "/community?verify=broadcasting-vod-archive-policy");

    render(<CommunityPage />);

    const panel = screen.getByRole("region", {
      name: /broadcasting vod archive policy/i,
    });

    expect(within(panel).getByText("VOD Archive Policy")).toBeInTheDocument();
    expect(within(panel).getByText("Local policy review")).toBeInTheDocument();
    expect(within(panel).getByText("Retention draft")).toBeInTheDocument();
    expect(within(panel).getByText("Visibility review")).toBeInTheDocument();
    expect(within(panel).getByText("Delete coverage")).toBeInTheDocument();
    expect(within(panel).getByText("No Twitch/YouTube OAuth")).toBeInTheDocument();
    expect(within(panel).getByText("No OAuth token exchange")).toBeInTheDocument();
    expect(within(panel).getByText("No RTMP/live output")).toBeInTheDocument();
    expect(within(panel).getByText("No stream-key live use")).toBeInTheDocument();
    expect(within(panel).getByText("No hosted chat moderation")).toBeInTheDocument();
    expect(within(panel).getByText("No hosted enforcement")).toBeInTheDocument();
    expect(within(panel).getByText("No VOD provider sync")).toBeInTheDocument();
    expect(within(panel).getByText("No Supabase archive write")).toBeInTheDocument();
    expect(within(panel).getByText("No signed URL request")).toBeInTheDocument();
    expect(within(panel).getByText("No public storage serve")).toBeInTheDocument();
    expect(within(panel).getByText("No VOD sync job")).toBeInTheDocument();
    expect(within(panel).getByText("No provider archive import")).toBeInTheDocument();
    expect(within(panel).getByText("No delete request sent")).toBeInTheDocument();
    expect(within(panel).getByText("No audience/live-status claim")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(falseLiveProviderClaim);
    expect(panel).not.toHaveTextContent(falseHostedModerationClaim);
    expect(panel).not.toHaveTextContent(falseVodArchivePolicyClaim);
  });

  it("renders local provider callback contract without hosted webhook claims", () => {
    window.history.replaceState(
      null,
      "",
      "/community?verify=broadcasting-provider-callback-contract",
    );

    render(<CommunityPage />);

    const panel = screen.getByRole("region", {
      name: /broadcasting provider callback contract/i,
    });

    expect(within(panel).getByText("Provider Callback Contract")).toBeInTheDocument();
    expect(within(panel).getByText("Local contract review")).toBeInTheDocument();
    expect(within(panel).getByText("Event schema fixture")).toBeInTheDocument();
    expect(within(panel).getByText("Signature header checklist")).toBeInTheDocument();
    expect(within(panel).getByText("Idempotency key plan")).toBeInTheDocument();
    expect(within(panel).getByText("Replay duplicate fixture")).toBeInTheDocument();
    expect(within(panel).getByText("Redacted audit row shape")).toBeInTheDocument();
    expect(within(panel).getByText("Hosted endpoint")).toBeInTheDocument();
    expect(within(panel).getByText("Provider delivery")).toBeInTheDocument();
    expect(within(panel).getByText("Supabase callback row")).toBeInTheDocument();
    expect(within(panel).getByText("No hosted endpoint deployment")).toBeInTheDocument();
    expect(within(panel).getByText("No provider delivery proof")).toBeInTheDocument();
    expect(within(panel).getByText("No Supabase callback row mutation")).toBeInTheDocument();
    expect(within(panel).getByText("No replay runner")).toBeInTheDocument();
    expect(within(panel).getByText("No VOD sync job")).toBeInTheDocument();
    expect(within(panel).getByText("No audience/live-status claim")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /broadcast stream-key vault/i })).toBeNull();
    expect(panel).not.toHaveTextContent(falseLiveProviderClaim);
    expect(panel).not.toHaveTextContent(falseVodArchivePolicyClaim);
    expect(panel).not.toHaveTextContent(falseProviderCallbackContractClaim);
  });

  it("renders local provider OAuth contract without provider authorization claims", () => {
    window.history.replaceState(null, "", "/community?verify=broadcasting-provider-oauth-contract");

    render(<CommunityPage />);

    const panel = screen.getByRole("region", {
      name: /broadcasting provider oauth contract/i,
    });

    expect(within(panel).getByText("Provider OAuth Contract")).toBeInTheDocument();
    expect(within(panel).getByText("Local OAuth contract")).toBeInTheDocument();
    expect(within(panel).getByText("PKCE challenge fixture")).toBeInTheDocument();
    expect(within(panel).getByText("State nonce fixture")).toBeInTheDocument();
    expect(within(panel).getByText("Redirect URI allowlist")).toBeInTheDocument();
    expect(within(panel).getByText("Provider scope review")).toBeInTheDocument();
    expect(within(panel).getByText("Callback error taxonomy")).toBeInTheDocument();
    expect(within(panel).getByText("Token storage boundary")).toBeInTheDocument();
    expect(within(panel).getByText("Redacted secret handling")).toBeInTheDocument();
    expect(within(panel).getByText("Provider app registration")).toBeInTheDocument();
    expect(within(panel).getByText("Hosted callback endpoint")).toBeInTheDocument();
    expect(within(panel).getByText("OAuth authorize launch")).toBeInTheDocument();
    expect(within(panel).getByText("Token exchange")).toBeInTheDocument();
    expect(within(panel).getByText("Provider chat/VOD handoff")).toBeInTheDocument();
    expect(within(panel).getByText("No OAuth authorization redirect")).toBeInTheDocument();
    expect(within(panel).getByText("No OAuth token exchange")).toBeInTheDocument();
    expect(within(panel).getByText("No provider access token stored")).toBeInTheDocument();
    expect(within(panel).getByText("No hosted callback endpoint")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /broadcast stream-key vault/i })).toBeNull();
    expect(panel).not.toHaveTextContent(falseLiveProviderClaim);
    expect(panel).not.toHaveTextContent(falseProviderCallbackContractClaim);
    expect(panel).not.toHaveTextContent(falseProviderOAuthContractClaim);
  });

  it("renders local live-session rehearsal without go-live execution claims", () => {
    window.history.replaceState(null, "", "/community?verify=broadcasting-live-session-rehearsal");

    render(<CommunityPage />);

    const panel = screen.getByRole("region", {
      name: /broadcasting live session rehearsal/i,
    });

    expect(within(panel).getByText("Live Session Rehearsal")).toBeInTheDocument();
    expect(within(panel).getAllByText("Local rehearsal only")).toHaveLength(2);
    expect(within(panel).getByText("Local preflight")).toBeInTheDocument();
    expect(within(panel).getByText("Desktop vault handoff")).toBeInTheDocument();
    expect(within(panel).getByText("Provider OAuth launch")).toBeInTheDocument();
    expect(within(panel).getByText("RTMP ingest negotiation")).toBeInTheDocument();
    expect(within(panel).getByText("Provider chat attach")).toBeInTheDocument();
    expect(within(panel).getByText("Hosted moderation handoff")).toBeInTheDocument();
    expect(within(panel).getByText("VOD archive handoff")).toBeInTheDocument();
    expect(within(panel).getByText("Provider callback replay")).toBeInTheDocument();
    expect(within(panel).getByText("Audience status update")).toBeInTheDocument();
    expect(within(panel).getByText("Rollback drill")).toBeInTheDocument();
    expect(within(panel).getByText("No provider OAuth launch")).toBeInTheDocument();
    expect(within(panel).getByText("No RTMP socket")).toBeInTheDocument();
    expect(within(panel).getByText("No live audience status")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /broadcast stream-key vault/i })).toBeNull();
    expect(panel).not.toHaveTextContent(falseLiveProviderClaim);
    expect(panel).not.toHaveTextContent(falseProviderCallbackContractClaim);
    expect(panel).not.toHaveTextContent(falseProviderOAuthContractClaim);
    expect(panel).not.toHaveTextContent(falseLiveSessionRehearsalClaim);
  });

  it("renders local audience status contract without live status mutation claims", () => {
    window.history.replaceState(
      null,
      "",
      "/community?verify=broadcasting-audience-status-contract",
    );

    render(<CommunityPage />);

    const panel = screen.getByRole("region", {
      name: /broadcasting audience status contract/i,
    });

    expect(within(panel).getByText("Audience Status Contract")).toBeInTheDocument();
    expect(within(panel).getByText("Local status contract")).toBeInTheDocument();
    expect(within(panel).getByText("Local preview state")).toBeInTheDocument();
    expect(within(panel).getByText("Provider live-state event")).toBeInTheDocument();
    expect(within(panel).getByText("Audience count snapshot")).toBeInTheDocument();
    expect(within(panel).getByText("Chat presence merge")).toBeInTheDocument();
    expect(within(panel).getByText("Public status write")).toBeInTheDocument();
    expect(within(panel).getByText("Supabase audience row")).toBeInTheDocument();
    expect(within(panel).getByText("No provider live-state read")).toBeInTheDocument();
    expect(within(panel).getByText("No audience count polling")).toBeInTheDocument();
    expect(within(panel).getByText("No public live badge update")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /broadcast stream-key vault/i })).toBeNull();
    expect(panel).not.toHaveTextContent(falseLiveProviderClaim);
    expect(panel).not.toHaveTextContent(falseProviderCallbackContractClaim);
    expect(panel).not.toHaveTextContent(falseLiveSessionRehearsalClaim);
    expect(panel).not.toHaveTextContent(falseAudienceStatusContractClaim);
  });
});

describe("CommunityPage local create post composer", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/community?verify=community-preview");
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function openComposer() {
    render(<CommunityPage />);
    fireEvent.click(screen.getByRole("button", { name: /create post/i }));

    return screen.getByRole("form", { name: /browser local post composer/i });
  }

  it("opens the browser-local composer from Create Post", () => {
    const composer = openComposer();

    expect(within(composer).getByRole("textbox", { name: /local post/i })).toHaveAttribute(
      "maxlength",
      "120",
    );
    expect(screen.getByRole("button", { name: /create post/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(within(composer).getByText("Browser Local // Draft only")).toBeInTheDocument();
    expect(within(composer).getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("keeps empty local post submit disabled", () => {
    const composer = openComposer();
    const textarea = within(composer).getByRole("textbox", { name: /local post/i });
    const saveButton = within(composer).getByRole("button", { name: /save locally/i });

    expect(saveButton).toBeDisabled();

    fireEvent.change(textarea, { target: { value: "   " } });

    expect(saveButton).toBeDisabled();

    fireEvent.change(textarea, { target: { value: "Browser local arcade run" } });

    expect(saveButton).toBeEnabled();
  });

  it("submits, prepends, and stores a browser-local post", () => {
    const composer = openComposer();
    fireEvent.change(within(composer).getByRole("textbox", { name: /local post/i }), {
      target: { value: "Browser local arcade run" },
    });

    fireEvent.click(within(composer).getByRole("button", { name: /save locally/i }));

    const feed = screen.getByRole("region", { name: /community feed/i });
    const articles = within(feed).getAllByRole("article");
    expect(articles[0]).toHaveTextContent("Local Post");
    expect(articles[0]).toHaveTextContent("Browser local arcade run");
    expect(articles[0]).toHaveTextContent("Saved locally // Browser Local");
    expect(articles[1]).toHaveTextContent("Neo-Tokyo Drift ranked queue opens");
    expect(screen.queryByRole("form", { name: /browser local post composer/i })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Local post saved in this browser.");

    const storedPosts = JSON.parse(
      window.localStorage.getItem(COMMUNITY_LOCAL_POSTS_STORAGE_KEY) ?? "[]",
    );
    expect(storedPosts).toHaveLength(1);
    expect(storedPosts[0]).toMatchObject({ body: "Browser local arcade run" });
  });

  it("keeps a local post session-only when browser storage rejects writes", () => {
    const setItemSpy = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("Quota exceeded");
    });
    const composer = openComposer();
    fireEvent.change(within(composer).getByRole("textbox", { name: /local post/i }), {
      target: { value: "Session only arcade run" },
    });

    fireEvent.click(within(composer).getByRole("button", { name: /save locally/i }));

    const feed = screen.getByRole("region", { name: /community feed/i });
    const articles = within(feed).getAllByRole("article");
    expect(setItemSpy).toHaveBeenCalled();
    expect(articles[0]).toHaveTextContent("Session only arcade run");
    expect(articles[0]).toHaveTextContent("Session only // Browser Local");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Browser storage unavailable; post kept for this session.",
    );
  });

  it("loads stored browser-local posts above the seeded feed", () => {
    window.localStorage.setItem(
      COMMUNITY_LOCAL_POSTS_STORAGE_KEY,
      JSON.stringify([
        {
          body: "Stored browser local card",
          createdAt: "2026-06-13T10:00:00.000Z",
          id: "stored-local-1",
        },
      ]),
    );

    render(<CommunityPage />);

    const feed = screen.getByRole("region", { name: /community feed/i });
    const articles = within(feed).getAllByRole("article");
    expect(articles[0]).toHaveTextContent("Local Post");
    expect(articles[0]).toHaveTextContent("Stored browser local card");
    expect(articles[0]).toHaveTextContent("Saved locally // Browser Local");
    expect(articles[1]).toHaveTextContent("Neo-Tokyo Drift ranked queue opens");
  });

  it("ignores malformed browser-local storage", () => {
    window.localStorage.setItem(COMMUNITY_LOCAL_POSTS_STORAGE_KEY, "{not-json");

    expect(() => render(<CommunityPage />)).not.toThrow();

    const feed = screen.getByRole("region", { name: /community feed/i });
    const articles = within(feed).getAllByRole("article");
    expect(articles[0]).toHaveTextContent("Neo-Tokyo Drift ranked queue opens");
    expect(within(feed).queryByText("Local Post")).toBeNull();
  });

  it("renders the community-create-post verify route without writing browser storage", () => {
    const setItemSpy = vi.spyOn(window.localStorage, "setItem");
    window.history.replaceState(null, "", "/community?verify=community-create-post");

    render(<CommunityPage />);

    const feed = screen.getByRole("region", { name: /community feed/i });
    const articles = within(feed).getAllByRole("article");
    expect(articles[0]).toHaveTextContent("Local Post");
    expect(articles[0]).toHaveTextContent("Verify route local proof post");
    expect(articles[0]).toHaveTextContent("Session only // Browser Local");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Verify route rendered a local post proof without browser storage writes.",
    );
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(COMMUNITY_LOCAL_POSTS_STORAGE_KEY)).toBeNull();
  });

  it("caps stored browser-local posts at five", () => {
    window.localStorage.setItem(
      COMMUNITY_LOCAL_POSTS_STORAGE_KEY,
      JSON.stringify(
        Array.from({ length: 5 }, (_, index) => ({
          body: `Stored local post ${index + 1}`,
          createdAt: "2026-06-13T10:00:00.000Z",
          id: `stored-local-${index + 1}`,
        })),
      ),
    );

    const composer = openComposer();
    fireEvent.change(within(composer).getByRole("textbox", { name: /local post/i }), {
      target: { value: "Newest browser local card" },
    });
    fireEvent.click(within(composer).getByRole("button", { name: /save locally/i }));

    const storedPosts = JSON.parse(
      window.localStorage.getItem(COMMUNITY_LOCAL_POSTS_STORAGE_KEY) ?? "[]",
    );
    expect(storedPosts).toHaveLength(5);
    expect(storedPosts[0]).toMatchObject({ body: "Newest browser local card" });
    expect(storedPosts[4]).toMatchObject({ body: "Stored local post 4" });
  });
});
