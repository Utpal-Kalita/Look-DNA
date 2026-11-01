import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  analyzeSkinTone,
  runClothesTryOn,
  runLipMakeupTryOn,
  uploadImageToYouCam,
} from "@/lib/youcam";

describe("YouCam client", () => {
  beforeEach(() => {
    process.env.YOUCAM_API_KEY = "test-key";
    process.env.YOUCAM_POLL_INTERVAL_MS = "1";
    process.env.YOUCAM_TASK_TIMEOUT_MS = "100";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.YOUCAM_API_KEY;
    delete process.env.YOUCAM_POLL_INTERVAL_MS;
    delete process.env.YOUCAM_TASK_TIMEOUT_MS;
  });

  it("initializes and completes the documented file upload", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          status: 200,
          data: {
            files: [
              {
                content_type: "image/jpeg",
                file_name: "selfie.jpg",
                file_id: "file-123",
                requests: [
                  {
                    method: "PUT",
                    url: "https://upload.example/file",
                    headers: { "Content-Type": "image/jpeg" },
                  },
                ],
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const fileId = await uploadImageToYouCam({
      bytes: Buffer.from("image"),
      contentType: "image/jpeg",
      fileName: "selfie.jpg",
      hash: "hash",
    });

    expect(fileId).toBe("file-123");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://yce-api-01.makeupar.com/s2s/v2.0/file",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://upload.example/file",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("creates and polls a skin-tone task", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(taskCreated())
      .mockResolvedValueOnce(
        jsonResponse({ status: 200, data: { task_status: "running" } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          status: 200,
          data: {
            task_status: "success",
            results: { color: { skin_color: "#C68E6B" } },
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeSkinTone({ fileId: "selfie-file" });

    expect(result.color?.skin_color).toBe("#C68E6B");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://yce-api-01.makeupar.com/s2s/v2.0/task/skin-tone-analysis",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          src_file_id: "selfie-file",
          face_angle_strictness_level: "high",
        }),
      }),
    );
  });

  it("uses the documented clothes V4 fields", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(taskCreated())
      .mockResolvedValueOnce(successfulImageTask("https://result/clothes.jpg"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      runClothesTryOn({
        source: { fileId: "selfie-file" },
        garment: { url: "https://catalog/garment.jpg" },
        garmentCategory: "upper_body",
      }),
    ).resolves.toBe("https://result/clothes.jpg");

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(request.body as string)).toEqual({
      src_file_id: "selfie-file",
      ref_file_url: "https://catalog/garment.jpg",
      garment_category: "upper_body",
      change_shoes: true,
      filter_multi_person: "normal",
    });
  });

  it("uses the documented lipstick effect fields", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(taskCreated())
      .mockResolvedValueOnce(successfulImageTask("https://result/makeup.jpg"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      runLipMakeupTryOn({
        source: { url: "https://result/clothes.jpg" },
        color: "#A8473F",
      }),
    ).resolves.toBe("https://result/makeup.jpg");

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(request.body as string)).toMatchObject({
      src_file_url: "https://result/clothes.jpg",
      version: "1.0",
      effects: [
        {
          category: "lip_color",
          shape: { name: "original" },
          palettes: [
            {
              color: "#A8473F",
              texture: "matte",
              colorIntensity: 80,
            },
          ],
          style: { type: "full" },
        },
      ],
    });
  });
});

function taskCreated(): Response {
  return jsonResponse({ status: 200, data: { task_id: "task-123" } });
}

function successfulImageTask(url: string): Response {
  return jsonResponse({
    status: 200,
    data: { task_status: "success", results: { url } },
  });
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("isSelfieProblem", () => {
  it("treats pose, lighting and face errors as a retake", async () => {
    const { isSelfieProblem } = await import("@/lib/youcam");
    expect(isSelfieProblem("The face is tilted too far downward for accurate analysis. Slightly tilt head upwards and try again.")).toBe(true);
    expect(isSelfieProblem("No face was detected in the source image.")).toBe(true);
    expect(isSelfieProblem("Lighting is too dark")).toBe(true);
    expect(isSelfieProblem("Internal server error")).toBe(false);
    expect(isSelfieProblem("Insufficient units")).toBe(false);
  });
});
