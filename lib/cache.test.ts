import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearMemoryCache,
  createCacheKey,
  getCached,
  getOrComputeCached,
  setCached,
} from "@/lib/cache";

describe("cache", () => {
  beforeEach(() => {
    clearMemoryCache();
    delete process.env.MOCK_YOUCAM;
  });

  it("separates mock and live cache entries", () => {
    const live = createCacheKey("skin-tone", "image-hash");
    process.env.MOCK_YOUCAM = "1";
    const mock = createCacheKey("skin-tone", "image-hash");

    expect(live).not.toBe(mock);
  });

  it("stores and returns a value", async () => {
    await setCached("test-key", { ok: true }, 60);
    await expect(getCached("test-key")).resolves.toEqual({ ok: true });
  });

  it("deduplicates concurrent producers in one server instance", async () => {
    const producer = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { value: 42 };
    });

    const [first, second] = await Promise.all([
      getOrComputeCached("dedupe-key", 60, producer),
      getOrComputeCached("dedupe-key", 60, producer),
    ]);

    expect(first.value).toEqual({ value: 42 });
    expect(second.value).toEqual({ value: 42 });
    expect(producer).toHaveBeenCalledTimes(1);
  });
});
