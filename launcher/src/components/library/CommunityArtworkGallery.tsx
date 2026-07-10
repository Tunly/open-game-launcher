import { Download, Flag, Heart, ImagePlus, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

import {
  isCommunityArtworkImported,
  type CommunityArtworkCandidate,
  type GameCustomArtwork,
} from "../../lib/custom-artwork";
import { getGameAssetUrl } from "../../lib/assets";

interface CommunityArtworkGalleryProps {
  artwork: GameCustomArtwork | null;
  busyCandidateId?: string | null;
  candidates: CommunityArtworkCandidate[];
  hostedStatus?: {
    loading?: boolean;
    message?: string | null;
    mode: "hosted" | "local";
  };
  onApply: (candidate: CommunityArtworkCandidate) => void;
  onReport?: (candidate: CommunityArtworkCandidate) => void;
  onVote?: (candidate: CommunityArtworkCandidate, vote: -1 | 0 | 1) => void;
}

const LOCAL_COMMUNITY_ARTWORK_VOTES_KEY = "og-launcher:community-artwork-votes:v1";

function getArtworkKindLabel(kind: CommunityArtworkCandidate["kind"]): string {
  return kind === "cover" ? "Cover" : kind === "icon" ? "Icon" : "Logo";
}

export function CommunityArtworkGallery({
  artwork,
  busyCandidateId = null,
  candidates,
  hostedStatus,
  onApply,
  onReport,
  onVote,
}: CommunityArtworkGalleryProps) {
  const [localVotes, setLocalVotes] = useState<Set<string>>(() => readLocalCommunityArtworkVotes());
  const [voteMessage, setVoteMessage] = useState<string | null>(null);
  const hasHostedCandidates = candidates.some((candidate) => candidate.hosted);
  const rankedCandidates = useMemo(
    () =>
      [...candidates].sort((left, right) => {
        const rightVotes = getDisplayedVotes(right, localVotes);
        const leftVotes = getDisplayedVotes(left, localVotes);
        return rightVotes - leftVotes || left.title.localeCompare(right.title);
      }),
    [candidates, localVotes],
  );

  if (candidates.length === 0) {
    return null;
  }

  function handleToggleVote(candidate: CommunityArtworkCandidate) {
    if (candidate.hosted && onVote) {
      setVoteMessage(null);
      onVote(candidate, candidate.userVote === 1 ? 0 : 1);
      return;
    }

    const wasVoted = localVotes.has(candidate.id);

    setLocalVotes((current) => {
      const next = new Set(current);
      if (next.has(candidate.id)) {
        next.delete(candidate.id);
      } else {
        next.add(candidate.id);
      }
      writeLocalCommunityArtworkVotes(next);
      return next;
    });
    setVoteMessage(
      wasVoted
        ? `Local vote removed from ${candidate.title}. Hosted ranking sync is still disabled.`
        : `Local vote added to ${candidate.title}. Hosted ranking sync is still disabled.`,
    );
  }

  return (
    <section
      aria-label="Community artwork import deck"
      className="mt-2 border-2 border-black bg-[#efe3cf] p-2 shadow-[2px_2px_0_#171411]"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="neo-copy block text-[9px] font-black text-[#171411] uppercase">
            Community Art Deck
          </span>
          <span className="neo-copy block text-[8px] font-black text-[#655f58] uppercase">
            {hostedStatus?.loading
              ? "Syncing Hosted Deck"
              : hasHostedCandidates
                ? "Hosted + Local Votes"
                : "Local Votes"}
          </span>
          <span className="neo-copy mt-1 block text-[8px] leading-4 font-black text-[#655f58] uppercase">
            {hostedStatus?.message ??
              (hasHostedCandidates
                ? "Approved hosted rows use Supabase votes, reports, moderation, and ranking. Local fallback rows keep browser-local votes."
                : "Browser-local vote ledger only. Hosted ranking sync and moderation are disabled.")}
          </span>
        </div>
        <span
          className={`inline-flex items-center gap-1 border-2 border-black px-1.5 py-0.5 text-[8px] font-black text-[#171411] uppercase ${
            hostedStatus?.mode === "hosted" ? "bg-[#8cf5e4]" : "bg-[#efe3cf]"
          }`}
        >
          {hostedStatus?.loading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : null}
          {hostedStatus?.mode === "hosted" ? "Hosted" : "Import"}
        </span>
      </div>

      <div className="grid gap-1.5">
        {rankedCandidates.map((candidate) => {
          const imported = isCommunityArtworkImported(artwork, candidate);
          const isHosted = candidate.hosted === true;
          const isBusy = busyCandidateId === candidate.id;
          const isVoted = isHosted ? candidate.userVote === 1 : localVotes.has(candidate.id);
          const displayedVotes = getDisplayedVotes(candidate, localVotes);

          return (
            <article
              key={candidate.id}
              className="grid min-w-0 grid-cols-[44px_minmax(0,1fr)] gap-1.5 border-2 border-black bg-[#fbf4e7] p-1 shadow-[1px_1px_0_#000]"
            >
              <span className="h-12 w-11 overflow-hidden border-2 border-black bg-[#ded3c1]">
                <img
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                  src={getGameAssetUrl(candidate.url)}
                />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[9px] font-black text-[#171411] uppercase">
                  {candidate.title}
                </span>
                <span className="block truncate text-[8px] font-black text-[#b7102a] uppercase">
                  {getArtworkKindLabel(candidate.kind)} - {candidate.artist}
                </span>
                <span className="mt-1 flex flex-wrap gap-1">
                  <button
                    aria-label={`${isVoted ? "Remove" : "Add"} ${
                      isHosted ? "hosted" : "local"
                    } vote for ${candidate.title}`}
                    aria-pressed={isVoted}
                    className={`inline-flex items-center gap-0.5 border border-black px-1 text-[8px] font-black uppercase ${
                      isVoted ? "bg-[#8cf5e4]" : "bg-[#efe3cf]"
                    }`}
                    disabled={isBusy}
                    type="button"
                    onClick={() => handleToggleVote(candidate)}
                  >
                    {isBusy ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    ) : (
                      <Heart className="h-2.5 w-2.5 fill-current" />
                    )}
                    {displayedVotes} {isVoted ? (isHosted ? "Synced" : "Local") : "Vote"}
                  </button>
                  <span className="inline-flex items-center gap-0.5 border border-black bg-[#efe3cf] px-1 text-[8px] font-black uppercase">
                    <Download className="h-2.5 w-2.5" />
                    {candidate.downloads}
                  </span>
                  {isHosted ? (
                    <span className="inline-flex items-center gap-0.5 border border-black bg-[#8cf5e4] px-1 text-[8px] font-black uppercase">
                      Hosted
                    </span>
                  ) : null}
                </span>
                {isHosted && onReport ? (
                  <button
                    type="button"
                    className="mt-1 inline-flex h-6 items-center justify-center gap-1 border-2 border-black bg-[#fff9ed] px-2 text-[8px] font-black uppercase transition hover:bg-[#efe3cf] disabled:opacity-60"
                    disabled={isBusy}
                    title={`Report ${candidate.title}`}
                    onClick={() => onReport(candidate)}
                  >
                    <Flag className="h-3 w-3" />
                    Report
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`mt-1 flex h-7 w-full items-center justify-center gap-1 border-2 border-black px-1 text-[8px] font-black uppercase transition ${
                    imported
                      ? "cursor-default bg-[#8cf5e4] text-[#171411]"
                      : "bg-[#ded3c1] hover:bg-[#8cf5e4]"
                  }`}
                  disabled={imported}
                  title={`${imported ? "Imported" : "Import"} ${candidate.title}`}
                  onClick={() => onApply(candidate)}
                >
                  <ImagePlus className="h-3 w-3" />
                  {imported ? "Imported" : "Import Art"}
                </button>
              </span>
            </article>
          );
        })}
      </div>
      {voteMessage ? (
        <p className="neo-copy mt-2 border-2 border-black bg-[#8cf5e4] p-1.5 text-[8px] leading-4 font-black text-[#171411] uppercase">
          {voteMessage}
        </p>
      ) : null}
    </section>
  );
}

function getDisplayedVotes(candidate: CommunityArtworkCandidate, localVotes: Set<string>): number {
  if (candidate.hosted) {
    return candidate.votes;
  }

  return candidate.votes + (localVotes.has(candidate.id) ? 1 : 0);
}

function readLocalCommunityArtworkVotes(): Set<string> {
  if (typeof window === "undefined") return new Set();

  try {
    const raw = window.localStorage.getItem(LOCAL_COMMUNITY_ARTWORK_VOTES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return new Set();
  }
}

function writeLocalCommunityArtworkVotes(votes: Set<string>) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    LOCAL_COMMUNITY_ARTWORK_VOTES_KEY,
    JSON.stringify(Array.from(votes).sort()),
  );
}
