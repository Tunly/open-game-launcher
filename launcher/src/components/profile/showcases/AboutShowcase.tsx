import type { Profile } from "../../../lib/types/profile";
import { EmptyShowcaseText, ShowcasePanel } from "./ShowcasePanel";

export function AboutShowcase({ profile }: { profile: Profile }) {
  return (
    <ShowcasePanel title="About">
      {profile.bio ? (
        <p className="text-sm font-semibold leading-6 text-[#5b403f]">
          {profile.bio}
        </p>
      ) : (
        <EmptyShowcaseText>No profile text yet.</EmptyShowcaseText>
      )}
    </ShowcasePanel>
  );
}
