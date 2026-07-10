import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Newspaper, Radio, Tags, Zap } from "lucide-react";

import { getErrorMessage } from "../lib/formatters";
import { listPublishedNews } from "../lib/supabase/news";
import type { NewsItem } from "../lib/types/news";

type NewsState =
  | { status: "loading"; items: NewsItem[]; error: null }
  | { status: "ready"; items: NewsItem[]; error: null }
  | { status: "error"; items: NewsItem[]; error: string };

const artClasses = ["library-art-tokyo", "library-art-mech", "library-art-phantom"];

function formatDate(value: string | null): string {
  if (!value) return "Draft";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });
}

function excerptFor(item: NewsItem): string {
  return item.excerpt?.trim() || item.body.slice(0, 220);
}

function sentence(value: string): string {
  return value.replace(/[.!?\s]+$/u, "");
}

export function NewsPage() {
  const [state, setState] = useState<NewsState>({
    status: "loading",
    items: [],
    error: null,
  });
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    let isActive = true;

    listPublishedNews()
      .then((items) => {
        if (!isActive) return;
        setState({ status: "ready", items, error: null });
      })
      .catch((error: unknown) => {
        if (!isActive) return;
        setState({
          status: "error",
          items: [],
          error: getErrorMessage(error),
        });
      });

    return () => {
      isActive = false;
    };
  }, [requestVersion]);

  const featured = state.items[0] ?? null;
  const tagCount = useMemo(
    () => new Set(state.items.flatMap((item) => item.tags)).size,
    [state.items],
  );

  if (state.status === "loading") {
    return (
      <section className="neo-dots grid min-h-[520px] place-items-center">
        <div className="border-4 border-black bg-[#f4ead8] px-5 py-4 shadow-[6px_6px_0_#171411]">
          <div className="flex items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-[#087d6d]" />
            <p className="neo-copy text-[12px] font-black text-[#171411] uppercase">
              Loading news relay
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="neo-dots space-y-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="border-4 border-black bg-[#fff9ed] shadow-[6px_6px_0_#171411]">
          <div className="border-b-4 border-black bg-[#171411] px-4 py-3 text-[#fbf4e7]">
            <span className="neo-copy inline-flex border-2 border-black bg-[#b7102a] px-3 py-1 text-[10px] font-black tracking-[0.12em] text-white uppercase shadow-[3px_3px_0_#000]">
              Bulletin Relay
            </span>
            <h1 className="neo-title mt-3 text-5xl leading-none md:text-7xl">News Feed</h1>
            <p className="neo-copy mt-3 max-w-2xl text-[11px] leading-5 font-black text-[#8cf5e4] uppercase">
              Patch notes, platform updates, store desk notices, and community signals in one
              launcher board.
            </p>
          </div>

          <div className="grid gap-4 p-4 md:grid-cols-3">
            {[
              ["Posts", state.items.length.toString().padStart(2, "0"), Newspaper],
              ["Tags", tagCount.toString().padStart(2, "0"), Tags],
              ["Mode", state.status === "error" ? "Unavailable" : "Hosted", Radio],
            ].map(([label, value, Icon]) => (
              <div
                key={label as string}
                className="border-[3px] border-black bg-[#f6edd8] p-3 shadow-[3px_3px_0_#171411]"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="neo-copy text-[9px] font-black tracking-[0.12em] text-[#5b403f] uppercase">
                    {label as string}
                  </p>
                  <Icon className="h-5 w-5 text-[#b7102a]" />
                </div>
                <p className="neo-title mt-3 text-3xl leading-none text-[#171411]">
                  {value as string}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="hero-art relative min-h-[250px] overflow-hidden border-4 border-black p-4 shadow-[6px_6px_0_#171411]">
          <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,249,237,0.16)_1px,transparent_1px)] bg-[length:8px_8px]" />
          <div className="relative flex h-full min-h-[218px] flex-col justify-between">
            <span className="neo-copy w-fit border-2 border-black bg-[#8cf5e4] px-3 py-1 text-[9px] font-black text-[#171411] uppercase shadow-[2px_2px_0_#171411]">
              Wire Desk
            </span>
            <div>
              <div className="mb-3 grid h-16 w-16 place-items-center border-[3px] border-black bg-[#087d6d] text-white shadow-[3px_3px_0_#000]">
                <Zap className="h-9 w-9" />
              </div>
              <h2 className="neo-title text-4xl leading-none text-[#fff9ed] [text-shadow:3px_3px_0_#171411]">
                Patch Radio
              </h2>
              <p className="neo-copy mt-2 max-w-[280px] text-[10px] leading-5 font-black text-[#f5eedf] uppercase">
                Published articles load from the hosted news catalog. Missing or failed reads stay
                visibly empty.
              </p>
            </div>
          </div>
        </div>
      </div>

      {state.status === "error" ? (
        <div className="neo-copy flex flex-wrap items-center gap-3 border-[3px] border-black bg-[#f5d6d9] p-3 text-[10px] leading-5 font-black text-[#77101f] uppercase shadow-[3px_3px_0_#171411]">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span className="min-w-0 flex-1">Hosted news unavailable: {sentence(state.error)}.</span>
          <button
            className="border-2 border-black bg-[#fff9ed] px-3 py-2 text-[#171411] shadow-[2px_2px_0_#171411]"
            type="button"
            onClick={() => {
              setState({ status: "loading", items: [], error: null });
              setRequestVersion((version) => version + 1);
            }}
          >
            Retry news
          </button>
        </div>
      ) : null}

      {featured ? (
        <article className="grid gap-4 border-4 border-black bg-[#f5eedf] shadow-[6px_6px_0_#171411] lg:grid-cols-[340px_minmax(0,1fr)]">
          <div
            className={`relative min-h-[220px] border-b-4 border-black lg:border-r-4 lg:border-b-0 ${artClasses[0]}`}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,249,237,0.18)_1px,transparent_1px)] bg-[length:8px_8px]" />
            <div className="absolute bottom-4 left-4 border-2 border-black bg-[#b7102a] px-3 py-1 text-white shadow-[2px_2px_0_#171411]">
              <p className="neo-copy text-[9px] font-black uppercase">Featured Bulletin</p>
            </div>
          </div>
          <div className="min-w-0 p-4">
            <p className="neo-copy text-[10px] font-black tracking-[0.12em] text-[#087d6d] uppercase">
              {formatDate(featured.publishedAt)}
            </p>
            <h2 className="neo-title mt-2 text-4xl leading-none text-[#171411] md:text-5xl">
              {featured.title}
            </h2>
            <p className="neo-copy mt-3 max-w-3xl text-[12px] leading-5 font-black text-[#5b403f] uppercase">
              {excerptFor(featured)}
            </p>
            <TagRow tags={featured.tags} />
          </div>
        </article>
      ) : null}

      {state.status === "ready" && state.items.length === 0 ? (
        <div className="grid min-h-[220px] place-items-center border-4 border-black bg-[#f5eedf] p-6 text-center shadow-[6px_6px_0_#171411]">
          <div>
            <Newspaper className="mx-auto h-12 w-12 text-[#087d6d]" />
            <h2 className="neo-title mt-3 text-3xl leading-none text-[#171411]">No Bulletins</h2>
            <p className="neo-copy mt-2 text-[10px] font-black text-[#5b403f] uppercase">
              No published news articles yet. Check back from the launcher board.
            </p>
          </div>
        </div>
      ) : state.items.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {state.items.map((item, index) => (
            <article
              key={item.id}
              className="border-4 border-black bg-[#f5eedf] shadow-[5px_5px_0_#171411]"
            >
              <div
                className={`relative h-28 border-b-4 border-black ${artClasses[index % artClasses.length]}`}
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,249,237,0.18)_1px,transparent_1px)] bg-[length:8px_8px]" />
                <span className="neo-title absolute bottom-2 left-3 text-4xl leading-none text-white [text-shadow:3px_3px_0_#171411]">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <div className="p-4">
                <p className="neo-copy text-[9px] font-black tracking-[0.12em] text-[#b7102a] uppercase">
                  {formatDate(item.publishedAt)}
                </p>
                <h3 className="mt-2 text-2xl leading-tight font-black text-[#171411] uppercase">
                  {item.title}
                </h3>
                <p className="neo-copy mt-3 text-[10px] leading-5 font-black text-[#5b403f] uppercase">
                  {excerptFor(item)}
                </p>
                <TagRow tags={item.tags} />
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function TagRow({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {tags.map((tag) => (
        <span
          key={tag}
          className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[9px] font-black text-[#171411] uppercase shadow-[2px_2px_0_#171411]"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}
