import { createHash } from "node:crypto";

import sharp from "sharp";

import { AppError } from "@/lib/errors";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_MULTIPART_BYTES = 11 * 1024 * 1024;
const NORMALIZED_MAX_DIMENSION = 1920;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);

interface ImageOptions {
  minDimension?: number;
}

export interface ImageUpload {
  bytes: Buffer;
  contentType: "image/jpeg" | "image/png";
  fileName: string;
  hash: string;
}

export async function readImageUpload(
  request: Request,
  fieldName = "selfie",
  options?: ImageOptions,
): Promise<ImageUpload> {
  assertRequestSize(request);

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    throw new AppError(
      "Send the image as multipart/form-data.",
      400,
      "INVALID_FORM_DATA",
    );
  }

  return readImageFromFormData(formData, fieldName, options);
}

export async function readImageFromFormData(
  formData: FormData,
  fieldName = "selfie",
  options?: ImageOptions,
): Promise<ImageUpload> {
  const value = formData.get(fieldName);
  if (!(value instanceof File)) {
    throw new AppError(
      `The '${fieldName}' image is required.`,
      400,
      "IMAGE_REQUIRED",
    );
  }

  if (!ALLOWED_IMAGE_TYPES.has(value.type)) {
    throw new AppError(
      "Use a JPEG or PNG image.",
      415,
      "UNSUPPORTED_IMAGE_TYPE",
    );
  }

  if (value.size === 0 || value.size > MAX_IMAGE_BYTES) {
    throw new AppError(
      "The image must be larger than 0 bytes and no more than 10 MB.",
      413,
      "INVALID_IMAGE_SIZE",
    );
  }

  const uploadedBytes = Buffer.from(await value.arrayBuffer());
  let normalized: Awaited<ReturnType<typeof normalizeImage>>;

  try {
    normalized = await normalizeImage(
      uploadedBytes,
      options?.minDimension ?? 100,
    );
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(
      "The uploaded file is not a valid JPEG or PNG image.",
      400,
      "INVALID_IMAGE",
    );
  }

  return {
    bytes: normalized,
    contentType: "image/jpeg",
    fileName: safeFileName(value.name, "image/jpeg"),
    hash: hashBytes(normalized),
  };
}

export function assertRequestSize(request: Request): void {
  const contentLength = Number.parseInt(
    request.headers.get("content-length") ?? "",
    10,
  );

  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) {
    throw new AppError(
      "The multipart request must be no more than 11 MB.",
      413,
      "REQUEST_TOO_LARGE",
    );
  }
}

export function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeFileName(name: string, contentType: ImageUpload["contentType"]): string {
  const extension = contentType === "image/png" ? ".png" : ".jpg";
  const baseName = name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .slice(0, 80);

  return `${baseName || "image"}${extension}`;
}

async function normalizeImage(bytes: Buffer, minDimension: number): Promise<Buffer> {
  const source = sharp(bytes, { limitInputPixels: 4096 * 4096 }).rotate();
  const metadata = await source.metadata();
  const width = metadata.autoOrient.width ?? metadata.width;
  const height = metadata.autoOrient.height ?? metadata.height;

  if (!width || !height) {
    throw new AppError(
      "The image dimensions could not be read.",
      400,
      "INVALID_IMAGE",
    );
  }

  if (Math.min(width, height) < minDimension) {
    throw new AppError(
      `The image must be at least ${minDimension} pixels on its shortest side.`,
      422,
      "IMAGE_TOO_SMALL",
    );
  }

  return source
    .flatten({ background: "#ffffff" })
    .resize({
      width: NORMALIZED_MAX_DIMENSION,
      height: NORMALIZED_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}
