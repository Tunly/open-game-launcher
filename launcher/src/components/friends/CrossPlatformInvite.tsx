import { AlertTriangle, CheckCircle, Copy, ExternalLink, HelpCircle, Send } from "lucide-react";
import { useEffect, useState } from "react";

import type { InviteFeasibility, PlatformType } from "../../lib/types/friends";
import {
  checkInviteFeasibility,
  createGameInviteShareToken,
  sendCrossplatformInvite,
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
  source: "legacy" | "server";
  token: string;
  tokenHint: string;
  webUrl: string;
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
        <span className="inline-flex items-center gap-1 border border-black bg-[#087d6d] px-2 py-0.5 text-[8px] font-black uppercase text-white">
          <CheckCircle className="h-2.5 w-2.5" />
          Cross-Play OK
        </span>
      );
    case "uncertain":
      return (
        <span className="inline-flex items-center gap-1 border border-black bg-[#f56c2d] px-2 py-0.5 text-[8px] font-black uppercase text-white">
          <HelpCircle className="h-2.5 w-2.5" />
          Uncertain
        </span>
      );
    case "impossible":
      return (
        <span className="inline-flex items-center gap-1 border border-black bg-[#b7102a] px-2 py-0.5 text-[8px] font-black uppercase text-white">
          <AlertTriangle className="h-2.5 w-2.5" />
          Not Supported
        </span>
      );
  }
}

export function CrossPlatformInvite({
  selectedFriendId,
  senderPlatforms,
  receiverPlatforms,
}: CrossPlatformInviteProps) {
  const [inviteMode, setInviteMode] = useState<InviteMode>(selectedFriendId ? "friend" : "share");
  const isOpenRecipientLink = inviteMode === "share" || !selectedFriendId;
  const [gameTitle, setGameTitle] = useState("");
  const [feasibility, setFeasibility] = useState<InviteFeasibility | null>(null);
  const [checking, setChecking] = useState(false);
  const [sent, setSent] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [sentInviteLink, setSentInviteLink] = useState<SentInviteLink | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedFriendId) {
      setInviteMode("share");
    }
  }, [selectedFriendId]);

  async function handleCheckFeasibility() {
    if (!gameTitle.trim()) return;
    setChecking(true);
    setFeasibility(null);
    try {
      const result = await checkInviteFeasibility(gameTitle, senderPlatforms, receiverPlatforms);
      setFeasibility(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  }

  async function handleSend() {
    if (!gameTitle.trim()) return;
    setError(null);
    setSent(false);
    setCopiedLink(null);
    try {
      const selectedPlatform = senderPlatforms[0] ?? null;
      const submittedGameTitle = gameTitle.trim();
      const invite = await sendCrossplatformInvite(
        isOpenRecipientLink ? null : selectedFriendId,
        submittedGameTitle,
        selectedPlatform,
        null,
        feasibility ?? "uncertain",
      );
      setSent(true);
      setSentInviteLink(
        buildSentInviteLink({
          gameTitle: submittedGameTitle,
          platform: selectedPlatform,
          source: "legacy",
          token: invite.id,
        }),
      );
      setGameTitle("");
      setFeasibility(null);

      void createGameInviteShareToken(invite.id, selectedPlatform)
        .then((shareToken) => {
          if (!shareToken) return;
          setSentInviteLink(
            buildSentInviteLink({
              expiresAt: shareToken.expiresAt,
              gameTitle: shareToken.gameTitle || submittedGameTitle,
              platform: shareToken.platform ?? selectedPlatform,
              source: "server",
              token: shareToken.token,
              tokenHint: shareToken.tokenHint,
            }),
          );
        })
        .catch(() => {
          // The invite was sent successfully; keep the local fallback link if token RPC fails.
        });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
        <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#171411]">
          Cross-Platform Invite
        </p>
      </div>

      <div className="space-y-2">
        <input
          className="neo-copy w-full border-2 border-black bg-[#fff9ed] px-3 py-2 text-[11px] font-bold outline-none placeholder:text-[#655f58]"
          maxLength={160}
          placeholder="Game title..."
          value={gameTitle}
          onChange={(e) => {
            setGameTitle(e.target.value);
            setFeasibility(null);
            setSent(false);
            setCopiedLink(null);
          }}
        />

        <div className="grid grid-cols-2 border-2 border-black bg-[#efe6d4] p-1 shadow-[1px_1px_0_#171411]">
          <button
            aria-pressed={!isOpenRecipientLink}
            className={`neo-copy h-7 border-2 border-black text-[8px] font-black uppercase tracking-[0.08em] ${
              !isOpenRecipientLink
                ? "bg-[#087d6d] text-white"
                : "bg-[#fff9ed] text-[#171411] disabled:text-[#8a8177]"
            }`}
            disabled={!selectedFriendId}
            type="button"
            onClick={() => setInviteMode("friend")}
          >
            Friend Invite
          </button>
          <button
            aria-pressed={isOpenRecipientLink}
            className={`neo-copy h-7 border-2 border-black text-[8px] font-black uppercase tracking-[0.08em] ${
              isOpenRecipientLink ? "bg-[#b7102a] text-white" : "bg-[#fff9ed] text-[#171411]"
            }`}
            type="button"
            onClick={() => setInviteMode("share")}
          >
            Share Link
          </button>
        </div>

        {isOpenRecipientLink ? (
          <p className="neo-copy border-2 border-black bg-[#efe6d4] px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-[#5b403f]">
            Any signed-in OG Launcher player with this link can accept it. First accept claims it.
          </p>
        ) : null}

        <div className="flex gap-2">
          <button
            className="neo-copy h-8 border-2 border-black bg-[#efe6d4] px-3 text-[9px] font-black uppercase text-[#171411] shadow-[1px_1px_0_#171411] disabled:opacity-50"
            disabled={!gameTitle.trim() || checking}
            type="button"
            onClick={() => void handleCheckFeasibility()}
          >
            {checking ? "Checking..." : "Check Feasibility"}
          </button>
          <button
            className="neo-copy h-8 border-2 border-black bg-[#087d6d] px-3 text-[9px] font-black uppercase text-white shadow-[1px_1px_0_#171411] disabled:opacity-50"
            disabled={!gameTitle.trim()}
            type="button"
            onClick={() => void handleSend()}
          >
            {isOpenRecipientLink ? "Create Share Link" : "Send Invite"}
          </button>
        </div>

        {feasibility && (
          <div className="flex items-center gap-2">
            <FeasibilityBadge feasibility={feasibility} />
            {feasibility === "impossible" && (
              <p className="neo-copy text-[9px] font-bold text-[#b7102a]">
                This game may not support cross-platform play between your platforms.
              </p>
            )}
            {feasibility === "uncertain" && (
              <p className="neo-copy text-[9px] font-bold text-[#55504a]">
                Cannot verify cross-play support. Link created as-is.
              </p>
            )}
          </div>
        )}

        {sent && (
          <p className="neo-copy border-2 border-black bg-[#087d6d] p-2 text-[10px] font-bold uppercase text-white">
            {isOpenRecipientLink ? "Share link ready!" : "Invite sent!"}
          </p>
        )}
        {sentInviteLink && (
          <div className="neo-dots border-[3px] border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-black pb-2">
              <p className="neo-copy flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#171411]">
                <ExternalLink className="h-3.5 w-3.5 text-[#b7102a]" />
                Custom Link Ready
              </p>
              <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[8px] font-black uppercase text-[#171411]">
                {sentInviteLink.source === "server" ? "Server Token" : "Legacy Link"}{" "}
                {sentInviteLink.tokenHint}
              </span>
            </div>
            <div className="mt-3 grid gap-2">
              <LinkReadout label="Web Fallback" value={sentInviteLink.webUrl} />
              <LinkReadout label="App Deep Link" value={sentInviteLink.deepLink} />
            </div>
            {sentInviteLink.source === "server" && sentInviteLink.expiresAt ? (
              <p className="neo-copy mt-2 border-2 border-black bg-[#efe6d4] px-2 py-1 text-[8px] font-black uppercase tracking-[0.08em] text-[#655f58]">
                One-use share link expires {new Date(sentInviteLink.expiresAt).toLocaleString()}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="neo-copy inline-flex h-8 items-center gap-2 border-2 border-black bg-[#efe6d4] px-3 text-[9px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411]"
                type="button"
                onClick={() => void copyLink(sentInviteLink.webUrl, "Web")}
              >
                <Copy className="h-3 w-3" />
                Copy Web
              </button>
              <button
                className="neo-copy inline-flex h-8 items-center gap-2 border-2 border-black bg-[#efe6d4] px-3 text-[9px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411]"
                type="button"
                onClick={() => void copyLink(sentInviteLink.deepLink, "App")}
              >
                <Copy className="h-3 w-3" />
                Copy App
              </button>
              <a
                className="neo-copy inline-flex h-8 items-center gap-2 border-2 border-black bg-[#087d6d] px-3 text-[9px] font-black uppercase text-white shadow-[2px_2px_0_#171411]"
                href={sentInviteLink.deepLink}
              >
                <ExternalLink className="h-3 w-3" />
                Open App
              </a>
              {copiedLink ? (
                <span className="neo-copy inline-flex h-8 items-center border-2 border-black bg-[#8cf5e4] px-3 text-[9px] font-black uppercase text-[#171411]">
                  {copiedLink} copied
                </span>
              ) : null}
            </div>
          </div>
        )}
        {error && (
          <p className="neo-copy border-2 border-black bg-[#b7102a] p-2 text-[10px] font-bold uppercase text-white">
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
      <p className="neo-copy text-[8px] font-black uppercase tracking-[0.12em] text-[#655f58]">
        {label}
      </p>
      <p className="neo-copy mt-1 break-all text-[9px] font-bold leading-4 text-[#171411]">
        {value}
      </p>
    </div>
  );
}
