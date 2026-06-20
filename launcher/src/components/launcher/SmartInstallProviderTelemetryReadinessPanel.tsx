import { FileKey2, Gauge, ListChecks, RadioTower, ShieldCheck } from "lucide-react";

import type {
  SmartInstallLocalMirrorAuditPacket,
  SmartInstallLocalMirrorAuditSample,
} from "../../lib/smart-install-local-mirror-audit";
import type {
  SmartInstallProviderTelemetryDryRunPacket,
  SmartInstallProviderTelemetryDryRunSignal,
  SmartInstallProviderTelemetryGate,
  SmartInstallProviderTelemetryReadiness,
  SmartInstallProviderTelemetryStatus,
} from "../../lib/smart-install-provider-telemetry-readiness";

export function SmartInstallProviderTelemetryReadinessPanel({
  readiness,
}: {
  readiness: SmartInstallProviderTelemetryReadiness;
}) {
  return (
    <section
      aria-label="Smart install provider telemetry readiness"
      className="border-4 border-black bg-[#fff9ed] p-4 shadow-[5px_5px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-black pb-3">
        <div>
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.22em] text-[#b7102a]">
            Provider Signal Preflight
          </p>
          <h2 className="neo-title mt-1 flex items-center gap-2 text-3xl uppercase text-[#171411]">
            <RadioTower aria-hidden="true" className="h-8 w-8" />
            Smart Install Telemetry
          </h2>
          <p className="neo-copy mt-2 max-w-3xl text-xs font-bold uppercase leading-5 text-[#5f574d]">
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
          <p className="neo-copy text-[10px] font-black uppercase text-[#5f574d]">
            Telemetry Score
          </p>
          <p className="neo-title mt-1 text-5xl uppercase text-[#171411]">
            {readiness.readyCount}/{readiness.gates.length}
          </p>
          <p className="neo-copy mt-2 text-[10px] font-black uppercase leading-5 text-[#5f574d]">
            Next: {readiness.nextAction}
          </p>
          <div className="mt-3 h-3 border-2 border-black bg-[#fff9ed]">
            <div className="h-full bg-[#087d6d]" style={{ width: `${readiness.progress}%` }} />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {readiness.gates.map((gate) => (
            <SmartInstallTelemetryGateCard gate={gate} key={gate.id} />
          ))}
        </div>

        <div className="border-2 border-black bg-[#171411] p-3 text-[#fff9ed] shadow-[3px_3px_0_#b7102a]">
          <p className="neo-copy flex items-center gap-2 text-[10px] font-black uppercase text-[#8cf5e4]">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            Provider Guard
          </p>
          <p className="neo-copy mt-2 border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] font-black uppercase leading-5">
            {readiness.guardCopy}
          </p>
          <div className="mt-3 grid gap-2">
            {readiness.guards.map((guard) => (
              <p
                className="neo-copy border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] font-black uppercase leading-5"
                key={guard}
              >
                {guard}
              </p>
            ))}
          </div>
        </div>
      </div>

      {readiness.dryRunPacket ? (
        <SmartInstallTelemetryDryRunPanel packet={readiness.dryRunPacket} />
      ) : null}

      {readiness.localMirrorAuditPacket ? (
        <SmartInstallLocalMirrorAuditPanel packet={readiness.localMirrorAuditPacket} />
      ) : null}
    </section>
  );
}

function SmartInstallTelemetryGateCard({ gate }: { gate: SmartInstallProviderTelemetryGate }) {
  return (
    <article
      className={`min-h-[150px] border-2 border-black p-3 shadow-[3px_3px_0_#171411] ${statusClass(
        gate.status,
      )}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy text-[9px] font-black uppercase tracking-[0.16em] text-[#5f574d]">
            Signal Gate
          </p>
          <h3 className="mt-1 flex items-center gap-1.5 text-base font-black uppercase leading-tight text-[#171411]">
            <Gauge aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>{gate.label}</span>
          </h3>
        </div>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase text-[#171411]">
          {gate.status}
        </span>
      </div>
      <p className="neo-copy mt-3 text-[10px] font-black uppercase leading-5 text-[#5f574d]">
        {gate.detail}
      </p>
      <p className="neo-copy mt-3 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black uppercase leading-4 text-[#171411]">
        {gate.action}
      </p>
    </article>
  );
}

function SmartInstallTelemetryDryRunPanel({
  packet,
}: {
  packet: SmartInstallProviderTelemetryDryRunPacket;
}) {
  return (
    <div className="mt-4 border-2 border-black bg-[#efe3cf] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-black pb-3">
        <div>
          <p className="neo-copy text-[9px] font-black uppercase tracking-[0.18em] text-[#b7102a]">
            No-Write Fixture Packet
          </p>
          <h3 className="neo-title mt-1 flex items-center gap-2 text-2xl uppercase text-[#171411]">
            <FileKey2 aria-hidden="true" className="h-6 w-6" />
            {packet.title}
          </h3>
          <p className="neo-copy mt-2 max-w-4xl text-[10px] font-black uppercase leading-5 text-[#5f574d]">
            {packet.rankingPolicy}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[#171411] sm:grid-cols-4">
          <SmartInstallTelemetryStat label="Mode" value={packet.mode} />
          <SmartInstallTelemetryStat label="Writes" value={packet.writes} />
          <SmartInstallTelemetryStat label="Live Calls" value={packet.liveCalls} />
          <SmartInstallTelemetryStat
            label="Redacted"
            value={`${packet.redactedFieldCount} fields`}
          />
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid gap-3 md:grid-cols-3">
          {packet.signals.map((signal) => (
            <SmartInstallTelemetrySignalCard key={signal.id} signal={signal} />
          ))}
        </div>

        <aside className="border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
          <p className="neo-copy flex items-center gap-2 text-[10px] font-black uppercase text-[#087d6d]">
            <ListChecks aria-hidden="true" className="h-4 w-4" />
            Review Steps
          </p>
          <p className="neo-copy mt-2 border-2 border-black bg-[#efe3cf] px-3 py-2 text-[9px] font-black uppercase leading-5 text-[#171411]">
            {packet.cachePolicy}
          </p>
          <div className="mt-3 grid gap-2">
            {packet.reviewSteps.map((step) => (
              <p
                className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[9px] font-black uppercase leading-5 text-[#171411]"
                key={step}
              >
                {step}
              </p>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function SmartInstallTelemetrySignalCard({
  signal,
}: {
  signal: SmartInstallProviderTelemetryDryRunSignal;
}) {
  return (
    <article className="border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy text-[9px] font-black uppercase tracking-[0.16em] text-[#5f574d]">
            {signal.provider}
          </p>
          <h4 className="mt-1 text-sm font-black uppercase leading-tight text-[#171411]">
            {signal.label}
          </h4>
        </div>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[8px] font-black uppercase text-[#171411]">
          TTL {signal.cacheTtlMinutes}m
        </span>
      </div>
      <p className="neo-copy mt-3 text-[10px] font-black uppercase leading-5 text-[#5f574d]">
        {signal.purpose}
      </p>
      <p className="neo-copy mt-3 break-all border-2 border-black bg-[#171411] px-2 py-2 text-[9px] font-black uppercase leading-5 text-[#fff9ed]">
        Redacted request: {signal.redactedRequest}
      </p>
      <p className="neo-copy mt-2 text-[9px] font-black uppercase leading-5 text-[#5f574d]">
        Response: {signal.responseShape}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {signal.signals.map((item) => (
          <span
            className="neo-copy border-2 border-black bg-[#efe3cf] px-2 py-1 text-[8px] font-black uppercase text-[#171411]"
            key={item}
          >
            {item}
          </span>
        ))}
      </div>
      <p className="neo-copy mt-3 border-2 border-black bg-[#efe3cf] px-2 py-1 text-[9px] font-black uppercase leading-4 text-[#171411]">
        Ranking input: {signal.rankingImpact}
      </p>
      <p className="neo-copy mt-2 text-[9px] font-black uppercase leading-5 text-[#5f574d]">
        Rate limit: {signal.rateLimit}
      </p>
      <p className="neo-copy mt-2 text-[9px] font-black uppercase leading-5 text-[#5f574d]">
        Blocks: {signal.blockedFields.join(", ")}
      </p>
    </article>
  );
}

function SmartInstallLocalMirrorAuditPanel({
  packet,
}: {
  packet: SmartInstallLocalMirrorAuditPacket;
}) {
  return (
    <div className="mt-4 border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-black pb-3">
        <div>
          <p className="neo-copy text-[9px] font-black uppercase tracking-[0.18em] text-[#b7102a]">
            No-Write Mirror Audit
          </p>
          <h3 className="neo-title mt-1 flex items-center gap-2 text-2xl uppercase text-[#171411]">
            <Gauge aria-hidden="true" className="h-6 w-6" />
            {packet.title}
          </h3>
          <p className="neo-copy mt-2 max-w-4xl text-[10px] font-black uppercase leading-5 text-[#5f574d]">
            Local samples compare source ranks without fetching provider telemetry, persisting
            rankings, or starting downloads.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[#171411] sm:grid-cols-4">
          <SmartInstallTelemetryStat label="Mode" value={packet.mode} />
          <SmartInstallTelemetryStat label="Writes" value={packet.writes} />
          <SmartInstallTelemetryStat label="Live Calls" value={packet.liveCalls} />
          <SmartInstallTelemetryStat label="TTL" value={`${packet.ttlMinutes}m`} />
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid gap-3">
          <div className="grid gap-2 md:grid-cols-3">
            <SmartInstallTelemetryStat label="Before" value={packet.recommendedBefore ?? "none"} />
            <SmartInstallTelemetryStat label="After" value={packet.recommendedAfter ?? "none"} />
            <SmartInstallTelemetryStat
              label="Stale"
              value={`${packet.staleCount}/${packet.samples.length}`}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {packet.samples.map((sample) => (
              <SmartInstallLocalMirrorSampleCard key={sample.candidateId} sample={sample} />
            ))}
          </div>

          <div className="grid gap-2">
            {packet.rankDiff.map((row) => (
              <article
                className="border-2 border-black bg-[#efe3cf] p-2 shadow-[2px_2px_0_#171411]"
                key={row.candidateId}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="neo-copy text-[8px] font-black uppercase tracking-[0.1em] text-[#171411]">
                    {row.label}
                  </p>
                  <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[8px] font-black uppercase text-[#171411]">
                    Rank {row.beforeRank} to {row.afterRank}
                  </span>
                </div>
                <div className="mt-2 grid gap-1 sm:grid-cols-3">
                  <MirrorAuditLine label="Score Delta" value={String(row.scoreDelta)} />
                  <MirrorAuditLine label="Speed Delta" value={`${row.speedDeltaMbps} Mbps`} />
                  <MirrorAuditLine label="After Score" value={String(row.afterScore)} />
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="border-2 border-black bg-[#171411] p-3 text-[#fff9ed] shadow-[3px_3px_0_#b7102a]">
          <p className="neo-copy flex items-center gap-2 text-[10px] font-black uppercase text-[#8cf5e4]">
            <ListChecks aria-hidden="true" className="h-4 w-4" />
            Audit Guard
          </p>
          <p className="neo-copy mt-2 border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] font-black uppercase leading-5">
            Fastest fixture: {packet.fastestCandidateId ?? "none"}
          </p>
          <div className="mt-3 grid gap-2">
            {packet.reviewSteps.map((step) => (
              <p
                className="neo-copy border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] font-black uppercase leading-5"
                key={step}
              >
                {step}
              </p>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function SmartInstallLocalMirrorSampleCard({
  sample,
}: {
  sample: SmartInstallLocalMirrorAuditSample;
}) {
  return (
    <article className="border-2 border-black bg-[#f5eedf] p-3 shadow-[2px_2px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy text-[9px] font-black uppercase tracking-[0.16em] text-[#5f574d]">
            {sample.provider}
          </p>
          <h4 className="mt-1 text-sm font-black uppercase leading-tight text-[#171411]">
            {sample.label}
          </h4>
        </div>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase text-[#171411]">
          {sample.status}
        </span>
      </div>
      <p className="neo-copy mt-3 border-2 border-black bg-[#171411] px-2 py-2 text-[9px] font-black uppercase leading-5 text-[#fff9ed] [overflow-wrap:anywhere]">
        {sample.redactedSource}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <MirrorAuditLine label="Observed" value={`${sample.observedMbps} Mbps`} />
        <MirrorAuditLine label="Cache Age" value={`${sample.cacheAgeMinutes}m`} />
      </div>
    </article>
  );
}

function MirrorAuditLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411] [overflow-wrap:anywhere]">
      {label}: {value}
    </p>
  );
}

function SmartInstallTelemetryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-black bg-[#fff9ed] px-3 py-2 shadow-[2px_2px_0_#171411]">
      <p className="neo-copy text-[8px] font-black uppercase text-[#5f574d]">{label}</p>
      <p className="neo-copy mt-1 text-[10px] font-black uppercase leading-4 text-[#171411]">
        {value}
      </p>
    </div>
  );
}

function statusClass(status: SmartInstallProviderTelemetryStatus) {
  if (status === "ready") return "bg-[#8cf5e4] text-[#171411]";
  if (status === "warning") return "bg-[#fff9ed] text-[#171411]";
  return "bg-[#efe3cf] text-[#171411]";
}
