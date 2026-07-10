import { Database, Gamepad2, ListChecks, ShieldCheck } from "lucide-react";

import type {
  IgdbCrossPlayCandidate,
  IgdbCrossPlayImportIssueDecision,
  IgdbCrossPlayImportIssueReason,
  IgdbCrossPlayImportIssueRow,
  IgdbCrossPlayImportPreview,
  IgdbCrossPlayImportPreviewRow,
  IgdbCrossPlayImportSyncPlan,
  IgdbCrossPlayImportSkippedRow,
  IgdbCrossPlayReadinessPlan,
  IgdbCrossPlayStatus,
} from "../../../lib/igdb-cross-play-readiness";

export function IgdbCrossPlayReadinessPanel({ plan }: { plan: IgdbCrossPlayReadinessPlan }) {
  return (
    <section
      aria-label="IGDB cross-play readiness"
      className="neo-dots border-4 border-black bg-[#fbf4e7] shadow-[3px_3px_0_#171411]"
    >
      <div className="border-b-2 border-black bg-[#171411] px-3 py-2 text-[#fbf4e7]">
        <p className="neo-copy text-[9px] font-black tracking-[0.14em] text-[#8cf5e4] uppercase">
          Local Import Preflight
        </p>
        <h2 className="mt-1 flex items-center gap-2 text-[15px] leading-none font-black uppercase">
          <Database aria-hidden="true" className="h-4 w-4" />
          IGDB Cross-Play
        </h2>
      </div>

      <div className="space-y-3 p-3">
        <div className="border-2 border-black bg-[#efe3cf] p-3 shadow-[2px_2px_0_#171411]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="neo-copy text-[9px] font-black text-[#5b403f] uppercase">
                {plan.statusLabel}
              </p>
              <p className="neo-title mt-1 text-3xl leading-none text-[#171411]">
                {plan.stageableCount}/{plan.candidates.length}
              </p>
            </div>
            <span className="neo-copy shrink-0 border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[8px] font-black text-[#171411] uppercase shadow-[1px_1px_0_#171411]">
              {plan.progress}%
            </span>
          </div>
          <p className="neo-copy mt-2 text-[9px] leading-4 font-black text-[#5b403f] uppercase">
            {plan.summary}
          </p>
          <p className="neo-copy mt-2 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] leading-4 font-black text-[#171411] uppercase">
            Next: {plan.nextAction}
          </p>
        </div>

        <div className="grid gap-2">
          {plan.candidates.map((candidate) => (
            <IgdbCrossPlayCandidateRow candidate={candidate} key={candidate.id} />
          ))}
        </div>

        <IgdbImportPreviewLedger preview={plan.importPreview} />
        <IgdbSyncContract syncPlan={plan.syncPlan} />

        <div className="border-2 border-black bg-[#171411] p-3 text-[#fbf4e7] shadow-[2px_2px_0_#b7102a]">
          <p className="neo-copy flex items-center gap-2 text-[9px] font-black text-[#8cf5e4] uppercase">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            Import Guard
          </p>
          <p className="neo-copy mt-2 border-2 border-[#fbf4e7] bg-[#2a221b] px-2 py-1 text-[8px] leading-4 font-black uppercase">
            {plan.guardCopy}
          </p>
          <div className="mt-2 grid gap-1.5">
            {plan.guards.map((item) => (
              <p
                className="neo-copy border-2 border-[#fbf4e7] bg-[#2a221b] px-2 py-1 text-[8px] leading-4 font-black uppercase"
                key={item}
              >
                {item}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function IgdbSyncContract({ syncPlan }: { syncPlan: IgdbCrossPlayImportSyncPlan }) {
  return (
    <div className="border-2 border-black bg-[#efe3cf] p-3 shadow-[2px_2px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy flex items-center gap-2 text-[9px] font-black tracking-[0.12em] text-[#b7102a] uppercase">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            Sync Contract
          </p>
          <p className="neo-copy mt-2 text-[8px] leading-4 font-black text-[#5b403f] uppercase">
            Local planner only. Supabase writes are blocked and hosted sync is not claimed.
          </p>
        </div>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black text-[#171411] uppercase shadow-[1px_1px_0_#171411]">
          {syncPlan.mode.replace(/-/g, " ")}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <PreviewStat label="Upserts" value={syncPlan.gameCrossPlayUpserts.length} />
        <PreviewStat label="Merged IDs" value={syncPlan.issueSummary.externalIdMergeCount} />
        <PreviewStat label="Blockers" value={syncPlan.issueSummary.blockerCount} />
        <PreviewStat label="Skipped" value={syncPlan.issueSummary.skippedCount} />
        <PreviewStat label="Hosted Sync" value={syncPlan.writeClaims.hostedSync ? "yes" : "no"} />
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <PreviewLine
          label="Supabase write"
          value={syncPlan.writeClaims.supabaseWrites ? "claimed" : "blocked"}
        />
        <PreviewLine
          label="Hosted sync"
          value={syncPlan.writeClaims.hostedSync ? "claimed" : "not claimed"}
        />
      </div>
    </div>
  );
}

function IgdbImportPreviewLedger({ preview }: { preview: IgdbCrossPlayImportPreview }) {
  return (
    <div className="border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy flex items-center gap-2 text-[9px] font-black tracking-[0.12em] text-[#b7102a] uppercase">
            <ListChecks aria-hidden="true" className="h-4 w-4" />
            Staged Import Preview
          </p>
          <p className="neo-copy mt-2 text-[8px] leading-4 font-black text-[#5b403f] uppercase">
            No rows are written. This is a local review envelope for game_cross_play and
            games.external_ids only.
          </p>
        </div>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[8px] font-black text-[#171411] uppercase shadow-[1px_1px_0_#171411]">
          {preview.writeMode.replace("-", " ")}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <PreviewStat label="Rows" value={preview.gameCrossPlayRows.length} />
        <PreviewStat label="External IDs" value={preview.externalIdRows.length} />
        <PreviewStat label="Review Issues" value={preview.issueRows.length} />
        <PreviewStat label="Skipped" value={preview.skippedRows.length} />
        <PreviewStat label="Mode" value="Preview only" />
      </div>

      <div className="mt-2 grid gap-2">
        {preview.issueRows.map((row) => (
          <IgdbImportIssueRowCard
            key={`${row.targetTable}-${row.targetKey}-${row.incomingCandidateId}`}
            row={row}
          />
        ))}
        {preview.gameCrossPlayRows.map((row) => (
          <IgdbImportPreviewRowCard key={`${row.candidateId}-${row.externalIdSource}`} row={row} />
        ))}
        {Object.entries(preview.gameExternalIdsPatch).map(([source, value]) => (
          <article
            className="border-2 border-black bg-[#f5eedf] p-2 shadow-[1px_1px_0_#171411]"
            key={`${source}-${value}`}
          >
            <p className="neo-copy text-[8px] font-black tracking-[0.1em] text-[#171411] uppercase">
              games.external_ids // {source}:{value}
            </p>
          </article>
        ))}
        {preview.skippedRows.map((row) => (
          <IgdbImportSkippedRowCard key={row.candidateId} row={row} />
        ))}
      </div>
    </div>
  );
}

function PreviewStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="border-2 border-black bg-[#f5eedf] px-2 py-1 shadow-[1px_1px_0_#171411]">
      <span className="neo-copy block text-[7px] font-black text-[#b7102a] uppercase">{label}</span>
      <strong className="neo-copy block text-[10px] leading-4 font-black text-[#171411] uppercase">
        {value}
      </strong>
    </div>
  );
}

function IgdbImportIssueRowCard({ row }: { row: IgdbCrossPlayImportIssueRow }) {
  return (
    <article className="border-2 border-black bg-[#efe3cf] p-2 shadow-[1px_1px_0_#b7102a]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="neo-copy text-[8px] font-black tracking-[0.1em] text-[#171411] uppercase">
          {row.targetTable} issue // {row.targetKey}
        </p>
        <span
          className={`neo-copy border-2 border-black px-1.5 py-0.5 text-[8px] font-black uppercase ${issueBadgeClass(
            row.reason,
          )}`}
        >
          {issueBadgeLabel(row.reason)}
        </span>
      </div>
      <div className="mt-2 grid gap-1 sm:grid-cols-2">
        <PreviewLine label="Target" value={row.targetTable} />
        <PreviewLine label="Key" value={row.targetKey} />
        <PreviewLine label="Kept" value={row.keptValue} />
        <PreviewLine label="Incoming" value={row.incomingValue} />
        <PreviewLine label="Candidates" value={row.labels.join(" + ")} />
        <PreviewLine label="Decision" value={formatIssueDecision(row.decision)} />
      </div>
    </article>
  );
}

function IgdbImportPreviewRowCard({ row }: { row: IgdbCrossPlayImportPreviewRow }) {
  return (
    <article className="border-2 border-black bg-[#f5eedf] p-2 shadow-[1px_1px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="neo-copy text-[8px] font-black tracking-[0.1em] text-[#171411] uppercase">
          game_cross_play // {row.mappedPlatform} // unverified
        </p>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-1.5 py-0.5 text-[8px] font-black text-[#171411] uppercase">
          Would Insert
        </span>
      </div>
      <div className="mt-2 grid gap-1 sm:grid-cols-2">
        <PreviewLine label="Platform" value={row.mappedPlatform} />
        <PreviewLine label="External ID" value={`${row.externalIdSource}:${row.externalIdValue}`} />
        <PreviewLine label="Targets" value={row.targetTables.join(" + ")} />
        <PreviewLine label="Verified" value={row.isVerified ? "true" : "false"} />
      </div>
    </article>
  );
}

function IgdbImportSkippedRowCard({ row }: { row: IgdbCrossPlayImportSkippedRow }) {
  return (
    <article className="border-2 border-black bg-[#efe3cf] p-2 shadow-[1px_1px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="neo-copy text-[8px] font-black tracking-[0.1em] text-[#171411] uppercase">
          {row.label} // {row.reason}
        </p>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-1.5 py-0.5 text-[8px] font-black text-[#171411] uppercase">
          {row.status}
        </span>
      </div>
      <p className="neo-copy mt-2 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] leading-4 font-black text-[#171411] uppercase">
        {row.reason}
      </p>
    </article>
  );
}

function PreviewLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] leading-4 font-black [overflow-wrap:anywhere] text-[#171411] uppercase">
      {label}: {value}
    </p>
  );
}

function issueBadgeClass(reason: IgdbCrossPlayImportIssueReason) {
  if (reason === "conflicting_external_id") return "bg-[#b7102a] text-white";
  return "bg-[#8cf5e4] text-[#171411]";
}

function issueBadgeLabel(reason: IgdbCrossPlayImportIssueReason) {
  if (reason === "conflicting_external_id") return "Needs Review";
  return "Deduped";
}

function formatIssueDecision(decision: IgdbCrossPlayImportIssueDecision) {
  if (decision === "stage_external_id_only") return "stage external id only";
  if (decision === "dedupe_incoming") return "dedupe incoming";
  return "skip incoming";
}

function IgdbCrossPlayCandidateRow({ candidate }: { candidate: IgdbCrossPlayCandidate }) {
  return (
    <article
      className={`border-2 border-black p-2 shadow-[2px_2px_0_#171411] ${candidateClass(
        candidate.status,
      )}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy text-[8px] font-black tracking-[0.1em] text-[#5b403f] uppercase">
            {candidate.igdbPlatformName} // {candidate.status}
          </p>
          <h3 className="mt-1 flex items-center gap-1.5 text-sm font-black text-[#171411] uppercase">
            <Gamepad2 aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="truncate">{candidate.label}</span>
          </h3>
        </div>
        <span className="neo-copy shrink-0 border-2 border-black bg-[#fff9ed] px-1.5 py-0.5 text-[8px] font-black text-[#171411] uppercase">
          {candidate.mappedPlatform ?? "unmapped"}
        </span>
      </div>
      <p className="neo-copy mt-2 text-[8px] leading-4 font-black text-[#5b403f] uppercase">
        {candidate.detail}
      </p>
      <p className="neo-copy mt-2 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] leading-4 font-black text-[#171411] uppercase">
        {candidate.action}
      </p>
    </article>
  );
}

function candidateClass(status: IgdbCrossPlayStatus) {
  if (status === "ready") return "bg-[#8cf5e4]";
  if (status === "warning") return "bg-[#fff9ed]";
  return "bg-[#efe3cf]";
}
