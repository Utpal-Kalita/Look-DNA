import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import { readImageFromFormData } from "@/lib/image";

describe("readImageFromFormData", () => {
  it("decodes, strips metadata, and normalizes an image to JPEG", async () => {
    const input = await sharp({
      create: {
        width: 400,
        height: 500,
        channels: 3,
        background: "#C68E6B",
      },
    })
      .png()
      .toBuffer();
    const formData = new FormData();
    formData.set("selfie", new File([input], "selfie.png", { type: "image/png" }));

    const image = await readImageFromFormData(formData, "selfie", {
      minDimension: 320,
    });
    const metadata = await sharp(image.bytes).metadata();

    expect(image.contentType).toBe("image/jpeg");
    expect(image.fileName).toBe("selfie.jpg");
    expect(metadata.format).toBe("jpeg");
    expect(metadata.width).toBe(400);
    expect(metadata.height).toBe(500);
  });

  it("rejects a spoofed image MIME type", async () => {
    const formData = new FormData();
    formData.set(
      "selfie",
      new File(["not an image"], "fake.jpg", { type: "image/jpeg" }),
    );

    await expect(readImageFromFormData(formData)).rejects.toMatchObject<
      Partial<AppError>
    >({ code: "INVALID_IMAGE", status: 400 });
  });
});
