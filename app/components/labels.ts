const CATEGORY_LABELS: Record<string, string> = {
  top: "Top",
  bottom: "Bottom",
  dress: "Dress",
  kurta: "Kurta",
  outerwear: "Outerwear",
  lipstick: "Lip",
  eyeshadow: "Eyes",
  blush: "Cheeks",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.charAt(0).toUpperCase() + category.slice(1);
}

export function isMakeupCategory(category: string): boolean {
  return ["lipstick", "eyeshadow", "blush"].includes(category);
}
