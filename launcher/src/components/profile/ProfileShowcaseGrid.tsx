import type { ProfilePrivacyGuard } from "../../lib/profile-privacy-guard";
import type { ProfilePageData, ProfileShowcase } from "../../lib/types/profile";
import { AboutShowcase } from "./showcases/AboutShowcase";
import { ActivityShowcase } from "./showcases/ActivityShowcase";
import { CustomTextShowcase } from "./showcases/CustomTextShowcase";
import { FavoriteGamesShowcase } from "./showcases/FavoriteGamesShowcase";
import { HardwareShowcase } from "./showcases/HardwareShowcase";
import { RareAchievementsShowcase } from "./showcases/RareAchievementsShowcase";
import { EmptyShowcaseText, ShowcasePanel } from "./showcases/ShowcasePanel";
import { StatsShowcase } from "./showcases/StatsShowcase";
import { WishlistShowcase } from "./showcases/WishlistShowcase";

export function ProfileShowcaseGrid({
  data,
  privacyGuard,
}: {
  data: ProfilePageData;
  privacyGuard?: ProfilePrivacyGuard;
}) {
  const showcases =
    data.showcases.length > 0
      ? data.showcases
      : ([
          { id: "about", type: "about" },
          { id: "stats", type: "stats" },
          { id: "hardware", type: "hardware_setup" },
          { id: "favorite", type: "favorite_games" },
          { id: "achievements", type: "rare_achievements" },
          { id: "wishlist", type: "wishlist" },
          { id: "activity", type: "activity" },
        ] as Pick<ProfileShowcase, "id" | "type">[]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {showcases.map((showcase) => (
        <div key={showcase.id} className="min-w-0">
          {renderShowcase(showcase as ProfileShowcase, data, privacyGuard)}
        </div>
      ))}
    </div>
  );
}

function renderShowcase(
  showcase: ProfileShowcase,
  data: ProfilePageData,
  privacyGuard?: ProfilePrivacyGuard,
) {
  const guardedLane = getGuardedLaneForShowcase(showcase.type, privacyGuard);
  if (guardedLane) {
    return <GuardedShowcase laneLabel={guardedLane.label} />;
  }

  switch (showcase.type) {
    case "about":
      return <AboutShowcase profile={data.profile} />;
    case "favorite_games":
      return <FavoriteGamesShowcase games={data.libraryPreview} />;
    case "rare_achievements":
    case "latest_achievements":
      return <RareAchievementsShowcase achievements={data.achievementPreview} />;
    case "stats":
      return <StatsShowcase stats={data.stats} />;
    case "activity":
      return <ActivityShowcase activity={data.activity} />;
    case "wishlist":
      return <WishlistShowcase items={data.wishlistPreview} />;
    case "hardware_setup":
      return <HardwareShowcase hardware={data.hardware} />;
    case "custom_text":
      return <CustomTextShowcase showcase={showcase} />;
    default:
      return <CustomTextShowcase showcase={showcase} />;
  }
}

function getGuardedLaneForShowcase(
  showcaseType: ProfileShowcase["type"],
  privacyGuard?: ProfilePrivacyGuard,
) {
  if (!privacyGuard) return null;

  const laneIdByShowcaseType: Partial<
    Record<ProfileShowcase["type"], ProfilePrivacyGuard["blockedLanes"][number]["id"]>
  > = {
    activity: "activity",
    favorite_games: "library",
    hardware_setup: "hardware",
    latest_achievements: "achievements",
    rare_achievements: "achievements",
    wishlist: "wishlist",
  };
  const laneId = laneIdByShowcaseType[showcaseType];
  if (!laneId) return null;

  return privacyGuard.blockedLanes.find((lane) => lane.id === laneId) ?? null;
}

function GuardedShowcase({ laneLabel }: { laneLabel: string }) {
  return (
    <ShowcasePanel kicker="Privacy" title={laneLabel}>
      <EmptyShowcaseText>
        Hidden by this profile's privacy rules for the current viewer.
      </EmptyShowcaseText>
    </ShowcasePanel>
  );
}
