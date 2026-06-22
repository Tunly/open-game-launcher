import { BrainCircuit, ClipboardCheck, ShieldCheck, Sparkles } from "lucide-react";

import type {
  AiRecommendationConsentAuditPacket,
  AiRecommendationConsentAuditReviewRow,
  AiRecommendationReadiness,
  AiRecommendationReadinessGate,
  AiRecommendationReadinessStatus,
} from "../../../lib/ai-recommendation-readiness";

export function AiRecommendationReadinessPanel({
  readiness,
}: {
  readiness: AiRecommendationReadiness;
}) {
  const tone =
    readiness.blockedCount > 0 ? "blocked" : readiness.warningCount > 0 ? "warning" : "ready";

  return (
    <section
      aria-label="AI recommendation readiness"
      className="neo-dots border-4 border-black bg-[#fbf4e7] shadow-[3px_3px_0_#171411]"
    >
      <div className="border-b-2 border-black bg-[#171411] px-3 py-2 text-[#fbf4e7]">
        <p className="neo-copy text-[9px] font-black uppercase tracking-[0.14em] text-[#8cf5e4]">
          Hosted Model Preflight
        </p>
        <h2 className="mt-1 flex items-center gap-2 text-[15px] font-black uppercase leading-none">
          <BrainCircuit aria-hidden="true" className="h-4 w-4" />
          AI Recommendation Readiness
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
            <AiRecommendationGateRow gate={gate} key={gate.id} />
          ))}
        </div>

        {readiness.consentAuditPacket ? (
          <ConsentAuditPacketLedger packet={readiness.consentAuditPacket} />
        ) : null}

        <div className="border-2 border-black bg-[#171411] p-3 text-[#fbf4e7] shadow-[2px_2px_0_#b7102a]">
          <p className="neo-copy flex items-center gap-2 text-[9px] font-black uppercase text-[#8cf5e4]">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            Model Guard
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

function ConsentAuditPacketLedger({ packet }: { packet: AiRecommendationConsentAuditPacket }) {
  return (
    <div className="border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b-2 border-black pb-2">
        <div className="min-w-0">
          <p className="neo-copy text-[9px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
            Consent Boundary
          </p>
          <h3 className="mt-1 flex items-center gap-2 text-sm font-black uppercase leading-none text-[#171411]">
            <ClipboardCheck aria-hidden="true" className="h-4 w-4 shrink-0" />
            Consent Audit Packet
          </h3>
        </div>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[8px] font-black uppercase text-[#171411] shadow-[1px_1px_0_#171411]">
          {packet.consentStateLabel}
        </span>
      </div>

      <p className="neo-copy mt-2 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
        {packet.summary}
      </p>

      <dl className="mt-2 grid gap-1.5">
        <PacketFact label="Packet" value={packet.packetId} />
        <PacketFact label="Audit" value={packet.auditId} />
        <PacketFact label="Created" value={packet.createdAt} />
        <PacketFact label="Writes" value={packet.promptEnvelope.writes} />
        <PacketFact label="Model Call" value={packet.promptEnvelope.modelCall} />
      </dl>

      <div className="mt-2 border-2 border-black bg-[#efe3cf] p-2">
        <p className="neo-copy text-[8px] font-black uppercase tracking-[0.12em] text-[#5b403f]">
          Redacted Prompt Envelope
        </p>
        <p className="neo-copy mt-1 break-words text-[8px] font-black uppercase leading-4 text-[#171411]">
          {packet.promptEnvelope.redactedPrompt}
        </p>
        <p className="neo-copy mt-2 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
          Omitted: {packet.promptEnvelope.omittedFields.join(", ")}
        </p>
      </div>

      <ConsentEvidenceLedger packet={packet} />

      <div className="mt-2 grid gap-1.5">
        {packet.reviewRows.map((row) => (
          <ConsentAuditReviewRow row={row} key={row.id} />
        ))}
      </div>

      <div className="mt-2 grid gap-1.5">
        {packet.guards.map((guard) => (
          <p
            className="neo-copy border-2 border-black bg-[#f4ead8] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]"
            key={guard}
          >
            {guard}
          </p>
        ))}
      </div>
    </div>
  );
}

function ConsentEvidenceLedger({ packet }: { packet: AiRecommendationConsentAuditPacket }) {
  return (
    <div className="mt-2 border-2 border-black bg-[#efe3cf] p-2">
      <p className="neo-copy text-[8px] font-black uppercase tracking-[0.12em] text-[#5b403f]">
        Local No-Write Evidence
      </p>
      <dl className="mt-2 grid gap-1.5">
        <PacketFact label="Sample Hash" value={packet.evidence.deterministicSampleHash} />
        <PacketFact label="Redacted" value={`${packet.evidence.redactedFieldCount} fields`} />
        <PacketFact label="Retained" value={packet.evidence.retainedFields.join(", ")} />
        <PacketFact label="Blocked" value={packet.evidence.blockedSinks.join(", ")} />
      </dl>
      <div className="mt-2 grid gap-1.5">
        {packet.evidence.noWriteLedger.map((item) => (
          <article className="border-2 border-black bg-[#fff9ed] p-2" key={item.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-[11px] font-black uppercase leading-none text-[#171411]">
                {item.label}
              </h4>
              <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-1.5 py-0.5 text-[8px] font-black uppercase text-[#171411] shadow-[1px_1px_0_#171411]">
                {item.value}
              </span>
            </div>
            <p className="neo-copy mt-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
              {item.detail}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}

function PacketFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[82px_minmax(0,1fr)] gap-2 border-2 border-black bg-[#fbf4e7] px-2 py-1">
      <dt className="neo-copy text-[8px] font-black uppercase text-[#5b403f]">{label}</dt>
      <dd className="neo-copy break-words text-[8px] font-black uppercase leading-4 text-[#171411]">
        {value}
      </dd>
    </div>
  );
}

function ConsentAuditReviewRow({ row }: { row: AiRecommendationConsentAuditReviewRow }) {
  return (
    <article className="border-2 border-black bg-[#fbf4e7] p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[11px] font-black uppercase leading-none text-[#171411]">
          {row.label}
        </h4>
        <span
          className={`neo-copy border-2 border-black px-1.5 py-0.5 text-[8px] font-black uppercase shadow-[1px_1px_0_#171411] ${
            row.status === "pass" ? "bg-[#8cf5e4] text-[#171411]" : "bg-[#e8c843] text-[#171411]"
          }`}
        >
          {row.status}
        </span>
      </div>
      <p className="neo-copy mt-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
        {row.detail}
      </p>
    </article>
  );
}

function AiRecommendationGateRow({ gate }: { gate: AiRecommendationReadinessGate }) {
  return (
    <article
      className={`border-2 border-black p-2 shadow-[2px_2px_0_#171411] ${statusClass(gate.status)}`}
    >
      <div className="grid gap-2">
        <div className="min-w-0">
          <p className="neo-copy text-[8px] font-black uppercase tracking-[0.1em] text-[#5b403f]">
            AI Gate
          </p>
          <h3 className="mt-1 flex items-center gap-1.5 text-sm font-black uppercase text-[#171411]">
            <Sparkles aria-hidden="true" className="h-4 w-4 shrink-0" />
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

function statusClass(status: AiRecommendationReadinessStatus) {
  if (status === "ready") return "bg-[#8cf5e4] text-[#171411]";
  if (status === "warning") return "bg-[#fff9ed] text-[#171411]";
  return "bg-[#efe3cf] text-[#171411]";
}
