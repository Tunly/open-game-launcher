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
      {visibleBadges.map((badge, index) => (
        <span
          key={badge.id}
          className={`neo-copy border-2 border-black px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] shadow-[2px_2px_0_#1f1c0f] ${
            index % 2 === 0
              ? "bg-[#b7102a] text-white"
              : "bg-[#f6edd8] text-[#171411]"
          }`}
          title={badge.description ?? badge.name}
        >
          {badge.name}
        </span>
      ))}
    </div>
  );
}
