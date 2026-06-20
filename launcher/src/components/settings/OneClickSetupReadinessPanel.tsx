import { CheckCircle2, MonitorCheck, Rocket, TriangleAlert } from "lucide-react";

import type {
  OneClickSetupReadiness,
  OneClickSetupStatus,
  OneClickSetupStep,
} from "../../lib/one-click-setup-readiness";

export function OneClickSetupReadinessPanel({ readiness }: { readiness: OneClickSetupReadiness }) {
  const toneClass =
    readiness.blockedCount > 0
      ? "bg-[#b7102a] text-white"
      : readiness.warningCount > 0
        ? "bg-[#fff9ed] text-[#171411]"
        : "bg-[#087d6d] text-white";

  return (
    <section
      aria-label="One-click setup readiness"
      className="mb-6 border-4 border-black bg-[#f5eedf] p-4 shadow-[5px_5px_0_#171411]"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)] lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="neo-copy inline-flex items-center gap-1 border-2 border-black bg-[#171411] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white">
              <Rocket className="h-3 w-3" />
              One-Click Setup
            </span>
            <span
              className={`neo-copy border-2 border-black px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] shadow-[2px_2px_0_#171411] ${toneClass}`}
            >
              {readiness.blockedCount > 0
                ? "blocked"
                : readiness.warningCount > 0
                  ? "warnings"
                  : "ready"}
            </span>
          </div>

          <h2 className="neo-title mt-3 text-2xl font-black uppercase leading-none text-[#171411] md:text-3xl">
            New PC Setup Tape
          </h2>
          <p className="neo-copy mt-2 text-[11px] font-black uppercase leading-relaxed text-[#5b403f]">
            {readiness.summary}
          </p>

          <div className="mt-4 border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
            <p className="neo-copy text-[9px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
              Next Move
            </p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
              <p className="neo-copy max-w-xl text-[11px] font-black uppercase leading-relaxed text-[#171411]">
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

          <div className="mt-4 grid grid-cols-3 gap-2">
            <SetupStat label="Ready" value={String(readiness.readyCount)} />
            <SetupStat label="Warnings" value={String(readiness.warningCount)} />
            <SetupStat label="Blocked" value={String(readiness.blockedCount)} />
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {readiness.steps.map((step) => (
            <SetupStepCard key={step.id} step={step} />
          ))}
        </div>
      </div>
    </section>
  );
}

function SetupStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-black bg-[#fff9ed] p-2 shadow-[2px_2px_0_#171411]">
      <span className="neo-copy block text-[8px] font-black uppercase text-[#b7102a]">{label}</span>
      <strong className="neo-title mt-1 block text-2xl uppercase text-[#171411]">{value}</strong>
    </div>
  );
}

function SetupStepCard({ step }: { step: OneClickSetupStep }) {
  const StatusIcon = step.status === "ready" ? CheckCircle2 : TriangleAlert;
  const statusClass = statusBadgeClass(step.status);

  return (
    <article className="min-w-0 border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center border-2 border-black bg-[#efe6d4]">
            <MonitorCheck className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="neo-copy truncate text-[11px] font-black uppercase text-[#171411]">
              {step.label}
            </h3>
            <p className="neo-copy mt-1 text-[9px] font-black uppercase leading-snug text-[#5b403f]">
              {step.detail}
            </p>
          </div>
        </div>
        <span
          className={`neo-copy inline-flex shrink-0 items-center gap-1 border-2 border-black px-2 py-1 text-[8px] font-black uppercase shadow-[2px_2px_0_#171411] ${statusClass}`}
        >
          <StatusIcon className="h-3 w-3" />
          {step.status}
        </span>
      </div>
      <p className="neo-copy mt-3 border-2 border-black bg-[#efe6d4] p-2 text-[9px] font-black uppercase leading-relaxed text-[#5b403f]">
        {step.action}
      </p>
    </article>
  );
}

function statusBadgeClass(status: OneClickSetupStatus) {
  if (status === "ready") return "bg-[#087d6d] text-white";
  if (status === "warning") return "bg-[#fff9ed] text-[#171411]";
  return "bg-[#b7102a] text-white";
}
