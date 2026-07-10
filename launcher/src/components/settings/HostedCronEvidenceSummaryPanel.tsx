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
          <p className="neo-copy text-[10px] font-black tracking-[0.22em] text-[#b7102a] uppercase">
            Hosted Scheduler Gate
          </p>
          <h2 className="neo-title mt-1 flex items-center gap-2 text-3xl leading-none text-[#171411] uppercase">
            <CalendarClock aria-hidden="true" className="h-8 w-8 shrink-0" />
            Hosted Cron Evidence
          </h2>
          <p className="neo-copy mt-2 max-w-3xl text-xs leading-5 font-bold text-[#5f574d] uppercase">
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
          <p className="neo-copy flex items-center gap-2 text-[10px] font-black text-[#5f574d] uppercase">
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
          <p className="neo-copy flex items-center gap-2 text-[10px] font-black text-[#8cf5e4] uppercase">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            No-Write Guard
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {summary.blockedClaims.map((claim) => (
              <p
                className="neo-copy border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] leading-5 font-black uppercase"
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
      <p className="neo-copy text-[8px] font-black tracking-[0.14em] text-[#b7102a] uppercase">
        {label}
      </p>
      <p className="neo-copy mt-1 text-[9px] leading-4 font-black break-words text-[#171411] uppercase">
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
          <p className="neo-copy text-[9px] font-black tracking-[0.16em] text-[#5f574d] uppercase">
            {job.functionName}
          </p>
          <h3 className="neo-title mt-1 text-base leading-tight text-[#171411] uppercase">
            {job.label}
          </h3>
        </div>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black text-[#171411] uppercase">
          {job.status}
        </span>
      </div>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <HostedCronDatum label="Table" value={job.evidenceTable} />
        <HostedCronDatum label="Run" value={job.runId} />
        <HostedCronDatum label="Mode" value={job.mode} />
        <HostedCronDatum label="Observed" value={job.observedAt} />
      </dl>
      <p className="neo-copy mt-3 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] leading-4 font-black text-[#171411] uppercase">
        {job.requirement}
      </p>
      <p className="neo-copy mt-2 border-2 border-black bg-[#171411] px-2 py-1 text-[8px] leading-4 font-black break-words text-[#fff9ed] uppercase">
        {job.evidence}
      </p>
    </article>
  );
}

function HostedCronDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-black bg-[#fff9ed] px-2 py-1">
      <dt className="neo-copy text-[8px] font-black text-[#b7102a] uppercase">{label}</dt>
      <dd className="neo-copy text-[8px] leading-4 font-black break-words text-[#171411] uppercase">
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
