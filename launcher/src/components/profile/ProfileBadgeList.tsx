import type { UserBadge } from "../../lib/types/profile";

const fallbackBadges: UserBadge[] = [
  {
    id: "founder",
    userId: "mock",
    key: "founder",
    name: "Founder",
    description: "Early platform supporter.",
    iconUrl: null,
    rarity: "legendary",
    source: "founder",
    earnedAt: new Date().toISOString(),
  },
  {
    id: "hunter",
    userId: "mock",
    key: "achievement_hunter",
    name: "Achievement Hunter",
    description: "Unlocked rare achievements.",
    iconUrl: null,
    rarity: "rare",
    source: "achievement",
    earnedAt: new Date().toISOString(),
  },
];

export function ProfileBadgeList({ badges }: { badges: UserBadge[] }) {
  const visibleBadges = badges.length > 0 ? badges : fallbackBadges;

  return (
    <div className="flex flex-wrap gap-2">
      {visibleBadges.map((badge) => (
        <span
          key={badge.id}
          className="border border-sky-300/20 bg-sky-400/10 px-3 py-2 text-xs font-bold uppercase text-sky-100"
          title={badge.description ?? badge.name}
        >
          {badge.name}
        </span>
      ))}
    </div>
  );
}
