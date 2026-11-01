import { NextResponse } from "next/server";

import { createCacheKey, getOrComputeCached } from "@/lib/cache";
import { routeErrorResponse } from "@/lib/http";
import { readImageUpload } from "@/lib/image";
import { analyzeImageQuality } from "@/lib/quality";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

const QUALITY_CACHE_TTL_SECONDS = 24 * 60 * 60;

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit(request, "quality", 12, 60);
    const image = await readImageUpload(request, "selfie", {
      minDimension: 320,
    });
    const cacheKey = createCacheKey("quality", image.hash);
    const result = await getOrComputeCached(
      cacheKey,
      QUALITY_CACHE_TTL_SECONDS,
      () => analyzeImageQuality(image.bytes),
    );

    return NextResponse.json({ ...result.value, cached: result.cached });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
