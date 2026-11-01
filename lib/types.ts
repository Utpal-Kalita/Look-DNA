export type Undertone = "warm" | "cool" | "neutral";

export interface LookItem {
  category: string;
  color: string;
  style?: string[];
  finish?: string;
}

export interface UserTone {
  hex: string;
  undertone: Undertone;
}

export interface ProductMatch {
  category: string;
  productId: string;
  adaptedColor: string;
  reason: string;
  score: number;
  price: number;
}

export interface LookDnaFlow {
  items: LookItem[];
  userTone: UserTone;
  budget: number;
  matches: ProductMatch[];
  total: number;
}

export interface CatalogItem {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  image: string;
  color: string;
  style: string[];
  link: string;
}

export type QualityIssue =
  | "no_face"
  | "multiple_faces"
  | "too_dark"
  | "too_bright"
  | "too_blurry"
  | "too_small"
  | "face_too_small"
  | "face_not_centered";

export interface QualityResult {
  pass: boolean;
  issue?: QualityIssue;
  message: string;
  metrics: {
    brightness: number;
    blurVariance: number;
    faceCount: number;
    width: number;
    height: number;
  };
}

export type TryOnMode =
  | "combined"
  | "side-by-side"
  | "clothes-only"
  | "makeup-only";

export interface TryOnResult {
  image: string;
  clothesImage?: string;
  makeupImage?: string;
  mode: TryOnMode;
}

/** Categories the extractor and matcher understand. */
export const CLOTHING_CATEGORIES = ["top", "bottom", "dress", "outerwear"] as const;
export const MAKEUP_CATEGORIES = ["lipstick", "eyeshadow", "blush"] as const;
export type ClothingCategory = (typeof CLOTHING_CATEGORIES)[number];
export type MakeupCategory = (typeof MAKEUP_CATEGORIES)[number];
export type LookCategory = ClothingCategory | MakeupCategory;

/** POST /api/extract response. */
export interface ExtractResponse {
  items: LookItem[];
}

/** POST /api/match request body. */
export interface MatchRequest {
  items: LookItem[];
  userTone: UserTone | null;
  budget: number;
  /** Product ids the user swapped away from; never re-picked. */
  exclude?: string[];
}

/** POST /api/match response. `matches` and `total` follow the shared contract. */
export interface MatchResponse {
  matches: ProductMatch[];
  total: number;
  withinBudget: boolean;
  /** For makeup: the shade we aimed for after undertone adaptation. */
  targets: Record<string, { original: string; adapted: string; reason: string }>;
  /** Categories with no in-budget match, so the UI can say so. */
  unmatched: string[];
  /** Catalog details for every product in `matches`. */
  products: Record<string, CatalogItem>;
  /** Whether a further swap exists for each matched category. */
  canSwap: Record<string, boolean>;
}
