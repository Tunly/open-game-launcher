import type { Profile } from "../../../lib/types/profile";

export function AboutShowcase({ profile }: { profile: Profile }) {
  return (
    <div className="border border-white/10 bg-white/[0.05] p-5">
      <h3 className="text-lg font-bold text-white">About</h3>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        {profile.bio ?? "No profile text yet."}
      </p>
    </div>
  );
}
