import { describe, expect, it } from "vitest";

import catalog from "@/data/catalog.json";
import { adaptShade, matchLook } from "@/lib/matching";
import type { CatalogItem, LookItem } from "@/lib/types";

const products = catalog as CatalogItem[];
const look: LookItem[] = [
  { category: "top", color: "#C8A2C8", style: ["oversized", "knit"] },
  { category: "bottom", color: "#4A6FA5", style: ["wide-leg", "denim"] },
  { category: "lipstick", color: "#B5485D", finish: "matte" },
  { category: "blush", color: "#D9828A", finish: "satin" },
];

describe("adaptShade", () => {
  it("warms a shade for a warm undertone and explains why", () => {
    const result = adaptShade("#B5485D", "lipstick", { hex: "#C68E6B", undertone: "warm" });
    expect(result.adapted).not.toBe(result.original);
    expect(result.reason).toMatch(/warmer .* warm undertone/);
  });

  it("keeps the shade when there is no skin tone", () => {
    const result = adaptShade("#B5485D", "lipstick", null);
    expect(result.adapted).toBe("#B5485D");
  });
});

describe("matchLook", () => {
  it("picks the closest top by colour and style, and never scores 100%", () => {
    const fixture: CatalogItem[] = [
      { id: "t-lilac", name: "Lilac knit", brand: "A", category: "top", price: 900, image: "/a.png", color: "#C8A2C8", style: ["oversized", "knit"], link: "https://example.com/a" },
      { id: "t-black", name: "Black tee", brand: "B", category: "top", price: 500, image: "/b.png", color: "#1C1C1C", style: ["fitted"], link: "https://example.com/b" },
    ];
    const result = matchLook({ items: [look[0]], userTone: null, budget: 100000 }, fixture);
    const top = result.matches[0];
    expect(top.productId).toBe("t-lilac");
    expect(top.score).toBeGreaterThan(0.9);
    expect(top.score).toBeLessThan(1);
    expect(result.products["t-lilac"].name).toBe("Lilac knit");
  });

  it("stays under budget for every budget from 500 to 10000", () => {
    for (let budget = 500; budget <= 10000; budget += 250) {
      const result = matchLook(
        { items: look, userTone: { hex: "#8D5524", undertone: "warm" }, budget },
        products,
      );
      expect(result.total).toBeLessThanOrEqual(budget);
      expect(result.withinBudget).toBe(true);
    }
  });

  it("swaps the priciest piece before dropping anything", () => {
    const full = matchLook({ items: look, userTone: null, budget: 100000 }, products);
    const tight = matchLook({ items: look, userTone: null, budget: full.total - 200 }, products);
    expect(tight.matches).toHaveLength(full.matches.length);
    expect(tight.total).toBeLessThanOrEqual(full.total - 200);
  });

  it("never re-picks excluded products", () => {
    const first = matchLook({ items: look, userTone: null, budget: 100000 }, products);
    const lip = first.matches.find((m) => m.category === "lipstick")!;
    const second = matchLook(
      { items: look, userTone: null, budget: 100000, exclude: [lip.productId] },
      products,
    );
    expect(second.matches.find((m) => m.category === "lipstick")?.productId).not.toBe(lip.productId);
  });

  it("is deterministic and ignores unknown categories", () => {
    const items = [...look, { category: "handbag", color: "#000000" }];
    const a = matchLook({ items, userTone: null, budget: 3000 }, products);
    const b = matchLook({ items, userTone: null, budget: 3000 }, products);
    expect(a).toEqual(b);
    expect(a.matches.some((m) => m.category === "handbag")).toBe(false);
  });
});
