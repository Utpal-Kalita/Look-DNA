import {
  clamp,
  deltaE,
  hexToLab,
  hueDelta,
  labToHex,
  labToLch,
  lchToLab,
  type Lch,
} from "@/lib/color";
import {
  CLOTHING_CATEGORIES,
  MAKEUP_CATEGORIES,
  type CatalogItem,
  type LookCategory,
  type LookItem,
  type MatchRequest,
  type MatchResponse,
  type ProductMatch,
  type UserTone,
} from "@/lib/types";
import { normalizeHex } from "@/lib/undertone";

/** Candidates scoring below this are not shown as matches at all. */
export const MIN_SCORE = 0.35;
/** How many ranked candidates per item the budget logic may swap between. */
const CANDIDATES_PER_ITEM = 5;
const COLOR_WEIGHT = 0.75;
const MAX_SCORE = 0.98;
/** CIE76 distance at which the colour score reaches zero. */
const COLOR_ZERO_DISTANCE = 70;

/** When nothing cheaper exists, drop the least essential piece first. */
const DROP_ORDER: LookCategory[] = [
  "blush",
  "eyeshadow",
  "outerwear",
  "bottom",
  "lipstick",
  "top",
  "dress",
];

const CATEGORY_ALIASES: Record<string, LookCategory> = {
  top: "top",
  shirt: "top",
  blouse: "top",
  sweater: "top",
  tshirt: "top",
  "t-shirt": "top",
  tee: "top",
  bottom: "bottom",
  pants: "bottom",
  trousers: "bottom",
  jeans: "bottom",
  skirt: "bottom",
  shorts: "bottom",
  dress: "dress",
  gown: "dress",
  outerwear: "outerwear",
  jacket: "outerwear",
  coat: "outerwear",
  blazer: "outerwear",
  lipstick: "lipstick",
  lip: "lipstick",
  lips: "lipstick",
  lip_color: "lipstick",
  eyeshadow: "eyeshadow",
  eye: "eyeshadow",
  eyes: "eyeshadow",
  blush: "blush",
  cheek: "blush",
  cheeks: "blush",
};

export function normalizeCategory(category: string): LookCategory | null {
  return CATEGORY_ALIASES[category.trim().toLowerCase().replace(/\s+/g, "")] ?? null;
}

export function isMakeup(category: string): boolean {
  return (MAKEUP_CATEGORIES as readonly string[]).includes(category);
}

export function isClothing(category: string): boolean {
  return (CLOTHING_CATEGORIES as readonly string[]).includes(category);
}

// ---------------------------------------------------------------------------
// F4: undertone adaptation
// ---------------------------------------------------------------------------

/** Lab hue angles we nudge makeup towards. Warm = coral/orange-red, cool = blue-red/berry. */
const TARGET_HUE = { warm: 50, cool: 8 } as const;
const MAX_HUE_SHIFT = 18;

export interface AdaptedShade {
  original: string;
  adapted: string;
  reason: string;
}

export function adaptShade(
  hex: string,
  category: string,
  tone: UserTone | null,
): AdaptedShade {
  const original = normalizeHex(hex);
  const lch = labToLch(hexToLab(original));
  const family = shadeFamily(lch);

  if (!tone) {
    return { original, adapted: original, reason: `The original ${family} from your inspiration` };
  }

  const skin = hexToLab(tone.hex);
  const next: Lch = { ...lch };
  let hueShifted = false;

  if (tone.undertone !== "neutral" && lch.c >= 12) {
    const shift = clamp(
      hueDelta(lch.h, TARGET_HUE[tone.undertone]) * 0.5,
      -MAX_HUE_SHIFT,
      MAX_HUE_SHIFT,
    );
    if (Math.abs(shift) >= 3) {
      next.h = (lch.h + shift + 360) % 360;
      hueShifted = true;
    }
  }

  let depth: "deeper" | "softer" | null = null;
  if (skin.l < 55 && lch.l > 62) {
    next.l = lch.l - 10;
    depth = "deeper";
  } else if (skin.l > 72 && lch.l < 32 && category !== "eyeshadow") {
    next.l = lch.l + 6;
    depth = "softer";
  }

  const adapted = labToHex(lchToLab(next));
  const piece = category === "lipstick" ? family : `${family} ${category}`;

  let reason: string;
  if (hueShifted) {
    const direction = tone.undertone === "warm" ? "warmer" : "cooler";
    reason = `A ${direction} ${piece} suits your ${tone.undertone} undertone`;
  } else {
    reason = `This ${piece} already suits your ${tone.undertone} undertone`;
  }
  if (depth === "deeper") {
    reason += ", in a richer depth that shows up on your skin tone";
  } else if (depth === "softer") {
    reason += ", softened slightly for your skin tone";
  }

  return { original, adapted, reason };
}

/** A rough, friendly colour family name for reasons. */
export function shadeFamily({ l, c, h }: Lch): string {
  if (c < 16) {
    return l > 55 ? "nude" : "brown";
  }
  if (h >= 300 || h < 15) {
    return l < 40 ? "berry" : "pink";
  }
  if (h < 42) {
    if (l > 60) {
      return "pink";
    }
    return l < 35 ? "deep red" : "red";
  }
  if (h < 65) {
    return l < 50 ? "terracotta" : "coral";
  }
  if (h < 100) {
    return l > 65 ? "peach" : "bronze";
  }
  if (h < 250) {
    return "green";
  }
  return l < 40 ? "plum" : "mauve";
}

// ---------------------------------------------------------------------------
// F5: scoring
// ---------------------------------------------------------------------------

interface Candidate {
  product: CatalogItem;
  score: number;
  sharedTags: string[];
}

export function scoreProduct(
  targetColor: string,
  item: LookItem,
  product: CatalogItem,
): Candidate {
  const colorScore = clamp(1 - deltaE(targetColor, product.color) / COLOR_ZERO_DISTANCE, 0, 1);
  const wanted = new Set(
    [...(item.style ?? []), ...(item.finish ? [item.finish] : [])].map(normalizeTag),
  );
  const have = new Set(product.style.map(normalizeTag));
  const sharedTags = [...wanted].filter((tag) => have.has(tag));
  const styleScore = wanted.size === 0 ? 0.5 : sharedTags.length / wanted.size;
  // Capped below 1: a catalog product is never identical to the inspiration.
  const score = Math.min(MAX_SCORE, round2(COLOR_WEIGHT * colorScore + (1 - COLOR_WEIGHT) * styleScore));

  return { product, score, sharedTags };
}

function rankCandidates(
  targetColor: string,
  item: LookItem,
  category: LookCategory,
  catalog: CatalogItem[],
  exclude: Set<string>,
): Candidate[] {
  return catalog
    .filter(
      (product) =>
        !exclude.has(product.id) && normalizeCategory(product.category) === category,
    )
    .map((product) => scoreProduct(targetColor, item, product))
    .filter((candidate) => candidate.score >= MIN_SCORE)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.product.price - b.product.price ||
        a.product.id.localeCompare(b.product.id),
    );
}

// ---------------------------------------------------------------------------
// F6: budget
// ---------------------------------------------------------------------------

interface Slot {
  category: LookCategory;
  item: LookItem;
  target: AdaptedShade | null;
  candidates: Candidate[];
  /** Index into candidates, or -1 when dropped. */
  choice: number;
}

export function matchLook(request: MatchRequest, catalog: CatalogItem[]): MatchResponse {
  const exclude = new Set(request.exclude ?? []);
  const seen = new Set<LookCategory>();
  const slots: Slot[] = [];

  for (const item of request.items) {
    const category = normalizeCategory(item.category);
    if (!category || seen.has(category)) {
      continue;
    }
    seen.add(category);

    const target = isMakeup(category)
      ? adaptShade(item.color, category, request.userTone)
      : null;
    const candidates = rankCandidates(
      target?.adapted ?? normalizeHex(item.color),
      item,
      category,
      catalog,
      exclude,
    ).slice(0, CANDIDATES_PER_ITEM);

    slots.push({ category, item, target, candidates, choice: candidates.length ? 0 : -1 });
  }

  const priceOf = (slot: Slot) =>
    slot.choice < 0 ? 0 : slot.candidates[slot.choice].product.price;
  const totalOf = () => slots.reduce((sum, slot) => sum + priceOf(slot), 0);

  while (totalOf() > request.budget) {
    // Swap the priciest piece for its next best cheaper match.
    const swappable = slots
      .filter((slot) => slot.choice >= 0 && cheaperIndex(slot) !== -1)
      .sort((a, b) => priceOf(b) - priceOf(a) || DROP_ORDER.indexOf(a.category) - DROP_ORDER.indexOf(b.category));

    if (swappable.length > 0) {
      const slot = swappable[0];
      slot.choice = cheaperIndex(slot);
      continue;
    }

    // Nothing cheaper left: drop the least essential remaining piece.
    const droppable = slots
      .filter((slot) => slot.choice >= 0)
      .sort((a, b) => DROP_ORDER.indexOf(a.category) - DROP_ORDER.indexOf(b.category));
    if (droppable.length === 0) {
      break;
    }
    droppable[0].choice = -1;
  }

  const matches: ProductMatch[] = [];
  const products: MatchResponse["products"] = {};
  const targets: MatchResponse["targets"] = {};
  const canSwap: MatchResponse["canSwap"] = {};
  const unmatched: string[] = [];

  for (const slot of slots) {
    if (slot.target) {
      targets[slot.category] = slot.target;
    }
    if (slot.choice < 0) {
      unmatched.push(slot.category);
      continue;
    }
    const { product, score, sharedTags } = slot.candidates[slot.choice];
    products[product.id] = product;
    canSwap[slot.category] = slot.candidates.length > 1;
    matches.push({
      category: slot.category,
      productId: product.id,
      adaptedColor: normalizeHex(product.color),
      reason: slot.target
        ? slot.target.reason
        : clothingReason(sharedTags, slot.choice > 0),
      score,
      price: product.price,
    });
  }

  const total = matches.reduce((sum, match) => sum + match.price, 0);
  return {
    matches,
    total,
    withinBudget: total <= request.budget,
    targets,
    unmatched,
    products,
    canSwap,
  };
}

function cheaperIndex(slot: Slot): number {
  const current = slot.candidates[slot.choice].product.price;
  return slot.candidates.findIndex(
    (candidate, index) => index > slot.choice && candidate.product.price < current,
  );
}

function clothingReason(sharedTags: string[], budgetSwap: boolean): string {
  const base =
    sharedTags.length > 0
      ? `Same ${sharedTags.slice(0, 2).join(", ")} feel as your inspiration`
      : "The closest colour to your inspiration";
  return budgetSwap ? `${base}, picked to fit your budget` : base;
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, "-");
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
