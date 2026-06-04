import { MessageSquare, Radio, Shield, Signal, Trophy, Users } from "lucide-react";

const activityFeed = [
  {
    channel: "Patch Notes",
    headline: "Neo-Tokyo Drift bekommt Ranglisten",
    meta: "vor 12 min // 248 reaktionen",
    tone: "bg-[#c20b2f] text-white",
  },
  {
    channel: "Squad Search",
    headline: "Steel Battalion X Raid-Team offen",
    meta: "vor 22 min // 4 plaetze frei",
    tone: "bg-[#087d6d] text-white",
  },
  {
    channel: "Turnier",
    headline: "Netrunner Phantom Cup startet Freitag",
    meta: "1 hr ago // 96 registered",
    tone: "bg-[#efe6d4] text-[#171411]",
  },
];

const squads = [
  ["Redline Unit", "12 online", "Racing / Arcade"],
  ["Cipher Core", "8 online", "Puzzle / Hacking"],
  ["Iron Choir", "24 online", "Action / RPG"],
];

const leaderboard = [
  ["01", "KiraByte", "9.842"],
  ["02", "NullVector", "8.119"],
  ["03", "ArcLight", "7.604"],
];

export function CommunityPage() {
  return (
    <div className="relative min-h-[600px]">
      {/* Centered Coming Soon Overlay */}
      <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
        <div className="max-w-md rotate-[-3deg] border-[6px] border-black bg-[#f2c14e] p-8 text-center shadow-[12px_12px_0_#171411] transition duration-300 hover:rotate-[0deg] hover:scale-105 md:p-12">
          <h2 className="neo-title text-5xl uppercase leading-none tracking-tight text-[#171411] md:text-7xl">
            Coming
          </h2>
          <h2 className="neo-title mt-1 text-5xl uppercase leading-none tracking-tight text-[#171411] md:text-7xl">
            Soon
          </h2>
          <p className="neo-copy mt-5 border-t-2 border-black pt-4 text-[11px] font-black uppercase tracking-[0.2em] text-[#171411]">
            Official Community slice
          </p>
        </div>
      </div>

      {/* Blurred Community Content */}
      <div className="pointer-events-none select-none opacity-75 blur-[6px]">
        <section>
          <div className="mb-8 border-b-4 border-black pb-4">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <span className="neo-copy inline-flex border-2 border-black bg-[#c20b2f] px-3 py-1 text-xs font-bold uppercase text-white shadow-[3px_3px_0_#171411]">
                  Netzwerk online
                </span>
                <h1 className="neo-title mt-2 max-w-[680px] text-[clamp(3.5rem,15vw,6rem)] leading-[0.82] text-[#171411]">
                  Community Hub
                </h1>
                <p className="neo-copy mt-3 text-xs font-bold uppercase text-[#55504a]">
                  128 players online // 14 active groups // 3 live events
                </p>
              </div>

              <button
                className="neo-copy flex h-10 w-full items-center justify-center gap-3 border-2 border-black bg-[#f5eedf] px-5 text-xs font-bold uppercase shadow-[2px_2px_0_#171411] sm:w-fit"
                type="button"
              >
                <MessageSquare className="h-4 w-4" />
                Beitrag erstellen
              </button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  ["Online", "128", Signal],
                  ["Squads", "14", Users],
                  ["Events", "03", Radio],
                ].map(([label, value, Icon]) => (
                  <div
                    key={label as string}
                    className="border-4 border-black bg-[#f5eedf] p-4 shadow-[4px_4px_0_#171411]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="neo-copy text-xs font-bold uppercase text-[#55504a]">
                        {label as string}
                      </p>
                      <Icon className="h-5 w-5 text-[#c20b2f]" />
                    </div>
                    <p className="mt-2 text-5xl font-black leading-none text-[#171411]">
                      {value as string}
                    </p>
                  </div>
                ))}
              </div>

              <div className="border-4 border-black bg-[#f5eedf] shadow-[4px_4px_0_#171411]">
                <div className="flex items-center justify-between border-b-4 border-black p-4">
                  <h2 className="text-3xl font-black uppercase text-[#171411]">Live Feed</h2>
                  <span className="neo-copy text-xs font-bold uppercase text-[#55504a]">
                    Echtzeit
                  </span>
                </div>

                <div className="divide-y-4 divide-black">
                  {activityFeed.map((item, index) => (
                    <article key={item.headline} className="grid gap-4 p-4 sm:grid-cols-[88px_1fr]">
                      <div className="flex h-20 items-center justify-center bg-[#171411] text-[#f5eedf]">
                        <span className="neo-title text-4xl leading-none">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                      </div>
                      <div>
                        <span
                          className={`neo-copy inline-flex border-2 border-black px-3 py-1 text-[10px] font-bold uppercase shadow-[2px_2px_0_#171411] ${item.tone}`}
                        >
                          {item.channel}
                        </span>
                        <h3 className="mt-3 text-[clamp(1.35rem,7vw,1.5rem)] font-black uppercase leading-tight text-[#171411]">
                          {item.headline}
                        </h3>
                        <p className="neo-copy mt-2 text-[10px] font-bold uppercase text-[#55504a]">
                          {item.meta}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="border-4 border-black bg-[#171411] p-5 text-[#f5eedf] shadow-[4px_4px_0_#171411]">
                <div className="flex items-center gap-3">
                  <Trophy className="h-6 w-6 text-[#c20b2f]" />
                  <h2 className="text-2xl font-black uppercase">Leaderboard</h2>
                </div>
                <div className="mt-4 space-y-3">
                  {leaderboard.map(([rank, name, score]) => (
                    <div
                      key={name}
                      className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 border-2 border-[#f5eedf] p-3 sm:grid-cols-[42px_1fr_auto]"
                    >
                      <span className="neo-title text-3xl leading-none">{rank}</span>
                      <span className="truncate font-black uppercase">{name}</span>
                      <span className="neo-copy text-xs font-bold">{score}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-4 border-black bg-[#f5eedf] shadow-[4px_4px_0_#171411]">
                <div className="border-b-4 border-black p-4">
                  <div className="flex items-center gap-3">
                    <Shield className="h-6 w-6 text-[#087d6d]" />
                    <h2 className="text-2xl font-black uppercase">Squads</h2>
                  </div>
                </div>
                <div className="divide-y-4 divide-black">
                  {squads.map(([name, online, genre]) => (
                    <div key={name} className="p-4">
                      <h3 className="text-xl font-black uppercase">{name}</h3>
                      <p className="neo-copy mt-2 text-[10px] font-bold uppercase text-[#55504a]">
                        {online} // {genre}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </div>
  );
}
