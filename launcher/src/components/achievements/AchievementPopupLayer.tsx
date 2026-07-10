import { useCallback, useEffect, useRef, useState } from "react";
import { Trophy, X } from "lucide-react";

import { useAchievementPopup } from "../../lib/overlay";
import type { AchievementPopupPayload } from "../../lib/types/overlay";

type QueuedPopup = AchievementPopupPayload & { queueId: number };

export function AchievementPopupLayer() {
  const nextQueueId = useRef(0);
  const timers = useRef(new Map<number, number>());
  const [popups, setPopups] = useState<QueuedPopup[]>([]);

  const dismissPopup = useCallback((queueId: number) => {
    const timer = timers.current.get(queueId);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(queueId);
    }
    setPopups((current) => current.filter((popup) => popup.queueId !== queueId));
  }, []);

  useAchievementPopup(
    useCallback(
      (payload: AchievementPopupPayload) => {
        const queueId = nextQueueId.current++;
        setPopups((current) => [...current, { ...payload, queueId }]);
        timers.current.set(
          queueId,
          window.setTimeout(() => dismissPopup(queueId), 5000),
        );
      },
      [dismissPopup],
    ),
  );

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) {
        window.clearTimeout(timer);
      }
      timers.current.clear();
    },
    [],
  );

  if (popups.length === 0) return null;

  return (
    <div
      aria-label="Achievement notifications"
      className="pointer-events-none fixed right-4 top-4 z-[9999] flex flex-col gap-2"
      role="region"
    >
      {popups.map((popup) => (
        <article
          key={popup.queueId}
          className="neo-dots pointer-events-auto flex w-80 items-center gap-3 border-[3px] border-[#171411] bg-[#fbf8ef] px-3 py-2 text-[#171411] shadow-[4px_4px_0_#1f1c0f]"
        >
          <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden border-2 border-[#171411] bg-[#b7102a] shadow-[2px_2px_0_#1f1c0f]">
            {popup.iconUrl ? (
              <img alt="" className="h-full w-full object-cover" src={popup.iconUrl} />
            ) : (
              <Trophy className="text-white" size={21} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="neo-copy text-[9px] font-black uppercase text-[#b7102a]">
              Achievement unlocked
            </p>
            <h2 className="neo-title truncate text-base leading-tight">{popup.achievementName}</h2>
            <p className="neo-copy truncate text-[9px] font-black uppercase text-[#655f58]">
              {popup.gameTitle}
              {popup.rarity ? ` // ${popup.rarity}` : ""}
            </p>
            {popup.description ? (
              <p className="mt-1 line-clamp-2 text-[10px] font-bold leading-4 text-[#5b403f]">
                {popup.description}
              </p>
            ) : null}
          </div>
          <button
            aria-label={`Dismiss ${popup.achievementName}`}
            className="grid h-7 w-7 shrink-0 place-items-center border-2 border-[#171411] bg-[#efe6d4] shadow-[2px_2px_0_#1f1c0f] hover:-translate-y-0.5 hover:bg-[#087d6d] hover:text-white"
            onClick={() => dismissPopup(popup.queueId)}
            type="button"
          >
            <X size={14} />
          </button>
        </article>
      ))}
    </div>
  );
}
