import sharp from "sharp";

import { hashBytes, type ImageUpload } from "@/lib/image";
import { locateFaceCrop } from "@/lib/quality";

/**
 * The photo runs head to hips for try-on, so skin tone analysis gets a crop
 * of just the face, enlarged to give YouCam enough detail. Falls back to the
 * whole photo if no face is found locally.
 */
export async function faceCrop(image: ImageUpload, extraRotation = 0): Promise<ImageUpload> {
  let box: Awaited<ReturnType<typeof locateFaceCrop>> = null;
  try {
    box = await locateFaceCrop(image.bytes);
  } catch {
    box = null;
  }
  if (!box) {
    console.warn("skin-tone: no face found locally, sending the whole photo");
    return image;
  }
  const rotation = levelRotation(box.roll) + extraRotation;
  console.info(`skin-tone: sending a ${box.width}px face crop, rotated ${rotation.toFixed(1)} deg`);

  const bytes = await levelledFace(image.bytes, box, rotation);
  return { bytes, contentType: "image/jpeg", fileName: "face.jpg", hash: hashBytes(bytes) };
}

/**
 * YouCam rejects a tilted head ("tilted too far to the right"), so rotate the
 * face level using the eye line before cropping. Takes a wider area first so
 * the rotation does not cut into the face, then keeps the centre square.
 */
export async function levelledFace(
  bytes: Buffer,
  box: { left: number; top: number; width: number; height: number },
  rotation: number,
): Promise<Buffer> {
  if (Math.abs(rotation) < 1) {
    return sharp(bytes)
      .extract({ left: box.left, top: box.top, width: box.width, height: box.height })
      .resize({ width: 720, height: 720, fit: "inside" }).jpeg({ quality: 92 }).toBuffer();
  }

  const meta = await sharp(bytes).metadata();
  const sourceWidth = meta.width ?? box.width;
  const sourceHeight = meta.height ?? box.height;
  const pad = Math.round(box.width * 0.35);
  const wide = {
    left: Math.max(0, box.left - pad),
    top: Math.max(0, box.top - pad),
    width: 0,
    height: 0,
  };
  wide.width = Math.min(sourceWidth, box.left + box.width + pad) - wide.left;
  wide.height = Math.min(sourceHeight, box.top + box.height + pad) - wide.top;

  const rotated = await sharp(bytes)
    .extract(wide)
    .rotate(rotation, { background: { r: 255, g: 255, b: 255 } })
    .toBuffer({ resolveWithObject: true });
  // The face centre stays at the centre of the rotated canvas (up to the clamp).
  const cx = rotated.info.width / 2 + (box.left + box.width / 2 - (wide.left + wide.width / 2));
  const cy = rotated.info.height / 2 + (box.top + box.height / 2 - (wide.top + wide.height / 2));
  const side = Math.min(box.width, rotated.info.width, rotated.info.height);
  const left = Math.round(Math.min(Math.max(cx - side / 2, 0), rotated.info.width - side));
  const top = Math.round(Math.min(Math.max(cy - side / 2, 0), rotated.info.height - side));
  return sharp(rotated.data)
    .extract({ left, top, width: side, height: side })
    .resize({ width: 720, height: 720, fit: "inside" })
    .jpeg({ quality: 92 })
    .toBuffer();
}

/**
 * The sharp rotation (degrees, clockwise) that levels the eye line. BlazeFace
 * eye points are rough, so correct 60% of the measured tilt, at most 10 deg.
 */
export function levelRotation(roll: number): number {
  if (Math.abs(roll) < 3 || Math.abs(roll) > 40) {
    return 0;
  }
  return -Math.max(-10, Math.min(10, roll * 0.6));
}

/**
 * Extra rotation for a retry when YouCam says which way the head leans:
 * "tilted too far to the right" means the image's right side is low, so turn
 * the image anticlockwise (negative in sharp), and the reverse for left.
 */
export function tiltRetryRotation(message: string): number | null {
  const match = /tilted[^.]*?\b(left|right)\b/i.exec(message);
  if (!match) {
    return null;
  }
  return match[1].toLowerCase() === "right" ? -7 : 7;
}

/** YouCam errors about head pose only; the face itself is usable. */
export function isPoseProblem(message: string): boolean {
  return /\b(tilted|turned|facing forward|not facing|upward|downward|angle|pose|profile)\b/i.test(message);
}

/**
 * A local skin tone estimate from the levelled face crop, used when YouCam
 * declines only because of head pose. Takes skin-coloured pixels (YCbCr rule)
 * from the cheeks, nose and forehead area and returns their median colour.
 */
export async function estimateSkinTone(faceBytes: Buffer): Promise<string | null> {
  const { data, info } = await sharp(faceBytes)
    .resize(160, 160, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const reds: number[] = [];
  const greens: number[] = [];
  const blues: number[] = [];
  for (let y = Math.round(info.height * 0.25); y < info.height * 0.72; y += 1) {
    for (let x = Math.round(info.width * 0.28); x < info.width * 0.72; x += 1) {
      const i = (y * info.width + x) * 3;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      if (cr >= 133 && cr <= 180 && cb >= 77 && cb <= 130 && luma > 40 && luma < 240) {
        reds.push(r);
        greens.push(g);
        blues.push(b);
      }
    }
  }
  if (reds.length < 200) {
    return null;
  }
  const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  return `#${[median(reds), median(greens), median(blues)].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}
