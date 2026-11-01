import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";

import { AppError } from "@/lib/errors";
import type { ImageUpload } from "@/lib/image";
import { isMakeup, normalizeCategory } from "@/lib/matching";
import type { LookItem } from "@/lib/types";
import { normalizeHex } from "@/lib/undertone";

const MODEL = "claude-opus-5-5";

const extractionSchema = z.object({
  items: z.array(
    z.object({
      category: z.enum(["top", "bottom", "dress", "outerwear", "lipstick", "eyeshadow", "blush"]),
      color: z.string().describe("Dominant colour as a 6-digit hex code, e.g. #C8A2C8"),
      style: z.array(z.string()).describe("2-4 short lowercase style tags"),
      finish: z
        .enum(["matte", "satin", "gloss", "shimmer", "none"])
        .describe("Makeup finish; 'none' for clothing"),
    }),
  ),
});

const SYSTEM_PROMPT = `You extract the "Look DNA" from a fashion or beauty inspiration image for a shopping app.

Return each visible element of the look that someone could buy:
- Clothing: top, bottom (trousers, jeans, skirts, shorts), dress, outerwear (jackets, coats, blazers). Use "dress" for a one-piece instead of top + bottom.
- Makeup: lipstick, eyeshadow, blush. Only include makeup that is clearly visible.

For each element give its dominant colour as a hex code sampled from the image (not a generic colour name), and style tags.
For clothing, use tags such as: oversized, fitted, cropped, relaxed, wide-leg, straight, high-waist, mini, midi, flowy, slip, wrap, bodycon, tailored, pleated, tiered, ruffle, puff-sleeve, knit, denim, satin, linen, leather, fleece, cotton, floral, striped, polka-dot, casual, formal, party, minimal, vintage, streetwear, feminine, classic, summer.
For makeup, the style list may be empty; set finish to matte, satin, gloss or shimmer. For clothing set finish to "none".

At most one item per category. If the image shows no fashion or makeup, return an empty items list. Describe only the look, never the person's body or skin.`;

let client: Anthropic | undefined;

export function mockLlmEnabled(): boolean {
  return process.env.MOCK_LLM === "1";
}

export async function extractLookItems(image: ImageUpload): Promise<LookItem[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AppError(
      "Look extraction is not configured on the server.",
      503,
      "LLM_NOT_CONFIGURED",
    );
  }
  client ??= new Anthropic();

  // One retry, per the PRD, for transient or unparseable responses.
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await requestExtraction(client, image);
    } catch (error) {
      lastError = error;
      if (error instanceof AppError && error.status < 500) {
        throw error;
      }
      if (error instanceof Anthropic.APIError && error.status !== undefined && error.status < 500 && error.status !== 429) {
        break;
      }
    }
  }

  console.error("Look extraction failed", lastError);
  throw new AppError(
    "We could not read the look from this image. Please try again or use another image.",
    502,
    "EXTRACTION_FAILED",
  );
}

async function requestExtraction(client: Anthropic, image: ImageUpload): Promise<LookItem[]> {
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "low",
      format: betaZodOutputFormat(extractionSchema),
    },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: image.contentType,
              data: image.bytes.toString("base64"),
            },
          },
          { type: "text", text: "Extract the Look DNA from this inspiration image." },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new AppError(
      "This image could not be analysed. Try a different inspiration image.",
      422,
      "EXTRACTION_REFUSED",
    );
  }
  if (!response.parsed_output) {
    throw new Error(`Extraction returned no parsed output (stop_reason: ${response.stop_reason}).`);
  }

  return cleanItems(response.parsed_output.items);
}

/** Validate hex codes and normalise categories; drop anything unusable. */
export function cleanItems(items: z.infer<typeof extractionSchema>["items"]): LookItem[] {
  const seen = new Set<string>();
  const result: LookItem[] = [];

  for (const raw of items) {
    const category = normalizeCategory(raw.category);
    if (!category || seen.has(category)) {
      continue;
    }
    let color: string;
    try {
      color = normalizeHex(raw.color);
    } catch {
      continue;
    }
    seen.add(category);
    const item: LookItem = {
      category,
      color,
      style: raw.style.map((tag) => tag.trim().toLowerCase()).filter(Boolean).slice(0, 4),
    };
    if (isMakeup(category) && raw.finish !== "none") {
      item.finish = raw.finish;
    }
    result.push(item);
  }

  return result;
}
