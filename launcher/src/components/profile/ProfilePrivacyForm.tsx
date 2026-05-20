import type { Profile, ProfileVisibility } from "../../lib/types/profile";

const visibilityOptions: ProfileVisibility[] = ["public", "friends_only", "private"];

export function ProfilePrivacyForm({
  profile,
  onChange,
}: {
  profile: Profile;
  onChange: (field: keyof Profile, value: ProfileVisibility) => void;
}) {
  const fields: Array<[keyof Profile, string]> = [
    ["profileVisibility", "Profile"],
    ["onlineStatusVisibility", "Online status"],
    ["gameActivityVisibility", "Game activity"],
    ["achievementVisibility", "Achievements"],
    ["libraryVisibility", "Library"],
    ["wishlistVisibility", "Wishlist"],
    ["commentsVisibility", "Comments"],
  ];

  return (
    <div className="space-y-3">
      {fields.map(([field, label]) => (
        <label key={String(field)} className="flex items-center justify-between gap-4 border border-white/10 bg-white/[0.05] p-4">
          <span className="font-semibold text-white">{label}</span>
          <select
            className="bg-[#0f172a] px-3 py-2 text-sm text-white"
            value={String(profile[field])}
            onChange={(event) => onChange(field, event.target.value as ProfileVisibility)}
          >
            {visibilityOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}
