import { CheckCircle2, Download, Play, RotateCw, ShieldCheck } from "lucide-react";

import { Button } from "../ui/Button";
import { Badge, type BadgeVariant } from "../ui/Badge";
import { cn } from "../../lib/utils";
import type { Game, GameStatus } from "../../lib/types";

interface GameCardProps {
  game: Game;
  isBusy?: boolean;
  isVerifying?: boolean;
  onPrimaryAction: (game: Game) => void;
  onVerifyAction: (game: Game) => void;
}

const statusMeta: Record<
  GameStatus,
  { label: string; variant: BadgeVariant; action: string }
> = {
  installed: { label: "Installed", variant: "success", action: "Play" },
  not_installed: { label: "Not installed", variant: "muted", action: "Install" },
  update_available: {
    label: "Update available",
    variant: "warning",
    action: "Update",
  },
};

const coverClasses = [
  "from-slate-800 via-sky-950 to-slate-950",
  "from-zinc-900 via-amber-950 to-stone-950",
  "from-neutral-900 via-fuchsia-950 to-slate-950",
  "from-stone-900 via-emerald-950 to-slate-950",
];

function getPrimaryIcon(status: GameStatus) {
  if (status === "installed") {
    return <Play className="h-4 w-4" />;
  }

  if (status === "update_available") {
    return <RotateCw className="h-4 w-4" />;
  }

  return <Download className="h-4 w-4" />;
}

function formatPlaytime(minutes?: number) {
  if (!minutes) {
    return "No playtime yet";
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

export function GameCard({
  game,
  isBusy = false,
  isVerifying = false,
  onPrimaryAction,
  onVerifyAction,
}: GameCardProps) {
  const meta = statusMeta[game.status];
  const coverClass = coverClasses[game.id.length % coverClasses.length];

  return (
    <article className="overflow-hidden rounded-lg border border-white/10 bg-launcher-panel shadow-card">
      <div className="relative aspect-[16/9] overflow-hidden bg-slate-900">
        {game.coverUrl ? (
          <img
            alt=""
            className="h-full w-full object-cover"
            src={game.coverUrl}
          />
        ) : (
          <div
            className={cn(
              "flex h-full items-end bg-gradient-to-br p-5",
              coverClass,
            )}
          >
            <div className="max-w-[80%]">
              <p className="text-xs font-semibold uppercase text-sky-100/70">
                Open Launcher
              </p>
              <p className="mt-2 text-2xl font-bold text-white">{game.title}</p>
            </div>
          </div>
        )}
        <div className="absolute left-4 top-4">
          <Badge variant={meta.variant}>{meta.label}</Badge>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="min-h-28">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-white">{game.title}</h2>
              <p className="mt-2 line-clamp-2 text-sm text-slate-400">
                {game.description}
              </p>
            </div>
            <Badge variant="info">v{game.version}</Badge>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
              <p className="text-xs uppercase text-slate-500">Platform</p>
              <p className="mt-1 font-semibold capitalize text-slate-100">
                {game.platform}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
              <p className="text-xs uppercase text-slate-500">Playtime</p>
              <p className="mt-1 font-semibold text-slate-100">
                {formatPlaytime(game.playtimeMinutes)}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="flex-1"
            disabled={isBusy}
            onClick={() => onPrimaryAction(game)}
          >
            {isBusy ? (
              <RotateCw className="h-4 w-4 animate-spin" />
            ) : (
              getPrimaryIcon(game.status)
            )}
            {isBusy ? "Working" : meta.action}
          </Button>
          <Button
            className="sm:w-36"
            disabled={isVerifying}
            variant="secondary"
            onClick={() => onVerifyAction(game)}
          >
            {isVerifying ? (
              <RotateCw className="h-4 w-4 animate-spin" />
            ) : game.status === "installed" ? (
              <ShieldCheck className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Verify
          </Button>
        </div>
      </div>
    </article>
  );
}
