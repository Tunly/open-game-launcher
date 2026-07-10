import { ImagePlus, ShieldCheck, Sparkles } from "lucide-react";

import type {
  HostedCommunityArtworkGate,
  HostedCommunityArtworkReadiness,
  HostedCommunityArtworkReadinessStatus,
} from "../../../lib/hosted-community-artwork-readiness";
import type {
  ProviderArtworkCapsCheck,
  ProviderArtworkCapsProof,
  ProviderArtworkCapsReview,
  ProviderArtworkCapsStatus,
} from "../../../lib/provider-artwork-policy";

export function HostedCommunityArtworkReadinessPanel({
  readiness,
}: {
  readiness: HostedCommunityArtworkReadiness;
}) {
  const tone =
    readiness.blockedCount > 0 ? "blocked" : readiness.warningCount > 0 ? "warning" : "ready";

  return (
    <section
      aria-label="Hosted community artwork readiness"
      className="neo-dots border-4 border-black bg-[#fbf4e7] shadow-[3px_3px_0_#171411]"
    >
      <div className="border-b-2 border-black bg-[#171411] px-3 py-2 text-[#fbf4e7]">
        <p className="neo-copy text-[9px] font-black tracking-[0.14em] text-[#8cf5e4] uppercase">
          Community Art Pipeline
        </p>
        <h2 className="mt-1 flex items-center gap-2 text-[15px] leading-none font-black uppercase">
          <ImagePlus aria-hidden="true" className="h-4 w-4" />
          Hosted Artwork Readiness
        </h2>
      </div>

      <div className="space-y-3 p-3">
        <div className="border-2 border-black bg-[#efe3cf] p-3 shadow-[2px_2px_0_#171411]">
          <div className="grid gap-2">
            <div className="min-w-0">
              <p className="neo-copy text-[9px] font-black text-[#5b403f] uppercase">
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
          <p className="neo-copy mt-2 text-[9px] leading-4 font-black text-[#5b403f] uppercase">
            {readiness.summary}
          </p>
          <p className="neo-copy mt-2 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] leading-4 font-black text-[#171411] uppercase">
            Next: {readiness.nextAction}
          </p>
        </div>

        <div className="grid gap-2">
          {readiness.gates.map((gate) => (
            <HostedCommunityArtworkGateRow gate={gate} key={gate.id} />
          ))}
        </div>

        <ProviderCapsProofLedger proof={readiness.providerCapsProof} />

        <div className="border-2 border-black bg-[#171411] p-3 text-[#fbf4e7] shadow-[2px_2px_0_#b7102a]">
          <p className="neo-copy flex items-center gap-2 text-[9px] font-black text-[#8cf5e4] uppercase">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            Rollout Guard
          </p>
          <p className="neo-copy mt-2 border-2 border-[#fbf4e7] bg-[#2a221b] px-2 py-1 text-[8px] leading-4 font-black uppercase">
            {readiness.guardCopy}
          </p>
          <div className="mt-2 grid gap-1.5">
            {readiness.guards.map((guard) => (
              <p
                className="neo-copy border-2 border-[#fbf4e7] bg-[#2a221b] px-2 py-1 text-[8px] leading-4 font-black uppercase"
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

function ProviderCapsProofLedger({ proof }: { proof: ProviderArtworkCapsProof }) {
  return (
    <section
      aria-label="Provider artwork caps proof"
      className="border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-black pb-2">
        <div className="min-w-0">
          <p className="neo-copy text-[8px] font-black tracking-[0.1em] text-[#5b403f] uppercase">
            Local Source Policy
          </p>
          <h3 className="mt-1 text-sm font-black text-[#171411] uppercase">Provider Caps Proof</h3>
        </div>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[8px] font-black text-[#171411] uppercase shadow-[1px_1px_0_#171411]">
          {proof.passCount} pass / {proof.reviewCount} review / {proof.blockedCount} blocked
        </span>
      </div>
      <p className="neo-copy mt-2 text-[8px] leading-4 font-black text-[#5b403f] uppercase">
        {proof.summary}
      </p>
      <div className="mt-2 grid gap-2">
        {proof.entries.map((entry) => (
          <ProviderCapsReviewCard entry={entry} key={entry.provider} />
        ))}
      </div>
      <div className="mt-2 grid gap-1">
        {proof.guards.map((guard) => (
          <p
            className="neo-copy border-2 border-black bg-[#f3e8d7] px-2 py-1 text-[8px] leading-4 font-black text-[#171411] uppercase"
            key={guard}
          >
            {guard}
          </p>
        ))}
      </div>
    </section>
  );
}

function ProviderCapsReviewCard({ entry }: { entry: ProviderArtworkCapsReview }) {
  return (
    <article className="border-2 border-black bg-[#efe3cf] p-2 shadow-[1px_1px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy text-[10px] font-black text-[#171411] uppercase">
            {entry.providerLabel} Caps
          </p>
          <p className="neo-copy text-[8px] leading-4 font-black break-words text-[#5b403f] uppercase">
            {entry.host ?? "no host"} // {entry.sourceId ?? "manual source id"} // {entry.assetKind}
          </p>
        </div>
        <span
          className={`neo-copy border-2 border-black px-2 py-0.5 text-[8px] font-black uppercase shadow-[1px_1px_0_#171411] ${capsStatusClass(
            entry.status,
          )}`}
        >
          {entry.statusLabel}
        </span>
      </div>
      <div className="mt-2 grid gap-1">
        {entry.checks.map((check) => (
          <ProviderCapsCheckLine check={check} key={`${entry.provider}-${check.label}`} />
        ))}
      </div>
    </article>
  );
}

function ProviderCapsCheckLine({ check }: { check: ProviderArtworkCapsCheck }) {
  return (
    <div className="grid gap-1 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] leading-4 font-black text-[#171411] uppercase">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <span className="text-[#5b403f]">{check.label}</span>
        <span
          className={`w-fit border-2 border-black px-1.5 py-0.5 ${capsStatusClass(check.status)}`}
        >
          {check.status}
        </span>
      </div>
      <span className="break-words">{check.detail}</span>
    </div>
  );
}

function HostedCommunityArtworkGateRow({ gate }: { gate: HostedCommunityArtworkGate }) {
  return (
    <article
      className={`min-w-0 border-2 border-black p-2 shadow-[2px_2px_0_#171411] ${statusClass(
        gate.status,
      )}`}
    >
      <div className="grid gap-2">
        <div className="min-w-0">
          <p className="neo-copy text-[8px] font-black tracking-[0.1em] text-[#5b403f] uppercase">
            Artwork Gate
          </p>
          <h3 className="mt-1 flex items-center gap-1.5 text-sm font-black text-[#171411] uppercase">
            <Sparkles aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="min-w-0 break-words">{gate.label}</span>
          </h3>
        </div>
        <span className="neo-copy w-fit border-2 border-black bg-[#fff9ed] px-1.5 py-0.5 text-[8px] font-black text-[#171411] uppercase">
          {gate.status}
        </span>
      </div>
      <p className="neo-copy mt-2 text-[8px] leading-4 font-black text-[#5b403f] uppercase">
        {gate.detail}
      </p>
      <p className="neo-copy mt-2 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] leading-4 font-black text-[#171411] uppercase">
        {gate.action}
      </p>
    </article>
  );
}

function statusClass(status: HostedCommunityArtworkReadinessStatus) {
  if (status === "ready") return "bg-[#8cf5e4] text-[#171411]";
  if (status === "warning") return "bg-[#fff9ed] text-[#171411]";
  return "bg-[#efe3cf] text-[#171411]";
}

function capsStatusClass(status: ProviderArtworkCapsStatus) {
  if (status === "pass") return "bg-[#8cf5e4] text-[#171411]";
  if (status === "review") return "bg-[#fff9ed] text-[#171411]";
  return "bg-[#fbd6dc] text-[#7a0918]";
}
