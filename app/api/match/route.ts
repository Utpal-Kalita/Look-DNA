import { NextResponse } from "next/server";
import { z } from "zod";

import { loadCatalog } from "@/lib/catalog";
import { AppError } from "@/lib/errors";
import { routeErrorResponse } from "@/lib/http";
import { matchLook } from "@/lib/matching";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const requestSchema = z.object({
  items: z
    .array(
      z.object({
        category: z.string().min(1).max(40),
        color: hex,
        style: z.array(z.string().max(40)).max(10).optional(),
        finish: z.string().max(20).optional(),
      }),
    )
    .min(1)
    .max(12),
  userTone: z
    .object({ hex, undertone: z.enum(["warm", "cool", "neutral"]) })
    .nullable(),
  budget: z.number().int().min(100).max(1_000_000),
  exclude: z.array(z.string().max(40)).max(200).optional(),
  shopFor: z.enum(["women", "men"]).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit(request, "match", 60, 60);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError("Send the match request as JSON.", 400, "INVALID_JSON");
    }

    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        "The match request does not follow the shared data contract.",
        400,
        "MATCH_REQUEST_INVALID",
      );
    }

    const catalog = await loadCatalog();
    return NextResponse.json(matchLook(parsed.data, catalog));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
