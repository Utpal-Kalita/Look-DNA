import type { TryOnResult } from "@/lib/types";

import type { CompareView } from "@/app/components/CompareToggle";

function Frame({ src, label }: { src: string; label: string }) {
  return (
    <figure className="min-w-0 flex-1">
      <div className="aspect-[3/4] overflow-hidden rounded-2xl bg-blush">
        <img src={src} alt={label} className="h-full w-full object-cover" />
      </div>
      <figcaption className="mt-1 text-center text-xs text-muted">{label}</figcaption>
    </figure>
  );
}

const MODE_NOTES: Record<TryOnResult["mode"], string | null> = {
  combined: null,
  "side-by-side":
    "We could not layer the makeup on the outfit, so here they are side by side.",
  "clothes-only":
    "Showing the outfit. The lip shade preview was not available this time.",
  "makeup-only":
    "Showing the lip shade. The outfit preview was not available for this item.",
};

export function TryOnViewer({
  result,
  inspiration,
  view,
}: {
  result: TryOnResult;
  inspiration: string | null;
  view: CompareView;
}) {
  const note = MODE_NOTES[result.mode];

  if (view === "compare" && inspiration) {
    return (
      <div className="flex gap-2">
        <Frame src={inspiration} label="Inspiration" />
        <Frame src={result.image} label="You" />
      </div>
    );
  }

  return (
    <div>
      {result.mode === "side-by-side" && result.makeupImage ? (
        <div className="flex gap-2">
          <Frame src={result.clothesImage ?? result.image} label="Outfit" />
          <Frame src={result.makeupImage} label="Lip shade" />
        </div>
      ) : (
        <Frame src={result.image} label="Your adapted look" />
      )}
      {note ? <p className="mt-2 text-xs text-muted">{note}</p> : null}
    </div>
  );
}
