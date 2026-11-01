import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/tryon/route";
import { clearMemoryCache } from "@/lib/cache";

describe("POST /api/tryon", () => {
  beforeEach(() => {
    process.env.MOCK_YOUCAM = "1";
    clearMemoryCache();
  });

  it("returns a saved combined result in mock mode", async () => {
    const response = await POST(await tryOnRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe("combined");
    expect(body.image).toMatch(/^data:image\/svg\+xml/);
    expect(body.cached).toBe(false);
  });
});

async function tryOnRequest(): Promise<Request> {
  const image = await sharp({
    create: {
      width: 400,
      height: 500,
      channels: 3,
      background: "#C68E6B",
    },
  })
    .jpeg()
    .toBuffer();
  const formData = new FormData();
  formData.set("selfie", new File([image], "selfie.jpg", { type: "image/jpeg" }));
  formData.set(
    "matches",
    JSON.stringify([
      {
        category: "lipstick",
        productId: "lip-014",
        adaptedColor: "#A8473F",
        reason: "A warmer red suits your warm undertone",
        score: 0.86,
        price: 499,
      },
    ]),
  );
  return new Request("http://localhost/api/tryon", {
    method: "POST",
    body: formData,
  });
}
