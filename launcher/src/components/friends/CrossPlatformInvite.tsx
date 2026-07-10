import { AlertTriangle, CheckCircle, Copy, ExternalLink, HelpCircle, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { InviteFeasibility, PlatformType } from "../../lib/types/friends";
import {
  checkInviteFeasibility,
  createGameInviteShareToken,
  sendCrossplatformInvite,
  type InviteFeasibilityResult,
} from "../../lib/supabase/social";
import { buildInviteDeepLink, buildInviteFallbackUrl } from "../../lib/invite-links";

interface CrossPlatformInviteProps {
  currentUserId: string;
  selectedFriendId: string | null;
  senderPlatforms: PlatformType[];
  receiverPlatforms: PlatformType[];
}

interface SentInviteLink {
  deepLink: string;
  expiresAt: string | null;
  gameTitle: string;
  platform: PlatformType | null;
  source: "server";
  token: string;
  tokenHint: string;
  webUrl: string;
}

interface ContextBoundValue<T> {
  contextKey: string;
  value: T;
}

type InviteMode = "friend" | "share";

function buildSentInviteLink({
  expiresAt = null,
  gameTitle,
  platform,
  source,
  token,
  tokenHint = token.slice(0, 10),
}: {
  expiresAt?: string | null;
  gameTitle: string;
  platform: PlatformType | null;
  source: SentInviteLink["source"];
  token: string;
  tokenHint?: string;
}): SentInviteLink {
  const linkInput = { gameTitle, platform, token };
  return {
    deepLink: buildInviteDeepLink(linkInput),
    expiresAt,
    gameTitle,
    platform,
    source,
    token,
    tokenHint,
    webUrl: buildInviteFallbackUrl(linkInput),
  };
}

function FeasibilityBadge({ feasibility }: { feasibility: InviteFeasibility }) {
  switch (feasibility) {
    case "possible":
      return (
        <span className="inline-flex items-center gap-1 border border-black bg-[#087d6d] px-2 py-0.5 text-[8px] font-black text-white uppercase">
          <CheckCircle className="h-2.5 w-2.5" />
          Cross-Play OK
        </span>
      );
    case "uncertain":
      return (
        <span className="inline-flex items-center gap-1 border border-black bg-[#f56c2d] px-2 py-0.5 text-[8px] font-black text-white uppercase">
          <HelpCircle className="h-2.5 w-2.5" />
          Uncertain
        </span>
      );
    case "impossible":
      return (
        <span className="inline-flex items-center gap-1 border border-black bg-[#b7102a] px-2 py-0.5 text-[8px] font-black text-white uppercase">
          <AlertTriangle className="h-2.5 w-2.5" />
          Not Supported
        </span>
      );
  }
}

export function CrossPlatformInvite({
  currentUserId,
  selectedFriendId,
  senderPlatforms,
  receiverPlatforms,
}: CrossPlatformInviteProps) {
  const [inviteMode, setInviteMode] = useState<InviteMode>(selectedFriendId ? "friend" : "share");
  const isOpenRecipientLink = inviteMode === "share" || !selectedFriendId;
  const [gameTitle, setGameTitle] = useState("");
  const [feasibilityResult, setFeasibilityResult] =
    useState<ContextBoundValue<InviteFeasibilityResult> | null>(null);
  const [checking, setChecking] = useState(false);
  const [sentContextKey, setSentContextKey] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [sentInviteLink, setSentInviteLink] = useState<ContextBoundValue<SentInviteLink> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const inviteContextKey = JSON.stringify({
    currentUserId,
    gameTitle: gameTitle.trim(),
    inviteMode,
    isOpenRecipientLink,
    receiverPlatforms,
    selectedFriendId,
    senderPlatforms,
  });
  const currentInviteContextKey = useRef(inviteContextKey);
  const sendInFlight = useRef(false);
  currentInviteContextKey.current = inviteContextKey;
  const activeFeasibilityResult =
    feasibilityResult?.contextKey === inviteContextKey ? feasibilityResult.value : null;
  const activeSentInviteLink =
    sentInviteLink?.contextKey === inviteContextKey ? sentInviteLink.value : null;
  const sent = sentContextKey === inviteContextKey;

  useEffect(() => {
    if (!selectedFriendId) {
      setInviteMode("share");
    }
  }, [selectedFriendId]);

  useEffect(() => {
    setSentInviteLink(null);
    setSentContextKey(null);
    setCopiedLink(null);
    setFeasibilityResult(null);
    setError(null);
    setChecking(false);
  }, [inviteContextKey]);

  async function handleCheckFeasibility() {
    const checkedGameTitle = gameTitle.trim();
    if (!checkedGameTitle) return;
    const checkedContextKey = inviteContextKey;
    const checkedSenderPlatforms = [...senderPlatforms];
    const checkedReceiverPlatforms = [...receiverPlatforms];
    setChecking(true);
    setFeasibilityResult(null);
    setError(null);
    try {
      const result = await checkInviteFeasibility(
        checkedGameTitle,
        checkedSenderPlatforms,
        checkedReceiverPlatforms,
      );
      if (currentInviteContextKey.current !== checkedContextKey) return;
      setFeasibilityResult({ contextKey: checkedContextKey, value: result });
    } catch (err) {
      if (currentInviteContextKey.current !== checkedContextKey) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (currentInviteContextKey.current === checkedContextKey) setChecking(false);
    }
  }

  async function handleSend() {
    const submittedGameTitle = gameTitle.trim();
    if (!submittedGameTitle || sendInFlight.current) return;

    const submittedContextKey = inviteContextKey;
    const submittedUserId = currentUserId;
    const submittedReceiverId = isOpenRecipientLink ? null : selectedFriendId;
    const submittedFeasibilityResult =
      feasibilityResult?.contextKey === submittedContextKey ? feasibilityResult.value : null;
    sendInFlight.current = true;
    setSending(true);
    setError(null);
    setSentContextKey(null);
    setSentInviteLink(null);
    setCopiedLink(null);
    try {
      const selectedPlatform = submittedFeasibilityResult?.compatibleSenderPlatform ?? null;
      const invite = await sendCrossplatformInvite(
        submittedUserId,
        submittedReceiverId,
        submittedGameTitle,
        selectedPlatform,
        null,
        submittedFeasibilityResult?.feasibility ?? "uncertain",
      );
      if (currentInviteContextKey.current !== submittedContextKey) return;

      const shareToken = await createGameInviteShareToken(
        submittedUserId,
        invite.id,
        selectedPlatform,
      ).catch(() => null);
      if (currentInviteContextKey.current !== submittedContextKey) return;
      if (!shareToken) {
        setSentContextKey(submittedReceiverId === null ? null : submittedContextKey);
        setSentInviteLink(null);
        setError(
          submittedReceiverId === null
            ? "No claimable share link was created. The server token service is unavailable."
            : "Invite sent, but no optional share link was created.",
        );
        return;
      }

      setSentContextKey(submittedContextKey);
      setSentInviteLink({
        contextKey: submittedContextKey,
        value: buildSentInviteLink({
          expiresAt: shareToken.expiresAt,
          gameTitle: shareToken.gameTitle || submittedGameTitle,
          platform: shareToken.platform ?? selectedPlatform,
          source: "server",
          token: shareToken.token,
          tokenHint: shareToken.tokenHint,
        }),
      });
    } catch (err) {
      if (currentInviteContextKey.current !== submittedContextKey) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      sendInFlight.current = false;
      setSending(false);
    }
  }

  async function copyLink(value: string, label: string) {
    setError(null);
    try {
      await navigator.clipboard.writeText(value);
      setCopiedLink(label);
    } catch {
      setError("Could not copy invite link.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 border-b-2 border-black pb-2">
        <Send className="h-4 w-4 text-[#b7102a]" />
        <p className="neo-copy text-[10px] font-black tracking-[0.12em] text-[#171411] uppercase">
          Cross-Platform Invite
        </p>
      </div>

      <div className="space-y-2">
        <input
          className="neo-copy w-full border-2 border-black bg-[#fff9ed] px-3 py-2 text-[11px] font-bold outline-none placeholder:text-[#655f58]"
          maxLength={160}
          placeholder="Game title..."
          value={gameTitle}
          disabled={sending}
          onChange={(e) => {
            setGameTitle(e.target.value);
          }}
        />

        <div className="grid grid-cols-2 border-2 border-black bg-[#efe6d4] p-1 shadow-[1px_1px_0_#171411]">
          <button
            aria-pressed={!isOpenRecipientLink}
            className={`neo-copy h-7 border-2 border-black text-[8px] font-black tracking-[0.08em] uppercase ${
              !isOpenRecipientLink
                ? "bg-[#087d6d] text-white"
                : "bg-[#fff9ed] text-[#171411] disabled:text-[#8a8177]"
            }`}
            disabled={!selectedFriendId || sending}
            type="button"
            onClick={() => setInviteMode("friend")}
          >
            Friend Invite
          </button>
          <button
            aria-pressed={isOpenRecipientLink}
            className={`neo-copy h-7 border-2 border-black text-[8px] font-black tracking-[0.08em] uppercase ${
              isOpenRecipientLink ? "bg-[#b7102a] text-white" : "bg-[#fff9ed] text-[#171411]"
            }`}
            disabled={sending}
            type="button"
            onClick={() => setInviteMode("share")}
          >
            Share Link
          </button>
        </div>

        {isOpenRecipientLink ? (
          <p className="neo-copy border-2 border-black bg-[#efe6d4] px-2 py-1 text-[9px] font-black tracking-[0.08em] text-[#5b403f] uppercase">
            A one-use server token is required. If token creation fails, no claimable link is shown.
          </p>
        ) : null}

        <div className="flex gap-2">
          <button
            className="neo-copy h-8 border-2 border-black bg-[#efe6d4] px-3 text-[9px] font-black text-[#171411] uppercase shadow-[1px_1px_0_#171411] disabled:opacity-50"
            disabled={!gameTitle.trim() || checking || sending}
            type="button"
            onClick={() => void handleCheckFeasibility()}
          >
            {checking ? "Checking..." : "Check Feasibility"}
          </button>
          <button
            className="neo-copy h-8 border-2 border-black bg-[#087d6d] px-3 text-[9px] font-black text-white uppercase shadow-[1px_1px_0_#171411] disabled:opacity-50"
            disabled={!gameTitle.trim() || sending}
            type="button"
            onClick={() => void handleSend()}
          >
            {sending
              ? isOpenRecipientLink
                ? "Creating..."
                : "Sending..."
              : isOpenRecipientLink
                ? "Create Share Link"
                : "Send Invite"}
          </button>
        </div>

        {activeFeasibilityResult && (
          <div className="flex items-center gap-2">
            <FeasibilityBadge feasibility={activeFeasibilityResult.feasibility} />
            {activeFeasibilityResult.feasibility === "impossible" && (
              <p className="neo-copy text-[9px] font-bold text-[#b7102a]">
                This game may not support cross-platform play between your platforms.
              </p>
            )}
            {activeFeasibilityResult.feasibility === "uncertain" && (
              <p className="neo-copy text-[9px] font-bold text-[#55504a]">
                Cannot verify cross-play support. Link created as-is.
              </p>
            )}
          </div>
        )}

        {sent && (
          <p className="neo-copy border-2 border-black bg-[#087d6d] p-2 text-[10px] font-bold text-white uppercase">
            {isOpenRecipientLink ? "Share link ready!" : "Invite sent!"}
          </p>
        )}
        {activeSentInviteLink && (
          <div className="neo-dots border-[3px] border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-black pb-2">
              <p className="neo-copy flex items-center gap-2 text-[10px] font-black tracking-[0.12em] text-[#171411] uppercase">
                <ExternalLink className="h-3.5 w-3.5 text-[#b7102a]" />
                Custom Link Ready
              </p>
              <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[8px] font-black text-[#171411] uppercase">
                Server Token {activeSentInviteLink.tokenHint}
              </span>
            </div>
            <div className="mt-3 grid gap-2">
              <LinkReadout label="Web Fallback" value={activeSentInviteLink.webUrl} />
              <LinkReadout label="App Deep Link" value={activeSentInviteLink.deepLink} />
            </div>
            {activeSentInviteLink.source === "server" && activeSentInviteLink.expiresAt ? (
              <p className="neo-copy mt-2 border-2 border-black bg-[#efe6d4] px-2 py-1 text-[8px] font-black tracking-[0.08em] text-[#655f58] uppercase">
                One-use share link expires{" "}
                {new Date(activeSentInviteLink.expiresAt).toLocaleString()}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="neo-copy inline-flex h-8 items-center gap-2 border-2 border-black bg-[#efe6d4] px-3 text-[9px] font-black text-[#171411] uppercase shadow-[2px_2px_0_#171411]"
                type="button"
                onClick={() => void copyLink(activeSentInviteLink.webUrl, "Web")}
              >
                <Copy className="h-3 w-3" />
                Copy Web
              </button>
              <button
                className="neo-copy inline-flex h-8 items-center gap-2 border-2 border-black bg-[#efe6d4] px-3 text-[9px] font-black text-[#171411] uppercase shadow-[2px_2px_0_#171411]"
                type="button"
                onClick={() => void copyLink(activeSentInviteLink.deepLink, "App")}
              >
                <Copy className="h-3 w-3" />
                Copy App
              </button>
              <a
                className="neo-copy inline-flex h-8 items-center gap-2 border-2 border-black bg-[#087d6d] px-3 text-[9px] font-black text-white uppercase shadow-[2px_2px_0_#171411]"
                href={activeSentInviteLink.deepLink}
              >
                <ExternalLink className="h-3 w-3" />
                Open App
              </a>
              {copiedLink ? (
                <span className="neo-copy inline-flex h-8 items-center border-2 border-black bg-[#8cf5e4] px-3 text-[9px] font-black text-[#171411] uppercase">
                  {copiedLink} copied
                </span>
              ) : null}
            </div>
          </div>
        )}
        {error && (
          <p className="neo-copy border-2 border-black bg-[#b7102a] p-2 text-[10px] font-bold text-white uppercase">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function LinkReadout({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-2 border-black bg-[#f5eedf] p-2">
      <p className="neo-copy text-[8px] font-black tracking-[0.12em] text-[#655f58] uppercase">
        {label}
      </p>
      <p className="neo-copy mt-1 text-[9px] leading-4 font-bold break-all text-[#171411]">
        {value}
      </p>
    </div>
  );
}
