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
          ? "border-[3px] border-black bg-[#f6edd8] p-4"
          : "border-4 border-black bg-[#fff9ed] p-4 shadow-[5px_5px_0_#1f1c0f]"
      }
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="neo-copy inline-block border-2 border-black bg-[#b7102a] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white">
            Level
          </p>
          <p className="neo-title mt-2 text-6xl leading-none text-[#171411]">
            {level}
          </p>
        </div>
        <p className="neo-copy border-2 border-black bg-[#f6edd8] px-3 py-2 text-[11px] font-black uppercase text-[#171411]">
          {xp}/{nextLevelXp} XP
        </p>
      </div>
      <div className="mt-4 h-5 border-[3px] border-black bg-[#efe6d4]">
        <div
          className="h-full border-r-[3px] border-black bg-[#007166]"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
