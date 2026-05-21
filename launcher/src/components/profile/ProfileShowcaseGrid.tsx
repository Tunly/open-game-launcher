import type { ProfilePageData, ProfileShowcase } from "../../lib/types/profile";
import { AboutShowcase } from "./showcases/AboutShowcase";
import { ActivityShowcase } from "./showcases/ActivityShowcase";
import { CustomTextShowcase } from "./showcases/CustomTextShowcase";
import { FavoriteGamesShowcase } from "./showcases/FavoriteGamesShowcase";
import { HardwareShowcase } from "./showcases/HardwareShowcase";
import { RareAchievementsShowcase } from "./showcases/RareAchievementsShowcase";
import { StatsShowcase } from "./showcases/StatsShowcase";
import { WishlistShowcase } from "./showcases/WishlistShowcase";

export function ProfileShowcaseGrid({ data }: { data: ProfilePageData }) {
  const showcases =
    data.showcases.length > 0
      ? data.showcases
      : ([
          { id: "about", type: "about" },
          { id: "stats", type: "stats" },
          { id: "hardware", type: "hardware_setup" },
          { id: "favorite", type: "favorite_games" },
          { id: "activity", type: "activity" },
        ] as Pick<ProfileShowcase, "id" | "type">[]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {showcases.map((showcase) => (
        <div key={showcase.id} className="min-w-0">
          {renderShowcase(showcase as ProfileShowcase, data)}
        </div>
      ))}
    </div>
  );
}

function renderShowcase(showcase: ProfileShowcase, data: ProfilePageData) {
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
