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
        <label
          key={String(field)}
          className="flex flex-col justify-between gap-3 border-2 border-black bg-[#efe6d4] p-4 shadow-[2px_2px_0_#171411] sm:flex-row sm:items-center"
        >
          <span className="neo-copy text-[12px] font-black uppercase tracking-[0.12em] text-[#171411]">
            {label}
          </span>
          <select
            className="neo-copy h-10 w-full border-2 border-black bg-[#fff9ed] px-3 text-xs font-bold uppercase text-[#171411] shadow-[2px_2px_0_#171411] sm:w-56"
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
