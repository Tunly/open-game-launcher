import {
  CheckCircle2,
  KeyRound,
  ServerCog,
  ShieldCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import type {
  RemoteCompanionCloudContractReadiness,
  RemoteCompanionCloudContractRow,
} from "../../lib/remote-companion-cloud-readiness";

interface RemoteHostedContractReadinessPanelProps {
  className?: string;
  readiness: RemoteCompanionCloudContractReadiness;
}

export function RemoteHostedContractReadinessPanel({
  className = "",
  readiness,
}: RemoteHostedContractReadinessPanelProps) {
  const toneLabel =
    readiness.tone === "ready" ? "Ready" : readiness.tone === "warning" ? "Limited" : "Local Only";
  const headline =
    readiness.blocker === null
      ? "Hosted contract is locally verified."
      : `${readiness.blocker.label} still needs verification.`;

  return (
    <section
      aria-label="Remote hosted contract readiness"
      className={`border-4 border-black bg-[#fff9ed] p-4 shadow-[5px_5px_0_#171411] ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="neo-copy inline-flex items-center gap-1 border-2 border-black bg-[#171411] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white">
            <ServerCog className="h-3 w-3" />
            Remote Companion Cloud
          </span>
          <h2 className="neo-title mt-2 text-2xl font-black uppercase leading-none text-[#171411]">
            Hosted Contract
          </h2>
          <p className="neo-copy mt-2 text-[10px] font-black uppercase leading-relaxed text-[#5b403f]">
            {headline}
          </p>
        </div>
        <span
          className={`neo-copy border-2 border-black px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] shadow-[2px_2px_0_#171411] ${getToneClass(readiness.tone)}`}
        >
          {toneLabel}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="h-3 flex-1 border-2 border-black bg-[#efe6d4]">
          <div
            className={`h-full ${getProgressClass(readiness.tone)}`}
            style={{ width: `${readiness.progress}%` }}
          />
        </div>
        <span className="neo-copy min-w-16 text-right text-[10px] font-black uppercase text-[#171411]">
          {readiness.progress}%
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {readiness.rows.map((row) => (
          <RemoteHostedContractRowCard key={row.id} row={row} />
        ))}
      </div>
    </section>
  );
}

function RemoteHostedContractRowCard({ row }: { row: RemoteCompanionCloudContractRow }) {
  const Icon = getRowIcon(row);

  return (
    <article className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 border-2 border-black bg-[#f5eedf] p-2 shadow-[3px_3px_0_#171411]">
      <span
        className={`grid h-9 w-9 place-items-center border-2 border-black ${getToneClass(row.status)}`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <h3 className="neo-copy text-[10px] font-black uppercase text-[#171411]">{row.label}</h3>
          <span
            className={`neo-copy border border-black px-1.5 py-0.5 text-[8px] font-black uppercase ${getToneClass(row.status)}`}
          >
            {row.status}
          </span>
        </div>
        <p className="neo-copy mt-1 text-[9px] font-black uppercase leading-relaxed text-[#5b403f]">
          {row.detail}
        </p>
      </div>
    </article>
  );
}

function getRowIcon(row: RemoteCompanionCloudContractRow): LucideIcon {
  if (row.id === "desktop-vault") return KeyRound;
  if (row.id === "schema-rls" || row.id === "opaque-jobs" || row.id === "store-ticket-jobs") {
    return ShieldCheck;
  }
  return row.status === "ready" ? CheckCircle2 : XCircle;
}

function getToneClass(tone: RemoteCompanionCloudContractRow["status"]) {
  if (tone === "ready") return "bg-[#087d6d] text-white";
  if (tone === "warning") return "bg-[#fff9ed] text-[#171411]";
  return "bg-[#b7102a] text-white";
}

function getProgressClass(tone: RemoteCompanionCloudContractRow["status"]) {
  if (tone === "ready") return "bg-[#087d6d]";
  if (tone === "warning") return "bg-[#8cf5e4]";
  return "bg-[#b7102a]";
}
