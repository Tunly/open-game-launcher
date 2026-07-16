import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getLocalCommunityArtworkCandidates,
  type CommunityArtworkCandidate,
  type GameCustomArtwork,
} from "../../lib/custom-artwork";
import {
  listHostedCommunityArtworkCandidates,
  reportHostedCommunityArtwork,
  setHostedCommunityArtworkVote,
  uploadCommunityArtworkForGame,
} from "../../lib/supabase/community-artwork";
import type { Game } from "../../lib/types";
import { getErrorMessage } from "../../lib/formatters";
import { CommunityArtworkGallery } from "./CommunityArtworkGallery";
import {
  CommunityArtworkUploadPanel,
  type CommunityArtworkUploadDraft,
} from "./CommunityArtworkUploadPanel";

interface CommunityArtworkPanelProps {
  artwork: GameCustomArtwork | null;
  game: Game;
  onApply: (candidate: CommunityArtworkCandidate) => void;
}

export function CommunityArtworkPanel({ artwork, game, onApply }: CommunityArtworkPanelProps) {
  const [hostedCandidates, setHostedCandidates] = useState<CommunityArtworkCandidate[]>([]);
  const [pendingSubmissions, setPendingSubmissions] = useState<CommunityArtworkCandidate[]>([]);
  const [busyCandidateId, setBusyCandidateId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hostedMode, setHostedMode] = useState(false);

  const candidates = useMemo(
    () => dedupeCandidates([...hostedCandidates, ...getLocalCommunityArtworkCandidates()]),
    [hostedCandidates],
  );

  const loadHostedCandidates = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await listHostedCommunityArtworkCandidates(game.id);
      if (result.ok) {
        setHostedCandidates(result.value);
        setHostedMode(true);
        setMessage(
          result.value.length > 0
            ? "Hosted artwork, voting, and reporting are connected."
            : "Hosted artwork is connected; no approved submissions exist for this game yet.",
        );
        return;
      }
      setHostedCandidates([]);
      setHostedMode(false);
      setMessage(result.message);
    } catch (error) {
      setHostedCandidates([]);
      setHostedMode(false);
      setMessage(`Hosted artwork could not be loaded: ${getErrorMessage(error)}`);
    } finally {
      setIsLoading(false);
    }
  }, [game.id]);

  useEffect(() => {
    setPendingSubmissions([]);
    void loadHostedCandidates();
  }, [loadHostedCandidates]);

  async function handleVote(candidate: CommunityArtworkCandidate, vote: -1 | 0 | 1) {
    setBusyCandidateId(candidate.id);
    try {
      const result = await setHostedCommunityArtworkVote(candidate.id, vote);
      if (result.ok) {
        setHostedCandidates((current) =>
          current.map((item) =>
            item.id === candidate.id
              ? { ...item, userVote: result.value.userVote, votes: result.value.voteScore }
              : item,
          ),
        );
        setMessage(vote === 0 ? "Hosted vote removed." : "Hosted vote saved.");
      } else {
        setMessage(result.message);
      }
    } catch (error) {
      setMessage(`Hosted vote could not be saved: ${getErrorMessage(error)}`);
    } finally {
      setBusyCandidateId(null);
    }
  }

  async function handleReport(candidate: CommunityArtworkCandidate) {
    setBusyCandidateId(candidate.id);
    try {
      const result = await reportHostedCommunityArtwork(
        candidate.id,
        "other",
        `Reported from the ${game.title} library artwork deck.`,
      );
      if (result.ok) {
        setHostedCandidates((current) =>
          current
            .map((item) =>
              item.id === candidate.id
                ? {
                    ...item,
                    moderationStatus: result.value.moderationStatus,
                    reportCount: result.value.reportCount,
                  }
                : item,
            )
            .filter((item) => item.moderationStatus === "approved"),
        );
        setMessage("Artwork report submitted for moderation.");
      } else {
        setMessage(result.message);
      }
    } catch (error) {
      setMessage(`Artwork report could not be submitted: ${getErrorMessage(error)}`);
    } finally {
      setBusyCandidateId(null);
    }
  }

  async function handleUpload(draft: CommunityArtworkUploadDraft) {
    setIsUploading(true);
    try {
      const result = await uploadCommunityArtworkForGame({
        ...draft,
        gameId: game.id,
      });
      if (!result.ok) {
        setMessage(result.message);
        return false;
      }

      setPendingSubmissions((current) => [result.value, ...current]);
      setMessage(result.message ?? "Community artwork uploaded for moderation.");
      return true;
    } catch (error) {
      setMessage(`Community artwork could not be uploaded: ${getErrorMessage(error)}`);
      return false;
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="mt-3 border-t-2 border-black pt-2">
      <CommunityArtworkGallery
        artwork={artwork}
        busyCandidateId={busyCandidateId}
        candidates={candidates}
        hostedStatus={{
          loading: isLoading,
          message,
          mode: hostedMode ? "hosted" : "local",
        }}
        onApply={onApply}
        onReport={handleReport}
        onVote={handleVote}
      />
      <CommunityArtworkUploadPanel
        gameTitle={game.title}
        isUploading={isUploading}
        message={message}
        onSubmit={handleUpload}
        pendingSubmissions={pendingSubmissions}
      />
    </div>
  );
}

function dedupeCandidates(candidates: CommunityArtworkCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.kind}:${candidate.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
