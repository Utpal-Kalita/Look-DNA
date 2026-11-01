import { categoryLabel } from "@/app/components/labels";
import { Swatch } from "@/app/components/Swatch";

export function ShadeBeforeAfter({
  category,
  original,
  adapted,
  reason,
  productName,
  productColor,
}: {
  category: string;
  original: string;
  adapted: string;
  reason: string;
  productName?: string;
  productColor?: string;
}) {
  return (
    <li className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{categoryLabel(category)}</p>
      <div className="mt-2 flex items-center gap-3">
        <div className="flex flex-col items-center gap-1">
          <Swatch color={original} size="lg" label={`Original shade ${original}`} />
          <span className="text-[11px] text-muted">Original</span>
        </div>
        <span className="text-muted" aria-hidden>
          →
        </span>
        <div className="flex flex-col items-center gap-1">
          <Swatch color={adapted} size="lg" label={`Adapted shade ${adapted}`} />
          <span className="text-[11px] text-muted">For you</span>
        </div>
        {productColor ? (
          <>
            <span className="text-muted" aria-hidden>
              →
            </span>
            <div className="flex flex-col items-center gap-1">
              <Swatch color={productColor} size="lg" label={`Matched product ${productColor}`} />
              <span className="text-[11px] text-muted">Product</span>
            </div>
          </>
        ) : null}
      </div>
      <p className="mt-3 text-sm">{reason}</p>
      {productName ? <p className="mt-1 text-xs text-muted">Matched: {productName}</p> : null}
    </li>
  );
}
