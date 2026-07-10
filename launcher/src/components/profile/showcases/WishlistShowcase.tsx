import type { WishlistPreviewItem } from "../../../lib/types/profile";
import { EmptyShowcaseText, ShowcasePanel } from "./ShowcasePanel";

export function WishlistShowcase({ items }: { items: WishlistPreviewItem[] }) {
  return (
    <ShowcasePanel kicker="Wishlist" title="Wanted Games">
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div
              key={item.id}
              className="flex items-center gap-3 border-[3px] border-black bg-[#f6edd8] p-3 shadow-[3px_3px_0_#1f1c0f]"
            >
              <span className="neo-title grid h-10 w-10 shrink-0 place-items-center border-2 border-black bg-[#007166] text-2xl leading-none text-white">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="neo-title truncate text-2xl leading-none text-[#171411]">
                  {item.title}
                </p>
                <p className="neo-copy mt-1 text-[10px] font-black text-[#5b403f] uppercase">
                  Price watch armed
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyShowcaseText>No public wishlist items yet.</EmptyShowcaseText>
      )}
    </ShowcasePanel>
  );
}
