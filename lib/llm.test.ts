import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateContent = vi.fn();

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
  ApiError: class extends Error {
    status = 500;
  },
  ThinkingLevel: { LOW: "LOW" },
}));

import sharp from "sharp";

import { extractLookItems } from "@/lib/llm";
import type { ImageUpload } from "@/lib/image";

const image: ImageUpload = {
  bytes: Buffer.alloc(0),
  contentType: "image/jpeg",
  fileName: "look.jpg",
  hash: "abc",
};

function reply(items: unknown) {
  return { text: JSON.stringify({ items }), candidates: [{ finishReason: "STOP" }] };
}

describe("extractLookItems with Gemini", () => {
  beforeEach(async () => {
    image.bytes = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#c8a2c8" } }).jpeg().toBuffer();
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    generateContent.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("sends the image with a JSON schema and cleans the result", async () => {
    generateContent.mockResolvedValue(
      reply([
        { category: "top", color: "#c8a2c8", style: ["Oversized", "knit"], finish: "none" },
        { category: "lipstick", color: "#B5485D", style: [], finish: "matte" },
        { category: "top", color: "#000000", style: [], finish: "none" },
        { category: "dress", color: "not-a-colour", style: [], finish: "none" },
      ]),
    );

    const items = await extractLookItems(image);

    expect(items).toEqual([
      { category: "top", color: "#C8A2C8", style: ["oversized", "knit"] },
      { category: "lipstick", color: "#B5485D", style: [], finish: "matte" },
    ]);
    const request = generateContent.mock.calls[0][0];
    expect(request.model).toBe("gemini-flash-latest");
    expect(request.contents[0].parts[0].inlineData.mimeType).toBe("image/jpeg");
    expect(request.config.thinkingConfig).toEqual({ thinkingLevel: "LOW" });
    expect(request.config.abortSignal).toBeInstanceOf(AbortSignal);
    expect(request.config.responseMimeType).toBe("application/json");
    expect(request.config.responseJsonSchema.properties.items.type).toBe("array");
    expect(request.config.responseJsonSchema.$schema).toBeUndefined();
  });

  it("retries once on malformed JSON", async () => {
    generateContent
      .mockResolvedValueOnce({ text: "{not json", candidates: [{ finishReason: "STOP" }] })
      .mockResolvedValueOnce(reply([{ category: "dress", color: "#B22234", style: ["slip"], finish: "none" }]));

    const items = await extractLookItems(image);
    expect(items).toHaveLength(1);
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls[1][0].config.thinkingConfig).toBeUndefined();
    expect(generateContent.mock.calls[1][0].model).toBe("gemini-flash-lite-latest");
  });

  it("returns a friendly 422 when the image is blocked", async () => {
    generateContent.mockResolvedValue({ text: undefined, promptFeedback: { blockReason: "SAFETY" } });
    await expect(extractLookItems(image)).rejects.toMatchObject({ status: 422, code: "EXTRACTION_REFUSED" });
  });

  it("falls back to the lite model when the main one is overloaded", async () => {
    const overloaded = Object.assign(new Error("high demand"), { status: 503 });
    generateContent
      .mockRejectedValueOnce(overloaded)
      .mockResolvedValueOnce(reply([{ category: "top", color: "#C8A2C8", style: [], finish: "none" }]));
    const items = await extractLookItems(image);
    expect(items).toHaveLength(1);
    expect(generateContent.mock.calls.map((c) => c[0].model)).toEqual(["gemini-flash-latest", "gemini-flash-lite-latest"]);
  });

  it("uses GEMINI_MODEL when set", async () => {
    vi.stubEnv("GEMINI_MODEL", "gemini-custom");
    generateContent.mockResolvedValue(reply([]));
    await extractLookItems(image);
    expect(generateContent.mock.calls[0][0].model).toBe("gemini-custom");
  });

  it("reports not configured when no key is set", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    await expect(extractLookItems(image)).rejects.toMatchObject({ status: 503, code: "LLM_NOT_CONFIGURED" });
  });
});

describe("extractLookItems with Groq", () => {
  const groqReply = (items: unknown) =>
    new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items }) } }] }), { status: 200 });

  beforeEach(async () => {
    image.bytes = await sharp({ create: { width: 800, height: 800, channels: 3, background: "#c8a2c8" } }).jpeg().toBuffer();
    vi.stubEnv("GROQ_API_KEY", "groq-test");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    generateContent.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("sends the image in JSON mode to the default vision model", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      groqReply([{ category: "dress", color: "#b22234", style: ["Midi"], finish: "none" }]),
    );
    const items = await extractLookItems(image);
    expect(items).toEqual([{ category: "dress", color: "#B22234", style: ["midi"] }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.model).toBe("qwen/qwen3.8-27b");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[1].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
    expect((init as RequestInit).headers).toMatchObject({ authorization: "Bearer groq-test" });
  });

  it("falls through to Gemini when Groq is rate limited", async () => {
    vi.stubEnv("GEMINI_API_KEY", "gemini-test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 }),
    );
    generateContent.mockResolvedValue(reply([{ category: "top", color: "#C8A2C8", style: [], finish: "none" }]));
    const items = await extractLookItems(image);
    expect(items).toHaveLength(1);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});

describe("retryAfterMs", () => {
  it("reads Groq's wait hint", async () => {
    const { retryAfterMs } = await import("@/lib/llm");
    expect(retryAfterMs("Please try again in 925.714285ms. Need more tokens?", null)).toBe(926);
    expect(retryAfterMs("Please try again in 1.345714285s. Need more", null)).toBe(1346);
    expect(retryAfterMs("rate limited", "2")).toBe(2000);
    expect(retryAfterMs("rate limited", null)).toBeNull();
  });
});
