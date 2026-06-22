import {
  Activity,
  Bell,
  Download,
  Gamepad2,
  MessageSquareMore,
  Settings,
  ShieldCheck,
  Store,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";

interface QuickAction {
  body: string;
  icon: LucideIcon;
  label: string;
  meta: string;
  tone: "red" | "teal" | "paper";
  to: string;
}

interface StatusPanel {
  icon: LucideIcon;
  label: string;
  title: string;
  value: string;
}

const quickActions: QuickAction[] = [
  {
    body: "Open installed games, verify manifests, sync achievements, and repair local launch data.",
    icon: Gamepad2,
    label: "Library",
    meta: "Play queue",
    tone: "red",
    to: "/library",
  },
  {
    body: "Track active jobs, remote handoff readiness, pause states, and completed installs.",
    icon: Download,
    label: "Downloads",
    meta: "Queue control",
    tone: "teal",
    to: "/downloads",
  },
  {
    body: "Inspect storefront licenses, orders, reviews, wishlist alerts, and build downloads.",
    icon: Store,
    label: "Store",
    meta: "Catalog ops",
    tone: "paper",
    to: "/store",
  },
  {
    body: "Tune profile privacy, overlay controls, backup cadence, platform keys, and cloud saves.",
    icon: Settings,
    label: "Settings",
    meta: "Control room",
    tone: "paper",
    to: "/settings",
  },
];

const statusPanels: StatusPanel[] = [
  { icon: ShieldCheck, label: "Secure RLS", title: "Profile writes", value: "Owner locked" },
  { icon: Trophy, label: "Achievements", title: "Cross-source", value: "Merged" },
  { icon: Users, label: "Social", title: "Friends layer", value: "Live" },
  { icon: Activity, label: "Performance", title: "Overlay traces", value: "Ready" },
];

const activityRows = [
  ["Runtime", "Steam client detected", "2h uptime"],
  ["Backup", "Daily reminder armed", "Next check"],
  ["Mods", "Provider deck online", "3 sources"],
  ["Privacy", "Deletion dry-run logged", "Guarded"],
];

export function HomePage() {
  return (
    <section className="mx-auto flex w-full max-w-[1220px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
        <section className="neo-dots border-[4px] border-black bg-[#fff9ed] p-4 shadow-[6px_6px_0_#171411]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-[3px] border-black pb-3">
            <div>
              <span className="neo-copy inline-flex border-2 border-black bg-[#b7102a] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[3px_3px_0_#171411]">
                Launcher HQ
              </span>
              <h1 className="neo-title mt-3 text-[3.2rem] leading-[0.82] text-[#171411] sm:text-[4.5rem] lg:text-[5.6rem] xl:text-[6.3rem]">
                Play Desk
              </h1>
              <p className="neo-copy mt-3 max-w-2xl text-[12px] font-black uppercase leading-5 text-[#5b403f]">
                Game library, social layer, mod deck, downloads, store, and profile ops in one dense
                launcher board.
              </p>
            </div>
            <div className="grid grid-cols-2 border-[3px] border-black bg-[#171411] text-white shadow-[4px_4px_0_#171411]">
              <Readout label="Active" value="4" />
              <Readout label="Ready" value="12" />
              <Readout label="Alerts" value="2" />
              <Readout label="Sync" value="OK" />
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {quickActions.map((action) => (
              <QuickActionCard key={action.label} action={action} />
            ))}
          </div>
        </section>

        <section className="grid gap-3">
          <div className="hero-art min-h-[260px] border-[4px] border-black p-4 shadow-[6px_6px_0_#171411]">
            <div className="flex h-full flex-col justify-between">
              <span className="neo-copy w-fit border-2 border-black bg-[#8cf5e4] px-3 py-1 text-[9px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411]">
                Cover Signal
              </span>
              <div>
                <h2 className="neo-title text-4xl leading-none text-[#fff9ed]">Neo Queue</h2>
                <p className="neo-copy mt-2 max-w-[260px] text-[10px] font-black uppercase leading-5 text-[#f5eedf]">
                  Launch-ready cards, active routes, and system signals stay visible before the
                  first click.
                </p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ArtTile className="card-art-drift" label="Library" value="Grouped" />
            <ArtTile className="card-art-blood" label="Store" value="Licensed" />
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
        <section className="border-[4px] border-black bg-[#f5eedf] p-4 shadow-[5px_5px_0_#171411]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black pb-3">
            <div>
              <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
                System Board
              </p>
              <h2 className="neo-title text-3xl leading-none text-[#171411]">Live Surfaces</h2>
            </div>
            <Link
              className="neo-copy inline-flex h-10 items-center gap-2 border-2 border-black bg-[#007166] px-3 text-[10px] font-black uppercase text-white shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#b7102a]"
              to="/community"
            >
              <MessageSquareMore className="h-4 w-4" />
              Community
            </Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {statusPanels.map((panel) => (
              <StatusCard key={panel.label} panel={panel} />
            ))}
          </div>
        </section>

        <section className="border-[4px] border-black bg-[#fff9ed] p-4 shadow-[5px_5px_0_#171411]">
          <div className="flex items-center justify-between gap-3 border-b-2 border-black pb-3">
            <div>
              <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#5b403f]">
                Activity Ticker
              </p>
              <h2 className="neo-title text-3xl leading-none text-[#171411]">Ops Feed</h2>
            </div>
            <Bell className="h-5 w-5 text-[#b7102a]" />
          </div>
          <div className="mt-3 divide-y-2 divide-black border-2 border-black bg-[#f6edd8]">
            {activityRows.map(([label, title, meta]) => (
              <div key={`${label}-${title}`} className="grid grid-cols-[82px_1fr_auto] gap-2 p-3">
                <span className="neo-copy text-[9px] font-black uppercase text-[#b7102a]">
                  {label}
                </span>
                <span className="neo-copy min-w-0 truncate text-[10px] font-black uppercase text-[#171411]">
                  {title}
                </span>
                <span className="neo-copy text-[9px] font-black uppercase text-[#5b403f]">
                  {meta}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[78px] border-black px-4 py-3 text-center odd:border-r-2 [&:nth-child(-n+2)]:border-b-2">
      <p className="text-2xl font-black leading-none">{value}</p>
      <p className="neo-copy mt-1 text-[9px] font-black uppercase text-[#f5eedf]">{label}</p>
    </div>
  );
}

function QuickActionCard({ action }: { action: QuickAction }) {
  const Icon = action.icon;
  const toneClass =
    action.tone === "red"
      ? "bg-[#b7102a] text-white"
      : action.tone === "teal"
        ? "bg-[#007166] text-white"
        : "bg-[#fff9ed] text-[#171411]";

  return (
    <Link
      className="group min-w-0 border-[3px] border-black bg-[#f6edd8] p-3 shadow-[4px_4px_0_#171411] transition hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#171411]"
      to={action.to}
    >
      <div className="flex items-start gap-3">
        <span
          className={`grid h-11 w-11 shrink-0 place-items-center border-2 border-black shadow-[2px_2px_0_#171411] ${toneClass}`}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="neo-copy text-[9px] font-black uppercase tracking-[0.12em] text-[#5b403f]">
            {action.meta}
          </p>
          <h2 className="neo-title mt-1 text-2xl leading-none text-[#171411] group-hover:text-[#b7102a]">
            {action.label}
          </h2>
          <p className="neo-copy mt-2 text-[10px] font-black uppercase leading-5 text-[#5b403f]">
            {action.body}
          </p>
        </div>
      </div>
    </Link>
  );
}

function ArtTile({ className, label, value }: { className: string; label: string; value: string }) {
  return (
    <div
      className={`${className} min-h-[110px] border-[3px] border-black p-3 shadow-[4px_4px_0_#171411]`}
    >
      <span className="neo-copy inline-flex border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411]">
        {label}
      </span>
      <p className="neo-title mt-8 text-2xl leading-none text-white [text-shadow:2px_2px_0_#171411]">
        {value}
      </p>
    </div>
  );
}

function StatusCard({ panel }: { panel: StatusPanel }) {
  const Icon = panel.icon;

  return (
    <article className="border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex items-start justify-between gap-2">
        <span className="grid h-9 w-9 place-items-center border-2 border-black bg-[#171411] text-[#8cf5e4]">
          <Icon className="h-4 w-4" />
        </span>
        <span className="neo-copy border-2 border-black bg-[#007166] px-2 py-1 text-[8px] font-black uppercase text-white">
          {panel.value}
        </span>
      </div>
      <p className="neo-copy mt-3 text-[9px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
        {panel.label}
      </p>
      <h3 className="neo-title mt-1 text-2xl leading-none text-[#171411]">{panel.title}</h3>
    </article>
  );
}
