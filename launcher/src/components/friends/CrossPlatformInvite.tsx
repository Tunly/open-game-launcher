import { AlertTriangle, CheckCircle, HelpCircle, Send } from "lucide-react";
import { useState } from "react";

import type { InviteFeasibility, PlatformType } from "../../lib/types/friends";
import { checkInviteFeasibility, sendCrossplatformInvite } from "../../lib/supabase/social";

interface CrossPlatformInviteProps {
  currentUserId: string;
  selectedFriendId: string | null;
  senderPlatforms: PlatformType[];
  receiverPlatforms: PlatformType[];
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
  const [gameTitle, setGameTitle] = useState("");
  const [feasibility, setFeasibility] = useState<InviteFeasibility | null>(null);
  const [checking, setChecking] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!selectedFriendId || !gameTitle.trim()) return;
    setError(null);
    setSent(false);
    try {
      await sendCrossplatformInvite(
        selectedFriendId,
        gameTitle,
        senderPlatforms[0] ?? null,
        null,
        feasibility ?? "uncertain",
      );
      setSent(true);
      setGameTitle("");
      setFeasibility(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
          disabled={!selectedFriendId}
          maxLength={160}
          placeholder="Game title..."
          value={gameTitle}
          onChange={(e) => {
            setGameTitle(e.target.value);
            setFeasibility(null);
            setSent(false);
          }}
        />

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
            disabled={!selectedFriendId || !gameTitle.trim()}
            type="button"
            onClick={() => void handleSend()}
          >
            Send Invite
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
                Cannot verify cross-play support. Invite sent as-is.
              </p>
            )}
          </div>
        )}

        {sent && (
          <p className="neo-copy border-2 border-black bg-[#087d6d] p-2 text-[10px] font-bold uppercase text-white">
            Invite sent!
          </p>
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
