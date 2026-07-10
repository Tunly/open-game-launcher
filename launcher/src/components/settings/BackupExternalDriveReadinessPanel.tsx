import { ArchiveRestore, HardDrive, ShieldCheck } from "lucide-react";

import type {
  BackupExternalDriveGate,
  BackupExternalDriveReadiness,
  BackupExternalDriveStatus,
} from "../../lib/backup-external-drive-readiness";

export function BackupExternalDriveReadinessPanel({
  readiness,
}: {
  readiness: BackupExternalDriveReadiness;
}) {
  const tone =
    readiness.blockedCount > 0 ? "blocked" : readiness.warningCount > 0 ? "warning" : "ready";

  return (
    <section
      aria-label="Backup external drive readiness"
      className="neo-dots border-[3px] border-black bg-[#fbf4e7] shadow-[3px_3px_0_#171411]"
    >
      <div className="border-b-2 border-black bg-[#171411] px-3 py-2 text-[#fbf4e7]">
        <p className="neo-copy text-[9px] font-black tracking-[0.16em] text-[#8cf5e4] uppercase">
          Removable Drive E2E
        </p>
        <h3 className="mt-1 flex items-center gap-2 text-xl leading-none font-black uppercase">
          <HardDrive aria-hidden="true" className="h-5 w-5" />
          External Drive Backup Readiness
        </h3>
      </div>

      <div className="space-y-3 p-3">
        <div className="border-2 border-black bg-[#efe6d4] p-3 shadow-[2px_2px_0_#171411]">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="neo-copy text-[9px] font-black text-[#55504a] uppercase">
                {readiness.statusLabel}
              </p>
              <p className="neo-title mt-1 text-4xl leading-none text-[#171411] uppercase">
                {readiness.readyCount}/{readiness.gates.length}
              </p>
            </div>
            <span
              className={`neo-copy border-2 border-black px-2 py-1 text-[8px] font-black uppercase shadow-[1px_1px_0_#171411] ${statusClass(
                tone,
              )}`}
            >
              {readiness.progress}%
            </span>
          </div>
          <p className="neo-copy mt-2 text-[10px] leading-5 font-black text-[#55504a] uppercase">
            {readiness.summary}
          </p>
          <p className="neo-copy mt-2 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] leading-4 font-black text-[#171411] uppercase">
            Next: {readiness.nextAction}
          </p>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          {readiness.gates.map((gate) => (
            <BackupExternalDriveGateCard gate={gate} key={gate.id} />
          ))}
        </div>

        {readiness.removableMediaWriteProof ? (
          <div className="border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]">
            <p className="neo-copy flex items-center gap-2 text-[10px] font-black text-[#087d6d] uppercase">
              <HardDrive aria-hidden="true" className="h-4 w-4" />
              Sentinel Write Proof
            </p>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              <ProofStat label="Proof ID" value={readiness.removableMediaWriteProof.proofId} />
              <ProofStat
                label="Bytes Written"
                value={String(readiness.removableMediaWriteProof.bytesWritten)}
              />
              <ProofStat
                label="Bytes Read"
                value={String(readiness.removableMediaWriteProof.bytesRead)}
              />
              <ProofStat
                label="Checksum"
                value={readiness.removableMediaWriteProof.checksumMatched ? "Matched" : "Review"}
              />
              <ProofStat
                label="Cleanup"
                value={readiness.removableMediaWriteProof.cleanupDeleted ? "Deleted" : "Review"}
              />
              <ProofStat label="Verified" value={readiness.removableMediaWriteProof.verifiedAt} />
              <ProofStat label="Target" value={readiness.removableMediaWriteProof.targetPath} />
              <ProofStat
                label="Mount"
                value={readiness.detectedTarget?.mountPoint ?? "Unmatched"}
              />
              <ProofStat
                label="Filesystem"
                value={readiness.detectedTarget?.fileSystem ?? "Unknown"}
              />
              <ProofStat
                label="Removable"
                value={readiness.detectedTarget?.isRemovable ? "Yes" : "No"}
              />
              <ProofStat
                label="Read-only"
                value={readiness.detectedTarget?.isReadOnly ? "Yes" : "No"}
              />
              <ProofStat
                label="Eject"
                value={
                  readiness.removableMediaOsEject
                    ? "Unmounted"
                    : readiness.removableMediaEjectProof
                      ? "Preflight OK"
                      : "Manual Review"
                }
              />
            </div>
            <p className="neo-copy mt-2 border-2 border-black bg-[#efe6d4] px-2 py-1 text-[8px] leading-4 font-black break-words text-[#171411] uppercase">
              SHA-256: {readiness.removableMediaWriteProof.sha256}
            </p>
            <p className="neo-copy mt-2 border-2 border-black bg-[#efe6d4] px-2 py-1 text-[8px] leading-4 font-black break-words text-[#171411] uppercase">
              Proof file: {readiness.removableMediaWriteProof.proofPath}
            </p>
          </div>
        ) : null}

        {readiness.removableMediaEjectProof ? (
          <div className="border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]">
            <p className="neo-copy flex items-center gap-2 text-[10px] font-black text-[#087d6d] uppercase">
              <ArchiveRestore aria-hidden="true" className="h-4 w-4" />
              Eject-Safety Proof
            </p>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              <ProofStat label="Proof ID" value={readiness.removableMediaEjectProof.proofId} />
              <ProofStat
                label="Bytes Written"
                value={String(readiness.removableMediaEjectProof.bytesWritten)}
              />
              <ProofStat
                label="Bytes Read"
                value={String(readiness.removableMediaEjectProof.bytesRead)}
              />
              <ProofStat
                label="File Sync"
                value={readiness.removableMediaEjectProof.syncCompleted ? "Synced" : "Review"}
              />
              <ProofStat
                label="Dir Sync"
                value={
                  readiness.removableMediaEjectProof.directorySyncSupported
                    ? readiness.removableMediaEjectProof.directorySyncCompleted
                      ? "Synced"
                      : "Review"
                    : "Unsupported"
                }
              />
              <ProofStat
                label="Cleanup"
                value={readiness.removableMediaEjectProof.cleanupDeleted ? "Deleted" : "Review"}
              />
              <ProofStat
                label="Pending"
                value={String(readiness.removableMediaEjectProof.pendingProofFiles.length)}
              />
              <ProofStat
                label="OS Eject"
                value={
                  readiness.removableMediaEjectProof.readyForOsEject ? "Manual Next" : "Review"
                }
              />
              <ProofStat label="Verified" value={readiness.removableMediaEjectProof.verifiedAt} />
            </div>
            <p className="neo-copy mt-2 border-2 border-black bg-[#efe6d4] px-2 py-1 text-[8px] leading-4 font-black break-words text-[#171411] uppercase">
              SHA-256: {readiness.removableMediaEjectProof.sha256}
            </p>
            <p className="neo-copy mt-2 border-2 border-black bg-[#efe6d4] px-2 py-1 text-[8px] leading-4 font-black break-words text-[#171411] uppercase">
              Proof file: {readiness.removableMediaEjectProof.proofPath}
            </p>
            <p className="neo-copy mt-2 border-2 border-black bg-[#efe6d4] px-2 py-1 text-[8px] leading-4 font-black text-[#171411] uppercase">
              Next: {readiness.removableMediaEjectProof.recommendedNextStep}
            </p>
          </div>
        ) : null}

        {readiness.removableMediaOsEject ? (
          <div className="border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]">
            <p className="neo-copy flex items-center gap-2 text-[10px] font-black text-[#087d6d] uppercase">
              <ArchiveRestore aria-hidden="true" className="h-4 w-4" />
              OS Eject / Unmount
            </p>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              <ProofStat label="Command" value={readiness.removableMediaOsEject.commandLabel} />
              <ProofStat label="Platform" value={readiness.removableMediaOsEject.platform} />
              <ProofStat label="Mount" value={readiness.removableMediaOsEject.mountPoint} />
              <ProofStat
                label="Unmounted"
                value={readiness.removableMediaOsEject.unmounted ? "Yes" : "Review"}
              />
              <ProofStat
                label="Preflight"
                value={readiness.removableMediaOsEject.preflightProofId}
              />
              <ProofStat
                label="Final Preflight"
                value={readiness.removableMediaOsEject.finalPreflightProofId}
              />
              <ProofStat label="Verified" value={readiness.removableMediaOsEject.verifiedAt} />
            </div>
            <p className="neo-copy mt-2 border-2 border-black bg-[#efe6d4] px-2 py-1 text-[8px] leading-4 font-black text-[#171411] uppercase">
              Next: {readiness.removableMediaOsEject.recommendedNextStep}
            </p>
          </div>
        ) : null}

        <div className="border-2 border-black bg-[#171411] p-3 text-[#fbf4e7] shadow-[2px_2px_0_#b7102a]">
          <p className="neo-copy flex items-center gap-2 text-[10px] font-black text-[#8cf5e4] uppercase">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            External-Drive Guard
          </p>
          <p className="neo-copy mt-2 border-2 border-[#fbf4e7] bg-[#2a221b] px-2 py-1 text-[9px] leading-4 font-black uppercase">
            {readiness.guardCopy}
          </p>
          <div className="mt-2 grid gap-1.5 md:grid-cols-2">
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

function ProofStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-2 border-black bg-[#efe6d4] px-2 py-1 shadow-[1px_1px_0_#171411]">
      <p className="neo-copy text-[8px] font-black text-[#55504a] uppercase">{label}</p>
      <p className="neo-copy mt-1 truncate text-[10px] font-black text-[#171411] uppercase">
        {value}
      </p>
    </div>
  );
}

function BackupExternalDriveGateCard({ gate }: { gate: BackupExternalDriveGate }) {
  return (
    <article
      className={`min-h-[160px] border-2 border-black p-2 shadow-[2px_2px_0_#171411] ${statusClass(
        gate.status,
      )}`}
    >
      <p className="neo-copy text-[8px] font-black tracking-[0.12em] text-[#55504a] uppercase">
        Backup Gate
      </p>
      <h4 className="mt-1 flex items-center gap-1.5 text-sm leading-tight font-black text-[#171411] uppercase">
        <ArchiveRestore aria-hidden="true" className="h-4 w-4 shrink-0" />
        {gate.label}
      </h4>
      <span className="neo-copy mt-2 inline-block border-2 border-black bg-[#fff9ed] px-1.5 py-0.5 text-[8px] font-black text-[#171411] uppercase">
        {gate.status}
      </span>
      <p className="neo-copy mt-2 text-[8px] leading-4 font-black text-[#55504a] uppercase">
        {gate.detail}
      </p>
      <p className="neo-copy mt-2 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] leading-4 font-black text-[#171411] uppercase">
        {gate.action}
      </p>
    </article>
  );
}

function statusClass(status: BackupExternalDriveStatus) {
  if (status === "ready") return "bg-[#8cf5e4] text-[#171411]";
  if (status === "warning") return "bg-[#fff9ed] text-[#171411]";
  return "bg-[#efe6d4] text-[#171411]";
}
