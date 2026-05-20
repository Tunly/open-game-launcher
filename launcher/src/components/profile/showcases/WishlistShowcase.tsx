import type { WishlistPreviewItem } from "../../../lib/types/profile";

export function WishlistShowcase({ items }: { items: WishlistPreviewItem[] }) {
  return (
    <div className="border border-white/10 bg-white/[0.05] p-5">
      <h3 className="text-lg font-bold text-white">Wishlist</h3>
      <p className="mt-3 text-sm text-slate-400">
        {items.length > 0
          ? `${items.length} public wishlist games.`
          : "No public wishlist items yet."}
      </p>
    </div>
  );
}
