import { Monitor, ShieldCheck, TimerReset, Zap } from "lucide-react";

import type {
  OverlayE2EReadiness,
  OverlayE2EReadinessGate,
  OverlayE2EReadinessStatus,
} from "../../lib/overlay-e2e-readiness";

export function OverlayE2EReadinessPanel({ readiness }: { readiness: OverlayE2EReadiness }) {
  const tone =
    readiness.blockedCount > 0 ? "blocked" : readiness.warningCount > 0 ? "warning" : "ready";

  return (
    <section
      aria-label="Overlay E2E readiness"
      className="neo-dots border-4 border-black bg-[#f5eedf] shadow-[5px_5px_0_#171411]"
    >
      <div className="border-b-4 border-black bg-[#171411] p-5 text-white">
        <p className="neo-copy text-[10px] font-bold uppercase tracking-[0.16em] text-[#8cf5e4]">
          External Overlay Proof
        </p>
        <h2 className="neo-title mt-1 flex items-center gap-2 text-3xl leading-none">
          <Monitor aria-hidden="true" className="h-8 w-8" />
          Overlay E2E Readiness
        </h2>
      </div>

      <div className="space-y-4 p-5">
        <div className="border-2 border-black bg-[#efe6d4] p-3 shadow-[3px_3px_0_#171411]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="neo-copy text-[10px] font-black uppercase text-[#55504a]">
                {readiness.statusLabel}
              </p>
              <p className="neo-title mt-1 text-5xl uppercase leading-none text-[#171411]">
                {readiness.readyCount}/{readiness.gates.length}
              </p>
            </div>
            <span
              className={`neo-copy border-2 border-black px-3 py-2 text-[10px] font-black uppercase shadow-[2px_2px_0_#171411] ${statusClass(
                tone,
              )}`}
            >
              {readiness.progress}%
            </span>
          </div>
          <p className="neo-copy mt-3 text-[10px] font-black uppercase leading-5 text-[#55504a]">
            {readiness.summary}
          </p>
          <p className="neo-copy mt-2 border-2 border-black bg-[#fff9ed] px-3 py-2 text-[9px] font-black uppercase leading-4 text-[#171411]">
            Next: {readiness.nextAction}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {readiness.gates.map((gate) => (
            <OverlayE2EGateCard gate={gate} key={gate.id} />
          ))}
        </div>

        {readiness.sessionFlushProof && (
          <div className="border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="neo-copy flex items-center gap-2 text-[10px] font-black uppercase text-[#55504a]">
                  <TimerReset aria-hidden="true" className="h-4 w-4" />
                  Local Flush Proof
                </p>
                <h3 className="neo-title mt-1 text-2xl uppercase leading-none text-[#171411]">
                  {readiness.sessionFlushProof.bufferLimit} sample cap
                </h3>
              </div>
              <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-3 py-2 text-[9px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411]">
                warning
              </span>
            </div>
            <p className="neo-copy mt-2 border-2 border-black bg-[#efe6d4] px-3 py-2 text-[9px] font-black uppercase leading-4 text-[#171411]">
              {readiness.sessionFlushProof.flushEventName}
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {readiness.sessionFlushProof.triggers.map((trigger) => (
                <p
                  className="neo-copy border-2 border-black bg-[#f5eedf] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]"
                  key={trigger}
                >
                  {trigger}
                </p>
              ))}
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {readiness.sessionFlushProof.guards.map((guard) => (
                <p
                  className="neo-copy border-2 border-black bg-[#171411] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#fbf4e7]"
                  key={guard}
                >
                  {guard}
                </p>
              ))}
            </div>
          </div>
        )}

        <div className="border-2 border-black bg-[#171411] p-3 text-[#fbf4e7] shadow-[3px_3px_0_#b7102a]">
          <p className="neo-copy flex items-center gap-2 text-[10px] font-black uppercase text-[#8cf5e4]">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            Overlay Guard
          </p>
          <p className="neo-copy mt-2 border-2 border-[#fbf4e7] bg-[#2a221b] px-3 py-2 text-[9px] font-black uppercase leading-4">
            {readiness.guardCopy}
          </p>
          <div className="mt-2 grid gap-1.5 md:grid-cols-3">
            {readiness.guards.map((guard) => (
              <p
                className="neo-copy border-2 border-[#fbf4e7] bg-[#2a221b] px-2 py-1 text-[8px] font-black uppercase leading-4"
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

function OverlayE2EGateCard({ gate }: { gate: OverlayE2EReadinessGate }) {
  return (
    <article
      className={`min-h-[178px] border-2 border-black p-3 shadow-[3px_3px_0_#171411] ${statusClass(
        gate.status,
      )}`}
    >
      <p className="neo-copy text-[8px] font-black uppercase tracking-[0.12em] text-[#55504a]">
        Overlay Gate
      </p>
      <h3 className="mt-1 flex items-center gap-1.5 text-sm font-black uppercase leading-tight text-[#171411]">
        <Zap aria-hidden="true" className="h-4 w-4 shrink-0" />
        {gate.label}
      </h3>
      <span className="neo-copy mt-2 inline-block border-2 border-black bg-[#fff9ed] px-1.5 py-0.5 text-[8px] font-black uppercase text-[#171411]">
        {gate.status}
      </span>
      <p className="neo-copy mt-2 text-[8px] font-black uppercase leading-4 text-[#55504a]">
        {gate.detail}
      </p>
      <p className="neo-copy mt-2 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
        {gate.action}
      </p>
    </article>
  );
}

function statusClass(status: OverlayE2EReadinessStatus) {
  if (status === "ready") return "bg-[#8cf5e4] text-[#171411]";
  if (status === "warning") return "bg-[#fff9ed] text-[#171411]";
  return "bg-[#efe6d4] text-[#171411]";
}
