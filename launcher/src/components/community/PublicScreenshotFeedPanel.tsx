import { Globe2, Heart, Image, LockKeyhole, ShieldCheck } from "lucide-react";

import type {
  PublicScreenshotFeedCard,
  PublicScreenshotFeedGateStatus,
  PublicScreenshotFeedReadiness,
} from "../../lib/public-screenshot-feed-readiness";

export function PublicScreenshotFeedPanel({
  busyLikeId,
  canLike = false,
  likeMessage,
  message,
  onToggleLike,
  readiness,
}: {
  busyLikeId?: string | null;
  canLike?: boolean;
  likeMessage?: string | null;
  message?: string | null;
  onToggleLike?: (card: PublicScreenshotFeedCard) => void;
  readiness: PublicScreenshotFeedReadiness;
}) {
  return (
    <section
      aria-label="Public screenshot feed preview"
      className="neo-dots border-4 border-black bg-[#fff9ed] p-4 shadow-[6px_6px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-black pb-3">
        <div>
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.22em] text-[#b7102a]">
            Local Community Feed
          </p>
          <h2 className="neo-title mt-1 flex items-center gap-2 text-3xl uppercase text-[#171411]">
            <Image aria-hidden="true" className="h-8 w-8" />
            Public Screenshot Feed
          </h2>
          <p className="neo-copy mt-2 max-w-3xl text-xs font-bold uppercase leading-5 text-[#5f574d]">
            {readiness.summary}
          </p>
        </div>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-3 py-2 text-[10px] font-black uppercase text-[#171411] shadow-[3px_3px_0_#171411]">
          {readiness.statusLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="grid gap-3 md:grid-cols-4">
          <FeedStat label="Public embeds" value={`${readiness.publicEmbedCount}`} />
          <FeedStat label="Hosted rows" value={`${readiness.hostedPublicCount}`} />
          <FeedStat label="Private blocks" value={`${readiness.blockedPrivateCount}`} />
          <FeedStat label="Feed likes" value={`${readiness.totalLikeCount}`} />
        </div>

        <div className="border-2 border-black bg-[#171411] p-3 text-[#fff9ed] shadow-[3px_3px_0_#b7102a]">
          <p className="neo-copy flex items-center gap-2 text-[10px] font-black uppercase text-[#8cf5e4]">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            Feed Guard
          </p>
          <p className="neo-copy mt-2 border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] font-black uppercase leading-5">
            {readiness.guardCopy}
          </p>
          <p className="neo-copy mt-2 border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] font-black uppercase leading-5">
            Source: {readiness.feedSourceLabel}
            {message ? ` // ${message}` : ""}
          </p>
          {likeMessage ? (
            <p
              aria-live="polite"
              className="neo-copy mt-2 border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] font-black uppercase leading-5"
              role="status"
            >
              Likes: {likeMessage}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 border-2 border-black bg-[#f5eedf] p-3 shadow-[3px_3px_0_#171411]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="neo-copy text-[10px] font-black uppercase tracking-[0.16em] text-[#b7102a]">
              Moderation + Ranking Contract
            </p>
            <p className="neo-copy mt-1 max-w-3xl text-[10px] font-black uppercase leading-5 text-[#5f574d]">
              {readiness.moderationRankingEvidence.summary}
            </p>
          </div>
          <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-3 py-2 text-[9px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411]">
            {readiness.moderationRankingEvidence.rankingInputLabel}
          </span>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <FeedStat
            label="Approved rows"
            value={`${readiness.moderationRankingEvidence.approvedPublicCount}`}
          />
          <FeedStat
            label="Review blocks"
            value={`${readiness.moderationRankingEvidence.blockedReviewCount}`}
          />
          <FeedStat
            label="Pending rows"
            value={`${readiness.moderationRankingEvidence.pendingReviewCount}`}
          />
          <FeedStat
            label="Reported rows"
            value={`${readiness.moderationRankingEvidence.reportedCount}`}
          />
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {readiness.moderationRankingEvidence.rules.map((rule) => (
            <article
              className={`border-2 border-black p-2 shadow-[2px_2px_0_#171411] ${
                rule.status === "review" ? "bg-[#8cf5e4]" : "bg-[#efe3cf]"
              }`}
              key={rule.id}
            >
              <p className="neo-copy text-[9px] font-black uppercase tracking-[0.14em] text-[#171411]">
                {rule.label}
              </p>
              <p className="neo-copy mt-1 text-[9px] font-black uppercase leading-4 text-[#5f574d]">
                {rule.detail}
              </p>
            </article>
          ))}
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        {readiness.cards.map((card) => (
          <ScreenshotFeedCard
            busyLikeId={busyLikeId}
            canLike={canLike}
            card={card}
            key={card.id}
            onToggleLike={onToggleLike}
          />
        ))}
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        {readiness.guards.map((guard) => (
          <p
            className="neo-copy border-2 border-black bg-[#efe3cf] px-3 py-2 text-[9px] font-black uppercase leading-5 text-[#171411] shadow-[2px_2px_0_#171411]"
            key={guard}
          >
            {guard}
          </p>
        ))}
      </div>
    </section>
  );
}

function FeedStat({ label, value }: { label: string; value: string }) {
  return (
    <article className="border-2 border-black bg-[#efe3cf] p-3 shadow-[3px_3px_0_#171411]">
      <p className="neo-copy text-[9px] font-black uppercase tracking-[0.16em] text-[#b7102a]">
        {label}
      </p>
      <p className="neo-title mt-1 text-5xl leading-none text-[#171411]">{value}</p>
    </article>
  );
}

function ScreenshotFeedCard({
  busyLikeId,
  canLike,
  card,
  onToggleLike,
}: {
  busyLikeId?: string | null;
  canLike: boolean;
  card: PublicScreenshotFeedCard;
  onToggleLike?: (card: PublicScreenshotFeedCard) => void;
}) {
  const isBlocked = card.gateStatus === "blocked";
  const mediaUrl = isRenderableMediaUrl(card.displayUrl) ? card.displayUrl : null;
  const canToggleLike =
    Boolean(onToggleLike) &&
    canLike &&
    card.source === "hosted-supabase" &&
    card.visibility === "public" &&
    !isBlocked;
  const isLikeBusy = busyLikeId === card.id;
  const likeButtonLabel = isLikeBusy
    ? "Saving"
    : card.likedByMe
      ? "Liked"
      : canToggleLike
        ? "Like"
        : "Locked";

  return (
    <article className="border-2 border-black bg-[#f5eedf] p-3 shadow-[3px_3px_0_#171411]">
      <div
        className={`${card.artClass} relative grid aspect-[16/10] place-items-center overflow-hidden border-[3px] border-black text-[#fff9ed] shadow-[3px_3px_0_#171411]`}
      >
        {mediaUrl ? (
          <img alt="" className="absolute inset-0 h-full w-full object-cover" src={mediaUrl} />
        ) : null}
        {mediaUrl ? <div className="absolute inset-0 bg-[#171411]/35" /> : null}
        <span className="neo-title text-5xl leading-none [text-shadow:3px_3px_0_#171411]">
          {card.rank}
        </span>
        {isBlocked ? (
          <div className="absolute inset-0 grid place-items-center bg-[#171411]/80">
            <LockKeyhole aria-hidden="true" className="h-12 w-12 text-[#8cf5e4]" />
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy text-[9px] font-black uppercase tracking-[0.16em] text-[#b7102a]">
            {card.gameTitle}
          </p>
          <h3 className="mt-1 text-lg font-black uppercase leading-tight text-[#171411]">
            {card.caption}
          </h3>
        </div>
        <span
          className={`neo-copy border-2 border-black px-2 py-1 text-[8px] font-black uppercase shadow-[2px_2px_0_#171411] ${gateClass(
            card.gateStatus,
          )}`}
        >
          {card.embedLabel}
        </span>
      </div>

      <div className="mt-3 grid gap-2">
        <p className="neo-copy flex items-center justify-between gap-2 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black uppercase text-[#171411]">
          <span>{card.sourceLabel}</span>
          <span>{card.mediaLabel}</span>
        </p>
        <p className="neo-copy flex items-center justify-between gap-2 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black uppercase text-[#171411]">
          <span>{card.moderationLabel}</span>
          <span>{card.reportCount ?? 0} Reports</span>
        </p>
        <p className="neo-copy flex items-center justify-between gap-2 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black uppercase text-[#171411]">
          <span className="inline-flex items-center gap-1">
            {card.visibility === "public" ? (
              <Globe2 aria-hidden="true" className="h-3.5 w-3.5 text-[#087d6d]" />
            ) : (
              <LockKeyhole aria-hidden="true" className="h-3.5 w-3.5 text-[#b7102a]" />
            )}
            {card.privacyLabel}
          </span>
          <span>@{card.authorHandle}</span>
        </p>
        <div className="neo-copy flex flex-wrap items-center justify-between gap-2 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black uppercase text-[#171411]">
          <span className="inline-flex items-center gap-1">
            <Heart
              aria-hidden="true"
              className={`h-3.5 w-3.5 ${card.likedByMe ? "fill-[#b7102a] text-[#b7102a]" : ""}`}
            />
            {card.likeCount} Likes
          </span>
          <button
            aria-label={`${card.likedByMe ? "Unlike" : "Like"} ${card.caption}`}
            aria-pressed={card.likedByMe}
            className="inline-flex h-8 items-center gap-1 border-2 border-black bg-[#8cf5e4] px-2 text-[8px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#b7102a] hover:text-white disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-[#d8cbb7] disabled:text-[#655f58]"
            disabled={!canToggleLike || isLikeBusy}
            onClick={() => onToggleLike?.(card)}
            title={
              canToggleLike
                ? card.likedByMe
                  ? "Remove screenshot like"
                  : "Like screenshot"
                : "Hosted public screenshot likes only"
            }
            type="button"
          >
            <Heart
              aria-hidden="true"
              className={`h-3.5 w-3.5 ${card.likedByMe ? "fill-current" : ""}`}
            />
            <span>{likeButtonLabel}</span>
          </button>
        </div>
      </div>

      <div className={`mt-3 border-2 border-black p-2 ${gatePanelClass(card.gateStatus)}`}>
        <p className="neo-copy text-[9px] font-black uppercase tracking-[0.16em] text-[#171411]">
          {card.gateLabel}
        </p>
        <p className="neo-copy mt-1 text-[9px] font-black uppercase leading-4 text-[#5f574d]">
          {card.gateDetail}
        </p>
      </div>

      <div className="mt-3 border-2 border-black bg-[#fff9ed] p-2">
        <p className="neo-copy text-[9px] font-black uppercase tracking-[0.16em] text-[#b7102a]">
          Ranking Signals
        </p>
        <p className="neo-copy mt-1 text-[9px] font-black uppercase leading-4 text-[#5f574d]">
          {card.moderationDetail} {card.rankingDetail}
        </p>
        <div className="mt-2 grid gap-1">
          {card.rankingSignals.map((signal) => (
            <p
              className="neo-copy border-2 border-black bg-[#efe3cf] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]"
              key={signal}
            >
              {signal}
            </p>
          ))}
        </div>
      </div>
    </article>
  );
}

function gateClass(status: PublicScreenshotFeedGateStatus) {
  if (status === "review") return "bg-[#8cf5e4] text-[#171411]";
  return "bg-[#b7102a] text-white";
}

function gatePanelClass(status: PublicScreenshotFeedGateStatus) {
  if (status === "review") return "bg-[#8cf5e4]";
  return "bg-[#efe3cf]";
}

function isRenderableMediaUrl(value: string | null | undefined) {
  return Boolean(value && /^(https?:|data:|blob:)/i.test(value));
}
