import { ArrowRightLeft, Cloud, ShieldCheck } from "lucide-react";

import type {
  CrossStoreSaveKeychainRestoreEvidence,
  CrossStoreSaveKeychainRestoreRule,
  CrossStoreSaveMigrationReadiness,
  CrossStoreSaveMigrationReadinessGate,
  CrossStoreSaveMigrationReadinessStatus,
} from "../../../lib/cross-store-save-migration-readiness";

export function CrossStoreSaveMigrationReadinessPanel({
  readiness,
}: {
  readiness: CrossStoreSaveMigrationReadiness;
}) {
  const tone =
    readiness.blockedCount > 0 ? "blocked" : readiness.warningCount > 0 ? "warning" : "ready";

  return (
    <section
      aria-label="Cross-store save sync E2E readiness"
      className="neo-dots border-4 border-black bg-[#fbf4e7] shadow-[3px_3px_0_#171411]"
    >
      <div className="border-b-2 border-black bg-[#171411] px-3 py-2 text-[#fbf4e7]">
        <p className="neo-copy text-[9px] font-black uppercase tracking-[0.14em] text-[#8cf5e4]">
          Native/Provider Preflight
        </p>
        <h2 className="mt-1 flex items-center gap-2 text-[15px] font-black uppercase leading-none">
          <ArrowRightLeft aria-hidden="true" className="h-4 w-4" />
          Cross-Store Save Sync E2E Readiness
        </h2>
      </div>

      <div className="space-y-3 p-3">
        <div className="border-2 border-black bg-[#efe3cf] p-3 shadow-[2px_2px_0_#171411]">
          <div className="grid gap-2">
            <div className="min-w-0">
              <p className="neo-copy text-[9px] font-black uppercase text-[#5b403f]">
                {readiness.statusLabel}
              </p>
              <p className="neo-title mt-1 text-3xl leading-none text-[#171411]">
                {readiness.readyCount}/{readiness.gates.length}
              </p>
            </div>
            <span
              className={`neo-copy w-fit border-2 border-black px-2 py-1 text-[8px] font-black uppercase shadow-[1px_1px_0_#171411] ${statusClass(
                tone,
              )}`}
            >
              {readiness.progress}%
            </span>
          </div>
          <p className="neo-copy mt-2 text-[9px] font-black uppercase leading-4 text-[#5b403f]">
            {readiness.summary}
          </p>
          <p className="neo-copy mt-2 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
            Next: {readiness.nextAction}
          </p>
        </div>

        <div className="grid gap-2">
          {readiness.gates.map((gate) => (
            <CrossStoreMigrationGateRow gate={gate} key={gate.id} />
          ))}
        </div>

        {readiness.keychainRestoreEvidence ? (
          <CrossStoreKeychainRestoreEvidenceCard evidence={readiness.keychainRestoreEvidence} />
        ) : null}

        <div className="border-2 border-black bg-[#171411] p-3 text-[#fbf4e7] shadow-[2px_2px_0_#b7102a]">
          <p className="neo-copy flex items-center gap-2 text-[9px] font-black uppercase text-[#8cf5e4]">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            E2E No-Write Guard
          </p>
          <p className="neo-copy mt-2 border-2 border-[#fbf4e7] bg-[#2a221b] px-2 py-1 text-[8px] font-black uppercase leading-4">
            {readiness.guardCopy}
          </p>
          <div className="mt-2 grid gap-1.5">
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

function CrossStoreKeychainRestoreEvidenceCard({
  evidence,
}: {
  evidence: CrossStoreSaveKeychainRestoreEvidence;
}) {
  return (
    <article className="border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]">
      <div className="grid gap-2">
        <div className="min-w-0">
          <p className="neo-copy text-[8px] font-black uppercase tracking-[0.1em] text-[#b7102a]">
            Restore Contract Evidence
          </p>
          <h3 className="mt-1 flex items-center gap-1.5 text-sm font-black uppercase text-[#171411]">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>{evidence.label}</span>
          </h3>
        </div>
        <span className="neo-copy w-fit border-2 border-black bg-[#efe3cf] px-1.5 py-0.5 text-[8px] font-black uppercase text-[#171411]">
          {evidence.status}
        </span>
      </div>
      <p className="neo-copy mt-2 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
        {evidence.summary}
      </p>
      <div className="mt-2 grid gap-1.5">
        {evidence.guards.map((guard) => (
          <p
            className="neo-copy border-2 border-black bg-[#efe3cf] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]"
            key={guard}
          >
            {guard}
          </p>
        ))}
      </div>
      <div className="mt-2 grid gap-1.5">
        {evidence.restoreRules.map((rule) => (
          <CrossStoreKeychainRestoreRuleRow key={rule.id} rule={rule} />
        ))}
      </div>
    </article>
  );
}

function CrossStoreKeychainRestoreRuleRow({ rule }: { rule: CrossStoreSaveKeychainRestoreRule }) {
  return (
    <div className="border-2 border-black bg-[#fbf4e7] p-2">
      <p className="neo-copy text-[8px] font-black uppercase text-[#b7102a]">{rule.label}</p>
      <p className="neo-copy mt-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
        <span className="text-[#171411]">Boundary:</span> {rule.boundary}
      </p>
      <p className="neo-copy mt-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
        <span className="text-[#171411]">Evidence:</span> {rule.evidence}
      </p>
    </div>
  );
}

function CrossStoreMigrationGateRow({ gate }: { gate: CrossStoreSaveMigrationReadinessGate }) {
  return (
    <article
      className={`border-2 border-black p-2 shadow-[2px_2px_0_#171411] ${statusClass(gate.status)}`}
    >
      <div className="grid gap-2">
        <div className="min-w-0">
          <p className="neo-copy text-[8px] font-black uppercase tracking-[0.1em] text-[#5b403f]">
            Migration Gate
          </p>
          <h3 className="mt-1 flex items-center gap-1.5 text-sm font-black uppercase text-[#171411]">
            <Cloud aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>{gate.label}</span>
          </h3>
        </div>
        <span className="neo-copy w-fit border-2 border-black bg-[#fff9ed] px-1.5 py-0.5 text-[8px] font-black uppercase text-[#171411]">
          {gate.status}
        </span>
      </div>
      <p className="neo-copy mt-2 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
        {gate.detail}
      </p>
      <p className="neo-copy mt-2 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
        {gate.action}
      </p>
    </article>
  );
}

function statusClass(status: CrossStoreSaveMigrationReadinessStatus) {
  if (status === "ready") return "bg-[#8cf5e4] text-[#171411]";
  if (status === "warning") return "bg-[#fff9ed] text-[#171411]";
  return "bg-[#efe3cf] text-[#171411]";
}
