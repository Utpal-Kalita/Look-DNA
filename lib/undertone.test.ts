import { describe, expect, it } from "vitest";

import { deriveUndertone, normalizeHex } from "@/lib/undertone";

describe("deriveUndertone", () => {
  it("classifies the agreed sample tone as warm", () => {
    expect(deriveUndertone("#C68E6B")).toBe("warm");
  });

  it("distinguishes cool and neutral hues", () => {
    expect(deriveUndertone("#D7A294")).toBe("cool");
    expect(deriveUndertone("#8F5F50")).toBe("neutral");
  });
});

describe("normalizeHex", () => {
  it("normalizes a valid color", () => {
    expect(normalizeHex(" c68e6b ")).toBe("#C68E6B");
  });

  it("rejects malformed colors", () => {
    expect(() => normalizeHex("#fff")).toThrow("Invalid color value");
  });
});
