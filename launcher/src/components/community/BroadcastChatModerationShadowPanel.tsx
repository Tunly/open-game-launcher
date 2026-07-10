import { EyeOff, MessageSquareWarning, ShieldAlert, ShieldCheck } from "lucide-react";

import type {
  BroadcastChatModerationQueueItem,
  BroadcastChatModerationSeverity,
  BroadcastChatModerationShadowQueue,
} from "../../lib/broadcast-chat-moderation-shadow";

export function BroadcastChatModerationShadowPanel({
  queue,
}: {
  queue: BroadcastChatModerationShadowQueue;
}) {
  return (
    <section
      aria-label="Broadcasting chat moderation shadow queue"
      className="neo-dots border-4 border-black bg-[#fff9ed] p-4 shadow-[6px_6px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-black pb-3">
        <div>
          <p className="neo-copy text-[10px] font-black tracking-[0.22em] text-[#b7102a] uppercase">
            Local Chat Moderation
          </p>
          <h2 className="neo-title mt-1 flex items-center gap-2 text-3xl text-[#171411] uppercase">
            <MessageSquareWarning aria-hidden="true" className="h-8 w-8" />
            Moderation Shadow Queue
          </h2>
          <p className="neo-copy mt-2 max-w-3xl text-xs leading-5 font-bold text-[#5f574d] uppercase">
            {queue.summary}
          </p>
        </div>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-3 py-2 text-[10px] font-black text-[#171411] uppercase shadow-[3px_3px_0_#171411]">
          {queue.statusLabel}
        </span>
      </div>

      <div className="mt-4 grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid items-start gap-3 md:grid-cols-3">
          <ShadowStat label="Shadow blocks" value={`${queue.blockCount}`} />
          <ShadowStat label="Review queue" value={`${queue.reviewCount}`} />
          <ShadowStat label="Allowed local" value={`${queue.allowCount}`} />
        </div>

        <div className="self-start border-2 border-black bg-[#171411] p-3 text-[#fff9ed] shadow-[3px_3px_0_#b7102a]">
          <p className="neo-copy flex items-center gap-2 text-[10px] font-black text-[#8cf5e4] uppercase">
            <EyeOff aria-hidden="true" className="h-4 w-4" />
            Shadow Guard
          </p>
          <p className="neo-copy mt-2 border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] leading-5 font-black uppercase">
            {queue.guardCopy}
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-4">
        {queue.queue.map((item) => (
          <ModerationQueueCard item={item} key={item.id} />
        ))}
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-4">
        {queue.guards.map((guard) => (
          <p
            className="neo-copy border-2 border-black bg-[#efe3cf] px-3 py-2 text-[9px] leading-5 font-black text-[#171411] uppercase shadow-[2px_2px_0_#171411]"
            key={guard}
          >
            {guard}
          </p>
        ))}
      </div>
    </section>
  );
}

function ShadowStat({ label, value }: { label: string; value: string }) {
  return (
    <article className="self-start border-2 border-black bg-[#efe3cf] p-3 shadow-[3px_3px_0_#171411]">
      <p className="neo-copy text-[9px] font-black tracking-[0.16em] text-[#b7102a] uppercase">
        {label}
      </p>
      <p className="neo-title mt-1 text-5xl leading-none text-[#171411]">{value}</p>
    </article>
  );
}

function ModerationQueueCard({ item }: { item: BroadcastChatModerationQueueItem }) {
  return (
    <article
      className={`min-h-[258px] border-2 border-black p-3 shadow-[3px_3px_0_#171411] ${severityClass(
        item.severity,
      )}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy text-[9px] font-black tracking-[0.16em] text-[#5f574d] uppercase">
            {item.channelLabel}
          </p>
          <h3 className="mt-1 text-lg leading-tight font-black text-[#171411] uppercase">
            @{item.authorHandle}
          </h3>
        </div>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black text-[#171411] uppercase">
          {item.severity}
        </span>
      </div>

      <p className="neo-copy mt-3 min-h-[54px] border-2 border-black bg-[#fff9ed] px-2 py-2 text-[10px] leading-5 font-black text-[#171411] uppercase">
        {item.messagePreview}
      </p>

      <p className="neo-copy mt-3 flex items-center gap-2 border-2 border-black bg-[#171411] px-2 py-2 text-[9px] leading-4 font-black text-[#fff9ed] uppercase">
        {item.severity === "allow" ? (
          <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-[#8cf5e4]" />
        ) : (
          <ShieldAlert aria-hidden="true" className="h-4 w-4 shrink-0 text-[#8cf5e4]" />
        )}
        {item.actionLabel}
      </p>

      <div className="mt-3 space-y-2">
        {item.ruleHits.map((hit) => (
          <div className="border-2 border-black bg-[#fff9ed] p-2" key={hit.id}>
            <p className="neo-copy text-[9px] font-black tracking-[0.14em] text-[#b7102a] uppercase">
              {hit.label}
            </p>
            <p className="neo-copy mt-1 text-[9px] leading-4 font-black text-[#5f574d] uppercase">
              {hit.detail}
            </p>
          </div>
        ))}
      </div>
    </article>
  );
}

function severityClass(severity: BroadcastChatModerationSeverity) {
  if (severity === "block") return "bg-[#efe3cf]";
  if (severity === "review") return "bg-[#fff9ed]";
  return "bg-[#8cf5e4]";
}
