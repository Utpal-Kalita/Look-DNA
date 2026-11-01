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
