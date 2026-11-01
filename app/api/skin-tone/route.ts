import { NextResponse } from "next/server";
import sharp from "sharp";

import { createCacheKey, getOrComputeCached } from "@/lib/cache";
import { AppError } from "@/lib/errors";
import { routeErrorResponse } from "@/lib/http";
import { hashBytes, readImageUpload, type ImageUpload } from "@/lib/image";
import { locateFaceCrop } from "@/lib/quality";
import { getMockSkinTone, mockYouCamEnabled } from "@/lib/mocks";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { UserTone } from "@/lib/types";
import { deriveUndertone, normalizeHex } from "@/lib/undertone";
import { analyzeSkinTone, uploadImageToYouCam } from "@/lib/youcam";

export const runtime = "nodejs";
export const maxDuration = 60;

const SKIN_TONE_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit(request, "skin-tone", 5, 10 * 60);
    const image = await readImageUpload(request, "selfie", {
      minDimension: 320,
    });
    const cacheKey = createCacheKey("skin-tone", image.hash);
    const result = await getOrComputeCached<UserTone>(
      cacheKey,
      SKIN_TONE_CACHE_TTL_SECONDS,
      async () => {
        const analysis = mockYouCamEnabled()
          ? getMockSkinTone()
          : await analyzeSkinTone({
              fileId: await uploadImageToYouCam(await faceCrop(image)),
            });

        if (analysis.face_quality?.has_face === false) {
          throw new AppError(
            "YouCam could not find a face in this selfie.",
            422,
            "FACE_NOT_FOUND",
          );
        }

        let hex: string;
        try {
          hex = normalizeHex(analysis.color?.skin_color ?? "");
        } catch {
          throw new AppError(
            "YouCam returned an invalid skin color.",
            502,
            "SKIN_COLOR_INVALID",
          );
        }

        return {
          hex,
          // YouCam returns skin_color, but not undertone; derive it deterministically.
          undertone: deriveUndertone(hex),
        };
      },
    );

    return NextResponse.json({ userTone: result.value, cached: result.cached });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/**
 * The photo runs head to hips for try-on, so skin tone analysis gets a crop
 * of just the face, enlarged to give YouCam enough detail. Falls back to the
 * whole photo if no face is found locally.
 */
async function faceCrop(image: ImageUpload): Promise<ImageUpload> {
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
  console.info(`skin-tone: sending a ${box.width}px face crop`);

  const bytes = await sharp(image.bytes)
    .extract(box)
    .resize({ width: 720, height: 720, fit: "inside" })
    .jpeg({ quality: 92 })
    .toBuffer();
  return { bytes, contentType: "image/jpeg", fileName: "face.jpg", hash: hashBytes(bytes) };
}
