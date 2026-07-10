import { EyeOff, LockKeyhole, ShieldCheck, UserCheck } from "lucide-react";

import type {
  ProfilePrivacyBlockedLane,
  ProfilePrivacyGuard,
  ProfilePrivacyVisibleLane,
} from "../../lib/profile-privacy-guard";

export function ProfilePrivacyGuardPanel({ guard }: { guard: ProfilePrivacyGuard }) {
  return (
    <section
      aria-label="Public profile privacy guard"
      className="neo-dots border-4 border-black bg-[#fff9ed] p-4 shadow-[6px_6px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-black pb-3">
        <div>
          <p className="neo-copy text-[10px] font-black tracking-[0.22em] text-[#b7102a] uppercase">
            Local Public Profile Gate
          </p>
          <h2 className="neo-title mt-1 flex items-center gap-2 text-3xl text-[#171411] uppercase">
            <ShieldCheck aria-hidden="true" className="h-8 w-8" />
            Public Profile Privacy Guard
          </h2>
          <p className="neo-copy mt-2 max-w-3xl text-xs leading-5 font-bold text-[#5f574d] uppercase">
            {guard.summary}
          </p>
        </div>
        <span
          className={`neo-copy border-2 border-black px-3 py-2 text-[10px] font-black uppercase shadow-[3px_3px_0_#171411] ${statusClass(
            guard.status,
          )}`}
        >
          {guard.statusLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)_280px]">
        <div className="border-2 border-black bg-[#efe3cf] p-3 shadow-[3px_3px_0_#171411]">
          <p className="neo-copy flex items-center gap-2 text-[10px] font-black text-[#5f574d] uppercase">
            <UserCheck aria-hidden="true" className="h-4 w-4" />
            Viewer Packet
          </p>
          <div className="mt-3 grid gap-2">
            <GuardStat label="Route" value={guard.route} />
            <GuardStat label="Viewer" value={guard.viewerLabel} />
            <GuardStat label="Visible lanes" value={`${guard.publicCount}`} />
            <GuardStat label="Blocked lanes" value={`${guard.blockedCount}`} />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {guard.blockedLanes.map((lane) => (
            <BlockedLaneCard key={lane.id} lane={lane} />
          ))}
          {guard.visibleLanes.map((lane) => (
            <VisibleLaneCard key={lane.id} lane={lane} />
          ))}
        </div>

        <div className="border-2 border-black bg-[#171411] p-3 text-[#fff9ed] shadow-[3px_3px_0_#b7102a]">
          <p className="neo-copy flex items-center gap-2 text-[10px] font-black text-[#8cf5e4] uppercase">
            <LockKeyhole aria-hidden="true" className="h-4 w-4" />
            Guardrails
          </p>
          <p className="neo-copy mt-2 border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] leading-5 font-black uppercase">
            {guard.guardCopy}
          </p>
          <div className="mt-3 grid gap-2">
            {guard.guardrails.map((guardrail) => (
              <p
                className="neo-copy border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] leading-5 font-black uppercase"
                key={guardrail}
              >
                {guardrail}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function GuardStat({ label, value }: { label: string; value: string }) {
  return (
    <article className="border-2 border-black bg-[#fff9ed] p-2 shadow-[2px_2px_0_#171411]">
      <p className="neo-copy text-[8px] font-black tracking-[0.14em] text-[#b7102a] uppercase">
        {label}
      </p>
      <p className="neo-copy mt-1 text-[9px] leading-4 font-black break-words text-[#171411] uppercase">
        {value}
      </p>
    </article>
  );
}

function BlockedLaneCard({ lane }: { lane: ProfilePrivacyBlockedLane }) {
  return (
    <article className="min-h-[130px] border-2 border-black bg-[#efe3cf] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy flex items-center gap-1 text-[9px] font-black tracking-[0.16em] text-[#b7102a] uppercase">
            <EyeOff aria-hidden="true" className="h-3.5 w-3.5" />
            Redacted
          </p>
          <h3 className="mt-1 text-base leading-tight font-black text-[#171411] uppercase">
            {lane.label}
          </h3>
        </div>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black text-[#171411] uppercase">
          {lane.visibility}
        </span>
      </div>
      <p className="neo-copy mt-3 text-[10px] leading-5 font-black text-[#5f574d] uppercase">
        {lane.detail}
      </p>
    </article>
  );
}

function VisibleLaneCard({ lane }: { lane: ProfilePrivacyVisibleLane }) {
  return (
    <article className="min-h-[130px] border-2 border-black bg-[#8cf5e4] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy text-[9px] font-black tracking-[0.16em] text-[#087d6d] uppercase">
            {lane.state === "empty" ? "Allowed Empty" : "Allowed"}
          </p>
          <h3 className="mt-1 text-base leading-tight font-black text-[#171411] uppercase">
            {lane.label}
          </h3>
        </div>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black text-[#171411] uppercase">
          {lane.visibility}
        </span>
      </div>
      <p className="neo-copy mt-3 text-[10px] leading-5 font-black text-[#5f574d] uppercase">
        {lane.detail}
      </p>
    </article>
  );
}

function statusClass(status: ProfilePrivacyGuard["status"]) {
  if (status === "owner-visible") return "bg-[#f6edd8] text-[#171411]";
  if (status === "friend-visible") return "bg-[#8cf5e4] text-[#171411]";
  return "bg-[#8cf5e4] text-[#171411]";
}
