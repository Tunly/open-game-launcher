import { Trash2, X } from "lucide-react";

import { formatCurrency } from "../../lib/store-formatters";
import type { StoreGame } from "../../lib/types";
import { EmptyStorePanel } from "./EmptyStorePanel";

export function CartDrawer({
  cartGames,
  isOpen,
  isProcessing,
  onCheckout,
  onClose,
  onRemove,
  onViewCart,
  total,
}: {
  cartGames: StoreGame[];
  isOpen: boolean;
  isProcessing: boolean;
  onCheckout: () => void;
  onClose: () => void;
  onRemove: (gameId: string) => void;
  onViewCart: () => void;
  total: number;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-[#171411]/80 bg-[radial-gradient(circle,rgba(255,249,237,0.12)_1px,transparent_1px)] bg-[length:10px_10px] p-3 sm:p-6">
      <button
        aria-label="Close cart drawer backdrop"
        className="min-w-0 flex-1 cursor-default"
        type="button"
        onClick={onClose}
      />
      <aside
        aria-label="Cart drawer"
        className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-md flex-col border-4 border-black bg-[#fff9ed] shadow-[8px_8px_0_#171411] sm:max-h-[calc(100vh-3rem)]"
        role="dialog"
      >
        <div className="flex items-center justify-between border-b-4 border-black bg-[#171411] px-4 py-3">
          <div>
            <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#8cf5e4]">
              Cart Drawer
            </p>
            <h2 className="neo-title text-3xl leading-none text-[#fff9ed]">Checkout Tape</h2>
          </div>
          <button
            aria-label="Close cart drawer"
            className="flex h-10 w-10 items-center justify-center border-2 border-black bg-[#fff9ed] text-[#171411] shadow-[2px_2px_0_#8cf5e4]"
            type="button"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {cartGames.length === 0 ? (
            <EmptyStorePanel label="Cart drawer is empty." />
          ) : (
            cartGames.map((game) => (
              <article
                key={game.id}
                className="border-[3px] border-black bg-[#f5eedf] p-3 shadow-[3px_3px_0_#171411]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="neo-title truncate text-2xl leading-none text-[#171411]">
                      {game.title}
                    </p>
                    <p className="neo-copy mt-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#655f58]">
                      {game.tagLine}
                    </p>
                  </div>
                  <button
                    aria-label={`Remove ${game.title} from cart`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-black bg-[#b7102a] text-white shadow-[2px_2px_0_#171411]"
                    type="button"
                    onClick={() => onRemove(game.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between border-t-2 border-black pt-2">
                  <span className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#655f58]">
                    Price
                  </span>
                  <span className="text-xl font-black text-[#171411]">
                    {formatCurrency(game.price)}
                  </span>
                </div>
              </article>
            ))
          )}
        </div>

        <div className="border-t-4 border-black bg-[#f6edd8] p-4">
          <div className="flex items-center justify-between border-y-2 border-black py-3">
            <span className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#655f58]">
              Total
            </span>
            <span className="neo-title text-3xl leading-none text-[#171411]">
              {formatCurrency(total)}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              className="neo-copy h-11 border-2 border-black bg-[#fff9ed] text-[10px] font-black uppercase tracking-[0.1em] text-[#171411] shadow-[3px_3px_0_#171411]"
              type="button"
              onClick={onViewCart}
            >
              Cart Tab
            </button>
            <button
              className="neo-copy h-11 border-2 border-black bg-[#b7102a] text-[10px] font-black uppercase tracking-[0.1em] text-white shadow-[3px_3px_0_#171411] disabled:opacity-50"
              disabled={cartGames.length === 0 || isProcessing}
              type="button"
              onClick={onCheckout}
            >
              Checkout
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

export function CartPanel({
  cartGames,
  onCheckout,
  onRemove,
  total,
  isProcessing,
}: {
  cartGames: StoreGame[];
  onCheckout: () => void;
  onRemove: (gameId: string) => void;
  total: number;
  isProcessing: boolean;
}) {
  if (cartGames.length === 0) {
    return <EmptyStorePanel label="Cart is empty." />;
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-3">
        {cartGames.map((game) => (
          <div
            key={game.id}
            className="flex items-center justify-between gap-4 border-[3px] border-black bg-[#f5eedf] p-4 shadow-[3px_3px_0_#171411]"
          >
            <div>
              <p className="neo-title text-2xl leading-none text-[#171411]">{game.title}</p>
              <p className="neo-copy mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#655f58]">
                {game.tagLine}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xl font-black text-[#171411]">
                {formatCurrency(game.price)}
              </span>
              <button
                aria-label={`Remove ${game.title} from cart`}
                className="flex h-9 w-9 items-center justify-center border-2 border-black bg-[#b7102a] text-white shadow-[2px_2px_0_#171411]"
                type="button"
                onClick={() => onRemove(game.id)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <aside className="border-4 border-black bg-[#fff9ed] p-5 shadow-[5px_5px_0_#171411]">
        <h3 className="neo-title border-b-[3px] border-black pb-3 text-3xl leading-none text-[#171411]">
          Checkout
        </h3>
        <p className="neo-copy mt-4 text-[10px] font-black uppercase tracking-[0.12em] text-[#655f58]">
          Checkout via Stripe. You'll be redirected to complete payment.
        </p>
        <div className="my-4 flex justify-between border-y-2 border-black py-3 text-xl font-black">
          <span>Total</span>
          <span>{formatCurrency(total)}</span>
        </div>
        <button
          className="neo-copy h-12 w-full border-2 border-black bg-[#b7102a] text-[11px] font-black uppercase tracking-[0.12em] text-white shadow-[3px_3px_0_#171411] disabled:opacity-50"
          disabled={isProcessing}
          type="button"
          onClick={onCheckout}
        >
          Complete Order
        </button>
      </aside>
    </div>
  );
}
