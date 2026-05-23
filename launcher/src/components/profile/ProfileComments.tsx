import type { ProfileComment } from "../../lib/types/profile";

export function ProfileComments({ comments }: { comments: ProfileComment[] }) {
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
              <p className="text-sm font-semibold leading-6 text-[#5b403f]">
                {comment.body}
              </p>
            </article>
          ))
        ) : (
          <p className="neo-copy border-2 border-dashed border-black bg-[#f6edd8] p-3 text-[12px] font-bold uppercase leading-5 text-[#655f58]">
            No public comments yet.
          </p>
        )}
      </div>
      <div className="neo-copy mt-4 border-2 border-dashed border-black bg-[#efe6d4] p-3 text-[11px] font-black uppercase leading-5 text-[#655f58]">
        Comment form MVP: wire this to addProfileComment after moderation rules
        are finalized.
      </div>
    </section>
  );
}
