import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CrossPlatformInvite } from "./CrossPlatformInvite";
import type { InviteFeasibility, PlatformType } from "../../lib/types/friends";

const shareToken =
  "ogl_eyJ0eXAiOiJvZ2wtc2hhcmUiLCJhbGciOiJIUzI1NiIsImtpZCI6InNoYXJlLXRva2VuLXYxIn0.eyJ2IjoxLCJqdGkiOiJpbnZpdGUtMTIzIiwiaWF0IjoxNzgxMTEyODAwLCJleHAiOjE3ODExMTQ2MDB9.VZRK5sql2xId2JWnCCprB3ViZnIJeWDC8BEvzLA9s-o";
const shareTokenHint = `${shareToken.slice(0, 10)}...${shareToken.slice(-6)}`;

const checkInviteFeasibility = vi.fn();
const createGameInviteShareToken = vi.fn();
const sendCrossplatformInvite = vi.fn();

vi.mock("../../lib/supabase/social", () => ({
  checkInviteFeasibility: (
    gameTitle: string,
    senderPlatforms: PlatformType[],
    receiverPlatforms: PlatformType[],
  ) => checkInviteFeasibility(gameTitle, senderPlatforms, receiverPlatforms),
  createGameInviteShareToken: (
    expectedUserId: string,
    inviteId: string,
    platform: PlatformType | null,
  ) => createGameInviteShareToken(expectedUserId, inviteId, platform),
  sendCrossplatformInvite: (
    expectedUserId: string,
    receiverId: string | null,
    gameTitle: string,
    platform: PlatformType | null,
    launchUri: string | null,
    feasibility: InviteFeasibility,
  ) =>
    sendCrossplatformInvite(
      expectedUserId,
      receiverId,
      gameTitle,
      platform,
      launchUri,
      feasibility,
    ),
}));

describe("CrossPlatformInvite", () => {
  beforeEach(() => {
    checkInviteFeasibility.mockReset();
    createGameInviteShareToken.mockReset();
    sendCrossplatformInvite.mockReset();
    checkInviteFeasibility.mockResolvedValue({
      compatibleSenderPlatform: "steam",
      feasibility: "possible",
    });
    createGameInviteShareToken.mockResolvedValue({
      expiresAt: "2026-06-10T16:00:00.000Z",
      gameTitle: "Steel Battalion X",
      platform: "steam",
      token: shareToken,
      tokenHint: shareTokenHint,
    });
    sendCrossplatformInvite.mockResolvedValue({
      id: "invite-123",
      gameTitle: "Steel Battalion X",
      platform: "steam",
    });
  });

  it("replaces the legacy invite link with server token links after sending an invite", async () => {
    render(
      <CrossPlatformInvite
        currentUserId="user-1"
        receiverPlatforms={["xbox"]}
        selectedFriendId="friend-1"
        senderPlatforms={["gog", "steam"]}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Game title..."), {
      target: { value: "Steel Battalion X" },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /check feasibility/i })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole("button", { name: /check feasibility/i }));

    await waitFor(() => {
      expect(screen.getByText("Cross-Play OK")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /send invite/i }));

    expect(await screen.findByText("Custom Link Ready")).toBeInTheDocument();
    await waitFor(() => {
      expect(sendCrossplatformInvite).toHaveBeenCalledWith(
        "user-1",
        "friend-1",
        "Steel Battalion X",
        "steam",
        null,
        "possible",
      );
    });
    expect(checkInviteFeasibility).toHaveBeenCalledWith(
      "Steel Battalion X",
      ["gog", "steam"],
      ["xbox"],
    );
    await waitFor(() => {
      expect(createGameInviteShareToken).toHaveBeenCalledWith("user-1", "invite-123", "steam");
      expect(screen.getByText(`Server Token ${shareTokenHint}`)).toBeInTheDocument();
    });
    expect(screen.getByText(/Web Fallback/i).parentElement).toHaveTextContent(
      `/invite/${shareToken}?game=Steel+Battalion+X&platform=steam`,
    );
    expect(screen.getByText(/App Deep Link/i).parentElement).toHaveTextContent(
      `oglauncher://join?game=Steel+Battalion+X&platform=steam&invite=${shareToken}`,
    );
  });

  it("fails closed without showing a claimable legacy link when token creation returns null", async () => {
    createGameInviteShareToken.mockResolvedValue(null);

    render(
      <CrossPlatformInvite
        currentUserId="user-1"
        receiverPlatforms={["xbox"]}
        selectedFriendId="friend-1"
        senderPlatforms={["steam"]}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Game title..."), {
      target: { value: "Steel Battalion X" },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /check feasibility/i })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole("button", { name: /check feasibility/i }));

    await waitFor(() => {
      expect(screen.getByText("Cross-Play OK")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /send invite/i }));

    await waitFor(() => {
      expect(createGameInviteShareToken).toHaveBeenCalledWith("user-1", "invite-123", "steam");
    });
    expect(screen.getByText(/Invite sent, but no optional share link was created/i)).toBeVisible();
    expect(screen.queryByText(/Legacy Link/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Web Fallback/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/App Deep Link/i)).not.toBeInTheDocument();
  });

  it("creates a claimable open invite link when no friend is selected", async () => {
    render(
      <CrossPlatformInvite
        currentUserId="user-1"
        receiverPlatforms={[]}
        selectedFriendId={null}
        senderPlatforms={["steam"]}
      />,
    );

    expect(
      await screen.findByText(
        "A one-use server token is required. If token creation fails, no claimable link is shown.",
      ),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Game title..."), {
      target: { value: "Steel Battalion X" },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create share link/i })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole("button", { name: /create share link/i }));

    expect(await screen.findByText("Share link ready!")).toBeInTheDocument();
    await waitFor(() => {
      expect(sendCrossplatformInvite).toHaveBeenCalledWith(
        "user-1",
        null,
        "Steel Battalion X",
        null,
        null,
        "uncertain",
      );
    });
    await waitFor(() => {
      expect(createGameInviteShareToken).toHaveBeenCalledWith("user-1", "invite-123", null);
      expect(screen.getByText(`Server Token ${shareTokenHint}`)).toBeInTheDocument();
    });
  });

  it("clears a generated link when its recipient, game, or platform context changes", async () => {
    const view = render(
      <CrossPlatformInvite
        currentUserId="user-1"
        receiverPlatforms={["xbox"]}
        selectedFriendId="friend-1"
        senderPlatforms={["steam"]}
      />,
    );
    const gameInput = screen.getByPlaceholderText("Game title...");

    fireEvent.change(gameInput, { target: { value: "Steel Battalion X" } });
    fireEvent.click(screen.getByRole("button", { name: /send invite/i }));
    expect(await screen.findByText("Custom Link Ready")).toBeInTheDocument();

    view.rerender(
      <CrossPlatformInvite
        currentUserId="user-1"
        receiverPlatforms={["xbox"]}
        selectedFriendId="friend-2"
        senderPlatforms={["steam"]}
      />,
    );
    await waitFor(() => expect(screen.queryByText("Custom Link Ready")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /send invite/i }));
    expect(await screen.findByText("Custom Link Ready")).toBeInTheDocument();
    fireEvent.change(gameInput, { target: { value: "Neon Circuit" } });
    await waitFor(() => expect(screen.queryByText("Custom Link Ready")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /send invite/i }));
    expect(await screen.findByText("Custom Link Ready")).toBeInTheDocument();
    view.rerender(
      <CrossPlatformInvite
        currentUserId="user-1"
        receiverPlatforms={["xbox"]}
        selectedFriendId="friend-2"
        senderPlatforms={["gog"]}
      />,
    );
    await waitFor(() => expect(screen.queryByText("Custom Link Ready")).not.toBeInTheDocument());
  });

  it("does not report an open share link as ready when the token RPC is unavailable", async () => {
    createGameInviteShareToken.mockRejectedValueOnce(new Error("RPC missing"));
    render(
      <CrossPlatformInvite
        currentUserId="user-1"
        receiverPlatforms={[]}
        selectedFriendId={null}
        senderPlatforms={["steam"]}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Game title..."), {
      target: { value: "Steel Battalion X" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create share link/i }));

    expect(await screen.findByText(/No claimable share link was created/i)).toBeVisible();
    expect(screen.queryByText("Share link ready!")).not.toBeInTheDocument();
    expect(screen.queryByText("Custom Link Ready")).not.toBeInTheDocument();
  });

  it("binds a feasibility result to the exact signed-in user context", async () => {
    const view = render(
      <CrossPlatformInvite
        currentUserId="user-1"
        receiverPlatforms={["xbox"]}
        selectedFriendId="friend-1"
        senderPlatforms={["steam"]}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Game title..."), {
      target: { value: "Steel Battalion X" },
    });
    fireEvent.click(screen.getByRole("button", { name: /check feasibility/i }));
    expect(await screen.findByText("Cross-Play OK")).toBeInTheDocument();

    view.rerender(
      <CrossPlatformInvite
        currentUserId="user-2"
        receiverPlatforms={["xbox"]}
        selectedFriendId="friend-1"
        senderPlatforms={["steam"]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /send invite/i }));

    await waitFor(() => {
      expect(sendCrossplatformInvite).toHaveBeenLastCalledWith(
        "user-2",
        "friend-1",
        "Steel Battalion X",
        null,
        null,
        "uncertain",
      );
    });
  });

  it("synchronously blocks duplicate sends before React can disable the button", async () => {
    let resolveInvite: ((value: { id: string }) => void) | undefined;
    sendCrossplatformInvite.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveInvite = resolve;
      }),
    );

    render(
      <CrossPlatformInvite
        currentUserId="user-1"
        receiverPlatforms={["xbox"]}
        selectedFriendId="friend-1"
        senderPlatforms={["steam"]}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Game title..."), {
      target: { value: "Steel Battalion X" },
    });
    const sendButton = screen.getByRole("button", { name: /send invite/i });

    act(() => {
      sendButton.click();
      sendButton.click();
    });

    expect(sendCrossplatformInvite).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /sending/i })).toBeDisabled();
    expect(screen.getByPlaceholderText("Game title...")).toBeDisabled();
    expect(screen.getByRole("button", { name: /friend invite/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /share link/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /check feasibility/i })).toBeDisabled();

    await act(async () => {
      resolveInvite?.({ id: "invite-123" });
      await Promise.resolve();
    });
    expect(await screen.findByText("Custom Link Ready")).toBeInTheDocument();
  });

  it("does not mint or display a link after the submitted context becomes stale", async () => {
    let resolveInvite: ((value: { id: string }) => void) | undefined;
    sendCrossplatformInvite.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveInvite = resolve;
      }),
    );

    const view = render(
      <CrossPlatformInvite
        currentUserId="user-1"
        receiverPlatforms={["xbox"]}
        selectedFriendId="friend-1"
        senderPlatforms={["steam"]}
      />,
    );
    const gameInput = screen.getByPlaceholderText("Game title...");
    fireEvent.change(gameInput, { target: { value: "Steel Battalion X" } });
    fireEvent.click(screen.getByRole("button", { name: /send invite/i }));
    view.rerender(
      <CrossPlatformInvite
        currentUserId="user-2"
        receiverPlatforms={["xbox"]}
        selectedFriendId="friend-1"
        senderPlatforms={["steam"]}
      />,
    );

    await act(async () => {
      resolveInvite?.({ id: "stale-invite" });
      await Promise.resolve();
    });

    expect(createGameInviteShareToken).not.toHaveBeenCalled();
    expect(screen.queryByText("Invite sent!")).not.toBeInTheDocument();
    expect(screen.queryByText("Custom Link Ready")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send invite/i })).not.toBeDisabled();
  });
});
