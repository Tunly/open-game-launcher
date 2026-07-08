import {
  ArrowRightLeft,
  ClipboardCheck,
  Cloud,
  Database,
  FileCheck2,
  FileSearch,
  ListChecks,
  Map as MapIcon,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

import type {
  CrossStoreSaveAutomaticPathMapApplyProof,
  CrossStoreSaveProviderCatalogProof,
  CrossStoreSaveProviderCloudContractProof,
  CrossStoreSaveProviderPathIdMappingProof,
  CrossStoreSaveMigrationSessionRehearsalProof,
  CrossStoreSavePathMappingProof,
  CrossStoreSavePostCopyVerificationProof,
  CrossStoreSaveSyncAudit,
  CrossStoreSaveSyncLane,
  CrossStoreSaveNativeApplyProof,
  CrossStoreSaveSyncPlan,
  CrossStoreSaveSyncStatus,
} from "../../../lib/cross-store-save-sync-planner";

export function CrossStoreSaveSyncPlanner({ plan }: { plan: CrossStoreSaveSyncPlan }) {
  return (
    <section
      aria-label="Cross-store save sync planner"
      className="neo-dots border-4 border-black bg-[#fbf4e7] shadow-[3px_3px_0_#171411]"
    >
      <div className="border-b-2 border-black bg-[#171411] px-3 py-2 text-[#fbf4e7]">
        <p className="neo-copy text-[9px] font-black uppercase tracking-[0.14em] text-[#8cf5e4]">
          Local Save Review
        </p>
        <h2 className="mt-1 flex items-center gap-2 text-[15px] font-black uppercase leading-none">
          <ArrowRightLeft aria-hidden="true" className="h-4 w-4" />
          Cross-Store Saves
        </h2>
      </div>

      <div className="space-y-3 p-3">
        <div className="border-2 border-black bg-[#efe3cf] p-3 shadow-[2px_2px_0_#171411]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="neo-copy text-[9px] font-black uppercase text-[#5b403f]">
                {plan.title}
              </p>
              <p className="neo-copy mt-2 text-[9px] font-black uppercase leading-4 text-[#5b403f]">
                {plan.summary}
              </p>
            </div>
            <span
              className={`neo-copy shrink-0 border-2 border-black px-2 py-1 text-[8px] font-black uppercase shadow-[1px_1px_0_#171411] ${statusBadgeClass(
                plan.status,
              )}`}
            >
              {plan.label}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-1 text-[8px] font-black uppercase">
            <div className="border-2 border-black bg-[#fff9ed] px-1.5 py-1">
              <dt className="text-[#655f58]">Variants</dt>
              <dd className="text-[#171411]">{plan.variantCount}</dd>
            </div>
            <div className="border-2 border-black bg-[#fff9ed] px-1.5 py-1">
              <dt className="text-[#655f58]">Saves</dt>
              <dd className="text-[#171411]">{plan.trackedSaveFileCount}</dd>
            </div>
            <div className="border-2 border-black bg-[#fff9ed] px-1.5 py-1">
              <dt className="text-[#655f58]">Review</dt>
              <dd className="text-[#087d6d]">{plan.readyLaneCount}</dd>
            </div>
          </dl>
        </div>

        <div className="grid gap-2">
          {plan.lanes.slice(0, 2).map((lane) => (
            <SaveLaneRow key={lane.id} lane={lane} />
          ))}
          {plan.lanes.length > 2 ? (
            <p className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#5b403f] shadow-[2px_2px_0_#171411]">
              {plan.lanes.length - 2} more local lane{plan.lanes.length - 2 === 1 ? "" : "s"} stay
              in the review plan.
            </p>
          ) : null}
          {plan.lanes.length === 0 ? (
            <p className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-2 text-[9px] font-black uppercase leading-4 text-[#5b403f] shadow-[2px_2px_0_#171411]">
              No source/target save lane can be planned from the selected local metadata.
            </p>
          ) : null}
        </div>

        {plan.providerCatalogProof ? (
          <ProviderCatalogProofPanel proof={plan.providerCatalogProof} />
        ) : null}

        {plan.providerPathIdMappingProof ? (
          <ProviderPathIdMappingProofPanel proof={plan.providerPathIdMappingProof} />
        ) : null}

        {plan.providerCloudContractProof ? (
          <ProviderCloudContractPanel proof={plan.providerCloudContractProof} />
        ) : null}

        {plan.audit ? <DryRunAuditPanel audit={plan.audit} /> : null}

        {plan.pathMappingProof ? <PathMappingProofPanel proof={plan.pathMappingProof} /> : null}

        {plan.automaticPathMapApplyProof ? (
          <AutomaticPathMapApplyPanel proof={plan.automaticPathMapApplyProof} />
        ) : null}

        {plan.nativeApplyProof ? <NativeApplyProofPanel proof={plan.nativeApplyProof} /> : null}

        {plan.postCopyVerificationProof ? (
          <PostCopyVerificationPanel proof={plan.postCopyVerificationProof} />
        ) : null}

        {plan.migrationSessionRehearsalProof ? (
          <MigrationSessionRehearsalPanel proof={plan.migrationSessionRehearsalProof} />
        ) : null}

        <div className="border-2 border-black bg-[#171411] p-3 text-[#fbf4e7] shadow-[2px_2px_0_#b7102a]">
          <p className="neo-copy flex items-center gap-2 text-[9px] font-black uppercase text-[#8cf5e4]">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            No-Write Guard
          </p>
          <div className="mt-2 grid gap-1.5">
            {plan.guards.map((item) => (
              <p
                className="neo-copy border-2 border-[#fbf4e7] bg-[#2a221b] px-2 py-1 text-[8px] font-black uppercase leading-4"
                key={item}
              >
                {item}
              </p>
            ))}
          </div>
        </div>

        {[...plan.blockers, ...plan.warnings].length > 0 ? (
          <div className="border-2 border-black bg-[#f3e8d7] p-2 shadow-[2px_2px_0_#171411]">
            <p className="neo-copy flex items-center gap-2 text-[9px] font-black uppercase text-[#b7102a]">
              <Cloud aria-hidden="true" className="h-4 w-4" />
              Manual Review
            </p>
            <div className="mt-2 grid gap-1.5">
              {[...plan.blockers, ...plan.warnings].slice(0, 3).map((item) => (
                <p
                  className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]"
                  key={item}
                >
                  {item}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function MigrationSessionRehearsalPanel({
  proof,
}: {
  proof: CrossStoreSaveMigrationSessionRehearsalProof;
}) {
  return (
    <div className="border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy flex items-center gap-2 text-[9px] font-black uppercase text-[#087d6d]">
            <ListChecks aria-hidden="true" className="h-4 w-4" />
            Migration Session Rehearsal
          </p>
          <p className="neo-copy mt-2 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
            {proof.summary} {proof.guard}
          </p>
        </div>
        <span className="neo-copy border-2 border-black bg-[#f7d04a] px-2 py-1 text-[8px] font-black uppercase text-[#171411] shadow-[1px_1px_0_#171411]">
          Rehearsal Only
        </span>
      </div>

      <dl className="mt-3 grid gap-1 text-[8px] font-black uppercase">
        <div className="border-2 border-black bg-[#fbf4e7] px-1.5 py-1">
          <dt className="text-[#655f58]">Lane</dt>
          <dd className="text-[#171411]">
            {proof.sourceLabel} -&gt; {proof.targetLabel}
          </dd>
        </div>
        <div className="border-2 border-black bg-[#fbf4e7] px-1.5 py-1">
          <dt className="text-[#655f58]">Local Evidence</dt>
          <dd className="text-[#087d6d]">{proof.localEvidenceCount}</dd>
        </div>
        <div className="border-2 border-black bg-[#fbf4e7] px-1.5 py-1">
          <dt className="text-[#655f58]">External Blockers</dt>
          <dd className="text-[#b7102a]">{proof.blockedStepCount}</dd>
        </div>
      </dl>

      <div className="mt-3 grid gap-2">
        {proof.steps.map((step) => (
          <article
            className="border-2 border-black bg-[#fbf4e7] p-2 shadow-[1px_1px_0_#171411]"
            key={step.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="neo-copy text-[8px] font-black uppercase tracking-[0.1em] text-[#5b403f]">
                {step.label}
              </p>
              <span
                className={`neo-copy border-2 border-black px-1.5 py-0.5 text-[8px] font-black uppercase text-[#171411] ${
                  step.status === "local_evidence" ? "bg-[#8cf5e4]" : "bg-[#f7d04a]"
                }`}
              >
                {step.status === "local_evidence" ? "Local Evidence" : "External Blocked"}
              </span>
            </div>
            <p className="neo-copy mt-2 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
              {step.evidence}
            </p>
            <p className="neo-copy mt-2 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
              {step.action}
            </p>
          </article>
        ))}
      </div>

      <div className="mt-3 border-2 border-black bg-[#171411] p-2 text-[#fbf4e7] shadow-[2px_2px_0_#b7102a]">
        <p className="neo-copy text-[8px] font-black uppercase text-[#8cf5e4]">
          Still Blocked After Rehearsal Packet
        </p>
        <div className="mt-2 grid gap-1.5">
          {proof.blockedAfterProof.map((item) => (
            <p
              className="neo-copy border-2 border-[#fbf4e7] bg-[#2a221b] px-2 py-1 text-[8px] font-black uppercase leading-4"
              key={item}
            >
              {item}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProviderCloudContractPanel({
  proof,
}: {
  proof: CrossStoreSaveProviderCloudContractProof;
}) {
  return (
    <div className="border-2 border-black bg-[#8cf5e4] p-3 shadow-[2px_2px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy flex items-center gap-2 text-[9px] font-black uppercase text-[#171411]">
            <Cloud aria-hidden="true" className="h-4 w-4" />
            Provider Cloud Contract
          </p>
          <p className="neo-copy mt-2 text-[8px] font-black uppercase leading-4 text-[#17413b]">
            {proof.entries.length} provider variant{proof.entries.length === 1 ? "" : "s"} need{" "}
            {proof.requiredContractCount} import/export contract
            {proof.requiredContractCount === 1 ? "" : "s"} for {proof.title}. {proof.guard}
          </p>
        </div>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase text-[#171411] shadow-[1px_1px_0_#171411]">
          Transfer Blocked
        </span>
      </div>

      <dl className="mt-3 grid gap-1 text-[8px] font-black uppercase">
        <div className="border-2 border-black bg-[#fbf4e7] px-1.5 py-1">
          <dt className="text-[#655f58]">Providers</dt>
          <dd className="text-[#171411]">{proof.entries.length}</dd>
        </div>
        <div className="border-2 border-black bg-[#fbf4e7] px-1.5 py-1">
          <dt className="text-[#655f58]">Contracts</dt>
          <dd className="text-[#b7102a]">{proof.requiredContractCount}</dd>
        </div>
        <div className="border-2 border-black bg-[#fbf4e7] px-1.5 py-1">
          <dt className="text-[#655f58]">Status</dt>
          <dd className="text-[#171411]">Provider approval required</dd>
        </div>
      </dl>

      <div className="mt-3 grid gap-2">
        {proof.entries.slice(0, 3).map((entry) => (
          <article
            className="border-2 border-black bg-[#fff9ed] p-2 shadow-[1px_1px_0_#171411]"
            key={entry.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="neo-copy text-[8px] font-black uppercase tracking-[0.1em] text-[#5b403f]">
                {entry.provider} // {entry.catalogKey}
              </p>
              <span className="neo-copy border-2 border-black bg-[#f7d04a] px-1.5 py-0.5 text-[8px] font-black uppercase text-[#171411]">
                Contract Required
              </span>
            </div>
            <p className="neo-copy mt-2 border-2 border-black bg-[#fbf4e7] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
              Scope: {entry.accountScope}
            </p>
            <div className="mt-2 grid gap-1">
              <p className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
                Export: {entry.exportContract}
              </p>
              <p className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
                Import: {entry.importContract}
              </p>
              {entry.blockers.slice(0, 2).map((blocker) => (
                <p
                  className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]"
                  key={blocker}
                >
                  {blocker}
                </p>
              ))}
            </div>
          </article>
        ))}
      </div>

      <div className="mt-3 border-2 border-black bg-[#171411] p-2 text-[#fbf4e7] shadow-[2px_2px_0_#b7102a]">
        <p className="neo-copy text-[8px] font-black uppercase text-[#8cf5e4]">
          Still Blocked After Contract Packet
        </p>
        <div className="mt-2 grid gap-1.5">
          {proof.blockedAfterProof.slice(0, 3).map((item) => (
            <p
              className="neo-copy border-2 border-[#fbf4e7] bg-[#2a221b] px-2 py-1 text-[8px] font-black uppercase leading-4"
              key={item}
            >
              {item}
            </p>
          ))}
          {proof.blockedAfterProof.length > 3 ? (
            <p className="neo-copy border-2 border-[#fbf4e7] bg-[#2a221b] px-2 py-1 text-[8px] font-black uppercase leading-4">
              {proof.blockedAfterProof.length - 3} more provider/live gate
              {proof.blockedAfterProof.length - 3 === 1 ? "" : "s"} remain.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ProviderCatalogProofPanel({ proof }: { proof: CrossStoreSaveProviderCatalogProof }) {
  return (
    <div className="border-2 border-black bg-[#f7d04a] p-3 shadow-[2px_2px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy flex items-center gap-2 text-[9px] font-black uppercase text-[#171411]">
            <Database aria-hidden="true" className="h-4 w-4" />
            Provider Catalog
          </p>
          <p className="neo-copy mt-2 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
            {proof.coveredVariantCount}/{proof.entries.length} variants have local catalog metadata
            for {proof.title}. {proof.guard}
          </p>
        </div>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase text-[#171411] shadow-[1px_1px_0_#171411]">
          Local IDs
        </span>
      </div>

      <dl className="mt-3 grid gap-1 text-[8px] font-black uppercase">
        <div className="border-2 border-black bg-[#fbf4e7] px-1.5 py-1">
          <dt className="text-[#655f58]">Variants</dt>
          <dd className="text-[#171411]">{proof.entries.length}</dd>
        </div>
        <div className="border-2 border-black bg-[#fbf4e7] px-1.5 py-1">
          <dt className="text-[#655f58]">Covered</dt>
          <dd className="text-[#087d6d]">{proof.coveredVariantCount}</dd>
        </div>
        <div className="border-2 border-black bg-[#fbf4e7] px-1.5 py-1">
          <dt className="text-[#655f58]">Manual</dt>
          <dd className="text-[#b7102a]">{proof.manualReviewCount}</dd>
        </div>
        <div className="border-2 border-black bg-[#fbf4e7] px-1.5 py-1">
          <dt className="text-[#655f58]">Pairings</dt>
          <dd className="text-[#171411]">{proof.pairings.length}</dd>
        </div>
      </dl>

      <div className="mt-3 grid gap-2">
        {proof.entries.slice(0, 3).map((entry) => (
          <article
            className="border-2 border-black bg-[#fff9ed] p-2 shadow-[1px_1px_0_#171411]"
            key={entry.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="neo-copy text-[8px] font-black uppercase tracking-[0.1em] text-[#5b403f]">
                {entry.provider} // {entry.catalogKey}
              </p>
              <span className="neo-copy border-2 border-black bg-[#fbf4e7] px-1.5 py-0.5 text-[8px] font-black uppercase text-[#171411]">
                {entry.status === "covered" ? "local covered" : "manual review"}
              </span>
            </div>
            <p className="neo-copy mt-2 break-all border-2 border-black bg-[#fbf4e7] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
              External: {entry.externalId ?? "manual review"} // Saves: {entry.saveFileCount}
            </p>
            <div className="mt-2 grid gap-1">
              {entry.checks.slice(0, 2).map((check) => (
                <p
                  className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]"
                  key={check}
                >
                  {check}
                </p>
              ))}
            </div>
          </article>
        ))}
      </div>

      <div className="mt-3 border-2 border-black bg-[#fff9ed] p-2 shadow-[1px_1px_0_#171411]">
        <p className="neo-copy text-[8px] font-black uppercase text-[#087d6d]">
          Local Pairing Matrix
        </p>
        <div className="mt-2 grid gap-1">
          {proof.pairings.slice(0, 2).map((pairing) => (
            <p
              className="neo-copy break-all border-2 border-black bg-[#fbf4e7] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]"
              key={pairing.id}
            >
              {pairing.label} // {pairing.sourceCatalogKey} -&gt; {pairing.targetCatalogKey}
            </p>
          ))}
          {proof.pairings.length > 2 ? (
            <p className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
              {proof.pairings.length - 2} more local catalog pairing
              {proof.pairings.length - 2 === 1 ? "" : "s"} stay in review.
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 border-2 border-black bg-[#171411] p-2 text-[#fbf4e7] shadow-[2px_2px_0_#b7102a]">
        <p className="neo-copy text-[8px] font-black uppercase text-[#8cf5e4]">
          Still Blocked After Catalog Packet
        </p>
        <div className="mt-2 grid gap-1.5">
          {proof.blockedAfterProof.slice(0, 2).map((item) => (
            <p
              className="neo-copy border-2 border-[#fbf4e7] bg-[#2a221b] px-2 py-1 text-[8px] font-black uppercase leading-4"
              key={item}
            >
              {item}
            </p>
          ))}
          {proof.blockedAfterProof.length > 2 ? (
            <p className="neo-copy border-2 border-[#fbf4e7] bg-[#2a221b] px-2 py-1 text-[8px] font-black uppercase leading-4">
              {proof.blockedAfterProof.length - 2} more external catalog/migration gate
              {proof.blockedAfterProof.length - 2 === 1 ? "" : "s"} remain.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ProviderPathIdMappingProofPanel({
  proof,
}: {
  proof: CrossStoreSaveProviderPathIdMappingProof;
}) {
  return (
    <div className="border-2 border-black bg-[#8cf5e4] p-3 shadow-[2px_2px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy flex items-center gap-2 text-[9px] font-black uppercase text-[#171411]">
            <FileSearch aria-hidden="true" className="h-4 w-4" />
            Provider Path/ID Fixtures
          </p>
          <p className="neo-copy mt-2 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
            {proof.mappedVariantCount}/{proof.entries.length} variants have local provider ID,
            install path, save root, and save count evidence for {proof.title}. {proof.guard}
          </p>
        </div>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase text-[#171411] shadow-[1px_1px_0_#171411]">
          Fixture Review
        </span>
      </div>

      <dl className="mt-3 grid gap-1 text-[8px] font-black uppercase">
        <div className="border-2 border-black bg-[#fbf4e7] px-1.5 py-1">
          <dt className="text-[#655f58]">Variants</dt>
          <dd className="text-[#171411]">{proof.entries.length}</dd>
        </div>
        <div className="border-2 border-black bg-[#fbf4e7] px-1.5 py-1">
          <dt className="text-[#655f58]">Mapped</dt>
          <dd className="text-[#087d6d]">{proof.mappedVariantCount}</dd>
        </div>
        <div className="border-2 border-black bg-[#fbf4e7] px-1.5 py-1">
          <dt className="text-[#655f58]">Manual</dt>
          <dd className="text-[#b7102a]">{proof.manualReviewCount}</dd>
        </div>
      </dl>

      <div className="mt-3 grid gap-2">
        {proof.entries.slice(0, 3).map((entry) => (
          <article
            className="border-2 border-black bg-[#fff9ed] p-2 shadow-[1px_1px_0_#171411]"
            key={entry.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="neo-copy break-all text-[8px] font-black uppercase tracking-[0.1em] text-[#5b403f]">
                {entry.provider} // {entry.catalogKey}
              </p>
              <span className="neo-copy border-2 border-black bg-[#fbf4e7] px-1.5 py-0.5 text-[8px] font-black uppercase text-[#171411]">
                {entry.status === "mapped" ? "mapped" : "manual review"}
              </span>
            </div>
            <dl className="mt-2 grid gap-1 text-[8px] font-black uppercase">
              <div className="border-2 border-black bg-[#fbf4e7] px-2 py-1">
                <dt className="text-[#655f58]">External</dt>
                <dd className="break-all text-[#171411]">{entry.externalId ?? "manual review"}</dd>
              </div>
              <div className="border-2 border-black bg-[#fbf4e7] px-2 py-1">
                <dt className="text-[#655f58]">Install</dt>
                <dd className="break-all text-[#171411]">{entry.installPath ?? "manual review"}</dd>
              </div>
              <div className="border-2 border-black bg-[#fbf4e7] px-2 py-1">
                <dt className="text-[#655f58]">Save Root</dt>
                <dd className="break-all text-[#171411]">{entry.saveRoot ?? "manual review"}</dd>
              </div>
              <div className="border-2 border-black bg-[#fbf4e7] px-2 py-1">
                <dt className="text-[#655f58]">Root Shape</dt>
                <dd className="break-all text-[#171411]">
                  {entry.saveRootShape ?? "manual review"}
                </dd>
              </div>
              <div className="border-2 border-black bg-[#fbf4e7] px-2 py-1">
                <dt className="text-[#655f58]">Path Rules</dt>
                <dd className="text-[#171411]">{entry.relativePathRuleCount}</dd>
              </div>
              <div className="border-2 border-black bg-[#fbf4e7] px-2 py-1">
                <dt className="text-[#655f58]">Tracked Saves</dt>
                <dd className="text-[#171411]">{entry.saveFileCount}</dd>
              </div>
            </dl>
            {entry.blockers.length > 0 ? (
              <div className="mt-2 grid gap-1">
                {entry.blockers.slice(0, 2).map((blocker) => (
                  <p
                    className="neo-copy border-2 border-black bg-[#f7d04a] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]"
                    key={blocker}
                  >
                    {blocker}
                  </p>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>

      <div className="mt-3 border-2 border-black bg-[#171411] p-2 text-[#fbf4e7] shadow-[2px_2px_0_#b7102a]">
        <p className="neo-copy text-[8px] font-black uppercase text-[#8cf5e4]">
          Still Blocked After Fixture Packet
        </p>
        <div className="mt-2 grid gap-1.5">
          {proof.blockedAfterProof.slice(0, 3).map((item) => (
            <p
              className="neo-copy border-2 border-[#fbf4e7] bg-[#2a221b] px-2 py-1 text-[8px] font-black uppercase leading-4"
              key={item}
            >
              {item}
            </p>
          ))}
          {proof.blockedAfterProof.length > 3 ? (
            <p className="neo-copy border-2 border-[#fbf4e7] bg-[#2a221b] px-2 py-1 text-[8px] font-black uppercase leading-4">
              {proof.blockedAfterProof.length - 3} more provider/migration gate
              {proof.blockedAfterProof.length - 3 === 1 ? "" : "s"} remain.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PostCopyVerificationPanel({ proof }: { proof: CrossStoreSavePostCopyVerificationProof }) {
  return (
    <div className="border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy flex items-center gap-2 text-[9px] font-black uppercase text-[#087d6d]">
            <ClipboardCheck aria-hidden="true" className="h-4 w-4" />
            Post-Copy Verification
          </p>
          <p className="neo-copy mt-2 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
            {proof.summary}
          </p>
        </div>
        <span className="neo-copy border-2 border-black bg-[#f7d04a] px-2 py-1 text-[8px] font-black uppercase text-[#171411] shadow-[1px_1px_0_#171411]">
          Review Packet
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-1 text-[8px] font-black uppercase">
        <div className="border-2 border-black bg-[#fbf4e7] px-1.5 py-1">
          <dt className="text-[#655f58]">Targets</dt>
          <dd className="text-[#171411]">{proof.actionCount}</dd>
        </div>
        <div className="border-2 border-black bg-[#fbf4e7] px-1.5 py-1">
          <dt className="text-[#655f58]">Conflicts</dt>
          <dd className="text-[#b7102a]">{proof.conflictCount}</dd>
        </div>
        <div className="border-2 border-black bg-[#fbf4e7] px-1.5 py-1">
          <dt className="text-[#655f58]">Manifest</dt>
          <dd className="break-all text-[#171411]">{proof.expectedManifestFile}</dd>
        </div>
      </dl>

      <p className="neo-copy mt-3 border-2 border-black bg-[#171411] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#fbf4e7]">
        {proof.guard}
      </p>

      <div className="mt-3 grid gap-2">
        {proof.items.slice(0, 3).map((item) => (
          <article
            className="border-2 border-black bg-[#fbf4e7] p-2 shadow-[1px_1px_0_#171411]"
            key={item.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="neo-copy text-[8px] font-black uppercase tracking-[0.1em] text-[#5b403f]">
                {item.status === "overwrite_snapshot_review" ? "Snapshot Review" : "Hash Review"} //{" "}
                {item.label}
              </p>
              {item.conflictId ? (
                <span className="neo-copy border-2 border-black bg-[#f7d04a] px-1.5 py-0.5 text-[8px] font-black uppercase text-[#171411]">
                  {item.conflictId}
                </span>
              ) : null}
            </div>
            <p className="neo-copy mt-2 break-all border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
              {item.sourceRelativePath} -&gt; {item.targetRelativePath}
            </p>
            <p className="neo-copy mt-1 break-all text-[8px] font-black uppercase leading-4 text-[#5b403f]">
              Expected target: {item.expectedTargetPath}
            </p>
            <div className="mt-2 grid gap-1">
              {item.checks.slice(0, 3).map((check) => (
                <p
                  className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]"
                  key={check}
                >
                  {check}
                </p>
              ))}
            </div>
          </article>
        ))}
      </div>

      <div className="mt-3 border-2 border-black bg-[#171411] p-2 text-[#fbf4e7] shadow-[2px_2px_0_#b7102a]">
        <p className="neo-copy text-[8px] font-black uppercase text-[#8cf5e4]">
          Still Blocked After Verification Packet
        </p>
        <div className="mt-2 grid gap-1.5">
          {proof.blockedAfterProof.slice(0, 2).map((item) => (
            <p
              className="neo-copy border-2 border-[#fbf4e7] bg-[#2a221b] px-2 py-1 text-[8px] font-black uppercase leading-4"
              key={item}
            >
              {item}
            </p>
          ))}
          {proof.blockedAfterProof.length > 2 ? (
            <p className="neo-copy border-2 border-[#fbf4e7] bg-[#2a221b] px-2 py-1 text-[8px] font-black uppercase leading-4">
              {proof.blockedAfterProof.length - 2} more external gate
              {proof.blockedAfterProof.length - 2 === 1 ? "" : "s"} remain in readiness.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PathMappingProofPanel({ proof }: { proof: CrossStoreSavePathMappingProof }) {
  return (
    <div className="border-2 border-black bg-[#f7d04a] p-3 shadow-[2px_2px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy flex items-center gap-2 text-[9px] font-black uppercase text-[#171411]">
            <MapIcon aria-hidden="true" className="h-4 w-4" />
            Provider Path Map
          </p>
          <p className="neo-copy mt-2 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
            {proof.sourceProvider} -&gt; {proof.targetProvider} // {proof.guard}
          </p>
        </div>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase text-[#171411] shadow-[1px_1px_0_#171411]">
          Review Only
        </span>
      </div>

      <dl className="mt-3 grid gap-1 text-[8px] font-black uppercase">
        <div className="border-2 border-black bg-[#fbf4e7] px-1.5 py-1">
          <dt className="text-[#655f58]">Actions</dt>
          <dd className="text-[#171411]">{proof.actionCount}</dd>
        </div>
        <div className="border-2 border-black bg-[#fbf4e7] px-1.5 py-1">
          <dt className="text-[#655f58]">Source Root</dt>
          <dd className="break-all text-[#171411]">{proof.sourceRoot}</dd>
        </div>
        <div className="border-2 border-black bg-[#fbf4e7] px-1.5 py-1">
          <dt className="text-[#655f58]">Target Root</dt>
          <dd className="break-all text-[#171411]">{proof.targetRoot}</dd>
        </div>
      </dl>

      <div className="mt-3 grid gap-2">
        {proof.mappedActions.slice(0, 3).map((action) => (
          <article
            className="border-2 border-black bg-[#fff9ed] p-2 shadow-[1px_1px_0_#171411]"
            key={action.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="neo-copy text-[8px] font-black uppercase tracking-[0.1em] text-[#5b403f]">
                {action.status === "conflict_review" ? "Conflict Review" : "Mapped"} //{" "}
                {action.label}
              </p>
              {action.conflictId ? (
                <span className="neo-copy border-2 border-black bg-[#f7d04a] px-1.5 py-0.5 text-[8px] font-black uppercase text-[#171411]">
                  {action.conflictId}
                </span>
              ) : null}
            </div>
            <p className="neo-copy mt-2 break-all border-2 border-black bg-[#fbf4e7] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
              {action.sourceRelativePath} -&gt; {action.targetRelativePath}
            </p>
            <p className="neo-copy mt-1 break-all text-[8px] font-black uppercase leading-4 text-[#5b403f]">
              Target: {action.targetPath}
            </p>
            {action.mappingRuleId ? (
              <p className="neo-copy mt-1 break-all text-[8px] font-black uppercase leading-4 text-[#087d6d]">
                Rule: {action.mappingRuleId}
              </p>
            ) : null}
          </article>
        ))}
      </div>

      <p className="neo-copy mt-3 border-2 border-black bg-[#171411] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#fbf4e7]">
        {proof.nativeApplyHint}
      </p>
    </div>
  );
}

function AutomaticPathMapApplyPanel({
  proof,
}: {
  proof: CrossStoreSaveAutomaticPathMapApplyProof;
}) {
  return (
    <div className="border-2 border-black bg-[#8cf5e4] p-3 shadow-[2px_2px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy flex items-center gap-2 text-[9px] font-black uppercase text-[#171411]">
            <MapIcon aria-hidden="true" className="h-4 w-4" />
            Automatic Path-Map Apply
          </p>
          <p className="neo-copy mt-2 text-[8px] font-black uppercase leading-4 text-[#17413b]">
            {proof.summary} {proof.guard}
          </p>
        </div>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase text-[#171411] shadow-[1px_1px_0_#171411]">
          Consent Required
        </span>
      </div>

      <dl className="mt-3 grid gap-1 text-[8px] font-black uppercase">
        <div className="border-2 border-black bg-[#fbf4e7] px-1.5 py-1">
          <dt className="text-[#655f58]">Operation</dt>
          <dd className="break-all text-[#171411]">{proof.consentOperation}</dd>
        </div>
        <div className="border-2 border-black bg-[#fbf4e7] px-1.5 py-1">
          <dt className="text-[#655f58]">Accepted</dt>
          <dd className="text-[#b7102a]">{String(proof.nativeRequestTemplate.consent.accepted)}</dd>
        </div>
        <div className="border-2 border-black bg-[#fbf4e7] px-1.5 py-1">
          <dt className="text-[#655f58]">Actions</dt>
          <dd className="text-[#171411]">{proof.actionCount}</dd>
        </div>
        <div className="border-2 border-black bg-[#fbf4e7] px-1.5 py-1">
          <dt className="text-[#655f58]">Lane</dt>
          <dd className="text-[#171411]">
            {proof.sourceLabel} -&gt; {proof.targetLabel}
          </dd>
        </div>
      </dl>

      <p className="neo-copy mt-3 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
        {proof.writeBoundary}
      </p>

      <div className="mt-3 grid gap-2">
        {proof.actions.slice(0, 3).map((action) => (
          <article
            className="border-2 border-black bg-[#fbf4e7] p-2 shadow-[1px_1px_0_#171411]"
            key={action.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="neo-copy text-[8px] font-black uppercase tracking-[0.1em] text-[#5b403f]">
                {action.mode === "overwrite_review" ? "Overwrite Review" : "Copy"} //{" "}
                {action.sourceRelativePath}
              </p>
              <span className="neo-copy border-2 border-black bg-[#fff9ed] px-1.5 py-0.5 text-[8px] font-black uppercase text-[#171411]">
                {action.expectedSizeBytes ?? "hash-only"} bytes
              </span>
            </div>
            <p className="neo-copy mt-2 break-all border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
              {action.sourceRelativePath} -&gt; {action.targetRelativePath}
            </p>
            <p className="neo-copy mt-1 break-all text-[8px] font-black uppercase leading-4 text-[#5b403f]">
              Source: {action.sourcePath}
            </p>
            <p className="neo-copy mt-1 break-all text-[8px] font-black uppercase leading-4 text-[#5b403f]">
              Target: {action.targetPath}
            </p>
          </article>
        ))}
      </div>

      <div className="mt-3 border-2 border-black bg-[#171411] p-2 text-[#fbf4e7] shadow-[2px_2px_0_#b7102a]">
        <p className="neo-copy text-[8px] font-black uppercase text-[#8cf5e4]">
          Still Blocked After Request Template
        </p>
        <div className="mt-2 grid gap-1.5">
          {proof.blockedAfterProof.map((item) => (
            <p
              className="neo-copy border-2 border-[#fbf4e7] bg-[#2a221b] px-2 py-1 text-[8px] font-black uppercase leading-4"
              key={item}
            >
              {item}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

function NativeApplyProofPanel({ proof }: { proof: CrossStoreSaveNativeApplyProof }) {
  return (
    <div className="border-2 border-black bg-[#8cf5e4] p-3 shadow-[2px_2px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy flex items-center gap-2 text-[9px] font-black uppercase text-[#171411]">
            <FileCheck2 aria-hidden="true" className="h-4 w-4" />
            {proof.label}
          </p>
          <p className="neo-copy mt-2 text-[8px] font-black uppercase leading-4 text-[#17413b]">
            {proof.sourceLabel} -&gt; {proof.targetLabel} // {proof.detail}
          </p>
        </div>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase text-[#171411] shadow-[1px_1px_0_#171411]">
          Desktop Consent
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-1 text-[8px] font-black uppercase">
        <div className="border-2 border-black bg-[#fbf4e7] px-1.5 py-1">
          <dt className="text-[#655f58]">Actions</dt>
          <dd className="text-[#171411]">{proof.actionCount}</dd>
        </div>
        <div className="border-2 border-black bg-[#fbf4e7] px-1.5 py-1">
          <dt className="text-[#655f58]">Operation</dt>
          <dd className="break-all text-[#171411]">{proof.consentOperation}</dd>
        </div>
        <div className="border-2 border-black bg-[#fbf4e7] px-1.5 py-1">
          <dt className="text-[#655f58]">Manifest</dt>
          <dd className="break-all text-[#171411]">{proof.manifestFile}</dd>
        </div>
      </dl>

      <p className="neo-copy mt-3 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
        {proof.backupPolicy}
      </p>

      <div className="mt-3 border-2 border-black bg-[#fff9ed] p-2 shadow-[1px_1px_0_#171411]">
        <p className="neo-copy text-[8px] font-black uppercase text-[#087d6d]">
          Native Rollback Proof
        </p>
        <p className="neo-copy mt-2 break-all text-[8px] font-black uppercase leading-4 text-[#171411]">
          {proof.rollbackConsentOperation}
        </p>
        <p className="neo-copy mt-2 border-2 border-black bg-[#fbf4e7] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
          {proof.rollbackPolicy}
        </p>
      </div>

      <div className="mt-3 grid gap-1.5">
        {proof.expectedVerification.map((item) => (
          <p
            className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]"
            key={item}
          >
            {item}
          </p>
        ))}
      </div>

      <div className="mt-3 border-2 border-black bg-[#171411] p-2 text-[#fbf4e7] shadow-[2px_2px_0_#b7102a]">
        <p className="neo-copy text-[8px] font-black uppercase text-[#8cf5e4]">
          Still Blocked After Native Copy
        </p>
        <div className="mt-2 grid gap-1.5">
          {proof.blockedAfterProof.map((item) => (
            <p
              className="neo-copy border-2 border-[#fbf4e7] bg-[#2a221b] px-2 py-1 text-[8px] font-black uppercase leading-4"
              key={item}
            >
              {item}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

function DryRunAuditPanel({ audit }: { audit: CrossStoreSaveSyncAudit }) {
  return (
    <div className="border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy flex items-center gap-2 text-[9px] font-black uppercase text-[#087d6d]">
            <FileSearch aria-hidden="true" className="h-4 w-4" />
            Dry-Run Audit Packet
          </p>
          <p className="neo-copy mt-2 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
            {audit.sourceLabel} -&gt; {audit.targetLabel} // {audit.guard}
          </p>
        </div>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[8px] font-black uppercase text-[#171411] shadow-[1px_1px_0_#171411]">
          No copy performed
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-1 text-[8px] font-black uppercase">
        <div className="border-2 border-black bg-[#fbf4e7] px-1.5 py-1">
          <dt className="text-[#655f58]">Actions</dt>
          <dd className="text-[#171411]">{audit.fileActionCount}</dd>
        </div>
        <div className="border-2 border-black bg-[#fbf4e7] px-1.5 py-1">
          <dt className="text-[#655f58]">Conflicts</dt>
          <dd className="text-[#b7102a]">{audit.conflictCount}</dd>
        </div>
        <div className="border-2 border-black bg-[#fbf4e7] px-1.5 py-1">
          <dt className="text-[#655f58]">Mutated</dt>
          <dd className="text-[#087d6d]">{audit.noCopyPerformed ? "No" : "Review"}</dd>
        </div>
      </dl>

      <div className="mt-3 grid gap-2">
        {audit.plannedFileActions.slice(0, 2).map((action) => (
          <article
            className="border-2 border-black bg-[#fbf4e7] p-2 shadow-[1px_1px_0_#171411]"
            key={`${action.sourcePath}-${action.targetPathHint}`}
          >
            <p className="neo-copy text-[8px] font-black uppercase tracking-[0.1em] text-[#5b403f]">
              {action.action === "review_overwrite" ? "Conflict review" : "Copy intent"} //{" "}
              {formatBytes(action.sizeBytes)}
            </p>
            <p className="neo-copy mt-1 break-all text-[8px] font-black uppercase leading-4 text-[#171411]">
              {action.label}: {action.sourcePath}
            </p>
            <p className="neo-copy mt-1 break-all border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
              Target hint: {action.targetPathHint}
            </p>
            {action.conflictId ? (
              <p className="neo-copy mt-1 border-2 border-black bg-[#f7d04a] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
                Conflict ID: {action.conflictId}
              </p>
            ) : null}
          </article>
        ))}
      </div>

      <div className="mt-3 border-2 border-black bg-[#171411] p-2 text-[#fbf4e7]">
        <p className="neo-copy flex items-center gap-2 text-[8px] font-black uppercase text-[#8cf5e4]">
          <RotateCcw aria-hidden="true" className="h-4 w-4" />
          Rollback Manifest Preview
        </p>
        <p className="neo-copy mt-2 break-all text-[8px] font-black uppercase leading-4">
          {audit.rollbackPreview.manifestId} // {audit.rollbackPreview.snapshotLabel} //{" "}
          {formatBytes(audit.rollbackPreview.totalSizeBytes)}
        </p>
        <p className="neo-copy mt-2 border-2 border-[#fbf4e7] bg-[#2a221b] px-2 py-1 text-[8px] font-black uppercase leading-4">
          {audit.rollbackPreview.restoreStrategy}
        </p>
      </div>

      <div className="mt-3 grid gap-1.5">
        {audit.skippedActions.slice(0, 3).map((item) => (
          <p
            className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]"
            key={item.id}
          >
            Skipped {item.label}: {item.reason}
          </p>
        ))}
      </div>
    </div>
  );
}

function SaveLaneRow({ lane }: { lane: CrossStoreSaveSyncLane }) {
  const reviewNote = [...lane.blockers, ...lane.warnings].find(
    (item) =>
      !item.startsWith("Local planner only") && !item.startsWith("Provider-specific save layout"),
  );

  return (
    <article
      className={`border-2 border-black p-2 shadow-[2px_2px_0_#171411] ${laneStatusClass(
        lane.status,
      )}`}
    >
      <div className="grid gap-2">
        <div className="min-w-0">
          <p className="neo-copy text-[8px] font-black uppercase tracking-[0.1em] text-[#5b403f]">
            {laneStatusLabel(lane.status)} // {formatBytes(lane.totalSaveSizeBytes)}
          </p>
          <h3 className="mt-1 truncate text-sm font-black uppercase text-[#171411]">
            {lane.sourceLabel} -&gt; {lane.targetLabel}
          </h3>
        </div>
        <span className="neo-copy w-fit border-2 border-black bg-[#fff9ed] px-1.5 py-0.5 text-[8px] font-black uppercase text-[#171411]">
          {lane.saveFileCount} files
        </span>
      </div>
      <p className="neo-copy mt-2 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
        {lane.summary}
      </p>
      <p className="neo-copy mt-2 break-all border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
        {lane.sourcePathPreview ?? lane.targetPathHint}
      </p>
      {reviewNote ? (
        <p className="neo-copy mt-2 border-2 border-black bg-[#fbf4e7] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
          {reviewNote}
        </p>
      ) : null}
    </article>
  );
}

function statusBadgeClass(status: CrossStoreSaveSyncStatus) {
  if (status === "ready") return "bg-[#8cf5e4] text-[#171411]";
  if (status === "warning") return "bg-[#fff9ed] text-[#171411]";
  return "bg-[#b7102a] text-white";
}

function laneStatusClass(status: CrossStoreSaveSyncStatus) {
  if (status === "ready") return "bg-[#8cf5e4]";
  if (status === "warning") return "bg-[#fff9ed]";
  return "bg-[#efe3cf]";
}

function laneStatusLabel(status: CrossStoreSaveSyncStatus) {
  if (status === "ready") return "review-only";
  return status;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
