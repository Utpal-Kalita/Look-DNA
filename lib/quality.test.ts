import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { analyzeImageQuality, type FaceBox } from "@/lib/quality";

const centeredFace = async (
  _pixels: Uint8Array,
  width: number,
  height: number,
): Promise<FaceBox[]> => [
  {
    x: width * 0.3,
    y: height * 0.25,
    width: width * 0.4,
    height: height * 0.5,
  },
];

describe("analyzeImageQuality", () => {
  it("passes a sharp, centered, evenly lit image", async () => {
    const image = await checkerboard(400, 400, "#555555", "#dddddd");
    const result = await analyzeImageQuality(image, centeredFace);

    expect(result.pass).toBe(true);
    expect(result.metrics.faceCount).toBe(1);
  });

  it("returns a specific message for a dark selfie", async () => {
    const image = await checkerboard(400, 400, "#050505", "#202020");
    const result = await analyzeImageQuality(image, centeredFace);

    expect(result).toMatchObject({ pass: false, issue: "too_dark" });
  });

  it("rejects images without exactly one face", async () => {
    const image = await checkerboard(400, 400, "#555555", "#dddddd");
    const noFace = await analyzeImageQuality(image, async () => []);
    const twoFaces = await analyzeImageQuality(image, async (...args) => {
      const face = await centeredFace(...args);
      return [face[0], { ...face[0], x: 0 }];
    });

    expect(noFace.issue).toBe("no_face");
    expect(twoFaces.issue).toBe("multiple_faces");
  });

  it("uses source dimensions instead of resized detection dimensions", async () => {
    const image = await checkerboard(320, 1000, "#555555", "#dddddd");
    const result = await analyzeImageQuality(image, centeredFace);

    expect(result.issue).not.toBe("too_small");
    expect(result.metrics).toMatchObject({ width: 320, height: 1000 });
  });
});

async function checkerboard(
  width: number,
  height: number,
  first: string,
  second: string,
): Promise<Buffer> {
  const tile = 16;
  const cells: string[] = [];

  for (let y = 0; y < height; y += tile) {
    for (let x = 0; x < width; x += tile) {
      cells.push(
        `<rect x="${x}" y="${y}" width="${tile}" height="${tile}" fill="${
          (x / tile + y / tile) % 2 === 0 ? first : second
        }"/>`,
      );
    }
  }

  return sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${cells.join("")}</svg>`,
    ),
  )
    .jpeg()
    .toBuffer();
}
