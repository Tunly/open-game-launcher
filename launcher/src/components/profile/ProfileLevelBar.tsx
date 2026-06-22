export function ProfileLevelBar({
  isEmbedded = false,
  level,
  xp,
}: {
  isEmbedded?: boolean;
  level: number;
  xp: number;
}) {
  const nextLevelXp = Math.max(1000, Math.ceil((level + 1) * 500));
  const progress = Math.min(100, Math.round((xp / nextLevelXp) * 100));

  return (
    <div
      className={
        isEmbedded
          ? "border-[3px] border-black bg-[#f6edd8] p-3"
          : "border-4 border-black bg-[#fff9ed] p-3 shadow-[5px_5px_0_#1f1c0f]"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <p className="neo-title text-5xl leading-none text-[#171411]">{level}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          <p className="neo-copy inline-block border-2 border-black bg-[#b7102a] px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-white">
            Level
          </p>
          <p className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black uppercase text-[#171411]">
            {xp}/{nextLevelXp} XP
          </p>
        </div>
      </div>
      <div className="mt-2 h-3 border-2 border-black bg-[#efe6d4]">
        <div
          className="h-full border-r-2 border-black bg-[#007166]"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
