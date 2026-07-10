import type { Profile } from "../../../lib/types/profile";
import { EmptyShowcaseText, ShowcasePanel } from "./ShowcasePanel";

export function AboutShowcase({ profile }: { profile: Profile }) {
  return (
    <ShowcasePanel title="About">
      {profile.bio ? (
        <p className="text-sm leading-6 font-semibold text-[#5b403f]">{profile.bio}</p>
      ) : (
        <EmptyShowcaseText>No profile text yet.</EmptyShowcaseText>
      )}
    </ShowcasePanel>
  );
}
