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
