import { NextResponse } from "next/server";

import { createCacheKey, getOrComputeCached } from "@/lib/cache";
import { routeErrorResponse } from "@/lib/http";
import { readImageUpload } from "@/lib/image";
import { extractLookItems, mockLlmEnabled } from "@/lib/llm";
import { getMockExtract } from "@/lib/mocks";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { ExtractResponse, LookItem } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const EXTRACT_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit(request, "extract", 10, 10 * 60);
    const image = await readImageUpload(request, "inspiration", {
      minDimension: 200,
    });
    const mock = mockLlmEnabled();
    const cacheKey = createCacheKey(mock ? "extract-mock" : "extract", image.hash);
    const result = await getOrComputeCached<LookItem[]>(
      cacheKey,
      EXTRACT_CACHE_TTL_SECONDS,
      async () => (mock ? getMockExtract() : extractLookItems(image)),
    );

    const body: ExtractResponse & { cached: boolean } = {
      items: result.value,
      cached: result.cached,
    };
    return NextResponse.json(body);
  } catch (error) {
    return routeErrorResponse(error);
  }
}
