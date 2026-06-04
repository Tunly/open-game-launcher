import { Gamepad2, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <section className="overflow-hidden border border-white/10 bg-[#111827]">
        <div className="grid gap-8 p-6 lg:grid-cols-[1fr_360px] lg:p-10">
          <div>
            <span className="inline-flex border border-sky-300/20 bg-sky-400/10 px-3 py-2 text-xs font-bold uppercase text-sky-100">
              Profile System MVP
            </span>
            <h1 className="mt-5 max-w-3xl text-5xl font-black leading-none text-white sm:text-7xl">
              Build the player room behind the launcher.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
              Public profiles, privacy rules, showcases, friends, comments, cosmetics, and secure
              Supabase ownership boundaries are wired as the next foundation for the launcher
              platform.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                className="bg-sky-400 px-5 py-3 text-sm font-black text-slate-950 hover:bg-sky-300"
                to="/settings/profile"
              >
                Edit Profile
              </Link>
              <Link
                className="border border-white/10 bg-white/[0.06] px-5 py-3 text-sm font-black text-white hover:bg-white/[0.1]"
                to="/friends"
              >
                Friends
              </Link>
            </div>
          </div>
          <div className="grid gap-3">
            {[
              [
                "Secure RLS",
                "Profile reads and writes stay behind Supabase policies.",
                ShieldCheck,
              ],
              ["Showcases", "Custom panels turn a profile into a gaming room.", Sparkles],
              ["Social Layer", "Friend requests, blocks, and comments are modeled.", Users],
              ["Game Data", "Library and achievement writes are kept backend-only.", Gamepad2],
            ].map(([title, body, Icon]) => (
              <article key={title as string} className="border border-white/10 bg-white/[0.05] p-4">
                <div className="flex items-start gap-3">
                  <Icon className="mt-1 h-5 w-5 text-sky-300" />
                  <div>
                    <h2 className="font-bold text-white">{title as string}</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-400">{body as string}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
