import { fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InviteFallbackPage } from "./InviteFallbackPage";

const shareToken =
  "ogl_eyJ0eXAiOiJvZ2wtc2hhcmUiLCJhbGciOiJIUzI1NiIsImtpZCI6InNoYXJlLXRva2VuLXYxIn0.eyJ2IjoxLCJqdGkiOiJpbnZpdGUtMTIzIiwiaWF0IjoxNzgxMTEyODAwLCJleHAiOjE3ODExMTQ2MDB9.VZRK5sql2xId2JWnCCprB3ViZnIJeWDC8BEvzLA9s-o";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  proveInviteHostedReplay: vi.fn(),
  redeemShareToken: vi.fn(),
  resolveShareToken: vi.fn(),
}));

vi.mock("../hooks/useCurrentUser", () => ({
  useCurrentUser: () => mocks.currentUser(),
}));

vi.mock("../lib/supabase/social", () => ({
  proveInviteHostedReplay: (token: string) => mocks.proveInviteHostedReplay(token),
  redeemShareToken: (token: string) => mocks.redeemShareToken(token),
  resolveShareToken: (token: string) => mocks.resolveShareToken(token),
}));

function findButton(container: HTMLElement, label: RegExp) {
  const button = Array.from(container.querySelectorAll("button")).find((candidate) =>
    label.test(candidate.textContent ?? ""),
  );

  if (!button) throw new Error(`Button not found: ${label}`);
  return button;
}

function renderInviteRoute(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<InviteFallbackPage />} path="/invite/:token" />
      </Routes>
    </MemoryRouter>,
  );
}

describe("InviteFallbackPage", () => {
  beforeEach(() => {
    mocks.currentUser.mockReset();
    mocks.proveInviteHostedReplay.mockReset();
    mocks.redeemShareToken.mockReset();
    mocks.resolveShareToken.mockReset();
    mocks.currentUser.mockReturnValue({
      error: null,
      isConfigured: true,
      isLoading: false,
      session: null,
      signOut: vi.fn(),
      user: null,
    });
    mocks.proveInviteHostedReplay.mockResolvedValue(null);
    mocks.redeemShareToken.mockResolvedValue(null);
    mocks.resolveShareToken.mockResolvedValue(null);
  });

  it("builds an encoded launcher deep link from route and query params", async () => {
    const { container } = renderInviteRoute(
      "/invite/token value?game=Cyber Drift&platform=PC/Steam",
    );

    const expectedLink =
      "oglauncher://join?game=Cyber+Drift&platform=PC%2FSteam&invite=token+value";

    await waitFor(() => {
      expect(container).toHaveTextContent(expectedLink);
    });

    expect(container.querySelector<HTMLAnchorElement>('a[href^="oglauncher://join"]')?.href).toBe(
      expectedLink,
    );
    await waitFor(() => {
      expect(container).toHaveTextContent("fallback context only");
      expect(mocks.resolveShareToken).toHaveBeenCalledWith("token value");
    });
  });

  it("omits blank optional params while preserving the invite token", async () => {
    const { container } = renderInviteRoute("/invite/invite%2F123?game=&platform=%20%20");

    await waitFor(() => {
      expect(container).toHaveTextContent("oglauncher://join?invite=invite%2F123");
      expect(container).toHaveTextContent("fallback context only");
    });
  });

  it("shows hosted invite readiness evidence without marking local preview as hosted-ready", async () => {
    const { container } = renderInviteRoute("/invite/local-token?game=Cyber Drift&platform=steam");

    await waitFor(() => {
      expect(container).toHaveTextContent("Invite Readiness");
      expect(container).toHaveTextContent("Web Fallback");
      expect(container).toHaveTextContent("App Deep Link");
      expect(container).toHaveTextContent("Share RPC");
      expect(container).toHaveTextContent("Hosted Web");
      expect(container).toHaveTextContent("Set VITE_INVITE_FALLBACK_ORIGIN");
      expect(container).toHaveTextContent("Token Rehearsal");
      expect(container).toHaveTextContent("Create Share Token");
      expect(container).toHaveTextContent("No raw token stored");
      expect(container).toHaveTextContent("Replay Origin");
      expect(container).toHaveTextContent("No production deployment claim");
      expect(container).toHaveTextContent("fallback context only");
    });
  });

  it("does not treat the legacy hosted-ready query flag as proof", async () => {
    const { container } = renderInviteRoute("/invite/local-token?verify=invite-hosted-ready");

    await waitFor(() => {
      expect(container).toHaveTextContent("Invite Readiness");
      expect(container).toHaveTextContent("Hosted Web");
      expect(container).toHaveTextContent("Set VITE_INVITE_FALLBACK_ORIGIN");
      expect(container).toHaveTextContent("fallback context only");
    });
    expect(container).not.toHaveTextContent("Hosted web fallback and token redeem path");
    expect(container).not.toHaveTextContent("Proof captured");
  });

  it("uses server resolved game and platform when a share token lookup succeeds", async () => {
    mocks.resolveShareToken.mockResolvedValue({
      expiresAt: "2026-06-10T16:00:00.000Z",
      gameInviteId: "invite-123",
      gameTitle: "Neon Circuit",
      platform: "steam",
    });

    const { container } = renderInviteRoute(`/invite/${shareToken}`);

    await waitFor(() => {
      expect(container).toHaveTextContent("Token Lookup // server verified");
    });

    expect(mocks.resolveShareToken).toHaveBeenCalledWith(shareToken);
    expect(container).toHaveTextContent("Neon Circuit");
    expect(container).toHaveTextContent("steam");
    expect(container).toHaveTextContent(
      `oglauncher://join?game=Neon+Circuit&platform=steam&invite=${shareToken}`,
    );
  });

  it("shows a login-required accept notice when signed out", async () => {
    mocks.resolveShareToken.mockResolvedValue({
      expiresAt: "2026-06-10T16:00:00.000Z",
      gameInviteId: "invite-123",
      gameTitle: "Neon Circuit",
      platform: "steam",
    });

    const { container } = renderInviteRoute(`/invite/${shareToken}`);

    await waitFor(() => {
      expect(container).toHaveTextContent("Login required to claim this share link");
      expect(container).toHaveTextContent("Token Lookup // server verified");
    });
    expect(container.querySelector<HTMLAnchorElement>('a[href="/auth"]')).toHaveTextContent(
      "Login",
    );
    expect(mocks.redeemShareToken).not.toHaveBeenCalled();
  });

  it("redeems a server-verified token for a signed-in receiver", async () => {
    mocks.currentUser.mockReturnValue({
      error: null,
      isConfigured: true,
      isLoading: false,
      session: { user: { id: "receiver-1" } },
      signOut: vi.fn(),
      user: { id: "receiver-1" },
    });
    mocks.resolveShareToken.mockResolvedValue({
      expiresAt: "2026-06-10T16:00:00.000Z",
      gameInviteId: "invite-123",
      gameTitle: "Neon Circuit",
      platform: "steam",
    });
    mocks.redeemShareToken.mockResolvedValue({
      acceptedAt: "2026-06-10T15:45:00.000Z",
      gameInviteId: "invite-123",
      gameTitle: "Neon Circuit",
      platform: "steam",
      status: "accepted",
    });

    const { container } = renderInviteRoute(`/invite/${shareToken}`);

    await waitFor(() => {
      expect(findButton(container, /accept invite/i)).not.toBeDisabled();
    });

    fireEvent.click(findButton(container, /accept invite/i));

    await waitFor(() => {
      expect(container).toHaveTextContent(
        "Invite accepted. This link is now claimed by your account.",
      );
      expect(container).toHaveTextContent("Accepted locally");
      expect(container).toHaveTextContent("Replay Guard");
      expect(container).toHaveTextContent("No replay accepted");
      expect(container).toHaveTextContent(
        "Invite accepted; hosted replay/origin proof is not available yet.",
      );
    });
    expect(mocks.redeemShareToken).toHaveBeenCalledWith(shareToken);
    expect(mocks.proveInviteHostedReplay).toHaveBeenCalledWith(shareToken);
  });

  it("shows hosted replay and origin proof after accepted redeem", async () => {
    mocks.currentUser.mockReturnValue({
      error: null,
      isConfigured: true,
      isLoading: false,
      session: { user: { id: "receiver-1" } },
      signOut: vi.fn(),
      user: { id: "receiver-1" },
    });
    mocks.resolveShareToken.mockResolvedValue({
      expiresAt: "2026-06-10T16:00:00.000Z",
      gameInviteId: "invite-123",
      gameTitle: "Neon Circuit",
      platform: "steam",
    });
    mocks.redeemShareToken.mockResolvedValue({
      acceptedAt: "2026-06-10T15:45:00.000Z",
      gameInviteId: "invite-123",
      gameTitle: "Neon Circuit",
      platform: "steam",
      status: "accepted",
    });
    mocks.proveInviteHostedReplay.mockResolvedValue({
      checkedAt: "2026-06-13T09:30:00.000Z",
      deploymentScope: "hosted-staging",
      gameInviteId: "invite-123",
      gameTitle: "Neon Circuit",
      guards: ["No raw token echoed", "No token hash returned"],
      inviteStatus: "accepted",
      maxUses: 1,
      origin: "https://invite.og-launcher.test",
      originVerified: true,
      platform: "steam",
      replayDenied: true,
      replayError: "Invite token is not redeemable.",
      tokenHint: "ogl_header...nature",
      usedAt: "2026-06-13T09:29:20.000Z",
      usesCount: 1,
    });

    const { container } = renderInviteRoute(`/invite/${shareToken}`);

    await waitFor(() => {
      expect(findButton(container, /accept invite/i)).not.toBeDisabled();
    });

    fireEvent.click(findButton(container, /accept invite/i));

    await waitFor(() => {
      expect(container).toHaveTextContent("Hosted staging proof captured");
      expect(container).toHaveTextContent("Proof captured");
      expect(container).toHaveTextContent("Allowed browser Origin matched");
      expect(container).toHaveTextContent("Invite token is not redeemable.");
      expect(container).toHaveTextContent("No token hash returned");
      expect(container).toHaveTextContent("No production deployment claim");
    });
    expect(mocks.proveInviteHostedReplay).toHaveBeenCalledWith(shareToken);
  });

  it("shows a redeem error when the accept RPC rejects", async () => {
    mocks.currentUser.mockReturnValue({
      error: null,
      isConfigured: true,
      isLoading: false,
      session: { user: { id: "receiver-1" } },
      signOut: vi.fn(),
      user: { id: "receiver-1" },
    });
    mocks.resolveShareToken.mockResolvedValue({
      expiresAt: "2026-06-10T16:00:00.000Z",
      gameInviteId: "invite-123",
      gameTitle: "Neon Circuit",
      platform: "steam",
    });
    mocks.redeemShareToken.mockRejectedValue(new Error("Invite token is not redeemable."));

    const { container } = renderInviteRoute(`/invite/${shareToken}`);

    await waitFor(() => {
      expect(findButton(container, /accept invite/i)).not.toBeDisabled();
    });

    fireEvent.click(findButton(container, /accept invite/i));

    await waitFor(() => {
      expect(container).toHaveTextContent("Invite token is not redeemable.");
    });
  });
});
