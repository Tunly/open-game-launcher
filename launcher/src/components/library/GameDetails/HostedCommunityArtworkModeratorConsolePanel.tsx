import { Check, ClipboardList, RotateCcw, ShieldCheck, X } from "lucide-react";
import { useMemo, useState } from "react";

import { getGameAssetUrl } from "../../../lib/assets";
import {
  applyHostedCommunityArtworkReviewPreview,
  type HostedCommunityArtworkModerationConsole,
} from "../../../lib/hosted-community-artwork-moderation-console";

export function HostedCommunityArtworkModeratorConsolePanel({
  initialConsole,
}: {
  initialConsole: HostedCommunityArtworkModerationConsole;
}) {
  const [consoleState, setConsoleState] = useState(initialConsole);
  const [reviewReason, setReviewReason] = useState("Local review preview.");
  const [selectedArtworkId, setSelectedArtworkId] = useState(
    initialConsole.queueItems[0]?.id ?? null,
  );
  const selectedItem = useMemo(
    () => consoleState.queueItems.find((item) => item.id === selectedArtworkId) ?? null,
    [consoleState.queueItems, selectedArtworkId],
  );

  function applyReview(decision: "approve" | "pending" | "reject") {
    if (!selectedItem) return;

    setConsoleState((current) =>
      applyHostedCommunityArtworkReviewPreview(current, selectedItem.id, decision, reviewReason),
    );
  }

  return (
    <section
      aria-label="Hosted community artwork moderator console"
      className="neo-dots border-4 border-black bg-[#fbf4e7] shadow-[3px_3px_0_#171411]"
    >
      <div className="border-b-2 border-black bg-[#171411] px-3 py-2 text-[#fbf4e7]">
        <p className="neo-copy text-[9px] font-black tracking-[0.14em] text-[#8cf5e4] uppercase">
          {consoleState.modeLabel}
        </p>
        <h2 className="mt-1 flex items-center gap-2 text-[15px] leading-none font-black uppercase">
          <ShieldCheck aria-hidden="true" className="h-4 w-4" />
          Moderator Console
        </h2>
      </div>

      <div className="space-y-3 p-3">
        <div className="border-2 border-black bg-[#efe3cf] p-2 shadow-[2px_2px_0_#171411]">
          <p className="neo-copy text-[8px] font-black text-[#5b403f] uppercase">
            {consoleState.statusLabel}
          </p>
          <p className="neo-copy mt-2 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] leading-4 font-black text-[#171411] uppercase">
            {consoleState.guardCopy}
          </p>
        </div>

        <div className="grid gap-2">
          {consoleState.queueItems.map((item) => {
            const selected = item.id === selectedArtworkId;

            return (
              <button
                aria-pressed={selected}
                className={`grid min-w-0 grid-cols-[48px_minmax(0,1fr)] gap-2 border-2 border-black p-2 text-left shadow-[2px_2px_0_#171411] ${
                  selected ? "bg-[#8cf5e4]" : "bg-[#fff9ed]"
                }`}
                key={item.id}
                type="button"
                onClick={() => setSelectedArtworkId(item.id)}
              >
                <span className="h-12 w-12 overflow-hidden border-2 border-black bg-[#ded3c1]">
                  <img
                    alt=""
                    className="h-full w-full object-cover"
                    src={getGameAssetUrl(item.url)}
                  />
                </span>
                <span className="min-w-0">
                  <span className="neo-copy block text-[8px] font-black text-[#b7102a] uppercase">
                    {item.moderationStatus} / {item.reportCount} Reports
                  </span>
                  <span className="block truncate text-[10px] font-black text-[#171411] uppercase">
                    {item.title}
                  </span>
                  <span className="neo-copy block truncate text-[8px] font-black text-[#655f58] uppercase">
                    {item.kind} - {item.artist}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {selectedItem ? (
          <div className="border-2 border-black bg-[#fff9ed] p-2 shadow-[2px_2px_0_#171411]">
            <p className="neo-copy text-[8px] font-black text-[#5b403f] uppercase">Review Packet</p>
            <h3 className="mt-1 text-[13px] leading-none font-black text-[#171411] uppercase">
              {selectedItem.title}
            </h3>
            <p className="neo-copy mt-2 text-[8px] leading-4 font-black text-[#655f58] uppercase">
              {selectedItem.moderationReason ??
                selectedItem.lastReportReason ??
                "Awaiting first moderator decision."}
            </p>
            <textarea
              aria-label="Hosted artwork review note"
              className="neo-copy mt-2 min-h-16 w-full resize-none border-2 border-black bg-[#f4ead8] px-2 py-1 text-[9px] font-bold outline-none"
              maxLength={1000}
              value={reviewReason}
              onChange={(event) => setReviewReason(event.target.value)}
            />
            <div className="mt-2 grid grid-cols-3 gap-1">
              <button
                className="inline-flex h-8 items-center justify-center gap-1 border-2 border-black bg-[#087d6d] px-1 text-[8px] font-black text-white uppercase shadow-[1px_1px_0_#171411]"
                type="button"
                onClick={() => applyReview("approve")}
              >
                <Check className="h-3 w-3" />
                Approve
              </button>
              <button
                className="inline-flex h-8 items-center justify-center gap-1 border-2 border-black bg-[#efe3cf] px-1 text-[8px] font-black text-[#171411] uppercase shadow-[1px_1px_0_#171411]"
                type="button"
                onClick={() => applyReview("pending")}
              >
                <RotateCcw className="h-3 w-3" />
                Pending
              </button>
              <button
                className="inline-flex h-8 items-center justify-center gap-1 border-2 border-black bg-[#b7102a] px-1 text-[8px] font-black text-white uppercase shadow-[1px_1px_0_#171411]"
                type="button"
                onClick={() => applyReview("reject")}
              >
                <X className="h-3 w-3" />
                Reject
              </button>
            </div>
          </div>
        ) : null}

        <section
          aria-label="Hosted community artwork audit ledger"
          className="border-2 border-black bg-[#171411] p-2 text-[#fbf4e7] shadow-[2px_2px_0_#b7102a]"
        >
          <p className="neo-copy flex items-center gap-2 text-[9px] font-black text-[#8cf5e4] uppercase">
            <ClipboardList aria-hidden="true" className="h-4 w-4" />
            Audit Ledger
          </p>
          <div className="mt-2 grid gap-1.5">
            {consoleState.auditEntries.slice(0, 5).map((entry) => (
              <article
                className="border-2 border-[#fbf4e7] bg-[#2a221b] px-2 py-1 text-[8px] leading-4 font-black uppercase"
                key={entry.id}
              >
                <p className="text-[#8cf5e4]">{entry.action}</p>
                <p>
                  {entry.previousStatus} to {entry.newStatus} / {entry.actor}
                </p>
                <p>{entry.reason}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
