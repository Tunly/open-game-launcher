import { Database, FolderOpen, KeyRound, ShieldCheck, Trophy } from "lucide-react";

import type {
  AchievementCacheReadiness,
  AchievementCacheReadinessItem,
  AchievementCacheReadinessStatus,
} from "../../lib/achievement-cache-readiness";

export function AchievementCacheReadinessPanel({
  readiness,
}: {
  readiness: AchievementCacheReadiness;
}) {
  return (
    <section
      aria-label="Achievement cache readiness"
      className="neo-dots mx-auto max-w-[980px] border-4 border-black bg-[#fff9ed] p-4 [overflow-wrap:anywhere] shadow-[6px_6px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-black pb-3">
        <div>
          <p className="neo-copy text-[10px] font-black tracking-[0.22em] text-[#b7102a] uppercase">
            Local Achievement Cache
          </p>
          <h2 className="neo-title mt-1 flex items-center gap-2 text-3xl text-[#171411] uppercase">
            <Trophy aria-hidden="true" className="h-8 w-8" />
            Cache Readiness
          </h2>
          <p className="neo-copy mt-2 max-w-3xl text-xs leading-5 font-bold text-[#5f574d] uppercase">
            {readiness.summary}
          </p>
        </div>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-3 py-2 text-[10px] font-black text-[#171411] uppercase shadow-[3px_3px_0_#171411]">
          {readiness.statusLabel}
        </span>
      </div>

      <div className="mt-4 grid items-start gap-3 lg:grid-cols-[220px_minmax(0,1fr)_280px]">
        <div className="grid gap-3">
          <CacheStat label="Review lanes" value={`${readiness.reviewCount}`} />
          <CacheStat label="Blocked lanes" value={`${readiness.blockedCount}`} />
        </div>

        <div className="grid items-start gap-3 md:grid-cols-2">
          {readiness.items.map((item) => (
            <CacheReadinessCard item={item} key={item.id} />
          ))}
        </div>

        <div className="self-start border-2 border-black bg-[#171411] p-3 text-[#fff9ed] shadow-[3px_3px_0_#b7102a]">
          <p className="neo-copy flex items-center gap-2 text-[10px] font-black text-[#8cf5e4] uppercase">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            Cache Guard
          </p>
          <p className="neo-copy mt-2 border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] leading-5 font-black uppercase">
            {readiness.guardCopy}
          </p>
          <div className="mt-3 grid gap-2">
            {readiness.guards.map((guard) => (
              <p
                className="neo-copy border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] leading-5 font-black uppercase"
                key={guard}
              >
                {guard}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CacheStat({ label, value }: { label: string; value: string }) {
  return (
    <article className="border-2 border-black bg-[#efe3cf] p-3 shadow-[3px_3px_0_#171411]">
      <p className="neo-copy text-[9px] font-black tracking-[0.16em] text-[#b7102a] uppercase">
        {label}
      </p>
      <p className="neo-title mt-1 text-5xl leading-none text-[#171411]">{value}</p>
    </article>
  );
}

function CacheReadinessCard({ item }: { item: AchievementCacheReadinessItem }) {
  const Icon =
    item.id === "cache-folder-handoff"
      ? FolderOpen
      : item.id === "supabase-achievement-write"
        ? Database
        : item.id === "oauth-token-exchange"
          ? KeyRound
          : Trophy;

  return (
    <article
      className={`min-h-[184px] border-2 border-black p-3 shadow-[3px_3px_0_#171411] ${statusClass(
        item.status,
      )}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy text-[9px] font-black tracking-[0.16em] text-[#5f574d] uppercase">
            Cache Lane
          </p>
          <h3 className="mt-1 flex items-center gap-1.5 text-base leading-tight font-black text-[#171411] uppercase">
            <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </h3>
        </div>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black text-[#171411] uppercase">
          {item.status}
        </span>
      </div>
      <p className="neo-copy mt-3 border-2 border-black bg-[#fff9ed] px-2 py-2 text-[9px] leading-4 font-black text-[#171411] uppercase">
        {item.evidence}
      </p>
      <p className="neo-copy mt-3 text-[10px] leading-5 font-black text-[#5f574d] uppercase">
        {item.detail}
      </p>
      <p className="neo-copy mt-3 border-2 border-black bg-[#171411] px-2 py-2 text-[9px] leading-4 font-black text-[#fff9ed] uppercase">
        {item.action}
      </p>
    </article>
  );
}

function statusClass(status: AchievementCacheReadinessStatus) {
  if (status === "review") return "bg-[#8cf5e4] text-[#171411]";
  return "bg-[#efe3cf] text-[#171411]";
}
