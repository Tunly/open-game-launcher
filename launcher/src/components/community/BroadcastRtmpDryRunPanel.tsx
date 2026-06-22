import { FileKey2, RadioTower, ShieldCheck, Unplug } from "lucide-react";

import type {
  BroadcastRtmpDryRunCheck,
  BroadcastRtmpDryRunPacket,
  BroadcastRtmpDryRunStatus,
} from "../../lib/broadcast-rtmp-dry-run";

export function BroadcastRtmpDryRunPanel({ packet }: { packet: BroadcastRtmpDryRunPacket }) {
  const blockedCount = packet.checks.filter((check) => check.status === "blocked").length;

  return (
    <section
      aria-label="Broadcasting RTMP dry-run packet"
      className="neo-dots border-4 border-black bg-[#fff9ed] p-4 shadow-[6px_6px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-black pb-3">
        <div>
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.22em] text-[#b7102a]">
            Local Provider Packet
          </p>
          <h2 className="neo-title mt-1 flex items-center gap-2 text-3xl uppercase text-[#171411]">
            <RadioTower aria-hidden="true" className="h-8 w-8" />
            RTMP Dry-Run Packet
          </h2>
          <p className="neo-copy mt-2 max-w-3xl text-xs font-bold uppercase leading-5 text-[#5f574d]">
            {packet.summary}
          </p>
        </div>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-3 py-2 text-[10px] font-black uppercase text-[#171411] shadow-[3px_3px_0_#171411]">
          {blockedCount > 0 ? "Needs Review" : "Dry Run"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)_280px]">
        <div className="border-2 border-black bg-[#efe3cf] p-3 shadow-[3px_3px_0_#171411]">
          <p className="neo-copy text-[10px] font-black uppercase text-[#5f574d]">Packet ID</p>
          <p className="neo-copy mt-2 break-words border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black uppercase leading-5 text-[#171411]">
            {packet.packetId}
          </p>
          <div className="mt-3 grid gap-2">
            <PacketStat label="Provider" value={packet.provider} />
            <PacketStat label="Endpoint" value={packet.redactedIngestUrl} />
            <PacketStat label="Stream key" value={packet.keyHint} />
            <PacketStat
              label="Envelope"
              value={`${packet.resolution} // ${packet.bitrateKbps} kbps`}
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {packet.checks.map((check) => (
            <RtmpCheckCard check={check} key={check.id} />
          ))}
        </div>

        <div className="border-2 border-black bg-[#171411] p-3 text-[#fff9ed] shadow-[3px_3px_0_#b7102a]">
          <p className="neo-copy flex items-center gap-2 text-[10px] font-black uppercase text-[#8cf5e4]">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            Dry-Run Guard
          </p>
          <p className="neo-copy mt-2 border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] font-black uppercase leading-5">
            {packet.guardCopy}
          </p>
          <div className="mt-3 grid gap-2">
            {packet.guards.map((guard) => (
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
    </section>
  );
}

function PacketStat({ label, value }: { label: string; value: string }) {
  return (
    <article className="border-2 border-black bg-[#fff9ed] p-2 shadow-[2px_2px_0_#171411]">
      <p className="neo-copy text-[8px] font-black uppercase tracking-[0.14em] text-[#b7102a]">
        {label}
      </p>
      <p className="neo-copy mt-1 break-words text-[9px] font-black uppercase leading-4 text-[#171411]">
        {value}
      </p>
    </article>
  );
}

function RtmpCheckCard({ check }: { check: BroadcastRtmpDryRunCheck }) {
  return (
    <article
      className={`min-h-[138px] border-2 border-black p-3 shadow-[3px_3px_0_#171411] ${statusClass(
        check.status,
      )}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy text-[9px] font-black uppercase tracking-[0.16em] text-[#5f574d]">
            Audit Step
          </p>
          <h3 className="mt-1 flex items-center gap-1.5 text-base font-black uppercase leading-tight text-[#171411]">
            {check.id.includes("skip") ? (
              <Unplug aria-hidden="true" className="h-4 w-4 shrink-0" />
            ) : (
              <FileKey2 aria-hidden="true" className="h-4 w-4 shrink-0" />
            )}
            <span>{check.label}</span>
          </h3>
        </div>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase text-[#171411]">
          {check.status}
        </span>
      </div>
      <p className="neo-copy mt-3 text-[10px] font-black uppercase leading-5 text-[#5f574d]">
        {check.detail}
      </p>
    </article>
  );
}

function statusClass(status: BroadcastRtmpDryRunStatus) {
  if (status === "review") return "bg-[#8cf5e4] text-[#171411]";
  return "bg-[#efe3cf] text-[#171411]";
}
