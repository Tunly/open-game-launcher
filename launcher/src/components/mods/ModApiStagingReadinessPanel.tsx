import { KeyRound, RadioTower, Search, ShieldCheck } from "lucide-react";

import type {
  ModApiStagingGate,
  ModApiStagingPolicyEvidence,
  ModApiStagingPolicyProviderRule,
  ModApiStagingReadiness,
  ModApiStagingResponseReview,
  ModApiStagingStatus,
} from "../../lib/mod-api-staging-readiness";
import type {
  ModProviderStagingProbeResult,
  ModProviderStagingProbeStatus,
} from "../../lib/types/mods";

export function ModApiStagingReadinessPanel({
  readiness,
  stagingProbe,
}: {
  readiness: ModApiStagingReadiness;
  stagingProbe?: ModProviderStagingProbeResult | null;
}) {
  return (
    <section
      aria-label="Mod provider API key staging readiness"
      className="neo-dots border-4 border-black bg-[#fbf4e7] p-4 shadow-[6px_6px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-black pb-3">
        <div>
          <p className="neo-copy text-[10px] font-black tracking-[0.22em] text-[#b7102a] uppercase">
            mod.io // CurseForge Preflight
          </p>
          <h2 className="neo-title mt-1 flex items-center gap-2 text-3xl text-[#171411] uppercase">
            <KeyRound aria-hidden="true" className="h-8 w-8" /> API Staging Readiness
          </h2>
          <p className="neo-copy mt-2 max-w-3xl text-xs leading-5 font-bold text-[#5f574d] uppercase">
            {readiness.summary}
          </p>
        </div>
        <span
          className={`neo-copy border-2 border-black px-3 py-2 text-[10px] font-black uppercase shadow-[3px_3px_0_#171411] ${statusClass(
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

      <div className="mt-4 grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)_280px]">
        <div className="border-2 border-black bg-[#efe3cf] p-3 shadow-[3px_3px_0_#171411]">
          <p className="neo-copy text-[10px] font-black text-[#5f574d] uppercase">Staging Score</p>
          <p className="neo-title mt-1 text-5xl text-[#171411] uppercase">
            {readiness.readyCount}/{readiness.gates.length}
          </p>
          <p className="neo-copy mt-2 text-[10px] leading-5 font-black text-[#5f574d] uppercase">
            Next: {readiness.nextAction}
          </p>
          <div className="mt-3 h-3 border-2 border-black bg-[#fff9ed]">
            <div className="h-full bg-[#087d6d]" style={{ width: `${readiness.progress}%` }} />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {readiness.gates.map((gate) => (
            <ModApiStagingGateCard gate={gate} key={gate.id} />
          ))}
        </div>

        <div className="border-2 border-black bg-[#171411] p-3 text-[#fff9ed] shadow-[3px_3px_0_#b7102a]">
          <p className="neo-copy flex items-center gap-2 text-[10px] font-black text-[#8cf5e4] uppercase">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" /> Provider Guard
          </p>
          <p className="neo-copy mt-2 border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] leading-5 font-black uppercase">
            {readiness.guardCopy}
          </p>
          <div className="mt-3 grid gap-2">
            {readiness.guards.map((guard) => (
              <p
                className="neo-copy border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] leading-5 font-black uppercase"
                key={guard}
              >
                {guard}
              </p>
            ))}
          </div>
        </div>
      </div>

      {stagingProbe ? <ModProviderStagingProbeCard probe={stagingProbe} /> : null}

      {readiness.policyEvidence ? (
        <ModApiStagingPolicyCard policy={readiness.policyEvidence} />
      ) : null}

      <ModProviderResponseReviewGrid reviews={readiness.responseReviews} />
    </section>
  );
}

function ModApiStagingPolicyCard({ policy }: { policy: ModApiStagingPolicyEvidence }) {
  return (
    <div className="mt-4 border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-black pb-3">
        <div>
          <p className="neo-copy text-[10px] font-black tracking-[0.18em] text-[#087d6d] uppercase">
            Local Policy Packet
          </p>
          <h3 className="neo-title mt-1 flex items-center gap-2 text-2xl text-[#171411] uppercase">
            <ShieldCheck aria-hidden="true" className="h-6 w-6" />
            {policy.label}
          </h3>
        </div>
        <span
          className={`neo-copy border-2 border-black px-3 py-2 text-[9px] font-black uppercase shadow-[2px_2px_0_#171411] ${statusClass(
            policy.status,
          )}`}
        >
          {policy.status}
        </span>
      </div>

      <p className="neo-copy mt-3 border-2 border-black bg-[#8cf5e4] px-3 py-2 text-[9px] leading-5 font-black text-[#171411] uppercase">
        {policy.guardCopy}
      </p>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {policy.providerRules.map((rule) => (
          <ModApiStagingProviderRuleCard key={rule.provider} rule={rule} />
        ))}
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {policy.guards.map((guard) => (
          <p
            className="neo-copy border-2 border-black bg-[#171411] px-3 py-2 text-[9px] leading-5 font-black text-[#fff9ed] uppercase"
            key={guard}
          >
            {guard}
          </p>
        ))}
      </div>
    </div>
  );
}

function ModApiStagingProviderRuleCard({ rule }: { rule: ModApiStagingPolicyProviderRule }) {
  return (
    <article className="border-2 border-black bg-[#f5eedf] p-3 shadow-[2px_2px_0_#171411]">
      <p className="neo-copy text-[9px] font-black tracking-[0.14em] text-[#5f574d] uppercase">
        {rule.provider === "modio" ? "mod.io" : "CurseForge"}
      </p>
      <div className="mt-3 grid gap-2">
        <PolicyLine label="Terms" value={rule.termsBoundary} />
        <PolicyLine label="Throttle" value={rule.throttle} />
        <PolicyLine label="Retry" value={rule.retry} />
        <PolicyLine label="Redaction" value={rule.redaction} />
        <PolicyLine label="Download" value={rule.directDownloadPolicy} />
      </div>
    </article>
  );
}

function PolicyLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] leading-4 font-black text-[#171411] uppercase">
      <span className="text-[#b7102a]">{label}:</span> {value}
    </p>
  );
}

function ModProviderResponseReviewGrid({ reviews }: { reviews: ModApiStagingResponseReview[] }) {
  return (
    <div className="mt-4 border-2 border-black bg-[#efe3cf] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-black pb-3">
        <div>
          <p className="neo-copy text-[10px] font-black tracking-[0.18em] text-[#b7102a] uppercase">
            Local Response Fixture
          </p>
          <h3 className="neo-title mt-1 flex items-center gap-2 text-2xl text-[#171411] uppercase">
            <Search aria-hidden="true" className="h-6 w-6" />
            Provider Response Review
          </h3>
        </div>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[9px] font-black uppercase shadow-[2px_2px_0_#171411]">
          No live call
        </span>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {reviews.map((review) => (
          <article
            className="border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]"
            key={review.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="neo-copy text-[9px] font-black tracking-[0.14em] text-[#5f574d] uppercase">
                  {review.provider === "modio" ? "mod.io" : "CurseForge"}
                </p>
                <h4 className="neo-title mt-1 text-xl text-[#171411] uppercase">{review.label}</h4>
              </div>
              <span
                className={`neo-copy border-2 border-black px-2 py-1 text-[8px] font-black uppercase shadow-[1px_1px_0_#171411] ${statusClass(
                  review.status,
                )}`}
              >
                {review.status}
              </span>
            </div>
            <p className="neo-copy mt-2 text-[10px] leading-5 font-black text-[#5f574d] uppercase">
              {review.detail}
            </p>
            <ResponseReviewChipList label="Safe fields" values={review.safeFields} />
            <ResponseReviewChipList
              label="Blocked fields"
              tone="blocked"
              values={review.blockedFields}
            />
            <p className="neo-copy mt-3 border-2 border-black bg-[#8cf5e4] px-3 py-2 text-[9px] leading-5 font-black text-[#171411] uppercase">
              {review.handoffPolicy}
            </p>
            <p className="neo-copy mt-2 border-2 border-black bg-[#171411] px-3 py-2 text-[9px] leading-5 font-black text-[#fff9ed] uppercase">
              {review.redaction}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}

function ResponseReviewChipList({
  label,
  tone = "safe",
  values,
}: {
  label: string;
  tone?: "blocked" | "safe";
  values: string[];
}) {
  return (
    <div className="mt-3">
      <p className="neo-copy text-[8px] font-black tracking-[0.12em] text-[#5f574d] uppercase">
        {label}
      </p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {values.map((value) => (
          <span
            className={`neo-copy border-2 border-black px-2 py-1 text-[8px] font-black uppercase shadow-[1px_1px_0_#171411] ${
              tone === "blocked" ? "bg-[#b7102a] text-white" : "bg-[#8cf5e4] text-[#171411]"
            }`}
            key={value}
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

function ModProviderStagingProbeCard({ probe }: { probe: ModProviderStagingProbeResult }) {
  return (
    <div className="mt-4 border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-black pb-3">
        <div>
          <p className="neo-copy text-[10px] font-black tracking-[0.18em] text-[#b7102a] uppercase">
            Provider Staging Probe
          </p>
          <h3 className="neo-title mt-1 flex items-center gap-2 text-2xl text-[#171411] uppercase">
            <RadioTower aria-hidden="true" className="h-6 w-6" />
            {probe.provider === "modio" ? "mod.io" : "CurseForge"} Redacted Packet
          </h3>
        </div>
        <span
          className={`neo-copy border-2 border-black px-3 py-2 text-[9px] font-black uppercase shadow-[2px_2px_0_#171411] ${probeStatusClass(
            probe.status,
          )}`}
        >
          {probe.status.replace("_", " ")}
        </span>
      </div>

      <p className="neo-copy mt-3 border-2 border-black bg-[#8cf5e4] px-3 py-2 text-[10px] leading-5 font-black text-[#171411] uppercase">
        {probe.message}
      </p>

      <div className="mt-3 grid gap-2 md:grid-cols-4">
        <ProbeStat label="Page Size" value={String(probe.pageSize)} />
        <ProbeStat label="Results" value={String(probe.resultCount)} />
        <ProbeStat label="Direct URLs" value={String(probe.directDownloadCount)} />
        <ProbeStat label="App Handoffs" value={String(probe.providerAppHandoffCount)} />
      </div>

      <p className="neo-copy mt-3 border-2 border-black bg-[#171411] px-3 py-2 text-[9px] leading-5 font-black break-all text-[#fff9ed] uppercase">
        {probe.redactedRequest}
      </p>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {probe.guards.map((guard) => (
          <p
            className="neo-copy border-2 border-black bg-[#efe3cf] px-3 py-2 text-[9px] leading-5 font-black text-[#171411] uppercase"
            key={guard}
          >
            {guard}
          </p>
        ))}
      </div>
    </div>
  );
}

function ProbeStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-black bg-[#f5eedf] p-2 shadow-[2px_2px_0_#171411]">
      <p className="neo-copy text-[8px] font-black tracking-[0.12em] text-[#5f574d] uppercase">
        {label}
      </p>
      <p className="neo-title mt-1 text-3xl text-[#171411] uppercase">{value}</p>
    </div>
  );
}

function ModApiStagingGateCard({ gate }: { gate: ModApiStagingGate }) {
  return (
    <article
      className={`min-h-[150px] border-2 border-black p-3 shadow-[3px_3px_0_#171411] ${statusClass(
        gate.status,
      )}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy text-[9px] font-black tracking-[0.16em] text-[#5f574d] uppercase">
            Provider Gate
          </p>
          <h3 className="mt-1 flex items-center gap-1.5 text-base leading-tight font-black text-[#171411] uppercase">
            <Search aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>{gate.label}</span>
          </h3>
        </div>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black text-[#171411] uppercase">
          {gate.status}
        </span>
      </div>
      <p className="neo-copy mt-3 text-[10px] leading-5 font-black text-[#5f574d] uppercase">
        {gate.detail}
      </p>
      <p className="neo-copy mt-3 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] leading-4 font-black text-[#171411] uppercase">
        {gate.action}
      </p>
    </article>
  );
}

function statusClass(status: ModApiStagingStatus) {
  if (status === "ready") return "bg-[#8cf5e4] text-[#171411]";
  if (status === "warning") return "bg-[#fff9ed] text-[#171411]";
  return "bg-[#efe3cf] text-[#171411]";
}

function probeStatusClass(status: ModProviderStagingProbeStatus) {
  if (status === "ready") return "bg-[#8cf5e4] text-[#171411]";
  if (status === "provider_error") return "bg-[#b7102a] text-white";
  return "bg-[#efe3cf] text-[#171411]";
}
