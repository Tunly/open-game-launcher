import type { WishlistPreviewItem } from "../../../lib/types/profile";
import { EmptyShowcaseText, ShowcasePanel } from "./ShowcasePanel";

export function WishlistShowcase({ items }: { items: WishlistPreviewItem[] }) {
  return (
    <ShowcasePanel kicker="Wishlist" title="Wanted Games">
      {items.length > 0 ? (
        <p className="neo-copy text-[12px] font-black uppercase leading-5 text-[#171411]">
          {items.length} public wishlist games.
        </p>
      ) : (
        <EmptyShowcaseText>No public wishlist items yet.</EmptyShowcaseText>
      )}
    </ShowcasePanel>
  );
}
