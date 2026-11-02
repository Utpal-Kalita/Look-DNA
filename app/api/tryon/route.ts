import { NextResponse } from "next/server";
import { z } from "zod";

import { createCacheKey, getOrComputeCached } from "@/lib/cache";
import { findCatalogItem } from "@/lib/catalog";
import { isTryOnImage } from "@/lib/live-search";
import { AppError } from "@/lib/errors";
import { routeErrorResponse } from "@/lib/http";
import {
  assertRequestSize,
  hashBytes,
  readImageFromFormData,
  type ImageUpload,
} from "@/lib/image";
import { getMockTryOn, mockYouCamEnabled } from "@/lib/mocks";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { ProductMatch, TryOnResult } from "@/lib/types";
import { normalizeHex } from "@/lib/undertone";
import {
  runClothesTryOn,
  runLipMakeupTryOn,
  uploadImageToYouCam,
  type GarmentCategory,
  type YouCamFileReference,
} from "@/lib/youcam";

export const runtime = "nodejs";
export const maxDuration = 300;

const TRY_ON_CACHE_TTL_SECONDS = 90 * 60;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const matchSchema = z.object({
  image: z.string().url().max(600).optional(),
  category: z.string().min(1),
  productId: z.string().min(1),
  adaptedColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  reason: z.string(),
  score: z.number().min(0).max(1),
  price: z.number().nonnegative(),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit(request, "tryon", 3, 10 * 60);
    const formData = await parseFormData(request);
    const image = await readImageFromFormData(formData, "selfie", {
      minDimension: 320,
    });
    const matches = parseMatches(formData.get("matches"));
    const cacheVariant = matches.map(({ productId, adaptedColor }) => ({
      productId,
      adaptedColor: normalizeHex(adaptedColor),
    }));
    const cacheKey = createCacheKey("tryon", image.hash, cacheVariant);
    const result = await getOrComputeCached<TryOnResult>(
      cacheKey,
      TRY_ON_CACHE_TTL_SECONDS,
      () =>
        mockYouCamEnabled()
          ? Promise.resolve(getMockTryOn())
          : createTryOn(image, matches, new URL(request.url).origin),
    );

    return NextResponse.json({ ...result.value, cached: result.cached });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

async function createTryOn(
  selfie: ImageUpload,
  matches: ProductMatch[],
  origin: string,
): Promise<TryOnResult> {
  const resolved = await Promise.all(
    matches.map(async (match) => ({
      match,
      product: match.productId.startsWith("live-")
        ? liveProduct(match)
        : await findCatalogItem(match.productId),
    })),
  );
  // The whole outfit, layered in order; a dress already covers top and bottom.
  const garments = outfitOrder(
    resolved.filter(({ product }) => garmentCategory(product.category)),
  );
  const lipstick = resolved.find(({ product }) => isLipstick(product.category));

  if (garments.length === 0 && !lipstick) {
    throw new AppError(
      "Try-on needs at least one clothing or lipstick match.",
      422,
      "NO_TRYON_MATCHES",
    );
  }

  const selfieFileId = await uploadImageToYouCam(selfie);
  let clothesImage: string | undefined;
  let clothesError: unknown;
  const applied: string[] = [];
  const skipped: string[] = [];

  // Each garment goes on the previous result; one failing keeps the rest.
  for (const { product } of garments) {
    try {
      const garment = await garmentReference(product.image, origin);
      clothesImage = await runClothesTryOn({
        source: clothesImage ? { url: clothesImage } : { fileId: selfieFileId },
        garment,
        garmentCategory: garmentCategory(product.category)!,
      });
      applied.push(product.category);
    } catch (error) {
      console.warn(`tryon: ${product.category} failed`, error instanceof Error ? error.message : error);
      clothesError = error;
      skipped.push(product.category);
    }
  }
  const outfit = { applied, skipped };

  if (!lipstick) {
    if (!clothesImage) {
      throw (
        clothesError ??
        new AppError(
          "No supported clothing or lipstick products were found.",
          422,
          "NO_TRYON_MATCHES",
        )
      );
    }

    return {
      image: clothesImage!,
      clothesImage,
      mode: "clothes-only",
      ...outfit,
    };
  }

  const color = normalizeHex(lipstick.match.adaptedColor);
  if (!clothesImage) {
    try {
      const makeupImage = await runLipMakeupTryOn({
        source: { fileId: selfieFileId },
        color,
      });

      return {
        image: makeupImage,
        makeupImage,
        mode: "makeup-only",
        ...outfit,
      };
    } catch (makeupError) {
      throw makeupError ?? clothesError;
    }
  }

  try {
    const combinedImage = await runLipMakeupTryOn({
      source: { url: clothesImage },
      color,
    });

    return {
      image: combinedImage,
      clothesImage,
      makeupImage: combinedImage,
      mode: "combined",
      ...outfit,
    };
  } catch {
    try {
      const makeupImage = await runLipMakeupTryOn({
        source: { fileId: selfieFileId },
        color,
      });

      return {
        image: clothesImage,
        clothesImage,
        makeupImage,
        mode: "side-by-side",
        ...outfit,
      };
    } catch {
      return {
        image: clothesImage,
        clothesImage,
        mode: "clothes-only",
        ...outfit,
      };
    }
  }
}

async function garmentReference(
  image: string,
  origin: string,
): Promise<YouCamFileReference> {
  if (/^https?:\/\//i.test(image)) {
    return { url: image };
  }

  const url = new URL(image.startsWith("/") ? image : `/${image}`, origin);
  let response: Response;

  try {
    response = await fetch(url, {
      cache: "force-cache",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AppError(
      "The matched garment image could not be loaded.",
      502,
      "GARMENT_IMAGE_UNAVAILABLE",
    );
  }

  if (!response.ok) {
    throw new AppError(
      "The matched garment image could not be loaded.",
      502,
      "GARMENT_IMAGE_UNAVAILABLE",
    );
  }

  const contentType = response.headers.get("content-type")?.split(";")[0];
  if (contentType !== "image/jpeg" && contentType !== "image/png") {
    throw new AppError(
      "The matched garment must be a JPEG or PNG image.",
      422,
      "GARMENT_IMAGE_INVALID",
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new AppError(
      "The matched garment image must be no more than 10 MB.",
      422,
      "GARMENT_IMAGE_INVALID",
    );
  }

  const upload: ImageUpload = {
    bytes,
    contentType,
    fileName: `garment.${contentType === "image/png" ? "png" : "jpg"}`,
    hash: hashBytes(bytes),
  };

  return { fileId: await uploadImageToYouCam(upload) };
}

async function parseFormData(request: Request): Promise<FormData> {
  assertRequestSize(request);

  try {
    return await request.formData();
  } catch {
    throw new AppError(
      "Send the selfie and matches as multipart/form-data.",
      400,
      "INVALID_FORM_DATA",
    );
  }
}

function parseMatches(value: FormDataEntryValue | null): ProductMatch[] {
  if (typeof value !== "string") {
    throw new AppError(
      "The 'matches' JSON field is required.",
      400,
      "MATCHES_REQUIRED",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new AppError(
      "The 'matches' field must contain valid JSON.",
      400,
      "MATCHES_INVALID",
    );
  }

  const result = z.array(matchSchema).min(1).safeParse(parsed);
  if (!result.success) {
    throw new AppError(
      "The matches do not follow the shared data contract.",
      400,
      "MATCHES_INVALID",
    );
  }

  return result.data;
}

function garmentCategory(category: string): GarmentCategory | null {
  const normalized = category.toLowerCase();

  if (["top", "shirt", "blouse", "sweater"].includes(normalized)) {
    return "upper_body";
  }
  if (["bottom", "pants", "trousers", "skirt"].includes(normalized)) {
    return "lower_body";
  }
  // A kurta (or kurta set) is tried on as the upper-body garment.
  if (["kurta", "kurti"].includes(normalized)) {
    return "upper_body";
  }
  if (normalized === "dress") {
    return "full_body";
  }
  if (["outerwear", "jacket", "coat"].includes(normalized)) {
    return "outer";
  }
  if (["shoe", "shoes"].includes(normalized)) {
    return "shoes";
  }

  return null;
}

function isLipstick(category: string): boolean {
  return ["lip", "lips", "lipstick", "lip_color"].includes(
    category.toLowerCase(),
  );
}

/** A live-search product, from the match itself; only Shopify CDN images. */
function liveProduct(match: ProductMatch) {
  if (!match.image || !isTryOnImage(match.image.split("?")[0])) {
    throw new AppError("This product's image cannot be used for try-on.", 422, "GARMENT_IMAGE_INVALID");
  }
  return { id: match.productId, category: match.category, image: match.image };
}

/**
 * The order garments go on: a one-piece (dress) first and instead of a
 * separate top and bottom, otherwise top or kurta, then bottom; outerwear last.
 */
function outfitOrder<T extends { product: { category: string } }>(garments: T[]): T[] {
  const byCategory = (name: string) => garments.find(({ product }) => product.category.toLowerCase() === name);
  const dress = byCategory("dress");
  const upper = byCategory("kurta") ?? byCategory("top");
  const bottom = byCategory("bottom");
  const outer = byCategory("outerwear");
  const order = dress ? [dress, outer] : (upper?.product.category.toLowerCase() === "kurta") ? [upper, bottom] : [upper, bottom, outer];
  return order.filter((g): g is T => Boolean(g));
}
