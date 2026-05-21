import type { ProfileTheme } from "../../lib/types/profile";

export function ProfileThemePreview({ theme }: { theme: ProfileTheme }) {
  return (
    <div
      className="border-[3px] border-black p-4 shadow-[3px_3px_0_#171411]"
      style={{ background: theme.backgroundValue ?? "#f6edd8" }}
    >
      <p className="neo-title text-3xl leading-none text-[#171411]">
        {theme.name}
      </p>
      <p className="mt-2 text-sm font-semibold leading-6 text-[#5b403f]">
        {theme.description}
      </p>
    </div>
  );
}
