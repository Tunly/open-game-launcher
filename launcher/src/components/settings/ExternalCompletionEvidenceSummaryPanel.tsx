import { ClipboardList, FileWarning, ListChecks, ShieldCheck, Terminal } from "lucide-react";

import type {
  ExternalCompletionEvidenceArtifactProofSummary,
  ExternalCompletionEvidenceGate,
  ExternalCompletionEvidenceStatus,
  ExternalCompletionEvidenceSummary,
} from "../../lib/external-completion-evidence-summary";

const evidencePacketPassGuardrails = [
  "External proof stays attached by reference",
  "Live credentials stay redacted outside the UI",
  "Completion gate remains the release boundary",
  "Packet evidence stays reviewable by operators",
] as const;

export function ExternalCompletionEvidenceSummaryPanel({
  summary,
}: {
  summary: ExternalCompletionEvidenceSummary;
}) {
  const packetPasses = summary.statusLabel === "Evidence Packet Pass";
  const guardClaims = packetPasses ? evidencePacketPassGuardrails : summary.blockedClaims;

  return (
    <section
      aria-label="External completion evidence summary"
      className="neo-dots mb-6 border-4 border-black bg-[#fff9ed] p-4 shadow-[6px_6px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-black pb-3">
        <div className="min-w-0">
          <p className="neo-copy text-[10px] font-black tracking-[0.22em] text-[#b7102a] uppercase">
            Release Evidence Gate
          </p>
          <h2 className="neo-title mt-1 flex flex-wrap items-center gap-2 text-3xl leading-none text-[#171411] uppercase">
            <FileWarning aria-hidden="true" className="h-8 w-8 shrink-0" />
            External Completion Evidence
          </h2>
          <p className="neo-copy mt-2 max-w-3xl text-xs leading-5 font-bold text-[#5f574d] uppercase">
            {summary.summary}
          </p>
        </div>
        <span
          className={`neo-copy border-2 border-black px-3 py-2 text-[10px] font-black whitespace-nowrap uppercase shadow-[3px_3px_0_#171411] ${statusClass(
            summary.passCount === summary.totalCount ? "pass" : "blocked",
          )}`}
        >
          {summary.statusLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="grid gap-3">
          <div className="border-2 border-black bg-[#efe3cf] p-3 shadow-[3px_3px_0_#171411]">
            <p className="neo-copy flex items-center gap-2 text-[10px] font-black text-[#5f574d] uppercase">
              <ClipboardList aria-hidden="true" className="h-4 w-4" />
              Evidence Packet
            </p>
            <div className="mt-3 grid gap-2">
              <EvidenceStat label="Packet" value={summary.packetId} />
              <EvidenceStat label="Created" value={summary.createdAt} />
              <EvidenceStat label="Total Gates" value={`${summary.totalCount}`} />
              <EvidenceStat label="Pass" value={`${summary.passCount}`} />
              <EvidenceStat label="Review" value={`${summary.reviewCount}`} />
              <EvidenceStat label="Blocked" value={`${summary.blockedCount}`} />
              <EvidenceStat label="Warnings" value={`${summary.warningCount}`} />
            </div>
          </div>
          <ReleaseBoundaryCommands commands={summary.releaseBoundaryCommands} />
          <CommittedArtifactSnapshot summary={summary} />
        </div>

        <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
          {summary.gates.map((gate) => (
            <EvidenceGateCard gate={gate} key={gate.id} />
          ))}
        </div>

        <div className="border-2 border-black bg-[#171411] p-3 text-[#fff9ed] shadow-[3px_3px_0_#b7102a] lg:col-span-2">
          <p className="neo-copy flex items-center gap-2 text-[10px] font-black text-[#8cf5e4] uppercase">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            {packetPasses ? "Evidence Packet Guard" : "No-Write Completion Guard"}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {guardClaims.map((claim) => (
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

function CommittedArtifactSnapshot({ summary }: { summary: ExternalCompletionEvidenceSummary }) {
  const artifacts = summary.gates.flatMap((gate) =>
    gate.artifactProofs.map((artifact) => ({
      artifact,
      gateLabel: gate.label,
    })),
  );
  const readableCount = artifacts.filter(({ artifact }) => artifact.readable).length;
  const readyCount = artifacts.filter(({ artifact }) => artifact.status === "pass").length;
  const missingProofCount = artifacts.reduce(
    (total, { artifact }) => total + artifact.missingProofs.length,
    0,
  );
  const missingDetailCount = artifacts.reduce(
    (total, { artifact }) => total + artifact.missingEvidenceDetails.length,
    0,
  );

  return (
    <div
      aria-label="Committed external artifact snapshot"
      className="border-2 border-black bg-[#efe3cf] p-3 shadow-[3px_3px_0_#171411]"
      role="group"
    >
      <p className="neo-copy flex items-center gap-2 text-[10px] font-black text-[#5f574d] uppercase">
        <FileWarning aria-hidden="true" className="h-4 w-4" />
        Committed Artifact Snapshot
      </p>
      <div className="mt-3 grid gap-2">
        <EvidenceStat label="Readable" value={`${readableCount}/${artifacts.length}`} />
        <EvidenceStat label="Artifact Ready" value={`${readyCount}/${artifacts.length}`} />
        <EvidenceStat label="Proof Rows Missing" value={`${missingProofCount}`} />
        <EvidenceStat label="Details Missing" value={`${missingDetailCount}`} />
      </div>
      <div className="mt-3 grid gap-2">
        {artifacts.map(({ artifact, gateLabel }) => (
          <article
            aria-label={`${gateLabel} artifact ${artifact.path}`}
            className="border-2 border-black bg-[#fff9ed] p-2 shadow-[2px_2px_0_#171411]"
            key={artifact.path}
          >
            <p className="neo-copy text-[8px] font-black tracking-[0.14em] text-[#b7102a] uppercase">
              {gateLabel}
            </p>
            <p className="neo-copy mt-1 text-[8px] leading-4 font-black break-all text-[#171411] uppercase">
              {artifact.path}
            </p>
            <dl className="mt-2 grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,6rem),1fr))] gap-1">
              <EvidenceDatum label="Readable" value={artifact.readable ? "Yes" : "No"} />
              <EvidenceDatum
                label="State"
                value={artifact.readable ? artifact.status : "Unreadable"}
              />
              <EvidenceDatum label="Proofs" value={`${artifact.missingProofs.length} Missing`} />
              <EvidenceDatum
                label="Details"
                value={`${artifact.missingEvidenceDetails.length} Missing`}
              />
            </dl>
          </article>
        ))}
      </div>
      <p className="neo-copy mt-3 border-2 border-black bg-[#171411] px-2 py-1 text-[8px] leading-4 font-black text-[#fff9ed] uppercase">
        Sanitized committed snapshot only. Readable template paths reduce operator ambiguity, but
        unchecked proof rows and missing detail fields still block every external gate.
      </p>
    </div>
  );
}

function ReleaseBoundaryCommands({ commands }: { commands: string[] }) {
  return (
    <div
      aria-label="Release boundary commands"
      className="border-2 border-black bg-[#171411] p-3 text-[#fff9ed] shadow-[3px_3px_0_#007166]"
      role="group"
    >
      <p className="neo-copy flex items-center gap-2 text-[10px] font-black text-[#8cf5e4] uppercase">
        <Terminal aria-hidden="true" className="h-4 w-4" />
        Release Boundary Commands
      </p>
      <ul className="mt-3 grid gap-2">
        {commands.map((command) => (
          <li
            className="neo-copy border-2 border-[#fff9ed] bg-[#2a221b] px-2 py-1 text-[8px] leading-4 font-black break-all text-[#fff9ed] uppercase"
            key={command}
          >
            <code className="normal-case">{command}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EvidenceStat({ label, value }: { label: string; value: string }) {
  return (
    <article
      aria-label={`${label}: ${value}`}
      className="border-2 border-black bg-[#fff9ed] p-2 shadow-[2px_2px_0_#171411]"
    >
      <p className="neo-copy text-[8px] font-black tracking-[0.14em] text-[#b7102a] uppercase">
        {label}
      </p>
      <p className="neo-copy mt-1 text-[9px] leading-4 font-black break-words text-[#171411] uppercase">
        {value}
      </p>
    </article>
  );
}

function EvidenceGateCard({ gate }: { gate: ExternalCompletionEvidenceGate }) {
  return (
    <article
      aria-label={`${gate.label} external evidence gate`}
      className={`border-2 border-black p-3 shadow-[3px_3px_0_#171411] ${statusClass(gate.status)}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy text-[9px] font-black tracking-[0.16em] text-[#5f574d] uppercase">
            {gate.surface}
          </p>
          <h3 className="neo-title mt-1 text-base leading-tight text-[#171411] uppercase">
            {gate.label}
          </h3>
        </div>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black whitespace-nowrap text-[#171411] uppercase">
          {gate.status}
        </span>
      </div>

      <dl className="mt-3 grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,10.5rem),1fr))] gap-2">
        <EvidenceDatum label="Env" value={`${gate.missingEnvCount} Missing`} />
        <EvidenceDatum label="Artifacts" value={`${gate.missingArtifactCount} Missing`} />
        <EvidenceDatum label="Unreadable" value={`${gate.unreadableArtifactCount} Blocked`} />
        <EvidenceDatum label="Proof Rows" value={`${gate.missingProofCount} Missing`} />
        <EvidenceDatum
          label="Artifact Proofs"
          value={`${gate.missingArtifactProofCount} Missing`}
        />
        <EvidenceDatum label="Evidence For" value={`${gate.missingProofEvidenceCount} Missing`} />
        <EvidenceDatum label="Details" value={`${gate.missingEvidenceDetailCount} Missing`} />
        <EvidenceDatum label="Secret Scan" value={gateSecretScanValue(gate)} />
        <EvidenceDatum
          label="Template"
          value={
            gate.templateOnlyFindingCount > 0
              ? `${gate.templateOnlyFindingCount} Blocked`
              : "Cleared"
          }
        />
      </dl>

      {gate.blockers.length > 0 || gate.warnings.length > 0 ? (
        <div className="mt-2 border-2 border-black bg-[#fff9ed] px-2 py-1">
          <p className="neo-copy text-[8px] font-black text-[#b7102a] uppercase">
            CLI-Style Blockers
          </p>
          {gate.blockers.length > 0 ? (
            <ul className="mt-1 grid gap-1">
              {gate.blockers.map((blocker) => (
                <li
                  className="neo-copy border-2 border-black bg-[#b7102a] px-2 py-1 text-[8px] leading-4 font-black text-white uppercase"
                  key={blocker}
                >
                  {blocker}
                </li>
              ))}
            </ul>
          ) : null}
          {gate.warnings.length > 0 ? (
            <ul className="mt-1 grid gap-1">
              {gate.warnings.map((warning) => (
                <li
                  className="neo-copy border-2 border-black bg-[#f5eedf] px-2 py-1 text-[8px] leading-4 font-black text-[#171411] uppercase"
                  key={warning}
                >
                  {warning}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div
        aria-label={`${gate.label} next operator action`}
        className="mt-2 border-2 border-black bg-[#171411] px-2 py-1 text-[#fff9ed] shadow-[2px_2px_0_#007166]"
      >
        <p className="neo-copy flex items-center gap-2 text-[8px] font-black text-[#8cf5e4] uppercase">
          <ListChecks aria-hidden="true" className="h-3.5 w-3.5" />
          Next Operator Action
        </p>
        <p className="neo-copy mt-1 text-[8px] leading-4 font-black break-words uppercase">
          {gate.nextAction}
        </p>
      </div>

      <div className="mt-2 border-2 border-black bg-[#efe3cf] px-2 py-1">
        <p className="neo-copy text-[8px] font-black text-[#b7102a] uppercase">Operator Commands</p>
        <ul className="mt-1 grid gap-1">
          {gate.recommendedCommands.map((command) => (
            <li
              className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] leading-4 font-black break-all text-[#171411] uppercase"
              key={command}
            >
              <code className="normal-case">{command}</code>
            </li>
          ))}
        </ul>
      </div>

      <p className="neo-copy mt-3 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] leading-4 font-black text-[#171411] uppercase">
        {gate.localEvidence}
      </p>

      <div className="mt-2 border-2 border-black bg-[#fff9ed] px-2 py-1">
        <p className="neo-copy text-[8px] font-black text-[#b7102a] uppercase">Env Names</p>
        {gate.requiredEnv.length > 0 ? (
          <ul className="mt-1 grid gap-1">
            {gate.requiredEnv.map((name) => (
              <li
                className="neo-copy text-[8px] leading-4 font-black break-all text-[#171411] uppercase"
                key={name}
              >
                {name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="neo-copy mt-1 text-[8px] leading-4 font-black text-[#171411] uppercase">
            None
          </p>
        )}
      </div>

      <div className="mt-2 border-2 border-black bg-[#fff9ed] px-2 py-1">
        <p className="neo-copy text-[8px] font-black text-[#b7102a] uppercase">Artifacts</p>
        <ul className="mt-1 grid gap-1">
          {gate.artifactPaths.map((path) => (
            <li
              className="neo-copy text-[8px] leading-4 font-black break-all text-[#171411] uppercase"
              key={path}
            >
              {path}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-2 border-2 border-black bg-[#fff9ed] px-2 py-1">
        <p className="neo-copy text-[8px] font-black text-[#b7102a] uppercase">
          Artifact Proof Map
        </p>
        <div className="mt-1 grid gap-2">
          {gate.artifactProofs.map((artifact) => (
            <ArtifactProofMap artifact={artifact} key={artifact.path} />
          ))}
        </div>
      </div>

      <div className="mt-2 border-2 border-black bg-[#171411] px-2 py-1 text-[#fff9ed]">
        <p className="neo-copy text-[8px] font-black text-[#8cf5e4] uppercase">Required Proof</p>
        <ul className="mt-1 grid gap-1">
          {gate.proofRequirements.map((proof) => (
            <li className="neo-copy text-[8px] leading-4 font-black uppercase" key={proof}>
              {proof}
            </li>
          ))}
        </ul>
      </div>

      <p className="neo-copy mt-2 border-2 border-black bg-[#b7102a] px-2 py-1 text-[8px] leading-4 font-black break-words text-white uppercase">
        {gate.skippedProof}
      </p>
    </article>
  );
}

function ArtifactProofMap({
  artifact,
}: {
  artifact: ExternalCompletionEvidenceArtifactProofSummary;
}) {
  return (
    <article className="border-2 border-black bg-[#f5eedf] p-2 shadow-[2px_2px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="neo-copy min-w-0 text-[8px] leading-4 font-black break-all text-[#171411] uppercase">
          {artifact.path}
        </p>
        <span
          className={`neo-copy border-2 border-black px-2 py-1 text-[7px] font-black whitespace-nowrap uppercase shadow-[2px_2px_0_#171411] ${statusClass(
            artifact.status,
          )}`}
        >
          {artifact.readable ? artifact.status : "unreadable"}
        </span>
      </div>

      <dl className="mt-2 grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,7rem),1fr))] gap-1">
        <EvidenceDatum label="Readable" value={artifact.readable ? "Yes" : "No"} />
        <EvidenceDatum label="Checked" value={`${artifact.checkedProofCount}`} />
        <EvidenceDatum label="Missing" value={`${artifact.missingProofs.length}`} />
      </dl>

      <ul className="mt-2 grid gap-1">
        {artifact.requiredProofs.map((proof) => {
          const missingRow = artifact.missingProofs.includes(proof);
          const missingMapping = artifact.missingProofEvidenceMappings.some(
            (item) => item.proof === proof,
          );

          return (
            <li
              className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] leading-4 font-black text-[#171411] uppercase"
              key={proof}
            >
              <span className="block break-words">{proof}</span>
              <span className="mt-1 inline-flex border-2 border-black bg-[#efe3cf] px-2 py-0.5 text-[7px] font-black text-[#b7102a] uppercase">
                {missingRow
                  ? "Missing checked row"
                  : missingMapping
                    ? "Missing Evidence for mapping"
                    : "Checked and mapped"}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="neo-copy mt-2 border-2 border-black bg-[#171411] px-2 py-1 text-[8px] leading-4 font-black break-words text-[#fff9ed] uppercase">
        Evidence Details:{" "}
        {!artifact.readable
          ? "Not checked until artifact is readable"
          : artifact.missingEvidenceDetails.length > 0
            ? artifact.missingEvidenceDetails.map((detail) => detail.field).join(" / ")
            : "Complete"}
      </p>
      <p className="neo-copy mt-1 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] leading-4 font-black break-words text-[#171411] uppercase">
        Secret Scan:{" "}
        {!artifact.readable
          ? "Not checked until artifact is readable"
          : artifact.secretFindingLabels.length > 0
            ? artifact.secretFindingLabels.join(" / ")
            : "Clean; no raw secrets rendered"}
      </p>
    </article>
  );
}

function EvidenceDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-2 border-black bg-[#fff9ed] px-2 py-1">
      <dt className="neo-copy text-[8px] font-black whitespace-nowrap text-[#b7102a] uppercase">
        {label}
      </dt>
      <dd className="neo-copy text-[8px] leading-4 font-black whitespace-nowrap text-[#171411] uppercase">
        {value}
      </dd>
    </div>
  );
}

function gateSecretScanValue(gate: ExternalCompletionEvidenceGate) {
  const unscannedArtifactCount = gate.missingArtifactCount + gate.unreadableArtifactCount;
  if (unscannedArtifactCount > 0) {
    return `Not checked: ${unscannedArtifactCount} missing/unreadable`;
  }
  if (gate.secretFindingCount > 0) return `${gate.secretFindingCount} Blocked`;
  return "Clean";
}

function statusClass(status: ExternalCompletionEvidenceStatus) {
  if (status === "pass") return "bg-[#8cf5e4] text-[#171411]";
  if (status === "blocked") return "bg-[#b7102a] text-white";
  return "bg-[#f5eedf] text-[#171411]";
}
