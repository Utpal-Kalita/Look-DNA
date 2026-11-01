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

/** Override with GROQ_MODEL. A Groq vision model with JSON mode (console.groq.com/docs/vision). */
const DEFAULT_GROQ_MODEL = "qwen/qwen3.8-27b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_ATTEMPT_TIMEOUT_MS = 20_000;
/** Stop starting new attempts after this, so the route ends inside the 60 s limit. */
const EXTRACTION_DEADLINE_MS = 40_000;

interface Attempt {
  provider: "groq" | "gemini" | "claude";
  run: () => Promise<LookItem[]>;
}

export function mockLlmEnabled(): boolean {
  return process.env.MOCK_LLM === "1";
}

/**
 * Every configured provider, in order: Groq, then Gemini, then Claude. A quota
 * or outage at one provider falls through to the next.
 */
function plan(image: ImageUpload): Attempt[] {
  const attempts: Attempt[] = [];
  if (process.env.GROQ_API_KEY) {
    const model = process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL;
    attempts.push({ provider: "groq", run: () => requestGroq(image, model) });
    attempts.push({ provider: "groq", run: () => requestGroq(image, model) });
  }
  if (process.env.GEMINI_API_KEY) {
    // Main model, then the lighter fallback (Google returns 503 "high demand" at peaks).
    attempts.push({ provider: "gemini", run: () => requestGemini(image, process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL, true) });
    attempts.push({ provider: "gemini", run: () => requestGemini(image, process.env.GEMINI_FALLBACK_MODEL || DEFAULT_GEMINI_FALLBACK_MODEL, false) });
  }
  if (process.env.ANTHROPIC_API_KEY) {
    attempts.push({ provider: "claude", run: () => requestClaude(image) });
  }
  return attempts;
}

export async function extractLookItems(image: ImageUpload): Promise<LookItem[]> {
  const attempts = plan(image);
  if (attempts.length === 0) {
    throw new AppError(
      "Look extraction is not configured on the server.",
      503,
      "LLM_NOT_CONFIGURED",
    );
  }

  const started = Date.now();
  let lastError: unknown;
  for (const [index, attempt] of attempts.entries()) {
    if (index > 0 && Date.now() - started > EXTRACTION_DEADLINE_MS) {
      break;
    }
    try {
      return await attempt.run();
    } catch (error) {
      lastError = error;
      console.warn(`extraction attempt ${index + 1} (${attempt.provider}) failed:`, error instanceof Error ? error.message : error);
      if (error instanceof AppError && error.status < 500) {
        throw error;
      }
      const next = attempts[index + 1];
      // A non-retryable error (bad key, bad request) skips to the next provider.
      if (!isRetryable(error) && next?.provider === attempt.provider) {
        const other = attempts.findIndex((a, i) => i > index && a.provider !== attempt.provider);
        if (other === -1) break;
        attempts.splice(index + 1, other - index - 1);
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

class GroqError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Groq's OpenAI-compatible chat completions, JSON mode, image as a data URL. */
async function requestGroq(image: ImageUpload, model: string): Promise<LookItem[]> {
  const jpeg = await shrinkForModel(image.bytes);
  const started = Date.now();
  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(GROQ_ATTEMPT_TIMEOUT_MS),
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${SYSTEM_PROMPT}\n\n${JSON_INSTRUCTIONS}` },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract the Look DNA from this inspiration image. Reply with JSON only." },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpeg.toString("base64")}` } },
          ],
        },
      ],
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { choices?: { message?: { content?: string } }[]; error?: { message?: string } }
    | null;
  if (!response.ok) {
    throw new GroqError(payload?.error?.message ?? `Groq returned ${response.status}`, response.status);
  }
  const text = payload?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("Groq returned no content.");
  }
  console.info(`groq ${model} answered in ${Date.now() - started} ms`);
  // Throws on malformed JSON or schema mismatch, which moves on to the next attempt.
  const parsed = extractionSchema.parse(JSON.parse(stripFences(text)));
  return cleanItems(parsed.items);
}

/** JSON mode needs the shape spelled out in the prompt. */
const JSON_INSTRUCTIONS = `Reply with a JSON object of exactly this shape and nothing else:
{"items": [{"category": "top" | "bottom" | "dress" | "outerwear" | "lipstick" | "eyeshadow" | "blush", "color": "#RRGGBB", "style": ["tag", ...], "finish": "matte" | "satin" | "gloss" | "shimmer" | "none"}]}`;

function stripFences(text: string): string {
  return text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

/** Client errors (bad key, bad request) will not succeed on retry; 429 and 5xx might. */
function isRetryable(error: unknown): boolean {
  const status =
    error instanceof Anthropic.APIError
      ? error.status
      : error instanceof GeminiApiError || error instanceof GroqError
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
