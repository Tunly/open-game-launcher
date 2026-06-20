import { CalendarClock, FileWarning, ShieldCheck } from "lucide-react";

import type {
  HostedCronEvidenceJob,
  HostedCronEvidenceSummary,
  HostedCronEvidenceSummaryStatus,
} from "../../lib/hosted-cron-evidence-summary";

export function HostedCronEvidenceSummaryPanel({
  summary,
}: {
  summary: HostedCronEvidenceSummary;
}) {
  return (
    <section
      aria-label="Hosted cron evidence summary"
      className="neo-dots mb-6 border-4 border-black bg-[#fff9ed] p-4 shadow-[6px_6px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-black pb-3">
        <div className="min-w-0">
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.22em] text-[#b7102a]">
            Hosted Scheduler Gate
          </p>
          <h2 className="neo-title mt-1 flex items-center gap-2 text-3xl uppercase leading-none text-[#171411]">
            <CalendarClock aria-hidden="true" className="h-8 w-8 shrink-0" />
            Hosted Cron Evidence
          </h2>
          <p className="neo-copy mt-2 max-w-3xl text-xs font-bold uppercase leading-5 text-[#5f574d]">
            {summary.summary}
          </p>
        </div>
        <span
          className={`neo-copy border-2 border-black px-3 py-2 text-[10px] font-black uppercase shadow-[3px_3px_0_#171411] ${statusClass(
            summary.passCount === summary.totalCount ? "pass" : "blocked",
          )}`}
        >
          {summary.statusLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="border-2 border-black bg-[#efe3cf] p-3 shadow-[3px_3px_0_#171411]">
          <p className="neo-copy flex items-center gap-2 text-[10px] font-black uppercase text-[#5f574d]">
            <FileWarning aria-hidden="true" className="h-4 w-4" />
            Evidence Packet
          </p>
          <div className="mt-3 grid gap-2">
            <HostedCronStat label="Packet" value={summary.packetId} />
            <HostedCronStat label="Created" value={summary.createdAt} />
            <HostedCronStat label="Max Age" value={`${summary.maxAgeMinutes}m`} />
            <HostedCronStat label="Pass" value={`${summary.passCount}`} />
            <HostedCronStat label="Review" value={`${summary.reviewCount}`} />
            <HostedCronStat label="Blocked" value={`${summary.blockedCount}`} />
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-3">
          {summary.jobs.map((job) => (
            <HostedCronJobCard key={job.id} job={job} />
          ))}
        </div>

        <div className="border-2 border-black bg-[#171411] p-3 text-[#fff9ed] shadow-[3px_3px_0_#b7102a] lg:col-span-2">
          <p className="neo-copy flex items-center gap-2 text-[10px] font-black uppercase text-[#8cf5e4]">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            No-Write Guard
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {summary.blockedClaims.map((claim) => (
              <p
                className="neo-copy border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] font-black uppercase leading-5"
                key={claim}
              >
                {claim}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function HostedCronStat({ label, value }: { label: string; value: string }) {
  return (
    <article className="border-2 border-black bg-[#fff9ed] p-2 shadow-[2px_2px_0_#171411]">
      <p className="neo-copy text-[8px] font-black uppercase tracking-[0.14em] text-[#b7102a]">
        {label}
      </p>
      <p className="neo-copy mt-1 break-words text-[9px] font-black uppercase leading-4 text-[#171411]">
        {value}
      </p>
    </article>
  );
}

function HostedCronJobCard({ job }: { job: HostedCronEvidenceJob }) {
  return (
    <article
      className={`border-2 border-black p-3 shadow-[3px_3px_0_#171411] ${statusClass(job.status)}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy text-[9px] font-black uppercase tracking-[0.16em] text-[#5f574d]">
            {job.functionName}
          </p>
          <h3 className="neo-title mt-1 text-base uppercase leading-tight text-[#171411]">
            {job.label}
          </h3>
        </div>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase text-[#171411]">
          {job.status}
        </span>
      </div>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <HostedCronDatum label="Table" value={job.evidenceTable} />
        <HostedCronDatum label="Run" value={job.runId} />
        <HostedCronDatum label="Mode" value={job.mode} />
        <HostedCronDatum label="Observed" value={job.observedAt} />
      </dl>
      <p className="neo-copy mt-3 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
        {job.requirement}
      </p>
      <p className="neo-copy mt-2 break-words border-2 border-black bg-[#171411] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#fff9ed]">
        {job.evidence}
      </p>
    </article>
  );
}

function HostedCronDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-black bg-[#fff9ed] px-2 py-1">
      <dt className="neo-copy text-[8px] font-black uppercase text-[#b7102a]">{label}</dt>
      <dd className="neo-copy break-words text-[8px] font-black uppercase leading-4 text-[#171411]">
        {value}
      </dd>
    </div>
  );
}

function statusClass(status: HostedCronEvidenceSummaryStatus) {
  if (status === "pass") return "bg-[#8cf5e4] text-[#171411]";
  if (status === "blocked") return "bg-[#b7102a] text-white";
  return "bg-[#f5eedf] text-[#171411]";
}
