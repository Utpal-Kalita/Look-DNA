/**
 * Browser-only helpers. Images are downscaled before upload so requests stay
 * well under Vercel's 4.5 MB serverless body limit.
 */

const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.88;

export async function fileToJpegDataUrl(
  file: Blob,
  maxDimension = MAX_DIMENSION,
): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    return drawToJpeg(image, image.naturalWidth, image.naturalHeight, maxDimension);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function videoFrameToJpegDataUrl(
  video: HTMLVideoElement,
  mirror: boolean,
  maxDimension = MAX_DIMENSION,
): string {
  return drawToJpeg(
    video,
    video.videoWidth,
    video.videoHeight,
    maxDimension,
    mirror,
  );
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

function drawToJpeg(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxDimension: number,
  mirror = false,
): string {
  if (!width || !height) {
    throw new Error("The image has no size.");
  }

  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is not supported in this browser.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (mirror) {
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That file is not a readable image."));
    image.src = src;
  });
}
