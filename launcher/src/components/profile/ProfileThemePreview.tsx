import type { ProfileTheme } from "../../lib/types/profile";

export function ProfileThemePreview({ theme }: { theme: ProfileTheme }) {
  const background =
    theme.backgroundType === "solid" && theme.backgroundValue ? theme.backgroundValue : "#f6edd8";
  const accent = theme.accentColor ?? "#b7102a";
  const text = theme.textColor ?? "#171411";

  return (
    <div
      className="border-[3px] border-black p-4 shadow-[3px_3px_0_#171411]"
      style={{ background }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="neo-title text-3xl leading-none text-[#171411]">{theme.name}</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#5b403f]">
            {theme.description ?? "Profile theme preview."}
          </p>
        </div>
        <span className="neo-copy shrink-0 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black uppercase text-[#171411]">
          {theme.cardStyle}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <ThemeSwatch label="Accent" value={accent} />
        <ThemeSwatch label="Text" value={text} />
      </div>
    </div>
  );
}

function ThemeSwatch({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-black bg-[#fff9ed] p-2">
      <div className="h-6 border-2 border-black" style={{ background: value }} />
      <p className="neo-copy mt-2 truncate text-[9px] font-black uppercase text-[#5b403f]">
        {label} / {value}
      </p>
    </div>
  );
}
