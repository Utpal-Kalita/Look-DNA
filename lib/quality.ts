import sharp from "sharp";

import { AppError } from "@/lib/errors";
import type { QualityResult } from "@/lib/types";

const MIN_BRIGHTNESS = 55;
const MAX_BRIGHTNESS = 220;
const MIN_BLUR_VARIANCE = 80;
const MIN_DIMENSION = 320;
const DETECTION_SIZE = 640;
/** Face height as a share of the photo: above this it is a close-up selfie. */
const MAX_FACE_SHARE = 0.3;
/** Below this the face is too small to read skin tone reliably. */
const MIN_FACE_SHARE = 0.05;
const MIN_FACE_PIXELS = 70;

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

type FaceDetector = (
  pixels: Uint8Array,
  width: number,
  height: number,
) => Promise<FaceBox[]>;

let faceModelPromise:
  | ReturnType<typeof import("@tensorflow-models/blazeface").load>
  | undefined;

export async function analyzeImageQuality(
  bytes: Buffer,
  detectFaces: FaceDetector = detectFaceBoxes,
): Promise<QualityResult> {
  let processed: Awaited<ReturnType<typeof prepareImage>>;

  try {
    processed = await prepareImage(bytes);
  } catch {
    throw new AppError(
      "The uploaded file is not a valid JPEG or PNG image.",
      400,
      "INVALID_IMAGE",
    );
  }

  const { rgb, grayscale, width, height, sourceWidth, sourceHeight } = processed;
  let faces: FaceBox[];

  try {
    faces = await detectFacesInPhoto(rgb, width, height, detectFaces);
  } catch {
    throw new AppError(
      "The local face detector could not be loaded. Please try again.",
      503,
      "FACE_DETECTOR_UNAVAILABLE",
    );
  }

  const faceCount = faces.length;
  const face = faces[0];
  const region = face
    ? extractFaceRegion(rgb, grayscale, width, height, face)
    : { rgb, grayscale, width, height };
  const brightness = calculateBrightness(region.rgb);
  const blurVariance = calculateLaplacianVariance(
    region.grayscale,
    region.width,
    region.height,
  );
  const metrics = {
    brightness: round(brightness),
    blurVariance: round(blurVariance),
    faceCount,
    width: sourceWidth,
    height: sourceHeight,
  };

  if (Math.min(sourceWidth, sourceHeight) < MIN_DIMENSION) {
    return fail(
      "too_small",
      "Use a larger, sharper photo of you from head to at least your hips.",
      metrics,
    );
  }

  if (!face) {
    return fail(
      "no_face",
      "We couldn't see your face. Stand facing the camera, head to hips in the frame, face clearly visible.",
      metrics,
    );
  }

  if (faceCount > 1) {
    return fail(
      "multiple_faces",
      "Use a photo with only you in the frame.",
      metrics,
    );
  }

  // Try-on needs the body in the frame and skin tone needs a readable face,
  // so the photo should run from head to at least the hips.
  const faceShare = face.height / height;
  if (faceShare > MAX_FACE_SHARE) {
    return fail(
      "too_close",
      "Step back so we can see you from head to at least your hips. Try-on needs your body in the frame.",
      metrics,
    );
  }

  if (face.width * (sourceWidth / width) < MIN_FACE_PIXELS || faceShare < MIN_FACE_SHARE) {
    return fail(
      "face_too_small",
      "Come a little closer: we need your face clear enough to read your skin tone, with your body from head to hips.",
      metrics,
    );
  }

  const faceCenterX = face.x + face.width / 2;
  const faceCenterY = face.y + face.height / 2;
  if (Math.abs(faceCenterX - width / 2) > width * 0.3 || faceCenterY > height * 0.5) {
    return fail(
      "face_not_centered",
      "Stand in the middle of the frame, facing the camera, with your head near the top.",
      metrics,
    );
  }

  if (brightness < MIN_BRIGHTNESS) {
    return fail(
      "too_dark",
      "The photo is too dark. Face a window or move to brighter light.",
      metrics,
    );
  }

  if (brightness > MAX_BRIGHTNESS) {
    return fail(
      "too_bright",
      "The photo is overexposed. Move away from harsh direct light.",
      metrics,
    );
  }

  if (blurVariance < MIN_BLUR_VARIANCE) {
    return fail(
      "too_blurry",
      "The photo is blurry. Hold the camera steady and tap to focus.",
      metrics,
    );
  }

  return {
    pass: true,
    message: "Photo looks good.",
    metrics,
  };
}

/**
 * BlazeFace scales its input to 128 px, so in a head-to-hips photo the face
 * can be too small to find. Try the whole photo, then the upper-centre square
 * where the head sits, and map boxes back to the photo.
 */
async function detectFacesInPhoto(
  rgb: Uint8Array,
  width: number,
  height: number,
  detectFaces: FaceDetector,
): Promise<FaceBox[]> {
  const faces = await detectFaces(rgb, width, height);
  if (faces.length > 0) {
    return faces;
  }

  const side = Math.round(Math.min(width, height * 0.5));
  const left = Math.round((width - side) / 2);
  const crop = new Uint8Array(side * side * 3);
  for (let row = 0; row < side; row += 1) {
    const from = (row * width + left) * 3;
    crop.set(rgb.subarray(from, from + side * 3), row * side * 3);
  }
  const cropped = await detectFaces(crop, side, side);
  return cropped.map((box) => ({ ...box, x: box.x + left }));
}

/**
 * The face in a photo, in source pixels, with room around it: used to send
 * skin tone analysis a face crop from a head-to-hips photo.
 */
export async function locateFaceCrop(
  bytes: Buffer,
  detectFaces: FaceDetector = detectFaceBoxes,
): Promise<{ left: number; top: number; width: number; height: number } | null> {
  const { rgb, width, height, sourceWidth, sourceHeight } = await prepareImage(bytes);
  const faces = await detectFacesInPhoto(rgb, width, height, detectFaces);
  const face = faces[0];
  if (!face) {
    return null;
  }
  const scale = sourceWidth / width;
  // BlazeFace boxes the inner face; 1.6x keeps hair and chin while the face
  // still fills most of the crop, which YouCam skin tone needs.
  const size = Math.max(face.width, face.height) * 1.6 * scale;
  const centerX = (face.x + face.width / 2) * scale;
  const centerY = (face.y + face.height / 2) * scale;
  const side = Math.round(Math.min(size, sourceWidth, sourceHeight));
  const left = Math.round(Math.min(Math.max(centerX - side / 2, 0), sourceWidth - side));
  const top = Math.round(Math.min(Math.max(centerY - side / 2, 0), sourceHeight - side));
  return { left, top, width: side, height: side };
}

export function calculateBrightness(rgb: Uint8Array): number {
  let total = 0;
  for (let index = 0; index < rgb.length; index += 3) {
    total +=
      rgb[index] * 0.2126 +
      rgb[index + 1] * 0.7152 +
      rgb[index + 2] * 0.0722;
  }

  return total / (rgb.length / 3);
}

export function calculateLaplacianVariance(
  grayscale: Uint8Array,
  width: number,
  height: number,
): number {
  if (width < 3 || height < 3) {
    return 0;
  }

  let count = 0;
  let sum = 0;
  let squaredSum = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const laplacian =
        grayscale[index - width] +
        grayscale[index - 1] -
        4 * grayscale[index] +
        grayscale[index + 1] +
        grayscale[index + width];

      sum += laplacian;
      squaredSum += laplacian * laplacian;
      count += 1;
    }
  }

  const mean = sum / count;
  return squaredSum / count - mean * mean;
}

async function prepareImage(bytes: Buffer): Promise<{
  rgb: Uint8Array;
  grayscale: Uint8Array;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
}> {
  const source = sharp(bytes).rotate();
  const metadata = await source.metadata();
  const sourceWidth = metadata.autoOrient.width ?? metadata.width;
  const sourceHeight = metadata.autoOrient.height ?? metadata.height;
  if (!sourceWidth || !sourceHeight) {
    throw new Error("Image dimensions are unavailable");
  }

  const { data, info } = await source
    .resize({
      width: DETECTION_SIZE,
      height: DETECTION_SIZE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rgb = new Uint8Array(data);
  const grayscale = new Uint8Array(info.width * info.height);

  for (let pixel = 0; pixel < grayscale.length; pixel += 1) {
    const index = pixel * info.channels;
    grayscale[pixel] = Math.round(
      rgb[index] * 0.2126 +
        rgb[index + 1] * 0.7152 +
        rgb[index + 2] * 0.0722,
    );
  }

  return {
    rgb,
    grayscale,
    width: info.width,
    height: info.height,
    sourceWidth,
    sourceHeight,
  };
}

async function detectFaceBoxes(
  pixels: Uint8Array,
  width: number,
  height: number,
): Promise<FaceBox[]> {
  const [blazeface, tf] = await Promise.all([
    import("@tensorflow-models/blazeface"),
    import("@tensorflow/tfjs-core"),
    import("@tensorflow/tfjs-backend-cpu"),
  ]);
  await tf.setBackend("cpu");
  await tf.ready();

  faceModelPromise ??= blazeface.load();
  const model = await faceModelPromise;
  const input = tf.tensor3d(pixels, [height, width, 3], "int32");

  try {
    const faces = await model.estimateFaces(input, false);
    return faces.map((face) => {
      const [x1, y1] = face.topLeft as [number, number];
      const [x2, y2] = face.bottomRight as [number, number];
      return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
    });
  } finally {
    input.dispose();
  }
}

function extractFaceRegion(
  rgb: Uint8Array,
  grayscale: Uint8Array,
  imageWidth: number,
  imageHeight: number,
  face: FaceBox,
): {
  rgb: Uint8Array;
  grayscale: Uint8Array;
  width: number;
  height: number;
} {
  const paddingX = face.width * 0.1;
  const paddingY = face.height * 0.1;
  const left = Math.max(0, Math.floor(face.x - paddingX));
  const top = Math.max(0, Math.floor(face.y - paddingY));
  const right = Math.min(imageWidth, Math.ceil(face.x + face.width + paddingX));
  const bottom = Math.min(imageHeight, Math.ceil(face.y + face.height + paddingY));
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const regionRgb = new Uint8Array(width * height * 3);
  const regionGray = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    const sourcePixel = (top + y) * imageWidth + left;
    const targetPixel = y * width;
    regionGray.set(
      grayscale.subarray(sourcePixel, sourcePixel + width),
      targetPixel,
    );
    regionRgb.set(
      rgb.subarray(sourcePixel * 3, (sourcePixel + width) * 3),
      targetPixel * 3,
    );
  }

  return { rgb: regionRgb, grayscale: regionGray, width, height };
}

function fail(
  issue: NonNullable<QualityResult["issue"]>,
  message: string,
  metrics: QualityResult["metrics"],
): QualityResult {
  return { pass: false, issue, message, metrics };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
