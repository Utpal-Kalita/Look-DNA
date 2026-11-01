import { afterEach, describe, expect, it, vi } from "vitest";

import { clearMemoryCache } from "@/lib/cache";
import { buildQuery, colorFromTitle, isTryOnImage, nearestColorWord, searchLiveProducts } from "@/lib/live-search";

const suggest = (products: unknown[]) =>
  new Response(JSON.stringify({ resources: { results: { products } } }), { status: 200 });

describe("live store search", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearMemoryCache();
  });

  it("builds a plain query from the look", () => {
    expect(nearestColorWord("#FFFFFF")).toBe("white");
    expect(nearestColorWord("#F3F1EA")).toBe("off white");
    expect(buildQuery({ category: "top", color: "#EFE6D2", style: ["knit", "sweater"] }, "top", "men")).toBe("cream knit sweater");
    expect(buildQuery({ category: "bottom", color: "#1C1C1C", style: ["jeans"] }, "bottom", "women")).toBe("black jeans");
  });

  it("reads colours from titles and only allows Shopify CDN images", () => {
    expect(colorFromTitle("Navy Blue Slim Fit Shirt")).toBe("#1F2A44");
    expect(colorFromTitle("Culture Shirt")).toBeNull();
    expect(isTryOnImage("https://cdn.shopify.com/s/files/1/x/shirt.jpg?v=1")).toBe(true);
    expect(isTryOnImage("https://evil.example.com/shirt.jpg")).toBe(false);
    expect(isTryOnImage("https://cdn.shopify.com/s/files/1/x/shirt.webp")).toBe(false);
  });

  it("returns in-section products that fit the category and name a colour", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      suggest([
        { title: "White Textured Shirt", price: "999.00", image: "https://cdn.shopify.com/s/files/1/a/white.jpg", url: "/products/white-textured?_pos=1", available: true },
        { title: "Culture Shirt", price: "1999.00", image: "https://cdn.shopify.com/s/files/1/a/c.jpg", url: "/products/culture", available: true },
        { title: "White Shirt Pack of 2", price: "1499.00", image: "https://cdn.shopify.com/s/files/1/a/p.jpg", url: "/products/pack", available: true },
        { title: "Black Belt", price: "499.00", image: "https://cdn.shopify.com/s/files/1/a/b.jpg", url: "/products/belt", available: true },
      ]),
    );
    const products = await searchLiveProducts([{ category: "top", color: "#F5F5F2", style: ["shirt"] }], "men");
    expect(fetchMock).toHaveBeenCalled();
    const hosts = fetchMock.mock.calls.map(([url]) => new URL(String(url)).hostname);
    expect(hosts).toContain("www.snitch.co.in");
    expect(hosts).not.toContain("www.kazo.com");
    expect(products.length).toBeGreaterThan(0);
    expect(products.every((p) => p.name.includes("White Textured Shirt"))).toBe(true);
    expect(products[0]).toMatchObject({ source: "live", category: "top", color: "#F5F5F2", price: 999 });
    expect(products[0].link).toMatch(/^https:\/\/www\.[a-z.]+\/products\/white-textured$/);
  });

  it("skips a store that fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("timeout"));
    await expect(searchLiveProducts([{ category: "dress", color: "#B22234" }], "women")).resolves.toEqual([]);
  });
});

describe("search nouns", () => {
  it("asks for jeans and tank tops when the look says so", () => {
    expect(buildQuery({ category: "bottom", color: "#5A6B7A", style: ["denim", "high-waist", "straight"] }, "bottom", "women")).toMatch(/ jeans$/);
    expect(buildQuery({ category: "top", color: "#F8F8F8", style: ["cropped", "fitted", "sleeveless"] }, "top", "women")).toBe("white cropped tank top");
  });
});
