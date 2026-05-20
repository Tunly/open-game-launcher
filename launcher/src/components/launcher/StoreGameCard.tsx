import { Eye, Plus } from "lucide-react";

import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import type { StoreGame } from "../../lib/types";

interface StoreGameCardProps {
  game: StoreGame;
  isAdded: boolean;
  onAddToLibrary: (gameId: string) => void;
}

function formatPrice(game: StoreGame) {
  if (game.isFree || game.price === 0) {
    return "Free";
  }

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(game.price);
}

export function StoreGameCard({
  game,
  isAdded,
  onAddToLibrary,
}: StoreGameCardProps) {
  return (
    <article className="rounded-lg border border-white/10 bg-launcher-panel p-5 shadow-card">
      <div className="mb-5 flex aspect-[16/9] items-end rounded-lg border border-white/10 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.22),transparent_32%),linear-gradient(135deg,#151923,#05070b)] p-5">
        <div>
          <Badge variant="info">{game.tagLine}</Badge>
          <h2 className="mt-3 text-2xl font-bold text-white">{game.title}</h2>
        </div>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-slate-400">{game.description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {game.platform.map((platform) => (
              <Badge key={platform} variant="muted">
                {platform}
              </Badge>
            ))}
          </div>
        </div>
        <Badge variant={game.isFree ? "success" : "default"}>
          {formatPrice(game)}
        </Badge>
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button
          className="flex-1"
          disabled={isAdded}
          onClick={() => onAddToLibrary(game.id)}
        >
          <Plus className="h-4 w-4" />
          {isAdded ? "Added" : "Add to Library"}
        </Button>
        <Button variant="secondary">
          <Eye className="h-4 w-4" />
          View Details
        </Button>
      </div>
    </article>
  );
}
