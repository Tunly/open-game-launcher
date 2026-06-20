import { CheckCircle2, Smartphone, TriangleAlert } from "lucide-react";

import type {
  MobileAppReadiness,
  MobileAppReadinessGate,
  MobileAppReadinessStatus,
} from "../../lib/mobile-app-readiness";

export function MobileAppReadinessPanel({ readiness }: { readiness: MobileAppReadiness }) {
  return (
    <section
      aria-label="Mobile app readiness"
      className="border-4 border-black bg-[#fff9ed] p-4 shadow-[5px_5px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="neo-copy inline-flex items-center gap-1 border-2 border-black bg-[#171411] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white">
            <Smartphone className="h-3 w-3 text-[#8cf5e4]" />
            Mobile Companion
          </span>
          <h2 className="neo-title mt-2 text-2xl font-black uppercase leading-none text-[#171411]">
            Mobile App Readiness
          </h2>
          <p className="neo-copy mt-2 text-[10px] font-black uppercase leading-relaxed text-[#5b403f]">
            {readiness.summary}
          </p>
        </div>
        <span
          className={`neo-copy border-2 border-black px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] shadow-[2px_2px_0_#171411] ${statusClass(
            readiness.blockedCount > 0
              ? "blocked"
              : readiness.warningCount > 0
                ? "warning"
                : "ready",
          )}`}
        >
          {readiness.statusLabel}
        </span>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div>
          <div className="border-2 border-black bg-[#f5eedf] p-3 shadow-[3px_3px_0_#171411]">
            <p className="neo-copy text-[9px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
              Next Gate
            </p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
              <p className="neo-copy max-w-xl text-[10px] font-black uppercase leading-relaxed text-[#171411]">
                {readiness.nextAction}
              </p>
              <span className="neo-title border-2 border-black bg-[#8cf5e4] px-3 py-1 text-2xl uppercase shadow-[2px_2px_0_#171411]">
                {readiness.progress}%
              </span>
            </div>
            <div className="mt-3 h-3 border-2 border-black bg-[#efe6d4]">
              <div className="h-full bg-[#087d6d]" style={{ width: `${readiness.progress}%` }} />
            </div>
          </div>

          <div className="mt-3 border-2 border-black bg-[#171411] p-3 text-[#fff9ed] shadow-[3px_3px_0_#b7102a]">
            <p className="neo-copy text-[9px] font-black uppercase text-[#8cf5e4]">Local Guard</p>
            <p className="neo-copy mt-2 border-2 border-[#fff9ed] bg-[#2a221b] px-2 py-1 text-[8px] font-black uppercase leading-4">
              {readiness.guardCopy}
            </p>
            <div className="mt-2 grid gap-1.5">
              {readiness.guards.map((guard) => (
                <p
                  className="neo-copy border-2 border-[#fff9ed] bg-[#2a221b] px-2 py-1 text-[8px] font-black uppercase leading-4"
                  key={guard}
                >
                  {guard}
                </p>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {readiness.gates.map((gate) => (
            <MobileAppGateCard gate={gate} key={gate.id} />
          ))}
        </div>
      </div>
    </section>
  );
}

function MobileAppGateCard({ gate }: { gate: MobileAppReadinessGate }) {
  const Icon = gate.status === "ready" ? CheckCircle2 : TriangleAlert;

  return (
    <article className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 border-2 border-black bg-[#f5eedf] p-2 shadow-[3px_3px_0_#171411]">
      <span
        className={`grid h-9 w-9 place-items-center border-2 border-black ${statusClass(
          gate.status,
        )}`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <h3 className="neo-copy text-[10px] font-black uppercase text-[#171411]">{gate.label}</h3>
          <span
            className={`neo-copy border border-black px-1.5 py-0.5 text-[8px] font-black uppercase ${statusClass(
              gate.status,
            )}`}
          >
            {gate.status}
          </span>
        </div>
        <p className="neo-copy mt-1 text-[9px] font-black uppercase leading-relaxed text-[#5b403f]">
          {gate.detail}
        </p>
        <p className="neo-copy mt-2 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
          {gate.action}
        </p>
      </div>
    </article>
  );
}

function statusClass(status: MobileAppReadinessStatus) {
  if (status === "ready") return "bg-[#087d6d] text-white";
  if (status === "warning") return "bg-[#fff9ed] text-[#171411]";
  return "bg-[#b7102a] text-white";
}
