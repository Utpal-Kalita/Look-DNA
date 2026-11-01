import { formatInr } from "@/app/components/BudgetInput";
import { categoryLabel } from "@/app/components/labels";
import type { CatalogItem, ProductMatch } from "@/lib/types";

export function MatchScore({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-none bg-blush px-2 py-0.5 text-[11px] font-medium">
      Similar, not identical, {Math.round(score * 100)}% match
    </span>
  );
}

export function CartItem({
  match,
  product,
  canSwap,
  swapping,
  onSwap,
}: {
  match: ProductMatch;
  product: CatalogItem;
  canSwap: boolean;
  swapping: boolean;
  onSwap: () => void;
}) {
  return (
    <li className="flex gap-3 rounded-2xl bg-white p-3 shadow-sm">
      <img
        src={product.image}
        alt={product.name}
        className="h-24 w-20 shrink-0 rounded-xl bg-cream object-contain"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-[11px]  text-muted">
          {categoryLabel(match.category)}, {product.brand}
        </p>
        <p className="truncate text-sm font-medium">{product.name}</p>
        {product.source === "live" ? (
          <p className="text-[11px] text-muted">Live from {product.brand}, current price</p>
        ) : null}
        <p className="text-sm font-semibold">{formatInr(product.price)}</p>
        <div className="mt-1">
          <MatchScore score={match.score} />
        </div>
        <div className="mt-2 flex gap-3 text-sm">
          <a
            href={product.link}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-accent underline underline-offset-2"
          >
            Buy
          </a>
          {canSwap ? (
            <button
              type="button"
              onClick={onSwap}
              disabled={swapping}
              className="text-muted underline underline-offset-2 disabled:opacity-50"
            >
              {swapping ? "Swapping…" : "Swap"}
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
