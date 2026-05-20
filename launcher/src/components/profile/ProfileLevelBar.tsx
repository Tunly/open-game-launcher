export function ProfileLevelBar({
  level,
  xp,
}: {
  level: number;
  xp: number;
}) {
  const nextLevelXp = Math.max(1000, Math.ceil((level + 1) * 500));
  const progress = Math.min(100, Math.round((xp / nextLevelXp) * 100));

  return (
    <div className="border border-white/10 bg-white/[0.06] p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase text-sky-200">Level</p>
          <p className="mt-1 text-4xl font-black text-white">{level}</p>
        </div>
        <p className="text-sm font-semibold text-slate-300">
          {xp}/{nextLevelXp} XP
        </p>
      </div>
      <div className="mt-4 h-3 overflow-hidden bg-black/40">
        <div className="h-full bg-sky-400" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
