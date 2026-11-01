import { NextResponse } from "next/server";

import { createCacheKey, getOrComputeCached } from "@/lib/cache";
import { AppError } from "@/lib/errors";
import { routeErrorResponse } from "@/lib/http";
import { faceCrop, tiltRetryRotation } from "@/lib/face-crop";
import { readImageUpload } from "@/lib/image";
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
          : await analyzeLevelled(image);

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
 * Skin tone on the levelled face crop. If YouCam still says the head is
 * tilted, rotate the way it says and try once more.
 */
async function analyzeLevelled(image: Parameters<typeof faceCrop>[0]) {
  try {
    return await analyzeSkinTone({ fileId: await uploadImageToYouCam(await faceCrop(image)) });
  } catch (error) {
    const extra = error instanceof AppError && error.code === "SELFIE_RETAKE" ? tiltRetryRotation(error.message) : null;
    if (extra === null) {
      throw error;
    }
    console.info(`skin-tone: YouCam said "${error instanceof Error ? error.message : ""}", retrying rotated ${extra} deg`);
    return analyzeSkinTone({ fileId: await uploadImageToYouCam(await faceCrop(image, extra)) });
  }
}
