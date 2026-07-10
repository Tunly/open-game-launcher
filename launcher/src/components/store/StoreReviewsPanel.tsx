import { Flag, Send, Star } from "lucide-react";

import type { StoreGame } from "../../lib/types";
import type { StoreReview, StoreReviewReply, StoreReviewReportReason } from "../../lib/types/store";
import { EmptyStorePanel } from "./EmptyStorePanel";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

const REVIEW_REPORT_REASONS: Array<{ label: string; value: StoreReviewReportReason }> = [
  { label: "Spam", value: "spam" },
  { label: "Harassment", value: "harassment" },
  { label: "Hate Or Abuse", value: "hate_or_abuse" },
  { label: "Spoilers", value: "spoilers" },
  { label: "Off Topic", value: "off_topic" },
  { label: "Fraud", value: "fraud" },
  { label: "Other", value: "other" },
];

export function StoreReviewsPanel({
  body,
  canManageDeveloperReplies,
  developerRepliesByReviewId,
  developerReplyDrafts,
  developerReplySavingReviewId,
  game,
  isOwned,
  isSignedIn,
  loading,
  rating,
  reportedReviewIds,
  reportingReviewId,
  reportDetails,
  reportReason,
  reportSaving,
  reviews,
  saving,
  title,
  userReview,
  onBodyChange,
  onCancelReport,
  onDeveloperReplyChange,
  onDeveloperReplySubmit,
  onOpenReport,
  onRatingChange,
  onReportDetailsChange,
  onReportReasonChange,
  onReportSubmit,
  onSubmit,
  onTitleChange,
}: {
  body: string;
  canManageDeveloperReplies: boolean;
  developerRepliesByReviewId: Map<string, StoreReviewReply>;
  developerReplyDrafts: Record<string, string>;
  developerReplySavingReviewId: string | null;
  game: StoreGame;
  isOwned: boolean;
  isSignedIn: boolean;
  loading: boolean;
  rating: number;
  reportedReviewIds: Set<string>;
  reportingReviewId: string | null;
  reportDetails: string;
  reportReason: StoreReviewReportReason;
  reportSaving: boolean;
  reviews: StoreReview[];
  saving: boolean;
  title: string;
  userReview: StoreReview | null;
  onBodyChange: (value: string) => void;
  onCancelReport: () => void;
  onDeveloperReplyChange: (reviewId: string, value: string) => void;
  onDeveloperReplySubmit: (review: StoreReview) => void;
  onOpenReport: (review: StoreReview) => void;
  onRatingChange: (value: number) => void;
  onReportDetailsChange: (value: string) => void;
  onReportReasonChange: (value: StoreReviewReportReason) => void;
  onReportSubmit: (reviewId: string, productId: string) => void;
  onSubmit: (gameId: string) => void;
  onTitleChange: (value: string) => void;
}) {
  const canReview = isSignedIn && isOwned && isUuid(game.id);
  const averageRating =
    reviews.length > 0
      ? reviews.reduce((total, review) => total + review.rating, 0) / reviews.length
      : null;

  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="border-4 border-black bg-[#fff9ed] shadow-[5px_5px_0_#171411]">
        <div className="flex flex-col gap-3 border-b-4 border-black bg-[#171411] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="neo-title text-3xl leading-none text-[#fff9ed]">Player Reviews</h2>
          <div className="neo-copy flex items-center gap-2 text-[10px] font-black tracking-[0.12em] text-[#8cf5e4] uppercase">
            <Star className="h-4 w-4 fill-current" />
            {averageRating === null ? "No Score" : `${averageRating.toFixed(1)} / 5`}
          </div>
        </div>
        <div className="space-y-3 p-4">
          {loading ? (
            <div className="neo-copy border-[3px] border-dashed border-black bg-[#f6edd8] p-5 text-center text-[11px] font-black tracking-[0.12em] text-[#655f58] uppercase">
              Loading reviews...
            </div>
          ) : reviews.length > 0 ? (
            reviews.map((review) => {
              const isReported = reportedReviewIds.has(review.id);
              const isOwnReview = review.id === userReview?.id;
              const isReporting = reportingReviewId === review.id;
              const developerReply = developerRepliesByReviewId.get(review.id) ?? null;
              const developerReplyDraft =
                developerReplyDrafts[review.id] ?? developerReply?.body ?? "";
              const isSavingDeveloperReply = developerReplySavingReviewId === review.id;

              return (
                <article
                  key={review.id}
                  className="border-[3px] border-black bg-[#f5eedf] p-4 shadow-[3px_3px_0_#171411]"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="neo-title text-2xl leading-none text-[#171411]">
                        {review.title ?? "Store Verdict"}
                      </p>
                      <p className="neo-copy mt-1 text-[10px] font-black tracking-[0.12em] text-[#655f58] uppercase">
                        {new Date(review.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <ReviewStars rating={review.rating} />
                      <button
                        className={`neo-copy flex h-8 items-center gap-1 border-2 border-black px-2 text-[9px] font-black tracking-[0.08em] uppercase shadow-[2px_2px_0_#171411] disabled:opacity-50 ${
                          isReported ? "bg-[#8cf5e4] text-[#171411]" : "bg-[#fff9ed] text-[#171411]"
                        }`}
                        disabled={isReported || reportSaving}
                        type="button"
                        onClick={() => onOpenReport(review)}
                      >
                        <Flag className="h-3 w-3" />
                        {isReported ? "Reported" : isReporting ? "Close" : "Report"}
                      </button>
                    </div>
                  </div>
                  {review.body ? (
                    <p className="mt-3 text-sm leading-6 font-bold text-[#5b403f]">{review.body}</p>
                  ) : null}
                  {developerReply ? <DeveloperReplyNote reply={developerReply} /> : null}
                  {canManageDeveloperReplies ? (
                    <form
                      className="mt-3 border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]"
                      onSubmit={(event) => {
                        event.preventDefault();
                        onDeveloperReplySubmit(review);
                      }}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="neo-copy text-[10px] font-black tracking-[0.12em] text-[#007166] uppercase">
                          Developer Reply
                        </p>
                        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[9px] font-black tracking-[0.08em] text-[#171411] uppercase">
                          {developerReply ? "Update" : "Add"}
                        </span>
                      </div>
                      <textarea
                        className="mt-3 min-h-24 w-full resize-y border-2 border-black bg-[#f6edd8] p-3 text-sm leading-6 font-bold text-[#171411] outline-none"
                        maxLength={1000}
                        placeholder="Short official reply"
                        value={developerReplyDraft}
                        onChange={(event) => onDeveloperReplyChange(review.id, event.target.value)}
                      />
                      <button
                        className="neo-copy mt-2 flex h-9 w-full items-center justify-center gap-2 border-2 border-black bg-[#007166] text-[10px] font-black tracking-[0.1em] text-white uppercase shadow-[2px_2px_0_#171411] disabled:opacity-50"
                        disabled={isSavingDeveloperReply || !developerReplyDraft.trim()}
                        type="submit"
                      >
                        <Send className="h-3 w-3" />
                        {isSavingDeveloperReply
                          ? "Saving"
                          : developerReply
                            ? "Update Reply"
                            : "Post Reply"}
                      </button>
                    </form>
                  ) : null}
                  {isReporting && !isOwnReview ? (
                    <form
                      className="mt-3 border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]"
                      onSubmit={(event) => {
                        event.preventDefault();
                        onReportSubmit(review.id, game.id);
                      }}
                    >
                      <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
                        <select
                          className="neo-copy h-10 border-2 border-black bg-[#f6edd8] px-2 text-[10px] font-black tracking-[0.08em] text-[#171411] uppercase outline-none"
                          value={reportReason}
                          onChange={(event) =>
                            onReportReasonChange(event.target.value as StoreReviewReportReason)
                          }
                        >
                          {REVIEW_REPORT_REASONS.map((reason) => (
                            <option key={reason.value} value={reason.value}>
                              {reason.label}
                            </option>
                          ))}
                        </select>
                        <input
                          className="neo-copy h-10 min-w-0 border-2 border-black bg-[#f6edd8] px-2 text-[10px] font-black tracking-[0.08em] text-[#171411] uppercase outline-none"
                          maxLength={2000}
                          placeholder="Optional details"
                          value={reportDetails}
                          onChange={(event) => onReportDetailsChange(event.target.value)}
                        />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          className="neo-copy h-9 border-2 border-black bg-[#fff9ed] text-[10px] font-black tracking-[0.1em] text-[#171411] uppercase shadow-[2px_2px_0_#171411]"
                          type="button"
                          onClick={onCancelReport}
                        >
                          Cancel
                        </button>
                        <button
                          className="neo-copy flex h-9 items-center justify-center gap-2 border-2 border-black bg-[#b7102a] text-[10px] font-black tracking-[0.1em] text-white uppercase shadow-[2px_2px_0_#171411] disabled:opacity-50"
                          disabled={reportSaving}
                          type="submit"
                        >
                          <Send className="h-3 w-3" />
                          {reportSaving ? "Sending" : "Send Report"}
                        </button>
                      </div>
                    </form>
                  ) : null}
                </article>
              );
            })
          ) : (
            <EmptyStorePanel label="No product reviews yet." />
          )}
        </div>
      </div>

      {canReview ? (
        <form
          className="border-4 border-black bg-[#f5eedf] p-5 shadow-[5px_5px_0_#171411]"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(game.id);
          }}
        >
          <div className="border-b-[3px] border-black pb-4">
            <p className="neo-copy text-[10px] font-black tracking-[0.12em] text-[#b7102a] uppercase">
              {userReview ? "Edit Review" : "Owner Review"}
            </p>
            <h3 className="neo-title mt-2 text-3xl leading-none text-[#171411]">{game.title}</h3>
          </div>
          <div className="mt-4 flex gap-2">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                aria-label={`Rate ${value} stars`}
                className={`flex h-10 w-10 items-center justify-center border-2 border-black shadow-[2px_2px_0_#171411] ${
                  value <= rating ? "bg-[#b7102a] text-white" : "bg-[#fff9ed] text-[#171411]"
                }`}
                type="button"
                onClick={() => onRatingChange(value)}
              >
                <Star className={`h-5 w-5 ${value <= rating ? "fill-current" : ""}`} />
              </button>
            ))}
          </div>
          <input
            className="neo-copy mt-4 h-11 w-full border-2 border-black bg-[#fff9ed] px-3 text-[11px] font-black tracking-[0.08em] text-[#171411] uppercase outline-none"
            maxLength={120}
            placeholder="Review title"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
          />
          <textarea
            className="mt-3 min-h-32 w-full resize-y border-2 border-black bg-[#fff9ed] p-3 text-sm leading-6 font-bold text-[#171411] outline-none"
            maxLength={5000}
            placeholder="Write your verdict"
            value={body}
            onChange={(event) => onBodyChange(event.target.value)}
          />
          <button
            className="neo-copy mt-3 flex h-11 w-full items-center justify-center gap-2 border-2 border-black bg-[#007166] text-[11px] font-black tracking-[0.12em] text-white uppercase shadow-[3px_3px_0_#171411] disabled:opacity-50"
            disabled={saving}
            type="submit"
          >
            <Send className="h-4 w-4" />
            {saving ? "Saving" : userReview ? "Update Review" : "Publish Review"}
          </button>
        </form>
      ) : null}
    </section>
  );
}

function DeveloperReplyNote({ reply }: { reply: StoreReviewReply }) {
  return (
    <div className="neo-dots mt-3 border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="neo-copy text-[10px] font-black tracking-[0.12em] text-[#007166] uppercase">
          Developer Reply
        </p>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[9px] font-black tracking-[0.08em] text-[#171411] uppercase">
          {new Date(reply.updatedAt).toLocaleDateString()}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 font-bold text-[#171411]">{reply.body}</p>
    </div>
  );
}

function ReviewStars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-1" aria-label={`${rating} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          className={`h-4 w-4 ${value <= rating ? "fill-[#b7102a] text-[#b7102a]" : "text-[#655f58]"}`}
        />
      ))}
    </div>
  );
}
