import { ExternalLink, Loader2, Newspaper } from "lucide-react";
import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";

import { getErrorMessage } from "../../lib/formatters";
import { getGameUpdates, resolveSteamAppId, type GameUpdateItem } from "../../lib/game-updates";
import { openExternalUrl } from "../../lib/launcher";
import type { Game } from "../../lib/types";

type GameUpdateFeedProps = {
  game: Game;
};

type FeedState =
  | { status: "loading"; items: GameUpdateItem[]; error: null }
  | { status: "ready"; items: GameUpdateItem[]; error: null }
  | { status: "error"; items: GameUpdateItem[]; error: string };

export function GameUpdateFeed({ game }: GameUpdateFeedProps) {
  const [state, setState] = useState<FeedState>({
    status: "loading",
    items: [],
    error: null,
  });
  const steamAppId = resolveSteamAppId(game);
  const isDesktopRuntime = isTauri();

  useEffect(() => {
    let isActive = true;

    if (!steamAppId) {
      setState({ status: "ready", items: [], error: null });
      return () => {
        isActive = false;
      };
    }

    setState({ status: "loading", items: [], error: null });
    getGameUpdates(game)
      .then((items) => {
        if (isActive) {
          setState({ status: "ready", items, error: null });
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setState({ status: "error", items: [], error: getErrorMessage(error) });
        }
      });

    return () => {
      isActive = false;
    };
  }, [game, steamAppId]);

  if (!steamAppId) {
    return (
      <FeedNotice title="No Update Feed" body="No update feed available for this source yet." />
    );
  }

  if (state.status === "loading") {
    return (
      <div className="grid min-h-[104px] place-items-center border-4 border-black bg-[#fbf4e7] shadow-[3px_3px_0_#171411]">
        <Loader2 className="h-6 w-6 animate-spin text-[#b7102a]" />
      </div>
    );
  }

  if (state.status === "error") {
    return <FeedNotice title="Update Feed Offline" body={state.error} />;
  }

  if (state.items.length === 0) {
    return (
      <FeedNotice title="No Updates Found" body="Steam has no recent update posts for this game." />
    );
  }

  return (
    <div className="space-y-3">
      {state.items.slice(0, 6).map((item) => (
        <article
          key={item.id}
          className="border-4 border-black bg-[#fbf4e7] shadow-[3px_3px_0_#171411]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-black px-3 py-2">
            <span className="text-[12px] font-black uppercase">
              {formatUpdateDate(item.publishedAt)}
            </span>
            <span
              className={`neo-copy border-2 border-black px-2 py-0.5 text-[10px] font-black text-white uppercase ${badgeClass(item.kind)}`}
            >
              {kindLabel(item.kind)}
            </span>
          </div>
          <div className="p-3">
            <h3 className="text-[16px] leading-tight font-black break-words uppercase">
              {item.title}
            </h3>
            {item.excerpt ? (
              <p className="mt-2 line-clamp-3 text-[13px] leading-5 font-bold text-[#4f4942]">
                {item.excerpt}
              </p>
            ) : null}
            {item.url && isDesktopRuntime ? (
              <button
                className="neo-copy mt-3 inline-flex items-center gap-1 border-2 border-black bg-[#171411] px-2 py-1 text-[10px] font-black text-white uppercase hover:bg-[#087d6d]"
                type="button"
                onClick={() => {
                  if (!item.url) return;
                  void openExternalUrl(item.url).catch((error: unknown) => {
                    console.warn("[GameUpdateFeed] Failed to open update notes:", error);
                  });
                }}
              >
                Read Notes
                <ExternalLink className="h-3 w-3" />
              </button>
            ) : item.url ? (
              <a
                className="neo-copy mt-3 inline-flex items-center gap-1 border-2 border-black bg-[#171411] px-2 py-1 text-[10px] font-black text-white uppercase hover:bg-[#087d6d]"
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Read Notes
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function FeedNotice({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-[104px] items-center gap-3 border-4 border-dashed border-black bg-[#f6edd8] p-4 shadow-[3px_3px_0_#171411]">
      <div className="grid h-10 w-10 shrink-0 place-items-center border-2 border-black bg-[#fbf4e7]">
        <Newspaper className="h-5 w-5 text-[#087d6d]" />
      </div>
      <div className="min-w-0">
        <h3 className="text-[13px] leading-tight font-black uppercase">{title}</h3>
        <p className="neo-copy mt-1 text-[10px] leading-4 font-bold text-[#655f58] uppercase">
          {body}
        </p>
      </div>
    </div>
  );
}

function badgeClass(kind: GameUpdateItem["kind"]) {
  if (kind === "patch") {
    return "bg-[#b7102a]";
  }
  if (kind === "update") {
    return "bg-[#087d6d]";
  }
  return "bg-[#171411]";
}

function kindLabel(kind: GameUpdateItem["kind"]) {
  if (kind === "patch") return "Patch";
  if (kind === "update") return "Update";
  return "News";
}

function formatUpdateDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Steam News";
  }
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
