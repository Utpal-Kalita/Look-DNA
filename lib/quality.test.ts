import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { analyzeImageQuality, analyzeWithAutoCrop, type FaceBox } from "@/lib/quality";

const centeredFace = async (
  _pixels: Uint8Array,
  width: number,
  height: number,
): Promise<FaceBox[]> => [
  // A head-to-hips photo: the face is near the top, about a sixth of the height.
  {
    x: width * 0.4,
    y: height * 0.08,
    width: width * 0.2,
    height: height * 0.2,
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

describe("head-to-hips photos", () => {
  it("asks a close-up selfie to step back", async () => {
    const image = await checkerboard(400, 400, "#555555", "#dddddd");
    const result = await analyzeImageQuality(image, async (_p, width, height) => [
      { x: width * 0.3, y: height * 0.2, width: width * 0.4, height: height * 0.5 },
    ]);
    expect(result).toMatchObject({ pass: false, issue: "too_close" });
  });

  it("finds a small face by looking again at the top of the photo", async () => {
    const image = await checkerboard(400, 800, "#555555", "#dddddd");
    let calls = 0;
    const result = await analyzeImageQuality(image, async (_p, width, height) => {
      calls += 1;
      // The full photo finds nothing; the upper square crop finds the face.
      return width === height ? [{ x: width * 0.4, y: height * 0.15, width: width * 0.2, height: height * 0.25 }] : [];
    });
    expect(calls).toBe(2);
    expect(result.metrics.faceCount).toBe(1);
    expect(result.issue).not.toBe("no_face");
  });
});

describe("auto crop", () => {
  // Landscape photo: a small face; after cropping to portrait, a head-to-hips face.
  const sceneDetector = async (_p: Uint8Array, width: number, height: number): Promise<FaceBox[]> =>
    width > height
      ? [{ x: width * 0.47, y: height * 0.1, width: width * 0.06, height: height * 0.09 }]
      : [{ x: width * 0.4, y: height * 0.1, width: width * 0.2, height: height * 0.12 }];

  it("frames a small, landscape subject head to hips at 3:4", async () => {
    const image = await checkerboard(1600, 1000, "#555555", "#dddddd");
    const result = await analyzeWithAutoCrop(image, sceneDetector);
    expect(result.pass).toBe(true);
    expect(result.crop).toBeDefined();
    const crop = result.crop!;
    expect((crop.width * 1600) / (crop.height * 1000)).toBeCloseTo(0.75, 1);
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.width).toBeLessThanOrEqual(1.0001);
  });

  it("leaves a well-framed photo alone", async () => {
    const image = await checkerboard(400, 400, "#555555", "#dddddd");
    const result = await analyzeWithAutoCrop(image, centeredFace);
    expect(result.pass).toBe(true);
    expect(result.crop).toBeUndefined();
  });
});
