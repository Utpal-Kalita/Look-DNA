import { createHash } from "node:crypto";

import { getOrComputeCached } from "@/lib/cache";
import { deltaE } from "@/lib/color";
import { normalizeCategory } from "@/lib/matching";
import type { CatalogItem, LookCategory, LookItem, ShopFor } from "@/lib/types";

/**
 * Live store search: query the partner brands' own Shopify search in real
 * time for each clothing item in a look, so matching is not limited to the
 * curated catalog. Results are scored by the same deterministic matcher.
 */

type Section = ShopFor;

interface Store {
  host: string;
  brand: string;
  sections: Section[];
  categories: LookCategory[];
}

const STORES: Store[] = [
  { host: "www.snitch.co.in", brand: "Snitch", sections: ["men"], categories: ["top", "bottom", "outerwear"] },
  { host: "www.bonkerscorner.com", brand: "Bonkers Corner", sections: ["men", "women"], categories: ["top", "bottom"] },
  { host: "www.styleunion.in", brand: "Style Union", sections: ["men", "women"], categories: ["top", "bottom", "dress", "kurta"] },
  { host: "www.kazo.com", brand: "Kazo", sections: ["women"], categories: ["top", "bottom", "dress", "outerwear"] },
  { host: "www.forevernew.co.in", brand: "Forever New", sections: ["women"], categories: ["top", "bottom", "dress", "outerwear"] },
  { host: "www.saltattire.com", brand: "Salt Attire", sections: ["women"], categories: ["top", "bottom", "dress", "outerwear"] },
  { host: "www.thelabellife.com", brand: "The Label Life", sections: ["women"], categories: ["top", "bottom", "dress", "outerwear"] },
  { host: "www.libas.in", brand: "Libas", sections: ["women"], categories: ["kurta"] },
];

const STORE_TIMEOUT_MS = 3_500;
const RESULTS_PER_STORE = 10;
const LIVE_CACHE_TTL_SECONDS = 30 * 60;

/** Colour words used both to build queries and to read a colour from a title. */
const COLOR_WORDS: [string, string][] = [
  ["off white", "#F2EEE3"], ["ivory", "#F4EEDC"], ["cream", "#EFE6D2"], ["white", "#F5F5F2"],
  ["black", "#1C1C1C"], ["charcoal", "#3C3C3C"], ["grey", "#8C8C8C"], ["navy", "#1F2A44"],
  ["beige", "#D9C7A8"], ["khaki", "#B5A27A"], ["camel", "#C19A6B"], ["tan", "#C8A27A"],
  ["brown", "#6B4A35"], ["rust", "#B7472A"], ["maroon", "#6E1F2A"], ["wine", "#5E1F2E"],
  ["red", "#B22234"], ["coral", "#E2725B"], ["peach", "#F2B49B"], ["pink", "#F2A7BB"],
  ["fuchsia", "#C2185B"], ["mauve", "#B784A7"], ["lilac", "#C8A2C8"], ["lavender", "#B9A6D9"],
  ["purple", "#6B3F8C"], ["sky blue", "#9CC3E6"], ["light blue", "#A9C6E8"], ["blue", "#3B5FA8"],
  ["teal", "#1E7F7F"], ["mint", "#A8DCC5"], ["sage", "#9CAF88"], ["olive", "#6B6B3A"],
  ["green", "#3E7A4A"], ["mustard", "#D4A017"], ["yellow", "#F2D04A"], ["orange", "#E8833A"],
];

const CATEGORY_NOUN: Record<string, { women: string; men: string; pattern: RegExp }> = {
  top: { women: "top", men: "shirt", pattern: /\b(top|shirt|tee|t-shirt|polo|sweater|blouse|cardigan|sweatshirt|tank|cami)\b/i },
  bottom: { women: "trousers", men: "trousers", pattern: /\b(pants?|trousers?|jeans|skirt|joggers|chinos|shorts|palazzos?|cargos?)\b/i },
  dress: { women: "dress", men: "dress", pattern: /\bdress\b/i },
  kurta: { women: "kurta", men: "kurta", pattern: /\b(kurta|kurti|suit|anarkali)\b/i },
  outerwear: { women: "jacket", men: "jacket", pattern: /\b(jacket|blazer|coat|overshirt|bomber|shacket|windcheater)\b/i },
};

/** Style words that make a better search noun than the category default. */
const NOUN_STYLES = ["jeans", "skirt", "chinos", "joggers", "cargo", "blazer", "overshirt", "bomber", "polo", "sweater", "cardigan", "shirt", "anarkali"];

export function liveSearchEnabled(): boolean {
  return process.env.LIVE_SEARCH !== "0";
}

/** Live products for every clothing item in a look, for the chosen section. */
export async function searchLiveProducts(items: LookItem[], shopFor: Section = "women"): Promise<CatalogItem[]> {
  const searches: Promise<CatalogItem[]>[] = [];
  for (const item of items) {
    const category = normalizeCategory(item.category);
    if (!category || !CATEGORY_NOUN[category]) {
      continue;
    }
    const query = buildQuery(item, category, shopFor);
    for (const store of STORES) {
      if (store.sections.includes(shopFor) && store.categories.includes(category)) {
        searches.push(searchStore(store, query, category, shopFor));
      }
    }
  }

  const results = await Promise.all(searches);
  const seen = new Set<string>();
  return results.flat().filter((product) => {
    if (seen.has(product.id)) return false;
    seen.add(product.id);
    return true;
  });
}

export function buildQuery(item: LookItem, category: LookCategory, shopFor: Section): string {
  const color = nearestColorWord(item.color);
  const styles = (item.style ?? []).map((s) => s.toLowerCase());
  const noun = styles.find((s) => NOUN_STYLES.includes(s)) ?? CATEGORY_NOUN[category][shopFor];
  const describer = styles.find((s) => !NOUN_STYLES.includes(s) && /^[a-z-]+$/.test(s));
  return [color, describer, noun].filter(Boolean).join(" ").replace(/-/g, " ");
}

export function nearestColorWord(hex: string): string {
  let best = COLOR_WORDS[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const entry of COLOR_WORDS) {
    const distance = deltaE(hex, entry[1]);
    if (distance < bestDistance) {
      best = entry;
      bestDistance = distance;
    }
  }
  return best[0];
}

/** The product's colour from a colour word in its title, or null. */
export function colorFromTitle(title: string): string | null {
  const text = ` ${title.toLowerCase()} `;
  for (const [word, hex] of COLOR_WORDS) {
    if (new RegExp(`[^a-z]${word}[^a-z]`).test(text)) {
      return hex;
    }
  }
  return null;
}

interface SuggestProduct {
  title?: string;
  price?: string;
  image?: string;
  url?: string;
  available?: boolean;
  tags?: string[];
}

async function searchStore(store: Store, query: string, category: LookCategory, shopFor: Section): Promise<CatalogItem[]> {
  const sectionQuery = store.sections.length > 1 ? `${query} ${shopFor === "men" ? "men" : "women"}` : query;
  const key = `look-dna:live:v1:${store.host}:${category}:${shopFor}:${sectionQuery}`;
  try {
    const { value } = await getOrComputeCached(key, LIVE_CACHE_TTL_SECONDS, () =>
      fetchSuggestions(store, sectionQuery, category, shopFor),
    );
    return value;
  } catch (error) {
    console.warn(`live search: ${store.host} failed`, error instanceof Error ? error.message : error);
    return [];
  }
}

async function fetchSuggestions(store: Store, query: string, category: LookCategory, shopFor: Section): Promise<CatalogItem[]> {
  const url = new URL(`https://${store.host}/search/suggest.json`);
  url.searchParams.set("q", query);
  url.searchParams.set("resources[type]", "product");
  url.searchParams.set("resources[limit]", String(RESULTS_PER_STORE));
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "LookDNA/1.0 (+https://look-dna.vercel.app)" },
    signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const payload = (await response.json()) as { resources?: { results?: { products?: SuggestProduct[] } } };
  const products = payload.resources?.results?.products ?? [];
  return products.flatMap((product) => toCatalogItem(store, product, category, shopFor) ?? []);
}

export function toCatalogItem(store: Store, product: SuggestProduct, category: LookCategory, shopFor: Section): CatalogItem | null {
  const title = product.title?.trim();
  const price = Number.parseFloat(product.price ?? "");
  if (!title || !product.url || !product.image || !Number.isFinite(price) || price <= 0 || product.available === false) {
    return null;
  }
  if (!CATEGORY_NOUN[category].pattern.test(title) || /\b(set|combo|pack of)\b/i.test(title)) {
    return null;
  }
  // A section store's title can still say "women" in a men's search and vice versa.
  if (shopFor === "men" && /\bwomen'?s?\b/i.test(title)) return null;
  if (shopFor === "women" && /\bmen'?s?\b/i.test(title) && !/\bwomen\b/i.test(title)) return null;

  const color = colorFromTitle(title);
  const image = product.image.startsWith("//") ? `https:${product.image}` : product.image;
  if (!color || !isTryOnImage(image)) {
    return null;
  }
  const path = product.url.split("?")[0];
  const link = `https://${store.host}${path}`;
  return {
    id: `live-${createHash("sha1").update(link).digest("hex").slice(0, 10)}`,
    name: title.slice(0, 90),
    brand: store.brand,
    category,
    price: Math.round(price),
    image: image.includes("?") ? `${image}&width=800` : `${image}?width=800`,
    color,
    style: styleFromTitle(title),
    link,
    gender: store.sections.length > 1 ? shopFor : store.sections[0],
    source: "live",
  };
}

const TITLE_STYLES = ["oversized", "relaxed", "regular", "slim", "fitted", "boxy", "cropped", "straight", "wide-leg", "wide leg", "baggy", "tapered", "high-waist", "high rise", "mini", "midi", "maxi", "a-line", "flared", "wrap", "slip", "bodycon", "tiered", "ruffle", "pleated", "knit", "knitted", "denim", "satin", "linen", "cotton", "leather", "corduroy", "floral", "striped", "stripes", "checked", "checks", "printed", "embroidered", "graphic", "polo", "overshirt", "cargo", "chinos", "joggers", "crew neck", "v-neck", "anarkali", "straight-kurta"];

export function styleFromTitle(title: string): string[] {
  const text = title.toLowerCase();
  const canonical: Record<string, string> = { "wide leg": "wide-leg", "high rise": "high-waist", knitted: "knit", stripes: "striped", checks: "checked", "crew neck": "crew-neck" };
  return [...new Set(TITLE_STYLES.filter((word) => text.includes(word)).map((word) => canonical[word] ?? word))].slice(0, 5);
}

/** Only Shopify CDN JPEG/PNG images are passed to try-on (no arbitrary URLs). */
export function isTryOnImage(image: string): boolean {
  try {
    const url = new URL(image);
    return url.protocol === "https:" && url.hostname === "cdn.shopify.com" && /\.(jpe?g|png)$/i.test(url.pathname);
  } catch {
    return false;
  }
}
