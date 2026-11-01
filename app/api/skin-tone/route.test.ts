import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";

import { clearMemoryCache } from "@/lib/cache";
import { POST } from "@/app/api/skin-tone/route";

describe("POST /api/skin-tone", () => {
  beforeEach(() => {
    process.env.MOCK_YOUCAM = "1";
    clearMemoryCache();
  });

  it("returns the contract-shaped tone without provider credentials", async () => {
    const response = await POST(await imageRequest("http://localhost/api/skin-tone"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      userTone: { hex: "#C68E6B", undertone: "warm" },
      cached: false,
    });
  });
});

async function imageRequest(url: string): Promise<Request> {
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
  return new Request(url, { method: "POST", body: formData });
}
