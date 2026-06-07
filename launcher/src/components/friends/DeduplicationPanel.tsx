import { RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { FriendLink, FriendMergeSuggestion } from "../../lib/types/friends";
import {
  acceptMergeSuggestion,
  dismissFriendLink,
  generateHeuristicSuggestions,
  getMergeSuggestions,
  getUnmatchedFriendLinks,
  rejectMergeSuggestion,
} from "../../lib/supabase/friend-links";

interface DeduplicationPanelProps {
  autoLoad?: boolean;
  onChange?: () => void;
}

export function DeduplicationPanel({ autoLoad = false, onChange }: DeduplicationPanelProps) {
  const [unmatchedLinks, setUnmatchedLinks] = useState<FriendLink[]>([]);
  const [suggestions, setSuggestions] = useState<FriendMergeSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(autoLoad);

  const loadDedup = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [links, sug] = await Promise.all([getUnmatchedFriendLinks(), getMergeSuggestions()]);
      setUnmatchedLinks(links);
      setSuggestions(sug);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void loadDedup();
    }
  }, [open, loadDedup]);

  async function runHeuristics() {
    setRunning(true);
    setError(null);
    try {
      const count = await generateHeuristicSuggestions();
      const sug = await getMergeSuggestions();
      setSuggestions(sug);
      onChange?.();
      if (count === 0) {
        setError("No new heuristic matches found.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  async function handleAccept(id: string) {
    await acceptMergeSuggestion(id);
    onChange?.();
    await loadDedup();
  }

  async function handleReject(id: string) {
    await rejectMergeSuggestion(id);
    onChange?.();
    await loadDedup();
  }

  async function handleDismiss(id: string) {
    await dismissFriendLink(id);
    onChange?.();
    await loadDedup();
  }

  if (!open) {
    return (
      <button
        className="neo-copy flex h-10 items-center gap-2 border-2 border-black bg-[#efe6d4] px-4 text-[10px] font-black text-[#171411] uppercase shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5"
        type="button"
        onClick={() => setOpen(true)}
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Deduplication
      </button>
    );
  }

  return (
    <div className="border-2 border-black bg-[#f6edd8] p-3 shadow-[2px_2px_0_#171411]">
      <div className="flex items-center justify-between border-b-2 border-black pb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-[#b7102a]" />
          <p className="neo-copy text-[10px] font-black tracking-[0.12em] text-[#171411] uppercase">
            Deduplication
          </p>
        </div>
        <button
          className="neo-copy h-7 border-2 border-black bg-[#f56c2d] px-3 text-[9px] font-black text-white uppercase shadow-[1px_1px_0_#171411] disabled:opacity-50"
          disabled={running}
          type="button"
          onClick={() => void runHeuristics()}
        >
          {running ? "Running..." : "Run Heuristic Match"}
        </button>
      </div>

      {loading ? (
        <p className="neo-copy mt-3 text-[10px] font-bold text-[#55504a] uppercase">Loading...</p>
      ) : (
        <p className="neo-copy mt-3 text-[10px] font-bold text-[#55504a] uppercase">
          Unmatched: {unmatchedLinks.length} • Pending suggestions: {suggestions.length}
        </p>
      )}

      {error && (
        <p className="neo-copy mt-2 border-2 border-black bg-[#efe6d4] p-2 text-[9px] font-bold text-[#5b403f] uppercase">
          {error}
        </p>
      )}

      {suggestions.slice(0, 10).map((sug) => (
        <div
          key={sug.id}
          className="mt-3 border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]"
        >
          <p className="neo-copy text-[10px] font-bold text-[#171411]">{sug.reason}</p>
          <p className="neo-copy mt-1 text-[9px] text-[#55504a]">
            Confidence: {Math.round(sug.confidence * 100)}%
          </p>
          <div className="mt-2 flex gap-2">
            <button
              className="neo-copy h-7 border-2 border-black bg-[#087d6d] px-3 text-[9px] font-black text-white uppercase"
              type="button"
              onClick={() => void handleAccept(sug.id)}
            >
              Accept
            </button>
            <button
              className="neo-copy h-7 border-2 border-black bg-[#b7102a] px-3 text-[9px] font-black text-white uppercase"
              type="button"
              onClick={() => void handleReject(sug.id)}
            >
              Reject
            </button>
          </div>
        </div>
      ))}

      {unmatchedLinks.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="neo-copy text-[10px] font-black text-[#171411] uppercase">
            Unmatched Platform Friends
          </p>
          {unmatchedLinks.slice(0, 15).map((link) => (
            <div
              key={link.id}
              className="flex items-center justify-between border-2 border-black bg-[#f6edd8] p-2 shadow-[1px_1px_0_#171411]"
            >
              <div>
                <span className="neo-copy text-[10px] font-bold text-[#171411]">
                  {link.platformFriendName ?? link.platformFriendId}
                </span>
                <span className="neo-copy ml-2 text-[9px] text-[#55504a] uppercase">
                  ({link.platform})
                </span>
              </div>
              <button
                className="neo-copy h-6 border border-black bg-[#efe6d4] px-2 text-[8px] font-bold text-[#55504a] uppercase"
                type="button"
                onClick={() => void handleDismiss(link.id)}
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
