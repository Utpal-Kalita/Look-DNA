import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ApiError as GeminiApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import sharp from "sharp";
import * as z from "zod/v4";

import { AppError } from "@/lib/errors";
import type { ImageUpload } from "@/lib/image";
import { isMakeup, normalizeCategory } from "@/lib/matching";
import type { LookItem } from "@/lib/types";
import { normalizeHex } from "@/lib/undertone";

const CLAUDE_MODEL = "claude-opus-5-5";
/** Override with GEMINI_MODEL, e.g. a pinned version instead of the alias. */
const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";
/** Used when the main model is overloaded (503) or slow. Override with GEMINI_FALLBACK_MODEL. */
const DEFAULT_GEMINI_FALLBACK_MODEL = "gemini-flash-lite-latest";

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

let claudeClient: Anthropic | undefined;
let geminiClient: GoogleGenAI | undefined;

type Provider = "gemini" | "claude";

export function mockLlmEnabled(): boolean {
  return process.env.MOCK_LLM === "1";
}

/** Gemini when GEMINI_API_KEY is set, otherwise Claude when ANTHROPIC_API_KEY is set. */
function selectProvider(): Provider | null {
  if (process.env.GEMINI_API_KEY) {
    return "gemini";
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return "claude";
  }
  return null;
}

export async function extractLookItems(image: ImageUpload): Promise<LookItem[]> {
  const provider = selectProvider();
  if (!provider) {
    throw new AppError(
      "Look extraction is not configured on the server.",
      503,
      "LLM_NOT_CONFIGURED",
    );
  }

  // Gemini: main model, then the lighter fallback (Google returns 503 "high
  // demand" at peaks), then the main model once more without thinking hints.
  const geminiPlan = [
    { model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL, lowThinking: true },
    { model: process.env.GEMINI_FALLBACK_MODEL || DEFAULT_GEMINI_FALLBACK_MODEL, lowThinking: false },
    { model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL, lowThinking: false },
  ];
  // Claude keeps the PRD's single retry.
  const attempts = provider === "gemini" ? geminiPlan.length : 2;

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return provider === "gemini"
        ? await requestGemini(image, geminiPlan[attempt].model, geminiPlan[attempt].lowThinking)
        : await requestClaude(image);
    } catch (error) {
      lastError = error;
      console.warn(`extraction attempt ${attempt + 1} (${provider}) failed:`, error instanceof Error ? error.message : error);
      if (error instanceof AppError && error.status < 500) {
        throw error;
      }
      if (!isRetryable(error)) {
        break;
      }
    }
  }

  console.error(`Look extraction failed (${provider})`, lastError);
  throw new AppError(
    "We could not read the look from this image. Please try again or use another image.",
    502,
    "EXTRACTION_FAILED",
  );
}

/** Client errors (bad key, bad request) will not succeed on retry; 429 and 5xx might. */
function isRetryable(error: unknown): boolean {
  const status =
    error instanceof Anthropic.APIError
      ? error.status
      : error instanceof GeminiApiError
        ? error.status
        : undefined;
  // 400 is retried once because the retry drops thinkingConfig, which a model may reject.
  return status === undefined || status === 400 || status === 429 || status >= 500;
}

/** Each Gemini attempt must finish well inside the 60 s function limit. */
const GEMINI_ATTEMPT_TIMEOUT_MS = 17_000;

async function requestGemini(image: ImageUpload, model: string, lowThinking: boolean): Promise<LookItem[]> {
  geminiClient ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(extractionSchema) as Record<string, unknown>;

  const started = Date.now();
  const response = await geminiClient.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: (await shrinkForModel(image.bytes)).toString("base64") } },
          { text: "Extract the Look DNA from this inspiration image." },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseJsonSchema: jsonSchema,
      abortSignal: AbortSignal.timeout(GEMINI_ATTEMPT_TIMEOUT_MS),
      // Extraction needs little reasoning; the retry drops this in case a model rejects it.
      ...(lowThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
    },
  });

  const finishReason = response.candidates?.[0]?.finishReason;
  console.info(`gemini ${model} answered in ${Date.now() - started} ms (lowThinking=${lowThinking}, finish=${finishReason})`);
  if (response.promptFeedback?.blockReason || finishReason === "SAFETY" || finishReason === "PROHIBITED_CONTENT") {
    throw new AppError(
      "This image could not be analysed. Try a different inspiration image.",
      422,
      "EXTRACTION_REFUSED",
    );
  }

  const text = response.text;
  if (!text) {
    throw new Error(`Gemini returned no text (finishReason: ${finishReason}).`);
  }
  // Throws on malformed JSON or schema mismatch, which triggers the retry.
  const parsed = extractionSchema.parse(JSON.parse(text));
  return cleanItems(parsed.items);
}

/** 1024 px is plenty to read garments and shades, and uploads faster. */
async function shrinkForModel(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes)
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function requestClaude(image: ImageUpload): Promise<LookItem[]> {
  claudeClient ??= new Anthropic();
  const response = await claudeClient.beta.messages.parse({
    model: CLAUDE_MODEL,
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
