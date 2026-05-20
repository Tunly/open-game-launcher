import type { ProfileTheme } from "../../lib/types/profile";

export function ProfileThemePreview({ theme }: { theme: ProfileTheme }) {
  return (
    <div
      className="border border-white/10 p-4"
      style={{ background: theme.backgroundValue ?? "#111827" }}
    >
      <p className="text-lg font-bold text-white">{theme.name}</p>
      <p className="mt-2 text-sm text-slate-300">{theme.description}</p>
    </div>
  );
}
