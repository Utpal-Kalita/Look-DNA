import { categoryLabel } from "@/app/components/labels";
import { StyleTag } from "@/app/components/StyleTag";
import { Swatch } from "@/app/components/Swatch";
import type { LookItem } from "@/lib/types";

export function DnaCard({ items, image }: { items: LookItem[]; image: string | null }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
      {image ? (
        <img src={image} alt="Your inspiration" className="h-48 w-full object-cover" />
      ) : null}
      <ul className="divide-y divide-blush">
        {items.map((item) => {
          const tags = [...(item.style ?? []), ...(item.finish ? [item.finish] : [])];
          return (
            <li key={item.category} className="flex items-center gap-3 p-4">
              <Swatch color={item.color} label={`${categoryLabel(item.category)} colour ${item.color}`} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{categoryLabel(item.category)}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {tags.length > 0 ? (
                    tags.map((tag) => <StyleTag key={tag}>{tag}</StyleTag>)
                  ) : (
                    <span className="text-xs text-muted">{item.color}</span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
