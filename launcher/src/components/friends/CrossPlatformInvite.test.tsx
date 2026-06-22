import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  createGameInviteShareToken: (inviteId: string, platform: PlatformType | null) =>
    createGameInviteShareToken(inviteId, platform),
  sendCrossplatformInvite: (
    receiverId: string | null,
    gameTitle: string,
    platform: PlatformType | null,
    launchUri: string | null,
    feasibility: InviteFeasibility,
  ) => sendCrossplatformInvite(receiverId, gameTitle, platform, launchUri, feasibility),
}));

describe("CrossPlatformInvite", () => {
  beforeEach(() => {
    checkInviteFeasibility.mockReset();
    createGameInviteShareToken.mockReset();
    sendCrossplatformInvite.mockReset();
    checkInviteFeasibility.mockResolvedValue("possible");
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

    expect(await screen.findByText("Custom Link Ready")).toBeInTheDocument();
    await waitFor(() => {
      expect(sendCrossplatformInvite).toHaveBeenCalledWith(
        "friend-1",
        "Steel Battalion X",
        "steam",
        null,
        "possible",
      );
    });
    expect(checkInviteFeasibility).toHaveBeenCalledWith("Steel Battalion X", ["steam"], ["xbox"]);
    await waitFor(() => {
      expect(createGameInviteShareToken).toHaveBeenCalledWith("invite-123", "steam");
      expect(screen.getByText(`Server Token ${shareTokenHint}`)).toBeInTheDocument();
    });
    expect(screen.getByText(/Web Fallback/i).parentElement).toHaveTextContent(
      `/invite/${shareToken}?game=Steel+Battalion+X&platform=steam`,
    );
    expect(screen.getByText(/App Deep Link/i).parentElement).toHaveTextContent(
      `oglauncher://join?game=Steel+Battalion+X&platform=steam&invite=${shareToken}`,
    );
  });

  it("keeps the legacy invite link when server token creation returns null", async () => {
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
      expect(screen.getByText(/Legacy Link invite-/i)).toBeInTheDocument();
      expect(createGameInviteShareToken).toHaveBeenCalledWith("invite-123", "steam");
    });
    expect(screen.getByText(/Web Fallback/i).parentElement).toHaveTextContent(
      "/invite/invite-123?game=Steel+Battalion+X&platform=steam",
    );
    expect(screen.getByText(/App Deep Link/i).parentElement).toHaveTextContent(
      "oglauncher://join?game=Steel+Battalion+X&platform=steam&invite=invite-123",
    );
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
        "Any signed-in OG Launcher player with this link can accept it. First accept claims it.",
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
        null,
        "Steel Battalion X",
        "steam",
        null,
        "uncertain",
      );
    });
    await waitFor(() => {
      expect(createGameInviteShareToken).toHaveBeenCalledWith("invite-123", "steam");
      expect(screen.getByText(`Server Token ${shareTokenHint}`)).toBeInTheDocument();
    });
  });
});
