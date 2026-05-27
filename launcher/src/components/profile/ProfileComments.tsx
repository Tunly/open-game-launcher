import { Send, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { addProfileComment, deleteProfileComment } from "../../lib/supabase/profile";
import type { ProfileComment } from "../../lib/types/profile";

export function ProfileComments({
  canWrite,
  comments,
  currentUserId,
  isMock = false,
  onCommentsChange,
  profileUserId,
}: {
  canWrite: boolean;
  comments: ProfileComment[];
  currentUserId: string | null;
  isMock?: boolean;
  onCommentsChange: (comments: ProfileComment[]) => void;
  profileUserId: string;
}) {
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextBody = body.trim();
    if (!nextBody || isMock) {
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const comment = await addProfileComment(profileUserId, nextBody);
      onCommentsChange([comment, ...comments]);
      setBody("");
      setMessage("Comment posted.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function removeComment(commentId: string) {
    if (isMock) {
      return;
    }

    setPendingDeleteId(commentId);
    setMessage(null);
    setErrorMessage(null);

    try {
      await deleteProfileComment(commentId);
      onCommentsChange(comments.filter((comment) => comment.id !== commentId));
      setMessage("Comment removed.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingDeleteId(null);
    }
  }

  return (
    <section className="border-4 border-black bg-[#fff9ed] p-5 shadow-[6px_6px_0_#1f1c0f]">
      <div className="flex flex-wrap items-center gap-3 border-b-[3px] border-black pb-3">
        <span className="neo-copy border-2 border-black bg-[#007166] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white">
          Community
        </span>
        <h2 className="neo-title text-3xl leading-none text-[#171411]">
          Guestbook
        </h2>
      </div>
      <div className="mt-4 space-y-3">
        {comments.length > 0 ? (
          comments.map((comment) => (
            <article
              key={comment.id}
              className="border-[3px] border-black bg-[#f6edd8] p-3 shadow-[3px_3px_0_#1f1c0f]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
                    Player {comment.authorId.slice(0, 8)}
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-[#5b403f]">
                    {comment.body}
                  </p>
                </div>
                {currentUserId === comment.authorId || currentUserId === profileUserId ? (
                  <button
                    aria-label="Delete comment"
                    className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-black bg-[#b7102a] text-white shadow-[2px_2px_0_#1f1c0f] disabled:opacity-50"
                    disabled={pendingDeleteId === comment.id}
                    type="button"
                    onClick={() => void removeComment(comment.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </article>
          ))
        ) : (
          <p className="neo-copy border-2 border-dashed border-black bg-[#f6edd8] p-3 text-[12px] font-bold uppercase leading-5 text-[#655f58]">
            No public comments yet.
          </p>
        )}
      </div>
      {canWrite ? (
        <form className="mt-4 flex flex-col gap-3" onSubmit={submitComment}>
          <textarea
            className="neo-copy min-h-24 resize-none border-[3px] border-black bg-[#f6edd8] p-3 text-[12px] font-bold uppercase leading-5 text-[#171411] outline-none placeholder:text-[#655f58]"
            disabled={isSubmitting || isMock}
            maxLength={1000}
            placeholder="Leave a public guestbook comment..."
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <button
            className="neo-copy inline-flex h-11 items-center justify-center gap-2 border-2 border-black bg-[#007166] px-4 text-[11px] font-black uppercase tracking-[0.12em] text-white shadow-[3px_3px_0_#1f1c0f] transition hover:-translate-y-0.5 disabled:opacity-50"
            disabled={!body.trim() || isSubmitting || isMock}
            type="submit"
          >
            <Send className="h-4 w-4" />
            Post Comment
          </button>
        </form>
      ) : (
        <p className="neo-copy mt-4 border-2 border-dashed border-black bg-[#efe6d4] p-3 text-[11px] font-black uppercase leading-5 text-[#655f58]">
          Sign in to leave a guestbook comment.
        </p>
      )}
      {message ? (
        <p className="neo-copy mt-3 border-2 border-black bg-[#007166] p-3 text-[10px] font-black uppercase tracking-[0.12em] text-white">
          {message}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="neo-copy mt-3 border-2 border-black bg-[#b7102a] p-3 text-[10px] font-black uppercase tracking-[0.12em] text-white">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}
