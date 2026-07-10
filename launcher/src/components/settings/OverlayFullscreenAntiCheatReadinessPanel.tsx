import { Monitor, ShieldCheck, Zap } from "lucide-react";

import type {
  OverlayFullscreenAntiCheatReadiness,
  OverlayFullscreenAntiCheatReadinessLane,
  OverlayFullscreenAntiCheatReadinessStatus,
} from "../../lib/overlay-fullscreen-anti-cheat-readiness";

export function OverlayFullscreenAntiCheatReadinessPanel({
  readiness,
}: {
  readiness: OverlayFullscreenAntiCheatReadiness;
}) {
  return (
    <section
      aria-label="Overlay fullscreen anti-cheat readiness"
      className="neo-dots border-4 border-black bg-[#f5eedf] [overflow-wrap:anywhere] shadow-[5px_5px_0_#171411]"
    >
      <div className="border-b-4 border-black bg-[#171411] p-5 text-white">
        <p className="neo-copy text-[10px] font-bold tracking-[0.16em] text-[#8cf5e4] uppercase">
          Fullscreen Research Packet
        </p>
        <h2 className="neo-title mt-1 flex items-center gap-2 text-3xl leading-none">
          <Monitor aria-hidden="true" className="h-8 w-8" />
          Overlay Fullscreen / Anti-Cheat
        </h2>
      </div>

      <div className="space-y-4 p-5">
        <div className="border-2 border-black bg-[#efe6d4] p-3 shadow-[3px_3px_0_#171411]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="neo-copy text-[10px] font-black text-[#55504a] uppercase">
                {readiness.statusLabel}
              </p>
              <p className="neo-title mt-1 text-5xl leading-none text-[#171411] uppercase">
                {readiness.reviewCount}/{readiness.lanes.length}
              </p>
            </div>
            <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-3 py-2 text-[10px] font-black text-[#171411] uppercase shadow-[2px_2px_0_#171411]">
              {readiness.blockedCount} blocked
            </span>
          </div>
          <p className="neo-copy mt-3 text-[10px] leading-5 font-black text-[#55504a] uppercase">
            {readiness.summary}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {readiness.lanes.map((lane) => (
            <OverlayFullscreenLaneCard key={lane.id} lane={lane} />
          ))}
        </div>

        <div className="border-2 border-black bg-[#171411] p-3 text-[#fbf4e7] shadow-[3px_3px_0_#b7102a]">
          <p className="neo-copy flex items-center gap-2 text-[10px] font-black text-[#8cf5e4] uppercase">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            Fullscreen Guard
          </p>
          <p className="neo-copy mt-2 border-2 border-[#fbf4e7] bg-[#2a221b] px-3 py-2 text-[9px] leading-4 font-black uppercase">
            {readiness.guardCopy}
          </p>
          <div className="mt-2 grid gap-1.5 md:grid-cols-3">
            {readiness.guards.map((guard) => (
              <p
                className="neo-copy border-2 border-[#fbf4e7] bg-[#2a221b] px-2 py-1 text-[8px] leading-4 font-black uppercase"
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

function OverlayFullscreenLaneCard({ lane }: { lane: OverlayFullscreenAntiCheatReadinessLane }) {
  return (
    <article
      className={`min-h-[210px] border-2 border-black p-3 shadow-[3px_3px_0_#171411] ${statusClass(
        lane.status,
      )}`}
    >
      <p className="neo-copy text-[8px] font-black tracking-[0.12em] text-[#55504a] uppercase">
        Research Lane
      </p>
      <h3 className="mt-1 flex items-center gap-1.5 text-sm leading-tight font-black text-[#171411] uppercase">
        <Zap aria-hidden="true" className="h-4 w-4 shrink-0" />
        {lane.label}
      </h3>
      <span className="neo-copy mt-2 inline-block border-2 border-black bg-[#fff9ed] px-1.5 py-0.5 text-[8px] font-black text-[#171411] uppercase">
        {lane.status}
      </span>
      <p className="neo-copy mt-2 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] leading-4 font-black text-[#171411] uppercase">
        {lane.evidence}
      </p>
      <p className="neo-copy mt-2 text-[8px] leading-4 font-black text-[#55504a] uppercase">
        {lane.detail}
      </p>
      <p className="neo-copy mt-2 border-2 border-black bg-[#171411] px-2 py-1 text-[8px] leading-4 font-black text-[#fbf4e7] uppercase">
        {lane.action}
      </p>
    </article>
  );
}

function statusClass(status: OverlayFullscreenAntiCheatReadinessStatus) {
  if (status === "review") return "bg-[#8cf5e4] text-[#171411]";
  return "bg-[#efe6d4] text-[#171411]";
}
