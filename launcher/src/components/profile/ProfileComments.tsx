import type { ProfileComment } from "../../lib/types/profile";

export function ProfileComments({ comments }: { comments: ProfileComment[] }) {
  return (
    <section className="border border-white/10 bg-white/[0.05] p-5">
      <h2 className="text-xl font-bold text-white">Guestbook</h2>
      <div className="mt-4 space-y-3">
        {comments.length > 0 ? (
          comments.map((comment) => (
            <article key={comment.id} className="border border-white/10 bg-black/20 p-3">
              <p className="text-sm text-slate-300">{comment.body}</p>
            </article>
          ))
        ) : (
          <p className="text-sm text-slate-400">No public comments yet.</p>
        )}
      </div>
      <div className="mt-4 border border-dashed border-white/15 p-3 text-sm text-slate-400">
        Comment form MVP: wire this to addProfileComment after moderation rules
        are finalized.
      </div>
    </section>
  );
}
